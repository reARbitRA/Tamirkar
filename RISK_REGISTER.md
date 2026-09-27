# Oosta risk register

Scales: likelihood (L) and impact (I) are 1–5. Score = L × I. Current controls describe what is present in this repository, not desired state.

| # | Risk | L | I | Score | Current evidence/control | Mitigation before launch | Detection signal | Owner |
| ---: | --- | ---: | ---: | ---: | --- | --- | --- | --- |
| 1 | Escrow is advertised but no funds are actually held/released | 5 | 5 | 25 | Local computed field and synthetic `payment` transaction only | Server ledger, provider hold/release, reconciliation | Ledger/provider mismatch; customer complaint | Payments |
| 2 | API provider keys extracted from APK and abused | 5 | 5 | 25 | `BuildConfig` provider-key reads in client | Server AI gateway; rotate/revoke client keys | Unexpected vendor spend / keys in APK scan | Security/AI |
| 3 | Unauthenticated user accesses customer/technician data or money state | 5 | 5 | 25 | Home is start route; fixed `user_default` / `tech_1` | Server authz and tenancy tests | Requests without verified session | Backend/Security |
| 4 | AI fabricates confident unsafe diagnosis after failure | 4 | 5 | 20 | Static fallbacks assign 89–95% confidence | Confidence provenance, human gate, safety evaluation | Low-confidence/error result shown as success | AI/Product |
| 5 | Duplicate/early escrow release or refund | 4 | 5 | 20 | No worker/idempotency/transaction boundary | Idempotent jobs, state machine, immutable ledger | Duplicate job / balance drift | Payments/SRE |
| 6 | Fake or unverified technician performs work | 4 | 5 | 20 | Demo technician records, no KYC state | KYC, guild verification, suspension process | KYC mismatch / complaint | Operations |
| 7 | Customer pays for a quote that was never approved | 4 | 5 | 20 | No quote version/approval record | Signed immutable quote snapshot | Settlement without approval event | Backend/Product |
| 8 | Device passport data is lost or altered | 4 | 4 | 16 | Local Room with destructive migration | Append-only server history + backups/export | Restore test fail / hash mismatch | Data/Backend |
| 9 | Iran cannot reach all inference vendors | 4 | 4 | 16 | Google/Groq/Cerebras/HF/OpenRouter direct calls | In-Iran tested fallback and manual queue | Provider-specific failures / latency | SRE/Product |
| 10 | PII (phone, address, diagnostic media) leaves device without consent/governance | 4 | 4 | 16 | No privacy policy; client-side external calls | Consent, minimisation, contracts, audit logs | PII in vendor logs / privacy complaint | Legal/Security |
| 11 | Concurrent technician claim creates conflicting service assignment | 4 | 4 | 16 | Read-copy-write `acceptBid` | Conditional server transaction / unique assignment | Two accepted technicians on one order | Backend |
| 12 | No human path can resolve a dispute or stuck order | 4 | 4 | 16 | AI-only dispute recommendation, no admin console | Admin case tooling and escalation SLA | Open case exceeds SLA | Operations |
| 13 | Release is broken or untested due CI branch/toolchain gaps | 3 | 4 | 12 | Local Java absent; workflow filter mismatched to active branch | Required CI checks, artifact signing, release test | Missing CI status or failed build | DevEx/Android |
| 14 | Persian UX harms trust or blocks task completion | 3 | 3 | 9 | Strings hard-coded, no Jalali/normalisation QA | i18n resources and RTL/Jalali device tests | Support requests / invalid input rate | Android/i18n |
| 15 | No backup/restore/observability prolongs an outage | 3 | 4 | 12 | Template backup XML; no server monitoring | Tested backups, alerts, on-call/runbooks | Unnoticed queue/API/data error | SRE |
