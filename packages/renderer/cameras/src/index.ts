/**
 * @ottie/renderer-cameras — R2: camera presets, view fitting and evidence visibility over the real
 * R1 scene (`buildWorldScene` / `createWorldRenderer().scene`).
 *
 * - `presetToThreeCamera` builds a Three.js camera from a World `CameraPreset` (+Z up, no side effects).
 * - `fitView` tries the authored preset, then bounded presentation-only adjustments, and links a
 *   labelled `entity_detail` close-up to the real entity when a main view shows it in place but not
 *   readably. `detailGate` is the Enlarge gate. `checkEvidenceExposure` decides whether required
 *   evidence is shown by the world's presets at all (`required_evidence_not_exposed` / `only_in_enlarge`).
 * - `createCameraPort` implements the `CameraPort` contract; `cameraMatrices` exports plain
 *   column-major matrices for review tooling.
 *
 * Physical controls are never rotated toward the camera and the World is never mutated.
 */
export { MODULE_STATUS } from './status';
export { presetToThreeCamera } from './preset';
export {
  WORLD_UP,
  NORTH,
  type ViewBasis,
  type OrthographicFit,
  type PerspectiveFit,
  type PresetSpec,
  basisFor,
  fitOrthographic,
  fitPerspective,
  makePreset,
  presetSpec,
  obliqueDirection,
  yawDirection,
  azimuthOf,
  elevationOf,
} from './framing';
export {
  FIT_TUNING,
  type FitCandidate,
  type CandidateRequest,
  candidatesFor,
  detailCandidates,
  framingPoints,
  authoredPreset,
  allowedEvidenceIds,
  egoActor,
} from './candidates';
export { type FitOptions, type LinkedDetail, type ViewFitReport, detailGate, fitView } from './fit';
export { type EvidenceExposure, type ExposureReport, checkEvidenceExposure } from './exposure';
export {
  type CameraMatrices,
  type CameraEvidenceExport,
  cameraMatrices,
  exportCameraEvidence,
} from './export';
export { type EvidenceCameraPort, type SceneSource, createCameraPort } from './port';
