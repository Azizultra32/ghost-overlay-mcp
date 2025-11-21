# Ferrari Runbook: Fast, Non‑Stalling Dev Loop for Anti‑gravity + Chrome Extension

This runbook shows exactly where and how to apply stability/perf patches without
running any commands. You can copy/paste the snippets below into the indicated
files.

---

## 1) Agent Health Endpoint (fix docs mismatch and quick status checks)

File: `agent/src/server.ts`

Insert after the existing `app.get('/')` handler:

```ts
app.get("/health", async (_req: Request, res: Response) => {
    const llm = await checkLLMHealth();
    res.json({
        ok: true,
        llm,
        model: process.env.OPENAI_MODEL || "gpt-4o-mini",
    });
});
```

Why: Docs reference `/health`. This gives a fast “is LLM up?” check without
crashing scripts.

---

## 2) LLM: Cap tokens, truncate context, retry fast

A) Env settings (keep responses short and avoid stalls)

File: `agent/.env`

Add or adjust:

```
OPENAI_MAX_TOKENS=600
LLM_MAX_RETRIES=3
LLM_RETRY_DELAY_MS=500
LLM_MAX_CONTEXT_CHARS=8000
```

B) Code: add truncation helper and apply retries to field values too

File: `agent/src/llm.ts`

Add helper near the top (after OpenAI client init):

```ts
function truncateContext(
    s: string,
    maxChars: number = parseInt(process.env.LLM_MAX_CONTEXT_CHARS || "8000"),
): string {
    return typeof s === "string" && s.length > maxChars
        ? s.slice(0, maxChars)
        : s;
}
```

Update the SOAP note user message to use truncation:

```ts
{ role: 'user', content: `Generate a SOAP note from this page context:\n\n${truncateContext(context)}` }
```

Replace `generateFieldValue` with retry/backoff + truncation:

```ts
export async function generateFieldValue(
    fieldLabel: string,
    pageContext: string,
    previousFields?: Record<string, string>,
): Promise<string> {
    if (!process.env.OPENAI_API_KEY) {
        return `DEMO_${fieldLabel.toUpperCase().replace(/[^A-Z0-9]/g, "_")}`;
    }

    const maxRetries = parseInt(process.env.LLM_MAX_RETRIES || "3");
    const baseDelayMs = parseInt(process.env.LLM_RETRY_DELAY_MS || "500");
    const safeContext = truncateContext(pageContext);

    const attemptCall = async (attempt: number): Promise<string> => {
        try {
            const completion = await openai.chat.completions.create({
                model: process.env.OPENAI_MODEL || "gpt-4o-mini",
                temperature: 0.2,
                max_tokens: 100,
                messages: [
                    {
                        role: "system",
                        content:
                            'You are a form‑filling assistant. Extract or infer the value for a specific field based on page context. Return ONLY the value, nothing else. If you cannot determine a value, return "UNKNOWN".',
                    },
                    {
                        role: "user",
                        content:
                            `Field: ${fieldLabel}\nPage Context: ${safeContext}\n\nWhat value should this field have?`,
                    },
                ],
            });
            const value = completion.choices[0]?.message?.content?.trim() || "";
            return value === "UNKNOWN"
                ? `DEMO_${fieldLabel.toUpperCase().replace(/[^A-Z0-9]/g, "_")}`
                : value;
        } catch (error: any) {
            if (error.statusCode === 429 && attempt < maxRetries) {
                const delay = baseDelayMs * Math.pow(2, attempt - 1);
                console.warn(
                    `⚠️ OpenAI rate‑limit hit (field: ${fieldLabel}), retry ${attempt}/${maxRetries} after ${delay}ms`,
                );
                await new Promise((res) => setTimeout(res, delay));
                return attemptCall(attempt + 1);
            }
            console.error("OpenAI field value error:", error?.message || error);
            return `DEMO_${
                fieldLabel.toUpperCase().replace(/[^A-Z0-9]/g, "_")
            }`;
        }
    };

    return attemptCall(1);
}
```

Why: Fast fallbacks during quota windows; avoids long/gigantic prompts starving
output tokens.

---

## 3) Verify Extension: add bounded retries (no fail‑fast)

File: `scripts/verify-extension-loaded.mjs`

Wrap the call with a retry runner at the bottom of the file (replace the final
direct call):

```js
const RETRIES = parseInt(process.env.EXT_VERIFY_RETRIES || "5");
const WAIT_MS = parseInt(process.env.EXT_VERIFY_WAIT_MS || "1000");
(async () => {
    for (let i = 1; i <= RETRIES; i++) {
        try {
            await verifyExtension();
            process.exit(0);
        } catch (e) {
            console.error(
                `❌ Verification attempt ${i}/${RETRIES} failed:`,
                e?.message || e,
            );
            if (i < RETRIES) {
                await new Promise((r) => setTimeout(r, WAIT_MS));
                continue;
            }
            process.exit(1);
        }
    }
})();
```

Optional (nice‑to‑have): inside `verifyExtension()`, replace internal
`process.exit(1)` calls with `throw new Error('...')` so the wrapper manages
retries centrally.

Why: Stops “crash on first hiccup”; waits for chrome://extensions to be ready.

---

## 4) Overlay: fast timeouts for Agent calls

File: `extension/overlay.js`

A) Add helper near the top:

```js
function withTimeout(promise, ms = 1500) {
    return Promise.race([
        promise,
        new Promise((_, rej) =>
            setTimeout(() => rej(new Error("timeout")), ms)
        ),
    ]);
}
```

B) Use `withTimeout` for both agent calls:

- In `map` (inside `attachApi()`), replace fetch with:

```js
await withTimeout(
    fetch("http://localhost:8787/dom", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    }),
    1500,
);
```

- In `fill` (inside `attachApi()`), wrap the
  `fetch('http://localhost:8787/actions/fill', ...)` with
  `withTimeout(..., 2000)`.

Why: If Agent is offline/slow, the UI logs quickly and stays responsive.

---

## 5) Optional: “Ferrari” watch build for content script

File: `package.json`

Add a lightweight watch script (keeps release build as‑is):

```json
{
    "scripts": {
        "build:extension": "node scripts/build-extension.mjs",
        "build:watch": "esbuild extension/content.js --bundle --outfile=extension/dist/content.js --format=iife --platform=browser --target=chrome115 --sourcemap=inline --watch"
    }
}
```

Why: Instant rebuilds for content script tweaks during dev.

---

## Expected Outcome

- Scripts stop “crashing out” on transient timing; retries kick in
- Overlay never feels stuck waiting for agent; logs quickly
- LLM calls are fast, capped, and gracefully fall back during quota windows
- `/health` exists and matches docs for quick monitoring
- Faster iteration loop for content changes

---

## Rollback

All changes are local, small, and easy to revert:

- Remove the added blocks if any issue arises
- Restore the old bottom‑of‑file call in `verify-extension-loaded.mjs`
- Delete the few helper lines in `llm.ts` and `overlay.js`

---

Rules applied

- Error handling (retries, timeouts, graceful fallback)
- Chrome Extension (MV3) specifics
- Documentation alignment (/health)
- Shell integration safety (no commands)
- Plan/Act workflow (monitor-only guidance)
