#!/usr/bin/env python3
"""Verification pass for the Oosta README visual system.

Checks performed:

1. every expected asset exists and matches ``build_assets.py`` output;
2. every SVG parses as XML and declares a viewBox, title and description;
3. every text run carries a font stack with embedded-safe fallbacks;
4. no text run exceeds the width it reserved (``data-maxw``) — clipping guard;
5. every text run sits inside the canvas;
6. every fill/stroke colour belongs to the Oosta palette;
7. Persian text declares ``direction="rtl"`` so shaping is unambiguous;
8. mobile readability: minimum font size and canvas aspect ratio budget;
9. README.md references every asset, and every relative link/anchor resolves.

Exit code 0 means the README system is publishable.
"""

from __future__ import annotations

import pathlib
import re
import sys
import xml.etree.ElementTree as ET

ROOT = pathlib.Path(__file__).resolve().parents[2]
ASSET_DIR = ROOT / "assets" / "readme"
README = ROOT / "README.md"

sys.path.insert(0, str(ROOT / "tools" / "readme"))
import build_assets  # noqa: E402

SVG_NS = "{http://www.w3.org/2000/svg}"

PALETTE = {
    "#0A0908", "#15120F", "#2A2420",
    "#D60019", "#C87533", "#F4F1EB",
    "#B8B0A4", "#7E776D", "#34D399",
    "none", "url(#forge)", "url(#emberline)",
}

# Minimum rendered font size. GitHub renders README images at roughly 900 CSS px;
# a 1600px canvas is therefore scaled by ~0.56, so 10px stays above 5.6px effective.
MIN_FONT_SIZE = 10.0
MAX_ASPECT = 5.2

FA_RE = re.compile(r"[\u0600-\u06FF]")

failures: list[str] = []
notes: list[str] = []


def fail(message: str) -> None:
    failures.append(message)


def check_assets_fresh() -> None:
    expected = set(build_assets.ASSETS)
    present = {p.name for p in ASSET_DIR.glob("*.svg")}
    for missing in sorted(expected - present):
        fail(f"missing asset: assets/readme/{missing}")
    for extra in sorted(present - expected):
        fail(f"unexpected asset not produced by build_assets.py: assets/readme/{extra}")
    for name, builder in build_assets.ASSETS.items():
        target = ASSET_DIR / name
        if target.exists() and target.read_text(encoding="utf-8") != builder():
            fail(f"stale asset (re-run build_assets.py): assets/readme/{name}")


def check_svg(path: pathlib.Path) -> None:
    rel = path.relative_to(ROOT)
    try:
        tree = ET.parse(path)
    except ET.ParseError as exc:  # pragma: no cover - defensive
        fail(f"{rel}: not valid XML ({exc})")
        return
    root = tree.getroot()
    if root.tag != f"{SVG_NS}svg":
        fail(f"{rel}: root element is not <svg>")
        return

    view_box = root.get("viewBox")
    if not view_box:
        fail(f"{rel}: no viewBox")
        return
    _, _, vw, vh = (float(v) for v in view_box.split())

    if vh > 0 and (vw / vh) > MAX_ASPECT:
        fail(f"{rel}: aspect ratio {vw / vh:.1f} exceeds the mobile budget of {MAX_ASPECT}")

    if root.find(f"{SVG_NS}title") is None or root.find(f"{SVG_NS}desc") is None:
        fail(f"{rel}: missing <title>/<desc> for accessibility")

    texts = root.iter(f"{SVG_NS}text")
    count = 0
    for node in texts:
        count += 1
        value = (node.text or "").strip()
        size = float(node.get("font-size", "0"))
        family = node.get("font-family") or root.get("font-family") or ""
        x = float(node.get("x", "0"))
        y = float(node.get("y", "0"))

        if size < MIN_FONT_SIZE:
            fail(f"{rel}: font-size {size} on {value!r} is below the {MIN_FONT_SIZE}px readability floor")
        if "sans-serif" not in family and "monospace" not in family:
            fail(f"{rel}: text {value!r} has no generic font fallback")
        if not (0 <= y <= vh):
            fail(f"{rel}: text {value!r} sits outside the canvas vertically (y={y})")

        est = node.get("data-est-width")
        maxw = node.get("data-maxw")
        if est and maxw and float(est) > float(maxw) + 0.5:
            fail(f"{rel}: text {value!r} overflows its reserved width ({est} > {maxw})")

        anchor = node.get("text-anchor", "start")
        width = float(est) if est else 0.0
        left = x if anchor == "start" else (x - width / 2 if anchor == "middle" else x - width)
        right = left + width
        if left < -1 or right > vw + 1:
            fail(f"{rel}: text {value!r} overflows the canvas horizontally ({left:.0f}…{right:.0f} of {vw:.0f})")

        if FA_RE.search(value) and node.get("direction") != "rtl":
            fail(f"{rel}: Persian text {value!r} does not declare direction=rtl")

    if count == 0:
        fail(f"{rel}: no text content")

    for node in root.iter():
        for attr in ("fill", "stroke"):
            value = node.get(attr)
            if value and value not in PALETTE and not value.startswith("url("):
                fail(f"{rel}: off-palette {attr} {value}")


def check_readme() -> None:
    if not README.exists():
        fail("README.md is missing")
        return
    body = README.read_text(encoding="utf-8")

    for name in build_assets.ASSETS:
        if f"assets/readme/{name}" not in body:
            fail(f"README.md does not reference assets/readme/{name}")

    headings = re.findall(r"^#{1,6}\s+(.+?)\s*$", body, flags=re.M)
    anchors = set()
    for heading in headings:
        slug = heading.lower()
        slug = re.sub(r"[^\w\u0600-\u06FF\s-]", "", slug)
        slug = slug.strip().replace(" ", "-")
        anchors.add(slug)

    for target in re.findall(r"\]\(([^)\s]+)\)", body):
        if target.startswith(("http://", "https://", "mailto:")):
            continue
        if target.startswith("#"):
            if target[1:] not in anchors:
                fail(f"README.md anchor does not resolve: {target}")
            continue
        file_part = target.split("#", 1)[0]
        if not (ROOT / file_part).exists():
            fail(f"README.md link does not resolve: {target}")

    if re.search(r"\bcoming soon\b|\bsorry\b|\bwe apologi[sz]e\b|\bnot ready yet\b", body, re.I):
        fail("README.md contains launch-apology language")

    width = max((len(x) for x in body.splitlines()), default=0)
    notes.append(f"README.md: {len(body.splitlines())} lines, longest line {width} characters")


def main() -> int:
    check_assets_fresh()
    svgs = sorted(ASSET_DIR.glob("*.svg"))
    for svg in svgs:
        check_svg(svg)
    check_readme()

    print(f"checked {len(svgs)} SVG assets in assets/readme")
    for note in notes:
        print(f"  note: {note}")
    if failures:
        print(f"\n{len(failures)} problem(s) found:", file=sys.stderr)
        for problem in failures:
            print(f"  - {problem}", file=sys.stderr)
        return 1
    print("all README visual-system checks passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
