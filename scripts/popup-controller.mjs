import CDP from 'chrome-remote-interface';

const PORT = 9222;
const COMMAND = process.argv[2]; // e.g., TOGGLE_OVERLAY, MAP, SEND_MAP, FILL_DEMO

if (!COMMAND) {
    console.log('Usage: node scripts/popup-controller.mjs <COMMAND>');
    console.log('Commands: TOGGLE_OVERLAY, MAP, SEND_MAP, FILL_DEMO');
    process.exit(1);
}

async function main() {
    let client;
    try {
        client = await CDP({ port: PORT });
        const { Runtime, Target } = client;

        // Find the active page (not devtools)
        const targets = await Target.getTargets();
        const pageTarget = targets.targetInfos.find(t => t.type === 'page' && !t.url.startsWith('devtools://'));

        if (!pageTarget) {
            console.error('No active page found.');
            process.exit(1);
        }

        const { sessionId } = await Target.attachToTarget({ targetId: pageTarget.targetId, flatten: true });

        // Send command via the bridge
        const expression = `
      if (window.__ANCHOR_BRIDGE__) {
        window.__ANCHOR_BRIDGE__.dispatch('${COMMAND}');
        'Command sent: ${COMMAND}';
      } else {
        'Error: Anchor Bridge not found. Run inject-anchor-v2.mjs first.';
      }
    `;

        const { result } = await Runtime.evaluate({ sessionId, expression, returnByValue: true });
        console.log(result.value);

    } catch (err) {
        console.error('Failed:', err);
    } finally {
        if (client) await client.close();
    }
}

main();
