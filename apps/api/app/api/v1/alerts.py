"""`/v1/me/alerts` -- email alert rules (`app.domain.alerts`). One rule per
user per spot: `PUT` creates or updates it, `DELETE` removes it. Same
auth posture as saved locations."""

from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import (
    AppState,
    get_app_state,
    get_db_session,
    require_authenticated_user_id,
    resolve_location_id,
)
from app.api.internal_auth import require_internal_signature
from app.domain.alerts import (
    AlertEmailIn,
    AlertRule,
    AlertRuleIn,
    AlertRuleOut,
    AlertsOut,
    AlertThreshold,
    smtp_configured,
)
from app.domain.limits import MAX_ALERT_RULES, ensure_under_cap

router = APIRouter(
    prefix="/v1/me/alerts",
    tags=["alerts"],
    dependencies=[Depends(require_internal_signature)],
)


async def _out(row: AlertRule, state: AppState) -> AlertRuleOut:
    try:
        name = (await resolve_location_id(row.location_id, state)).name
    except HTTPException:
        name = row.location_id
    return AlertRuleOut(
        id=row.id,
        location_id=row.location_id,
        location_name=name,
        min_verdict=AlertThreshold(row.min_verdict),
        email=row.email,
        enabled=row.enabled,
        last_sent_on=row.last_sent_on,
    )


@router.get("")
async def list_alerts(
    user_id: str = Depends(require_authenticated_user_id),
    state: AppState = Depends(get_app_state),  # noqa: B008
    session: AsyncSession = Depends(get_db_session),  # noqa: B008
) -> AlertsOut:
    rows = (
        (
            await session.execute(
                select(AlertRule)
                .where(AlertRule.user_id == user_id)
                .order_by(AlertRule.created_at)
            )
        )
        .scalars()
        .all()
    )
    return AlertsOut(
        email_configured=smtp_configured(),
        rules=[await _out(row, state) for row in rows],
    )


@router.put("")
async def upsert_alert(
    body: AlertRuleIn,
    user_id: str = Depends(require_authenticated_user_id),
    state: AppState = Depends(get_app_state),  # noqa: B008
    session: AsyncSession = Depends(get_db_session),  # noqa: B008
) -> AlertRuleOut:
    await resolve_location_id(body.location_id, state)
    row = (
        await session.execute(
            select(AlertRule).where(
                AlertRule.user_id == user_id, AlertRule.location_id == body.location_id
            )
        )
    ).scalar_one_or_none()
    if row is None:
        await ensure_under_cap(session, AlertRule, user_id, MAX_ALERT_RULES, "alerts")
        row = AlertRule(
            user_id=user_id,
            location_id=body.location_id,
            created_at=datetime.now(UTC),
        )
        session.add(row)
    row.min_verdict = body.min_verdict.value
    row.email = body.email
    row.enabled = True
    await session.commit()
    await session.refresh(row)
    return await _out(row, state)


@router.put("/email", status_code=204)
async def set_alert_email(
    body: AlertEmailIn,
    user_id: str = Depends(require_authenticated_user_id),
    session: AsyncSession = Depends(get_db_session),  # noqa: B008
) -> None:
    """Point every one of this user's alerts at their current email.
    apps/web calls it when the account's email changes, so alerts never
    keep going to an address the user has left (which might now be
    someone else's)."""
    await session.execute(
        update(AlertRule).where(AlertRule.user_id == user_id).values(email=body.email)
    )
    await session.commit()


@router.delete("/{alert_id}", status_code=204)
async def delete_alert(
    alert_id: int,
    user_id: str = Depends(require_authenticated_user_id),
    session: AsyncSession = Depends(get_db_session),  # noqa: B008
) -> None:
    row = await session.get(AlertRule, alert_id)
    if row is None or row.user_id != user_id:
        raise HTTPException(status_code=404, detail="alert not found")
    await session.delete(row)
    await session.commit()
