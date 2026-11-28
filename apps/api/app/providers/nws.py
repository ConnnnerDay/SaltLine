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

import asyncio
import logging
import math
import re
from datetime import date, datetime, timedelta
from typing import Any

from pydantic import BaseModel

from app.infra.http_client import BoundedHTTPClient, ProviderError, ProviderParseError
from app.providers.surf_zone import SurfZoneForecast, fetch_surf_zone

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
# Gusts aren't sustained wind, and "occasionally to 13 feet" is the odd
# bigger set, not the sea state: both are left out of the ranges.
_GUSTS_RE = re.compile(
    r"(?:with\s+)?(?:occasional\s+)?gusts?\s+(?:up\s+)?to\s+"
    r"(?:\d+\s*(?:kt|knots?)|gale\s+force|storm\s+force)",
    re.IGNORECASE,
)
_OCCASIONAL_SEAS_RE = re.compile(
    r",?\s*occasionally\s+to\s+\d+\s*(?:ft|feet|foot)", re.IGNORECASE
)
_SEAS_SENTENCE_RE = re.compile(r"\b(?:seas?|waves?)\b[^.]*", re.IGNORECASE)
_HEIGHT_RE = re.compile(r"(\d+)(?:\s*to\s*(\d+))?\s*(?:ft|feet|foot)", re.IGNORECASE)


def _wind_range(text: str) -> tuple[float, float] | None:
    """Every sustained speed in a period ("NE winds 20 to 25 kt, increasing
    to 25 to 30 kt") as one low-high range; gusts excluded."""
    speeds = _WIND_SPEED_RE.findall(_GUSTS_RE.sub("", text))
    if not speeds:
        return None
    lows = [float(low) for low, _ in speeds]
    highs = [float(high or low) for low, high in speeds]
    return min(lows), max(highs)


def _sea_range(text: str) -> tuple[float, float] | None:
    """Every sea height in a period's seas/waves sentence ("Seas 4 to 5 ft,
    building to 5 to 7 ft"; "1 foot or less, then around 2 ft") as one
    low-high range; the wave-detail sentence and "occasionally to" sets
    excluded."""
    match = _SEAS_SENTENCE_RE.search(_WAVE_DETAIL_STRIP_RE.sub("", text))
    if not match:
        return None
    heights = _HEIGHT_RE.findall(_OCCASIONAL_SEAS_RE.sub("", match.group(0)))
    if not heights:
        return None
    lows = [float(low) for low, _ in heights]
    highs = [float(high or low) for low, high in heights]
    return min(lows), max(highs)


_WAVE_DETAIL_STRIP_RE = re.compile(r"wave detail:[^.]*\.?", re.IGNORECASE)
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


class SwellComponent(BaseModel):
    """One wave train from the marine text's "Wave Detail" ("SE 1 ft at
    8 seconds"): where it comes from, how big, and its period."""

    direction: str
    height_ft: float
    period_s: int


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
    # The first period's wave trains, largest first.
    swell: list[SwellComponent] = []


class WeatherNow(BaseModel):
    """The NWS land forecast's current period ("This Afternoon")."""

    name: str
    temperature_f: float | None = None
    short_forecast: str = ""
    sky: str = "unknown"
    precip_pct: int | None = None
    is_daytime: bool = True


class WeatherDay(BaseModel):
    """One calendar day of the NWS land forecast (its day and night
    periods). `high_f`/`low_f` are None when the forecast starts after
    that day's daytime period, or ends before its night."""

    date: date
    high_f: float | None = None
    low_f: float | None = None
    short_forecast: str = ""
    sky: str = "unknown"
    precip_pct: int | None = None


class PressurePoint(BaseModel):
    time: datetime
    mb: float


class Barometer(BaseModel):
    """Air pressure at the nearest NWS observation station, its change
    over the last 3 hours, and an hourly series for the last day."""

    station_id: str
    station_name: str
    latest_mb: float
    latest_at: datetime
    change_3h_mb: float | None = None
    # steady / rising / falling, "rapidly" when 3 h change >= 3 mb.
    trend: str = "steady"
    history: list[PressurePoint] = []


