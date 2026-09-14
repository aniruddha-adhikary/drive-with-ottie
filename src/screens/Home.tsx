import { questions } from '../content/questions'
import { topicsByRoad } from '../content/topics'
import { startingEnergy } from '../engine/run'
import { currentTopic, daysSinceLastRun, roadFraction, topicFraction, type Progress } from '../state/progress'
import { Ottie } from '../ui/Ottie'

interface Props {
  progress: Progress
  onDrive: () => void
  onSigns: () => void
  onMock: () => void
  onGallery: () => void
}

function greeting(p: Progress): { title: string; sub: string; pose: 'wave' | 'sleepy' | 'cheer' | 'rest' } {
  const gap = daysSinceLastRun(p)
  const topic = currentTopic(p)
  const frac = roadFraction(p)
  if (frac >= 1) return { title: 'Road complete.', sub: 'Every stretch driven at least once. Keep the weak spots warm or sit a mock.', pose: 'cheer' }
  if (gap === null) return { title: 'Hey. Ready to roll?', sub: 'No timers, no streaks. Drive as far as you like, stop whenever.', pose: 'wave' }
  if (startingEnergy(p) === 'behind')
    return {
      title: 'Welcome back.',
      sub: `The road waited. We'll start with a few easy ones you already know, then ${topic ? topic.name : 'keep going'}.`,
      pose: 'sleepy',
    }
  return {
    title: topic ? `Next up: ${topic.name}` : 'Keep rolling',
    sub: gap !== null && gap < 1 ? 'Still warm from earlier. Pick up where you left off.' : 'Hop in whenever. The car is where you parked it.',
    pose: 'wave',
  }
}

export function Home({ progress, onDrive, onSigns, onMock, onGallery }: Props) {
  const g = greeting(progress)
  const frac = roadFraction(progress)
  const done = questions.filter((q) => (progress.questions[q.id]?.correct ?? 0) > 0).length
  return (
    <div className="home">
      <header className="home-hero">
        <Ottie pose={g.pose} size={88} />
        <div>
          <h1>{g.title}</h1>
          <p className="muted">{g.sub}</p>
        </div>
      </header>

      <section className="road-card" aria-label="Your road">
        <div className="road-head">
          <span>{progress.roadKm.toFixed(2)} km driven</span>
          <span className="muted">
            {done}/{questions.length} covered
          </span>
        </div>
        <RoadStrip progress={progress} />
        <ol className="stretches">
          {topicsByRoad.map((t) => {
            const f = topicFraction(progress, t.id)
            const active = currentTopic(progress)?.id === t.id
            return (
              <li key={t.id} className={`stretch ${f >= 1 ? 'done' : ''} ${active ? 'active' : ''}`}>
                <span className="stretch-dot" />
                <span className="stretch-name">{t.name}</span>
                <span className="muted small">{Math.round(f * 100)}%</span>
              </li>
            )
          })}
        </ol>
      </section>

      <button type="button" className="primary big" onClick={onDrive}>
        {frac === 0 ? 'Start driving' : frac >= 1 ? 'Drive the weak spots' : 'Keep driving'}
      </button>

      <div className="row">
        <button type="button" className="secondary" onClick={onSigns}>
          Sign book
        </button>
        <button type="button" className="secondary" onClick={onMock}>
          Mock exam
          {progress.mockBest !== undefined && <span className="muted small"> · best {progress.mockBest}/50</span>}
        </button>
      </div>
      <button type="button" className="ghost small" onClick={onGallery}>
        Scene gallery
      </button>
    </div>
  )
}

/** The whole syllabus as one road; the car sits at how far you've come. */
function RoadStrip({ progress }: { progress: Progress }) {
  const frac = roadFraction(progress)
  const x = 16 + frac * 288
  return (
    <svg viewBox="0 0 320 48" className="road-strip" aria-hidden="true">
      <rect x={8} y={14} width={304} height={20} rx={10} fill="#374151" />
      <rect x={8} y={14} width={304} height={20} rx={10} fill="none" stroke="#e5e7eb" strokeWidth={1} strokeDasharray="6 6" opacity={0.5} />
      <rect x={8} y={14} width={Math.max(20, frac * 304)} height={20} rx={10} fill="#22c55e" opacity={0.85} />
      {topicsByRoad.map((t, i) => (
        <circle key={t.id} cx={8 + ((i + 1) / topicsByRoad.length) * 304} cy={24} r={3} fill="#f4c20d" />
      ))}
      <g transform={`translate(${x - 12} 12)`}>
        <rect x={0} y={4} width={24} height={14} rx={4} fill="#ef4444" />
        <rect x={5} y={0} width={14} height={8} rx={3} fill="#fca5a5" />
        <circle cx={6} cy={19} r={3} fill="#111" />
        <circle cx={18} cy={19} r={3} fill="#111" />
      </g>
    </svg>
  )
}
