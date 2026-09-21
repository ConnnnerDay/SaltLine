"""Tests for the sprint-47 ("Degraded-mode UX") global exception
handler (app/main.py's `handle_unexpected_error`).

A genuinely unexpected exception -- a database connection failure is
the concrete motivating case, but this covers any bug that isn't a
deliberate `HTTPException` -- must never reach the caller as a raw
traceback or an unstructured plain-text body. `get_db_session` is
overridden to raise a plain `RuntimeError`, standing in for exactly
that kind of failure (a real Postgres outage raises its own driver
exception at the same point, well past this dependency's own
`db_sessionmaker is None` check), against a real route that depends on
it.
"""

from __future__ import annotations

from collections.abc import AsyncIterator, Iterator

import httpx
import pytest
from fastapi.testclient import TestClient

from app.api.deps import AppState, get_app_state, get_db_session
from app.api.internal_auth import require_internal_signature
from app.infra.http_client import BoundedHTTPClient
from app.infra.snapshot_cache import SnapshotCache
from app.main import app
from app.providers.stations import StationCatalogCache


def _unexpected_request(request: httpx.Request) -> httpx.Response:
    raise AssertionError(f"unexpected outbound HTTP call: {request.url}")


async def _broken_db_session() -> AsyncIterator[None]:
    raise RuntimeError("connection to server at ... failed: Connection refused")
    yield  # pragma: no cover -- makes this a real async generator


@pytest.fixture
def client() -> Iterator[TestClient]:
    state = AppState(
        http_client=BoundedHTTPClient(
            transport=httpx.MockTransport(_unexpected_request), max_retries=0
        ),
        coops_tide_cache=StationCatalogCache(),
        coops_watertemp_cache=StationCatalogCache(),
        ndbc_cache=StationCatalogCache(),
        forecast_cache=SnapshotCache(),
        db_sessionmaker=None,
    )
    app.dependency_overrides[get_app_state] = lambda: state
    app.dependency_overrides[require_internal_signature] = lambda: "user-1"
    app.dependency_overrides[get_db_session] = _broken_db_session
    try:
        yield TestClient(app, raise_server_exceptions=False)
    finally:
        app.dependency_overrides.pop(get_app_state, None)
        app.dependency_overrides.pop(require_internal_signature, None)
        app.dependency_overrides.pop(get_db_session, None)


def test_unhandled_exception_returns_a_safe_generic_500(client: TestClient) -> None:
    resp = client.get("/v1/me/preferences")
    assert resp.status_code == 500
    assert resp.json() == {"detail": "internal server error"}


def test_unhandled_exception_body_never_leaks_the_real_error(
    client: TestClient,
) -> None:
    resp = client.get("/v1/me/preferences")
    body = resp.text
    assert "RuntimeError" not in body
    assert "Connection refused" not in body
    assert "Traceback" not in body
