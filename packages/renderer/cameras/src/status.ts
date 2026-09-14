import { type ModuleStatus } from '@ottie/contracts/module-status';

export const MODULE_STATUS: ModuleStatus = {
  module: '@ottie/renderer-cameras',
  owner: 'R2',
  implemented: [
    'presetToThreeCamera',
    'CameraPort (createCameraPort over a built R1 scene)',
    'view fitting for plan / study_oblique / approach_ego / entity_detail (authored preset first, bounded presentation-only adjustments)',
    'labelled linked entity_detail views and the Enlarge gate (detailGate)',
    'required-evidence exposure check (not_exposed / only_in_enlarge)',
    'review-export camera matrices (cameraMatrices)',
  ],
  pending: ['reduced-motion transitions', 'apps/web wiring (I1)'],
};
