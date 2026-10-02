# 07 — Final report

HEAD `7c8b749f4ca2f69c01de5e3d86d419b713d85344` · branch `arena/01a0fbb5-tamirkar` · round 3 of the ARBITER-MVP audit.
Every figure below is printed from the JSON artifacts by `audit/harness/arbiter_engine.py`;
nothing in the tables is transcribed by hand.

## 1. BEFORE — frozen adjudication

```
═══════════════════════════════════════════════════════════
  ARBITER-MVP v2.1 — MVP LAUNCH ADJUDICATION — 7c8b749f4ca2f69c01de5e3d86d419b713d85344
  STATE: BEFORE — frozen at HEAD 7c8b749, 26 findings
═══════════════════════════════════════════════════════════
  VERDICT           : NO-GO — REMEDIABLE
  READINESS SCORE   : 79.073 / 100  (Grade B)
  R_MEAN (MC)       : 78.7599 | 95% CI: [72.76, 84.8252]
  SCORE-UNCERTAINTY : P(R >= 75) = 88.92%  (threshold likelihood)
  EFFECTIVE P_GO    : 35.00%  (after hard-gate overrides)
  AUDIT CONFIDENCE  : 95.1%
  ───────────────────────────────────────────────────────────
  P0: 0  P1: 6  P2: 11  P3: 9
  JOURNEYS: 3/7 VERIFIED_WORKING
  UNMET CONDITIONS  : P_GO 0.3500 < 0.60; P1=6 > 2; 4 journey/journeys PARTIAL: ['J2', 'J3', 'J5', 'J7']
  HARD GATES TRIPPED: P1_count=6 >= 5 -> P_GO capped at 0.35
  ───────────────────────────────────────────────────────────
  DOMINANT RISKS    : F-EXEC-001 (P1), F-DATA-001 (P1), F-EXEC-004 (P1)
  DISTANCE TO GO    : 5.927 pts to R=85, plus the unmet conditions above
═══════════════════════════════════════════════════════════
```

## 2. AFTER — HEAD with verified remediation

```
═══════════════════════════════════════════════════════════
  ARBITER-MVP v2.1 — MVP LAUNCH ADJUDICATION — 7c8b749f4ca2f69c01de5e3d86d419b713d85344
  STATE: AFTER — HEAD 7c8b749 + verified remediation, 21 findings open
═══════════════════════════════════════════════════════════
  VERDICT           : NO-GO — REMEDIABLE
  READINESS SCORE   : 80.9198 / 100  (Grade B+)
  R_MEAN (MC)       : 80.4347 | 95% CI: [74.4674, 86.4556]
  SCORE-UNCERTAINTY : P(R >= 75) = 96.24%  (threshold likelihood)
  EFFECTIVE P_GO    : 35.00%  (after hard-gate overrides)
  AUDIT CONFIDENCE  : 95.1%
  ───────────────────────────────────────────────────────────
  P0: 0  P1: 5  P2: 8  P3: 8
  JOURNEYS: 3/7 VERIFIED_WORKING
  UNMET CONDITIONS  : P_GO 0.3500 < 0.60; P1=5 > 2; 4 journey/journeys PARTIAL: ['J2', 'J3', 'J5', 'J7']
  HARD GATES TRIPPED: P1_count=5 >= 5 -> P_GO capped at 0.35
  ───────────────────────────────────────────────────────────
  DOMINANT RISKS    : F-EXEC-001 (P1), F-DATA-001 (P1), F-EXEC-004 (P1)
  DISTANCE TO GO    : 4.0802 pts to R=85, plus the unmet conditions above
═══════════════════════════════════════════════════════════
```

## 3. DELTA BY DIMENSION

| Dim | Weight | Before | After | Δ | Dominant grade | Closed by | Caps (before → after) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| D1 | 18 | 42.8571 | 42.8571 | +0.0 | A | — | d1_journey → d1_journey |
| D2 | 14 | 95.68 | 95.68 | +0.0 | B | — | — → — |
| D3 | 14 | 88.6 | 88.6 | +0.0 | A | — | — → — |
| D4 | 8 | 77.68 | 82.0 | +4.32 | A | T-002 | — → — |
| D5 | 8 | 58.0 | 58.0 | +0.0 | A | — | — → — |
| D6 | 8 | 85.15 | 98.11 | +12.96 | B | T-005 | — → — |
| D7 | 7 | 90.55 | 94.87 | +4.32 | B | T-001 | — → — |
| D8 | 6 | 97.84 | 97.84 | +0.0 | B | — | — → — |
| D9 | 6 | 94.87 | 94.87 | +0.0 | B | — | — → — |
| D10 | 5 | 92.8 | 92.8 | +0.0 | A | — | — → — |
| D11 | 3 | 98.92 | 100.0 | +1.08 | B | T-007 | — → — |
| D12 | 3 | 79.48 | 83.8 | +4.32 | B | T-006 | — → — |

