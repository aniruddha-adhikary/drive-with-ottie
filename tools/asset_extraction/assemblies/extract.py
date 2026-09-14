"""Extract source references with bounded vectors and lossless raster fallbacks."""

import argparse
import hashlib
import json
from pathlib import Path
import urllib.request
import xml.etree.ElementTree as ET

import pymupdf
from PIL import Image, ImageChops, ImageDraw, ImageStat

from catalog import CROPS, SHEETS, SOURCES, Crop

REPO = Path(__file__).resolve().parents[3]
OUTPUT = REPO / "assets/sg/assemblies"
RECIPE = "tools/asset_extraction/assemblies/catalog.py"
SCALE = 3


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def write_json(path: Path, value: object) -> None:
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n")


def pil_image(pix: pymupdf.Pixmap) -> Image.Image:
    return Image.frombytes("RGB", (pix.width, pix.height), pix.samples)


def view_rect(page: pymupdf.Page, box: tuple[int, int, int, int]) -> pymupdf.Rect:
    x0, y0, x1, y1 = box
    return pymupdf.Rect(
        round(x0 * page.rect.width / 1568),
        round(y0 * page.rect.height / 1109),
        round(x1 * page.rect.width / 1568),
        round(y1 * page.rect.height / 1109),
    )


def bounded_svg(
    page: pymupdf.Page,
    rect: pymupdf.Rect,
    expected: Image.Image,
    excluded: list[pymupdf.Rect],
) -> tuple[str | None, str]:
    width, height = page.rect.width, page.rect.height
    outside = (
        (0, 0, width, rect.y0),
        (0, rect.y1, width, height),
        (0, rect.y0, rect.x0, rect.y1),
        (rect.x1, rect.y0, width, rect.y1),
    )
    for area in outside:
        page.add_redact_annot(pymupdf.Rect(area), fill=None, cross_out=False)
    for area in excluded:
        page.add_redact_annot(area, fill=None, cross_out=False)
    page.apply_redactions(images=1, graphics=2, text=0)
    paths = page.get_drawings()
    if not paths:
        return (
            None,
            "Redaction left no vector paths; retained original lossless raster crop.",
        )
    if any(not rect.contains(path["rect"]) for path in paths):
        return (
            None,
            "A surviving path extends outside crop; retained original lossless raster crop.",
        )
    page.set_cropbox(rect)
    actual = pil_image(
        page.get_pixmap(matrix=pymupdf.Matrix(SCALE, SCALE), alpha=False)
    )
    if actual.size != expected.size:
        return (
            None,
            "Cropped-page raster dimensions differ; retained original lossless raster crop.",
        )
    difference = ImageChops.difference(actual, expected)
    stats = ImageStat.Stat(difference)
    if max(stats.mean) > 0.01 or max(high for _, high in stats.extrema) > 16:
        return (
            None,
            "Removing boundary-crossing paths altered crop pixels; retained original lossless raster crop.",
        )
    svg = page.get_svg_image(text_as_path=True)
    tree = ET.fromstring(svg)
    for node in tree.iter():
        if node.tag.split("}")[-1] in ("script", "image", "foreignObject"):
            return (
                None,
                "SVG contains non-path artwork; retained original lossless raster crop.",
            )
        for key, value in node.attrib.items():
            if "href" in key and not value.startswith("#"):
                return (
                    None,
                    "SVG contains external/embedded image reference; retained original lossless raster crop.",
                )
    return svg, (
        "Original vector paths retained; outside paths removed before SVG generation. "
        f"Crop pixel comparison: maximum channel mean error {max(stats.mean):.6f}/255; "
        "threshold mean <=0.01 and maximum <=16 for PDF coordinate rounding."
    )


