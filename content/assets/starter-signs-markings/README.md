# Starter signs and markings — DEVELOPMENT candidates (A1)

Runtime candidates for the three starter layouts (Give Way T-junction, STOP development
access, signalised right-arrow crossroads). Everything here is `release_ready: false`,
`content_approved: false`, `reuse_approved: false`. Nothing grants rights or approval.

| Candidate | Source asset | Sheet | What it is |
| --- | --- | --- | --- |
| `sg.dev.starter.face.give-way` | `sg.mandatory.give-way` | TFM1 rev `-` (PDF p.2, printed 15-1) | 600×600 mm face, byte-identical official cleaned SVG |
| `sg.dev.starter.face.stop` | `sg.mandatory.stop` | TFM1 rev `-` (PDF p.2, printed 15-1) | 600×600 mm face, byte-identical official cleaned SVG |
| `sg.dev.starter.marking.give-way-line-d` | `sg.markings.control-give-way-d` | RMS2 rev B (PDF p.3, printed 8-2) | two 100 mm rows, 1000/1000 mm, 150 mm clear between rows |
| `sg.dev.starter.marking.stop-line-j` | `sg.markings.control-stop-j` | RMS2 rev B | 300 mm continuous, `stop_line` role only |
| `sg.dev.starter.marking.centre-broken-e` | `sg.markings.centre-broken-two-way-e` | RMS2 rev B | 150 mm, 2750/2750 mm two-way centre line |
| `sg.dev.starter.marking.centre-continuous-f` | `sg.markings.centre-continuous-single-f` | RMS2 rev B | 150 mm continuous centre line |

Starter paint scope: every starter road has exactly one lane per direction, so the only lane
paint needed is a two-way centre line (E for the road body, F where the layout wants an
uncrossable approach). Lane separators B/C, the paved-shoulder use of J, edge/yellow lines
and box markings are deliberately excluded. Which of E/F each layout uses near the junction is
a T1 layout decision; both strokes are supplied.

## Layout

- `manifest.json` — candidate index: verbatim source locators, original file hashes, source PDF
  hashes/URLs, sheet revisions and dates, scope notes, unresolved items.
- `faces/<name>.svg` — byte-identical copies of `assets/sg/mandatory/<name>.svg` (no redraw, no
  fonts; lettering is outlined paths). `faces/<name>.json` gives the SVG-unit→mm mapping, the
  backing perimeter bbox to map onto the 600×600 face quad, `front`/`up`/`right` axes
  (front = −Y of the asset frame, up = +Z, matching the contracts fixtures) and the `back_centre`
  attachment.
- `markings/<name>.json` — original `parameters_mm` and measurement evidence plus `stroke_m`
  (runtime metres: width, painted/clear lengths, period, inter-row clear gap, total transverse
  width) and illustrative `sample_rectangles_m` in the marking frame (x along the row, y across,
  row 0 at y = 0). Extent is always supplied by the placing anchor.

## Reproduce and verify

```sh
python3 content/assets/starter-signs-markings/generate.py generate   # rewrites outputs
python3 content/assets/starter-signs-markings/generate.py check      # byte-for-byte reproducibility
python3 -m unittest discover -s content/assets/starter-signs-markings -p 'test_*.py' -v
```

Original-source verification needs the hash-pinned PDFs outside Git (`tfm.pdf`, `rms.pdf`,
`handbook.pdf`, URLs and SHA-256 in `manifest.json#sources`) and PyMuPDF from
`tools/asset_extraction/markings/requirements.txt`:

```sh
"$HOME/markings-venv/bin/python" content/assets/starter-signs-markings/generate.py \
  verify-sources --source-dir "$HOME/markings-sources"
```

This re-hashes the PDFs, checks page counts, and re-measures the vector drawings: the RMS2 white
fill rectangles inside each `bbox_pdf_points` at 1:100 (D: 100 mm rows, 1000/1000 mm, 150 mm clear
between rows; J: 300 mm; E: 150 mm, 2750/2750 mm; F: 150 mm) and the TFM1 backing perimeter at
1:10 (600×600 mm, 560 mm main paint). Locators were also checked visually against rendered
pages: TFM1 title block reads `LTA/SDRE14/15/TFM1`, REV `-`, APR 2014, sheet 1 of 2, printed
page 15-1; RMS2 reads `LTA/SDRE14/8/RMS2`, REV `B` (A OCT 2015, B SEP 2017), APR 2014, sheet
2 of 3, printed page 8-2. The RMS2 J row description is "used along expressway adjacent to
paved shoulder and also as stop lines" — the two semantic contexts share one geometry.

Lint/type checks used for the Python here: `ruff check`, `ruff format --check`,
`mypy --ignore-missing-imports` (same pins as the markings extraction tool).

## Known unknowns

See `manifest.json#unresolved` and each candidate's `unknowns`: mounting height, support family
and kerb offset for faces; site-specific extent and placement for every marking; stop-line
position relative to signal heads in the signalised layout; E vs F choice near each junction.
