"""Sprint 35: fishing guidance (`app.domain.guidance`).

Characterizes the two parts of legacy `domain/species.py:_score_species`
this module ports (temperature fit 0-50, seasonal fit 0-30, threshold
30), the region gating, and the "every recommendation explains why"
contract.
"""

from __future__ import annotations

from datetime import UTC, date, datetime
from typing import Any

import pytest

from app.domain.guidance import (
    DISCLAIMER,
    MAX_PICKS,
    SCORE_THRESHOLD,
    GuidanceTier,
    _in_period,
    _season_points,
    _temperature_points,
    build_fishing_guidance,
    load_catalogue,
    local_month,
    regulation_for,
)

_RED_DRUM = next(s for s in load_catalogue() if s["id"] == "red-drum")


# --- catalogue -----------------------------------------------------------


def test_catalogue_is_curated_and_every_species_is_region_gated() -> None:
    catalogue = load_catalogue()
    # Every legacy fish once (variants merged, protected species left out).
    assert 500 <= len(catalogue) <= 700
    assert {species.get("access") for species in catalogue} <= {
        "shore",
        "boat",
        "tidal",
        "incidental",
        "protected",
    }
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
# Red drum: min 45, ideal 55-85, max 92 (summer-water fix in
# scripts/guidance_corrections.py); peak [3,4,5,9,10,11], good [1,2,6,7,8,12].


