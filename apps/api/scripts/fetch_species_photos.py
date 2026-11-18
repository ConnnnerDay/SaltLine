"""Download one photo per guidance-catalogue species (restored "species
photos" from the original app).

Each species maps to a hand-picked English Wikipedia article. The script
takes that article's lead image, looks its license and author up on
Wikimedia Commons, keeps it only if the license is free (Creative Commons
or public domain), and saves a 480px-wide JPEG into apps/web/public/species/,
plus apps/web/lib/species-photos.json with the credit, license and source
page the web app must show next to each photo. (The license lookup goes
through en.wikipedia.org's API, which serves Commons file metadata too.)

Photos are committed and served by the site itself: nothing is hotlinked
at view time, so the site's self-only CSP stays intact and photos keep
working if Wikimedia is unreachable.

Run from apps/api with a Python that has Pillow (needs network access to
en.wikipedia.org and upload.wikimedia.org):

    python3 -m scripts.fetch_species_photos

`--trim-existing` only re-trims letterbox borders on the committed photos.
`--inat` fills in species still missing a photo from iNaturalist instead
(api.inaturalist.org, by exact scientific name, Creative Commons photos
only, credited the same way) -- for fish Wikipedia has no free lead image
for, or while Wikimedia is rate-limiting.
"""

from __future__ import annotations

import html
import io
import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

# Pillow resizes locally; it's a one-off dev dependency, not in requirements.
from PIL import Image  # type: ignore[import-not-found,unused-ignore]

_API_ROOT = Path(__file__).resolve().parent.parent
_CATALOGUE = _API_ROOT / "app" / "data" / "guidance_species.json"
_WEB_ROOT = _API_ROOT.parent / "web"
_PHOTO_DIR = _WEB_ROOT / "public" / "species"
_MANIFEST = _WEB_ROOT / "lib" / "species-photos.json"
_WIDTH = 480  # px, resized locally
_USER_AGENT = "SaltlineSpeciesPhotos/1.0 (self-hosted fishing forecast; one-off fetch)"

