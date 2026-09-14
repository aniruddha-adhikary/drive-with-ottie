import { type CameraPresetName, type DeepReadonly, type EvidenceRequirement, type Question, type ViewerPreferences, type Viewport, type World } from '@ottie/contracts';
import { type EvidenceCameraPort } from '@ottie/renderer-cameras';
import { fitForQuestion } from './world-scene-view';

/** The evidence requirements a question needs, in world order. Unknown IDs are dropped, not invented. */
export function questionEvidence(question: Question, world: DeepReadonly<World>): readonly EvidenceRequirement[] {
  const wanted = new Set(question.requiredEvidenceIds);
  return world.evidence.filter((e) => wanted.has(e.id));
}

/**
 * The lesson starts on the view that exposes the question's evidence: the first world preset that
 * every required requirement allows, otherwise the preset allowed by the most requirements, otherwise
 * the world's first preset. The learner must never need the viewer to discover an essential control.
 */
export function initialPresetFor(question: Question, world: DeepReadonly<World>): CameraPresetName {
  const evidence = questionEvidence(question, world);
  const presets = world.cameraPresets.map((p) => p.name);
  const first = presets[0];
  if (!first) throw new Error(`world ${world.id} has no camera presets`);
  if (evidence.length === 0) return first;

  let best = first;
  let bestCount = -1;
  for (const preset of presets) {
    const count = evidence.filter((e) => e.allowedViews.includes(preset)).length;
    if (count === evidence.length) return preset;
    if (count > bestCount) {
      best = preset;
      bestCount = count;
    }
  }
  return best;
}

/** Presets ranked as `initialPresetFor` ranks them: most required evidence allowed first, world order on ties. */
export function rankedPresets(question: Question, world: DeepReadonly<World>): readonly CameraPresetName[] {
  const evidence = questionEvidence(question, world);
  const scored = world.cameraPresets.map((p, index) => ({
    name: p.name,
    index,
    count: evidence.filter((e) => e.allowedViews.includes(p.name)).length,
  }));
  scored.sort((a, b) => b.count - a.count || a.index - b.index);
  return scored.filter((s) => s.name !== 'entity_detail').map((s) => s.name);
}

/**
 * Chooses the first view that shows every required requirement readably at the viewport the
 * compact scene actually has, measured by the R2 camera port over the real geometry; when no
 * preset manages that, the one hiding the fewest requirements wins. Presentation only: a hidden
 * requirement is reported by the SceneHost, never dropped, and no actor is moved to make it fit.
 */
export function chooseInitialPreset(
  camera: EvidenceCameraPort,
  question: Question,
  world: DeepReadonly<World>,
  viewport: Viewport,
  preferences: ViewerPreferences,
): CameraPresetName {
  return chooseCompactView(camera, question, world, viewport, [viewport.heightPx], preferences).preset;
}

export interface CompactView {
  readonly preset: CameraPresetName;
  /** Compact scene height the chooser settled on (one of the offered candidates). */
  readonly heightPx: number;
  /** Required evidence the chosen view still cannot show readably; empty when the view is complete. */
  readonly hiddenEvidenceIds: readonly string[];
}

/**
 * Compact scene layout as a fitting problem: the scene keeps the phone's width and may grow taller
 * (candidate heights, ascending) until some preset shows every required requirement at or above its
 * authored minimum size. The smallest sufficient height wins so the question stays near the scene;
 * when none suffices, the tallest candidate with the fewest hidden requirements is used and the
 * remainder is reported for the enlarged viewer. Only camera numbers and CSS height change here.
 */
export function chooseCompactView(
  camera: EvidenceCameraPort,
  question: Question,
  world: DeepReadonly<World>,
  viewport: Viewport,
  heightsPx: readonly number[],
  preferences: ViewerPreferences,
): CompactView {
  const evidence = questionEvidence(question, world);
  const wanted = new Set(evidence.map((e) => e.id));
  const heights = [...new Set(heightsPx.map((h) => Math.round(h)).filter((h) => h > 0))].sort((a, b) => a - b);
  if (heights.length === 0) heights.push(viewport.heightPx);
  let best: CompactView | null = null;
  for (const heightPx of heights) {
    for (const preset of rankedPresets(question, world)) {
      const fit = fitForQuestion(camera, {
        world,
        evidence,
        preset,
        viewport: { ...viewport, heightPx },
        preferences,
        highlightEntityId: null,
      });
      const { hiddenEvidenceIds } = fit;
      const candidate: CompactView = { preset, heightPx, hiddenEvidenceIds };
      if (hiddenEvidenceIds.length === 0) return candidate;
      if (!best || hiddenEvidenceIds.length <= best.hiddenEvidenceIds.length) best = candidate;
    }
  }
  return best ?? { preset: initialPresetFor(question, world), heightPx: heights[0] ?? viewport.heightPx, hiddenEvidenceIds: [...wanted] };
}
