import { type Vector3 } from 'three';
import {
  type CameraPreset,
  type DeepReadonly,
  type Diagnostic,
  type EvidenceRequirement,
  type EvidenceVisibility,
  type Viewport,
  type World,
} from '@ottie/contracts';
import {
  type RenderedEntity,
  type RenderedEntityKind,
  type SceneLayer,
  type WorldScene,
} from '@ottie/renderer-geometry';
import { CAMERA_EVIDENCE_CODES as C, cameraDiagnostic, hasErrors } from './diagnostics';
import { type FacingEvaluation, evaluateFacing } from './facing';
import {
  type OccluderIndex,
  entitiesContaining,
  indexOccluders,
  measureOcclusion,
} from './occlusion';
import {
  type CameraFrame,
  type SceneCamera,
  cameraFrame,
  plainVec,
  projectPoints,
  round,
  safeRect,
  screenExtent,
} from './projection';
import { type EntitySamples, focusOf, sampleEntity } from './samples';
import { EVIDENCE_THRESHOLDS } from './thresholds';

/**
 * Evidence visibility for one concrete camera over one built scene. Every judgement is made
 * against the geometry R1 built at the authored poses: frustum membership of sample points,
 * the physical front normal, ray-cast occlusion by other physical meshes, projected size in CSS
 * pixels inside the safe rectangle, and the road context each requirement names. The scene,
 * world and camera preset are only read.
 */
export interface ViewContext {
  readonly scene: WorldScene;
  readonly world: DeepReadonly<World>;
  readonly viewport: Viewport;
  readonly camera: SceneCamera;
  readonly preset: CameraPreset;
  readonly frame: CameraFrame;
  readonly occluders: OccluderIndex;
  /** Ego vehicle the driver's-eye camera sits inside (approach_ego only); it never blocks its own driver. */
  readonly viewerVehicleId: string | null;
  /** Other physical entities whose bounds contain the eye: the camera is inside geometry. */
  readonly eyeInsideEntityIds: readonly string[];
}

export function createViewContext(
  scene: WorldScene,
  world: DeepReadonly<World>,
  viewport: Viewport,
  camera: SceneCamera,
  preset: CameraPreset,
  occluders: OccluderIndex = indexOccluders(scene),
): ViewContext {
  if (scene.worldId !== world.id) {
    throw new Error(`scene was built for world "${scene.worldId}", not "${world.id}"`);
  }
  const frame = cameraFrame(camera);
  const inside = entitiesContaining(scene, frame.eye);
  let viewerVehicleId: string | null = null;
  if (preset.name === 'approach_ego') {
    for (const id of inside) {
      const entity = scene.entities.get(id);
      if (entity?.kind === 'actor' && entity.isEgo) viewerVehicleId = id;
    }
  }
  return {
    scene,
    world,
    viewport,
    camera,
    preset,
    frame,
    occluders,
    viewerVehicleId,
    eyeInsideEntityIds: inside.filter((id) => id !== viewerVehicleId),
  };
}

export interface TargetVisibility {
  readonly entityId: string;
  readonly found: boolean;
  readonly kind: RenderedEntityKind | null;
  readonly layer: SceneLayer | null;
  readonly sampleCount: number;
  /** Samples behind the camera plane / total. */
  readonly behindFraction: number;
  /** Samples outside the safe rectangle (including behind) / total. */
  readonly clippedFraction: number;
  /** Samples inside the safe rectangle but blocked by other physical geometry / total. */
  readonly occlusionFraction: number;
  readonly occluderIds: readonly string[];
  /** Readable size in CSS px (smaller screen dimension for faces/lenses, larger for objects). */
  readonly projectedSizePx: number | null;
  readonly projectedExtentPx: { readonly widthPx: number; readonly heightPx: number } | null;
  /** Linear features: metres of the judged stretch that are on screen and unobstructed. */
  readonly visibleLengthM: number | null;
  readonly judgedLengthM: number | null;
  readonly facing: FacingEvaluation | null;
  /** The camera sits inside this actor (driver's own vehicle); it is shown by occupancy. */
  readonly viewerOccupied: boolean;
  readonly diagnostics: readonly Diagnostic[];
}

