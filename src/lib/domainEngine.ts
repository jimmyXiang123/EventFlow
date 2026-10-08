/**
 * R1 + R2 — Template library and workflow-draft generation.
 *
 * Design decision recorded in the report: this prototype generates drafts from
 * *rule/template* knowledge first (deterministic, no API key, inspectable —
 * the same approach as github/spec-kit's spec-driven templates). An LLM adapter
 * can be dropped in behind the same interface (see `llmAdapter.ts`).
 *
 * The template library is also the R2 mechanism: each template carries a
 * `level`, so a novice is offered "process examples" while an expert is offered
 * "reuse the template you already ran before".
 */

import type {
  Familiarity,
  ProjectScale,
  Stage,
  Task,
  TaskKind,
  User,
} from '../domain/types'
import type { SourceAnalysis } from './sourceAnalyser'
import type { Lang } from '../i18n/labels'

export type ProjectKind =
  | 'presentation'
  | 'research'
  | 'event'
  | 'travel'
  | 'application'
  | 'build'
  | 'generic'

export interface Template {
  id: string
  /**
   * Translation key for the template's name, not the name itself.
   * The display text lives in `src/i18n/labels.ts` so the interface can switch
   * language without the template library carrying two copies of every string.
   */
  nameKey: string
  /** Translation key for the novice-facing "why this process fits" explanation. */
  rationaleKey: string
  kind: ProjectKind
  /** Terms scored against the analysed source. */
  keywords: string[]
  /** Extra weight when these phrases appear verbatim. */
  phrases: string[]
  /** Familiarity level this template is written for (drives R2 branch). */
  level: Familiarity
  /** Stage name plus the tasks that belong to it. */
  stages: Array<{
    name: string
    /** Chinese name. Falls back to `name` when absent. */
    zhName?: string
    /** `optional` stages are dropped first when the source looks small. */
    optional?: boolean
    tasks: Array<{
      name: string
      /** Chinese name. Falls back to `name` when absent. */
      zhName?: string
      /** 0..1 weight used to scale task estimates to the project scale. */
      weight: number
      kind?: TaskKind
      dependsOnPrev?: boolean
      hint?: string
      /** Chinese hint. Falls back to `hint` when absent. */
      zhHint?: string
      /** Dropped first when the source looks small or the window is short. */
      optional?: boolean
    }>
  }>
  /** Task titles an expert can lift straight out of a past project. */
  reusableChecklist: string[]
  /** Chinese version of `reusableChecklist`. */
  reusableChecklistZh?: string[]
  /** Mock history so "reuse a previous template" has real numbers behind it. */
  usageCount: number
  lastUsed: string
}

/* ------------------------------------------------------------------ *
 * Language resolution
 * ------------------------------------------------------------------ */

/**
 * A generated draft uses the language that is active at the moment it is
 * created, because the resulting stage and task names are *persisted* with the
 * project. That is deliberate: a plan you wrote in Chinese should stay in
 * Chinese when you later switch the interface to English, and vice versa. Only
 * the interface chrome re-renders on a language switch.
 */
export function locName(item: { name: string; zhName?: string }, lang: Lang): string {
  return lang === 'zh' ? (item.zhName ?? item.name) : item.name
}

export function locHint(item: { hint?: string; zhHint?: string }, lang: Lang): string | undefined {
  return lang === 'zh' ? (item.zhHint ?? item.hint) : item.hint
}

export function locChecklist(template: Template | undefined, lang: Lang): string[] {
  if (!template) return []
  return lang === 'zh' ? (template.reusableChecklistZh ?? template.reusableChecklist) : template.reusableChecklist
}

/* ------------------------------------------------------------------ *
 * Template library
 * ------------------------------------------------------------------ */

