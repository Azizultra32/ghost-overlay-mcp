# MCP Integration Guide - Preventing Common Issues

This document ensures smooth MCP integration with Chrome extensions and prevents getting stuck.

## ⚠️ Chrome MV3 Isolated Worlds Problem

### The Issue
Chrome Manifest V3 extensions run content scripts in **isolated worlds**:
- Content scripts CAN manipulate the DOM
- Content scripts CANNOT share `window` objects with the page
- CDP `Runtime.evaluate()` runs in the **page context**, not the content script context
- This means: `window.myExtensionFunction` is **invisible** to CDP

### The Solution: Custom Events Bridge
Use DOM events to communicate between page context (CDP) and content script context:

```javascript
// In content script (content.js):
window.addEventListener('__ANCHOR_MCP_MAP_REQUEST__', () => {
  // Do work in content script context
  const data = collectData();

  // Send response back to page context
  window.dispatchEvent(new CustomEvent('__ANCHOR_MCP_MAP_RESPONSE__', {
    detail: data
  }));
});

// In CDP (via Runtime.evaluate):
const result = await evalInPage(`
  new Promise((resolve) => {
    window.addEventListener('__ANCHOR_MCP_MAP_RESPONSE__', (e) => {
      resolve(e.detail);
    });
    window.dispatchEvent(new Event('__ANCHOR_MCP_MAP_REQUEST__'));
  });
`, true); // awaitPromise: true
```

## ✅ Checklist: Before Adding MCP Integration

### 1. Verify Extension is Loaded
```bash
# Check Chrome is running with remote debugging
curl -s http://localhost:9222/json/version

# Check extension is loaded (look for your extension ID)
curl -s http://localhost:9222/json | jq
```

### 2. Verify Content Script Injection
```javascript
// Add console.log in content script
console.log('AssistMD: Content script loaded');

// In CDP, enable console monitoring:
await Runtime.enable();
Runtime.consoleAPICalled((event) => {
  console.log('Console:', event.args[0]?.value);
});
```

### 3. Test Event Bridge Works
```javascript
// Test in CDP that events work:
await evalInPage(`
  window.dispatchEvent(new Event('test'));
  'dispatched';
`);
```

### 4. Add Timeouts to All Promises
```javascript
// ALWAYS add timeouts to event listeners
new Promise((resolve) => {
  const handler = (e) => resolve(e.detail);
  window.addEventListener('response', handler);
  window.dispatchEvent(new Event('request'));

  // CRITICAL: Add timeout
  setTimeout(() => resolve({ error: 'Timeout' }), 2000);
});
```

### 5. Handle CDP Connection Failures
```javascript
async function connectCDP() {
  try {
    return await CDP({ port: 9222 });
  } catch (err) {
    throw new Error(
      `Failed to connect to Chrome on port 9222. ` +
      `Is Chrome running with --remote-debugging-port=9222?`
    );
  }
}
```

## 🚫 Common Mistakes to Avoid

### ❌ DON'T: Access content script globals from CDP
```javascript
// This will NOT work:
await evalInPage(`window.__MY_EXTENSION_VAR__`);
// Returns: undefined (different context)
```

### ✅ DO: Use custom events bridge
```javascript
// This WILL work:
await evalInPage(`
  new Promise((resolve) => {
    window.addEventListener('__RESPONSE__', (e) => resolve(e.detail));
    window.dispatchEvent(new Event('__REQUEST__'));
  });
`, true);
```

### ❌ DON'T: Forget to await promises in CDP
```javascript
// This will NOT work:
await evalInPage(`
  new Promise((resolve) => setTimeout(() => resolve('done'), 100));
`);
// awaitPromise defaults to false!
```

### ✅ DO: Set awaitPromise: true
```javascript
await evalInPage(`
  new Promise((resolve) => setTimeout(() => resolve('done'), 100));
`, true); // awaitPromise: true
```

### ❌ DON'T: Assume content script is ready
```javascript
// This might fail if content script isn't loaded yet:
await navigate(client, targetId, url);
await mapDomFields(client); // Might fail!
```

