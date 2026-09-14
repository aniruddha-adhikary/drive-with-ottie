# Informatory source extraction

This package produces **89 source references: 84 sign/board faces and 5 layout
references**. There are 78 TFI items and 11 TFS items, represented by 89 lossless
PNGs and 86 isolated SVGs. No renderer assets or verified engineering geometry
are supplied. Every asset has `license_status: unreviewed` and
`release_ready: false`.

`assets/sg/informatory/manifest.json` is generated from `recipes.csv` and the
source/revision definitions in `extract.py`. Semantic IDs are project identifiers,
not official LTA sign codes. `reference/` is generated output: regeneration removes
obsolete PNG/SVG files there.

## Sources and revisions

The scripts download actual official PDFs into a directory outside the checkout
and verify all four SHA-256 fingerprints before extraction. They do not accept
replacement documents with different hashes.

The SDRE collection is Revision I, March 2026, April 2014 edition. This is the
effective collection on the 2026-09-14 retrieval date. Revision J does not take
effect until 2027-03-01; do not substitute newer filenames. See the repository's
`docs/research/SINGAPORE-ROAD-CONTROLS.md` for the effective-date policy.

Individual drawing title blocks were reviewed separately:

| Drawing sheets | Sheet revision |
| --- | --- |
| TFI1, 3–10, 13–14, 16–19 | A |
| TFI2, 11–12, 15 | B |
| TFS1–2 | `-` |

TFI drawing 1 is PDF page 3; TFS drawing 1 is PDF page 2. The ledger covers all
21 drawing sheets, the TFI cover/index pages, the TFS index, all seven collection
contents/general-note pages and all 90 TP handbook pages: 121 PDF pages total.
Handbook pages outside provenance and the bus-lane evidence are explicitly
outside this family extraction scope.

The bounding boxes use **upright PDF display points**, top-left origin, before
the crop origin is subtracted. TFS drawing pages have original rotation 90°.
`bbox_unrotated_pdf_points` and `original_page_rotation` retain the coordinates
needed for clients using the original unrotated PDF space. Rendering normalizes
rotation in memory; the downloaded PDFs are never rewritten.

## Reproduce

Tested with Python 3.10.12 on Linux. Run from the repository root:

```sh
python3 -m venv "$HOME/informatory-venv"
"$HOME/informatory-venv/bin/pip" install -r tools/asset_extraction/informatory/requirements.txt

"$HOME/informatory-venv/bin/python" tools/asset_extraction/informatory/extract.py \
  --download --sources "$HOME/informatory-originals" --review "$HOME/informatory-review"

"$HOME/informatory-venv/bin/python" tools/asset_extraction/informatory/inventory.py \
  --sources "$HOME/informatory-originals" --review "$HOME/informatory-review"
```

`inventory.py` renders all TFI/TFS/contents source pages and
records vector-path, image, font, text and rotation information for inspection.
Lettering in these drawing crops is outlined; no OCR or replacement fonts are
used.

`extract.py` writes the manifest and individual references to the repository,
and these review files outside it:

- `contact-sheet.png`: every exported reference in recipe order.
- `contact-01.png` … `contact-05.png`: the same items in readable groups of 20.
- `export-audit.json`: per-asset vector-path counts, raster-comparison error
  and explicit PNG fallback reasons.

Do not commit the source PDFs, source-page renders, review sheets or audit output.

## Isolation and preservation

1. Render the exact recipe box from the original page at 144 dpi to lossless PNG.
2. Map original SVG drawing paths to PDF drawing records; assert path counts.
3. Split compound path data only at its original absolute `M` commands. Preserve
   path numbers, fills, strokes, transforms, clipping and outline lettering.
4. Omit subpaths outside the crop. Reject a vector candidate if a visible
   subpath extends more than 20 PDF points beyond the box. Large page-border
   paths with no visible ink in the crop are discarded.
5. Preserve referenced clip definitions only; the individual SVG never contains
   the full page's artwork. The retained clip definitions are small clipping
   primitives, not hidden page content.
6. Rasterize the SVG and compare it against the original PDF crop. Fall back to
   PNG if mean absolute RGB channel error exceeds 2/255. The reviewed run's
   largest retained-SVG error is below 0.47/255.

