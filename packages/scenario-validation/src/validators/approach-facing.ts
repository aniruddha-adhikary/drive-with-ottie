import { type LaneId, type Pose, type SignFace, type UnitVec3 } from '@ottie/contracts';
import {
  FACING_COS_TOLERANCE,
  distanceToPolyline,
  dot2,
  headingVec,
  sameHeading,
  sub,
} from '../geometry';
import { Collector, type RO, type SemanticValidator, type WorldIndex } from '../world-index';

/** A face is "beside" its approach when its position is within this distance of the lane centreline. */
const MAX_LATERAL_OFFSET_M = 8;

interface Observable {
  readonly kind: 'sign face' | 'signal head';
  readonly id: string;
  readonly pose: RO<Pose>;
  readonly frontNormal: UnitVec3;
  readonly intendedApproach: RO<SignFace['intendedApproach']>;
  readonly applicableLaneIds: readonly LaneId[];
  readonly linkedControlLineIds: readonly string[];
}

/**
 * Does the readable side point at the traffic it is meant to instruct? The intended approach is
 * a set of lanes plus a heading; the front normal must oppose that heading (traffic drives into
 * the face), the lanes must actually travel in that heading, and the face must stand beside and
 * ahead of the approach, upstream of or at the control line it enforces.
 */
export const approachFacing: SemanticValidator = {
  name: 'approach_facing',
  run(index) {
    const out = new Collector('approach_facing');
    const observables: Observable[] = [
      ...index.world.signFaces.map((f): Observable => ({ kind: 'sign face', ...f })),
      ...index.world.signalHeads.map((h): Observable => ({ kind: 'signal head', ...h })),
    ];
    for (const item of observables) checkObservable(out, index, item);
    return out.diagnostics;
  },
};

function checkObservable(out: Collector, index: WorldIndex, item: Observable): void {
  const approach = item.intendedApproach;
  if (approach.laneIds.length === 0) {
    out.error({
      code: 'approach_without_lane',
      message: `${item.kind} ${item.id} declares an approach heading but no approach lane`,
      entityIds: [item.id],
    });
  }
  const travel = headingVec(approach.heading);
  const facing = dot2(item.frontNormal, travel);
  if (facing > -FACING_COS_TOLERANCE) {
    out.error({
      code: 'face_away_from_approach',
      message: `${item.kind} ${item.id} front normal (${item.frontNormal.x}, ${item.frontNormal.y}) does not oppose its approach heading ${approach.heading.toFixed(3)} rad`,
      entityIds: [item.id],
      data: { frontNormal: item.frontNormal, approachHeading: approach.heading, cosine: facing },
    });
  }

  for (const laneId of approach.laneIds) {
    const lane = index.lanes.get(laneId);
    if (!lane) {
      out.error({
        code: 'approach_lane_missing',
        message: `${item.kind} ${item.id} intended approach lane ${laneId} does not exist`,
        entityIds: [item.id, laneId],
      });
      continue;
    }
    if (!sameHeading(lane.heading, approach.heading)) {
      out.error({
        code: 'approach_heading_mismatch',
        message: `${item.kind} ${item.id} declares approach heading ${approach.heading.toFixed(3)} but lane ${laneId} travels at ${lane.heading.toFixed(3)}`,
        entityIds: [item.id, laneId],
        data: { approachHeading: approach.heading, laneHeading: lane.heading },
      });
    }
    const nearest = distanceToPolyline(item.pose.position, lane.centreline);
    if (nearest && nearest.distance > MAX_LATERAL_OFFSET_M) {
      out.error({
        code: 'face_not_beside_approach',
        message: `${item.kind} ${item.id} is ${nearest.distance.toFixed(1)} m from approach lane ${laneId}`,
        entityIds: [item.id, laneId],
      });
    }
    const start = lane.centreline[0];
    if (start && dot2(sub(item.pose.position, start), headingVec(lane.heading)) <= 0) {
      out.error({
        code: 'face_behind_approach',
        message: `${item.kind} ${item.id} stands behind the start of approach lane ${laneId}; traffic never reaches it`,
        entityIds: [item.id, laneId],
      });
    }
  }

  for (const laneId of item.applicableLaneIds) {
    if (!approach.laneIds.includes(laneId)) {
      out.error({
        code: 'applicable_lane_not_in_approach',
        message: `${item.kind} ${item.id} applies to lane ${laneId} but that lane is not part of its intended approach`,
        entityIds: [item.id, laneId],
      });
    }
  }

  for (const anchorId of item.linkedControlLineIds) {
    const line = index.anchorOfKind(anchorId, 'control_line');
    if (!line) continue;
    if (!sameHeading(line.approachHeading, approach.heading)) {
      out.error({
        code: 'control_line_heading_mismatch',
        message: `${item.kind} ${item.id} faces approach heading ${approach.heading.toFixed(3)} but its control line ${anchorId} is approached at ${line.approachHeading.toFixed(3)}`,
        entityIds: [item.id, anchorId],
      });
    }
    const linePoint = line.polyline[0];
    if (linePoint && dot2(sub(linePoint, item.pose.position), travel) < -MAX_LATERAL_OFFSET_M) {
      out.error({
        code: 'face_beyond_control_line',
        message: `${item.kind} ${item.id} stands downstream of the control line ${anchorId} it enforces`,
        entityIds: [item.id, anchorId],
      });
    }
  }
}
