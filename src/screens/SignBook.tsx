import { useState } from 'react'
import { terms } from '../content/terms'
import type { TermCategory } from '../content/types'
import type { Progress } from '../state/progress'
import { Explainer, TermVisual } from '../ui/Explainer'

const groups: { id: TermCategory; name: string }[] = [
  { id: 'sign', name: 'Signs' },
  { id: 'light', name: 'Lights' },
  { id: 'marking', name: 'Markings' },
  { id: 'rule', name: 'Rules' },
  { id: 'vehicle', name: 'Vehicles' },
  { id: 'place', name: 'Places' },
]

/** Browse every glossary term as a tappable card. */
export function SignBook({ progress, onBack }: { progress: Progress; onBack: () => void }) {
  const [open, setOpen] = useState<string | null>(null)
  const [filter, setFilter] = useState<TermCategory | 'all'>('all')
  const shown = terms.filter((t) => filter === 'all' || t.category === filter)
  return (
    <div className="signbook">
      <header className="bar">
        <button type="button" className="ghost" onClick={onBack}>
          ‹ Back
        </button>
        <h1>Sign book</h1>
        <span />
      </header>
      <div className="chips scroll-x">
        <button type="button" className={`chip ${filter === 'all' ? 'on' : ''}`} onClick={() => setFilter('all')}>
          All
        </button>
        {groups.map((g) => (
          <button key={g.id} type="button" className={`chip ${filter === g.id ? 'on' : ''}`} onClick={() => setFilter(g.id)}>
            {g.name}
          </button>
        ))}
      </div>
      <div className="grid">
        {shown.map((t) => {
          const s = progress.terms[t.id]
          const shaky = s && s.seen >= 2 && s.correct / s.seen < 0.6
          return (
            <button key={t.id} type="button" className={`card ${shaky ? 'shaky' : ''}`} onClick={() => setOpen(t.id)}>
              <div className="card-visual">
                <TermVisual term={t} size={64} />
              </div>
              <span className="card-name">{t.name}</span>
              {shaky && <span className="card-flag">shaky</span>}
            </button>
          )
        })}
      </div>
      <Explainer termId={open} stat={open ? progress.terms[open] : undefined} onClose={() => setOpen(null)} onJump={setOpen} />
    </div>
  )
}
