# Manual Test for Codex CLI with MCP

## IMPORTANT: Give this to Codex CLI

Paste this into Codex CLI to test the extension with MCP tools:

```
Use your chrome-devtools MCP tools to:

1. Open this URL: chrome://extensions
2. Take a screenshot
3. Report what extensions you see listed

Then:

4. Open this URL: file:///Users/ali/GHOST/demo.html
5. Wait 2 seconds
6. Capture console logs
7. Take a screenshot
8. Evaluate this JavaScript in the page:
   ```
   typeof findCandidates
   ```
9. Report the result

Then:

10. Dispatch this keyboard event:
    ```javascript
    window.dispatchEvent(new KeyboardEvent('keydown', {
      altKey: true,
      code: 'KeyG',
      bubbles: true
    }))
    ```
11. Wait 1 second
12. Take a screenshot
13. Report if you see a red overlay

Report all findings in a structured format.
```

## What This Tests

- Phase 1: Verify extension is visible in chrome://extensions
- Phase 2: Verify content script injected on demo.html
- Phase 3: Verify overlay toggle functionality

## Expected Results

1. Screenshot should show "AssistMD Ghost Overlay (MVP)" in extensions list
2. Console should be clean (no errors)
3. `typeof findCandidates` should return `"function"`
4. After Alt+G, red overlay should appear over textarea