export interface ContextAnchorVisibility {
  readonly anchorId: string;
  readonly found: boolean;
  readonly inSafeFraction: number;
  readonly occlusionFraction: number;
}

export interface EvidenceEvaluation {
  readonly requirement: EvidenceRequirement | null;
  readonly visibility: EvidenceVisibility;
  readonly targets: readonly TargetVisibility[];
  readonly contextAnchors: readonly ContextAnchorVisibility[];
}

const T = EVIDENCE_THRESHOLDS;
const CONTEXT_MAX_OCCLUSION = 0.5;

function safeRectData(viewport: Viewport): Readonly<Record<string, unknown>> {
  const safe = safeRect(viewport);
  return {
    viewportPx: { widthPx: viewport.widthPx, heightPx: viewport.heightPx },
    safeRectPx: { left: safe.left, top: safe.top, right: safe.right, bottom: safe.bottom },
  };
}

function excludeSetFor(
  entity: RenderedEntity | undefined,
  ctx: ViewContext,
  targetIds: readonly string[],
): Set<string> {
  const exclude = new Set<string>();
  for (const id of targetIds) exclude.add(id);
  if (
    entity &&
    (entity.kind === 'sign_face' || entity.kind === 'signal_head') &&
    entity.mount.supportId
  ) {
    exclude.add(entity.mount.supportId);
  }
  if (ctx.viewerVehicleId) exclude.add(ctx.viewerVehicleId);
  return exclude;
}

function missingTarget(entityId: string, requirementId: string): TargetVisibility {
  return {
    entityId,
    found: false,
    kind: null,
    layer: null,
    sampleCount: 0,
    behindFraction: 1,
    clippedFraction: 1,
    occlusionFraction: 0,
    occluderIds: [],
    projectedSizePx: null,
    projectedExtentPx: null,
    visibleLengthM: null,
    judgedLengthM: null,
    facing: null,
    viewerOccupied: false,
    diagnostics: [
      cameraDiagnostic(
        'error',
        C.targetMissing,
        `Evidence "${requirementId}" targets "${entityId}", which is not in the built scene.`,
        [entityId],
        { evidenceId: requirementId },
      ),
    ],
  };
}

function projectedSize(
  ctx: ViewContext,
  samples: EntitySamples,
): {
  size: number | null;
  extent: TargetVisibility['projectedExtentPx'];
} {
  const projected = projectPoints(ctx.camera, ctx.viewport, samples.extent);
  const extent = screenExtent(projected);
  if (!extent) return { size: null, extent: null };
  const ext = { widthPx: round(extent.widthPx, 2), heightPx: round(extent.heightPx, 2) };
  if (samples.sizeMeasure === 'min_dimension') {
    if (extent.behind > 0) return { size: null, extent: ext };
    return { size: round(Math.min(extent.widthPx, extent.heightPx), 2), extent: ext };
  }
  return { size: round(Math.max(extent.widthPx, extent.heightPx), 2), extent: ext };
}

function rowPitchPx(ctx: ViewContext, entity: RenderedEntity): number | null {
  if (entity.kind !== 'marking' || entity.rows.length < 2) return null;
  const a = entity.rows[0]?.segments[0]?.from;
  const b = entity.rows[1]?.segments[0]?.from;
  if (!a || !b) return null;
  const [pa, pb] = projectPoints(ctx.camera, ctx.viewport, [a, b]);
  if (!pa?.inFront || !pb?.inFront) return null;
  return Math.hypot(pa.xPx - pb.xPx, pa.yPx - pb.yPx);
}

