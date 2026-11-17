"""Personalize a forecast envelope with the signed-in user's fishing profile
(restored from the original app, where the profile shaped the dashboard).

The cached envelope is shared by everyone, so personalization is an
overlay applied per request on a copy -- it never changes the cache.

- Comfort limits (`wind_threshold_kt`, `surf_threshold_ft`): a day over
  either limit gets a `over_comfort_limit` warning and its verdict drops
  one level, as the original did ("the rating downgrades and flags any day
  that exceeds your limits"). The score itself is left as computed, and the
  reason is added to the summary so the downgrade is never silent.
- Target groups (`target_groups`): picks in a group the user fishes for get
  `_TARGET_BONUS` points and a "matches what you fish for" reason, and
  "What's biting" is re-ranked -- the original's target filter, softened to
  a boost so a slow day for your fish still shows what *is* biting.
  "Pack for today" is rebuilt from the re-ranked picks.
- Gear (`uses_lures`, `uses_live_bait`, `uses_cut_bait`): "Pack for today"
  drops lure rows for someone who never uses lures, and bait rows for
  someone who uses neither live nor cut bait.
- Experience: beginners get a "Start simple" row in "Pack for today".
- Usual times + tide preference (`fishing_times`, `tide_preference`):
  `hourly_outlook.your_window` -- the best stretch of the day inside the
  user's usual hours, on their preferred tide when the day has one.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from app.domain.guidance import GuidanceTier, SpeciesPick, build_pack_for_today
from app.domain.models import ForecastEnvelope, Warning, WarningSeverity
from app.domain.preferences import PreferencesOut
from app.infra.timezones import safe_zone

_TARGET_BONUS = 10

_TARGET_LABELS = {
    "bottom": "bottom fish",
    "pelagic": "fast-moving fish",
    "structure": "structure fish",
    "gamefish": "big gamefish",
    "inshore_slam": "the inshore slam",
}

# Local hours each usual-time answer covers.
TIME_HOURS: dict[str, set[int]] = {
    "dawn": {5, 6, 7},
    "morning": {8, 9, 10, 11},
    "afternoon": {12, 13, 14, 15, 16},
    "evening": {17, 18, 19, 20},
    "night": {21, 22, 23, 0, 1, 2, 3, 4},
}

_TAG_RANK = {"low": 0, "med": 1, "high": 2, "prime": 3}

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


def _tier(score: float) -> str:
    if score >= 65:
        return GuidanceTier.PRIME.value
    if score >= 50:
        return GuidanceTier.GOOD.value
    return GuidanceTier.FAIR.value


def _rerank_for_targets(
    species: list[dict[str, Any]], targets: list[str]
) -> list[dict[str, Any]]:
    """Boost picks in the user's target groups, then re-sort (stable)."""
    out: list[dict[str, Any]] = []
    for pick in species:
        matched = [group for group in pick.get("targets", []) if group in targets]
        if matched:
            label = _TARGET_LABELS.get(matched[0], matched[0])
            pick = {
                **pick,
                "score": pick["score"] + _TARGET_BONUS,
                "tier": _tier(pick["score"] + _TARGET_BONUS),
                "reasons": [
                    *pick.get("reasons", []),
                    f"Matches what you fish for ({label})",
                ],
                "matches_profile": True,
            }
        out.append(pick)
    return sorted(out, key=lambda pick: pick["score"], reverse=True)


def _local_hour(iso: str | datetime, tz_name: str) -> int:
    moment = iso if isinstance(iso, datetime) else datetime.fromisoformat(str(iso))
    return moment.astimezone(safe_zone(tz_name)).hour


def _tide_state_by_hour(
    hours: list[dict[str, Any]], tides: dict[str, Any] | None, tz_name: str
) -> dict[int, set[str]]:
    """Hour -> tide states ("incoming"/"outgoing", plus "high"/"low" within
    an hour of that event), from the day's high/low predictions."""
    predictions = sorted(
        (datetime.fromisoformat(str(p["time"])), p["kind"])
        for p in (tides or {}).get("predictions", [])
    )
    states: dict[int, set[str]] = {}
    for hour in hours:
        moment = datetime.fromisoformat(str(hour["time"]))
        found: set[str] = set()
        upcoming = next((kind for when, kind in predictions if when > moment), None)
        if upcoming == "high":
            found.add("incoming")
        elif upcoming == "low":
            found.add("outgoing")
        for when, kind in predictions:
            if abs((when - moment).total_seconds()) <= 3600:
                found.add(kind)
        states[hour["hour"]] = found
    return states


