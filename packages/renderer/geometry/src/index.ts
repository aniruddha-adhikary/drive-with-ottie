/**
 * @ottie/renderer-geometry — R1 owns this module (Three.js road, marking, sign, signal, actor geometry).
 *
 * `buildWorldScene` turns an immutable World into physical Three.js geometry and world-space facts
 * (front normals, attachment points, lens order/state, bounds) for camera and evidence consumers;
 * `createWorldRenderer` wraps it as the F0 RendererPort. Nothing here interprets controls or
 * priority: it draws exactly what the World and the resolved assets say and reports every mismatch
 * as a SceneIssue. Node-only helpers live in `artwork.node.ts` and are not exported from here.
 */
export { MODULE_STATUS } from './status';
export { buildSchematicScene } from './schematic';
export { buildWorldScene, type BuildWorldSceneOptions } from './scene';
export { createWorldRenderer, type WorldRenderer, type WorldRendererOptions } from './renderer';
export {
  createFetchArtworkSource,
  createStaticArtworkSource,
  loadWorldArtwork,
  parseSvgArtwork,
  rendererSvgFile,
  sha256Hex,
  type ArtworkLoadResult,
  type FaceArtworkSource,
  type ParsedArtwork,
  type SvgViewBox,
} from './artwork';
export {
  ROAD_MATERIAL_COLOURS,
  SCHEMATIC,
  SIGNAL_LENS_COLOURS,
  disposeObjectTree,
  lensColour,
  type RoadMaterialName,
} from './materials';
export {
  facingFrame,
  headingVector,
  poseMatrix,
  poseQuaternion,
  polylineWalker,
  type FacingFrame,
} from './frames';
export { dashIntervals } from './markings';
export { pickMeasurement } from './signals';
export { plateOutline } from './faces';
export type {
  ArtworkStatus,
  FacingFacts,
  MeasurementSource,
  MountFacts,
  PaintRow,
  PaintSegment,
  RenderedActor,
  RenderedAnchor,
  RenderedEntity,
  RenderedEntityKind,
  RenderedLane,
  RenderedLens,
  RenderedMarking,
  RenderedMovement,
  RenderedRoad,
  RenderedSignFace,
  RenderedSignalHead,
  RenderedSupport,
  SceneIssue,
  SceneIssueCode,
  SceneLayer,
  SchematicChoice,
  WorldScene,
} from './types';
