"""Regenerate app/data/guidance_species.json (sprint 35).

Copies a curated, region-gated subset of common surf/pier targets out of
the legacy `storage/species_data.json` (repo root), field-for-field, so
apps/api never imports or ships the full provisional 851-species dataset.
The roadmap defers the full catalogue past v1; sprint 35 asks only for
"limited supported suggestions".

Run from apps/api:  python -m scripts.generate_guidance_catalogue
"""

from __future__ import annotations

import json
from pathlib import Path

_API_ROOT = Path(__file__).resolve().parent.parent
_LEGACY_PATH = _API_ROOT.parent.parent / "storage" / "species_data.json"
_OUT_PATH = _API_ROOT / "app" / "data" / "guidance_species.json"

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


def main() -> None:
    legacy = {entry["name"]: entry for entry in json.loads(_LEGACY_PATH.read_text())}
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


if __name__ == "__main__":
    main()
