import { useCallback, useEffect, useRef, useState } from 'react'
import { stemTermIds } from '../content/lint'
import type { Question, Topic } from '../content/types'
import { liveEnergy, pickNext, shuffledOptions, startingEnergy, warmupQueue, type AnswerEvent, type Pick } from '../engine/run'
import { Scene } from '../scene/Scene'
import { currentTopic, KM_PER_CORRECT, recordAnswer, recordTermTap, type Progress, type RunRecord } from '../state/progress'
import { Explainer } from '../ui/Explainer'
import { Ottie } from '../ui/Ottie'
import { TermText } from '../ui/TermText'

interface Props {
  progress: Progress
  update: (fn: (p: Progress) => Progress) => void
  onEnd: (run: RunRecord) => void
}

interface Step {
  pick: Pick
  options: { text: string; idx: number }[]
  shownAt: number
  warmup: boolean
}

interface Milestone {
  leaving: Topic
  entering: Topic
}

const AUTO_ADVANCE_MS = 1400

/** Mutable bookkeeping for one run; touched only from handlers and effects. */
interface Session {
  warmup: Question[]
  recentIds: string[]
  termsTapped: Set<string>
  lastTopic: string | null
  latest: Progress
}

export function Run({ progress, update, onEnd }: Props) {
  const [start] = useState(() => ({ at: Date.now(), km: progress.roadKm, energy: startingEnergy(progress) }))
  const session = useRef<Session>({
    warmup: [],
    recentIds: [],
    termsTapped: new Set(),
    lastTopic: null,
    latest: progress,
  })
  useEffect(() => {
    session.current.latest = progress
  }, [progress])

  const [step, setStep] = useState<Step | null>(null)
  const [answered, setAnswered] = useState<{ chosen: number; correct: boolean } | null>(null)
  const [combo, setCombo] = useState(0)
  const [bestCombo, setBestCombo] = useState(0)
  const [answers, setAnswers] = useState<AnswerEvent[]>([])
  const [milestone, setMilestone] = useState<Milestone | null>(null)
  const [term, setTerm] = useState<string | null>(null)
  const [paused, setPaused] = useState(false)

  const next = useCallback(() => {
    const s = session.current
    const w = s.warmup.shift()
    let pick: Pick
    if (w) {
      pick = { question: w, review: false }
    } else {
      pick = pickNext(s.latest, s.recentIds, s.lastTopic)
      if (pick.enteringTopic && pick.leavingTopic) setMilestone({ leaving: pick.leavingTopic, entering: pick.enteringTopic })
      s.lastTopic = currentTopic(s.latest)?.id ?? s.lastTopic
    }
    s.recentIds = [...s.recentIds, pick.question.id].slice(-6)
    setStep({ pick, options: shuffledOptions(pick.question), shownAt: Date.now(), warmup: Boolean(w) })
    setAnswered(null)
    setPaused(false)
  }, [])

  useEffect(() => {
    const s = session.current
    s.lastTopic = currentTopic(s.latest)?.id ?? null
    s.warmup = start.energy === 'behind' ? warmupQueue(s.latest) : []
    next()
  }, [next, start.energy])

  useEffect(() => {
    if (!milestone) return
    const t = setTimeout(() => setMilestone(null), 3200)
    return () => clearTimeout(t)
  }, [milestone])

  // Correct answers roll on by themselves unless the driver opened an explainer.
  useEffect(() => {
    if (!answered?.correct || paused || term) return
    const t = setTimeout(next, AUTO_ADVANCE_MS)
    return () => clearTimeout(t)
  }, [answered, paused, term, next])

  const energy = liveEnergy(start.energy, answers, combo)

  const handleChoose = (idx: number) => {
    if (!step || answered) return
    const q = step.pick.question
    const correct = idx === q.answerIdx
    const ms = new Date().getTime() - step.shownAt
    setAnswered({ chosen: idx, correct })
    setAnswers((a) => [...a, { questionId: q.id, correct, ms }])
    const c = correct ? combo + 1 : 0
    setCombo(c)
    setBestCombo((b) => Math.max(b, c))
    update((p) => recordAnswer(p, q.id, correct, stemTermIds(q.stem)))
    if (navigator.vibrate) navigator.vibrate(correct ? 12 : [30, 40, 30])
  }

  const openTerm = (id: string) => {
    session.current.termsTapped.add(id)
    setPaused(true)
    setTerm(id)
    update((p) => recordTermTap(p, id))
  }

  const end = () => {
    const correct = answers.filter((a) => a.correct).length
    onEnd({
      startedAt: start.at,
      endedAt: Date.now(),
      answered: answers.length,
      correct,
      km: progress.roadKm - start.km,
      termsTapped: [...session.current.termsTapped],
    })
  }

  if (!step) return null
  const q = step.pick.question
  const km = progress.roadKm

  return (
    <div className={`run energy-${energy}`}>
      <header className="run-bar">
        <button type="button" className="ghost" onClick={end} aria-label="Pull into a rest stop">
          Rest stop
        </button>
        <div className="run-stats">
          <span className="km" aria-label="distance">
            {km.toFixed(2)} km
          </span>
          {combo >= 2 && (
            <span className={`combo ${combo >= 5 ? 'hot' : ''}`} aria-label={`${combo} in a row`}>
              ×{combo}
            </span>
          )}
        </div>
        <span className={`energy-pill ${energy}`}>{energy === 'hyped' ? 'Cruising' : energy === 'behind' ? 'Warm-up' : step.pick.review ? 'Review' : 'Driving'}</span>
      </header>

      {milestone && (
        <div className="milestone" role="status">
          <Ottie pose="cheer" size={44} />
          <div>
            <strong>{milestone.leaving.name} stretch done</strong>
            <div className="muted small">Rolling into {milestone.entering.name}. Keep going.</div>
          </div>
        </div>
      )}

      <div className="scene-wrap">
        <Scene spec={q.scene} className="scene" />
        {step.warmup && <span className="scene-tag">Warm-up · you know this one</span>}
      </div>

      <p className="stem">
        <TermText text={q.stem} onTerm={openTerm} />
      </p>

      <div className="options" role="group" aria-label="Answers">
        {step.options.map((o) => {
          let cls = 'option'
          if (answered) {
            if (o.idx === q.answerIdx) cls += ' right'
            else if (o.idx === answered.chosen) cls += ' wrong'
            else cls += ' dim'
          }
          return (
            <button key={o.idx} type="button" className={cls} disabled={Boolean(answered)} onClick={() => handleChoose(o.idx)}>
              {o.text}
            </button>
          )
        })}
      </div>

      {answered && (
        <div className={`feedback ${answered.correct ? 'ok' : 'nope'}`} role="status">
          <Ottie pose={answered.correct ? (combo >= 5 ? 'hyped' : 'cheer') : 'wince'} size={52} />
          <div className="feedback-text">
            <strong>{answered.correct ? (combo >= 5 ? `${combo} in a row!` : 'Nice.') : 'Not quite.'}</strong>
            <span>{q.whyOneLiner}</span>
            {answered.correct && <span className="muted small">+{(KM_PER_CORRECT * ((progress.questions[q.id]?.correct ?? 0) === 1 ? 2 : 1) * 1000).toFixed(0)} m</span>}
          </div>
          <button type="button" className="primary next" onClick={next}>
            Next
          </button>
        </div>
      )}

      {!answered && <div className="hint muted small">Tap any dashed word to see what it means</div>}

      <Explainer termId={term} stat={term ? progress.terms[term] : undefined} onClose={() => setTerm(null)} onJump={openTerm} />
      {bestCombo > 0 && <span className="sr-only">Best combo {bestCombo}</span>}
    </div>
  )
}
