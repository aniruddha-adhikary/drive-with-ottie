import { useMemo } from 'react';
import { type CameraPresetName, type EntityId, type Preferences } from '@ottie/contracts';
import { type ComparisonOutcome } from '@ottie/starter-content';
import { type GlossaryRequest } from '../glossary/types';
import { type WorldStage } from './runtime';
import { SceneHost } from './SceneHost';
import { PRESET_LABELS } from './SceneViewer';

export interface ComparisonPanelProps {
  readonly request: GlossaryRequest;
  readonly outcome: ComparisonOutcome | null;
  /** A stage that is NOT the lesson's: the comparison world is drawn by its own R1 renderer. */
  readonly stage: WorldStage;
  readonly preset: CameraPresetName;
  readonly preferences: Preferences;
  readonly onClose: () => void;
}

const REASON_COPY: Record<Extract<ComparisonOutcome, { kind: 'unavailable' }>['reason'], string> = {
  unsupported_phase: 'This signal combination is not supported by the generator, so it is not drawn.',
  validation_errors: 'This comparison did not pass validation, so it is not drawn.',
  applier_refused: 'This comparison could not be applied to the base world, so it is not drawn.',
  not_applicable: 'This comparison does not apply to the current world, so it is not drawn.',
};

/**
 * Explicit comparison/replay rendering. The comparison is a SEPARATE generated or applied world on
 * its own renderer: the question's world, attempt, answer and seed are never touched, and an
 * unavailable comparison shows its refusal reason instead of any drawn scene.
 */
export function ComparisonPanel(props: ComparisonPanelProps): React.JSX.Element {
  const { request, outcome, stage, preset, preferences, onClose } = props;
  const world = outcome?.kind === 'available' ? outcome.world : null;

  const highlight = useMemo<EntityId | null>(() => {
    const binding = request.fromBinding;
    if (!world || binding.role !== 'actual') return null;
    const ids = new Set<string>([...world.markings, ...world.supports, ...world.signFaces, ...world.signalHeads, ...world.actors].map((e) => e.id));
    return ids.has(binding.entityId) ? binding.entityId : null;
  }, [request, world]);

  const presetName: CameraPresetName = world?.cameraPresets.some((p) => p.name === preset) ? preset : (world?.cameraPresets[0]?.name ?? preset);
  const title = request.kind === 'replay' ? 'Replay' : 'Comparison';

  return (
    <section className="ottie-panel ottie-comparison" aria-label={`${title}: ${request.comparison.label}`} data-testid="comparison-panel" data-comparison-id={request.comparison.id} data-state={outcome?.kind ?? 'missing'}>
      <div className="ottie-comparison__header">
        <h3 className="ottie-type-control ottie-comparison__title">
          {title}: {request.comparison.label}
        </h3>
        <button type="button" className="ottie-btn ottie-btn--quiet" onClick={onClose} data-testid="comparison-close">
          Close comparison
        </button>
      </div>
      {world ? (
        <>
          <div className="ottie-lesson__scene ottie-comparison__scene">
            <SceneHost sceneView={stage.sceneView} world={world} evidence={world.evidence} preset={presetName} preferences={preferences} highlightEntityId={highlight} label={`${title} scene, ${PRESET_LABELS[presetName]}`} />
          </div>
          <p className="ottie-type-metadata ottie-comparison__note" data-testid="comparison-note">
            Separate {outcome?.kind === 'available' && outcome.source === 'applied' ? 'applied' : 'generated'} world {world.id} — the question above is unchanged. Development content, not release content.
          </p>
        </>
      ) : outcome?.kind === 'unavailable' ? (
        <p className="ottie-type-explanation ottie-comparison__refused" role="status" data-testid="comparison-unavailable" data-reason={outcome.reason}>
          {REASON_COPY[outcome.reason]} ({outcome.detail})
        </p>
      ) : (
        <p className="ottie-type-explanation ottie-comparison__refused" role="status" data-testid="comparison-unavailable" data-reason="missing">
          No comparison world is registered for {request.comparison.id}.
        </p>
      )}
    </section>
  );
}
