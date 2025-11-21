/**
 * Scans the DOM for fields using heuristics.
 * @returns {Promise<import('./anchorApi').MappedField[]>}
 */
export async function mapDom() {
    const candidates = Array.from(
        document.querySelectorAll(
            'input:not([type="hidden"]):not([type="submit"]), textarea, select, [contenteditable="true"]'
        )
    );
    const mapped = [];
    const seenSelectors = new Set();

    for (const el of candidates) {
        if (!isVisible(el)) continue;

        const labelText = findLabel(el);
        if (!labelText) continue;

        const role = identifyRole(labelText);
        const selector = getUniqueSelector(el);

        if (role && selector && !seenSelectors.has(selector)) {
            mapped.push({
                label: labelText,
                role: role,
                selector: selector,
                editable: !el.disabled && !el.readOnly,
                visible: true
            });
            seenSelectors.add(selector);
        }
    }

    const context = document.body.innerText; // Capture visible text
    const title = document.title;

    const headings = collectText('h1, h2, h3', 5);
    const breadcrumbs = collectBreadcrumbs(5);
    const tabs = collectTabs(8);
    const activeTab = tabs.find((t) => t.active)?.label || null;
    const buttons = collectText('button, .btn', 6);
    const popups = collectPopups(4);

    const ux = {
        capturedAt: new Date().toISOString(),
        headings,
        breadcrumbs,
        tabs,
        activeTab,
        buttons,
        popups,
        surfaceId: buildSurfaceId({ headings, activeTab, url: window.location.href })
    };

    return {
        fields: mapped,
        title,
        context,
        ux
    };
}

const ROLES = {
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
    // 1. Explicit label
    if (el.id) {
        const label = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
        if (label && isVisible(label)) return cleanText(label.innerText);
    }

    // 2. Aria label
    if (el.getAttribute('aria-label')) return cleanText(el.getAttribute('aria-label'));
    if (el.getAttribute('aria-labelledby')) {
        const label = document.getElementById(el.getAttribute('aria-labelledby'));
        if (label) return cleanText(label.innerText);
    }

    // 3. Placeholder
    if (el.placeholder) return cleanText(el.placeholder);

    // 4. Parent label
    const parentLabel = el.closest('label');
    if (parentLabel) {
        // Clone and remove the input itself to get just the text
        const clone = parentLabel.cloneNode(true);
        const inputInClone = clone.querySelector('input, textarea, select');
        if (inputInClone) inputInClone.remove();
        return cleanText(clone.innerText);
    }

    // 5. Preceding sibling or text
    let prev = el.previousElementSibling;
    if (prev && isVisible(prev) && (prev.tagName === 'LABEL' || prev.tagName === 'SPAN' || prev.tagName === 'DIV' || prev.tagName === 'B' || prev.tagName === 'STRONG')) {
        return cleanText(prev.innerText);
    }

    // 6. Table row header (common in EMRs)
    const tr = el.closest('tr');
    if (tr) {
        const th = tr.querySelector('th');
        if (th) return cleanText(th.innerText);
        const firstTd = tr.querySelector('td');
        if (firstTd && firstTd !== el.closest('td')) return cleanText(firstTd.innerText);
    }

    // 7. Preceding text node
    let node = el.previousSibling;
    while (node) {
        if (node.nodeType === Node.TEXT_NODE && node.textContent.trim()) {
            return cleanText(node.textContent);
        }
        if (node.nodeType === Node.ELEMENT_NODE) break; // Stop at element
        node = node.previousSibling;
    }

    return null;
}

function isVisible(el) {
    return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
}

function cleanText(text) {
    return text ? text.replace(/[:*]/g, '').trim() : '';
}

function collectText(selector, limit = 5) {
    const nodes = Array.from(document.querySelectorAll(selector)).filter(isVisible);
    const items = [];
    for (const node of nodes) {
        const text = cleanText(node.innerText || node.textContent || '');
        if (text) items.push(text);
        if (items.length >= limit) break;
    }
    return items;
}

function collectBreadcrumbs(limit = 5) {
    const containers = Array.from(
        document.querySelectorAll('nav[aria-label="breadcrumb"], .breadcrumb')
    );
    for (const container of containers) {
        const parts = Array.from(container.querySelectorAll('li, a, span'))
            .map((el) => cleanText(el.textContent || ''))
            .filter(Boolean);
        if (parts.length) {
            return parts.slice(0, limit);
        }
    }
    return [];
}

function collectTabs(limit = 8) {
    const tabCandidates = Array.from(
        document.querySelectorAll('[role="tab"], .tab, .nav-link, .tabs button')
    ).filter(isVisible);

    const tabs = [];
    for (const el of tabCandidates) {
        const label = cleanText(el.textContent || '');
        if (!label) continue;
        const active =
            el.getAttribute('aria-selected') === 'true' ||
            el.classList.contains('active') ||
            el.classList.contains('selected');
        tabs.push({ label, active });
        if (tabs.length >= limit) break;
    }
    return tabs;
}

function collectPopups(limit = 4) {
    const selectors = ['[role="dialog"]', '.modal', '.popup', '.ant-modal', '.chakra-modal__content'];
    const popups = [];
    for (const selector of selectors) {
        const nodes = Array.from(document.querySelectorAll(selector)).filter(isVisible);
        for (const node of nodes) {
            const title =
                node.getAttribute('aria-label') ||
                cleanText(node.querySelector('h1, h2, h3, header')?.textContent || '');
            if (title) {
                popups.push(title);
            }
            if (popups.length >= limit) break;
        }
        if (popups.length >= limit) break;
    }
    return popups;
}

function buildSurfaceId({ headings, activeTab, url }) {
    const base = [url, activeTab || '', ...(headings || [])].join('|');
    let hash = 0;
    for (let i = 0; i < base.length; i++) {
        hash = (hash << 5) - hash + base.charCodeAt(i);
        hash |= 0;
    }
    return `surface_${Math.abs(hash)}`;
}

function getUniqueSelector(el) {
    if (el.id) return `#${CSS.escape(el.id)}`;
    if (el.name) return `[name="${CSS.escape(el.name)}"]`;

    // Fallback to path
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
