/**
 * Runs the browser-based UI checks and exits non-zero if any of them fail.
 *
 * Every check script returns `{ checks, problems }`. A non-empty `problems`
 * array is a failure. This runner also starts the dev server if port 5199 is
 * not already serving, so `pnpm check:ui` works from a cold start.
 *
 *   node qa/run-ui-checks.mjs
 */
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const BASE = 'http://localhost:5199'

const CHECKS = [
  { name: 'board interactions (R2/R3/R4)', file: 'check-board.js', view: 'board' },
  { name: 'calendar + dependency map (R1/R4)', file: 'check-calendar.js', view: 'board' },
  { name: 'source-to-draft (R1)', file: 'check-draft.js', view: 'draft' },
  { name: 'bilingual interface', file: 'check-i18n.js', view: 'board' },
  { name: 'error prevention and error messages', file: 'check-guards.js', view: 'board' },
]

async function reachable(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(2500) })
    return res.ok
  } catch {
    return false
  }
}

let server = null

async function ensureServer() {
  if (await reachable(BASE)) {
    console.log(`dev server already running at ${BASE}`)
    return
  }
  console.log('starting dev server…')
  server = spawn(process.execPath, [join(root, 'node_modules', 'vite', 'bin', 'vite.js')], {
    cwd: root,
    stdio: 'ignore',
  })
  for (let i = 0; i < 60; i += 1) {
    await sleep(500)
    if (await reachable(BASE)) {
      console.log(`dev server ready at ${BASE}`)
      return
    }
  }
  throw new Error(`dev server did not become ready at ${BASE}`)
}

function runCheck({ file, view }) {
  return new Promise((resolve) => {
    const child = spawn(
      process.execPath,
      [join(here, 'cdp.mjs'), `${BASE}/?view=${view}`, '--file', join(here, file)],
      { cwd: root },
    )
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (d) => {
      stdout += d
    })
    child.stderr.on('data', (d) => {
      stderr += d
    })
    child.on('close', () => resolve({ stdout, stderr }))
  })
}

let failed = 0

try {
  await ensureServer()

  for (const check of CHECKS) {
    console.log(`\n=== ${check.name} — ${check.file} ===`)
    const { stdout, stderr } = await runCheck(check)

    let parsed = null
    try {
      parsed = JSON.parse(stdout)
    } catch {
      console.log('  could not parse check output:')
      console.log(stdout.trim() || '(empty)')
      if (stderr.trim()) console.log(stderr.trim())
      failed += 1
      continue
    }

    const problems = parsed.problems ?? []
    if (problems.length === 0) {
      console.log('  PASS')
    } else {
      failed += 1
      console.log(`  FAIL — ${problems.length} problem(s):`)
      for (const p of problems) console.log(`   - ${p}`)
    }

    // Print the measured values; useful evidence in the report.
    for (const [key, value] of Object.entries(parsed.checks ?? parsed)) {
      if (key === 'problems' || key === 'checks') continue
      console.log(`  ${key}: ${JSON.stringify(value)}`)
    }
  }
} catch (err) {
  console.error(`\nrunner error: ${err.message}`)
  failed += 1
} finally {
  if (server) server.kill()
}

console.log(failed === 0 ? '\nAll UI checks passed.' : `\n${failed} check group(s) failed.`)
process.exitCode = failed === 0 ? 0 : 1