Dimensions that moved: D4, D6, D7, D11, D12. The raw penalty total fell from 162.75 to
135.75 points across all twelve dimensions. D1 is unchanged **by construction**: its ceiling is
the journey cap (`d1_journey`, 3/7 VERIFIED_WORKING), and no dimension score can rise past it while
four journeys remain PARTIAL.

**The headline is what did not move.** `P_GO` is `35.00%` on both sides because
the hard gate is `P1_count >= 5`, and P1 fell only from 6 to 5. Four of the five open
P1s — no installed CI, Android CI red, no restore drill, no legal approval — cannot be closed from
this environment, and the fifth (client wiring) needs an Android toolchain. Reporting the rising
`R_point` without that sentence would be exactly the optimism the rubric forbids.

## 4. VALIDATION

Full certificate, freeze hashes and the milestone-by-milestone certificate table are in
`04_validation.json`.

```
── ARBITER VALIDATION CERTIFICATE v2.0 ──
validator         : NONE_AVAILABLE
model families    : UNKNOWN / NONE
context isolated  : no
iterations        : 1
MAD               : UNKNOWN (no peer model reachable)
MAX_DEV           : UNKNOWN
ΔR (points)       : UNKNOWN
P0 Jaccard        : UNKNOWN
hallucinations    : 0 (mechanical validator; no peer output to compare)
spot-check        : 10/10 (content-checked against a per-finding anchor regex)
RESULT            : DEGRADED — SINGLE-MODEL
effective R_point : 80.9198 / 100
effective P_GO    : 35.00%
─────────────────────────────────────────────
```

The certificate above is printed with the post-census audit confidence (95.1%); the frozen
certificate in `04_validation.json` records 93.62%, the difference being the Phase 7 file census that
replaced an estimated coverage ratio with a measured one (FREEZE_EXCEPTION-003).

