# Moses Commandments: Build the Chrome Extension at Ferrari Speed

Audience: Codex (implement), Claude Code (review). Zero runtime commands
here—only concrete, copy/paste doctrine for a non‑stalling dev loop and
predictable releases.

Commandment I — Health first, never guess

- Agent must expose GET /health returning: { ok, llm, model }.
- All automations should check /health before hitting LLM‑dependent flows.
- If llm=false, degrade to deterministic DEMO_* without failing tests.

Commandment II — Bound all latencies

- Overlay → Agent network calls must use short timeouts:
  - /dom POST: 1.5s
  - /actions/fill POST: 2.0s
- On timeout/offline, log and continue; never hang the UI.

Commandment III — Fail soft, then try again (bounded)

- scripts/verify-extension-loaded.mjs must retry N times (default 5), waiting 1s
  between attempts.
- Convert internal process.exit(1) to throw; let a single wrapper manage retries
  and final exit.

Commandment IV — Keep the LLM on a leash

- agent/src/llm.ts must:
  - Cap output: OPENAI_MAX_TOKENS=600 (dev default)
  - Truncate long context: LLM_MAX_CONTEXT_CHARS=8000
  - Retry rate limits with exponential backoff (3 attempts, 500ms base)
  - Demo fallback on any non‑429 error or missing key
- agent/.env.example must document:
  - OPENAI_MAX_TOKENS=600
  - LLM_MAX_RETRIES=3
  - LLM_RETRY_DELAY_MS=500
  - LLM_MAX_CONTEXT_CHARS=8000

Commandment V — Build fast, release predictable

- Keep esbuild as bundler for content.js; add a dev‑only watch script:
  - package.json → "build:watch": "esbuild extension/content.js --bundle
    --outfile=extension/dist/content.js --format=iife --platform=browser
    --target=chrome115 --sourcemap=inline --watch"
- Release builds must use scripts/build-extension.mjs (no watch, no accidental
  dev flags).

Commandment VI — Never be quarantined (macOS)

- Always run quarantine stripping on the packaged extension directory before
  load.
- scripts/fix-extension-quarantine.sh is the canonical tool; verification must
  fail hard if load doesn’t succeed after stripping.

Commandment VII — Verify, then open chrome://extensions

- Use scripts/verify-extension-loaded.mjs (with retries) to assert the extension
  exists and is enabled before continuing any automated flow.

Commandment VIII — Keep the bundle lean

- Soft budget: extension/dist/content.js ≤ 120 KB (unminified dev build).
- If exceeded, flag in PR review; investigate imports or dead code.

Commandment IX — MV3 compliance is sacred

- Background: service_worker must remain background.js (no page scripts).
- Content scripts: load from dist/content.js at document_idle; keep
  host_permissions minimal.
- No remote code, no eval, CSP intact.

Commandment X — Deterministic smoke, with demo fallback

- Smoke tests must pass whether LLM is up or not:
  - If LLM down → demo note/values, plan still generated, UI responsive
  - If LLM up → real note/values

Commandment XI — Observability without secrets

- /health is the only public readiness surface; no keys in responses, no token
  counts.
- Overlay logs must never include secrets; only status and counts.

Commandment XII — Single source of truth for patches

- docs/FERRARI_RUNBOOK.md is canonical for the exact code snippets.
- This document is the policy; the runbook is the implementation reference.

Do this now (Codex checklist)

- [ ] agent/src/server.ts: add GET /health using checkLLMHealth()
- [ ] agent/src/llm.ts: add truncateContext; cap tokens; add retry/backoff to
      generateFieldValue; demo fallback
- [ ] agent/.env.example: document OPENAI_MAX_TOKENS=600, LLM_MAX_RETRIES=3,
      LLM_RETRY_DELAY_MS=500, LLM_MAX_CONTEXT_CHARS=8000
- [ ] scripts/verify-extension-loaded.mjs: wrap verifyExtension with retries;
      convert internal exits to throw
- [ ] extension/overlay.js: add withTimeout; wrap /dom and /actions/fill calls
      (1.5s/2.0s)
- [ ] package.json: add "build:watch" (dev only)

Review this (Claude Code checklist)

- [ ] /health returns { ok, llm, model }—no secrets
- [ ] LLM truncation + capped tokens + retries behave as expected; demo fallback
      is fast and explicit
- [ ] Verifier retries exactly N times, proper exit codes, no infinite loops
- [ ] Overlay timeouts produce prompt logs; no visible hang
- [ ] Bundle size budget respected in typical changes

Golden path (reference flow)

1. Build: npm run build:extension (release) or npm run build:watch (dev loop)
2. Strip quarantine (macOS): scripts/fix-extension-quarantine.sh
   extension/dist-bundle
3. Verify load: node scripts/verify-extension-loaded.mjs (retries)
4. Interact: Open demo/ehr.html; overlay map → send → fill; if agent offline, UI
   stays responsive

Appendix: file map

- Policy: docs/MOSES_COMMANDMENTS.md (this doc)
- Implementation: docs/FERRARI_RUNBOOK.md
- Health: agent/src/server.ts (/health)
- LLM: agent/src/llm.ts
- Verifier: scripts/verify-extension-loaded.mjs
- Overlay: extension/overlay.js
- Env templates: agent/.env.example

Notes

- Optional dev watch is not required for release
- Keep changes minimal and surgical; don’t refactor unrelated code as part of
  this PR
- If any step conflicts with MV3 or CSP, review before merging
