#!/usr/bin/env python3
"""Generate the starter-layout DEVELOPMENT runtime candidates (A1).

Inputs are the committed original extraction outputs under assets/sg/** (never modified here)
and, for `verify-sources`, the hash-pinned original LTA PDFs kept outside Git.

Outputs (all inside content/assets/starter-signs-markings/, all release_ready=false):

  manifest.json          candidate index with verbatim source locators, hashes and unknowns
  faces/<name>.svg       byte-identical copy of the official cleaned renderer SVG
  faces/<name>.json      face frame: SVG-unit -> mm mapping, front/up axes, attachment
  markings/<name>.json   parametric marking geometry resolved into runtime metres

Usage:
  python3 generate.py generate              # rewrite outputs deterministically
  python3 generate.py check                 # regenerate to a temp dir and diff against committed
  python3 generate.py verify-sources --source-dir DIR   # needs PyMuPDF; checks the original PDFs
"""

from __future__ import annotations

import argparse
import copy
import filecmp
import hashlib
import json
import re
import shutil
import sys
import tempfile
from pathlib import Path
from typing import Any

HERE = Path(__file__).resolve().parent
REPO_ROOT = HERE.parents[2]
GENERATOR_VERSION = 1
CANDIDATE_SCHEMA_VERSION = 1
CONTRACT_VERSION = 1

MANDATORY_MANIFEST = "assets/sg/mandatory/manifest.json"
MARKINGS_MANIFEST = "assets/sg/markings/manifest.json"

PT_TO_MM = 25.4 / 72.0

# Asset local frame (matches packages/contracts fixtures FACE_FRONT / FACE_UP): the readable side
# of a sign face looks along -Y; +Z is up; +X is the observer's right when reading the face.
FACE_FRONT = [0.0, -1.0, 0.0]
FACE_UP = [0.0, 0.0, 1.0]

# Marking local frame: x follows the painted row direction, y separates rows, origin at the start of
# row 0 on its outer paint edge. The caller rotates/translates this frame onto the world anchor.
MARKING_FRAME = {
    "x": "along the painted row (transverse to travel for control lines, along travel for centre lines)",
    "y": "perpendicular to the row within the road plane; row 0 sits at y = 0, further rows at +y",
    "origin": "outer paint edge of row 0 at the row start",
    "units": "m",
}

SIGN_FACES: list[dict[str, Any]] = [
    {
        "candidate_id": "sg.dev.starter.face.give-way",
        "output_name": "give-way",
        "source_asset_id": "sg.mandatory.give-way",
        "role": "give_way_sign",
        "shape": "triangle_point_down",
        "control_regimes": ["give_way"],
        "starter_layouts": ["sg.world.dev.give-way-t-junction"],
        "expected_vector_mm": {
            "backing_width": 600,
            "backing_height": 600,
            "triangle_width": 560,
        },
    },
    {
        "candidate_id": "sg.dev.starter.face.stop",
        "output_name": "stop",
        "source_asset_id": "sg.mandatory.stop",
        "role": "stop_sign",
        "shape": "octagon",
        "control_regimes": ["stop"],
        "starter_layouts": ["sg.world.dev.stop-development-access"],
        "expected_vector_mm": {
            "backing_width": 600,
            "backing_height": 600,
            "octagon_width": 560,
        },
    },
]

