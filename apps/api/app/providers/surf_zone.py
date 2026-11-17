"""NWS Surf Zone Forecast (product type SRF): the beach forecast NWS
offices write for swimmers and surf anglers -- rip current risk, breaking
surf height at the beach (not offshore seas), thunderstorm potential, UV
index, water temperature, and headline hazards ("HIGH SURF ADVISORY").

An office's product covers several beach zones in segments separated by
"$$", each opening with a UGC line of zone codes ("FLZ124-125-180900-",
ranges as "FLZ124>126") and listing its beaches. We pick the segment for
the spot's NWS public forecast zone (from /points) and parse its periods:
".REST OF TODAY..." / ".WEDNESDAY..." blocks of "Field.......Value." rows,
then the ".EXTENDED..." one-line days, whose surf heights we keep.

Not every office issues one (some only in beach season), so this is
enrichment: anything missing or unparseable yields None.
"""

from __future__ import annotations

import re
from typing import Any

from pydantic import BaseModel

UGC_LINE = re.compile(r"^([A-Z]{2}[ZC][0-9>\-]+-\d{6}-)\s*$", re.MULTILINE)
PERIOD = re.compile(r"^\.([A-Z][A-Z .']+?)\.\.\.(.*)$", re.MULTILINE)
FIELD = re.compile(r"^([A-Z][A-Za-z ]+?)\*{0,2}\.{2,}(.*)$")
HEADLINE = re.compile(r"^\.\.\.(.+?)\.\.\.$", re.MULTILINE)
EXTENDED_SURF = re.compile(r"Surf height ([^.]+)\.", re.IGNORECASE)


class SurfPeriod(BaseModel):
    name: str
    rip_current_risk: str | None = None
    surf_height: str | None = None
    thunderstorm: str | None = None
    uv_index: str | None = None
    water_temperature: str | None = None
    weather: str | None = None


class SurfDay(BaseModel):
    name: str
    surf_height: str


class SurfZoneForecast(BaseModel):
    office: str
    beaches: str | None = None
    headlines: list[str] = []
    periods: list[SurfPeriod] = []
    extended: list[SurfDay] = []


def expand_ugc(line: str) -> set[str]:
    """'FLZ124>126-233-180900-' -> {'FLZ124','FLZ125','FLZ126','FLZ233'}."""
    zones: set[str] = set()
    prefix = ""
    for part in line.strip().strip("-").split("-")[:-1]:  # drop the expiry time
        if part[:3].isalpha():
            prefix, part = part[:3], part[3:]
        if ">" in part:
            start, end = (int(x) for x in part.split(">"))
            zones.update(f"{prefix}{n:03d}" for n in range(start, end + 1))
        elif part.isdigit():
            zones.add(f"{prefix}{int(part):03d}")
    return zones


