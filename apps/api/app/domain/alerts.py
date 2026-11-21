"""Forecast email alerts (restored from the original app at the product
owner's request): "email me when my spot is Good or better".

A rule is (user, location, minimum verdict, email address). The API never
owns users' emails (Better Auth does, ADR-006), so apps/web passes the
signed-in user's own address when a rule is saved.

`run_alert_check` is the whole job, with every side effect injectable so
it's testable: for each enabled rule it reads the (cached or fresh)
forecast and sends at most one email per rule per local day, only during
waking hours (5 AM-8 PM at the spot) and only when the verdict meets the
rule. `should_alert` is the pure decision. Mail reuses apps/web's SMTP_*
settings; with no SMTP_HOST the check never runs.
"""

from __future__ import annotations

import asyncio
import logging
import os
import re
import smtplib
from collections.abc import Awaitable, Callable
from datetime import date, datetime
from email.message import EmailMessage
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field
from sqlalchemy import Boolean, DateTime, Integer, String, UniqueConstraint, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
from sqlalchemy.orm import Mapped, mapped_column

from app.infra.database import Base
from app.infra.timezones import safe_zone

_logger = logging.getLogger(__name__)

POLL_SECONDS_DEFAULT = 1800
WAKING_HOURS = range(5, 20)  # 5:00-19:59 local time at the spot

_VERDICT_RANK = {"Poor": 0, "Challenging": 1, "Fair": 2, "Good": 3, "Excellent": 4}


class AlertThreshold(str, Enum):
    GOOD = "Good"
    EXCELLENT = "Excellent"


