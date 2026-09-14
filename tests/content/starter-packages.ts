import { z } from 'zod';
import {
  CONTRACT_VERSION,
  type ComparisonRequest,
  type DeepReadonly,
  type Explanation,
  type GenerationRequest,
  type Option,
  type Question,
  type SourceLocator,
  type TermBinding,
  type World,
  WORLD_SCHEMA_VERSION,
  entityId,
  explanationId,
  questionId,
  ruleId,
  seed,
  sha256,
  sourceId,
  templateId,
  termId,
  topicId,
  worldId,
} from '@ottie/contracts';
import { createDevelopmentGenerator } from '@ottie/scenario-core';
import giveWayScenarioJson from '@ottie/content/scenarios/starter/give-way-t-junction.json';
import stopScenarioJson from '@ottie/content/scenarios/starter/stop-development-access.json';
import signalScenarioJson from '@ottie/content/scenarios/starter/signalised-crossroads-green-right-red.json';
import giveWayQuestionsJson from '@ottie/content/questions/starter/give-way-t-junction.questions.json';
import stopQuestionsJson from '@ottie/content/questions/starter/stop-development-access.questions.json';
import signalQuestionsJson from '@ottie/content/questions/starter/signalised-crossroads-green-right-red.questions.json';

/**
 * Typed reader for the T1 starter packages (content/scenarios/starter, content/questions/starter).
 *
 * The JSON files are the canonical owners of the authored content; this module only shape-checks
 * them against the v1 contracts and brands the IDs. Nothing here promotes review status: every
 * package must carry the literal `reviewStatus: 'development'`.
 *
 * I1 owns the runtime boundary. The intended handoff is to move (not copy-and-fork) these schemas
 * next to `packages/scenario-validation/src/content-data.ts` (or the runtime content loader I1
 * chooses) and to feed `generationRequest()` output into the shared generator; see
 * content/scenarios/starter/README.md for the exact file shapes and remaining integration inputs.
 */

/* ------------------------------------------------------------------------------------------------
 * Shared leaves
 * ---------------------------------------------------------------------------------------------- */

const bbox = z.tuple([z.number(), z.number(), z.number(), z.number()]).readonly();

const locatorSchema = z
  .object({
    sourceId: z.string().transform(sourceId),
    pdfPage: z.number().int().positive().nullable(),
    printedPage: z.string().nullable(),
    drawing: z.string().nullable(),
    drawingRevision: z.string().nullable(),
    bboxPdfPoints: bbox.nullable(),
    bboxDisplayPdfPoints: bbox.nullable().optional(),
    section: z.string().nullable().optional(),
    quote: z.string().nullable().optional(),
  })
  .strict()
  .transform(({ bboxDisplayPdfPoints, section, quote, ...rest }): SourceLocator => ({
    ...rest,
    ...(bboxDisplayPdfPoints === undefined ? {} : { bboxDisplayPdfPoints }),
    ...(section === undefined ? {} : { section }),
    ...(quote === undefined ? {} : { quote }),
  }));

const header = {
  $comment: z.string(),
  contractVersion: z.literal(CONTRACT_VERSION),
  reviewStatus: z.literal('development'),
};

const versionRef = z
  .object({ id: z.string().transform(templateId), version: z.number().int().positive() })
  .strict();

const parameterValue = z.union([z.string(), z.number(), z.boolean()]);

/* ------------------------------------------------------------------------------------------------
 * Scenario package
 * ---------------------------------------------------------------------------------------------- */

const VIEWS = ['plan', 'study_oblique', 'approach_ego', 'entity_detail'] as const;

const pinsSchema = z
  .object({
    generatorVersion: z.number().int().nonnegative(),
    worldSchemaVersion: z.literal(WORLD_SCHEMA_VERSION),
    sourceProfileId: z.string().min(1),
    assetRegistryHash: z.string().transform(sha256),
  })
  .strict();

const authoredWorldSchema = z
  .object({
    worldId: z.string().transform(worldId),
    label: z.string().min(1),
    seed: z.string().transform(seed),
    parameters: z.record(z.string(), parameterValue).readonly(),
    views: z.array(z.enum(VIEWS)).min(1).readonly(),
    /** Canonical hash the generator must reproduce for this request. */
    canonicalHash: z.string().transform(sha256),
    entities: z.record(z.string(), z.string().transform(entityId)).readonly(),
    evidenceIds: z.record(z.string(), z.string()).readonly(),
    notes: z.array(z.string()).readonly(),
  })
  .strict();

