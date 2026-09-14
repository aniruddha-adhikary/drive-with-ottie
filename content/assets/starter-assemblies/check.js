// Candidate-directory check for content/assets/starter-assemblies/.
// Run: node content/assets/starter-assemblies/check.js
// Verifies hashes and locators against the extraction manifests, world-frame axis rules,
// Rule 11 lens constraints and the quarantine flags. It never promotes anything.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../..');

const failures = [];
const passes = [];

function fail(file, message) {
  failures.push(`${file}: ${message}`);
}
function pass(message) {
  passes.push(message);
}
function check(file, condition, message) {
  if (condition) return true;
  fail(file, message);
  return false;
}

function readJson(relative) {
  return JSON.parse(readFileSync(path.join(repoRoot, relative), 'utf8'));
}

function listJson(dir) {
  const abs = path.join(here, dir);
  return readdirSync(abs)
    .filter((name) => name.endsWith('.json'))
    .sort()
    .map((name) => ({
      file: `${dir}/${name}`,
      data: JSON.parse(readFileSync(path.join(abs, name), 'utf8')),
    }));
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const abs = path.join(dir, name);
    if (statSync(abs).isDirectory()) walk(abs, out);
    else out.push(abs);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Inputs

const manifests = {
  assemblies: readJson('assets/sg/assemblies/manifest.json'),
  mandatory: readJson('assets/sg/mandatory/manifest.json'),
  markings: readJson('assets/sg/markings/manifest.json'),
};
const definitions = readJson('assets/sg/assemblies/assembly-definitions.json');
const definitionIds = new Set(definitions.definitions.map((d) => d.id));

const manifestAssets = new Map();
const manifestSources = new Map();
for (const [family, manifest] of Object.entries(manifests)) {
  for (const asset of manifest.assets) manifestAssets.set(asset.id, { family, asset });
  for (const source of manifest.sources) {
    const list = manifestSources.get(source.id) ?? [];
    list.push({ family, source });
    manifestSources.set(source.id, list);
  }
}

const sourcesDoc = JSON.parse(readFileSync(path.join(here, 'sources.json'), 'utf8'));
const supports = listJson('supports');
const assemblies = listJson('assemblies');

const SHA256 = /^[0-9a-f]{64}$/;
const EPS = 1e-9;

// ---------------------------------------------------------------------------
// Directory hygiene

for (const abs of walk(here)) {
  const rel = path.relative(here, abs);
  const ext = path.extname(rel);
  check('directory', ['.json', '.md', '.js'].includes(ext), `unexpected file type: ${rel}`);
  check('directory', ext !== '.pdf', `PDF committed in candidate directory: ${rel}`);
}
pass('directory contains only JSON, Markdown and the check script');

// ---------------------------------------------------------------------------
// Sources

const sourceIds = new Set();
check('sources.json', sourcesDoc.schema === 'ottie.candidate-sources/1', 'schema mismatch');
check('sources.json', sourcesDoc.contractVersion === 1, 'contractVersion must be 1');
for (const source of sourcesDoc.sources) {
  sourceIds.add(source.id);
  check('sources.json', SHA256.test(source.sha256), `${source.id}: malformed sha256`);
  check('sources.json', typeof source.hashScope === 'string', `${source.id}: hashScope missing`);
  let matched = 0;
  for (const alias of source.manifestAliases) {
    for (const { family, source: ms } of manifestSources.get(alias) ?? []) {
      matched += 1;
      check(
        'sources.json',
        ms.sha256 === source.sha256,
        `${source.id}: sha256 differs from ${family} manifest alias ${alias}`,
      );
      check(
        'sources.json',
        ms.url === source.url,
        `${source.id}: url differs from ${family} manifest alias ${alias}`,
      );
      if (ms.page_count !== undefined) {
        check(
          'sources.json',
          ms.page_count === source.pageCount,
          `${source.id}: pageCount differs from ${family} manifest alias ${alias}`,
        );
      }
      if (ms.collection_revision !== undefined) {
        check(
          'sources.json',
          ms.collection_revision === source.collectionRevision,
          `${source.id}: collectionRevision differs from ${family} manifest`,
        );
      }
      if (ms.edition !== undefined) {
        check(
          'sources.json',
          ms.edition === source.edition,
          `${source.id}: edition differs from ${family} manifest`,
        );
      }
    }
  }
  check('sources.json', matched > 0, `${source.id}: no manifest source matched its aliases`);
}
pass(`sources.json: ${sourcesDoc.sources.length} sources match manifest hashes, urls and revisions`);

// ---------------------------------------------------------------------------
// Shared validators

function checkLocator(file, locator, label) {
  if (!check(file, locator && typeof locator === 'object', `${label}: locator missing`)) return;
  check(file, sourceIds.has(locator.sourceId), `${label}: unknown sourceId ${locator.sourceId}`);
  const hasPage = typeof locator.pdfPage === 'number';
  const hasSection = typeof locator.section === 'string';
  check(file, hasPage || hasSection, `${label}: locator needs pdfPage or section`);
  if (locator.bboxPdfPoints !== undefined && locator.bboxPdfPoints !== null) {
    const b = locator.bboxPdfPoints;
    check(
      file,
      Array.isArray(b) && b.length === 4 && b[0] < b[2] && b[1] < b[3],
      `${label}: bboxPdfPoints must be [x0,y0,x1,y1] with x0<x1, y0<y1`,
    );
  }
  if (locator.drawing) {
    const onSheet = [...manifestAssets.values()].some(
      ({ asset }) =>
        asset.source.drawing === locator.drawing &&
        asset.source.pdf_page === locator.pdfPage &&
        (asset.source.drawing_revision ?? '-') === (locator.drawingRevision ?? '-'),
    );
    check(
      file,
      onSheet,
      `${label}: drawing ${locator.drawing} rev ${locator.drawingRevision} on pdf page ${locator.pdfPage} is not in any manifest`,
    );
  }
}

function checkMeasurement(file, m, label) {
  check(file, typeof m.name === 'string', `${label}: name missing`);
  check(file, typeof m.endpoints === 'string', `${label}: endpoints missing`);
  check(file, typeof m.method === 'string', `${label}: method missing`);
  check(
    file,
    m.valueMm === null || typeof m.valueMm === 'number',
    `${label}: valueMm must be a number or null`,
  );
  check(
    file,
    m.valueMm !== null ||
      typeof m.minimumMm === 'number' ||
      typeof m.maximumMm === 'number' ||
      m.valuePx !== undefined,
    `${label}: needs valueMm, a bound or a pixel value`,
  );
  checkLocator(file, m.locator, label);
}

function checkFiles(file, files, label) {
  for (const f of files) {
    const entry = [...manifestAssets.values()].find(({ asset }) =>
      Object.values(asset.files).includes(f.path),
    );
    if (!check(file, entry !== undefined, `${label}: ${f.path} not in any manifest`)) continue;
    check(
      file,
      entry.asset.file_sha256[f.role] === f.sha256,
      `${label}: sha256 for ${f.path} differs from manifest`,
    );
  }
}

function checkQuarantine(file, review) {
  check(file, review.releaseReady === false, 'releaseReady must be false');
  check(file, review.contentApproved === false, 'contentApproved must be false');
  check(file, review.reuseApproved === false, 'reuseApproved must be false');
  check(file, review.licenseStatus === 'unreviewed', 'licenseStatus must be unreviewed');
  check(file, review.runtimeState === 'draft', 'runtimeState must be draft');
}

function isUnit(v) {
  return Math.abs(Math.hypot(v.x, v.y, v.z) - 1) < EPS;
}
function dot(a, b) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}
function rotateZ(v, yaw) {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return { x: c * v.x - s * v.y, y: s * v.x + c * v.y, z: v.z };
}
function near(a, b) {
  return Math.abs(a.x - b.x) < 1e-9 && Math.abs(a.y - b.y) < 1e-9 && Math.abs(a.z - b.z) < 1e-9;
}

