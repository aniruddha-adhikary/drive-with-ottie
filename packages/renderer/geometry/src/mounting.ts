import { Matrix4, type Quaternion, Vector3 } from 'three';
import {
  type AssetDefinition,
  type Attachment,
  type Pose,
  type Radians,
  type UnitVec3,
} from '@ottie/contracts';
import { type BuildContext, attachmentPointsOf } from './context';
import {
  type FacingFrame,
  facingFrame,
  headingVector,
  mmOffsetToVector3,
  poseQuaternion,
  toVector3,
} from './frames';
import { type FacingFacts, type MountFacts, type RenderedSupport } from './types';

/**
 * Placement of a face or signal head. The asset gives the part's own front/up axes and its
 * attachment point; the world gives the pose and the support attachment it hangs from. The
 * part's local origin is its attachment point, so mounting means placing that origin exactly on
 * the support's named attachment point. The declared `frontNormal`/`up` on the entity are checked
 * against pose × asset axes and reported if they disagree — never used to "fix" the orientation.
 */

export interface MountedPlacement {
  /** World transform of the part's local frame (origin = part attachment point). */
  readonly matrix: Matrix4;
  readonly quaternion: Quaternion;
  readonly origin: Vector3;
  /** Local (asset-frame) orthonormal frame: front, up, right. */
  readonly localFrame: FacingFrame;
  readonly facing: FacingFacts;
  readonly mount: MountFacts;
  readonly support: RenderedSupport | null;
  /** Ground level under the assembly, from the support base when mounted. */
  readonly groundZ: number;
}

export interface MountablePart {
  readonly id: string;
  readonly pose: Pose;
  readonly attachment: Attachment;
  readonly frontNormal: UnitVec3;
  readonly up: UnitVec3;
  readonly intendedApproach: { readonly heading: Radians };
}

export function placeMountedPart(
  ctx: BuildContext,
  part: MountablePart,
  asset: AssetDefinition,
  assetFront: UnitVec3,
  assetUp: UnitVec3,
): MountedPlacement {
  const quaternion = poseQuaternion(part.pose);
  const localFrame = facingFrame(toVector3(assetFront), toVector3(assetUp));
  const front = localFrame.front.clone().applyQuaternion(quaternion);
  const up = localFrame.up.clone().applyQuaternion(quaternion);
  const right = localFrame.right.clone().applyQuaternion(quaternion);

  const declaredFront = toVector3(part.frontNormal).normalize();
  if (front.dot(declaredFront) < 0.999) {
    ctx.issue(
      'front_normal_mismatch',
      part.id,
      `pose × asset front is (${fmt(front)}) but world declares (${fmt(declaredFront)})`,
    );
  }
  const declaredUp = toVector3(part.up).normalize();
  if (up.dot(declaredUp) < 0.999) {
    ctx.issue(
      'up_mismatch',
      part.id,
      `pose × asset up is (${fmt(up)}) but world declares (${fmt(declaredUp)})`,
    );
  }
  const approach = headingVector(part.intendedApproach.heading);
  const facing: FacingFacts = {
    frontNormal: front,
    up,
    right,
    facesIntendedApproach: front.dot(approach) < -0.5,
  };

  const supportEntity = ctx.entities.get(part.attachment.supportId);
  const support = supportEntity?.kind === 'support' ? supportEntity : null;
  let origin = toVector3(part.pose.position);
  let mounted = false;
  let attachmentPoint: Vector3 | null = null;
  if (!support) {
    ctx.issue(
      'missing_support',
      part.id,
      `support ${part.attachment.supportId} is not a rendered support; part floats at its pose`,
    );
  } else {
    const supportPoint = support.attachmentPoints.get(part.attachment.supportAttachmentName);
    const partPoint = attachmentPointsOf(asset).find(
      (p) => p.name === part.attachment.partAttachmentName,
    );
    if (!supportPoint) {
      ctx.issue(
        'missing_attachment_point',
        part.id,
        `support ${support.id} has no attachment '${part.attachment.supportAttachmentName}'`,
      );
    } else if (!partPoint) {
      ctx.issue(
        'missing_attachment_point',
        part.id,
        `asset ${asset.id} has no attachment '${part.attachment.partAttachmentName}'`,
      );
    } else {
      const partOffsetWorld = mmOffsetToVector3(partPoint.offsetMm).applyQuaternion(quaternion);
      const mountedOrigin = supportPoint.clone().sub(partOffsetWorld);
      const drift = mountedOrigin.distanceTo(origin);
      if (drift > 1e-3) {
        ctx.issue(
          'pose_attachment_mismatch',
          part.id,
          `pose position is ${drift.toFixed(3)} m from the support attachment point; drawn at the pose`,
        );
      } else {
        mounted = true;
        attachmentPoint = supportPoint.clone();
        origin = mountedOrigin;
      }
      if (
        part.attachment.heightAboveGroundM !== null &&
        Math.abs(supportPoint.z - support.base.z - part.attachment.heightAboveGroundM) > 1e-3
      ) {
        ctx.issue(
          'pose_attachment_mismatch',
          part.id,
          `attachment height ${part.attachment.heightAboveGroundM} m disagrees with support point ${(supportPoint.z - support.base.z).toFixed(3)} m above base`,
        );
      }
    }
  }

  const groundZ = support
    ? support.base.z
    : part.pose.position.z - (part.attachment.heightAboveGroundM ?? part.pose.position.z);
  const matrix = new Matrix4().compose(origin, quaternion, new Vector3(1, 1, 1));
  return {
    matrix,
    quaternion,
    origin,
    localFrame,
    facing,
    mount: { supportId: support ? support.id : null, mounted, attachmentPoint },
    support,
    groundZ,
  };
}

function fmt(v: Vector3): string {
  return `${v.x.toFixed(3)}, ${v.y.toFixed(3)}, ${v.z.toFixed(3)}`;
}
