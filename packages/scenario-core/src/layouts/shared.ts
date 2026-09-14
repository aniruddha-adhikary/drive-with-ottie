import {
  type Actor,
  type AssetRef,
  type CameraPreset,
  type CompassDirection,
  type Conditions,
  type Diagnostic,
  type EntityId,
  type EvidenceRequirement,
  type Lane,
  type Movement,
  type MovementId,
  type MovementTurn,
  type TemplateId,
  type World,
  metres,
} from '@ottie/contracts';
import { ASSET_DEV_BUS, ASSET_DEV_CAR, ref } from '@ottie/contracts/fixtures';
import { type QuarterTurns, pointAlongLane } from '../geometry';
import { type ResolvedParameters } from '../parameters';
import { type Daylight, type SafeVariationDraw } from '../variation';

/** Movement paths enter and leave the junction box this far from the junction centre along each road. */
export const JUNCTION_CLEARANCE_M = 6;
/** Control lines sit this far upstream of the crossing road's edge (schematic teaching choice, see fixture notes). */
export const CONTROL_LINE_SETBACK_M = 1;

export type WorldBody = Omit<World, 'id' | 'schemaVersion' | 'conventions' | 'provenance'>;

export interface LayoutInput {
  readonly parameters: ResolvedParameters;
  readonly variation: SafeVariationDraw;
}

export type LayoutResult =
  | {
      readonly ok: true;
      /** World body in the layout's canonical orientation, before `turns` is applied. */
      readonly body: WorldBody;
      /** Quarter turns that realise the requested approach direction. */
      readonly turns: QuarterTurns;
      readonly notes: readonly string[];
      readonly diagnostics: readonly Diagnostic[];
    }
  | { readonly ok: false; readonly diagnostics: readonly Diagnostic[] };

const COMPASS_CCW: readonly CompassDirection[] = ['east', 'north', 'west', 'south'];

/** A world-frame compass direction expressed in a layout's canonical (un-rotated) frame. */
export function toCanonicalCompass(direction: CompassDirection, turns: QuarterTurns): CompassDirection {
  return COMPASS_CCW[(COMPASS_CCW.indexOf(direction) - turns + 4) % 4] ?? direction;
}

export interface TemplateLayout {
  readonly templateId: TemplateId;
  readonly templateVersion: number;
  build(input: LayoutInput): LayoutResult;
}

export type VehicleCategory = 'car' | 'bus' | 'lorry' | 'motorcycle';

interface VehicleProfile {
  readonly asset: AssetRef | null;
  readonly dimensionsM: Actor['dimensionsM'];
  readonly frontOffsetM: number;
}

/** Schematic vehicle envelopes (teaching choices, not source values). Only car and bus have development assets. */
export const VEHICLE_PROFILES: Readonly<Record<VehicleCategory, VehicleProfile>> = Object.freeze({
  car: { asset: ref(ASSET_DEV_CAR), dimensionsM: { length: metres(4.5), width: metres(1.8), height: metres(1.5) }, frontOffsetM: 2.25 },
  bus: { asset: ref(ASSET_DEV_BUS), dimensionsM: { length: metres(12), width: metres(2.5), height: metres(3.2) }, frontOffsetM: 6 },
  lorry: { asset: null, dimensionsM: { length: metres(8), width: metres(2.5), height: metres(3) }, frontOffsetM: 4 },
  motorcycle: { asset: null, dimensionsM: { length: metres(2.2), width: metres(0.8), height: metres(1.2) }, frontOffsetM: 1.1 },
});

export interface ActorSpec {
  readonly id: EntityId;
  readonly category: VehicleCategory;
  readonly isEgo: boolean;
  readonly lane: Lane;
  readonly movementId: MovementId;
  readonly progressM: number;
  readonly intention: MovementTurn;
  readonly indicator: Actor['indicator'];
  readonly speedKmh: number;
}

/** Places a vehicle on its lane; the pose is derived from lane geometry and progress, never authored. */
export function placeActor(spec: ActorSpec): Actor {
  const profile = VEHICLE_PROFILES[spec.category];
  const at = pointAlongLane(spec.lane, spec.progressM, 0);
  return {
    id: spec.id,
    category: spec.category,
    asset: profile.asset,
    isEgo: spec.isEgo,
    laneId: spec.lane.id,
    movementId: spec.movementId,
    progressM: metres(spec.progressM),
    lateralOffsetM: metres(0),
    dimensionsM: profile.dimensionsM,
    frontOffsetM: metres(profile.frontOffsetM),
    pose: { position: at.position, yaw: at.heading },
    intention: spec.intention,
    indicator: spec.indicator,
    speedKmh: spec.speedKmh,
  };
}

export function withOutgoing(lanes: readonly Lane[], movements: readonly Movement[]): readonly Lane[] {
  return lanes.map((lane) => ({ ...lane, outgoingMovementIds: movements.filter((m) => m.fromLaneId === lane.id).map((m) => m.id) }));
}

export interface ConditionsBase {
  readonly date: string;
  readonly weekday: Conditions['weekday'];
  readonly publicHoliday: boolean;
  readonly weather: Conditions['weather'];
  readonly visibility: Conditions['visibility'];
  readonly surface: Conditions['surface'];
  readonly egoVehicleClass: Conditions['egoVehicleClass'];
  /** Local time of day used for each lighting condition so `localDateTime` and `daylight` never disagree. */
  readonly timeByDaylight: Readonly<Record<Daylight, string>>;
}

export function conditionsFor(base: ConditionsBase, daylight: Daylight): Conditions {
  return {
    localDateTime: `${base.date}T${base.timeByDaylight[daylight]}`,
    weekday: base.weekday,
    publicHoliday: base.publicHoliday,
    weather: base.weather,
    visibility: base.visibility,
    surface: base.surface,
    daylight,
    egoVehicleClass: base.egoVehicleClass,
  };
}

/** Removes evidence requirements (and every reference to them) whose subject is absent from this variant. */
export function pruneEvidence(
  evidence: readonly EvidenceRequirement[],
  cameraPresets: readonly CameraPreset[],
  removedIds: readonly string[],
): { readonly evidence: readonly EvidenceRequirement[]; readonly cameraPresets: readonly CameraPreset[] } {
  if (removedIds.length === 0) return { evidence, cameraPresets };
  const removed = new Set(removedIds);
  return {
    evidence: evidence.filter((e) => !removed.has(e.id)).map((e) => ({ ...e, coVisibleWith: e.coVisibleWith.filter((id) => !removed.has(id)) })),
    cameraPresets: cameraPresets.map((c) => ({ ...c, evidenceIds: c.evidenceIds.filter((id) => !removed.has(id)) })),
  };
}

export function turnIndicator(turn: MovementTurn): Actor['indicator'] {
  return turn === 'left' ? 'left' : turn === 'right' || turn === 'u_turn' ? 'right' : 'none';
}

/** Warning emitted when a declared vehicle category has no development asset and is drawn from its envelope only. */
export function actorWithoutAssetDiagnostic(actor: Actor): Diagnostic | null {
  if (actor.asset !== null) return null;
  return {
    validator: 'structural_integrity',
    severity: 'warning',
    code: 'generator.actor_without_asset',
    message: `actor ${actor.id} (${actor.category}) has no development asset; renderers must use its schematic envelope`,
    entityIds: [actor.id],
  };
}
