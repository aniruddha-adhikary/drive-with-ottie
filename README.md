# Drive with Ottie

Design documents for an ADHD-friendly Singapore Basic Theory Test study app,
plus a source-backed Singapore road-control asset reference library. The revised
[lesson composition](docs/VISUAL-SYSTEM.md#lesson-composition) gives four answers
space beside the traffic scene; [the scenario contract](docs/SCENARIO-SYSTEM.md)
explains how reviewed assets become reusable scenes.

## App (mobile-first web / PWA)

```sh
npm install
npm run dev          # http://localhost:5173 — open with a mobile viewport
npm run check        # oxlint + content lint + tsc + vite build
```

`npm run lint:content` verifies every `{{term}}` in a question stem has a matching
sign / light / marking / vehicle in that question's `scene`.

- `src/content/` — `Term`, `Question`, `SceneSpec` types, provisional seed questions and glossary
- `src/scene/` — SVG scene renderer: perspective road, markings, signs, lights, vehicles, weather, time of day
- `src/engine/run.ts` — question picking, warm-up on return, energy modes, mock paper
- `src/state/progress.ts` — `localStorage` progress (road km, per-question / per-term stats, runs)
- `src/screens/` — Home, Run, Rest Stop, Sign Book, Mock Exam, Scene Gallery (visual QA of all scenes)

Requires Node 20.19+ or 22.12+ (Vite 8).

See the [execution plan and agent dependency diagrams](docs/EXECUTION-PLAN.md)
for the first working slice, parallel module ownership, content expansion and
integration gates.

## Singapore asset library

**339 semantic assets across six families; 0 approved for release.**
The extraction integrations pass validation, but the library is **not complete**
and is not a production artwork or current traffic-rule authority.
Engineering annotations, placeholders and disputed historical wording remain
visible in reference crops.

The generated [root index](assets/sg/index.json) links every asset to its family
manifest, source locator, files and SHA-256 hashes. Each family manifest preserves
its original source evidence, measurements, warnings and full page ledger.
The index marks every non-release asset `quarantined: true`; consumers must filter
on `release_ready`, rather than assuming an SVG or `verified_geometry` is approved.
Quarantine preserves the producer artwork and status rather than silently editing
or deleting source evidence.

| Family | Assets | Source reference | Cleaned vector | Parametric geometry | Review statuses |
|---|---:|---:|---:|---:|---|
| [Mandatory](tools/asset_extraction/mandatory/README.md) | 12 | 0 | 12 | 0 | 12 cleaned_unverified |
| [Prohibitory](tools/asset_extraction/prohibitory/README.md) | 33 | 33 | 0 | 0 | 33 extracted_reference |
| [Warning](tools/asset_extraction/warning/README.md) | 56 | 56 | 0 | 0 | 56 extracted_reference |
| [Informatory](tools/asset_extraction/informatory/README.md) | 89 | 89 | 0 | 0 | 88 extracted_reference; 1 blocked |
| [Markings](tools/asset_extraction/markings/README.md) | 80 | 37 | 19 | 24 | 37 extracted_reference; 19 cleaned_unverified; 24 verified_geometry |
| [Assemblies](tools/asset_extraction/assemblies/README.md) | 69 | 69 | 0 | 0 | 69 extracted_reference |
| **Total** | **339** | **284** | **31** | **24** | **283 extracted_reference; 31 cleaned_unverified; 24 verified_geometry; 1 blocked** |

These are semantic records, not interchangeable sign silhouettes: the count
includes supplementary panels, layouts, engineering details, signal illustrations
and explicitly evidenced size variants. Files total **339 PNG references,
223 source-reference SVGs, 36 renderer SVGs and 24 geometry JSON files** (622).
Markings' 24 parametric records also retain source references. All records have
`license_status: unreviewed` and `release_ready: false`.

## Source provenance and coverage

The ten unique official PDFs contain **183 pages**. Six family ledgers account
for **668 PDF-page records**, including repeated contents/handbook pages;
this is not 668 unique pages. The extra assembly BUS10 row is a missing-document
deferral, and its Rule 11 row records cited web text, not a PDF page.
All ten PDF byte hashes were rechecked against freshly downloaded originals on
2026-09-14. The full URLs and hashes are in the index and family manifests.
The LTA collection is SDRE Revision I, March 2026; individual drawing revisions
are separately recorded and must not be replaced by the collection revision.

| Official source | Unique pages | SHA-256 |
|---|---:|---|
| LTA TFM1–2 | 3 | `8decfe2306c6fb1b738c82a82bc4d657ef6a8a16ba4a0a342522126fd0113af1` |
| LTA TFP1–6 | 7 | `73a6364958c1717254fd19e321a1f9d776fd66eea7ec144ce418641933f4f85a` |
| LTA TFW1–9 | 10 | `d90abfac839030bbe802a5ac1a0d9ff3390a4f40a1b32ed0e26b4cf3b500a1d3` |
| LTA TFI1–19 | 21 | `d442e677ba3596e487027ef9859c718e39dcc60fac0eff313c0bbf3662d870fd` |
| LTA TFS1–2 | 3 | `d07fb4f6731c10a30024eaf15481c66adf36e89beff1e8de4359c3cd0ff65a2b` |
| LTA RMS1–14 | 15 | `262ec3c439c8101945b7504e09e19c172485c5568cf7ba2f997fefa732d44059` |
| LTA SUP1–15 | 17 | `515db158a9c9f3f744aae8a54a05f8fbc0f97a3f08959dcdd5117f8ce745fda6` |
| LTA BUS1–9 (URL retains 1–5) | 10 | `fa22937c09e0d974466cc4372d9542862d5494e06e1abee065f74100e7076029` |
| LTA contents | 7 | `90ceee831a33fd99bdf00cc2f6d20603382fc69e10d1ea1ea3a82db4c9b6ea42` |
| Traffic Police BTT handbook 2026 | 90 | `4f258856a25b8d0a44e9091f361ce0a07e24138b9a8515620936d088d3c7cefa` |

The Rule 11 snapshot hash is
`c0ec46b7d0a405fa076383364a7e1e2028a44a300b7cfd57dc0d74564c895f05`.
It identifies the producer's stored, explicitly incomplete official web-tool text
capture, **not original HTML** or a newly downloaded document. Direct HTTP
retrieval returned 403 for the producer; this integration verifies only the stored
snapshot hash and preserves that limitation.

| Family ledger | PDF pages | Extracted | Reference only | Not applicable | Deferred |
|---|---:|---:|---:|---:|---:|
| Mandatory | 100 | 2 | 9 | 89 | 0 |
| Prohibitory | 104 | 6 | 6 | 92 | 0 |
| Warning | 107 | 0 | 9 | 98 | 0 |
| Informatory | 121 | 0 | 31 | 90 | 0 |
| Markings | 112 | 7 | 19 | 82 | 4 |
| Assemblies | 124 | 0 | 24 | 101 | 1 |

Assembly status columns include the two non-PDF rows, so they sum to 126.
Page status words preserve each producer's meaning: `reference_only` can own
extracted reference artwork, and `extracted` does not promise all possible variants.
No family extraction failed during integration. Deferred scope remains explicit
per page and in the limitations below.

## Reproduce and validate

Run from the repository root with Python 3.10+. Keep original PDFs and review
artifacts outside Git. Each extractor overwrites its own generated outputs;
review your changes first. `--download` retrieves only missing originals and
rejects unexpected hashes. For fresh downloads, choose a new source directory.
Never patch generated artwork manually; adjust a recipe/extractor and regenerate.

The family environments use their own pinned versions. The shared environment is
for the common validator and evidence generator; do not substitute it for family
versions when claiming byte-identical extraction.

```sh
export SG_WORK="$HOME/sg-integration"
mkdir -p "$SG_WORK"
for family in mandatory prohibitory warning informatory markings assemblies; do
  python3 -m venv "$SG_WORK/$family/venv"
  "$SG_WORK/$family/venv/bin/pip" install \
    -r "tools/asset_extraction/$family/requirements.txt"
  case "$family" in
    mandatory|informatory|assemblies)
      source_flag=--sources; review_flag=--review ;;
    prohibitory|warning|markings)
      source_flag=--source-dir; review_flag=--review-dir ;;
  esac
  "$SG_WORK/$family/venv/bin/python" "tools/asset_extraction/$family/extract.py" \
    "$source_flag" "$SG_WORK/$family/sources" \
    "$review_flag" "$SG_WORK/$family/review" --download
done

# Prohibitory and markings validate during extraction.
"$SG_WORK/mandatory/venv/bin/python" tools/asset_extraction/mandatory/validate.py \
  --sources "$SG_WORK/mandatory/sources" --report "$SG_WORK/mandatory/review/validation.json"
"$SG_WORK/warning/venv/bin/python" tools/asset_extraction/warning/validate.py \
  --source-dir "$SG_WORK/warning/sources"
"$SG_WORK/informatory/venv/bin/python" tools/asset_extraction/informatory/validate.py \
  --sources "$SG_WORK/informatory/sources"
"$SG_WORK/assemblies/venv/bin/python" tools/asset_extraction/assemblies/validate.py \
  --sources "$SG_WORK/assemblies/sources" --review "$SG_WORK/assemblies/review"

python3 -m venv "$SG_WORK/venv"
"$SG_WORK/venv/bin/pip" install -r tools/asset_extraction/requirements.txt
"$SG_WORK/venv/bin/python" tools/asset_extraction/validate.py \
  --sources "$SG_WORK" --write-index
# Without --write-index, validation also rejects a stale committed index.
"$SG_WORK/venv/bin/python" tools/asset_extraction/validate.py --sources "$SG_WORK"
"$SG_WORK/venv/bin/python" tools/asset_extraction/review.py \
  --sources "$SG_WORK" --output "$SG_WORK/combined"
```

`combined-review.pdf` shows every record with source ID, PDF page, drawing,
revision and review status, PNG references beside available SVG renderings,
plus representative source-page comparisons. `coverage.md` is the complete
page-by-page report with reasons and explicit deferrals.

The shared [contract](tools/asset_extraction/contract.py) enforces common fields
while retaining family-specific evidence. The [validator](tools/asset_extraction/validate.py)
checks source/file hashes, unique IDs, local paths and symlinks, all PDF pages,
asset ownership by source page, crop/image dimensions, nonblank images, stale
recipes and the release gate. SVG checks reject embedded raster/base64,
scripts, event handlers, styles, external references, hidden definitions and
distant geometry. Locality allows at most 20 source units of recorded engineering
leaders; each family's independent validator applies its stricter original-path,
crop/pixel and measurement checks. The shared validator does not replace those
family checks or human content/reuse approval.

```sh
for family in mandatory prohibitory warning informatory markings assemblies; do
  "$SG_WORK/$family/venv/bin/ruff" check "tools/asset_extraction/$family"
  "$SG_WORK/$family/venv/bin/mypy" --ignore-missing-imports --check-untyped-defs \
    "tools/asset_extraction/$family"
done
"$SG_WORK/venv/bin/ruff" check tools/asset_extraction/*.py
"$SG_WORK/venv/bin/ruff" format --check tools/asset_extraction/*.py
"$SG_WORK/venv/bin/mypy" --ignore-missing-imports tools/asset_extraction/*.py
SG_SOURCE_DIR="$SG_WORK" "$SG_WORK/venv/bin/python" -m unittest discover \
  -s tools/asset_extraction -p test_contract.py -v
MARKINGS_SOURCE_DIR="$SG_WORK/markings/sources" \
  "$SG_WORK/markings/venv/bin/python" -m unittest discover \
  -s tools/asset_extraction/markings -p 'test_*.py' -v
```

## Unresolved cases and release requirements

- **All families:** content, artwork, colour applicability and reuse rights require
  approval. Reference crops retain engineering guides and disputed source content.
  `cleaned_unverified` and `verified_geometry` describe extraction/measurement
  work only. The validator requires explicit content and reuse approval, evidence,
  approved licence/status, and no unresolved warnings before release.
- **Mandatory:** Keep Left/Right overall dimensions and Stop Children panel height
  remain unknown. Joined-perimeter white backing is an interpretation requiring
  review. Original SVG colours can differ from PDF rasterization by one RGB byte.
- **Prohibitory:** historical restricted-hours wording is unverified; three reverse
  faces omit the caption's “Please”; TFP6 caption/artwork audience differs.
  Engineering marks and the original tilted bicycle pictograms remain.
- **Warning:** general expressway 900 mm geometries, undrawn height numerals,
  barrier lengths and sharp-deviation directions were not fabricated. Legacy
  ERP/CashCard, restricted-zone and speed wording needs current content review.
- **Informatory:** TFI1 full-day bus-lane artwork says **07:30–20:00**, conflicting
  with TP handbook §54(b), PDF p41, **07:30–23:00** Monday–Saturday except Sundays
  and public holidays. `sg.informatory.bus-lane-full-day-source-hours` remains
  **blocked**. Three TFI8/15/17 references remain PNG-only after vector locality
  rejection. TFI7 logos and TFI18 placeholders are preserved. TFI18 lane-count
  geometries and TFI19 kerb-strip geometry are deferred.
- **Markings:** RMS4 arrow outlines have source interruptions; RMS5 connected
  arrows, complex chevrons, profiles, BUS lettering, periodic bus-lane markers and
  junction geometry remain incomplete for production. Supplementary handbook
  illustrations were not extracted. Zebra colour applicability and the RMS6
  acceleration/deceleration caption ambiguity remain unresolved.
- **Assemblies:** the TP green-B illustration puts B right of red while Rule 11
  specifies left of or above red from the approaching driver's viewpoint.
  BUS4 title block says D but history includes E, March 2026. BUS10 is absent.
  Only five SVGs pass original-path isolation. Holder heights are grouped;
  foundations, schedules and site variants are not exhaustively parameterized.
  No horizontal signal artwork was supplied; cited arrangement constraints are
  retained without invented artwork. Rule 11 evidence is an incomplete text
  snapshot, and unknown dimensions, attachments and normals remain explicit.

Integration changed the markings recipe/extractor to declare and verify all
three PDF page counts; its manifest was regenerated. No generated artwork was
edited by hand. The six producer commits remain separate commits on the
integration branch; the parent session integrates this result into its existing PR.

## Integration review evidence

- [Combined review PDF](https://app.devin.ai/attachments/613510bd-fb4a-4ab0-adf9-859510ee2e27/combined-review.pdf):
  52 pages, every asset captioned, seven original-page comparisons.
- [Complete coverage report](https://app.devin.ai/attachments/5681e207-ce89-4695-bdfb-43c7b56d5b8c/coverage.md):
  all family page ledgers and their reasons, including BUS10 and cited-text rows.

Integration checks passed: all six family extractors/validators, shared validation,
Ruff and mypy for all family/shared tooling, and 21 regression tests (15 common
contract tests and six markings tests). Fresh extraction reproduced the producer
artwork bytes; only the regenerated markings manifest gained page counts.
All six family contact sheets and the seven source comparisons were inspected.
These reviews establish extraction fidelity; they do not approve traffic content
or reuse rights.
