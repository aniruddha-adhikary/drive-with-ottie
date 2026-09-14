import { useEffect, useMemo, useState } from 'react'
import { MOCK, mockPaper, shuffledOptions } from '../engine/run'
import { Scene } from '../scene/Scene'
import type { Progress } from '../state/progress'
import { Ottie } from '../ui/Ottie'
import { TermText } from '../ui/TermText'

interface Props {
  update: (fn: (p: Progress) => Progress) => void
  onExit: () => void
}

type Phase = 'intro' | 'exam' | 'result'

/** Real BTT format: 50 questions, 50 minutes, 45 to pass. No explainers, no feedback until the end. */
export function MockExam({ update, onExit }: Props) {
  const paper = useMemo(() => mockPaper(), [])
  const options = useMemo(() => paper.map(shuffledOptions), [paper])
  const [phase, setPhase] = useState<Phase>('intro')
  const [i, setI] = useState(0)
  const [chosen, setChosen] = useState<(number | null)[]>(() => paper.map(() => null))
  const [left, setLeft] = useState(MOCK.minutes * 60)

  useEffect(() => {
    if (phase !== 'exam') return
    const t = setInterval(
      () =>
        setLeft((s) => {
          if (s <= 1) setPhase('result')
          return Math.max(0, s - 1)
        }),
      1000
    )
    return () => clearInterval(t)
  }, [phase])

  const score = chosen.filter((c, k) => c !== null && c === paper[k]?.answerIdx).length
  const passMark = Math.round((MOCK.pass / MOCK.count) * paper.length)

  useEffect(() => {
    if (phase !== 'result') return
    update((p) => ({ ...p, mockBest: Math.max(p.mockBest ?? 0, score) }))
  }, [phase, score, update])

  if (phase === 'intro')
    return (
      <div className="mock intro">
        <Ottie pose="think" size={80} />
        <h1>Mock exam</h1>
        <p className="muted">
          {paper.length} questions · {MOCK.minutes} minutes · {passMark} to pass. No hints, no explainers, no Ottie until the end. Just like the real thing.
        </p>
        <button type="button" className="primary big" onClick={() => setPhase('exam')}>
          Start the clock
        </button>
        <button type="button" className="ghost" onClick={onExit}>
          Not now
        </button>
      </div>
    )

  if (phase === 'result') {
    const pass = score >= passMark
    return (
      <div className="mock result">
        <Ottie pose={pass ? 'cheer' : 'wave'} size={88} />
        <h1>{pass ? 'Pass.' : 'Not this time.'}</h1>
        <p className="score">
          {score} / {paper.length}
        </p>
        <p className="muted">{pass ? 'That would have passed the real BTT.' : `${passMark} needed. Every miss below is a tap away from making sense.`}</p>
        <ul className="review">
          {paper.map((q, k) =>
            chosen[k] === q.answerIdx ? null : (
              <li key={q.id}>
                <div className="small">
                  <TermText text={q.stem} plain />
                </div>
                <div className="small muted">
                  {chosen[k] === null ? 'Skipped' : `You: ${q.options[chosen[k] ?? 0]}`} · Answer: <strong>{q.options[q.answerIdx]}</strong>
                </div>
              </li>
            )
          )}
        </ul>
        <button type="button" className="primary big" onClick={onExit}>
          Back to the road
        </button>
      </div>
    )
  }

  const q = paper[i]
  if (!q) return null
  const mm = Math.floor(left / 60)
  const ss = String(left % 60).padStart(2, '0')
  return (
    <div className="mock exam">
      <header className="bar">
        <span className="muted">
          {i + 1} / {paper.length}
        </span>
        <span className={`timer ${left < 300 ? 'low' : ''}`} aria-live="off">
          {mm}:{ss}
        </span>
        <button type="button" className="ghost small" onClick={() => setPhase('result')}>
          Submit
        </button>
      </header>
      <div className="scene-wrap">
        <Scene spec={q.scene} className="scene" timeOfDay="day" />
      </div>
      <p className="stem">
        <TermText text={q.stem} plain />
      </p>
      <div className="options">
        {(options[i] ?? []).map((o) => (
          <button
            key={o.idx}
            type="button"
            className={`option ${chosen[i] === o.idx ? 'picked' : ''}`}
            onClick={() => setChosen((c) => c.map((v, k) => (k === i ? o.idx : v)))}
          >
            {o.text}
          </button>
        ))}
      </div>
      <div className="row">
        <button type="button" className="secondary" disabled={i === 0} onClick={() => setI(i - 1)}>
          Prev
        </button>
        {i < paper.length - 1 ? (
          <button type="button" className="primary" onClick={() => setI(i + 1)}>
            Next
          </button>
        ) : (
          <button type="button" className="primary" onClick={() => setPhase('result')}>
            Finish
          </button>
        )}
      </div>
    </div>
  )
}
