/**
 * Mock users and seeded demo projects.
 *
 * The prototype is front-end only: there is no server and no auth. Users are
 * mock records, and "collaborators" are simulated in `projectStore.ts` so the
 * progress-synchronisation behaviours (R4) can be demonstrated without a backend.
 */

import type { ActivityEntry, Project, SourceKind, Stage, User } from '../domain/types'
import { analyseSource } from './sourceAnalyser'
import { addDaysISO, generateDraft, isoToday, matchTemplates, TEMPLATES } from './domainEngine'

export const USERS: User[] = [
  {
    id: 'u_jiawen',
    name: 'Jiawen Cai',
    role: 'coordinator',
    familiarity: 'expert',
    initials: 'JC',
    color: '#4f46e5',
  },
  {
    id: 'u_xinyu',
    name: 'Xinyu Wan',
    role: 'member',
    familiarity: 'novice',
    initials: 'XW',
    color: '#0891b2',
  },
  {
    id: 'u_nayun',
    name: 'Nayun Feng',
    role: 'member',
    familiarity: 'novice',
    initials: 'NF',
    color: '#059669',
  },
  {
    id: 'u_jiale',
    name: 'Jiale Xiang',
    role: 'member',
    familiarity: 'expert',
    initials: 'JX',
    color: '#d97706',
  },
]

/**
 * Example information sources shown as one-click starting points (R1).
 *
 * The labels are bilingual but the source *text* is not translated: these are
 * meant to look like the real messages a user would paste, and one of them is
 * deliberately a Chinese chat message so the analyser's Chinese date handling is
 * demonstrable.
 */
export const SAMPLE_SOURCES: Array<{
  label: { zh: string; en: string }
  kind: SourceKind
  text: string
}> = [
  {
    label: { zh: '课程任务书（小组汇报）', en: 'Coursework brief (group presentation)' },
    kind: 'brief',
    text: `CSI405 Interactive Systems — Group Project (CW1)

Your group must deliver a 12-minute presentation plus 5 minutes of questions on
your chosen interactive system. Groups of four. Submit the slide deck as PDF by
27 October 2026 before 17:00.

The presentation should cover: the motivation for the system, the related work,
the target users, the findings from your user research, and a walkthrough of the
design. Marks are awarded for the clarity of the argument, the strength of the
evidence from your own data, and how well each group member contributes.

Deliverables: slide deck (PDF), and a one-page summary of individual
contributions. Please rehearse the hand-over between speakers.`,
  },
  {
    label: { zh: '日程邀请（工作会议）', en: 'Calendar invite (work meeting)' },
    kind: 'calendar',
    text: `Subject: Q4 client review — preparation meeting
Location: Meeting room 3 / Teams
Date: Fri 6 November 2026 14:00-15:00

Hi all,

I would like to pull together the Q4 client review before the 20 November
deadline. Could everyone send me their figures by Wednesday so I can build the
deck? Sarah, please confirm the venue booking for the client session. Tom, we
need the updated pricing sheet before we can finalise the proposal.

We must also agree who presents each section.

Thanks,
Daniel`,
  },
  {
    label: { zh: '聊天消息（个人出行）', en: 'Chat message (personal errand)' },
    kind: 'chat',
    text: `群里说一声：我下周三之前要把去苏州的行程定下来。
需要订高铁票和酒店，还要确认一下签证有效期够不够。
另外帮我看一下周末那两天有没有时间，一起把行程排一下。`,
  },
  {
    label: { zh: '邮件（退租/搬家）', en: 'Email (home move)' },
    kind: 'email',
    text: `From: landlord@example.com
To: me
Subject: Tenancy end date confirmation

Dear tenant,

This is to confirm that your tenancy ends on 31 December 2026. The property must
be returned in the condition recorded in the inventory, and all keys must be
returned by 12:00 on that day.

Please arrange for the final utility readings to be taken, and confirm the
forwarding address for the deposit return. We need at least two weeks' notice if
you wish to request a checkout inspection.

Kind regards,
Property Management`,
  },
]

/* ------------------------------------------------------------------ *
 * Seeded project 1 — a project already mid-flight, with collaborators
 * ------------------------------------------------------------------ */

