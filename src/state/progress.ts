import { useCallback, useEffect, useState } from 'react'
import { questions } from '../content/questions'
import { topicsByRoad } from '../content/topics'

export interface QuestionStat {
  correct: number
  wrong: number
  lastSeen: number
  lastResult: 'correct' | 'wrong'
}

export interface TermStat {
  taps: number
  seen: number
  correct: number
}

export interface RunRecord {
  startedAt: number
  endedAt: number
  answered: number
  correct: number
  km: number
  termsTapped: string[]
}

export interface Progress {
  questions: Record<string, QuestionStat>
  terms: Record<string, TermStat>
  runs: RunRecord[]
  roadKm: number
  mockBest?: number
}

const KEY = 'ottie.progress.v1'
export const KM_PER_CORRECT = 0.05

export const emptyProgress = (): Progress => ({ questions: {}, terms: {}, runs: [], roadKm: 0 })

export function loadProgress(): Progress {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return emptyProgress()
    const p = JSON.parse(raw) as Progress
    return { ...emptyProgress(), ...p }
  } catch {
    return emptyProgress()
  }
}

export function saveProgress(p: Progress) {
  localStorage.setItem(KEY, JSON.stringify(p))
}

export function recordAnswer(p: Progress, questionId: string, correct: boolean, termIds: string[]): Progress {
  const prev = p.questions[questionId] ?? { correct: 0, wrong: 0, lastSeen: 0, lastResult: 'wrong' as const }
  const stat: QuestionStat = {
    correct: prev.correct + (correct ? 1 : 0),
    wrong: prev.wrong + (correct ? 0 : 1),
    lastSeen: Date.now(),
    lastResult: correct ? 'correct' : 'wrong',
  }
  const terms = { ...p.terms }
  for (const id of termIds) {
    const t = terms[id] ?? { taps: 0, seen: 0, correct: 0 }
    terms[id] = { ...t, seen: t.seen + 1, correct: t.correct + (correct ? 1 : 0) }
  }
  const firstTimeCorrect = correct && prev.correct === 0
  return {
    ...p,
    questions: { ...p.questions, [questionId]: stat },
    terms,
    roadKm: p.roadKm + (correct ? KM_PER_CORRECT : 0) + (firstTimeCorrect ? KM_PER_CORRECT : 0),
  }
}

export function recordTermTap(p: Progress, termId: string): Progress {
  const t = p.terms[termId] ?? { taps: 0, seen: 0, correct: 0 }
  return { ...p, terms: { ...p.terms, [termId]: { ...t, taps: t.taps + 1 } } }
}

export function recordRun(p: Progress, run: RunRecord): Progress {
  return { ...p, runs: [...p.runs, run].slice(-50) }
}

/** Fraction of the whole road covered: questions answered correctly at least once. */
export function roadFraction(p: Progress): number {
  const done = questions.filter((q) => (p.questions[q.id]?.correct ?? 0) > 0).length
  return questions.length === 0 ? 0 : done / questions.length
}

export function topicFraction(p: Progress, topicId: string): number {
  const qs = questions.filter((q) => q.topic === topicId)
  const done = qs.filter((q) => (p.questions[q.id]?.correct ?? 0) > 0).length
  return qs.length === 0 ? 1 : done / qs.length
}

/** First topic on the road that still has unanswered-correct questions. */
export function currentTopic(p: Progress) {
  return topicsByRoad.find((t) => topicFraction(p, t.id) < 1) ?? null
}

export function lastRun(p: Progress): RunRecord | undefined {
  return p.runs[p.runs.length - 1]
}

export function daysSinceLastRun(p: Progress): number | null {
  const r = lastRun(p)
  if (!r) return null
  return (Date.now() - r.endedAt) / 86_400_000
}

export function useProgress() {
  const [progress, setProgress] = useState<Progress>(loadProgress)
  useEffect(() => saveProgress(progress), [progress])
  const update = useCallback((fn: (p: Progress) => Progress) => setProgress((p) => fn(p)), [])
  const reset = useCallback(() => setProgress(emptyProgress()), [])
  return { progress, update, reset }
}
