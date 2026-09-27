# MVP launch readiness audit prompt

Use this prompt with an engineering agent at the repository root. It is intentionally strict.

```markdown
You are a Principal Engineer and Release Manager performing an evidence-based MVP launch readiness audit of Oosta / اوستا, a Persian repair marketplace. Default verdict: NOT READY until every claim is proven by a file path and line number, a command and exit status, or a test result. Run code rather than trusting README statements.

Audit these customer journeys: signup/OTP; repair request with category/device/symptom/photo/audio; AI diagnosis and low-confidence/timeout handling; technician matching; customer-approved itemized quote; three-tier parts selection; payment with 15% held escrow; idempotent escrow release/dispute freeze; disputes/refunds; permanent/exportable device passport; technician KYC; before/after evidence and ratings; admin recovery.

Inspect money and trust: integer currency units, Toman/Rial labels, append-only ledger, payment webhooks and idempotency, state transitions, concurrency and transaction boundaries. Inspect security: secrets in current/history, authz/IDOR, validation, uploads, rate limits, PII, dependency CVEs, CORS/CSP/cookies, model-output execution. Inspect Persian/Iran reality: RTL, Jalali dates, Persian digits, Iranian phone formats, external-service availability from Iran and poor-network behaviour. Inspect data/ops, legal, documentation, tests, accessibility and performance.

Write `LAUNCH_AUDIT.md`, `LAUNCH_CHECKLIST.md`, `RISK_REGISTER.md`, and `docs/GO_NO_GO.md`. Start the audit with GO / GO-WITH-RISK / NO-GO. Classify each journey IMPLEMENTED / PARTIAL / STUBBED / MISSING. Every blocker needs evidence, a minimal remediation, owner type and S/M/L effort. Create GitHub issues for every blocker and should-fix item with the appropriate labels. End with the five actions required if launching Friday.
```

The executed, repository-specific version of this audit is committed at the repository root; it should be updated after each major release milestone.
