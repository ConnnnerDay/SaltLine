"""Forecast scoring (sprint 22).

Ports the core of the legacy `domain/forecast.py:score_conditions` — the
0-100 go/no-go index with an ordered, plain-language explanation — and
`domain/species.py`'s wind-orientation/onshore-offshore-direction
helpers it depends on. Per docs/R1_RECONCILIATION_AUDIT.md, this is an
adapt, not a verbatim carry-over.

This module is the reconciliation point sprint 21 (forecast assembly)
explicitly deferred: it takes a single already-reconciled `wind_range`/
`wave_range`, not sprint 21's `ForecastConditions` with its two
still-separate NWS/NDBC readings. Callers (a future wiring step, not
this sprint's job — see docs/CANONICAL_ROADMAP.md's sprint ledger)
decide how to pick one source over the other; this module only knows
how to score a range once it has one. Scoring is therefore independent
of `app.domain.assembly`, matching the pattern of every sprint in this
recovery owning one self-contained, independently testable unit.

Ported components: wind speed, wave height, wind direction (onshore/
offshore by coastline orientation — `wind_orientation_for_region`/
`onshore_offshore_dirs` are legacy's "single authoritative" mapping,
carried over verbatim per its own docstring's warning not to
reimplement it elsewhere), water temperature comfort band (with a
small bonus for a live, non-fallback reading), dawn/dusk light-window
bonus, and solunar rating/illumination bonus. All thresholds, point
values, and verdict tiers are unchanged from the legacy function.

Deliberately not ported, each requiring an input this recovery hasn't
built yet:

- Tide state/range/turn-proximity bonuses — need tide predictions,
  which sprint 21 explicitly didn't fetch (sprint 34's job).
- Fishing-type-specific modifiers (kayak/fly/wade/jetty/bridge/
  charter/offshore) and angler comfort thresholds
  (`max_wind_kt`/`max_wave_ft`) — both need user preferences data,
  which doesn't exist yet (sprint 36, "Preferences").
- Water-quality (harmful-algal-bloom / dissolved-oxygen) signals from
  `services/datagov.py` — R1_RECONCILIATION_AUDIT.md flagged whether
  that service is future enrichment or scope creep as a still-open
  product question; porting it here without that answer would be
  exactly the kind of unsupported invention this recovery exists to
  stop doing.
"""

from __future__ import annotations

from datetime import datetime, timedelta
from enum import Enum

from pydantic import BaseModel

from app.domain.models import Observation
from app.providers.astronomy import SolunarTimes, SunTimes

_SCORE_BASELINE = 50.0

_WIND_LIGHT_KT = 8
_WIND_MODERATE_LOW_KT = 12
_WIND_MODERATE_HIGH_KT = 16
_WIND_STRONG_KT = 20
_WIND_VERY_STRONG_KT = 25

_WAVE_FLAT_FT = 1.5
_WAVE_MODERATE_FT = 3.0
_WAVE_ROUGH_FT = 5.0
_WAVE_HEAVY_FT = 7.0

_VERDICT_EXCELLENT = 80
_VERDICT_GOOD = 64
_VERDICT_FAIR = 48
_VERDICT_CHALLENGING = 32

_DAWN_DUSK_WINDOW = timedelta(hours=2)

_ONSHORE_DIRS_EAST = {"S", "SE", "E", "SSE", "ESE", "SSW", "ENE", "NE"}
_OFFSHORE_DIRS_EAST = {"N", "NW", "W", "NNW", "WNW", "NNE"}
_ONSHORE_DIRS_WEST = {"W", "NW", "SW", "WNW", "WSW", "NNW", "SSW"}
_OFFSHORE_DIRS_WEST = {"E", "NE", "SE", "ENE", "ESE", "NNE", "SSE"}
_ONSHORE_DIRS_GULF = {"S", "SSW", "SW", "SSE", "SE", "WSW", "ESE"}
_OFFSHORE_DIRS_GULF = {"N", "NNE", "NE", "NNW", "NW", "ENE", "WNW"}

