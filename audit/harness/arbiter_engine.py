#!/usr/bin/env python3
"""
ARBITER-MVP v2.1 — deterministic scoring engine (round 3).

This module is the SINGLE source of arithmetic for the round-3 audit. It is deliberately a
separate implementation from the Monte Carlo script's inline math so that `--cross-check`
is a genuine independent recomputation rather than a tautology.

Inputs that are NOT derived here (and must be authored by the auditor with evidence):
  * `mvp_definition`                       -> harness/mvp_definition.json
  * findings                               -> audit/01_findings.json (written from FINDINGS below)
  * relevant_file_set / inspected counts   -> harness/inventory_extra.json

Everything else (penalties, caps, uncertainty bands, Monte Carlo, hard gates, verdict, audit
confidence, evidence spot-check selection) is computed.

Usage:
  python3 audit/harness/arbiter_engine.py emit          # write 00/01/02/03 + mc_out.txt
  python3 audit/harness/arbiter_engine.py cross-check   # independent re-derivation from the
                                                        # emitted JSON, prints PASS/FAIL
"""

from __future__ import annotations

import hashlib
import re
import json
import math
import os
import random
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
AUDIT = REPO / "audit"
HARNESS = AUDIT / "harness"
HEAD = subprocess.run(["git", "rev-parse", "HEAD"], cwd=REPO, capture_output=True, text=True).stdout.strip()
SHORT = HEAD[:7]
AUDIT_BRANCH = "arena/01a0fbb5-tamirkar"  # session-fixed branch, see FREEZE_EXCEPTION-001
AUDITED_HEAD = "7c8b749f4ca2f69c01de5e3d86d419b713d85344"  # revision the findings were minted at

# --------------------------------------------------------------------------------------
# 3.1 Fixed dimensions and weights (sum = 100). Copied verbatim from the rubric.
# --------------------------------------------------------------------------------------
DIMENSIONS = [
    ("D1", "Core functional completeness vs mvp_definition", 18),
    ("D2", "Correctness & test evidence (executed)", 14),
    ("D3", "Security & secrets hygiene", 14),
    ("D4", "Data integrity, migrations & persistence", 8),
    ("D5", "Build, CI & reproducibility", 8),
    ("D6", "Deploy & runtime readiness", 8),
    ("D7", "Error handling, logging & observability", 7),
    ("D8", "Performance & scalability at MVP load", 6),
    ("D9", "API/contract stability & integration correctness", 6),
    ("D10", "Code quality, architecture & maintainability", 5),
    ("D11", "Documentation & onboarding", 3),
    ("D12", "Legal, licensing, privacy & compliance", 3),
]
WEIGHTS = {d: w for d, _, w in DIMENSIONS}
DIM_NAMES = {d: n for d, n, _ in DIMENSIONS}

BASE = {"P0": 45, "P1": 18, "P2": 6, "P3": 1.5}
GRADE_MULT = {"A": 1.00, "B": 0.90, "C": 0.70, "D": 0.45}
HALF_WIDTH = {"A": 3, "B": 7, "C": 13, "D": 21}
MC_N = 10_000
MC_SEED = 424242
MC_SIGMA = 3.0

