import { Vector3 } from 'three';
import {
  type RenderedSignFace,
  type RenderedSignalHead,
  type WorldScene,
} from '@ottie/renderer-geometry';
import { type CameraFrame, towardViewer } from './projection';
import { EVIDENCE_THRESHOLDS } from './thresholds';

/**
 * Does the readable side of a face or signal head point at the viewer? The normal used is the
 * one R1 derived from the authored pose × asset axes — the direction the physical part really
 * faces — never a camera-facing substitute. The declared World normal is only compared, so a
 * world that lies about its sign is reported rather than believed.
 */
export interface FacingEvaluation {
  readonly entityId: string;
  readonly frontFacing: boolean;
  /** cos(angle between physical front normal and the direction to the viewer). */
  readonly cosine: number;
  readonly angleDeg: number;
  readonly maxAngleDeg: number;
  readonly frontNormal: Vector3;
  readonly towardViewer: Vector3;
  /** Whether the physical front faces the approach the World says it serves (from R1). */
  readonly facesIntendedApproach: boolean;
  /** R1 reported that the declared World frontNormal disagrees with the built geometry. */
  readonly declaredNormalMismatch: boolean;
}

export type FacingEntity = RenderedSignFace | RenderedSignalHead;

export function isFacingEntity(kind: string): kind is FacingEntity['kind'] {
  return kind === 'sign_face' || kind === 'signal_head';
}

export function facingReferencePoint(entity: FacingEntity): Vector3 {
  return entity.kind === 'sign_face'
    ? entity.panelCentre.clone()
    : entity.bounds.getCenter(new Vector3());
}

export function evaluateFacing(
  entity: FacingEntity,
  frame: CameraFrame,
  scene: WorldScene,
  maxAngleDeg: number = EVIDENCE_THRESHOLDS.frontFacingMaxAngleDeg,
): FacingEvaluation {
  const toward = towardViewer(frame, facingReferencePoint(entity));
  const normal = entity.frontNormal.clone().normalize();
  const cosine = normal.dot(toward);
  const angleDeg = (Math.acos(Math.min(1, Math.max(-1, cosine))) * 180) / Math.PI;
  return {
    entityId: entity.id,
    frontFacing: angleDeg <= maxAngleDeg,
    cosine,
    angleDeg,
    maxAngleDeg,
    frontNormal: normal,
    towardViewer: toward,
    facesIntendedApproach: entity.facesIntendedApproach,
    declaredNormalMismatch: scene.issues.some(
      (issue) => issue.code === 'front_normal_mismatch' && issue.entityId === entity.id,
    ),
  };
}