MARKINGS: list[dict[str, Any]] = [
    {
        "candidate_id": "sg.dev.starter.marking.give-way-line-d",
        "output_name": "give-way-line-d",
        "source_asset_id": "sg.markings.control-give-way-d",
        "role": "give_way_line",
        "orientation": "transverse",
        "attaches_to": "control_line",
        "control_regimes": ["give_way"],
        "starter_layouts": ["sg.world.dev.give-way-t-junction"],
        "sample_painted_segments_per_row": 2,
        "semantic_notes": [
            "Two broken transverse rows form ONE Give Way line; a single row is a different marking.",
            "Row 0 is the row nearest approaching traffic; row 1 lies 150 mm clear beyond it.",
        ],
        "expected_vector_mm": {
            "width": 100,
            "painted_length": 1000,
            "clear_gap": 1000,
            "inter_row_clear_gap": 150,
            "rows": 2,
        },
    },
    {
        "candidate_id": "sg.dev.starter.marking.stop-line-j",
        "output_name": "stop-line-j",
        "source_asset_id": "sg.markings.control-stop-j",
        "role": "stop_line",
        "orientation": "transverse",
        "attaches_to": "control_line",
        "control_regimes": ["stop", "signalised"],
        "starter_layouts": [
            "sg.world.dev.stop-development-access",
            "sg.world.dev.signalised-right-arrow",
        ],
        "sample_painted_segments_per_row": 1,
        "semantic_notes": [
            "RMS2 J is a single 300 mm continuous white line used BOTH along expressways adjacent to paved shoulders AND as stop lines.",
            "This candidate carries only the stop_line role; the paved-shoulder use is sg.markings.edge-paved-shoulder-j and is deliberately not a starter candidate.",
        ],
        "expected_vector_mm": {"width": 300, "rows": 1},
    },
    {
        "candidate_id": "sg.dev.starter.marking.centre-broken-e",
        "output_name": "centre-broken-e",
        "source_asset_id": "sg.markings.centre-broken-two-way-e",
        "role": "centre_line",
        "orientation": "longitudinal",
        "attaches_to": "road_centreline",
        "control_regimes": ["give_way", "stop", "signalised"],
        "starter_layouts": [
            "sg.world.dev.give-way-t-junction",
            "sg.world.dev.stop-development-access",
            "sg.world.dev.signalised-right-arrow",
        ],
        "sample_painted_segments_per_row": 2,
        "semantic_notes": [
            "Two-way carriageway centre line separating the single with-reference and against-reference lanes of every starter road.",
        ],
        "expected_vector_mm": {
            "width": 150,
            "painted_length": 2750,
            "clear_gap": 2750,
            "rows": 1,
        },
    },
    {
        "candidate_id": "sg.dev.starter.marking.centre-continuous-f",
        "output_name": "centre-continuous-f",
        "source_asset_id": "sg.markings.centre-continuous-single-f",
        "role": "centre_line_no_crossing",
        "orientation": "longitudinal",
        "attaches_to": "road_centreline",
        "control_regimes": ["give_way", "stop", "signalised"],
        "starter_layouts": [
            "sg.world.dev.give-way-t-junction",
            "sg.world.dev.stop-development-access",
            "sg.world.dev.signalised-right-arrow",
        ],
        "sample_painted_segments_per_row": 1,
        "semantic_notes": [
            "Continuous two-way centre line for the junction approach lengths where the starter layouts need an uncrossable centre line; also indicates no parking on both sides per RMS2.",
        ],
        "expected_vector_mm": {"width": 150, "rows": 1},
    },
]

# RMS2 vector-measurement scale: the sheet is drawn 1:100, TFM1 is 1:10.
RMS_SCALE = 100
TFM_SCALE = 10

NOT_APPROVED = {
    "release_ready": False,
    "content_approved": False,
    "reuse_approved": False,
    "license_status": "unreviewed",
    "runtime_state": "development_candidate",
}

COMMON_UNKNOWNS_FACE = [
    "mounting height",
    "support family",
    "lateral offset from kerb",
    "physical colour/material specification (source RGB only)",
]
COMMON_UNKNOWNS_MARKING = ["site-specific line extent", "site-specific placement"]


def sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def load_json(relative: str) -> Any:
    return json.loads((REPO_ROOT / relative).read_text(encoding="utf-8"))


def dump_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(value, indent=2, sort_keys=True, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )


def asset_by_id(manifest: dict[str, Any], asset_id: str) -> dict[str, Any]:
    for asset in manifest["assets"]:
        if asset["id"] == asset_id:
            return asset
    raise KeyError(asset_id)


