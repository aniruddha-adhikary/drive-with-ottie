import { describe, expect, it } from 'vitest';
import { canonicalJson } from '@ottie/contracts';
import { DEVELOPMENT_WORLDS } from '@ottie/contracts/fixtures';
import { buildSchematicScene } from '@ottie/renderer-geometry';

describe('schematic scene', () => {
  it('draws one line per lane and does not mutate the world', () => {
    for (const world of DEVELOPMENT_WORLDS) {
      const before = canonicalJson(world);
      const scene = buildSchematicScene(world);
      expect(scene.laneCount).toBe(world.lanes.length);
      expect(scene.root.children.filter((c) => c.name.startsWith('lane:'))).toHaveLength(world.lanes.length);
      expect(scene.anchorCount).toBeGreaterThan(0);
      expect(canonicalJson(world)).toBe(before);
    }
  });
});
