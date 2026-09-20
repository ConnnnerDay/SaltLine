"""`/v1/me/locations` router (sprint 37) -- ordered favorites, ownership,
duplicates, deletion. See `app.domain.saved_locations`'s module
docstring for the ownership-model-not-a-cap reasoning and why "ordered"
means insertion order, not a reorderable position field.

Same authentication posture as `app.api.v1.preferences`: every route
requires a real, non-empty `user_id` (`require_authenticated_user_id`),
not just ADR-004's internal signature.
"""

from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import (
    AppState,
    get_app_state,
    get_db_session,
    require_authenticated_user_id,
    resolve_location_id,
)
from app.api.internal_auth import require_internal_signature
from app.domain.saved_locations import SavedLocation, SavedLocationOut

router = APIRouter(
    prefix="/v1/me/locations",
    tags=["saved-locations"],
    dependencies=[Depends(require_internal_signature)],
)


class SaveLocationRequest(BaseModel):
    location_id: str


@router.get("")
async def list_saved_locations(
    user_id: str = Depends(require_authenticated_user_id),
    state: AppState = Depends(get_app_state),  # noqa: B008
    session: AsyncSession = Depends(get_db_session),  # noqa: B008
) -> list[SavedLocationOut]:
    rows = (
        (
            await session.execute(
                select(SavedLocation)
                .where(SavedLocation.user_id == user_id)
                .order_by(SavedLocation.saved_at)
            )
        )
        .scalars()
        .all()
    )

    out: list[SavedLocationOut] = []
    for row in rows:
        location = await resolve_location_id(row.location_id, state)
        out.append(
            SavedLocationOut(
                id=row.id,
                location_id=row.location_id,
                name=location.name,
                state=location.state,
                lat=location.lat,
                lng=location.lng,
                saved_at=row.saved_at,
            )
        )
    return out


@router.post("", status_code=201)
async def save_location(
    body: SaveLocationRequest,
    user_id: str = Depends(require_authenticated_user_id),
    state: AppState = Depends(get_app_state),  # noqa: B008
    session: AsyncSession = Depends(get_db_session),  # noqa: B008
) -> SavedLocationOut:
    # Resolves (and 404s/422s) before the insert attempt, same as
    # preferences' default_location_id check -- an unresolvable id
    # should never reach the database at all.
    location = await resolve_location_id(body.location_id, state)

    row = SavedLocation(
        user_id=user_id, location_id=body.location_id, saved_at=datetime.now(UTC)
    )
    session.add(row)
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(
            status_code=409, detail="location is already saved"
        ) from exc
    await session.refresh(row)

    return SavedLocationOut(
        id=row.id,
        location_id=row.location_id,
        name=location.name,
        state=location.state,
        lat=location.lat,
        lng=location.lng,
        saved_at=row.saved_at,
    )


@router.delete("/{saved_location_id}", status_code=204)
async def delete_saved_location(
    saved_location_id: int,
    user_id: str = Depends(require_authenticated_user_id),
    session: AsyncSession = Depends(get_db_session),  # noqa: B008
) -> None:
    row = await session.get(SavedLocation, saved_location_id)
    # A 404 either way a row isn't this user's -- doesn't exist at all,
    # or exists but belongs to someone else -- so this never confirms or
    # denies another user's saved-location ids to an unrelated caller.
    if row is None or row.user_id != user_id:
        raise HTTPException(status_code=404, detail="saved location not found")
    await session.delete(row)
    await session.commit()
