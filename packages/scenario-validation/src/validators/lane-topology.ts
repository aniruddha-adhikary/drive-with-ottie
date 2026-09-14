import { type Actor, type Lane, type Movement, type Road, type Vec3 } from '@ottie/contracts';
import {
  ANGLE_TOLERANCE_RAD,
  POSITION_TOLERANCE_M,
  angleDelta,
  distance3,
  distanceToPolyline,
  headingBetween,
  headingVec,
  pointAt,
  polylineLength,
  polylineSeparation,
  sameHeading,
  sub,
} from '../geometry';
import { Collector, type RO, type SemanticValidator, type WorldIndex } from '../world-index';

/** How far an actor's declared pose may sit from the lane centreline point implied by its progress/offset. */
const ACTOR_POSE_TOLERANCE_M = 0.25;
/** A movement path may leave a lane end at up to this angle before it counts as a direction break. */
const MOVEMENT_DEPARTURE_TOLERANCE_RAD = Math.PI / 4;

/**
 * Directed lane graph, LEFT-traffic placement, movement connectivity and every lane-bound
 * reference (actors, control lines). Nothing here reads asset shapes; it is the semantic topology
 * that geometry, controls and evidence all hang off.
 */
export const laneTopology: SemanticValidator = {
  name: 'lane_topology',
  run(index) {
    const out = new Collector('lane_topology');
    const { world } = index;

    for (const road of world.roads) {
      if (road.centreline.length < 2 || polylineLength(road.centreline) <= POSITION_TOLERANCE_M) {
        out.error({
          code: 'degenerate_road',
          message: `road ${road.id} has no usable centreline`,
          entityIds: [road.id],
        });
      }
    }

    const lanesByRoad = new Map<string, RO<Lane>[]>();
    for (const lane of world.lanes) {
      const road = index.roads.get(lane.roadId);
      if (!road) {
        out.error({
          code: 'lane_without_road',
          message: `lane ${lane.id} references road ${lane.roadId}, which does not exist`,
          entityIds: [lane.id, lane.roadId],
        });
        continue;
      }
      lanesByRoad.set(road.id, [...(lanesByRoad.get(road.id) ?? []), lane]);
      checkLaneGeometry(out, lane, road);
    }
    for (const [roadId, lanes] of lanesByRoad) {
      const road = index.roads.get(roadId);
      if (road) checkKerbOrdering(out, lanes, road);
    }

    for (const movement of world.movements) checkMovement(out, index, movement);
    for (const lane of world.lanes) {
      for (const movementId of lane.outgoingMovementIds) {
        const movement = index.movements.get(movementId);
        if (movement && movement.fromLaneId !== lane.id) {
          out.error({
            code: 'outgoing_movement_foreign',
            message: `lane ${lane.id} lists movement ${movementId} as outgoing but it starts from ${movement.fromLaneId}`,
            entityIds: [lane.id, movementId],
          });
        }
      }
    }

    for (const actor of world.actors) checkActor(out, index, actor);
    for (const anchor of index.controlLines()) {
      for (const laneId of anchor.controlsLaneIds) {
        const lane = index.lanes.get(laneId);
        if (!lane) continue;
        const separation = polylineSeparation(anchor.polyline, lane.centreline);
        if (separation > lane.widthM / 2) {
          out.error({
            code: 'control_line_off_lane',
            message: `control line ${anchor.id} claims to control lane ${laneId} but lies ${separation.toFixed(2)} m from its centreline`,
            entityIds: [anchor.id, laneId],
            data: { separationM: separation, laneWidthM: lane.widthM },
          });
        }
        if (!sameHeading(anchor.approachHeading, lane.heading, MOVEMENT_DEPARTURE_TOLERANCE_RAD)) {
          out.error({
            code: 'control_line_heading_mismatch',
            message: `control line ${anchor.id} approach heading ${anchor.approachHeading.toFixed(3)} disagrees with lane ${laneId} heading ${lane.heading.toFixed(3)}`,
            entityIds: [anchor.id, laneId],
          });
        }
        const transverse = controlLineTransverseAngle(anchor.polyline, anchor.approachHeading);
        if (
          transverse !== null &&
          Math.abs(transverse - Math.PI / 2) > MOVEMENT_DEPARTURE_TOLERANCE_RAD
        ) {
          out.error({
            code: 'control_line_not_transverse',
            message: `control line ${anchor.id} is not transverse to its approach (angle ${transverse.toFixed(3)} rad)`,
            entityIds: [anchor.id],
          });
        }
      }
      if (anchor.controlsLaneIds.length === 0) {
        out.error({
          code: 'control_line_without_lane',
          message: `control line ${anchor.id} controls no lane`,
          entityIds: [anchor.id],
        });
      }
    }

    return out.diagnostics;
  },
};

