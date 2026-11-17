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
