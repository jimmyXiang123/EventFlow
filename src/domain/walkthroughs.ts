/**
 * Scripted walkthroughs — the "sequence of interaction" the CW2 brief requires.
 *
 * The brief states that a static image or written description alone is not
 * sufficient and that the prototype must communicate the sequence of interaction
 * between the user and the system. Each walkthrough below is therefore an ordered
 * script in which every step names:
 *
 *   - what the user does,
 *   - what the system does in response,
 *   - which real control is involved (`target`, a `data-guide` id in the UI),
 *   - and the design decision or issue behind that step.
 *
 * `WalkthroughView` plays the script against the live application: it navigates
 * to the right screen, highlights the actual control, and reports the system
 * response. Nothing here is a mock-up — every step drives the real prototype.
 *
 * Text is bilingual because the prototype is demonstrated in Chinese and reported
 * in English. The English column is the one that goes into the CW2 report.
 */

export type GuideTarget =
  | 'view-tabs'
  | 'scenario-switcher'
  | 'guidance-control'
  | 'source-input'
  | 'sample-sources'
  | 'analyser-summary'
  | 'missing-info'
  | 'template-list'
  | 'suggestion-banner'
  | 'create-project'
  | 'board-columns'
  | 'task-card'
  | 'task-status'
  | 'task-detail'
  | 'dependency-list'
  | 'task-kind'
  | 'role-switcher'
  | 'simulate-update'
  | 'timeline-bars'
  | 'attention-panel'
  | 'activity-feed'
  | 'dependency-map'
  // Error prevention and error messages.
  | 'guard-invalid-source-date'
  | 'guard-deadline-past'
  | 'guard-submit-reason'
  | 'cycle-prevention'
  | 'guard-storage'
  | 'guard-review'

/** A string that exists in both interface languages. */
export interface Bilingual {
  zh: string
  en: string
}

export interface WalkthroughStep {
  n: number
  title: Bilingual
  /** Which screen this step happens on. */
  view: 'draft' | 'board' | 'calendar' | 'flow'
  /** The control the step is about, highlighted in the real UI. */
  target: GuideTarget
  /** What the user does. */
  userAction: Bilingual
  /** What the system does in response. */
  systemResponse: Bilingual
  /** How the prototype represents this (what a viewer should look at). */
  representation: Bilingual
  /** The design decision or open issue. */
  decision: Bilingual
  /**
   * A precondition the player must satisfy before the target exists on screen.
   * The ownership and dependency controls the steps are about do not exist until
   * a task's panel is open:
   *  - `open-task` opens any task;
   *  - `focus-predecessor` opens a task that already waits on another, so the
   *    "waits for" list has something ticked in it to look at;
   *  - `past-deadline` puts the draft screen into the state where the deadline is
   *    in the past, which is what raises the prevention alert.
   */
  prepare?:
    | 'open-task'
    | 'focus-predecessor'
    | 'past-deadline'
    | 'invalid-date-source'
    | 'cycle-prevention'
}

export interface Walkthrough {
  id: string
  label: Bilingual
  /** The scenario this script belongs to. */
  scenarioId: string
  /** The one important task the script follows, as the brief asks for. */
  task: Bilingual
  steps: WalkthroughStep[]
}

