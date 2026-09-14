import { useState } from 'react';
import { type CameraPresetName, type DeepReadonly, type World } from '@ottie/contracts';
import { DEVELOPMENT_WORLDS } from '@ottie/contracts/fixtures';
import { FixturePicker } from '../../components/FixturePicker';
import { ModuleStatusPanel } from '../../components/ModuleStatusPanel';
import { SceneCanvas } from '../../components/SceneCanvas';
import { WorldSummary } from '../../components/WorldSummary';

function defaultWorld(): DeepReadonly<World> {
  const first = DEVELOPMENT_WORLDS[0];
  if (!first) throw new Error('no development worlds');
  return first;
}

/** F0 fixture inspector, kept as a secondary debug route; the lesson is the default. */
export default function InspectorFeature(): React.JSX.Element {
  const [world, setWorld] = useState<DeepReadonly<World>>(defaultWorld);
  const [preset, setPreset] = useState<CameraPresetName>('plan');

  return (
    <main className="ottie-main" data-testid="fixture-inspector">
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
  );
}
