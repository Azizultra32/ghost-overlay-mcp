#!/usr/bin/env bash
# Force a complete reload of Chrome with the extension
# This ensures --load-extension actually takes effect

set -euo pipefail

echo "=== Force Reload Extension ==="

# Kill ALL Chrome processes to ensure clean start
echo "Killing all Chrome processes..."
pkill -f '/tmp/chrome-mcp' || true
pkill -f 'remote-debugging-port=9222' || true
sleep 2

# Clean the profile to force fresh extension load
echo "Cleaning profile directory..."
rm -rf /tmp/chrome-mcp
mkdir -p /tmp/chrome-mcp

# Restart using word
echo "Starting Chrome with extension..."
./word start

echo ""
echo "✅ Chrome restarted"
echo ""
echo "Now run this to verify:"
echo "  ./check-extension.sh"
echo ""
echo "Or manually check:"
echo "  1. Look for Chrome window with 'controlled by automated software' banner"
echo "  2. Open: chrome://extensions"
echo "  3. Verify 'AssistMD Ghost Overlay (MVP)' is listed"