const dimensionMm = z.number().nonnegative().nullable();

const assetCandidateSchema = z
  .object({
    entityKey: z.string().min(1),
    runtimeAssetId: z.string().min(1),
    a1CandidateId: z.string().nullable(),
    a2AssemblyId: z.string().nullable(),
    a1CandidateFile: z.string().nullable(),
    a2AssemblyFile: z.string().nullable(),
    sourceDimensionsMm: z.record(z.string(), dimensionMm).readonly(),
    sourceLocator: locatorSchema.nullable(),
    unknowns: z.array(z.string()).readonly(),
    worldDimensionsStatus: z.enum(['sourced', 'partial', 'schematic_unsourced']).nullable(),
  })
  .strict();

const comparisonSchema = z
  .object({
    id: z.string().min(1),
    baseWorldId: z.string().transform(worldId),
    kind: z.enum(['replace_control', 'replay_action', 'swap_actor_class', 'change_signal_state']),
    delta: z.record(z.string(), z.unknown()).readonly(),
    label: z.string().min(1),
    explanationId: z.string().transform(explanationId).nullable(),
    /**
     * Where the comparison world is itself a valid template configuration, the request that
     * regenerates it through the shared generator (separate world id and seed from the base).
     */
    generation: z
      .object({
        worldId: z.string().transform(worldId),
        seed: z.string().transform(seed),
        parameters: z.record(z.string(), parameterValue).readonly(),
        canonicalHash: z.string().transform(sha256),
      })
      .strict()
      .nullable(),
    /** Why no generator request exists (e.g. the delta swaps to a different template's layout). */
    generationNote: z.string().nullable(),
  })
  .strict();

const scenarioPackageSchema = z
  .object({
    ...header,
    schema: z.literal('ottie.starter-scenario-package/1'),
    id: z.string().min(1),
    topicId: z.string().transform(topicId),
    title: z.string().min(1),
    summary: z.string().min(1),
    template: versionRef,
    pins: pinsSchema,
    worlds: z.array(authoredWorldSchema).min(1).readonly(),
    assetCandidates: z.array(assetCandidateSchema).readonly(),
    comparisons: z.array(comparisonSchema).readonly(),
    exclusions: z.array(z.string()).readonly(),
    sourceRefs: z.array(locatorSchema).min(1).readonly(),
    unresolved: z.array(z.string()).readonly(),
  })
  .strict();

export type ScenarioPackage = z.output<typeof scenarioPackageSchema>;
export type AuthoredWorld = ScenarioPackage['worlds'][number];
export type AuthoredComparison = ScenarioPackage['comparisons'][number];
export type AssetCandidateBinding = ScenarioPackage['assetCandidates'][number];

export function parseScenarioPackage(input: unknown): ScenarioPackage {
  return scenarioPackageSchema.parse(input);
}

/** Contract-shaped comparison (drops the T1-only generation fields). */
export function toComparisonRequest(comparison: AuthoredComparison): ComparisonRequest {
  return {
    id: comparison.id,
    baseWorldId: comparison.baseWorldId,
    kind: comparison.kind,
    delta: comparison.delta,
    label: comparison.label,
    explanationId: comparison.explanationId,
  };
}

/** The exact v1 `GenerationRequest` a package world pins; `contentBundle` is null until I1 wires bundles. */
export function generationRequest(pkg: ScenarioPackage, world: AuthoredWorld): GenerationRequest {
  return {
    id: world.worldId,
    schemaVersion: pkg.pins.worldSchemaVersion,
    templateRef: pkg.template,
    seed: world.seed,
    sourceProfileId: pkg.pins.sourceProfileId,
    parameters: world.parameters,
    contentBundle: null,
    views: world.views,
  };
}

export function comparisonGenerationRequest(
  pkg: ScenarioPackage,
  comparison: AuthoredComparison,
): GenerationRequest | null {
  if (!comparison.generation) return null;
  const base = pkg.worlds.find((w) => w.worldId === comparison.baseWorldId);
  return {
    id: comparison.generation.worldId,
    schemaVersion: pkg.pins.worldSchemaVersion,
    templateRef: pkg.template,
    seed: comparison.generation.seed,
    sourceProfileId: pkg.pins.sourceProfileId,
    parameters: comparison.generation.parameters,
    contentBundle: null,
    views: base?.views ?? ['plan'],
  };
}

export interface GeneratedWorld {
  readonly pkg: ScenarioPackage;
  readonly authored: AuthoredWorld;
  readonly world: DeepReadonly<World>;
}

