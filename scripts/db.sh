#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

[ -f .env ] && set -a && . ./.env && set +a

HOST="${POSTGRES_HOST:-localhost}"
PORT="${POSTGRES_PORT:-5432}"
USER="${POSTGRES_USER:-jungle}"
PASSWORD="${POSTGRES_PASSWORD:-jungle}"
DB="${POSTGRES_DB:-flowbee}"

# remote POSTGRES_HOST means a shared server owns the DB - never touch a local cluster
case "$HOST" in
  localhost|127.0.0.1|::1|"") ;;
  *)
    echo "POSTGRES_HOST=$HOST is remote - skipping local postgres (${1:-start})"
    exit 0
    ;;
esac

PGDATA="$ROOT/.pgdata"
LOGFILE="$ROOT/.pgdata/server.log"
BIN="$(.venv-pg/bin/python -c "import pgserver, os; print(os.path.join(os.path.dirname(pgserver.__file__), 'pginstall', 'bin'))")"

export PGPASSWORD="$PASSWORD"

init() {
  [ -d "$PGDATA" ] && return 0
  local pwfile
  pwfile="$(mktemp)"
  printf '%s' "$PASSWORD" > "$pwfile"
  "$BIN/initdb" -D "$PGDATA" -U "$USER" --auth=scram-sha-256 --pwfile="$pwfile" -E UTF8 >/dev/null
  rm -f "$pwfile"
}

start() {
  if ! "$BIN/pg_ctl" -D "$PGDATA" status >/dev/null 2>&1 &&
     "$BIN/pg_isready" -h 127.0.0.1 -p "$PORT" -q; then
    echo "port $PORT already served by another postgres (compose?) - leaving it alone"
    return 0
  fi
  init
  if "$BIN/pg_ctl" -D "$PGDATA" status >/dev/null 2>&1; then
    echo "already running"
  else
    "$BIN/pg_ctl" -D "$PGDATA" -l "$LOGFILE" -o "-h 127.0.0.1 -p $PORT" -w start
  fi
  "$BIN/psql" -h 127.0.0.1 -p "$PORT" -U "$USER" -d postgres -tAc \
    "select 1 from pg_database where datname='$DB'" | grep -q 1 ||
    "$BIN/createdb" -h 127.0.0.1 -p "$PORT" -U "$USER" "$DB"
  echo "postgres $HOST:$PORT db=$DB user=$USER"
}

case "${1:-start}" in
  start) start ;;
  stop) "$BIN/pg_ctl" -D "$PGDATA" -m fast stop ;;
  status) "$BIN/pg_ctl" -D "$PGDATA" status ;;
  psql) shift; "$BIN/psql" -h 127.0.0.1 -p "$PORT" -U "$USER" -d "$DB" "$@" ;;
  reset)
    "$BIN/pg_ctl" -D "$PGDATA" -m fast stop 2>/dev/null || true
    rm -rf "$PGDATA"
    start
    ;;
  *) echo "usage: $0 {start|stop|status|reset|psql}" >&2; exit 1 ;;
esac