def source_by_id(manifest: dict[str, Any], source_id: str) -> dict[str, Any]:
    for source in manifest["sources"]:
        if source["id"] == source_id:
            return source
    raise KeyError(source_id)


def check_recorded_hashes(asset: dict[str, Any]) -> dict[str, str]:
    """Every original file referenced by the source asset must still match its recorded hash."""
    verified: dict[str, str] = {}
    for file_role, relative in asset["files"].items():
        if relative is None:
            continue
        expected = asset["file_sha256"][file_role]
        actual = sha256_file(REPO_ROOT / relative)
        if actual != expected:
            raise SystemExit(
                f"{asset['id']}: {relative} sha256 {actual} != recorded {expected}"
            )
        verified[file_role] = expected
    return verified


def parse_viewbox(svg_text: str) -> list[float]:
    marker = 'viewBox="'
    start = svg_text.index(marker) + len(marker)
    end = svg_text.index('"', start)
    return [float(v) for v in svg_text[start:end].split()]


def first_path_bbox(svg_text: str) -> list[float]:
    """Bounding box of the first <path d=...> (the cleaned SVGs emit the backing perimeter first)."""
    start = svg_text.index('<path d="') + len('<path d="')
    end = svg_text.index('"', start)
    numbers = [float(t) for t in re.findall(r"-?\d+(?:\.\d+)?", svg_text[start:end])]
    xs, ys = numbers[0::2], numbers[1::2]
    return [round(min(xs), 3), round(min(ys), 3), round(max(xs), 3), round(max(ys), 3)]


def mm(value_m: float) -> float:
    return round(value_m, 6)


