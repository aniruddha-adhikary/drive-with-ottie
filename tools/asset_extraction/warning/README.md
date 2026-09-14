# Singapore warning sign extraction

This family contains **56 source-reference records for 54 depicted faces** in
all nine LTA TFW sheets. Each record has an individual SVG and lossless PNG.
The two extra records identify the explicitly parenthesized ERP 900mm and
sharp-deviation 3000mm size variants. Each shares the actual drawing with its
smaller variant; the source does not contain separate artwork for those sizes.

These are engineering references with dimension lines and construction guides,
not production renderers. All assets have `release_ready: false`,
`license_status: "unreviewed"`, `renderer_svg: null` and `geometry_json: null`.
Source captions do not establish current traffic rules.

## Reproduce

Tested with Python 3.10.12 on Ubuntu and the exact versions in `requirements.txt`.
Run from the repository root:

```sh
python3 -m venv "$HOME/sg-warning-venv"
"$HOME/sg-warning-venv/bin/pip" install -r tools/asset_extraction/warning/requirements.txt
"$HOME/sg-warning-venv/bin/python" tools/asset_extraction/warning/extract.py \
  --download \
  --source-dir "$HOME/sg-warning-source" \
  --review-dir "$HOME/sg-warning-review"
"$HOME/sg-warning-venv/bin/python" tools/asset_extraction/warning/validate.py \
  --source-dir "$HOME/sg-warning-source"
"$HOME/sg-warning-venv/bin/ruff" check tools/asset_extraction/warning
"$HOME/sg-warning-venv/bin/ruff" format --check tools/asset_extraction/warning
"$HOME/sg-warning-venv/bin/mypy" --ignore-missing-imports tools/asset_extraction/warning
```

`--download` only downloads missing originals. A hash mismatch fails before
extraction; it never silently accepts a later replacement at the same URL.
The original PDFs and all large review images stay outside git. Regeneration
overwrites only this family's generated files. Do not manually edit the SVGs.

The current source URLs, SHA-256 digests, page counts, and retrieval date are in
`recipes.json` and the generated manifest. The official contents PDF pins
**SDRE April 2014 edition, collection Revision I, March 2026**. Revision J is
future-effective on 1 March 2027, per the repository source register.
Every individual TFW title block was inspected: TFW6 is revision **A,
September 2017**; TFW1–5 and TFW7–9 have revision **"-"**. All drawing issue
dates are 1 April 2014. PDF pages 2–10 correspond to printed pages 17-1–17-9.

## Extraction method

Recipe rectangles use the **upright displayed PDF coordinate system**: points,
origin at top left, x rightwards and y downwards. Eight drawing pages carry
90-degree PDF page rotations; TFW6 has rotation zero. Both displayed and
unrotated source rectangles are recorded in the manifest.

1. Verify original PDF hashes and page counts.
2. Inspect PDF images, fonts, and vector drawings. Every TFW face page has
   zero raster images and zero PDF fonts: the original lettering is outlined.
3. Obtain MuPDF's original SVG paths and paint order. Select only complete paths
   whose transformed bounds, including half their stroke width, lie within the
   face's recipe rectangle. Excluded page frames and other faces are physically
   absent, rather than invisibly clipped inside each SVG.
4. TFW6 contains page-level rectangular clips. The script verifies that each
   active clip encloses the extraction rectangle before flattening the group.
   Unknown groups, clips, images or text fail closed.
5. Preserve selected path data, paint attributes, transforms and order exactly.
   Only an outer translation establishes the local viewBox. There is no
   recoloring, symbol mirroring, font reconstruction or sign reshaping.
6. Independently render the PDF crop at 216 DPI to a lossless, opaque RGB PNG.
   The PDF renderer and SVG renderer can differ in color conversion,
   antialiasing, and engineering guide dashes. The SVGs remain source references.
7. Reject an SVG candidate if its rendered ink mask differs from the direct PDF
   by 2.5% or more of the PDF's ink pixels; keep the PNG and explicitly flag
   the withheld vector in the manifest. No vectors are withheld in this run.

The bounds include each complete face, backing outline and integral wording.
Some external dimension leaders end at crop edges. The full original sheet is
the authority for complete engineering annotations. No dimension is inferred
from rendered pixel size. Only the explicitly labeled outer ERP and
sharp-deviation size variants are transcribed, with edge-to-edge endpoints
and the source rectangle recorded.

## Inventory and review

| Sheet | Individual depicted faces | Manifest records | Drawing revision |
| --- | ---: | ---: | --- |
| TFW1 | 6 | 6 | - |
| TFW2 | 6 | 6 | - |
| TFW3 | 6 | 6 | - |
| TFW4 | 6 | 6 | - |
| TFW5 | 6 | 6 | - |
| TFW6 | 5 | 5 | A |
| TFW7 | 6 | 7 | - |
| TFW8 | 7 | 8 | - |
| TFW9 | 6 | 6 | - |

`warning-contact-sheet.png` contains all 56 records. The nine `tfwN-contact.png`
files support sheet-by-sheet review at a larger size. Candidate SVGs and
`validation.json` record the vector comparison checks outside git.

`validate.py` checks the downloaded originals, unique semantic IDs, all 107
source-page coverage records, source bounds and individual revisions,
file hashes, manifest paths, review gates, exact direct-PDF PNG pixels,
deterministic PNG encoding, and preservation of every selected original SVG
path and paint attribute. It rejects out-of-bounds SVG geometry, non-path
elements, remote references, data URIs and unmanifested assets.

All nine contact sheets were inspected against the source pages, including
left/right variants, the TFW6 clipped artwork, outlined lettering, integral
text panels, the original ERP lettering/guide ambiguity, and both shared
size-variant drawings. Reference extraction review is not content or reuse
approval.

## Coverage boundaries and unresolved work

- TFW PDF page 1 is the chapter index; all nine artwork pages are represented.
- All seven collection cover/notes/contents pages are accounted for as
  supporting documents, not warning faces. General note 10 on PDF page 2
  requires 600 by 600mm signs to become 900 by 900mm on expressways, and gives
  50mm corner radii. There is no separately drawn expressway version of each
  face; **those inferred size geometries have not been generated**.
- All 90 Traffic Police handbook pages are explicitly accounted for as
  supplementary, outside this TFW extraction scope. The real handbook was
  downloaded and hashed; its artwork/rules were not extracted or verified.
- Undrawn height numerals, arbitrary barrier lengths and other sharp-deviation
  directions are unattempted. Only the original 4.5m face and left-facing
  sharp-deviation board were extracted. No mirrored direction was fabricated.
- Legacy ERP/CashCard, restricted-zone, and expressway speed-limit wording
  requires current policy/content review. No traffic behavior was encoded.
- Production cleanup, parameter geometry, content review and permission/reuse
  review remain outstanding for every asset.
