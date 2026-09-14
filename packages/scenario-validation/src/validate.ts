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

export interface NamedValidator<T> {
  readonly name: ValidatorName;
  readonly run: Validator<T>;
}

/** Validators a world must pass before it can leave development status. `camera_evidence` belongs to R2. */
export const REQUIRED_WORLD_VALIDATORS: readonly ValidatorName[] = VALIDATOR_NAMES.filter((name) => name !== 'camera_evidence');

/** V1 fills this list. Empty in F0: no semantic validation happens. */
export const SEMANTIC_VALIDATORS: readonly NamedValidator<DeepReadonly<World>>[] = [];

export function validateWorld(world: DeepReadonly<World>): ValidationReport {
  const diagnostics: Diagnostic[] = [...checkWorldStructure(world)];
  const validatorsRun: ValidatorName[] = ['structural_integrity'];
  for (const validator of SEMANTIC_VALIDATORS) {
    diagnostics.push(...validator.run(world));
    validatorsRun.push(validator.name);
  }
  return summariseReport(diagnostics, validatorsRun);
}

/** Required validators that did not run; non-empty means the report is not a semantic pass. */
export function missingValidators(report: ValidationReport): readonly ValidatorName[] {
  return REQUIRED_WORLD_VALIDATORS.filter((name) => !report.validatorsRun.includes(name));
}

export function validateQuestion(question: Question, world: DeepReadonly<World>): ValidationReport {
  return summariseReport(checkQuestionStructure(question, world), ['structural_integrity']);
}
