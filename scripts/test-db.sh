#!/usr/bin/env bash
# Database-level tests (pgTAP, supabase/tests/*.test.sql) against a throwaway
# local Postgres: production's schema from a backup, plus the migrations that
# came after it. Never touches the production database.
#
#   scripts/test-db.sh                         # newest ~/memex-backups/*/schema.sql
#   scripts/test-db.sh --schema path/to/schema.sql --since 20261104000000
#
# Why a backup's schema: supabase/migrations/ doesn't replay from scratch
# (TODO.md → "Migration history doesn't replay"), so the closest copy of
# production's schema is the last backup (schema only; no rows are loaded).
# --since picks the migrations to apply on top (versions >= it; default: the
# M7 migrations, which are idempotent, so re-applying them on a newer backup
# is harmless).
#
# Needs Docker running and psql. The stack runs on its own ports
# (DB 54632) and project id, so it doesn't collide with another local stack,
# and is stopped (no volume kept) when the script exits.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SCHEMA=""
SINCE="20261104000000"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --schema) SCHEMA="$2"; shift 2 ;;
    --since) SINCE="$2"; shift 2 ;;
    -h|--help) sed -n '2,19p' "$0"; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
done
if [[ -z "$SCHEMA" ]]; then
  latest="$(ls -d "${MEMEX_BACKUP_DIR:-$HOME/memex-backups}"/20*Z 2>/dev/null | tail -1 || true)"
  [[ -n "$latest" ]] || { echo "No backup found; pass --schema FILE (a backup's schema.sql)" >&2; exit 1; }
  SCHEMA="$latest/schema.sql"
fi
[[ -f "$SCHEMA" ]] || { echo "No schema at $SCHEMA" >&2; exit 1; }
docker info >/dev/null 2>&1 || { echo "Docker isn't running; start Docker Desktop and retry" >&2; exit 1; }
command -v psql >/dev/null || { echo "psql not found (brew install libpq or postgresql)" >&2; exit 1; }

read -r -a CLI <<< "${SUPABASE_CLI:-npx -y supabase@2}"
WORKDIR="$(mktemp -d)"
PORT=54632
cleanup() {
  "${CLI[@]}" stop --workdir "$WORKDIR" --no-backup >/dev/null 2>&1 || true
  rm -rf "$WORKDIR"
}
trap cleanup EXIT

mkdir -p "$WORKDIR/supabase"
sed -e 's/^project_id = .*/project_id = "memex-db-test"/' \
    -e "/^\[db\]/,/^\[/ s/^port = .*/port = $PORT/" \
    -e "/^\[db\]/,/^\[/ s/^shadow_port = .*/shadow_port = $((PORT + 1))/" \
    "$REPO_ROOT/supabase/config.toml" > "$WORKDIR/supabase/config.toml"

echo "→ starting a throwaway Postgres (port $PORT)"
"${CLI[@]}" db start --workdir "$WORKDIR" >/dev/null
DB="postgresql://postgres:postgres@127.0.0.1:$PORT/postgres"
PSQL=(env PGOPTIONS="-c client_min_messages=warning" psql --quiet --no-psqlrc --set ON_ERROR_STOP=1 --dbname "$DB")

echo "→ loading schema from $SCHEMA"
"${PSQL[@]}" --single-transaction --file "$SCHEMA" >/dev/null

for f in "$REPO_ROOT"/supabase/migrations/*.sql; do
  version="$(basename "$f" | cut -d_ -f1)"
  if [[ "$version" > "$SINCE" || "$version" == "$SINCE" ]]; then
    echo "→ applying $(basename "$f")"
    "${PSQL[@]}" --single-transaction --file "$f" >/dev/null
  fi
done

status=0
for t in "$REPO_ROOT"/supabase/tests/*.test.sql; do
  echo "→ $(basename "$t")"
  out="$("${PSQL[@]}" --tuples-only --no-align --file "$t" 2>&1)" || status=1
  echo "$out" | grep -E '^(ok|not ok|#)' | sed 's/^/  /'
  if echo "$out" | grep -qE '^not ok|Looks like|ERROR'; then
    status=1
    echo "$out" | grep -E 'ERROR|Looks like' | sed 's/^/  /' || true
  fi
  total="$(echo "$out" | grep -cE '^ok' || true)"
  echo "  $total passed"
done
exit $status
