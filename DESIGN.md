# Drive with Ottie — Design Concept

ADHD-friendly prep for the Singapore Basic Theory Test (BTT). Ottie is an otter
who rides shotgun: never a nag, never a brake.

**Design revision, 14 September 2026.** This repository is a specification;
the renderer and validators below are proposed, not implemented.
Start with [visual direction](docs/VISUAL-SYSTEM.md), the
[scenario generator contract](docs/SCENARIO-SYSTEM.md), and the
[official source register](docs/research/SINGAPORE-ROAD-CONTROLS.md).

## 1. The two problems we are solving

| Problem | What it looks like | Design response |
|---|---|---|
| **Momentum killed by "5-minute" pacing** | User is hyperfocused ("let's go, let's go") and the app ends the lesson, shows a summary, and asks them to come back tomorrow. Energy evaporates. | Sessions have no fixed length. The unit of work is a *run*, and a run only ends when the user stops. Completion screens are 1-tap skippable and never a dead end. |
| **Falling behind → shame spiral → avoidance** | Missed days, broken streak, a red warning. User stops opening the app. | No punitive streaks. Progress is measured in *road covered*, which never goes backwards. Resume in one tap, with an optional familiar starting point. |

A third, content-level problem: **the question text is opaque**. "Take the next
exit", "give way", "filter lane" mean nothing without a picture. Every domain
term is a tappable explainer with a visual (Duolingo-style dashed underline).

## 2. Core mental model: The Road Trip

The whole BTT syllabus is one long road, drawn as a stylised map. Each topic
(Traffic Signs, Traffic Lights, Road Markings, Expressway Rules, Parking, ...)
is a stretch of road. Each question answered correctly moves Ottie's car
forward. The map *is* the progress bar, the home screen, and the topic picker.

Why a road and not a Duolingo path of circles:

- It reads instantly. "How far am I?" is answered by a glance at the car.
- It never resets. Distance covered is permanent; missed days do not roll it back.
- It lets the visuals be alive: roadside scenery, weather, time of day, other
  cars, signs you have learned appearing on the actual road.
- It maps onto the domain: signs, lights and markings appear *on the road* where
  they would in real life, not as flashcards.

## 3. Screens

### 3.1 Home — "The Dashboard"

Single-purpose: get the user into a run in one tap.

```text
┌─────────────────────────────────┐
│  [Ottie waving in the car]      │   A welcoming pose; no inference of
│                                 │   the learner's emotional state.
│   ▓▓▓▓▓▓▓▓▓░░░░░░  62% of road  │   Road covered is permanent.
│   Traffic Signs → Road Markings │
│                                 │
│   ┌───────────────────────┐     │
│   │      ▶  DRIVE         │     │   Only one primary button. No menu of
│   └───────────────────────┘     │   modes to decide between.
│                                 │
│   Last run: 34 Qs · 91% · 22min │   Small, factual, no judgement.
│   "You're 12 Qs from finishing  │
│    Traffic Signs."              │   Always a concrete, near-term target.
└─────────────────────────────────┘
```

References:

- Finch home (mascot, warm, non-clinical): https://mobbin.com/screens/9c5434c3-6fa3-43bd-bcc2-c46c2e077e25
- Duolingo home, single primary action: https://mobbin.com/screens/3730667e-3607-419e-b2ca-873815f89de9
- Gentler Streak, non-punitive "no activity" treatment: https://mobbin.com/screens/597f67c9-a016-40a8-b3fd-2e0c6cd70bf9

Deliberately absent: a red streak counter, a daily-goal ring that can be
"failed", a notification badge count.

### 3.2 Run — the question screen

```text
┌─────────────────────────────────┐
│  ✕     ━━━━━━━━━━━━━━━━░░░░      │   Top bar: exit and optional road
│                                 │   progress; no combo to lose.
│  ┌───────────────────────────┐  │
│  │   [SCENE]                 │  │   Rendered road scene. Signs, lights
│  │   Junction, your car in   │  │   and markings that the question
│  │   the left lane, a Give   │  │   depends on are drawn in the scene.
│  │   Way sign at the mouth,  │  │   Relevant traffic state stays fixed
│  │   a bus approaching from  │  │   while the learner answers.
│  │   the right.              │  │
│  └───────────────────────────┘  │
│                                 │
│  You are approaching a          │
│  junction with a ˍˍˍˍˍˍˍˍˍ      │   Dashed-underlined terms are
│  give way sign. What must       │   tappable → explainer sheet (3.3).
│  you do?                        │
│                                 │
│  ○ Stop completely before the line          │
│  ○ Slow down and give way to traffic        │
│  ○ Proceed if your lane is clear            │
│  ○ Sound horn and proceed                   │
└─────────────────────────────────┘
```

