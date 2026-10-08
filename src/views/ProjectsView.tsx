import { useMemo } from 'react'
import { useStore } from '../state/projectStore'
import { Avatar, Hint, useFormatDate, useRelativeTime } from '../components/ui'
import { useT } from '../i18n/useT'
import { analyseDependencies, flattenTasks } from '../lib/domainEngine'
import type { Project } from '../domain/types'

interface ProjectStats {
  total: number
  done: number
  inProgress: number
  waiting: number
  blocked: number
  overdue: number
  collaborative: number
  nextDeadline: string | null
  nextTaskName: string | null
}

function statsOf(project: Project): ProjectStats {
  const rows = flattenTasks(project.stages)
  const insights = analyseDependencies(project.stages)
  let done = 0
  let inProgress = 0
  let waiting = 0
  let blocked = 0
  let overdue = 0
  let collaborative = 0

  for (const { task } of rows) {
    if (task.status === 'done') done += 1
    else if (task.status === 'in_progress') inProgress += 1
    else if (task.status === 'waiting') waiting += 1
    else if (task.status === 'blocked') blocked += 1
    if (insights.get(task.id)?.isOverdue) overdue += 1
    if (task.kind === 'collaborative') collaborative += 1
  }

  const open = rows
    .filter(({ task }) => task.status !== 'done' && task.deadline)
    .sort((a, b) => (a.task.deadline ?? '').localeCompare(b.task.deadline ?? ''))

  return {
    total: rows.length,
    done,
    inProgress,
    waiting,
    blocked,
    overdue,
    collaborative,
    nextDeadline: open[0]?.task.deadline ?? null,
    nextTaskName: open[0]?.task.name ?? null,
  }
}

function Bar({ stats }: { stats: ProjectStats }) {
  const pct = (n: number) => (stats.total === 0 ? 0 : (n / stats.total) * 100)
  return (
    <div className="progress-track">
      <span style={{ width: `${pct(stats.done)}%`, background: 'var(--ok)' }} />
      <span style={{ width: `${pct(stats.inProgress)}%`, background: 'var(--accent)' }} />
      <span style={{ width: `${pct(stats.waiting)}%`, background: 'var(--info)' }} />
      <span style={{ width: `${pct(stats.blocked)}%`, background: 'var(--danger)' }} />
    </div>
  )
}

