import { type EntityId } from './ids';
import { type DeepReadonly } from './immutable';
import { type Diagnostic } from './diagnostic';
import { type Preferences } from './learning';
import { type CameraPreset, type CameraPresetName, type EvidenceRequirement, type World } from './world';

/** CSS-pixel viewport allocated to the scene AFTER the lesson reserves stem/options/primary action. */
export interface Viewport {
  readonly widthPx: number;
  readonly heightPx: number;
  readonly devicePixelRatio: number;
  /** Insets occupied by UI overlays that may cover scene pixels (top/right/bottom/left). */
  readonly safeInsetsPx: { readonly top: number; readonly right: number; readonly bottom: number; readonly left: number };
}

export type ViewerPreferences = Pick<Preferences, 'reducedMotion' | 'textScale' | 'theme'>;

/** Everything a SceneView receives. All fields are read-only inputs; the view owns no world state. */
export interface SceneInput {
  readonly world: DeepReadonly<World>;
  readonly evidence: readonly EvidenceRequirement[];
  readonly preset: CameraPresetName;
  readonly viewport: Viewport;
  readonly preferences: ViewerPreferences;
  /** Entity to emphasise (glossary focus), presentation-only. */
  readonly highlightEntityId: EntityId | null;
}

/** Result of fitting a preset: the concrete camera plus what it managed to show. */
export interface ViewFit {
  readonly camera: CameraPreset;
  readonly visibleEvidenceIds: readonly string[];
  readonly hiddenEvidenceIds: readonly string[];
  /** Fallback insets/linked views the renderer added to expose hidden evidence. */
  readonly linkedDetailEntityIds: readonly EntityId[];
}

export interface ViewChange {
  readonly preset: CameraPresetName;
  readonly fit: ViewFit;
}

/**
 * Per-evidence visibility result. Bounding-box intersection is insufficient; implementations must
 * consider front-normal facing, frustum, projected readable area, occlusion and co-visibility.
 */
export interface EvidenceVisibility {
  readonly evidenceId: string;
  readonly visible: boolean;
  readonly frontFacing: boolean | null;
  readonly projectedSizePx: number | null;
  readonly occlusionFraction: number | null;
  readonly coVisibleSatisfied: boolean;
  readonly diagnostics: readonly Diagnostic[];
}

/** Camera port (R2): fits a preset to evidence bounds and validates what is visible. */
export interface CameraPort {
  fit(input: SceneInput): ViewFit;
  evaluate(input: SceneInput, camera: CameraPreset): readonly EvidenceVisibility[];
}

/**
 * Renderer port (R1): builds and updates a scene graph from a World. The renderer never decides
 * priority, adds missing controls or rotates physical signs to face the camera.
 */
export interface RendererPort {
  /** Build geometry for a world. Called once per world; cameras/highlights change via `update`. */
  load(world: DeepReadonly<World>): Promise<void>;
  update(input: SceneInput, camera: CameraPreset): void;
  resize(viewport: Viewport): void;
  dispose(): void;
}

/**
 * SceneView adapter hosted by the lesson shell (U1) and implemented by R1/R2. UI code only calls
 * these methods; it never reaches into Three.js objects. Camera changes emit `onViewChange` and
 * must not touch attempt, seed, traffic or answer state.
 */
export interface SceneView {
  mount(container: HTMLElement, input: SceneInput): Promise<void>;
  update(input: SceneInput): void;
  setPreset(preset: CameraPresetName): void;
  onViewChange(listener: (change: ViewChange) => void): () => void;
  unmount(): void;
}

export type SceneViewFactory = (options: { readonly renderer: RendererPort; readonly camera: CameraPort }) => SceneView;