const UNIVERSAL_CLAIMS = /\b(universal|always|all signs|standard height|typical height)\b/i;

// ---------------------------------------------------------------------------
// Supports

const supportById = new Map();
for (const { file, data } of supports) {
  check(file, data.schema === 'ottie.candidate-support/1', 'schema mismatch');
  check(file, data.contractVersion === 1, 'contractVersion must be 1');
  check(file, data.id.startsWith('sg.candidate.support-'), 'id must start with sg.candidate.support-');
  check(file, !supportById.has(data.id), `duplicate id ${data.id}`);
  supportById.set(data.id, data);
  check(file, data.role === 'sign_post', 'first-slice supports carry role sign_post');
  check(
    file,
    ['post', 'pole', 'mast_arm', 'gantry', 'wall', 'unspecified'].includes(data.worldSupportFamily),
    'worldSupportFamily must be a contracts Support.family value',
  );
  check(
    file,
    ['sourced', 'schematic_unsourced'].includes(data.dimensionsStatus),
    'dimensionsStatus invalid',
  );
  checkQuarantine(file, data.review);
  check(file, data.geometry.kind === 'support', 'geometry.kind must be support');
  check(
    file,
    data.geometry.heightMm === null || typeof data.geometry.heightMm === 'number',
    'heightMm must be number or null',
  );
  if (data.geometry.heightMm === null) {
    check(
      file,
      data.unknowns.some((u) => /height/i.test(u)),
      'heightMm is null so unknowns must name the missing height',
    );
  }

  for (const id of data.sourceAssetIds) {
    const entry = manifestAssets.get(id);
    if (!check(file, entry !== undefined, `sourceAssetIds: ${id} not in manifest`)) continue;
    check(file, entry.asset.release_ready === false, `${id}: manifest release_ready is not false`);
  }
  for (const id of data.sourceDefinitionIds) {
    check(file, definitionIds.has(id), `sourceDefinitionIds: ${id} not in assembly-definitions.json`);
  }
  checkFiles(file, data.provenance.files, 'provenance.files');
  const sheet = data.provenance.drawingSheet;
  if (check(file, sheet !== undefined, 'provenance.drawingSheet required')) {
    for (const id of data.sourceAssetIds) {
      const entry = manifestAssets.get(id);
      if (!entry) continue;
      check(
        file,
        entry.asset.source.drawing === sheet.drawing &&
          (entry.asset.source.drawing_revision ?? '-') === sheet.revision,
        `drawingSheet ${sheet.drawing} rev ${sheet.revision} differs from manifest asset ${id}`,
      );
    }
    check(
      file,
      sheet.dateOfIssue === null || /^\d{4}-\d{2}-\d{2}$/.test(sheet.dateOfIssue),
      'drawingSheet.dateOfIssue must be ISO date or null',
    );
    for (const loc of data.provenance.geometrySources) {
      check(
        file,
        loc.drawing === sheet.drawing && loc.drawingRevision === sheet.revision,
        'geometrySources must cite the drawingSheet',
      );
    }
  }
  for (const loc of data.provenance.geometrySources) checkLocator(file, loc, 'geometrySources');
  for (const m of data.provenance.measurements) checkMeasurement(file, m, `measurement ${m.name}`);

  const attachmentNames = new Set();
  const ground = data.geometry.attachments.find((a) => a.name === 'ground');
  check(file, ground !== undefined, 'attachments must include ground');
  if (ground) check(file, ground.offsetMm.z === 0, 'ground attachment must be at z = 0');
  for (const a of data.geometry.attachments) {
    check(file, !attachmentNames.has(a.name), `duplicate attachment ${a.name}`);
    attachmentNames.add(a.name);
    check(file, ['sourced', 'derived', 'partial'].includes(a.basis), `${a.name}: basis invalid`);
    check(file, typeof a.note === 'string' && a.note.length > 0, `${a.name}: note required`);
    if (a.basis !== 'sourced') {
      check(
        file,
        /not a printed dimension|placeholder|scenario decision/i.test(a.note),
        `${a.name}: non-sourced attachment must say it is not a printed dimension`,
      );
    }
    if (a.offsetMm.z === 2400) {
      check(
        file,
        /applies|shown|elevation|drawn/i.test(a.note),
        `${a.name}: a 2400 mm attachment must be tied to the shown assembly`,
      );
    }
    check(file, !UNIVERSAL_CLAIMS.test(a.note), `${a.name}: note asserts a universal rule`);
  }
  if (data.dimensionsStatus === 'sourced') {
    check(
      file,
      data.geometry.attachments.some((a) => a.basis === 'sourced' && a.name !== 'ground'),
      'dimensionsStatus sourced requires at least one sourced non-ground attachment',
    );
  }
  check(file, Array.isArray(data.unknowns) && data.unknowns.length > 0, 'unknowns must be listed');
  check(
    file,
    data.unknowns.some((u) => /face normal/i.test(u)),
    'no SUP sheet fixes a face normal; unknowns must say so',
  );
}
pass(`supports: ${supports.length} candidates validated against manifests and definitions`);

