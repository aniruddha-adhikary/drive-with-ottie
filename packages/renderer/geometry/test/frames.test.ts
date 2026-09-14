import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { metres, millimetres, mmToMetres, type Pose, radians, vec3 } from '@ottie/contracts';
import {
  facingFrame,
  headingVector,
  poseMatrix,
  poseQuaternion,
  polylineWalker,
} from '@ottie/renderer-geometry';
import { expectVector } from './helpers';

const pose = (yaw: number, pitch = 0, roll = 0): Pose => ({
  position: vec3(1, 2, 3),
  yaw: radians(yaw),
  pitch: radians(pitch),
  roll: radians(roll),
});

describe('pose transforms', () => {
  it('yaw 0 keeps +X, positive yaw turns counter-clockwise about +Z', () => {
    expectVector(new Vector3(1, 0, 0).applyQuaternion(poseQuaternion(pose(0))), [1, 0, 0]);
    expectVector(
      new Vector3(1, 0, 0).applyQuaternion(poseQuaternion(pose(Math.PI / 2))),
      [0, 1, 0],
    );
    expectVector(
      new Vector3(0, -1, 0).applyQuaternion(poseQuaternion(pose(Math.PI / 2))),
      [1, 0, 0],
    );
    expectVector(headingVector(radians(Math.PI)), [-1, 0, 0]);
  });

  it('pitch tilts about the yawed local Y and roll about local X, applied yaw -> pitch -> roll', () => {
    const q = poseQuaternion(pose(0, Math.PI / 2));
    expectVector(new Vector3(1, 0, 0).applyQuaternion(q), [0, 0, -1]);
    const rolled = poseQuaternion(pose(0, 0, Math.PI / 2));
    expectVector(new Vector3(0, 1, 0).applyQuaternion(rolled), [0, 0, 1]);
    const both = poseQuaternion(pose(Math.PI / 2, Math.PI / 2));
    expectVector(new Vector3(1, 0, 0).applyQuaternion(both), [0, 0, -1]);
    expectVector(new Vector3(0, 0, 1).applyQuaternion(both), [0, 1, 0]);
  });

  it('pose matrices translate after rotating and never scale', () => {
    const m = poseMatrix(pose(Math.PI / 2));
    expectVector(new Vector3(1, 0, 0).applyMatrix4(m), [1, 3, 3]);
    expect(m.determinant()).toBeCloseTo(1, 9);
  });
});

describe('facing frames', () => {
  it('builds an orthonormal right-handed observer frame with right = up x front', () => {
    const frame = facingFrame(new Vector3(0, -1, 0), new Vector3(0, 0, 1));
    expectVector(frame.front, [0, -1, 0]);
    expectVector(frame.up, [0, 0, 1]);
    expectVector(frame.right, [1, 0, 0]);
    expect(new Vector3().crossVectors(frame.right, frame.up).dot(frame.front)).toBeCloseTo(1, 9);
  });

  it('re-orthogonalises a non-perpendicular up without changing front', () => {
    const frame = facingFrame(new Vector3(1, 0, 0), new Vector3(0.3, 0, 1));
    expectVector(frame.front, [1, 0, 0]);
    expectVector(frame.up, [0, 0, 1]);
    expectVector(frame.right, [0, 1, 0]);
  });
});

describe('polyline walker and units', () => {
  it('walks cumulative distance along the authored polyline', () => {
    const walker = polylineWalker([vec3(0, 0, 0), vec3(10, 0, 0), vec3(10, 5, 0)]);
    expect(walker.lengthM).toBeCloseTo(15);
    expectVector(walker.at(5).point, [5, 0, 0]);
    expectVector(walker.at(5).direction, [1, 0, 0]);
    expectVector(walker.at(12).point, [10, 2, 0]);
    expectVector(walker.at(12).direction, [0, 1, 0]);
    expectVector(walker.at(99).point, [10, 5, 0]);
    expectVector(walker.at(-1).point, [0, 0, 0]);
  });

  it('converts millimetres to metres exactly for the fixture dimensions', () => {
    expect(mmToMetres(millimetres(600))).toBe(metres(0.6));
    expect(mmToMetres(millimetres(2290))).toBeCloseTo(2.29, 12);
    expect(mmToMetres(millimetres(100))).toBeCloseTo(0.1, 12);
  });
});
