/**
 * R1 — Source understanding.
 *
 * The prototype deliberately does NOT call a remote LLM. Instead it runs a
 * deterministic, inspectable analyser over the raw information source (email
 * note, calendar entry, chat message, brief, file text). The analyser output is
 * surfaced to the user and can be corrected before a workflow draft is built.
 *
 * `LLM_EXTRACTION_ENDPOINT` marks the single seam where a real model call would
 * be substituted; see `llmAdapter.ts`.
 */

import type { ProjectScale, SourceKind } from '../domain/types'

export interface SourceAnalysis {
  /** Detected (or user-corrected) kind of the information source. */
  kind: SourceKind
  confidence: number
  /** ISO date (yyyy-mm-dd) if a deadline expression could be parsed. */
  deadline: string | null
  /** The raw phrase the deadline came from, shown as provenance. */
  deadlinePhrase: string | null
  /**
   * True when the source did not state the deadline and the value was derived
   * from a named event/date in the text or defaulted. Drives a confirmation step.
   */
  deadlineInferred: boolean
  scale: ProjectScale
  /** Sentence-level obligations found in the text — the evidence trail. */
  obligations: string[]
  /** Concepts the template matcher scored against. */
  keywords: string[]
  /** People named or implied in the source. */
  people: string[]
  /** Concepts people reported struggling with (see the user research). */
  missingInfo: string[]
  /** How many actionable obligations were found; steers the draft size. */
  cueCount: number
  /**
   * Date-like phrases in the source that are not real calendar dates, e.g. "31
   * February". Surfaced to the user rather than silently ignored, because it
   * usually indicates a typo in the source that they need to know about.
   */
  invalidDates: RejectedDate[]
}

const MONTHS: Record<string, number> = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
}

const CN_MONTHS: Record<string, number> = {
  '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6,
  '七': 7, '八': 8, '九': 9, '十': 10, '十一': 11, '十二': 12,
}

const STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'have', 'has', 'will',
  'need', 'needs', 'must', 'should', 'please', 'about', 'into', 'your', 'you',
  'our', 'their', 'then', 'than', 'them', 'there', 'here', 'when', 'what',
  'which', 'while', 'would', 'could', 'also', 'been', 'were', 'was', 'are',
  'all', 'any', 'can', 'not', 'but', 'out', 'its', 'it', 'is', 'be', 'to',
  'of', 'in', 'on', 'at', 'by', 'as', 'or', 'an', 'a', 'we', 'i', 'they',
  'he', 'she', 'his', 'her', 'do', 'does', 'did', 'so', 'if', 'up', 'no',
  'yes', 'very', 'just', 'some', 'more', 'most', 'other', 'each', 'how',
  'who', 'whom', 'why', 'where', 'get', 'got', 'make', 'made', 'take',
  'time', 'day', 'week', 'month', 'year', 'please', 'hi', 'hello', 'thanks',
  'thank', 'regards', 'best', 'dear', 'team', 'everyone', 'guys',
  '的', '了', '和', '与', '在', '是', '我', '你', '他', '她', '我们', '你们',
  '他们', '这', '那', '有', '要', '会', '就', '都', '也', '还', '把', '被',
  '给', '对', '从', '到', '请', '让', '一个', '一下', '需要', '可以', '然后',
])

/** Action verbs that signal an obligation the user is expected to carry out. */
const ACTION_CUES = [
  // English
  'prepare', 'write', 'draft', 'submit', 'collect', 'gather', 'review', 'book',
  'reserve', 'confirm', 'design', 'build', 'test', 'present', 'send', 'email',
  'contact', 'schedule', 'organise', 'organize', 'plan', 'rehearse', 'record',
  'edit', 'upload', 'deliver', 'finalise', 'finalize', 'check', 'analyse',
  'analyze', 'research', 'interview', 'assign', 'circulate', 'approve',
  // Chinese
  '准备', '撰写', '写', '提交', '收集', '汇总', '审阅', '预订', '确认', '设计',
  '搭建', '测试', '演讲', '汇报', '发送', '联系', '安排', '组织', '计划', '彩排',
  '录制', '剪辑', '上传', '交付', '定稿', '检查', '分析', '调研', '访谈', '分配',
  '整理', '排版', '翻译', '校对',
]

const COLLABORATION_CUES = [
  ['group', 'team', 'we ', 'our ', 'together', 'jointly', 'collaborat', 'pair',
    'divide', 'split', 'assign', 'everyone', 'members'],
  ['小组', '团队', '我们', '一起', '共同', '协作', '分工', '分配', '大家', '成员', '合作'],
]

