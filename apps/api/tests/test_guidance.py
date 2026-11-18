"""Sprint 35: fishing guidance (`app.domain.guidance`).

Characterizes the two parts of legacy `domain/species.py:_score_species`
this module ports (temperature fit 0-50, seasonal fit 0-30, threshold
30), the region gating, and the "every recommendation explains why"
contract.
"""

from __future__ import annotations

from datetime import UTC, datetime

import pytest

from app.domain.guidance import (
    DISCLAIMER,
    MAX_PICKS,
    SCORE_THRESHOLD,
    GuidanceTier,
    _season_points,
    _temperature_points,
    build_fishing_guidance,
    load_catalogue,
    local_month,
)

_RED_DRUM = next(s for s in load_catalogue() if s["id"] == "red-drum")


# --- catalogue -----------------------------------------------------------


def test_catalogue_is_curated_and_every_species_is_region_gated() -> None:
    catalogue = load_catalogue()
    # A curated shore/pier/inshore list, not the legacy 851-species dump.
    assert 100 <= len(catalogue) <= 250
    assert len({species["id"] for species in catalogue}) == len(catalogue)
    regions = {
        "atlantic_north",
        "atlantic_mid",
        "atlantic_south",
        "gulf",
        "pacific",
        "pacific_south",
        "hawaii_conditions",
    }
    for species in catalogue:
        assert species["regions"], species["id"]
        assert set(species["regions"]) <= regions, species["id"]
        assert species["temp_min"] <= species["temp_ideal_low"]
        assert species["temp_ideal_low"] <= species["temp_ideal_high"]
        assert species["temp_ideal_high"] <= species["temp_max"]
    # Every region has a real choice of fish, not a handful.
    for region in regions:
        assert sum(region in species["regions"] for species in catalogue) >= 20, region


def test_catalogue_ids_are_unique() -> None:
    ids = [species["id"] for species in load_catalogue()]
    assert len(ids) == len(set(ids))


def test_every_region_has_candidates() -> None:
    for region in (
        "atlantic_north",
        "atlantic_mid",
        "atlantic_south",
        "gulf",
        "pacific",
        "pacific_south",
        "hawaii_conditions",
    ):
        assert any(region in s["regions"] for s in load_catalogue()), region


# --- legacy scoring, ported unchanged --------------------------------------
# Red drum: min 45, ideal 55-75, max 85; peak [3,4,5,9,10,11], good [1,2,6,7,8,12].


@pytest.mark.parametrize(
    ("water_temp", "expected"),
    [
        (44.9, None),  # below survivable min: excluded
        (45.0, 0.0),  # at min: 0 of 50
        (50.0, 25.0),  # halfway from min to ideal low
        (55.0, 50.0),  # ideal low
        (65.0, 50.0),  # inside ideal
        (75.0, 50.0),  # ideal high
        (80.0, 25.0),  # halfway from ideal high to max
        (85.0, 0.0),  # at max
        (85.1, None),  # above max: excluded
    ],
)
def test_temperature_points_match_legacy(
    water_temp: float, expected: float | None
) -> None:
    assert _temperature_points(_RED_DRUM, water_temp) == expected


@pytest.mark.parametrize(("month", "expected"), [(10, 30.0), (7, 15.0)])
def test_season_points_match_legacy(month: int, expected: float) -> None:
    assert _season_points(_RED_DRUM, month) == expected


def test_off_season_scores_zero_season_points() -> None:
    tautog = next(s for s in load_catalogue() if s["id"] == "tautog")
    off_month = next(
        m
        for m in range(1, 13)
        if m not in tautog["peak_months"] + tautog["good_months"]
    )
    assert _season_points(tautog, off_month) == 0.0


# --- build_fishing_guidance ----------------------------------------------


def _guidance(**overrides: object):  # type: ignore[no-untyped-def]
    kwargs: dict[str, object] = {
        "region": "atlantic_mid",
        "water_temp_f": 65.0,
        "water_temp_is_fallback": False,
        "month": 10,
    }
    kwargs.update(overrides)
    return build_fishing_guidance(**kwargs)  # type: ignore[arg-type]


