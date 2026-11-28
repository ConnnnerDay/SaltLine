"""Check every curated location's live data sources and repair the ones
that no longer answer, rewriting `app/data/coastal_locations.json`.

A live scan of all 101 curated spots found station ids that have gone
stale since the legacy dataset was compiled: 32 water-temperature stations
with no temperature sensor/reading, 22 NWS marine-zone ids that now 404
(NWS renumbered zones), and 14 spots whose first NDBC buoy is gone. Each
broken source silently degrades a forecast (monthly-average water temp, no
marine-zone wind/waves), so this script finds a working replacement:

- water_temp_station: the nearest CO-OPS water-temperature station within
  `_WATER_TEMP_MAX_MILES` that actually returns a reading now;
- ndbc_stations: the listed buoys that still report, topped up with the
  nearest reporting met buoys from NDBC's active-station catalog within
  `_BUOY_MAX_MILES` (assembly tries them in order);
- coops_station (tides): the nearest CO-OPS tide-prediction station within
  `_TIDE_MAX_MILES` whose predictions load (only after the current one
  fails twice, so a one-off CO-OPS error never triggers a swap);
- nws_zone: the marine zone NWS places a point a few miles offshore in
  (probing outward in 8 directions), accepted only if its forecast loads.

Nothing is replaced unless the replacement verifiably works, and a spot
with no working replacement keeps its current value. Re-run whenever
sources drift; review the diff before committing.

Run from apps/api (network access to api.weather.gov,
api.tidesandcurrents.noaa.gov and www.ndbc.noaa.gov):

    python -m scripts.repair_location_sources [--dry-run] [--only-suffix=-ak]
"""

from __future__ import annotations

import asyncio
import json
import math
import sys
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

from app.infra.http_client import BoundedHTTPClient, ProviderError
from app.providers.ndbc import fetch_buoy_observation
from app.providers.noaa_coops import fetch_tide_predictions, fetch_water_temperature
from app.providers.stations import (
    _haversine_miles,
    fetch_coops_tide_catalog,
    fetch_coops_watertemp_catalog,
    fetch_ndbc_catalog,
)

_LOCATIONS_PATH = (
    Path(__file__).resolve().parent.parent / "app" / "data" / "coastal_locations.json"
)
_WATER_TEMP_MAX_MILES = 30.0
_TIDE_MAX_MILES = 25.0
_BUOY_MAX_MILES = 75.0
_BUOYS_WANTED = 2
_ZONE_PROBE_MILES = (2, 4, 7, 11, 16)
_NWS_HEADERS = {
    "User-Agent": "(Saltline, github.com/ConnnnerDay/surf-pier-forecast)",
    "Accept": "application/geo+json",
}


async def _water_temp_ok(client: BoundedHTTPClient, station_id: str) -> bool:
    try:
        await fetch_water_temperature(client, station_id)
    except (ProviderError, KeyError, ValueError, TypeError):
        return False
    return True


async def _tides_ok(client: BoundedHTTPClient, station_id: str) -> bool:
    today = datetime.now(UTC).date()
    begin, end = (
        today.strftime("%Y%m%d"),
        (today + timedelta(days=1)).strftime("%Y%m%d"),
    )
    for attempt in range(2):  # a one-off CO-OPS error must not trigger a swap
        try:
            if await fetch_tide_predictions(client, station_id, begin, end):
                return True
        except (ProviderError, KeyError, ValueError, TypeError):
            pass
        if attempt == 0:
            await asyncio.sleep(3)
    return False


async def _repair_tides(
    client: BoundedHTTPClient, loc: dict[str, Any], catalog: list[Any]
) -> str | None:
    if await _tides_ok(client, loc["coops_station"]):
        return None
    nearby = sorted(
        (_haversine_miles(loc["lat"], loc["lng"], station.lat, station.lng), station.id)
        for station in catalog
    )
    for distance, station_id in nearby:
        if distance > _TIDE_MAX_MILES:
            break
        if station_id != loc["coops_station"] and await _tides_ok(client, station_id):
            return station_id
    return None


async def _buoy_ok(client: BoundedHTTPClient, station_id: str) -> bool:
    try:
        # A buoy that only serves old rows counts as broken.
        await fetch_buoy_observation(client, station_id, now=datetime.now(UTC))
    except (ProviderError, KeyError, ValueError, TypeError):
        return False
    return True


async def _zone_ok(client: BoundedHTTPClient, zone: str) -> bool:
    try:
        await client.get_json(
            f"https://api.weather.gov/zones/forecast/{zone}/forecast",
            headers={**_NWS_HEADERS, "Accept": "application/ld+json"},
        )
    except ProviderError:
        return False
    return True


async def _zones_at(client: BoundedHTTPClient, lat: float, lng: float) -> list[str]:
    try:
        data: Any = await client.get_json(
            f"https://api.weather.gov/zones?type=marine&point={lat:.4f},{lng:.4f}",
            headers=_NWS_HEADERS,
        )
    except ProviderError:
        return []
    return [feature["properties"]["id"] for feature in data.get("features", [])]


