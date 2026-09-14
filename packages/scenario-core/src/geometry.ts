import {
  type Anchor,
  type CompassDirection,
  type Lane,
  type LaneId,
  type Metres,
  type Radians,
  type Road,
  type RoadClass,
  type RoadId,
  type Vec3,
  HEADING,
  anchorId,
  headingToUnitVec,
  laneId,
  metres,
  radians,
  roadId,
  vec3,
} from '@ottie/contracts';

/**
 * Semantic road geometry for the generator. All lengths are metres and all angles radians in the
 * frozen world frame (+X east, +Y north, heading 0 = +X, counter-clockwise positive). Lanes are
 * directed: a lane's centreline is ordered in the direction of travel and its heading is the
 * tangent at the first point. LEFT-hand traffic is built in: lanes travelling WITH a road's
 * reference direction occupy the +t (left) half, lanes travelling AGAINST it the -t half.
 */

export interface StraightRoadSpec {
  readonly id: string;
  readonly name: string;
  readonly roadClass: RoadClass;
  readonly start: Vec3;
  readonly reference: CompassDirection;
  readonly lengthM: number;
  readonly laneWidthM: number;
  readonly lanesWith: number;
  readonly lanesAgainst: number;
  readonly speedLimitKmh: number | null;
}

export interface RoadFrame {
  readonly road: Road;
  readonly lanes: readonly Lane[];
  readonly anchors: readonly Anchor[];
  readonly heading: Radians;
  readonly lengthM: number;
  /** World point at road-frame station `s` and lateral offset `t` (positive LEFT of the reference direction). */
  at(s: number, t: number, z?: number): Vec3;
  lane(direction: 'with' | 'against', indexFromKerb: number): Lane;
  /** Lateral offset (t) of a lane's centreline in the road frame. */
  laneT(direction: 'with' | 'against', indexFromKerb: number): number;
}

const ALL_VEHICLES = ['car', 'bus', 'lorry', 'motorcycle', 'bicycle'] as const;

/**
 * Coordinates are rounded to 1 nm so that canonical JSON does not depend on the platform's
 * `Math.sin`/`Math.cos` rounding. Exact unit vectors are used for compass headings.
 */
const COORD_PRECISION = 1e9;
export function cleanMetres(value: number): number {
  const rounded = Math.round(value * COORD_PRECISION) / COORD_PRECISION;
  return rounded === 0 ? 0 : rounded;
}

const COMPASS_UNIT: Readonly<Record<CompassDirection, { readonly x: number; readonly y: number }>> = Object.freeze({
  east: { x: 1, y: 0 },
  north: { x: 0, y: 1 },
  west: { x: -1, y: 0 },
  south: { x: 0, y: -1 },
});

export function compassOfHeading(heading: number): CompassDirection | null {
  for (const [name, value] of Object.entries(HEADING) as [CompassDirection, Radians][]) {
    if (Math.abs(heading - value) < 1e-9) return name;
  }
  return null;
}

/** Unit direction of a heading; exact for the four compass headings. */
export function directionOf(heading: Radians): { readonly x: number; readonly y: number } {
  const compass = compassOfHeading(heading);
  if (compass) return COMPASS_UNIT[compass];
  const unit = headingToUnitVec(heading);
  return { x: unit.x, y: unit.y };
}

/** Normalise an angle into (-π, π], snapping floating-point noise onto the exact HEADING constants. */
export function normaliseHeading(angle: number): Radians {
  let a = angle;
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a <= -Math.PI) a += 2 * Math.PI;
  const compass = compassOfHeading(a);
  return compass ? HEADING[compass] : radians(a);
}

