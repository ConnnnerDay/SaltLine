"""Tests for app.providers.nws.

Parsing tests use literal fixture text/JSON, matching known NWS response
shapes. Fetch tests go through httpx.MockTransport via BoundedHTTPClient —
no live network calls, per docs/R2_CI_BASELINE.md's
no-live-provider-dependence rule for CI.
"""

from __future__ import annotations

import httpx
import pytest

from app.infra.http_client import (
    BoundedHTTPClient,
    ProviderHTTPStatusError,
    ProviderParseError,
)
from app.providers.nws import (
    GridpointWindForecast,
    MarineZoneConditions,
    fetch_gridpoint_wind,
    fetch_marine_zone_conditions,
    fetch_point_alerts,
    fetch_state_alerts,
    parse_gridpoint_wind,
    parse_marine_zone_conditions,
)


def _period(text: str) -> dict[str, str]:
    return {"detailedForecast": text}


def test_parse_marine_zone_conditions_abbreviated_direction() -> None:
    periods = [_period("SW wind 10 to 15 kt. Seas 2 to 3 ft.")]

    result = parse_marine_zone_conditions(periods)

    assert result.model_copy(update={"days": []}) == MarineZoneConditions(
        wind_low_kt=10.0,
        wind_high_kt=15.0,
        wind_direction="SW",
        wave_low_ft=2.0,
        wave_high_ft=3.0,
    )


def test_parse_marine_zone_conditions_spelled_out_direction_and_around() -> None:
    periods = [_period("Southwest wind around 10 knots. Seas around 2 feet.")]

    result = parse_marine_zone_conditions(periods)

    assert result.wind_direction == "SW"
    assert result.wind_low_kt == 10.0
    assert result.wind_high_kt == 10.0
    assert result.wave_low_ft == 2.0
    assert result.wave_high_ft == 2.0


def test_parse_marine_zone_conditions_takes_min_max_across_first_three_periods() -> (
    None
):
    periods = [
        _period("N wind 5 to 10 kt. Seas 1 to 2 ft."),
        _period("NE wind 15 to 20 kt. Seas 3 to 4 ft."),
        _period("E wind 8 kt. Seas 2 ft."),
        _period("S wind 30 kt. Seas 8 ft."),  # outside the first-3 window, ignored
    ]

    result = parse_marine_zone_conditions(periods)

    assert result.wind_direction == "N"
    assert result.wind_low_kt == 5.0
    assert result.wind_high_kt == 20.0
    assert result.wave_low_ft == 1.0
    assert result.wave_high_ft == 4.0


def test_parse_marine_zone_conditions_missing_fields_are_none() -> None:
    periods = [_period("Patchy fog after midnight.")]

    result = parse_marine_zone_conditions(periods)

    assert result.model_copy(update={"days": []}) == MarineZoneConditions()


def test_parse_marine_zone_conditions_empty_periods() -> None:
    assert parse_marine_zone_conditions([]) == MarineZoneConditions()


@pytest.mark.asyncio
async def test_fetch_marine_zone_conditions_parses_response() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/zones/forecast/AMZ158/forecast"
        return httpx.Response(
            200,
            json={
                "properties": {
                    "periods": [_period("SW wind 10 to 15 kt. Seas 2 to 3 ft.")]
                }
            },
        )

    transport = httpx.MockTransport(handler)
    async with BoundedHTTPClient(transport=transport) as client:
        result = await fetch_marine_zone_conditions(client, zone="AMZ158")

    assert result.wind_low_kt == 10.0
    assert result.wave_high_ft == 3.0


@pytest.mark.asyncio
async def test_fetch_marine_zone_conditions_propagates_provider_error() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(503)

    transport = httpx.MockTransport(handler)
    async with BoundedHTTPClient(
        transport=transport, max_retries=0, backoff_base_seconds=0.0
    ) as client:
        with pytest.raises(ProviderHTTPStatusError):
            await fetch_marine_zone_conditions(client)


def _gridpoint_period(wind_speed: str = "", wind_direction: str = "") -> dict[str, str]:
    return {"windSpeed": wind_speed, "windDirection": wind_direction}


def test_parse_gridpoint_wind_single_value() -> None:
    periods = [_gridpoint_period("10 mph", "SW")]

    result = parse_gridpoint_wind(periods)

    assert result.wind_direction == "SW"
    assert result.wind_low_kt == round(10 * 0.868976, 1)
    assert result.wind_high_kt == round(10 * 0.868976, 1)


