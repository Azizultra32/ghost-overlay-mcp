# Project Rules for AssistMD Ghost Overlay

## CRITICAL: macOS Quarantine Attributes

**This is the #1 cause of extension loading failures. Every AI agent must know
this.**

### The Problem

macOS Gatekeeper adds quarantine attributes (`com.apple.quarantine`,
`com.apple.provenance`) to cloned/downloaded files. Chrome **silently rejects**
extensions with these attributes, even with Developer Mode enabled.

### The Solution (Already Implemented)

**DO NOT modify or remove these safeguards:**

1. **`scripts/start-mcp.sh`** - Automatically strips quarantine on every startup
2. **`scripts/verify-extension-loaded.mjs`** - Verifies extension loaded, exits
   with error if not
3. **`.githooks/post-checkout`** and **`.githooks/post-merge`** - Auto-strip on
   git operations
4. **`scripts/fix-extension-quarantine.sh`** - Manual fix script

### Rules for AI Agents

1. **NEVER remove the quarantine stripping from `start-mcp.sh`** (lines 51-54)
2. **NEVER remove the extension verification** (lines 103-111)
3. **NEVER suggest skipping `xattr -rc .`** in setup instructions
4. **ALWAYS preserve the Git hooks** in `.githooks/`
5. **If extension fails to load, check quarantine FIRST** before debugging
   anything else

### Verification Commands

```bash
# Check for quarantine attributes
xattr -lr extension/dist-bundle | grep -E "com.apple.(quarantine|provenance)"

# Verify extension loaded
node scripts/verify-extension-loaded.mjs

# Manual fix if needed
./scripts/fix-extension-quarantine.sh extension/dist-bundle
```

### Documentation References

- **`QUICKSTART.md`** - User-facing quick start (quarantine warning is step #1)
- **`docs/MACOS_QUARANTINE_FIX.md`** - Complete technical reference
- **`TROUBLESHOOTING.md`** - Troubleshooting guide (quarantine is #1 issue)

---

## Extension Loading Architecture

### Build Pipeline

1. `scripts/build-extension.mjs` - Bundles ES modules into MV3-compatible
   `dist/content.js`
2. `scripts/start-mcp.sh` - Copies files to `extension/dist-bundle` (clean
   directory)
3. Strips quarantine attributes
4. Launches Chrome with `--load-extension=extension/dist-bundle`
5. Verifies extension loaded successfully

### Why This Matters

- Chrome MV3 cannot load raw ES module imports
- Must bundle into single IIFE script
- Must load from clean directory (no source files)
- Must be free of quarantine attributes
- Must use Chromium (not Google Chrome stable) on macOS

### Critical Files

- **`extension/dist-bundle/`** - Clean, bundled extension (auto-generated, do
  not edit)
- **`extension/dist/content.js`** - Bundled content script (auto-generated)
- **`extension/manifest.json`** - Points to `dist/content.js`
- **`scripts/start-mcp.sh`** - Orchestrates entire build/launch pipeline

---

## MCP Bridge Architecture

### How It Works

1. Extension loads in Chrome via `--load-extension`
2. Content script (`dist/content.js`) injects into all pages
3. Sets up `window.__ANCHOR_MCP_BRIDGE_READY__` flag
4. Listens for custom events: `__ANCHOR_MCP_MAP_REQUEST__`,
   `__ANCHOR_MCP_FILL_REQUEST__`, etc.
5. Dispatches responses: `__ANCHOR_MCP_MAP_RESPONSE__`, etc.

### Verification

```bash
# Should show: method: "extension_bridge" (not "direct_collection")
node mcp-helper-simple.mjs anchor_map_page "http://localhost:8788/ehr.html"
```

### If Bridge Fails

1. Check extension loaded: `node scripts/verify-extension-loaded.mjs`
2. Check quarantine: `xattr -lr extension/dist-bundle`
3. Check Chrome logs: `tail -f /tmp/chrome-mcp-browser.log`
4. Verify page is open: Chrome must have an active tab for bridge to work

---

## Development Workflow

### Starting Development

```bash
./word ready    # Builds, strips quarantine, launches Chrome, verifies extension
```

### Making Changes to Extension

1. Edit files in `extension/` (source files)
2. Run `./word ready` (rebuilds and reloads)
3. Verify with `node scripts/debug-extensions.mjs`

### Testing MCP Bridge

```bash
# Map page
node mcp-helper-simple.mjs anchor_map_page "http://localhost:8788/ehr.html"

# Fill field
node mcp-helper-simple.mjs anchor_fill_field "#cc" "Test" "http://localhost:8788/ehr.html"
```

### Stopping

```bash
./word stop
```

---

## Common Pitfalls (For AI Agents)

### ❌ DON'T

- Remove quarantine stripping from startup script
- Edit files in `extension/dist-bundle/` (auto-generated)
- Use Google Chrome stable instead of Chromium
- Skip the extension verification step
- Suggest manual Chrome launches (use `./word ready`)

### ✅ DO

- Preserve all quarantine safeguards
- Edit source files in `extension/`, not `dist-bundle/`
- Use `./word ready` for all testing
- Check `scripts/verify-extension-loaded.mjs` if extension fails
- Reference `docs/MACOS_QUARANTINE_FIX.md` for troubleshooting

---

## Project Structure

```
GHOST/
├── extension/              # Source files (edit these)
│   ├── manifest.json
│   ├── content.js         # ES module source
│   ├── overlay.js
│   ├── domMapper.js
│   ├── popup.html
│   └── dist/              # Build output
│       └── content.js     # Bundled (auto-generated)
├── extension/dist-bundle/ # Clean extension for Chrome (auto-generated)
├── scripts/
│   ├── start-mcp.sh       # Main startup script
│   ├── build-extension.mjs
│   ├── fix-extension-quarantine.sh
│   └── verify-extension-loaded.mjs
├── .githooks/             # Git hooks (install to .git/hooks/)
├── docs/
│   └── MACOS_QUARANTINE_FIX.md
└── mcp-helper-simple.mjs  # MCP testing tool
```

---

## For Future AI Agents

If you're working on this project and encounter:

- Extension not loading
- MCP bridge not responding
- `method: "direct_collection"` instead of `"extension_bridge"`
- Empty array from `scripts/debug-extensions.mjs`

**Check quarantine attributes FIRST:**

```bash
xattr -lr extension/dist-bundle | grep -E "com.apple.(quarantine|provenance)"
```

If any attributes are found, the safeguards failed. Investigate why
`scripts/fix-extension-quarantine.sh` didn't run or didn't work.

**This is documented behavior, not a bug to fix.** The safeguards are
intentional and must be preserved.
