import { type AssetRef, type Seed, type TemplateId, type TemplateRef, type WorldId } from './ids';
import { type ControlRegime, type RoadClass } from './asset';
import { type Diagnostic, type ValidatorName } from './diagnostic';
import { type World } from './world';
import { type DeepReadonly } from './immutable';
import { type ContentBundleRef } from './content';

export type JunctionTopology = 't_junction' | 'crossroads' | 'straight_road' | 'access_junction' | 'roundabout';

/** A named parameter a template accepts, with the closed set of allowed values. */
export interface TemplateParameter {
  readonly name: string;
  readonly kind: 'enum' | 'integer' | 'boolean';
  readonly allowed: readonly (string | number | boolean)[];
  readonly default: string | number | boolean;
  /** True when changing this parameter can change the correct answer (a semantic variant). */
  readonly answerBearing: boolean;
}

/** A field the seeded PRNG may vary without affecting evidence, conflicts or the answer. */
export interface SafeVariation {
  readonly field: string;
  readonly description: string;
  readonly range: Readonly<Record<string, unknown>>;
}

/**
 * Reviewed scenario template. Generation is total over declared parameters; anything else is a
 * new template or version. `invariants` name the validators that must pass on every output.
 */
export interface Template {
  readonly id: TemplateId;
  readonly version: number;
  readonly name: string;
  readonly roadClass: RoadClass;
  readonly topology: JunctionTopology;
  readonly controlRegime: ControlRegime;
  readonly parameters: readonly TemplateParameter[];
  readonly invariants: readonly ValidatorName[];
  readonly safeVariation: readonly SafeVariation[];
  readonly requiredAssets: readonly AssetRef[];
  /** Evidence requirement IDs every generated world must expose. */
  readonly requiredEvidenceIds: readonly string[];
  /** Answer-equivalence rules: parameter combinations that share a correct answer. */
  readonly answerEquivalence: readonly { readonly rule: string; readonly parameters: readonly string[] }[];
  /** Reviewed fixture worlds that exemplify this template. */
  readonly fixtureWorldIds: readonly WorldId[];
  readonly reviewStatus: 'development' | 'reviewed';
}

/** Compact authoring request to a template (docs/SCENARIO-SYSTEM.md §3 "Concrete authoring input"). */
export interface GenerationRequest {
  readonly id: WorldId;
  readonly schemaVersion: number;
  readonly templateRef: TemplateRef;
  readonly seed: Seed;
  readonly sourceProfileId: string;
  readonly parameters: Readonly<Record<string, string | number | boolean>>;
  readonly contentBundle: ContentBundleRef | null;
  readonly views: readonly ('plan' | 'study_oblique' | 'approach_ego' | 'entity_detail')[];
}

export type GenerationResult =
  | { readonly ok: true; readonly world: DeepReadonly<World>; readonly diagnostics: readonly Diagnostic[] }
  | { readonly ok: false; readonly diagnostics: readonly Diagnostic[] };

/**
 * Deterministic PRNG port. Implementations must be pure functions of the seed; the same seed and
 * call sequence produce the same values on every platform.
 */
export interface Rng {
  readonly seed: Seed;
  /** Uniform in [0, 1). */
  next(): number;
  int(minInclusive: number, maxInclusive: number): number;
  pick<T>(items: readonly T[]): T;
}

export interface Generator {
  readonly generatorVersion: number;
  generate(request: GenerationRequest): GenerationResult;
}
