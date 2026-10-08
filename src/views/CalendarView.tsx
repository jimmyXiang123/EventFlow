import { useEffect, useMemo, useState } from 'react'
import { useStore } from '../state/projectStore'
import { Alert, Avatar, StatusSelect } from '../components/ui'
import { useT } from '../i18n/useT'
import { analyseDependencies, flattenTasks } from '../lib/domainEngine'
import { addDays, isRealIsoDate } from '../lib/sourceAnalyser'
import type { Task, TaskStatus } from '../domain/types'

/**
 * Month calendar.
 *
 * Replaces an earlier horizontal Gantt chart. The Gantt held thirteen rows against
 * a thirty-day axis and, on a laptop screen, forced sideways scrolling to see a
 * whole plan — the one thing a schedule must not do. A month grid shows the entire
 * project at once, and a multi-day task is drawn as a single bar spanning its
 * columns rather than as one block per day.
 *
 * Layout note: the grid is a real 7-column CSS grid rather than nested week rows.
 * A task that crosses a week boundary therefore needs splitting into one segment
 * per week, which is what `segmentsFor` does. That is why a bar can appear twice
 * for one task: each piece is positioned independently, which is also what lets
 * the bar show "continues" chevrons at the edges of a week.
 */

const DAY_MS = 86_400_000
const WEEK_ROWS = 6

export type CalendarView = 'month' | 'week'

/** ISO date + n days, via the one date implementation in sourceAnalyser. */
function shift(iso: string, days: number): string {
  return addDays(iso, days)
}

