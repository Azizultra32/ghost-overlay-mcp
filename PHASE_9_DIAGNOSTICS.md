# PHASE 9 – Non-Interactive Field Diagnostics

If any textarea or input cannot be clicked or focused, run these diagnostics in DevTools Console with the element selected as `$0`.

## Diagnostic Checklist

### 1. Coverage Check
**Purpose:** Detect if another element is covering the input field.

```javascript
const r = $0.getBoundingClientRect();
document.elementFromPoint(r.left + 5, r.top + 5)
```

**Expected:** Should return the input element itself.
**If different:** Note the CSS selector of the covering element — that element is blocking interaction.

---

### 2. Disabled Fieldset Check
**Purpose:** Check if the input is inside a disabled fieldset.

```javascript
$0.closest('fieldset[disabled]')
```

**Expected:** Should return `null`.
**If returns a node:** That disabled fieldset is preventing interaction.
**Fix:** Remove the `disabled` attribute from the fieldset, or move the input outside the disabled fieldset.

---

### 3. Pointer-Events Inheritance Check
**Purpose:** Detect if any ancestor has `pointer-events: none`.

```javascript
let el = $0;
while (el) {
  console.log(el, getComputedStyle(el).pointerEvents);
  el = el.parentElement;
}
```

**Expected:** All ancestors should have `pointer-events: auto` or `pointer-events: inherit`.
**If any ancestor has `pointer-events: none`:** Note which element.
**Fix:** Add `pointer-events: auto` to the smallest necessary ancestor or the input container.

---

### 4. Event Listeners Cancelling Default
**Purpose:** Detect if event listeners are preventing focus/interaction.

```javascript
getEventListeners($0)
getEventListeners($0.parentElement)
```

**Look for:** `mousedown`, `click`, `focus`, `pointerdown` handlers that call `preventDefault()` or otherwise block focus.

**Proof test:** Clone the node without listeners:

```javascript
const clone = $0.cloneNode(true);
$0.replaceWith(clone);
```

**If the clone is interactive:** The original listeners were the cause.
**Fix:** Remove or modify the problematic event listener.

---

### 5. Stacking Context Shove Test
**Purpose:** Test if a stacking context or z-index issue is blocking interaction.

```javascript
Object.assign($0.style, {
  position: 'relative',
  zIndex: 2147483647,
  pointerEvents: 'auto'
})
```

**If this restores interactivity:** A higher-level overlay/stacking context was blocking.
**Fix (proper):** Lower the z-index of the blocking element or set `pointer-events: none` on blocking overlay elements.
**Do NOT keep this hack** — identify and fix the actual blocking element.

---

## Reporting Requirements

For any non-interactive field issue, you MUST provide:

1. **Root Cause**
   Example: "textarea covered by `.overlay-backdrop` with `z-index: 9999`"

2. **Minimal Fix**
   Example: "Add `.overlay-backdrop { pointer-events: none; }` to CSS"
   OR "Remove `disabled` attribute from `<fieldset>` wrapping the textarea"

3. **Files Modified**
   List exact file paths and line numbers of changes made.

---

## Testing Locations

Run diagnostics on:
- `demo/ehr.html` (if it exists)
- `demo/simple.html`
- Any HTTP test page served locally
- Third-party pages (example.com, google.com) if issues arise
