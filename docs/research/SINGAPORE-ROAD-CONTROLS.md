# Singapore road-control source register

Checked 14 September 2026. This is the research baseline for
[scenario generation](../SCENARIO-SYSTEM.md). Official facts, design proposals
and unresolved details are distinguished below. A recognizable diagram does
not establish correct legal context or engineering dimensions.

## Source authority and versions

Use **Traffic Police's Basic Theory of Driving, updated 2 January 2026** for
learner-facing meanings, the applicable legislation for detailed obligations,
and **LTA SDRE April 2014 edition, collection Revision I, March 2026** for
engineering details. Individual drawings retain their own revision letters.

LTA has published **Revision J, September 2026**, but its publication page
explicitly says it takes effect **1 March 2027**. Record publication and
effective dates separately. Do not choose a collection solely because it has
the newest filename. The landing page says Revision I will be removed online
from that date; retain source hashes and a permitted local research archive.

SDRE general note 9 specifies **millimetres unless otherwise stated**. Convert
to the renderer's metres exactly once. The Code of Practice applies to its
stated development/submission contexts; a specific development-access offset
is not a universal rule for all junctions.

| Source key | Official source | Edition / useful locators |
|---|---|---|
| `TP26` | [Basic Theory of Driving][tp] | Updated 2.1.2026; printed p.1 / PDF p.2 gives date. Add 1 to printed pages to locate PDF pages |
| `SDRE-index` | [LTA publication page][index] | “Standard Details of Road Elements”; Revision I/J effective-date note |
| `SDRE-I` | [Collection contents][contents] | April 2014 edition, Revision I March 2026; general notes |
| `RMS` | [Chapter 8, road markings][rms] | `LTA/SDRE14/8/RMS1–14`; printed 8-n is PDF n+1 |
| `TMM` | [Chapter 9, traffic management][tmm] | `LTA/SDRE14/9/TMM4`, printed 9-4 / PDF p.5: crossing layouts |
| `SUP` | [Chapter 10, supports][sup] | `SUP4–7`, printed 10-4–7 / PDF pp.6–9: upright supports; `SUP8–13`: overhead families |
| `BUS` | [Chapter 11, bus shelters][bus] | `BUS5` rev D, printed 11-5 / PDF p.6: stop/panel/sign-plate relationships |
| `TFM` | [Chapter 15, mandatory sign faces][tfm] | `TFM1–2`, printed 15-1–2 / PDF pp.2–3 |
| `TFI` | [Chapter 18, informatory sign faces][tfi] | `TFI1` rev A, printed 18-1 / PDF p.3; bus-lane hours conflict recorded below |
| `KER` | [Chapter 3, kerbs][ker] | `KER2–3`, printed 3-2–3 / PDF pp.3–4 |
| `COP19` | [Street Work Proposals COP][cop] | Version 2.0, April 2019; pp.45–48, Tables 2.5–2.6; pp.178–179, Figure 5.30 |
| `RULE11` | [Traffic Signs Rules, rule 11][rule11] | “The 3-colour system”: ordering, approach facing, movement meaning and dimensions |
| `LTA-driving` | [OneMotoring driving rules][driving] | Priority Signs, RAG Traffic Signal aspects, Bus Lanes, Bus Priority Box |
| `LTA-bus` | [Bus priority schemes][priority] | “Bus Lanes”: current normal/full-day schedules and vehicle exceptions |

### Research file fingerprints

These identify the exact downloaded PDFs inspected in this revision.

```text
TP26: 4f258856a25b8d0a44e9091f361ce0a07e24138b9a8515620936d088d3c7cefa
RMS:  262ec3c439c8101945b7504e09e19c172485c5568cf7ba2f997fefa732d44059
TFI:  d442e677ba3596e487027ef9859c718e39dcc60fac0eff313c0bbf3662d870fd
```

## Marking vocabulary: verified distinctions

Application IDs below are proposed; SDRE drawing/type codes are official.
Geometry and legal meaning need separate fields even when they share a stroke.

