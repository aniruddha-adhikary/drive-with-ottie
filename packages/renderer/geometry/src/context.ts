import { Group, type Object3D } from 'three';
import {
  type AssetDefinition,
  type AssetRef,
  type AssetResolver,
  type AttachmentPoint,
  type DeepReadonly,
  type GeometryProfile,
  type World,
} from '@ottie/contracts';
import { MaterialCache, SCHEMATIC, type SchematicKey } from './materials';
import { type ParsedArtwork } from './artwork';
import {
  type RenderedEntity,
  type SceneIssue,
  type SceneIssueCode,
  type SchematicChoice,
} from './types';

/** Artwork already loaded, hash-verified and parsed, keyed by the asset file path. */
export type ArtworkBundle = ReadonlyMap<string, ParsedArtwork>;

/** Mutable state shared by the per-kind builders while one WorldScene is assembled. */
export class BuildContext {
  readonly physical = new Group();
  readonly overlay = new Group();
  readonly materials = new MaterialCache();
  readonly entities = new Map<string, RenderedEntity>();
  readonly issues: SceneIssue[] = [];
  private readonly used = new Set<SchematicKey>();

  constructor(
    readonly world: DeepReadonly<World>,
    readonly resolver: AssetResolver,
    readonly artwork: ArtworkBundle,
  ) {
    this.physical.name = 'layer:physical';
    this.overlay.name = 'layer:overlay';
    this.overlay.visible = false;
  }

  issue(code: SceneIssueCode, entityId: string | null, message: string): void {
    this.issues.push({ code, entityId, message });
  }

  /** Read a schematic constant and record that this scene depends on it. */
  schematic(key: SchematicKey): number {
    this.used.add(key);
    return SCHEMATIC[key].value;
  }

  schematicChoices(): readonly SchematicChoice[] {
    return [...this.used].sort().map((key) => SCHEMATIC[key]);
  }

  register(entity: RenderedEntity, parent: Object3D = this.physical): void {
    parent.add(entity.object);
    this.entities.set(entity.id, entity);
  }

  /** Resolve an asset ref and check its geometry kind; unresolved or mismatched assets are issues. */
  resolveGeometry<K extends GeometryProfile['kind']>(
    ref: AssetRef | null,
    kind: K,
    entityId: string,
  ): {
    readonly asset: AssetDefinition;
    readonly geometry: Extract<GeometryProfile, { kind: K }>;
  } | null {
    if (!ref) {
      this.issue('unresolved_asset', entityId, 'no asset reference');
      return null;
    }
    const resolution = this.resolver.resolve(ref);
    if (!resolution.ok) {
      this.issue(
        'unresolved_asset',
        entityId,
        `${ref.id}@${ref.version}: ${resolution.reason} (${resolution.detail})`,
      );
      return null;
    }
    const { geometry } = resolution.asset;
    if (geometry.kind !== kind) {
      this.issue(
        'asset_geometry_mismatch',
        entityId,
        `${ref.id}@${ref.version} has ${geometry.kind} geometry, expected ${kind}`,
      );
      return null;
    }
    return { asset: resolution.asset, geometry: geometry as Extract<GeometryProfile, { kind: K }> };
  }
}

/** Attachment points of an asset: supports carry theirs inside the geometry profile. */
export function attachmentPointsOf(asset: AssetDefinition): readonly AttachmentPoint[] {
  const own = asset.attachments;
  return asset.geometry.kind === 'support' ? [...asset.geometry.attachments, ...own] : own;
}
