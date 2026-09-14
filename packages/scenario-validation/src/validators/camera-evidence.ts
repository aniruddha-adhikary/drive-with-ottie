import {
  type Actor,
  type CameraPreset,
  type Diagnostic,
  type EvidenceRequirement,
  type UnitVec3,
  type Vec3,
  vec3,
} from '@ottie/contracts';
import {
  type LocalBox,
  dot3,
  isUnit,
  pointAt,
  pointInsideOrientedBox,
  polylineLength,
  segmentIntersectsOrientedBox,
  sub,
} from '../geometry';
import { Collector, type RO, type SemanticValidator, type WorldIndex } from '../world-index';

/**
 * Static camera declarations only. This family answers "does some allowed, declared view point at
 * the evidence with nothing standing in the way?" from world geometry: preset well-formedness,
 * allowed-view/exposure agreement, co-visibility, detail-view linkage, front-side placement and a
 * straight-line sight test against actor bodies. Projection, framing, pixel size and readable-size
 * checks are R2's runtime implementation behind the frozen camera port and are not attempted here.
 */
export const cameraEvidence: SemanticValidator = {
  name: 'camera_evidence',
  run(index) {
    const out = new Collector('camera_evidence');
    checkPresets(out, index);
    checkExposure(out, index, index.world.evidence);
    return out.diagnostics;
  },
};

/** Exposure of a subset of evidence (the requirements one question depends on). */
export function checkCameraExposure(
  index: WorldIndex,
  evidenceIds: readonly string[],
): readonly Diagnostic[] {
  const out = new Collector('camera_evidence');
  const subset = evidenceIds
    .map((id) => index.evidence.get(id))
    .filter((e): e is RO<EvidenceRequirement> => e !== undefined);
  checkExposure(out, index, subset);
  return out.diagnostics;
}

function checkPresets(out: Collector, index: WorldIndex): void {
  const seen = new Set<string>();
  for (const camera of index.world.cameraPresets) {
    if (seen.has(camera.name))
      out.error({
        code: 'duplicate_preset',
        message: `camera preset '${camera.name}' is declared twice`,
        entityIds: [],
      });
    seen.add(camera.name);
    const look = sub(camera.target, camera.eye);
    if (Math.hypot(look.x, look.y, look.z) < 1e-6)
      out.error({
        code: 'degenerate_preset',
        message: `camera '${camera.name}' eye and target coincide`,
        entityIds: [],
      });
    if (!isUnit(camera.up))
      out.error({
        code: 'degenerate_preset',
        message: `camera '${camera.name}' up vector is not unit length`,
        entityIds: [],
      });
    if (!(camera.fovOrHalfHeight > 0))
      out.error({
        code: 'degenerate_preset',
        message: `camera '${camera.name}' has a non-positive field of view / half height`,
        entityIds: [],
      });
    if (camera.projection === 'perspective' && camera.fovOrHalfHeight >= Math.PI) {
      out.error({
        code: 'degenerate_preset',
        message: `camera '${camera.name}' perspective FOV ${camera.fovOrHalfHeight.toFixed(2)} rad is not a viewable angle`,
        entityIds: [],
      });
    }
    for (const evidenceId of camera.evidenceIds) {
      const evidence = index.evidence.get(evidenceId);
      if (!evidence) {
        out.error({
          code: 'camera_cites_unknown_evidence',
          message: `camera '${camera.name}' claims to expose unknown evidence ${evidenceId}`,
          entityIds: [],
        });
      } else if (!evidence.allowedViews.includes(camera.name)) {
        out.error({
          code: 'camera_not_allowed_for_evidence',
          message: `camera '${camera.name}' exposes ${evidenceId}, whose allowed views are ${evidence.allowedViews.join(', ')}`,
          entityIds: [evidenceId],
        });
      }
    }
    if (camera.name === 'entity_detail') {
      if (camera.linkedEntityId === null) {
        out.error({
          code: 'detail_view_unlinked',
          message: `entity_detail camera is not linked to any entity`,
          entityIds: [],
        });
      } else if (!index.kinds.has(camera.linkedEntityId)) {
        out.error({
          code: 'detail_view_unlinked',
          message: `entity_detail camera is linked to unknown entity ${camera.linkedEntityId}`,
          entityIds: [camera.linkedEntityId],
        });
      } else {
        const linked = camera.linkedEntityId;
        const targetsLinked = camera.evidenceIds.some(
          (id) => index.evidence.get(id)?.targetEntityIds.includes(linked) ?? false,
        );
        if (!targetsLinked) {
          out.error({
            code: 'detail_view_unlinked',
            message: `entity_detail camera is linked to ${linked} but exposes no evidence targeting it`,
            entityIds: [linked],
          });
        }
      }
    } else if (camera.linkedEntityId !== null && !index.kinds.has(camera.linkedEntityId)) {
      out.error({
        code: 'detail_view_unlinked',
        message: `camera '${camera.name}' is linked to unknown entity ${camera.linkedEntityId}`,
        entityIds: [camera.linkedEntityId],
      });
    }
  }
}

