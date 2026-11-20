"""Fishing guidance (sprint 35): "limited supported suggestions; every
recommendation explains why".

Designs `app.domain.models.ForecastEnvelope.recommendations`, the last of
the four opaque payloads sprint 11 reserved (21/22/34/35).

**Scope.** `app/data/guidance_species.json` holds every fish in the legacy
dataset once (~580; variants like "Bluefish (small)" merged, protected and
encounter-only species left out), each in the `conditions_region`s it
lives in, with bait/rig/tackle copied verbatim by
`scripts/generate_guidance_catalogue.py`. Each carries an `access` tag:
`shore` fish are picks for everyone; `boat` (offshore/charter) and
`tidal` (brackish/freshwater-edge) fish are ranked into their own lists,
which app.domain.personalize merges in for anglers who fish that way;
`incidental` fish (bait fish, nuisance fish, non-targets) are never picked.

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
import re
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
_REGIONAL_SEASONS_PATH = _DATA_DIR / "regional_seasons.json"
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
    targets: list[str] = []
    """The original profile's target groups this species belongs to
    (bottom, pelagic, structure, gamefish, inshore_slam)."""


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


class PackRow(BaseModel):
    kind: str
    """lure | color | bait | rig | hook | weight"""
    label: str
    value: str


class PackForToday(BaseModel):
    """The original "Pack for Today" card: one short tackle list for the
    day's working species, adjusted for conditions."""

    headline: str
    rows: list[PackRow]


class FishingGuidance(BaseModel):
    basis: GuidanceBasis
    species: list[SpeciesPick]
    tackle_note: str | None = None
    pack: PackForToday | None = None
    boat_species: list[SpeciesPick] = []
    """Top boat-only picks (offshore/charter fish), merged into `species`
    by app.domain.personalize for anglers who fish from a boat."""
    tidal_species: list[SpeciesPick] = []
    """Top brackish/freshwater-edge picks (tidal creeks and rivers), merged
    in for kayak, wade, bridge and inshore-boat anglers."""
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

    def text(field: str) -> str | None:
        # A few legacy entries hold a bare number ("bag_limit": 10).
        value = entry.get(field)
        return None if value is None else str(value)

    return Regulation(
        state=state,
        min_size=text("min_size"),
        bag_limit=text("bag_limit"),
        season=text("season"),
        notes=text("notes"),
        source_url=data["state_sources"].get(state),
        as_of=data["as_of"],
        possibly_outdated=age is None or age > _REGULATIONS_STALE_MONTHS,
    )


@lru_cache(maxsize=1)
def load_catalogue() -> tuple[dict[str, Any], ...]:
    data = json.loads(_CATALOGUE_PATH.read_text())
    seasons = _regional_seasons()
    return tuple(
        {**species, "season_by_region": seasons.get(species["id"], {})}
        for species in data["species"]
    )


@lru_cache(maxsize=1)
def _regional_seasons() -> dict[str, dict[str, dict[str, list[int]]]]:
    """app/data/regional_seasons.json: per-region peak/good months for fish
    whose timing differs by coast (the catalogue has one set, written for
    the Carolinas)."""
    data = json.loads(_REGIONAL_SEASONS_PATH.read_text())
    return {
        species_id: {
            region: {"peak_months": months["peak"], "good_months": months["good"]}
            for region, months in regions.items()
        }
        for species_id, regions in data["seasons"].items()
    }


def for_region(species: dict[str, Any], region: str) -> dict[str, Any]:
    """*species* with its peak/good months for *region*, where they differ."""
    override = species.get("season_by_region", {}).get(region)
    return {**species, **override} if override else species


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


# In season at the ideal water temperature already scores 80 (50 + 30), so
# "prime" needs today's conditions on top of that; with the old 65 cutoff
# nearly every in-season fish was "prime" and the label meant nothing.
PRIME_SCORE = 88.0
GOOD_SCORE = 70.0


def _tier(score: float) -> GuidanceTier:
    if score >= PRIME_SCORE:
        return GuidanceTier.PRIME
    if score >= GOOD_SCORE:
        return GuidanceTier.GOOD
    return GuidanceTier.FAIR


