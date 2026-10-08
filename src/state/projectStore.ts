/**
 * EventFlow application store.
 *
 * Front-end only: state lives in memory and is mirrored to localStorage so a
 * demo survives a page refresh. There is no server. "Collaborators" are
 * simulated locally (see `simulateRemoteActivity`) so the R4 progress-sync
 * behaviour can be demonstrated end to end.
 *
 * Architecture note: this mirrors the front-end-only, single-store approach
 * used by the closest matching reference application found during research
 * (kanriapp/kanri stores everything in one local JSON file, no account, no
 * backend). The requirement model itself follows claude-task-master's
 * `tasks[].dependencies` shape, which is what `Task.dependsOn` implements.
 */

import { create } from 'zustand'
import type {
  ActivityEntry,
  Familiarity,
  Project,
  Stage,
  Task,
  TaskStatus,
  User,
} from '../domain/types'
import {
  addDaysISO,
  generateDraft,
  isoToday,
  scheduleBackwards,
  TEMPLATES,
} from '../lib/domainEngine'
import type { SourceAnalysis } from '../lib/sourceAnalyser'
import { isRealIsoDate } from '../lib/sourceAnalyser'
import { scenarioById } from '../domain/scenarios'
import type { Lang } from '../i18n/labels'
import { seedState } from '../lib/seed'

const STORAGE_KEY = 'eventflow.state.v1'

export type ViewId = 'projects' | 'draft' | 'board' | 'calendar' | 'flow'

/**
 * What is written to localStorage.
 *
 * This is an explicit whitelist rather than "the whole store", so a new field is
 * only persisted when it is deliberately added here. `lang` was missing at first,
 * which meant the language choice silently reset on every reload.
 */
interface PersistedShape {
  users: User[]
  projects: Project[]
  activity: ActivityEntry[]
  currentUserId: string
  lang: Lang
}

export interface AppState extends PersistedShape {
  selectedProjectId: string | null
  view: ViewId
  /** R2: global override so the guidance difference is demonstrable in one click. */
  guidanceOverride: Familiarity | null
  /**
   * Compact hides the explanatory copy, requirement tags and legends, leaving
   * just the working interface. Detailed brings them back for the report and for
   * anyone seeing the prototype for the first time. Defaults to compact.
   */
  compact: boolean
  /**
   * Interface language. The prototype is demonstrated in Chinese and reported in
   * English, so this is a switch rather than a rewrite: only presentation text
   * changes, never the stored domain values.
   */
  lang: Lang
  /**
   * Text density.
   *
   * `terse` (the default) shows only what a decision needs: names, owners, dates,
   * statuses, and the two guidance mechanisms R2 depends on. `full` adds the
   * explanatory layer — on-screen hints, legends, panel descriptions and the
   * source text — which is useful for a first look and for screenshots, but gets
   * in the way of working. Measured on the board view, the full layer was about
   * 700 characters of repeated helper text.
   */
  density: 'terse' | 'full'
  /**
   * CW1 user group currently being demonstrated. Selecting one switches the
   * signed-in participant, their role, the guidance level and the project, so the
   * prototype visibly adapts per group instead of needing four separate mock-ups.
   */
  scenarioId: string | null
  /** Task id currently focused by the board, calendar and dependency panels. */
  focusedTaskId: string | null
  /** Transient banner message. */
  toast: string | null
  /** Ids of tasks a simulated collaborator has just touched, for the sync flash. */
  syncedTaskIds: string[]
  /**
   * Raised when the browser refuses to store the demo data. Sticky rather than a
   * toast, because a transient message about losing your work is easy to miss and
   * the condition persists for the whole session.
   */
  storageFailed: boolean

  /* ---- selectors ---- */
  currentUser: () => User
  selectedProject: () => Project | null
  effectiveFamiliarity: () => Familiarity

