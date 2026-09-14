import {
  type AssetDefinition,
  type Attachment,
  type AttachmentPoint,
  type Pose,
  type Support,
  type SupportRole,
  type UnitVec3,
  type Vec3,
  unitVec3,
  vec3,
} from '@ottie/contracts';
import { POSITION_TOLERANCE_M, distance3, isUnit, rotateZ, sameDirection } from '../geometry';
import { Collector, type RO, type SemanticValidator, type WorldIndex } from '../world-index';

const FAMILY_ROLES: Readonly<Record<Support['family'], readonly SupportRole[]>> = {
  post: ['sign_post'],
  pole: ['signal_pole'],
  mast_arm: ['signal_mast_arm'],
  gantry: ['gantry'],
  wall: ['wall_bracket'],
  unspecified: ['sign_post', 'signal_pole', 'signal_mast_arm', 'gantry', 'wall_bracket'],
};

const WORLD_UP: UnitVec3 = unitVec3(0, 0, 1);

interface MountedPart {
  readonly kind: 'face' | 'signal_head';
  readonly id: string;
  readonly attachment: RO<Attachment>;
  readonly pose: RO<Pose>;
  readonly frontNormal: UnitVec3;
  readonly up: UnitVec3;
  readonly asset: AssetDefinition | null;
}

/**
 * Every face and head hangs on a real support at a real attachment point of the right kind, at the
 * height that point declares, in the pose the support implies; supports stand on their base anchor.
 * Front normals and up vectors must be the asset's own frame rotated by the pose yaw, so a mirrored
 * or upside-down instance is rejected even if its silhouette would render identically.
 */
export const mountIntegrity: SemanticValidator = {
  name: 'mount_integrity',
  run(index) {
    const out = new Collector('mount_integrity');
    for (const support of index.world.supports) checkSupport(out, index, support);

    const parts: MountedPart[] = [
      ...index.world.signFaces.map((f): MountedPart => ({
        kind: 'face',
        id: f.id,
        attachment: f.attachment,
        pose: f.pose,
        frontNormal: f.frontNormal,
        up: f.up,
        asset: index.asset(f.asset),
      })),
      ...index.world.signalHeads.map((h): MountedPart => ({
        kind: 'signal_head',
        id: h.id,
        attachment: h.attachment,
        pose: h.pose,
        frontNormal: h.frontNormal,
        up: h.up,
        asset: index.asset(h.asset),
      })),
    ];
    for (const part of parts) checkMountedPart(out, index, part);
    return out.diagnostics;
  },
};

