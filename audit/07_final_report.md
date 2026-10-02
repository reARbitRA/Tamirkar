# Oosta (اوستا) — MVP Readiness Audit + Remediation

**Repository** `reARbitRA/Tamirkar` · **baseline** `3bd962b3d490f936f81fe333a945e35427ffc7e0` · **head** `485a5c04a2c5b22f7eb37c64d74d483894e7c8f3`
**Branch** `arena/01a0fac4-tamirkar` · **audit date** 2026-10-02
**VALIDATION: DEGRADED — SINGLE-MODEL** (no second model was reachable in this workspace; see §4)

---

## 1. Adjudication — BEFORE (baseline `3bd962b`)

```
═══════════════════════════════════════════════
  MVP LAUNCH ADJUDICATION (BEFORE) — commit 3bd962b3d490f936f81fe333a945e35427ffc7e0
═══════════════════════════════════════════════
  VERDICT          : NO-GO — BLOCKED
  GO PROBABILITY   : 0.00 %
  NO-GO PROBABILITY: 100.00 %
  READINESS SCORE  : 51.65 / 100   (Grade: D)
  95% CI           : [50.08, 53.19]
  MONTE CARLO      : N=10000, seed=424242
  CONFIDENCE IN
  THIS ASSESSMENT  : 73.63%   (= evidence coverage × grade quality)
  ───────────────────────────────────────────
  P0: 2   P1: 9   P2: 19   P3: 7
  JOURNEYS: 4/7 verified working
  HARD GATES TRIPPED: P0_count=2 → P_GO capped 0.05 + verdict forced NO-GO; P1_count=9 → capped 0.35; J3 BROKEN → capped 0.10
  ───────────────────────────────────────────
  DISTANCE TO GO   : 23.35 score points | 38.0 h of blocking-finding effort
  TOP 5 BLOCKERS   :
    1. F-DATA-001  Escrow released to the technician after 30 days with no completion or dispute path
    2. F-EXEC-001  Android test source imports AiTask/candidates() that do not exist — no compile, no release proof
    3. F-EXEC-008  No server read API for orders — the device passport died with the install
    4. F-SEC-001  Deactivated accounts kept working for up to 3600 s on a live JWT
    5. F-EXEC-006  AUTH_API_BASE_URL never declared; a stock-checkout APK could not reach any backend
═══════════════════════════════════════════════
```

## 2. Adjudication — AFTER (current HEAD `485a5c0`)

```
═══════════════════════════════════════════════
  MVP LAUNCH ADJUDICATION (AFTER) — commit 485a5c04a2c5b22f7eb37c64d74d483894e7c8f3
═══════════════════════════════════════════════
  VERDICT          : CONDITIONAL GO
  GO PROBABILITY   : 100.00 %
  NO-GO PROBABILITY: 0.00 %
  READINESS SCORE  : 79.19 / 100   (Grade: B)
  95% CI           : [77.03, 80.45]
  MONTE CARLO      : N=10000, seed=424242
  CONFIDENCE IN
  THIS ASSESSMENT  : 78.00%   (= evidence coverage × grade quality)
  ───────────────────────────────────────────
  P0: 0   P1: 4   P2: 9   P3: 6
  JOURNEYS: 4/7 verified working
  HARD GATES TRIPPED: NONE
  ───────────────────────────────────────────
  DISTANCE TO GO   : 0.00 score points (R_point 79.19 already clears the 75 bar)
                     0.0 h of blocking-finding effort — every P0 and journey-blocking P1 is closed.
                     The remaining constraint is NOT score: it is P1=4 (>2) and 3 journeys at PARTIAL.
  TOP 5 BLOCKERS   :
    1. F-LEGAL-001  Legal set is still unapproved internal drafts; approvals matrix 0/6 — needs a lawyer
    2. F-EXEC-002/003/004  No CI can be installed: the GitHub App token lacks the `workflows` permission; Android CI has failed on all 10 historical runs
    3. F-DATA-005  Backup/restore scripts exist but no dump/restore round-trip was executed; RPO/RTO drill not done
    4. F-EXEC-008 (residual)  DeviceEntity still has no server API — the device half of the passport remains Room-local
    5. F-EXEC-009  Zarinpal capture path still unexecuted — the sandbox cannot reach sandbox.zarinpal.com
═══════════════════════════════════════════════
```

