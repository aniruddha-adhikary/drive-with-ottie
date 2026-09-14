# Starter scenario packages (T1)

Development only. Nothing in this directory is source-, content- or reuse-approved, and every
package must keep `"reviewStatus": "development"`. The packages consume A1/A2 asset candidates
(`content/assets/starter-*`) and A3 sources/terms/rules (`content/sources`, `content/terms/starter`,
`content/rules`) through the v1 contracts. Worlds are never hand-authored: each one is the output
of the shared generator (`createDevelopmentGenerator()` in `@ottie/scenario-core`) for the pinned
template, seed, source profile and asset-registry hash, and the recorded `canonicalHash` is the
generator's `world.provenance.canonicalHash`.

| File | Template | Worlds | Questions package |
| --- | --- | --- | --- |
| `give-way-t-junction.json` | `sg.t-junction.give-way@1` | 2 | `content/questions/starter/give-way-t-junction.questions.json` |
| `stop-development-access.json` | `sg.t-junction.stop@1` | 1 | `content/questions/starter/stop-development-access.questions.json` |
| `signalised-crossroads-green-right-red.json` | `sg.crossroads.signalised@1` | 2 | `content/questions/starter/signalised-crossroads-green-right-red.questions.json` |

## File shape: `ottie.starter-scenario-package/1`

Authoritative shape check: `tests/content/starter-packages.ts` (`parseScenarioPackage`, strict zod).
All keys are required; `strict()` rejects unknown keys.

```jsonc
{
  "$comment": string,
  "schema": "ottie.starter-scenario-package/1",
  "contractVersion": 1,                      // CONTRACT_VERSION
  "reviewStatus": "development",             // literal; no other value parses
  "id": string,                              // e.g. "starter.give-way-t-junction"
  "topicId": TopicId,
  "title": string,
  "summary": string,
  "template": { "id": TemplateId, "version": number },
  "pins": {
    "generatorVersion": 1,                   // GENERATOR_VERSION
    "worldSchemaVersion": 1,                 // WORLD_SCHEMA_VERSION
    "sourceProfileId": "sg-sources-2026-09", // FIXTURE_SOURCE_PROFILE_ID
    "assetRegistryHash": Sha256              // DEVELOPMENT_ASSET_REGISTRY_HASH
  },
  "worlds": [{
    "worldId": WorldId,                      // explicit; becomes GenerationRequest.id
    "label": string,
    "seed": Seed,                            // stable per world; never shared between worlds
    "parameters": Record<string, string | number | boolean>, // template parameter ids
    "views": ("plan" | "study_oblique" | "approach_ego" | "entity_detail")[],
    "canonicalHash": Sha256,                 // generator provenance hash, asserted by tests
    "entities": Record<string, EntityId>,    // stable role -> generated entity id (ego, lanes, movements, controls, actors)
    "evidenceIds": string[],                 // every evidence id the world emits that questions may require
    "notes": string[]
  }],
  "assetCandidates": [{
    "entityKey": string,                     // key into worlds[].entities
    "runtimeAssetId": string,                // id in the development asset registry
    "a1CandidateId": string | null,          // A1 candidate_id (faces/markings)
    "a2AssemblyId": string | null,           // A2 assembly id (supports/heads)
    "a1CandidateFile": string | null,
    "a2AssemblyFile": string | null,
    "sourceDimensionsMm": Record<string, number>, // copied verbatim from A1/A2 (mm)
    "sourceLocator": SourceLocator,          // original PDF locator (page/drawing/bbox)
    "unknowns": string[],                    // A1/A2 unknowns preserved, never resolved here
    "worldDimensionsStatus": string | null
  }],
  "comparisons": [{                          // v1 ComparisonRequest + generation info
    "id": string,
    "baseWorldId": WorldId,
    "kind": "replace_control" | "replay_action" | "swap_actor_class" | "change_signal_state",
    "delta": Record<string, unknown>,        // explicit, separate from the base world parameters
    "label": string,
    "explanationId": ExplanationId | null,
    "generation": null | {                   // present only when the comparison is itself a valid template configuration
      "worldId": WorldId, "seed": Seed, "parameters": {...}, "canonicalHash": Sha256
    },
    "generationNote": string | null          // why regeneration is not possible (different layout / unsupported phase)
  }],
  "exclusions": string[],                    // e.g. crossings not placed until separately sourced
  "sourceRefs": SourceLocator[],
  "unresolved": string[]                     // preserved source gaps; not blockers
}
```

Mapping to the v1 `GenerationRequest` (see `generationRequest()` in the test helper):

```ts
{
  id: world.worldId,
  schemaVersion: pins.worldSchemaVersion,
  templateRef: pkg.template,
  seed: world.seed,
  sourceProfileId: pins.sourceProfileId,
  parameters: world.parameters,
  contentBundle: null,          // I1 supplies the runtime ContentBundleRef
  views: world.views,
}
```

## Comparison / base separation

Comparison deltas live only under `comparisons[]`; base worlds never embed them. Regenerable
comparisons (`generation !== null`) use a distinct world id and produce a distinct
`canonicalHash` from their base. Declarative comparisons (`generation: null`) are for
`replace_control` deltas that cross templates (Give Way <-> STOP) or for the
`nsCircular=green, nsRightArrow=green` phase, which the current signal template reports as
`signal_movements.unsupported_phase_combination`; applying them is the comparison-applier's
responsibility (I1/renderer), not a T1 regeneration.

## Validation

`tests/content/starter-scenarios.test.ts` regenerates every authored world and regenerable
comparison, checks pins/provenance/hashes/immutability, and runs V1 `validateWorld` twice: with the
development context and with a compiled registry context (`compileRegistry` over the extracted
development assets, sources = registry sources + A3 starter sources). It also preserves the
rejection diagnostics for invalid variations (`generator.parameter_incompatible`,
`generator.parameter_not_allowed`, the known left-turn/far-side
`question_evidence.priority_evidence_without_conflict`, and the unsupported signal phase).

## Handoff to I1 (shared runtime boundary)

T1 does not touch runtime loaders or registry wiring. I1 still needs to provide:

1. **Runtime loader** for these two schemas. The zod schemas in `tests/content/starter-packages.ts`
   are the reference; move them (not fork them) next to the runtime content loader
   (e.g. alongside `packages/scenario-validation/src/content-data.ts`).
2. **ContentBundleRef**: `generationRequest()` emits `contentBundle: null`. I1 decides bundle
   id/hash policy; generating a bundle is not implied or approved by these packages.
3. **Registry**: `pins.assetRegistryHash` must equal the runtime registry hash; a mismatch must
   fail loading rather than silently regenerate.
4. **Comparison applier** for declarative `replace_control` deltas (`replaceMarking`,
   `replaceSignFace`) and the unsupported green/green signal phase.
5. **Question routing**: `content/questions/starter/*.questions.json` reference `worldId`s from
   these packages only; see that directory's README.

Remaining source gaps carried in `unresolved[]` (major-road definition, Give Way sign/marking
pairing, schematic supports and setbacks, horizontal signal artwork, Green B placement) stay
unresolved; do not invent values for them.
