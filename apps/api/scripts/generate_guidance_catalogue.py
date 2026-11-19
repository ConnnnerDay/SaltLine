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
import re
from pathlib import Path
from typing import Any

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
_BAITS_OUT_PATH = _API_ROOT.parent / "web" / "lib" / "baits.json"
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


_QUALIFIERS = r"(small|large|adult|juvenile|school|pier|shore|surf|flats|tidal|inshore|nearshore|offshore|early season|winter|gigging|sport|harvest|common|catch-and-release|catch-release|invasive|sea-run|summer run|daytime deep-drop|charter|large bull|slot size|near-pier|anadromous)"
_ALIASES = {
    "fluke": "flounder",
    "summer flounder": "flounder",
    "redfish": "red drum",
    "spotted seatrout": "speckled trout",
    "weakfish": "weakfish",
    "gray trout": "weakfish",
    "delaware bay weakfish": "weakfish",
    "florida pompano": "pompano",
    "atlantic spanish mackerel": "spanish mackerel",
    "dolphinfish": "mahi-mahi",
    "dorado": "mahi-mahi",
    "california corbina": "corbina",
    "pacific yellowtail": "yellowtail",
    "yellowtail amberjack": "yellowtail",
    "kingfish": "whiting",
    "crevalle jack": "jack crevalle",
    "bonito": "atlantic bonito",
    "atlantic blacktip shark": "blacktip shark",
    "pufferfish": "northern puffer",
    "oio": "o'io",
    "common snook": "snook",
    "pileperch": "pile perch",
    "rubberlip perch": "rubberlip seaperch",
    "rubberlip surfperch": "rubberlip seaperch",
    "halfmoon perch": "halfmoon",
    "pacific jack mackerel": "jack mackerel",
    "menhaden": "atlantic menhaden",
    "graysby grouper": "graysby",
    "coney grouper": "coney",
    "rock hind grouper": "rock hind",
    "striped surfperch": "striped seaperch",
    "surfperch": "shiner perch",
    "boston mackerel": "atlantic mackerel",
    "gray snapper": "mangrove snapper",
    "steelhead": "steelhead trout",
    "olympic peninsula steelhead": "steelhead trout",
    "skeena steelhead": "steelhead trout",
    "pacific whiting": "pacific hake",
    "puget sound king salmon": "chinook salmon",
    "halibut": "pacific halibut",
    "yellowjack": "yellow jack",
    "atlantic blue marlin": "blue marlin",
    "skipjack": "skipjack tuna",
    "spot croaker": "spot",
    "hybrid striped bass": "striped bass",
    "sea bream": "pinfish",
    "bergall": "cunner",
    "tog": "tautog",
    "rockfish": "black rockfish",
    "albacore": "albacore tuna",
    "longfin albacore": "albacore tuna",
    "atlantic bluefin tuna": "bluefin tuna",
    "mangrove red snapper": "mangrove snapper",
    "speckled sand dab": "speckled sanddab",
    "pacific sand dab": "pacific sanddab",
    "ulua": "giant trevally",
    "omilu": "bluefin trevally",
    "papio": "papio",
    "nenue": "nenue",
    "uku": "uku",
    "kaku": "kaku",
    "weke": "weke",
    "mu": "mu",
    "nairagi": "striped marlin",
    "kahala": "greater amberjack",
    "lehi": "lehi",
    "permit": "permit",
    "bonefish": "bonefish",
    "tarpon": "tarpon",
    "snook": "snook",
    "cobia": "cobia",
    "wahoo": "wahoo",
    "sailfish": "sailfish",
    "mako shark": "shortfin mako shark",
    "broadnose sevengill shark": "sevengill shark",
    "puget sound coho": "coho salmon",
    "columbia river spring chinook": "chinook salmon",
    "sacramento river fall chinook": "chinook salmon",
    "klamath river fall chinook": "chinook salmon",
    "atlantic tripletail": "tripletail",
    "atlantic pollock": "pollock",
    "soupfin shark": "tope shark",
    "green moray": "green moray eel",
    "spotted moray": "spotted moray eel",
    "puddingwife wrasse": "puddingwife",
    "sailors choice": "sailor's choice grunt",
    "sailor grunt": "sailor's choice grunt",
    "crab harvest": "stone crab",
    "spotted eagle ray": "eagle ray",
    "treefish rockfish": "treefish",
    "bluestriped grunt": "blue-striped grunt",
    "ocean surgeonfish": "ocean surgeon",
    "burfish": "striped burrfish",
    "pacific crevalle jack": "jack crevalle (pacific)",
    "yellowfin grouper": "kitty mitchell",
    "chub mackerel": "pacific mackerel",
    "alaska pollock": "walleye pollock",
    "silver hake": "silver hake",
    "white hake": "white hake",
}