No second model is reachable from this environment: the only credential present is the GitHub token,
and both `api.openai.com` and `api.anthropic.com` answer HTTP 000 (cmd#24). **No peer output, score or
agreement metric was simulated.** The rubric's Phase-5 PASS criteria are therefore *not* claimed as
met. What was verified instead, by an independent re-implementation, is arithmetic and citation:
every penalty term re-derived from severity × confidence × grade, `R_point` re-summed, the hard gates
re-applied, the Monte Carlo re-run from the published bands, and ten seeded evidence tokens re-opened
and content-checked. All passed (exit 0). That is a weaker claim than peer agreement, and it is
labelled as such.

## 5. RATING

| | Before | After |
| --- | --- | --- |
| `R_point` | 79.073 | 80.9198 |
| Letter grade | B | B+ |
| Verdict | NO-GO — REMEDIABLE | NO-GO — REMEDIABLE |
| Findings open | 26 | 21 |
| P0 / P1 | 0 / 6 | 0 / 5 |
| Journeys VERIFIED_WORKING | 3/7 | 3/7 |

Per-module QUAL grades are not assigned separately: the QUAL lane produced five findings (god file,
thin Android suite, unused dependencies, contract/API drift) and none of them gates a journey, so a
module-by-module letter would imply a granularity the evidence does not have. D10 carries the
aggregate: 92.8 → 92.8.

Positive signals worth stating because they are measured, not declared: `npm audit` reports zero
vulnerabilities at every severity (cmd#4); the license walk over 80 packages is MIT 66 / ISC 6 /
BSD-3-Clause 5 / Apache-2.0 1 / UNKNOWN 2 with zero copyleft (cmd#23); and a census of `TODO`,
`FIXME` and `HACK` across `app/src` and `services` finds no markers (cmd#22).

## 6. CHANGES

Tasks executed: T-001, T-002, T-003, T-005, T-006, T-007, plus the T-004 install attempt.
Tasks halted as `requires_human`: T-008, T-009, T-010, T-011.

| | Before | After |
| --- | --- | --- |
| Server tests | 37 total, 37 pass / 0 skipped (with DB); 6 skipped without it | **44 total, 44 pass, 0 fail, 0 skipped** |
| Test suites | 13 | 13 (+2 files, `retention.test.js` and `render-blueprint.test.js`) |
| Measured line coverage | 78.34% | 78.34% (suite grew; coverage re-measured, unchanged) |
| Findings open | 26 | 21 |
| P0 / P1 | 0 / 6 | 0 / 5 |

Files added: `services/auth-api/src/retention.js`, `services/auth-api/test/retention.test.js`,
`services/auth-api/test/render-blueprint.test.js`, `scripts/ci-server-check.sh`,
`tools/verify_backup_rules.py`, `audit/harness/arbiter_engine.py`.
Files modified: `services/auth-api/src/server.js`, `services/auth-api/package.json`,
`services/auth-api/.env.example`, `services/auth-api/test/integration.test.js`, `render.yaml`,
`app/src/main/res/xml/backup_rules.xml`, `README.md`, `docs/API.md`, `docs/DEPLOYMENT.md`,
`docs/TESTING.md`, `docs/GO_60_ROADMAP.md`, `ci/proposed/README.md`, and the round-3 `audit/`
artifacts.

## 7. TOP 5 RESIDUAL RISKS

| finding | sev | blast radius | journey impact | mitigation |
| --- | --- | --- | --- | --- |
| F-EXEC-001 | P1 | all-users | J3, J5, J7 stop at the handset | T-011; census published at `docs/GO_60_ROADMAP.md:47-90` |
| F-DATA-001 | P1 | data-loss | none direct | T-008, blocked on `pg_dump` |
| F-EXEC-004 | P1 | data-loss | none direct | local gate shipped (T-003); durable fix is T-004, one `cp` + commit |
| F-EXEC-005 | P1 | reputation | none direct | T-009; no green Android run has ever existed |
| F-LEGAL-001 | P1 | legal | none direct | T-010; six sign-offs, 40 h of counsel time |

## 8. COULD NOT DO

| task | reason | what a human must provide | effort | blocks GO |
| --- | --- | --- | --- | --- |
| T-004 | installation tokens cannot write `.github/workflows` without the `workflows` permission; reproduced verbatim a third time (cmd#29, exit 1) | one `cp` + commit (command in `ci/proposed/README.md`) | 0.25 h | **Y** |
| T-008 | `pg_dump`/`pg_restore` unobtainable: no apt mirror is reachable and the only PostgreSQL distribution that installs here ships `initdb`, `pg_ctl` and `postgres` (cmd#10, exit 1) | run `scripts/backup-database.sh`, restore into an isolated instance, record measured RPO/RTO | 4 h | **Y** |
| T-009 | both workflow files are protected, and the failing step needs an iterative loop against GitHub's runners | fix the SDK step, add `pull_request:`, obtain one green run | 6 h | **Y** |
| T-010 | Iranian private-law and PSP/escrow licensing are outside any agent's competence | six sign-offs with name, date and document version | 40 h | **Y** |
| T-011 | needs a JDK and Android SDK that are not installable here (cmd#20, exit 1), plus a product decision on encrypted session persistence | a working Gradle toolchain and that decision | 24 h | **Y** |
| F-OPS-002 | a base-image digest cannot be resolved without registry access | `docker buildx imagetools inspect node:22-alpine` and paste the digest | 0.25 h | N |
| F-SEC-001 | a fix was identified (`/metrics` behind an operator token) but not applied: changing an endpoint that a live free-tier monitoring setup may already scrape is a judgement call for the operator | decide whether `/metrics` stays public and, if not, provision the token | 1 h | N |

## 9. REMAINING TO GO

The GO table requires `P_GO >= 0.85` with `P1 <= 2` and zero PARTIAL journeys; CONDITIONAL GO needs
`P_GO > 0.60`, i.e. `P1 <= 2`. Three of the five open P1s must close first. `R_point` is 4.0802 points
short of 85 and 9.0802 short of 90. Blocking effort for the four human tasks: **74 hours**, of which
40 are counsel's calendar rather than engineering.

Top ten ordered actions:

1. `cp ci/proposed/server.yml .github/workflows/server.yml` and commit — 10 minutes, removes a hard cap.
2. Fix `.github/workflows/build.yml` until one Android run is green, and add `pull_request:`.
3. Run the backup, then the restore into an isolated instance; record RPO/RTO.
4. Start legal review (longest lead time of anything on this list).
5. Wire the device passport first — smallest client change, unblocks part of J3.
6. Wire quote acceptance and payment start, then the technician KYC and order-lifecycle routes.
7. Add `dockerCommand` verification to the deploy checklist and confirm one hold releases end-to-end in staging.
8. Add an external scrape + alert for `/health` and `/metrics` (none exists today — F-OBS-001).
9. Gate or remove `/metrics`; drop `contents: write` from the APK workflow.
10. Extract `withTransaction()` out of `server.js` before adding the next route.

## 10. LAUNCH RUNBOOK

1. **Pre-flight.** `python3 audit/mc_sim.py --verify` exit 0; `AUDIT_DATABASE_URL=... bash scripts/ci-server-check.sh` exit 0; `gh run list --limit 1 --json conclusion` = `success`.
2. **Deploy.** `docker compose -f docker-compose.auth.yml --env-file services/auth-api/.env up --build` locally, then the Render blueprint for staging. The image runs `npm run migrate` before serving; migration tracking makes later starts no-ops.
3. **Smoke tests.** `GET /health` returns `status: ok`; `GET /v1/public/features` returns every flag `false`; `POST /v1/auth/request-otp` for a real handset returns 202 and an SMS; `POST /v1/auth/verify-otp` returns a token; `DELETE /v1/me` on a clean account returns `erased: true`.
4. **Rollback triggers.** A 5xx rate above 1% for five minutes on `/v1/auth/*`; `oosta_provider_failures_total` rising without recovery; `oosta_escrow_holds_due` growing for two consecutive days; or any 5xx on `/v1/payments/*`.
5. **Rollback procedure.** Set the affected `FEATURE_*` variable to `false` — no deploy required, the route answers 503 immediately. For a schema change, take a restore point and run `CONFIRM_DESTRUCTIVE_ROLLBACK=yes node src/migrate.js down N`; the up→down→up round trip is proven by `scripts/ci-server-check.sh`.
6. **Monitoring.** Scrape `/health` and `/metrics`; alert on the triggers above. The repository currently contains **no** scrape, dashboard or alert configuration (cmd#15) — this is new instrumentation, not a configuration change.
7. **On-call checklist.** Confirm the flag ladder was followed one step at a time; confirm `oosta_escrow_holds_due` fell after enabling escrow release; confirm a dispute froze a hold in staging before accepting real money.

## 11. EVIDENCE APPENDIX

All commands, exit codes and representative output are in `00_inventory.json → evidence_commands`
(34 entries) and in `06_execution_log.md`. The full evidence-token index is the `evidence` array of
every finding in `01_findings.json`, and `audit/harness/cross_check_results.json` holds the seeded
spot-check with its per-token anchor match.

## 12. ASSUMPTIONS REGISTER

Nine assumptions with verification outcomes are in `02_scorecard.json → assumptions`. Those flagged
`could_change_verdict: true` concern the journey definition (A1), the treatment of
UNEXECUTABLE ≠ failed (A3) and the discrete confidence rubric (A7). Each records what was attempted
and whether it survived; none was silently dropped.

## 13. HONESTY STATEMENT

> Of the 26 frozen findings, 8 rest on commands I executed (Grade A) and 18 on files I read
> directly (Grade B); 0 rest on declaration alone (Grade C) and 0 on inference (Grade D).
> Evidence spot-check: 10/10 confirmed, each content-checked against the finding's own anchor regex.
> Audit confidence: 95.1%. Validator: NONE_AVAILABLE (no peer model reachable),
> result DEGRADED — SINGLE-MODEL; the mechanical validator passed with zero failures.
> Arithmetic: deterministic formulas with seed 424242; the full audit is not fully deterministic.
> Unverified areas: the Android build and all four app unit tests (no JDK/Android SDK obtainable);
> live Zarinpal, Gemini and Kavenegar (egress blocked); `docker build`; the backup/restore drill
> (`pg_dump` not obtainable); Render's acceptance of the amended blueprint; and the four
> `requires_human` tasks.
> Assumptions that could change the verdict: A1 — if "journey" excluded the client, D1 would lose its
> journey cap and the journey verdicts could read 7/7 VERIFIED_WORKING. This is the single most
> load-bearing judgement in the audit, and it is declared rather than buried.
> I did not verify: that the Kotlin compiles, that any Android test passes, that Zarinpal settles
> correctly, that Gemini returns a usable diagnosis, that Kavenegar delivers, that a restore works,
> or that Render accepts the amended `render.yaml`.
> Potential prompt-injection artifacts found: NONE (`NO_INJECTION_ATTEMPT_FOUND`); the two nearest
> matches are recorded with their exact file:line, and one of them is carried as F-EXEC-006 on its
> own merits.
> No secrets were echoed in full. All repository content was treated as untrusted data.