# Catalogue id -> English Wikipedia article.
ARTICLES: dict[str, str] = {
    "red-drum": "Red_drum",
    "black-drum": "Black_drum",
    "bluefish": "Bluefish",
    "speckled-trout": "Spotted_seatrout",
    "whiting-sea-mullet": "Southern_kingfish",
    "spot": "Spot_croaker",
    "atlantic-croaker": "Atlantic_croaker",
    "sheepshead": "Archosargus_probatocephalus",
    "flounder": "Summer_flounder",
    "pompano": "Florida_pompano",
    "spanish-mackerel": "Atlantic_Spanish_mackerel",
    "snook": "Common_snook",
    "striped-bass": "Striped_bass",
    "tautog": "Tautog",
    "black-sea-bass": "Black_sea_bass",
    "barred-surfperch": "Barred_surfperch",
    "redtail-surfperch": "Redtail_surfperch",
    "california-halibut": "California_halibut",
    "corbina": "California_corbina",
    "yellowfin-croaker": "Yellowfin_croaker",
    "black-rockfish": "Black_rockfish",
    "lingcod": "Lingcod",
    "ulua-giant-trevally": "Giant_trevally",
    "papio": "Bluefin_trevally",
    "oio-bonefish": "Albula_vulpes",
    "moi": "Polydactylus_sexfilis",
    "weakfish-gray-trout": "Weakfish",
    "scup-porgy": "Scup",
    "winter-flounder": "Winter_flounder",
    "atlantic-mackerel": "Atlantic_mackerel",
    "false-albacore": "Little_tunny",
    "atlantic-bonito": "Atlantic_bonito",
    "northern-kingfish": "Northern_kingfish",
    "cunner-bergall": "Cunner",
    "pollock": "Pollachius_virens",
    "white-perch": "White_perch",
    "hickory-shad": "Hickory_shad",
    "american-eel": "American_eel",
    "northern-puffer-blowfish": "Northern_puffer",
    "sea-robin": "Prionotus_carolinus",
    "smooth-dogfish": "Smooth_dogfish",
    "spiny-dogfish": "Spiny_dogfish",
    "clearnose-skate": "Clearnose_skate",
    "cobia": "Cobia",
    "king-mackerel": "King_mackerel",
    "atlantic-spadefish": "Atlantic_spadefish",
    "gray-triggerfish": "Grey_triggerfish",
    "southern-flounder": "Southern_flounder",
    "gulf-flounder": "Gulf_flounder",
    "southern-kingfish": "Menticirrhus_americanus",
    "gulf-kingfish": "Gulf_kingfish",
    "silver-perch": "Bairdiella_chrysoura",
    "sand-seatrout-white-trout": "Sand_seatrout",
    "silver-seatrout": "Cynoscion_nothus",
    "pinfish": "Pinfish",
    "mangrove-snapper": "Mangrove_red_snapper",
    "jack-crevalle": "Crevalle_jack",
    "blue-runner": "Blue_runner",
    "ladyfish": "Elops_saurus",
    "tarpon": "Atlantic_tarpon",
    "tripletail": "Atlantic_tripletail",
    "permit": "Permit_(fish)",
    "lookdown": "Lookdown",
    "great-barracuda": "Great_barracuda",
    "bonefish": "Albula_vulpes",
    "sand-perch": "Diplectrum_formosum",
    "tomtate": "Tomtate_grunt",
    "oyster-toadfish": "Oyster_toadfish",
    "atlantic-sharpnose-shark": "Atlantic_sharpnose_shark",
    "sandbar-shark": "Sandbar_shark",
    "blacktip-shark": "Blacktip_shark",
    "spinner-shark": "Spinner_shark",
    "bonnethead-shark": "Bonnethead",
    "bull-shark": "Bull_shark",
    "atlantic-stingray": "Atlantic_stingray",
    "southern-stingray": "Southern_stingray",
    "cownose-ray": "Cownose_ray",
    "calico-surfperch": "Calico_surfperch",
    "walleye-surfperch": "Walleye_surfperch",
    "silver-surfperch": "Silver_surfperch",
    "rubberlip-seaperch": "Rubberlip_seaperch",
    "pile-perch": "Pile_perch",
    "striped-seaperch": "Striped_seaperch",
    "shiner-perch": "Shiner_perch",
    "black-perch": "Black_perch",
    "jacksmelt": "Jacksmelt",
    "white-croaker": "White_croaker",
    "starry-flounder": "Starry_flounder",
    "pacific-sanddab": "Pacific_sanddab",
    "kelp-greenling": "Kelp_greenling",
    "cabezon": "Cabezon_(fish)",
    "grass-rockfish": "Grass_rockfish",
    "blue-rockfish": "Blue_rockfish",
    "copper-rockfish": "Copper_rockfish",
    "monkeyface-prickleback": "Monkeyface_prickleback",
    "striped-bass-west-coast": "Striped_bass",
    "chinook-salmon": "Chinook_salmon",
    "coho-salmon": "Coho_salmon",
    "leopard-shark": "Leopard_shark",
    "bat-ray": "Bat_ray",
    "pacific-mackerel": "Chub_mackerel",
    "spotfin-croaker": "Spotfin_croaker",
    "kelp-bass-calico-bass": "Kelp_bass",
    "barred-sand-bass": "Barred_sand_bass",
    "spotted-sand-bass": "Spotted_sand_bass",
    "california-sheephead": "California_sheephead",
    "opaleye": "Opaleye",
    "halfmoon": "Medialuna_californiensis",
    "jack-mackerel": "Pacific_jack_mackerel",
    "pacific-barracuda": "Pacific_barracuda",
    "pacific-bonito": "Pacific_bonito",
    "yellowtail": "Seriola_dorsalis",
    "queenfish": "Seriphus_politus",
    "sargo": "Anisotremus_davidsonii",
    "shovelnose-guitarfish": "Shovelnose_guitarfish",
    "round-stingray": "Round_stingray",
    "omilu-bluefin-trevally": "Bluefin_trevally",
    "menpachi": "Myripristis_berndti",
    "aholehole": "Kuhlia_sandvicensis",
    "weke-goatfish": "Mulloidichthys_flavolineatus",
    "akule": "Selar_crumenophthalmus",
    "opelu": "Decapterus_macarellus",
    "taape": "Bluestripe_snapper",
    "toau": "Lutjanus_fulvus",
    "uku": "Green_jobfish",
    "kaku-barracuda": "Sphyraena_barracuda",
    "nenue": "Kyphosus_vaigiensis",
    "kala": "Naso_unicornis",
    "manini": "Convict_surgeonfish",
    "uhu-parrotfish": "Scarus_rubroviolaceus",
    "amaama-mullet": "Flathead_grey_mullet",
    "mu": "Monotaxis_grandoculis",
    "roi": "Peacock_grouper",
}


