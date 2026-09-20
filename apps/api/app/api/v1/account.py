"""`/v1/me` account router (sprint 45, "Privacy and deletion") --
self-service data export and account deletion, the one piece of that
row's acceptance bar buildable without a real product/legal decision.
"Legal pages" (actual Terms of Service/Privacy Policy copy) is a real
legal-review deliverable this session can't supply and doesn't guess
at -- flagged the same way sprint 28's CAPTCHA credentials gap is
flagged, not silently skipped.

Same authentication posture as preferences/saved-locations: every route
requires a real, non-empty `user_id` (`require_authenticated_user_id`),
not just ADR-004's internal signature.

Deliberately returns the literal stored rows, not re-derived data: a
saved location's export entry is its `location_id` and `saved_at`, not
a re-resolved name/state/lat/lng (that's public curated-location data
this service could tell anyone, not personal data this account holds).
`DELETE` removes every row this service holds for the user across both
tables it owns (`user_preferences`, `saved_location`) -- the
`forecast`-schema half of account deletion. `apps/web`'s Better Auth
`deleteUser` hook calls this before removing the `auth`-schema account
row itself, so no orphaned `forecast`-schema data survives a deleted
account.
"""

from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db_session, require_authenticated_user_id
from app.api.internal_auth import require_internal_signature
from app.domain.preferences import UserPreferences
from app.domain.saved_locations import SavedLocation

router = APIRouter(
    prefix="/v1/me",
    tags=["account"],
    dependencies=[Depends(require_internal_signature)],
)


class ExportedPreferences(BaseModel):
    units: str
    fishing_style: str | None
    wind_threshold_kt: float | None
    surf_threshold_ft: float | None
    default_location_id: str | None


class ExportedSavedLocation(BaseModel):
    location_id: str
    saved_at: datetime


class AccountExport(BaseModel):
    preferences: ExportedPreferences | None
    saved_locations: list[ExportedSavedLocation]


@router.get("/export")
async def export_account_data(
    user_id: str = Depends(require_authenticated_user_id),
    session: AsyncSession = Depends(get_db_session),  # noqa: B008
) -> AccountExport:
    prefs = await session.get(UserPreferences, user_id)
    saved_rows = (
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

    return AccountExport(
        preferences=(
            ExportedPreferences(
                units=prefs.units,
                fishing_style=prefs.fishing_style,
                wind_threshold_kt=prefs.wind_threshold_kt,
                surf_threshold_ft=prefs.surf_threshold_ft,
                default_location_id=prefs.default_location_id,
            )
            if prefs is not None
            else None
        ),
        saved_locations=[
            ExportedSavedLocation(location_id=row.location_id, saved_at=row.saved_at)
            for row in saved_rows
        ],
    )


@router.delete("", status_code=204)
async def delete_account_data(
    user_id: str = Depends(require_authenticated_user_id),
    session: AsyncSession = Depends(get_db_session),  # noqa: B008
) -> None:
    await session.execute(delete(SavedLocation).where(SavedLocation.user_id == user_id))
    await session.execute(
        delete(UserPreferences).where(UserPreferences.user_id == user_id)
    )
    await session.commit()