function evaluateTarget(
  ctx: ViewContext,
  requirement: EvidenceRequirement,
  entityId: string,
  focus: Vector3 | null,
): TargetVisibility {
  const entity = ctx.scene.entities.get(entityId);
  if (!entity) return missingTarget(entityId, requirement.id);
  const diagnostics: Diagnostic[] = [];
  const samples = sampleEntity(entity, ctx.world, focus, ctx.scene);

  if (entity.kind === 'actor' && entity.id === ctx.viewerVehicleId) {
    diagnostics.push(
      cameraDiagnostic(
        'info',
        C.viewerVehicleIsTarget,
        `The approach view is taken from inside "${entity.id}"; the learner's own vehicle is present by occupancy, not framed.`,
        [entity.id],
        { evidenceId: requirement.id },
      ),
    );
    return {
      entityId,
      found: true,
      kind: entity.kind,
      layer: entity.layer,
      sampleCount: samples.points.length,
      behindFraction: 0,
      clippedFraction: 0,
      occlusionFraction: 0,
      occluderIds: [],
      projectedSizePx: null,
      projectedExtentPx: null,
      visibleLengthM: null,
      judgedLengthM: null,
      facing: null,
      viewerOccupied: true,
      diagnostics,
    };
  }

  const projected = projectPoints(ctx.camera, ctx.viewport, samples.points);
  const total = Math.max(1, projected.length);
  const behind = projected.filter((p) => !p.inFront).length;
  const onScreen = projected.filter((p) => p.inSafeRect);
  const occlusion = measureOcclusion(
    ctx.occluders,
    ctx.frame,
    onScreen,
    excludeSetFor(entity, ctx, requirement.targetEntityIds),
  );
  const behindFraction = behind / total;
  const clippedFraction = (projected.length - onScreen.length) / total;
  const occlusionFraction = occlusion.occluded / total;
  const { size, extent } = projectedSize(ctx, samples);
  const facing =
    entity.kind === 'sign_face' || entity.kind === 'signal_head'
      ? evaluateFacing(entity, ctx.frame, ctx.scene)
      : null;
  const base = { evidenceId: requirement.id, entityId, kind: entity.kind };

  let visibleLengthM: number | null = null;
  let judgedLengthM: number | null = null;
  if (samples.linear) {
    judgedLengthM = round(samples.judgedLengthM, 2);
    const visibleCount = onScreen.length - occlusion.occluded;
    visibleLengthM = round(
      Math.min(samples.judgedLengthM, Math.max(0, visibleCount) * samples.spacingM),
      2,
    );
    const required = Math.min(
      T.minVisibleLinearLengthM,
      samples.judgedLengthM * T.linearVisibleFraction,
    );
    const enough = samples.judgedLengthM === 0 ? visibleCount > 0 : visibleLengthM >= required;
    if (!enough) {
      const occludedDominant = occlusion.occluded >= projected.length - onScreen.length;
      diagnostics.push(
        cameraDiagnostic(
          'error',
          occludedDominant ? C.occluded : C.clipped,
          `${entity.kind} "${entityId}": only ${String(visibleLengthM)} m of the ${String(judgedLengthM)} m judged stretch is on screen and unobstructed (needs ${String(round(required, 2))} m).`,
          [entityId, ...occlusion.occluderIds],
          {
            ...base,
            visibleLengthM,
            judgedLengthM,
            requiredLengthM: round(required, 2),
            occluderIds: occlusion.occluderIds,
            ...safeRectData(ctx.viewport),
          },
        ),
      );
    }
  } else {
    if (clippedFraction > requirement.maxOcclusionFraction) {
      diagnostics.push(
        cameraDiagnostic(
          'error',
          C.clipped,
          `${entity.kind} "${entityId}": ${String(round(clippedFraction * 100, 1))}% of its samples fall outside the safe viewport rectangle${behind > 0 ? ` (${String(behind)} behind the camera)` : ''}.`,
          [entityId],
          {
            ...base,
            clippedFraction: round(clippedFraction),
            behindFraction: round(behindFraction),
            maxOcclusionFraction: requirement.maxOcclusionFraction,
            ...safeRectData(ctx.viewport),
          },
        ),
      );
    }
    if (occlusionFraction > requirement.maxOcclusionFraction) {
      diagnostics.push(
        cameraDiagnostic(
          'error',
          C.occluded,
          `${entity.kind} "${entityId}": ${String(round(occlusionFraction * 100, 1))}% of its samples are hidden behind ${occlusion.occluderIds.join(', ') || 'physical geometry'} (allowed ${String(round(requirement.maxOcclusionFraction * 100, 1))}%).`,
          [entityId, ...occlusion.occluderIds],
          {
            ...base,
            occlusionFraction: round(occlusionFraction),
            maxOcclusionFraction: requirement.maxOcclusionFraction,
            occluderIds: occlusion.occluderIds,
          },
        ),
      );
    }
  }

  if (facing) {
    const facingData = {
      ...base,
      angleDeg: round(facing.angleDeg, 1),
      maxAngleDeg: facing.maxAngleDeg,
      frontNormal: plainVec(facing.frontNormal),
      towardViewer: plainVec(facing.towardViewer),
      eye: plainVec(ctx.frame.eye),
    };
    if (requirement.mustBeFrontFacing && !facing.frontFacing) {
      diagnostics.push(
        cameraDiagnostic(
          'error',
          C.notFrontFacing,
          `${entity.kind} "${entityId}" physically faces ${String(round(facing.angleDeg, 1))}° away from the viewer (readable within ${String(facing.maxAngleDeg)}°). The control is drawn as mounted; the camera must move, not the sign.`,
          [entityId],
          facingData,
        ),
      );
    }
    if (facing.declaredNormalMismatch) {
      diagnostics.push(
        cameraDiagnostic(
          'warning',
          C.facingDeclarationMismatch,
          `${entity.kind} "${entityId}": the World's declared frontNormal disagrees with the built pose; visibility was judged from the built geometry.`,
          [entityId],
          facingData,
        ),
      );
    }
    if (!facing.facesIntendedApproach) {
      diagnostics.push(
        cameraDiagnostic(
          'warning',
          C.faceAwayFromApproach,
          `${entity.kind} "${entityId}" does not face the approach it is declared to serve.`,
          [entityId],
          facingData,
        ),
      );
    }
  }

  if (
    requirement.requiredDetail === 'readable_face' &&
    entity.kind === 'sign_face' &&
    entity.artwork === 'backing_only'
  ) {
    diagnostics.push(
      cameraDiagnostic(
        'error',
        C.faceArtworkUnavailable,
        `sign_face "${entityId}" is drawn as a blank backing plate (artwork unavailable or rejected); its face cannot be read.`,
        [entityId],
        base,
      ),
    );
  }

  if (requirement.requiredDetail === 'aspect_state' && entity.kind === 'signal_head') {
    const unknown = entity.lenses.filter((l) => l.state === null).map((l) => l.slot);
    if (!entity.controllerFound || unknown.length > 0) {
      diagnostics.push(
        cameraDiagnostic(
          'error',
          C.aspectStateUnknown,
          `signal_head "${entityId}": aspect state is unknown (${entity.controllerFound ? `slots ${unknown.join(', ')}` : `controller "${entity.controllerId}" not found`}); nothing can be shown as lit.`,
          [entityId, entity.controllerId],
          {
            ...base,
            controllerId: entity.controllerId,
            controllerFound: entity.controllerFound,
            unknownSlots: unknown,
          },
        ),
      );
    }
  }

  if (requirement.requiredDetail === 'row_count') {
    const pitch = rowPitchPx(ctx, entity);
    if (pitch !== null && pitch < T.minRowPitchPx) {
      diagnostics.push(
        cameraDiagnostic(
          'warning',
          C.rowPitchMarginal,
          `marking "${entityId}": rows project ${String(round(pitch, 2))} px apart; below ${String(T.minRowPitchPx)} px they cannot be counted.`,
          [entityId],
          { ...base, rowPitchPx: round(pitch, 2), minRowPitchPx: T.minRowPitchPx },
        ),
      );
    }
  }

  return {
    entityId,
    found: true,
    kind: entity.kind,
    layer: entity.layer,
    sampleCount: projected.length,
    behindFraction: round(behindFraction),
    clippedFraction: round(clippedFraction),
    occlusionFraction: round(occlusionFraction),
    occluderIds: occlusion.occluderIds,
    projectedSizePx: size,
    projectedExtentPx: extent,
    visibleLengthM,
    judgedLengthM,
    facing,
    viewerOccupied: false,
    diagnostics,
  };
}

