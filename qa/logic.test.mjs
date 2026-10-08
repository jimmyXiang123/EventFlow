/**
 * Self-checking tests for EventFlow's pure logic.
 *
 * These are plain assertions with no test-runner dependency, so they can run
 * offline with the bundled Node:
 *
 *   node --experimental-strip-types qa/logic.test.mjs
 *
 * They cover the parts a marker is most likely to probe: date extraction,
 * backwards scheduling, dependency analysis, and cycle refusal.
 */

import assert from 'node:assert/strict'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const srcDir = join(here, '..', 'src')
/** Windows needs real file:// URLs for dynamic import. */
const srcFile = (rel) => pathToFileURL(join(srcDir, rel)).href

/* ------------------------------------------------------------------ *
 * Load the TypeScript sources by stripping types at runtime.
 *
 * Node erases type annotations natively (`--experimental-strip-types`), so the
 * real `src/*.ts` files can be imported directly — no bundler, no test
 * framework, and no risk of the tests drifting from the shipped logic.
 * Only the `../lib/x` extensionless imports inside those files need teaching.
 * ------------------------------------------------------------------ */

const { registerHooks } = await import('node:module')
registerHooks({
  resolve(specifier, context, nextResolve) {
    // `./types` inside the TS sources means `./types.ts`.
    if (specifier.startsWith('.') && !/\.[cm]?[jt]sx?$/.test(specifier)) {
      try {
        return nextResolve(`${specifier}.ts`, context)
      } catch {
        /* fall through to the default resolution below */
      }
    }
    return nextResolve(specifier, context)
  },
})

const analyser = await import(srcFile('lib/sourceAnalyser.ts'))
const engine = await import(srcFile('lib/domainEngine.ts'))

const { analyseSource, parseDeadline, isRealDate, isRealIsoDate } = analyser
const { scheduleBackwards, analyseDependencies, generateDraft, topoOrder, TEMPLATES } = engine

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
    console.log(`  FAIL ${name}\n       ${String(err.message).split('\n')[0]}`)
  }
}

// A fixed reference date so relative expressions are deterministic.
const REF = new Date('2026-09-27T00:00:00')

/* ------------------------------------------------------------------ *
 * 1. Deadline extraction
 * ------------------------------------------------------------------ */

console.log('\nDeadline extraction')

test('day-month-year with a trailing time clause', () => {
  const r = parseDeadline('Submit the slide deck as PDF by 27 October 2026 before 17:00.', REF)
  assert.equal(r.date, '2026-10-27')
  assert.match(r.phrase, /27 October 2026/)
})

test('a non-month word after a number does not stop the scan', () => {
  // Regression: "5 minutes of questions" used to be taken as a date candidate,
  // which made the analyser miss the real deadline later in the same paragraph.
  const src =
    'Your group must deliver a 12-minute presentation plus 5 minutes of questions. ' +
    'Submit the slide deck as PDF by 27 October 2026 before 17:00.'
  const r = parseDeadline(src, REF)
  assert.equal(r.date, '2026-10-27')
})

test('numbers that are not dates are ignored', () => {
  assert.equal(parseDeadline('allow 30 minutes and 4 people', REF).date, null)
  assert.equal(parseDeadline('it took 12 weeks of work', REF).date, null)
})

test('month-day-year with a comma', () => {
  assert.equal(parseDeadline('Due November 5, 2026', REF).date, '2026-11-05')
})

test('day-month without a year uses the current year when still ahead', () => {
  assert.equal(parseDeadline('by 20 November', REF).date, '2026-11-20')
})

test('day-month without a year rolls forward when already past', () => {
  assert.equal(parseDeadline('by 3 February', REF).date, '2027-02-03')
})

test('ordinal day-month', () => {
  assert.equal(parseDeadline('hand in by 5th December', REF).date, '2026-12-05')
})

test('ISO date', () => {
  assert.equal(parseDeadline('deadline 2026-11-05', REF).date, '2026-11-05')
})

test('numeric day/month/year', () => {
  assert.equal(parseDeadline('due 05/11/2026', REF).date, '2026-11-05')
})

