import { mapDom } from './domMapper.js';

const TOGGLE_BUTTON_ID = '__anchor_ghost_toggle__';
const OVERLAY_HOST_ID = '__anchor_ghost_overlay__';
const MAX_FIELDS_VISIBLE = 8;

let shadowRoot = null;
let status = { mode: 'clinician', mappedCount: 0, lastAction: 'Idle', activeTab: 'fields' };

let lastMapped = [];
let lastPlan = null;
let lastSnapshot = null;

export function initOverlay() {
  ensureToggleButton();
  ensureOverlay();
  attachApi();
}

function ensureToggleButton() {
  if (document.getElementById(TOGGLE_BUTTON_ID)) return;

  const btn = document.createElement('div');
  btn.id = TOGGLE_BUTTON_ID;
  btn.innerHTML = `
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M2 17L12 22L22 17" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M2 12L12 17L22 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    `;

  // Initial styles for the FAB
  Object.assign(btn.style, {
    position: 'fixed',
    top: '20px',
    right: '20px',
    zIndex: '2147483646',
    width: '48px',
    height: '48px',
    borderRadius: '16px',
    background: 'rgba(15, 23, 42, 0.6)',
    backdropFilter: 'blur(12px)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.2)',
    color: '#38bdf8',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    transition: 'transform 0.1s cubic-bezier(0.4, 0, 0.2, 1), background 0.1s',
    userSelect: 'none'
  });

  // Hover effect
  btn.onmouseenter = () => {
    btn.style.background = 'rgba(15, 23, 42, 0.8)';
    btn.style.transform = 'scale(1.05)';
  };
  btn.onmouseleave = () => {
    btn.style.background = 'rgba(15, 23, 42, 0.6)';
    btn.style.transform = 'scale(1)';
  };

  // Click handler (distinguish from drag)
  let isDragging = false;
  btn.addEventListener('click', () => {
    if (!isDragging) togglePanel();
  });

  makeDraggable(btn, () => { isDragging = true; }, () => { setTimeout(() => isDragging = false, 50); });

  document.body.appendChild(btn);
}

function makeDraggable(el, onDragStart, onDragEnd) {
  let isDown = false;
  let hasMoved = false;
  let startX, startY, initialLeft, initialTop;

  el.addEventListener('mousedown', (e) => {
    isDown = true;
    hasMoved = false;
    startX = e.clientX;
    startY = e.clientY;
    const rect = el.getBoundingClientRect();
    initialLeft = rect.left;
    initialTop = rect.top;

    // Don't set style yet, wait for move
  });

  window.addEventListener('mousemove', (e) => {
    if (!isDown) return;

    const dx = e.clientX - startX;
    const dy = e.clientY - startY;

    // Only start dragging if moved more than 5px
    if (!hasMoved && (Math.abs(dx) > 5 || Math.abs(dy) > 5)) {
      hasMoved = true;
      if (onDragStart) onDragStart();
      // Switch to absolute positioning for drag
      el.style.right = 'auto';
      el.style.left = `${initialLeft}px`;
      el.style.top = `${initialTop}px`;
    }

    if (hasMoved) {
      el.style.left = `${initialLeft + dx}px`;
      el.style.top = `${initialTop + dy}px`;
    }
  });

  window.addEventListener('mouseup', () => {
    if (isDown) {
      isDown = false;
      if (hasMoved && onDragEnd) {
        onDragEnd();
      }
    }
  });
}

function ensureOverlay() {
  if (document.getElementById(OVERLAY_HOST_ID)) return;

  const host = document.createElement('div');
  host.id = OVERLAY_HOST_ID;
  host.style.position = 'fixed';
  host.style.top = '80px';
  host.style.right = '20px';
  host.style.zIndex = '2147483647';
  host.style.display = 'none'; // Hidden by default
  document.body.appendChild(host);

  shadowRoot = host.attachShadow({ mode: 'open' });
  shadowRoot.innerHTML = getOverlayHtml();
  wireOverlayHandlers();
}

