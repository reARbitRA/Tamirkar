# Oosta platform API

The Android APK communicates only with the public Oosta API. Kavenegar, Gemini, Zarinpal, PostgreSQL, OTP pepper, JWT signing key, and all provider credentials remain server-side.

## Conventions

- Base URL: configured as the non-secret Android `AUTH_API_BASE_URL`.
- JSON request/response bodies; Persian user-facing errors.
- Authenticated routes require `Authorization: Bearer <access token>`.
- Money-creating routes also require `Idempotency-Key` (16–128 ASCII characters).
- `GET /v1/public/features` is authoritative. A disabled feature returns `503 feature_unavailable`; clients must not offer it as live functionality.
- The server issues one-hour access tokens. The current Android implementation keeps them only in memory; re-authentication is required after an app restart.

## Authentication

### `POST /v1/auth/request-otp`

```json
{ "phone": "09121234567" }
```

Normalises Iranian formats and Persian/Arabic-Indic digits. Enforces a 60-second resend delay and three sends per 15 minutes. Returns `202`, not an account-existence signal.

### `POST /v1/auth/verify-otp`

```json
{ "phone": "09121234567", "code": "123456" }
```

Returns a user, JWT, and expiry after a matching unexpired code. A code gets five attempts and is then locked.

### `GET /v1/me`

Returns the active user and role. Inactive users receive `401`.

## Public capability flags

### `GET /v1/public/features`

```json
{
  "features": {
    "ai_diagnosis": false,
    "new_bookings": false,
    "payments": false,
    "technician_matching": false,
    "escrow_release": false
  }
}
```

Every capability is **fail-closed** by environment flag. No public payment, matching, booking, or escrow claim is allowed until its flag is deliberately enabled after the required tests and operations sign-off.

## Preliminary AI triage

### `POST /v1/ai/diagnoses`

```json
{ "category": "ac", "symptom": "کولر باد گرم می‌دهد", "images": ["base64 jpeg, optional"] }
```

Requires authentication and `FEATURE_AI_DIAGNOSIS=true`. The service redacts common Iranian phone/national-ID patterns before prompting Gemini, logs only a request ID/category, accepts at most two 2 MB images, and returns a **preliminary, non-binding** JSON result. It cannot release money, decide a dispute, or issue a binding quote.

## Technician KYC

### `POST /v1/technicians/apply`

An authenticated customer applies for a technician profile. It returns a replacement technician-role access token; the profile remains `unsubmitted` and cannot be matched.

### `POST /v1/technicians/kyc`

Technician-only. Accepts an object-storage reference and SHA-256 reference—not raw document bytes—and creates a human-review case. Storage encryption, retention, and access control are deployment requirements.

### `POST /v1/admin/kyc/:caseId/decision`

Operator/admin-only. Takes `approved`, `rejected`, or `suspended` with a mandatory reason. Only `approved` technicians pass the server-side eligibility check for a payment associated with a technician.

## Booking, immutable quotes, and evidence (disabled by default)

### `POST /v1/orders`

Authenticated; requires `FEATURE_NEW_BOOKINGS=true`. Creates a server-authoritative customer request in `submitted` state.

```json
{ "category": "ac", "problem_description": "کولر باد گرم می‌دهد" }
```

### `POST /v1/orders/:orderId/quotes`

Approved technician-only; requires `FEATURE_TECHNICIAN_MATCHING=true`. Creates a **new immutable quote revision** with labour/parts totals, line items, and warranty duration. It never mutates an accepted quote.

### `POST /v1/quotes/:quoteId/accept`

Customer-owner only. Records one acceptance, supersedes competing sent quotes, and moves the order to `awaiting_payment`.

### `POST /v1/orders/:orderId/evidence`

Assigned technician-only. Stores an encrypted-object reference and SHA-256 hash for `before` or `after` evidence; raw images are not put in PostgreSQL or logs.

## Zarinpal payment and ledger (disabled by default)

### `POST /v1/payments/zarinpal/start`

Customer-owner only; requires `FEATURE_PAYMENTS=true`, a valid merchant ID and an HTTPS callback base URL. It only accepts an already-accepted immutable quote and requires an idempotency header:

```http
Idempotency-Key: a-unique-client-request-key-at-least-16-characters
```

```json
{ "quote_id": "accepted quote UUID" }
```

The API derives the amount, customer, and approved technician from the accepted quote. Callers cannot choose the amount or recipient. Tomans are converted to integer Rials only at the Zarinpal boundary.

### `GET /v1/payments/zarinpal/callback`

Zarinpal redirects here with `Authority` and `Status`. The server never trusts the callback alone: it calls Zarinpal Verify with the stored amount and authority, locks the intent, and posts an idempotent balanced ledger entry. The capture splits 85% into `technician_payable` and 15% into `escrow_liability`; it is not a bank escrow product or a payout by itself.

### `POST /v1/admin/escrows/release-due`

Operator/admin-only; requires `FEATURE_ESCROW_RELEASE=true`. Locks due holds with `SKIP LOCKED`, writes idempotent balanced `escrow_release` postings, and changes each hold once. The scheduled `src/escrow-worker.js` invokes this endpoint. A real payout integration and reconciliation approval must exist before enabling it.

## Error contract

- `400 invalid_request`: malformed body or idempotency key.
- `401 unauthorized`: missing/expired/invalid session.
- `403 forbidden`: role restriction or suspended actor.
- `409 idempotency_conflict`: previous request has a different terminal state.
- `429`: OTP cooldown/rate/attempt limit.
- `502`: upstream SMS/payment provider failed.
- `503 feature_unavailable` / `ai_unavailable`: intentionally disabled or unavailable safe-mode capability.
