#!/usr/bin/env node

/**
 * Ensure Developer Mode is Enabled
 * 
 * This script connects to Chrome via CDP, navigates to chrome://extensions,
 * and programmatically enables Developer Mode if it's not already active.
 * This works around the issue where Preferences file modifications are overwritten.
 */

import CDP from 'chrome-remote-interface';

const PORT = Number(process.env.MCP_DEBUG_PORT || 9222);
const TIMEOUT = 10000; // 10 seconds

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function ensureDevMode() {
  console.log(`[DevMode] Connecting to Chrome on port ${PORT}...`);
  
  let client;
  try {
    client = await CDP({ port: PORT });
    const { Page, Runtime } = client;

    await Page.enable();
    await Runtime.enable();

    console.log('[DevMode] Navigating to chrome://extensions...');
    await Page.navigate({ url: 'chrome://extensions' });
    await Page.loadEventFired();

    // Give the UI a moment to settle
    await sleep(500);

    console.log('[DevMode] Checking Developer Mode status...');
    
    // Script to find and toggle Developer Mode
    // We use the extensions-manager component which contains the toolbar
    const toggleScript = `
      (async () => {
        try {
          const manager = document.querySelector('extensions-manager');
          if (!manager) return { error: 'extensions-manager not found' };
          
          // Access the shadow root
          const toolbar = manager.shadowRoot.querySelector('extensions-toolbar');
          if (!toolbar) return { error: 'extensions-toolbar not found' };
          
          const toggle = toolbar.shadowRoot.querySelector('#devMode');
          if (!toggle) return { error: 'devMode toggle not found' };
          
          const isChecked = toggle.checked;
          
          if (!isChecked) {
            toggle.click();
            return { status: 'toggled', was: false, now: true };
          }
          
          return { status: 'already_enabled', was: true, now: true };
        } catch (e) {
          return { error: e.toString() };
        }
      })()
    `;

    const result = await Runtime.evaluate({
      expression: toggleScript,
      awaitPromise: true,
      returnByValue: true
    });

    const value = result.result?.value;

    if (value?.error) {
      console.error(`[DevMode] Error: ${value.error}`);
      process.exit(1);
    }

    if (value?.status === 'toggled') {
      console.log('[DevMode] ✅ Successfully enabled Developer Mode');
    } else if (value?.status === 'already_enabled') {
      console.log('[DevMode] ✅ Developer Mode was already enabled');
    } else {
      console.warn('[DevMode] ⚠️ Unknown status:', value);
    }

  } catch (err) {
    console.error('[DevMode] Failed:', err.message);
    process.exit(1);
  } finally {
    if (client) {
      await client.close();
    }
  }
}

// Run with timeout
Promise.race([
  ensureDevMode(),
  new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), TIMEOUT))
]).catch(err => {
  console.error(`[DevMode] Critical Error: ${err.message}`);
  process.exit(1);
});
