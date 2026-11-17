"""NWS (National Weather Service) provider adapter (sprint 13;
gridpoint wind fallback added picking up sprint 13's own deferred scope
once Phase 2 closed out).

Ports the marine-zone conditions parsing and active-alerts handling from
the legacy `services/nws.py`, behind typed contracts and
`app.infra.http_client.BoundedHTTPClient` instead of the legacy
`requests`-based `http_client.get`. Per docs/R1_RECONCILIATION_AUDIT.md,
this is an adapt, not a verbatim carry-over: the two near-duplicate
GeoJSON/JSON-LD alert parsers in the legacy module (`fetch_weather_alerts`
and `fetch_state_alerts`) are unified into one `_parse_alerts` here.

Original scope: marine-zone wind/wave/direction parsing and fetch, plus
point and state active-alerts parsing and fetch.

**Gridpoint wind fallback, picked up from sprint 13's own deferred
scope.** Ports the legacy module's `_try_nws_gridpoint`: the standard
(land) forecast for the grid point nearest a coordinate, wind speed/
direction only — no wave data, since it's a land forecast. `app.domain.
assembly` wires this in as a last-resort wind source, fetched only when
neither the marine-zone forecast nor the NDBC buoy provide wind (see
that module's docstring) — not on every request, matching sprint 26's
"bounded parallel calls, no duplicates" performance-budget discipline.
Given that, its own failure is non-critical enrichment, not a
decision-relevant reading: it degrades to `None` rather than raising,
matching `fetch_point_alerts`'s resilience posture, not
`fetch_marine_zone_conditions`'s. The legacy module's current-weather
observations (`fetch_current_weather` — air temp, humidity, heat index,
recent-precipitation) remain deliberately deferred: unlike the
gridpoint wind fallback, nothing in the canonical roadmap's required
`ForecastConditions` shape names air-temperature/humidity/heat-index as
a needed field, so porting it now would be inventing product scope, not
closing a named gap.
"""

from __future__ import annotations

import logging
import re
from datetime import datetime
from typing import Any

from pydantic import BaseModel

from app.infra.http_client import BoundedHTTPClient, ProviderError, ProviderParseError

logger = logging.getLogger(__name__)

NWS_MARINE_ZONE_DEFAULT = "AMZ158"

_NWS_HEADERS = {
    "User-Agent": "(Saltline, github.com/ConnnnerDay/surf-pier-forecast)",
    "Accept": "application/ld+json",
}

_DIR_MAP: dict[str, str] = {
    "north": "N",
    "northeast": "NE",
    "northwest": "NW",
    "south": "S",
    "southeast": "SE",
    "southwest": "SW",
    "east": "E",
    "west": "W",
    "variable": "VARIABLE",
}

_WIND_DIR_RE = re.compile(
    r"(north(?:east|west)?|south(?:east|west)?|east|west|"
    r"NE|NW|SE|SW|N|E|S|W|VARIABLE)\s+wind",
    re.IGNORECASE,
)
_WIND_SPEED_RE = re.compile(r"(\d+)(?:\s*to\s*(\d+))?\s*(?:kt|knots?)", re.IGNORECASE)
_SEA_HEIGHT_RE = re.compile(
    r"(?:seas?|waves?)\s*(?:around\s+)?(\d+)(?:\s*to\s*(\d+))?\s*(?:ft|feet|foot)",
    re.IGNORECASE,
)
_GRIDPOINT_WIND_SPEED_RE = re.compile(r"(\d+)(?:\s*to\s*(\d+))?\s*mph", re.IGNORECASE)
_MPH_TO_KNOTS = 0.868976


class MarineDay(BaseModel):
    """One calendar day of an NWS marine zone forecast: its day and night
    periods combined. `label` is NWS's own name for the day's first
    period ("Rest Of Today", "Wed", or "Tonight" when the forecast starts
    in the evening)."""

    label: str
    wind_low_kt: float | None = None
    wind_high_kt: float | None = None
    wind_direction: str | None = None
    wave_low_ft: float | None = None
    wave_high_ft: float | None = None


