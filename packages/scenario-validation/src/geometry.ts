import { type Radians, type UnitVec3, type Vec3 } from '@ottie/contracts';

/**
 * Pure vector helpers over frozen world conventions (metres, radians, +X east, +Y north, +Z up,
 * heading 0 = +X counter-clockwise). No projection, no camera model: everything here is world space.
 */

export interface Vec2 {
  readonly x: number;
  readonly y: number;
}

export const POSITION_TOLERANCE_M = 0.05;
export const ANGLE_TOLERANCE_RAD = 1e-3;
/** Faces/heads count as "facing" an approach when the front normal is within 45° of head-on. */
export const FACING_COS_TOLERANCE = Math.cos(Math.PI / 4);

export function sub(a: Vec3 | UnitVec3, b: Vec3 | UnitVec3): Vec2 & { readonly z: number } {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

export function dot2(a: Vec2, b: Vec2): number {
  return a.x * b.x + a.y * b.y;
}

export function dot3(a: UnitVec3 | Vec3, b: UnitVec3 | Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

export function length2(v: Vec2): number {
  return Math.hypot(v.x, v.y);
}

export function length3(v: UnitVec3 | Vec3): number {
  return Math.hypot(v.x, v.y, v.z);
}

export function distance3(a: Vec3, b: Vec3): number {
  return length3(sub(a, b));
}

export function headingVec(heading: number): Vec2 {
  return { x: Math.cos(heading), y: Math.sin(heading) };
}

/** Heading (radians, (-π, π]) of the vector from `a` to `b` in plan. */
export function headingBetween(a: Vec3, b: Vec3): number {
  return Math.atan2(b.y - a.y, b.x - a.x);
}

/** Signed smallest difference `a - b` normalised into (-π, π]. */
export function angleDelta(a: number, b: number): number {
  let d = a - b;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d <= -Math.PI) d += 2 * Math.PI;
  return d;
}

export function sameHeading(
  a: Radians | number,
  b: Radians | number,
  tolerance = ANGLE_TOLERANCE_RAD,
): boolean {
  return Math.abs(angleDelta(a, b)) <= tolerance;
}

/** Rotate a vector about +Z by `yaw` (counter-clockwise positive). */
export function rotateZ(
  v: UnitVec3 | Vec3,
  yaw: number,
): { readonly x: number; readonly y: number; readonly z: number } {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return { x: v.x * c - v.y * s, y: v.x * s + v.y * c, z: v.z };
}

export function isUnit(v: UnitVec3, tolerance = 1e-6): boolean {
  return Math.abs(length3(v) - 1) <= tolerance;
}

export function sameDirection(
  a: UnitVec3,
  b: UnitVec3 | { readonly x: number; readonly y: number; readonly z: number },
  tolerance = 1e-6,
): boolean {
  return (
    Math.abs(a.x - b.x) <= tolerance &&
    Math.abs(a.y - b.y) <= tolerance &&
    Math.abs(a.z - b.z) <= tolerance
  );
}

export function polylineLength(points: readonly Vec3[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    const prev = points[i - 1];
    const next = points[i];
    if (prev && next) total += length2(sub(next, prev));
  }
  return total;
}

/** Point at arc length `s` along a polyline in plan (clamped to the ends). */
export function pointAt(points: readonly Vec3[], s: number): Vec3 | null {
  const first = points[0];
  if (!first) return null;
  let remaining = Math.max(0, s);
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1];
    const b = points[i];
    if (!a || !b) continue;
    const seg = length2(sub(b, a));
    if (remaining <= seg || i === points.length - 1) {
      const t = seg === 0 ? 0 : Math.min(1, remaining / seg);
      return {
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
        z: a.z + (b.z - a.z) * t,
      } as Vec3;
    }
    remaining -= seg;
  }
  return first;
}

/** Plan-view distance from point `p` to the segment `a`–`b`, plus the parameter along the segment. */
export function distanceToSegment(
  p: Vec2,
  a: Vec2,
  b: Vec2,
): { readonly distance: number; readonly t: number } {
  const ab = { x: b.x - a.x, y: b.y - a.y };
  const ap = { x: p.x - a.x, y: p.y - a.y };
  const denominator = dot2(ab, ab);
  const t = denominator === 0 ? 0 : Math.max(0, Math.min(1, dot2(ap, ab) / denominator));
  const closest = { x: a.x + ab.x * t, y: a.y + ab.y * t };
  return { distance: length2({ x: p.x - closest.x, y: p.y - closest.y }), t };
}