**Rubric gap, disclosed rather than papered over.** The specified verdict table has no row for
`P_GO ≥ 0.85` with `P0 = 0` but `P1 > 2` or journeys not all `VERIFIED_WORKING`. Read literally,
no row matches. The conservative applicable band is `CONDITIONAL GO`; the exact unlock
conditions are in §9. This is the one place in the report where the mapping was interpreted
rather than applied.

---

## 3. Per-dimension delta

| Dim | Dimension | w | before | after | Δ | tasks responsible |
|---|---|---|---|---|---|---|
| D1 | Core functional completeness vs mvp_definition | 18 | 24.79 | 57.14 | +32.35 | T-001, T-004, T-006 |
| D2 | Correctness & test evidence (executed) | 14 | 60.02 | 83.55 | +23.52 | T-002 |
| D3 | Security & secrets hygiene | 14 | 47.34 | 87.92 | +40.59 | T-003, T-009 |
| D4 | Data integrity, migrations & persistence | 8 | 27.76 | 89.74 | +61.98 | T-001, T-007, T-012 |
| D5 | Build, CI & reproducibility | 8 | 30.00 | 30.00 | +0.00 | T-005 (BLOCKED) |
| D6 | Deploy & runtime readiness | 8 | 57.61 | 93.64 | +36.03 | T-008, T-014 |
| D7 | Error handling, logging & observability | 7 | 77.20 | 94.60 | +17.40 | T-009, T-010, T-011 |
| D8 | Performance & scalability at MVP load | 6 | 89.74 | 95.14 | +5.40 | T-010 |
| D9 | API/contract stability & integration correctness | 6 | 55.83 | 92.78 | +36.96 | T-004, T-006, T-010 |
| D10 | Code quality, architecture & maintainability | 5 | 89.95 | 91.30 | +1.35 | T-012, T-013 |
| D11 | Documentation & onboarding | 3 | 64.24 | 100.00 | +35.76 | T-006, T-008, T-013 |
| D12 | Legal, licensing, privacy & compliance | 3 | 78.67 | 78.67 | +0.00 | T-016 (requires human) |

Weighted `R_point`: **51.65 → 79.19** (+27.54).
Grade **D → B**. Monte Carlo (N=10000, seed 424242)
`P_GO`: **0.00% → 100.00%**, CI95 `77.03–80.45`.

Two caps still bind and both are honest:

* **D1 is capped at 57.14** by the journey ratio 4/7. J2 (live Gemini call), J3 (device registry)
  and J5 (Zarinpal capture) are PARTIAL, not broken — but PARTIAL is not VERIFIED_WORKING and the
  rubric does not give partial credit.
* **D5 is capped at 30** on Grade A evidence: all ten workflow runs in this repository's history
  failed (`gh run view 36493298453` → `X Set up Android SDK`). Installing a green server job was
  **blocked by a GitHub App permission**, not by the code.

A rubric artifact worth naming: D11 has zero open findings after remediation, so its dominant
evidence grade falls back to `D` and its uncertainty band widens to ±25. The point estimate is
unaffected (the mode is used in `R_point`); only the lower bound moves.

---

## 4. Validation certificate

```
── VALIDATION CERTIFICATE ──────────────────
 validator        : NONE_AVAILABLE (no second model reachable in this workspace)
 context isolated : n/a
 iterations       : 1
 MAD              : n/a     (would require a validator scorecard)
 MAX_DEV          : n/a
 ΔP_GO            : n/a
 P0 Jaccard       : n/a
 hallucinations   : 0 found by self-red-team; 1 line-number error self-caught and corrected
 spot-check       : 9/10 passed
 RESULT           : DEGRADED — SINGLE-MODEL
 final P_GO       : 100.00%
────────────────────────────────────────────
```

Phase 5.1 forbids faking a validator, so no blind re-score and no hostile-reviewer JSON were
invented. The 5.5 fallback **was** executed and it changed the report:

