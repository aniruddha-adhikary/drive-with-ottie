import { Vector3 } from 'three';
import {
  type CameraPreset,
  type CameraPresetName,
  type EntityId,
  type UnitVec3,
  type Vec3,
  type Viewport,
  entityId,
  unitVec3,
  vec3,
} from '@ottie/contracts';
import { safeNdc } from '@ottie/renderer-evidence';

/**
 * Pure framing arithmetic. Given world points that must appear inside the safe rectangle of the
 * viewport, these helpers place a camera (eye/target/extent) so that they do — the camera moves,
 * the points never do.
 */
export interface ViewBasis {
  readonly forward: Vector3;
  readonly right: Vector3;
  readonly up: Vector3;
}

export const WORLD_UP = new Vector3(0, 0, 1);
export const NORTH = new Vector3(0, 1, 0);

export function basisFor(forward: Vector3, upHint: Vector3): ViewBasis {
  const f = forward.clone().normalize();
  let right = new Vector3().crossVectors(f, upHint);
  if (right.lengthSq() < 1e-12) {
    right = new Vector3().crossVectors(f, Math.abs(f.z) > 0.9 ? NORTH : WORLD_UP);
  }
  right.normalize();
  const up = new Vector3().crossVectors(right, f).normalize();
  return { forward: f, right, up };
}

export function toVector(v: Vec3 | UnitVec3): Vector3 {
  return new Vector3(v.x, v.y, v.z);
}

function asVec3(v: Vector3): Vec3 {
  return vec3(v.x, v.y, v.z);
}

function asUnit(v: Vector3): UnitVec3 {
  const n = v.clone().normalize();
  return unitVec3(n.x, n.y, n.z);
}

interface Extents {
  readonly centre: Vector3;
  readonly halfRight: number;
  readonly halfUp: number;
  readonly minForward: number;
  readonly maxForward: number;
}

function extentsIn(points: readonly Vector3[], basis: ViewBasis): Extents | null {
  if (points.length === 0) return null;
  let minR = Infinity;
  let maxR = -Infinity;
  let minU = Infinity;
  let maxU = -Infinity;
  let minF = Infinity;
  let maxF = -Infinity;
  for (const p of points) {
    const r = p.dot(basis.right);
    const u = p.dot(basis.up);
    const f = p.dot(basis.forward);
    minR = Math.min(minR, r);
    maxR = Math.max(maxR, r);
    minU = Math.min(minU, u);
    maxU = Math.max(maxU, u);
    minF = Math.min(minF, f);
    maxF = Math.max(maxF, f);
  }
  const centre = new Vector3()
    .addScaledVector(basis.right, (minR + maxR) / 2)
    .addScaledVector(basis.up, (minU + maxU) / 2)
    .addScaledVector(basis.forward, (minF + maxF) / 2);
  return {
    centre,
    halfRight: (maxR - minR) / 2,
    halfUp: (maxU - minU) / 2,
    minForward: minF,
    maxForward: maxF,
  };
}

export interface OrthographicFit {
  readonly eye: Vector3;
  readonly target: Vector3;
  readonly halfHeight: number;
}

/**
 * Orthographic camera looking along `forward` whose safe rectangle encloses `points` with `margin`
 * (1 = touching). `distanceM` keeps the authored stand-off; it is enlarged if points would fall
 * behind the near plane.
 */
export function fitOrthographic(
  points: readonly Vector3[],
  forward: Vector3,
  upHint: Vector3,
  viewport: Viewport,
  distanceM: number,
  margin: number,
  minHalfHeight = 1,
): OrthographicFit | null {
  const basis = basisFor(forward, upHint);
  const ext = extentsIn(points, basis);
  if (!ext) return null;
  const aspect = viewport.widthPx / Math.max(1, viewport.heightPx);
  const safe = safeNdc(viewport);
  const halfH = Math.max(
    minHalfHeight,
    (ext.halfUp * margin) / Math.max(1e-6, safe.halfHeight),
    (ext.halfRight * margin) / Math.max(1e-6, aspect * safe.halfWidth),
  );
  const target = ext.centre
    .clone()
    .addScaledVector(basis.right, -safe.centreX * halfH * aspect)
    .addScaledVector(basis.up, -safe.centreY * halfH);
  const depthSpan = ext.maxForward - ext.minForward;
  const distance = Math.max(distanceM, depthSpan / 2 + 1);
  const eye = target.clone().addScaledVector(basis.forward, -distance);
  return { eye, target, halfHeight: halfH };
}

