# AssistMD Ghost Overlay

## ⚠️ macOS Users: First-Time Setup

After cloning this repo, run this **once** to prevent extension loading issues:

```bash
xattr -rc .
```

**Optional:** Install Git hook to auto-strip quarantine on future checkouts:

```bash
cp .githooks/post-checkout .git/hooks/post-checkout
chmod +x .git/hooks/post-checkout
```

This removes macOS quarantine attributes that would prevent the Chrome extension
from loading. The startup script (`./word ready`) handles this automatically for
the extension bundle, but running it on the entire repo ensures no issues.

**Why?** macOS Gatekeeper marks downloaded/cloned files as "untrusted," causing
Chrome to silently reject unpacked extensions. See
[docs/MACOS_QUARANTINE_FIX.md](docs/MACOS_QUARANTINE_FIX.md) for details.

---

## Quick Start

```bash
./word ready        # stop -> start -> status (one shot)
./word start        # launch Chrome
./word status       # check the DevTools endpoint
./word stop         # stop the Chrome profile + helpers
```

`./word start` launches Chrome with remote debugging on `http://localhost:9222`,
isolated profile `/tmp/chrome-mcp`, and auto-loads the current extension source
(no manual unpack/reload). MCP clients (Windsurf, Antigravity Browser, Claude)
will spawn `chrome-devtools-mcp` over stdio when they connect; you only need
this Chrome instance running.

Logs: `/tmp/chrome-mcp-browser.log`. Set `MCP_PROFILE_DIR`, `MCP_DEBUG_PORT`, or
`MCP_BROWSER_LOG` before running `word` if you need custom paths.

## AI Concierge / Voice Control

Anchor is designed so clinicians can speak intent (“paste yesterday’s vitals
into the note”, “open the referral popup and fill it”) and let the AI execute
that workflow locally. The secure flow is:

1. **Local speech capture** – a desktop mic feeds a local speech-to-text helper
   (no audio ever leaves the machine).
2. **Command transcription** – the transcript is sent to the existing MCP tools
   (`anchor_map_page`, `anchor_plan_fill`, `anchor_execute_fill`, plus any
   custom task macros).
3. **Execution** – the same Map → Plan → Execute pipeline runs, logging every
   action, honoring undo, and respecting the Ferrari/Moses guardrails.

Because the transcription happens locally and only text hits the MCP toolchain,
PHI stays on-box while doctors get full “concierge” control over their EMR.
Voice is just another input surface—the JSON tools remain the single control
plane for automation.
