from datetime import UTC, datetime

from app.domain.outlook import build_day_outlook
from app.providers.noaa_coops import TidePrediction
from app.providers.nws import MarineDay


def test_day_outlook_scores_each_day_and_splits_tides_by_local_date() -> None:
    days = [
        MarineDay(
            label="Rest Of Today",
            wind_low_kt=5,
            wind_high_kt=10,
            wave_low_ft=1,
            wave_high_ft=2,
        ),
        MarineDay(
            label="Wed", wind_low_kt=25, wind_high_kt=30, wave_low_ft=8, wave_high_ft=10
        ),
        MarineDay(label="Thu"),
    ]
    tides = [
        TidePrediction(
            time=datetime(2026, 11, 17, 17, tzinfo=UTC), kind="high", height_ft=4.0
        ),
        # 03:00 UTC on the 18th is still the 17th in New York.
        TidePrediction(
            time=datetime(2026, 11, 18, 3, tzinfo=UTC), kind="low", height_ft=0.5
        ),
        TidePrediction(
            time=datetime(2026, 11, 18, 18, tzinfo=UTC), kind="high", height_ft=3.8
        ),
    ]
    out = build_day_outlook(
        days,
        now=datetime(2026, 11, 17, 15, tzinfo=UTC),
        tz_name="America/New_York",
        lat=34.2,
        lng=-77.8,
        coast="east",
        water_temperature=None,
        tide_predictions=tides,
    )
    assert [day.label for day in out] == ["Today", "Tomorrow", "Thu"]
    assert str(out[0].date) == "2026-11-17"
    calm, rough, unknown = out
    assert (
        calm.score is not None and rough.score is not None and calm.score > rough.score
    )
    assert unknown.score is None and unknown.verdict == "Unknown"
    assert [t.kind for t in calm.tides] == ["high", "low"]
    assert [t.kind for t in rough.tides] == ["high"]
    assert calm.moon_phase and calm.solunar_rating


def test_each_outlook_day_gets_its_own_tide_factors_and_style_scores() -> None:
    from datetime import date

    from app.providers.astronomy import compute_sun_times

    calm = MarineDay(
        label="Wed", wind_low_kt=5, wind_high_kt=8, wave_low_ft=1, wave_high_ft=2
    )
    sunrise = compute_sun_times(
        datetime(2026, 11, 18, 17, tzinfo=UTC), 34.2, -77.8, "America/New_York"
    ).sunrise
    tides = [TidePrediction(time=sunrise, kind="high", height_ft=4.0)]  # turns at dawn
    kwargs = {
        "now": datetime(2026, 11, 17, 15, tzinfo=UTC),
        "tz_name": "America/New_York",
        "lat": 34.2,
        "lng": -77.8,
        "coast": "east",
        "water_temperature": None,
        "tide_predictions": tides,
    }
    plain = build_day_outlook([calm, calm], **kwargs)  # type: ignore[arg-type]
    tidal = build_day_outlook(
        [calm, calm],
        tide_strength={date(2026, 11, 18): 1.4},
        **kwargs,  # type: ignore[arg-type]
    )
    no_turns = build_day_outlook(
        [calm, calm],
        **{**kwargs, "tide_predictions": []},  # type: ignore[arg-type]
    )
    # Tomorrow's tide turns at dawn (+3 for every style); today's doesn't.
    assert plain[0].score == no_turns[0].score
    assert (plain[1].score or 0) - (no_turns[1].score or 0) == 3
    # Tomorrow is a big tide: surf +2, bridge +5, kayak -3; today unchanged.
    assert tidal[0].score == plain[0].score
    gain = {
        style: (tidal[1].score_by_style[style].score or 0)
        - (plain[1].score_by_style[style].score or 0)
        for style in ("surf", "bridge", "kayak")
    }
    assert gain == {"surf": 2, "bridge": 5, "kayak": -3}


def test_best_window_prefers_the_low_light_edge_with_a_tide_turn() -> None:
    from datetime import timedelta

    from app.domain.outlook import best_window
    from app.providers.astronomy import (
        MoonPhaseName,
        SolunarPeriod,
        SolunarRating,
        SolunarTimes,
        SunTimes,
    )

    rise = datetime(2026, 11, 18, 11, 50, tzinfo=UTC)  # 6:50 AM in New York
    sun = SunTimes(sunrise=rise, sunset=rise + timedelta(hours=10))
    quiet = SolunarTimes(
        major_periods=[],
        minor_periods=[],
        moon_phase=MoonPhaseName.FULL,
        illumination_pct=99,
        rating=SolunarRating.GOOD,
    )
    dusk_turn = [
        TidePrediction(
            time=sun.sunset + timedelta(minutes=20), kind="low", height_ft=0.3
        )
    ]
    window = best_window(sun, dusk_turn, quiet, tz_name="America/New_York")
    assert window is not None
    assert window.reasons[0] == "Dusk, low light"
    assert "low tide turns at 5:10 PM" in window.reasons

    # A major feeding period at dawn, no turns: dawn wins.
    dawn_major = quiet.model_copy(
        update={
            "major_periods": [SolunarPeriod(start=rise, end=rise + timedelta(hours=2))]
        }
    )
    window = best_window(sun, [], dawn_major, tz_name="America/New_York")
    assert window is not None and window.reasons == [
        "Dawn, low light",
        "major feeding period",
    ]

    # Today, after dusk: nothing left.
    assert (
        best_window(
            sun, [], quiet, not_before=sun.sunset + timedelta(hours=2), tz_name="UTC"
        )
        is None
    )