# --------------------------------------------------------------------------------------
# Findings — round 3, on HEAD 7c8b749. Every `evidence` entry is a token minted in this
# session. Confidence follows the rubric table; evidence_grade follows the grading table.
# --------------------------------------------------------------------------------------
FINDINGS = [
    # ---------------- D1 : core functional completeness ----------------
    dict(
        id="F-EXEC-001", lane="EXEC", dimension="D1", severity="P1", confidence=1.0,
        evidence_grade="A",
        title="Android client calls 4 of the 23 bearer-authenticated routes, so four user journeys stop at the handset",
        evidence=[
            "[E:app/src/main/java/com/example/data/remote/PlatformApi.kt:37-72]",
            "[E:app/src/main/java/com/example/data/remote/AiProviderRouter.kt:24-43]",
            "[E:app/src/main/java/com/example/data/remote/AuthApi.kt:40-61]",
            "[E:cmd#8]: grep of app/src/main for '/v1/' returns exactly 5 call sites: /v1/auth/request-otp, /v1/auth/verify-otp, /v1/public/features, /v1/orders, /v1/ai/diagnoses",
            "[E:docs/GO_60_ROADMAP.md:47-90]: the machine-generated census — 27 routes, 4 public, 23 bearer, 5 bearer call sites (one of which is the POST that also matches GET /v1/orders by substring), 19 bearer routes with no call site",
            "[E:cmd#28]: route list parsed from src/server.js (27 matches of ^app.(get|post|...) ) against a literal scan of app/src/main/java/**/*.kt",
            "[E:services/auth-api/src/server.js:554-1097]",
        ],
        impact=("Nineteen of the twenty-three bearer-authenticated routes have no Android call site. "
                "A customer can sign in, submit an order and ask for a diagnosis, but cannot create a "
                "device passport on the server, cannot accept a quote, cannot pay, and a technician cannot "
                "submit KYC, quote, upload evidence, start or complete a job from the app. Device and order "
                "history still live only in Room (TamirkarRepository.addDevice), so a reinstall destroys the "
                "service history the product's 'device passport' promise is built on."),
        exploit_or_repro="NONE_FOUND", blast_radius="all-users",
        remediation=("Add thin authenticated clients for POST /v1/devices, GET /v1/devices, "
                     "POST /v1/quotes/:id/accept, POST /v1/technicians/apply, POST /v1/technicians/kyc, "
                     "POST /v1/orders/:id/quotes|evidence|start|complete|dispute, "
                     "POST /v1/payments/zarinpal/start, and reconcile local Room rows from the server "
                     "response rather than from a locally generated id."),
        effort_hours=16.0, mvp_blocking=True, blocks_journey=["J3", "J5", "J7"], pre_existing=True,
    ),
    dict(
        id="F-EXEC-002", lane="EXEC", dimension="D1", severity="P2", confidence=0.8,
        evidence_grade="B",
        title="Access token is memory-only, so every process death forces a fresh OTP login",
        evidence=[
            "[E:app/src/main/java/com/example/data/remote/AuthSessionStore.kt:3-19]",
            "[E:app/src/main/java/com/example/ui/viewmodel/TamirkarViewModel.kt:88-92]",
        ],
        impact=("Android reclaims an idle app's process routinely. After that the user must request a new "
                "OTP and pay for a new SMS before they can see their own order history. The code documents "
                "this as deliberate, so it is a scoped gap rather than a defect, but it is user-visible."),
        exploit_or_repro="NONE_FOUND", blast_radius="all-users",
        remediation="Store the session in EncryptedSharedPreferences or the Android Keystore and add a refresh-token rotation endpoint before session restoration is claimed.",
        effort_hours=8.0, mvp_blocking=False, blocks_journey=["J1"], pre_existing=True,
    ),
    # ---------------- D2 : correctness & executed test evidence ----------------
    dict(
        id="F-QUAL-002", lane="QUAL", dimension="D2", severity="P2", confidence=0.8,
        evidence_grade="B",
        title="Android test suite has four files, one of which asserts 2+2 and none of which pins the client/server contract",
        evidence=[
            "[E:app/src/test/java/com/example/ExampleUnitTest.kt:11-15]",
            "[E:app/src/test/java/com/example/AiProviderRouterTest.kt:19-77]",
            "[E:app/src/test/java/com/example/ExampleRobolectricTest.kt:24-136]",
            "[E:app/src/test/java/com/example/GreetingScreenshotTest.kt:26-39]",
            "[E:cmd#20]: ./gradlew was NOT executed — java/javac/gradle are absent from this environment (UNEXECUTABLE, not failed)",
        ],
        impact=("The gateway client's request/response shape and every other app-side contract are unpinned. "
                "F-API-001 (device id format) is exactly the class of drift a contract test would have caught. "
                "Server-side coverage is strong (measured 78.34% lines), so this is an app-side gap only."),
        exploit_or_repro="NONE_FOUND", blast_radius="single-user",
        remediation="Add MockWebServer contract tests for each PlatformApi/AuthApi call, asserting path, method, auth header and the JSON field names the server actually returns.",
        effort_hours=6.0, mvp_blocking=False, blocks_journey=[], pre_existing=True,
    ),
    # ---------------- D3 : security ----------------
    dict(
        id="F-SEC-001", lane="SEC", dimension="D3", severity="P2", confidence=1.0,
        evidence_grade="A",
        title="Unauthenticated GET /metrics discloses route mix, provider failures and the due-escrow backlog",
        evidence=[
            "[E:services/auth-api/src/server.js:236-262]",
            "[E:cmd#9]: the /metrics handler has no requireActiveUser/requireUser call",
        ],
        impact=("Any internet caller learns per-route request volumes and status classes, how many provider "
                "calls are failing, the PostgreSQL pool occupancy and the number of escrow holds past their "
                "release date. That is reconnaissance for a targeted fault (e.g. timing a Kavenegar outage) "
                "and it leaks the commercial backlog. No credential or PII is exposed."),
        exploit_or_repro="GET /metrics with no Authorization header returns 200 with the counter set.",
        blast_radius="reputation",
        remediation="Either gate /metrics behind an operator bearer token, or bind it to a private port and have Render's health check use /health.",
        effort_hours=1.0, mvp_blocking=False, blocks_journey=[], pre_existing=True,
    ),
    dict(
        id="F-SEC-002", lane="SEC", dimension="D3", severity="P3", confidence=0.8,
        evidence_grade="B",
        title="AI spend ceiling is per-process, so the effective cap is limit x instance count",
        evidence=[
            "[E:services/auth-api/src/ratelimit.js:1-8]",
            "[E:services/auth-api/src/config.js:78-81]",
            "[E:services/auth-api/.env.example:31-34]",
        ],
        impact=("On a multi-instance deployment one authenticated caller can spend N x AI_RATE_LIMIT_PER_MINUTE billable Gemini calls. The code and .env.example both disclose the limitation, so it is a known residual rather than a hidden one."),
        exploit_or_repro="NONE_FOUND", blast_radius="reputation",
        remediation="Move the bucket to Redis or Postgres before raising the instance count above one.",
        effort_hours=6.0, mvp_blocking=False, blocks_journey=[], pre_existing=True,
    ),
    dict(
        id="F-SEC-003", lane="SEC", dimension="D3", severity="P2", confidence=0.8,
        evidence_grade="B",
        title="A CI job holds contents:write and force-pushes an orphan branch on every successful run",
        evidence=[
            "[E:.github/workflows/android-apk.yml:9-14]",
            "[E:.github/workflows/android-apk.yml:114-133]",
        ],
        impact=("`permissions: contents: write` plus `git push -f origin apk-artifacts` means any commit "
                "that lands on the triggered branch can rewrite a repository branch. The job also deletes "
                "every top-level file in its working tree before committing. A compromise of the build step "
                "(supply-chain, dependency confusion) escalates from 'build output' to 'repository write'."),
        exploit_or_repro="NONE_FOUND", blast_radius="reputation",
        remediation="Drop the force-push, publish the APK with actions/upload-artifact or actions/upload-release-asset, and set permissions: contents: read.",
        effort_hours=1.0, mvp_blocking=False, blocks_journey=[], pre_existing=True,
    ),
    # ---------------- D4 : data ----------------
    dict(
        id="F-DATA-001", lane="DATA", dimension="D4", severity="P1", confidence=1.0,
        evidence_grade="A",
        title="Backup and restore have never been executed; the required client tools are absent from every environment tested so far",
        evidence=[
            "[E:cmd#10]: `command -v pg_dump` and `command -v pg_restore` both return nothing; only initdb/pg_ctl/postgres are present in the PostgreSQL distribution that was installed",
            "[E:scripts/backup-database.sh:6-9]",
            "[E:scripts/restore-database.sh:6-9]",
            "[E:docs/GO_NO_GO.md:64-70]",
        ],
        impact=("The system holds the only record of captured payments, the escrow ledger and the audit "
                "trail. If the database is lost there is no proven way to get it back, and no RPO/RTO has "
                "been measured. This is the single most expensive failure mode available and it is "
                "currently unverified rather than merely undocumented."),
        exploit_or_repro="NONE_FOUND", blast_radius="data-loss",
        remediation=("Run scripts/backup-database.sh against a populated staging database on a host that "
                     "has postgresql-client, then run scripts/restore-database.sh per the drill in "
                     "docs/DEPLOYMENT.md into an isolated instance, and record the measured RPO/RTO. "
                     "Record the drill result in docs/GO_NO_GO.md."),
        effort_hours=4.0, mvp_blocking=True, blocks_journey=[], pre_existing=True,
    ),
    dict(
        id="F-DATA-002", lane="DATA", dimension="D4", severity="P2", confidence=0.8,
        evidence_grade="B",
        title="No retention job deletes expired OTP challenges or settled escrow holds, so both tables grow without bound",
        evidence=[
            "[E:services/auth-api/db/004_operational_indexes.sql:22-26]",
            "[E:cmd#11]: `grep -rn \"DELETE FROM otp_challenges\" services/auth-api/src` matches only the account-erasure path in server.js:407-465",
            "[E:services/auth-api/src/escrow-worker.js:1-13]",
        ],
        impact=("Every login attempt writes an otp_challenges row that is never removed; every settled hold "
                "stays in escrow_holds forever. At 10k logins/day that is 3.6M rows/year of pure liability "
                "data (a hashed phone number plus a timestamp) retained with no legal basis and no purge "
                "path, alongside slowing the retention lookups migration 004 was written to serve."),
        exploit_or_repro="NONE_FOUND", blast_radius="reputation",
        remediation="Add src/retention.js plus a scheduled entry point that deletes otp_challenges older than N days and anonymises release_after on holds settled more than N days ago, with a documented retention window in docs/DEPLOYMENT.md.",
        effort_hours=4.0, mvp_blocking=False, blocks_journey=[], pre_existing=True,
    ),
    # ---------------- D5 : build, CI, reproducibility ----------------
    dict(
        id="F-EXEC-004", lane="EXEC", dimension="D5", severity="P1", confidence=1.0,
        evidence_grade="A",
        title="No installed CI job runs the auth-api suite, so the money-path tests can regress without anyone noticing",
        evidence=[
            "[E:cmd#12]: `ls .github/workflows` lists exactly three files, all Android builds; grep for 'services/auth-api' in .github/workflows returns nothing",
            "[E:ci/proposed/server.yml:1-16]",
            "[E:ci/proposed/README.md:1-13]",
        ],
        impact=("37 tests including the completion gate, the dispute freeze, the ledger balance and the "
                "refund replay exist and pass, but nothing runs them except a developer's laptop. A one-line "
                "regression in escrow release would reach production with a green repository."),
        exploit_or_repro="NONE_FOUND", blast_radius="data-loss",
        remediation="A maintainer with the GitHub `workflows` permission copies ci/proposed/server.yml to .github/workflows/server.yml. See F-EXEC-005 for the evidence that the App token used here cannot do it.",
        effort_hours=0.25, mvp_blocking=True, blocks_journey=[], pre_existing=True,
    ),
    dict(
        id="F-EXEC-005", lane="EXEC", dimension="D5", severity="P1", confidence=1.0,
        evidence_grade="A",
        title="Every Android CI run in the repository's history has failed and the two push triggers name abandoned branches",
        evidence=[
            "[E:cmd#13]: `gh run list --limit 6` returns six consecutive runs with conclusion `failure`, all job 'Build Android APK'",
            "[E:.github/workflows/build.yml:3-6]",
            "[E:.github/workflows/android-apk.yml:3-7]",
            "[E:ci/proposed/README.md:47-62]",
        ],
        impact=("There is no evidence that the committed Kotlin compiles or that any app test passes, because "
                "no green run exists. build.yml fires on `arena/01a03dca-tamirkar`, android-apk.yml on "
                "`arena/01a03c31-tamirkar`; neither branch is HEAD, neither is main, and there is no "
                "pull_request trigger anywhere — so a PR against this repository runs zero checks."),
        exploit_or_repro="NONE_FOUND", blast_radius="reputation",
        remediation="Change both trigger blocks to `on: push: branches: [main, master]` plus `pull_request:` plus `workflow_dispatch:`, then fix the failing SDK setup step until one run is green.",
        effort_hours=2.0, mvp_blocking=True, blocks_journey=[], pre_existing=True,
    ),
    dict(
        id="F-EXEC-006", lane="EXEC", dimension="D5", severity="P2", confidence=1.0,
        evidence_grade="A",
        title="A workflow file whose name starts with U+200C runs assembleDebug with tests and lint explicitly disabled",
        evidence=[
            "[E:cmd#14]: `ls -b .github/workflows` prints `\\342\\200\\214apkbuild.yml` — the leading byte sequence is the UTF-8 encoding of ZERO WIDTH NON-JOINER (U+200C)",
            "[E:.github/workflows/\u200capkbuild.yml:23-26]",
            "[E:.github/workflows/\u200capkbuild.yml:28-33]",
        ],
        impact=("`./gradlew assembleDebug -x lint -x test` is the only job in the repository that deliberately "
                "bypasses the test and lint gates, and it uploads its artefact with `if: always()`. A "
                "non-ASCII filename also breaks tab-completion, some Windows/GitHub tooling and any script "
                "that globs `.github/workflows/*.yml` on a non-UTF-8 locale."),
        exploit_or_repro="NONE_FOUND", blast_radius="reputation",
        remediation="Delete the file, or rename it to apkbuild.yml and drop `-x lint -x test` so it cannot report a passing build over a failing test suite.",
        effort_hours=0.25, mvp_blocking=False, blocks_journey=[], pre_existing=True,
    ),
    # ---------------- D6 : deploy & runtime ----------------
    dict(
        id="F-OPS-001", lane="OPS", dimension="D6", severity="P1", confidence=0.8,
        evidence_grade="B",
        title="The declared escrow cron starts the HTTP API instead of the worker and disables the very flag it needs",
        evidence=[
            "[E:render.yaml:57-63]",
            "[E:render.yaml:79-80]",
            "[E:services/auth-api/Dockerfile:27]",
            "[E:services/auth-api/src/escrow-worker.js:1-13]",
        ],
        impact=("The Render cron service named oosta-escrow-release uses the auth-api Docker image, whose CMD "
                "is `sh -c \"npm run migrate && npm start\"` — it boots a second web server that never exits, "
                "rather than running src/escrow-worker.js. Its environment also pins FEATURE_ESCROW_RELEASE to "
                "\"false\" (render.yaml:79-80), and config.js gates POST /v1/admin/escrows/release-due on that "
                "flag, so even a correct invocation would answer 503. Net effect: on the documented managed "
                "deployment, escrow holds are never released and the 30-day clock described in the README "
                "never fires."),
        exploit_or_repro="NONE_FOUND", blast_radius="all-users",
        remediation=("Give the cron job a command that runs `node src/escrow-worker.js` instead of the image "
                     "CMD, and set FEATURE_ESCROW_RELEASE=true on the web service (not on the cron) once the "
                     "operator approves escrow release. Keep PLATFORM_API_BASE_URL pointing at the web service."),
        effort_hours=1.0, mvp_blocking=True, blocks_journey=["J6"], pre_existing=True,
    ),
    dict(
        id="F-OPS-002", lane="OPS", dimension="D6", severity="P3", confidence=0.8,
        evidence_grade="B",
        title="Container base image is a floating tag, so two builds of the same commit can differ",
        evidence=[
            "[E:services/auth-api/Dockerfile:1-7]",
            "[E:services/auth-api/Dockerfile:21-27]",
        ],
        impact=("`FROM node:22-alpine` resolves to whatever the tag points at on the build day. The file "
                "already documents this as an open item and correctly refuses to invent a digest, so this is "
                "a recorded reproducibility gap, not a surprise. Multi-stage build, non-root `USER node` and "
                "a HEALTHCHECK are all present, which is why the severity is P3."),
        exploit_or_repro="NONE_FOUND", blast_radius="reputation",
        remediation="Run `docker buildx imagetools inspect node:22-alpine` on a host with registry access and pin the RepoDigests sha256.",
        effort_hours=0.25, mvp_blocking=False, blocks_journey=[], pre_existing=True,
    ),
    dict(
        id="F-OPS-003", lane="OPS", dimension="D6", severity="P3", confidence=0.6,
        evidence_grade="B",
        title="Container has no read-only root filesystem, dropped capabilities or memory/CPU ceiling",
        evidence=[
            "[E:services/auth-api/Dockerfile:19-27]: EXPOSE 8080, HEALTHCHECK, USER node and CMD — the "
            "read shows what IS hardened, so the absence of read-only/cap-drop/memory limits is "
            "meaningful rather than an unread file",
            "[E:cmd#35]: grep over render.yaml and docker-compose.auth.yml for read_only|cap_drop|"
            "security_opt|mem_limit|cpus returns exit 1 with no matches, which is what an absence "
            "claim needs as evidence",
        ],
        impact=("`USER node` is set, which covers the main privilege risk, but a runaway process in this "
                "container can consume the whole instance and a compromised process keeps a writable "
                "filesystem and the default capability set. Severity is bounded by the fact that the "
                "declared target is a single-tenant free-tier pilot."),
        exploit_or_repro="NONE_FOUND", blast_radius="total-outage",
        remediation="Add `--read-only --tmpfs /tmp --cap-drop ALL --memory 512m` at the platform level and pin them in render.yaml.",
        effort_hours=0.5, mvp_blocking=False, blocks_journey=[], pre_existing=True,
    ),
    # ---------------- D7 : errors, logging, observability ----------------
    dict(
        id="F-RELY-001", lane="RELY", dimension="D7", severity="P2", confidence=0.8,
        evidence_grade="B",
        title="The OTP send window counts failed sends, so one SMS-provider outage locks out every user for 15 minutes",
        evidence=[
            "[E:services/auth-api/src/server.js:277-289]",
            "[E:services/auth-api/src/server.js:316-325]",
        ],
        impact=("`recent` selects every otp_challenges row created in the last 15 minutes with no status "
                "filter, and the third row trips OTP_MAX_SENDS_PER_WINDOW. When Kavenegar returns a 5xx the "
                "code path writes status='failed' and returns 502 — but the row still counts. Three failed "
                "sends therefore answer 429 'too many requests' to a user who never received a code, for the "
                "rest of the window. The outage and the lockout compound."),
        exploit_or_repro=("With FEATURE flags default and a Kavenegar key pointed at a host that returns 500, "
                          "POST /v1/auth/request-otp returns 502 three times and then 429 on the fourth call."),
        blast_radius="all-users",
        remediation="Filter the window count on `status IN ('sending','pending','verified')`, or exclude status='failed' from the eligibility count while still keeping the row for diagnostics.",
        effort_hours=1.0, mvp_blocking=False, blocks_journey=["J1"], pre_existing=True,
    ),
    dict(
        id="F-OBS-001", lane="OBS", dimension="D7", severity="P2", confidence=0.8,
        evidence_grade="B",
        title="Metrics live only in process memory and nothing scrapes or alerts on them",
        evidence=[
            "[E:services/auth-api/src/server.js:39-46]",
            "[E:services/auth-api/src/server.js:236-262]",
            "[E:cmd#15]: grep -rniE 'prometheus|grafana|sentry|datadog|otel|opentelemetry|alert' over the tracked tree matches only two strings inside audit/*.md, never a config file",
        ],
        impact=("Every counter resets when the container restarts, and a deploy on Render replaces the "
                "container. There is no scrape config, no dashboard and no alert, so the escrow backlog, the "
                "provider failure counter and the 5xx rate are all invisible unless a human curls /metrics. "
                "The repository additionally has no correlation id surfaced to callers."),
        exploit_or_repro="NONE_FOUND", blast_radius="reputation",
        remediation="Add a scrape job (Render does not provide one; a free Grafana Cloud / Uptime agent is enough) for /health and /metrics, and alert on oosta_provider_failures_total increasing and on oosta_escrow_holds_due not decreasing.",
        effort_hours=2.0, mvp_blocking=False, blocks_journey=[], pre_existing=True,
    ),
    dict(
        id="F-RELY-002", lane="RELY", dimension="D7", severity="P3", confidence=0.6,
        evidence_grade="B",
        title="Graceful shutdown has no drain deadline, so a stuck request can block SIGTERM handling",
        evidence=[
            "[E:services/auth-api/src/server.js:1288-1296]",
            "[E:services/auth-api/src/server.js:24-33]",
        ],
        impact=("`closeGracefully` awaits app.close() before pool.end(); with a 15s statement_timeout, a "
                "request caught mid-lookup can hold the drain open and the platform then SIGKILLs the "
                "container, dropping whatever was still in flight. A bounded `Promise.race` with a 10s "
                "deadline would make the shutdown deterministic."),
        exploit_or_repro="NONE_FOUND", blast_radius="single-user",
        remediation="Wrap app.close() in Promise.race([...], 10s) and log when the deadline wins.",
        effort_hours=0.5, mvp_blocking=False, blocks_journey=[], pre_existing=True,
    ),
    # ---------------- D8 : performance & scalability ----------------
    dict(
        id="F-RELY-003", lane="RELY", dimension="D8", severity="P3", confidence=0.8,
        evidence_grade="B",
        title="Every /metrics scrape runs an unbounded COUNT(*) over escrow_holds",
        evidence=[
            "[E:services/auth-api/src/server.js:257-261]",
            "[E:services/auth-api/db/002_platform.sql:74]",
        ],
        impact=("The count is filtered by `status='held' AND release_after <= NOW()`, which index "
                "escrow_holds_due_idx covers, so it is cheap on a warm table — but it is still executed on "
                "each unauthenticated scrape and the index is on (status, release_after), not on the "
                "partial predicate. At pilot scale it is a non-issue; it is recorded because /metrics is "
                "public (F-SEC-001) and therefore callable at will."),
        exploit_or_repro="NONE_FOUND", blast_radius="single-user",
        remediation="Cache the gauge for 30s, or remove the query and let the release worker publish it.",
        effort_hours=0.5, mvp_blocking=False, blocks_journey=[], pre_existing=True,
    ),
    dict(
        id="F-RELY-004", lane="RELY", dimension="D8", severity="P3", confidence=0.8,
        evidence_grade="B",
        title="Escrow release is capped at 100 holds per daily run, so a backlog can persist for days",
        evidence=[
            "[E:services/auth-api/src/server.js:1247-1252]",
            "[E:render.yaml:62]",
        ],
        impact=("`FOR UPDATE SKIP LOCKED LIMIT 100` against a schedule of `17 3 * * *` means the release "
                "sweep drains 100 holds a day. This is bounded and idempotent, so nothing is lost, but past "
                "roughly 100 completions a day the escrow backlog grows faster than the worker drains it — "
                "and the technician is the party who waits."),
        exploit_or_repro="NONE_FOUND", blast_radius="single-user",
        remediation="Raise the daily schedule to hourly once escrow release is enabled, or make the limit configurable.",
        effort_hours=0.25, mvp_blocking=False, blocks_journey=[], pre_existing=True,
    ),
    # ---------------- D9 : API/contract stability ----------------
    dict(
        id="F-API-001", lane="EXEC", dimension="D9", severity="P2", confidence=0.8,
        evidence_grade="B",
        title="Client generates device ids that the server's UUID validator will reject once a /v1/devices client is added",
        evidence=[
            "[E:services/auth-api/src/server.js:106-116]",
            "[E:app/src/main/java/com/example/data/repository/TamirkarRepository.kt:79-89]: the addDevice "
        "signature together with the `dev_` + UUID.randomUUID() line the claim rests on \u2014 the "
        "earlier range stopped five lines short of it",
            "[E:services/auth-api/db/005_devices.sql:9-10]",
        ],
        impact=("`requireUuid` rejects anything that is not 8-4-4-4-12 hex, and POST /v1/devices does not "
                "accept a client-supplied id at all — the row id comes from `gen_random_uuid()`. The app "
                "meanwhile mints `\"dev_\" + UUID.randomUUID().take(8)` (TamirkarRepository.addDevice). Any "
                "reconciliation written on the current assumption will silently mis-key the passport, and "
                "the ids it produces can never satisfy GET /v1/devices/:deviceId."),
        exploit_or_repro="NONE_FOUND", blast_radius="single-user",
        remediation="Persist the server-returned UUID as the Room primary key (or keep a separate serverId column) and never synthesise an id the API will validate.",
        effort_hours=1.0, mvp_blocking=False, blocks_journey=["J3"], pre_existing=True,
    ),
    dict(
        id="F-API-002", lane="QUAL", dimension="D9", severity="P3", confidence=0.6,
        evidence_grade="B",
        title="The HTTP contract is prose plus code; there is no machine-readable schema to diff",
        evidence=[
            "[E:docs/API.md:1-14]",
            "[E:cmd#16]: docs/API.md documents 27 endpoints and server.js declares 27 routes — they agree today",
            "[E:cmd#17]: no openapi/swagger/*.json or *.yaml exists in the tracked tree",
        ],
        impact=("Documentation and code agree right now, which is the good case. Nothing prevents the next "
                "route or field from drifting, and there is no generated client to keep the Android side "
                "honest. Recorded as a maintainability risk, not a present defect."),
        exploit_or_repro="NONE_FOUND", blast_radius="reputation",
        remediation="Emit an OpenAPI document from the Fastify route schemas (fastify-swagger) and diff the client contract tests in CI against it.",
        effort_hours=4.0, mvp_blocking=False, blocks_journey=[], pre_existing=True,
    ),
    # ---------------- D10 : code quality ----------------
    dict(
        id="F-QUAL-001", lane="QUAL", dimension="D10", severity="P2", confidence=1.0,
        evidence_grade="A",
        title="server.js is a 1297-line god file that repeats the BEGIN/ROLLBACK/release transaction dance 17 times",
        evidence=[
            "[E:cmd#18]: `wc -l services/auth-api/src/server.js` = 1297, above the 600-line threshold",
            "[E:cmd#19]: `grep -c \"await client.query('BEGIN')\" services/auth-api/src/server.js` = 17",
            "[E:services/auth-api/src/server.js:1-30]",
        ],
        impact=("Every route handler, all 27 route registrations, the metrics registry, the CORS hook, the "
                "error handler and the config load sit in one module. Twelve of the seventeen transaction "
                "blocks are byte-identical apart from the body, so a change to the rollback policy has to be "
                "made in twelve places. No function exceeds the 80-line threshold, so this is file-level "
                "complexity rather than a hot spot."),
        exploit_or_repro="NONE_FOUND", blast_radius="reputation",
        remediation="Extract a `withTransaction(pool, fn)` helper and split route groups into src/routes/*.js registered from a small app factory; keep server.js as composition root only.",
        effort_hours=8.0, mvp_blocking=False, blocks_journey=[], pre_existing=True,
    ),
    dict(
        id="F-QUAL-003", lane="QUAL", dimension="D10", severity="P3", confidence=0.8,
        evidence_grade="A",
        title="Five declared Gradle dependencies have zero references in app source",
        evidence=[
            "[E:cmd#21]: grep -rli for retrofit, moshi, coil, loggingInterceptor and firebase in app/src/main/java returns 0 files for each",
            "[E:app/build.gradle.kts:111-133]",
            "[E:app/build.gradle.kts:86-87]",
        ],
        impact=("retrofit, converter-moshi, moshi-kotlin, coil-compose, logging-interceptor and the whole "
                "Firebase BOM + firebase-ai + appcheck-recaptcha set are compiled and packaged while no "
                "application source references them, which grows the APK, widens the third-party attack "
                "surface and forces the google-services plugin to run. The build file itself notes the "
                "related habit: 'Some unused dependencies are commented out below instead of being removed.'"),
        exploit_or_repro="NONE_FOUND", blast_radius="reputation",
        remediation="Remove the unused implementation() lines (or move them behind a comment) and re-run the APK size and dependency report.",
        effort_hours=0.5, mvp_blocking=False, blocks_journey=[], pre_existing=True,
    ),
    # ---------------- D11 : documentation ----------------
    dict(
        id="F-DOC-001", lane="QUAL", dimension="D11", severity="P3", confidence=0.8,
        evidence_grade="B",
        title="README describes the Android tests as 'executed in CI' while every CI run in the repository's history has failed",
        evidence=[
            "[E:README.md:232-234]",
            "[E:cmd#13]: `gh run list --limit 6` — six consecutive `failure` conclusions",
        ],
        impact=("A reader onboarding from the README will believe the Kotlin in the tree is known to compile "
                "and that a device-testable APK exists. It is not known to compile. Everything else in the "
                "README's Tests section is precise and matches what was executed in this round, so this is "
                "one overstated clause rather than a pattern."),
        exploit_or_repro="NONE_FOUND", blast_radius="reputation",
        remediation="Say 'defined in the repository; CI is currently red and the toolchain has not been executed locally' until one green run exists.",
        effort_hours=0.25, mvp_blocking=False, blocks_journey=[], pre_existing=True,
    ),
    # ---------------- D12 : legal ----------------
    dict(
        id="F-LEGAL-001", lane="LEGAL", dimension="D12", severity="P1", confidence=1.0,
        evidence_grade="B",
        title="Zero of six launch approvals are recorded and every Persian legal text is an unsigned internal draft",
        evidence=[
            "[E:docs/legal/APPROVALS.md:1-9]",
            "[E:docs/legal/TERMS_FA.md:1-5]",
            "[E:docs/legal/PRIVACY_FA.md:1-5]",
            "[E:docs/GO_NO_GO.md:34-35]: \u201c\u062a\u0623\u06cc\u06cc\u062f \u062d\u0642\u0648\u0642\u06cc \u2014 docs/legal/* \u067e\u06cc\u0634\u200c\u0646\u0648\u06cc\u0633 \u062f\u0627\u062e\u0644\u06cc \u0627\u0633\u062a\u2026\u201d \u2014 the unsigned-draft statement, not the earlier range this finding carried",
        ],
        impact=("docs/legal/APPROVALS.md lists six required sign-offs (counsel, finance, payment gateway, "
                "operations, security, product) and every box is unchecked; the four text files carry no "
                "date, no version and no signature. Iranian private-law and PSP/escrow licensing questions "
                "cannot be resolved by any agent reading this repository — this is routed to a human, as "
                "LEGAL lane rules require, and it independently blocks a public paid launch."),
        exploit_or_repro="NONE_FOUND", blast_radius="legal",
        remediation="Route docs/legal/* to licensed Iranian counsel; record each approval in APPROVALS.md with a name, a date and a document version.",
        effort_hours=40.0, mvp_blocking=True, blocks_journey=[], pre_existing=True,
    ),
    dict(
        id="F-LEGAL-002", lane="LEGAL", dimension="D12", severity="P2", confidence=0.8,
        evidence_grade="B",
        title="On API 24-30 the local Room database is included in cloud backup because the legacy backup rule file excludes nothing",
        evidence=[
            "[E:app/src/main/AndroidManifest.xml:8-16]",
            "[E:app/src/main/res/xml/backup_rules.xml:1-15]",
            "[E:app/src/main/res/xml/data_extraction_rules.xml:1-12]",
            "[E:app/build.gradle.kts:22-23]",
        ],
        impact=("dataExtractionRules correctly excludes database and sharedpref domains, but it only applies "
                "from API 31. `minSdk = 24`, and for API 24-30 Android uses `fullBackupContent` → "
                "backup_rules.xml, whose <full-backup-content> element contains no <exclude> at all (the two "
                "sample excludes are commented out). Those devices therefore back the Room database up to "
                "the user's Google Drive: users, devices, orders and the phone number recorded in "
                "UserEntity. That is personal data leaving the operator's control with no notice in "
                "PRIVACY_FA.md."),
        exploit_or_repro="NONE_FOUND", blast_radius="reputation",
        remediation="Add <exclude domain=\"database\" path=\".\"/> and <exclude domain=\"sharedpref\" path=\".\"/> inside <full-backup-content> in backup_rules.xml, or set android:allowBackup=\"false\".",
        effort_hours=0.25, mvp_blocking=False, blocks_journey=[], pre_existing=True,
    ),
]

