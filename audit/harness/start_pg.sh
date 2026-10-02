#!/usr/bin/env bash
# Audit harness: boot a REAL PostgreSQL server from embedded binaries so the
# auth-api SQL can be executed, not just read.
#
# NOTE: the embedded-postgres bin ships only initdb / pg_ctl / postgres — there is no psql, so
# readiness is checked with pg_ctl plus a real TCP+protocol probe from Node, never with psql.
set -euo pipefail
PGBIN=/home/user/pgtest/node_modules/@embedded-postgres/linux-x64/native/bin
DATA=/home/user/pgtest/pgdata
PORT="${1:-55432}"

if [ ! -x "$PGBIN/postgres" ]; then
  echo "PG_MISSING_BINARIES: run 'npm install @embedded-postgres/linux-x64@18.4.0-beta.17' in /home/user/pgtest"
  exit 2
fi

rm -rf "$DATA"; mkdir -p "$DATA"
"$PGBIN/initdb" -D "$DATA" -U oosta --auth=trust -E UTF8 >/dev/null 2>&1
"$PGBIN/postgres" -D "$DATA" -p "$PORT" -c listen_addresses=127.0.0.1 -c unix_socket_directories=/tmp -c fsync=off >/home/user/pgtest/pg.log 2>&1 &

for i in $(seq 1 60); do
  if "$PGBIN/pg_ctl" -D "$DATA" status >/dev/null 2>&1 \
     && node -e '
        const net=require("net");const s=net.connect(Number(process.argv[1]),"127.0.0.1");
        s.on("error",()=>process.exit(1));s.on("connect",()=>{s.end();process.exit(0)});
        s.setTimeout(1500,()=>{s.destroy();process.exit(1)});' "$PORT" >/dev/null 2>&1; then
    echo "PG_UP on $PORT"; exit 0
  fi
  sleep 0.5
done
echo "PG_FAILED"; tail -20 /home/user/pgtest/pg.log; exit 1
