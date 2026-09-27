# Oosta roadmap: repository 60% → controlled pilot → public launch

**Date:** 2026-09-27

**Current code target:** 60–65% repository readiness

**Not a public-launch approval:** a public GO requires real provider, deployment, legal, financial, device, and operations evidence.

---

## Read this first — simple version / نسخهٔ ساده

| Stage | English | فارسی | Money / public exposure |
|---|---|---|---|
| 1. Build | Make code safe, testable, and fail-closed. | کد را امن، تست‌پذیر و fail-closed کنیم. | No public money; flags off. |
| 2. Private pilot | A small invited group uses real OTP and non-financial flows. | گروه محدود دعوت‌شده با OTP واقعی و بدون پرداخت استفاده می‌کند. | No payment/escrow claim. |
| 3. Sandbox money | Test quote → Zarinpal sandbox → Verify → ledger with staff accounts only. | پیش‌فاکتور تا زرین‌پال sandbox و دفترکل فقط با حساب کارکنان تست می‌شود. | Test funds only. |
| 4. Controlled public launch | Enable one capability at a time with support, reconciliation, and rollback. | هر قابلیت با پشتیبانی، تطبیق مالی و rollback جداگانه فعال می‌شود. | Only after sign-off. |

**Non-negotiable rule / قانون غیرقابل مذاکره:** a disabled server feature is not advertised as available in the app, on social media, or in support copy.

---

## Current position / وضعیت فعلی

### Done in the repository / انجام‌شده در مخزن

- Real server-side Kavenegar OTP with expiry, rate limits, hash-only codes, and JWT.
- Android starts with authentication; no fixed OTP/Home bypass.
- No direct Android calls or API keys for AI providers; the server owns a redacted preliminary-AI boundary.
- Feature flags default to off and are fetched by Android after login.
- Server foundations for customer orders, immutable quotes, quote acceptance, KYC states, evidence references, Zarinpal Verify, idempotency, append-only balanced ledger entries, and gated escrow release.
- Minimal JWT claims (user ID + role only), pseudonymous OTP-provider failure logs, and an HTTP-level fail-closed/CORS regression test.
- Non-destructive Room migration; release builds no longer seed demo users/orders.
- API, deployment, legal-draft, security, contribution, and rollback documentation.
- Static audit: zero static blockers; Node service tests and dependency audit pass.

### Still not proven / هنوز اثبات نشده

- A deployed API, real database migration, TLS, and backup/restore.
- Real Kavenegar delivery, Zarinpal sandbox callback/Verify, ledger reconciliation, or technician payout.
- Android JDK/Gradle build and physical-device evidence.
- KYC object storage, real reviewers, staffed support/on-call, Iranian-network reachability, or counsel/finance approval.

---

## Phase 1 — finish repository proof (next 3–5 engineering days)

| Item | English definition of done | تعریف پایان کار فارسی | Owner | Evidence |
|---|---|---|---|---|
| Android build proof | Run `test`, `lintDebug`, and `assembleDebug` on JDK 17. Fix every failure. | تست، lint و build اندروید با JDK 17 اجرا و تمام خطاها رفع شود. | Engineering | CI URL + APK checksum |
| API integration tests | Run Postgres-backed tests for OTP, roles, quote acceptance race, payment callback replay, and duplicate escrow release. | تست‌های واقعی PostgreSQL برای OTP، نقش‌ها، رقابت پیش‌فاکتور، replay پرداخت و آزادسازی تکراری اجرا شوند. | Engineering | CI test report |
| Android server screens | Complete read-only order/quote/status screens against API; do not resurrect Room demo flows. | نمایش سفارش/پیش‌فاکتور/وضعیت از API تکمیل شود و مسیرهای نمایشی Room برنگردند. | Engineering | Device recording |
| Secure session plan | Choose encrypted refresh-token storage or deliberate re-login; implement expiry/logout/revocation behavior. | ذخیرهٔ امن refresh token یا ورود مجدد آگاهانه؛ انقضا، خروج و revoke اجرا شود. | Engineering/Security | Threat-model review |
| Accessibility/RTL | Test TalkBack labels, dynamic type, focus order, contrast, Persian digits, and mixed Latin numbers. | TalkBack، اندازه متن، فوکوس، کنتراست، ارقام فارسی و ترکیب متن لاتین بررسی شود. | QA | Signed checklist |

