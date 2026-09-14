import { type KeyboardEvent, useEffect, useId, useRef } from 'react';
import { type CameraPresetName, type DeepReadonly, type EntityId, type EvidenceRequirement, type SceneView, type ViewerPreferences, type World } from '@ottie/contracts';
import { SceneHost } from './SceneHost';

interface Props {
  readonly sceneView: SceneView;
  readonly world: DeepReadonly<World>;
  readonly evidence: readonly EvidenceRequirement[];
  readonly preset: CameraPresetName;
  readonly initialPreset: CameraPresetName;
  readonly preferences: ViewerPreferences;
  readonly highlightEntityId: EntityId | null;
  readonly onPresetChange: (preset: CameraPresetName) => void;
  readonly onClose: () => void;
}

export const PRESET_LABELS: Readonly<Record<CameraPresetName, string>> = {
  plan: 'Top view',
  study_oblique: 'Scene view',
  approach_ego: 'Approach view',
  entity_detail: 'Detail view',
};

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Enlarged scene viewer. Camera presets, reset and close live here and nowhere else in the lesson.
 * It is a modal dialog outside any answer control: nothing tapped or dragged inside it can select or
 * submit an answer, and closing it changes only presentation state.
 */
export function SceneViewer({ sceneView, world, evidence, preset, initialPreset, preferences, highlightEntityId, onPresetChange, onClose }: Props): React.JSX.Element {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== 'Tab' || !dialogRef.current) return;
    const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const presets = world.cameraPresets.map((p) => p.name);

  return (
    <div className="ottie-viewer-backdrop" data-testid="scene-viewer">
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} className="ottie-viewer" onKeyDown={onKeyDown}>
        <header className="ottie-viewer__bar">
          <h2 id={titleId} className="ottie-type-control ottie-viewer__title">
            Scene viewer
          </h2>
          <button ref={closeRef} type="button" className="ottie-btn ottie-btn--quiet" onClick={onClose} aria-label="Close scene viewer">
            Close
          </button>
        </header>
        <div className="ottie-viewer__scene">
          <SceneHost
            sceneView={sceneView}
            world={world}
            evidence={evidence}
            preset={preset}
            preferences={preferences}
            highlightEntityId={highlightEntityId}
            label={`Enlarged scene, ${PRESET_LABELS[preset]}`}
            fallbackSizePx={{ width: 360, height: 360 }}
          />
        </div>
        <div className="ottie-viewer__controls" role="group" aria-label="Camera view">
          {presets.map((name) => (
            <button
              key={name}
              type="button"
              className="ottie-btn ottie-btn--quiet"
              aria-pressed={name === preset}
              onClick={() => {
                onPresetChange(name);
              }}
            >
              {PRESET_LABELS[name]}
            </button>
          ))}
          <button
            type="button"
            className="ottie-btn ottie-btn--quiet"
            disabled={preset === initialPreset}
            onClick={() => {
              onPresetChange(initialPreset);
            }}
          >
            Reset view
          </button>
        </div>
        <p className="ottie-type-metadata ottie-viewer__note">Looking around never changes the traffic, the question or your answer.</p>
      </div>
    </div>
  );
}
