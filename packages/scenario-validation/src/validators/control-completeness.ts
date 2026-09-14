import {
  type AssetRole,
  type ControlRegime,
  type Lane,
  type MarkingRole,
  type SignFace,
} from '@ottie/contracts';
import { Collector, type RO, type SemanticValidator, type WorldIndex } from '../world-index';

/** Transverse marking a control sign must be paired with on its linked control line. */
const LINE_FOR_SIGN: Readonly<Partial<Record<AssetRole, MarkingRole>>> = {
  give_way_sign: 'give_way_line',
  stop_sign: 'stop_line',
};

/** Control sign roles that are meaningful in each regime. */
const SIGNS_FOR_REGIME: Readonly<Record<ControlRegime, readonly AssetRole[]>> = {
  uncontrolled: [],
  give_way: ['give_way_sign'],
  stop: ['stop_sign'],
  signalised: [],
  zebra_crossing: [],
};

const MOVEMENT_PRIORITY_FOR_LINE: Readonly<
  Partial<Record<MarkingRole, readonly ('yield' | 'stop_then_yield')[]>>
> = {
  give_way_line: ['yield'],
  stop_line: ['stop_then_yield'],
};

/**
 * Does the world contain every control its regime requires, does every control pair with its
 * marking, and does each control govern the approach that actually has to yield? Signs and lines
 * are matched by declared role AND by the resolved asset's role: a J line drawn under a Give Way
 * sign is a mismatch no matter which name the marking carries.
 */
export const controlCompleteness: SemanticValidator = {
  name: 'control_completeness',
  run(index) {
    const out = new Collector('control_completeness');
    const { world } = index;
    const regime = world.controlRegime;

    const controlSigns = world.signFaces
      .map((face) => ({ face, role: signRole(index, face) }))
      .filter(
        (entry): entry is { face: RO<SignFace>; role: 'give_way_sign' | 'stop_sign' } =>
          entry.role === 'give_way_sign' || entry.role === 'stop_sign',
      );

    for (const { face, role } of controlSigns) {
      const allowed = SIGNS_FOR_REGIME[regime];
      if (!allowed.includes(role)) {
        out.error({
          code: 'incompatible_control',
          message: `${role} ${face.id} placed in a '${regime}' world`,
          entityIds: [face.id],
          data: { role, regime },
        });
      }
      const requiredLine = LINE_FOR_SIGN[role];
      if (!requiredLine) continue;
      if (face.linkedControlLineIds.length === 0) {
        out.error({
          code: 'missing_control_line',
          message: `${role} ${face.id} is linked to no control line`,
          entityIds: [face.id],
        });
      }
      for (const anchorId of face.linkedControlLineIds) {
        const anchor = index.anchorOfKind(anchorId, 'control_line');
        if (!anchor) {
          out.error({
            code: 'missing_control_line',
            message: `${role} ${face.id} links to ${anchorId}, which is not a control line`,
            entityIds: [face.id, anchorId],
          });
          continue;
        }
        const markings = world.markings.filter((m) => m.anchorId === anchorId);
        if (markings.length === 0) {
          out.error({
            code: 'missing_control_line',
            message: `${role} ${face.id} has no ${requiredLine} marking on its control line ${anchorId}`,
            entityIds: [face.id, anchorId],
            data: { requiredRole: requiredLine },
          });
        }
        for (const marking of markings) {
          const assetRole = index.asset(marking.asset)?.role ?? null;
          if (marking.role !== requiredLine || (assetRole !== null && assetRole !== requiredLine)) {
            out.error({
              code: 'marking_role_mismatch',
              message: `${role} ${face.id} requires a ${requiredLine} on ${anchorId}; marking ${marking.id} is declared '${marking.role}' and rendered by a '${String(assetRole)}' asset`,
              entityIds: [face.id, marking.id, anchorId],
              data: { requiredRole: requiredLine, declaredRole: marking.role, assetRole },
            });
          }
        }
        for (const laneId of face.applicableLaneIds) {
          if (!anchor.controlsLaneIds.includes(laneId)) {
            out.error({
              code: 'sign_lane_not_on_control_line',
              message: `${role} ${face.id} applies to lane ${laneId} but its control line ${anchorId} does not cross that lane`,
              entityIds: [face.id, anchorId, laneId],
            });
          }
        }
      }
      if (face.applicableLaneIds.length === 0) {
        out.error({
          code: 'control_without_lane',
          message: `${role} ${face.id} applies to no lane`,
          entityIds: [face.id],
        });
      }
      for (const laneId of face.applicableLaneIds)
        checkControlledLane(out, index, face.id, role, laneId, LINE_FOR_SIGN[role] ?? null);
    }

    const controlMarkings = world.markings.filter(
      (m) => m.role === 'give_way_line' || m.role === 'stop_line',
    );
    for (const marking of controlMarkings) {
      const governingFaces = controlSigns.filter(({ face }) =>
        face.linkedControlLineIds.includes(marking.anchorId),
      );
      const governingHeads = world.signalHeads.filter((head) =>
        head.linkedControlLineIds.includes(marking.anchorId),
      );
      if (marking.role === 'stop_line' && regime === 'signalised') {
        if (governingHeads.length === 0) {
          out.error({
            code: 'stop_line_without_signal',
            message: `stop line ${marking.id} in a signalised world has no signal head linked to its control line ${marking.anchorId}`,
            entityIds: [marking.id, marking.anchorId],
          });
        }
      } else if (marking.role === 'stop_line' && governingFaces.length === 0) {
        out.error({
          code: 'missing_sign_for_stop_line',
          message: `stop line ${marking.id} has no STOP sign linked to its control line ${marking.anchorId}`,
          entityIds: [marking.id, marking.anchorId],
        });
      } else if (marking.role === 'give_way_line' && governingFaces.length === 0) {
        out.error({
          code: 'missing_sign_for_give_way_line',
          message: `give way line ${marking.id} has no Give Way sign linked to its control line ${marking.anchorId}`,
          entityIds: [marking.id, marking.anchorId],
        });
      }
      for (const laneId of marking.applicableLaneIds)
        checkControlledLane(out, index, marking.id, marking.role, laneId, marking.role);
    }

    for (const anchor of index.controlLines()) {
      if (!world.markings.some((m) => m.anchorId === anchor.id)) {
        out.error({
          code: 'control_line_without_marking',
          message: `control line ${anchor.id} carries no marking`,
          entityIds: [anchor.id],
        });
      }
    }

    checkRegimeRequirements(
      out,
      index,
      controlSigns.map((c) => c.role),
      controlMarkings.map((m) => m.role),
    );
    checkSignals(out, index);
    return out.diagnostics;
  },
};