# Catalogue id -> scientific name, for the iNaturalist fallback (`--inat`):
# exact names, since common-name search there matches the wrong taxa.
SCIENTIFIC: dict[str, str] = {
    "redtail-surfperch": "Amphistichus rhodoterus",
    "weakfish-gray-trout": "Cynoscion regalis",
    "scup-porgy": "Stenotomus chrysops",
    "winter-flounder": "Pseudopleuronectes americanus",
    "atlantic-mackerel": "Scomber scombrus",
    "false-albacore": "Euthynnus alletteratus",
    "atlantic-bonito": "Sarda sarda",
    "northern-kingfish": "Menticirrhus saxatilis",
    "cunner-bergall": "Tautogolabrus adspersus",
    "pollock": "Pollachius virens",
    "white-perch": "Morone americana",
    "hickory-shad": "Alosa mediocris",
    "american-eel": "Anguilla rostrata",
    "northern-puffer-blowfish": "Sphoeroides maculatus",
    "sea-robin": "Prionotus carolinus",
    "smooth-dogfish": "Mustelus canis",
    "spiny-dogfish": "Squalus acanthias",
    "clearnose-skate": "Rostroraja eglanteria",
    "cobia": "Rachycentron canadum",
    "king-mackerel": "Scomberomorus cavalla",
    "atlantic-spadefish": "Chaetodipterus faber",
    "gray-triggerfish": "Balistes capriscus",
    "southern-flounder": "Paralichthys lethostigma",
    "gulf-flounder": "Paralichthys albigutta",
    "southern-kingfish": "Menticirrhus americanus",
    "gulf-kingfish": "Menticirrhus littoralis",
    "silver-perch": "Bairdiella chrysoura",
    "sand-seatrout-white-trout": "Cynoscion arenarius",
    "silver-seatrout": "Cynoscion nothus",
    "pinfish": "Lagodon rhomboides",
    "mangrove-snapper": "Lutjanus griseus",
    "jack-crevalle": "Caranx hippos",
    "blue-runner": "Caranx crysos",
    "ladyfish": "Elops saurus",
    "tarpon": "Megalops atlanticus",
    "tripletail": "Lobotes surinamensis",
    "permit": "Trachinotus falcatus",
    "lookdown": "Selene vomer",
    "great-barracuda": "Sphyraena barracuda",
    "bonefish": "Albula vulpes",
    "sand-perch": "Diplectrum formosum",
    "tomtate": "Haemulon aurolineatum",
    "oyster-toadfish": "Opsanus tau",
    "atlantic-sharpnose-shark": "Rhizoprionodon terraenovae",
    "sandbar-shark": "Carcharhinus plumbeus",
    "blacktip-shark": "Carcharhinus limbatus",
    "spinner-shark": "Carcharhinus brevipinna",
    "bonnethead-shark": "Sphyrna tiburo",
    "bull-shark": "Carcharhinus leucas",
    "atlantic-stingray": "Hypanus sabinus",
    "southern-stingray": "Hypanus americanus",
    "cownose-ray": "Rhinoptera bonasus",
    "calico-surfperch": "Amphistichus koelzi",
    "walleye-surfperch": "Hyperprosopon argenteum",
    "silver-surfperch": "Hyperprosopon ellipticum",
    "rubberlip-seaperch": "Rhacochilus toxotes",
    "pile-perch": "Rhacochilus vacca",
    "striped-seaperch": "Embiotoca lateralis",
    "shiner-perch": "Cymatogaster aggregata",
    "black-perch": "Embiotoca jacksoni",
    "jacksmelt": "Atherinopsis californiensis",
    "white-croaker": "Genyonemus lineatus",
    "starry-flounder": "Platichthys stellatus",
    "pacific-sanddab": "Citharichthys sordidus",
    "kelp-greenling": "Hexagrammos decagrammus",
    "cabezon": "Scorpaenichthys marmoratus",
    "grass-rockfish": "Sebastes rastrelliger",
    "blue-rockfish": "Sebastes mystinus",
    "copper-rockfish": "Sebastes caurinus",
    "monkeyface-prickleback": "Cebidichthys violaceus",
    "striped-bass-west-coast": "Morone saxatilis",
    "chinook-salmon": "Oncorhynchus tshawytscha",
    "coho-salmon": "Oncorhynchus kisutch",
    "leopard-shark": "Triakis semifasciata",
    "bat-ray": "Myliobatis californica",
    "pacific-mackerel": "Scomber japonicus",
    "spotfin-croaker": "Roncador stearnsii",
    "kelp-bass-calico-bass": "Paralabrax clathratus",
    "barred-sand-bass": "Paralabrax nebulifer",
    "spotted-sand-bass": "Paralabrax maculatofasciatus",
    "california-sheephead": "Bodianus pulcher",
    "opaleye": "Girella nigricans",
    "halfmoon": "Medialuna californiensis",
    "jack-mackerel": "Trachurus symmetricus",
    "pacific-barracuda": "Sphyraena argentea",
    "pacific-bonito": "Sarda chiliensis",
    "yellowtail": "Seriola dorsalis",
    "queenfish": "Seriphus politus",
    "sargo": "Anisotremus davidsonii",
    "shovelnose-guitarfish": "Pseudobatos productus",
    "round-stingray": "Urobatis halleri",
    "omilu-bluefin-trevally": "Caranx melampygus",
    "menpachi": "Myripristis berndti",
    "aholehole": "Kuhlia sandvicensis",
    "weke-goatfish": "Mulloidichthys flavolineatus",
    "akule": "Selar crumenophthalmus",
    "opelu": "Decapterus macarellus",
    "taape": "Lutjanus kasmira",
    "toau": "Lutjanus fulvus",
    "uku": "Aprion virescens",
    "kaku-barracuda": "Sphyraena barracuda",
    "nenue": "Kyphosus vaigiensis",
    "kala": "Naso unicornis",
    "manini": "Acanthurus triostegus",
    "uhu-parrotfish": "Scarus rubroviolaceus",
    "amaama-mullet": "Mugil cephalus",
    "mu": "Monotaxis grandoculis",
    "roi": "Cephalopholis argus",
}

