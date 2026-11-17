"""Download one photo per guidance-catalogue species (restored "species
photos" from the original app).

Each species maps to a hand-picked English Wikipedia article. The script
takes that article's lead image, looks its license and author up on
Wikimedia Commons, keeps it only if the license is free (Creative Commons
or public domain), and saves a 480px-wide JPEG into apps/web/public/species/,
plus apps/web/lib/species-photos.json with the credit, license and source
page the web app must show next to each photo.

Photos are committed and served by the site itself: nothing is hotlinked
at view time, so the site's self-only CSP stays intact and photos keep
working if Wikimedia is unreachable.

Run from apps/api with a Python that has Pillow (needs network access to
en.wikipedia.org, commons.wikimedia.org and upload.wikimedia.org):

    python3 -m scripts.fetch_species_photos
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
}

_FREE_LICENSE = re.compile(r"^(cc[- ]|cc0|public domain|pd)", re.IGNORECASE)


def _fetch(url: str, attempts: int = 5) -> bytes:
    """GET with Wikimedia-friendly pacing: back off on 429/503."""
    for attempt in range(attempts):
        request = urllib.request.Request(url, headers={"User-Agent": _USER_AGENT})
        try:
            with urllib.request.urlopen(request, timeout=60) as response:
                return bytes(response.read())
        except urllib.error.HTTPError as exc:
            if exc.code not in (429, 503) or attempt == attempts - 1:
                raise
            time.sleep(5 * (attempt + 1))
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
    pages = _get_json(f"https://commons.wikimedia.org/w/api.php?{query}")["query"][
        "pages"
    ]
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


def _save_resized(data: bytes, target: Path) -> None:
    with Image.open(io.BytesIO(data)) as source:
        image = source.convert("RGB")
        if image.width > _WIDTH:
            image = image.resize((_WIDTH, round(image.height * _WIDTH / image.width)))
        image.save(target, "JPEG", quality=82, optimize=True, progressive=True)


def main() -> None:
    catalogue = json.loads(_CATALOGUE.read_text())["species"]
    _PHOTO_DIR.mkdir(parents=True, exist_ok=True)
    # Incremental: keep photos already fetched (pass --force to refetch all).
    force = "--force" in sys.argv
    manifest: dict[str, dict[str, str]] = (
        {} if force or not _MANIFEST.exists() else json.loads(_MANIFEST.read_text())
    )
    for species in catalogue:
        species_id = species["id"]
        if species_id in manifest and (_PHOTO_DIR / f"{species_id}.jpg").exists():
            manifest[species_id]["credit"] = _plain(manifest[species_id]["credit"])
            continue
        article = ARTICLES.get(species_id)
        if article is None:
            print(f"  no article mapped for {species_id}")
            continue
        try:
            photo = _photo_for(article)
        except (OSError, KeyError, ValueError, StopIteration) as exc:  # keep going
            print(f"  failed {species_id}: {exc}")
            continue
        if photo is None:
            continue
        target = _PHOTO_DIR / f"{species_id}.jpg"
        try:
            _save_resized(_fetch_thumb(photo["image_url"]), target)
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
