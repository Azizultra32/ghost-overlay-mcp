# Anchor Overlay v2.0 Walkthrough

This document outlines the new features and usage instructions for the **Anchor Overlay v2.0 (Antigravity Edition)**.

![Anchor Overlay v2.0 Mockup](/Users/ali/.gemini/antigravity/brain/dd7f7f04-5ae3-49dd-b0d5-708769ae3fd7/anchor_overlay_v2_mockup_1763591749198.png)

## Features Implemented

### 1. Anchor Overlay v2.0 UI/UX
- **Glassmorphism Design**: A modern, translucent dark-mode interface with blur effects (`backdrop-filter`).
- **Draggable FAB**: The "Anchor" toggle button is now a Floating Action Button that can be dragged anywhere on the screen.
- **Animations**: Smooth slide-in/fade-in transitions for the panel and hover states.
- **Tabbed Interface**: Organized into "Fields", "Notes", and "Settings" (mock tabs).

### 2. Smart Field Mapping Engine
- **Heuristic Scanning**: `domMapper.js` now uses regex-based keyword matching to identify common EMR fields (Patient Name, DOB, MRN, HPI, Plan, etc.).
- **Robust Selectors**: Generates unique CSS selectors for mapped inputs to ensure reliable interaction.
- **Visual Feedback**: The overlay lists mapped fields with their detected roles.

### 3. AssistMD Integration
- **Dictation Mode**: A new "Dictate" button (microphone icon) uses the Web Speech API to transcribe voice to text directly into the active input field.
- **Smart Fill**: Enhanced mock logic that populates fields with realistic patient data (e.g., "Alex Doe", "Acute Bronchitis") instead of generic placeholders.
- **Undo/Redo**: Robust undo functionality to revert Smart Fill changes.

### 4. Popup UI v2
- **Dashboard**: A separate `popup.html` page showing session stats (Pages Mapped, Time Saved) and recent activity.
- **Settings**: Toggles for Auto-Map, Dark Mode, and Sound Effects.

## How to Test

### Local Verification (Recommended)
1.  **Open `test.html`**:
    Open the `test.html` file in your browser. This file pre-loads the extension bundle and simulates an EMR environment with complex fields (tables, nested layouts).
    ```bash
    open test.html
    ```
2.  **Interact**:
    - Click the **Anchor FAB** (top right) to open the overlay.
    - Click **Map Page** to see the heuristic mapper identify the fields in the mock EMR.
    - Click **Smart Fill** to populate the fields with mock patient data.
    - Click **Dictate** and speak to test voice transcription (requires microphone permission).

### CDP Injection (Advanced)
You can also inject the extension into any active Chrome tab using the CDP scripts:
1.  Run the injection script:
    ```bash
    node scripts/inject-anchor-v2.mjs
    ```
2.  This will find an active page, inject the bundle, and you should see the Anchor FAB appear.

## Files
- `extension/overlay.js`: Core UI and logic.
- `extension/domMapper.js`: Heuristic mapping engine.
- `extension/popup.html`: Dashboard UI.
- `scripts/bundle.js`: Generated bundle for injection.