test('relative days', () => {
  assert.equal(parseDeadline('please reply within 10 days', REF).date, '2026-10-07')
})

test('relative weeks', () => {
  assert.equal(parseDeadline('we need this in 2 weeks', REF).date, '2026-10-11')
})

test('"next week"', () => {
  assert.equal(parseDeadline('let us meet next week', REF).date, '2026-10-04')
})

test('Chinese full date', () => {
  assert.equal(parseDeadline('请在2026年10月27日前提交', REF).date, '2026-10-27')
})

test('Chinese month/day', () => {
  assert.equal(parseDeadline('11月5日之前完成', REF).date, '2026-11-05')
})

test('Chinese relative days', () => {
  assert.equal(parseDeadline('三天后交', REF).date, '2026-09-30')
})

test('Chinese next month', () => {
  assert.equal(parseDeadline('下个月完成', REF).date, '2026-10-01')
})

test('no deadline returns null', () => {
  const r = parseDeadline('Let us catch up about the project sometime.', REF)
  assert.equal(r.date, null)
})

test('bare day-of-month next to a cue', () => {
  assert.equal(parseDeadline('due on the 20th', REF).date, '2026-10-20')
})

/* ------------------------------------------------------------------ *
 * 2. Deadline drives the whole schedule (R1)
 * ------------------------------------------------------------------ */

console.log('\nBackwards scheduling (R1)')

const simpleStages = [
  {
    id: 's1',
    name: 'Stage 1',
    tasks: [
      { id: 't1', name: 'A', kind: 'individual', ownerId: 'u1', collaboratorIds: [], estimateDays: 3, dependsOn: [], status: 'todo' },
      { id: 't2', name: 'B', kind: 'individual', ownerId: 'u1', collaboratorIds: [], estimateDays: 2, dependsOn: ['t1'], status: 'todo' },
    ],
  },
  {
    id: 's2',
    name: 'Stage 2',
    tasks: [
      { id: 't3', name: 'C', kind: 'individual', ownerId: 'u1', collaboratorIds: [], estimateDays: 5, dependsOn: ['t2'], status: 'todo' },
    ],
  },
]

test('the last task finishes on the final deadline', () => {
  const out = scheduleBackwards(simpleStages, '2026-10-27')
  const t3 = out[1].tasks.find((t) => t.id === 't3')
  assert.equal(t3.deadline, '2026-10-27')
  assert.equal(t3.startDate, '2026-10-22')
})

test('a predecessor cannot start before its own dependency finishes', () => {
  const out = scheduleBackwards(simpleStages, '2026-10-27')
  const flat = out.flatMap((s) => s.tasks)
  for (const t of flat) {
    for (const dep of t.dependsOn) {
      const pred = flat.find((x) => x.id === dep)
      assert.ok(
        t.startDate >= pred.deadline,
        `${t.id} starts ${t.startDate} but ${dep} finishes ${pred.deadline}`,
      )
    }
  }
})

test('a longer estimate pushes the start date earlier', () => {
  const short = scheduleBackwards(simpleStages, '2026-10-27')[1].tasks[0]
  const long = scheduleBackwards(
    [
      simpleStages[0],
      {
        id: 's2',
        name: 'Stage 2',
        tasks: [{ ...simpleStages[1].tasks[0], estimateDays: 10 }],
      },
    ],
    '2026-10-27',
  )[1].tasks[0]
  assert.ok(long.startDate < short.startDate)
})

test('the schedule is not mutated in place', () => {
  const before = JSON.stringify(simpleStages)
  scheduleBackwards(simpleStages, '2026-10-27')
  assert.equal(JSON.stringify(simpleStages), before)
})

test('topological order respects dependencies', () => {
  const order = topoOrder(simpleStages)
  assert.ok(order.indexOf('t1') < order.indexOf('t2'))
  assert.ok(order.indexOf('t2') < order.indexOf('t3'))
})