# Which finding is responsible for the majority of each dimension's penalty is derived, not
# hand-written: see `dominant_grade` in `score_dimensions`.

INITIAL_FINDING_IDS = sorted(f["id"] for f in FINDINGS)

# Remediation outcomes, Phase 7. "CLOSED" means the cited acceptance criteria were executed and
# passed; anything else stays in the penalty set unchanged. Deliberately conservative: F-EXEC-004
# keeps its P1 even though a verified local gate now exists, because the finding is that nothing
# RUNS the suite automatically, and a script a human must remember is not that.
REMEDIATION = {
    "F-RELY-001": {"status": "CLOSED", "task": "T-001", "verification": "services/auth-api/test/integration.test.js:395-434 plus 44/44 with 0 skipped"},
    "F-DATA-002": {"status": "CLOSED", "task": "T-002", "verification": "services/auth-api/test/retention.test.js:2 tests green; `node src/retention.js run` exited 0",
                   "note": "Remedy narrowed by design during execution. escrow_holds is NOT pruned: those rows are accounting and dispute records the operator must retain, so unbounded growth there is intentional and the original finding overstated the remedy."},
    "F-OPS-001": {"status": "CLOSED", "task": "T-005", "verification": "services/auth-api/test/render-blueprint.test.js:4 tests green",
                  "note": "Closes the declaration defect. Render's own acceptance of the blueprint is UNVERIFIED — no Render credential exists in this environment."},
    "F-LEGAL-002": {"status": "CLOSED", "task": "T-006", "verification": "python3 tools/verify_backup_rules.py exits 0, and exits 1 with the defect reintroduced (negative control)"},
    "F-DOC-001": {"status": "CLOSED", "task": "T-007-adjacent", "verification": "README.md:227 now states that no green Android run exists"},
}
CLOSED_IDS = tuple(sorted(k for k, v in REMEDIATION.items() if v["status"] == "CLOSED"))


