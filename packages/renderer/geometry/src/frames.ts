import { Box3, Euler, Matrix4, Quaternion, Vector3 } from 'three';
import {
  type Millimetres,
  type Pose,
  type Radians,
  type UnitVec3,
  type Vec3,
  headingToUnitVec,
  mmToMetres,
} from '@ottie/contracts';

/**
 * World-frame helpers. The world is right-handed, +X east / +Y north / +Z up, metres and radians
 * (FROZEN_WORLD_CONVENTIONS). Three.js objects here use those axes directly; cameras set +Z up.
 */

export const WORLD_UP = Object.freeze(new Vector3(0, 0, 1));

export function toVector3(p: Vec3 | UnitVec3): Vector3 {
  return new Vector3(p.x, p.y, p.z);
}

export function mmOffsetToVector3(offset: {
  readonly x: Millimetres;
  readonly y: Millimetres;
  readonly z: Millimetres;
}): Vector3 {
  return new Vector3(mmToMetres(offset.x), mmToMetres(offset.y), mmToMetres(offset.z));
}

/**
 * Rigid rotation of a Pose: roll about the object's longitudinal (+X at heading 0) axis, then
 * pitch about its lateral axis, then yaw about +Z. Scale is always +1 — nothing is ever mirrored.
 */
export function poseQuaternion(pose: Pose): Quaternion {
  return new Quaternion().setFromEuler(new Euler(pose.roll ?? 0, pose.pitch ?? 0, pose.yaw, 'ZYX'));
}

export function poseMatrix(pose: Pose): Matrix4 {
  return new Matrix4().compose(
    toVector3(pose.position),
    poseQuaternion(pose),
    new Vector3(1, 1, 1),
  );
}

export function headingVector(heading: Radians): Vector3 {
  return toVector3(headingToUnitVec(heading));
}

/**
 * Orthonormal frame of a mounted face/head. `right` is the observer's right when reading the
 * face: for a viewer looking along -front with `up` upward, right = up × front (right-handed).
 * Artwork +x (reading direction) maps onto `right`; a mapping onto -right would be a mirror.
 */
export interface FacingFrame {
  readonly front: Vector3;
  readonly up: Vector3;
  readonly right: Vector3;
}

export function facingFrame(front: Vector3, up: Vector3): FacingFrame {
  const f = front.clone().normalize();
  const u = up
    .clone()
    .sub(f.clone().multiplyScalar(up.dot(f)))
    .normalize();
  const r = new Vector3().crossVectors(u, f).normalize();
  return { front: f, up: u, right: r };
}

/** Rotation that maps local +X→right, +Y→up, +Z→front. Determinant is +1 by construction. */
export function frameBasis(frame: FacingFrame): Matrix4 {
  return new Matrix4().makeBasis(frame.right, frame.up, frame.front);
}

/** Arc-length walk along a world polyline. */
export interface PolylineWalker {
  readonly lengthM: number;
  readonly cumulative: readonly number[];
  at(s: number): { readonly point: Vector3; readonly direction: Vector3 };
}

interface Segment {
  readonly a: Vector3;
  readonly b: Vector3;
  readonly start: number;
  readonly length: number;
}

export function polylineWalker(points: readonly Vec3[]): PolylineWalker {
  const first = points[0];
  if (!first) throw new RangeError('polyline needs at least one point');
  const segments: Segment[] = [];
  const cumulative: number[] = [0];
  let previous = toVector3(first);
  let total = 0;
  for (const point of points.slice(1)) {
    const next = toVector3(point);
    const length = next.distanceTo(previous);
    segments.push({ a: previous, b: next, start: total, length });
    total += length;
    cumulative.push(total);
    previous = next;
  }
  const origin = toVector3(first);
  return {
    lengthM: total,
    cumulative,
    at(s: number) {
      const clamped = Math.min(Math.max(s, 0), total);
      const segment =
        segments.find((seg) => clamped <= seg.start + seg.length) ?? segments[segments.length - 1];
      if (!segment) return { point: origin.clone(), direction: new Vector3(1, 0, 0) };
      const u = segment.length > 0 ? (clamped - segment.start) / segment.length : 0;
      return {
        point: segment.a.clone().lerp(segment.b, u),
        direction: segment.b.clone().sub(segment.a).normalize(),
      };
    },
  };
}

/** Consecutive pairs of a list. */
export function pairwise<T>(items: readonly T[]): readonly (readonly [T, T])[] {
  const pairs: (readonly [T, T])[] = [];
  let previous: T | undefined;
  for (const item of items) {
    if (previous !== undefined) pairs.push([previous, item]);
    previous = item;
  }
  return pairs;
}

/** Horizontal left-hand normal of a direction (positive `t` in a road frame). */
export function leftNormal(direction: Vector3): Vector3 {
  return new Vector3(-direction.y, direction.x, 0).normalize();
}

export function boxFromPoints(points: readonly Vector3[]): Box3 {
  return new Box3().setFromPoints(points as Vector3[]);
}
