import { type ModuleStatus } from '@ottie/contracts/module-status';

export const MODULE_STATUS: ModuleStatus = {
  module: '@ottie/renderer-cameras',
  owner: 'R2',
  implemented: ['presetToThreeCamera'],
  pending: ['CameraPort implementation', 'view fitting by evidence', 'occlusion / projected-size evaluation', 'reduced-motion transitions'],
};
