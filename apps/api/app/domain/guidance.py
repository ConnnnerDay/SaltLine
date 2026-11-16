"""Fishing guidance (sprint 35): "limited supported suggestions; every
recommendation explains why".

Designs `app.domain.models.ForecastEnvelope.recommendations`, the last of
the four opaque payloads sprint 11 reserved (21/22/34/35).

**Scope.** Deliberately *not* the legacy 851-species experience, which the
roadmap defers past v1. The catalogue is `app/data/guidance_species.json`:
26 common surf/pier targets, each offered only in the `conditions_region`s
it actually lives in (4-13 per region), with bait/rig/tackle copied
verbatim from the legacy dataset by `scripts/generate_guidance_catalogue.py`.

**Scoring** ports the two condition-independent parts of the legacy
`domain/species.py:_score_species`, unchanged:

- temperature fit, 0-50: full 50 inside the species' ideal range,
  falling linearly to 0 at its survivable min/max; outside min/max the
  species is excluded outright (legacy's -100 "presence penalty");
- seasonal fit, 0-30: +30 in a peak month, +15 in a good month, else 0;

and keeps legacy's `SPECIES_SCORE_THRESHOLD` of 30 as the cut-off. Not
ported: legacy's wind-direction/wave/time-of-day `_conditions_modifier`
(its onshore/offshore species tables are product judgment this sprint
can't characterize yet) and its seasonal explanation overrides. Rough
surf instead produces one explicit tackle note rather than silently
reshuffling the ranking. The cold/warm explanation split keeps legacy's
65°F boundary (`_get_explanation`).

**Honesty.** Every pick carries plain-language `reasons` built from the
same numbers it was scored on. When the water temperature is the
monthly climatological fallback rather than a live reading, `basis`
says so and each temperature reason names it -- the ranking is then a
seasonal expectation, not a live read.
"""

from __future__ import annotations

import json
from datetime import datetime
from enum import Enum
from functools import lru_cache
from pathlib import Path
from typing import Any

from pydantic import BaseModel

from app.infra.timezones import safe_zone

_CATALOGUE_PATH = (
    Path(__file__).resolve().parent.parent / "data" / "guidance_species.json"
)

SCORE_THRESHOLD = 30.0
"""Legacy `SPECIES_SCORE_THRESHOLD`: picks scoring below this are dropped."""

MAX_PICKS = 6

_TEMP_POINTS = 50.0
_PEAK_POINTS = 30.0
_GOOD_POINTS = 15.0
_COLD_BOUNDARY_F = 65.0
_ROUGH_SURF_FT = 4.0

DISCLAIMER = (
    "Informational only. Size, bag and season limits change -- check your "
    "state's current regulations before keeping fish."
)

_MONTH_NAMES = (
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
)


class GuidanceTier(str, Enum):
    PRIME = "prime"
    GOOD = "good"
    FAIR = "fair"


class SpeciesPick(BaseModel):
    id: str
    name: str
    score: int
    """Legacy points, 0-80 (temperature 0-50 + season 0-30)."""
    tier: GuidanceTier
    reasons: list[str]
    explanation: str
    bait: str
    rig: str
    hook_size: str
    sinker: str
    lures: str


class GuidanceBasis(BaseModel):
    water_temp_f: float
    water_temp_is_fallback: bool
    month: int
    region: str


class CalendarLevel(str, Enum):
    PEAK = "peak"
    GOOD = "good"
    NONE = ""


class CalendarRow(BaseModel):
    id: str
    name: str
    months: list[CalendarLevel]
    """12 entries, January first."""


class FishingGuidance(BaseModel):
    basis: GuidanceBasis
    species: list[SpeciesPick]
    tackle_note: str | None = None
    calendar: list[CalendarRow] = []
    """Every catalogue species offered in the region, month by month --
    the legacy "Species Calendar" (`build_species_calendar`)."""
    disclaimer: str = DISCLAIMER


@lru_cache(maxsize=1)
def load_catalogue() -> tuple[dict[str, Any], ...]:
    data = json.loads(_CATALOGUE_PATH.read_text())
    return tuple(data["species"])


def _temperature_points(species: dict[str, Any], water_temp: float) -> float | None:
    """Legacy temperature fit; `None` when outside the survivable range."""
    if water_temp < species["temp_min"] or water_temp > species["temp_max"]:
        return None
    low, high = species["temp_ideal_low"], species["temp_ideal_high"]
    if low <= water_temp <= high:
        return _TEMP_POINTS
    if water_temp < low:
        span = low - species["temp_min"]
        return _TEMP_POINTS * (1 - (low - water_temp) / span) if span > 0 else 25.0
    span = species["temp_max"] - high
    return _TEMP_POINTS * (1 - (water_temp - high) / span) if span > 0 else 25.0


