"use strict";
(() => {
  // extension/domMapper.js
  async function mapDom() {
    const candidates = Array.from(document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]), textarea, select, [contenteditable="true"]'));
    const mapped = [];
    const seenSelectors = /* @__PURE__ */ new Set();
    for (const el of candidates) {
      if (!isVisible(el)) continue;
      const labelText = findLabel(el);
      if (!labelText) continue;
      const role = identifyRole(labelText);
      const selector = getUniqueSelector(el);
      if (role && selector && !seenSelectors.has(selector)) {
        mapped.push({
          label: labelText,
          role,
          selector,
          editable: !el.disabled && !el.readOnly,
          visible: true
        });
        seenSelectors.add(selector);
      }
    }
    const context = document.body.innerText;
    const title = document.title;
    return {
      fields: mapped,
      title,
      context
    };
  }
  var ROLES = {
    name: /name|patient|first.*name|last.*name/i,
    dob: /dob|birth|date.*birth/i,
    gender: /sex|gender/i,
    mrn: /mrn|record.*no|id/i,
    phone: /phone|mobile|cell/i,
    email: /email/i,
    address: /address|street|city|zip/i,
    cc: /chief.*complaint|reason.*visit/i,
    hpi: /hpi|history.*illness|story/i,
    pmh: /medical.*history|past.*history/i,
    psh: /surgical.*history/i,
    famhx: /family.*history/i,
    sochx: /social.*history/i,
    meds: /medication|drug|rx|current.*meds/i,
    allergies: /allerg/i,
    vitals: /vital|bp|blood.*pressure|pulse|temp|weight|height/i,
    ros: /review.*systems|ros/i,
    pe: /physical.*exam|objective/i,
    assessment: /assessment|diagnosis|impression|problem.*list/i,
    plan: /plan|treatment|recommendation/i,
    note: /note|comment|narrative|documentation/i
  };
  function identifyRole(text) {
    for (const [role, regex] of Object.entries(ROLES)) {
      if (regex.test(text)) return role;
    }
    return null;
  }
  function findLabel(el) {
    if (el.id) {
      const label = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (label && isVisible(label)) return cleanText(label.innerText);
    }
    if (el.getAttribute("aria-label")) return cleanText(el.getAttribute("aria-label"));
    if (el.getAttribute("aria-labelledby")) {
      const label = document.getElementById(el.getAttribute("aria-labelledby"));
      if (label) return cleanText(label.innerText);
    }
    if (el.placeholder) return cleanText(el.placeholder);
    const parentLabel = el.closest("label");
    if (parentLabel) {
      const clone = parentLabel.cloneNode(true);
      const inputInClone = clone.querySelector("input, textarea, select");
      if (inputInClone) inputInClone.remove();
      return cleanText(clone.innerText);
    }
    let prev = el.previousElementSibling;
    if (prev && isVisible(prev) && (prev.tagName === "LABEL" || prev.tagName === "SPAN" || prev.tagName === "DIV" || prev.tagName === "B" || prev.tagName === "STRONG")) {
      return cleanText(prev.innerText);
    }
    const tr = el.closest("tr");
    if (tr) {
      const th = tr.querySelector("th");
      if (th) return cleanText(th.innerText);
      const firstTd = tr.querySelector("td");
      if (firstTd && firstTd !== el.closest("td")) return cleanText(firstTd.innerText);
    }
    let node = el.previousSibling;
    while (node) {
      if (node.nodeType === Node.TEXT_NODE && node.textContent.trim()) {
        return cleanText(node.textContent);
      }
      if (node.nodeType === Node.ELEMENT_NODE) break;
      node = node.previousSibling;
    }
    return null;
  }
  function isVisible(el) {
    return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
  }
  function cleanText(text) {
    return text ? text.replace(/[:*]/g, "").trim() : "";
  }
  function getUniqueSelector(el) {
    if (el.id) return `#${CSS.escape(el.id)}`;
    if (el.name) return `[name="${CSS.escape(el.name)}"]`;
    let path = [];
    while (el.nodeType === Node.ELEMENT_NODE) {
      let selector = el.nodeName.toLowerCase();
      if (el.id) {
        selector += `#${CSS.escape(el.id)}`;
        path.unshift(selector);
        break;
      } else {
        let sib = el, nth = 1;
        while (sib = sib.previousElementSibling) {
          if (sib.nodeName.toLowerCase() === selector) nth++;
        }
        if (nth != 1) selector += `:nth-of-type(${nth})`;
      }
      path.unshift(selector);
      el = el.parentNode;
    }
    return path.join(" > ");
  }

  // extension/overlay.js
  var TOGGLE_BUTTON_ID = "__anchor_ghost_toggle__";
  var OVERLAY_HOST_ID = "__anchor_ghost_overlay__";
  var MAX_FIELDS_VISIBLE = 8;
  var shadowRoot = null;
  var status = { mode: "clinician", mappedCount: 0, lastAction: "Idle", activeTab: "fields" };
  var lastMapped = [];
  var lastSnapshot = null;
  function initOverlay() {
    ensureToggleButton();
    ensureOverlay();
    attachApi();
  }
  function ensureToggleButton() {
    if (document.getElementById(TOGGLE_BUTTON_ID)) return;
    const btn = document.createElement("div");
    btn.id = TOGGLE_BUTTON_ID;
    btn.innerHTML = `
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M2 17L12 22L22 17" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M2 12L12 17L22 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    `;
    Object.assign(btn.style, {
      position: "fixed",
      top: "20px",
      right: "20px",
      zIndex: "2147483646",
      width: "48px",
      height: "48px",
      borderRadius: "16px",
      background: "rgba(15, 23, 42, 0.6)",
      backdropFilter: "blur(12px)",
      border: "1px solid rgba(255, 255, 255, 0.1)",
      boxShadow: "0 8px 32px rgba(0, 0, 0, 0.2)",
      color: "#38bdf8",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      cursor: "pointer",
      transition: "transform 0.1s cubic-bezier(0.4, 0, 0.2, 1), background 0.1s",
      userSelect: "none"
    });
    btn.onmouseenter = () => {
      btn.style.background = "rgba(15, 23, 42, 0.8)";
      btn.style.transform = "scale(1.05)";
    };
    btn.onmouseleave = () => {
      btn.style.background = "rgba(15, 23, 42, 0.6)";
      btn.style.transform = "scale(1)";
    };
    let isDragging = false;
    btn.addEventListener("click", () => {
      if (!isDragging) togglePanel();
    });
    makeDraggable(btn, () => {
      isDragging = true;
    }, () => {
      setTimeout(() => isDragging = false, 50);
    });
    document.body.appendChild(btn);
  }
  function makeDraggable(el, onDragStart, onDragEnd) {
    let isDown = false;
    let hasMoved = false;
    let startX, startY, initialLeft, initialTop;
    el.addEventListener("mousedown", (e) => {
      isDown = true;
      hasMoved = false;
      startX = e.clientX;
      startY = e.clientY;
      const rect = el.getBoundingClientRect();
      initialLeft = rect.left;
      initialTop = rect.top;
    });
    window.addEventListener("mousemove", (e) => {
      if (!isDown) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (!hasMoved && (Math.abs(dx) > 5 || Math.abs(dy) > 5)) {
        hasMoved = true;
        if (onDragStart) onDragStart();
        el.style.right = "auto";
        el.style.left = `${initialLeft}px`;
        el.style.top = `${initialTop}px`;
      }
      if (hasMoved) {
        el.style.left = `${initialLeft + dx}px`;
        el.style.top = `${initialTop + dy}px`;
      }
    });
    window.addEventListener("mouseup", () => {
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
    const host = document.createElement("div");
    host.id = OVERLAY_HOST_ID;
    host.style.position = "fixed";
    host.style.top = "80px";
    host.style.right = "20px";
    host.style.zIndex = "2147483647";
    host.style.display = "none";
    document.body.appendChild(host);
    shadowRoot = host.attachShadow({ mode: "open" });
    shadowRoot.innerHTML = getOverlayHtml();
    wireOverlayHandlers();
  }
  function getOverlayHtml() {
    return (
      /* html */
      `
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
  `
    );
  }
  function wireOverlayHandlers() {
    if (!shadowRoot) return;
    shadowRoot.getElementById("btn-map").addEventListener("click", handleMap);
    shadowRoot.getElementById("btn-fill").addEventListener("click", handleFill);
    shadowRoot.getElementById("btn-send").addEventListener("click", handleSend);
    shadowRoot.getElementById("btn-undo").addEventListener("click", handleUndo);
    shadowRoot.getElementById("btn-dictate").addEventListener("click", handleDictate);
    ["fields", "notes", "settings"].forEach((tab) => {
      shadowRoot.getElementById(`tab-${tab}`).addEventListener("click", () => switchTab(tab));
    });
    log("Anchor v2.0 Ready");
  }
  function switchTab(tabName) {
    if (!shadowRoot) return;
    status.activeTab = tabName;
    const tabs = shadowRoot.querySelectorAll(".tab");
    tabs.forEach((t) => {
      t.classList.toggle("active", t.dataset.target === tabName);
    });
    const views = shadowRoot.querySelectorAll(".view-section");
    views.forEach((v) => {
      v.style.display = v.id === `view-${tabName}` ? "block" : "none";
    });
  }
  function togglePanel() {
    const host = document.getElementById(OVERLAY_HOST_ID);
    if (!host) return;
    const isHidden = host.style.display === "none";
    host.style.display = isHidden ? "block" : "none";
    if (isHidden) {
      const panel = shadowRoot.querySelector(".panel");
      panel.style.animation = "none";
      panel.offsetHeight;
      panel.style.animation = "slideIn 0.15s cubic-bezier(0.16, 1, 0.3, 1)";
    }
  }
  function updateStatus(text) {
    if (!shadowRoot) return;
    const badge = shadowRoot.getElementById("status-badge");
    if (badge) badge.textContent = text;
    status.lastAction = text;
  }
  function renderFields() {
    if (!shadowRoot) return;
    const container = shadowRoot.getElementById("fields-list");
    if (!container) return;
    if (!lastMapped.length) {
      container.innerHTML = '<div class="empty-state">No fields mapped yet. Click "Map" to start.</div>';
      return;
    }
    container.innerHTML = "";
    lastMapped.slice(0, MAX_FIELDS_VISIBLE).forEach((f) => {
      const item = document.createElement("div");
      item.className = "field-item";
      item.innerHTML = `
            <span class="field-name">${escapeHtml(f.label || "(unnamed)")}</span>
            <span class="field-meta">${escapeHtml(f.role || "field")}</span>
        `;
      container.appendChild(item);
    });
    if (lastMapped.length > MAX_FIELDS_VISIBLE) {
      const more = document.createElement("div");
      more.style.textAlign = "center";
      more.style.fontSize = "10px";
      more.style.color = "var(--text-muted)";
      more.style.padding = "4px";
      more.textContent = `+${lastMapped.length - MAX_FIELDS_VISIBLE} more fields...`;
      container.appendChild(more);
    }
  }
  function log(message, type = "info") {
    if (!shadowRoot) return;
    const container = shadowRoot.getElementById("log-container");
    if (!container) return;
    const entry = document.createElement("div");
    entry.className = `log-entry ${type}`;
    const time = (/* @__PURE__ */ new Date()).toLocaleTimeString([], { hour12: false });
    entry.textContent = `[${time}] ${message}`;
    container.prepend(entry);
  }
  function escapeHtml(s) {
    return s.replace(/[&<>'"]/g, (c) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "'": "&#39;",
      '"': "&quot;"
    })[c] || c);
  }
  async function handleMap() {
    try {
      updateStatus("Mapping...");
      const result = await window.Anchor?.map();
      lastMapped = result?.fields || [];
      status.mappedCount = lastMapped.length;
      renderFields();
      updateStatus(`Mapped ${lastMapped.length}`);
      log(`Successfully mapped ${lastMapped.length} fields`, "success");
    } catch (err) {
      updateStatus("Error");
      log(`Map failed: ${err.message}`, "error");
    }
  }
  async function handleFill() {
    try {
      updateStatus("Planning...");
      const res = await window.Anchor?.fill();
      if (res?.ok && res?.plan) {
        updateStatus(`Executing (${res.plan.steps.length} steps)...`);
        log(`Generated plan with ${res.plan.steps.length} steps`, "info");
        await window.Anchor?.executePlan(res.plan);
        updateStatus("Filled");
        log("Plan executed successfully", "success");
      } else {
        updateStatus("Failed");
        log("Failed to generate fill plan", "error");
      }
    } catch (err) {
      updateStatus("Error");
      log(`Fill failed: ${err.message}`, "error");
    }
  }
  async function handleSend() {
    try {
      updateStatus("Sending...");
      const res = await window.Anchor?.sendMap();
      updateStatus("Sent");
      log(`Sent map data (${res?.fields || 0} items)`, "success");
    } catch (err) {
      updateStatus("Error");
      log(`Send failed: ${err.message}`, "error");
    }
  }
  function handleUndo() {
    if (!lastSnapshot) {
      log("Nothing to undo", "error");
      return;
    }
    for (const [selector, value] of Object.entries(lastSnapshot)) {
      const el = document.querySelector(selector);
      if (el) {
        el.value = value;
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
      }
    }
    log("Undo applied", "success");
    updateStatus("Undone");
  }
  var recognition = null;
  function handleDictate() {
    if (!("webkitSpeechRecognition" in window)) {
      log("Dictation not supported in this browser", "error");
      return;
    }
    if (recognition) {
      recognition.stop();
      recognition = null;
      updateStatus("Dictation stopped");
      return;
    }
    recognition = new webkitSpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onstart = () => {
      updateStatus("Listening...");
      log("Dictation started...", "info");
      if (shadowRoot) {
        const btn = shadowRoot.getElementById("btn-dictate");
        if (btn) btn.style.color = "#ef4444";
      }
    };
    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      log(`Heard: "${transcript}"`, "success");
      const active = document.activeElement;
      if (active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA" || active.isContentEditable)) {
        if (active.isContentEditable) {
          active.innerText += (active.innerText ? " " : "") + transcript;
        } else {
          active.value += (active.value ? " " : "") + transcript;
        }
        active.dispatchEvent(new Event("input", { bubbles: true }));
      } else {
        log("No active input field to insert text", "warning");
      }
    };
    recognition.onerror = (event) => {
      log(`Dictation error: ${event.error}`, "error");
      stopDictationUI();
    };
    recognition.onend = () => {
      stopDictationUI();
    };
    recognition.start();
  }
  function stopDictationUI() {
    recognition = null;
    updateStatus("Idle");
    if (shadowRoot) {
      const btn = shadowRoot.getElementById("btn-dictate");
      if (btn) btn.style.color = "";
    }
  }
  function attachApi() {
    const api = {
      togglePanel,
      map: async () => {
        const mapResult = await mapDom();
        lastMapped = mapResult.fields;
        try {
          const payload = {
            url: window.location.href,
            ...mapResult
          };
          console.log("Sending to Agent:", JSON.stringify(payload));
          await fetch("http://localhost:8787/dom", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
          });
          log("Sent map to Agent", "info");
        } catch (e) {
          log("Agent offline (using local mode)", "warning");
        }
        return { fields: lastMapped };
      },
      sendMap: async () => {
        return { ok: true, fields: lastMapped.length };
      },
      fill: async () => {
        try {
          const res = await fetch("http://localhost:8787/actions/fill", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              url: window.location.href,
              fields: lastMapped
            })
          });
          if (!res.ok) throw new Error(`Agent error: ${res.status}`);
          const plan = await res.json();
          return { ok: true, plan };
        } catch (e) {
          log(`Agent fill failed: ${e.message}`, "error");
          return { ok: false, error: e.message };
        }
      },
      executePlan: async (plan) => {
        if (!plan || !plan.steps) return { ok: false, error: "Invalid plan" };
        const snap = {};
        for (const step of plan.steps) {
          if (step.action === "setInternalValue") {
            if (shadowRoot) {
              const el2 = shadowRoot.querySelector(step.selector);
              if (el2) el2.value = step.value;
            }
            continue;
          }
          if (step.action === "wait") {
            await new Promise((r) => setTimeout(r, parseInt(step.value) || 100));
            continue;
          }
          const el = document.querySelector(step.selector);
          if (el) {
            const originalTransition = el.style.transition;
            const originalBg = el.style.backgroundColor;
            const originalBoxShadow = el.style.boxShadow;
            el.style.transition = "all 0.3s ease";
            el.style.backgroundColor = "rgba(56, 189, 248, 0.15)";
            el.style.boxShadow = "0 0 0 2px rgba(56, 189, 248, 0.5)";
            switch (step.action) {
              case "scroll":
                el.scrollIntoView({ behavior: "smooth", block: "center" });
                await new Promise((r) => setTimeout(r, 300));
                break;
              case "focus":
                el.focus();
                break;
              case "blur":
                el.blur();
                break;
              case "click":
                el.click();
                break;
              case "setValue":
                if (!snap[step.selector]) snap[step.selector] = el.value;
                if (el.isContentEditable) {
                  el.innerText = step.value;
                } else {
                  el.value = step.value;
                }
                el.dispatchEvent(new Event("input", { bubbles: true }));
                el.dispatchEvent(new Event("change", { bubbles: true }));
                break;
              case "select":
                if (!snap[step.selector]) snap[step.selector] = el.value;
                el.value = step.value;
                el.dispatchEvent(new Event("change", { bubbles: true }));
                break;
              case "check":
              case "uncheck":
                if (el.type === "checkbox" || el.type === "radio") {
                  if (!snap[step.selector]) snap[step.selector] = el.checked;
                  el.checked = step.action === "check";
                  el.dispatchEvent(new Event("change", { bubbles: true }));
                }
                break;
            }
            setTimeout(() => {
              el.style.backgroundColor = originalBg;
              el.style.boxShadow = originalBoxShadow;
              setTimeout(() => {
                el.style.transition = originalTransition;
              }, 300);
            }, 500);
            await new Promise((r) => setTimeout(r, 50));
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

  // extension/content.js
  (function bootstrap() {
    try {
      initOverlay();
      setupRuntimeMessages();
      setupMcpBridge();
      console.log("[Anchor] Content script ready:", window.location.href);
    } catch (err) {
      console.error("[Anchor] Failed to initialize overlay", err);
    }
  })();
  function ensureAnchorApi() {
    if (!window.Anchor) {
      throw new Error("Anchor API not ready");
    }
    return window.Anchor;
  }
  function setupRuntimeMessages() {
    if (typeof chrome === "undefined" || !chrome.runtime?.onMessage) return;
    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      (async () => {
        try {
          const api = ensureAnchorApi();
          switch (msg?.type) {
            case "TOGGLE_OVERLAY":
              api.togglePanel();
              sendResponse({ ok: true });
              break;
            case "MAP":
              sendResponse(await api.map());
              break;
            case "SEND_MAP":
              sendResponse(await api.sendMap());
              break;
            case "FILL_DEMO":
              sendResponse(await api.fill());
              break;
            default:
              sendResponse({ ok: false, error: "Unknown command" });
          }
        } catch (err) {
          sendResponse({ ok: false, error: String(err) });
        }
      })();
      return true;
    });
  }
  function setupMcpBridge() {
    if (window.__ANCHOR_MCP_BRIDGE_READY__) return;
    window.__ANCHOR_MCP_BRIDGE_READY__ = true;
    const wire = (requestEvent, responseEvent, handler) => {
      window.addEventListener(requestEvent, async (event) => {
        try {
          const payload = await handler(event?.detail);
          window.dispatchEvent(new CustomEvent(responseEvent, { detail: { ok: true, ...payload } }));
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          window.dispatchEvent(new CustomEvent(responseEvent, { detail: { ok: false, error: message } }));
        }
      });
    };
    wire("__ANCHOR_MCP_MAP_REQUEST__", "__ANCHOR_MCP_MAP_RESPONSE__", async () => {
      const api = ensureAnchorApi();
      const mapResult = await api.map();
      return {
        url: window.location.href,
        title: document.title,
        fields: mapResult?.fields || []
      };
    });
    wire("__ANCHOR_MCP_SEND_REQUEST__", "__ANCHOR_MCP_SEND_RESPONSE__", async () => {
      const api = ensureAnchorApi();
      return await api.sendMap();
    });
    wire("__ANCHOR_MCP_FILL_REQUEST__", "__ANCHOR_MCP_FILL_RESPONSE__", async (detail) => {
      const api = ensureAnchorApi();
      if (detail?.note && typeof detail.note === "string") {
        window.__ANCHOR_MCP_NOTE__ = detail.note;
      }
      return await api.fill();
    });
  }
})();
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vZG9tTWFwcGVyLmpzIiwgIi4uL292ZXJsYXkuanMiLCAiLi4vY29udGVudC5qcyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyoqXG4gKiBTY2FucyB0aGUgRE9NIGZvciBmaWVsZHMgdXNpbmcgaGV1cmlzdGljcy5cbiAqIEByZXR1cm5zIHtQcm9taXNlPGltcG9ydCgnLi9hbmNob3JBcGknKS5NYXBwZWRGaWVsZFtdPn1cbiAqL1xuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIG1hcERvbSgpIHtcbiAgICBjb25zdCBjYW5kaWRhdGVzID0gQXJyYXkuZnJvbShkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKCdpbnB1dDpub3QoW3R5cGU9XCJoaWRkZW5cIl0pOm5vdChbdHlwZT1cInN1Ym1pdFwiXSksIHRleHRhcmVhLCBzZWxlY3QsIFtjb250ZW50ZWRpdGFibGU9XCJ0cnVlXCJdJykpO1xuICAgIGNvbnN0IG1hcHBlZCA9IFtdO1xuICAgIGNvbnN0IHNlZW5TZWxlY3RvcnMgPSBuZXcgU2V0KCk7XG5cbiAgICBmb3IgKGNvbnN0IGVsIG9mIGNhbmRpZGF0ZXMpIHtcbiAgICAgICAgaWYgKCFpc1Zpc2libGUoZWwpKSBjb250aW51ZTtcblxuICAgICAgICBjb25zdCBsYWJlbFRleHQgPSBmaW5kTGFiZWwoZWwpO1xuICAgICAgICBpZiAoIWxhYmVsVGV4dCkgY29udGludWU7XG5cbiAgICAgICAgY29uc3Qgcm9sZSA9IGlkZW50aWZ5Um9sZShsYWJlbFRleHQpO1xuICAgICAgICBjb25zdCBzZWxlY3RvciA9IGdldFVuaXF1ZVNlbGVjdG9yKGVsKTtcblxuICAgICAgICBpZiAocm9sZSAmJiBzZWxlY3RvciAmJiAhc2VlblNlbGVjdG9ycy5oYXMoc2VsZWN0b3IpKSB7XG4gICAgICAgICAgICBtYXBwZWQucHVzaCh7XG4gICAgICAgICAgICAgICAgbGFiZWw6IGxhYmVsVGV4dCxcbiAgICAgICAgICAgICAgICByb2xlOiByb2xlLFxuICAgICAgICAgICAgICAgIHNlbGVjdG9yOiBzZWxlY3RvcixcbiAgICAgICAgICAgICAgICBlZGl0YWJsZTogIWVsLmRpc2FibGVkICYmICFlbC5yZWFkT25seSxcbiAgICAgICAgICAgICAgICB2aXNpYmxlOiB0cnVlXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIHNlZW5TZWxlY3RvcnMuYWRkKHNlbGVjdG9yKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGNvbnN0IGNvbnRleHQgPSBkb2N1bWVudC5ib2R5LmlubmVyVGV4dDsgLy8gQ2FwdHVyZSB2aXNpYmxlIHRleHRcbiAgICBjb25zdCB0aXRsZSA9IGRvY3VtZW50LnRpdGxlO1xuXG4gICAgcmV0dXJuIHtcbiAgICAgICAgZmllbGRzOiBtYXBwZWQsXG4gICAgICAgIHRpdGxlLFxuICAgICAgICBjb250ZXh0XG4gICAgfTtcbn1cblxuY29uc3QgUk9MRVMgPSB7XG4gICAgbmFtZTogL25hbWV8cGF0aWVudHxmaXJzdC4qbmFtZXxsYXN0LipuYW1lL2ksXG4gICAgZG9iOiAvZG9ifGJpcnRofGRhdGUuKmJpcnRoL2ksXG4gICAgZ2VuZGVyOiAvc2V4fGdlbmRlci9pLFxuICAgIG1ybjogL21ybnxyZWNvcmQuKm5vfGlkL2ksXG4gICAgcGhvbmU6IC9waG9uZXxtb2JpbGV8Y2VsbC9pLFxuICAgIGVtYWlsOiAvZW1haWwvaSxcbiAgICBhZGRyZXNzOiAvYWRkcmVzc3xzdHJlZXR8Y2l0eXx6aXAvaSxcbiAgICBjYzogL2NoaWVmLipjb21wbGFpbnR8cmVhc29uLip2aXNpdC9pLFxuICAgIGhwaTogL2hwaXxoaXN0b3J5LippbGxuZXNzfHN0b3J5L2ksXG4gICAgcG1oOiAvbWVkaWNhbC4qaGlzdG9yeXxwYXN0LipoaXN0b3J5L2ksXG4gICAgcHNoOiAvc3VyZ2ljYWwuKmhpc3RvcnkvaSxcbiAgICBmYW1oeDogL2ZhbWlseS4qaGlzdG9yeS9pLFxuICAgIHNvY2h4OiAvc29jaWFsLipoaXN0b3J5L2ksXG4gICAgbWVkczogL21lZGljYXRpb258ZHJ1Z3xyeHxjdXJyZW50LiptZWRzL2ksXG4gICAgYWxsZXJnaWVzOiAvYWxsZXJnL2ksXG4gICAgdml0YWxzOiAvdml0YWx8YnB8Ymxvb2QuKnByZXNzdXJlfHB1bHNlfHRlbXB8d2VpZ2h0fGhlaWdodC9pLFxuICAgIHJvczogL3Jldmlldy4qc3lzdGVtc3xyb3MvaSxcbiAgICBwZTogL3BoeXNpY2FsLipleGFtfG9iamVjdGl2ZS9pLFxuICAgIGFzc2Vzc21lbnQ6IC9hc3Nlc3NtZW50fGRpYWdub3Npc3xpbXByZXNzaW9ufHByb2JsZW0uKmxpc3QvaSxcbiAgICBwbGFuOiAvcGxhbnx0cmVhdG1lbnR8cmVjb21tZW5kYXRpb24vaSxcbiAgICBub3RlOiAvbm90ZXxjb21tZW50fG5hcnJhdGl2ZXxkb2N1bWVudGF0aW9uL2lcbn07XG5cbmZ1bmN0aW9uIGlkZW50aWZ5Um9sZSh0ZXh0KSB7XG4gICAgZm9yIChjb25zdCBbcm9sZSwgcmVnZXhdIG9mIE9iamVjdC5lbnRyaWVzKFJPTEVTKSkge1xuICAgICAgICBpZiAocmVnZXgudGVzdCh0ZXh0KSkgcmV0dXJuIHJvbGU7XG4gICAgfVxuICAgIHJldHVybiBudWxsO1xufVxuXG5mdW5jdGlvbiBmaW5kTGFiZWwoZWwpIHtcbiAgICAvLyAxLiBFeHBsaWNpdCBsYWJlbFxuICAgIGlmIChlbC5pZCkge1xuICAgICAgICBjb25zdCBsYWJlbCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoYGxhYmVsW2Zvcj1cIiR7Q1NTLmVzY2FwZShlbC5pZCl9XCJdYCk7XG4gICAgICAgIGlmIChsYWJlbCAmJiBpc1Zpc2libGUobGFiZWwpKSByZXR1cm4gY2xlYW5UZXh0KGxhYmVsLmlubmVyVGV4dCk7XG4gICAgfVxuXG4gICAgLy8gMi4gQXJpYSBsYWJlbFxuICAgIGlmIChlbC5nZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnKSkgcmV0dXJuIGNsZWFuVGV4dChlbC5nZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnKSk7XG4gICAgaWYgKGVsLmdldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbGxlZGJ5JykpIHtcbiAgICAgICAgY29uc3QgbGFiZWwgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChlbC5nZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWxsZWRieScpKTtcbiAgICAgICAgaWYgKGxhYmVsKSByZXR1cm4gY2xlYW5UZXh0KGxhYmVsLmlubmVyVGV4dCk7XG4gICAgfVxuXG4gICAgLy8gMy4gUGxhY2Vob2xkZXJcbiAgICBpZiAoZWwucGxhY2Vob2xkZXIpIHJldHVybiBjbGVhblRleHQoZWwucGxhY2Vob2xkZXIpO1xuXG4gICAgLy8gNC4gUGFyZW50IGxhYmVsXG4gICAgY29uc3QgcGFyZW50TGFiZWwgPSBlbC5jbG9zZXN0KCdsYWJlbCcpO1xuICAgIGlmIChwYXJlbnRMYWJlbCkge1xuICAgICAgICAvLyBDbG9uZSBhbmQgcmVtb3ZlIHRoZSBpbnB1dCBpdHNlbGYgdG8gZ2V0IGp1c3QgdGhlIHRleHRcbiAgICAgICAgY29uc3QgY2xvbmUgPSBwYXJlbnRMYWJlbC5jbG9uZU5vZGUodHJ1ZSk7XG4gICAgICAgIGNvbnN0IGlucHV0SW5DbG9uZSA9IGNsb25lLnF1ZXJ5U2VsZWN0b3IoJ2lucHV0LCB0ZXh0YXJlYSwgc2VsZWN0Jyk7XG4gICAgICAgIGlmIChpbnB1dEluQ2xvbmUpIGlucHV0SW5DbG9uZS5yZW1vdmUoKTtcbiAgICAgICAgcmV0dXJuIGNsZWFuVGV4dChjbG9uZS5pbm5lclRleHQpO1xuICAgIH1cblxuICAgIC8vIDUuIFByZWNlZGluZyBzaWJsaW5nIG9yIHRleHRcbiAgICBsZXQgcHJldiA9IGVsLnByZXZpb3VzRWxlbWVudFNpYmxpbmc7XG4gICAgaWYgKHByZXYgJiYgaXNWaXNpYmxlKHByZXYpICYmIChwcmV2LnRhZ05hbWUgPT09ICdMQUJFTCcgfHwgcHJldi50YWdOYW1lID09PSAnU1BBTicgfHwgcHJldi50YWdOYW1lID09PSAnRElWJyB8fCBwcmV2LnRhZ05hbWUgPT09ICdCJyB8fCBwcmV2LnRhZ05hbWUgPT09ICdTVFJPTkcnKSkge1xuICAgICAgICByZXR1cm4gY2xlYW5UZXh0KHByZXYuaW5uZXJUZXh0KTtcbiAgICB9XG5cbiAgICAvLyA2LiBUYWJsZSByb3cgaGVhZGVyIChjb21tb24gaW4gRU1ScylcbiAgICBjb25zdCB0ciA9IGVsLmNsb3Nlc3QoJ3RyJyk7XG4gICAgaWYgKHRyKSB7XG4gICAgICAgIGNvbnN0IHRoID0gdHIucXVlcnlTZWxlY3RvcigndGgnKTtcbiAgICAgICAgaWYgKHRoKSByZXR1cm4gY2xlYW5UZXh0KHRoLmlubmVyVGV4dCk7XG4gICAgICAgIGNvbnN0IGZpcnN0VGQgPSB0ci5xdWVyeVNlbGVjdG9yKCd0ZCcpO1xuICAgICAgICBpZiAoZmlyc3RUZCAmJiBmaXJzdFRkICE9PSBlbC5jbG9zZXN0KCd0ZCcpKSByZXR1cm4gY2xlYW5UZXh0KGZpcnN0VGQuaW5uZXJUZXh0KTtcbiAgICB9XG5cbiAgICAvLyA3LiBQcmVjZWRpbmcgdGV4dCBub2RlXG4gICAgbGV0IG5vZGUgPSBlbC5wcmV2aW91c1NpYmxpbmc7XG4gICAgd2hpbGUgKG5vZGUpIHtcbiAgICAgICAgaWYgKG5vZGUubm9kZVR5cGUgPT09IE5vZGUuVEVYVF9OT0RFICYmIG5vZGUudGV4dENvbnRlbnQudHJpbSgpKSB7XG4gICAgICAgICAgICByZXR1cm4gY2xlYW5UZXh0KG5vZGUudGV4dENvbnRlbnQpO1xuICAgICAgICB9XG4gICAgICAgIGlmIChub2RlLm5vZGVUeXBlID09PSBOb2RlLkVMRU1FTlRfTk9ERSkgYnJlYWs7IC8vIFN0b3AgYXQgZWxlbWVudFxuICAgICAgICBub2RlID0gbm9kZS5wcmV2aW91c1NpYmxpbmc7XG4gICAgfVxuXG4gICAgcmV0dXJuIG51bGw7XG59XG5cbmZ1bmN0aW9uIGlzVmlzaWJsZShlbCkge1xuICAgIHJldHVybiAhIShlbC5vZmZzZXRXaWR0aCB8fCBlbC5vZmZzZXRIZWlnaHQgfHwgZWwuZ2V0Q2xpZW50UmVjdHMoKS5sZW5ndGgpO1xufVxuXG5mdW5jdGlvbiBjbGVhblRleHQodGV4dCkge1xuICAgIHJldHVybiB0ZXh0ID8gdGV4dC5yZXBsYWNlKC9bOipdL2csICcnKS50cmltKCkgOiAnJztcbn1cblxuZnVuY3Rpb24gZ2V0VW5pcXVlU2VsZWN0b3IoZWwpIHtcbiAgICBpZiAoZWwuaWQpIHJldHVybiBgIyR7Q1NTLmVzY2FwZShlbC5pZCl9YDtcbiAgICBpZiAoZWwubmFtZSkgcmV0dXJuIGBbbmFtZT1cIiR7Q1NTLmVzY2FwZShlbC5uYW1lKX1cIl1gO1xuXG4gICAgLy8gRmFsbGJhY2sgdG8gcGF0aFxuICAgIGxldCBwYXRoID0gW107XG4gICAgd2hpbGUgKGVsLm5vZGVUeXBlID09PSBOb2RlLkVMRU1FTlRfTk9ERSkge1xuICAgICAgICBsZXQgc2VsZWN0b3IgPSBlbC5ub2RlTmFtZS50b0xvd2VyQ2FzZSgpO1xuICAgICAgICBpZiAoZWwuaWQpIHtcbiAgICAgICAgICAgIHNlbGVjdG9yICs9IGAjJHtDU1MuZXNjYXBlKGVsLmlkKX1gO1xuICAgICAgICAgICAgcGF0aC51bnNoaWZ0KHNlbGVjdG9yKTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgbGV0IHNpYiA9IGVsLCBudGggPSAxO1xuICAgICAgICAgICAgd2hpbGUgKHNpYiA9IHNpYi5wcmV2aW91c0VsZW1lbnRTaWJsaW5nKSB7XG4gICAgICAgICAgICAgICAgaWYgKHNpYi5ub2RlTmFtZS50b0xvd2VyQ2FzZSgpID09PSBzZWxlY3RvcikgbnRoKys7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAobnRoICE9IDEpIHNlbGVjdG9yICs9IGA6bnRoLW9mLXR5cGUoJHtudGh9KWA7XG4gICAgICAgIH1cbiAgICAgICAgcGF0aC51bnNoaWZ0KHNlbGVjdG9yKTtcbiAgICAgICAgZWwgPSBlbC5wYXJlbnROb2RlO1xuICAgIH1cbiAgICByZXR1cm4gcGF0aC5qb2luKFwiID4gXCIpO1xufVxuIiwgImltcG9ydCB7IG1hcERvbSB9IGZyb20gJy4vZG9tTWFwcGVyLmpzJztcblxuY29uc3QgVE9HR0xFX0JVVFRPTl9JRCA9ICdfX2FuY2hvcl9naG9zdF90b2dnbGVfXyc7XG5jb25zdCBPVkVSTEFZX0hPU1RfSUQgPSAnX19hbmNob3JfZ2hvc3Rfb3ZlcmxheV9fJztcbmNvbnN0IE1BWF9GSUVMRFNfVklTSUJMRSA9IDg7XG5cbmxldCBzaGFkb3dSb290ID0gbnVsbDtcbmxldCBzdGF0dXMgPSB7IG1vZGU6ICdjbGluaWNpYW4nLCBtYXBwZWRDb3VudDogMCwgbGFzdEFjdGlvbjogJ0lkbGUnLCBhY3RpdmVUYWI6ICdmaWVsZHMnIH07XG5cbmxldCBsYXN0TWFwcGVkID0gW107XG5sZXQgbGFzdFBsYW4gPSBudWxsO1xubGV0IGxhc3RTbmFwc2hvdCA9IG51bGw7XG5cbmV4cG9ydCBmdW5jdGlvbiBpbml0T3ZlcmxheSgpIHtcbiAgZW5zdXJlVG9nZ2xlQnV0dG9uKCk7XG4gIGVuc3VyZU92ZXJsYXkoKTtcbiAgYXR0YWNoQXBpKCk7XG59XG5cbmZ1bmN0aW9uIGVuc3VyZVRvZ2dsZUJ1dHRvbigpIHtcbiAgaWYgKGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFRPR0dMRV9CVVRUT05fSUQpKSByZXR1cm47XG5cbiAgY29uc3QgYnRuID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG4gIGJ0bi5pZCA9IFRPR0dMRV9CVVRUT05fSUQ7XG4gIGJ0bi5pbm5lckhUTUwgPSBgXG4gICAgICA8c3ZnIHdpZHRoPVwiMjRcIiBoZWlnaHQ9XCIyNFwiIHZpZXdCb3g9XCIwIDAgMjQgMjRcIiBmaWxsPVwibm9uZVwiIHhtbG5zPVwiaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmdcIj5cbiAgICAgICAgPHBhdGggZD1cIk0xMiAyTDIgN0wxMiAxMkwyMiA3TDEyIDJaXCIgc3Ryb2tlPVwiY3VycmVudENvbG9yXCIgc3Ryb2tlLXdpZHRoPVwiMlwiIHN0cm9rZS1saW5lY2FwPVwicm91bmRcIiBzdHJva2UtbGluZWpvaW49XCJyb3VuZFwiLz5cbiAgICAgICAgPHBhdGggZD1cIk0yIDE3TDEyIDIyTDIyIDE3XCIgc3Ryb2tlPVwiY3VycmVudENvbG9yXCIgc3Ryb2tlLXdpZHRoPVwiMlwiIHN0cm9rZS1saW5lY2FwPVwicm91bmRcIiBzdHJva2UtbGluZWpvaW49XCJyb3VuZFwiLz5cbiAgICAgICAgPHBhdGggZD1cIk0yIDEyTDEyIDE3TDIyIDEyXCIgc3Ryb2tlPVwiY3VycmVudENvbG9yXCIgc3Ryb2tlLXdpZHRoPVwiMlwiIHN0cm9rZS1saW5lY2FwPVwicm91bmRcIiBzdHJva2UtbGluZWpvaW49XCJyb3VuZFwiLz5cbiAgICAgIDwvc3ZnPlxuICAgIGA7XG5cbiAgLy8gSW5pdGlhbCBzdHlsZXMgZm9yIHRoZSBGQUJcbiAgT2JqZWN0LmFzc2lnbihidG4uc3R5bGUsIHtcbiAgICBwb3NpdGlvbjogJ2ZpeGVkJyxcbiAgICB0b3A6ICcyMHB4JyxcbiAgICByaWdodDogJzIwcHgnLFxuICAgIHpJbmRleDogJzIxNDc0ODM2NDYnLFxuICAgIHdpZHRoOiAnNDhweCcsXG4gICAgaGVpZ2h0OiAnNDhweCcsXG4gICAgYm9yZGVyUmFkaXVzOiAnMTZweCcsXG4gICAgYmFja2dyb3VuZDogJ3JnYmEoMTUsIDIzLCA0MiwgMC42KScsXG4gICAgYmFja2Ryb3BGaWx0ZXI6ICdibHVyKDEycHgpJyxcbiAgICBib3JkZXI6ICcxcHggc29saWQgcmdiYSgyNTUsIDI1NSwgMjU1LCAwLjEpJyxcbiAgICBib3hTaGFkb3c6ICcwIDhweCAzMnB4IHJnYmEoMCwgMCwgMCwgMC4yKScsXG4gICAgY29sb3I6ICcjMzhiZGY4JyxcbiAgICBkaXNwbGF5OiAnZmxleCcsXG4gICAgYWxpZ25JdGVtczogJ2NlbnRlcicsXG4gICAganVzdGlmeUNvbnRlbnQ6ICdjZW50ZXInLFxuICAgIGN1cnNvcjogJ3BvaW50ZXInLFxuICAgIHRyYW5zaXRpb246ICd0cmFuc2Zvcm0gMC4xcyBjdWJpYy1iZXppZXIoMC40LCAwLCAwLjIsIDEpLCBiYWNrZ3JvdW5kIDAuMXMnLFxuICAgIHVzZXJTZWxlY3Q6ICdub25lJ1xuICB9KTtcblxuICAvLyBIb3ZlciBlZmZlY3RcbiAgYnRuLm9ubW91c2VlbnRlciA9ICgpID0+IHtcbiAgICBidG4uc3R5bGUuYmFja2dyb3VuZCA9ICdyZ2JhKDE1LCAyMywgNDIsIDAuOCknO1xuICAgIGJ0bi5zdHlsZS50cmFuc2Zvcm0gPSAnc2NhbGUoMS4wNSknO1xuICB9O1xuICBidG4ub25tb3VzZWxlYXZlID0gKCkgPT4ge1xuICAgIGJ0bi5zdHlsZS5iYWNrZ3JvdW5kID0gJ3JnYmEoMTUsIDIzLCA0MiwgMC42KSc7XG4gICAgYnRuLnN0eWxlLnRyYW5zZm9ybSA9ICdzY2FsZSgxKSc7XG4gIH07XG5cbiAgLy8gQ2xpY2sgaGFuZGxlciAoZGlzdGluZ3Vpc2ggZnJvbSBkcmFnKVxuICBsZXQgaXNEcmFnZ2luZyA9IGZhbHNlO1xuICBidG4uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiB7XG4gICAgaWYgKCFpc0RyYWdnaW5nKSB0b2dnbGVQYW5lbCgpO1xuICB9KTtcblxuICBtYWtlRHJhZ2dhYmxlKGJ0biwgKCkgPT4geyBpc0RyYWdnaW5nID0gdHJ1ZTsgfSwgKCkgPT4geyBzZXRUaW1lb3V0KCgpID0+IGlzRHJhZ2dpbmcgPSBmYWxzZSwgNTApOyB9KTtcblxuICBkb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKGJ0bik7XG59XG5cbmZ1bmN0aW9uIG1ha2VEcmFnZ2FibGUoZWwsIG9uRHJhZ1N0YXJ0LCBvbkRyYWdFbmQpIHtcbiAgbGV0IGlzRG93biA9IGZhbHNlO1xuICBsZXQgaGFzTW92ZWQgPSBmYWxzZTtcbiAgbGV0IHN0YXJ0WCwgc3RhcnRZLCBpbml0aWFsTGVmdCwgaW5pdGlhbFRvcDtcblxuICBlbC5hZGRFdmVudExpc3RlbmVyKCdtb3VzZWRvd24nLCAoZSkgPT4ge1xuICAgIGlzRG93biA9IHRydWU7XG4gICAgaGFzTW92ZWQgPSBmYWxzZTtcbiAgICBzdGFydFggPSBlLmNsaWVudFg7XG4gICAgc3RhcnRZID0gZS5jbGllbnRZO1xuICAgIGNvbnN0IHJlY3QgPSBlbC5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcbiAgICBpbml0aWFsTGVmdCA9IHJlY3QubGVmdDtcbiAgICBpbml0aWFsVG9wID0gcmVjdC50b3A7XG5cbiAgICAvLyBEb24ndCBzZXQgc3R5bGUgeWV0LCB3YWl0IGZvciBtb3ZlXG4gIH0pO1xuXG4gIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdtb3VzZW1vdmUnLCAoZSkgPT4ge1xuICAgIGlmICghaXNEb3duKSByZXR1cm47XG5cbiAgICBjb25zdCBkeCA9IGUuY2xpZW50WCAtIHN0YXJ0WDtcbiAgICBjb25zdCBkeSA9IGUuY2xpZW50WSAtIHN0YXJ0WTtcblxuICAgIC8vIE9ubHkgc3RhcnQgZHJhZ2dpbmcgaWYgbW92ZWQgbW9yZSB0aGFuIDVweFxuICAgIGlmICghaGFzTW92ZWQgJiYgKE1hdGguYWJzKGR4KSA+IDUgfHwgTWF0aC5hYnMoZHkpID4gNSkpIHtcbiAgICAgIGhhc01vdmVkID0gdHJ1ZTtcbiAgICAgIGlmIChvbkRyYWdTdGFydCkgb25EcmFnU3RhcnQoKTtcbiAgICAgIC8vIFN3aXRjaCB0byBhYnNvbHV0ZSBwb3NpdGlvbmluZyBmb3IgZHJhZ1xuICAgICAgZWwuc3R5bGUucmlnaHQgPSAnYXV0byc7XG4gICAgICBlbC5zdHlsZS5sZWZ0ID0gYCR7aW5pdGlhbExlZnR9cHhgO1xuICAgICAgZWwuc3R5bGUudG9wID0gYCR7aW5pdGlhbFRvcH1weGA7XG4gICAgfVxuXG4gICAgaWYgKGhhc01vdmVkKSB7XG4gICAgICBlbC5zdHlsZS5sZWZ0ID0gYCR7aW5pdGlhbExlZnQgKyBkeH1weGA7XG4gICAgICBlbC5zdHlsZS50b3AgPSBgJHtpbml0aWFsVG9wICsgZHl9cHhgO1xuICAgIH1cbiAgfSk7XG5cbiAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ21vdXNldXAnLCAoKSA9PiB7XG4gICAgaWYgKGlzRG93bikge1xuICAgICAgaXNEb3duID0gZmFsc2U7XG4gICAgICBpZiAoaGFzTW92ZWQgJiYgb25EcmFnRW5kKSB7XG4gICAgICAgIG9uRHJhZ0VuZCgpO1xuICAgICAgfVxuICAgIH1cbiAgfSk7XG59XG5cbmZ1bmN0aW9uIGVuc3VyZU92ZXJsYXkoKSB7XG4gIGlmIChkb2N1bWVudC5nZXRFbGVtZW50QnlJZChPVkVSTEFZX0hPU1RfSUQpKSByZXR1cm47XG5cbiAgY29uc3QgaG9zdCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuICBob3N0LmlkID0gT1ZFUkxBWV9IT1NUX0lEO1xuICBob3N0LnN0eWxlLnBvc2l0aW9uID0gJ2ZpeGVkJztcbiAgaG9zdC5zdHlsZS50b3AgPSAnODBweCc7XG4gIGhvc3Quc3R5bGUucmlnaHQgPSAnMjBweCc7XG4gIGhvc3Quc3R5bGUuekluZGV4ID0gJzIxNDc0ODM2NDcnO1xuICBob3N0LnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7IC8vIEhpZGRlbiBieSBkZWZhdWx0XG4gIGRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQoaG9zdCk7XG5cbiAgc2hhZG93Um9vdCA9IGhvc3QuYXR0YWNoU2hhZG93KHsgbW9kZTogJ29wZW4nIH0pO1xuICBzaGFkb3dSb290LmlubmVySFRNTCA9IGdldE92ZXJsYXlIdG1sKCk7XG4gIHdpcmVPdmVybGF5SGFuZGxlcnMoKTtcbn1cblxuZnVuY3Rpb24gZ2V0T3ZlcmxheUh0bWwoKSB7XG4gIHJldHVybiAvKiBodG1sICovIGBcbiAgICA8c3R5bGU+XG4gICAgICA6aG9zdCB7XG4gICAgICAgIGFsbDogaW5pdGlhbDtcbiAgICAgICAgZm9udC1mYW1pbHk6ICdJbnRlcicsIHN5c3RlbS11aSwgLWFwcGxlLXN5c3RlbSwgc2Fucy1zZXJpZjtcbiAgICAgICAgLS1nbGFzcy1iZzogcmdiYSg1LCA1LCAxMCwgMC45KTtcbiAgICAgICAgLS1nbGFzcy1ib3JkZXI6IHJnYmEoMjU1LCAyNTUsIDI1NSwgMC4wNSk7XG4gICAgICAgIC0tZ2xhc3Mtc2hhZG93OiAwIDIwcHggNTBweCAtMTJweCByZ2JhKDAsIDAsIDAsIDAuNyk7XG4gICAgICAgIC0tYWNjZW50OiAjMzhiZGY4O1xuICAgICAgICAtLWFjY2VudC1nbG93OiByZ2JhKDU2LCAxODksIDI0OCwgMC4yKTtcbiAgICAgICAgLS10ZXh0LW1haW46ICNmZmZmZmY7XG4gICAgICAgIC0tdGV4dC1tdXRlZDogIzk0YTNiODtcbiAgICAgICAgLS1kYW5nZXI6ICNlZjQ0NDQ7XG4gICAgICAgIC0tc3VjY2VzczogIzEwYjk4MTtcbiAgICAgIH1cblxuICAgICAgLnBhbmVsIHtcbiAgICAgICAgd2lkdGg6IDM2MHB4O1xuICAgICAgICBiYWNrZ3JvdW5kOiB2YXIoLS1nbGFzcy1iZyk7XG4gICAgICAgIGJhY2tkcm9wLWZpbHRlcjogYmx1cigyMHB4KTtcbiAgICAgICAgLXdlYmtpdC1iYWNrZHJvcC1maWx0ZXI6IGJsdXIoMjBweCk7XG4gICAgICAgIGJvcmRlcjogMXB4IHNvbGlkIHZhcigtLWdsYXNzLWJvcmRlcik7XG4gICAgICAgIGJvcmRlci1yYWRpdXM6IDI0cHg7XG4gICAgICAgIGJveC1zaGFkb3c6IHZhcigtLWdsYXNzLXNoYWRvdyk7XG4gICAgICAgIGNvbG9yOiB2YXIoLS10ZXh0LW1haW4pO1xuICAgICAgICBkaXNwbGF5OiBmbGV4O1xuICAgICAgICBmbGV4LWRpcmVjdGlvbjogY29sdW1uO1xuICAgICAgICBvdmVyZmxvdzogaGlkZGVuO1xuICAgICAgICBhbmltYXRpb246IHNsaWRlSW4gMC4xNXMgY3ViaWMtYmV6aWVyKDAuMTYsIDEsIDAuMywgMSk7XG4gICAgICAgIHRyYW5zZm9ybS1vcmlnaW46IHRvcCByaWdodDtcbiAgICAgIH1cblxuICAgICAgQGtleWZyYW1lcyBzbGlkZUluIHtcbiAgICAgICAgZnJvbSB7IG9wYWNpdHk6IDA7IHRyYW5zZm9ybTogc2NhbGUoMC45NSkgdHJhbnNsYXRlWSgtMTBweCk7IH1cbiAgICAgICAgdG8geyBvcGFjaXR5OiAxOyB0cmFuc2Zvcm06IHNjYWxlKDEpIHRyYW5zbGF0ZVkoMCk7IH1cbiAgICAgIH1cblxuICAgICAgLyogSGVhZGVyICovXG4gICAgICBoZWFkZXIge1xuICAgICAgICBwYWRkaW5nOiAxNnB4IDIwcHg7XG4gICAgICAgIGRpc3BsYXk6IGZsZXg7XG4gICAgICAgIGFsaWduLWl0ZW1zOiBjZW50ZXI7XG4gICAgICAgIGp1c3RpZnktY29udGVudDogc3BhY2UtYmV0d2VlbjtcbiAgICAgICAgYm9yZGVyLWJvdHRvbTogMXB4IHNvbGlkIHZhcigtLWdsYXNzLWJvcmRlcik7XG4gICAgICAgIGJhY2tncm91bmQ6IGxpbmVhci1ncmFkaWVudCh0byByaWdodCwgcmdiYSgyNTUsMjU1LDI1NSwwLjAyKSwgdHJhbnNwYXJlbnQpO1xuICAgICAgfVxuXG4gICAgICAuYnJhbmQge1xuICAgICAgICBkaXNwbGF5OiBmbGV4O1xuICAgICAgICBhbGlnbi1pdGVtczogY2VudGVyO1xuICAgICAgICBnYXA6IDhweDtcbiAgICAgICAgZm9udC13ZWlnaHQ6IDYwMDtcbiAgICAgICAgZm9udC1zaXplOiAxNHB4O1xuICAgICAgICBsZXR0ZXItc3BhY2luZzogLTAuMDFlbTtcbiAgICAgIH1cblxuICAgICAgLmJyYW5kIHN2ZyB7XG4gICAgICAgIHdpZHRoOiAxOHB4O1xuICAgICAgICBoZWlnaHQ6IDE4cHg7XG4gICAgICAgIGNvbG9yOiB2YXIoLS1hY2NlbnQpO1xuICAgICAgICBmaWx0ZXI6IGRyb3Atc2hhZG93KDAgMCA4cHggdmFyKC0tYWNjZW50LWdsb3cpKTtcbiAgICAgIH1cblxuICAgICAgLnN0YXR1cy1iYWRnZSB7XG4gICAgICAgIGZvbnQtc2l6ZTogMTBweDtcbiAgICAgICAgZm9udC13ZWlnaHQ6IDYwMDtcbiAgICAgICAgcGFkZGluZzogNHB4IDhweDtcbiAgICAgICAgYm9yZGVyLXJhZGl1czogOTlweDtcbiAgICAgICAgYmFja2dyb3VuZDogcmdiYSg1NiwgMTg5LCAyNDgsIDAuMSk7XG4gICAgICAgIGNvbG9yOiB2YXIoLS1hY2NlbnQpO1xuICAgICAgICBib3JkZXI6IDFweCBzb2xpZCByZ2JhKDU2LCAxODksIDI0OCwgMC4yKTtcbiAgICAgICAgdGV4dC10cmFuc2Zvcm06IHVwcGVyY2FzZTtcbiAgICAgICAgbGV0dGVyLXNwYWNpbmc6IDAuMDVlbTtcbiAgICAgIH1cblxuICAgICAgLyogQ29udGVudCBBcmVhICovXG4gICAgICAuY29udGVudCB7XG4gICAgICAgIHBhZGRpbmc6IDA7XG4gICAgICAgIG1heC1oZWlnaHQ6IDYwdmg7XG4gICAgICAgIG92ZXJmbG93LXk6IGF1dG87XG4gICAgICB9XG5cbiAgICAgIC5jb250ZW50Ojotd2Via2l0LXNjcm9sbGJhciB7XG4gICAgICAgIHdpZHRoOiA0cHg7XG4gICAgICB9XG4gICAgICAuY29udGVudDo6LXdlYmtpdC1zY3JvbGxiYXItdGh1bWIge1xuICAgICAgICBiYWNrZ3JvdW5kOiByZ2JhKDI1NSwyNTUsMjU1LDAuMSk7XG4gICAgICAgIGJvcmRlci1yYWRpdXM6IDRweDtcbiAgICAgIH1cblxuICAgICAgLyogVGFicyAoTW9jaykgKi9cbiAgICAgIC50YWJzIHtcbiAgICAgICAgZGlzcGxheTogZmxleDtcbiAgICAgICAgcGFkZGluZzogMCAxNnB4O1xuICAgICAgICBib3JkZXItYm90dG9tOiAxcHggc29saWQgdmFyKC0tZ2xhc3MtYm9yZGVyKTtcbiAgICAgICAgbWFyZ2luLXRvcDogOHB4O1xuICAgICAgfVxuICAgICAgLnRhYiB7XG4gICAgICAgIHBhZGRpbmc6IDhweCAxMnB4O1xuICAgICAgICBmb250LXNpemU6IDEycHg7XG4gICAgICAgIGNvbG9yOiB2YXIoLS10ZXh0LW11dGVkKTtcbiAgICAgICAgY3Vyc29yOiBwb2ludGVyO1xuICAgICAgICBib3JkZXItYm90dG9tOiAycHggc29saWQgdHJhbnNwYXJlbnQ7XG4gICAgICAgIHRyYW5zaXRpb246IGFsbCAwLjJzO1xuICAgICAgfVxuICAgICAgLnRhYi5hY3RpdmUge1xuICAgICAgICBjb2xvcjogdmFyKC0tdGV4dC1tYWluKTtcbiAgICAgICAgYm9yZGVyLWJvdHRvbS1jb2xvcjogdmFyKC0tYWNjZW50KTtcbiAgICAgIH1cblxuICAgICAgLyogU2VjdGlvbnMgKi9cbiAgICAgIC5zZWN0aW9uIHtcbiAgICAgICAgcGFkZGluZzogMTZweCAyMHB4O1xuICAgICAgfVxuXG4gICAgICAuc2VjdGlvbi1oZWFkZXIge1xuICAgICAgICBkaXNwbGF5OiBmbGV4O1xuICAgICAgICBqdXN0aWZ5LWNvbnRlbnQ6IHNwYWNlLWJldHdlZW47XG4gICAgICAgIGFsaWduLWl0ZW1zOiBjZW50ZXI7XG4gICAgICAgIG1hcmdpbi1ib3R0b206IDEycHg7XG4gICAgICB9XG5cbiAgICAgIC5zZWN0aW9uLXRpdGxlIHtcbiAgICAgICAgZm9udC1zaXplOiAxMXB4O1xuICAgICAgICB0ZXh0LXRyYW5zZm9ybTogdXBwZXJjYXNlO1xuICAgICAgICBsZXR0ZXItc3BhY2luZzogMC4wOGVtO1xuICAgICAgICBjb2xvcjogdmFyKC0tdGV4dC1tdXRlZCk7XG4gICAgICAgIGZvbnQtd2VpZ2h0OiA2MDA7XG4gICAgICB9XG5cbiAgICAgIC8qIEZpZWxkcyBMaXN0ICovXG4gICAgICAuZmllbGQtbGlzdCB7XG4gICAgICAgIGRpc3BsYXk6IGZsZXg7XG4gICAgICAgIGZsZXgtZGlyZWN0aW9uOiBjb2x1bW47XG4gICAgICAgIGdhcDogOHB4O1xuICAgICAgfVxuXG4gICAgICAuZmllbGQtaXRlbSB7XG4gICAgICAgIGRpc3BsYXk6IGZsZXg7XG4gICAgICAgIGp1c3RpZnktY29udGVudDogc3BhY2UtYmV0d2VlbjtcbiAgICAgICAgYWxpZ24taXRlbXM6IGNlbnRlcjtcbiAgICAgICAgcGFkZGluZzogOHB4IDEycHg7XG4gICAgICAgIGJhY2tncm91bmQ6IHJnYmEoMjU1LDI1NSwyNTUsMC4wMyk7XG4gICAgICAgIGJvcmRlci1yYWRpdXM6IDhweDtcbiAgICAgICAgYm9yZGVyOiAxcHggc29saWQgdHJhbnNwYXJlbnQ7XG4gICAgICAgIHRyYW5zaXRpb246IGFsbCAwLjJzO1xuICAgICAgfVxuXG4gICAgICAuZmllbGQtaXRlbTpob3ZlciB7XG4gICAgICAgIGJhY2tncm91bmQ6IHJnYmEoMjU1LDI1NSwyNTUsMC4wNik7XG4gICAgICAgIGJvcmRlci1jb2xvcjogcmdiYSgyNTUsMjU1LDI1NSwwLjEpO1xuICAgICAgfVxuXG4gICAgICAuZmllbGQtbmFtZSB7XG4gICAgICAgIGZvbnQtc2l6ZTogMTJweDtcbiAgICAgICAgZm9udC13ZWlnaHQ6IDUwMDtcbiAgICAgIH1cbiAgICAgIC5maWVsZC1tZXRhIHtcbiAgICAgICAgZm9udC1zaXplOiAxMHB4O1xuICAgICAgICBjb2xvcjogdmFyKC0tdGV4dC1tdXRlZCk7XG4gICAgICB9XG5cbiAgICAgIC8qIEFjdGlvbnMgR3JpZCAqL1xuICAgICAgLmFjdGlvbnMtZ3JpZCB7XG4gICAgICAgIGRpc3BsYXk6IGdyaWQ7XG4gICAgICAgIGdyaWQtdGVtcGxhdGUtY29sdW1uczogMWZyIDFmcjtcbiAgICAgICAgZ2FwOiA4cHg7XG4gICAgICAgIHBhZGRpbmc6IDE2cHggMjBweDtcbiAgICAgICAgYmFja2dyb3VuZDogcmdiYSgwLDAsMCwwLjIpO1xuICAgICAgICBib3JkZXItdG9wOiAxcHggc29saWQgdmFyKC0tZ2xhc3MtYm9yZGVyKTtcbiAgICAgIH1cblxuICAgICAgYnV0dG9uLmJ0biB7XG4gICAgICAgIGRpc3BsYXk6IGZsZXg7XG4gICAgICAgIGFsaWduLWl0ZW1zOiBjZW50ZXI7XG4gICAgICAgIGp1c3RpZnktY29udGVudDogY2VudGVyO1xuICAgICAgICBnYXA6IDZweDtcbiAgICAgICAgcGFkZGluZzogMTBweDtcbiAgICAgICAgYm9yZGVyLXJhZGl1czogMTJweDtcbiAgICAgICAgYm9yZGVyOiBub25lO1xuICAgICAgICBmb250LXNpemU6IDEycHg7XG4gICAgICAgIGZvbnQtd2VpZ2h0OiA2MDA7XG4gICAgICAgIGN1cnNvcjogcG9pbnRlcjtcbiAgICAgICAgdHJhbnNpdGlvbjogYWxsIDAuMnM7XG4gICAgICB9XG5cbiAgICAgIGJ1dHRvbi5idG4tcHJpbWFyeSB7XG4gICAgICAgIGJhY2tncm91bmQ6IHZhcigtLWFjY2VudCk7XG4gICAgICAgIGNvbG9yOiAjMGYxNzJhO1xuICAgICAgICBib3gtc2hhZG93OiAwIDRweCAxMnB4IHJnYmEoNTYsIDE4OSwgMjQ4LCAwLjI1KTtcbiAgICAgIH1cbiAgICAgIGJ1dHRvbi5idG4tcHJpbWFyeTpob3ZlciB7XG4gICAgICAgIGZpbHRlcjogYnJpZ2h0bmVzcygxLjEpO1xuICAgICAgICB0cmFuc2Zvcm06IHRyYW5zbGF0ZVkoLTFweCk7XG4gICAgICB9XG4gICAgICBidXR0b24uYnRuLXByaW1hcnk6YWN0aXZlIHtcbiAgICAgICAgdHJhbnNmb3JtOiB0cmFuc2xhdGVZKDApO1xuICAgICAgfVxuXG4gICAgICBidXR0b24uYnRuLXNlY29uZGFyeSB7XG4gICAgICAgIGJhY2tncm91bmQ6IHJnYmEoMjU1LDI1NSwyNTUsMC4wNSk7XG4gICAgICAgIGNvbG9yOiB2YXIoLS10ZXh0LW1haW4pO1xuICAgICAgICBib3JkZXI6IDFweCBzb2xpZCByZ2JhKDI1NSwyNTUsMjU1LDAuMSk7XG4gICAgICB9XG4gICAgICBidXR0b24uYnRuLXNlY29uZGFyeTpob3ZlciB7XG4gICAgICAgIGJhY2tncm91bmQ6IHJnYmEoMjU1LDI1NSwyNTUsMC4xKTtcbiAgICAgIH1cblxuICAgICAgLyogTG9nICovXG4gICAgICAubG9nLWNvbnRhaW5lciB7XG4gICAgICAgIG1heC1oZWlnaHQ6IDgwcHg7XG4gICAgICAgIG92ZXJmbG93LXk6IGF1dG87XG4gICAgICAgIGZvbnQtZmFtaWx5OiAnTWVubG8nLCBtb25vc3BhY2U7XG4gICAgICAgIGZvbnQtc2l6ZTogMTBweDtcbiAgICAgICAgY29sb3I6IHZhcigtLXRleHQtbXV0ZWQpO1xuICAgICAgICBwYWRkaW5nOiAxMnB4IDIwcHg7XG4gICAgICAgIGJvcmRlci10b3A6IDFweCBzb2xpZCB2YXIoLS1nbGFzcy1ib3JkZXIpO1xuICAgICAgICBiYWNrZ3JvdW5kOiByZ2JhKDAsMCwwLDAuMyk7XG4gICAgICB9XG4gICAgICAubG9nLWVudHJ5IHsgbWFyZ2luLWJvdHRvbTogNHB4OyB9XG4gICAgICAubG9nLWVudHJ5LmVycm9yIHsgY29sb3I6IHZhcigtLWRhbmdlcik7IH1cbiAgICAgIC5sb2ctZW50cnkuc3VjY2VzcyB7IGNvbG9yOiB2YXIoLS1zdWNjZXNzKTsgfVxuXG4gICAgICAvKiBFbXB0eSBTdGF0ZSAqL1xuICAgICAgLmVtcHR5LXN0YXRlIHtcbiAgICAgICAgdGV4dC1hbGlnbjogY2VudGVyO1xuICAgICAgICBwYWRkaW5nOiAyNHB4IDA7XG4gICAgICAgIGNvbG9yOiB2YXIoLS10ZXh0LW11dGVkKTtcbiAgICAgICAgZm9udC1zaXplOiAxMnB4O1xuICAgICAgICBmb250LXN0eWxlOiBpdGFsaWM7XG4gICAgICB9XG4gICAgPC9zdHlsZT5cblxuICAgIDxkaXYgY2xhc3M9XCJwYW5lbFwiPlxuICAgICAgPGhlYWRlcj5cbiAgICAgICAgPGRpdiBjbGFzcz1cImJyYW5kXCI+XG4gICAgICAgICAgPHN2ZyB2aWV3Qm94PVwiMCAwIDI0IDI0XCIgZmlsbD1cIm5vbmVcIiBzdHJva2U9XCJjdXJyZW50Q29sb3JcIiBzdHJva2Utd2lkdGg9XCIyXCI+XG4gICAgICAgICAgICA8cGF0aCBkPVwiTTEyIDJMMiA3TDEyIDEyTDIyIDdMMTIgMlpcIi8+XG4gICAgICAgICAgICA8cGF0aCBkPVwiTTIgMTdMMTIgMjJMMjIgMTdcIi8+XG4gICAgICAgICAgICA8cGF0aCBkPVwiTTIgMTJMMTIgMTdMMjIgMTJcIi8+XG4gICAgICAgICAgPC9zdmc+XG4gICAgICAgICAgQW5jaG9yXG4gICAgICAgIDwvZGl2PlxuICAgICAgICA8ZGl2IGNsYXNzPVwic3RhdHVzLWJhZGdlXCIgaWQ9XCJzdGF0dXMtYmFkZ2VcIj5JZGxlPC9kaXY+XG4gICAgICA8L2hlYWRlcj5cblxuICAgICAgPGRpdiBjbGFzcz1cInRhYnNcIj5cbiAgICAgICAgPGRpdiBjbGFzcz1cInRhYiBhY3RpdmVcIiBpZD1cInRhYi1maWVsZHNcIiBkYXRhLXRhcmdldD1cImZpZWxkc1wiPkZpZWxkczwvZGl2PlxuICAgICAgICA8ZGl2IGNsYXNzPVwidGFiXCIgaWQ9XCJ0YWItbm90ZXNcIiBkYXRhLXRhcmdldD1cIm5vdGVzXCI+Tm90ZXM8L2Rpdj5cbiAgICAgICAgPGRpdiBjbGFzcz1cInRhYlwiIGlkPVwidGFiLXNldHRpbmdzXCIgZGF0YS10YXJnZXQ9XCJzZXR0aW5nc1wiPlNldHRpbmdzPC9kaXY+XG4gICAgICA8L2Rpdj5cblxuICAgICAgPGRpdiBjbGFzcz1cImNvbnRlbnRcIj5cbiAgICAgICAgPCEtLSBGaWVsZHMgVmlldyAtLT5cbiAgICAgICAgPGRpdiBpZD1cInZpZXctZmllbGRzXCIgY2xhc3M9XCJ2aWV3LXNlY3Rpb25cIj5cbiAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJzZWN0aW9uXCI+XG4gICAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJzZWN0aW9uLWhlYWRlclwiPlxuICAgICAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJzZWN0aW9uLXRpdGxlXCI+TWFwcGVkIEVsZW1lbnRzPC9kaXY+XG4gICAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgICA8ZGl2IGlkPVwiZmllbGRzLWxpc3RcIiBjbGFzcz1cImZpZWxkLWxpc3RcIj5cbiAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzPVwiZW1wdHktc3RhdGVcIj5ObyBmaWVsZHMgbWFwcGVkIHlldC4gQ2xpY2sgXCJNYXBcIiB0byBzdGFydC48L2Rpdj5cbiAgICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgPC9kaXY+XG5cbiAgICAgICAgPCEtLSBOb3RlcyBWaWV3IC0tPlxuICAgICAgICA8ZGl2IGlkPVwidmlldy1ub3Rlc1wiIGNsYXNzPVwidmlldy1zZWN0aW9uXCIgc3R5bGU9XCJkaXNwbGF5OiBub25lO1wiPlxuICAgICAgICAgICAgPGRpdiBjbGFzcz1cInNlY3Rpb25cIj5cbiAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzPVwic2VjdGlvbi1oZWFkZXJcIj5cbiAgICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzcz1cInNlY3Rpb24tdGl0bGVcIj5DbGluaWNhbCBOb3RlPC9kaXY+XG4gICAgICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICAgICAgPHRleHRhcmVhIGlkPVwibm90ZS1lZGl0b3JcIiBzdHlsZT1cIndpZHRoOiAxMDAlOyBoZWlnaHQ6IDIwMHB4OyBiYWNrZ3JvdW5kOiByZ2JhKDAsMCwwLDAuMyk7IGJvcmRlcjogMXB4IHNvbGlkIHZhcigtLWdsYXNzLWJvcmRlcik7IGNvbG9yOiB2YXIoLS10ZXh0LW1haW4pOyBwYWRkaW5nOiA4cHg7IGJvcmRlci1yYWRpdXM6IDhweDsgZm9udC1mYW1pbHk6IGluaGVyaXQ7IGZvbnQtc2l6ZTogMTJweDsgcmVzaXplOiBub25lO1wiIHBsYWNlaG9sZGVyPVwiQUkgZ2VuZXJhdGVkIG5vdGUgd2lsbCBhcHBlYXIgaGVyZS4uLlwiPjwvdGV4dGFyZWE+XG4gICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgPC9kaXY+XG5cbiAgICAgICAgPCEtLSBTZXR0aW5ncyBWaWV3IC0tPlxuICAgICAgICA8ZGl2IGlkPVwidmlldy1zZXR0aW5nc1wiIGNsYXNzPVwidmlldy1zZWN0aW9uXCIgc3R5bGU9XCJkaXNwbGF5OiBub25lO1wiPlxuICAgICAgICAgICAgPGRpdiBjbGFzcz1cInNlY3Rpb25cIj5cbiAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzPVwic2VjdGlvbi1oZWFkZXJcIj5cbiAgICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzcz1cInNlY3Rpb24tdGl0bGVcIj5QcmVmZXJlbmNlczwvZGl2PlxuICAgICAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgICAgIDxkaXYgc3R5bGU9XCJkaXNwbGF5OiBmbGV4OyBmbGV4LWRpcmVjdGlvbjogY29sdW1uOyBnYXA6IDEycHg7XCI+XG4gICAgICAgICAgICAgICAgICAgIDxkaXYgc3R5bGU9XCJkaXNwbGF5OiBmbGV4OyBqdXN0aWZ5LWNvbnRlbnQ6IHNwYWNlLWJldHdlZW47IGFsaWduLWl0ZW1zOiBjZW50ZXI7XCI+XG4gICAgICAgICAgICAgICAgICAgICAgICA8c3BhbiBzdHlsZT1cImZvbnQtc2l6ZTogMTJweDtcIj5BdXRvLU1hcCBvbiBMb2FkPC9zcGFuPlxuICAgICAgICAgICAgICAgICAgICAgICAgPGlucHV0IHR5cGU9XCJjaGVja2JveFwiIGNoZWNrZWQ+XG4gICAgICAgICAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgICAgICAgICA8ZGl2IHN0eWxlPVwiZGlzcGxheTogZmxleDsganVzdGlmeS1jb250ZW50OiBzcGFjZS1iZXR3ZWVuOyBhbGlnbi1pdGVtczogY2VudGVyO1wiPlxuICAgICAgICAgICAgICAgICAgICAgICAgPHNwYW4gc3R5bGU9XCJmb250LXNpemU6IDEycHg7XCI+RGFyayBNb2RlPC9zcGFuPlxuICAgICAgICAgICAgICAgICAgICAgICAgPGlucHV0IHR5cGU9XCJjaGVja2JveFwiIGNoZWNrZWQgZGlzYWJsZWQ+XG4gICAgICAgICAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgICAgICAgICA8ZGl2IHN0eWxlPVwiZGlzcGxheTogZmxleDsganVzdGlmeS1jb250ZW50OiBzcGFjZS1iZXR3ZWVuOyBhbGlnbi1pdGVtczogY2VudGVyO1wiPlxuICAgICAgICAgICAgICAgICAgICAgICAgPHNwYW4gc3R5bGU9XCJmb250LXNpemU6IDEycHg7XCI+U291bmQgRWZmZWN0czwvc3Bhbj5cbiAgICAgICAgICAgICAgICAgICAgICAgIDxpbnB1dCB0eXBlPVwiY2hlY2tib3hcIj5cbiAgICAgICAgICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgPC9kaXY+XG4gICAgICA8L2Rpdj5cblxuICAgICAgPGRpdiBjbGFzcz1cImFjdGlvbnMtZ3JpZFwiPlxuICAgICAgICA8YnV0dG9uIGNsYXNzPVwiYnRuIGJ0bi1wcmltYXJ5XCIgaWQ9XCJidG4tbWFwXCI+XG4gICAgICAgICAgPHN2ZyB3aWR0aD1cIjE0XCIgaGVpZ2h0PVwiMTRcIiB2aWV3Qm94PVwiMCAwIDI0IDI0XCIgZmlsbD1cIm5vbmVcIiBzdHJva2U9XCJjdXJyZW50Q29sb3JcIiBzdHJva2Utd2lkdGg9XCIyLjVcIj48Y2lyY2xlIGN4PVwiMTFcIiBjeT1cIjExXCIgcj1cIjhcIi8+PHBhdGggZD1cIk0yMSAyMWwtNC4zNS00LjM1XCIvPjwvc3ZnPlxuICAgICAgICAgIE1hcCBQYWdlXG4gICAgICAgIDwvYnV0dG9uPlxuICAgICAgICA8YnV0dG9uIGNsYXNzPVwiYnRuIGJ0bi1zZWNvbmRhcnlcIiBpZD1cImJ0bi1maWxsXCI+XG4gICAgICAgICAgPHN2ZyB3aWR0aD1cIjE0XCIgaGVpZ2h0PVwiMTRcIiB2aWV3Qm94PVwiMCAwIDI0IDI0XCIgZmlsbD1cIm5vbmVcIiBzdHJva2U9XCJjdXJyZW50Q29sb3JcIiBzdHJva2Utd2lkdGg9XCIyLjVcIj48cGF0aCBkPVwiTTExIDRINGEyIDIgMCAwIDAtMiAydjE0YTIgMiAwIDAgMCAyIDJoMTRhMiAyIDAgMCAwIDItMnYtN1wiLz48cGF0aCBkPVwiTTE4LjUgMi41YTIuMTIxIDIuMTIxIDAgMCAxIDMgM0wxMiAxNWwtNCAxIDEtNCA5LjUtOS41elwiLz48L3N2Zz5cbiAgICAgICAgICBTbWFydCBGaWxsXG4gICAgICAgIDwvYnV0dG9uPlxuICAgICAgICA8YnV0dG9uIGNsYXNzPVwiYnRuIGJ0bi1zZWNvbmRhcnlcIiBpZD1cImJ0bi1zZW5kXCI+XG4gICAgICAgICAgPHN2ZyB3aWR0aD1cIjE0XCIgaGVpZ2h0PVwiMTRcIiB2aWV3Qm94PVwiMCAwIDI0IDI0XCIgZmlsbD1cIm5vbmVcIiBzdHJva2U9XCJjdXJyZW50Q29sb3JcIiBzdHJva2Utd2lkdGg9XCIyLjVcIj48bGluZSB4MT1cIjIyXCIgeTE9XCIyXCIgeDI9XCIxMVwiIHkyPVwiMTNcIi8+PHBvbHlnb24gcG9pbnRzPVwiMjIgMiAxNSAyMiAxMSAxMyAyIDkgMjIgMlwiLz48L3N2Zz5cbiAgICAgICAgICBTZW5kXG4gICAgICAgIDwvYnV0dG9uPlxuICAgICAgICA8YnV0dG9uIGNsYXNzPVwiYnRuIGJ0bi1zZWNvbmRhcnlcIiBpZD1cImJ0bi11bmRvXCI+XG4gICAgICAgICAgPHN2ZyB3aWR0aD1cIjE0XCIgaGVpZ2h0PVwiMTRcIiB2aWV3Qm94PVwiMCAwIDI0IDI0XCIgZmlsbD1cIm5vbmVcIiBzdHJva2U9XCJjdXJyZW50Q29sb3JcIiBzdHJva2Utd2lkdGg9XCIyLjVcIj48cGF0aCBkPVwiTTMgN3Y2aDZcIi8+PHBhdGggZD1cIk0yMSAxN2E5IDkgMCAwIDAtOS05IDkgOSAwIDAgMC02IDIuM0wzIDEzXCIvPjwvc3ZnPlxuICAgICAgICAgIFVuZG9cbiAgICAgICAgPC9idXR0b24+XG4gICAgICAgIDxidXR0b24gY2xhc3M9XCJidG4gYnRuLXNlY29uZGFyeVwiIGlkPVwiYnRuLWRpY3RhdGVcIj5cbiAgICAgICAgICA8c3ZnIHdpZHRoPVwiMTRcIiBoZWlnaHQ9XCIxNFwiIHZpZXdCb3g9XCIwIDAgMjQgMjRcIiBmaWxsPVwibm9uZVwiIHN0cm9rZT1cImN1cnJlbnRDb2xvclwiIHN0cm9rZS13aWR0aD1cIjIuNVwiPjxwYXRoIGQ9XCJNMTIgMWEzIDMgMCAwIDAtMyAzdjhhMyAzIDAgMCAwIDYgMFY0YTMgMyAwIDAgMC0zLTN6XCIvPjxwYXRoIGQ9XCJNMTkgMTB2MmE3IDcgMCAwIDEtMTQgMHYtMlwiLz48bGluZSB4MT1cIjEyXCIgeTE9XCIxOVwiIHgyPVwiMTJcIiB5Mj1cIjIzXCIvPjxsaW5lIHgxPVwiOFwiIHkxPVwiMjNcIiB4Mj1cIjE2XCIgeTI9XCIyM1wiLz48L3N2Zz5cbiAgICAgICAgICBEaWN0YXRlXG4gICAgICAgIDwvYnV0dG9uPlxuICAgICAgPC9kaXY+XG5cbiAgICAgIDxkaXYgY2xhc3M9XCJsb2ctY29udGFpbmVyXCIgaWQ9XCJsb2ctY29udGFpbmVyXCI+PC9kaXY+XG4gICAgPC9kaXY+XG4gIGA7XG59XG5cbmZ1bmN0aW9uIHdpcmVPdmVybGF5SGFuZGxlcnMoKSB7XG4gIGlmICghc2hhZG93Um9vdCkgcmV0dXJuO1xuXG4gIHNoYWRvd1Jvb3QuZ2V0RWxlbWVudEJ5SWQoJ2J0bi1tYXAnKS5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIGhhbmRsZU1hcCk7XG4gIHNoYWRvd1Jvb3QuZ2V0RWxlbWVudEJ5SWQoJ2J0bi1maWxsJykuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCBoYW5kbGVGaWxsKTtcbiAgc2hhZG93Um9vdC5nZXRFbGVtZW50QnlJZCgnYnRuLXNlbmQnKS5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIGhhbmRsZVNlbmQpO1xuICBzaGFkb3dSb290LmdldEVsZW1lbnRCeUlkKCdidG4tdW5kbycpLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgaGFuZGxlVW5kbyk7XG4gIHNoYWRvd1Jvb3QuZ2V0RWxlbWVudEJ5SWQoJ2J0bi1kaWN0YXRlJykuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCBoYW5kbGVEaWN0YXRlKTtcblxuXG5cbiAgLy8gVGFiIEhhbmRsZXJzXG4gIFsnZmllbGRzJywgJ25vdGVzJywgJ3NldHRpbmdzJ10uZm9yRWFjaCh0YWIgPT4ge1xuICAgIHNoYWRvd1Jvb3QuZ2V0RWxlbWVudEJ5SWQoYHRhYi0ke3RhYn1gKS5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IHN3aXRjaFRhYih0YWIpKTtcbiAgfSk7XG5cbiAgbG9nKCdBbmNob3IgdjIuMCBSZWFkeScpO1xufVxuXG5mdW5jdGlvbiBzd2l0Y2hUYWIodGFiTmFtZSkge1xuICBpZiAoIXNoYWRvd1Jvb3QpIHJldHVybjtcblxuICAvLyBVcGRhdGUgc3RhdHVzXG4gIHN0YXR1cy5hY3RpdmVUYWIgPSB0YWJOYW1lO1xuXG4gIC8vIFVwZGF0ZSBUYWIgVUlcbiAgY29uc3QgdGFicyA9IHNoYWRvd1Jvb3QucXVlcnlTZWxlY3RvckFsbCgnLnRhYicpO1xuICB0YWJzLmZvckVhY2godCA9PiB7XG4gICAgdC5jbGFzc0xpc3QudG9nZ2xlKCdhY3RpdmUnLCB0LmRhdGFzZXQudGFyZ2V0ID09PSB0YWJOYW1lKTtcbiAgfSk7XG5cbiAgLy8gVXBkYXRlIFZpZXcgVUlcbiAgY29uc3Qgdmlld3MgPSBzaGFkb3dSb290LnF1ZXJ5U2VsZWN0b3JBbGwoJy52aWV3LXNlY3Rpb24nKTtcbiAgdmlld3MuZm9yRWFjaCh2ID0+IHtcbiAgICB2LnN0eWxlLmRpc3BsYXkgPSB2LmlkID09PSBgdmlldy0ke3RhYk5hbWV9YCA/ICdibG9jaycgOiAnbm9uZSc7XG4gIH0pO1xufVxuXG5mdW5jdGlvbiB0b2dnbGVQYW5lbCgpIHtcbiAgY29uc3QgaG9zdCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKE9WRVJMQVlfSE9TVF9JRCk7XG4gIGlmICghaG9zdCkgcmV0dXJuO1xuICBjb25zdCBpc0hpZGRlbiA9IGhvc3Quc3R5bGUuZGlzcGxheSA9PT0gJ25vbmUnO1xuICBob3N0LnN0eWxlLmRpc3BsYXkgPSBpc0hpZGRlbiA/ICdibG9jaycgOiAnbm9uZSc7XG5cbiAgaWYgKGlzSGlkZGVuKSB7XG4gICAgLy8gUmVzZXQgYW5pbWF0aW9uXG4gICAgY29uc3QgcGFuZWwgPSBzaGFkb3dSb290LnF1ZXJ5U2VsZWN0b3IoJy5wYW5lbCcpO1xuICAgIHBhbmVsLnN0eWxlLmFuaW1hdGlvbiA9ICdub25lJztcbiAgICBwYW5lbC5vZmZzZXRIZWlnaHQ7IC8qIHRyaWdnZXIgcmVmbG93ICovXG4gICAgcGFuZWwuc3R5bGUuYW5pbWF0aW9uID0gJ3NsaWRlSW4gMC4xNXMgY3ViaWMtYmV6aWVyKDAuMTYsIDEsIDAuMywgMSknO1xuICB9XG59XG5cbmZ1bmN0aW9uIHVwZGF0ZVN0YXR1cyh0ZXh0KSB7XG4gIGlmICghc2hhZG93Um9vdCkgcmV0dXJuO1xuICBjb25zdCBiYWRnZSA9IHNoYWRvd1Jvb3QuZ2V0RWxlbWVudEJ5SWQoJ3N0YXR1cy1iYWRnZScpO1xuICBpZiAoYmFkZ2UpIGJhZGdlLnRleHRDb250ZW50ID0gdGV4dDtcbiAgc3RhdHVzLmxhc3RBY3Rpb24gPSB0ZXh0O1xufVxuXG5mdW5jdGlvbiByZW5kZXJGaWVsZHMoKSB7XG4gIGlmICghc2hhZG93Um9vdCkgcmV0dXJuO1xuICBjb25zdCBjb250YWluZXIgPSBzaGFkb3dSb290LmdldEVsZW1lbnRCeUlkKCdmaWVsZHMtbGlzdCcpO1xuICBpZiAoIWNvbnRhaW5lcikgcmV0dXJuO1xuXG4gIGlmICghbGFzdE1hcHBlZC5sZW5ndGgpIHtcbiAgICBjb250YWluZXIuaW5uZXJIVE1MID0gJzxkaXYgY2xhc3M9XCJlbXB0eS1zdGF0ZVwiPk5vIGZpZWxkcyBtYXBwZWQgeWV0LiBDbGljayBcIk1hcFwiIHRvIHN0YXJ0LjwvZGl2Pic7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgY29udGFpbmVyLmlubmVySFRNTCA9ICcnO1xuICBsYXN0TWFwcGVkLnNsaWNlKDAsIE1BWF9GSUVMRFNfVklTSUJMRSkuZm9yRWFjaChmID0+IHtcbiAgICBjb25zdCBpdGVtID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG4gICAgaXRlbS5jbGFzc05hbWUgPSAnZmllbGQtaXRlbSc7XG4gICAgaXRlbS5pbm5lckhUTUwgPSBgXG4gICAgICAgICAgICA8c3BhbiBjbGFzcz1cImZpZWxkLW5hbWVcIj4ke2VzY2FwZUh0bWwoZi5sYWJlbCB8fCAnKHVubmFtZWQpJyl9PC9zcGFuPlxuICAgICAgICAgICAgPHNwYW4gY2xhc3M9XCJmaWVsZC1tZXRhXCI+JHtlc2NhcGVIdG1sKGYucm9sZSB8fCAnZmllbGQnKX08L3NwYW4+XG4gICAgICAgIGA7XG4gICAgY29udGFpbmVyLmFwcGVuZENoaWxkKGl0ZW0pO1xuICB9KTtcblxuICBpZiAobGFzdE1hcHBlZC5sZW5ndGggPiBNQVhfRklFTERTX1ZJU0lCTEUpIHtcbiAgICBjb25zdCBtb3JlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG4gICAgbW9yZS5zdHlsZS50ZXh0QWxpZ24gPSAnY2VudGVyJztcbiAgICBtb3JlLnN0eWxlLmZvbnRTaXplID0gJzEwcHgnO1xuICAgIG1vcmUuc3R5bGUuY29sb3IgPSAndmFyKC0tdGV4dC1tdXRlZCknO1xuICAgIG1vcmUuc3R5bGUucGFkZGluZyA9ICc0cHgnO1xuICAgIG1vcmUudGV4dENvbnRlbnQgPSBgKyR7bGFzdE1hcHBlZC5sZW5ndGggLSBNQVhfRklFTERTX1ZJU0lCTEV9IG1vcmUgZmllbGRzLi4uYDtcbiAgICBjb250YWluZXIuYXBwZW5kQ2hpbGQobW9yZSk7XG4gIH1cbn1cblxuZnVuY3Rpb24gbG9nKG1lc3NhZ2UsIHR5cGUgPSAnaW5mbycpIHtcbiAgaWYgKCFzaGFkb3dSb290KSByZXR1cm47XG4gIGNvbnN0IGNvbnRhaW5lciA9IHNoYWRvd1Jvb3QuZ2V0RWxlbWVudEJ5SWQoJ2xvZy1jb250YWluZXInKTtcbiAgaWYgKCFjb250YWluZXIpIHJldHVybjtcblxuICBjb25zdCBlbnRyeSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuICBlbnRyeS5jbGFzc05hbWUgPSBgbG9nLWVudHJ5ICR7dHlwZX1gO1xuICBjb25zdCB0aW1lID0gbmV3IERhdGUoKS50b0xvY2FsZVRpbWVTdHJpbmcoW10sIHsgaG91cjEyOiBmYWxzZSB9KTtcbiAgZW50cnkudGV4dENvbnRlbnQgPSBgWyR7dGltZX1dICR7bWVzc2FnZX1gO1xuICBjb250YWluZXIucHJlcGVuZChlbnRyeSk7XG59XG5cbmZ1bmN0aW9uIGVzY2FwZUh0bWwocykge1xuICByZXR1cm4gcy5yZXBsYWNlKC9bJjw+J1wiXS9nLCBjID0+ICh7XG4gICAgJyYnOiAnJmFtcDsnLCAnPCc6ICcmbHQ7JywgJz4nOiAnJmd0OycsIFwiJ1wiOiAnJiMzOTsnLCAnXCInOiAnJnF1b3Q7J1xuICB9W2NdIHx8IGMpKTtcbn1cblxuLy8gLS0tIExvZ2ljIEhhbmRsZXJzIC0tLVxuXG5hc3luYyBmdW5jdGlvbiBoYW5kbGVNYXAoKSB7XG4gIHRyeSB7XG4gICAgdXBkYXRlU3RhdHVzKCdNYXBwaW5nLi4uJyk7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgd2luZG93LkFuY2hvcj8ubWFwKCk7XG4gICAgbGFzdE1hcHBlZCA9IHJlc3VsdD8uZmllbGRzIHx8IFtdO1xuICAgIHN0YXR1cy5tYXBwZWRDb3VudCA9IGxhc3RNYXBwZWQubGVuZ3RoO1xuICAgIHJlbmRlckZpZWxkcygpO1xuICAgIHVwZGF0ZVN0YXR1cyhgTWFwcGVkICR7bGFzdE1hcHBlZC5sZW5ndGh9YCk7XG4gICAgbG9nKGBTdWNjZXNzZnVsbHkgbWFwcGVkICR7bGFzdE1hcHBlZC5sZW5ndGh9IGZpZWxkc2AsICdzdWNjZXNzJyk7XG4gIH0gY2F0Y2ggKGVycikge1xuICAgIHVwZGF0ZVN0YXR1cygnRXJyb3InKTtcbiAgICBsb2coYE1hcCBmYWlsZWQ6ICR7ZXJyLm1lc3NhZ2V9YCwgJ2Vycm9yJyk7XG4gIH1cbn1cblxuYXN5bmMgZnVuY3Rpb24gaGFuZGxlRmlsbCgpIHtcbiAgdHJ5IHtcbiAgICB1cGRhdGVTdGF0dXMoJ1BsYW5uaW5nLi4uJyk7XG4gICAgY29uc3QgcmVzID0gYXdhaXQgd2luZG93LkFuY2hvcj8uZmlsbCgpO1xuXG4gICAgaWYgKHJlcz8ub2sgJiYgcmVzPy5wbGFuKSB7XG4gICAgICB1cGRhdGVTdGF0dXMoYEV4ZWN1dGluZyAoJHtyZXMucGxhbi5zdGVwcy5sZW5ndGh9IHN0ZXBzKS4uLmApO1xuICAgICAgbG9nKGBHZW5lcmF0ZWQgcGxhbiB3aXRoICR7cmVzLnBsYW4uc3RlcHMubGVuZ3RofSBzdGVwc2AsICdpbmZvJyk7XG5cbiAgICAgIGF3YWl0IHdpbmRvdy5BbmNob3I/LmV4ZWN1dGVQbGFuKHJlcy5wbGFuKTtcblxuICAgICAgdXBkYXRlU3RhdHVzKCdGaWxsZWQnKTtcbiAgICAgIGxvZygnUGxhbiBleGVjdXRlZCBzdWNjZXNzZnVsbHknLCAnc3VjY2VzcycpO1xuICAgIH0gZWxzZSB7XG4gICAgICB1cGRhdGVTdGF0dXMoJ0ZhaWxlZCcpO1xuICAgICAgbG9nKCdGYWlsZWQgdG8gZ2VuZXJhdGUgZmlsbCBwbGFuJywgJ2Vycm9yJyk7XG4gICAgfVxuICB9IGNhdGNoIChlcnIpIHtcbiAgICB1cGRhdGVTdGF0dXMoJ0Vycm9yJyk7XG4gICAgbG9nKGBGaWxsIGZhaWxlZDogJHtlcnIubWVzc2FnZX1gLCAnZXJyb3InKTtcbiAgfVxufVxuXG5hc3luYyBmdW5jdGlvbiBoYW5kbGVTZW5kKCkge1xuICB0cnkge1xuICAgIHVwZGF0ZVN0YXR1cygnU2VuZGluZy4uLicpO1xuICAgIGNvbnN0IHJlcyA9IGF3YWl0IHdpbmRvdy5BbmNob3I/LnNlbmRNYXAoKTtcbiAgICB1cGRhdGVTdGF0dXMoJ1NlbnQnKTtcbiAgICBsb2coYFNlbnQgbWFwIGRhdGEgKCR7cmVzPy5maWVsZHMgfHwgMH0gaXRlbXMpYCwgJ3N1Y2Nlc3MnKTtcbiAgfSBjYXRjaCAoZXJyKSB7XG4gICAgdXBkYXRlU3RhdHVzKCdFcnJvcicpO1xuICAgIGxvZyhgU2VuZCBmYWlsZWQ6ICR7ZXJyLm1lc3NhZ2V9YCwgJ2Vycm9yJyk7XG4gIH1cbn1cblxuZnVuY3Rpb24gaGFuZGxlVW5kbygpIHtcbiAgaWYgKCFsYXN0U25hcHNob3QpIHtcbiAgICBsb2coJ05vdGhpbmcgdG8gdW5kbycsICdlcnJvcicpO1xuICAgIHJldHVybjtcbiAgfVxuICAvLyBSZXN0b3JlIHZhbHVlcyBsb2dpYyAoc2FtZSBhcyBiZWZvcmUpXG4gIGZvciAoY29uc3QgW3NlbGVjdG9yLCB2YWx1ZV0gb2YgT2JqZWN0LmVudHJpZXMobGFzdFNuYXBzaG90KSkge1xuICAgIGNvbnN0IGVsID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihzZWxlY3Rvcik7XG4gICAgaWYgKGVsKSB7XG4gICAgICBlbC52YWx1ZSA9IHZhbHVlO1xuICAgICAgZWwuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2lucHV0JywgeyBidWJibGVzOiB0cnVlIH0pKTtcbiAgICAgIGVsLmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdjaGFuZ2UnLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xuICAgIH1cbiAgfVxuICBsb2coJ1VuZG8gYXBwbGllZCcsICdzdWNjZXNzJyk7XG4gIHVwZGF0ZVN0YXR1cygnVW5kb25lJyk7XG59XG5cbmxldCByZWNvZ25pdGlvbiA9IG51bGw7XG5mdW5jdGlvbiBoYW5kbGVEaWN0YXRlKCkge1xuICBpZiAoISgnd2Via2l0U3BlZWNoUmVjb2duaXRpb24nIGluIHdpbmRvdykpIHtcbiAgICBsb2coJ0RpY3RhdGlvbiBub3Qgc3VwcG9ydGVkIGluIHRoaXMgYnJvd3NlcicsICdlcnJvcicpO1xuICAgIHJldHVybjtcbiAgfVxuXG4gIGlmIChyZWNvZ25pdGlvbikge1xuICAgIHJlY29nbml0aW9uLnN0b3AoKTtcbiAgICByZWNvZ25pdGlvbiA9IG51bGw7XG4gICAgdXBkYXRlU3RhdHVzKCdEaWN0YXRpb24gc3RvcHBlZCcpO1xuICAgIHJldHVybjtcbiAgfVxuXG4gIHJlY29nbml0aW9uID0gbmV3IHdlYmtpdFNwZWVjaFJlY29nbml0aW9uKCk7XG4gIHJlY29nbml0aW9uLmNvbnRpbnVvdXMgPSBmYWxzZTtcbiAgcmVjb2duaXRpb24uaW50ZXJpbVJlc3VsdHMgPSBmYWxzZTtcblxuICByZWNvZ25pdGlvbi5vbnN0YXJ0ID0gKCkgPT4ge1xuICAgIHVwZGF0ZVN0YXR1cygnTGlzdGVuaW5nLi4uJyk7XG4gICAgbG9nKCdEaWN0YXRpb24gc3RhcnRlZC4uLicsICdpbmZvJyk7XG4gICAgaWYgKHNoYWRvd1Jvb3QpIHtcbiAgICAgIGNvbnN0IGJ0biA9IHNoYWRvd1Jvb3QuZ2V0RWxlbWVudEJ5SWQoJ2J0bi1kaWN0YXRlJyk7XG4gICAgICBpZiAoYnRuKSBidG4uc3R5bGUuY29sb3IgPSAnI2VmNDQ0NCc7XG4gICAgfVxuICB9O1xuXG4gIHJlY29nbml0aW9uLm9ucmVzdWx0ID0gKGV2ZW50KSA9PiB7XG4gICAgY29uc3QgdHJhbnNjcmlwdCA9IGV2ZW50LnJlc3VsdHNbMF1bMF0udHJhbnNjcmlwdDtcbiAgICBsb2coYEhlYXJkOiBcIiR7dHJhbnNjcmlwdH1cImAsICdzdWNjZXNzJyk7XG5cbiAgICAvLyBJbnNlcnQgaW50byBhY3RpdmUgZWxlbWVudCBpZiBwb3NzaWJsZVxuICAgIGNvbnN0IGFjdGl2ZSA9IGRvY3VtZW50LmFjdGl2ZUVsZW1lbnQ7XG4gICAgaWYgKGFjdGl2ZSAmJiAoYWN0aXZlLnRhZ05hbWUgPT09ICdJTlBVVCcgfHwgYWN0aXZlLnRhZ05hbWUgPT09ICdURVhUQVJFQScgfHwgYWN0aXZlLmlzQ29udGVudEVkaXRhYmxlKSkge1xuICAgICAgaWYgKGFjdGl2ZS5pc0NvbnRlbnRFZGl0YWJsZSkge1xuICAgICAgICBhY3RpdmUuaW5uZXJUZXh0ICs9IChhY3RpdmUuaW5uZXJUZXh0ID8gJyAnIDogJycpICsgdHJhbnNjcmlwdDtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGFjdGl2ZS52YWx1ZSArPSAoYWN0aXZlLnZhbHVlID8gJyAnIDogJycpICsgdHJhbnNjcmlwdDtcbiAgICAgIH1cbiAgICAgIGFjdGl2ZS5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgnaW5wdXQnLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xuICAgIH0gZWxzZSB7XG4gICAgICBsb2coJ05vIGFjdGl2ZSBpbnB1dCBmaWVsZCB0byBpbnNlcnQgdGV4dCcsICd3YXJuaW5nJyk7XG4gICAgfVxuICB9O1xuXG4gIHJlY29nbml0aW9uLm9uZXJyb3IgPSAoZXZlbnQpID0+IHtcbiAgICBsb2coYERpY3RhdGlvbiBlcnJvcjogJHtldmVudC5lcnJvcn1gLCAnZXJyb3InKTtcbiAgICBzdG9wRGljdGF0aW9uVUkoKTtcbiAgfTtcblxuICByZWNvZ25pdGlvbi5vbmVuZCA9ICgpID0+IHtcbiAgICBzdG9wRGljdGF0aW9uVUkoKTtcbiAgfTtcblxuICByZWNvZ25pdGlvbi5zdGFydCgpO1xufVxuXG5mdW5jdGlvbiBzdG9wRGljdGF0aW9uVUkoKSB7XG4gIHJlY29nbml0aW9uID0gbnVsbDtcbiAgdXBkYXRlU3RhdHVzKCdJZGxlJyk7XG4gIGlmIChzaGFkb3dSb290KSB7XG4gICAgY29uc3QgYnRuID0gc2hhZG93Um9vdC5nZXRFbGVtZW50QnlJZCgnYnRuLWRpY3RhdGUnKTtcbiAgICBpZiAoYnRuKSBidG4uc3R5bGUuY29sb3IgPSAnJztcbiAgfVxufVxuXG4vLyAtLS0gQVBJIEV4cG9zdXJlIC0tLVxuXG5mdW5jdGlvbiBhdHRhY2hBcGkoKSB7XG4gIGNvbnN0IGFwaSA9IHtcbiAgICB0b2dnbGVQYW5lbCxcbiAgICBtYXA6IGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IG1hcFJlc3VsdCA9IGF3YWl0IG1hcERvbSgpOyAvLyBSZXR1cm5zIHsgZmllbGRzLCB0aXRsZSwgY29udGV4dCB9XG4gICAgICBsYXN0TWFwcGVkID0gbWFwUmVzdWx0LmZpZWxkcztcblxuICAgICAgLy8gU2VuZCB0byBBZ2VudFxuICAgICAgdHJ5IHtcbiAgICAgICAgICBjb25zdCBwYXlsb2FkID0ge1xuICAgICAgICAgICAgICB1cmw6IHdpbmRvdy5sb2NhdGlvbi5ocmVmLFxuICAgICAgICAgICAgICAuLi5tYXBSZXN1bHRcbiAgICAgICAgICB9O1xuICAgICAgICAgIGNvbnNvbGUubG9nKCdTZW5kaW5nIHRvIEFnZW50OicsIEpTT04uc3RyaW5naWZ5KHBheWxvYWQpKTtcbiAgICAgICAgICBhd2FpdCBmZXRjaCgnaHR0cDovL2xvY2FsaG9zdDo4Nzg3L2RvbScsIHtcbiAgICAgICAgICAgICAgbWV0aG9kOiAnUE9TVCcsXG4gICAgICAgICAgICAgIGhlYWRlcnM6IHsgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyB9LFxuICAgICAgICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeShwYXlsb2FkKVxuICAgICAgICAgIH0pO1xuICAgICAgICAgIGxvZygnU2VudCBtYXAgdG8gQWdlbnQnLCAnaW5mbycpO1xuICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBsb2coJ0FnZW50IG9mZmxpbmUgKHVzaW5nIGxvY2FsIG1vZGUpJywgJ3dhcm5pbmcnKTtcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIHsgZmllbGRzOiBsYXN0TWFwcGVkIH07XG4gICAgfSxcbiAgICBzZW5kTWFwOiBhc3luYyAoKSA9PiB7XG4gICAgICAvLyBSZS1zZW5kIGxvZ2ljIGlmIG5lZWRlZCwgYnV0IG1hcCgpIGFscmVhZHkgZG9lcyBpdFxuICAgICAgcmV0dXJuIHsgb2s6IHRydWUsIGZpZWxkczogbGFzdE1hcHBlZC5sZW5ndGggfTtcbiAgICB9LFxuICAgIGZpbGw6IGFzeW5jICgpID0+IHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IHJlcyA9IGF3YWl0IGZldGNoKCdodHRwOi8vbG9jYWxob3N0Ojg3ODcvYWN0aW9ucy9maWxsJywge1xuICAgICAgICAgIG1ldGhvZDogJ1BPU1QnLFxuICAgICAgICAgIGhlYWRlcnM6IHsgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyB9LFxuICAgICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgICAgIHVybDogd2luZG93LmxvY2F0aW9uLmhyZWYsXG4gICAgICAgICAgICBmaWVsZHM6IGxhc3RNYXBwZWRcbiAgICAgICAgICB9KVxuICAgICAgICB9KTtcblxuICAgICAgICBpZiAoIXJlcy5vaykgdGhyb3cgbmV3IEVycm9yKGBBZ2VudCBlcnJvcjogJHtyZXMuc3RhdHVzfWApO1xuXG4gICAgICAgIGNvbnN0IHBsYW4gPSBhd2FpdCByZXMuanNvbigpO1xuICAgICAgICByZXR1cm4geyBvazogdHJ1ZSwgcGxhbiB9O1xuICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBsb2coYEFnZW50IGZpbGwgZmFpbGVkOiAke2UubWVzc2FnZX1gLCAnZXJyb3InKTtcbiAgICAgICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogZS5tZXNzYWdlIH07XG4gICAgICB9XG4gICAgfSxcbiAgICBleGVjdXRlUGxhbjogYXN5bmMgKHBsYW4pID0+IHtcbiAgICAgIGlmICghcGxhbiB8fCAhcGxhbi5zdGVwcykgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogJ0ludmFsaWQgcGxhbicgfTtcblxuICAgICAgY29uc3Qgc25hcCA9IHt9O1xuXG4gICAgICBmb3IgKGNvbnN0IHN0ZXAgb2YgcGxhbi5zdGVwcykge1xuICAgICAgICAvLyBIYW5kbGUgaW50ZXJuYWwgVUkgdXBkYXRlc1xuICAgICAgICBpZiAoc3RlcC5hY3Rpb24gPT09ICdzZXRJbnRlcm5hbFZhbHVlJykge1xuICAgICAgICAgIGlmIChzaGFkb3dSb290KSB7XG4gICAgICAgICAgICBjb25zdCBlbCA9IHNoYWRvd1Jvb3QucXVlcnlTZWxlY3RvcihzdGVwLnNlbGVjdG9yKTtcbiAgICAgICAgICAgIGlmIChlbCkgZWwudmFsdWUgPSBzdGVwLnZhbHVlO1xuICAgICAgICAgIH1cbiAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIEhhbmRsZSBXYWl0XG4gICAgICAgIGlmIChzdGVwLmFjdGlvbiA9PT0gJ3dhaXQnKSB7XG4gICAgICAgICAgYXdhaXQgbmV3IFByb21pc2UociA9PiBzZXRUaW1lb3V0KHIsIHBhcnNlSW50KHN0ZXAudmFsdWUpIHx8IDEwMCkpO1xuICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gSGFuZGxlIERPTSB1cGRhdGVzXG4gICAgICAgIGNvbnN0IGVsID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihzdGVwLnNlbGVjdG9yKTtcbiAgICAgICAgaWYgKGVsKSB7XG4gICAgICAgICAgLy8gVmlzdWFsIEZlZWRiYWNrOiBCbHVlIEZsYXNoXG4gICAgICAgICAgY29uc3Qgb3JpZ2luYWxUcmFuc2l0aW9uID0gZWwuc3R5bGUudHJhbnNpdGlvbjtcbiAgICAgICAgICBjb25zdCBvcmlnaW5hbEJnID0gZWwuc3R5bGUuYmFja2dyb3VuZENvbG9yO1xuICAgICAgICAgIGNvbnN0IG9yaWdpbmFsQm94U2hhZG93ID0gZWwuc3R5bGUuYm94U2hhZG93O1xuXG4gICAgICAgICAgZWwuc3R5bGUudHJhbnNpdGlvbiA9ICdhbGwgMC4zcyBlYXNlJztcbiAgICAgICAgICBlbC5zdHlsZS5iYWNrZ3JvdW5kQ29sb3IgPSAncmdiYSg1NiwgMTg5LCAyNDgsIDAuMTUpJzsgLy8gTGlnaHQgYmx1ZVxuICAgICAgICAgIGVsLnN0eWxlLmJveFNoYWRvdyA9ICcwIDAgMCAycHggcmdiYSg1NiwgMTg5LCAyNDgsIDAuNSknOyAvLyBCbHVlIHJpbmdcblxuICAgICAgICAgIC8vIEV4ZWN1dGUgQWN0aW9uXG4gICAgICAgICAgc3dpdGNoIChzdGVwLmFjdGlvbikge1xuICAgICAgICAgICAgY2FzZSAnc2Nyb2xsJzpcbiAgICAgICAgICAgICAgZWwuc2Nyb2xsSW50b1ZpZXcoeyBiZWhhdmlvcjogJ3Ntb290aCcsIGJsb2NrOiAnY2VudGVyJyB9KTtcbiAgICAgICAgICAgICAgYXdhaXQgbmV3IFByb21pc2UociA9PiBzZXRUaW1lb3V0KHIsIDMwMCkpOyAvLyBXYWl0IGZvciBzY3JvbGxcbiAgICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAgIGNhc2UgJ2ZvY3VzJzpcbiAgICAgICAgICAgICAgZWwuZm9jdXMoKTtcbiAgICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAgIGNhc2UgJ2JsdXInOlxuICAgICAgICAgICAgICBlbC5ibHVyKCk7XG4gICAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgICBjYXNlICdjbGljayc6XG4gICAgICAgICAgICAgIGVsLmNsaWNrKCk7XG4gICAgICAgICAgICAgIC8vIFJpcHBsZSBlZmZlY3QgY291bGQgZ28gaGVyZVxuICAgICAgICAgICAgICBicmVhaztcblxuICAgICAgICAgICAgY2FzZSAnc2V0VmFsdWUnOlxuICAgICAgICAgICAgICAvLyBDYXB0dXJlIHNuYXBzaG90IGZvciB1bmRvXG4gICAgICAgICAgICAgIGlmICghc25hcFtzdGVwLnNlbGVjdG9yXSkgc25hcFtzdGVwLnNlbGVjdG9yXSA9IGVsLnZhbHVlO1xuXG4gICAgICAgICAgICAgIGlmIChlbC5pc0NvbnRlbnRFZGl0YWJsZSkge1xuICAgICAgICAgICAgICAgIGVsLmlubmVyVGV4dCA9IHN0ZXAudmFsdWU7XG4gICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgZWwudmFsdWUgPSBzdGVwLnZhbHVlO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIGVsLmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdpbnB1dCcsIHsgYnViYmxlczogdHJ1ZSB9KSk7XG4gICAgICAgICAgICAgIGVsLmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdjaGFuZ2UnLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xuICAgICAgICAgICAgICBicmVhaztcblxuICAgICAgICAgICAgY2FzZSAnc2VsZWN0JzpcbiAgICAgICAgICAgICAgaWYgKCFzbmFwW3N0ZXAuc2VsZWN0b3JdKSBzbmFwW3N0ZXAuc2VsZWN0b3JdID0gZWwudmFsdWU7XG4gICAgICAgICAgICAgIGVsLnZhbHVlID0gc3RlcC52YWx1ZTtcbiAgICAgICAgICAgICAgZWwuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2NoYW5nZScsIHsgYnViYmxlczogdHJ1ZSB9KSk7XG4gICAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgICBjYXNlICdjaGVjayc6XG4gICAgICAgICAgICBjYXNlICd1bmNoZWNrJzpcbiAgICAgICAgICAgICAgaWYgKGVsLnR5cGUgPT09ICdjaGVja2JveCcgfHwgZWwudHlwZSA9PT0gJ3JhZGlvJykge1xuICAgICAgICAgICAgICAgIGlmICghc25hcFtzdGVwLnNlbGVjdG9yXSkgc25hcFtzdGVwLnNlbGVjdG9yXSA9IGVsLmNoZWNrZWQ7XG4gICAgICAgICAgICAgICAgZWwuY2hlY2tlZCA9IChzdGVwLmFjdGlvbiA9PT0gJ2NoZWNrJyk7XG4gICAgICAgICAgICAgICAgZWwuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2NoYW5nZScsIHsgYnViYmxlczogdHJ1ZSB9KSk7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgLy8gQ2xlYW51cCBWaXN1YWxzXG4gICAgICAgICAgc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICAgICAgICBlbC5zdHlsZS5iYWNrZ3JvdW5kQ29sb3IgPSBvcmlnaW5hbEJnO1xuICAgICAgICAgICAgZWwuc3R5bGUuYm94U2hhZG93ID0gb3JpZ2luYWxCb3hTaGFkb3c7XG4gICAgICAgICAgICBzZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgICAgICAgICAgZWwuc3R5bGUudHJhbnNpdGlvbiA9IG9yaWdpbmFsVHJhbnNpdGlvbjtcbiAgICAgICAgICAgIH0sIDMwMCk7XG4gICAgICAgICAgfSwgNTAwKTtcblxuICAgICAgICAgIC8vIEJhc2UgZGVsYXkgZm9yIGh1bWFuLWxpa2UgcGFjaW5nXG4gICAgICAgICAgYXdhaXQgbmV3IFByb21pc2UociA9PiBzZXRUaW1lb3V0KHIsIDUwKSk7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgbGFzdFNuYXBzaG90ID0gc25hcDtcbiAgICAgIHJldHVybiB7IG9rOiB0cnVlIH07XG4gICAgfSxcbiAgICB1bmRvOiBoYW5kbGVVbmRvXG4gIH07XG5cbiAgd2luZG93LkFuY2hvciA9IGFwaTtcbiAgd2luZG93Ll9fQU5DSE9SX0dIT1NUX18gPSBhcGk7XG59XG4iLCAiaW1wb3J0IHsgaW5pdE92ZXJsYXkgfSBmcm9tICcuL292ZXJsYXkuanMnO1xuXG4oZnVuY3Rpb24gYm9vdHN0cmFwKCkge1xuICB0cnkge1xuICAgIGluaXRPdmVybGF5KCk7XG4gICAgc2V0dXBSdW50aW1lTWVzc2FnZXMoKTtcbiAgICBzZXR1cE1jcEJyaWRnZSgpO1xuICAgIGNvbnNvbGUubG9nKCdbQW5jaG9yXSBDb250ZW50IHNjcmlwdCByZWFkeTonLCB3aW5kb3cubG9jYXRpb24uaHJlZik7XG4gIH0gY2F0Y2ggKGVycikge1xuICAgIGNvbnNvbGUuZXJyb3IoJ1tBbmNob3JdIEZhaWxlZCB0byBpbml0aWFsaXplIG92ZXJsYXknLCBlcnIpO1xuICB9XG59KSgpO1xuXG5mdW5jdGlvbiBlbnN1cmVBbmNob3JBcGkoKSB7XG4gIGlmICghd2luZG93LkFuY2hvcikge1xuICAgIHRocm93IG5ldyBFcnJvcignQW5jaG9yIEFQSSBub3QgcmVhZHknKTtcbiAgfVxuICByZXR1cm4gd2luZG93LkFuY2hvcjtcbn1cblxuZnVuY3Rpb24gc2V0dXBSdW50aW1lTWVzc2FnZXMoKSB7XG4gIGlmICh0eXBlb2YgY2hyb21lID09PSAndW5kZWZpbmVkJyB8fCAhY2hyb21lLnJ1bnRpbWU/Lm9uTWVzc2FnZSkgcmV0dXJuO1xuXG4gIGNocm9tZS5ydW50aW1lLm9uTWVzc2FnZS5hZGRMaXN0ZW5lcigobXNnLCBfc2VuZGVyLCBzZW5kUmVzcG9uc2UpID0+IHtcbiAgICAoYXN5bmMgKCkgPT4ge1xuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc3QgYXBpID0gZW5zdXJlQW5jaG9yQXBpKCk7XG5cbiAgICAgICAgc3dpdGNoIChtc2c/LnR5cGUpIHtcbiAgICAgICAgICBjYXNlICdUT0dHTEVfT1ZFUkxBWSc6XG4gICAgICAgICAgICBhcGkudG9nZ2xlUGFuZWwoKTtcbiAgICAgICAgICAgIHNlbmRSZXNwb25zZSh7IG9rOiB0cnVlIH0pO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgY2FzZSAnTUFQJzpcbiAgICAgICAgICAgIHNlbmRSZXNwb25zZShhd2FpdCBhcGkubWFwKCkpO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgY2FzZSAnU0VORF9NQVAnOlxuICAgICAgICAgICAgc2VuZFJlc3BvbnNlKGF3YWl0IGFwaS5zZW5kTWFwKCkpO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgY2FzZSAnRklMTF9ERU1PJzpcbiAgICAgICAgICAgIHNlbmRSZXNwb25zZShhd2FpdCBhcGkuZmlsbCgpKTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICBzZW5kUmVzcG9uc2UoeyBvazogZmFsc2UsIGVycm9yOiAnVW5rbm93biBjb21tYW5kJyB9KTtcbiAgICAgICAgfVxuICAgICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICAgIHNlbmRSZXNwb25zZSh7IG9rOiBmYWxzZSwgZXJyb3I6IFN0cmluZyhlcnIpIH0pO1xuICAgICAgfVxuICAgIH0pKCk7XG5cbiAgICByZXR1cm4gdHJ1ZTsgLy8ga2VlcCBjaGFubmVsIG9wZW4gZm9yIGFzeW5jIHJlc3BvbnNlc1xuICB9KTtcbn1cblxuZnVuY3Rpb24gc2V0dXBNY3BCcmlkZ2UoKSB7XG4gIGlmICh3aW5kb3cuX19BTkNIT1JfTUNQX0JSSURHRV9SRUFEWV9fKSByZXR1cm47XG4gIHdpbmRvdy5fX0FOQ0hPUl9NQ1BfQlJJREdFX1JFQURZX18gPSB0cnVlO1xuXG4gIGNvbnN0IHdpcmUgPSAocmVxdWVzdEV2ZW50LCByZXNwb25zZUV2ZW50LCBoYW5kbGVyKSA9PiB7XG4gICAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIocmVxdWVzdEV2ZW50LCBhc3luYyAoZXZlbnQpID0+IHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IHBheWxvYWQgPSBhd2FpdCBoYW5kbGVyKGV2ZW50Py5kZXRhaWwpO1xuICAgICAgICB3aW5kb3cuZGlzcGF0Y2hFdmVudChuZXcgQ3VzdG9tRXZlbnQocmVzcG9uc2VFdmVudCwgeyBkZXRhaWw6IHsgb2s6IHRydWUsIC4uLnBheWxvYWQgfSB9KSk7XG4gICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICBjb25zdCBtZXNzYWdlID0gZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiBTdHJpbmcoZXJyb3IpO1xuICAgICAgICB3aW5kb3cuZGlzcGF0Y2hFdmVudChuZXcgQ3VzdG9tRXZlbnQocmVzcG9uc2VFdmVudCwgeyBkZXRhaWw6IHsgb2s6IGZhbHNlLCBlcnJvcjogbWVzc2FnZSB9IH0pKTtcbiAgICAgIH1cbiAgICB9KTtcbiAgfTtcblxuICB3aXJlKCdfX0FOQ0hPUl9NQ1BfTUFQX1JFUVVFU1RfXycsICdfX0FOQ0hPUl9NQ1BfTUFQX1JFU1BPTlNFX18nLCBhc3luYyAoKSA9PiB7XG4gICAgY29uc3QgYXBpID0gZW5zdXJlQW5jaG9yQXBpKCk7XG4gICAgY29uc3QgbWFwUmVzdWx0ID0gYXdhaXQgYXBpLm1hcCgpO1xuICAgIHJldHVybiB7XG4gICAgICB1cmw6IHdpbmRvdy5sb2NhdGlvbi5ocmVmLFxuICAgICAgdGl0bGU6IGRvY3VtZW50LnRpdGxlLFxuICAgICAgZmllbGRzOiBtYXBSZXN1bHQ/LmZpZWxkcyB8fCBbXVxuICAgIH07XG4gIH0pO1xuXG4gIHdpcmUoJ19fQU5DSE9SX01DUF9TRU5EX1JFUVVFU1RfXycsICdfX0FOQ0hPUl9NQ1BfU0VORF9SRVNQT05TRV9fJywgYXN5bmMgKCkgPT4ge1xuICAgIGNvbnN0IGFwaSA9IGVuc3VyZUFuY2hvckFwaSgpO1xuICAgIHJldHVybiBhd2FpdCBhcGkuc2VuZE1hcCgpO1xuICB9KTtcblxuICB3aXJlKCdfX0FOQ0hPUl9NQ1BfRklMTF9SRVFVRVNUX18nLCAnX19BTkNIT1JfTUNQX0ZJTExfUkVTUE9OU0VfXycsIGFzeW5jIChkZXRhaWwpID0+IHtcbiAgICBjb25zdCBhcGkgPSBlbnN1cmVBbmNob3JBcGkoKTtcbiAgICAvLyBhbGxvdyBvcHRpb25hbCBub3RlIGluamVjdGlvbiB2aWEgZXZlbnQgZGV0YWlsXG4gICAgaWYgKGRldGFpbD8ubm90ZSAmJiB0eXBlb2YgZGV0YWlsLm5vdGUgPT09ICdzdHJpbmcnKSB7XG4gICAgICB3aW5kb3cuX19BTkNIT1JfTUNQX05PVEVfXyA9IGRldGFpbC5ub3RlO1xuICAgIH1cbiAgICByZXR1cm4gYXdhaXQgYXBpLmZpbGwoKTtcbiAgfSk7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7QUFJQSxpQkFBc0IsU0FBUztBQUMzQixVQUFNLGFBQWEsTUFBTSxLQUFL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QUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBcVVwQjtBQUVBLFdBQVMsc0JBQXNCO0FBQzdCLFFBQUksQ0FBQyxXQUFZO0FBRWpCLGVBQVcsZUFBZSxTQUFTLEVBQUUsaUJBQWlCLFNBQVMsU0FBUztBQUN4RSxlQUFXLGVBQWUsVUFBVSxFQUFFLGlCQUFpQixTQUFTLFVBQVU7QUFDMUUsZUFBVyxlQUFlLFVBQVUsRUFBRSxpQkFBaUIsU0FBUyxVQUFVO0FBQzFFLGVBQVcsZUFBZSxVQUFVLEVBQUUsaUJBQWlCLFNBQVMsVUFBVTtBQUMxRSxlQUFXLGVBQWUsYUFBYSxFQUFFLGlCQUFpQixTQUFTLGFBQWE7QUFLaEYsS0FBQyxVQUFVLFNBQVMsVUFBVSxFQUFFLFFBQVEsU0FBTztBQUM3QyxpQkFBVyxlQUFlLE9BQU8sR0FBRyxFQUFFLEVBQUUsaUJBQWlCLFNBQVMsTUFBTSxVQUFVLEdBQUcsQ0FBQztBQUFBLElBQ3hGLENBQUM7QUFFRCxRQUFJLG1CQUFtQjtBQUFBLEVBQ3pCO0FBRUEsV0FBUyxVQUFVLFNBQVM7QUFDMUIsUUFBSSxDQUFDLFdBQVk7QUFHakIsV0FBTyxZQUFZO0FBR25CLFVBQU0sT0FBTyxXQUFXLGlCQUFpQixNQUFNO0FBQy9DLFNBQUssUUFBUSxPQUFLO0FBQ2hCLFFBQUUsVUFBVSxPQUFPLFVBQVUsRUFBRSxRQUFRLFdBQVcsT0FBTztBQUFBLElBQzNELENBQUM7QUFHRCxVQUFNLFFBQVEsV0FBVyxpQkFBaUIsZUFBZTtBQUN6RCxVQUFNLFFBQVEsT0FBSztBQUNqQixRQUFFLE1BQU0sVUFBVSxFQUFFLE9BQU8sUUFBUSxPQUFPLEtBQUssVUFBVTtBQUFBLElBQzNELENBQUM7QUFBQSxFQUNIO0FBRUEsV0FBUyxjQUFjO0FBQ3JCLFVBQU0sT0FBTyxTQUFTLGVBQWUsZUFBZTtBQUNwRCxRQUFJLENBQUMsS0FBTTtBQUNYLFVBQU0sV0FBVyxLQUFLLE1BQU0sWUFBWTtBQUN4QyxTQUFLLE1BQU0sVUFBVSxXQUFXLFVBQVU7QUFFMUMsUUFBSSxVQUFVO0FBRVosWUFBTSxRQUFRLFdBQVcsY0FBYyxRQUFRO0FBQy9DLFlBQU0sTUFBTSxZQUFZO0FBQ3hCLFlBQU07QUFDTixZQUFNLE1BQU0sWUFBWTtBQUFBLElBQzFCO0FBQUEsRUFDRjtBQUVBLFdBQVMsYUFBYSxNQUFNO0FBQzFCLFFBQUksQ0FBQyxXQUFZO0FBQ2pCLFVBQU0sUUFBUSxXQUFXLGVBQWUsY0FBYztBQUN0RCxRQUFJLE1BQU8sT0FBTSxjQUFjO0FBQy9CLFdBQU8sYUFBYTtBQUFBLEVBQ3RCO0FBRUEsV0FBUyxlQUFlO0FBQ3RCLFFBQUksQ0FBQyxXQUFZO0FBQ2pCLFVBQU0sWUFBWSxXQUFXLGVBQWUsYUFBYTtBQUN6RCxRQUFJLENBQUMsVUFBVztBQUVoQixRQUFJLENBQUMsV0FBVyxRQUFRO0FBQ3RCLGdCQUFVLFlBQVk7QUFDdEI7QUFBQSxJQUNGO0FBRUEsY0FBVSxZQUFZO0FBQ3RCLGVBQVcsTUFBTSxHQUFHLGtCQUFrQixFQUFFLFFBQVEsT0FBSztBQUNuRCxZQUFNLE9BQU8sU0FBUyxjQUFjLEtBQUs7QUFDekMsV0FBSyxZQUFZO0FBQ2pCLFdBQUssWUFBWTtBQUFBLHVDQUNrQixXQUFXLEVBQUUsU0FBUyxXQUFXLENBQUM7QUFBQSx1Q0FDbEMsV0FBVyxFQUFFLFFBQVEsT0FBTyxDQUFDO0FBQUE7QUFFaEUsZ0JBQVUsWUFBWSxJQUFJO0FBQUEsSUFDNUIsQ0FBQztBQUVELFFBQUksV0FBVyxTQUFTLG9CQUFvQjtBQUMxQyxZQUFNLE9BQU8sU0FBUyxjQUFjLEtBQUs7QUFDekMsV0FBSyxNQUFNLFlBQVk7QUFDdkIsV0FBSyxNQUFNLFdBQVc7QUFDdEIsV0FBSyxNQUFNLFFBQVE7QUFDbkIsV0FBSyxNQUFNLFVBQVU7QUFDckIsV0FBSyxjQUFjLElBQUksV0FBVyxTQUFTLGtCQUFrQjtBQUM3RCxnQkFBVSxZQUFZLElBQUk7QUFBQSxJQUM1QjtBQUFBLEVBQ0Y7QUFFQSxXQUFTLElBQUksU0FBUyxPQUFPLFFBQVE7QUFDbkMsUUFBSSxDQUFDLFdBQVk7QUFDakIsVUFBTSxZQUFZLFdBQVcsZUFBZSxlQUFlO0FBQzNELFFBQUksQ0FBQyxVQUFXO0FBRWhCLFVBQU0sUUFBUSxTQUFTLGNBQWMsS0FBSztBQUMxQyxVQUFNLFlBQVksYUFBYSxJQUFJO0FBQ25DLFVBQU0sUUFBTyxvQkFBSSxLQUFLLEdBQUUsbUJBQW1CLENBQUMsR0FBRyxFQUFFLFFBQVEsTUFBTSxDQUFDO0FBQ2hFLFVBQU0sY0FBYyxJQUFJLElBQUksS0FBSyxPQUFPO0FBQ3hDLGNBQVUsUUFBUSxLQUFLO0FBQUEsRUFDekI7QUFFQSxXQUFTLFdBQVcsR0FBRztBQUNyQixXQUFPLEVBQUUsUUFBUSxZQUFZLFFBQU07QUFBQSxNQUNqQyxLQUFLO0FBQUEsTUFBUyxLQUFLO0FBQUEsTUFBUSxLQUFLO0FBQUEsTUFBUSxLQUFLO0FBQUEsTUFBUyxLQUFLO0FBQUEsSUFDN0QsR0FBRSxDQUFDLEtBQUssQ0FBRTtBQUFBLEVBQ1o7QUFJQSxpQkFBZSxZQUFZO0FBQ3pCLFFBQUk7QUFDRixtQkFBYSxZQUFZO0FBQ3pCLFlBQU0sU0FBUyxNQUFNLE9BQU8sUUFBUSxJQUFJO0FBQ3hDLG1CQUFhLFFBQVEsVUFBVSxDQUFDO0FBQ2hDLGFBQU8sY0FBYyxXQUFXO0FBQ2hDLG1CQUFhO0FBQ2IsbUJBQWEsVUFBVSxXQUFXLE1BQU0sRUFBRTtBQUMxQyxVQUFJLHVCQUF1QixXQUFXLE1BQU0sV0FBVyxTQUFTO0FBQUEsSUFDbEUsU0FBUyxLQUFLO0FBQ1osbUJBQWEsT0FBTztBQUNwQixVQUFJLGVBQWUsSUFBSSxPQUFPLElBQUksT0FBTztBQUFBLElBQzNDO0FBQUEsRUFDRjtBQUVBLGlCQUFlLGFBQWE7QUFDMUIsUUFBSTtBQUNGLG1CQUFhLGFBQWE7QUFDMUIsWUFBTSxNQUFNLE1BQU0sT0FBTyxRQUFRLEtBQUs7QUFFdEMsVUFBSSxLQUFLLE1BQU0sS0FBSyxNQUFNO0FBQ3hCLHFCQUFhLGNBQWMsSUFBSSxLQUFLLE1BQU0sTUFBTSxZQUFZO0FBQzVELFlBQUksdUJBQXVCLElBQUksS0FBSyxNQUFNLE1BQU0sVUFBVSxNQUFNO0FBRWhFLGNBQU0sT0FBTyxRQUFRLFlBQVksSUFBSSxJQUFJO0FBRXpDLHFCQUFhLFFBQVE7QUFDckIsWUFBSSw4QkFBOEIsU0FBUztBQUFBLE1BQzdDLE9BQU87QUFDTCxxQkFBYSxRQUFRO0FBQ3JCLFlBQUksZ0NBQWdDLE9BQU87QUFBQSxNQUM3QztBQUFBLElBQ0YsU0FBUyxLQUFLO0FBQ1osbUJBQWEsT0FBTztBQUNwQixVQUFJLGdCQUFnQixJQUFJLE9BQU8sSUFBSSxPQUFPO0FBQUEsSUFDNUM7QUFBQSxFQUNGO0FBRUEsaUJBQWUsYUFBYTtBQUMxQixRQUFJO0FBQ0YsbUJBQWEsWUFBWTtBQUN6QixZQUFNLE1BQU0sTUFBTSxPQUFPLFFBQVEsUUFBUTtBQUN6QyxtQkFBYSxNQUFNO0FBQ25CLFVBQUksa0JBQWtCLEtBQUssVUFBVSxDQUFDLFdBQVcsU0FBUztBQUFBLElBQzVELFNBQVMsS0FBSztBQUNaLG1CQUFhLE9BQU87QUFDcEIsVUFBSSxnQkFBZ0IsSUFBSSxPQUFPLElBQUksT0FBTztBQUFBLElBQzVDO0FBQUEsRUFDRjtBQUVBLFdBQVMsYUFBYTtBQUNwQixRQUFJLENBQUMsY0FBYztBQUNqQixVQUFJLG1CQUFtQixPQUFPO0FBQzlCO0FBQUEsSUFDRjtBQUVBLGVBQVcsQ0FBQyxVQUFVLEtBQUssS0FBSyxPQUFPLFFBQVEsWUFBWSxHQUFHO0FBQzVELFlBQU0sS0FBSyxTQUFTLGNBQWMsUUFBUTtBQUMxQyxVQUFJLElBQUk7QUFDTixXQUFHLFFBQVE7QUFDWCxXQUFHLGNBQWMsSUFBSSxNQUFNLFNBQVMsRUFBRSxTQUFTLEtBQUssQ0FBQyxDQUFDO0FBQ3RELFdBQUcsY0FBYyxJQUFJLE1BQU0sVUFBVSxFQUFFLFNBQVMsS0FBSyxDQUFDLENBQUM7QUFBQSxNQUN6RDtBQUFBLElBQ0Y7QUFDQSxRQUFJLGdCQUFnQixTQUFTO0FBQzdCLGlCQUFhLFFBQVE7QUFBQSxFQUN2QjtBQUVBLE1BQUksY0FBYztBQUNsQixXQUFTLGdCQUFnQjtBQUN2QixRQUFJLEVBQUUsNkJBQTZCLFNBQVM7QUFDMUMsVUFBSSwyQ0FBMkMsT0FBTztBQUN0RDtBQUFBLElBQ0Y7QUFFQSxRQUFJLGFBQWE7QUFDZixrQkFBWSxLQUFLO0FBQ2pCLG9CQUFjO0FBQ2QsbUJBQWEsbUJBQW1CO0FBQ2hDO0FBQUEsSUFDRjtBQUVBLGtCQUFjLElBQUksd0JBQXdCO0FBQzFDLGdCQUFZLGFBQWE7QUFDekIsZ0JBQVksaUJBQWlCO0FBRTdCLGdCQUFZLFVBQVUsTUFBTTtBQUMxQixtQkFBYSxjQUFjO0FBQzNCLFVBQUksd0JBQXdCLE1BQU07QUFDbEMsVUFBSSxZQUFZO0FBQ2QsY0FBTSxNQUFNLFdBQVcsZUFBZSxhQUFhO0FBQ25ELFlBQUksSUFBSyxLQUFJLE1BQU0sUUFBUTtBQUFBLE1BQzdCO0FBQUEsSUFDRjtBQUVBLGdCQUFZLFdBQVcsQ0FBQyxVQUFVO0FBQ2hDLFlBQU0sYUFBYSxNQUFNLFFBQVEsQ0FBQyxFQUFFLENBQUMsRUFBRTtBQUN2QyxVQUFJLFdBQVcsVUFBVSxLQUFLLFNBQVM7QUFHdkMsWUFBTSxTQUFTLFNBQVM7QUFDeEIsVUFBSSxXQUFXLE9BQU8sWUFBWSxXQUFXLE9BQU8sWUFBWSxjQUFjLE9BQU8sb0JBQW9CO0FBQ3ZHLFlBQUksT0FBTyxtQkFBbUI7QUFDNUIsaUJBQU8sY0FBYyxPQUFPLFlBQVksTUFBTSxNQUFNO0FBQUEsUUFDdEQsT0FBTztBQUNMLGlCQUFPLFVBQVUsT0FBTyxRQUFRLE1BQU0sTUFBTTtBQUFBLFFBQzlDO0FBQ0EsZUFBTyxjQUFjLElBQUksTUFBTSxTQUFTLEVBQUUsU0FBUyxLQUFLLENBQUMsQ0FBQztBQUFBLE1BQzVELE9BQU87QUFDTCxZQUFJLHdDQUF3QyxTQUFTO0FBQUEsTUFDdkQ7QUFBQSxJQUNGO0FBRUEsZ0JBQVksVUFBVSxDQUFDLFVBQVU7QUFDL0IsVUFBSSxvQkFBb0IsTUFBTSxLQUFLLElBQUksT0FBTztBQUM5QyxzQkFBZ0I7QUFBQSxJQUNsQjtBQUVBLGdCQUFZLFFBQVEsTUFBTTtBQUN4QixzQkFBZ0I7QUFBQSxJQUNsQjtBQUVBLGdCQUFZLE1BQU07QUFBQSxFQUNwQjtBQUVBLFdBQVMsa0JBQWtCO0FBQ3pCLGtCQUFjO0FBQ2QsaUJBQWEsTUFBTTtBQUNuQixRQUFJLFlBQVk7QUFDZCxZQUFNLE1BQU0sV0FBVyxlQUFlLGFBQWE7QUFDbkQsVUFBSSxJQUFLLEtBQUksTUFBTSxRQUFRO0FBQUEsSUFDN0I7QUFBQSxFQUNGO0FBSUEsV0FBUyxZQUFZO0FBQ25CLFVBQU0sTUFBTTtBQUFBLE1BQ1Y7QUFBQSxNQUNBLEtBQUssWUFBWTtBQUNmLGNBQU0sWUFBWSxNQUFNLE9BQU87QUFDL0IscUJBQWEsVUFBVTtBQUd2QixZQUFJO0FBQ0EsZ0JBQU0sVUFBVTtBQUFBLFlBQ1osS0FBSyxPQUFPLFNBQVM7QUFBQSxZQUNyQixHQUFHO0FBQUEsVUFDUDtBQUNBLGtCQUFRLElBQUkscUJBQXFCLEtBQUssVUFBVSxPQUFPLENBQUM7QUFDeEQsZ0JBQU0sTUFBTSw2QkFBNkI7QUFBQSxZQUNyQyxRQUFRO0FBQUEsWUFDUixTQUFTLEVBQUUsZ0JBQWdCLG1CQUFtQjtBQUFBLFlBQzlDLE1BQU0sS0FBSyxVQUFVLE9BQU87QUFBQSxVQUNoQyxDQUFDO0FBQ0QsY0FBSSxxQkFBcUIsTUFBTTtBQUFBLFFBQ25DLFNBQVMsR0FBRztBQUNWLGNBQUksb0NBQW9DLFNBQVM7QUFBQSxRQUNuRDtBQUVBLGVBQU8sRUFBRSxRQUFRLFdBQVc7QUFBQSxNQUM5QjtBQUFBLE1BQ0EsU0FBUyxZQUFZO0FBRW5CLGVBQU8sRUFBRSxJQUFJLE1BQU0sUUFBUSxXQUFXLE9BQU87QUFBQSxNQUMvQztBQUFBLE1BQ0EsTUFBTSxZQUFZO0FBQ2hCLFlBQUk7QUFDRixnQkFBTSxNQUFNLE1BQU0sTUFBTSxzQ0FBc0M7QUFBQSxZQUM1RCxRQUFRO0FBQUEsWUFDUixTQUFTLEVBQUUsZ0JBQWdCLG1CQUFtQjtBQUFBLFlBQzlDLE1BQU0sS0FBSyxVQUFVO0FBQUEsY0FDbkIsS0FBSyxPQUFPLFNBQVM7QUFBQSxjQUNyQixRQUFRO0FBQUEsWUFDVixDQUFDO0FBQUEsVUFDSCxDQUFDO0FBRUQsY0FBSSxDQUFDLElBQUksR0FBSSxPQUFNLElBQUksTUFBTSxnQkFBZ0IsSUFBSSxNQUFNLEVBQUU7QUFFekQsZ0JBQU0sT0FBTyxNQUFNLElBQUksS0FBSztBQUM1QixpQkFBTyxFQUFFLElBQUksTUFBTSxLQUFLO0FBQUEsUUFDMUIsU0FBUyxHQUFHO0FBQ1YsY0FBSSxzQkFBc0IsRUFBRSxPQUFPLElBQUksT0FBTztBQUM5QyxpQkFBTyxFQUFFLElBQUksT0FBTyxPQUFPLEVBQUUsUUFBUTtBQUFBLFFBQ3ZDO0FBQUEsTUFDRjtBQUFBLE1BQ0EsYUFBYSxPQUFPLFNBQVM7QUFDM0IsWUFBSSxDQUFDLFFBQVEsQ0FBQyxLQUFLLE1BQU8sUUFBTyxFQUFFLElBQUksT0FBTyxPQUFPLGVBQWU7QUFFcEUsY0FBTSxPQUFPLENBQUM7QUFFZCxtQkFBVyxRQUFRLEtBQUssT0FBTztBQUU3QixjQUFJLEtBQUssV0FBVyxvQkFBb0I7QUFDdEMsZ0JBQUksWUFBWTtBQUNkLG9CQUFNQSxNQUFLLFdBQVcsY0FBYyxLQUFLLFFBQVE7QUFDakQsa0JBQUlBLElBQUksQ0FBQUEsSUFBRyxRQUFRLEtBQUs7QUFBQSxZQUMxQjtBQUNBO0FBQUEsVUFDRjtBQUdBLGNBQUksS0FBSyxXQUFXLFFBQVE7QUFDMUIsa0JBQU0sSUFBSSxRQUFRLE9BQUssV0FBVyxHQUFHLFNBQVMsS0FBSyxLQUFLLEtBQUssR0FBRyxDQUFDO0FBQ2pFO0FBQUEsVUFDRjtBQUdBLGdCQUFNLEtBQUssU0FBUyxjQUFjLEtBQUssUUFBUTtBQUMvQyxjQUFJLElBQUk7QUFFTixrQkFBTSxxQkFBcUIsR0FBRyxNQUFNO0FBQ3BDLGtCQUFNLGFBQWEsR0FBRyxNQUFNO0FBQzVCLGtCQUFNLG9CQUFvQixHQUFHLE1BQU07QUFFbkMsZUFBRyxNQUFNLGFBQWE7QUFDdEIsZUFBRyxNQUFNLGtCQUFrQjtBQUMzQixlQUFHLE1BQU0sWUFBWTtBQUdyQixvQkFBUSxLQUFLLFFBQVE7QUFBQSxjQUNuQixLQUFLO0FBQ0gsbUJBQUcsZUFBZSxFQUFFLFVBQVUsVUFBVSxPQUFPLFNBQVMsQ0FBQztBQUN6RCxzQkFBTSxJQUFJLFFBQVEsT0FBSyxXQUFXLEdBQUcsR0FBRyxDQUFDO0FBQ3pDO0FBQUEsY0FFRixLQUFLO0FBQ0gsbUJBQUcsTUFBTTtBQUNUO0FBQUEsY0FFRixLQUFLO0FBQ0gsbUJBQUcsS0FBSztBQUNSO0FBQUEsY0FFRixLQUFLO0FBQ0gsbUJBQUcsTUFBTTtBQUVUO0FBQUEsY0FFRixLQUFLO0FBRUgsb0JBQUksQ0FBQyxLQUFLLEtBQUssUUFBUSxFQUFHLE1BQUssS0FBSyxRQUFRLElBQUksR0FBRztBQUVuRCxvQkFBSSxHQUFHLG1CQUFtQjtBQUN4QixxQkFBRyxZQUFZLEtBQUs7QUFBQSxnQkFDdEIsT0FBTztBQUNMLHFCQUFHLFFBQVEsS0FBSztBQUFBLGdCQUNsQjtBQUNBLG1CQUFHLGNBQWMsSUFBSSxNQUFNLFNBQVMsRUFBRSxTQUFTLEtBQUssQ0FBQyxDQUFDO0FBQ3RELG1CQUFHLGNBQWMsSUFBSSxNQUFNLFVBQVUsRUFBRSxTQUFTLEtBQUssQ0FBQyxDQUFDO0FBQ3ZEO0FBQUEsY0FFRixLQUFLO0FBQ0gsb0JBQUksQ0FBQyxLQUFLLEtBQUssUUFBUSxFQUFHLE1BQUssS0FBSyxRQUFRLElBQUksR0FBRztBQUNuRCxtQkFBRyxRQUFRLEtBQUs7QUFDaEIsbUJBQUcsY0FBYyxJQUFJLE1BQU0sVUFBVSxFQUFFLFNBQVMsS0FBSyxDQUFDLENBQUM7QUFDdkQ7QUFBQSxjQUVGLEtBQUs7QUFBQSxjQUNMLEtBQUs7QUFDSCxvQkFBSSxHQUFHLFNBQVMsY0FBYyxHQUFHLFNBQVMsU0FBUztBQUNqRCxzQkFBSSxDQUFDLEtBQUssS0FBSyxRQUFRLEVBQUcsTUFBSyxLQUFLLFFBQVEsSUFBSSxHQUFHO0FBQ25ELHFCQUFHLFVBQVcsS0FBSyxXQUFXO0FBQzlCLHFCQUFHLGNBQWMsSUFBSSxNQUFNLFVBQVUsRUFBRSxTQUFTLEtBQUssQ0FBQyxDQUFDO0FBQUEsZ0JBQ3pEO0FBQ0E7QUFBQSxZQUNKO0FBR0EsdUJBQVcsTUFBTTtBQUNmLGlCQUFHLE1BQU0sa0JBQWtCO0FBQzNCLGlCQUFHLE1BQU0sWUFBWTtBQUNyQix5QkFBVyxNQUFNO0FBQ2YsbUJBQUcsTUFBTSxhQUFhO0FBQUEsY0FDeEIsR0FBRyxHQUFHO0FBQUEsWUFDUixHQUFHLEdBQUc7QUFHTixrQkFBTSxJQUFJLFFBQVEsT0FBSyxXQUFXLEdBQUcsRUFBRSxDQUFDO0FBQUEsVUFDMUM7QUFBQSxRQUNGO0FBRUEsdUJBQWU7QUFDZixlQUFPLEVBQUUsSUFBSSxLQUFLO0FBQUEsTUFDcEI7QUFBQSxNQUNBLE1BQU07QUFBQSxJQUNSO0FBRUEsV0FBTyxTQUFTO0FBQ2hCLFdBQU8sbUJBQW1CO0FBQUEsRUFDNUI7OztBQ3IyQkEsR0FBQyxTQUFTLFlBQVk7QUFDcEIsUUFBSTtBQUNGLGtCQUFZO0FBQ1osMkJBQXFCO0FBQ3JCLHFCQUFlO0FBQ2YsY0FBUSxJQUFJLGtDQUFrQyxPQUFPLFNBQVMsSUFBSTtBQUFBLElBQ3BFLFNBQVMsS0FBSztBQUNaLGNBQVEsTUFBTSx5Q0FBeUMsR0FBRztBQUFBLElBQzVEO0FBQUEsRUFDRixHQUFHO0FBRUgsV0FBUyxrQkFBa0I7QUFDekIsUUFBSSxDQUFDLE9BQU8sUUFBUTtBQUNsQixZQUFNLElBQUksTUFBTSxzQkFBc0I7QUFBQSxJQUN4QztBQUNBLFdBQU8sT0FBTztBQUFBLEVBQ2hCO0FBRUEsV0FBUyx1QkFBdUI7QUFDOUIsUUFBSSxPQUFPLFdBQVcsZUFBZSxDQUFDLE9BQU8sU0FBUyxVQUFXO0FBRWpFLFdBQU8sUUFBUSxVQUFVLFlBQVksQ0FBQyxLQUFLLFNBQVMsaUJBQWlCO0FBQ25FLE9BQUMsWUFBWTtBQUNYLFlBQUk7QUFDRixnQkFBTSxNQUFNLGdCQUFnQjtBQUU1QixrQkFBUSxLQUFLLE1BQU07QUFBQSxZQUNqQixLQUFLO0FBQ0gsa0JBQUksWUFBWTtBQUNoQiwyQkFBYSxFQUFFLElBQUksS0FBSyxDQUFDO0FBQ3pCO0FBQUEsWUFDRixLQUFLO0FBQ0gsMkJBQWEsTUFBTSxJQUFJLElBQUksQ0FBQztBQUM1QjtBQUFBLFlBQ0YsS0FBSztBQUNILDJCQUFhLE1BQU0sSUFBSSxRQUFRLENBQUM7QUFDaEM7QUFBQSxZQUNGLEtBQUs7QUFDSCwyQkFBYSxNQUFNLElBQUksS0FBSyxDQUFDO0FBQzdCO0FBQUEsWUFDRjtBQUNFLDJCQUFhLEVBQUUsSUFBSSxPQUFPLE9BQU8sa0JBQWtCLENBQUM7QUFBQSxVQUN4RDtBQUFBLFFBQ0YsU0FBUyxLQUFLO0FBQ1osdUJBQWEsRUFBRSxJQUFJLE9BQU8sT0FBTyxPQUFPLEdBQUcsRUFBRSxDQUFDO0FBQUEsUUFDaEQ7QUFBQSxNQUNGLEdBQUc7QUFFSCxhQUFPO0FBQUEsSUFDVCxDQUFDO0FBQUEsRUFDSDtBQUVBLFdBQVMsaUJBQWlCO0FBQ3hCLFFBQUksT0FBTyw0QkFBNkI7QUFDeEMsV0FBTyw4QkFBOEI7QUFFckMsVUFBTSxPQUFPLENBQUMsY0FBYyxlQUFlLFlBQVk7QUFDckQsYUFBTyxpQkFBaUIsY0FBYyxPQUFPLFVBQVU7QUFDckQsWUFBSTtBQUNGLGdCQUFNLFVBQVUsTUFBTSxRQUFRLE9BQU8sTUFBTTtBQUMzQyxpQkFBTyxjQUFjLElBQUksWUFBWSxlQUFlLEVBQUUsUUFBUSxFQUFFLElBQUksTUFBTSxHQUFHLFFBQVEsRUFBRSxDQUFDLENBQUM7QUFBQSxRQUMzRixTQUFTLE9BQU87QUFDZCxnQkFBTSxVQUFVLGlCQUFpQixRQUFRLE1BQU0sVUFBVSxPQUFPLEtBQUs7QUFDckUsaUJBQU8sY0FBYyxJQUFJLFlBQVksZUFBZSxFQUFFLFFBQVEsRUFBRSxJQUFJLE9BQU8sT0FBTyxRQUFRLEVBQUUsQ0FBQyxDQUFDO0FBQUEsUUFDaEc7QUFBQSxNQUNGLENBQUM7QUFBQSxJQUNIO0FBRUEsU0FBSyw4QkFBOEIsK0JBQStCLFlBQVk7QUFDNUUsWUFBTSxNQUFNLGdCQUFnQjtBQUM1QixZQUFNLFlBQVksTUFBTSxJQUFJLElBQUk7QUFDaEMsYUFBTztBQUFBLFFBQ0wsS0FBSyxPQUFPLFNBQVM7QUFBQSxRQUNyQixPQUFPLFNBQVM7QUFBQSxRQUNoQixRQUFRLFdBQVcsVUFBVSxDQUFDO0FBQUEsTUFDaEM7QUFBQSxJQUNGLENBQUM7QUFFRCxTQUFLLCtCQUErQixnQ0FBZ0MsWUFBWTtBQUM5RSxZQUFNLE1BQU0sZ0JBQWdCO0FBQzVCLGFBQU8sTUFBTSxJQUFJLFFBQVE7QUFBQSxJQUMzQixDQUFDO0FBRUQsU0FBSywrQkFBK0IsZ0NBQWdDLE9BQU8sV0FBVztBQUNwRixZQUFNLE1BQU0sZ0JBQWdCO0FBRTVCLFVBQUksUUFBUSxRQUFRLE9BQU8sT0FBTyxTQUFTLFVBQVU7QUFDbkQsZUFBTyxzQkFBc0IsT0FBTztBQUFBLE1BQ3RDO0FBQ0EsYUFBTyxNQUFNLElBQUksS0FBSztBQUFBLElBQ3hCLENBQUM7QUFBQSxFQUNIOyIsCiAgIm5hbWVzIjogWyJlbCJdCn0K