function getOverlayHtml() {
  return /* html */ `
    <style>
      :host {
        all: initial;
        font-family: 'Inter', system-ui, -apple-system, sans-serif;
        --glass-bg: rgba(5, 5, 10, 0.9);
        --glass-border: rgba(255, 255, 255, 0.05);
        --glass-shadow: 0 20px 50px -12px rgba(0, 0, 0, 0.7);
        --accent: #38bdf8;
        --accent-glow: rgba(56, 189, 248, 0.2);
        --text-main: #ffffff;
        --text-muted: #94a3b8;
        --danger: #ef4444;
        --success: #10b981;
      }

      .panel {
        width: 360px;
        background: var(--glass-bg);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        border: 1px solid var(--glass-border);
        border-radius: 24px;
        box-shadow: var(--glass-shadow);
        color: var(--text-main);
        display: flex;
        flex-direction: column;
        overflow: hidden;
        animation: slideIn 0.15s cubic-bezier(0.16, 1, 0.3, 1);
        transform-origin: top right;
      }

      @keyframes slideIn {
        from { opacity: 0; transform: scale(0.95) translateY(-10px); }
        to { opacity: 1; transform: scale(1) translateY(0); }
      }

      /* Header */
      header {
        padding: 16px 20px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        border-bottom: 1px solid var(--glass-border);
        background: linear-gradient(to right, rgba(255,255,255,0.02), transparent);
      }

      .brand {
        display: flex;
        align-items: center;
        gap: 8px;
        font-weight: 600;
        font-size: 14px;
        letter-spacing: -0.01em;
      }

      .brand svg {
        width: 18px;
        height: 18px;
        color: var(--accent);
        filter: drop-shadow(0 0 8px var(--accent-glow));
      }

      .status-badge {
        font-size: 10px;
        font-weight: 600;
        padding: 4px 8px;
        border-radius: 99px;
        background: rgba(56, 189, 248, 0.1);
        color: var(--accent);
        border: 1px solid rgba(56, 189, 248, 0.2);
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }

      /* Content Area */
      .content {
        padding: 0;
        max-height: 60vh;
        overflow-y: auto;
      }

      .content::-webkit-scrollbar {
        width: 4px;
      }
      .content::-webkit-scrollbar-thumb {
        background: rgba(255,255,255,0.1);
        border-radius: 4px;
      }

      /* Tabs (Mock) */
      .tabs {
        display: flex;
        padding: 0 16px;
        border-bottom: 1px solid var(--glass-border);
        margin-top: 8px;
      }
      .tab {
        padding: 8px 12px;
        font-size: 12px;
        color: var(--text-muted);
        cursor: pointer;
        border-bottom: 2px solid transparent;
        transition: all 0.2s;
      }
      .tab.active {
        color: var(--text-main);
        border-bottom-color: var(--accent);
      }

      /* Sections */
      .section {
        padding: 16px 20px;
      }

      .section-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 12px;
      }

      .section-title {
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: var(--text-muted);
        font-weight: 600;
      }

      /* Fields List */
      .field-list {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .field-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 8px 12px;
        background: rgba(255,255,255,0.03);
        border-radius: 8px;
        border: 1px solid transparent;
        transition: all 0.2s;
      }

      .field-item:hover {
        background: rgba(255,255,255,0.06);
        border-color: rgba(255,255,255,0.1);
      }

      .field-name {
        font-size: 12px;
        font-weight: 500;
      }
      .field-meta {
        font-size: 10px;
        color: var(--text-muted);
      }

      /* Actions Grid */
      .actions-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
        padding: 16px 20px;
        background: rgba(0,0,0,0.2);
        border-top: 1px solid var(--glass-border);
      }

      button.btn {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        padding: 10px;
        border-radius: 12px;
        border: none;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
      }

      button.btn-primary {
        background: var(--accent);
        color: #0f172a;
        box-shadow: 0 4px 12px rgba(56, 189, 248, 0.25);
      }
      button.btn-primary:hover {
        filter: brightness(1.1);
        transform: translateY(-1px);
      }
      button.btn-primary:active {
        transform: translateY(0);
      }

      button.btn-secondary {
        background: rgba(255,255,255,0.05);
        color: var(--text-main);
        border: 1px solid rgba(255,255,255,0.1);
      }
      button.btn-secondary:hover {
        background: rgba(255,255,255,0.1);
      }

      /* Log */
      .log-container {
        max-height: 80px;
        overflow-y: auto;
        font-family: 'Menlo', monospace;
        font-size: 10px;
        color: var(--text-muted);
        padding: 12px 20px;
        border-top: 1px solid var(--glass-border);
        background: rgba(0,0,0,0.3);
      }
      .log-entry { margin-bottom: 4px; }
      .log-entry.error { color: var(--danger); }
      .log-entry.success { color: var(--success); }

      /* Empty State */
      .empty-state {
        text-align: center;
        padding: 24px 0;
        color: var(--text-muted);
        font-size: 12px;
        font-style: italic;
      }
    </style>

    <div class="panel">
      <header>
        <div class="brand">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 2L2 7L12 12L22 7L12 2Z"/>
            <path d="M2 17L12 22L22 17"/>
            <path d="M2 12L12 17L22 12"/>
          </svg>
          Anchor
        </div>
        <div class="status-badge" id="status-badge">Idle</div>
      </header>

      <div class="tabs">
        <div class="tab active" id="tab-fields" data-target="fields">Fields</div>
        <div class="tab" id="tab-notes" data-target="notes">Notes</div>
        <div class="tab" id="tab-settings" data-target="settings">Settings</div>
      </div>

      <div class="content">
        <!-- Fields View -->
        <div id="view-fields" class="view-section">
            <div class="section">
              <div class="section-header">
                <div class="section-title">Mapped Elements</div>
              </div>
              <div id="fields-list" class="field-list">
                <div class="empty-state">No fields mapped yet. Click "Map" to start.</div>
              </div>
            </div>
        </div>

        <!-- Notes View -->
        <div id="view-notes" class="view-section" style="display: none;">
            <div class="section">
                <div class="section-header">
                    <div class="section-title">Clinical Note</div>
                </div>
                <textarea id="note-editor" style="width: 100%; height: 200px; background: rgba(0,0,0,0.3); border: 1px solid var(--glass-border); color: var(--text-main); padding: 8px; border-radius: 8px; font-family: inherit; font-size: 12px; resize: none;" placeholder="AI generated note will appear here..."></textarea>
            </div>
        </div>

        <!-- Settings View -->
        <div id="view-settings" class="view-section" style="display: none;">
            <div class="section">
                <div class="section-header">
                    <div class="section-title">Preferences</div>
                </div>
                <div style="display: flex; flex-direction: column; gap: 12px;">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <span style="font-size: 12px;">Auto-Map on Load</span>
                        <input type="checkbox" checked>
                    </div>
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <span style="font-size: 12px;">Dark Mode</span>
                        <input type="checkbox" checked disabled>
                    </div>
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <span style="font-size: 12px;">Sound Effects</span>
                        <input type="checkbox">
                    </div>
                </div>
            </div>
        </div>
      </div>

      <div class="actions-grid">
        <button class="btn btn-primary" id="btn-map">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
          Map Page
        </button>
        <button class="btn btn-secondary" id="btn-fill">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          Smart Fill
        </button>
        <button class="btn btn-secondary" id="btn-send">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
          Send
        </button>
        <button class="btn btn-secondary" id="btn-undo">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/></svg>
          Undo
        </button>
        <button class="btn btn-secondary" id="btn-dictate">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
          Dictate
        </button>
      </div>

      <div class="log-container" id="log-container"></div>
    </div>
  `;
}

