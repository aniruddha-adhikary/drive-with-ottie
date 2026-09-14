# Starter assembly candidates (A2)

Development-only candidate assemblies for the first slice: a mounted Give Way face,
a mounted STOP face, and a vertical vehicle signal head showing circular green with a
red right-turn arrow. Everything here is quarantined: `releaseReady`, `contentApproved`
and `reuseApproved` are `false`, `licenseStatus` is `unreviewed`, and no file grants
source, content or reuse approval. These are references for downstream integration
and review, not runtime registry entries.

Nothing in `assets/`, `packages/` or `tools/` is modified by this directory. Cleaned
F0 faces and reference artwork are referenced by path and SHA-256, never copied or
regenerated. If original regeneration is ever needed, request an extraction-recipe
change instead of editing generated assets by hand.

## Layout

| Path                                                             | Purpose                                                                                                                                          |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `sources.json`                                                   | Source ledger: LTA SUP (SDRE rev I), TP handbook (2 Jan 2026), Rule 11 captured web text, LTA TFM. Hashes, scopes, locators and verified facts. |
| `supports/sup6-single-post.json`                                 | SUP6 single SHS 50x50x5 post, printed 2400 sign-bottom clearance (that sheet only).                                                              |
| `supports/sup5-holder-type-one.json`                             | SUP5 holder type 1 on lamp post / vertical support, 600-and-below variant, printed 2400 sign bottom (that elevation only), 60 standoff.          |
| `supports/sup7-holder-type-two-post.json`                        | SUP7 offset holder type 2 for 600x600 or 600x450 signs, 450 lateral offset; no installation height, so `schematic_unsourced`.                    |
| `supports/sup15-arterial-post.json`                              | SUP15 arterial SHS 75x75x3 post, area <= 1.1 m2, printed 2400 sign bottom (arterial elevation only).                                             |
| `assemblies/give-way-mounted.json`                               | `sg.mandatory.give-way` 600x600 face on the four supports; front `(0,-1,0)`, up `+Z`; governs one approach; linked RMS2 D give-way line.         |
| `assemblies/stop-mounted.json`                                   | `sg.mandatory.stop` 600x600 face on the four supports; linked RMS2 J stop line.                                                                  |
| `assemblies/signal-vertical-circular-green-right-arrow-red.json` | `sg.assemblies.signal-through-green-right-red` head: vertical R/A/G rows, circular + right-arrow columns, Rule 11 lens dimensions, no support.   |
| `check.js`                                                       | Candidate-local check (see below).                                                                                                               |

## Conventions

- World frame follows `FROZEN_WORLD_CONVENTIONS`: metres/radians at runtime, X east,
  Y north, Z up, LEFT traffic, heading 0 = +X counter-clockwise. Candidate files carry
  millimetres because the sources do; runtime conversion is the integrator's job.
- Every face and head is authored with `front = (0,-1,0)` and `up = (0,0,1)` in the
  asset frame and `mirrorAllowed: false`. `worldExamples` show how a pose yaw rotates
  `front` into a `frontNormal` that opposes the governed approach heading. Faces never
  turn to follow the camera.
- Attachment offsets are relative to the support `ground` attachment. `basis` is
  `sourced` (printed on the sheet), `derived` (arithmetic on printed values, e.g.
  sign bottom + half face height) or `partial` (some axes unknown).
- `dimensionsStatus` mirrors `Support.dimensionsStatus` in `@ottie/contracts`:
  `sourced` only when the attachment used by the face has a printed vertical position.

## Dimension boundaries that must not blur

- **2400 mm** appears on SUP5, SUP6 and SUP15 as ground-to-sign-bottom for the assembly
  drawn on that sheet. It is encoded per sheet and is not a universal mounting rule.
  SUP4 and SUP7 print no installation height.
- **2290 mm** (Rule 11) is the height of the centre of the lowest lens of a vertical
  signal head, 3000 mm where road gradient justifies it. It is not a pole height, a
  housing bottom or a bracket height. Effective lens diameter is at least 200 mm and
  adjacent lens centres are at most 500 mm apart; actual values stay `null`.
- No official signal support drawing exists in the reviewed collection. The signal
  candidate has an empty `compatibleSupports` and records F0's
  `sg.dev.signal-pole-schematic` as an explicitly schematic development fallback.

## Preserved source gaps

- **Green B placement**: TP page 47 (printed 46) draws the additional green to the
  reader's right of red; Rule 11 says a vertically arranged additional green sits to
  the left of or above red facing approaching traffic. Recorded as unresolved.
- **Horizontal heads**: Rule 11 gives horizontal ordering and 300 mm / 5200 mm
  figures, but no reviewed source contains horizontal artwork. None is invented; only
  the vertical arrangement is modelled.
- **Rule 11 capture**: the statute hash covers captured web text, not original HTML,
  direct retrieval returned HTTP 403, and the capture ends before the final green-arrow
  paragraph.

## Check

```sh
node content/assets/starter-assemblies/check.js
```

The check verifies, against `assets/sg/*/manifest.json` and
`assets/sg/assemblies/assembly-definitions.json`: source hashes, URLs, page counts and
revisions; referenced asset IDs, file SHA-256s, drawing numbers/revisions and pages;
unit and orthogonal front/up axes and world example rotations; support attachment
compatibility and 2400-derived heights; Rule 11 lens constraints, red/amber/green row
order and arrow alignment; that the Green B and horizontal gaps remain unresolved; and
that every candidate keeps its quarantine flags. It is not wired into `npm run check`
(root scripts are F0/I1-owned).
