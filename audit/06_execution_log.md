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

---

# Round 2 — commit `6d98660`

Second remediation pass, executed after the user asked to close as much of the remaining gap as
this sandbox allows. Seven findings closed, all verified by running them.

| task | finding | what was done | verification command | result |
|---|---|---|---|---|
| T-019 | F-EXEC-008 | `db/005_devices.sql` + `GET`/`POST /v1/devices`, `GET /v1/devices/:deviceId` with service history; `service_orders.device_id` | `node audit/harness/e2e.mjs` | J3.1–J3.4 **all PASS**; J3 → `VERIFIED_WORKING` |
| T-020 | F-EXEC-008 | Integration lane for the passport: create, health-ordered list, per-device read, IDOR 404, three validation 400s | `AUDIT_DATABASE_URL=… npm test` | pass |
| T-021 | F-SEC-004 | `src/ratelimit.js`; per-user fixed window on `/v1/ai/diagnoses` with `X-RateLimit-*` and `Retry-After` | same | 3rd call in window → **429**; a second caller is not affected |
| T-022 | F-SEC-007 | `requireVerifiedTechnician()` on quotes / evidence / start / complete | same | **403** while `verification_status='unsubmitted'`, **201** after approval |
| T-023 | F-SEC-005 | HMAC `state` token minted per payment intent and verified on the public callback | same | forged/absent state → **400** |
| T-024 | F-DATA-004 | `db/down/*.sql` for all five migrations; `migrate.js up/down/status`; rollback refuses without `CONFIRM_DESTRUCTIVE_ROLLBACK=yes` | `node src/migrate.js down 5` then `up` | up → **0 tables left** → up → **14 tables**; refusal exits **4** |
| T-025 | F-RELY-001 | `src/retry.js` — full-jitter backoff + per-provider circuit breaker, wired into Zarinpal, Kavenegar and Gemini | `node --test test/retry.test.js` | 10/10 pass; a 4xx is **never** re-sent |
| T-026 | F-LEGAL-002 | `DELETE /v1/me` — 409 while an escrow hold or unfinished order exists, otherwise the phone number becomes `erased:<hmac>` | `AUDIT_DATABASE_URL=… npm test` | **200** clean, **409** blocked, **404** on replay |

**Deliberately not done, and why it matters:**

* **F-DATA-005 was not closed with a `COPY`-based backup.** `pg_dump` is absent here, and
  `COPY TO STDOUT` over the wire protocol would have produced a "passing" drill for a mechanism
  that production never runs (`scripts/backup-database.sh` uses `pg_dump --format=custom`).
  Verifying the wrong mechanism would have been worse than leaving the finding open. It stays
  open as `requires_human`.
* **`server.js` was not split** (F-QUAL-006). ~8 h of churn for +0.07 weighted points against a
  money path that currently has 37 passing tests — a bad trade under a "no regressions"
  constraint. Recorded as an accepted residual.

**Two of my own errors found and fixed while doing this:**

1. `AUDIT_CI=blocked` was passed to the scoring engine, which *lifts* the D5 execution-failed cap.
   `gh run list` still shows `completed failure` for the three most recent runs, so the cap applies.
   Re-scored without it: R_point **87.592 → 86.624**. The lower number is the correct one.
2. Three column/table names were invented rather than read: `service_orders.technician_id` (the
   technician is reached through `quotes`), `sessions` (no such table — access tokens are stateless
   JWTs), `otp_codes` (it is `otp_challenges`), and `users.updated_at` (does not exist). Each
   surfaced as a 500 in the integration lane and was fixed against the real schema.

**Round 2 measured results**

| metric | before round 2 | after | command |
|---|---|---|---|
| tests | 25 | **37** (33 pass / 4 skipped without `AUDIT_DATABASE_URL`) | `npm test` |
| line coverage | 46.97% | **78.34%** | `node --test --experimental-test-coverage` |
| harness | 45 PASS / 2 PARTIAL | **46 PASS / 1 PARTIAL / 1 INFO / 0 FAIL** | `node audit/harness/e2e.mjs` |
| open findings | 19 | **13** | `audit/01_findings_after2.json` |
| R_point | 79.185 | **86.624** (B → A-) | `python3 audit/mc_sim.py` |
| journeys VERIFIED | 4/7 | **5/7** | `audit/02_scorecard_after2.json` |

Line coverage crossing 70% is what lifted the D2 test-evidence cap, and that alone is worth more
than any single finding closed this round.