def _temperature_reason(
    species: dict[str, Any], water_temp: float, is_fallback: bool
) -> str:
    low, high = species["temp_ideal_low"], species["temp_ideal_high"]
    suffix = " (monthly average)" if is_fallback else ""
    if low <= water_temp <= high:
        return f"Water {water_temp:.0f}°F{suffix} is in its ideal {low}–{high}°F range"
    side = "below" if water_temp < low else "above"
    # 57.7°F rounds to the 58°F edge: "58°F is below 58–74°F" reads as a
    # mistake, so show the decimal and say "just".
    if round(water_temp) in (low, high):
        return (
            f"Water {water_temp:.1f}°F{suffix} is just {side} its ideal "
            f"{low}–{high}°F range"
        )
    return (
        f"Water {water_temp:.0f}°F{suffix} is {side} its ideal {low}–{high}°F, "
        "but within range"
    )


def _season_reason(species: dict[str, Any], month: int) -> str:
    name = _MONTH_NAMES[month - 1]
    if month in species["peak_months"]:
        return f"{name} is a peak month"
    if month in species["good_months"]:
        return f"{name} is a good month"
    return f"Off-season in {name}"


def _spawn_reasons(
    species: dict[str, Any], month: int, water_temp_f: float
) -> list[str]:
    """A note when *month* is in the fish's spawning season (legacy
    SPAWNING_DATA): information for the angler, not a score change. Says
    whether the water is in the spawning range too."""
    spawn = species.get("spawn")
    if not spawn or month not in spawn["months"]:
        return []
    low, high = spawn["temp_low"], spawn["temp_high"]
    if low <= water_temp_f <= high:
        return [
            (
                f"Spawning season, and the water is in their {low:g}–{high:g}°F "
                "spawning range: go easy on the big breeders"
            )
        ]
    return ["Spawning season"]


def _tackle_note(wave_range: tuple[float, float] | None) -> str | None:
    if wave_range is None or wave_range[1] < _ROUGH_SURF_FT:
        return None
    high = f"{wave_range[1]:g}"
    return (
        f"Surf up to {high} ft: size up to the heavy end of each sinker range "
        "(or a sputnik/pyramid) to hold bottom, and favor sheltered piers and "
        "jetties."
    )


# Lure-line entries that say the fish isn't really a lure fish ("Not a
# strong lure target", "Primarily caught on bait", "small jigs
# occasionally"): not something to pack.
_NOT_A_LURE = re.compile(
    r"^(not|no)\b|\bnot (a|typically|usually|commonly|targeted)\b|primarily|rarely|occasional",
    re.IGNORECASE,
)
# Lures and gear that turn up in some species' bait lines.
_NOT_A_BAIT = re.compile(
    r"\b(plugs?|lures?|jigs?|spoons?|swimbaits?|soft plastics?|flies|fly)\b",
    re.IGNORECASE,
)


def _tokens(values: list[str]) -> list[str]:
    """Unique comma/semicolon-separated entries across *values*, in order."""
    seen: list[str] = []
    for value in values:
        for raw in value.replace(";", ",").split(","):
            token = raw.strip().rstrip(".")
            if token and token.lower() not in {t.lower() for t in seen}:
                seen.append(token)
    return seen


def _item(token: str) -> str:
    """One list entry, starting with a capital: entries come from several
    species' free text, some starting lowercase ("cut mullet")."""
    return token[:1].upper() + token[1:]


def _list(tokens: list[str]) -> str:
    # " · " rather than ", ": entries can contain their own commas.
    return " · ".join(_item(token) for token in tokens)


def _distinct_rigs(values: list[str]) -> list[str]:
    """Rig lines split on "or" too, dropping one that another already names
    ("Fish finder rig" next to "Fish finder rig with sliding egg sinker")."""
    parts: list[str] = []
    for token in _tokens(values):
        parts.extend(p.strip() for p in re.split(r"\bor\b", token) if p.strip())
    distinct: list[str] = []
    for part in parts:
        low = part.lower()
        if any(low in kept.lower() for kept in distinct):
            continue
        distinct = [kept for kept in distinct if kept.lower() not in low]
        distinct.append(part)
    return distinct


def _join_names(names: list[str]) -> str:
    return names[0] if len(names) == 1 else ", ".join(names[:-1]) + " & " + names[-1]