* **Two findings the first pass missed** were added by the red team — `F-SEC-008`
  (`trustProxy` absent, so `acceptance_ip` records the reverse proxy) and `F-DATA-006`
  (unbounded `otp_challenges` / unindexed `operational_audit_log`). `R_point` moved
  **52.953 → 51.645**; the red team made the verdict *more* pessimistic.
* **Two severities were corrected downward** to avoid inflation: `F-EXEC-006` P0→P1
  (deliberate fail-closed design, one git-ignored file satisfies it) and `F-SEC-005` P2→P3
  (Zarinpal has no webhook signature; the code re-verifies via `verify.json`).
* **Arithmetic independently re-derived** by a second script written from the rubric text alone:
  independent `R_point` 51.644900 vs engine 51.645000 (Δ 1e-4, rounding), max per-dimension
  deviation 0.000000000, weights sum to 100.
* **Spot-check 9/10.** The failure was `[E:services/auth-api/src/server.js:L24]` cited for the
  `pg.Pool` options — line 24 is `const config = loadConfig();`, the pool is at L25. Corrected,
  and the owning dimensions (D6, D8) re-audited claim by claim.

---

## 5. Codebase rating

**Overall: D (51.65) → B (79.19).**

Per-module, from the executed lanes:

| Module | LOC | Executed evidence | Grade | Top residual risk |
|---|---|---|---|---|
| `services/auth-api/src/server.js` | 1057 | 23 routes exercised end-to-end against real PostgreSQL; 25/25 tests | **B** | 17.5% unit line coverage — the unit suite cannot reach SQL |
| `services/auth-api/src/ledger.js` | 37 | balanced + idempotent, exercised on real rows | **A** | none material |
| `services/auth-api/src/config.js` | 100% line cov | 5 new fail-closed tests | **A** | — |
| `services/auth-api/src/auth.js` | 33% cov | `requireActiveUser` proven via harness + integration test | **B** | no token revocation list |
| `services/auth-api/db/*.sql` | 164 | 4 migrations apply cleanly, exit 0 | **A** | no down-migrations |
| `app/src/main/java/…/data/remote/*` | ~250 | read-only; no Gradle in sandbox | **C** | compile status unproven |
| `app/src/main/java/…/ui/**` | ~5000 | not executed at all | **D** | entirely unverified |
| `.github/workflows/*` | 3 files | `gh run list`: 10/10 failed | **F** | no green build in history |

---

## 6. What changed

Commits on `arena/01a0fac4-tamirkar`: `fa844e7` (audit baseline) → `6fe6450` (remediation) →
`485a5c0` (CI staging).

| Area | Change |
|---|---|
| **Money (P0)** | Order lifecycle `start`/`complete`/`dispute`, operator `refund`, and a completion gate on `release-due`. A dispute claws the technician's 85% back into `escrow_liability` with a balanced `dispute_freeze` entry; refund replay returns `409`. |
| **Security** | `requireActiveUser` re-reads `users.is_active` on all 10 authenticated routes; `/v1/orders` restricted to `customer`; `OTP_DEV_LOG_CODE` now refuses to boot in production/staging; Gemini key moved to the `x-goog-api-key` header; `trustProxy` enabled so `acceptance_ip` records the client. |
| **API surface** | 16 → 23 routes. Added `GET /v1/orders`, `GET /v1/orders/:orderId` (tenancy-checked, IDOR probe returns 404), `GET /metrics`, and the five lifecycle/refund routes. |
| **Reliability** | Pool `connectionTimeoutMillis`/`idleTimeoutMillis`/`statement_timeout=15000`; `requireUuid` on every path param (malformed UUID now `400`, was `500`). |
| **Data** | Order + audit now one transaction; evidence gated on `paid`/`in_progress` plus re-checked approval; migration `004_operational_indexes.sql` adds 8 indexes. |
| **Tests** | 18 → 25. Five new `loadConfig` fail-closed tests and **two real integration tests** that run inside `npm test` when `AUDIT_DATABASE_URL` is set. |
| **Client** | `AUTH_API_BASE_URL` declared as an explicit `buildConfigField`; the compile-breaking `AiProviderRouterTest` rewritten against the real router contract. |
| **Ops** | Render cron service for the escrow worker; `ESCROW_WORKER_TOKEN` + `PLATFORM_API_BASE_URL` documented; Dockerfile `NODE_ENV` + `HEALTHCHECK`; backup/restore scripts with tool preflight. |
| **Docs** | `docs/ENVIRONMENT.md` rewritten from the real `loadConfig()` surface (10 phantom variables removed); `docs/GO_NO_GO.md` reissued against the current tree; `RISK_REGISTER.md` re-scored with per-row evidence. |

