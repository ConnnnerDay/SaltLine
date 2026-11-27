"""Per-account abuse ceilings: far above anything a real angler reaches,
so one account can't fill the database or turn the alert checker (which
fetches a forecast for every rule) into an amplifier against the
upstream weather services. Not product limits: the free-tier saved-spot
question stays open (app.domain.saved_locations)."""

from __future__ import annotations

from typing import Any

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

MAX_SAVED_LOCATIONS = 200
MAX_CATCHES = 10_000
MAX_ALERT_RULES = 20


async def ensure_under_cap(
    session: AsyncSession, model: Any, user_id: str, cap: int, what: str
) -> None:
    """403 when *user_id* already has *cap* rows of *model*."""
    count = await session.scalar(
        select(func.count()).select_from(model).where(model.user_id == user_id)
    )
    if (count or 0) >= cap:
        raise HTTPException(status_code=403, detail=f"limit reached: {cap} {what}")