export const TEMPLATES: Template[] = [
  {
    id: 'tpl-presentation',
    nameKey: 'tpl.presentation',
    kind: 'presentation',
    keywords: [
      'presentation', 'present', 'slides', 'slide', 'deck', 'ppt',
      'powerpoint', 'rehearse', 'rehearsal', 'audience', 'speaker',
      'presenting', '汇报', '演讲', '演示', '幻灯片', '答辩',
    ],
    phrases: ['group presentation', 'slide deck', '小组汇报', '课堂展示'],
    level: 'novice',
    rationaleKey: 'tpl.presentation',
    stages: [
      {
        name: 'Understand the brief',
            zhName: '读懂任务书',
        tasks: [
          {
            name: 'Re-read the brief and underline every requirement',
            zhName: '重读任务书，划出每一条要求',
            weight: 0.4,
            hint: 'Separate what is *asked for* from what is merely *suggested*.',
            zhHint: '把「明确要求」和「仅供参考」区分开。',
          },
          {
            name: 'List the marks available and what earns them',
            zhName: '列出评分项与得分点',
            weight: 0.4,
            optional: true,
            hint: 'Assessment criteria are a free checklist for this task.',
            zhHint: '评审标准就是这项任务的免费清单。',
          },
        ],
      },
      {
        name: 'Agree the story and the division of work',
            zhName: '确定叙事与分工',
        tasks: [
          {
            name: 'Agree the narrative and the section order',
            zhName: '确定整体叙事与各部分顺序',
            weight: 0.6,
            kind: 'collaborative',
            dependsOnPrev: true,
            hint: 'Decide the order before anyone writes slides, or you will rewrite them.',
            zhHint: '先定顺序再动手写，否则一定要返工。',
          },
          {
            name: 'Assign sections to members and confirm the hand-in format',
            zhName: '把各部分分给组员，确认交付格式',
            weight: 0.4,
            kind: 'collaborative',
            dependsOnPrev: true,
          },
        ],
      },
      {
        name: 'Collect and structure the content',
            zhName: '收集并组织内容',
        tasks: [
          { name: 'Collect the material each member needs',
            zhName: '收集每个成员需要的材料', weight: 1.2, optional: true },
          { name: 'Draft the point of each slide (one line each)',
            zhName: '写出每页幻灯片的一句话要点', weight: 0.9 },
        ],
      },
      {
        name: 'Produce the deck',
            zhName: '制作幻灯片',
        tasks: [
          { name: 'Build the slides to a shared visual style',
            zhName: '按统一的视觉风格制作幻灯片', weight: 1.4, kind: 'collaborative' },
          { name: 'Integrate the sections into one file',
            zhName: '把各部分合并成一个文件', weight: 0.6, kind: 'collaborative' },
          { name: 'Check timing against the slot length',
            zhName: '核对时长是否超出规定', weight: 0.4, optional: true },
        ],
      },
      {
        name: 'Rehearse and deliver',
            zhName: '彩排与正式汇报',
        tasks: [
          { name: 'Rehearse end to end with a timer',
            zhName: '掐表完整彩排一遍', weight: 0.6, kind: 'collaborative' },
          { name: 'Rehearse the hand-overs between speakers',
            zhName: '练习各讲者之间的衔接', weight: 0.4, kind: 'collaborative' },
          { name: 'Deliver the presentation',
            zhName: '正式汇报', weight: 0.3, kind: 'collaborative' },
        ],
      },
      {
        name: 'Close out',
            zhName: '收尾',
        tasks: [
          { name: 'Collect feedback and note what to reuse next time',
            zhName: '收集反馈，记下下次可复用的做法', weight: 0.3, optional: true },
        ],
      },
    ],
    reusableChecklist: [
      'One-line speaker notes instead of paragraphs on slides',
      'Backup copy on a second device and in the cloud',
      'Check the room adapter and clicker before the session',
    ],
    reusableChecklistZh: [
      '幻灯片上写一句话讲稿，而不是整段文字',
      '在第二台设备和云端各留一份备份',
      '正式开始前检查转接头和翻页笔',
    ],
    usageCount: 7,
    lastUsed: '2026-04-18',
  },
  {
    id: 'tpl-research',
    nameKey: 'tpl.research',
    kind: 'research',
    keywords: [
      'report', 'essay', 'research', 'literature', 'survey', 'questionnaire',
      'interview', 'cite', 'citation', 'reference', 'word', 'academic',
      'analysis', 'writing', 'thesis', '论文', '报告', '文献', '调研', '综述',
    ],
    phrases: ['literature review', 'word count', '文献综述', '字数'],
    level: 'novice',
    rationaleKey: 'tpl.research',
    stages: [
      {
        name: 'Scope the question',
            zhName: '明确问题范围',
        tasks: [
          { name: 'Restate the question in one sentence of your own words',
            zhName: '用自己的话把题目复述成一句话', weight: 0.4 },
          { name: 'Fix the scope, word count and format',
            zhName: '确定范围、字数与格式', weight: 0.3, optional: true },
        ],
      },
      {
        name: 'Gather sources',
            zhName: '收集资料',
        tasks: [
          { name: 'Search and screen sources against the question',
            zhName: '检索并按题目筛选文献', weight: 1.2 },
          { name: 'Read and take structured notes per source',
            zhName: '逐篇阅读并做结构化笔记', weight: 1.6 },
        ],
      },
      {
        name: 'Build the argument',
            zhName: '搭建论证',
        tasks: [
          { name: 'Group the notes into themes',
            zhName: '把笔记按主题归类', weight: 0.8, dependsOnPrev: true },
          { name: 'Write the outline with one claim per paragraph',
            zhName: '写提纲，每段一个论点', weight: 0.8, dependsOnPrev: true },
        ],
      },
      {
        name: 'Write',
            zhName: '写作',
        tasks: [
          { name: 'Draft the body sections',
            zhName: '撰写正文各部分', weight: 2.0, kind: 'individual' },
          { name: 'Write the introduction and conclusion last',
            zhName: '最后再写引言和结论', weight: 0.8, optional: true },
        ],
      },
      {
        name: 'Revise and submit',
            zhName: '修改与提交',
        tasks: [
          { name: 'Check every claim against a source',
            zhName: '逐条核对每个论点是否有出处', weight: 0.8, kind: 'collaborative' },
          { name: 'Format references and check the word count',
            zhName: '规范参考文献格式并核对字数', weight: 0.5 },
          { name: 'Submit and archive the final version',
            zhName: '提交并归档最终版本', weight: 0.2 },
        ],
      },
    ],
    reusableChecklist: [
      'Note-taking template: claim / evidence / my comment',
      'Reference manager export before formatting by hand',
      'Separate read-only copy of the submitted file',
    ],
    reusableChecklistZh: [
      '笔记模板：论点 / 证据 / 我的评论',
      '先用文献管理工具导出，再手工调格式',
      '单独留一份只读的已提交版本',
    ],
    usageCount: 5,
    lastUsed: '2026-03-02',
  },
  {
    id: 'tpl-event',
    nameKey: 'tpl.event',
    kind: 'event',
    keywords: [
      'event', 'venue', 'budget', 'guest', 'speaker', 'poster', 'promotion',
      'catering', 'logistics', 'registration', 'volunteer', '活动', '策划',
      '场地', '预算', '嘉宾', '宣传', '报名', '物资',
    ],
    phrases: ['budget approval', 'book the venue', '活动策划', '场地确认'],
    level: 'novice',
    rationaleKey: 'tpl.event',
    stages: [
      {
        name: 'Objectives and constraints',
            zhName: '目标与约束',
        tasks: [
          { name: 'Write the objective and the target attendance',
            zhName: '写下活动目标与预期人数', weight: 0.4 },
          { name: 'Agree the budget ceiling and who approves it',
            zhName: '确定预算上限与审批人', weight: 0.5 },
        ],
      },
      {
        name: 'Confirm the physical set-up',
            zhName: '落实场地与设备',
        tasks: [
          { name: 'Check venue availability and book it',
            zhName: '确认场地可用并完成预订', weight: 0.8, dependsOnPrev: true },
          { name: 'Confirm equipment, layout and accessibility',
            zhName: '确认设备、布局与无障碍条件', weight: 0.6, optional: true },
        ],
      },
      {
        name: 'Programme and people',
            zhName: '议程与人员',
        tasks: [
          { name: 'Finalise the programme and timings',
            zhName: '敲定议程与时间安排', weight: 0.8 },
          { name: 'Invite guests and speakers, confirm attendance',
            zhName: '邀请嘉宾与讲者并确认到场', weight: 1.0, kind: 'collaborative' },
        ],
      },
      {
        name: 'Promotion and registration',
            zhName: '宣传与报名',
        tasks: [
          { name: 'Prepare the promotion material',
            zhName: '准备宣传物料', weight: 0.8 },
          { name: 'Open registration and monitor numbers',
            zhName: '开放报名并跟踪人数', weight: 0.6, kind: 'collaborative' },
        ],
      },
      {
        name: 'Run and review',
            zhName: '执行与复盘',
        tasks: [
          { name: 'Brief the volunteers and assign on-site roles',
            zhName: '给志愿者开会，分配现场分工', weight: 0.5, kind: 'collaborative' },
          { name: 'Run the event',
            zhName: '执行活动', weight: 0.4, kind: 'collaborative' },
          { name: 'Settle the budget and write the review',
            zhName: '结算预算并写复盘', weight: 0.6, optional: true },
        ],
      },
    ],
    reusableChecklist: [
      'Lead-time table: how many weeks each booking needs',
      'Volunteer briefing sheet with named on-site roles',
      'Expense log kept from day one, not reconstructed at the end',
    ],
    reusableChecklistZh: [
      '提前量表：每项预订各需要提前几周',
      '志愿者简报：写明每个人的现场分工',
      '从第一天就记账，不要最后再回填',
    ],
    usageCount: 4,
    lastUsed: '2026-05-30',
  },
  {
    id: 'tpl-travel',
    nameKey: 'tpl.travel',
    kind: 'travel',
    keywords: [
      'trip', 'travel', 'flight', 'train', 'hotel', 'visa', 'itinerary',
      'passport', 'luggage', 'booking', '旅行', '出差', '行程', '机票',
      '酒店', '签证', '预订',
    ],
    phrases: ['travel insurance', 'check in', '行程安排'],
    level: 'novice',
    rationaleKey: 'tpl.travel',
    stages: [
      {
        name: 'Dates and documents',
            zhName: '日期与证件',
        tasks: [
          { name: 'Fix the travel dates and who is going',
            zhName: '定下出行日期与同行人员', weight: 0.4 },
          { name: 'Check passport / visa validity and processing time',
            zhName: '检查护照/签证有效期与办理时长', weight: 0.8 },
        ],
      },
      {
        name: 'Book transport and accommodation',
            zhName: '预订交通与住宿',
        tasks: [
          { name: 'Book transport',
            zhName: '预订交通', weight: 0.7, dependsOnPrev: true },
          { name: 'Book accommodation near the venue',
            zhName: '预订场地附近的住宿', weight: 0.6, dependsOnPrev: true },
          { name: 'Arrange travel insurance',
            zhName: '办理旅行保险', weight: 0.3, optional: true },
        ],
      },
      {
        name: 'Plan the time there',
            zhName: '安排当地行程',
        tasks: [
          { name: 'Draft the day-by-day itinerary',
            zhName: '排出逐日行程', weight: 0.7 },
          { name: 'Share the itinerary with everyone involved',
            zhName: '把行程发给所有相关的人', weight: 0.3, kind: 'collaborative' },
        ],
      },
      {
        name: 'Prepare to leave',
            zhName: '出发前准备',
        tasks: [
          { name: 'Pack against a checklist',
            zhName: '按清单打包行李', weight: 0.4 },
          { name: 'Check in and confirm the first leg',
            zhName: '办理值机并确认第一程', weight: 0.2 },
        ],
      },
    ],
    reusableChecklist: [
      'Document expiry check 8 weeks before departure',
      'Offline copies of bookings and confirmations',
    ],
    reusableChecklistZh: [
      '出发前 8 周先查证件有效期',
      '把预订和确认单存一份离线副本',
    ],
    usageCount: 3,
    lastUsed: '2026-02-11',
  },
  {
    id: 'tpl-application',
    nameKey: 'tpl.application',
    kind: 'application',
    keywords: [
      'application', 'apply', 'proposal', 'bid', 'grant', 'funding', 'cv',
      'resume', 'recommendation', 'reference letter', 'portfolio', 'pitch',
      '申请', '提案', '申报', '简历', '推荐信',
    ],
    phrases: ['cover letter', 'personal statement', '项目提案'],
    level: 'novice',
    rationaleKey: 'tpl.application',
    stages: [
      {
        name: 'Decode the criteria',
            zhName: '拆解评审标准',
        tasks: [
          { name: 'List the assessment criteria verbatim',
            zhName: '原样列出评审标准', weight: 0.4 },
          { name: 'Collect evidence for each criterion',
            zhName: '为每条标准收集对应证据', weight: 1.0, dependsOnPrev: true },
        ],
      },
      {
        name: 'Produce the documents',
            zhName: '准备申请材料',
        tasks: [
          { name: 'Draft the main statement / proposal',
            zhName: '撰写主文书/提案', weight: 1.6 },
          { name: 'Prepare supporting documents',
            zhName: '准备支撑材料', weight: 0.7 },
          { name: 'Request references or sign-off',
            zhName: '联系推荐人或走签批', weight: 0.3, optional: true },
        ],
      },
      {
        name: 'Review and submit',
            zhName: '复核与提交',
        tasks: [
          { name: 'Have someone else read it against the criteria',
            zhName: '请他人对照评审标准读一遍', weight: 0.4, kind: 'collaborative' },
          { name: 'Submit before the deadline and keep the receipt',
            zhName: '在截止前提交并保留回执', weight: 0.2 },
        ],
      },
    ],
    reusableChecklist: [
      'Criteria-to-evidence table, one row per criterion',
      'Proof-read pass specifically for the named requirements',
    ],
    reusableChecklistZh: [
      '「标准—证据」对照表，一条标准一行',
      '专门针对明确要求做一遍校对',
    ],
    usageCount: 2,
    lastUsed: '2026-01-20',
  },
  {
    id: 'tpl-generic',
    nameKey: 'tpl.generic',
    kind: 'generic',
    keywords: [],
    phrases: [],
    level: 'novice',
    rationaleKey: 'tpl.generic',
    stages: [
      {
        name: 'Define what "done" means',
            zhName: '明确「完成」的标准',
        tasks: [
          { name: 'Write the deliverable and the acceptance condition',
            zhName: '写下交付物与验收条件', weight: 0.4 },
          { name: 'Confirm the final deadline and any hard constraints',
            zhName: '确认最终截止日期与硬性约束', weight: 0.3, optional: true },
        ],
      },
      {
        name: 'Gather what you need',
            zhName: '收集所需资源',
        tasks: [
          { name: 'List the inputs, people and approvals you depend on',
            zhName: '列出依赖的输入、人员与审批', weight: 0.7 },
          { name: 'Request the missing information',
            zhName: '去索取缺失的信息', weight: 0.6, kind: 'collaborative' },
        ],
      },
      {
        name: 'Do the work',
            zhName: '动手完成',
        tasks: [
          { name: 'Break the work into deliverable chunks',
            zhName: '把工作拆成可交付的小块', weight: 0.8, dependsOnPrev: true },
          { name: 'Produce the first complete version',
            zhName: '产出第一个完整版本', weight: 1.8, dependsOnPrev: true },
        ],
      },
      {
        name: 'Check and hand over',
            zhName: '检查与交付',
        tasks: [
          { name: 'Review against the acceptance condition',
            zhName: '对照验收条件复核', weight: 0.6 },
          { name: 'Deliver and confirm receipt',
            zhName: '交付并确认收到', weight: 0.2, kind: 'collaborative' },
          { name: 'Record what to reuse next time',
            zhName: '记下下次可复用的做法', weight: 0.2, optional: true },
        ],
      },
    ],
    reusableChecklist: [
      'Definition of done agreed in writing before work starts',
      'Explicit list of external dependencies and who owns them',
    ],
    reusableChecklistZh: [
      '动手前先把「完成标准」书面确认',
      '明确列出外部依赖及其负责人',
    ],
    usageCount: 1,
    lastUsed: '2025-12-14',
  },
]

