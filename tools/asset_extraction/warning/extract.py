"""Extract bounded source references, without reconstructing sign artwork."""

from __future__ import annotations

import argparse
import copy
import hashlib
import json
import math
import re
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import TypedDict, cast

import pymupdf
from PIL import Image, ImageChops, ImageDraw, ImageOps

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
ASSETS = ROOT / "assets/sg/warning"
RECIPE = HERE / "recipes.json"
SVG = "{http://www.w3.org/2000/svg}"
ET.register_namespace("", SVG[1:-1])


class Source(TypedDict):
    id: str
    filename: str
    url: str
    sha256: str
    publisher: str
    collection_revision: str | None
    retrieved_at: str
    pages: int


class OptionalFace(TypedDict, total=False):
    warnings: list[str]
    size_variant: list[int]


class Face(OptionalFace):
    slug: str
    name: str
    bbox: list[float]


class Sheet(TypedDict):
    sheet: int
    revision: str
    assets: list[Face]


class Recipe(TypedDict):
    schema_version: int
    family: str
    coordinate_system: str
    reference_scale: int
    sources: list[Source]
    sheets: list[Sheet]


class Drawing(TypedDict):
    rect: pymupdf.Rect
    width: float | None


def require(condition: bool, message: str) -> None:
    if not condition:
        raise ValueError(message)


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def write_json(path: Path, value: object) -> None:
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n")


def inside(inner: pymupdf.Rect, outer: pymupdf.Rect) -> bool:
    return (
        outer.x0 <= inner.x0 <= inner.x1 <= outer.x1
        and outer.y0 <= inner.y0 <= inner.y1 <= outer.y1
    )


def expanded(box: pymupdf.Rect, amount: float) -> pymupdf.Rect:
    return pymupdf.Rect(
        box.x0 - amount, box.y0 - amount, box.x1 + amount, box.y1 + amount
    )


def paint_paths(root: ET.Element, crop: pymupdf.Rect) -> list[ET.Element]:
    clips: dict[str, pymupdf.Rect] = {}
    for definition in root.findall(f"{SVG}defs/{SVG}clipPath"):
        require(len(definition) == 1, "Unsupported compound clip")
        path = definition[0]
        # Only the rectangular page clips actually used by this pinned PDF.
        number = r"(-?\d+(?:\.\d+)?)"
        match = re.fullmatch(
            rf"M{number}[ ,]?{number}V{number}H{number}V{number}Z", path.attrib["d"]
        )
        require(match is not None, "Unsupported clip geometry")
        assert match is not None
        x0, y0, y1, x1, closing_y = map(float, match.groups())
        require(y0 == closing_y, "Clip is not rectangular")
        matrix_text = path.attrib["transform"]
        require(matrix_text.startswith("matrix("), "Unsupported clip transform")
        matrix = pymupdf.Matrix(
            [
                float(v)
                for v in matrix_text.removeprefix("matrix(")
                .removesuffix(")")
                .split(",")
            ]
        )
        clips[definition.attrib["id"]] = pymupdf.Rect(x0, y0, x1, y1) * matrix
    paths: list[ET.Element] = []

    def walk(element: ET.Element) -> None:
        for child in element:
            if child.tag == f"{SVG}defs":
                continue
            if child.tag == f"{SVG}path":
                paths.append(child)
            elif child.tag == f"{SVG}g":
                require(
                    set(child.attrib) == {"clip-path"}, "Unsupported group attributes"
                )
                clip_id = (
                    child.attrib["clip-path"].removeprefix("url(#").removesuffix(")")
                )
                require(
                    inside(crop, clips[clip_id]),
                    "Crop crosses a source clipping region",
                )
                walk(child)
            else:
                raise ValueError(f"Unexpected SVG element: {child.tag}")

    walk(root)
    return paths


def vector_crop(
    page: pymupdf.Page, crop: pymupdf.Rect
) -> tuple[bytes, list[int], list[list[float]], int]:
    paths = paint_paths(ET.fromstring(page.get_svg_image()), crop)
    drawings = cast(list[Drawing], page.get_drawings())
    require(len(paths) == len(drawings), "SVG/drawing paint-order mismatch")
    out = ET.Element(
        f"{SVG}svg",
        {
            "version": "1.1",
            "width": str(crop.width),
            "height": str(crop.height),
            "viewBox": f"0 0 {crop.width} {crop.height}",
        },
    )
    group = ET.SubElement(
        out, f"{SVG}g", {"transform": f"translate({-crop.x0},{-crop.y0})"}
    )
    indices: list[int] = []
    bounds: list[list[float]] = []
    for index, (path, drawing) in enumerate(zip(paths, drawings, strict=True)):
        box = drawing["rect"] * page.rotation_matrix
        box = expanded(box, max((drawing["width"] or 0) / 2, 0.01))
        if inside(box, crop):
            group.append(copy.deepcopy(path))
            indices.append(index)
            bounds.append([round(v, 6) for v in box])
    require(bool(indices), "Empty vector selection")
    return (
        ET.tostring(out, encoding="utf-8", xml_declaration=True),
        indices,
        bounds,
        len(paths),
    )


