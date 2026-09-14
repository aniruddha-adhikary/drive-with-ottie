# Singapore RMS extraction

Extracts real, hash-pinned LTA PDFs directly. The main artwork source is SDRE
collection **Revision I, March 2026**. Revision J is not used. `recipes.json`
records the original official URLs, SHA-256 hashes, retrieval date, each sheet's
individual revision, and deterministic PDF crop/selection coordinates.

## Reproduce

From the repository root, using Python 3.10.12:

```sh
python3 -m venv "$HOME/markings-venv"
"$HOME/markings-venv/bin/pip" install -r tools/asset_extraction/markings/requirements.txt
"$HOME/markings-venv/bin/python" tools/asset_extraction/markings/extract.py \
  --download \
  --source-dir "$HOME/markings-sources" \
  --review-dir "$HOME/markings-review"
```

The downloader refuses missing or changed source files unless the expected file
can be downloaded and its hash matches. Keep originals and review images outside
git. A source update requires deliberate recipe and content review.

```sh
"$HOME/markings-venv/bin/ruff" check tools/asset_extraction/markings
"$HOME/markings-venv/bin/ruff" format --check tools/asset_extraction/markings
"$HOME/markings-venv/bin/mypy" --ignore-missing-imports tools/asset_extraction/markings
MARKINGS_SOURCE_DIR="$HOME/markings-sources" \
  "$HOME/markings-venv/bin/python" -m unittest discover \
  -s tools/asset_extraction/markings -p 'test_*.py' -v
```

The pinned dependencies are the versions installed and used for extraction.
PyMuPDF supplies MuPDF PDF/SVG rendering; svgpathtools supplies analytical path
bounds; Pillow supplies lossless PNGs and contact sheets. Other pins are their
installed dependencies or the lint/typecheck tools.

## Outputs

`assets/sg/markings/manifest.json` indexes **80 semantic assets**:

| Representation/file | Count | Purpose |
| --- | ---: | --- |
| Reference PNG | 80 | Original-source crops at 216 dpi |
| Original-path reference SVG | 43 | Selected source paths, including eight RMS4 engineering outlines |
| Parameter SVG + geometry JSON pairs | 24 | Explicitly transcribed dimensioned primitives |

These file categories overlap; they are not 147 different semantic assets.
The manifest records per-file SHA-256 values. `source-inventory.json` records
page dimensions, rotation, vector/image/font/text counts and sheet revisions.
`rules.json` contains 14 separately cited, unreviewed handbook rules; quotation
validation reads the actual handbook PDF.

The review directory receives:

- `source-rms-01.png` through `source-rms-15.png`: source cover and all RMS sheets.
- `contact-sheet-all.png`: every reference PNG, reference SVG and generated SVG.
- `contact-sheet-01.png` onward: the same complete set in readable 16-item panels.
- `validation.json`: counts and automated checks.

The contact-sheet gray background is review furniture. It is not added to the
transparent source or generated SVGs. White paint remains white.

## Extraction and geometry boundaries

PNG crops retain source dimensions and context. Selected recipes include an
explicit polygon to remove neighbouring drawing fragments without altering the
target drawing. The original PDF and rectangular crop coordinates remain the
authority. Dimension leaders may remain in reference PNGs.

SVG extraction parses MuPDF's original SVG path strings. It retains only whole
absolute-`M` subpaths inside the recorded artwork box, selecting original paint
colors or the original engineering-outline stroke width. Optional selection
polygons exclude adjacent drawings. Path coordinates, transforms, paint
attributes, counter paths and curve commands are retained, without font
substitution. Parent clips must fully contain each selected path. Unselected
paths are removed, not hidden in a full-page SVG. Unsupported transforms,
styles or source clips fail extraction.

RMS4 SVGs are original **black engineering outlines**, not invented filled
white arrows. The two RMS9 merge-arrow variants preserve their left-pointing
source orientation. RMS5 depicts connected multi-head turning arrows, not the
RMS9 merge-arrow inset.

Geometry JSON is separate from source extraction. It records millimetre
parameters, printed-label evidence, PDF page/bbox and measurement endpoints.
The SVGs are generated from those parameters. Examples:

- D: 100 mm rows, 150 mm **clear** row gap, 1000/1000 mm paint/gap.
  The derived row-centre spacing is 250 mm.
- E: 150 mm width, 2750/2750 mm paint/gap.
- A6/A7: distinct yellow/red widths with 100 mm clear inter-row gap.
- A8: 400 mm squares / 600 mm clear gap for **bicycle** crossings.
  A4 is the separate pedestrian marking.
- A9: 150 mm diameter dots; 1000/3000 mm dimensions are **centre
  spacing**, not clear gaps.

Continuous lines use a 4000 mm display sample, not an inferred engineering
length. Broken-line samples use two painted segments; A9 uses two three-dot
groups. Site placement and extent remain unknown. Source display colors are
not physical paint specifications.

`verified_geometry` means the listed parameters were checked against printed
labels; it does not approve legal applicability, reuse rights, all dimensions,
or the accompanying cleaned source vectors. All assets remain
`release_ready: false`, with `license_status: unreviewed`.

## Coverage and remaining work

All **15 RMS PDF pages** (cover plus RMS1–14) are accounted for. RMS1–3 include
all labelled marking types A–R and stable role/variant suffixes. RMS4 has eight
individual arrow references. Later sheets include merge arrows, BUS lettering,
bus-priority symbols, chevrons, sharp-curve layouts and junction layouts.

The manifest also accounts for every page of the supplemental contents and
handbook PDFs: 112 source pages in total. Supplemental handbook illustration
extraction was not attempted; this is explicitly distinguished from reviewed
text evidence and unrelated pages.

Still deferred or requiring review:

- Independently isolated production geometry for the connected RMS5 multi-head
  arrows and complex engineering layouts/compound markings. They are preserved
  as named source references.
- Clean geometry for profile/rib details, chevron layouts, BUS letter dimensions,
  periodic bus-lane markers and complete junction templates.
- Artwork/content/reuse review, zebra-crossing color applicability and
  application of the individual arrow variants.
- Source caption ambiguity on the RMS6 acceleration sheet: one lane-length
  caption says “deceleration”; preserved without correction.
- Current bus-lane hours come from the January 2026 handbook. Older sign artwork
  with conflicting hours must be reviewed separately.

CAM sign/support details and spacing tables on RMS13 are outside standalone
road-paint extraction; three placement layouts remain available as references.
There are no unresolved extraction failures in the generated manifest.
This delivery does **not** claim complete production geometry or complete
supplemental-handbook artwork extraction.

## Review and validation

Extraction checks source hashes, PDF headers, source page/crop bounds, upright
page rotation, unique IDs/paths, per-file hashes, complete page accounting,
nonblank images, SVG element/reference safety, source-path bounds, geometry
evidence, clear-gap versus centre-spacing calculations, and exact rule quotes.
It rejects unmanifested files in the generated asset directories.
Integration tests additionally reject changed source hashes, duplicate IDs,
invalid pages, incorrect file hashes and missing coverage. Regression checks
preserve the specified D/E dimensions, A9 centre-spacing semantics and distinct
stop/shoulder and pedestrian/bicycle roles.

Visual review covers every exported image in the contact sheets, with detailed
checks of D/E, paired bus-lane strokes, A8/A9, adjacent RMS4 arrow outlines,
BUS counters, bus-priority symbols, merge arrows, source revisions and source
ambiguities. Geometry JSON is represented visually by its generated SVG.
Some source engineering outlines have interruptions around dimension
annotations. Those original path interruptions are retained, not silently
closed into a production silhouette.
