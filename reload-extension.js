#!/usr/bin/env node

import CDP from 'chrome-remote-interface';

async function reloadExtension() {
  const client = await CDP({ port: 9222 });
  
  try {
    // Navigate to extensions page
    const { Target, Page } = client;
    const { targetId } = await Target.createTarget({ url: 'chrome://extensions' });
    await Target.attachToTarget({ targetId, flatten: true });
    await Page.enable();
    
    console.log('Navigating to chrome://extensions...');
    await Page.navigate({ url: 'chrome://extensions' });
    await Page.loadEventFired();
    
    // Wait for page to load
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    console.log('Extensions page loaded. You need to:');
    console.log('1. Find "AssistMD Ghost Overlay (MVP)"');
    console.log('2. Click the reload button (circular arrow icon)');
    console.log('3. Or disable/re-enable the extension');
    console.log('\nAfter reloading, the MCP bridge should work.');
    
  } finally {
    // Keep the tab open, don't close
    console.log('\nTab left open at chrome://extensions');
  }
}

reloadExtension().catch(console.error);