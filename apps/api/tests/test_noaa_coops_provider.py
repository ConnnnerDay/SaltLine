"""Tests for app.providers.noaa_coops.

Fetch tests go through httpx.MockTransport via BoundedHTTPClient — no live
network calls, per docs/R2_CI_BASELINE.md's no-live-provider-dependence
rule for CI.
"""

from __future__ import annotations

import httpx
import pytest

from app.infra.http_client import BoundedHTTPClient
from app.providers.noaa_coops import (
    NoaaDataUnavailableError,
    fetch_coops_wind,
    fetch_tide_predictions,
    fetch_tide_strength,
    fetch_water_temperature,
    fetch_water_temperature_change,
)


def _datagetter_response(**payload: object) -> httpx.Response:
    return httpx.Response(200, json=payload)


@pytest.mark.asyncio
async def test_fetch_water_temperature_success() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert "product=water_temperature" in str(request.url)
        assert "station=8658163" in str(request.url)
        return _datagetter_response(data=[{"t": "2024-07-15 12:00", "v": "78.4"}])

    transport = httpx.MockTransport(handler)
    async with BoundedHTTPClient(transport=transport) as client:
        reading = await fetch_water_temperature(client, "8658163")

    assert reading.value_f == 78.4
    assert reading.observed_at.year == 2024
    assert reading.observed_at.month == 7
    assert reading.observed_at.day == 15


@pytest.mark.asyncio
async def test_fetch_water_temperature_summer_is_edt() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return _datagetter_response(data=[{"t": "2024-07-15 12:00", "v": "78.4"}])

    transport = httpx.MockTransport(handler)
    async with BoundedHTTPClient(transport=transport) as client:
        reading = await fetch_water_temperature(client, "8658163")

    # Eastern Daylight Time is UTC-4.
    offset = reading.observed_at.utcoffset()
    assert offset is not None
    assert offset.total_seconds() == -4 * 3600


@pytest.mark.asyncio
async def test_fetch_water_temperature_winter_is_est() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return _datagetter_response(data=[{"t": "2024-01-15 12:00", "v": "48.1"}])

    transport = httpx.MockTransport(handler)
    async with BoundedHTTPClient(transport=transport) as client:
        reading = await fetch_water_temperature(client, "8658163")

    # Eastern Standard Time is UTC-5.
    offset = reading.observed_at.utcoffset()
    assert offset is not None
    assert offset.total_seconds() == -5 * 3600


@pytest.mark.asyncio
async def test_fetch_water_temperature_empty_data_raises() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return _datagetter_response(data=[])

    transport = httpx.MockTransport(handler)
    async with BoundedHTTPClient(transport=transport) as client:
        with pytest.raises(NoaaDataUnavailableError):
            await fetch_water_temperature(client, "8658163")


@pytest.mark.asyncio
async def test_fetch_water_temperature_missing_value_raises() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return _datagetter_response(data=[{"t": "2024-07-15 12:00", "v": ""}])

    transport = httpx.MockTransport(handler)
    async with BoundedHTTPClient(transport=transport) as client:
        with pytest.raises(NoaaDataUnavailableError):
            await fetch_water_temperature(client, "8658163")


@pytest.mark.asyncio
async def test_fetch_water_temperature_missing_data_key_raises() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return _datagetter_response(error={"message": "No data was found"})

    transport = httpx.MockTransport(handler)
    async with BoundedHTTPClient(transport=transport) as client:
        with pytest.raises(NoaaDataUnavailableError):
            await fetch_water_temperature(client, "8658163")


@pytest.mark.asyncio
async def test_fetch_coops_wind_success() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert "product=wind" in str(request.url)
        return _datagetter_response(data=[{"s": "10.5", "g": "14.2", "d": "SW"}])

    transport = httpx.MockTransport(handler)
    async with BoundedHTTPClient(transport=transport) as client:
        result = await fetch_coops_wind(client, "8658163")

    assert result is not None
    assert result.wind_low_kt == 10.5
    assert result.wind_high_kt == 14.2
    assert result.wind_direction == "SW"


@pytest.mark.asyncio
async def test_fetch_coops_wind_no_gust_uses_speed_as_high() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return _datagetter_response(data=[{"s": "10.5", "g": "0.00", "d": "SW"}])

    transport = httpx.MockTransport(handler)
    async with BoundedHTTPClient(transport=transport) as client:
        result = await fetch_coops_wind(client, "8658163")

    assert result is not None
    assert result.wind_low_kt == 10.5
    assert result.wind_high_kt == 10.5


@pytest.mark.asyncio
async def test_fetch_coops_wind_missing_speed_degrades_to_none() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return _datagetter_response(data=[{"d": "SW"}])

    transport = httpx.MockTransport(handler)
    async with BoundedHTTPClient(transport=transport) as client:
        result = await fetch_coops_wind(client, "8658163")

    assert result is None


@pytest.mark.asyncio
async def test_fetch_coops_wind_empty_data_degrades_to_none() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return _datagetter_response(data=[])

    transport = httpx.MockTransport(handler)
    async with BoundedHTTPClient(transport=transport) as client:
        result = await fetch_coops_wind(client, "8658163")

    assert result is None


@pytest.mark.asyncio
async def test_fetch_coops_wind_degrades_to_none_on_provider_error() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(503)

    transport = httpx.MockTransport(handler)
    async with BoundedHTTPClient(
        transport=transport, max_retries=0, backoff_base_seconds=0.0
    ) as client:
        result = await fetch_coops_wind(client, "8658163")

    assert result is None


