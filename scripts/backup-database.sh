#!/usr/bin/env bash
# Oosta PostgreSQL backup. Custom-format dump so a single table can be restored without
# replaying everything. Run from a scheduler; keep the retention window aligned with the RPO
# documented in docs/DEPLOYMENT.md.
set -euo pipefail

for tool in pg_dump pg_restore; do
  command -v "$tool" >/dev/null 2>&1 || { echo "required tool not on PATH: $tool (install postgresql-client)" >&2; exit 4; }
done

: "${DATABASE_URL:?DATABASE_URL must point at the database to back up}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="${BACKUP_DIR}/oosta-${STAMP}.dump"

mkdir -p "$BACKUP_DIR"

echo "dumping to ${OUT}"
pg_dump --format=custom --compress=9 --no-owner --no-privileges \
  --dbname="$DATABASE_URL" --file="$OUT"

# A dump you cannot read back is not a backup.
pg_restore --list "$OUT" > /dev/null
echo "verified archive is readable: $(pg_restore --list "$OUT" | grep -c '^;') catalog lines"

find "$BACKUP_DIR" -name 'oosta-*.dump' -mtime "+${RETENTION_DAYS}" -print -delete
echo "retention sweep complete (>${RETENTION_DAYS} days removed)"
