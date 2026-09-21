"""Canonical FastAPI entrypoint.

Versioned `/v1` routes land in sprint 25: `app/api/v1/locations.py`
(`GET /v1/locations/search`, `POST /v1/locations/resolve`) and
`app/api/v1/forecasts.py` (`GET /v1/forecasts/{location_id}`,
`POST /v1/forecasts/{location_id}/refresh`). The canonical roadmap's
"Required API surface" also names `GET`/`PATCH /v1/me/preferences` —
deferred at sprint 25 for needing Better Auth and a Postgres-backed
store, neither of which existed yet; both now do (sprint 28's Better
Auth, this sprint's `forecast` schema), so `app/api/v1/preferences.py`
closes out the required API surface. `app/api/v1/saved_locations.py`
(sprint 37, `/v1/me/locations`) isn't part of that required six -- it's
the last item in `docs/product-definition.md`'s "V1 capabilities"
preferences list ("... and a small ordered list of saved locations"),
built on the same Postgres/auth wiring once both existed.

`app/api/v1/account.py` (sprint 45, "Privacy and deletion") adds
`GET /v1/me/export` and `DELETE /v1/me` — the self-service data
export/deletion this row's acceptance bar names as v1-required, not
deferred (a public product with real accounts). "Legal pages," that
same row's other named piece, needs real legal review this session
can't supply.

The `lifespan` context manager owns the app-lifetime resources every
`/v1` route depends on (`app.api.deps.AppState`): one pooled
`BoundedHTTPClient` (sprint 12), the three sprint-17
`StationCatalogCache` instances, the sprint-24
`SnapshotCache[ForecastEnvelope]` (`app.domain.forecast_cache`'s
caching wiring), and now (sprint 36) an optional Postgres
`async_sessionmaker` — created on startup and closed on shutdown rather
than per-request, same pooling rationale sprint 12's docstring gives for
the HTTP client itself. The database engine is genuinely optional here:
`DATABASE_URL` unset leaves `db_sessionmaker=None`, so this app still
boots and serves locations/forecasts with no Postgres available (CI,
older local setups) — only `/v1/me/preferences` needs it, and fails
closed (500) itself rather than crashing startup for routes that don't.

`app.infra.request_logging.log_requests` (sprint 41, "Structured
observability," the dependency-free half) wraps every request with one
structured JSON trace log line, correlated with `apps/web`'s own log
line for the same call via ADR-004's `X-Internal-Request-Id` header —
see that module's docstring.

`handle_unexpected_error` (sprint 47, "Degraded-mode UX") is this
service's one catch-all for anything that isn't a deliberate
`HTTPException` — a database connection failure being the concrete
case this sprint exercised, but not the only one a genuinely unexpected
bug could hit. See its own comment below for why it's registered where
it is (between `log_requests` and routing) and what it changes for both
this service's own logs and apps/web's rendered error state.

`app/api/v1/analytics.py` (sprint 43, "Privacy-safe analytics") adds
`POST /v1/analytics/events` — see that module's and
`app.domain.analytics`'s own docstrings for the event vocabulary, the
privacy posture (no email/name/IP, an opaque user id only for a
registration event), and why recording is deliberately best-effort.
"""

import json
import logging
import os
import sys
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from app.api.deps import AppState
from app.api.v1.account import router as account_router
from app.api.v1.analytics import router as analytics_router
from app.api.v1.forecasts import router as forecasts_router
from app.api.v1.locations import router as locations_router
from app.api.v1.preferences import router as preferences_router
from app.api.v1.saved_locations import router as saved_locations_router
from app.infra.database import create_engine, create_sessionmaker
from app.infra.http_client import BoundedHTTPClient
from app.infra.request_logging import log_requests
from app.infra.snapshot_cache import SnapshotCache
from app.providers.stations import StationCatalogCache


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    database_url = os.environ.get("DATABASE_URL")
    engine = create_engine(database_url) if database_url else None
    async with BoundedHTTPClient() as client:
        app.state.app_state = AppState(
            http_client=client,
            coops_tide_cache=StationCatalogCache(),
            coops_watertemp_cache=StationCatalogCache(),
            ndbc_cache=StationCatalogCache(),
            forecast_cache=SnapshotCache(),
            db_sessionmaker=create_sessionmaker(engine) if engine else None,
        )
        try:
            yield
        finally:
            if engine is not None:
                await engine.dispose()


# Sprint 47 ("Degraded-mode UX"): without this, an unhandled exception
# (a database connection failure, a genuine bug -- anything not raised
# as a deliberate HTTPException) falls through to Starlette's own
# default `ServerErrorMiddleware`, which returns a bare `text/plain`
# "Internal Server Error" body with no structure. Registering a handler
# for `Exception` here installs it *as* `ServerErrorMiddleware`'s own
# handler (verified against the actually-installed Starlette version,
# not assumed from general FastAPI docs: a handler keyed on `Exception`
# or `500` is special-cased into that middleware, which wraps every
# other middleware -- including `log_requests` -- from the *outside*,
# not into `ExceptionMiddleware` nested inside them). That's why
# `app.infra.request_logging.log_requests` needed its own `try`/`except`
# around `call_next` (see that module) to still get a structured trace
# line for a request this handler catches -- without it, the request
# that failed hardest would be the one with no trace line at all. What
# this handler itself gives apps/web either way: a small, predictable,
# never-leaky JSON body to render as an honest "try again" message,
# instead of a raw, and potentially implementation-revealing, error
# string reaching a real visitor.
_error_logger = logging.getLogger("app.errors")
_error_logger.setLevel(logging.ERROR)
if not _error_logger.handlers:
    # Same reasoning as request_logging.py's own handler: uvicorn's
    # logging config never wires up an arbitrary app logger, so without
    # this, every call below is silently dropped under a real server.
    _handler = logging.StreamHandler(sys.stderr)
    _handler.setFormatter(logging.Formatter("%(message)s"))
    _error_logger.addHandler(_handler)


app = FastAPI(title="Saltline API", version="0.1.0", lifespan=lifespan)


@app.exception_handler(Exception)
async def handle_unexpected_error(request: Request, exc: Exception) -> JSONResponse:
    _error_logger.error(
        json.dumps({"method": request.method, "path": request.url.path}),
        exc_info=exc,
    )
    return JSONResponse(status_code=500, content={"detail": "internal server error"})


app.middleware("http")(log_requests)

app.include_router(locations_router)
app.include_router(forecasts_router)
app.include_router(preferences_router)
app.include_router(saved_locations_router)
app.include_router(account_router)
app.include_router(analytics_router)


@app.get("/health/live")
def health_live() -> dict[str, str]:
    """Process is up. No dependency checks — used for liveness probes."""
    return {"status": "ok"}


@app.get("/health/ready")
def health_ready() -> dict[str, str]:
    """Ready to serve traffic. Will grow real dependency checks (database,
    upstream reachability) once this app has any to check — see sprint 10.
    """
    return {"status": "ok"}
