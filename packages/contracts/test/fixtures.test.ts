import { describe, expect, it } from 'vitest';
import { type DeepReadonly, type World, HEADING, checkQuestionStructure, checkWorldStructure } from '@ottie/contracts';
import {
  DEVELOPMENT_ASSETS,
  DEVELOPMENT_CONTENT_BUNDLE,
  DEVELOPMENT_TEMPLATES,
  DEVELOPMENT_WORLDS,
  EXTRACTED_DEVELOPMENT_ASSETS,
  GIVE_WAY_IDS,
  GIVE_WAY_T_JUNCTION,
  QUESTION_GIVE_WAY,
  QUESTION_RED_RIGHT_ARROW,
  QUESTION_STOP,
  SIGNALISED_JUNCTION_RIGHT_ARROW,
  SIGNAL_IDS,
  SIGNAL_SLOTS,
  STOP_DEVELOPMENT_ACCESS,
  STOP_IDS,
} from '@ottie/contracts/fixtures';

const byId = <T extends { readonly id: string }>(items: readonly T[], id: string): T => {
  const found = items.find((i) => i.id === id);
  if (!found) throw new Error(`missing ${id}`);
  return found;
};

/** Positive when `normal` points against the direction of travel (i.e. toward approaching drivers). */
const facesApproach = (normal: { readonly x: number; readonly y: number }, heading: number): boolean =>
  Math.cos(heading) * normal.x + Math.sin(heading) * normal.y < 0;

