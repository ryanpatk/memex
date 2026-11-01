#!/usr/bin/env bash
# Back up the production Supabase database (schema + data + roles) to a
# timestamped folder OUTSIDE the repo. It only reads data (pg_dump); the CLI
# signs in through a temporary login role it manages itself.
#
#   scripts/backup-supabase.sh                 # → ~/memex-backups/<UTC timestamp>/
#   scripts/backup-supabase.sh --out /Volumes/Backup/memex
#   SUPABASE_DB_URL='postgresql://…' scripts/backup-supabase.sh   # skip the CLI login
#
# Needs: Node (for npx), Docker running (the CLI runs pg_dump in a container
# matching the server's Postgres version), and a Supabase CLI login
# (`npx supabase@2 login`) for the account that owns the project. Without
# SUPABASE_DB_URL the CLI (2.x, recent) connects through the IPv4 pooler as a
# temporary CLI login role, so no database password is needed.
# Restore steps: docs/backups.md.
set -euo pipefail

PROJECT_REF="${SUPABASE_PROJECT_REF:-zwgotlojioprtjvrxltc}" # memex (production)
BACKUP_ROOT="${MEMEX_BACKUP_DIR:-$HOME/memex-backups}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --out) BACKUP_ROOT="$2"; shift 2 ;;
    --project-ref) PROJECT_REF="$2"; shift 2 ;;
    -h|--help) sed -n '2,15p' "$0"; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
done

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# Older CLIs (e.g. Homebrew 2.12) prompt for the DB password and try IPv6, so
# default to a current 2.x through npx. Override with SUPABASE_CLI=supabase.
read -r -a CLI <<< "${SUPABASE_CLI:-npx -y supabase@2}"
docker info >/dev/null 2>&1 || { echo "Docker isn't running; start Docker Desktop and retry" >&2; exit 1; }

mkdir -p "$BACKUP_ROOT"
BACKUP_ROOT="$(cd "$BACKUP_ROOT" && pwd)"
case "$BACKUP_ROOT/" in
  "$REPO_ROOT"/*) echo "Refusing to write a backup inside the repo ($BACKUP_ROOT)" >&2; exit 1 ;;
esac

STAMP="$(date -u +%Y-%m-%dT%H%M%SZ)"
OUT="$BACKUP_ROOT/$STAMP"
mkdir -p "$OUT"
chmod 700 "$BACKUP_ROOT" "$OUT" # holds auth.users (password hashes) and every note

if [[ -n "${SUPABASE_DB_URL:-}" ]]; then
  TARGET=(--db-url "$SUPABASE_DB_URL")
  WORKDIR="$REPO_ROOT"
else
  # Link a throwaway workdir (project ref + pooler URL) so the repo's own
  # link state is never touched.
  WORKDIR="$(mktemp -d)"
  trap 'rm -rf "$WORKDIR"' EXIT
  mkdir -p "$WORKDIR/supabase"
  cp "$REPO_ROOT/supabase/config.toml" "$WORKDIR/supabase/config.toml"
  "${CLI[@]}" link --workdir "$WORKDIR" --project-ref "$PROJECT_REF" </dev/null >/dev/null
  TARGET=(--linked)
fi

dump() {
  echo "→ $1"
  "${CLI[@]}" db dump --workdir "$WORKDIR" "${TARGET[@]}" -f "$OUT/$1" "${@:2}" </dev/null
}

# Same three files as Supabase's own backup/restore guide. The two storage
# vector tables can't be written by `postgres` on a fresh project, so they're
# left out (memex doesn't use them).
dump roles.sql --role-only
dump schema.sql
dump data.sql --data-only --use-copy -x storage.buckets_vectors -x storage.vector_indexes

# Per-table row counts, read from the COPY blocks (counts only, no content).
awk '
  /^COPY / { table = $2; n = 0; inside = 1; next }
  inside && $0 == "\\." { printf "%-45s %d\n", table, n; inside = 0; next }
  inside { n++ }
' "$OUT/data.sql" | sort > "$OUT/row-counts.txt"

(cd "$OUT" && shasum -a 256 roles.sql schema.sql data.sql > SHA256SUMS)
cat > "$OUT/README.txt" <<EOF
memex Supabase backup
project:  $PROJECT_REF
taken:    $STAMP (UTC)
git:      $(git -C "$REPO_ROOT" rev-parse --short HEAD 2>/dev/null || echo unknown)
restore:  see docs/backups.md in the memex repo
EOF
chmod 600 "$OUT"/*

echo
echo "Backup written to $OUT ($(du -sh "$OUT" | cut -f1))"
echo "Row counts (non-empty tables):"
awk '$2 > 0' "$OUT/row-counts.txt"
