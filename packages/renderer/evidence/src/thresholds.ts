/**
 * Presentation thresholds used by the evidence checks. None of these is a source value: they are
 * teaching-layout choices about what a learner can read on screen, recorded here so review output
 * can list them. Per-requirement limits (occlusion fraction, minimum projected size, allowed views)
 * always come from the World's EvidenceRequirement, never from this table.
 */
export const EVIDENCE_THRESHOLDS = Object.freeze({
  /** A face or lens is readable only while the viewer is within this angle of its front normal. */
  frontFacingMaxAngleDeg: 70,
  /** Grid size (per axis) of sample points laid over a face panel. */
  faceSampleGrid: 5,
  /** Sample points sit this far in front of the physical surface so the surface itself is not hit. */
  surfaceOffsetM: 0.01,
  /** Arc-length spacing of samples along lanes, roads and movement paths. */
  linearSampleSpacingM: 1,
  /** Only the stretch of a linear feature within this radius of the evidence focus is judged. */
  linearFocusRadiusM: 12,
  /** A linear feature counts as shown once at least this much of its judged stretch is on screen. */
  minVisibleLinearLengthM: 6,
  /** Shorter linear features must show at least this share of their judged length. */
  linearVisibleFraction: 0.8,
  /** Below this projected row pitch the rows of a marking cannot be counted. */
  minRowPitchPx: 2,
  /** Orthographic occlusion rays start this far toward the viewer from the sample. */
  orthographicRayStartM: 200,
} as const);

export type EvidenceThresholdKey = keyof typeof EVIDENCE_THRESHOLDS;