# Hawaii (and any island/omnidirectional coast): onshore/offshore is
# ambiguous because the shore faces every direction, so no wind-direction
# bonus or penalty applies rather than guessing.
_DIRS_BY_ORIENTATION: dict[str, tuple[set[str], set[str]]] = {
    "east": (_ONSHORE_DIRS_EAST, _OFFSHORE_DIRS_EAST),
    "west": (_ONSHORE_DIRS_WEST, _OFFSHORE_DIRS_WEST),
    "gulf": (_ONSHORE_DIRS_GULF, _OFFSHORE_DIRS_GULF),
    "hawaii": (set(), set()),
}

_SOLUNAR_RATING_BONUS = {"Excellent": 8, "Good": 4, "Fair": 0, "Poor": -6}

# NWS alerts that make the shore unsafe: the day is Poor whatever else
# it has going for it.
_DANGEROUS_ALERTS = (
    "gale warning",
    "storm warning",
    "hurricane",
    "tropical storm",
    "special marine warning",
    "storm surge",
    "tsunami",
)
# Alerts that cost points: (event substring, impact, description).
_HAZARD_ALERTS: tuple[tuple[str, float, str], ...] = (
    ("high surf warning", -14, "High Surf Warning in effect"),
    ("high surf advisory", -7, "High Surf Advisory in effect"),
    ("coastal flood warning", -6, "Coastal Flood Warning in effect"),
    ("wind advisory", -5, "Wind Advisory in effect"),
    ("small craft advisory", -4, "Small Craft Advisory in effect"),
    ("freeze warning", -4, "Freeze Warning in effect"),
    ("hard freeze", -4, "Freeze Warning in effect"),
    ("excessive heat", -4, "Heat warning in effect"),
    ("heat advisory", -2, "Heat Advisory in effect"),
    ("dense fog", -3, "Dense Fog Advisory in effect"),
    ("rip current", -2, "Rip currents: stay out of the water"),
    ("beach hazards", -2, "Beach Hazards Statement in effect"),
)


class ScoreVerdict(str, Enum):
    EXCELLENT = "Excellent"
    GOOD = "Good"
    FAIR = "Fair"
    CHALLENGING = "Challenging"
    POOR = "Poor"
    UNKNOWN = "Unknown"


class ScoreFactor(BaseModel):
    impact: float
    description: str


class ForecastScore(BaseModel):
    """`score`/`verdict` are `None`/`UNKNOWN` when neither wind nor wave
    data is available — there's nothing defensible to score.
    """

    score: int | None
    verdict: ScoreVerdict
    factors: list[ScoreFactor]
    summary: str


def wind_orientation_for_region(conditions_region: str) -> str:
    """The coastline orientation used for wind-direction scoring, from a
    location's `conditions_region` (sprint 19's `CuratedLocation`/
    `ResolvedLocation` field). Ported from the legacy
    `domain/forecast.py:_wind_orientation` — kept distinct from that
    module's separate `_derive_coast` (which folds the Gulf into
    `"east"` for species selection): a south-facing Gulf shore has
    different onshore/offshore winds than an east-facing Atlantic one,
    so the Gulf stays its own orientation here.
    """
    cr = conditions_region or ""
    if cr.startswith("pacific"):
        return "west"
    if cr.startswith("gulf"):
        return "gulf"
    if cr.startswith("hawaii"):
        return "hawaii"
    return "east"


_COMPASS_16 = (
    "N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
    "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW",
)  # fmt: skip


def wind_orientation_for(location: object) -> str:
    """The orientation to score wind against: "facing:<deg>" when the spot
    knows which way its beach faces (Naples faces west, Malibu south),
    else its region's coast (`wind_orientation_for_region`)."""
    facing = getattr(location, "shore_facing_deg", None)
    if facing is not None:
        return f"facing:{int(facing) % 360}"
    return wind_orientation_for_region(str(getattr(location, "conditions_region", "")))


