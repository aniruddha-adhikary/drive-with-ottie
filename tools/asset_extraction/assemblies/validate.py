"""Validate provenance, paths, isolation guards, rules and every exported pixel."""

import argparse
import hashlib
import json
from pathlib import Path
import xml.etree.ElementTree as ET

import pymupdf
from PIL import Image, ImageChops, ImageStat

REPO = Path(__file__).resolve().parents[3]
FAMILY = REPO / "assets/sg/assemblies"


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def checked_path(relative: str) -> Path:
    path = (REPO / relative).resolve()
    assert path.is_relative_to(REPO) and path.is_file(), relative
    return path


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--sources", type=Path, required=True)
    parser.add_argument("--review", type=Path, required=True)
    args = parser.parse_args()
    manifest = json.loads((FAMILY / "manifest.json").read_text())
    assert manifest["schema_version"] == 1 and manifest["family"] == "assemblies"
    sources = {s["id"]: s for s in manifest["sources"]}
    assert len(sources) == len(manifest["sources"])
    for source in sources.values():
        path = (
            checked_path(source["snapshot_file"])
            if "snapshot_file" in source
            else args.sources / source["filename"]
        )
        assert digest(path) == source["sha256"], path
        if "page_count" in source:
            with pymupdf.open(path) as doc:
                assert len(doc) == source["page_count"]
                covered = [
                    c["pdf_page"]
                    for c in manifest["coverage"]
                    if c["source_id"] == source["id"] and c["pdf_page"] is not None
                ]
                assert sorted(covered) == list(range(1, len(doc) + 1))
    assets = {a["id"]: a for a in manifest["assets"]}
    assert len(assets) == len(manifest["assets"])
    svg_count = 0
    raster_count = 0
    for asset in assets.values():
        assert asset["representation"] == "source_reference"
        assert asset["review"]["status"] == "extracted_reference"
        assert (
            asset["license_status"] == "unreviewed" and asset["release_ready"] is False
        )
        assert (
            asset["files"]["renderer_svg"] is None
            and asset["files"]["geometry_json"] is None
        )
        checked_path(asset["extraction"]["recipe"])
        for key, relative in asset["files"].items():
            if relative is not None:
                path = checked_path(relative)
                assert path.parent == FAMILY
                assert digest(path) == asset["file_sha256"][key]
        src = asset["source"]
        assert 1 <= src["pdf_page"] <= sources[src["source_id"]]["page_count"]
        image = Image.open(checked_path(asset["files"]["reference_png"])).convert("RGB")
        assert min(image.size) > 10 and max(ImageStat.Stat(image).stddev) > 2
        with pymupdf.open(args.sources / sources[src["source_id"]]["filename"]) as doc:
            page = doc[src["pdf_page"] - 1]
            rect = pymupdf.Rect(src["bbox_display_pdf_points"])
            assert page.rect.contains(rect)
            mapped = rect * page.derotation_matrix
            assert (
                max(abs(a - b) for a, b in zip(mapped, src["bbox_pdf_points"])) < 0.001
            )
            if src["image_xref"]:
                pix = pymupdf.Pixmap(doc, src["image_xref"])
                assert page.get_image_rects(src["image_xref"]) == [rect]
                raster_count += 1
            else:
                page.remove_rotation()
                dpi = asset["extraction"]["raster_dpi"]
                pix = page.get_pixmap(
                    matrix=pymupdf.Matrix(dpi / 72, dpi / 72), clip=rect, alpha=False
                )
            expected = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
            for mask in src["non_subject_context_exclusions_display_pdf_points"]:
                area = pymupdf.Rect(mask)
                assert rect.contains(area)
                scale = asset["extraction"]["raster_dpi"] / 72
                box = (
                    int((area.x0 - rect.x0) * scale),
                    int((area.y0 - rect.y0) * scale),
                    int((area.x1 - rect.x0) * scale),
                    int((area.y1 - rect.y0) * scale),
                )
                expected.paste("white", box)
            assert expected.size == image.size
            assert ImageChops.difference(expected, image).getbbox() is None, asset["id"]
        if asset["files"]["reference_svg"]:
            svg_count += 1
            svg = checked_path(asset["files"]["reference_svg"]).read_text()
            assert "data:" not in svg and "<!ENTITY" not in svg
            tree = ET.fromstring(svg)
            paths = 0
            for node in tree.iter():
                tag = node.tag.split("}")[-1]
                assert tag not in ("image", "script", "foreignObject")
                paths += tag == "path"
                for key, value in node.attrib.items():
                    assert not key.lower().startswith("on")
                    if "href" in key:
                        assert value.startswith("#")
            assert paths > 0
            with pymupdf.open(stream=svg.encode(), filetype="svg") as drawing:
                raster = drawing[0].get_pixmap(matrix=pymupdf.Matrix(3, 3), alpha=False)
                rendered = Image.frombytes(
                    "RGB", (raster.width, raster.height), raster.samples
                )
                assert max(ImageStat.Stat(rendered).stddev) > 2
                assert (
                    abs(rendered.width - image.width) <= 1
                    and abs(rendered.height - image.height) <= 1
                )
                rendered.save(
                    args.review / f"svg-review-{asset['id'].split('.')[-1]}.png"
                )
    for coverage in manifest["coverage"]:
        assert coverage["source_id"] in sources
        assert coverage["status"] in (
            "extracted",
            "reference_only",
            "not_applicable",
            "deferred",
        )
        for asset_id in coverage["asset_ids"]:
            assert asset_id in assets
    definitions_path = checked_path(manifest["assembly_definitions"]["file"])
    assert digest(definitions_path) == manifest["assembly_definitions"]["sha256"]
    definitions = json.loads(definitions_path.read_text())
    ids = {d["id"] for d in definitions["definitions"]}
    assert (
        len(ids)
        == len(definitions["definitions"])
        == manifest["assembly_definitions"]["count"]
    )
    for definition in definitions["definitions"]:
        assert definition["release_ready"] is False
        assert all(asset_id in assets for asset_id in definition["source_assets"])
        if "inherits" in definition:
            assert definition["inherits"] in ids
        for evidence in definition["source_evidence"]:
            assert evidence["source_id"] in sources
    report = {
        "asset_count": len(assets),
        "bounded_svg_count": svg_count,
        "png_count": len(assets),
        "native_raster_signal_count": raster_count,
        "assembly_definition_count": len(ids),
        "pdf_pages_accounted_for": sum(
            s.get("page_count", 0) for s in sources.values()
        ),
        "checks": [
            "Original source hashes, source page counts and every-page coverage",
            "Unique asset and definition IDs; valid local paths and output hashes",
            "Every PNG equals source render/native image plus recorded non-subject exclusions",
            "Coordinate transforms and PDF bounds; every image nonblank",
            "SVGs parse and render; no image/data/remote/script/entity content",
            "Definition asset/evidence/inheritance links and release-ready=false",
        ],
        "manifest_sha256": digest(FAMILY / "manifest.json"),
        "manual_review_required": "Contact sheets and SVG review renderings; automated checks do not infer semantic orientation.",
    }
    (args.review / "validation.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
