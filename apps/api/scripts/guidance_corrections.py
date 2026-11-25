"""Real-world corrections applied on top of the legacy species dataset by
`scripts/generate_guidance_catalogue.py`.

The legacy dataset is provisional (docs/CANONICAL_ROADMAP.md). Fish the
generator didn't hand-pick get their regions guessed from their
survivable water-temperature range and are tagged `shore` by default,
which put deep-water groupers in New England, billfish and aquarium reef
fish in "What's biting" for beach anglers, and federally protected sharks
in front of everyone. These tables fix what a check against real fishing
seasons, ranges and rules turned up. Each entry says why.

Keyed by catalogue id (stable slugs). Values replace the generated
fields outright.
"""

from __future__ import annotations

from typing import Any

_N, _M, _S, _G = "atlantic_north", "atlantic_mid", "atlantic_south", "gulf"
_P, _PS, _H = "pacific", "pacific_south", "hawaii_conditions"

# Not in US waters, or a duplicate of another entry: left out entirely.
SKIP_IDS = {
    "longtail-tuna",  # Indo-Pacific; not caught off Florida or the Gulf.
    "oio-bonefish-hawaii",  # Same fish as `oio-bonefish`.
}

# Possession prohibited (federal Atlantic HMS prohibited-shark list, NOAA
# Greater Atlantic prohibitions, ESA listings, state no-take rules): listed
# in the Fish guide with a release message, never suggested as a pick.
PROTECTED_IDS = {
    "sandbar-shark",  # Federal recreational prohibition since 2008.
    "brown-shark-sandbar",  # Same fish (brown shark = sandbar shark).
    "dusky-shark",
    "sand-tiger-shark",
    "atlantic-angel-shark",
    "caribbean-reef-shark",
    "nassau-grouper",  # No harvest in federal or Florida waters.
    "atlantic-wolffish",  # Possession prohibited in federal waters.
    "ocean-pout",  # Possession prohibited in federal waters.
    "green-sturgeon",  # ESA threatened; no take.
    "cowcod",  # Retention prohibited in California.
    "yelloweye-rockfish",  # Retention prohibited in CA, OR and WA.
}

# Offshore, deep-water or reef fish reached by boat, not from the beach,
# pier or jetty the `shore` tag promises.
_BOAT = [
    "longbill-spearfish",
    "pacific-bluefin-tuna",
    "pacific-sailfish",
    "oceanic-bonito",
    "porbeagle-shark",
    "blue-shark",
    "humboldt-squid",
    "goosefish-monkfish",
    "white-hake",
    "offshore-hake",
    "witch-flounder",
    "american-plaice",
    "greenland-halibut-turbot",
    "goldface-tilefish",
    "blackline-tilefish",
    "gray-tilefish",
    "sand-tilefish",
    "yelloweye-snapper",
    "wenchman-snapper",
    "longspine-porgy",
    "knobbed-porgy",
    "whitebone-porgy",
    "bigeye-priacanthus-arenatus",
    "short-bigeye",
    "red-hind",
    "rock-hind",
    "yellowmouth-grouper",
    "tiger-grouper",
    "kitty-mitchell-yellowfin-grouper",
    "warsaw-grouper",
    "queen-triggerfish",
    "banded-rudderfish",
    "greenspotted-rockfish",
    "sharpchin-rockfish",
    "redbanded-rockfish",
    "darkblotched-rockfish",
    "pacific-grenadier",
    "swordspine-rockfish",
    "stripetail-rockfish",
    "halfbanded-rockfish",
    "honeycomb-rockfish",
    "speckled-rockfish",
    "squarespot-rockfish",
    "shortbelly-rockfish",
    "arrowtooth-flounder",
    "yellowfin-sole",
    "flathead-sole",
]

