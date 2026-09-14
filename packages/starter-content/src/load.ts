import {
  type AssetResolver,
  type ContentBundle,
  type DeepReadonly,
  type Generator,
  type Question,
  type SourceRef,
  type Topic,
  type World,
  type WorldId,
  freezeDeep,
  topicId,
} from '@ottie/contracts';
import { DEVELOPMENT_TEMPLATES } from '@ottie/contracts/fixtures';
import { type StarterContent, type ValidationContextOverrides, loadStarterContent, validateQuestion, validateWorld } from '@ottie/scenario-validation';
import { type StarterClosure, createClosureResolver } from './closure';
import { loadStarterClosure } from './closure-data';
import { type ComparisonApplication, applyComparison, comparisonIsApplicable } from './comparisons';
import { createStarterGenerator } from './generator';
import {
  type AuthoredComparison,
  type GeneratedWorld,
  type QuestionPackage,
  type ScenarioPackage,
  type StarterPackagePair,
  StarterContentError,
  comparisonGenerationRequest,
  generatePackageWorlds,
  generatePinnedWorld,
  loadStarterPackages,
  toComparisonRequest,
} from './packages';

/**
 * A comparison the lesson can offer. `world` is always a separate frozen world (never the base) and
 * `validation` is the V1 report for it; `unavailable` comparisons keep their reason visible so no
 * comparison ever shows up as a dead button or an invalid phase rendered as if it were correct.
 */
export type ComparisonOutcome =
  | {
      readonly kind: 'available';
      readonly comparison: AuthoredComparison;
      readonly world: DeepReadonly<World>;
      readonly source: 'generated' | 'applied';
    }
  | {
      readonly kind: 'unavailable';
      readonly comparison: AuthoredComparison;
      readonly reason: 'unsupported_phase' | 'validation_errors' | 'applier_refused' | 'not_applicable';
      readonly detail: string;
    };

export interface LoadedScenario {
  readonly scenario: ScenarioPackage;
  readonly questions: QuestionPackage;
  readonly worlds: readonly GeneratedWorld[];
  readonly comparisons: readonly ComparisonOutcome[];
}

export interface StarterContentSet {
  readonly closure: StarterClosure;
  readonly resolver: AssetResolver;
  readonly generator: Generator;
  readonly official: StarterContent;
  /** A3 official sources followed by C1 registry source records the assets actually cite. */
  readonly sources: readonly SourceRef[];
  readonly validation: ValidationContextOverrides;
  readonly scenarios: readonly LoadedScenario[];
  /** Every renderable world: pinned bases, pinned generated comparisons, applied comparisons. */
  readonly worlds: ReadonlyMap<WorldId, DeepReadonly<World>>;
  readonly bundle: ContentBundle;
}

export interface LoadStarterContentOptions {
  readonly closure?: StarterClosure;
  readonly packages?: readonly StarterPackagePair[];
}

const TOPIC_TEXT: Readonly<Record<string, { readonly label: string; readonly description: string }>> = {
  'junction-priority': { label: 'Who goes first at junctions', description: 'Give Way and STOP controls at minor and access roads.' },
  'traffic-signals': { label: 'Reading traffic lights', description: 'Circular and arrow aspects and what each one controls.' },
};

export const STARTER_BUNDLE_ID = 'starter.sg-btt' as const;
export const STARTER_BUNDLE_VERSION = 1 as const;

