# Proposed CI workflow — requires a human to install

`.github/workflows/server.yml` could not be pushed from this session: the GitHub App token
available here lacks the `workflows` permission, and GitHub rejects the push with

    ! [remote rejected] (refusing to allow a GitHub App to create or update workflow
      `.github/workflows/build.yml` without `workflows` permission)

This is a permission boundary, not a defect in the workflow. To install it, a maintainer with
push access to `.github/workflows/` runs:

```bash
cp ci/proposed/server.yml .github/workflows/server.yml
git add .github/workflows/server.yml && git commit -m "ci: gate the server money path"
```

`server.yml` gates the service that owns OTP, sessions, payments and the escrow ledger. It runs
on every push to `main`/`master` and on every pull request — before this, no CI job in the
repository touched `services/auth-api` at all. Ten steps:

| step | what it proves |
|---|---|
| `npm ci` / `npm audit --omit=dev --audit-level=high` | a reproducible install with no known high-severity production vulnerability |
| postgres:16 service container | the integration lane can actually run |
| "Confirm the integration lane is really running" | `AUDIT_DATABASE_URL` reaches the suite, so the four integration tests execute instead of skipping |
| `node --test --experimental-test-coverage` | 37 tests, ~78% line coverage |
| "Assert no test was skipped" | **fails the build on any skip** — a green run can never again mean "the money path was untested" |
| `node --check` over `src/*.js` | every module parses |
| "Verify every migration has a matching rollback" | no `db/NNN_*.sql` without its `db/down/NNN_*.down.sql` |
| "Verify the full migration round-trip" | `up` → `down 99` → `up` against a real database |

**The service container is the important part.** Without `AUDIT_DATABASE_URL` the four
integration tests skip, and CI would report green while never executing the completion gate, the
dispute freeze, the refund replay or the ledger balance — the exact regressions the suite exists
to catch. It would also report ~47% line coverage instead of ~78%.

Every step in this file was executed locally against a real PostgreSQL 18.4 before being written
here, including the negative case: with the database absent, the "Assert no test was skipped"
guard reports `# skipped 4` and exits 1.

## Also required from a human

`.github/workflows/build.yml` needs its trigger block changed from

```yaml
on:
  push:
    branches: [ "main", "master", "arena/01a03dca-tamirkar" ]
  workflow_dispatch:
```

to

```yaml
on:
  push:
    branches: [ "main", "master" ]
  pull_request:
  workflow_dispatch:
```

so pull requests run any check at all. Every one of the ten workflow runs in this repository's
history has failed, the most recent at the `Set up Android SDK` step
(`gh run view 36493298453`), so the Android job needs attention too — but that is independent
of the server gate and must not block it.
