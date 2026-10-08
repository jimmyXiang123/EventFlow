/**
 * Minimal CDP driver: launch headless Chrome, navigate, evaluate an expression
 * in the page, print the result. Used to verify the running UI (geometry and
 * interactions) rather than to guess from screenshots.
 *
 * Usage:
 *   node qa/cdp.mjs "<url>" "<js expression>"
 *   node qa/cdp.mjs "<url>" --file qa/some-script.js
 *
 * The --file form exists because passing multi-line JavaScript through a
 * PowerShell argument mangles it.
 */
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const URL_ARG = process.argv[2] ?? 'http://localhost:5199/'
const EXPR =
  process.argv[3] === '--file'
    ? readFileSync(process.argv[4], 'utf8')
    : (process.argv[3] ?? 'document.title')

const CHROME_CANDIDATES = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
]

const port = 9333 + Math.floor(Math.random() * 500)
const profile = mkdtempSync(join(tmpdir(), 'ef-cdp-'))

const child = spawn(
  CHROME_CANDIDATES[0],
  [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    '--window-size=1600,1050',
    'about:blank',
  ],
  { stdio: 'ignore' },
)

async function endpoint() {
  for (let i = 0; i < 60; i += 1) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`)
      if (res.ok) return (await res.json()).webSocketDebuggerUrl
    } catch {
      /* not up yet */
    }
    await sleep(250)
  }
  throw new Error('Chrome did not expose a debugging endpoint')
}

function connect(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl)
    ws.onopen = () => resolve(ws)
    ws.onerror = (e) => reject(new Error(`websocket error: ${e.message ?? 'unknown'}`))
  })
}

/** Tiny request/response correlation over the CDP websocket. */
function makeSend(ws) {
  let id = 0
  const pending = new Map()
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data)
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id)
      pending.delete(msg.id)
      if (msg.error) reject(new Error(JSON.stringify(msg.error)))
      else resolve(msg.result)
    }
  }
  return (method, params = {}, sessionId) =>
    new Promise((resolve, reject) => {
      id += 1
      pending.set(id, { resolve, reject })
      ws.send(JSON.stringify({ id, method, params, sessionId }))
    })
}

try {
  const ws = await connect(await endpoint())
  const send = makeSend(ws)
  const pageLogs = []
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data)
    if (msg.method === 'Runtime.consoleAPICalled') {
      const text = (msg.params.args ?? [])
        .map((a) => a.value ?? a.description ?? a.type)
        .join(' ')
      pageLogs.push(`[${msg.params.type}] ${text}`)
    }
    if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params.exceptionDetails
      pageLogs.push(`[exception] ${d.exception?.description ?? d.text}`)
    }
  })

  // Attach to a fresh tab and drive it.
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' })
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true })

  await send('Page.enable', {}, sessionId)
  await send('Runtime.enable', {}, sessionId)

  // Land on the origin first so localStorage can be cleared, then navigate for
  // real. Without this, a persisted selection from a previous run (e.g. a task
  // detail panel left open) makes clicks behave as toggles and the checks lie.
  const origin = new URL(URL_ARG).origin
  await send('Page.navigate', { url: origin }, sessionId)
  await sleep(700)
  await send(
    'Runtime.evaluate',
    { expression: 'try { localStorage.clear() } catch (e) {}' },
    sessionId,
  )

  const loaded = new Promise((resolve) => {
    const handler = (ev) => {
      const msg = JSON.parse(ev.data)
      if (msg.method === 'Page.loadEventFired' && msg.sessionId === sessionId) resolve()
    }
    ws.addEventListener('message', handler)
  })

  await send('Page.navigate', { url: URL_ARG }, sessionId)
  await loaded
  // Let React mount and any timers settle.
  await sleep(1800)

  /**
   * The interface ships in Chinese, but the checks assert on specific labels, so
   * pin it to English first — by clicking the real header control rather than
   * reaching into the store, because `window.__EF` is deliberately dev-only and
   * is absent from the production bundle the checks run against.
   */
  const clickLangButton = `(() => {
    const btn = [...document.querySelectorAll('.topbar .btn')]
      .find(b => /^(EN|中文)$/.test(b.textContent.trim()));
    if (btn) { btn.click(); return true }
    return false
  })()`

  await send('Runtime.evaluate', { expression: clickLangButton }, sessionId)
  await sleep(800)
  // If that switched us to Chinese, click again to come back to English.
  await send(
    'Runtime.evaluate',
    {
      expression: `(() => {
        const first = document.querySelector('.topbar .tab')?.textContent.trim();
        if (first && first !== 'Projects') {
          ${clickLangButton}
        }
        return document.querySelector('.topbar .tab')?.textContent.trim()
      })()`,
    },
    sessionId,
  )
  await sleep(800)

  const result = await send(
    'Runtime.evaluate',
    { expression: EXPR, returnByValue: true, awaitPromise: true },
    sessionId,
  )

  // Optional screenshot, taken AFTER the script has run. This exists because some
  // states can only be reached by driving the app (selecting a walkthrough script,
  // entering an invalid value), so a `--screenshot` flag on the browser alone
  // would capture the wrong state.
  const shotIndex = process.argv.indexOf('--screenshot')
  if (shotIndex !== -1 && process.argv[shotIndex + 1]) {
    // Let React commit and any highlight animation settle.
    await sleep(1200)
    const shot = await send(
      'Page.captureScreenshot',
      { format: 'png', captureBeyondViewport: false },
      sessionId,
    )
    if (shot?.data) {
      writeFileSync(process.argv[shotIndex + 1], Buffer.from(shot.data, 'base64'))
      console.error(`SCREENSHOT: ${process.argv[shotIndex + 1]}`)
    } else {
      console.error('SCREENSHOT FAILED: no data returned')
    }
  }

  // Surface any page-level failure, otherwise a blank board just looks like a
  // feature that "did not work".
  const diag = await send(
    'Runtime.evaluate',
    {
      expression: `JSON.stringify({
        rootChildren: document.getElementById('root')?.children.length ?? -1,
        bodyTextHead: document.body.innerText.slice(0, 200),
        cards: document.querySelectorAll('.task-card').length,
        projectCards: document.querySelectorAll('.project-card').length,
        tabs: [...document.querySelectorAll('.tab')].map(t => t.textContent),
      })`,
      returnByValue: true,
    },
    sessionId,
  )
  console.error('PAGE DIAGNOSTICS:', diag.result?.value)
  if (pageLogs.length > 0) {
    console.error('PAGE LOGS:')
    for (const line of pageLogs.slice(0, 20)) console.error('  ' + line)
  }

  if (result.exceptionDetails) {
    console.log(
      JSON.stringify(
        { ok: false, error: result.exceptionDetails.exception?.description ?? 'evaluation failed' },
        null,
        2,
      ),
    )
    process.exitCode = 1
  } else {
    const value = result.result?.value
    console.log(typeof value === 'string' ? value : JSON.stringify(value, null, 2))
  }

  ws.close()
} catch (err) {
  console.log(JSON.stringify({ ok: false, error: String(err.message ?? err) }, null, 2))
  process.exitCode = 1
} finally {
  child.kill()
}
