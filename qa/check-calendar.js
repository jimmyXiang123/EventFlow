// Verifies the month calendar (R1 computed dates, and that bars land on the right
// days) and the dependency map (R4 waiting relationships).
//
// The calendar replaced a horizontal Gantt chart. The Gantt's bars were positioned
// by percentage along a single axis, which is easy to test; a calendar bar is
// positioned by week row AND day column, so the checks below verify the actual
// placement rather than just the presence of a bar.
(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms))
  const problems = []
  const checks = {}
  const $ = (s) => document.querySelector(s)
  const $$ = (s) => [...document.querySelectorAll(s)]
  const text = () => document.body.innerText

  const clickTab = (label) => {
    const tab = $$('.tab').find((t) => t.textContent.trim() === label)
    if (!tab) throw new Error(`tab "${label}" not found`)
    tab.click()
  }

  const until = async (fn, ms = 5000) => {
    const end = Date.now() + ms
    while (Date.now() < end) {
      if (fn()) return true
      await wait(70)
    }
    return false
  }

  try {
    await wait(2200)

    /* ---------------- month calendar ---------------- */
    clickTab('Calendar')
    await until(() => $$('.cal-bar').length > 0, 8000)

    checks.calendar = {
      bars: $$('.cal-bar').length,
      dayCells: $$('.cal-day').length,
      weekRows: $$('.cal-row').length,
      weekdays: $$('.cal-dow').map((d) => d.textContent.trim()),
      todayCells: $$('.cal-day.today').length,
      monthHeading: $('.page-head h1')?.textContent.trim(),
    }

    if (checks.calendar.bars === 0) problems.push('Calendar has no task bars')
    if (checks.calendar.dayCells !== 42) {
      problems.push(`Expected 42 day cells in a month grid, found ${checks.calendar.dayCells}`)
    }
    if (checks.calendar.weekRows !== 6) {
      problems.push(`Expected 6 week rows, found ${checks.calendar.weekRows}`)
    }
    if (checks.calendar.weekdays.length !== 7) {
      problems.push(`Expected 7 weekday headers, found ${checks.calendar.weekdays.length}`)
    }
    if (checks.calendar.todayCells !== 1) {
      problems.push(`Expected exactly 1 "today" cell, found ${checks.calendar.todayCells}`)
    }

    /*
     * Placement check. Each bar carries the task's date range in its title, so the
     * expected column can be derived from the first date and compared with where
     * the bar actually sits. Without this the calendar could be drawing every bar
     * in the wrong week and still "have bars".
     */
    const dayCells = $$('.cal-day')
    const gridStartIso = dayCells[0]?.querySelector('.cal-daynum')?.textContent.trim()
    checks.calendar.gridStart = gridStartIso

    const mismatch = []
    for (const bar of $$('.cal-bar')) {
      const title = bar.getAttribute('title') ?? ''
      const m = title.match(/(\d{4}-\d{2}-\d{2}) → (\d{4}-\d{2}-\d{2})/)
      if (!m || !gridStartIso) continue
      const [, start, end] = m
      const startIdx = Math.round(
        (new Date(`${start}T00:00:00`).getTime() -
          new Date(`${gridStartIso}T00:00:00`).getTime()) /
          86400000,
      )
      const endIdx = Math.round(
        (new Date(`${end}T00:00:00`).getTime() -
          new Date(`${gridStartIso}T00:00:00`).getTime()) /
          86400000,
      )
      const week = Math.floor(startIdx / 7)
      const row = bar.closest('.cal-row')
      const rowIndex = $$('.cal-row').indexOf(row)

      // Geometry: compare the bar's centre against the cells it should cover.
      const firstCell = dayCells[week * 7 + (startIdx % 7)]
      const lastCell = dayCells[Math.min(41, week * 7 + (endIdx % 7))]
      if (!firstCell || !lastCell) continue
      const br = bar.getBoundingClientRect()
      const cr = firstCell.getBoundingClientRect()
      const lr = lastCell.getBoundingClientRect()
      const midpoint = (br.left + br.right) / 2
      const expectedMid = (cr.left + lr.right) / 2

      if (rowIndex !== week) {
        mismatch.push(`${title.slice(0, 24)} in week row ${rowIndex}, expected ${week}`)
      } else if (Math.abs(midpoint - expectedMid) > 12) {
        mismatch.push(
          `${title.slice(0, 24)} centred at ${Math.round(midpoint)}, expected ${Math.round(expectedMid)}`,
        )
      }
    }
    checks.calendar.placementMismatches = mismatch.length
    checks.calendar.mismatchSamples = mismatch.slice(0, 3)
    if (mismatch.length > 0) {
      problems.push(`${mismatch.length} calendar bar(s) drawn on the wrong day span`)
    }

    /* ---------------- selecting a bar reveals and updates the task ---------- */
    const bar = $$('.cal-bar')[0]
    const beforeFocused = 0
    bar.click()
    const detailShown = await until(() => Boolean($('[data-guide="calendar-detail"]')), 4000)
    checks.calendar.detailShown = detailShown
    if (!detailShown) problems.push('Selecting a calendar bar did not open the task detail strip')

    const select = $('[data-guide="calendar-detail"] select')
    checks.calendar.hasStatusControl = Boolean(select)
    if (select) {
      const target = [...select.options].find((o) => o.value === 'in_progress')
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(
        select,
        target.value,
      )
      select.dispatchEvent(new Event('change', { bubbles: true }))
      await wait(600)
      // The bar must re-colour, which proves the calendar reads live state.
      checks.calendar.barReclassed = $$('.cal-bar.st-in_progress').length > 0
      if (!checks.calendar.barReclassed) {
        problems.push('Changing status from the calendar did not update any bar')
      }
    }
    void beforeFocused

    /* ---------------- month navigation ---------------- */
    const nextBtn = [...$$('.page-head .btn')].find(
      (b) => b.getAttribute('aria-label') === 'Next month',
    )
    const headingBefore = $('.page-head h1')?.textContent.trim()
    nextBtn?.click()
    await wait(500)
    const headingAfter = $('.page-head h1')?.textContent.trim()
    checks.calendar.monthNavigates = headingBefore !== headingAfter
    if (!checks.calendar.monthNavigates) problems.push('Next-month control did not change the month')

    // Back to the current month so the dependency checks run on a populated grid.
    const prevBtn = [...$$('.page-head .btn')].find(
      (b) => b.getAttribute('aria-label') === 'Previous month',
    )
    prevBtn?.click()
    await wait(500)

    /* ---------------- week mode ---------------- */
    const weekBtn = $$('.page-head .btn').find((b) => /^Week$/.test(b.textContent.trim()))
    weekBtn?.click()
    await wait(500)
    checks.calendar.weekRowsInWeekMode = $$('.cal-row').length
    if (checks.calendar.weekRowsInWeekMode !== 1) {
      problems.push(`Week mode should show 1 row, found ${checks.calendar.weekRowsInWeekMode}`)
    }

    /* ---------------- dependency map ---------------- */
    clickTab('Dependencies')
    await until(() => $$('.flow-node').length > 0, 8000)

    checks.flow = {
      nodes: $$('.flow-node').length,
      edges: $$('.react-flow__edge').length,
      readyPanel: /Ready to start now/.test(text()),
      attribution: /React Flow/.test(text()),
    }
    if (checks.flow.nodes === 0) problems.push('Dependency map has no nodes')
    if (checks.flow.edges === 0) problems.push('Dependency map has no edges')

    /*
     * Clicking a node traces its chain. Pick a node that is connected in BOTH
     * directions: a leaf has no downstream work, so the "if this slips" warning is
     * legitimately absent and asserting it would read as a failure.
     */
    checks.trace = { edgesInGraph: checks.flow.edges }

    const nodes = $$('.flow-node')
    const targetNode =
      nodes.find((n) => /Draft the point of each slide/.test(n.textContent)) ?? nodes[0]
    checks.trace.clicked = targetNode.textContent.slice(0, 40).trim()

    targetNode.click()
    const traced = await until(() => /Traced task/.test(text()))
    checks.trace.tracedPanel = traced

    // Read the *computed* opacity: an inline style of 1 for traced nodes means
    // counting elements that merely have an opacity style would be meaningless.
    const opacityOf = (el) => Number(getComputedStyle(el).opacity)
    const nodesNow = $$('.flow-node')
    checks.trace.totalNodes = nodesNow.length
    checks.trace.dimmed = nodesNow.filter((n) => opacityOf(n) < 0.5).length
    checks.trace.lit = nodesNow.filter((n) => opacityOf(n) >= 0.99).length
    checks.trace.focusedNodeIsLit = nodesNow
      .filter((n) => n.textContent.includes(checks.trace.clicked.slice(0, 12)))
      .every((n) => opacityOf(n) >= 0.99)
    checks.trace.chainExplained =
      /Waiting for|Cannot start yet|move with it|Nothing blocks this task/.test(text())

    if (!traced) problems.push('Clicking a node did not open the traced-task panel')
    if (!checks.trace.focusedNodeIsLit) {
      problems.push('The focused node was dimmed along with the others')
    }
    if (checks.trace.lit < 1) problems.push('Tracing lit up no nodes at all')
    if (checks.trace.dimmed === 0) {
      problems.push('Tracing a connected node did not dim the unrelated nodes')
    }
    if (!checks.trace.chainExplained) {
      problems.push('Traced panel does not explain the dependency chain at all')
    }

    return JSON.stringify({ checks, problems }, null, 2)
  } catch (err) {
    problems.push(`script error: ${String(err && err.message ? err.message : err)}`)
    return JSON.stringify({ checks, problems }, null, 2)
  }
})()