async def _zones_near(client: BoundedHTTPClient, loc: dict[str, Any]) -> set[str]:
    """Every marine zone within the probe radius of the spot."""
    found: set[str] = set(await _zones_at(client, loc["lat"], loc["lng"]))
    for miles in _ZONE_PROBE_MILES:
        for bearing in range(0, 360, 45):
            dlat = miles / 69.0 * math.cos(math.radians(bearing))
            dlng = (
                miles
                / (69.0 * math.cos(math.radians(loc["lat"])))
                * math.sin(math.radians(bearing))
            )
            found.update(await _zones_at(client, loc["lat"] + dlat, loc["lng"] + dlng))
    return found


async def _repair_zone(client: BoundedHTTPClient, loc: dict[str, Any]) -> str | None:
    # A zone that still answers isn't necessarily this spot's: the legacy
    # data had most spots one zone off along the coast (Ocean City, MD on
    # a North Carolina zone; Honolulu on Kauai's). Keep it only if it is
    # one of the zones actually near the spot.
    if await _zone_ok(client, loc["nws_zone"]) and loc["nws_zone"] in await _zones_near(
        client, loc
    ):
        return None
    for miles in _ZONE_PROBE_MILES:
        for bearing in range(0, 360, 45):
            dlat = miles / 69.0 * math.cos(math.radians(bearing))
            dlng = (
                miles
                / (69.0 * math.cos(math.radians(loc["lat"])))
                * math.sin(math.radians(bearing))
            )
            for zone in await _zones_at(client, loc["lat"] + dlat, loc["lng"] + dlng):
                if await _zone_ok(client, zone):
                    return zone
    return None


async def _repair_water_temp(
    client: BoundedHTTPClient, loc: dict[str, Any], catalog: list[Any]
) -> str | None:
    current = loc.get("water_temp_station") or loc["coops_station"]
    if await _water_temp_ok(client, current):
        return None
    nearby = sorted(
        (
            (
                _haversine_miles(loc["lat"], loc["lng"], station.lat, station.lng),
                station.id,
            )
            for station in catalog
        ),
    )
    for distance, station_id in nearby:
        if distance > _WATER_TEMP_MAX_MILES:
            break
        if station_id != current and await _water_temp_ok(client, station_id):
            return station_id
    return None


async def _repair_buoys(
    client: BoundedHTTPClient, loc: dict[str, Any], catalog: list[Any]
) -> list[str] | None:
    current: list[str] = loc.get("ndbc_stations", [])
    working = [station for station in current if await _buoy_ok(client, station)]
    # An empty list isn't "all working": new spots start with none.
    if (
        current
        and len(working) >= min(_BUOYS_WANTED, len(current))
        and working[:1] == current[:1]
    ):
        return None
    candidates = sorted(
        (
            (
                _haversine_miles(loc["lat"], loc["lng"], station.lat, station.lng),
                station.id,
            )
            for station in catalog
            if station.has_met
        ),
    )
    for distance, station_id in candidates:
        if len(working) >= _BUOYS_WANTED or distance > _BUOY_MAX_MILES:
            break
        if station_id not in working and await _buoy_ok(client, station_id):
            working.append(station_id)
    return working if working and working != current else None


async def main() -> None:
    dry_run = "--dry-run" in sys.argv
    # --only-suffix=-ak checks just the spots whose id ends that way (e.g.
    # newly added ones), leaving every other spot untouched.
    suffix = next(
        (arg.split("=", 1)[1] for arg in sys.argv if arg.startswith("--only-suffix=")),
        "",
    )
    locations: list[dict[str, Any]] = json.loads(_LOCATIONS_PATH.read_text())
    changes = 0
    async with BoundedHTTPClient() as client:
        watertemp_catalog = await fetch_coops_watertemp_catalog(client)
        ndbc_catalog = await fetch_ndbc_catalog(client)
        tide_catalog = await fetch_coops_tide_catalog(client)
        print(
            f"catalogs: {len(watertemp_catalog)} water-temp, {len(ndbc_catalog)} NDBC"
        )
        for loc in locations:
            if suffix and not str(loc["id"]).endswith(suffix):
                continue
            fixes: dict[str, Any] = {}
            if (
                tide_station := await _repair_tides(client, loc, tide_catalog)
            ) is not None:
                # Keep water temperature on the station it already uses.
                loc.setdefault("water_temp_station", loc["coops_station"])
                fixes["coops_station"] = tide_station
            if (zone := await _repair_zone(client, loc)) is not None:
                fixes["nws_zone"] = zone
            if (
                station := await _repair_water_temp(client, loc, watertemp_catalog)
            ) is not None:
                fixes["water_temp_station"] = station
            if (buoys := await _repair_buoys(client, loc, ndbc_catalog)) is not None:
                fixes["ndbc_stations"] = buoys
            for key, value in fixes.items():
                print(f"{loc['id']}: {key} {loc.get(key)!r} -> {value!r}")
                loc[key] = value
                changes += 1
    print(f"{changes} change(s)")
    if changes and not dry_run:
        _LOCATIONS_PATH.write_text(json.dumps(locations, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    asyncio.run(main())
