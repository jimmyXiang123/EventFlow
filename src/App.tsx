import { useEffect } from 'react'
import { useStore } from './state/projectStore'
import type { ViewId } from './state/projectStore'
import { useT } from './i18n/useT'
import { ProjectsView } from './views/ProjectsView'
import { DraftView } from './views/DraftView'
import { BoardView } from './views/BoardView'
import { CalendarView } from './views/CalendarView'
import { FlowView } from './views/FlowView'
import { Alert, GuidanceControl, ScenarioControl, Toast, Avatar } from './components/ui'

/**
 * Five views, in the order a plan is made: pick a project, turn a source into a
 * workflow, work the board, read the schedule, inspect the dependencies.
 *
 * The walkthrough player used to be a sixth tab. It was removed from the
 * prototype on the group's feedback: its content is the report's material and is
 * reproduced in full in the user manual, so shipping it twice made the app busier
 * without adding a capability. The scripts themselves are kept in
 * `src/domain/walkthroughs.ts` as the design record the report cites.
 */
const TABS: Array<{ id: ViewId; needsProject: boolean }> = [
  { id: 'projects', needsProject: false },
  { id: 'draft', needsProject: false },
  { id: 'board', needsProject: true },
  { id: 'calendar', needsProject: true },
  { id: 'flow', needsProject: true },
]

export function App() {
  const view = useStore((s) => s.view)
  const setView = useStore((s) => s.setView)
  const toast = useStore((s) => s.toast)
  const clearToast = useStore((s) => s.clearToast)
  const project = useStore((s) => s.selectedProject())
  const users = useStore((s) => s.users)
  const currentUser = useStore((s) => s.currentUser())
  const setCurrentUser = useStore((s) => s.setCurrentUser)
  const resetDemo = useStore((s) => s.resetDemo)
  const simulate = useStore((s) => s.simulateRemoteActivity)
  const compact = useStore((s) => s.compact)
  const setCompact = useStore((s) => s.setCompact)
  const lang = useStore((s) => s.lang)
  const setLang = useStore((s) => s.setLang)
  const density = useStore((s) => s.density)
  const setDensity = useStore((s) => s.setDensity)
  const storageFailed = useStore((s) => s.storageFailed)
  const dismissStorageWarning = useStore((s) => s.dismissStorageWarning)
  const { t, tRole } = useT()

  // Auto-dismiss the transient banner.
  useEffect(() => {
    if (!toast) return
    const id = window.setTimeout(() => clearToast(), 4200)
    return () => window.clearTimeout(id)
  }, [toast, clearToast])

  // A view that needs a project is meaningless without one.
  useEffect(() => {
    if (!project && view !== 'projects' && view !== 'draft') setView('projects')
  }, [project, view, setView])

  // Keep the document language in sync so the browser selects sensible fonts for
  // Chinese text rather than falling back per glyph.
  useEffect(() => {
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en'
  }, [lang])

  return (
    <div className="app" data-density={density}>
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">EF</span>
          {t('app.name')}
        </div>

        <nav className="tabs" data-guide="view-tabs" aria-label="Views">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              className={`tab${view === tab.id ? ' active' : ''}`}
              onClick={() => setView(tab.id)}
              disabled={tab.needsProject && !project}
              aria-current={view === tab.id ? 'page' : undefined}
            >
              {t(`nav.${tab.id}`)}
            </button>
          ))}
        </nav>

        <div className="spacer" />

        <ScenarioControl />

        <span data-guide="guidance-control">
          <GuidanceControl />
        </span>

        {project && (
          <span className="chip nowrap" title={t('board.finalDeadlineTitle')}>
            {project.name}
            <b className="mono">{project.finalDeadline}</b>
          </span>
        )}

        <button
          className="btn sm ghost"
          data-guide="simulate-update"
          onClick={simulate}
          disabled={!project}
          title={t('people.simulateTitle')}
        >
          {t('people.simulate')}
        </button>

        <label className="inline nowrap" style={{ gap: 6 }} data-guide="role-switcher">
          <Avatar user={currentUser} className="sm" />
          <select
            value={currentUser.id}
            onChange={(e) => setCurrentUser(e.target.value)}
            style={{ width: 'auto' }}
            title={t('people.roleSwitcher')}
          >
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} · {tRole(u.role)}
              </option>
            ))}
          </select>
        </label>

        <button
          className={`btn sm ${compact ? '' : 'primary'}`}
          onClick={() => setCompact(!compact)}
        >
          {compact ? t('common.detailed') : t('common.compact')}
        </button>

        <button
          className={`btn sm ${density === 'full' ? 'primary' : 'ghost'}`}
          onClick={() => setDensity(density === 'full' ? 'terse' : 'full')}
          title={t('density.title')}
        >
          {t('density.label')}
        </button>

        <button
          className="btn sm ghost"
          onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}
          title={lang === 'zh' ? 'Switch the interface to English' : '把界面切换成中文'}
        >
          {lang === 'zh' ? 'EN' : '中文'}
        </button>

        <button className="btn sm ghost" onClick={resetDemo}>
          {t('common.reset')}
        </button>
      </header>

      <main className={`main${compact ? ' compact' : ''}`}>
        {/*
          Storage failure is a session-long condition, not an event, so it gets a
          persistent banner instead of a toast that disappears after four seconds.
          Telling someone their work is being saved when it is not is the worst
          kind of silence, so this alert is never suppressed by the density layer.
        */}
        {storageFailed && (
          <Alert
            tone="danger"
            guide="guard-storage"
            title={t('err.storageTitle')}
            fix={t('err.storageHint')}
            onDismiss={dismissStorageWarning}
          >
            {t('err.storageBody')}
          </Alert>
        )}

        {view === 'projects' && <ProjectsView />}
        {view === 'draft' && <DraftView />}
        {view === 'board' && project && <BoardView />}
        {view === 'calendar' && project && <CalendarView />}
        {view === 'flow' && project && <FlowView />}
      </main>

      <Toast message={toast} onClose={clearToast} />
    </div>
  )
}
