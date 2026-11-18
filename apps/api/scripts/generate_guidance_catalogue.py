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
    # --- Expanded catalogue: more fish people actually catch from the
    # beach, pier, jetty, bridge or a kayak, each in the regions it's
    # commonly caught. Order within a region is the tie-break order.
    # Northeast / Mid-Atlantic
    ("Gray trout (weakfish)", "Weakfish (gray trout)", [_N, _M, _S]),
    ("Scup (porgy)", "Scup (porgy)", [_N, _M]),
    ("Winter flounder", "Winter flounder", [_N]),
    ("Atlantic mackerel", "Atlantic mackerel", [_N]),
    ("Little tunny (false albacore)", "False albacore", [_N, _M, _S, _G]),
    ("Atlantic bonito", "Atlantic bonito", [_N, _M]),
    ("Northern kingfish", "Northern kingfish", [_N, _M]),
    ("Cunner (bergall)", "Cunner (bergall)", [_N]),
    ("Pollock", "Pollock", [_N]),
    ("White perch", "White perch", [_N, _M]),
    ("Hickory shad", "Hickory shad", [_N, _M, _S]),
    ("American eel", "American eel", [_N, _M, _S]),
    ("Northern puffer (blowfish)", "Northern puffer (blowfish)", [_N, _M]),
    ("Sea robin", "Sea robin", [_N, _M, _S]),
    ("Smooth dogfish", "Smooth dogfish", [_N, _M, _S]),
    ("Spiny dogfish", "Spiny dogfish", [_N, _M]),
    ("Clearnose skate", "Clearnose skate", [_N, _M, _S]),
    # Southeast / Gulf
    ("Cobia", "Cobia", [_M, _S, _G]),
    ("King mackerel (kingfish)", "King mackerel", [_M, _S, _G]),
    ("Spadefish (Atlantic)", "Atlantic spadefish", [_M, _S, _G]),
    ("Triggerfish (gray)", "Gray triggerfish", [_M, _S, _G]),
    ("Southern flounder", "Southern flounder", [_M, _S, _G]),
    ("Gulf flounder", "Gulf flounder", [_S, _G]),
    ("Southern kingfish (ground mullet)", "Southern kingfish", [_M, _S, _G]),
    ("Gulf kingfish (gulf whiting)", "Gulf kingfish", [_S, _G]),
    ("Silver perch", "Silver perch", [_M, _S, _G]),
    ("Sand seatrout (white trout)", "Sand seatrout (white trout)", [_G]),
    ("Silver seatrout", "Silver seatrout", [_M, _S, _G]),
    ("Pinfish", "Pinfish", [_M, _S, _G]),
    ("Mangrove snapper (gray snapper)", "Mangrove snapper", [_S, _G]),
    ("Jack crevalle", "Jack crevalle", [_M, _S, _G]),
    ("Blue runner (hardtail)", "Blue runner", [_M, _S, _G]),
    ("Ladyfish", "Ladyfish", [_S, _G]),
    ("Tarpon", "Tarpon", [_S, _G]),
    ("Tripletail", "Tripletail", [_S, _G]),
    ("Permit", "Permit", [_S, _G]),
    ("Lookdown", "Lookdown", [_S, _G]),
    ("Great barracuda", "Great barracuda", [_S, _G]),
    ("Bonefish (flats)", "Bonefish", [_S]),
    ("Sand perch", "Sand perch", [_S, _G]),
    ("Tomtate grunt", "Tomtate", [_S, _G]),
    ("Oyster toadfish", "Oyster toadfish", [_M, _S]),
    ("Atlantic sharpnose shark", "Atlantic sharpnose shark", [_M, _S, _G]),
    ("Sandbar shark", "Sandbar shark", [_M, _S, _G]),
    ("Blacktip shark", "Blacktip shark", [_M, _S, _G]),
    ("Spinner shark", "Spinner shark", [_S, _G]),
    ("Bonnethead shark", "Bonnethead shark", [_S, _G]),
    ("Bull shark", "Bull shark", [_S, _G]),
    ("Atlantic stingray", "Atlantic stingray", [_M, _S, _G]),
    ("Southern stingray", "Southern stingray", [_S, _G]),
    ("Cownose ray", "Cownose ray", [_M, _S, _G]),
    # Pacific (central / northern California to Washington, and SoCal)
    ("Calico surfperch", "Calico surfperch", [_P, _PS]),
    ("Walleye surfperch", "Walleye surfperch", [_P, _PS]),
    ("Silver surfperch", "Silver surfperch", [_P]),
    ("Rubberlip seaperch", "Rubberlip seaperch", [_P, _PS]),
    ("Pile perch", "Pile perch", [_P, _PS]),
    ("Striped seaperch", "Striped seaperch", [_P]),
    ("Shiner perch", "Shiner perch", [_P, _PS]),
    ("Black perch", "Black perch", [_P, _PS]),
    ("Jacksmelt", "Jacksmelt", [_P, _PS]),
    ("White croaker (tomcod)", "White croaker", [_P, _PS]),
    ("Starry flounder", "Starry flounder", [_P]),
    ("Pacific sanddab", "Pacific sanddab", [_P, _PS]),
    ("Kelp greenling", "Kelp greenling", [_P]),
    ("Cabezon", "Cabezon", [_P, _PS]),
    ("Grass rockfish", "Grass rockfish", [_P, _PS]),
    ("Blue rockfish", "Blue rockfish", [_P]),
    ("Copper rockfish", "Copper rockfish", [_P]),
    ("Monkeyface prickleback", "Monkeyface prickleback", [_P]),
    ("Striped bass (Sacramento)", "Striped bass (West Coast)", [_P]),
    ("Chinook salmon (king salmon)", "Chinook salmon", [_P]),
    ("Coho salmon (silver salmon)", "Coho salmon", [_P]),
    ("Leopard shark", "Leopard shark", [_P, _PS]),
    ("Bat ray", "Bat ray", [_P, _PS]),
    ("Pacific mackerel (chub mackerel)", "Pacific mackerel", [_P, _PS]),
    ("Spotfin croaker", "Spotfin croaker", [_PS]),
    ("Kelp bass (calico bass)", "Kelp bass (calico bass)", [_PS]),
    ("Sand bass (barred sand bass)", "Barred sand bass", [_PS]),
    ("Spotted sand bass", "Spotted sand bass", [_PS]),
    ("California sheephead", "California sheephead", [_PS]),
    ("Opaleye", "Opaleye", [_PS]),
    ("Halfmoon (Catalina perch)", "Halfmoon", [_PS]),
    ("Jack mackerel (Spanish jack)", "Jack mackerel", [_PS]),
    ("Pacific barracuda (California barracuda)", "Pacific barracuda", [_PS]),
    ("Pacific bonito", "Pacific bonito", [_PS]),
    ("Yellowtail (California yellowtail)", "Yellowtail", [_PS]),
    ("Queenfish", "Queenfish", [_PS]),
    ("Sargo", "Sargo", [_PS]),
    ("Shovelnose guitarfish", "Shovelnose guitarfish", [_PS]),
    ("Round stingray", "Round stingray", [_PS]),
    # Hawaii
    ("Bluefin trevally (omilu)", "Omilu (bluefin trevally)", [_H]),
    ("Menpachi (soldierfish)", "Menpachi", [_H]),
    ("Aholehole (Hawaiian flagtail)", "Aholehole", [_H]),
    ("Weke (goatfish)", "Weke (goatfish)", [_H]),
    ("Akule (bigeye scad)", "Akule", [_H]),
    ("Opelu (mackerel scad)", "Opelu", [_H]),
    ("Taape (bluestripe snapper)", "Ta'ape", [_H]),
    ("Toau (blacktail snapper)", "To'au", [_H]),
    ("Uku (gray snapper / jobfish)", "Uku", [_H]),
    ("Kaku (barracuda)", "Kaku (barracuda)", [_H]),
    ("Nenue (Hawaiian chub)", "Nenue", [_H]),
    ("Kala (unicornfish)", "Kala", [_H]),
    ("Manini (convict tang)", "Manini", [_H]),
    ("Uhu (parrotfish)", "Uhu (parrotfish)", [_H]),
    ("Amaama (striped mullet, Hawaii)", "Ama'ama (mullet)", [_H]),
    ("Mu (bigeye emperor)", "Mu", [_H]),
    ("Roi (peacock grouper)", "Roi", [_H]),
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


_TEXT_FIELDS = {
    "bait",
    "rig",
    "hook_size",
    "sinker",
    "lures",
    "explanation_cold",
    "explanation_warm",
}


def _slug(name: str) -> str:
    return (
        name.lower()
        .replace("'", "")
        .replace("(", "")
        .replace(")", "")
        .replace(",", "")
        .replace("/", "")
        .replace(" ", "-")
        .replace("--", "-")
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
        # A few legacy entries leave a text field empty (null): store "".
        record.update(
            {
                field: entry[field] or "" if field in _TEXT_FIELDS else entry[field]
                for field in _COPIED_FIELDS
            }
        )
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