def export(crop: Crop, source_dir: Path) -> dict:
    doc = pymupdf.open(source_dir / f"{crop.source}.pdf")
    original = doc[crop.page - 1]
    page_rotation = original.rotation
    unrotate = original.derotation_matrix
    sheet = next(
        (s for s in SHEETS if s.source == crop.source and s.page == crop.page), None
    )
    warnings = list(crop.warnings) + (list(sheet.warnings) if sheet else [])
    svg_path = None
    png = OUTPUT / f"{crop.slug}.png"
    excluded = []
    if crop.image_xref is not None:
        bounds = original.get_image_rects(crop.image_xref)
        assert len(bounds) == 1
        rect = bounds[0]
        pix = pymupdf.Pixmap(doc, crop.image_xref)
        assert pix.alpha == 0 and pix.n == 3
        pix.save(png)
        method = "native_pdf_image_decode_to_lossless_png"
        vector_result = "Source illustration is a raster image; decoded at native resolution without resampling."
    else:
        working = pymupdf.open()
        working.insert_pdf(doc, from_page=crop.page - 1, to_page=crop.page - 1)
        page = working[0]
        page.remove_rotation()
        assert crop.box is not None
        rect = view_rect(page, crop.box)
        excluded = [view_rect(page, box) for box in crop.excluded_context]
        assert page.rect.contains(rect)
        pix = page.get_pixmap(
            matrix=pymupdf.Matrix(SCALE, SCALE), clip=rect, alpha=False
        )
        expected = pil_image(pix)
        for area in excluded:
            assert rect.contains(area)
            box = (
                int((area.x0 - rect.x0) * SCALE),
                int((area.y0 - rect.y0) * SCALE),
                int((area.x1 - rect.x0) * SCALE),
                int((area.y1 - rect.y0) * SCALE),
            )
            expected.paste("white", box)
        expected.save(png)
        if excluded:
            warnings.append(
                "Recorded masks remove only neighboring, unrelated diagram/callout fragments; target artwork is unchanged."
            )
        if page.get_images():
            method = "lossless_rendered_pdf_crop"
            vector_result = (
                "Source page contains raster image tiles; no vector version fabricated."
            )
        else:
            svg, vector_result = bounded_svg(page, rect, expected, excluded)
            method = (
                "bounded_original_vector_paths" if svg else "lossless_rendered_pdf_crop"
            )
            if svg:
                svg_file = OUTPUT / f"{crop.slug}.svg"
                svg_file.write_text(svg)
                svg_path = svg_file.relative_to(REPO).as_posix()
            else:
                warnings.append(vector_result)
        warnings.append(
            "Engineering reference includes dimension leaders/labels; not cleaned production geometry."
        )
        working.close()
    image = Image.open(png).convert("RGB")
    assert image.width > 10 and image.height > 10
    assert max(ImageStat.Stat(image).stddev) > 2, crop.slug
    files = {
        "reference_svg": svg_path,
        "reference_png": png.relative_to(REPO).as_posix(),
        "renderer_svg": None,
        "geometry_json": None,
    }
    source_bounds = rect * unrotate if page_rotation else rect
    return {
        "id": f"sg.assemblies.{crop.slug}",
        "name": crop.name,
        "kind": "signal"
        if crop.source == "tp"
        else (
            "layout_reference" if "layout-plan" in crop.slug else "assembly_reference"
        ),
        "representation": "source_reference",
        "files": files,
        "file_sha256": {
            key: sha256(REPO / value) for key, value in files.items() if value
        },
        "source": {
            "source_id": crop.source,
            "pdf_page": crop.page,
            "printed_page": f"{'10' if crop.source == 'sup' else '11'}-{crop.page - (2 if crop.source == 'sup' else 1)}"
            if sheet
            else str(crop.page - 1),
            "drawing": f"LTA/SDRE14/{'10' if crop.source == 'sup' else '11'}/{sheet.code}"
            if sheet
            else None,
            "drawing_revision": sheet.revision if sheet else None,
            "bbox_pdf_points": list(source_bounds),
            "bbox_coordinate_system": "unrotated PyMuPDF page points; top-left origin; x right, y down",
            "bbox_display_pdf_points": list(rect),
            "original_page_rotation_degrees": page_rotation,
            "image_xref": crop.image_xref,
            "non_subject_context_exclusions_display_pdf_points": [
                list(area) for area in excluded
            ],
        },
        "extraction": {
            "method": method,
            "tool": "PyMuPDF",
            "tool_version": pymupdf.VersionBind,
            "mupdf_version": pymupdf.VersionFitz,
            "recipe": RECIPE,
            "recipe_key": crop.slug,
            "vector_result": vector_result,
            "raster_dpi": None if crop.image_xref else 72 * SCALE,
            "pixel_size": list(image.size),
        },
        "review": {"status": "extracted_reference", "warnings": warnings},
        "dimensions_mm": {},
        "assembly_context": {
            "view": crop.name,
            "support_required": True,
            "mount": None,
            "support_family": None,
            "attachment_anchors_mm": None,
            "face_normal_world": None,
            "intended_observer_or_approach": "approaching traffic"
            if crop.source == "tp"
            else None,
            "reference_context": "Traffic Police signal illustration"
            if crop.source == "tp"
            else (
                "LTA mounting/support engineering reference"
                if crop.source == "sup"
                else "LTA bus-stop infrastructure"
            ),
            "constraint_definitions": "assets/sg/assemblies/assembly-definitions.json",
            "is_3d_model": False,
        },
        "license_status": "unreviewed",
        "release_ready": False,
    }


