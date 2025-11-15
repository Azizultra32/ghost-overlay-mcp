#!/usr/bin/env node

import CDP from 'chrome-remote-interface';

async function test() {
  const client = await CDP({ port: 9222 });
  const { Target, Page, Runtime } = client;
  
  try {
    // Create new tab
    const { targetId } = await Target.createTarget({ url: 'about:blank' });
    await Target.attachToTarget({ targetId, flatten: true });
    
    // Enable domains
    await Page.enable();
    await Runtime.enable();
    
    // Listen for console
    Runtime.consoleAPICalled((event) => {
      console.log('Console:', event.args?.[0]?.value || event);
    });
    
    // Navigate
    console.log('Navigating to demo.html...');
    await Page.navigate({ url: 'file:///Users/ali/GHOST/demo.html' });
    await Page.loadEventFired();
    
    // Wait a bit for content script
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Check if content script loaded
    const result = await Runtime.evaluate({
      expression: `
        // Try to trigger an event
        try {
          window.dispatchEvent(new Event('__ANCHOR_MCP_MAP_REQUEST__'));
          'Event dispatched';
        } catch (e) {
          'Error: ' + e.message;
        }
      `,
      returnByValue: true
    });
    
    console.log('Result:', result.result?.value);
    
    // Also check for any globals
    const globals = await Runtime.evaluate({
      expression: `Object.keys(window).filter(k => k.includes('ANCHOR') || k.includes('AssistMD'))`,
      returnByValue: true
    });
    
    console.log('ANCHOR/AssistMD globals found:', globals.result?.value);
    
  } finally {
    await client.close();
  }
}

test().catch(console.error);