function checkLaneGeometry(out: Collector, lane: RO<Lane>, road: RO<Road>): void {
  const first = lane.centreline[0];
  const second = lane.centreline[1];
  if (!first || !second || polylineLength(lane.centreline) <= POSITION_TOLERANCE_M) {
    out.error({
      code: 'degenerate_lane',
      message: `lane ${lane.id} has no usable centreline`,
      entityIds: [lane.id],
    });
    return;
  }
  for (let i = 1; i < lane.centreline.length; i += 1) {
    const a = lane.centreline[i - 1];
    const b = lane.centreline[i];
    if (a && b && distance3(a, b) <= 1e-9) {
      out.error({
        code: 'degenerate_lane',
        message: `lane ${lane.id} repeats centreline point ${i}`,
        entityIds: [lane.id],
      });
      return;
    }
  }
  const travel = headingBetween(first, second);
  if (!sameHeading(travel, lane.heading, ANGLE_TOLERANCE_RAD)) {
    out.error({
      code: 'heading_centreline_mismatch',
      message: `lane ${lane.id} declares heading ${lane.heading.toFixed(3)} but its centreline travels at ${travel.toFixed(3)}`,
      entityIds: [lane.id],
      data: { declared: lane.heading, centreline: travel },
    });
  }
  const roadStart = road.centreline[0];
  const roadSecond = road.centreline[1];
  if (!roadStart || !roadSecond) return;
  const roadHeading = headingBetween(roadStart, roadSecond);
  const expected =
    lane.directionRelativeToRoad === 'with_reference' ? roadHeading : roadHeading + Math.PI;
  if (!sameHeading(expected, lane.heading, MOVEMENT_DEPARTURE_TOLERANCE_RAD)) {
    out.error({
      code: 'direction_flag_mismatch',
      message: `lane ${lane.id} is marked ${lane.directionRelativeToRoad} but its heading disagrees with road ${road.id}`,
      entityIds: [lane.id, road.id],
    });
    return;
  }
  const t = lateralOffset(lane, road);
  if (t === null) return;
  const onLeft = t > POSITION_TOLERANCE_M;
  const onRight = t < -POSITION_TOLERANCE_M;
  if (lane.directionRelativeToRoad === 'with_reference' ? onRight : onLeft) {
    out.error({
      code: 'left_traffic_placement',
      message: `lane ${lane.id} (${lane.directionRelativeToRoad}) sits on the wrong side of road ${road.id} for LEFT traffic (t=${t.toFixed(2)} m)`,
      entityIds: [lane.id, road.id],
      data: { lateralOffsetM: t },
    });
  }
}

/** Signed lateral offset of the lane's first point from the road centreline, +ve left of the road reference direction. */
function lateralOffset(lane: RO<Lane>, road: RO<Road>): number | null {
  const roadStart = road.centreline[0];
  const roadSecond = road.centreline[1];
  const laneStart = lane.centreline[0];
  if (!roadStart || !roadSecond || !laneStart) return null;
  const dir = headingVec(headingBetween(roadStart, roadSecond));
  const left = { x: -dir.y, y: dir.x };
  const rel = sub(laneStart, roadStart);
  return rel.x * left.x + rel.y * left.y;
}

