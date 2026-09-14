"""Validate source hashes, coverage, isolation, original path identity and PNGs."""

from __future__ import annotations

import argparse
import io
import json
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import TypedDict, cast

import pymupdf
from PIL import Image, ImageChops

from extract import (
    ASSETS,
    RECIPE,
    ROOT,
    SVG,
    Recipe,
    Source,
    digest,
    inside,
    paint_paths,
    png_image,
    require,
    source_documents,
    validate_svg,
)


class Evidence(TypedDict):
    source_id: str
    pdf_page: int
    drawing_revision: str
    bbox_pdf_points: list[float]


class Extraction(TypedDict):
    recipe_sha256: str
    selected_source_path_indices: list[int]


class Asset(TypedDict):
    id: str
    files: dict[str, str | None]
    file_sha256: dict[str, str | None]
    source: Evidence
    extraction: Extraction
    release_ready: bool
    license_status: str


class Coverage(TypedDict):
    source_id: str
    pdf_page: int
    asset_ids: list[str]


class Manifest(TypedDict):
    family: str
    sources: list[Source]
    assets: list[Asset]
    coverage: list[Coverage]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-dir", required=True, type=Path)
    args = parser.parse_args()
    recipe = cast(Recipe, json.loads(RECIPE.read_text()))
    manifest = cast(Manifest, json.loads((ASSETS / "manifest.json").read_text()))
    source_documents(recipe, args.source_dir, download=False)
    require(manifest["family"] == "warning", "Wrong family")
    require(manifest["sources"] == recipe["sources"], "Source inventory differs")
    expected_ids = {
        f"sg.warning.{face['slug']}"
        for sheet in recipe["sheets"]
        for face in sheet["assets"]
    }
    ids = [asset["id"] for asset in manifest["assets"]]
    require(len(ids) == len(set(ids)) == 56 and set(ids) == expected_ids, "Invalid IDs")
    expected_pages = {
        (source["id"], page)
        for source in recipe["sources"]
        for page in range(1, source["pages"] + 1)
    }
    covered_pages = [
        (row["source_id"], row["pdf_page"]) for row in manifest["coverage"]
    ]
    require(
        len(covered_pages) == len(set(covered_pages))
        and set(covered_pages) == expected_pages,
        "Missing or duplicated page coverage",
    )
    covered_ids = [
        asset_id for row in manifest["coverage"] for asset_id in row["asset_ids"]
    ]
    require(
        sorted(covered_ids) == sorted(ids), "Coverage asset IDs do not match manifest"
    )
    expected_files = {ASSETS / "manifest.json"}
    source = recipe["sources"][0]
    document = pymupdf.open(args.source_dir / source["filename"])
    vector_count = 0
    for asset in manifest["assets"]:
        require(asset["release_ready"] is False, "Unexpected release-ready asset")
        require(asset["license_status"] == "unreviewed", "Unexpected license status")
        require(asset["source"]["source_id"] == source["id"], "Invalid asset source")
        page_number = asset["source"]["pdf_page"]
        require(2 <= page_number <= 10, "Invalid artwork page")
        require(
            asset["source"]["drawing_revision"] == ("A" if page_number == 7 else "-"),
            "Wrong drawing revision",
        )
        crop = pymupdf.Rect(asset["source"]["bbox_pdf_points"])
        page = document[page_number - 1]
        require(inside(crop, page.rect), "Invalid source bounds")
        require(
            asset["extraction"]["recipe_sha256"] == digest(RECIPE), "Stale recipe hash"
        )
        for role, relative in asset["files"].items():
            if relative is None:
                continue
            path = (ROOT / relative).resolve()
            require(
                path.is_relative_to(ASSETS) and not Path(relative).is_absolute(),
                "Invalid manifest path",
            )
            require(
                path.exists() and digest(path) == asset["file_sha256"][role],
                "File hash mismatch",
            )
            expected_files.add(path)
        require(
            asset["files"]["renderer_svg"] is None
            and asset["files"]["geometry_json"] is None,
            "Unreviewed production geometry",
        )
        png_relative = asset["files"]["reference_png"]
        require(png_relative is not None, "Missing PNG")
        assert png_relative is not None
        rendered = png_image(page, crop, recipe["reference_scale"])
        with Image.open(ROOT / png_relative) as reference:
            require(reference.size == rendered.size, "PNG has incorrect bounds")
            require(
                ImageChops.difference(reference.convert("RGB"), rendered).getbbox()
                is None,
                "PNG differs from PDF",
            )
        png_bytes = io.BytesIO()
        rendered.save(png_bytes, format="PNG")
        require(
            png_bytes.getvalue() == (ROOT / png_relative).read_bytes(),
            "PNG generation not deterministic",
        )
        svg_relative = asset["files"]["reference_svg"]
        if svg_relative is not None:
            vector_count += 1
            path = ROOT / svg_relative
            validate_svg(path, crop)
            original = paint_paths(ET.fromstring(page.get_svg_image()), crop)
            svg = ET.parse(path).getroot()
            require(
                svg.attrib["viewBox"] == f"0 0 {crop.width} {crop.height}"
                and len(svg) == 1
                and svg[0].attrib == {"transform": f"translate({-crop.x0},{-crop.y0})"},
                "Output dimensions or orientation transform changed",
            )
            actual = list(svg.iter(f"{SVG}path"))
            indices = asset["extraction"]["selected_source_path_indices"]
            require(
                len(actual) == len(indices) < len(original),
                "Not an isolated path subset",
            )
            require(
                [element.attrib for element in actual]
                == [original[index].attrib for index in indices],
                "SVG paths, source colors or transforms were altered",
            )
    actual_files = {path for path in ASSETS.iterdir() if path.is_file()}
    require(actual_files == expected_files, "Unmanifested or missing asset files")
    print(
        f"PASS: 56 IDs, 56 exact PDF PNGs, {vector_count} bounded original SVGs, "
        f"{len(covered_pages)} source-page coverage records, hashes and review gates."
    )


if __name__ == "__main__":
    main()