export function buildStraightRoad(spec: StraightRoadSpec): RoadFrame {
  if (!(spec.lengthM > 0) || !(spec.laneWidthM > 0)) throw new RangeError(`road ${spec.id}: length and lane width must be positive`);
  if (spec.lanesWith < 0 || spec.lanesAgainst < 0 || spec.lanesWith + spec.lanesAgainst === 0) {
    throw new RangeError(`road ${spec.id}: needs at least one lane`);
  }
  const heading = HEADING[spec.reference];
  const dir = COMPASS_UNIT[spec.reference];
  const left = { x: -dir.y, y: dir.x };
  const at = (s: number, t: number, z = 0): Vec3 =>
    vec3(cleanMetres(spec.start.x + dir.x * s + left.x * t), cleanMetres(spec.start.y + dir.y * s + left.y * t), cleanMetres(z));

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
  const byKey = new Map<string, { lane: Lane; t: number }>();
  const half = spec.laneWidthM / 2;

  for (let i = 0; i < spec.lanesWith; i += 1) {
    const t = spec.laneWidthM * (spec.lanesWith - i - 0.5);
    const id = laneId(`${spec.id}.with.${i}`);
    const lane: Lane = {
      id,
      roadId: rid,
      directionRelativeToRoad: 'with_reference',
      indexFromKerb: i,
      centreline: [at(0, t), at(spec.lengthM, t)],
      widthM: metres(spec.laneWidthM),
      heading,
      allowedVehicleClasses: ALL_VEHICLES,
      outgoingMovementIds: [],
    };
    lanes.push(lane);
    byKey.set(`with:${i}`, { lane, t });
    anchors.push(
      boundary(id, 'left', [at(0, t + half), at(spec.lengthM, t + half)]),
      boundary(id, 'right', [at(0, t - half), at(spec.lengthM, t - half)]),
    );
  }
  const against = normaliseHeading(heading + Math.PI);
  for (let i = 0; i < spec.lanesAgainst; i += 1) {
    const t = -spec.laneWidthM * (spec.lanesAgainst - i - 0.5);
    const id = laneId(`${spec.id}.against.${i}`);
    const lane: Lane = {
      id,
      roadId: rid,
      directionRelativeToRoad: 'against_reference',
      indexFromKerb: i,
      centreline: [at(spec.lengthM, t), at(0, t)],
      widthM: metres(spec.laneWidthM),
      heading: against,
      allowedVehicleClasses: ALL_VEHICLES,
      outgoingMovementIds: [],
    };
    lanes.push(lane);
    byKey.set(`against:${i}`, { lane, t });
    anchors.push(
      boundary(id, 'left', [at(spec.lengthM, t - half), at(0, t - half)]),
      boundary(id, 'right', [at(spec.lengthM, t + half), at(0, t + half)]),
    );
  }
  anchors.push(
    { id: anchorId(`${spec.id}.edge.left`), kind: 'roadside_edge', roadId: rid, side: 'left', polyline: [at(0, road.widthM / 2), at(spec.lengthM, road.widthM / 2)] },
    { id: anchorId(`${spec.id}.edge.right`), kind: 'roadside_edge', roadId: rid, side: 'right', polyline: [at(0, -(road.widthM / 2)), at(spec.lengthM, -(road.widthM / 2))] },
  );

  const entry = (direction: 'with' | 'against', indexFromKerb: number) => {
    const found = byKey.get(`${direction}:${indexFromKerb}`);
    if (!found) throw new RangeError(`no lane ${direction}:${indexFromKerb} on ${spec.id}`);
    return found;
  };

  return {
    road,
    lanes,
    anchors,
    heading,
    lengthM: spec.lengthM,
    at,
    lane: (direction, indexFromKerb) => entry(direction, indexFromKerb).lane,
    laneT: (direction, indexFromKerb) => entry(direction, indexFromKerb).t,
  };
}

function boundary(lane: LaneId, side: 'left' | 'right', polyline: readonly Vec3[]): Anchor {
  return { id: anchorId(`${lane}.boundary.${side}`), kind: 'lane_boundary', laneId: lane, side, polyline };
}

