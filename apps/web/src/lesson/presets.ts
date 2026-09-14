import { type CameraPresetName, type DeepReadonly, type EvidenceRequirement, type Question, type World } from '@ottie/contracts';

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