/* ------------------------------------------------------------------ *
 * Template matching
 * ------------------------------------------------------------------ */

export interface TemplateMatch {
  template: Template
  /** 0..1 — confidence that this template fits the source. */
  score: number
  /** Terms that actually fired, shown to the user as justification. */
  matchedTerms: string[]
}

/**
 * Score every template against an analysed source.
 * Deterministic: same input always yields the same ranking, so a demo is
 * reproducible and a marker can inspect the reasoning.
 */
export function matchTemplates(analysis: SourceAnalysis, haystack: string): TemplateMatch[] {
  const lower = haystack.toLowerCase()
  const kw = new Set(analysis.keywords)

  const scored = TEMPLATES.map((template) => {
    const matchedTerms: string[] = []
    let raw = 0

    for (const k of template.keywords) {
      if (kw.has(k)) {
        raw += 3
        matchedTerms.push(k)
      } else if (lower.includes(k)) {
        raw += 2
        matchedTerms.push(k)
      }
    }
    for (const p of template.phrases) {
      if (lower.includes(p.toLowerCase())) {
        raw += 6
        matchedTerms.push(p)
      }
    }

    const maxRaw = template.keywords.length * 3 + template.phrases.length * 6
    const score = maxRaw === 0 ? 0 : Math.min(1, raw / Math.max(9, maxRaw * 0.45))
    return { template, score, matchedTerms: [...new Set(matchedTerms)] }
  })

  return scored.sort((a, b) => b.score - a.score)
}

