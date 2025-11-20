#!/usr/bin/env node
import CDP from 'chrome-remote-interface'

const PORT = 9222
// We'll use a blank page or a simple data URL if we can't reach localhost:8788
// But the extension runs on <all_urls> so any page works.
// Let's try to navigate to a data URL that simulates an EMR.
const URL = 'http://example.com'

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

async function pickPage(client) {
    const { Target } = client
    const targets = await Target.getTargets()
    // Find any page
    const page = targets.targetInfos.find(t => t.type === 'page')
    return page?.targetId || null
}

async function ensurePage(client) {
    const { Target, Page, Runtime } = client
    const targets = await Target.getTargets()
    // Pick the first page that isn't devtools
    const page = targets.targetInfos.find(t => t.type === 'page' && !t.url.startsWith('devtools://') && !t.url.startsWith('chrome://'))

    if (!page) throw new Error('No page found')

    console.log(`Attaching to ${page.url}...`)
    const attached = await Target.attachToTarget({ targetId: page.targetId, flatten: true })
    const sessionId = attached.sessionId

    // Don't navigate, just enable
    await Runtime.enable({ sessionId })
    Runtime.on('consoleAPICalled', (params) => {
        const args = params.args.map(a => a.value || a.description).join(' ');
        console.log(`[Browser Console] ${params.type}: ${args}`);
    });
    Runtime.on('exceptionThrown', (params) => {
        console.error(`[Browser Exception] ${params.exceptionDetails.text}`, params.exceptionDetails);
    });

    return sessionId
}

async function waitGhost(Runtime, sessionId, attempts = 20) {
    for (let i = 0; i < attempts; i++) {
        const { result } = await Runtime.evaluate({
            sessionId, expression: 'typeof window.__ANCHOR_GHOST__ === "object"', returnByValue: true
        })
        if (result?.value === true) return true
        await sleep(250)
    }
    return false
}

async function call(Runtime, sessionId, expr) {
    const { result, exceptionDetails } = await Runtime.evaluate({
        sessionId, expression: expr, awaitPromise: true, returnByValue: true
    })
    if (exceptionDetails) throw new Error('Eval error: ' + JSON.stringify(exceptionDetails))
    return result.value
}

async function main() {
    console.log('Connecting to Chrome...');
    let client;
    try {
        client = await CDP({ port: PORT })
    } catch (e) {
        console.error('Failed to connect to Chrome. Is it running?');
        process.exit(1);
    }

    try {
        const sessionId = await ensurePage(client)
        const { Runtime } = client

        console.log('Waiting for Anchor Ghost API...');
        if (!(await waitGhost(Runtime, sessionId))) {
            throw new Error('Overlay API not found on page (Ghost button missing or content script not injected).')
        }
        console.log('Anchor Ghost API found!');

        console.log('Testing map()...');
        await call(Runtime, sessionId, 'window.__ANCHOR_GHOST__.map()')

        // Check if overlay is visible (by checking internal state via API or DOM)
        // We can check if the shadow root exists
        const checkOverlay = `
      (function() {
        const root = document.getElementById('__anchor_ghost_overlay__');
        return !!root && !!root.shadowRoot;
      })()
    `;
        const overlayExists = await call(Runtime, sessionId, checkOverlay);
        console.log(`Overlay injected: ${overlayExists}`);

        console.log(JSON.stringify({ ok: true, overlayExists }, null, 2))
    } catch (e) {
        console.error('Verification Failed:', e.message);
        process.exit(1);
    } finally {
        if (client) await client.close()
    }
}

main().catch(e => { console.error('CDP FAIL:', e.message); process.exit(1) })
