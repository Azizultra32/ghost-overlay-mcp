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
            console.error('❌ Could not open chrome://extensions');
            process.exit(1);
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
            console.error(`❌ Extension "${EXPECTED_NAME}" NOT FOUND`);
            console.error('Loaded extensions:', extensions.map(e => e.name).join(', ') || '(none)');
            process.exit(1);
        }

        if (!ghostExt.enabled) {
            console.error(`❌ Extension "${EXPECTED_NAME}" is DISABLED`);
            process.exit(1);
        }

        console.log(`✅ Extension verified: ${ghostExt.name} v${ghostExt.version} (enabled)`);
        process.exit(0);

    } catch (err) {
        console.error('❌ Verification failed:', err.message);
        process.exit(1);
    } finally {
        if (client) await client.close();
    }
}

verifyExtension();