function evaluateContextAnchor(
  ctx: ViewContext,
  requirement: EvidenceRequirement,
  anchorId: string,
): ContextAnchorVisibility {
  const entity = ctx.scene.entities.get(anchorId);
  if (!entity) return { anchorId, found: false, inSafeFraction: 0, occlusionFraction: 0 };
  const samples = sampleEntity(entity, ctx.world, null, ctx.scene);
  const projected = projectPoints(ctx.camera, ctx.viewport, samples.points);
  const total = Math.max(1, projected.length);
  const onScreen = projected.filter((p) => p.inSafeRect);
  const occlusion = measureOcclusion(
    ctx.occluders,
    ctx.frame,
    onScreen,
    excludeSetFor(undefined, ctx, requirement.targetEntityIds),
  );
  return {
    anchorId,
    found: true,
    inSafeFraction: round(onScreen.length / total),
    occlusionFraction: round(occlusion.occluded / total),
  };
}

function contextDiagnostics(
  ctx: ViewContext,
  requirement: EvidenceRequirement,
  anchors: readonly ContextAnchorVisibility[],
  targets: readonly TargetVisibility[],
): Diagnostic[] {
  const out: Diagnostic[] = [];
  const isDetail = ctx.preset.name === 'entity_detail';
  if (isDetail) {
    if (
      requirement.requiredDetail === 'lane_association' ||
      requirement.requiredDetail === 'relative_position'
    ) {
      out.push(
        cameraDiagnostic(
          'error',
          C.detailCannotShowAssociation,
          `Evidence "${requirement.id}" needs ${requirement.requiredDetail}; an isolated entity_detail close-up cannot show that relationship. Use plan, study_oblique or approach_ego.`,
          [...requirement.targetEntityIds],
          { evidenceId: requirement.id, requiredDetail: requirement.requiredDetail },
        ),
      );
    }
    const linked = ctx.preset.linkedEntityId;
    const linkedTarget = linked ? targets.find((t) => t.entityId === linked) : undefined;
    if (!linked || !linkedTarget) {
      out.push(
        cameraDiagnostic(
          'error',
          C.detailUnlinked,
          `entity_detail camera is linked to ${linked ? `"${linked}"` : 'no entity'}, which is not a target of evidence "${requirement.id}"; a detail inset must be labelled with the entity it enlarges.`,
          [...requirement.targetEntityIds],
          { evidenceId: requirement.id, linkedEntityId: linked },
        ),
      );
    } else if (requirement.contextAnchorIds.length > 0) {
      const entity = ctx.scene.entities.get(linked);
      const mounted =
        entity && (entity.kind === 'sign_face' || entity.kind === 'signal_head')
          ? entity.mount.mounted
          : true;
      out.push(
        mounted
          ? cameraDiagnostic(
              'info',
              C.contextDeferredToLinkedView,
              `entity_detail of "${linked}" shows the face only; its road context (${requirement.contextAnchorIds.join(', ')}) must be visible in the linked main view.`,
              [linked, ...requirement.contextAnchorIds],
              { evidenceId: requirement.id, contextAnchorIds: requirement.contextAnchorIds },
            )
          : cameraDiagnostic(
              'error',
              C.detailOfUnmountedEntity,
              `entity_detail of "${linked}" would hide that it is not attached to any support in the built scene.`,
              [linked],
              { evidenceId: requirement.id },
            ),
      );
    }
    return out;
  }
  for (const anchor of anchors) {
    if (!anchor.found) {
      out.push(
        cameraDiagnostic(
          'error',
          C.contextAnchorMissing,
          `Context anchor "${anchor.anchorId}" of evidence "${requirement.id}" is not in the built scene.`,
          [anchor.anchorId],
          { evidenceId: requirement.id },
        ),
      );
    } else if (anchor.inSafeFraction < 1 || anchor.occlusionFraction > CONTEXT_MAX_OCCLUSION) {
      out.push(
        cameraDiagnostic(
          'error',
          C.contextAnchorNotVisible,
          `Context anchor "${anchor.anchorId}" of evidence "${requirement.id}" is not fully on screen (${String(round(anchor.inSafeFraction * 100, 1))}% inside the safe rectangle, ${String(round(anchor.occlusionFraction * 100, 1))}% obstructed).`,
          [anchor.anchorId],
          {
            evidenceId: requirement.id,
            inSafeFraction: anchor.inSafeFraction,
            occlusionFraction: anchor.occlusionFraction,
            ...safeRectData(ctx.viewport),
          },
        ),
      );
    }
  }
  return out;
}