/** The main script: a first-time coordinator organising a group presentation. */
const coordinatorScript: Walkthrough = {
  id: 'w_coordinator',
  label: {
    zh: '协调者创建并共享小组计划',
    en: 'Coordinator creates and shares a group plan',
  },
  scenarioId: 's_unfamiliar_collaborative',
  task: {
    zh: '一位新手协调者把课程任务书变成一份可共享、可跟踪的小组汇报计划。',
    en: 'A novice coordinator turns a coursework brief into a shared, tracked plan for a group presentation.',
  },
  steps: [
    {
      n: 1,
      title: { zh: '选择用户群', en: 'Choose the user group' },
      view: 'draft',
      target: 'scenario-switcher',
      userAction: {
        zh: '协调者选择自己所属的用户群。',
        en: 'The coordinator selects the group they belong to.',
      },
      systemResponse: {
        zh: '原型切换登录成员、角色与引导级别，并列出该用户群的需求。',
        en: 'The prototype switches the signed-in participant, their role and the guidance level, then lists what that group needs.',
      },
      representation: {
        zh: '顶栏的用户群控件。同一份构建服务全部四个用户群，没有单独的 mock-up。',
        en: 'Header scenario control. The same build serves all four groups; nothing is a separate mock-up.',
      },
      decision: {
        zh: '用户群按「角色 + 熟悉度」区分，而不是按人口属性——这与 CW1 的发现一致：熟悉度是按人、按流程变化的。',
        en: 'Groups differ by role and familiarity, not by demographics — matching the CW1 finding that familiarity is per person and per process.',
      },
    },
    {
      n: 2,
      title: { zh: '粘贴收到的信息', en: 'Paste the information that arrived' },
      view: 'draft',
      target: 'source-input',
      userAction: {
        zh: '把原始任务书粘贴进来，并确认其中写明的截止日期。',
        en: 'Pastes the original brief, and picks the deadline the brief states.',
      },
      systemResponse: {
        zh: '在本地解析文本，指出截止日期出自哪句话，并把找不到的信息单独标出来。',
        en: 'Reads the text locally and confirms which sentence the deadline came from, and flags anything it could not find.',
      },
      representation: {
        zh: '信息源文本框；以及引用「27 October 2026」的那条截止日期确认提示。',
        en: 'Source text area; the "Deadline from the text" confirmation quoting "27 October 2026".',
      },
      decision: {
        zh: '解析器会报告「没找到什么」，而不是编造——这正是 CW1 里 30 位受访者中有 20 位担心的「自动建议误解我的目标」。',
        en: 'The analyser reports what it did NOT find rather than inventing it — the concern 20 of 30 CW1 respondents raised about automatic suggestions.',
      },
    },
    {
      n: 3,
      title: { zh: '核对系统读到的内容', en: 'Review what the system understood' },
      view: 'draft',
      target: 'analyser-summary',
      userAction: {
        zh: '检查识别出的信息源类型、截止日期和规模，有错就改。',
        en: 'Checks the detected source type, deadline and scale, and corrects any of them.',
      },
      systemResponse: {
        zh: '所有识别出的字段都可以修改，改动会立刻反映到下方草稿上。',
        en: 'Every detected field stays editable, and corrections immediately change the draft below.',
      },
      representation: {
        zh: '「EventFlow 读到的内容」面板，含可编辑的信息源类型 / 最终截止日期 / 规模。',
        en: '"What EventFlow understood" panel with editable Source type / Final deadline / Scale controls.',
      },
      decision: {
        zh: '识别结果只是建议，不是自动生效的事实：用户确认之后草稿才生成。',
        en: 'Detection is a suggestion, never an automatic truth: the user confirms before the draft is built.',
      },
    },
    {
      n: 4,
      title: { zh: '选择生成草稿所用的流程', en: 'Pick the process to build from' },
      view: 'draft',
      target: 'template-list',
      userAction: {
        zh: '从排序后的列表里选出最接近的示例流程。',
        en: 'Chooses the closest worked example of how this kind of project is normally run.',
      },
      systemResponse: {
        zh: '展示每个候选流程的匹配度与命中的关键词；对新手还会用大白话说明它为什么合适。',
        en: 'Shows each candidate with a fit score, the matched keywords, and — for novices — a plain-language reason it fits.',
      },
      representation: {
        zh: '模板卡片，含阶段/任务数量、命中词与匹配度进度条。',
        en: 'Template cards with stage/task counts, matched terms and a fit bar.',
      },
      decision: {
        zh: '引导级别会改变这个面板：新手看到解释，专家看到自己用过的流程被排到最前。',
        en: 'Guidance level changes this panel: novices get explanations, experts get the processes they already ran, ranked first.',
      },
    },
    {
      n: 5,
      title: { zh: '创建项目', en: 'Create the project' },
      view: 'draft',
      target: 'create-project',
      userAction: {
        zh: '给项目命名，可以顺便把每个阶段指派给人，然后创建。',
        en: 'Names the project and optionally assigns each stage to a person, then creates it.',
      },
      systemResponse: {
        zh: '生成阶段与任务，从最终截止日期倒推每个任务的日期；如果时间不够会给出警告。',
        en: 'Generates stages and tasks, computes every task deadline backwards from the final date, and warns if the work does not fit the time available.',
      },
      representation: {
        zh: '草稿预览，列出每个阶段、其任务、推算出的日期区间，以及富余或差几天的标记。',
        en: 'Draft preview listing each stage, its tasks, their computed date range, and a slack / short-by badge.',
      },
      decision: {
        zh: '预览的存在是为了让用户在「提交之前」就看到选择的后果，而不是之后才发现。',
        en: 'The preview exists so the consequence of the choices is visible BEFORE committing, rather than after.',
      },
    },
    {
      n: 6,
      title: { zh: '在看板上检查计划', en: 'Inspect the plan on the board' },
      view: 'board',
      target: 'board-columns',
      userAction: { zh: '浏览各个阶段及其中的任务。', en: 'Scans the stages and the tasks inside them.' },
      systemResponse: {
        zh: '把任务按阶段分组，显示负责人、个人还是协作、推算出的截止日期与状态。',
        en: 'Groups tasks into stages, showing owner, individual-versus-collaborative, the computed deadline and the status of each one.',
      },
      representation: {
        zh: '阶段列；每张卡片带负责人头像、类型标记、日期与状态控件。',
        en: 'Stage columns; each card carries an owner avatar, a kind badge, a date and a status control.',
      },
      decision: {
        zh: '个人任务与协作任务放在同一个视图里，因为真实项目本来就是混在一起的（R3）——所以没有单独的「团队」板块。',
        en: 'Individual and collaborative work sit in one view because a real project mixes them (R3) — no separate "team" section.',
      },
    },
    {
      n: 7,
      title: { zh: '指派任务', en: 'Assign a task' },
      view: 'board',
      target: 'task-detail',
      prepare: 'open-task',
      userAction: {
        zh: '打开一个任务，改负责人，并把另一个人标为协助者。',
        en: 'Opens a task, changes the owner, and marks a second person as helping.',
      },
      systemResponse: {
        zh: '记录一个明确的负责人和若干协作者，并把该任务标为协作。',
        en: 'Records one accountable owner plus collaborators, and marks the task collaborative.',
      },
      representation: {
        zh: '任务详情面板：负责人下拉、个人/协作切换、协作者勾选框。',
        en: 'Task detail panel: owner select, Individual / Collaborative switch, collaborator checkboxes.',
      },
      decision: {
        zh: '即使是协作任务也只设一个负责人——用户研究显示「大家都负责」等于没人负责。',
        en: 'One accountable owner even for joint work — the research showed "everyone is responsible" means nobody is.',
      },
    },
    {
      n: 8,
      title: { zh: '声明谁等谁', en: 'Declare what has to wait for what' },
      view: 'board',
      target: 'dependency-list',
      prepare: 'focus-predecessor',
      userAction: {
        zh: '勾出必须先完成、这个任务才能开始的那些任务。',
        en: 'Ticks the tasks that must finish before this one can start.',
      },
      systemResponse: {
        zh: '拒绝任何会形成环的关系，重算所有日期，并报告现在有多少后续任务依赖它。',
        en: 'Rejects anything that would create a loop, recomputes every date, and reports how many later tasks now depend on this one.',
      },
      representation: {
        zh: '任务面板里的「等待」列表；卡片上出现「等待 n 项」标记和一个箭头计数。',
        en: '"Waits for" list in the task panel; the card gains a "waiting on n" badge and an arrow count.',
      },
      decision: {
        zh: '环检测是设计决策，不只是防御性代码：用户自己造出的环会让排期计算卡死。',
        en: 'The cycle guard is a design decision, not just defensive code: a user-created loop would otherwise hang the schedule.',
      },
    },
    {
      n: 9,
      title: { zh: '更新进度', en: 'Update progress' },
      view: 'board',
      target: 'task-status',
      userAction: {
        zh: '把任务设为「进行中」，或设为「等待他人」。',
        en: 'Sets a task to In progress, or to Waiting on others.',
      },
      systemResponse: {
        zh: '记录是谁改的，并写进共享的动态流。',
        en: 'Records the change against the person who made it and writes it to the shared activity feed.',
      },
      representation: {
        zh: '卡片上和详情面板里的状态控件。',
        en: 'Status control on the card and on the detail panel.',
      },
      decision: {
        zh: '「等待他人」是一个独立状态，因为 CW1 发现「等别人」是一种单独的协作困难，不等于「还没开始」。',
        en: '"Waiting on others" is a first-class status, because CW1 found waiting to be a distinct collaboration problem, not the same as "not started".',
      },
    },
    {
      n: 10,
      title: { zh: '队友更新自己那一块', en: 'A teammate updates their part' },
      view: 'board',
      target: 'simulate-update',
      userAction: {
        zh: '另一位成员更新自己的某个任务。',
        en: 'A different member updates one of their own tasks.',
      },
      systemResponse: {
        zh: '不需要刷新，改动就会到达：卡片闪烁、动态流记录谁做了什么，并弹出一条指名道姓的确认。',
        en: 'The change arrives without a refresh: the card flashes, the activity feed records who did what, and a confirmation names the person and the task.',
      },
      representation: {
        zh: '顶栏的 ⟳ 控件（它代替另一位登录用户——单浏览器原型没法同时展示两个用户）。',
        en: 'Header ⟳ control (this stands in for another signed-in user, which a single-browser prototype cannot show at once).',
      },
      decision: {
        zh: '这一处是「明确模拟」而不是「已实现」，并在 Limitation 一节里声明。',
        en: 'Explicitly simulated rather than implemented — declared in the Limitations section.',
      },
    },
    {
      n: 11,
      title: { zh: '查看排期', en: 'Read the schedule' },
      view: 'calendar',
      target: 'timeline-bars',
      userAction: { zh: '查看每个任务该在什么时候做。', en: 'Checks when each task has to happen.' },
      systemResponse: {
        zh: '把所有任务放到日历上，从最终截止日期倒推得出；标出截止日期和今天。',
        en: 'Places every task on a calendar, computed backwards from the final deadline, with the deadline and today marked.',
      },
      representation: {
        zh: '月历网格；任务跨天画成一条色条，按状态着色，逾期会加红框。',
        en: 'Month grid; a task spanning several days is one bar, coloured by status and outlined when overdue.',
      },
      decision: {
        zh: '没有使用甘特图库——倒推计算本身就是被演示的重点，所以写成看得见的纯函数。网格也从横向甘特改成了月历：甘特在笔记本屏上必须横向滚动才能看完整份计划，而排期最忌讳的就是看不全。',
        en: 'No Gantt library was used — the backwards calculation is the point being demonstrated, so it is written as visible pure functions. The layout also moved from a horizontal Gantt to a month grid: on a laptop the Gantt needed sideways scrolling to see a whole plan, which is the one thing a schedule must not do.',
      },
    },
    {
      n: 12,
      title: { zh: '看看成员端有什么不同', en: 'See the difference for a member' },
      view: 'calendar',
      target: 'role-switcher',
      userAction: {
        zh: '改为以普通成员身份登录。',
        en: 'Signs in as an ordinary team member instead.',
      },
      systemResponse: {
        zh: '别人负责的任务色条被弱化，成员只看到属于自己的那部分排期。',
        en: 'Bars for work owned by other people are visually de-emphasised, so the member sees their own part of the schedule.',
      },
      representation: {
        zh: '顶栏的登录控件；日历上的色条有主次之分。',
        en: 'Sign-in control in the header; bars on the calendar have a clear primary/secondary distinction.',
      },
      decision: {
        zh: '成员不应该看到全部协调细节——CW1 发现，把协调信息全部暴露会给只需要自己那部分的人增加噪音。角色差异是结构性的（渲染与否、强弱对比），不是一个标签。',
        en: 'Members should not be shown every coordination detail — CW1 found that exposing all of it adds noise for people who only need their own part. The role difference is structural (what renders, and with what emphasis), not a label.',
      },
    },
    {
      n: 13,
      title: { zh: '追踪依赖链', en: 'Trace a dependency' },
      view: 'flow',
      target: 'dependency-map',
      userAction: { zh: '点击那个已经落后的任务。', en: 'Clicks the task that is behind.' },
      systemResponse: {
        zh: '双向追踪整条链——它在等什么，以及它会拖累什么——并让其余节点淡出。',
        en: 'Traces the whole chain in both directions — everything it waits for and everything that would slip with it — and fades the rest.',
      },
      representation: {
        zh: '依赖关系图，无关节点淡出，并显示被追踪任务的详情面板。',
        en: 'Dependency map with dimmed unrelated nodes and a traced-task panel.',
      },
      decision: {
        zh: '这张图用的是排期算法走过的同一份依赖列表，所以图和日期不可能互相矛盾。',
        en: 'The graph is drawn from the same dependency list the scheduler walks, so the picture and the dates cannot disagree.',
      },
    },
  ],
}