/** Generates every package world with the shared development generator; throws with diagnostics if any request is rejected. */
export function generatePackageWorlds(pkg: ScenarioPackage): readonly GeneratedWorld[] {
  const generator = createDevelopmentGenerator();
  return pkg.worlds.map((authored) => {
    const result = generator.generate(generationRequest(pkg, authored));
    if (!result.ok) {
      throw new Error(
        `${pkg.id}/${authored.worldId} rejected: ${result.diagnostics.map((d) => `${d.code}: ${d.message}`).join('; ')}`,
      );
    }
    return { pkg, authored, world: result.world };
  });
}

/* ------------------------------------------------------------------------------------------------
 * Question package
 * ---------------------------------------------------------------------------------------------- */

const bindingSchema = z
  .discriminatedUnion('role', [
    z
      .object({
        role: z.literal('actual'),
        text: z.string().min(1),
        termId: z.string().transform(termId).nullable(),
        entityId: z.string().transform(entityId),
        evidenceIds: z.array(z.string().min(1)).readonly(),
      })
      .strict(),
    z
      .object({
        role: z.literal('hypothetical'),
        text: z.string().min(1),
        termId: z.string().transform(termId).nullable(),
        comparisonId: z.string().min(1).nullable(),
      })
      .strict(),
    z
      .object({
        role: z.literal('glossary'),
        text: z.string().min(1),
        termId: z.string().transform(termId),
      })
      .strict(),
  ])
  .transform((b): TermBinding => b);

const optionSchema = z
  .object({
    id: z.string().min(1),
    text: z.string().min(1),
    bindings: z.array(bindingSchema).readonly(),
    correct: z.boolean(),
    rationaleExplanationId: z.string().transform(explanationId),
  })
  .strict()
  .transform((o): Option => o);

const questionSchema = z
  .object({
    id: z.string().transform(questionId),
    version: z.number().int().positive(),
    topicId: z.string().transform(topicId),
    worldId: z.string().transform(worldId),
    stem: z.string().min(1),
    stemBindings: z.array(bindingSchema).readonly(),
    options: z.tuple([optionSchema, optionSchema, optionSchema, optionSchema]).readonly(),
    requiredEvidenceIds: z.array(z.string().min(1)).min(1).readonly(),
    answerRule: z
      .object({ ruleId: z.string().transform(ruleId), version: z.number().int().positive() })
      .strict(),
    explanationId: z.string().transform(explanationId),
    sourceRefs: z.array(locatorSchema).min(1).readonly(),
    reviewStatus: z.literal('development'),
    authorship: z.literal('original'),
  })
  .strict()
  .transform((q): Question => q);

const explanationSchema = z
  .object({
    id: z.string().transform(explanationId),
    ruleIds: z.array(z.string().transform(ruleId)).min(1).readonly(),
    paragraphs: z.array(z.string().min(1)).min(1).readonly(),
    termIds: z.array(z.string().transform(termId)).readonly(),
    sourceRefs: z.array(locatorSchema).min(1).readonly(),
  })
  .strict()
  .transform((e): Explanation => e);

const questionPackageSchema = z
  .object({
    ...header,
    schema: z.literal('ottie.starter-question-package/1'),
    id: z.string().min(1),
    scenarioPackageId: z.string().min(1),
    topicId: z.string().transform(topicId),
    explanations: z.array(explanationSchema).min(1).readonly(),
    questions: z.array(questionSchema).min(1).readonly(),
  })
  .strict();

export type QuestionPackage = z.output<typeof questionPackageSchema>;

export function parseQuestionPackage(input: unknown): QuestionPackage {
  return questionPackageSchema.parse(input);
}

/* ------------------------------------------------------------------------------------------------
 * The committed starter packages
 * ---------------------------------------------------------------------------------------------- */

export interface StarterPackagePair {
  readonly scenario: ScenarioPackage;
  readonly questions: QuestionPackage;
}

let cached: readonly StarterPackagePair[] | null = null;

/** Every committed T1 package, parsed once. Throws if a file no longer matches the v1 shapes. */
export function loadStarterPackages(): readonly StarterPackagePair[] {
  cached ??= [
    { scenario: parseScenarioPackage(giveWayScenarioJson), questions: parseQuestionPackage(giveWayQuestionsJson) },
    { scenario: parseScenarioPackage(stopScenarioJson), questions: parseQuestionPackage(stopQuestionsJson) },
    { scenario: parseScenarioPackage(signalScenarioJson), questions: parseQuestionPackage(signalQuestionsJson) },
  ];
  return cached;
}
