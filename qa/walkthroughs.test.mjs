/**
 * Verifies the walkthrough scripts as DATA.
 *
 * The scripted walkthrough player used to be a tab in the prototype. It was
 * removed on the group's feedback — the content is the CW2 report's material and
 * is reproduced in full in the user manual, so shipping it in the app as well
 * made the interface busier without adding a capability.
 *
 * The scripts are still kept in `src/domain/walkthroughs.ts` because the report
 * cites them, and the "sequence of interaction" table in the report is generated
 * from them. That means they still have to be correct, and there is no clickable
 * UI left to catch a mistake — so they are checked here instead.
 *
 * Originally this was a browser check (`qa/check-walkthrough.js`) that drove the
 * player and asserted each step highlighted its own real control. The parts of
 * that check that still apply are the invariants below.
 */

import assert from 'node:assert/strict'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const srcDir = join(here, '..', 'src')
const srcFile = (rel) => pathToFileURL(join(srcDir, rel)).href

const { registerHooks } = await import('node:module')
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('.') && !/\.[cm]?[jt]sx?$/.test(specifier)) {
      try {
        return nextResolve(`${specifier}.ts`, context)
      } catch {
        /* fall through */
      }
    }
    return nextResolve(specifier, context)
  },
})

const { WALKTHROUGHS, walkthroughById } = await import(srcFile('domain/walkthroughs.ts'))
const { SCENARIOS, scenarioById } = await import(srcFile('domain/scenarios.ts'))

let passed = 0
let failed = 0
const failures = []

function test(name, fn) {
  try {
    fn()
    passed += 1
    console.log(`  ok   ${name}`)
  } catch (err) {
    failed += 1
    failures.push({ name, message: err.message })
    console.log(`  FAIL ${name}`)
  }
}

console.log('\nwalkthrough scripts (design record cited by the CW2 report)')

test('every script is complete and bilingual', () => {
  assert.ok(WALKTHROUGHS.length >= 3, `expected at least 3 scripts, got ${WALKTHROUGHS.length}`)
  for (const w of WALKTHROUGHS) {
    assert.ok(w.id, 'script has no id')
    assert.ok(w.label.zh && w.label.en, `${w.id} label is not bilingual`)
    assert.ok(w.task.zh && w.task.en, `${w.id} task is not bilingual`)
    assert.ok(w.steps.length > 0, `${w.id} has no steps`)
    for (const s of w.steps) {
      const where = `${w.id} step ${s.n}`
      assert.ok(s.title.zh && s.title.en, `${where} title is not bilingual`)
      assert.ok(s.userAction.zh && s.userAction.en, `${where} userAction is not bilingual`)
      assert.ok(s.systemResponse.zh && s.systemResponse.en, `${where} systemResponse is not bilingual`)
      assert.ok(s.representation.zh && s.representation.en, `${where} representation is not bilingual`)
      assert.ok(s.decision.zh && s.decision.en, `${where} decision is not bilingual`)
    }
  }
})

test('steps are numbered consecutively from 1', () => {
  // The report's interaction-sequence table is generated from these numbers, so a
  // gap or a repeat would silently produce a wrong table in the submission.
  for (const w of WALKTHROUGHS) {
    w.steps.forEach((s, i) => {
      assert.equal(s.n, i + 1, `${w.id}: step at index ${i} is numbered ${s.n}`)
    })
  }
})

test('every step names a view that still exists in the prototype', () => {
  // This is the check that would have caught the calendar rename: the player was
  // deleted, so nothing else would fail if a step pointed at a view that no longer
  // exists — the report would just describe a screen the prototype does not have.
  const liveViews = new Set(['projects', 'draft', 'board', 'calendar', 'flow'])
  for (const w of WALKTHROUGHS) {
    for (const s of w.steps) {
      assert.ok(
        liveViews.has(s.view),
        `${w.id} step ${s.n} targets view "${s.view}", which is not one of ${[...liveViews].join(', ')}`,
      )
    }
  }
})

test('every step targets a real guide anchor in the source', async () => {
  // The anchors are `data-guide="…"` attributes. They are no longer consumed by a
  // player, but they are the link between a written step and the control it talks
  // about, and the manual references them, so a typo would make the documentation
  // point at nothing.
  //
  // The scan walks the WHOLE of src, not just `views`: `guard-storage` lives in
  // App.tsx, so a views-only scan reported it as missing.
  const { readFileSync, readdirSync, statSync } = await import('node:fs')
  const { join: joinPath } = await import('node:path')

  const collect = (dir) => {
    let out = ''
    for (const entry of readdirSync(dir)) {
      const full = joinPath(dir, entry)
      if (statSync(full).isDirectory()) out += collect(full)
      else if (/\.tsx?$/.test(entry)) out += readFileSync(full, 'utf8')
    }
    return out
  }
  const source = collect(srcDir)

  // Anchors are declared two ways: `data-guide="x"` on plain elements, and
  // `guide="x"` on the components that forward it (`Alert`, `StatusSelect`). Both
  // have to be collected, or a component-based anchor reads as missing.
  const anchors = new Set(
    [...source.matchAll(/(?:data-)?guide="([^"]+)"/g)].map((m) => m[1]),
  )
  const missing = []
  for (const w of WALKTHROUGHS) {
    for (const s of w.steps) {
      if (!anchors.has(s.target)) missing.push(`${w.id} step ${s.n} -> "${s.target}"`)
    }
  }
  assert.equal(
    missing.length,
    0,
    `steps point at anchors that no longer exist:\n    ${missing.join('\n    ')}`,
  )
})

test('every script belongs to a scenario that exists', () => {
  for (const w of WALKTHROUGHS) {
    assert.ok(
      scenarioById(w.scenarioId),
      `${w.id} references scenario "${w.scenarioId}", which is not defined`,
    )
  }
})

test('the four CW1 groups are all covered by a script', () => {
  // CW2 asks the prototype to reflect the different user groups, so every group
  // should be reachable from at least one written sequence.
  const covered = new Set(WALKTHROUGHS.map((w) => w.scenarioId))
  const uncovered = SCENARIOS.filter((s) => !covered.has(s.id)).map((s) => s.id)
  assert.equal(
    uncovered.length,
    0,
    `these groups have no walkthrough: ${uncovered.join(', ')}`,
  )
})

test('walkthroughById falls back rather than throwing', () => {
  // The player is gone, but the report generator and the manual still resolve
  // scripts by id, and a bad id must not crash a build.
  assert.ok(walkthroughById(WALKTHROUGHS[0].id))
  assert.ok(walkthroughById('does-not-exist'))
  assert.ok(walkthroughById(null))
})

/* ------------------------------------------------------------------ */

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log('\nFailures:')
  for (const f of failures) console.log(` - ${f.name}: ${f.message}`)
  process.exitCode = 1
}
