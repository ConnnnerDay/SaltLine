"""Analytics event capture (sprint 43, "Privacy-safe analytics").

`docs/CANONICAL_ROADMAP.md`'s own guidance for this row: "no named
vendor preference -- choose pragmatic, free-tier-friendly tools rather
than spending a sprint deciding between options." Pragmatic and free
here means no third-party service at all: one small table in the same
`forecast`-schema Postgres this service already owns (ADR-006), reusing
sprint 36's connection/pooling wiring rather than adding a new
dependency. This sprint only builds the capture path -- actually
*reporting* a signup-funnel or return-usage rate needs real production
traffic to be meaningful (sprints 58/59, both still "Not accepted" for
exactly that reason, both directional 6-12-month-post-launch goals);
what's captured here is what those later sprints will query.

Privacy: `user_id` is Better Auth's opaque id (the same posture
`app.domain.preferences.UserPreferences`/`app.domain.saved_locations
.SavedLocation` already hold -- this table never stores an email, name,
IP address, or user agent) and is only ever set for a `registration`
event; the other two event types this sprint wires
(`location_resolved`, `forecast_generated`) carry no caller identity at
all, since neither `POST /v1/locations/resolve` nor
`GET /v1/forecasts/{location_id}` threads a `user_id` through today (a
pre-existing gap, not something this sprint invents a fix for).
`location_id` is the same public curated-or-dynamic id every other
endpoint already returns, never raw coordinates or a precise device
location.

Recording is deliberately best-effort: `try_record_event` never raises.
No database configured at all (this service boots without one -- see
`app.main`'s module docstring) or a real outage must not turn an
analytics side-effect into a failed forecast, resolution, or
registration request -- directly the lesson sprint 47 ("Degraded-mode
UX") drew from actually breaking this exact class of dependency live.
"""

from __future__ import annotations

import logging
from datetime import datetime
from enum import Enum

from pydantic import BaseModel
from sqlalchemy import DateTime, Float, Integer, String
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
from sqlalchemy.orm import Mapped, mapped_column

from app.infra.database import Base

# Shared by name with app.main's own error logger (that module imports
# this one's router, not the other way around, so importing its logger
# object directly would risk a circular import) -- a named logger is a
# global singleton lookup, so this reaches the same handler app.main
# attaches at import time. See that module's own comment for why an
# arbitrary logger needs an explicit handler under a real uvicorn run.
logger = logging.getLogger("app.errors")


class AnalyticsEventType(str, Enum):
    REGISTRATION = "registration"
    LOCATION_RESOLVED = "location_resolved"
    FORECAST_GENERATED = "forecast_generated"


class AnalyticsEvent(Base):
    """One row per captured event. Deliberately one denormalized table,
    not one per event type: this is the same minimal-infra posture
    `docs/architecture.md`'s "no Redis and no job queue in v1" already
    commits to, and every event type this sprint wires shares the same
    small field set.
    """

    __tablename__ = "analytics_event"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    event_type: Mapped[str] = mapped_column(String, index=True)
    user_id: Mapped[str | None] = mapped_column(String, nullable=True)
    location_id: Mapped[str | None] = mapped_column(String, nullable=True)
    state: Mapped[str | None] = mapped_column(String, nullable=True)
    latency_ms: Mapped[float | None] = mapped_column(Float, nullable=True)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)


class AnalyticsEventIn(BaseModel):
    event_type: AnalyticsEventType
    user_id: str | None = None
    location_id: str | None = None
    state: str | None = None
    latency_ms: float | None = None


async def try_record_event(
    db_sessionmaker: async_sessionmaker[AsyncSession] | None,
    event: AnalyticsEventIn,
    *,
    now: datetime,
) -> None:
    if db_sessionmaker is None:
        return
    try:
        async with db_sessionmaker() as session:
            session.add(
                AnalyticsEvent(
                    event_type=event.event_type.value,
                    user_id=event.user_id,
                    location_id=event.location_id,
                    state=event.state,
                    latency_ms=event.latency_ms,
                    occurred_at=now,
                )
            )
            await session.commit()
    except Exception:
        logger.exception(
            "failed to record analytics event (event_type=%s)", event.event_type.value
        )
