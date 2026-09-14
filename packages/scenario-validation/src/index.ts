/**
 * @ottie/scenario-validation — V1 owns this module.
 *
 * Semantic validators (control_completeness, mount_integrity, approach_facing, signal_movements,
 * marking_context, lane_topology, source_applicability, question_evidence, state_invariance) are
 * NOT implemented here yet. `validateWorld` runs only the structural checks from @ottie/contracts
 * and lists just `structural_integrity` in `validatorsRun`, so a passing report is never mistaken
 * for semantic approval (`missingValidators` names what has not run). V1 registers real validators
 * in `SEMANTIC_VALIDATORS`; acceptance is `packages/contracts/src/fixtures/mutations.ts`.
 */
export { MODULE_STATUS } from './status';
export { validateWorld, validateQuestion, missingValidators, SEMANTIC_VALIDATORS, REQUIRED_WORLD_VALIDATORS } from './validate';