class PointWeather(BaseModel):
    now: WeatherNow | None = None
    days: list[WeatherDay] = []
    barometer: Barometer | None = None
    surf_zone: SurfZoneForecast | None = None


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

        if (wind := _wind_range(text)) is not None:
            wind_ranges.append(wind)

        if (seas := _sea_range(text)) is not None:
            wave_ranges.append(seas)

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
    conditions.swell = parse_wave_detail(
        next(
            (
                str(p.get("detailedForecast") or "")
                for p in periods
                if "wave detail" in str(p.get("detailedForecast") or "").lower()
            ),
            "",
        )
    )
    return conditions


_WAVE_DETAIL_RE = re.compile(r"wave detail:\s*(.+?)(?:\.\s|\.$|$)", re.IGNORECASE)
_SWELL_RE = re.compile(
    r"\b([NSEW]{1,3})\s+(\d+(?:\.\d+)?)\s*(?:ft|feet)\s+at\s+(\d+)\s*seconds?",
    re.IGNORECASE,
)


def parse_wave_detail(text: str) -> list[SwellComponent]:
    """The wave trains in a marine period's "Wave Detail: N 3 ft at 4
    seconds and SE 1 ft at 8 seconds." sentence, largest first."""
    match = _WAVE_DETAIL_RE.search(text)
    if not match:
        return []
    # The same train can be named twice ("W 2 ft at 12 seconds, becoming
    # W 4 ft at 12 seconds"): keep its biggest height, once.
    trains: dict[tuple[str, int], SwellComponent] = {}
    for direction, height, period in _SWELL_RE.findall(match.group(1)):
        component = SwellComponent(
            direction=direction.upper(), height_ft=float(height), period_s=int(period)
        )
        key = (component.direction, component.period_s)
        if key not in trains or component.height_ft > trains[key].height_ft:
            trains[key] = component
    return sorted(trains.values(), key=lambda c: c.height_ft, reverse=True)


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
            if (wind := _wind_range(text)) is not None:
                winds.append(wind)
            if (sea := _sea_range(text)) is not None:
                seas.append(sea)
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


# Marine zones whose /zones/forecast endpoint doesn't answer (most of
# Alaska's zones 404 there) are still in a Coastal Waters Forecast text
# bulletin. Alaska's are AJK (Juneau: Southeast inside waters, PKZ0xx),
# YAK (Yakutat: PKZ053), AEG (the Gulf's outer coast, PKZ6xx: Sitka,
# Ketchikan's outside waters) and AER/ALU (Anchorage east/west: the rest).
_CWF_LOCATIONS: dict[str, tuple[str, ...]] = {
    "PKZ": ("AER", "ALU", "AJK", "AEG", "YAK")
}


def _cwf_issuers(zone: str) -> tuple[str, ...]:
    """The CWF issuing locations to look in for *zone*, likeliest first,
    so one zone costs one or two bulletins rather than all five."""
    issuers = _CWF_LOCATIONS.get(zone[:3], ())
    number = zone[3:]
    if zone[:3] == "PKZ" and number.isdigit():
        first = {"0": ("AJK", "YAK"), "6": ("AEG",)}.get(number[0], ("AER", "ALU"))
        return (*first, *(i for i in issuers if i not in first))
    return issuers


_UGC_TIME = re.compile(r"^\d{6}$")
_CWF_PERIOD = re.compile(
    r"^\.([A-Z][A-Z ]*?)\.\.\.(.*?)(?=^\.[A-Z]|\Z)", re.MULTILINE | re.DOTALL
)


def _ugc_zones(header: str) -> set[str]:
    """Zone ids in a bulletin section's UGC header: "PKZ740-741>743-281200-"
    -> {PKZ740, PKZ741, PKZ742, PKZ743}."""
    zones: set[str] = set()
    prefix = ""
    for token in header.replace("\n", "").split("-"):
        token = token.strip()
        if not token or _UGC_TIME.match(token):
            continue
        if token[:3].isalpha():
            prefix, token = token[:3], token[3:]
        if not prefix:
            continue
        low, _, high = token.partition(">")
        if low.isdigit() and (not high or high.isdigit()):
            for number in range(int(low), int(high or low) + 1):
                zones.add(f"{prefix}{number:03d}")
    return zones


