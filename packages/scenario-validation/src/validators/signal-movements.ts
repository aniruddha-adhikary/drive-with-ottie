import {
  type AspectState,
  type Movement,
  type MovementPermission,
  type SignalAspect,
  type SignalAspectShape,
  type SignalAspectSlot,
  type SignalHead,
  type SignalHeadProfile,
} from '@ottie/contracts';
import { Collector, type RO, type SemanticValidator, type WorldIndex } from '../world-index';

const ARROW_TURN: Readonly<Partial<Record<SignalAspectShape, Movement['turn']>>> = {
  arrow_left: 'left',
  arrow_right: 'right',
  arrow_straight: 'straight',
};

const COLOUR_ORDER: Readonly<Record<SignalAspect['colour'], number>> = {
  red: 0,
  amber: 1,
  green: 2,
};

type Permission = MovementPermission['permission'];

interface LitAspect {
  readonly head: RO<SignalHead>;
  readonly aspect: RO<SignalAspect>;
  readonly state: AspectState;
}

/**
 * Signals are validated on meaning, not artwork. The head's declared aspects must be the resolved
 * assembly's slots (colour AND shape per slot, so a colour swap or a swapped column is caught even
 * when the housing silhouette is unchanged); the assembly itself must obey Rule 11 lens order; each
 * aspect must bind to movements whose turn matches the arrow; and controller permissions must be
 * derivable from the lit aspects with a lit red arrow outranking a lit circular green. A circular
 * aspect governs every movement its head applies to except those a lit arrow on the same head
 * controls (Rule 11: circular green permits only movements with no lit arrow).
 */
export const signalMovements: SemanticValidator = {
  name: 'signal_movements',
  run(index) {
    const out = new Collector('signal_movements');
    const { world } = index;
    const lit = new Map<string, LitAspect[]>(); // movementId -> aspects that are lit/flashing and control it
    const stateByAspect = new Map<string, AspectState>();

    for (const controller of world.signalControllers) {
      for (const entry of controller.aspectStates) {
        const key = `${entry.headId}\u0000${entry.slot}`;
        if (stateByAspect.has(key)) {
          out.error({
            code: 'duplicate_aspect_state',
            message: `aspect ${entry.headId}/${entry.slot} has more than one state`,
            entityIds: [controller.id, entry.headId],
          });
        }
        stateByAspect.set(key, entry.state);
        const head = index.signalHeads.get(entry.headId);
        if (!head?.aspects.some((a) => a.slot === entry.slot)) {
          out.error({
            code: 'unknown_aspect_state',
            message: `controller ${controller.id} sets state for unknown aspect ${entry.headId}/${entry.slot}`,
            entityIds: [controller.id, entry.headId],
          });
        }
      }
    }

    for (const head of world.signalHeads) {
      checkHeadLayout(out, index, head);
      checkHeadBindings(out, index, head);
      const circularLit: LitAspect[] = [];
      const arrowsLit = new Map<SignalAspectShape, RO<SignalAspect>[]>();
      const arrowGoverned = new Set<string>();
      for (const aspect of head.aspects) {
        const state = stateByAspect.get(`${head.id}\u0000${aspect.slot}`);
        if (state === undefined) {
          out.error({
            code: 'aspect_state_missing',
            message: `aspect ${head.id}/${aspect.slot} has no controller state`,
            entityIds: [head.id],
          });
          continue;
        }
        if (state === 'dark') continue;
        if (aspect.shape === 'circular') {
          circularLit.push({ head, aspect, state });
          continue;
        }
        arrowsLit.set(aspect.shape, [...(arrowsLit.get(aspect.shape) ?? []), aspect]);
        for (const movementId of aspect.controlsMovementIds) {
          arrowGoverned.add(movementId);
          lit.set(movementId, [...(lit.get(movementId) ?? []), { head, aspect, state }]);
        }
      }
      for (const movementId of movementsUnderHead(index, head)) {
        if (arrowGoverned.has(movementId)) continue;
        for (const circular of circularLit)
          lit.set(movementId, [...(lit.get(movementId) ?? []), circular]);
      }
      if (head.aspects.some((a) => a.shape === 'circular') && circularLit.length !== 1) {
        out.error({
          code: 'circular_aspects_conflict',
          message: `head ${head.id} has ${circularLit.length} circular aspects lit; exactly one must be`,
          entityIds: [head.id],
          data: { lit: circularLit.map((l) => l.aspect.slot) },
        });
      }
      for (const [shape, aspects] of arrowsLit) {
        if (aspects.length > 1) {
          out.error({
            code: 'arrow_aspects_conflict',
            message: `head ${head.id} has ${aspects.length} ${shape} aspects lit at once`,
            entityIds: [head.id],
            data: { lit: aspects.map((a) => a.slot) },
          });
        }
      }
    }

    const permissionByMovement = new Map<
      string,
      { permission: RO<MovementPermission>; controllerId: string }
    >();
    for (const controller of world.signalControllers) {
      for (const permission of controller.movementPermissions) {
        if (permissionByMovement.has(permission.movementId)) {
          out.error({
            code: 'duplicate_permission',
            message: `movement ${permission.movementId} has more than one permission entry`,
            entityIds: [controller.id, permission.movementId],
          });
        }
        permissionByMovement.set(permission.movementId, {
          permission,
          controllerId: controller.id,
        });
        checkPermission(
          out,
          index,
          controller.id,
          permission,
          lit.get(permission.movementId) ?? [],
        );
      }
    }
    for (const [movementId] of lit) {
      if (!permissionByMovement.has(movementId)) {
        out.error({
          code: 'movement_permission_missing',
          message: `movement ${movementId} is controlled by a lit aspect but has no controller permission`,
          entityIds: [movementId],
        });
      }
    }
    checkSimultaneousConflicts(out, index, permissionByMovement);
    return out.diagnostics;
  },
};

