import { describe, expect, it } from 'vitest';
import { DEVELOPMENT_CONTENT_BUNDLE, DEVELOPMENT_WORLDS, QUESTION_GIVE_WAY } from '@ottie/contracts/fixtures';
import { REQUIRED_WORLD_VALIDATORS, validateWorld } from '@ottie/scenario-validation';
import { buildReviewOutput, formatText, runCli } from './cli.js';

describe('scenario review CLI', () => {
  it('summarises development fixtures with every required validator', () => {
    const summaries = buildReviewOutput();
    expect(summaries).toHaveLength(3);
    for (const summary of summaries) {
      expect(summary.status).toBe('development_fixture');
      expect(summary.usesQuarantinedAssets).toBe(true);
      expect(summary.validation.validatorsNotRun).toEqual([]);
      expect(summary.validation.validatorsRun).toEqual(expect.arrayContaining([...REQUIRED_WORLD_VALIDATORS]));
    }
    const text = formatText(summaries);
    expect(text).toMatch(/NOT release content/);
    expect(text).not.toMatch(/validators NOT run/);
    expect(text).toMatch(/all \d+ required families ran/);
  });

  it('reports a mutated world as invalid', () => {
    const original = DEVELOPMENT_WORLDS[0];
    if (!original) throw new Error('fixture has no world');
    const draft = structuredClone(original);
    const mutated = { ...draft, signFaces: draft.signFaces.slice(1) };
    const report = validateWorld(mutated);
    expect(report.ok).toBe(false);
    expect(report.diagnostics.filter((diagnostic) => diagnostic.severity === 'error').length).toBeGreaterThan(0);
  });

  it('refuses release and reports transitive impact', async () => {
    const release = await runCli(['release']);
    expect(release.code).toBe(1);
    expect(release.stdout).toMatch(/refused/);
    expect(release.stdout).toMatch(/quarantined/);
    const impact = await runCli(['impact', '--asset', 'sg.mandatory.give-way', '--json']);
    expect(impact.stdout).toContain(QUESTION_GIVE_WAY.id);
    expect(impact.stdout).toContain(DEVELOPMENT_CONTENT_BUNDLE.id);
  });
});