def _clean(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip().rstrip(".")


def parse_segment(segment: str, office: str) -> SurfZoneForecast:
    forecast = SurfZoneForecast(office=office)
    including = re.search(
        r"Including the beaches of\s+(.+?)\n\s*\n", segment, re.DOTALL
    )
    if not including:
        including = re.search(
            r"Including the beaches of\s+(.+?)\n\d", segment, re.DOTALL
        )
    if including:
        # Drop the issuance time line that can follow the list.
        beaches = re.sub(
            r"\s*\d{3,4} [AP]M [A-Z]{3,4} .*$", "", _clean(including.group(1))
        )
        forecast.beaches = beaches.rstrip(",. ")
    body = segment.split("&&")[0]
    forecast.headlines = [_clean(h).capitalize() for h in HEADLINE.findall(body)]
    marks = list(PERIOD.finditer(body))
    for index, mark in enumerate(marks):
        name = _clean(mark.group(1)).title()
        end = marks[index + 1].start() if index + 1 < len(marks) else len(body)
        block = mark.group(2) + body[mark.end() : end]
        if name == "Extended":
            continue
        if not re.search(r"\.{4,}", block):  # an extended one-line day
            surf = EXTENDED_SURF.search(block)
            if surf:
                forecast.extended.append(
                    SurfDay(name=name, surf_height=_clean(surf.group(1)))
                )
            continue
        period = SurfPeriod(name=name)
        current: str | None = None
        values: dict[str, str] = {}
        for raw in block.splitlines():
            field = FIELD.match(raw.strip())
            if field:
                current = field.group(1).strip().lower()
                values[current] = field.group(2)
            elif current and raw.startswith(" " * 10) and raw.strip():
                values[current] += " " + raw.strip()
            elif not raw.strip():
                current = None
        period.rip_current_risk = (
            _clean(values["rip current risk"]) if "rip current risk" in values else None
        )
        period.surf_height = (
            _clean(values["surf height"]) if "surf height" in values else None
        )
        period.thunderstorm = (
            _clean(values["thunderstorm potential"])
            if "thunderstorm potential" in values
            else None
        )
        period.uv_index = _clean(values["uv index"]) if "uv index" in values else None
        period.water_temperature = (
            _clean(values["water temperature"])
            if "water temperature" in values
            else None
        )
        period.weather = _clean(values["weather"]) if "weather" in values else None
        if period.rip_current_risk or period.surf_height:
            forecast.periods.append(period)
    return forecast


def _name_tokens(name: str) -> list[str]:
    """'Cape Cod / Chatham' -> ['cape cod', 'chatham']."""
    parts = re.split(r"[/,()]", name)
    return [part.strip().lower() for part in parts if len(part.strip()) >= 4]


def parse_surf_zone_product(
    text: str, zone: str, office: str, names: list[str] | None = None
) -> SurfZoneForecast | None:
    """The segment of an SRF product covering *zone* (e.g. 'FLZ125'). A
    spot whose coordinates fall just offshore gets a marine zone from
    NWS, so failing a zone match, the segment whose "Including the
    beaches of" list names the spot (any of *names*) is used."""
    segments: list[tuple[set[str], str]] = []
    for segment in text.split("$$"):
        match = UGC_LINE.search(segment)
        if match:
            segments.append((expand_ugc(match.group(1)), segment[match.end() :]))
    chosen = next((body for zones, body in segments if zone in zones), None)
    if chosen is None and names:
        tokens = [token for name in names for token in _name_tokens(name)]
        for _, body in segments:
            header = body.split("\n.")[0].lower()
            if any(token in header for token in tokens):
                chosen = body
                break
    if chosen is None:
        return None
    parsed = parse_segment(chosen, office)
    if not parsed.periods:
        parsed.periods = _shore_table(chosen)
    return parsed if parsed.periods else None


SHORE_ROW = re.compile(
    r"^(North|East|South|West)[ -]Facing\s+(\d+-\d+|\d+)\s+(\d+-\d+|\d+)", re.MULTILINE
)


def _shore_table(body: str) -> list[SurfPeriod]:
    """Honolulu's SRF gives a table of surf heights by the direction a
    shore faces ("North Facing  7-10  6-8 ..."), today AM/PM first,
    instead of field rows: summarized as today's surf by shore."""
    rows = SHORE_ROW.findall(body)
    if not rows:
        return []
    heights = "; ".join(f"{facing}-facing shores {am} ft" for facing, am, _pm in rows)
    return [SurfPeriod(name="Today", surf_height=heights)]


async def fetch_surf_zone(
    client: Any,
    headers: dict[str, str],
    office: str,
    zone: str,
    names: list[str] | None = None,
) -> SurfZoneForecast | None:
    """The latest SRF from *office* (e.g. 'JAX'), for *zone*. Enrichment:
    None when the office has none or the zone isn't in it."""
    listing = await client.get_json(
        f"https://api.weather.gov/products/types/SRF/locations/{office}",
        headers=headers,
    )
    items = (listing or {}).get("@graph") or (listing or {}).get("features") or []
    if not items:
        return None
    product = await client.get_json(
        f"https://api.weather.gov/products/{items[0]['id']}", headers=headers
    )
    text = str((product or {}).get("productText") or "")
    return parse_surf_zone_product(text, zone, office, names)