function checkHeadLayout(out: Collector, index: WorldIndex, head: RO<SignalHead>): void {
  const asset = index.asset(head.asset);
  if (!asset) return; // source_applicability reports the unresolved reference
  if (asset.geometry.kind !== 'signal_head') {
    out.error({
      code: 'head_asset_not_signal',
      message: `signal head ${head.id} uses ${asset.id}, whose geometry is '${asset.geometry.kind}'`,
      entityIds: [head.id, asset.id],
    });
    return;
  }
  const profile = asset.geometry.head;
  checkProfileLensOrder(out, head, asset.id, profile);
  const bySlot = new Map(profile.aspects.map((slot) => [slot.slot, slot] as const));
  const seen = new Set<string>();
  for (const aspect of head.aspects) {
    if (seen.has(aspect.slot)) {
      out.error({
        code: 'aspect_layout_mismatch',
        message: `head ${head.id} declares slot '${aspect.slot}' twice`,
        entityIds: [head.id, asset.id],
        data: { kind: 'duplicate_slot', slot: aspect.slot },
      });
    }
    seen.add(aspect.slot);
    const slot = bySlot.get(aspect.slot);
    if (!slot) {
      out.error({
        code: 'aspect_layout_mismatch',
        message: `head ${head.id} declares slot '${aspect.slot}', which assembly ${asset.id} does not have`,
        entityIds: [head.id, asset.id],
        data: { kind: 'unknown_slot', slot: aspect.slot },
      });
      continue;
    }
    if (slot.colour !== aspect.colour || slot.shape !== aspect.shape) {
      const kind =
        slot.colour !== aspect.colour && slot.shape === aspect.shape
          ? 'colour_swap'
          : slot.shape !== aspect.shape && slot.colour === aspect.colour
            ? 'shape_mismatch'
            : 'colour_and_shape_mismatch';
      out.error({
        code: 'aspect_layout_mismatch',
        message: `head ${head.id} slot '${aspect.slot}' is ${aspect.colour} ${aspect.shape} but assembly ${asset.id} places a ${slot.colour} ${slot.shape} at row ${slot.row}, column ${slot.column}`,
        entityIds: [head.id, asset.id],
        data: {
          kind,
          slot: aspect.slot,
          declared: { colour: aspect.colour, shape: aspect.shape },
          assembly: { colour: slot.colour, shape: slot.shape, row: slot.row, column: slot.column },
        },
      });
    }
  }
  for (const slot of profile.aspects) {
    if (!seen.has(slot.slot)) {
      out.error({
        code: 'aspect_layout_mismatch',
        message: `head ${head.id} omits slot '${slot.slot}' (${slot.colour} ${slot.shape}) of assembly ${asset.id}`,
        entityIds: [head.id, asset.id],
        data: { kind: 'missing_slot', slot: slot.slot },
      });
    }
  }
}