const INDIVIDUAL_CUES = [
  ['i need to', 'i will', 'myself', 'personally', 'my own', 'on my own'],
  ['我自己', '个人', '独自', '我负责'],
]

const DEPENDENCY_CUES = [
  ['after', 'once', 'before', 'depends on', 'waiting for', 'as soon as',
    'following', 'then', 'first', 'until', 'subject to', 'pending'],
  ['之后', '以后', '之前', '等', '依赖', '取决于', '然后', '首先', '直到', '收到后', '确认后'],
]

const KIND_MARKERS: Array<{ kind: SourceKind; terms: string[]; weight: number }> = [
  {
    kind: 'calendar',
    terms: ['calendar', 'invite', 'meeting request', 'zoom', 'teams meeting',
      '日程', '日历', '会议邀请', '会议室'],
    weight: 4,
  },
  {
    kind: 'email',
    terms: ['from:', 'to:', 'subject:', 'dear', 'kind regards', 'best regards',
      'sincerely', 'forwarded message', '邮件', '收件人', '发件人', '主题'],
    weight: 4,
  },
  {
    kind: 'chat',
    terms: ['wechat', 'whatsapp', 'slack', 'teams chat', 'dm', '群', '微信',
      '聊天', '群里', '消息'],
    weight: 3,
  },
  {
    kind: 'brief',
    terms: ['assignment', 'brief', 'coursework', 'module', 'deadline',
      'requirements', 'deliverable', 'rubric', '任务书', '作业', '课程',
      '要求', '评分'],
    weight: 3,
  },
  {
    kind: 'file',
    terms: ['.docx', '.pdf', '.xlsx', '.pptx', 'attachment', 'attached',
      '附件', '文档', '表格'],
    weight: 3,
  },
]

function normalise(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ').trim()
}

/** A deadline candidate that was found but is not a real calendar date. */
export interface RejectedDate {
  /** The text that looked like a date. */
  phrase: string
  /** The (impossible) ISO string it would have produced. */
  wouldBe: string
}

export interface DeadlineResult {
  date: string | null
  phrase: string | null
  /**
   * Candidates that matched the patterns but are not real dates, e.g. "31
   * February". They are reported rather than silently dropped, because a source
   * containing an impossible date is more likely to be a typo the user needs to
   * know about than a phrase to ignore.
   */
  rejected: RejectedDate[]
}

/**
 * Parse an explicit date expression. Returns null when nothing usable is found.
 *
 * Every candidate is validated with `isRealDate` before being accepted, and
 * impossible candidates are collected into `rejected` instead of silently
 * rolling over. `new Date(2026, 1, 31)` becomes 3 March rather than throwing, so
 * without this check the sentence "due 31 February" produced a deadline of
 * 2026-02-31 which then propagated into every computed task date.
 */