/* ------------------------------------------------------------------ *
 * Draft generation
 * ------------------------------------------------------------------ */

export interface DraftOptions {
  analysis: SourceAnalysis
  /** Text of the information source, used for provenance on tasks. */
  sourceText: string
  projectName: string
  /** Chosen template, or the best match when the user did not pick one. */
  template: Template
  /** Final deadline to schedule backwards from. */
  deadline: string
  scale: ProjectScale
  members: User[]
  ownerId: string
  familiarity: Familiarity
  /** R2: expert path may clone the template's checklist onto every task. */
  applyReusableChecklist: boolean
  /**
   * Language the generated names are written in. Stage and task names are
   * persisted with the project, so they are fixed at creation time rather than
   * following the interface language afterwards.
   */
  lang: Lang
}

export interface DraftResult {
  stages: Stage[]
  /** Deadline was computed rather than stated, so the UI asks for confirmation. */
  deadlineInferred: boolean
  /** Total effort in days, used to warn when the plan does not fit the window. */
  totalEffortDays: number
  /** Negative when the work cannot fit before the deadline. */
  slackDays: number
  /**
   * Warnings as translation keys plus parameters, not rendered sentences, so the
   * preview reads in the active interface language.
   */
  warnings: DraftWarning[]
}

/** A warning that is localised at display time. */
export interface DraftWarning {
  key: string
  params?: Record<string, string | number>
}

