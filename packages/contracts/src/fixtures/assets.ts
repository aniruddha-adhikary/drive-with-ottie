import { type AssetDefinition } from '../asset';
import { type ReviewState } from '../source';
import { type AssetRef, assemblyDefinitionId, assetId, sha256 } from '../ids';
import { millimetres, unitVec3 } from '../units';
import {
  LOC_RMS2_D,
  LOC_RMS2_J,
  LOC_RULE11_PAIRED_ARROWS,
  LOC_RULE11_RED_ARROW_PROHIBITS,
  LOC_RULE11_VERTICAL_ORDER,
  LOC_TFM1_GIVE_WAY,
  LOC_TFM1_STOP,
  LOC_TP_GIVE_WAY_STOP_MEANING,
  LOC_TP_SIGNAL_GREEN_RIGHT_RED,
} from './sources';

/**
 * DEVELOPMENT asset definitions. Every record below is a quarantined extraction candidate:
 * `review.releaseReady` is false, content/reuse are NOT approved and warnings are copied from the
 * manifests. Hashes, locators and dimensions are verbatim from assets/sg/**\/manifest.json
 * (cross-checked by packages/contracts/test/fixture-assets-match-manifests.test.ts).
 *
 * These are the F0 reference samples for the contract shape. C1 (packages/asset-registry) is the
 * real producer of AssetDefinitions from the manifests; A1/A2 own the reviewed content candidates.
 */

const FACE_FRONT = unitVec3(0, -1, 0); // asset frame: readable side faces -Y (toward the observer)
const FACE_UP = unitVec3(0, 0, 1);

const MANDATORY_FACE_WARNINGS = [
  'Reference PNG retains dimension leaders and source annotations; it is not a production texture.',
  'White paper inside the original backing perimeter is made opaque; transparent outside. This interpretation requires content review.',
  'Source RGB colours and lettering paths are preserved; they are not certified physical colour/material specifications.',
  'MuPDF PDF-to-SVG numeric colour conversion differs from PDF raster output by up to one RGB byte value in flat regions; no manual colour changes are applied.',
  'Artwork extraction does not verify legal applicability or grant reproduction rights.',
] as const;

function quarantined(extractionStatus: ReviewState['extractionStatus'], warnings: readonly string[]): ReviewState {
  return {
    extractionStatus,
    runtimeState: 'draft',
    warnings,
    contentApproved: false,
    reuseApproved: false,
    approvalEvidence: [],
    licenseStatus: 'unreviewed',
    releaseReady: false,
  };
}

export const ASSET_GIVE_WAY_FACE: AssetDefinition = {
  id: assetId('sg.mandatory.give-way'),
  version: 1,
  name: 'Give Way',
  role: 'give_way_sign',
  allowedContexts: { controlRegimes: ['give_way'], roadClasses: ['minor_access', 'local', 'development_access'] },
  geometry: {
    kind: 'face',
    face: {
      shape: 'triangle_point_down',
      widthMm: millimetres(600),
      heightMm: millimetres(600),
      front: FACE_FRONT,
      up: FACE_UP,
      mirrorAllowed: false,
    },
  },
  attachments: [
    { name: 'back_centre', offsetMm: { x: millimetres(0), y: millimetres(0), z: millimetres(0) }, accepts: ['support'] },
  ],
  provenance: {
    family: 'mandatory',
    representation: 'cleaned_vector',
    files: [
      { role: 'reference_png', path: 'assets/sg/mandatory/give-way.reference.png', sha256: sha256('5bf71365eda80f838bfe19ed89700240d472115843b8084f399ae35df7062430') },
      { role: 'renderer_svg', path: 'assets/sg/mandatory/give-way.svg', sha256: sha256('7c72fe963046566a2b3dfacc1402c17c6443ec99e9618a7db0300e118e0d2a9a') },
    ],
    geometrySources: [LOC_TFM1_GIVE_WAY],
    meaningSources: [LOC_TP_GIVE_WAY_STOP_MEANING],
    measurements: [
      { name: 'backing_width', valueMm: millimetres(600), endpoints: 'left outer backing edge to right outer backing edge', method: 'printed_dimension_label', locator: { ...LOC_TFM1_GIVE_WAY, bboxPdfPoints: [507, 39, 684, 58] } },
      { name: 'backing_height', valueMm: millimetres(600), endpoints: 'top outer backing edge to bottom outer backing edge', method: 'printed_dimension_label', locator: { ...LOC_TFM1_GIVE_WAY, bboxPdfPoints: [705, 81, 728, 256] } },
    ],
    rawDimensionsMm: { backing_width: 600, backing_height: 600 },
    rawFamilyEvidence: {
      traffic_rule: {
        action: 'slow_down_and_stop_if_necessary',
        yield_to: 'traffic on major road',
        text: 'Slow down. Stop if necessary. Give way to traffic on major road.',
        source_id: 'spf-btt-2026',
        pdf_page: 11,
        printed_page: '10',
      },
    },
    extractionRecipe: {
      method: 'Select original paint paths including outlined lettering and backing. Add white interior from the joined original backing perimeter; omit engineering annotations.',
      tool: 'PyMuPDF',
      toolVersion: '1.26.4',
      recipe: 'tools/asset_extraction/mandatory/recipe.json',
      recipeSha256: sha256('ee09a66fafa00fa9155f690ebb611a15ea408b3294fc969766ab3db9e01e625a'),
    },
    relatedAssetIds: [],
  },
  review: quarantined('cleaned_unverified', MANDATORY_FACE_WARNINGS),
  unknowns: ['mounting height', 'support family', 'lateral offset from kerb'],
};

