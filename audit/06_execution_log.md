# Phase 7 execution log

Branch: `arena/01a0fac4-tamirkar`. Baseline commit `3bd962b`. All commands below were executed
in this session; exit codes are real.

| # | task | commands run | exit | before → after evidence |
|---|---|---|---|---|
| 1 | T-001 order lifecycle, dispute freeze, refund, release gate | `node audit/harness/e2e.mjs` | 0 | `J6.1 released:1 on an unfinished order` → `L1.3 released:1 only after complete`, `L2.1/L2.5 released:0`, `L2.2 holds_frozen:1`, `L2.4 dispute_freeze 510000 debit technician_payable / credit escrow_liability`, `L3.1 refund 200`, `L3.2 replay 409`, `L3.3 net=0` |
| 2 | T-002 Android test compile break | `grep -c AiTask …AiProviderRouterTest.kt`; `grep -c 'candidates(' …` | 0 | 4 references to a nonexistent `AiTask` / `candidates()` → `0` and `0` |
| 3 | T-003 is_active enforcement | `node audit/harness/e2e.mjs \| grep S.3` | 0 | `S.3 → 201` → `S.3 → 401 (PASS)` |
| 4 | T-004 order read API | `node audit/harness/e2e.mjs \| grep J3` | 0 | `J3.1 FAIL, GET /v1/orders 404` → `J3.2 200 orders=1`, `J3.3 200 quotes=1 evidence=2`, `J3.4 IDOR probe 404` |
| 5 | T-005 server CI workflow | `git push` | **1** | `! [remote rejected] refusing to allow a GitHub App to create or update workflow without 'workflows' permission`. **BLOCKED — requires_human.** Content preserved at `ci/proposed/server.yml` |
| 6 | T-006 AUTH_API_BASE_URL | `grep -c buildConfigField app/build.gradle.kts` | 0 | `0` → `1`; README Android section now names the variable and the root `.env` |
| 7 | T-007 backup/restore | `bash -n` both; `DATABASE_URL=postgres://x bash scripts/restore-database.sh /etc/hostname` | 0 / **4** | scripts absent → present; preflight fires `required tool not on PATH: pg_restore` and exits 4 |
| 8 | T-008 escrow worker scheduling | `grep -c 'type: cron' render.yaml` | 0 | `0` → `1`; `ESCROW_WORKER_TOKEN` + `PLATFORM_API_BASE_URL` now in `.env.example` |
| 9 | T-009 four security gaps | `npm test`; `node audit/harness/e2e.mjs \| grep S.1` | 0 | `S.1 → 201` → `S.1 → 403`; new tests `loadConfig refuses to log plaintext OTP codes in production/staging` pass |
| 10 | T-010 pool + UUID validation | `node audit/harness/e2e.mjs \| grep R.1` | 0 | `R.1 → 500` → `R.1 → 400 (PASS)` |
| 11 | T-011 /metrics | `node audit/harness/e2e.mjs \| grep O.1` | 0 | endpoint absent → `O.1 200 lines=43 has_requests_total=true` |
| 12 | T-012 transactional writes, evidence gate, indexes | `node audit/harness/e2e.mjs \| grep -E 'MIG\|D.1'` | 0 | `D.1 evidence 201 on an unpaid order` → `D.1 409 (PASS)`; `MIG` now applies `004_operational_indexes.sql` |
| 13 | T-013 documentation | `grep -c AUTH_API_BASE_URL README.md` | 0 | ENVIRONMENT.md 10 phantom variables → 0; GO_NO_GO.md NO-GO → itemised status of all six original objections |
| 14 | T-014 Dockerfile | `grep -nE 'FROM\|HEALTHCHECK\|NODE_ENV' services/auth-api/Dockerfile` | 0 | no HEALTHCHECK/NODE_ENV → both present. **Digest pin NOT done** — registry unreachable, left as a documented open item rather than inventing a sha256 |
| 15 | integration lane in the project's own runner | `AUDIT_DATABASE_URL=postgres://oosta@127.0.0.1:55432/postgres npm test` | 0 | `# tests 25 # pass 25 # fail 0 # skipped 0` |

## Test totals

| point | tests | pass | fail | skipped | line cov | branch cov |
|---|---|---|---|---|---|---|
| before | 18 | 18 | 0 | 0 | 52.35% | 79.29% |
| after (unit only) | 25 | 23 | 0 | 2 | 46.97% | 86.98% |
| after (with `AUDIT_DATABASE_URL`) | 25 | 25 | 0 | 0 | — | — |

**Line coverage went down, and that is the honest number.** 450+ lines of new route code were
added to `server.js`, which the unit suite cannot reach because it runs without a database.
Branch coverage rose. The two integration tests close the gap when `AUDIT_DATABASE_URL` is set;
CI must set it (or run the equivalent service container) for the number to recover.

## Blocked / not attempted

* `git push` of `.github/workflows/*` — rejected by GitHub, `workflows` permission missing.
* `./gradlew` anything — no JDK, no Android SDK, `ANDROID_HOME` unset.
* `pg_dump` / `pg_restore` round-trip — `postgresql-client` not installed, no root for `apt`.
* Zarinpal sandbox payment — `sandbox.zarinpal.com` unreachable (sandbox egress is limited to
  the npm registry and the GitHub API).
* Docker image build — `docker` not installed.