| Proposed semantic ID | Official geometry reference | Meaning and required context |
|---|---|---|
| `centre.broken.two_way` | RMS2 rev B, type E | Opposing flows on a two-way carriageway; keep left. TP26 §53(a–b), p.37 |
| `lane.separator.ordinary` | RMS1 rev D, type B | Between lanes on ordinary roads/tunnels; not an opposing-flow centre line |
| `lane.separator.expressway` | RMS1, B1 | Expressway lane separation; not an arbitrary longer-dash variant for local roads |
| `lane.separator.signal_approach` | RMS1, C | Light-controlled intersection/approach; drawing generally specifies 7–10 markings |
| `centre.continuous.single` | RMS2, F | Two-way centre line; no parking on either side. TP26 §53(b) permits crossing a single continuous or broken line only when clear and safe; do not encode an unconditional no-crossing rule |
| `boundary.continuous.double` | RMS2, H | No crossing; context can be opposing flows or lane separation. TP26 §53(c), p.37 gives double-centre-line restrictions |
| `control.give_way` | RMS2, D | Two parallel broken white rows across approaching traffic; TP26 §52(a), p.35: give way to major-road traffic |
| `control.stop` | RMS2, J | Single transverse stop line. J also has a longitudinal shoulder-boundary use; semantic role and controlled approach disambiguate it |
| `edge.auxiliary` / `edge.speed_change` | RMS1, A / A2 | Auxiliary-lane/bay edges and expressway acceleration/deceleration boundaries; TP26 §53(h–i), p.38 |
| `guidance.turn` / `guidance.through` / `guidance.intersecting_through` | RMS1 A / A5 / A9; RMS14 rev B | Movement-specific junction guidance. A9 circular dots guide through movements intersecting A turning guidance |
| `arrow.direction` / `arrow.merge` | RMS4; RMS9 inset A | Reachable lane direction versus two lanes becoming one; TP26 §§56–57, p.43 |
| `box.yellow` | RMS2 N; RMS9 | Keep exit/obstruction facts explicit. TP26 §94, pp.54–55 contains turning exceptions; “any stopped vehicle in a box is wrong” is not a valid rule |
| `crossing.signalised.boundary` | RMS1 A4; TMM4 | Pedestrian crossing boundaries with pedestrian signals; distinguish from stop and Give Way lines. TP26 §§52(c), 55(d), pp.35, 42 |
| `crossing.zebra.approach` | RMS2 K; TMM4 | White zigzags warn of a zebra crossing and restrict behaviour. TP26 §§52(d), 55(a), pp.35, 42; colour-note ambiguity below |
| `bus_lane.normal` / `bus_lane.full_day` | RMS2 L / RMS3 Q; RMS10 layouts | Normal yellow boundary versus additional red line; explicit schedule and vehicle category, TP26 §54, p.40 |
| `bus_lane.turn_access` / `bus_lane.emergence_guidance` | RMS1 A1/A6 / A3/A7 | Broken normal/full-day segments have turning or side-road guidance roles |
| `parking.yellow.single` / `parking.yellow.double` | RMS2 G / I | No parking during specified hours versus at all times, on the marked side; distinguish immediate passenger pickup/set-down from parking |
| `parking.yellow_zigzag` / `stopping.yellow_double_zigzag` | RMS3 O / P | No parking versus no stopping. Retain traffic-condition exceptions; TP26 §53(d–g), p.38 |
| `kerb.black_white` | KER2–3 | Kerb treatment at specified locations; these drawings do not establish a standalone parking prohibition |

### Dimensioned starter primitives

Read widths, painted lengths, clear gaps and row spacing separately.
Dimensions below were checked against RMS1–2, not estimated from pixels.

| Primitive | Width | Painted length / clear gap | Other |
|---|---:|---:|---|
| E, broken centre | 150 mm | 2750 / 2750 mm | One longitudinal row |
| B, ordinary lane separator | 100 mm | 2000 / 4000 mm | One longitudinal row |
| B1, expressway lane separator | 100 mm | 2000 / 10000 mm | Expressway context |
| C, signal approach | 100 mm | 4000 / 2000 mm | Signal approach context |
| D, Give Way | **100 mm per row** | **1000 / 1000 mm** | **150 mm clear space between rows** |
| J, stop line | 300 mm | Continuous | Transverse role bound to controlled lanes |
| A4, signalised pedestrian boundary | 200 mm | 200 / 300 mm | Crossing context |

The D drawing's **150** annotation describes the clear inter-row space; its
**100** annotation describes line width. Do not swap these measurements.
Remaining outlines and dimensions require transcription and review before
they become release geometry. A source reference alone is not that review.

RMS14 notes 2–5 constrain junction guidance around crossing boundaries,
turning pockets, yellow boxes and vehicle swept paths. Lane-width measurements
use marking centres per RMS1 note 3. COP19's different road typologies are
not one universal lane width.

