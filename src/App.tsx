import { useState } from 'react'
import { Gallery } from './screens/Gallery'
import { Home } from './screens/Home'
import { MockExam } from './screens/MockExam'
import { RestStop } from './screens/RestStop'
import { Run } from './screens/Run'
import { SignBook } from './screens/SignBook'
import { recordRun, useProgress, type RunRecord } from './state/progress'

type Screen = { name: 'home' } | { name: 'run'; id: number } | { name: 'rest'; run: RunRecord } | { name: 'signs' } | { name: 'mock' } | { name: 'gallery' }

export default function App() {
  const { progress, update } = useProgress()
  const [screen, setScreen] = useState<Screen>(() => (location.hash === '#gallery' ? { name: 'gallery' } : { name: 'home' }))

  const startRun = () => setScreen({ name: 'run', id: Date.now() })
  const endRun = (run: RunRecord) => {
    update((p) => recordRun(p, run))
    setScreen({ name: 'rest', run })
  }

  switch (screen.name) {
    case 'run':
      return <Run key={screen.id} progress={progress} update={update} onEnd={endRun} />
    case 'rest':
      return <RestStop run={screen.run} progress={progress} onHome={() => setScreen({ name: 'home' })} onAgain={startRun} />
    case 'signs':
      return <SignBook progress={progress} onBack={() => setScreen({ name: 'home' })} />
    case 'mock':
      return <MockExam update={update} onExit={() => setScreen({ name: 'home' })} />
    case 'gallery':
      return <Gallery onBack={() => setScreen({ name: 'home' })} />
    default:
      return (
        <Home
          progress={progress}
          onDrive={startRun}
          onSigns={() => setScreen({ name: 'signs' })}
          onMock={() => setScreen({ name: 'mock' })}
          onGallery={() => setScreen({ name: 'gallery' })}
        />
      )
  }
}
