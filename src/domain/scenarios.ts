/**
 * User groups — the CW1 → CW2 bridge.
 *
 * CW1 submitted (Data Questions §1):
 *
 *   "The four situations are: individual planning by a person unfamiliar with
 *    planning, individual planning by a person familiar with planning,
 *    multi-person collaborative planning by a person unfamiliar with planning,
 *    and multi-person collaborative planning by a person familiar with planning.
 *    The same user can be in different situations in different projects."
 *
 * CW2's report template asks for the requirements to be mapped to a "Target user
 * group". These four situations are that dimension: they are deliberately NOT
 * demographic variations of one audience, which is what the project brief warns
 * against. They differ in **role** (accountable coordinator vs contributing
 * member), **goal** (plan from nothing vs copy a known structure), **behaviour**
 * (needs the steps explained vs needs them out of the way) and **constraints**
 * (cannot see the whole project vs must see all of it).
 *
 * Each group also names the concrete roles it covers, so the same prototype can
 * be read as serving e.g. "a student planning a first trip" and "a project lead
 * coordinating a team".
 *
 * Selecting a group switches the signed-in participant, their role, the guidance
 * level and the project: one prototype, four configurations.
 *
 * All display text is bilingual. The interface language decides which column is
 * shown, and nothing here is persisted, so switching language cannot alter state.
 */

import type { Familiarity, Role } from '../domain/types'

/** A string that exists in both interface languages. */
export interface Bilingual {
  zh: string
  en: string
}

export interface Scenario {
  id: string
  /** Short label for the header control. */
  label: Bilingual
  /** The CW1 wording for this situation. */
  situation: Bilingual
  /** The user group this stands for, in CW2 report terms. */
  group: Bilingual
  /** Concrete real-world roles this configuration covers. */
  exampleRoles: Bilingual
  summary: Bilingual
  /** Who plays this group in the prototype. */
  userId: string
  role: Role
  familiarity: Familiarity
  /** Which seeded project the group is working on. */
  projectId: string
  /** What this group needs to accomplish, per the CW1 evidence. */
  tasks: Bilingual
  /** What the prototype does differently for this group. */
  adaptation: Bilingual
  /** Which key requirement this group exercises most. */
  primaryRequirement: 'R1' | 'R2' | 'R3' | 'R4'
}

/** Split a `\n`-separated bilingual list into items. */
export function biList(value: Bilingual, lang: 'zh' | 'en'): string[] {
  return value[lang].split('\n').filter(Boolean)
}

