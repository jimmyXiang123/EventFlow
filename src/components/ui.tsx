import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { TaskStatus, User } from '../domain/types'
import { SCENARIOS } from '../domain/scenarios'
import { useStore } from '../state/projectStore'
import { useT } from '../i18n/useT'

/* ---------------- avatars ---------------- */

export function Avatar({
  user,
  className = '',
  title,
}: {
  user: User | undefined
  className?: string
  title?: string
}) {
  const { tRole } = useT()
  if (!user) return null
  return (
    <span
      className={`avatar ${className}`}
      style={{ background: user.color }}
      title={title ?? `${user.name} · ${tRole(user.role)}`}
    >
      {user.initials}
    </span>
  )
}

export function AvatarStack({
  ids,
  size = 'sm',
  max = 4,
}: {
  ids: string[]
  size?: '' | 'sm' | 'lg'
  max?: number
}) {
  const users = useStore((s) => s.users)
  const shown = ids.slice(0, max)
  const extra = ids.length - shown.length
  return (
    <span className="avatars">
      {shown.map((id) => (
        <Avatar key={id} user={users.find((u) => u.id === id)} className={size} />
      ))}
      {extra > 0 && <span className="chip small">+{extra}</span>}
    </span>
  )
}

/* ---------------- status ---------------- */

export const STATUS_CLASS: Record<TaskStatus, string> = {
  todo: 'neutral',
  waiting: 'info',
  in_progress: 'accent',
  blocked: 'danger',
  done: 'ok',
}

export function StatusBadge({ status }: { status: TaskStatus }) {
  const { tStatus } = useT()
  return <span className={`badge ${STATUS_CLASS[status]}`}>{tStatus(status)}</span>
}

export function StatusSelect({
  value,
  onChange,
  disabled,
  guide,
}: {
  value: TaskStatus
  onChange: (s: TaskStatus) => void
  disabled?: boolean
  /** `data-guide` anchor id, so the walkthrough can point at this control. */
  guide?: string
}) {
  const { t, tStatus } = useT()
  return (
    <select
      value={value}
      disabled={disabled}
      data-guide={guide}
      onChange={(e) => onChange(e.target.value as TaskStatus)}
      style={{ fontSize: 11.5, padding: '2px 4px', width: 'auto' }}
      title={t('statusTitle')}
    >
      {(Object.keys(STATUS_CLASS) as TaskStatus[]).map((s) => (
        <option key={s} value={s}>
          {tStatus(s)}
        </option>
      ))}
    </select>
  )
}

/* ---------------- guidance control (R2) ---------------- */

/**
 * R2 — the familiarity switch.
 *
 * Rendered as a compact segmented control in the top bar rather than a full
 * width banner, so the guidance difference stays one click away without
 * occupying a permanent strip of the screen.
 */
export function GuidanceControl() {
  const override = useStore((s) => s.guidanceOverride)
  const setOverride = useStore((s) => s.setGuidanceOverride)
  const { t } = useT()

  return (
    <span className="tabs nowrap" style={{ padding: 2 }} title={t('guidance.title')}>
      {(
        [
          { id: null, label: 'guidance.auto' },
          { id: 'novice' as const, label: 'guidance.novice' },
          { id: 'expert' as const, label: 'guidance.expert' },
        ] as const
      ).map((opt) => (
        <button
          key={String(opt.id)}
          className={`tab${override === opt.id ? ' active' : ''}`}
          style={{ padding: '3px 9px', fontSize: 12 }}
          onClick={() => setOverride(opt.id)}
        >
          {t(opt.label)}
        </button>
      ))}
    </span>
  )
}

/* ---------------- scenario control (CW1 user groups) ---------------- */

/**
 * Switches which CW1 user group the prototype is demonstrating. Applying a group
 * changes the signed-in participant, their role, the guidance level and the open
 * project, so the interface visibly adapts instead of needing four mock-ups.
 *
 * Tagged with a `data-guide` anchor so the walkthrough player can point at it.
 */
