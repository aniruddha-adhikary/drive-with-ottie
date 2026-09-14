import { type ModuleStatus } from '@ottie/contracts/module-status';

export const MODULE_STATUS: ModuleStatus = {
  module: '@ottie/renderer-evidence',
  owner: 'R2',
  implemented: [
    'safe-rect projection (CSS px, DPR-independent)',
    'entity sampling from built geometry / world polylines',
    'physical front-facing evaluation',
    'ray-cast occlusion against physical meshes',
    'EvidenceVisibility reporting (clipping, occlusion, size, facing, context, co-visibility)',
    'camera_evidence diagnostics',
    'linked-detail labels',
  ],
  pending: [
    'evidence highlights',
    'term callouts bound to entities',
    'hypothetical comparison overlays',
  ],
};
