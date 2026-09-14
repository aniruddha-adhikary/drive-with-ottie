import { type Diagnostic, type Lane, type Movement } from '@ottie/contracts';
import { directionOf } from './geometry';

function error(code: string, message: string, entityIds: readonly string[]): Diagnostic {
  return { validator: 'structural_integrity', severity: 'error', code, message, entityIds };
}

/**
 * Checks that the movement graph's priority/conflict/yield relationships are internally
 * consistent. These relationships are authored semantically by the layout (from the control
 * regime), never inferred from rendered geometry; this check catches authoring mistakes:
 *  - conflicts are symmetric;
 *  - `yieldsTo` ⊆ `conflictsWith`;
 *  - a protected movement yields to nothing;
 *  - a yield / stop_then_yield movement yields to every conflicting protected movement;
 *  - a movement never conflicts with or yields to itself.
 */
export function checkMovementPriorityConsistency(movements: readonly Movement[]): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const byId = new Map(movements.map((m) => [m.id, m] as const));
  for (const m of movements) {
    if (m.conflictsWith.includes(m.id) || m.yieldsTo.includes(m.id)) {
      diagnostics.push(error('generator.priority.self_reference', `movement ${m.id} references itself`, [m.id]));
    }
    for (const other of m.conflictsWith) {
      const o = byId.get(other);
      if (o && !o.conflictsWith.includes(m.id)) {
        diagnostics.push(error('generator.priority.asymmetric_conflict', `movement ${m.id} conflicts with ${other} but not vice versa`, [m.id, other]));
      }
    }
    for (const other of m.yieldsTo) {
      if (!m.conflictsWith.includes(other)) {
        diagnostics.push(error('generator.priority.yield_without_conflict', `movement ${m.id} yields to ${other} without a declared conflict`, [m.id, other]));
      }
    }
    if (m.priority === 'protected' && m.yieldsTo.length > 0) {
      diagnostics.push(error('generator.priority.protected_yields', `protected movement ${m.id} must not yield`, [m.id]));
    }
    if (m.priority === 'yield' || m.priority === 'stop_then_yield') {
      for (const other of m.conflictsWith) {
        const o = byId.get(other);
        if (o?.priority === 'protected' && !m.yieldsTo.includes(other)) {
          diagnostics.push(error('generator.priority.missing_yield', `${m.priority} movement ${m.id} must yield to protected ${other}`, [m.id, other]));
        }
      }
    }
  }
  return diagnostics;
}

/**
 * Checks directed-lane connectivity: each movement leaves a real lane and enters a real lane,
 * every `outgoingMovementIds` entry is exactly the set of movements starting on that lane, and a
 * movement's path begins in the direction of its origin lane.
 */
export function checkLaneConnectivity(lanes: readonly Lane[], movements: readonly Movement[]): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const byId = new Map(lanes.map((l) => [l.id, l] as const));
  for (const m of movements) {
    const from = byId.get(m.fromLaneId);
    if (!from) diagnostics.push(error('generator.connectivity.unknown_from_lane', `movement ${m.id} leaves unknown lane ${m.fromLaneId}`, [m.id]));
    if (!byId.has(m.toLaneId)) diagnostics.push(error('generator.connectivity.unknown_to_lane', `movement ${m.id} enters unknown lane ${m.toLaneId}`, [m.id]));
    const a = m.path[0];
    const b = m.path[1];
    if (!a || !b) {
      diagnostics.push(error('generator.connectivity.short_path', `movement ${m.id} path needs at least two points`, [m.id]));
    } else if (from) {
      const dir = directionOf(from.heading);
      if ((b.x - a.x) * dir.x + (b.y - a.y) * dir.y <= 0) {
        diagnostics.push(error('generator.connectivity.path_against_lane', `movement ${m.id} path does not start in the travel direction of ${from.id}`, [m.id, from.id]));
      }
    }
  }
  for (const lane of lanes) {
    const expected = movements.filter((m) => m.fromLaneId === lane.id).map((m) => m.id);
    const same = expected.length === lane.outgoingMovementIds.length && expected.every((id, i) => lane.outgoingMovementIds[i] === id);
    if (!same) diagnostics.push(error('generator.connectivity.outgoing_mismatch', `lane ${lane.id} outgoingMovementIds do not match movements leaving it`, [lane.id]));
  }
  return diagnostics;
}
