import { useState } from 'react'
import { lintQuestions } from '../content/lint'
import { questions } from '../content/questions'
import { termById, terms } from '../content/terms'
import type { TimeOfDay } from '../content/types'
import { Scene } from '../scene/Scene'
import { SignGlyph } from '../scene/Signs'
import { LightGlyph } from '../scene/TrafficLight'
import { TermText } from '../ui/TermText'

const tods: TimeOfDay[] = ['day', 'dawn', 'dusk', 'night']

/** Every question scene and glyph on one page, for eyeballing rendering. */
export function Gallery({ onBack }: { onBack: () => void }) {
  const [tod, setTod] = useState<TimeOfDay>('day')
  const issues = lintQuestions(questions, termById)
  const signs = terms.filter((t) => 'sign' in t.visual)
  const lights = terms.filter((t) => 'light' in t.visual)
  return (
    <div className="gallery">
      <header className="bar">
        <button type="button" className="ghost" onClick={onBack}>
          ‹ Back
        </button>
        <h1>Scene gallery</h1>
        <span />
      </header>
      <div className="chips">
        {tods.map((t) => (
          <button key={t} type="button" className={`chip ${tod === t ? 'on' : ''}`} onClick={() => setTod(t)}>
            {t}
          </button>
        ))}
      </div>
      {issues.length > 0 && (
        <div className="lint-issues">
          <strong>{issues.length} lint issue(s)</strong>
          <ul>
            {issues.map((i, k) => (
              <li key={k}>
                <code>{i.questionId}</code>: {i.message}
              </li>
            ))}
          </ul>
        </div>
      )}
      <h2>Signs</h2>
      <div className="glyph-grid">
        {signs.map((t) => (
          <div key={t.id} className="glyph">
            {'sign' in t.visual && <SignGlyph id={t.visual.sign} size={56} />}
            <span className="small">{t.name}</span>
          </div>
        ))}
      </div>
      <h2>Lights</h2>
      <div className="glyph-grid">
        {lights.map((t) => (
          <div key={t.id} className="glyph">
            {'light' in t.visual && <LightGlyph state={t.visual.light} size={56} />}
            <span className="small">{t.name}</span>
          </div>
        ))}
      </div>
      <h2>Question scenes</h2>
      {questions.map((q) => (
        <figure key={q.id} className="gallery-item">
          <Scene spec={q.scene} timeOfDay={tod} className="scene" />
          <figcaption>
            <code>{q.id}</code> <TermText text={q.stem} plain />
            <div className="muted small">{JSON.stringify(q.scene)}</div>
          </figcaption>
        </figure>
      ))}
    </div>
  )
}
