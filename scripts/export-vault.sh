#!/bin/bash
# Run the walk-away export, then check the result, with timestamped start/end
# lines so a log (e.g. ~/Library/Logs/memex-export.log under launchd) shows
# every run and whether it worked. Extra arguments go to export-vault.mjs.
#
#   scripts/export-vault.sh                      # → ~/memex-vault (or $MEMEX_VAULT_DIR)
#
# Needs Node and a Supabase CLI login (`npx supabase@2 login`, kept in the login
# keychain). No Docker. A failure ends with a "FAILED" line, a non-zero exit and
# a macOS notification.
set -uo pipefail

# launchd starts jobs with a minimal PATH; MEMEX_NODE_DIR is set by the installer.
export PATH="${MEMEX_NODE_DIR:+$MEMEX_NODE_DIR:}/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
DIR="$(cd "$(dirname "$0")" && pwd)"
VAULT="${MEMEX_VAULT_DIR:-$HOME/memex-vault}"
stamp() { date '+%Y-%m-%d %H:%M:%S %Z'; }

echo "=== $(stamp) memex export start → $VAULT"
status=0
if ! command -v node >/dev/null 2>&1; then
  echo "node not found on PATH ($PATH)"
  status=127
else
  MEMEX_VAULT_DIR="$VAULT" node "$DIR/export-vault.mjs" "$@" || status=$?
  if [[ $status -eq 0 ]]; then
    node "$DIR/check-vault.mjs" "$VAULT" || status=$?
  fi
fi

if [[ $status -eq 0 ]]; then
  echo "=== $(stamp) memex export OK"
else
  echo "=== $(stamp) memex export FAILED (exit $status). If the Supabase CLI says it isn't logged in, run: npx supabase@2 login"
  /usr/bin/osascript -e 'display notification "See ~/Library/Logs/memex-export.log" with title "memex export failed"' >/dev/null 2>&1 || true
fi
exit "$status"