_FREE_LICENSE = re.compile(r"^(cc[- ]|cc0|public domain|pd)", re.IGNORECASE)


def _fetch(url: str, attempts: int = 8) -> bytes:
    """GET with Wikimedia-friendly pacing: on 429/503, wait as long as the
    server's Retry-After asks (else a growing backoff), then retry."""
    for attempt in range(attempts):
        request = urllib.request.Request(url, headers={"User-Agent": _USER_AGENT})
        try:
            with urllib.request.urlopen(request, timeout=60) as response:
                return bytes(response.read())
        except urllib.error.HTTPError as exc:
            if exc.code not in (429, 503) or attempt == attempts - 1:
                raise
            retry_after = exc.headers.get("Retry-After", "")
            wait = int(retry_after) + 1 if retry_after.isdigit() else 10 * (attempt + 1)
            print(f"  rate-limited; waiting {wait}s")
            time.sleep(min(wait, 300))
    raise RuntimeError("unreachable")


def _get_json(url: str) -> Any:
    return json.loads(_fetch(url))


def _plain(text: str) -> str:
    """Commons metadata is HTML; keep the visible text only (and collapse
    the "Unknown authorUnknown author" doubling some templates produce)."""
    plain = re.sub(
        r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", "", text or ""))
    ).strip()
    half = len(plain) // 2
    if plain and len(plain) % 2 == 0 and plain[:half] == plain[half:]:
        plain = plain[:half]
    return plain


# Wikimedia asks bulk fetchers for its standard thumbnail widths
# (https://w.wiki/GHai) rather than originals; 1280 and 330 are on that
# list. 330 is the fallback for originals narrower than 1280.
_STANDARD_WIDTHS = (1280, 330)


def _standard_thumb(original_url: str, width: int) -> str:
    original_url = original_url.split("?", 1)[0]  # drop Commons' utm_* tracking query
    marker = "/wikipedia/commons/"
    head, _, rest = original_url.partition(marker)
    filename = rest.rsplit("/", 1)[-1]
    return f"{head}{marker}thumb/{rest}/{width}px-{filename}"


def _fetch_thumb(original_url: str) -> bytes:
    last: Exception | None = None
    for width in _STANDARD_WIDTHS:
        try:
            return _fetch(_standard_thumb(original_url, width))
        except urllib.error.HTTPError as exc:
            last = exc
    # Never falls back to the original: Wikimedia explicitly asks bulk
    # fetchers not to. A species without a standard thumbnail goes without.
    raise last or RuntimeError("no thumbnail")


