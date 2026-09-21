"""`/v1/analytics/events` router (sprint 43).

The one analytics write path `apps/web` calls directly -- a
`registration` event, from `lib/auth.ts`'s
`databaseHooks.user.create.after` hook, since that account creation
happens in `apps/web`'s own `auth`-schema database, which this service
has no access to (ADR-006). `apps/api`'s own routes (locations resolve,
forecast generation) call `app.domain.analytics.try_record_event`
directly, in-process, since they're already inside this service and
don't need an extra HTTP round trip to record their own event.

Internal-only, same ADR-004-signed path as every other `/v1` route; no
`require_authenticated_user_id` gate, since writing an event is not
itself a per-user resource read/write the way preferences/saved-
locations are -- `user_id` is just one optional field on the payload
(see `AnalyticsEventIn`), not the identity of "whose data is this."

Always `204`, even when the underlying write was silently swallowed
(see `try_record_event`'s own docstring on why recording is best-
effort by design): this endpoint is a side-channel `apps/web` should
never treat as a failable step in a real request.
"""

from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, status

from app.api.deps import AppState, get_app_state
from app.api.internal_auth import require_internal_signature
from app.domain.analytics import AnalyticsEventIn, try_record_event

router = APIRouter(
    prefix="/v1/analytics",
    tags=["analytics"],
    dependencies=[Depends(require_internal_signature)],
)


@router.post("/events", status_code=status.HTTP_204_NO_CONTENT)
async def record_analytics_event(
    body: AnalyticsEventIn,
    state: AppState = Depends(get_app_state),  # noqa: B008
) -> None:
    await try_record_event(state.db_sessionmaker, body, now=datetime.now(UTC))
