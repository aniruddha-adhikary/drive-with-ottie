import { type AssetRef, type DeepReadonly, type ValidationReport, type ValidatorName, type World } from '@ottie/contracts';

export interface WorldReviewSummary {
  readonly worldId: string;
  readonly status: World['provenance']['status'];
  readonly usesQuarantinedAssets: boolean;
  readonly controlRegime: World['controlRegime'];
  readonly lanes: number;
  readonly movements: number;
  readonly assets: readonly AssetRef[];
  readonly evidenceIds: readonly string[];
  readonly cameraPresets: readonly string[];
  readonly validation: {
    readonly ok: boolean;
    readonly errors: number;
    readonly warnings: number;
    readonly validatorsRun: readonly ValidatorName[];
    readonly validatorsNotRun: readonly ValidatorName[];
  };
  readonly notes: readonly string[];
}

export function describeWorldForReview(
  world: DeepReadonly<World>,
  validation: ValidationReport,
  validatorsNotRun: readonly ValidatorName[],
): WorldReviewSummary {
  const assets = new Map<string, AssetRef>();
  const collect = (items: readonly { readonly asset: AssetRef | null }[]) => {
    for (const item of items) {
      if (item.asset) assets.set(`${item.asset.id}@${item.asset.version}`, item.asset);
    }
  };
  collect(world.markings);
  collect(world.supports);
  collect(world.signFaces);
  collect(world.signalHeads);
  collect(world.actors);
  return {
    worldId: world.id,
    status: world.provenance.status,
    usesQuarantinedAssets: world.provenance.usesQuarantinedAssets,
    controlRegime: world.controlRegime,
    lanes: world.lanes.length,
    movements: world.movements.length,
    assets: [...assets.values()],
    evidenceIds: world.evidence.map((e) => e.id),
    cameraPresets: world.cameraPresets.map((c) => c.name),
    validation: {
      ok: validation.ok,
      errors: validation.diagnostics.filter((d) => d.severity === 'error').length,
      warnings: validation.diagnostics.filter((d) => d.severity === 'warning').length,
      validatorsRun: validation.validatorsRun,
      validatorsNotRun,
    },
    notes: world.provenance.notes,
  };
}