export const ASSET_STOP_FACE: AssetDefinition = {
  id: assetId('sg.mandatory.stop'),
  version: 1,
  name: 'Stop',
  role: 'stop_sign',
  allowedContexts: { controlRegimes: ['stop'], roadClasses: ['minor_access', 'local', 'development_access'] },
  geometry: {
    kind: 'face',
    face: {
      shape: 'octagon',
      widthMm: millimetres(600),
      heightMm: millimetres(600),
      front: FACE_FRONT,
      up: FACE_UP,
      mirrorAllowed: false,
    },
  },
  attachments: [
    { name: 'back_centre', offsetMm: { x: millimetres(0), y: millimetres(0), z: millimetres(0) }, accepts: ['support'] },
  ],
  provenance: {
    family: 'mandatory',
    representation: 'cleaned_vector',
    files: [
      { role: 'reference_png', path: 'assets/sg/mandatory/stop.reference.png', sha256: sha256('016e34004949f812122ee21b5b045ac6cf7c806165794065964f7bd427eff3db') },
      { role: 'renderer_svg', path: 'assets/sg/mandatory/stop.svg', sha256: sha256('c090dffdeb788fb7a7aabed64791b1465489eae0cc6f8cdf8e366b328348bc50') },
    ],
    geometrySources: [LOC_TFM1_STOP],
    meaningSources: [LOC_TP_GIVE_WAY_STOP_MEANING],
    measurements: [
      { name: 'backing_width', valueMm: millimetres(600), endpoints: 'left outer backing edge to right outer backing edge', method: 'printed_dimension_label', locator: { ...LOC_TFM1_STOP, bboxPdfPoints: [164, 39, 338, 60] } },
      { name: 'backing_height', valueMm: millimetres(600), endpoints: 'top outer backing edge to bottom outer backing edge', method: 'printed_dimension_label', locator: { ...LOC_TFM1_STOP, bboxPdfPoints: [352, 82, 369, 256] } },
    ],
    rawDimensionsMm: { backing_width: 600, backing_height: 600 },
    rawFamilyEvidence: {
      traffic_rule: {
        action: 'stop_before_line',
        yield_to: 'traffic from right and left',
        text: 'Stop before the white line. Give way to traffic from the right and left.',
        source_id: 'spf-btt-2026',
        pdf_page: 11,
        printed_page: '10',
      },
    },
    extractionRecipe: {
      method: 'Select original paint paths including outlined lettering and backing. Add white interior from the joined original backing perimeter; omit engineering annotations.',
      tool: 'PyMuPDF',
      toolVersion: '1.26.4',
      recipe: 'tools/asset_extraction/mandatory/recipe.json',
      recipeSha256: sha256('ee09a66fafa00fa9155f690ebb611a15ea408b3294fc969766ab3db9e01e625a'),
    },
    relatedAssetIds: [],
  },
  review: quarantined('cleaned_unverified', MANDATORY_FACE_WARNINGS),
  unknowns: ['mounting height', 'support family', 'lateral offset from kerb'],
};

