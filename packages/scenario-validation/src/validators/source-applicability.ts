import {
  type AssetDefinition,
  type Measurement,
  type RoadClass,
  type SourceLocator,
  type SourceRef,
} from '@ottie/contracts';
import { Collector, type SemanticValidator, type WorldIndex } from '../world-index';

const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

/**
 * Does every placed asset resolve through C1 for the requested target, and may it be used in this
 * regime / on these roads? Also: is every source locator anchored in the official register, and are
 * the asset's own measurements internally consistent? Source conflicts are reported, never resolved.
 */
export const sourceApplicability: SemanticValidator = {
  name: 'source_applicability',
  run(index) {
    const out = new Collector('source_applicability');
    const { world, ctx } = index;
    const sourcesById = new Map<string, SourceRef>(ctx.sources.map((s) => [s.id, s]));

    if (ctx.target === 'learner_release' && ctx.assets.mode !== 'release') {
      out.error({
        code: 'release_requires_release_resolver',
        message: `learner-release validation received a '${ctx.assets.mode}' resolver; only a release-mode resolver may vouch for release use`,
      });
    }
    if (ctx.target === 'learner_release' && world.provenance.status === 'development_fixture') {
      out.error({
        code: 'development_fixture_in_release',
        message: `world ${world.id} is a development fixture and cannot be released`,
        entityIds: [world.id],
      });
    }

    let quarantinedUsed = false;
    for (const placed of index.placedAssetRefs()) {
      const resolution = index.resolve(placed.ref);
      if (!resolution.ok) {
        out.error({
          code: 'asset_unresolved',
          message: `${placed.kind} ${placed.entityId}: asset ${placed.ref.id}@${placed.ref.version} did not resolve (${resolution.reason}: ${resolution.detail})`,
          entityIds: [placed.entityId],
          data: {
            assetId: placed.ref.id,
            version: placed.ref.version,
            reason: resolution.reason,
            target: ctx.target,
          },
        });
        continue;
      }
      const asset = resolution.asset;
      if (resolution.quarantined) {
        quarantinedUsed = true;
        if (ctx.target === 'learner_release') {
          out.error({
            code: 'quarantined_asset_in_release',
            message: `${placed.kind} ${placed.entityId}: ${asset.id} is quarantined (not approved for release/content/reuse)`,
            entityIds: [placed.entityId],
            data: { assetId: asset.id, review: asset.review },
          });
        }
      }
      checkReview(out, placed.entityId, asset, ctx.target);
      checkContexts(out, index, placed.entityId, placed.laneIds, asset);
      checkGeometryAndMeasurements(out, placed.entityId, asset);
      const locators = [
        ...asset.provenance.geometrySources,
        ...asset.provenance.meaningSources,
        ...asset.provenance.measurements.map((m) => m.locator),
      ];
      checkLocators(out, placed.entityId, `asset ${asset.id}`, locators, sourcesById);
    }

    if (quarantinedUsed && !world.provenance.usesQuarantinedAssets) {
      out.error({
        code: 'quarantine_not_declared',
        message:
          'world uses quarantined (unapproved) assets but provenance.usesQuarantinedAssets is false',
        entityIds: [world.id],
      });
    }
    if (quarantinedUsed && world.provenance.status === 'reviewed_fixture') {
      out.error({
        code: 'reviewed_fixture_uses_quarantine',
        message: 'a reviewed fixture may not depend on quarantined assets',
        entityIds: [world.id],
      });
    }

    for (const marking of world.markings)
      checkLocators(out, marking.id, `marking ${marking.id}`, marking.sourceRefs, sourcesById);
    for (const face of world.signFaces)
      checkLocators(out, face.id, `sign face ${face.id}`, face.sourceRefs, sourcesById);
    for (const head of world.signalHeads)
      checkLocators(out, head.id, `signal head ${head.id}`, head.sourceRefs, sourcesById);

    checkConditions(out, index);
    return out.diagnostics;
  },
};

