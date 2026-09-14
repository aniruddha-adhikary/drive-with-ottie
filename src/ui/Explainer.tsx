import { termById } from '../content/terms'
import type { Term } from '../content/types'
import { Scene } from '../scene/Scene'
import { SignGlyph } from '../scene/Signs'
import { LightGlyph } from '../scene/TrafficLight'
import type { TermStat } from '../state/progress'
import { Sheet } from './Sheet'

interface Props {
  termId: string | null
  onClose: () => void
  onJump: (termId: string) => void
  stat?: TermStat
}

export function TermVisual({ term, size = 84 }: { term: Term; size?: number }) {
  const v = term.visual
  if ('sign' in v) return <SignGlyph id={v.sign} size={size} />
  if ('light' in v) return <LightGlyph state={v.light} size={size} />
  if ('marking' in v) return <Scene spec={{ road: 'straight', markings: [v.marking] }} timeOfDay="day" compact className="term-visual-scene" />
  return <Scene spec={v.scene} timeOfDay="day" compact className="term-visual-scene" />
}

export function ExplainerBody({ term, stat, onJump }: { term: Term; stat?: TermStat; onJump?: (id: string) => void }) {
  const confusables = term.confusables.map((id) => termById.get(id)).filter((t): t is Term => Boolean(t))
  return (
    <div className="explainer">
      <div className="explainer-hero">
        <TermVisual term={term} />
        <p className="explainer-meaning">{term.plainMeaning}</p>
      </div>
      {term.pair && (
        <div className="pair">
          <figure className="pair-card pair-yes">
            <Scene spec={term.pair.yes.scene} timeOfDay="day" compact className="pair-scene" />
            <figcaption>
              <span className="pair-mark">✓</span> {term.pair.yes.caption}
            </figcaption>
          </figure>
          <figure className="pair-card pair-no">
            <Scene spec={term.pair.no.scene} timeOfDay="day" compact className="pair-scene" />
            <figcaption>
              <span className="pair-mark">✗</span> {term.pair.no.caption}
            </figcaption>
          </figure>
        </div>
      )}
      {confusables.length > 0 && (
        <div className="confusables">
          <span className="muted">Often mixed up with</span>
          <div className="chips">
            {confusables.map((c) => (
              <button key={c.id} type="button" className="chip" onClick={() => onJump?.(c.id)}>
                {c.name}
              </button>
            ))}
          </div>
        </div>
      )}
      {stat && stat.seen > 0 && (
        <p className="muted small">
          You&apos;ve met this {stat.seen} time{stat.seen === 1 ? '' : 's'} · {stat.correct} right
        </p>
      )}
    </div>
  )
}

export function Explainer({ termId, onClose, onJump, stat }: Props) {
  const term = termId ? termById.get(termId) : undefined
  return (
    <Sheet open={Boolean(term)} onClose={onClose} title={term?.name}>
      {term && <ExplainerBody term={term} stat={stat} onJump={onJump} />}
    </Sheet>
  )
}
