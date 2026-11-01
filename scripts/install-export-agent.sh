#!/bin/bash
# Nightly walk-away export as a macOS launchd user agent (runs as you, no sudo).
#
#   scripts/install-export-agent.sh install     # copy scripts, write + load the agent (3:30 AM daily)
#   scripts/install-export-agent.sh run         # run it now through launchd (launchctl kickstart)
#   scripts/install-export-agent.sh status      # agent state, last exit code, end of the log
#   scripts/install-export-agent.sh uninstall   # unload + remove the agent and the copied scripts
#
# The scripts are copied to ~/Library/Application Support/memex-export/ so the job
# doesn't depend on a checkout or worktree; re-run `install` after changing them.
# Options for install (env): MEMEX_EXPORT_HOUR (3), MEMEX_EXPORT_MINUTE (30),
# MEMEX_VAULT_DIR (~/memex-vault). Format + details: docs/vault-format.md.
set -euo pipefail

LABEL="com.ryanpatk.memex.export-vault"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
INSTALL_DIR="$HOME/Library/Application Support/memex-export"
LOG="$HOME/Library/Logs/memex-export.log"
DOMAIN="gui/$(id -u)"
SRC="$(cd "$(dirname "$0")" && pwd)"
FILES=(export-vault.mjs check-vault.mjs export-vault.sh)

xml() { sed -e 's/&/\&amp;/g' -e 's/</\&lt;/g' -e 's/>/\&gt;/g' <<< "$1"; }

install_agent() {
  local node_bin node_dir hour minute vault repo
  node_bin="$(command -v node)" || { echo "node isn't on PATH" >&2; exit 1; }
  node_dir="$(dirname "$node_bin")"
  hour="${MEMEX_EXPORT_HOUR:-3}"
  minute="${MEMEX_EXPORT_MINUTE:-30}"
  vault="${MEMEX_VAULT_DIR:-$HOME/memex-vault}"
  repo="$(cd "$SRC/.." && pwd)"

  mkdir -p "$INSTALL_DIR" "$HOME/Library/LaunchAgents" "$HOME/Library/Logs"
  for f in "${FILES[@]}"; do cp "$SRC/$f" "$INSTALL_DIR/$f"; done
  chmod +x "$INSTALL_DIR/export-vault.sh"

  cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>$(xml "$INSTALL_DIR/export-vault.sh")</string>
  </array>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key><integer>$hour</integer>
    <key>Minute</key><integer>$minute</integer>
  </dict>
  <key>EnvironmentVariables</key>
  <dict>
    <key>MEMEX_NODE_DIR</key><string>$(xml "$node_dir")</string>
    <key>MEMEX_VAULT_DIR</key><string>$(xml "$vault")</string>
    <key>MEMEX_REPO_GUARD</key><string>$(xml "$repo")</string>
  </dict>
  <key>WorkingDirectory</key><string>$(xml "$HOME")</string>
  <key>StandardOutPath</key><string>$(xml "$LOG")</string>
  <key>StandardErrorPath</key><string>$(xml "$LOG")</string>
  <key>ProcessType</key><string>Background</string>
  <key>LowPriorityIO</key><true/>
</dict>
</plist>
EOF
  plutil -lint "$PLIST" >/dev/null
  launchctl bootout "$DOMAIN/$LABEL" 2>/dev/null || true
  launchctl bootstrap "$DOMAIN" "$PLIST"
  printf 'Installed %s: daily at %02d:%02d, vault %s, log %s\n' "$LABEL" "$hour" "$minute" "$vault" "$LOG"
}

uninstall_agent() {
  launchctl bootout "$DOMAIN/$LABEL" 2>/dev/null || true
  rm -f "$PLIST"
  for f in "${FILES[@]}"; do rm -f "$INSTALL_DIR/$f"; done
  rmdir "$INSTALL_DIR" 2>/dev/null || true
  echo "Removed $LABEL (the vault and the log are left in place)"
}

case "${1:-}" in
  install) install_agent ;;
  uninstall) uninstall_agent ;;
  run) launchctl kickstart -p "$DOMAIN/$LABEL" && echo "Started; follow with: tail -f '$LOG'" ;;
  status)
    launchctl print "$DOMAIN/$LABEL" 2>/dev/null | grep -E $'^\t(state|runs|last exit code|pid) =' || echo "$LABEL isn't loaded"
    [[ -f "$LOG" ]] && { echo "--- $LOG (last 12 lines)"; tail -n 12 "$LOG"; }
    ;;
  *) sed -n '2,12p' "$0"; exit 2 ;;
esac