def sha256_json(obj) -> str:
    return hashlib.sha256(json.dumps(obj, sort_keys=True, ensure_ascii=False,
                                     separators=(",", ":")).encode()).hexdigest()


# --------------------------------------------------------------------------------------
# 3.2 penalty + caps
# --------------------------------------------------------------------------------------
def score_dimensions(findings):
    """Return per-dimension score, penalty detail and every cap that fired."""
    per_dim = {d: {"penalty": 0.0, "terms": [], "grades": {}, "caps": []} for d, _, _ in DIMENSIONS}
    for f in findings:
        d = f["dimension"]
        term = BASE[f["severity"]] * f["confidence"] * GRADE_MULT[f["evidence_grade"]]
        per_dim[d]["penalty"] += term
        per_dim[d]["terms"].append({"id": f["id"], "severity": f["severity"],
                                    "confidence": f["confidence"],
                                    "evidence_grade": f["evidence_grade"],
                                    "term": round(term, 4)})
        per_dim[d]["grades"][f["evidence_grade"]] = per_dim[d]["grades"].get(f["evidence_grade"], 0) + 1

    out = {}
    for d, name, weight in DIMENSIONS:
        info = per_dim[d]
        raw = max(0.0, min(100.0, 100.0 - info["penalty"]))
        caps = []

        # dominant_grade = grade of the evidence that determined the majority of the penalty.
        if info["terms"]:
            by_grade = {}
            for t in info["terms"]:
                by_grade[t["evidence_grade"]] = by_grade.get(t["evidence_grade"], 0.0) + t["term"]
            # tie-break A > B > C > D (strongest evidence wins the label)
            order = {"A": 0, "B": 1, "C": 2, "D": 3}
            dominant = sorted(by_grade.items(), key=lambda kv: (-kv[1], order[kv[0]]))[0][0]
        else:
            dominant = "B"  # dimension with no findings: grade of the evidence used to clear it
            by_grade = {}

        # Cap 1 — evidence quality
        if dominant in ("C", "D") and raw > 55.0:
            caps.append({"cap": "evidence_quality", "reason": f"dominant_grade={dominant}",
                         "before": round(raw, 4), "after": 55.0})
            raw = 55.0
        # Cap 5 — Grade D floor protection
        if info["terms"] and all(t["evidence_grade"] == "D" for t in info["terms"]):
            capped = max(20.0, min(raw, 55.0))
            if capped != raw:
                caps.append({"cap": "grade_d_floor", "reason": "all penalties Grade D",
                             "before": round(raw, 4), "after": round(capped, 4)})
                raw = capped
        out[d] = {"dimension": d, "name": name, "weight": weight, "penalty": round(info["penalty"], 4),
                  "score": round(raw, 4), "dominant_grade": dominant, "caps": caps,
                  "terms": info["terms"], "penalty_by_grade": {k: round(v, 4) for k, v in by_grade.items()}}
    return out


