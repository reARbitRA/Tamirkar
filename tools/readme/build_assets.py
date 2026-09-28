#!/usr/bin/env python3
"""Deterministic generator for the Oosta README visual system.

Every diagram in ``assets/readme`` is produced by this script. Diagrams are
plain, dependency-free SVG so GitHub renders them without a build step, and
every label is derived from code that exists in this repository:

* Android surfaces  -> app/src/main/java/com/example/**
* Server boundary   -> services/auth-api/src/**
* Database states   -> services/auth-api/db/*.sql
* Verification data -> executed commands recorded in README.md

Usage:
    python3 tools/readme/build_assets.py            # write assets/readme/*.svg
    python3 tools/readme/build_assets.py --check    # fail if files are stale
"""

from __future__ import annotations

import argparse
import pathlib
import sys
from xml.sax.saxutils import escape

ROOT = pathlib.Path(__file__).resolve().parents[2]
OUT = ROOT / "assets" / "readme"

# ---------------------------------------------------------------------------
# Brand system
# ---------------------------------------------------------------------------

FORGE = "#0A0908"        # Forge Black
FORGE_SOFT = "#15120F"   # raised forge surface
FORGE_LINE = "#2A2420"   # hairline on forge
APRON = "#D60019"        # Apron Red
COPPER = "#C87533"       # Copper
PAPER = "#F4F1EB"        # Paper
PAPER_DIM = "#B8B0A4"    # muted paper text
PAPER_FAINT = "#7E776D"  # tertiary paper text
VERIFY = "#34D399"       # Verification Green

SANS = (
    "Vazirmatn, 'Noto Sans Arabic', 'IBM Plex Sans', "
    "'Segoe UI', Tahoma, 'DejaVu Sans', sans-serif"
)
MONO = (
    "'JetBrains Mono', 'IBM Plex Mono', 'Roboto Mono', "
    "'DejaVu Sans Mono', Menlo, monospace"
)

PERSIAN_RANGE = ("\u0600", "\u06FF")


def is_persian(value: str) -> bool:
    return any(PERSIAN_RANGE[0] <= ch <= PERSIAN_RANGE[1] for ch in value)


def est_width(value: str, size: float, weight: str = "400", mono: bool = False) -> float:
    """Conservative text-width estimate used to keep labels inside their panels."""
    if mono:
        factor = 0.62
    elif is_persian(value):
        factor = 0.56
    else:
        factor = 0.545 if weight in ("400", "500", "normal") else 0.60
    upper_bonus = sum(0.07 for ch in value if ch.isupper()) * size * 0.5
    return len(value) * size * factor + upper_bonus


class Overflow(Exception):
    pass


# ---------------------------------------------------------------------------
# Primitives
# ---------------------------------------------------------------------------


def svg_open(width: int, height: int, title: str, desc: str, bg: str = FORGE) -> list[str]:
    return [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" '
        f'width="{width}" height="{height}" role="img" '
        f'aria-labelledby="t d" font-family="{SANS}">',
        f"  <title id=\"t\">{escape(title)}</title>",
        f"  <desc id=\"d\">{escape(desc)}</desc>",
        f'  <rect width="{width}" height="{height}" fill="{bg}"/>',
    ]


def svg_close(parts: list[str]) -> str:
    parts.append("</svg>")
    return "\n".join(parts) + "\n"


def rect(x, y, w, h, fill, stroke=None, rx=14, sw=1.5, opacity=None, dash=None) -> str:
    bits = [f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}" fill="{fill}"']
    if stroke:
        bits.append(f' stroke="{stroke}" stroke-width="{sw}"')
    if dash:
        bits.append(f' stroke-dasharray="{dash}"')
    if opacity is not None:
        bits.append(f' opacity="{opacity}"')
    bits.append("/>")
    return "  " + "".join(bits)


def line(x1, y1, x2, y2, stroke, sw=1.5, dash=None, cap="round", opacity=None) -> str:
    bits = [
        f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="{stroke}" '
        f'stroke-width="{sw}" stroke-linecap="{cap}"'
    ]
    if dash:
        bits.append(f' stroke-dasharray="{dash}"')
    if opacity is not None:
        bits.append(f' opacity="{opacity}"')
    bits.append("/>")
    return "  " + "".join(bits)


def path(d, stroke=None, fill="none", sw=2, dash=None, opacity=None, marker=None) -> str:
    bits = [f'<path d="{d}" fill="{fill}"']
    if stroke:
        bits.append(f' stroke="{stroke}" stroke-width="{sw}" stroke-linecap="round" stroke-linejoin="round"')
    if dash:
        bits.append(f' stroke-dasharray="{dash}"')
    if marker:
        bits.append(f' marker-end="url(#{marker})"')
    if opacity is not None:
        bits.append(f' opacity="{opacity}"')
    bits.append("/>")
    return "  " + "".join(bits)


