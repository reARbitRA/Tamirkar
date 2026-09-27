# Oosta free-tier pilot blueprint / نقشهٔ پایلوت کم‌هزینه

> **Purpose / هدف:** validate real OTP and safe preliminary diagnosis with invited testers at minimal cost. This is not a financial-production blueprint.

## 1. Architecture / معماری

```text
Android debug/release candidate
        │ HTTPS, Bearer JWT
        ▼
Render Free Docker Web Service (services/auth-api)
        │                    ├── Kavenegar Verify Lookup
        │                    ├── Gemini only when AI flag is on
        ▼                    └── Zarinpal stays disabled in pilot
Neon Free PostgreSQL

Cloudflare Pages: policies + status page
Uptime monitor: /health
Optional later: Sentry after SDK + PII-scrubber implementation
```

## 2. No-cost-first configuration / پیکربندی کم‌هزینه

| Service | Start configuration | Free cost/limit checked 2026-09-27 | Do not do |
|---|---|---|---|
| Neon | Create `oosta-staging`; apply numbered migrations; create a separate production project later. | $0; 0.5 GB/project; 100 CU-hours/month/project; scale-to-zero when inactive. | Do not use the staging DB for production data. |
| Render | Import `render.yaml` as one Docker web service, health check `/health`, encrypted environment variables. | $0 free service with 512 MB RAM; service limitations apply. | Do not claim an uptime SLA or public real-time OTP/payout on the free service. |
| Cloudflare Pages | Host only static policy/status pages. | $0 starter; recheck the current Pages limits at setup. | Do not put API secrets or database URLs in site build variables. |
| Cloudflare R2 | Create private bucket; DB stores references/hashes. | 10 GB-month storage, 1M Class-A and 10M Class-B operations/month. | Do not accept real KYC documents until encryption/retention/reviewer policy is approved. |
| GitHub Actions | Build/test only; upload short-lived APK/report artifacts. | Public standard runners are free; private allowance is plan-specific. | Do not upload `.env`, production APK signing keys, or KYC fixtures. |
| Sentry (optional; not yet wired) | After SDK integration, set sampling low and before-send scrub phones, tokens, authority IDs. | Recheck quota and terms at adoption. | Do not enable it—or session replay—until the PII-scrubber test passes. |

The repository includes [`render.yaml`](../render.yaml) as an importable, staging-only Render Blueprint. It intentionally uses `autoDeployTrigger: "off"`, creates no database, and prompts for every provider/database secret. Link a manually created staging database only after migration and rollback review.

## 3. Exact environment order / ترتیب دقیق environment

1. Copy `services/auth-api/.env.example` to a private staging secret store.
2. Fill `DATABASE_URL`, `JWT_SECRET`, `OTP_PEPPER`, Kavenegar credentials.
3. Leave every `FEATURE_*` setting `false`.
4. Deploy API and call `/health`.
5. Run `cd services/auth-api && npm run migrate`; capture the output in the deployment record.
6. Set Android `AUTH_API_BASE_URL` to staging HTTPS URL.
7. Test one OTP number controlled by the team.
8. Only then enable AI diagnosis for invited testers if needed. Sentry is an optional next integration: do not claim error events are collected until its Android/API SDK and PII scrubber have been implemented and tested.

## 4. Feature flag policy / سیاست feature flag

| Flag | Pilot default | Turn on only when |
|---|---:|---|
| `FEATURE_AI_DIAGNOSIS` | false | Redaction, human escalation, provider-outage copy tested. |
| `FEATURE_NEW_BOOKINGS` | false | Server order screens and human support are ready. |
| `FEATURE_TECHNICIAN_MATCHING` | false | KYC reviewer and approved test technician exist. |
| `FEATURE_PAYMENTS` | false | Zarinpal sandbox request/Verify/replay/reconciliation evidence exists. |
| `FEATURE_ESCROW_RELEASE` | false | Finance/legal/payout/duplicate-worker/dispute-freeze evidence exists. |

## 5. Minimal monitoring / حداقل مانیتورینگ

- HTTP monitor: `/health`, expected body contains `"status":"ok"`.
- Alert contacts: at least engineering owner + product/operations owner.
- API logs: status code, route, request ID; no OTP/code/token/KYC/raw AI prompt.
- Daily checklist: OTP success/error count, API 5xx, database space, provider errors.
- Weekly: export backup and restore into an isolated temporary database.

## 6. Graduation rule / قانون عبور از پایلوت

Move from free pilot to paid/always-on infrastructure before accepting public payments, promising response times, storing KYC documents, or enabling automated escrow release. Free-tier limits and Iran reachability must be rechecked at the time of the decision.