interface BaseEvaluation {
  readonly requirement: EvidenceRequirement;
  readonly targets: readonly TargetVisibility[];
  readonly contextAnchors: readonly ContextAnchorVisibility[];
  readonly diagnostics: readonly Diagnostic[];
  readonly baseVisible: boolean;
  /** Visible ignoring the allowed-view gate: what a co-visible partner needs from this view. */
  readonly physicallyVisible: boolean;
}

function evaluateBase(ctx: ViewContext, requirement: EvidenceRequirement): BaseEvaluation {
  const diagnostics: Diagnostic[] = [];
  if (!requirement.allowedViews.includes(ctx.preset.name)) {
    diagnostics.push(
      cameraDiagnostic(
        'error',
        C.viewNotAllowed,
        `Evidence "${requirement.id}" may only be shown in ${requirement.allowedViews.join(', ')}; the ${ctx.preset.name} view is not an allowed carrier.`,
        [...requirement.targetEntityIds],
        {
          evidenceId: requirement.id,
          preset: ctx.preset.name,
          allowedViews: requirement.allowedViews,
        },
      ),
    );
  }
  if (ctx.eyeInsideEntityIds.length > 0) {
    diagnostics.push(
      cameraDiagnostic(
        'error',
        C.cameraInsideGeometry,
        `The ${ctx.preset.name} camera eye is inside ${ctx.eyeInsideEntityIds.join(', ')}; nothing judged from inside geometry counts as shown.`,
        [...ctx.eyeInsideEntityIds],
        { evidenceId: requirement.id, eye: plainVec(ctx.frame.eye) },
      ),
    );
  }
  const focus = focusOf(ctx.scene, requirement.targetEntityIds);
  const targets = requirement.targetEntityIds.map((id) =>
    evaluateTarget(ctx, requirement, id, focus),
  );
  const anchors = requirement.contextAnchorIds.map((id) =>
    evaluateContextAnchor(ctx, requirement, id),
  );
  for (const t of targets) diagnostics.push(...t.diagnostics);
  diagnostics.push(...contextDiagnostics(ctx, requirement, anchors, targets));

  const sizes = targets.map((t) => t.projectedSizePx).filter((s): s is number => s !== null);
  const projectedSizePx = sizes.length > 0 ? Math.min(...sizes) : null;
  if (
    requirement.minProjectedSizePx !== null &&
    projectedSizePx !== null &&
    projectedSizePx < requirement.minProjectedSizePx
  ) {
    diagnostics.push(
      cameraDiagnostic(
        'error',
        C.tooSmall,
        `Evidence "${requirement.id}" projects to ${String(projectedSizePx)} CSS px, below the required ${String(requirement.minProjectedSizePx)} px at this viewport.`,
        [...requirement.targetEntityIds],
        {
          evidenceId: requirement.id,
          projectedSizePx,
          minProjectedSizePx: requirement.minProjectedSizePx,
          devicePixelRatio: ctx.viewport.devicePixelRatio,
          ...safeRectData(ctx.viewport),
        },
      ),
    );
  }
  return {
    requirement,
    targets,
    contextAnchors: anchors,
    diagnostics,
    baseVisible: !hasErrors(diagnostics),
    physicallyVisible: !hasErrors(diagnostics.filter((d) => d.code !== C.viewNotAllowed)),
  };
}

