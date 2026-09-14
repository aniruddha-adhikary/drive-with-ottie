import {
  type DeepReadonly,
  type Diagnostic,
  type Question,
  type ValidationReport,
  type Validator,
  type ValidatorName,
  type World,
  VALIDATOR_NAMES,
  checkQuestionStructure,
  checkWorldStructure,
  summariseReport,
} from '@ottie/contracts';
import {
  type ValidationContext,
  type ValidationContextOverrides,
  createValidationContext,
} from './context';
import { approachFacing } from './validators/approach-facing';
import { cameraEvidence, checkCameraExposure } from './validators/camera-evidence';
import { controlCompleteness } from './validators/control-completeness';
import { laneTopology } from './validators/lane-topology';
import { markingContext } from './validators/marking-context';
import { mountIntegrity } from './validators/mount-integrity';
import { checkQuestionEvidence, questionEvidence } from './validators/question-evidence';
import { signalMovements } from './validators/signal-movements';
import { sourceApplicability } from './validators/source-applicability';
import { checkStateInvariance, stateInvariance } from './validators/state-invariance';
import { type SemanticValidator, WorldIndex } from './world-index';

export interface NamedValidator<T> {
  readonly name: ValidatorName;
  readonly run: Validator<T>;
}

/**
 * Every validator a world must pass before it can leave development status. `camera_evidence` is
 * included for its STATIC half (declared exposure, co-visibility, sight lines); R2's runtime
 * projection checks run behind the frozen camera port and are reported separately by R2.
 */
export const REQUIRED_WORLD_VALIDATORS: readonly ValidatorName[] = VALIDATOR_NAMES.filter(
  (name) => name !== 'structural_integrity',
);

const FAMILIES: readonly SemanticValidator[] = [
  sourceApplicability,
  laneTopology,
  markingContext,
  controlCompleteness,
  mountIntegrity,
  approachFacing,
  signalMovements,
  questionEvidence,
  cameraEvidence,
  stateInvariance,
];

function bind(
  validator: SemanticValidator,
  ctx: ValidationContext,
): NamedValidator<DeepReadonly<World>> {
  return { name: validator.name, run: (world) => validator.run(new WorldIndex(world, ctx)) };
}

/** Semantic validators bound to the development context (quarantined fixture assets, A3 starter content). */
export const SEMANTIC_VALIDATORS: readonly NamedValidator<DeepReadonly<World>>[] = FAMILIES.map(
  (validator) => bind(validator, createValidationContext()),
);

/** The same families bound to an explicit context (e.g. `{ target: 'learner_release' }`). */
export function semanticValidators(
  overrides: ValidationContextOverrides = {},
): readonly NamedValidator<DeepReadonly<World>>[] {
  const ctx = createValidationContext(overrides);
  return FAMILIES.map((validator) => bind(validator, ctx));
}

export function validateWorld(
  world: DeepReadonly<World>,
  overrides?: ValidationContextOverrides,
): ValidationReport {
  const diagnostics: Diagnostic[] = [...checkWorldStructure(world)];
  const validatorsRun: ValidatorName[] = ['structural_integrity'];
  const ctx = createValidationContext(overrides);
  const index = new WorldIndex(world, ctx);
  for (const validator of FAMILIES) {
    diagnostics.push(...validator.run(index));
    validatorsRun.push(validator.name);
  }
  return summariseReport(diagnostics, validatorsRun);
}

/** Required validators that did not run; non-empty means the report is not a semantic pass. */
export function missingValidators(report: ValidationReport): readonly ValidatorName[] {
  return REQUIRED_WORLD_VALIDATORS.filter((name) => !report.validatorsRun.includes(name));
}

/**
 * Structural question checks plus the question-level halves of `question_evidence` (bindings,
 * required evidence, answer rule) and `camera_evidence` (static exposure of the required evidence).
 * The world itself is assumed to have been validated with `validateWorld`.
 */
export function validateQuestion(
  question: Question,
  world: DeepReadonly<World>,
  overrides?: ValidationContextOverrides,
): ValidationReport {
  const ctx = createValidationContext(overrides);
  const index = new WorldIndex(world, ctx);
  const diagnostics: Diagnostic[] = [
    ...checkQuestionStructure(question, world),
    ...checkQuestionEvidence(index, question),
    ...checkCameraExposure(index, question.requiredEvidenceIds),
  ];
  return summariseReport(diagnostics, [
    'structural_integrity',
    'question_evidence',
    'camera_evidence',
  ]);
}

/**
 * A presentation-only change (camera moved, view chosen) must leave every semantic field of the
 * world identical. Returns a report over `state_invariance` only.
 */
export function validatePresentationChange(
  base: DeepReadonly<World>,
  candidate: DeepReadonly<World>,
): ValidationReport {
  return summariseReport(checkStateInvariance(base, candidate), ['state_invariance']);
}
