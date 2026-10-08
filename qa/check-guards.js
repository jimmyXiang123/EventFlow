// Verifies every error-prevention and error-message path added for CW2.
//
// The point of these checks is that each guard is exercised through the real
// interface: a source that really contains an impossible date, a deadline that is
// really in the past, a dependency option that really would create a loop, and a
// storage layer that really refuses to write.
(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms))
  const $$ = (s) => [...document.querySelectorAll(s)]
  const $ = (s) => document.querySelector(s)
  const text = () => document.body.innerText

  const until = async (fn, ms = 6000) => {
    const end = Date.now() + ms
    while (Date.now() < end) {
      if (fn()) return true
      await wait(70)
    }
    return false
  }

  const problems = []
  const checks = {}

  const tabByLabel = (label) => $$('.topbar .tab').find((t) => t.textContent.trim() === label)
  const goto = async (label) => {
    const tab = tabByLabel(label)
    if (tab && !tab.classList.contains('active')) {
      tab.click()
      await wait(900)
    }
  }
  const dismissAlerts = async () => {
    for (const b of $$('.alert-close')) b.click()
    await wait(200)
    // The store flag is what drives the banner; clearing storage is the reliable
    // way to reset it between phases.
  }
  const alertWith = (guide) => $(`.alert[data-guide="${guide}"]`)

  try {
    await wait(1200)

    /* ---------- 1. an impossible date in the source ---------- */
    await goto('New from source')
    const input = $('[data-guide="source-input"]')
    checks.sourceInputFound = Boolean(input)
    if (!input) throw new Error('source input not found')

    // React tracks the value on the DOM node, so set through the native setter.
    const setValue = (el, value) => {
      const proto = Object.getPrototypeOf(el)
      const setter = Object.getOwnPropertyDescriptor(proto, 'value').set
      setter.call(el, value)
      el.dispatchEvent(new Event('input', { bubbles: true }))
    }

    setValue(input, 'Schedule note: the review pack is due on 31 February, but the group hand-in is 20 December 2026.')
    await wait(700)

    checks.invalidSourceAlert = Boolean(alertWith('guard-invalid-source-date'))
    if (!checks.invalidSourceAlert) {
      problems.push('An impossible date in the source did not raise an alert')
    } else {
      const t = alertWith('guard-invalid-source-date').innerText
      checks.invalidSourceAlertText = t.slice(0, 120)
      if (!/31 February/.test(t)) problems.push('The alert does not quote the offending date')
      if (!/2027-02-31/.test(t)) problems.push('The alert does not state the impossible date it would have produced')
    }

    // The deadline must fall through to the valid date, not to the impossible one.
    const deadlineInput = $$('input[type="date"]')[0]
    checks.deadlineAfterSkip = deadlineInput?.value
    if (checks.deadlineAfterSkip === '2027-02-31' || /-02-31$/.test(checks.deadlineAfterSkip ?? '')) {
      problems.push('The impossible date was accepted as the deadline')
    }
    if (checks.deadlineAfterSkip !== '2026-12-20') {
      problems.push(`Expected the next valid date as the deadline, got "${checks.deadlineAfterSkip}"`)
    }

    /* ---------- 2. a deadline in the past ---------- */
    setValue(input, 'Please submit the slide deck by 20 December 2026.')
    await wait(600)
    const past = new Date()
    past.setDate(past.getDate() - 14)
    const pastIso = `${past.getFullYear()}-${String(past.getMonth() + 1).padStart(2, '0')}-${String(past.getDate()).padStart(2, '0')}`
    setValue(deadlineInput, pastIso)
    await wait(700)

    checks.pastDeadlineAlert = Boolean(alertWith('guard-deadline-past'))
    if (!checks.pastDeadlineAlert) problems.push('A deadline in the past did not raise an alert')

    /* ---------- 3. the disabled button states its reason ---------- */
    const createBtn = $('[data-guide="create-project"]')
    checks.createDisabled = createBtn?.disabled
    const reason = $('[data-guide="guard-submit-reason"]')
    checks.submitReasonShown = Boolean(reason)
    checks.submitReasonText = (reason?.innerText ?? '').slice(0, 120)
    if (!checks.createDisabled) problems.push('Create button was not disabled with an invalid deadline')
    if (!checks.submitReasonShown) {
      problems.push('The disabled create button does not state why it is unavailable')
    }
    if (createBtn && !createBtn.getAttribute('title')) {
      problems.push('The disabled create button has no hover explanation')
    }

    // A valid future deadline must clear every guard and re-enable the button.
    const future = new Date()
    future.setDate(future.getDate() + 60)
    const futureIso = `${future.getFullYear()}-${String(future.getMonth() + 1).padStart(2, '0')}-${String(future.getDate()).padStart(2, '0')}`
    setValue(deadlineInput, futureIso)
    await wait(700)
    checks.clearedWhenValid = !$('[data-guide="guard-deadline-past"]') && !$('[data-guide="guard-submit-reason"]')
    checks.createEnabledAgain = !$('[data-guide="create-project"]').disabled
    if (!checks.clearedWhenValid) problems.push('Alerts did not clear once the deadline became valid')
    if (!checks.createEnabledAgain) problems.push('Create button stayed disabled with a valid deadline')

    /* ---------- 4. dependency loop prevention ---------- */
    // The Board tab is disabled until a project exists, so create one first —
    // otherwise every later phase silently no-ops and reads as a product failure.
    const create = $('[data-guide="create-project"]')
    if (create?.disabled) {
      problems.push('Could not create a project for the board phases')
    } else {
      create.click()
      await until(() => $$('.task-card').length > 0, 9000)
    }
    await goto('Board')
    await until(() => $$('.task-card').length > 0, 8000)
    checks.boardHasCards = $$('.task-card').length > 0
    if (!checks.boardHasCards) problems.push('The board rendered no task cards')

    // Find a task that has at least one refused option, by walking the cards.
    let found = null
    for (const card of $$('.task-card')) {
      card.click()
      await wait(520)
      if ($('[data-guide="cycle-prevention"]')) {
        found = card
        break
      }
    }
    checks.cyclePreventionFound = Boolean(found)
    if (!found) {
      problems.push('No task offered a disabled dependency option, so loop prevention was not observable')
    } else {
      const disabled = $$('.dep-list .dep-option input:disabled')
      checks.disabledDepCount = disabled.length
      checks.cycleBanner = $('[data-guide="cycle-prevention"]')?.innerText.slice(0, 120)
      if (disabled.length === 0) problems.push('The banner appeared but no option was actually disabled')
      // Every disabled option must explain itself on hover.
      const withoutTitle = disabled.filter(
        (i) => !i.closest('.dep-option')?.getAttribute('title'),
      )
      checks.disabledWithoutReason = withoutTitle.length
      if (withoutTitle.length > 0) {
        problems.push(`${withoutTitle.length} disabled option(s) give no reason on hover`)
      }
      // A disabled checkbox cannot be ticked: that is the prevention working.
      const before = disabled[0].checked
      disabled[0].click()
      await wait(250)
      checks.disabledStaysUnticked = disabled[0].checked === before && before === false
      if (!checks.disabledStaysUnticked) problems.push('A disabled dependency option could still be ticked')
    }

    /*
     * NOTE: this script used to finish by driving the error-prevention walkthrough
     * in the UI. That player was removed from the prototype on the group's
     * feedback — its content is the report's material and is reproduced in the
     * user manual — so the same invariants are now checked as DATA by
     * `qa/walkthroughs.test.mjs`, which asserts that every step still names a view
     * that exists and a guide anchor that is still in the source. Driving a UI
     * that is deliberately gone would be testing the wrong thing.
     */

    /* ---------- 7. a refused save raises a persistent banner ---------- */
    // Runs LAST on purpose. Poisoning storage makes every later mutation raise the
    // banner, and the banner occupies space under the header, so leaving it up
    // while other phases run makes them flaky.
    //
    // The write is made to fail for real rather than simulated: the condition
    // cannot be triggered from the interface, so patching setItem is the only
    // honest way to exercise the path.
    const realSetItem = Storage.prototype.setItem
    Storage.prototype.setItem = function () {
      throw new DOMException('QuotaExceededError', 'QuotaExceededError')
    }
    try {
      // Any mutation goes through commit(), so a status change is enough.
      const select = $('.task-card select')
      if (select) {
        select.value = 'in_progress'
        select.dispatchEvent(new Event('change', { bubbles: true }))
      } else {
        // If the board is not on screen, go back to it and retry once.
        await goto('Board')
        await until(() => $$('.task-card select').length > 0, 5000)
        const sel = $('.task-card select')
        if (sel) {
          sel.value = 'in_progress'
          sel.dispatchEvent(new Event('change', { bubbles: true }))
        }
      }
      await until(() => Boolean(alertWith('guard-storage')), 5000)
      checks.storageBannerShown = Boolean(alertWith('guard-storage'))
      checks.storageBannerText = (alertWith('guard-storage')?.innerText ?? '').slice(0, 160)
      if (!checks.storageBannerShown) {
        problems.push('A refused localStorage write did not raise the storage banner')
      } else {
        const head = alertWith('guard-storage').innerText
        if (!/not being saved|没有被保存/i.test(head)) {
          problems.push('Storage banner does not say that changes are not being saved')
        }
        if (!/How to fix it|怎么处理/i.test(head)) {
          problems.push('Storage banner does not offer a remedy')
        }
      }
      // It must survive a re-render, unlike a toast that disappears.
      const tab = tabByLabel('Calendar')
      tab?.click()
      await wait(1400)
      checks.storageBannerPersists = Boolean(alertWith('guard-storage'))
      if (!checks.storageBannerPersists) {
        problems.push('The storage banner did not persist, so it behaves like a toast')
      }
    } finally {
      Storage.prototype.setItem = realSetItem
    }

    return JSON.stringify({ checks, problems }, null, 2)
  } catch (err) {
    problems.push(`script error: ${String(err && err.message ? err.message : err)}`)
    return JSON.stringify({ checks, problems }, null, 2)
  }
})()