/** Rule 11: red above amber above green in a vertical head; each arrow level with the same-coloured circular lens. */
function checkProfileLensOrder(
  out: Collector,
  head: RO<SignalHead>,
  assetId: string,
  profile: SignalHeadProfile,
): void {
  if (profile.arrangement !== 'vertical') {
    out.warning({
      code: 'horizontal_layout_unverified',
      message: `assembly ${assetId} on head ${head.id} is horizontal; no source in the profile settles horizontal lens order`,
      entityIds: [head.id, assetId],
    });
    return;
  }
  const columns = new Map<number, SignalAspectSlot[]>();
  for (const slot of profile.aspects)
    columns.set(slot.column, [...(columns.get(slot.column) ?? []), slot]);
  for (const [column, slots] of columns) {
    const rows = new Set(slots.map((s) => s.row));
    if (rows.size !== slots.length) {
      out.error({
        code: 'lens_order_invalid',
        message: `assembly ${assetId} places two lenses on one row of column ${column}`,
        entityIds: [head.id, assetId],
        data: { kind: 'row_collision', column },
      });
    }
    const sorted = [...slots].sort((a, b) => a.row - b.row);
    for (let i = 1; i < sorted.length; i += 1) {
      const above = sorted[i - 1];
      const below = sorted[i];
      if (above && below && COLOUR_ORDER[above.colour] > COLOUR_ORDER[below.colour]) {
        const top = sorted[0];
        const bottom = sorted[sorted.length - 1];
        const reversed = top?.colour === 'green' && bottom?.colour === 'red';
        out.error({
          code: 'lens_order_invalid',
          message: `assembly ${assetId} column ${column} places ${above.colour} above ${below.colour}; Rule 11 requires red above amber above green`,
          entityIds: [head.id, assetId],
          data: {
            kind: reversed ? 'reversed' : 'misordered',
            column,
            above: above.slot,
            below: below.slot,
          },
        });
        break;
      }
    }
  }
  const circulars = profile.aspects.filter((s) => s.shape === 'circular');
  for (const slot of profile.aspects) {
    if (slot.shape === 'circular') continue;
    const partner = circulars.find((c) => c.colour === slot.colour);
    if (partner && partner.row !== slot.row) {
      out.error({
        code: 'lens_order_invalid',
        message: `assembly ${assetId} places the ${slot.colour} ${slot.shape} on row ${slot.row} but the ${slot.colour} circular lens on row ${partner.row}; arrows sit level with the same-coloured light`,
        entityIds: [head.id, assetId],
        data: { kind: 'arrow_row_mismatch', slot: slot.slot },
      });
    }
  }
}

/** Movements leaving a lane the head applies to: everything its circular aspects can govern. */
function movementsUnderHead(index: WorldIndex, head: RO<SignalHead>): readonly string[] {
  return index.world.movements
    .filter((m) => head.applicableLaneIds.includes(m.fromLaneId))
    .map((m) => m.id);
}