function checkKerbOrdering(out: Collector, lanes: readonly RO<Lane>[], road: RO<Road>): void {
  for (const direction of ['with_reference', 'against_reference'] as const) {
    const group = lanes.filter((l) => l.directionRelativeToRoad === direction);
    const offsets = group.map((lane) => ({ lane, t: lateralOffset(lane, road) }));
    for (const a of offsets) {
      for (const b of offsets) {
        if (a === b || a.t === null || b.t === null) continue;
        // The kerb-side lane (index 0) is furthest from the road centreline.
        if (
          a.lane.indexFromKerb < b.lane.indexFromKerb &&
          Math.abs(a.t) < Math.abs(b.t) - POSITION_TOLERANCE_M
        ) {
          out.error({
            code: 'kerb_index_order',
            message: `lane ${a.lane.id} (kerb index ${a.lane.indexFromKerb}) lies nearer the road centre than ${b.lane.id} (kerb index ${b.lane.indexFromKerb})`,
            entityIds: [a.lane.id, b.lane.id],
          });
        }
        if (a.lane.indexFromKerb === b.lane.indexFromKerb) {
          out.error({
            code: 'kerb_index_duplicate',
            message: `lanes ${a.lane.id} and ${b.lane.id} share kerb index ${a.lane.indexFromKerb} on road ${road.id}`,
            entityIds: [a.lane.id, b.lane.id],
          });
        }
      }
    }
  }
}

function checkMovement(out: Collector, index: WorldIndex, movement: RO<Movement>): void {
  const from = index.lanes.get(movement.fromLaneId);
  const to = index.lanes.get(movement.toLaneId);
  if (!from || !to) {
    out.error({
      code: 'movement_lane_missing',
      message: `movement ${movement.id} references lane(s) that do not exist`,
      entityIds: [movement.id, movement.fromLaneId, movement.toLaneId],
    });
    return;
  }
  if (!from.outgoingMovementIds.includes(movement.id)) {
    out.error({
      code: 'movement_not_in_lane_outgoing',
      message: `lane ${from.id} does not list movement ${movement.id} as outgoing`,
      entityIds: [movement.id, from.id],
    });
  }
  const pathStart = movement.path[0];
  const pathEnd = movement.path[movement.path.length - 1];
  if (!pathStart || !pathEnd || movement.path.length < 2) {
    out.error({
      code: 'movement_path_degenerate',
      message: `movement ${movement.id} has no usable path`,
      entityIds: [movement.id],
    });
    return;
  }
  // A movement leaves its inbound lane and enters its outbound lane: the path must start within the
  // from-lane's own width of its centreline and end within the to-lane's width of its centreline.
  const start = distanceToPolyline(pathStart, from.centreline);
  if (!start || start.distance > from.widthM / 2) {
    out.error({
      code: 'movement_disconnected',
      message: `movement ${movement.id} starts ${start ? start.distance.toFixed(2) : '?'} m off the centreline of lane ${from.id} (lane width ${String(from.widthM)} m)`,
      entityIds: [movement.id, from.id],
    });
  }
  const end = distanceToPolyline(pathEnd, to.centreline);
  if (!end || end.distance > to.widthM / 2) {
    out.error({
      code: 'movement_disconnected',
      message: `movement ${movement.id} ends ${end ? end.distance.toFixed(2) : '?'} m off the centreline of lane ${to.id} (lane width ${String(to.widthM)} m)`,
      entityIds: [movement.id, to.id],
    });
  }
  const second = movement.path[1];
  if (
    second &&
    !sameHeading(headingBetween(pathStart, second), from.heading, MOVEMENT_DEPARTURE_TOLERANCE_RAD)
  ) {
    out.error({
      code: 'movement_departs_against_lane',
      message: `movement ${movement.id} leaves lane ${from.id} against its direction of travel`,
      entityIds: [movement.id, from.id],
    });
  }
  const turn = angleDelta(to.heading, from.heading);
  const expected = expectedTurn(turn);
  if (expected !== movement.turn) {
    out.error({
      code: 'turn_direction_mismatch',
      message: `movement ${movement.id} is labelled '${movement.turn}' but the heading change ${turn.toFixed(3)} rad implies '${expected}'`,
      entityIds: [movement.id],
      data: { declared: movement.turn, implied: expected, headingChangeRad: turn },
    });
  }
  for (const other of movement.conflictsWith) {
    const conflict = index.movements.get(other);
    if (conflict && !conflict.conflictsWith.includes(movement.id)) {
      out.error({
        code: 'conflict_asymmetric',
        message: `movement ${movement.id} conflicts with ${other} but not vice versa`,
        entityIds: [movement.id, other],
      });
    }
  }
  for (const other of movement.yieldsTo) {
    if (!movement.conflictsWith.includes(other)) {
      out.error({
        code: 'yield_without_conflict',
        message: `movement ${movement.id} yields to ${other} without declaring a conflict`,
        entityIds: [movement.id, other],
      });
    }
  }
  if (movement.priority === 'protected' && movement.yieldsTo.length > 0) {
    out.error({
      code: 'protected_movement_yields',
      message: `protected movement ${movement.id} yields to other movements`,
      entityIds: [movement.id],
    });
  }
  // Permissive movements under signals resolve their conflicts by phase (checked by signal_movements);
  // anywhere else a non-protected movement crossing a protected one must declare that it yields.
  const mustDeclareYield =
    movement.priority === 'yield' ||
    movement.priority === 'stop_then_yield' ||
    (movement.priority === 'permissive' && index.world.controlRegime !== 'signalised');
  if (mustDeclareYield) {
    for (const other of movement.conflictsWith) {
      const conflict = index.movements.get(other);
      if (conflict?.priority === 'protected' && !movement.yieldsTo.includes(other)) {
        out.error({
          code: 'yield_missing',
          message: `${movement.priority} movement ${movement.id} conflicts with protected ${other} but does not yield to it`,
          entityIds: [movement.id, other],
        });
      }
    }
  }
}

