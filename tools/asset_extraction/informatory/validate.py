"""Validate source fingerprints, coverage, crops, SVG locality and regeneration."""

import argparse
import io
import json
import re
import xml.etree.ElementTree as ET
from pathlib import Path

import pymupdf
from PIL import Image, ImageChops, ImageStat

from extract import (
    ASSETS,
    NS,
    ROOT,
    SOURCES,
    digest,
    drawing_info,
    path_rect,
    read_recipes,
    render_svg,
    source_id,
    source_paths,
)
from inventory import upright


def validate_svg(path: Path, page: pymupdf.Page, box: pymupdf.Rect, reference: Image.Image) -> float:
    root = ET.fromstring(path.read_bytes())
    assert root.tag == f"{{{NS}}}svg"
    assert root.attrib["viewBox"] == f"0 0 {box.width:g} {box.height:g}"
    raw = path.read_text()
    assert "data:" not in raw and "base64" not in raw
    ids = {e.attrib["id"] for e in root.iter() if "id" in e.attrib}
    source, _ = source_paths(page)
    original_parts = {
        (part, tuple(sorted((k, v) for k, v in item.element.attrib.items() if k != "d")))
        for item in source
        for part in re.findall(r"M[^M]+", item.element.attrib["d"])
    }
    count = 0
    for element in root.iter():
        assert element.tag in {f"{{{NS}}}{name}" for name in ("svg", "g", "path", "defs", "clipPath")}
        for key, value in element.attrib.items():
            assert not key.startswith("on") and "href" not in key
            if "url(" in value:
                match = re.fullmatch(r"url\(#([^)]+)\)", value)
                assert match and match[1] in ids
    groups = [e for e in root if e.tag == f"{{{NS}}}g"]
    assert len(groups) == 1
    assert groups[0].attrib == {"transform": f"translate({-box.x0:g},{-box.y0:g})"}
    for element in groups[0].iter(f"{{{NS}}}path"):
        attributes = tuple(sorted((k, v) for k, v in element.attrib.items() if k != "d"))
        for part in re.findall(r"M[^M]+", element.attrib["d"]):
            assert (part, attributes) in original_parts, "Reconstructed or altered source path"
            rect = path_rect(part, element.attrib.get("transform", "matrix(1,0,0,1,0,0)"))
            assert (box + (-20.001, -20.001, 20.001, 20.001)).contains(rect)
            count += 1
    assert count > 0
    actual = render_svg(root)
    assert actual.size == reference.size
    error = sum(ImageStat.Stat(ImageChops.difference(actual, reference)).mean) / 3
    assert error <= 2, (path, error)
    return error


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--sources", type=Path, required=True)
    parser.add_argument("--output", type=Path, default=ROOT / ASSETS)
    parser.add_argument("--compare", type=Path)
    args = parser.parse_args()
    manifest = json.loads((args.output / "manifest.json").read_text())
    assert manifest["schema_version"] == 1 and manifest["family"] == "informatory"
    recipes = read_recipes()
    assert len(recipes) == len(manifest["assets"])
    assert len({a["id"] for a in manifest["assets"]}) == len(recipes)
    assert {a["id"] for a in manifest["assets"]} == {f"sg.informatory.{r.slug}" for r in recipes}
    source_names = {source_id(name): name for name in SOURCES}
    for source in manifest["sources"]:
        name = source_names[source["id"]]
        assert source["url"] == SOURCES[name][0]
        assert source["sha256"] == SOURCES[name][1] == digest(args.sources / f"{name}.pdf")
        assert source["collection_revision"] == ("I" if name != "TP" else None)
    expected_pages = {
        (source_id(name), page)
        for name, (_, _, _, count) in SOURCES.items()
        for page in range(1, count + 1)
    }
    coverage = manifest["coverage"]
    assert len(coverage) == len(expected_pages)
    assert {(c["source_id"], c["pdf_page"]) for c in coverage} == expected_pages
    ids = {a["id"] for a in manifest["assets"]}
    for entry in coverage:
        assert set(entry["asset_ids"]) <= ids
        name = source_names[entry["source_id"]]
        info = drawing_info(name, entry["pdf_page"])
        assert entry["drawing"] == (info[0] if info else None)
        assert entry["drawing_revision"] == (info[1] if info else None)
        assert entry["status"] in ("extracted", "reference_only", "not_applicable", "deferred")
    assert sum(c["drawing"] is not None for c in coverage) == 21
    files = {"manifest.json"}
    errors = []
    for recipe, asset in zip(recipes, manifest["assets"]):
        assert asset["id"] == f"sg.informatory.{recipe.slug}"
        assert asset["license_status"] == "unreviewed" and asset["release_ready"] is False
        assert asset["representation"] == "source_reference"
        assert asset["review"]["status"] in ("extracted_reference", "blocked")
        assert asset["files"]["renderer_svg"] is None and asset["files"]["geometry_json"] is None
        assert asset["source"]["bbox_pdf_points"] == list(recipe.bbox)
        info = drawing_info(recipe.source, recipe.page)
        assert info
        assert asset["source"]["drawing"] == info[0]
        assert asset["source"]["drawing_revision"] == info[1]
        assert asset["source"]["printed_page"] == info[2]
        assert (ROOT / asset["extraction"]["recipe"]).is_file()
        assert (ROOT / asset["extraction"]["script"]).is_file()
        for label, relative in asset["files"].items():
            if relative is None:
                continue
            path = Path(relative)
            assert not path.is_absolute() and ".." not in path.parts
            local = path.relative_to(ASSETS)
            files.add(str(local))
            assert (args.output / local).is_file()
            assert digest(args.output / local) == asset["file_sha256"][label]
        with pymupdf.open(args.sources / f"{recipe.source}.pdf") as document:
            original = document[recipe.page - 1]
            assert original.rotation == asset["source"]["original_page_rotation"]
            box = pymupdf.Rect(recipe.bbox)
            assert list(box * original.derotation_matrix) == asset["source"]["bbox_unrotated_pdf_points"]
            page = upright(document, recipe.page - 1)
            assert page.rect.contains(box)
            pix = page.get_pixmap(matrix=pymupdf.Matrix(2, 2), clip=box, alpha=False)
            expected = Image.open(io.BytesIO(pix.tobytes("png"))).convert("RGB")
            reference = Image.open(args.output / "reference" / f"{recipe.slug}.png").convert("RGB")
            assert ImageChops.difference(expected, reference).getbbox() is None
            assert min(ImageStat.Stat(reference).mean) < 248
            if asset["files"]["reference_svg"]:
                errors.append(validate_svg(
                    args.output / "reference" / f"{recipe.slug}.svg", page, box, reference,
                ))
    conflict = next(a for a in manifest["assets"] if a["id"].endswith(".bus-lane-full-day-source-hours"))
    assert conflict["review"]["status"] == "blocked"
    assert "07:30-20:00" in " ".join(conflict["review"]["warnings"])
    assert "07:30-23:00" in " ".join(conflict["review"]["warnings"])
    assert manifest["rules"][0]["source"]["pdf_page"] == 41
    assert {str(p.relative_to(args.output)) for p in args.output.rglob("*") if p.is_file()} == files
    if args.compare:
        other_files = {str(p.relative_to(args.compare)) for p in args.compare.rglob("*") if p.is_file()}
        assert other_files == files
        for relative in files:
            assert digest(args.output / relative) == digest(args.compare / relative), relative
    print(json.dumps({
        "assets": len(recipes), "svg": len(errors), "png": len(recipes),
        "coverage_pages": len(coverage), "drawing_sheets": 21, "files": len(files),
        "maximum_svg_pdf_mean_channel_error": max(errors),
        "byte_identical_regeneration": args.compare is not None,
    }, indent=2))


if __name__ == "__main__":
    main()