function checkHeadBindings(out: Collector, index: WorldIndex, head: RO<SignalHead>): void {
  const controlled = new Set<string>();
  for (const aspect of head.aspects) {
    const turn = ARROW_TURN[aspect.shape];
    if (aspect.shape !== 'circular' && aspect.controlsMovementIds.length === 0) {
      out.error({
        code: 'arrow_without_movement',
        message: `head ${head.id} aspect '${aspect.slot}' (${aspect.shape}) controls no movement`,
        entityIds: [head.id],
      });
    }
    for (const movementId of aspect.controlsMovementIds) {
      controlled.add(movementId);
      const movement = index.movements.get(movementId);
      if (!movement) {
        out.error({
          code: 'aspect_controls_unknown_movement',
          message: `head ${head.id} aspect '${aspect.slot}' controls unknown movement ${movementId}`,
          entityIds: [head.id, movementId],
        });
        continue;
      }
      if (!head.applicableLaneIds.includes(movement.fromLaneId)) {
        out.error({
          code: 'aspect_controls_foreign_lane',
          message: `head ${head.id} aspect '${aspect.slot}' controls ${movementId}, which leaves lane ${movement.fromLaneId} the head does not apply to`,
          entityIds: [head.id, movementId, movement.fromLaneId],
        });
      }
      if (turn && movement.turn !== turn) {
        out.error({
          code: 'arrow_shape_movement_mismatch',
          message: `head ${head.id} aspect '${aspect.slot}' is an ${aspect.shape} but controls the ${movement.turn} movement ${movementId}`,
          entityIds: [head.id, movementId],
          data: { shape: aspect.shape, turn: movement.turn },
        });
      }
      if (aspect.shape === 'letter_b') checkBusOnlyBinding(out, index, head, aspect, movement);
    }
  }
  for (const laneId of head.applicableLaneIds) {
    const lane = index.lanes.get(laneId);
    if (!lane) continue;
    for (const movementId of lane.outgoingMovementIds) {
      if (!controlled.has(movementId)) {
        out.error({
          code: 'movement_not_controlled_by_head',
          message: `head ${head.id} applies to lane ${laneId} but no aspect controls its movement ${movementId}`,
          entityIds: [head.id, movementId],
        });
      }
    }
  }
}

/** A green "B" speaks to buses only: the bound movement must leave a bus-only lane and no other vehicle may act on it. */
function checkBusOnlyBinding(
  out: Collector,
  index: WorldIndex,
  head: RO<SignalHead>,
  aspect: RO<SignalAspect>,
  movement: RO<Movement>,
): void {
  const lane = index.lanes.get(movement.fromLaneId);
  if (lane?.allowedVehicleClasses.some((cls) => cls !== 'bus')) {
    out.error({
      code: 'b_aspect_lane_not_bus_only',
      message: `head ${head.id} 'B' aspect '${aspect.slot}' controls ${movement.id} from lane ${lane.id}, which admits ${lane.allowedVehicleClasses.join('/')}`,
      entityIds: [head.id, movement.id, lane.id],
    });
  }
  for (const actor of index.world.actors) {
    if (actor.movementId === movement.id && actor.category !== 'bus') {
      out.error({
        code: 'b_aspect_grants_non_bus',
        message: `${actor.category} ${actor.id} performs ${movement.id}, a movement governed by the buses-only 'B' aspect on head ${head.id}`,
        entityIds: [head.id, actor.id, movement.id],
      });
    }
  }
}

function expectedPermission(lit: readonly LitAspect[]): {
  readonly permission: Permission;
  readonly governing: LitAspect | null;
  readonly redArrow: LitAspect | null;
} {
  const arrows = lit.filter((l) => l.aspect.shape !== 'circular');
  const redArrow = arrows.find((l) => l.aspect.colour === 'red') ?? null;
  if (redArrow) return { permission: 'stop', governing: redArrow, redArrow };
  const arrow = arrows[0] ?? null;
  if (arrow) {
    const permission: Permission =
      arrow.aspect.colour === 'green' ? 'proceed_protected' : 'prepare_to_stop';
    return { permission, governing: arrow, redArrow: null };
  }
  const circular = lit.find((l) => l.aspect.shape === 'circular') ?? null;
  if (!circular) return { permission: 'stop', governing: null, redArrow: null };
  if (circular.state === 'flashing')
    return { permission: 'proceed_permissive', governing: circular, redArrow: null };
  const permission: Permission =
    circular.aspect.colour === 'green'
      ? 'proceed_permissive'
      : circular.aspect.colour === 'amber'
        ? 'prepare_to_stop'
        : 'stop';
  return { permission, governing: circular, redArrow: null };
}

