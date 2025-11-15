#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BROWSER_PID_FILE="${MCP_BROWSER_PID_FILE:-$ROOT_DIR/.chrome_mcp_browser.pid}"
SERVER_PID_FILE="${MCP_SERVER_PID_FILE:-$ROOT_DIR/.chrome_mcp_server.pid}"
PROFILE_DIR="${MCP_PROFILE_DIR:-/tmp/chrome-mcp}"

stop_pid() {
  local pid_file="$1"
  if [ -f "$pid_file" ]; then
    local pid
    pid="$(cat "$pid_file")"
    if kill -0 "$pid" 2>/dev/null; then
      echo "Stopping process $pid"
      kill "$pid" 2>/dev/null || true
      sleep 1
      if kill -0 "$pid" 2>/dev/null; then
        echo "Force killing $pid"
        kill -9 "$pid" 2>/dev/null || true
      fi
    fi
    rm -f "$pid_file"
  fi
}

stop_pid "$SERVER_PID_FILE"
stop_pid "$BROWSER_PID_FILE"

# Clean up orphaned processes if pid files were lost
pkill -f "chrome-devtools-mcp" 2>/dev/null || true
pkill -f "$PROFILE_DIR" 2>/dev/null || true

echo "MCP services stopped."
