import {
  type CameraPreset,
  type CameraPresetName,
  type DeepReadonly,
  type Diagnostic,
  type EvidenceRequirement,
  type EvidenceVisibility,
  type ViewFit,
  type Viewport,
  type World,
  entityId,
} from '@ottie/contracts';
import { type WorldScene } from '@ottie/renderer-geometry';
import {
  CAMERA_EVIDENCE_CODES as C,
  type EvidenceEvaluation,
  type OccluderIndex,
  cameraDiagnostic,
  evaluateView,
  indexOccluders,
  linkedDetailLabel,
} from '@ottie/renderer-evidence';
import { Vector3 } from 'three';
import {
  type FitCandidate,
  allowedEvidenceIds,
  authoredPreset,
  candidatesFor,
  detailCandidates,
} from './candidates';
import { type CameraMatrices, cameraMatrices } from './export';
import { makePreset } from './framing';
import { presetToThreeCamera } from './preset';

/**
 * View fitting. For a preset family the authored camera is tried first; if any listed evidence is
 * not visible, bounded presentation-only adjustments are tried and the candidate that shows the
 * most evidence with the fewest errors wins. When a main view can show a sign/head's presence and
 * road context but not its readable face, a labelled entity_detail is linked to that entity.
 * World, traffic, seeds and answers are read only; every camera here is a new plain object.
 */
export interface LinkedDetail {
  readonly entityId: string;
  readonly label: string;
  readonly preset: CameraPreset;
  readonly evidenceIds: readonly string[];
  readonly visibility: readonly EvidenceVisibility[];
  readonly matrices: CameraMatrices;
  /** Main view whose fit shows this entity's position and context. */
  readonly contextView: CameraPresetName;
}

export interface FitOptions {
  /** entity_detail: entity to enlarge; defaults to the authored preset's linkedEntityId. */
  readonly detailEntityId?: string | null;
  /** Reuse a physical-mesh index across fits of the same scene. */
  readonly occluders?: OccluderIndex;
}

export interface ViewFitReport extends ViewFit {
  readonly worldId: string;
  readonly presetName: CameraPresetName;
  readonly viewport: Viewport;
  readonly authored: CameraPreset | null;
  readonly adjusted: boolean;
  readonly chosenCandidate: string;
  readonly candidatesTried: readonly string[];
  readonly evidence: readonly EvidenceVisibility[];
  readonly evaluations: readonly EvidenceEvaluation[];
  readonly linkedDetails: readonly LinkedDetail[];
  /** Fit-level diagnostics plus every evidence diagnostic of the chosen camera. */
  readonly diagnostics: readonly Diagnostic[];
  readonly matrices: CameraMatrices;
  /** Every listed evidence is visible in this camera itself (linked details do not count). */
  readonly ok: boolean;
}

interface Scored {
  readonly candidate: FitCandidate;
  readonly evaluations: readonly EvidenceEvaluation[];
  readonly visible: number;
  readonly errors: number;
}

function errorCodes(evaluation: EvidenceEvaluation): string[] {
  return evaluation.visibility.diagnostics.filter((d) => d.severity === 'error').map((d) => d.code);
}

function score(
  scene: WorldScene,
  world: DeepReadonly<World>,
  viewport: Viewport,
  requirements: readonly EvidenceRequirement[],
  candidate: FitCandidate,
  occluders: OccluderIndex,
): Scored {
  const camera = presetToThreeCamera(candidate.preset, viewport);
  const { evaluations } = evaluateView(
    scene,
    world,
    viewport,
    camera,
    candidate.preset,
    requirements,
    candidate.preset.evidenceIds,
    occluders,
  );
  const visible = evaluations.filter((e) => e.visibility.visible).length;
  const errors = evaluations.reduce((n, e) => n + errorCodes(e).length, 0);
  return { candidate, evaluations, visible, errors };
}

function better(a: Scored, b: Scored): boolean {
  if (a.visible !== b.visible) return a.visible > b.visible;
  if (a.errors !== b.errors) return a.errors < b.errors;
  return !a.candidate.adjusted && b.candidate.adjusted;
}

/** Only these failures may be rescued by a linked close-up; anything else is a world fact the detail would hide. */
const DETAIL_RESCUABLE = new Set<string>([C.tooSmall, C.rowPitchMarginal]);

