# Prohibitory source extraction

Reproducible extraction of **33 separate sign faces and supplementary panels**
from LTA's six TFP sheets: **33 SVG references and 33 lossless 288 DPI PNG
references**. Every depicted face is included, even the informational Four
Waiting Lanes Ahead face on TFP4. Distinct standard/expressway height artwork,
no-stopping/no-waiting arrows, reverse faces, and both TFP6 arrow assemblies
remain separate assets.

These are `source_reference` assets with intersecting engineering annotations.
They are not production artwork. All assets have `release_ready: false`,
`license_status: unreviewed`, and no inferred physical dimensions or traffic rules.
`dimensions_mm: {}` means no dimensions were transcribed, not zero size.

## Reproduce

Run from the repository root using Python 3.10 (tested with 3.10.12):

```sh
python3 -m venv "$HOME/sg-extraction-venv"
"$HOME/sg-extraction-venv/bin/pip" install \
  -r tools/asset_extraction/prohibitory/requirements.txt
"$HOME/sg-extraction-venv/bin/python" tools/asset_extraction/prohibitory/extract.py \
  --source-dir "$HOME/sg-prohibitory/sources" \
  --review-dir "$HOME/sg-prohibitory/review" \
  --download
```

The script downloads the real PDFs only when absent and rejects changed hashes
or unexpected page counts. Originals and large review images must remain outside
the repository. `recipe.json` records URLs, SHA-256 hashes, crop coordinates in
PDF points, 1-based PDF pages, printed pages, drawing identifiers, and individual
sheet revisions. Retrieval date is pinned to the source acquisition date;
rerunning does not assert a fresh acquisition.

The SDRE collection is Revision I, March 2026 (effective on retrieval;
Revision J takes effect on 1 March 2027). TFP3 is drawing revision A, September
2017; the other five sheets show revision `-`, April 2014. Collection revision
and individual drawing revision are separate facts.

| Sheet | PDF page | Printed page | Drawing revision | Faces/panels |
| --- | --- | --- | --- | --- |
| TFP1 | 2 | 16-1 | - | 7 |
| TFP2 | 3 | 16-2 | - | 4 |
| TFP3 | 4 | 16-3 | A | 7 |
| TFP4 | 5 | 16-4 | - | 4 |
| TFP5 | 6 | 16-5 | - | 4 |
| TFP6 | 7 | 16-6 | - | 7 |

Coverage accounts for all 104 pages in the TFP, collection contents/general
notes, and Traffic Police handbook PDFs. The handbook is context for meaning;
its artwork is outside this TFP-only extraction scope. Structural poles,
dimensions, captions, notes, title blocks and covers are accounted for but are
not additional faces. No TFP face is deferred.

## Vector isolation

The six sheets contain vector paths, including outlined lettering, and no PDF
fonts or raster images. No OCR or font substitution is used.

1. Verify SVG/PDF drawing-operation correspondence and page-only clipping.
2. Select painted paths that intersect the crop, retaining paint order. A
   stroked page border does not count as ink inside the enclosed face.
3. Preserve original path data, transforms and styles. Straight annotation
   lines crossing far outside a crop are clipped mathematically, retaining their
   dash phase. Disjoint filled rectangular subpaths can be separated without
   changing their original commands (TFP3 has a lettering stroke shared across
   three reverse faces).
4. Drop unrelated paths and page clip definitions. Retain only nearby crossing
   annotation segments, bounded to at most 12 points outside the viewport.
   Unsupported crossing paths fall back to PNG and are reported explicitly.
5. Record each original path index and operation in the manifest. Verify the
   exported geometry and styles against the original operations and raster
   comparison. SVGs have only `svg`, `rect`, and `path` elements, with no external
   references, scripts, image embeddings, fonts, or hidden source pages.

The exact PNG crop remains the colour-managed source reference. MuPDF's SVG
colour conversion can differ slightly from PDF rendering; no colours are
manually changed. Crops do not recolour, mirror, rotate or reshape the faces.

## Validation and review

Every extraction run verifies source/file hashes, unique IDs, related IDs,
recipe paths, source bounds, complete page coverage, nonblank PNG/SVG content,
exact PNG/source pixels, bounded SVG geometry, and original path/style integrity.
SVG ink-mask disagreement with its source crop must remain below 0.1%.

```sh
"$HOME/sg-extraction-venv/bin/ruff" check tools/asset_extraction/prohibitory
"$HOME/sg-extraction-venv/bin/mypy" --check-untyped-defs --ignore-missing-imports \
  tools/asset_extraction/prohibitory/extract.py
```

The review directory contains PNG and SVG-rendered contact sheets covering all
33 items, original page renderings, crop maps, title-block crops, validation
metrics, and per-page vector/image/font inventory. Inspect both contact sheets
and all six crop maps before accepting a changed recipe. The source PNG contact
sheet is `contact-sheet.png`; the SVG contact sheet is `contact-sheet-svg.png`.
Automated comparison supplements visual review; it does not verify legal rules
or clean production geometry.

To check determinism, run again with `--output-dir` and `--review-dir` set to
fresh directories outside the repository, then compare the asset directories
with `diff -qr`. The same pinned environment and source bytes must reproduce
every asset and manifest byte.

## Unresolved review items

- Content, reuse rights, traffic-rule applicability, colour and production
  geometry need review before release.
- TFP3's restricted-hours plate is historical; its current applicability is
  unverified. All printed hours and wording remain intact.
- TFP3's reverse-face note says “Please Use…” while the artwork says “Use…”.
  The three artworks are preserved and the discrepancy is recorded.
- TFP6's reverse-face caption says “CYCLIST CROSSING PROHIBITION” while its
  artwork addresses “PEDESTRIANS & CYCLISTS”.
- TFP6's two lower bicycle pictograms are tilted in the original. Both primary
  faces and both directional plates were extracted independently, without
  straightening or mirroring.
- Intersecting dimensions, ticks, outlines, callouts and centre lines remain.
  They require a separate reviewed cleanup, not silent deletion here.