let idCounter = 0
function uid(prefix: string): string {
  idCounter += 1
  return `${prefix}_${Date.now().toString(36)}_${idCounter.toString(36)}`
}

/** Scale the template's unitless weights into whole-day estimates. */
function scaleWeights(scale: ProjectScale): number {
  switch (scale) {
    case 'small': return 0.6
    case 'large': return 1.8
    default: return 1.0
  }
}

function stageBudget(scale: ProjectScale, windowDays: number): number {
  // Aim for the plan to consume roughly 70% of the available window.
  const usable = Math.max(3, windowDays * 0.7)
  const perDay = scale === 'small' ? 1.1 : scale === 'large' ? 3.2 : 2.0
  return usable * perDay
}

/**
 * Build an editable workflow draft: `Stage[] -> Task[]`, every task carrying an
 * owner, a kind (R3) and a backwards-computed deadline (R1).
 */
export function generateDraft(options: DraftOptions): DraftResult {
  const { analysis, template, deadline, scale, members, ownerId, familiarity, lang } = options

  const totalWeight = template.stages.reduce(
    (acc, s) => acc + s.tasks.reduce((a, t) => a + t.weight, 0),
    0,
  )
  const windowDays = effectiveWindow(deadline)
  const budget = stageBudget(scale, windowDays)
  const daysPerWeight = budget / Math.max(totalWeight, 0.001)

  // Pick template members for collaborative tasks (round-robin, owner excluded).
  const others = members.filter((m) => m.id !== ownerId)
  let collabCursor = 0

  const stages: Stage[] = []
  let totalEffortDays = 0

  const stageNames = template.stages

  for (const stageSpec of stageNames) {
    const stageId = uid('stage')
    const tasks: Task[] = []
    let prevTaskId: string | null = null

    for (const taskSpec of stageSpec.tasks) {
      const estimate = Math.max(1, Math.round(taskSpec.weight * daysPerWeight * scaleWeights(scale)))
      totalEffortDays += estimate

      const kind: TaskKind = taskSpec.kind ?? 'individual'
      const collaborators: string[] = []
      if (kind === 'collaborative') {
        const share = others.length > 0 ? Math.min(others.length, 2) : 0
        for (let i = 0; i < share; i += 1) {
          collaborators.push(others[(collabCursor + i) % others.length].id)
        }
        collabCursor += share
      }

      tasks.push({
        id: uid('task'),
        name: locName(taskSpec, lang),
        kind,
        ownerId,
        collaboratorIds: collaborators,
        estimateDays: estimate,
        dependsOn: taskSpec.dependsOnPrev && prevTaskId ? [prevTaskId] : [],
        status: 'todo',
        hint: locHint(taskSpec, lang),
        reusableChecklist: options.applyReusableChecklist
          ? locChecklist(template, lang)
          : undefined,
        evidence:
          analysis.obligations.find((o) => overlaps(o, taskSpec.name)) ??
          (analysis.deadlinePhrase ? `Deadline in source: "${analysis.deadlinePhrase}"` : undefined),
      })

      prevTaskId = tasks[tasks.length - 1].id
    }

    stages.push({ id: stageId, name: locName(stageSpec, lang), tasks })
  }

  // Chain stages: the first task of each stage waits for the last task of the previous.
  for (let i = 1; i < stages.length; i += 1) {
    const prevStage = stages[i - 1]
    const lastPrev = prevStage.tasks[prevStage.tasks.length - 1]
    const firstCurrent = stages[i].tasks[0]
    if (lastPrev && firstCurrent && firstCurrent.dependsOn.length === 0) {
      firstCurrent.dependsOn = [lastPrev.id]
    }
  }

  // Schedule: walk backwards from the deadline.
  const scheduled = scheduleBackwards(stages, deadline)

  /**
   * Slack = calendar days available minus the effort the plan needs.
   *
   * Note this is deliberately NOT "distance between the last task's deadline and
   * the final deadline": `scheduleBackwards` pins the last task to the deadline
   * by construction, so that difference is always zero and would make the
   * shortfall warning unreachable.
   */
  const slackDays = windowDays - totalEffortDays

  /**
   * Warnings are returned as translation keys plus parameters rather than as
   * rendered sentences, so the draft preview reads in the active interface
   * language. They were hardcoded English, which left the Chinese interface
   * showing English warnings on the screen where the user decides whether to
   * commit to the plan.
   */
  const warnings: DraftWarning[] = []
  if (slackDays < 0) {
    warnings.push({
      key: 'warn.shortfall',
      params: {
        effort: totalEffortDays,
        window: windowDays,
        deadline,
      },
    })
  } else if (slackDays <= 2) {
    warnings.push({
      key: 'warn.tight',
      params: {
        slack: slackDays,
        effort: totalEffortDays,
        window: windowDays,
        deadline,
      },
    })
  }
  if (analysis.missingInfo.length > 0) {
    warnings.push({
      key: 'warn.missingDetails',
      params: { n: analysis.missingInfo.length },
    })
  }
  if (familiarity === 'novice') {
    warnings.push({ key: 'warn.draftIsSuggestion' })
  }

  return {
    stages: scheduled,
    deadlineInferred: analysis.deadlineInferred,
    totalEffortDays,
    slackDays,
    warnings,
  }
}