def test_picks_are_sorted_capped_and_above_threshold() -> None:
    guidance = _guidance()
    scores = [pick.score for pick in guidance.species]
    assert scores == sorted(scores, reverse=True)
    assert 0 < len(scores) <= MAX_PICKS
    assert all(score >= SCORE_THRESHOLD for score in scores)


def test_red_drum_in_october_at_65f_is_a_prime_pick_with_reasons() -> None:
    guidance = _guidance()
    red_drum = next(pick for pick in guidance.species if pick.id == "red-drum")
    assert red_drum.score == 80  # 50 temperature + 30 peak month
    assert red_drum.tier is GuidanceTier.PRIME
    assert red_drum.reasons == [
        "Water 65°F is in its ideal 55–75°F range",
        "October is a peak month",
    ]
    assert red_drum.rig and red_drum.bait and red_drum.hook_size and red_drum.sinker


def test_only_species_offered_in_the_region_are_picked() -> None:
    pacific_ids = {s["id"] for s in load_catalogue() if "pacific" in s["regions"]}
    guidance = _guidance(region="pacific", water_temp_f=55.0, month=12)
    assert guidance.species
    assert {pick.id for pick in guidance.species} <= pacific_ids


def test_unknown_region_yields_no_picks_rather_than_guessing() -> None:
    assert _guidance(region="nowhere").species == []


def test_species_outside_survivable_range_are_excluded() -> None:
    # 90°F is above every Atlantic catalogue species' max except the
    # warm-water ones; red drum (max 85) must be absent.
    guidance = _guidance(region="atlantic_south", water_temp_f=90.0, month=8)
    assert "red-drum" not in {pick.id for pick in guidance.species}


def test_fallback_water_temperature_is_named_in_basis_and_reasons() -> None:
    guidance = _guidance(water_temp_is_fallback=True)
    assert guidance.basis.water_temp_is_fallback is True
    assert all("monthly average" in pick.reasons[0] for pick in guidance.species)


def test_cold_and_warm_explanations_split_at_65f() -> None:
    cold = next(p for p in _guidance(water_temp_f=60.0).species if p.id == "red-drum")
    warm = next(p for p in _guidance(water_temp_f=70.0).species if p.id == "red-drum")
    assert cold.explanation == _RED_DRUM["explanation_cold"]
    assert warm.explanation == _RED_DRUM["explanation_warm"]


@pytest.mark.parametrize(
    ("wave_range", "has_note"),
    [(None, False), ((1.0, 3.0), False), ((3.0, 4.0), True), ((4.0, 7.0), True)],
)
def test_tackle_note_only_for_rough_surf(
    wave_range: tuple[float, float] | None, has_note: bool
) -> None:
    guidance = _guidance(wave_range_ft=wave_range)
    assert (guidance.tackle_note is not None) is has_note


def test_disclaimer_always_present() -> None:
    assert _guidance().disclaimer == DISCLAIMER
    assert "regulations" in DISCLAIMER


def test_local_month_uses_location_timezone() -> None:
    # 2024-11-01 04:00 UTC is still Oct 31 in Los Angeles.
    now = datetime(2024, 11, 1, 4, 0, tzinfo=UTC)
    assert local_month(now, "America/Los_Angeles") == 10
    assert local_month(now, "America/New_York") == 11


# --- species calendar (legacy build_species_calendar) ----------------------


def test_calendar_lists_every_region_species_with_12_months() -> None:
    from app.domain.guidance import build_species_calendar

    rows = build_species_calendar("atlantic_mid")
    region_ids = [s["id"] for s in load_catalogue() if "atlantic_mid" in s["regions"]]
    assert [row.id for row in rows] == region_ids
    assert all(len(row.months) == 12 for row in rows)


def test_calendar_marks_peak_and_good_months_from_catalogue() -> None:
    from app.domain.guidance import CalendarLevel, build_species_calendar

    red_drum = next(
        r for r in build_species_calendar("atlantic_mid") if r.id == "red-drum"
    )
    assert red_drum.months[9] is CalendarLevel.PEAK  # October
    assert red_drum.months[6] is CalendarLevel.GOOD  # July