def build_face(
    spec: dict[str, Any], mandatory: dict[str, Any], out_dir: Path
) -> dict[str, Any]:
    asset = asset_by_id(mandatory, spec["source_asset_id"])
    hashes = check_recorded_hashes(asset)
    source = source_by_id(mandatory, asset["source"]["source_id"])

    svg_src = REPO_ROOT / asset["files"]["renderer_svg"]
    svg_out = out_dir / "faces" / f"{spec['output_name']}.svg"
    svg_out.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(svg_src, svg_out)
    svg_text = svg_out.read_text(encoding="utf-8")
    viewbox = parse_viewbox(svg_text)
    backing_bbox = first_path_bbox(svg_text)

    backing_w = asset["dimensions_mm"]["backing_width"]["value"]
    backing_h = asset["dimensions_mm"]["backing_height"]["value"]
    # The cleaned SVG keeps PDF user units (1 unit = 1 pt on a 1:10 sheet => 10 pt-mm = 3.5278 mm).
    unit_to_mm = round(PT_TO_MM * TFM_SCALE, 6)
    face_bbox = asset["extraction"]["face_bbox_pdf_points"]

    face_json = {
        "schema_version": CANDIDATE_SCHEMA_VERSION,
        "candidate_id": spec["candidate_id"],
        "source_asset_id": asset["id"],
        "kind": "sign_face",
        "role": spec["role"],
        "shape": spec["shape"],
        "artwork": {
            "file": f"faces/{spec['output_name']}.svg",
            "sha256": hashes["renderer_svg"],
            "identical_to": asset["files"]["renderer_svg"],
            "viewbox_user_units": viewbox,
            "backing_perimeter_bbox_user_units": backing_bbox,
            "backing_perimeter_extent_mm": [
                round((backing_bbox[2] - backing_bbox[0]) * unit_to_mm, 1),
                round((backing_bbox[3] - backing_bbox[1]) * unit_to_mm, 1),
            ],
            "user_unit_to_mm": unit_to_mm,
            "note": "Byte-identical copy of the official cleaned extraction; no redraw, no fonts substituted.",
        },
        "face_mm": {
            "width": backing_w,
            "height": backing_h,
            "width_endpoints": asset["dimensions_mm"]["backing_width"]["endpoints"],
            "height_endpoints": asset["dimensions_mm"]["backing_height"]["endpoints"],
            "viewbox_extent_mm": [
                round(viewbox[2] * unit_to_mm, 1),
                round(viewbox[3] * unit_to_mm, 1),
            ],
            "extent_note": "viewBox includes a transparent margin around the 600x600 backing; map the backing perimeter, not the viewBox, to the face quad.",
        },
        "face_m": {"width": mm(backing_w / 1000), "height": mm(backing_h / 1000)},
        "axes": {
            "front": FACE_FRONT,
            "up": FACE_UP,
            "right": [1.0, 0.0, 0.0],
            "note": "Readable side faces -Y of the asset frame; the world pose yaw turns -Y onto the approach heading's reverse so approaching drivers read the face. Never camera-facing.",
        },
        "attachments": [
            {
                "name": "back_centre",
                "offset_mm": {"x": 0, "y": 0, "z": 0},
                "accepts": ["support"],
                "semantics": "Centre of the rear of the backing plate; the face centre is at the same point on the front side.",
            }
        ],
        "source": {
            "locator": asset["source"],
            "face_bbox_pdf_points": face_bbox,
            "pdf": {
                "id": source["id"],
                "url": source["url"],
                "sha256": source["sha256"],
                "page_count": source["page_count"],
            },
            "date_of_issue": "APR 2014",
            "sheet": "1 OF 2",
            "scale": "1:10",
        },
        "meaning_source": asset["traffic_rule"],
        "verification": {
            "locator_visually_verified": True,
            "vector_measurements_expected_mm": spec["expected_vector_mm"],
            "method": "generate.py verify-sources re-opens the hash-pinned PDF and measures the backing/paint path bounds at 1:10.",
        },
        "review": {
            "status": asset["review"]["status"],
            "warnings": asset["review"]["warnings"],
        },
        "unknowns": COMMON_UNKNOWNS_FACE,
        **NOT_APPROVED,
    }
    dump_json(out_dir / "faces" / f"{spec['output_name']}.json", face_json)
    return {
        "candidate_id": spec["candidate_id"],
        "kind": "sign_face",
        "role": spec["role"],
        "source_asset_id": asset["id"],
        "files": {
            "svg": f"faces/{spec['output_name']}.svg",
            "json": f"faces/{spec['output_name']}.json",
        },
        "source_locator": asset["source"],
        "control_regimes": spec["control_regimes"],
        "starter_layouts": spec["starter_layouts"],
        "original_file_sha256": hashes,
        **NOT_APPROVED,
    }


def marking_rectangles(
    params: dict[str, Any], rows: int, segments: int
) -> list[dict[str, float]]:
    """Axis-aligned paint rectangles (m) in the marking frame for a sample extent."""
    width = params["width"] / 1000
    painted = (params.get("painted_length") or 0) / 1000
    gap = (params.get("clear_gap") or 0) / 1000
    row_gap = (params.get("inter_row_clear_gap") or 0) / 1000
    rects = []
    for row in range(rows):
        y0 = row * (width + row_gap)
        for seg in range(segments):
            x0 = seg * (painted + gap)
            rects.append(
                {
                    "row": row,
                    "x0": mm(x0),
                    "y0": mm(y0),
                    "x1": mm(x0 + painted),
                    "y1": mm(y0 + width),
                }
            )
    return rects