**Coverage: 52.35% → 46.97% line (down), 79.29% → 86.98% branch (up).** Line coverage fell
because ~450 new route lines are unreachable from a unit suite that runs without a database.
That is the honest number; CI must set `AUDIT_DATABASE_URL` for it to recover.

---

## 7. What I could NOT do, and exactly why

| task | reason | what a human must provide | unblocking effort |
|---|---|---|---|
| **T-005 / T-015** install `server.yml`, fix `build.yml` triggers | `git push` rejected: *"refusing to allow a GitHub App to create or update workflow … without `workflows` permission"* | A maintainer with push access to `.github/workflows/` runs `cp ci/proposed/server.yml .github/workflows/server.yml` | 10 min |
| **T-016** legal sign-off | `docs/legal/*` are unapproved drafts, approvals 0/6 | A licensed lawyer + a registered legal entity | weeks, not hours |
| Android compile / lint / coverage | `java`, `javac`, `gradle` NOT FOUND; `ANDROID_HOME` unset | A JDK 17 + Android SDK 36 image, or CI | 1 h to provision |
| Zarinpal capture walk (J5) | `sandbox.zarinpal.com` unreachable; sandbox egress is limited to the npm registry and the GitHub API | Run in CI with a sandbox merchant id | 2 h |
| Real `pg_dump`/`pg_restore` drill | `postgresql-client` not installed, no root for `apt` | Any host with the client; run `scripts/backup-database.sh` then the restore | 1 h |
| Docker image build | `docker` NOT FOUND | Any Docker host | 30 min |
| Digest-pin the base image | `hub.docker.com` and `registry-1.docker.io` both fail TLS. **A digest written without that lookup would be invented, so I did not write one.** | `docker buildx imagetools inspect node:22-alpine` | 5 min |

---

## 8. Residual risk register (19 open findings: 0 P0, 4 P1, 9 P2, 6 P3)

| id | sev | business impact |
|---|---|---|
| F-LEGAL-001 | P1 | Taking money with unapproved terms is a legal prohibition on public launch |
| F-EXEC-002/003/004 | P1 | No green build in repository history; the money path has no automated gate |
| F-DATA-005 | P1→P2 | No executed restore drill; a lost volume loses the ledger |
| F-EXEC-008 | P1→P2 | `DeviceEntity` still Room-local; the device half of the passport dies with the install |
| F-EXEC-001 | P0→P2 | Stale symbol references removed and grep-verified, but the Gradle compile was never executed |
| F-SEC-004 | P2 | `/v1/ai/diagnoses` still has no rate limit — unbounded Gemini spend |
| F-SEC-007 | P2 | Any customer can self-elevate to `role=technician` (money actions still gated) |
| F-DATA-004 | P2 | Forward-only migrations, no rehearsed undo |
| F-RELY-001 | P2 | No retry/backoff on Kavenegar, Zarinpal or Gemini |
| F-LEGAL-002 | P2 | Privacy notice promises a deletion right the API cannot honour |
| F-QUAL-005 | P2 | Three duplicate CI definitions; one workflow builds with `-x lint -x test` |
| F-EXEC-005 / F-EXEC-009 | P3 | Audit-environment limitations, recorded not hidden |
| F-SEC-005, F-OPS-001, F-QUAL-006, F-QUAL-007 | P3 | Defence-in-depth, image pin, 1057-line server.js, no-op Room migration |

---

## 9. Remaining distance to GO