function expectedTurn(delta: number): Movement['turn'] {
  const abs = Math.abs(delta);
  if (abs <= Math.PI / 4) return 'straight';
  if (abs >= (3 * Math.PI) / 4) return 'u_turn';
  return delta > 0 ? 'left' : 'right';
}

function checkActor(out: Collector, index: WorldIndex, actor: RO<Actor>): void {
  if (actor.laneId !== null) {
    const lane = index.lanes.get(actor.laneId);
    if (!lane) {
      out.error({
        code: 'actor_lane_missing',
        message: `actor ${actor.id} references missing lane ${actor.laneId}`,
        entityIds: [actor.id, actor.laneId],
      });
    } else {
      const laneLength = polylineLength(lane.centreline);
      if (
        actor.progressM < -POSITION_TOLERANCE_M ||
        actor.progressM > laneLength + POSITION_TOLERANCE_M
      ) {
        out.error({
          code: 'actor_outside_lane',
          message: `actor ${actor.id} progress ${actor.progressM} m is outside lane ${lane.id} (length ${laneLength.toFixed(2)} m)`,
          entityIds: [actor.id, lane.id],
        });
      }
      const halfWidth = actor.dimensionsM.width / 2;
      if (Math.abs(actor.lateralOffsetM) + halfWidth > lane.widthM / 2 + POSITION_TOLERANCE_M) {
        out.error({
          code: 'actor_outside_lane',
          message: `actor ${actor.id} (offset ${actor.lateralOffsetM} m, width ${actor.dimensionsM.width} m) does not fit inside lane ${lane.id} (${lane.widthM} m)`,
          entityIds: [actor.id, lane.id],
        });
      }
      const expected = pointAt(lane.centreline, actor.progressM);
      if (expected) {
        const dir = headingVec(lane.heading);
        const left = { x: -dir.y, y: dir.x };
        const target = {
          x: expected.x + left.x * actor.lateralOffsetM,
          y: expected.y + left.y * actor.lateralOffsetM,
        };
        const off = Math.hypot(actor.pose.position.x - target.x, actor.pose.position.y - target.y);
        if (off > ACTOR_POSE_TOLERANCE_M) {
          out.error({
            code: 'actor_pose_off_lane',
            message: `actor ${actor.id} pose is ${off.toFixed(2)} m from the point implied by progress ${actor.progressM} m on lane ${lane.id}`,
            entityIds: [actor.id, lane.id],
            data: { offsetM: off },
          });
        }
      }
      if (
        actor.category !== 'pedestrian' &&
        !sameHeading(actor.pose.yaw, lane.heading, MOVEMENT_DEPARTURE_TOLERANCE_RAD)
      ) {
        out.error({
          code: 'actor_heading_against_lane',
          message: `actor ${actor.id} faces ${actor.pose.yaw.toFixed(3)} rad on lane ${lane.id} heading ${lane.heading.toFixed(3)}`,
          entityIds: [actor.id, lane.id],
        });
      }
      if (actor.category !== 'pedestrian' && !lane.allowedVehicleClasses.includes(actor.category)) {
        out.error({
          code: 'actor_class_not_allowed',
          message: `${actor.category} ${actor.id} is on lane ${lane.id}, which allows only ${lane.allowedVehicleClasses.join(', ')}`,
          entityIds: [actor.id, lane.id],
        });
      }
      const nearest = distanceToPolyline(actor.pose.position, lane.centreline);
      if (nearest && Math.abs(nearest.station - actor.progressM) > ACTOR_POSE_TOLERANCE_M * 2) {
        out.error({
          code: 'actor_progress_mismatch',
          message: `actor ${actor.id} progress ${actor.progressM} m disagrees with its pose (station ${nearest.station.toFixed(2)} m)`,
          entityIds: [actor.id, lane.id],
        });
      }
    }
  }
  if (actor.movementId !== null) {
    const movement = index.movements.get(actor.movementId);
    if (!movement) {
      out.error({
        code: 'actor_movement_missing',
        message: `actor ${actor.id} references missing movement ${actor.movementId}`,
        entityIds: [actor.id],
      });
    } else if (actor.laneId !== null && movement.fromLaneId !== actor.laneId) {
      out.error({
        code: 'actor_movement_lane_mismatch',
        message: `actor ${actor.id} is on lane ${actor.laneId} but intends movement ${movement.id} from ${movement.fromLaneId}`,
        entityIds: [actor.id, movement.id],
      });
    } else if (
      actor.intention !== 'stationary' &&
      actor.intention !== 'crossing' &&
      actor.intention !== movement.turn
    ) {
      out.error({
        code: 'actor_intention_mismatch',
        message: `actor ${actor.id} intends '${actor.intention}' but its movement ${movement.id} turns '${movement.turn}'`,
        entityIds: [actor.id, movement.id],
      });
    }
  }
  if (actor.frontOffsetM <= 0 || actor.frontOffsetM > actor.dimensionsM.length) {
    out.error({
      code: 'actor_front_offset_invalid',
      message: `actor ${actor.id} frontOffsetM ${actor.frontOffsetM} is not within (0, length ${actor.dimensionsM.length}]`,
      entityIds: [actor.id],
    });
  }
}

/** Angle between the control line's own direction and its approach heading (π/2 when transverse). */
function controlLineTransverseAngle(
  polyline: readonly Vec3[],
  approachHeading: number,
): number | null {
  const a = polyline[0];
  const b = polyline[polyline.length - 1];
  if (!a || !b || distance3(a, b) <= 1e-9) return null;
  const delta = Math.abs(angleDelta(headingBetween(a, b), approachHeading));
  return delta > Math.PI / 2 ? Math.PI - delta : delta;
}