function summarise(
  base: BaseEvaluation,
  coVisibleSatisfied: boolean,
  extra: readonly Diagnostic[],
): EvidenceEvaluation {
  const facingTargets = base.targets.filter((t) => t.facing !== null);
  const found = base.targets.filter((t) => t.found && !t.viewerOccupied);
  const sizes = found.map((t) => t.projectedSizePx).filter((s): s is number => s !== null);
  const diagnostics = [...base.diagnostics, ...extra];
  return {
    requirement: base.requirement,
    visibility: {
      evidenceId: base.requirement.id,
      visible: base.baseVisible && coVisibleSatisfied && !hasErrors(diagnostics),
      frontFacing:
        facingTargets.length === 0
          ? null
          : facingTargets.every((t) => t.facing?.frontFacing === true),
      projectedSizePx: sizes.length > 0 ? Math.min(...sizes) : null,
      occlusionFraction:
        found.length > 0 ? Math.max(...found.map((t) => t.occlusionFraction)) : null,
      coVisibleSatisfied,
      diagnostics,
    },
    targets: base.targets,
    contextAnchors: base.contextAnchors,
  };
}

/**
 * Evaluate the listed evidence requirements in the view described by `ctx`. Co-visibility is
 * judged against the physical visibility of the partner requirements in the same view (their own
 * allowed-view gate aside), so a partner that is off screen or hidden makes this evidence not
 * visible too.
 */