# Not a hook-and-line pick: aquarium-sized reef fish, nuisance catches,
# lampreys, juveniles/duplicates, and shellfish taken by trap or by hand.
_INCIDENTAL = [
    "blue-tang-surgeonfish",
    "doctorfish-tang",
    "ocean-surgeon",
    "gray-angelfish",
    "french-angelfish",
    "queen-angelfish",
    "rock-beauty",
    "foureye-butterflyfish",
    "banded-butterflyfish",
    "reef-butterflyfish",
    "yellowhead-wrasse",
    "bluehead-wrasse",
    "clown-wrasse",
    "creole-wrasse",
    "yellowtail-damselfish",
    "sergeant-major-damselfish",
    "jackknife-fish",
    "highhat",
    "butter-hamlet",
    "mutton-hamlet",
    "cardinal-soldierfish",
    "reef-squirrelfish",
    "longspine-squirrelfish",
    "glasseye-snapper",
    "sargassumfish",
    "flying-gurnard",
    "shortnose-batfish",
    "striped-blenny",
    "feather-blenny",
    "skilletfish",
    "honeycomb-cowfish",
    "scrawled-cowfish",
    "smooth-trunkfish",
    "midnight-parrotfish",
    "stoplight-parrotfish",
    "greater-soapfish",
    "striped-cusk-eel",
    "remora-sharksucker",
    "sharksucker-whitefin",
    "pilotfish",
    "northern-pipefish",
    "gulf-pipefish",
    "atlantic-torpedo-ray",
    "pacific-electric-ray",
    "sea-lamprey-anadromous",
    "pacific-lamprey",
    "barndoor-skate",
    "black-snapper-black-sea-bass-juvenile",
    "tilefish-blueline-juvenilegrey",
    "stone-crab",
    "american-lobster-recreational",
    "jonah-crab",
    "shrimp-spot-prawn-pacific",
]

FIELD_CORRECTIONS: dict[str, dict[str, Any]] = {
    **{species_id: {"access": "boat"} for species_id in _BOAT},
    **{species_id: {"access": "incidental"} for species_id in _INCIDENTAL},
    # --- Where they live -------------------------------------------------
    # Deep-water groupers/snappers of the South Atlantic and Gulf; the
    # temperature-range guess put them off New England and Maryland.
    "snowy-grouper": {"regions": [_M, _S, _G]},
    "misty-grouper": {"regions": [_S, _G]},
    "queen-snapper": {"regions": [_S, _G]},
    "yellowedge-grouper": {"regions": [_S, _G]},
    "wreckfish": {"regions": [_S]},  # Blake Plateau, off SC/GA.
    "blueline-tilefish": {"regions": [_M, _S, _G]},
    # Warsaw grouper: no harvest in South Atlantic federal waters; one
    # per vessel in the Gulf.
    "warsaw-grouper": {"access": "boat", "regions": [_G]},
    # Black marlin is an Indo-Pacific fish (Hawaii), not a Gulf Stream one.
    "black-marlin": {"regions": [_H]},
    # Pelagics missing their best-known US fisheries.
    "white-marlin": {"regions": [_M, _S, _G]},  # Ocean City, MD.
    "blue-marlin": {"regions": [_M, _S, _G, _H]},  # Outer Banks, Kona.
    "mahi-mahi-dolphinfish": {"regions": [_M, _S, _G, _PS, _H]},
    "wahoo": {"regions": [_M, _S, _G, _H]},  # Ono.
    "yellowfin-tuna": {"regions": [_M, _S, _G, _PS, _H]},  # Ahi.
    "bigeye-tuna": {
        "regions": [_M, _H],  # Mid-Atlantic canyons; Hawaii ahi.
        "peak_months": [6, 7, 8, 9, 10],
        "good_months": [5, 11],
    },
    "albacore-tuna": {
        "regions": [_N, _M, _P, _PS],  # And the big West Coast fishery.
        "peak_months": [7, 8, 9, 10],
        "good_months": [6, 11],
    },
    # Bluefin: Gulf of Maine/Cape Cod is the main fishery; Gulf of Mexico
    # bluefin may not be targeted.
    "atlantic-bluefin-tuna": {"regions": [_N, _M]},
    "shortfin-mako-shark": {"regions": [_N, _M, _S, _PS]},
    "thresher-shark": {"regions": [_N, _M, _PS]},
    "blue-shark": {"access": "boat", "regions": [_N, _M, _PS]},
    "swordfish": {"regions": [_M, _S, _G, _PS]},
    # Invasive in Chesapeake/Delaware and southern rivers, not New England.
    "blue-catfish": {"regions": [_M, _S, _G]},
    "flathead-catfish": {"regions": [_M, _S, _G]},
    # A river fish, caught from the bank (tidal), not offshore.
    "steelhead-trout-sea-run-rainbow": {"access": "tidal"},
    # --- Water temperature: staples that bite all summer -----------------
    # Gulf and Florida water runs 85-88F in summer; these fish are the
    # summer bread and butter there (and striped bass all summer in New
    # England and the Chesapeake), but their legacy maximums dropped them.
    "red-drum": {"temp_ideal_high": 85, "temp_max": 92},
    "speckled-trout": {"temp_ideal_high": 85, "temp_max": 92},
    "black-drum": {"temp_max": 90},
    "sheepshead": {"temp_max": 88},
    "southern-flounder": {"temp_max": 88},
    "gulf-flounder": {"temp_max": 88},
    "whiting-sea-mullet": {"temp_max": 88},
    "atlantic-croaker": {"temp_max": 90},
    "pompano": {"temp_max": 89},
    "mangrove-snapper": {"temp_max": 92},
    "striped-bass": {"temp_ideal_high": 68, "temp_max": 78},
    # Southeast Florida's winter sailfish run (Dec-Mar, with the months in
    # app/data/regional_seasons.json) happens in 72-75F water.
    "sailfish": {"temp_min": 68, "temp_ideal_low": 72},
    # --- Hawaii closed seasons (DAR) --------------------------------------
    "moi": {
        "peak_months": [9, 10],
        "good_months": [4, 5, 11],
        "closed_months": [6, 7, 8],
    },
    "amaama-mullet": {
        "peak_months": [10, 11],
        "good_months": [4, 5, 6, 7, 8, 9],
        "closed_months": [12, 1, 2, 3],
    },
}