function wireOverlayHandlers() {
  if (!shadowRoot) return;

  shadowRoot.getElementById('btn-map').addEventListener('click', handleMap);
  shadowRoot.getElementById('btn-fill').addEventListener('click', handleFill);
  shadowRoot.getElementById('btn-send').addEventListener('click', handleSend);
  shadowRoot.getElementById('btn-undo').addEventListener('click', handleUndo);
  shadowRoot.getElementById('btn-dictate').addEventListener('click', handleDictate);



  // Tab Handlers
  ['fields', 'notes', 'settings'].forEach(tab => {
    shadowRoot.getElementById(`tab-${tab}`).addEventListener('click', () => switchTab(tab));
  });

  log('Anchor v2.0 Ready');
}

function switchTab(tabName) {
  if (!shadowRoot) return;

  // Update status
  status.activeTab = tabName;

  // Update Tab UI
  const tabs = shadowRoot.querySelectorAll('.tab');
  tabs.forEach(t => {
    t.classList.toggle('active', t.dataset.target === tabName);
  });

  // Update View UI
  const views = shadowRoot.querySelectorAll('.view-section');
  views.forEach(v => {
    v.style.display = v.id === `view-${tabName}` ? 'block' : 'none';
  });
}

function togglePanel() {
  const host = document.getElementById(OVERLAY_HOST_ID);
  if (!host) return;
  const isHidden = host.style.display === 'none';
  host.style.display = isHidden ? 'block' : 'none';

  if (isHidden) {
    // Reset animation
    const panel = shadowRoot.querySelector('.panel');
    panel.style.animation = 'none';
    panel.offsetHeight; /* trigger reflow */
    panel.style.animation = 'slideIn 0.15s cubic-bezier(0.16, 1, 0.3, 1)';
  }
}

