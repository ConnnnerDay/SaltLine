"""`/v1/forecasts` router (sprint 25; cache-wired in the caching-wiring
follow-up; sprint 43 added a `forecast_generated` analytics event).

`GET /v1/forecasts/{location_id}` resolves *location_id* (via the same
`resolve_location_id` helper the locations router uses — see
`app.api.deps`) and serves a forecast through
`app.domain.forecast_cache.get_or_assemble_forecast`: a fresh cached
envelope if one exists, otherwise a live `assemble_forecast` (sprint
21), subject to sprint 24's `SnapshotCache` fresh/stale/miss/expiry
policy — see that module's docstring for the full behavior, including
why `ForecastState.STALE` is a documented-but-practically-dormant path.

`POST /v1/forecasts/{location_id}/refresh` uses
`refresh_and_assemble_forecast` instead: it bypasses the cache's
freshness check entirely and forces a live assemble, repopulating the
cache for subsequent `GET`s — the distinguishing behavior this endpoint
was always meant to have, once caching wiring landed (see this
module's git history / `docs/CANONICAL_ROADMAP.md`'s checkpoint for
sprint 25 and the scoring/confidence-wiring follow-ups that preceded
this one).

Every route on this router requires ADR-004's internal request signature
(`app.api.internal_auth.require_internal_signature`), same as the
locations router — see that module's docstring for why this is wired now
and not before.

`get_forecast` (sprint 43, "Privacy-safe analytics") records a
`forecast_generated` event -- the envelope's own `state` (fresh/stale/
partial/unavailable, `docs/product-definition.md`'s vocabulary) and the
wall-clock time this handler itself took, not `POST .../refresh`'s
explicit-refresh path, to keep the signal to the common read case. See
`app.domain.analytics`'s own docstring for why this never fails the
actual forecast request even if the write itself does.
"""

from __future__ import annotations

import time
from datetime import UTC, datetime

from fastapi import APIRouter, Depends

from app.api.deps import AppState, get_app_state, resolve_location_id
from app.api.internal_auth import require_internal_signature
from app.domain.analytics import AnalyticsEventIn, AnalyticsEventType, try_record_event
from app.domain.forecast_cache import (
    get_or_assemble_forecast,
    refresh_and_assemble_forecast,
)
from app.domain.models import ForecastEnvelope
from app.providers.locations import load_water_temp_profiles

router = APIRouter(
    prefix="/v1/forecasts",
    tags=["forecasts"],
    dependencies=[Depends(require_internal_signature)],
)


@router.get("/{location_id}")
async def get_forecast(
    location_id: str,
    state: AppState = Depends(get_app_state),  # noqa: B008
) -> ForecastEnvelope:
    started = time.perf_counter()
    location = await resolve_location_id(location_id, state)
    envelope = await get_or_assemble_forecast(
        state.forecast_cache,
        location,
        state.http_client,
        load_water_temp_profiles(),
        now=datetime.now(UTC),
    )
    latency_ms = round((time.perf_counter() - started) * 1000, 1)
    await try_record_event(
        state.db_sessionmaker,
        AnalyticsEventIn(
            event_type=AnalyticsEventType.FORECAST_GENERATED,
            location_id=location.id,
            state=envelope.state.value,
            latency_ms=latency_ms,
        ),
        now=datetime.now(UTC),
    )
    return envelope


@router.post("/{location_id}/refresh")
async def refresh_forecast(
    location_id: str,
    state: AppState = Depends(get_app_state),  # noqa: B008
) -> ForecastEnvelope:
    location = await resolve_location_id(location_id, state)
    return await refresh_and_assemble_forecast(
        state.forecast_cache,
        location,
        state.http_client,
        load_water_temp_profiles(),
        now=datetime.now(UTC),
    )
