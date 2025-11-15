#!/usr/bin/env bash
# Enable Developer mode in Chrome extensions page using DevTools Protocol
# This must run AFTER Chrome starts

set -euo pipefail

PORT=9222

echo "=== Enabling Developer Mode via DevTools Protocol ==="

# First, open chrome://extensions in a new tab
echo "1. Opening chrome://extensions..."
NEW_TAB=$(curl -s "http://localhost:$PORT/json/new?chrome://extensions")
TAB_ID=$(echo "$NEW_TAB" | python3 -c "import sys, json; print(json.load(sys.stdin)['id'])")

echo "   Tab ID: $TAB_ID"
sleep 2

# Get the WebSocket URL for this tab
WS_URL=$(curl -s "http://localhost:$PORT/json" | python3 -c "
import sys, json
tabs = json.load(sys.stdin)
for tab in tabs:
    if tab['id'] == '$TAB_ID':
        print(tab.get('webSocketDebuggerUrl', ''))
        break
")

if [ -z "$WS_URL" ]; then
  echo "❌ Could not get WebSocket URL for tab"
  exit 1
fi

echo "2. Connecting to tab via WebSocket..."

# Use Python to enable Developer mode via CDP
python3 <<'PYTHON_SCRIPT'
import asyncio
import websockets
import json
import sys

async def enable_dev_mode():
    ws_url = sys.argv[1] if len(sys.argv) > 1 else None
    if not ws_url:
        print("No WebSocket URL provided")
        return False

    try:
        async with websockets.connect(ws_url) as ws:
            # Enable Runtime domain
            await ws.send(json.dumps({"id": 1, "method": "Runtime.enable"}))
            await ws.recv()

            # Execute JavaScript to click the Developer mode toggle
            js_code = """
            (function() {
                try {
                    const toggle = document.querySelector('extensions-manager')
                        .shadowRoot.querySelector('extensions-toolbar')
                        .shadowRoot.querySelector('#devMode');

                    if (toggle && !toggle.checked) {
                        toggle.click();
                        return 'Developer mode enabled';
                    } else if (toggle && toggle.checked) {
                        return 'Developer mode already on';
                    } else {
                        return 'Toggle not found';
                    }
                } catch(e) {
                    return 'Error: ' + e.message;
                }
            })()
            """

            await ws.send(json.dumps({
                "id": 2,
                "method": "Runtime.evaluate",
                "params": {"expression": js_code, "returnByValue": True}
            }))

            response = await ws.recv()
            result = json.loads(response)

            if 'result' in result and 'result' in result['result']:
                message = result['result']['result'].get('value', 'Unknown')
                print(f"   Result: {message}")
                return 'enabled' in message.lower() or 'already on' in message.lower()
            else:
                print(f"   Unexpected response: {result}")
                return False

    except Exception as e:
        print(f"   Error: {e}")
        return False

# Run the async function
result = asyncio.run(enable_dev_mode())
sys.exit(0 if result else 1)

PYTHON_SCRIPT

if [ $? -eq 0 ]; then
  echo "✅ Developer mode enabled"
  echo ""
  echo "3. Now loading extension..."
  echo "   The extension should appear in chrome://extensions"
  echo ""
  echo "   Verify with: ./check-extension.sh"
else
  echo "❌ Failed to enable Developer mode automatically"
  echo ""
  echo "Manual steps:"
  echo "  1. Look for Chrome window with 'controlled by automated software' banner"
  echo "  2. In that window, navigate to: chrome://extensions"
  echo "  3. Click the Developer mode toggle (top right)"
  echo "  4. The extension should appear automatically"
fi
