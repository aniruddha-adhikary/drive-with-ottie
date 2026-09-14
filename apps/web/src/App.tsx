import { useState } from 'react';
import { type CameraPresetName, type DeepReadonly, type World } from '@ottie/contracts';
import { DEVELOPMENT_WORLDS } from '@ottie/contracts/fixtures';
import { DevelopmentBanner } from './components/DevelopmentBanner';
import { FixturePicker } from './components/FixturePicker';
import { ModuleStatusPanel } from './components/ModuleStatusPanel';
import { SceneCanvas } from './components/SceneCanvas';
import { WorldSummary } from './components/WorldSummary';

function defaultWorld(): DeepReadonly<World> {
  const first = DEVELOPMENT_WORLDS[0];
  if (!first) throw new Error('no development worlds');
  return first;
}

/**
 * Web shell. Feature routes (Learn, Practice, Glossary, Progress) are added by U1/I1 under
 * apps/web/src/features/<feature>/ and mounted from apps/web/src/routes.tsx — see CONTRACTS.md.
 */
export function App(): React.JSX.Element {
  const [world, setWorld] = useState<DeepReadonly<World>>(defaultWorld);
  const [preset, setPreset] = useState<CameraPresetName>('plan');

  return (
    <div className="ottie-shell">
      <DevelopmentBanner />
      <header className="ottie-header">
        <h1>Drive with Ottie</h1>
        <span>Singapore Basic Theory Test study prototype — foundation slice (F0)</span>
      </header>
      <main className="ottie-main">
        <section aria-label="Scene">
          <SceneCanvas world={world} preset={preset} />
          <div className="ottie-controls" role="group" aria-label="Camera view" style={{ marginTop: '0.5rem' }}>
            {world.cameraPresets.map((p) => (
              <button key={p.name} type="button" aria-pressed={p.name === preset} onClick={() => {
                setPreset(p.name);
              }}>
                {p.name.replace('_', ' ')}
              </button>
            ))}
          </div>
        </section>
        <aside>
          <FixturePicker worlds={DEVELOPMENT_WORLDS} selected={world} onSelect={(w) => { setWorld(w); setPreset('plan'); }} />
          <WorldSummary world={world} />
          <ModuleStatusPanel />
        </aside>
      </main>
      <footer className="ottie-footer">
        Build mode: {__OTTIE_BUILD_MODE__}. Device-local only; no accounts, no sync. No content here is release-approved.
      </footer>
    </div>
  );
}