**Exit criterion / معیار خروج:** no simulated money/matching behavior is reachable in a release build, and the exact release commit builds and tests green.

---

## Phase 2 — free-tier private pilot (1–2 weeks)

Use free services only for a **non-financial, invited pilot**. Free tiers may sleep, cap usage, or change terms; do not call this a production SLA.

| Need | Low-cost starting choice | Known free cost/limit (checked 2026-09-27) | Setup | Hard boundary |
|---|---|---|---|---|
| PostgreSQL | Neon Free | $0; 0.5 GB/project and 100 CU-hours/month/project; inactive compute scales to zero. | Create separate `oosta-staging`; set `DATABASE_URL`; run `cd services/auth-api && npm run migrate`. | Development/private pilot only; free storage/compute and scale-to-zero are not a public-money database plan. |
| API host | Render Free Docker web service | $0; 512 MB free service. Workspace is Hobby $0 plus compute; limits/idle behavior apply. | Import `render.yaml`, set all secrets in Render; health path `/health`. | Unsuitable for time-sensitive public OTP/payout promises or an SLA. |
| Static policy/status page | Cloudflare Pages Free | $0 starter option; recheck Pages limits at setup. | Publish the public policies and a simple status/maintenance page. | Do not host JWT secrets or API code in Pages. |
| KYC/evidence object store | Cloudflare R2 Free allowance | 10 GB-month storage, 1M Class-A and 10M Class-B operations/month. | Store encrypted objects; DB keeps only object reference + SHA-256. | Do not upload KYC until retention/access policy and reviewer process exist. |
| Error reporting (optional next integration) | Sentry Developer | Provider quota/terms must be rechecked before adoption. | First add/test Android + API SDKs and PII scrubbing; then add DSNs as environment values. | It is not implemented in this commit; never send OTP, token, KYC or raw prompt data. |
| Availability checks | UptimeRobot Free | Free-plan limits/terms must be rechecked before signup. | Monitor `/health` and public status page; email two owners. | Verify its current commercial-use terms before relying on a free plan. |
| CI | GitHub Actions | Standard GitHub-hosted runners are free for public repositories; private allowance is plan-specific. | Run Android and Node test/audit workflow on every PR. | Requires Actions permission and an available JDK/SDK runner. |
| Iranian services | Kavenegar + Zarinpal sandbox | No assumed free production allowance; merchant/SMS terms apply. | Obtain approved accounts and test from Iran. | Credentials, sandbox/live approval and financial/legal sign-off are external gates. |

### Pilot runbook / اجرای پایلوت

1. Create a **staging-only** Kavenegar template and use a team-controlled phone allowlist.
2. Create Neon staging database, set the staging `DATABASE_URL`, and execute `cd services/auth-api && npm run migrate` once.
3. Deploy the API with `FEATURE_AI_DIAGNOSIS=false`, `FEATURE_NEW_BOOKINGS=false`, `FEATURE_PAYMENTS=false`, `FEATURE_TECHNICIAN_MATCHING=false`, and `FEATURE_ESCROW_RELEASE=false`.
4. Verify `/health`, `/v1/public/features`, OTP request/verify, expired OTP, wrong OTP lockout, and resend cooldown.
5. Enable **only** `FEATURE_AI_DIAGNOSIS=true` for invited testers after the redaction and unavailable-provider tests pass.
6. Record every defect, remove pilot data as promised by policy, and keep money flags off.

**Pilot success / موفقیت پایلوت:** real OTP works for invited users, no secret appears in APK/logs, no user can reach a fake payment/matching path, and an outage produces safe Persian copy.

---

## Phase 3 — sandbox money and operations (1–2 weeks)

### Required sequence / ترتیب الزامی

