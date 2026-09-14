import { type CameraPreset, type CameraPresetName, type SceneInput, type SceneView, type ViewChange, type ViewFit } from '@ottie/contracts';

/**
 * Typed development stand-in for the R1/R2 `SceneView`. It draws NO road geometry: it prints the
 * world ID, active preset and evidence IDs into the container, and reports a `ViewFit` computed
 * purely from each requirement's `allowedViews`. It exists so the lesson shell, its tests and I1's
 * wiring can run before the real renderer lands; it must never be mistaken for a scene.
 */
export function createStubSceneView(): SceneView {
  let container: HTMLElement | null = null;
  let input: SceneInput | null = null;
  const listeners = new Set<(change: ViewChange) => void>();

  const fitFor = (current: SceneInput): ViewFit => {
    const camera: CameraPreset | undefined = current.world.cameraPresets.find((p) => p.name === current.preset) ?? current.world.cameraPresets[0];
    if (!camera) throw new Error(`world ${current.world.id} has no camera presets`);
    const visible: string[] = [];
    const hidden: string[] = [];
    for (const requirement of current.evidence) {
      (requirement.allowedViews.includes(current.preset) ? visible : hidden).push(requirement.id);
    }
    return { camera, visibleEvidenceIds: visible, hiddenEvidenceIds: hidden, linkedDetailEntityIds: [] };
  };

  const draw = () => {
    if (!container || !input) return;
    container.replaceChildren();
    const box = document.createElement('div');
    box.className = 'ottie-scene-stub';
    box.dataset.testid = 'scene-stub';
    box.dataset.preset = input.preset;
    box.dataset.world = input.world.id;
    const title = document.createElement('strong');
    title.textContent = 'Scene stub (no geometry drawn)';
    const meta = document.createElement('span');
    meta.textContent = `${input.world.id} · ${input.preset.replace('_', ' ')} · ${input.viewport.widthPx}×${input.viewport.heightPx}px`;
    const evidence = document.createElement('span');
    evidence.textContent = input.evidence.length > 0 ? `evidence: ${input.evidence.map((e) => e.id).join(', ')}` : 'no evidence requirements';
    box.append(title, meta, evidence);
    if (input.highlightEntityId) {
      const highlight = document.createElement('span');
      highlight.textContent = `highlight: ${input.highlightEntityId}`;
      box.append(highlight);
    }
    container.append(box);
  };

  const emit = () => {
    if (!input) return;
    const change: ViewChange = { preset: input.preset, fit: fitFor(input) };
    for (const listener of listeners) listener(change);
  };

  return {
    mount(target, initial) {
      container = target;
      input = initial;
      draw();
      emit();
      return Promise.resolve();
    },
    update(next) {
      const presetChanged = input?.preset !== next.preset;
      input = next;
      draw();
      if (presetChanged) emit();
    },
    setPreset(preset: CameraPresetName) {
      if (!input || input.preset === preset) return;
      input = { ...input, preset };
      draw();
      emit();
    },
    onViewChange(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    unmount() {
      container?.replaceChildren();
      container = null;
      input = null;
    },
  };
}