def facing_bearing(orientation: str) -> int | None:
    if orientation.startswith("facing:"):
        return int(orientation.split(":", 1)[1])
    return None


def onshore_offshore_dirs(orientation: str) -> tuple[set[str], set[str]]:
    """Return `(onshore_dirs, offshore_dirs)` for a coastline
    orientation. "facing:<deg>": wind from within 67.5° of the way the
    beach faces is onshore, from within 67.5° of the opposite way
    offshore, the rest along the shore. Unknown values fall back to the
    east-facing (Atlantic) sets.
    """
    facing = facing_bearing(orientation)
    if facing is not None:
        onshore: set[str] = set()
        offshore: set[str] = set()
        for index, name in enumerate(_COMPASS_16):
            off_by = abs((index * 22.5 - facing + 180) % 360 - 180)
            if off_by <= 67.5:
                onshore.add(name)
            elif off_by >= 112.5:
                offshore.add(name)
        return onshore, offshore
    return _DIRS_BY_ORIENTATION.get(orientation, _DIRS_BY_ORIENTATION["east"])


def _sentence(parts: list[str]) -> str:
    """The top factors as one sentence: "Moderate surf (2–5 ft), onshore
    wind (NE) bringing murkier water, a dusk bite window and a good
    solunar period." Factor descriptions are written as capitalized
    labels; only the first keeps its capital here."""
    if not parts:
        return ""
    words = [parts[0], *(p[:1].lower() + p[1:] for p in parts[1:])]
    body = words[0] if len(words) == 1 else f"{', '.join(words[:-1])} and {words[-1]}"
    return f"{body}."


def _range_label(
    values: tuple[float, float] | list[float], unit: str, step: float
) -> str:
    """ "10–13 kt", or "4 ft" when both ends round the same -- rounded to
    *step* rather than truncated (4.5 ft stays 4.5, never "4-4 ft")."""

    def fmt(value: float) -> str:
        rounded = round(value / step) * step
        return f"{rounded:g}"

    low, high = fmt(values[0]), fmt(values[1])
    return f"{low} {unit}" if low == high else f"{low}–{high} {unit}"


