import { type Brand } from './units';

/**
 * Stable identifiers. IDs are authored (never derived from array position or render order) and
 * survive regeneration with the same template/version/seed/parameters.
 */
export type SourceId = Brand<string, 'SourceId'>;
/** Extraction-library asset ID, e.g. `sg.mandatory.give-way`. */
export type AssetId = Brand<string, 'AssetId'>;
export type AssemblyDefinitionId = Brand<string, 'AssemblyDefinitionId'>;
export type TemplateId = Brand<string, 'TemplateId'>;
export type WorldId = Brand<string, 'WorldId'>;
/** Any world entity: road, lane, anchor, marking, assembly, actor, signal head, controller. */
export type EntityId = Brand<string, 'EntityId'>;
export type RoadId = Brand<string, 'RoadId'>;
export type LaneId = Brand<string, 'LaneId'>;
export type AnchorId = Brand<string, 'AnchorId'>;
export type MovementId = Brand<string, 'MovementId'>;
export type QuestionId = Brand<string, 'QuestionId'>;
export type TermId = Brand<string, 'TermId'>;
export type RuleId = Brand<string, 'RuleId'>;
export type EvidenceId = Brand<string, 'EvidenceId'>;
export type ExplanationId = Brand<string, 'ExplanationId'>;
export type TopicId = Brand<string, 'TopicId'>;
export type RunId = Brand<string, 'RunId'>;
export type AttemptId = Brand<string, 'AttemptId'>;
export type EventId = Brand<string, 'EventId'>;
export type Seed = Brand<string, 'Seed'>;
export type Sha256 = Brand<string, 'Sha256'>;

export const ASSET_ID_PATTERN = /^sg\.[a-z]+\.[a-z0-9][a-z0-9.-]*$/;
export const SHA256_PATTERN = /^[a-f0-9]{64}$/;
/** Lower-case dotted/kebab identifier for authored IDs (roads, lanes, anchors, questions ...). */
export const STABLE_ID_PATTERN = /^[a-z0-9][a-z0-9._-]*$/;

// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- T selects the brand of the returned constructor
function branded<T extends string>(pattern: RegExp, label: string): (value: string) => T {
  return (value: string): T => {
    if (!pattern.test(value)) {
      throw new RangeError(`${label} "${value}" does not match ${pattern.source}`);
    }
    return value as T;
  };
}

export const sourceId = branded<SourceId>(/^[A-Za-z0-9][A-Za-z0-9._-]*$/, 'SourceId');
export const assetId = branded<AssetId>(ASSET_ID_PATTERN, 'AssetId');
export const assemblyDefinitionId = branded<AssemblyDefinitionId>(
  /^sg\.assemblies\.definition\.[a-z0-9][a-z0-9.-]*$/,
  'AssemblyDefinitionId',
);
export const templateId = branded<TemplateId>(STABLE_ID_PATTERN, 'TemplateId');
export const worldId = branded<WorldId>(STABLE_ID_PATTERN, 'WorldId');
export const entityId = branded<EntityId>(STABLE_ID_PATTERN, 'EntityId');
export const roadId = branded<RoadId>(STABLE_ID_PATTERN, 'RoadId');
export const laneId = branded<LaneId>(STABLE_ID_PATTERN, 'LaneId');
export const anchorId = branded<AnchorId>(STABLE_ID_PATTERN, 'AnchorId');
export const movementId = branded<MovementId>(STABLE_ID_PATTERN, 'MovementId');
export const questionId = branded<QuestionId>(STABLE_ID_PATTERN, 'QuestionId');
export const termId = branded<TermId>(STABLE_ID_PATTERN, 'TermId');
export const ruleId = branded<RuleId>(STABLE_ID_PATTERN, 'RuleId');
export const evidenceId = branded<EvidenceId>(STABLE_ID_PATTERN, 'EvidenceId');
export const explanationId = branded<ExplanationId>(STABLE_ID_PATTERN, 'ExplanationId');
export const topicId = branded<TopicId>(STABLE_ID_PATTERN, 'TopicId');
export const runId = branded<RunId>(/^[A-Za-z0-9][A-Za-z0-9._-]*$/, 'RunId');
export const attemptId = branded<AttemptId>(/^[A-Za-z0-9][A-Za-z0-9._-]*$/, 'AttemptId');
export const eventId = branded<EventId>(/^[A-Za-z0-9][A-Za-z0-9._-]*$/, 'EventId');
export const seed = branded<Seed>(/^[A-Za-z0-9][A-Za-z0-9._-]*$/, 'Seed');
export const sha256 = branded<Sha256>(SHA256_PATTERN, 'Sha256');

/** Semantic version reference for assets, templates, generators and content bundles. */
export interface VersionRef {
  readonly id: string;
  readonly version: number;
}

export interface AssetRef extends VersionRef {
  readonly id: AssetId;
}

export interface TemplateRef extends VersionRef {
  readonly id: TemplateId;
}

/**
 * Reproducibility key: everything that must be equal for two generated worlds to be byte-identical
 * after `canonicalJson`. The asset registry hash pins the exact resolved asset set.
 */
export interface ReproducibilityKey {
  readonly generatorVersion: number;
  readonly worldSchemaVersion: number;
  readonly template: TemplateRef;
  readonly seed: Seed;
  readonly assetRegistryHash: Sha256;
  readonly sourceProfileId: string;
}
