"""Tests for the /v1/me/locations router (sprint 37).

Same ephemeral-SQLite posture as test_preferences_router.py -- see that
file's module docstring for why. `resolve_location_id` needs the same
station-catalog fixtures test_locations_router.py already established
(a real curated location, "wrightsville-beach-nc", resolves without any
outbound HTTP call; a dynamic point needs the CO-OPS/NDBC catalog mocks).
"""

from __future__ import annotations

from collections.abc import AsyncIterator, Iterator

import httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import create_async_engine

from app.api.deps import AppState, get_app_state
from app.api.internal_auth import require_internal_signature
from app.infra.database import Base, create_sessionmaker
from app.infra.http_client import BoundedHTTPClient
from app.infra.snapshot_cache import SnapshotCache
from app.main import app
from app.providers.stations import StationCatalogCache


def _unexpected_request(request: httpx.Request) -> httpx.Response:
    raise AssertionError(f"unexpected outbound HTTP call: {request.url}")


@pytest.fixture
async def db_state() -> AsyncIterator[AppState]:
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield AppState(
        http_client=BoundedHTTPClient(
            transport=httpx.MockTransport(_unexpected_request), max_retries=0
        ),
        coops_tide_cache=StationCatalogCache(),
        coops_watertemp_cache=StationCatalogCache(),
        ndbc_cache=StationCatalogCache(),
        forecast_cache=SnapshotCache(),
        db_sessionmaker=create_sessionmaker(engine),
    )
    await engine.dispose()


@pytest.fixture
def client(db_state: AppState) -> Iterator[TestClient]:
    app.dependency_overrides[get_app_state] = lambda: db_state
    app.dependency_overrides[require_internal_signature] = lambda: "user-1"
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.pop(get_app_state, None)
        app.dependency_overrides.pop(require_internal_signature, None)


def test_list_starts_empty(client: TestClient) -> None:
    resp = client.get("/v1/me/locations")
    assert resp.status_code == 200
    assert resp.json() == []


def test_save_a_curated_location(client: TestClient) -> None:
    resp = client.post(
        "/v1/me/locations", json={"location_id": "wrightsville-beach-nc"}
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["location_id"] == "wrightsville-beach-nc"
    assert body["name"] == "Wrightsville Beach"
    assert body["state"] == "NC"
    assert isinstance(body["id"], int)


def test_saved_location_appears_in_list(client: TestClient) -> None:
    client.post("/v1/me/locations", json={"location_id": "wrightsville-beach-nc"})
    resp = client.get("/v1/me/locations")
    assert resp.status_code == 200
    ids = [loc["location_id"] for loc in resp.json()]
    assert ids == ["wrightsville-beach-nc"]


def test_list_is_ordered_by_save_time(client: TestClient) -> None:
    client.post("/v1/me/locations", json={"location_id": "cocoa-beach-fl"})
    client.post("/v1/me/locations", json={"location_id": "wrightsville-beach-nc"})
    resp = client.get("/v1/me/locations")
    ids = [loc["location_id"] for loc in resp.json()]
    assert ids == ["cocoa-beach-fl", "wrightsville-beach-nc"]


def test_saving_the_same_location_twice_is_409(client: TestClient) -> None:
    first = client.post(
        "/v1/me/locations", json={"location_id": "wrightsville-beach-nc"}
    )
    assert first.status_code == 201
    second = client.post(
        "/v1/me/locations", json={"location_id": "wrightsville-beach-nc"}
    )
    assert second.status_code == 409
    # The failed duplicate attempt didn't leave a partial/extra row.
    assert len(client.get("/v1/me/locations").json()) == 1


def test_saving_an_unknown_location_is_404(client: TestClient) -> None:
    resp = client.post("/v1/me/locations", json={"location_id": "not-a-real-place"})
    assert resp.status_code == 404
    assert client.get("/v1/me/locations").json() == []


def test_delete_removes_it(client: TestClient) -> None:
    saved = client.post(
        "/v1/me/locations", json={"location_id": "wrightsville-beach-nc"}
    ).json()
    resp = client.delete(f"/v1/me/locations/{saved['id']}")
    assert resp.status_code == 204
    assert client.get("/v1/me/locations").json() == []


def test_delete_unknown_id_is_404(client: TestClient) -> None:
    resp = client.delete("/v1/me/locations/999999")
    assert resp.status_code == 404


def test_users_cannot_see_or_delete_each_others_saves(db_state: AppState) -> None:
    app.dependency_overrides[get_app_state] = lambda: db_state
    try:
        app.dependency_overrides[require_internal_signature] = lambda: "user-a"
        client_a = TestClient(app)
        saved = client_a.post(
            "/v1/me/locations", json={"location_id": "wrightsville-beach-nc"}
        ).json()

        app.dependency_overrides[require_internal_signature] = lambda: "user-b"
        client_b = TestClient(app)
        assert client_b.get("/v1/me/locations").json() == []
        assert client_b.delete(f"/v1/me/locations/{saved['id']}").status_code == 404

        # user-a's save survived user-b's failed delete attempt.
        app.dependency_overrides[require_internal_signature] = lambda: "user-a"
        assert len(client_a.get("/v1/me/locations").json()) == 1
    finally:
        app.dependency_overrides.pop(get_app_state, None)
        app.dependency_overrides.pop(require_internal_signature, None)


def test_list_without_a_session_is_401(db_state: AppState) -> None:
    app.dependency_overrides[get_app_state] = lambda: db_state
    app.dependency_overrides[require_internal_signature] = lambda: None
    try:
        resp = TestClient(app).get("/v1/me/locations")
        assert resp.status_code == 401
    finally:
        app.dependency_overrides.pop(get_app_state, None)
        app.dependency_overrides.pop(require_internal_signature, None)


def test_save_without_a_session_is_401(db_state: AppState) -> None:
    app.dependency_overrides[get_app_state] = lambda: db_state
    app.dependency_overrides[require_internal_signature] = lambda: None
    try:
        resp = TestClient(app).post(
            "/v1/me/locations", json={"location_id": "wrightsville-beach-nc"}
        )
        assert resp.status_code == 401
    finally:
        app.dependency_overrides.pop(get_app_state, None)
        app.dependency_overrides.pop(require_internal_signature, None)


def test_delete_without_a_session_is_401(db_state: AppState) -> None:
    app.dependency_overrides[get_app_state] = lambda: db_state
    app.dependency_overrides[require_internal_signature] = lambda: None
    try:
        resp = TestClient(app).delete("/v1/me/locations/1")
        assert resp.status_code == 401
    finally:
        app.dependency_overrides.pop(get_app_state, None)
        app.dependency_overrides.pop(require_internal_signature, None)
