import { type SourceLocator, type SourceRef } from '../source';
import { sha256, sourceId } from '../ids';

/**
 * Official sources referenced by the development fixtures. Values are copied verbatim from the
 * extraction manifests (assets/sg/{mandatory,markings,assemblies}/manifest.json); a contracts test
 * cross-checks these hashes against the manifests so they cannot drift.
 *
 * Source IDs follow the mandatory/markings manifests. The assemblies manifest uses short aliases
 * (`tp`, `rule11`); `ASSEMBLY_SOURCE_ALIASES` maps them.
 */
export const SOURCE_TP_HANDBOOK: SourceRef = {
  id: sourceId('spf-btt-2026'),
  url: 'https://www.police.gov.sg/-/media/SPF/Advisories/TP/BT-ENG-2126.pdf',
  publisher: 'Singapore Police Force, Traffic Police',
  edition: 'Updated 2 January 2026',
  collectionRevision: null,
  publishedOn: null,
  effectiveFrom: null,
  retrievedAt: '2026-09-14',
  sha256: sha256('4f258856a25b8d0a44e9091f361ce0a07e24138b9a8515620936d088d3c7cefa'),
  hashScope: 'original downloaded PDF bytes',
  pageCount: 90,
  verifiedFacts: [],
  unresolved: [],
};

export const SOURCE_LTA_TFM: SourceRef = {
  id: sourceId('lta-sdre-i-tfm'),
  url: 'https://www.lta.gov.sg/content/dam/ltagov/industry_innovations/industry_matters/development_construction_resources/Street_Work_Proposals/Standards_and_Specifications/SDRE/SDRE14-15_TFM_1-2_March_2026.pdf',
  publisher: 'LTA',
  edition: null,
  collectionRevision: 'I',
  publishedOn: null,
  effectiveFrom: null,
  retrievedAt: '2026-09-14',
  sha256: sha256('8decfe2306c6fb1b738c82a82bc4d657ef6a8a16ba4a0a342522126fd0113af1'),
  hashScope: 'original downloaded PDF bytes',
  pageCount: 3,
  verifiedFacts: [],
  unresolved: [],
};

export const SOURCE_LTA_RMS: SourceRef = {
  id: sourceId('lta-sdre-I-rms'),
  url: 'https://www.lta.gov.sg/content/dam/ltagov/industry_innovations/industry_matters/development_construction_resources/Street_Work_Proposals/Standards_and_Specifications/SDRE/SDRE14-8_RMS_1-14_March_2026.pdf',
  publisher: 'LTA',
  edition: null,
  collectionRevision: 'I',
  publishedOn: null,
  effectiveFrom: null,
  retrievedAt: '2026-09-14',
  sha256: sha256('262ec3c439c8101945b7504e09e19c172485c5568cf7ba2f997fefa732d44059'),
  hashScope: 'original downloaded PDF bytes',
  pageCount: 15,
  verifiedFacts: [],
  unresolved: [],
};

export const SOURCE_RULE_11: SourceRef = {
  id: sourceId('rule11'),
  url: 'https://sso.agc.gov.sg/SL/RTA1961-R33?ProvIds=pr11-&ViewType=Within',
  publisher: "Singapore Statutes Online / Attorney-General's Chambers",
  edition: null,
  collectionRevision: null,
  publishedOn: null,
  effectiveFrom: null,
  retrievedAt: '2026-09-14',
  sha256: sha256('c0ec46b7d0a405fa076383364a7e1e2028a44a300b7cfd57dc0d74564c895f05'),
  hashScope: 'captured web_get_contents tool text, not original HTML bytes',
  pageCount: null,
  verifiedFacts: [],
  unresolved: [
    'Direct HTTP retrieval returned 403; captured text ends partway through the final green-arrow paragraph.',
  ],
};

/** Short source aliases used inside assets/sg/assemblies/manifest.json. */
export const ASSEMBLY_SOURCE_ALIASES: Readonly<Record<string, SourceRef['id']>> = {
  tp: SOURCE_TP_HANDBOOK.id,
  rule11: SOURCE_RULE_11.id,
};

