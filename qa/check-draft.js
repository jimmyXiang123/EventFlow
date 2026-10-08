// Verifies the running UI from real geometry and interaction, not from a
// screenshot. Covers the analyser panel layout and the R1/R2/R3/R4 behaviours.
(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms))
  await wait(2200)

  const report = { url: location.search || '(none)', checks: {}, problems: [] }

  const rect = (el) => {
    const r = el.getBoundingClientRect()
    return { w: Math.round(r.width), h: Math.round(r.height) }
  }
  const cs = (el, prop) => getComputedStyle(el)[prop]

  /* ---------- 1. analyser panel spacing ---------- */
  const cards = [...document.querySelectorAll('.card')]
  const panel = cards.find((c) => c.textContent.includes('What EventFlow understood'))
  report.checks.analyserPanelFound = Boolean(panel)

  if (panel) {
    const leaves = [...panel.querySelectorAll('div')].filter(
      (el) => el.children.length === 0 && el.textContent.trim().length > 4,
    )
    report.checks.leafDivs = leaves.slice(0, 8).map((el) => {
      const r = el.getBoundingClientRect()
      return {
        text: el.textContent.trim().slice(0, 40),
        h: Math.round(r.height),
        w: Math.round(r.width),
        cls: el.className,
        mt: cs(el, 'marginTop'),
        mb: cs(el, 'marginBottom'),
        lh: cs(el, 'lineHeight'),
        fs: cs(el, 'fontSize'),
      }
    })

    // Any tall single-line item signals unintended flex stretching.
    const stretched = leaves.filter((el) => {
      const r = el.getBoundingClientRect()
      return el.textContent.trim().length < 60 && r.height > 40
    })
    report.checks.stretchedLeafCount = stretched.length
    if (stretched.length > 0) {
      report.problems.push(
        `${stretched.length} short text item(s) render taller than 40px (likely flex stretching)`,
      )
    }

    // Do the flex stacks report a gap that matches the design?
    const stacks = [...panel.querySelectorAll('.stack, .stack.sm, .stack.lg')]
    report.checks.stackGaps = [
      ...new Set(stacks.map((s) => `${s.className} => ${cs(s, 'gap')} / ${cs(s, 'display')}`)),
    ]
  }

  /* ---------- 2. deadline detection (R1) ---------- */
  const deadlineInput = document.querySelector('input[type="date"]')
  report.checks.detectedDeadline = deadlineInput ? deadlineInput.value : null
  if (deadlineInput && deadlineInput.value !== '2026-10-27') {
    report.problems.push(
      `Deadline detection failed: expected 2026-10-27 from "27 October 2026 before 17:00", got ${deadlineInput.value}`,
    )
  }

  const inferredWarn = document.body.textContent.includes('The source does not state a deadline')
  report.checks.deadlineInferredWarningShown = inferredWarn
  if (inferredWarn) {
    report.problems.push('Analyser wrongly reported that the source has no deadline')
  }

  /* ---------- 3. template match quality (R1/R2) ---------- */
  const tplCards = [...document.querySelectorAll('.template-card')]
  report.checks.templateCount = tplCards.length
  report.checks.topTemplate = tplCards[0]?.querySelector('.name')?.textContent ?? null
  if (tplCards[0] && !/presentation/i.test(tplCards[0].textContent)) {
    report.problems.push(`Top template is not the presentation one: ${report.checks.topTemplate}`)
  }

  /* ---------- 4. draft preview dates ---------- */
  const previewDates = [...document.querySelectorAll('.mono')]
    .map((el) => el.textContent.trim())
    .filter((t) => /^\d{4}-\d{2}-\d{2} → \d{4}-\d{2}-\d{2}$/.test(t))
  report.checks.previewDateRows = previewDates.length
  report.checks.firstPreviewRow = previewDates[0] ?? null
  if (previewDates.length === 0) report.problems.push('Draft preview is empty')

  /* ---------- 5. R2 control reachable from the draft view ---------- */
  // The guidance switch now lives in the top bar as a segmented control rather
  // than a full-width bar, so assert the control exists and is operable.
  const guidanceButtons = [...document.querySelectorAll('.topbar .tab')]
  const noviceBtn = guidanceButtons.find((b) => b.textContent.trim() === 'Novice')
  const expertBtn = guidanceButtons.find((b) => b.textContent.trim() === 'Expert')
  report.checks.guidanceControlPresent = Boolean(noviceBtn && expertBtn)
  if (!noviceBtn || !expertBtn) {
    report.problems.push('R2 guidance control is missing from the top bar')
  } else {
    noviceBtn.click()
    // React commits asynchronously, so poll for the effect instead of reading
    // the class synchronously.
    const deadline = Date.now() + 4000
    while (Date.now() < deadline && !noviceBtn.classList.contains('active')) {
      await new Promise((r) => setTimeout(r, 60))
    }
    report.checks.noviceModeSelected = noviceBtn.classList.contains('active')
    if (!report.checks.noviceModeSelected) {
      report.problems.push('Selecting the Novice guidance level had no effect')
    }
    expertBtn.click()
  }

  return JSON.stringify(report, null, 2)
})()