class AlertRule(Base):
    __tablename__ = "alert_rule"
    __table_args__ = (UniqueConstraint("user_id", "location_id"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String, index=True)
    location_id: Mapped[str] = mapped_column(String)
    min_verdict: Mapped[str] = mapped_column(String)
    email: Mapped[str] = mapped_column(String)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    last_sent_on: Mapped[str | None] = mapped_column(String, nullable=True)
    """Local date ("YYYY-MM-DD") of the last email, for once-a-day dedupe."""
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class AlertRuleIn(BaseModel):
    location_id: str = Field(min_length=1, max_length=64)
    min_verdict: AlertThreshold
    email: str = Field(max_length=254, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class AlertRuleOut(BaseModel):
    id: int
    location_id: str
    location_name: str
    min_verdict: AlertThreshold
    email: str
    enabled: bool
    last_sent_on: str | None


class AlertsOut(BaseModel):
    email_configured: bool
    """False when this server has no SMTP_HOST: rules save, but no email
    can be sent until mail settings exist (install.sh asks for them)."""
    rules: list[AlertRuleOut]


_KT_TO_KMH = 1.852
_FT_TO_M = 0.3048
_RANGE = r"(\d+(?:\.\d+)?)(?:(\s*(?:–|-|to)\s*)(\d+(?:\.\d+)?))?"


def _metric_text(text: str) -> str:
    """The forecast summary's feet, knots and °F in metric (the same
    conversions apps/web's localizeText applies on the page)."""

    def conv(fn: Any, unit: str) -> Any:
        def sub(m: re.Match[str]) -> str:
            low, sep, high = m.group(1), m.group(2), m.group(3)
            out = fn(float(low))
            return f"{out}{sep}{fn(float(high))} {unit}" if high else f"{out} {unit}"

        return sub

    text = re.sub(
        _RANGE + r"\s*°\s*F\b",
        lambda m: (
            f"{round((float(m.group(1)) - 32) * 5 / 9)}"
            + (
                f"{m.group(2)}{round((float(m.group(3)) - 32) * 5 / 9)}"
                if m.group(3)
                else ""
            )
            + "°C"
        ),
        text,
    )
    text = re.sub(
        _RANGE + r"\s*(?:ft|feet|foot)\b",
        conv(lambda v: f"{v * _FT_TO_M:.1f}", "m"),
        text,
    )
    return re.sub(
        _RANGE + r"\s*(?:kt|knots?)\b",
        conv(lambda v: round(v * _KT_TO_KMH), "km/h"),
        text,
    )


def smtp_configured() -> bool:
    return bool(os.environ.get("SMTP_HOST"))


def should_alert(
    verdict: str | None,
    min_verdict: str,
    *,
    last_sent_on: str | None,
    local_date: date,
    local_hour: int,
) -> bool:
    """Send only when the verdict meets the rule, it's waking hours at the
    spot, and nothing was sent for this rule yet today (spot's local day)."""
    if verdict not in _VERDICT_RANK or min_verdict not in _VERDICT_RANK:
        return False
    if _VERDICT_RANK[verdict] < _VERDICT_RANK[min_verdict]:
        return False
    if local_hour not in WAKING_HOURS:
        return False
    return last_sent_on != local_date.isoformat()


def compose_alert(
    *,
    location_name: str,
    location_id: str,
    envelope: dict[str, Any],
    site_url: str,
    units: str = "imperial",
) -> tuple[str, str]:
    """(subject, plain-text body) for one alert, in the user's units."""
    metric = units == "metric"
    conditions = envelope.get("conditions") or {}
    score = conditions.get("score") or {}
    verdict = score.get("verdict", "Good")
    points = score.get("score")
    # Rated for the angler's main style when they have one ("pier").
    style = f" for {score['style']} fishing" if score.get("style") else ""
    subject = f"Saltline: {location_name} is {verdict}{style}" + (
        f" ({points}/100) today" if points is not None else " today"
    )
    lines = [
        f"{location_name} looks {verdict.lower()} for {score['style']} fishing today."
        if score.get("style")
        else f"{location_name} looks {verdict.lower()} for fishing today."
    ]
    if score.get("summary"):
        summary = str(score["summary"])
        lines.append(_metric_text(summary) if metric else summary)
    water = conditions.get("water_temperature") or {}
    facts = []
    if water.get("value") is not None:
        value = float(water["value"])
        facts.append(
            f"Water {round((value - 32) * 5 / 9)}°C"
            if metric
            else f"Water {round(value)}°F"
        )
    if conditions.get("wind_range_kt"):
        low, high = conditions["wind_range_kt"]
        direction = conditions.get("wind_direction") or ""
        speed = (
            f"{round(low * _KT_TO_KMH)}-{round(high * _KT_TO_KMH)} km/h"
            if metric
            else f"{low:g}-{high:g} kt"
        )
        facts.append(f"Wind {direction} {speed}".replace("  ", " "))
    if conditions.get("wave_range_ft"):
        low, high = conditions["wave_range_ft"]
        facts.append(
            f"Waves {low * _FT_TO_M:.1f}-{high * _FT_TO_M:.1f} m"
            if metric
            else f"Waves {low:g}-{high:g} ft"
        )
    if facts:
        lines.append(" · ".join(facts))
    picks = ((envelope.get("recommendations") or {}).get("species") or [])[:3]
    if picks:
        lines.append("What's biting: " + ", ".join(pick["name"] for pick in picks))
    lines += [
        "",
        f"Full forecast: {site_url.rstrip('/')}/forecast/{location_id}",
        "",
        (
            "You're getting this because you turned on alerts for this spot in "
            "Saltline. Turn them off on the spot's forecast page."
        ),
    ]
    return subject, "\n".join(lines)


def send_email_smtp(to: str, subject: str, body: str) -> None:
    """Blocking SMTP send with apps/web's SMTP_* settings."""
    host = os.environ["SMTP_HOST"]
    port = int(os.environ.get("SMTP_PORT", "587"))
    user = os.environ.get("SMTP_USER")
    password = os.environ.get("SMTP_PASS")
    sender = os.environ.get("SMTP_FROM", "Saltline <no-reply@saltline.app>")
    message = EmailMessage()
    message["From"], message["To"], message["Subject"] = sender, to, subject
    message.set_content(body)
    if port == 465:
        with smtplib.SMTP_SSL(host, port, timeout=30) as smtp:
            if user and password:
                smtp.login(user, password)
            smtp.send_message(message)
        return
    with smtplib.SMTP(host, port, timeout=30) as smtp:
        if os.environ.get("SMTP_USE_TLS", "1") != "0":
            smtp.starttls()
        if user and password:
            smtp.login(user, password)
        smtp.send_message(message)


ForecastLookup = Callable[[str], Awaitable[tuple[str, str, dict[str, Any]]]]
"""location_id -> (location name, IANA timezone, forecast envelope dict)."""

Sender = Callable[[str, str, str], None]


async def _personalized(
    session: AsyncSession, user_id: str, envelope: dict[str, Any], now: datetime
) -> tuple[dict[str, Any], str]:
    """(*envelope* with *user_id*'s fishing profile applied, their units),
    or the envelope unchanged and "imperial" when they have no profile (or
    anything goes wrong)."""
    from app.domain.models import ForecastEnvelope
    from app.domain.personalize import personalize
    from app.domain.preferences import PreferencesOut, UserPreferences

    try:
        row = await session.get(UserPreferences, user_id)
        if row is None:
            return envelope, "imperial"
        prefs = PreferencesOut.model_validate(row, from_attributes=True)
        out = personalize(ForecastEnvelope.model_validate(envelope), prefs, now=now)
        units = prefs.units
        return out.model_dump(mode="json"), str(getattr(units, "value", units))
    except Exception:
        _logger.warning("could not personalize alert forecast", exc_info=True)
        return envelope, "imperial"


async def run_alert_check(
    sessionmaker: async_sessionmaker[AsyncSession],
    lookup: ForecastLookup,
    *,
    now: datetime,
    site_url: str,
    send: Sender = send_email_smtp,
) -> int:
    """One pass over every enabled rule; returns how many emails were sent.
    A failure for one location or one send never stops the others."""
    sent = 0
    async with sessionmaker() as session:
        rules = (
            (
                await session.execute(
                    select(AlertRule).where(AlertRule.enabled.is_(True))
                )
            )
            .scalars()
            .all()
        )
        forecasts: dict[str, tuple[str, str, dict[str, Any]] | None] = {}
        for rule in rules:
            if rule.location_id not in forecasts:
                try:
                    forecasts[rule.location_id] = await lookup(rule.location_id)
                except Exception:
                    _logger.warning(
                        "alert forecast failed for %s", rule.location_id, exc_info=True
                    )
                    forecasts[rule.location_id] = None
            found = forecasts[rule.location_id]
            if found is None:
                continue
            name, tz_name, envelope = found
            # The verdict the user sees on the page is personalized (a day
            # over their comfort limits drops a level); the email has to
            # agree with it, not with the shared one.
            envelope, units = await _personalized(session, rule.user_id, envelope, now)
            local = now.astimezone(safe_zone(tz_name))
            verdict = ((envelope.get("conditions") or {}).get("score") or {}).get(
                "verdict"
            )
            if not should_alert(
                verdict,
                rule.min_verdict,
                last_sent_on=rule.last_sent_on,
                local_date=local.date(),
                local_hour=local.hour,
            ):
                continue
            subject, body = compose_alert(
                location_name=name,
                location_id=rule.location_id,
                envelope=envelope,
                site_url=site_url,
                units=units,
            )
            try:
                await asyncio.to_thread(send, rule.email, subject, body)
            except Exception:
                _logger.warning(
                    "alert email failed for rule %s", rule.id, exc_info=True
                )
                continue
            rule.last_sent_on = local.date().isoformat()
            sent += 1
        await session.commit()
    return sent
