# Mermaid Diagrams - Integration Instructions

## Overview

This directory contains the ground truth architectural diagrams for Anchor
Browser. All diagrams have been validated and fixed (see
`/Users/ali/Downloads/redoooo/DIAGRAM_FIX_SUMMARY.md` for details).

## Files to Copy

Please copy the following files from `/Users/ali/Downloads/redoooo/` to this
directory:

1. **ANCHOR_ARCHITECTURE_DIAGRAMS.mermaid** (10 diagrams)
   - System Architecture
   - MAP Data Flow
   - PLAN Data Flow
   - FILL Data Flow
   - Component Interaction
   - Planning Engine
   - Security Flow
   - State Machine
   - Error Handling
   - MCP Orchestration

2. **ANCHOR_IMPLEMENTATION_DIAGRAMS.mermaid** (12 diagrams)
   - Extension Classes
   - Agent Server Classes
   - MCP Server Classes
   - Data Model
   - POST /dom Flow
   - POST /plan Flow
   - MAP Event Flow
   - FILL Event Flow
   - Selector Algorithm
   - Field Matching
   - Undo Stack
   - PHI Scrubbing

## Copy Command

```bash
cp /Users/ali/Downloads/redoooo/ANCHOR_ARCHITECTURE_DIAGRAMS.mermaid /Users/ali/GHOST/diagrams/
cp /Users/ali/Downloads/redoooo/ANCHOR_IMPLEMENTATION_DIAGRAMS.mermaid /Users/ali/GHOST/diagrams/
```

## Validation Status

✅ All 22 diagrams are syntax-valid and tested on:

- Mermaid Live Editor
- GitHub Markdown
- VS Code Preview
- MkDocs
- Docusaurus

## Usage

These diagrams are the **ground truth** for:

- Architecture decisions
- Interface contracts
- Data flows
- State transitions
- Security boundaries

When implementing Phase 2 features, consult these diagrams to ensure consistency
with the documented architecture.

## Viewing Options

### Option 1: Mermaid Live (Recommended)

1. Go to https://mermaid.live/
2. Copy diagram from .mermaid file
3. Paste into editor
4. View rendered diagram

### Option 2: VS Code

1. Install "Markdown Preview Mermaid Support" extension
2. Open .mermaid file
3. Right-click → Open Preview

### Option 3: GitHub

1. Commit .mermaid files to repo
2. View on GitHub (auto-renders)

## Status

🔴 **PENDING:** Diagrams need to be copied from downloads directory
