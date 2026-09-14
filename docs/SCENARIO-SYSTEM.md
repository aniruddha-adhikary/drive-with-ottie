# Scenario generator and projection contract

Design proposal · 14 September 2026 · No production implementation exists.

## Outcome

Author a road situation once. Generate its geometry, mounted controls,
question evidence and every camera view from the same semantic world.
Correcting a canonical marking or assembly updates its dependent fixtures
through an explicit asset revision and re-review.

Keep [official road facts](research/SINGAPORE-ROAD-CONTROLS.md) separate from
[brand presentation](VISUAL-SYSTEM.md). The generator may compose reviewed
rules and assets; it must not invent traffic layouts or legal meaning.

## 1. Boundaries and rendering choice

```text
Source register → canonical assets + reviewed templates
                                  ↓
Authoring input → semantic validation → immutable generated world
                                              ↓
                                 geometry + camera selection
                                              ↓
                           evidence validation → reviewed export

Question attempt, selection and feedback are separate from camera/UI state.
```

**Recommendation for a web prototype:** use one Three.js world with
orthographic plan/oblique and constrained perspective approach cameras.
Use vector source artwork for sign faces and glossary panels, and ordinary
accessible interface elements for controls and text.

The independent architecture research considered SVG/2.5D first. SVG is
excellent for crisp diagrams and inspectable static output, but this user's
requirements already include changing viewpoints, upright mounts and
occlusion. Starting with one depth-aware world avoids implementing manual
face ordering and mounting projection twice. This is a design recommendation,
not a benchmark result or a final platform decision.