def parse_cwf_zone_periods(text: str, zone: str) -> list[dict[str, Any]]:
    """*zone*'s forecast periods from a Coastal Waters Forecast bulletin, in
    the shape the zone endpoint returns ({"name", "detailedForecast"}), so
    `parse_marine_zone_conditions` reads both the same way. "SAT NIGHT"
    becomes "Sat Night"; "SUN AND SUN NIGHT" starts a day ("Sun"). Empty
    when the bulletin has no section for *zone*."""
    for section in text.split("$$"):
        lines = section.strip().splitlines()
        # The UGC header starts at the first zone code ("PKZ740-...", after
        # the bulletin's own title lines in the first section) and runs to
        # the line ending in a 6-digit expiry time ("...-281200-").
        start = next(
            (
                i
                for i, line in enumerate(lines)
                if re.match(r"^[A-Z]{2}Z\d{3}[->]", line)
            ),
            None,
        )
        if start is None:
            continue
        header: list[str] = []
        for line in lines[start:]:
            header.append(line)
            if re.search(r"\d{6}-\s*$", line):
                break
        if zone not in _ugc_zones(" ".join(header)):
            continue
        periods = []
        for match in _CWF_PERIOD.finditer(section):
            name = match.group(1).strip().title()
            if " And " in name:  # "Sun And Sun Night": one day
                name = name.split(" And ")[0]
            detail = " ".join(match.group(2).split())
            periods.append({"name": name, "detailedForecast": detail})
        return periods
    return []


async def _cwf_periods(client: BoundedHTTPClient, zone: str) -> list[dict[str, Any]]:
    for location in _cwf_issuers(zone):
        listing: Any = await client.get_json(
            f"https://api.weather.gov/products/types/CWF/locations/{location}",
            headers=_NWS_HEADERS,
        )
        graph = listing.get("@graph") or []
        if not graph:
            continue
        product: Any = await client.get_json(
            f"https://api.weather.gov/products/{graph[0]['id']}", headers=_NWS_HEADERS
        )
        periods = parse_cwf_zone_periods(str(product.get("productText") or ""), zone)
        if periods:
            return periods
    return []


async def fetch_marine_zone_conditions(
    client: BoundedHTTPClient, zone: str = NWS_MARINE_ZONE_DEFAULT
) -> MarineZoneConditions:
    """Fetch and parse the NWS marine zone forecast. Raises a
    `ProviderError` subclass on failure — marine conditions are
    decision-relevant, so callers must see the failure rather than get a
    silently empty result (unlike alerts, see `fetch_point_alerts`).

    Falls back to the office's Coastal Waters Forecast text for zones
    the forecast endpoint doesn't serve (`_CWF_LOCATIONS`).
    """
    url = f"https://api.weather.gov/zones/forecast/{zone}/forecast"
    try:
        data = await client.get_json(url, headers=_NWS_HEADERS)
        periods = _field(data, "periods", url)
    except ProviderError:
        if zone[:3] not in _CWF_LOCATIONS:
            raise
        try:
            periods = await _cwf_periods(client, zone)
        except ProviderError:
            periods = []
        if not periods:
            raise
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


# Sky category from NWS's shortForecast text, most severe match first.
_SKY_KEYWORDS: list[tuple[str, tuple[str, ...]]] = [
    ("storm", ("thunder", "tstorm", "t-storm")),
    ("snow", ("snow", "sleet", "ice", "freezing")),
    ("rain", ("rain", "shower", "drizzle")),
    ("fog", ("fog", "haze", "smoke")),
    ("cloudy", ("mostly cloudy", "cloudy", "overcast")),
    ("partly", ("partly", "mostly sunny", "mostly clear")),
    ("clear", ("sunny", "clear", "fair")),
    ("wind", ("breezy", "windy")),
]


def sky_category(short_forecast: str) -> str:
    text = short_forecast.lower()
    for category, keywords in _SKY_KEYWORDS:
        if any(keyword in text for keyword in keywords):
            return category
    return "unknown"


def _precip(period: dict[str, Any]) -> int | None:
    value = (period.get("probabilityOfPrecipitation") or {}).get("value")
    return int(value) if isinstance(value, (int, float)) else None


