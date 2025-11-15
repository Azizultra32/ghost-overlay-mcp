#!/usr/bin/env bash
# Nuclear option: Kill EVERYTHING and start completely fresh
# Use this when you suspect profile corruption or conflicting Chrome instances

set -euo pipefail

echo "=== NUCLEAR RESTART ==="
echo "This will kill ALL Chrome remote debugging instances and clean the profile"
echo ""

# Kill absolutely everything Chrome-related with remote debugging
echo "1. Killing all Chrome debugging instances..."
pkill -9 -f 'remote-debugging-port' || true
pkill -9 -f 'chrome-mcp' || true
sleep 2

# Clean ALL MCP profiles
echo "2. Cleaning all MCP profiles..."
rm -rf /tmp/chrome-mcp /tmp/anchor-mcp
mkdir -p /tmp/chrome-mcp

# Remove PID files
echo "3. Cleaning PID files..."
rm -f /Users/ali/GHOST/.chrome_mcp_*.pid

# Kill any lingering Codex processes (optional)
echo "4. Checking for stray Codex processes..."
CODEX_COUNT=$(pgrep -f 'codex app-server' | wc -l || echo "0")
if [ "$CODEX_COUNT" -gt 1 ]; then
  echo "   Found $CODEX_COUNT Codex processes, cleaning..."
  pkill -f 'codex app-server' || true
fi

echo ""
echo "✅ Everything cleaned"
echo ""
echo "5. Starting fresh..."
cd /Users/ali/GHOST
./word start

echo ""
echo "6. Verifying extension load..."
sleep 3
./check-extension.sh

echo ""
echo "=== DONE ==="
echo ""
echo "If extension still not loaded, run this in Codex CLI:"
echo "  cat /Users/ali/GHOST/CODEX_COMMAND.txt"
