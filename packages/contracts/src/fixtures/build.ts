import { type RoadClass } from '../asset';
import { type AnchorId, type LaneId, type MovementId, type RoadId, anchorId, laneId, movementId, roadId } from '../ids';
import { HEADING, type CompassDirection, type Radians, type Vec3, headingToUnitVec, metres, radians, vec3 } from '../units';
import { type Anchor, type Lane, type Movement, type Road } from '../world';

/**
 * Small deterministic geometry helpers for hand-authored fixtures. Straight roads only; the real
 * generator (C2, packages/scenario-core) owns curves, junction sweeps and parameterised layouts.
 */

export interface StraightRoadSpec {
  readonly id: string;
  readonly name: string;
  readonly roadClass: RoadClass;
  /** Start of the reference direction. */
  readonly start: Vec3;
  readonly reference: CompassDirection;
  readonly lengthM: number;
  readonly laneWidthM: number;
  /** Lanes travelling with the reference direction (LEFT side of it) and against it. */
  readonly lanesWith: number;
  readonly lanesAgainst: number;
  readonly speedLimitKmh: number | null;
}

export interface BuiltRoad {
  readonly road: Road;
  readonly lanes: readonly Lane[];
  readonly anchors: readonly Anchor[];
  /** lane id by direction and kerb index. */
  lane(direction: 'with' | 'against', indexFromKerb: number): LaneId;
  /** World point at road-frame (s, t). */
  at(s: number, t: number, z?: number): Vec3;
  readonly heading: Radians;
}

export function straightRoad(spec: StraightRoadSpec): BuiltRoad {
  const heading = HEADING[spec.reference];
  const dir = headingToUnitVec(heading);
  const left = { x: -dir.y, y: dir.x }; // +t is LEFT of the reference direction
  const at = (s: number, t: number, z = 0): Vec3 =>
    vec3(spec.start.x + dir.x * s + left.x * t, spec.start.y + dir.y * s + left.y * t, z);

  const rid: RoadId = roadId(spec.id);
  const totalLanes = spec.lanesWith + spec.lanesAgainst;
  const road: Road = {
    id: rid,
    name: spec.name,
    roadClass: spec.roadClass,
    centreline: [at(0, 0), at(spec.lengthM, 0)],
    widthM: metres(totalLanes * spec.laneWidthM),
    speedLimitKmh: spec.speedLimitKmh,
  };

  const lanes: Lane[] = [];
  const anchors: Anchor[] = [];
  const ids = new Map<string, LaneId>();

  // LEFT traffic: lanes travelling WITH the reference direction sit on its left (+t) half.
  for (let i = 0; i < spec.lanesWith; i += 1) {
    const t = spec.laneWidthM * (spec.lanesWith - i - 0.5);
    const id = laneId(`${spec.id}.with.${i}`);
    ids.set(`with:${i}`, id);
    lanes.push({
      id,
      roadId: rid,
      directionRelativeToRoad: 'with_reference',
      indexFromKerb: i,
      centreline: [at(0, t), at(spec.lengthM, t)],
      widthM: metres(spec.laneWidthM),
      heading,
      allowedVehicleClasses: ['car', 'bus', 'lorry', 'motorcycle', 'bicycle'],
      outgoingMovementIds: [],
    });
    anchors.push(
      boundary(id, 'left', [at(0, t + spec.laneWidthM / 2), at(spec.lengthM, t + spec.laneWidthM / 2)]),
      boundary(id, 'right', [at(0, t - spec.laneWidthM / 2), at(spec.lengthM, t - spec.laneWidthM / 2)]),
    );
  }
  // Lanes travelling AGAINST the reference direction: reversed centreline, on the -t half.
  const against = radians(normalise(heading + Math.PI));
  for (let i = 0; i < spec.lanesAgainst; i += 1) {
    const t = -spec.laneWidthM * (spec.lanesAgainst - i - 0.5);
    const id = laneId(`${spec.id}.against.${i}`);
    ids.set(`against:${i}`, id);
    lanes.push({
      id,
      roadId: rid,
      directionRelativeToRoad: 'against_reference',
      indexFromKerb: i,
      centreline: [at(spec.lengthM, t), at(0, t)],
      widthM: metres(spec.laneWidthM),
      heading: against,
      allowedVehicleClasses: ['car', 'bus', 'lorry', 'motorcycle', 'bicycle'],
      outgoingMovementIds: [],
    });
    // For against-lanes the traveller's LEFT is -t.
    anchors.push(
      boundary(id, 'left', [at(spec.lengthM, t - spec.laneWidthM / 2), at(0, t - spec.laneWidthM / 2)]),
      boundary(id, 'right', [at(spec.lengthM, t + spec.laneWidthM / 2), at(0, t + spec.laneWidthM / 2)]),
    );
  }
  anchors.push(
    { id: anchorId(`${spec.id}.edge.left`), kind: 'roadside_edge', roadId: rid, side: 'left', polyline: [at(0, road.widthM / 2), at(spec.lengthM, road.widthM / 2)] },
    { id: anchorId(`${spec.id}.edge.right`), kind: 'roadside_edge', roadId: rid, side: 'right', polyline: [at(0, -(road.widthM / 2)), at(spec.lengthM, -(road.widthM / 2))] },
  );

  return {
    road,
    lanes,
    anchors,
    heading,
    at,
    lane: (direction, indexFromKerb) => {
      const id = ids.get(`${direction}:${indexFromKerb}`);
      if (!id) throw new RangeError(`no lane ${direction}:${indexFromKerb} on ${spec.id}`);
      return id;
    },
  };
}

function boundary(lane: LaneId, side: 'left' | 'right', polyline: readonly Vec3[]): Anchor {
  return { id: anchorId(`${lane}.boundary.${side}`), kind: 'lane_boundary', laneId: lane, side, polyline };
}

function normalise(angle: number): number {
  let a = angle;
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a <= -Math.PI) a += 2 * Math.PI;
  return a;
}

/** Attach movement IDs to lanes (lanes are otherwise built without movements). */
export function withOutgoing(lanes: readonly Lane[], movements: readonly Movement[]): Lane[] {
  return lanes.map((lane) => ({
    ...lane,
    outgoingMovementIds: movements.filter((m) => m.fromLaneId === lane.id).map((m) => m.id),
  }));
}

export function straightPath(from: Vec3, to: Vec3): readonly Vec3[] {
  return [from, to];
}

/** Quarter-turn approximated with a few points so renderers/validators get a swept path, not a corner. */
export function turnPath(from: Vec3, corner: Vec3, to: Vec3, segments = 4): readonly Vec3[] {
  const points: Vec3[] = [];
  for (let i = 0; i <= segments; i += 1) {
    const u = i / segments;
    const x = (1 - u) ** 2 * from.x + 2 * (1 - u) * u * corner.x + u ** 2 * to.x;
    const y = (1 - u) ** 2 * from.y + 2 * (1 - u) * u * corner.y + u ** 2 * to.y;
    points.push(vec3(x, y, 0));
  }
  return points;
}

export interface LaneEndpoints {
  readonly start: Vec3;
  readonly end: Vec3;
}

export function laneEndpoints(lane: Lane): LaneEndpoints {
  const start = lane.centreline[0];
  const end = lane.centreline[lane.centreline.length - 1];
  if (!start || !end) throw new RangeError(`lane ${lane.id} has no centreline`);
  return { start, end };
}

export function movementIdOf(from: LaneId, turn: string): MovementId {
  return movementId(`${from}.${turn}`);
}

export const controlLineAnchorId = (approach: string): AnchorId => anchorId(`${approach}.control-line`);