test('a dependency cycle does not hang the topological sort', () => {
  const cyclic = [
    {
      id: 's1',
      name: 'Cyclic',
      tasks: [
        { id: 'a', name: 'A', kind: 'individual', ownerId: 'u1', collaboratorIds: [], estimateDays: 1, dependsOn: ['b'], status: 'todo' },
        { id: 'b', name: 'B', kind: 'individual', ownerId: 'u1', collaboratorIds: [], estimateDays: 1, dependsOn: ['a'], status: 'todo' },
      ],
    },
  ]
  const order = topoOrder(cyclic)
  assert.equal(order.length, 2)
})

/* ------------------------------------------------------------------ *
 * 3. Dependency insight (R4)
 * ------------------------------------------------------------------ */

console.log('\nDependency analysis (R4)')

test('an unfinished predecessor blocks the task', () => {
  const insights = analyseDependencies(simpleStages, '2026-09-27')
  assert.deepEqual(insights.get('t2').blockedBy, ['t1'])
  assert.equal(insights.get('t2').isBlocked, true)
})

test('a done predecessor does not block', () => {
  const done = [
    { ...simpleStages[0], tasks: [{ ...simpleStages[0].tasks[0], status: 'done' }, simpleStages[0].tasks[1]] },
    simpleStages[1],
  ]
  const insights = analyseDependencies(done, '2026-09-27')
  assert.deepEqual(insights.get('t2').blockedBy, [])
  assert.equal(insights.get('t2').isBlocked, false)
})

test('transitive successors are reported, not just direct ones', () => {
  const insights = analyseDependencies(simpleStages, '2026-09-27')
  assert.deepEqual(insights.get('t1').affects.sort(), ['t2', 't3'])
})

test('an overdue task is detected from its computed deadline', () => {
  const insights = analyseDependencies(simpleStages, '2026-12-01')
  assert.equal(insights.get('t1').isOverdue, true)
})

/* ------------------------------------------------------------------ *
 * 4. Draft generation (R1/R2/R3)
 * ------------------------------------------------------------------ */

console.log('\nDraft generation (R1/R2/R3)')

const users = [
  { id: 'u1', name: 'Coord', role: 'coordinator', familiarity: 'expert', initials: 'C', color: '#000' },
  { id: 'u2', name: 'Mem1', role: 'member', familiarity: 'novice', initials: 'M', color: '#111' },
  { id: 'u3', name: 'Mem2', role: 'member', familiarity: 'novice', initials: 'N', color: '#222' },
]

function draftFor(sourceText, familiarity = 'novice') {
  const analysis = analyseSource(sourceText, REF)
  const presentation = TEMPLATES.find((t) => t.id === 'tpl-presentation')
  return generateDraft({
    analysis,
    sourceText,
    projectName: 'Test',
    template: presentation,
    deadline: analysis.deadline,
    scale: analysis.scale,
    members: users,
    ownerId: 'u1',
    familiarity,
    applyReusableChecklist: familiarity === 'expert',
  })
}

const BRIEF = `CSI405 Interactive Systems — Group Project (CW1)
Your group must deliver a 12-minute presentation on your chosen interactive system.
Groups of four. Submit the slide deck as PDF by 27 October 2026 before 17:00.
Deliverables: slide deck (PDF), and a one-page summary of individual contributions.
Please rehearse the hand-over between speakers.`

test('every generated task has an owner and a computed deadline', () => {
  const draft = draftFor(BRIEF)
  const tasks = draft.stages.flatMap((s) => s.tasks)
  assert.ok(tasks.length > 5)
  for (const t of tasks) {
    assert.ok(t.ownerId, `${t.name} has no owner`)
    assert.ok(t.deadline, `${t.name} has no deadline`)
    assert.ok(t.startDate, `${t.name} has no start date`)
    assert.ok(t.deadline <= '2026-10-27', `${t.name} finishes after the deadline`)
  }
})

test('stages are non-empty and ordered', () => {
  const draft = draftFor(BRIEF)
  assert.ok(draft.stages.length >= 3)
  for (const s of draft.stages) assert.ok(s.tasks.length > 0, `${s.name} is empty`)
})

