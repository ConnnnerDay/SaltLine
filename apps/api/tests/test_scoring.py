"""Tests for app.domain.scoring.score_conditions and its helpers."""

from __future__ import annotations

from datetime import UTC, datetime

import pytest

from app.domain.models import Observation
from app.domain.scoring import (
    ForecastScore,
    ScoreVerdict,
    onshore_offshore_dirs,
    score_conditions,
    wind_orientation_for_region,
)
from app.providers.astronomy import (
    MoonPhaseName,
    SolunarRating,
    SolunarTimes,
    SunTimes,
)

_NOW = datetime(2024, 7, 15, 12, 0, tzinfo=UTC)


def _water_temp(value: float, *, is_fallback: bool = False) -> Observation:
    return Observation(
        value=value,
        unit="degF",
        provider="noaa_coops",
        station_id="8658163",
        observed_at=_NOW,
        is_fallback=is_fallback,
        fallback_reason="test fallback" if is_fallback else None,
    )


def _sun_times(sunrise: datetime, sunset: datetime) -> SunTimes:
    return SunTimes(sunrise=sunrise, sunset=sunset)


def _solunar(rating: SolunarRating, illumination_pct: float) -> SolunarTimes:
    return SolunarTimes(
        major_periods=[],
        minor_periods=[],
        rating=rating,
        moon_phase=MoonPhaseName.FULL,
        illumination_pct=illumination_pct,
    )


class TestUnknownWhenDataMissing:
    def test_wind_none_returns_unknown(self) -> None:
        result = score_conditions(None, (1.0, 2.0))
        assert result.score is None
        assert result.verdict == ScoreVerdict.UNKNOWN
        assert result.factors == []
        assert result.summary == ""

    def test_wave_none_returns_unknown(self) -> None:
        result = score_conditions((5.0, 10.0), None)
        assert result.score is None
        assert result.verdict == ScoreVerdict.UNKNOWN

    def test_both_none_returns_unknown(self) -> None:
        result = score_conditions(None, None)
        assert result.verdict == ScoreVerdict.UNKNOWN


class TestWindBands:
    @pytest.mark.parametrize(
        "wind_range,expected_impact",
        [
            ((3.0, 8.0), 14),
            ((8.0, 12.0), 8),
            ((12.0, 16.0), 2),
            ((16.0, 20.0), -8),
            ((20.0, 25.0), -16),
            ((25.0, 30.0), -26),
        ],
    )
    def test_wind_band_impact(
        self, wind_range: tuple[float, float], expected_impact: int
    ) -> None:
        result = score_conditions(wind_range, (0.0, 1.0))
        wind_factors = [f for f in result.factors if "kt)" in f.description]
        assert any(f.impact == expected_impact for f in wind_factors)


class TestWaveBands:
    @pytest.mark.parametrize(
        "wave_range,expected_impact",
        [
            ((0.5, 1.5), 10),
            ((1.5, 3.0), 6),
            ((3.0, 5.0), -4),
            ((5.0, 7.0), -12),
            ((7.0, 10.0), -22),
        ],
    )
    def test_wave_band_impact(
        self, wave_range: tuple[float, float], expected_impact: int
    ) -> None:
        result = score_conditions((0.0, 1.0), wave_range)
        wave_factors = [f for f in result.factors if "surf" in f.description.lower()]
        assert any(f.impact == expected_impact for f in wave_factors)


class TestWindDirection:
    def test_offshore_wind_bonus_east_coast(self) -> None:
        result = score_conditions(
            (5.0, 8.0), (1.0, 2.0), wind_direction="W", coast="east"
        )
        assert any(f.impact == 4 for f in result.factors)

    def test_no_clean_offshore_bonus_in_strong_wind(self) -> None:
        result = score_conditions(
            (20.0, 25.0), (1.0, 2.0), wind_direction="W", coast="east"
        )
        assert not any("offshore" in f.description for f in result.factors)

    def test_onshore_wind_penalty_east_coast(self) -> None:
        result = score_conditions(
            (5.0, 8.0), (1.0, 2.0), wind_direction="E", coast="east"
        )
        assert any(f.impact == -4 for f in result.factors)

    def test_no_direction_no_bonus_or_penalty(self) -> None:
        result = score_conditions((5.0, 8.0), (1.0, 2.0))
        assert not any(
            "offshore wind" in f.description or "Onshore wind" in f.description
            for f in result.factors
        )

    def test_hawaii_orientation_never_bonuses_or_penalizes(self) -> None:
        for direction in ("N", "S", "E", "W", "NE", "SW"):
            result = score_conditions(
                (5.0, 8.0), (1.0, 2.0), wind_direction=direction, coast="hawaii"
            )
            assert not any(
                "offshore wind" in f.description or "Onshore wind" in f.description
                for f in result.factors
            )


