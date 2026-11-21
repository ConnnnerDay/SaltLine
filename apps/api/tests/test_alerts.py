"""Email alerts (`app.domain.alerts`, `/v1/me/alerts`): the pure decision,
the email text, the background check (dedupe, failures) and the router.
Same ephemeral-SQLite fixtures as test_saved_locations_router.py.
"""

from __future__ import annotations

from collections.abc import AsyncIterator, Iterator
from typing import Any

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


from datetime import UTC, date, datetime

from app.domain.alerts import (
    AlertRule,
    compose_alert,
    run_alert_check,
    should_alert,
)

# --- should_alert ------------------------------------------------------------


@pytest.mark.parametrize(
    ("verdict", "minimum", "last", "hour", "expected"),
    [
        ("Good", "Good", None, 7, True),
        ("Excellent", "Good", None, 7, True),
        ("Fair", "Good", None, 7, False),
        ("Good", "Excellent", None, 7, False),
        ("Good", "Good", "2026-11-16", 7, False),  # already sent today
        ("Good", "Good", "2026-11-15", 7, True),  # sent yesterday
        ("Good", "Good", None, 3, False),  # middle of the night
        ("Good", "Good", None, 21, False),
        (None, "Good", None, 7, False),  # no verdict (data down)
        ("Unknown", "Good", None, 7, False),
    ],
)
def test_should_alert(
    verdict: str | None, minimum: str, last: str | None, hour: int, expected: bool
) -> None:
    assert (
        should_alert(
            verdict,
            minimum,
            last_sent_on=last,
            local_date=date(2026, 11, 16),
            local_hour=hour,
        )
        is expected
    )


_ENVELOPE = {
    "conditions": {
        "score": {"verdict": "Good", "score": 72, "summary": "Clean offshore wind."},
        "water_temperature": {"value": 64.8},
        "wind_range_kt": [10.0, 15.0],
        "wind_direction": "N",
        "wave_range_ft": [2.0, 3.0],
    },
    "recommendations": {"species": [{"name": "Red drum"}, {"name": "Bluefish"}]},
}


def test_compose_alert() -> None:
    subject, body = compose_alert(
        location_name="Wrightsville Beach",
        location_id="wrightsville-beach-nc",
        envelope=_ENVELOPE,
        site_url="http://192.168.1.100:5757/",
    )
    assert subject == "Saltline: Wrightsville Beach is Good (72/100) today"
    assert "Water 65°F · Wind N 10-15 kt · Waves 2-3 ft" in body
    assert "What's biting: Red drum, Bluefish" in body
    assert "http://192.168.1.100:5757/forecast/wrightsville-beach-nc" in body


def test_compose_alert_names_the_style() -> None:
    import copy

    envelope: dict[str, Any] = copy.deepcopy(_ENVELOPE)
    envelope["conditions"]["score"]["style"] = "pier"
    subject, body = compose_alert(
        location_name="Wrightsville Beach",
        location_id="wrightsville-beach-nc",
        envelope=envelope,
        site_url="http://example.test/",
    )
    assert (
        subject
        == "Saltline: Wrightsville Beach is Good for pier fishing (72/100) today"
    )
    assert "looks good for pier fishing today" in body


# --- run_alert_check ----------------------------------------------------------

# 2026-11-16 12:00 UTC is 7 AM in New York.
_NOW = datetime(2026, 11, 16, 12, 0, tzinfo=UTC)


async def _lookup(location_id: str) -> tuple[str, str, dict[str, object]]:
    return "Wrightsville Beach", "America/New_York", _ENVELOPE


async def _add_rule(state: AppState, **overrides: object) -> None:
    assert state.db_sessionmaker is not None
    async with state.db_sessionmaker() as session:
        fields: dict[str, object] = {
            "user_id": "user-1",
            "location_id": "wrightsville-beach-nc",
            "min_verdict": "Good",
            "email": "angler@example.com",
            "enabled": True,
            "created_at": _NOW,
        }
        fields.update(overrides)
        session.add(AlertRule(**fields))
        await session.commit()


async def test_check_sends_once_per_day(db_state: AppState) -> None:
    await _add_rule(db_state)
    sent: list[tuple[str, str]] = []
    assert db_state.db_sessionmaker is not None

    def send(to: str, subject: str, body: str) -> None:
        sent.append((to, subject))

    first = await run_alert_check(
        db_state.db_sessionmaker, _lookup, now=_NOW, site_url="http://x", send=send
    )
    second = await run_alert_check(
        db_state.db_sessionmaker, _lookup, now=_NOW, site_url="http://x", send=send
    )
    assert (first, second) == (1, 0)
    assert sent == [
        ("angler@example.com", "Saltline: Wrightsville Beach is Good (72/100) today")
    ]


async def test_check_skips_disabled_and_unmet_rules(db_state: AppState) -> None:
    await _add_rule(db_state, enabled=False)
    await _add_rule(db_state, user_id="user-2", min_verdict="Excellent")
    assert db_state.db_sessionmaker is not None
    sent = await run_alert_check(
        db_state.db_sessionmaker,
        _lookup,
        now=_NOW,
        site_url="http://x",
        send=lambda *a: None,
    )
    assert sent == 0


