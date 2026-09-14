import { describe, expect, it } from 'vitest';
import {
  CONTRACT_VERSION,
  FROZEN_WORLD_CONVENTIONS,
  HEADING,
  WORLD_SCHEMA_VERSION,
  assetId,
  canonicalJson,
  degreesToRadians,
  freezeDeep,
  headingToUnitVec,
  mmToMetres,
  seed,
  sha256,
  worldId,
} from '@ottie/contracts';

describe('frozen conventions', () => {
  it('pins metres/radians, X east / Y north / Z up and LEFT traffic', () => {
    expect(FROZEN_WORLD_CONVENTIONS).toMatchObject({
      lengthUnit: 'metre',
      angleUnit: 'radian',
      axes: { x: 'east', y: 'north', z: 'up' },
      trafficSide: 'LEFT',
      handedness: 'right',
    });
    expect(Object.isFrozen(FROZEN_WORLD_CONVENTIONS)).toBe(true);
    expect(CONTRACT_VERSION).toBe(1);
    expect(WORLD_SCHEMA_VERSION).toBe(1);
  });

  it('heading 0 is east and rotation is counter-clockwise', () => {
    const east = headingToUnitVec(HEADING.east);
    const north = headingToUnitVec(HEADING.north);
    expect(east.x).toBeCloseTo(1);
    expect(east.y).toBeCloseTo(0);
    expect(north.x).toBeCloseTo(0);
    expect(north.y).toBeCloseTo(1);
    expect(degreesToRadians(180)).toBeCloseTo(Math.PI);
    expect(mmToMetres(600)).toBeCloseTo(0.6);
  });

  it('branded id constructors reject malformed ids', () => {
    expect(() => assetId('sg.markings.give-way-line-d')).not.toThrow();
    expect(() => assetId('Give Way')).toThrow();
    expect(() => sha256('00')).toThrow();
    expect(() => worldId('UPPER')).toThrow();
    expect(seed('fixture-1')).toBe('fixture-1');
  });

  it('freezeDeep freezes nested structures and canonicalJson is key-order independent', () => {
    const value = freezeDeep({ b: [{ z: 1, a: 2 }], a: 'x' });
    expect(Object.isFrozen(value)).toBe(true);
    expect(Object.isFrozen(value.b)).toBe(true);
    expect(Object.isFrozen(value.b[0])).toBe(true);
    expect(canonicalJson({ b: 1, a: { d: 1, c: 2 } })).toBe(canonicalJson({ a: { c: 2, d: 1 }, b: 1 }));
  });
});
