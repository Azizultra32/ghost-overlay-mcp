#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${MCP_DEBUG_PORT:-9222}"
PROFILE_DIR="${MCP_PROFILE_DIR:-/tmp/chrome-mcp}"
BROWSER_LOG="${MCP_BROWSER_LOG:-/tmp/chrome-mcp-browser.log}"
BROWSER_PID_FILE="${MCP_BROWSER_PID_FILE:-$ROOT_DIR/.chrome_mcp_browser.pid}"
EXTENSION_DIR="${MCP_EXTENSION_DIR:-$ROOT_DIR}"
CHROME="${CHROME_BINARY:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"

if ! command -v curl >/dev/null 2>&1; then
  echo "curl is required" >&2
  exit 1
fi

if [ ! -x "${CHROME}" ]; then
  echo "Chrome not found at ${CHROME}" >&2
  exit 1
fi

if [ ! -d "${EXTENSION_DIR}" ]; then
  echo "Extension directory not found: ${EXTENSION_DIR}" >&2
  exit 1
fi

# Stop existing processes if pid files present
if [ -f "$BROWSER_PID_FILE" ]; then
  if kill -0 "$(cat "$BROWSER_PID_FILE")" 2>/dev/null; then
    echo "Stopping existing Chrome (pid $(cat "$BROWSER_PID_FILE"))"
    kill "$(cat "$BROWSER_PID_FILE")" 2>/dev/null || true
    sleep 1
  fi
  rm -f "$BROWSER_PID_FILE"
fi

# Ensure Developer mode is enabled in the profile
"$ROOT_DIR/scripts/setup-chrome-profile.sh"

nohup "${CHROME}" \
  --remote-debugging-port="${PORT}" \
  --user-data-dir="${PROFILE_DIR}" \
  --load-extension="${EXTENSION_DIR}" \
  --disable-extensions-file-access-check \
  --enable-file-cookies \
  --allow-file-access-from-files \
  --disable-web-security \
  --disable-site-isolation-trials \
  >"${BROWSER_LOG}" 2>&1 &
BROWSER_PID=$!
echo $BROWSER_PID > "$BROWSER_PID_FILE"
echo "Launched Chrome (pid ${BROWSER_PID}), waiting for DevTools endpoint..."

for i in {1..40}; do
  if curl -fs "http://localhost:${PORT}/json/version" >/dev/null 2>&1; then
    break
  fi
  sleep 0.25
done

echo "Chrome ready. MCP clients will auto-start chrome-devtools-mcp (stdio) when needed."
echo "Browser log: ${BROWSER_LOG}"