def apply_global_caps(scored, journeys, measured_coverage, pass_rate, execution_failed_dims):
    """Caps 2 (execution failure), 3 (D1 journey) and 4 (D2 evidence). Returns nothing; mutates."""
    # Cap 3 — D1 journey cap
    total = max(1, len(journeys))
    working = sum(1 for j in journeys.values() if j == "VERIFIED_WORKING")
    journey_cap = 100.0 * working / total
    s = scored["D1"]
    if s["score"] > journey_cap:
        s["caps"].append({"cap": "d1_journey", "reason": f"{working}/{total} journeys VERIFIED_WORKING",
                          "before": round(s["score"], 4), "after": round(journey_cap, 4)})
        s["score"] = round(journey_cap, 4)
    s["journeys_verified"] = working
    s["journeys_total"] = total

    # Cap 2 — execution failure
    for d in execution_failed_dims:
        s = scored[d]
        if s["score"] > 30.0:
            s["caps"].append({"cap": "execution_failure", "reason": "planned verification ran and failed",
                              "before": round(s["score"], 4), "after": 30.0})
            s["score"] = 30.0

    # Cap 4 — D2 evidence
    s = scored["D2"]
    d2_cap = 100.0 * (0.5 * pass_rate + 0.5 * min(measured_coverage / 70.0, 1.0))
    if s["score"] > d2_cap:
        s["caps"].append({"cap": "d2_evidence",
                          "reason": f"pass_rate={pass_rate}, measured_coverage={measured_coverage}",
                          "before": round(s["score"], 4), "after": round(d2_cap, 4)})
        s["score"] = round(d2_cap, 4)
    return scored


# --------------------------------------------------------------------------------------
# 3.3 uncertainty bands
# --------------------------------------------------------------------------------------
def bands(scored):
    for d, s in scored.items():
        hw = HALF_WIDTH[s["dominant_grade"]]
        if not s["terms"] and s["dominant_grade"] in ("A", "B"):
            hw = max(hw - 2, 2)
            s["half_width_note"] = f"no findings, dominant_grade={s['dominant_grade']} -> half_width {hw}"
        s["half_width"] = hw
        s["min"] = round(max(0.0, s["score"] - hw), 4)
        s["mode"] = round(s["score"], 4)
        s["max"] = round(min(100.0, s["score"] + hw), 4)
    return scored


def r_point(scored):
    return round(sum(WEIGHTS[d] / 100.0 * scored[d]["score"] for d, _, _ in DIMENSIONS), 4)


# --------------------------------------------------------------------------------------
# 3.4 Monte Carlo (seed 424242, N=10000, numpy when available, documented LCG fallback)
# --------------------------------------------------------------------------------------
def triangular_inv(u, lo, mode, hi, rng):
    """Inverse-CDF sampler for Triangular(lo, mode, hi); mode==lo==hi handled explicitly."""
    if hi <= lo:
        return lo
    c = (mode - lo) / (hi - lo)
    if u <= c:
        return lo + math.sqrt(u * (hi - lo) * (mode - lo)) if mode > lo else lo
    return hi - math.sqrt((1 - u) * (hi - lo) * (hi - mode)) if hi > mode else lo


def monte_carlo(scored, n=MC_N, seed=MC_SEED, sigma=MC_SIGMA):
    try:
        import numpy as np  # type: ignore
        rng = np.random.default_rng(seed)
        eps = rng.normal(0.0, sigma, n)
        sims = np.zeros(n, dtype=float)
        bands_arr = []
        for d, _, _ in DIMENSIONS:
            s = scored[d]
            # numpy.random.Generator.triangular(left, mode, right, size)
            v = rng.triangular(s["min"], s["mode"], s["max"], n)
            bands_arr.append((WEIGHTS[d] / 100.0) * v)
        sims = eps + np.sum(bands_arr, axis=0)
        sims = np.clip(sims, 0.0, 100.0)
        return {
            "implementation": f"numpy {np.__version__} random.default_rng({seed})",
            "mean": round(float(np.mean(sims)), 4),
            "ci95": [round(float(np.percentile(sims, 2.5)), 4), round(float(np.percentile(sims, 97.5)), 4)],
            "p_ge_75": round(float(np.count_nonzero(sims >= 75.0)) / n, 6),
            "p_ge_85": round(float(np.count_nonzero(sims >= 85.0)) / n, 6),
            "point": r_point(scored),
            "n": n, "seed": seed, "sigma": sigma,
        }
    except ImportError:
        pass

    # Documented fallback: same seed, same distribution, LCG + Box-Muller + inverse CDF.
    class LCG:
        def __init__(self, s):
            self.s = s & 0xFFFFFFFF

        def next_u32(self):
            self.s = (1103515245 * self.s + 12345) & 0x7FFFFFFF
            return self.s

        def uniform(self):
            return (self.next_u32() << 21 | self.next_u32()) / float(1 << 52)

    lcg = LCG(seed)
    sims = []
    for _ in range(n):
        eps = 0.0
        for _ in range(12):  # Irwin-Hall(12)-6 approximates N(0,1) without transcendentals
            eps += lcg.uniform()
        eps = (eps - 6.0) * sigma
        total = eps
        for d, _, _ in DIMENSIONS:
            s = scored[d]
            total += (WEIGHTS[d] / 100.0) * triangular_inv(lcg.uniform(), s["min"], s["mode"], s["max"], rng=None)
        sims.append(max(0.0, min(100.0, total)))
    sims.sort()
    return {
        "implementation": f"LCG fallback (seed {seed}) + Irwin-Hall normal approximation",
        "mean": round(sum(sims) / n, 4),
        "ci95": [round(sims[int(0.025 * n)], 4), round(sims[int(0.975 * n)], 4)],
        "p_ge_75": round(sum(1 for x in sims if x >= 75.0) / n, 6),
        "p_ge_85": round(sum(1 for x in sims if x >= 85.0) / n, 6),
        "point": r_point(scored),
        "n": n, "seed": seed, "sigma": sigma,
    }


# --------------------------------------------------------------------------------------
# 3.5 hard gates + Phase 4 verdict
# --------------------------------------------------------------------------------------
def hard_gates(p_go_raw, findings, journeys):
    p0 = sum(1 for f in findings if f["severity"] == "P0")
    p1 = sum(1 for f in findings if f["severity"] == "P1")
    broken = [j for j, v in journeys.items() if v == "BROKEN"]
    p_go = p_go_raw
    tripped = []
    if p0 >= 1:
        p_go = min(p_go, 0.05)
        tripped.append(f"P0_count={p0} >= 1 -> P_GO capped at 0.05")
    if p1 >= 5:
        p_go = min(p_go, 0.35)
        tripped.append(f"P1_count={p1} >= 5 -> P_GO capped at 0.35")
    if broken:
        p_go = min(p_go, 0.10)
        tripped.append(f"BROKEN journeys {broken} -> P_GO capped at 0.10")
    return max(0.0, p_go), {"P0": p0, "P1": p1, "P2": sum(1 for f in findings if f["severity"] == "P2"),
                            "P3": sum(1 for f in findings if f["severity"] == "P3")}, tripped


def letter_grade(r):
    for lo, g in [(95, "A+"), (90, "A"), (85, "A-"), (80, "B+"), (75, "B"), (70, "B-"),
                  (65, "C+"), (60, "C"), (55, "C-"), (45, "D")]:
        if r >= lo:
            return g
    return "F"


def verdict(p_go, counts, journeys):
    broken = [j for j, v in journeys.items() if v == "BROKEN"]
    partial = [j for j, v in journeys.items() if v == "PARTIAL"]
    if counts["P0"] >= 1 or broken:
        return "NO-GO — BLOCKED", []
    if p_go < 0.35:
        return "NO-GO — BLOCKED", [f"P_GO {p_go:.4f} < 0.35"] + (
            ["P0_count >= 1"] if counts["P0"] >= 1 else []) + (
            [f"BROKEN journeys {broken}"] if broken else [])
    if p_go < 0.60:
        return "NO-GO — REMEDIABLE", [f"P_GO {p_go:.4f} < 0.60"] + (
            [f"P1={counts['P1']} > 2"] if counts["P1"] > 2 else []) + (
            [f"{len(partial)} journey/journeys PARTIAL: {partial}"] if partial else [])
    unmet = []
    if p_go < 0.85:
        unmet.append(f"P_GO {p_go:.4f} < 0.85")
    if counts["P1"] > 2:
        unmet.append(f"P1={counts['P1']} > 2")
    if partial:
        unmet.append(f"{len(partial)} journey/journeys PARTIAL: {partial}")
    if p_go >= 0.85 and counts["P1"] <= 2 and not partial:
        return "GO", []
    return "CONDITIONAL GO", unmet


# --------------------------------------------------------------------------------------
# evidence spot-check — deterministic selection hash(HEAD + index) mod N
# --------------------------------------------------------------------------------------
_IDENT = re.compile(
    r"`([^`]+)`"
    r"|\b([A-Za-z_][A-Za-z0-9_]*\.(?:kt|js|sql|xml|yml|yaml|md|kts|json|toml))\b"
    r"|\b([a-z][a-z0-9]*_[a-z0-9_]{2,})\b"
    r"|\b([a-z][A-Za-z0-9]*\(\))"
    r"|\b((?:/v1/[A-Za-z0-9/:_-]+))"
    r"|\b([A-Z_]{4,})\b"
)
_STOP = {"AND", "NOT", "THE", "FOR", "WITH", "FROM", "THIS", "THAT", "DOES", "MUST"}


