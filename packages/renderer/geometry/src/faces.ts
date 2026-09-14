import { Box3, ExtrudeGeometry, Group, Matrix4, Mesh, Shape, ShapeGeometry, Vector3 } from 'three';
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';
import { type FaceShape, type SignFace, mmToMetres } from '@ottie/contracts';
import { type ParsedArtwork, rendererSvgFile } from './artwork';
import { type BuildContext } from './context';
import { frameBasis } from './frames';
import { placeMountedPart } from './mounting';
import { type ArtworkStatus } from './types';

/**
 * A sign face is a physical backing plate of the authored shape and size plus the hash-verified
 * extracted artwork laid on its front. The plate is built in the asset's own frame (front/up from
 * the FaceProfile) and placed by the world pose; SVG +x maps onto the observer's right and SVG +y
 * (down the page) onto -up, so lettering reads correctly and a Give Way triangle keeps its point
 * down. Scale is uniform and positive: no mirroring, no stretching.
 */

export function buildSignFaces(ctx: BuildContext): void {
  for (const face of ctx.world.signFaces) buildSignFace(ctx, face);
}

/** 2D outline of the plate in (right, up) metres, centred at the origin. */
export function plateOutline(shape: FaceShape, widthM: number, heightM: number): Shape {
  const w = widthM / 2;
  const h = heightM / 2;
  const outline = new Shape();
  switch (shape) {
    case 'triangle_point_down':
      outline.moveTo(-w, h).lineTo(w, h).lineTo(0, -h).closePath();
      break;
    case 'triangle_point_up':
      outline.moveTo(-w, -h).lineTo(w, -h).lineTo(0, h).closePath();
      break;
    case 'circle':
      outline.absellipse(0, 0, w, h, 0, Math.PI * 2, false, 0);
      break;
    case 'octagon': {
      const k = Math.tan(Math.PI / 8);
      outline
        .moveTo(-w * k, h)
        .lineTo(w * k, h)
        .lineTo(w, h * k)
        .lineTo(w, -h * k)
        .lineTo(w * k, -h)
        .lineTo(-w * k, -h)
        .lineTo(-w, -h * k)
        .lineTo(-w, h * k)
        .closePath();
      break;
    }
    case 'diamond':
      outline.moveTo(0, h).lineTo(w, 0).lineTo(0, -h).lineTo(-w, 0).closePath();
      break;
    case 'rectangle':
      outline.moveTo(-w, -h).lineTo(w, -h).lineTo(w, h).lineTo(-w, h).closePath();
      break;
  }
  return outline;
}

function buildSignFace(ctx: BuildContext, face: SignFace): void {
  const resolved = ctx.resolveGeometry(face.asset, 'face', face.id);
  if (!resolved) return;
  const profile = resolved.geometry.face;
  const placement = placeMountedPart(ctx, face, resolved.asset, profile.front, profile.up);

  let widthM: number;
  let heightM: number;
  if (profile.widthMm !== null && profile.heightMm !== null) {
    widthM = mmToMetres(profile.widthMm);
    heightM = mmToMetres(profile.heightMm);
  } else {
    const fallback = ctx.schematic('faceFallbackSizeM');
    widthM = profile.widthMm === null ? fallback : mmToMetres(profile.widthMm);
    heightM = profile.heightMm === null ? fallback : mmToMetres(profile.heightMm);
    ctx.issue(
      'unknown_dimension',
      face.id,
      `${resolved.asset.id} face profile lacks width/height; schematic ${fallback} m used`,
    );
  }

  const standoff = placement.support ? placement.support.radiusM : 0;
  const thickness = ctx.schematic('plateThicknessM');
  const basis = frameBasis(placement.localFrame);

  const group = new Group();
  group.name = `sign-face:${face.id}`;
  group.applyMatrix4(placement.matrix);

  const plateGeometry = new ExtrudeGeometry(plateOutline(profile.shape, widthM, heightM), {
    depth: thickness,
    bevelEnabled: false,
  });
  plateGeometry.applyMatrix4(
    new Matrix4().multiplyMatrices(basis, new Matrix4().makeTranslation(0, 0, standoff)),
  );
  const plate = new Mesh(plateGeometry, ctx.materials.lit('roadControl.sign.backing'));
  plate.name = `sign-plate:${face.id}`;
  group.add(plate);

  const file = rendererSvgFile(resolved.asset);
  const artwork = file ? ctx.artwork.get(file.path) : undefined;
  let artworkStatus: ArtworkStatus = 'backing_only';
  let artworkAxes: { svgX: Vector3; svgY: Vector3 } | null = null;
  if (artwork) {
    const artworkDepth = standoff + thickness + ctx.schematic('artworkLiftM');
    addArtwork(group, artwork, widthM, heightM, basis, artworkDepth, face.id);
    artworkStatus = 'vector';
    artworkAxes = {
      svgX: placement.facing.right.clone(),
      svgY: placement.facing.up.clone().negate(),
    };
  } else {
    group.userData = { artwork: 'backing_only' };
  }

  group.updateMatrixWorld(true);
  const panelCentre = new Vector3(0, 0, standoff + thickness / 2)
    .applyMatrix4(basis)
    .applyMatrix4(placement.matrix);
  ctx.register({
    id: face.id,
    kind: 'sign_face',
    layer: 'physical',
    object: group,
    bounds: new Box3().setFromObject(group, true),
    ...placement.facing,
    shape: profile.shape,
    widthM,
    heightM,
    panelCentre,
    mount: placement.mount,
    artwork: artworkStatus,
    artworkAxes,
  });
}

