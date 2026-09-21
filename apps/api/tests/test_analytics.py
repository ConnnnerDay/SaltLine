"""Tests for app.domain.analytics and the three places this sprint
(43, "Privacy-safe analytics") wires it: `POST /v1/analytics/events`
directly, and in-process from `POST /v1/locations/resolve` and
`GET /v1/forecasts/{location_id}`.

Same ephemeral-SQLite posture as test_preferences_router.py -- see that
file's module docstring for why. Network access for the forecasts-router
cases reuses test_forecasts_router.py's mock transport pattern.
"""

from __future__ import annotations

import asyncio
from collections.abc import Iterator
from datetime import UTC, datetime

import httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import create_async_engine

from app.api.deps import AppState, get_app_state
from app.api.internal_auth import require_internal_signature
from app.domain.analytics import (
    AnalyticsEvent,
    AnalyticsEventIn,
    AnalyticsEventType,
    try_record_event,
)
from app.infra.database import Base, create_sessionmaker
from app.infra.http_client import BoundedHTTPClient
from app.infra.snapshot_cache import SnapshotCache
from app.main import app
from app.providers.stations import StationCatalogCache


def _unexpected_request(request: httpx.Request) -> httpx.Response:
    raise AssertionError(f"unexpected outbound HTTP call: {request.url}")


@pytest.fixture
async def sqlite_sessionmaker():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield create_sessionmaker(engine)
    await engine.dispose()


async def test_try_record_event_noops_with_no_database_configured() -> None:
    # Must not raise -- this service boots and serves locations/forecasts
    # with no Postgres available at all (app.main's own docstring).
    await try_record_event(
        None,
        AnalyticsEventIn(event_type=AnalyticsEventType.REGISTRATION, user_id="user-1"),
        now=datetime.now(UTC),
    )


async def test_try_record_event_writes_a_real_row(sqlite_sessionmaker) -> None:
    now = datetime.now(UTC)
    await try_record_event(
        sqlite_sessionmaker,
        AnalyticsEventIn(
            event_type=AnalyticsEventType.FORECAST_GENERATED,
            location_id="wrightsville-beach-nc",
            state="fresh",
            latency_ms=42.5,
        ),
        now=now,
    )
    async with sqlite_sessionmaker() as session:
        rows = (await session.execute(select(AnalyticsEvent))).scalars().all()
    assert len(rows) == 1
    assert rows[0].event_type == "forecast_generated"
    assert rows[0].location_id == "wrightsville-beach-nc"
    assert rows[0].state == "fresh"
    assert rows[0].latency_ms == 42.5
    # Never an email, a name, an IP, or a user agent -- see the module's
    # own docstring on why the column set stops here.
    assert set(AnalyticsEvent.__table__.columns.keys()) == {
        "id",
        "event_type",
        "user_id",
        "location_id",
        "state",
        "latency_ms",
        "occurred_at",
    }


async def test_try_record_event_swallows_a_write_failure() -> None:
    class _BrokenSessionmaker:
        def __call__(self):
            raise RuntimeError("simulated database outage")

    # Must not raise -- a failed analytics write is exactly the kind of
    # dependency failure sprint 47 ("Degraded-mode UX") says must never
    # break the real request it's attached to.
    await try_record_event(
        _BrokenSessionmaker(),  # type: ignore[arg-type]
        AnalyticsEventIn(event_type=AnalyticsEventType.REGISTRATION, user_id="user-1"),
        now=datetime.now(UTC),
    )


@pytest.fixture
async def db_state(sqlite_sessionmaker) -> AppState:
    return AppState(
        http_client=BoundedHTTPClient(
            transport=httpx.MockTransport(_unexpected_request), max_retries=0
        ),
        coops_tide_cache=StationCatalogCache(),
        coops_watertemp_cache=StationCatalogCache(),
        ndbc_cache=StationCatalogCache(),
        forecast_cache=SnapshotCache(),
        db_sessionmaker=sqlite_sessionmaker,
    )


