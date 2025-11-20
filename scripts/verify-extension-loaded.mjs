#!/usr/bin/env node
import CDP from 'chrome-remote-interface';

const PORT = process.env.MCP_DEBUG_PORT || 9222;
const EXPECTED_NAME = 'AssistMD Ghost Overlay (MVP)';

async function verifyExtension() {
    let client;
    try {
        client = await CDP({ port: PORT });
        const { Target, Runtime } = client;

        const targets = await Target.getTargets();
        let extPage = targets.targetInfos.find(t => t.url.startsWith('chrome://extensions'));

        if (!extPage) {
            const { sessionId } = await Target.attachToTarget({ targetId: targets.targetInfos[0].targetId, flatten: true });
            const { Page } = client;
            await Page.enable({ sessionId });
            await Page.navigate({ sessionId, url: 'chrome://extensions' });
            await new Promise(r => setTimeout(r, 1000));

            const newTargets = await Target.getTargets();
            extPage = newTargets.targetInfos.find(t => t.url.startsWith('chrome://extensions'));
        }

        if (!extPage) {
            throw new Error('Could not open chrome://extensions');
        }

        const { sessionId } = await Target.attachToTarget({ targetId: extPage.targetId, flatten: true });

        const scrapeScript = `
            (async () => {
                const manager = document.querySelector('extensions-manager');
                if (!manager) return [];
                const itemList = manager.shadowRoot.querySelector('extensions-item-list');
                if (!itemList) return [];
                const items = Array.from(itemList.shadowRoot.querySelectorAll('extensions-item'));
                return items.map(item => {
                    const shadow = item.shadowRoot;
                    return {
                        name: shadow.querySelector('#name').textContent.trim(),
                        version: shadow.querySelector('#version').textContent.trim(),
                        enabled: shadow.querySelector('#enableToggle').checked
                    };
                });
            })()
        `;

        const { result } = await Runtime.evaluate({ sessionId, expression: scrapeScript, returnByValue: true, awaitPromise: true });
        const extensions = result.value;

        const ghostExt = extensions.find(e => e.name === EXPECTED_NAME);

        if (!ghostExt) {
            const loaded = extensions.map(e => e.name).join(', ') || '(none)';
            throw new Error(`Extension "${EXPECTED_NAME}" NOT FOUND. Loaded extensions: ${loaded}`);
        }

        if (!ghostExt.enabled) {
            throw new Error(`Extension "${EXPECTED_NAME}" is DISABLED`);
        }

        console.log(`✅ Extension verified: ${ghostExt.name} v${ghostExt.version} (enabled)`);

    } catch (err) {
        throw err;
    } finally {
        if (client) await client.close();
    }
}

const RETRIES = parseInt(process.env.EXT_VERIFY_RETRIES || "5");
const WAIT_MS = parseInt(process.env.EXT_VERIFY_WAIT_MS || "1000");
(async () => {
    for (let attempt = 1; attempt <= RETRIES; attempt++) {
        try {
            await verifyExtension();
            process.exit(0);
        } catch (err) {
            console.error(`❌ Verification attempt ${attempt}/${RETRIES} failed:`, err?.message || err);
            if (attempt < RETRIES) {
                await new Promise((r) => setTimeout(r, WAIT_MS));
            } else {
                process.exit(1);
            }
        }
    }
})();
