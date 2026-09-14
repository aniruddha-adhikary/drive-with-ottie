/**
 * @ottie/scenario-core — C2 owns this module (templates, seeded generation, safe variation).
 *
 * F0 provides the deterministic seeded RNG the `Rng` port requires and a generator that returns
 * the hand-authored fixtures for their template IDs so downstream modules can integrate before real
 * generation exists. It performs no variation.
 */
export { MODULE_STATUS } from './status';
export { createSeededRng } from './rng';
export { createFixtureGenerator } from './fixture-generator';
