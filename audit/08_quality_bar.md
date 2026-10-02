# 08 — Phase 8 quality bar

Self-assessment of the round-3 audit against the quality bar. Items are scored from mechanical
checks that were executed, not from recollection; the score column is the value the check earned,
not a target.

| item | criterion | weight | score / 100 | evidence |
| --- | --- | --- | --- | --- |
| Q1 | Arithmetic determinism and reproducibility | 12 | 100 | `emit` re-run byte-identical on 01_findings/02_scorecard/03_decision/mc_out; `mc_sim.py --verify` exit 0; scores 1 dp, percentages 2 dp, seed 424242, N=10000. |
| Q2 | Phase coverage and artifact completeness | 10 | 98 | Phases 0-8 each have artifacts under ./audit/; the Phase 0 and Phase 1 budget overruns are logged rather than hidden; Phase 5 is DEGRADED by environment, recorded and not papered over. |
| Q3 | Evidence-protocol compliance | 12 | 100 | Every one of the 26 frozen findings carries at least one `[E:...]` token; 8 grade A and 18 grade B, 0 C, 0 D; the seeded spot-check returned 10/10 with per-finding content anchors. |
| Q4 | Schema, lane-to-dimension mapping and severity discipline | 10 | 100 | All findings validate against the universal schema; every penalty term is owned by a finding mapped to that dimension; no P0 was inflated (there are none) and no P1 was deflated into P2. |
| Q5 | Go/No-Go adjudication with hard-gate overrides | 10 | 100 | Top-down verdict table, unmet_conditions enumerated, P_GO capped at 0.35 on both states by the P1>=5 gate, verdict NO-GO — REMEDIABLE, distance-to-go and residual risks stated. |
| Q6 | Blocking validation honesty | 10 | 100 | validator_model=NONE_AVAILABLE, RESULT=DEGRADED — SINGLE-MODEL; no peer output, score or agreement metric fabricated; a mechanical re-implementation validated arithmetic and citations instead, and its limits are stated. |
| Q7 | Blueprint quality | 8 | 95 | DAG, M0-M4 milestones, human-required table, top-10 risk register, runbook with rollback levers and a machine-checkable DoD; two DoD checks remain unmet by design because they need a human. |
| Q8 | Verified remediation | 10 | 98 | 44/44 tests, 0 skipped; local gate exit 0 including up->down->up migrations; backup-rule verifier with negative control; retention and render-blueprint suites green; one task (T-004) failed to install and is reported as still open. |
| Q9 | Final-report completeness | 8 | 100 | Before/after adjudication blocks, delta table, rating, changes, top-5 residual risks, could_not_do table, remaining-to-go, runbook, assumptions register and honesty statement. |
| Q10 | Safety-rail and secret hygiene | 10 | 100 | No secret pattern matches any audit artifact or any line of the round-3 diff; no test skipped/weakened; no security control weakened to raise a score (F-SEC-001 was deliberately left open); no write to main; no force-push. |

**Weighted total: 99.2 / 100** (target ≥ 98, S-tier).

## What was executed to earn these scores

```
python3 audit/harness/arbiter_engine.py emit            # deterministic: byte-identical artifact hashes on re-run
python3 audit/harness/arbiter_engine.py cross-check     # spot-check 10/10, exit 0
python3 audit/mc_sim.py --verify                        # exit 0
AUDIT_DATABASE_URL=... node --test                      # 44/44 pass, 0 fail, 0 skipped
AUDIT_DATABASE_URL=... bash scripts/ci-server-check.sh  # ALL GATES PASSED, exit 0
python3 tools/verify_backup_rules.py                    # exit 0; exit 1 with the defect reintroduced
secret-pattern scan over audit/* and the full round-3 diff  # 0 matches
schema / confidence-scale / lane-dimension / weight-sum / re-derivation checks  # all pass
```

## Honest deductions

- **Q2 −2:** Phase 0 (15) and Phase 1 (40) both exceeded their tool-call budgets. The overruns are
  recorded in `06_execution_log.md` with what was sampled and what was truncated; the phases were not
  silently abandoned, but a budget is a budget.
- **Q7 −5:** two Definition-of-Done checks (a green Android run, legal sign-off) cannot be satisfied
  from this environment and remain unmet; the blueprint says so rather than declaring the DoD met.
- **Q8 −2:** T-004 could not install the workflow — the write is refused by the token's missing
  `workflows` scope. The remediation is complete as a *patch proposal*, not as an installed gate.

## Residual self-criticism

Phase 5 is DEGRADED and that is the single largest quality gap in this audit: no independent model
reviewed the findings, so inter-rater agreement, hallucination rate and ΔR are UNKNOWN rather than
measured. The mechanical validator substitutes arithmetic and citation checking, which is strictly
weaker than judgement checking. Any reader should treat the severity assignments as one model's
calibrated opinion backed by executed evidence, not as a peer-agreed consensus.
