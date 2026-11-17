"""Nearby live-cam links (`app.providers.live_cams`, `/v1/locations/{id}/cams`)."""

from __future__ import annotations

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

from app.api.internal_auth import require_internal_signature
from app.main import app
from app.providers.live_cams import find_nearby_cams, load_live_cams


def test_catalogue_loads_and_is_https_links() -> None:
    cams = load_live_cams()
    assert len(cams) >= 10
    assert all(cam.url.startswith("https://") for cam in cams)
    assert len({cam.id for cam in cams}) == len(cams)


def test_nearby_is_sorted_and_within_radius() -> None:
    cams = find_nearby_cams(34.2104, -77.7964, 15)  # Wrightsville Beach
    assert cams, "Wrightsville has nearby cams"
    distances = [cam.distance_miles for cam in cams]
    assert distances == sorted(distances)
    assert all(distance <= 15 for distance in distances)
    assert {"wrightsville-beach-surf-cam", "johnnie-mercers-pier-cam"} <= {
        c.id for c in cams
    }


def test_nothing_nearby_in_open_ocean() -> None:
    assert find_nearby_cams(30.0, -60.0) == []


@pytest.fixture
def client() -> Iterator[TestClient]:
    app.dependency_overrides[require_internal_signature] = lambda: ""
    try:
        with TestClient(app) as test_client:
            yield test_client
    finally:
        app.dependency_overrides.pop(require_internal_signature, None)


def test_route_returns_nearby_cams(client: TestClient) -> None:
    resp = client.get("/v1/locations/wrightsville-beach-nc/cams")
    assert resp.status_code == 200
    body = resp.json()
    assert body[0]["distance_miles"] <= body[-1]["distance_miles"]
    assert {"id", "name", "cam_type", "url", "distance_miles"} <= set(body[0])


def test_route_404s_for_unknown_location(client: TestClient) -> None:
    assert client.get("/v1/locations/nowhere/cams").status_code == 404


def test_route_validates_radius(client: TestClient) -> None:
    assert (
        client.get(
            "/v1/locations/wrightsville-beach-nc/cams?radius_miles=500"
        ).status_code
        == 422
    )


def test_nearby_spots_route(client: TestClient) -> None:
    resp = client.get("/v1/locations/wrightsville-beach-nc/nearby")
    assert resp.status_code == 200
    spots = resp.json()
    assert 1 <= len(spots) <= 3
    assert all(spot["id"] != "wrightsville-beach-nc" for spot in spots)
    distances = [spot["distance_miles"] for spot in spots]
    assert distances == sorted(distances) and distances[-1] <= 60
    assert client.get("/v1/locations/nowhere/nearby").status_code == 404
