import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const domMapperSrc = fs.readFileSync(path.join(__dirname, '../extension/domMapper.js'), 'utf8')
    .replace(/^export /gm, '');

const overlaySrc = fs.readFileSync(path.join(__dirname, '../extension/overlay.js'), 'utf8')
    .replace(/^import .*$/gm, '')
    .replace(/^export /gm, '');

const contentSrc = fs.readFileSync(path.join(__dirname, '../extension/content.js'), 'utf8')
    .replace(/^import .*$/gm, '');

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
    getURL: (path) => 'http://localhost:8000/' + path
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

const bundle =
    mockScript + "\n" +
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

fs.writeFileSync(path.join(__dirname, 'bundle.js'), bundle);
console.log('Bundle written to scripts/bundle.js');
