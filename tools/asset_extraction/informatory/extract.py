"""Extract bounded, source-faithful references from hash-pinned official PDFs."""

import argparse
import copy
import csv
import hashlib
import json
import math
import re
import textwrap
import urllib.request
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from pathlib import Path

import pymupdf
from PIL import Image, ImageChops, ImageDraw, ImageStat
from svgpathtools import parse_path

from inventory import upright

ROOT = Path(__file__).resolve().parents[3]
TOOL = "tools/asset_extraction/informatory"
ASSETS = "assets/sg/informatory"
NS = "http://www.w3.org/2000/svg"
SDRE = (
    "https://www.lta.gov.sg/content/dam/ltagov/industry_innovations/"
    "industry_matters/development_construction_resources/Street_Work_Proposals/"
    "Standards_and_Specifications/SDRE/"
)
SOURCES = {
    "TFI": (
        SDRE + "SDRE14-18_TFI_1-19_March_2026.pdf",
        "d442e677ba3596e487027ef9859c718e39dcc60fac0eff313c0bbf3662d870fd",
        "LTA", 21,
    ),
    "TFS": (
        SDRE + "SDRE14-19_TFS_1-2_March_2026.pdf",
        "d07fb4f6731c10a30024eaf15481c66adf36e89beff1e8de4359c3cd0ff65a2b",
        "LTA", 3,
    ),
    "contents": (
        SDRE + "Content_Page_March_2026.pdf",
        "90ceee831a33fd99bdf00cc2f6d20603382fc69e10d1ea1ea3a82db4c9b6ea42",
        "LTA", 7,
    ),
    "TP": (
        "https://www.police.gov.sg/-/media/SPF/Advisories/TP/BT-ENG-2126.pdf",
        "4f258856a25b8d0a44e9091f361ce0a07e24138b9a8515620936d088d3c7cefa",
        "Singapore Police Force / Traffic Police", 90,
    ),
}
REVISIONS = {
    "TFI": ["A", "B", "A", "A", "A", "A", "A", "A", "A", "A",
            "B", "B", "A", "A", "B", "A", "A", "A", "A"],
    "TFS": ["-", "-"],
}
SPECIAL_WARNINGS = {
    "bus-lane-full-day-source-hours": (
        "CONFLICT: source artwork says 07:30-20:00 Mon-Sat; TP 2026 "
        "PDF p41, printed p40, section 54(b) says 07:30-23:00 Mon-Sat, "
        "except Sundays and public holidays. Source preserved; NEVER release "
        "this as a current operating-hours asset."
    ),
    "police-post-right": "The source contains an NPP LOGO placeholder, not a completed logo.",
    "pek-kio-community-centre-right": (
        "The source contains a P.A. LOGO placeholder, not a completed logo."
    ),
    "height-limit-4p5m-one-lane-reference": (
        "HEIGHT LIMIT SIGN is a placeholder; the depicted board is a layout reference."
    ),
    "height-limit-4p5m-multilane-reference": (
        "HEIGHT LIMIT SIGN placeholders and a/b/c spacing are unresolved; "
        "2/3/4/5-lane parameter variants have not been generated."
    ),
    "kerb-strip-marker-reference": (
        "Kerb assembly reference; dimensional/installation geometry is not transcribed."
    ),
}
ET.register_namespace("", NS)


@dataclass(frozen=True)
class Recipe:
    slug: str
    name: str
    source: str
    page: int
    bbox: tuple[float, float, float, float]
    kind: str


@dataclass
class SourcePath:
    element: ET.Element
    rect: pymupdf.Rect
    groups: tuple[ET.Element, ...]


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def write_json(path: Path, value: object) -> None:
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n")


def read_recipes() -> list[Recipe]:
    with (ROOT / TOOL / "recipes.csv").open(newline="") as stream:
        return [
            Recipe(
                r["slug"], r["name"], r["source"], int(r["pdf_page"]),
                (float(r["x0"]), float(r["y0"]), float(r["x1"]), float(r["y1"])),
                r["kind"],
            )
            for r in csv.DictReader(stream)
        ]


