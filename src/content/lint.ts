import type { Question, Term } from './types'

export const TERM_RE = /\{\{([a-z0-9_]+)\}\}/g

export type StemPart = { kind: 'text'; text: string } | { kind: 'term'; termId: string }

export function parseStem(stem: string): StemPart[] {
  const parts: StemPart[] = []
  let last = 0
  for (const m of stem.matchAll(TERM_RE)) {
    const idx = m.index ?? 0
    if (idx > last) parts.push({ kind: 'text', text: stem.slice(last, idx) })
    parts.push({ kind: 'term', termId: m[1] ?? '' })
    last = idx + m[0].length
  }
  if (last < stem.length) parts.push({ kind: 'text', text: stem.slice(last) })
  return parts
}

export function stemTermIds(stem: string): string[] {
  return [...stem.matchAll(TERM_RE)].map((m) => m[1] ?? '')
}

export interface LintIssue {
  questionId: string
  message: string
}

/**
 * A question may only ship if every sign / light / marking / vehicle its stem
 * names is actually drawn in its scene.
 */
export function lintQuestions(questions: Question[], termById: Map<string, Term>): LintIssue[] {
  const issues: LintIssue[] = []
  const seen = new Set<string>()
  for (const q of questions) {
    if (seen.has(q.id)) issues.push({ questionId: q.id, message: 'duplicate id' })
    seen.add(q.id)
    if (q.answerIdx < 0 || q.answerIdx >= q.options.length) issues.push({ questionId: q.id, message: 'answerIdx out of range' })
    if (q.options.length !== 4) issues.push({ questionId: q.id, message: `expected 4 options, got ${q.options.length}` })

    for (const termId of stemTermIds(q.stem)) {
      const term = termById.get(termId)
      if (!term) {
        issues.push({ questionId: q.id, message: `unknown term {{${termId}}}` })
        continue
      }
      const v = term.visual
      if ('sign' in v && !(q.scene.signs ?? []).some((s) => s.id === v.sign || sameFamily(s.id, v.sign))) {
        issues.push({ questionId: q.id, message: `stem names sign "${term.name}" but scene has no ${v.sign} sign` })
      }
      if ('light' in v && !q.scene.light) {
        issues.push({ questionId: q.id, message: `stem names light "${term.name}" but scene has no traffic light` })
      }
      if ('marking' in v && !(q.scene.markings ?? []).includes(v.marking)) {
        issues.push({ questionId: q.id, message: `stem names marking "${term.name}" but scene lacks ${v.marking}` })
      }
      if (term.category === 'vehicle' && (q.scene.vehicles ?? []).length === 0 && !q.scene.egoIndicator) {
        issues.push({ questionId: q.id, message: `stem names vehicle term "${term.name}" but scene has no vehicles` })
      }
    }
  }
  return issues
}

/** speed_limit_50 and speed_limit_90 are the same sign family. */
function sameFamily(a: string, b: string): boolean {
  return a.replace(/_\d+$/, '') === b.replace(/_\d+$/, '')
}
