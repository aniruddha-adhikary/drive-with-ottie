declare const brand: unique symbol;
export type Brand<T, Name extends string> = T & { readonly [brand]: Name };

/** Runtime length unit. All World geometry is metres. */
export type Metres = Brand<number, 'Metres'>;
/** Runtime angle unit. All World angles are radians. */
export type Radians = Brand<number, 'Radians'>;
/** Source millimetres as printed on SDRE drawings; converted at import with `mmToMetres`. */
export type Millimetres = Brand<number, 'Millimetres'>;
/** Non-negative scalar length along a lane or road frame, metres. */
export type Station = Metres;

export const metres = (value: number): Metres => {
  assertFinite(value, 'metres');
  return value as Metres;
};
export const radians = (value: number): Radians => {
  assertFinite(value, 'radians');
  return value as Radians;
};
export const millimetres = (value: number): Millimetres => {
  assertFinite(value, 'millimetres');
  return value as Millimetres;
};

export const mmToMetres = (value: Millimetres | number): Metres => metres(value / 1000);
export const degreesToRadians = (degrees: number): Radians => radians((degrees * Math.PI) / 180);

/**
 * Frozen world conventions. Every World carries a copy so a serialised file is self-describing;
 * consumers must reject a World whose conventions differ from FROZEN_WORLD_CONVENTIONS.
 */
export interface WorldConventions {
  readonly lengthUnit: 'metre';
  readonly angleUnit: 'radian';
  /** Right-handed: +X east, +Y north, +Z up. */
  readonly axes: { readonly x: 'east'; readonly y: 'north'; readonly z: 'up' };
  readonly handedness: 'right';
  /** Vehicles drive on the LEFT; lane-local left/right is relative to the lane direction. */
  readonly trafficSide: 'LEFT';
  readonly jurisdiction: 'SG';
  readonly timezone: 'Asia/Singapore';
  /** Heading 0 = +X (east), counter-clockwise positive (so +Y north = π/2). */
  readonly headingZero: '+x';
  readonly headingPositive: 'counter-clockwise';
}

export const FROZEN_WORLD_CONVENTIONS: WorldConventions = Object.freeze({
  lengthUnit: 'metre',
  angleUnit: 'radian',
  axes: Object.freeze({ x: 'east', y: 'north', z: 'up' } as const),
  handedness: 'right',
  trafficSide: 'LEFT',
  jurisdiction: 'SG',
  timezone: 'Asia/Singapore',
  headingZero: '+x',
  headingPositive: 'counter-clockwise',
} as const);

/** Compass headings expressed as radians in the world frame. */
export const HEADING = Object.freeze({
  east: radians(0),
  north: radians(Math.PI / 2),
  west: radians(Math.PI),
  south: radians(-Math.PI / 2),
});

export type CompassDirection = keyof typeof HEADING;

/** World-space point, metres. */
export interface Vec3 {
  readonly x: Metres;
  readonly y: Metres;
  readonly z: Metres;
}

/** Unit-length direction in world space. Not a point. */
export interface UnitVec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** Rigid transform: position plus intrinsic yaw about +Z (radians), optional pitch/roll. Scale is always +1. */
export interface Pose {
  readonly position: Vec3;
  readonly yaw: Radians;
  readonly pitch?: Radians;
  readonly roll?: Radians;
}

/**
 * Position in a road frame: `s` along the road's authored reference direction, `t` positive to the
 * LEFT of that direction, `z` up. Curved roads map (s, t) into world space via the road centreline.
 */
export interface RoadFramePosition {
  readonly roadId: string;
  readonly s: Station;
  readonly t: Metres;
  readonly z?: Metres;
}

export const vec3 = (x: number, y: number, z = 0): Vec3 => ({
  x: metres(x),
  y: metres(y),
  z: metres(z),
});

export const unitVec3 = (x: number, y: number, z: number): UnitVec3 => {
  const length = Math.hypot(x, y, z);
  if (!(length > 0) || !Number.isFinite(length)) {
    throw new RangeError('unitVec3 requires a non-zero finite vector');
  }
  return { x: x / length, y: y / length, z: z / length };
};

export const headingToUnitVec = (heading: Radians): UnitVec3 => ({
  x: Math.cos(heading),
  y: Math.sin(heading),
  z: 0,
});

function assertFinite(value: number, label: string): void {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${label} must be finite, received ${String(value)}`);
  }
}
