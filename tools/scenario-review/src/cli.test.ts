import { describe, expect, it } from 'vitest';
import { DEVELOPMENT_CONTENT_BUNDLE, DEVELOPMENT_WORLDS, QUESTION_GIVE_WAY } from '@ottie/contracts/fixtures';
import { REQUIRED_WORLD_VALIDATORS } from '@ottie/scenario-validation';
import { buildReviewOutput, formatText, runCli } from './cli';

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
    const summaries = buildReviewOutput([mutated]);
    expect(summaries[0]?.validation.ok).toBe(false);
    expect(summaries[0]?.validation.errors).toBeGreaterThan(0);
    expect(formatText(summaries)).toMatch(/ok=false/);
  });

  it('refuses release and reports transitive impact', async () => {
    const summary = await runCli(['summary']);
    expect(summary.stdout).toMatch(/all \d+ required families ran/);
    expect(summary.stdout).not.toMatch(/validators NOT run/);
    const release = await runCli(['release']);
    expect(release.code).toBe(1);
    expect(release.stdout).toMatch(/refused/);
    expect(release.stdout).toMatch(/quarantined/);
    const impact = await runCli(['impact', '--asset', 'sg.mandatory.give-way']);
    expect(impact.stdout).toContain('sg-give-way-t-001');
    const impactJson = await runCli(['impact', '--asset', 'sg.mandatory.give-way', '--json']);
    expect(impactJson.stdout).toContain(QUESTION_GIVE_WAY.id);
    expect(impactJson.stdout).toContain(DEVELOPMENT_CONTENT_BUNDLE.id);
  });
});