def source_id(name: str) -> str:
    return "tp-btt-2026" if name == "TP" else f"lta-sdre-i-2026-{name.lower()}"


def drawing_info(name: str, page: int) -> tuple[str, str, str] | None:
    offset = 2 if name == "TFI" else 1
    if name not in REVISIONS or page <= offset:
        return None
    sheet = page - offset
    chapter = 18 if name == "TFI" else 19
    return (
        f"LTA/SDRE14/{chapter}/{name}{sheet}",
        REVISIONS[name][sheet - 1],
        f"{chapter}-{sheet}",
    )


def source_paths(page: pymupdf.Page) -> tuple[list[SourcePath], ET.Element]:
    svg = ET.fromstring(page.get_svg_image(text_as_path=True))
    found: list[tuple[ET.Element, tuple[ET.Element, ...]]] = []

    def walk(element: ET.Element, groups: tuple[ET.Element, ...]) -> None:
        tag = element.tag.rsplit("}", 1)[-1]
        if tag == "defs":
            return
        if tag == "path":
            found.append((element, groups))
            return
        if tag == "g":
            assert set(element.attrib) <= {"clip-path"}, element.attrib
            groups = (*groups, element)
        else:
            assert tag == "svg", tag
        for child in element:
            walk(child, groups)

    walk(svg, ())
    drawings = page.get_drawings()
    assert len(found) == len(drawings), "Cannot align SVG paths with PDF drawings"
    return [
        SourcePath(element, drawing["rect"], groups)
        for (element, groups), drawing in zip(found, drawings)
    ], svg


def path_rect(data: str, transform: str) -> pymupdf.Rect:
    path = parse_path(data)
    if not path:
        return pymupdf.Rect()
    x0, x1, y0, y1 = path.bbox()
    match = re.fullmatch(r"matrix\(([^)]+)\)", transform)
    assert match, transform
    values = [float(v) for v in re.split(r"[,\s]+", match[1])]
    assert len(values) == 6
    matrix = pymupdf.Matrix(*values)
    return pymupdf.Rect(x0, y0, x1, y1) * matrix


def overlaps(left: pymupdf.Rect, right: pymupdf.Rect) -> bool:
    return (
        left.x1 >= right.x0 and left.x0 <= right.x1
        and left.y1 >= right.y0 and left.y0 <= right.y1
    )


def svg_root(box: pymupdf.Rect) -> tuple[ET.Element, ET.Element]:
    root = ET.Element(f"{{{NS}}}svg", {
        "version": "1.1",
        "width": f"{box.width:g}pt", "height": f"{box.height:g}pt",
        "viewBox": f"0 0 {box.width:g} {box.height:g}",
    })
    group = ET.SubElement(root, f"{{{NS}}}g", {
        "transform": f"translate({-box.x0:g},{-box.y0:g})",
    })
    return root, group


def render_svg(root: ET.Element, alpha: bool = False) -> Image.Image:
    with pymupdf.open(stream=ET.tostring(root), filetype="svg") as document:
        pix = document[0].get_pixmap(matrix=pymupdf.Matrix(2, 2), alpha=alpha)
        return Image.frombytes("RGBA" if alpha else "RGB", (pix.width, pix.height), pix.samples)


def has_ink(data: str, element: ET.Element, box: pymupdf.Rect) -> bool:
    root, group = svg_root(box)
    child = copy.deepcopy(element)
    child.set("d", data)
    group.append(child)
    image = render_svg(root, alpha=True)
    return image.getchannel("A").getextrema()[1] > 0


