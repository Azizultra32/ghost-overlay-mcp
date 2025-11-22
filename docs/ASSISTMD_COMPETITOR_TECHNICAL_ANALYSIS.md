# AssistMD Competitor Technical Analysis

## Mission

Investigate Chrome extensions (Nabla, Suki, Abridge, DeepScribe, etc.) and log architecture + feature deltas **without** wasting Antigravity tokens. Summaries feed into the live matrix in `docs/COMPETITOR_MATRIX.md`.

## Current Coverage

- ✅ **Nabla** – reverse-engineered bundle + manifest (see `nabla_feature_analysis.md`). Column added in `docs/COMPETITOR_MATRIX.md`.
- ⏳ **Next targets** – Suki AI, Abridge, DeepScribe. Add their IDs under `research/candidates/` and replicate the Nabla workflow.

### Nabla Snapshot (Nov 20 2024 capture – reference only)

Purpose: document what Nabla ships today so we can answer “how do others solve X?” without changing AssistMD’s look/feel. Use this as competitive intel, not as a to‑do list.

| Area | Observations | Notes / Follow‑ups |
| --- | --- | --- |
| **Architecture** | React + Vite SPA rendered inside its own iframe (`chrome-extension://…/index.html`). Uses Tailwind-like utility classes, Zag.js menus, Toastify toasts. | We stay Shadow DOM; iframe reference is purely for understanding isolation trade-offs. |
| **Audio pipeline** | AudioWorklet batches ~96 ms PCM frames, streams to backend; mic diagnostics + alert strings in bundle. | Mirrors our multi-feed plan; confirms batching intervals we can match when we implement. |
| **SOAP / note UX** | Single column with SUBJECTIVE/OBJECTIVE/ASSESSMENT/PLAN sections. Hover-only icons expose dictate, quick copy, “magic edit”, per-section preview. Split “Copy note” button + wand menu (regenerate, pronouns, template settings). | Useful for answering stakeholder questions about per-section actions. No UI changes planned unless explicitly approved. |
| **Translation / export** | Strings for “Translate & copy/export,” localization assets, Epic/Athena export flows, webhook/OAuth admin screens. | Shows breadth of enterprise integrations; capture endpoints before we scope similar work. |
| **Persistence** | Uses `chrome.storage` + IndexedDB fallback to recover sessions. | We already chose Supabase; keep this as alternative reference. |
| **Paywall / onboarding** | Trial-expired screen with pricing CTA, empty-state illustration, mic onboarding modal, drag-to-move anchor. | Captured DOM + screenshots for reference; reiterate that AssistMD styling remains unchanged. |
| **Open questions** | No DOM evidence yet for transcript timeline, template builder UI, or network schema for “magic edit”. | Need live session + network capture if we ever need deeper detail. |

Artifacts:
- `nabla_iframe_dom.html` – raw DOM snapshot from live encounter.
- `nabla_style_info.json` / `nabla_scripts.json` – stylesheets + script inventory.
- `nabla_feature_analysis.md` – detailed breakdown and links to hashed assets.
- `docs/prototypes/assistmd_overlay_prototype.html` – standalone HTML mock showing how optional hover controls + dropdowns would look while preserving the current AssistMD styling. Open in any browser; no build needed.

## Method

1. Use the scripts in `/Users/ali/GHOST/scripts/` that I already created:
   - `list-extensions.mjs` - Lists all installed extensions
   - `extract-nabla.mjs` - Extracts manifest and source files

2. For each new extension to analyze:
   ```bash
   # Run this to list extensions and get their IDs
   /usr/local/bin/node scripts/list-extensions.mjs

   # Then modify extract-nabla.mjs to target the new extension ID
   # Look for these lines and change the EXTENSION_ID and TARGET_ID
   ```

3. Key things to extract:
   - `manifest.json` (permissions, content scripts, web resources)
   - Main JS bundle (usually in `/assets/` or `/dist/`)
   - CSS files (for design tokens)

4. Grep patterns to search for features:
   ```bash
   # Find UI labels
   grep -oE ".{0,100}(transcript|template|prompt|copy|export).{0,100}" research/EXTENSION_NAME/bundle.js

   # Find API endpoints
   grep -oE "https://api\.[a-zA-Z0-9.-]+" research/EXTENSION_NAME/bundle.js

   # Find React/framework usage
   grep -oE "react|vue|svelte" research/EXTENSION_NAME/bundle.js | sort | uniq -c
   ```

## What to Document

Create a file like `research/EXTENSION_NAME/analysis.md` with:

- Architecture (Iframe vs Shadow DOM)
- Tech stack (React, Tailwind, etc.)
- Key features (from grep results)
- Unique capabilities we should consider

## Extensions Worth Investigating

1. Suki AI
2. Abridge
3. DeepScribe
4. Any other medical transcription extensions in Chrome Store