def test_parse_gridpoint_wind_range() -> None:
    periods = [_gridpoint_period("5 to 10 mph", "NE")]

    result = parse_gridpoint_wind(periods)

    assert result.wind_low_kt == round(5 * 0.868976, 1)
    assert result.wind_high_kt == round(10 * 0.868976, 1)


def test_parse_gridpoint_wind_direction_is_already_abbreviated_no_mapping_needed() -> (
    None
):
    """Unlike parse_marine_zone_conditions, the gridpoint API returns
    windDirection pre-abbreviated (e.g. "SW", not "Southwest") — no
    _DIR_MAP lookup should be applied.
    """
    periods = [_gridpoint_period("10 mph", "SW")]

    result = parse_gridpoint_wind(periods)

    assert result.wind_direction == "SW"


def test_parse_gridpoint_wind_takes_min_max_across_first_three_periods() -> None:
    periods = [
        _gridpoint_period("5 mph", "N"),
        _gridpoint_period("15 mph", "NE"),
        _gridpoint_period("8 mph", "E"),
        _gridpoint_period("30 mph", "S"),  # outside the first-3 window, ignored
    ]

    result = parse_gridpoint_wind(periods)

    assert result.wind_direction == "N"  # first period's direction
    assert result.wind_low_kt == round(5 * 0.868976, 1)
    assert result.wind_high_kt == round(15 * 0.868976, 1)


def test_parse_gridpoint_wind_missing_fields_are_none() -> None:
    periods = [_gridpoint_period()]

    result = parse_gridpoint_wind(periods)

    assert result == GridpointWindForecast()


def test_parse_gridpoint_wind_empty_periods() -> None:
    assert parse_gridpoint_wind([]) == GridpointWindForecast()


@pytest.mark.asyncio
async def test_fetch_gridpoint_wind_parses_response() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/points/34.21,-77.8":
            return httpx.Response(
                200,
                json={
                    "properties": {
                        "forecast": "https://api.weather.gov/gridpoints/ILM/1,1/forecast"
                    }
                },
            )
        assert request.url.path == "/gridpoints/ILM/1,1/forecast"
        return httpx.Response(
            200, json={"properties": {"periods": [_gridpoint_period("10 mph", "SW")]}}
        )

    transport = httpx.MockTransport(handler)
    async with BoundedHTTPClient(transport=transport) as client:
        result = await fetch_gridpoint_wind(client, 34.21, -77.8)

    assert result is not None
    assert result.wind_direction == "SW"


@pytest.mark.asyncio
async def test_fetch_gridpoint_wind_degrades_to_none_on_provider_error() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(503)

    transport = httpx.MockTransport(handler)
    async with BoundedHTTPClient(
        transport=transport, max_retries=0, backoff_base_seconds=0.0
    ) as client:
        result = await fetch_gridpoint_wind(client, 34.21, -77.8)

    assert result is None


@pytest.mark.asyncio
async def test_fetch_gridpoint_wind_degrades_to_none_when_points_lookup_fails() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/points/34.21,-77.8":
            return httpx.Response(200, json={"properties": {"forecast": "https://x"}})
        return httpx.Response(503)

    transport = httpx.MockTransport(handler)
    async with BoundedHTTPClient(
        transport=transport, max_retries=0, backoff_base_seconds=0.0
    ) as client:
        result = await fetch_gridpoint_wind(client, 34.21, -77.8)

    assert result is None


def test_parse_alerts_geojson_shape() -> None:
    from app.providers.nws import _parse_alerts

    payload = {
        "features": [
            {
                "properties": {
                    "event": "Small Craft Advisory",
                    "severity": "Moderate",
                    "headline": "Small Craft Advisory in effect",
                    "description": "x" * 400,
                }
            },
            {"properties": {"event": ""}},  # no event, dropped
        ]
    }

    alerts = _parse_alerts(payload, limit=5)

    assert len(alerts) == 1
    assert alerts[0].event == "Small Craft Advisory"
    assert len(alerts[0].description) == 300


def test_parse_alerts_json_ld_shape() -> None:
    from app.providers.nws import _parse_alerts

    payload = {
        "@graph": [
            {
                "event": "Gale Warning",
                "severity": "Severe",
                "headline": "Gale Warning in effect",
                "description": "strong winds expected",
            }
        ]
    }

    alerts = _parse_alerts(payload, limit=5)

    assert len(alerts) == 1
    assert alerts[0].event == "Gale Warning"


