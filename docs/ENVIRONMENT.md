# Environment variables — Oosta (اوستا)

This document is generated from the variables the code actually reads. If you add one, add it
here, to `services/auth-api/.env.example` and to `render.yaml`.

> **The Android app receives exactly one value: `AUTH_API_BASE_URL`.** It is not a secret and it
> is the only thing the APK knows about the backend. `GEMINI_API_KEY`, `KAVENEGAR_API_KEY`,
> `JWT_SECRET`, `OTP_PEPPER`, `DATABASE_URL` and `ZARINPAL_MERCHANT_ID` must never appear in an
> Android build.

## Android client

| Variable | Where it is read | Notes |
| --- | --- | --- |
| `AUTH_API_BASE_URL` | `app/src/main/java/com/example/data/remote/OostaApiConfig.kt:8` via `BuildConfig` | Public HTTPS base URL of `services/auth-api`. Declared in `app/build.gradle.kts` as a `buildConfigField`. `OostaApiConfig` throws on a blank value, on anything containing `example.invalid`, and on a non-`https://` value — the single exception is `http://10.0.2.2:8080` in a debug emulator build. Supply it with `-PAUTH_API_BASE_URL=...` or in a root `.env`. |

## `services/auth-api` — read by `src/config.js`

| Variable | Required | Notes |
| --- | --- | --- |
| `PORT` | no (default 8080) | Must be a valid TCP port. |
| `HOST` | no (default `0.0.0.0`) | Bind address. |
| `ALLOWED_ORIGINS` | no | Comma-separated browser origins reflected by CORS. Native Android traffic sends no `Origin`. |
| `DATABASE_URL` | **yes** | PostgreSQL connection string. |
| `JWT_SECRET` | **yes** | HS256 signing key. `openssl rand -base64 48`. Placeholders are rejected at boot. |
| `OTP_PEPPER` | **yes** | Peppers the OTP digest. Distinct from `JWT_SECRET`. |
| `KAVENEGAR_API_KEY` | **yes** | Server-only SMS credential. |
| `KAVENEGAR_TEMPLATE` | **yes** | Kavenegar Verify Lookup template accepting a `token` variable. |
| `OTP_DEV_LOG_CODE` | no (default false) | Logs the plaintext OTP locally. **The service refuses to boot if this is `true` while `NODE_ENV` is `production` or `staging`.** |
| `FEATURE_AI_DIAGNOSIS` | no (default false) | Gates `POST /v1/ai/diagnoses`. |
| `FEATURE_NEW_BOOKINGS` | no (default false) | Gates `POST /v1/orders` and `POST /v1/quotes/:id/accept`. |
| `FEATURE_TECHNICIAN_MATCHING` | no (default false) | Gates `POST /v1/orders/:id/quotes`. |
| `FEATURE_PAYMENTS` | no (default false) | Gates `POST /v1/payments/zarinpal/start`. Enabling it also requires `ZARINPAL_MERCHANT_ID` and an `https://` `PAYMENT_CALLBACK_BASE_URL`. |
| `FEATURE_ESCROW_RELEASE` | no (default false) | Gates `POST /v1/admin/escrows/release-due`. |
| `GEMINI_API_KEY` | no | Server-only inference key. Sent in the `x-goog-api-key` header, never in a URL. |
| `GEMINI_MODEL` | no (default `gemini-2.5-flash`) | Model id. |
| `AI_RATE_LIMIT_PER_MINUTE` | no (default 10) | Per-user ceiling on `POST /v1/ai/diagnoses`, which is a billable provider call. State is in-process, so on a multi-instance deployment the effective ceiling is limit × instances; a global ceiling needs Redis. Exceeding it returns `429` with `Retry-After`. |
| `ZARINPAL_MERCHANT_ID` | no | Required when `FEATURE_PAYMENTS=true`. |
| `ZARINPAL_SANDBOX` | no (default false) | `true` routes to the Zarinpal sandbox. |
| `PAYMENT_CALLBACK_BASE_URL` | no | Must be `https://` when payments are enabled. |
| `PROVIDER_RETRY_ATTEMPTS` | no (default 3) | Retry budget for outbound Zarinpal, Kavenegar and Gemini calls. Only 429/5xx/network errors are retried, with full-jitter exponential backoff and a per-provider circuit breaker; a 4xx is a definite answer and is never re-sent, because re-sending to a payment gateway is how double charges happen. |
| `NODE_ENV` | no | `production`/`staging` enable the `OTP_DEV_LOG_CODE` boot refusal. |

## Escrow release worker — read by `src/escrow-worker.js`

| Variable | Required | Notes |
| --- | --- | --- |
| `PLATFORM_API_BASE_URL` | **yes** | Base URL of the API the worker calls. |
| `ESCROW_WORKER_TOKEN` | **yes** | Short-lived operator JWT. The worker never touches the database directly. |

`render.yaml` runs this as a daily cron service. Release only ever moves money for an order
whose status is `completed`; disputed, cancelled and in-progress holds stay held.

## Database

| Variable | Notes |
| --- | --- |
| `POSTGRES_PASSWORD` | Consumed by `docker-compose.auth.yml` shell substitution only; the Node service never reads it. |
| `DATABASE_URL` | Used by `src/migrate.js` and `scripts/backup-database.sh`. |
| `CONFIRM_DESTRUCTIVE_ROLLBACK` | Read only by `src/migrate.js down`. Every `db/down/*.sql` drops tables, so a rollback exits `4` and does nothing unless this is exactly `yes`. Never set it in a service environment — it is for an operator at a terminal who has already taken a restore point. |

## Variables that were documented here previously and do not exist

`APP_VERSION`, `APP_ENV`, `ESCROW_RATE`, `COMMISSION_RATE_APPRENTICE`,
`COMMISSION_RATE_SPECIALIST`, `COMMISSION_RATE_MASTER`, `COMMISSION_RATE_SUPERSTAR`,
`DEFAULT_WARRANTY_DAYS` and `MAX_SEARCH_RADIUS_KM` were listed in an earlier revision of this
file. None of them is read anywhere in the repository. The 15% escrow split is a constant in
`services/auth-api/src/server.js`, and the default 30-day hold is `DEFAULT_ESCROW_DAYS` in the
same file. They are recorded here so nobody wires them up expecting an effect.