def circle(cx, cy, r, fill, stroke=None, sw=1.5, opacity=None) -> str:
    bits = [f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="{fill}"']
    if stroke:
        bits.append(f' stroke="{stroke}" stroke-width="{sw}"')
    if opacity is not None:
        bits.append(f' opacity="{opacity}"')
    bits.append("/>")
    return "  " + "".join(bits)


def text(
    x,
    y,
    value,
    size=16,
    fill=PAPER,
    weight="400",
    anchor="start",
    mono=False,
    maxw=None,
    opacity=None,
    spacing=None,
) -> str:
    """Render a single text run and assert it fits inside ``maxw``."""
    width = est_width(value, size, weight, mono)
    if maxw is not None and width > maxw:
        raise Overflow(f"text {value!r} needs {width:.0f}px but only {maxw}px is available")
    family = MONO if mono else SANS
    attrs = [
        f'x="{x}"',
        f'y="{y}"',
        f'font-size="{size}"',
        f'fill="{fill}"',
        f'font-weight="{weight}"',
        f'font-family="{family}"',
        f'text-anchor="{anchor}"',
        f'data-est-width="{width:.0f}"',
    ]
    if maxw is not None:
        attrs.append(f'data-maxw="{maxw}"')
    if is_persian(value):
        attrs.append('direction="rtl"')
        attrs.append('xml:lang="fa"')
    if spacing is not None:
        attrs.append(f'letter-spacing="{spacing}"')
    if opacity is not None:
        attrs.append(f'opacity="{opacity}"')
    return f'  <text {" ".join(attrs)}>{escape(value)}</text>'


def markers() -> str:
    defs = ["  <defs>"]
    for name, color in (("arrow", PAPER_DIM), ("arrowRed", APRON), ("arrowGreen", VERIFY), ("arrowCopper", COPPER)):
        defs.append(
            f'    <marker id="{name}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" '
            f'markerHeight="7" orient="auto-start-reverse">'
            f'<path d="M0,0 L10,5 L0,10 z" fill="{color}"/></marker>'
        )
    defs.append(
        f'    <linearGradient id="forge" x1="0" y1="0" x2="1" y2="1">'
        f'<stop offset="0%" stop-color="#15120F"/><stop offset="100%" stop-color="#0A0908"/></linearGradient>'
    )
    defs.append(
        f'    <linearGradient id="emberline" x1="0" y1="0" x2="1" y2="0">'
        f'<stop offset="0%" stop-color="{APRON}"/><stop offset="55%" stop-color="{COPPER}"/>'
        f'<stop offset="100%" stop-color="{VERIFY}"/></linearGradient>'
    )
    defs.append("  </defs>")
    return "\n".join(defs)


def panel(x, y, w, h, fill="url(#forge)", stroke=FORGE_LINE, rx=18) -> list[str]:
    return [rect(x, y, w, h, fill, stroke, rx=rx)]


def kicker(x, y, value, fill=COPPER, size=13, maxw=None) -> str:
    return text(x, y, value.upper(), size=size, fill=fill, weight="700", spacing=2.2, maxw=maxw)


def tag(x, y, value, color, w=None, h=26, size=12, fill_opacity=0.14) -> list[str]:
    width = w or est_width(value, size, "700", mono=True) + 22
    return [
        rect(x, y, width, h, color, rx=h / 2, opacity=fill_opacity),
        rect(x, y, width, h, "none", color, rx=h / 2, sw=1),
        text(x + width / 2, y + h / 2 + 4.2, value, size=size, fill=color, weight="700", anchor="middle", mono=True,
             maxw=width - 12),
    ]


def hairline(x, y, w, color=FORGE_LINE) -> str:
    return line(x, y, x + w, y, color, 1)


def evidence(x, y, value, maxw, color=PAPER_FAINT, size=11.5) -> str:
    return text(x, y, value, size=size, fill=color, mono=True, maxw=maxw)


def ember(x, y, w, h=4) -> str:
    return f'  <rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{h/2}" fill="url(#emberline)"/>'


def footer_note(x, y, value, maxw) -> str:
    return text(x, y, value, size=12, fill=PAPER_FAINT, mono=True, maxw=maxw)


def apron_mark(cx, cy, scale=1.0, primary=APRON, edge=COPPER) -> list[str]:
    """Compact apron-shield mark: a blacksmith apron read as a shield."""
    s = scale
    d = (
        f"M{cx - 44 * s},{cy - 52 * s} "
        f"L{cx - 18 * s},{cy - 62 * s} "
        f"Q{cx},{cy - 44 * s} {cx + 18 * s},{cy - 62 * s} "
        f"L{cx + 44 * s},{cy - 52 * s} "
        f"L{cx + 38 * s},{cy + 18 * s} "
        f"Q{cx},{cy + 70 * s} {cx - 38 * s},{cy + 18 * s} Z"
    )
    return [
        path(d, stroke=edge, fill=primary, sw=2.5),
        path(
            f"M{cx - 16 * s},{cy - 14 * s} L{cx},{cy + 4 * s} L{cx + 24 * s},{cy - 26 * s}",
            stroke=PAPER,
            sw=6 * s,
        ),
        line(cx - 30 * s, cy + 26 * s, cx + 30 * s, cy + 26 * s, PAPER, 2 * s, opacity=0.5),
    ]


# ---------------------------------------------------------------------------
# 1. Hero
# ---------------------------------------------------------------------------


def hero() -> str:
    W, H = 1600, 640
    p = svg_open(W, H, "Oosta — diagnose first, then price", "Oosta product hero: Persian-first Android repair platform")
    p.append(markers())
    p.append(rect(0, 0, W, H, "url(#forge)", rx=0))
    # forge grid
    for gx in range(80, W, 80):
        p.append(line(gx, 0, gx, H, FORGE_LINE, 1, opacity=0.35))
    for gy in range(80, H, 80):
        p.append(line(0, gy, W, gy, FORGE_LINE, 1, opacity=0.25))
    p.append(ember(0, 0, W, 6))

    p += apron_mark(150, 190, 1.05)
    p.append(text(240, 150, "اوستا", size=74, fill=PAPER, weight="700", maxw=300))
    p.append(text(240, 212, "OOSTA", size=46, fill=PAPER, weight="700", spacing=7, maxw=340))
    p.append(kicker(240, 246, "Persian-first Android repair platform", maxw=520))

    p.append(ember(240, 282, 180, 4))
    p.append(text(240, 340, "«اول تشخیص، بعد هزینه.»", size=36, fill=PAPER, weight="700", maxw=520))
    p.append(text(240, 382, "Diagnose first. Price second. Repair, don't replace.", size=21, fill=PAPER_DIM, maxw=620))

    lines = [
        ("Diagnosis rail", "symptom capture, preliminary triage, human-readable price range"),
        ("Device identity", "brand, model, serial, health score and durable service history"),
        ("Technician evidence", "approved KYC, before/after objects, SHA-256 references"),
        ("Controlled money", "immutable quotes, Zarinpal verify, 15% escrow, balanced ledger"),
    ]
    y = 434
    for head, body in lines:
        p.append(circle(248, y - 5, 4, COPPER))
        p.append(text(266, y, head, size=16, fill=PAPER, weight="700", maxw=200))
        p.append(text(474, y, body, size=15, fill=PAPER_DIM, maxw=520))
        y += 34

    # right console
    cx, cy, cw, ch = 1000, 96, 520, 452
    p += panel(cx, cy, cw, ch)
    p.append(hairline(cx, cy + 58, cw))
    p.append(text(cx + 26, cy + 38, "SERVER BOUNDARY", size=13, fill=COPPER, weight="700", spacing=2.2, maxw=220))
    p += tag(cx + 330, cy + 20, "fail-closed", VERIFY, w=164, h=30)

    rows = [
        ("POST /v1/auth/request-otp", "Kavenegar Verify Lookup", VERIFY),
        ("POST /v1/auth/verify-otp", "HS256 session, 3600s", VERIFY),
        ("GET  /v1/public/features", "5 server feature gates", VERIFY),
        ("POST /v1/orders", "gate: new_bookings", COPPER),
        ("POST /v1/orders/:id/quotes", "gate: technician_matching", COPPER),
        ("POST /v1/payments/zarinpal/start", "gate: payments", APRON),
        ("POST /v1/admin/escrows/release-due", "gate: escrow_release", APRON),
    ]
    ry = cy + 96
    for route, note, color in rows:
        p.append(circle(cx + 32, ry - 5, 4.5, color))
        p.append(text(cx + 48, ry, route, size=13.5, fill=PAPER, mono=True, maxw=300))
        p.append(text(cx + cw - 26, ry + 1, note, size=11.5, fill=PAPER_FAINT, anchor="end", mono=True, maxw=210))
        ry += 46
    p.append(hairline(cx, cy + ch - 62, cw))
    p.append(text(cx + 26, cy + ch - 26, "Android APK holds AUTH_API_BASE_URL only", size=13, fill=PAPER_DIM,
                  mono=True, maxw=470))

    # stat strip
    stats = [
        ("18/18", "auth-api tests passing"),
        ("16", "server routes implemented"),
        ("5", "server-side feature gates"),
        ("۱۵٪", "escrow hold on capture"),
        ("0", "provider secrets in the APK"),
    ]
    sx = 150
    for value, label in stats:
        p.append(text(sx, 580, value, size=30, fill=VERIFY if value != "۱۵٪" else COPPER, weight="700", maxw=150))
        p.append(text(sx, 606, label, size=13, fill=PAPER_DIM, maxw=250))
        sx += 270
    return svg_close(p)


# ---------------------------------------------------------------------------
# 2. Five promises
# ---------------------------------------------------------------------------


def five_promises() -> str:
    W, H = 1600, 620
    p = svg_open(W, H, "Oosta five promises", "Listening, device passport, escrow, parts tiers and guild seal")
    p.append(markers())
    p.append(ember(0, 0, W, 5))
    p.append(kicker(64, 74, "The five promises", maxw=420))
    p.append(text(64, 118, "پنج قولِ اوستا", size=38, fill=PAPER, weight="700", maxw=340))
    p.append(text(64, 152, "Each promise is bound to a surface that exists in this repository.", size=16,
                  fill=PAPER_DIM, maxw=760))

    cards = [
        ("۱", "گوشِ کاوه", "Kaveh's Ear", COPPER,
         ["Symptom capture before price", "Preliminary triage, server-side", "Human fallback copy on failure"],
         "DiagnosisScreen.kt · POST /v1/ai/diagnoses"),
        ("۲", "شناسنامه", "Device Passport", PAPER,
         ["Brand, model, serial, purchase", "Health score and service count", "Repair history per device"],
         "DevicePassportScreen.kt · DeviceEntity"),
        ("۳", "پولِ امانت", "Escrow ۱۵٪", APRON,
         ["Capture splits 85 / 15", "escrow_liability is a real account", "Release is idempotent per hold"],
         "server.js escrow_holds · ledger.js"),
        ("۴", "کشوی سه‌طبقه", "Three-Drawer Parts", COPPER,
         ["اصلی · درجه یک · اقتصادی", "Warranty days beside each tier", "Tier stored on every part row"],
         "QualityLevel · PartEntity.qualityLevel"),
        ("۵", "مُهر صنف", "Guild Seal", VERIFY,
         ["KYC review by a human operator", "Only approved technicians quote", "Before/after evidence hashes"],
         "kyc_cases · requireApprovedTechnician"),
    ]

    x = 64
    cw, ch = 282, 372
    for numeral, fa, en, color, bullets, ev in cards:
        p += panel(x, 200, cw, ch)
        p.append(rect(x, 200, cw, 6, color, rx=3))
        p.append(text(x + 26, 258, numeral, size=30, fill=color, weight="700", maxw=60))
        p.append(text(x + cw - 26, 258, fa, size=26, fill=PAPER, weight="700", anchor="end", maxw=200))
        p.append(text(x + 26, 292, en, size=17, fill=PAPER_DIM, weight="700", maxw=cw - 52))
        p.append(hairline(x + 26, 312, cw - 52))
        by = 342
        for b in bullets:
            chunks = _wrap(b, cw - 74, 13.5)
            p.append(circle(x + 30, by - 5, 3.5, color))
            for j, chunk in enumerate(chunks):
                p.append(text(x + 44, by + j * 18, chunk, size=13.5, fill=PAPER, maxw=cw - 74))
            by += 18 * len(chunks) + 14
        p.append(hairline(x + 26, 486, cw - 52))
        p.append(text(x + 26, 512, "EVIDENCE", size=10.5, fill=COPPER, weight="700", spacing=1.8, maxw=120))
        for i, chunk in enumerate(_wrap_mono(ev, cw - 52, 11.5)):
            p.append(evidence(x + 26, 534 + i * 17, chunk, cw - 52))
        x += cw + 21

    p.append(text(64, 596, "No promise on this page is a marketplace claim: money and matching stay behind "
                           "server flags until their evidence gate is met.", size=13.5, fill=PAPER_FAINT, maxw=1300))
    return svg_close(p)


def _wrap_mono(value: str, maxw: float, size: float) -> list[str]:
    words = value.split(" ")
    out, cur = [], ""
    for w in words:
        trial = f"{cur} {w}".strip()
        if est_width(trial, size, mono=True) <= maxw:
            cur = trial
        else:
            if cur:
                out.append(cur)
            cur = w
    if cur:
        out.append(cur)
    return out


def _wrap(value: str, maxw: float, size: float, weight: str = "400") -> list[str]:
    words = value.split(" ")
    out, cur = [], ""
    for w in words:
        trial = f"{cur} {w}".strip()
        if est_width(trial, size, weight) <= maxw:
            cur = trial
        else:
            if cur:
                out.append(cur)
            cur = w
    if cur:
        out.append(cur)
    return out


# ---------------------------------------------------------------------------
# 3. Customer journey
# ---------------------------------------------------------------------------


def customer_journey() -> str:
    W, H = 1600, 660
    p = svg_open(W, H, "Oosta customer journey", "From symptom to a verified, durable repair record")
    p.append(markers())
    p.append(ember(0, 0, W, 5))
    p.append(kicker(64, 72, "Customer journey", maxw=360))
    p.append(text(64, 116, "From symptom to verified repair record", size=34, fill=PAPER, weight="700", maxw=790))
    p.append(text(64, 148, "از علائم خرابی تا سابقهٔ تأییدشدهٔ تعمیر", size=19, fill=PAPER_DIM, maxw=560))

    steps = [
        ("01", "Sign in", "ورود با موبایل", "OTP over Kavenegar; the app never mints codes",
         "AuthPhone → AuthOtp", VERIFY),
        ("02", "Describe", "شرح علائم", "Category, symptom text, optional photos",
         "DiagnosisScreen.kt", COPPER),
        ("03", "Triage", "تشخیص اولیه", "Preliminary result, price range, human fallback",
         "POST /v1/ai/diagnoses", COPPER),
        ("04", "Book", "ثبت درخواست", "Order enters status submitted on the server",
         "POST /v1/orders", APRON),
        ("05", "Quote", "پیش‌فاکتور", "Immutable revision from an approved technician",
         "POST /orders/:id/quotes", APRON),
        ("06", "Approve", "تأیید مشتری", "Acceptance is recorded; other quotes supersede",
         "POST /quotes/:id/accept", APRON),
        ("07", "Pay", "پرداخت", "Zarinpal verify, then 85 / 15 ledger capture",
         "zarinpal/callback", APRON),
        ("08", "Prove", "مدرک کار", "Before/after objects with SHA-256 references",
         "job_evidence + hash", VERIFY),
        ("09", "Keep", "ثبت شناسنامه", "Warranty window and durable device record",
         "escrow_holds · passport", VERIFY),
    ]

    x0, y0 = 64, 210
    cw, gap = 155, 12
    p.append(line(x0, y0 + 300, W - 64, y0 + 300, FORGE_LINE, 2))
    for i, (num, en, fa, body, ev, color) in enumerate(steps):
        x = x0 + i * (cw + gap)
        p += panel(x, y0, cw, 268)
        p.append(rect(x, y0, cw, 5, color, rx=2.5))
        p.append(text(x + 18, y0 + 40, num, size=20, fill=color, weight="700", mono=True, maxw=50))
        p.append(text(x + 18, y0 + 72, en, size=17, fill=PAPER, weight="700", maxw=cw - 36))
        p.append(text(x + cw - 18, y0 + 100, fa, size=14, fill=PAPER_DIM, anchor="end", maxw=cw - 36))
        p.append(hairline(x + 18, y0 + 116, cw - 36))
        for j, chunk in enumerate(_wrap(body, cw - 36, 12.5)):
            p.append(text(x + 18, y0 + 140 + j * 18, chunk, size=12.5, fill=PAPER, maxw=cw - 36))
        for j, chunk in enumerate(_wrap_mono(ev, cw - 36, 10.5)):
            p.append(evidence(x + 18, y0 + 222 + j * 15, chunk, cw - 36, size=10.5))
        p.append(circle(x + cw / 2, y0 + 300, 7, FORGE, color, 2.5))
        if i < len(steps) - 1:
            p.append(path(f"M{x + cw / 2 + 14},{y0 + 300} L{x + cw + gap + cw / 2 - 16},{y0 + 300}",
                          stroke=FORGE_LINE, sw=2, marker="arrow"))

    p += panel(64, 540, 1472, 84)
    p.append(rect(64, 540, 6, 84, VERIFY, rx=3))
    p.append(text(96, 574, "Gate", size=15, fill=COPPER, weight="700", maxw=80))
    p.append(text(96, 600, "Steps 04–07 return HTTP 503 with a Persian explanation while their server flag is false.",
                  size=14.5, fill=PAPER, maxw=900))
    p.append(text(1504, 574, "featureEnabled(reply, …)", size=12.5, fill=PAPER_FAINT, anchor="end", mono=True, maxw=400))
    p.append(text(1504, 600, "server.js · FeatureUnavailableScreen.kt", size=12.5, fill=PAPER_FAINT, anchor="end",
                  mono=True, maxw=400))
    return svg_close(p)


# ---------------------------------------------------------------------------
# 4. Diagnosis console
# ---------------------------------------------------------------------------


def diagnosis_console() -> str:
    W, H = 1600, 700
    p = svg_open(W, H, "Oosta diagnosis console", "Symptom capture, preliminary triage and the booking gate")
    p.append(markers())
    p.append(ember(0, 0, W, 5))
    p.append(kicker(64, 72, "Diagnosis rail", maxw=340))
    p.append(text(64, 116, "Listen before you quote", size=34, fill=PAPER, weight="700", maxw=620))
    p.append(text(64, 148, "گوشِ کاوه — تشخیص پیش از هزینه", size=19, fill=PAPER_DIM, maxw=520))

    # phone frame
    px, py, pw, ph = 64, 196, 400, 452
    p += panel(px, py, pw, ph, rx=26)
    p.append(rect(px + 14, py + 14, pw - 28, 38, FORGE, FORGE_LINE, rx=12))
    p.append(text(px + 32, py + 39, "تشخیص هوشمند", size=15, fill=PAPER, weight="700", maxw=180))
    p.append(text(px + pw - 32, py + 39, "diagnosis", size=12, fill=PAPER_FAINT, anchor="end", mono=True, maxw=120))

    chips = ["موبایل", "لپ‌تاپ", "کولر گازی", "لباسشویی", "یخچال"]
    cx = px + 24
    for i, c in enumerate(chips):
        wch = est_width(c, 13) + 26
        color = COPPER if i == 2 else FORGE_LINE
        p.append(rect(cx, py + 74, wch, 30, COPPER if i == 2 else FORGE, color, rx=15,
                      opacity=0.22 if i == 2 else None))
        p.append(text(cx + wch / 2, py + 94, c, size=13, fill=PAPER if i == 2 else PAPER_DIM, anchor="middle",
                      maxw=wch - 10))
        cx += wch + 8

    p.append(rect(px + 24, py + 120, pw - 48, 96, FORGE, FORGE_LINE, rx=14))
    p.append(text(px + pw - 40, py + 148, "علائم خرابی را بنویسید…", size=14, fill=PAPER_DIM, anchor="end", maxw=280))
    p.append(text(px + pw - 40, py + 176, "صدای تق‌تق و بوی سوختگی از پشت دستگاه", size=14, fill=PAPER, anchor="end",
                  maxw=320))
    p.append(text(px + 40, py + 204, "symptom → problem_description", size=11, fill=PAPER_FAINT, mono=True, maxw=280))

    p.append(rect(px + 24, py + 232, 176, 48, FORGE, COPPER, rx=12))
    p.append(text(px + 112, py + 262, "افزودن تصویر", size=14, fill=COPPER, anchor="middle", maxw=150))
    p.append(rect(px + 212, py + 232, 164, 48, APRON, None, rx=12, opacity=0.9))
    p.append(text(px + 294, py + 262, "شروع تشخیص", size=15, fill=PAPER, weight="700", anchor="middle", maxw=140))

    p.append(rect(px + 24, py + 300, pw - 48, 128, FORGE, FORGE_LINE, rx=14))
    p.append(text(px + pw - 40, py + 330, "نتیجهٔ اولیه — نیازمند تأیید استادکار", size=14, fill=VERIFY, anchor="end",
                  maxw=320))
    p.append(text(px + pw - 40, py + 360, "برد کنترل: احتمال اتصال کوتاه", size=14, fill=PAPER, anchor="end", maxw=300))
    p.append(text(px + 44, py + 392, "۹۵۰٬۰۰۰ – ۱٬۶۰۰٬۰۰۰ تومان", size=15, fill=COPPER, weight="700", maxw=260))
    p.append(text(px + pw - 40, py + 392, "preliminary", size=11.5, fill=PAPER_FAINT, anchor="end", mono=True, maxw=120))
    p.append(text(px + 44, py + 416, "AI never approves money or a refund.", size=11.5, fill=PAPER_FAINT, maxw=320))

    # server side
    sx, sw_ = 512, 1024
    p += panel(sx, 196, sw_, 214)
    p.append(text(sx + 28, 236, "Server-side triage path", size=20, fill=PAPER, weight="700", maxw=420))
    p.append(text(sx + 28, 264, "The APK carries no model key. Triage runs behind an authenticated route.",
                  size=14.5, fill=PAPER_DIM, maxw=700))
    p += tag(sx + sw_ - 214, 218, "gate: ai_diagnosis", COPPER, w=186, h=30)

    chain = [
        ("Compose", "DiagnosisScreen.kt"),
        ("ViewModel", "runDiagnosis()"),
        ("PlatformApi", "Bearer token"),
        ("auth-api", "POST /v1/ai/diagnoses"),
        ("Redaction", "phone · national id"),
        ("Provider", "server-only key"),
    ]
    bx = sx + 28
    bw = 152
    for i, (head, sub) in enumerate(chain):
        p.append(rect(bx, 300, bw, 78, FORGE, FORGE_LINE, rx=14))
        p.append(text(bx + bw / 2, 330, head, size=14.5, fill=PAPER, weight="700", anchor="middle", maxw=bw - 16))
        for j, chunk in enumerate(_wrap_mono(sub, bw - 16, 10.5)):
            p.append(text(bx + bw / 2, 352 + j * 15, chunk, size=10.5, fill=PAPER_FAINT, anchor="middle", mono=True,
                          maxw=bw - 16))
        if i < len(chain) - 1:
            p.append(path(f"M{bx + bw + 4},339 L{bx + bw + 18},339", stroke=COPPER, sw=2, marker="arrowCopper"))
        bx += bw + 22

    # safety rails
    rails = [
        ("Preliminary by default", "Result copy states it is unverified and needs an on-site check.", VERIFY),
        ("No silent price", "A failed provider returns a human route, not a fabricated number.", APRON),
        ("Bounded payload", "Image count and size are validated before a provider is called.", COPPER),
        ("Booking gate", "Proceed-to-booking is disabled unless new_bookings is true.", COPPER),
    ]
    rx_ = 512
    for title_, body, color in rails:
        p += panel(rx_, 436, 244, 212)
        p.append(rect(rx_, 436, 244, 5, color, rx=2.5))
        for j, chunk in enumerate(_wrap(title_, 200, 16, "700")):
            p.append(text(rx_ + 22, 478 + j * 22, chunk, size=16, fill=PAPER, weight="700", maxw=204))
        p.append(hairline(rx_ + 22, 528, 200))
        for j, chunk in enumerate(_wrap(body, 200, 13)):
            p.append(text(rx_ + 22, 556 + j * 20, chunk, size=13, fill=PAPER_DIM, maxw=204))
        rx_ += 260

    return svg_close(p)


# ---------------------------------------------------------------------------
# 5. Device passport
# ---------------------------------------------------------------------------


def device_passport() -> str:
    W, H = 1600, 660
    p = svg_open(W, H, "Oosta device passport", "Device identity and durable repair history")
    p.append(markers())
    p.append(ember(0, 0, W, 5))
    p.append(kicker(64, 72, "Device identity", maxw=340))
    p.append(text(64, 116, "شناسنامهٔ دستگاه — Device Passport", size=34, fill=PAPER, weight="700", maxw=760))
    p.append(text(64, 148, "One machine, one identity, one history that outlives any single repair.", size=17,
                  fill=PAPER_DIM, maxw=760))

    # passport card
    cx, cy, cw, ch = 64, 196, 560, 400
    p += panel(cx, cy, cw, ch, rx=22)
    p.append(rect(cx, cy, 8, ch, COPPER, rx=4))
    p.append(text(cx + 34, cy + 52, "یخچال ساید بای ساید", size=24, fill=PAPER, weight="700", maxw=320))
    p.append(text(cx + cw - 34, cy + 52, "DeviceEntity", size=12.5, fill=PAPER_FAINT, anchor="end", mono=True, maxw=160))
    p.append(hairline(cx + 34, cy + 72, cw - 68))

    fields = [
        ("brand", "برند", "ال‌جی"),
        ("model", "مدل", "GR-J910"),
        ("serialNumber", "شماره سریال", "SN-4429-KX"),
        ("purchaseDate", "تاریخ خرید", "۱۴۰۱/۰۴/۱۵"),
        ("category", "دسته", "refrigerator"),
        ("healthScore", "سلامت", "۸۸٪"),
        ("serviceCount", "دفعات سرویس", "۲ بار"),
        ("lastServiceDate", "آخرین سرویس", "۱۴۰۳/۰۲/۱۰"),
    ]
    fx, fy = cx + 34, cy + 112
    for i, (key, fa, value) in enumerate(fields):
        col = i % 2
        row = i // 2
        x = fx + col * 258
        y = fy + row * 62
        p.append(text(x, y, fa, size=13, fill=PAPER_DIM, maxw=150))
        p.append(text(x, y + 24, value, size=17, fill=PAPER, weight="700", maxw=200))
        p.append(text(x + 238, y, key, size=10.5, fill=PAPER_FAINT, anchor="end", mono=True, maxw=140))
    p.append(hairline(cx + 34, cy + 352, cw - 68))
    p.append(text(cx + 34, cy + 380, "Room table `devices` · DevicePassportScreen.kt · TamirkarDao.kt",
                  size=12, fill=PAPER_FAINT, mono=True, maxw=cw - 68))

    # history rail
    hx, hy, hw, hh = 664, 196, 872, 400
    p += panel(hx, hy, hw, hh, rx=22)
    p.append(text(hx + 30, hy + 44, "Durable history", size=20, fill=PAPER, weight="700", maxw=260))
    p.append(text(hx + 30, hy + 70, "تاریخچهٔ ماندگار تعمیرات", size=15, fill=PAPER_DIM, maxw=300))
    p += tag(hx + hw - 236, hy + 24, "append-only intent", VERIFY, w=206, h=30)

    p.append(line(hx + 60, hy + 108, hx + 60, hy + 352, FORGE_LINE, 2))
    entries = [
        ("۱۴۰۲/۰۹/۱۱", "تعویض ترموستات", "اصلی (اورجینال) · ۹۰ روز ضمانت", VERIFY),
        ("۱۴۰۳/۰۲/۱۰", "سرویس دوره‌ای و تعویض فیلتر", "درجه یک (شرکتی) · ۶۰ روز ضمانت", COPPER),
        ("۱۴۰۳/۰۸/۰۴", "رفع نشتی گاز مدار سرمایش", "اصلی (اورجینال) · ۱۲۰ روز ضمانت", VERIFY),
        ("۱۴۰۴/۰۱/۲۲", "تعمیر برد کنترل", "در انتظار مدرک پس از کار", APRON),
    ]
    ey = hy + 132
    for date, title_, meta, color in entries:
        p.append(circle(hx + 60, ey - 6, 7, FORGE, color, 2.5))
        p.append(text(hx + 92, ey, title_, size=17, fill=PAPER, weight="700", maxw=420))
        p.append(text(hx + 92, ey + 24, meta, size=13.5, fill=PAPER_DIM, maxw=460))
        p.append(text(hx + hw - 30, ey, date, size=14, fill=color, anchor="end", weight="700", maxw=170))
        p.append(text(hx + hw - 30, ey + 24, "order · quote · evidence", size=11, fill=PAPER_FAINT, anchor="end",
                      mono=True, maxw=220))
        ey += 62

    p.append(hairline(hx + 30, hy + 344, hw - 60))
    notes = [
        ("Identity", "serialNumber pins the record to a physical machine, not a phone number."),
        ("Continuity", "Every completed order appends a service event; nothing overwrites the last one."),
    ]
    ny = hy + 370
    for head, body in notes:
        p.append(text(hx + 30, ny, head, size=13, fill=COPPER, weight="700", maxw=120))
        p.append(text(hx + 140, ny, body, size=13, fill=PAPER_DIM, maxw=700))
        ny += 24

    p.append(text(64, 636, "Durability rule: a passport entry is written from server order state, so a reinstalled "
                           "app or a new phone does not erase a machine's history.", size=13.5, fill=PAPER_FAINT,
                  maxw=1400))
    return svg_close(p)


# ---------------------------------------------------------------------------
# 6. Parts tier rack
# ---------------------------------------------------------------------------


def parts_tier_rack() -> str:
    W, H = 1600, 660
    p = svg_open(W, H, "Oosta parts tier rack", "Original, Grade One and Economic parts compared")
    p.append(markers())
    p.append(ember(0, 0, W, 5))
    p.append(kicker(64, 72, "Three-drawer rack", maxw=340))
    p.append(text(64, 116, "کشوی سه‌طبقه — Parts tiers in the open", size=34, fill=PAPER, weight="700", maxw=860))
    p.append(text(64, 148, "Every part row carries its tier, its price and its warranty. The customer chooses; "
                           "the workshop does not decide silently.", size=16, fill=PAPER_DIM, maxw=1070))

    tiers = [
        ("اصلی (اورجینال)", "Original", "original", VERIFY,
         [("Source", "Manufacturer channel"), ("Warranty", "۹۰–۱۲۰ روز"), ("Price index", "100%"),
          ("Best for", "Sealed systems and boards")],
         "Highest cost, longest cover."),
        ("درجه یک (شرکتی)", "Grade One", "grade_a", COPPER,
         [("Source", "Reputable OEM-equivalent"), ("Warranty", "۶۰–۹۰ روز"), ("Price index", "~70%"),
          ("Best for", "Common wear components")],
         "Balanced cost and life."),
        ("اقتصادی", "Economic", "economy", PAPER_DIM,
         [("Source", "Budget compatible"), ("Warranty", "۳۰ روز"), ("Price index", "~45%"),
          ("Best for", "Short-horizon repairs")],
         "Cheapest, stated plainly."),
    ]

    x = 64
    cw, ch = 456, 384
    for fa, en, enum_id, color, rows, note in tiers:
        p += panel(x, 196, cw, ch, rx=20)
        p.append(rect(x, 196, cw, 7, color, rx=3.5))
        p.append(text(x + 30, 250, fa, size=26, fill=PAPER, weight="700", maxw=300))
        p.append(text(x + cw - 30, 250, en, size=17, fill=color, weight="700", anchor="end", maxw=170))
        p.append(text(x + 30, 278, f'QualityLevel.{enum_id.upper()}  id="{enum_id}"', size=12, fill=PAPER_FAINT,
                      mono=True, maxw=cw - 60))
        p.append(hairline(x + 30, 296, cw - 60))
        ry = 330
        for label, value in rows:
            p.append(text(x + 30, ry, label, size=13.5, fill=PAPER_DIM, maxw=170))
            p.append(text(x + cw - 30, ry, value, size=15, fill=PAPER, weight="700", anchor="end", maxw=250))
            p.append(hairline(x + 30, ry + 14, cw - 60))
            ry += 46
        # drawer bar
        bar_w = {"original": cw - 60, "grade_a": (cw - 60) * 0.7, "economy": (cw - 60) * 0.45}[enum_id]
        p.append(rect(x + 30, 512, cw - 60, 14, FORGE, FORGE_LINE, rx=7))
        p.append(rect(x + 30, 512, bar_w, 14, color, rx=7, opacity=0.85))
        p.append(text(x + 30, 552, note, size=14, fill=PAPER, maxw=cw - 60))
        x += cw + 32

    p.append(text(64, 620, "PartEntity.qualityLevel · PartEntity.warrantyDays · QualityLevel enum in "
                           "domain/model/Models.kt", size=12.5, fill=PAPER_FAINT, mono=True, maxw=1200))
    p.append(text(64, 644, "A quote lists parts and labour separately, so a tier change is a visible price change, "
                           "not a hidden substitution.", size=13.5, fill=PAPER_DIM, maxw=1400))
    return svg_close(p)


# ---------------------------------------------------------------------------
# 7. Technician evidence
# ---------------------------------------------------------------------------


def technician_evidence() -> str:
    W, H = 1600, 680
    p = svg_open(W, H, "Oosta technician evidence", "Guild seal, KYC review and before/after evidence hashes")
    p.append(markers())
    p.append(ember(0, 0, W, 5))
    p.append(kicker(64, 72, "Guild seal", maxw=300))
    p.append(text(64, 116, "مُهر صنف — who may touch the machine", size=34, fill=PAPER, weight="700", maxw=860))
    p.append(text(64, 148, "Verification is a human decision recorded on the server, then enforced on every quote, "
                           "payment and evidence write.", size=16, fill=PAPER_DIM, maxw=1040))

    # KYC state machine
    p += panel(64, 196, 720, 232)
    p.append(text(92, 236, "KYC state machine", size=19, fill=PAPER, weight="700", maxw=280))
    p.append(text(92, 260, "technician_profiles.verification_status", size=11.5, fill=PAPER_FAINT, mono=True, maxw=320))
    states = [
        ("unsubmitted", PAPER_FAINT),
        ("submitted", COPPER),
        ("under_review", COPPER),
        ("approved", VERIFY),
    ]
    sx = 96
    for i, (name, color) in enumerate(states):
        w = 142
        p.append(rect(sx, 296, w, 48, FORGE, color, rx=12))
        p.append(text(sx + w / 2, 326, name, size=13, fill=color, anchor="middle", mono=True, maxw=w - 14))
        if i < len(states) - 1:
            p.append(path(f"M{sx + w + 4},320 L{sx + w + 22},320", stroke=COPPER, sw=2, marker="arrowCopper"))
        sx += w + 26
    for i, (name, color) in enumerate((("rejected", APRON), ("suspended", APRON))):
        p.append(rect(96 + i * 168, 366, 150, 42, FORGE, color, rx=12))
        p.append(text(96 + i * 168 + 75, 393, name, size=13, fill=color, anchor="middle", mono=True, maxw=136))
    p.append(text(456, 393, "A human operator decides; no AI approval path exists.", size=13, fill=PAPER_DIM, maxw=391))

    # enforcement
    p += panel(816, 196, 720, 232)
    p.append(text(844, 236, "Enforcement points", size=19, fill=PAPER, weight="700", maxw=280))
    checks = [
        ("requireApprovedTechnician()", "role=technician AND is_active AND approved"),
        ("POST /v1/orders/:id/quotes", "rejects 409 when the profile is not approved"),
        ("POST /v1/payments/zarinpal/start", "re-checks the technician before money moves"),
        ("POST /v1/orders/:id/evidence", "403 unless the quote is accepted or paid"),
    ]
    ey = 276
    for code, note in checks:
        p.append(circle(852, ey - 5, 4, VERIFY))
        p.append(text(868, ey, code, size=13, fill=PAPER, mono=True, maxw=330))
        p.append(text(1508, ey, note, size=12, fill=PAPER_FAINT, anchor="end", mono=True, maxw=330))
        ey += 38

    # evidence pair
    p += panel(64, 456, 1472, 200)
    p.append(text(92, 496, "Before / after evidence", size=19, fill=PAPER, weight="700", maxw=300))
    p.append(text(92, 522, "مدرک پیش و پس از کار", size=14, fill=PAPER_DIM, maxw=240))

    for i, (phase, fa, color) in enumerate((("before", "پیش از کار", COPPER), ("after", "پس از کار", VERIFY))):
        bx = 380 + i * 400
        p.append(rect(bx, 486, 372, 142, FORGE, color, rx=16))
        p.append(text(bx + 24, 518, f'phase="{phase}"', size=14, fill=color, weight="700", mono=True, maxw=180))
        p.append(text(bx + 348, 518, fa, size=14, fill=PAPER, anchor="end", maxw=150))
        p.append(hairline(bx + 24, 534, 324))
        p.append(text(bx + 24, 562, "object_reference", size=11.5, fill=PAPER_FAINT, mono=True, maxw=180))
        p.append(text(bx + 24, 584, "s3://oosta-evidence/…", size=13, fill=PAPER, mono=True, maxw=324))
        p.append(text(bx + 24, 612, "sha256:9f2c…41ab", size=12.5, fill=color, mono=True, maxw=324))

    p.append(rect(1200, 486, 308, 142, FORGE, FORGE_LINE, rx=16))
    p.append(text(1224, 518, "Integrity rule", size=15, fill=PAPER, weight="700", maxw=180))
    for j, chunk in enumerate(_wrap("The API stores a 64-character SHA-256 digest, so a swapped photo is "
                                    "detectable after the fact.", 264, 12.5)):
        p.append(text(1224, 546 + j * 20, chunk, size=12.5, fill=PAPER_DIM, maxw=264))
    p.append(text(1224, 614, "job_evidence.object_hash", size=11.5, fill=PAPER_FAINT, mono=True, maxw=264))
    return svg_close(p)


# ---------------------------------------------------------------------------
# 8. Booking state machine
# ---------------------------------------------------------------------------


def booking_state_machine() -> str:
    W, H = 1600, 700
    p = svg_open(W, H, "Oosta booking state machine", "Server-enforced order, quote and escrow states")
    p.append(markers())
    p.append(ember(0, 0, W, 5))
    p.append(kicker(64, 72, "State machine", maxw=300))
    p.append(text(64, 116, "Server-enforced booking states", size=34, fill=PAPER, weight="700", maxw=760))
    p.append(text(64, 148, "Every state below is a CHECK constraint in db/003_orders_quotes.sql and "
                           "db/002_platform.sql.", size=16, fill=PAPER_DIM, maxw=1000))

    # order lane
    p += panel(64, 196, 1472, 190)
    p.append(text(92, 234, "service_orders.status", size=16, fill=COPPER, weight="700", mono=True, maxw=280))
    order_states = [
        ("submitted", VERIFY, "POST /v1/orders"),
        ("quoted", COPPER, "quote sent"),
        ("awaiting_payment", COPPER, "quote accepted"),
        ("paid", APRON, "zarinpal verified"),
        ("in_progress", APRON, "work started"),
        ("completed", VERIFY, "job closed"),
    ]
    ox = 96
    bw = 210
    for i, (name, color, note) in enumerate(order_states):
        p.append(rect(ox, 264, bw, 62, FORGE, color, rx=14))
        p.append(text(ox + bw / 2, 292, name, size=15, fill=color, weight="700", anchor="middle", mono=True,
                      maxw=bw - 16))
        p.append(text(ox + bw / 2, 314, note, size=11.5, fill=PAPER_FAINT, anchor="middle", mono=True, maxw=bw - 16))
        if i < len(order_states) - 1:
            p.append(path(f"M{ox + bw + 4},295 L{ox + bw + 22},295", stroke=PAPER_DIM, sw=2, marker="arrow"))
        ox += bw + 26
    for i, (name, color) in enumerate((("disputed", APRON), ("cancelled", PAPER_FAINT))):
        x = 96 + i * 240
        p.append(rect(x, 344, 220, 30, FORGE, color, rx=15, sw=1.2))
        p.append(text(x + 110, 364, name, size=12.5, fill=color, anchor="middle", mono=True, maxw=200))
    p.append(text(600, 364, "Terminal branches; both keep the order row and its history readable.", size=13,
                  fill=PAPER_DIM, maxw=700))

    # quote lane
    p += panel(64, 410, 720, 264)
    p.append(text(92, 448, "quotes.status", size=16, fill=COPPER, weight="700", mono=True, maxw=220))
    q_states = [("sent", COPPER), ("accepted", VERIFY), ("paid", APRON), ("superseded", PAPER_FAINT),
                ("declined", PAPER_FAINT)]
    qx, qy = 96, 480
    for i, (name, color) in enumerate(q_states):
        col, row = i % 3, i // 3
        x = qx + col * 210
        y = qy + row * 62
        p.append(rect(x, y, 194, 46, FORGE, color, rx=12))
        p.append(text(x + 97, y + 29, name, size=13.5, fill=color, anchor="middle", mono=True, maxw=176))
    p.append(hairline(92, 616, 664))
    p.append(text(92, 644, "Accepting one quote supersedes the rest inside a single transaction.",
                  size=13.5, fill=PAPER_DIM, maxw=664))

    # escrow lane
    p += panel(816, 410, 720, 264)
    p.append(text(844, 448, "escrow_holds.status", size=16, fill=COPPER, weight="700", mono=True, maxw=260))
    e_states = [("held", COPPER, "release_after = now + 30d"), ("frozen", APRON, "dispute freeze"),
                ("released", VERIFY, "idempotent worker"), ("refunded", PAPER_DIM, "customer refund path")]
    ey = 478
    for name, color, note in e_states:
        p.append(rect(844, ey, 200, 40, FORGE, color, rx=12))
        p.append(text(944, ey + 26, name, size=13.5, fill=color, anchor="middle", mono=True, maxw=182))
        p.append(text(1064, ey + 26, note, size=12.5, fill=PAPER_DIM, maxw=200))
        p.append(text(1508, ey + 26, "escrow_holds", size=11, fill=PAPER_FAINT, anchor="end", mono=True, maxw=160))
        ey += 40
    p.append(text(844, 648, "A hold without an assigned technician stays held for manual reconciliation.",
                  size=12.5, fill=PAPER_FAINT, maxw=664))
    return svg_close(p)


# ---------------------------------------------------------------------------
# 9. Escrow ledger
# ---------------------------------------------------------------------------


def escrow_ledger() -> str:
    W, H = 1600, 700
    p = svg_open(W, H, "Oosta escrow ledger", "Balanced double-entry postings for capture and release")
    p.append(markers())
    p.append(ember(0, 0, W, 5))
    p.append(kicker(64, 72, "Money with a paper trail", maxw=420))
    p.append(text(64, 116, "پولِ امانت — balanced postings, idempotent events", size=34, fill=PAPER, weight="700",
                  maxw=947))
    p.append(text(64, 148, "postLedgerEntry() refuses to write unless debits equal credits, and every event carries "
                           "an idempotency key.", size=16, fill=PAPER_DIM, maxw=1040))

    # capture entry
    p += panel(64, 196, 720, 278)
    p.append(text(92, 236, "event: payment_capture", size=18, fill=PAPER, weight="700", mono=True, maxw=340))
    p.append(text(92, 260, "idempotencyKey = payment-capture:<intent-id>", size=11.5, fill=PAPER_FAINT, mono=True,
                  maxw=420))
    p += tag(590, 216, "on verify", VERIFY, w=166, h=30)
    rows = [
        ("gateway_clearing", "debit", "۱٬۰۰۰٬۰۰۰", COPPER),
        ("technician_payable", "credit", "۸۵۰٬۰۰۰", VERIFY),
        ("escrow_liability", "credit", "۱۵۰٬۰۰۰", APRON),
    ]
    ry = 300
    for account, direction, amount, color in rows:
        p.append(rect(92, ry, 664, 44, FORGE, FORGE_LINE, rx=12))
        p.append(rect(92, ry, 5, 44, color, rx=2.5))
        p.append(text(114, ry + 28, account, size=14, fill=PAPER, mono=True, maxw=260))
        p.append(text(470, ry + 28, direction, size=13, fill=color, anchor="middle", mono=True, maxw=110))
        p.append(text(736, ry + 28, f"{amount} تومان", size=14, fill=PAPER, weight="700", anchor="end", maxw=200))
        ry += 46
    p.append(text(92, 456, "debit total == credit total, asserted before insert", size=12, fill=VERIFY, mono=True,
                  maxw=520))

    # release entry
    p += panel(816, 196, 720, 278)
    p.append(text(844, 236, "event: escrow_release", size=18, fill=PAPER, weight="700", mono=True, maxw=340))
    p.append(text(844, 260, "idempotencyKey = escrow-release:<hold-id>", size=11.5, fill=PAPER_FAINT, mono=True,
                  maxw=420))
    p += tag(1330, 216, "gate: escrow_release", COPPER, w=180, h=30)
    rows2 = [
        ("escrow_liability", "debit", "۱۵۰٬۰۰۰", APRON),
        ("technician_payable", "credit", "۱۵۰٬۰۰۰", VERIFY),
    ]
    ry = 306
    for account, direction, amount, color in rows2:
        p.append(rect(844, ry, 664, 44, FORGE, FORGE_LINE, rx=12))
        p.append(rect(844, ry, 5, 44, color, rx=2.5))
        p.append(text(866, ry + 28, account, size=14, fill=PAPER, mono=True, maxw=260))
        p.append(text(1222, ry + 28, direction, size=13, fill=color, anchor="middle", mono=True, maxw=110))
        p.append(text(1488, ry + 28, f"{amount} تومان", size=14, fill=PAPER, weight="700", anchor="end", maxw=200))
        ry += 52
    p.append(text(844, 420, "A duplicate worker run finds the key and changes nothing.", size=13, fill=PAPER_DIM,
                  maxw=620))
    p.append(text(844, 446, "SELECT … FOR UPDATE SKIP LOCKED LIMIT 100", size=12, fill=PAPER_FAINT, mono=True,
                  maxw=520))

    # flow strip
    p += panel(64, 486, 1472, 174)
    p.append(text(92, 524, "Capture to release", size=18, fill=PAPER, weight="700", maxw=280))
    flow = [
        ("Customer pays", "checkout on Zarinpal"),
        ("Server verifies", "verify.json, code 100/101"),
        ("Capture posts", "85% payable, 15% escrow"),
        ("Hold opens", "release_after = +30 days"),
        ("Warranty runs", "dispute can freeze the hold"),
        ("Worker releases", "operator token, idempotent"),
    ]
    fx = 96
    fw = 220
    for i, (head, sub) in enumerate(flow):
        p.append(rect(fx, 552, fw, 78, FORGE, FORGE_LINE, rx=14))
        p.append(text(fx + fw / 2, 582, head, size=14.5, fill=PAPER, weight="700", anchor="middle", maxw=fw - 16))
        p.append(text(fx + fw / 2, 606, sub, size=11.5, fill=PAPER_FAINT, anchor="middle", mono=True, maxw=fw - 16))
        if i < len(flow) - 1:
            p.append(path(f"M{fx + fw + 4},591 L{fx + fw + 18},591", stroke=APRON, sw=2, marker="arrowRed"))
        fx += fw + 22
    return svg_close(p)


# ---------------------------------------------------------------------------
# 10. OTP auth flow
# ---------------------------------------------------------------------------


def otp_auth_flow() -> str:
    W, H = 1600, 700
    p = svg_open(W, H, "Oosta OTP authentication flow", "Mobile to auth API to Kavenegar to a signed session token")
    p.append(markers())
    p.append(ember(0, 0, W, 5))
    p.append(kicker(64, 72, "Identity", maxw=240))
    p.append(text(64, 116, "OTP: mobile → auth-api → Kavenegar → token", size=34, fill=PAPER, weight="700", maxw=940))
    p.append(text(64, 148, "The Android app never generates, stores or compares a verification code.", size=16,
                  fill=PAPER_DIM, maxw=900))

    actors = [
        ("Android app", "PhoneAuthScreen · OtpScreen", 64, COPPER),
        ("auth-api", "Fastify · PostgreSQL", 500, APRON),
        ("Kavenegar", "Verify Lookup template", 936, COPPER),
        ("Session", "HS256 token", 1372, VERIFY),
    ]
    for label, sub, x, color in actors:
        w = 200 if x == 1372 else 380
        p += panel(x, 196, w, 82)
        p.append(rect(x, 196, w, 5, color, rx=2.5))
        p.append(text(x + 22, 234, label, size=18, fill=PAPER, weight="700", maxw=w - 44))
        for j, chunk in enumerate(_wrap_mono(sub, w - 44, 11.5)):
            p.append(text(x + 22, 258 + j * 15, chunk, size=11.5, fill=PAPER_FAINT, mono=True, maxw=w - 44))

    lanes = [64 + 190, 500 + 190, 936 + 190, 1372 + 100]
    for lx in lanes:
        p.append(line(lx, 286, lx, 600, FORGE_LINE, 1.5, dash="4 8"))

    def hop(y, a, b, label, sub, color, marker):
        x1, x2 = lanes[a], lanes[b]
        p.append(path(f"M{x1},{y} L{x2},{y}", stroke=color, sw=2, marker=marker))
        mid = (x1 + x2) / 2
        p.append(text(mid, y - 12, label, size=14, fill=PAPER, weight="700", anchor="middle", maxw=abs(x2 - x1) - 20))
        p.append(text(mid, y + 20, sub, size=11.5, fill=PAPER_FAINT, anchor="middle", mono=True,
                      maxw=abs(x2 - x1) - 20))

    hop(322, 0, 1, "POST /v1/auth/request-otp", "phone normalised to +989xxxxxxxxx", COPPER, "arrowCopper")
    hop(386, 1, 2, "Verify Lookup", "receptor + token + template", APRON, "arrowRed")
    hop(450, 1, 0, "202 Accepted", "expires_in 300s · resend_after 60s", PAPER_DIM, "arrow")
    hop(514, 0, 1, "POST /v1/auth/verify-otp", "6-digit code, latin-normalised", COPPER, "arrowCopper")
    hop(578, 1, 3, "access_token", "role claim · 3600s · iss/aud checked", VERIFY, "arrowGreen")

    # controls
    controls = [
        ("Hash only", "sha256(phone:code:pepper); the raw code is never stored"),
        ("Constant time", "timingSafeEqual over equal-length digests"),
        ("Rate limited", "60s resend cooldown, 3 sends per 15 minutes"),
        ("Attempt lockout", "status becomes locked at max_attempts"),
        ("Advisory lock", "pg_advisory_xact_lock serialises one number"),
    ]
    cw = 284
    cx = 64
    for head, body in controls:
        p.append(rect(cx, 616, cw, 66, FORGE_SOFT, FORGE_LINE, rx=12))
        p.append(text(cx + 16, 640, head, size=13, fill=VERIFY, weight="700", maxw=cw - 32))
        for j, chunk in enumerate(_wrap(body, cw - 32, 11)):
            p.append(text(cx + 16, 658 + j * 14, chunk, size=11, fill=PAPER_FAINT, maxw=cw - 32))
        cx += cw + 12
    return svg_close(p)


# ---------------------------------------------------------------------------
# 11. Android architecture
# ---------------------------------------------------------------------------


def android_architecture() -> str:
    W, H = 1600, 700
    p = svg_open(W, H, "Oosta Android architecture", "Compose screens, view model, repository and remote clients")
    p.append(markers())
    p.append(ember(0, 0, W, 5))
    p.append(kicker(64, 72, "Android", maxw=240))
    p.append(text(64, 116, "Compose · ViewModel · Repository · Room", size=34, fill=PAPER, weight="700", maxw=820))
    p.append(text(64, 148, "Single-activity Kotlin app, Navigation Compose, Room for local state, OkHttp for the "
                           "server boundary.", size=16, fill=PAPER_DIM, maxw=1040))

    layers = [
        ("UI layer", "ui/screens · ui/components · ui/theme",
         ["Auth: PhoneAuthScreen, OtpScreen", "Home, Devices, Warranties, Chat, Profile",
          "Diagnosis, NewOrder, Matching, Tracking", "Parts, Wallet, Technician workspace",
          "FeatureUnavailableScreen for closed gates"], COPPER),
        ("State layer", "ui/viewmodel/TamirkarViewModel.kt",
         ["otpRequestState · authSessionState", "platformFeatures from /v1/public/features",
          "runDiagnosis() · createNewOrder()", "acceptBid() · completeTechnicianJob()",
          "Client flags never replace server checks"], APRON),
        ("Data layer", "data/repository · data/local",
         ["TamirkarRepository facade", "Room: users, devices, orders, bids", "parts, warranties, transactions, disputes",
          "TamirkarDao query surface", "Local cache, not the source of money truth"], COPPER),
        ("Remote layer", "data/remote",
         ["AuthApi: request/verify OTP", "PlatformApi: features, orders", "AuthSessionStore: bearer token in memory",
          "OostaApiConfig: HTTPS-only base URL", "No provider key is read on device"], VERIFY),
    ]
    x = 64
    cw, ch = 356, 330
    for title_, sub, items, color in layers:
        p += panel(x, 196, cw, ch)
        p.append(rect(x, 196, cw, 6, color, rx=3))
        p.append(text(x + 24, 240, title_, size=20, fill=PAPER, weight="700", maxw=cw - 48))
        for j, chunk in enumerate(_wrap_mono(sub, cw - 48, 11.5)):
            p.append(text(x + 24, 264 + j * 16, chunk, size=11.5, fill=PAPER_FAINT, mono=True, maxw=cw - 48))
        p.append(hairline(x + 24, 292, cw - 48))
        iy = 322
        for it in items:
            p.append(circle(x + 28, iy - 5, 3.5, color))
            for j, chunk in enumerate(_wrap(it, cw - 72, 13)):
                p.append(text(x + 42, iy + j * 18, chunk, size=13, fill=PAPER, maxw=cw - 72))
            iy += 18 * max(1, len(_wrap(it, cw - 72, 13))) + 16
        x += cw + 16

    for i in range(3):
        ax = 64 + (i + 1) * 356 + i * 16
        p.append(path(f"M{ax + 2},360 L{ax + 12},360", stroke=PAPER_DIM, sw=2, marker="arrow"))

    p += panel(64, 552, 1472, 108)
    p.append(rect(64, 552, 6, 108, VERIFY, rx=3))
    p.append(text(96, 590, "Build surface", size=17, fill=PAPER, weight="700", maxw=220))
    facts = [
        ("Kotlin / AGP", "AGP 9.1.1 · Kotlin 2.2.10 · Gradle 9.3.1"),
        ("SDK", "minSdk 24 · targetSdk 36 · compileSdk 36.1"),
        ("Tests", "JUnit · Robolectric · Roborazzi · Compose"),
        ("RTL", "supportsRtl=true · Persian-first copy"),
    ]
    fx = 96
    for head, body in facts:
        p.append(text(fx, 622, head, size=13, fill=COPPER, weight="700", maxw=320))
        p.append(text(fx, 644, body, size=12.5, fill=PAPER_DIM, mono=True, maxw=330))
        fx += 350
    return svg_close(p)


# ---------------------------------------------------------------------------
# 12. Backend boundary
# ---------------------------------------------------------------------------


def backend_boundary() -> str:
    W, H = 1600, 660
    p = svg_open(W, H, "Oosta backend boundary", "Secrets stay server-side; the APK holds only a public base URL")
    p.append(markers())
    p.append(ember(0, 0, W, 5))
    p.append(kicker(64, 72, "Boundary", maxw=240))
    p.append(text(64, 116, "Secrets never cross into the APK", size=34, fill=PAPER, weight="700", maxw=760))
    p.append(text(64, 148, "The distributed application is reverse-engineerable by definition, so it is given "
                           "nothing worth extracting.", size=16, fill=PAPER_DIM, maxw=1040))

    # client side
    p += panel(64, 200, 500, 380)
    p.append(rect(64, 200, 500, 6, COPPER, rx=3))
    p.append(text(92, 246, "Android APK", size=22, fill=PAPER, weight="700", maxw=300))
    p.append(text(92, 272, "com.aistudio.tamirkar.zpxlka", size=12, fill=PAPER_FAINT, mono=True, maxw=380))
    p.append(hairline(92, 292, 444))
    allowed = [
        ("AUTH_API_BASE_URL", "public HTTPS host, validated at runtime"),
        ("Bearer access token", "short-lived, held in memory"),
        ("Feature flags (read)", "advisory copy only"),
    ]
    ay = 328
    for head, body in allowed:
        p.append(circle(100, ay - 5, 4, VERIFY))
        p.append(text(116, ay, head, size=14.5, fill=PAPER, weight="700", maxw=420))
        p.append(text(116, ay + 20, body, size=12.5, fill=PAPER_DIM, maxw=420))
        ay += 54
    p.append(hairline(92, 486, 444))
    for j, chunk in enumerate(_wrap_mono("OostaApiConfig rejects a blank, placeholder or plain-HTTP URL. "
                                         "Debug builds may use http://10.0.2.2:8080 for the emulator only.",
                                         444, 12.5)):
        p.append(text(92, 512 + j * 20, chunk, size=12.5, fill=PAPER_FAINT, mono=True, maxw=444))

    # wall
    wx = 620
    p.append(rect(wx, 200, 46, 380, FORGE_SOFT, APRON, rx=18))
    for i in range(9):
        p.append(line(wx + 8, 226 + i * 40, wx + 38, 226 + i * 40, APRON, 2, opacity=0.65))
    p.append(text(wx + 23, 606, "TLS", size=13, fill=APRON, weight="700", anchor="middle", maxw=80))

    # server side
    p += panel(722, 200, 814, 380)
    p.append(rect(722, 200, 814, 6, APRON, rx=3))
    p.append(text(750, 246, "services/auth-api", size=22, fill=PAPER, weight="700", maxw=340))
    p.append(text(750, 272, "Fastify · Node 20+ · PostgreSQL 16", size=12, fill=PAPER_FAINT, mono=True, maxw=420))
    p += tag(1330, 228, "single boundary", VERIFY, w=178, h=30)
    p.append(hairline(750, 292, 758))

    secrets = [
        ("KAVENEGAR_API_KEY", "SMS delivery credential"),
        ("OTP_PEPPER", "distinct from the JWT secret"),
        ("JWT_SECRET", "HS256 signing key"),
        ("DATABASE_URL", "PostgreSQL password inside"),
        ("GEMINI_API_KEY", "server-only triage key"),
        ("ZARINPAL_MERCHANT_ID", "payment merchant identity"),
    ]
    sy = 328
    for i, (key, note) in enumerate(secrets):
        col = i % 2
        row = i // 2
        x = 750 + col * 392
        y = sy + row * 62
        p.append(rect(x, y - 24, 364, 48, FORGE, FORGE_LINE, rx=12))
        p.append(rect(x, y - 24, 4, 48, APRON, rx=2))
        p.append(text(x + 18, y - 4, key, size=13, fill=PAPER, mono=True, maxw=330))
        p.append(text(x + 18, y + 14, note, size=11.5, fill=PAPER_FAINT, maxw=330))
    p.append(text(750, 544, "config.js refuses to boot on placeholder values and requires HTTPS callbacks "
                            "when payments are enabled.", size=12.5, fill=PAPER_DIM, maxw=758))

    p.append(text(64, 640, "Checked by scripts/launch-readiness-audit.sh: no provider URL or credential pattern is "
                           "read by the Android sources.", size=13.5, fill=PAPER_FAINT, maxw=1300))
    return svg_close(p)


# ---------------------------------------------------------------------------
# 13. Verification console
# ---------------------------------------------------------------------------


VERIFICATION_ROWS = [
    ("services/auth-api: npm ci", "0", "clean install from package-lock.json", VERIFY),
    ("services/auth-api: npm test", "0", "18 passed · 0 failed · node --test", VERIFY),
    ("services/auth-api: npm audit --omit=dev", "0", "0 vulnerabilities", VERIFY),
    ("scripts/launch-readiness-audit.sh --no-build", "0", "GO-WITH-EVIDENCE · 0 blockers", VERIFY),
    ("python3 tools/readme/verify_assets.py", "0", "15 SVGs parsed · links resolved", VERIFY),
    ("git diff --check", "0", "no whitespace errors", VERIFY),
    ("./gradlew tasks", "1", "JAVA_HOME not set in this sandbox", APRON),
    ("./gradlew testDebugUnitTest", "n/r", "blocked: no JDK, no Android SDK", APRON),
    ("./gradlew lint / assembleDebug", "n/r", "blocked: maven.google.com unreachable", APRON),
]


def verification_console() -> str:
    W, H = 1600, 700
    p = svg_open(W, H, "Oosta verification console", "Executed commands, exit codes and honest gaps")
    p.append(markers())
    p.append(ember(0, 0, W, 5))
    p.append(kicker(64, 72, "Verification", maxw=280))
    p.append(text(64, 116, "What was executed, and what could not be", size=34, fill=PAPER, weight="700", maxw=860))
    p.append(text(64, 148, "Exit codes below come from this checkout. Android tasks are reported as not-run rather "
                           "than assumed green.", size=16, fill=PAPER_DIM, maxw=1100))

    p += panel(64, 192, 1472, 420)
    p.append(text(92, 230, "COMMAND", size=11.5, fill=COPPER, weight="700", spacing=2, maxw=200))
    p.append(text(1000, 230, "EXIT", size=11.5, fill=COPPER, weight="700", spacing=2, maxw=100))
    p.append(text(1090, 230, "RESULT", size=11.5, fill=COPPER, weight="700", spacing=2, maxw=200))
    p.append(hairline(92, 244, 1416))

    ry = 274
    for cmd, code, result, color in VERIFICATION_ROWS:
        p.append(rect(92, ry - 24, 1416, 36, FORGE, FORGE_LINE, rx=10, opacity=0.6))
        p.append(rect(92, ry - 24, 4, 36, color, rx=2))
        p.append(text(112, ry, cmd, size=13.5, fill=PAPER, mono=True, maxw=860))
        p.append(text(1000, ry, code, size=13.5, fill=color, weight="700", mono=True, maxw=80))
        p.append(text(1090, ry, result, size=13, fill=PAPER_DIM, maxw=410))
        ry += 38

    note = ("Sandbox reality: java is absent and maven.google.com, services.gradle.org and dl.google.com are "
            "unreachable, so the Android toolchain cannot resolve. GitHub Actions runs the full Gradle path on "
            "every push to this branch.")
    for j, chunk in enumerate(_wrap(note, 1440, 13.5)):
        p.append(text(64, 646 + j * 20, chunk, size=13.5, fill=PAPER_FAINT, maxw=1440))
    return svg_close(p)


# ---------------------------------------------------------------------------
# 14. Pilot deployment
# ---------------------------------------------------------------------------


def pilot_deployment() -> str:
    W, H = 1600, 720
    p = svg_open(W, H, "Oosta pilot deployment", "Compose stack, migrations, worker and feature-gate posture")
    p.append(markers())
    p.append(ember(0, 0, W, 5))
    p.append(kicker(64, 72, "Pilot deployment", maxw=340))
    p.append(text(64, 116, "One small stack, switched on in order", size=34, fill=PAPER, weight="700", maxw=820))
    p.append(text(64, 148, "docker-compose.auth.yml · render.yaml · migrations run before the API accepts traffic.",
                  size=16, fill=PAPER_DIM, maxw=1040))

    blocks = [
        ("auth-db", "postgres:16-alpine", ["healthcheck: pg_isready", "named volume auth-db-data",
                                           "password from .env only"], COPPER),
        ("migrate", "npm run migrate", ["runs on container start", "tracked, so restarts are no-ops",
                                        "001 auth · 002 platform · 003 orders"], COPPER),
        ("auth-api", "node src/server.js", ["binds 0.0.0.0:8080", "/health checks the database",
                                            "CORS restricted to ALLOWED_ORIGINS"], APRON),
        ("escrow worker", "node src/escrow-worker.js", ["scheduled, not a daemon", "operator JWT in env",
                                                        "calls release-due, idempotent"], VERIFY),
    ]
    x = 64
    cw = 356
    for name, cmd, items, color in blocks:
        p += panel(x, 200, cw, 236)
        p.append(rect(x, 200, cw, 6, color, rx=3))
        p.append(text(x + 24, 244, name, size=20, fill=PAPER, weight="700", maxw=cw - 48))
        p.append(text(x + 24, 268, cmd, size=12, fill=PAPER_FAINT, mono=True, maxw=cw - 48))
        p.append(hairline(x + 24, 286, cw - 48))
        iy = 316
        for it in items:
            p.append(circle(x + 28, iy - 5, 3.5, color))
            for j, chunk in enumerate(_wrap(it, cw - 72, 13)):
                p.append(text(x + 42, iy + j * 18, chunk, size=13, fill=PAPER, maxw=cw - 72))
            iy += 18 * len(_wrap(it, cw - 72, 13)) + 14
        x += cw + 16

    # gate ladder
    p += panel(64, 460, 1472, 220)
    p.append(text(92, 500, "Flag ladder", size=19, fill=PAPER, weight="700", maxw=220))
    p.append(text(92, 526, "Defaults are false. Each step needs its own evidence before it flips.", size=13.5,
                  fill=PAPER_DIM, maxw=560))
    ladder = [
        ("OTP login", "always on", VERIFY),
        ("ai_diagnosis", "redaction + fallback tested", COPPER),
        ("new_bookings", "support rota live", COPPER),
        ("technician_matching", "KYC reviewers appointed", COPPER),
        ("payments", "sandbox + legal sign-off", APRON),
        ("escrow_release", "reconciliation + payout proof", APRON),
    ]
    lx = 700
    step_w = 132
    base_y = 596
    for i, (name, need, color) in enumerate(ladder):
        h = 22 + i * 14
        y = base_y - h
        p.append(rect(lx, y, step_w, h, color, rx=8, opacity=0.18))
        p.append(rect(lx, y, step_w, h, "none", color, rx=8, sw=1.2))
        p.append(text(lx + step_w / 2, base_y + 20, name, size=11, fill=color, anchor="middle", mono=True,
                      maxw=step_w + 6))
        for j, chunk in enumerate(_wrap(need, step_w + 4, 10)):
            p.append(text(lx + step_w / 2, base_y + 38 + j * 13, chunk, size=10, fill=PAPER_FAINT, anchor="middle",
                          maxw=step_w + 8))
        lx += step_w + 6
    return svg_close(p)


# ---------------------------------------------------------------------------
# 15. Footer
# ---------------------------------------------------------------------------


def footer() -> str:
    W, H = 1600, 320
    p = svg_open(W, H, "Oosta footer", "Oosta project footer with documentation entry points")
    p.append(markers())
    p.append(ember(0, 0, W, 5))
    p += apron_mark(120, 148, 0.72)
    p.append(text(192, 132, "اوستا", size=34, fill=PAPER, weight="700", maxw=180))
    p.append(text(192, 168, "OOSTA", size=22, fill=PAPER_DIM, weight="700", spacing=5, maxw=200))
    p.append(line(340, 90, 340, 210, FORGE_LINE, 1.5))

    cols = [
        ("Product", ["docs/README.md", "docs/SCREENS.md", "docs/BUSINESS_LOGIC.md"]),
        ("Engineering", ["docs/ARCHITECTURE.md", "docs/API.md", "docs/DATABASE.md"]),
        ("Operations", ["docs/DEPLOYMENT.md", "LAUNCH_CHECKLIST.md", "RISK_REGISTER.md"]),
        ("Trust", ["SECURITY.md", "docs/legal/TERMS_FA.md", "docs/legal/WARRANTY_FA.md"]),
    ]
    x = 396
    for head, items in cols:
        p.append(text(x, 112, head, size=14, fill=COPPER, weight="700", spacing=1.6, maxw=220))
        iy = 142
        for it in items:
            p.append(text(x, iy, it, size=12.5, fill=PAPER_DIM, mono=True, maxw=250))
            iy += 24
        x += 272

    p.append(hairline(64, 248, 1472))
    p.append(text(64, 284, "«اول تشخیص، بعد هزینه.» — diagnose first, price second.", size=14, fill=PAPER, maxw=560))
    p.append(text(1536, 284, "MIT licensed · security@oosta.app", size=12.5, fill=PAPER_FAINT, anchor="end",
                  mono=True, maxw=420))
    return svg_close(p)


# ---------------------------------------------------------------------------
# Runner
# ---------------------------------------------------------------------------

ASSETS = {
    "hero-oosta.svg": hero,
    "five-promises.svg": five_promises,
    "customer-journey.svg": customer_journey,
    "diagnosis-console.svg": diagnosis_console,
    "device-passport.svg": device_passport,
    "parts-tier-rack.svg": parts_tier_rack,
    "technician-evidence.svg": technician_evidence,
    "booking-state-machine.svg": booking_state_machine,
    "escrow-ledger.svg": escrow_ledger,
    "otp-auth-flow.svg": otp_auth_flow,
    "android-architecture.svg": android_architecture,
    "backend-boundary.svg": backend_boundary,
    "verification-console.svg": verification_console,
    "pilot-deployment.svg": pilot_deployment,
    "footer-oosta.svg": footer,
}


def main() -> int:
    parser = argparse.ArgumentParser(description="Build the Oosta README SVG system")
    parser.add_argument("--check", action="store_true", help="fail if any asset is missing or stale")
    args = parser.parse_args()

    OUT.mkdir(parents=True, exist_ok=True)
    stale = []
    for name, builder in ASSETS.items():
        content = builder()
        target = OUT / name
        if args.check:
            if not target.exists() or target.read_text(encoding="utf-8") != content:
                stale.append(name)
            continue
        target.write_text(content, encoding="utf-8")
        print(f"wrote {target.relative_to(ROOT)} ({len(content):,} bytes)")

    if args.check:
        if stale:
            print("stale or missing assets: " + ", ".join(stale), file=sys.stderr)
            return 1
        print(f"all {len(ASSETS)} assets are up to date")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
