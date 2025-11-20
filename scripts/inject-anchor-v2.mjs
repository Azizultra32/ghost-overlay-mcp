import CDP from 'chrome-remote-interface';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 9222;
const CONTENT_SCRIPT_PATH = path.join(__dirname, '../extension/content.js');

async function main() {
  console.log('Connecting to Chrome...');
  let client;
  try {
    client = await CDP({ port: PORT });
    const { Runtime, Page, Target } = client;

    // Find the active page (or the first page)
    const targets = await Target.getTargets();
    const pageTarget = targets.targetInfos.find(t => t.type === 'page' && !t.url.startsWith('devtools://') && !t.url.startsWith('chrome://'));

    if (!pageTarget) {
      console.error('No valid page found to inject into.');
      process.exit(1);
    }

    console.log(`Attaching to target: ${pageTarget.url} [${pageTarget.targetId}]`);
    const { sessionId } = await Target.attachToTarget({ targetId: pageTarget.targetId, flatten: true });

    await Runtime.enable({ sessionId });
    Runtime.on('consoleAPICalled', (params) => {
      const args = params.args.map(a => a.value || a.description).join(' ');
      console.log(`[Browser Console] ${params.type}: ${args}`);
    });
    Runtime.on('exceptionThrown', (params) => {
      console.error(`[Browser Exception] ${params.exceptionDetails.text}`, params.exceptionDetails);
    });

    // Inject Chrome API Mocks
    console.log('Injecting Chrome API mocks...');
    const mockScript = `
      window.chrome = {
        runtime: {
          onMessage: {
            addListener: (callback) => {
              window.__ANCHOR_MESSAGE_LISTENER__ = callback;
              console.log('Anchor: Message listener registered');
            }
          },
          sendMessage: (msg) => console.log('Anchor: sendMessage', msg),
          getURL: (path) => 'http://localhost:8000/' + path // Placeholder
        },
        storage: {
          local: {
            get: (keys, cb) => cb({}),
            set: (items, cb) => { console.log('Anchor: storage.set', items); if(cb) cb(); }
          }
        },
        sidePanel: {
            setPanelBehavior: () => Promise.resolve()
        }
      };
    `;
    await Runtime.evaluate({ sessionId, expression: mockScript });

    // Bundle modules manually for injection
    // We read all files and wrap them in a simple module loader or just concat them in order
    // Since we have imports, we can't just concat. We'll use a simple IIFE strategy or
    // since we are in a browser environment that supports modules, we could try to use type=module
    // But Runtime.evaluate doesn't support modules easily without a server.
    // So we will flatten them:
    // 1. anchorApi.js (types only, skip)
    // 2. domMapper.js (export mapDom)
    // 3. overlay.js (import mapDom, export initOverlay)
    // 4. content.js (import initOverlay)

    console.log('Bundling Anchor v2 UI...');

    const domMapperSrc = fs.readFileSync(path.join(__dirname, '../extension/domMapper.js'), 'utf8')
      .replace(/^export /gm, '');

    const overlaySrc = fs.readFileSync(path.join(__dirname, '../extension/overlay.js'), 'utf8')
      .replace(/^import .*$/gm, '')
      .replace(/^export /gm, '');

    const contentSrc = fs.readFileSync(path.join(__dirname, '../extension/content.js'), 'utf8')
      .replace(/^import .*$/gm, '');

    const bundle =
      "(function() {\n" +
      "try {\n" +
      "console.log('Anchor: Initializing bundle...');\n" +
      domMapperSrc + "\n" +
      overlaySrc + "\n" +
      contentSrc + "\n" +
      "console.log('Anchor: Bundle initialized successfully.');\n" +
      "} catch (e) {\n" +
      "console.error('Anchor: Bundle initialization failed:', e);\n" +
      "}\n" +
      "})();";

    // Inject the script
    console.log('Injecting Anchor v2 UI...');
    const bundleResult = await Runtime.evaluate({
      sessionId,
      expression: bundle,
      awaitPromise: true
    });
    if (bundleResult.exceptionDetails) {
      console.error('Bundle Injection Error:', JSON.stringify(bundleResult.exceptionDetails, null, 2));
    }

    // Also inject a helper to simulate the chrome.runtime.onMessage for the popup
    // This allows us to drive it from the outside via console/CDP
    const bridgeScript = `
      window.__ANCHOR_BRIDGE__ = {
        dispatch: (type, payload = {}) => {
          // Simulate chrome.runtime.onMessage
          // We need to find the listener. Since we can't easily access the internal listener registry of the injected script
          // if it's not exposed, we rely on the fact that we exposed 'overlay' or '__ANCHOR_GHOST__' in content.js
          
          // Better yet, content.js exposes window.__ANCHOR_GHOST__
          const ghost = window.__ANCHOR_GHOST__;
          if (!ghost) return console.error('Anchor Ghost not found');

          switch(type) {
            case 'TOGGLE_OVERLAY': ghost.toggle(); break;
            case 'MAP': ghost.map(); break;
            case 'SEND_MAP': ghost.sendMap(); break;
            case 'FILL_DEMO': ghost.fillDemo(); break;
            default: console.warn('Unknown message type:', type);
          }
        }
      };
      console.log('Anchor Bridge initialized. Use window.__ANCHOR_BRIDGE__.dispatch(type) to control.');
    `;

    await Runtime.evaluate({
      sessionId,
      expression: bridgeScript
    });

    console.log('Injection successful! 💉');
    console.log('You can now control the UI via window.__ANCHOR_GHOST__ or window.__ANCHOR_BRIDGE__');

  } catch (err) {
    console.error('Injection Failed:', err);
    process.exit(1);
  } finally {
    if (client) await client.close();
  }
}

main();
