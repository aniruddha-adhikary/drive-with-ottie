import { describe, expect, it } from 'vitest';
import { canonicalJson, checkQuestionStructure, checkWorldStructure } from '@ottie/contracts';
import { INVALID_WORLD_MUTATIONS, PRESENTATION_ONLY_CAMERA_MOVE, QUESTION_MUTATIONS } from '@ottie/contracts/fixtures';

/**
 * The mutation catalogue is the acceptance contract for V1's semantic validators. F0 only proves
 * (a) each mutation really changes the world, (b) the structurally-detectable subset is caught by
 * the structural check, and (c) the rest is NOT caught structurally — which is exactly why
 * semantic validation cannot be replaced by schema checks.
 */
describe('invalid-world mutation catalogue', () => {
  it('every mutation produces a distinct, frozen world', () => {
    for (const mutation of INVALID_WORLD_MUTATIONS) {
      const mutated = mutation.apply();
      expect(Object.isFrozen(mutated)).toBe(true);
      expect(canonicalJson(mutated)).not.toBe(canonicalJson(mutation.base));
      expect(canonicalJson(mutation.base)).toBe(canonicalJson(mutation.base));
    }
  });

  it('structurally detectable mutations fail the structural check; semantic ones pass it', () => {
    const semanticOnly: string[] = [];
    for (const mutation of INVALID_WORLD_MUTATIONS) {
      const diagnostics = checkWorldStructure(mutation.apply());
      if (mutation.structurallyDetectable) {
        expect(diagnostics.length, mutation.id).toBeGreaterThan(0);
      } else {
        expect(diagnostics, mutation.id).toEqual([]);
        semanticOnly.push(mutation.id);
      }
    }
    expect(semanticOnly.length).toBeGreaterThanOrEqual(10);
  });

  it('names a semantic validator and stable code for every mutation', () => {
    const codes = new Set<string>();
    for (const mutation of INVALID_WORLD_MUTATIONS) {
      expect(mutation.expectedCode.startsWith(`${mutation.expectedValidator}.`)).toBe(true);
      codes.add(mutation.expectedCode);
    }
    expect(codes.size).toBeGreaterThanOrEqual(12);
  });

  it('a camera-only change leaves every non-presentation field byte-identical', () => {
    const before = PRESENTATION_ONLY_CAMERA_MOVE.base;
    const after = PRESENTATION_ONLY_CAMERA_MOVE.apply();
    const strip = (w: typeof before) => canonicalJson({ ...w, cameraPresets: null });
    expect(strip(after)).toBe(strip(before));
    expect(canonicalJson(after.cameraPresets)).not.toBe(canonicalJson(before.cameraPresets));
    expect(checkWorldStructure(after)).toEqual([]);
  });
});

describe('question mutation catalogue', () => {
  it('structural question checks catch hypothetical-as-actual and unknown evidence', () => {
    for (const mutation of QUESTION_MUTATIONS) {
      const diagnostics = checkQuestionStructure(mutation.apply(), mutation.world);
      if (mutation.structurallyDetectable) {
        expect(diagnostics.length, mutation.id).toBeGreaterThan(0);
      } else {
        expect(diagnostics, mutation.id).toEqual([]);
      }
      expect(checkQuestionStructure(mutation.base, mutation.world)).toEqual([]);
    }
  });
});
