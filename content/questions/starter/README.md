# Starter question packages (T1)

Development only, unreviewed, `authorship: "original"`. Each package binds to exactly one scenario
package in `content/scenarios/starter/` and only names `worldId`s that package authors. Every
question has exactly four options and exactly one correct option, is answered by an A3 rule at its
current version, and cites official source locators (A3 `content/sources`). Nothing is copied from
the Traffic Police handbook question bank.

| File | Scenario package | Questions | Answer rules |
| --- | --- | --- | --- |
| `give-way-t-junction.questions.json` | `starter.give-way-t-junction` | 2 | `give-way-at-double-broken-line@2` |
| `stop-development-access.questions.json` | `starter.stop-development-access` | 2 | `stop-before-stop-line@2` |
| `signalised-crossroads-green-right-red.questions.json` | `starter.signalised-crossroads-green-right-red` | 2 | `red-arrow-prohibits-movement@2`, `circular-green-permits-uncontrolled-movements@1` |

## File shape: `ottie.starter-question-package/1`

Authoritative shape check: `tests/content/starter-packages.ts` (`parseQuestionPackage`, strict zod).
`questions[]` items parse directly to the v1 `Question` contract; `explanations[]` items parse to
the v1 `Explanation` contract.

```jsonc
{
  "$comment": string,
  "schema": "ottie.starter-question-package/1",
  "contractVersion": 1,
  "reviewStatus": "development",
  "id": string,                               // "<scenarioPackageId>.questions"
  "scenarioPackageId": string,                // must equal the scenario package id
  "topicId": TopicId,                         // must equal the scenario package topicId
  "explanations": Explanation[],              // { id, ruleIds, paragraphs, termIds, sourceRefs }
  "questions": Question[]                     // v1 Question, see below
}
```

`Question` (v1):

```jsonc
{
  "id": QuestionId,                           // "starter.<situation>.q<n>.<slug>", unique across packages
  "version": 1,
  "topicId": TopicId,
  "worldId": WorldId,                         // an authored world of the scenario package
  "stem": string,
  "stemBindings": TermBinding[],              // at least one binding carries a canonical A3 termId
  "options": [Option, Option, Option, Option],// ids unique within the question; exactly one "correct": true
  "requiredEvidenceIds": string[],            // subset of the world's evidenceIds (scenario package worlds[].evidenceIds)
  "answerRule": { "ruleId": RuleId, "version": number }, // A3 rule at its current version
  "explanationId": ExplanationId,             // in this package's explanations[]
  "sourceRefs": SourceLocator[],
  "reviewStatus": "development",
  "authorship": "original"
}
```

`Option`: `{ id, text, bindings: TermBinding[], correct: boolean, rationaleExplanationId }`; every
option carries at least one binding with a canonical `termId`.

`TermBinding` anchors to copy by its `text` span, which must literally occur in the stem/option:

- `actual` — `{ role, text, termId | null, entityId, evidenceIds }`; the entity exists in the
  generated world and is exported under `worlds[].entities`; each evidence id targets the entity
  or its lane/movement. Only actual bindings appear on correct options.
- `hypothetical` — `{ role, text, termId | null, comparisonId | null }`; used only on wrong
  options; names a control/state absent from the base world (V1 rejects a hypothetical whose asset
  is placed). When `comparisonId` is set it is a comparison authored in the same scenario package.
- `glossary` — `{ role, text, termId }`; canonical A3 term with no world entity.

## Validation

`tests/content/starter-questions.test.ts` regenerates each world and checks: package/scenario
binding and coverage; unique ids and no collision with the F0 fixture bundle; rule/version,
explanation, term and source resolution; four options / one correct; correct options carry no
hypothetical; answer rule matches the world's control regime; evidence ids resolve to the world;
binding anchoring; traffic-side ("from your left/right", "oncoming") and signal-aspect consistency
against actual lane geometry/aspects; V1 `validateQuestion` for every question; and that a
world-id mismatch and a two-correct-option copy are still rejected
(`question_evidence.correct_option_count`).

## Handoff to I1

- The package loader/registry for these files is I1's (see `content/scenarios/starter/README.md`);
  reuse the zod schemas in `tests/content/starter-packages.ts`.
- `Question.worldId` resolves through the scenario package, so the runtime must load scenario
  packages first (or index worlds by id) before questions.
- Explanations reference `ruleIds`, `termIds` and `sourceRefs` that must resolve against the same
  A3 starter content the validator uses (`loadStarterContent()`).
- Review status promotion (`development` -> `reviewed`) is not a T1 or I1 action; it requires
  the separate content review.