class TestWindOrientationForRegion:
    @pytest.mark.parametrize(
        "conditions_region,expected",
        [
            ("atlantic_mid", "east"),
            ("atlantic_north", "east"),
            ("atlantic_south", "east"),
            ("pacific", "west"),
            ("pacific_south", "west"),
            ("gulf", "gulf"),
            ("hawaii_conditions", "hawaii"),
            ("", "east"),
        ],
    )
    def test_region_maps_to_orientation(
        self, conditions_region: str, expected: str
    ) -> None:
        assert wind_orientation_for_region(conditions_region) == expected


class TestOnshoreOffshoreDirs:
    @pytest.mark.parametrize("orientation", ["east", "west", "gulf"])
    def test_onshore_offshore_disjoint_and_nonempty(self, orientation: str) -> None:
        onshore, offshore = onshore_offshore_dirs(orientation)
        assert onshore
        assert offshore
        assert onshore.isdisjoint(offshore)

    def test_hawaii_both_empty(self) -> None:
        onshore, offshore = onshore_offshore_dirs("hawaii")
        assert onshore == set()
        assert offshore == set()

    def test_unknown_orientation_falls_back_to_east(self) -> None:
        assert onshore_offshore_dirs("bogus") == onshore_offshore_dirs("east")


class TestWaterTemperature:
    def test_ideal_band_bonus(self) -> None:
        result = score_conditions(
            (5.0, 8.0), (1.0, 2.0), water_temperature=_water_temp(70.0)
        )
        assert any(f.impact == 6 for f in result.factors)
        # Live (non-fallback) reading adds +1, folded into the baseline —
        # not its own factor, so check it moved the score instead.
        baseline_result = score_conditions((5.0, 8.0), (1.0, 2.0))
        assert result.score is not None and baseline_result.score is not None
        assert result.score == baseline_result.score + 6 + 1

    def test_fair_band_bonus(self) -> None:
        result = score_conditions(
            (5.0, 8.0), (1.0, 2.0), water_temperature=_water_temp(52.0)
        )
        assert any(f.impact == 2 for f in result.factors)

    def test_off_peak_penalty(self) -> None:
        result = score_conditions(
            (5.0, 8.0), (1.0, 2.0), water_temperature=_water_temp(40.0)
        )
        assert any(f.impact == -4 for f in result.factors)

    def test_fallback_reading_does_not_get_live_bonus(self) -> None:
        live = score_conditions(
            (5.0, 8.0),
            (1.0, 2.0),
            water_temperature=_water_temp(70.0, is_fallback=False),
        )
        fallback = score_conditions(
            (5.0, 8.0),
            (1.0, 2.0),
            water_temperature=_water_temp(70.0, is_fallback=True),
        )
        assert live.score is not None and fallback.score is not None
        assert live.score == fallback.score + 1

    def test_no_water_temperature_no_effect(self) -> None:
        result = score_conditions((5.0, 8.0), (1.0, 2.0))
        assert not any("water temp" in f.description.lower() for f in result.factors)


