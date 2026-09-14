# Drive with Ottie

Mobile-first (PWA-ready) prep app for the Singapore Basic Theory Test. See `DESIGN.md` for the concept.

## Develop

```sh
npm install
npm run dev          # http://localhost:5173 — open with a mobile viewport
npm run check        # oxlint + content lint + tsc + vite build
```

`npm run lint:content` verifies every `{{term}}` in a question stem has a matching sign / light / marking / vehicle in that question's `scene`, so nothing the question talks about is missing from the picture.

## Layout

- `src/content/` — `Term`, `Question`, `SceneSpec` types, seed questions (LTA Highway Code based, provisional) and glossary terms
- `src/scene/` — SVG scene renderer: perspective road, markings, signs, traffic lights, vehicles, weather, time of day
- `src/engine/run.ts` — question picking, warm-up on return, energy modes, mock paper
- `src/state/progress.ts` — `localStorage` progress (road km, per-question / per-term stats, runs)
- `src/screens/` — Home, Run, Rest Stop, Sign Book, Mock Exam, Scene Gallery (visual QA of all scenes)

Requires Node 20.19+ or 22.12+ (Vite 8).
