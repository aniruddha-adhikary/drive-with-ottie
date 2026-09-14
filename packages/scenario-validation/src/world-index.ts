import {
  type Actor,
  type Anchor,
  type AnchorOfKind,
  type AssetDefinition,
  type AssetRef,
  type AssetResolution,
  type CameraPreset,
  type DeepReadonly,
  type Diagnostic,
  type DiagnosticSeverity,
  type EvidenceRequirement,
  type Lane,
  type Marking,
  type Movement,
  type Road,
  type SignFace,
  type SignalController,
  type SignalHead,
  type SourceLocator,
  type Support,
  type ValidatorName,
  type World,
} from '@ottie/contracts';
import { type ValidationContext } from './context';

export type RO<T> = DeepReadonly<T>;

export interface DiagnosticInput {
  readonly code: string;
  readonly message: string;
  readonly entityIds?: readonly string[];
  readonly sourceRefs?: readonly SourceLocator[];
  readonly data?: Readonly<Record<string, unknown>>;
}

/** Collects diagnostics for one validator family; codes are prefixed with the family name. */
export class Collector {
  readonly diagnostics: Diagnostic[] = [];

  constructor(private readonly validator: ValidatorName) {}

  private push(severity: DiagnosticSeverity, input: DiagnosticInput): void {
    this.diagnostics.push({
      validator: this.validator,
      severity,
      code: `${this.validator}.${input.code}`,
      message: input.message,
      entityIds: input.entityIds ?? [],
      ...(input.sourceRefs ? { sourceRefs: input.sourceRefs } : {}),
      ...(input.data ? { data: input.data } : {}),
    });
  }

  error(input: DiagnosticInput): void {
    this.push('error', input);
  }

  warning(input: DiagnosticInput): void {
    this.push('warning', input);
  }

  info(input: DiagnosticInput): void {
    this.push('info', input);
  }
}

export type EntityKind =
  | 'road'
  | 'lane'
  | 'movement'
  | 'anchor'
  | 'marking'
  | 'support'
  | 'sign_face'
  | 'signal_head'
  | 'signal_controller'
  | 'actor'
  | 'depicted_violation';

/** Read-only lookup tables over a world plus memoised C1 asset resolutions. */
export class WorldIndex {
  readonly roads = new Map<string, RO<Road>>();
  readonly lanes = new Map<string, RO<Lane>>();
  readonly movements = new Map<string, RO<Movement>>();
  readonly anchors = new Map<string, RO<Anchor>>();
  readonly markings = new Map<string, RO<Marking>>();
  readonly supports = new Map<string, RO<Support>>();
  readonly signFaces = new Map<string, RO<SignFace>>();
  readonly signalHeads = new Map<string, RO<SignalHead>>();
  readonly controllers = new Map<string, RO<SignalController>>();
  readonly actors = new Map<string, RO<Actor>>();
  readonly evidence = new Map<string, RO<EvidenceRequirement>>();
  readonly cameras = new Map<string, RO<CameraPreset>>();
  readonly kinds = new Map<string, EntityKind>();
  private readonly resolutions = new Map<string, AssetResolution>();

  constructor(
    readonly world: RO<World>,
    readonly ctx: ValidationContext,
  ) {
    const put = <T extends { readonly id: string }>(
      map: Map<string, T>,
      items: readonly T[],
      kind: EntityKind,
    ) => {
      for (const item of items) {
        map.set(item.id, item);
        this.kinds.set(item.id, kind);
      }
    };
    put(this.roads, world.roads, 'road');
    put(this.lanes, world.lanes, 'lane');
    put(this.movements, world.movements, 'movement');
    put(this.anchors, world.anchors, 'anchor');
    put(this.markings, world.markings, 'marking');
    put(this.supports, world.supports, 'support');
    put(this.signFaces, world.signFaces, 'sign_face');
    put(this.signalHeads, world.signalHeads, 'signal_head');
    put(this.controllers, world.signalControllers, 'signal_controller');
    put(this.actors, world.actors, 'actor');
    for (const violation of world.depictedViolations)
      this.kinds.set(violation.id, 'depicted_violation');
    for (const item of world.evidence) this.evidence.set(item.id, item);
    for (const camera of world.cameraPresets) this.cameras.set(camera.name, camera);
  }

  resolve(ref: RO<AssetRef>): AssetResolution {
    const key = `${ref.id}@${String(ref.version)}`;
    const cached = this.resolutions.get(key);
    if (cached) return cached;
    const resolution = this.ctx.assets.resolve(ref);
    this.resolutions.set(key, resolution);
    return resolution;
  }

  /** Resolved asset definition or null when the C1 resolver refuses the reference. */
  asset(ref: RO<AssetRef> | null): AssetDefinition | null {
    if (ref === null) return null;
    const resolution = this.resolve(ref);
    return resolution.ok ? resolution.asset : null;
  }

  anchorOfKind<K extends Anchor['kind']>(id: string, kind: K): RO<AnchorOfKind<K>> | null {
    const anchor = this.anchors.get(id);
    if (anchor?.kind !== kind) return null;
    return anchor as RO<AnchorOfKind<K>>;
  }

  controlLines(): readonly RO<AnchorOfKind<'control_line'>>[] {
    return this.world.anchors.filter(
      (a): a is RO<AnchorOfKind<'control_line'>> => a.kind === 'control_line',
    );
  }

  laneRoad(laneId: string): RO<Road> | null {
    const lane = this.lanes.get(laneId);
    return lane ? (this.roads.get(lane.roadId) ?? null) : null;
  }

  ego(): RO<Actor> | null {
    return this.world.actors.find((a) => a.isEgo) ?? null;
  }

  /** Every asset reference placed in the world with the entity that carries it. */
  placedAssetRefs(): readonly {
    readonly entityId: string;
    readonly kind: EntityKind;
    readonly ref: RO<AssetRef>;
    readonly laneIds: readonly string[];
  }[] {
    const out: {
      entityId: string;
      kind: EntityKind;
      ref: RO<AssetRef>;
      laneIds: readonly string[];
    }[] = [];
    for (const m of this.world.markings)
      out.push({ entityId: m.id, kind: 'marking', ref: m.asset, laneIds: m.applicableLaneIds });
    for (const s of this.world.supports)
      if (s.asset) out.push({ entityId: s.id, kind: 'support', ref: s.asset, laneIds: [] });
    for (const f of this.world.signFaces)
      out.push({ entityId: f.id, kind: 'sign_face', ref: f.asset, laneIds: f.applicableLaneIds });
    for (const h of this.world.signalHeads)
      out.push({ entityId: h.id, kind: 'signal_head', ref: h.asset, laneIds: h.applicableLaneIds });
    for (const a of this.world.actors)
      if (a.asset)
        out.push({
          entityId: a.id,
          kind: 'actor',
          ref: a.asset,
          laneIds: a.laneId ? [a.laneId] : [],
        });
    return out;
  }
}

export interface SemanticValidator {
  readonly name: ValidatorName;
  run(index: WorldIndex): readonly Diagnostic[];
}
