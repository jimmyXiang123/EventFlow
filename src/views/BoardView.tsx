import { useMemo, useState } from 'react'
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useStore } from '../state/projectStore'
import {
  Avatar,
  AvatarStack,
  ReqTag,
  StatusSelect,
  dueState,
  useFormatDate,
} from '../components/ui'
import { useT } from '../i18n/useT'
import { analyseDependencies, flattenTasks, TEMPLATES } from '../lib/domainEngine'
import type { DependencyInsight, Template } from '../lib/domainEngine'
import type { Project, Stage, Task } from '../domain/types'

interface CardFlags {
  /** Needed so a card can write a status change without prop-drilling the project. */
  projectId: string
  isNovice: boolean
  isFocused: boolean
  isSynced: boolean
  insight: DependencyInsight | undefined
  blockedByNames: string[]
  ownerName: string
}

/* ---------------- task card ---------------- */

function TaskCardBody({
  task,
  projectId,
  isNovice,
  blockedByNames,
  ownerName,
  insight,
}: CardFlags & { task: Task }) {
  const users = useStore((s) => s.users)
  const { t, tKind } = useT()
  const formatDate = useFormatDate()
  const owner = users.find((u) => u.id === task.ownerId)
  const due = dueState(task.deadline)
  const isBlocked = insight?.isBlocked ?? false
  const isOverdue = insight?.isOverdue ?? false
  const affects = insight?.affects.length ?? 0

  return (
    <>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <span className="task-name">{task.name}</span>
        {owner && <Avatar user={owner} className="sm" title={`${t('board.owner')}: ${ownerName}`} />}
      </div>

      <div className="task-meta">
        <span className={`badge ${task.kind === 'collaborative' ? 'accent' : 'neutral'}`}>
          {tKind(task.kind)}
        </span>
        {task.kind === 'collaborative' && task.collaboratorIds.length > 0 && (
          <AvatarStack ids={task.collaboratorIds} max={3} />
        )}
        {isBlocked && (
          <span className="badge danger" title={`${t('board.waitingFor')}: ${blockedByNames.join(', ')}`}>
            ⛔ {t('board.waitingOn', { n: blockedByNames.length })}
          </span>
        )}
        {task.status === 'blocked' && (
          <span className="badge danger">{t('board.blockerReported')}</span>
        )}
        {isOverdue && (
          <span className="badge warn" title={`${task.deadline}`}>
            {t('board.overdueBadge')}
          </span>
        )}
      </div>

      {task.blockerNote && (
        <div className="small" style={{ color: 'var(--danger)' }}>
          {task.blockerNote}
        </div>
      )}

      {/*
        R2: hints appear only at the novice guidance level, and only when the notes
        layer is on. On a thirteen-card board these were ~700 characters of the
        most repeated text on the screen.
      */}
      {isNovice && task.hint && (
        <div className="note accent" style={{ padding: '6px 8px', fontSize: 11.5 }} data-verbose="">
          <span className="note-icon">◐</span>
          <span>{task.hint}</span>
        </div>
      )}
      {/*
        The reusable checklist is deliberately NOT shown on the card. It is the
        same list for every task that came from one template, so on a six-stage
        board it repeated identically thirteen times and carried no per-task
        information. It is shown once, in the task detail panel, where the user can
        actually act on it.
      */}

      <div className="task-foot">
        <span className="mono nowrap" title={t('board.deadlineComputed')}>
          {formatDate(task.deadline)}
          {affects > 0 && (
            <span className="muted" title={t('board.affectsTitle', { n: affects })}>
              {' '}
              →{affects}
            </span>
          )}
        </span>
        <span className="nowrap muted" title={t('board.effortTitle', { n: task.estimateDays })}>
          {task.estimateDays}
          {t('common.days')}
        </span>
      </div>

      <div className="task-actions" style={{ justifyContent: 'space-between' }}>
        <StatusSelect
          guide="task-status"
          value={task.status}
          onChange={(s) => {
            const store = useStore.getState()
            store.setTaskStatus(projectId, task.id, s)
          }}
        />
        <span className={`badge ${due === 'overdue' ? 'danger' : due === 'soon' ? 'warn' : 'neutral'}`}>
          {due === 'overdue'
            ? t('board.pastDue')
            : due === 'soon'
              ? t('board.dueSoon')
              : t('board.scheduled')}
        </span>
      </div>
    </>
  )
}