## Signs and supports: verified facts

- **Give Way:** TFM1 shows the deliberately point-down red triangle, upright
  “GIVE WAY” lettering and a square backing. STOP has its own octagonal face
  on backing. Both shown backing sizes are 600 × 600 mm. Preserve the
  lettering and backing in the selected asset variant.
- **Meaning:** TP26 p.10 distinguishes Stop before the line from Give Way:
  slow down, stop if necessary and yield to major-road traffic.
- **Direction matters:** TFM2's Keep Left, Keep Right and Pass Either Side
  are separate assets with corresponding usable routes. Never derive these
  through arbitrary mirroring.
- **Support families:** SUP5 shows attachment to lamp post/vertical support,
  with rear holder/bands. SUP6 distinguishes single/double posts. SUP7 includes
  wall mounting and true verticality. SUP8–13 document overhead families.
- **Scope dimensions:** SUP5's illustrated elevation has 2400 mm from ground
  to panel underside and face width no greater than 900 mm. SUP4 instead
  provides 500 mm minimum clearance for Keep Left/Right/Pass Either Side.
  Neither is a universal mounting height.

Proposed assembly IDs: `sign.give_way.roadside`, `sign.stop.roadside`,
`sign.keep_left.island`, `sign.bus_stop.identification`,
`sign.bus_lane.normal`, `sign.bus_lane.full_day`,
`control.bus_priority_exit`. Each needs an allowed support, approach,
applicable lanes, front normal, source-backed face and evidence requirement.
Site-specific setbacks and yaw/tilt remain authored and reviewed parameters.

### Four bus concepts that must remain distinct

| Concept | Evidence and association |
|---|---|
| Bus-stop identifier | TP26 p.21 and BUS5. Associate with a stop/bay. Passenger information panels and the address/number plate have distinct roles; BUS5 makes the latter face oncoming traffic |
| Bus-lane board | TFI1, TP26 pp.21, 40. Associate with a lane restriction and matching hours policy |
| Bus-lane paint | L/Q and their permitted broken transitions. Surface evidence, best seen in plan |
| Bus Priority Box | LTA-driving “Bus Priority Box”: advance Bus/triangle markings, Give Way lines, yellow box and a bus-stop exit; bind to a waiting/entering bus |

An ordinary bus stop does not automatically acquire a bus-priority signal or
box. Bus-only operation at all times is a separate category from full-day
bus lanes; its complete asset geometry remains outside the verified starter set.

## Traffic signals: verified facts

RULE11 requires the heads to face approaching traffic. Seen from that approach:

- Vertical three-aspect order: **red, amber, green**, top to bottom.
- Horizontal order: **green, amber, red**, left to right.
- In paired vertical RAG heads, arrows align with same-colour circular aspects.
  In paired horizontal heads, arrows sit below same-colour circular aspects.
- Other expressly permitted additional-arrow arrangements exist. Validators
  must check the selected assembly variant, not one universal silhouette.

TP26 pp.44–46 explains learner meanings and shows circular green coexisting
with right-turn green, amber or red. A red right arrow can coexist with
straight-ahead green. Attach aspects to movements; “junction is green” is
insufficient state.

The additional green **B** is for buses. RULE11 limits the described movement
to a bus in the innermost left lane, before the applicable lines, proceeding
straight with an unobstructed path despite the main red. Preserve applicable
arrow restrictions. It is not permission for an ordinary car.

RULE11's vertical lens diameter minimum is 200 mm; the lowest lens centre is
2290 mm above ground, with the stated gradient provision up to 3000 mm.
Horizontal lens diameter minimum is 300 mm; lowest lens centre is at least
5200 mm above the road. Adjacent lens centres are no more than 500 mm apart.
These are **lens** measurements, not housing dimensions or pole heights.

Proposed assemblies: `signal.vertical_rag`, `signal.overhead_rag`,
`signal.vertical_rag_right_arrow`, `signal.bus_B`. Unsignalised templates
must not acquire heads as decoration. Exact housings, visors, brackets,
head counts, siting and phase timings need further template-specific work.

## Source conflicts and release boundaries

1. **Full-day bus-lane hours:** TFI1 rev A still prints **07:30–20:00**.
   TP26 §54(b), p.40 says **07:30–23:00 Monday–Saturday**, except Sundays
   and public holidays; current LTA bus guidance agrees with the latter.
   Use current learner guidance for the rule model, record the conflict and
   leave the final face asset pending content review. Do not ship the
   contradictory older hours on a present-day sign.
