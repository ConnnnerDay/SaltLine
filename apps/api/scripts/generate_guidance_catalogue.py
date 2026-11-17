"""Regenerate app/data/guidance_species.json (sprint 35).

Copies a curated, region-gated subset of common surf/pier targets out of
the legacy `storage/species_data.json` (repo root), field-for-field, so
apps/api never imports or ships the full provisional 851-species dataset.
The roadmap defers the full catalogue past v1; sprint 35 asks only for
"limited supported suggestions".

Run from apps/api:  python -m scripts.generate_guidance_catalogue
"""

from __future__ import annotations

import ast
import json
from pathlib import Path

_API_ROOT = Path(__file__).resolve().parent.parent
_LEGACY_PATH = _API_ROOT.parent.parent / "storage" / "species_data.json"
_OUT_PATH = _API_ROOT / "app" / "data" / "guidance_species.json"
_LEGACY_REGS_PATH = _API_ROOT.parent.parent / "storage" / "regulations_data.json"
_LEGACY_REGS_MODULE = _API_ROOT.parent.parent / "regulations.py"
_LEGACY_SPECIES_MODULE = _API_ROOT.parent.parent / "domain" / "species.py"
_LEGACY_CLASSIFICATIONS = (
    _API_ROOT.parent.parent / "storage" / "species_classifications.json"
)
_LEGACY_LOCATIONS_MODULE = _API_ROOT.parent.parent / "locations.py"
_CAMS_OUT_PATH = _API_ROOT / "app" / "data" / "live_cams.json"
# Legacy `domain/species.py` condition sets -> the tag each becomes here.
_CONDITION_SETS = {
    "_ONSHORE_WIND_SPECIES": "onshore_wind",
    "_CALM_WATER_SPECIES": "calm_water",
    "_ROUGH_SURF_SPECIES": "rough_surf",
    "_LOW_LIGHT_SPECIES": "low_light",
    "_DAYTIME_SPECIES": "daytime",
}
_REGS_OUT_PATH = _API_ROOT / "app" / "data" / "guidance_regulations.json"

_N, _M, _S, _G = "atlantic_north", "atlantic_mid", "atlantic_south", "gulf"
_P, _PS, _H = "pacific", "pacific_south", "hawaii_conditions"

# (legacy entry name, display name, conditions_regions it's offered in)
_PICKS: list[tuple[str, str, list[str]]] = [
    ("Red drum (puppy drum)", "Red drum", [_M, _S, _G]),
    ("Black drum", "Black drum", [_M, _S, _G]),
    ("Bluefish", "Bluefish", [_N, _M, _S, _G]),
    ("Speckled trout (spotted seatrout)", "Speckled trout", [_M, _S, _G]),
    ("Whiting (sea mullet, kingfish)", "Whiting (sea mullet)", [_M, _S, _G]),
    ("Spot", "Spot", [_M, _S]),
    ("Atlantic croaker", "Atlantic croaker", [_M, _S, _G]),
    ("Sheepshead", "Sheepshead", [_M, _S, _G]),
    ("Flounder (summer flounder)", "Flounder", [_N, _M, _S]),
    ("Pompano", "Pompano", [_S, _G]),
    ("Spanish mackerel", "Spanish mackerel", [_M, _S, _G]),
    ("Snook", "Snook", [_S, _G]),
    ("Striped bass (rockfish)", "Striped bass", [_N, _M]),
    ("Tautog (blackfish)", "Tautog", [_N, _M]),
    ("Black sea bass", "Black sea bass", [_N, _M]),
    ("Barred surfperch", "Barred surfperch", [_P, _PS]),
    ("Redtail surfperch", "Redtail surfperch", [_P]),
    ("California halibut", "California halibut", [_P, _PS]),
    ("Corbina", "Corbina", [_PS]),
    ("Yellowfin croaker", "Yellowfin croaker", [_PS]),
    ("Black rockfish", "Black rockfish", [_P]),
    ("Lingcod", "Lingcod", [_P]),
    ("Giant trevally (ulua)", "Ulua (giant trevally)", [_H]),
    ("Papio (juvenile jack)", "Papio", [_H]),
    ("Bonefish (oio)", "O'io (bonefish)", [_H]),
    ("Moi (Pacific threadfin)", "Moi", [_H]),
]

_COPIED_FIELDS = (
    "temp_min",
    "temp_max",
    "temp_ideal_low",
    "temp_ideal_high",
    "peak_months",
    "good_months",
    "bait",
    "rig",
    "hook_size",
    "sinker",
    "lures",
    "explanation_cold",
    "explanation_warm",
)


def _slug(name: str) -> str:
    return (
        name.lower()
        .replace("'", "")
        .replace("(", "")
        .replace(")", "")
        .replace(" ", "-")
    )