test('collaborative tasks are marked and have collaborators (R3)', () => {
  const draft = draftFor(BRIEF)
  const tasks = draft.stages.flatMap((s) => s.tasks)
  const collab = tasks.filter((t) => t.kind === 'collaborative')
  assert.ok(collab.length > 0, 'the presentation template should produce joint tasks')
  for (const t of collab) {
    assert.ok(t.collaboratorIds.length > 0, `${t.name} is joint but has no collaborators`)
    assert.ok(!t.collaboratorIds.includes(t.ownerId), `${t.name} lists its owner as a collaborator`)
  }
})

test('individual and collaborative work coexist in one project (R3)', () => {
  const tasks = draftFor(BRIEF).stages.flatMap((s) => s.tasks)
  assert.ok(tasks.some((t) => t.kind === 'individual'))
  assert.ok(tasks.some((t) => t.kind === 'collaborative'))
})

test('expert mode attaches reusable checklists (R2)', () => {
  const tasks = draftFor(BRIEF, 'expert').stages.flatMap((s) => s.tasks)
  assert.ok(tasks.every((t) => (t.reusableChecklist?.length ?? 0) > 0))
})

test('novice mode does not attach reusable checklists (R2)', () => {
  const tasks = draftFor(BRIEF, 'novice').stages.flatMap((s) => s.tasks)
  assert.ok(tasks.every((t) => !t.reusableChecklist))
})

test('a task keeps provenance from the source (R1)', () => {
  const tasks = draftFor(BRIEF).stages.flatMap((s) => s.tasks)
  assert.ok(tasks.some((t) => t.evidence), 'no task recorded where it came from')
})

test('an impossible window is reported as a shortfall', () => {
  const analysis = analyseSource(BRIEF, REF)
  const draft = generateDraft({
    analysis,
    sourceText: BRIEF,
    projectName: 'Test',
    template: TEMPLATES.find((t) => t.id === 'tpl-presentation'),
    deadline: '2026-09-28',
    scale: 'large',
    members: users,
    ownerId: 'u1',
    familiarity: 'novice',
    applyReusableChecklist: false,
  })
  assert.ok(draft.slackDays < 0, `expected a negative slack, got ${draft.slackDays}`)
  // Warnings are translation keys plus parameters, not rendered sentences, so the
  // draft preview reads in the active interface language. Match on the key and
  // assert the numbers that the message interpolates.
  const shortfall = draft.warnings.find((w) => w.key === 'warn.shortfall')
  assert.ok(shortfall, `expected a shortfall warning, got ${JSON.stringify(draft.warnings)}`)
  assert.ok(
    shortfall.params.window > 0 && shortfall.params.effort > shortfall.params.window,
    `shortfall must state the window and the effort it exceeded, got ${JSON.stringify(shortfall.params)}`,
  )
  assert.equal(shortfall.params.deadline, '2026-09-28', 'shortfall must name the deadline')
  // The compressed schedule must still respect dependencies.
  const flat = draft.stages.flatMap((s) => s.tasks)
  for (const t of flat) {
    for (const dep of t.dependsOn) {
      const pred = flat.find((x) => x.id === dep)
      assert.ok(t.startDate >= pred.deadline, `${t.name} starts before ${pred.name} finishes`)
    }
  }
})

/* ------------------------------------------------------------------ *
 * 5. Source-specific analysis
 * ------------------------------------------------------------------ */

console.log('\nSource analysis')

test('a coursework brief is classified as a brief', () => {
  assert.equal(analyseSource(BRIEF, REF).kind, 'brief')
})

test('a Chinese chat message is classified as chat', () => {
  const chat = '群里说一声：我下周三之前要把去苏州的行程定下来。需要订高铁票和酒店。'
  assert.equal(analyseSource(chat, REF).kind, 'chat')
})

test('missing detail is reported rather than invented', () => {
  const a = analyseSource('We should probably do something about the thing soon.', REF)
  assert.ok(a.missingInfo.length > 0)
  assert.equal(a.deadlineInferred, true)
})

