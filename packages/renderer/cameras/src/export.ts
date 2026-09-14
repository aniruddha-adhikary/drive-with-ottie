import {
  type CameraPreset,
  type Diagnostic,
  type EvidenceVisibility,
  type Viewport,
} from '@ottie/contracts';
import { round, safeRect } from '@ottie/renderer-evidence';
import { presetToThreeCamera } from './preset';

/**
 * Review-export-ready camera description: plain numbers only (column-major 4x4 arrays as Three.js
 * stores them), so a review tool can re-project world points without Three.js or the scene.
 */
export interface CameraMatrices {
  readonly preset: {
    readonly name: CameraPreset['name'];
    readonly projection: CameraPreset['projection'];
    readonly eye: readonly [number, number, number];
    readonly target: readonly [number, number, number];
    readonly up: readonly [number, number, number];
    readonly fovOrHalfHeight: number;
    readonly linkedEntityId: string | null;
    readonly evidenceIds: readonly string[];
  };
  readonly viewport: Viewport;
  readonly safeRectPx: {
    readonly left: number;
    readonly top: number;
    readonly right: number;
    readonly bottom: number;
  };
  readonly aspect: number;
  readonly near: number;
  readonly far: number;
  /** World → camera (camera.matrixWorldInverse), column-major. */
  readonly view: readonly number[];
  /** Camera → world (camera.matrixWorld), column-major. */
  readonly cameraToWorld: readonly number[];
  /** Camera → clip, column-major. */
  readonly projection: readonly number[];
  /** World → clip = projection × view, column-major. */
  readonly viewProjection: readonly number[];
  readonly forward: readonly [number, number, number];
}

function triple(v: {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}): readonly [number, number, number] {
  return [round(v.x, 6), round(v.y, 6), round(v.z, 6)];
}

export function cameraMatrices(preset: CameraPreset, viewport: Viewport): CameraMatrices {
  const camera = presetToThreeCamera(preset, viewport);
  camera.updateMatrixWorld(true);
  const viewProjection = camera.projectionMatrix.clone().multiply(camera.matrixWorldInverse);
  const forward = camera.getWorldDirection(camera.position.clone());
  const safe = safeRect(viewport);
  return {
    preset: {
      name: preset.name,
      projection: preset.projection,
      eye: triple(preset.eye),
      target: triple(preset.target),
      up: triple(preset.up),
      fovOrHalfHeight: preset.fovOrHalfHeight,
      linkedEntityId: preset.linkedEntityId,
      evidenceIds: [...preset.evidenceIds],
    },
    viewport: { ...viewport, safeInsetsPx: { ...viewport.safeInsetsPx } },
    safeRectPx: { left: safe.left, top: safe.top, right: safe.right, bottom: safe.bottom },
    aspect: viewport.widthPx / Math.max(1, viewport.heightPx),
    near: camera.near,
    far: camera.far,
    view: camera.matrixWorldInverse.toArray().map((n) => round(n, 8)),
    cameraToWorld: camera.matrixWorld.toArray().map((n) => round(n, 8)),
    projection: camera.projectionMatrix.toArray().map((n) => round(n, 8)),
    viewProjection: viewProjection.toArray().map((n) => round(n, 8)),
    forward: triple(forward),
  };
}

/** One camera's evidence result in a plain, JSON-serialisable shape. */
export interface CameraEvidenceExport {
  readonly matrices: CameraMatrices;
  readonly evidence: readonly EvidenceVisibility[];
  readonly diagnostics: readonly Diagnostic[];
}

export function exportCameraEvidence(
  preset: CameraPreset,
  viewport: Viewport,
  evidence: readonly EvidenceVisibility[],
  diagnostics: readonly Diagnostic[],
): CameraEvidenceExport {
  return {
    matrices: cameraMatrices(preset, viewport),
    evidence: [...evidence],
    diagnostics: [...diagnostics],
  };
}