def _fish_key(name: str) -> str:
    """A fish's dedupe key: its name without parenthetical notes or
    size/place qualifiers, then mapped through _ALIASES."""
    text = name.lower()
    paren = re.findall(r"\(([^)]*)\)", text)
    text = re.sub(r"\s*\([^)]*\)\s*", " ", text)
    text = re.sub(rf"\b{_QUALIFIERS}\b", " ", text)
    text = re.sub(r"\s+", " ", text).strip(" -")
    if text in _ALIASES:
        return _ALIASES[text]
    # "Oio (bonefish, Hawaii)" / "Redfish (red drum) juvenile": try the note.
    for note in paren:
        note = note.split(",")[0].strip()
        if note in _ALIASES:
            return _ALIASES[note]
    return text


# Not fish anyone targets (or not a catch at all): never added.
_SKIP = {"Northern sea cucumber", "Blood worm (tidal)", "Crab (stone) harvest"}
# Freshwater fish that also turn up in tidal creeks and rivers.
_TIDAL = re.compile(
    r"bass \(tidal\)|largemouth|bluegill|warmouth|redear|catfish|\bgar\b|pickerel|bowfin|"
    r"walleye \(coastal\)|yellow perch|freshwater drum|tilapia|channel|blue catfish|flathead catfish",
    re.IGNORECASE,
)
# Bait fish: caught for bait (sabiki, cast net), never a "what's biting" pick.
_BAIT = re.compile(
    r"menhaden|herring|anchov|sardine|silverside|killifish|mummichog|ballyhoo|halfbeak|scad|saury|"
    r"eulachon|bumper|alewife|blueback|thread herring|shad \(tidal\)|gizzard shad|bay anchovy|"
    r"butterfish|harvestfish|pacific saury",
    re.IGNORECASE,
)
_NOT_A_TARGET = re.compile(
    r"not a hook-and-line target|do not target|not a target", re.IGNORECASE
)


def _access(entry: dict[str, Any], boat: set[str], nuisance: set[str]) -> str:
    """Who a fish is a "what's biting" pick for: shore (everyone), boat
    (inshore/offshore boat anglers), tidal (kayak/wade/bridge/boat), or
    incidental (bait fish, nuisance fish and non-targets: listed, never
    picked)."""
    name = entry["name"]
    if (
        _NOT_A_TARGET.search(f"{entry['rig']} {entry['bait']}")
        or _BAIT.search(name)
        or name in nuisance
    ):
        return "incidental"
    if name in boat:
        return "boat"
    if _TIDAL.search(name):
        return "tidal"
    return "shore"


def _auto_regions(entry: dict[str, Any]) -> list[str]:
    """Regions for a fish with no hand-picked ones: its legacy coast, split
    by its survivable water-temperature range and any place in its name.
    (The temperature-fit scoring then does the fine filtering.)"""
    name = entry["name"].lower()
    low, high = entry["temp_min"], entry["temp_max"]
    if entry["coast"] == "hawaii":
        return [_H]
    if entry["coast"] == "west":
        if re.search(r"california|socal|catalina|baja", name):
            return [_PS] if low >= 54 else [_P, _PS]
        if re.search(
            r"alaska|puget|columbia|olympic|skeena|oregon|klamath|sacramento|arctic|washington",
            name,
        ):
            return [_P]
        if low >= 60:
            return [_PS]
        if high <= 62:
            return [_P]
        return [_P, _PS]
    if "gulf" in name:
        return [_G]
    if re.search(r"chesapeake|delaware|hudson|new england|ne pier|maine", name):
        return [_N, _M]
    if re.search(r"florida|caribbean|keys", name) or low >= 66:
        return [_S, _G]
    if high <= 66:
        return [_N]
    if high <= 75:
        return [_N, _M]
    if low <= 52:
        return [_N, _M, _S, _G]
    return [_M, _S, _G]


def _legacy_value(module: Path, name: str) -> Any:
    """A module-level constant from a legacy module, read from its source
    without running the module: literals, plus the `list(range(...))` the
    legacy bait table uses. Nothing else is callable."""
    tree = ast.parse(module.read_text())
    for node in tree.body:
        if isinstance(node, ast.AnnAssign):
            targets: list[ast.expr] = [node.target]
        elif isinstance(node, ast.Assign):
            targets = node.targets
        else:
            continue
        if node.value is None or not any(getattr(t, "id", "") == name for t in targets):
            continue
        # Repo source, evaluated with no builtins but list/range.
        return eval(
            compile(ast.Expression(body=node.value), str(module), "eval"),
            {"__builtins__": {}, "list": list, "range": range},
        )
    raise RuntimeError(f"{name} not found in {module}")


