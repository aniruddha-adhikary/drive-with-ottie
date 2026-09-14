import { type ModuleStatus } from '@ottie/contracts/module-status';

export const MODULE_STATUS: ModuleStatus = {
  module: '@ottie/scenario-validation',
  owner: 'V1',
  implemented: [
    'source_applicability (C1 resolver; development quarantine allowed, learner_release refused)',
    'lane_topology',
    'marking_context',
    'control_completeness',
    'mount_integrity',
    'approach_facing',
    'signal_movements (aspect layout vs semantic bindings; red arrow precedence; Green B eligibility)',
    'question_evidence (world evidence + question bindings/answers against A3 starter rules and terms)',
    'camera_evidence (static declarations, co-visibility, front-side and actor-body sight lines)',
    'state_invariance (frozen/canonical world; presentation-change comparison)',
    'mutation corpus over F0 fixtures and C2 generated worlds',
  ],
  pending: [
    'camera_evidence runtime projection, framing, occlusion fraction and readable-size checks (R2, behind the frozen camera port)',
    'stale bus-lane hours: reported as an unresolved official-source conflict, not resolved',
    'no learner-release content exists to validate; release target is exercised only as a refusal path',
  ],
};
