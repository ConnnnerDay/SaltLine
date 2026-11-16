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

- conditions, -5..+15: legacy's `_conditions_modifier` (onshore/offshore
  wind, wind speed, surf height, time of day), driven by each species'
  condition tags, which the generator copies from legacy's species sets
  (added after the product owner asked for the original features back);

and keeps legacy's `SPECIES_SCORE_THRESHOLD` of 30 as the cut-off. Every
conditions adjustment adds its own reason. Rough surf also produces one
explicit tackle note. Not ported: legacy's seasonal explanation
overrides. The cold/warm explanation split keeps legacy's 65°F boundary
(`_get_explanation`).

**Honesty.** Every pick carries plain-language `reasons` built from the
same numbers it was scored on. When the water temperature is the
monthly climatological fallback rather than a live reading, `basis`
says so and each temperature reason names it -- the ranking is then a
seasonal expectation, not a live read.
"""

from __future__ import annotations

import json
from datetime import date, datetime
from enum import Enum
from functools import lru_cache
from pathlib import Path
from typing import Any

from pydantic import BaseModel

from app.domain.scoring import onshore_offshore_dirs
from app.infra.timezones import safe_zone

_DATA_DIR = Path(__file__).resolve().parent.parent / "data"
_CATALOGUE_PATH = _DATA_DIR / "guidance_species.json"
_REGULATIONS_PATH = _DATA_DIR / "guidance_regulations.json"
_REGULATIONS_STALE_MONTHS = 6
"""Legacy regulations.py's `_STALE_MONTHS`: older snapshots get flagged."""

SCORE_THRESHOLD = 30.0
"""Legacy `SPECIES_SCORE_THRESHOLD`: picks scoring below this are dropped."""

MAX_PICKS = 6

_TEMP_POINTS = 50.0
_PEAK_POINTS = 30.0
_GOOD_POINTS = 15.0
_COLD_BOUNDARY_F = 65.0
_ROUGH_SURF_FT = 4.0

