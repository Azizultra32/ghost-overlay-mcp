#!/usr/bin/env node

/**
 * Simple MCP Helper - Works with or without extension
 * Falls back to direct DOM collection if extension isn't loaded
 */

import CDP from 'chrome-remote-interface';

const DEVTOOLS_PORT = Number(process.env.MCP_DEVTOOLS_PORT || 9222);
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function connectCDP() {
  try {
    return await CDP({ port: DEVTOOLS_PORT });
  } catch (err) {
    throw new Error(`Failed to connect to Chrome on port ${DEVTOOLS_PORT}. Is Chrome running with --remote-debugging-port=${DEVTOOLS_PORT}?`);
  }
}

async function getOrCreatePage(client, preferredUrl) {
  const { Target } = client;
  const { targetInfos } = await Target.getTargets();

  if (preferredUrl) {
    const exact = targetInfos.find((t) => t.type === 'page' && t.url === preferredUrl);
    if (exact) return exact.targetId;
  }

  const realPage = targetInfos.find(
    (t) =>
      t.type === 'page' &&
      t.url &&
      t.url !== 'about:blank' &&
      !t.url.startsWith('devtools://') &&
      !t.url.startsWith('chrome-extension://')
  );
  if (realPage) return realPage.targetId;

  const fallback = targetInfos.find((t) => t.type === 'page');
  if (fallback) return fallback.targetId;

  const created = await Target.createTarget({ url: 'about:blank' });
  return created.targetId;
}

async function attachToPage(client, url) {
  const { Target, Page, Runtime } = client;
  const targetId = await getOrCreatePage(client, url);
  const { sessionId } = await Target.attachToTarget({ targetId, flatten: true });
  if (Runtime?.enable) await Runtime.enable();
  await Page.enable();

  if (url) {
    await Page.navigate({ url });
    await Page.loadEventFired();
  } else {
    const currentUrl = await evalInPage(client, 'window.location.href');
    if (!currentUrl || currentUrl === 'about:blank') {
      throw new Error('No active tab found. Pass a URL or open the target page in Chrome first.');
    }
  }

  return { targetId, sessionId };
}

async function evalInPage(client, expression, awaitPromise = false) {
  const { Runtime } = client;
  const result = await Runtime.evaluate({
    expression,
    awaitPromise,
    returnByValue: true
  });

  if (result.exceptionDetails) {
    const { text, exception } = result.exceptionDetails;
    throw new Error(`Runtime error: ${text || exception?.description || 'unknown'}`);
  }

  return result.result?.value;
}

/**
 * Collect DOM fields directly via CDP (works without extension)
 */
async function collectDomFieldsDirect(client) {
  const script = `
    (() => {
      const nodes = Array.from(document.querySelectorAll('input, textarea, select, [contenteditable="true"]'));

      const getUniqueSelector = (el) => {
        if (el.id) return '#' + CSS.escape(el.id);
        if (el.name) return '[name="' + CSS.escape(el.name) + '"]';

        const parts = [];
        let node = el;
        while (node && node.nodeType === 1 && parts.length < 5) {
          let selector = node.nodeName.toLowerCase();
          const parent = node.parentElement;
          if (parent) {
            const siblings = Array.from(parent.children).filter(child => child.nodeName === node.nodeName);
            if (siblings.length > 1) {
              selector += ':nth-of-type(' + (siblings.indexOf(node) + 1) + ')';
            }
          }
          parts.unshift(selector);
          node = parent;
        }
        return parts.join(' > ');
      };

      const isVisible = (el) => {
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
      };

      const labelFor = (el) => {
        const aria = el.getAttribute('aria-label');
        if (aria) return aria;
        if (el.id) {
          const match = document.querySelector('label[for="' + CSS.escape(el.id) + '"]');
          if (match) return match.textContent?.trim() || '';
        }
        const closestLabel = el.closest('label');
        if (closestLabel) return closestLabel.textContent?.trim() || '';
        if (el.getAttribute('placeholder')) return el.getAttribute('placeholder');
        if (el.getAttribute('name')) return el.getAttribute('name');
        return el.id || el.className || el.tagName.toLowerCase();
      };

      const roleFor = (el) => {
        if (el.getAttribute('role')) return el.getAttribute('role');
        const tag = el.tagName.toLowerCase();
        if (tag === 'textarea') return 'textarea';
        if (tag === 'select') return 'combobox';
        if (tag === 'input') return el.getAttribute('type') || 'textbox';
        if (el.isContentEditable) return 'textbox';
        return tag;
      };

      const editable = (el) => {
        if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
          return !el.disabled && !el.readOnly;
        }
        return el.isContentEditable;
      };

      return nodes
        .filter(isVisible)
        .map(el => ({
          selector: getUniqueSelector(el),
          label: labelFor(el) || '(unlabeled)',
          role: roleFor(el),
          editable: editable(el),
          visible: true
        }));
    })();
  `;

  return evalInPage(client, script);
}

