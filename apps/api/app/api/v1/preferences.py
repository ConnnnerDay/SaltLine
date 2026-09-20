"""`/v1/me/preferences` router (sprint 36) -- the last of the required
API surface's six endpoints, deliberately deferred since sprint 25
("need Better Auth + Postgres, neither exists yet"; see that sprint's
row in `app.main`'s module docstring history).

Unlike every other `/v1` route, this one requires a *real*, non-empty
`user_id` from ADR-004's signed request -- `require_internal_signature`
alone only proves the caller is `apps/web`'s BFF, not that a visitor is
signed in. `apps/web`'s side of this (threading a real Better Auth
session id into the signed request) is that app's own change; this
router 401s on an empty `user_id` rather than silently serving/writing
anonymous "preferences" no session owns.

`default_location_id` is validated against the same `resolve_location_id`
resolution every forecast lookup uses (curated id or coastal point) --
an unresolvable id is a real 422, not stored and surfaced as a working
default that later 404s on every dashboard load.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import (
    AppState,
    get_app_state,
    get_db_session,
    require_authenticated_user_id,
    resolve_location_id,
)
from app.api.internal_auth import require_internal_signature
from app.domain.preferences import PreferencesOut, PreferencesUpdate, UserPreferences

router = APIRouter(
    prefix="/v1/me/preferences",
    tags=["preferences"],
    dependencies=[Depends(require_internal_signature)],
)


@router.get("")
async def get_preferences(
    user_id: str = Depends(require_authenticated_user_id),
    session: AsyncSession = Depends(get_db_session),  # noqa: B008
) -> PreferencesOut:
    row = await session.get(UserPreferences, user_id)
    if row is None:
        return PreferencesOut()
    return PreferencesOut.model_validate(row, from_attributes=True)


@router.patch("")
async def update_preferences(
    body: PreferencesUpdate,
    user_id: str = Depends(require_authenticated_user_id),
    state: AppState = Depends(get_app_state),  # noqa: B008
    session: AsyncSession = Depends(get_db_session),  # noqa: B008
) -> PreferencesOut:
    if body.default_location_id is not None:
        await resolve_location_id(body.default_location_id, state)

    row = await session.get(UserPreferences, user_id)
    if row is None:
        row = UserPreferences(user_id=user_id)
        session.add(row)

    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(row, field, value)

    await session.commit()
    await session.refresh(row)
    return PreferencesOut.model_validate(row, from_attributes=True)
