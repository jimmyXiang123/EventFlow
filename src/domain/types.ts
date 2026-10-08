/**
 * EventFlow — domain model
 *
 * Mirrors the four key user requirements from the CSI405 user research:
 *  R1 create and integrate editable workflows from information sources
 *  R2 differentiated assistance based on familiarity with the planning
 *  R3 individual + collaborative tasks inside the same project
 *  R4 collaborators synchronously follow project progress
 */

export type Familiarity = 'novice' | 'expert'

export type Role = 'coordinator' | 'member'

export interface User {
  id: string
  name: string
  role: Role
  /** Planning familiarity with a *process*: novices need guidance, experts need speed. */
  familiarity: Familiarity
  initials: string
  color: string
}

/** How a task is carried out (R3). */
export type TaskKind = 'individual' | 'collaborative'

/**
 * Execution status. `waiting` is a first-class state because the user research found
 * "waiting for others" to be a distinct collaboration difficulty (R4).
 */
export type TaskStatus = 'todo' | 'waiting' | 'in_progress' | 'blocked' | 'done'

export interface Task {
  id: string
  name: string
  /** R3: individual ownership vs. joint work. */
  kind: TaskKind
  /** Single accountable owner. For collaborative tasks this is the coordinator of that task. */
  ownerId: string
  /** Additional people for collaborative tasks. */
  collaboratorIds: string[]
  /** Estimated effort, used to walk deadlines backwards from the project deadline. */
  estimateDays: number
  /** R4: ids of tasks that must finish before this one can start. */
  dependsOn: string[]
  /** Computed by the scheduler — earliest sensible start date. */
  startDate?: string
  /** Computed by the scheduler — latest date that still protects the final deadline. */
  deadline?: string
  status: TaskStatus
  /** Populated when status is `blocked`, so the coordinator can intervene (R4). */
  blockerNote?: string
  /** R2: novice-facing hint explaining *why* this step exists. */
  hint?: string
  /** R2: expert-facing shortcut, e.g. a reusable checklist from history. */
  reusableChecklist?: string[]
  /** Provenance (R1): which fragment of the imported source produced this task. */
  evidence?: string
}

export interface Stage {
  id: string
  name: string
  tasks: Task[]
}

export type ProjectScale = 'small' | 'medium' | 'large'

export interface Project {
  id: string
  name: string
  /** R1: the raw, unstructured input the workflow was derived from. */
  sourceText: string
  sourceKind: SourceKind
  /** Hard constraint from the source (calendar node, brief, email). */
  finalDeadline: string
  scale: ProjectScale
  /** True when the info source did not state a deadline and the user supplied it. */
  deadlineInferred: boolean
  stages: Stage[]
  members: string[]
  /** R2/R4: assists adaptation and explains personalised guidance. */
  familiarity: Familiarity
  createdAt: string
  updatedAt: string
  /** R2: which historical template was reused, if any. */
  templateId?: string
  templateReused?: boolean
}

export type SourceKind = 'email' | 'calendar' | 'chat' | 'brief' | 'file' | 'manual'

export interface Template {
  id: string
  name: string
  keywords: string[]
  /** Familiarity level the template is written for. */
  level: Familiarity
  stageNames: string[]
  taskTitles: string[]
  usageCount: number
  lastUsed: string
}

/** R4: an append-only activity record so members can catch up on progress. */
export interface ActivityEntry {
  id: string
  projectId: string
  at: string
  actorId: string
  /**
   * Translation key for the human-readable event, plus its parameters.
   *
   * The key is stored rather than the rendered sentence so the activity feed
   * reads correctly in whichever interface language is active. Storing English
   * prose would have frozen the feed in one language and left the Chinese
   * interface half-translated.
   */
  summaryKey: string
  summaryParams?: Record<string, string | number>
  kind: 'create' | 'edit' | 'assign' | 'status' | 'block' | 'share' | 'draft'
}

export const STATUS_LABEL: Record<TaskStatus, string> = {
  todo: 'To do',
  waiting: 'Waiting on others',
  in_progress: 'In progress',
  blocked: 'Blocked',
  done: 'Done',
}

export const KIND_LABEL: Record<TaskKind, string> = {
  individual: 'Individual',
  collaborative: 'Collaborative',
}

export const SOURCE_LABEL: Record<SourceKind, string> = {
  email: 'Email note',
  calendar: 'Calendar entry',
  chat: 'Chat message',
  brief: 'Assignment / work brief',
  file: 'File / document',
  manual: 'Manual entry',
}
