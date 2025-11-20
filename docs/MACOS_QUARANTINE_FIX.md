# macOS Quarantine Attributes - Complete Technical Reference

## Problem Overview

macOS Gatekeeper automatically adds **quarantine attributes** to files
downloaded from the internet or cloned from Git repositories. These attributes
cause Chrome to **silently reject** the `--load-extension` flag, making unpacked
extensions fail to load with zero error messages.

## Root Cause

When you clone a Git repository or download files on macOS, the system adds
extended attributes:

- `com.apple.quarantine` - Marks file as "untrusted"
- `com.apple.provenance` - Tracks where the file came from

Chrome's security model treats quarantined files as potentially dangerous and
refuses to load them as extensions, even with Developer Mode enabled.

## Symptoms

1. `./word ready` completes successfully
2. Chrome launches normally
3. `chrome://extensions` shows **no extension** or only built-in extensions
4. `node scripts/debug-extensions.mjs` returns `[]`
5. **No error messages anywhere** - Chrome fails silently

## Our Multi-Layer Defense System

### Layer 1: Automatic Stripping on Startup

**File:** `scripts/start-mcp.sh` (lines 51-54)

```bash
# CRITICAL: Strip macOS quarantine attributes
"$ROOT_DIR/scripts/fix-extension-quarantine.sh" "$BUNDLE_DIR"
```

Every time you run `./word ready`, the startup script:

1. Builds the extension bundle
2. Copies files to `extension/dist-bundle`
3. **Automatically strips quarantine attributes**
4. Launches Chrome with the clean bundle

### Layer 2: Load Verification

**File:** `scripts/start-mcp.sh` (lines 103-111)

```bash
# CRITICAL: Verify the extension actually loaded
if ! node "$ROOT_DIR/scripts/verify-extension-loaded.mjs"; then
  echo "❌ FATAL: Extension failed to load!"
  exit 1
fi
```

After Chrome starts, we verify the extension loaded successfully. If it didn't,
the script **exits with an error** instead of silently continuing.

### Layer 3: Git Hooks (Auto-Fix on Clone/Pull)

**Files:** `.githooks/post-checkout`, `.githooks/post-merge`

Install once:

```bash
cp .githooks/post-checkout .git/hooks/post-checkout
cp .githooks/post-merge .git/hooks/post-merge
chmod +x .git/hooks/post-*
```

Now every time you:

- Clone the repository
- Switch branches (`git checkout`)
- Pull changes (`git pull`)

The hooks automatically strip quarantine attributes from the entire repository.

### Layer 4: Manual Fix Script

**File:** `scripts/fix-extension-quarantine.sh`

If you ever need to manually fix quarantine issues:

```bash
./scripts/fix-extension-quarantine.sh extension/dist-bundle
```

This script:

1. Recursively removes all extended attributes
2. Verifies they're gone
3. Exits with error if any remain

## Verification Commands

### Check for Quarantine Attributes

```bash
# Check entire repository
xattr -lr . | grep -E "com.apple.(quarantine|provenance)"

# Check extension bundle specifically
xattr -lr extension/dist-bundle | grep -E "com.apple.(quarantine|provenance)"
```

If this returns **nothing**, you're clean. If it shows attributes, run:

```bash
xattr -rc .
```

### Verify Extension Loaded

```bash
node scripts/verify-extension-loaded.mjs
```

Should output:

```
✅ Extension loaded: AssistMD Ghost Overlay (MVP)
```

### Check Extension in Chrome

```bash
node scripts/debug-extensions.mjs
```

Should show:

```json
[
  {
    "name": "AssistMD Ghost Overlay (MVP)",
    "version": "0.0.2",
    "enabled": true,
    ...
  }
]
```

## Why This Happens

1. **Git Clone:** When you `git clone`, macOS marks all files as quarantined
2. **File Downloads:** Downloaded ZIP files are automatically quarantined
3. **File Copies:** Sometimes even copying files between directories preserves
   attributes
4. **Chrome Security:** Chrome refuses to load quarantined extensions for
   security

## The Nuclear Option

If all else fails:

```bash
# Kill Chrome completely
pkill -9 Chrome
pkill -9 Chromium

# Strip everything
xattr -rc .

# Clean profile
rm -rf /tmp/chrome-mcp

# Restart
./word ready
```

## Prevention Checklist

✅ **On First Clone:**

```bash
git clone <repo>
cd GHOST
xattr -rc .  # Strip quarantine immediately
```

✅ **Install Git Hooks:**

```bash
cp .githooks/* .git/hooks/
chmod +x .git/hooks/post-*
```

✅ **Verify Startup Script:**

```bash
grep -A 2 "fix-extension-quarantine" scripts/start-mcp.sh
# Should show the quarantine fix is enabled
```

✅ **Test Extension Loading:**

```bash
./word ready
# Should end with: ✅ Extension loaded: AssistMD Ghost Overlay (MVP)
```

## References

- [Apple Technical Note TN2206](https://developer.apple.com/library/archive/technotes/tn2206/_index.html) -
  Quarantine attributes
- [Chrome Extension Security](https://developer.chrome.com/docs/extensions/mv3/security/) -
  Why Chrome blocks quarantined files
- Our implementation: `scripts/fix-extension-quarantine.sh`

## Summary

This issue is **completely automated away** in this project. You should never
encounter it if:

1. You run `./word ready` (not manual Chrome launches)
2. The startup script completes without errors
3. You see the verification message: `✅ Extension loaded`

If you do encounter it, the startup script will **fail loudly** with clear
instructions instead of silently continuing with a broken setup.