def parse_point_weather(periods: list[dict[str, Any]]) -> PointWeather:
    """The current period plus one entry per calendar day (by each
    period's own start date), from a standard NWS gridpoint forecast."""
    weather = PointWeather()
    if not periods:
        return weather
    first = periods[0]
    weather.now = WeatherNow(
        name=str(first.get("name") or ""),
        temperature_f=first.get("temperature"),
        short_forecast=str(first.get("shortForecast") or ""),
        sky=sky_category(str(first.get("shortForecast") or "")),
        precip_pct=_precip(first),
        is_daytime=bool(first.get("isDaytime", True)),
    )
    by_date: dict[date, WeatherDay] = {}
    for period in periods:
        try:
            start = datetime.fromisoformat(str(period.get("startTime")))
        except ValueError:
            continue
        day = by_date.setdefault(start.date(), WeatherDay(date=start.date()))
        text = str(period.get("shortForecast") or "")
        temp = period.get("temperature")
        if period.get("isDaytime"):
            day.high_f = temp
            day.short_forecast, day.sky = text, sky_category(text)
        else:
            day.low_f = temp
            if not day.short_forecast:
                day.short_forecast, day.sky = text, sky_category(text)
        chance = _precip(period)
        if chance is not None:
            day.precip_pct = max(day.precip_pct or 0, chance)
    weather.days = sorted(by_date.values(), key=lambda day: day.date)
    return weather


def _items(payload: object) -> list[dict[str, Any]]:
    """A collection's members in either NWS response shape."""
    if not isinstance(payload, dict):
        return []
    raw = payload.get("@graph") or payload.get("features") or []
    return [item.get("properties", item) for item in raw if isinstance(item, dict)]


def parse_barometer(
    observations: list[dict[str, Any]], station_id: str, station_name: str
) -> Barometer | None:
    """Build the barometer from a station's observations (any order):
    the latest pressure, its change from about 3 hours earlier, and the
    last 24 hours sampled to one reading per hour. Pressures arrive in
    pascals; NWS leaves `value` null for a missing reading."""
    readings: list[tuple[datetime, float]] = []
    for item in observations:
        value = (item.get("barometricPressure") or {}).get("value")
        if not isinstance(value, (int, float)):
            value = (item.get("seaLevelPressure") or {}).get("value")
        try:
            moment = datetime.fromisoformat(str(item.get("timestamp")))
        except ValueError:
            continue
        if isinstance(value, (int, float)):
            readings.append((moment, round(value / 100, 1)))
    if not readings:
        return None
    readings.sort()
    latest_at, latest_mb = readings[-1]
    earlier = [r for r in readings if r[0] <= latest_at - timedelta(hours=3)]
    change = round(latest_mb - earlier[-1][1], 1) if earlier else None
    if change is None or abs(change) < 1.0:
        trend = "steady"
    else:
        trend = ("rising" if change > 0 else "falling") + (
            " rapidly" if abs(change) >= 3.0 else ""
        )
    hourly: dict[datetime, tuple[datetime, float]] = {}
    for moment, mb in readings:
        if moment >= latest_at - timedelta(hours=24):
            hourly[moment.replace(minute=0, second=0, microsecond=0)] = (moment, mb)
    return Barometer(
        station_id=station_id,
        station_name=station_name,
        latest_mb=latest_mb,
        latest_at=latest_at,
        change_3h_mb=change,
        trend=trend,
        history=[PressurePoint(time=t, mb=mb) for t, mb in sorted(hourly.values())],
    )


async def _fetch_barometer(
    client: BoundedHTTPClient, stations_url: str
) -> Barometer | None:
    try:
        stations = _items(await client.get_json(stations_url, headers=_NWS_HEADERS))
        if not stations:
            return None
        station = stations[0]
        station_id = str(station.get("stationIdentifier") or "")
        observations = _items(
            await client.get_json(
                f"https://api.weather.gov/stations/{station_id}/observations?limit=150",
                headers=_NWS_HEADERS,
            )
        )
        return parse_barometer(
            observations, station_id, str(station.get("name") or station_id)
        )
    except Exception:  # enrichment only
        logger.warning("NWS station barometer unavailable", exc_info=True)
        return None


async def _fetch_surf_zone(
    client: BoundedHTTPClient, points: object, names: list[str]
) -> SurfZoneForecast | None:
    try:
        office = str(_field(points, "cwa", "points"))
        zone = str(_field(points, "forecastZone", "points")).rsplit("/", 1)[-1]
        return await fetch_surf_zone(client, _NWS_HEADERS, office, zone, names)
    except Exception:  # enrichment only; many offices issue none
        logger.info("NWS surf zone forecast unavailable", exc_info=True)
        return None