  /* ---- project lifecycle ---- */
  createProjectFromDraft: (input: {
    name: string
    sourceText: string
    sourceKind: Project['sourceKind']
    deadline: string
    deadlineInferred: boolean
    scale: Project['scale']
    familiarity: Familiarity
    templateId: string
    templateReused: boolean
    owners?: Record<string, string>
    analysis: SourceAnalysis
  }) => string
  deleteProject: (projectId: string) => void
  selectProject: (projectId: string | null) => void
  renameProject: (projectId: string, name: string) => void
  setProjectDeadline: (projectId: string, deadline: string) => void
  setView: (view: ViewId) => void
  setGuidanceOverride: (f: Familiarity | null) => void
  setCompact: (compact: boolean) => void
  setLang: (lang: Lang) => void
  setDensity: (density: 'terse' | 'full') => void
  /** Proactive check: would adding this dependency create a loop? */
  wouldLoop: (projectId: string, taskId: string, dependsOnId: string) => boolean
  /** Proactive check: is the given deadline already in the past? */
  isDeadlineInPast: (iso: string) => boolean
  dismissStorageWarning: () => void
  /** Apply a CW1 user-group scenario: participant, role, guidance and project. */
  applyScenario: (scenarioId: string) => void
  setCurrentUser: (userId: string) => void
  setFocusedTask: (taskId: string | null) => void
  clearToast: () => void

  /* ---- R1: editable workflow structure ---- */
  renameStage: (projectId: string, stageId: string, name: string) => void
  addStage: (projectId: string, afterStageId?: string) => void
  deleteStage: (projectId: string, stageId: string) => void
  moveStage: (projectId: string, stageId: string, direction: -1 | 1) => void

  addTask: (projectId: string, stageId: string, afterTaskId?: string) => void
  updateTask: (projectId: string, taskId: string, patch: Partial<Task>) => void
  deleteTask: (projectId: string, taskId: string) => void
  moveTask: (projectId: string, taskId: string, toStageId: string, toIndex: number) => void

  /* ---- R3: assignment ---- */
  setTaskOwner: (projectId: string, taskId: string, ownerId: string) => void
  setTaskKind: (projectId: string, taskId: string, kind: Task['kind']) => void
  toggleCollaborator: (projectId: string, taskId: string, userId: string) => void

  /* ---- R4: progress ---- */
  setTaskStatus: (projectId: string, taskId: string, status: TaskStatus) => void
  setTaskBlocker: (projectId: string, taskId: string, note: string) => void
  toggleDependency: (projectId: string, taskId: string, dependsOnId: string) => void
  rescheduleProject: (projectId: string, deadline?: string) => void
  simulateRemoteActivity: () => void
  resetDemo: () => void
}