function updateStatus(text) {
  if (!shadowRoot) return;
  const badge = shadowRoot.getElementById('status-badge');
  if (badge) badge.textContent = text;
  status.lastAction = text;
}

function renderFields() {
  if (!shadowRoot) return;
  const container = shadowRoot.getElementById('fields-list');
  if (!container) return;

  if (!lastMapped.length) {
    container.innerHTML = '<div class="empty-state">No fields mapped yet. Click "Map" to start.</div>';
    return;
  }

  container.innerHTML = '';
  lastMapped.slice(0, MAX_FIELDS_VISIBLE).forEach(f => {
    const item = document.createElement('div');
    item.className = 'field-item';
    item.innerHTML = `
            <span class="field-name">${escapeHtml(f.label || '(unnamed)')}</span>
            <span class="field-meta">${escapeHtml(f.role || 'field')}</span>
        `;
    container.appendChild(item);
  });

  if (lastMapped.length > MAX_FIELDS_VISIBLE) {
    const more = document.createElement('div');
    more.style.textAlign = 'center';
    more.style.fontSize = '10px';
    more.style.color = 'var(--text-muted)';
    more.style.padding = '4px';
    more.textContent = `+${lastMapped.length - MAX_FIELDS_VISIBLE} more fields...`;
    container.appendChild(more);
  }
}

function log(message, type = 'info') {
  if (!shadowRoot) return;
  const container = shadowRoot.getElementById('log-container');
  if (!container) return;

  const entry = document.createElement('div');
  entry.className = `log-entry ${type}`;
  const time = new Date().toLocaleTimeString([], { hour12: false });
  entry.textContent = `[${time}] ${message}`;
  container.prepend(entry);
}

function escapeHtml(s) {
  return s.replace(/[&<>'"]/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[c] || c));
}

// --- Logic Handlers ---

async function handleMap() {
  try {
    updateStatus('Mapping...');
    const result = await window.Anchor?.map();
    lastMapped = result?.fields || [];
    status.mappedCount = lastMapped.length;
    renderFields();
    updateStatus(`Mapped ${lastMapped.length}`);
    log(`Successfully mapped ${lastMapped.length} fields`, 'success');
  } catch (err) {
    updateStatus('Error');
    log(`Map failed: ${err.message}`, 'error');
  }
}

async function handleFill() {
  try {
    updateStatus('Planning...');
    const res = await window.Anchor?.fill();

    if (res?.ok && res?.plan) {
      updateStatus(`Executing (${res.plan.steps.length} steps)...`);
      log(`Generated plan with ${res.plan.steps.length} steps`, 'info');

      await window.Anchor?.executePlan(res.plan);

      updateStatus('Filled');
      log('Plan executed successfully', 'success');
    } else {
      updateStatus('Failed');
      log('Failed to generate fill plan', 'error');
    }
  } catch (err) {
    updateStatus('Error');
    log(`Fill failed: ${err.message}`, 'error');
  }
}

async function handleSend() {
  try {
    updateStatus('Sending...');
    const res = await window.Anchor?.sendMap();
    updateStatus('Sent');
    log(`Sent map data (${res?.fields || 0} items)`, 'success');
  } catch (err) {
    updateStatus('Error');
    log(`Send failed: ${err.message}`, 'error');
  }
}

function handleUndo() {
  if (!lastSnapshot) {
    log('Nothing to undo', 'error');
    return;
  }
  // Restore values logic (same as before)
  for (const [selector, value] of Object.entries(lastSnapshot)) {
    const el = document.querySelector(selector);
    if (el) {
      el.value = value;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }
  log('Undo applied', 'success');
  updateStatus('Undone');
}

let recognition = null;
function handleDictate() {
  if (!('webkitSpeechRecognition' in window)) {
    log('Dictation not supported in this browser', 'error');
    return;
  }

  if (recognition) {
    recognition.stop();
    recognition = null;
    updateStatus('Dictation stopped');
    return;
  }

  recognition = new webkitSpeechRecognition();
  recognition.continuous = false;
  recognition.interimResults = false;

  recognition.onstart = () => {
    updateStatus('Listening...');
    log('Dictation started...', 'info');
    if (shadowRoot) {
      const btn = shadowRoot.getElementById('btn-dictate');
      if (btn) btn.style.color = '#ef4444';
    }
  };

  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    log(`Heard: "${transcript}"`, 'success');

    // Insert into active element if possible
    const active = document.activeElement;
    if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)) {
      if (active.isContentEditable) {
        active.innerText += (active.innerText ? ' ' : '') + transcript;
      } else {
        active.value += (active.value ? ' ' : '') + transcript;
      }
      active.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      log('No active input field to insert text', 'warning');
    }
  };

  recognition.onerror = (event) => {
    log(`Dictation error: ${event.error}`, 'error');
    stopDictationUI();
  };

  recognition.onend = () => {
    stopDictationUI();
  };

  recognition.start();
}

