#!/usr/bin/env python3
"""Validate provenance, exact original paths, bounds, artwork and coverage."""

import argparse
import copy
import json
from pathlib import Path
from typing import TypedDict, cast

import pymupdf
from lxml import etree
from PIL import Image, ImageChops

from extract import (
    DEST,
    RECIPE_PATH,
    ROOT,
    SCALE,
    Recipe,
    check_image,
    digest,
    load_sources,
    make_svg,
    paint_paths,
    select_paths,
    svg_image,
    write_json,
)


class Asset(TypedDict):
    id: str
    files: dict[str, str | None]
    file_sha256: dict[str, str]
    source: dict[str, object]
    review: dict[str, object]
    extraction: dict[str, object]
    dimensions_mm: dict[str, object]
    release_ready: bool


class Coverage(TypedDict):
    source_id: str
    pdf_page: int
    asset_ids: list[str]
    status: str


class Manifest(TypedDict):
    assets: list[Asset]
    sources: list[dict[str, object]]
    coverage: list[Coverage]


def local_file(relative: str) -> Path:
    assert relative != "null"
    path = (ROOT / relative).resolve()
    assert path.is_relative_to(DEST)
    assert path.is_file()
    return path


def validate(source_dir: Path, report: Path) -> None:
    recipe = cast(Recipe, json.loads(RECIPE_PATH.read_text()))
    docs = load_sources(recipe, source_dir, False)
    manifest = cast(Manifest, json.loads((DEST / "manifest.json").read_text()))
    assert len(manifest["assets"]) == len(recipe["assets"]) == 12
    ids = [asset["id"] for asset in manifest["assets"]]
    assert len(set(ids)) == len(ids)
    pairs = [(row["source_id"], row["pdf_page"]) for row in manifest["coverage"]]
    expected = [
        (source["id"], page)
        for source in recipe["sources"]
        for page in range(1, source["page_count"] + 1)
    ]
    assert sorted(pairs) == sorted(expected)
    for row in manifest["coverage"]:
        assert set(row["asset_ids"]) <= set(ids)
        if row["source_id"] == "lta-sdre-i-tfm" and row["pdf_page"] > 1:
            assert row["status"] == "extracted" and len(row["asset_ids"]) == 6
    results = []
    all_paths = set()
    for asset, face in zip(manifest["assets"], recipe["assets"]):
        assert asset["id"] == "sg.mandatory." + face["slug"]
        assert not asset["release_ready"]
        assert asset["review"]["status"] == "cleaned_unverified"
        assert asset["source"]["source_id"] == "lta-sdre-i-tfm"
        assert asset["source"]["pdf_page"] == face["pdf_page"]
        assert asset["source"]["bbox_pdf_points"] == face["reference_bbox"]
        assert asset["extraction"]["recipe_sha256"] == digest(RECIPE_PATH)
        sheet = recipe["pages"][face["pdf_page"] - 2]
        assert asset["source"]["drawing"] == sheet["drawing"]
        assert asset["source"]["drawing_revision"] == sheet["drawing_revision"] == "-"
        assert asset["source"]["printed_page"] == sheet["printed_page"]
        for key, relative in asset["files"].items():
            if relative is not None:
                path = local_file(relative)
                assert relative not in all_paths
                all_paths.add(relative)
                assert digest(path) == asset["file_sha256"][key]
        reference_path = local_file(cast(str, asset["files"]["reference_png"]))
        svg_path = local_file(cast(str, asset["files"]["renderer_svg"]))
        svg = svg_path.read_bytes()
        assert b"data:" not in svg and b"base64" not in svg and b"url(" not in svg
        root = etree.fromstring(svg)
        assert all(
            etree.QName(node).localname in ("svg", "path") for node in root.iter()
        )
        assert not root.xpath('//@*[local-name()="href"]')
        page = docs["lta-sdre-i-tfm"][face["pdf_page"] - 1]
        assert page.rect.contains(pymupdf.Rect(face["reference_bbox"]))
        paths, drawings = paint_paths(page, sheet["path_count"])
        selected = select_paths(face, drawings)
        assert asset["extraction"]["source_paint_path_indices_zero_based"] == selected
        assert svg == make_svg(face, paths, drawings, selected)
        assert len(root) == len(selected) + 1 < len(paths) // 4
        for exported, index in zip(list(root)[1:], selected):
            assert exported.items() == paths[index].items()
        image = svg_image(svg)
        reference = Image.open(reference_path).convert("RGB")
        check_image(image)
        check_image(reference)
        pixmap = page.get_pixmap(
            matrix=pymupdf.Matrix(SCALE, SCALE),
            clip=pymupdf.Rect(face["reference_bbox"]),
        )
        assert reference.tobytes() == pixmap.samples
        rendered_doc = pymupdf.open(stream=svg, filetype="svg")
        rgba = rendered_doc[0].get_pixmap(
            matrix=pymupdf.Matrix(SCALE, SCALE), alpha=True
        )
        alpha = Image.frombytes(
            "RGBA", (rgba.width, rgba.height), rgba.samples
        ).getchannel("A")
        assert alpha.getpixel((0, 0)) == 0, "Exterior must remain transparent"
        assert alpha.getpixel((alpha.width // 2, alpha.height // 2)) == 255
        # Render with a huge viewport to detect hidden source content beyond the crop.
        expanded = copy.deepcopy(root)
        x0, y0, x1, y1 = face["face_bbox"]
        expanded.set(
            "viewBox", f"{x0 - 100} {y0 - 100} {x1 - x0 + 200} {y1 - y0 + 200}"
        )
        expanded.set("width", str(x1 - x0 + 200))
        expanded.set("height", str(y1 - y0 + 200))
        wide = svg_image(etree.tostring(expanded))
        ink = ImageChops.difference(
            wide, Image.new("RGB", wide.size, "white")
        ).getbbox()
        assert ink is not None
        assert ink[0] >= 100 * SCALE and ink[1] >= 100 * SCALE
        assert (
            ink[2] <= wide.width - 100 * SCALE and ink[3] <= wide.height - 100 * SCALE
        )
        results.append(
            {
                "id": asset["id"],
                "selected_source_paths": len(selected),
                "reference_png_matches_pdf_pixels": True,
                "svg_paths_match_source": True,
                "opaque_backing_transparent_exterior": True,
                "no_hidden_page_content": True,
                "nonblank": True,
            }
        )
    assert len(all_paths) == 24
    for face in recipe["assets"]:
        if face["slug"] in ("keep-left", "keep-right"):
            assert not face["dimensions_mm"]
    assert (
        len([row for row in manifest["coverage"] if row["status"] == "extracted"]) == 2
    )
    report.parent.mkdir(parents=True, exist_ok=True)
    write_json(
        report,
        {
            "assets_checked": len(results),
            "files_checked": len(all_paths),
            "source_pages_accounted_for": len(pairs),
            "results": results,
        },
    )
    print(
        f"Passed: {len(results)} faces, {len(all_paths)} files, {len(pairs)} source pages"
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sources", type=Path, required=True)
    parser.add_argument("--report", type=Path, required=True)
    args = parser.parse_args()
    validate(args.sources.resolve(), args.report.resolve())
