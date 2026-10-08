import { useMemo, useState } from 'react'
import { useStore } from '../state/projectStore'
import { Alert, Avatar, Hint, ReqTag, SoftNote } from '../components/ui'
import { useT } from '../i18n/useT'
import { analyseSource } from '../lib/sourceAnalyser'
import type { SourceAnalysis } from '../lib/sourceAnalyser'
import { isRealIsoDate } from '../lib/sourceAnalyser'
import { matchTemplates, generateDraft, TEMPLATES } from '../lib/domainEngine'
import type { Template } from '../lib/domainEngine'
import { SAMPLE_SOURCES } from '../lib/seed'
import type { ProjectScale, SourceKind } from '../domain/types'
import { EXTRACTORS } from '../lib/llmAdapter'

/** Options for the analyser-summary selects, in display order. */
const SOURCE_KINDS: SourceKind[] = ['brief', 'email', 'calendar', 'chat', 'file', 'manual']
const SCALES: ProjectScale[] = ['small', 'medium', 'large']


/**
 * R1 + R2 — the "information source to editable workflow" view.
 *
 * The left column shows exactly what the analyser understood from the source
 * (and, just as importantly, what it could NOT find). The right column picks
 * the process template that will seed the draft, and its presentation changes
 * with the R2 familiarity level.
 */
