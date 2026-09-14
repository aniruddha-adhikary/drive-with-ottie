import { describe, expect, it } from 'vitest';
import { DEVELOPMENT_CONTENT_BUNDLE, DEVELOPMENT_WORLDS } from '@ottie/contracts/fixtures';
import { DEFAULT_PREFERENCES } from '@ottie/contracts';
import { chooseCompactView, initialPresetFor, questionEvidence } from './presets';
import { createTestRuntime } from './test-runtime';
import { fitForQuestion } from './world-scene-view';

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

describe('chooseCompactView', () => {
  const runtime = createTestRuntime().runtime;
  const { content, stage } = runtime;
  const phone = { widthPx: 360, heightPx: 270, devicePixelRatio: 3, safeInsetsPx: { top: 0, right: 0, bottom: 0, left: 0 } };
  const heights = [270, 360, 432, 522];

  it('shows every required requirement of every starter question at phone width by growing the compact scene, not the world', async () => {
    for (const question of content.bundle.questions) {
      const world = content.worlds.get(question.worldId);
      expect(world, question.id).toBeDefined();
      if (!world) continue;
      await stage.sceneView.ensureLoaded(world);
      const view = chooseCompactView(stage.camera, question, world, phone, heights, DEFAULT_PREFERENCES);
      expect(`${question.id}@${String(view.heightPx)}:${view.hiddenEvidenceIds.join(",")}`).toBe(`${question.id}@${String(view.heightPx)}:`);
      expect(heights).toContain(view.heightPx);
      expect(view.preset).not.toBe('entity_detail');
      // The chosen preset is one the question's evidence allows; nothing in the world changed.
      const fit = fitForQuestion(stage.camera, { world, evidence: questionEvidence(question, world), preset: view.preset, viewport: { ...phone, heightPx: view.heightPx }, preferences: DEFAULT_PREFERENCES, highlightEntityId: null });
      expect(fit.hiddenEvidenceIds).toEqual([]);
      // Everything the chosen view may carry is readable; evidence that only another view may carry
      // (a sign face in the top view) is named by the screen, never silently dropped.
      const carriable = questionEvidence(question, world).filter((e) => e.allowedViews.includes(view.preset)).map((e) => e.id).sort();
      expect(fit.visibleEvidenceIds.slice().sort()).toEqual(carriable);
    }
  });

  it('takes the shortest sufficient height and reports what a too-short scene still hides', async () => {
    const question = must(content.bundle.questions.find((q) => q.id === 'starter.stop.q1.who-goes-first-after-stopping'), 'stop q1');
    const world = must(content.worlds.get(question.worldId), 'stop world');
    await stage.sceneView.ensureLoaded(world);
    const short = chooseCompactView(stage.camera, question, world, phone, [270], DEFAULT_PREFERENCES);
    expect(short.heightPx).toBe(270);
    expect(short.hiddenEvidenceIds.length).toBeGreaterThan(0);
    const grown = chooseCompactView(stage.camera, question, world, phone, heights, DEFAULT_PREFERENCES);
    expect(grown.hiddenEvidenceIds).toEqual([]);
    expect(grown.heightPx).toBeGreaterThan(270);
    const easy = must(content.bundle.questions.find((q) => q.id === 'starter.give-way.q2.left-turn-clear-major-road'), 'give way q2');
    const easyWorld = must(content.worlds.get(easy.worldId), 'give way world');
    await stage.sceneView.ensureLoaded(easyWorld);
    expect(chooseCompactView(stage.camera, easy, easyWorld, phone, heights, DEFAULT_PREFERENCES).heightPx).toBe(270);
  });
});

function must<T>(value: T | null | undefined, what: string): T {
  if (value === null || value === undefined) throw new Error(`missing ${what}`);
  return value;
}