### ✅ DO: Wait for content script readiness signal
```javascript
await navigate(client, targetId, url);
await waitForContentScript(client); // Wait for injection
await sleep(500); // Give it time to initialize
await mapDomFields(client);
```

## 🧪 Testing Strategy

### Test 1: Content Script Loads
```bash
# Open Chrome DevTools on your test page
# Check console for: "AssistMD: Content script loaded"
```

### Test 2: Event Bridge Works
```javascript
// In DevTools console:
window.dispatchEvent(new Event('__ANCHOR_MCP_MAP_REQUEST__'));
// Should see "__ANCHOR_MCP_MAP_RESPONSE__" fired with field data
```

### Test 3: MCP Helper Works
```bash
# Test mapping via MCP helper
node /Users/ali/GHOST/mcp-helper.mjs anchor_map_page "file:///Users/ali/GHOST/demo/simple.html"

# Should return JSON with fields array
```

### Test 4: Fill Works
```bash
# Test filling via MCP helper
node /Users/ali/GHOST/mcp-helper.mjs anchor_fill_field "#name" "Test Name"

# Should return { success: true }
```

## 📋 Troubleshooting Flowchart

```
MCP integration not working?
│
├─ Is Chrome running with --remote-debugging-port=9222?
│  NO → Start Chrome with: ./word start
│  YES ↓
│
├─ Is extension loaded in chrome://extensions?
│  NO → Enable Developer Mode, load unpacked extension
│  YES ↓
│
├─ Does content script inject? (check console)
│  NO → Check manifest.json content_scripts matches
│  YES ↓
│
├─ Do custom events fire? (test in DevTools console)
│  NO → Check content.js has event listeners
│  YES ↓
│
├─ Does CDP connect? (curl http://localhost:9222/json)
│  NO → Check firewall, check Chrome flags
│  YES ↓
│
├─ Does Runtime.evaluate work? (test simple expression)
│  NO → Check client.close() isn't called too early
│  YES ↓
│
└─ Does event bridge timeout?
   YES → Increase timeout, check event names match exactly
   NO → Check promise resolution logic
```

## 🔧 Quick Fixes

### Fix 1: Content Script Not Injecting
```json
// manifest.json
{
  "content_scripts": [{
    "matches": ["<all_urls>"], // Make sure this matches your test page
    "js": ["content.js"],
    "run_at": "document_idle" // or "document_end"
  }]
}
```

### Fix 2: Events Not Firing
```javascript
// Make sure event names match EXACTLY (case-sensitive)
// Sender:
window.dispatchEvent(new Event('__ANCHOR_MCP_MAP_REQUEST__'));
// Receiver:
window.addEventListener('__ANCHOR_MCP_MAP_REQUEST__', handler);
```

### Fix 3: CDP Returns Undefined
```javascript
// Check if you're awaiting the promise:
const result = await evalInPage(script, true); // awaitPromise: true
```

### Fix 4: Timeout Issues
```javascript
// Increase timeout if content script is slow:
setTimeout(() => resolve({ error: 'Timeout' }), 5000); // 5 seconds
```

## 📝 Files Modified

When integrating MCP, these files need changes:

1. **content.js** - Add event listeners for MCP bridge
2. **mcp-helper.mjs** - New file, CDP wrapper for MCP tools
3. **package.json** - Add `chrome-remote-interface` dependency
4. **manifest.json** - Ensure content_scripts covers test pages

## 🎯 Success Criteria

MCP integration is successful when:

1. ✅ `node mcp-helper.mjs anchor_map_page <url>` returns field data
2. ✅ `node mcp-helper.mjs anchor_fill_field <selector> <value>` fills the field
3. ✅ No timeout errors in CDP
4. ✅ Content script console shows "MCP bridge initialized"
5. ✅ Events fire and respond within 2 seconds

## 🚀 Next Steps After Integration

1. Wire mcp-helper.mjs into Codex MCP server
2. Create MCP tool definitions (anchor_map_page, anchor_fill_field)
3. Test end-to-end with Codex CLI
4. Document in main README.md
5. Add to smoke tests

---

**Last Updated:** 2025-11-14
**Maintained By:** Guardian Angel Claude 🛡️
