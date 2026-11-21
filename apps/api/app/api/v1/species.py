"""`/v1/species`: the fish catalogue behind "What's biting"
(`app/data/guidance_species.json`), for the web app's Fish guide.

- `GET /v1/species` lists every fish with what the guide's list needs
  (regions, access, season months, temperature range, target groups).
- `GET /v1/species/{id}` is one fish in full: bait, rig, tackle, both
  seasonal write-ups, and its recreational limits in every state the
  regulations snapshot covers (each with that state's official source).
- `GET /v1/species/{id}/spots?ids=...` ranks the given spots (the user's
  home and saved spots) for this fish today: each spot's current forecast
  (the same 4-hour cache the forecast page uses), scored for this one fish
  exactly as "What's biting" scores it.

Read-only, profile-independent data; signed like every apps/api route.
"""

from __future__ import annotations

import asyncio
from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from app.api.deps import AppState, get_app_state, resolve_location_id
from app.api.internal_auth import require_internal_signature
from app.api.v1.forecasts import load_preferences, personalized_with
from app.domain.forecast_cache import get_or_assemble_forecast
from app.domain.guidance import (
    Regulation,
    build_fishing_guidance,
    load_catalogue,
    load_regulations,
    regulation_for,
    tier_for_day,
)
from app.domain.preferences import PreferencesOut
from app.domain.scoring import wind_orientation_for
from app.infra.timezones import safe_zone
from app.providers.locations import load_water_temp_profiles

router = APIRouter(
    prefix="/v1/species",
    tags=["species"],
    dependencies=[Depends(require_internal_signature)],
)


class Spawn(BaseModel):
    """When and at what water temperature the fish spawns (legacy
    SPAWNING_DATA), with what that means for anglers."""

    months: list[int]
    temp_low: float
    temp_high: float
    note: str


class RegionSeason(BaseModel):
    peak_months: list[int]
    good_months: list[int]


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
    season_by_region: dict[str, RegionSeason] = {}
    """Peak/good months for regions where they differ from the above."""
    targets: list[str] = []
    spawn: Spawn | None = None


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


MAX_SPOTS = 12
_DAY_RANK = {"Excellent": 4, "Good": 3, "Fair": 2, "Challenging": 1, "Poor": 0}


class SpotForSpecies(BaseModel):
    location_id: str
    label: str
    biting: bool
    """In range and in season enough to be a "What's biting" pick here."""
    score: int | None = None
    tier: str | None = None
    reasons: list[str] = []
    water_temp_f: float | None = None
    day_verdict: str | None = None
    """The spot's overall verdict today (wind, waves...)."""


def _pair(value: Any) -> tuple[float, float] | None:
    if isinstance(value, list | tuple) and len(value) == 2:
        return float(value[0]), float(value[1])
    return None


async def _spot_for(
    species_id: str,
    location_id: str,
    state: AppState,
    now: datetime,
    prefs: PreferencesOut | None = None,
) -> SpotForSpecies | None:
    try:
        location = await resolve_location_id(location_id, state)
        envelope = await get_or_assemble_forecast(
            state.forecast_cache,
            location,
            state.http_client,
            load_water_temp_profiles(),
            now=now,
        )
    except HTTPException:  # an unknown or out-of-range spot just drops out
        return None
    # The day as the signed-in angler sees it on the forecast page (their
    # main style, their comfort limits).
    envelope = personalized_with(envelope, prefs)
    conditions = envelope.conditions or {}
    basis = (envelope.recommendations or {}).get("basis") or {}
    water = (conditions.get("water_temperature") or {}).get("value")
    verdict = (conditions.get("score") or {}).get("verdict")
    out = SpotForSpecies(
        location_id=location.id,
        label=envelope.location.label,
        biting=False,
        water_temp_f=water,
        day_verdict=verdict,
    )
    if water is None:
        return out
    every = build_fishing_guidance(
        region=location.conditions_region,
        water_temp_f=float(water),
        water_temp_is_fallback=bool(basis.get("water_temp_is_fallback", True)),
        month=int(
            basis.get("month") or now.astimezone(safe_zone(location.timezone)).month
        ),
        wave_range_ft=_pair(conditions.get("wave_range_ft")),
        coast=wind_orientation_for(location),
        wind_direction=conditions.get("wind_direction"),
        wind_range_kt=_pair(conditions.get("wind_range_kt")),
        hour=now.astimezone(safe_zone(location.timezone)).hour,
        max_picks=10_000,
    )
    pick = next(
        (
            p
            for p in [*every.species, *every.boat_species, *every.tidal_species]
            if p.id == species_id
        ),
        None,
    )
    if pick is not None:
        out.biting = True
        out.score = pick.score
        out.tier = tier_for_day(pick.score, verdict).value
        out.reasons = pick.reasons
    return out


@router.get("/{species_id}/spots")
async def spots_for_species(
    species_id: str,
    ids: list[str] = Query(default=[], max_length=MAX_SPOTS),  # noqa: B008
    state: AppState = Depends(get_app_state),  # noqa: B008
    user_id: str | None = Depends(require_internal_signature),
) -> list[SpotForSpecies]:
    """*ids* (the user's spots) ranked for this fish today: biting spots by
    score, best first; the rest after, in the order given. Each spot's day
    is rated as the signed-in user sees it."""
    if not any(s["id"] == species_id for s in load_catalogue()):
        raise HTTPException(status_code=404, detail="unknown species")
    now = datetime.now(UTC)
    unique = list(dict.fromkeys(ids))[:MAX_SPOTS]
    prefs = await load_preferences(user_id, state)
    found = await asyncio.gather(
        *(_spot_for(species_id, i, state, now, prefs) for i in unique)
    )
    spots = [spot for spot in found if spot is not None]
    # Best for this fish first; on a tie, the spot with the better day overall
    # (wind, waves) -- the same fish at a calmer beach is the better trip.
    biting = sorted(
        (s for s in spots if s.biting),
        key=lambda s: (s.score or 0, _DAY_RANK.get(s.day_verdict or "", 0)),
        reverse=True,
    )
    return biting + [s for s in spots if not s.biting]