/** Merges A3 official source records with C1 registry source records; identical ids must agree byte-for-byte. */
export function mergeSourceRecords(official: readonly SourceRef[], registry: readonly SourceRef[]): readonly SourceRef[] {
  const byId = new Map<string, SourceRef>();
  for (const source of official) byId.set(source.id, source);
  for (const source of registry) {
    const existing = byId.get(source.id);
    if (existing && existing.sha256 !== source.sha256) {
      throw new StarterContentError('source_conflict', `source ${source.id} has sha256 ${existing.sha256} in A3 but ${source.sha256} in the C1 registry`, {
        sourceId: source.id,
        official: existing.sha256,
        registry: source.sha256,
      });
    }
    if (!existing) byId.set(source.id, source);
  }
  return [...byId.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

function verifyPins(pkg: ScenarioPackage, closure: StarterClosure, generator: Generator): void {
  if (pkg.pins.assetRegistryHash !== closure.registryHash) {
    throw new StarterContentError(
      'registry_hash_mismatch',
      `${pkg.id} pins asset registry ${pkg.pins.assetRegistryHash} but the runtime closure was compiled from registry ${closure.registryHash}; regenerate the pins with \`npm run review:export -- pins --write\` and review the diff`,
      { packageId: pkg.id, pinned: pkg.pins.assetRegistryHash, runtime: closure.registryHash },
    );
  }
  if (pkg.pins.generatorVersion !== generator.generatorVersion) {
    throw new StarterContentError('pin_mismatch', `${pkg.id} pins generator v${pkg.pins.generatorVersion} but the runtime generator is v${generator.generatorVersion}`, {
      packageId: pkg.id,
      pinned: pkg.pins.generatorVersion,
      runtime: generator.generatorVersion,
    });
  }
  if (!DEVELOPMENT_TEMPLATES.some((t) => t.id === pkg.template.id && t.version === pkg.template.version)) {
    throw new StarterContentError('pin_mismatch', `${pkg.id} uses template ${pkg.template.id}@${pkg.template.version}, which the runtime generator does not provide`, {
      packageId: pkg.id,
      template: pkg.template,
    });
  }
}

function resolveComparison(
  pkg: ScenarioPackage,
  comparison: AuthoredComparison,
  bases: ReadonlyMap<WorldId, DeepReadonly<World>>,
  generator: Generator,
  resolver: AssetResolver,
  validation: ValidationContextOverrides,
): ComparisonOutcome {
  const base = bases.get(comparison.baseWorldId);
  if (!base) {
    throw new StarterContentError('world_missing', `${comparison.id} compares against ${comparison.baseWorldId}, which ${pkg.id} does not author`, {
      comparisonId: comparison.id,
      baseWorldId: comparison.baseWorldId,
    });
  }
  let world: DeepReadonly<World>;
  let source: 'generated' | 'applied';
  const request = comparisonGenerationRequest(pkg, comparison);
  if (request && comparison.generation) {
    world = generatePinnedWorld(generator, request, comparison.generation.canonicalHash, `${pkg.id}/${comparison.id}`);
    source = 'generated';
  } else if (comparisonIsApplicable(comparison)) {
    const applied: ComparisonApplication = applyComparison(base, comparison, resolver);
    if (!applied.ok) return { kind: 'unavailable', comparison, reason: 'applier_refused', detail: `${applied.reason}: ${applied.detail}` };
    world = applied.world;
    source = 'applied';
  } else {
    return { kind: 'unavailable', comparison, reason: 'not_applicable', detail: comparison.generationNote ?? `${comparison.kind} has no generated world and no applier` };
  }
  const report = validateWorld(world, validation);
  if (!report.ok) {
    const errors = report.diagnostics.filter((d) => d.severity === 'error');
    const unsupported = errors.some((d) => d.code === 'unsupported_phase_combination');
    return {
      kind: 'unavailable',
      comparison,
      reason: unsupported ? 'unsupported_phase' : 'validation_errors',
      detail: errors.map((d) => `${d.validator}.${d.code}: ${d.message}`).join('; '),
    };
  }
  return { kind: 'available', comparison, world, source };
}

/**
 * Loads, generates and validates the whole starter content set through the runtime boundary:
 * committed registry closure -> resolver -> C2 generator -> pinned worlds -> V1 with A3 + C1 sources.
 * Throws `StarterContentError` on any pin/hash/source mismatch instead of degrading silently.
 */
export function loadStarterContentSet(options: LoadStarterContentOptions = {}): StarterContentSet {
  const closure = options.closure ?? loadStarterClosure();
  const packages = options.packages ?? loadStarterPackages();
  const resolver = createClosureResolver(closure);
  const generator = createStarterGenerator(resolver);
  const official = loadStarterContent();
  const sources = mergeSourceRecords(official.sources, closure.sources);
  const validation: ValidationContextOverrides = { target: 'development', assets: resolver, sources, rules: official.rules, terms: official.terms };

  const worlds = new Map<WorldId, DeepReadonly<World>>();
  const scenarios: LoadedScenario[] = packages.map(({ scenario, questions }) => {
    verifyPins(scenario, closure, generator);
    const generated = generatePackageWorlds(scenario, generator);
    const bases = new Map<WorldId, DeepReadonly<World>>(generated.map((g) => [g.world.id, g.world]));
    for (const g of generated) {
      const report = validateWorld(g.world, validation);
      if (!report.ok) {
        throw new StarterContentError('generation_rejected', `${scenario.id}/${g.world.id} fails V1: ${report.diagnostics.filter((d) => d.severity === 'error').map((d) => `${d.validator}.${d.code}`).join(', ')}`, {
          worldId: g.world.id,
          diagnostics: report.diagnostics.filter((d) => d.severity === 'error'),
        });
      }
      worlds.set(g.world.id, g.world);
    }
    const comparisons = scenario.comparisons.map((c) => resolveComparison(scenario, c, bases, generator, resolver, validation));
    for (const c of comparisons) if (c.kind === 'available') worlds.set(c.world.id, c.world);
    return { scenario, questions, worlds: generated, comparisons };
  });

  const questions: Question[] = scenarios.flatMap((s) => [...s.questions.questions]);
  for (const question of questions) {
    const world = worlds.get(question.worldId);
    if (!world) throw new StarterContentError('world_missing', `${question.id} binds to ${question.worldId}, which no package generated`, { questionId: question.id });
    const report = validateQuestion(question, world, validation);
    if (!report.ok) {
      throw new StarterContentError('generation_rejected', `${question.id} fails V1 question_evidence: ${report.diagnostics.filter((d) => d.severity === 'error').map((d) => d.code).join(', ')}`, {
        questionId: question.id,
        diagnostics: report.diagnostics.filter((d) => d.severity === 'error'),
      });
    }
  }

  const topicIds = [...new Set(scenarios.map((s) => s.questions.topicId as string))].sort();
  const topics: Topic[] = topicIds.map((id) => {
    const text = TOPIC_TEXT[id] ?? { label: id, description: '' };
    const topicQuestions = questions.filter((q) => (q.topicId as string) === id);
    const termIds = [...new Set(topicQuestions.flatMap((q) => [...q.stemBindings, ...q.options.flatMap((o) => o.bindings)].flatMap((b) => (b.termId ? [b.termId] : []))))];
    return { id: topicId(id), label: text.label, description: text.description, questionIds: topicQuestions.map((q) => q.id), termIds };
  });

  const bundle: ContentBundle = freezeDeep({
    id: STARTER_BUNDLE_ID,
    version: STARTER_BUNDLE_VERSION,
    topics,
    questions,
    terms: official.terms,
    rules: official.rules,
    explanations: scenarios.flatMap((s) => [...s.questions.explanations]),
    comparisons: scenarios.flatMap((s) => s.scenario.comparisons.map(toComparisonRequest)),
    worldIds: [...worlds.keys()],
    reviewStatus: 'development',
  });

  return { closure, resolver, generator, official, sources, validation, scenarios, worlds, bundle };
}
