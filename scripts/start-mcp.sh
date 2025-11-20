#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${MCP_DEBUG_PORT:-9222}"
PROFILE_DIR="${MCP_PROFILE_DIR:-/tmp/chrome-mcp}"
BROWSER_LOG="${MCP_BROWSER_LOG:-/tmp/chrome-mcp-browser.log}"
BROWSER_PID_FILE="${MCP_BROWSER_PID_FILE:-$ROOT_DIR/.chrome_mcp_browser.pid}"
EXTENSION_SRC_DIR="${MCP_EXTENSION_DIR:-$ROOT_DIR/extension}"
BUNDLE_DIR="$ROOT_DIR/extension/dist-bundle"
BUILD_SCRIPT="$ROOT_DIR/scripts/build-extension.mjs"
if [ -n "${CHROME_BINARY:-}" ]; then
  CHROME="${CHROME_BINARY}"
elif [ -x "/Applications/Chromium.app/Contents/MacOS/Chromium" ]; then
  CHROME="/Applications/Chromium.app/Contents/MacOS/Chromium"
else
  CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
fi

if ! command -v curl >/dev/null 2>&1; then
  echo "curl is required" >&2
  exit 1
fi

if [ ! -x "${CHROME}" ]; then
  echo "Chrome not found at ${CHROME}" >&2
  exit 1
fi

if [ ! -d "${EXTENSION_SRC_DIR}" ]; then
  echo "Extension directory not found: ${EXTENSION_SRC_DIR}" >&2
  exit 1
fi

# Ensure the MV3 bundle exists before launching Chrome
if [ -f "$BUILD_SCRIPT" ]; then
  echo "Building extension bundle..."
  if ! node "$BUILD_SCRIPT"; then
    echo "Extension build failed" >&2
    exit 1
  fi
fi

echo "Preparing packaged extension directory..."
rm -rf "$BUNDLE_DIR"
mkdir -p "$BUNDLE_DIR"
rsync -a \
  --exclude 'dist-bundle' \
  --exclude '.tsbuildinfo' \
  --exclude 'src' \
  --exclude 'node_modules' \
  "$EXTENSION_SRC_DIR/" "$BUNDLE_DIR/"

# CRITICAL: Strip macOS quarantine attributes that prevent Chrome from loading extensions
"$ROOT_DIR/scripts/fix-extension-quarantine.sh" "$BUNDLE_DIR"

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
  --load-extension="${BUNDLE_DIR}" \
  --disable-extensions-file-access-check \
  --enable-file-cookies \
  --allow-file-access-from-files \
  --disable-web-security \
  --disable-site-isolation-trials \
  --enable-logging=stderr \
  --v=1 \
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

# Enforce Developer Mode via CDP (fixes MV3 loading issues)
echo "Verifying Developer Mode status..."
if node "$ROOT_DIR/scripts/ensure-dev-mode.mjs"; then
  echo "Developer Mode verification passed."
else
  echo "WARNING: Failed to verify Developer Mode. Extension content scripts may not load."
fi

# CRITICAL: Verify the extension actually loaded
echo "Verifying extension loaded..."
if ! node "$ROOT_DIR/scripts/verify-extension-loaded.mjs"; then
  echo ""
  echo "❌ FATAL: Extension failed to load!"
  echo "This usually means macOS quarantine attributes were not properly stripped."
  echo "Try running: ./scripts/fix-extension-quarantine.sh extension/dist-bundle"
  exit 1
fi

# Open the demo page so injectors/MCP helpers have a tab to target
echo "Opening demo page in Chrome..."
curl -fs "http://localhost:${PORT}/json/new?url=http://localhost:8788/ehr.html" >/dev/null 2>&1 || true

echo "Browser log: ${BROWSER_LOG}"