@pytest.mark.asyncio
async def test_fetch_tide_predictions_success() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert "product=predictions" in str(request.url)
        assert "begin_date=20240715" in str(request.url)
        return _datagetter_response(
            predictions=[
                {"t": "2024-07-15 06:32", "v": "5.234", "type": "H"},
                {"t": "2024-07-15 12:48", "v": "0.512", "type": "L"},
            ]
        )

    transport = httpx.MockTransport(handler)
    async with BoundedHTTPClient(transport=transport) as client:
        tides = await fetch_tide_predictions(client, "8658163", "20240715", "20240716")

    assert len(tides) == 2
    assert tides[0].kind == "high"
    assert tides[0].height_ft == 5.234
    assert tides[1].kind == "low"


@pytest.mark.asyncio
async def test_fetch_tide_predictions_skips_rows_missing_time_or_height() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return _datagetter_response(
            predictions=[
                {"t": "2024-07-15 06:32", "v": "5.234", "type": "H"},
                {"t": "", "v": "0.512", "type": "L"},
                {"t": "2024-07-15 18:12", "v": "", "type": "H"},
            ]
        )

    transport = httpx.MockTransport(handler)
    async with BoundedHTTPClient(transport=transport) as client:
        tides = await fetch_tide_predictions(client, "8658163", "20240715", "20240716")

    assert len(tides) == 1
    assert tides[0].kind == "high"


@pytest.mark.asyncio
async def test_fetch_tide_predictions_empty_list_raises() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return _datagetter_response(predictions=[])

    transport = httpx.MockTransport(handler)
    async with BoundedHTTPClient(transport=transport) as client:
        with pytest.raises(NoaaDataUnavailableError):
            await fetch_tide_predictions(client, "8658163", "20240715", "20240716")


@pytest.mark.asyncio
async def test_fetch_tide_predictions_all_rows_unusable_raises() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return _datagetter_response(predictions=[{"t": "", "v": "", "type": "H"}])

    transport = httpx.MockTransport(handler)
    async with BoundedHTTPClient(transport=transport) as client:
        with pytest.raises(NoaaDataUnavailableError):
            await fetch_tide_predictions(client, "8658163", "20240715", "20240716")


@pytest.mark.asyncio
async def test_fetch_tide_predictions_dst_fall_back_does_not_raise() -> None:
    """2024-11-03 is the US fall-back DST transition in America/New_York;
    01:30 occurs twice that day. zoneinfo resolves the ambiguity
    deterministically (fold=0, the first/earlier occurrence) rather than
    raising, unlike pytz's bare .replace(tzinfo=...) which silently
    picks the wrong offset half the time.
    """

    def handler(request: httpx.Request) -> httpx.Response:
        return _datagetter_response(
            predictions=[{"t": "2024-11-03 01:30", "v": "3.1", "type": "H"}]
        )

    transport = httpx.MockTransport(handler)
    async with BoundedHTTPClient(transport=transport) as client:
        tides = await fetch_tide_predictions(client, "8658163", "20241103", "20241104")

    assert len(tides) == 1
    assert tides[0].time.fold == 0


def test_coops_direction_prefers_compass_label_then_degrees() -> None:
    from app.providers.noaa_coops import _coops_direction

    # Real CO-OPS rows: "d" is degrees, "dr" the compass label.
    assert _coops_direction({"d": "32.00", "dr": "NE"}) == "NE"
    # No label: degrees are converted, never passed through raw.
    assert _coops_direction({"d": "32.0"}) == "NNE"
    assert _coops_direction({"d": "355"}) == "N"
    assert _coops_direction({"d": ""}) is None


@pytest.mark.asyncio
async def test_water_temperature_change_over_a_day() -> None:
    rows = [
        {"t": f"2024-07-15 {h % 24:02d}:00", "v": f"{70 - h * 0.2:.1f}"}
        for h in range(25)
    ]
    rows[5]["v"] = ""  # a missing reading is skipped

    def handler(request: httpx.Request) -> httpx.Response:
        assert "range=26" in str(request.url)
        return _datagetter_response(data=rows)

    async with BoundedHTTPClient(transport=httpx.MockTransport(handler)) as client:
        assert await fetch_water_temperature_change(client, "8658163") == -4.8


@pytest.mark.asyncio
async def test_water_temperature_change_needs_a_day_of_readings() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return _datagetter_response(data=[{"t": "2024-07-15 12:00", "v": "70"}])

    async with BoundedHTTPClient(transport=httpx.MockTransport(handler)) as client:
        assert await fetch_water_temperature_change(client, "8658163") is None
        assert await fetch_water_temperature_change(client, "") is None


@pytest.mark.asyncio
async def test_tide_strength_compares_today_with_the_fortnight() -> None:
    from datetime import date

    rows = []
    for day in range(1, 15):
        swing = 6.0 if day == 1 else 4.0  # today is a big (spring) tide
        rows += [
            {"t": f"2024-07-{day:02d} 03:00", "v": f"{swing:.1f}", "type": "H"},
            {"t": f"2024-07-{day:02d} 09:00", "v": "0.0", "type": "L"},
        ]

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"predictions": rows})

    async with BoundedHTTPClient(transport=httpx.MockTransport(handler)) as client:
        strength = await fetch_tide_strength(
            client, "8658163", date(2024, 7, 1), "America/New_York"
        )
        assert strength is not None and strength[date(2024, 7, 1)] > 1.4
        assert 0.9 < strength[date(2024, 7, 5)] < 1.0
        assert await fetch_tide_strength(client, "", date(2024, 7, 1), "UTC") is None
