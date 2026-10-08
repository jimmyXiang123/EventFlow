/**
 * R1 — LLM extraction seam.
 *
 * The prototype ships with `RuleBasedExtractor` only: it is deterministic,
 * needs no API key, and works offline, which makes the demo reproducible.
 *
 * To swap in a real model, implement `DraftExtractor` with a network call and
 * return the same shape. Nothing in the UI changes — the interface is the
 * contract. This is the single place where an LLM would be introduced.
 *
 *   const extractor: DraftExtractor = {
 *     id: 'llm',
 *     label: 'Language model extraction',
 *     async build(input) {
 *       const res = await fetch('/api/extract', {
 *         method: 'POST',
 *         headers: { 'content-type': 'application/json' },
 *         body: JSON.stringify({ text: input.sourceText, deadline: input.deadline }),
 *       })
 *       const draft = (await res.json()) as DraftResult
 *       return draft
 *     },
 *   }
 */

import type { DraftOptions, DraftResult } from './domainEngine'
import { generateDraft } from './domainEngine'

export interface DraftExtractor {
  id: string
  label: string
  /** Short explanation shown in the UI so the provenance of the draft is clear. */
  description: string
  /** True when this extractor needs credentials / network. */
  requiresNetwork: boolean
  build: (input: DraftOptions) => Promise<DraftResult> | DraftResult
}

/**
 * Default extractor: template + rule based.
 *
 * It never invents facts it cannot show. Anything the source did not state is
 * reported through `analysis.missingInfo` and repeated in `draft.warnings`, so
 * the user is told exactly which parts need checking — the concern 20/30
 * respondents raised about automatic suggestions misunderstanding their goal.
 */
export const ruleBasedExtractor: DraftExtractor = {
  id: 'rules',
  label: 'Template-based extraction (offline)',
  description:
    'Scores a curated template library against the imported text, then scales and schedules the matching process. No network call, fully inspectable.',
  requiresNetwork: false,
  build: (input) => generateDraft(input),
}

/**
 * Placeholder for the networked path. It is registered but not selected, so it
 * is obvious where a model call would go without shipping a broken button.
 */
export const llmExtractor: DraftExtractor = {
  id: 'llm',
  label: 'Language model extraction (not configured)',
  description:
    'POSTs the information source to a model endpoint. Disabled until an endpoint and key are supplied.',
  requiresNetwork: true,
  build: () => {
    throw new Error(
      'The LLM extractor is a seam, not an implementation. Provide an endpoint in src/lib/llmAdapter.ts.',
    )
  },
}

export const EXTRACTORS: DraftExtractor[] = [ruleBasedExtractor, llmExtractor]

export function getExtractor(id: string): DraftExtractor {
  return EXTRACTORS.find((e) => e.id === id) ?? ruleBasedExtractor
}
