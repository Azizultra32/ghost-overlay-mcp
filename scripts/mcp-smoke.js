import CDP from 'chrome-remote-interface'
import { writeFileSync } from 'fs'

const PORT = process.env.MCP_DEBUG_PORT ? Number(process.env.MCP_DEBUG_PORT) : 9222
const DEMO_URL = 'file:///Users/ali/Downloads/anchor-browser-poc/demo/ehr.html'
const SIMPLE_URL = 'data:text/html,' +
  encodeURIComponent(`<!DOCTYPE html><html><body><h1>Simple Test</h1><label>Name<input id="name" placeholder="Name"></label><script>console.log('simple page ready')</script></body></html>`)

async function newPage(url) {
  const target = await CDP.New({ port: PORT, url })
  const client = await CDP({ port: PORT, target })
  return { client, target }
}

async function closePage(target) {
  try {
    await CDP.Close({ port: PORT, id: target.id })
  } catch (_) { }
}

async function captureConsole(client) {
  const logs = []
  client.Runtime.consoleAPICalled(({ type, args }) => {
    const text = args.map(a => a.value ?? a.description ?? '').join(' ')
    logs.push({ type, text })
  })
  client.Log.entryAdded(({ entry }) => {
    logs.push({ type: entry.level, text: entry.text })
  })
  return logs
}

async function runDemo() {
  const { client, target } = await newPage(DEMO_URL)
  const { Page, Runtime, Log } = client
  const logs = await captureConsole(client)
  await Promise.all([Page.enable(), Runtime.enable(), Log.enable()])
  await Page.navigate({ url: DEMO_URL })
  await Page.loadEventFired()
  await delay(500)

  const hasAnchorLog = logs.some(l => /AnchorGhost/.test(l.text))
  if (!hasAnchorLog) {
    throw new Error('Content script log not observed on demo page')
  }

  await dispatchHotkey(Runtime)
  await clickOverlay(Runtime, 'btnMap')
  await delay(500)
  await clickOverlay(Runtime, 'btnSend')
  await delay(500)
  await clickOverlay(Runtime, 'btnFill')
  await delay(500)

  const screenshot = await Page.captureScreenshot({ format: 'png' })
  writeFileSync('demo-overlay.png', Buffer.from(screenshot.data, 'base64'))

  await client.close()
  await closePage(target)
  return { logs }
}

async function runSimple() {
  const { client, target } = await newPage(SIMPLE_URL)
  const { Page, Runtime, Log } = client
  const logs = await captureConsole(client)
  await Promise.all([Page.enable(), Runtime.enable(), Log.enable()])
  await Page.navigate({ url: SIMPLE_URL })
  await Page.loadEventFired()
  await delay(500)
  const hasAnchor = logs.some(l => /AnchorGhost/.test(l.text))
  await dispatchHotkey(Runtime)
  await client.close()
  await closePage(target)
  return { hasAnchor }
}

async function dispatchHotkey(Runtime) {
  await Runtime.evaluate({
    expression: `(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'g', ctrlKey: true, altKey: true, bubbles: true }));
      return 'ok'
    })()`
  })
}

async function clickOverlay(Runtime, id) {
  const expr = `(() => {
    const host = document.getElementById('__anchor_ghost_overlay__');
    if (!host || !host.shadowRoot) throw new Error('overlay missing');
    const btn = host.shadowRoot.getElementById('${id}');
    if (!btn) throw new Error('button ${id} missing');
    btn.click();
    return 'clicked ${id}';
  })()`
  const { result } = await Runtime.evaluate({ expression: expr, awaitPromise: false, returnByValue: true })
  return result.value
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function main() {
  const demo = await runDemo()
  const simple = await runSimple()
  console.log(JSON.stringify({ demoLogs: demo.logs.slice(-10), simpleInjected: simple.hasAnchor }, null, 2))
}

main().catch(err => {
  console.error('SMOKE_FAIL', err)
  process.exitCode = 1
})