function rescuable(evaluation: EvidenceEvaluation): boolean {
  const codes = errorCodes(evaluation);
  return codes.length > 0 && codes.every((c) => DETAIL_RESCUABLE.has(c));
}

function targets(requirement: EvidenceRequirement, id: string): boolean {
  return requirement.targetEntityIds.some((t) => t === id);
}

function detailTargetOf(scene: WorldScene, requirement: EvidenceRequirement): string | null {
  for (const id of requirement.targetEntityIds) {
    const entity = scene.entities.get(id);
    if (entity && (entity.kind === 'sign_face' || entity.kind === 'signal_head')) return id;
  }
  return null;
}

function linkDetails(
  scene: WorldScene,
  world: DeepReadonly<World>,
  viewport: Viewport,
  requirements: readonly EvidenceRequirement[],
  main: Scored,
  occluders: OccluderIndex,
): { details: LinkedDetail[]; diagnostics: Diagnostic[] } {
  const details: LinkedDetail[] = [];
  const diagnostics: Diagnostic[] = [];
  const byEntity = new Map<string, EvidenceRequirement[]>();
  for (const evaluation of main.evaluations) {
    if (evaluation.visibility.visible || !evaluation.requirement || !rescuable(evaluation))
      continue;
    const target = detailTargetOf(scene, evaluation.requirement);
    if (!target) continue;
    byEntity.set(target, [...(byEntity.get(target) ?? []), evaluation.requirement]);
  }
  const authoredDetail = authoredPreset(world, 'entity_detail');
  for (const [id, reqs] of byEntity) {
    const entity = scene.entities.get(id);
    if (!entity) continue;
    const allowed = reqs.filter((r) => r.allowedViews.includes('entity_detail'));
    const evidenceIds = allowed.map((r) => r.id);
    const notAllowed = reqs
      .filter((r) => !r.allowedViews.includes('entity_detail'))
      .map((r) => r.id);
    for (const evidenceId of notAllowed) {
      diagnostics.push(
        cameraDiagnostic(
          'error',
          C.linkedDetailUnavailable,
          `Evidence "${evidenceId}" is unreadable in the ${main.candidate.preset.name} view and does not allow an entity_detail close-up.`,
          [id],
          { evidenceId, entityId: id },
        ),
      );
    }
    if (evidenceIds.length === 0) continue;
    const base = authoredDetail?.linkedEntityId === id ? authoredDetail : null;
    const candidates = detailCandidates(
      base ? { ...base, evidenceIds } : null,
      entity,
      world,
      scene,
      viewport,
      evidenceIds,
    );
    let best: Scored | null = null;
    for (const candidate of candidates) {
      const scored = score(scene, world, viewport, requirements, candidate, occluders);
      if (!best || better(scored, best)) best = scored;
      if (scored.visible === evidenceIds.length) break;
    }
    if (!best || best.visible < evidenceIds.length) {
      diagnostics.push(
        cameraDiagnostic(
          'error',
          C.linkedDetailUnavailable,
          `No entity_detail camera can show ${evidenceIds.join(', ')} of "${id}" readably; the evidence stays hidden.`,
          [id],
          {
            entityId: id,
            evidenceIds,
            detailCodes: best ? best.evaluations.flatMap(errorCodes) : [],
          },
        ),
      );
      continue;
    }
    const label = linkedDetailLabel(entity, main.candidate.preset.name);
    details.push({
      entityId: id,
      label,
      preset: best.candidate.preset,
      evidenceIds,
      visibility: best.evaluations.map((e) => e.visibility),
      matrices: cameraMatrices(best.candidate.preset, viewport),
      contextView: main.candidate.preset.name,
    });
    diagnostics.push(
      cameraDiagnostic('info', C.linkedDetailProvided, `${label}.`, [id], {
        entityId: id,
        evidenceIds,
        label,
        contextView: main.candidate.preset.name,
        detailCandidate: best.candidate.label,
      }),
    );
  }
  return { details, diagnostics };
}

/** Main views that could show an entity's position: authored non-detail presets listing evidence that targets it. */
function contextViewsFor(
  world: DeepReadonly<World>,
  requirements: readonly EvidenceRequirement[],
  id: string,
): CameraPresetName[] {
  const evidenceIds = new Set(requirements.filter((r) => targets(r, id)).map((r) => r.id));
  return world.cameraPresets
    .filter((c) => c.name !== 'entity_detail' && c.evidenceIds.some((e) => evidenceIds.has(e)))
    .map((c) => c.name);
}