_INAT_LICENSES = {
    "cc0": ("CC0", "https://creativecommons.org/publicdomain/zero/1.0/"),
    "cc-by": ("CC BY 4.0", "https://creativecommons.org/licenses/by/4.0/"),
    "cc-by-sa": ("CC BY-SA 4.0", "https://creativecommons.org/licenses/by-sa/4.0/"),
    "cc-by-nc": ("CC BY-NC 4.0", "https://creativecommons.org/licenses/by-nc/4.0/"),
    "cc-by-nc-sa": (
        "CC BY-NC-SA 4.0",
        "https://creativecommons.org/licenses/by-nc-sa/4.0/",
    ),
    "cc-by-nd": ("CC BY-ND 4.0", "https://creativecommons.org/licenses/by-nd/4.0/"),
    "cc-by-nc-nd": (
        "CC BY-NC-ND 4.0",
        "https://creativecommons.org/licenses/by-nc-nd/4.0/",
    ),
}


def _inat_credit(attribution: str) -> str:
    """iNaturalist's "(c) Jane, some rights reserved (CC BY-NC), uploaded by
    Jane" -> "Jane via iNaturalist" (the license is shown separately)."""
    match = re.match(
        r"^\(c\)\s*(.+?),\s*(?:some|no) rights reserved", _plain(attribution)
    )
    name = match.group(1) if match else _plain(attribution)
    return f"{name or 'A contributor'} via iNaturalist"


def _photo_from_inat(scientific: str) -> dict[str, str] | None:
    """The taxon's default photo on iNaturalist (api.inaturalist.org), when
    the taxon matches *scientific* exactly and the photo has a Creative
    Commons license. Used for species Wikipedia can't supply (or while
    Wikimedia is rate-limiting)."""
    query = urllib.parse.urlencode({"q": scientific, "rank": "species", "per_page": 30})
    results = _get_json(f"https://api.inaturalist.org/v1/taxa?{query}")["results"]
    taxon = next(
        (
            t
            for t in results
            if scientific.lower()
            in (t.get("name", "").lower(), str(t.get("matched_term", "")).lower())
        ),
        None,
    )
    if not taxon:
        print(f"  skip {scientific}: no exact iNaturalist taxon")
        return None
    photo = taxon.get("default_photo") or {}
    if photo.get("license_code") not in _INAT_LICENSES:
        # The taxon's headline photo isn't openly licensed: take the first
        # of its other photos that is.
        detail = _get_json(f"https://api.inaturalist.org/v1/taxa/{taxon['id']}")[
            "results"
        ][0]
        photo = next(
            (
                entry["photo"]
                for entry in detail.get("taxon_photos", [])
                if entry.get("photo", {}).get("license_code") in _INAT_LICENSES
            ),
            {},
        )
    license_code = photo.get("license_code")
    if license_code not in _INAT_LICENSES or not photo.get("medium_url"):
        print(f"  skip {scientific}: no CC-licensed iNaturalist photo")
        return None
    license_name, license_url = _INAT_LICENSES[license_code]
    return {
        "image_url": str(photo["medium_url"]),
        "credit": _inat_credit(str(photo.get("attribution") or "")),
        "license": license_name,
        "license_url": license_url,
        "source_url": f"https://www.inaturalist.org/photos/{photo['id']}",
    }


def _photo_for(article: str) -> dict[str, str] | None:
    lead = _get_json(
        "https://en.wikipedia.org/w/api.php?"
        + urllib.parse.urlencode(
            {
                "action": "query",
                "format": "json",
                "prop": "pageimages",
                "piprop": "name",
                "redirects": 1,
                "titles": article.replace("_", " "),
            }
        )
    )
    page = next(iter(lead["query"]["pages"].values()))
    filename = page.get("pageimage")
    if not filename:
        print(f"  skip {article}: no lead image")
        return None
    query = urllib.parse.urlencode(
        {
            "action": "query",
            "format": "json",
            "prop": "imageinfo",
            "iiprop": "url|extmetadata",
            "titles": f"File:{filename}",
        }
    )
    # English Wikipedia's API answers for Commons ("shared") files too, with
    # the same license metadata, and rate-limits bulk clients far less.
    pages = _get_json(f"https://en.wikipedia.org/w/api.php?{query}")["query"]["pages"]
    info = next(iter(pages.values())).get("imageinfo", [{}])[0]
    meta = info.get("extmetadata", {})
    license_name = _plain(meta.get("LicenseShortName", {}).get("value", ""))
    if not _FREE_LICENSE.match(license_name) or "url" not in info:
        print(f"  skip {article}: license {license_name!r} isn't free")
        return None
    return {
        "image_url": info["url"],
        "credit": _plain(meta.get("Artist", {}).get("value", "")) or "Unknown author",
        "license": license_name,
        "license_url": _plain(meta.get("LicenseUrl", {}).get("value", "")),
        "source_url": info.get("descriptionurl", ""),
    }


