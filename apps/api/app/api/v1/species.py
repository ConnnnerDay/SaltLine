"""`/v1/species`: the fish catalogue behind "What's biting"
(`app/data/guidance_species.json`), for the web app's Fish guide.

- `GET /v1/species` lists every fish with what the guide's list needs
  (regions, access, season months, temperature range, target groups).
- `GET /v1/species/{id}` is one fish in full: bait, rig, tackle, both
  seasonal write-ups, and its recreational limits in every state the
  regulations snapshot covers (each with that state's official source).

Read-only, profile-independent data; signed like every apps/api route.
"""

from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.api.internal_auth import require_internal_signature
from app.domain.guidance import (
    Regulation,
    load_catalogue,
    load_regulations,
    regulation_for,
)

router = APIRouter(
    prefix="/v1/species",
    tags=["species"],
    dependencies=[Depends(require_internal_signature)],
)


class SpeciesSummary(BaseModel):
    id: str
    name: str
    regions: list[str]
    access: str
    """shore | boat | tidal | incidental (see app.domain.guidance)."""
    temp_min: float
    temp_max: float
    temp_ideal_low: float
    temp_ideal_high: float
    peak_months: list[int]
    good_months: list[int]
    targets: list[str] = []


class SpeciesDetail(SpeciesSummary):
    bait: str
    rig: str
    hook_size: str
    sinker: str
    lures: str
    explanation_cold: str
    explanation_warm: str
    conditions: list[str] = []
    regulations: list[Regulation] = []
    """Recreational limits by state (provisional snapshot -- check the
    official source linked on each)."""


def _summary(species: dict[str, object]) -> dict[str, object]:
    return {"access": "shore", **species}


@router.get("")
async def list_species() -> list[SpeciesSummary]:
    return [SpeciesSummary.model_validate(_summary(s)) for s in load_catalogue()]


@router.get("/{species_id}")
async def get_species(species_id: str) -> SpeciesDetail:
    species = next((s for s in load_catalogue() if s["id"] == species_id), None)
    if species is None:
        raise HTTPException(status_code=404, detail="unknown species")
    today = datetime.now(UTC).date()
    regulations = [
        regulation
        for state in sorted(load_regulations()["states"])
        if (regulation := regulation_for(species_id, state, today)) is not None
    ]
    return SpeciesDetail.model_validate(
        {**_summary(species), "regulations": regulations}
    )
