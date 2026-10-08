// Confirms the task-card click opens the detail panel, that the panel exposes
// the R4 dependency controls, and that card content is not clipped.
(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms))
  await wait(2000)
  const out = { problems: [] }

  const cardFor = (re) =>
    [...document.querySelectorAll('.task-name')]
      .find((e) => re.test(e.textContent))
      ?.closest('.task-card')

  /** Always re-query: React re-renders replace these nodes, so a stale
   *  reference's click handler would operate on a detached element. */
  const openPanel = () => document.querySelector('.task-detail')
  /** Scoped to the dependency list: the collaborator list is a different
   *  control with a different action, and shares the panel. */
  const boxesNow = () => [
    ...(openPanel()?.querySelectorAll('.dep-list .dep-option input[type=checkbox]') ?? []),
  ]
  const deadlineText = () =>
    [...document.querySelectorAll('.task-foot .mono')].map((e) => e.textContent).join('|')
  const toastText = () =>
    (document.querySelector('.toast')?.textContent ?? '').replace(/×\s*$/, '').trim()
  const statusSelectNow = () =>
    cardFor(/Integrate the sections/)?.querySelector('select')

  /**
   * Wait until a condition holds rather than sleeping a fixed time. A fixed
   * sleep races React's commit: after a store write the DOM may still hold the
   * previous render when the assertion reads it, which reports working features
   * as failures.
   */
  const until = async (predicate, timeoutMs = 5000) => {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      try {
        if (predicate()) return true
      } catch {
        /* element not there yet */
      }
      await wait(60)
    }
    return false
  }

  const waitForToast = (re, timeoutMs = 5000) => until(() => re.test(toastText()), timeoutMs)

  out.detailClosedInitially = !openPanel()

  // 1. Open the panel from a closed state (this is the real user path).
  cardFor(/Build the slides/).click()
  await wait(500)

  const detail = openPanel()
  out.detailOpened = Boolean(detail)
  if (!detail) {
    out.problems.push('Clicking a card did not open the task detail panel')
  } else {
    out.panel = {
      heading: detail.querySelector('.badge')?.textContent ?? null,
      ownerSelect: Boolean(detail.querySelector('select')),
      dependencyCheckboxes: detail.querySelectorAll('.dep-list .dep-option input[type=checkbox]').length,
      collaboratorCheckboxes: detail.querySelectorAll('.check-option input[type=checkbox]').length,
      checkedDependencies: detail.querySelectorAll('.dep-list .dep-option input[type=checkbox]:checked')
        .length,
      hasBlockerField: [...detail.querySelectorAll('.label')].some((l) => /blocker/i.test(l.textContent)),
      explainsWaiting: /Cannot start yet|Waiting for|later task/i.test(detail.textContent),
      showsProvenance: /Where this came from/i.test(detail.textContent),
    }
    if (!out.panel.dependencyCheckboxes) out.problems.push('Detail panel has no dependency checkboxes')
    if (!out.panel.explainsWaiting) out.problems.push('Detail panel does not explain blocking')
    if (!out.panel.hasBlockerField) out.problems.push('Detail panel has no blocker field')
  }

  // 2. Toggle a dependency and confirm the schedule recomputes (R1+R4).
  //    Prefer an unchecked box: toggling a checked one removes the relationship,
  //    which is a different message.
  const allBoxes = boxesNow()
  const targetIndex = allBoxes.findIndex((b) => !b.checked)
  if (targetIndex >= 0) {
    const before = deadlineText()
    const wasChecked = allBoxes[targetIndex].checked
    allBoxes[targetIndex].click()
    const sawFeedback = await waitForToast(/waiting relationship (added|removed)/i)
    const nowChecked = boxesNow()[targetIndex]?.checked
    out.dependencyToggle = {
      wasChecked,
      nowChecked,
      stateChanged: nowChecked !== wasChecked,
      deadlinesChanged: before !== deadlineText(),
      feedbackSeen: sawFeedback,
      toast: toastText(),
    }
    if (nowChecked === wasChecked) out.problems.push('Toggling a dependency did not change its state')
    if (!sawFeedback) out.problems.push('Adding a dependency gave no on-screen feedback')
  } else {
    out.problems.push('No unchecked dependency option available to test')
  }

  // 3. Card geometry: is the status control inside the card, or clipped?
  const target = cardFor(/Integrate the sections/)
  const actions = target?.querySelector('.task-actions')
  out.cardGeometry = target
    ? (() => {
        const cr = target.getBoundingClientRect()
        const ar = actions.getBoundingClientRect()
        const sr = actions.querySelector('select').getBoundingClientRect()
        return {
          cardWidth: Math.round(cr.width),
          selectWidth: Math.round(sr.width),
          overflow: Math.round(ar.right - cr.right),
          selectVisible: sr.width > 0 && sr.right <= cr.right + 1,
        }
      })()
    : null

  if (out.cardGeometry && !out.cardGeometry.selectVisible) {
    out.problems.push(
      `Status control overflows the card by ${out.cardGeometry.overflow}px (card ${out.cardGeometry.cardWidth}px)`,
    )
  }

  // 4. The status control must actually work (R4) — re-query after the rerender.
  const liveStatus = statusSelectNow()
  if (liveStatus) {
    Object.getOwnPropertyDescriptor(
      HTMLSelectElement.prototype,
      'value',
    ).set.call(liveStatus, 'in_progress')
    liveStatus.dispatchEvent(new Event('change', { bubbles: true }))
    const applied = await until(() => statusSelectNow()?.value === 'in_progress')
    out.statusChange = { applied, value: statusSelectNow()?.value }
    if (!applied) out.problems.push('Status change did not apply')
  } else {
    out.problems.push('No status control found for the target task')
  }

  // 5. Simulate a remote member update (R4). The control is an icon button in
  //    the top bar, so find it by its tooltip rather than its label.
  const sim = [...document.querySelectorAll('.topbar .btn')].find((b) =>
    /simulate a teammate/i.test(b.getAttribute('title') ?? ''),
  )
  out.simulateButtonPresent = Boolean(sim)
  if (sim) {
    sim.click()
    const sawSync = await waitForToast(/synced from/i)
    out.simulatedSync = {
      syncSeen: sawSync,
      toast: toastText(),
      flashed: document.querySelectorAll('.task-card.just-synced').length,
    }
    if (!sawSync) out.problems.push('Simulated sync produced no sync confirmation')
  } else {
    out.problems.push('Simulate member update button not found')
  }

  return JSON.stringify(out, null, 2)
})()
