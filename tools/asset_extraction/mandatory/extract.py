#!/usr/bin/env python3
"""Extract reviewed path selections from the hash-pinned TFM source sheets."""

import argparse
import copy
import hashlib
import io
import json
import urllib.request
from pathlib import Path
from typing import TypedDict, cast

import pymupdf
from lxml import etree
from PIL import Image, ImageChops, ImageDraw, ImageFont

SVG_NS = "http://www.w3.org/2000/svg"
ROOT = Path(__file__).resolve().parents[3]
HERE = Path(__file__).resolve().parent
DEST = ROOT / "assets/sg/mandatory"
RECIPE_PATH = HERE / "recipe.json"
RECIPE_REL = RECIPE_PATH.relative_to(ROOT).as_posix()
SCALE = 3


class Source(TypedDict):
    id: str
    filename: str
    url: str
    sha256: str
    publisher: str
    collection_revision: str | None
    page_count: int


class Sheet(TypedDict):
    pdf_page: int
    drawing: str
    drawing_revision: str
    printed_page: str
    path_count: int
    revision_evidence_bbox: list[float]


class Face(TypedDict):
    slug: str
    name: str
    pdf_page: int
    face_bbox: list[float]
    reference_bbox: list[float]
    backing_paths: list[int]
    black_artwork_paths: list[int]
    dimensions_mm: dict[str, object]
    rule: dict[str, object]
    warnings: list[str]


class Recipe(TypedDict):
    retrieved_at: str
    sources: list[Source]
    pages: list[Sheet]
    assets: list[Face]


class Drawing(TypedDict):
    rect: pymupdf.Rect
    color: tuple[float, ...] | None
    fill: tuple[float, ...] | None
    width: float | None
    items: list[tuple]


class ExtendedDrawing(TypedDict):
    type: str
    scissor: pymupdf.Rect


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def write_json(path: Path, value: object) -> None:
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n")


def load_sources(
    recipe: Recipe, directory: Path, download: bool
) -> dict[str, pymupdf.Document]:
    directory.mkdir(parents=True, exist_ok=True)
    documents = {}
    for source in recipe["sources"]:
        path = directory / source["filename"]
        if not path.exists() and download:
            with urllib.request.urlopen(source["url"], timeout=90) as response:
                path.write_bytes(response.read())
        if digest(path) != source["sha256"]:
            raise ValueError(f"Source hash mismatch: {path.name}")
        document = pymupdf.open(path)
        assert len(document) == source["page_count"]
        documents[source["id"]] = document
    return documents


def paint_paths(
    page: pymupdf.Page, expected: int
) -> tuple[list[etree._Element], list[Drawing]]:
    assert not page.get_images() and not page.get_fonts() and not page.get_text()
    assert page.rotation == 0
    drawings = cast(list[Drawing], page.get_drawings())
    extended = cast(list[ExtendedDrawing], page.get_drawings(extended=True))
    for item in extended:
        if item["type"] == "clip":
            assert tuple(round(value, 2) for value in item["scissor"]) == (
                0,
                0,
                1190.52,
                841.8,
            ), "Only source-wide clipping may be discarded"
        else:
            assert item["type"] in ("s", "f"), "Unexpected transparency group"
    root = etree.fromstring(page.get_svg_image().encode())
    paths = cast(
        list[etree._Element],
        root.xpath(
            '//*[local-name()="path" and not(ancestor::*[local-name()="defs"])]'
        ),
    )
    assert len(paths) == len(drawings) == expected
    for path in paths:
        for parent in path.iterancestors():
            assert set(parent.attrib) <= {
                "clip-path",
                "version",
                "width",
                "height",
                "viewBox",
            }, "Unexpected inherited SVG style/transform"
    return paths, drawings


def coordinates(point: pymupdf.Point) -> str:
    return f"{point.x:.5f} {point.y:.5f}"