/** A second, shorter script for a different user group. */
const soloScript: Walkthrough = {
  id: 'w_solo',
  label: {
    zh: '个人规划者适应陌生流程',
    en: 'Individual planner adapts an unfamiliar process',
  },
  scenarioId: 's_unfamiliar_individual',
  task: {
    zh: '一个从未做过这类规划的人，把一条聊天消息变成带日期的清单。',
    en: 'A person who has never planned this kind of trip turns a chat message into a dated checklist.',
  },
  steps: [
    {
      n: 1,
      title: { zh: '选择用户群', en: 'Choose the user group' },
      view: 'draft',
      target: 'scenario-switcher',
      userAction: {
        zh: '选择「个人 · 不熟悉流程」这一组。',
        en: 'Selects the individual, unfamiliar group.',
      },
      systemResponse: {
        zh: '切换到该成员并把引导设为「新手」，这会改变原型后面所有说明的多少。',
        en: 'Switches to that participant and turns guidance to Novice, which changes what the rest of the prototype explains.',
      },
      representation: { zh: '顶栏的用户群控件。', en: 'Scenario control in the header.' },
      decision: {
        zh: '所有用户群共用同一批界面，只有协助级别和角色不同。',
        en: 'The same screens serve all groups; only the assistance level and role change.',
      },
    },
    {
      n: 2,
      title: { zh: '粘贴一条简短聊天消息', en: 'Paste a short chat message' },
      view: 'draft',
      target: 'sample-sources',
      userAction: {
        zh: '粘贴一条关于周末出行的两行消息。',
        en: 'Pastes a two-line message about a weekend trip.',
      },
      systemResponse: {
        zh: '识别为聊天消息，解析出中文截止日期表达，并推断为小规模计划。',
        en: 'Recognises it as a chat message, finds the Chinese deadline expression, and infers a small-scale plan.',
      },
      representation: {
        zh: '一键示例信息源；以及这条简短、口语化信息源对应的解析面板。',
        en: 'One-click sample sources; the analyser panel for a short, informal source.',
      },
      decision: {
        zh: '简短含糊的输入才是常态、不是例外，所以解析器必须能处理「截止日期没有用标准格式写」的情况。',
        en: 'Short, vague inputs are the normal case, not the exception, so the analyser must cope with them without a deadline stated in a standard format.',
      },
    },
    {
      n: 3,
      title: { zh: '看看通常包含哪些步骤', en: 'See which steps are normally involved' },
      view: 'draft',
      target: 'template-list',
      userAction: {
        zh: '读取系统建议的流程，而不是自己凭空想。',
        en: 'Reads the suggested process rather than inventing one.',
      },
      systemResponse: {
        zh: '给出这类任务的示例流程，按匹配度排序，并说明每套为什么合适。',
        en: 'Offers worked examples for this kind of task with a reason each one fits, ranked by fit score.',
      },
      representation: {
        zh: '带解释文字的模板卡片——也就是引导级别的「新手」分支。',
        en: 'Template cards with explanations visible — the Novice branch of the guidance level.',
      },
      decision: {
        zh: '不熟悉流程的用户拿到一个可改的起始结构；任务书把这称为「流程示例」，CW1 数据也支持（低熟悉度受访者更多选择示例）。',
        en: 'The unfamiliar user gets a starting structure; the brief called this "process examples" and the CW1 data supported it (low-familiarity respondents chose examples more often).',
      },
    },
    {
      n: 4,
      title: { zh: '留意这条消息从没说过的事', en: 'Note what the message never said' },
      view: 'draft',
      target: 'missing-info',
      userAction: {
        zh: '查看消息里缺失的细节清单。',
        en: 'Reviews the list of details the message did not include.',
      },
      systemResponse: {
        zh: '逐条点明缺失项，而不是默默填上。',
        en: 'Names each missing detail explicitly instead of filling it in silently.',
      },
      representation: { zh: '「信息源未提及」面板。', en: '"Not stated in the source" panel.' },
      decision: {
        zh: '这是对 CW1「准确性与可控性」顾虑的设计回应。',
        en: 'This is the design answer to the accuracy-and-control concern in the CW1 findings.',
      },
    },
    {
      n: 5,
      title: { zh: '检查生成的日期', en: 'Check the resulting dates' },
      view: 'board',
      target: 'task-card',
      userAction: {
        zh: '查看生成的任务及其日期。',
        en: 'Looks at the generated tasks and their dates.',
      },
      systemResponse: {
        zh: '每个任务都带工作量、推算出的截止日期，以及一行说明这个步骤为什么存在的提示。',
        en: 'Each task carries an estimate, a computed deadline, and a hint explaining why the step exists.',
      },
      representation: {
        zh: '带提示块的任务卡（只有新手引导才显示）。',
        en: 'Task cards with the hint block visible (novice guidance only).',
      },
      decision: {
        zh: '提示是挂在单个任务上的，不是做成教程——解释出现在要做决定的地方。',
        en: 'Hints are attached per task, not shown as a tutorial — the explanation appears where the decision is made.',
      },
    },
  ],
}

