import { type ModuleStatus } from '@ottie/contracts/module-status.js';

export const MODULE_STATUS: ModuleStatus = {
  module: '@ottie/review-export',
  owner: 'H1',
  implemented: ['describeWorldForReview', 'buildReviewPack', 'writeReviewPack', 'assetChangeImpact', 'assessReleaseExport', 'composeContactSheet'],
  pending: ['PNG rasterisation (no delegate in shell)'],
};