def score_conditions(
    wind_range: tuple[float, float] | None,
    wave_range: tuple[float, float] | None,
    *,
    wind_direction: str | None = None,
    water_temperature: Observation | None = None,
    sun_times: SunTimes | None = None,
    now: datetime | None = None,
    solunar: SolunarTimes | None = None,
    coast: str = "east",
    pressure_trend: str | None = None,
    storms: bool = False,
    precip_pct: int | None = None,
    alerts: list[str] | None = None,
    water_temp_normal_f: float | None = None,
    sky: str | None = None,
    rip_current_risk: str | None = None,
    wind_gust_kt: float | None = None,
    swell: list[tuple[float, int]] | None = None,
    air_temp_f: float | None = None,
    water_temp_change_24h: float | None = None,
    fish_in_season: tuple[int, int] | None = None,
) -> ForecastScore:
    """Score fishability from the marine and astronomical signals given.

    Returns `ForecastScore(score=None, verdict=UNKNOWN, ...)` if neither
    *wind_range* nor *wave_range* is available — the legacy function's
    behavior for "conditions unknown."

    Beyond wind, surf and the sun and moon, the day also reads the
    barometer's 3-hour *pressure_trend* ("falling", "rising rapidly"...),
    thunderstorms (*storms*: the day is at best Challenging), the chance
    of rain, NWS *alerts* by event name (a gale, storm or hurricane
    warning makes it Poor) and the water against this month's normal.
    """
    if wind_range is None or wave_range is None:
        return ForecastScore(
            score=None, verdict=ScoreVerdict.UNKNOWN, factors=[], summary=""
        )

    score = _SCORE_BASELINE
    wind_max = wind_range[1]
    wave_max = wave_range[1]
    factors: list[ScoreFactor] = []

    wind_lbl = _range_label(wind_range, "kt", step=1.0)
    wave_lbl = _range_label(wave_range, "ft", step=0.5)

    if wind_max <= _WIND_LIGHT_KT:
        score += 14
        factors.append(ScoreFactor(impact=14, description=f"Light wind ({wind_lbl})"))
    elif wind_max <= _WIND_MODERATE_LOW_KT:
        score += 8
        factors.append(ScoreFactor(impact=8, description=f"Moderate wind ({wind_lbl})"))
    elif wind_max <= _WIND_MODERATE_HIGH_KT:
        score += 2
        factors.append(ScoreFactor(impact=2, description=f"Breezy ({wind_lbl})"))
    elif wind_max <= _WIND_STRONG_KT:
        score -= 8
        factors.append(ScoreFactor(impact=-8, description=f"Strong wind ({wind_lbl})"))
    elif wind_max <= _WIND_VERY_STRONG_KT:
        score -= 16
        factors.append(
            ScoreFactor(impact=-16, description=f"Very strong wind ({wind_lbl})")
        )
    else:
        score -= 26
        factors.append(
            ScoreFactor(impact=-26, description=f"Gale-force wind ({wind_lbl})")
        )

    if wave_max <= _WAVE_FLAT_FT:
        score += 10
        factors.append(ScoreFactor(impact=10, description=f"Flat surf ({wave_lbl})"))
    elif wave_max <= _WAVE_MODERATE_FT:
        score += 6
        factors.append(ScoreFactor(impact=6, description=f"Light surf ({wave_lbl})"))
    elif wave_max <= _WAVE_ROUGH_FT:
        score -= 4
        factors.append(
            ScoreFactor(impact=-4, description=f"Moderate surf ({wave_lbl})")
        )
    elif wave_max <= _WAVE_HEAVY_FT:
        score -= 12
        factors.append(ScoreFactor(impact=-12, description=f"Rough surf ({wave_lbl})"))
    else:
        score -= 22
        factors.append(ScoreFactor(impact=-22, description=f"Heavy surf ({wave_lbl})"))

    if wind_direction:
        onshore_dirs, offshore_dirs = onshore_offshore_dirs(coast)
        # Offshore wind flattens and clears the water, but only up to a
        # breeze: past that it's blowing casts back and lines off the bottom,
        # and the wind penalty above already says so.
        if wind_direction in offshore_dirs and wind_max <= _WIND_MODERATE_HIGH_KT:
            score += 4
            factors.append(
                ScoreFactor(
                    impact=4, description=f"Clean offshore wind ({wind_direction})"
                )
            )
        elif wind_direction in onshore_dirs:
            score -= 4
            factors.append(
                ScoreFactor(
                    impact=-4,
                    description=f"Onshore wind ({wind_direction}) bringing murkier water",
                )
            )

    # How good the season is right now: the fish that are in season and in
    # their best water today, as (working, picks) -- working picks score
    # Good or better, picks is everything in range. Relative to the season,
    # so a January day full of winter fish isn't marked down for being
    # cold. Without it (no guidance), the old fixed water-temperature bands.
    if fish_in_season is not None:
        working, picks = fish_in_season
        temp_label = (
            f" at {water_temperature.value:.0f}°F"
            if water_temperature is not None
            else ""
        )
        if working >= 3:
            score += 6
            factors.append(
                ScoreFactor(
                    impact=6,
                    description=f"Good season: {working} fish in their best water{temp_label}",
                )
            )
        elif working >= 1:
            score += 2
            factors.append(
                ScoreFactor(
                    impact=2,
                    description=f"{working} fish in their best water{temp_label}",
                )
            )
        elif picks >= 1:
            score -= 2
            factors.append(
                ScoreFactor(
                    impact=-2,
                    description=f"Slow season: few fish in their best water{temp_label}",
                )
            )
        else:
            score -= 6
            factors.append(
                ScoreFactor(
                    impact=-6, description=f"Almost nothing in season{temp_label}"
                )
            )
        if water_temperature is not None and not water_temperature.is_fallback:
            score += 1
    elif water_temperature is not None:
        temp_f = water_temperature.value
        if 58 <= temp_f <= 78:
            score += 6
            factors.append(
                ScoreFactor(impact=6, description=f"Ideal water temp ({temp_f:.0f}°F)")
            )
        elif 50 <= temp_f < 58 or 78 < temp_f <= 84:
            score += 2
            factors.append(
                ScoreFactor(impact=2, description=f"Fair water temp ({temp_f:.0f}°F)")
            )
        else:
            score -= 4
            factors.append(
                ScoreFactor(
                    impact=-4, description=f"Off-peak water temp ({temp_f:.0f}°F)"
                )
            )
        if not water_temperature.is_fallback:
            score += 1

    if now and sun_times:
        if abs(now - sun_times.sunrise) <= _DAWN_DUSK_WINDOW:
            score += 4
            factors.append(ScoreFactor(impact=4, description="Dawn bite window"))
        if abs(sun_times.sunset - now) <= _DAWN_DUSK_WINDOW:
            score += 4
            factors.append(ScoreFactor(impact=4, description="Dusk bite window"))

    if solunar:
        score += _SOLUNAR_RATING_BONUS.get(solunar.rating.value, 0)
        if solunar.rating.value == "Excellent":
            factors.append(
                ScoreFactor(impact=8, description="Major feeding window (solunar)")
            )
        elif solunar.rating.value == "Good":
            factors.append(ScoreFactor(impact=4, description="Good solunar period"))
        elif solunar.rating.value == "Poor":
            factors.append(ScoreFactor(impact=-6, description="Weak solunar period"))

        illum = solunar.illumination_pct
        if 40 <= illum <= 85:
            score += 2
        elif illum < 10 or illum > 95:
            score += 1

    if pressure_trend:
        # The pre-front bite is before the weather turns: once the wind is
        # strong or storms are here, falling pressure is just the storm.
        if (
            pressure_trend.startswith("falling")
            and wind_max <= _WIND_STRONG_KT
            and not storms
        ):
            score += 4
            factors.append(
                ScoreFactor(
                    impact=4,
                    description="Falling pressure: fish often feed ahead of a front",
                )
            )
        elif pressure_trend == "rising rapidly":
            score -= 6
            factors.append(
                ScoreFactor(
                    impact=-6,
                    description="Pressure rising fast behind a front: the bite often slows",
                )
            )
        elif pressure_trend.startswith("rising"):
            score -= 2
            factors.append(
                ScoreFactor(impact=-2, description="Rising pressure after a front")
            )

    if water_temperature is not None and water_temp_normal_f is not None:
        below = water_temp_normal_f - water_temperature.value
        if below >= 5:
            score -= 5
            factors.append(
                ScoreFactor(
                    impact=-5,
                    description=f"Water {below:.0f}°F colder than normal: a cold snap slows the bite",
                )
            )

    # Gusts well above the forecast range: hard casting, a bowed line.
    if wind_gust_kt is not None and wind_gust_kt >= 25 and wind_gust_kt > wind_max + 5:
        score -= 4
        factors.append(
            ScoreFactor(impact=-4, description=f"Gusts to {wind_gust_kt:.0f} kt")
        )

    # Long-period groundswell (12 s+) of any size breaks hard on the beach:
    # heavy shorebreak that rolls sinkers and tangles lines.
    big_groundswell = [
        (height, period)
        for height, period in swell or []
        if period >= 12 and height >= 3
    ]
    if big_groundswell:
        height, period = max(big_groundswell)
        score -= 4
        factors.append(
            ScoreFactor(
                impact=-4,
                description=f"{height:g} ft groundswell at {period} s: heavy shorebreak",
            )
        )

    risk = (rip_current_risk or "").lower()
    if risk.startswith("high"):
        score -= 4
        factors.append(
            ScoreFactor(
                impact=-4, description="High rip current risk: stay out of the water"
            )
        )
    elif risk.startswith("moderate"):
        score -= 1
        factors.append(ScoreFactor(impact=-1, description="Moderate rip current risk"))

    if air_temp_f is not None and air_temp_f <= 32:
        score -= 3
        factors.append(
            ScoreFactor(
                impact=-3,
                description=f"Freezing air ({air_temp_f:.0f}°F): iced guides, cold hands",
            )
        )

    # Cloud cover: fish feed more boldly without bright sun on the water.
    if sky == "cloudy":
        score += 3
        factors.append(
            ScoreFactor(
                impact=3, description="Overcast: fish feed more boldly out of the glare"
            )
        )
    elif sky == "snow":
        score -= 6
        factors.append(
            ScoreFactor(impact=-6, description="Snow or ice in the forecast")
        )

    # A quick drop (upwelling, a front stirring the water) shuts fish down
    # for a day or two; cool water warming up turns them on.
    if water_temp_change_24h is not None:
        if water_temp_change_24h <= -3:
            score -= 5
            factors.append(
                ScoreFactor(
                    impact=-5,
                    description=f"Water dropped {-water_temp_change_24h:g}°F since yesterday: fish slow down",
                )
            )
        elif (
            water_temp_change_24h >= 2
            and water_temperature is not None
            and water_temperature.value < 70
        ):
            score += 3
            factors.append(
                ScoreFactor(
                    impact=3,
                    description=f"Water warmed {water_temp_change_24h:g}°F since yesterday: fish turn on",
                )
            )

    if precip_pct is not None and precip_pct >= 60 and not storms:
        score -= 3
        factors.append(
            ScoreFactor(impact=-3, description=f"Rain likely ({precip_pct}%)")
        )
    if storms:
        score -= 15
        factors.append(
            ScoreFactor(impact=-15, description="Thunderstorms in the forecast")
        )

    dangerous: str | None = None
    for event in alerts or []:
        low = event.lower()
        if any(name in low for name in _DANGEROUS_ALERTS):
            dangerous = dangerous or event
            continue
        if "rip current" in low and any(
            "rip current" in f.description.lower() for f in factors
        ):
            continue  # the surf zone forecast's own risk already counts
        for name, impact, description in _HAZARD_ALERTS:
            if name in low and not any(f.description == description for f in factors):
                score += impact
                factors.append(ScoreFactor(impact=impact, description=description))
    if dangerous:
        factors.append(ScoreFactor(impact=-50, description=f"{dangerous} in effect"))

    score = max(0.0, min(100.0, score))
    # Safety caps: a dangerous alert makes the day Poor; thunderstorms
    # keep it out of Fair or better, whatever the fish are doing.
    if dangerous:
        score = min(score, _VERDICT_CHALLENGING - 1)
    elif storms:
        score = min(score, _VERDICT_FAIR - 1)
    if score >= _VERDICT_EXCELLENT:
        verdict = ScoreVerdict.EXCELLENT
    elif score >= _VERDICT_GOOD:
        verdict = ScoreVerdict.GOOD
    elif score >= _VERDICT_FAIR:
        verdict = ScoreVerdict.FAIR
    elif score >= _VERDICT_CHALLENGING:
        verdict = ScoreVerdict.CHALLENGING
    else:
        verdict = ScoreVerdict.POOR

    factors.sort(key=lambda f: -abs(f.impact))
    summary = _sentence([f.description for f in factors[:4]])

    return ForecastScore(
        score=round(score), verdict=verdict, factors=factors, summary=summary
    )