function signRole(index: WorldIndex, face: RO<SignFace>): AssetRole | null {
  return index.asset(face.asset)?.role ?? null;
}

/** A control must govern an approach that yields; it may not be hung on the priority road. */
function checkControlledLane(
  out: Collector,
  index: WorldIndex,
  controlId: string,
  controlRole: string,
  laneId: string,
  line: MarkingRole | null,
): void {
  const lane = index.lanes.get(laneId);
  if (!lane) return;
  const movements = lane.outgoingMovementIds
    .map((id) => index.movements.get(id))
    .filter((m): m is NonNullable<typeof m> => m !== undefined);
  if (movements.length === 0) return;
  if (index.world.controlRegime === 'signalised') return;
  const protectedMovements = movements.filter((m) => m.priority === 'protected');
  if (protectedMovements.length > 0) {
    out.error({
      code: 'control_on_priority_approach',
      message: `${controlRole} ${controlId} governs lane ${laneId}, whose movement(s) ${protectedMovements.map((m) => m.id).join(', ')} have priority`,
      entityIds: [controlId, laneId, ...protectedMovements.map((m) => m.id)],
    });
    return;
  }
  const expected = line ? MOVEMENT_PRIORITY_FOR_LINE[line] : undefined;
  if (!expected) return;
  for (const movement of movements) {
    if (!(expected as readonly string[]).includes(movement.priority)) {
      out.error({
        code: 'priority_contradicts_control',
        message: `movement ${movement.id} from lane ${laneId} is '${movement.priority}' although ${controlRole} ${controlId} requires ${expected.join('/')}`,
        entityIds: [controlId, movement.id],
        data: { expected, actual: movement.priority },
      });
    }
  }
}

