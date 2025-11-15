/* Ghost Overlay MVP (no PHI) */
// Note content will be loaded from storage
let currentNoteContent = "Demo clinical note.\nVitals stable.\nPlan: follow-up in 2 weeks.";
let undoStack = []; // Store previous values for undo functionality

// Storage key
const STORAGE_KEY = 'assistmd_note_content';

const root = document.createElement('div');
Object.assign(root.style, {
  position: 'fixed',
  inset: '0',
  pointerEvents: 'none',
  zIndex: 2147483647,
  fontFamily: 'ui-monospace',
  background: 'transparent'
});
root.setAttribute('aria-hidden', 'true');
root.setAttribute('role', 'presentation');
document.documentElement.appendChild(root);

let state = null; // {el, text, box, badge, txt}

function cssEscape(value) {
  if (window.CSS && CSS.escape) return CSS.escape(value)
  return String(value).replace(/[^a-zA-Z0-9_\-]/g, '\\$&')
}

function buildSimpleSelector(el) {
  if (el.id) return '#' + cssEscape(el.id)
  const parts = []
  let node = el
  while (node && node.nodeType === 1 && parts.length < 5) {
    let part = node.tagName.toLowerCase()
    const parent = node.parentElement
    if (parent) {
      const siblings = [...parent.children].filter(child => child.tagName === node.tagName)
      if (siblings.length > 1) {
        part += `:nth-of-type(${siblings.indexOf(node) + 1})`
      }
    }
    parts.unshift(part)
    node = parent
  }
  return parts.join(' > ')
}

function labelForElement(el) {
  if (!el) return ''
  const aria = el.getAttribute('aria-label')
  if (aria) return aria
  const placeholder = el.getAttribute('placeholder')
  if (placeholder) return placeholder
  if (el.id) {
    const match = document.querySelector(`label[for="${cssEscape(el.id)}"]`)
    if (match) return match.textContent?.trim() || ''
  }
  const closestLabel = el.closest('label')
  if (closestLabel) return closestLabel.textContent?.trim() || ''
  const nameAttr = el.getAttribute('name')
  if (nameAttr) return nameAttr
  return el.tagName.toLowerCase()
}

function roleForElement(el) {
  if (!el) return 'textbox'
  if (el.getAttribute('role')) return el.getAttribute('role')
  const tag = el.tagName.toLowerCase()
  if (tag === 'textarea') return 'textarea'
  if (tag === 'select') return 'combobox'
  if (tag === 'input') return el.getAttribute('type') || 'textbox'
  if (el.isContentEditable) return 'textbox'
  return tag
}

function snapshotFields() {
  return findCandidates().map(c => ({
    selector: buildSimpleSelector(c.el),
    label: labelForElement(c.el) || c.label || 'field',
    role: roleForElement(c.el),
    editable: isEditable(c.el),
    visible: isVisible(c.el)
  }))
}

// Load note content from storage on initialization
async function loadNoteContent() {
  try {
    const result = await chrome.storage.local.get([STORAGE_KEY]);
    const savedContent = result[STORAGE_KEY];
    if (savedContent && savedContent.trim()) {
      currentNoteContent = savedContent;
    }
  } catch (error) {
    console.error('AssistMD: Failed to load note content', error);
  }
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'NOTE_CONTENT_UPDATED') {
    currentNoteContent = request.content || "Demo clinical note.\nVitals stable.\nPlan: follow-up in 2 weeks.";
    // If overlay is currently showing, update it with new content
    if (state) {
      drawGhost(state.el, currentNoteContent, parseFloat(state.badge.textContent.split(' ').pop()) || 0.0);
    }
  }
});