def png_image(page: pymupdf.Page, crop: pymupdf.Rect, scale: int) -> Image.Image:
    pixmap = page.get_pixmap(
        matrix=pymupdf.Matrix(scale, scale),
        clip=crop,
        colorspace=pymupdf.csRGB,
        alpha=False,
    )
    return Image.frombytes("RGB", (pixmap.width, pixmap.height), pixmap.samples)


def validate_svg(path: Path, crop: pymupdf.Rect) -> None:
    text = path.read_text()
    require(
        not re.search(r"data:|base64|href=|<script|<image|<text|url\(", text),
        f"Unsafe or non-path SVG: {path.name}",
    )
    root = ET.fromstring(text)
    require(
        all(
            element.tag in {f"{SVG}svg", f"{SVG}g", f"{SVG}path"}
            for element in root.iter()
        ),
        "Unexpected exported SVG elements",
    )
    with pymupdf.open(path) as svg_doc:
        with pymupdf.open("pdf", svg_doc.convert_to_pdf()) as converted:
            for drawing in cast(list[Drawing], converted[0].get_drawings()):
                require(
                    inside(
                        drawing["rect"],
                        expanded(pymupdf.Rect(0, 0, crop.width, crop.height), 0.02),
                    ),
                    f"Out-of-bounds vector in {path.name}",
                )


def ink(image: Image.Image) -> Image.Image:
    return image.convert("L").point(lambda value: 255 if value < 220 else 0)


def compare(reference: Image.Image, vector: Image.Image) -> dict[str, float]:
    require(reference.size == vector.size, "Raster/vector size mismatch")
    mismatch = ImageChops.difference(ink(reference), ink(vector))
    changed = sum(mismatch.histogram()[1:])
    ref_ink = sum(ink(reference).histogram()[1:])
    return {
        "ink_mask_difference_fraction": round(changed / max(ref_ink, 1), 6),
        "ink_fraction": round(ref_ink / (reference.width * reference.height), 6),
    }


