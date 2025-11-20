/**
 * Scans the DOM for fields using heuristics.
 * @returns {Promise<import('./anchorApi').MappedField[]>}
 */
export async function mapDom() {
    const candidates = Array.from(document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]), textarea, select, [contenteditable="true"]'));
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

    return {
        fields: mapped,
        title,
        context
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