function effectiveWindow(deadline: string): number {
  const today = new Date()
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const end = new Date(`${deadline}T00:00:00`)
  return Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000))
}

export function daysBetweenISO(a: string, b: string): number {
  const da = new Date(`${a}T00:00:00`).getTime()
  const db = new Date(`${b}T00:00:00`).getTime()
  return Math.round((db - da) / 86_400_000)
}

function overlaps(sentence: string, title: string): boolean {
  const words = title.toLowerCase().split(/\W+/).filter((w) => w.length > 4)
  const s = sentence.toLowerCase()
  return words.some((w) => s.includes(w))
}

/* ------------------------------------------------------------------ *
 * Backwards scheduling (R1: "tasks calculated based on deadlines")
 * ------------------------------------------------------------------ */

/**
 * Backwards pass: set each task's deadline to the latest date that still lets
 * every dependent task finish before the final deadline, then derive start
 * dates. Returns new Stage objects — never mutates the input.
 */
export function scheduleBackwards(stages: Stage[], finalDeadline: string): Stage[] {
  const allTasks = stages.flatMap((s) => s.tasks)
  const byId = new Map(allTasks.map((t) => [t.id, t]))
  const order = topoOrder(stages)

  const deadlineOf = new Map<string, string>()
  const startOf = new Map<string, string>()

  // Walk from the end of the graph to the start.
  for (let i = order.length - 1; i >= 0; i -= 1) {
    const task = byId.get(order[i])
    if (!task) continue

    const dependents = allTasks.filter((t) => t.dependsOn.includes(task.id))
    let latestFinish = finalDeadline
    if (dependents.length > 0) {
      const earliestDependentStart = dependents
        .map((d) => startOf.get(d.id))
        .filter((d): d is string => Boolean(d))
        .sort()[0]
      if (earliestDependentStart) latestFinish = earliestDependentStart
    }

    const start = addDaysISO(latestFinish, -task.estimateDays)
    deadlineOf.set(task.id, latestFinish)
    startOf.set(task.id, start)
  }

  // Forward pass: a task cannot start before all its predecessors finish.
  for (const id of order) {
    const task = byId.get(id)
    if (!task) continue
    if (task.dependsOn.length === 0) continue
    const latestPredDeadline = task.dependsOn
      .map((p) => deadlineOf.get(p))
      .filter((d): d is string => Boolean(d))
      .sort()
      .pop()
    if (!latestPredDeadline) continue
    const boundedStart = laterOf(startOf.get(id) ?? latestPredDeadline, latestPredDeadline)
    startOf.set(id, boundedStart)
    const boundedDeadline = addDaysISO(boundedStart, task.estimateDays)
    if (boundedDeadline < (deadlineOf.get(id) ?? finalDeadline)) {
      deadlineOf.set(id, boundedDeadline)
    }
  }

  return stages.map((stage) => ({
    ...stage,
    tasks: stage.tasks.map((task) => ({
      ...task,
      startDate: startOf.get(task.id),
      deadline: deadlineOf.get(task.id),
    })),
  }))
}