class MarineZoneConditions(BaseModel):
    """Wind and wave ranges parsed from an NWS marine zone forecast's first
    ~24 hours (3 periods). `None` fields mean the source text didn't
    mention that quantity in the periods examined, not that it was zero.
    """

    wind_low_kt: float | None = None
    wind_high_kt: float | None = None
    wind_direction: str | None = None
    wave_low_ft: float | None = None
    wave_high_ft: float | None = None
    # The whole forecast (usually 5 days), one entry per calendar day.
    days: list[MarineDay] = []


class GridpointWindForecast(BaseModel):
    """Wind-only forecast for the land grid point nearest a coordinate —
    no wave data, since it's a land forecast. `None` fields mean the
    source didn't report that quantity, not that it was zero.
    """

    wind_low_kt: float | None = None
    wind_high_kt: float | None = None
    wind_direction: str | None = None


class WeatherAlert(BaseModel):
    event: str
    severity: str
    headline: str
    description: str
    # When the alert ends (`ends`, else `expires`); shown as "until 1:29 PM".
    expires: datetime | None = None


def parse_marine_zone_conditions(periods: list[dict[str, Any]]) -> MarineZoneConditions:
    """Extract wind and wave ranges from NWS marine forecast periods.

    Examines the first 3 periods (~24 hours) and regex-parses wind speed
    (kt), wind direction, and sea height (ft) from each period's
    `detailedForecast` text. Ported verbatim in behavior from the legacy
    `services/nws.py:parse_conditions`.
    """
    wind_ranges: list[tuple[float, float]] = []
    wave_ranges: list[tuple[float, float]] = []
    wind_directions: list[str] = []

    for period in periods[:3]:
        text = period.get("detailedForecast", "")

        dir_match = _WIND_DIR_RE.search(text)
        if dir_match:
            raw = dir_match.group(1)
            wind_directions.append(_DIR_MAP.get(raw.lower(), raw.upper()))

        wind_match = _WIND_SPEED_RE.search(text)
        if wind_match:
            low = float(wind_match.group(1))
            high = float(wind_match.group(2)) if wind_match.group(2) else low
            wind_ranges.append((low, high))

        sea_match = _SEA_HEIGHT_RE.search(text)
        if sea_match:
            low = float(sea_match.group(1))
            high = float(sea_match.group(2)) if sea_match.group(2) else low
            wave_ranges.append((low, high))

    conditions = MarineZoneConditions(
        wind_direction=wind_directions[0] if wind_directions else None,
    )
    if wind_ranges:
        conditions.wind_low_kt = min(w[0] for w in wind_ranges)
        conditions.wind_high_kt = max(w[1] for w in wind_ranges)
    if wave_ranges:
        conditions.wave_low_ft = min(s[0] for s in wave_ranges)
        conditions.wave_high_ft = max(s[1] for s in wave_ranges)
    conditions.days = parse_marine_zone_days(periods)
    return conditions


def _is_night_period(name: str) -> bool:
    return "night" in name.lower()


def parse_marine_zone_days(periods: list[dict[str, Any]]) -> list[MarineDay]:
    """Group marine forecast periods into calendar days. NWS names periods
    "Rest Of Today", "Tonight", "Wed", "Wed Night", ...: every period after
    the first that isn't a night period starts a new day. Each day's wind
    and seas span all of its periods (same regexes as
    `parse_marine_zone_conditions`); direction is the first one named."""
    grouped: list[tuple[str, list[str]]] = []
    for index, period in enumerate(periods):
        name = str(period.get("name") or "")
        text = str(period.get("detailedForecast") or "")
        if index == 0 or not _is_night_period(name):
            grouped.append((name, [text]))
        else:
            grouped[-1][1].append(text)

    days: list[MarineDay] = []
    for label, texts in grouped:
        day = MarineDay(label=label)
        winds: list[tuple[float, float]] = []
        seas: list[tuple[float, float]] = []
        for text in texts:
            if day.wind_direction is None and (match := _WIND_DIR_RE.search(text)):
                raw = match.group(1)
                day.wind_direction = _DIR_MAP.get(raw.lower(), raw.upper())
            if match := _WIND_SPEED_RE.search(text):
                low = float(match.group(1))
                winds.append((low, float(match.group(2)) if match.group(2) else low))
            if match := _SEA_HEIGHT_RE.search(text):
                low = float(match.group(1))
                seas.append((low, float(match.group(2)) if match.group(2) else low))
        if winds:
            day.wind_low_kt = min(w[0] for w in winds)
            day.wind_high_kt = max(w[1] for w in winds)
        if seas:
            day.wave_low_ft = min(w[0] for w in seas)
            day.wave_high_ft = max(w[1] for w in seas)
        days.append(day)
    return days