function parseIso(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function isoOf(date: Date): string {
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${mm}-${dd}`
}

/** Sunday of the week containing `iso`. */
function weekStart(iso: string): string {
  const d = parseIso(iso)
  return shift(iso, -d.getDay())
}

/** First cell of a 6×7 month grid: the Sunday on or before the 1st. */
function gridStart(monthIso: string): string {
  const first = `${monthIso}-01`
  return weekStart(first)
}

interface Segment {
  task: Task
  /** 1-based grid column, 1..7 (Sunday = 1). */
  colStart: number
  /** 1-based inclusive grid column. */
  colEnd: number
  /** True when the bar began before this week, so its left edge should not round. */
  continuesLeft: boolean
  continuesRight: boolean
  /** Row inside the week, to stop two bars in the same week from overlapping. */
  lane: number
  /** Index of the week row, 0-based. */
  week: number
}

/** A placed bar, used only while allocating lanes. */
interface Placed {
  start: number
  end: number
  lane: number
}

/**
 * Split every task into per-week bar segments and allocate each one a lane.
 *
 * Lanes are assigned greedily per week: a bar takes the lowest row that no
 * already-placed bar in that week overlaps. Without this, two tasks sharing a week
 * render on top of each other and one of them becomes invisible.
 */
function segmentsFor(
  tasks: Task[],
  gridFrom: string,
  gridTo: string,
): { segments: Segment[]; laneCounts: number[] } {
  const weeks: Placed[][] = Array.from({ length: WEEK_ROWS }, () => [])
  const segments: Segment[] = []
  const fromMs = parseIso(gridFrom).getTime()

  for (const task of tasks) {
    // Both dates are optional on the domain type (a task can exist before it has
    // been scheduled), so a task without usable dates is simply not drawn rather
    // than being placed at a guessed position.
    const start = task.startDate
    const end = task.deadline
    if (!start || !end) continue
    if (!isRealIsoDate(start) || !isRealIsoDate(end)) continue
    if (end < gridFrom || start > gridTo || end < start) continue

    const clampedStart = start < gridFrom ? gridFrom : start
    const clampedEnd = end > gridTo ? gridTo : end

    let cursor = weekStart(clampedStart)
    // A month spans at most six weeks; the guard stops a malformed range looping.
    for (let guard = 0; cursor <= clampedEnd && guard < WEEK_ROWS + 1; guard += 1) {
      const weekIndex = Math.round((parseIso(cursor).getTime() - fromMs) / (DAY_MS * 7))
      const weekEnd = shift(cursor, 6)
      const segStart = clampedStart > cursor ? clampedStart : cursor
      const segEnd = clampedEnd < weekEnd ? clampedEnd : weekEnd
      const cursorMs = parseIso(cursor).getTime()
      const colStart = Math.round((parseIso(segStart).getTime() - cursorMs) / DAY_MS) + 1
      const colEnd = Math.round((parseIso(segEnd).getTime() - cursorMs) / DAY_MS) + 1

      // A task can reach a week outside the visible grid when the range is
      // clamped; those segments are simply not drawn.
      if (weekIndex >= 0 && weekIndex < WEEK_ROWS) {
        const occupied = weeks[weekIndex]
        let lane = 0
        while (occupied.some((p) => p.lane === lane && p.start <= colEnd && p.end >= colStart)) {
          lane += 1
        }
        occupied.push({ start: colStart, end: colEnd, lane })
        segments.push({
          task,
          colStart,
          colEnd,
          continuesLeft: clampedStart < cursor,
          continuesRight: clampedEnd > weekEnd,
          lane,
          week: weekIndex,
        })
      }

      cursor = shift(cursor, 7)
    }
  }

  return {
    segments,
    laneCounts: weeks.map((placed) => Math.max(1, ...placed.map((p) => p.lane + 1))),
  }
}

/** Travelling the project across the calendar, one bar per task. */
export function CalendarView() {
  const project = useStore((s) => s.selectedProject())
  const currentUser = useStore((s) => s.currentUser())
  const setTaskStatus = useStore((s) => s.setTaskStatus)
  const focusedTaskId = useStore((s) => s.focusedTaskId)
  const setFocusedTask = useStore((s) => s.setFocusedTask)
  const { t, locale, formatIso, weekdayNarrow } = useT()
  const [mode, setMode] = useState<CalendarView>('month')
  const [anchor, setAnchor] = useState<string | null>(null)

  const today = useMemo(() => isoOf(new Date()), [])

  // Anchor defaults to the project deadline's month, since a backwards-planned
  // project ends at its deadline and that is the part worth looking at first.
  const anchorMonth = (anchor ?? project?.finalDeadline ?? today).slice(0, 7)
  useEffect(() => {
    if (!anchor && project) setAnchor(project.finalDeadline)
  }, [anchor, project])

  if (!project) return null

  const tasks = flattenTasks(project.stages).map((r) => r.task)
  const insights = analyseDependencies(project.stages, undefined, project.finalDeadline)
  const isCoordinator = currentUser.role === 'coordinator'

  const gridFrom = mode === 'month' ? gridStart(anchorMonth) : weekStart(anchor ?? today)
  const gridTo = shift(gridFrom, mode === 'month' ? 41 : 6)
  const { segments, laneCounts } = segmentsFor(tasks, gridFrom, gridTo)

  /**
   * Height per week row, sized to that week's own lane count.
   *
   * A single height for all six rows wasted most of the month: the first three
   * weeks of a backwards-planned project are empty, and sizing them to the busiest
   * week pushed the weeks that do have work off the bottom of the screen.
   */
  const rowHeight = (week: number) =>
    mode === 'week' ? 340 : Math.max(58, 26 + Math.max(1, laneCounts[week] ?? 1) * 19)

  const monthLabel = (() => {
    const d = parseIso(`${anchorMonth}-01`)
    return d.toLocaleDateString(locale, { year: 'numeric', month: 'long' })
  })()

  const step = (delta: number) => {
    const d = parseIso(`${anchorMonth}-01`)
    d.setMonth(d.getMonth() + delta)
    setAnchor(isoOf(d))
  }

  // A task without a schedule cannot be placed or counted in a date window.
  const scheduled = tasks.filter((k) => k.startDate && k.deadline)
  const counts = {
    overdue: scheduled.filter((k) => k.status !== 'done' && k.deadline! < today).length,
    blocked: tasks.filter((k) => insights.get(k.id)?.blockedBy.length).length,
    inMonth: scheduled.filter((k) => k.startDate! <= gridTo && k.deadline! >= gridFrom).length,
  }

  const focused = focusedTaskId ? tasks.find((k) => k.id === focusedTaskId) : undefined

  return (
    <>
      {/* ---- block 1: toolbar + one-line summary ---- */}
      <div className="page-head">
        <div className="row" style={{ gap: 8, alignItems: 'center' }}>
          <button className="btn sm" onClick={() => step(-1)} aria-label={t('cal.prevMonth')}>
            ‹
          </button>
          <h1 style={{ margin: 0, minWidth: 150, textAlign: 'center' }}>{monthLabel}</h1>
          <button className="btn sm" onClick={() => step(1)} aria-label={t('cal.nextMonth')}>
            ›
          </button>
          <button className="btn sm ghost" onClick={() => setAnchor(today)}>
            {t('cal.today')}
          </button>
        </div>

        <div className="row" style={{ gap: 8, alignItems: 'center' }}>
          <span className="badge neutral">{t('cal.inView', { n: counts.inMonth })}</span>
          {counts.overdue > 0 && (
            <span className="badge danger">{t('cal.overdue', { n: counts.overdue })}</span>
          )}
          {counts.blocked > 0 && (
            <span className="badge warn">{t('cal.blocked', { n: counts.blocked })}</span>
          )}
          <button
            className={`btn xs ${mode === 'month' ? 'primary' : 'ghost'}`}
            onClick={() => setMode('month')}
          >
            {t('cal.month')}
          </button>
          <button
            className={`btn xs ${mode === 'week' ? 'primary' : 'ghost'}`}
            onClick={() => setMode('week')}
          >
            {t('cal.week')}
          </button>
        </div>
      </div>

      {/* ---- block 2: the grid ---- */}
      <div className="card cal" data-guide="timeline-bars">
        <div className="cal-head">
          {Array.from({ length: 7 }, (_, i) => (
            <div key={i} className="cal-dow">
              {weekdayNarrow(shift(gridFrom, i))}
            </div>
          ))}
        </div>

        <div className={`cal-body${mode === 'week' ? ' week' : ''}`}>
          {/*
            Six week rows. Day cells are the grid; bars are absolutely positioned
            inside the same row container, offset vertically by their lane so two
            tasks in one week do not sit on top of each other. The row is sized from
            the busiest week so no lane overflows into the next week.
          */}
          {Array.from({ length: mode === 'month' ? WEEK_ROWS : 1 }, (_, week) => (
            <div
              className="cal-row"
              key={week}
              style={{ gridAutoRows: `${rowHeight(week)}px` }}
            >
              {Array.from({ length: 7 }, (_, day) => {
                const iso = shift(gridFrom, week * 7 + day)
                const inMonth = iso.slice(0, 7) === anchorMonth
                const weekend = [0, 6].includes(parseIso(iso).getDay())
                return (
                  <div
                    key={iso}
                    className={`cal-day${inMonth ? '' : ' out'}${weekend ? ' wknd' : ''}${
                      iso === today ? ' today' : ''
                    }`}
                  >
                    <span className="cal-daynum">{formatIso(iso)}</span>
                  </div>
                )
              })}

              <div className="cal-week-bars">
                {segments
                  .filter((s) => s.week === week)
                  .map((s) => {
                    const status = s.task.status
                    const insight = insights.get(s.task.id)
                    const blocked = Boolean(insight?.blockedBy.length)
                    const overdue = status !== 'done' && (s.task.deadline ?? '') < today
                    const isFocused = s.task.id === focusedTaskId
                    const theirs = s.task.ownerId !== currentUser.id
                    return (
                      <button
                        key={`${s.task.id}-${s.colStart}-${s.colEnd}`}
                        className={
                          `cal-bar st-${status}` +
                          (blocked ? ' blocked' : '') +
                          (overdue ? ' overdue' : '') +
                          (isFocused ? ' focused' : '') +
                          (isCoordinator && theirs ? ' theirs' : '')
                        }
                        style={{
                          left: `calc(${((s.colStart - 1) / 7) * 100}% + 2px)`,
                          // A bar spanning to the last column must not run past it.
                          width: `calc(${((s.colEnd - s.colStart + 1) / 7) * 100}% - 4px)`,
                          top: 20 + s.lane * 19,
                        }}
                        onClick={() => setFocusedTask(isFocused ? null : s.task.id)}
                        title={`${s.task.name} · ${s.task.startDate} → ${s.task.deadline}`}
                      >
                        <span className="cal-bar-name">
                          {s.continuesLeft && '‹ '}
                          {s.task.name}
                          {s.continuesRight && ' ›'}
                        </span>
                      </button>
                    )
                  })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ---- block 3: what the clicked task is, and updating it ---- */}
      {focused ? (
        <div className="card pad" data-guide="calendar-detail">
          <div className="row" style={{ justifyContent: 'space-between', gap: 10 }}>
            <div className="row" style={{ gap: 8, minWidth: 0 }}>
              <Avatar
                user={useStore.getState().users.find((u) => u.id === focused.ownerId)}
                className="sm"
              />
              <strong style={{ minWidth: 0 }}>{focused.name}</strong>
            </div>
            <div className="row" style={{ gap: 8 }}>
              <span className="badge neutral nowrap mono">
                {focused.startDate} → {focused.deadline}
              </span>
              <StatusSelect
                value={focused.status}
                onChange={(status: TaskStatus) => setTaskStatus(project.id, focused.id, status)}
              />
              <button className="btn xs ghost" onClick={() => setFocusedTask(null)}>
                ×
              </button>
            </div>
          </div>
          {focused.blockerNote && <Alert tone="danger" title={focused.blockerNote} />}
        </div>
      ) : (
        <div className="small muted" data-guide="calendar-hint">
          {t('cal.clickHint')}
        </div>
      )}
    </>
  )
}