def backing_interior(drawings: list[Drawing], indices: list[int]) -> str:
    segments = []
    for index in indices:
        for item in drawings[index]["items"]:
            assert item[0] in ("l", "c"), "Unsupported source perimeter segment"
            segments.append(list(item[1:]))
    current = segments[0][0]
    start = current
    commands = ["M" + coordinates(start)]
    while segments:
        for i, segment in enumerate(segments):
            if abs(segment[0] - current) < 0.002:
                break
            if abs(segment[-1] - current) < 0.002:
                segment = list(reversed(segment))
                break
        else:
            raise ValueError("Source backing perimeter is not connected")
        segments.pop(i)
        commands.append(
            ("L" if len(segment) == 2 else "C")
            + " ".join(coordinates(point) for point in segment[1:])
        )
        current = segment[-1]
    assert abs(current - start) < 0.002, "Source backing perimeter is not closed"
    return " ".join(commands) + " Z"


def select_paths(face: Face, drawings: list[Drawing]) -> list[int]:
    box = pymupdf.Rect(face["face_bbox"])
    selected = set(face["backing_paths"] + face["black_artwork_paths"])
    for i, drawing in enumerate(drawings):
        colours = [drawing["fill"], drawing["color"]]
        if box.contains(drawing["rect"]) and any(
            colour is not None and max(colour) > 0 and min(colour) < 0.9
            for colour in colours
        ):
            selected.add(i)
    assert selected
    for index in selected:
        drawing = drawings[index]
        rect = drawing["rect"] + (-0.4, -0.4, 0.4, 0.4)
        assert box.contains(rect), (
            f"Out-of-bounds selected path: {face['slug']} {index}"
        )
    return sorted(selected)


def make_svg(
    face: Face,
    paths: list[etree._Element],
    drawings: list[Drawing],
    selected: list[int],
) -> bytes:
    x0, y0, x1, y1 = face["face_bbox"]
    root = etree.fromstring(f'<svg xmlns="{SVG_NS}"/>'.encode())
    root.attrib.update(
        {
            "version": "1.1",
            "width": str(x1 - x0),
            "height": str(y1 - y0),
            "viewBox": f"{x0} {y0} {x1 - x0} {y1 - y0}",
        }
    )
    etree.SubElement(
        root,
        f"{{{SVG_NS}}}path",
        d=backing_interior(drawings, face["backing_paths"]),
        fill="#ffffff",
        stroke="none",
    )
    for i in selected:
        root.append(copy.deepcopy(paths[i]))
    etree.cleanup_namespaces(root)
    return etree.tostring(root, xml_declaration=True, encoding="UTF-8") + b"\n"


def image_from_pixmap(pixmap: pymupdf.Pixmap) -> Image.Image:
    return Image.open(io.BytesIO(pixmap.tobytes("png"))).convert("RGB")


def svg_image(data: bytes) -> Image.Image:
    document = pymupdf.open(stream=data, filetype="svg")
    return image_from_pixmap(
        document[0].get_pixmap(matrix=pymupdf.Matrix(SCALE, SCALE))
    )


def check_image(image: Image.Image) -> None:
    assert min(image.size) >= 200
    assert ImageChops.difference(image, Image.new("RGB", image.size, "white")).getbbox()
    extrema = image.getextrema()
    assert any(high - low > 100 for low, high in extrema)


