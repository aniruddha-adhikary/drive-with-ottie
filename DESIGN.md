# Drive with Ottie — Design Concept

ADHD-friendly prep for the Singapore Basic Theory Test (BTT). Ottie is an otter
who rides shotgun: never a nag, never a brake.

## 1. The two problems we are solving

| Problem | What it looks like | Design response |
|---|---|---|
| **Momentum killed by "5-minute" pacing** | User is hyperfocused ("let's go, let's go") and the app ends the lesson, shows a summary, and asks them to come back tomorrow. Energy evaporates. | Sessions have no fixed length. The unit of work is a *run*, and a run only ends when the user stops. Completion screens are 1-tap skippable and never a dead end. |
| **Falling behind → shame spiral → avoidance** | Missed days, broken streak, a red warning. User stops opening the app. | No punitive streaks. Progress is measured in *road covered*, which never goes backwards. Re-entry is one tap and starts with a guaranteed easy win. |

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

```
┌─────────────────────────────────┐
│  [Ottie waving in the car]      │   Ottie's pose reflects mood/state:
│                                 │   fresh, hyped, sleepy (late night),
│   ▓▓▓▓▓▓▓▓▓░░░░░░  62% of road  │   welcome-back (after a gap).
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

```
┌─────────────────────────────────┐
│  ✕     ━━━━━━━━━━━━━━━━░░░░  ⚡7 │   Top bar: exit, road progress (not
│                                 │   "3/10"), and combo counter.
│  ┌───────────────────────────┐  │
│  │   [SCENE]                 │  │   Rendered road scene. Signs, lights
│  │   Junction, your car in   │  │   and markings that the question
│  │   the left lane, a Give   │  │   depends on are drawn in the scene.
│  │   Way sign at the mouth,  │  │   Subtle animation (indicator blink,
│  │   a bus approaching from  │  │   traffic moving) so it feels alive.
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
- **Every question renders its scene.** If the question mentions a sign, light,
  marking, lane or vehicle, it is in the picture. Text-only questions are a
  content bug.
- **No timer by default.** Timed mode is opt-in (mock exam). Uxcel's "Time's
  up!" red bar is exactly what we avoid outside mock mode:
  https://mobbin.com/screens/f9c879ef-633e-4285-92c8-e530539e8563
- **Answer feedback is instant and inline** (Duolingo bottom sheet pattern), not
  a modal. Correct: green sheet, one-line "why", `Continue`. Wrong: amber (not
  red), the scene animates the *correct* action, one-line "why", `Got it`.
  Reference: https://mobbin.com/screens/dd4176cc-8b60-49d2-bfa6-7f5f659dd262
- **Combo counter (⚡7)**, not a score. It rewards the "let's go" state:
  consecutive correct answers heat up the scene (golden hour, Ottie leans
  forward, engine hum). Break the combo and it just resets to 0 — no loss
  animation.

Reference for image-led question layout: Nibble
https://mobbin.com/screens/b154590d-1c76-43e2-8526-ca68f700e290

### 3.3 Term Explainer — the dashed-underline sheet

Tap any dashed term → bottom sheet, question stays visible behind it.

```
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

- Explainers are **content, not help text**. Every term in the glossary has:
  canonical image (sign / light / marking), plain-English sentence, a
  ✓/✗ scene pair, confusables.
- The same glossary powers a browsable **Sign Book** (grid of all signs, tap
  for explainer) so the user can study signs directly.
- Reading an explainer mid-question is **never penalised**. We want them to tap.

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

```
┌─────────────────────────────────┐
│  [Ottie at a rest stop, coffee] │
│  Nice drive.                    │
│  47 questions · 89% · 31 min    │
│  +2.3 km of road                │
│                                 │
│  Terms you tapped: give way,    │   Feeds tomorrow's warm-up.
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

The app detects and adapts rather than asking.

**Hyped ("let's go")** — detected by answer speed + combo length.
- Question transitions speed up (shorter feedback dwell, auto-advance on
  correct after 800ms, tap to skip).
- Combo visuals intensify. Scene tempo increases.
- Milestones are drive-through only.
- Optional **"Long Haul" toggle** at run start: hides all progress numbers,
  shows only the road. For users who want to disappear into it.

**Behind / low** — detected by gap since last run, or low recent accuracy.
- Ottie's greeting acknowledges the gap in one line, then moves on
  ("Been a few days. Let's do an easy stretch."). No stats about what was missed.
- First 5 questions of the run are a **guaranteed warm-up**: previously-correct
  questions on tapped terms. Build a combo before anything hard.
- Progress framing is always positive-delta: "+0.8 km" never "-3 days".
- Wrong answers in this state get a slightly longer, gentler explainer with
  the ✓/✗ scene pair auto-expanded.

Reference for non-punitive pacing copy: Gentler Streak
https://mobbin.com/screens/597f67c9-a016-40a8-b3fd-2e0c6cd70bf9

## 5. Visual language — "there should be life in it"

- **Scene, not icon.** Every question is a 3D-ish isometric road scene
  rendered from a small set of composable parts (road segments, lanes,
  markings, signs, lights, vehicles, pedestrians, Ottie's car). This makes
  "render every sign in the question" feasible: content authors tag a question
  with `scene: {junction: T, signs: [give_way], lights: none, vehicles: [bus:right]}`
  and the renderer draws it.
- **Ambient motion.** Traffic light cycles, indicators blink, trees sway, other
  cars idle. Nothing loops faster than ~4s; nothing moves near the answer
  options.
- **Time of day follows the clock.** Study at 11pm and the road is at night
  with street lamps — and night-driving questions get weighted in.
- **Ottie is a co-pilot, not a coach.** Reacts (cheers, winces, yawns, eats a
  fish on milestones) but never instructs or scolds. Sits in the corner of the
  scene, not centre-stage.
- **Colour:** warm asphalt greys, sky gradients by time of day, Singapore sign
  palette used faithfully (red/white regulatory, blue mandatory, yellow/black
  warning) so sign recognition transfers to the real road. Feedback uses
  green/amber, never red outside mock-exam mode.
- **Type:** large, rounded, high x-height. Question text max ~3 lines; anything
  longer is a content bug and should be split or pushed into an explainer.

## 6. Content model (drives everything above)

```
Term        { id, name, category (sign|light|marking|rule|vehicle|place),
              image, plainMeaning, scenePairYes, scenePairNo, confusables[] }
Question    { id, topic, stem (with {{term_id}} markers), options[], answerIdx,
              whyOneLiner, scene: SceneSpec, difficulty }
SceneSpec   { roadType, lanes, markings[], signs[], lights[], vehicles[],
              egoLane, weather?, timeOfDay? (default: real clock) }
Topic       { id, name, orderOnRoad, questionIds[] }
```

`{{term_id}}` markers in the stem become dashed-underlined tap targets. The
question renderer refuses to ship a question whose scene lacks a sign/light
that its stem references (lint rule, fails CI).

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