const MARKING_WARNINGS_COMMON = [
  'Dimension leaders/context in reference PNG are not production paint.',
  'Selected original paint paths require content review; original PNG remains authoritative.',
  'Parameter-generated SVG is distinct from source vector extraction; sample extent is illustrative.',
] as const;

const MARKING_RECIPE = {
  method: 'Lossless PNG render directly from hash-pinned original PDF, bounded clip at 216 dpi; optional recipe polygon excludes neighbouring drawing fragments',
  tool: 'PyMuPDF / MuPDF',
  toolVersion: '1.26.4 / 1.26.7',
  recipe: 'tools/asset_extraction/markings/recipes.json',
  recipeSha256: null,
} as const;

/** RMS2 "D": two broken transverse rows — the Give Way line. Removing a row is a different (wrong) marking. */
export const ASSET_GIVE_WAY_LINE_D: AssetDefinition = {
  id: assetId('sg.markings.control-give-way-d'),
  version: 1,
  name: 'Give Way line — D',
  role: 'give_way_line',
  allowedContexts: { controlRegimes: ['give_way'], roadClasses: ['minor_access', 'local', 'development_access', 'major'] },
  geometry: {
    kind: 'marking',
    marking: {
      rows: 2,
      widthMm: millimetres(100),
      paintedLengthMm: millimetres(1000),
      clearGapMm: millimetres(1000),
      interRowClearGapMm: millimetres(150),
      continuous: false,
      attachesTo: ['control_line'],
    },
  },
  attachments: [],
  provenance: {
    family: 'markings',
    representation: 'parametric_geometry',
    files: [
      { role: 'reference_png', path: 'assets/sg/markings/references/control-give-way-d.png', sha256: sha256('711a32ef5b372a40f50ac5e61012d5c475707104cd84e10c870e0eb0b551b0b6') },
      { role: 'reference_svg', path: 'assets/sg/markings/source-vectors/control-give-way-d.svg', sha256: sha256('3eb55e5ab19cea7fc421dcbe5d47a7bc319e996ea922495139ae5fdf05e353b8') },
      { role: 'renderer_svg', path: 'assets/sg/markings/geometry/control-give-way-d.svg', sha256: sha256('74c82ce84ed08c420cff765190309f76b1ecb2339bbfcbafb65907e8536c6e48') },
      { role: 'geometry_json', path: 'assets/sg/markings/geometry/control-give-way-d.json', sha256: sha256('1d34711addbb6a2541db0bfee0becbc88b2332608422cf4e195d4227f7aa8eb1') },
    ],
    geometrySources: [LOC_RMS2_D],
    meaningSources: [LOC_TP_GIVE_WAY_STOP_MEANING],
    measurements: [
      { name: 'width', valueMm: millimetres(100), endpoints: 'paint edge on one side of a row → opposite paint edge of the same row', method: 'printed_dimension_label', locator: LOC_RMS2_D },
      { name: 'painted_length', valueMm: millimetres(1000), endpoints: 'start edge of one painted segment → end edge of that segment', method: 'printed_dimension_label', locator: LOC_RMS2_D },
      { name: 'clear_gap', valueMm: millimetres(1000), endpoints: 'end edge of a painted segment → start edge of the next painted segment', method: 'printed_dimension_label', locator: LOC_RMS2_D },
      { name: 'inter_row_clear_gap', valueMm: millimetres(150), endpoints: 'inner edge of first row → nearest inner edge of second row', method: 'printed_dimension_label', locator: LOC_RMS2_D },
    ],
    rawDimensionsMm: { width: 100, painted_length: 1000, clear_gap: 1000, inter_row_clear_gap: 150 },
    rawFamilyEvidence: { derived_row_centre_spacing_mm: 250 },
    extractionRecipe: MARKING_RECIPE,
    relatedAssetIds: [],
  },
  review: quarantined('verified_geometry', MARKING_WARNINGS_COMMON),
  unknowns: ['site-specific line extent', 'site-specific placement'],
};