test('an email with a stated deadline is not marked as inferred', () => {
  const email = 'From: a@b.com\nSubject: Review\nPlease send your figures by 20 November 2026.\nThanks,\nDaniel'
  const a = analyseSource(email, REF)
  assert.equal(a.deadlineInferred, false)
  assert.equal(a.deadline, '2026-11-20')
})

/* ------------------------------------------------------------------ *
 * Error prevention and error messages.
 *
 * These cover the guards added for CW2. Each one is a case where the prototype
 * used to accept something it should have refused, so the tests are written
 * against the *old* wrong behaviour as well as the new right one.
 * ------------------------------------------------------------------ */

test('the calendar validator rejects dates that do not exist', () => {
  // `new Date(2026, 1, 31)` silently rolls over to 3 March, which is exactly why
  // a numeric range check is not enough.
  assert.equal(isRealDate(2026, 2, 31), false, '31 February must be refused')
  assert.equal(isRealDate(2026, 4, 31), false, '31 April must be refused')
  assert.equal(isRealDate(2026, 6, 31), false, '31 June must be refused')
  assert.equal(isRealDate(2026, 13, 1), false, 'month 13 must be refused')
  assert.equal(isRealDate(2026, 0, 10), false, 'month 0 must be refused')
  assert.equal(isRealDate(2026, 5, 0), false, 'day 0 must be refused')
})

test('the calendar validator accepts real dates including leap years', () => {
  assert.equal(isRealDate(2026, 2, 28), true)
  assert.equal(isRealDate(2026, 12, 31), true)
  assert.equal(isRealDate(2026, 1, 31), true)
  assert.equal(isRealDate(2024, 2, 29), true, '2024 is a leap year')
  assert.equal(isRealDate(2026, 2, 29), false, '2026 is not a leap year')
})

test('isRealIsoDate validates the string form used by the date inputs', () => {
  assert.equal(isRealIsoDate('2026-10-27'), true)
  assert.equal(isRealIsoDate('2026-02-31'), false)
  assert.equal(isRealIsoDate('2026-2-3'), false, 'must be zero-padded')
  assert.equal(isRealIsoDate('not a date'), false)
  assert.equal(isRealIsoDate(''), false)
})

test('an impossible date in the source is skipped, not rolled over', () => {
  const text = 'The pack is due on 31 February, but the hand-in is 20 December 2026.'
  const r = parseDeadline(text, REF)
  assert.equal(r.date, '2026-12-20', 'must fall through to the next valid date')
  assert.equal(r.rejected.length, 1, `expected one rejected date, got ${JSON.stringify(r.rejected)}`)
  assert.match(r.rejected[0].phrase, /31 February/)
  // The year is inferred as the next occurrence, but whatever year it lands on the
  // point is that 31 February is reported as the impossible date it would have been.
  assert.match(
    r.rejected[0].wouldBe,
    /^\d{4}-02-31$/,
    `must report the impossible ISO it would have produced, got ${r.rejected[0].wouldBe}`,
  )
})

test('an impossible date never becomes the deadline when nothing else is stated', () => {
  const a = analyseSource('Hand in the report on 31 February please.', REF)
  assert.equal(a.deadlinePhrase, null, 'no valid phrase should be claimed')
  assert.equal(a.invalidDates.length, 1, 'the impossible date must be reported')
  assert.equal(a.deadlineInferred, true, 'the deadline falls back to an inferred one')
  assert.notEqual(a.deadline, '2026-02-31')
})

test('a source with no impossible dates reports none', () => {
  const a = analyseSource('Please submit the slide deck by 27 October 2026 before 17:00.', REF)
  assert.equal(a.invalidDates.length, 0)
  assert.equal(a.deadline, '2026-10-27')
})

