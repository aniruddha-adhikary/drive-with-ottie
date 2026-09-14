import { type ModuleStatus } from '@ottie/contracts/module-status';

export const MODULE_STATUS: ModuleStatus = {
  module: '@ottie/scenario-validation',
  owner: 'V1',
  implemented: [],
  pending: [
    'source_applicability',
    'lane_topology',
    'marking_context',
    'control_completeness',
    'mount_integrity',
    'approach_facing',
    'signal_movements',
    'question_evidence',
    'state_invariance',
  ],
};