Rules:

- **Every visual dependency is present.** Bind terms in stems and answer
  choices to the scene, a comparison scene, or a glossary asset as appropriate.
  A hypothetical distractor must not add a nonexistent control to the actual
  road. Use a relevant diagram or reference panel for non-road-layout topics.
  A missing required visual is a content bug.
- **No timer by default.** Timed mode is opt-in (mock exam). Uxcel's "Time's
  up!" red bar is exactly what we avoid outside mock mode:
  https://mobbin.com/screens/f9c879ef-633e-4285-92c8-e530539e8563
- **Answer feedback is instant and inline** (Duolingo bottom sheet pattern), not
  a modal. Correct: green sheet, one-line "why", `Continue`. Wrong: amber (not
  red), one-line "why", `Got it`, and an optional correct-action replay.
  Reference: https://mobbin.com/screens/dd4176cc-8b60-49d2-bfa6-7f5f659dd262
- **Momentum without a reset.** Keep the next action immediate and show
  accumulated progress. Mistakes do not remove a combo, scenery or progress.

Reference for image-led question layout: Nibble
https://mobbin.com/screens/b154590d-1c76-43e2-8526-ca68f700e290

### 3.3 Term Explainer — the dashed-underline sheet

Tap any dashed term → bottom sheet, question stays visible behind it.

```text
┌─────────────────────────────────┐
│  ──────                         │
│  GIVE WAY                       │
│  [ inverted red triangle sign ] │   1. The sign itself, large.
│                                 │
│  Let others go first. You don't │   2. One-sentence plain meaning.
│  have to stop if the road is    │
│  clear.                         │
│                                 │
│  ┌──────────┐  ┌──────────┐     │   3. Side-by-side mini scenes:
│  │ ✓ giving │  │ ✗ not    │     │      "this is giving way" vs
│  │   way    │  │  giving  │     │      "this is not". Arrows show
│  │ (waits)  │  │  way     │     │      who moves.
│  └──────────┘  └──────────┘     │
│                                 │
│  Often confused with: Stop sign │   4. Sibling terms as chips →
│  [STOP] [Junction] [Filter lane]│      tap to jump.
│                                 │
│  Seen 3× · Got it right 2×      │   5. Personal history, factual.
└─────────────────────────────────┘
```

- Explainers cover signs, signals, markings, layouts, rules, actions,
  unfamiliar phrases and vehicles, in stems and answer choices. Each has a
  plain meaning and relevant visual; add a comparison and confusables when
  useful. A phrase need not be represented by a sign that does not exist.
- The same glossary powers a browsable **Sign Book** (grid of all signs, tap
  for explainer) so the user can study signs directly.
- Reading an explainer mid-question is **never penalised**. We want them to tap.
- Preserve question, selected answer, focus and scroll position on return.
  A camera change or explainer never changes the frozen traffic state.

References:

- Duolingo dashed underline + hint: https://mobbin.com/screens/dd4176cc-8b60-49d2-bfa6-7f5f659dd262
- Duolingo explain-my-mistake sheet: https://mobbin.com/screens/26c5c998-56b0-410b-9f81-326fdb66dcaa
- Duolingo key-phrases panel with dashed terms: https://mobbin.com/screens/6b4f1767-dff4-44bd-9618-966b33563dc8
- Nibble annotated diagram explainer: https://mobbin.com/screens/573f7362-933a-4241-8c35-bb8451146864

### 3.4 Milestones — never a full stop