export const FIXTURE_SOURCES: readonly SourceRef[] = [
  SOURCE_TP_HANDBOOK,
  SOURCE_LTA_TFM,
  SOURCE_LTA_RMS,
  SOURCE_RULE_11,
];

/* Locators used by fixtures (copied from manifests / assembly-definitions.json). */

export const LOC_TFM1_GIVE_WAY: SourceLocator = {
  sourceId: SOURCE_LTA_TFM.id,
  pdfPage: 2,
  printedPage: '15-1',
  drawing: 'LTA/SDRE14/15/TFM1',
  drawingRevision: '-',
  bboxPdfPoints: [415, 39, 730, 304],
};

export const LOC_TFM1_STOP: SourceLocator = {
  sourceId: SOURCE_LTA_TFM.id,
  pdfPage: 2,
  printedPage: '15-1',
  drawing: 'LTA/SDRE14/15/TFM1',
  drawingRevision: '-',
  bboxPdfPoints: [135, 38, 372, 302],
};

export const LOC_RMS2_D: SourceLocator = {
  sourceId: SOURCE_LTA_RMS.id,
  pdfPage: 3,
  printedPage: '8-2',
  drawing: 'LTA/SDRE14/8/RMS2',
  drawingRevision: 'B',
  bboxPdfPoints: [145, 88, 532, 127],
};

export const LOC_RMS2_J: SourceLocator = {
  sourceId: SOURCE_LTA_RMS.id,
  pdfPage: 3,
  printedPage: '8-2',
  drawing: 'LTA/SDRE14/8/RMS2',
  drawingRevision: 'B',
  bboxPdfPoints: [145, 340, 532, 379],
};

/** Traffic Police handbook: meanings of Give Way and Stop (manifest `traffic_rule`). */
export const LOC_TP_GIVE_WAY_STOP_MEANING: SourceLocator = {
  sourceId: SOURCE_TP_HANDBOOK.id,
  pdfPage: 11,
  printedPage: '10',
  drawing: null,
  drawingRevision: null,
  bboxPdfPoints: null,
};

/** Traffic Police handbook: circular green with right-arrow red illustration. */
export const LOC_TP_SIGNAL_GREEN_RIGHT_RED: SourceLocator = {
  sourceId: SOURCE_TP_HANDBOOK.id,
  pdfPage: 47,
  printedPage: '46',
  drawing: null,
  drawingRevision: null,
  bboxPdfPoints: [399.3500061035156, 157.29998779296875, 473.3210144042969, 263.04998779296875],
  bboxDisplayPdfPoints: [399.3500061035156, 157.29998779296875, 473.3210144042969, 263.04998779296875],
};

export const LOC_RULE11_VERTICAL_ORDER: SourceLocator = {
  sourceId: SOURCE_RULE_11.id,
  pdfPage: null,
  printedPage: null,
  drawing: null,
  drawingRevision: null,
  bboxPdfPoints: null,
  section: 'Rule 11, vertical arrangement and vertical lens dimensions',
  quote: 'the red light shall be placed above the amber light and the green light shall be placed below the amber light',
};

export const LOC_RULE11_PAIRED_ARROWS: SourceLocator = {
  sourceId: SOURCE_RULE_11.id,
  pdfPage: null,
  printedPage: null,
  drawing: null,
  drawingRevision: null,
  bboxPdfPoints: null,
  section: 'Rule 11, vertical circular lights with arrow combinations',
  quote: 'each arrow light shall be placed at the same level with a light of the same colour',
};

export const LOC_RULE11_RED_ARROW_PROHIBITS: SourceLocator = {
  sourceId: SOURCE_RULE_11.id,
  pdfPage: null,
  printedPage: null,
  drawing: null,
  drawingRevision: null,
  bboxPdfPoints: null,
  section: 'Rule 11, red arrow',
  quote:
    'the illuminated red arrow light shall be taken as prohibiting vehicles from proceeding beyond the stop line or broken lines on the road in that direction',
};
