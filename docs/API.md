# Oosta platform API

The Android APK communicates only with the public Oosta API. Kavenegar, Gemini, Zarinpal, PostgreSQL, OTP pepper, JWT signing key, and all provider credentials remain server-side.

## Conventions

- Base URL: configured as the non-secret Android `AUTH_API_BASE_URL`.
- JSON request/response bodies; Persian user-facing errors.
- Authenticated routes require `Authorization: Bearer <access token>`.
- Money-creating routes also require `Idempotency-Key` (16–128 ASCII characters).
- `GET /v1/public/features` is authoritative. A disabled feature returns `503 feature_unavailable`; clients must not offer it as live functionality.
- The server issues one-hour access tokens containing only the user ID and role. The current Android implementation keeps them only in memory; re-authentication is required after an app restart.

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

### `DELETE /v1/me`

Account erasure under the privacy policy. Any authenticated role may erase their own account. In one transaction it deletes the caller's `otp_challenges`, `customer_devices`, `technician_profiles` and `kyc_cases` rows, then replaces `phone_e164` with an HMAC token derived from the OTP pepper, sets `is_active = FALSE` and clears `last_login_at`. There is no `deleted_at` column — `users` has only `created_at` and `last_login_at`, so the erasure timestamp lands in `operational_audit_log` instead. Because access tokens are stateless JWTs there is no session table to clear; `is_active = FALSE` is what revokes them, since `requireActiveUser` re-reads the row on every request.

Refused with `409 erasure_blocked` — and the counts that blocked it — while the user has any escrow hold in `held`, `pending` or `frozen` state, or any order not in `completed`, `cancelled` or `refunded` state where they are either the customer or the quoting technician. Returns `200` with `{"erased": true, "retained_for": ["financial_records", "audit_log"]}`, or `404` if the account is missing or inactive.

## Identifier ownership

Server-assigned identifiers are UUIDs and the client must never mint one. `POST /v1/devices` ignores
any client-supplied id and returns the row created by the database default
(`customer_devices.id UUID PRIMARY KEY DEFAULT gen_random_uuid()`), and every `:id` path segment is
validated against a strict UUID pattern before it reaches SQL. A locally generated id of another
shape is a client bug, not a server contract.

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

## Device passport

Authenticated. The server-side counterpart to `DeviceEntity`; it lets a device record outlive the
phone it was created on.

### `POST /v1/devices`

Registers a device. Three fields are required: `name` (2–120 characters), `category` (one of
`ac`, `washer`, `refrigerator`, `mobile`, `laptop`, `car`, `other`) and `brand` (1–80 characters).
`model`, `serial_number`, `purchase_date`, `purchase_price` and `notes` are optional; `purchase_price`
must be an integer between 0 and 1e12. Returns `201` with `{"device": {…}}`.

Note that `serial_number` carries **no** uniqueness constraint, so the same appliance can be
registered twice. This is deliberate: a partial unique index on `(customer_id, serial_number)` would
have to exclude the empty string, and most devices are entered without a serial.

### `GET /v1/devices`

Lists the caller's devices ordered by `health_score ASC, created_at DESC`, so the machine needing
attention appears first. Scoped to the authenticated user.

### `GET /v1/devices/:deviceId`

Returns one device with its repair history. Requires the device to belong to the caller; a UUID
belonging to someone else returns `404 not_found` rather than `403`, so the endpoint does not leak
which device IDs exist.

## Order lifecycle

### `GET /v1/orders`

Orders created by the caller, newest first, with each order's quotes and evidences nested.
`operator` and `admin` see all orders. **A technician does not see orders assigned to them through
this endpoint** — the filter is on `customer_id`, and `service_orders` has no `technician_id`
column (the technician hangs off the quote). Pagination is `limit`, clamped to 1–100, default 50.

### `GET /v1/orders/:orderId`

One order with its quotes, evidences and device. `404` when the caller has no relationship to it.

### `POST /v1/orders/:orderId/start`

Approved-technician only. Moves a `paid` order to `in_progress`. Any other state returns
`409 invalid_order_state`. Requires `Idempotency-Key`.

### `POST /v1/orders/:orderId/complete`

Approved-technician only. Moves `in_progress` to `completed` and releases the escrow hold. This is
the **completion gate**: the server refuses to complete an order that never started, so escrow
cannot be released without a recorded service. `409 invalid_order_state` otherwise.

### `POST /v1/orders/:orderId/dispute`

Customer-owner, operator or admin. Moves an order in `paid`, `in_progress` or `completed` state to
`disputed`, then claws the technician's share back into escrow liability with a balanced ledger
entry, so a release can never race a dispute. A caller who is neither the owner nor privileged gets
`404 not_found`, not `403`, so the endpoint does not confirm which order IDs exist.

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

### `POST /v1/admin/escrows/:holdId/refund`

Operator/admin-only. Reverses a hold by writing an offsetting balanced `escrow_refund` posting,
requiring a reason of at least 5 characters. Idempotent: a second call with the same
`Idempotency-Key` returns the original result rather than posting twice.

## Observability

### `GET /health`

Unauthenticated liveness probe returning `{"status": "ok"}`. The Docker `HEALTHCHECK` calls it. It
runs `SELECT 1` against the pool, so a database that is down makes the probe fail and the container
unhealthy — which is the intended behaviour for a service that cannot work without PostgreSQL, but
means a brief database outage will mark healthy containers unhealthy.

### `GET /metrics`

Prometheus text format (`text/plain; version=0.0.4`). The emitted series are
`oosta_process_uptime_seconds`, `oosta_pool_waiting`, `oosta_pool_idle`, `oosta_pool_total`,
`oosta_http_requests_total{route,status_class}`, `oosta_provider_failures_total{provider}` and
`oosta_escrow_holds_due`. It carries **no** user data and no per-user identifiers, but it does
expose per-route request counts and the number of escrow holds due, so treat it as internal: do not
publish it on a public ingress.

## Error contract

- `400 invalid_request`: malformed body or idempotency key.
- `401 unauthorized`: missing/expired/invalid session.
- `403 forbidden`: role restriction or suspended actor.
- `409 idempotency_conflict`: previous request has a different terminal state.
- `409 invalid_order_state`: lifecycle transition not permitted from the current state.
- `409 erasure_blocked`: account deletion refused while a non-terminal order exists.
- `429`: OTP cooldown/rate/attempt limit.
- `502`: upstream SMS/payment provider failed.
- `503 feature_unavailable` / `ai_unavailable`: intentionally disabled or unavailable safe-mode capability.