def parse_gridpoint_wind(periods: list[dict[str, Any]]) -> GridpointWindForecast:
    """Extract wind speed/direction from a standard NWS grid forecast's
    first 3 periods. Unlike `parse_marine_zone_conditions`'s free-text
    regex parsing, the gridpoint API returns `windSpeed` ("10 mph" or "5
    to 10 mph") and `windDirection` (already abbreviated, e.g. "SW") as
    separate structured fields — no direction-text regex or `_DIR_MAP`
    lookup needed. Ported verbatim in behavior from the legacy
    `services/nws.py:_try_nws_gridpoint`, including the direction choice
    (first period's, not marine-zone's "first direction mentioned
    anywhere in 3 periods" — the legacy functions differ here too).
    """
    wind_ranges: list[tuple[float, float]] = []
    wind_dirs: list[str] = []

    for period in periods[:3]:
        speed_match = _GRIDPOINT_WIND_SPEED_RE.search(period.get("windSpeed", "") or "")
        if speed_match:
            low = float(speed_match.group(1)) * _MPH_TO_KNOTS
            high = (
                float(speed_match.group(2)) * _MPH_TO_KNOTS
                if speed_match.group(2)
                else low
            )
            wind_ranges.append((round(low, 1), round(high, 1)))

        direction = period.get("windDirection", "")
        if direction:
            wind_dirs.append(direction)

    conditions = GridpointWindForecast(
        wind_direction=wind_dirs[0] if wind_dirs else None
    )
    if wind_ranges:
        conditions.wind_low_kt = min(w[0] for w in wind_ranges)
        conditions.wind_high_kt = max(w[1] for w in wind_ranges)
    return conditions


def _parse_alerts(payload: dict[str, Any], limit: int) -> list[WeatherAlert]:
    """Parse NWS active-alerts JSON, handling both response shapes the API
    can return depending on the `Accept` header: GeoJSON (`features`, with
    alert fields nested under `properties`) and JSON-LD (`@graph`, with
    alert fields at the top level). Descriptions are truncated to 300
    characters, matching the legacy behavior.
    """
    raw = payload.get("features", []) or payload.get("@graph", [])
    alerts: list[WeatherAlert] = []
    for item in raw:
        if len(alerts) >= limit:
            break
        fields = item.get("properties", item)
        event = fields.get("event", "")
        if not event or not _is_real_alert(fields):
            continue
        alerts.append(
            WeatherAlert(
                event=event,
                severity=fields.get("severity", ""),
                headline=fields.get("headline", ""),
                description=(fields.get("description", "") or "")[:300],
                expires=_alert_time(fields.get("ends") or fields.get("expires")),
            )
        )
    return alerts


def _is_real_alert(fields: dict[str, Any]) -> bool:
    """NWS sends test messages and cancellations through the same active
    feed (a live "TEST Tsunami Warning" showed up on a forecast). Only an
    in-force, real alert is kept: `status` "Actual" (when present), not a
    cancellation, and no "TEST" headline."""
    status = str(fields.get("status") or "Actual")
    message_type = str(fields.get("messageType") or "Alert")
    headline = str(fields.get("headline") or "")
    return (
        status.lower() == "actual"
        and message_type.lower() != "cancel"
        and not headline.upper().startswith("TEST")
    )