These are **source references**, including internal dimension leaders,
construction ticks, radius labels and illustrative legends where they intersect
the face. PDF/renderer colours are preserved without recolouring, mirroring,
reshaping or typography reconstruction. White sign areas are opaque in the PNG;
SVG transparency follows the original PDF primitives and must be displayed on
white when compared with the reference PNG.

Three crops intentionally have no SVG because boundary-crossing source
subpaths fail the locality guard:

- TFI8 Woodlands Rd / Mandai Rd / Sembawang Way board.
- TFI15 five-lane indication board with right taper.
- TFI17 two-lane indication board with left split.

Their PNGs preserve the complete visible crops. Further vector cleaning remains
deferred rather than embedding hidden full-page source paths.

## Content limits and deferred work

- **Blocked:** TFI1's full-day board says **7.30am–8pm (07:30–20:00)**.
  TP handbook PDF p41 / printed p40, §54(b), says **07:30–23:00
  Monday–Saturday**, except Sundays and public holidays. The original artwork
  is preserved. The manifest carries a separate cited schedule rule; it does
  not infer legal behaviour from the drawing. Never release this source-hours
  asset as a current operating-hours board.
- NPP and P.A. logos on TFI7 are explicit source placeholders. TFI8–10 route
  legends are illustrative. TFI9's 600m insert and TFI10's corner-radius example
  are layout references, not completed standalone sign faces.
- TFI11 and TFI12 have explicitly `REMOVED` regions. These are documented
  in coverage rather than presented as missing extraction failures.
- TFI15 includes structural post/rivet details that are not additional sign
  faces. The two instruction-board size/content variants remain separate.
- TFI18's two height-limit layouts contain `HEIGHT LIMIT SIGN` placeholders.
  The table's 2/3/4/5-lane dimensional variants are not separately drawn;
  generating those variants and replacing the placeholders is deferred.
- TFI19's two curve-marker sizes, two square object-marker sizes and two
  opposite diagonal-stripe variants remain separate. The kerb strip is a
  layout reference. Dimension endpoints and variable total length have not
  been transcribed into parametric geometry.
- `dimensions_mm` stays empty because this package does not claim verified
  dimensional transcription. Dimensions appearing in names describe the
  source's variant labels. Content/reuse review and renderer cleaning remain
  outstanding for every item.

Coverage status `reference_only` means the sheet's drawn faces/layouts were
extracted as source references. Its `deferred_scope` and
`not_applicable_details` retain partial exclusions. No sheet is claimed to
have completed parametric reconstruction or production approval.

## Validate and check determinism

```sh
"$HOME/informatory-venv/bin/ruff" check tools/asset_extraction/informatory
"$HOME/informatory-venv/bin/mypy" --ignore-missing-imports tools/asset_extraction/informatory
"$HOME/informatory-venv/bin/python" tools/asset_extraction/informatory/validate.py \
  --sources "$HOME/informatory-originals"

"$HOME/informatory-venv/bin/python" tools/asset_extraction/informatory/extract.py \
  --sources "$HOME/informatory-originals" \
  --output "$HOME/informatory-regenerated" --review "$HOME/informatory-review-repeat"
"$HOME/informatory-venv/bin/python" tools/asset_extraction/informatory/validate.py \
  --sources "$HOME/informatory-originals" --compare "$HOME/informatory-regenerated"
cmp "$HOME/informatory-review/contact-sheet.png" \
  "$HOME/informatory-review-repeat/contact-sheet.png"
```

Validation checks source fingerprints; unique IDs and coverage; all file paths
and output hashes; sheet revisions, pages, rotations and boxes; PNG nonblankness
and exact pixels against the source; SVG tag/reference safety; preservation of
original source subpaths/attributes; locality; and SVG/PDF raster agreement.
`--compare` requires every generated file, including the manifest, to be
byte-identical. Do not run these scripts with Python `-O`, which disables their
assertions.

All 89 exports were visually inspected on the five contact pages, including
the bus-lane conflict, direction boards, source placeholders, pedestrian
instructions, height-limit layouts, marker variants and TFS pages against
the original source-page renders. These checks establish faithful reference
extraction, not release approval.
