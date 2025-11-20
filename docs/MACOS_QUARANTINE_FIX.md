# macOS Extension Quarantine Issue

## Problem

macOS Gatekeeper automatically adds `com.apple.provenance` quarantine attributes
to files created or modified in certain directories. When these attributes are
present on Chrome extension files, Chrome **silently rejects** the
`--load-extension` flag, causing the extension to fail to load with no error
message.

## Symptoms

- `./word ready` completes successfully
- Chrome launches with DevTools on port 9222
- `chrome://extensions` shows **no custom extension** (only built-in extensions
  like "Google Docs Offline")
- `node scripts/debug-extensions.mjs` returns `[]` or only built-in extensions
- No errors in `/tmp/chrome-mcp-browser.log`

## Root Cause

```bash
# Check for quarantine attributes
$ xattr -r extension/
extension/manifest.json: com.apple.provenance
extension/content.js: com.apple.provenance
extension/background.js: com.apple.provenance
# ... etc
```

## Solution

The `start-mcp.sh` script now implements a **3-layer defense**:

### 1. Bundle Directory (Isolation)

```bash
BUNDLE_DIR="$ROOT_DIR/extension/dist-bundle"
rsync -a --exclude 'dist-bundle' "$EXTENSION_SRC_DIR/" "$BUNDLE_DIR/"
```

- Creates a clean staging directory separate from source
- Prevents source file corruption

### 2. Quarantine Stripping (Fix)

```bash
"$ROOT_DIR/scripts/fix-extension-quarantine.sh" "$BUNDLE_DIR"
```

- Removes all extended attributes from bundle
- Dedicated script for clarity and reusability

### 3. Load Verification (Fail-Fast)

```bash
node "$ROOT_DIR/scripts/verify-extension-loaded.mjs"
```

- Confirms extension appears in `chrome://extensions`
- **Exits with error** if extension didn't load
- Prevents silent failures

## Manual Fix

If you encounter this issue in a different context:

```bash
# Strip quarantine from any directory
./scripts/fix-extension-quarantine.sh /path/to/extension

# Or manually
xattr -rc /path/to/extension
```

## Prevention

### For New Files

The bundle directory approach ensures new files are always clean.

### For Git Clones

If you clone this repo fresh, macOS may quarantine the entire directory:

```bash
# After cloning
cd /path/to/GHOST
xattr -rc .
```

### For Downloaded Archives

If you download a ZIP of this repo:

```bash
# After extracting
xattr -rc GHOST-main/
```

## Verification

After running `./word ready`, you should see:

```
✅ All quarantine attributes removed
✅ Extension verified: AssistMD Ghost Overlay (MVP) v0.0.2 (enabled)
```

If you see:

```
❌ FATAL: Extension failed to load!
```

Then the quarantine fix failed. Run manually:

```bash
./scripts/fix-extension-quarantine.sh extension/dist-bundle
```

## Technical Details

### Why Chrome Rejects Quarantined Extensions

Chrome's extension loader checks file attributes before loading unpacked
extensions. Files with quarantine attributes are treated as "untrusted" and
silently rejected for security reasons.

### Why This Only Affects macOS

Linux and Windows don't have an equivalent quarantine system. This issue is
**macOS-specific**.

### Why rsync Doesn't Strip Attributes

By default, `rsync -a` preserves extended attributes. We must explicitly strip
them after copying.

## Related Files

- `scripts/start-mcp.sh` - Main startup script with 3-layer defense
- `scripts/fix-extension-quarantine.sh` - Dedicated quarantine removal tool
- `scripts/verify-extension-loaded.mjs` - Post-launch verification
- `TROUBLESHOOTING.md` - User-facing troubleshooting guide

## History

This issue was discovered on 2025-11-20 after multiple failed attempts to load
the extension. The root cause was identified by running `xattr -r extension/`
and discovering quarantine attributes on all files.
