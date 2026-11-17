"""Fish recently seen near a spot, from iNaturalist (https://www.inaturalist.org).

iNaturalist is a public observation database where people log the wildlife
they find, with photos, and other users confirm the identification. Only
"research grade" observations (community-confirmed identity, with date and
location) are used here. That is evidence of what has actually been around
lately -- something the season-and-temperature species model can't give.

Two requests per spot: species counts (what's been seen, how often) and
the most recent individual sightings. Ray-finned fish and sharks/rays only,
minus the common freshwater families (sunfish, gars, minnows...), since
coastal radii also cover inland ponds. Photos are kept only when their
license is a Creative Commons one, and always carry their attribution.

Results are cached per spot for `CACHE_TTL` (recent sightings don't change
by the minute, and iNaturalist asks API users to keep request rates low).
Any failure returns `None`: this is enrichment, never a reason to fail.
"""

from __future__ import annotations

import logging
import time
from datetime import date, datetime, timedelta
from typing import Any

from pydantic import BaseModel

from app.infra.http_client import BoundedHTTPClient
from app.providers.locations import _haversine_miles

logger = logging.getLogger(__name__)

API = "https://api.inaturalist.org/v1"
# Actinopterygii (ray-finned fishes), Elasmobranchii (sharks and rays).
FISH_TAXA = "47178,47273"
# Freshwater families excluded (sunfish/bass, gars, livebearers, minnows,
# catfish, pike, suckers, perch, bowfin, cichlids, tetras). Killifish and
# gobies stay: mostly brackish/marine, and mummichogs are bait.
FRESHWATER_FAMILIES = (
    "49588,54545,59116,49609,58655,51369,58661,48158,58614,54196,47387"
)
RADIUS_KM = 25
DAYS = 60
CACHE_TTL = 6 * 3600
_HEADERS = {"User-Agent": "Saltline/1.0 (self-hosted fishing forecast)"}


class SeenSpecies(BaseModel):
    name: str
    scientific_name: str
    count: int
    taxon_url: str
    photo_url: str | None = None
    photo_credit: str | None = None


class Sighting(BaseModel):
    name: str
    scientific_name: str
    observed_on: date
    distance_miles: float
    place: str | None = None
    url: str
    photo_url: str | None = None
    photo_credit: str | None = None


class RecentSightings(BaseModel):
    radius_miles: float
    days: int
    total_species: int
    species: list[SeenSpecies]
    recent: list[Sighting]


_cache: dict[str, tuple[float, RecentSightings]] = {}


def _licensed_photo(photo: dict[str, Any] | None) -> tuple[str | None, str | None]:
    """A small photo URL and its attribution, only for CC-licensed photos."""
    if not photo or not photo.get("license_code") or not photo.get("url"):
        return None, None
    url = str(photo["url"]).replace("/square.", "/small.")
    return url, str(photo.get("attribution") or "iNaturalist contributor")


def _name(taxon: dict[str, Any]) -> str:
    return str(
        taxon.get("preferred_common_name") or taxon.get("name") or "Unknown fish"
    )


def parse_sightings(
    counts: dict[str, Any], observations: dict[str, Any], lat: float, lng: float
) -> RecentSightings:
    species: list[SeenSpecies] = []
    for row in counts.get("results", []):
        taxon = row.get("taxon") or {}
        url, credit = _licensed_photo(taxon.get("default_photo"))
        species.append(
            SeenSpecies(
                name=_name(taxon),
                scientific_name=str(taxon.get("name") or ""),
                count=int(row.get("count") or 0),
                taxon_url=f"https://www.inaturalist.org/taxa/{taxon.get('id')}",
                photo_url=url,
                photo_credit=credit,
            )
        )
    recent: list[Sighting] = []
    for obs in observations.get("results", []):
        taxon = obs.get("taxon") or {}
        try:
            olat, olng = (float(part) for part in str(obs.get("location")).split(","))
            observed = date.fromisoformat(str(obs.get("observed_on")))
        except ValueError:
            continue
        url, credit = _licensed_photo((obs.get("photos") or [None])[0])
        recent.append(
            Sighting(
                name=_name(taxon),
                scientific_name=str(taxon.get("name") or ""),
                observed_on=observed,
                distance_miles=round(_haversine_miles(lat, lng, olat, olng), 1),
                place=obs.get("place_guess"),
                url=str(
                    obs.get("uri")
                    or f"https://www.inaturalist.org/observations/{obs.get('id')}"
                ),
                photo_url=url,
                photo_credit=credit,
            )
        )
    return RecentSightings(
        radius_miles=round(RADIUS_KM * 0.621371),
        days=DAYS,
        total_species=int(counts.get("total_results") or len(species)),
        species=species,
        recent=recent,
    )


async def fetch_recent_sightings(
    client: BoundedHTTPClient, lat: float, lng: float, now: datetime
) -> RecentSightings | None:
    key = f"{lat:.3f},{lng:.3f}"
    cached = _cache.get(key)
    if cached and time.monotonic() - cached[0] < CACHE_TTL:
        return cached[1]
    since = (now - timedelta(days=DAYS)).date().isoformat()
    common = (
        f"lat={lat:.4f}&lng={lng:.4f}&radius={RADIUS_KM}&taxon_id={FISH_TAXA}"
        f"&without_taxon_id={FRESHWATER_FAMILIES}&quality_grade=research&d1={since}"
    )
    try:
        counts = await client.get_json(
            f"{API}/observations/species_counts?{common}&per_page=8", headers=_HEADERS
        )
        observations = await client.get_json(
            f"{API}/observations?{common}&order_by=observed_on&per_page=8&photos=true",
            headers=_HEADERS,
        )
        result = parse_sightings(
            counts if isinstance(counts, dict) else {},
            observations if isinstance(observations, dict) else {},
            lat,
            lng,
        )
    except Exception:  # enrichment only
        logger.warning("iNaturalist sightings unavailable", exc_info=True)
        return None
    _cache[key] = (time.monotonic(), result)
    return result
