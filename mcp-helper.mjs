#!/usr/bin/env node

/**
 * MCP Helper for Ghost Overlay Extension
 *
 * This script bridges MCP tools with the Chrome extension via CDP.
 * It works around Chrome MV3 isolated worlds by using custom events.
 */

import CDP from 'chrome-remote-interface';

const DEVTOOLS_PORT = Number(process.env.MCP_DEVTOOLS_PORT || 9222);
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Connect to Chrome DevTools Protocol
 */
async function connectCDP() {
  try {
    return await CDP({ port: DEVTOOLS_PORT });
  } catch (err) {
    throw new Error(`Failed to connect to Chrome on port ${DEVTOOLS_PORT}. Is Chrome running with --remote-debugging-port=${DEVTOOLS_PORT}?`);
  }
}

/**
 * Get or create a page target
 */
async function getOrCreatePage(client) {
  const { Target } = client;
  const { targetInfos } = await Target.getTargets();
  const existing = targetInfos.find(t => t.type === 'page' && !t.attached);
  if (existing) return existing.targetId;

  const created = await Target.createTarget({ url: 'about:blank' });
  return created.targetId;
}

/**
 * Navigate to a URL and wait for load
 */
async function navigate(client, targetId, url) {
  const { Target, Page } = client;
  await Target.attachToTarget({ targetId, flatten: true });
  await Page.enable();
  await Page.navigate({ url });
  await Page.loadEventFired();
}

/**
 * Evaluate JavaScript in page context
 */
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
 * Wait for content script to inject by polling for console message
 */
async function waitForContentScript(client, timeoutMs = 5000) {
  const { Runtime } = client;
  await Runtime.enable();

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Timeout waiting for content script to inject'));
    }, timeoutMs);

    Runtime.consoleAPICalled((event) => {
      const msg = event.args?.[0]?.value || '';
      if (msg.includes('AssistMD: MCP bridge initialized')) {
        clearTimeout(timeout);
        resolve();
      }
    });
  });
}

/**
 * Map DOM fields via MCP bridge using custom events
 */
async function mapDomFields(client, url) {
  // Trigger map request event
  const triggerScript = `
    (async () => {
      return new Promise((resolve) => {
        const handler = (e) => {
          window.removeEventListener('__ANCHOR_MCP_MAP_RESPONSE__', handler);
          resolve(e.detail);
        };
        window.addEventListener('__ANCHOR_MCP_MAP_RESPONSE__', handler);
        window.dispatchEvent(new Event('__ANCHOR_MCP_MAP_REQUEST__'));

        // Timeout after 2 seconds
        setTimeout(() => resolve({ error: 'Timeout waiting for map response' }), 2000);
      });
    })();
  `;

  const result = await evalInPage(client, triggerScript, true);

  if (result?.error) {
    throw new Error(result.error);
  }

  return {
    url: result.url || url,
    fields: result.fields || [],
    capturedAt: new Date().toISOString()
  };
}

/**
 * Fill a field via MCP bridge using custom events
 */
async function fillField(client, selector, value) {
  const fillScript = `
    (async () => {
      return new Promise((resolve) => {
        const handler = (e) => {
          window.removeEventListener('__ANCHOR_MCP_FILL_RESPONSE__', handler);
          resolve(e.detail);
        };
        window.addEventListener('__ANCHOR_MCP_FILL_RESPONSE__', handler);
        window.dispatchEvent(new CustomEvent('__ANCHOR_MCP_FILL_REQUEST__', {
          detail: { selector: ${JSON.stringify(selector)}, value: ${JSON.stringify(value)} }
        }));

        // Timeout after 2 seconds
        setTimeout(() => resolve({ success: false, error: 'Timeout' }), 2000);
      });
    })();
  `;

  return evalInPage(client, fillScript, true);
}

/**
 * Tool: anchor_map_page
 * Maps all editable fields on a page
 */
async function toolAnchorMapPage(url) {
  if (!url) throw new Error('anchor_map_page requires a url argument');

  const client = await connectCDP();
  try {
    const targetId = await getOrCreatePage(client);
    await navigate(client, targetId, url);

    // Wait for content script to inject
    console.error('Waiting for content script...');
    await waitForContentScript(client);

    // Give it a moment to fully initialize
    await sleep(500);

    // Map DOM fields
    console.error('Mapping DOM fields...');
    const domMap = await mapDomFields(client, url);

    return {
      success: true,
      url: domMap.url,
      fields: domMap.fields,
      capturedAt: domMap.capturedAt,
      fieldCount: domMap.fields.length
    };
  } finally {
    await client.close();
  }
}

/**
 * Tool: anchor_fill_field
 * Fills a specific field with a value
 */
async function toolAnchorFillField(selector, value) {
  if (!selector) throw new Error('anchor_fill_field requires a selector argument');
  if (value === undefined) throw new Error('anchor_fill_field requires a value argument');

  const client = await connectCDP();
  try {
    const result = await fillField(client, selector, value);

    if (!result.success) {
      throw new Error(result.error || 'Fill failed');
    }

    return {
      success: true,
      selector,
      filled: true
    };
  } finally {
    await client.close();
  }
}

/**
 * Main CLI entry point
 */
async function main() {
  const [,, tool, ...args] = process.argv;

  if (!tool || tool === '-h' || tool === '--help') {
    console.log(`Ghost Overlay MCP Helper

Usage:
  node mcp-helper.mjs anchor_map_page <url>
  node mcp-helper.mjs anchor_fill_field <selector> <value>

Examples:
  node mcp-helper.mjs anchor_map_page "file:///Users/ali/GHOST/demo/simple.html"
  node mcp-helper.mjs anchor_fill_field "#name" "John Doe"
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
      result = await toolAnchorFillField(selector, value);
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