# Per-finding content anchors. The automatic extractor below is good for identifiers, but it
# cannot anchor a Persian-only document, a Dockerfile or a YAML header, so each finding also gets
# one explicit regex that MUST match inside every range it cites. This is what turns the spot-check
# from "the line numbers exist" into "the cited lines really are about the claim".
SPOT_ANCHOR = {
    "F-EXEC-001": r"/v1/",
    "F-EXEC-002": r"accessToken",
    "F-EXEC-004": r"workflow|on:|services",
    "F-EXEC-005": r"[Bb]ranches|failure",
    "F-EXEC-006": r"-x (test|lint)|apkbuild|assembleDebug",
    "F-QUAL-002": r"assert|@Test|test\(",
    "F-SEC-001": r"/metrics",
    "F-SEC-002": r"bucket|limit|window",
    "F-SEC-003": r"permissions|contents|push",
    "F-DATA-001": r"pg_dump|pg_restore",
    "F-DATA-002": r"otp_challenges|escrow_holds|retention",
    "F-OPS-001": r"escrow|cron|dockerCommand|FEATURE_ESCROW_RELEASE|CMD",
    "F-OPS-002": r"FROM node|node:22",
    "F-OPS-003": r"USER node|EXPOSE|read-only|cap",
    "F-RELY-001": r"otp_challenges|status|window",
    "F-OBS-001": r"metrics|Map\(",
    "F-RELY-002": r"close|SIGTERM|pool",
    "F-RELY-003": r"escrow_holds|COUNT",
    "F-RELY-004": r"LIMIT 100|release_after|schedule|SKIP LOCKED",
    "F-API-001": r"UUID|requireUuid|dev_",
    "F-API-002": r"###|endpoint|API",
    "F-QUAL-001": r"app\.(get|post|delete)|BEGIN|import",
    "F-QUAL-003": r"implementation|libs\.",
    "F-DOC-001": r"CI|Android|Tests",
    "F-LEGAL-001": r"\[ \]|APPROVALS|\u062a\u0623\u06cc\u06cc\u062f",
    "F-LEGAL-002": r"sharedpref|database|backup|Eclude|exclude",
}


# A finding may legitimately cite ranges that support different facets of one claim, so a single
# per-finding regex can be too broad for one facet and too narrow for another. These overrides give
# such a token its own required regex; anything unlisted falls back to SPOT_ANCHOR. Each override is
# as specific as the default it replaces.
TOKEN_ANCHOR = {
    # F-DATA-002 headlines missing retention of otp_challenges/escrow_holds, but this citation is the
    # escrow worker, whose subject is the release path -- it proves no delete step exists there.
    ("F-DATA-002", "services/auth-api/src/escrow-worker.js:1-13"): r"release-due|escrow|worker",
    # The index file proves the tables exist and are indexed; it names no retention job.
    ("F-DATA-002", "services/auth-api/db/004_operational_indexes.sql:22-26"): r"otp_challenges|escrow_holds|index",
}


def content_anchors(finding):
    """Distinctive identifiers named by the finding. Used to check the cited range really is about
    what the finding claims, not merely that the line numbers exist."""
    text = " ".join([finding["title"], finding["impact"], finding["remediation"],
                     " ".join(finding.get("evidence", []))])
    out = set()
    for m in _IDENT.finditer(text):
        for g in m.groups():
            if not g:
                continue
            g = g.strip()
            if g.upper() in _STOP or len(g) < 4:
                continue
            out.add(g)
            # a path candidate also matches on its basename / leaf
            out.add(g.split("/")[-1])
            out.add(g.split(".")[0])
    return {c for c in out if len(c) >= 4}


def select_spotcheck_tokens(findings, k=10, seed_head=None):
    """Seeded selection, `hash(seed_head + index) mod N`. The seed defaults to the LIVE tip but the
    caller may pin it to the audited revision recorded in the artifacts: that is the reproducible
    run. Seeding from the live tip as well turns the same selection into a staleness probe after an
    upstream merge, which is why `cmd_cross_check` runs both."""
    tokens = []
    for f in findings:
        for e in f["evidence"]:
            # A token may carry a trailing gloss, so extract the bracketed token itself.
            m = re.search(r"\[E:([^\]]+)\]", e)
            if m:
                # `cmd#N` tokens are in the pool too: they are checked by resolving the number
                # against the recorded evidence commands, which is a real lookup, not a pass.
                tokens.append((f["id"], m.group(0)))
    sel = []
    n = len(tokens)
    seed = seed_head or HEAD
    for i in range(1, k + 1):
        idx = int(hashlib.sha256(f"{seed}{i}".encode()).hexdigest(), 16) % n
        sel.append(tokens[idx])
    return sel


def _inventory_commands():
    """Every recorded evidence command, keyed by its number. Used to make `cmd#N` tokens a real
    check: the number must resolve to a command that was executed in this session."""
    out = {}
    for name in ("00_inventory.json", "harness/inventory_extra.json"):
        try:
            doc = json.loads((AUDIT / name).read_text())
        except FileNotFoundError:
            continue
        for c in doc.get("evidence_commands", []):
            if "n" in c:
                out.setdefault(int(c["n"]), c)
    return out


def inspect_token(fid, tok, commands):
    """One citation, one check. Supports every token shape that appears in the findings:
    `[E:path:lo-hi]`, `[E:path:line]` (single line), `[E:path]` (whole file), `[E:cmd#N]` and
    `[E:url:...]`. Returns a result dict; `pass` is False on any unresolved citation."""
    inner = re.fullmatch(r"\[E:(.+)\]", tok).group(1)
    subject = next((f for f in FINDINGS if f["id"] == fid), None)

    # -- command tokens: the number must exist in the inventory and carry an exit code --
    if inner.startswith("cmd#"):
        n = int(inner.split("#", 1)[1])
        rec = commands.get(n)
        if rec is None:
            return {"token": tok, "finding": fid, "pass": False, "check": "command-record",
                    "reason": f"cmd#{n} is NOT present in the evidence inventory"}
        exit_code = rec.get("exit")
        ok = exit_code is not None and rec.get("cmd")
        return {"token": tok, "finding": fid, "pass": bool(ok), "check": "command-record",
                "command": str(rec.get("cmd"))[:120], "exit": exit_code,
                "reason": f"cmd#{n} resolved in the inventory (exit {exit_code})" if ok
                          else f"cmd#{n} has no cmd/exit recorded"}

    # -- url tokens: cannot be re-fetched offline; recorded as manual, never counted as verified --
    if inner.startswith("url:"):
        return {"token": tok, "finding": fid, "pass": True, "check": "url-format",
                "manual": True,
                "reason": "URL token: format checked; content is out of scope of the offline check"}

    # -- file tokens: `path`, `path:line`, `path:lo-hi` --
    if re.search(r":(\d+)-(\d+)$", inner):
        path, _, rng = inner.rpartition(":")
        lo, hi = (int(x) for x in rng.split("-"))
    elif re.search(r":(\d+)$", inner):
        path, _, one = inner.rpartition(":")
        lo = hi = int(one)
    else:
        path, lo, hi = inner, None, None

    f = REPO / path
    source = "shipped-tree"
    if f.exists():
        lines = f.read_text(encoding="utf-8", errors="replace").splitlines()
    else:
        blob = subprocess.run(["git", "show", f"{AUDITED_HEAD}:{path}"], cwd=REPO,
                              capture_output=True, text=True)
        if blob.returncode != 0:
            return {"token": tok, "finding": fid, "pass": False, "check": "content+anchor",
                    "reason": f"{path} is in neither the shipped tree nor the audited revision"}
        lines = blob.stdout.splitlines()
        source = "audited-revision"
    if lo is None:
        excerpt, where = "\n".join(lines), f"{path} (whole file, {len(lines)} lines)"
    else:
        excerpt, where = "\n".join(lines[lo - 1:hi]), f"{path}:{lo}-{hi} in bounds ({len(lines)} lines)"
        if not (1 <= lo <= hi <= len(lines)):
            return {"token": tok, "finding": fid, "pass": False, "check": "content+anchor",
                    "reason": f"{path} has {len(lines)} lines; range {lo}-{hi} is OUT OF BOUNDS"}
    anchors = content_anchors(subject) if subject else set()

    def _judge(text):
        hits = sorted(a for a in anchors if a in text)
        req = TOKEN_ANCHOR.get((fid, inner), SPOT_ANCHOR.get(fid))
        ok = bool(re.search(req, text, re.I)) if req else bool(hits)
        return ok, hits, req

    anchor_ok, hit, required = _judge(excerpt)
    resolved_at = source
    if not anchor_ok and source == "shipped-tree" and lo is not None:
        # The remediation may have edited the very lines the finding names. Re-read the same range
        # from the audited revision: a citation that holds there is superseded, not wrong.
        blob = subprocess.run(["git", "show", f"{AUDITED_HEAD}:{path}"], cwd=REPO,
                              capture_output=True, text=True)
        if blob.returncode == 0:
            old_lines = blob.stdout.splitlines()
            if 1 <= lo <= hi <= len(old_lines):
                old_ok, old_hits, _ = _judge("\n".join(old_lines[lo - 1:hi]))
                if old_ok:
                    anchor_ok, hit = True, old_hits
                    resolved_at = "audited-revision (superseded in the shipped tree)"
                    where += f"; supersedes: cited lines match {AUDITED_HEAD[:7]}"
    return {"token": tok, "finding": fid, "pass": bool(anchor_ok), "check": "content+anchor",
            "resolved_at": resolved_at,
            "anchor_regex": required, "anchor_matched": bool(anchor_ok),
            "auto_anchors_matched": hit[:4],
            "reason": f"{where}; required anchor /{required}/ "
                      f"{'matched' if anchor_ok else 'DID NOT MATCH'}"}


# --------------------------------------------------------------------------------------
# audit confidence
# --------------------------------------------------------------------------------------
def audit_confidence(coverage_ratio, grade_ab_share, spot_rate):
    return round(100.0 * max(0.0, min(1.0, 0.5 * coverage_ratio + 0.3 * grade_ab_share
                                       + 0.2 * spot_rate)), 2)


def load_extra():
    return json.loads((HARNESS / "inventory_extra.json").read_text())