describe('development fixtures (NOT release content)', () => {
  it('every fixture is explicitly a development fixture that uses quarantined assets', () => {
    expect(DEVELOPMENT_WORLDS).toHaveLength(3);
    for (const world of DEVELOPMENT_WORLDS) {
      expect(world.provenance.status).toBe('development_fixture');
      expect(world.provenance.usesQuarantinedAssets).toBe(true);
      expect(world.provenance.canonicalHash).toBeNull();
      expect(Object.isFrozen(world)).toBe(true);
      expect(Object.isFrozen(world.lanes)).toBe(true);
    }
    for (const asset of DEVELOPMENT_ASSETS) {
      expect(asset.review.releaseReady).toBe(false);
      expect(asset.review.contentApproved).toBe(false);
      expect(asset.review.reuseApproved).toBe(false);
    }
    expect(EXTRACTED_DEVELOPMENT_ASSETS.length).toBeGreaterThan(0);
  });

  it('passes structural checks and questions bind to their worlds', () => {
    for (const world of DEVELOPMENT_WORLDS) {
      expect(checkWorldStructure(world)).toEqual([]);
    }
    const worlds = new Map(DEVELOPMENT_WORLDS.map((w) => [w.id, w]));
    for (const question of DEVELOPMENT_CONTENT_BUNDLE.questions) {
      const world = worlds.get(question.worldId);
      expect(world).toBeDefined();
      if (world) expect(checkQuestionStructure(question, world)).toEqual([]);
    }
    expect(DEVELOPMENT_TEMPLATES.map((t) => t.id)).toEqual(DEVELOPMENT_WORLDS.map((w) => w.provenance.key.template.id));
  });

  it('uses LEFT-hand traffic and lane headings match centreline direction', () => {
    for (const world of DEVELOPMENT_WORLDS) {
      expect(world.conventions.trafficSide).toBe('LEFT');
      for (const lane of world.lanes) {
        const first = lane.centreline[0];
        const second = lane.centreline[1];
        if (!first || !second) throw new Error('lane needs two points');
        const travel = Math.atan2(second.y - first.y, second.x - first.x);
        const diff = Math.atan2(Math.sin(travel - lane.heading), Math.cos(travel - lane.heading));
        expect(Math.abs(diff)).toBeLessThan(1e-6);
      }
      for (const road of world.roads) {
        const lanes = world.lanes.filter((l) => l.roadId === road.id);
        const forward = lanes.find((l) => l.directionRelativeToRoad === 'with_reference');
        const backward = lanes.find((l) => l.directionRelativeToRoad === 'against_reference');
        if (!forward || !backward) continue;
        // LEFT traffic: drivers keep left, so the oncoming lane lies to the RIGHT of travel: cross(travel, toOpposing).z < 0.
        const f = forward.centreline[0];
        const b = backward.centreline[backward.centreline.length - 1];
        if (!f || !b) throw new Error('lane needs points');
        const cross = Math.cos(forward.heading) * (b.y - f.y) - Math.sin(forward.heading) * (b.x - f.x);
        expect(cross, `${world.id}/${road.id}`).toBeLessThan(0);
      }
    }
  });

  describe('Give Way T-junction', () => {
    const world: DeepReadonly<World> = GIVE_WAY_T_JUNCTION;
    it('has a two-row give-way line (RMS2 D) controlling only the minor approach', () => {
      const line = byId(world.markings, GIVE_WAY_IDS.entities.giveWayLine);
      expect(line.role).toBe('give_way_line');
      const asset = byId(DEVELOPMENT_ASSETS, line.asset.id);
      expect(asset.geometry.kind).toBe('marking');
      if (asset.geometry.kind === 'marking') {
        expect(asset.geometry.marking.rows).toBe(2);
        expect(asset.geometry.marking.widthMm).toBe(100);
        expect(asset.geometry.marking.paintedLengthMm).toBe(1000);
        expect(asset.geometry.marking.clearGapMm).toBe(1000);
        expect(asset.geometry.marking.interRowClearGapMm).toBe(150);
        expect(asset.geometry.marking.continuous).toBe(false);
      }
      const anchor = byId(world.anchors, line.anchorId);
      expect(anchor.kind).toBe('control_line');
      if (anchor.kind === 'control_line') {
        expect(anchor.controlsLaneIds).toEqual([GIVE_WAY_IDS.lanes.minorNorthbound]);
        expect(anchor.approachHeading).toBeCloseTo(HEADING.north);
      }
      expect(line.applicableLaneIds).toEqual([GIVE_WAY_IDS.lanes.minorNorthbound]);
    });
    it('mounts the Give Way sign on a real support, facing the minor approach, linked to the line', () => {
      const face = byId(world.signFaces, GIVE_WAY_IDS.entities.giveWaySign);
      const approach = byId(world.lanes, GIVE_WAY_IDS.lanes.minorNorthbound);
      expect(facesApproach(face.frontNormal, approach.heading)).toBe(true);
      expect(face.intendedApproach.laneIds).toContain(GIVE_WAY_IDS.lanes.minorNorthbound);
      const support = byId(world.supports, face.attachment.supportId);
      const supportAsset = support.asset ? byId(DEVELOPMENT_ASSETS, support.asset.id) : null;
      expect(supportAsset?.geometry.kind).toBe('support');
      if (supportAsset?.geometry.kind === 'support') {
        const point = supportAsset.geometry.attachments.find((a) => a.name === face.attachment.supportAttachmentName);
        expect(point?.accepts).toContain('face');
      }
      expect(byId(world.anchors, support.baseAnchorId).kind).toBe('support_base');
      expect(face.linkedControlLineIds).toEqual([GIVE_WAY_IDS.anchors.controlLine]);
      const faceAsset = byId(DEVELOPMENT_ASSETS, face.asset.id);
      expect(faceAsset.role).toBe('give_way_sign');
      if (faceAsset.geometry.kind === 'face') {
        expect(faceAsset.geometry.face.shape).toBe('triangle_point_down');
        expect(faceAsset.geometry.face.widthMm).toBe(600);
        expect(faceAsset.geometry.face.mirrorAllowed).toBe(false);
      }
    });
    it('is a give_way regime where the ego has no priority over major-road traffic', () => {
      expect(world.controlRegime).toBe('give_way');
      const ego = world.actors.find((a) => a.isEgo);
      const bus = byId(world.actors, GIVE_WAY_IDS.entities.bus);
      expect(ego?.laneId).toBe(GIVE_WAY_IDS.lanes.minorNorthbound);
      expect(bus.laneId).toBe(GIVE_WAY_IDS.lanes.majorWestbound);
      expect(world.evidence.map((e) => e.id)).toContain(GIVE_WAY_IDS.evidence.priority);
      expect(QUESTION_GIVE_WAY.options.filter((o) => o.correct)).toHaveLength(1);
      expect(QUESTION_GIVE_WAY.requiredEvidenceIds).toContain(GIVE_WAY_IDS.evidence.giveWayLine);
    });
  });

  describe('STOP development access', () => {
    const world: DeepReadonly<World> = STOP_DEVELOPMENT_ACCESS;
    it('uses marking J in the stop_line role (never shoulder_boundary) with the ego FRONT behind the line', () => {
      const line = byId(world.markings, STOP_IDS.entities.stopLine);
      expect(line.role).toBe('stop_line');
      const asset = byId(DEVELOPMENT_ASSETS, line.asset.id);
      expect(asset.role).toBe('stop_line');
      if (asset.geometry.kind === 'marking') {
        expect(asset.geometry.marking.rows).toBe(1);
        expect(asset.geometry.marking.widthMm).toBe(300);
        expect(asset.geometry.marking.continuous).toBe(true);
      }
      expect(asset.review.warnings.join(' ')).toMatch(/shoulder/i);
      const anchor = byId(world.anchors, line.anchorId);
      const ego = world.actors.find((a) => a.isEgo);
      expect(ego).toBeDefined();
      if (anchor.kind === 'control_line' && ego) {
        const approach = byId(world.lanes, STOP_IDS.lanes.accessWestbound);
        expect(anchor.controlsLaneIds).toEqual([approach.id]);
        expect(ego.laneId).toBe(approach.id);
        // Progress + front offset must remain upstream of the control line's station along the lane.
        expect(ego.progressM + ego.frontOffsetM).toBeLessThan(anchor.road.s);
      }
      expect(world.controlRegime).toBe('stop');
    });
    it('mounts the STOP sign facing the access approach and links it to the line', () => {
      const face = byId(world.signFaces, STOP_IDS.entities.stopSign);
      const approach = byId(world.lanes, STOP_IDS.lanes.accessWestbound);
      expect(facesApproach(face.frontNormal, approach.heading)).toBe(true);
      expect(face.linkedControlLineIds).toEqual([STOP_IDS.anchors.controlLine]);
      const faceAsset = byId(DEVELOPMENT_ASSETS, face.asset.id);
      if (faceAsset.geometry.kind === 'face') expect(faceAsset.geometry.face.shape).toBe('octagon');
      expect(QUESTION_STOP.requiredEvidenceIds).toContain(STOP_IDS.evidence.egoFrontBeforeLine);
    });
  });

  describe('signalised junction with circular green and red right-turn arrow', () => {
    const world: DeepReadonly<World> = SIGNALISED_JUNCTION_RIGHT_ARROW;
    it('orders circular lenses red, amber, green from the top and keeps arrow lenses in a separate column', () => {
      const head = byId(world.signalHeads, SIGNAL_IDS.entities.nbHead);
      const asset = byId(DEVELOPMENT_ASSETS, head.asset.id);
      expect(asset.geometry.kind).toBe('signal_head');
      if (asset.geometry.kind === 'signal_head') {
        expect(asset.geometry.head.arrangement).toBe('vertical');
        const circular = asset.geometry.head.aspects.filter((s) => s.shape === 'circular').sort((a, b) => a.row - b.row);
        expect(circular.map((s) => s.colour)).toEqual(['red', 'amber', 'green']);
        const arrows = asset.geometry.head.aspects.filter((s) => s.shape === 'arrow_right');
        expect(arrows.map((s) => s.slot)).toContain(SIGNAL_SLOTS.rightArrowRed);
        expect(new Set(arrows.map((s) => s.column)).size).toBe(1);
        expect(circular[0]?.column).not.toBe(arrows[0]?.column);
      }
    });
    it('lights circular green with the red right arrow; straight/left proceed, right must stop', () => {
      const controller = byId(world.signalControllers, SIGNAL_IDS.entities.controller);
      const nbLit = controller.aspectStates.filter((s) => s.headId === SIGNAL_IDS.entities.nbHead && s.state === 'lit').map((s) => s.slot);
      expect(nbLit.sort()).toEqual([SIGNAL_SLOTS.circularGreen, SIGNAL_SLOTS.rightArrowRed].sort());
      const perm = (id: string) => controller.movementPermissions.find((p) => p.movementId === id);
      expect(perm(SIGNAL_IDS.movements.nbStraight)?.permission).toBe('proceed_permissive');
      expect(perm(SIGNAL_IDS.movements.nbLeft)?.permission).toBe('proceed_permissive');
      const right = perm(SIGNAL_IDS.movements.nbRight);
      expect(right?.permission).toBe('stop');
      expect(right?.governedByAspects[0]).toEqual({ headId: SIGNAL_IDS.entities.nbHead, slot: SIGNAL_SLOTS.rightArrowRed });
      const head = byId(world.signalHeads, SIGNAL_IDS.entities.nbHead);
      const arrowAspect = head.aspects.find((a) => a.slot === SIGNAL_SLOTS.rightArrowRed);
      expect(arrowAspect?.controlsMovementIds).toEqual([SIGNAL_IDS.movements.nbRight]);
      const greenAspect = head.aspects.find((a) => a.slot === SIGNAL_SLOTS.circularGreen);
      expect(greenAspect?.controlsMovementIds).not.toContain(SIGNAL_IDS.movements.nbRight);
      expect(QUESTION_RED_RIGHT_ARROW.stemBindings.filter((b) => b.role === 'actual' && b.entityId === SIGNAL_IDS.entities.nbHead)).toHaveLength(2);
      expect(QUESTION_RED_RIGHT_ARROW.options.filter((o) => o.correct)).toHaveLength(1);
      expect(QUESTION_RED_RIGHT_ARROW.options.some((o) => o.bindings.some((b) => b.role === 'hypothetical'))).toBe(true);
      expect(QUESTION_RED_RIGHT_ARROW.requiredEvidenceIds).toContain(SIGNAL_IDS.evidence.nbHeadState);
    });
    it('records unresolved mount/attachment source data instead of inventing it', () => {
      const head = byId(world.signalHeads, SIGNAL_IDS.entities.nbHead);
      const asset = byId(DEVELOPMENT_ASSETS, head.asset.id);
      expect(asset.unknowns.length).toBeGreaterThan(0);
      const pole = byId(world.supports, head.attachment.supportId);
      expect(pole.dimensionsStatus).toBe('schematic_unsourced');
      expect(world.provenance.notes.join(' ')).toMatch(/unresolved|schematic/i);
    });
  });
});
