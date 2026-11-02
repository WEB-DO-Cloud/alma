#!/usr/bin/env python3
"""Refresh the marketing integrations catalog.

This repository has no catalog builder. The upstream snapshot is published
outside the tree. This copies that snapshot, stores each logo with the site,
and rewrites logo URLs onto https://alma.com.do so the page does not call a
Rakazo host. `CATALOG_URL` still overrides the committed file at build time.
"""

from __future__ import annotations

import json
import re
import sys
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "apps" / "www" / "public" / "integrations"
LOGO_DIR = PUBLIC / "logos"
CATALOG_PATH = PUBLIC / "catalog.json"
UPSTREAM = "https://rakazo-public.fsn1.your-objectstorage.com/integrations/catalog.json"
LOGO_PREFIX = "https://rakazo-public.fsn1.your-objectstorage.com/integrations/logos/"
SITE = "https://alma.com.do"
BANNED = ("rakazo-public", "your-objectstorage.com", "rakazo.com", "github.com/elie222")
NAME_RE = re.compile(r"^[A-Za-z0-9._-]+$")
TEXT_REPLACEMENTS = (
    ("https://github.com/elie222/rakazo", "https://github.com/WEB-DO-Cloud/alma"),
    ("https://app.rakazo.com", "https://app.alma.com.do"),
    ("http://app.rakazo.com", "https://app.alma.com.do"),
    ("https://rakazo.com", "https://alma.com.do"),
    ("http://rakazo.com", "https://alma.com.do"),
    ("app.rakazo.com", "app.alma.com.do"),
    ("rakazo.com", "alma.com.do"),
    ("Rakazo", "ALMA"),
)


def fetch(url: str) -> bytes:
    request = urllib.request.Request(url, headers={"user-agent": "ALMA catalog sync"})
    last: Exception | None = None
    for _ in range(3):
        try:
            with urllib.request.urlopen(request, timeout=60) as response:
                return response.read()
        except (urllib.error.URLError, TimeoutError) as error:
            last = error
    raise RuntimeError(f"could not fetch {url}") from last


def brand(value: str) -> str:
    for old, new in TEXT_REPLACEMENTS:
        value = value.replace(old, new)
    return value


def brand_integration(item: dict) -> dict:
    item = dict(item)
    item["name"] = brand(item["name"])
    item["description"] = brand(item["description"])
    item["actions"] = [
        {
            **action,
            "name": brand(action["name"]),
            "description": brand(action["description"]),
        }
        for action in item["actions"]
    ]
    logo = item.get("logo")
    if not logo:
        item["logo"] = None
        return item
    if not isinstance(logo, str) or not logo.startswith(LOGO_PREFIX):
        raise RuntimeError(f"{item['slug']} logo is not from the upstream logo prefix")
    name = logo.removeprefix(LOGO_PREFIX).split("?", 1)[0]
    if not NAME_RE.fullmatch(name) or "/" in name:
        raise RuntimeError(f"{item['slug']} logo name is not safe")
    item["logo"] = f"{SITE}/integrations/logos/{name}"
    item["_logo_name"] = name
    return item


def main() -> None:
    catalog = json.loads(fetch(UPSTREAM))
    if catalog.get("version") != 1 or not catalog.get("integrations"):
        raise RuntimeError("upstream catalog is not version 1")
    branded = [brand_integration(item) for item in catalog["integrations"]]
    names = sorted({item["_logo_name"] for item in branded if item.get("_logo_name")})
    LOGO_DIR.mkdir(parents=True, exist_ok=True)

    def save(name: str) -> None:
        target = LOGO_DIR / name
        if target.is_file() and target.stat().st_size > 0:
            return
        target.write_bytes(fetch(LOGO_PREFIX + name))

    with ThreadPoolExecutor(max_workers=24) as pool:
        futures = [pool.submit(save, name) for name in names]
        for future in as_completed(futures):
            future.result()

    cleaned = []
    for item in branded:
        item.pop("_logo_name", None)
        cleaned.append(item)
    payload = {"version": 1, "integrations": cleaned}
    text = json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n"
    lowered = text.lower()
    for needle in BANNED:
        if needle in lowered:
            raise RuntimeError(f"catalog still mentions {needle}")
    CATALOG_PATH.write_text(text, encoding="utf-8")
    print(f"wrote {len(cleaned)} integrations and {len(names)} logos")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"sync-integrations-catalog: {error}", file=sys.stderr)
        sys.exit(1)
