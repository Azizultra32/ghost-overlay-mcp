# Anchor Browser – Ghost Overlay POC

## Project Overview
Anchor Browser is an experimental Chrome Manifest V3 extension plus a local agent stack that renders a floating “Ghost” overlay on top of a demo EHR page. The goal is to exercise the full Ghost Spine locally: map inputs, send PHI-safe metadata to a local agent, and replay deterministic fill actions. The DOM mapper never transmits real patient values—only labels, selectors, roles, editable flags, and visibility—so the loop remains safe for PHI even when running against live-like forms.

## Components
- `extension/` – Chrome extension (content script, overlay UI, Ghost toggle button, manifest, TypeScript build) that injects the Ghost controls and handles Map → Send → Fill interactions.
- `agent/` – Node/Express agent on `http://localhost:8787` with `/dom` and `/actions/fill` endpoints; stores the latest DOM metadata and returns deterministic fill plans.
- `demo/` – Demo EHR HTML (served via `http://localhost:8788/ehr.html`) that acts as the safe charting surface.
- `scripts/` – Automation utilities (e.g., `check-toggle.mjs`, `smoke.mjs`, Chrome launch helpers) used by `word` and CI to verify the overlay.
- `word` – Bash orchestrator that boots Chrome with remote debugging, starts the agent and demo servers, waits for readiness, and surfaces status/log tails.

## Directory Layout
```
.
├── agent/                 # Express agent with /dom and /actions/fill (npm run dev)
├── demo/                  # demo/ehr.html + fixtures served on :8788
├── docs/                  # Architecture reference docs
├── extension/
│   ├── src/content.ts     # Content script entry for overlay + runtime messages
│   ├── src/overlay.ts     # Ghost overlay, buttons, Map/Send/Fill handlers
│   ├── src/domMapper.ts   # PHI-safe DOM mapper (metadata only)
│   └── build.mjs          # esbuild pipeline to extension/dist
├── logs/                  # Runtime logs captured by word
├── scripts/               # check-toggle.mjs, smoke.mjs, Chrome helpers
├── word                   # ./word ready|status orchestrator
├── tmux-monitor.sh        # Optional tmux helper for long-running sessions
└── package.json           # npm run smoke entry point
```

## Runtime & Ports
- Chrome DevTools: `localhost:9222` – remote-debuggable Chrome that auto-loads the unpacked extension.
- Agent: `http://localhost:8787` – Express API receiving DOM maps and returning fill plans.
- Demo server: `http://localhost:8788` – `python3 -m http.server` hosting `demo/ehr.html`.

## Usage
- `./word ready` – Launch Chrome with the extension, start the agent and demo servers, wait for all three ports, then confirm the Ghost toggle renders on the demo page.
- `./word status` – Print whether Chrome/agent/demo are running, rerun the toggle check, and tail the latest log lines from `logs/`.
- `npm run smoke` – Rebuild the extension, drive Chrome via CDP to load `ehr.html`, click Ghost → Map → Send Map → Fill (Demo), verify demo fields received the deterministic values, and print a `SMOKE PASS` JSON summary.
- Optional: `./tmux-monitor.sh` can keep Chrome/agent/demo panes visible for longer sessions, but it is not required for everyday development.

## Current Status / Phase
- Ghost Spine (extension + agent + demo) is implemented and passing `npm run smoke`.
- Toolbar popup controls exist but are still being expanded; document only the behaviors already present in the repo.