class TestDawnDuskWindow:
    def test_at_sunrise_gets_dawn_bonus(self) -> None:
        sunrise = datetime(2024, 7, 15, 6, 0, tzinfo=UTC)
        sunset = datetime(2024, 7, 15, 20, 0, tzinfo=UTC)
        result = score_conditions(
            (5.0, 8.0),
            (1.0, 2.0),
            sun_times=_sun_times(sunrise, sunset),
            now=sunrise,
        )
        assert any(f.description == "Dawn bite window" for f in result.factors)

    def test_at_sunset_gets_dusk_bonus(self) -> None:
        sunrise = datetime(2024, 7, 15, 6, 0, tzinfo=UTC)
        sunset = datetime(2024, 7, 15, 20, 0, tzinfo=UTC)
        result = score_conditions(
            (5.0, 8.0),
            (1.0, 2.0),
            sun_times=_sun_times(sunrise, sunset),
            now=sunset,
        )
        assert any(f.description == "Dusk bite window" for f in result.factors)

    def test_midday_gets_neither(self) -> None:
        sunrise = datetime(2024, 7, 15, 6, 0, tzinfo=UTC)
        sunset = datetime(2024, 7, 15, 20, 0, tzinfo=UTC)
        midday = datetime(2024, 7, 15, 13, 0, tzinfo=UTC)
        result = score_conditions(
            (5.0, 8.0),
            (1.0, 2.0),
            sun_times=_sun_times(sunrise, sunset),
            now=midday,
        )
        assert not any("bite window" in f.description for f in result.factors)

    def test_missing_now_or_sun_times_no_effect(self) -> None:
        sunrise = datetime(2024, 7, 15, 6, 0, tzinfo=UTC)
        sunset = datetime(2024, 7, 15, 20, 0, tzinfo=UTC)
        no_now = score_conditions(
            (5.0, 8.0), (1.0, 2.0), sun_times=_sun_times(sunrise, sunset)
        )
        no_sun_times = score_conditions((5.0, 8.0), (1.0, 2.0), now=sunrise)
        assert not any("bite window" in f.description for f in no_now.factors)
        assert not any("bite window" in f.description for f in no_sun_times.factors)


class TestSolunar:
    def test_excellent_rating_bonus(self) -> None:
        result = score_conditions(
            (5.0, 8.0), (1.0, 2.0), solunar=_solunar(SolunarRating.EXCELLENT, 50.0)
        )
        assert any(
            f.description == "Major feeding window (solunar)" for f in result.factors
        )

    def test_good_rating_bonus(self) -> None:
        result = score_conditions(
            (5.0, 8.0), (1.0, 2.0), solunar=_solunar(SolunarRating.GOOD, 50.0)
        )
        assert any(f.description == "Good solunar period" for f in result.factors)

    def test_poor_rating_penalty(self) -> None:
        result = score_conditions(
            (5.0, 8.0), (1.0, 2.0), solunar=_solunar(SolunarRating.POOR, 50.0)
        )
        assert any(f.description == "Weak solunar period" for f in result.factors)

    def test_fair_rating_no_factor(self) -> None:
        result = score_conditions(
            (5.0, 8.0), (1.0, 2.0), solunar=_solunar(SolunarRating.FAIR, 50.0)
        )
        assert not any(
            f.description
            in {
                "Major feeding window (solunar)",
                "Good solunar period",
                "Weak solunar period",
            }
            for f in result.factors
        )

    def test_illumination_bonus_moves_score(self) -> None:
        mid_illum = score_conditions(
            (5.0, 8.0), (1.0, 2.0), solunar=_solunar(SolunarRating.FAIR, 60.0)
        )
        extreme_illum = score_conditions(
            (5.0, 8.0), (1.0, 2.0), solunar=_solunar(SolunarRating.FAIR, 2.0)
        )
        no_solunar = score_conditions((5.0, 8.0), (1.0, 2.0))
        assert mid_illum.score is not None and no_solunar.score is not None
        assert extreme_illum.score is not None
        assert mid_illum.score == no_solunar.score + 2
        assert extreme_illum.score == no_solunar.score + 1

    def test_no_solunar_no_effect(self) -> None:
        result = score_conditions((5.0, 8.0), (1.0, 2.0))
        baseline = score_conditions((5.0, 8.0), (1.0, 2.0))
        assert result.score == baseline.score