function ProjectCard({ project }: { project: Project }) {
  const users = useStore((s) => s.users)
  const selectProject = useStore((s) => s.selectProject)
  const setView = useStore((s) => s.setView)
  const deleteProject = useStore((s) => s.deleteProject)
  const stats = useMemo(() => statsOf(project), [project])
  const { t, tSource } = useT()
  const formatDate = useFormatDate()
  const relativeTime = useRelativeTime()

  const members = project.members.map((id) => users.find((u) => u.id === id)).filter(Boolean)
  const extraOwnerIds = [
    ...new Set(flattenTasks(project.stages).map(({ task }) => task.ownerId)),
  ].filter((id) => !project.members.includes(id))

  const open = () => {
    selectProject(project.id)
    setView('board')
  }

  return (
    <div className="card project-card">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <h3>{project.name}</h3>
        <span className="badge neutral nowrap">{tSource(project.sourceKind)}</span>
      </div>

      <div className="row small muted" style={{ gap: 8, flexWrap: 'wrap' }}>
        <span>
          {t('draft.deadline')} <b className="mono">{project.finalDeadline}</b>
        </span>
        <span>·</span>
        <span>
          {t('draft.stagesCount', { n: project.stages.length })} /{' '}
          {t('draft.tasksCount', { n: stats.total })}
        </span>
      </div>

      <Bar stats={stats} />

      <div className="stat-row">
        <div className="stat">
          <b>{Math.round((stats.done / Math.max(1, stats.total)) * 100)}%</b>
          <span>{t('projects.complete')}</span>
        </div>
        <div className="stat">
          <b>{stats.collaborative}</b>
          <span>{t('projects.collaborative')}</span>
        </div>
        <div className="stat">
          <b style={{ color: stats.blocked ? 'var(--danger)' : undefined }}>{stats.blocked}</b>
          <span>{t('projects.blocked')}</span>
        </div>
        <div className="stat">
          <b style={{ color: stats.overdue ? 'var(--warn)' : undefined }}>{stats.overdue}</b>
          <span>{t('projects.overdue')}</span>
        </div>
      </div>

      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span className="avatars">
          {members.map((u) => u && <Avatar key={u.id} user={u} className="sm" />)}
          {extraOwnerIds.map((id) => {
            const u = users.find((x) => x.id === id)
            return u ? <Avatar key={u.id} user={u} className="sm" /> : null
          })}
        </span>
        <span className="badge accent">
          {project.familiarity === 'novice' ? t('projects.noviceGuidance') : t('projects.expertMode')}
        </span>
      </div>

      {stats.nextTaskName && (
        <div className="small muted">
          {t('projects.nextUp')} <b style={{ color: 'var(--text-2)' }}>{stats.nextTaskName}</b>{' '}
          {t('projects.by')} {formatDate(stats.nextDeadline ?? undefined)}
        </div>
      )}

      <div className="row" style={{ justifyContent: 'space-between', marginTop: 2 }}>
        <span className="small muted">
          {t('projects.updated')} {relativeTime(`${project.updatedAt}T12:00:00`)}
        </span>
        <span className="row" style={{ gap: 4 }}>
          <button className="btn sm" onClick={open}>
            {t('projects.openBoard')}
          </button>
          <button
            className="btn sm danger"
            onClick={() => {
              if (window.confirm(t('projects.deleteConfirm', { name: project.name }))) {
                deleteProject(project.id)
              }
            }}
          >
            {t('common.delete')}
          </button>
        </span>
      </div>
    </div>
  )
}

export function ProjectsView() {
  const projects = useStore((s) => s.projects)
  const setView = useStore((s) => s.setView)
  const currentUser = useStore((s) => s.currentUser())
  const { t, tRole } = useT()

  const aggregate = useMemo(() => {
    const all = projects.flatMap((p) => flattenTasks(p.stages).map((r) => r.task))
    return {
      projects: projects.length,
      tasks: all.length,
      collaborative: all.filter((t) => t.kind === 'collaborative').length,
      blocked: all.filter((t) => t.status === 'blocked').length,
    }
  }, [projects])

  return (
    <>
      <div className="page-head">
        <div style={{ flex: 1, minWidth: 280 }}>
          <h1>{t('projects.title')}</h1>
          <Hint>
            {t('projects.intro', { name: currentUser.name, role: tRole(currentUser.role) })}
          </Hint>
        </div>
        <div className="row">
          <button className="btn primary" onClick={() => setView('draft')}>
            {t('projects.new')}
          </button>
        </div>
      </div>

      <div className="card pad" style={{ marginBottom: 16 }}>
        <div className="stat-row" style={{ gap: 28 }}>
          <div className="stat">
            <b>{aggregate.projects}</b>
            <span>{t('projects.statProjects')}</span>
          </div>
          <div className="stat">
            <b>{aggregate.tasks}</b>
            <span>{t('projects.statTasks')}</span>
          </div>
          <div className="stat">
            <b>{aggregate.collaborative}</b>
            <span>{t('projects.statCollab')}</span>
          </div>
          <div className="stat">
            <b style={{ color: aggregate.blocked ? 'var(--danger)' : undefined }}>
              {aggregate.blocked}
            </b>
            <span>{t('projects.statBlocked')}</span>
          </div>
        </div>
      </div>

      {projects.length === 0 ? (
        <div className="card empty">
          <p>{t('projects.empty')}</p>
          <button className="btn primary" onClick={() => setView('draft')}>
            {t('projects.createFirst')}
          </button>
        </div>
      ) : (
        <div className="project-grid">
          {projects.map((p) => (
            <ProjectCard key={p.id} project={p} />
          ))}
        </div>
      )}
    </>
  )
}