def isolate_svg(
    paths: list[SourcePath], source_svg: ET.Element, box: pymupdf.Rect,
) -> tuple[ET.Element | None, int, str | None]:
    root, group = svg_root(box)
    defs = ET.Element(f"{{{NS}}}defs")
    definitions = {
        element.attrib["id"]: element for element in source_svg.iter()
        if "id" in element.attrib
    }
    needed: set[str] = set()
    count = 0
    local = box + (-20, -20, 20, 20)
    for source in paths:
        if not overlaps(source.rect + (-2, -2, 2, 2), box):
            continue
        data = source.element.attrib["d"]
        assert data.startswith("M") and "m" not in data
        parts = re.findall(r"M[^M]+", data)
        selected = []
        for part in parts:
            rect = path_rect(part, source.element.attrib.get("transform", "matrix(1,0,0,1,0,0)"))
            if not overlaps(rect + (-2, -2, 2, 2), box):
                continue
            if not local.contains(rect):
                if not has_ink(part, source.element, box):
                    continue
                return None, 0, "Boundary-crossing source subpath exceeds the 20pt locality guard."
            selected.append(part)
        if not selected:
            continue
        target = group
        for ancestor in source.groups:
            target = ET.SubElement(target, ancestor.tag, ancestor.attrib)
            match = re.fullmatch(r"url\(#([^)]+)\)", ancestor.attrib["clip-path"])
            assert match
            needed.add(match[1])
        child = copy.deepcopy(source.element)
        child.set("d", "".join(selected))
        target.append(child)
        count += len(selected)
    for identifier in sorted(needed):
        element = definitions[identifier]
        assert element.tag == f"{{{NS}}}clipPath"
        assert len(list(element.iter())) <= 3
        defs.append(copy.deepcopy(element))
    if needed:
        root.insert(0, defs)
    assert count
    return root, count, None


