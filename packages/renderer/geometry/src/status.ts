import { type ModuleStatus } from '@ottie/contracts/module-status';

export const MODULE_STATUS: ModuleStatus = {
  module: '@ottie/renderer-geometry',
  owner: 'R1',
  implemented: ['buildSchematicScene (lane centrelines + anchors only)'],
  pending: ['road surfaces', 'marking geometry from MarkingProfile', 'sign faces with front normals', 'signal heads with aspect states', 'supports/attachments', 'actors'],
};
