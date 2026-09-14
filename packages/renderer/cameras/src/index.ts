/**
 * @ottie/renderer-cameras — R2 owns this module (camera presets, view fitting, evidence visibility).
 *
 * F0 provides `presetToThreeCamera`, which builds a Three.js camera from a World `CameraPreset`
 * with +Z up and no side effects on the world. Evidence visibility evaluation is NOT implemented.
 */
export { MODULE_STATUS } from './status';
export { presetToThreeCamera } from './preset';