/**
 * The fourth group: a planner who already knows the process.
 *
 * The other scripts follow someone learning the tool. This one follows the
 * opposite case CW1 identified — a person who has done this before, and whose need
 * is to get their existing process in quickly rather than to be taught. The point
 * being demonstrated is that the same screens behave differently: nothing is
 * explained, prior work is surfaced first, and the checklist is offered for reuse.
 */
const familiarSoloScript: Walkthrough = {
  id: 'w_familiar_solo',
  label: {
    zh: '熟手个人规划者快速套用已有流程',
    en: 'Experienced planner reuses a process they already know',
  },
  scenarioId: 's_familiar_individual',
  task: {
    zh: '一个做过很多次差旅规划的人，把公开报名信息变成一份自己能直接执行的行程。',
    en: 'A frequent traveller turns a public announcement into an itinerary they can act on immediately.',
  },
  steps: [
    {
      n: 1,
      title: { zh: '粘进公开信息，直接给结论', en: 'Paste the announcement and get straight to the plan' },
      view: 'draft',
      target: 'source-input',
      userAction: {
        zh: '粘进一段公开报名通知，不再阅读任何操作说明。',
        en: 'Pastes a public registration notice, without reading any instructions first.',
      },
      systemResponse: {
        zh: '解析出截止日期、义务句和缺失信息；专家级别下不显示任何解释性提示。',
        en: 'Extracts the deadline, the obligations and the gaps — with no explanatory hints shown at the expert level.',
      },
      representation: {
        zh: '解析面板本身；新手会在这里看到额外提示，专家看不到。',
        en: 'The analyser panel itself; a novice would see extra hints here, an expert does not.',
      },
      decision: {
        zh: '同一个界面，两种引导。「专家」不是另一套 mock-up，而是同一批界面关掉了讲解层。',
        en: 'One screen, two guidance levels. "Expert" is not a separate mock-up; it is the same screens with the explanation layer switched off.',
      },
    },
    {
      n: 2,
      title: { zh: '系统把他熟悉的流程排在前面', en: 'The process they already know is ranked first' },
      view: 'draft',
      target: 'template-list',
      userAction: {
        zh: '扫一眼排在最前面的那套流程。',
        en: 'Glances at the top-ranked process.',
      },
      systemResponse: {
        zh: '以前用过的流程排在最前，显示使用次数；匹配度条给出一个可比较的分数。',
        en: 'Previously used processes are listed first with their usage count, and a fit bar gives a comparable score.',
      },
      representation: {
        zh: '模板卡上的「用过 N 次」标签与匹配度条。',
        en: 'The "used N×" label and the fit bar on each template card.',
      },
      decision: {
        zh: '熟手要的不是解释，是确认。所以这里给的是历史用量和可比较的分数，而不是「为什么推荐它」。',
        en: 'An expert does not want an explanation, they want confirmation — so this shows usage history and a comparable score rather than "why we recommend it".',
      },
    },
    {
      n: 3,
      title: { zh: '整套检查清单直接被复用', en: 'The whole checklist is reused as-is' },
      view: 'draft',
      target: 'create-project',
      userAction: { zh: '直接创建项目，不逐个修改任务。', en: 'Creates the project without editing tasks one by one.' },
      systemResponse: {
        zh: '生成带日期的任务，并把模板里的可复用检查清单挂到每个任务上。',
        en: 'Generates dated tasks and attaches the template’s reusable checklist to each task.',
      },
      representation: {
        zh: '创建按钮，以及结果里的检查清单行。',
        en: 'The create button, and the checklist rows in the result.',
      },
      decision: {
        zh: 'R2 的专家分支要能看见具体产出：不是「我们相信你很熟」，而是真的把历史经验交回给他。',
        en: 'The expert branch of R2 has to produce something visible: not "we trust you know this" but the prior experience actually handed back.',
      },
    },
    {
      n: 4,
      title: { zh: '一眼看出哪些任务会互相拖累', en: 'See at a glance what holds up what' },
      view: 'flow',
      target: 'dependency-map',
      userAction: { zh: '打开依赖关系图确认顺序。', en: 'Opens the dependency map to confirm the order.' },
      systemResponse: {
        zh: '画出依赖图，并把当前不被阻塞、可以立刻开始的任务单独列出。',
        en: 'Draws the dependency graph and lists separately the tasks that are not blocked and can start now.',
      },
      representation: {
        zh: '图本身，以及「现在可以开始」面板。',
        en: 'The graph itself, plus the "ready to start now" panel.',
      },
      decision: {
        zh: '熟手关心的是「我现在能不能动手」。所以除了整张图，另外单独回答这一个问题。',
        en: 'What an expert wants to know is "can I start right now", so that single question is answered separately from the graph.',
      },
    },
    {
      n: 5,
      title: { zh: '按真实日期核对行程', en: 'Check the plan against real dates' },
      view: 'calendar',
      target: 'timeline-bars',
      userAction: { zh: '在日历上核对自己那几件事落在哪几天。', en: 'Checks on the calendar which days their own work falls on.' },
      systemResponse: {
        zh: '把任务放到月历上，每个人负责的部分用主次区分。',
        en: 'Places the tasks on a month grid, with each person’s part distinguished by emphasis.',
      },
      representation: {
        zh: '月历色条；本人负责的部分更醒目。',
        en: 'Calendar bars, with the signed-in person’s own work standing out.',
      },
      decision: {
        zh: '个人项目只有一个人，但仍然要把「我的」和「别人的」分开——因为报名类任务常常同时涉及自己和一个外部联系人。',
        en: 'A solo project still distinguishes "mine" from "someone else’s", because registration-type tasks routinely involve the user and one external contact.',
      },
    },
  ],
}

