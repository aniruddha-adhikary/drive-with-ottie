import { type ModuleStatus } from '@ottie/contracts/module-status';

export const MODULE_STATUS: ModuleStatus = {
  module: '@ottie/review-export',
  owner: 'H1',
  implemented: ['describeWorldForReview'],
  pending: ['review pack export', 'change-impact report', 'release gate (rejects development_fixture and quarantined assets)'],
};