def make_contacts(assets: list[dict], review: Path) -> None:
    review.mkdir(parents=True, exist_ok=True)
    tiles = []
    for number, asset in enumerate(assets, 1):
        image = Image.open(REPO / asset["files"]["reference_png"]).convert("RGB")
        image.thumbnail((455, 295))
        tile = Image.new("RGB", (480, 360), "white")
        tile.paste(image, ((480 - image.width) // 2, 55 + (295 - image.height) // 2))
        draw = ImageDraw.Draw(tile)
        draw.text(
            (8, 7),
            f"{number:02} {asset['id'].removeprefix('sg.assemblies.')}",
            fill="black",
        )
        source = asset["source"]
        draw.text(
            (8, 25),
            f"{source['source_id']} PDF {source['pdf_page']} / {source['drawing'] or 'TP section 58'}",
            fill="black",
        )
        draw.text(
            (8, 40),
            "VECTOR + PNG" if asset["files"]["reference_svg"] else "PNG REFERENCE",
            fill="black",
        )
        tiles.append(tile)
    all_sheet = Image.new("RGB", (1920, 360 * ((len(tiles) + 3) // 4)), "#ddd")
    for index, tile in enumerate(tiles):
        all_sheet.paste(tile, ((index % 4) * 480, (index // 4) * 360))
    all_sheet.save(review / "assemblies-contact-all.png")
    for start in range(0, len(tiles), 12):
        sheet = Image.new("RGB", (1920, 1080), "#ddd")
        for index, tile in enumerate(tiles[start : start + 12]):
            sheet.paste(tile, ((index % 4) * 480, (index // 4) * 360))
        sheet.save(review / f"assemblies-contact-{start // 12 + 1:02}.png")


def build_coverage(assets: list[dict]) -> list[dict]:
    coverage = []
    for source in SOURCES:
        for page in range(1, int(source["page_count"]) + 1):
            sheet = next(
                (s for s in SHEETS if s.source == source["id"] and s.page == page), None
            )
            ids = [
                a["id"]
                for a in assets
                if a["source"]["source_id"] == source["id"]
                and a["source"]["pdf_page"] == page
            ]
            if ids:
                status = "reference_only"
                reason = "Named illustrations exported; source references only."
            elif sheet:
                status = "not_applicable"
                reason = sheet.remainder
            elif source["id"] == "tp":
                status = "not_applicable"
                reason = (
                    "Outside assigned signal-example scope (printed 44–46 / PDF 45–47)."
                )
            else:
                status = "not_applicable"
                reason = "Collection cover, contents or general notes; no individual mounting artwork."
            entry = {
                "source_id": source["id"],
                "pdf_page": page,
                "drawing": f"LTA/SDRE14/{'10' if source['id'] == 'sup' else '11'}/{sheet.code}"
                if sheet
                else None,
                "drawing_revision": sheet.revision if sheet else None,
                "title": sheet.title if sheet else None,
                "asset_ids": ids,
                "status": status,
                "reason": reason,
                "remaining_scope": sheet.remainder
                if sheet
                else (
                    "Road-stud photos/section 59 excluded; all three signal examples exported."
                    if source["id"] == "tp" and page == 47
                    else None
                ),
                "warnings": list(sheet.warnings) if sheet else [],
                "remaining_scope_status": "deferred"
                if sheet and ids
                else "not_applicable",
                "deferred_vector_asset_ids": [
                    a["id"]
                    for a in assets
                    if a["id"] in ids
                    and "retained original lossless raster crop"
                    in a["extraction"]["vector_result"]
                ],
            }
            coverage.append(entry)
    return coverage


def make_definitions(assets: list[dict], sources: Path) -> dict:
    spec = json.loads((Path(__file__).parent / "definitions.json").read_text())
    index = {a["id"]: a for a in assets}
    evidence_text = (Path(__file__).parent / "rule11-web-text.txt").read_text()
    normalized = " ".join(evidence_text.split())
    extra_evidence = {
        "mount-low-roadside": (
            "sup",
            6,
            (108, 930, 985, 1070),
            "SUP4 notes, including note 9",
        ),
        "mount-height-limit-rail": (
            "sup",
            16,
            (1050, 930, 1240, 1070),
            "SUP14 title: 4.5m height limit sign, 900mm × 900mm",
        ),
        "mount-height-limit-wall": (
            "sup",
            16,
            (1050, 930, 1240, 1070),
            "SUP14 title: 4.5m height limit sign, 900mm × 900mm",
        ),
        "bus-stop-information": (
            "bus",
            6,
            (108, 930, 574, 1070),
            "BUS5 notes 1–6; pole location subject to LTA approval",
        ),
    }
    for definition in spec["definitions"]:
        definition["release_ready"] = False
        definition["license_status"] = "unreviewed"
        definition["source_evidence"] = []
        for asset_id in definition["source_assets"]:
            definition["source_evidence"].append(index[asset_id]["source"])
            index[asset_id].setdefault("assembly_definition_ids", []).append(
                definition["id"]
            )
        for citation in definition.get("rule_evidence", []):
            for quote in citation["quotes"]:
                assert " ".join(quote.split()) in normalized, quote
        key = definition["id"].removeprefix("sg.assemblies.definition.")
        if key in extra_evidence:
            source_id, page_number, box, label = extra_evidence[key]
            with pymupdf.open(sources / f"{source_id}.pdf") as doc:
                page = doc[page_number - 1]
                rect = view_rect(page, box)
                definition["source_evidence"].append(
                    {
                        "source_id": source_id,
                        "pdf_page": page_number,
                        "bbox_pdf_points": list(rect * page.derotation_matrix),
                        "bbox_display_pdf_points": list(rect),
                        "bbox_coordinate_system": "unrotated PyMuPDF page points; top-left origin; x right, y down",
                        "detail": label,
                    }
                )
    spec["source_locator_note"] = (
        "Source-evidence rectangles locate the reference diagrams. SUP14 sign size "
        "900 × 900 is in its title block; BUS5 pole approval is in note 6; "
        "SUP4 installation context is in note 9. Those full-page sources remain required."
    )
    return spec


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--sources", type=Path, required=True)
    parser.add_argument("--review", type=Path, required=True)
    parser.add_argument("--download", action="store_true")
    args = parser.parse_args()
    assert pymupdf.VersionBind == "1.26.4"
    args.sources.mkdir(parents=True, exist_ok=True)
    OUTPUT.mkdir(parents=True, exist_ok=True)
    for source in SOURCES:
        path = args.sources / str(source["filename"])
        if not path.exists() and args.download:
            urllib.request.urlretrieve(str(source["url"]), path)
        assert sha256(path) == source["sha256"], f"Source hash mismatch: {path}"
        with pymupdf.open(path) as doc:
            assert len(doc) == source["page_count"]
    previous = OUTPUT / "manifest.json"
    if previous.exists():
        for old in json.loads(previous.read_text())["assets"]:
            for kind in ("reference_svg", "reference_png"):
                relative = old["files"][kind]
                if relative:
                    path = REPO / relative
                    assert (
                        path.parent == OUTPUT
                        and sha256(path) == old["file_sha256"][kind]
                    )
                    path.unlink()
    assert len({c.slug for c in CROPS}) == len(CROPS)
    assets = []
    for crop in CROPS:
        print(f"Extracting {crop.slug}", flush=True)
        assets.append(export(crop, args.sources))
    rule_snapshot = REPO / "tools/asset_extraction/assemblies/rule11-web-text.txt"
    assert (
        sha256(rule_snapshot)
        == "c0ec46b7d0a405fa076383364a7e1e2028a44a300b7cfd57dc0d74564c895f05"
    )
    definitions = make_definitions(assets, args.sources)
    definitions_path = OUTPUT / "assembly-definitions.json"
    write_json(definitions_path, definitions)
    manifest: dict = {
        "schema_version": 1,
        "family": "assemblies",
        "sources": [
            {
                **source,
                "retrieved_at": "2026-09-14",
                "hash_scope": "original downloaded PDF bytes",
            }
            for source in SOURCES
        ],
        "assets": assets,
        "coverage": build_coverage(assets),
        "scope_notes": [
            "SDRE April 2014 edition, collection I March 2026, current on retrieval date.",
            "Collection J is effective 1 March 2027 and was not used.",
            "BUS URL filename says 1–5; original PDF contains BUS1–9.",
            "Dimensions/behaviour are separately cited in assembly-definitions.json; no source crop is a 3D model.",
        ],
    }
    manifest["sources"].append(
        {
            "id": "rule11",
            "url": "https://sso.agc.gov.sg/SL/RTA1961-R33?ProvIds=pr11-&ViewType=Within",
            "publisher": "Singapore Statutes Online / Attorney-General's Chambers",
            "collection_revision": None,
            "retrieved_at": "2026-09-14",
            "sha256": sha256(rule_snapshot),
            "hash_scope": "captured web_get_contents tool text, not original HTML bytes",
            "snapshot_file": rule_snapshot.relative_to(REPO).as_posix(),
            "snapshot_complete": False,
            "notes": "Direct HTTP retrieval returned 403. Official text tool capture ends partway through final green-arrow paragraph; all quoted arrangement, dimension and green-B clauses are present and checked.",
        }
    )
    manifest["coverage"].extend(
        [
            {
                "source_id": "rule11",
                "pdf_page": None,
                "drawing": None,
                "asset_ids": [],
                "status": "reference_only",
                "reason": "Cited legal constraints in assembly-definitions.json; not an image/geometry source.",
            },
            {
                "source_id": "bus",
                "pdf_page": None,
                "drawing": "LTA/SDRE14/11/BUS10",
                "asset_ids": [],
                "status": "deferred",
                "reason": "BUS6 note 10 references BUS10; no BUS10 exists in supplied PDF (which ends at BUS9). Not fetched from a guessed URL.",
            },
        ]
    )
    manifest["assembly_definitions"] = {
        "file": definitions_path.relative_to(REPO).as_posix(),
        "sha256": sha256(definitions_path),
        "count": len(definitions["definitions"]),
        "representation": "cited_constraints; not 3D geometry",
    }
    write_json(OUTPUT / "manifest.json", manifest)
    make_contacts(assets, args.review)
    print(
        f"Exported {len(assets)} assets; {sum(bool(a['files']['reference_svg']) for a in assets)} bounded SVGs."
    )


if __name__ == "__main__":
    main()