function checkRegimeRequirements(
  out: Collector,
  index: WorldIndex,
  signRoles: readonly AssetRole[],
  markingRoles: readonly MarkingRole[],
): void {
  const { world } = index;
  const regime = world.controlRegime;
  const need = (present: boolean, what: string) => {
    if (!present)
      out.error({
        code: 'missing_required_control',
        message: `a '${regime}' world requires ${what}`,
        entityIds: [world.id],
        data: { regime, missing: what },
      });
  };
  switch (regime) {
    case 'give_way':
      need(markingRoles.includes('give_way_line'), 'a give_way_line marking');
      need(signRoles.includes('give_way_sign'), 'a Give Way sign');
      break;
    case 'stop':
      need(markingRoles.includes('stop_line'), 'a stop_line marking');
      need(signRoles.includes('stop_sign'), 'a STOP sign');
      break;
    case 'signalised':
      need(world.signalHeads.length > 0, 'at least one signal head');
      need(world.signalControllers.length > 0, 'a signal controller');
      need(markingRoles.includes('stop_line'), 'a stop_line marking at the signals');
      break;
    case 'zebra_crossing':
      need(
        world.markings.some((m) => m.role === 'pedestrian_crossing'),
        'a pedestrian_crossing marking',
      );
      need(
        world.anchors.some((a) => a.kind === 'crossing_bound'),
        'a crossing_bound anchor',
      );
      break;
    case 'uncontrolled':
      break;
  }
  if (
    regime !== 'signalised' &&
    (world.signalHeads.length > 0 || world.signalControllers.length > 0)
  ) {
    out.error({
      code: 'signals_in_unsignalised_world',
      message: `'${regime}' world contains signal heads or controllers`,
      entityIds: [
        ...world.signalHeads.map((h) => h.id),
        ...world.signalControllers.map((c) => c.id),
      ],
    });
  }
  if (regime === 'zebra_crossing' || world.anchors.some((a) => a.kind === 'crossing_bound')) {
    for (const anchor of world.anchors) {
      if (
        anchor.kind === 'crossing_bound' &&
        !world.markings.some((m) => m.anchorId === anchor.id)
      ) {
        out.error({
          code: 'missing_crossing',
          message: `crossing bound ${anchor.id} has no crossing marking`,
          entityIds: [anchor.id],
        });
      }
    }
  }
}

function checkSignals(out: Collector, index: WorldIndex): void {
  const { world } = index;
  if (world.controlRegime !== 'signalised') return;
  const permissions = new Map<string, { governed: number; controllerId: string }>();
  for (const controller of world.signalControllers) {
    for (const permission of controller.movementPermissions) {
      permissions.set(permission.movementId, {
        governed: permission.governedByAspects.length,
        controllerId: controller.id,
      });
    }
  }
  const signalledLanes = new Set<string>();
  for (const head of world.signalHeads) {
    if (!index.controllers.has(head.controllerId)) {
      out.error({
        code: 'head_without_controller',
        message: `signal head ${head.id} references missing controller ${head.controllerId}`,
        entityIds: [head.id, head.controllerId],
      });
    }
    if (head.linkedControlLineIds.length === 0) {
      out.error({
        code: 'signal_without_stop_line',
        message: `signal head ${head.id} is not linked to any stop line`,
        entityIds: [head.id],
      });
    }
    for (const anchorId of head.linkedControlLineIds) {
      const anchor = index.anchorOfKind(anchorId, 'control_line');
      const stopLine = anchor
        ? world.markings.find((m) => m.anchorId === anchorId && m.role === 'stop_line')
        : undefined;
      if (!anchor || !stopLine) {
        out.error({
          code: 'signal_without_stop_line',
          message: `signal head ${head.id} links to ${anchorId}, which carries no stop_line marking`,
          entityIds: [head.id, anchorId],
        });
        continue;
      }
      for (const laneId of head.applicableLaneIds) {
        if (!anchor.controlsLaneIds.includes(laneId)) {
          out.error({
            code: 'signal_lane_not_on_stop_line',
            message: `signal head ${head.id} applies to lane ${laneId} but its stop line ${anchorId} does not cross that lane`,
            entityIds: [head.id, anchorId, laneId],
          });
        }
      }
    }
    for (const laneId of head.applicableLaneIds) signalledLanes.add(laneId);
  }
  // Every lane held behind a signal stop line must have a head, and each of its movements a governing aspect.
  for (const marking of world.markings) {
    if (marking.role !== 'stop_line') continue;
    for (const laneId of marking.applicableLaneIds) {
      const lane = index.lanes.get(laneId);
      if (!lane) continue;
      if (!signalledLanes.has(laneId)) {
        out.error({
          code: 'movement_without_governing_signal',
          message: `lane ${laneId} stops at ${marking.id} but no signal head applies to it`,
          entityIds: [laneId, marking.id],
        });
        continue;
      }
      checkLaneGoverned(out, lane, permissions);
    }
  }
}

function checkLaneGoverned(
  out: Collector,
  lane: RO<Lane>,
  permissions: ReadonlyMap<string, { governed: number; controllerId: string }>,
): void {
  for (const movementId of lane.outgoingMovementIds) {
    const permission = permissions.get(movementId);
    if (!permission) {
      out.error({
        code: 'movement_without_governing_signal',
        message: `movement ${movementId} from signalled lane ${lane.id} has no permission entry in any controller`,
        entityIds: [movementId, lane.id],
      });
    } else if (permission.governed === 0) {
      out.error({
        code: 'movement_without_governing_signal',
        message: `movement ${movementId} from signalled lane ${lane.id} is governed by no aspect`,
        entityIds: [movementId, lane.id, permission.controllerId],
      });
    }
  }
}