export function laneLength(lane: Lane): Metres {
  let total = 0;
  for (let i = 1; i < lane.centreline.length; i += 1) {
    const a = lane.centreline[i - 1];
    const b = lane.centreline[i];
    if (a && b) total += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return metres(total);
}

/**
 * World position of a point `progressM` along a lane's directed centreline, offset `lateralM`
 * to the traveller's LEFT (positive). Actor poses are derived from this, never authored by hand.
 */
export function pointAlongLane(lane: Lane, progressM: number, lateralM = 0): { readonly position: Vec3; readonly heading: Radians } {
  if (lane.centreline.length < 2) throw new RangeError(`lane ${lane.id} needs at least two centreline points`);
  let remaining = progressM;
  for (let i = 1; i < lane.centreline.length; i += 1) {
    const a = lane.centreline[i - 1];
    const b = lane.centreline[i];
    if (!a || !b) continue;
    const segment = Math.hypot(b.x - a.x, b.y - a.y);
    const last = i === lane.centreline.length - 1;
    if (remaining <= segment || last) {
      const heading = normaliseHeading(Math.atan2(b.y - a.y, b.x - a.x));
      const dir = directionOf(heading);
      const left = { x: -dir.y, y: dir.x };
      return {
        position: vec3(cleanMetres(a.x + dir.x * remaining + left.x * lateralM), cleanMetres(a.y + dir.y * remaining + left.y * lateralM), cleanMetres(a.z)),
        heading,
      };
    }
    remaining -= segment;
  }
  throw new RangeError(`lane ${lane.id}: unreachable`);
}

/** Quadratic sweep through a corner so turning movements have a path, not a kink. */
export function turnPath(from: Vec3, corner: Vec3, to: Vec3, segments = 4): readonly Vec3[] {
  const points: Vec3[] = [];
  for (let i = 0; i <= segments; i += 1) {
    const u = i / segments;
    const x = (1 - u) ** 2 * from.x + 2 * (1 - u) * u * corner.x + u ** 2 * to.x;
    const y = (1 - u) ** 2 * from.y + 2 * (1 - u) * u * corner.y + u ** 2 * to.y;
    points.push(vec3(cleanMetres(x), cleanMetres(y), 0));
  }
  return points;
}

export function straightPath(from: Vec3, to: Vec3): readonly Vec3[] {
  return [from, to];
}

/** Whole quarter turns counter-clockwise about +Z; the only rotations the generator applies. */
export type QuarterTurns = 0 | 1 | 2 | 3;

export function quarterTurnsBetween(from: CompassDirection, to: CompassDirection): QuarterTurns {
  const order: readonly CompassDirection[] = ['east', 'north', 'west', 'south'];
  const delta = (order.indexOf(to) - order.indexOf(from) + 4) % 4;
  return delta as QuarterTurns;
}

const noNegativeZero = (v: number): number => (v === 0 ? 0 : v);

/** Exact rotation by whole quarter turns (integer matrix, no trigonometric rounding). */
export function rotateVec3(v: Vec3, turns: QuarterTurns): Vec3 {
  switch (turns) {
    case 0:
      return v;
    case 1:
      return vec3(noNegativeZero(0 - v.y), noNegativeZero(v.x), v.z);
    case 2:
      return vec3(noNegativeZero(0 - v.x), noNegativeZero(0 - v.y), v.z);
    case 3:
      return vec3(noNegativeZero(v.y), noNegativeZero(0 - v.x), v.z);
  }
}

export function rotateUnit(v: { readonly x: number; readonly y: number; readonly z: number }, turns: QuarterTurns): { readonly x: number; readonly y: number; readonly z: number } {
  switch (turns) {
    case 0:
      return v;
    case 1:
      return { x: noNegativeZero(-v.y), y: noNegativeZero(v.x), z: v.z };
    case 2:
      return { x: noNegativeZero(-v.x), y: noNegativeZero(-v.y), z: v.z };
    case 3:
      return { x: noNegativeZero(v.y), y: noNegativeZero(-v.x), z: v.z };
  }
}

export function rotateHeading(heading: Radians, turns: QuarterTurns): Radians {
  return normaliseHeading(heading + (turns * Math.PI) / 2);
}

export function rotatePolyline(points: readonly Vec3[], turns: QuarterTurns): readonly Vec3[] {
  return turns === 0 ? points : points.map((p) => rotateVec3(p, turns));
}
