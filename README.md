# AssistMD Ghost Overlay

Quick commands via the `word` helper:

```bash
./word ready        # stop -> codex-clean -> start -> status (one shot)
./word start        # kill stale Codex (unless WORD_AUTO_CODEX_CLEAN=0) + launch Chrome
./word status       # check the DevTools endpoint + Codex processes
./word codex-clean  # kill lingering `codex app-server` helpers
./word stop         # stop the Chrome profile + helpers
```

`./word start` launches Chrome with remote debugging on `http://localhost:9222`, isolated profile `/tmp/chrome-mcp`, and auto-loads the current extension source (no manual unpack/reload). MCP clients (Windsurf, Codex, Claude) will spawn `chrome-devtools-mcp` over stdio when they connect; you only need this Chrome instance running.

Logs: `/tmp/chrome-mcp-browser.log`. Set `MCP_PROFILE_DIR`, `MCP_DEBUG_PORT`, or `MCP_BROWSER_LOG` before running `word` if you need custom paths.