def build_marking(
    spec: dict[str, Any], markings: dict[str, Any], out_dir: Path
) -> dict[str, Any]:
    asset = asset_by_id(markings, spec["source_asset_id"])
    hashes = check_recorded_hashes(asset)
    source = source_by_id(markings, asset["source"]["source_id"])
    geometry = load_json(asset["files"]["geometry_json"])
    params = geometry["parameters_mm"]
    rows = geometry["rows"]
    continuous = "painted_length" not in params

    if continuous:
        # Sample extent only: the real extent comes from the anchor polyline at placement time.
        sample_len_mm = geometry["display_sample"]["continuous_sample_length_mm"]
        sample_params = {**params, "painted_length": sample_len_mm, "clear_gap": 0}
        rectangles = marking_rectangles(sample_params, rows, 1)
    else:
        rectangles = marking_rectangles(
            params, rows, spec["sample_painted_segments_per_row"]
        )

    total_width_mm = rows * params["width"] + (rows - 1) * (
        params.get("inter_row_clear_gap") or 0
    )
    stroke = {
        "rows": rows,
        "width_m": mm(params["width"] / 1000),
        "continuous": continuous,
        "painted_length_m": None if continuous else mm(params["painted_length"] / 1000),
        "clear_gap_m": None if continuous else mm(params["clear_gap"] / 1000),
        "inter_row_clear_gap_m": mm(params["inter_row_clear_gap"] / 1000)
        if rows > 1
        else None,
        "period_m": None
        if continuous
        else mm((params["painted_length"] + params["clear_gap"]) / 1000),
        "total_transverse_width_m": mm(total_width_mm / 1000),
        "extent_m": None,
        "extent_note": "Extent along x is supplied by the placing anchor (control-line polyline or centreline segment); the sample rectangles are illustrative only.",
    }

    marking_json = {
        "schema_version": CANDIDATE_SCHEMA_VERSION,
        "candidate_id": spec["candidate_id"],
        "source_asset_id": asset["id"],
        "kind": "road_marking",
        "role": spec["role"],
        "orientation": spec["orientation"],
        "attaches_to": spec["attaches_to"],
        "semantic_notes": spec["semantic_notes"],
        "parameters_mm": params,
        "measurement_evidence": geometry["measurement_evidence"],
        "derived_row_centre_spacing_mm": geometry.get("derived_row_centre_spacing_mm"),
        "colour": geometry["color"],
        "frame": MARKING_FRAME,
        "stroke_m": stroke,
        "sample_rectangles_m": rectangles,
        "sample_note": "Rectangles are generated from parameters_mm for a short sample; renderers should tile stroke_m along the anchor instead of using these directly.",
        "source": {
            "locator": asset["source"],
            "pdf": {
                "id": source["id"],
                "url": source["url"],
                "sha256": source["sha256"],
                "page_count": source["page_count"],
            },
            "date_of_issue": "APR 2014",
            "revision_history": {"A": "OCT 2015", "B": "SEP 2017"},
            "sheet": "2 OF 3",
            "scale": "1:100",
            "description_on_sheet": spec.get("description_on_sheet"),
        },
        "original_geometry": {
            "file": asset["files"]["geometry_json"],
            "sha256": hashes["geometry_json"],
            "renderer_svg": asset["files"]["renderer_svg"],
            "renderer_svg_sha256": hashes["renderer_svg"],
        },
        "verification": {
            "locator_visually_verified": True,
            "vector_measurements_expected_mm": spec["expected_vector_mm"],
            "method": "generate.py verify-sources re-opens the hash-pinned RMS PDF and measures the white fill rectangles inside bbox_pdf_points at 1:100.",
        },
        "review": {
            "status": asset["review"]["status"],
            "warnings": asset["review"]["warnings"],
        },
        "unknowns": geometry["unknown"]
        if geometry.get("unknown")
        else COMMON_UNKNOWNS_MARKING,
        **NOT_APPROVED,
    }
    dump_json(out_dir / "markings" / f"{spec['output_name']}.json", marking_json)
    return {
        "candidate_id": spec["candidate_id"],
        "kind": "road_marking",
        "role": spec["role"],
        "source_asset_id": asset["id"],
        "files": {"json": f"markings/{spec['output_name']}.json"},
        "source_locator": asset["source"],
        "control_regimes": spec["control_regimes"],
        "starter_layouts": spec["starter_layouts"],
        "original_file_sha256": hashes,
        **NOT_APPROVED,
    }