def test_parse_alerts_respects_limit() -> None:
    from app.providers.nws import _parse_alerts

    payload = {"features": [{"properties": {"event": f"Alert {i}"}} for i in range(10)]}

    alerts = _parse_alerts(payload, limit=3)

    assert len(alerts) == 3


@pytest.mark.asyncio
async def test_fetch_point_alerts_returns_empty_on_failure() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(500)

    transport = httpx.MockTransport(handler)
    async with BoundedHTTPClient(
        transport=transport, max_retries=0, backoff_base_seconds=0.0
    ) as client:
        alerts = await fetch_point_alerts(client, 34.2, -77.8)

    assert alerts == []


@pytest.mark.asyncio
async def test_fetch_point_alerts_success() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert "point=34.2,-77.8" in str(request.url)
        return httpx.Response(
            200,
            json={"features": [{"properties": {"event": "Rip Current Statement"}}]},
        )

    transport = httpx.MockTransport(handler)
    async with BoundedHTTPClient(transport=transport) as client:
        alerts = await fetch_point_alerts(client, 34.2, -77.8)

    assert len(alerts) == 1
    assert alerts[0].event == "Rip Current Statement"


@pytest.mark.asyncio
async def test_fetch_state_alerts_empty_state_code_short_circuits() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise AssertionError("should not be called for an empty state code")

    transport = httpx.MockTransport(handler)
    async with BoundedHTTPClient(transport=transport) as client:
        alerts = await fetch_state_alerts(client, "")

    assert alerts == []


@pytest.mark.asyncio
async def test_fetch_state_alerts_uppercases_state_code() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert "area=NC" in str(request.url)
        return httpx.Response(200, json={"features": []})

    transport = httpx.MockTransport(handler)
    async with BoundedHTTPClient(transport=transport) as client:
        alerts = await fetch_state_alerts(client, "nc")

    assert alerts == []


# --- JSON-LD shape (what `_NWS_HEADERS`' `Accept: application/ld+json`
# actually returns live: fields at the top level, no `properties`). The
# GeoJSON-only parsing this replaced raised KeyError on every live call,
# which 500'd the whole forecast on a real deployment.


@pytest.mark.asyncio
async def test_fetch_marine_zone_conditions_parses_json_ld_shape() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={
                "@context": {"@version": "1.1"},
                "zone": "https://api.weather.gov/zones/forecast/AMZ158",
                "periods": [_period("SW wind 10 to 15 kt. Seas 2 to 3 ft.")],
            },
        )

    async with BoundedHTTPClient(transport=httpx.MockTransport(handler)) as client:
        result = await fetch_marine_zone_conditions(client, zone="AMZ158")

    assert result.wind_low_kt == 10.0
    assert result.wave_high_ft == 3.0


@pytest.mark.asyncio
async def test_fetch_marine_zone_conditions_unexpected_shape_is_a_provider_error() -> (
    None
):
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"@context": {}, "unexpected": True})

    async with BoundedHTTPClient(transport=httpx.MockTransport(handler)) as client:
        with pytest.raises(ProviderParseError):
            await fetch_marine_zone_conditions(client, zone="AMZ158")


@pytest.mark.asyncio
async def test_fetch_gridpoint_wind_parses_json_ld_shape() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/points/34.21,-77.8":
            return httpx.Response(
                200,
                json={
                    "forecast": "https://api.weather.gov/gridpoints/ILM/1,1/forecast"
                },
            )
        return httpx.Response(
            200, json={"periods": [_gridpoint_period("10 mph", "SW")]}
        )

    async with BoundedHTTPClient(transport=httpx.MockTransport(handler)) as client:
        result = await fetch_gridpoint_wind(client, 34.21, -77.8)

    assert result is not None
    assert result.wind_direction == "SW"


@pytest.mark.asyncio
async def test_fetch_gridpoint_wind_unexpected_shape_degrades_to_none() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"@context": {}})

    async with BoundedHTTPClient(transport=httpx.MockTransport(handler)) as client:
        assert await fetch_gridpoint_wind(client, 34.21, -77.8) is None


