/**
 * @ottie/renderer-evidence — R2 owns this module (evidence visibility, linked-detail labels).
 *
 * Pure analysis over R1's built WorldScene: projection into the safe viewport rectangle, sampling
 * of the geometry actually drawn, physical front-facing checks, ray-cast occlusion against other
 * physical meshes, projected readable size in CSS px, road-context and co-visibility rules, all
 * reported as `camera_evidence.*` Diagnostics. The scene, world and presets are only read; no
 * sign or signal is ever turned toward the camera. Highlights, callouts and comparison overlays
 * are not implemented here (see MODULE_STATUS).
 */
export { MODULE_STATUS } from './status';
export { EVIDENCE_THRESHOLDS, type EvidenceThresholdKey } from './thresholds';
export {
  CAMERA_EVIDENCE_CODES,
  type CameraEvidenceCode,
  cameraDiagnostic,
  hasErrors,
} from './diagnostics';
export {
  type CameraFrame,
  type ProjectedPoint,
  type SafeNdc,
  type SafeRect,
  type SceneCamera,
  type ScreenExtent,
  cameraFrame,
  plainVec,
  projectPoint,
  projectPoints,
  round,
  safeNdc,
  safeRect,
  screenExtent,
  towardViewer,
} from './projection';
export {
  type EntitySamples,
  boxCorners,
  facePanelCorners,
  focusOf,
  lensSamples,
  resamplePolyline,
  sampleEntity,
} from './samples';
export {
  type FacingEntity,
  type FacingEvaluation,
  evaluateFacing,
  facingReferencePoint,
  isFacingEntity,
} from './facing';
export {
  type OccluderIndex,
  type OcclusionMeasure,
  entitiesContaining,
  indexOccluders,
  measureOcclusion,
} from './occlusion';
export {
  type ContextAnchorVisibility,
  type EvidenceEvaluation,
  type TargetVisibility,
  type ViewContext,
  createViewContext,
  evaluateEvidence,
  evaluateView,
} from './visibility';
export { describeEntity, describeView, linkedDetailLabel } from './labels';