async def test_failed_send_is_retried_next_check(db_state: AppState) -> None:
    await _add_rule(db_state)
    assert db_state.db_sessionmaker is not None

    def broken(*_: str) -> None:
        raise OSError("smtp down")

    assert (
        await run_alert_check(
            db_state.db_sessionmaker,
            _lookup,
            now=_NOW,
            site_url="http://x",
            send=broken,
        )
        == 0
    )
    assert (
        await run_alert_check(
            db_state.db_sessionmaker,
            _lookup,
            now=_NOW,
            site_url="http://x",
            send=lambda *a: None,
        )
        == 1
    )


async def test_failed_forecast_does_not_stop_the_check(db_state: AppState) -> None:
    await _add_rule(db_state)
    assert db_state.db_sessionmaker is not None

    async def broken(location_id: str) -> tuple[str, str, dict[str, object]]:
        raise RuntimeError("upstream down")

    assert (
        await run_alert_check(
            db_state.db_sessionmaker,
            broken,
            now=_NOW,
            site_url="http://x",
            send=lambda *a: None,
        )
        == 0
    )


# --- router ------------------------------------------------------------------

_RULE = {
    "location_id": "wrightsville-beach-nc",
    "min_verdict": "Good",
    "email": "angler@example.com",
}


def test_list_reports_email_configuration(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.delenv("SMTP_HOST", raising=False)
    assert client.get("/v1/me/alerts").json() == {
        "email_configured": False,
        "rules": [],
    }
    monkeypatch.setenv("SMTP_HOST", "smtp.example.com")
    assert client.get("/v1/me/alerts").json()["email_configured"] is True


def test_put_creates_then_updates_one_rule_per_spot(client: TestClient) -> None:
    created = client.put("/v1/me/alerts", json=_RULE)
    assert created.status_code == 200, created.text
    assert created.json()["location_name"] == "Wrightsville Beach"
    updated = client.put("/v1/me/alerts", json=_RULE | {"min_verdict": "Excellent"})
    assert updated.json()["id"] == created.json()["id"]
    rules = client.get("/v1/me/alerts").json()["rules"]
    assert [rule["min_verdict"] for rule in rules] == ["Excellent"]


@pytest.mark.parametrize(
    "bad", [{"min_verdict": "Fair"}, {"email": "not-an-email"}, {"location_id": ""}]
)
def test_invalid_rules_are_rejected(client: TestClient, bad: dict[str, str]) -> None:
    assert client.put("/v1/me/alerts", json=_RULE | bad).status_code == 422


def test_unknown_spot_is_a_404(client: TestClient) -> None:
    assert (
        client.put("/v1/me/alerts", json=_RULE | {"location_id": "nowhere"}).status_code
        == 404
    )


def test_delete_and_ownership(client: TestClient) -> None:
    rule_id = client.put("/v1/me/alerts", json=_RULE).json()["id"]
    app.dependency_overrides[require_internal_signature] = lambda: "user-2"
    assert client.delete(f"/v1/me/alerts/{rule_id}").status_code == 404
    app.dependency_overrides[require_internal_signature] = lambda: "user-1"
    assert client.delete(f"/v1/me/alerts/{rule_id}").status_code == 204
    assert client.get("/v1/me/alerts").json()["rules"] == []


def test_account_export_and_delete_include_alerts(client: TestClient) -> None:
    client.put("/v1/me/alerts", json=_RULE)
    assert (
        client.get("/v1/me/export").json()["alerts"][0]["email"] == "angler@example.com"
    )
    assert client.delete("/v1/me").status_code == 204
    assert client.get("/v1/me/alerts").json()["rules"] == []


async def test_alert_uses_the_users_personalized_verdict(db_state: AppState) -> None:
    """Over the user's comfort limit, the page shows the day a level lower
    (Good -> Fair); a "Good or better" email must not go out."""
    from app.domain.preferences import UserPreferences
    from tests.test_personalize import _envelope

    assert db_state.db_sessionmaker is not None
    async with db_state.db_sessionmaker() as session:
        session.add(UserPreferences(user_id="user-1", wind_threshold_kt=10))
        await session.commit()
    await _add_rule(db_state)
    envelope = _envelope(wind=[10.0, 15.0]).model_dump(mode="json")

    async def lookup(location_id: str) -> tuple[str, str, dict[str, object]]:
        return "Wrightsville Beach", "America/New_York", envelope

    sent = await run_alert_check(
        db_state.db_sessionmaker,
        lookup,
        now=_NOW,
        site_url="http://x",
        send=lambda *a: None,
    )
    assert sent == 0


def test_compose_alert_in_metric() -> None:
    envelope = {
        **_ENVELOPE,
        "conditions": {
            **_ENVELOPE["conditions"],  # type: ignore[dict-item]
            "score": {
                "verdict": "Good",
                "score": 72,
                "summary": "Moderate surf (2–3 ft), light wind (10–15 kt) and water 65°F.",
            },
        },
    }
    _subject, body = compose_alert(
        location_name="Wrightsville Beach",
        location_id="wrightsville-beach-nc",
        envelope=envelope,
        site_url="http://x",
        units="metric",
    )
    assert "Water 18°C · Wind N 19-28 km/h · Waves 0.6-0.9 m" in body
    assert "Moderate surf (0.6–0.9 m), light wind (19–28 km/h) and water 18°C." in body
    assert "°F" not in body and " kt" not in body and " ft" not in body
