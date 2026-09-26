# Oosta deployment, rollback, and release evidence

## Architecture

`services/auth-api` is the server-side Oosta platform boundary. It owns Kavenegar OTP, JWT issuance, preliminary AI, KYC workflow state, Zarinpal payment initiation/verification, audit logs, and the append-only double-entry ledger. Android contains only the public API URL.

Run it behind HTTPS with a managed PostgreSQL 16+ database and a reverse proxy that applies IP/device rate limits, request-size limits, TLS, and access logging. Do not expose PostgreSQL publicly.

## Environments and secrets

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

`src/migrate.js` records each numbered SQL file in `schema_migrations` and runs every unapplied migration transactionally. Back up the database first. Never use a destructive migration in production. For a first local stack, Docker Compose mounts `db/` for PostgreSQL initialisation and the API executes the tracked migration runner.

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

Create alerts for OTP provider failures/rate limits, API 5xx, AI unavailability, payment verification failures, ledger imbalance (must be zero), pending payment age, due escrow holds, KYC review age, and database disk/connection saturation. Preserve structured audit events without OTPs, tokens, raw KYC documents, or raw prompts.

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
