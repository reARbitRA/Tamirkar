#!/usr/bin/env bash
#
# Local gate for services/auth-api — the executable half of the proposed CI job.
#
# The workflow in ci/proposed/server.yml is the real gate, but it cannot be installed from a
# session whose GitHub token lacks the `workflows` permission. This script performs the same
# assertions locally, so the guarantee "a green result means the money path was executed" can be
# reproduced on any machine that has node and a disposable PostgreSQL, without waiting on a
# maintainer. Every step below mirrors a step in the proposed workflow.
#
# Usage:
#   AUDIT_DATABASE_URL=postgres://user:pw@host:5432/postgres bash scripts/ci-server-check.sh
#
# Exit codes: 0 all gates passed · 2 missing input · 3 a gate failed.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVICE="$ROOT/services/auth-api"
LOG_DIR="${LOG_DIR:-$ROOT/audit-output}"
mkdir -p "$LOG_DIR"

FAILURES=0
step()  { printf '\n=== %s\n' "$1"; }
pass()  { printf '  PASS  %s\n' "$1"; }
fail()  { printf '  FAIL  %s\n' "$1"; FAILURES=$((FAILURES + 1)); }

if [[ -z "${AUDIT_DATABASE_URL:-}" ]]; then
  echo "AUDIT_DATABASE_URL is required. Without it the four integration tests and the two" >&2
  echo "retention tests skip, and a green run would mean the money path was never executed." >&2
  exit 2
fi
command -v node >/dev/null 2>&1 || { echo "node is required" >&2; exit 2; }
command -v npm  >/dev/null 2>&1 || { echo "npm is required" >&2;  exit 2; }

cd "$SERVICE" || exit 2

export NODE_ENV="${NODE_ENV:-test}"
# Every migration's down script drops tables, so the round trip below opts in explicitly.
export CONFIRM_DESTRUCTIVE_ROLLBACK=yes
# src/migrate.js calls loadConfig(), which validates the whole service environment even though a
# migration only needs DATABASE_URL. Supply throw-away values rather than real ones; they are never
# used by the migration path.
export DATABASE_URL="${DATABASE_URL:-$AUDIT_DATABASE_URL}"
export JWT_SECRET="${JWT_SECRET:-ci-check-only-jwt-secret-not-used-by-migrations}"
export OTP_PEPPER="${OTP_PEPPER:-ci-check-only-otp-pepper-not-used-by-migrations}"
export KAVENEGAR_API_KEY="${KAVENEGAR_API_KEY:-ci-check-only-kavenegar-key}"
export KAVENEGAR_TEMPLATE="${KAVENEGAR_TEMPLATE:-OOSTA_CI_CHECK}"

step "npm ci"
if npm ci --no-audit --no-fund >"$LOG_DIR/ci-npm-ci.log" 2>&1; then pass "dependencies installed from the lockfile"; else fail "npm ci"; fi

step "npm audit --omit=dev --audit-level=high"
if npm audit --omit=dev --audit-level=high >"$LOG_DIR/ci-npm-audit.log" 2>&1; then pass "no high-or-above production vulnerability"; else fail "npm audit reported a high/critical production vulnerability"; fi

step "node --check over src/*.js"
SYNTAX_OK=1
for f in src/*.js; do
  node --check "$f" >>"$LOG_DIR/ci-syntax.log" 2>&1 || { fail "syntax error in $f"; SYNTAX_OK=0; }
done
[[ $SYNTAX_OK -eq 1 ]] && pass "every module parses"

step "every up migration has a matching rollback"
MISSING=0
for f in db/*.sql; do
  base="$(basename "$f" .sql)"
  [[ -f "db/down/${base}.down.sql" ]] || { fail "no db/down/${base}.down.sql"; MISSING=1; }
done
[[ $MISSING -eq 0 ]] && pass "all $(ls db/*.sql | wc -l | tr -d ' ') migrations are reversible"

step "migration round trip: up -> down 99 -> up"
if DATABASE_URL="$AUDIT_DATABASE_URL" node src/migrate.js up >"$LOG_DIR/ci-migrate-up.log" 2>&1; then
  pass "up applied cleanly"
  if DATABASE_URL="$AUDIT_DATABASE_URL" node src/migrate.js down 99 >"$LOG_DIR/ci-migrate-down.log" 2>&1; then
    pass "down 99 rolled every migration back"
    if DATABASE_URL="$AUDIT_DATABASE_URL" node src/migrate.js up >"$LOG_DIR/ci-migrate-reup.log" 2>&1; then
      pass "up re-applied the schema afterwards"
    else fail "re-applying the migrations failed"; fi
  else fail "the destructive rollback failed"; fi
else fail "the forward migration failed"; fi
unset CONFIRM_DESTRUCTIVE_ROLLBACK

step "node --test --experimental-test-coverage"
if AUDIT_DATABASE_URL="$AUDIT_DATABASE_URL" node --test --experimental-test-coverage >"$LOG_DIR/ci-test.log" 2>&1; then
  pass "$(grep -E '^# pass ' "$LOG_DIR/ci-test.log" | tail -1 | tr -d '#') passed"
else fail "the test suite failed"; fi

step "no test was skipped"
SKIPPED="$(grep -E '^# skipped ' "$LOG_DIR/ci-test.log" | tail -1 | awk '{print $3}')"
FAILED="$(grep -E '^# fail ' "$LOG_DIR/ci-test.log" | tail -1 | awk '{print $3}')"
if [[ "${SKIPPED:-1}" == "0" ]]; then
  pass "0 skipped — the integration lane really ran"
else
  fail "${SKIPPED:-unknown} test(s) skipped: a green run must not mean the money path was untested"
fi
[[ "${FAILED:-1}" == "0" ]] && pass "0 failed" || fail "${FAILED:-unknown} test(s) failed"

printf '\n=== summary\n'
if [[ $FAILURES -eq 0 ]]; then
  echo "ALL GATES PASSED — logs in $LOG_DIR"
  exit 0
fi
echo "$FAILURES gate(s) failed — logs in $LOG_DIR"
exit 3
