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
    assert "wind up to 20 kt (your limit 15 kt)" in score["summary"]
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
    assert reasons == ["surf up to 4 ft (your limit 3 ft)"]


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


# --- targets, usual times, tide preference, experience ----------------------


def _pick(pick_id: str, score: int, targets: list[str]) -> dict[str, object]:
    return {
        "id": pick_id,
        "name": pick_id.title(),
        "score": score,
        "tier": "prime" if score >= 65 else "good" if score >= 50 else "fair",
        "reasons": ["Water in range"],
        "explanation": "",
        "bait": "Fresh shrimp; cut mullet",
        "rig": "Fish finder rig",
        "hook_size": "2/0",
        "sinker": "2 oz",
        "lures": "Spoons",
        "targets": targets,
    }


def _guided_envelope() -> ForecastEnvelope:
    envelope = _envelope(wind=[5, 10], waves=[1, 2])
    return envelope.model_copy(
        update={
            "recommendations": {
                "basis": {
                    "water_temp_f": 65.0,
                    "water_temp_is_fallback": False,
                    "month": 11,
                    "region": "atlantic_mid",
                },
                "species": [
                    _pick("bluefish", 70, ["pelagic"]),
                    _pick("red-drum", 66, ["bottom", "inshore_slam"]),
                    _pick("spot", 40, ["bottom"]),
                ],
                "pack": {"headline": "x", "rows": []},
            }
        }
    )


def test_target_groups_boost_and_rerank_with_reason() -> None:
    from app.domain.preferences import TargetGroup

    out = personalize(
        _guided_envelope(), PreferencesOut(target_groups=[TargetGroup.BOTTOM])
    )
    assert out.recommendations is not None
    species = out.recommendations["species"]
    assert [p["id"] for p in species] == ["red-drum", "bluefish", "spot"]
    assert species[0]["score"] == 76
    assert species[0]["matches_profile"] is True
    assert "Matches what you fish for (bottom fish)" in species[0]["reasons"]
    assert species[2]["tier"] == "good"  # 40 + 10 = 50
    assert out.recommendations["pack"]["headline"].startswith("Tackle for Red-Drum")


def test_beginner_gets_a_start_simple_row_first() -> None:
    from app.domain.preferences import Experience

    out = personalize(
        _guided_envelope(), PreferencesOut(experience=Experience.BEGINNER)
    )
    assert out.recommendations is not None
    rows = out.recommendations["pack"]["rows"]
    assert rows[0]["kind"] == "tip"
    assert rows[0]["value"].startswith("Fish finder rig with fresh shrimp for bluefish")


def _hour(hour: int, tag: str) -> dict[str, object]:
    return {
        "hour": hour,
        "time": f"2026-11-17T{hour:02d}:00:00-05:00",
        "level": {"low": 20, "med": 45, "high": 65, "prime": 85}[tag],
        "tag": tag,
        "reasons": ["Dawn"] if hour in (6, 7) else [],
    }


def _timed_envelope() -> ForecastEnvelope:
    tags = {6: "high", 7: "high", 10: "prime", 11: "prime", 18: "high", 19: "med"}
    hours = [_hour(h, tags.get(h, "low")) for h in range(24)]
    return _envelope().model_copy(
        update={
            "hourly_outlook": {"hours": hours},
            "tides": {
                "station_id": "x",
                "predictions": [
                    {
                        "time": "2026-11-17T08:00:00-05:00",
                        "kind": "high",
                        "height_ft": 4.0,
                    },
                    {
                        "time": "2026-11-17T14:00:00-05:00",
                        "kind": "low",
                        "height_ft": 0.5,
                    },
                    {
                        "time": "2026-11-17T20:00:00-05:00",
                        "kind": "high",
                        "height_ft": 4.1,
                    },
                ],
            },
        }
    )


def test_your_window_stays_inside_usual_times() -> None:
    from app.domain.preferences import FishingTime

    out = personalize(
        _timed_envelope(), PreferencesOut(fishing_times=[FishingTime.DAWN])
    )
    assert out.hourly_outlook is not None
    window = out.hourly_outlook["your_window"]
    assert (window["start"][11:13], window["end"][11:13]) == ("06", "07")
    assert window["tag"] == "high"
    assert "Dawn" in window["reasons"]


def test_your_window_prefers_the_users_tide() -> None:
    from app.domain.preferences import FishingTime, TidePreference

    prefs = PreferencesOut(
        fishing_times=[FishingTime.MORNING, FishingTime.EVENING],
        tide_preference=TidePreference.INCOMING,
    )
    out = personalize(_timed_envelope(), prefs)
    assert out.hourly_outlook is not None
    window = out.hourly_outlook["your_window"]
    # 10-11 AM is prime but on the falling (outgoing) tide; 6-7 PM is the
    # best incoming-tide stretch in the morning/evening hours.
    assert (window["start"][11:13], window["end"][11:13]) == ("18", "18")
    assert "incoming tide (your preference)" in window["reasons"]


def test_no_usual_times_means_no_window() -> None:
    out = personalize(_timed_envelope(), PreferencesOut())
    assert out.hourly_outlook is not None
    assert "your_window" not in out.hourly_outlook


def test_boat_and_tidal_fish_join_the_picks_only_for_those_anglers() -> None:
    from app.domain.guidance import build_fishing_guidance
    from app.domain.preferences import FishingType

    guidance = build_fishing_guidance(
        region="atlantic_south",
        water_temp_f=80.0,
        water_temp_is_fallback=False,
        month=7,
    ).model_dump(mode="json")
    assert guidance["boat_species"] and guidance["tidal_species"]
    envelope = _envelope().model_copy(update={"recommendations": guidance})
    shore_ids = [pick["id"] for pick in guidance["species"]]
    boat_ids = {pick["id"] for pick in guidance["boat_species"]}
    tidal_ids = {pick["id"] for pick in guidance["tidal_species"]}

    def picks(*kinds: FishingType) -> list[str]:
        prefs = PreferencesOut(fishing_types=list(kinds) or None)
        out = personalize(envelope, prefs).recommendations or {}
        return [pick["id"] for pick in out["species"]]

    # Surf anglers: shore fish only, unchanged.
    assert picks(FishingType.SURF) == shore_ids
    assert picks() == shore_ids
    # Offshore only: boat fish lead; never tidal-creek fish.
    offshore = picks(FishingType.OFFSHORE)
    assert offshore[0] in boat_ids and not set(offshore) & tidal_ids
    # Surf and offshore: the lists take turns, shore first -- even when
    # shore fish score higher (condition bonuses offshore fish never get).
    mixed = picks(FishingType.SURF, FishingType.OFFSHORE)
    assert mixed[0] in shore_ids and mixed[1] in boat_ids and mixed[2] in shore_ids
    # Kayak: tidal fish can join; never boat-only ones.
    kayak = picks(FishingType.KAYAK)
    assert not set(kayak) & boat_ids
    assert kayak[0] in shore_ids and kayak[1] in tidal_ids
    assert len(kayak) == len(shore_ids)
