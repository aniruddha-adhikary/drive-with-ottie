"""Validate all families and optionally regenerate the root asset index."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
import xml.etree.ElementTree as ET
from collections import Counter
from pathlib import Path

import numpy as np
import pymupdf
from defusedxml.ElementTree import fromstring
from PIL import Image, ImageChops
from svgpathtools import parse_path
from svgpathtools.parser import parse_transform
from svgpathtools.path import transform

from contract import FAMILIES, Asset, Manifest, Source

ROOT = Path(__file__).resolve().parents[2]
SVG = "{http://www.w3.org/2000/svg}"
ROLES = {"reference_png", "reference_svg", "renderer_svg", "geometry_json"}
TAGS = {"svg", "g", "defs", "clipPath", "path", "rect", "circle"}
ATTRS = {
    "version",
    "width",
    "height",
    "viewBox",
    "id",
    "transform",
    "d",
    "fill",
    "fill-rule",
    "stroke",
    "stroke-width",
    "stroke-linecap",
    "stroke-linejoin",
    "stroke-miterlimit",
    "stroke-dasharray",
    "stroke-dashoffset",
    "clip-path",
    "clip-rule",
    "clipPathUnits",
    "x",
    "y",
    "rx",
    "ry",
    "cx",
    "cy",
    "r",
}


def require(condition: bool, message: str) -> None:
    if not condition:
        raise ValueError(message)


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def local_file(root: Path, relative: str, prefix: str) -> Path:
    path = Path(relative)
    require(
        not path.is_absolute() and ".." not in path.parts and "\\" not in relative,
        f"Unsafe path: {relative}",
    )
    resolved = (root / path).resolve()
    require(resolved.is_relative_to(root / prefix), f"Outside {prefix}: {relative}")
    require(
        resolved.is_file() and resolved.stat().st_size > 0, f"Missing/empty: {relative}"
    )
    return resolved


def source_cache(directory: Path) -> dict[str, Path]:
    paths: dict[str, Path] = {}
    for path in sorted(directory.rglob("*.pdf")):
        paths.setdefault(digest(path), path)
    return paths


def check_source(source: Source, root: Path, cache: dict[str, Path]) -> Path:
    if source.snapshot_file is not None:
        path = local_file(root, source.snapshot_file, "tools/asset_extraction")
        require(digest(path) == source.sha256, f"Snapshot hash: {source.id}")
        require(source.page_count is None, "Text capture cannot declare PDF pages")
        return path
    require(source.page_count is not None, f"Missing page count: {source.id}")
    require(
        source.sha256 in cache, f"Missing original/source hash mismatch: {source.id}"
    )
    path = cache[source.sha256]
    require(path.read_bytes().startswith(b"%PDF-"), f"Not a real PDF: {source.id}")
    with pymupdf.open(path) as document:
        require(len(document) == source.page_count, f"Page count: {source.id}")
    return path


def check_coverage(manifest: Manifest) -> None:
    sources = {s.id: s for s in manifest.sources}
    require(len(sources) == len(manifest.sources), "Duplicate source IDs")
    assets = {a.id: a for a in manifest.assets}
    require(len(assets) == len(manifest.assets), "Duplicate asset IDs")
    expected = {
        (s.id, page)
        for s in manifest.sources
        if s.page_count is not None
        for page in range(1, s.page_count + 1)
    }
    pages = [
        (c.source_id, c.pdf_page) for c in manifest.coverage if c.pdf_page is not None
    ]
    require(len(pages) == len(set(pages)) and set(pages) == expected, "Page coverage")
    seen: list[str] = []
    for row in manifest.coverage:
        require(row.source_id in sources, "Unknown coverage source")
        if row.pdf_page is None:
            require(not row.asset_ids, "Non-page coverage must not own artwork")
            require(
                sources[row.source_id].snapshot_file is not None
                or (row.status == "deferred" and row.drawing is not None),
                "Unexplained non-page coverage",
            )
        for asset_id in row.asset_ids:
            require(asset_id in assets, f"Unknown coverage ID: {asset_id}")
            asset = assets[asset_id]
            require(
                (asset.source.source_id, asset.source.pdf_page, asset.source.drawing)
                == (row.source_id, row.pdf_page, row.drawing),
                f"Coverage locator mismatch: {asset_id}",
            )
            seen.append(asset_id)
    require(
        Counter(seen) == Counter(assets.keys()), "Coverage must own every asset once"
    )


def check_release(asset: Asset) -> None:
    if asset.release_ready:
        require(
            asset.review.status == "approved"
            and asset.review.content_approved
            and asset.review.reuse_approved
            and bool(asset.review.approval_evidence)
            and asset.license_status == "approved",
            f"Missing release approvals: {asset.id}",
        )
        require(
            asset.representation != "source_reference", "Reference cannot be released"
        )
        require(not asset.review.warnings, f"Unresolved release warnings: {asset.id}")


def check_conflicts(manifests: list[Manifest]) -> None:
    assets = {a.id: a for m in manifests for a in m.assets}
    conflict = assets["sg.informatory.bus-lane-full-day-source-hours"]
    warnings = " ".join(conflict.review.warnings)
    require(
        conflict.review.status == "blocked"
        and not conflict.release_ready
        and all(
            value in warnings
            for value in ("07:30-20:00", "07:30-23:00", "54(b)", "p41")
        ),
        "TFI1 hours conflict must remain blocked and cited",
    )


def number(value: str) -> float:
    match = re.fullmatch(
        r"(-?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)(?:pt|px)?", value
    )
    require(match is not None, f"Invalid SVG dimension: {value}")
    result = float(value.removesuffix("pt").removesuffix("px"))
    require(math.isfinite(result), "Nonfinite SVG number")
    return result


def check_svg(path: Path) -> tuple[float, float]:
    data = path.read_bytes()
    lower = data.lower()
    require(
        all(
            token not in lower
            for token in (b"base64", b"data:", b"<!doctype", b"<!entity")
        ),
        f"Unsafe SVG encoding: {path}",
    )
    require(
        re.search(rb"<\?(?!xml\s)", lower) is None,
        "SVG processing instructions are forbidden",
    )
    root: ET.Element = fromstring(data)
    require(root.tag == SVG + "svg", "Not SVG")
    box = [float(v) for v in root.attrib["viewBox"].replace(",", " ").split()]
    require(len(box) == 4 and all(math.isfinite(v) for v in box), "Invalid viewBox")
    x, y, width, height = box
    require(width > 0 and height > 0, "Empty viewBox")
    require(
        math.isclose(number(root.attrib["width"]), width, abs_tol=0.01)
        and math.isclose(number(root.attrib["height"]), height, abs_tol=0.01),
        "SVG dimensions differ from viewBox",
    )
    ids = [e.attrib["id"] for e in root.iter() if "id" in e.attrib]
    require(len(ids) == len(set(ids)), "Duplicate SVG IDs")
    clip_ids = {e.attrib.get("id") for e in root.iter(SVG + "clipPath")}
    painted = 0

    def visit(element: ET.Element, matrix: np.ndarray, in_defs: bool = False) -> None:
        nonlocal painted
        tag = element.tag.removeprefix(SVG)
        require(element.tag == SVG + tag and tag in TAGS, f"Unsafe SVG tag: {tag}")
        require(
            set(element.attrib) <= ATTRS,
            f"Unsafe SVG attributes: {element.attrib.keys()}",
        )
        for key, value in element.attrib.items():
            if key == "clip-path":
                match = re.fullmatch(r"url\(#([^)]+)\)", value)
                require(
                    match is not None and match[1] in clip_ids, "External/missing clip"
                )
            else:
                require(
                    "url(" not in value.lower() and "://" not in value,
                    "External SVG reference",
                )
        require(not (element.text or "").strip(), "Unexpected SVG text")
        current = matrix @ parse_transform(element.attrib.get("transform", ""))
        require(bool(np.isfinite(current).all()), "Nonfinite SVG transform")
        if tag == "defs":
            require(
                all(child.tag == SVG + "clipPath" for child in element),
                "Hidden definitions",
            )
        if tag == "clipPath":
            require(in_defs, "Clip outside defs")
            require(
                all(child.tag == SVG + "path" for child in element), "Complex clipping"
            )
        if tag in {"path", "rect", "circle"}:
            if in_defs:
                require(tag == "path", "Hidden geometry")
                commands = re.findall(r"[a-df-zA-DF-Z]", element.attrib["d"])
                require(
                    len(commands) <= 6 and all(c in "MmLlHhVvZz" for c in commands),
                    "Clip definition contains artwork",
                )
            else:
                if tag == "path":
                    curve = transform(parse_path(element.attrib["d"]), current)
                    bounds = curve.bbox()
                else:
                    a = element.attrib
                    if tag == "rect":
                        x0, y0 = number(a.get("x", "0")), number(a.get("y", "0"))
                        w, h = number(a["width"]), number(a["height"])
                    else:
                        radius = number(a["r"])
                        x0, y0 = number(a["cx"]) - radius, number(a["cy"]) - radius
                        w = h = 2 * radius
                    require(w > 0 and h > 0, "Empty primitive")
                    points = current @ np.array(
                        [
                            [x0, x0 + w, x0, x0 + w],
                            [y0, y0, y0 + h, y0 + h],
                            [1, 1, 1, 1],
                        ]
                    )
                    bounds = (
                        min(points[0]),
                        max(points[0]),
                        min(points[1]),
                        max(points[1]),
                    )
                require(all(math.isfinite(v) for v in bounds), "Nonfinite path")
                # A limited margin retains documented crossing engineering leaders.
                margin = 20.01
                require(
                    x - margin <= bounds[0] <= bounds[1] <= x + width + margin
                    and y - margin <= bounds[2] <= bounds[3] <= y + height + margin,
                    f"Hidden/distant SVG geometry: {path.name}: {bounds}",
                )
                painted += 1
        for child in element:
            visit(child, current, in_defs or tag == "defs")

    visit(root, np.eye(3))
    require(painted > 0, "No SVG artwork")
    with pymupdf.open(stream=data, filetype="svg") as document:
        page = document[0]
        pix = page.get_pixmap(
            matrix=pymupdf.Matrix(512 / max(width, height), 512 / max(width, height)),
            alpha=True,
        )
        require(max(pix.samples[3::4]) > 0, f"Blank SVG: {path}")
    return width, height


def check_file(path: Path) -> dict[str, object]:
    if path.suffix == ".svg":
        width, height = check_svg(path)
        return {"width": width, "height": height, "units": "svg_user_units"}
    if path.suffix == ".png":
        with Image.open(path) as image:
            require(image.format == "PNG", "PNG signature mismatch")
            image.load()
            require(min(image.size) > 0, "Empty PNG dimensions")
            rgba = image.convert("RGBA")
            require(rgba.getchannel("A").getbbox() is not None, "Transparent PNG")
            visible = Image.alpha_composite(
                Image.new("RGBA", image.size, "white"), rgba
            ).convert("RGB")
            require(
                ImageChops.difference(
                    visible, Image.new("RGB", image.size, "white")
                ).getbbox()
                is not None
                and any(lo != hi for lo, hi in visible.getextrema()),
                f"Blank PNG: {path}",
            )
            return {"width": image.width, "height": image.height, "units": "pixels"}
    require(path.suffix == ".json", f"Unsupported file: {path}")
    geometry = json.loads(path.read_text())
    require(isinstance(geometry, dict) and bool(geometry), "Empty geometry")
    return {"format": "json"}


def validate_family(
    manifest: Manifest, root: Path, cache: dict[str, Path]
) -> dict[str, object]:
    check_coverage(manifest)
    sources = {s.id: check_source(s, root, cache) for s in manifest.sources}
    expected_files: set[Path] = set()
    file_details: dict[str, object] = {}
    ids = {a.id for a in manifest.assets}
    for asset in manifest.assets:
        require(asset.id.startswith(f"sg.{manifest.family}."), "ID/family mismatch")
        check_release(asset)
        require(set(asset.files) == ROLES, "Asset file roles")
        actual_roles = {
            role for role, value in asset.files.items() if value is not None
        }
        require(
            bool(actual_roles) and asset.files["reference_png"] is not None,
            "Missing reference",
        )
        require(
            set(k for k, v in asset.file_sha256.items() if v is not None)
            == actual_roles,
            "File/hash roles",
        )
        require(set(asset.related_assets) <= ids, "Unknown related asset")
        require(asset.source.source_id in sources, "Unknown asset source")
        with pymupdf.open(sources[asset.source.source_id]) as document:
            require(1 <= asset.source.pdf_page <= len(document), "Invalid source page")
            page = document[asset.source.pdf_page - 1]
            box = pymupdf.Rect(asset.source.display_box())
            require(
                not box.is_empty and page.rect.contains(box),
                f"Invalid source bounds: {asset.id}",
            )
            require(
                box.get_area() < page.rect.get_area() * 0.9,
                f"Full source page: {asset.id}",
            )
        recipe = local_file(
            root, asset.extraction.recipe, f"tools/asset_extraction/{manifest.family}"
        )
        if asset.extraction.recipe_sha256:
            require(
                digest(recipe) == asset.extraction.recipe_sha256, "Stale recipe hash"
            )
        if asset.extraction.script:
            local_file(
                root,
                asset.extraction.script,
                f"tools/asset_extraction/{manifest.family}",
            )
        for role, relative in asset.files.items():
            if relative is None:
                continue
            path = local_file(root, relative, f"assets/sg/{manifest.family}")
            require(path not in expected_files, f"Shared file path: {relative}")
            require(
                digest(path) == asset.file_sha256[role],
                f"Asset hash mismatch: {relative}",
            )
            require(
                path.suffix
                == (
                    ".json"
                    if role == "geometry_json"
                    else ".png"
                    if role == "reference_png"
                    else ".svg"
                ),
                "Role/extension mismatch",
            )
            details = check_file(path)
            if role == "reference_png" and asset.extraction.pixel_size is not None:
                require(
                    [details["width"], details["height"]]
                    == asset.extraction.pixel_size,
                    "PNG dimension mismatch",
                )
            file_details[relative] = details
            expected_files.add(path)
        if asset.representation == "parametric_geometry":
            require(
                asset.files["geometry_json"] is not None
                and asset.files["renderer_svg"] is not None
                and bool(asset.dimensions_mm),
                "Missing parametric geometry",
            )
        for value in asset.dimensions_mm.values():
            if isinstance(value, (int, float)) and not isinstance(value, bool):
                require(value > 0, "Nonpositive physical dimension")
            elif isinstance(value, dict) and "value" in value:
                require(
                    isinstance(value["value"], (int, float)) and value["value"] > 0,
                    "Invalid dimension evidence",
                )
    actual_images = {
        p.resolve()
        for p in (root / f"assets/sg/{manifest.family}").rglob("*")
        if p.suffix in {".png", ".svg"}
    }
    require(
        actual_images == {p for p in expected_files if p.suffix != ".json"},
        "Unmanifested images",
    )
    return {
        "asset_count": len(manifest.assets),
        "representations": dict(
            sorted(Counter(a.representation for a in manifest.assets).items())
        ),
        "review_statuses": dict(
            sorted(Counter(a.review.status for a in manifest.assets).items())
        ),
        "file_roles": dict(
            sorted(
                Counter(
                    k for a in manifest.assets for k, v in a.files.items() if v
                ).items()
            )
        ),
        "pdf_coverage_pages": sum(c.pdf_page is not None for c in manifest.coverage),
        "coverage_statuses": dict(
            sorted(Counter(c.status for c in manifest.coverage).items())
        ),
        "files": file_details,
    }


def validate(root: Path, source_dir: Path) -> dict[str, object]:
    cache = source_cache(source_dir)
    manifests = [
        Manifest.model_validate_json(
            (root / f"assets/sg/{family}/manifest.json").read_text()
        )
        for family in FAMILIES
    ]
    require([m.family for m in manifests] == list(FAMILIES), "Family/path mismatch")
    ids = [a.id for m in manifests for a in m.assets]
    require(len(ids) == len(set(ids)), "Cross-family duplicate ID")
    check_conflicts(manifests)
    families = {m.family: validate_family(m, root, cache) for m in manifests}
    sources: dict[str, dict[str, object]] = {}
    for manifest in manifests:
        for source in manifest.sources:
            entry: dict[str, object] = {
                "url": source.url,
                "sha256": source.sha256,
                "publisher": source.publisher,
                "page_count": source.page_count,
                "verification": "pdf_bytes_hash_verified"
                if source.page_count
                else "stored_incomplete_text_capture_hash_verified",
            }
            if source.url in sources:
                require(
                    sources[source.url]["sha256"] == source.sha256
                    and sources[source.url]["page_count"] == source.page_count,
                    "Conflicting source provenance",
                )
            sources[source.url] = entry
    assets = [
        {
            "id": a.id,
            "family": m.family,
            "name": a.name,
            "manifest": f"assets/sg/{m.family}/manifest.json",
            "representation": a.representation,
            "review_status": a.review.status,
            "files": a.files,
            "file_sha256": a.file_sha256,
            "source": a.source.model_dump(exclude_unset=True),
            "license_status": a.license_status,
            "release_ready": a.release_ready,
            "quarantined": not a.release_ready,
            "quarantine_reasons": a.review.warnings
            or ["Content and reuse approval pending."],
        }
        for m in manifests
        for a in m.assets
    ]
    failed = [
        m.family
        for m in manifests
        if any(c.status == "failed" or c.extraction_failures for c in m.coverage)
    ]
    return {
        "schema_version": 1,
        "status": "partial_family_failure"
        if failed
        else "validated_reference_library_with_deferrals",
        "complete": False,
        "failed_families": failed,
        "asset_count": len(assets),
        "release_ready_count": sum(
            a.release_ready for m in manifests for a in m.assets
        ),
        "quarantine_policy": "All non-release assets are excluded from production use; producer review statuses are preserved.",
        "families": families,
        "sources": list(sources.values()),
        "unique_pdf_pages": sum(
            s.page_count or 0
            for s in {s.sha256: s for m in manifests for s in m.sources}.values()
        ),
        "family_pdf_coverage_records": sum(
            c.pdf_page is not None for m in manifests for c in m.coverage
        ),
        "assets": assets,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=ROOT)
    parser.add_argument("--sources", type=Path, required=True)
    parser.add_argument("--write-index", action="store_true")
    parser.add_argument("--report", type=Path)
    args = parser.parse_args()
    result = validate(args.root.resolve(), args.sources)
    text = json.dumps(result, indent=2, ensure_ascii=False) + "\n"
    index = args.root / "assets/sg/index.json"
    if args.write_index:
        index.write_text(text)
    else:
        require(index.read_text() == text, "Root index is stale; use --write-index")
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(text)
    print(
        f"PASS: {result['asset_count']} assets; {result['family_pdf_coverage_records']} page records; status={result['status']}"
    )


if __name__ == "__main__":
    main()
