#!/usr/bin/env bash
# Extension Quarantine Fix
# Strips macOS quarantine attributes that prevent Chrome from loading unpacked extensions
# This must run BEFORE Chrome starts

set -euo pipefail

EXTENSION_DIR="${1:-}"

if [ -z "$EXTENSION_DIR" ]; then
  echo "Usage: $0 <extension-directory>" >&2
  exit 1
fi

if [ ! -d "$EXTENSION_DIR" ]; then
  echo "Error: Directory not found: $EXTENSION_DIR" >&2
  exit 1
fi

echo "Stripping quarantine attributes from: $EXTENSION_DIR"

# Remove all extended attributes recursively
# -r: recursive
# -c: continue on error (don't fail if some files have no attributes)
xattr -rc "$EXTENSION_DIR" 2>/dev/null || true

# Verify attributes are gone
REMAINING=$(xattr -r "$EXTENSION_DIR" 2>/dev/null | wc -l | tr -d ' ')
if [ "$REMAINING" -eq 0 ]; then
  echo "✅ All quarantine attributes removed"
else
  echo "⚠️  Warning: $REMAINING attributes still present (this may be normal)"
fi