export function parseDeadline(text: string, reference = new Date()): DeadlineResult {
  const src = normalise(text)
  const rejected: RejectedDate[] = []

  /** Accept a candidate if it exists, otherwise record why it was refused. */
  const accept = (
    y: number,
    m: number,
    d: number,
    phrase: string,
  ): { date: string; phrase: string } | null => {
    if (!isRealDate(y, m, d)) {
      rejected.push({ phrase, wouldBe: fmt(y, m, d) })
      return null
    }
    return { date: fmt(y, m, d), phrase }
  }

  // 1. ISO / numeric dates: 2026-11-05, 2026/11/5, 05/11/2026
  for (const iso of src.matchAll(/\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/g)) {
    const ok = accept(Number(iso[1]), Number(iso[2]), Number(iso[3]), iso[0])
    if (ok) return { ...ok, rejected }
  }
  for (const dmy of src.matchAll(/\b(\d{1,2})[-/.](\d{1,2})[-/.](20\d{2})\b/g)) {
    const ok = accept(Number(dmy[3]), Number(dmy[2]), Number(dmy[1]), dmy[0])
    if (ok) return { ...ok, rejected }
  }

  // 2. "5 November 2026" / "27 October 2026 before 17:00" / "November 5th"
  //
  // The pattern is deliberately permissive and every candidate is then
  // *validated* against the month table, because a real brief contains phrases
  // like "5 minutes of questions" where the word after the number is not a
  // month. Taking the first regex hit and trusting it made the analyser miss the
  // genuine "27 October 2026" further down the same paragraph and invent a
  // deadline instead. The year group is optional, so the pattern must not end in
  // `\b` — with an optional trailing group that boundary would have to hold just
  // after the month name, where the next character is a space, and the match
  // would fail. A trailing lookahead is the correct guard: it consumes nothing.
  const dayFirst = /\b(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})\.?(?:\s+(20\d{2}))?(?![\w-])/g
  for (const m of src.matchAll(dayFirst)) {
    const month = MONTHS[m[2].toLowerCase()]
    if (!month) continue
    const day = Number(m[1])
    if (day < 1 || day > 31) continue
    const y = m[3] ? Number(m[3]) : inferYear(month, reference)
    const ok = accept(y, month, day, m[0].trim())
    if (ok) return { ...ok, rejected }
  }

  // "November 5, 2026" / "November 5th"
  const monthFirst = /\b([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?(?:\s+(20\d{2}))?(?![\w-])/g
  for (const m of src.matchAll(monthFirst)) {
    const month = MONTHS[m[1].toLowerCase()]
    if (!month) continue
    const day = Number(m[2])
    if (day < 1 || day > 31) continue
    const y = m[3] ? Number(m[3]) : inferYear(month, reference)
    const ok = accept(y, month, day, m[0].trim())
    if (ok) return { ...ok, rejected }
  }

  // 3. Chinese: 2026年11月5日 / 11月5日 / 十一月五日
  //
  // Whitespace is allowed around the unit characters because Chinese dates are
  // routinely written with spaces for readability — "2 月 31 日". Without the
  // optional spaces the pattern only matched the run-together form and a
  // space-separated impossible date was not even detected, let alone reported.
  for (const cnFull of src.matchAll(
    /((?:20\d{2})\s*年\s*)?(\d{1,2})\s*月\s*(\d{1,2})\s*[日号]/g,
  )) {
    const m = Number(cnFull[2])
    const y = cnFull[1] ? Number(cnFull[1].replace(/\D/g, '')) : inferYear(m, reference)
    const ok = accept(y, m, Number(cnFull[3]), cnFull[0].trim())
    if (ok) return { ...ok, rejected }
  }
  for (const cnWord of src.matchAll(
    /([一二三四五六七八九十]{1,3})\s*月\s*([一二三四五六七八九十]{1,3})\s*[日号]/g,
  )) {
    const m = CN_MONTHS[cnWord[1]]
    const d = CN_MONTHS[cnWord[2]] ?? cnNumber(cnWord[2])
    if (!m || !d) continue
    const ok = accept(inferYear(m, reference), m, d, cnWord[0].trim())
    if (ok) return { ...ok, rejected }
  }

  // 4. Relative expressions. These are computed rather than parsed, so they are
  //    real dates by construction and need no validation.
  const relEn = src.match(/\b(?:in|within)\s+(\d{1,3})\s+(day|week|month)s?\b/i)
  if (relEn) {
    const n = Number(relEn[1])
    const unit = relEn[2].toLowerCase()
    const d = new Date(reference)
    if (unit === 'day') d.setDate(d.getDate() + n)
    if (unit === 'week') d.setDate(d.getDate() + n * 7)
    if (unit === 'month') d.setMonth(d.getMonth() + n)
    return {
      date: fmt(d.getFullYear(), d.getMonth() + 1, d.getDate()),
      phrase: relEn[0],
      rejected,
    }
  }
  const relEn2 = src.match(/\b(next|this)\s+(week|monday|tuesday|wednesday|thursday|friday|saturday|sunday|month)\b/i)
  if (relEn2) {
    const d = new Date(reference)
    const which = relEn2[1].toLowerCase()
    const target = relEn2[2].toLowerCase()
    if (target === 'month') {
      d.setMonth(d.getMonth() + (which === 'next' ? 1 : 0))
      d.setDate(1)
    } else if (target === 'week') {
      d.setDate(d.getDate() + (which === 'next' ? 7 : 0))
    } else {
      const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
      const idx = days.indexOf(target)
      let delta = (idx - d.getDay() + 7) % 7
      if (which === 'next') delta += delta === 0 ? 7 : 0
      if (delta === 0) delta = 7
      d.setDate(d.getDate() + delta)
    }
    return {
      date: fmt(d.getFullYear(), d.getMonth() + 1, d.getDate()),
      phrase: relEn2[0],
      rejected,
    }
  }
  const relCn = src.match(/(\d{1,3}|[一二三四五六七八九十两]{1,3})\s*(天|周|个?月)(?:后|内|以后|之后)/)
  if (relCn) {
    // Accept Chinese numerals as well as digits: "三天后" is as common as "3天后".
    const n = /^\d+$/.test(relCn[1]) ? Number(relCn[1]) : (cnNumber(relCn[1]) ?? 1)
    const unit = relCn[2]
    const d = new Date(reference)
    if (unit === '天') d.setDate(d.getDate() + n)
    else if (unit === '周') d.setDate(d.getDate() + n * 7)
    else d.setMonth(d.getMonth() + n)
    return {
      date: fmt(d.getFullYear(), d.getMonth() + 1, d.getDate()),
      phrase: relCn[0],
      rejected,
    }
  }
  const relCn2 = src.match(/(下周|本周|这周|下个?月|这个?月)/)
  if (relCn2) {
    const d = new Date(reference)
    const t = relCn2[1]
    if (t.includes('月')) {
      d.setMonth(d.getMonth() + (t.startsWith('下') ? 1 : 0))
      d.setDate(1)
    } else {
      d.setDate(d.getDate() + (t.startsWith('下') ? 7 : 0))
    }
    return {
      date: fmt(d.getFullYear(), d.getMonth() + 1, d.getDate()),
      phrase: relCn2[0],
      rejected,
    }
  }

  // 5. Bare day-of-month next to a deadline cue, e.g. "due on the 20th"
  const dayOnly = src.match(/\b(?:by|due|before|on)\s+(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)\b/i)
  if (dayOnly) {
    const d = Number(dayOnly[1])
    const now = reference
    let m = now.getMonth() + 1
    let y = now.getFullYear()
    if (d < now.getDate()) {
      m += 1
      if (m > 12) { m = 1; y += 1 }
    }
    return { date: fmt(y, m, d), phrase: dayOnly[0], rejected }
  }

  return { date: null, phrase: null, rejected }
}

function cnNumber(s: string): number | null {
  const digits: Record<string, number> = {
    '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6,
    '七': 7, '八': 8, '九': 9, '十': 10,
  }
  if (s === '十') return 10
  if (s.startsWith('十')) return 10 + (digits[s[1]] ?? 0)
  if (s.endsWith('十')) return (digits[s[0]] ?? 0) * 10
  if (s.includes('十')) {
    const [a, b] = s.split('十')
    return (digits[a] ?? 0) * 10 + (digits[b] ?? 0)
  }
  return digits[s] ?? null
}

function inferYear(month: number, reference: Date): number {
  // A month already behind us almost certainly means next calendar year.
  return month < reference.getMonth() + 1 ? reference.getFullYear() + 1 : reference.getFullYear()
}

export function fmt(y: number, m: number, d: number): string {
  const mm = String(m).padStart(2, '0')
  const dd = String(d).padStart(2, '0')
  return `${y}-${mm}-${dd}`
}

/**
 * True when y-m-d exists in the calendar.
 *
 * `new Date(2026, 1, 31)` silently rolls over to 3 March rather than failing, so a
 * date has to be validated by round-tripping it: build the Date, then read the
 * parts back and check they match what was asked for. Without this, a source
 * saying "31 February" produced a deadline of 2026-02-31 that then propagated
 * into every computed task date.
 */
export function isRealDate(y: number, m: number, d: number): boolean {
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return false
  if (m < 1 || m > 12 || d < 1 || d > 31) return false
  const probe = new Date(y, m - 1, d)
  return probe.getFullYear() === y && probe.getMonth() === m - 1 && probe.getDate() === d
}

/** True when a `yyyy-mm-dd` string is a real calendar date. */
export function isRealIsoDate(iso: string): boolean {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return false
  return isRealDate(Number(m[1]), Number(m[2]), Number(m[3]))
}

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`)
  d.setDate(d.getDate() + days)
  return fmt(d.getFullYear(), d.getMonth() + 1, d.getDate())
}

export function daysBetween(a: string, b: string): number {
  const da = new Date(`${a}T00:00:00`).getTime()
  const db = new Date(`${b}T00:00:00`).getTime()
  return Math.round((db - da) / 86_400_000)
}

function splitSentences(text: string): string[] {
  return normalise(text)
    .split(/(?<=[.!?;。！？；\n])\s*|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 6)
}

function matchesAny(haystack: string, needles: string[]): boolean {
  return needles.some((n) => haystack.includes(n))
}

/** Analyse an unstructured information source into an inspectable structure. */
export function analyseSource(
  rawText: string,
  reference = new Date(),
): SourceAnalysis {
  const text = normalise(rawText)
  const lower = text.toLowerCase()

  // --- source kind -------------------------------------------------------
  let kind: SourceKind = 'manual'
  let best = 0
  for (const marker of KIND_MARKERS) {
    const score = marker.terms.reduce(
      (acc, t) => acc + (lower.includes(t) ? 1 : 0),
      0,
    )
    if (score > 0 && score * marker.weight > best) {
      best = score * marker.weight
      kind = marker.kind
    }
  }
  const confidence = Math.min(0.95, 0.35 + best * 0.06)

  // --- deadline ----------------------------------------------------------
  const {
    date: deadline,
    phrase: deadlinePhrase,
    rejected: invalidDates,
  } = parseDeadline(text, reference)

  // --- obligations -------------------------------------------------------
  const sentences = splitSentences(text)
  const obligations = sentences.filter((s) => {
    const sl = s.toLowerCase()
    return (
      matchesAny(sl, ACTION_CUES) ||
      matchesAny(s, ACTION_CUES) ||
      /\b(by|due|before|deadline|submit|deliver)\b/i.test(sl)
    )
  })

  // --- keywords ----------------------------------------------------------
  const tokens = lower
    .replace(/[^a-z0-9\u4e00-\u9fff\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w))
  const freq = new Map<string, number>()
  for (const t of tokens) freq.set(t, (freq.get(t) ?? 0) + 1)
  const keywords = [...freq.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 14)
    .map(([w]) => w)

  // --- scale -------------------------------------------------------------
  const cueCount =
    ACTION_CUES.reduce((acc, c) => acc + (lower.includes(c) || text.includes(c) ? 1 : 0), 0) +
    obligations.length
  const participantCount =
    (text.match(/\b[A-Z][a-z]{2,}\b/g) ?? []).length +
    (text.match(/[\u4e00-\u9fff]{2,3}(?=负责|同学|老师|经理)/g) ?? []).length
  let scale: ProjectScale = 'medium'
  if (cueCount <= 6 && participantCount <= 4) scale = 'small'
  else if (cueCount >= 14 || participantCount >= 9) scale = 'large'

  // --- collaboration -----------------------------------------------------
  const collaborative =
    COLLABORATION_CUES.some((set) => matchesAny(lower, set) || matchesAny(text, set))
  const individual = INDIVIDUAL_CUES.some((set) => matchesAny(lower, set) || matchesAny(text, set))
  if (collaborative && !individual) scale = scale === 'small' ? 'medium' : scale

  // --- people ------------------------------------------------------------
  const people = new Set<string>()
  for (const m of text.match(/\b(?:from|with|to|by)\s+([A-Z][a-z]+)\b/g) ?? []) {
    const name = m.split(/\s+/).pop()
    if (name && !STOP_WORDS.has(name.toLowerCase())) people.add(name)
  }
  for (const m of text.match(/([\u4e00-\u9fff]{2,3})(?=负责|同学|老师|经理|老师)/g) ?? []) {
    people.add(m)
  }

  // --- what the source leaves unsaid -------------------------------------
  const missingInfo: string[] = []
  if (!deadline) missingInfo.push('Final deadline is not stated in the source')
  if (!/(who|owner|responsible|负责|由谁)/i.test(text) && !/(负责)/.test(text)) {
    missingInfo.push('Task ownership is not assigned')
  }
  if (!DEPENDENCY_CUES.some((set) => matchesAny(lower, set) || matchesAny(text, set))) {
    missingInfo.push('Order / dependency between steps is not described')
  }
  if (!/(deliverable|format|word|slide|时长|字数|页数|交付)/i.test(text)) {
    missingInfo.push('Output format and length are not specified')
  }
  if (!/(audience|for whom|面向|对象|听众)/i.test(text)) {
    missingInfo.push('Target audience or recipient is not specified')
  }

  const deadlineInferred = !deadline

  return {
    kind,
    confidence,
    deadline: deadline ?? defaultDeadline(reference, scale),
    deadlinePhrase,
    deadlineInferred,
    scale,
    obligations: obligations.slice(0, 10),
    keywords,
    people: [...people].slice(0, 6),
    missingInfo,
    cueCount,
    invalidDates,
  }
}

function defaultDeadline(reference: Date, scale: ProjectScale): string {
  const horizon = scale === 'small' ? 7 : scale === 'medium' ? 21 : 42
  const d = new Date(reference)
  d.setDate(d.getDate() + horizon)
  return fmt(d.getFullYear(), d.getMonth() + 1, d.getDate())
}
