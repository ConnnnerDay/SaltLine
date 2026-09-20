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
"""

import os
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.api.deps import AppState
from app.api.v1.account import router as account_router
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


app = FastAPI(title="Saltline API", version="0.1.0", lifespan=lifespan)

app.middleware("http")(log_requests)

app.include_router(locations_router)
app.include_router(forecasts_router)
app.include_router(preferences_router)
app.include_router(saved_locations_router)
app.include_router(account_router)


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