When a topic stretch is completed mid-run, we do **not** show a full-screen
"Lesson complete! Claim XP" (Duolingo/Mimo style,
https://mobbin.com/screens/31fdc425-1a41-4b78-b4e6-762bff0b9306,
https://mobbin.com/screens/b5772854-5c51-4fca-b828-0df669bfa4d4). That screen
is the "5-minute thing": it converts momentum into a decision point.

Instead: a **drive-through milestone**. The road scene itself changes — a
signpost "Leaving Traffic Signs · Entering Road Markings" slides past, Ottie
cheers for ~1.5s, a small toast shows the stretch stats, and the next question
is already loading. The user never lifts their thumb.

Full summary only appears when the user taps ✕ (see 3.5).

### 3.5 Rest Stop — the exit screen

Shown only when the user chooses to stop.

```text
┌─────────────────────────────────┐
│  [Ottie at a rest stop, coffee] │
│  Nice drive.                    │
│  47 questions · 89% · 31 min    │
│  +2.3 km of road                │
│                                 │
│  Terms you tapped: give way,    │   Available for optional review.
│  filter lane, box junction      │
│                                 │
│  ┌───────────────────────┐      │
│  │  Keep driving          │      │   Still the primary action.
│  └───────────────────────┘      │
│  Park for now                   │   Secondary, text button.
└─────────────────────────────────┘
```

No "come back tomorrow", no streak, no lock-in timer.

## 4. Two energy modes, one app

Support both states through learner control. Do not infer clinical or
emotional state from answer speed, accuracy, or time away.

**Keep going:** open-ended runs, immediate Continue, drive-through milestones,
and an optional Long Haul toggle that hides progress numbers. No forced
pause after five minutes or a fixed number of questions.

**Return gently:** Resume remains the primary action. Offer “Start with
something familiar” without requiring five warm-up questions or claiming a
guaranteed correct answer. Progress copy reports gains, never missed days.

Motion, sound, reminders and optional break prompts are learner-controlled.
Do not auto-advance an explanation before the learner finishes reading it.

Reference for non-punitive pacing copy: Gentler Streak
https://mobbin.com/screens/597f67c9-a016-40a8-b3fd-2e0c6cd70bf9

## 5. Visual language — "there should be life in it"

- **One semantic scene, useful views.** Compose reviewed roads, lane graphs,
  markings, mounted signs, signal assemblies and actors. Use plan view for
  road-surface evidence, oblique for relationships, and approach/detail for
  vertical faces. Camera changes preserve the same world state. Never turn
  a sign to face the camera.
- **Life around stable evidence.** Ottie's welcome, scenery and transitions
  can be expressive. Relevant signal aspects and vehicle positions remain
  fixed while answering. Explain movement through optional labelled replay;
  support reduced motion and keep animation away from answer controls.
- **Deliberate conditions.** Scenario time, weather and public-holiday status
  are explicit when rules depend on them. The user's clock cannot change a
  bus-lane answer or the evidence's visibility.
- **Ottie is a co-pilot, not a coach.** Reacts (cheers, winces, yawns, eats a
  fish on milestones) but never instructs or scolds. Sits in the corner of the
  scene, not centre-stage.
- **Colour:** proposed Sunny Cobalt brand palette, separate from official
  road-control materials. Road signs are source-specific; Singapore warning
  examples in the TP handbook use red-bordered triangles. Brand feedback
  does not recolour signs or signals.
- **Type:** proposed Plus Jakarta Sans; question 24/32, body 18/27, control
  16/24, metadata 13/18. Use plain, concise wording and scalable text; a
  three-line limit cannot override complete meaning or larger text settings.

## 6. Content model (drives everything above)

```text
Term        { id, name, category, plainMeaning, assetRefs[],
              examples[], confusables[], sourceRefs[], reviewStatus }
Question    { id, topic, stem, options[], answerIdx, whyOneLiner,
              termBindings[], scenarioRef, requiredEvidence[], difficulty,
              sourceRefs[], reviewStatus }
Scenario    { id, schemaVersion, templateRef, seed, jurisdiction, units,
              sourceProfile, roads[], junctions[], laneGraph, markings[],
              assemblies[], actors[], conditions, controlState,
              evidence[], cameraPresets[] }
Topic       { id, name, orderOnRoad, questionIds[] }
```

`{{term_id}}` markers work in stems and options. A term binding specifies
whether its visual is an actual scene entity, a hypothetical comparison, or
a glossary-only concept. Planned validators check existence, contextual
meaning, mounting, lane direction, signal state and visibility. See the
[scenario contract and acceptance fixtures](docs/SCENARIO-SYSTEM.md).

## 7. What we explicitly will not build (v1)

- Streaks, hearts, lives, energy, leagues, leaderboards.
- Push notifications beyond one optional self-scheduled reminder.
- Timed questions outside opt-in mock exam.
- A "lesson" abstraction with a fixed question count.
- A full-screen completion screen during a run.

## 8. Open questions for Ani

1. Platform: iOS-first native, or web/PWA? (Mobbin refs above are iOS.)
2. Source of BTT question bank and official sign artwork — do we have it, or
   do we author scenes from the Highway Code?
3. Mock exam mode: match the real BTT format exactly (50 Qs, 50 min, 45 to
   pass) as a separate entry point from Home?
4. Is Ottie already designed (art assets), or is character design part of this?
