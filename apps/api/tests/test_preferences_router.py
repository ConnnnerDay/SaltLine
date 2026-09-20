"""Tests for the /v1/me/preferences router (sprint 36).

An ephemeral SQLite in-memory database stands in for Postgres here --
`app.infra.database.Base`'s models don't declare a `schema=` on any
column/table (the real `forecast` schema qualification is a connection-
level `search_path`, per that module's docstring), so the same ORM code
runs against either dialect. This keeps the suite free of a live
database dependency, the same posture docs/R2_CI_BASELINE.md already
holds for live upstream providers. Real Postgres/schema/role wiring is
exercised manually against a real local database -- see
apps/api/README.md's "Local dev" section -- not asserted here.

`require_internal_signature` is overridden the same way
test_locations_router.py does it (signature verification has its own
dedicated tests) -- but return value matters here, unlike there: it's
this router's own source of `user_id`, so each test overrides it to
return either a real id or `None` to exercise both the authenticated and
401 paths.
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


def test_get_with_no_row_returns_defaults(client: TestClient) -> None:
    resp = client.get("/v1/me/preferences")
    assert resp.status_code == 200
    assert resp.json() == {
        "units": "imperial",
        "fishing_style": None,
        "wind_threshold_kt": None,
        "surf_threshold_ft": None,
        "default_location_id": None,
    }


def test_patch_creates_a_row_then_get_returns_it(client: TestClient) -> None:
    resp = client.patch(
        "/v1/me/preferences",
        json={"units": "metric", "fishing_style": "surf", "wind_threshold_kt": 15},
    )
    assert resp.status_code == 200
    assert resp.json()["units"] == "metric"
    assert resp.json()["fishing_style"] == "surf"
    assert resp.json()["wind_threshold_kt"] == 15

    resp = client.get("/v1/me/preferences")
    assert resp.status_code == 200
    assert resp.json()["units"] == "metric"
    assert resp.json()["fishing_style"] == "surf"


def test_patch_is_a_true_partial_update(client: TestClient) -> None:
    client.patch(
        "/v1/me/preferences", json={"units": "metric", "fishing_style": "pier"}
    )
    resp = client.patch("/v1/me/preferences", json={"wind_threshold_kt": 12})
    assert resp.status_code == 200
    body = resp.json()
    # Fields omitted from the second PATCH stay as the first PATCH left
    # them -- this is the whole point of exclude_unset, not a PUT.
    assert body["units"] == "metric"
    assert body["fishing_style"] == "pier"
    assert body["wind_threshold_kt"] == 12


def test_patch_can_explicitly_clear_a_field(client: TestClient) -> None:
    client.patch("/v1/me/preferences", json={"fishing_style": "kayak"})
    resp = client.patch("/v1/me/preferences", json={"fishing_style": None})
    assert resp.status_code == 200
    assert resp.json()["fishing_style"] is None


def test_patch_rejects_unresolvable_default_location(client: TestClient) -> None:
    resp = client.patch(
        "/v1/me/preferences", json={"default_location_id": "not-a-real-place"}
    )
    assert resp.status_code == 404


def test_patch_accepts_a_real_curated_default_location(client: TestClient) -> None:
    resp = client.patch(
        "/v1/me/preferences", json={"default_location_id": "wrightsville-beach-nc"}
    )
    assert resp.status_code == 200
    assert resp.json()["default_location_id"] == "wrightsville-beach-nc"


def test_patch_rejects_out_of_range_thresholds(client: TestClient) -> None:
    resp = client.patch("/v1/me/preferences", json={"wind_threshold_kt": -5})
    assert resp.status_code == 422


def test_two_users_have_independent_preferences(
    db_state: AppState,
) -> None:
    app.dependency_overrides[get_app_state] = lambda: db_state
    try:
        app.dependency_overrides[require_internal_signature] = lambda: "user-a"
        client_a = TestClient(app)
        client_a.patch("/v1/me/preferences", json={"fishing_style": "surf"})

        app.dependency_overrides[require_internal_signature] = lambda: "user-b"
        client_b = TestClient(app)
        resp_b = client_b.get("/v1/me/preferences")
        assert resp_b.json()["fishing_style"] is None

        app.dependency_overrides[require_internal_signature] = lambda: "user-a"
        resp_a = client_a.get("/v1/me/preferences")
        assert resp_a.json()["fishing_style"] == "surf"
    finally:
        app.dependency_overrides.pop(get_app_state, None)
        app.dependency_overrides.pop(require_internal_signature, None)


def test_get_without_a_session_is_401(db_state: AppState) -> None:
    app.dependency_overrides[get_app_state] = lambda: db_state
    app.dependency_overrides[require_internal_signature] = lambda: None
    try:
        resp = TestClient(app).get("/v1/me/preferences")
        assert resp.status_code == 401
    finally:
        app.dependency_overrides.pop(get_app_state, None)
        app.dependency_overrides.pop(require_internal_signature, None)


def test_patch_without_a_session_is_401(db_state: AppState) -> None:
    app.dependency_overrides[get_app_state] = lambda: db_state
    app.dependency_overrides[require_internal_signature] = lambda: None
    try:
        resp = TestClient(app).patch("/v1/me/preferences", json={"units": "metric"})
        assert resp.status_code == 401
    finally:
        app.dependency_overrides.pop(get_app_state, None)
        app.dependency_overrides.pop(require_internal_signature, None)


def test_missing_database_is_500_not_a_crash() -> None:
    state_without_db = AppState(
        http_client=BoundedHTTPClient(
            transport=httpx.MockTransport(_unexpected_request), max_retries=0
        ),
        coops_tide_cache=StationCatalogCache(),
        coops_watertemp_cache=StationCatalogCache(),
        ndbc_cache=StationCatalogCache(),
        forecast_cache=SnapshotCache(),
        db_sessionmaker=None,
    )
    app.dependency_overrides[get_app_state] = lambda: state_without_db
    app.dependency_overrides[require_internal_signature] = lambda: "user-1"
    try:
        resp = TestClient(app).get("/v1/me/preferences")
        assert resp.status_code == 500
    finally:
        app.dependency_overrides.pop(get_app_state, None)
        app.dependency_overrides.pop(require_internal_signature, None)
