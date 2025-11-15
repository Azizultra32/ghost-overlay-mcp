#!/usr/bin/env bash
# Force Chrome to grant all permissions to the GHOST extension
# This uses Enterprise Policy to bypass permission prompts

set -euo pipefail

GHOST_DIR="/Users/ali/GHOST"
EXTENSION_ID="YOUR_EXTENSION_ID_HERE"  # You'll get this from chrome://extensions after first load

# Chrome policy directory
POLICY_DIR="/Library/Managed Preferences"
POLICY_FILE="$POLICY_DIR/com.google.Chrome.plist"

# Create policy if needed
if [ ! -f "$POLICY_FILE" ]; then
  echo "Creating Chrome Enterprise Policy..."
  sudo mkdir -p "$POLICY_DIR"
fi

# Add extension to force-install list with all permissions
cat <<EOF | sudo tee "$POLICY_FILE"
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>ExtensionSettings</key>
  <dict>
    <key>$EXTENSION_ID</key>
    <dict>
      <key>installation_mode</key>
      <string>normal_installed</string>
      <key>runtime_allowed_hosts</key>
      <array>
        <string>*://*/*</string>
      </array>
      <key>runtime_blocked_hosts</key>
      <array/>
      <key>file_url_navigation_allowed</key>
      <true/>
    </dict>
  </dict>
</dict>
</plist>
EOF

echo "✅ Policy installed. Restart Chrome for it to take effect."
echo ""
echo "To get your EXTENSION_ID:"
echo "1. Run: ./word start"
echo "2. Open: chrome://extensions"
echo "3. Enable Developer Mode"
echo "4. Find 'AssistMD Ghost Overlay (MVP)'"
echo "5. Copy the ID (long alphanumeric string)"
echo "6. Edit this script and replace YOUR_EXTENSION_ID_HERE"