function checkPermission(
  out: Collector,
  index: WorldIndex,
  controllerId: string,
  permission: RO<MovementPermission>,
  lit: readonly LitAspect[],
): void {
  if (!index.movements.has(permission.movementId)) {
    out.error({
      code: 'permission_for_unknown_movement',
      message: `controller ${controllerId} grants '${permission.permission}' to unknown movement ${permission.movementId}`,
      entityIds: [controllerId, permission.movementId],
    });
    return;
  }
  for (const ref of permission.governedByAspects) {
    const head = index.signalHeads.get(ref.headId);
    const aspect = head?.aspects.find((a) => a.slot === ref.slot);
    if (!head || !aspect) {
      out.error({
        code: 'governing_aspect_unknown',
        message: `permission for ${permission.movementId} cites unknown aspect ${ref.headId}/${ref.slot}`,
        entityIds: [controllerId, permission.movementId, ref.headId],
      });
      continue;
    }
    // A circular aspect governs every movement its head applies to; it may also be cited after the
    // arrow that overrides it (precedence order).
    const circularOfApplicableHead =
      aspect.shape === 'circular' &&
      movementsUnderHead(index, head).includes(permission.movementId);
    if (!aspect.controlsMovementIds.includes(permission.movementId) && !circularOfApplicableHead) {
      out.error({
        code: 'governing_aspect_not_bound',
        message: `permission for ${permission.movementId} cites aspect ${ref.headId}/${ref.slot}, which does not control that movement`,
        entityIds: [controllerId, permission.movementId, ref.headId],
      });
    }
  }
  const expected = expectedPermission(lit);
  if (lit.length === 0) {
    if (permission.permission !== 'stop') {
      out.error({
        code: 'permission_without_aspect',
        message: `movement ${permission.movementId} is '${permission.permission}' although no lit aspect governs it`,
        entityIds: [controllerId, permission.movementId],
      });
    }
    return;
  }
  if (expected.redArrow && permission.permission !== 'stop') {
    out.error({
      code: 'permission_contradicts_lit_red_arrow',
      message: `movement ${permission.movementId} is '${permission.permission}' while the red ${expected.redArrow.aspect.shape} '${expected.redArrow.aspect.slot}' on head ${expected.redArrow.head.id} is ${expected.redArrow.state}`,
      entityIds: [controllerId, permission.movementId, expected.redArrow.head.id],
      data: { litAspects: lit.map((l) => `${l.head.id}/${l.aspect.slot}`) },
    });
  } else if (permission.permission !== expected.permission) {
    out.error({
      code: 'permission_contradicts_aspects',
      message: `movement ${permission.movementId} is '${permission.permission}' but its lit aspects imply '${expected.permission}'`,
      entityIds: [controllerId, permission.movementId, ...lit.map((l) => l.head.id)],
      data: {
        expected: expected.permission,
        litAspects: lit.map((l) => `${l.head.id}/${l.aspect.slot}`),
      },
    });
  }
  if (expected.governing) {
    const first = permission.governedByAspects[0];
    if (
      first?.headId !== expected.governing.head.id ||
      first.slot !== expected.governing.aspect.slot
    ) {
      out.error({
        code: 'governing_aspects_incomplete',
        message: `permission for ${permission.movementId} must list ${expected.governing.head.id}/${expected.governing.aspect.slot} first: the lit ${expected.governing.aspect.shape} decides it`,
        entityIds: [controllerId, permission.movementId, expected.governing.head.id],
      });
    }
  }
}

/** Two conflicting movements may not both be protected at once, and a protected movement may not share the instant with a proceeding conflict. */
function checkSimultaneousConflicts(
  out: Collector,
  index: WorldIndex,
  permissions: ReadonlyMap<string, { permission: RO<MovementPermission>; controllerId: string }>,
): void {
  const reported = new Set<string>();
  for (const [movementId, { permission, controllerId }] of permissions) {
    if (permission.permission !== 'proceed_protected') continue;
    const movement = index.movements.get(movementId);
    if (!movement) continue;
    for (const otherId of movement.conflictsWith) {
      const other = permissions.get(otherId);
      if (!other?.permission.permission.startsWith('proceed')) continue;
      const key = [movementId, otherId].sort().join('|');
      if (reported.has(key)) continue;
      reported.add(key);
      out.error({
        code: 'unsupported_phase_combination',
        message: `movement ${movementId} is protected while conflicting movement ${otherId} is '${other.permission.permission}'`,
        entityIds: [controllerId, movementId, otherId],
      });
    }
  }
}
