# Extension Loading Troubleshooting

## ⚠️ CRITICAL: macOS Quarantine Attributes (Most Common Issue)

### Problem

Extension doesn't load even though `./word ready` completes successfully.
Running `node scripts/debug-extensions.mjs` shows `[]` or only built-in
extensions.

### Root Cause

macOS Gatekeeper adds `com.apple.provenance` quarantine attributes to files,
causing Chrome to **silently reject** the `--load-extension` flag.

### Solution

This is **automatically fixed** by `./word ready` via a 3-layer defense:

1. **Bundle directory** - Copies extension to clean staging area
   (`extension/dist-bundle`)
2. **Quarantine stripping** - Runs `scripts/fix-extension-quarantine.sh`
3. **Load verification** - Confirms extension loaded or **exits with error**

### If Automatic Fix Fails

```bash
# Manual fix
./scripts/fix-extension-quarantine.sh extension/dist-bundle

# Verify attributes are gone
xattr -r extension/dist-bundle
# Should output nothing

# Restart
./word ready
```

### See Also

- [docs/MACOS_QUARANTINE_FIX.md](docs/MACOS_QUARANTINE_FIX.md) - Full technical
  details

---

## Problem: Extension not loading despite --load-extension flag

### Other Root Causes

1. **Multiple Chrome instances on same port**
   - Chrome can't have two processes on `--remote-debugging-port=9222`
   - Always kill ALL instances before starting:
     ```bash
     pkill -f 'remote-debugging-port=9222'
     ./word start
     ```

2. **Developer mode must be enabled**
   - The `--load-extension` flag is IGNORED unless Developer mode is ON
   - We now auto-enable it via
     [scripts/setup-chrome-profile.sh](scripts/setup-chrome-profile.sh)
   - Verify with: Open `chrome://extensions` and check the toggle

3. **Profile conflicts**
   - `/tmp/chrome-mcp` vs `/tmp/anchor-mcp` vs other profiles
   - Stick to ONE profile per debugging session
   - Clean with: `rm -rf /tmp/chrome-mcp` then restart

### Automated Fixes Applied

- ✅ [scripts/setup-chrome-profile.sh](scripts/setup-chrome-profile.sh) -
  Pre-enables Developer mode
- ✅ [scripts/start-mcp.sh](scripts/start-mcp.sh#L37-38) - Runs setup
  automatically
- ✅ Permission override flags added (line 44-48)
- ✅ [./word](word) command kills stray processes before starting

### Manual Verification (if automation fails)

1. Look for Chrome window with "controlled by automated software" banner
2. In that window, open: `chrome://extensions`
3. Verify:
   - Developer mode toggle is **ON** (top right)
   - "AssistMD Ghost Overlay (MVP)" appears in list
   - NO error badges on the extension card

4. If extension missing:
   ```bash
   # Check what Chrome was told to load
   ps aux | grep load-extension

   # Should see: --load-extension=/Users/ali/GHOST
   ```

5. If extension has errors:
   - Click "Errors" button
   - Check console for manifest/syntax errors
   - Verify all files exist: `ls /Users/ali/GHOST/*.{js,json,html}`

### Using Antigravity Browser for Automated Checks

Instead of manual verification, use Antigravity Browser with MCP:

```
Use chrome-devtools MCP to navigate to chrome://extensions, take a screenshot, and report if "AssistMD Ghost Overlay (MVP)" is listed and if Developer mode is enabled.
```

This automates the entire verification process.
