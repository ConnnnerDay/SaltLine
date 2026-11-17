def test_snapshot_records_tide_moon_and_solunar_at_catch_time() -> None:
    from datetime import UTC, datetime

    from app.domain.catches import conditions_snapshot

    conditions = {
        "water_temperature": {"value": 64.0, "is_fallback": False},
        "score": {"verdict": "Good", "score": 70},
        "solunar": {
            "moon_phase": "First Quarter",
            "major_periods": [
                {
                    "start": "2026-11-17T10:30:00-05:00",
                    "end": "2026-11-17T12:30:00-05:00",
                }
            ],
            "minor_periods": [
                {
                    "start": "2026-11-17T16:50:00-05:00",
                    "end": "2026-11-17T17:50:00-05:00",
                }
            ],
        },
    }
    tides = {
        "predictions": [
            {"time": "2026-11-17T06:27:00-05:00", "kind": "low"},
            {"time": "2026-11-17T12:41:00-05:00", "kind": "high"},
            {"time": "2026-11-17T19:20:00-05:00", "kind": "low"},
        ]
    }
    # 11:00 EST: rising toward the 12:41 high, inside the major period.
    morning = conditions_snapshot(
        conditions, tides, datetime(2026, 11, 17, 16, tzinfo=UTC)
    )
    assert morning is not None
    assert (morning.tide, morning.moon_phase, morning.solunar) == (
        "incoming",
        "First Quarter",
        "major",
    )
    # 17:00 EST: falling toward the 19:20 low, inside the minor period.
    evening = conditions_snapshot(
        conditions, tides, datetime(2026, 11, 17, 22, tzinfo=UTC)
    )
    assert evening is not None and (evening.tide, evening.solunar) == (
        "outgoing",
        "minor",
    )
    # Without tides or a time, those fields are simply unknown.
    bare = conditions_snapshot(conditions)
    assert bare is not None and (bare.tide, bare.solunar) == (None, None)


def test_snapshot_leaves_tide_and_moon_blank_for_backdated_catches() -> None:
    from datetime import UTC, datetime

    from app.domain.catches import conditions_snapshot

    conditions = {
        "solunar": {
            "moon_phase": "First Quarter",
            "major_periods": [
                {
                    "start": "2026-11-17T10:30:00-05:00",
                    "end": "2026-11-17T12:30:00-05:00",
                }
            ],
            "minor_periods": [],
        }
    }
    tides = {
        "predictions": [
            {"time": "2026-11-17T06:27:00-05:00", "kind": "low"},
            {"time": "2026-11-17T12:41:00-05:00", "kind": "high"},
        ]
    }
    last_week = conditions_snapshot(
        conditions, tides, datetime(2026, 11, 10, 16, tzinfo=UTC)
    )
    assert last_week is not None
    assert (last_week.tide, last_week.moon_phase, last_week.solunar) == (
        None,
        None,
        None,
    )
