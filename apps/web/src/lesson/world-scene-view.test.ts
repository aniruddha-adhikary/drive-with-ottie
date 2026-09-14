// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_PREFERENCES, type SceneInput, type ViewChange } from '@ottie/contracts';
import { canonicalWorldJson } from '@ottie/scenario-core';
import { questionEvidence } from './presets';
import { type TestRuntime, createTestRuntime, starterContent } from './test-runtime';

const phone = { widthPx: 360, heightPx: 360, devicePixelRatio: 2, safeInsetsPx: { top: 0, right: 0, bottom: 0, left: 0 } } as const;

function must<T>(value: T | undefined | null, what: string): T {
  if (value === undefined || value === null) throw new Error(`missing ${what}`);
  return value;
}

describe('real SceneView adapter (R1 renderer + R2 cameras on a fake surface)', () => {
  let rt: TestRuntime | null = null;
  afterEach(() => {
    rt?.runtime.dispose();
    rt = null;
  });

  it('loads the generated world, fits the question evidence, paints, and re-fits on preset change without touching the world', async () => {
    rt = createTestRuntime();
    const content = starterContent();
    const question = must(content.bundle.questions.find((q) => q.worldId.includes('give-way')), 'give-way question');
    const world = must(content.worlds.get(question.worldId), 'give-way world');
    const before = canonicalWorldJson(world);
    const { sceneView } = rt.runtime.stage;
    const changes: ViewChange[] = [];
    sceneView.onViewChange((c) => changes.push(c));

    const container = document.createElement('div');
    document.body.append(container);
    const input: SceneInput = { world, evidence: questionEvidence(question, world), preset: 'plan', viewport: phone, preferences: DEFAULT_PREFERENCES, highlightEntityId: null };
    await sceneView.mount(container, input);

    expect(container.querySelector('[data-testid="fake-surface"]')).not.toBeNull();
    expect(rt.surface.frames.length).toBeGreaterThan(0);
    const first = must(rt.surface.frames.at(-1), 'painted frame');
    expect(first.viewport).toEqual(phone);
    expect(first.objectCount).toBeGreaterThan(10);
    expect(changes).toHaveLength(1);
    expect(changes[0]?.preset).toBe('plan');
    expect(changes[0]?.fit.hiddenEvidenceIds).toEqual([]);
    for (const id of changes[0]?.fit.visibleEvidenceIds ?? []) expect(question.requiredEvidenceIds).toContain(id);

    sceneView.setPreset('approach_ego');
    expect(changes).toHaveLength(2);
    expect(changes[1]?.preset).toBe('approach_ego');
    expect(must(rt.surface.frames.at(-1), 'frame').camera).not.toBe(first.camera);
    // The approach view carries the sign face; on a phone it is too small, so R2 links a close-up
    // of the sign where it stands instead of moving it or dropping the requirement.
    const approach = must(changes[1]?.fit, 'approach fit');
    expect([...approach.visibleEvidenceIds, ...approach.hiddenEvidenceIds]).toContain('ev.give-way-sign');
    if (approach.hiddenEvidenceIds.includes('ev.give-way-sign')) expect(approach.linkedDetailEntityIds).toContain('minor.give-way-sign');

    sceneView.update({ ...input, preset: 'approach_ego' });
    expect(changes).toHaveLength(2);

    sceneView.unmount();
    expect(rt.surface.disposed()).toBe(1);
    expect(container.querySelector('[data-testid="fake-surface"]')).toBeNull();
    expect(canonicalWorldJson(world)).toBe(before);
  });

  it('switches worlds on update and never paints a stale world onto the new frame', async () => {
    rt = createTestRuntime();
    const content = starterContent();
    const [a, b] = content.bundle.questions.filter((q, i, all) => all.findIndex((o) => o.worldId === q.worldId) === i);
    const worldA = must(content.worlds.get(must(a, 'a').worldId), 'world a');
    const worldB = must(content.worlds.get(must(b, 'b').worldId), 'world b');
    const { sceneView } = rt.runtime.stage;
    const changes: ViewChange[] = [];
    sceneView.onViewChange((c) => changes.push(c));
    const container = document.createElement('div');
    document.body.append(container);
    const inputA: SceneInput = { world: worldA, evidence: questionEvidence(must(a, 'a'), worldA), preset: 'plan', viewport: phone, preferences: DEFAULT_PREFERENCES, highlightEntityId: null };
    await sceneView.mount(container, inputA);
    const paintedA = rt.surface.frames.length;

    sceneView.update({ ...inputA, world: worldB, evidence: questionEvidence(must(b, 'b'), worldB) });
    expect(rt.surface.frames.length).toBe(paintedA);
    await sceneView.ensureLoaded(worldB);
    await new Promise((r) => setTimeout(r, 0));
    expect(rt.surface.frames.length).toBeGreaterThan(paintedA);
    expect(changes.at(-1)?.fit.visibleEvidenceIds.every((id) => must(b, 'b').requiredEvidenceIds.includes(id))).toBe(true);
    sceneView.unmount();
  });
});