SHEET_DESCRIPTIONS = {
    "sg.markings.control-give-way-d": "Two parallel white lines indicate that traffic approaching these lines is to give way to oncoming traffic either on the left or right.",
    "sg.markings.control-stop-j": "This continuous white line is used along expressway adjacent to paved shoulder and also as stop lines.",
    "sg.markings.centre-broken-two-way-e": "These white lines are used as centre lines on a two-way carriageway.",
    "sg.markings.centre-continuous-single-f": "This continuous white line is used as a centre line on a two-way carriageway and also indicates no parking on both sides.",
}


def generate(out_dir: Path) -> dict[str, Any]:
    mandatory = load_json(MANDATORY_MANIFEST)
    markings = load_json(MARKINGS_MANIFEST)
    for d in ("faces", "markings"):
        if (out_dir / d).exists():
            shutil.rmtree(out_dir / d)

    entries = [build_face(spec, mandatory, out_dir) for spec in SIGN_FACES]
    for spec in MARKINGS:
        spec = copy.deepcopy(spec)
        spec["description_on_sheet"] = SHEET_DESCRIPTIONS[spec["source_asset_id"]]
        entries.append(build_marking(spec, markings, out_dir))

    manifest = {
        "schema_version": CANDIDATE_SCHEMA_VERSION,
        "contract_version": CONTRACT_VERSION,
        "generator": {
            "path": "content/assets/starter-signs-markings/generate.py",
            "version": GENERATOR_VERSION,
        },
        "family": "starter-signs-markings",
        "purpose": "DEVELOPMENT runtime candidates for the Give Way, STOP and signalised starter layouts. Not release content.",
        "inputs": {
            "mandatory_manifest": {
                "path": MANDATORY_MANIFEST,
                "sha256": sha256_file(REPO_ROOT / MANDATORY_MANIFEST),
            },
            "markings_manifest": {
                "path": MARKINGS_MANIFEST,
                "sha256": sha256_file(REPO_ROOT / MARKINGS_MANIFEST),
            },
        },
        "sources": {
            src["id"]: {
                "url": src["url"],
                "sha256": src["sha256"],
                "page_count": src["page_count"],
                "publisher": src["publisher"],
                "collection_revision": src.get("collection_revision"),
                "retrieved_at": src["retrieved_at"],
            }
            for src in [
                source_by_id(mandatory, "lta-sdre-i-tfm"),
                source_by_id(markings, "lta-sdre-I-rms"),
                source_by_id(markings, "spf-btt-2026"),
            ]
        },
        "source_sheets": {
            "LTA/SDRE14/15/TFM1": {
                "source_id": "lta-sdre-i-tfm",
                "pdf_page": 2,
                "printed_page": "15-1",
                "revision": "-",
                "date_of_issue": "APR 2014",
                "scale": "1:10",
                "title": "TRAFFIC MANDATORY SIGNS (SHEET 1 OF 2)",
            },
            "LTA/SDRE14/8/RMS2": {
                "source_id": "lta-sdre-I-rms",
                "pdf_page": 3,
                "printed_page": "8-2",
                "revision": "B",
                "revision_history": {"A": "OCT 2015", "B": "SEP 2017"},
                "date_of_issue": "APR 2014",
                "scale": "1:100",
                "title": "LANE MARKINGS (SHEET 2 OF 3)",
            },
        },
        "starter_paint_scope": {
            "included": [
                "D give-way line",
                "J stop line",
                "E broken two-way centre line",
                "F continuous single centre line",
            ],
            "excluded": [
                "B/C lane separators: every starter road has one lane per direction, so no same-direction lane separation exists",
                "J paved-shoulder boundary: expressway context, not present in starter layouts",
                "edge lines, yellow lines, zig-zag, bus lane, yellow box: not required by the starter layouts",
            ],
        },
        "candidates": entries,
        "unresolved": [
            "Signalised starter layout stop-line placement relative to signal heads is not settled by RMS2; only the J stroke geometry is supplied.",
            "Whether the starter roads use E (broken) or F (continuous) centre paint near each junction is a layout decision for T1; both strokes are supplied.",
            "Sign face mounting height, support family and lateral offset remain unsourced (schematic post in fixtures).",
        ],
        **NOT_APPROVED,
    }
    dump_json(out_dir / "manifest.json", manifest)
    return manifest