function stopDictationUI() {
  recognition = null;
  updateStatus('Idle');
  if (shadowRoot) {
    const btn = shadowRoot.getElementById('btn-dictate');
    if (btn) btn.style.color = '';
  }
}

// --- API Exposure ---

function attachApi() {
  const api = {
    togglePanel,
    map: async () => {
      const mapResult = await mapDom(); // Returns { fields, title, context }
      lastMapped = mapResult.fields;

      // Send to Agent
      try {
        await fetch('http://localhost:8787/dom', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: window.location.href,
            ...mapResult
          })
        });
        log('Sent map to Agent', 'info');
      } catch (e) {
        log('Agent offline (using local mode)', 'warning');
      }

      return { fields: lastMapped };
    },
    sendMap: async () => {
      // Re-send logic if needed, but map() already does it
      return { ok: true, fields: lastMapped.length };
    },
    fill: async () => {
      try {
        const res = await fetch('http://localhost:8787/actions/fill', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: window.location.href,
            fields: lastMapped
          })
        });

        if (!res.ok) throw new Error(`Agent error: ${res.status}`);

        const plan = await res.json();
        return { ok: true, plan };
      } catch (e) {
        log(`Agent fill failed: ${e.message}`, 'error');
        return { ok: false, error: e.message };
      }
    },
    executePlan: async (plan) => {
      if (!plan || !plan.steps) return { ok: false, error: 'Invalid plan' };

      const snap = {};

      for (const step of plan.steps) {
        // Handle internal UI updates
        if (step.action === 'setInternalValue') {
          if (shadowRoot) {
            const el = shadowRoot.querySelector(step.selector);
            if (el) el.value = step.value;
          }
          continue;
        }

        // Handle Wait
        if (step.action === 'wait') {
          await new Promise(r => setTimeout(r, parseInt(step.value) || 100));
          continue;
        }

        // Handle DOM updates
        const el = document.querySelector(step.selector);
        if (el) {
          // Visual Feedback: Blue Flash
          const originalTransition = el.style.transition;
          const originalBg = el.style.backgroundColor;
          const originalBoxShadow = el.style.boxShadow;

          el.style.transition = 'all 0.3s ease';
          el.style.backgroundColor = 'rgba(56, 189, 248, 0.15)'; // Light blue
          el.style.boxShadow = '0 0 0 2px rgba(56, 189, 248, 0.5)'; // Blue ring

          // Execute Action
          switch (step.action) {
            case 'scroll':
              el.scrollIntoView({ behavior: 'smooth', block: 'center' });
              await new Promise(r => setTimeout(r, 300)); // Wait for scroll
              break;

            case 'focus':
              el.focus();
              break;

            case 'blur':
              el.blur();
              break;

            case 'click':
              el.click();
              // Ripple effect could go here
              break;

            case 'setValue':
              // Capture snapshot for undo
              if (!snap[step.selector]) snap[step.selector] = el.value;

              if (el.isContentEditable) {
                el.innerText = step.value;
              } else {
                el.value = step.value;
              }
              el.dispatchEvent(new Event('input', { bubbles: true }));
              el.dispatchEvent(new Event('change', { bubbles: true }));
              break;

            case 'select':
              if (!snap[step.selector]) snap[step.selector] = el.value;
              el.value = step.value;
              el.dispatchEvent(new Event('change', { bubbles: true }));
              break;

            case 'check':
            case 'uncheck':
              if (el.type === 'checkbox' || el.type === 'radio') {
                if (!snap[step.selector]) snap[step.selector] = el.checked;
                el.checked = (step.action === 'check');
                el.dispatchEvent(new Event('change', { bubbles: true }));
              }
              break;
          }

          // Cleanup Visuals
          setTimeout(() => {
            el.style.backgroundColor = originalBg;
            el.style.boxShadow = originalBoxShadow;
            setTimeout(() => {
              el.style.transition = originalTransition;
            }, 300);
          }, 500);

          // Base delay for human-like pacing
          await new Promise(r => setTimeout(r, 50));
        }
      }

      lastSnapshot = snap;
      return { ok: true };
    },
    undo: handleUndo
  };

  window.Anchor = api;
  window.__ANCHOR_GHOST__ = api;
}
