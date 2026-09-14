# Mandatory sign extraction

This family contains **12 sign-face assets**, each with an original-vector SVG
and a lossless 216 dpi source-reference PNG. The six illustrations on each TFM
sheet are covered, including the independently extracted 600 mm and 900 mm
Pass Either Side variants. There are no deferred TFM sign faces.

All assets remain `cleaned_unverified`, `license_status: unreviewed` and
`release_ready: false`. Review is required before publication or product use.
Source-reference PNGs contain engineering annotations and are not textures.

## Reproduce

Run from the repository root. Python 3.10.12 was used; runtime package versions
are pinned in this family. No root package/build configuration is needed.

```sh
export PYTHONPYCACHEPREFIX="$HOME/mandatory-extraction/pycache"
python3 -m venv "$HOME/mandatory-extraction/venv"
"$HOME/mandatory-extraction/venv/bin/pip" install \
  -r tools/asset_extraction/mandatory/requirements.txt

"$HOME/mandatory-extraction/venv/bin/python" \
  tools/asset_extraction/mandatory/extract.py \
  --sources "$HOME/mandatory-extraction/sources" \
  --review "$HOME/mandatory-extraction/review" \
  --download

"$HOME/mandatory-extraction/venv/bin/python" \
  tools/asset_extraction/mandatory/validate.py \
  --sources "$HOME/mandatory-extraction/sources" \
  --report "$HOME/mandatory-extraction/review/validation.json"

"$HOME/mandatory-extraction/venv/bin/ruff" check \
  --cache-dir "$HOME/mandatory-extraction/ruff-cache" \
  tools/asset_extraction/mandatory
"$HOME/mandatory-extraction/venv/bin/mypy" \
  --cache-dir "$HOME/mandatory-extraction/mypy-cache" \
  --ignore-missing-imports --check-untyped-defs tools/asset_extraction/mandatory
```

Sources are real PDFs downloaded from LTA/Traffic Police, retained outside git,
and rejected if their SHA-256 changes. `--download` only retrieves missing files.
The output is deterministic for these source hashes and pinned runtime packages.
Large contact sheets, detailed comparison sheets, page renders, individual
cleaned preview PNGs and validation reports go to the external review directory.
Never manually edit generated SVG, PNG or manifest files; edit `recipe.json`
or the scripts and regenerate. PyMuPDF has no bundled static type information;
its external calls use explicit result contracts, supplemented by runtime checks.

## Source inspection and extraction

- The March 2026 collection cover states **Revision I**. The repository source
  register records Revision J as effective **1 March 2027**; it was not selected.
- The TFM chapter has three PDF pages: an index and TFM1/TFM2. Their own title
  blocks both show **revision `-`, APR 2014**, printed pages **15-1 / 15-2**.
  Collection revision and individual drawing revision are separate.
- PDF pages 2/3 respectively contain **2096 / 1846** paint paths, **zero images,
  zero fonts, and empty extracted text**. Both sheets use outlined lettering.
- MuPDF exports the same count of SVG paint paths, in paint order. Source-wide
  clipping is checked before discarding it. The recipe selects the original
  coloured face paths, original backing perimeter, and explicit black
  lettering/border paths. Path data, transforms, stroke/fill attributes and
  ordering remain unchanged; no tracing, guessed fonts, mirroring or recolouring.
- Source lettering includes holes in coloured compound paths plus separate
  counter-shapes and outlines. Selecting just a coloured outline or OCR text
  would lose the original face.
- The PDF uses white paper behind unfilled backing outlines. The script joins
  the original line/Bézier perimeter segments into a white interior underneath
  the unchanged original paths. It does not approximate the rounded backing
  with a rectangle or infer a radius. This interpretation remains unverified.
- The Stop Children octagonal panel is preserved; its handle is structural
  context, so only the reference PNG includes the handle stub.
- Renderer SVGs contain only a white-interior path plus selected source paths.
  There are no embedded images, scripts, fonts, remote links, `<use>` references,
  clipping-based hidden pages, or out-of-bounds source artwork.
- MuPDF's conversion of source numeric RGB to SVG hex introduces observed
  one-byte rounding differences from its PDF rasterizer (red 219/42/26 versus
  220/42/27; blue 0/161/211 versus 0/162/211). These attributes are the untouched
  MuPDF SVG export. Physical colour/material compliance has not been established.

## Manifest conventions

`assets/sg/mandatory/manifest.json` uses one-based PDF pages and top-left-origin
PDF-point rectangles, x right and y down. Its `source.bbox_pdf_points` locates the
reference crop; `extraction.face_bbox_pdf_points` locates the isolated renderer.
Original source-paint indices are zero-based. IDs are proposed semantic
application IDs, **not invented official sign numbers**. Drawing IDs are official.

Each file has a SHA-256. Each asset records the recipe hash, original path indices,
provenance, review limitations and separately cited traffic meaning. Those
transcriptions do not implement a legal rule engine or verify all applications.
Keep Right is sourced from the TFM2 caption because the handbook's mandatory-sign
overview does not illustrate it.

The coverage register accounts for **all 100 pages** across the 3-page TFM chapter,
7-page collection contents, and 90-page supporting handbook. The chapter's index
is not applicable to face extraction; both drawing pages are extracted.
Collection notes/contents and handbook mandatory-sign meanings are references.
Other handbook pages are explicitly outside the requested TFM artwork scope.
Their coverage entries do not claim to extract their illustrations.

Dimensions are transcribed only from visible labels, with PDF page/bbox evidence
and explicit measurement endpoints. They are not estimated from pixels or scale.
The overall sizes of Keep Left and Keep Right, and the Stop Children panel's
height, remain unknown. No parameterized geometry file is claimed.

## Checks and visual review

The validator checks all 12 faces and 24 asset files: source hashes, page counts,
unique IDs, local paths, file hashes, complete page coverage, byte-identical
regeneration of SVGs, original path attributes, exact reference PNG pixel
agreement with the PDF crop, nonblank output, transparent exterior, opaque
backing and hidden content using an expanded SVG viewport.

Visual review compared all exported faces and reference crops on the contact
sheet and its three detailed sheets against the original TFM pages. Give Way's
upright lettering and point-down triangle, both Pass Either Side variants,
Stop Children's two text lines/octagonal border, and both Keep signs were
inspected in detail. All faces are upright in their designed orientation,
bounded and isolated. Review notices remain in the manifest because this
extraction check is not content/reuse approval.
