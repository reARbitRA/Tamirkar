#!/usr/bin/env bash
# Oosta PostgreSQL restore. Refuses to touch a populated database unless --force is given,
# because the ledger and the escrow holds cannot be reconstructed from anything else.
set -euo pipefail

for tool in pg_restore psql; do
  command -v "$tool" >/dev/null 2>&1 || { echo "required tool not on PATH: $tool (install postgresql-client)" >&2; exit 4; }
done

DUMP="${1:-}"
FORCE="${2:-}"

if [ -z "$DUMP" ] || [ ! -f "$DUMP" ]; then
  echo "usage: $0 <dump-file> [--force]" >&2
  exit 2
fi
: "${DATABASE_URL:?DATABASE_URL must point at the restore target}"

if [ "$FORCE" != "--force" ]; then
  TABLES="$(psql "$DATABASE_URL" --tuples-only --no-align -c \
    "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'")"
  if [ "${TABLES:-0}" != "0" ]; then
    echo "refusing to restore into a database that already has ${TABLES} public tables." >&2
    echo "re-run with --force only after confirming this target is disposable." >&2
    exit 3
  fi
fi

echo "restoring ${DUMP} into the DATABASE_URL target"
pg_restore --no-owner --no-privileges --exit-on-error --dbname="$DATABASE_URL" "$DUMP"

psql "$DATABASE_URL" --tuples-only --no-align -c \
  "SELECT 'ledger_entries=' || count(*) FROM ledger_entries
   UNION ALL SELECT 'escrow_holds=' || count(*) FROM escrow_holds
   UNION ALL SELECT 'service_orders=' || count(*) FROM service_orders"
echo "restore complete - reconcile the counts above against the provider settlement report"
