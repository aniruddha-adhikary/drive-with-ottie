import { type Diagnostic, type DiagnosticSeverity } from '@ottie/contracts';

/** Stable `camera_evidence.*` codes emitted by R2. Review tooling may key on these. */
export const CAMERA_EVIDENCE_CODES = Object.freeze({
  requirementUnknown: 'camera_evidence.evidence_requirement_unknown',
  targetMissing: 'camera_evidence.evidence_target_missing',
  viewNotAllowed: 'camera_evidence.view_not_allowed',
  clipped: 'camera_evidence.required_evidence_clipped',
  occluded: 'camera_evidence.required_evidence_occluded',
  tooSmall: 'camera_evidence.required_evidence_too_small',
  notFrontFacing: 'camera_evidence.required_evidence_not_front_facing',
  facingDeclarationMismatch: 'camera_evidence.facing_declaration_mismatch',
  faceAwayFromApproach: 'camera_evidence.face_away_from_intended_approach',
  faceArtworkUnavailable: 'camera_evidence.face_artwork_unavailable',
  aspectStateUnknown: 'camera_evidence.aspect_state_unknown',
  rowPitchMarginal: 'camera_evidence.row_pitch_marginal',
  contextAnchorMissing: 'camera_evidence.context_anchor_missing',
  contextAnchorNotVisible: 'camera_evidence.context_anchor_not_visible',
  contextDeferredToLinkedView: 'camera_evidence.context_deferred_to_linked_view',
  detailUnlinked: 'camera_evidence.detail_unlinked',
  detailOfUnmountedEntity: 'camera_evidence.detail_of_unmounted_entity',
  detailCannotShowAssociation: 'camera_evidence.detail_cannot_show_association',
  enlargeBlocked: 'camera_evidence.enlarge_requires_context_in_main_view',
  coVisibleUnknown: 'camera_evidence.co_visible_requirement_unknown',
  coVisibleHidden: 'camera_evidence.co_visible_evidence_hidden',
  cameraInsideGeometry: 'camera_evidence.camera_inside_geometry',
  viewerVehicleIsTarget: 'camera_evidence.viewer_vehicle_is_target',
  presetMissing: 'camera_evidence.preset_missing',
  presetSynthesised: 'camera_evidence.preset_synthesised',
  presetAdjusted: 'camera_evidence.preset_adjusted',
  linkedDetailProvided: 'camera_evidence.linked_detail_provided',
  linkedDetailUnavailable: 'camera_evidence.linked_detail_unavailable',
  notExposed: 'camera_evidence.required_evidence_not_exposed',
  onlyInEnlarge: 'camera_evidence.required_evidence_only_in_enlarge',
  requiredEvidenceUnknown: 'camera_evidence.required_evidence_unknown',
} as const);

export type CameraEvidenceCode = (typeof CAMERA_EVIDENCE_CODES)[keyof typeof CAMERA_EVIDENCE_CODES];

export function cameraDiagnostic(
  severity: DiagnosticSeverity,
  code: CameraEvidenceCode,
  message: string,
  entityIds: readonly string[],
  data?: Readonly<Record<string, unknown>>,
): Diagnostic {
  return data === undefined
    ? { validator: 'camera_evidence', severity, code, message, entityIds: [...entityIds] }
    : { validator: 'camera_evidence', severity, code, message, entityIds: [...entityIds], data };
}

export function hasErrors(diagnostics: readonly Diagnostic[]): boolean {
  return diagnostics.some((d) => d.severity === 'error');
}