def build_pack_for_today(
    picks: list[SpeciesPick],
    *,
    water_temp_f: float,
    wind_range_kt: tuple[float, float] | None,
    wave_range_ft: tuple[float, float] | None,
    hour: int | None,
) -> PackForToday | None:
    """Port of legacy `domain/forecast.py:build_trip_setup` (without the
    per-user gear profile): tackle for up to three working species, with
    its murky-water / cold-water / low-light adjustments."""
    if not picks:
        return None
    working = [pick for pick in picks if pick.tier is not GuidanceTier.FAIR][
        :3
    ] or picks[:2]

    max_wave = wave_range_ft[1] if wave_range_ft else 0.0
    max_wind = wind_range_kt[1] if wind_range_kt else 0.0
    murky = max_wave >= 3 or max_wind >= 18
    cold = water_temp_f < 58
    warm = water_temp_f > 72
    low_light = hour is not None and (hour < 8 or hour >= 18)

    rows: list[PackRow] = []
    lures = [
        lure
        for lure in _tokens([pick.lures for pick in working])
        if not _NOT_A_LURE.search(lure)
    ][:4]
    if lures:
        if low_light and warm and not any("topwater" in lure.lower() for lure in lures):
            lures = ["Topwater plugs (early/late)", *lures[:3]]
        rows.append(PackRow(kind="lure", label="Lures", value=_list(lures)))
    if murky:
        color = "Chartreuse, white or bright orange — murky water today"
    elif cold:
        color = "Natural colors, slow-roll or dead-stick — cold water slows them down"
    elif warm and low_light:
        color = "Dark silhouettes (black/purple) for low-light topwater"
    else:
        color = ""
    if color and lures:
        rows.append(PackRow(kind="color", label="Color/action", value=color))
    baits = [
        bait
        for bait in _tokens([pick.bait for pick in working])
        if not _NOT_A_BAIT.search(bait)
    ][:4]
    if baits:
        rows.append(PackRow(kind="bait", label="Bait", value=_list(baits)))
    rigs = _distinct_rigs([pick.rig for pick in working])[:2]
    if rigs:
        rows.append(PackRow(kind="rig", label="Rig", value=_list(rigs)))
    primary = working[0]
    if primary.hook_size:
        rows.append(PackRow(kind="hook", label="Hook", value=primary.hook_size))
    if primary.sinker:
        sinker = primary.sinker
        if murky and "pyramid" not in sinker.lower():
            sinker += " — go heavier in rough surf"
        rows.append(PackRow(kind="weight", label="Weight", value=sinker))

    return PackForToday(
        headline="Tackle for " + _join_names([pick.name for pick in working]),
        rows=rows,
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
        species = for_region(species, region)
        if species.get("access", "shore") not in ("shore", "tidal"):
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
    picks: dict[str, list[tuple[float, SpeciesPick]]] = {
        "shore": [],
        "boat": [],
        "tidal": [],
    }
    for species in load_catalogue():
        if region not in species["regions"]:
            continue
        species = for_region(species, region)
        access = species.get("access", "shore")
        if access not in picks:  # bait fish and non-targets: never a pick
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
        picks[access].append(
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
                        *_spawn_reasons(species, month, water_temp_f),
                        *condition_reasons,
                    ],
                    explanation=explanation,
                    bait=species["bait"],
                    rig=species["rig"],
                    hook_size=species["hook_size"],
                    sinker=species["sinker"],
                    lures=species["lures"],
                    targets=species.get("targets", []),
                    regulation=(
                        regulation_for(species["id"], state, today or date.today())
                        if state
                        else None
                    ),
                ),
            )
        )

    # Stable: ties keep catalogue order (roughly most-targeted first).
    for pool in picks.values():
        pool.sort(key=lambda item: item[0], reverse=True)

    top_picks = [pick for _, pick in picks["shore"][:max_picks]]
    return FishingGuidance(
        basis=GuidanceBasis(
            water_temp_f=water_temp_f,
            water_temp_is_fallback=water_temp_is_fallback,
            month=month,
            region=region,
        ),
        species=top_picks,
        boat_species=[pick for _, pick in picks["boat"][:max_picks]],
        tidal_species=[pick for _, pick in picks["tidal"][:max_picks]],
        tackle_note=_tackle_note(wave_range_ft),
        pack=build_pack_for_today(
            top_picks,
            water_temp_f=water_temp_f,
            wind_range_kt=wind_range_kt,
            wave_range_ft=wave_range_ft,
            hour=hour,
        ),
        calendar=build_species_calendar(region, monthly_temps),
    )


def local_month(now: datetime, tz_name: str) -> int:
    """The calendar month at the location (a forecast at 11 PM Pacific on
    Oct 31 is an October forecast, even though it's Nov 1 in UTC)."""
    return now.astimezone(safe_zone(tz_name)).month
