import {
  type CameraPresetName,
  type DeepReadonly,
  type Diagnostic,
  type EvidenceRequirement,
  type Viewport,
  type World,
} from '@ottie/contracts';
import { type WorldScene } from '@ottie/renderer-geometry';
import {
  CAMERA_EVIDENCE_CODES as C,
  type OccluderIndex,
  cameraDiagnostic,
  indexOccluders,
} from '@ottie/renderer-evidence';
import { type ViewFitReport, fitView } from './fit';

/**
 * Whether each required evidence is actually shown by the world's own camera presets. Evidence is
 * exposed when a main view (plan / study_oblique / approach_ego) shows it, or when a main view
 * shows the entity in place and a linked entity_detail carries the readable face. Evidence that
 * only an unlinked entity_detail could show is reported as `only_in_enlarge`; evidence no preset
 * shows is `not_exposed`. Presets are read from the World as authored — none is invented here.
 */
export interface EvidenceExposure {
  readonly evidenceId: string;
  readonly exposedIn: readonly CameraPresetName[];
  /** Main views in which the evidence is carried by a linked entity_detail rather than the view itself. */
  readonly viaLinkedDetailIn: readonly CameraPresetName[];
  readonly onlyInEnlarge: boolean;
  readonly exposed: boolean;
}

export interface ExposureReport {
  readonly worldId: string;
  readonly viewport: Viewport;
  readonly fits: readonly ViewFitReport[];
  readonly exposure: readonly EvidenceExposure[];
  readonly diagnostics: readonly Diagnostic[];
  readonly ok: boolean;
}

const MAIN_VIEWS: readonly CameraPresetName[] = ['plan', 'study_oblique', 'approach_ego'];

export function checkEvidenceExposure(
  scene: WorldScene,
  world: DeepReadonly<World>,
  viewport: Viewport,
  requirements: readonly EvidenceRequirement[],
  requiredEvidenceIds: readonly string[],
  occluders: OccluderIndex = indexOccluders(scene),
): ExposureReport {
  const authoredNames = new Set(world.cameraPresets.map((c) => c.name));
  const fits: ViewFitReport[] = [];
  for (const name of MAIN_VIEWS)
    if (authoredNames.has(name))
      fits.push(fitView(scene, world, viewport, requirements, name, { occluders }));
  const detailPresets = world.cameraPresets.filter((c) => c.name === 'entity_detail');
  for (const preset of detailPresets)
    fits.push(
      fitView(scene, world, viewport, requirements, 'entity_detail', {
        occluders,
        detailEntityId: preset.linkedEntityId,
      }),
    );

  const known = new Set(requirements.map((r) => r.id));
  const diagnostics: Diagnostic[] = [];
  const exposure: EvidenceExposure[] = [];
  for (const evidenceId of requiredEvidenceIds) {
    if (!known.has(evidenceId)) {
      diagnostics.push(
        cameraDiagnostic(
          'error',
          C.requiredEvidenceUnknown,
          `Required evidence "${evidenceId}" is not declared by world "${world.id}".`,
          [],
          { evidenceId },
        ),
      );
      exposure.push({
        evidenceId,
        exposedIn: [],
        viaLinkedDetailIn: [],
        onlyInEnlarge: false,
        exposed: false,
      });
      continue;
    }
    const exposedIn: CameraPresetName[] = [];
    const viaLinked: CameraPresetName[] = [];
    let detailOnly = false;
    for (const fit of fits) {
      if (fit.presetName === 'entity_detail') {
        if (fit.visibleEvidenceIds.includes(evidenceId)) detailOnly = true;
        continue;
      }
      if (fit.visibleEvidenceIds.includes(evidenceId)) {
        exposedIn.push(fit.presetName);
      } else if (
        fit.linkedDetails.some(
          (d) =>
            d.evidenceIds.includes(evidenceId) &&
            d.visibility.some((v) => v.evidenceId === evidenceId && v.visible),
        )
      ) {
        exposedIn.push(fit.presetName);
        viaLinked.push(fit.presetName);
      }
    }
    const exposed = exposedIn.length > 0;
    if (!exposed) {
      const listedBy = world.cameraPresets
        .filter((c) => c.evidenceIds.includes(evidenceId))
        .map((c) => c.name);
      diagnostics.push(
        detailOnly
          ? cameraDiagnostic(
              'error',
              C.onlyInEnlarge,
              `Required evidence "${evidenceId}" is only shown by an entity_detail close-up; no main view shows it in place, so it is not exposed before Enlarge.`,
              [],
              { evidenceId, listedBy },
            )
          : cameraDiagnostic(
              'error',
              C.notExposed,
              `Required evidence "${evidenceId}" is not shown by any camera preset of world "${world.id}"${listedBy.length > 0 ? ` (listed by ${listedBy.join(', ')} but hidden there)` : ' (no preset lists it)'}.`,
              [],
              { evidenceId, listedBy },
            ),
      );
    }
    exposure.push({
      evidenceId,
      exposedIn,
      viaLinkedDetailIn: viaLinked,
      onlyInEnlarge: !exposed && detailOnly,
      exposed,
    });
  }
  return {
    worldId: world.id,
    viewport,
    fits,
    exposure,
    diagnostics,
    ok: diagnostics.every((d) => d.severity !== 'error'),
  };
}
