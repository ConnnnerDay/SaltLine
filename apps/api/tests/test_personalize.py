"""Forecast personalization (`app.domain.personalize`)."""

from __future__ import annotations

from datetime import UTC, datetime

from app.domain.models import (
    Confidence,
    ConfidenceLevel,
    ForecastEnvelope,
    ForecastState,
    Location,
)
from app.domain.personalize import comfort_breaches, personalize
from app.domain.preferences import GearUse, PreferencesOut


def _envelope(
    wind: list[float] | None = None, waves: list[float] | None = None
) -> ForecastEnvelope:
    return ForecastEnvelope(
        location=Location(
            id="wrightsville-beach-nc",
            label="Wrightsville Beach",
            lat=34.2,
            lng=-77.8,
            timezone="America/New_York",
            marine_zone="AMZ158",
            station_ids=[],
        ),
        generated_at=datetime(2026, 11, 17, 12, tzinfo=UTC),
        state=ForecastState.FRESH,
        confidence=Confidence(level=ConfidenceLevel.HIGH, reasons=[]),
        conditions={
            "score": {
                "verdict": "Good",
                "score": 70,
                "summary": "Clean offshore wind.",
            },
            "wind_range_kt": wind,
            "wave_range_ft": waves,
        },
        recommendations={
            "pack": {
                "headline": "Tackle for Red drum",
                "rows": [
                    {"kind": "lure", "label": "Lures", "value": "Spoons"},
                    {"kind": "color", "label": "Color/action", "value": "Bright"},
                    {"kind": "bait", "label": "Bait", "value": "Shrimp"},
                    {"kind": "rig", "label": "Rig", "value": "Fish finder"},
                ],
            }
        },
    )


def test_no_limits_means_no_change() -> None:
    envelope = _envelope(wind=[10, 20], waves=[3, 5])
    out = personalize(envelope, PreferencesOut())
    assert out.conditions == envelope.conditions
    assert out.warnings == []


def test_over_wind_limit_downgrades_and_explains() -> None:
    envelope = _envelope(wind=[10, 20], waves=[1, 2])
    out = personalize(envelope, PreferencesOut(wind_threshold_kt=15))
    assert out.conditions is not None
    score = out.conditions["score"]
    assert score["verdict"] == "Fair"
    assert score["personalized_from"] == "Good"
    assert score["score"] == 70  # the score itself is unchanged
    assert "wind up to 20 kt (your limit 15)" in score["summary"]
    assert [w.code for w in out.warnings] == ["over_comfort_limit"]
    assert envelope.conditions is not None
    assert envelope.conditions["score"]["verdict"] == "Good"  # input untouched


def test_within_limits_is_not_flagged() -> None:
    out = personalize(
        _envelope(wind=[5, 12], waves=[1, 2]),
        PreferencesOut(wind_threshold_kt=15, surf_threshold_ft=3),
    )
    assert out.warnings == []


def test_surf_limit_uses_the_high_end_of_the_range() -> None:
    reasons = comfort_breaches(
        {"wave_range_ft": [2, 4]}, PreferencesOut(surf_threshold_ft=3)
    )
    assert reasons == ["surf up to 4 ft (your limit 3)"]


def test_poor_cannot_go_lower() -> None:
    envelope = _envelope(wind=[25, 30])
    assert envelope.conditions is not None
    envelope.conditions["score"]["verdict"] = "Poor"
    out = personalize(envelope, PreferencesOut(wind_threshold_kt=15))
    assert out.conditions is not None
    assert out.conditions["score"]["verdict"] == "Poor"


def test_gear_filters_pack_rows() -> None:
    no_lures = personalize(_envelope(), PreferencesOut(uses_lures=GearUse.NO))
    assert no_lures.recommendations is not None
    kinds = [row["kind"] for row in no_lures.recommendations["pack"]["rows"]]
    assert kinds == ["bait", "rig"]

    no_bait = personalize(
        _envelope(), PreferencesOut(uses_live_bait=GearUse.NO, uses_cut_bait=GearUse.NO)
    )
    assert no_bait.recommendations is not None
    kinds = [row["kind"] for row in no_bait.recommendations["pack"]["rows"]]
    assert kinds == ["lure", "color", "rig"]

    some_bait = personalize(
        _envelope(),
        PreferencesOut(uses_live_bait=GearUse.NO, uses_cut_bait=GearUse.SOMETIMES),
    )
    assert some_bait.recommendations is not None
    assert "bait" in [row["kind"] for row in some_bait.recommendations["pack"]["rows"]]


async def test_forecast_route_personalizes_only_for_a_user_with_a_profile() -> None:
    import httpx
    from sqlalchemy.ext.asyncio import create_async_engine

    from app.api.deps import AppState
    from app.api.v1.forecasts import _personalized
    from app.domain.preferences import UserPreferences
    from app.infra.database import Base, create_sessionmaker
    from app.infra.http_client import BoundedHTTPClient
    from app.infra.snapshot_cache import SnapshotCache
    from app.providers.stations import StationCatalogCache

    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    sessionmaker = create_sessionmaker(engine)
    state = AppState(
        http_client=BoundedHTTPClient(
            transport=httpx.MockTransport(lambda r: httpx.Response(500))
        ),
        coops_tide_cache=StationCatalogCache(),
        coops_watertemp_cache=StationCatalogCache(),
        ndbc_cache=StationCatalogCache(),
        forecast_cache=SnapshotCache(),
        db_sessionmaker=sessionmaker,
    )
    async with sessionmaker() as session:
        session.add(UserPreferences(user_id="user-1", wind_threshold_kt=15))
        await session.commit()

    envelope = _envelope(wind=[10, 20])
    assert await _personalized(envelope, None, state) is envelope  # anonymous
    assert await _personalized(envelope, "user-2", state) is envelope  # no profile
    mine = await _personalized(envelope, "user-1", state)
    assert mine.conditions is not None
    assert mine.conditions["score"]["verdict"] == "Fair"

    await engine.dispose()
    broken = AppState(**{**state.__dict__, "db_sessionmaker": sessionmaker})
    assert await _personalized(envelope, "user-1", broken) is envelope  # DB gone
