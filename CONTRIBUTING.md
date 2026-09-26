# Contributing to Oosta

## Before opening a pull request

1. Do not add real credentials, production phone numbers, payment authorities, or KYC documents to the repository.
2. For Android changes, run `./gradlew test lintDebug assembleDebug` with JDK 17 and the documented Android SDK.
3. For the auth/platform API, run `npm ci && npm test && npm audit --omit=dev` in `services/auth-api`.
4. Run `./scripts/launch-readiness-audit.sh` and attach the generated report when changing authentication, money, AI, KYC, or release controls.
5. Keep public claims consistent with enabled server feature flags. Never label a stub or sandbox payment as a real escrow service.

## Pull-request expectations

Explain the user-impacting behavior, test evidence, migration impact, feature-flag default, rollback path, and any external configuration needed. Backend changes need an authorization check, idempotency behavior where applicable, Persian error copy, and tests for unhappy paths.