/** RMS2 "J": 300 mm continuous transverse line. Role here is `stop_line`; the same paint as a shoulder boundary is a different role. */
export const ASSET_STOP_LINE_J: AssetDefinition = {
  id: assetId('sg.markings.control-stop-j'),
  version: 1,
  name: 'Transverse stop line — J',
  role: 'stop_line',
  allowedContexts: {
    controlRegimes: ['stop', 'signalised'],
    roadClasses: ['minor_access', 'local', 'development_access', 'major'],
    notes: ['Shares J geometry with the longitudinal paved-shoulder boundary; semantic role must remain separate.'],
  },
  geometry: {
    kind: 'marking',
    marking: {
      rows: 1,
      widthMm: millimetres(300),
      paintedLengthMm: null,
      clearGapMm: null,
      interRowClearGapMm: null,
      continuous: true,
      attachesTo: ['control_line'],
    },
  },
  attachments: [],
  provenance: {
    family: 'markings',
    representation: 'parametric_geometry',
    files: [
      { role: 'reference_png', path: 'assets/sg/markings/references/control-stop-j.png', sha256: sha256('b785e831fa9ec2ef342f7d6ff9408431d0f33921a945085364aa439a5180343e') },
      { role: 'reference_svg', path: 'assets/sg/markings/source-vectors/control-stop-j.svg', sha256: sha256('e3197b3c3c8fe072161a819cd97acb250076b1a59ef83b2e757191a8ae112c05') },
      { role: 'renderer_svg', path: 'assets/sg/markings/geometry/control-stop-j.svg', sha256: sha256('1defe91fe9da0248bbaf1b74076a79f162fa067ce2c2c5ad71066e7418f4a049') },
      { role: 'geometry_json', path: 'assets/sg/markings/geometry/control-stop-j.json', sha256: sha256('bdc9598effd5df60cc2b32574e44aa75eaefe4e2ef589640284963a22118e1a2') },
    ],
    geometrySources: [LOC_RMS2_J],
    meaningSources: [LOC_TP_GIVE_WAY_STOP_MEANING],
    measurements: [
      { name: 'width', valueMm: millimetres(300), endpoints: 'paint edge on one side of a row → opposite paint edge of the same row', method: 'printed_dimension_label', locator: LOC_RMS2_J },
    ],
    rawDimensionsMm: { width: 300 },
    rawFamilyEvidence: { display_sample_continuous_length_mm: 4000, display_sample_is_engineering_requirement: false },
    extractionRecipe: MARKING_RECIPE,
    relatedAssetIds: [],
  },
  review: quarantined('verified_geometry', ['Shares J geometry with longitudinal paved-shoulder boundary; semantic role must remain separate.', ...MARKING_WARNINGS_COMMON]),
  unknowns: ['site-specific line extent', 'site-specific placement'],
};

/**
 * Vertical circular R/A/G head with a paired right-arrow column. Physical housing, pole and
 * attachment offsets are null in the source definitions and stay null here.
 */
