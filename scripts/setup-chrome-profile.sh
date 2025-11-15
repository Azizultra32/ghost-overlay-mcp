#!/usr/bin/env bash
# Pre-configure the Chrome profile to enable Developer mode permanently
# This ensures --load-extension works without manual intervention

set -euo pipefail

PROFILE_DIR="${MCP_PROFILE_DIR:-/tmp/chrome-mcp}"
PREFS_FILE="$PROFILE_DIR/Default/Preferences"

echo "=== Setting up Chrome profile with Developer mode enabled ==="

# Create profile directory structure if it doesn't exist
mkdir -p "$PROFILE_DIR/Default"

# Check if Preferences file exists
if [ -f "$PREFS_FILE" ]; then
  echo "Profile exists, enabling Developer mode..."

  # Use Python to safely modify JSON
  python3 <<EOF
import json
import sys

try:
    with open("$PREFS_FILE", "r") as f:
        prefs = json.load(f)
except:
    prefs = {}

# Enable Developer mode
if "extensions" not in prefs:
    prefs["extensions"] = {}

prefs["extensions"]["ui"] = {
    "developer_mode": True
}

# Also disable extension install warnings
prefs["extensions"]["install_warning_on_extensions_page_enabled"] = False

with open("$PREFS_FILE", "w") as f:
    json.dump(prefs, f, indent=2)

print("✅ Developer mode enabled in profile")
EOF

else
  echo "Creating new profile with Developer mode enabled..."

  # Create initial preferences with Developer mode ON
  cat > "$PREFS_FILE" <<'EOF'
{
  "extensions": {
    "ui": {
      "developer_mode": true
    },
    "install_warning_on_extensions_page_enabled": false
  }
}
EOF

  echo "✅ Profile created with Developer mode enabled"
fi

echo ""
echo "Profile configured at: $PROFILE_DIR"
echo "Developer mode will persist across Chrome restarts"