export interface PerspectiveFit {
  readonly eye: Vector3;
  readonly target: Vector3;
  readonly distanceM: number;
}

/**
 * Perspective camera looking along `forward` with vertical field of view `fovRad`, backed off from
 * the points' centre until they all fit inside the safe rectangle with `margin`.
 */
export function fitPerspective(
  points: readonly Vector3[],
  forward: Vector3,
  upHint: Vector3,
  viewport: Viewport,
  fovRad: number,
  margin: number,
  minDistanceM: number,
): PerspectiveFit | null {
  const basis = basisFor(forward, upHint);
  const ext = extentsIn(points, basis);
  if (!ext) return null;
  const aspect = viewport.widthPx / Math.max(1, viewport.heightPx);
  const safe = safeNdc(viewport);
  const t = Math.tan(fovRad / 2);
  let distance = minDistanceM;
  for (const p of points) {
    const rel = p.clone().sub(ext.centre);
    const r = Math.abs(rel.dot(basis.right));
    const u = Math.abs(rel.dot(basis.up));
    const f = rel.dot(basis.forward);
    distance = Math.max(
      distance,
      (u * margin) / Math.max(1e-6, t * safe.halfHeight) - f,
      (r * margin) / Math.max(1e-6, t * aspect * safe.halfWidth) - f,
    );
  }
  const target = ext.centre
    .clone()
    .addScaledVector(basis.right, -safe.centreX * distance * t * aspect)
    .addScaledVector(basis.up, -safe.centreY * distance * t);
  const eye = ext.centre.clone().addScaledVector(basis.forward, -distance);
  return { eye, target, distanceM: distance };
}

/** Rotate a direction about world +Z by `radians` (positive = counter-clockwise seen from above). */
export function yawDirection(direction: Vector3, radians: number): Vector3 {
  return direction.clone().applyAxisAngle(WORLD_UP, radians);
}

/** Direction with the given azimuth (heading, CCW from +X) and elevation (above the horizon), pointing down at the scene. */
export function obliqueDirection(azimuthRad: number, elevationRad: number): Vector3 {
  const c = Math.cos(elevationRad);
  return new Vector3(
    -Math.cos(azimuthRad) * c,
    -Math.sin(azimuthRad) * c,
    -Math.sin(elevationRad),
  ).normalize();
}

export function elevationOf(forward: Vector3): number {
  const f = forward.clone().normalize();
  return Math.asin(Math.min(1, Math.max(-1, -f.z)));
}

export function azimuthOf(forward: Vector3): number {
  return Math.atan2(-forward.y, -forward.x);
}

export interface PresetSpec {
  readonly name: CameraPresetName;
  readonly projection: CameraPreset['projection'];
  readonly eye: Vector3;
  readonly target: Vector3;
  readonly up: Vector3;
  readonly fovOrHalfHeight: number;
  readonly linkedEntityId: EntityId | string | null;
  readonly evidenceIds: readonly string[];
}

/** Build a plain, frozen CameraPreset from vectors; the World is never touched. */
export function makePreset(spec: PresetSpec): CameraPreset {
  return Object.freeze({
    name: spec.name,
    projection: spec.projection,
    eye: asVec3(spec.eye),
    target: asVec3(spec.target),
    up: asUnit(spec.up),
    fovOrHalfHeight: spec.fovOrHalfHeight,
    linkedEntityId: spec.linkedEntityId === null ? null : entityId(spec.linkedEntityId),
    evidenceIds: Object.freeze([...spec.evidenceIds]),
  });
}

export function presetSpec(preset: CameraPreset): PresetSpec {
  return {
    name: preset.name,
    projection: preset.projection,
    eye: toVector(preset.eye),
    target: toVector(preset.target),
    up: toVector(preset.up),
    fovOrHalfHeight: preset.fovOrHalfHeight,
    linkedEntityId: preset.linkedEntityId,
    evidenceIds: preset.evidenceIds,
  };
}
