"""Personalize a forecast envelope with the signed-in user's fishing profile
(restored from the original app, where the profile shaped the dashboard).

The cached envelope is shared by everyone, so personalization is an
overlay applied per request on a copy -- it never changes the cache.

- Comfort limits (`wind_threshold_kt`, `surf_threshold_ft`): a day over
  either limit gets a `over_comfort_limit` warning and its verdict drops
  one level, as the original did ("the rating downgrades and flags any day
  that exceeds your limits"). The score itself is left as computed, and the
  reason is added to the summary so the downgrade is never silent.
- Gear (`uses_lures`, `uses_live_bait`, `uses_cut_bait`): "Pack for today"
  drops lure rows for someone who never uses lures, and bait rows for
  someone who uses neither live nor cut bait.
"""

from __future__ import annotations

from typing import Any

from app.domain.models import ForecastEnvelope, Warning, WarningSeverity
from app.domain.preferences import PreferencesOut

_VERDICT_ORDER = ["Poor", "Challenging", "Fair", "Good", "Excellent"]


def _downgrade(verdict: str) -> str:
    if verdict not in _VERDICT_ORDER:
        return verdict
    return _VERDICT_ORDER[max(0, _VERDICT_ORDER.index(verdict) - 1)]


def comfort_breaches(
    conditions: dict[str, Any] | None, prefs: PreferencesOut
) -> list[str]:
    """Plain-language reasons the day exceeds the user's limits (by the high
    end of the forecast range, the conservative reading)."""
    if not conditions:
        return []
    reasons: list[str] = []
    wind = conditions.get("wind_range_kt")
    if (
        prefs.wind_threshold_kt is not None
        and wind
        and wind[1] > prefs.wind_threshold_kt
    ):
        reasons.append(
            f"wind up to {wind[1]:g} kt (your limit {prefs.wind_threshold_kt:g})"
        )
    waves = conditions.get("wave_range_ft")
    if (
        prefs.surf_threshold_ft is not None
        and waves
        and waves[1] > prefs.surf_threshold_ft
    ):
        reasons.append(
            f"surf up to {waves[1]:g} ft (your limit {prefs.surf_threshold_ft:g})"
        )
    return reasons


def _filter_pack(pack: dict[str, Any], prefs: PreferencesOut) -> dict[str, Any]:
    rows = pack.get("rows", [])
    if prefs.uses_lures == "no":
        rows = [row for row in rows if row.get("kind") not in ("lure", "color")]
    if prefs.uses_live_bait == "no" and prefs.uses_cut_bait == "no":
        rows = [row for row in rows if row.get("kind") != "bait"]
    return {**pack, "rows": rows}


def personalize(envelope: ForecastEnvelope, prefs: PreferencesOut) -> ForecastEnvelope:
    """A personalized copy of *envelope*; the input is never mutated."""
    conditions = dict(envelope.conditions) if envelope.conditions else None
    recommendations = (
        dict(envelope.recommendations) if envelope.recommendations else None
    )
    warnings = list(envelope.warnings)

    breaches = comfort_breaches(conditions, prefs)
    if breaches and conditions is not None:
        score = dict(conditions.get("score") or {})
        if score.get("verdict"):
            original = score["verdict"]
            score["verdict"] = _downgrade(original)
            note = "Over your comfort limits: " + "; ".join(breaches) + "."
            score["summary"] = f"{note} {score.get('summary') or ''}".strip()
            score["personalized_from"] = original
            conditions["score"] = score
        conditions["comfort"] = {"over_limit": True, "reasons": breaches}
        warnings.append(
            Warning(
                code="over_comfort_limit",
                message="Over your comfort limits today: " + "; ".join(breaches) + ".",
                severity=WarningSeverity.ADVISORY,
            )
        )

    if recommendations and recommendations.get("pack"):
        recommendations["pack"] = _filter_pack(recommendations["pack"], prefs)

    return envelope.model_copy(
        update={
            "conditions": conditions,
            "recommendations": recommendations,
            "warnings": warnings,
        }
    )
