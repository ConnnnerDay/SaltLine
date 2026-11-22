"""Tidal current predictions from NOAA CO-OPS
(https://tidesandcurrents.noaa.gov/noaacurrents/).

For bridge, jetty, pier and inlet anglers the current matters as much as
the tide height: when it runs hardest (max flood, max ebb), which way, and
when it goes slack. NOAA predicts that for ~4,000 channel and inlet
stations. A spot gets the nearest one only when it's within
`MAX_DISTANCE_MILES`: farther than that it describes some other channel.

The station catalog is metadata (cached a day, degrading to [] on
failure, like `app.providers.stations`); the predictions are enrichment
too -- any failure returns None and the forecast simply has no currents.
"""

from __future__ import annotations

import logging
from datetime import date, datetime, timedelta
from typing import Any, Literal, cast

from pydantic import BaseModel

from app.infra.http_client import BoundedHTTPClient, ProviderError
from app.infra.timezones import safe_zone
from app.providers.stations import (
    CATALOG_MAX_BYTES,
    StationCatalogCache,
    _haversine_miles,
)

logger = logging.getLogger(__name__)

_CATALOG_URL = (
    "https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi/stations.json"
    "?type=currentpredictions"
)
_DATAGETTER_URL = "https://api.tidesandcurrents.noaa.gov/api/prod/datagetter"
_HEADERS = {"User-Agent": "Saltline/1.0 (fishing forecast)"}
MAX_DISTANCE_MILES = 5.0


class CurrentStation(BaseModel):
    id: str
    name: str
    lat: float
    lng: float
    bin: int | None = None


class CurrentEvent(BaseModel):
    time: datetime
    kind: Literal["slack", "flood", "ebb"]
    speed_kt: float
    # Which way the water runs (degrees true), for floods and ebbs.
    direction_deg: int | None = None


class TidalCurrents(BaseModel):
    station_id: str
    station_name: str
    distance_miles: float
    events: list[CurrentEvent]


def parse_current_catalog(payload: dict[str, Any]) -> list[CurrentStation]:
    """Harmonic ("H") and subordinate ("S") stations; weak/rotary ("W")
    ones have no usable flood/ebb and are skipped."""
    out: list[CurrentStation] = []
    for raw in payload.get("stations") or []:
        if raw.get("type") == "W":
            continue
        try:
            out.append(
                CurrentStation(
                    id=str(raw["id"]),
                    name=str(raw.get("name") or raw["id"]),
                    lat=float(raw["lat"]),
                    lng=float(raw["lng"]),
                    bin=int(raw["currbin"]) if raw.get("currbin") is not None else None,
                )
            )
        except (KeyError, TypeError, ValueError):
            continue
    return out


_catalog_cache: StationCatalogCache[CurrentStation] = StationCatalogCache()


async def _fetch_catalog(client: BoundedHTTPClient) -> list[CurrentStation]:
    try:
        payload = await client.get_json(
            _CATALOG_URL, headers=_HEADERS, max_bytes=CATALOG_MAX_BYTES
        )
    except ProviderError:
        logger.warning("NOAA current station catalog unavailable", exc_info=True)
        return []
    return parse_current_catalog(cast("dict[str, Any]", payload))


def nearest_current_station(
    stations: list[CurrentStation], lat: float, lng: float
) -> tuple[CurrentStation, float] | None:
    """The nearest station within `MAX_DISTANCE_MILES`, with its distance."""
    best: tuple[CurrentStation, float] | None = None
    for station in stations:
        distance = _haversine_miles(lat, lng, station.lat, station.lng)
        if distance <= MAX_DISTANCE_MILES and (best is None or distance < best[1]):
            best = (station, distance)
    return best


def parse_current_events(payload: dict[str, Any], tz_name: str) -> list[CurrentEvent]:
    zone = safe_zone(tz_name)
    rows = (payload.get("current_predictions") or {}).get("cp") or []
    out: list[CurrentEvent] = []
    for row in rows:
        kind = str(row.get("Type") or "").lower()
        if kind not in ("slack", "flood", "ebb"):
            continue
        try:
            time = datetime.strptime(str(row["Time"]), "%Y-%m-%d %H:%M").replace(
                tzinfo=zone
            )
            velocity = float(row.get("Velocity_Major") or 0)
        except (KeyError, TypeError, ValueError):
            continue
        direction = row.get("meanFloodDir" if kind == "flood" else "meanEbbDir")
        out.append(
            CurrentEvent(
                time=time,
                kind=kind,  # type: ignore[arg-type]
                speed_kt=round(abs(velocity), 1),
                direction_deg=int(direction)
                if kind != "slack" and direction is not None
                else None,
            )
        )
    return out


async def fetch_tidal_currents(
    client: BoundedHTTPClient,
    lat: float,
    lng: float,
    today: date,
    tz_name: str,
    days: int = 3,
) -> TidalCurrents | None:
    """Slack, max flood and max ebb for the next *days* at the nearest
    current station within `MAX_DISTANCE_MILES`, or None (no station that
    close, or any failure)."""
    stations = await _catalog_cache.get_or_refresh(lambda: _fetch_catalog(client))
    nearest = nearest_current_station(stations, lat, lng)
    if nearest is None:
        return None
    station, distance = nearest
    url = (
        f"{_DATAGETTER_URL}?begin_date={today:%Y%m%d}"
        f"&end_date={today + timedelta(days=days - 1):%Y%m%d}"
        f"&station={station.id}&product=currents_predictions&interval=MAX_SLACK"
        "&units=english&time_zone=lst_ldt&format=json"
        + (f"&bin={station.bin}" if station.bin is not None else "")
    )
    try:
        payload = await client.get_json(url, headers=_HEADERS)
    except ProviderError:
        logger.warning("NOAA current predictions unavailable", exc_info=True)
        return None
    events = parse_current_events(cast("dict[str, Any]", payload), tz_name)
    if not events:
        return None
    return TidalCurrents(
        station_id=station.id,
        station_name=station.name,
        distance_miles=round(distance, 1),
        events=events,
    )