/**
 * The error-prevention script.
 *
 * A demonstrator's question about a planning tool is almost always "what stops me
 * making a mess?" — so this script walks the *defences* rather than the happy
 * path. It deliberately pairs each case with the moment the interface intervenes:
 * prevention where possible (the option is disabled and explains itself), an
 * error message only where prevention cannot apply.
 */
const guardScript: Walkthrough = {
  id: 'w_guards',
  label: {
    zh: '错误提示与防错',
    en: 'Error prevention and error messages',
  },
  scenarioId: 's_familiar_collaborative',
  task: {
    zh: '让一个错日期、一个过期截止日和一个依赖环都无法进入计划',
    en: 'Stop a bad date, a passed deadline and a dependency loop from entering the plan',
  },
  steps: [
    {
      n: 1,
      title: { zh: '信息源里出现了不存在的日期', en: 'An impossible date in the source' },
      view: 'draft',
      target: 'guard-invalid-source-date',
      prepare: 'invalid-date-source',
      userAction: {
        zh: '粘贴一段写着「截止日期 2 月 31 日」的信息源。',
        en: 'Paste a source that says "due 31 February".',
      },
      systemResponse: {
        zh: '系统指出这个日期在日历上不存在，跳过它，并用找到的下一个有效日期。',
        en: 'The system states that the date does not exist in the calendar, skips it, and uses the next valid date it finds.',
      },
      representation: {
        zh: '红色提示条，直接引用原文中出现问题的那个日期，并说明它被跳过了。',
        en: 'A red alert that quotes the offending date from the source and says it was skipped.',
      },
      decision: {
        zh: '关键点：这一条原本是个真实缺陷。JavaScript 的 `new Date(2026, 1, 31)` 不会报错，而是悄悄滚到 3 月 3 日——所以「2 月 31 日」以前会变成一个错误但看起来正常的日期，并传染给每一个倒推出来的任务日期。',
        en: 'The important point: this was a real defect. JavaScript\'s `new Date(2026, 1, 31)` does not fail, it silently rolls over to 3 March — so "31 February" used to become a wrong-but-plausible date that propagated into every computed task date.',
      },
    },
    {
      n: 2,
      title: { zh: '把截止日期改到过去', en: 'Setting the deadline in the past' },
      view: 'draft',
      target: 'guard-deadline-past',
      prepare: 'past-deadline',
      userAction: {
        zh: '在「最终截止日期」里选一个已经过去的日期。',
        en: 'Choose a date that has already passed in the final-deadline field.',
      },
      systemResponse: {
        zh: '系统说明：从过去往前倒推，所有任务都会落在过去，这份计划没法执行。',
        en: 'The system explains that scheduling backwards from a past date would put every task in the past, so the plan could not be worked.',
      },
      representation: {
        zh: '输入框下方的红色提示条，同时说明怎么处理。',
        en: 'A red alert under the field, together with what to do about it.',
      },
      decision: {
        zh: '防错而不是报错：这个提示在按下按钮之前就出现，而不是等生成完之后再拒绝。',
        en: 'Prevention rather than an error message: the alert appears before the button is pressed, not after generation has been refused.',
      },
    },
    {
      n: 3,
      title: { zh: '按钮为什么是灰的', en: 'Why the button is grey' },
      view: 'draft',
      target: 'guard-submit-reason',
      prepare: 'past-deadline',
      userAction: {
        zh: '把鼠标移到「创建项目」按钮上。',
        en: 'Hover the create button while the deadline is invalid.',
      },
      systemResponse: {
        zh: '系统在按钮下方写明确切的阻塞原因，并把它作为按钮的悬停提示。',
        en: 'The system states the exact blocking reason below the button and repeats it as the button\'s hover title.',
      },
      representation: {
        zh: '置灰的按钮 + 一行说明原因的文字。',
        en: 'A disabled button plus one line naming the reason.',
      },
      decision: {
        zh: '一个不说明原因的灰按钮会被当成「原型坏了」，而不是「我还有没填的东西」。禁用一个操作必须同时给出理由。',
        en: 'A grey button with no explanation reads as a broken prototype rather than as an unmet requirement. Disabling an action must come with its reason.',
      },
    },
    {
      n: 4,
      title: { zh: '阻止依赖环', en: 'Blocking a dependency loop' },
      view: 'board',
      target: 'cycle-prevention',
      prepare: 'cycle-prevention',
      userAction: {
        zh: '打开一个任务，在「等待（须先完成）」里找一个已经（直接或间接）在等这个任务的任务。',
        en: 'Open a task and look for a task in the "waits for" list that already waits for this one, directly or through another.',
      },
      systemResponse: {
        zh: '该选项被禁用并置灰，旁边写明它会让两个任务互相等待；悬停还能看到完整原因。',
        en: 'That option is disabled and greyed out, labelled as making two tasks wait for each other, with the full reason on hover.',
      },
      representation: {
        zh: '不可勾选的复选框 + 行内原因 + 列表上方一行总体说明。',
        en: 'An untickable checkbox, an inline reason, and one line above the list explaining the pattern.',
      },
      decision: {
        zh: '这是最典型的「防错优于报错」。store 里本来就有环检测，但它只能在点击之后拒绝——而一个「点了又弹回去」的复选框看起来就是 bug。',
        en: 'This is the clearest case of prevention beating an error message. The store already had a cycle guard, but it could only refuse after the click — and a checkbox that springs back looks like a bug.',
      },
    },
    {
      n: 5,
      title: { zh: '保存失败时不能沉默', en: 'A failed save must not be silent' },
      view: 'board',
      target: 'guard-storage',
      userAction: {
        zh: '在浏览器拒绝写入本地存储的情况下继续操作（无痕模式、磁盘已满、站点数据被拦截）。',
        en: 'Keep working while the browser refuses to write local storage — private browsing, a full disk, or blocked site data.',
      },
      systemResponse: {
        zh: '系统显示一条持续存在的红色通栏警告，说明这次改动只保留到刷新为止，并说明可能的原因。',
        en: 'The system shows a persistent red banner explaining that edits survive only until reload, and naming the likely causes.',
      },
      representation: {
        zh: '界面顶部的常驻警告条（可关闭），而不是几秒钟就消失的提示。',
        en: 'A persistent dismissible banner at the top, not a toast that vanishes in a few seconds.',
      },
      decision: {
        zh: '这一点以前是真的没做：写入失败被 `catch {}` 吞掉了，用户会以为自己在正常使用，其实一刷新全没了。「我们帮你存好了」这种沉默是最糟的沉默。',
        en: 'This genuinely was missing: a failed write was swallowed by `catch {}`, so the user believed their work was being kept when a single refresh would lose it. Claiming to save when you are not is the worst kind of silence.',
      },
    },
    {
      n: 6,
      title: { zh: '把风险摆在同一屏上', en: 'Putting the risks on one screen' },
      view: 'draft',
      target: 'guard-review',
      userAction: {
        zh: '在生成草稿之前，看一遍右侧的检查结果。',
        en: 'Before generating the draft, read the checks on the right.',
      },
      systemResponse: {
        zh: '系统在同一处列出：识别到的截止日期及其原文出处、信息源里没提到的内容、以及时间不够时的「差 N 天」。',
        en: 'The system lists, in one place: the deadline and the sentence it came from, what the source did not state, and a "N days short" warning when the work does not fit the window.',
      },
      representation: {
        zh: '来源引用、缺失项清单、以及工期缺口警告，全部位于创建按钮之前。',
        en: 'Source quotation, a list of gaps, and a shortfall warning — all before the create button.',
      },
      decision: {
        zh: '「信息源未提及」这一块是刻意的：系统不编造没写的东西，而是把缺口交回给用户。原型宁可显得信息少，也不假装知道。',
        en: 'The "not stated in the source" block is deliberate: rather than inventing what was never written, the system hands the gap back to the user. The prototype would rather look under-informed than pretend to know.',
      },
    },
  ],
}

export const WALKTHROUGHS: Walkthrough[] = [
  coordinatorScript,
  soloScript,
  familiarSoloScript,
  guardScript,
]

export function walkthroughById(id: string | null): Walkthrough {
  return WALKTHROUGHS.find((w) => w.id === id) ?? WALKTHROUGHS[0]
}