export const ASSET_SIGNAL_HEAD_THROUGH_GREEN_RIGHT_RED: AssetDefinition = {
  id: assetId('sg.assemblies.signal-through-green-right-red'),
  version: 1,
  name: 'Circular green with right-arrow red',
  role: 'vehicle_signal_head',
  allowedContexts: { controlRegimes: ['signalised'], roadClasses: ['local', 'major'] },
  geometry: {
    kind: 'signal_head',
    head: {
      arrangement: 'vertical',
      aspects: [
        { slot: 'circular_red', colour: 'red', shape: 'circular', column: 0, row: 0 },
        { slot: 'circular_amber', colour: 'amber', shape: 'circular', column: 0, row: 1 },
        { slot: 'circular_green', colour: 'green', shape: 'circular', column: 0, row: 2 },
        { slot: 'right_arrow_red', colour: 'red', shape: 'arrow_right', column: 1, row: 0 },
        { slot: 'right_arrow_amber', colour: 'amber', shape: 'arrow_right', column: 1, row: 1 },
        { slot: 'right_arrow_green', colour: 'green', shape: 'arrow_right', column: 1, row: 2 },
      ],
      lensDiameterMm: { name: 'effective_lens_diameter', valueMm: null, minimumMm: millimetres(200), endpoints: 'effective optical lens diameter', method: 'statutory_text', locator: LOC_RULE11_VERTICAL_ORDER },
      lowestLensCentreAboveGroundMm: { name: 'lowest_lens_centre_above_ground', valueMm: millimetres(2290), maximumMm: millimetres(3000), endpoints: 'ground surface to centre of lowest lens, including arrow lenses', method: 'statutory_text', locator: LOC_RULE11_VERTICAL_ORDER, notes: ['2290 mm nominal; may increase to 3000 mm only where desirable owing to road gradient'] },
      adjacentLensCentreDistanceMm: { name: 'adjacent_lens_centre_distance', valueMm: null, maximumMm: millimetres(500), endpoints: 'centre to centre of adjacent lenses', method: 'statutory_text', locator: LOC_RULE11_VERTICAL_ORDER },
      front: FACE_FRONT,
      up: FACE_UP,
      definitionIds: [
        assemblyDefinitionId('sg.assemblies.definition.signal-vertical-rag'),
        assemblyDefinitionId('sg.assemblies.definition.signal-vertical-paired-arrows'),
      ],
    },
  },
  // Source attachment_anchors_mm is null; a zero-offset back-centre point is a schematic stand-in (see unknowns).
  attachments: [
    { name: 'back_centre', offsetMm: { x: millimetres(0), y: millimetres(0), z: millimetres(0) }, accepts: ['support'] },
  ],
  provenance: {
    family: 'assemblies',
    representation: 'source_reference',
    files: [
      { role: 'reference_png', path: 'assets/sg/assemblies/signal-through-green-right-red.png', sha256: sha256('7b09247af5282da4a71ee657c8285cd6045f4de23d7713acb2922bf48c57101c') },
    ],
    geometrySources: [LOC_TP_SIGNAL_GREEN_RIGHT_RED],
    meaningSources: [LOC_RULE11_VERTICAL_ORDER, LOC_RULE11_PAIRED_ARROWS, LOC_RULE11_RED_ARROW_PROHIBITS],
    measurements: [],
    rawDimensionsMm: {},
    rawFamilyEvidence: {
      assembly_context: {
        view: 'Circular green with right-arrow red',
        support_required: true,
        mount: null,
        support_family: null,
        attachment_anchors_mm: null,
        face_normal_world: null,
        intended_observer_or_approach: 'approaching traffic',
        reference_context: 'Traffic Police signal illustration',
        is_3d_model: false,
      },
      pixel_size: [205, 293],
    },
    extractionRecipe: {
      method: 'native_pdf_image_decode_to_lossless_png',
      tool: 'PyMuPDF',
      toolVersion: '1.26.4',
      recipe: 'tools/asset_extraction/assemblies/catalog.py',
      recipeSha256: null,
    },
    relatedAssetIds: [],
  },
  review: quarantined('extracted_reference', [
    'Circular and arrow states are independent; the handbook examples retain circular green while the right-arrow state changes.',
    'Source illustration is a raster image; no housing geometry, pole or attachment offsets are known.',
  ]),
  unknowns: ['housing width/height/depth', 'column spacing', 'pole height', 'attachment offsets', 'support family', 'mount type'],
};

/* ------------------------------------------------------------------------------------------------
 * Schematic, unsourced development stand-ins. These are NOT extracted assets; they exist so the
 * fixtures are renderable. Their IDs use the `sg.dev.*` family and can never be release-ready.
 * ---------------------------------------------------------------------------------------------- */

const SCHEMATIC_REVIEW = quarantined('blocked', [
  'Schematic development stand-in with no official source; dimensions are teaching-layout choices.',
]);

const SCHEMATIC_PROVENANCE = {
  family: 'runtime',
  representation: 'parametric_geometry',
  files: [],
  geometrySources: [],
  meaningSources: [],
  measurements: [],
  rawDimensionsMm: {},
  rawFamilyEvidence: {},
  extractionRecipe: { method: 'schematic', tool: 'none', toolVersion: '0', recipe: 'none', recipeSha256: null },
  relatedAssetIds: [],
} as const satisfies AssetDefinition['provenance'];

