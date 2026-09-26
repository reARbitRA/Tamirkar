# Oosta Auth API — real SMS OTP only

This is the **one small backend service** for the first launch step: Iranian mobile OTP through Kavenegar Verify Lookup. It intentionally does not implement payment, orders, escrow, KYC, or AI.

## What it does

- Normalises `09…`, `+989…`, `00989…`, Persian digits, and Arabic-Indic digits to E.164.
- Creates a six-digit OTP, stores only its SHA-256 hash plus a server-side pepper, and expires it after five minutes.
- Enforces a per-number resend cooldown, a 15-minute send window, and five verification attempts.
- Calls a Kavenegar Verify Lookup template from the server—not from the APK.
- Creates or finds a customer user and returns a short-lived JWT after successful verification.

## Before running

1. Create a Kavenegar Verify Lookup template—for example `OOSTA_LOGIN`—that contains the `token` field.
2. Copy `.env.example` to `.env` in this directory.
3. Generate independent secrets. Use a URL-safe hexadecimal database password because the Compose connection URL includes it directly:

   ```bash
   openssl rand -base64 48 # JWT_SECRET
   openssl rand -base64 48 # OTP_PEPPER
   openssl rand -hex 32    # POSTGRES_PASSWORD
   ```

4. Set `KAVENEGAR_API_KEY`, `KAVENEGAR_TEMPLATE`, and the generated `POSTGRES_PASSWORD` in `.env`.
5. Do **not** commit `.env`, the API key, OTP pepper, database password, or JWT secret.

## Local start

```bash
cd services/auth-api
npm ci
npm test
cd ../..
docker compose -f docker-compose.auth.yml --env-file services/auth-api/.env up --build
```

Health check:

```bash
curl http://localhost:8080/health
```

Request a code:

```bash
curl -X POST http://localhost:8080/v1/auth/request-otp \
  -H 'content-type: application/json' \
  -d '{"phone":"09121234567"}'
```

Verify it:

```bash
curl -X POST http://localhost:8080/v1/auth/verify-otp \
  -H 'content-type: application/json' \
  -d '{"phone":"09121234567","code":"<SMS_CODE>"}'
```

## Android configuration

Add the public **HTTPS** address of this service to the root `.env`:

```text
AUTH_API_BASE_URL=https://auth.example.com
```

For an Android emulator talking to a locally running service, use `http://10.0.2.2:8080` only for debug development. A physical device cannot reach its own `localhost`; production must use HTTPS.

## Production limits

- Put the service behind TLS and a reverse proxy.
- Restrict `ALLOWED_ORIGINS` for browser clients. Android native traffic does not need CORS.
- Keep Kavenegar credentials and database access server-side.
- Configure a provider-approved template; this code never sends arbitrary SMS text.
- Add IP/device rate limiting at the reverse proxy before public traffic.
- Rotate `JWT_SECRET`, `OTP_PEPPER`, database credentials and Kavenegar keys through a controlled secret manager.