class TestVerdictTiers:
    def test_excellent_tier(self) -> None:
        # Wind+wave alone (50+14+10=74) can't clear the 80 Excellent floor;
        # add the other real-world bonuses that legitimately stack.
        result = score_conditions(
            (0.0, 3.0),
            (0.0, 0.5),
            wind_direction="W",
            coast="east",
            water_temperature=_water_temp(70.0),
        )
        assert result.verdict == ScoreVerdict.EXCELLENT

    @pytest.mark.parametrize(
        "wind_range,wave_range,expected_verdict",
        [
            ((10.0, 12.0), (0.0, 1.0), ScoreVerdict.GOOD),
            ((14.0, 16.0), (2.0, 3.0), ScoreVerdict.FAIR),
            ((18.0, 20.0), (4.0, 5.0), ScoreVerdict.CHALLENGING),
            ((28.0, 30.0), (8.0, 10.0), ScoreVerdict.POOR),
        ],
    )
    def test_verdict_boundaries(
        self,
        wind_range: tuple[float, float],
        wave_range: tuple[float, float],
        expected_verdict: ScoreVerdict,
    ) -> None:
        result = score_conditions(wind_range, wave_range)
        assert result.verdict == expected_verdict

    def test_score_clamped_to_0_100(self) -> None:
        worst = score_conditions(
            (40.0, 50.0),
            (15.0, 20.0),
            wind_direction="E",
            coast="east",
            water_temperature=_water_temp(20.0),
            solunar=_solunar(SolunarRating.POOR, 50.0),
        )
        assert worst.score is not None
        assert 0 <= worst.score <= 100


class TestFactorSortingAndSummary:
    def test_factors_sorted_by_absolute_impact_descending(self) -> None:
        result = score_conditions(
            (25.0, 30.0),
            (0.5, 1.0),
            wind_direction="W",
            coast="east",
        )
        impacts = [abs(f.impact) for f in result.factors]
        assert impacts == sorted(impacts, reverse=True)

    def test_summary_joins_top_four_descriptions(self) -> None:
        result = score_conditions(
            (25.0, 30.0),
            (8.0, 10.0),
            wind_direction="W",
            coast="east",
            water_temperature=_water_temp(70.0),
        )
        top_four = [f.description for f in result.factors[:4]]
        assert result.summary.endswith(".")
        assert result.summary.startswith(top_four[0])
        for part in top_four[1:]:
            assert part[:1].lower() + part[1:] in result.summary


def test_forecast_score_is_pydantic_model() -> None:
    result = score_conditions((5.0, 8.0), (1.0, 2.0))
    assert isinstance(result, ForecastScore)


def test_range_labels_round_and_collapse_equal_ends() -> None:
    from app.domain.scoring import _range_label

    assert _range_label((10.4, 13.4), "kt", step=1.0) == "10–13 kt"
    assert _range_label((4.4, 4.6), "ft", step=0.5) == "4.5 ft"
    assert _range_label((4.0, 4.0), "ft", step=0.5) == "4 ft"


def test_a_west_facing_gulf_beach_gets_west_winds_onshore() -> None:
    """Naples faces the Gulf to the west: a W wind is onshore there and an
    E wind offshore, the reverse of the south-facing Panhandle default."""
    from types import SimpleNamespace

    from app.domain.scoring import onshore_offshore_dirs, wind_orientation_for
    from app.domain.wind import wind_effect_for

    naples = SimpleNamespace(conditions_region="gulf", shore_facing_deg=265)
    orientation = wind_orientation_for(naples)
    onshore, offshore = onshore_offshore_dirs(orientation)
    assert {"W", "WSW", "WNW"} <= onshore and {"E", "ENE", "ESE"} <= offshore
    assert "N" not in onshore | offshore  # along the shore
    effect = wind_effect_for(orientation, "W")
    assert (effect.sea_bearing, effect.relation) == (265, "onshore")

    # Without a facing, the region's coast still applies.
    bridge = SimpleNamespace(conditions_region="gulf", shore_facing_deg=None)
    assert wind_orientation_for(bridge) == "gulf"


