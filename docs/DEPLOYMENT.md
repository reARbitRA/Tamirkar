# Oosta deployment, rollback, and release evidence

## Architecture

`services/auth-api` is the server-side Oosta platform boundary. It owns Kavenegar OTP, JWT issuance, preliminary AI, KYC workflow state, Zarinpal payment initiation/verification, audit logs, and the append-only double-entry ledger. Android contains only the public API URL.

Run it behind HTTPS with a managed PostgreSQL 16+ database and a reverse proxy that applies IP/device rate limits, request-size limits, TLS, and access logging. Do not expose PostgreSQL publicly.

## Environments and secrets

For the invited, non-financial pilot only, [`../render.yaml`](../render.yaml) is an importable Render Blueprint with every marketplace/money flag set to `false` and automatic deployment off. Follow [`FREE_TIER_PILOT_BLUEPRINT.md`](FREE_TIER_PILOT_BLUEPRINT.md) before importing it; it is not a public-production architecture.

Create distinct development, staging, and production secret stores. Required production values are documented in `services/auth-api/.env.example` but must be injected by the deployment platform—not committed in an `.env` file.

- `KAVENEGAR_API_KEY` and an approved Verify Lookup template
- `JWT_SECRET`, `OTP_PEPPER`, `DATABASE_URL`
- server-only `GEMINI_API_KEY` only if AI triage is approved
- `ZARINPAL_MERCHANT_ID` and `PAYMENT_CALLBACK_BASE_URL` only after contract/sandbox approval

Generate database passwords using `openssl rand -hex 32`; use separate 48-byte secrets for JWT and OTP pepper. Rotate keys on suspected exposure and record the incident privately.

## Migrations

```bash
cd services/auth-api
npm ci
npm run migrate
npm test
```

`src/migrate.js` records each numbered SQL file in `schema_migrations` and runs every unapplied migration transactionally. Back up the database first. Never use a destructive migration in production. In the local stack, the API container owns migration execution; PostgreSQL does not mount SQL files for a second, untracked initialisation path.

## Local smoke stack

```bash
cp services/auth-api/.env.example services/auth-api/.env
# replace all placeholders; leave every FEATURE_* flag false initially
docker compose -f docker-compose.auth.yml --env-file services/auth-api/.env up --build
curl http://localhost:8080/health
curl http://localhost:8080/v1/public/features
```

A real Kavenegar delivery, Zarinpal sandbox payment, and PostgreSQL persistence must be exercised in a non-production environment before enabling any related flag.

## Controlled flag enablement

Flags default to `false`. Enable one at a time in staging only after evidence is attached:

1. `FEATURE_AI_DIAGNOSIS`: authenticated redacted prompt test, provider outage test, low-confidence/person escalation test.
2. `FEATURE_NEW_BOOKINGS` and `FEATURE_TECHNICIAN_MATCHING`: verified KYC state, concurrent claim test, staff support coverage.
3. `FEATURE_PAYMENTS`: Zarinpal merchant contract, sandbox request/verify/replay proof, ledger reconciliation, callback URL review.
4. `FEATURE_ESCROW_RELEASE`: duplicate worker test, dispute freeze procedure, payout/reconciliation approval, named on-call owner.

Enabling payment does **not** make an arrangement legal escrow. Counsel and finance must approve the final customer wording, structure, settlement procedure, and applicable Iranian obligations before a public claim is made.

## Observability and backups

Create alerts for OTP provider failures/rate limits, API 5xx, AI unavailability, payment verification failures, ledger imbalance (must be zero), pending payment age, due escrow holds, KYC review age, and database disk/connection saturation. Preserve structured audit events without OTPs, access tokens, raw KYC documents, raw prompts, or raw phone numbers; use a keyed pseudonymous phone reference only when correlation is necessary.

- Database backup: daily encrypted snapshots plus point-in-time recovery where available.
- Restore drill: restore to an isolated project at least quarterly; record RPO/RTO and data-validation result.
- Reconcile daily: provider verified payments vs `payment_intents` vs balanced `ledger_postings`.

## Rollback

1. Set all risky `FEATURE_*` flags to false. This immediately stops new calls at the server boundary.
2. Do **not** roll back database state. Pause the worker, investigate idempotency/audit entries, and forward-fix migrations.
3. For an SMS/AI/payment provider incident, revoke/rotate the provider credential if needed and show the safe unavailable path.
4. For a suspected money defect, disable payments and escrow release, preserve logs, reconcile provider totals to the ledger, and use the documented human support process.
5. Record owner, incident timeline, affected users, remediation and customer communication before re-enabling a capability.

## Release gate

A production release needs the exact Git commit, Android version/signing evidence, successful JDK-17 Gradle test/lint/release build, Node test/audit output, migration log, device smoke evidence, current feature flag values, backup/restore drill, Kavenegar test result, and—before money—Zarinpal sandbox/reconciliation and legal/operations approvals.

## Retention sweep

`otp_challenges` receives one row per login attempt and is the only table that is deliberately
pruned. Run the sweep from a scheduler next to the escrow worker:

```bash
node src/retention.js run        # honours OTP_RETENTION_DAYS (default 7)
```

It deletes rows older than the window whose status is not `pending` or `sending`, so a live login is
never interrupted, and prints a JSON count for the scheduler log. `escrow_holds`, `ledger_entries`,
`ledger_postings` and `operational_audit_log` are **not** pruned: they are accounting and dispute
records that both parties may need, and deleting them would be data loss rather than hygiene.

## The escrow cron must override the image command

`services/auth-api`'s image CMD is `sh -c "npm run migrate && npm start"`. A Render cron service
built from that image therefore boots a web server that never exits unless the blueprint supplies
`dockerCommand`. `render.yaml` sets:

```yaml
    dockerCommand: node src/escrow-worker.js
```

**The worker needs the web service to be reachable.** It POSTs to
`${PLATFORM_API_BASE_URL}/v1/admin/escrows/release-due` with `ESCROW_WORKER_TOKEN`, and that route is
fail-closed behind `FEATURE_ESCROW_RELEASE`. Set that variable on the **web service** (it is
`sync: false` in the blueprint so an operator controls it) before expecting a single hold to move.
Turning it on before the worker runs leaves holds untouched; turning it on without the worker leaves
them untouched too — both are safe, which is the point of the flag.