def test_parse_alerts_drops_tests_and_cancellations() -> None:
    from app.providers.nws import _parse_alerts

    def feature(**props: object) -> dict[str, object]:
        return {
            "properties": {"event": "Small Craft Advisory", "headline": "SCA", **props}
        }

    payload = {
        "features": [
            feature(
                headline="TEST Tsunami Warning issued ...", event="Tsunami Warning"
            ),
            feature(status="Test"),
            feature(status="Exercise"),
            feature(messageType="Cancel"),
            feature(status="Actual", ends="2026-11-17T18:00:00-05:00"),
        ]
    }
    alerts = _parse_alerts(payload, limit=5)
    assert [alert.event for alert in alerts] == ["Small Craft Advisory"]
    assert alerts[0].expires is not None and alerts[0].expires.hour == 18


def test_parse_alerts_limit_counts_kept_alerts_only() -> None:
    from app.providers.nws import _parse_alerts

    payload = {
        "features": [
            {"properties": {"event": "Tsunami Warning", "headline": "TEST ..."}},
            {"properties": {"event": "Gale Warning", "headline": "Gale"}},
        ]
    }
    assert [a.event for a in _parse_alerts(payload, limit=1)] == ["Gale Warning"]


def test_parse_marine_zone_days_groups_day_and_night_periods() -> None:
    from app.providers.nws import parse_marine_zone_days

    periods = [
        {
            "name": "Rest Of Today",
            "detailedForecast": "NE winds 10 to 15 kt. Seas 2 to 4 ft.",
        },
        {
            "name": "Tonight",
            "detailedForecast": "NE winds 15 to 20 kt. Seas 3 to 5 ft.",
        },
        {"name": "Wed", "detailedForecast": "N winds around 10 kt. Seas 2 ft."},
        {
            "name": "Wed Night",
            "detailedForecast": "N winds 5 to 10 kt. Seas 1 to 2 ft.",
        },
        {"name": "Thu", "detailedForecast": "Variable winds less than 5 kt."},
    ]
    days = parse_marine_zone_days(periods)
    assert [day.label for day in days] == ["Rest Of Today", "Wed", "Thu"]
    today, wed, thu = days
    assert (today.wind_low_kt, today.wind_high_kt, today.wave_high_ft) == (10, 20, 5)
    assert (wed.wind_low_kt, wed.wind_high_kt, wed.wave_low_ft, wed.wave_high_ft) == (
        5,
        10,
        1,
        2,
    )
    assert wed.wind_direction == "N"
    assert thu.wave_low_ft is None  # never guessed when the text doesn't say


def test_parse_marine_zone_days_when_forecast_starts_at_night() -> None:
    from app.providers.nws import parse_marine_zone_days

    periods = [
        {"name": "Tonight", "detailedForecast": "S winds 10 kt. Seas 2 ft."},
        {"name": "Wed", "detailedForecast": "S winds 15 kt. Seas 3 ft."},
    ]
    assert [day.label for day in parse_marine_zone_days(periods)] == ["Tonight", "Wed"]


def test_pick_marine_zone_prefers_the_open_coast_nearshore_zone() -> None:
    from app.providers.nws import pick_marine_zone

    # A zone containing the point wins (unless it's an offshore zone).
    assert (
        pick_marine_zone({"ANZ452": ("Coastal waters from Little Egg Inlet ...", 0.0)})
        == "ANZ452"
    )
    # A beach point off the water: nearshore coast beats a bay, and both
    # beat the 20-60 nm zone, even if those are closer.
    assert (
        pick_marine_zone(
            {
                "GMZ830": ("Tampa Bay waters", 2.0),
                "GMZ870": (
                    "Waters from Tarpon Springs to Suwannee River 20 to 60 NM",
                    2.0,
                ),
                "GMZ853": (
                    "Coastal waters from Englewood to Tarpon Springs FL out 20 NM",
                    5.0,
                ),
            }
        )
        == "GMZ853"
    )
    assert pick_marine_zone({}) is None


@pytest.mark.asyncio
async def test_find_marine_zone_probes_around_a_point_on_land() -> None:
    from app.providers.nws import find_marine_zone

    def handler(request: httpx.Request) -> httpx.Response:
        lat = float(str(request.url.params["point"]).split(",")[0])
        if lat > 39.0:  # only points north of the spot are over water
            return httpx.Response(
                200,
                json={
                    "features": [
                        {"properties": {"id": "ANZ452", "name": "Coastal waters"}}
                    ]
                },
            )
        return httpx.Response(200, json={"features": []})

    async with BoundedHTTPClient(
        transport=httpx.MockTransport(handler), max_retries=0, backoff_base_seconds=0.0
    ) as client:
        assert await find_marine_zone(client, 38.99, -74.8) == "ANZ452"