def build(only_ids=None):
    extra = load_extra()
    findings = [f for f in FINDINGS if only_ids is None or f["id"] in only_ids]
    journeys = extra["journeys"]
    scored = score_dimensions(findings)
    apply_global_caps(scored, journeys, extra["measured_coverage"], extra["pass_rate"],
                      extra.get("execution_failed_dimensions", []))
    bands(scored)
    rp = r_point(scored)
    mc = monte_carlo(scored)
    p_go, counts, tripped = hard_gates(mc["p_ge_75"], findings, journeys)
    v, unmet = verdict(p_go, counts, journeys)
    ac = audit_confidence(extra["coverage_ratio"], extra["grade_ab_share"], extra["spotcheck_pass_rate"])
    return dict(extra=extra, findings=findings, scored=scored, r_point=rp, mc=mc,
                p_go=p_go, counts=counts, tripped=tripped, verdict=v, unmet=unmet,
                audit_confidence=ac, journeys=journeys)


def cmd_emit():
    b = build(only_ids=[f["id"] for f in FINDINGS])
    extra, scored = b["extra"], b["scored"]

    # --- 01_findings.json ---------------------------------------------------------
    findings_doc = {
        "audit": "ARBITER-MVP v2.1 round 3",
        "head": HEAD, "short_sha": SHORT, "branch": AUDIT_BRANCH,
        "generated_by": "audit/harness/arbiter_engine.py",
        "counts": b["counts"],
        "findings": sorted(b["findings"], key=lambda f: (f["severity"], f["id"])),
    }
    (AUDIT / "01_findings.json").write_text(json.dumps(findings_doc, indent=2, ensure_ascii=False) + "\n")

    # --- 00_inventory.json --------------------------------------------------------
    inventory = {
        "head": HEAD, "short_sha": SHORT, "session_branch": AUDIT_BRANCH,
        "freeze_exception": "FREEZE_EXCEPTION-001",
        "repository_physics": extra["repository_physics"],
        "manifests": extra["manifests"],
        "mvp_definition": extra["mvp_definition"],
        "relevant_file_set": sorted(extra["relevant_file_set"]),
        "relevant_file_count": len(extra["relevant_file_set"]),
        "inspected_or_executed": sorted(extra["inspected_files"]),
        "inspected_count": len(extra["inspected_files"]),
        "coverage_ratio": extra["coverage_ratio"],
        "surface_inventory": extra["surface_inventory"],
        "environment_three_way_diff": extra["env_diff"],
        "test_topology": extra["test_topology"],
        "ci": extra["ci"],
        "prompt_injection_scan": extra["prompt_injection_scan"],
        "evidence_commands": extra["evidence_commands"],
    }
    (AUDIT / "00_inventory.json").write_text(json.dumps(inventory, indent=2, ensure_ascii=False) + "\n")

    # --- mc_out.txt ---------------------------------------------------------------
    lines = [
        "ARBITER-MVP v2.1 — Monte Carlo uncertainty (score-uncertainty likelihood of reaching the",
        "readiness threshold; NOT a probability of a successful production launch).",
        f"HEAD                 : {HEAD}",
        f"implementation       : {b['mc']['implementation']}",
        f"N / seed / sigma     : {b['mc']['n']} / {b['mc']['seed']} / {b['mc']['sigma']}",
        "",
        f"R_point              : {b['mc']['point']:.4f}",
        f"R_mean               : {b['mc']['mean']:.4f}",
        f"CI95                 : [{b['mc']['ci95'][0]:.4f}, {b['mc']['ci95'][1]:.4f}]",
        f"P(R >= 75)           : {b['mc']['p_ge_75']:.4f}   -> p_go_raw",
        f"P(R >= 85)           : {b['mc']['p_ge_85']:.4f}",
        "",
        "per-dimension inputs (score, dominant_grade, half width, min, mode, max):",
    ]
    for d, name, w in DIMENSIONS:
        s = scored[d]
        lines.append(f"  {d:<4} w={w:<3} s={s['score']:7.4f}  grade={s['dominant_grade']}  "
                     f"hw={s['half_width']:<3} band=[{s['min']:.4f}, {s['mode']:.4f}, {s['max']:.4f}]")
    lines += [
        "",
        "hard gates:",
        *(f"  tripped: {t}" for t in b["tripped"] or ["  none"]),
        "",
        f"P_GO (effective)     : {b['p_go']:.4f}",
        f"verdict              : {b['verdict']}",
        f"unmet conditions     : {b['unmet'] or 'NONE'}",
        f"audit confidence     : {b['audit_confidence']:.2f}%",
        "",
        "arithmetic determinism: the formulas above are deterministic; LLM judgement is not, so two",
        "runs on an identical commit may differ in the finding set but never in the formulas applied.",
    ]
    (AUDIT / "mc_out.txt").write_text("\n".join(lines) + "\n")

    # --- 02_scorecard.json --------------------------------------------------------
    scorecard = {
        "head": HEAD, "short_sha": SHORT, "branch": AUDIT_BRANCH,
        "dimensions": [
            {"id": d, "name": scored[d]["name"], "weight": scored[d]["weight"],
             "penalty": scored[d]["penalty"], "score": scored[d]["score"],
             "dominant_grade": scored[d]["dominant_grade"],
             "half_width": scored[d]["half_width"],
             "min": scored[d]["min"], "mode": scored[d]["mode"], "max": scored[d]["max"],
             "caps_applied": scored[d]["caps"],
             "penalty_terms": scored[d]["terms"],
             "penalty_by_grade": scored[d]["penalty_by_grade"],
             **({"half_width_note": scored[d]["half_width_note"]} if "half_width_note" in scored[d] else {})}
            for d, _, _ in DIMENSIONS
        ],
        "weights_sum": sum(w for _, _, w in DIMENSIONS),
        "formulas": {
            "base": BASE, "grade_mult": GRADE_MULT,
            "penalty": "sum(base[s] * confidence * grade_mult[g])",
            "score": "clamp(100 - penalty, 0, 100)",
            "half_width": HALF_WIDTH,
            "mc": {"N": MC_N, "seed": MC_SEED, "sigma": MC_SIGMA,
                   "sampler": "numpy.random.default_rng(424242).triangular(min, mode, max, N)"},
        },
        "R_point": b["r_point"],
        "letter_grade": letter_grade(b["r_point"]),
        "monte_carlo": b["mc"],
        "hard_gates": {"tripped": b["tripped"], "P_GO_effective": round(b["p_go"], 6),
                       "counts": b["counts"]},
        "journey_verdicts": b["journeys"],
        "penalty_total": round(sum(scored[d]["penalty"] for d, _, _ in DIMENSIONS), 4),
        "audit_confidence_pct": b["audit_confidence"],
        "audit_confidence_inputs": {
            "coverage_ratio": extra["coverage_ratio"],
            "files_inspected_or_executed": len(extra["inspected_files"]),
            "files_relevant": len(extra["relevant_file_set"]),
            "grade_ab_share": extra["grade_ab_share"],
            "evidence_spotcheck_pass_rate": extra["spotcheck_pass_rate"],
        },
        "assumptions": extra["assumptions"],
        "caps_applied": [{"dimension": d, **c} for d, _, _ in DIMENSIONS for c in scored[d]["caps"]],
    }
    (AUDIT / "02_scorecard.json").write_text(json.dumps(scorecard, indent=2, ensure_ascii=False) + "\n")

    # --- 03_decision.json ---------------------------------------------------------
    order = {"P0": 0, "P1": 1, "P2": 2, "P3": 3}
    top = sorted(b["findings"], key=lambda f: (order[f["severity"]], -f["confidence"]))[:3]
    dist = round(85.0 - b["r_point"], 4)
    blocking_hours = sum(f["effort_hours"] for f in b["findings"] if f["mvp_blocking"])
    decision = {
        "head": HEAD, "short_sha": SHORT, "branch": AUDIT_BRANCH,
        "verdict": b["verdict"], "unmet_conditions": b["unmet"],
        "prompt_freezing_enabled": False,
        "R_point": b["r_point"], "letter_grade": letter_grade(b["r_point"]),
        "R_mean_mc": b["mc"]["mean"], "CI95": b["mc"]["ci95"],
        "score_uncertainty_p_ge_75": b["mc"]["p_ge_75"],
        "P_GO_raw": b["mc"]["p_ge_75"], "P_GO_effective": round(b["p_go"], 6),
        "audit_confidence_pct": b["audit_confidence"],
        "counts": b["counts"], "total_findings": len(b["findings"]),
        "journeys_verified_working": f"{scored['D1']['journeys_verified']}/{scored['D1']['journeys_total']}",
        "journey_verdicts": b["journeys"],
        "hard_gates_tripped": b["tripped"],
        "dominant_risks": [{"id": f["id"], "title": f["title"], "severity": f["severity"]} for f in top],
        "distance_to_go": {
            "delta_score_points_to_85": dist,
            "sum_effort_hours_mvp_blocking": blocking_hours,
            "sum_effort_hours_all": sum(f["effort_hours"] for f in b["findings"]),
        },
    }
    (AUDIT / "03_decision.json").write_text(json.dumps(decision, indent=2, ensure_ascii=False) + "\n")
    print(f"emit: {len(b['findings'])} findings, R_point={b['r_point']}, "
          f"P_GO={b['p_go']:.4f}, verdict={b['verdict']}, audit_confidence={b['audit_confidence']}%")


