import { type DeepReadonly, type Viewport, type World } from '@ottie/contracts';
import { buildWorldScene, type WorldScene } from '@ottie/renderer-geometry';
import { type FitOptions, fitView, presetToThreeCamera, type ViewFitReport } from '@ottie/renderer-cameras';
import { indexOccluders } from '@ottie/renderer-evidence';
import { applySvgPaintLayers, assessSvgTile, renderSceneTileSvg, withEntitiesHidden, type SvgPaintLayerReport, type SvgTileReliability } from './render.node.js';
import { type ContactSheetTile } from './contact-sheet';

export interface ReviewView {
  readonly presetName: string;
  readonly viewport: Viewport;
  readonly report: ViewFitReport;
  /** Whether the SVG tile for the fitted camera is a trustworthy rendered proof. */
  readonly svg: SvgTileReliability;
  readonly linkedDetailSvg: readonly { readonly label: string; readonly svg: SvgTileReliability }[];
}

export interface ReviewViewsResult {
  readonly views: readonly ReviewView[];
  readonly contactSheetTiles: readonly ContactSheetTile[];
  readonly svgPaintLayers: SvgPaintLayerReport;
}

function reliabilitySuffix(reliability: SvgTileReliability): string {
  const hidden = reliability.hiddenEntityIds.length > 0 ? ` — hidden for this tile: ${reliability.hiddenEntityIds.join(', ')}` : '';
  return `${hidden}${reliability.reliable ? '' : ' — SVG UNRELIABLE'}`;
}

export function buildWorldViews(
  world: DeepReadonly<World>,
  viewport: Viewport,
  resolver: Parameters<typeof buildWorldScene>[1]['resolver'],
  artwork: Parameters<typeof buildWorldScene>[1]['artwork'],
  artworkIssues: Parameters<typeof buildWorldScene>[1]['artworkIssues'],
): { scene: WorldScene; result: ReviewViewsResult } {
  const scene = buildWorldScene(world, {
    resolver,
    ...(artwork ? { artwork } : {}),
    ...(artworkIssues ? { artworkIssues } : {}),
  });
  const svgPaintLayers = applySvgPaintLayers(scene.root);
  const occluders = indexOccluders(scene);
  const views: ReviewView[] = [];
  const tiles: ContactSheetTile[] = [];
  const names = [...new Set(world.cameraPresets.map((preset) => preset.name))];
  for (const name of names) {
    const report = fitView(scene, world, viewport, world.evidence, name, { occluders } satisfies FitOptions);
    const camera = presetToThreeCamera(report.camera, viewport);
    const svg = assessSvgTile(scene, report.camera);
    const rendered = withEntitiesHidden(scene, svg.hiddenEntityIds, () => renderSceneTileSvg(scene.root, camera, viewport));
    const visible = report.evidence.filter((e) => e.visible).length;
    const total = report.evidence.length;
    const label = `${name}${report.adjusted ? ' (adjusted)' : ''} — ${report.chosenCandidate} — evidence ${visible}/${total}${reliabilitySuffix(svg)}`;
    tiles.push({ label, svgInner: rendered.inner, viewBox: rendered.viewBox, width: viewport.widthPx, height: viewport.heightPx });
    const linkedDetailSvg: { label: string; svg: SvgTileReliability }[] = [];
    for (const detail of report.linkedDetails) {
      const detailCamera = presetToThreeCamera(detail.preset, viewport);
      const detailSvg = assessSvgTile(scene, detail.preset);
      const detailRendered = withEntitiesHidden(scene, detailSvg.hiddenEntityIds, () => renderSceneTileSvg(scene.root, detailCamera, viewport));
      linkedDetailSvg.push({ label: detail.label, svg: detailSvg });
      tiles.push({ label: `${detail.label}${reliabilitySuffix(detailSvg)}`, svgInner: detailRendered.inner, viewBox: detailRendered.viewBox, width: viewport.widthPx, height: viewport.heightPx });
    }
    views.push({ presetName: name, viewport, report, svg, linkedDetailSvg });
  }
  return { scene, result: { views, contactSheetTiles: tiles, svgPaintLayers } };
}
