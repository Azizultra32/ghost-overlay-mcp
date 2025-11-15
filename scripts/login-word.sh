#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="/Users/ali/GHOST"
LOG_DIR="$HOME/Library/Logs/AssistMD"
LOG_FILE="$LOG_DIR/word-autostart.log"
STATUS_MSG="AssistMD Chrome environment ready"

mkdir -p "$LOG_DIR"
{
  echo "===== $(date) ====="
  echo "Launching AssistMD Chrome (auto-start)"
  WORD_AUTO_CODEX_CLEAN=0 "$REPO_DIR/word" start
  "$REPO_DIR/word" status
  echo
} >> "$LOG_FILE" 2>&1

if command -v osascript >/dev/null 2>&1; then
  osascript <<OSA >/dev/null 2>&1
    display notification "Chrome profile + DevTools MCP auto-started" with title "AssistMD" subtitle "word start"
OSA
fi

echo "$STATUS_MSG"
