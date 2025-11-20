import CDP from 'chrome-remote-interface';

const PORT = 9222;

async function main() {
    console.log('Connecting...');
    let client;
    try {
        client = await CDP({ port: PORT });
        const { Target } = client;
        const targets = await Target.getTargets();
        console.log('Connected! Targets:', targets.targetInfos.length);
        targets.targetInfos.forEach(t => console.log(`- ${t.type}: ${t.url} [${t.targetId}]`));
    } catch (err) {
        console.error('Failed:', err);
    } finally {
        if (client) await client.close();
    }
}

main();
