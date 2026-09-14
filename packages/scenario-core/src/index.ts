/**
 * @ottie/scenario-core — C2 owns this module (templates, seeded generation, safe variation).
 *
 * One semantic world is generated deterministically from (template@version, seed, parameters):
 * directed lanes, semantic anchors, movements with authored priority/conflict/yield relationships,
 * controls, actors, evidence and camera presets, then deeply frozen with provenance and a canonical
 * hash. Presentation state (views, cameras, attempts) never reaches generation.
 */
export { MODULE_STATUS } from './status';
export { createSeededRng } from './rng';
export { GENERATOR_VERSION, TEMPLATE_LAYOUTS, createTemplateGenerator, type TemplateGeneratorOptions } from './generator';
export { createDevelopmentGenerator } from './development';
export { canonicalWorldJson, computeCanonicalHash, verifyCanonicalHash } from './canonical';
export { sha256Hex } from './sha256';
export { resolveParameters, type ParameterResolution, type ResolvedParameters } from './parameters';
export { SAFE_VARIATION_FIELDS, drawSafeVariation, type SafeVariationDraw } from './variation';
export { deriveHeadSignalState, type HeadSignalInput, type HeadSignalState } from './signals';
export { checkLaneConnectivity, checkMovementPriorityConsistency } from './priority';
export { rotateWorldQuarterTurns } from './rotate-world';
export {
  type QuarterTurns,
  type RoadFrame,
  buildStraightRoad,
  directionOf,
  laneLength,
  pointAlongLane,
  quarterTurnsBetween,
  rotateHeading,
  rotateVec3,
  straightPath,
  turnPath,
} from './geometry';
export { type LayoutInput, type LayoutResult, type TemplateLayout, type WorldBody } from './layouts/shared';
