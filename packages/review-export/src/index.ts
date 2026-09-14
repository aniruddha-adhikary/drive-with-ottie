/**
 * @ottie/review-export — H1 owns this module (review packs, change-impact reports, release gates).
 *
 * F0 provides `describeWorldForReview`, a plain-data summary used by the CLI skeleton. Release
 * gating and image export are NOT implemented.
 */
export { MODULE_STATUS } from './status';
export { describeWorldForReview, type WorldReviewSummary } from './describe';
