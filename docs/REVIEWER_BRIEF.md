# Reviewer Brief: Ferrari Runbook Integration (Codex implement, Claude Code review)

Audience

- Codex: implement the patches exactly as specified
- Claude Code: verify safety, non-regression, and developer ergonomics

Objective

- Keep the Chrome-extension dev loop “Ferrari-fast” by failing soft under jitter
  and LLM quota while leaving the happy path unchanged.

TL;DR

- Add /health for non-invasive readiness checks
- Cap LLM output, truncate context, and retry on 429 with fast demo fallback on
  other errors
- Wrap brittle scripts with bounded retries instead of exiting on first hiccup
- Add short timeouts to overlay→agent fetches so the UI never appears stuck

What to change (and why)

1. Agent health endpoint

- File: agent/src/server.ts
- Add GET /health that returns { ok, llm, model } using checkLLMHealth().
- Why: Docs and scripts can probe LLM readiness without causing hard failures.

2. LLM guardrails

- File: agent/src/llm.ts
- Add truncateContext helper; use it in SOAP note and field value prompts.
- Set sane defaults via env: OPENAI_MAX_TOKENS≈600; add 429 exponential backoff
  for both functions; fall back to deterministic DEMO_* on non-429 errors.
- Why: Bound latency, avoid context-window starvation, and prevent mid-day
  stalls during quota windows.

3. Verify extension with retries

- File: scripts/verify-extension-loaded.mjs
- Convert internal process.exit(1) into throw and add a bottom-level retry
  runner (EXT_VERIFY_RETRIES, EXT_VERIFY_WAIT_MS).
- Why: Avoid “crash on first slow chrome://extensions.”

4. Overlay fetch timeouts

- File: extension/overlay.js
- Add withTimeout and wrap both agent fetches (dom: 1500ms, fill: 2000ms).
- Why: Surface agent slowness/offline as a quick log, not a perceived hang.

5. Optional dev speedup

- File: package.json
- Add build:watch with esbuild for content.js during development only.
- Why: Instant rebuild loop (non-breaking).

Where to review

- docs/FERRARI_RUNBOOK.md – copy/paste-ready blocks and rollback notes
- agent/src/server.ts – /health handler (no secret exposure)
- agent/src/llm.ts – truncation + backoff + fast fallback; OPENAI_MAX_TOKENS
  usage
- agent/.env.example – include: OPENAI_MAX_TOKENS=600, LLM_MAX_RETRIES=3,
  LLM_RETRY_DELAY_MS=500, LLM_MAX_CONTEXT_CHARS=8000
- scripts/verify-extension-loaded.mjs – wrapper retries then exits cleanly
- extension/overlay.js – withTimeout helper + wrapped fetches

Design principles (safety)

- Preserve happy path; adapt only transient failures
- Bound latency with timeouts and retries
- Idempotent retries (read-only checks, planning); execution remains user-driven
- No new permissions or CSP changes; keys remain server-side

Validation checklist (acceptance)

- /health returns { ok, llm, model } and nothing sensitive
- llm.ts truncates context; respects OPENAI_MAX_TOKENS; retries 429; fast demo
  fallback otherwise
- verify-extension retries exactly N times; proper exit code on final failure;
  no infinite loops
- overlay logs promptly on agent timeout/offline; no UI hang
- env defaults documented in agent/.env.example

Actions

- Codex (implement):
  - Apply each block exactly as in docs/FERRARI_RUNBOOK.md
  - Keep watch mode as dev-only; don’t alter release build
- Claude Code (review):
  - Confirm non-regression, secret safety, bounded waits, and developer
    ergonomics
  - Flag any long-blocking path or accidental error swallowing

Risks & mitigations

- Risk: Longer contexts still push limits → Mitigate with truncation and lower
  max tokens
- Risk: Script loops → Bounded retry counts and clear exit codes
- Risk: Perceived hangs → Timeouts with user-visible logs

Next steps after approval

- Land the patches, set env defaults, and run a quick smoke verification
- Optional: instrument a lightweight /metrics later if we need deeper
  observability

Rules applied

- Shell integration safety
- Chrome Extension MV3 specifics
- Error handling (retries, timeouts, graceful fallback)
- Documentation alignment (/health + runbook)
- Plan/Act workflow (Codex implements; Claude Code reviews)