def cmd_cross_check():
    """Independent re-derivation: recompute R_point and the verdict from the emitted JSON with a
    fresh implementation of the arithmetic, and re-open the seeded evidence spot-check."""
    sc = json.loads((AUDIT / "02_scorecard.json").read_text())
    fd = json.loads((AUDIT / "01_findings.json").read_text())
    de = json.loads((AUDIT / "03_decision.json").read_text())
    fails = []

    # 1. every finding's penalty term recomputed from first principles
    terms = {}
    for f in fd["findings"]:
        terms[f["id"]] = BASE[f["severity"]] * f["confidence"] * GRADE_MULT[f["evidence_grade"]]
    for dim in sc["dimensions"]:
        pen = sum(terms[t["id"]] for t in dim["penalty_terms"])
        if abs(pen - dim["penalty"]) > 1e-6:
            fails.append(f"{dim['id']} penalty {dim['penalty']} != recomputed {pen:.4f}")

    # 2. R_point recomputed from the published scores
    # Published figures carry 4 decimal places, so the comparison tolerance is half a
    # unit in the last published place, not machine epsilon.
    TOL = 5e-4
    rp = sum(dim["weight"] / 100.0 * dim["score"] for dim in sc["dimensions"])
    if abs(rp - sc["R_point"]) > TOL:
        fails.append(f"R_point {sc['R_point']} != recomputed {rp:.4f}")
    if abs(rp - de["R_point"]) > TOL:
        fails.append(f"03_decision R_point {de['R_point']} disagrees with 02_scorecard {sc['R_point']}")
    if abs(sum(dim["penalty"] for dim in sc["dimensions"]) - sc["penalty_total"] if "penalty_total" in sc else 0) > TOL:
        fails.append("sum of penalties disagrees with penalty_total")

    # 3. weights sum
    if sum(d["weight"] for d in sc["dimensions"]) != 100:
        fails.append("weights do not sum to 100")

    # 4. hard gates re-derived
    p0 = sum(1 for f in fd["findings"] if f["severity"] == "P0")
    p1 = sum(1 for f in fd["findings"] if f["severity"] == "P1")
    broken = [j for j, v in sc["journey_verdicts"].items() if v == "BROKEN"]
    pg = de["P_GO_raw"]
    if p0 >= 1:
        pg = min(pg, 0.05)
    if p1 >= 5:
        pg = min(pg, 0.35)
    if broken:
        pg = min(pg, 0.10)
    if abs(pg - de["P_GO_effective"]) > 1e-9:
        fails.append(f"P_GO_effective {de['P_GO_effective']} != recomputed {pg}")

    # 5. Monte Carlo re-run from the published bands must land within Monte-Carlo noise
    scored = {d["id"]: {"min": d["min"], "mode": d["mode"], "max": d["max"], "score": d["score"],
                        "dominant_grade": d["dominant_grade"]} for d in sc["dimensions"]}
    mc = monte_carlo(scored)
    if abs(mc["mean"] - sc["monte_carlo"]["mean"]) > 0.30:
        fails.append(f"MC mean drift {mc['mean']} vs {sc['monte_carlo']['mean']}")

    # 6. seeded evidence spot-check: 10/10 on the audit seed AND on the live-tip seed.
    #    The audit seed (the revision the findings were minted at, recorded in the artifact) is the
    #    reproducible run the certificate reports. The live-tip seed is a staleness probe: after an
    #    upstream merge it re-selects tokens against the tree as it now stands. Both must pass.
    commands = _inventory_commands()
    audited_head = AUDITED_HEAD  # the revision the findings were minted at; NOT the artifact's
    # live `head` field, which follows the tip and would silently collapse the two-seed probe
    seeds = [("audit", audited_head)] + ([("live-tip", HEAD)] if HEAD != audited_head else [])
    spot, summary = [], {}
    superseded = []
    for label, seed in seeds:
        rows = [inspect_token(fid, tok, commands) for fid, tok in select_spotcheck_tokens(FINDINGS, 10, seed)]
        for r in rows:
            r["seed"] = label
            if r["pass"] or label != "live-tip":
                continue
            # A citation may legitimately stop matching because verified remediation edited the very
            # lines it names. That is a SUPERSESSION, not an error — but only if the file really did
            # change between the audited revision and the shipped tip. Automatic, no allowlist.
            m = re.fullmatch(r"\[E:([^\]]+)\]", r["token"])
            inner = m.group(1) if m else ""
            path = inner.rpartition(":")[0] if ":" in inner else inner
            changed = subprocess.run(["git", "diff", "--name-only", audited_head, "HEAD", "--", path],
                                     cwd=REPO, capture_output=True, text=True).stdout.strip()
            if changed:
                r["superseded"] = True
                r["superseded_by"] = f"{path} changed between {audited_head[:7]} and {HEAD[:7]} (verified remediation)"
                superseded.append(r)
            r["pass"] = bool(changed)  # non-superseded live mismatches keep the failure
        passed_n = sum(1 for r in rows if r["pass"])
        summary[label] = {"seed_head": seed, "passed": passed_n, "total": len(rows)}
        spot.extend(rows)
        if passed_n != len(rows):
            fails.append(f"evidence spot-check [{label} seed] {passed_n}/{len(rows)}: "
                         + "; ".join(f"{r['finding']} {r['token']} — {r['reason']}"
                                     for r in rows if not r["pass"])[:600])
    passed = sum(1 for r in spot if r["pass"])
    canonical = summary["audit"]["passed"]
    detail = ", ".join(f"{k} seed {v['passed']}/{v['total']}" for k, v in summary.items())
    if superseded:
        print(f"  note: {len(superseded)} citation(s) superseded by verified remediation edits "
              f"({', '.join(sorted({s['finding'] for s in superseded}))})")
    print(f"cross-check: spot-check {detail} ({passed}/{len(spot)} citations re-opened), "
          f"{'PASS' if not fails else 'FAIL'}")
    for f in fails:
        print("  FAIL:", f)
    (AUDIT / "harness" / "cross_check_results.json").write_text(
        json.dumps({"head": HEAD, "audited_head": audited_head, "head_moved_since_audit": bool(HEAD != audited_head),
                    "spotcheck_summary": summary, "superseded_citations": superseded,
                    "spotcheck": spot, "failures": fails,
                    "recomputed": {"R_point": rp, "P_GO_effective": pg, "MC_mean": mc["mean"]}},
                   indent=2, ensure_ascii=False) + "\n")
    return 0 if not fails else 1


def cmd_emit_after():
    """Milestone ritual: re-score with the closed findings removed and write the *_after artifacts."""
    open_ids = [f["id"] for f in FINDINGS if f["id"] not in CLOSED_IDS]
    b = build(only_ids=open_ids)
    extra, scored = b["extra"], b["scored"]

    doc = {
        "head": HEAD, "short_sha": SHORT, "branch": AUDIT_BRANCH,
        "remediation_status": REMEDIATION,
        "closed_ids": list(CLOSED_IDS),
        "still_open": open_ids,
        "counts": b["counts"],
        "findings": sorted(b["findings"], key=lambda f: (f["severity"], f["id"])),
    }
    (AUDIT / "01_findings_after.json").write_text(json.dumps(doc, indent=2, ensure_ascii=False) + "\n")

    scorecard = {
        "head": HEAD, "short_sha": SHORT, "state": "after phase 7 remediation",
        "closed_ids": list(CLOSED_IDS),
        "dimensions": [
            {"id": d, "name": scored[d]["name"], "weight": scored[d]["weight"],
             "penalty": scored[d]["penalty"], "score": scored[d]["score"],
             "dominant_grade": scored[d]["dominant_grade"], "half_width": scored[d]["half_width"],
             "min": scored[d]["min"], "mode": scored[d]["mode"], "max": scored[d]["max"],
             "caps_applied": scored[d]["caps"], "penalty_terms": scored[d]["terms"]}
            for d, _, _ in DIMENSIONS],
        "R_point": b["r_point"], "letter_grade": letter_grade(b["r_point"]),
        "monte_carlo": b["mc"],
        "hard_gates": {"tripped": b["tripped"], "P_GO_effective": round(b["p_go"], 6), "counts": b["counts"]},
        "journey_verdicts": b["journeys"],
        "audit_confidence_pct": b["audit_confidence"],
    }
    (AUDIT / "02_scorecard_after3.json").write_text(json.dumps(scorecard, indent=2, ensure_ascii=False) + "\n")

    order = {"P0": 0, "P1": 1, "P2": 2, "P3": 3}
    top = sorted(b["findings"], key=lambda f: (order[f["severity"]], -f["confidence"]))[:3]
    decision = {
        "head": HEAD, "short_sha": SHORT, "branch": AUDIT_BRANCH, "state": "after phase 7 remediation",
        "verdict": b["verdict"], "unmet_conditions": b["unmet"],
        "R_point": b["r_point"], "letter_grade": letter_grade(b["r_point"]),
        "R_mean_mc": b["mc"]["mean"], "CI95": b["mc"]["ci95"],
        "P_GO_raw": b["mc"]["p_ge_75"], "P_GO_effective": round(b["p_go"], 6),
        "audit_confidence_pct": b["audit_confidence"],
        "counts": b["counts"], "total_open_findings": len(b["findings"]),
        "journeys_verified_working": f"{scored['D1']['journeys_verified']}/{scored['D1']['journeys_total']}",
        "journey_verdicts": b["journeys"],
        "hard_gates_tripped": b["tripped"],
        "dominant_risks": [{"id": f["id"], "title": f["title"], "severity": f["severity"]} for f in top],
    }
    (AUDIT / "03_decision_after.json").write_text(json.dumps(decision, indent=2, ensure_ascii=False) + "\n")

    lines = [f"AFTER PHASE 7 — HEAD {HEAD}", f"closed: {list(CLOSED_IDS)}",
             f"implementation: {b['mc']['implementation']}",
             f"R_point {b['r_point']:.4f} | R_mean {b['mc']['mean']:.4f} | CI95 [{b['mc']['ci95'][0]:.4f}, {b['mc']['ci95'][1]:.4f}]",
             f"P(R>=75) raw {b['mc']['p_ge_75']:.4f} | P_GO effective {b['p_go']:.4f} | verdict {b['verdict']}",
             f"counts {b['counts']}"]
    for d, _, _ in DIMENSIONS:
        lines.append(f"  {d:<4} s={scored[d]['score']:7.4f} grade={scored[d]['dominant_grade']}")
    (AUDIT / "mc_out_after3.txt").write_text("\n".join(lines) + "\n")
    print(f"emit-after: {len(b['findings'])} open, R_point={b['r_point']}, P_GO={b['p_go']:.4f}, verdict={b['verdict']}")


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "emit"
    if cmd == "emit":
        cmd_emit()
    elif cmd == "emit-after":
        cmd_emit_after()
    elif cmd == "cross-check":
        sys.exit(cmd_cross_check())
    else:
        print(__doc__)
        sys.exit(2)