def build_contact_sheet(
    pairs: list[tuple[str, Image.Image, Image.Image]], target: Path
) -> None:
    sheet = Image.new("RGB", (1500, len(pairs) * 390 + 60), "#e8e8e8")
    draw = ImageDraw.Draw(sheet)
    font = ImageFont.load_default(size=18)
    draw.text(
        (20, 15),
        "Mandatory / SDRE I / TFM1-2 revision - / references and cleaned-unverified vectors",
        fill="black",
        font=font,
    )
    for i, (name, reference, cleaned) in enumerate(pairs):
        y = 60 + 390 * i
        label = name.replace("—", "-").replace("×", "x")
        draw.text(
            (20, y),
            label
            + " | PDF reference (left) / selected original vector artwork (right)",
            fill="black",
            font=font,
        )
        for x, image in [(30, reference), (810, cleaned)]:
            image = image.copy()
            image.thumbnail((640, 345))
            sheet.paste(image, (x + (640 - image.width) // 2, y + 28))
    sheet.save(target)
    for start in range(0, len(pairs), 4):
        sheet.crop(
            (0, 60 + start * 390, 1500, 60 + min(start + 4, len(pairs)) * 390)
        ).save(target.with_name(f"mandatory-contact-detail-{start // 4 + 1}.png"))


def coverage(
    recipe: Recipe, assets: list[dict[str, object]]
) -> list[dict[str, object]]:
    result: list[dict[str, object]] = []
    for source in recipe["sources"]:
        for page in range(1, source["page_count"] + 1):
            row: dict[str, object] = {
                "source_id": source["id"],
                "pdf_page": page,
                "drawing": None,
                "asset_ids": [],
                "status": "not_applicable",
            }
            if source["id"] == "lta-sdre-i-tfm" and page > 1:
                sheet = recipe["pages"][page - 2]
                row.update(
                    {
                        "drawing": sheet["drawing"],
                        "asset_ids": [
                            asset["id"]
                            for asset, face in zip(assets, recipe["assets"])
                            if face["pdf_page"] == page
                        ],
                        "status": "extracted",
                        "reason": "All six illustrated sign faces extracted; dimensions/captions retained as reference evidence. No face or size variant deferred. Title block and structural handle are not sign faces.",
                    }
                )
            elif source["id"] == "lta-sdre-i-tfm":
                row["reason"] = "Chapter contents/index; no sign-face artwork."
            elif source["id"] == "lta-sdre-i-contents":
                row["status"] = "reference_only"
                row["reason"] = {
                    1: "Collection cover: April 2014 edition, Revision I March 2026.",
                    2: "General notes; note 9 establishes millimetres unless stated otherwise.",
                }.get(
                    page, "Collection table of contents; no sign faces for extraction."
                )
            elif page in (10, 11):
                row["status"] = "reference_only"
                row["reason"] = (
                    "Mandatory-sign learner meanings transcribed as cited rules. Artwork extraction is scoped to the two TFM sheets, not handbook illustrations."
                )
            else:
                row["reason"] = (
                    "Supporting handbook page outside the TFM face-extraction scope; no artwork extraction attempted. Cover/publication matter or other learner material."
                )
            result.append(row)
    return result


def run(source_dir: Path, review_dir: Path, download: bool) -> None:
    assert pymupdf.VersionBind == "1.26.4"
    recipe = cast(Recipe, json.loads(RECIPE_PATH.read_text()))
    docs = load_sources(recipe, source_dir, download)
    review_dir.mkdir(parents=True, exist_ok=True)
    DEST.mkdir(parents=True, exist_ok=True)
    pages = {
        sheet["pdf_page"]: paint_paths(
            docs["lta-sdre-i-tfm"][sheet["pdf_page"] - 1], sheet["path_count"]
        )
        for sheet in recipe["pages"]
    }
    assets: list[dict[str, object]] = []
    audit: list[dict[str, object]] = []
    pairs = []
    for face in recipe["assets"]:
        page = docs["lta-sdre-i-tfm"][face["pdf_page"] - 1]
        sheet = recipe["pages"][face["pdf_page"] - 2]
        paths, drawings = pages[face["pdf_page"]]
        selected = select_paths(face, drawings)
        svg = make_svg(face, paths, drawings, selected)
        vector_path = DEST / f"{face['slug']}.svg"
        vector_path.write_bytes(svg)
        reference_path = DEST / f"{face['slug']}.reference.png"
        page.get_pixmap(
            matrix=pymupdf.Matrix(SCALE, SCALE),
            clip=pymupdf.Rect(face["reference_bbox"]),
        ).save(reference_path)
        reference = Image.open(reference_path).convert("RGB")
        cleaned = svg_image(svg)
        check_image(reference)
        check_image(cleaned)
        cleaned.save(review_dir / f"{face['slug']}.cleaned.png")
        pairs.append((face["name"], reference, cleaned))
        dimensions = copy.deepcopy(face["dimensions_mm"])
        for measurement in dimensions.values():
            item = cast(dict[str, object], measurement)
            item.update(
                {
                    "source_id": "lta-sdre-i-tfm",
                    "pdf_page": face["pdf_page"],
                    "drawing": sheet["drawing"],
                    "units": "mm",
                }
            )
        asset: dict[str, object] = {
            "id": "sg.mandatory." + face["slug"],
            "name": face["name"],
            "kind": "sign_face",
            "representation": "cleaned_vector",
            "files": {
                "reference_svg": None,
                "reference_png": reference_path.relative_to(ROOT).as_posix(),
                "renderer_svg": vector_path.relative_to(ROOT).as_posix(),
                "geometry_json": None,
            },
            "source": {
                "source_id": "lta-sdre-i-tfm",
                "pdf_page": face["pdf_page"],
                "printed_page": sheet["printed_page"],
                "drawing": sheet["drawing"],
                "drawing_revision": sheet["drawing_revision"],
                "bbox_pdf_points": face["reference_bbox"],
            },
            "extraction": {
                "method": "Select original paint paths including outlined lettering and backing. Add white interior from the joined original backing perimeter; omit engineering annotations.",
                "tool": "PyMuPDF",
                "tool_version": pymupdf.VersionBind,
                "recipe": RECIPE_REL,
                "recipe_sha256": digest(RECIPE_PATH),
                "face_bbox_pdf_points": face["face_bbox"],
                "source_paint_path_indices_zero_based": selected,
                "backing_path_indices_zero_based": face["backing_paths"],
                "reference_representation": "source_reference",
                "reference_dpi": 72 * SCALE,
            },
            "review": {
                "status": "cleaned_unverified",
                "warnings": [
                    "Reference PNG retains dimension leaders and source annotations; it is not a production texture.",
                    "White paper inside the original backing perimeter is made opaque; transparent outside. This interpretation requires content review.",
                    "Source RGB colours and lettering paths are preserved; they are not certified physical colour/material specifications.",
                    "MuPDF PDF-to-SVG numeric colour conversion differs from PDF raster output by up to one RGB byte value in flat regions; no manual colour changes are applied.",
                    "Artwork extraction does not verify legal applicability or grant reproduction rights.",
                ]
                + face.get("warnings", []),
            },
            "dimensions_mm": dimensions,
            "traffic_rule": face["rule"],
            "license_status": "unreviewed",
            "release_ready": False,
            "file_sha256": {
                "reference_png": digest(reference_path),
                "renderer_svg": digest(vector_path),
            },
        }
        assets.append(asset)
        audit.append(
            {
                "id": asset["id"],
                "path_count": len(selected),
                "source_path_count": len(paths),
                "face_bbox": face["face_bbox"],
                "file_sha256": asset["file_sha256"],
            }
        )
    sources = [
        {key: value for key, value in source.items() if key != "filename"}
        | {"retrieved_at": recipe["retrieved_at"]}
        for source in recipe["sources"]
    ]
    write_json(
        DEST / "manifest.json",
        {
            "schema_version": 1,
            "family": "mandatory",
            "sources": sources,
            "assets": assets,
            "coverage": coverage(recipe, assets),
        },
    )
    write_json(review_dir / "extraction-audit.json", audit)
    build_contact_sheet(pairs, review_dir / "mandatory-contact-sheet.png")
    for sheet in recipe["pages"]:
        page = docs["lta-sdre-i-tfm"][sheet["pdf_page"] - 1]
        page.get_pixmap(matrix=pymupdf.Matrix(2, 2)).save(
            review_dir / f"tfm-page-{sheet['pdf_page']}.png"
        )
        page.get_pixmap(
            matrix=pymupdf.Matrix(4, 4),
            clip=pymupdf.Rect(sheet["revision_evidence_bbox"]),
        ).save(review_dir / f"tfm-revision-{sheet['pdf_page']}.png")
    print(
        f"Extracted {len(assets)} faces; contact sheet: {review_dir / 'mandatory-contact-sheet.png'}"
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sources", type=Path, required=True)
    parser.add_argument("--review", type=Path, required=True)
    parser.add_argument("--download", action="store_true")
    args = parser.parse_args()
    run(args.sources.resolve(), args.review.resolve(), args.download)
