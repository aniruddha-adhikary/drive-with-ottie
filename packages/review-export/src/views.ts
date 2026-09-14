import { type DeepReadonly, type Viewport, type World } from '@ottie/contracts';
import { buildWorldScene, type WorldScene } from '@ottie/renderer-geometry';
import { type FitOptions, fitView, presetToThreeCamera, type ViewFitReport } from '@ottie/renderer-cameras';
import { indexOccluders } from '@ottie/renderer-evidence';
import { renderSceneTileSvg } from './render.node';
import { type ContactSheetTile } from './contact-sheet';

export interface ReviewView {
  readonly presetName: string;
  readonly viewport: Viewport;
  readonly report: ViewFitReport;
}

export interface ReviewViewsResult {
  readonly views: readonly ReviewView[];
  readonly contactSheetTiles: readonly ContactSheetTile[];
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
  const occluders = indexOccluders(scene);
  const views: ReviewView[] = [];
  const tiles: ContactSheetTile[] = [];
  const names = [...new Set(world.cameraPresets.map((preset) => preset.name))];
  for (const name of names) {
    const report = fitView(scene, world, viewport, world.evidence, name, { occluders } satisfies FitOptions);
    const camera = presetToThreeCamera(report.camera, viewport);
    const svgInner = renderSceneTileSvg(scene.root, camera, viewport);
    const visible = report.evidence.filter((e) => e.visible).length;
    const total = report.evidence.length;
    const label = `${name}${report.adjusted ? ' (adjusted)' : ''} — ${report.chosenCandidate} — evidence ${visible}/${total}`;
    views.push({ presetName: name, viewport, report });
    tiles.push({ label, svgInner, width: viewport.widthPx, height: viewport.heightPx });
    for (const detail of report.linkedDetails) {
      const detailCamera = presetToThreeCamera(detail.preset, viewport);
      const detailSvg = renderSceneTileSvg(scene.root, detailCamera, viewport);
      tiles.push({ label: detail.label, svgInner: detailSvg, width: viewport.widthPx, height: viewport.heightPx });
    }
  }
  return { scene, result: { views, contactSheetTiles: tiles } };
}
