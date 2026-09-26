# Oosta launch checklist — T-minus

> **Current state: DO NOT START THIS CLOCK.** Every T-7d blocker below must be checked before public launch.

## T-7 days — architecture, money and legal

- [ ] Server-side OTP login is live, rate-limited, independently tested, and all customer routes require a verified session.
- [ ] Provider API keys have been removed from the APK; the inference gateway is server-side, authenticated, rate-limited and PII-redacting.
- [ ] Payment-provider contract, test environment, signed-webhook verification and reconciliation procedure are approved.
- [ ] A double-entry/append-only ledger supports authorise, capture, 15% hold, 85% release, refund, dispute freeze and release.
- [ ] Escrow release worker is idempotent, has retry/DLQ, is monitored, and has a passing duplicate-run integration test.
- [ ] Order/quote/escrow state transitions are server-enforced and transactional.
- [ ] Technician KYC, verification, suspension and evidence policies are live; only verified technicians can accept work.
- [ ] Device-passport repair records are server-backed, append-only, exportable and migration-safe.
- [ ] Persian terms, privacy notice, cancellation/refund and escrow/warranty conditions are approved by counsel and linked before payment.
- [ ] Human support, dispute ownership, operating hours and incident escalation contacts are staffed.

## T-1 day — release proof

- [ ] CI ran from the exact release commit: lint, unit tests, instrumented tests, release APK build, dependency/CVE scan and SBOM export.
- [ ] A real device test verifies OTP, request, quote approval, payment sandbox, hold, dispute freeze, release, refund and device passport export.
- [ ] Two technicians race to accept the same order; exactly one wins and the loser gets a safe response.
- [ ] Payment webhook replay is rejected; duplicate escrow release changes the ledger exactly once.
- [ ] Low-confidence / timeout / unavailable-AI cases show a clear preliminary result and human fallback—not a confident fabricated diagnosis.
- [ ] Persian RTL, Jalali dates, Persian digits, mixed IMEI/phone strings, Iranian phone formats and slow-3G/offline recovery are signed off.
- [ ] Accessibility review checks TalkBack labels, focus order, contrast, dynamic text, touch targets and RTL icon direction.
- [ ] In-Iran reachability is tested for every runtime service, with documented domestic/proxy fallback and a user-safe outage mode.
- [ ] Backups completed; an isolated restore test met documented RPO/RTO.
- [ ] Production dashboards/alerts cover OTP error rate, AI failure rate, payment-webhook failures, escrow queue lag, disputes and crash-free users.

## T-0 — go/no-go gate

- [ ] Release commit hash, version code, signing key custody and store artefact checksum are recorded.
- [ ] Feature flags: **payments**, **new bookings**, **AI diagnosis**, **technician matching**, and **escrow release** can each be disabled without an app update.
- [ ] On-call owner, payments owner, support owner and legal escalation owner acknowledge availability.
- [ ] Support scripts explain that AI is preliminary and state the exact escrow/warranty terms.
- [ ] Founder, engineering and operations sign the GO decision after reviewing open critical alerts and reconciled test funds.

## T+1 hour

- [ ] Confirm successful OTP, request, quote, payment, hold and support metrics from production telemetry.
- [ ] Reconcile payment provider totals to ledger totals; investigate any mismatch immediately.
- [ ] Check queue depth, failed jobs, webhook signature failures, crashes and API/provider errors.
- [ ] Review the first five AI diagnoses and technician evidence submissions manually.
- [ ] Confirm support can receive and route a real customer complaint.

## T+24 hours

- [ ] Reconcile every production payment and escrow balance.
- [ ] Review dispute, refund, cancellation and technician-suspension paths with the operations owner.
- [ ] Conduct a restore drill for new production data.
- [ ] Review model confidence distribution, unsafe-output reports and Iran reachability failures.
- [ ] Publish a short internal launch report and assign dates for every open risk.

## Rollback plan

1. **Freeze new bookings and payments** through server-side feature flags; keep existing order/passport data read-only.
2. **Freeze all escrow release workers** before changing any money state.
3. **Disable model inference** if unsafe, unavailable or unexpectedly costly; show the human diagnostic fallback.
4. **Switch support to manual case handling** with a ticket ID and an auditable spreadsheet/console only if legal/finance approve.
5. **Reconcile provider settlements against the append-only ledger** before any customer/technician correction.
6. Roll back only the application/API artifact—not the database—until migrations have a tested down/forward repair procedure.
7. Communicate the incident status, affected scope and next update time to customers and technicians.

## Kill-switch procedure

| Situation | Immediate switch | Owner | Success signal |
| --- | --- | --- | --- |
| Suspected payment/ledger defect | Disable payment capture, new bookings and escrow release | Payments on-call | No new provider charge/ledger entry after confirmation |
| AI unsafe diagnosis | Disable AI result delivery; route to human/manual triage | AI/product on-call | No automated diagnosis response reaches a user |
| Vendor outage/reachability failure | Disable affected provider; use approved fallback or manual queue | SRE/AI on-call | Error rate recovers or manual SLA activates |
| KYC/fraud incident | Suspend technician acceptance/payout | Operations/security | No new jobs assigned/payouts released |
| Data breach suspicion | Revoke sessions/tokens, disable sensitive endpoints, preserve logs | Security lead | Containment confirmed; evidence retained |

**Non-negotiable:** a client-only Android build has no credible emergency kill switch. These controls must be server-managed before launch.