function checkSupport(out: Collector, index: WorldIndex, support: RO<Support>): void {
  const base = index.anchors.get(support.baseAnchorId);
  if (!base) {
    out.error({
      code: 'base_anchor_missing',
      message: `support ${support.id} stands on unknown anchor ${support.baseAnchorId}`,
      entityIds: [support.id, support.baseAnchorId],
    });
  } else if (base.kind !== 'support_base') {
    out.error({
      code: 'base_anchor_kind',
      message: `support ${support.id} stands on ${base.kind} anchor ${base.id}; a support_base is required`,
      entityIds: [support.id, base.id],
    });
  } else {
    if (distance3(base.position, support.pose.position) > POSITION_TOLERANCE_M) {
      out.error({
        code: 'support_off_base',
        message: `support ${support.id} pose is ${distance3(base.position, support.pose.position).toFixed(3)} m from its base anchor ${base.id}`,
        entityIds: [support.id, base.id],
      });
    }
    if (!index.lanes.has(base.roadsideOf.laneId)) {
      out.error({
        code: 'base_beside_unknown_lane',
        message: `support base ${base.id} is beside unknown lane ${base.roadsideOf.laneId}`,
        entityIds: [base.id, base.roadsideOf.laneId],
      });
    }
  }
  if (support.pose.position.z !== 0) {
    out.error({
      code: 'support_not_grounded',
      message: `support ${support.id} base is at z=${String(support.pose.position.z)}; supports stand on the ground`,
      entityIds: [support.id],
    });
  }
  if (!support.asset) {
    out.error({
      code: 'support_without_asset',
      message: `support ${support.id} has no asset, so nothing can attach to it`,
      entityIds: [support.id],
    });
    return;
  }
  const asset = index.asset(support.asset);
  if (!asset) return; // reported by source_applicability
  if (asset.geometry.kind !== 'support') {
    out.error({
      code: 'support_asset_not_support',
      message: `support ${support.id} uses ${asset.id}, whose geometry is '${asset.geometry.kind}'`,
      entityIds: [support.id, asset.id],
    });
    return;
  }
  const allowedRoles = FAMILY_ROLES[support.family];
  if (!(allowedRoles as readonly string[]).includes(asset.role)) {
    out.error({
      code: 'support_family_mismatch',
      message: `support ${support.id} is a '${support.family}' but its asset ${asset.id} is a '${asset.role}'`,
      entityIds: [support.id, asset.id],
    });
  }
  if (!asset.geometry.attachments.some((a) => a.accepts.includes('ground'))) {
    out.error({
      code: 'support_without_ground_point',
      message: `support asset ${asset.id} declares no ground attachment`,
      entityIds: [support.id, asset.id],
    });
  }
  if (
    support.heightM !== null &&
    asset.geometry.heightMm !== null &&
    Math.abs(support.heightM - asset.geometry.heightMm / 1000) > POSITION_TOLERANCE_M
  ) {
    out.error({
      code: 'support_height_mismatch',
      message: `support ${support.id} declares ${String(support.heightM)} m but asset ${asset.id} is ${String(asset.geometry.heightMm)} mm`,
      entityIds: [support.id, asset.id],
    });
  }
  if (
    support.dimensionsStatus === 'sourced' &&
    asset.geometry.heightMm === null &&
    asset.provenance.measurements.length === 0
  ) {
    out.error({
      code: 'dimensions_claimed_without_source',
      message: `support ${support.id} claims sourced dimensions but asset ${asset.id} carries none`,
      entityIds: [support.id, asset.id],
    });
  }
}

function checkMountedPart(out: Collector, index: WorldIndex, part: MountedPart): void {
  const floatingCode = part.kind === 'face' ? 'floating_face' : 'floating_head';
  const label = part.kind === 'face' ? 'sign face' : 'signal head';
  const support = index.supports.get(part.attachment.supportId);
  if (!support) {
    out.error({
      code: floatingCode,
      message: `${label} ${part.id} is attached to missing support ${part.attachment.supportId}`,
      entityIds: [part.id, part.attachment.supportId],
    });
    return;
  }
  if (!isUnit(part.frontNormal) || !isUnit(part.up)) {
    out.error({
      code: 'frame_not_unit',
      message: `${label} ${part.id} has a non-unit front normal or up vector`,
      entityIds: [part.id],
    });
  }
  if (part.asset) checkPartFrame(out, label, part);

  const supportAsset = support.asset ? index.asset(support.asset) : null;
  if (!supportAsset) return;
  if (supportAsset.geometry.kind !== 'support') return; // reported on the support
  const point = supportAsset.geometry.attachments.find(
    (a) => a.name === part.attachment.supportAttachmentName,
  );
  if (!point) {
    out.error({
      code: floatingCode,
      message: `${label} ${part.id} names attachment '${part.attachment.supportAttachmentName}', which support asset ${supportAsset.id} does not have`,
      entityIds: [part.id, support.id, supportAsset.id],
      data: { available: supportAsset.geometry.attachments.map((a) => a.name) },
    });
    return;
  }
  if (!point.accepts.includes(part.kind)) {
    out.error({
      code: 'attachment_kind_mismatch',
      message: `${label} ${part.id} hangs on '${point.name}' of ${support.id}, which accepts ${point.accepts.join('/')} not ${part.kind}`,
      entityIds: [part.id, support.id],
      data: { accepts: point.accepts, required: part.kind },
    });
  }
  if (part.asset) {
    const partPoint = part.asset.attachments.find(
      (a) => a.name === part.attachment.partAttachmentName,
    );
    if (!partPoint) {
      out.error({
        code: 'part_attachment_missing',
        message: `${label} ${part.id} names its own attachment '${part.attachment.partAttachmentName}', which asset ${part.asset.id} does not declare`,
        entityIds: [part.id, part.asset.id],
      });
    } else if (!partPoint.accepts.includes('support')) {
      out.error({
        code: 'attachment_kind_mismatch',
        message: `${label} ${part.id} attaches via '${partPoint.name}', which does not accept a support`,
        entityIds: [part.id, part.asset.id],
      });
    }
  }
  const expected = attachmentWorldPosition(support, point);
  const gap = distance3(expected, part.pose.position);
  if (gap > POSITION_TOLERANCE_M) {
    out.error({
      code: 'pose_off_attachment',
      message: `${label} ${part.id} pose is ${gap.toFixed(3)} m from attachment '${point.name}' of ${support.id}`,
      entityIds: [part.id, support.id],
      data: { expected, actual: part.pose.position },
    });
  }
  const pointHeight = point.offsetMm.z / 1000;
  if (
    part.attachment.heightAboveGroundM !== null &&
    Math.abs(part.attachment.heightAboveGroundM - pointHeight) > POSITION_TOLERANCE_M
  ) {
    out.error({
      code: 'attachment_height_mismatch',
      message: `${label} ${part.id} declares ${String(part.attachment.heightAboveGroundM)} m above ground but '${point.name}' sits at ${pointHeight} m`,
      entityIds: [part.id, support.id],
    });
  }
  if (part.attachment.heightAboveGroundM === null && pointHeight === 0) {
    out.error({
      code: 'part_on_ground',
      message: `${label} ${part.id} is attached at ground level`,
      entityIds: [part.id, support.id],
    });
  }
}

