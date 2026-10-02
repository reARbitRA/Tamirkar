# 06 — Execution log (round 3)

HEAD `7c8b749f4ca2f69c01de5e3d86d419b713d85344` throughout. The SHA never changed mid-audit.

Environment notes that shape every entry below: `node 22.22.3` and `npm 10.9.8` are present; `java`,
`javac`, `gradle`, `docker`, `psql`, `sqlite3` and `pg_dump` are **absent**. The npm registry and
github.com are reachable; `repo1.maven.org`, `api.openai.com`, `api.anthropic.com`, `deb.debian.org`
and `registry-1.docker.io` are not. A real PostgreSQL 18.4 was obtained from the npm registry
(`@embedded-postgres/linux-x64@18.4.0-beta.17`) and started on port 55432, which converted the entire
server integration lane from skipped to executed.

---

## Phase 0 — bootstrap

| # | command | exit | result |
| --- | --- | --- | --- |
| 1 | `git rev-parse HEAD; git log -1 --stat; git branch -a; git status -uall` | 0 | HEAD `7c8b749`; exactly one commit in history (a merge of PR #21); clean tree; only `main` + `arena/01a0fbb5-tamirkar` |
| 2 | `git ls-files \| wc -l` | 0 | 222 tracked files, 95 196 lines |

**FREEZE_EXCEPTION-001.** The rubric names the audit branch `audit/mvp-readiness-<shortsha>`. This
session's environment pins all work to `arena/01a0fbb5-tamirkar` and forbids creating, checking out or
pushing any other branch. Every artifact was written under `./audit/` on that branch. No commit was
made to `main`, `master`, `trunk` or `production`. Recorded as an unacknowledged deviation, not a
silent substitution.

## Phase 1 — reconnaissance (selected commands)

| # | command | exit | result |
| --- | --- | --- | --- |
| 3 | `npm ci --no-audit --no-fund` in `services/auth-api` | 0 | 76 packages, 68 top-level entries |
| 4 | `npm test` (no database) | 0 | tests 37, pass 33, **skipped 4** — all four integration tests |
| 5 | `npm audit --json` | 0 | `{info:0, low:0, moderate:0, high:0, critical:0, total:0}` |
| 6 | `initdb` + `pg_ctl start` on 55432, then a `select version()` through `pg` | 0 | PostgreSQL 18.4, connection verified from the project's own client |
| 7 | `AUDIT_DATABASE_URL=... npm test` | 0 | **tests 37, pass 37, fail 0, skipped 0** |
| 8 | `AUDIT_DATABASE_URL=... node --test --experimental-test-coverage` | 0 | all files **78.34% line / 78.21% branch / 79.03% funcs**; the eleven test files 100% |
| 9 | three-way env diff (code ∨ `.env.example` ∨ `render.yaml` ∨ compose) | 0 | `MISSING_IN_EXAMPLE: []`; `UNUSED_IN_CODE: [POSTGRES_PASSWORD]`; not set by the blueprint: `AI_RATE_LIMIT_PER_MINUTE`, `PROVIDER_RETRY_ATTEMPTS` |
| 10 | `ls .github/workflows`; `grep -rl services/auth-api .github/workflows` | 1 | three Android-only workflows; **zero** matches for the server |
| 11 | `gh run list --limit 6` | 0 | six consecutive `completed failure`, all job *Build Android APK* |
| 12 | `ls -b .github/workflows` | 0 | one filename begins with U+200C ZERO WIDTH NON-JOINER |
| 13 | `gh api … x-oauth-scopes` | 0 | empty — a GitHub App installation token |
| 14 | `docs/API.md` endpoint count vs `src/server.js` route count | 0 | 27 vs 27 — they agree |
| 15 | `wc -l src/server.js`; `grep -c "await client.query('BEGIN')"` | 0 | 1297 lines; 17 transaction blocks |
| 16 | `grep -rli` for retrofit/moshi/coil/loggingInterceptor/firebase in app sources | 0 | 0 files each |
| 17 | license walk over `node_modules` | 0 | MIT 66 / ISC 6 / BSD-3-Clause 5 / Apache-2.0 1 / unknown 2; **zero copyleft** |
| 18 | `git grep -cE 'TODO\|FIXME\|HACK'` | 0 | no markers anywhere |

**Prompt-injection scan.** Result `NO_INJECTION_ATTEMPT_FOUND`. Every tracked `.md`, `.yml`, `.js`,
`.kt`, `.kts`, `.sh` and `.sql` file in the relevant set was read looking for text that addresses,
instructs or role-plays an agent. The two nearest matches — a Dockerfile comment addressed to a
future human maintainer, and a workflow step literally named *"Force Build APK (Ignore AI Errors)"* —
are recorded as `BENIGN` with the reasoning in `00_inventory.json`. Neither was followed as an
instruction, and the second is recorded as a finding (F-EXEC-006) on its own merits, because it
disables tests and lint.

## Phase 2 — adversarial audit

26 findings across eight lanes, in `01_findings.json`. Execution first, everywhere it was possible:
the server was installed, migrated, booted and exercised; the Android half could not be executed and
is labelled `UNEXECUTABLE` with the reason rather than graded as a failure.

**Unexecutable, with reasons (never counted as "failed"):** the Android build (no JDK or Android SDK
obtainable), live Zarinpal, live Gemini, live Kavenegar, `docker build`, and `pg_dump`/`pg_restore`.

## Phase 3–4 — scoring and adjudication

`audit/mc_sim.py` → `audit/harness/arbiter_engine.py` → `mc_out.txt`, `02_scorecard.json`,
`03_decision.json`. Monte Carlo executed with `numpy.random.default_rng(424242)`, N=10 000,
σ=3.0, `numpy 2.4.6` reported verbatim in the output so a reader can tell that the real sampler ran
rather than the LCG fallback.

Before: `R_point` **79.073** (grade B), `R_mean` 78.7599, CI95 [72.76, 84.8252], `P(R≥75)` = 0.8892
raw → **0.35 effective** after the `P1 ≥ 5` gate. Verdict **NO-GO — REMEDIABLE**.

## Phase 5 — validation

**`NONE_AVAILABLE`.** No second model is reachable: the only credential in the environment is the
GitHub token, and both `api.openai.com` and `api.anthropic.com` return HTTP 000. No peer output was
simulated, and no agreement metric is reported as if it had been measured.

Instead a **mechanical validator** ran (`arbiter_engine.py cross-check`): every penalty term was
re-derived from its raw severity/confidence/grade triple, `R_point` was re-summed from the published
dimension scores, the hard gates were re-applied, the Monte Carlo was re-run from the published
bands, and a seeded 10-token evidence sample was re-opened. Result: **exit 0**, spot-check
**10/10**, failures `[]`.

The spot-check was then *strengthened* mid-audit, and the first run of the stronger check **failed
6/10** — recorded here because the failure is the point: bounds-only checking proves nothing about
content. Each finding now carries a required anchor regex, and a token passes only if the cited range
is in bounds **and** matches that anchor. With anchors in place: **10/10**.

**FREEZE_EXCEPTION-002.** F-EXEC-001 said "13 of the 18 authenticated MVP routes". Task T-007 then
produced a machine-counted census — 27 routes, 4 public, 23 bearer, 4 wired, 19 with no call site —
and the finding, its evidence and its impact text were corrected. The correction makes the finding
**stronger**, so it cannot have been trimming toward a verdict. The freeze hashes were recomputed and
the exception is recorded alongside FREEZE_EXCEPTION-001.

## Phase 6 — blueprint

11 tasks in `05_blueprint.json` / `05_blueprint.md`. Seven executable, four `requires_human`. The
orphan check confirms all six P1 findings have a tracing task. Blueprint validation by a second model
was not possible (same reason as Phase 5) and is recorded as not performed rather than simulated.

## Phase 7 — autonomous execution

Commits are conventional-commit formatted with the task and finding ids in the trailer.

### T-001 — `fix(otp): a failed send must not consume the send window` · fixes F-RELY-001

*Test first.* Added an integration test that inserts three `status='failed'` challenges and asserts
the next `POST /v1/auth/request-otp` is **not** 429, plus a positive control asserting three delivered
challenges still are.

| step | command | exit | result |
| --- | --- | --- | --- |
| baseline | `AUDIT_DATABASE_URL=... node --test test/integration.test.js` | 1 | `not ok 5` — the defect reproduced |
| fix | add `AND status <> 'failed'` to the window query | — | `src/server.js:296-307` |
| verify | `AUDIT_DATABASE_URL=... node --test` | 0 | **tests 38, pass 38, fail 0, skipped 0** |

One intermediate failure worth recording: the positive control initially asserted
`too_many_requests` but got `resend_too_soon`, because the freshest row also tripped the 60-second
cooldown. The server was right and the test was wrong; the fixture was corrected to backdate
`sent_at` so the assertion isolates the window rule it names. Diff: +41 / −2.

### T-002 — `feat(data): retention sweep for otp_challenges` · fixes F-DATA-002

New `src/retention.js`, `test/retention.test.js` (2 tests), an `npm run retention` script, and
documentation. **Scope narrowed during execution:** the finding implied both `otp_challenges` and
`escrow_holds` grew without bound. `escrow_holds` rows are accounting and dispute records the
operator must retain, so purging them would be data loss, not hygiene. The remedy was narrowed to the
login table and the narrowing is recorded in `01_findings_after.json` rather than hidden.

| step | command | exit | result |
| --- | --- | --- | --- |
| verify | `AUDIT_DATABASE_URL=... node --test test/retention.test.js` | 0 | 2 tests pass, including "a rejected window must not delete anything" |
| verify | `node src/retention.js run` against a migrated database | 0 | `{"event":"retention.otp_challenges","deleted":0,"olderThanDays":7,...}` |
| verify | `node src/retention.js run` against an unmigrated database | 1 | `retention failed: relation "otp_challenges" does not exist` — fails loudly rather than silently |

Diff: +54 test, +46 source, +11 package.json.

### T-003 — `ci: add an executable local gate that mirrors the proposed workflow` · mitigates F-EXEC-004

New `scripts/ci-server-check.sh`. Its first run **failed** — and the failure was mine, not the
repository's: `src/migrate.js` calls `loadConfig()`, which validates the whole service environment
even though a migration only needs `DATABASE_URL`, so the script had no `JWT_SECRET`. Throw-away
values were supplied. (That coupling is a small hygiene observation in its own right — a migration
step needs secret material it never reads — recorded in the report as an observation rather than
inflated into a finding.)

| step | command | exit | result |
| --- | --- | --- | --- |
| negative | `bash scripts/ci-server-check.sh` with `AUDIT_DATABASE_URL` unset | 2 | refuses to run |
| verify | `AUDIT_DATABASE_URL=... bash scripts/ci-server-check.sh` | 0 | **ALL GATES PASSED** — including the full migration round trip `up → down 99 → up`, which nothing in the repository had ever executed end to end |

This is new evidence for D4 as well: all five migrations were proven reversible, in order, against a
real database. Diff: +98.

### T-004 — attempt to install `.github/workflows/server.yml` · F-EXEC-004 stays open

```
$ cp ci/proposed/server.yml .github/workflows/server.yml
$ git push origin arena/01a0fbb5-tamirkar
 ! [remote rejected] arena/01a0fbb5-tamirkar -> arena/01a0fbb5-tamirkar
   (refusing to allow a GitHub App to create or update workflow
    `.github/workflows/server.yml` without `workflows` permission)
```

Exactly the boundary `ci/proposed/README.md` documents, reproduced a third time.

**The probe commit was removed locally.** It was never pushed and never observed by anyone, and
leaving it would have made the branch tip unpushable forever, blocking every other change in this
session. The change is recorded here rather than left in history. `ci/proposed/README.md` was updated
with the observed outcome. F-EXEC-004 stays **P1 and open**: a script a human must remember to run is
not a CI gate.

### T-005 — `fix(ops): the declared escrow cron must run the worker` · fixes F-OPS-001

`dockerCommand: node src/escrow-worker.js` added to the cron service; the cron's environment reduced
to the three variables the worker actually reads; `FEATURE_ESCROW_RELEASE` moved from a hard `"false"`
on the cron to an operator-set `sync: false` on the web service. Verified first that the key is real
rather than invented: `gh api search/code` for `dockerCommand filename:render.yaml` returns 2116
results, and two public examples were read in full.

| step | command | exit | result |
| --- | --- | --- | --- |
| verify | `node --test test/render-blueprint.test.js` | 0 | 4 tests pass |
| caveat | — | — | This proves the declaration, not that Render accepts it. No Render credential exists here. |

Diff: +17 / −13 in `render.yaml`, +80 test.

### T-006 — `fix(privacy): exclude Room and preferences from pre-API-31 backup` · fixes F-LEGAL-002

`backup_rules.xml` went from an empty `<full-backup-content>` — which means "back up everything" — to
excluding the `database` and `sharedpref` domains, mirroring what `data_extraction_rules.xml` already
does for API 31+. `minSdk` is 24, so this path is live on a large share of installable devices.

| step | command | exit | result |
| --- | --- | --- | --- |
| verify | `python3 tools/verify_backup_rules.py` | 0 | 10/10 checks pass |
| **negative control** | same script with the defect reintroduced | **1** | `FAIL the Room database is excluded…`, `FAILED: 2 check(s)` — the verifier falsifies its own subject |

Diff: +145 tool, +4 / −6 rules.

### T-007 — `docs: publish the client-wiring census` · documents F-EXEC-001, F-API-001

A generated table of all 27 routes versus the Android call sites, inserted at
`docs/GO_60_ROADMAP.md:47-90`, plus an identifier-ownership note in `docs/API.md`. Also corrected
`README.md:227`, which claimed the Android tests are "executed in CI" while every run has failed
(this is what closes F-DOC-001). Verification-first, with the reason logged: there is no executable
behaviour to assert in a documentation change, and the acceptance criterion is a grep-countable
census. Diff: +60 / −4.

### Regression guard

Nothing that passed at the Phase 2 baseline became failing. Baseline 37/37/0 → final
**44 tests, pass 44, fail 0, skipped 0**. No test was skipped, deleted, weakened or marked `.only`.
`npm audit` still reports zero vulnerabilities. `python3 audit/mc_sim.py --verify` exits 0.

### Not executed

T-008 (restore drill), T-009 (Android CI), T-010 (legal), T-011 (client wiring) all carry
`requires_human: true` and were **halted** rather than attempted. Reasons and required inputs are in
`05_blueprint.md` and in the `could_not_do` table of `07_final_report.md`.

## Milestone ritual

```
MILESTONE M0 — R: 79.073→79.073 | P_GO(eff): 35.00%→35.00% | P0:0 P1:6   (already met: no P0)
MILESTONE M1 — R: 79.073→80.920 | P_GO(eff): 35.00%→35.00% | P0:0 P1:5   (partial; capped by P1>=5)
MILESTONE M2 — R: 79.073→80.920 | P_GO(eff): 35.00%→35.00% | P0:0 P1:5   (exit R>=75 already met)
MILESTONE M3 — not attempted (needs P1<=2 and zero PARTIAL journeys)
```

Phase 3 was recomputed in full after Phase 7 (`02_scorecard_after3.json`, `mc_out_after3.txt`) and
Phase 4 was re-adjudicated (`03_decision_after.json`). Mini Phase 5 re-scoring of the changed
dimensions: the mechanical validator passed again with spot-check 10/10. Termination reason: the
remaining blueprint tasks all carry `requires_human`, which is an explicit hard stop.

## Phase 8 — quality bar

Checklist and weighted self-assessment in `08_quality_bar.md`: **99.2 / 100** (target ≥ 98).
Mechanical checks run in this phase: `emit` re-run produced byte-identical hashes for
`01_findings.json`, `02_scorecard.json`, `03_decision.json` and `mc_out.txt`; the schema, discrete
confidence scale, dimension ownership of every penalty term and the 100-point weight sum were
re-validated from the JSON; a secret-pattern sweep over every audit artifact and the full round-3
diff returned zero matches; `cross-check` and `mc_sim.py --verify` both exited 0. The report at
`07_final_report.md` carries the BEFORE/AFTER adjudication blocks, the verdict, the top-5 residual
risks and the could_not_do table.

