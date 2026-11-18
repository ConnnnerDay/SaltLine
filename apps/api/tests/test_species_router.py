"""The /v1/species router (the web app's Fish guide)."""

from __future__ import annotations

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

from app.api.internal_auth import require_internal_signature
from app.domain.guidance import load_catalogue
from app.main import app


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
