import { type ModuleStatus } from '@ottie/contracts/module-status';

export const MODULE_STATUS: ModuleStatus = {
  module: '@ottie/renderer-geometry',
  owner: 'R1',
  implemented: [
    'buildWorldScene: physical scene graph from a World (roads as authored-width ribbons, ground, paint from MarkingProfile rows/dash intervals in metres, supports as vertical shafts with named attachment points, mounted sign faces with hash-verified SVG artwork or flagged blank backing, signal heads with lenses in authored column/row order lit from the SignalController, vehicles at authored dimensions/poses)',
    'createWorldRenderer: RendererPort adapter (load/update/resize/dispose) with entity lookup, boundsOf(ids) for evidence/camera consumers, presentation-only highlight, hidden lane/movement/anchor overlay',
    'World-space facts per entity (frontNormal/up/right, facesIntendedApproach, mount + attachment point, lens centres/states, artwork axes) and SceneIssue reports for every mismatch instead of silent repair',
    'buildSchematicScene (lane centrelines + anchors) kept for the F0 shell',
  ],
  pending: [
    'apps/web integration: the shell still renders buildSchematicScene (I1)',
    'cameras and evidence validation consume WorldScene bounds (R2/R3)',
    'curved road ribbons only follow authored polyline vertices (no arc tessellation beyond authored points)',
    'kerbs, footways, junction surface blending and lane arrows are not drawn',
    'signal housing/pole dimensions, sign-post radius and vehicle body shapes are explicit schematic stand-ins (see WorldScene.schematicChoices), not source measurements',
    'horizontal signal heads have no artwork in the sources and are not rendered specially',
  ],
};