DISCLAIMER = (
    "Informational only — verify with official sources. Size, bag and season "
    "limits change often; check your state's current regulations before "
    "keeping fish."
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


class Regulation(BaseModel):
    """Recreational limits for one species in one state, from the legacy
    snapshot (provisional -- always shown with its age and official link)."""

    state: str
    min_size: str | None = None
    bag_limit: str | None = None
    season: str | None = None
    notes: str | None = None
    source_url: str | None = None
    as_of: str
    """Snapshot month, "YYYY-MM"."""
    possibly_outdated: bool


class SpeciesPick(BaseModel):
    id: str
    name: str
    score: int
    """Legacy points: temperature 0-50 + season 0-30 + conditions -5..+15."""
    tier: GuidanceTier
    reasons: list[str]
    explanation: str
    bait: str
    rig: str
    hook_size: str
    sinker: str
    lures: str
    regulation: Regulation | None = None


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
def load_regulations() -> dict[str, Any]:
    return dict(json.loads(_REGULATIONS_PATH.read_text()))


def _months_between(as_of: str, today: date) -> int | None:
    try:
        year, month = (int(part) for part in as_of.split("-")[:2])
    except ValueError:
        return None
    return (today.year - year) * 12 + (today.month - month)


def regulation_for(species_id: str, state: str, today: date) -> Regulation | None:
    """*species_id*'s limits in *state*, or `None` when the snapshot has no
    entry (never a guess borrowed from another state)."""
    data = load_regulations()
    entry = data["states"].get(state, {}).get(species_id)
    if entry is None:
        return None
    age = _months_between(data["as_of"], today)
    return Regulation(
        state=state,
        min_size=entry.get("min_size"),
        bag_limit=entry.get("bag_limit"),
        season=entry.get("season"),
        notes=entry.get("notes"),
        source_url=data["state_sources"].get(state),
        as_of=data["as_of"],
        possibly_outdated=age is None or age > _REGULATIONS_STALE_MONTHS,
    )


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


def _conditions_modifier(
    tags: list[str],
    *,
    coast: str | None,
    wind_direction: str | None,
    wind_range_kt: tuple[float, float] | None,
    wave_range_ft: tuple[float, float] | None,
    hour: int | None,
) -> tuple[float, list[str]]:
    """Port of legacy `_conditions_modifier` (-5..+15 points) over the
    catalogue's condition tags (copied from legacy's species sets), plus
    a plain-language reason for every adjustment it makes."""
    points = 0.0
    reasons: list[str] = []

    if wind_direction and coast:
        onshore, offshore = onshore_offshore_dirs(coast)
        is_onshore, is_offshore = wind_direction in onshore, wind_direction in offshore
        if "onshore_wind" in tags:
            if is_onshore:
                points += 5
                reasons.append(
                    f"Onshore {wind_direction} wind pushes bait toward the beach"
                )
            elif is_offshore:
                points -= 3
                reasons.append(f"Offshore {wind_direction} wind works against it")
        elif "calm_water" in tags:
            if is_offshore:
                points += 5
                reasons.append(f"Offshore {wind_direction} wind keeps the water clear")
            elif is_onshore:
                points -= 3
                reasons.append(
                    f"Onshore {wind_direction} wind muddies the water it likes"
                )

    if wind_range_kt is not None:
        wind_avg = sum(wind_range_kt) / 2
        if "rough_surf" in tags:
            if 10 <= wind_avg <= 18:
                points += 3
                reasons.append("Moderate wind stirs up bait")
            elif wind_avg < 5:
                points -= 2
                reasons.append("Too calm to stir up bait")
        elif "calm_water" in tags:
            if wind_avg < 8:
                points += 3
                reasons.append("Light wind suits it")
            elif wind_avg > 15:
                points -= 2
                reasons.append("Too windy for it")

    if wave_range_ft is not None:
        wave_avg = sum(wave_range_ft) / 2
        if "rough_surf" in tags:
            if 2 <= wave_avg <= 5:
                points += 4
                reasons.append("Surf is concentrating bait in the troughs")
            elif wave_avg < 1:
                points -= 1
                reasons.append("Flat surf")
        elif "calm_water" in tags:
            if wave_avg < 2:
                points += 4
                reasons.append("Calm surf suits it")
            elif wave_avg > 4:
                points -= 2
                reasons.append("Surf is too rough for it")

    if hour is not None:
        low_light = hour < 7 or hour > 18
        midday = 10 <= hour <= 15
        if "low_light" in tags:
            if low_light:
                points += 3
                reasons.append("Low light is its prime feeding time")
            elif midday:
                points -= 1
                reasons.append("Bites slower in midday sun")
        elif "daytime" in tags:
            if midday:
                points += 3
                reasons.append("Most active in bright midday light")
            elif low_light:
                points -= 1
                reasons.append("Less active in low light")

    return points, reasons


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
    state: str | None = None,
    today: date | None = None,
    coast: str | None = None,
    wind_direction: str | None = None,
    wind_range_kt: tuple[float, float] | None = None,
    hour: int | None = None,
    max_picks: int = MAX_PICKS,
) -> FishingGuidance:
    picks: list[tuple[float, SpeciesPick]] = []
    for species in load_catalogue():
        if region not in species["regions"]:
            continue
        temp_points = _temperature_points(species, water_temp_f)
        if temp_points is None:
            continue
        modifier, condition_reasons = _conditions_modifier(
            species.get("conditions", []),
            coast=coast,
            wind_direction=wind_direction,
            wind_range_kt=wind_range_kt,
            wave_range_ft=wave_range_ft,
            hour=hour,
        )
        score = max(0.0, temp_points + _season_points(species, month) + modifier)
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
                        *condition_reasons,
                    ],
                    explanation=explanation,
                    bait=species["bait"],
                    rig=species["rig"],
                    hook_size=species["hook_size"],
                    sinker=species["sinker"],
                    lures=species["lures"],
                    regulation=(
                        regulation_for(species["id"], state, today or date.today())
                        if state
                        else None
                    ),
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