function SortableTaskCard({
  task,
  index,
  flags,
  onFocus,
}: {
  task: Task
  index: number
  flags: CardFlags
  onFocus: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    data: { type: 'task', index },
  })

  const due = dueState(task.deadline)
  const cls = [
    'task-card',
    flags.isFocused ? 'focused' : '',
    flags.isSynced ? 'just-synced' : '',
    flags.insight?.isBlocked ? 'blocked' : due === 'overdue' ? 'overdue' : '',
    isDragging ? 'dragging' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div
      ref={setNodeRef}
      className={cls}
      data-guide="task-card"
      style={{ transform: CSS.Translate.toString(transform), transition }}
      onClick={onFocus}
      {...attributes}
      {...listeners}
    >
      <TaskCardBody task={task} {...flags} />
    </div>
  )
}

/**
 * A card's checklist is either the one captured when the project was created, or
 * — for projects that reused a template before the checklist existed — the one
 * from the template that generated it. Reading it at render time keeps the
 * expert guidance useful instead of silently showing nothing.
 */
function checklistFor(task: Task, template: Template | undefined): string[] {
  if (task.reusableChecklist && task.reusableChecklist.length > 0) return task.reusableChecklist
  return template?.reusableChecklist ?? []
}

/* ---------------- stage column ---------------- */

function StageColumn({
  stage,
  index,
  stageCount,
  project,
  flagsFor,
  onFocus,
}: {
  stage: Stage
  index: number
  stageCount: number
  project: Project
  flagsFor: (task: Task) => CardFlags
  onFocus: (taskId: string) => void
}) {
  const renameStage = useStore((s) => s.renameStage)
  const addTask = useStore((s) => s.addTask)
  const deleteStage = useStore((s) => s.deleteStage)
  const moveStage = useStore((s) => s.moveStage)
  const { t } = useT()

  const { setNodeRef, isOver } = useDroppable({ id: stage.id, data: { type: 'stage' } })

  const done = stage.tasks.filter((t2) => t2.status === 'done').length

  return (
    <section className={`stage-col${isOver ? ' drop-active' : ''}`}>
      <div className="stage-head">
        <div className="title-row">
          <input
            className="stage-name-input"
            value={stage.name}
            onChange={(e) => renameStage(project.id, stage.id, e.target.value)}
            aria-label={t('board.stageNameAria')}
          />
          <span className="small muted nowrap">
            {done}/{stage.tasks.length}
          </span>
          <span className="task-actions">
            <button
              className="icon-btn"
              title={t('board.moveStageLeft')}
              disabled={index === 0}
              onClick={() => moveStage(project.id, stage.id, -1)}
            >
              ‹
            </button>
            <button
              className="icon-btn"
              title={t('board.moveStageRight')}
              disabled={index === stageCount - 1}
              onClick={() => moveStage(project.id, stage.id, 1)}
            >
              ›
            </button>
            <button
              className="icon-btn danger"
              title={t('board.deleteStage')}
              onClick={() => {
                if (
                  window.confirm(
                    t('board.deleteStageConfirm', { name: stage.name, n: stage.tasks.length }),
                  )
                ) {
                  deleteStage(project.id, stage.id)
                }
              }}
            >
              ×
            </button>
          </span>
        </div>
      </div>

      <div className="stage-body" ref={setNodeRef}>
        <SortableContext
          items={stage.tasks.map((tk) => tk.id)}
          strategy={verticalListSortingStrategy}
        >
          {stage.tasks.map((task, i) => (
            <SortableTaskCard
              key={task.id}
              task={task}
              index={i}
              flags={flagsFor(task)}
              onFocus={() => onFocus(task.id)}
            />
          ))}
        </SortableContext>

        <button className="btn sm ghost" onClick={() => addTask(project.id, stage.id)}>
          {t('board.addTask')}
        </button>
      </div>
    </section>
  )
}

/* ---------------- side panel ---------------- */

