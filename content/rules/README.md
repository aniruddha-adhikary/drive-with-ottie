# Starter rules (A3)

`starter-rules.json` holds `Rule` records (shape: `Rule` in
`packages/contracts/src/content.ts`, contract version 1). Import through the
F0 alias, e.g. `import rules from '@ottie/content/rules/starter-rules.json'`,
and validate/brand at the boundary with `ruleId()` / `sourceId()`.

Every rule is **development** content. Each `sourceRefs` entry carries an exact
locator (PDF page + printed page, or Rule 11 paragraph subject + verbatim
quote). Anything a source does not settle is listed in `unresolved`, never
resolved in the predicate.

## Predicate grammar

Predicates are plain strings for V1's semantic validators and for review; they
are not executed here. Vocabulary is shared with the F0 fixture rules:

| Symbol | Meaning |
| --- | --- |
| `ego` | the learner's vehicle |
| `control(ego.lane)` | the control at the end of ego's lane: `give_way_sign`, `give_way_line`, `stop_sign`, `stop_line`, `signal`, `none` |
| `movement` | the `Movement` ego intends (`through`, `turn_left`, `turn_right`, `u_turn`) |
| `aspect(shape, colour)` | a signal aspect on the head that faces ego's approach; `shape ∈ {circular, arrow_left, arrow_right, arrow_up, letter_B}` |
| `aspect.lit`, `aspect.flashing` | aspect state |
| `aspect.controls(movement)` | the arrow's direction is `movement` |
| `permission(movement)` | result: `proceed`, `proceed_if_clear`, `stop`, `stop_then_proceed_with_caution`, `slow_stop_if_necessary` |
| `priority(a, b)` | vehicle `a` must give way to vehicle `b` |
| `⇒`, `AND`, `OR`, `NOT`, `¬∃` | logic |

Rules for the same situation are ordered: a rule whose `predicate` says
`overrides(<ruleId>)` takes precedence over that rule when both match. The only
override in the starter set is `red-arrow-prohibits-movement` over
`circular-green-permits-uncontrolled-movements`; circular green never
overrides a lit red arrow.