/**
 * The Enlarge gate: a close-up of `id` is only offered once some main view shows the entity
 * where it stands (present, in frame, not hidden) together with its road context. Failures that a
 * close-up would paper over — occlusion, wrong facing, missing context — block it.
 */
export function detailGate(
  scene: WorldScene,
  world: DeepReadonly<World>,
  viewport: Viewport,
  requirements: readonly EvidenceRequirement[],
  id: string,
  occluders: OccluderIndex = indexOccluders(scene),
): {
  readonly allowed: boolean;
  readonly contextView: CameraPresetName | null;
  readonly diagnostics: readonly Diagnostic[];
} {
  const views = contextViewsFor(world, requirements, id);
  const blocking: Diagnostic[] = [];
  for (const name of views) {
    const fit = fitView(scene, world, viewport, requirements, name, { occluders });
    const relevant = fit.evaluations.filter(
      (e) => e.requirement !== null && targets(e.requirement, id),
    );
    if (relevant.length > 0 && relevant.every((e) => e.visibility.visible || rescuable(e))) {
      return { allowed: true, contextView: name, diagnostics: [] };
    }
    blocking.push(
      ...relevant.flatMap((e) => e.visibility.diagnostics.filter((d) => d.severity === 'error')),
    );
  }
  const diagnostic = cameraDiagnostic(
    'error',
    C.enlargeBlocked,
    views.length === 0
      ? `No main view lists evidence for "${id}"; an entity_detail close-up cannot be opened without a view that shows where it stands.`
      : `No main view (${views.join(', ')}) shows "${id}" in place with its road context, so an entity_detail close-up would hide that; Enlarge is blocked.`,
    [id],
    { entityId: id, contextViews: views, blockingCodes: [...new Set(blocking.map((d) => d.code))] },
  );
  return { allowed: false, contextView: null, diagnostics: [diagnostic] };
}

/** Plan-style stand-in used only so a failed fit still returns a well-formed camera. */
function fallbackCamera(
  scene: WorldScene,
  world: DeepReadonly<World>,
  viewport: Viewport,
  requirements: readonly EvidenceRequirement[],
  name: CameraPresetName,
  evidenceIds: readonly string[],
): CameraPreset {
  const plan = candidatesFor({
    scene,
    world,
    viewport,
    requirements,
    name: 'plan',
    base: null,
    evidenceIds,
    detailEntityId: null,
  })[0];
  if (plan) return { ...plan.preset, name, evidenceIds };
  return makePreset({
    name,
    projection: 'orthographic',
    eye: new Vector3(0, 0, 80),
    target: new Vector3(),
    up: new Vector3(0, 1, 0),
    fovOrHalfHeight: 30,
    linkedEntityId: null,
    evidenceIds,
  });
}

