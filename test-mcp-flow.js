#!/usr/bin/env node

import CDP from 'chrome-remote-interface';

async function test() {
  const client = await CDP({ port: 9222 });
  const { Target, Page, Runtime } = client;
  
  try {
    // Create new tab
    console.log('Creating new tab...');
    const { targetId } = await Target.createTarget({ url: 'about:blank' });
    await Target.attachToTarget({ targetId, flatten: true });
    
    // Enable domains
    await Page.enable();
    await Runtime.enable();
    
    // Listen for console
    let bridgeInitialized = false;
    Runtime.consoleAPICalled((event) => {
      const msg = event.args?.[0]?.value || '';
      console.log('Console:', msg);
      if (msg.includes('MCP bridge initialized')) {
        bridgeInitialized = true;
      }
    });
    
    // Navigate
    console.log('Navigating to demo.html...');
    await Page.navigate({ url: 'file:///Users/ali/GHOST/demo.html' });
    await Page.loadEventFired();
    
    // Wait for bridge
    console.log('Waiting for MCP bridge...');
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    console.log('Bridge initialized:', bridgeInitialized);
    
    // Test the MCP map flow
    console.log('\nTesting MCP map request...');
    const mapResult = await Runtime.evaluate({
      expression: `
        new Promise((resolve) => {
          const timeout = setTimeout(() => {
            resolve({ error: 'Timeout waiting for response' });
          }, 3000);
          
          const handler = (e) => {
            clearTimeout(timeout);
            window.removeEventListener('__ANCHOR_MCP_MAP_RESPONSE__', handler);
            resolve(e.detail);
          };
          
          window.addEventListener('__ANCHOR_MCP_MAP_RESPONSE__', handler);
          window.dispatchEvent(new Event('__ANCHOR_MCP_MAP_REQUEST__'));
        });
      `,
      awaitPromise: true,
      returnByValue: true
    });
    
    console.log('\nMap Result:', JSON.stringify(mapResult.result?.value, null, 2));
    
    // Test fill if we got fields
    const fields = mapResult.result?.value?.fields;
    if (fields && fields.length > 0) {
      console.log('\nTesting MCP fill request...');
      const firstField = fields[0];
      
      const fillResult = await Runtime.evaluate({
        expression: `
          new Promise((resolve) => {
            const timeout = setTimeout(() => {
              resolve({ success: false, error: 'Timeout' });
            }, 2000);
            
            const handler = (e) => {
              clearTimeout(timeout);
              window.removeEventListener('__ANCHOR_MCP_FILL_RESPONSE__', handler);
              resolve(e.detail);
            };
            
            window.addEventListener('__ANCHOR_MCP_FILL_RESPONSE__', handler);
            window.dispatchEvent(new CustomEvent('__ANCHOR_MCP_FILL_REQUEST__', {
              detail: { 
                selector: ${JSON.stringify(firstField.selector)}, 
                value: 'Test value from MCP' 
              }
            }));
          });
        `,
        awaitPromise: true,
        returnByValue: true
      });
      
      console.log('\nFill Result:', fillResult.result?.value);
    }
    
  } finally {
    await client.close();
  }
}

test().catch(console.error);