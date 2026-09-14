"""Reproduce reviewed RMS references and separate parameter geometry."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import TypedDict

import pymupdf
from PIL import Image, ImageDraw, ImageFont, ImageOps
from svgpathtools import parse_path

ROOT = Path(__file__).resolve().parents[3]
TOOLS = Path("tools/asset_extraction/markings")
ASSETS = Path("assets/sg/markings")
SVG = "http://www.w3.org/2000/svg"
ET.register_namespace("", SVG)


class Source(TypedDict):
    id: str
    filename: str
    page_count: int
    url: str
    sha256: str
    publisher: str
    collection_revision: str | None
    retrieved_at: str


class Sheet(TypedDict):
    sheet: int
    revision: str
    title: str


class Geometry(TypedDict, total=False):
    width: int
    painted_length: int
    clear_gap: int
    rows: int
    inter_row_clear_gap: int
    color: str
    row_widths: list[int]
    row_colors: list[str]
    shape: str
    diameter: int
    within_group_centre_spacing: int
    between_group_centre_spacing: int
    dots_per_group: int


class RequiredRecipe(TypedDict):
    slug: str
    name: str
    sheet: int
    bbox: list[int]


class Recipe(RequiredRecipe, total=False):
    paint_bbox: list[int]
    colors: list[str]
    geometry: Geometry
    warnings: list[str]
    kind: str
    stroke_width_svg: float
    reference_polygon_pdf_points: list[list[int]]


class Recipes(TypedDict):
    schema_version: int
    family: str
    coordinate_system: str
    dpi: int
    sources: list[Source]
    sheets: list[Sheet]
    assets: list[Recipe]


class Locator(TypedDict):
    source_id: str
    pdf_page: int
    printed_page: str
    drawing: str
    drawing_revision: str
    bbox_pdf_points: list[int]


class Files(TypedDict):
    reference_svg: str | None
    reference_png: str | None
    renderer_svg: str | None
    geometry_json: str | None


class Extraction(TypedDict, total=False):
    method: str
    tool: str
    tool_version: str
    recipe: str
    vector_selection: dict[str, object]


class Review(TypedDict):
    status: str
    warnings: list[str]


class Asset(TypedDict):
    id: str
    name: str
    kind: str
    representation: str
    files: Files
    source: Locator
    extraction: Extraction
    review: Review
    dimensions_mm: dict[str, int]
    license_status: str
    release_ready: bool
    file_sha256: dict[str, str]


class Coverage(TypedDict):
    source_id: str
    pdf_page: int
    drawing: str | None
    asset_ids: list[str]
    status: str
    reason: str
    deferred_items: list[str]
    not_applicable_items: list[str]
    extraction_failures: list[str]


class Citation(TypedDict):
    source_id: str
    pdf_page: int
    printed_page: str
    section: str
    quote: str


class Rule(TypedDict):
    id: str
    asset_ids: list[str]
    citation: Citation


class Rules(TypedDict):
    rules: list[Rule]


class Manifest(TypedDict):
    schema_version: int
    family: str
    sources: list[Source]
    assets: list[Asset]
    coverage: list[Coverage]


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def file_entries(files: Files) -> list[tuple[str, str | None]]:
    return [
        ("reference_png", files["reference_png"]),
        ("reference_svg", files["reference_svg"]),
        ("renderer_svg", files["renderer_svg"]),
        ("geometry_json", files["geometry_json"]),
    ]


def write_json(path: Path, value: object) -> None:
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n")


def source_paths(spec: Recipes, directory: Path, download: bool) -> dict[str, Path]:
    directory.mkdir(parents=True, exist_ok=True)
    paths = {}
    for source in spec["sources"]:
        path = directory / source["filename"]
        if not path.exists() and download:
            urllib.request.urlretrieve(source["url"], path)
        if not path.exists() or digest(path) != source["sha256"]:
            raise ValueError(f"Missing source or hash mismatch: {path}")
        if not path.read_bytes().startswith(b"%PDF"):
            raise ValueError(f"Not an original PDF: {path}")
        with pymupdf.open(path) as document:
            if len(document) != source["page_count"]:
                raise ValueError(f"Unexpected page count: {path}")
        paths[source["id"]] = path
    return paths


def locator(recipe: Recipe, sheets: list[Sheet]) -> Locator:
    n = recipe["sheet"]
    return {
        "source_id": "lta-sdre-I-rms",
        "pdf_page": n + 1,
        "printed_page": f"8-{n}",
        "drawing": f"LTA/SDRE14/8/RMS{n}",
        "drawing_revision": sheets[n - 1]["revision"],
        "bbox_pdf_points": recipe["bbox"],
    }


def svg_root(box: list[int]) -> ET.Element:
    x0, y0, x1, y1 = box
    return ET.Element(
        f"{{{SVG}}}svg",
        {
            "version": "1.1",
            "width": str(x1 - x0),
            "height": str(y1 - y0),
            "viewBox": f"{x0} {y0} {x1 - x0} {y1 - y0}",
        },
    )


def bounds(data: str, transform: str) -> tuple[float, float, float, float]:
    matrix = re.fullmatch(r"matrix\(([^)]+)\)", transform)
    if matrix is None:
        raise ValueError(f"Unsupported source transform: {transform}")
    a, b, c, d, e, f = map(float, re.split(r"[, ]+", matrix[1]))
    if b != 0 or c != 0 or a <= 0 or d <= 0:
        raise ValueError("Only positive axis-aligned source transforms are supported")
    x0, x1, y0, y1 = parse_path(data).bbox()
    return a * x0 + e, d * y0 + f, a * x1 + e, d * y1 + f


def contains(outer: list[int] | tuple[float, ...], inner: tuple[float, ...]) -> bool:
    return (
        outer[0] <= inner[0] <= inner[2] <= outer[2]
        and outer[1] <= inner[1] <= inner[3] <= outer[3]
    )


def inside_polygon(x: float, y: float, points: list[list[int]]) -> bool:
    inside = False
    for (x0, y0), (x1, y1) in zip(points, points[1:] + points[:1], strict=True):
        if (y0 > y) != (y1 > y) and x < (x1 - x0) * (y - y0) / (y1 - y0) + x0:
            inside = not inside
    return inside


def within_selection_polygon(data: str, transform: str, recipe: Recipe) -> bool:
    if "reference_polygon_pdf_points" not in recipe:
        return True
    a, _, _, d, e, f = map(float, re.split(r"[, ]+", transform[7:-1]))
    path = parse_path(data)
    return all(
        inside_polygon(
            a * point.real + e,
            d * point.imag + f,
            recipe["reference_polygon_pdf_points"],
        )
        for segment in path
        for point in (segment.point(i / 32) for i in range(33))
    )


def original_vectors(
    page: pymupdf.Page, recipe: Recipe, path: Path
) -> dict[str, object]:
    root = ET.fromstring(page.get_svg_image())
    clips = {}
    for clip in root.findall(f"./{{{SVG}}}defs/{{{SVG}}}clipPath"):
        children = list(clip)
        if len(children) != 1 or children[0].tag != f"{{{SVG}}}path":
            raise ValueError("Unsupported source clip")
        element = children[0]
        clips[clip.attrib["id"]] = bounds(
            element.attrib["d"], element.attrib["transform"]
        )
    output = svg_root(recipe["paint_bbox"])
    selected = 0
    discarded_crossing = 0

    def visit(element: ET.Element, clip_boxes: list[tuple[float, ...]]) -> None:
        nonlocal selected, discarded_crossing
        if element.tag == f"{{{SVG}}}defs":
            return
        if element.tag == f"{{{SVG}}}g":
            if set(element.attrib) - {"clip-path"}:
                raise ValueError("Unsupported inherited SVG styles")
            clip_id = element.attrib.get("clip-path", "")
            if clip_id:
                clip_boxes = [*clip_boxes, clips[clip_id[5:-1]]]
        if element.tag == f"{{{SVG}}}path":
            fill = element.attrib.get("fill", "#000000")
            stroke = element.attrib.get("stroke")
            if fill not in recipe["colors"] and stroke not in recipe["colors"]:
                return
            if "stroke_width_svg" in recipe and not math.isclose(
                float(element.attrib.get("stroke-width", "0")),
                recipe["stroke_width_svg"],
            ):
                return
            data = element.attrib["d"]
            if "m" in data:
                raise ValueError("Relative moveto would require path normalization")
            parts = re.findall(r"M[^M]+", data)
            keep = []
            for part in parts:
                bbox = bounds(part, element.attrib["transform"])
                if contains(recipe["paint_bbox"], bbox):
                    if not within_selection_polygon(
                        part, element.attrib["transform"], recipe
                    ):
                        continue
                    if not all(contains(clip, bbox) for clip in clip_boxes):
                        raise ValueError("Selected artwork intersects a source clip")
                    keep.append(part)
                elif pymupdf.Rect(bbox).intersects(pymupdf.Rect(recipe["paint_bbox"])):
                    discarded_crossing += 1
            if keep:
                attrs = dict(element.attrib)
                attrs["d"] = "".join(keep)
                ET.SubElement(output, f"{{{SVG}}}path", attrs)
                selected += len(keep)
        for child in element:
            visit(child, clip_boxes)

    visit(root, [])
    if not selected:
        raise ValueError(f"No source paths selected: {recipe['slug']}")
    ET.ElementTree(output).write(path, encoding="utf-8", xml_declaration=True)
    return {
        "method": "Original MuPDF SVG absolute-M subpaths, selected by source paint colour, containment, optional outline stroke width and polygon; source path strings, transforms and paint attributes retained.",
        "bbox_pdf_points": recipe["paint_bbox"],
        "colors": recipe["colors"],
        "selected_subpaths": selected,
        "excluded_boundary_crossing_subpaths": discarded_crossing,
        "dimensions_removed": True,
        "font_substitution": False,
        "hidden_page_content": False,
        "stroke_width_svg": recipe.get("stroke_width_svg"),
    }


def geometry_files(recipe: Recipe, source: Locator, stem: Path) -> dict[str, int]:
    geo = recipe["geometry"]
    if geo.get("shape") == "circle_groups":
        return circle_geometry_files(recipe, source, stem)
    width = geo["width"]
    rows = geo.get("rows", 1)
    row_widths = geo.get("row_widths", [width] * rows)
    row_colors = geo.get("row_colors", [geo["color"]] * rows)
    assert len(row_widths) == len(row_colors) == rows
    row_gap = geo.get("inter_row_clear_gap", 0)
    painted_length = geo.get("painted_length", 4000)
    clear_gap = geo.get("clear_gap", 0)
    repeats = 2 if clear_gap else 1
    length = repeats * painted_length + (repeats - 1) * clear_gap
    height = sum(row_widths) + (rows - 1) * row_gap
    parameters = {
        **(
            {"first_row_width": row_widths[0], "second_row_width": row_widths[1]}
            if "row_widths" in geo
            else {"width": width}
        ),
        **(
            {"painted_length": geo["painted_length"]} if "painted_length" in geo else {}
        ),
        **({"clear_gap": clear_gap} if clear_gap else {}),
        **({"inter_row_clear_gap": row_gap} if rows > 1 else {}),
    }
    endpoints = {
        "width": [
            "paint edge on one side of a row",
            "opposite paint edge of the same row",
        ],
        "painted_length": [
            "start edge of one painted segment",
            "end edge of that segment",
        ],
        "clear_gap": [
            "end edge of a painted segment",
            "start edge of the next painted segment",
        ],
        "inter_row_clear_gap": [
            "inner edge of first row",
            "nearest inner edge of second row",
        ],
        "first_row_width": ["first-row outer paint edge", "first-row inner paint edge"],
        "second_row_width": [
            "second-row inner paint edge",
            "second-row outer paint edge",
        ],
    }
    evidence = [
        {
            "parameter": key,
            "value": value,
            "unit": "mm",
            "measurement_endpoints": endpoints[key],
            "source": source,
            "method": "Visual transcription of printed dimension label; not PDF pixel measurement",
        }
        for key, value in parameters.items()
    ]
    body = svg_root([0, 0, length, height])
    for row in range(rows):
        for index in range(repeats):
            ET.SubElement(
                body,
                f"{{{SVG}}}rect",
                {
                    "x": str(index * (painted_length + clear_gap)),
                    "y": str(sum(row_widths[:row]) + row * row_gap),
                    "width": str(painted_length),
                    "height": str(row_widths[row]),
                    "fill": row_colors[row],
                },
            )
    ET.ElementTree(body).write(
        stem.with_suffix(".svg"), encoding="utf-8", xml_declaration=True
    )
    write_json(
        stem.with_suffix(".json"),
        {
            "schema_version": 1,
            "asset_id": f"sg.markings.{recipe['slug']}",
            "units": "mm",
            "representation": "parametric_geometry",
            "parameters_mm": parameters,
            "rows": rows,
            "measurement_evidence": evidence,
            "derived_row_centre_spacing_mm": sum(row_widths) // 2 + row_gap
            if rows == 2
            else None,
            "row_colors_in_source_order": row_colors,
            "color": {
                "svg": geo["color"],
                "status": "Source PDF display colour; not a physical paint colour specification",
            },
            "display_sample": {
                "painted_segments_per_row": repeats,
                "continuous_sample_length_mm": painted_length
                if not clear_gap
                else None,
                "continuous_sample_length_is_engineering_requirement": False,
                "axis": "x follows painted row; y separates rows",
                "attachment": "Semantic road-frame orientation supplied by caller; source artwork is not mirrored",
            },
            "unknown": ["site-specific line extent", "site-specific placement"],
            "license_status": "unreviewed",
            "release_ready": False,
        },
    )
    return parameters


def circle_geometry_files(
    recipe: Recipe, source: Locator, stem: Path
) -> dict[str, int]:
    geo = recipe["geometry"]
    diameter = geo["diameter"]
    within = geo["within_group_centre_spacing"]
    between = geo["between_group_centre_spacing"]
    count = geo["dots_per_group"]
    group_offset = (count - 1) * within + between
    length = diameter + group_offset + (count - 1) * within
    body = svg_root([0, 0, length, diameter])
    for group in range(2):
        for dot in range(count):
            ET.SubElement(
                body,
                f"{{{SVG}}}circle",
                {
                    "cx": str(diameter / 2 + group * group_offset + dot * within),
                    "cy": str(diameter / 2),
                    "r": str(diameter / 2),
                    "fill": geo["color"],
                },
            )
    parameters = {
        "diameter": diameter,
        "within_group_centre_spacing": within,
        "between_group_centre_spacing": between,
    }
    endpoints = {
        "diameter": ["one edge of circular paint", "opposite edge through its centre"],
        "within_group_centre_spacing": [
            "centre of a dot",
            "centre of the next dot in the same group",
        ],
        "between_group_centre_spacing": [
            "centre of last dot in a group",
            "centre of first dot in the next group",
        ],
    }
    ET.ElementTree(body).write(
        stem.with_suffix(".svg"), encoding="utf-8", xml_declaration=True
    )
    write_json(
        stem.with_suffix(".json"),
        {
            "schema_version": 1,
            "asset_id": f"sg.markings.{recipe['slug']}",
            "units": "mm",
            "representation": "parametric_geometry",
            "shape": "circle_groups",
            "parameters_mm": parameters,
            "dots_per_group": count,
            "measurement_evidence": [
                {
                    "parameter": key,
                    "value": value,
                    "unit": "mm",
                    "measurement_endpoints": endpoints[key],
                    "source": source,
                    "method": "Visual transcription of printed dimension label; not PDF pixel measurement",
                }
                for key, value in parameters.items()
            ],
            "display_sample": {
                "groups": 2,
                "axis": "x follows source group progression",
            },
            "unknown": ["site-specific extent", "site-specific placement"],
            "license_status": "unreviewed",
            "release_ready": False,
        },
    )
    return parameters


def coverage(
    spec: Recipes, paths: dict[str, Path], assets: list[Asset]
) -> list[Coverage]:
    entries: list[Coverage] = []
    by_page: dict[int, list[str]] = {}
    for asset in assets:
        by_page.setdefault(asset["source"]["pdf_page"], []).append(asset["id"])
    for source in spec["sources"]:
        with pymupdf.open(paths[source["id"]]) as doc:
            for i in range(len(doc)):
                n = i + 1
                drawing = None
                ids = []
                status = "not_applicable"
                reason = "Supplementary source page outside the RMS artwork extraction scope."
                deferred: list[str] = []
                not_applicable: list[str] = []
                if source["id"] == "lta-sdre-I-rms":
                    if n == 1:
                        reason = "Chapter cover/index; no individual marking artwork."
                    else:
                        drawing = f"LTA/SDRE14/8/RMS{n - 1}"
                        ids = by_page[n]
                        status = (
                            "extracted"
                            if any(
                                a["source"]["pdf_page"] == n
                                and a["representation"] != "source_reference"
                                for a in assets
                            )
                            else "reference_only"
                        )
                        reason = (
                            f"{spec['sheets'][n - 2]['title']}; individual references exported. "
                            "Notes/title blocks remain in original hash-pinned PDF. "
                            "Only explicitly transcribed primitives have parameter geometry."
                        )
                        if n == 6:
                            reason += " RMS5 multi-head shared outline preserved as layout; isolated heads deferred."
                            deferred.append(
                                "Independent production vectors for the connected multi-head arrows"
                            )
                        if n == 5:
                            deferred.append(
                                "Filled production silhouettes for the original engineering arrow outlines"
                            )
                        if n in [3, 4, 6, 7, 8, 9, 10, 11, 12, 13, 15]:
                            deferred.append(
                                "Clean geometry for complex engineering layouts, profiles or compound markings"
                            )
                        if n == 14:
                            reason += " CAM support/sign engineering and spacing tables are not standalone road paint."
                            not_applicable.append(
                                "CAM sign/support details and radii/spacing tables are outside standalone road-paint assets"
                            )
                elif source["id"] == "lta-sdre-I-contents":
                    if n in [1, 2, 4]:
                        status = "reference_only"
                        reason = "Collection Revision I/date, general units notes, or RMS index; no road-marking artwork."
                    else:
                        reason = "Contents listings for other SDRE families; no markings artwork."
                elif n in [2, 36, 38, 39, 41, 43, 44, 55, 56]:
                    status = "reference_only"
                    reason = "Reviewed edition/reuse notice or marking meaning text; handbook artwork not exported."
                elif 35 <= n <= 44:
                    status = "deferred"
                    reason = "Supplementary handbook illustration page not extracted; RMS is primary artwork scope."
                if source["id"] == "spf-btt-2026" and 35 <= n <= 44:
                    deferred.append(
                        "Handbook illustrations were not extracted; current text is supplemental evidence"
                    )
                entries.append(
                    {
                        "source_id": source["id"],
                        "pdf_page": n,
                        "drawing": drawing,
                        "asset_ids": ids,
                        "status": status,
                        "reason": reason,
                        "deferred_items": deferred,
                        "not_applicable_items": not_applicable,
                        "extraction_failures": [],
                    }
                )
    return entries


def extract(spec: Recipes, paths: dict[str, Path], review_dir: Path) -> Manifest:
    reference_dir = ROOT / ASSETS / "references"
    vector_dir = ROOT / ASSETS / "source-vectors"
    geometry_dir = ROOT / ASSETS / "geometry"
    for directory in [reference_dir, vector_dir, geometry_dir, review_dir]:
        directory.mkdir(parents=True, exist_ok=True)
    assets: list[Asset] = []
    with pymupdf.open(paths["lta-sdre-I-rms"]) as doc:
        inventory = []
        for i, page in enumerate(doc):
            inventory.append(
                {
                    "pdf_page": i + 1,
                    "page_size_points": list(page.rect),
                    "rotation": page.rotation,
                    "drawing_paths": len(page.get_drawings()),
                    "raster_images": len(page.get_images()),
                    "pdf_fonts": len(page.get_fonts()),
                    "text_characters": len(page.get_text()),
                    "sheet": spec["sheets"][i - 1] if i else None,
                }
            )
            page.get_pixmap(matrix=pymupdf.Matrix(1.5, 1.5)).save(
                review_dir / f"source-rms-{i + 1:02}.png"
            )
        write_json(ROOT / ASSETS / "source-inventory.json", inventory)
        for recipe in spec["assets"]:
            page = doc[recipe["sheet"]]
            bbox = pymupdf.Rect(recipe["bbox"])
            if page.rotation or not page.rect.contains(bbox):
                raise ValueError(f"Invalid source orientation/bounds: {recipe['slug']}")
            png = reference_dir / f"{recipe['slug']}.png"
            pixmap = page.get_pixmap(
                matrix=pymupdf.Matrix(spec["dpi"] / 72, spec["dpi"] / 72),
                clip=bbox,
                alpha=False,
            )
            image = Image.frombytes(
                "RGB", (pixmap.width, pixmap.height), pixmap.samples
            )
            if "reference_polygon_pdf_points" in recipe:
                mask = Image.new("L", image.size, 0)
                points = [
                    (x * spec["dpi"] / 72 - pixmap.x, y * spec["dpi"] / 72 - pixmap.y)
                    for x, y in recipe["reference_polygon_pdf_points"]
                ]
                ImageDraw.Draw(mask).polygon(points, fill=255)
                image = Image.composite(
                    image, Image.new("RGB", image.size, "white"), mask
                )
            image.save(png)
            files: Files = {
                "reference_png": str(png.relative_to(ROOT)),
                "reference_svg": None,
                "renderer_svg": None,
                "geometry_json": None,
            }
            method: Extraction = {
                "method": "Lossless PNG render directly from hash-pinned original PDF, bounded clip at 216 dpi; optional recipe polygon excludes neighbouring drawing fragments",
                "tool": "PyMuPDF / MuPDF",
                "tool_version": f"{pymupdf.VersionBind} / {pymupdf.VersionFitz}",
                "recipe": str(TOOLS / "recipes.json"),
            }
            warnings = list(recipe.get("warnings", []))
            warnings.append(
                "Dimension leaders/context in reference PNG are not production paint."
            )
            representation = "source_reference"
            status = "extracted_reference"
            if "paint_bbox" in recipe:
                vector = vector_dir / f"{recipe['slug']}.svg"
                method["vector_selection"] = original_vectors(page, recipe, vector)
                files["reference_svg"] = str(vector.relative_to(ROOT))
                representation = "cleaned_vector"
                status = "cleaned_unverified"
                warnings.append(
                    "Selected original paint paths require content review; original PNG remains authoritative."
                )
                if "stroke_width_svg" in recipe:
                    warnings.append(
                        "Original engineering outline strokes retained; this is not a filled production arrow."
                    )
            dimensions: dict[str, int] = {}
            if "geometry" in recipe:
                stem = geometry_dir / recipe["slug"]
                dimensions = geometry_files(
                    recipe, locator(recipe, spec["sheets"]), stem
                )
                files["geometry_json"] = str(
                    stem.with_suffix(".json").relative_to(ROOT)
                )
                files["renderer_svg"] = str(stem.with_suffix(".svg").relative_to(ROOT))
                representation = "parametric_geometry"
                status = "verified_geometry"
                warnings.append(
                    "Parameter-generated SVG is distinct from source vector extraction; sample extent is illustrative."
                )
            assets.append(
                {
                    "id": f"sg.markings.{recipe['slug']}",
                    "name": recipe["name"],
                    "kind": recipe.get("kind", "road_marking"),
                    "representation": representation,
                    "files": files,
                    "source": locator(recipe, spec["sheets"]),
                    "extraction": method,
                    "review": {"status": status, "warnings": warnings},
                    "dimensions_mm": dimensions,
                    "license_status": "unreviewed",
                    "release_ready": False,
                    "file_sha256": {
                        key: digest(ROOT / value)
                        for key, value in file_entries(files)
                        if value is not None
                    },
                }
            )
    manifest: Manifest = {
        "schema_version": 1,
        "family": "markings",
        "sources": spec["sources"],
        "assets": assets,
        "coverage": coverage(spec, paths, assets),
    }
    write_json(ROOT / ASSETS / "manifest.json", manifest)
    return manifest


def preview(path: Path) -> Image.Image:
    if path.suffix == ".png":
        return Image.open(path).convert("RGB")
    with pymupdf.open(path) as doc:
        page = doc[0]
        scale = min(3, 1200 / max(page.rect.width, page.rect.height))
        pix = page.get_pixmap(matrix=pymupdf.Matrix(scale, scale), alpha=True)
        image = Image.frombytes("RGBA", (pix.width, pix.height), pix.samples)
        background = Image.new("RGBA", image.size, "#999999")
        background.alpha_composite(image)
        return background.convert("RGB")


def contact_sheet(manifest: Manifest, review_dir: Path) -> None:
    font = ImageFont.load_default(size=16)
    images = []
    for asset in manifest["assets"]:
        for kind, value in file_entries(asset["files"]):
            if value and kind != "geometry_json":
                image = preview(ROOT / value)
                if kind != "reference_png":
                    image = ImageOps.expand(image, border=16, fill="#999999")
                image.thumbnail((372, 244))
                cell = Image.new("RGB", (400, 300), "white")
                cell.paste(
                    image, ((400 - image.width) // 2, 42 + (244 - image.height) // 2)
                )
                draw = ImageDraw.Draw(cell)
                slug = asset["id"].removeprefix("sg.markings.")
                draw.text((8, 4), slug[:48], fill="black", font=font)
                draw.text((8, 23), kind, fill="#444444", font=font)
                images.append(cell)
    columns = 4
    sheet = Image.new(
        "RGB", (400 * columns, 300 * math.ceil(len(images) / columns)), "#cccccc"
    )
    for i, image in enumerate(images):
        sheet.paste(image, ((i % columns) * 400, (i // columns) * 300))
    sheet.save(review_dir / "contact-sheet-all.png")
    for i in range(0, len(images), 16):
        panel = Image.new("RGB", (1600, 1200), "#cccccc")
        for j, image in enumerate(images[i : i + 16]):
            panel.paste(image, ((j % 4) * 400, (j // 4) * 300))
        panel.save(review_dir / f"contact-sheet-{i // 16 + 1:02}.png")


def validate(manifest: Manifest, paths: dict[str, Path]) -> dict[str, object]:
    ids = [asset["id"] for asset in manifest["assets"]]
    assert len(ids) == len(set(ids))
    all_files = []
    for asset in manifest["assets"]:
        assert asset["release_ready"] is False
        assert asset["license_status"] == "unreviewed"
        source = asset["source"]
        with pymupdf.open(paths[source["source_id"]]) as doc:
            assert 1 <= source["pdf_page"] <= len(doc)
            assert doc[source["pdf_page"] - 1].rect.contains(source["bbox_pdf_points"])
        for key, value in file_entries(asset["files"]):
            if value is None:
                continue
            path = ROOT / value
            assert path.is_file() and path.is_relative_to(ROOT / ASSETS)
            assert digest(path) == asset["file_sha256"][key]
            all_files.append(value)
            if path.suffix == ".png":
                image = preview(path)
                assert image.width > 0 and image.height > 0
                assert any(
                    image.getchannel(channel).getextrema()[0]
                    != image.getchannel(channel).getextrema()[1]
                    for channel in ["R", "G", "B"]
                ), value
            if path.suffix == ".svg":
                with pymupdf.open(path) as doc:
                    assert max(doc[0].get_pixmap(alpha=True).samples[3::4]) > 0
                root = ET.parse(path).getroot()
                for element in root.iter():
                    assert element.tag in {
                        f"{{{SVG}}}{tag}" for tag in ["svg", "path", "rect", "circle"]
                    }
                    assert not any(
                        "href" in key or key.startswith("on") for key in element.attrib
                    )
                assert "data:" not in path.read_text()
                box = list(map(float, root.attrib["viewBox"].split()))
                extent = (box[0], box[1], box[0] + box[2], box[1] + box[3])
                for element in root.findall(f"{{{SVG}}}path"):
                    for part in re.findall(r"M[^M]+", element.attrib["d"]):
                        assert contains(
                            extent, bounds(part, element.attrib["transform"])
                        )
            if key == "geometry_json":
                geo = json.loads(path.read_text())
                if "inter_row_clear_gap" in geo["parameters_mm"]:
                    first = geo["parameters_mm"].get(
                        "first_row_width", geo["parameters_mm"].get("width")
                    )
                    second = geo["parameters_mm"].get(
                        "second_row_width", geo["parameters_mm"].get("width")
                    )
                    assert geo["derived_row_centre_spacing_mm"] == (
                        (first + second) / 2
                        + geo["parameters_mm"]["inter_row_clear_gap"]
                    )
                assert geo["measurement_evidence"]
    assert len(all_files) == len(set(all_files))
    actual = {
        str(path.relative_to(ROOT))
        for directory in ["references", "source-vectors", "geometry"]
        for path in (ROOT / ASSETS / directory).iterdir()
    }
    assert set(all_files) == actual, "Unmanifested or missing exported files"
    rules: Rules = json.loads((ROOT / ASSETS / "rules.json").read_text())
    rule_ids = [rule["id"] for rule in rules["rules"]]
    assert len(rule_ids) == len(set(rule_ids))
    for rule in rules["rules"]:
        assert set(rule["asset_ids"]) <= set(ids)
        citation = rule["citation"]
        with pymupdf.open(paths[citation["source_id"]]) as doc:
            text = " ".join(doc[citation["pdf_page"] - 1].get_text().split())
            assert " ".join(citation["quote"].split()) in text, rule["id"]
    for source_id, path in paths.items():
        with pymupdf.open(path) as doc:
            entries = [c for c in manifest["coverage"] if c["source_id"] == source_id]
            assert sorted(c["pdf_page"] for c in entries) == list(
                range(1, len(doc) + 1)
            )
            assert all(set(c["asset_ids"]) <= set(ids) for c in entries)
    return {
        "asset_count": len(ids),
        "reference_png_count": sum(
            a["files"]["reference_png"] is not None for a in manifest["assets"]
        ),
        "source_vector_count": sum(
            a["files"]["reference_svg"] is not None for a in manifest["assets"]
        ),
        "parameter_geometry_count": sum(
            a["files"]["geometry_json"] is not None for a in manifest["assets"]
        ),
        "coverage_pages": len(manifest["coverage"]),
        "cited_rule_count": len(rules["rules"]),
        "checks": [
            "Source hashes and PDF headers",
            "Unique semantic IDs and individual paths",
            "File hashes and manifest links",
            "All source pages accounted for",
            "Source page/crop bounds and upright page rotation",
            "All image exports nonblank",
            "SVG allowlist, no external references, scripts, data URIs or hidden page paths",
            "Geometry measurement evidence and clear-gap/centre-spacing distinction",
            "Cited rule quotations match real handbook PDF text and asset IDs",
        ],
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-dir", required=True, type=Path)
    parser.add_argument("--review-dir", required=True, type=Path)
    parser.add_argument("--download", action="store_true")
    args = parser.parse_args()
    spec: Recipes = json.loads((ROOT / TOOLS / "recipes.json").read_text())
    paths = source_paths(spec, args.source_dir, args.download)
    manifest = extract(spec, paths, args.review_dir)
    result = validate(manifest, paths)
    contact_sheet(manifest, args.review_dir)
    write_json(args.review_dir / "validation.json", result)
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