function isEditable(el) {
  if (!el) return false;
  if (el.matches('textarea,input[type="text"],input[type="search"]')) return !el.disabled && !el.readOnly;
  return el.isContentEditable === true || el.getAttribute('role') === 'textbox';
}
function isVisible(el) {
  const r = el.getBoundingClientRect();
  const cs = getComputedStyle(el);
  return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none';
}
function nearestLabelOrHeading(el) {
  let n = el; let hops = 0;
  while (n && hops < 8) {
    n = n.previousElementSibling; hops++;
    if (!n) break;
    const t = (n.textContent || '').trim();
    if (t && t.length < 120 && /note|progress|clinical|encounter|subjective|hpi/i.test(t)) return t;
    if (/H[1-6]/.test(n.tagName)) return t;
    if (n.tagName === 'LABEL') return t;
  }
  return '';
}
function findCandidates(doc = document) {
  const nodes = [...doc.querySelectorAll('textarea,[contenteditable="true"],[role="textbox"]')]
    .filter(n => isEditable(n) && isVisible(n));
  const scored = nodes.map(n => {
    const r = n.getBoundingClientRect();
    const label = nearestLabelOrHeading(n);
    let score = 0;
    if (label) score += 0.4;
    if (r.height > 200 && r.width > 300) score += 0.3;
    if (n.matches('textarea') || n.isContentEditable) score += 0.2;
    return { el: n, rect: r, label, score };
  }).sort((a, b) => b.score - a.score);
  // include same-origin iframes
  for (const ifr of document.querySelectorAll('iframe')) {
    try {
      const idoc = ifr.contentDocument;
      if (!idoc) continue;
      const inner = findCandidates(idoc);
      inner.forEach(c => {
        const fr = ifr.getBoundingClientRect();
        c.rect = new DOMRect(c.rect.left + fr.left, c.rect.top + fr.top, c.rect.width, c.rect.height);
        scored.push(c);
      });
    } catch (_) { }
  }
  return scored.sort((a, b) => b.score - a.score);
}

function drawGhost(target, text, score) {
  clearGhost();
  const r = target.getBoundingClientRect();
  root.style.background = 'rgba(255,0,0,0.12)';
  const box = document.createElement('div');
  Object.assign(box.style, {
    position: 'absolute',
    left: `${r.left}px`,
    top: `${r.top}px`,
    width: `${r.width}px`,
    height: `${r.height}px`,
    border: '1px dashed rgba(255,0,0,0.6)',
    background: 'rgba(255,215,0,0.28)',
    pointerEvents: 'none'
  });
  box.setAttribute('aria-hidden', 'true');

  const txt = document.createElement('div');
  Object.assign(txt.style, {
    position: 'absolute', left: `${r.left}px`, top: `${r.top}px`,
    width: `${r.width}px`, height: `${r.height}px`, padding: '6px',
    whiteSpace: 'pre-wrap', opacity: '0.6', color: 'red', lineHeight: '1.35',
    overflow: 'hidden', background: 'transparent', fontSize: '12px',
    pointerEvents: 'none'
  });
  txt.setAttribute('aria-hidden', 'true');
  txt.textContent = text;

  const badge = document.createElement('div');
  Object.assign(badge.style, {
    position: 'absolute', left: `${r.right - 72}px`, top: `${r.top - 18}px`,
    background: score >= 0.8 ? '#198754' : '#b98100', color: '#fff',
    fontSize: '11px', padding: '2px 6px', borderRadius: '10px',
    pointerEvents: 'none'
  });
  badge.setAttribute('aria-hidden', 'true');
  badge.textContent = `NOTE ${score.toFixed(2)}`;

  root.appendChild(box); root.appendChild(txt); root.appendChild(badge);
  state = { el: target, text, box, badge, txt };
}