class TestWeatherAndAlerts:
    def test_falling_pressure_helps_rising_fast_hurts(self) -> None:
        base = score_conditions((5.0, 8.0), (1.0, 2.0)).score or 0
        falling = (
            score_conditions((5.0, 8.0), (1.0, 2.0), pressure_trend="falling").score
            or 0
        )
        rising = (
            score_conditions(
                (5.0, 8.0), (1.0, 2.0), pressure_trend="rising rapidly"
            ).score
            or 0
        )
        assert falling > base > rising

    def test_thunderstorms_cap_the_day_below_fair(self) -> None:
        result = score_conditions((0.0, 5.0), (0.5, 1.0), storms=True)
        assert result.verdict in (ScoreVerdict.CHALLENGING, ScoreVerdict.POOR)
        assert any("Thunderstorms" in f.description for f in result.factors)

    def test_gale_warning_makes_the_day_poor(self) -> None:
        result = score_conditions((0.0, 5.0), (0.5, 1.0), alerts=["Gale Warning"])
        assert result.verdict is ScoreVerdict.POOR
        assert result.summary.startswith("Gale Warning in effect")

    def test_surf_advisory_costs_points_once(self) -> None:
        base = score_conditions((5.0, 8.0), (1.0, 2.0)).score or 0
        once = (
            score_conditions(
                (5.0, 8.0),
                (1.0, 2.0),
                alerts=["High Surf Advisory", "High Surf Advisory"],
            ).score
            or 0
        )
        assert once == base - 7

    def test_cold_snap_against_the_monthly_normal(self) -> None:
        normal = (
            score_conditions(
                (5.0, 8.0),
                (1.0, 2.0),
                water_temperature=_water_temp(64),
                water_temp_normal_f=65,
            ).score
            or 0
        )
        cold = score_conditions(
            (5.0, 8.0),
            (1.0, 2.0),
            water_temperature=_water_temp(58),
            water_temp_normal_f=65,
        )
        assert any("colder than normal" in f.description for f in cold.factors)
        assert (cold.score or 0) < normal

    def test_overcast_helps_snow_hurts(self) -> None:
        base = score_conditions((5.0, 8.0), (1.0, 2.0)).score or 0
        cloudy = score_conditions((5.0, 8.0), (1.0, 2.0), sky="cloudy").score or 0
        snow = score_conditions((5.0, 8.0), (1.0, 2.0), sky="snow").score or 0
        assert cloudy > base > snow

    def test_minor_alerts_cost_a_little(self) -> None:
        base = score_conditions((5.0, 8.0), (1.0, 2.0)).score or 0
        fog = score_conditions((5.0, 8.0), (1.0, 2.0), alerts=["Dense Fog Advisory"])
        rip = score_conditions((5.0, 8.0), (1.0, 2.0), alerts=["Rip Current Statement"])
        assert (fog.score or 0) == base - 3
        assert (rip.score or 0) == base - 2
        assert fog.verdict is not ScoreVerdict.POOR

    def test_gusts_well_above_the_range_cost_points(self) -> None:
        base = score_conditions((10.0, 15.0), (1.0, 2.0)).score or 0
        gusty = score_conditions((10.0, 15.0), (1.0, 2.0), wind_gust_kt=28).score or 0
        mild = score_conditions((10.0, 15.0), (1.0, 2.0), wind_gust_kt=18).score or 0
        assert gusty == base - 4
        assert mild == base

    def test_long_period_groundswell_means_heavy_shorebreak(self) -> None:
        base = score_conditions((5.0, 8.0), (1.0, 2.0)).score or 0
        ground = score_conditions((5.0, 8.0), (1.0, 2.0), swell=[(4.0, 14), (2.0, 5)])
        chop = score_conditions((5.0, 8.0), (1.0, 2.0), swell=[(4.0, 6)])
        assert (ground.score or 0) == base - 4
        assert any("groundswell" in f.description for f in ground.factors)
        assert (chop.score or 0) == base

    def test_rip_current_risk_counts_once(self) -> None:
        base = score_conditions((5.0, 8.0), (1.0, 2.0)).score or 0
        high = score_conditions(
            (5.0, 8.0),
            (1.0, 2.0),
            rip_current_risk="High",
            alerts=["Rip Current Statement"],
        )
        assert (high.score or 0) == base - 4
        assert sum("rip current" in f.description.lower() for f in high.factors) == 1

    def test_freezing_air(self) -> None:
        base = score_conditions((5.0, 8.0), (1.0, 2.0)).score or 0
        cold = score_conditions((5.0, 8.0), (1.0, 2.0), air_temp_f=28).score or 0
        assert cold == base - 3

    def test_water_temperature_swings(self) -> None:
        base = (
            score_conditions(
                (5.0, 8.0), (1.0, 2.0), water_temperature=_water_temp(60)
            ).score
            or 0
        )
        drop = (
            score_conditions(
                (5.0, 8.0),
                (1.0, 2.0),
                water_temperature=_water_temp(60),
                water_temp_change_24h=-4,
            ).score
            or 0
        )
        warm = (
            score_conditions(
                (5.0, 8.0),
                (1.0, 2.0),
                water_temperature=_water_temp(60),
                water_temp_change_24h=2.5,
            ).score
            or 0
        )
        hot = score_conditions(
            (5.0, 8.0),
            (1.0, 2.0),
            water_temperature=_water_temp(80),
            water_temp_change_24h=2.5,
        )
        assert drop == base - 5
        assert warm == base + 3
        assert not any("warmed" in f.description for f in hot.factors)

    def test_no_pre_front_bonus_once_the_storm_is_here(self) -> None:
        gale = score_conditions((25.0, 30.0), (6.0, 11.0), pressure_trend="falling")
        storm = score_conditions(
            (5.0, 8.0), (1.0, 2.0), pressure_trend="falling", storms=True
        )
        for result in (gale, storm):
            assert not any("Falling pressure" in f.description for f in result.factors)


