import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { type Viewport } from '@ottie/contracts';
import { projectPoints } from '@ottie/renderer-evidence';
import {
  NORTH,
  WORLD_UP,
  azimuthOf,
  basisFor,
  elevationOf,
  fitOrthographic,
  fitPerspective,
  makePreset,
  obliqueDirection,
  presetSpec,
  presetToThreeCamera,
  yawDirection,
} from '../src';

const desktop: Viewport = {
  widthPx: 1280,
  heightPx: 720,
  devicePixelRatio: 1,
  safeInsetsPx: { top: 0, right: 0, bottom: 0, left: 0 },
};
const narrow: Viewport = {
  widthPx: 360,
  heightPx: 640,
  devicePixelRatio: 3,
  safeInsetsPx: { top: 48, right: 0, bottom: 160, left: 0 },
};

const cloud = [
  new Vector3(-12, -30, 0),
  new Vector3(18, 4, 0),
  new Vector3(3, -8, 3.5),
  new Vector3(-4, 10, 0.1),
  new Vector3(9, -22, 2.2),
];

function clone(points: readonly Vector3[]): Vector3[] {
  return points.map((p) => p.clone());
}

describe('framing math', () => {
  it('builds a right-handed orthonormal basis and degrades gracefully when looking straight down', () => {
    const oblique = basisFor(new Vector3(1, 1, -1), WORLD_UP);
    expect(oblique.forward.length()).toBeCloseTo(1, 9);
    expect(oblique.right.dot(oblique.forward)).toBeCloseTo(0, 9);
    expect(oblique.up.dot(oblique.forward)).toBeCloseTo(0, 9);
    expect(oblique.right.clone().cross(oblique.up).dot(oblique.forward)).toBeCloseTo(-1, 9);
    expect(oblique.up.z).toBeGreaterThan(0);
    const down = basisFor(new Vector3(0, 0, -1), NORTH);
    expect(down.up.toArray().map((n) => n + 0)).toEqual([0, 1, 0]);
    expect(down.right.toArray().map((n) => n + 0)).toEqual([1, 0, 0]);
  });

  it('yaw / oblique helpers follow the frozen conventions (heading 0 = +X, positive = counter-clockwise, Z up)', () => {
    const east = new Vector3(1, 0, 0);
    const north = yawDirection(east, Math.PI / 2);
    expect(north.x).toBeCloseTo(0, 9);
    expect(north.y).toBeCloseTo(1, 9);
    const dir = obliqueDirection(Math.PI / 4, Math.PI / 6);
    expect(dir.length()).toBeCloseTo(1, 9);
    expect(elevationOf(dir)).toBeCloseTo(Math.PI / 6, 9);
    expect(azimuthOf(dir)).toBeCloseTo(Math.PI / 4, 9);
    expect(dir.z).toBeLessThan(0);
  });

  for (const [label, viewport] of [
    ['desktop', desktop],
    ['narrow phone with insets', narrow],
  ] as const) {
    it(`fitOrthographic encloses every point inside the safe rectangle on ${label} without moving the points`, () => {
      const before = clone(cloud);
      const fit = fitOrthographic(cloud, new Vector3(0, 0, -1), NORTH, viewport, 80, 1.1);
      expect(fit).not.toBeNull();
      if (!fit) return;
      const preset = makePreset({
        name: 'plan',
        projection: 'orthographic',
        eye: fit.eye,
        target: fit.target,
        up: NORTH,
        fovOrHalfHeight: fit.halfHeight,
        linkedEntityId: null,
        evidenceIds: [],
      });
      const camera = presetToThreeCamera(preset, viewport);
      const projected = projectPoints(camera, viewport, cloud);
      expect(projected.every((p) => p.inFront && p.inSafeRect)).toBe(true);
      expect(cloud.map((p) => p.toArray())).toEqual(before.map((p) => p.toArray()));
      // Tight: the frame is not wastefully large (some point sits near the safe edge).
      const xs = projected.map((p) => p.xPx);
      const ys = projected.map((p) => p.yPx);
      const safeTop = viewport.safeInsetsPx.top;
      const safeBottom = viewport.heightPx - viewport.safeInsetsPx.bottom;
      const spanX = (Math.max(...xs) - Math.min(...xs)) / viewport.widthPx;
      const spanY = (Math.max(...ys) - Math.min(...ys)) / (safeBottom - safeTop);
      expect(Math.max(spanX, spanY)).toBeGreaterThan(0.85);
      expect(Math.min(...ys)).toBeGreaterThanOrEqual(safeTop);
      expect(Math.max(...ys)).toBeLessThanOrEqual(safeBottom);
    });

    it(`fitPerspective backs off along the view direction until all points fit on ${label}`, () => {
      const forward = new Vector3(0, 1, -0.15).normalize();
      const fit = fitPerspective(cloud, forward, WORLD_UP, viewport, Math.PI / 3, 1.1, 2);
      expect(fit).not.toBeNull();
      if (!fit) return;
      expect(fit.distanceM).toBeGreaterThan(2);
      const preset = makePreset({
        name: 'approach_ego',
        projection: 'perspective',
        eye: fit.eye,
        target: fit.target,
        up: WORLD_UP,
        fovOrHalfHeight: Math.PI / 3,
        linkedEntityId: null,
        evidenceIds: [],
      });
      const camera = presetToThreeCamera(preset, viewport);
      const projected = projectPoints(camera, viewport, cloud);
      expect(projected.every((p) => p.inFront && p.inSafeRect)).toBe(true);
      // The eye lies on the line through the cloud centre along -forward.
      const toEye = fit.eye.clone().sub(fit.target.clone());
      expect(toEye.clone().normalize().dot(forward)).toBeLessThan(0);
    });
  }

  it('returns null for an empty point set and never yields a frame smaller than the minimum half height', () => {
    expect(fitOrthographic([], new Vector3(0, 0, -1), NORTH, desktop, 80, 1.1)).toBeNull();
    expect(fitPerspective([], new Vector3(0, 1, 0), WORLD_UP, desktop, 1, 1.1, 1)).toBeNull();
    const tiny = fitOrthographic(
      [new Vector3(0, 0, 0)],
      new Vector3(0, 0, -1),
      NORTH,
      desktop,
      80,
      1.1,
      4,
    );
    expect(tiny?.halfHeight).toBe(4);
  });

  it('makePreset / presetSpec round-trip frozen plain data', () => {
    const preset = makePreset({
      name: 'study_oblique',
      projection: 'orthographic',
      eye: new Vector3(1, 2, 3),
      target: new Vector3(0, 0, 0),
      up: new Vector3(0, 0, 2),
      fovOrHalfHeight: 12,
      linkedEntityId: null,
      evidenceIds: ['ev.a'],
    });
    expect(Object.isFrozen(preset)).toBe(true);
    expect(Object.isFrozen(preset.evidenceIds)).toBe(true);
    expect(preset.up).toEqual({ x: 0, y: 0, z: 1 });
    const spec = presetSpec(preset);
    expect(spec.eye.toArray()).toEqual([1, 2, 3]);
    expect(makePreset(spec)).toEqual(preset);
  });
});
