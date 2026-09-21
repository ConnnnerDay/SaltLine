"""Tests for app.infra.request_logging.log_requests, the sprint-41
structured per-request trace middleware wired onto app.main.app.

Uses the real app via TestClient (not a bare ASGI app built just for
this test) since the point is proving the middleware is actually wired
onto every request the real app serves, including ones that never reach
a route handler (an unauthenticated /v1 request, which
require_internal_signature rejects before any route body runs) --
exactly the case the middleware exists to still produce a trace line
for.
"""

from __future__ import annotations

import json
import logging
from collections.abc import AsyncIterator

import httpx
import pytest
from fastapi.testclient import TestClient

from app.api.deps import AppState, get_app_state, get_db_session
from app.api.internal_auth import require_internal_signature
from app.infra.http_client import BoundedHTTPClient
from app.infra.snapshot_cache import SnapshotCache
from app.main import app
from app.providers.stations import StationCatalogCache

client = TestClient(app)


def _unexpected_request(request: httpx.Request) -> httpx.Response:
    raise AssertionError(f"unexpected outbound HTTP call: {request.url}")


async def _broken_db_session() -> AsyncIterator[None]:
    raise RuntimeError("simulated database outage")
    yield  # pragma: no cover -- makes this a real async generator


def test_echoes_caller_supplied_request_id(caplog: pytest.LogCaptureFixture) -> None:
    with caplog.at_level(logging.INFO, logger="app.request"):
        response = client.get(
            "/health/live", headers={"X-Internal-Request-Id": "abc-123"}
        )

    assert response.status_code == 200
    assert response.headers["X-Internal-Request-Id"] == "abc-123"

    record = json.loads(caplog.records[-1].message)
    assert record["request_id"] == "abc-123"
    assert record["method"] == "GET"
    assert record["path"] == "/health/live"
    assert record["status_code"] == 200
    assert isinstance(record["duration_ms"], (int, float))
    assert record["duration_ms"] >= 0


def test_generates_a_request_id_when_caller_omits_one(
    caplog: pytest.LogCaptureFixture,
) -> None:
    with caplog.at_level(logging.INFO, logger="app.request"):
        response = client.get("/health/live")

    generated_id = response.headers["X-Internal-Request-Id"]
    assert generated_id

    record = json.loads(caplog.records[-1].message)
    assert record["request_id"] == generated_id


def test_traces_a_request_that_never_reaches_a_route_handler(
    caplog: pytest.LogCaptureFixture,
) -> None:
    """An unsigned /v1 request is rejected by `require_internal_signature`
    before any route body runs -- the middleware still produces a trace
    line for it, at whatever status code the rejection used, since it
    wraps the whole ASGI call rather than sitting behind that dependency.
    """
    with caplog.at_level(logging.INFO, logger="app.request"):
        response = client.get(
            "/v1/locations/search",
            params={"q": "wrightsville"},
            headers={"X-Internal-Request-Id": "unsigned-request"},
        )

    assert response.status_code >= 400
    record = json.loads(caplog.records[-1].message)
    assert record["request_id"] == "unsigned-request"
    assert record["path"] == "/v1/locations/search"
    assert record["status_code"] == response.status_code


def test_traces_a_request_that_raises_unhandled(
    caplog: pytest.LogCaptureFixture,
) -> None:
    """Sprint 47 ("Degraded-mode UX"): an unhandled exception propagates
    *up through* this middleware's own `call_next` rather than
    returning a Response (app.main's `handle_unexpected_error` is
    installed as `ServerErrorMiddleware`'s handler, which wraps this
    middleware from the outside -- see that module's own comment) --
    without the `try`/`except` this module now has, this is exactly the
    request that would get no trace line at all.
    """
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
        with caplog.at_level(logging.INFO, logger="app.request"):
            # raise_server_exceptions=False: TestClient's default re-raises
            # any exception that propagated through the ASGI call in the
            # *test* itself, regardless of whether a registered handler
            # (handle_unexpected_error) already turned it into a real
            # response -- exactly what this test needs to inspect.
            response = TestClient(app, raise_server_exceptions=False).get(
                "/v1/me/preferences", headers={"X-Internal-Request-Id": "chaos-request"}
            )
    finally:
        app.dependency_overrides.pop(get_app_state, None)
        app.dependency_overrides.pop(require_internal_signature, None)
        app.dependency_overrides.pop(get_db_session, None)

    assert response.status_code == 500
    # Filtered by logger name, not just caplog.records[-1]: this request
    # also logs through app.main's own "app.errors" logger (the real
    # traceback, never asserted on here), which -- like this module's
    # own logger -- propagates to root and so also lands in caplog.
    app_request_records = [r for r in caplog.records if r.name == "app.request"]
    record = json.loads(app_request_records[-1].message)
    assert record["request_id"] == "chaos-request"
    assert record["path"] == "/v1/me/preferences"
    assert record["status_code"] == 500


def test_log_line_never_carries_query_string_or_headers(
    caplog: pytest.LogCaptureFixture,
) -> None:
    """ "Safe context" (sprint 41's own wording): the trace line is
    exactly request_id/method/path/status_code/duration_ms -- no query
    string, no header values, no body.
    """
    with caplog.at_level(logging.INFO, logger="app.request"):
        client.get("/v1/locations/search", params={"q": "secret-ish-query"})

    record = json.loads(caplog.records[-1].message)
    assert set(record.keys()) == {
        "request_id",
        "method",
        "path",
        "status_code",
        "duration_ms",
    }
    assert "secret-ish-query" not in json.dumps(record)
