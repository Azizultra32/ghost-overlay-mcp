# AssistMD Ghost Overlay - Quick Start

## ⚠️ CRITICAL FIRST STEP (macOS Only)

**Before anything else**, run this command in the project root:

```bash
xattr -rc .
```

This removes macOS quarantine attributes that prevent the extension from
loading. **Skip this and nothing will work.**

## Installation

```bash
npm install
```

## Usage

```bash
./word ready    # Start Chrome + extension + MCP server
./word stop     # Stop everything
./word status   # Check if running
```

## Verification

After `./word ready`, you should see:

```
✅ Extension loaded: AssistMD Ghost Overlay (MVP)
```

If you see `❌ FATAL: Extension failed to load!`, the quarantine fix didn't
work. Run:

```bash
./scripts/fix-extension-quarantine.sh extension/dist-bundle
./word ready
```

## Testing

```bash
# Test MCP bridge
node mcp-helper-simple.mjs anchor_map_page "http://localhost:8788/ehr.html"

# Should show: method: "extension_bridge" (not "direct_collection")
```

## Troubleshooting

See [TROUBLESHOOTING.md](TROUBLESHOOTING.md) for common issues.

**Most common issue:** macOS quarantine attributes blocking extension load.
**Solution:** Already automated in `./word ready`. See
[docs/MACOS_QUARANTINE_FIX.md](docs/MACOS_QUARANTINE_FIX.md) for details.