export function evaluateEvidence(
  ctx: ViewContext,
  requirements: readonly EvidenceRequirement[],
  evidenceIds: readonly string[],
): readonly EvidenceEvaluation[] {
  const byId = new Map(requirements.map((r) => [r.id, r]));
  const wanted = new Set(evidenceIds);
  for (const id of evidenceIds)
    for (const partner of byId.get(id)?.coVisibleWith ?? []) wanted.add(partner);
  const bases = new Map<string, BaseEvaluation>();
  for (const id of wanted) {
    const requirement = byId.get(id);
    if (requirement) bases.set(id, evaluateBase(ctx, requirement));
  }
  return evidenceIds.map((id) => {
    const base = bases.get(id);
    if (!base) {
      const diagnostic = cameraDiagnostic(
        'error',
        C.requirementUnknown,
        `Camera "${ctx.preset.name}" lists evidence "${id}", which is not among the supplied requirements.`,
        [],
        { evidenceId: id, preset: ctx.preset.name },
      );
      return {
        requirement: null,
        visibility: {
          evidenceId: id,
          visible: false,
          frontFacing: null,
          projectedSizePx: null,
          occlusionFraction: null,
          coVisibleSatisfied: false,
          diagnostics: [diagnostic],
        },
        targets: [],
        contextAnchors: [],
      };
    }
    const extra: Diagnostic[] = [];
    let coVisible = true;
    for (const partnerId of base.requirement.coVisibleWith) {
      const partner = bases.get(partnerId);
      if (!partner) {
        coVisible = false;
        extra.push(
          cameraDiagnostic(
            'error',
            C.coVisibleUnknown,
            `Evidence "${id}" must be co-visible with unknown evidence "${partnerId}".`,
            [],
            { evidenceId: id, partnerEvidenceId: partnerId },
          ),
        );
      } else if (!partner.physicallyVisible) {
        coVisible = false;
        extra.push(
          cameraDiagnostic(
            'error',
            C.coVisibleHidden,
            `Evidence "${id}" must be shown together with "${partnerId}", which is not visible in the ${ctx.preset.name} view.`,
            [...partner.requirement.targetEntityIds],
            {
              evidenceId: id,
              partnerEvidenceId: partnerId,
              partnerCodes: partner.diagnostics
                .filter((d) => d.severity === 'error')
                .map((d) => d.code),
            },
          ),
        );
      }
    }
    return summarise(base, coVisible, extra);
  });
}

/** Convenience: build a context and evaluate in one call. */
export function evaluateView(
  scene: WorldScene,
  world: DeepReadonly<World>,
  viewport: Viewport,
  camera: SceneCamera,
  preset: CameraPreset,
  requirements: readonly EvidenceRequirement[],
  evidenceIds: readonly string[] = preset.evidenceIds,
  occluders?: OccluderIndex,
): { readonly context: ViewContext; readonly evaluations: readonly EvidenceEvaluation[] } {
  const context = createViewContext(scene, world, viewport, camera, preset, occluders);
  return { context, evaluations: evaluateEvidence(context, requirements, evidenceIds) };
}