def _alert_time(value: object) -> datetime | None:
    try:
        return datetime.fromisoformat(str(value)) if value else None
    except ValueError:
        return None


def _field(payload: object, name: str, source: str) -> Any:
    """Read *name* from an NWS response in either shape it can come in.

    `_NWS_HEADERS` asks for JSON-LD (`application/ld+json`), where fields
    sit at the top level (`{"periods": [...]}`); GeoJSON nests them under
    `properties`. The parsers here originally read only the GeoJSON shape,
    so every live JSON-LD response raised `KeyError`, which no caller
    caught -- a 500 for the whole forecast. Missing either way is now a
    `ProviderParseError`, which callers already degrade on.
    """
    if isinstance(payload, dict):
        body = payload.get("properties", payload)
        if isinstance(body, dict) and name in body:
            return body[name]
    raise ProviderParseError(f"NWS response from {source} has no '{name}'")


async def fetch_marine_zone_conditions(
    client: BoundedHTTPClient, zone: str = NWS_MARINE_ZONE_DEFAULT
) -> MarineZoneConditions:
    """Fetch and parse the NWS marine zone forecast. Raises a
    `ProviderError` subclass on failure — marine conditions are
    decision-relevant, so callers must see the failure rather than get a
    silently empty result (unlike alerts, see `fetch_point_alerts`).
    """
    url = f"https://api.weather.gov/zones/forecast/{zone}/forecast"
    data = await client.get_json(url, headers=_NWS_HEADERS)
    periods = _field(data, "periods", url)
    return parse_marine_zone_conditions(periods)


async def fetch_gridpoint_wind(
    client: BoundedHTTPClient, lat: float, lng: float
) -> GridpointWindForecast | None:
    """Fetch the standard NWS forecast for the grid point nearest
    (lat, lng) and extract wind speed/direction only. A last-resort wind
    fallback (see the module docstring) — degrades to `None` on any
    failure rather than raising, unlike `fetch_marine_zone_conditions`.
    """
    try:
        points = await client.get_json(
            f"https://api.weather.gov/points/{lat},{lng}", headers=_NWS_HEADERS
        )
        forecast_url = _field(points, "forecast", "points")
        forecast = await client.get_json(forecast_url, headers=_NWS_HEADERS)
        periods = _field(forecast, "periods", forecast_url)
    except ProviderError:
        logger.warning("NWS gridpoint wind forecast unavailable", exc_info=True)
        return None
    return parse_gridpoint_wind(periods)


async def fetch_point_alerts(
    client: BoundedHTTPClient, lat: float, lng: float, limit: int = 5
) -> list[WeatherAlert]:
    """Fetch active weather alerts for a lat/lng. Alerts are non-critical
    enrichment, so failures are logged and swallowed to an empty list —
    matching the legacy `fetch_weather_alerts`'s resilience choice —
    rather than failing the whole forecast.
    """
    url = f"https://api.weather.gov/alerts/active?point={lat},{lng}"
    try:
        data = await client.get_json(url, headers=_NWS_HEADERS)
    except ProviderError:
        logger.warning("NWS point alerts unavailable", exc_info=True)
        return []
    return _parse_alerts(data, limit)  # type: ignore[arg-type]


async def fetch_state_alerts(
    client: BoundedHTTPClient, state_code: str, limit: int = 10
) -> list[WeatherAlert]:
    """Fetch active alerts for an entire state. Same non-critical
    resilience posture as `fetch_point_alerts`.
    """
    if not state_code:
        return []
    url = f"https://api.weather.gov/alerts/active?area={state_code.upper()}"
    try:
        data = await client.get_json(url, headers=_NWS_HEADERS)
    except ProviderError:
        logger.warning("NWS state alerts unavailable", exc_info=True)
        return []
    return _parse_alerts(data, limit)  # type: ignore[arg-type]
