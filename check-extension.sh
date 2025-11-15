#!/usr/bin/env bash
# Quick diagnostic to check if AssistMD Ghost Overlay extension is loaded properly

set -euo pipefail

echo "=== Extension Load Check ==="
echo ""

# Check if Chrome is running with remote debugging
if ! curl -fs http://localhost:9222/json/version >/dev/null 2>&1; then
  echo "❌ Chrome DevTools not accessible. Run: ./word start"
  exit 1
fi

echo "✅ Chrome DevTools accessible"

# Get extension pages
EXT_PAGES=$(curl -s http://localhost:9222/json | jq -r '.[] | select(.url | startswith("chrome-extension://")) | .url')

if [ -z "$EXT_PAGES" ]; then
  echo "❌ No extension pages found - extension may not be loaded"
  echo ""
  echo "To fix:"
  echo "  1. Open chrome://extensions in the MCP Chrome instance"
  echo "  2. Verify 'AssistMD Ghost Overlay (MVP)' appears"
  echo "  3. Check for error badges"
  exit 1
fi

echo "✅ Extension pages detected:"
echo "$EXT_PAGES" | head -3

# Check content script on a test page
echo ""
echo "=== Checking Content Script Injection ==="

# Try to find a regular page
PAGE_ID=$(curl -s http://localhost:9222/json | jq -r '.[] | select(.type=="page" and (.url | startswith("http") or startswith("file:"))) | .id' | head -1)

if [ -z "$PAGE_ID" ]; then
  echo "⚠️  No regular pages open to test content script"
  echo "Open /Users/ali/GHOST/demo.html to test"
  exit 0
fi

PAGE_URL=$(curl -s http://localhost:9222/json | jq -r ".[] | select(.id==\"$PAGE_ID\") | .url")
echo "Testing on: $PAGE_URL"

# Try to evaluate if content script globals exist
RESULT=$(curl -s http://localhost:9222/json/new?$PAGE_URL | jq -r '.webSocketDebuggerUrl' | head -1)

if [ -z "$RESULT" ]; then
  echo "⚠️  Could not check content script directly"
  echo "Manually verify by:"
  echo "  1. Open $PAGE_URL"
  echo "  2. Open DevTools Console"
  echo "  3. Type: typeof findCandidates"
  echo "  4. Should see: 'function'"
else
  echo "✅ Can access page for testing"
fi

echo ""
echo "=== Quick Action Test ==="
echo "To verify the extension works:"
echo "  1. Open: file:///Users/ali/GHOST/demo.html"
echo "  2. Press: Alt+G"
echo "  3. Expected: Red overlay appears over textarea"
echo "  4. Press: Alt+G again to toggle off"