class TestSeason:
    def test_winter_full_of_winter_fish_scores_like_summer(self) -> None:
        winter = score_conditions(
            (5.0, 10.0),
            (1.0, 2.0),
            water_temperature=_water_temp(40),
            fish_in_season=(6, 6),
        )
        summer = score_conditions(
            (5.0, 10.0),
            (1.0, 2.0),
            water_temperature=_water_temp(68),
            fish_in_season=(6, 6),
        )
        assert winter.score == summer.score
        assert not any("Off-peak" in f.description for f in winter.factors)

    def test_season_factor_follows_how_many_fish_are_working(self) -> None:
        def day(fish: tuple[int, int]) -> int:
            return (
                score_conditions((5.0, 10.0), (1.0, 2.0), fish_in_season=fish).score
                or 0
            )

        assert day((6, 6)) > day((2, 6)) > day((0, 6)) > day((0, 0))

    def test_without_fish_counts_the_old_water_bands_apply(self) -> None:
        cold = score_conditions(
            (5.0, 10.0), (1.0, 2.0), water_temperature=_water_temp(40)
        )
        assert any("Off-peak water temp" in f.description for f in cold.factors)


class TestStyles:
    def test_surf_is_the_default(self) -> None:
        plain = score_conditions(
            (5.0, 10.0), (3.0, 5.0), wind_direction="W", coast="east"
        )
        surf = score_conditions(
            (5.0, 10.0), (3.0, 5.0), wind_direction="W", coast="east", style="surf"
        )
        assert plain == surf

    def test_pier_barely_minds_surf_that_beats_up_the_beach(self) -> None:
        surf = score_conditions((5.0, 10.0), (3.0, 5.0), style="surf").score or 0
        pier = score_conditions((5.0, 10.0), (3.0, 5.0), style="pier").score or 0
        assert pier > surf
        # Big enough surf closes piers: still a real penalty.
        huge = score_conditions((5.0, 10.0), (8.0, 10.0), style="pier")
        assert any(f.impact <= -12 for f in huge.factors)

    def test_kayak_offshore_wind_is_a_danger_not_a_bonus(self) -> None:
        surf = score_conditions(
            (5.0, 8.0), (1.0, 2.0), wind_direction="W", coast="east"
        )
        kayak = score_conditions(
            (5.0, 8.0), (1.0, 2.0), wind_direction="W", coast="east", style="kayak"
        )
        assert any(f.description.startswith("Clean offshore") for f in surf.factors)
        assert any(
            "blows you away from shore" in f.description and f.impact < 0
            for f in kayak.factors
        )

    def test_kayak_is_stricter_about_wind(self) -> None:
        surf = score_conditions((10.0, 14.0), (1.0, 2.0)).score or 0
        kayak = score_conditions((10.0, 14.0), (1.0, 2.0), style="kayak").score or 0
        assert kayak < surf

    def test_jetty_is_harder_on_big_surf_and_groundswell(self) -> None:
        surf = score_conditions((5.0, 10.0), (4.0, 6.0), swell=[(4.0, 13)]).score or 0
        jetty = (
            score_conditions(
                (5.0, 10.0), (4.0, 6.0), swell=[(4.0, 13)], style="jetty"
            ).score
            or 0
        )
        assert jetty < surf

    def test_rip_currents_only_count_in_the_water(self) -> None:
        for style, counts in (
            ("surf", True),
            ("wade", True),
            ("pier", False),
            ("inshore", False),
        ):
            result = score_conditions(
                (5.0, 8.0),
                (1.0, 2.0),
                rip_current_risk="High",
                alerts=["Rip Current Statement"],
                style=style,
            )
            assert (
                any("rip current" in f.description.lower() for f in result.factors)
                is counts
            )

    def test_small_craft_advisory_matters_afloat(self) -> None:
        def cost(style: str) -> int:
            base = score_conditions((5.0, 8.0), (1.0, 2.0), style=style).score or 0
            sca = (
                score_conditions(
                    (5.0, 8.0), (1.0, 2.0), alerts=["Small Craft Advisory"], style=style
                ).score
                or 0
            )
            return base - sca

        assert cost("kayak") > cost("inshore") > cost("surf") > cost("pier")

    def test_boats_talk_about_seas_and_ignore_beach_wind_direction(self) -> None:
        boat = score_conditions(
            (5.0, 8.0), (1.0, 2.0), wind_direction="E", coast="east", style="offshore"
        )
        assert any(f.description.startswith("Light seas") for f in boat.factors)
        assert not any("Onshore" in f.description for f in boat.factors)

    def test_unknown_style_falls_back_to_surf(self) -> None:
        assert score_conditions(
            (5.0, 8.0), (1.0, 2.0), style="spaceship"
        ) == score_conditions((5.0, 8.0), (1.0, 2.0))

    def test_swimmer_warnings_only_count_in_the_water(self) -> None:
        for style, counts in (("surf", True), ("pier", False), ("kayak", False)):
            result = score_conditions(
                (5.0, 8.0), (1.0, 2.0), alerts=["Beach Hazards Statement"], style=style
            )
            assert (
                any("Beach Hazards" in f.description for f in result.factors) is counts
            )

    def test_style_specific_wording(self) -> None:
        kayak = score_conditions(
            (5.0, 10.0), (1.0, 2.0), wind_direction="E", coast="east", style="kayak"
        )
        assert any("choppy paddling" in f.description for f in kayak.factors)
        boat = score_conditions(
            (5.0, 10.0), (3.0, 5.0), swell=[(4.0, 13)], style="offshore"
        )
        assert any("big, powerful swell" in f.description for f in boat.factors)
        assert not any("shorebreak" in f.description for f in boat.factors)

    def test_kayak_does_not_like_launching_through_3_ft(self) -> None:
        kayak = score_conditions((3.0, 5.0), (2.0, 3.0), style="kayak")
        surf_band = next(
            f for f in kayak.factors if f.description.startswith("Light surf")
        )
        assert surf_band.impact == 2

    def test_wind_direction_names_the_shore_when_it_is_known(self) -> None:
        south = score_conditions(
            (5.0, 10.0),
            (1.0, 2.0),
            wind_direction="NE",
            coast="facing:190",
            style="kayak",
        )
        assert any(
            f.description.startswith("Offshore wind (NE) on this south-facing shore")
            for f in south.factors
        )
        region = score_conditions(
            (5.0, 8.0), (1.0, 2.0), wind_direction="W", coast="east"
        )
        assert any(f.description == "Clean offshore wind (W)" for f in region.factors)

    def test_wind_is_named_by_its_speed_not_the_style_band(self) -> None:
        kayak = score_conditions((20.0, 25.0), (1.0, 2.0), style="kayak")
        assert any(
            f.description == "Very strong wind (20–25 kt)" for f in kayak.factors
        )
        gale = score_conditions((30.0, 40.0), (1.0, 2.0))
        assert any(f.description.startswith("Gale-force wind") for f in gale.factors)