def _season_points(species: dict[str, Any], month: int) -> float:
    if month in species["peak_months"]:
        return _PEAK_POINTS
    if month in species["good_months"]:
        return _GOOD_POINTS
    return 0.0


def _tier(score: float) -> GuidanceTier:
    if score >= 65:
        return GuidanceTier.PRIME
    if score >= 50:
        return GuidanceTier.GOOD
    return GuidanceTier.FAIR


def _temperature_reason(
    species: dict[str, Any], water_temp: float, is_fallback: bool
) -> str:
    low, high = species["temp_ideal_low"], species["temp_ideal_high"]
    reading = f"{water_temp:.0f}°F" + (" (monthly average)" if is_fallback else "")
    if low <= water_temp <= high:
        return f"Water {reading} is in its ideal {low}–{high}°F range"
    side = "below" if water_temp < low else "above"
    return f"Water {reading} is {side} its ideal {low}–{high}°F, but within range"


def _season_reason(species: dict[str, Any], month: int) -> str:
    name = _MONTH_NAMES[month - 1]
    if month in species["peak_months"]:
        return f"{name} is a peak month"
    if month in species["good_months"]:
        return f"{name} is a good month"
    return f"Off-season in {name}"


def _tackle_note(wave_range: tuple[float, float] | None) -> str | None:
    if wave_range is None or wave_range[1] < _ROUGH_SURF_FT:
        return None
    high = f"{wave_range[1]:g}"
    return (
        f"Surf up to {high} ft: size up to the heavy end of each sinker range "
        "(or a sputnik/pyramid) to hold bottom, and favor sheltered piers and "
        "jetties."
    )


_CALENDAR_TEMP_SLACK_F = 5.0


def build_species_calendar(
    region: str, monthly_temps: dict[int, float] | None = None
) -> list[CalendarRow]:
    """Port of legacy `build_species_calendar` over this catalogue: each
    region species' peak/good months, blanked for any month whose regional
    average water temperature sits more than 5°F outside the species'
    survivable range (legacy's same slack). Catalogue order is kept."""
    rows: list[CalendarRow] = []
    for species in load_catalogue():
        if region not in species["regions"]:
            continue
        months: list[CalendarLevel] = []
        for month in range(1, 13):
            temp = (monthly_temps or {}).get(month)
            if temp is not None and (
                temp < species["temp_min"] - _CALENDAR_TEMP_SLACK_F
                or temp > species["temp_max"] + _CALENDAR_TEMP_SLACK_F
            ):
                months.append(CalendarLevel.NONE)
            elif month in species["peak_months"]:
                months.append(CalendarLevel.PEAK)
            elif month in species["good_months"]:
                months.append(CalendarLevel.GOOD)
            else:
                months.append(CalendarLevel.NONE)
        rows.append(CalendarRow(id=species["id"], name=species["name"], months=months))
    return rows


def build_fishing_guidance(
    *,
    region: str,
    water_temp_f: float,
    water_temp_is_fallback: bool,
    month: int,
    wave_range_ft: tuple[float, float] | None = None,
    monthly_temps: dict[int, float] | None = None,
    max_picks: int = MAX_PICKS,
) -> FishingGuidance:
    picks: list[tuple[float, SpeciesPick]] = []
    for species in load_catalogue():
        if region not in species["regions"]:
            continue
        temp_points = _temperature_points(species, water_temp_f)
        if temp_points is None:
            continue
        score = temp_points + _season_points(species, month)
        if score < SCORE_THRESHOLD:
            continue
        explanation = (
            species["explanation_cold"]
            if water_temp_f < _COLD_BOUNDARY_F
            else species["explanation_warm"]
        )
        picks.append(
            (
                score,
                SpeciesPick(
                    id=species["id"],
                    name=species["name"],
                    score=round(score),
                    tier=_tier(score),
                    reasons=[
                        _temperature_reason(
                            species, water_temp_f, water_temp_is_fallback
                        ),
                        _season_reason(species, month),
                    ],
                    explanation=explanation,
                    bait=species["bait"],
                    rig=species["rig"],
                    hook_size=species["hook_size"],
                    sinker=species["sinker"],
                    lures=species["lures"],
                ),
            )
        )

    # Stable: ties keep catalogue order (roughly most-targeted first).
    picks.sort(key=lambda item: item[0], reverse=True)

    return FishingGuidance(
        basis=GuidanceBasis(
            water_temp_f=water_temp_f,
            water_temp_is_fallback=water_temp_is_fallback,
            month=month,
            region=region,
        ),
        species=[pick for _, pick in picks[:max_picks]],
        tackle_note=_tackle_note(wave_range_ft),
        calendar=build_species_calendar(region, monthly_temps),
    )


def local_month(now: datetime, tz_name: str) -> int:
    """The calendar month at the location (a forecast at 11 PM Pacific on
    Oct 31 is an October forecast, even though it's Nov 1 in UTC)."""
    return now.astimezone(safe_zone(tz_name)).month
