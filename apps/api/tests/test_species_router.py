"""The /v1/species router (the web app's Fish guide)."""

from __future__ import annotations

from collections.abc import Iterator
from itertools import pairwise
from types import SimpleNamespace
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.api.deps import get_app_state
from app.api.internal_auth import require_internal_signature
from app.domain.guidance import load_catalogue
from app.main import app

_DAY = {"Excellent": 4, "Good": 3, "Fair": 2, "Challenging": 1, "Poor": 0}


@pytest.fixture
def client() -> Iterator[TestClient]:
    app.dependency_overrides[require_internal_signature] = lambda: None
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.pop(require_internal_signature, None)


def test_lists_every_catalogue_fish(client: TestClient) -> None:
    resp = client.get("/v1/species")
    assert resp.status_code == 200
    body = resp.json()
    assert len(body) == len(load_catalogue())
    red = next(fish for fish in body if fish["id"] == "red-drum")
    assert red["access"] == "shore"
    assert "atlantic_mid" in red["regions"]
    assert red["peak_months"] and "bait" not in red  # summaries stay small
    assert red["spawn"]["months"] and red["spawn"]["note"]


def test_one_fish_in_full_with_state_limits(client: TestClient) -> None:
    resp = client.get("/v1/species/red-drum")
    assert resp.status_code == 200
    fish = resp.json()
    assert fish["bait"] and fish["rig"] and fish["explanation_warm"]
    states = {regulation["state"] for regulation in fish["regulations"]}
    assert {"NC", "FL", "TX"} <= states
    nc = next(r for r in fish["regulations"] if r["state"] == "NC")
    assert nc["source_url"]


def test_unknown_fish_is_404(client: TestClient) -> None:
    assert client.get("/v1/species/not-a-fish").status_code == 404


def test_spots_rank_the_users_spots_for_this_fish(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    from datetime import UTC, datetime

    from fastapi import HTTPException

    import app.api.v1.species as species_router
    from app.domain.models import (
        Confidence,
        ConfidenceLevel,
        ForecastEnvelope,
        ForecastState,
        Location,
    )
    from app.providers.locations import load_curated_locations, resolved_from_curated

    curated = {loc.id: loc for loc in load_curated_locations()}
    water = {"wrightsville-beach-nc": 64.0, "sandy-hook-nj": 52.0, "destin-fl": 64.0}
    # Same water at Wrightsville and Destin, so red drum ties: Destin's
    # better day must rank it first.
    verdict = {
        "wrightsville-beach-nc": "Fair",
        "sandy-hook-nj": "Good",
        "destin-fl": "Good",
    }

    async def fake_resolve(location_id: str, state: object) -> object:
        if location_id not in curated:
            raise HTTPException(status_code=404)
        return resolved_from_curated(curated[location_id])

    async def fake_forecast(
        cache: object, location: Any, *args: object, **kw: object
    ) -> ForecastEnvelope:
        loc = location  # a ResolvedLocation
        return ForecastEnvelope(
            location=Location(
                id=loc.id,
                label=loc.name,
                lat=loc.lat,
                lng=loc.lng,
                timezone=loc.timezone,
            ),
            generated_at=datetime(2026, 11, 18, 15, tzinfo=UTC),
            state=ForecastState.FRESH,
            confidence=Confidence(level=ConfidenceLevel.HIGH, reasons=[]),
            conditions={
                "water_temperature": {"value": water[loc.id], "is_fallback": False},
                "score": {"verdict": verdict[loc.id]},
            },
            recommendations={"basis": {"month": 11, "water_temp_is_fallback": False}},
        )

    monkeypatch.setattr(species_router, "resolve_location_id", fake_resolve)
    app.dependency_overrides[get_app_state] = lambda: SimpleNamespace(
        forecast_cache=None, http_client=None
    )
    monkeypatch.setattr(species_router, "get_or_assemble_forecast", fake_forecast)
    resp = client.get(
        "/v1/species/red-drum/spots",
        params=[
            ("ids", "sandy-hook-nj"),
            ("ids", "wrightsville-beach-nc"),
            ("ids", "nowhere"),
            ("ids", "destin-fl"),
        ],
    )
    assert resp.status_code == 200
    spots = resp.json()
    # Unknown spots drop out; biting spots come first, best first.
    assert {s["location_id"] for s in spots} == {
        "sandy-hook-nj",
        "wrightsville-beach-nc",
        "destin-fl",
    }
    biting = [s for s in spots if s["biting"]]
    assert biting and spots[: len(biting)] == biting
    assert [s["score"] for s in biting] == sorted(
        [s["score"] for s in biting], reverse=True
    )
    assert all(s["reasons"] for s in biting)
    assert [s["location_id"] for s in biting][:2] == [
        "destin-fl",
        "wrightsville-beach-nc",
    ]
    # Ties on the fish's score go to the better day overall.
    for better, worse in pairwise(biting):
        if better["score"] == worse["score"]:
            assert _DAY[better["day_verdict"]] >= _DAY[worse["day_verdict"]]
    # Red drum isn't a Northeast fish: Sandy Hook can't be biting.
    hook = next(s for s in spots if s["location_id"] == "sandy-hook-nj")
    assert hook["biting"] is False and hook["day_verdict"] == "Good"
    assert client.get("/v1/species/not-a-fish/spots").status_code == 404
    app.dependency_overrides.pop(get_app_state, None)