/**
 * Lay the parsed SVG onto the plate: uniform scale so the viewBox fits the panel, viewBox centre
 * at the panel centre, SVG y flipped onto -up. Fill and stroke materials come from the SVG itself.
 */
function addArtwork(
  group: Group,
  artwork: ParsedArtwork,
  widthM: number,
  heightM: number,
  basis: Matrix4,
  depth: number,
  faceId: string,
): void {
  const { viewBox } = artwork;
  const scale = Math.min(widthM / viewBox.width, heightM / viewBox.height);
  const cx = viewBox.minX + viewBox.width / 2;
  const cy = viewBox.minY + viewBox.height / 2;
  const svgToLocal = new Matrix4()
    .multiplyMatrices(basis, new Matrix4().makeTranslation(0, 0, depth))
    .multiply(new Matrix4().makeScale(scale, -scale, 1))
    .multiply(new Matrix4().makeTranslation(-cx, -cy, 0));

  artwork.paths.forEach((path, index) => {
    const fillMaterial = SVGLoader.createFillMaterial(path);
    if (fillMaterial) {
      const shapes = path.toShapes();
      if (shapes.length > 0) {
        const geometry = new ShapeGeometry(shapes).applyMatrix4(svgToLocal);
        const mesh = new Mesh(geometry, fillMaterial);
        mesh.name = `sign-artwork:${faceId}:${index}:fill`;
        mesh.renderOrder = index * 2;
        group.add(mesh);
      } else {
        fillMaterial.dispose();
      }
    }
    const strokeMaterial = SVGLoader.createStrokeMaterial(path);
    if (strokeMaterial) {
      const style = strokeStyleOf(path);
      let added = false;
      if (style) {
        for (const subPath of path.subPaths) {
          const points = subPath.getPoints();
          if (points.length < 2) continue;
          const geometry = SVGLoader.pointsToStroke(points, style).applyMatrix4(svgToLocal);
          const mesh = new Mesh(geometry, strokeMaterial);
          mesh.name = `sign-artwork:${faceId}:${index}:stroke`;
          mesh.renderOrder = index * 2 + 1;
          group.add(mesh);
          added = true;
        }
      }
      if (!added) strokeMaterial.dispose();
    }
  });
}

interface StrokeStyle {
  strokeColor: string;
  strokeWidth: number;
  strokeLineJoin: string;
  strokeLineCap: string;
  strokeMiterLimit: number;
}

function strokeStyleOf(path: { userData: Record<string, unknown> }): StrokeStyle | null {
  const style = path.userData.style;
  if (typeof style !== 'object' || style === null) return null;
  const s = style as Record<string, unknown>;
  const stroke = s.stroke;
  if (typeof stroke !== 'string' || stroke === 'none') return null;
  return SVGLoader.getStrokeStyle(
    typeof s.strokeWidth === 'number' ? s.strokeWidth : 1,
    stroke,
    typeof s.strokeLineJoin === 'string' ? s.strokeLineJoin : 'miter',
    typeof s.strokeLineCap === 'string' ? s.strokeLineCap : 'butt',
    typeof s.strokeMiterLimit === 'number' ? s.strokeMiterLimit : 4,
  );
}
