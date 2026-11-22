"""The multi-day outlook: one fishability score per day of the NWS marine
zone forecast (usually 5 days), so a user can see which day is best.

Each day is scored by the same `score_conditions` the main forecast uses,
from that day's wind and seas (`MarineDay`, the day and night periods
combined), today's water temperature (it changes slowly), that day's
solunar rating, and the coast's onshore/offshore orientation. The
time-of-day bonus is deliberately left out (no `now`/`sun_times`): it
describes "right now", and would make today incomparable with the other
days. Each day also carries its moon phase, its high/low tides (the
tide predictions only cover the first few days, so later days have none)
and the NWS land forecast for that date (air temperature, sky, rain).
"""

from __future__ import annotations

from datetime import date, datetime, time, timedelta

from pydantic import BaseModel

from app.domain.models import Observation
from app.domain.scoring import STYLE_PROFILES, score_conditions, storm_level
from app.infra.timezones import safe_zone
from app.providers.astronomy import (
    SolunarPeriod,
    SolunarTimes,
    SunTimes,
    compute_solunar_times,
    compute_sun_times,
)
from app.providers.noaa_coops import TidePrediction
from app.providers.nws import MarineDay, WeatherDay


class DayTide(BaseModel):
    time: datetime
    kind: str
    height_ft: float


class DayWindow(BaseModel):
    """The best stretch of a day to fish: dawn or dusk (the low-light
    bites), whichever lines up with a tide turn or a solunar feeding
    period, with the reasons in plain words."""

    start: datetime
    end: datetime
    reasons: list[str]


_LOW_LIGHT = timedelta(hours=1)
_TURN_NEAR = timedelta(minutes=45)


def _overlaps(start: datetime, end: datetime, periods: list[SolunarPeriod]) -> bool:
    return any(p.start < end and p.end > start for p in periods)


def best_window(
    sun: SunTimes,
    tide_turns: list[TidePrediction],
    solunar: SolunarTimes,
    *,
    not_before: datetime | None = None,
    tz_name: str,
) -> DayWindow | None:
    """Dawn or dusk (an hour either side of sunrise or sunset), scored by a
    tide turn near it (2), a major solunar period overlapping it (1) or a
    minor one (0.5); dawn on a tie. Windows already over (*not_before*,
    for today) are skipped; None when both are."""
    zone = safe_zone(tz_name)
    best: tuple[float, DayWindow] | None = None
    for edge, name in ((sun.sunrise, "Dawn"), (sun.sunset, "Dusk")):
        start, end = edge - _LOW_LIGHT, edge + _LOW_LIGHT
        if not_before is not None and end <= not_before:
            continue
        points = 0.0
        reasons = [f"{name}, low light"]
        turn = next((t for t in tide_turns if abs(t.time - edge) <= _TURN_NEAR), None)
        if turn is not None:
            points += 2
            when = turn.time.astimezone(zone).strftime("%-I:%M %p")
            reasons.append(f"{turn.kind} tide turns at {when}")
        if _overlaps(start, end, solunar.major_periods):
            points += 1
            reasons.append("major feeding period")
        elif _overlaps(start, end, solunar.minor_periods):
            points += 0.5
            reasons.append("minor feeding period")
        window = DayWindow(start=start, end=end, reasons=reasons)
        if best is None or points > best[0]:
            best = (points, window)
    return best[1] if best else None


class DayScore(BaseModel):
    score: int | None
    verdict: str


class DayOutlook(BaseModel):
    date: date
    label: str  # "Today", "Tomorrow", then the weekday ("Fri")
    wind_range_kt: tuple[float, float] | None
    wind_direction: str | None
    wave_range_ft: tuple[float, float] | None
    score: int | None
    verdict: str
    moon_phase: str
    illumination_pct: float
    solunar_rating: str
    tides: list[DayTide]
    # The NWS land forecast for that date, when it covers it.
    high_f: float | None = None
    low_f: float | None = None
    sky: str | None = None
    short_forecast: str | None = None
    precip_pct: int | None = None
    # The day's score and verdict for each way of fishing (surf, pier,
    # kayak...); `score`/`verdict` are the surf ones.
    score_by_style: dict[str, DayScore] = {}
    # The best stretch of the day to go (`best_window`).
    best_window: DayWindow | None = None