@pytest.fixture
def client(db_state: AppState) -> Iterator[TestClient]:
    app.dependency_overrides[get_app_state] = lambda: db_state
    app.dependency_overrides[require_internal_signature] = lambda: None
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.pop(get_app_state, None)
        app.dependency_overrides.pop(require_internal_signature, None)


async def _rows(db_state: AppState) -> list[AnalyticsEvent]:
    assert db_state.db_sessionmaker is not None
    async with db_state.db_sessionmaker() as session:
        return list((await session.execute(select(AnalyticsEvent))).scalars().all())


def test_post_events_returns_204_and_records_a_row(
    client: TestClient, db_state: AppState
) -> None:
    resp = client.post(
        "/v1/analytics/events",
        json={"event_type": "registration", "user_id": "user-1"},
    )
    assert resp.status_code == 204
    assert resp.content == b""

    rows = asyncio.run(_rows(db_state))
    assert len(rows) == 1
    assert rows[0].event_type == "registration"
    assert rows[0].user_id == "user-1"


def test_resolve_location_records_a_location_resolved_event(
    client: TestClient, db_state: AppState
) -> None:
    resp = client.post(
        "/v1/locations/resolve", json={"location_id": "wrightsville-beach-nc"}
    )
    assert resp.status_code == 200

    rows = asyncio.run(_rows(db_state))
    assert len(rows) == 1
    assert rows[0].event_type == "location_resolved"
    assert rows[0].location_id == "wrightsville-beach-nc"


def test_resolve_failure_records_no_event(
    client: TestClient, db_state: AppState
) -> None:
    resp = client.post("/v1/locations/resolve", json={"location_id": "not-a-real-id"})
    assert resp.status_code == 404

    assert asyncio.run(_rows(db_state)) == []


_MARINE_ZONE_FORECAST = {
    "properties": {
        "periods": [{"detailedForecast": "SW wind 10 to 15 kt. Seas 2 to 3 ft."}]
    }
}
_WATER_TEMP_RESPONSE = {"data": [{"t": "2024-07-15 12:00", "v": "78.4"}]}
_TIDE_PREDICTIONS_RESPONSE: dict[str, list[dict[str, str]]] = {"predictions": []}
_NDBC_FEED = (
    "#YY  MM DD hh mm WDIR WSPD GST   WVHT   PRES\n"
    "#yr  mo dy hr mn degT m/s  m/s     m    hPa\n"
    "2024 07 15 12 00 230 8.2  10.1  1.3   1015.2\n"
)


def _forecast_handler(request: httpx.Request) -> httpx.Response:
    url = str(request.url)
    if "zones/forecast" in url:
        return httpx.Response(200, json=_MARINE_ZONE_FORECAST)
    if "alerts/active" in url:
        return httpx.Response(200, json={"features": []})
    if "product=predictions" in url:
        return httpx.Response(200, json=_TIDE_PREDICTIONS_RESPONSE)
    if "datagetter" in url:
        return httpx.Response(200, json=_WATER_TEMP_RESPONSE)
    if "ndbc.noaa.gov" in url:
        return httpx.Response(200, text=_NDBC_FEED)
    raise AssertionError(f"unexpected URL: {url}")


def test_get_forecast_records_a_forecast_generated_event(
    db_state: AppState,
) -> None:
    db_state.http_client = BoundedHTTPClient(
        transport=httpx.MockTransport(_forecast_handler), max_retries=0
    )
    app.dependency_overrides[get_app_state] = lambda: db_state
    app.dependency_overrides[require_internal_signature] = lambda: None
    try:
        resp = TestClient(app).get("/v1/forecasts/wrightsville-beach-nc")
    finally:
        app.dependency_overrides.pop(get_app_state, None)
        app.dependency_overrides.pop(require_internal_signature, None)

    assert resp.status_code == 200
    envelope_state = resp.json()["state"]

    rows = asyncio.run(_rows(db_state))
    assert len(rows) == 1
    assert rows[0].event_type == "forecast_generated"
    assert rows[0].location_id == "wrightsville-beach-nc"
    assert rows[0].state == envelope_state
    assert rows[0].latency_ms is not None
    assert rows[0].latency_ms >= 0