function checkPartFrame(out: Collector, label: string, part: MountedPart): void {
  const asset = part.asset;
  if (!asset) return;
  const frame = assetFrame(asset, part.kind);
  if (!frame) {
    out.error({
      code: part.kind === 'face' ? 'face_asset_not_face' : 'head_asset_not_head',
      message: `${label} ${part.id} uses ${asset.id}, whose geometry is '${asset.geometry.kind}'`,
      entityIds: [part.id, asset.id],
    });
    return;
  }
  const expectedFront = rotateZ(frame.front, part.pose.yaw);
  const expectedUp = rotateZ(frame.up, part.pose.yaw);
  if (!sameDirection(part.up, WORLD_UP, 1e-6) || !sameDirection(part.up, expectedUp, 1e-6)) {
    out.error({
      code: 'inverted_asset',
      message: `${label} ${part.id} up vector does not match its asset frame under the declared pose`,
      entityIds: [part.id, asset.id],
      data: { expected: expectedUp, actual: part.up },
    });
  }
  if (!sameDirection(part.frontNormal, expectedFront, 1e-6)) {
    out.error({
      code: 'front_normal_pose_mismatch',
      message: `${label} ${part.id} front normal disagrees with its asset frame rotated by the pose yaw (mirrored or rotated instance)`,
      entityIds: [part.id, asset.id],
      data: { expected: expectedFront, actual: part.frontNormal },
    });
  }
}

function assetFrame(
  asset: AssetDefinition,
  kind: MountedPart['kind'],
): { readonly front: UnitVec3; readonly up: UnitVec3 } | null {
  if (kind === 'face' && asset.geometry.kind === 'face') return asset.geometry.face;
  if (kind === 'signal_head' && asset.geometry.kind === 'signal_head') return asset.geometry.head;
  return null;
}

function attachmentWorldPosition(support: RO<Support>, point: AttachmentPoint): Vec3 {
  const offset = rotateZ(
    vec3(point.offsetMm.x / 1000, point.offsetMm.y / 1000, point.offsetMm.z / 1000),
    support.pose.yaw,
  );
  return vec3(
    support.pose.position.x + offset.x,
    support.pose.position.y + offset.y,
    support.pose.position.z + offset.z,
  );
}
