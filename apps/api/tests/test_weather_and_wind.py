from datetime import UTC, date, datetime

from app.domain.outlook import build_day_outlook
from app.domain.wind import wind_effect_for
from app.providers.nws import (
    MarineDay,
    WeatherDay,
    parse_point_weather,
    parse_wave_detail,
    sky_category,
)


def _period(
    name: str, start: str, day: bool, temp: int, text: str, pop: int | None
) -> dict:
    return {
        "name": name,
        "startTime": start,
        "isDaytime": day,
        "temperature": temp,
        "shortForecast": text,
        "probabilityOfPrecipitation": {"value": pop},
    }


def test_parse_point_weather_groups_days_and_keeps_now() -> None:
    weather = parse_point_weather(
        [
            _period(
                "This Afternoon", "2026-11-17T14:00:00-05:00", True, 60, "Sunny", 0
            ),
            _period(
                "Tonight", "2026-11-17T18:00:00-05:00", False, 50, "Mostly Clear", None
            ),
            _period(
                "Wednesday", "2026-11-18T06:00:00-05:00", True, 66, "Chance Showers", 40
            ),
            _period(
                "Wednesday Night",
                "2026-11-18T18:00:00-05:00",
                False,
                56,
                "Showers Likely",
                60,
            ),
        ]
    )
    assert weather.now is not None
    assert (weather.now.temperature_f, weather.now.sky) == (60, "clear")
    today, wed = weather.days
    assert (today.date, today.high_f, today.low_f, today.precip_pct) == (
        date(2026, 11, 17),
        60,
        50,
        0,
    )
    # A day's sky comes from its daytime period; rain chance is the day's worst.
    assert (wed.short_forecast, wed.sky, wed.precip_pct) == (
        "Chance Showers",
        "rain",
        60,
    )


def test_sky_category_takes_the_most_severe_match() -> None:
    assert sky_category("Showers And Thunderstorms Likely") == "storm"
    assert sky_category("Mostly Cloudy") == "cloudy"
    assert sky_category("Mostly Sunny") == "partly"
    assert sky_category("Patchy Fog") == "fog"
    assert sky_category("Something New") == "unknown"


def test_parse_wave_detail_largest_first() -> None:
    swell = parse_wave_detail(
        "NE winds 10 kt. Seas 2 to 4 ft. Wave Detail: N 3 ft at 4 seconds and "
        "SE 1 ft at 8 seconds. Adjacent sounds a light chop."
    )
    assert [(s.direction, s.height_ft, s.period_s) for s in swell] == [
        ("N", 3, 4),
        ("SE", 1, 8),
    ]
    assert parse_wave_detail("Seas 2 ft.") == []


def test_wind_effect_per_coast() -> None:
    assert wind_effect_for("east", "NE").relation == "onshore"
    assert wind_effect_for("east", "W").relation == "offshore"
    assert wind_effect_for("west", "E").relation == "offshore"
    assert wind_effect_for("gulf", "S").relation == "onshore"
    east = wind_effect_for("east", None)
    assert (east.sea_bearing, east.relation) == (90, None)
    island = wind_effect_for("hawaii", "NE")
    assert (island.sea_bearing, island.relation) == (None, None)


def test_day_outlook_carries_that_dates_weather() -> None:
    out = build_day_outlook(
        [
            MarineDay(
                label="Rest Of Today",
                wind_low_kt=5,
                wind_high_kt=10,
                wave_low_ft=1,
                wave_high_ft=2,
            )
        ],
        now=datetime(2026, 11, 17, 15, tzinfo=UTC),
        tz_name="America/New_York",
        lat=34.2,
        lng=-77.8,
        coast="east",
        water_temperature=None,
        tide_predictions=None,
        weather_days=[
            WeatherDay(
                date=date(2026, 11, 17),
                high_f=60,
                low_f=50,
                sky="clear",
                short_forecast="Sunny",
                precip_pct=0,
            )
        ],
    )
    assert (out[0].high_f, out[0].low_f, out[0].sky, out[0].precip_pct) == (
        60,
        50,
        "clear",
        0,
    )


def test_parse_barometer_trend_and_hourly_history() -> None:
    from app.providers.nws import parse_barometer

    def obs(hour: int, minute: int, pa: float | None) -> dict:
        return {
            "timestamp": f"2026-11-17T{hour:02d}:{minute:02d}:00+00:00",
            "barometricPressure": {"value": pa},
        }

    falling = parse_barometer(
        [
            obs(12, 0, 102000),
            obs(13, 0, 101900),
            obs(14, 0, 101800),
            obs(15, 0, 101650),
            obs(15, 20, None),
        ],
        "KILM",
        "Wilmington",
    )
    assert falling is not None
    assert (falling.latest_mb, falling.change_3h_mb, falling.trend) == (
        1016.5,
        -3.5,
        "falling rapidly",
    )
    assert [p.mb for p in falling.history] == [1020.0, 1019.0, 1018.0, 1016.5]

    steady = parse_barometer([obs(12, 0, 101300), obs(15, 0, 101350)], "K", "K")
    assert steady is not None and steady.trend == "steady"
    # Less than 3 hours of data: no change claimed.
    short = parse_barometer([obs(14, 0, 101300), obs(15, 0, 101500)], "K", "K")
    assert short is not None and (short.change_3h_mb, short.trend) == (None, "steady")
    assert parse_barometer([obs(15, 0, None)], "K", "K") is None


def test_parse_wave_detail_names_each_train_once() -> None:
    swell = parse_wave_detail(
        "Seas 4 to 6 ft. Wave Detail: W 2 ft at 12 seconds and W 4 ft at 12 seconds"
        " and SW 1 ft at 5 seconds."
    )
    assert [(c.direction, c.height_ft, c.period_s) for c in swell] == [
        ("W", 4.0, 12),
        ("SW", 1.0, 5),
    ]
