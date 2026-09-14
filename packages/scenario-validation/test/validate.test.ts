import { describe, expect, it } from 'vitest';
import { REQUIRED_WORLD_VALIDATORS, missingValidators, validateWorld } from '@ottie/scenario-validation';
import { DEVELOPMENT_WORLDS, MUTATION_GIVE_WAY_SIGN_REVERSED } from '@ottie/contracts/fixtures';

describe('validation skeleton', () => {
  it('reports that semantic validators have NOT run for every fixture', () => {
    for (const world of DEVELOPMENT_WORLDS) {
      const report = validateWorld(world);
      expect(report.ok).toBe(true);
      expect(report.validatorsRun).toEqual(['structural_integrity']);
      const missing = missingValidators(report);
      expect(missing).toContain('control_completeness');
      expect(missing).toContain('signal_movements');
      expect(missing.length).toBe(REQUIRED_WORLD_VALIDATORS.length - 1);
    }
  });

  it('documents that a semantically invalid world currently passes: V1 must make this fail', () => {
    const report = validateWorld(MUTATION_GIVE_WAY_SIGN_REVERSED.apply());
    expect(report.ok).toBe(true);
    expect(missingValidators(report)).toContain(MUTATION_GIVE_WAY_SIGN_REVERSED.expectedValidator);
  });
});
