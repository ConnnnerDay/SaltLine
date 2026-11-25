"""Check every official-rules link in app/data/guidance_regulations.json.

Size and bag limits are a snapshot; the link to each state's official
rules is the angler's way to verify them, so a dead link is a real trust
problem. Run by hand (it needs the network), from apps/api:

    python -m scripts.check_regulation_links

Prints each URL with its HTTP status (following redirects) and exits 1
if any is unreachable or answers 4xx/5xx.
"""

from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path

import httpx

_DATA = (
    Path(__file__).resolve().parents[1] / "app" / "data" / "guidance_regulations.json"
)
_HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; Saltline link check)"}


def regulation_urls(data: dict[str, object]) -> list[str]:
    urls = set(dict(data.get("state_sources") or {}).values())  # type: ignore[call-overload]
    for species in dict(data.get("states") or {}).values():  # type: ignore[call-overload]
        for rule in dict(species).values():
            if isinstance(rule, dict) and rule.get("source_url"):
                urls.add(str(rule["source_url"]))
    return sorted(str(url) for url in urls)


async def _status(client: httpx.AsyncClient, url: str) -> tuple[str, str]:
    try:
        response = await client.get(url)
    except httpx.HTTPError as exc:
        return url, f"ERROR {type(exc).__name__}"
    return url, str(response.status_code)


async def main() -> int:
    urls = regulation_urls(json.loads(_DATA.read_text()))
    async with httpx.AsyncClient(
        headers=_HEADERS, follow_redirects=True, timeout=20.0
    ) as client:
        results = await asyncio.gather(*(_status(client, url) for url in urls))
    bad = 0
    for url, status in results:
        ok = status.isdigit() and int(status) < 400
        bad += not ok
        print(f"{'ok ' if ok else 'BAD'} {status:>5}  {url}")
    print(f"\n{len(urls) - bad}/{len(urls)} reachable")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