def test_marine_ranges_follow_changes_later_in_a_period() -> None:
    """NWS text often changes mid-period; the range has to cover it.
    Gusts and "occasionally to" sets aren't the sustained range."""
    from app.providers.nws import parse_marine_zone_conditions

    def period(text: str) -> dict[str, str]:
        return {"name": "Tonight", "detailedForecast": text}

    rising = parse_marine_zone_conditions(
        [
            period(
                "Northeast winds 20 to 25 knots, increasing to 25 to 30 knots in "
                "the afternoon. Occasional gusts to Gale Force. Seas 7 to 9 feet, "
                "occasionally to 11 feet, building to 8 to 11 feet, occasionally "
                "to 14 feet in the afternoon. Wave Detail: East 9 feet at 9 seconds."
            )
        ]
    )
    assert (rising.wind_low_kt, rising.wind_high_kt) == (20, 30)
    assert (rising.wave_low_ft, rising.wave_high_ft) == (7, 11)

    gusty = parse_marine_zone_conditions(
        [
            period(
                "NE winds 15 to 20 kt with gusts up to 25 kt. Seas 1 foot or less, "
                "then around 2 ft after midnight. Wave Detail: SE 1 foot at 9 seconds."
            )
        ]
    )
    assert (gusty.wind_low_kt, gusty.wind_high_kt) == (15, 20)
    assert (gusty.wave_low_ft, gusty.wave_high_ft) == (1, 2)


# --- Coastal Waters Forecast text fallback (Alaska zones) -------------------

_CWF_SAMPLE = """000
FZAK52 PAFC 280007
CWFAER

Coastal Waters Forecast for Southcentral Alaska
National Weather Service Anchorage AK
307 PM AKST Fri Nov 27 2026

PKZ714-281200-
Resurrection Bay-
307 PM AKST Fri Nov 27 2026

.TONIGHT...Variable wind 10 kt becoming N after midnight. Seas 2
ft.
.SAT...N wind 10 kt. Seas 2 ft.
.SAT NIGHT...N wind 15 kt. Seas 3 ft.
.SUN AND SUN NIGHT...NE wind 20 kt. Seas 4 ft.

$$

PKZ740>742-
281200-
Cook Inlet-
307 PM AKST Fri Nov 27 2026

.TONIGHT...SW wind 20 kt. Seas 5 ft.
.SAT...W wind 10 kt. Seas 3 ft.

$$
"""


def test_cwf_periods_for_a_single_zone() -> None:
    from app.providers.nws import parse_cwf_zone_periods

    periods = parse_cwf_zone_periods(_CWF_SAMPLE, "PKZ714")
    assert [p["name"] for p in periods] == ["Tonight", "Sat", "Sat Night", "Sun"]
    # Wrapped lines are joined.
    assert periods[0]["detailedForecast"] == (
        "Variable wind 10 kt becoming N after midnight. Seas 2 ft."
    )


def test_cwf_periods_for_a_zone_inside_a_range_header() -> None:
    from app.providers.nws import parse_cwf_zone_periods, parse_marine_zone_conditions

    periods = parse_cwf_zone_periods(_CWF_SAMPLE, "PKZ741")
    conditions = parse_marine_zone_conditions(periods)
    assert conditions.wind_direction == "SW"
    assert (conditions.wind_low_kt, conditions.wind_high_kt) == (10.0, 20.0)
    assert (conditions.wave_low_ft, conditions.wave_high_ft) == (3.0, 5.0)


def test_cwf_has_nothing_for_an_unlisted_zone() -> None:
    from app.providers.nws import parse_cwf_zone_periods

    assert parse_cwf_zone_periods(_CWF_SAMPLE, "PKZ999") == []


def test_cwf_issuers_look_in_the_likeliest_bulletin_first() -> None:
    from app.providers.nws import _cwf_issuers

    assert _cwf_issuers("PKZ642")[0] == "AEG"  # Sitka's outer coast
    assert _cwf_issuers("PKZ031")[:2] == ("AJK", "YAK")  # Juneau inside waters
    assert _cwf_issuers("PKZ740")[0] == "AER"  # Cook Inlet
    assert set(_cwf_issuers("PKZ740")) == {"AER", "ALU", "AJK", "AEG", "YAK"}
    assert _cwf_issuers("ANZ250") == ()