Primary references: Three.js
[OrthographicCamera](https://threejs.org/docs/pages/OrthographicCamera.html),
[PerspectiveCamera](https://threejs.org/docs/pages/PerspectiveCamera.html),
[Object3D](https://threejs.org/docs/pages/Object3D.html);
SVG [coordinate systems](https://www.w3.org/TR/SVG2/coords.html#ViewBoxAttribute).
Orthographic size does not vary with distance; perspective does. The
[Three.js SVGRenderer](https://threejs.org/docs/pages/SVGRenderer.html)
does not provide texture, advanced shading or shadow support.

Keep serialized content independent of Three.js, React, iOS or a particular
editor. A native product can implement a different rendering adapter without
changing legal facts, assets or question bindings.

## 2. Coordinates and geometry

- World convention: right-handed **X east, Y north, Z up**, metres and radians.
  Set the rendering adapter's up vector explicitly.
- A road frame uses `s` along its authored reference direction, `t` to the
  left of that direction, and `z` up. Curved frames map into world space.
- Every lane is directed. Reversing travel reverses its local left/right;
  Singapore `trafficSide: LEFT` determines placement relative to travel.
  Do not infer the lane's direction from where it appears on screen.
- Lane graph connections are legal/reviewed movements through a junction,
  with swept paths, conflict groups and priority relationships.
- Markings attach to lane boundaries, approach control lines, movement paths,
  crossing bounds or roadside edges. Shapes derive from these anchors.
- Vehicle position derives from lane ID, longitudinal progress and offset.
  Facing follows the lane/path tangent. Define “upstream of stop line” using
  the vehicle front, not its centre.
- Dimensions carry units, measurement endpoints and source locators.
  Convert SDRE millimetres to metres at import. Keep schematic layout choices
  explicit; a simplified teaching road is not a surveyed installation.

The visual study's illustrative road lengths, vehicle sizes and sign
letterforms do not establish production defaults. The verified D/E marking
measurements belong in their canonical geometry profiles.

## 3. Canonical data contract

The following is a field contract, not executable TypeScript or a completed
JSON Schema. Implement and version a machine-checkable schema first.

| Record | Required fields and responsibility |
|---|---|
| `SourceRef` | ID, exact URL, publisher, document edition, collection/drawing revision, printed/PDF page or section, publication/effective dates when known, retrieval date, file hash, verified facts, unresolved fields |
| `AssetDefinition` | Stable semantic ID, version, role, allowed contexts, geometry/material profile, designed orientation, front/up axes, attachment anchors, meaning-source refs, geometry-source refs, artwork provenance/reuse status, review status |
| `Template` | ID/version, road class/topology, allowed parameters, control regime, invariants, safe variation fields, required assets/evidence, answer-equivalence rules, reviewed fixture refs |
| `Scenario` | ID/schema/generator versions, seed, template ref/version, asset-registry hash, SG jurisdiction/LEFT traffic, units/source profile, roads, junctions, lane graph, markings, assemblies, actors, conditions, control state, evidence, camera presets |
| `Marking` | Entity ID, semantic role, geometry asset/version, anchor/path, applicable lanes/movements, source refs; never just `dashArray` |
| `Assembly` | Entity ID, face/head asset refs, support ID/family, transform, front normal, attachments, intended observer/approach, applicable lanes/movements and linked control lines |
| `SignalState` | Controller/phase-plan refs, current phase, state per aspect, controlled movements, protected/permissive priorities; no free-floating “junction colour” |
| `Actor` | Entity ID, vehicle/person category, lane/path, progress, dimensions, frozen pose, movement/intention and rule-relevant state |
| `EvidenceRequirement` | Target entity IDs, required detail, allowed views, front-facing/occlusion/size constraints, simultaneous co-visible groups and contextual anchors |
| `QuestionBinding` | Question ID, stem/option term bindings, actual/comparison/glossary role, required evidence IDs, answer rule/version, explanation refs |

Geometry profiles include named road materials independent of brand tokens.
Sign panels keep their backing and readable lettering; the designed
point-down Give Way symbol is not an upside-down asset. Disallow negative
scale/mirroring for canonical road controls. A right-arrow asset is not an
accidental reflection of a left-arrow texture.

Conditions include scenario date/time, timezone `Asia/Singapore`, weekday,
public-holiday status, weather/visibility, road category and vehicle class
when relevant. The device clock must never change the answer.

A source fact can be verified while an asset is still `draft`. Suggested
asset states are `draft`, `source_checked`, `content_reviewed`, `retired`.
A release export requires applicable content-reviewed assets and templates;
an internal preview can show drafts with explicit unresolved fields.

### Concrete authoring input

This is a proposed compact request to a reviewed template, not the complete
generated world or a claim that the named template already exists:

```json
{
  "id": "sg-give-way-t-001",
  "schemaVersion": 1,
  "templateRef": {"id": "sg.t_junction.give_way", "version": 1},
  "seed": "ottie-give-way-review-001",
  "sourceProfile": "sg-tp-2026-sdre-I",
  "parameters": {
    "minorApproach": "south",
    "egoMovement": "left",
    "majorRoadVehicle": {
      "category": "bus",
      "approach": "east",
      "movement": "straight"
    },
    "control": "give_way",
    "conditions": {"visibility": "clear", "surface": "dry"}
  },
  "questionBinding": {
    "questionId": "give-way-meaning-001",
    "requiredEvidence": [
      "minor.give_way_line",
      "minor.give_way_sign",
      "major.bus",
      "junction.priority_relationship"
    ]
  },
  "views": ["study_oblique", "plan", "approach_ego"]
}
```

The template supplies both inbound and outbound lanes, directed connections,
RMS2-D paired transverse rows, a correctly facing mounted sign, and the bus
in its westbound left-hand lane. It supplies no traffic lights because this
fixture is unsignalised. The source-backed explanation says to slow down,
stop if necessary and give way to major-road traffic.

The generator exports full world facts with stable entity IDs matching the
evidence bindings. No renderer decides priority or adds a missing sign.

## 4. Camera policy

| Preset | Evidence it should reveal | Constraints |
|---|---|---|
| `plan` | Lane membership, markings, crossings, movement paths, road layout | Orthographic top view; vertical faces have no readable area |
| `study_oblique` | Relationship between actors, surface controls, poles and junction | Orthographic, bounded azimuth/elevation; not automatically sufficient for sign text |
| `approach_ego` | Driver-facing signs, signal aspects and lane association | Perspective from a reviewed upstream eye position; preserve actual front/back orientation |
| `entity_detail` | Sign wording, bus board, signal lens/arrow distinction | Labelled inset or front-elevation detail of the same entity/asset and live frozen state |

Fit evidence bounds into the available scene region after safe areas and UI
occlusion. Default to a view that already exposes the required evidence.
When no single view meets all requirements, provide a labelled inset or
linked views automatically. Do not leave an essential cue hidden until the
learner happens to rotate the camera.

An entity detail is an explanatory panel, not a claim that its sign is
floating over the road. Link it to the world entity. If lane association is
part of the question, an isolated face close-up cannot satisfy that evidence
by itself.

Initially provide useful presets and bounded adjustments; unrestricted orbit
is unnecessary. A camera switch changes only presentation state. It must
not randomize vehicles, re-run the generator, cycle lights, restart replay,
submit an answer or lose glossary focus.

Visibility validation checks front normals, frustum, projected readable
area, occlusion and required co-visibility. Bounding-box intersection alone
is insufficient: a readable sign face can be hidden while its pole remains
visible. Required labels and paint must remain distinguishable at the
approved minimum viewport and text scale.

Start review at representative 320, 390 and 768 CSS-pixel widths, including
large text and reduced motion. These are proposed test cases, not an
established device-support policy. Approve legibility thresholds from actual
rendered reviews and learner testing rather than guessing legal dimensions.

## 5. Deterministic generation

1. Select a reviewed template and explicit parameters.
2. Resolve an applicable source profile, asset versions and geometry.
3. Validate topology, control regime, contexts and answer-bearing conditions.
4. Apply only declared safe variation with a pinned deterministic PRNG.
5. Produce an immutable world, stable IDs and provenance manifest.
6. Select views and validate visible evidence at each supported viewport.
7. Export JSON, semantic validation results and a labelled view contact sheet.

Reproducibility keys include generator version, seed, template version,
parameters and asset-registry hash. Stable serialized JSON can be compared
byte-for-byte with normalized key order. Render comparisons additionally pin
renderer/browser/font versions and use justified tolerances; GPU screenshots
are not promised to be universally pixel-identical.

Safe variety may include vegetation, non-control vehicle colour and reviewed
position ranges. It must not affect visibility, conflict timing or the
correct answer. Changes to vehicle class, turn direction, signal aspect,
weather, holiday status or a road marking require an explicit semantic
variant with its own constraints and answer validation.

Do not mirror entire scenes to make alternatives: this changes traffic
handedness and directional controls. Rotate a valid world through coordinate
transforms only when the template's invariants remain true.

## 6. Validators and intentional wrong actions

| Validator | Reject or flag |
|---|---|
| `source_applicability` | Unknown/draft release assets, wrong effective edition, unsupported dimensions, sign hours disagreeing with the policy |
| `lane_topology` | LEFT traffic violated unintentionally, disconnected movements, vehicle outside bound lane/path |
| `marking_context` | E used as a same-direction divider; B used as a centre line; D replaced by one row; crossing boundaries used as a stop line |
| `control_completeness` | Missing required line, sign, signal, stop/bay or reachable passage; signals in an unsignalised template |
| `mount_integrity` | Floating panel/head, missing support/anchor, bad attachment, mirrored or inverted artwork |
| `approach_facing` | Sign/head faces away from its intended observer, or its approach association is wrong |
| `signal_movements` | Aspect layout inconsistent with chosen assembly, arrow has no movement, B grants a car permission, unsupported phase/priority combination |
| `question_evidence` | Stem or option refers to an unbound visual; required actual entity absent; hypothetical distractor inserted into the real world |
| `camera_evidence` | Required face/marking occluded, unreadable, outside frame, or missing required simultaneous context |
| `state_invariance` | Camera/help/theme changes alter traffic, answer, attempt, seed or asset transforms |

Signal conflict checking must distinguish **protected** and **permissive**
movements. A permitted turn may still yield to oncoming traffic/pedestrians;
rejecting every pair of geometric conflicts would reject legitimate scenes.

Lessons can deliberately show an illegal action. Represent it as an explicit
`depictedViolation` linked to the actor, rule, explanation and evidence.
Validate the violation itself against the intended lesson. This cannot
bypass malformed geometry, missing sources, unreadable evidence or incorrect
signal assembly. Comparison/replay scenes share the same road context with
an explicitly authored action delta.

## 7. Starter fixtures and mutation checks

These are proposed fixtures, not already passing tests.

| Fixture | Main evidence | Deliberate failure / edge case |
|---|---|---|
| Give Way T junction | D, mounted face, major-road bus, left-hand lanes | Remove one row; reverse face; remove pole; hide sign; treat Give Way as unconditional stop |
| STOP development access | J, STOP and appropriate access geometry | Put vehicle front beyond line; apply COP Figure 5.30 offset to unrelated context |
| Two-way versus multilane road | E versus B; opposing versus same-direction traffic | Swap geometry/semantic IDs or reverse an actor |
| Expressway and signal approaches | B1 and C, corresponding road/control context | B1 on ordinary road; C without signal context |
| Single/double white comparison | F versus H and sightline | Use identical unconditional no-crossing answer for both |
| Signalised crossing | A4, upstream stop line, pedestrian and vehicle heads | Confuse crossing and Give Way; omit governing signal; hide crossing |
| Zebra approach | Zebra, K warning zigzags, crossing/about-to-cross actor | Overtake at crossing; unresolved colour variant blocks release |
| Direction and merge | Valid connections and distinct arrow assets | Impossible turn; assign permanent merge priority to one lane |
| Yellow box | Exit queue, N and turning context | Treat every waiting turn as an offence; paint guidance over N |
| Bus-lane access | L/Q, turning breaks, current schedule, vehicle class | Saturday/public-holiday mismatch; stale 20:00 sign; bus-only mapped to full-day |
| Bus priority and B signal | Separate stop/box/green-B variants | Add priority to ordinary stop; allow a car through on B |
| Roadside restrictions | G/I/O/P and marked side | Confuse parking with stopping or create restriction from black/white kerb |
| Junction guidance | A/A5/A9, paths and RMS14 constraints | Arbitrary dots; overlapping box/pocket; camera-dependent meaning |
| RAG assembly views | Vertical R/A/G; overhead G/A/R; right-arrow state | Reverse order; mirror horizontal head; main green overrides red right arrow |

Each mutation should fail a named validator for the intended reason.
Preserve JSON, seed, source IDs, full context images, camera/viewport and
validation results in the fixture export. A fix to a shared asset reruns its
dependent fixtures through reverse dependency lookup.

## 8. Independent implementation tracks

| Track | Deliverable | Dependency / acceptance |
|---|---|---|
| A. Typography and UI tokens | Font files/notices, contrast-tested tokens, scalable question/help layouts | Independent of world geometry; theme change leaves controls unchanged |
| B. Source and asset registry | D/E/B/J and initial sign/signal definitions with provenance | Independent research; unresolved fields visible; geometry reviewed against exact locators |
| C. Semantic core | Versioned schema, coordinate adapter, lane graph, deterministic templates and validators | Uses B's vocabulary; validates facts without rendering |
| D. Geometry and cameras | One world, plan/oblique/approach/detail, supports and evidence checks | Consumes C's contract; same entity IDs/state in every view |
| E. Question/explainer binding | Stems/options, actual/hypothetical bindings, help and selection persistence | Uses C; can develop against fixed fixture JSON |
| F. Review and authoring | Contact-sheet export, mutation harness, source/seed inspector, constrained editor | Contracts from B–E; release export blocked by unresolved errors |

Start with **Give Way + STOP + a signalised crossing** as the vertical slice,
so both signs and lights are exercised early. Then cover the remaining
fixtures before expanding the question bank. Build a template selector with
parameter fields and an error panel first; a freehand road editor is not
needed to validate this architecture.

The author sees allowed assets, applicable sources, generated views and
actionable validation errors. They edit facts and anchors, not per-camera
pixel positions. A scenario is reviewable only when its required evidence
is visible; geometry validity and visual comprehension are separate checks.

## Open implementation decisions

- Product platform remains undecided; the renderer recommendation targets a
  web prototype while the content contract remains portable.
- A content owner must resolve the recorded full-day bus-lane face discrepancy
  and crossing variant ambiguity before those assets ship.
- Exact housing/visor geometry, local mounting positions, turning envelopes
  and phase plans need template-specific sources and review.
- Learner testing must establish comfortable default views, text/face
  legibility and whether bounded camera controls are sufficient.
