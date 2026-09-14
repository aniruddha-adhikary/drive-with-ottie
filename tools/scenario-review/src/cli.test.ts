import { describe, expect, it } from 'vitest';
import { buildReviewOutput, formatText } from './cli';

describe('review export CLI (skeleton)', () => {
  it('summarises every development fixture and states which validators did not run', () => {
    const summaries = buildReviewOutput();
    expect(summaries).toHaveLength(3);
    for (const s of summaries) {
      expect(s.status).toBe('development_fixture');
      expect(s.usesQuarantinedAssets).toBe(true);
      expect(s.validation.validatorsNotRun.length).toBeGreaterThan(0);
    }
    const text = formatText(summaries);
    expect(text).toMatch(/NOT release content/);
    expect(text).toMatch(/validators NOT run/);
  });
});
