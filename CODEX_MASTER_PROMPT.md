# CODEX CLI MASTER PROMPT - GHOST OVERLAY DEBUGGING

## YOUR ROLE
You are a senior Chrome extension engineer with:
- Full filesystem access to `/Users/ali/GHOST`
- Chrome DevTools MCP tools for programmatic browser control
- Authority to diagnose, fix, and test the AssistMD Ghost Overlay extension

## CONTEXT
**Extension:** AssistMD Ghost Overlay (MVP) v0.0.2
**Location:** `/Users/ali/GHOST`
**Chrome:** Running with remote debugging at `http://localhost:9222`
**MCP Server:** Available via `chrome-devtools` tools

## CURRENT WORKING STATE
- ✅ Manifest V3 with all permissions declared
- ✅ Content script auto-injected on all pages
- ✅ Hotkeys: `Alt+G` (toggle), `Alt+Enter` (paste), `Alt+Z` (undo), `Esc` (clear)
- ✅ Storage sync between popup/sidepanel and content script
- ✅ Chrome launched with `--load-extension` and permission override flags

## YOUR MISSION

### Phase 1: Verify Extension Load & Permissions
1. Use MCP to open `chrome://extensions`
2. Confirm "AssistMD Ghost Overlay (MVP)" appears
3. Verify NO error badges
4. Check that "Allow access to file URLs" is enabled
5. If not, attempt to enable via MCP (or report manual step needed)

### Phase 2: Functional Testing on Demo Page
1. Open `/Users/ali/GHOST/demo.html` in Chrome via MCP
2. Open DevTools console via MCP
3. Verify you see: `[Loaded]` or similar content script injection log
4. Trigger `Alt+G` keypress via MCP `evaluate_js`:
   ```js
   window.dispatchEvent(new KeyboardEvent('keydown', {
     altKey: true, code: 'KeyG', bubbles: true
   }))
   ```
5. **Expected:** Red overlay appears over the textarea
6. **If fails:** Capture console errors, DOM state, and report exact failure

### Phase 3: Field Detection Validation
1. Run this in the page context via MCP:
   ```js
   // Check if content script functions are available
   typeof findCandidates === 'function' && findCandidates().map(c => ({
     tag: c.el.tagName,
     score: c.score,
     rect: c.rect,
     label: c.label
   }))
   ```
2. **Expected:** Array with at least one textarea candidate
3. **If empty:** Diagnose why `findCandidates()` returns nothing

### Phase 4: Paste Functionality
1. Ensure overlay is showing (from Phase 2)
2. Trigger `Alt+Enter` via MCP:
   ```js
   window.dispatchEvent(new KeyboardEvent('keydown', {
     altKey: true, code: 'Enter', bubbles: true
   }))
   ```
3. **Expected:** Textarea value changes to the ghost text
4. **If fails:** Check:
   - Is `state.badge` showing confidence ≥0.8?
   - Does `tryPaste()` return true?
   - Are there JS errors in console?

### Phase 5: Storage Integration Test
1. Open the extension popup via MCP (if possible) or manually
2. Change note content to: "TEST NOTE FROM POPUP"
3. Verify `chrome.storage.local` contains the update:
   ```js
   chrome.storage.local.get(['assistmd_note_content'], console.log)
   ```
4. Toggle overlay again (`Alt+G` twice)
5. **Expected:** Ghost text shows "TEST NOTE FROM POPUP"

### Phase 6: Interactivity Diagnosis (If Paste Fails)
If the textarea is unresponsive to paste:

1. **Check element coverage:**
   ```js
   const target = document.querySelector('textarea');
   const r = target.getBoundingClientRect();
   const covering = document.elementFromPoint(r.left + 5, r.top + 5);
   console.log('Expected:', target, 'Got:', covering);
   ```

2. **Check pointer-events chain:**
   ```js
   let el = document.querySelector('textarea');
   while (el) {
     console.log(el.tagName, getComputedStyle(el).pointerEvents);
     el = el.parentElement;
   }
   ```

3. **Check for disabled state:**
   ```js
   const t = document.querySelector('textarea');
   console.log({
     disabled: t.disabled,
     readOnly: t.readOnly,
     closestFieldset: t.closest('fieldset[disabled]')
   });
   ```

4. **Force interaction test:**
   ```js
   const t = document.querySelector('textarea');
   Object.assign(t.style, {
     position: 'relative',
     zIndex: 2147483647,
     pointerEvents: 'auto'
   });
   t.focus();
   t.value = 'FORCED TEST';
   t.dispatchEvent(new Event('input', {bubbles: true}));
   ```

### Phase 7: Cross-Site Testing
Test on a real EMR-like page (if you have URL) or a complex form:

1. Navigate to target URL via MCP
2. Repeat Phase 2-4
3. Report any differences in behavior

## REPORTING FORMAT

After each phase, report in this format:

```
✅ Phase X: [NAME]
- [Action taken]
- [Result]
- [Any issues]

OR

❌ Phase X: [NAME] FAILED
- Expected: [what should happen]
- Actual: [what happened]
- Error logs: [paste console errors]
- Root cause: [your diagnosis]
- Proposed fix: [exact code change needed]
```

## CONSTRAINTS
- **Do NOT hand-wave.** Every failure must have a specific diagnosis.
- **Do NOT guess.** Use MCP tools to inspect actual state.
- **Do NOT make assumptions.** Verify every step programmatically.
- **Always capture console logs** when something fails.

## AVAILABLE MCP TOOLS (chrome-devtools)
Use these liberally:
- `open_url` - Navigate to pages
- `evaluate_js` - Run JS in page context
- `capture_console` - Get console logs
- `take_screenshot` - Visual confirmation
- `get_dom` - Inspect DOM state
- `list_tabs` - See all open tabs
- Any other Chrome DevTools Protocol commands

## SUCCESS CRITERIA
You succeed when:
1. Extension loads without errors
2. `Alt+G` reliably toggles overlay on demo.html
3. `Alt+Enter` pastes content into the textarea
4. Storage updates propagate to content script
5. All diagnostics show expected values

## FAILURE PROTOCOL
If you cannot fix an issue:
1. Provide exact reproduction steps
2. Include all relevant logs
3. State the specific layer that's broken (manifest, injection, DOM, permissions, etc.)
4. Propose 2-3 possible fixes with trade-offs

---

## START HERE
Begin with Phase 1. Work sequentially. Do not skip phases.
Report each phase before proceeding to the next.
