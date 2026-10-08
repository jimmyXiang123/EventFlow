/**
 * React bindings for the interface language.
 *
 * `useT()` returns a `t` function bound to the current language plus the current
 * `lang`, for the few places that need to branch on it (date formatting in the
 * timeline header).
 */

import { useCallback } from 'react'
import { useStore } from '../state/projectStore'
import type { Familiarity, Role, SourceKind, TaskKind, TaskStatus } from '../domain/types'
import type { ProjectScale } from '../domain/types'
import { dateLocale, translate } from './labels'
import type { Lang } from './labels'

export interface Translator {
  lang: Lang
  locale: string
  /** Translate a key, substituting `{name}` placeholders. */
  t: (key: string, params?: Record<string, string | number>) => string
  tStatus: (s: TaskStatus) => string
  tKind: (k: TaskKind) => string
  tSource: (k: SourceKind) => string
  tScale: (s: ProjectScale) => string
  tRole: (r: Role) => string
  tFamiliarity: (f: Familiarity) => string
  /** Short date, e.g. "27 Oct" / "10月27日". */
  formatDate: (iso: string | undefined) => string
  /** Full date, e.g. "27 Oct 2026" / "2026年10月27日". */
  formatIso: (iso: string | undefined) => string
  /** Single-letter weekday for the timeline header. */
  weekdayNarrow: (iso: string) => string
  /** View-tab name for the walkthrough's "show me on the … screen" button. */
  viewLabel: (view: string) => string
}

export function useT(): Translator {
  const lang = useStore((s) => s.lang)

  const t = useCallback(
    (key: string, params?: Record<string, string | number>) => translate(lang, key, params),
    [lang],
  )

  const locale = dateLocale(lang)

  return {
    lang,
    locale,
    t,
    tStatus: (s) => t(`status.${s}`),
    tKind: (k) => t(`kind.${k}`),
    tSource: (k) => t(`source.${k}`),
    tScale: (s) => t(`scale.${s}`),
    tRole: (r) => t(`people.${r}`),
    tFamiliarity: (f) => t(`familiarity.${f}`),
    formatDate: (iso) => {
      if (!iso) return t('common.none')
      const d = new Date(`${iso}T00:00:00`)
      if (Number.isNaN(d.getTime())) return iso
      return d.toLocaleDateString(locale, { day: 'numeric', month: 'short' })
    },
    formatIso: (iso) => {
      if (!iso) return t('common.none')
      const d = new Date(`${iso}T00:00:00`)
      if (Number.isNaN(d.getTime())) return iso
      return d.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' })
    },
    weekdayNarrow: (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString(locale, { weekday: 'narrow' }),
    viewLabel: (view) => t(`nav.${view}`),
  }
}