/** Plan-view distance from `p` to the nearest point of a polyline, and the arc length of that point. */
export function distanceToPolyline(
  p: Vec2,
  points: readonly Vec3[],
): { readonly distance: number; readonly station: number } | null {
  let best: { distance: number; station: number } | null = null;
  let travelled = 0;
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1];
    const b = points[i];
    if (!a || !b) continue;
    const seg = length2(sub(b, a));
    const { distance, t } = distanceToSegment(p, a, b);
    if (best === null || distance < best.distance)
      best = { distance, station: travelled + seg * t };
    travelled += seg;
  }
  return best;
}

/** Smallest plan-view distance between two polylines (segment pairs). */
export function polylineSeparation(a: readonly Vec3[], b: readonly Vec3[]): number {
  let best = Number.POSITIVE_INFINITY;
  for (let i = 1; i < a.length; i += 1) {
    const a0 = a[i - 1];
    const a1 = a[i];
    if (!a0 || !a1) continue;
    for (let j = 1; j < b.length; j += 1) {
      const b0 = b[j - 1];
      const b1 = b[j];
      if (!b0 || !b1) continue;
      if (segmentsIntersect(a0, a1, b0, b1)) return 0;
      best = Math.min(
        best,
        distanceToSegment(a0, b0, b1).distance,
        distanceToSegment(a1, b0, b1).distance,
        distanceToSegment(b0, a0, a1).distance,
        distanceToSegment(b1, a0, a1).distance,
      );
    }
  }
  return best;
}

function cross2(o: Vec2, a: Vec2, b: Vec2): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

export function segmentsIntersect(a0: Vec2, a1: Vec2, b0: Vec2, b1: Vec2): boolean {
  const d1 = cross2(b0, b1, a0);
  const d2 = cross2(b0, b1, a1);
  const d3 = cross2(a0, a1, b0);
  const d4 = cross2(a0, a1, b1);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

/** Axis-aligned box in a local frame. */
export interface LocalBox {
  readonly min: { readonly x: number; readonly y: number; readonly z: number };
  readonly max: { readonly x: number; readonly y: number; readonly z: number };
}

/**
 * Whether the world-space segment `from`–`to` passes through a box that is axis-aligned in a frame
 * positioned at `origin` and rotated by `yaw`. Slab test after transforming the segment into the
 * box frame. Segment endpoints strictly inside the box count as intersections.
 */
export function segmentIntersectsOrientedBox(
  from: Vec3,
  to: Vec3,
  origin: Vec3,
  yaw: number,
  box: LocalBox,
): boolean {
  const local = (p: Vec3) => rotateZ(sub(p, origin), -yaw);
  const p0 = local(from);
  const p1 = local(to);
  let tMin = 0;
  let tMax = 1;
  const axes: readonly ('x' | 'y' | 'z')[] = ['x', 'y', 'z'];
  for (const axis of axes) {
    const start = p0[axis];
    const delta = p1[axis] - start;
    const lo = box.min[axis];
    const hi = box.max[axis];
    if (Math.abs(delta) < 1e-12) {
      if (start < lo || start > hi) return false;
      continue;
    }
    let tNear = (lo - start) / delta;
    let tFar = (hi - start) / delta;
    if (tNear > tFar) [tNear, tFar] = [tFar, tNear];
    tMin = Math.max(tMin, tNear);
    tMax = Math.min(tMax, tFar);
    if (tMin > tMax) return false;
  }
  return true;
}

export function pointInsideOrientedBox(p: Vec3, origin: Vec3, yaw: number, box: LocalBox): boolean {
  const q = rotateZ(sub(p, origin), -yaw);
  return (
    q.x >= box.min.x &&
    q.x <= box.max.x &&
    q.y >= box.min.y &&
    q.y <= box.max.y &&
    q.z >= box.min.z &&
    q.z <= box.max.z
  );
}
