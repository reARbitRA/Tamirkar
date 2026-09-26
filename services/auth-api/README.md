# Oosta platform API

`services/auth-api` began as the deliberately small server-side OTP service and is now the **single server boundary** for the first production foundations: Kavenegar OTP, server-only AI triage, KYC workflow state, feature flags, Zarinpal request/verification, and an append-only ledger. The Android APK never receives provider, database, JWT, or OTP secrets.

> **Important:** payment, matching, booking, and escrow-release flags are false by default. Code and a sandbox adapter are not permission to make a public financial or escrow claim. See [`docs/DEPLOYMENT.md`](../../docs/DEPLOYMENT.md) and [`docs/legal/APPROVALS.md`](../../docs/legal/APPROVALS.md).

## Capabilities

- Iranian phone normalization and real Kavenegar Verify Lookup OTP.
- Hash-only OTP state: separate pepper, constant-time comparison, expiry, cooldown, rate window, and lockout.
- Short-lived JWTs with customer/technician/operator/admin role boundaries.
- Server-side preliminary Gemini triage with common phone/national-ID redaction; no AI decision can approve a refund or money release.
- Human-review KYC status machine (`unsubmitted → submitted → approved/rejected/suspended`).
- Immutable quote revisions, customer acceptance records, before/after evidence references, Zarinpal Verify, idempotent payment intents, balanced ledger postings, and idempotent escrow-release worker endpoint.
- PostgreSQL migrations and operational audit events.

## Start locally

1. Create a Kavenegar Verify Lookup template (for example `OOSTA_LOGIN`) accepting `token`.
2. Copy `.env.example` to `.env` in this directory.
3. Generate separate secrets:

   ```bash
   openssl rand -base64 48 # JWT_SECRET
   openssl rand -base64 48 # OTP_PEPPER
   openssl rand -hex 32    # POSTGRES_PASSWORD (safe directly in the Compose URI)
   ```

4. Set real `KAVENEGAR_API_KEY`, `KAVENEGAR_TEMPLATE`, database values, and (only for staging) the approved AI/payment values. Keep all `FEATURE_*` values false until the matching evidence is complete.
5. Never commit `.env`, provider keys, raw KYC evidence, database passwords, OTPs, JWTs, or callback authorities.

```bash
cd services/auth-api
npm ci
npm test
npm audit --omit=dev
cd ../..
docker compose -f docker-compose.auth.yml --env-file services/auth-api/.env up --build
```

The container executes `npm run migrate` before starting. For a local fresh database, the mounted numbered migrations are also applied by PostgreSQL safely; migration tracking makes subsequent starts no-ops.

```bash
curl http://localhost:8080/health
curl http://localhost:8080/v1/public/features
```

Request OTP:

```bash
curl -X POST http://localhost:8080/v1/auth/request-otp \
  -H 'content-type: application/json' \
  -d '{"phone":"09121234567"}'
```

## Android configuration

The only public Android setting is in root `.env`:

```text
AUTH_API_BASE_URL=https://auth.example.com
```

For an Android emulator only, debug accepts `http://10.0.2.2:8080`; production requires HTTPS. A physical device cannot reach its own `localhost`.

## Before enabling a non-OTP flag

- **AI:** test authentication, redaction, unavailable-provider fallback, low-confidence copy, and human support route.
- **KYC/matching:** provision encrypted object storage separately, appoint reviewers, test suspended/duplicate/concurrent cases, and enforce approval in every match assignment.
- **Payment:** use a Zarinpal sandbox merchant first, register a public HTTPS callback, test request/verify/callback replay/reconciliation, and have finance/legal approve the wording and settlement model.
- **Escrow release:** run the worker with an operator service token, test duplicate runs and dispute freeze, reconcile every entry, and prove how `technician_payable` is paid through an approved payout process.

The complete endpoint contract is [`docs/API.md`](../../docs/API.md).