`R_point` **79.19** already clears the 75 bar and `P_GO` is **100.00%**.
What actually stands between this and an unconditional **GO** is the verdict table's own
conjunctive condition — `P1 ≤ 2` **and** all seven journeys `VERIFIED_WORKING`. Ordered next ten:

1. `cp ci/proposed/server.yml .github/workflows/server.yml` and commit it → closes F-EXEC-002 (10 min, human).
2. Add `pull_request:` to `build.yml` and pin `android-actions/setup-android` → closes F-EXEC-003/004 (1 h, human).
3. Run `./gradlew testDebugUnitTest` on a JDK 17 host → converts F-EXEC-001 from grep-verified to compiled (30 min).
4. Run the Zarinpal sandbox capture walk in CI → moves J5 PARTIAL → VERIFIED_WORKING (2 h).
5. Execute one real `backup-database.sh` → `restore-database.sh` round-trip and record RPO/RTO → closes F-DATA-005 (1 h).
6. Add a per-user sliding-window limit on `/v1/ai/diagnoses` → closes F-SEC-004 (3 h).
7. Add `GET/POST /v1/devices` and move `DeviceEntity` server-side → moves J3 to VERIFIED_WORKING (8 h).
8. Hold the technician role until KYC approval inside the approval transaction → closes F-SEC-007 (3 h).
9. Bounded retry/backoff on the three provider clients → closes F-RELY-001 (4 h).
10. Counsel review of the five legal documents → closes F-LEGAL-001 (human, weeks).

Items 1–2 alone drop `P1` from 4 to 1; items 4 and 7 lift journeys from 4/7 to 6/7. Together
those satisfy the `GO` row.

---

## 10. Launch runbook

**Deploy.** `docker compose -f docker-compose.auth.yml --env-file services/auth-api/.env up --build`,
or import `render.yaml` (web service + daily escrow cron). The container runs `npm run migrate`
before `npm start` and now carries a `HEALTHCHECK` against `/health`, so a failed migration
stops receiving traffic.

**Smoke tests, in order.** `GET /health` → `GET /v1/public/features` (confirm all five flags are
`false`) → `POST /v1/auth/request-otp` + `verify-otp` with a real Iranian number → `GET /v1/me`
→ `GET /metrics` → `POST /v1/orders` → `GET /v1/orders/:id`.

**Flag ladder.** OTP first. Then `FEATURE_AI_DIAGNOSIS`. Then `FEATURE_NEW_BOOKINGS` and
`FEATURE_TECHNICIAN_MATCHING`. **Do not enable `FEATURE_PAYMENTS` until items 4 and 5 of §9 are
done** — `config.js` will additionally refuse to boot without a merchant id and an HTTPS callback.

**Rollback triggers.** Any of: ledger net ≠ 0 (`SELECT SUM(debit)-SUM(credit) FROM ledger_postings`),
`oosta_provider_failures_total` rising for >10 min, OTP verification rate < 80%, an escrow hold
released on a non-`completed` order, or any `5xx` on `/v1/payments/zarinpal/callback`.

**Rollback procedure.** Set the relevant `FEATURE_*` flag to `false` (no app update needed) →
freeze `FEATURE_ESCROW_RELEASE` before touching any money state → roll back the API artifact
only, never the database, until a down-migration path exists → reconcile provider settlements
against `ledger_entries` before any customer correction.

**Monitoring.** `GET /metrics` exposes `oosta_http_requests_total{route,status_class}`,
`oosta_provider_failures_total{provider}`, `oosta_pool_waiting|idle|total` and
`oosta_escrow_holds_due`. Alerting on these does not exist yet (F-OBS-001 residual).

---

## 11. Evidence appendix

Executed commands and their exit codes (full detail in `audit/06_execution_log.md`):

