import { stemTermIds } from '../content/lint'
import { questions, questionsByTopic } from '../content/questions'
import { topicsByRoad } from '../content/topics'
import type { Question, Topic } from '../content/types'
import { currentTopic, daysSinceLastRun, lastRun, type Progress } from '../state/progress'

export type Energy = 'hyped' | 'steady' | 'behind'

export interface AnswerEvent {
  questionId: string
  correct: boolean
  ms: number
}

/** Was the last run a while ago, or did it go badly? Decides the warm-up and the tone of the greeting. */
export function startingEnergy(p: Progress): Energy {
  const gap = daysSinceLastRun(p)
  const last = lastRun(p)
  if (gap !== null && gap >= 3) return 'behind'
  if (last && last.answered >= 8 && last.correct / last.answered < 0.6) return 'behind'
  return 'steady'
}

/** Live energy during a run, from recent answer speed and the combo. */
export function liveEnergy(base: Energy, recent: AnswerEvent[], combo: number): Energy {
  const last5 = recent.slice(-5)
  if (last5.length === 5) {
    const avg = last5.reduce((s, a) => s + a.ms, 0) / 5
    if (avg < 4500 && combo >= 5) return 'hyped'
  }
  if (base === 'behind' && recent.length < 5) return 'behind'
  return 'steady'
}

function shuffle<T>(xs: T[]): T[] {
  const a = [...xs]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j] as T, a[i] as T]
  }
  return a
}

/** Up to five guaranteed-easy openers: questions already answered right, biased to tapped terms. */
export function warmupQueue(p: Progress): Question[] {
  const known = questions.filter((q) => (p.questions[q.id]?.correct ?? 0) > 0)
  const tapped = new Set(Object.entries(p.terms).filter(([, s]) => s.taps > 0).map(([id]) => id))
  const preferred = known.filter((q) => stemTermIds(q.stem).some((t) => tapped.has(t)))
  const rest = known.filter((q) => !preferred.includes(q))
  return [...shuffle(preferred), ...shuffle(rest)].slice(0, 5)
}

export interface Pick {
  question: Question
  /** Set when this pick begins a new topic stretch, i.e. the previous one was just completed. */
  enteringTopic?: Topic
  leavingTopic?: Topic
  /** True once every question on the road has been answered right at least once. */
  review: boolean
}

/**
 * Next question along the road: unfinished questions in the current topic
 * (unseen first, then wrong), avoiding the last few asked. When the road is
 * complete, cycle the weakest questions.
 */
export function pickNext(p: Progress, recentIds: string[], prevTopicId: string | null): Pick {
  const avoid = new Set(recentIds.slice(-4))
  const topic = currentTopic(p)
  if (topic) {
    const pool = questionsByTopic(topic.id).filter((q) => (p.questions[q.id]?.correct ?? 0) === 0)
    const unseen = pool.filter((q) => !p.questions[q.id] && !avoid.has(q.id))
    const wrong = pool.filter((q) => p.questions[q.id] && !avoid.has(q.id))
    const candidates = unseen.length ? unseen : wrong.length ? wrong : pool
    const question = shuffle(candidates)[0] as Question
    const leaving = prevTopicId && prevTopicId !== topic.id ? topicsByRoad.find((t) => t.id === prevTopicId) : undefined
    return { question, enteringTopic: leaving ? topic : undefined, leavingTopic: leaving, review: false }
  }
  const scored = questions
    .filter((q) => !avoid.has(q.id))
    .map((q) => {
      const s = p.questions[q.id]
      const weakness = (s?.wrong ?? 0) * 3 - (s?.correct ?? 0) + (Date.now() - (s?.lastSeen ?? 0)) / 3_600_000 / 24
      return { q, weakness }
    })
    .sort((a, b) => b.weakness - a.weakness)
  const top = scored.slice(0, 6).map((x) => x.q)
  return { question: shuffle(top)[0] as Question, review: true }
}

export function shuffledOptions(q: Question): { text: string; idx: number }[] {
  return shuffle(q.options.map((text, idx) => ({ text, idx })))
}

export const MOCK = { count: 50, minutes: 50, pass: 45 }

export function mockPaper(): Question[] {
  const pool = shuffle(questions)
  return pool.slice(0, Math.min(MOCK.count, pool.length))
}
