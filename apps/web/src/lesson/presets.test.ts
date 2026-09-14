import { describe, expect, it } from 'vitest';
import { DEVELOPMENT_CONTENT_BUNDLE, DEVELOPMENT_WORLDS } from '@ottie/contracts/fixtures';
import { initialPresetFor, questionEvidence } from './presets';

describe('initialPresetFor', () => {
  it('starts every fixture question on a view its required evidence allows', () => {
    for (const question of DEVELOPMENT_CONTENT_BUNDLE.questions) {
      const world = DEVELOPMENT_WORLDS.find((w) => w.id === question.worldId);
      expect(world, question.id).toBeDefined();
      if (!world) continue;
      const evidence = questionEvidence(question, world);
      expect(evidence.map((e) => e.id).sort()).toEqual([...question.requiredEvidenceIds].sort());
      const preset = initialPresetFor(question, world);
      expect(world.cameraPresets.map((p) => p.name)).toContain(preset);
      const allowedCount = evidence.filter((e) => e.allowedViews.includes(preset)).length;
      const bestPossible = Math.max(...world.cameraPresets.map((p) => evidence.filter((e) => e.allowedViews.includes(p.name)).length));
      expect(allowedCount).toBe(bestPossible);
    }
  });
});
