#!/usr/bin/env python3
"""
Machine-checkable verification for the Android backup-exclusion rules.

Why this exists: `backup_rules.xml` is consumed by Android only on API 24-30 (from API 31 the
platform reads `data_extraction_rules.xml`), and `minSdk` is 24. An empty `<full-backup-content>`
element means "back everything up", so a missing `<exclude>` is a silent personal-data export rather
than a visible failure. There is no compiler or lint pass in this environment, so the assertion is
made directly against the parsed XML instead of being asserted in prose.

Run:  python3 tools/verify_backup_rules.py
Exit: 0 when every rule below holds, 1 otherwise.
"""

from __future__ import annotations

import sys
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RULES = ROOT / "app/src/main/res/xml/backup_rules.xml"
EXTRACTION = ROOT / "app/src/main/res/xml/data_extraction_rules.xml"
MANIFEST = ROOT / "app/src/main/AndroidManifest.xml"
GRADLE = ROOT / "app/build.gradle.kts"

failures: list[str] = []


def check(condition: bool, message: str) -> None:
    print(("  PASS  " if condition else "  FAIL  ") + message)
    if not condition:
        failures.append(message)


def main() -> int:
    print(f"verifying {RULES.relative_to(ROOT)}")

    tree = ET.parse(RULES)
    root = tree.getroot()
    check(root.tag == "full-backup-content", "root element is <full-backup-content>")

    excludes = {(e.get("domain"), e.get("path")) for e in root.findall("exclude")}
    check(("database", ".") in excludes,
          "the Room database is excluded from pre-API-31 cloud backup")
    check(("sharedpref", ".") in excludes,
          "shared preferences are excluded from pre-API-31 cloud backup")

    extraction = ET.parse(EXTRACTION).getroot()
    for section in ("cloud-backup", "device-transfer"):
        node = extraction.find(section)
        check(node is not None, f"data_extraction_rules.xml still declares <{section}>")
        if node is not None:
            domains = {(e.get("domain"), e.get("path")) for e in node.findall("exclude")}
            check(("database", ".") in domains and ("sharedpref", ".") in domains,
                  f"<{section}> still excludes database and sharedpref (API 31+)")

    manifest = MANIFEST.read_text(encoding="utf-8")
    check('android:fullBackupContent="@xml/backup_rules"' in manifest,
          "the manifest still points fullBackupContent at backup_rules.xml, so the file is live")
    check('android:dataExtractionRules="@xml/data_extraction_rules"' in manifest,
          "the manifest still points dataExtractionRules at data_extraction_rules.xml")

    gradle = GRADLE.read_text(encoding="utf-8")
    check("minSdk = 24" in gradle,
          "minSdk is still 24, which is why the legacy rule file matters")

    print()
    if failures:
        print(f"FAILED: {len(failures)} check(s)")
        return 1
    print("OK: every backup-exclusion rule holds")
    return 0


if __name__ == "__main__":
    sys.exit(main())
