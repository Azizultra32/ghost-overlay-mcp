#!/usr/bin/env bash
# Use Chrome DevTools Protocol to directly check extension status

set -euo pipefail

PORT=9222

echo "=== Checking Chrome Extension via DevTools Protocol ==="
echo ""

# Get all targets
echo "All Chrome targets:"
curl -s "http://localhost:$PORT/json" | python3 -m json.tool | grep -E '"(type|url|title)"' | head -20

echo ""
echo "=== Checking for extension-related targets ==="
EXTENSION_COUNT=$(curl -s "http://localhost:$PORT/json" | grep -c 'chrome-extension://' || echo "0")
echo "Found $EXTENSION_COUNT extension-related pages"

if [ "$EXTENSION_COUNT" -eq 0 ]; then
  echo ""
  echo "❌ No extension pages found"
  echo ""
  echo "This means the extension is NOT loaded. Possible reasons:"
  echo "  1. Developer mode is OFF (you said you turned it ON)"
  echo "  2. Extension has errors preventing load"
  echo "  3. --load-extension flag path is wrong"
  echo "  4. Extension files are missing/invalid"
  echo ""
  echo "Checking extension directory:"
  ls -la /Users/ali/GHOST/*.{js,json,html} 2>/dev/null | head -10
  echo ""
  echo "Manifest content:"
  cat /Users/ali/GHOST/manifest.json
else
  echo "✅ Extension appears to be loaded"
  curl -s "http://localhost:$PORT/json" | python3 -c "
import sys, json
targets = json.load(sys.stdin)
for t in targets:
    if 'chrome-extension://' in t.get('url', ''):
        print(f\"  - {t.get('title', 'Unknown')}: {t['url']}\")
"
fi
