# Visual system proposal

14 September 2026 · Design research, not a running application.

## Recommended direction

**Plus Jakarta Sans + Sunny Cobalt.** Use one clear, friendly family for
questions and controls; put the excitement in strong colour blocks, Ottie's
illustrations and generous hierarchy. Preserve a quieter comparison:
**Nunito Sans + Soft Plum**. These are proposals for review, not tested learner
preferences.

| Role | Size / line height | Weight direction |
|---|---|---|
| Question | 24 / 32 | 700–800 |
| Explanation | 18 / 27 | 400–500 |
| Control | 16 / 24 | 600–700 |
| Metadata | 13 / 18 | 400–600 |

Values are initial CSS-pixel equivalents, scalable with device/user settings.
Use sentence case, complete wording and comfortable spacing. Metadata must
not carry the only copy of an essential rule. No compulsory three-line limit.
Do not describe either family as a medically validated “ADHD font.”

Sources: [Plus Jakarta Sans project](https://github.com/tokotype/PlusJakartaSans),
[specimen](https://fonts.google.com/specimen/Plus+Jakarta+Sans),
[Nunito Sans specimen](https://fonts.google.com/specimen/Nunito+Sans).
Both downloaded font families include SIL Open Font License notices; retain
the applicable notices when shipping font files.

## Brand palette

| Token | Value | Use |
|---|---|---|
| `brand.action` | `#285BE3` | Primary action, focus and selected state |
| `brand.sun` | `#FFD34E` | Personality, highlights and Ottie's car |
| `brand.mint` | `#CEF1EE` | Help and secondary surfaces |
| `surface.paper` | `#FFF9ED` | Warm background |
| `text.ink` | `#18344B` | Primary text |
| `text.muted` | `#42576A` | Secondary text |
| `surface.white` | `#FFFFFF` | Cards and text on cobalt |

Measured WCAG relative-luminance ratios for these flat colours:

| Foreground / background | Ratio |
|---|---:|
| Ink / paper | 12.27:1 |
| Muted / paper | 7.14:1 |
| White / cobalt | 5.68:1 |
| Ink / sun | 9.00:1 |
| Ink / mint | 10.69:1 |

The earlier coral `#EC714A` gives only 2.99:1 with white and 4.31:1
with ink. Exclude those pairings for normal text. Whole-interface contrast,
focus, non-colour cues, text scaling and touch target checks still need a
working prototype; palette arithmetic alone does not establish accessibility.
Reference: [WCAG contrast](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html).

Soft Plum alternative: plum `#563770`, peach `#FFD3C4`, mint `#D6EEE8`,
paper `#FFF8F4`, ink `#322139`. It needs its own complete contrast audit
before selection.

## Separate road-control materials

`roadControl.*` assets cannot inherit `brand.*` colours or fonts. Preserve
official face shape, lettering, backing, signal order and applicable paint
colour through theme changes. Screen RGB values and approximate concept
letterforms are not engineering colour specifications or final sign artwork.
Use the [source register](research/SINGAPORE-ROAD-CONTROLS.md) for asset work.

Keep three distinct layers:

1. **Physical road:** paint, poles, signs, heads, vehicles and their shadows.
2. **Teaching overlay:** labelled paths, explanations and optional replay.
   These must remain distinguishable from road paint.
3. **Interface:** camera controls, glossary sheets and answer controls.

Ottie's illustrative world can be richer than the instructional scene. Do not
use generated mascot artwork as a factual traffic diagram. While answering,
freeze all rule-bearing state. Allow quiet scenery and optional transition
motion, with reduced-motion support.

## Camera and explainer interaction

Start on the view that exposes the question's evidence. The default lesson
has one quiet `Enlarge` affordance, with an accessible 44 px minimum hit
area. It opens a scene viewer containing “Scene view,” “Top view” and an
approach/detail view as appropriate. Keep preset buttons, tilt/rotation
adjustments and reset inside that viewer. Do not require camera exploration
to discover an essential sign or signal.

A true plan view shows road markings well but collapses a vertical sign
face. Use an explicitly labelled inset linked to the same entity and signal
state. Preserve the sign's world orientation and the learner's answer.

Glossary help applies to unfamiliar words and phrases across stems and answer
choices. Use a plain meaning, source-backed face where one exists, road
context, and comparison when useful. Opening help preserves focus, scroll,
question and answer state.

Closing the scene viewer restores the selected option, reading position
and focus to its opener. It does not regenerate the scenario. Exit/settings
have distinct controls; tap/drag inside the viewer cannot submit an answer.

## Lesson composition

The v3 study reserves explicit space for the question and all four options:

| Region | Illustrated height at 390 × 844 |
|---|---:|
| System safe area and compact top navigation | 78 px |
| Scene, including linked signal close-up and Enlarge affordance | 212 px |
| Two-line question | 64 px |
| Choice instruction | 18 px |
| Four options, each including its radio and full text | 4 × 61 px |
| Gaps between options | 3 × 8 px |
| Primary action | 52 px |

The remaining height accommodates outer spacing and the bottom safe area.
These are design-study dimensions, not fixed runtime limits. Four short
options fit in this example; do not promise every question fits without
scrolling. Support 320 px widths and enlarged text with full wording and
normal vertical scrolling. Do not put answer choices in their own tiny
scroll container. A sticky action needs content padding and must remain
keyboard-accessible without obscuring an option.

The signalised example has a real extracted two-column signal face showing
circular green and red right arrow, mounted on a schematic pole and repeated
in a linked “Your signal” detail. Other visible approaches have their own
heads; cross traffic is red. Both representations of the learner's head use
the same image/state. The large detail makes the circular/arrow distinction
visible without adding another button. The physical sketch still needs the
production geometry, placement and readability checks in the scenario contract.

Use a blue selected state before grading. `Check answer` is the only
primary action, then becomes `Continue` after feedback. Terms in every
choice remain independently tappable; prevent their activation from
selecting or submitting a choice. Progress, preferences and scene controls
must not form extra permanent rows around the answer area.

## Review artifacts

The [three-page lesson and asset study v3](https://app.devin.ai/attachments/70d803cf-3b09-4299-aa3f-16f632e47b68/Ottie-Lesson-and-Assets-v3.pdf)
supersedes v2's lesson composition. It shows a complete 390 × 844 question
with four choices and the extracted Traffic Police signal face, an actual
source-to-vector Give Way comparison, and the extraction-to-scenario
verification plan. The layout was inspected as a static document; runtime
interaction, small-screen scrolling and learner readability remain untested.

The [six-page visual study v2](https://app.devin.ai/attachments/c8eb67ad-ffef-4e51-9c0e-35ce906faf16/Ottie-Visual-System-v2.pdf)
supersedes the earlier concept's single-row Give Way diagram. It demonstrates
type, colour, source-linked markings, mounted signs/signals and projection
choices. Its schematics are design studies rather than engineering drawings
or a working generator. The attachment requires Devin access.

Product research remains grounded in the Mobbin references in
[DESIGN.md](../DESIGN.md), plus
[minimal interruptions](https://www.w3.org/WAI/WCAG2/supplemental/patterns/o5p01-minimal-interruptions/),
[clear words](https://www.w3.org/WAI/WCAG2/supplemental/patterns/o3p01-clear-words/),
[unusual words](https://www.w3.org/WAI/WCAG22/Understanding/unusual-words.html)
and [animation from interactions](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html).
