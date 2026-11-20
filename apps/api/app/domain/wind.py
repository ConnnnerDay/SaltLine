"""How the wind meets a coast: onshore, offshore or along the shore.

Uses the same per-coast onshore/offshore direction sets the score does
(`app.domain.scoring.onshore_offshore_dirs`), plus the bearing the beach
faces, so the forecast can draw a compass with the sea side marked.
Island (Hawaii) shores face every way, so they get neither.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel

from app.domain.scoring import facing_bearing, onshore_offshore_dirs

# Compass bearing the beach faces (toward the water), per orientation.
_SEA_BEARING = {"east": 90, "west": 270, "gulf": 180}


class WindEffect(BaseModel):
    orientation: str
    sea_bearing: int | None  # None for island shores
    relation: Literal["onshore", "offshore", "cross"] | None


def wind_effect_for(orientation: str, wind_direction: str | None) -> WindEffect:
    onshore, offshore = onshore_offshore_dirs(orientation)
    relation: Literal["onshore", "offshore", "cross"] | None = None
    sea_bearing = facing_bearing(orientation)
    if sea_bearing is None:
        sea_bearing = _SEA_BEARING.get(orientation)
    if wind_direction and sea_bearing is not None:
        direction = wind_direction.upper()
        relation = (
            "onshore"
            if direction in onshore
            else "offshore"
            if direction in offshore
            else "cross"
        )
    return WindEffect(
        orientation=orientation,
        sea_bearing=sea_bearing,
        relation=relation,
    )