@pytest.mark.parametrize(
    ("water_temp", "expected"),
    [
        (44.9, None),  # below survivable min: excluded
        (45.0, 0.0),  # at min: 0 of 50
        (50.0, 25.0),  # halfway from min to ideal low
        (55.0, 50.0),  # ideal low
        (65.0, 50.0),  # inside ideal
        (85.0, 50.0),  # ideal high
        (88.5, 25.0),  # halfway from ideal high to max
        (92.0, 0.0),  # at max
        (92.1, None),  # above max: excluded
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


def test_red_drum_in_october_at_65f_is_a_good_pick_with_reasons() -> None:
    guidance = _guidance()
    red_drum = next(pick for pick in guidance.species if pick.id == "red-drum")
    assert red_drum.score == 83  # 50 temperature + 30 peak month + 3 fall run
    # In season at an ideal temperature is "good"; "prime" also needs
    # today's conditions in its favor.
    assert red_drum.tier is GuidanceTier.GOOD
    assert red_drum.reasons == [
        "Water 65°F is in its ideal 55–85°F range",
        "October is a peak month",
        # Aug-Nov spawners, but 65°F is below their 70-82°F spawning water.
        "Spawning season",
        "The fall red drum run is on",
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
    region_ids = [
        s["id"]
        for s in load_catalogue()
        if "atlantic_mid" in s["regions"]
        and s.get("access", "shore") in ("shore", "tidal")
    ]
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
    # temp + peak month + fall run + onshore + wind
    assert red_drum.score == 50 + 30 + 3 + 5 + 3
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
    # A pyramid already holds in rough surf; anything else says go heavier.
    assert "pyramid" in rows["weight"].lower() or rows["weight"].endswith(
        "go heavier in rough surf"
    )


def test_pack_cold_water_tip() -> None:
    pack = _pack(region="atlantic_north", water_temp_f=52.0, month=12)
    rows = {row.kind: row.value for row in pack.rows}
    assert "cold water" in rows.get("color", "")


def test_pack_skips_non_lure_phrases() -> None:
    from app.domain.guidance import _NOT_A_LURE

    pack = _pack()
    lures = next(row.value for row in pack.rows if row.kind == "lure")
    assert not any(_NOT_A_LURE.search(entry) for entry in lures.split(" · "))


def test_not_a_lure_phrases_cover_the_catalogue_wording() -> None:
    from app.domain.guidance import _NOT_A_LURE

    for phrase in (
        "Not a strong lure target",
        "not usually targeted on lures",
        "Primarily caught on bait",
        "small jigs occasionally work",
        "Not applicable",
    ):
        assert _NOT_A_LURE.search(phrase), phrase
    for lure in (
        "Tiny metal jigs (1/4-1/2 oz)",
        "Small spoons",
        "Sabiki rigs",
        "Bucktail jigs",
    ):
        assert not _NOT_A_LURE.search(lure), lure


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


def test_picks_keep_boat_tidal_and_bait_fish_in_their_place() -> None:
    access = {
        species["id"]: species.get("access", "shore") for species in load_catalogue()
    }
    for region, temp, month in (
        ("atlantic_south", 78.0, 6),
        ("gulf", 82.0, 8),
        ("pacific", 56.0, 7),
    ):
        result = build_fishing_guidance(
            region=region, water_temp_f=temp, water_temp_is_fallback=False, month=month
        )
        assert result.species
        assert {access[pick.id] for pick in result.species} == {"shore"}
        assert {access[pick.id] for pick in result.boat_species} <= {"boat"}
        assert {access[pick.id] for pick in result.tidal_species} <= {"tidal"}
    # Florida in summer has plenty of offshore fish to offer boat anglers.
    summer = build_fishing_guidance(
        region="atlantic_south",
        water_temp_f=80.0,
        water_temp_is_fallback=False,
        month=7,
    )
    assert summer.boat_species


def test_every_regulation_entry_builds() -> None:
    """Every state x species limit in the snapshot must load (a bare number
    where text belongs once crashed "What's biting" for NJ sheepshead)."""
    from datetime import date

    from app.domain.guidance import load_regulations, regulation_for

    today = date(2026, 6, 1)
    for state, entries in load_regulations()["states"].items():
        for species_id in entries:
            assert regulation_for(species_id, state, today) is not None


def test_spawning_fish_say_so() -> None:
    # Red drum spawn Aug-Nov in 70-82F water.
    in_range = build_fishing_guidance(
        region="atlantic_south",
        water_temp_f=75.0,
        water_temp_is_fallback=False,
        month=9,
        max_picks=200,
    )
    red = next(pick for pick in in_range.species if pick.id == "red-drum")
    assert any(reason.startswith("Spawning now (") for reason in red.reasons)
    cooler = build_fishing_guidance(
        region="atlantic_mid",
        water_temp_f=62.0,
        water_temp_is_fallback=False,
        month=11,
        max_picks=200,
    )
    red = next(pick for pick in cooler.species if pick.id == "red-drum")
    assert "Spawning season" in red.reasons
    spring = build_fishing_guidance(
        region="atlantic_mid",
        water_temp_f=62.0,
        water_temp_is_fallback=False,
        month=4,
        max_picks=200,
    )
    red = next(pick for pick in spring.species if pick.id == "red-drum")
    assert not any("pawning" in reason for reason in red.reasons)


def test_temperature_just_off_the_ideal_edge_shows_the_decimal() -> None:
    from app.domain.guidance import _temperature_reason

    species = {"temp_ideal_low": 58, "temp_ideal_high": 74}
    assert (
        _temperature_reason(species, 57.7, False)
        == "Water 57.7°F is just below its ideal 58–74°F range"
    )
    assert (
        _temperature_reason(species, 50.0, False)
        == "Water 50°F is below its ideal 58–74°F, but within range"
    )


def test_pack_lists_are_clean() -> None:
    """Entries come from several species' free text: no lures under Bait,
    no rig named twice, and every entry starts with a capital."""
    pack = _pack()
    rows = {row.kind: row.value for row in pack.rows}
    bait = rows["bait"].lower()
    assert not any(word in bait for word in ("plug", "lure", "spoon", "swimbait"))
    rigs = [rig.lower() for rig in rows["rig"].split(" · ")]
    assert not any(a != b and a in b for a in rigs for b in rigs)
    for kind in ("lure", "bait", "rig"):
        assert all(
            entry[:1].isupper() or not entry[:1].isalpha()
            for entry in rows[kind].split(" · ")
        )


def test_regional_seasons_replace_the_catalogue_months_for_that_region() -> None:
    from app.domain.guidance import CalendarLevel, build_species_calendar, for_region

    striper = next(s for s in load_catalogue() if s["id"] == "striped-bass")
    north = for_region(striper, "atlantic_north")
    # New England stripers are a late-spring and fall fish, not a winter one.
    assert 1 not in north["peak_months"] and 5 in north["peak_months"]
    # A region without an override keeps the catalogue's months.
    assert for_region(striper, "gulf")["peak_months"] == striper["peak_months"]

    calendar = {row.id: row.months for row in build_species_calendar("atlantic_north")}
    assert calendar["striped-bass"][0] is CalendarLevel.NONE  # January
    assert calendar["striped-bass"][4] is CalendarLevel.PEAK  # May


def test_regional_seasons_only_name_real_species_and_regions() -> None:
    import json
    from pathlib import Path

    data = json.loads(
        (Path(__file__).parent.parent / "app/data/regional_seasons.json").read_text()
    )
    catalogue = {s["id"]: s for s in load_catalogue()}
    for species_id, regions in data["seasons"].items():
        assert species_id in catalogue, species_id
        for region, months in regions.items():
            assert region in catalogue[species_id]["regions"], (species_id, region)
            assert not set(months["peak"]) & set(months["good"]), species_id
            assert all(1 <= m <= 12 for m in months["peak"] + months["good"])


def _rated(score: int, verdict: str | None) -> dict[str, Any]:
    from app.domain.guidance import rate_picks_for_day

    pick = {"id": "x", "score": score, "tier": "prime", "reasons": ["Water 70°F"]}
    return rate_picks_for_day([pick], verdict)[0]


def test_poor_day_holds_every_pick_to_fair() -> None:
    rated = _rated(95, "Poor")
    assert rated["tier"] == "fair"
    assert rated["reasons"][0] == "Held to Fair: today is rated Poor here"


def test_challenging_day_drops_a_step() -> None:
    assert _rated(95, "Challenging")["tier"] == "good"
    assert _rated(75, "Challenging")["tier"] == "fair"


def test_good_day_leaves_tiers_alone_and_rating_is_idempotent() -> None:
    from app.domain.guidance import rate_picks_for_day

    assert _rated(95, "Good")["tier"] == "prime"
    once = _rated(95, "Poor")
    twice = rate_picks_for_day([once], "Poor")[0]
    assert twice["reasons"].count("Held to Fair: today is rated Poor here") == 1
    # Back to a good day (e.g. re-rated after personalizing): note removed.
    again = rate_picks_for_day([once], "Good")[0]
    assert again["tier"] == "prime" and again["reasons"] == ["Water 70°F"]


def test_strong_offshore_wind_is_not_called_clear_water() -> None:
    from app.domain.guidance import _conditions_modifier

    _, light = _conditions_modifier(
        ["calm_water"],
        coast="east",
        wind_direction="W",
        wind_range_kt=(5, 10),
        wave_range_ft=None,
        hour=None,
    )
    _, strong = _conditions_modifier(
        ["calm_water"],
        coast="east",
        wind_direction="W",
        wind_range_kt=(20, 25),
        wave_range_ft=None,
        hour=None,
    )
    assert any("keeps the water clear" in reason for reason in light)
    assert not any("keeps the water clear" in reason for reason in strong)


def test_spawning_scores_only_when_it_brings_fish_within_reach() -> None:
    from app.domain.guidance import _spawn_points

    red = {
        "spawn": {
            "months": [9],
            "temp_low": 70,
            "temp_high": 82,
            "note": "Red drum spawn near inlets and the surf zone.",
        }
    }
    wahoo = {
        "spawn": {
            "months": [9],
            "temp_low": 70,
            "temp_high": 82,
            "note": "Wahoo spawn in open water offshore.",
        }
    }
    assert _spawn_points(red, 9, 75.0) > 0
    assert _spawn_points(red, 9, 60.0) == 0  # water out of the spawning range
    assert _spawn_points(red, 4, 75.0) == 0  # out of season
    assert _spawn_points(wahoo, 9, 75.0) == 0


def test_runs_match_the_web_copy() -> None:
    """app/data/runs.json is copied from apps/web/lib/runs.ts; each run's
    id, months and fish must agree."""
    import re
    from pathlib import Path

    from app.domain.guidance import load_runs

    source = Path(__file__).resolve().parents[2] / "web" / "lib" / "runs.ts"
    if not source.exists():  # api checked out on its own
        pytest.skip("apps/web not present")
    text = source.read_text()
    web = {
        match.group(1): (
            [int(m) for m in re.findall(r"\d+", match.group(2))],
            re.findall(r"'([^']+)'", match.group(3)),
        )
        for match in re.finditer(
            r"id: '([^']+)',.*?months: \[([^\]]*)\],\s*fish: \[([^\]]*)\]",
            text,
            re.DOTALL,
        )
    }
    api = {run["id"]: (run["months"], run["fish"]) for run in load_runs()}
    assert web == api


def test_fish_in_an_active_run_get_the_bonus() -> None:
    from app.domain.guidance import _active_run

    assert _active_run("red-drum", "atlantic_south", 10) is not None
    assert _active_run("red-drum", "atlantic_south", 4) is None
    assert _active_run("red-drum", "pacific_north", 10) is None
    fall = build_fishing_guidance(
        region="atlantic_south",
        water_temp_f=72.0,
        water_temp_is_fallback=False,
        month=10,
        max_picks=200,
    )
    red = next(pick for pick in fall.species if pick.id == "red-drum")
    assert any(reason.endswith("run is on") for reason in red.reasons)


# --- real-world corrections (scripts/guidance_corrections.py) --------------


def _ids(guidance: object) -> set[str]:
    return {
        pick.id
        for pool in ("species", "boat_species", "tidal_species")
        for pick in getattr(guidance, pool)
    }


def test_gulf_summer_water_keeps_red_drum_and_trout() -> None:
    # Galveston in July: water around 86F, prime time for both.
    top = build_fishing_guidance(
        region="gulf", water_temp_f=86.0, water_temp_is_fallback=True, month=7
    )
    assert "speckled-trout" in {p.id for p in top.species}
    every = build_fishing_guidance(
        region="gulf",
        water_temp_f=86.0,
        water_temp_is_fallback=True,
        month=7,
        max_picks=1000,
    )
    assert "red-drum" in {p.id for p in every.species}


def test_protected_and_incidental_fish_are_never_picked() -> None:
    catalogue = {s["id"]: s for s in load_catalogue()}
    assert catalogue["sandbar-shark"]["access"] == "protected"
    assert catalogue["queen-angelfish"]["access"] == "incidental"
    for region, temp, month in (
        ("atlantic_south", 80.0, 7),
        ("atlantic_north", 40.0, 1),
        ("gulf", 75.0, 5),
    ):
        picked = _ids(
            build_fishing_guidance(
                region=region,
                water_temp_f=temp,
                water_temp_is_fallback=True,
                month=month,
                max_picks=1000,
            )
        )
        assert not any(
            catalogue[i]["access"] in ("protected", "incidental") for i in picked
        )


def test_hawaii_closed_seasons_are_never_picked() -> None:
    for month, closed in ((7, "moi"), (1, "amaama-mullet")):
        guidance = build_fishing_guidance(
            region="hawaii_conditions",
            water_temp_f=78.0,
            water_temp_is_fallback=True,
            month=month,
            max_picks=1000,
        )
        assert closed not in _ids(guidance)


def test_offshore_fish_offered_where_their_fisheries_are() -> None:
    catalogue = {s["id"]: s for s in load_catalogue()}
    assert "atlantic_mid" in catalogue["white-marlin"]["regions"]  # Ocean City
    assert "atlantic_north" in catalogue["atlantic-bluefin-tuna"]["regions"]
    assert catalogue["black-marlin"]["regions"] == ["hawaii_conditions"]
    assert "atlantic_north" not in catalogue["snowy-grouper"]["regions"]
    assert "longtail-tuna" not in catalogue


def test_spawn_notes_belong_to_their_own_fish() -> None:
    catalogue = {s["id"]: s for s in load_catalogue()}
    assert catalogue["king-mackerel"]["spawn"]["note"].startswith("King mackerel")
    assert catalogue["whiting-sea-mullet"]["spawn"]["note"].startswith("Whiting")
    assert catalogue["winter-flounder"]["spawn"]["note"].startswith("Winter flounder")


@pytest.mark.parametrize(
    ("today", "start", "end", "expected"),
    [
        (date(2026, 11, 25), "10-15", "11-30", True),
        (date(2026, 10, 14), "10-15", "11-30", False),
        (date(2026, 12, 1), "10-15", "11-30", False),
        (date(2026, 1, 10), "12-01", "03-31", True),  # wraps the new year
        (date(2026, 4, 1), "12-01", "03-31", False),
    ],
)
def test_in_period(today: date, start: str, end: str, expected: bool) -> None:
    assert _in_period(today, start, end) is expected


def test_exact_closure_dates_set_the_season_status() -> None:
    def status(species: str, state: str, day: date) -> str | None:
        reg = regulation_for(species, state, day)
        assert reg is not None
        return reg.season_status

    # TX flounder closes Oct 15 - Nov 30 (closed_periods).
    assert status("southern-flounder", "TX", date(2026, 6, 1)) == "open"
    assert status("southern-flounder", "TX", date(2026, 11, 25)) == "closed"
    # The month-level reading alone would call all of October closed.
    assert status("southern-flounder", "TX", date(2026, 10, 10)) == "open"
    assert status("southern-flounder", "TX", date(2026, 10, 15)) == "closed"
    fl = regulation_for("gulf-flounder", "FL", date(2026, 11, 1))
    assert (
        fl is not None and fl.season_status == "closed" and fl.bag_limit == "5 per day"
    )
    tx = regulation_for("southern-flounder", "TX", date(2026, 11, 25))
    assert tx is not None and tx.min_size == "15 in TL"


# --- season status (this month, read from the snapshot's season text) -------


@pytest.mark.parametrize(
    ("season", "month", "status", "note"),
    [
        ("Open year-round", 1, "open", None),
        ("Open year-round; peak April–September", 1, "open", None),
        ("Prohibited from retention", 6, "prohibited", "No harvest: release it"),
        ("Closed year-round", 6, "prohibited", "No harvest: release it"),
        ("Protected — no take", 6, "prohibited", "No harvest: release it"),
        ("Catch and release only", 6, "release_only", "Catch-and-release only"),
        ("Open year-round (C&R only)", 6, "release_only", "Catch-and-release only"),
        ("Apr 1 – Jun 30", 5, "open", None),
        ("Apr 1 – Jun 30", 11, "closed", "Closed season now: opens in April"),
        ("Seasonal (July–October)", 3, "closed", "Closed season now: opens in July"),
        ("Aug-Oct", 9, "open", None),
        # Wraps the new year.
        ("Jun 1 – Feb 28", 1, "open", None),
        ("Jun 1 – Feb 28", 4, "closed", "Closed season now: opens in June"),
        # Dates after "closed" are the closure, not the open season.
        ("Closed Jan 1–May 31 in federal waters", 11, "open", None),
        (
            "Closed Jan 1–May 31 in federal waters",
            3,
            "closed",
            "Closed season now in federal waters: check before keeping",
        ),
        ("Seasonal — closed Dec 1–Jan 31 and Jun 1–Aug 31", 11, "open", None),
        ("Seasonal — closed Dec 1–Jan 31 and Jun 1–Aug 31", 7, "closed", None),
        ("Seasonal — Gulf closed Jan–May; check FWC", 11, "open", None),
        ("March 1 through May 31 CLOSED in Gulf; verify", 4, "closed", None),
        # A season that varies never gets a firm "closed".
        ("Dec 1 – Aug 14 (varies)", 11, "check", None),
        ("Varies by area; coastal Dec–Sep; Puget Sound varies", 11, "check", None),
        (
            "Varies; many areas prohibit retention due to rebuilding plan",
            3,
            "check",
            None,
        ),
        ("Seasonal — check NY DEC for open dates", 6, "check", None),
        ("Federal season (varies yearly; typically Jun-Oct)", 1, "check", None),
        # Descriptive dates (when the fish is around) are not a season.
        ("Rare stray — Jun–Sep", 1, None, None),
        ("Apr – Oct (rare)", 1, None, None),
        ("Not present", 1, None, None),
        (None, 1, None, None),
    ],
)
def test_season_status(
    season: str | None, month: int, status: str | None, note: str | None
) -> None:
    from app.domain.guidance import season_status

    got_status, got_note = season_status(season, month)
    assert got_status == status
    if note is not None:
        assert got_note == note
    if status not in (None, "open"):
        assert got_note  # every status that matters says why


def test_every_snapshot_season_parses_without_error() -> None:
    from app.domain.guidance import load_regulations, season_status

    for rules in load_regulations()["states"].values():
        for entry in rules.values():
            for month in range(1, 13):
                status, _ = season_status(entry.get("season"), month)
                assert status in (
                    None,
                    "open",
                    "closed",
                    "release_only",
                    "prohibited",
                    "check",
                )


def test_regulation_carries_this_months_season_status() -> None:
    from datetime import date

    from app.domain.guidance import regulation_for

    reg = regulation_for("red-drum", "NC", date(2026, 5, 1))
    assert reg is not None
    assert reg.season_status in ("open", "check", None)