# Regulation snapshot fixes: state -> catalogue id -> fields.
# `closed_periods` ("MM-DD" start/end, inclusive, may wrap the new year)
# drive the "closed to harvest" flag on picks (Regulation.closed_now).
_FL_FLOUNDER = {
    "min_size": "14 in TL",
    "bag_limit": "5 per day",
    "season": "Closed October 15 through November 30",
    "notes": "One rule for every flounder species in Florida (FWC, since "
    "2021). Verify current rules with FWC.",
    "closed_periods": [["10-15", "11-30"]],
}
REGULATION_CORRECTIONS: dict[str, dict[str, dict[str, Any]]] = {
    # Legacy rows still showed the pre-2021 12 in / 10 per day rules.
    "FL": {"southern-flounder": _FL_FLOUNDER, "gulf-flounder": _FL_FLOUNDER},
    "TX": {
        "southern-flounder": {
            "min_size": "15 in TL",
            "bag_limit": "5 per day",
            "season": "Closed October 15 through November 30",
            "notes": "Fall closure protects spawning flounder. Verify current "
            "dates with TPWD.",
            "closed_periods": [["10-15", "11-30"]],
        },
    },
    "HI": {
        "moi": {
            "min_size": '11"',
            "bag_limit": "15",
            "season": "Closed June through August",
            "closed_periods": [["06-01", "08-31"]],
            "notes": "Closed season protects spawning moi. Some areas "
            "(fishponds, reserves) have extra rules; check DAR.",
        },
        "amaama-mullet": {
            "min_size": '11"',
            "bag_limit": "No limit",
            "season": "Closed December through March",
            "closed_periods": [["12-01", "03-31"]],
            "notes": "Closed season protects spawning ama'ama.",
        },
    },
}


def apply(species: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """*species* without SKIP_IDS, with PROTECTED_IDS and
    FIELD_CORRECTIONS applied. Fails loudly on an unknown id, so a
    renamed slug can't silently drop a correction."""
    ids = {str(record["id"]) for record in species}
    named = SKIP_IDS | PROTECTED_IDS | set(FIELD_CORRECTIONS)
    unknown = sorted(named - ids)
    if unknown:
        raise SystemExit(f"guidance_corrections: unknown species ids {unknown}")
    kept = [record for record in species if record["id"] not in SKIP_IDS]
    for record in kept:
        record.update(FIELD_CORRECTIONS.get(str(record["id"]), {}))
        if record["id"] in PROTECTED_IDS:
            record["access"] = "protected"
    return kept