function TaskDetail({
  project,
  task,
  template,
}: {
  project: Project
  task: Task
  template: Template | undefined
}) {
  const users = useStore((s) => s.users)
  /**
   * Derive the dependency map here rather than selecting `dependencyInsights()`
   * from the store. That selector builds a fresh `Map` on every call, so
   * useSyncExternalStore sees a new snapshot each render and React loops until
   * it throws "Maximum update depth exceeded". A memo over `project.stages`
   * gives a stable value that only changes when the graph actually changes.
   */
  const insights = useMemo(() => analyseDependencies(project.stages), [project.stages])
  const updateTask = useStore((s) => s.updateTask)
  const setTaskOwner = useStore((s) => s.setTaskOwner)
  const setTaskKind = useStore((s) => s.setTaskKind)
  const toggleCollaborator = useStore((s) => s.toggleCollaborator)
  const toggleDependency = useStore((s) => s.toggleDependency)
  const setTaskBlocker = useStore((s) => s.setTaskBlocker)
  const deleteTask = useStore((s) => s.deleteTask)
  const setFocusedTask = useStore((s) => s.setFocusedTask)
  const wouldLoop = useStore((s) => s.wouldLoop)
  const isNovice = useStore((s) => s.effectiveFamiliarity()) === 'novice'
  const { t, tKind } = useT()

  const allTasks = flattenTasks(project.stages)
  const insight = insights.get(task.id)
  const byId = new Map(allTasks.map((r) => [r.task.id, r]))

  /**
   * Dependency options that must be refused because choosing them would make two
   * tasks wait for each other. Computed up front so the reason can be shown before
   * the user clicks, rather than only refusing the click afterwards.
   */
  const unavailableDeps = new Set(
    allTasks
      .filter((r) => r.task.id !== task.id && !task.dependsOn.includes(r.task.id))
      .filter((r) => wouldLoop(project.id, task.id, r.task.id))
      .map((r) => r.task.id),
  )
  const hasUnavailable = unavailableDeps.size > 0
  const wouldLoopFor = (projectId: string, taskId: string, otherId: string) =>
    unavailableDeps.has(otherId) && projectId === project.id && taskId === task.id

  return (
    <aside className="card pad task-detail" data-guide="task-detail">
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
        <span className="badge accent">{t('board.taskDetails')}</span>
        <button className="icon-btn" onClick={() => setFocusedTask(null)} title={t('common.close')}>
          ×
        </button>
      </div>

      <label className="field">
        <span className="label">{t('draft.name')}</span>
        <input
          type="text"
          value={task.name}
          onChange={(e) => updateTask(project.id, task.id, { name: e.target.value })}
        />
      </label>

      <div className="row" style={{ gap: 8, alignItems: 'flex-start' }}>
        <label className="field" style={{ flex: 1 }}>
          <span className="label">{t('board.owner')}</span>
          <select
            value={task.ownerId}
            onChange={(e) => setTaskOwner(project.id, task.id, e.target.value)}
          >
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field" style={{ flex: 1 }}>
          <span className="label">{t('board.effort')}</span>
          <input
            type="number"
            min={1}
            max={30}
            value={task.estimateDays}
            onChange={(e) =>
              updateTask(project.id, task.id, {
                estimateDays: Math.max(1, Number(e.target.value) || 1),
              })
            }
          />
        </label>
      </div>

      {/* R3: individual vs collaborative */}
      <div className="field" data-guide="task-kind">
        <span className="label" style={{ display: 'block', marginBottom: 4 }}>
          {t('board.kindLabel')}
        </span>
        <div className="tabs" style={{ padding: 2, display: 'inline-flex' }}>
          {(['individual', 'collaborative'] as const).map((k) => (
            <button
              key={k}
              className={`tab${task.kind === k ? ' active' : ''}`}
              style={{ padding: '4px 10px', fontSize: 12 }}
              onClick={() => setTaskKind(project.id, task.id, k)}
            >
              {tKind(k)}
            </button>
          ))}
        </div>
        {task.kind === 'collaborative' && (
          <div className="stack sm" style={{ marginTop: 8 }}>
            {users
              .filter((u) => u.id !== task.ownerId)
              .map((u) => (
                <label className="check-option" key={u.id}>
                  <input
                    type="checkbox"
                    checked={task.collaboratorIds.includes(u.id)}
                    onChange={() => toggleCollaborator(project.id, task.id, u.id)}
                  />
                  <Avatar user={u} className="sm" />
                  <span>{u.name}</span>
                  {u.familiarity === 'novice' && (
                    <span className="badge neutral">{t('people.newToProcess')}</span>
                  )}
                </label>
              ))}
          </div>
        )}
      </div>

      <div className="row" style={{ gap: 8 }}>
        <div className="field" style={{ flex: 1 }}>
          <span className="label">{t('board.startComputed')}</span>
          <div className="mono">{task.startDate ?? t('common.none')}</div>
        </div>
        <div className="field" style={{ flex: 1 }}>
          <span className="label">{t('board.deadlineComputed')}</span>
          <div className="mono">{task.deadline ?? t('common.none')}</div>
        </div>
      </div>

      {/* R2: hint or reusable checklist, depending on guidance level */}
      {isNovice ? (
        <label className="field">
          <span className="label">{t('board.hint')}</span>
          <textarea
            rows={2}
            style={{ fontFamily: 'inherit', fontSize: 12.5 }}
            value={task.hint ?? ''}
            placeholder={t('board.hintPlaceholder')}
            onChange={(e) => updateTask(project.id, task.id, { hint: e.target.value })}
          />
        </label>
      ) : (
        (() => {
          const checks = checklistFor(task, template)
          if (checks.length === 0) return null
          return (
            <div className="note ok">
              <span className="note-icon">☑</span>
              <span>
                <strong>{t('board.reusedFrom')}</strong>
                <ul style={{ margin: '5px 0 0', paddingLeft: 18 }}>
                  {checks.map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                </ul>
              </span>
            </div>
          )
        })()
      )}

      {/* R4: dependencies */}
      <div className="field" data-guide="dependency-list">
        <span className="label" style={{ display: 'block', marginBottom: 4 }}>
          {t('board.waitsFor')}
        </span>

        {/*
          Error prevention. A task may only wait for something that does not
          already wait for it. The store refuses an invalid relationship after the
          click, but a checkbox that silently refuses to stay ticked reads as a
          bug — so options that would create a loop are disabled here and the
          reason is stated. This is the difference between an error message and
          error prevention, and it is the part of the design worth demonstrating.
        */}
        {hasUnavailable && (
          <div className="small muted" style={{ marginBottom: 5 }} data-guide="cycle-prevention">
            {t('prev.cycleBanner')}
          </div>
        )}

        <div className="dep-list">
          {allTasks
            .filter((r) => r.task.id !== task.id)
            .map(({ task: other, stage }) => {
              const alreadyWaiting = task.dependsOn.includes(other.id)
              // Only an option that is not yet chosen can be newly refused.
              const wouldLoop = !alreadyWaiting && wouldLoopFor(project.id, task.id, other.id)
              const unavailable = alreadyWaiting ? false : wouldLoop
              return (
                <label
                  className={`dep-option${unavailable ? ' unavailable' : ''}`}
                  key={other.id}
                  data-loop={unavailable ? '' : undefined}
                  title={unavailable ? t('prev.cycleItem') : undefined}
                >
                  <input
                    type="checkbox"
                    checked={alreadyWaiting}
                    disabled={unavailable}
                    onChange={() => toggleDependency(project.id, task.id, other.id)}
                  />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    {other.name}
                    <span className="muted small"> · {stage.name}</span>
                    {unavailable && <span className="why"> · {t('prev.cycleTitle')}</span>}
                  </span>
                </label>
              )
            })}
        </div>
      </div>

      {insight && (insight.blockedBy.length > 0 || insight.affects.length > 0) && (
        <div className="note info">
          <span className="note-icon">⇄</span>
          <span>
            {insight.blockedBy.length > 0 && (
              <>
                <strong>{t('board.cannotStart')}</strong> {t('board.waitingFor')}{' '}
                {insight.blockedBy
                  .map((id) => byId.get(id)?.task.name ?? t('common.none'))
                  .join(', ')}
                .
                <br />
              </>
            )}
            {insight.affects.length > 0 && (
              <>
                <strong>{t('board.affectsOne', { n: insight.affects.length })}</strong>{' '}
                {insight.affects
                  .map((id) => byId.get(id)?.task.name)
                  .filter(Boolean)
                  .join(', ')}
                .
              </>
            )}
          </span>
        </div>
      )}

      <label className="field">
        <span className="label">{t('board.blockerNote')}</span>
        <input
          type="text"
          value={task.blockerNote ?? ''}
          placeholder={t('board.blockerPlaceholder')}
          onChange={(e) => setTaskBlocker(project.id, task.id, e.target.value)}
        />
      </label>

      {task.evidence && (
        <div
          className="note neutral small"
          data-verbose=""
          style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}
        >
          <span className="note-icon">↩</span>
          <span>
            <strong>{t('board.whereFrom')}</strong> {task.evidence}
          </span>
        </div>
      )}

      <button
        className="btn danger sm"
        style={{ marginTop: 4 }}
        onClick={() => deleteTask(project.id, task.id)}
      >
        {t('board.deleteTask')}
      </button>
    </aside>
  )
}