_SEASON_MONTHS = {
    "winter": [12, 1, 2],
    "spring": [3, 4, 5],
    "summer": [6, 7, 8],
    "fall": [9, 10, 11],
}
# The legacy shop-bait table has no coast; these are the non-East ones.
_BAIT_COAST = {
    "Live or frozen anchovy": "west",
    "Live sardine": "west",
    "Ghost shrimp / mud shrimp": "west",
    "Live opelu or squid (ika)": "hawaii",
    "Squid strips": "all",
    "Cut squid strips": "all",
    "Fresh shrimp pieces": "all",
    "Fishbites (artificial strips)": "all",
}


def _write_bait_guide() -> None:
    """apps/web/lib/baits.json: the legacy bait tables (BAIT_DB, the tackle
    shop baits with seasonal notes and target fish; NATURAL_BAIT_DB, what's
    in the water to catch or gather by coast and month) for the web app's
    "Bait this month"."""
    baits = []
    for entry in _legacy_value(_LEGACY_SPECIES_MODULE, "BAIT_DB"):
        seasonal = [
            {"months": _SEASON_MONTHS[season], "note": note}
            for season, note in (entry.get("notes_seasonal") or {}).items()
            if season in _SEASON_MONTHS
        ]
        baits.append(
            {
                "name": entry["bait"],
                "kind": "shop",
                "coast": _BAIT_COAST.get(entry["bait"], "east"),
                "months": entry["available_months"],
                "note": entry["notes"],
                "seasonal_notes": seasonal,
                "targets": entry.get("targets", []),
            }
        )
    for entry in _legacy_value(_LEGACY_SPECIES_MODULE, "NATURAL_BAIT_DB"):
        baits.append(
            {
                "name": entry["name"],
                "kind": "natural",
                "coast": "all" if entry["coast"] == "both" else entry["coast"],
                "months": entry["months"],
                "note": entry["note"],
                "seasonal_notes": [],
                "targets": [],
            }
        )
    payload = {
        "_comment": (
            "Generated by apps/api/scripts/generate_guidance_catalogue.py from the "
            "legacy domain/species.py BAIT_DB and NATURAL_BAIT_DB. Regenerate "
            "rather than hand-edit."
        ),
        "baits": baits,
    }
    _BAITS_OUT_PATH.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n")


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
        record["access"] = "shore"
        species.append(record)

    # Every other legacy fish, once each: variants of a fish already in
    # ("Bluefish (small)", "Redfish (surf)") merge into it, and protected /
    # encounter-only species (the legacy "excluded" list) are left out.
    classifications = json.loads(_LEGACY_CLASSIFICATIONS.read_text())
    excluded = set(classifications["excluded"]) | _SKIP
    boat = set(classifications["fishing_type"]["offshore_only"]) | set(
        classifications["fishing_type"]["charter"]
    )
    picked = {str(r["legacy_name"]) for r in species}
    seen = {_fish_key(str(r[k])) for r in species for k in ("name", "legacy_name")}
    ids = {str(r["id"]) for r in species}
    for legacy_name, entry in legacy.items():
        if legacy_name in excluded or legacy_name in picked:
            continue
        fish = _fish_key(legacy_name)
        if fish in seen:
            continue
        seen.add(fish)
        species_id = _slug(legacy_name)
        while species_id in ids:
            species_id += "-2"
        ids.add(species_id)
        record = {
            "id": species_id,
            "name": legacy_name,
            "legacy_name": legacy_name,
            "regions": _auto_regions(entry),
        }
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
        record["access"] = _access(entry, boat, set(classifications["nuisance"]))
        species.append(record)

    # Spawning (legacy SPAWNING_DATA), matched to each fish by name.
    by_key: dict[str, dict[str, object]] = {}
    for record in species:
        for key in (record["name"], record["legacy_name"]):
            by_key.setdefault(_fish_key(str(key)), record)
    for spawn in _legacy_value(_LEGACY_SPECIES_MODULE, "SPAWNING_DATA"):
        match = by_key.get(_fish_key(spawn["name"]))
        if match is not None and "spawn" not in match:
            match["spawn"] = {
                "months": spawn["spawn_months"],
                "temp_low": spawn["spawn_temp_low"],
                "temp_high": spawn["spawn_temp_high"],
                "note": spawn["spawn_note"],
            }

    payload = {
        "_comment": (
            "Fishing-guidance catalogue: hand-picked shore targets first, then "
            "every other legacy fish once (variants merged, protected species "
            "left out), region-gated by conditions_region and tagged with "
            "access (shore/boat/tidal/incidental). Every field except "
            "id/name/regions/access is copied verbatim from the legacy "
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
    _write_bait_guide()


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
    states: dict[str, dict[str, dict[str, str | None]]] = {}
    for state, entries in legacy["states"].items():
        for record in species:
            legacy_name = str(record["legacy_name"])
            key = name_map.get(legacy_name, legacy_name)
            if key in entries:
                # Text fields only: a few legacy entries hold bare numbers.
                states.setdefault(state, {})[str(record["id"])] = {
                    field: None if value is None else str(value)
                    for field, value in entries[key].items()
                }
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
