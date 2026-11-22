"""Tidal current predictions (`app.providers.currents`)."""

from __future__ import annotations

from datetime import date

import httpx
import pytest

from app.infra.http_client import BoundedHTTPClient
from app.providers import currents
from app.providers.currents import (
    CurrentStation,
    fetch_tidal_currents,
    nearest_current_station,
    parse_current_catalog,
    parse_current_events,
)
from app.providers.stations import StationCatalogCache

_CATALOG = {
    "stations": [
        {
            "id": "ACT4046",
            "name": "Cape May Canal, east end",
            "lat": 38.95,
            "lng": -74.88,
            "type": "S",
            "currbin": 1,
        },
        {
            "id": "ROT1",
            "name": "Rotary",
            "lat": 38.94,
            "lng": -74.9,
            "type": "W",
            "currbin": 1,
        },
        {
            "id": "FAR1",
            "name": "Far away",
            "lat": 40.0,
            "lng": -74.0,
            "type": "H",
            "currbin": 3,
        },
    ]
}
_EVENTS = {
    "current_predictions": {
        "cp": [
            {
                "Type": "flood",
                "meanFloodDir": 310,
                "meanEbbDir": 130,
                "Time": "2026-11-22 02:22",
                "Velocity_Major": 2.04,
            },
            {
                "Type": "slack",
                "meanFloodDir": 310,
                "meanEbbDir": 130,
                "Time": "2026-11-22 05:41",
                "Velocity_Major": 0,
            },
            {
                "Type": "ebb",
                "meanFloodDir": 310,
                "meanEbbDir": 130,
                "Time": "2026-11-22 09:05",
                "Velocity_Major": -1.93,
            },
            {"Type": "bogus", "Time": "2026-11-22 10:00", "Velocity_Major": 1},
        ]
    }
}


def test_catalog_skips_weak_rotary_stations() -> None:
    stations = parse_current_catalog(_CATALOG)
    assert [s.id for s in stations] == ["ACT4046", "FAR1"]
    assert stations[1].bin == 3


def test_nearest_station_only_within_a_few_miles() -> None:
    stations = parse_current_catalog(_CATALOG)
    nearest = nearest_current_station(stations, 38.96, -74.89)
    assert nearest is not None and nearest[0].id == "ACT4046" and nearest[1] < 1.5
    assert nearest_current_station(stations, 30.0, -80.0) is None


def test_events_have_speed_and_direction() -> None:
    events = parse_current_events(_EVENTS, "America/New_York")
    assert [(e.kind, e.speed_kt, e.direction_deg) for e in events] == [
        ("flood", 2.0, 310),
        ("slack", 0.0, None),
        ("ebb", 1.9, 130),
    ]
    assert events[0].time.utcoffset() is not None


@pytest.mark.asyncio
async def test_fetch_uses_the_station_and_its_bin(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        currents, "_catalog_cache", StationCatalogCache[CurrentStation]()
    )
    seen: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        url = str(request.url)
        seen.append(url)
        if "mdapi" in url:
            return httpx.Response(200, json=_CATALOG)
        return httpx.Response(200, json=_EVENTS)

    async with BoundedHTTPClient(transport=httpx.MockTransport(handler)) as client:
        result = await fetch_tidal_currents(
            client, 38.96, -74.89, date(2026, 11, 22), "America/New_York"
        )
        assert result is not None
        assert result.station_name == "Cape May Canal, east end"
        assert len(result.events) == 3
        assert "station=ACT4046" in seen[-1] and "bin=1" in seen[-1]
        assert (
            await fetch_tidal_currents(client, 30.0, -80.0, date(2026, 11, 22), "UTC")
            is None
        )