function groupPresentationProject(): Project {
  const source = SAMPLE_SOURCES[0].text
  const analysis = analyseSource(source)
  const deadline = '2026-10-27'

  const draft = generateDraft({
    analysis: { ...analysis, deadline, deadlineInferred: false },
    sourceText: source,
    projectName: 'CSI405 group presentation',
    template: TEMPLATES[0],
    deadline,
    scale: 'medium',
    members: USERS,
    ownerId: 'u_jiawen',
    familiarity: 'expert',
    applyReusableChecklist: false,
    lang: 'zh',
  })

  // Spread ownership across the group so R3/R4 are visible on first load.
  const ownerFor: Record<string, string> = {
    'Understand the brief': 'u_jiawen',
    'Agree the story and the division of work': 'u_jiawen',
    'Collect and structure the content': 'u_nayun',
    'Produce the deck': 'u_xinyu',
    'Rehearse and deliver': 'u_jiale',
    'Close out': 'u_jiale',
  }

  const stages: Stage[] = draft.stages.map((stage) => ({
    ...stage,
    tasks: stage.tasks.map((task) => {
      const owner = ownerFor[stage.name] ?? 'u_jiawen'
      const collaborators = USERS.filter((u) => u.id !== owner)
        .slice(0, task.kind === 'collaborative' ? 2 : 0)
        .map((u) => u.id)
      return { ...task, ownerId: owner, collaboratorIds: collaborators }
    }),
  }))

  // Put the project into a believable in-progress state.
  const allTasks = stages.flatMap((s) => s.tasks)
  const setStatus = (index: number, patch: Partial<(typeof allTasks)[number]>) => {
    const task = allTasks[index]
    if (task) Object.assign(task, patch)
  }
  setStatus(0, { status: 'done' })
  setStatus(1, { status: 'done' })
  setStatus(2, { status: 'done' })
  setStatus(3, { status: 'done' })
  setStatus(4, { status: 'done' })
  setStatus(5, { status: 'in_progress' })
  setStatus(6, { status: 'waiting' })
  setStatus(7, { status: 'todo' })
  setStatus(8, {
    status: 'blocked',
    blockerNote: 'Waiting on the case study data from Nayun before the slide can be finished.',
  })
  setStatus(9, { status: 'todo' })

  const today = isoToday()
  return {
    id: 'p_presentation',
    name: 'CSI405 group presentation',
    sourceText: source,
    sourceKind: 'brief',
    finalDeadline: deadline,
    scale: 'medium',
    deadlineInferred: false,
    stages,
    members: USERS.map((u) => u.id),
    familiarity: 'expert',
    createdAt: addDaysISO(today, -12),
    updatedAt: addDaysISO(today, -1),
    templateId: TEMPLATES[0].id,
    templateReused: true,
  }
}

/* ------------------------------------------------------------------ *
 * Seeded project 2 — a single-person project, novice guidance on
 * ------------------------------------------------------------------ */

function personalTripProject(): Project {
  const source = SAMPLE_SOURCES[2].text
  const analysis = analyseSource(source)
  const deadline = analysis.deadline ?? addDaysISO(isoToday(), 9)

  const matches = matchTemplates(analysis, source)
  const template = matches[0]?.template ?? TEMPLATES[TEMPLATES.length - 1]

  const draft = generateDraft({
    analysis: { ...analysis, deadline },
    sourceText: source,
    projectName: 'Suzhou weekend trip',
    template: template.kind === 'travel' ? template : TEMPLATES[3],
    deadline,
    scale: 'small',
    members: [USERS[1]],
    ownerId: 'u_xinyu',
    familiarity: 'novice',
    applyReusableChecklist: true,
    lang: 'zh',
  })

  return {
    id: 'p_trip',
    name: 'Suzhou weekend trip',
    sourceText: source,
    sourceKind: 'chat',
    finalDeadline: deadline,
    scale: 'small',
    deadlineInferred: analysis.deadlineInferred,
    stages: draft.stages,
    members: ['u_xinyu'],
    familiarity: 'novice',
    createdAt: addDaysISO(isoToday(), -2),
    updatedAt: addDaysISO(isoToday(), -2),
    templateId: template.id,
    templateReused: false,
  }
}

/* ------------------------------------------------------------------ *
 * Activity feed seed (R4)
 * ------------------------------------------------------------------ */

function seedActivity(project: Project): ActivityEntry[] {
  const now = new Date()
  const at = (hoursAgo: number) => {
    const d = new Date(now.getTime() - hoursAgo * 3_600_000)
    return d.toISOString()
  }
  if (project.id === 'p_presentation') {
    return [
      {
        id: 'a1',
        projectId: project.id,
        at: at(52),
        actorId: 'u_jiawen',
        summaryKey: 'log.draftFromSource',
        summaryParams: { stages: 6, source: 'brief' },
        kind: 'draft',
      },
      {
        id: 'a2',
        projectId: project.id,
        at: at(50),
        actorId: 'u_jiawen',
        summaryKey: 'log.reordered',
        kind: 'edit',
      },
      {
        id: 'a3',
        projectId: project.id,
        at: at(30),
        actorId: 'u_jiawen',
        summaryKey: 'log.shared',
        summaryParams: { names: 'Xinyu Wan, Nayun Feng, Jiale Xiang' },
        kind: 'share',
      },
      {
        id: 'a4',
        projectId: project.id,
        at: at(20),
        actorId: 'u_nayun',
        summaryKey: 'log.statusSet',
        summaryParams: { task: 'Draft the point of each slide (one line each)', status: 'done' },
        kind: 'status',
      },
      {
        id: 'a5',
        projectId: project.id,
        at: at(6),
        actorId: 'u_xinyu',
        summaryKey: 'log.blockerReported',
        summaryParams: { note: 'waiting on the case study data' },
        kind: 'block',
      },
      {
        id: 'a6',
        projectId: project.id,
        at: at(2),
        actorId: 'u_jiale',
        summaryKey: 'log.statusSet',
        summaryParams: { task: 'Rehearse end to end with a timer', status: 'waiting' },
        kind: 'status',
      },
    ]
  }
  return [
    {
      id: 'b1',
      projectId: project.id,
      at: at(40),
      actorId: 'u_xinyu',
      summaryKey: 'log.draftFromSource',
      summaryParams: { stages: project.stages.length, source: 'chat' },
      kind: 'create',
    },
  ]
}

/* ------------------------------------------------------------------ *
 * Public seed
 * ------------------------------------------------------------------ */

export interface SeedState {
  users: User[]
  projects: Project[]
  activity: ActivityEntry[]
}

export function seedState(): SeedState {
  const presentation = groupPresentationProject()
  const trip = personalTripProject()
  const projects = [presentation, trip]
  return {
    users: USERS,
    projects,
    activity: projects.flatMap(seedActivity),
  }
}
