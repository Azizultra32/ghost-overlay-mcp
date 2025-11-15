# The Simple Fix

## The Problem
Chrome **ignores** `--load-extension` when Developer mode is OFF.

Our script tries to pre-enable it, but Chrome overwrites the preferences file on startup.

## The Solution (30 seconds of manual work, then never again)

1. **Run this:**
   ```bash
   ./word start
   ```

2. **Look for the Chrome window with "Chrome is being controlled by automated test software" banner**

3. **In THAT window, type in address bar:**
   ```
   chrome://extensions
   ```

4. **Click the "Developer mode" toggle** (top right corner)

5. **The extension will appear immediately** - no reload needed

6. **From now on**, Developer mode persists in that profile (`/tmp/chrome-mcp`)

## Why This Works

- Once you manually enable Developer mode ONCE in the `/tmp/chrome-mcp` profile
- Chrome remembers it forever for that profile
- Every future `./word start` will have it enabled
- The extension will auto-load every time

## Verify It Worked

```bash
./check-extension.sh
```

Should show: ✅ Extension pages detected

## After This One-Time Setup

Every time you code:
1. `./word start` - Extension loads automatically
2. Make changes to extension files
3. In Chrome (MCP instance), go to chrome://extensions
4. Click reload icon on the extension card
5. Test your changes

Or use Codex CLI to automate the reload via MCP tools.

---

**This is the fastest path forward.** 30 seconds of clicking beats hours of automation debugging.