// ---------------------------------------------------------------------------
// Assemblies

const assemblyIds = new Set();
for (const { file, data } of assemblies) {
  check(file, data.schema === 'ottie.candidate-assembly/1', 'schema mismatch');
  check(file, data.contractVersion === 1, 'contractVersion must be 1');
  check(file, data.id.startsWith('sg.candidate.'), 'id must start with sg.candidate.');
  check(file, !assemblyIds.has(data.id), `duplicate id ${data.id}`);
  assemblyIds.add(data.id);
  checkQuarantine(file, data.status);
  check(file, typeof data.status.quarantine === 'string', 'status.quarantine text required');

  const partEntry = manifestAssets.get(data.part.assetId);
  if (check(file, partEntry !== undefined, `part.assetId ${data.part.assetId} not in manifest`)) {
    check(file, partEntry.asset.release_ready === false, 'part manifest release_ready is not false');
    check(
      file,
      partEntry.asset.license_status === 'unreviewed',
      'part manifest license_status is not unreviewed',
    );
  }
  checkFiles(file, data.part.files, 'part.files');
  check(file, data.part.partAttachmentName === 'back_centre', 'F0 parts expose back_centre only');

  // Axes
  const { front, up } = data.axes.assetFrame;
  check(file, isUnit(front) && isUnit(up), 'front/up must be unit vectors');
  check(file, Math.abs(dot(front, up)) < EPS, 'front and up must be orthogonal');
  check(file, near(up, { x: 0, y: 0, z: 1 }), 'up must be world +Z (plumb)');
  check(file, near(front, { x: 0, y: -1, z: 0 }), 'F0 asset frames all use front (0,-1,0)');
  check(file, data.axes.assetFrame.mirrorAllowed === false, 'mirrorAllowed must be false');
  for (const ex of data.axes.worldPlacement.worldExamples) {
    const expected = rotateZ(front, ex.poseYawRadians);
    check(
      file,
      near(expected, ex.frontNormal),
      `worldExample ${ex.intendedApproachHeadingName}: frontNormal != rotateZ(front, yaw)`,
    );
    const h = ex.intendedApproachHeadingRadians;
    const heading = { x: Math.cos(h), y: Math.sin(h), z: 0 };
    check(
      file,
      dot(ex.frontNormal, heading) < 0,
      `worldExample ${ex.intendedApproachHeadingName}: face does not oppose the approach heading`,
    );
    check(file, near(ex.up, up), `worldExample ${ex.intendedApproachHeadingName}: up changed`);
  }

  // Supports
  for (const cs of data.compatibleSupports) {
    const support = supportById.get(cs.supportCandidateId);
    if (!check(file, support !== undefined, `compatibleSupports: ${cs.supportCandidateId} unknown`)) {
      continue;
    }
    check(
      file,
      support.worldSupportFamily === cs.supportFamily,
      `${cs.supportCandidateId}: supportFamily differs from the support candidate`,
    );
    const att = support.geometry.attachments.find((a) => a.name === cs.supportAttachmentName);
    if (!check(file, att !== undefined, `${cs.supportCandidateId}: attachment ${cs.supportAttachmentName} missing`)) {
      continue;
    }
    check(file, att.accepts.includes('face'), `${cs.supportAttachmentName} does not accept a face`);
    check(file, cs.partAttachmentName === data.part.partAttachmentName, 'partAttachmentName mismatch');
    if (cs.dimensionsStatus === 'sourced') {
      check(
        file,
        att.basis !== 'partial' && cs.heightAboveGroundMm === att.offsetMm.z,
        `${cs.supportCandidateId}: sourced height must equal the support attachment z`,
      );
      if (typeof cs.signBottomAboveGroundMm === 'number') {
        const half = data.part.faceMm.height / 2;
        check(
          file,
          cs.heightAboveGroundMm === cs.signBottomAboveGroundMm + half,
          `${cs.supportCandidateId}: height must be sign bottom + half face height`,
        );
        check(
          file,
          support.provenance.measurements.some(
            (m) => m.name === 'sign_bottom_above_ground' && m.valueMm === cs.signBottomAboveGroundMm,
          ),
          `${cs.supportCandidateId}: sign bottom is not a printed measurement of that support`,
        );
      }
    } else {
      check(
        file,
        cs.dimensionsStatus === 'schematic_unsourced' && cs.heightAboveGroundMm === null,
        `${cs.supportCandidateId}: unsourced height must be null`,
      );
    }
    check(file, !UNIVERSAL_CLAIMS.test(cs.applicability), `${cs.supportCandidateId}: universal claim`);
  }
  for (const ex of data.excludedSupports ?? []) {
    const id = ex.sourceAssetId ?? ex.assetId;
    check(
      file,
      manifestAssets.has(id) || id === 'sg.dev.sign-post-schematic',
      `excludedSupports: ${id} unknown`,
    );
  }

  // Governed approach and control line
  const line = data.governedApproach.linkedControlLine;
  const lineEntry = manifestAssets.get(line.markingAssetId);
  if (check(file, lineEntry !== undefined, `linkedControlLine ${line.markingAssetId} not in manifest`)) {
    check(file, lineEntry.family === 'markings', 'linkedControlLine must be a marking');
  }
  check(file, data.governedApproach.approachCount === 1, 'first-slice parts govern one approach');
  check(file, data.governedApproach.facesGovernedApproachOnly === true, 'must face the governed approach only');

  for (const m of data.measurements) checkMeasurement(file, m, `measurement ${m.name}`);
  check(file, data.unknowns.length > 0, 'unknowns must be listed');
  check(file, data.sourceGaps.length > 0, 'sourceGaps must be listed');
  check(file, data.warnings.some((w) => /2400|2290/.test(w)), 'warnings must disambiguate 2400/2290');

  if (data.kind === 'sign_face') {
    check(file, ['give_way_sign', 'stop_sign'].includes(data.part.role), 'sign role invalid');
    check(file, data.part.faceMm.width === 600 && data.part.faceMm.height === 600, 'TFM1 faces are 600 x 600');
    check(file, data.compatibleSupports.length > 0, 'a mounted sign needs at least one support candidate');
    check(
      file,
      data.compatibleSupports.filter((cs) => cs.preferredForDevelopmentFixture).length === 1,
      'exactly one support must be preferred for the development fixture',
    );
    const expectedLine = data.part.role === 'give_way_sign' ? 'give_way_line' : 'stop_line';
    check(file, line.role === expectedLine, `linkedControlLine.role must be ${expectedLine}`);
  } else if (data.kind === 'signal_head') {
    check(file, data.part.role === 'vehicle_signal_head', 'signal role invalid');
    check(file, data.compatibleSupports.length === 0, 'no sourced signal support exists; compatibleSupports must be empty');
    check(file, typeof data.supportGap?.statement === 'string', 'supportGap.statement required');
    check(
      file,
      data.supportGap.currentFixtureSupport.dimensionsStatus === 'schematic_unsourced',
      'fixture signal pole must stay schematic_unsourced',
    );
    check(file, line.role === 'stop_line', 'signal heads link a stop_line');

    const layout = data.lensLayout;
    check(file, layout.arrangement === 'vertical', 'only the vertical arrangement has artwork');
    check(file, layout.columnSpacingMm === null, 'column spacing is unknown and must stay null');
    for (const id of layout.definitionIds) {
      check(file, definitionIds.has(id), `lensLayout.definitionIds: ${id} unknown`);
    }
    const rowOf = (colour) => layout.rows.find((r) => r.colour === colour)?.index;
    check(
      file,
      rowOf('red') === 0 && rowOf('amber') === 1 && rowOf('green') === 2,
      'vertical order must be red above amber above green',
    );
    const slotNames = new Set();
    for (const s of layout.slots) {
      check(file, !slotNames.has(s.slot), `duplicate slot ${s.slot}`);
      slotNames.add(s.slot);
      check(file, s.row === rowOf(s.colour), `${s.slot}: row does not match its colour row`);
      const column = layout.columns.find((c) => c.index === s.column);
      check(file, column !== undefined && column.shape === s.shape, `${s.slot}: shape/column mismatch`);
    }
    for (const colour of ['red', 'amber', 'green']) {
      const circular = layout.slots.find((s) => s.shape === 'circular' && s.colour === colour);
      const arrow = layout.slots.find((s) => s.shape === 'arrow_right' && s.colour === colour);
      check(file, circular && arrow && circular.row === arrow.row, `${colour}: arrow must sit level with circular`);
    }
    check(
      file,
      Object.keys(data.part.illustratedState).every((k) => slotNames.has(k)),
      'illustratedState keys must be slots',
    );
    check(
      file,
      data.part.illustratedState.circular_green === 'lit' && data.part.illustratedState.right_arrow_red === 'lit',
      'illustrated state must be circular green + right arrow red lit',
    );
    check(
      file,
      Object.values(data.part.illustratedState).filter((v) => v === 'lit').length === 2,
      'exactly two aspects are lit in the illustration',
    );

    const dim = (name) => layout.lensDimensions.find((d) => d.name === name);
    const lens = dim('effective_lens_diameter');
    const lowest = dim('lowest_lens_centre_above_ground');
    const adjacent = dim('adjacent_lens_centre_distance');
    check(file, lens?.minimumMm === 200 && lens.valueMm === null, 'lens diameter: minimum 200, actual unknown');
    check(file, lowest?.valueMm === 2290 && lowest.maximumMm === 3000, 'lowest lens centre: 2290 nominal, 3000 gradient maximum');
    check(file, adjacent?.maximumMm === 500 && adjacent.valueMm === null, 'adjacent centres: max 500, actual unknown');
    for (const d of layout.lensDimensions) {
      checkMeasurement(file, d, `lensDimension ${d.name}`);
      check(file, d.method === 'statutory_text' && d.locator.sourceId === 'rule11', `${d.name}: must cite Rule 11`);
    }
    check(
      file,
      lowest.notes.some((n) => /not a pole height/i.test(n)),
      '2290 must be flagged as lowest lens centre, not pole height',
    );
    const gapIds = new Set(data.sourceGaps.map((g) => g.id));
    check(file, gapIds.has('green_b_placement_conflict'), 'Green B conflict must be preserved');
    check(file, gapIds.has('horizontal_head_artwork'), 'horizontal artwork gap must be preserved');
    for (const g of data.sourceGaps) {
      check(file, /unresolved/.test(g.status), `sourceGap ${g.id} must stay unresolved`);
    }
    check(
      file,
      data.part.sourceIllustration.imageXref === partEntry?.asset.source.image_xref,
      'imageXref differs from manifest',
    );
    check(
      file,
      JSON.stringify(data.part.sourceIllustration.bboxPdfPoints) ===
        JSON.stringify(partEntry?.asset.source.bbox_pdf_points),
      'illustration bbox differs from manifest',
    );
  } else {
    fail(file, `unknown kind ${data.kind}`);
  }
}
pass(`assemblies: ${assemblies.length} candidates validated (axes, supports, control lines, lens layout)`);

// ---------------------------------------------------------------------------
// Report

for (const p of passes) console.log(`ok   ${p}`);
for (const f of failures) console.log(`FAIL ${f}`);
console.log(
  failures.length === 0
    ? 'starter-assemblies check passed. All candidates remain release_ready=false / reuse unreviewed.'
    : `starter-assemblies check failed with ${failures.length} problem(s).`,
);
process.exitCode = failures.length === 0 ? 0 : 1;
