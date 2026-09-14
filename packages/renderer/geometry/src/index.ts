/**
 * @ottie/renderer-geometry — R1 owns this module (Three.js road, marking, sign, signal, actor geometry).
 *
 * F0 provides only a schematic ground/lane-centreline scene so the web shell can prove the Three.js
 * pipeline end to end. Nothing here interprets controls or priority; it draws lane centrelines and
 * anchor markers from World data and labels itself schematic.
 */
export { MODULE_STATUS } from './status';
export { buildSchematicScene } from './schematic';
