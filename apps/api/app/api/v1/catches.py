"""`/v1/me/catches` -- the catch log (`app.domain.catches`). Same
authentication posture as saved locations: ADR-004's internal signature
plus a real, non-empty `user_id`; another user's entry is a 404, never a
confirmation that it exists.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import (
    AppState,
    get_app_state,
    get_db_session,
    require_authenticated_user_id,
    resolve_location_id,
)
from app.api.internal_auth import require_internal_signature
from app.api.v1.forecasts import load_preferences, personalized_with
from app.domain.catches import (
    SNAPSHOT_WINDOW,
    CatchConditions,
    CatchEntry,
    CatchIn,
    CatchOut,
    conditions_snapshot,
)
from app.domain.forecast_cache import get_or_assemble_forecast
from app.domain.guidance import load_catalogue
from app.domain.limits import MAX_CATCHES, ensure_under_cap
from app.providers.locations import load_water_temp_profiles

_logger = logging.getLogger(__name__)

MAX_LISTED = 500

router = APIRouter(
    prefix="/v1/me/catches",
    tags=["catches"],
    dependencies=[Depends(require_internal_signature)],
)


def _out(row: CatchEntry, location_name: str, timezone: str | None) -> CatchOut:
    return CatchOut(
        id=row.id,
        location_id=row.location_id,
        location_name=location_name,
        timezone=timezone,
        species=row.species,
        caught_at=row.caught_at,
        length_in=row.length_in,
        weight_lb=row.weight_lb,
        kept=row.kept,
        bait=row.bait,
        notes=row.notes,
        conditions=CatchConditions(**row.conditions) if row.conditions else None,
        created_at=row.created_at,
    )


@router.get("/species")
async def species_options() -> list[str]:
    """Suggested species names for the log form (the guidance catalogue);
    the form still accepts any name."""
    return sorted({species["name"] for species in load_catalogue()})


@router.get("")
async def list_catches(
    user_id: str = Depends(require_authenticated_user_id),
    state: AppState = Depends(get_app_state),  # noqa: B008
    session: AsyncSession = Depends(get_db_session),  # noqa: B008
) -> list[CatchOut]:
    rows = (
        (
            await session.execute(
                select(CatchEntry)
                .where(CatchEntry.user_id == user_id)
                .order_by(CatchEntry.caught_at.desc(), CatchEntry.id.desc())
                .limit(MAX_LISTED)
            )
        )
        .scalars()
        .all()
    )
    spots: dict[str, tuple[str, str | None]] = {}
    out: list[CatchOut] = []
    for row in rows:
        if row.location_id not in spots:
            try:
                resolved = await resolve_location_id(row.location_id, state)
                spots[row.location_id] = (resolved.name, resolved.timezone)
            except HTTPException:
                spots[row.location_id] = (row.location_id, None)
        out.append(_out(row, *spots[row.location_id]))
    return out


@router.post("", status_code=201)
async def log_catch(
    body: CatchIn,
    user_id: str = Depends(require_authenticated_user_id),
    state: AppState = Depends(get_app_state),  # noqa: B008
    session: AsyncSession = Depends(get_db_session),  # noqa: B008
) -> CatchOut:
    await ensure_under_cap(session, CatchEntry, user_id, MAX_CATCHES, "catches")
    location = await resolve_location_id(body.location_id, state)

    snapshot: CatchConditions | None = None
    caught = body.caught_at
    if caught.tzinfo is None:
        caught = caught.replace(tzinfo=UTC)
    # Today's forecast only describes a catch made around now; a
    # back-logged catch gets no conditions rather than today's.
    if abs(datetime.now(UTC) - caught) <= SNAPSHOT_WINDOW:
        try:
            envelope = await get_or_assemble_forecast(
                state.forecast_cache,
                location,
                state.http_client,
                load_water_temp_profiles(),
                now=datetime.now(UTC),
            )
            # The day as this angler saw it (their main style, their limits).
            envelope = personalized_with(
                envelope, await load_preferences(user_id, state)
            )
            snapshot = conditions_snapshot(
                envelope.conditions, envelope.tides, body.caught_at
            )
        except Exception:  # best-effort: never refuse a catch over weather data
            _logger.warning("no conditions snapshot for catch", exc_info=True)

    row = CatchEntry(
        user_id=user_id,
        location_id=body.location_id,
        species=body.species.strip(),
        caught_at=body.caught_at,
        length_in=body.length_in,
        weight_lb=body.weight_lb,
        kept=body.kept,
        bait=(body.bait or "").strip() or None,
        notes=(body.notes or "").strip() or None,
        conditions=snapshot.model_dump(mode="json") if snapshot else None,
        created_at=datetime.now(UTC),
    )
    session.add(row)
    await session.commit()
    await session.refresh(row)
    return _out(row, location.name, location.timezone)


@router.delete("/{catch_id}", status_code=204)
async def delete_catch(
    catch_id: int,
    user_id: str = Depends(require_authenticated_user_id),
    session: AsyncSession = Depends(get_db_session),  # noqa: B008
) -> None:
    row = await session.get(CatchEntry, catch_id)
    if row is None or row.user_id != user_id:
        raise HTTPException(status_code=404, detail="catch not found")
    await session.delete(row)
    await session.commit()
