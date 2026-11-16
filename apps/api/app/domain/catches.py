"""Catch log (restored from the original app at the product owner's
request): a user's own record of what they caught, where and when, with
the conditions at that spot when it was logged -- the legacy "catch log w/
condition snapshot".

Same ownership model as saved locations: rows keyed by Better Auth's
opaque `user_id` (ADR-006), only ever readable by that user, included in
account export and removed by account deletion (sprint 45).

The conditions snapshot is best-effort: it comes from the forecast cache
or a fresh assemble at log time, and is `None` when neither is available
-- a catch is never refused because upstream weather data is down.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field
from sqlalchemy import JSON, Boolean, DateTime, Float, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.infra.database import Base


class CatchEntry(Base):
    __tablename__ = "catch_entry"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String, index=True)
    location_id: Mapped[str] = mapped_column(String)
    species: Mapped[str] = mapped_column(String)
    caught_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    length_in: Mapped[float | None] = mapped_column(Float, nullable=True)
    weight_lb: Mapped[float | None] = mapped_column(Float, nullable=True)
    kept: Mapped[bool] = mapped_column(Boolean, default=False)
    bait: Mapped[str | None] = mapped_column(String, nullable=True)
    notes: Mapped[str | None] = mapped_column(String, nullable=True)
    conditions: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class CatchIn(BaseModel):
    location_id: str = Field(min_length=1, max_length=64)
    species: str = Field(min_length=1, max_length=80)
    caught_at: datetime
    length_in: float | None = Field(default=None, gt=0, le=120)
    weight_lb: float | None = Field(default=None, gt=0, le=500)
    kept: bool = False
    bait: str | None = Field(default=None, max_length=120)
    notes: str | None = Field(default=None, max_length=1000)


class CatchConditions(BaseModel):
    """What the forecast said at the spot when the catch was logged."""

    water_temp_f: float | None = None
    water_temp_is_fallback: bool | None = None
    wind_range_kt: list[float] | None = None
    wind_direction: str | None = None
    wave_range_ft: list[float] | None = None
    verdict: str | None = None
    score: int | None = None


class CatchOut(BaseModel):
    id: int
    location_id: str
    location_name: str
    species: str
    caught_at: datetime
    length_in: float | None
    weight_lb: float | None
    kept: bool
    bait: str | None
    notes: str | None
    conditions: CatchConditions | None
    created_at: datetime


def conditions_snapshot(
    envelope_conditions: dict[str, Any] | None,
) -> CatchConditions | None:
    """Pick the few decision-relevant fields out of a forecast envelope's
    `conditions` payload (`app.domain.assembly.ForecastConditions`)."""
    if not envelope_conditions:
        return None
    water = envelope_conditions.get("water_temperature") or {}
    score = envelope_conditions.get("score") or {}
    return CatchConditions(
        water_temp_f=water.get("value"),
        water_temp_is_fallback=water.get("is_fallback"),
        wind_range_kt=envelope_conditions.get("wind_range_kt"),
        wind_direction=envelope_conditions.get("wind_direction"),
        wave_range_ft=envelope_conditions.get("wave_range_ft"),
        verdict=score.get("verdict"),
        score=score.get("score"),
    )