export function ScenarioControl() {
  const scenarioId = useStore((s) => s.scenarioId)
  const applyScenario = useStore((s) => s.applyScenario)
  const lang = useStore((s) => s.lang)
  const [open, setOpen] = useState(false)
  const { t, tRole } = useT()
  const active = SCENARIOS.find((x) => x.id === scenarioId)

  useEffect(() => {
    if (!open) return
    const close = () => setOpen(false)
    // Close on the next outside click, rather than on the opening click itself.
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [open])

  return (
    <span className="scenario-wrap nowrap" data-guide="scenario-switcher">
      <button
        className={`btn sm${active ? '' : ' ghost'}`}
        onClick={(e) => {
          e.stopPropagation()
          setOpen((v) => !v)
        }}
        title={t('scenario.openTitle')}
      >
        {active ? active.label[lang] : t('scenario.open')}
        <span style={{ fontSize: 9, opacity: 0.7 }}>▾</span>
      </button>

      {open && (
        <div className="scenario-menu" onClick={(e) => e.stopPropagation()}>
          <div className="small" style={{ fontWeight: 650, marginBottom: 8 }}>
            {t('scenario.menuTitle')}
          </div>
          <p className="small muted" style={{ margin: '0 0 10px' }}>
            {t('scenario.menuIntro')}
          </p>
          {SCENARIOS.map((s) => (
            <button
              key={s.id}
              className={`scenario-item${s.id === scenarioId ? ' active' : ''}`}
              onClick={() => {
                applyScenario(s.id)
                setOpen(false)
              }}
            >
              <div className="row" style={{ justifyContent: 'space-between', gap: 8 }}>
                <span style={{ fontWeight: 620, fontSize: 12.5 }}>{s.group[lang]}</span>
                <span className={`badge ${s.role === 'coordinator' ? 'accent' : 'neutral'}`}>
                  {tRole(s.role)}
                </span>
              </div>
              <div className="small muted" style={{ marginTop: 3 }}>
                {s.situation[lang]}
              </div>
              <div className="small" style={{ marginTop: 4, color: 'var(--text-2)' }}>
                {s.summary[lang]}
              </div>
            </button>
          ))}
        </div>
      )}
    </span>
  )
}

/* ---------------- error / prevention alerts ---------------- */

/**
 * An inline alert used for both error messages and error *prevention*.
 *
 * `err.` messages report something that could not proceed; `prev.` alerts explain
 * a risk or a block *before* the user commits to it. Prevention is the more
 * useful of the two — an impossible date is better refused at the field than
 * reported after the whole plan has been generated from it.
 *
 * Alerts are deliberately NOT gated by the density layer. They are the one kind
 * of text that must survive a user turning the notes off.
 */
export function Alert({
  tone = 'warn',
  title,
  children,
  fix,
  onDismiss,
  guide,
}: {
  tone?: 'warn' | 'danger' | 'info'
  title: string
  children?: ReactNode
  /** Optional "how to fix it" line, shown under the explanation. */
  fix?: ReactNode
  onDismiss?: () => void
  guide?: string
}) {
  const { t } = useT()
  return (
    <div
      className={`alert alert-${tone}`}
      role={tone === 'danger' ? 'alert' : 'status'}
      data-guide={guide}
    >
      <span className="alert-icon" aria-hidden="true">
        {tone === 'danger' ? '⛔' : tone === 'info' ? 'ℹ' : '⚠'}
      </span>
      <div className="alert-body">
        <div className="alert-title">{title}</div>
        {children && <div className="alert-text">{children}</div>}
        {fix && (
          <div className="alert-fix">
            <strong>{t('err.fix')}：</strong>
            {fix}
          </div>
        )}
      </div>
      {onDismiss && (
        <button className="alert-close" onClick={onDismiss} title={t('err.dismiss')}>
          ×
        </button>
      )}
    </div>
  )
}

/* ---------------- compact-mode helpers ---------------- */

/** True when the user has asked for the simplified interface. */
export function useCompact(): boolean {
  return useStore((s) => s.compact)
}

/**
 * Explanatory copy that is helpful the first time and clutter afterwards.
 * Renders nothing in compact mode, and is hidden by the density layer unless the
 * user turns the notes on.
 */
export function Hint({
  children,
  className = 'small muted',
  style,
  verbose = true,
}: {
  children: ReactNode
  className?: string
  style?: React.CSSProperties
  /** Set false for text that is needed to make a decision, not to explain one. */
  verbose?: boolean
}) {
  const compact = useCompact()
  if (compact) return null
  return (
    <div className={className} style={style} data-verbose={verbose ? '' : undefined}>
      {children}
    </div>
  )
}

/** A full callout (note box) that disappears in compact mode. */
export function SoftNote({
  tone = 'accent',
  icon,
  guide,
  verbose = true,
  children,
}: {
  tone?: 'accent' | 'info' | 'warn' | 'ok'
  icon?: string
  /** `data-guide` anchor id, so the walkthrough can point at this callout. */
  guide?: string
  verbose?: boolean
  children: ReactNode
}) {
  const compact = useCompact()
  if (compact) return null
  return (
    <div className={`note ${tone}`} data-guide={guide} data-verbose={verbose ? '' : undefined}>
      {icon && <span className="note-icon">{icon}</span>}
      <span>{children}</span>
    </div>
  )
}

/** Requirement tag: kept in detailed mode, hidden when compact. */
export function ReqTag({ n, label }: { n: number; label: string }) {
  const compact = useCompact()
  if (compact) return null
  return <ReqBadge n={n} label={label} />
}

/* ---------------- toast ---------------- */

export function Toast({
  message,
  onClose,
}: {
  message: string | null
  onClose: () => void
}) {
  if (!message) return null
  return (
    <div className="toast-wrap">
      <div className="toast" role="status">
        <span>{message}</span>
        <button onClick={onClose} aria-label="Dismiss">
          ×
        </button>
      </div>
    </div>
  )
}

/* ---------------- confirm dialog ---------------- */

export function ConfirmDialog({
  title,
  body,
  confirmLabel = 'Confirm',
  onConfirm,
  onCancel,
}: {
  title: string
  body: ReactNode
  confirmLabel?: string
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="modal-head">
          <h2>{title}</h2>
        </div>
        <div className="modal-body">{body}</div>
        <div className="modal-foot">
          <button className="btn" onClick={onCancel}>
            Cancel
          </button>
          <button className="btn danger" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ---------------- helpers ---------------- */

export function ReqBadge({ n, label }: { n: number; label: string }) {
  return (
    <span className="row" style={{ gap: 6 }} title={label}>
      <span className="req-badge">R{n}</span>
      <span className="small muted">{label}</span>
    </span>
  )
}

/**
 * Dates and relative times are formatted from the interface language rather than
 * the system default. Relying on the default produced mixed "27 Oct" / "10月27日"
 * output within one screen, and the prototype has to read correctly in both
 * languages.
 *
 * These are thin wrappers over `useT()` so a view still imports its formatting
 * from one place.
 */
export function useFormatDate(): (iso: string | undefined) => string {
  return useT().formatDate
}

export function useRelativeTime(): (isoTimestamp: string) => string {
  const { lang } = useT()
  return (isoTimestamp) => {
    const mins = Math.round((Date.now() - new Date(isoTimestamp).getTime()) / 60000)
    if (mins < 1) return lang === 'zh' ? '刚刚' : 'just now'
    if (mins < 60) return lang === 'zh' ? `${mins} 分钟前` : `${mins} min ago`
    const hours = Math.round(mins / 60)
    if (hours < 24) return lang === 'zh' ? `${hours} 小时前` : `${hours} h ago`
    const days = Math.round(hours / 24)
    return lang === 'zh' ? `${days} 天前` : `${days} d ago`
  }
}

export function useWeekdayNarrow(): (iso: string) => string {
  return useT().weekdayNarrow
}

/** How close a deadline is. `dueState` itself is language-independent. */
export function dueState(deadline: string | undefined): 'none' | 'overdue' | 'soon' | 'ok' {
  if (!deadline) return 'none'
  const today = new Date()
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const d = new Date(`${deadline}T00:00:00`)
  const diff = Math.round((d.getTime() - start.getTime()) / 86400000)
  if (diff < 0) return 'overdue'
  if (diff <= 2) return 'soon'
  return 'ok'
}
