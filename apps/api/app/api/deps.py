"""Shared, app-lifetime dependencies for the /v1 routers (sprint 25;
gained `forecast_cache` in the caching-wiring follow-up).

Everything a route handler needs that's expensive to create per-request —
the pooled `BoundedHTTPClient` (sprint 12), the three station-catalog
`StationCatalogCache` instances (sprint 17, one each for CO-OPS tide,
CO-OPS water-temperature, and NDBC), and the `SnapshotCache[ForecastEnvelope]`
(sprint 24, wired by `app.domain.forecast_cache`) — is created once in
`app.main`'s FastAPI lifespan and stored on `app.state`. `AppState` and
the `get_app_state`/`get_http_client` dependency functions here are the
typed accessors route handlers use instead of reaching into
`request.app.state` directly, and the seam tests use to inject a
mocked `BoundedHTTPClient` via `app.dependency_overrides`.

Curated locations and water-temperature profiles are deliberately not
part of `AppState`: `app.providers.locations.load_curated_locations`/
`load_water_temp_profiles` are already process-lifetime cached
(`functools.lru_cache`) since sprint 19, so there's nothing extra to
manage here.
"""

from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator
from dataclasses import dataclass

from fastapi import Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.api.internal_auth import require_internal_signature
from app.domain.models import ForecastEnvelope
from app.infra.http_client import BoundedHTTPClient
from app.infra.snapshot_cache import SnapshotCache
from app.providers.coastal_bounds import gate_coastal_point
from app.providers.locations import (
    ResolvedLocation,
    find_curated_location,
    load_curated_locations,
    parse_dynamic_id,
    resolve_dynamic_location,
    resolved_from_curated,
)
from app.providers.stations import (
    CoopsStationCatalogEntry,
    NdbcStationCatalogEntry,
    StationCatalogCache,
    fetch_coops_tide_catalog,
    fetch_coops_watertemp_catalog,
    fetch_ndbc_catalog,
)


@dataclass
class AppState:
    http_client: BoundedHTTPClient
    coops_tide_cache: StationCatalogCache[CoopsStationCatalogEntry]
    coops_watertemp_cache: StationCatalogCache[CoopsStationCatalogEntry]
    ndbc_cache: StationCatalogCache[NdbcStationCatalogEntry]
    forecast_cache: SnapshotCache[ForecastEnvelope]
    # Sprint 36: None until a route actually needs Postgres (every test
    # that only exercises locations/forecasts still constructs an
    # `AppState` with no database configured) -- `get_db_session` is what
    # turns a missing sessionmaker into a real 500 at the one place that
    # needs it, rather than every other route paying for a connection
    # they never use.
    db_sessionmaker: async_sessionmaker[AsyncSession] | None = None


def get_app_state(request: Request) -> AppState:
    return request.app.state.app_state  # type: ignore[no-any-return]


def get_http_client(request: Request) -> BoundedHTTPClient:
    return get_app_state(request).http_client


def require_authenticated_user_id(
    user_id: str | None = Depends(require_internal_signature),
) -> str:
    """Sprint 36's stricter check for routes that own real per-user data
    (`/v1/me/preferences`, `/v1/me/locations`): `require_internal_signature`
    alone only proves the caller is `apps/web`'s BFF, not that a visitor
    is signed in -- a route that reads/writes a specific user's rows
    needs a real, non-empty `user_id`, not the empty-string default every
    anonymous locations/forecasts call already sends.
    """
    if not user_id:
        raise HTTPException(status_code=401, detail="authentication required")
    return user_id


async def get_db_session(
    state: AppState = Depends(get_app_state),  # noqa: B008
) -> AsyncIterator[AsyncSession]:
    if state.db_sessionmaker is None:
        raise HTTPException(status_code=500, detail="database is not configured")
    async with state.db_sessionmaker() as session:
        yield session


async def resolve_location_id(location_id: str, state: AppState) -> ResolvedLocation:
    """Resolve any *location_id* — a curated id or a dynamic `pt_<lat>_<lng>`
    id (sprint 19's `format_dynamic_id`) — to a `ResolvedLocation`.

    Raises `HTTPException`: 404 if *location_id* is neither a known
    curated id nor a parseable dynamic id; 422 if it parses as a point
    but isn't within a coastal station's reach (sprint 18's
    `gate_coastal_point`). Shared by the locations and forecasts
    routers so both give the same answer for the same id.
    """
    curated = load_curated_locations()

    match = find_curated_location(location_id, curated)
    if match is not None:
        return resolved_from_curated(match)

    point = parse_dynamic_id(location_id)
    if point is None:
        raise HTTPException(status_code=404, detail="unknown location_id")
    lat, lng = point

    coops_tide, coops_watertemp, ndbc = await asyncio.gather(
        state.coops_tide_cache.get_or_refresh(
            lambda: fetch_coops_tide_catalog(state.http_client)
        ),
        state.coops_watertemp_cache.get_or_refresh(
            lambda: fetch_coops_watertemp_catalog(state.http_client)
        ),
        state.ndbc_cache.get_or_refresh(lambda: fetch_ndbc_catalog(state.http_client)),
    )

    gate = gate_coastal_point(lat, lng, coops_tide, ndbc)
    if not gate.is_coastal:
        raise HTTPException(
            status_code=422, detail="point is not a valid coastal location"
        )

    location, _anchor_miles = resolve_dynamic_location(
        lat, lng, curated, coops_tide, coops_watertemp, ndbc
    )
    return location
