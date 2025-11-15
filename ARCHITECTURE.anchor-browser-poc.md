# Anchor Browser Architecture

## High-Level Architecture
Anchor Browser pairs a Chrome MV3 extension with a local Express agent, a static demo EHR server, and a handful of automation scripts. The content script injects the Ghost overlay plus a DOM mapper that collects only metadata (labels, selectors, roles, editable/visible flags). That PHI-safe map is sent to the agent, which synthesizes deterministic fill plans that write demo values back into the page. The `word` script boots every component—Chrome with remote debugging, the agent, and the demo server—so developers can run the entire Ghost Spine locally without exposing real patient data.

## Code Structure
- `extension/src/content.ts` – Content-script entry point. Logs its injection, calls `initOverlay()`, and listens for runtime messages (`TOGGLE_OVERLAY`, `MAP`, `SEND_MAP`, `FILL_DEMO`) sent from the popup so keyboard shortcuts and popup buttons share the same behaviors.
- `extension/src/overlay.ts` – Implements the floating Ghost panel, toggle button, Map/Send/Fill buttons, logging pane, and undo buffer. Handles rendering field metadata, POSTing to the agent, executing fill plans, and wiring keyboard shortcuts (Ctrl/Cmd+Alt+G to toggle, Alt+Z undo).
- `extension/src/domMapper.ts` – Enumerates `input/textarea/select` elements, derives labels via ARIA/`label[for]`/placeholder/name, computes simple selectors, filters to visible/editable fields, and returns metadata objects without reading actual field values.
- `agent/src/server.ts` – Express server on port 8787 with `/` health, `/dom` (store latest map + count), and `/actions/fill` (build deterministic `setValue` actions). Prefers note-like fields for the pasted note content and otherwise fills remaining targets with `DEMO_*` placeholders.
- `demo/ehr.html` – Static intake form (patient name, DOB, chief complaint, select, read-only MRN) served via `python3 -m http.server 8788`. Provides the sandbox DOM for the extension and automation scripts.
- `scripts/check-toggle.mjs` – Chrome DevTools Protocol script that opens the demo page by connecting to `localhost:9222`, then polls for the Ghost toggle button to confirm the extension loaded correctly. Used by `word status/ready`.
- `scripts/smoke.mjs` – End-to-end smoke test invoked by `npm run smoke`. Rebuilds the extension, opens the demo page via CDP, clicks the Ghost toggle, runs Map → Send Map → Fill, inspects key DOM fields, and prints a JSON `SMOKE PASS` summary (or fails fast on missing elements).
- `word` – Orchestrator that ensures `extension/dist` exists, launches Chromium with the unpacked extension and DevTools on 9222, starts the agent (`npm run dev`) and demo server (`python3 -m http.server 8788`), waits for each service, runs `check-toggle`, and surfaces status/log tails.

## Runtime Flow (Ghost Spine)
1. Developer runs `./word ready`.
2. `word` confirms `extension/dist` is built, launches Chromium with remote debugging on `localhost:9222`, and records its PID/log.
3. `word` starts the agent via `npm run dev` (Express on port 8787) and the demo server via `python3 -m http.server 8788`.
4. The script polls each port (`/json/version`, `/`, `/`) until they respond, then executes `scripts/check-toggle.mjs`, which navigates to `http://localhost:8788/ehr.html` and verifies the `Ghost` floating button is present.
5. The clinician (or tester) clicks the Ghost button or uses Ctrl/Cmd+Alt+G; `extension/src/overlay.ts` mounts the panel inside `__anchor_ghost_overlay__`.
6. **Map** – `mapCurrentPage()` calls `mapDom()` to enumerate visible/editable fields and renders their metadata inside the overlay, logging the count.
7. **Send Map** – `sendCurrentMap()` POSTs `{ url, fields }` to `http://localhost:8787/dom`; the agent logs and returns `{ ok, fields }`.
8. **Fill (Demo)** – `fillDemoPlan()` POSTs `{ url, fields, note }` to `/actions/fill`; the agent responds with deterministic actions, which `executeFillPlan()` applies to the live DOM (dispatching `input`/`change` events and storing undo snapshots).
9. Alt+Z triggers undo, restoring the prior values for every selector touched in the last fill.

## Automation / Smoke Test Flow
1. `npm run smoke` (repo root) executes `scripts/smoke.mjs`.
2. The script first runs `npm run build` inside `extension/` so the unpacked `dist` assets are fresh.
3. It opens a new tab in the already running Chrome DevTools session (port 9222) and navigates to `http://localhost:8788/ehr.html`.
4. Using CDP Runtime eval, it asserts the Ghost toggle exists, clicks it, ensures the overlay host appears, and sequentially clicks `btnMap`, `btnSend`, and `btnFill` inside the shadow DOM.
5. After Fill completes, it reads DOM values (`#pt_name`, `#dob`, `#cc`) plus overlay log entries to confirm the agent plan executed.
6. On success it prints `SMOKE PASS { ... }`; if any element is missing or actions fail, the script throws and exits with a non-zero status so regressions fail fast.

## Design Principles
- **PHI Safety** – DOM mapping and automation capture only metadata; fill plans write deterministic demo strings (`DEMO_*`), ensuring no patient data ever leaves the page.
- **Separation of Concerns** – Extension handles UI/DOM interactions, the agent makes decisions, `demo/` provides fixtures, and automation scripts/`word` manage orchestration.
- **No Keyboard Dependency** – The floating Ghost button, toolbar popup, and runtime message handlers all trigger the same actions so clinicians are never forced to rely solely on hotkeys.