function uid(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`
}

function loadPersisted(): PersistedShape | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as PersistedShape
    if (!parsed.projects || !parsed.users || parsed.users.length === 0) return null
    // Guard against a stale schema from an older build.
    if (!parsed.projects.every((p) => Array.isArray(p.stages))) return null
    return parsed
  } catch {
    return null
  }
}

/**
 * Mirror the persisted slice to localStorage.
 *
 * Returns false when the write failed. That result is NOT swallowed: private
 * browsing, a full disk or blocked site data all make `setItem` throw, and the
 * user was previously told nothing while their edits silently survived only until
 * the next reload. The caller surfaces a persistent warning instead.
 */
function persist(state: AppState): boolean {
  try {
    const shape: PersistedShape = {
      users: state.users,
      projects: state.projects,
      activity: state.activity,
      currentUserId: state.currentUserId,
      lang: state.lang,
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(shape))
    return true
  } catch {
    return false
  }
}

/**
 * Persist and record the outcome.
 *
 * Every mutation goes through here rather than calling `persist` directly, so a
 * refused write always raises the banner instead of being silently dropped at one
 * of two dozen call sites.
 */
function commit(next: AppState): AppState {
  const ok = persist(next)
  if (!ok && !next.storageFailed) return { ...next, storageFailed: true }
  return next
}

/** Immutably replace the task matched by `taskId`, wherever it lives. */
function mapTask(
  projects: Project[],
  projectId: string,
  taskId: string,
  fn: (task: Task, stage: Stage) => Task,
): Project[] {
  return projects.map((p) => {
    if (p.id !== projectId) return p
    return {
      ...p,
      updatedAt: isoToday(),
      stages: p.stages.map((stage) => ({
        ...stage,
        tasks: stage.tasks.map((t) => (t.id === taskId ? fn(t, stage) : t)),
      })),
    }
  })
}

/**
 * Build an activity record from a translation key rather than rendered prose, so
 * the feed re-renders correctly when the interface language changes.
 */
function activityEntry(
  projectId: string,
  actorId: string,
  summaryKey: string,
  kind: ActivityEntry['kind'],
  summaryParams?: Record<string, string | number>,
): ActivityEntry {
  return {
    id: uid('act'),
    projectId,
    at: new Date().toISOString(),
    actorId,
    summaryKey,
    summaryParams,
    kind,
  }
}

/** Landing view decided by the pre-bundle bootstrap in index.html. */
interface BootHint {
  view?: ViewId
  selectedProjectId?: string | null
}

declare global {
  interface Window {
    __EVENTFLOW_BOOT__?: BootHint
  }
}

const VALID_VIEWS: ViewId[] = ['projects', 'draft', 'board', 'calendar', 'flow']

/**
 * Deep links: `?view=flow` opens a specific view and `?project=<id>` selects a
 * project. Useful for demoing one screen, for bookmarking, and for capturing
 * screenshots during verification.
 */
function readQuery(): { view: ViewId | null; project: string | null } {
  if (typeof window === 'undefined') return { view: null, project: null }
  const params = new URLSearchParams(window.location.search)
  const rawView = params.get('view')
  const view = rawView && (VALID_VIEWS as string[]).includes(rawView) ? (rawView as ViewId) : null
  return { view, project: params.get('project') }
}

const initial = (() => {
  const persisted = loadPersisted()
  const base = persisted ?? { ...seedState(), currentUserId: 'u_jiawen', lang: 'zh' as Lang }
  const boot: BootHint = (typeof window !== 'undefined' && window.__EVENTFLOW_BOOT__) || {}
  const query = readQuery()

  // An explicit ?view= wins over the remembered one; otherwise fall back to the
  // bootstrap hint that index.html computed from localStorage.
  const view: ViewId = query.view ?? (boot.view as ViewId | undefined) ?? 'projects'

  // A fresh visitor lands on the project list with nothing selected, so the
  // dashboard is what they see first. A returning session, or a deep link,
  // lands on the requested view for the requested project.
  const wantsProject = view !== 'projects' && view !== 'draft'
  const explicit = query.project ?? boot.selectedProjectId ?? null
  const explicitValid = explicit && base.projects.some((p) => p.id === explicit) ? explicit : null
  const selectedProjectId = wantsProject ? (explicitValid ?? base.projects[0]?.id ?? null) : null

  return { ...base, view, selectedProjectId }
})()

export const useStore = create<AppState>((set, get) => ({
  users: initial.users,
  projects: initial.projects,
  activity: initial.activity,
  currentUserId: initial.currentUserId,
  selectedProjectId: initial.selectedProjectId,
  view: initial.view,
  guidanceOverride: null,
  compact: true,
  lang: 'zh',
  density: 'terse',
  scenarioId: null,
  focusedTaskId: null,
  toast: null,
  syncedTaskIds: [],
  storageFailed: false,

  /* ---------------- selectors ---------------- */

  currentUser: () => {
    const s = get()
    return s.users.find((u) => u.id === s.currentUserId) ?? s.users[0]
  },

  selectedProject: () => {
    const s = get()
    return s.projects.find((p) => p.id === s.selectedProjectId) ?? null
  },

  /**
   * NOTE: selectors on this store must return a *stable reference* for identical
   * state, or React's useSyncExternalStore will loop ("Maximum update depth
   * exceeded"). `currentUser`/`selectedProject` return objects that only change
   * when state changes, and `effectiveFamiliarity` returns a string.
   *
   * Anything that derives a new collection (such as the dependency insight map)
   * must be computed in the component with `useMemo` over the slice it depends
   * on — not exposed as a store selector.
   */
  effectiveFamiliarity: () => {
    const s = get()
    if (s.guidanceOverride) return s.guidanceOverride
    const project = s.projects.find((p) => p.id === s.selectedProjectId)
    if (project) return project.familiarity
    return s.users.find((u) => u.id === s.currentUserId)?.familiarity ?? 'novice'
  },

  /* ---------------- project lifecycle ---------------- */

  createProjectFromDraft: (input) => {
    const state = get()
    const ownerId = state.currentUserId
    const matches = TEMPLATES.find((t) => t.id === input.templateId)
    const template = matches ?? TEMPLATES[TEMPLATES.length - 1]

    const draft = generateDraft({
      analysis: { ...input.analysis, deadline: input.deadline },
      sourceText: input.sourceText,
      projectName: input.name,
      template,
      deadline: input.deadline,
      scale: input.scale,
      members: state.users,
      ownerId,
      familiarity: input.familiarity,
      // R2: the expert path is offered the reusable checklist from history.
      applyReusableChecklist: input.familiarity === 'expert',
      lang: state.lang,
    })

    const stages: Stage[] = draft.stages.map((stage) => ({
      ...stage,
      tasks: stage.tasks.map((task) => {
        const owner = input.owners?.[stage.name]
        if (!owner) return task
        const collaborators = state.users
          .filter((u) => u.id !== owner)
          .slice(0, task.kind === 'collaborative' ? 2 : 0)
          .map((u) => u.id)
        return { ...task, ownerId: owner, collaboratorIds: collaborators }
      }),
    }))

    const project: Project = {
      id: uid('p'),
      name: input.name,
      sourceText: input.sourceText,
      sourceKind: input.sourceKind,
      finalDeadline: input.deadline,
      scale: input.scale,
      deadlineInferred: input.deadlineInferred,
      stages,
      members: [ownerId],
      familiarity: input.familiarity,
      createdAt: isoToday(),
      updatedAt: isoToday(),
      templateId: template.id,
      templateReused: input.templateReused,
    }

    const entries: ActivityEntry[] = [
      activityEntry(
        project.id,
        ownerId,
        input.templateReused ? 'log.draftFromTemplate' : 'log.draftFromSource',
        'draft',
        input.templateReused
          ? { template: template.nameKey }
          : { stages: stages.length, source: input.sourceKind },
      ),
    ]

    set((s) => {
      const next: AppState = {
        ...s,
        projects: [project, ...s.projects],
        activity: [...entries, ...s.activity],
        selectedProjectId: project.id,
        view: 'board',
        toast: `Draft created — ${stages.length} stages, ${stages.flatMap((x) => x.tasks).length} tasks. Everything is editable.`,
      }
      return commit(next)
    })
    return project.id
  },

  deleteProject: (projectId) => {
    set((s) => {
      const next: AppState = {
        ...s,
        projects: s.projects.filter((p) => p.id !== projectId),
        activity: s.activity.filter((a) => a.projectId !== projectId),
        selectedProjectId:
          s.selectedProjectId === projectId
            ? (s.projects.find((p) => p.id !== projectId)?.id ?? null)
            : s.selectedProjectId,
        toast: 'Project deleted',
      }
      return commit(next)
    })
  },

  selectProject: (projectId) =>
    set((s) => ({ ...s, selectedProjectId: projectId, focusedTaskId: null })),

  renameProject: (projectId, name) =>
    set((s) => {
      const next: AppState = {
        ...s,
        projects: s.projects.map((p) =>
          p.id === projectId ? { ...p, name, updatedAt: isoToday() } : p,
        ),
      }
      return commit(next)
    }),

  setProjectDeadline: (projectId, deadline) => {
    const state = get()

    // Refuse an impossible date outright. `new Date('2026-02-31')` rolls over to
    // 3 March rather than failing, so without this a typed-in "2026-02-31" would
    // silently become a different deadline.
    if (!isRealIsoDate(deadline)) {
      set((s) => ({
        ...s,
        toast: `这不是一个真实存在的日期：「${deadline}」在日历上不存在。`,
      }))
      return
    }

    // A deadline in the past would schedule every task into the past. The UI
    // warns about this before the user commits; this is the second line of
    // defence for a value that arrives some other way.
    const inPast = deadline < isoToday()

    // A moved deadline invalidates every computed date, so reschedule.
    const projects = state.projects.map((p) => {
      if (p.id !== projectId) return p
      return {
        ...p,
        finalDeadline: deadline,
        deadlineInferred: false,
        stages: scheduleBackwards(p.stages, deadline),
        updatedAt: isoToday(),
      }
    })
    set((s) => {
      const next: AppState = {
        ...s,
        projects,
        activity: [
          activityEntry(
            projectId,
            s.currentUserId,
            'log.deadlineMoved',
            'edit',
            { date: deadline },
          ),
          ...s.activity,
        ],
        toast: inPast
          ? `这个截止日期已经过去了（${deadline}）：从它往前倒推，所有任务都会落在过去。`
          : `Deadline moved to ${deadline} — task dates recomputed`,
      }
      return commit(next)
    })
  },

  setView: (view) => set((s) => ({ ...s, view })),
  setGuidanceOverride: (guidanceOverride) => {
    set((s) => ({ ...s, guidanceOverride }))
    const label =
      guidanceOverride === 'novice'
        ? 'Showing novice guidance: step hints and process examples'
        : guidanceOverride === 'expert'
          ? 'Showing expert mode: reusable checklists, hints hidden'
          : 'Following the project’s own familiarity setting'
    set((s) => ({ ...s, toast: label }))
  },
  setCompact: (compact) => set((s) => ({ ...s, compact })),

  setLang: (lang) => {
    const next = { ...get(), lang }
    set(commit(next))
  },

  setDensity: (density) => set((s) => ({ ...s, density })),

  /**
   * Proactive loop check, used by the dependency picker to disable an option and
   * say why. The store keeps an equivalent guard inside `toggleDependency`, but
   * that can only refuse after the click: showing the reason *before* the user
   * commits is the error-prevention half of the design.
   */
  wouldLoop: (projectId, taskId, dependsOnId) => {
    const project = get().projects.find((p) => p.id === projectId)
    if (!project) return false
    if (taskId === dependsOnId) return true
    return wouldCreateCycle(project.stages, taskId, dependsOnId)
  },

  isDeadlineInPast: (iso) => {
    if (!isRealIsoDate(iso)) return false
    return iso < isoToday()
  },

  dismissStorageWarning: () => set((s) => ({ ...s, storageFailed: false })),

  /**
   * Apply a CW1 user-group scenario.
   *
   * This is the mechanism behind "reflect the needs of the different user
   * groups": one prototype, four configurations. Switching group changes the
   * signed-in participant (and therefore the role), the familiarity level that
   * drives R2 guidance, and which project is open.
   */
  applyScenario: (scenarioId) => {
    const scenario = scenarioById(scenarioId)
    if (!scenario) return
    set((s) => {
      const projectExists = s.projects.some((p) => p.id === scenario.projectId)
      const next: AppState = {
        ...s,
        scenarioId,
        currentUserId: scenario.userId,
        guidanceOverride: scenario.familiarity,
        selectedProjectId: projectExists ? scenario.projectId : s.selectedProjectId,
        focusedTaskId: null,
        // `scenario.group` is a Bilingual `{ zh, en }`, not a string. Interpolating
        // the object rendered the literal text "[object Object]" in the toast, so
        // the label has to be picked out by language first.
        toast: `${scenario.group[s.lang]} — guidance ${scenario.familiarity}, role ${scenario.role}`,
      }
      return commit(next)
    })
  },

  setCurrentUser: (currentUserId) =>
    set((s) => {
      const next: AppState = { ...s, currentUserId }
      return commit(next)
    }),
  setFocusedTask: (focusedTaskId) => set((s) => ({ ...s, focusedTaskId })),
  clearToast: () => set((s) => ({ ...s, toast: null })),

  /* ---------------- R1: structure editing ---------------- */

  renameStage: (projectId, stageId, name) =>
    set((s) => {
      const next: AppState = {
        ...s,
        projects: s.projects.map((p) =>
          p.id === projectId
            ? {
                ...p,
                updatedAt: isoToday(),
                stages: p.stages.map((st) => (st.id === stageId ? { ...st, name } : st)),
              }
            : p,
        ),
      }
      return commit(next)
    }),

  addStage: (projectId, afterStageId) =>
    set((s) => {
      const stage: Stage = { id: uid('stage'), name: 'New stage', tasks: [] }
      const next: AppState = {
        ...s,
        projects: s.projects.map((p) => {
          if (p.id !== projectId) return p
          const idx = afterStageId ? p.stages.findIndex((x) => x.id === afterStageId) : -1
          const stages = [...p.stages]
          stages.splice(idx + 1, 0, stage)
          return { ...p, stages, updatedAt: isoToday() }
        }),
        activity: [activityEntry(projectId, s.currentUserId, 'log.stageAdded', 'edit'), ...s.activity],
      }
      return commit(next)
    }),

  deleteStage: (projectId, stageId) =>
    set((s) => {
      const next: AppState = {
        ...s,
        projects: s.projects.map((p) =>
          p.id === projectId
            ? { ...p, stages: p.stages.filter((st) => st.id !== stageId), updatedAt: isoToday() }
            : p,
        ),
        activity: [
          activityEntry(projectId, s.currentUserId, 'log.stageDeleted', 'edit'),
          ...s.activity,
        ],
        toast: 'Stage deleted',
      }
      return commit(next)
    }),

  moveStage: (projectId, stageId, direction) =>
    set((s) => {
      const next: AppState = {
        ...s,
        projects: s.projects.map((p) => {
          if (p.id !== projectId) return p
          const idx = p.stages.findIndex((st) => st.id === stageId)
          const target = idx + direction
          if (idx < 0 || target < 0 || target >= p.stages.length) return p
          const stages = [...p.stages]
          const [moved] = stages.splice(idx, 1)
          stages.splice(target, 0, moved)
          return { ...p, stages, updatedAt: isoToday() }
        }),
      }
      return commit(next)
    }),

  addTask: (projectId, stageId, afterTaskId) =>
    set((s) => {
      const project = s.projects.find((p) => p.id === projectId)
      const ownerId = project?.stages
        .flatMap((st) => st.tasks)
        .find((t) => t.id === afterTaskId)?.ownerId ?? s.currentUserId
      const task: Task = {
        id: uid('task'),
        name: 'New task',
        kind: 'individual',
        ownerId,
        collaboratorIds: [],
        estimateDays: 1,
        dependsOn: [],
        status: 'todo',
      }
      const projects = s.projects.map((p) => {
        if (p.id !== projectId) return p
        return {
          ...p,
          updatedAt: isoToday(),
          stages: p.stages.map((st) => {
            if (st.id !== stageId) return st
            const tasks = [...st.tasks]
            const idx = afterTaskId ? tasks.findIndex((t) => t.id === afterTaskId) : tasks.length - 1
            tasks.splice(idx + 1, 0, task)
            return { ...st, tasks }
          }),
        }
      })
      const next: AppState = {
        ...s,
        projects,
        activity: [activityEntry(projectId, s.currentUserId, 'log.taskAdded', 'edit'), ...s.activity],
      }
      return commit(next)
    }),

  updateTask: (projectId, taskId, patch) =>
    set((s) => {
      const next: AppState = {
        ...s,
        projects: mapTask(s.projects, projectId, taskId, (t) => {
          const merged = { ...t, ...patch }
          // A changed estimate invalidates the schedule, so recompute it.
          return merged
        }),
      }
      const project = next.projects.find((p) => p.id === projectId)
      if (project && (patch.estimateDays !== undefined || patch.dependsOn !== undefined)) {
        next.projects = next.projects.map((p) =>
          p.id === projectId ? { ...p, stages: scheduleBackwards(p.stages, p.finalDeadline) } : p,
        )
      }
      return commit(next)
    }),

  deleteTask: (projectId, taskId) =>
    set((s) => {
      // Also remove the task from any dependency list that references it.
      const projects = s.projects.map((p) => {
        if (p.id !== projectId) return p
        const stages = p.stages.map((st) => ({
          ...st,
          tasks: st.tasks
            .filter((t) => t.id !== taskId)
            .map((t) => ({ ...t, dependsOn: t.dependsOn.filter((d) => d !== taskId) })),
        }))
        return { ...p, stages, updatedAt: isoToday() }
      })
      const next: AppState = {
        ...s,
        projects,
        activity: [
          activityEntry(projectId, s.currentUserId, 'log.taskDeleted', 'edit'),
          ...s.activity,
        ],
        focusedTaskId: s.focusedTaskId === taskId ? null : s.focusedTaskId,
        toast: 'Task deleted',
      }
      return commit(next)
    }),

  moveTask: (projectId, taskId, toStageId, toIndex) =>
    set((s) => {
      const projects = s.projects.map((p) => {
        if (p.id !== projectId) return p
        let moving: Task | undefined
        const stripped = p.stages.map((st) => {
          const found = st.tasks.find((t) => t.id === taskId)
          if (found) moving = found
          return { ...st, tasks: st.tasks.filter((t) => t.id !== taskId) }
        })
        if (!moving) return p
        const stages = stripped.map((st) => {
          if (st.id !== toStageId) return st
          const tasks = [...st.tasks]
          tasks.splice(Math.max(0, Math.min(toIndex, tasks.length)), 0, moving!)
          return { ...st, tasks }
        })
        return { ...p, stages, updatedAt: isoToday() }
      })
      const next: AppState = {
        ...s,
        projects,
        activity: [
          activityEntry(projectId, s.currentUserId, 'log.reordered', 'edit'),
          ...s.activity,
        ],
      }
      return commit(next)
    }),

  /* ---------------- R3: assignment ---------------- */

  setTaskOwner: (projectId, taskId, ownerId) =>
    set((s) => {
      const owner = s.users.find((u) => u.id === ownerId)
      const projects = mapTask(s.projects, projectId, taskId, (t) => ({
        ...t,
        ownerId,
        // The new owner cannot also be listed as their own collaborator.
        collaboratorIds: t.collaboratorIds.filter((c) => c !== ownerId),
      }))
      const next: AppState = {
        ...s,
        projects,
        activity: [
          activityEntry(projectId, s.currentUserId, 'log.assigned', 'assign', {
            name: owner?.name ?? '',
          }),
          ...s.activity,
        ],
        toast: `Owner set to ${owner?.name ?? 'member'}`,
      }
      return commit(next)
    }),

  setTaskKind: (projectId, taskId, kind) =>
    set((s) => {
      const others = s.users.filter((u) => u.id !== s.currentUserId)
      const projects = mapTask(s.projects, projectId, taskId, (t) => ({
        ...t,
        kind,
        collaboratorIds:
          kind === 'collaborative'
            ? t.collaboratorIds.length > 0
              ? t.collaboratorIds
              : others.slice(0, 2).map((u) => u.id)
            : [],
      }))
      const next: AppState = {
        ...s,
        projects,
        activity: [
          activityEntry(
            projectId,
            s.currentUserId,
            kind === 'collaborative' ? 'log.becameCollaborative' : 'log.becameIndividual',
            'edit',
          ),
          ...s.activity,
        ],
      }
      return commit(next)
    }),

  toggleCollaborator: (projectId, taskId, userId) =>
    set((s) => {
      const member = s.users.find((u) => u.id === userId)
      const projects = mapTask(s.projects, projectId, taskId, (t) => {
        const has = t.collaboratorIds.includes(userId)
        return {
          ...t,
          kind: 'collaborative',
          collaboratorIds: has
            ? t.collaboratorIds.filter((c) => c !== userId)
            : [...t.collaboratorIds, userId],
        }
      })
      const next: AppState = {
        ...s,
        projects,
        activity: [
          activityEntry(projectId, s.currentUserId, 'log.collabUpdated', 'assign', {
            name: member?.name ?? '',
          }),
          ...s.activity,
        ],
      }
      return commit(next)
    }),

  /* ---------------- R4: progress ---------------- */

  setTaskStatus: (projectId, taskId, status) =>
    set((s) => {
      const projects = mapTask(s.projects, projectId, taskId, (t) => ({
        ...t,
        status,
        blockerNote: status === 'blocked' ? t.blockerNote : undefined,
      }))
      const project = projects.find((p) => p.id === projectId)
      const task = project?.stages.flatMap((st) => st.tasks).find((t) => t.id === taskId)
      const next: AppState = {
        ...s,
        projects,
        activity: [
          activityEntry(
            projectId,
            s.currentUserId,
            'log.statusSet',
            status === 'blocked' ? 'block' : 'status',
            { task: task?.name ?? '', status },
          ),
          ...s.activity,
        ],
      }
      return commit(next)
    }),

  setTaskBlocker: (projectId, taskId, note) =>
    set((s) => {
      const projects = mapTask(s.projects, projectId, taskId, (t) => ({
        ...t,
        blockerNote: note,
        status: note ? 'blocked' : t.status === 'blocked' ? 'in_progress' : t.status,
      }))
      const next: AppState = {
        ...s,
        projects,
        activity: [
          activityEntry(projectId, s.currentUserId, note ? 'log.blockerReported' : 'log.blockerCleared', 'block', {
            note: note ?? '',
          }),
          ...s.activity,
        ],
        toast: note ? 'Blocker reported — the coordinator has been notified' : 'Blocker cleared',
      }
      return commit(next)
    }),

  toggleDependency: (projectId, taskId, dependsOnId) => {
    if (taskId === dependsOnId) return
    set((s) => {
      const project = s.projects.find((p) => p.id === projectId)
      if (!project) return s
      const tasks = project.stages.flatMap((st) => st.tasks)
      const has = tasks.find((t) => t.id === taskId)?.dependsOn.includes(dependsOnId) ?? false

      // Reject an edge that would create a cycle before it reaches the store.
      if (!has && wouldCreateCycle(project.stages, taskId, dependsOnId)) {
        return { ...s, toast: '这条等待关系会形成循环，所以没有添加。' }
      }

      const projects = mapTask(s.projects, projectId, taskId, (t) => ({
        ...t,
        dependsOn: has
          ? t.dependsOn.filter((d) => d !== dependsOnId)
          : [...t.dependsOn, dependsOnId],
      }))
      const withSchedule = projects.map((p) =>
        p.id === projectId ? { ...p, stages: scheduleBackwards(p.stages, p.finalDeadline) } : p,
      )
      const next: AppState = {
        ...s,
        projects: withSchedule,
        activity: [
          activityEntry(
            projectId,
            s.currentUserId,
            has ? 'log.depRemoved' : 'log.depAdded',
            'edit',
          ),
          ...s.activity,
        ],
        toast: has
          ? 'Waiting relationship removed — dates recomputed'
          : 'Waiting relationship added — dates recomputed',
      }
      return commit(next)
    })
  },

  rescheduleProject: (projectId, deadline) =>
    set((s) => {
      const projects = s.projects.map((p) => {
        if (p.id !== projectId) return p
        const finalDeadline = deadline ?? p.finalDeadline
        return {
          ...p,
          finalDeadline,
          stages: scheduleBackwards(p.stages, finalDeadline),
          updatedAt: isoToday(),
        }
      })
      const next: AppState = {
        ...s,
        projects,
        activity: [
          activityEntry(projectId, s.currentUserId, 'log.rescheduled', 'edit'),
          ...s.activity,
        ],
        toast: 'Schedule recomputed from the deadline',
      }
      return commit(next)
    }),

  /**
   * R4 demonstration: pretend another group member just acted. Picks one open
   * task, advances it, and writes an activity entry, so a second viewer can see
   * progress arrive without a backend.
   */
  simulateRemoteActivity: () => {
    const state = get()
    const project = state.projects.find((p) => p.id === state.selectedProjectId)
    if (!project) return
    const candidates = project.stages
      .flatMap((st) => st.tasks)
      .filter((t) => t.status !== 'done' && t.ownerId !== state.currentUserId)
    if (candidates.length === 0) {
      set((s) => ({ ...s, toast: 'No open tasks owned by other members right now' }))
      return
    }
    const pick = candidates[Math.floor(Math.random() * candidates.length)]
    const order: TaskStatus[] = ['todo', 'waiting', 'in_progress', 'done']
    const currentIdx = order.indexOf(pick.status === 'blocked' ? 'waiting' : pick.status)
    const nextStatus = order[Math.min(currentIdx + 1, order.length - 1)]
    const actor = state.users.find((u) => u.id === pick.ownerId)

    const projects = mapTask(state.projects, project.id, pick.id, (t) => ({
      ...t,
      status: nextStatus,
      blockerNote: undefined,
    }))

    set((s) => {
      const next: AppState = {
        ...s,
        projects,
        activity: [
          activityEntry(project.id, pick.ownerId, 'log.memberStatus', 'status', {
            name: actor?.name ?? '',
            task: pick.name,
            status: nextStatus,
          }),
          ...s.activity,
        ],
        syncedTaskIds: [pick.id],
        toast: `Progress synced from ${actor?.name ?? 'a member'}: "${pick.name}" → ${nextStatus}`,
      }
      return commit(next)
    })
    window.setTimeout(() => set((s) => ({ ...s, syncedTaskIds: [] })), 2600)
  },

  resetDemo: () => {
    const fresh = { ...seedState(), currentUserId: 'u_jiawen' }
    const next: AppState = {
      ...get(),
      ...fresh,
      selectedProjectId: fresh.projects[0]?.id ?? null,
      view: 'projects',
      guidanceOverride: null,
      focusedTaskId: null,
      syncedTaskIds: [],
      // The seeded demo projects are generated in Chinese, so resetting also
      // returns the interface to Chinese — otherwise the plan and the chrome
      // would disagree.
      lang: 'zh',
      toast: '演示数据已重置',
    }
    set(commit(next))
  },
}))

/** Cycle guard for `toggleDependency` — a DAG must stay a DAG. */
function wouldCreateCycle(stages: Stage[], taskId: string, newDep: string): boolean {
  const all = stages.flatMap((s) => s.tasks)
  const byId = new Map(all.map((t) => [t.id, t]))
  // Adding taskId -> newDep creates a cycle if taskId is already reachable from newDep.
  const seen = new Set<string>()
  const stack = [newDep]
  while (stack.length > 0) {
    const cur = stack.pop()!
    if (cur === taskId) return true
    if (seen.has(cur)) continue
    seen.add(cur)
    const task = byId.get(cur)
    if (!task) continue
    for (const d of task.dependsOn) stack.push(d)
  }
  return false
}

/** Helper used by the UI: the tasks that are ready to start right now. */
export { addDaysISO }