/**
 * Try to use extension MCP bridge, fall back to direct collection
 */
async function mapDomFields(client, url) {
  // Try extension bridge first
  try {
    const bridgeScript = `
      (async () => {
        return new Promise((resolve) => {
          const handler = (e) => {
            window.removeEventListener('__ANCHOR_MCP_MAP_RESPONSE__', handler);
            resolve(e.detail);
          };
          window.addEventListener('__ANCHOR_MCP_MAP_RESPONSE__', handler);
          window.dispatchEvent(new Event('__ANCHOR_MCP_MAP_REQUEST__'));

          // Timeout after 1 second - extension not present
          setTimeout(() => resolve(null), 1000);
        });
      })();
    `;

    const result = await evalInPage(client, bridgeScript, true);

    if (result && result.fields) {
      console.error('✓ Using extension MCP bridge');
      return {
        url: result.url || url,
        fields: result.fields,
        method: 'extension_bridge'
      };
    }
  } catch (err) {
    console.error('Extension bridge failed, using direct collection');
  }

  // Fallback to direct collection
  console.error('✓ Using direct DOM collection (extension not detected)');
  const fields = await collectDomFieldsDirect(client);
  return {
    url,
    fields,
    method: 'direct_collection'
  };
}

/**
 * Fill a field (works with or without extension)
 */
async function fillField(client, selector, value) {
  const fillScript = `
    (() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return { success: false, error: 'Element not found' };

      const isEditable = (el) => {
        if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
          return !el.disabled && !el.readOnly;
        }
        return el.isContentEditable;
      };

      if (!isEditable(el)) {
        return { success: false, error: 'Element not editable' };
      }

      // Fill the field
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
        el.focus();
        el.value = ${JSON.stringify(value)};
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return { success: true, selector: ${JSON.stringify(selector)} };
      } else if (el.isContentEditable) {
        el.focus();
        el.innerText = ${JSON.stringify(value)};
        el.dispatchEvent(new Event('input', { bubbles: true }));
        return { success: true, selector: ${JSON.stringify(selector)} };
      }

      return { success: false, error: 'Unknown element type' };
    })();
  `;

  return evalInPage(client, fillScript);
}

/**
 * Tool: anchor_map_page
 */
async function toolAnchorMapPage(url) {
  if (!url) throw new Error('anchor_map_page requires a url argument');

  const client = await connectCDP();
  let attachedTarget;
  try {
    attachedTarget = await attachToPage(client, url);
    await sleep(1000); // Wait for page to settle

    const result = await mapDomFields(client, url);

    return {
      success: true,
      url: result.url,
      fields: result.fields,
      fieldCount: result.fields.length,
      method: result.method,
      capturedAt: new Date().toISOString()
    };
  } finally {
    if (attachedTarget?.targetId) {
      try {
        await client.Target.detachFromTarget({ targetId: attachedTarget.targetId });
      } catch (_) { /* ignore */ }
    }
    await client.close();
  }
}

/**
 * Tool: anchor_fill_field
 */
async function toolAnchorFillField(selector, value, url) {
  if (!selector) throw new Error('anchor_fill_field requires a selector argument');
  if (value === undefined) throw new Error('anchor_fill_field requires a value argument');

  const client = await connectCDP();
  let attachedTarget;
  try {
    attachedTarget = await attachToPage(client, url);
    await sleep(200); // allow DOM to settle post-navigation

    const result = await fillField(client, selector, value);

    if (!result.success) {
      throw new Error(result.error || 'Fill failed');
    }

    return {
      success: true,
      selector,
      filled: true,
      url: url || 'active-tab'
    };
  } finally {
    if (attachedTarget?.targetId) {
      try {
        await client.Target.detachFromTarget({ targetId: attachedTarget.targetId });
      } catch (_) { /* ignore */ }
    }
    await client.close();
  }
}

/**
 * Main CLI
 */
async function main() {
  const [,, tool, ...args] = process.argv;

  if (!tool || tool === '-h' || tool === '--help') {
    console.log(`Ghost Overlay MCP Helper (Simple)

Usage:
  node mcp-helper-simple.mjs anchor_map_page <url>
  node mcp-helper-simple.mjs anchor_fill_field <selector> <value> [url]

Examples:
  node mcp-helper-simple.mjs anchor_map_page "file:///Users/ali/GHOST/demo/simple.html"
  node mcp-helper-simple.mjs anchor_fill_field "#name" "John Doe" "http://localhost:8788/ehr.html"
`);
    process.exit(0);
  }

  try {
    let result;

    if (tool === 'anchor_map_page') {
      const url = args[0];
      result = await toolAnchorMapPage(url);
    } else if (tool === 'anchor_fill_field') {
      const selector = args[0];
      const value = args[1];
      const url = args[2];
      result = await toolAnchorFillField(selector, value, url);
    } else {
      throw new Error(`Unknown tool: ${tool}`);
    }

    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.error('[MCP Helper] Error:', err?.message || err);
    process.exit(1);
  }
}

main();