async def fetch_point_weather(
    client: BoundedHTTPClient,
    lat: float,
    lng: float,
    names: list[str] | None = None,
) -> PointWeather | None:
    """The standard NWS forecast for the land grid point nearest
    (lat, lng): air temperature, sky and rain chance, plus the barometer
    at the nearest observation station. Enrichment only: degrades to
    `None` (or no barometer) on any failure."""
    try:
        points = await client.get_json(
            f"https://api.weather.gov/points/{lat:.4f},{lng:.4f}", headers=_NWS_HEADERS
        )
        forecast_url = _field(points, "forecast", "points")
        stations_url = _field(points, "observationStations", "points")
        forecast, barometer, surf_zone = await asyncio.gather(
            client.get_json(forecast_url, headers=_NWS_HEADERS),
            _fetch_barometer(client, str(stations_url)),
            _fetch_surf_zone(client, points, names or []),
        )
        weather = parse_point_weather(_field(forecast, "periods", forecast_url))
        weather.barometer = barometer
        weather.surf_zone = surf_zone
        return weather
    except Exception:  # enrichment only: any failure just means no weather
        logger.warning("NWS point weather forecast unavailable", exc_info=True)
        return None


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


# --- marine zone lookup for a point -------------------------------------

_OFFSHORE_ZONE = re.compile(
    r"(from|out) (10|20) to|10 to 60|20 to 60|beyond|offshore|60 nm", re.IGNORECASE
)
_INNER_ZONE = re.compile(
    r"\b(bay|harbor|sound|channel|bar|lake|river|lagoon|laguna|intra ?coastal)\b",
    re.IGNORECASE,
)
_ZONE_PROBE_MILES = (2.0, 5.0, 9.0)


def pick_marine_zone(candidates: dict[str, tuple[str, float]]) -> str | None:
    """The zone to forecast a coastal point from, among `{id: (name,
    miles from the point)}`. A zone that contains the point itself (0 mi)
    wins unless it's an offshore (10–60 nm) zone; otherwise prefer the
    nearshore open-coast zone over bays and harbors and offshore zones,
    then the nearest."""

    def offshore(name: str) -> bool:
        return bool(_OFFSHORE_ZONE.search(name))

    def inner(name: str) -> bool:
        return bool(_INNER_ZONE.search(name)) and "coastal" not in name.lower()

    containing = [
        zone
        for zone, (name, miles) in candidates.items()
        if miles == 0 and not offshore(name)
    ]
    if containing:
        return containing[0]
    ranked = sorted(
        candidates.items(),
        key=lambda item: (offshore(item[1][0]), inner(item[1][0]), item[1][1]),
    )
    return ranked[0][0] if ranked else None


async def _zones_at_point(
    client: BoundedHTTPClient, lat: float, lng: float
) -> list[tuple[str, str]]:
    try:
        data: Any = await client.get_json(
            f"https://api.weather.gov/zones?type=marine&point={lat:.4f},{lng:.4f}",
            headers={**_NWS_HEADERS, "Accept": "application/geo+json"},
        )
    except ProviderError:
        return []
    return [
        (str(f["properties"]["id"]), str(f["properties"].get("name", "")))
        for f in data.get("features", [])
        if isinstance(f, dict) and isinstance(f.get("properties"), dict)
    ]


async def find_marine_zone(
    client: BoundedHTTPClient, lat: float, lng: float
) -> str | None:
    """The NWS marine zone for a coastal point: zones at the point and on
    rings around it (a beach point is often just on land), picked by
    `pick_marine_zone`. None if NWS has none nearby or can't be reached."""
    found: dict[str, tuple[str, float]] = {}
    for zone, name in await _zones_at_point(client, lat, lng):
        found[zone] = (name, 0.0)
    for miles in _ZONE_PROBE_MILES:
        points = [
            (
                lat + miles / 69.0 * math.cos(math.radians(bearing)),
                lng
                + miles
                / (69.0 * math.cos(math.radians(lat)))
                * math.sin(math.radians(bearing)),
            )
            for bearing in range(0, 360, 45)
        ]
        rings = await asyncio.gather(
            *(_zones_at_point(client, a, b) for a, b in points)
        )
        for ring in rings:
            for zone, name in ring:
                if zone not in found or miles < found[zone][1]:
                    found[zone] = (name, miles)
        if found:
            break
    return pick_marine_zone(found)
