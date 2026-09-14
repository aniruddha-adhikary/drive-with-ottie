import { type CameraPort, type CameraPresetName, type DeepReadonly, type EvidenceRequirement, type Question, type ViewerPreferences, type Viewport, type World } from '@ottie/contracts';

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
  camera: CameraPort,
  question: Question,
  world: DeepReadonly<World>,
  viewport: Viewport,
  preferences: ViewerPreferences,
): CameraPresetName {
  const evidence = questionEvidence(question, world);
  const fallback = initialPresetFor(question, world);
  const wanted = new Set(evidence.map((e) => e.id));
  let best: { name: CameraPresetName; hidden: number } | null = null;
  for (const name of rankedPresets(question, world)) {
    const fit = camera.fit({ world, evidence: world.evidence, preset: name, viewport, preferences, highlightEntityId: null });
    const hidden = fit.hiddenEvidenceIds.filter((id) => wanted.has(id)).length;
    if (hidden === 0) return name;
    if (!best || hidden < best.hidden) best = { name, hidden };
  }
  return best?.name ?? fallback;
}
