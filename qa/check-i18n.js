// Verifies the bilingual interface: the language control switches every visible
// label, the choice survives a reload, and the two languages do not share
// untranslated leftovers.
(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms))
  const problems = []
  const checks = {}
  const $$ = (s) => [...document.querySelectorAll(s)]
  const $ = (s) => document.querySelector(s)
  const text = () => document.body.innerText

  const until = async (fn, ms = 5000) => {
    const end = Date.now() + ms
    while (Date.now() < end) {
      if (fn()) return true
      await wait(70)
    }
    return false
  }

  /**
   * Switch language by clicking the real header control, not by reaching into the
   * store: `window.__EF` is dev-only and is absent from the production bundle that
   * these checks run against, so a store-based switch would silently do nothing.
   */
  const langButton = () =>
    $$('.topbar .btn').find((b) => /^(EN|中文)$/.test(b.textContent.trim()))

  const setLang = async (lang) => {
    for (let i = 0; i < 6; i += 1) {
      const navLabel = $$('.topbar .tab')[0]?.textContent.trim()
      const isZh = navLabel === '项目'
      if ((lang === 'zh' && isZh) || (lang === 'en' && !isZh)) break
      langButton()?.click()
      await wait(400)
    }
    await wait(200)
  }

  /** Click a view tab by its (possibly translated) label. */
  const clickTabIfNeeded = async (label) => {
    const tab = $$('.topbar .tab').find((t) => t.textContent.trim() === label)
    if (tab && !tab.classList.contains('active')) {
      tab.click()
      await wait(500)
    }
  }

  try {
    await wait(1200)

    /* ---------- 1. Chinese ---------- */
    await setLang('zh')
    checks.zh = {
      docLang: document.documentElement.lang,
      navProjects: $$('.topbar .tab')[0]?.textContent.trim(),
      hasChinese: /[\u4e00-\u9fff]/.test(text()),
      latinOnlyLabels: $$('.topbar .tab')
        .filter((t) => /^[A-Za-z ]+$/.test(t.textContent.trim()))
        .map((t) => t.textContent.trim()),
    }
    if (checks.zh.navProjects !== '项目') {
      problems.push(`Chinese nav tab wrong: "${checks.zh.navProjects}"`)
    }
    if (checks.zh.latinOnlyLabels.length > 0) {
      problems.push(`Untranslated nav tabs in Chinese: ${checks.zh.latinOnlyLabels.join(', ')}`)
    }
    if (!checks.zh.hasChinese) problems.push('Chinese mode shows no Chinese text at all')

    /* ---------- 2. English ---------- */
    await setLang('en')
    checks.en = {
      docLang: document.documentElement.lang,
      navProjects: $$('.topbar .tab')[0]?.textContent.trim(),
    }
    if (checks.en.navProjects !== 'Projects') {
      problems.push(`English nav tab wrong: "${checks.en.navProjects}"`)
    }
    if (checks.en.docLang !== 'en') {
      problems.push(`document lang not updated for English: ${checks.en.docLang}`)
    }

    /* ---------- 3. the header control itself works ---------- */
    const btn = langButton()
    checks.langButtonPresent = Boolean(btn)
    if (!btn) {
      problems.push('Language switch button not found in the header')
    } else {
      const before = btn.textContent.trim()
      btn.click()
      const flipped = await until(() => langButton()?.textContent.trim() !== before)
      checks.buttonToggles = flipped
      if (!flipped) problems.push('Clicking the language button did not switch the language')
      await setLang('en')
    }

    /* ---------- 4. key screens translate, not just the header ---------- */
    await setLang('zh')
    clickTabIfNeeded('从信息源新建')
    await until(() => text().includes('从信息源新建项目'))
    checks.draftZh = {
      heading: $$('h1')[0]?.textContent.trim(),
      sourceHeading: $$('.section-title')[0]?.textContent.trim(),
    }
    if (!/从信息源新建/.test(checks.draftZh.heading ?? '')) {
      problems.push(`Draft heading not translated: "${checks.draftZh.heading}"`)
    }

    clickTabIfNeeded('看板')
    await until(() => $$('.task-card').length > 0)
    checks.boardZh = {
      panelTitle: $$('.task-detail .section-title')[0]?.textContent.trim(),
      statusOption: $$('.task-card select option')[0]?.textContent.trim(),
      kindBadge: $$('.task-card .badge')[0]?.textContent.trim(),
    }
    if (checks.boardZh.statusOption !== '待办') {
      problems.push(`Status option not translated: "${checks.boardZh.statusOption}"`)
    }
    if (checks.boardZh.kindBadge !== '个人') {
      problems.push(`Task kind badge not translated: "${checks.boardZh.kindBadge}"`)
    }

    /* ---------- 5. switching back leaves no stale chrome ---------- */
    await setLang('en')
    clickTabIfNeeded('Board')
    await until(() => $$('.task-card').length > 0)
    // Header labels must be pure English; only user content may contain Chinese.
    const headerLatin = $$('.topbar .tab').every((t) => /^[A-Za-z ]+$/.test(t.textContent.trim()))
    checks.headerLatinAfterSwitchBack = headerLatin
    if (!headerLatin) problems.push('Header did not return to English')

    /* ---------- 6. the choice is persisted ---------- */
    const persisted = JSON.parse(localStorage.getItem('eventflow.state.v1') ?? '{}')
    checks.persistedLang = persisted.lang
    if (persisted.lang !== 'en') {
      problems.push(`Language choice was not persisted (stored: ${persisted.lang})`)
    }

    /* ---------- 6b. no interpolated object leaked into the interface ---------- */
    // A Bilingual `{ zh, en }` interpolated into a template string renders as
    // "[object Object]". That shipped once, in the user-group toast, so the toast
    // is actually triggered here rather than trusting that no code path does it.
    const scanForObjectLeak = () => (text().match(/\[object Object\]/g) ?? []).length

    // Trigger the toast by applying a user group, the path that leaked.
    const groupBtn = $$('.topbar .btn').find((b) => /User group|用户群/.test(b.textContent))
    groupBtn?.click()
    await wait(400)
    const option = $$('.scenario-item')[1] ?? $$('.scenario-item')[0]
    option?.click()
    await until(() => Boolean($('.toast')), 4000)
    checks.toastText = ($('.toast')?.innerText ?? '').slice(0, 140)
    await wait(300)

    checks.objectLeakVisible = scanForObjectLeak()
    if (checks.objectLeakVisible > 0) {
      problems.push(
        `"[object Object]" is visible in the interface (${checks.objectLeakVisible}×), toast was: ${checks.toastText}`,
      )
    }
    // Close the toast so it cannot pollute later assertions.
    $('.toast button')?.click()
    await wait(300)

    /* ---------- 7. text density ---------- */
    const notesBtn = () =>
      $$('.topbar .btn').find((b) => /^(Notes|说明)$/.test(b.textContent.trim()))

    const visibleVerbose = () =>
      $$('[data-verbose]').filter((el) => el.offsetParent !== null && el.clientHeight > 0).length

    if (!notesBtn()) {
      problems.push('Density control ("Notes") not found in the header')
    } else {
      // Default is terse: explanatory layers must be hidden.
      const app = $('.app')
      checks.densityDefault = app?.getAttribute('data-density')
      checks.verboseVisibleInTerse = visibleVerbose()
      if (checks.densityDefault !== 'terse') {
        problems.push(`Density should default to terse, got "${checks.densityDefault}"`)
      }
      if (checks.verboseVisibleInTerse > 0) {
        problems.push(
          `${checks.verboseVisibleInTerse} explanatory block(s) still visible in terse mode`,
        )
      }

      // Turning notes on must reveal them.
      notesBtn().click()
      await until(() => $('.app')?.getAttribute('data-density') === 'full')
      checks.verboseVisibleInFull = visibleVerbose()
      if (checks.verboseVisibleInFull === 0) {
        problems.push('Turning the notes on revealed no explanatory text')
      }

      // And back off again.
      notesBtn().click()
      await until(() => $('.app')?.getAttribute('data-density') === 'terse')
      checks.verboseVisibleAfterToggleBack = visibleVerbose()
      if (checks.verboseVisibleAfterToggleBack > 0) {
        problems.push('Turning the notes off did not hide the explanatory text again')
      }
    }

    return JSON.stringify({ checks, problems }, null, 2)
  } catch (err) {
    problems.push(`script error: ${String(err && err.message ? err.message : err)}`)
    return JSON.stringify({ checks, problems }, null, 2)
  }
})()
