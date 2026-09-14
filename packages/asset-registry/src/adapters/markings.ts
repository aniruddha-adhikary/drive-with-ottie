import {
  type AnchorKind,
  type AssetId,
  type Diagnostic,
  type GeometryProfile,
  type MarkingGeometryProfile,
  type MarkingRole,
  markingRowGeometryProfileSchema,
  millimetres,
} from '@ottie/contracts';
import { registryDiagnostic } from '../diagnostics';

/**
 * Semantic role per parametric RMS marking, keyed by the extraction id whose manifest `name`
 * carries the drawing's own title (e.g. "Give Way line — D", "Stop line — J"). Markings absent
 * here are `other_marking` until curated; no role is derived from paint geometry.
 */
export const MARKING_ROLE_BY_ID: Readonly<Record<string, MarkingRole>> = {
  'sg.markings.control-give-way-d': 'give_way_line',
  'sg.markings.control-stop-j': 'stop_line',
  'sg.markings.edge-paved-shoulder-j': 'shoulder_boundary',
  'sg.markings.centre-broken-two-way-e': 'centre_line_two_way',
  'sg.markings.centre-continuous-single-f': 'centre_line_two_way',
  'sg.markings.boundary-continuous-double-h': 'centre_line_two_way',
  'sg.markings.lane-separator-ordinary-b': 'lane_line_same_direction',
  'sg.markings.lane-separator-expressway-b1': 'lane_line_same_direction',
  'sg.markings.lane-separator-signal-approach-c': 'lane_line_same_direction',
  'sg.markings.edge-auxiliary-a': 'edge_line',
  'sg.markings.edge-speed-change-a2': 'edge_line',
  'sg.markings.edge-centre-divider-m': 'edge_line',
  'sg.markings.crossing-signalised-boundary-a4': 'crossing_bound',
  'sg.markings.crossing-signalised-bicycle-a8': 'crossing_bound',
  'sg.markings.bus-lane-normal-turn-access-a1': 'bus_lane_line',
  'sg.markings.bus-lane-normal-emergence-a3': 'bus_lane_line',
  'sg.markings.bus-lane-full-day-turn-access-a6': 'bus_lane_line',
  'sg.markings.bus-lane-full-day-emergence-a7': 'bus_lane_line',
  'sg.markings.parking-yellow-single-g': 'kerb_restriction',
  'sg.markings.parking-yellow-double-i': 'kerb_restriction',
  'sg.markings.yellow-box-diagonal-n': 'yellow_box',
  'sg.markings.yellow-box-side-n': 'yellow_box',
  'sg.markings.guidance-through-a5': 'direction_arrow',
  'sg.markings.guidance-intersecting-through-a9': 'direction_arrow',
};

const ATTACHES_TO: Readonly<Record<MarkingRole, readonly AnchorKind[]>> = {
  give_way_line: ['control_line'],
  stop_line: ['control_line'],
  shoulder_boundary: ['lane_boundary', 'roadside_edge'],
  centre_line_two_way: ['lane_boundary'],
  lane_line_same_direction: ['lane_boundary'],
  edge_line: ['lane_boundary', 'roadside_edge'],
  crossing_bound: ['crossing_bound'],
  pedestrian_crossing: ['crossing_bound'],
  zigzag_warning: ['lane_boundary'],
  yellow_box: ['movement_path'],
  direction_arrow: ['movement_path'],
  bus_lane_line: ['lane_boundary'],
  kerb_restriction: ['roadside_edge'],
  other_marking: [],
};

export function markingRoleFor(id: AssetId): MarkingRole {
  return MARKING_ROLE_BY_ID[id] ?? 'other_marking';
}

export interface MarkingGeometryResult {
  readonly geometry: GeometryProfile;
  readonly diagnostics: readonly Diagnostic[];
}

/**
 * Lifts a parsed geometry JSON into a `MarkingProfile`. Only the row layout with a single row width
 * maps onto the profile; circle groups and per-row widths stay `reference_only` (with an info
 * diagnostic) rather than being approximated.
 */
export function markingGeometryFor(id: AssetId, role: MarkingRole, profile: MarkingGeometryProfile | null): MarkingGeometryResult {
  if (profile === null) {
    return { geometry: { kind: 'reference_only' }, diagnostics: [] };
  }
  const row = markingRowGeometryProfileSchema.safeParse(profile);
  if (!row.success) {
    return {
      geometry: { kind: 'reference_only' },
      diagnostics: [registryDiagnostic('marking_geometry_unexpressible', 'info', `${id}: circle-group geometry has no MarkingProfile representation`, [id])],
    };
  }
  const rows = row.data.rows;
  const params = row.data.parameters_mm;
  const width = params.width;
  if (width === undefined) {
    return {
      geometry: { kind: 'reference_only' },
      diagnostics: [registryDiagnostic('marking_geometry_unexpressible', 'info', `${id}: per-row widths have no MarkingProfile representation`, [id], { parameters: Object.keys(params) })],
    };
  }
  if (!(width > 0)) {
    return {
      geometry: { kind: 'reference_only' },
      diagnostics: [registryDiagnostic('marking_geometry_invalid', 'error', `${id}: non-positive width in geometry profile`, [id], { width })],
    };
  }
  const painted = params.painted_length;
  const gap = params.clear_gap;
  const interRow = params.inter_row_clear_gap;
  const diagnostics: Diagnostic[] = [];
  if ((painted === undefined) !== (gap === undefined)) {
    diagnostics.push(registryDiagnostic('marking_geometry_invalid', 'error', `${id}: painted_length and clear_gap must be given together`, [id]));
  }
  if (rows > 1 && interRow === undefined) {
    diagnostics.push(registryDiagnostic('marking_geometry_invalid', 'error', `${id}: multi-row profile without inter_row_clear_gap`, [id]));
  }
  if (diagnostics.length > 0) {
    return { geometry: { kind: 'reference_only' }, diagnostics };
  }
  return {
    geometry: {
      kind: 'marking',
      marking: {
        rows,
        widthMm: millimetres(width),
        paintedLengthMm: painted === undefined ? null : millimetres(painted),
        clearGapMm: gap === undefined ? null : millimetres(gap),
        interRowClearGapMm: interRow === undefined ? null : millimetres(interRow),
        continuous: painted === undefined,
        attachesTo: ATTACHES_TO[role],
      },
    },
    diagnostics: [],
  };
}