2. **Zebra colour applicability:** TMM4 notes about white/yellow crossings
   need contextual interpretation against its zebra illustration and TP26.
   Do not use the note to recolour every zebra. Keep the affected geometry
   variant unresolved until reviewed.
3. **Crossing transition:** TP26 mentions a phase-out; no completion date
   was established. Distinguish current A4 and explicitly labelled legacy
   variants.
4. **Asset reuse:** the TP handbook includes a reproduction notice. Source
   pages are research references, not automatically licensed product assets.
   Keep artwork provenance and reuse status with the asset; obtain the
   appropriate permission or approved original artwork before distribution.

## Independent research record

Three independent sessions researched [markings][track-markings],
[signs/signals][track-signals] and [scenario/projection architecture][track-architecture].
Typography/colour was studied separately in the parent session.

This register is the reconciled result. Some track reports cited older
2022/2024 TP handbooks or 2024/2025 SDRE chapter URLs; those are superseded
here by the verified 2026 baseline. The proposed renderer choice is in the
scenario contract. Raw reports are evidence of research, not release approval.

[tp]: https://www.police.gov.sg/-/media/SPF/Advisories/TP/BT-ENG-2126.pdf
[index]: https://www.lta.gov.sg/content/ltagov/en/industry_innovations/industry_matters/development_construction_specifications_resources/Transport_Infrastructure_Design_Criteria_and_Specifications.html
[contents]: https://www.lta.gov.sg/content/dam/ltagov/industry_innovations/industry_matters/development_construction_resources/Street_Work_Proposals/Standards_and_Specifications/SDRE/Content_Page_March_2026.pdf
[rms]: https://www.lta.gov.sg/content/dam/ltagov/industry_innovations/industry_matters/development_construction_resources/Street_Work_Proposals/Standards_and_Specifications/SDRE/SDRE14-8_RMS_1-14_March_2026.pdf
[tmm]: https://www.lta.gov.sg/content/dam/ltagov/industry_innovations/industry_matters/development_construction_resources/Street_Work_Proposals/Standards_and_Specifications/SDRE/SDRE14-9_TMM_1-9_March_2026.pdf
[sup]: https://www.lta.gov.sg/content/dam/ltagov/industry_innovations/industry_matters/development_construction_resources/Street_Work_Proposals/Standards_and_Specifications/SDRE/SDRE14-10_SUP_1-15_March_2026.pdf
[bus]: https://www.lta.gov.sg/content/dam/ltagov/industry_innovations/industry_matters/development_construction_resources/Street_Work_Proposals/Standards_and_Specifications/SDRE/SDRE14-11_BUS_1-5_March_2026.pdf
[tfm]: https://www.lta.gov.sg/content/dam/ltagov/industry_innovations/industry_matters/development_construction_resources/Street_Work_Proposals/Standards_and_Specifications/SDRE/SDRE14-15_TFM_1-2_March_2026.pdf
[tfi]: https://www.lta.gov.sg/content/dam/ltagov/industry_innovations/industry_matters/development_construction_resources/Street_Work_Proposals/Standards_and_Specifications/SDRE/SDRE14-18_TFI_1-19_March_2026.pdf
[ker]: https://www.lta.gov.sg/content/dam/ltagov/industry_innovations/industry_matters/development_construction_resources/Street_Work_Proposals/Standards_and_Specifications/SDRE/SDRE14-3_KER_1-13_March_2026.pdf
[cop]: https://www.lta.gov.sg/content/dam/ltagov/industry_innovations/industry_matters/development_construction_resources/Street_Work_Proposals/codes_of_practice/RT-COP_V2.0_April_2019.pdf
[rule11]: https://sso.agc.gov.sg/SL/RTA1961-R33?ProvIds=pr11-&ViewType=Within
[driving]: https://onemotoring.lta.gov.sg/content/onemotoring/home/driving/road_safety_and_vehicle_rules/driving-rules.html
[priority]: https://www.lta.gov.sg/content/ltagov/en/who_we_are/our_work/public_transport_system/bus/bus_priority_schemes.html
[track-markings]: https://app.devin.ai/sessions/cf1d25c2f3904c3b89a31e366784e8de
[track-signals]: https://app.devin.ai/sessions/a2ffcf17353548e29a76466aa4c8c94a
[track-architecture]: https://app.devin.ai/sessions/6bb33d14a0264f03bdd8bfa0b2d53135