def test_calendar_blanks_months_too_far_outside_survivable_range() -> None:
    from app.domain.guidance import CalendarLevel, build_species_calendar

    # Red drum min is 45°F; legacy allows 5°F slack, so 39°F blanks the month.
    temps = {month: 65.0 for month in range(1, 13)} | {10: 39.0}
    red_drum = next(
        r for r in build_species_calendar("atlantic_mid", temps) if r.id == "red-drum"
    )
    assert red_drum.months[9] is CalendarLevel.NONE
    assert red_drum.months[3] is CalendarLevel.PEAK  # April unaffected


def test_guidance_includes_calendar() -> None:
    guidance = _guidance()
    assert guidance.calendar
    assert all(len(row.months) == 12 for row in guidance.calendar)


# --- regulations (legacy snapshot, provisional) ----------------------------


def test_regulation_for_known_species_and_state() -> None:
    from datetime import date

    from app.domain.guidance import regulation_for

    reg = regulation_for("red-drum", "NC", date(2026, 5, 1))
    assert reg is not None
    assert reg.state == "NC"
    assert reg.min_size and reg.bag_limit
    assert reg.source_url and reg.source_url.startswith("https://")
    assert reg.possibly_outdated is False  # one month after the snapshot


def test_regulation_is_flagged_outdated_after_six_months() -> None:
    from datetime import date

    from app.domain.guidance import load_regulations, regulation_for

    year, month = (int(p) for p in load_regulations()["as_of"].split("-"))
    later = date(year + 1, month, 1)
    reg = regulation_for("red-drum", "NC", later)
    assert reg is not None and reg.possibly_outdated is True


def test_no_regulation_is_invented_for_a_missing_state() -> None:
    from datetime import date

    from app.domain.guidance import regulation_for

    assert regulation_for("red-drum", "ZZ", date(2026, 5, 1)) is None
    assert regulation_for("ulua-giant-trevally", "NC", date(2026, 5, 1)) is None


def test_picks_carry_their_state_regulation() -> None:
    from datetime import date

    guidance = _guidance(state="NC", today=date(2026, 5, 1))
    red_drum = next(pick for pick in guidance.species if pick.id == "red-drum")
    assert red_drum.regulation is not None
    assert red_drum.regulation.state == "NC"


def test_picks_have_no_regulation_without_a_state() -> None:
    assert all(pick.regulation is None for pick in _guidance().species)


def test_disclaimer_uses_roadmap_wording() -> None:
    assert DISCLAIMER.startswith("Informational only — verify with official sources")


# --- conditions modifier (legacy _conditions_modifier) ---------------------


def test_onshore_wind_species_gain_on_onshore_and_lose_on_offshore() -> None:
    from app.domain.guidance import _conditions_modifier

    on, on_reasons = _conditions_modifier(
        ["onshore_wind"],
        coast="east",
        wind_direction="NE",
        wind_range_kt=None,
        wave_range_ft=None,
        hour=None,
    )
    off, _ = _conditions_modifier(
        ["onshore_wind"],
        coast="east",
        wind_direction="W",
        wind_range_kt=None,
        wave_range_ft=None,
        hour=None,
    )
    assert (on, off) == (5, -3)
    assert "Onshore NE wind" in on_reasons[0]


def test_calm_water_species_prefer_offshore_light_wind_and_flat_surf() -> None:
    from app.domain.guidance import _conditions_modifier

    points, reasons = _conditions_modifier(
        ["calm_water"],
        coast="east",
        wind_direction="W",
        wind_range_kt=(3, 6),
        wave_range_ft=(0.5, 1.5),
        hour=None,
    )
    assert points == 5 + 3 + 4
    assert len(reasons) == 3


def test_rough_surf_species_like_moderate_wind_and_surf() -> None:
    from app.domain.guidance import _conditions_modifier

    points, _ = _conditions_modifier(
        ["rough_surf"],
        coast="east",
        wind_direction=None,
        wind_range_kt=(10, 15),
        wave_range_ft=(2, 4),
        hour=None,
    )
    assert points == 3 + 4


