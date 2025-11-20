#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
AGENT_DIR="$ROOT_DIR/agent"

echo "⚓️ Starting Anchor Stack..."

# 1. Kill everything
echo "💀 Killing stale processes..."
pkill -f "tsx watch src/server.ts" || true
pkill -f "anchor-ghost-agent" || true
"$ROOT_DIR/word" stop

# 2. Start Chrome
echo "🌐 Starting Chrome..."
"$ROOT_DIR/word" start &
sleep 2

# 3. Start Agent
echo "🧠 Starting Agent..."
cd "$AGENT_DIR"
npm run dev > "$ROOT_DIR/agent.log" 2>&1 &
AGENT_PID=$!
echo "Agent PID: $AGENT_PID"

echo "✅ Stack running!"
echo "   - Chrome: http://localhost:9222"
echo "   - Agent:  http://localhost:8787"
echo "   - Logs:   tail -f agent.log"