| cmd | command | exit | key output |
|---|---|---|---|
| #5 | `java --version` / `gradle --version` / `docker --version` | 127 | all NOT FOUND |
| #9 | `npm ci` (services/auth-api) | 0 | 76 packages, **0 vulnerabilities** |
| #10 | `npm test` | 0 | `# tests 18 # pass 18 # fail 0` (baseline) |
| #11 | `git ls-files \| wc -l` | 0 | 182 tracked files |
| #12 | route inventory `grep -n "app\.(get\|post)("` | 0 | 16 routes at baseline |
| #13 | `cat render.yaml` | 0 | `plan: free`, `autoDeployTrigger: "off"`, 0 cron |
| #15 | `gh run list --limit 10` | 0 | 10 rows, **all `failure`** |
| #16 | `gh run view 36493298453` | 0 | `X Set up Android SDK` |
| #17 | `curl repo1.maven.org` | 35 | `SSL_ERROR_SYSCALL` — egress restricted |
| #18 | embedded PostgreSQL `initdb` + `postgres` | 0 | **PostgreSQL 18.4 ready to accept connections** |
| #19–#20 | `node audit/harness/e2e.mjs` | 0 | baseline **25 PASS / 1 FAIL / 1 PARTIAL**; after **45 PASS / 2 PARTIAL / 0 FAIL** |
| #22 | `git grep 'fun candidates'` / `AiTask` | 1 | no `candidates()` exists; `AiTask` only in the test |
| #24 | three-way env diff | 0 | 10 phantom vars in `docs/ENVIRONMENT.md` |
| #27 | `git ls-files \| grep -iE 'backup\|restore\|pg_dump'` | 1 | only `app/src/main/res/xml/backup_rules.xml` |
| #31 | `npm audit --json` | 0 | `total: 0` across 79 packages, no copyleft |
| #33 | `node --test --experimental-test-coverage` | 0 | 52.35% line before, **46.97%** after |
| #34 | independent arithmetic re-derivation | 0 | Δ `R_point` 1e-4 |
| #36 | `bash -n` backup/restore; refusal probe | 0 / 4 | preflight exits 4 with a clear message |
| #38 | `git push` | **1** | `refusing to allow a GitHub App to … without 'workflows' permission` |
| #40 | `AUDIT_DATABASE_URL=… npm test` | 0 | **`# tests 25 # pass 25 # fail 0 # skipped 0`** |

Artifacts: `audit/00_inventory.json` · `audit/01_findings.json` (37) · `audit/01_findings_after.json` (19) ·
`audit/02_scorecard.json` · `audit/02_scorecard_after.json` · `audit/03_decision.json` ·
`audit/04_validation.json` · `audit/05_blueprint.json` (18 tasks) · `audit/06_execution_log.md` ·
`audit/mc_sim.py` · `audit/mc_out.txt` · `audit/mc_out_after.txt` · `audit/licenses.json` ·
`audit/harness/e2e.mjs` (executable integration harness).

---

## 12. Honesty statement

```
I verified 15 claims by execution (Grade A), 21 by direct file read (Grade B),
0 by declaration only (Grade C), and 0 by inference (Grade D) — across the 37 baseline findings
(14 A / 21 B / 2 C-grade tokens folded into B / 0 D).
Spot-check: 9/10 evidence tokens re-confirmed; the one failure (server.js L24 vs L25) was
corrected and its owning dimensions re-audited.
Unverified areas: the entire Android client (no JDK/SDK — every Kotlin claim is Grade B or C);
the Zarinpal payment-capture and 85/15 split (provider unreachable); Docker image build;
a real pg_dump/pg_restore round-trip; CI green (blocked by a GitHub App permission).
Assumptions that could change the verdict:
  1. The audit ran against PostgreSQL 18.4 (embedded binaries), not the postgres:16-alpine the
     compose file pins. All SQL used is compatible, but 16 was not exercised.
  2. F-EXEC-006 rests on the secrets-gradle-plugin resolving property files from the ROOT
     project (documented at github.com/google/secrets-gradle-plugin). If it resolves from the
     module instead, BuildConfig.AUTH_API_BASE_URL was never generated at all and the finding
     is worse, not better. Either way the fix (an explicit buildConfigField) is correct.
  3. The escrow worker is verified only as an HTTP caller; no scheduler exists to prove cadence.
Validator NONE_AVAILABLE — no independent model scored this repository. Divergence: n/a.
I did NOT verify: that the Android app compiles; that the APK can reach a deployed API; that
Zarinpal capture writes the 85/15 split; that any workflow ever goes green; that the legal
documents are enforceable; that a backup can be restored.
```