def check(out_dir: Path) -> int:
    with tempfile.TemporaryDirectory() as tmp:
        tmp_dir = Path(tmp)
        generate(tmp_dir)
        differences: list[str] = []
        for path in sorted(tmp_dir.rglob("*")):
            if path.is_dir():
                continue
            rel = path.relative_to(tmp_dir)
            committed = out_dir / rel
            if not committed.exists() or not filecmp.cmp(
                path, committed, shallow=False
            ):
                differences.append(str(rel))
        for path in (
            sorted((out_dir / "faces").rglob("*"))
            + sorted((out_dir / "markings").rglob("*"))
            + [out_dir / "manifest.json"]
        ):
            if path.is_file() and not (tmp_dir / path.relative_to(out_dir)).exists():
                differences.append(f"stale: {path.relative_to(out_dir)}")
    if differences:
        print("candidate outputs are NOT reproducible:\n  " + "\n  ".join(differences))
        return 1
    print("candidate outputs reproduce byte-for-byte")
    return 0


def verify_sources(out_dir: Path, source_dir: Path) -> int:
    try:
        import fitz  # PyMuPDF, pinned in tools/asset_extraction/markings/requirements.txt
    except ImportError:
        print(
            "PyMuPDF (fitz) is required: pip install -r tools/asset_extraction/markings/requirements.txt"
        )
        return 2

    manifest = json.loads((out_dir / "manifest.json").read_text(encoding="utf-8"))
    failures: list[str] = []
    docs: dict[str, Any] = {}
    filenames = {
        "lta-sdre-i-tfm": "tfm.pdf",
        "lta-sdre-I-rms": "rms.pdf",
        "spf-btt-2026": "handbook.pdf",
    }
    for source_id, expected in manifest["sources"].items():
        path = source_dir / filenames[source_id]
        if not path.exists():
            failures.append(f"missing original {path}")
            continue
        actual = sha256_file(path)
        if actual != expected["sha256"]:
            failures.append(f"{path.name}: sha256 {actual} != {expected['sha256']}")
            continue
        doc = fitz.open(path)
        if doc.page_count != expected["page_count"]:
            failures.append(
                f"{path.name}: page_count {doc.page_count} != {expected['page_count']}"
            )
        docs[source_id] = doc
        print(f"{path.name}: sha256 and page count match")

    def measure_white_rects(page: Any, bbox: list[float]) -> list[Any]:
        clip = fitz.Rect(*bbox)
        rects = []
        for drawing in page.get_drawings():
            if drawing["type"] != "f" or drawing.get("fill") != (1.0, 1.0, 1.0):
                continue
            for item in drawing["items"]:
                if item[0] == "re" and clip.contains(item[1]):
                    rects.append(fitz.Rect(item[1]))
        # The sheet paints each stroke twice (overlapping fills offset by ~0.1 pt); keep one per stroke.
        unique: list[Any] = []
        for r in sorted(rects, key=lambda r: (r.y0, r.x0)):
            if not any(abs(r.x0 - u.x0) < 1 and abs(r.y0 - u.y0) < 1 for u in unique):
                unique.append(r)
        return unique

    def row_groups(rects: list[Any]) -> list[list[Any]]:
        groups: list[list[Any]] = []
        for r in rects:
            if groups and abs(r.y0 - groups[-1][0].y0) < 1:
                groups[-1].append(r)
            else:
                groups.append([r])
        return groups

    def approx(actual: float, expected: float, tol: float = 6.0) -> bool:
        return abs(actual - expected) <= tol

    for entry in manifest["candidates"]:
        detail = json.loads(
            (out_dir / entry["files"]["json"]).read_text(encoding="utf-8")
        )
        loc = detail["source"]["locator"]
        doc = docs.get(loc["source_id"])
        if doc is None:
            continue
        page = doc[loc["pdf_page"] - 1]
        expected = detail["verification"]["vector_measurements_expected_mm"]
        if entry["kind"] == "road_marking":
            scale = PT_TO_MM * RMS_SCALE
            rows = row_groups(measure_white_rects(page, loc["bbox_pdf_points"]))
            if len(rows) != expected["rows"]:
                failures.append(
                    f"{entry['candidate_id']}: rows {len(rows)} != {expected['rows']}"
                )
                continue
            first = rows[0][0]
            width = first.height * scale
            if not approx(width, expected["width"]):
                failures.append(
                    f"{entry['candidate_id']}: width {width:.0f} != {expected['width']}"
                )
            if "painted_length" in expected:
                row0 = rows[0]
                length = row0[0].width * scale
                gap = (row0[1].x0 - row0[0].x1) * scale if len(row0) > 1 else None
                if not approx(length, expected["painted_length"]):
                    failures.append(
                        f"{entry['candidate_id']}: painted_length {length:.0f} != {expected['painted_length']}"
                    )
                if gap is None or not approx(gap, expected["clear_gap"]):
                    failures.append(
                        f"{entry['candidate_id']}: clear_gap {gap} != {expected['clear_gap']}"
                    )
            if "inter_row_clear_gap" in expected:
                row_gap = (rows[1][0].y0 - first.y1) * scale
                if not approx(row_gap, expected["inter_row_clear_gap"]):
                    failures.append(
                        f"{entry['candidate_id']}: inter_row_clear_gap {row_gap:.0f} != {expected['inter_row_clear_gap']}"
                    )
            print(f"{entry['candidate_id']}: RMS2 vector geometry matches {expected}")
        else:
            scale = PT_TO_MM * TFM_SCALE
            original = asset_by_id(
                load_json(MANDATORY_MANIFEST), entry["source_asset_id"]
            )
            drawings = page.get_drawings()
            backing = fitz.Rect()
            for index in original["extraction"]["backing_path_indices_zero_based"]:
                backing |= drawings[index]["rect"]
            if not approx(
                backing.width * scale, expected["backing_width"]
            ) or not approx(backing.height * scale, expected["backing_height"]):
                failures.append(
                    f"{entry['candidate_id']}: backing {backing.width * scale:.0f}x{backing.height * scale:.0f} != 600x600"
                )
            face_clip = fitz.Rect(*detail["source"]["face_bbox_pdf_points"])
            paint = [
                d["rect"]
                for d in drawings
                if d["type"] == "f"
                and face_clip.contains(d["rect"])
                and d["rect"].width > 100
            ]
            paint_key = (
                "triangle_width" if "triangle_width" in expected else "octagon_width"
            )
            if not paint or not approx(paint[0].width * scale, expected[paint_key]):
                failures.append(
                    f"{entry['candidate_id']}: main paint width {[round(p.width * scale) for p in paint]} != {expected[paint_key]}"
                )
            print(
                f"{entry['candidate_id']}: TFM1 backing 600x600 and {paint_key} {expected[paint_key]} match"
            )

    if failures:
        print("SOURCE VERIFICATION FAILED:\n  " + "\n  ".join(failures))
        return 1
    print("all original-source checks passed")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("generate")
    sub.add_parser("check")
    verify = sub.add_parser("verify-sources")
    verify.add_argument(
        "--source-dir",
        type=Path,
        required=True,
        help="directory with tfm.pdf, rms.pdf, handbook.pdf (outside Git)",
    )
    args = parser.parse_args(argv)

    if args.command == "generate":
        manifest = generate(HERE)
        print(
            f"wrote {len(manifest['candidates'])} candidates under {HERE.relative_to(REPO_ROOT)}"
        )
        return 0
    if args.command == "check":
        return check(HERE)
    return verify_sources(HERE, args.source_dir)


if __name__ == "__main__":
    sys.exit(main())
