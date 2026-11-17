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
from app.domain.scoring import score_conditions
from app.infra.timezones import safe_zone
from app.providers.astronomy import compute_solunar_times
from app.providers.noaa_coops import TidePrediction
from app.providers.nws import MarineDay, WeatherDay


class DayTide(BaseModel):
    time: datetime
    kind: str
    height_ft: float


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
) -> list[DayOutlook]:
    zone = safe_zone(tz_name)
    today = now.astimezone(zone).date()
    weather_by_date = {entry.date: entry for entry in weather_days or []}
    out: list[DayOutlook] = []
    for index, marine in enumerate(days):
        day = today + timedelta(days=index)
        noon = datetime.combine(day, time(12), tzinfo=zone)
        solunar = compute_solunar_times(noon, lat, lng, tz_name)
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
        score = score_conditions(
            wind,
            waves,
            wind_direction=marine.wind_direction,
            water_temperature=water_temperature,
            solunar=solunar,
            coast=coast,
        )
        weather = weather_by_date.get(day)
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
