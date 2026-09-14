import {
  type BufferGeometry,
  DoubleSide,
  FrontSide,
  Line,
  LineBasicMaterial,
  type Material,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  type Object3D,
  Points,
  type Side,
} from 'three';
import { type AspectState, type SignalAspectColour } from '@ottie/contracts';
import { type SchematicChoice } from './types';

/**
 * Named road materials. These are screen approximations for a teaching scene, independent of the
 * interface `brand.*` tokens (docs/VISUAL-SYSTEM.md). They are not engineering colour
 * specifications; sign faces take their colours from the extracted SVG, not from this table.
 */
export const ROAD_MATERIAL_COLOURS = Object.freeze({
  'road.verge': 0x5f7a52,
  'road.surface': 0x3c3f45,
  'roadControl.paint.white': 0xf4f4f0,
  'roadControl.sign.backing': 0x9ea3a8,
  'roadControl.support.post': 0x8a8f94,
  'roadControl.signal.housing': 0x1d1f22,
  'roadControl.signal.lensDark': 0x15171a,
  'vehicle.ego': 0xffd34e,
  'vehicle.car': 0x6b7f99,
  'vehicle.bus': 0x3f7f6f,
  'vehicle.lorry': 0x7f6b4f,
  'vehicle.twoWheeler': 0x555a60,
  'vehicle.person': 0x8c6d9c,
  'vehicle.glass': 0xb9d2e6,
  'vehicle.wheel': 0x101214,
  'vehicle.lamp.dark': 0x3a2a10,
  'vehicle.headlamp': 0xf7f3d8,
  'overlay.guide': 0x285be3,
} as const);

export type RoadMaterialName = keyof typeof ROAD_MATERIAL_COLOURS;

/** Lit and dark screen colours per aspect colour; `flashing` renders lit at the frozen instant. */
export const SIGNAL_LENS_COLOURS: Readonly<
  Record<SignalAspectColour, { readonly lit: number; readonly dark: number }>
> = Object.freeze({
  red: { lit: 0xff1f1f, dark: 0x4a0f0f },
  amber: { lit: 0xffb300, dark: 0x4d3300 },
  green: { lit: 0x17d24a, dark: 0x0d3d1c },
});

export function lensColour(colour: SignalAspectColour, state: AspectState | null): number {
  const pair = SIGNAL_LENS_COLOURS[colour];
  return state === 'lit' || state === 'flashing' ? pair.lit : pair.dark;
}

/**
 * Teaching-layout choices the renderer makes where the world and assets are silent. Each is
 * recorded on the built scene when used so review output can list them; none is a source value.
 */
export const SCHEMATIC = Object.freeze({
  groundMarginM: {
    key: 'ground.margin',
    description: 'Verge plane extends this far beyond the road bounds',
    value: 20,
    unit: 'm',
  },
  paintLiftM: {
    key: 'paint.lift',
    description: 'Paint quads sit this far above the road surface to avoid z-fighting',
    value: 0.004,
    unit: 'm',
  },
  postRadiusM: {
    key: 'support.post.radius',
    description: 'Schematic sign post radius (no sourced section)',
    value: 0.04,
    unit: 'm',
  },
  poleRadiusM: {
    key: 'support.pole.radius',
    description: 'Schematic signal pole radius (no sourced section)',
    value: 0.075,
    unit: 'm',
  },
  plateThicknessM: {
    key: 'face.plate.thickness',
    description: 'Sign backing plate thickness',
    value: 0.003,
    unit: 'm',
  },
  artworkLiftM: {
    key: 'face.artwork.lift',
    description: 'Vector artwork sits this far in front of the plate',
    value: 0.0005,
    unit: 'm',
  },
  faceFallbackSizeM: {
    key: 'face.fallback.size',
    description: 'Panel size used when the face profile has no dimensions',
    value: 0.6,
    unit: 'm',
  },
  housingDepthM: {
    key: 'signal.housing.depth',
    description: 'Signal housing depth (source gives none)',
    value: 0.25,
    unit: 'm',
  },
  housingMarginM: {
    key: 'signal.housing.margin',
    description: 'Housing extends this far beyond the outermost lens edges',
    value: 0.05,
    unit: 'm',
  },
  lensLiftM: {
    key: 'signal.lens.lift',
    description: 'Lens discs sit this far in front of the housing face',
    value: 0.002,
    unit: 'm',
  },
  arrowGlyphFraction: {
    key: 'signal.arrow.fraction',
    description: 'Arrow glyph span as a fraction of lens diameter',
    value: 0.7,
    unit: 'm',
  },
  vehicleBodyLiftFraction: {
    key: 'vehicle.body.lift',
    description: 'Body underside height as a fraction of vehicle height',
    value: 0.2,
    unit: 'm',
  },
} as const satisfies Record<string, SchematicChoice>);

export type SchematicKey = keyof typeof SCHEMATIC;

/** Per-scene material cache so identical colours share one material and disposal is exact. */
export class MaterialCache {
  private readonly materials = new Map<string, Material>();

  lit(name: RoadMaterialName): MeshLambertMaterial {
    return this.get(
      `lit:${name}`,
      () => new MeshLambertMaterial({ color: ROAD_MATERIAL_COLOURS[name] }),
    );
  }

  unlit(colour: number, side: Side = FrontSide, lift = false): MeshBasicMaterial {
    return this.get(
      `unlit:${colour}:${side}:${String(lift)}`,
      () =>
        new MeshBasicMaterial({
          color: colour,
          side,
          polygonOffset: lift,
          polygonOffsetFactor: lift ? -2 : 0,
          polygonOffsetUnits: lift ? -2 : 0,
        }),
    );
  }

  unlitLine(colour: number): LineBasicMaterial {
    return this.get(`line:${colour}`, () => new LineBasicMaterial({ color: colour }));
  }

  paint(): MeshLambertMaterial {
    return this.get(
      'paint',
      () =>
        new MeshLambertMaterial({
          color: ROAD_MATERIAL_COLOURS['roadControl.paint.white'],
          side: DoubleSide,
          polygonOffset: true,
          polygonOffsetFactor: -1,
          polygonOffsetUnits: -1,
        }),
    );
  }

  private get<T extends Material>(key: string, create: () => T): T {
    const existing = this.materials.get(key);
    if (existing) return existing as T;
    const created = create();
    this.materials.set(key, created);
    return created;
  }

  owned(): ReadonlySet<Material> {
    return new Set(this.materials.values());
  }

  dispose(): void {
    for (const material of this.materials.values()) material.dispose();
    this.materials.clear();
  }
}

interface Renderable {
  readonly geometry: BufferGeometry;
  readonly material: Material | Material[];
}

function isRenderable(object: Object3D): object is Object3D & Renderable {
  return object instanceof Mesh || object instanceof Line || object instanceof Points;
}

/**
 * Dispose every geometry and material reachable from `root` (each once), then detach all children.
 * Materials in `ownedElsewhere` are left to their owner (the scene's MaterialCache).
 */
export function disposeObjectTree(
  root: Object3D,
  ownedElsewhere: ReadonlySet<Material> = new Set(),
): { geometries: number; materials: number } {
  const geometries = new Set<BufferGeometry>();
  const materials = new Set<Material>();
  root.traverse((object) => {
    if (isRenderable(object)) {
      geometries.add(object.geometry);
      const { material } = object;
      for (const m of Array.isArray(material) ? material : [material])
        if (!ownedElsewhere.has(m)) materials.add(m);
    }
  });
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
  root.clear();
  return { geometries: geometries.size, materials: materials.size };
}