function laterOf(a: string, b: string): string {
  return a > b ? a : b
}

export function addDaysISO(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`)
  d.setDate(d.getDate() + days)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}

/**
 * Kahn topological sort. Tasks caught in a dependency cycle are appended at the
 * end so a user-created cycle can never hang the UI.
 */
export function topoOrder(stages: Stage[]): string[] {
  const allTasks = stages.flatMap((s) => s.tasks)
  const indegree = new Map<string, number>()
  const adj = new Map<string, string[]>()

  for (const t of allTasks) {
    indegree.set(t.id, 0)
    adj.set(t.id, [])
  }
  for (const t of allTasks) {
    for (const dep of t.dependsOn) {
      if (!indegree.has(dep)) continue
      indegree.set(t.id, (indegree.get(t.id) ?? 0) + 1)
      adj.get(dep)!.push(t.id)
    }
  }

  const queue = [...indegree.entries()].filter(([, d]) => d === 0).map(([id]) => id)
  const out: string[] = []
  while (queue.length > 0) {
    const id = queue.shift()!
    out.push(id)
    for (const next of adj.get(id) ?? []) {
      const d = (indegree.get(next) ?? 1) - 1
      indegree.set(next, d)
      if (d === 0) queue.push(next)
    }
  }

  if (out.length < allTasks.length) {
    for (const t of allTasks) if (!out.includes(t.id)) out.push(t.id)
  }
  return out
}

/* ------------------------------------------------------------------ *
 * R4 — dependency analysis
 * ------------------------------------------------------------------ */

export interface DependencyInsight {
  taskId: string
  /** Unfinished prerequisites. */
  blockedBy: string[]
  /** Transitive successors that a delay here would push back. */
  affects: string[]
  /** True when this task cannot start yet. */
  isBlocked: boolean
  /** Deadline already in the past and not done. */
  isOverdue: boolean
}

/**
 * Compute blocked/affected/overdue state for every task in a project.
 *
 * The passed stages are scheduled first when their dates are missing, so this
 * is correct whether the caller hands over freshly generated stages or ones that
 * already carry computed dates. `scheduleBackwards` is idempotent for a given
 * deadline, so running it again costs nothing but guarantees `isOverdue` has a
 * date to compare against instead of silently reporting `false` everywhere.
 */
export function analyseDependencies(
  stages: Stage[],
  today = isoToday(),
  finalDeadline?: string,
): Map<string, DependencyInsight> {
  const unscheduled = stages.some((s) => s.tasks.some((t) => !t.deadline))
  const source = unscheduled
    ? scheduleBackwards(stages, finalDeadline ?? latestDeadline(stages) ?? today)
    : stages

  const allTasks = source.flatMap((s) => s.tasks)
  const byId = new Map(allTasks.map((t) => [t.id, t]))
  const out = new Map<string, DependencyInsight>()

  const successorsOf = (id: string): string[] => {
    const direct = allTasks.filter((t) => t.dependsOn.includes(id)).map((t) => t.id)
    const seen = new Set<string>()
    const stack = [...direct]
    while (stack.length > 0) {
      const cur = stack.pop()!
      if (seen.has(cur)) continue
      seen.add(cur)
      for (const t of allTasks) if (t.dependsOn.includes(cur)) stack.push(t.id)
    }
    return [...seen]
  }

  for (const task of allTasks) {
    const blockedBy = task.dependsOn.filter((id) => {
      const dep = byId.get(id)
      return dep ? dep.status !== 'done' : false
    })
    out.set(task.id, {
      taskId: task.id,
      blockedBy,
      affects: successorsOf(task.id),
      isBlocked: blockedBy.length > 0,
      isOverdue: task.status !== 'done' && !!task.deadline && task.deadline < today,
    })
  }
  return out
}

export function isoToday(): string {
  const d = new Date()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}

/** Latest task deadline in a stage list, used as a scheduling fallback. */
function latestDeadline(stages: Stage[]): string | null {
  const dates = stages
    .flatMap((s) => s.tasks)
    .map((t) => t.deadline)
    .filter((d): d is string => Boolean(d))
  return dates.length > 0 ? dates.sort().pop()! : null
}

/** Flatten a project's tasks with their stage, in display order. */
export function flattenTasks(stages: Stage[]): Array<{ task: Task; stage: Stage }> {
  return stages.flatMap((stage) => stage.tasks.map((task) => ({ task, stage })))
}
