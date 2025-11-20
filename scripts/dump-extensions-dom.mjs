import CDP from 'chrome-remote-interface';

const PORT = 9222;

async function main() {
    let client;
    try {
        client = await CDP({ port: PORT });
        const { Target, Runtime, DOM } = client;

        const targets = await Target.getTargets();
        const extPage = targets.targetInfos.find(t => t.url.startsWith('chrome://extensions'));

        if (!extPage) {
            console.log('No extensions page found');
            return;
        }

        const { sessionId } = await Target.attachToTarget({ targetId: extPage.targetId, flatten: true });

        // Dump the full HTML
        const { result } = await Runtime.evaluate({
            sessionId,
            expression: 'document.documentElement.outerHTML',
            returnByValue: true
        });

        console.log(result.value);

    } catch (err) {
        console.error(err);
    } finally {
        if (client) await client.close();
    }
}

main();
