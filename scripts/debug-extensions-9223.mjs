import CDP from 'chrome-remote-interface';

const PORT = 9223;

async function main() {
    console.log('Connecting...');
    let client;
    try {
        client = await CDP({ port: PORT });
        const { Target, Runtime } = client;

        // Find chrome://extensions
        const targets = await Target.getTargets();
        let extPage = targets.targetInfos.find(t => t.url.startsWith('chrome://extensions'));

        if (!extPage) {
            console.log('Navigating to chrome://extensions...');
            // Attach to the first available target (usually the browser itself or a blank page)
            const { sessionId: navigationSessionId } = await Target.attachToTarget({ targetId: targets.targetInfos[0].targetId, flatten: true });
            const { Page } = client;
            await Page.enable({ sessionId: navigationSessionId });
            await Page.navigate({ sessionId: navigationSessionId, url: 'chrome://extensions' });
            await new Promise(r => setTimeout(r, 1000)); // Wait for load

            // Refresh targets to find the newly opened chrome://extensions page
            const newTargets = await Target.getTargets();
            extPage = newTargets.targetInfos.find(t => t.url.startsWith('chrome://extensions'));

            if (!extPage) {
                console.error('Failed to navigate to chrome://extensions or find it after navigation.');
                process.exit(1);
            }
        }

        console.log('Attaching to chrome://extensions...');
        const { sessionId } = await Target.attachToTarget({ targetId: extPage.targetId, flatten: true });

        // Helper to evaluate in the page
        const evaluate = async (expression) => {
            const { result } = await Runtime.evaluate({ sessionId, expression, returnByValue: true, awaitPromise: true });
            return result.value;
        };

        // Script to scrape extension info
        const scrapeScript = `
      (async () => {
        const manager = document.querySelector('extensions-manager');
        if (!manager) return 'Manager not found';
        
        const itemList = manager.shadowRoot.querySelector('extensions-item-list');
        if (!itemList) return 'Item list not found';
        
        // Wait a bit for items to render?
        // The list might be empty if nothing installed
        
        const items = Array.from(itemList.shadowRoot.querySelectorAll('extensions-item'));
        
        return items.map(item => {
          const shadow = item.shadowRoot;
          const name = shadow.querySelector('#name').textContent;
          const version = shadow.querySelector('#version').textContent;
          const enabled = shadow.querySelector('#enableToggle').checked;
          const errorBtn = shadow.querySelector('#errors-button');
          const hasErrors = errorBtn && !errorBtn.hidden;
          
          // Try to get error text if present
          let errorText = '';
          if (hasErrors) {
             errorText = 'Has Errors (click to view)';
          }

          // Check for warnings/alerts
          const alerts = Array.from(shadow.querySelectorAll('.alert')).map(a => a.textContent);

          return { name, version, enabled, hasErrors, errorText, alerts };
        });
      })()
    `;

        const extensions = await evaluate(scrapeScript);
        console.log('Installed Extensions:');
        console.log(JSON.stringify(extensions, null, 2));

    } catch (err) {
        console.error('Failed:', err);
    } finally {
        if (client) await client.close();
    }
}

main();