def _trim_borders(image: Any) -> Any:
    """Crop solid letterbox bars (black or white edges baked into some
    Commons photos) so every photo fills its frame the same way. Leaves
    the image alone if trimming would remove more than 45% of it."""
    from PIL import ImageChops  # type: ignore[import-not-found,unused-ignore]

    corner = image.getpixel((0, 0))
    background = Image.new(image.mode, image.size, corner)
    diff = ImageChops.difference(image, background).convert("L")
    box = diff.point(lambda value: 255 if value > 24 else 0).getbbox()
    if not box:
        return image
    left, top, right, bottom = box
    kept = (right - left) * (bottom - top) / (image.width * image.height)
    return image.crop(box) if 0.55 <= kept < 0.99 else image


def _save_resized(data: bytes, target: Path) -> None:
    with Image.open(io.BytesIO(data)) as source:
        image = _trim_borders(source.convert("RGB"))
        if image.width > _WIDTH:
            image = image.resize((_WIDTH, round(image.height * _WIDTH / image.width)))
        image.save(target, "JPEG", quality=82, optimize=True, progressive=True)


def main() -> None:
    catalogue = json.loads(_CATALOGUE.read_text())["species"]
    _PHOTO_DIR.mkdir(parents=True, exist_ok=True)
    # Incremental: keep photos already fetched (pass --force to refetch all).
    force = "--force" in sys.argv
    inat = "--inat" in sys.argv
    if "--trim-existing" in sys.argv:
        for path in sorted(_PHOTO_DIR.glob("*.jpg")):
            with Image.open(path) as source:
                image = source.convert("RGB")
            trimmed = _trim_borders(image)
            if trimmed.size != image.size:
                trimmed.save(path, "JPEG", quality=82, optimize=True, progressive=True)
                print(f"  trimmed {path.name}: {image.size} -> {trimmed.size}")
        return
    manifest: dict[str, dict[str, str]] = (
        {} if force or not _MANIFEST.exists() else json.loads(_MANIFEST.read_text())
    )
    for species in catalogue:
        species_id = species["id"]
        if species_id in manifest and (_PHOTO_DIR / f"{species_id}.jpg").exists():
            manifest[species_id]["credit"] = _plain(manifest[species_id]["credit"])
            continue
        article = ARTICLES.get(species_id)
        scientific = SCIENTIFIC.get(species_id)
        try:
            if inat and scientific:
                photo = _photo_from_inat(scientific)
            elif article:
                photo = _photo_for(article)
            else:
                print(f"  no article mapped for {species_id}")
                continue
        except (OSError, KeyError, ValueError, StopIteration) as exc:  # keep going
            print(f"  failed {species_id}: {exc}")
            continue
        if photo is None:
            continue
        target = _PHOTO_DIR / f"{species_id}.jpg"
        try:
            image = (
                _fetch(photo["image_url"]) if inat else _fetch_thumb(photo["image_url"])
            )
            _save_resized(image, target)
        except (OSError, RuntimeError, ValueError) as exc:
            print(f"  failed {species_id} download: {exc}")
            continue
        time.sleep(3)
        manifest[species_id] = {
            "src": f"/species/{target.name}",
            "credit": photo["credit"],
            "license": photo["license"],
            "license_url": photo["license_url"],
            "source_url": photo["source_url"],
        }
        print(f"  ok {species_id}: {photo['license']} — {photo['credit'][:60]}")
    manifest = {key: manifest[key] for key in sorted(manifest)}
    _MANIFEST.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n")
    print(f"{len(manifest)}/{len(catalogue)} photos")


if __name__ == "__main__":
    main()
