/**
 * @ottie/starter-content — I1 owns this module.
 *
 * The runtime content boundary: T1's committed scenario/question packages, the exact C1 registry
 * closure they depend on, the C2 generator wired to that closure, pinned world generation with
 * canonical-hash verification, the comparison applier and the V1-validated content set the lesson,
 * tests and the H1 review CLI all load. Browser-safe: no filesystem, no node:crypto. Writing the
 * closure/pins lives in `./closure.node`.
 */
export {
  type AssetCandidateBinding,
  type AuthoredComparison,
  type AuthoredWorld,
  type GeneratedWorld,
  type QuestionPackage,
  type ScenarioPackage,
  type StarterPackagePair,
  StarterContentError,
  comparisonGenerationRequest,
  generatePackageWorlds,
  generatePinnedWorld,
  generationRequest,
  loadStarterPackages,
  parseQuestionPackage,
  parseScenarioPackage,
  toComparisonRequest,
} from './packages';
export { STARTER_CLOSURE_SCHEMA, type StarterClosure, closureHashOf, createClosureResolver, parseStarterClosure, projectClosure } from './closure';
export { loadStarterClosure } from './closure-data';
export { createStarterGenerator } from './generator';
export { type ComparisonApplication, type ComparisonRefusalReason, applyComparison, comparisonIsApplicable } from './comparisons';
export {
  STARTER_BUNDLE_ID,
  STARTER_BUNDLE_VERSION,
  type ComparisonOutcome,
  type LoadStarterContentOptions,
  type LoadedScenario,
  type StarterContentSet,
  loadStarterContentSet,
  mergeSourceRecords,
} from './load';