export function DraftView() {
  const users = useStore((s) => s.users)
  const currentUser = useStore((s) => s.currentUser())
  const createProject = useStore((s) => s.createProjectFromDraft)
  const setView = useStore((s) => s.setView)
  const familiarity = useStore((s) => s.effectiveFamiliarity())
  const { t, lang, tSource, tScale, tRole, tFamiliarity, tKind } = useT()
  const isDeadlineInPast = useStore((s) => s.isDeadlineInPast)

  const [sourceText, setSourceText] = useState(SAMPLE_SOURCES[0].text)
  const [name, setName] = useState('CSI405 group presentation')
  const [kindOverride, setKindOverride] = useState<SourceKind | null>(null)
  const [deadlineOverride, setDeadlineOverride] = useState<string | null>(null)
  const [scaleOverride, setScaleOverride] = useState<ProjectScale | null>(null)
  const [templateId, setTemplateId] = useState<string | null>(null)
  const [showAllTemplates, setShowAllTemplates] = useState(false)
  const [ownerDraft, setOwnerDraft] = useState<Record<string, string>>({})

  // Deterministic analysis of whatever is in the box right now.
  const analysis: SourceAnalysis = useMemo(() => analyseSource(sourceText), [sourceText])

  const matches = useMemo(
    () => matchTemplates(analysis, sourceText),
    [analysis, sourceText],
  )

  const kind = kindOverride ?? analysis.kind
  const deadline = deadlineOverride ?? analysis.deadline ?? ''
  const scale = scaleOverride ?? analysis.scale

  // R2: the ranking is *re-ordered*, not filtered, so both levels still see
  // every template — the difference is what is surfaced first and why.
  const ranked = useMemo(() => {
    const list = [...matches]
    if (familiarity === 'expert') {
      // Experts first see the processes they have already run.
      list.sort((a, b) => {
        const prev = (t: Template) => (t.id === 'tpl-presentation' ? 1 : 0)
        return (
          b.template.usageCount * 0.35 +
          prev(b.template) -
          (a.template.usageCount * 0.35 + prev(a.template)) +
          b.score -
          a.score
        )
      })
    }
    return list
  }, [matches, familiarity])

  const chosen: Template =
    ranked.find((m) => m.template.id === templateId)?.template ??
    ranked[0]?.template ??
    TEMPLATES[TEMPLATES.length - 1]

  // Preview the draft so the user sees the consequence before committing (R1).
  const preview = useMemo(() => {
    if (!deadline) return null
    return generateDraft({
      analysis: { ...analysis, deadline, deadlineInferred: deadlineOverride === null && analysis.deadlineInferred },
      sourceText,
      projectName: name,
      template: chosen,
      deadline,
      scale,
      members: users,
      ownerId: currentUser.id,
      familiarity,
      applyReusableChecklist: familiarity === 'expert',
      lang,
    })
  }, [analysis, deadline, deadlineOverride, sourceText, name, chosen, scale, users, currentUser.id, familiarity])

  const visibleTemplates = showAllTemplates ? ranked : ranked.slice(0, 3)

  const submit = () => {
    if (!deadline || !name.trim()) return
    createProject({
      name: name.trim(),
      sourceText,
      sourceKind: kind,
      deadline,
      deadlineInferred: deadlineOverride === null && analysis.deadlineInferred,
      scale,
      familiarity,
      templateId: chosen.id,
      templateReused: familiarity === 'expert' && chosen.usageCount > 2,
      owners: ownerDraft,
      analysis,
    })
  }

  const isNovice = familiarity === 'novice'

  /**
   * Error prevention for the submit button.
   *
   * The button is disabled until the plan can actually be built, and a disabled
   * button must state its reason: an unexplained grey button reads as a broken
   * prototype rather than as an unmet requirement. The three conditions match the
   * three alerts rendered above the button.
   */
  const dateIsReal = isRealIsoDate(deadline)
  const dateIsPast = dateIsReal && isDeadlineInPast(deadline)
  const blockReason = !name.trim()
    ? `${t('prev.nameRequired')} — ${t('prev.nameRequiredBody')}`
    : !deadline
      ? `${t('prev.deadlineNotSet')} — ${t('prev.deadlineNotSetBody')}`
      : !dateIsReal
        ? `${t('err.invalidDate')} ${t('err.invalidDateBody', { date: deadline })}`
        : dateIsPast
          ? `${t('prev.deadlinePast')} ${t('prev.deadlinePastBody', { date: deadline })}`
          : ''
  const canSubmit = blockReason === ''

  return (
    <>
      <div className="page-head">
        <div style={{ flex: 1, minWidth: 280 }}>
          <h1>{t('draft.title')}</h1>
          <Hint>{t('draft.intro')}</Hint>
        </div>
        <ReqTag n={1} label={t('draft.reqLabel')} />
      </div>

      <div className="draft-layout">
        {/* ---------------- left: the source ---------------- */}
        <div className="stack lg">
          <div className="card pad">
            <div className="row" style={{ justifyContent: 'space-between', marginBottom: 10 }}>
              <h3 className="section-title" style={{ margin: 0 }}>
                {t('draft.sourceHeading')}
              </h3>
              <div className="sample-list" data-guide="sample-sources">
                {SAMPLE_SOURCES.map((s) => (
                  <button
                    key={s.label.en}
                    className="btn xs"
                    onClick={() => {
                      setSourceText(s.text)
                      setKindOverride(null)
                      setDeadlineOverride(null)
                      setScaleOverride(null)
                      setTemplateId(null)
                      setName(s.label[lang])
                    }}
                    title={t('draft.sampleTitle', { label: s.label[lang] })}
                  >
                    {s.label[lang]}
                  </button>
                ))}
              </div>
            </div>

            <textarea
              data-guide="source-input"
              value={sourceText}
              onChange={(e) => {
                setSourceText(e.target.value)
                setDeadlineOverride(null)
              }}
              rows={13}
              placeholder={t('draft.sourcePlaceholder')}
              aria-label={t('draft.sourceAria')}
            />

            <Hint style={{ marginTop: 6 }}>
              {t('draft.charCount', { n: sourceText.trim().length })}
            </Hint>
          </div>

          <div className="card pad" data-guide="analyser-summary">
            <h3 className="section-title">
              {t('draft.understood')}
              <span className="badge neutral">
                {t('draft.confident', { n: Math.round(analysis.confidence * 100) })}
              </span>
            </h3>

            <div className="stack sm">
              <div className="row" style={{ alignItems: 'flex-start', gap: 12 }}>
                <div style={{ flex: '1 1 150px' }}>
                  <label className="field">
                    <span className="label">{t('draft.sourceType')}</span>
                    <select
                      value={kind}
                      onChange={(e) => setKindOverride(e.target.value as SourceKind)}
                    >
                      {SOURCE_KINDS.map((k) => (
                        <option key={k} value={k}>
                          {tSource(k)}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div style={{ flex: '1 1 150px' }}>
                  <label className="field">
                    <span className="label">{t('draft.deadline')}</span>
                    <input
                      type="date"
                      value={deadline}
                      onChange={(e) => setDeadlineOverride(e.target.value)}
                    />
                  </label>
                </div>
                <div style={{ flex: '1 1 170px' }}>
                  <label className="field">
                    <span className="label">{t('draft.scale')}</span>
                    <select
                      value={scale}
                      onChange={(e) => setScaleOverride(e.target.value as ProjectScale)}
                    >
                      {SCALES.map((k) => (
                        <option key={k} value={k}>
                          {tScale(k)}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>

              {/*
                An impossible date in the source is reported rather than ignored.
                "due 31 February" is almost always a typo in the source, and the
                user is the only one who can decide what was really meant.
              */}
              {analysis.invalidDates.length > 0 && (
                <Alert
                  tone="danger"
                  guide="guard-invalid-source-date"
                  title={t('err.invalidDate')}
                  fix={t('prev.dateSkippedFix')}
                >
                  {analysis.invalidDates.map((d) => (
                    <div key={d.wouldBe}>
                      {t('err.invalidDateBody', { date: d.phrase })} → {d.wouldBe}
                    </div>
                  ))}
                </Alert>
              )}

              {analysis.deadlineInferred && deadlineOverride === null ? (
                <div className="note warn">
                  <span className="note-icon">!</span>
                  <span>
                    <strong>{t('draft.noDeadline')}</strong>{' '}
                    {t('draft.noDeadlineBody', { date: analysis.deadline ?? '' })}
                  </span>
                </div>
              ) : analysis.deadlinePhrase ? (
                <div className="note info">
                  <span className="note-icon">✓</span>
                  <span>
                    {t('draft.deadlineFromText')} <b>“{analysis.deadlinePhrase}”</b>
                  </span>
                </div>
              ) : null}

              {analysis.obligations.length > 0 && (
                <div data-verbose="">
                  <div className="label small" style={{ fontWeight: 600, margin: '8px 0 5px' }}>
                    {t('draft.obligations', { n: analysis.obligations.length })}
                  </div>
                  <div className="stack sm">
                    {analysis.obligations.map((o, i) => (
                      <div className="obligation" key={i}>
                        {o}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {analysis.missingInfo.length > 0 && (
                <div className="note accent" data-guide="missing-info">
                  <span className="note-icon">?</span>
                  <span>
                    <strong>{t('draft.missingInfoTitle')}</strong>
                    <ul style={{ margin: '5px 0 0', paddingLeft: 18 }}>
                      {analysis.missingInfo.map((m) => (
                        <li key={m}>{m}</li>
                      ))}
                    </ul>
                  </span>
                </div>
              )}

              {analysis.people.length > 0 && (
                <div className="row small" data-verbose="" style={{ gap: 6 }}>
                  <span className="muted">{t('draft.peopleMentioned')}</span>
                  {analysis.people.map((p) => (
                    <span className="chip" key={p}>
                      {p}
                    </span>
                  ))}
                </div>
              )}

              <div className="row small" data-verbose="" style={{ gap: 6, flexWrap: 'wrap' }}>
                <span className="muted">{t('draft.keyConcepts')}</span>
                {analysis.keywords.slice(0, 10).map((k, i) => (
                  <span key={`${k}-${i}`} className="badge neutral">
                    {k}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ---------------- right: the generated workflow ---------------- */}
        <div className="stack lg">
          <div className="card pad">
            <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
              <h3 className="section-title" style={{ margin: 0 }}>
                {t('draft.processHeading')}
              </h3>
              <span className="badge accent">
                {isNovice ? t('draft.guidanceGuided') : t('draft.guidanceReuse')}
              </span>
            </div>

            {isNovice ? (
              <SoftNote tone="accent" icon="◐" guide="suggestion-banner">
                {t('draft.noviceBanner')}
              </SoftNote>
            ) : (
              <SoftNote tone="ok" icon="⚡">
                {t('draft.expertBanner')}
              </SoftNote>
            )}

            <div className="stack sm" data-guide="template-list">
              {visibleTemplates.map((m) => (
                <button
                  key={m.template.id}
                  className={`template-card${m.template.id === chosen.id ? ' selected' : ''}`}
                  onClick={() => setTemplateId(m.template.id)}
                >
                  <div className="row" style={{ justifyContent: 'space-between', gap: 8 }}>
                    <span className="name">{t(m.template.nameKey)}</span>
                    <span className="small muted nowrap">
                      {m.template.usageCount > 0
                        ? t('draft.usedTimes', { n: m.template.usageCount })
                        : t('draft.neverUsed')}
                    </span>
                  </div>
                  <div className="row small muted" style={{ gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                    <span className="badge neutral">
                      {t('draft.stagesCount', { n: m.template.stages.length })}
                    </span>
                    <span className="badge neutral">
                      {t('draft.tasksCount', {
                        n: m.template.stages.reduce((a, s) => a + s.tasks.length, 0),
                      })}
                    </span>
                    {m.template.keywords
                      .filter((k) => m.matchedTerms.includes(k))
                      .slice(0, 3)
                      .map((k) => (
                        <span className="badge accent" key={k}>
                          {k}
                        </span>
                      ))}
                  </div>
                  <div className="score-bar" title={`${Math.round(m.score * 100)}%`}>
                    <i style={{ width: `${Math.round(m.score * 100)}%` }} />
                  </div>
                  {isNovice && (
                    <div className="small muted" style={{ marginTop: 6 }}>
                      {t(m.template.rationaleKey)}
                    </div>
                  )}
                </button>
              ))}
            </div>

            <button
              className="btn sm ghost"
              style={{ marginTop: 8 }}
              onClick={() => setShowAllTemplates((v) => !v)}
            >
              {showAllTemplates ? t('draft.onlyClosest') : t('draft.showAll', { n: ranked.length })}
            </button>

            {!isNovice && chosen.reusableChecklist.length > 0 && (
              <div className="note ok" style={{ marginTop: 10 }}>
                <span className="note-icon">☑</span>
                <span>
                  <strong>{t('draft.checklistAttached')}</strong>
                  <ul style={{ margin: '5px 0 0', paddingLeft: 18 }}>
                    {chosen.reusableChecklist.map((c) => (
                      <li key={c}>{c}</li>
                    ))}
                  </ul>
                </span>
              </div>
            )}
          </div>

          <div className="card pad">
            <h3 className="section-title">{t('draft.projectSection')}</h3>
            <label className="field">
              <span className="label">{t('draft.nameLabel')}</span>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} />
            </label>

            <div className="field">
              <Hint>{t('draft.stageOwners')}</Hint>
              <div className="stack sm">
                {(preview?.stages ?? chosen.stages.map((s) => ({ id: s.name, name: s.name }))).map(
                  (stage) => (
                    <div className="row" key={stage.id} style={{ gap: 8 }}>
                      <span className="small" style={{ flex: 1, minWidth: 0 }}>
                        {stage.name}
                      </span>
                      <select
                        value={ownerDraft[stage.name] ?? currentUser.id}
                        onChange={(e) =>
                          setOwnerDraft((d) => ({ ...d, [stage.name]: e.target.value }))
                        }
                        style={{ width: 150 }}
                      >
                        {users.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  ),
                )}
              </div>
            </div>

            <Hint style={{ marginTop: 4 }}>
              {t('draft.extractionMethod', { name: EXTRACTORS[0].label })}
            </Hint>
          </div>

          {/* Draft preview — the consequence of the choices above */}
          {preview && (
            <div className="card pad" data-guide="guard-review">
              <h3 className="section-title">
                {t('draft.preview')}
                <span className="badge neutral">
                  {t('draft.stagesCount', { n: preview.stages.length })}
                </span>
                <span className="badge neutral">
                  {t('draft.tasksCount', {
                    n: preview.stages.reduce((a, s) => a + s.tasks.length, 0),
                  })}
                </span>
                <span className={`badge ${preview.slackDays < 0 ? 'danger' : 'ok'}`}>
                  {preview.slackDays < 0
                    ? t('draft.daysShort', { n: Math.abs(preview.slackDays) })
                    : t('draft.daysSlack', { n: preview.slackDays })}
                </span>
              </h3>

              <div className="stack sm" style={{ maxHeight: 330, overflowY: 'auto' }}>
                {preview.stages.map((stage) => (
                  <div key={stage.id}>
                    <div className="small" style={{ fontWeight: 650, marginBottom: 3 }}>
                      {stage.name}
                    </div>
                    {stage.tasks.map((t) => (
                      <div
                        key={t.id}
                        className="row small"
                        style={{ justifyContent: 'space-between', gap: 8, paddingLeft: 10 }}
                      >
                        <span style={{ flex: 1, minWidth: 0, color: 'var(--text-2)' }}>
                          {t.name}
                          {t.kind === 'collaborative' && (
                            <span className="badge accent" style={{ marginLeft: 6 }}>
                              {tKind('collaborative')}
                            </span>
                          )}
                        </span>
                        <span className="muted nowrap mono">
                          {t.startDate} → {t.deadline}
                        </span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>

              {preview.warnings.length > 0 && (
                <div className="stack sm" style={{ marginTop: 12 }}>
                  {preview.warnings.map((w) => (
                    <div className="note warn" key={w.key + JSON.stringify(w.params ?? {})}>
                      <span className="note-icon">!</span>
                      <span>{t(w.key, w.params)}</span>
                    </div>
                  ))}
                </div>
              )}

              {/*
                Prevention: an impossible or already-passed deadline is explained
                here, before the button is pressed, rather than after generation.
                Both cases would otherwise produce a plan whose dates are
                meaningless, which is far harder to notice than this alert.
              */}
              {!isRealIsoDate(deadline) && (
                <Alert
                  tone="danger"
                  guide="guard-invalid-date"
                  title={t('err.invalidDate')}
                  fix={t('prev.deadlineNotSetBody')}
                >
                  {t('err.invalidDateBody', { date: deadline })}
                </Alert>
              )}
              {isRealIsoDate(deadline) && isDeadlineInPast(deadline) && (
                <Alert
                  tone="danger"
                  guide="guard-deadline-past"
                  title={t('prev.deadlinePast')}
                  fix={t('prev.deadlineMovedFix')}
                >
                  {t('prev.deadlinePastBody', { date: deadline })}
                </Alert>
              )}
              {deadline && !name.trim() && (
                <Alert tone="warn" guide="guard-name" title={t('prev.nameRequired')}>
                  {t('prev.nameRequiredBody')}
                </Alert>
              )}

              <div className="row" style={{ marginTop: 14, gap: 8 }}>
                <button
                  className="btn primary"
                  data-guide="create-project"
                  onClick={submit}
                  disabled={!canSubmit}
                  title={canSubmit ? undefined : blockReason}
                >
                  {t('draft.create')}
                </button>
                <button className="btn ghost" onClick={() => setView('projects')}>
                  {t('common.cancel')}
                </button>
              </div>
              {/* A disabled control must say why: otherwise it reads as broken. */}
              {!canSubmit && (
                <div className="small muted" style={{ marginTop: 6 }} data-guide="guard-submit-reason">
                  {blockReason}
                </div>
              )}
              <Hint style={{ marginTop: 8 }}>{t('draft.staysEditable')}</Hint>
            </div>
          )}

          {!deadline && (
            <Alert
              tone="danger"
              guide="guard-deadline-missing"
              title={t('prev.deadlineNotSet')}
              fix={t('prev.deadlinePick')}
            >
              {t('prev.deadlineNotSetBody')}
            </Alert>
          )}

          <div className="card pad">
            <h3 className="section-title">{t('draft.peopleHeading')}</h3>
            <div className="stack sm">
              {users.map((u) => (
                <div className="row" key={u.id} style={{ gap: 8 }}>
                  <Avatar user={u} className="sm" />
                  <span style={{ flex: 1 }}>{u.name}</span>
                  <span className={`badge ${u.role === 'coordinator' ? 'accent' : 'neutral'}`}>
                    {tRole(u.role)}
                  </span>
                  <span className="badge neutral">{tFamiliarity(u.familiarity)}</span>
                </div>
              ))}
            </div>
            <Hint style={{ marginTop: 8 }}>{t('draft.familiarityNote')}</Hint>
          </div>
        </div>
      </div>
    </>
  )
}
