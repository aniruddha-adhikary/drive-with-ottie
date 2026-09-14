import { termById } from '../content/terms'
import { currentTopic, type Progress, type RunRecord } from '../state/progress'
import { Ottie } from '../ui/Ottie'

interface Props {
  run: RunRecord
  progress: Progress
  onHome: () => void
  onAgain: () => void
}

function fmt(ms: number) {
  const m = Math.floor(ms / 60000)
  const s = Math.floor((ms % 60000) / 1000)
  return m > 0 ? `${m} min ${s}s` : `${s}s`
}

/** Shown only when the driver chose to stop. Warm summary, no grades. */
export function RestStop({ run, progress, onHome, onAgain }: Props) {
  const acc = run.answered ? Math.round((run.correct / run.answered) * 100) : 0
  const next = currentTopic(progress)
  const tapped = run.termsTapped.map((id) => termById.get(id)?.name).filter(Boolean)
  return (
    <div className="rest">
      <Ottie pose="rest" size={96} />
      <h1>Rest stop</h1>
      <p className="muted">
        {run.answered === 0 ? 'Even opening the door counts.' : run.answered >= 30 ? 'That was a proper drive.' : 'Good stretch. The road remembers.'}
      </p>
      <dl className="rest-stats">
        <div>
          <dt>Distance</dt>
          <dd>{(run.km * 1000).toFixed(0)} m</dd>
        </div>
        <div>
          <dt>Questions</dt>
          <dd>{run.answered}</dd>
        </div>
        <div>
          <dt>Accuracy</dt>
          <dd>{run.answered ? `${acc}%` : '—'}</dd>
        </div>
        <div>
          <dt>Time</dt>
          <dd>{fmt(run.endedAt - run.startedAt)}</dd>
        </div>
      </dl>
      {tapped.length > 0 && (
        <p className="small">
          <span className="muted">Looked up:</span> {tapped.join(', ')}
        </p>
      )}
      {next && (
        <p className="small muted">
          Next time you&apos;re on <strong>{next.name}</strong>. It&apos;ll be right where you left it.
        </p>
      )}
      <button type="button" className="primary big" onClick={onAgain}>
        Actually, keep going
      </button>
      <button type="button" className="secondary" onClick={onHome}>
        Park for now
      </button>
    </div>
  )
}
