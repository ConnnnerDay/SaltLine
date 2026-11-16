"""Nearby public live-cam links (restored from the original app's "Live
Cams"): a short curated list (`app/data/live_cams.json`, copied from the
legacy `locations.py` by `scripts/generate_guidance_catalogue.py`), matched
by distance. Links only -- nothing is embedded or proxied, so the cam
sites' own pages and terms apply.
"""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import BaseModel

from app.providers.locations import _haversine_miles

_CAMS_PATH = Path(__file__).resolve().parent.parent / "data" / "live_cams.json"
DEFAULT_RADIUS_MILES = 15.0


class LiveCam(BaseModel):
    id: str
    name: str
    cam_type: Literal["beach", "pier"]
    lat: float
    lng: float
    url: str


class NearbyCam(LiveCam):
    distance_miles: float


@lru_cache(maxsize=1)
def load_live_cams() -> tuple[LiveCam, ...]:
    data = json.loads(_CAMS_PATH.read_text())
    return tuple(LiveCam.model_validate(cam) for cam in data["cams"])


def find_nearby_cams(
    lat: float, lng: float, radius_miles: float = DEFAULT_RADIUS_MILES
) -> list[NearbyCam]:
    nearby = [
        NearbyCam(
            **cam.model_dump(),
            distance_miles=round(_haversine_miles(lat, lng, cam.lat, cam.lng), 1),
        )
        for cam in load_live_cams()
    ]
    return sorted(
        (cam for cam in nearby if cam.distance_miles <= radius_miles),
        key=lambda cam: cam.distance_miles,
    )