def _label(index: int, day: date) -> str:
    if index == 0:
        return "Today"
    if index == 1:
        return "Tomorrow"
    return day.strftime("%a")


def build_day_outlook(
    days: list[MarineDay],
    *,
    now: datetime,
    tz_name: str,
    lat: float,
    lng: float,
    coast: str,
    water_temperature: Observation | None,
    tide_predictions: list[TidePrediction] | None,
    weather_days: list[WeatherDay] | None = None,
    fish_in_season: tuple[int, int] | None = None,
    tide_strength: dict[date, float] | None = None,
) -> list[DayOutlook]:
    zone = safe_zone(tz_name)
    today = now.astimezone(zone).date()
    weather_by_date = {entry.date: entry for entry in weather_days or []}
    out: list[DayOutlook] = []
    for index, marine in enumerate(days):
        day = today + timedelta(days=index)
        noon = datetime.combine(day, time(12), tzinfo=zone)
        solunar = compute_solunar_times(noon, lat, lng, tz_name)
        # That day's tide turns (the predictions cover the first few days)
        # against that day's sunrise and sunset, and its tide size.
        sun = compute_sun_times(noon, lat, lng, tz_name)
        turns = [
            p.time
            for p in tide_predictions or []
            if p.time.astimezone(zone).date() == day
        ]
        wind = (
            (marine.wind_low_kt, marine.wind_high_kt)
            if marine.wind_low_kt is not None and marine.wind_high_kt is not None
            else None
        )
        waves = (
            (marine.wave_low_ft, marine.wave_high_ft)
            if marine.wave_low_ft is not None and marine.wave_high_ft is not None
            else None
        )
        weather = weather_by_date.get(day)
        by_style = {
            style: score_conditions(
                wind,
                waves,
                wind_direction=marine.wind_direction,
                water_temperature=water_temperature,
                solunar=solunar,
                coast=coast,
                storms=storm_level(
                    weather.short_forecast if weather else None,
                    weather.precip_pct if weather else None,
                )
                == "likely",
                storm_chance=storm_level(
                    weather.short_forecast if weather else None,
                    weather.precip_pct if weather else None,
                ),
                precip_pct=weather.precip_pct if weather else None,
                sky=weather.sky if weather else None,
                fish_in_season=fish_in_season,
                style=style,
                sun_times=sun,
                tide_turns=turns,
                tide_strength=(tide_strength or {}).get(day),
            )
            for style in STYLE_PROFILES
        }
        score = by_style["surf"]
        out.append(
            DayOutlook(
                high_f=weather.high_f if weather else None,
                low_f=weather.low_f if weather else None,
                sky=weather.sky if weather else None,
                short_forecast=weather.short_forecast if weather else None,
                precip_pct=weather.precip_pct if weather else None,
                date=day,
                label=_label(index, day),
                wind_range_kt=wind,
                wind_direction=marine.wind_direction,
                wave_range_ft=waves,
                score=score.score,
                verdict=score.verdict.value,
                best_window=best_window(
                    sun,
                    [
                        p
                        for p in tide_predictions or []
                        if p.time.astimezone(zone).date() == day
                    ],
                    solunar,
                    not_before=now if index == 0 else None,
                    tz_name=tz_name,
                ),
                score_by_style={
                    style: DayScore(score=result.score, verdict=result.verdict.value)
                    for style, result in by_style.items()
                },
                moon_phase=solunar.moon_phase.value,
                illumination_pct=solunar.illumination_pct,
                solunar_rating=solunar.rating.value,
                tides=[
                    DayTide(time=p.time, kind=p.kind, height_ft=p.height_ft)
                    for p in tide_predictions or []
                    if p.time.astimezone(zone).date() == day
                ],
            )
        )
    return out
