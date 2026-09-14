import { describe, expect, it } from 'vitest';
import { REQUIRED_WORLD_VALIDATORS } from '@ottie/scenario-validation';
import { STARTER_BUNDLE_ID } from '@ottie/starter-content';
import { buildReviewContext, buildReviewOutput, formatText, runCli } from './cli';

describe('scenario review CLI', () => {
  const context = buildReviewContext();

  it('summarises the generated starter worlds with every required validator', () => {
    const summaries = buildReviewOutput(context.inputs.worlds, context.inputs.validation ?? {});
    expect(summaries.length).toBeGreaterThanOrEqual(5);
    expect(summaries.map((s) => s.worldId)).toEqual(expect.arrayContaining([...context.content.scenarios.flatMap((s) => s.worlds.map((w) => w.world.id))]));
    for (const summary of summaries) {
      expect(summary.status).toBe('generated');
      expect(summary.usesQuarantinedAssets).toBe(true);
      expect(summary.validation.ok).toBe(true);
      expect(summary.validation.validatorsNotRun).toEqual([]);
      expect(summary.validation.validatorsRun).toEqual(expect.arrayContaining([...REQUIRED_WORLD_VALIDATORS]));
    }
    const text = formatText(summaries);
    expect(text).toMatch(/NOT release content/);
    expect(text).not.toMatch(/validators NOT run/);
    expect(text).toMatch(/all \d+ required families ran/);
  });

  it('reports a mutated generated world as invalid', () => {
    const original = context.inputs.worlds[0];
    if (!original) throw new Error('starter content has no world');
    const draft = structuredClone(original);
    const mutated = { ...draft, signFaces: draft.signFaces.slice(1) };
    const summaries = buildReviewOutput([mutated], context.inputs.validation ?? {});
    expect(summaries[0]?.validation.ok).toBe(false);
    expect(summaries[0]?.validation.errors).toBeGreaterThan(0);
    expect(formatText(summaries)).toMatch(/ok=false/);
    expect(original.signFaces.length).toBe(draft.signFaces.length);
  });

  it('refuses release and reports transitive impact over the starter closure', async () => {
    const summary = await runCli(['summary']);
    expect(summary.code).toBe(0);
    expect(summary.stdout).toMatch(/all \d+ required families ran/);
    expect(summary.stdout).not.toMatch(/validators NOT run/);
    const release = await runCli(['release']);
    expect(release.code).toBe(1);
    expect(release.stdout).toMatch(/refused/);
    expect(release.stdout).toMatch(/quarantined/);
    expect(release.stdout).toMatch(/C1 registry: rejected/);
    const giveWayWorld = context.content.scenarios.find((s) => s.scenario.id.includes('give-way'))?.worlds[0]?.world;
    if (!giveWayWorld) throw new Error('no give-way world');
    const impact = await runCli(['impact', '--asset', 'sg.mandatory.give-way']);
    expect(impact.code).toBe(0);
    expect(impact.stdout).toContain(giveWayWorld.id);
    const impactJson = await runCli(['impact', '--asset', 'sg.mandatory.give-way', '--json']);
    expect(impactJson.stdout).toContain(STARTER_BUNDLE_ID);
    const closure = await runCli(['closure']);
    expect(closure.code).toBe(0);
    expect(closure.stdout).toMatch(/closure: up to date/);
    const pins = await runCli(['pins']);
    expect(pins.code).toBe(0);
    expect(pins.stdout).toMatch(/pins: all match/);
  });
});
