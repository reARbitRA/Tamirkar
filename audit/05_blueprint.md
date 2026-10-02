# ARBITER-MVP v2.1 — Execution Blueprint (round 3)

HEAD `7c8b749f4ca2f69c01de5e3d86d419b713d85344` · branch `arena/01a0fbb5-tamirkar` · 26 findings · 11 tasks

## Executive summary

The repository is a hardened, previously-audited codebase whose server half is in good shape: 37 of 37 Node tests passed against a real PostgreSQL 18.4 with zero skips and 78.34% measured line coverage, `npm audit` reports zero vulnerabilities at every severity, no secret is present in tracked files, and the full money path — completion gate, dispute freeze, idempotent refund, balanced ledger — runs green. `R_point` is **79.073** (grade **B**) with a 95% band of **[72.76, 84.83]**.

The blockers are not code quality. They are **unverified promises**: no installed CI job runs the server suite, every Android CI run in the repository's history has failed, the declared escrow cron can never start the worker, no backup has ever been restored, and the Android client calls only 4 of the 23 bearer-authenticated routes. Six P1 findings cap `P_GO` at 0.35 and the verdict is **NO-GO — REMEDIABLE**.

Seven tasks below were executed in this session and four more are specified for a human. The three P1s that remain open — client wiring, Android CI, and the restore drill — plus the legal sign-off need work no agent in this environment can perform.

## Critical-path DAG

```
T-001 (D7, closes F-RELY-001) ─┐
                               ├─► T-003 (D5, local CI gate) ─► T-004 (D5, install .github workflow)
T-002 (D4, closes F-DATA-002) ─┘                                     ▲
                                                                     │ external permission boundary
T-005 (D6, closes F-OPS-001)  ──────────────────────────────► independent
T-006 (D12, closes F-LEGAL-002) ────────────────────────────► independent
T-007 (D1, documents F-EXEC-001/F-API-001) ─────────────────► independent

T-008 (D4, human: restore drill)     ──────────────────────► independent, P1
T-009 (D5, human: Android CI green)  ──────────────────────► independent, P1
T-010 (D12, human: counsel)          ──────────────────────► independent, P1
T-007 ─► T-011 (D1, human: client wiring, 24 h)             ─► longest independent branch

longest executable path (4 nodes, 6.25 h): T-001 → T-002 → T-003 → T-004
```

Every task traces to at least one validated finding; the orphan check at the bottom of
`05_blueprint.json` lists all six P1 findings and confirms each has a task.

## Milestones

