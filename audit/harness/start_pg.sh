#!/usr/bin/env bash
# Audit harness: boot a REAL PostgreSQL server from embedded binaries so the
# auth-api SQL can be executed, not just read.
set -euo pipefail
PGBIN=/home/user/pgtest/node_modules/@embedded-postgres/linux-x64/native/bin
DATA=/home/user/pgtest/pgdata
PORT="${1:-55432}"
rm -rf "$DATA"; mkdir -p "$DATA"
"$PGBIN/initdb" -D "$DATA" -U oosta --auth=trust -E UTF8 >/dev/null 2>&1
"$PGBIN/postgres" -D "$DATA" -p "$PORT" -c listen_addresses=127.0.0.1 -c unix_socket_directories=/tmp -c fsync=off >/home/user/pgtest/pg.log 2>&1 &
for i in $(seq 1 60); do
  if "$PGBIN/pg_ctl" -D "$DATA" status >/dev/null 2>&1 && "$PGBIN/../../../native/bin/psql" -h 127.0.0.1 -p "$PORT" -U oosta -d postgres -c 'select 1' >/dev/null 2>&1; then
    echo "PG_UP on $PORT"; exit 0
  fi
  sleep 0.5
done
echo "PG_FAILED"; tail -20 /home/user/pgtest/pg.log; exit 1
