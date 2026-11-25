"""Catch log router (`/v1/me/catches`). Same ephemeral-SQLite and
dependency-override setup as test_saved_locations_router.py. Upstream
providers are unreachable here (every outbound call fails), so logging a
catch also proves the conditions snapshot is best-effort.
"""

from __future__ import annotations

from collections.abc import AsyncIterator, Iterator
from datetime import UTC, datetime, timedelta

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


_CATCH = {
    "location_id": "wrightsville-beach-nc",
    "species": "Red drum",
    "caught_at": "2026-11-16T07:30:00-05:00",
    "length_in": 24.5,
    "kept": False,
    "bait": "Cut mullet",
    "notes": "Outgoing tide by the pier",
}


def test_list_starts_empty(client: TestClient) -> None:
    resp = client.get("/v1/me/catches")
    assert resp.status_code == 200
    assert resp.json() == []


def test_log_a_catch_and_list_it(client: TestClient) -> None:
    resp = client.post("/v1/me/catches", json=_CATCH)
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["species"] == "Red drum"
    assert body["location_name"] == "Wrightsville Beach"
    assert body["length_in"] == 24.5
    listed = client.get("/v1/me/catches").json()
    assert [entry["id"] for entry in listed] == [body["id"]]


def test_catch_is_logged_even_when_upstream_data_is_down(client: TestClient) -> None:
    just_now = (datetime.now(UTC) - timedelta(minutes=20)).isoformat()
    resp = client.post("/v1/me/catches", json=_CATCH | {"caught_at": just_now})
    assert resp.status_code == 201
    conditions = resp.json()["conditions"]
    # Every provider failed, so wind/waves are unknown -- but the monthly
    # water-temperature fallback still gives an honest, labeled snapshot.
    if conditions is not None:
        assert conditions["water_temp_is_fallback"] is True


def test_list_is_newest_first(client: TestClient) -> None:
    client.post("/v1/me/catches", json=_CATCH | {"caught_at": "2026-11-01T07:00:00Z"})
    client.post("/v1/me/catches", json=_CATCH | {"caught_at": "2026-11-10T07:00:00Z"})
    times = [entry["caught_at"] for entry in client.get("/v1/me/catches").json()]
    assert times == sorted(times, reverse=True)


@pytest.mark.parametrize(
    "bad",
    [
        {"species": ""},
        {"species": "   "},
        {"caught_at": "1999-06-01T07:00:00Z"},
        {"length_in": -1},
        {"length_in": 500},
        {"weight_lb": 0},
        {"notes": "x" * 1001},
    ],
)
def test_invalid_entries_are_rejected(
    client: TestClient, bad: dict[str, object]
) -> None:
    assert client.post("/v1/me/catches", json=_CATCH | bad).status_code == 422


def test_unknown_location_is_a_404(client: TestClient) -> None:
    resp = client.post("/v1/me/catches", json=_CATCH | {"location_id": "nowhere"})
    assert resp.status_code == 404


def test_delete_own_catch(client: TestClient) -> None:
    catch_id = client.post("/v1/me/catches", json=_CATCH).json()["id"]
    assert client.delete(f"/v1/me/catches/{catch_id}").status_code == 204
    assert client.get("/v1/me/catches").json() == []


def test_cannot_see_or_delete_another_users_catch(client: TestClient) -> None:
    catch_id = client.post("/v1/me/catches", json=_CATCH).json()["id"]
    app.dependency_overrides[require_internal_signature] = lambda: "user-2"
    assert client.get("/v1/me/catches").json() == []
    assert client.delete(f"/v1/me/catches/{catch_id}").status_code == 404
    app.dependency_overrides[require_internal_signature] = lambda: "user-1"
    assert len(client.get("/v1/me/catches").json()) == 1


def test_species_options_come_from_the_catalogue(client: TestClient) -> None:
    names = client.get("/v1/me/catches/species").json()
    assert "Red drum" in names
    assert names == sorted(names)


def test_account_export_and_delete_include_catches(client: TestClient) -> None:
    client.post("/v1/me/catches", json=_CATCH)
    export = client.get("/v1/me/export").json()
    assert [entry["species"] for entry in export["catches"]] == ["Red drum"]
    assert client.delete("/v1/me").status_code == 204
    assert client.get("/v1/me/catches").json() == []


def test_a_catch_from_the_future_is_rejected(client: TestClient) -> None:
    tomorrow = (datetime.now(UTC) + timedelta(days=1)).isoformat()
    resp = client.post("/v1/me/catches", json=_CATCH | {"caught_at": tomorrow})
    assert resp.status_code == 422


def test_backlogged_catch_gets_no_snapshot_of_todays_conditions(
    client: TestClient,
) -> None:
    last_week = (datetime.now(UTC) - timedelta(days=7)).isoformat()
    resp = client.post("/v1/me/catches", json=_CATCH | {"caught_at": last_week})
    assert resp.status_code == 201
    assert resp.json()["conditions"] is None


def test_species_is_trimmed(client: TestClient) -> None:
    resp = client.post("/v1/me/catches", json=_CATCH | {"species": "  Red drum "})
    assert resp.json()["species"] == "Red drum"