def _legacy_condition_tags() -> dict[str, list[str]]:
    """Legacy species name -> condition tags, read from the module-level
    sets in `domain/species.py` with `ast` (the module never runs)."""
    tree = ast.parse(_LEGACY_SPECIES_MODULE.read_text())
    tags: dict[str, list[str]] = {}
    for node in tree.body:
        if not isinstance(node, ast.AnnAssign | ast.Assign):
            continue
        targets = [node.target] if isinstance(node, ast.AnnAssign) else node.targets
        name = getattr(targets[0], "id", "")
        if name in _CONDITION_SETS and node.value is not None:
            for species_name in ast.literal_eval(node.value):
                tags.setdefault(species_name, []).append(_CONDITION_SETS[name])
    return tags


def main() -> None:
    legacy = {entry["name"]: entry for entry in json.loads(_LEGACY_PATH.read_text())}
    condition_tags = _legacy_condition_tags()
    # The original profile's "What are you mostly fishing for?" groups.
    target_groups: dict[str, list[str]] = json.loads(
        _LEGACY_CLASSIFICATIONS.read_text()
    )["target_categories"]
    species = []
    for legacy_name, name, regions in _PICKS:
        entry = legacy[legacy_name]
        record: dict[str, object] = {
            "id": _slug(name),
            "name": name,
            "legacy_name": legacy_name,
            "regions": regions,
        }
        record.update({field: entry[field] for field in _COPIED_FIELDS})
        record["conditions"] = condition_tags.get(legacy_name, [])
        record["targets"] = [
            group for group, names in target_groups.items() if legacy_name in names
        ]
        species.append(record)

    payload = {
        "_comment": (
            "Sprint 35 curated fishing-guidance catalogue: common surf/pier "
            "targets only, region-gated by conditions_region. Every field "
            "except id/name/regions is copied verbatim from the legacy "
            "storage/species_data.json entry named in legacy_name "
            "(provisional dataset, see docs/CANONICAL_ROADMAP.md). Generated "
            "by scripts/generate_guidance_catalogue.py; regenerate rather "
            "than hand-edit."
        ),
        "species": species,
    }
    _OUT_PATH.write_text(json.dumps(payload, indent=2) + "\n")
    _write_regulations(species)
    _write_live_cams()


def _write_live_cams() -> None:
    """Legacy `locations.py`'s `COASTAL_LIVE_CAMS` (public cam links), read
    with `ast` so the legacy module never runs."""
    tree = ast.parse(_LEGACY_LOCATIONS_MODULE.read_text())
    for node in tree.body:
        if isinstance(node, ast.AnnAssign) and getattr(node.target, "id", "") == (
            "COASTAL_LIVE_CAMS"
        ):
            cams = ast.literal_eval(node.value)  # type: ignore[arg-type]
            break
    else:
        raise RuntimeError("COASTAL_LIVE_CAMS not found in locations.py")
    payload = {
        "_comment": (
            "Public live-cam links from the legacy locations.py. Generated by "
            "scripts/generate_guidance_catalogue.py; regenerate rather than "
            "hand-edit."
        ),
        "cams": cams,
    }
    _CAMS_OUT_PATH.write_text(json.dumps(payload, indent=2) + "\n")


def _state_sources() -> dict[str, str]:
    """`_STATE_REGULATION_SOURCES` from the legacy regulations.py, read
    with `ast` so the legacy module (and its imports) never runs."""
    tree = ast.parse(_LEGACY_REGS_MODULE.read_text())
    for node in tree.body:
        if isinstance(node, ast.AnnAssign) and getattr(node.target, "id", "") == (
            "_STATE_REGULATION_SOURCES"
        ):
            return ast.literal_eval(node.value)  # type: ignore[arg-type]
    raise RuntimeError("_STATE_REGULATION_SOURCES not found in regulations.py")


def _write_regulations(species: list[dict[str, object]]) -> None:
    """The legacy regulations snapshot, cut down to this catalogue's
    species and keyed by catalogue id, plus each state's official source."""
    legacy = json.loads(_LEGACY_REGS_PATH.read_text())
    name_map: dict[str, str] = legacy["name_map"]
    states: dict[str, dict[str, dict[str, str]]] = {}
    for state, entries in legacy["states"].items():
        for record in species:
            legacy_name = str(record["legacy_name"])
            key = name_map.get(legacy_name, legacy_name)
            if key in entries:
                states.setdefault(state, {})[str(record["id"])] = entries[key]
    sources = _state_sources()
    payload = {
        "_comment": (
            "Generated by scripts/generate_guidance_catalogue.py from the legacy "
            "storage/regulations_data.json snapshot (provisional: verify with "
            "the official state source). Regenerate rather than hand-edit."
        ),
        "as_of": legacy["last_updated"],
        "snapshot_source": legacy["snapshot_source"],
        "state_sources": {
            state: sources[state] for state in states if state in sources
        },
        "states": states,
    }
    _REGS_OUT_PATH.write_text(json.dumps(payload, indent=2) + "\n")


if __name__ == "__main__":
    main()