def contact_sheet(images: list[tuple[str, Path]], output: Path) -> None:
    columns, width, height = 5, 340, 320
    sheet = Image.new("RGB", (columns * width, math.ceil(len(images) / columns) * height), "#eeeeee")
    draw = ImageDraw.Draw(sheet)
    for index, (label, path) in enumerate(images):
        x, y = index % columns * width, index // columns * height
        image = Image.open(path).convert("RGB")
        image.thumbnail((width - 20, height - 60), Image.Resampling.LANCZOS)
        sheet.paste(image, (x + (width - image.width) // 2, y + 5))
        draw.multiline_text((x + 10, y + height - 48), textwrap.fill(label, 46), fill="black")
    sheet.save(output)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--sources", type=Path, required=True)
    parser.add_argument("--review", type=Path, required=True)
    parser.add_argument("--output", type=Path, default=ROOT / ASSETS)
    parser.add_argument("--download", action="store_true")
    args = parser.parse_args()
    args.sources.mkdir(parents=True, exist_ok=True)
    args.review.mkdir(parents=True, exist_ok=True)
    (args.output / "reference").mkdir(parents=True, exist_ok=True)
    documents: dict[str, pymupdf.Document] = {}
    sources = []
    coverage = []
    for name, (url, sha, publisher, pages) in SOURCES.items():
        path = args.sources / f"{name}.pdf"
        if args.download and not path.exists():
            urllib.request.urlretrieve(url, path)
        assert digest(path) == sha, f"Source hash mismatch: {path}"
        document = pymupdf.open(path)
        assert len(document) == pages
        documents[name] = document
        sources.append({
            "id": source_id(name), "url": url, "sha256": sha, "publisher": publisher,
            "collection_revision": "I" if name != "TP" else None,
            "edition": "April 2014 / March 2026 collection" if name != "TP" else "Updated 2 January 2026",
            "retrieved_at": "2026-09-14", "page_count": pages,
        })

    recipes = read_recipes()
    assert len({r.slug for r in recipes}) == len(recipes)
    assets = []
    audits = []
    images = []
    expected: set[str] = set()
    cached: dict[tuple[str, int], tuple[list[SourcePath], ET.Element]] = {}
    orientations: dict[tuple[str, int], tuple[int, pymupdf.Matrix]] = {}
    for recipe in recipes:
        key = (recipe.source, recipe.page)
        document = documents[recipe.source]
        original = document[recipe.page - 1]
        if key not in orientations:
            orientations[key] = original.rotation, original.derotation_matrix
        rotation, derotate = orientations[key]
        box = pymupdf.Rect(recipe.bbox)
        unrotated = box * derotate
        page = upright(document, recipe.page - 1)
        assert page.rect.contains(box) and box.width > 0 and box.height > 0
        info = drawing_info(recipe.source, recipe.page)
        assert info
        drawing, revision, printed = info
        base = f"{ASSETS}/reference/{recipe.slug}"
        png_path = args.output / "reference" / f"{recipe.slug}.png"
        pix = page.get_pixmap(matrix=pymupdf.Matrix(2, 2), clip=box, alpha=False)
        png_path.write_bytes(pix.tobytes("png"))
        reference = Image.open(png_path).convert("RGB")
        assert reference.size == (int(box.width * 2), int(box.height * 2))
        assert min(ImageStat.Stat(reference).mean) < 248, recipe.slug
        if key not in cached:
            cached[key] = source_paths(page)
        paths, source_svg = cached[key]
        vector, subpaths, fallback = isolate_svg(paths, source_svg, box)
        mean_error = None
        if vector is not None:
            rendered = render_svg(vector)
            assert rendered.size == reference.size
            difference = ImageChops.difference(rendered, reference)
            mean_error = sum(ImageStat.Stat(difference).mean) / 3
            if mean_error > 2:
                fallback = f"SVG/PDF raster mean channel error {mean_error:.6f} exceeds 2/255."
                vector = None
        warnings = [
            "Engineering reference: source dimension leaders, construction ticks and "
            "illustrative legends may remain. Not a cleaned renderer asset.",
            "Artwork extraction does not verify traffic behavior or grant reuse permission.",
        ]
        if recipe.slug in SPECIAL_WARNINGS:
            warnings.append(SPECIAL_WARNINGS[recipe.slug])
        if recipe.source == "TFI" and recipe.page in (10, 11, 12):
            warnings.append("Direction-board legends/content are illustrative, per source sheet notes.")
        if fallback:
            warnings.append("Lossless PNG fallback: " + fallback)
        svg_path = args.output / "reference" / f"{recipe.slug}.svg"
        if vector is not None:
            svg_path.write_bytes(ET.tostring(vector, encoding="utf-8", xml_declaration=True) + b"\n")
            expected.add(base + ".svg")
        elif svg_path.exists():
            svg_path.unlink()
        expected.add(base + ".png")
        conflict = recipe.slug == "bus-lane-full-day-source-hours"
        asset = {
            "id": f"sg.informatory.{recipe.slug}", "name": recipe.name,
            "kind": recipe.kind, "representation": "source_reference",
            "files": {
                "reference_svg": base + ".svg" if vector is not None else None,
                "reference_png": base + ".png", "renderer_svg": None, "geometry_json": None,
            },
            "file_sha256": {
                "reference_png": digest(png_path),
                "reference_svg": digest(svg_path) if vector is not None else None,
            },
            "source": {
                "source_id": source_id(recipe.source), "pdf_page": recipe.page,
                "printed_page": printed, "drawing": drawing, "drawing_revision": revision,
                "bbox_pdf_points": list(recipe.bbox),
                "coordinate_space": "upright PDF display points, top-left origin; rotation normalized",
                "original_page_rotation": rotation, "bbox_unrotated_pdf_points": list(unrotated),
            },
            "extraction": {
                "method": "original PDF crop + bounded original SVG subpaths" if vector is not None else "lossless original PDF crop",
                "tool": "PyMuPDF", "tool_version": pymupdf.VersionBind,
                "recipe": f"{TOOL}/recipes.csv", "recipe_key": recipe.slug,
                "script": f"{TOOL}/extract.py", "png_dpi": 144,
            },
            "review": {"status": "blocked" if conflict else "extracted_reference", "warnings": warnings},
            "dimensions_mm": {}, "license_status": "unreviewed", "release_ready": False,
        }
        assets.append(asset)
        images.append((f"{recipe.source}{recipe.page - (2 if recipe.source == 'TFI' else 1)}: {recipe.slug}", png_path))
        audits.append({
            "id": asset["id"], "source_paths": len(paths), "exported_subpaths": subpaths,
            "svg_pdf_mean_channel_error": mean_error, "fallback": fallback,
            "png_pixels": list(reference.size),
        })
        print(f"{recipe.slug}: {'SVG+PNG' if vector is not None else 'PNG'}", flush=True)

    for name, document in documents.items():
        for index in range(len(document)):
            page_no = index + 1
            info = drawing_info(name, page_no)
            matching = [
                f"sg.informatory.{r.slug}" for r in recipes
                if (r.source, r.page) == (name, page_no)
            ]
            status = "reference_only" if matching or name == "contents" else "not_applicable"
            reason = "Cover/index; no distinct sign faces." if name in REVISIONS else "Outside the assigned TFI/TFS face-extraction scope."
            excluded: list[str] = []
            deferred: list[str] = []
            if matching:
                reason = "All separately drawn bounded faces/layouts on this sheet exported as source references; engineering details are not production geometry."
                if name == "TFI" and page_no in (13, 14):
                    excluded.append("Regions explicitly marked REMOVED contain no current face artwork.")
                if name == "TFI" and page_no == 17:
                    excluded.append("Traffic signal post section, rivets and mounting details are structural.")
                if name == "TFI" and page_no == 12:
                    excluded.append("Corner-radius tables/detail are engineering evidence, not additional sign faces.")
                if name == "TFI" and page_no == 20:
                    deferred.append("2/3/4/5-lane dimensional variants are tabulated, not separately drawn; parametric generation and placeholder replacement deferred.")
                if name == "TFI" and page_no == 21:
                    deferred.append("Kerb strip dimensions/placement are not transcribed into parametric geometry.")
            if name == "contents":
                reason = "Collection cover/general notes/chapter index retained in the hash-pinned original; no informatory faces."
            if name == "TP" and page_no in (2, 22, 41):
                status = "reference_only"
                reason = "Handbook edition / informatory-sign context / section 54 bus-lane schedule evidence; no artwork extracted from handbook."
            coverage.append({
                "source_id": source_id(name), "pdf_page": page_no,
                "drawing": info[0] if info else None,
                "drawing_revision": info[1] if info else None,
                "revision_evidence": "Visually inspected individual sheet title block" if info else None,
                "asset_ids": matching, "status": status, "reason": reason,
                "not_applicable_details": excluded, "deferred_scope": deferred,
            })
    manifest = {
        "schema_version": 1, "family": "informatory",
        "sources": sources, "assets": assets, "coverage": coverage,
        "rules": [{
            "id": "sg.informatory.full-day-bus-lane-operational-hours",
            "timezone": "Asia/Singapore", "days": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
            "start": "07:30", "end": "23:00", "excluded_days": ["Sunday", "public holidays"],
            "source": {"source_id": source_id("TP"), "pdf_page": 41, "printed_page": "40", "section": "54(b)"},
            "scope": "Schedule only; section 54 vehicle exceptions must be incorporated before scenario use.",
            "conflicting_asset_id": "sg.informatory.bus-lane-full-day-source-hours",
            "source_artwork_hours": {"start": "07:30", "end": "20:00"},
            "review_status": "conflict_requires_content_review",
        }],
    }
    write_json(args.output / "manifest.json", manifest)
    for path in (args.output / "reference").iterdir():
        if f"{ASSETS}/reference/{path.name}" not in expected:
            assert path.suffix in (".png", ".svg"), path
            path.unlink()
    write_json(args.review / "export-audit.json", audits)
    contact_sheet(images, args.review / "contact-sheet.png")
    for offset in range(0, len(images), 20):
        contact_sheet(images[offset:offset + 20], args.review / f"contact-{offset // 20 + 1:02d}.png")
    print(json.dumps({
        "assets": len(assets), "svg": sum(a["fallback"] is None for a in audits),
        "png": len(images), "coverage_pages": len(coverage),
    }))


if __name__ == "__main__":
    main()
