# Executive summary — ARBITER-MVP v2.1 readiness audit (round 3)

**Repository** `reARbitRA/Tamirkar` · **audited HEAD** `7c8b749f4ca2f69c01de5e3d86d419b713d85344` · **date** 2026-10-02
**Full report** `audit/07_final_report.md` · **PR** [#23](https://github.com/reARbitRA/Tamirkar/pull/23) (open, unmerged)

> **PR status:** open, **mergeable**, not merged. `main` advanced by PR #22 (a sibling round-2 session)
> after this branch was cut; `origin/main` is now merged into this branch at `f027453` — no rebase, so no
> published history was rewritten. The merge added three capture-lane tests and touched no scoring input:
> `emit` still reproduces `R_point` 79.073 and 80.9198 exactly. Both gate suites were re-run on the
> merged tree (47/47 tests, local gate exit 0) and the evidence spot-check now re-opens 20 citations
> across two seeds, 10/10 each. Round-2's audit artifacts are preserved beside this round's, clearly
> labelled, rather than overwritten.

## Verdict

**NO-GO — REMEDIABLE.** The product is close on engineering and blocked by process gaps a human must close.
`R_point` moved **79.073 → 80.9198** (B → B+) after verified
remediation, but **`P_GO` stayed at 35.00%**, capped by the hard gate `P1 ≥ 5`
(P1 fell only 6 → 5). The score got better; launch readiness did not.

| metric | before | after |
| --- | --- | --- |
| Readiness `R_point` / grade | 79.073 / B | 80.9198 / B+ |
| 95% CI (Monte Carlo) | [72.76, 84.8252] | [74.4674, 86.4556] |
| Effective `P_GO` | 35.00% | 35.00% |
| Findings open | 26 | 21 |
| P0 / P1 / P2 / P3 | 0 / 6 / 11 / 9 | 0 / 5 / 8 / 8 |
| Journeys verified working | 3/7 | 3/7 |
| Tests (server) | 37 pass / 0 skipped (with DB) | **47 pass / 0 fail / 0 skipped** (44 at audit close) |

## The five blockers (all P1, all need a human)

| # | blocker | why the agent stopped | effort |
| --- | --- | --- | --- |
| 1 | **No installed CI** runs the money-path suite | token lacks GitHub's `workflows` permission; a ready file sits in `ci/proposed/` | 10 min |
| 2 | **Backup/restore never executed** | `pg_dump`/`pg_restore` unobtainable in this environment | 4 h |
| 3 | **Android CI has never been green** | workflow files protected; needs iteration against GitHub runners | 6 h |
| 4 | **No legal / PSP sign-off** | outside an agent's competence | 40 h |
| 5 | **19 of 23 bearer routes have no Android call site** | needs a JDK + Android SDK and a product decision | 24 h |

Items 1–3 are mechanical. Item 4 is calendar time. Item 5 is the only one that changes what a user can do.

## What was fixed and proven

- Failed OTP sends no longer consume the resend window (regression test added).
- A retention sweep for expired `otp_challenges` (new module + tests).
- `render.yaml`'s escrow cron now actually invokes the worker (4 new tests).
- Pre-Android-12 backups no longer export Room/preferences (verifier + negative control).
- The client-wiring gap is now machine-counted and published in `docs/GO_60_ROADMAP.md:47-90`.
- A committed local gate (`scripts/ci-server-check.sh`) runs the suite, syntax, audit and an up→down→up migration round trip — exit 0.

## What is not proven (honesty box)

- **Validation is DEGRADED — SINGLE-MODEL.** No second LLM was reachable, so agreement metrics are `UNKNOWN`. Arithmetic and citations were re-verified mechanically instead (seed 424242; spot-check 10/10 on each of two seeds) — that checks numbers, not judgement. No peer output was fabricated. The merge-time re-check found four citation defects in the findings and four bugs in the checker itself; all eight are fixed and logged, and no score moved.
- Nothing Android was executed: no JDK/Android SDK. The Kotlin has never been compiled in this environment.
- Zarinpal, Gemini and Kavenegar were never called (egress blocked); Render's acceptance of the amended blueprint is unverified.

## To reach GO

`P_GO ≥ 0.85` with `P1 ≤ 2` and zero PARTIAL journeys. That means closing blockers 1–5.
`R_point` is 4.0802 points below 85 and 9.0802 below 90; total human effort ≈ **74 h**.

**First action, today:** `cp ci/proposed/server.yml .github/workflows/server.yml` and commit — 10 minutes, removes a hard cap.