def your_window(
    outlook: dict[str, Any] | None,
    tides: dict[str, Any] | None,
    prefs: PreferencesOut,
    tz_name: str,
) -> dict[str, Any] | None:
    """The best stretch inside the user's usual hours: the longest run of
    the best activity tier available there (the same rule as the shared
    "best window"), restricted to their preferred tide when any such hour
    exists. `None` without usual times or hourly data."""
    if not outlook or not prefs.fishing_times:
        return None
    allowed: set[int] = set()
    for time in prefs.fishing_times:
        allowed |= TIME_HOURS.get(
            str(time.value if hasattr(time, "value") else time), set()
        )
    hours = [h for h in outlook.get("hours", []) if h["hour"] in allowed]
    if not hours:
        return None
    tide_note: str | None = None
    if prefs.tide_preference:
        wanted = str(prefs.tide_preference.value)
        states = _tide_state_by_hour(outlook.get("hours", []), tides, tz_name)
        on_tide = [h for h in hours if wanted in states.get(h["hour"], set())]
        if on_tide:
            hours, tide_note = on_tide, f"{wanted} tide"
    best_rank = max(_TAG_RANK.get(h["tag"], 0) for h in hours)
    best_run: list[dict[str, Any]] = []
    run: list[dict[str, Any]] = []
    for hour in sorted(hours, key=lambda h: h["hour"]):
        contiguous = run and hour["hour"] == run[-1]["hour"] + 1
        if _TAG_RANK.get(hour["tag"], 0) == best_rank:
            run = [*run, hour] if contiguous else [hour]
            if len(run) > len(best_run):
                best_run = run
        else:
            run = []
    if not best_run:
        return None
    reasons = list(dict.fromkeys(r for h in best_run for r in h.get("reasons", [])))
    if tide_note:
        reasons.append(f"{tide_note} (your preference)")
    return {
        "start": best_run[0]["time"],
        "end": best_run[-1]["time"],
        "tag": best_run[0]["tag"],
        "reasons": reasons,
    }


def _beginner_tip(picks: list[SpeciesPick]) -> dict[str, str] | None:
    if not picks:
        return None
    first = picks[0]
    bait = first.bait.replace(";", ",").split(",")[0].strip()
    return {
        "kind": "tip",
        "label": "Start simple",
        "value": (
            f"{first.rig} with {bait.lower()} for {first.name.lower()}. Cast it out, "
            "let it settle on the bottom, keep your line just snug, and give "
            "each spot 15 minutes before moving."
        ),
    }


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

    if recommendations and prefs.target_groups and recommendations.get("species"):
        targets = [str(getattr(group, "value", group)) for group in prefs.target_groups]
        recommendations["species"] = _rerank_for_targets(
            recommendations["species"], targets
        )
        basis = recommendations.get("basis") or {}
        rebuilt = build_pack_for_today(
            [SpeciesPick.model_validate(pick) for pick in recommendations["species"]],
            water_temp_f=float(basis.get("water_temp_f", 65.0)),
            wind_range_kt=_pair((conditions or {}).get("wind_range_kt")),
            wave_range_ft=_pair((conditions or {}).get("wave_range_ft")),
            hour=_local_hour(envelope.generated_at, envelope.location.timezone),
        )
        recommendations["pack"] = rebuilt.model_dump(mode="json") if rebuilt else None

    if recommendations and recommendations.get("pack"):
        pack = _filter_pack(recommendations["pack"], prefs)
        if str(getattr(prefs.experience, "value", prefs.experience)) == "beginner":
            tip = _beginner_tip(
                [
                    SpeciesPick.model_validate(pick)
                    for pick in recommendations.get("species", [])
                ]
            )
            if tip:
                pack = {**pack, "rows": [tip, *pack["rows"]]}
        recommendations["pack"] = pack

    hourly = dict(envelope.hourly_outlook) if envelope.hourly_outlook else None
    window = your_window(hourly, envelope.tides, prefs, envelope.location.timezone)
    if hourly is not None and window is not None:
        hourly["your_window"] = window

    return envelope.model_copy(
        update={
            "conditions": conditions,
            "recommendations": recommendations,
            "warnings": warnings,
            "hourly_outlook": hourly,
        }
    )


def _pair(values: Any) -> tuple[float, float] | None:
    return (float(values[0]), float(values[1])) if values else None
