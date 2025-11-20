import { initOverlay } from './overlay.js';

(function bootstrap() {
  try {
    initOverlay();
    setupRuntimeMessages();
    setupMcpBridge();
    console.log('[Anchor] Content script ready:', window.location.href);
  } catch (err) {
    console.error('[Anchor] Failed to initialize overlay', err);
  }
})();

function ensureAnchorApi() {
  if (!window.Anchor) {
    throw new Error('Anchor API not ready');
  }
  return window.Anchor;
}

function setupRuntimeMessages() {
  if (typeof chrome === 'undefined' || !chrome.runtime?.onMessage) return;

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    (async () => {
      try {
        const api = ensureAnchorApi();

        switch (msg?.type) {
          case 'TOGGLE_OVERLAY':
            api.togglePanel();
            sendResponse({ ok: true });
            break;
          case 'MAP':
            sendResponse(await api.map());
            break;
          case 'SEND_MAP':
            sendResponse(await api.sendMap());
            break;
          case 'FILL_DEMO':
            sendResponse(await api.fill());
            break;
          default:
            sendResponse({ ok: false, error: 'Unknown command' });
        }
      } catch (err) {
        sendResponse({ ok: false, error: String(err) });
      }
    })();

    return true; // keep channel open for async responses
  });
}

function setupMcpBridge() {
  if (window.__ANCHOR_MCP_BRIDGE_READY__) return;
  window.__ANCHOR_MCP_BRIDGE_READY__ = true;

  const wire = (requestEvent, responseEvent, handler) => {
    window.addEventListener(requestEvent, async (event) => {
      try {
        const payload = await handler(event?.detail);
        window.dispatchEvent(new CustomEvent(responseEvent, { detail: { ok: true, ...payload } }));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        window.dispatchEvent(new CustomEvent(responseEvent, { detail: { ok: false, error: message } }));
      }
    });
  };

  wire('__ANCHOR_MCP_MAP_REQUEST__', '__ANCHOR_MCP_MAP_RESPONSE__', async () => {
    const api = ensureAnchorApi();
    const mapResult = await api.map();
    return {
      url: window.location.href,
      title: document.title,
      fields: mapResult?.fields || []
    };
  });

  wire('__ANCHOR_MCP_SEND_REQUEST__', '__ANCHOR_MCP_SEND_RESPONSE__', async () => {
    const api = ensureAnchorApi();
    return await api.sendMap();
  });

  wire('__ANCHOR_MCP_FILL_REQUEST__', '__ANCHOR_MCP_FILL_RESPONSE__', async (detail) => {
    const api = ensureAnchorApi();
    // allow optional note injection via event detail
    if (detail?.note && typeof detail.note === 'string') {
      window.__ANCHOR_MCP_NOTE__ = detail.note;
    }
    return await api.fill();
  });
}