def contact_sheet(entries: list[tuple[str, Path]], output: Path) -> None:
    columns, cell_width, cell_height = 4, 400, 340
    image = Image.new(
        "RGB",
        (columns * cell_width, math.ceil(len(entries) / columns) * cell_height),
        "white",
    )
    draw = ImageDraw.Draw(image)
    for index, (label, path) in enumerate(entries):
        x, y = (index % columns) * cell_width, (index // columns) * cell_height
        with Image.open(path) as source:
            thumbnail = ImageOps.contain(source, (cell_width - 16, cell_height - 50))
            image.paste(thumbnail, (x + (cell_width - thumbnail.width) // 2, y + 5))
        words = label.replace("-", " ").split()
        lines: list[str] = [""]
        for word in words:
            if len(lines[-1]) + len(word) > 49:
                lines.append("")
            lines[-1] += word + " "
        draw.text((x + 8, y + cell_height - 43), "\n".join(lines), fill="black")
        draw.rectangle(
            (x, y, x + cell_width - 1, y + cell_height - 1), outline="#cccccc"
        )
    image.save(output)


def source_documents(recipe: Recipe, source_dir: Path, download: bool) -> None:
    source_dir.mkdir(parents=True, exist_ok=True)
    for source in recipe["sources"]:
        path = source_dir / source["filename"]
        if not path.exists() and download:
            with urllib.request.urlopen(source["url"], timeout=90) as response:
                path.write_bytes(response.read())
        require(path.exists(), f"Missing source: {path}")
        require(digest(path) == source["sha256"], f"Source hash mismatch: {path}")
        with pymupdf.open(path) as document:
            require(
                len(document) == source["pages"], f"Source page count mismatch: {path}"
            )


def extract(recipe: Recipe, source_dir: Path, review_dir: Path) -> None:
    require(pymupdf.VersionBind == "1.26.4", "Use the pinned PyMuPDF version")
    ASSETS.mkdir(parents=True, exist_ok=True)
    review_dir.mkdir(parents=True, exist_ok=True)
    assets: list[dict[str, object]] = []
    coverage: list[dict[str, object]] = []
    validation: list[dict[str, object]] = []
    all_entries: list[tuple[str, Path]] = []
    document = pymupdf.open(source_dir / recipe["sources"][0]["filename"])
    for sheet in recipe["sheets"]:
        number = sheet["sheet"]
        page = document[number]
        drawing_id = f"LTA/SDRE14/17/TFW{number}"
        require(
            not page.get_fonts() and not page.get_images(),
            "Unexpected font/image artwork",
        )
        entries: list[tuple[str, Path]] = []
        page_ids: list[str] = []
        for face in sheet["assets"]:
            crop = pymupdf.Rect(face["bbox"])
            require(not crop.is_empty and inside(crop, page.rect), "Invalid crop")
            slug = face["slug"]
            asset_id = f"sg.warning.{slug}"
            page_ids.append(asset_id)
            png_path = ASSETS / f"{slug}.reference.png"
            svg_path = ASSETS / f"{slug}.reference.svg"
            image = png_image(page, crop, recipe["reference_scale"])
            image.save(png_path)
            vector, indices, bounds, total_paths = vector_crop(page, crop)
            candidate_path = review_dir / f"{slug}.candidate.svg"
            candidate_path.write_bytes(vector)
            validate_svg(candidate_path, crop)
            with pymupdf.open(candidate_path) as svg_doc:
                vector_image = png_image(
                    svg_doc[0], svg_doc[0].rect, recipe["reference_scale"]
                )
            comparison = compare(image, vector_image)
            require(comparison["ink_fraction"] > 0.01, f"Blank asset: {slug}")
            vector_accepted = comparison["ink_mask_difference_fraction"] < 0.025
            if vector_accepted:
                svg_path.write_bytes(vector)
            elif svg_path.exists():
                svg_path.unlink()
            warnings = [
                "Engineering reference: dimension lines, labels and construction guides remain; not a clean renderer.",
                "PDF-to-SVG uses MuPDF's color conversion; PNG is the direct PDF-rendered appearance reference.",
                "Artwork does not establish a traffic rule. Content and reuse review are outstanding.",
                *face.get("warnings", []),
            ]
            if not vector_accepted:
                warnings.append(
                    "SVG candidate withheld: rasterized vector ink differs from the PDF by "
                    "more than 2.5%. The lossless PNG is retained; vector fidelity remains deferred."
                )
            dimensions: dict[str, object] = {}
            if "size_variant" in face:
                width, height = face["size_variant"]
                dimensions = {
                    "backing_width": width,
                    "backing_height": height,
                    "endpoints": "Outside backing edge to opposite outside backing edge, as dimensioned",
                    "evidence_bbox_pdf_points": face["bbox"],
                    "method": "Manual transcription of displayed outer dimension labels, not measured from pixels",
                    "geometry_generated": False,
                }
            assets.append(
                {
                    "id": asset_id,
                    "name": face["name"],
                    "kind": "sign_face",
                    "representation": "source_reference",
                    "files": {
                        "reference_svg": str(svg_path.relative_to(ROOT))
                        if vector_accepted
                        else None,
                        "reference_png": str(png_path.relative_to(ROOT)),
                        "renderer_svg": None,
                        "geometry_json": None,
                    },
                    "file_sha256": {
                        "reference_svg": digest(svg_path) if vector_accepted else None,
                        "reference_png": digest(png_path),
                    },
                    "source": {
                        "source_id": recipe["sources"][0]["id"],
                        "pdf_page": number + 1,
                        "printed_page": f"17-{number}",
                        "drawing": drawing_id,
                        "drawing_revision": sheet["revision"],
                        "drawing_issue_date": "2014-04-01",
                        "drawing_revision_date": "2017-09" if number == 6 else None,
                        "bbox_pdf_points": face["bbox"],
                        "bbox_unrotated_page_points": list(
                            crop * page.derotation_matrix
                        ),
                        "coordinate_system": recipe["coordinate_system"],
                        "page_rotation_degrees": page.rotation,
                    },
                    "extraction": {
                        "method": (
                            "Bounded original SVG paint-path subset and direct lossless PDF raster crop"
                            if vector_accepted
                            else "Direct lossless PDF raster crop; SVG candidate withheld after comparison"
                        ),
                        "tool": "PyMuPDF",
                        "tool_version": pymupdf.VersionBind,
                        "recipe": str(RECIPE.relative_to(ROOT)),
                        "recipe_key": slug,
                        "recipe_sha256": digest(RECIPE),
                        "script": str(Path(__file__).resolve().relative_to(ROOT)),
                        "reference_dpi": recipe["reference_scale"] * 72,
                        "selected_source_path_indices": indices,
                        "selected_path_bounds_pdf_points": bounds,
                        "source_path_count": total_paths,
                        "source_font_count": 0,
                        "source_image_count": 0,
                        "comparison": comparison,
                    },
                    "review": {
                        "status": "extracted_reference",
                        "warnings": warnings,
                    },
                    "dimensions_mm": dimensions,
                    "license_status": "unreviewed",
                    "release_ready": False,
                }
            )
            validation.append(
                {
                    "id": asset_id,
                    "paths": len(indices),
                    "vector_accepted": vector_accepted,
                    **comparison,
                }
            )
            entries.append((f"TFW{number} | {slug}", png_path))
        contact_sheet(entries, review_dir / f"tfw{number}-contact.png")
        all_entries.extend(entries)
        coverage.append(
            {
                "source_id": recipe["sources"][0]["id"],
                "pdf_page": number + 1,
                "drawing": drawing_id,
                "drawing_revision": sheet["revision"],
                "asset_ids": page_ids,
                "status": "reference_only",
                "reason": (
                    "All depicted faces inventoried and exported as individual references. "
                    "Alternative sizes explicitly dimensioned on shared artwork have separate semantic IDs. "
                    "Captions, title blocks and structural drawing notes are not separate sign faces. "
                    "No clean production geometry or traffic-rule verification performed."
                ),
            }
        )
    coverage.insert(
        0,
        {
            "source_id": recipe["sources"][0]["id"],
            "pdf_page": 1,
            "drawing": None,
            "asset_ids": [],
            "status": "not_applicable",
            "reason": "Chapter 17 contents/index; no warning face artwork.",
        },
    )
    for source in recipe["sources"][1:]:
        for page_number in range(1, source["pages"] + 1):
            coverage.append(
                {
                    "source_id": source["id"],
                    "pdf_page": page_number,
                    "drawing": None,
                    "asset_ids": [],
                    "status": "not_applicable",
                    "reason": (
                        "Supplementary collection contents/general notes; supports edition and units. "
                        "Outside the TFW face extraction scope."
                        if source["publisher"] == "LTA"
                        else "Supplementary handbook downloaded and hash pinned. This page has not been "
                        "used to extract artwork or validate a traffic rule; handbook extraction is "
                        "outside the requested TFW1–TFW9 scope."
                    ),
                }
            )
    ids = [item["id"] for item in assets]
    require(len(ids) == len(set(ids)) == 56, "Duplicate or missing asset IDs")
    require(
        len(coverage) == sum(source["pages"] for source in recipe["sources"]),
        "Missing page coverage",
    )
    manifest = {
        "schema_version": 1,
        "family": recipe["family"],
        "sources": recipe["sources"],
        "assets": assets,
        "coverage": coverage,
        "unresolved": [
            "All 56 references require content and reuse review; no release-ready renderer is supplied.",
            "56 records represent 54 depicted faces: ERP and sharp-deviation each add a separately dimensioned size.",
            "General note 10 requests 900mm warnings for expressways but does not depict every resized face; no inferred 900mm artwork or geometry generated.",
            "Height numerals, barrier lengths and sharp-deviation directions beyond the examples drawn remain unspecified/unattempted; no guessed fonts or mirroring.",
            "Legacy ERP/restricted-zone/expressway wording needs current handbook and policy review before use.",
        ],
    }
    write_json(ASSETS / "manifest.json", manifest)
    write_json(review_dir / "validation.json", validation)
    contact_sheet(all_entries, review_dir / "warning-contact-sheet.png")
    svg_count = sum(bool(item["vector_accepted"]) for item in validation)
    print(
        f"Extracted {len(assets)} asset records, {len(all_entries)} PNGs and {svg_count} SVGs."
    )
    print(f"Review: {review_dir}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-dir", required=True, type=Path)
    parser.add_argument("--review-dir", required=True, type=Path)
    parser.add_argument("--download", action="store_true")
    args = parser.parse_args()
    recipe = cast(Recipe, json.loads(RECIPE.read_text()))
    source_documents(recipe, args.source_dir, args.download)
    extract(recipe, args.source_dir, args.review_dir)


if __name__ == "__main__":
    main()