function checkReview(
  out: Collector,
  entityId: string,
  asset: AssetDefinition,
  target: 'development' | 'learner_release',
): void {
  const conflictWarnings = asset.review.warnings.filter((w) => /conflict/i.test(w));
  if (asset.review.extractionStatus === 'blocked') {
    const detail = asset.review.warnings.join('; ') || 'no detail';
    if (target === 'learner_release') {
      out.error({
        code: 'blocked_source_record',
        message: `${entityId}: asset ${asset.id} is blocked at source review (${detail}); it cannot depict a fact to learners`,
        entityIds: [entityId],
        data: { assetId: asset.id, warnings: asset.review.warnings },
      });
    } else {
      out.warning({
        code: 'blocked_source_record_in_development',
        message: `${entityId}: asset ${asset.id} is blocked at source review (${detail}); allowed only as an explicitly quarantined development stand-in`,
        entityIds: [entityId],
        data: { assetId: asset.id, warnings: asset.review.warnings },
      });
    }
  }
  if (conflictWarnings.length > 0) {
    out.error({
      code: 'source_conflict_unresolved',
      message: `${entityId}: asset ${asset.id} carries an unresolved source conflict: ${conflictWarnings.join(' | ')}`,
      entityIds: [entityId],
      sourceRefs: asset.provenance.meaningSources,
      data: { assetId: asset.id, warnings: conflictWarnings },
    });
  }
  if (target === 'learner_release' && asset.review.approvalEvidence.length === 0) {
    out.error({
      code: 'approval_evidence_missing',
      message: `${entityId}: asset ${asset.id} has no approval evidence`,
      entityIds: [entityId],
      data: { assetId: asset.id },
    });
  }
  if (asset.unknowns.length > 0) {
    out.info({
      code: 'asset_has_unknowns',
      message: `${entityId}: asset ${asset.id} records ${asset.unknowns.length} unresolved physical fact(s)`,
      entityIds: [entityId],
      data: { assetId: asset.id, unknowns: asset.unknowns },
    });
  }
}

function checkContexts(
  out: Collector,
  index: WorldIndex,
  entityId: string,
  laneIds: readonly string[],
  asset: AssetDefinition,
): void {
  const regime = index.world.controlRegime;
  if (!asset.allowedContexts.controlRegimes.includes(regime)) {
    out.error({
      code: 'regime_not_allowed',
      message: `${entityId}: asset ${asset.id} (${asset.role}) is not applicable in a '${regime}' regime (allowed: ${asset.allowedContexts.controlRegimes.join(', ')})`,
      entityIds: [entityId],
      data: { assetId: asset.id, regime, allowed: asset.allowedContexts.controlRegimes },
    });
  }
  const roadClasses = new Set<RoadClass>();
  for (const laneId of laneIds) {
    const road = index.laneRoad(laneId);
    if (road) roadClasses.add(road.roadClass);
  }
  for (const roadClass of roadClasses) {
    if (!asset.allowedContexts.roadClasses.includes(roadClass)) {
      out.error({
        code: 'road_class_not_allowed',
        message: `${entityId}: asset ${asset.id} is not applicable on a '${roadClass}' road (allowed: ${asset.allowedContexts.roadClasses.join(', ')})`,
        entityIds: [entityId],
        data: { assetId: asset.id, roadClass, allowed: asset.allowedContexts.roadClasses },
      });
    }
  }
}

function checkGeometryAndMeasurements(
  out: Collector,
  entityId: string,
  asset: AssetDefinition,
): void {
  const geometry = asset.geometry;
  if (geometry.kind === 'reference_only') {
    out.error({
      code: 'reference_only_asset_placed',
      message: `${entityId}: asset ${asset.id} is evidence-only (reference_only geometry) and cannot be placed in a world`,
      entityIds: [entityId],
      data: { assetId: asset.id },
    });
  }
  if (geometry.kind === 'marking') {
    const m = geometry.marking;
    if (m.rows < 1 || m.widthMm <= 0) {
      out.error({
        code: 'dimensions_invalid',
        message: `${entityId}: marking asset ${asset.id} has rows=${m.rows} width=${m.widthMm} mm`,
        entityIds: [entityId],
      });
    }
    if (!m.continuous && (m.paintedLengthMm === null || m.clearGapMm === null)) {
      out.error({
        code: 'dimensions_incomplete',
        message: `${entityId}: broken marking asset ${asset.id} lacks painted length or clear gap`,
        entityIds: [entityId],
        data: { assetId: asset.id },
      });
    }
    if (m.rows > 1 && m.interRowClearGapMm === null) {
      out.error({
        code: 'dimensions_incomplete',
        message: `${entityId}: multi-row marking asset ${asset.id} lacks an inter-row clear gap`,
        entityIds: [entityId],
        data: { assetId: asset.id },
      });
    }
  }
  if (geometry.kind === 'signal_head') {
    const head = geometry.head;
    for (const measurement of [
      head.lensDiameterMm,
      head.lowestLensCentreAboveGroundMm,
      head.adjacentLensCentreDistanceMm,
    ]) {
      checkMeasurement(out, entityId, asset, measurement);
    }
  }
  for (const measurement of asset.provenance.measurements)
    checkMeasurement(out, entityId, asset, measurement);
}

