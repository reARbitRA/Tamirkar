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

`server.yml` gates the service that owns OTP, sessions, payments and the escrow ledger:
`npm ci`, `npm audit --omit=dev --audit-level=high`, `node --test --experimental-test-coverage`,
a `node --check` pass over every module, and a presence check for all four migrations. It runs
on every push to `main`/`master` and on every pull request — before this, no CI job in the
repository touched `services/auth-api` at all.

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
