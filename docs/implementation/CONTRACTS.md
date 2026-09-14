# F0 — Contracts, fixtures and toolchain

This document preserves the original F0 handoff and its baseline module map.
For delivered implementations and remaining integration work, see the
[current execution checkpoint](../EXECUTION-PLAN.md#current-implementation-checkpoint).

`CONTRACT_VERSION = 1` (`packages/contracts/src/version.ts`). This document is the handoff for every
downstream execution-plan job (A1–A3, C1–C2, R1–R2, U1–U3, V1, T1, H1, I1, Q1–Q3). Read it together
with the actual types under `packages/contracts/src/`; when the two disagree, the types win and this
file has a bug.

F0 is foundation only. It contains **no** working generator, renderer, validator, lesson UI or
persistence engine. Every `MODULE_STATUS.pending` list is real remaining work. Nothing in this branch
grants source, content or reuse approval: all 339 extracted assets remain `release_ready: false` and
the three fixtures are `status: 'development_fixture'` with `usesQuarantinedAssets: true`.

## 1. Runtime, package manager and dependencies

| Item | Pinned value | Where |
| --- | --- | --- |
| Node | `24.20.0` (`>=24.20.0 <25`) | `.nvmrc`, `package.json#engines` |
| npm | `11.19.0` (`>=11.19.0 <12`) | `package.json#packageManager`, `engines` |
| Install policy | `engine-strict`, `save-exact`, esbuild install script approved | `.npmrc`, `package.json#devEngines` |
| React / React DOM | `19.2.8` | `package.json` |
| Three.js | `0.185.1` | |
| Zod | `4.5.4` | |
| Vite | `8.2.2` (`@vitejs/plugin-react 6.1.1`) | |
| Vitest | `4.1.11` (+ `jsdom`, `@testing-library/react`, `@testing-library/jest-dom`) | |
| TypeScript | `5.9.3` | |
| ESLint | `10.10.0` + `typescript-eslint 8.69.0` + `eslint-plugin-react-hooks 7.1.1` | `eslint.config.js` |
| Prettier | pinned in `package.json` | `.prettierrc.json` (`format:check` is not part of `npm run check`) |
| tsx | pinned in `package.json` (CLI runner) | |

Activate the runtime before anything else:

```bash
source ~/.nvm/nvm.sh && nvm use   # reads .nvmrc
npm ci
```

`pnpm`/`yarn` are not used. Do not add a second lockfile. Root `package.json`, `package-lock.json`,
`tsconfig.json`, `vitest.config.ts`, `eslint.config.js`, `config/aliases.ts` and
`apps/web/vite.config.ts` are owned by F0/I1 — request changes in your report instead of editing.

## 2. Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Vite dev server for `apps/web` (fixture inspector + schematic Three.js world) |
| `npm run build` | Production bundle to `apps/web/dist/` (no Node-only imports may reach the browser bundle) |
| `npm run preview` | Serve the built bundle |
| `npm run typecheck` | `tsc -p tsconfig.json --noEmit` over `packages/`, `apps/`, `tools/scenario-review`, `tests/` |
| `npm run lint` | `eslint . --max-warnings 0` (strict type-checked; see §9 for banned syntax) |
| `npm run format` / `format:check` | Prettier |
| `npm run test` | All Vitest projects |
| `npm run test:contracts` | Node project: `packages/**/*.test.ts`, `tools/scenario-review/**/*.test.ts`, `tests/**/*.test.ts` |
| `npm run test:web` | jsdom project: `apps/web/**/*.test.ts(x)` with `apps/web/test/setup.ts` |
| `npm run review:export [-- --json]` | Prints the development-fixture review summary (`tools/scenario-review/src/cli.ts`) |
| `npm run check` | lint → typecheck → test → build |

Scoped runs: `npx vitest run packages/scenario-core` or any path/pattern.

## 3. Module map, owners and aliases

Aliases are declared once in `config/aliases.ts` and mirrored in `tsconfig.json#paths`. Both the
bare alias (`@ottie/contracts` → `src/index.ts`) and deep paths (`@ottie/contracts/fixtures`,
`@ottie/asset-registry/hash.node`) resolve. **Downstream modules add files inside their directory;
they never need to edit an alias, root config or someone else's index.**

| Alias | Directory | Owner | F0 state (`MODULE_STATUS`) |
| --- | --- | --- | --- |
| `@ottie/contracts` | `packages/contracts/src/` | F0 (frozen) | complete for v1 |
| `@ottie/contracts/fixtures` | `packages/contracts/src/fixtures/` | F0 | three development worlds + content + mutations |
| `@ottie/asset-registry` | `packages/asset-registry/src/` | C1 | `createInMemoryResolver`, `registryHashInput`; `hash.node.ts` has `computeRegistryHash` |
| `@ottie/scenario-core` | `packages/scenario-core/src/` | C2 | `createSeededRng`, `createFixtureGenerator` (returns fixtures only) |
| `@ottie/scenario-validation` | `packages/scenario-validation/src/` | V1 | `validateWorld`/`validateQuestion` run **structural checks only**; `SEMANTIC_VALIDATORS = []` |
| `@ottie/renderer-geometry` | `packages/renderer/geometry/src/` | R1 | `buildSchematicScene` (boxes/lines, no real assets) |
| `@ottie/renderer-cameras` | `packages/renderer/cameras/src/` | R2 | `presetToThreeCamera` |
| `@ottie/renderer-evidence` | `packages/renderer/evidence/src/` | R2 | skeleton (`implemented: []`) |
| `@ottie/learning-state` | `packages/learning-state/src/` | U2 | `createMemoryStorage`, `createFixedClock`, `createLocalStorageAdapter` |
| `@ottie/review-export` | `packages/review-export/src/` | H1 | `describeWorldForReview` |
| `@ottie/content/*` | `content/` (directory alias, not yet created) | A1/A2/A3/T1 | JSON content imports, e.g. `@ottie/content/terms/starter/x.json` |
| `@ottie/sg-assets/*` | `assets/sg/` (directory alias) | extraction | read-only manifests/SVG/PNG/geometry |
| `@ottie/web/*` | `apps/web/src/` | U1/U3/I1 | app shell |

Every module exports `MODULE_STATUS: ModuleStatus` (`{ module, owner, implemented, pending }`);
`isSkeleton(status)` is true when `implemented` is empty. The web shell and review CLI display these
so a skeleton can never look like a working module. Keep the lists honest as you implement.

`packages/contracts/src/**` is framework-free: no React, Three.js, `node:*` or `@ottie/*` imports
(`no-restricted-imports` in `eslint.config.js`).
Anything needing `node:*` lives outside the package index (pattern: `hash.node.ts`) so the browser
bundle stays clean.

## 4. Frozen conventions (`packages/contracts/src/units.ts`)

```ts
FROZEN_WORLD_CONVENTIONS: WorldConventions = {
  lengthUnit: 'metre', angleUnit: 'radian',
  axes: { x: 'east', y: 'north', z: 'up' }, handedness: 'right',
  trafficSide: 'LEFT', jurisdiction: 'SG', timezone: 'Asia/Singapore',
  headingZero: '+x', headingPositive: 'counter-clockwise',
}
```

Road frame (`RoadFramePosition`): `s` along the authored road direction, `t` positive to the LEFT of
`s`, `z` up.

- Branded scalars: `Metres`, `Radians`, `Millimetres`, `Station`; constructors `metres()`, `radians()`,
  `millimetres()`, `mmToMetres()`, `degreesToRadians()`. Source dimensions stay in millimetres
  (`Measurement.valueMm`); world geometry is metres.
- `Vec3 {x,y,z}`, `UnitVec3` (normalised, validated by `unitVec3()`), `Pose {position, heading}`,
  `RoadFramePosition {roadId, s, t, z}`. `HEADING.east/north/west/south` radians constants,
  `headingToUnitVec()`.
- Every `World.conventions` must deep-equal `FROZEN_WORLD_CONVENTIONS` (`structural_integrity` checks it).

## 5. Stable IDs and versions (`ids.ts`, `version.ts`)

Branded string IDs with validating constructors: `sourceId`, `assetId` (`sg.<family>.<slug>`),
`assemblyDefinitionId`, `templateId`, `worldId`, `entityId`, `roadId`, `laneId`, `anchorId`,
`movementId`, `questionId`, `termId`, `ruleId`, `evidenceId`, `explanationId`, `topicId`, `runId`,
`attemptId`, `eventId`, `seed`, `sha256`. Patterns: `ASSET_ID_PATTERN`, `STABLE_ID_PATTERN`,
`SHA256_PATTERN`. Never build an ID with a plain string cast.

```ts
interface VersionRef { id; version: number }          // AssetRef, TemplateRef extend this
interface ReproducibilityKey {
  templateRef: TemplateRef; generatorVersion: number; seed: Seed;
  assetRegistryHash: Sha256; sourceProfileId: string;
}
```

Versions: `CONTRACT_VERSION = 1`, `WORLD_SCHEMA_VERSION = 1`, `EXTRACTION_MANIFEST_SCHEMA_VERSION = 1`,
`LEARNING_STATE_SCHEMA_VERSION = 1`. Fixture constants: `FIXTURE_GENERATOR_VERSION = 0` (hand-authored),
`FIXTURE_SOURCE_PROFILE_ID = 'sg-sources-2026-09'`,
`DEVELOPMENT_ASSET_REGISTRY_HASH = cf3e151d…499d5` (= `computeRegistryHash(DEVELOPMENT_ASSETS)`;
the resolver test fails and prints the new value whenever the development asset set changes).

## 6. Sources, extraction manifests and assets

### 6.1 `SourceRef` / `SourceLocator` / `Measurement` (`source.ts`)

`SourceRef` copies the official-source register verbatim: `id`, `url`, `publisher`, `edition`,
`collectionRevision`, `publishedOn`, `effectiveFrom`, `retrievedAt`, `sha256`, `hashScope`,
`pageCount`, `verifiedFacts`, `unresolved` (fields the source does not settle; never resolved by code).
`SourceLocator` = `{ sourceId, pdfPage, printedPage, drawing, drawingRevision, bboxPdfPoints,
bboxDisplayPdfPoints }`. `Measurement` = `{ name, valueMm, endpoints, method, locator, notes? }` with
`MeasurementMethod` recording *how* a value was obtained (`printed_dimension_label`, …).
`ReviewState` = `{ extractionStatus: ExtractionReviewStatus, runtimeState, warnings, contentApproved,
reuseApproved, approvalEvidence, licenseStatus, releaseReady }`; `ExtractionReviewStatus` is the
Python contract's `extracted_reference | cleaned_unverified | verified_geometry | blocked | approved`.

### 6.2 Extraction manifest schemas (`extraction-manifest.ts`)

Zod schemas mirroring `tools/asset_extraction/contract.py` and validated against every real file
under `assets/sg/*/manifest.json` and `assets/sg/markings/geometry/*.json`:
`parseExtractionManifest`, `parseMarkingGeometryProfile` (union of the row-based line layout and the
A9 `circle_groups` layout), `parseExtractionIndex`. Schemas are `.loose()` so unknown fields survive.
`dimensions_mm` is `Record<string, JsonValue>` because the real manifests mix three layouts
(flat numbers with `endpoints`/`method`/`evidence_bbox_pdf_points` siblings, per-dimension objects,
and unresolved `null`s).

### 6.3 Adapters (`asset.ts`)

```ts
adaptExtractionSource(source: ExtractionSource): SourceRef
adaptExtractionLocator(locator: ExtractionLocator): SourceLocator
adaptDimensions(dimensions: Record<string, JsonValue>, source: ExtractionLocator): readonly Measurement[]
adaptExtractionAsset(family: ExtractionFamily, asset: ExtractionAsset):
  Pick<AssetDefinition, 'id' | 'name' | 'provenance' | 'review' | 'unknowns'>
```

The adapter copies `release_ready`, `license_status`, review status/warnings, file paths + SHA-256 per
role, locators, raw `dimensions_mm` and all family-specific extra keys (`rawFamilyEvidence`). It never
infers dimensions, resolves conflicts or promotes review status. C1 builds full `AssetDefinition`s on
top of it (F0's fixtures hand-author the geometry half).

### 6.4 `AssetDefinition` / `AssetResolver`

```ts
interface AssetDefinition {
  id: AssetId; version: number; name: string; role: AssetRole;
  allowedContexts: AllowedContext; geometry: GeometryProfile; attachments: AttachmentPoint[];
  provenance: AssetProvenance;   // files + sha256 per role, locators, rawDimensionsMm, rawFamilyEvidence
  review: ReviewState; unknowns: string[];
}
```

```ts
type GeometryProfile =
  | { kind: 'face'; face: FaceProfile } | { kind: 'marking'; marking: MarkingProfile }
  | { kind: 'signal_head'; head: SignalHeadProfile } | { kind: 'vehicle'; vehicle: VehicleProfile }
  | { kind: 'support'; heightMm: Millimetres | null; attachments: AttachmentPoint[] }
  | { kind: 'reference_only' }
```

- `AssetRole` distinguishes **semantic role from shape**: `MarkingRole` (`give_way_line`, `stop_line`,
  `shoulder_boundary`, …), `SignRole`, `SignalRole`, `SupportRole`. RMS line J is `stop_line` in the
  STOP fixture and `shoulder_boundary` in the `MUTATION_STOP_LINE_AS_SHOULDER` mutation on purpose.
- `FaceProfile` (shape, size, front/up axes), `SignalHeadProfile` (ordered `SignalAspectSlot[]` with
  colour/shape), `MarkingProfile` (rows/width/gap/colour), `VehicleProfile`; every asset lists its
  `attachments: AttachmentPoint[]` in its own millimetre frame. `AnchorKind` = `lane_boundary |
  control_line | movement_path | crossing_bound | roadside_edge | support_base`.
- `AssetResolver { mode: 'development' | 'release'; registryHash; resolve(ref): AssetResolution;
  dependents(id); list() }`. `AssetResolution` is a discriminated union; in `release` mode anything
  not `releaseReady && contentApproved` fails with `not_release_ready` — the mode can never be widened
  by content.

## 7. World (`world.ts`)

```ts
interface World {
  id; schemaVersion; conventions: WorldConventions; controlRegime: ControlRegime;
  roads: Road[]; lanes: Lane[]; movements: Movement[]; anchors: Anchor[];
  markings: Marking[]; supports: Support[]; signFaces: SignFace[];
  signalHeads: SignalHead[]; signalControllers: SignalController[]; actors: Actor[];
  conditions: Conditions; depictedViolations: DepictedViolation[];
  evidence: EvidenceRequirement[]; cameraPresets: CameraPreset[]; provenance: WorldProvenance;
}
```

- `Lane` is **directed**: `directionRelativeToRoad: 'with_reference' | 'against_reference'`,
  `indexFromKerb` (0 = kerb side), `centreline: Vec3[]` in travel order, `widthM`, `heading`,
  `allowedVehicleClasses`, `outgoingMovementIds`. LEFT traffic: a with-reference lane's centreline
  lies to the right of the road reference (negative `t`); `fixtures.test.ts` asserts the sign.
- `Movement { fromLaneId, toLaneId, turn: MovementTurn, priority: MovementPriority, path }`.
- `Anchor` is a discriminated union on `kind: AnchorKind` with `roadId` and lane/side context;
  `AnchorOfKind<K>` narrows.
- `Support { id, asset, family, baseAnchorId, pose, heightM, dimensionsStatus: 'sourced' |
  'schematic_unsourced' }` and `Attachment { supportId, supportAttachmentName, partAttachmentName,
  heightAboveGroundM }`: every `SignFace`/`SignalHead` has an `attachment` and a world-space
  `frontNormal` + `intendedApproach` — faces are physical, never camera-facing.
- `SignalHead.aspects: SignalAspect[]` each with `movementIds`; `SignalController` holds
  `phases → AspectStateEntry[]` and `MovementPermission { movementId, permitted, governedByAspects }`.
  A circular green and a red right-arrow are separate aspects governing separate movements.
- `Actor` (ego/vehicle) with `pose`, `laneId`, `assetRef`; `DepictedViolation` makes a deliberately
  wrong scene explicit rather than implied.
- `EvidenceRequirement { targetEntityIds, requiredDetail, allowedViews, mustBeFrontFacing,
  maxOcclusionFraction, minProjectedSizePx, coVisibleWith, contextAnchorIds }` — bounding-box
  overlap alone never satisfies it.
- `CameraPreset` (`plan | study_oblique | approach_ego | entity_detail`) is **presentation**; it lives
  in the world for reproducibility but `stripPresentation(world)` must be identical before/after any
  camera change (`state_invariance`).
- `WorldProvenance { key: ReproducibilityKey, canonicalHash, status: FixtureStatus,
  usesQuarantinedAssets, notes }`.
- Worlds are `DeepReadonly` and frozen with `freezeDeep`; use `cloneMutable` to derive a variant
  (fixtures do this in `mutations.ts`). `canonicalJson` gives stable bytes for hashing.

## 8. Templates, content and learning ports

- `Template { id, version, name, roadClass, topology: JunctionTopology, controlRegime,
  parameters: TemplateParameter[], invariants: ValidatorName[], safeVariation, requiredAssets:
  AssetRef[], requiredEvidenceIds, answerEquivalence, fixtureWorldIds, reviewStatus }`;
  `Generator.generate(GenerationRequest) → GenerationResult`; `Rng` port (`createSeededRng(seed)` in
  scenario-core, deterministic).
- `Question { id, version, topicId, worldId, stem, stemBindings: TermBinding[], options: [Option × 4],
  requiredEvidenceIds, answerRule: { ruleId, version }, explanationId, sourceRefs: SourceLocator[],
  reviewStatus: 'development' | 'reviewed', authorship: 'original' }`; each `Option` carries its own
  bindings and correctness. `TermBinding` is `actual` (points at a real `entityId` + `evidenceIds`),
  `hypothetical` (must NOT exist in the world; optional `comparisonId`) or `glossary`.
  `ComparisonRequest` names an explicit delta (`replace_control`, `replay_action`,
  `swap_actor_class`, `change_signal_state`) against a base world.
- `Term`, `Rule` (predicates with official locators), `Explanation`, `Topic`, `ContentBundle`.
- `Clock { now(): EpochMs; timeZone }`, `Storage { get/set/delete/keys }` (async, string values),
  `RunState`, `AttemptState`, `PresentationState` (kept apart from attempt state), `Preferences`,
  `LearningEvent` (idempotent by `eventId`), `LearningSnapshot`, `LearningStore` (U2 implements).
  Lint bans `Math.random()`, `new Date()` and `Date.now()` everywhere — inject `Rng`/`Clock`.

## 9. Renderer / camera / SceneView ports (`scene.ts`)

```ts
interface RendererPort { load(world): Promise<void>; update(input: SceneInput, camera: CameraPreset): void; resize(viewport): void; dispose(): void }
interface CameraPort   { fit(input: SceneInput): ViewFit; evaluate(input, camera): EvidenceVisibility[] }
interface SceneView    { mount(container, input): Promise<void>; update(input): void; setPreset(name): void; onViewChange(cb): () => void; unmount(): void }
type SceneViewFactory = (o: { renderer: RendererPort; camera: CameraPort }) => SceneView
```

`SceneInput = { world, evidence, preset, viewport, preferences, highlightEntityId }`. UI code (U1/U3) only talks
to `SceneView`; R1 implements `RendererPort`, R2 implements `CameraPort` + `EvidenceVisibility`. The
renderer never decides priority, adds missing controls or rotates signs toward the camera.

## 10. Validation: what F0 does and does not check

- `Diagnostic { validator: ValidatorName, severity, code, message, entityIds, sourceRefs?, data? }`;
  `ValidationReport { diagnostics, ok, validatorsRun }`. **A report whose `validatorsRun` omits a
  required validator is not a pass** — consumers must check `missingValidators(report)`.
- `VALIDATOR_NAMES`: `source_applicability`, `lane_topology`, `marking_context`,
  `control_completeness`, `mount_integrity`, `approach_facing`, `signal_movements`,
  `question_evidence`, `camera_evidence` (R2), `state_invariance`, plus `structural_integrity`.
- F0 implements only `structural_integrity` (`checkWorldStructure`, `checkQuestionStructure`):
  IDs resolve, conventions match, movements reference lanes, attachments reference existing support
  points, evidence targets exist, `actual` bindings resolve, `hypothetical` bindings do not.
  Semantic validators are V1's job; `scenario-validation` exposes `SEMANTIC_VALIDATORS` (empty) and
  `REQUIRED_WORLD_VALIDATORS` so the review CLI prints "validators NOT run".
- `packages/contracts/src/fixtures/mutations.ts` is the test corpus V1 must make fail with the named
  validator (`INVALID_WORLD_MUTATIONS`, `QUESTION_MUTATIONS`): Give Way with one row / no control
  line, reversed or wrong-approach sign face, floating sign, invalid attachment point, hidden sign,
  STOP ego beyond line, J used as shoulder, misordered lenses, right turn permitted under red arrow,
  arrow controlling straight, head not linked to its stop line, dangling lane, evidence on missing
  entity, hypothetical binding pointing at a real entity, required evidence in no view.
  `PRESENTATION_ONLY_CAMERA_MOVE` must **not** change `stripPresentation(world)`.

## 11. Development fixtures (`@ottie/contracts/fixtures`)

| World ID | Regime | Notes |
| --- | --- | --- |
| `sg-give-way-t-001` | `give_way` | Minor road joins major road; D marking (2 rows, 100 mm, 1000/1000 mm, 150 mm row gap), Give Way face 600×600 on a schematic post |
| `sg-stop-access-001` | `stop` | Development access; J stop line (1 row, 300 mm) in `stop_line` role, STOP face 600×600 |
| `sg-signal-green-right-red-001` | `signalised` | Crossroads; north–south heads with red/amber/green + red right-arrow; circular green permits straight while the arrow prohibits right |

`DEVELOPMENT_WORLDS`, `DEVELOPMENT_ASSETS` (5 extracted quarantined assets + 4 explicitly schematic
`sg.dev.*` supports/vehicles), `FIXTURE_SOURCES` (TP handbook `4f2588…`, LTA TFM `8decfe…`, LTA RMS
`262ec3…`, Rule 11 locators), `DEVELOPMENT_CONTENT_BUNDLE` (terms, rules, explanations, comparisons,
`QUESTION_GIVE_WAY`, `QUESTION_STOP`, `QUESTION_RED_RIGHT_ARROW`), `DEVELOPMENT_TEMPLATES`,
`straightRoad()`/`turnPath()` helpers in `build.ts`.

Everything schematic (post/pole heights, vehicle sizes, 1 m setbacks, only N–S signal heads because
the extraction holds a single head reference, unknown mount/support in
`assets/sg/assemblies/assembly-definitions.json`) is stated in `provenance.notes` and printed by the
review CLI. The horizontal head artwork does not exist and is not invented.

## 12. Web shell and integration entrypoints

- `apps/web/src/main.tsx` → `App.tsx`: development banner (`__OTTIE_BUILD_MODE__`, defined in
  `apps/web/vite.config.ts` and `vitest.config.ts`), fixture picker, `SceneCanvas` (Three.js via
  `buildSchematicScene` + `presetToThreeCamera`), camera-preset buttons, `WorldSummary`,
  `ModuleStatusPanel`. Responsive CSS in `styles.css`; no router dependency.
- `apps/web/src/routes.tsx` — `FEATURE_ROUTES: FeatureRoute[]` (empty). U1/U3/I1 add one entry each
  pointing at a lazy import of `apps/web/src/features/<name>/index.tsx`; nothing else in the shell
  needs editing. New UI code lives under `apps/web/src/lesson/`, `apps/web/src/theme/`,
  `apps/web/src/glossary/` per the plan.
- Tests: co-locate `*.test.ts(x)` next to code — discovery is by glob, no registration needed.
  jsdom setup stubs `ResizeObserver`; WebGL is not available in tests, so keep Three.js behind ports.

## 13. Integration instructions for downstream jobs

1. `git checkout -b devin/$(date +%s)-ottie-<task> <F0 commit>`; `source ~/.nvm/nvm.sh && nvm use && npm ci`.
2. Import contracts only from `@ottie/contracts` / `@ottie/contracts/fixtures`; never re-declare types.
3. Implement inside your owned directory; update your `MODULE_STATUS`; add tests next to the code.
4. Run `npm run lint && npm run typecheck && npx vitest run <your path> && npm run build`.
5. If you need a new alias, dependency, root script or contract field, list it under
   "requested contract changes" in your report with the exact diff — do not edit root files.
6. Any content you produce keeps `releaseReady`/`contentApproved` exactly as the source metadata says.

## 14. Change policy

- Additive changes (new optional fields, new enum members with handling, new modules) bump
  `CONTRACT_VERSION` and this document in the same commit.
- Breaking changes (renames, removed fields, changed units/axes/traffic side, ID pattern changes)
  require an orchestrator decision before any code lands.
- `FROZEN_WORLD_CONVENTIONS`, ID brands, `VALIDATOR_NAMES` semantics and the actual/hypothetical
  binding split are considered frozen for the first slice.
