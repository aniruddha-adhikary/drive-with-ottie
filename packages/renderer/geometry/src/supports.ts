import { Box3, CylinderGeometry, Group, Mesh, Vector3 } from 'three';
import { type Support, mmToMetres } from '@ottie/contracts';
import { type BuildContext, attachmentPointsOf } from './context';
import { mmOffsetToVector3, poseMatrix, toVector3 } from './frames';
import { type RenderedSupport } from './types';

/**
 * Supports are real world geometry: a shaft from the base anchor to the top, positioned by the
 * support's own pose. Height comes from the world (`heightM`), else the asset, else the highest
 * attachment point; the shaft radius is schematic because no source gives a section. A support
 * whose `dimensionsStatus` is `schematic_unsourced` is tagged so consumers can label it.
 */

export function buildSupports(ctx: BuildContext): void {
  for (const support of ctx.world.supports) buildSupport(ctx, support);
}

export function supportRadius(ctx: BuildContext, family: Support['family']): number {
  return family === 'post' ? ctx.schematic('postRadiusM') : ctx.schematic('poleRadiusM');
}

function buildSupport(ctx: BuildContext, support: Support): void {
  const anchor = ctx.world.anchors.find((a) => a.id === support.baseAnchorId);
  if (!anchor)
    ctx.issue('missing_anchor', support.id, `base anchor ${support.baseAnchorId} not in world`);
  else if (anchor.kind !== 'support_base')
    ctx.issue(
      'unsupported_geometry',
      support.id,
      `base anchor ${anchor.id} is ${anchor.kind}, expected support_base`,
    );
  else if (toVector3(anchor.position).distanceTo(toVector3(support.pose.position)) > 1e-3) {
    ctx.issue(
      'pose_attachment_mismatch',
      support.id,
      `pose position is ${toVector3(support.pose.position).distanceTo(toVector3(anchor.position)).toFixed(3)} m from base anchor`,
    );
  }

  const resolved = support.asset ? ctx.resolveGeometry(support.asset, 'support', support.id) : null;
  const matrix = poseMatrix(support.pose);
  const attachmentPoints = new Map<string, Vector3>();
  let highestAttachment = 0;
  if (resolved) {
    for (const point of attachmentPointsOf(resolved.asset)) {
      const local = mmOffsetToVector3(point.offsetMm);
      highestAttachment = Math.max(highestAttachment, local.z);
      attachmentPoints.set(point.name, local.applyMatrix4(matrix));
    }
  }

  let heightM: number;
  let heightSource: RenderedSupport['heightSource'];
  if (support.heightM !== null) {
    heightM = support.heightM;
    heightSource = 'world';
  } else if (resolved && resolved.geometry.heightMm !== null) {
    heightM = mmToMetres(resolved.geometry.heightMm);
    heightSource = 'asset';
  } else if (highestAttachment > 0) {
    heightM = highestAttachment;
    heightSource = 'highest_attachment';
  } else {
    ctx.issue(
      'unknown_dimension',
      support.id,
      'no height from world, asset or attachments; support not drawn',
    );
    return;
  }

  const radius = supportRadius(ctx, support.family);
  const shaft = new CylinderGeometry(radius, radius, heightM, 16);
  shaft.rotateX(Math.PI / 2); // Three cylinders run along +Y; the shaft runs along local +Z.
  shaft.translate(0, 0, heightM / 2);
  const mesh = new Mesh(shaft, ctx.materials.lit('roadControl.support.post'));
  mesh.name = `support-shaft:${support.id}`;
  const group = new Group();
  group.name = `support:${support.id}`;
  group.applyMatrix4(matrix);
  group.add(mesh);
  group.userData = { dimensionsStatus: support.dimensionsStatus, heightSource };

  const base = toVector3(support.pose.position);
  const top = new Vector3(0, 0, heightM).applyMatrix4(matrix);
  ctx.register({
    id: support.id,
    kind: 'support',
    layer: 'physical',
    object: group,
    bounds: new Box3().setFromPoints([base, top]).expandByScalar(radius),
    family: support.family,
    base,
    top,
    heightM,
    radiusM: radius,
    heightSource,
    dimensionsStatus: support.dimensionsStatus,
    attachmentPoints,
  });
}