export const ASSET_DEV_SIGN_POST: AssetDefinition = {
  id: assetId('sg.dev.sign-post-schematic'),
  version: 1,
  name: 'Schematic sign post (development only)',
  role: 'sign_post',
  allowedContexts: { controlRegimes: ['give_way', 'stop', 'signalised', 'uncontrolled', 'zebra_crossing'], roadClasses: ['minor_access', 'local', 'major', 'development_access', 'expressway'] },
  geometry: {
    kind: 'support',
    heightMm: null,
    attachments: [
      { name: 'ground', offsetMm: { x: millimetres(0), y: millimetres(0), z: millimetres(0) }, accepts: ['ground'] },
      { name: 'top_face_mount', offsetMm: { x: millimetres(0), y: millimetres(0), z: millimetres(2100) }, accepts: ['face'] },
    ],
  },
  attachments: [],
  provenance: SCHEMATIC_PROVENANCE,
  review: SCHEMATIC_REVIEW,
  unknowns: ['official post height', 'post section', 'mounting hardware'],
};

export const ASSET_DEV_SIGNAL_POLE: AssetDefinition = {
  id: assetId('sg.dev.signal-pole-schematic'),
  version: 1,
  name: 'Schematic signal pole (development only)',
  role: 'signal_pole',
  allowedContexts: { controlRegimes: ['signalised'], roadClasses: ['local', 'major'] },
  geometry: {
    kind: 'support',
    heightMm: null,
    attachments: [
      { name: 'ground', offsetMm: { x: millimetres(0), y: millimetres(0), z: millimetres(0) }, accepts: ['ground'] },
      { name: 'head_mount', offsetMm: { x: millimetres(0), y: millimetres(0), z: millimetres(2290) }, accepts: ['signal_head'] },
    ],
  },
  attachments: [],
  provenance: SCHEMATIC_PROVENANCE,
  review: SCHEMATIC_REVIEW,
  unknowns: ['official pole height', 'pole section', 'head bracket'],
};

export const ASSET_DEV_CAR: AssetDefinition = {
  id: assetId('sg.dev.car-schematic'),
  version: 1,
  name: 'Schematic car (development only)',
  role: 'vehicle',
  allowedContexts: { controlRegimes: ['give_way', 'stop', 'signalised', 'uncontrolled', 'zebra_crossing'], roadClasses: ['minor_access', 'local', 'major', 'development_access', 'expressway'] },
  geometry: {
    kind: 'vehicle',
    vehicle: { category: 'car', lengthMm: millimetres(4500), widthMm: millimetres(1800), heightMm: millimetres(1500), frontOffsetMm: millimetres(2250) },
  },
  attachments: [],
  provenance: SCHEMATIC_PROVENANCE,
  review: SCHEMATIC_REVIEW,
  unknowns: [],
};

export const ASSET_DEV_BUS: AssetDefinition = {
  id: assetId('sg.dev.bus-schematic'),
  version: 1,
  name: 'Schematic bus (development only)',
  role: 'vehicle',
  allowedContexts: { controlRegimes: ['give_way', 'stop', 'signalised', 'uncontrolled', 'zebra_crossing'], roadClasses: ['minor_access', 'local', 'major', 'development_access', 'expressway'] },
  geometry: {
    kind: 'vehicle',
    vehicle: { category: 'bus', lengthMm: millimetres(12000), widthMm: millimetres(2500), heightMm: millimetres(3200), frontOffsetMm: millimetres(6000) },
  },
  attachments: [],
  provenance: SCHEMATIC_PROVENANCE,
  review: SCHEMATIC_REVIEW,
  unknowns: [],
};

export const DEVELOPMENT_ASSETS: readonly AssetDefinition[] = [
  ASSET_GIVE_WAY_FACE,
  ASSET_STOP_FACE,
  ASSET_GIVE_WAY_LINE_D,
  ASSET_STOP_LINE_J,
  ASSET_SIGNAL_HEAD_THROUGH_GREEN_RIGHT_RED,
  ASSET_DEV_SIGN_POST,
  ASSET_DEV_SIGNAL_POLE,
  ASSET_DEV_CAR,
  ASSET_DEV_BUS,
];

/** Extracted (manifest-backed) subset of DEVELOPMENT_ASSETS. */
export const EXTRACTED_DEVELOPMENT_ASSETS: readonly AssetDefinition[] = DEVELOPMENT_ASSETS.filter(
  (asset) => asset.provenance.family !== 'runtime',
);

export const ref = (asset: AssetDefinition): AssetRef => ({ id: asset.id, version: asset.version });