/* ---------------- board ---------------- */

export function BoardView() {
  const project = useStore((s) => s.selectedProject())
  const users = useStore((s) => s.users)
  const isNovice = useStore((s) => s.effectiveFamiliarity()) === 'novice'
  const focusedTaskId = useStore((s) => s.focusedTaskId)
  const setFocusedTask = useStore((s) => s.setFocusedTask)
  const syncedTaskIds = useStore((s) => s.syncedTaskIds)
  const moveTask = useStore((s) => s.moveTask)
  const addStage = useStore((s) => s.addStage)
  const setProjectDeadline = useStore((s) => s.setProjectDeadline)
  const reschedule = useStore((s) => s.rescheduleProject)
  const { t, tFamiliarity } = useT()

  const [activeId, setActiveId] = useState<string | null>(null)

  const insights = useMemo(
    () => (project ? analyseDependencies(project.stages) : new Map()),
    [project],
  )

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  if (!project) return null

  const rows = flattenTasks(project.stages)
  const byId = new Map(rows.map((r) => [r.task.id, r]))

  const flagsFor = (task: Task): CardFlags => {
    const insight = insights.get(task.id)
    return {
      projectId: project.id,
      isNovice,
      isFocused: focusedTaskId === task.id,
      isSynced: syncedTaskIds.includes(task.id),
      insight,
      blockedByNames: (insight?.blockedBy ?? []).map(
        (id: string) => byId.get(id)?.task.name ?? t('common.none'),
      ),
      ownerName: users.find((u) => u.id === task.ownerId)?.name ?? t('people.unassigned'),
    }
  }

  const onDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id))

  const onDragEnd = (e: DragEndEvent) => {
    setActiveId(null)
    const { active, over } = e
    if (!over) return
    const activeTaskId = String(active.id)
    const overId = String(over.id)

    // Where is the pointer hovering — a stage column, or another task?
    let targetStage = project.stages.find((s) => s.id === overId)
    let targetIndex = targetStage ? targetStage.tasks.length : 0

    if (!targetStage) {
      targetStage = project.stages.find((s) => s.tasks.some((t) => t.id === overId))
      if (!targetStage) return
      targetIndex = targetStage.tasks.findIndex((t) => t.id === overId)
      const fromStage = project.stages.find((s) => s.tasks.some((t) => t.id === activeTaskId))
      // Dropping below itself within the same column should not shift the index.
      if (fromStage?.id === targetStage.id) {
        const fromIndex = fromStage.tasks.findIndex((t) => t.id === activeTaskId)
        if (fromIndex < targetIndex) targetIndex -= 1
      }
    }

    moveTask(project.id, activeTaskId, targetStage.id, Math.max(0, targetIndex))
  }

  const activeTask = activeId ? byId.get(activeId)?.task : undefined
  const focused = focusedTaskId ? byId.get(focusedTaskId)?.task : undefined

  // The template that generated this project, used as the fallback source of
  // reusable checklists for projects created before that field was stored.
  const projectTemplate = TEMPLATES.find((t) => t.id === project.templateId)

  const totalTasks = rows.length
  const doneTasks = rows.filter((r) => r.task.status === 'done').length
  const blockedTasks = rows.filter((r) => r.task.status === 'blocked').length
  const overdueTasks = [...insights.values()].filter((i) => i.isOverdue).length

  return (
    <>
      {/*
        One header block, not four. The title, the progress counts, the deadline
        control and the two actions used to be a page head, a second row of chips
        and an alert; they are all the same thing to the user — "where does this
        board stand and what can I change" — so they share a single strip.
      */}
      <div className="page-head">
        <div style={{ flex: 1, minWidth: 240 }}>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            {project.name}
            <button
              className="icon-btn"
              title={t('board.renameTitle')}
              onClick={() => {
                const next = window.prompt(t('board.renamePrompt'), project.name)
                if (next && next.trim()) useStore.getState().renameProject(project.id, next.trim())
              }}
            >
              ✎
            </button>
          </h1>
          <div className="row" style={{ gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
            <span className="chip">
              {t('board.doneCount', { done: doneTasks, total: totalTasks })}
            </span>
            <span className="chip">
              {t('board.collabCount', {
                n: rows.filter((r) => r.task.kind === 'collaborative').length,
              })}
            </span>
            {blockedTasks > 0 && (
              <span className="badge danger">{t('board.blockedCount', { n: blockedTasks })}</span>
            )}
            {overdueTasks > 0 && (
              <span className="badge warn">{t('board.overdueCount', { n: overdueTasks })}</span>
            )}
          </div>
        </div>

        <div className="row" style={{ gap: 8 }}>
          <ReqTag n={3} label={t('board.reqLabel')} />
          <input
            type="date"
            value={project.finalDeadline}
            onChange={(e) => setProjectDeadline(project.id, e.target.value)}
            style={{ width: 'auto' }}
            title={t('board.finalDeadlineTitle')}
          />
          <button
            className="btn sm"
            onClick={() => reschedule(project.id)}
            title={t('board.recomputeTitle')}
          >
            {t('board.recompute')}
          </button>
          <button className="btn sm" onClick={() => addStage(project.id)} title={t('board.addStageTitle')}>
            {t('board.addStage')}
          </button>
        </div>
      </div>

      {project.deadlineInferred && (
        <div className="note warn" style={{ marginBottom: 10 }} data-verbose="">
          <span className="note-icon">!</span>
          <span>{t('board.deadlineAssumedBody', { date: project.finalDeadline })}</span>
        </div>
      )}

      <div className="split">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          onDragCancel={() => setActiveId(null)}
        >
          <div className="board" data-guide="board-columns">
            {project.stages.map((stage, i) => (
              <StageColumn
                key={stage.id}
                stage={stage}
                index={i}
                stageCount={project.stages.length}
                project={project}
                flagsFor={flagsFor}
                onFocus={setFocusedTask}
              />
            ))}
            <button
              className="btn ghost"
              style={{ flex: '0 0 120px', height: 60 }}
              onClick={() => addStage(project.id, project.stages[project.stages.length - 1]?.id)}
            >
              + Add stage
            </button>
          </div>

          <DragOverlay>
            {activeTask ? (
              <div className="task-card" style={{ width: 290 }}>
                <TaskCardBody task={activeTask} {...flagsFor(activeTask)} />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>

        {focused ? (
          <TaskDetail project={project} task={focused} template={projectTemplate} />
        ) : (
          <aside className="card pad task-detail">
            <h3 className="section-title">{t('board.projectDetail')}</h3>
            <div className="stack sm">
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <span className="muted small">{t('board.templateUsed')}</span>
                <span className="small">
                  {project.templateReused ? t('board.templateReused') : t('board.templateGenerated')}
                </span>
              </div>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <span className="muted small">{t('projects.guidance')}</span>
                <span className="badge accent">{tFamiliarity(project.familiarity)}</span>
              </div>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <span className="muted small">{t('board.members')}</span>
                <AvatarStack ids={project.members} max={5} />
              </div>
            </div>

            <h3 className="section-title" style={{ marginTop: 16 }} data-verbose="">
              {t('board.sourceHeading')}
            </h3>
            <pre
              className="mono small"
              data-verbose=""
              style={{
                whiteSpace: 'pre-wrap',
                background: 'var(--surface-2)',
                padding: 10,
                borderRadius: 7,
                maxHeight: 240,
                overflowY: 'auto',
                margin: 0,
              }}
            >
              {project.sourceText}
            </pre>
            <div className="small muted" data-verbose="" style={{ marginTop: 8 }}>
              {t('board.sourceNote')}
            </div>
          </aside>
        )}
      </div>
    </>
  )
}
