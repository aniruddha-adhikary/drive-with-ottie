import {
  type AnchorKind,
  type ControlRegime,
  type MarkingProfile,
  type MarkingRole,
} from '@ottie/contracts';
import { Collector, type SemanticValidator } from '../world-index';

/** Anchor kinds a marking role may semantically attach to, independent of any asset's own `attachesTo`. */
const ANCHORS_FOR_ROLE: Readonly<Record<MarkingRole, readonly AnchorKind[]>> = {
  give_way_line: ['control_line'],
  stop_line: ['control_line'],
  shoulder_boundary: ['roadside_edge', 'lane_boundary'],
  centre_line_two_way: ['lane_boundary'],
  lane_line_same_direction: ['lane_boundary'],
  edge_line: ['roadside_edge', 'lane_boundary'],
  crossing_bound: ['crossing_bound'],
  pedestrian_crossing: ['crossing_bound'],
  zigzag_warning: ['lane_boundary', 'roadside_edge'],
  yellow_box: ['movement_path', 'lane_boundary'],
  direction_arrow: ['movement_path', 'lane_boundary'],
  bus_lane_line: ['lane_boundary'],
  kerb_restriction: ['roadside_edge'],
  other_marking: [
    'lane_boundary',
    'roadside_edge',
    'movement_path',
    'crossing_bound',
    'control_line',
  ],
};

/** Control regimes in which a transverse control marking is meaningful. */
const REGIMES_FOR_CONTROL_ROLE: Readonly<Partial<Record<MarkingRole, readonly ControlRegime[]>>> = {
  give_way_line: ['give_way'],
  stop_line: ['stop', 'signalised'],
};

interface RoleGeometry {
  readonly rows: number;
  readonly continuous: boolean;
  readonly describe: string;
}

/**
 * Source-backed transverse marking geometry: RMS2 D is a double broken (two-row) line; RMS2 J is a
 * single continuous line. Shape never decides role — the declared role decides which shape is legal.
 */
const GEOMETRY_FOR_ROLE: Readonly<Partial<Record<MarkingRole, RoleGeometry>>> = {
  give_way_line: { rows: 2, continuous: false, describe: 'two-row broken line (RMS2 D)' },
  stop_line: { rows: 1, continuous: true, describe: 'single continuous line (RMS2 J)' },
};

export const markingContext: SemanticValidator = {
  name: 'marking_context',
  run(index) {
    const out = new Collector('marking_context');
    const { world } = index;
    for (const marking of world.markings) {
      const anchor = index.anchors.get(marking.anchorId);
      if (!anchor) {
        out.error({
          code: 'anchor_missing',
          message: `marking ${marking.id} references missing anchor ${marking.anchorId}`,
          entityIds: [marking.id, marking.anchorId],
        });
        continue;
      }
      const allowedAnchors = ANCHORS_FOR_ROLE[marking.role];
      if (!allowedAnchors.includes(anchor.kind)) {
        out.error({
          code: 'role_not_allowed_on_anchor',
          message: `marking ${marking.id} with role '${marking.role}' is placed on a '${anchor.kind}' anchor; that role belongs on ${allowedAnchors.join('/')}`,
          entityIds: [marking.id, anchor.id],
          data: { role: marking.role, anchorKind: anchor.kind, allowed: allowedAnchors },
        });
      }
      const regimes = REGIMES_FOR_CONTROL_ROLE[marking.role];
      if (regimes && !regimes.includes(world.controlRegime)) {
        out.error({
          code: 'role_regime_mismatch',
          message: `marking ${marking.id} (${marking.role}) is not a control for a '${world.controlRegime}' regime`,
          entityIds: [marking.id],
          data: { role: marking.role, regime: world.controlRegime },
        });
      }

      const asset = index.asset(marking.asset);
      if (asset) {
        if (asset.role !== marking.role) {
          out.error({
            code: 'role_asset_mismatch',
            message: `marking ${marking.id} declares role '${marking.role}' but its asset ${asset.id} is a '${asset.role}'`,
            entityIds: [marking.id],
            data: { declaredRole: marking.role, assetRole: asset.role, assetId: asset.id },
          });
        }
        if (asset.geometry.kind !== 'marking') {
          out.error({
            code: 'asset_not_marking',
            message: `marking ${marking.id} uses asset ${asset.id} whose geometry is '${asset.geometry.kind}', not a marking profile`,
            entityIds: [marking.id],
          });
        } else {
          checkProfile(
            out,
            marking.id,
            marking.role,
            asset.id,
            asset.geometry.marking,
            anchor.kind,
          );
        }
      }

      if (anchor.kind === 'control_line') {
        for (const laneId of marking.applicableLaneIds) {
          if (!anchor.controlsLaneIds.includes(laneId)) {
            out.error({
              code: 'lane_not_on_anchor',
              message: `marking ${marking.id} applies to lane ${laneId} but its control line ${anchor.id} does not control that lane`,
              entityIds: [marking.id, anchor.id, laneId],
            });
          }
        }
      }
      for (const movementId of marking.applicableMovementIds) {
        const movement = index.movements.get(movementId);
        if (movement && !marking.applicableLaneIds.includes(movement.fromLaneId)) {
          out.error({
            code: 'movement_not_from_applicable_lane',
            message: `marking ${marking.id} applies to movement ${movementId}, which leaves lane ${movement.fromLaneId} rather than one of its applicable lanes`,
            entityIds: [marking.id, movementId],
          });
        }
      }
      if (marking.extentM && marking.extentM.to < marking.extentM.from) {
        out.error({
          code: 'extent_reversed',
          message: `marking ${marking.id} extent runs backwards`,
          entityIds: [marking.id],
        });
      }
    }
    return out.diagnostics;
  },
};

function checkProfile(
  out: Collector,
  markingId: string,
  role: MarkingRole,
  assetId: string,
  profile: MarkingProfile,
  anchorKind: AnchorKind,
): void {
  if (!profile.attachesTo.includes(anchorKind)) {
    out.error({
      code: 'role_not_allowed_on_anchor',
      message: `marking ${markingId}: asset ${assetId} attaches to ${profile.attachesTo.join('/')} anchors, not '${anchorKind}'`,
      entityIds: [markingId],
      data: { assetId, anchorKind, attachesTo: profile.attachesTo },
    });
  }
  const expected = GEOMETRY_FOR_ROLE[role];
  if (!expected) return;
  if (profile.rows !== expected.rows || profile.continuous !== expected.continuous) {
    out.error({
      code: 'geometry_role_mismatch',
      message: `marking ${markingId} with role '${role}' must be a ${expected.describe}; asset ${assetId} renders ${profile.rows} row(s), ${profile.continuous ? 'continuous' : 'broken'}`,
      entityIds: [markingId],
      data: {
        role,
        assetId,
        rows: profile.rows,
        continuous: profile.continuous,
        expectedRows: expected.rows,
        expectedContinuous: expected.continuous,
      },
    });
  }
}