| Milestone | Exit criterion | Status |
| --- | --- | --- |
| **M0 — UNBLOCK** | `P0_count == 0` | **Already met** at HEAD. There is no P0 in this codebase. |
| **M1 — DE-RISK** | `P1 ≤ 2` and every journey `VERIFIED_WORKING` | **Partial.** Two P1s (F-OPS-001, and F-EXEC-004's local half) closed; P1 fell 6 → 5. The rest need a human. |
| **M2 — HARDEN** | `R_point ≥ 75` | **Already met** before remediation (79.07) and improved after (80.92). |
| **M3 — LAUNCH** | `P_GO ≥ 0.85`, `P1 ≤ 2`, no PARTIAL journeys | **Not attempted.** Requires T-008…T-011. |
| **M4 — BACKLOG** | — | Deferred with rationale: F-SEC-002, F-OPS-002, F-OPS-003, F-RELY-002/003/004, F-API-002, F-QUAL-001/003, F-EXEC-002, F-QUAL-002. |

## Projected figures

| State | `R_point` | Grade | `P_GO` raw | Effective `P_GO` | P0/P1 | Verdict |
| --- | --- | --- | --- | --- | --- | --- |
| Before | 79.073 | B | 0.8892 | 0.35 (capped by `P1 ≥ 5`) | 0/6 | NO-GO — REMEDIABLE |
| After Phase 7 | **80.9198** | **B+** | 0.9624 | 0.35 (still capped: `P1 = 5`) | 0/5 | NO-GO — REMEDIABLE |

Both figures are recomputed by `audit/harness/arbiter_engine.py`, not estimated. The `P_GO` cap is the honest headline: closing five findings improved the score but not the launch gate, because five P1s remain and the formula's hard gate does not care how much better the number looks.

## Test strategy

Test-first for every code task: a failing test encoding the acceptance criteria is added before the implementation. Regression guard: the 37-test Phase 2 baseline must stay at pass 37 / fail 0 / skip 0. T-007 (documentation only) uses verification-first with the reason logged: there is no executable behaviour to assert.

## Human-required table

| Task | Why an agent cannot do it | What a human must provide | Blocks GO |
| --- | --- | --- | --- |
| T-004 | GitHub App installation tokens cannot write `.github/workflows` without the `workflows` permission — reproduced verbatim in this session | `cp ci/proposed/server.yml .github/workflows/server.yml && git commit && git push` | Yes |
| T-008 | `pg_dump`/`pg_restore` are not installable here: no apt mirror and the only reachable PostgreSQL distribution ships `initdb`, `pg_ctl` and `postgres` only | Run the backup, then the restore into an isolated instance, and record RPO/RTO | Yes |
| T-009 | Both workflow files are under the protected path, and the failing step needs an iterative loop against GitHub's runners | Fix the SDK step, add a `pull_request` trigger, get one green run | Yes |
| T-010 | Iranian private law and PSP/escrow licensing are outside any repository | Six sign-offs with a name, a date and a version | Yes |
| T-011 | Needs a JDK and Android SDK that cannot be installed here, plus a product decision on encrypted session persistence | A working Gradle toolchain and that decision | Yes |

## Top-10 risk register

| # | Risk | Finding | Sev | Mitigation |
| --- | --- | --- | --- | --- |
| 1 | Escrow holds never release because the declared cron cannot start the worker | F-OPS-001 | P1 | **T-005 — closed** |
| 2 | A money-path regression ships undetected because no CI job runs the suite | F-EXEC-004 | P1 | T-003 **closed** (local), T-004 **rejected by GitHub** |
| 3 | Total loss of the payment and ledger record with no proven recovery | F-DATA-001 | P1 | T-008 (human) |
| 4 | Four core journeys have no Android client | F-EXEC-001 | P1 | T-007 documents; T-011 executes |
| 5 | Public paid launch without legal review | F-LEGAL-001 | P1 | T-010 (human) |
| 6 | No green Android build has ever been produced | F-EXEC-005 | P1 | T-009 (human) |
| 7 | An SMS-provider outage locks out every user for the window | F-RELY-001 | P2 | **T-001 — closed** |
| 8 | Personal data leaves the operator's control on API 24-30 via Google Drive | F-LEGAL-002 | P2 | **T-006 — closed** |
| 9 | Expired login rows accumulate forever | F-DATA-002 | P2 | **T-002 — closed** |
| 10 | Provider outages and escrow backlog are invisible | F-OBS-001 | P2 | Not scheduled — recorded in M4 |

## Machine-checkable Definition of Done

```
python3 audit/mc_sim.py --verify                                                  -> exit 0
cd services/auth-api && AUDIT_DATABASE_URL=... npm test                            -> "# skipped 0" and "# fail 0"
AUDIT_DATABASE_URL=... bash scripts/ci-server-check.sh                             -> exit 0
cd services/auth-api && node --test test/render-blueprint.test.js                  -> exit 0
python3 tools/verify_backup_rules.py                                               -> exit 0
grep -c '^- \[x\]' docs/legal/APPROVALS.md                                         -> 6 (NOT MET — no approvals yet)
gh run list --limit 1 --json conclusion                                            -> "success" (NOT MET — all runs fail)
```

Two of the seven are unmet, both requiring a human. They are listed rather than omitted.

## Launch runbook

1. A maintainer installs `.github/workflows/server.yml` and fixes `build.yml` so one Android run is green.
2. Run the backup/restore drill; record RPO/RTO in `docs/DEPLOYMENT.md`.
3. Counsel signs the four Persian texts; record each in `docs/legal/APPROVALS.md`.
4. Enable one flag at a time — login → triage → bookings → matching → payments → escrow release — watching `GET /metrics` after each.
5. Before enabling `FEATURE_ESCROW_RELEASE`, confirm the cron has run once and `oosta_escrow_holds_due` fell.
6. **Rollback lever** for every step is the matching `FEATURE_*` variable back to `false`. For the schema, `CONFIRM_DESTRUCTIVE_ROLLBACK=yes` plus `node src/migrate.js down N` — every down script drops tables, so take a restore point first; the full round trip `up → down 99 → up` is executed by `scripts/ci-server-check.sh`.
7. **On-call triggers:** any 5xx burst on `/v1/auth/*`; `oosta_provider_failures_total` increasing for more than five minutes; `oosta_escrow_holds_due` growing for two consecutive days.
