"""Tests for the /v1/me account router (sprint 45) -- self-service
export and deletion. Same ephemeral-SQLite posture as
test_preferences_router.py/test_saved_locations_router.py.
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


def test_export_with_nothing_stored(client: TestClient) -> None:
    resp = client.get("/v1/me/export")
    assert resp.status_code == 200
    body = resp.json()
    assert body["preferences"] is None
    assert body["saved_locations"] == []


def test_export_includes_preferences_and_saved_locations(client: TestClient) -> None:
    client.patch(
        "/v1/me/preferences", json={"units": "metric", "fishing_style": "surf"}
    )
    client.post("/v1/me/locations", json={"location_id": "wrightsville-beach-nc"})

    resp = client.get("/v1/me/export")
    assert resp.status_code == 200
    body = resp.json()
    assert body["preferences"]["units"] == "metric"
    assert body["preferences"]["fishing_style"] == "surf"
    assert [loc["location_id"] for loc in body["saved_locations"]] == [
        "wrightsville-beach-nc"
    ]


def test_delete_clears_preferences_and_saved_locations(client: TestClient) -> None:
    client.patch("/v1/me/preferences", json={"units": "metric"})
    client.post("/v1/me/locations", json={"location_id": "wrightsville-beach-nc"})

    resp = client.delete("/v1/me")
    assert resp.status_code == 204

    export = client.get("/v1/me/export").json()
    assert export["preferences"] is None
    assert export["saved_locations"] == []

    # Preferences' own GET creates a fresh default row on first read
    # regardless -- confirms the delete really removed the old row
    # rather than merely appearing empty from a stale cache.
    prefs = client.get("/v1/me/preferences").json()
    assert prefs["units"] == "imperial"


def test_delete_with_nothing_stored_still_succeeds(client: TestClient) -> None:
    resp = client.delete("/v1/me")
    assert resp.status_code == 204


def test_export_and_delete_are_isolated_per_user(db_state: AppState) -> None:
    app.dependency_overrides[get_app_state] = lambda: db_state
    try:
        app.dependency_overrides[require_internal_signature] = lambda: "user-a"
        client_a = TestClient(app)
        client_a.patch("/v1/me/preferences", json={"units": "metric"})
        client_a.post("/v1/me/locations", json={"location_id": "wrightsville-beach-nc"})

        app.dependency_overrides[require_internal_signature] = lambda: "user-b"
        client_b = TestClient(app)
        client_b.delete("/v1/me")

        app.dependency_overrides[require_internal_signature] = lambda: "user-a"
        export_a = client_a.get("/v1/me/export").json()
        assert export_a["preferences"]["units"] == "metric"
        assert len(export_a["saved_locations"]) == 1
    finally:
        app.dependency_overrides.pop(get_app_state, None)
        app.dependency_overrides.pop(require_internal_signature, None)


def test_export_without_a_session_is_401(db_state: AppState) -> None:
    app.dependency_overrides[get_app_state] = lambda: db_state
    app.dependency_overrides[require_internal_signature] = lambda: None
    try:
        resp = TestClient(app).get("/v1/me/export")
        assert resp.status_code == 401
    finally:
        app.dependency_overrides.pop(get_app_state, None)
        app.dependency_overrides.pop(require_internal_signature, None)


def test_delete_without_a_session_is_401(db_state: AppState) -> None:
    app.dependency_overrides[get_app_state] = lambda: db_state
    app.dependency_overrides[require_internal_signature] = lambda: None
    try:
        resp = TestClient(app).delete("/v1/me")
        assert resp.status_code == 401
    finally:
        app.dependency_overrides.pop(get_app_state, None)
        app.dependency_overrides.pop(require_internal_signature, None)