function performUndo() {
  if (undoStack.length === 0) {
    console.warn('AssistMD: No actions to undo');
    return;
  }

  const lastAction = undoStack.pop();
  if (lastAction && lastAction.element && lastAction.previousValue !== undefined) {
    const el = lastAction.element;
    if (el.matches('textarea,input')) {
      el.focus();
      el.value = lastAction.previousValue;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    } else if (el.isContentEditable) {
      el.focus();
      el.innerText = lastAction.previousValue;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
    console.log('AssistMD: Undo successful ↶');
  }
}

function clearGhost() {
  if (!state) return;
  [state.box, state.badge, state.txt].forEach(n => n && n.remove());
  root.style.background = 'transparent';
  state = null;
}
function readValue(el) {
  if (el.matches('textarea,input')) return el.value || '';
  if (el.isContentEditable) return el.innerText || '';
  return '';
}
function tryPaste(el, text) {
  if (el.matches('textarea,input')) {
    el.focus(); const before = el.value || '';
    el.value = text; el.dispatchEvent(new Event('input', { bubbles: true }));
    return readValue(el).length >= Math.floor(text.length * 0.9) && readValue(el) !== before;
  }
  if (el.isContentEditable) {
    el.focus();
    const ok = document.execCommand('insertText', false, text);
    if (!ok) {
      const sel = window.getSelection(); sel.removeAllRanges();
      const range = document.createRange(); range.selectNodeContents(el);
      sel.addRange(range); document.execCommand('delete', false, null);
      document.execCommand('insertText', false, text);
    }
    return readValue(el).length >= Math.floor(text.length * 0.9);
  }
  return false;
}

function toggleOverlay() {
  if (state) { clearGhost(); return; }
  const cands = findCandidates();
  if (!cands.length) { console.warn('AssistMD: no editable note field'); return; }
  drawGhost(cands[0].el, currentNoteContent, cands[0].score);
}

// keep alignment on scroll/resize
function realign() {
  if (!state) return;
  drawGhost(state.el, state.text, parseFloat(state.badge.textContent.split(' ').pop()) || 0.0);
}
window.addEventListener('scroll', realign, { passive: true });
window.addEventListener('resize', realign, { passive: true });

// Hotkeys
window.addEventListener('keydown', (e) => {
  if (e.altKey && e.code === 'KeyG') { e.preventDefault(); toggleOverlay(); }
  if (e.altKey && e.code === 'Enter') {
    e.preventDefault();
    if (!state) return;
    const conf = parseFloat(state.badge.textContent.split(' ').pop()) || 0.0;
    if (conf < 0.8) { console.warn('AssistMD: confidence low; paste blocked'); return; }

    // Store previous value for undo before pasting
    const previousValue = readValue(state.el);
    undoStack.push({
      element: state.el,
      previousValue: previousValue,
      timestamp: Date.now()
    });

    // Keep undo stack reasonable size (max 10 actions)
    if (undoStack.length > 10) {
      undoStack.shift();
    }

    const ok = tryPaste(state.el, state.text);
    console.log(ok ? 'AssistMD: Inserted ✓' : 'AssistMD: Insert failed');
  }
  if (e.altKey && e.code === 'KeyZ') { e.preventDefault(); performUndo(); }
  if (e.code === 'Escape') { clearGhost(); }
});

// Initialize content loading
loadNoteContent();

function writeValue(el, text) {
  if (el.matches('textarea,input')) {
    el.focus()
    el.value = text
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.dispatchEvent(new Event('change', { bubbles: true }))
  } else if (el.isContentEditable) {
    el.focus()
    el.innerText = text
    el.dispatchEvent(new Event('input', { bubbles: true }))
  }
}

function initMcpBridge() {
  window.addEventListener('__ANCHOR_MCP_MAP_REQUEST__', () => {
    try {
      const detail = { url: location.href, fields: snapshotFields() }
      window.dispatchEvent(new CustomEvent('__ANCHOR_MCP_MAP_RESPONSE__', { detail }))
    } catch (error) {
      window.dispatchEvent(new CustomEvent('__ANCHOR_MCP_MAP_RESPONSE__', { detail: { error: error?.message || String(error) } }))
    }
  })

  window.addEventListener('__ANCHOR_MCP_FILL_REQUEST__', (event) => {
    const { selector, value } = event?.detail || {}
    let success = false
    let error = null
    try {
      if (typeof selector === 'string') {
        const el = document.querySelector(selector)
        if (el && isEditable(el)) {
          success = tryPaste(el, value ?? '')
          if (!success) {
            writeValue(el, value ?? '')
            success = true
          }
        } else {
          error = 'Field not found or not editable'
        }
      } else {
        error = 'Invalid selector'
      }
    } catch (err) {
      error = err?.message || String(err)
    }
    window.dispatchEvent(new CustomEvent('__ANCHOR_MCP_FILL_RESPONSE__', { detail: { success, selector, error } }))
  })

  console.log('AssistMD: MCP bridge initialized')
}

initMcpBridge()