1. Obtain Zarinpal sandbox/merchant details and an HTTPS callback URL.
2. Appoint one finance owner, one support owner, one security/engineering owner, and one KYC reviewer.
3. Create one approved technician test account through the actual KYC state machine.
4. Enable `FEATURE_NEW_BOOKINGS` and `FEATURE_TECHNICIAN_MATCHING` **only in staging**.
5. Test: submit order → immutable quote → customer acceptance → Zarinpal sandbox → callback → server Verify → balanced ledger postings.
6. Replay the same callback and idempotency key; prove ledger and payment status change exactly once.
7. Test dispute freeze before any escrow release.
8. Run the release worker twice; prove only one `escrow_release` event exists.
9. Reconcile provider reference IDs, `payment_intents`, `ledger_entries`, and `ledger_postings` manually.
10. Keep `FEATURE_ESCROW_RELEASE=false` until payout mechanics, legal wording, and finance reconciliation are approved.

**Exit criterion / معیار خروج:** signed reconciliation sheet, callback replay evidence, duplicate-worker evidence, support escalation test, and named owners.

---

## Phase 4 — controlled public launch (not before Phase 1–3)

Enable capabilities one by one over several days:

1. **OTP and read-only profile:** monitor OTP failures, rate limits, crash-free users.
2. **AI preliminary diagnosis:** sample outputs daily; retain the human escalation route.
3. **Bookings and quotes:** onboard only approved technicians; review first 10 orders manually.
4. **Payments:** staff-only soft launch first; reconcile daily; rollback flag tested.
5. **Escrow release:** enable only after dispute/payout procedures, double-entry reconciliation, and legal/finance approval.

### Kill switch table / کلید قطع اضطراری

| Event | Immediate action | Owner |
|---|---|---|
| OTP/provider outage | Keep auth unavailable message; do not bypass OTP. | Engineering on-call |
| Unsafe AI output | Set `FEATURE_AI_DIAGNOSIS=false`; route to human support. | Product/AI owner |
| Payment/ledger mismatch | Set payments and escrow release false; preserve logs; reconcile. | Finance + engineering |
| KYC/fraud concern | Suspend technician; disable matching for affected account. | Operations |
| Data incident | Rotate secrets, revoke sessions as applicable, preserve evidence. | Security owner |

---

## Free-service choices: honest constraints / محدودیت‌های واقعی سرویس رایگان

- **Free is for development and a private pilot, not financial production.** Render free services can sleep; Neon free can scale to zero and has hard limits; quotas and terms can change.
- **Iran reachability is a release test, not an assumption.** Test every chosen provider from Iranian mobile networks before relying on it.
- **No card or provider secret goes into GitHub, APK, screenshots, or chat.** Use each host’s encrypted environment-variable UI.
- **Use spending/usage alerts from day one.** A “free” service can become unavailable at quota exhaustion; fail closed rather than silently charging or accepting money.
- **Do not store KYC documents in a free service just because it is free.** Start with test hashes/references until encryption, retention, deletion, reviewer access, and legal basis are approved.

Useful official starting points (verify current terms before signup):

- [Neon](https://neon.tech/pricing)
- [Render](https://render.com/pricing)
- [Cloudflare Workers/R2](https://workers.cloudflare.com/plans)
- [GitHub Actions billing](https://docs.github.com/billing/managing-billing-for-github-actions/about-billing-for-github-actions)
- [UptimeRobot monitoring](https://uptimerobot.com/knowledge-hub/monitoring/what-is-uptimerobot/)

---

## One-page checklist / چک‌لیست یک‌صفحه‌ای

### This week / این هفته

- [ ] Restore GitHub Actions permission and run Android build/tests.
- [ ] Deploy staging API + Neon database; migration log saved.
- [ ] Configure Kavenegar staging template; test OTP with a team number.
- [ ] Set all money/matching flags false.
- [ ] Set health monitor and error reporting with PII scrubber.

### Before any public booking / قبل از هر سفارش عمومی

- [ ] Device/RTL/accessibility evidence.
- [ ] KYC storage + reviewers + suspension procedure.
- [ ] Real order/quote UI connected to API.
- [ ] Human support contact, hours, and incident owner.

### Before any public payment / قبل از هر پرداخت عمومی

- [ ] Zarinpal sandbox proof and merchant approval.
- [ ] Callback Verify/replay/idempotency/ledger/worker test evidence.
- [ ] Daily reconciliation owner and payout process.
- [ ] Privacy, terms, refund, warranty, and money wording approved by counsel/finance.
- [ ] Backup restore drill, monitoring alerts, and rollback drill completed.
