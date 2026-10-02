# Testing Strategy — Oosta (اوستا)

## 🧪 Verification Architecture
1. **Robolectric JVM Tests**: Validates business logic, escrow splits, and database CRUD.
2. **Roborazzi Screenshot Tests**: Visual regression testing for RTL layouts, Persian font rendering, and Material 3 components.
3. **AI Agent Mock & Fallback Tests**: Verifies graceful handling if offline or during network latency.

## One command that reproduces the CI gate locally

`ci/proposed/server.yml` is the real gate, but pushing to `.github/workflows/` requires the
`workflows` permission, which the installation token used by audit sessions does not have. The same
assertions are therefore available as a local script:

```bash
AUDIT_DATABASE_URL=postgres://user:pw@127.0.0.1:5432/postgres bash scripts/ci-server-check.sh
```

It runs `npm ci`, `npm audit --omit=dev --audit-level=high`, `node --check` over `src/*.js`, asserts
every `db/NNN_*.sql` has a matching `db/down/NNN_*.down.sql`, performs the full migration round trip
(`up` → `down 99` → `up`), then runs the suite with `--experimental-test-coverage` and **fails if any
test was skipped**. Exit `0` means the money path really ran; exit `2` means `AUDIT_DATABASE_URL` was
missing, so nothing was proven. Logs land in the git-ignored `audit-output/`.