export const SCENARIOS: Scenario[] = [
  {
    id: 's_unfamiliar_individual',
    label: { zh: '群组 1 · 个人·新手', en: 'Group 1 · Solo, new to it' },
    situation: {
      zh: '不熟悉流程的人进行个人规划',
      en: 'Individual planning by a person unfamiliar with planning',
    },
    group: {
      zh: '个人规划者（不熟悉该流程）',
      en: 'Individual planner, unfamiliar with the process',
    },
    exampleRoles: {
      zh: '第一次做小组作业的学生；接到陌生类型任务的员工；第一次出国旅行的人',
      en: 'A student organising a first group assignment; an employee given an unfamiliar type of task; someone planning a first trip abroad',
    },
    summary: {
      zh: '有目标和截止日期，但从未做过这类规划。需要别人告诉他有哪些步骤，也需要知道信息源里没说的部分是什么。',
      en: 'Has a goal and a deadline but has never planned this kind of work. Needs the steps explained and needs to know what the source never told them.',
    },
    userId: 'u_xinyu',
    role: 'member',
    familiarity: 'novice',
    projectId: 'p_trip',
    tasks: {
      zh: '把一条简短的聊天消息变成可执行的计划\n了解这类任务通常包含哪些步骤\n看清每一步相对于截止日期该在什么时候发生',
      en: 'Turn a short chat message into a realistic plan\nFind out which steps this kind of task normally involves\nSee when each step has to happen relative to the deadline',
    },
    adaptation: {
      zh: '引导级别设为「新手」：每个任务都带一行提示，说明这个步骤为什么存在\n模板列表给出可直接修改的示例流程，并说明每套流程为什么合适\n信息源里没提供的细节会被明确列出，而不是被编造\n草稿被标注为「建议」，本来就预期会被修改',
      en: 'Guidance level Novice: every task carries a one-line hint explaining why the step exists\nThe template picker shows worked process examples and states why each one fits\nDetails the source never provided are listed explicitly instead of being invented\nThe draft is labelled a suggestion that is expected to be edited',
    },
    primaryRequirement: 'R2',
  },
  {
    id: 's_familiar_individual',
    label: { zh: '群组 2 · 个人·熟手', en: 'Group 2 · Solo, knows it' },
    situation: {
      zh: '熟悉流程的人进行个人规划',
      en: 'Individual planning by a person familiar with planning',
    },
    group: {
      zh: '个人规划者（熟悉该流程）',
      en: 'Individual planner, familiar with the process',
    },
    exampleRoles: {
      zh: '常出行的人规划一次熟悉的行程；按固定结构写报告的研究者；重复做同一类个人项目的人',
      en: 'An experienced traveller planning a familiar trip; a researcher writing a report to a known structure; someone repeating a routine personal project',
    },
    summary: {
      zh: '以前做过这套流程。要的是速度与复用，不是讲解，也不该被迫读他不需要的引导。',
      en: 'Has run this process before. Wants speed and reuse rather than explanation, and should not be made to read guidance they do not need.',
    },
    userId: 'u_jiale',
    role: 'member',
    familiarity: 'expert',
    projectId: 'p_trip',
    tasks: {
      zh: '复用以前奏效过的流程结构\n只改这次不一样的地方\n不用手算就能保住截止日期的推算',
      en: 'Reuse the structure of a process that worked before\nEdit only what differs this time\nKeep the deadline arithmetic without recomputing it by hand',
    },
    adaptation: {
      zh: '引导级别设为「专家」：隐藏提示，把做过的流程排在最前\n以往项目的可复用检查清单会出现在任务卡上\n同一份草稿，但去掉了教学层',
      en: 'Guidance level Expert: hints are hidden and previously used processes are listed first\nReusable checklists carried from earlier projects appear on the task cards\nSame draft, with the teaching layer removed',
    },
    primaryRequirement: 'R2',
  },
  {
    id: 's_unfamiliar_collaborative',
    label: { zh: '群组 3 · 协调者·新手', en: 'Group 3 · Coordinator, new to it' },
    situation: {
      zh: '不熟悉流程的人进行多人协作规划',
      en: 'Multi-person collaborative planning by a person unfamiliar with planning',
    },
    group: {
      zh: '小组项目的协调者（不熟悉该流程）',
      en: 'Novice coordinator of a group project',
    },
    exampleRoles: {
      zh: '负责小组作业交付的学生；第一次办活动的干事；刚接手周期性规划流程的负责人',
      en: 'A student coordinating a group coursework deliverable; a staff member running an event for the first time; a team lead new to a recurring planning cycle',
    },
    summary: {
      zh: '对小组交付物负最终责任，但从未协调过；既需要有人解释步骤，也需要看清谁卡住了谁。',
      en: 'Accountable for a group deliverable, has never coordinated one, and needs both the steps explained and a way to see who is holding up whom.',
    },
    userId: 'u_jiawen',
    role: 'coordinator',
    familiarity: 'novice',
    projectId: 'p_presentation',
    tasks: {
      zh: '把小组任务书拆成阶段并分配到人\n理清哪些步骤必须等哪些步骤\n尽早发现延期，来得及处理\n减少反复向成员催问进度的次数',
      en: 'Break a group brief into stages and assign them to people\nWork out what has to wait for what\nNotice a delay early enough to do something about it\nReduce the number of times they have to ask members for an update',
    },
    adaptation: {
      zh: '协调者角色：能看到阻塞、等待关系，以及某个延期会推后哪些后续任务\n在新手引导之上叠加协调者视图——两者是相互独立的设置\n动态流显示成员已经改过什么，减少催问',
      en: 'Coordinator role: sees blockers, waiting relationships, and which later tasks a delay pushes back\nNovice guidance on top of the coordinator view — the two settings are independent\nThe activity feed shows what teammates have already changed, reducing check-in messages',
    },
    primaryRequirement: 'R4',
  },
  {
    id: 's_familiar_collaborative',
    label: { zh: '群组 4 · 成员·熟手', en: 'Group 4 · Member, knows it' },
    situation: {
      zh: '熟悉流程的人进行多人协作规划',
      en: 'Multi-person collaborative planning by a person familiar with planning',
    },
    group: {
      zh: '小组项目中的成员（熟悉该流程）',
      en: 'Experienced member contributing to a group project',
    },
    exampleRoles: {
      zh: '只负责其中一条工作流的组员；加入成熟团队的专家；只关心自己承诺的同事',
      en: 'A group member who owns one workstream; a specialist joining an established team; a colleague who only needs their own commitments',
    },
    summary: {
      zh: '很清楚自己那一块。只需要看到自己欠什么、在等什么——别的不用给。',
      en: 'Knows their own part well. Needs to see what they owe and what they are waiting for — nothing more.',
    },
    userId: 'u_nayun',
    role: 'member',
    familiarity: 'expert',
    projectId: 'p_presentation',
    tasks: {
      zh: '只看到自己负责或参与的任务\n更新自己的状态，别让别人被卡住\n知道自己的哪项任务有人正在等',
      en: 'See only the tasks they own or help with\nUpdate their own status so others are not blocked\nKnow which of their tasks someone else is waiting on',
    },
    adaptation: {
      zh: '成员角色：协调者专属的「需要处理」面板完全不渲染\n只列出自己的任务，含可改状态和各自支撑的截止日期\n等待关系显示为「阻塞」，但不暴露别人的阻塞说明',
      en: 'Member role: the coordinator-only attention panel is not rendered at all\nOnly their own tasks are listed, with changeable status and the deadline each one feeds\nWaiting relationships show as blocked without exposing other people’s blocker notes',
    },
    primaryRequirement: 'R3',
  },
]

export function scenarioById(id: string | null): Scenario | undefined {
  if (!id) return undefined
  return SCENARIOS.find((s) => s.id === id)
}