function checkExposure(
  out: Collector,
  index: WorldIndex,
  evidence: readonly RO<EvidenceRequirement>[],
): void {
  for (const item of evidence) {
    if (item.allowedViews.length === 0) {
      out.error({
        code: 'required_evidence_not_exposed',
        message: `evidence ${item.id} allows no view at all`,
        entityIds: [item.id],
      });
      continue;
    }
    if (!(item.maxOcclusionFraction >= 0 && item.maxOcclusionFraction <= 1)) {
      out.error({
        code: 'invalid_occlusion_budget',
        message: `evidence ${item.id} maxOcclusionFraction ${String(item.maxOcclusionFraction)} is not within [0, 1]`,
        entityIds: [item.id],
      });
    }
    const exposing = index.world.cameraPresets.filter(
      (c) => c.evidenceIds.includes(item.id) && item.allowedViews.includes(c.name),
    );
    if (exposing.length === 0) {
      const present = index.world.cameraPresets
        .filter((c) => item.allowedViews.includes(c.name))
        .map((c) => c.name);
      out.error({
        code: 'required_evidence_not_exposed',
        message: `evidence ${item.id} is exposed by no camera preset; allowed views ${item.allowedViews.join(', ')}${present.length === 0 ? ' are all absent' : ` exist (${present.join(', ')}) but do not declare it`}`,
        entityIds: [item.id],
        data: { allowedViews: item.allowedViews, presentAllowedViews: present },
      });
      continue;
    }
    for (const otherId of item.coVisibleWith) {
      if (!index.evidence.has(otherId)) continue; // question_evidence reports the dangling id
      if (!exposing.some((c) => c.evidenceIds.includes(otherId))) {
        out.error({
          code: 'co_visibility_unsatisfied',
          message: `evidence ${item.id} must be visible together with ${otherId}, but no camera exposes both`,
          entityIds: [item.id],
          data: { exposing: exposing.map((c) => c.name) },
        });
      }
    }
    checkSightLines(out, index, item, exposing);
  }
}

function checkSightLines(
  out: Collector,
  index: WorldIndex,
  item: RO<EvidenceRequirement>,
  exposing: readonly RO<CameraPreset>[],
): void {
  const targets: { readonly id: string; readonly point: Vec3 }[] = [];
  for (const id of item.targetEntityIds) {
    const point = entityPoint(index, id);
    if (point) targets.push({ id, point });
  }
  if (targets.length === 0) return;
  const occluders = index.world.actors.filter((a) => !item.targetEntityIds.includes(a.id));
  const blocked: { camera: string; target: string; by: string }[] = [];
  const facingAway: { camera: string; target: string }[] = [];
  let clearCameras = 0;
  for (const camera of exposing) {
    let clear = true;
    for (const target of targets) {
      if (item.mustBeFrontFacing) {
        const normal = frontNormalOf(index, target.id);
        if (normal && dot3(sub(camera.eye, target.point), normal) <= 0) {
          facingAway.push({ camera: camera.name, target: target.id });
          clear = false;
          continue;
        }
      }
      const occluder = occluders.find((actor) => {
        const box = actorBox(actor);
        if (pointInsideOrientedBox(camera.eye, actor.pose.position, actor.pose.yaw, box))
          return false; // the camera rides in this actor
        return segmentIntersectsOrientedBox(
          camera.eye,
          target.point,
          actor.pose.position,
          actor.pose.yaw,
          box,
        );
      });
      if (occluder) {
        blocked.push({ camera: camera.name, target: target.id, by: occluder.id });
        clear = false;
      }
    }
    if (clear) clearCameras += 1;
  }
  if (clearCameras === 0) {
    out.error({
      code: 'required_evidence_occluded',
      message: `evidence ${item.id} has no allowed camera with a clear front-side line of sight to ${targets.map((t) => t.id).join(', ')}`,
      entityIds: [item.id, ...new Set(blocked.map((b) => b.by))],
      data: { blocked, facingAway },
    });
  } else if (blocked.length > 0 || facingAway.length > 0) {
    out.info({
      code: 'partially_occluded',
      message: `evidence ${item.id} is clear in ${clearCameras} of ${exposing.length} exposing cameras`,
      entityIds: [item.id],
      data: { blocked, facingAway },
    });
  }
}

function actorBox(actor: RO<Actor>): LocalBox {
  return {
    min: {
      x: actor.frontOffsetM - actor.dimensionsM.length,
      y: 0 - actor.dimensionsM.width / 2,
      z: 0,
    },
    max: { x: actor.frontOffsetM, y: actor.dimensionsM.width / 2, z: actor.dimensionsM.height },
  };
}

function frontNormalOf(index: WorldIndex, id: string): UnitVec3 | null {
  return index.signFaces.get(id)?.frontNormal ?? index.signalHeads.get(id)?.frontNormal ?? null;
}

/** A representative world point for a target: pose for placed things, midpoints for lines and paths. */
function entityPoint(index: WorldIndex, id: string): Vec3 | null {
  const face = index.signFaces.get(id);
  if (face) return face.pose.position;
  const head = index.signalHeads.get(id);
  if (head) return head.pose.position;
  const actor = index.actors.get(id);
  if (actor)
    return vec3(
      actor.pose.position.x,
      actor.pose.position.y,
      actor.pose.position.z + actor.dimensionsM.height / 2,
    );
  const marking = index.markings.get(id);
  const anchor = index.anchors.get(marking ? marking.anchorId : id);
  if (anchor) {
    const polyline = anchor.kind === 'support_base' ? [anchor.position] : anchor.polyline;
    return midpoint(polyline);
  }
  const lane = index.lanes.get(id);
  if (lane) return midpoint(lane.centreline);
  const movement = index.movements.get(id);
  if (movement) return midpoint(movement.path);
  return null;
}

function midpoint(points: readonly Vec3[]): Vec3 | null {
  if (points.length === 0) return null;
  if (points.length === 1) return points[0] ?? null;
  return pointAt(points, polylineLength(points) / 2);
}