def test_time_of_day_modifier() -> None:
    from app.domain.guidance import _conditions_modifier

    def at(tags: list[str], hour: int) -> float:
        return _conditions_modifier(
            tags,
            coast=None,
            wind_direction=None,
            wind_range_kt=None,
            wave_range_ft=None,
            hour=hour,
        )[0]

    assert (at(["low_light"], 6), at(["low_light"], 12), at(["low_light"], 8)) == (
        3,
        -1,
        0,
    )
    assert (at(["daytime"], 12), at(["daytime"], 20)) == (3, -1)


def test_hawaii_has_no_wind_direction_effect() -> None:
    from app.domain.guidance import _conditions_modifier

    points, reasons = _conditions_modifier(
        ["onshore_wind"],
        coast="hawaii",
        wind_direction="NE",
        wind_range_kt=None,
        wave_range_ft=None,
        hour=None,
    )
    assert (points, reasons) == (0, [])


def test_conditions_reasons_appear_on_picks() -> None:
    guidance = _guidance(coast="east", wind_direction="NE", wind_range_kt=(10.0, 15.0))
    red_drum = next(pick for pick in guidance.species if pick.id == "red-drum")
    assert red_drum.score == 50 + 30 + 5 + 3  # temp + peak month + onshore + wind
    assert any("Onshore NE wind" in reason for reason in red_drum.reasons)
    assert "Moderate wind stirs up bait" in red_drum.reasons


# --- pack for today (legacy build_trip_setup) --------------------------------


def _pack(**overrides: object):  # type: ignore[no-untyped-def]
    kwargs: dict[str, object] = {
        "region": "atlantic_mid",
        "water_temp_f": 64.0,
        "water_temp_is_fallback": False,
        "month": 11,
    }
    kwargs.update(overrides)
    guidance = build_fishing_guidance(**kwargs)  # type: ignore[arg-type]
    assert guidance.pack is not None
    return guidance.pack


def test_pack_lists_tackle_for_up_to_three_working_species() -> None:
    pack = _pack()
    assert pack.headline.startswith("Tackle for ")
    assert pack.headline.count(",") + pack.headline.count("&") <= 2
    kinds = [row.kind for row in pack.rows]
    for kind in ("lure", "bait", "rig", "hook", "weight"):
        assert kind in kinds


def test_pack_murky_water_adjusts_color_and_weight() -> None:
    pack = _pack(wave_range_ft=(3.0, 5.0))
    rows = {row.kind: row.value for row in pack.rows}
    assert rows["color"].startswith("Chartreuse")
    assert rows["weight"].endswith("go heavier in rough surf")


def test_pack_cold_water_tip() -> None:
    pack = _pack(region="atlantic_north", water_temp_f=52.0, month=12)
    rows = {row.kind: row.value for row in pack.rows}
    assert "cold water" in rows.get("color", "")


def test_pack_skips_non_lure_phrases() -> None:
    from app.domain.guidance import _NOT_A_LURE

    pack = _pack()
    lures = next(row.value for row in pack.rows if row.kind == "lure").lower()
    assert not any(phrase in lures for phrase in _NOT_A_LURE)


def test_no_pack_without_picks() -> None:
    assert (
        build_fishing_guidance(
            region="nowhere", water_temp_f=64.0, water_temp_is_fallback=False, month=11
        ).pack
        is None
    )


def test_every_region_month_and_temperature_builds() -> None:
    """Every catalogue entry must survive being picked: no region, month or
    water temperature may hit a species with a missing field."""
    regions = {region for species in load_catalogue() for region in species["regions"]}
    for region in sorted(regions):
        for month in range(1, 13):
            for temp in range(40, 92, 4):
                result = build_fishing_guidance(
                    region=region,
                    water_temp_f=float(temp),
                    water_temp_is_fallback=False,
                    month=month,
                    max_picks=200,
                )
                for pick in result.species:
                    assert pick.bait and pick.rig, pick.id