export function fitView(
  scene: WorldScene,
  world: DeepReadonly<World>,
  viewport: Viewport,
  requirements: readonly EvidenceRequirement[],
  name: CameraPresetName,
  options: FitOptions = {},
): ViewFitReport {
  const occluders = options.occluders ?? indexOccluders(scene);
  const authored = authoredPreset(world, name);
  const fitDiagnostics: Diagnostic[] = [];
  const evidenceIds = authored ? authored.evidenceIds : allowedEvidenceIds(requirements, name);
  let detailEntityId: string | null = null;
  if (name === 'entity_detail') {
    detailEntityId = options.detailEntityId ?? authored?.linkedEntityId ?? null;
    if (detailEntityId === null) {
      const first = requirements.find(
        (r) => evidenceIds.includes(r.id) && detailTargetOf(scene, r),
      );
      detailEntityId = first ? detailTargetOf(scene, first) : null;
    }
  }
  const detailEvidenceIds =
    name === 'entity_detail' && detailEntityId
      ? evidenceIds.filter((e) => {
          const requirement = requirements.find((r) => r.id === e);
          return requirement !== undefined && targets(requirement, detailEntityId);
        })
      : evidenceIds;
  const carried = name === 'entity_detail' ? detailEvidenceIds : evidenceIds;
  if (!authored) {
    fitDiagnostics.push(
      cameraDiagnostic(
        'warning',
        C.presetSynthesised,
        `World "${world.id}" has no ${name} camera preset; one was synthesised from the built geometry for ${carried.length > 0 ? carried.join(', ') : 'no evidence'}.`,
        [],
        { preset: name, evidenceIds: carried },
      ),
    );
  }
  const base = authored
    ? Object.freeze({ ...authored, evidenceIds: Object.freeze([...carried]) })
    : null;
  const candidates = candidatesFor({
    scene,
    world,
    viewport,
    requirements,
    name,
    base,
    evidenceIds: carried,
    detailEntityId,
  });
  if (name === 'entity_detail' && detailEntityId) {
    const gate = detailGate(scene, world, viewport, requirements, detailEntityId, occluders);
    fitDiagnostics.push(...gate.diagnostics);
  }
  if (candidates.length === 0) {
    fitDiagnostics.push(
      cameraDiagnostic(
        'error',
        C.presetMissing,
        `No ${name} camera could be built for world "${world.id}"${name === 'entity_detail' ? ' (no sign face or signal head to enlarge)' : name === 'approach_ego' ? ' (no ego vehicle to look from)' : ''}.`,
        [],
        { preset: name },
      ),
    );
    const camera = fallbackCamera(scene, world, viewport, requirements, name, carried);
    return {
      camera,
      visibleEvidenceIds: [],
      hiddenEvidenceIds: [...carried],
      linkedDetailEntityIds: [],
      worldId: world.id,
      presetName: name,
      viewport,
      authored,
      adjusted: false,
      chosenCandidate: 'none',
      candidatesTried: [],
      evidence: [],
      evaluations: [],
      linkedDetails: [],
      diagnostics: fitDiagnostics,
      matrices: cameraMatrices(camera, viewport),
      ok: false,
    };
  }
  let best: Scored | null = null;
  const tried: string[] = [];
  for (const candidate of candidates) {
    tried.push(candidate.label);
    const scored = score(scene, world, viewport, requirements, candidate, occluders);
    if (!best || better(scored, best)) best = scored;
    if (scored.visible === carried.length && scored.errors === 0) break;
  }
  if (!best) throw new Error('unreachable: candidates were non-empty');
  if (best.candidate.adjusted && authored) {
    fitDiagnostics.push(
      cameraDiagnostic(
        'info',
        C.presetAdjusted,
        `The authored ${name} camera left evidence hidden; a presentation-only adjustment (${best.candidate.label}) is used. No world entity moved.`,
        [],
        {
          preset: name,
          candidate: best.candidate.label,
          authored: {
            eye: authored.eye,
            target: authored.target,
            fovOrHalfHeight: authored.fovOrHalfHeight,
          },
          chosen: {
            eye: best.candidate.preset.eye,
            target: best.candidate.preset.target,
            fovOrHalfHeight: best.candidate.preset.fovOrHalfHeight,
          },
        },
      ),
    );
  }
  const linked =
    name === 'entity_detail'
      ? { details: [], diagnostics: [] }
      : linkDetails(scene, world, viewport, requirements, best, occluders);
  const evidence = best.evaluations.map((e) => e.visibility);
  const visibleEvidenceIds = evidence.filter((e) => e.visible).map((e) => e.evidenceId);
  const hiddenEvidenceIds = evidence.filter((e) => !e.visible).map((e) => e.evidenceId);
  const gateFailed = fitDiagnostics.some((d) => d.code === C.enlargeBlocked);
  return {
    camera: best.candidate.preset,
    visibleEvidenceIds,
    hiddenEvidenceIds,
    linkedDetailEntityIds: linked.details.map((d) => entityId(d.entityId)),
    worldId: world.id,
    presetName: name,
    viewport,
    authored,
    adjusted: best.candidate.adjusted,
    chosenCandidate: best.candidate.label,
    candidatesTried: tried,
    evidence,
    evaluations: best.evaluations,
    linkedDetails: linked.details,
    diagnostics: [
      ...fitDiagnostics,
      ...linked.diagnostics,
      ...evidence.flatMap((e) => e.diagnostics),
    ],
    matrices: cameraMatrices(best.candidate.preset, viewport),
    ok:
      hiddenEvidenceIds.length === 0 &&
      !gateFailed &&
      fitDiagnostics.every((d) => d.severity !== 'error'),
  };
}
