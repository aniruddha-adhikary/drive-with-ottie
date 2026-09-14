# Singapore assembly extraction

This family contains **69 individual source references** (47 SUP, 10 BUS,
12 Traffic Police signal examples), **5 safely bounded original-path SVGs**
alongside the corresponding PNGs, and **14 cited assembly definitions**.
Engineering artwork is a reference, not an approved model or renderer asset.
Every output starts `release_ready: false`; content and reuse remain unreviewed.

## Reproduce

Tested on Python 3.10.12 with the exact family requirements:

```sh
python -m venv "$HOME/assembly-extraction-venv"
"$HOME/assembly-extraction-venv/bin/pip" install -r tools/asset_extraction/assemblies/requirements.txt
mkdir -p "$HOME/assembly-sources" "$HOME/assembly-review"
"$HOME/assembly-extraction-venv/bin/python" tools/asset_extraction/assemblies/extract.py \
  --sources "$HOME/assembly-sources" --review "$HOME/assembly-review" --download
"$HOME/assembly-extraction-venv/bin/python" tools/asset_extraction/assemblies/validate.py \
  --sources "$HOME/assembly-sources" --review "$HOME/assembly-review"
"$HOME/assembly-extraction-venv/bin/ruff" check tools/asset_extraction/assemblies
"$HOME/assembly-extraction-venv/bin/ruff" format --check tools/asset_extraction/assemblies
"$HOME/assembly-extraction-venv/bin/mypy" --ignore-missing-imports --check-untyped-defs tools/asset_extraction/assemblies
```

`--download` retrieves the four real official PDFs only when missing. Their
original downloaded-byte hashes and page counts must match `catalog.py`.
Downloads and review sheets remain outside Git. The script removes/replaces only
its previous manifest-listed exports after checking that their hashes still
match. It aborts on altered or missing prior exports, rather than deleting them.

For full-page inventory, vector/image/font inspection and title-block revision
contact sheets:

```sh
python tools/asset_extraction/assemblies/inspect_sources.py \
  --sources "$HOME/assembly-sources" --review "$HOME/assembly-review"
```

`assemblies-contact-all.png` contains every reference in manifest order.
Numbered sheets divide the same set into 12 items each. `validate.py` also writes
`validation.json` and renders every accepted SVG to `svg-review-*.png`.

## Outputs and recipes

- `assets/sg/assemblies/manifest.json`: source URLs/hashes, all 124 PDF pages,
  individual drawing revisions, stable semantic IDs, original page boxes,
  extraction methods, fallback reasons, file hashes, remaining scope and reuse.
- `assets/sg/assemblies/assembly-definitions.json`: cited arrangements,
  legal constraints and support/attachment definitions, independent of artwork.
- `catalog.py`: reviewed source inventory and deterministic crop rectangles.
  Crop coordinates use a normalized **1568 × 1109 displayed page**. The manifest
  records both displayed and original unrotated PyMuPDF page coordinates
  (points, top-left origin, x right/y down), plus original rotation.
- `definitions.json`: hand-transcribed rule/support constraints. The generator
  resolves asset IDs into source/page/box evidence and verifies every legal
  quote against the checked-in official web-tool capture.
- `rule11-web-text.txt`: exact captured official web-tool output with a pinned
  hash. Direct HTTP access returned 403. This is **not original HTML** and is
  explicitly incomplete after the required clauses; PDFs remain real PDFs.

The SUP PDF consists of vector paths, including outlined lettering. Safe SVGs
are made by removing outside paths before generating XML through PyMuPDF. Paths
crossing boundaries are rejected if their removal changes the target crop
(maximum channel mean error 0.01/255 and maximum error 16/255 allow only small
PDF coordinate-rounding differences). SVGs contain no embedded page, image,
remote resource, script or data URI. Failed candidates retain lossless PNGs.
No SVG/XML is hand edited.

BUS pages are raster-tiled engineering references. They are rendered at
216 dpi, without inventing a vector equivalent. The 12 TP examples are decoded
from individual original image XRefs without resampling, preserving original
pixels, colours, orientation and backing. Small TP source images are inherently
low resolution.

Some engineering crops share a rectangular area with fragments of neighboring
diagrams. Explicit `excluded_context` boxes remove only those unrelated
fragments. Both the recipe and manifest retain each mask. Target artwork,
dimension leaders and source ambiguities remain intact. These are
`source_reference`, not cleaned production assets. The three holder-type-1
height variants remain together because the original callouts share space.

`validate.py` independently reconstructs every PNG from the original PDF/image
and recorded context exclusions, then compares pixels exactly. It checks
source and output hashes, paths, page counts, coordinates, IDs, definition
links, nonblankness, SVG safety/renderability and every-page coverage.
Human visual review still determines semantic isolation and upright orientation.

## Constraints and unresolved source issues

- **Revision I, March 2026** is the collection pin. Revision J is effective
  1 March 2027 and is not used. Individual SUP/BUS sheet revisions vary.
- The filename `BUS_1-5` actually contains BUS1–BUS9 on ten PDF pages.
  BUS4's title block says **D**, but its revision history includes **E,
  March 2026**. Neither is silently corrected.
- BUS6 references **BUS10**, which is absent from the supplied PDF.
- The TP green-B illustration places B to the **right** of red. Rule 11
  specifies **left of or above** red when facing approaching traffic.
  The original image is unchanged and both statements are recorded.
- Vertical signal order is R/A/G top to bottom. Horizontal order is G/A/R
  left to right **from the approaching driver's viewpoint**. Horizontal
  examples are absent from the assigned TP pages; only cited constraints exist.
- 2290 mm is the **lowest vertical lens centre above ground**, with the
  source's road-gradient adjustment to 3000 mm. The horizontal 5200 mm
  minimum is also a **lowest lens centre**, including lower arrow lenses.
  Neither is pole height or general structural clearance.
- SUP5 and SUP15's shown 2400 mm dimensions refer to **sign bottom edges**;
  other support variants must use their own source.
- Gantry/support designs, weld schedules, loads, all foundation variants,
  shelters, panel artwork and site-specific dimensions are not exhaustively
  parameterized. Remaining scope is explicit per page.
- TP page 2 states reproduction requires publisher permission. No reuse
  permission is assumed for TP or LTA artwork.

No runtime renderer or root build configuration is introduced. No production
geometry, unknown mounting dimensions or typefaces are fabricated.
