import {
  type CameraPort,
  type CameraPreset,
  type DeepReadonly,
  type EvidenceVisibility,
  type SceneInput,
  type ViewFit,
  type World,
} from '@ottie/contracts';
import { type WorldScene } from '@ottie/renderer-geometry';
import { type OccluderIndex, evaluateView, indexOccluders } from '@ottie/renderer-evidence';
import { type ViewFitReport, fitView } from './fit';
import { presetToThreeCamera } from './preset';

/**
 * CameraPort over a built R1 scene. `sceneFor(world)` must return the WorldScene built for exactly
 * that world (the renderer's `scene`); the port caches the physical-mesh occluder index per scene
 * and never touches the world or the scene graph.
 */
export interface SceneSource {
  sceneFor(world: DeepReadonly<World>): WorldScene;
}

export interface EvidenceCameraPort extends CameraPort {
  /** Full fit report (linked details, matrices, diagnostics) behind `fit`. */
  fitReport(input: SceneInput): ViewFitReport;
}

export function createCameraPort(source: SceneSource): EvidenceCameraPort {
  const occluders = new WeakMap<WorldScene, OccluderIndex>();
  const indexFor = (scene: WorldScene): OccluderIndex => {
    let index = occluders.get(scene);
    if (!index) {
      index = indexOccluders(scene);
      occluders.set(scene, index);
    }
    return index;
  };
  const sceneOf = (input: SceneInput): WorldScene => {
    const scene = source.sceneFor(input.world);
    if (scene.worldId !== input.world.id) {
      throw new Error(
        `scene source returned a scene for world "${scene.worldId}", not "${input.world.id}"`,
      );
    }
    return scene;
  };
  const fitReport = (input: SceneInput): ViewFitReport => {
    const scene = sceneOf(input);
    const highlight = input.highlightEntityId;
    const highlighted = highlight ? scene.entities.get(highlight) : undefined;
    const enlarge =
      input.preset === 'entity_detail' &&
      highlighted &&
      (highlighted.kind === 'sign_face' || highlighted.kind === 'signal_head');
    return fitView(
      scene,
      input.world,
      input.viewport,
      input.evidence,
      input.preset,
      enlarge
        ? { occluders: indexFor(scene), detailEntityId: highlighted.id }
        : { occluders: indexFor(scene) },
    );
  };
  return {
    fitReport,
    fit(input: SceneInput): ViewFit {
      const report = fitReport(input);
      return {
        camera: report.camera,
        visibleEvidenceIds: report.visibleEvidenceIds,
        hiddenEvidenceIds: report.hiddenEvidenceIds,
        linkedDetailEntityIds: report.linkedDetailEntityIds,
      };
    },
    evaluate(input: SceneInput, camera: CameraPreset): readonly EvidenceVisibility[] {
      const scene = sceneOf(input);
      const three = presetToThreeCamera(camera, input.viewport);
      const { evaluations } = evaluateView(
        scene,
        input.world,
        input.viewport,
        three,
        camera,
        input.evidence,
        camera.evidenceIds,
        indexFor(scene),
      );
      return evaluations.map((e) => e.visibility);
    },
  };
}