function checkMeasurement(
  out: Collector,
  entityId: string,
  asset: AssetDefinition,
  measurement: Measurement,
): void {
  const min = measurement.minimumMm ?? null;
  const max = measurement.maximumMm ?? null;
  if (measurement.valueMm === null && min === null && max === null) {
    out.warning({
      code: 'measurement_unsourced',
      message: `${entityId}: asset ${asset.id} measurement '${measurement.name}' has no value and no bounds`,
      entityIds: [entityId],
      sourceRefs: [measurement.locator],
      data: { assetId: asset.id, measurement: measurement.name },
    });
    return;
  }
  const value = measurement.valueMm;
  const belowMin = value !== null && min !== null && value < min;
  const aboveMax = value !== null && max !== null && value > max;
  const boundsCrossed = min !== null && max !== null && min > max;
  if (belowMin || aboveMax || boundsCrossed) {
    out.error({
      code: 'measurement_out_of_bounds',
      message: `${entityId}: asset ${asset.id} measurement '${measurement.name}' value=${String(value)} min=${String(min)} max=${String(max)} mm is inconsistent`,
      entityIds: [entityId],
      sourceRefs: [measurement.locator],
      data: {
        assetId: asset.id,
        measurement: measurement.name,
        valueMm: value,
        minimumMm: min,
        maximumMm: max,
      },
    });
  }
}

function checkLocators(
  out: Collector,
  entityId: string,
  subject: string,
  locators: readonly SourceLocator[],
  sourcesById: ReadonlyMap<string, SourceRef>,
): void {
  for (const locator of locators) {
    const source = sourcesById.get(locator.sourceId);
    if (!source) {
      out.error({
        code: 'unknown_source',
        message: `${subject} cites source '${locator.sourceId}' which is not in the official source register`,
        entityIds: [entityId],
        sourceRefs: [locator],
        data: { sourceId: locator.sourceId },
      });
      continue;
    }
    const hasPage = locator.pdfPage !== null || locator.printedPage !== null;
    const hasDrawing = locator.drawing !== null;
    const hasSection = typeof locator.section === 'string' && locator.section.length > 0;
    if (!hasPage && !hasDrawing && !hasSection) {
      out.error({
        code: 'locator_unanchored',
        message: `${subject} cites ${locator.sourceId} without a page, drawing or section`,
        entityIds: [entityId],
        sourceRefs: [locator],
      });
    }
  }
}

function checkConditions(out: Collector, index: WorldIndex): void {
  const { conditions } = index.world;
  const match = /^(\d{4})-(\d{2})-(\d{2})T\d{2}:\d{2}(?::\d{2})?$/.exec(conditions.localDateTime);
  if (!match) {
    out.error({
      code: 'local_datetime_invalid',
      message: `conditions.localDateTime '${conditions.localDateTime}' is not a local ISO date-time (YYYY-MM-DDTHH:MM[:SS])`,
    });
    return;
  }
  const [, year, month, day] = match;
  const utc = new Date(`${year}-${month}-${day}T00:00:00Z`);
  if (Number.isNaN(utc.getTime())) {
    out.error({
      code: 'local_datetime_invalid',
      message: `conditions.localDateTime '${conditions.localDateTime}' has an impossible calendar date`,
    });
    return;
  }
  const weekday = WEEKDAYS[utc.getUTCDay()];
  if (weekday !== conditions.weekday) {
    out.error({
      code: 'weekday_mismatch',
      message: `conditions.weekday '${conditions.weekday}' contradicts localDateTime ${conditions.localDateTime} (${String(weekday)})`,
      data: { declared: conditions.weekday, derived: weekday },
    });
  }
  for (const source of index.ctx.sources) {
    if (source.effectiveFrom !== null && source.effectiveFrom > `${year}-${month}-${day}`) {
      out.warning({
        code: 'source_not_yet_effective',
        message: `source ${source.id} is effective from ${source.effectiveFrom}, after the depicted date ${year}-${month}-${day}`,
        data: { sourceId: source.id, effectiveFrom: source.effectiveFrom },
      });
    }
  }
}