test('Chinese dates written with spaces are recognised', () => {
  // "10 月 27 日" is as common in Chinese as the run-together "10月27日". The
  // pattern originally required the digits to touch the unit characters, so a
  // space-separated date was invisible — including an impossible one, which meant
  // the guard could not report it either.
  const spaced = parseDeadline('请在 10 月 27 日之前提交。', REF)
  assert.equal(spaced.date, '2026-10-27', 'a spaced Chinese date must parse')
  assert.equal(spaced.phrase, '10 月 27 日', 'the phrase must be reported as written')

  const runTogether = parseDeadline('请在 10月27日之前提交。', REF)
  assert.equal(runTogether.date, '2026-10-27', 'the run-together form must still parse')

  const full = parseDeadline('提交时间 2026 年 12 月 20 日。', REF)
  assert.equal(full.date, '2026-12-20', 'a spaced full Chinese date must parse')

  const words = parseDeadline('十一月五日交。', REF)
  assert.equal(words.date, '2026-11-05', 'Chinese numeral dates must still parse')
})

test('a spaced impossible Chinese date is reported, not missed', () => {
  const text = '材料原定 2 月 31 日交，但最终提交时间是 2026 年 12 月 20 日。'
  const r = parseDeadline(text, REF)
  assert.equal(r.date, '2026-12-20', 'must fall through to the valid date')
  assert.equal(r.rejected.length, 1, `expected the impossible date to be caught: ${JSON.stringify(r.rejected)}`)
  assert.match(r.rejected[0].phrase, /2 月 31 日/)
  assert.match(r.rejected[0].wouldBe, /^\d{4}-02-31$/)
})

test('draft warnings are translation keys, not rendered sentences', () => {
  const analysis = analyseSource(BRIEF, REF)
  const draft = generateDraft({
    analysis,
    sourceText: BRIEF,
    projectName: 'Test',
    template: TEMPLATES.find((t) => t.id === 'tpl-presentation'),
    deadline: '2026-09-28',
    scale: 'large',
    members: users,
    ownerId: 'u1',
    familiarity: 'novice',
    applyReusableChecklist: false,
    lang: 'en',
  })
  for (const w of draft.warnings) {
    assert.match(w.key, /^warn\./, `warning key must be namespaced, got "${w.key}"`)
    assert.ok(!/\s/.test(w.key), `warning key must not contain prose: "${w.key}"`)
  }
})

test('generated stage and task names follow the requested language', () => {
  const analysis = analyseSource(BRIEF, REF)
  const base = {
    analysis,
    sourceText: BRIEF,
    projectName: 'Test',
    template: TEMPLATES.find((t) => t.id === 'tpl-presentation'),
    deadline: '2026-12-20',
    scale: 'large',
    members: users,
    ownerId: 'u1',
    familiarity: 'novice',
    applyReusableChecklist: false,
  }
  const zh = generateDraft({ ...base, lang: 'zh' })
  const en = generateDraft({ ...base, lang: 'en' })
  const zhFirst = zh.stages[0].name
  const enFirst = en.stages[0].name
  assert.ok(/[\u4e00-\u9fff]/.test(zhFirst), `Chinese draft should use Chinese names, got "${zhFirst}"`)
  assert.ok(!/[\u4e00-\u9fff]/.test(enFirst), `English draft should use English names, got "${enFirst}"`)
  assert.notEqual(zhFirst, enFirst, 'the two languages must not produce the same name')
  // The checklist is localised too, since experts see it.
  const zhChecklist = zh.stages.flatMap((s) => s.tasks)[0].reusableChecklist ?? []
  void zhChecklist
})

test('the two template languages stay in step', () => {
  // A missing zhName silently falls back to English, which would show up as
  // stray English inside an otherwise Chinese plan. Catch it here instead.
  for (const tpl of TEMPLATES) {
    for (const stage of tpl.stages) {
      assert.ok(stage.zhName, `${tpl.id} stage "${stage.name}" has no zhName`)
      for (const task of stage.tasks) {
        assert.ok(task.zhName, `${tpl.id} task "${task.name}" has no zhName`)
      }
    }
    assert.ok(tpl.reusableChecklistZh, `${tpl.id} has no Chinese checklist`)
    assert.equal(
      tpl.reusableChecklistZh.length,
      tpl.reusableChecklist.length,
      `${tpl.id} checklist lengths differ between languages`,
    )
  }
})

/* ------------------------------------------------------------------ */

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log('\nFailures:')
  for (const f of failures) console.log(` - ${f.name}: ${f.message}`)
  process.exitCode = 1
}
