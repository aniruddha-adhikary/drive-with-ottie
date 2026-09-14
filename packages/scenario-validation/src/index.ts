/**
 * @ottie/scenario-validation — V1 owns this module.
 *
 * Ten semantic validator families over the immutable World (docs/SCENARIO-SYSTEM.md):
 * source_applicability, lane_topology, marking_context, control_completeness, mount_integrity,
 * approach_facing, signal_movements, question_evidence, camera_evidence (static declarations and
 * sight lines only) and state_invariance. `validateWorld` runs the structural checks from
 * @ottie/contracts plus every family against a C1 asset resolver and the A3 source-backed content;
 * `validateQuestion` adds the question-level halves of question_evidence and camera_evidence;
 * `validatePresentationChange` compares a world before/after a presentation-only change.
 *
 * Validation is semantic correctness only. Passing here grants no source, content, reuse or
 * release approval: the `learner_release` target simply refuses anything the registry has not
 * already approved, and runtime camera projection/readability checks remain R2's implementation
 * behind the frozen camera port. Acceptance corpus: `packages/contracts/src/fixtures/mutations.ts`
 * plus this module's own mutation cases in `test/`.
 */
export { MODULE_STATUS } from './status';
export {
  validateWorld,
  validateQuestion,
  validatePresentationChange,
  missingValidators,
  semanticValidators,
  SEMANTIC_VALIDATORS,
  REQUIRED_WORLD_VALIDATORS,
  type NamedValidator,
} from './validate';
export {
  createValidationContext,
  developmentAssetResolver,
  releaseAssetResolver,
  type ValidationContext,
  type ValidationContextOverrides,
  type ValidationTarget,
} from './context';
export { loadStarterContent, parseStarterContent, type StarterContent } from './content-data';
export { checkStateInvariance } from './validators/state-invariance';
export { checkQuestionEvidence } from './validators/question-evidence';
export { checkCameraExposure } from './validators/camera-evidence';
export { WorldIndex, type SemanticValidator } from './world-index';
