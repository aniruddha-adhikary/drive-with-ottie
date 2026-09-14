#!/usr/bin/env python3
"""Reproduce bounded TFP references from the exact official PDF bytes."""

import argparse
import copy
import hashlib
import json
import math
from pathlib import Path
import re
import urllib.request
import xml.etree.ElementTree as ET

from PIL import Image, ImageChops, ImageDraw, ImageFont, ImageStat
import pymupdf


HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]
ASSET_PATH = Path("assets/sg/prohibitory")
RECIPE_PATH = Path("tools/asset_extraction/prohibitory/recipe.json")
SVG_NS = "http://www.w3.org/2000/svg"
ET.register_namespace("", SVG_NS)


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def write_json(path: Path, value: object) -> None:
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n")


def load_sources(recipe, source_dir: Path, download: bool):
    documents = {}
    for source in recipe["sources"]:
        path = source_dir / source["filename"]
        if not path.exists() and download:
            with urllib.request.urlopen(source["url"], timeout=120) as response:
                path.write_bytes(response.read())
        if digest(path) != source["sha256"]:
            raise ValueError(f"Source SHA-256 mismatch: {path.name}")
        doc = pymupdf.open(path)
        if len(doc) != source["pages"] or not doc.is_pdf:
            raise ValueError(f"Unexpected PDF format/page count: {path.name}")
        documents[source["id"]] = doc
    return documents


def drawing_bounds(drawing) -> pymupdf.Rect:
    pad = (drawing["width"] or 0) / 2 + 0.05
    return drawing["rect"] + (-pad, -pad, pad, pad)


def clip_line(start, end, box):
    lower, upper = 0.0, 1.0
    dx, dy = end.x - start.x, end.y - start.y
    for p, q in (
        (-dx, start.x - box.x0), (dx, box.x1 - start.x),
        (-dy, start.y - box.y0), (dy, box.y1 - start.y),
    ):
        if p == 0:
            if q < 0:
                return None
        elif p < 0:
            lower = max(lower, q / p)
        else:
            upper = min(upper, q / p)
    return (lower, upper) if lower <= upper else None


def stroke_intersects(drawing, box) -> bool:
    if drawing["type"] != "s":
        return drawing_bounds(drawing).intersects(box)
    pad = drawing["width"] / 2 + 0.05
    expanded = box + (-pad, -pad, pad, pad)
    for item in drawing["items"]:
        if item[0] == "l":
            edges = [(item[1], item[2])]
        elif item[0] == "qu":
            quad = item[1]
            edges = [(quad.ul, quad.ur), (quad.ur, quad.lr),
                     (quad.lr, quad.ll), (quad.ll, quad.ul)]
        elif item[0] == "re":
            rect = item[1]
            edges = [(rect.tl, rect.tr), (rect.tr, rect.br),
                     (rect.br, rect.bl), (rect.bl, rect.tl)]
        else:
            return drawing_bounds(drawing).intersects(box)
        if any(clip_line(start, end, expanded) is not None for start, end in edges):
            return True
    return False


def bounded_nodes(box, cached):
    paths, drawings = cached
    selected, operations, unsupported = [], [], []
    allowed = box + (-12, -12, 12, 12)
    for index, (node, drawing) in enumerate(zip(paths, drawings)):
        if not stroke_intersects(drawing, box):
            continue
        bounds = drawing_bounds(drawing)
        if allowed.contains(bounds):
            selected.append(copy.deepcopy(node))
            operations.append({"source_path_index": index, "operation": "unchanged"})
        elif drawing["type"] == "s" and len(drawing["items"]) == 1 and drawing["items"][0][0] == "l":
            _, start, end = drawing["items"][0]
            pad = drawing["width"] / 2 + 0.05
            interval = clip_line(start, end, box + (-pad, -pad, pad, pad))
            if interval is None:
                continue
            transform = node.attrib["transform"]
            matrix = pymupdf.Matrix(*[float(v) for v in re.findall(
                r"-?(?:\d+(?:\.\d*)?|\.\d+)", transform,
            )])
            inverse = ~matrix
            lower, upper = interval
            first = (start + (end - start) * lower) * inverse
            last = (start + (end - start) * upper) * inverse
            clipped = copy.deepcopy(node)
            clipped.set("d", f"M{first.x:.8f} {first.y:.8f}L{last.x:.8f} {last.y:.8f}")
            if "stroke-dasharray" in node.attrib:
                distance = abs((end * inverse) - (start * inverse)) * lower
                offset = float(node.get("stroke-dashoffset", "0")) + distance
                clipped.set("stroke-dashoffset", f"{offset:.8f}")
            selected.append(clipped)
            operations.append({
                "source_path_index": index, "operation": "clip_straight_annotation",
                "source_line_fraction": [lower, upper],
            })
        elif drawing["type"] == "f" and all(item[0] == "re" for item in drawing["items"]):
            rectangles = [item[1] for item in drawing["items"]]
            if any(a.intersects(b) for i, a in enumerate(rectangles) for b in rectangles[i + 1:]):
                unsupported.append(index)
                continue
            subpaths = re.findall(r"M[^M]+", node.attrib["d"])
            if len(subpaths) != len(rectangles) or any("m" in part for part in subpaths):
                unsupported.append(index)
                continue
            for part, (subpath, rect) in enumerate(zip(subpaths, rectangles)):
                if not rect.intersects(box):
                    continue
                if not allowed.contains(rect):
                    unsupported.append(index)
                    continue
                split = copy.deepcopy(node)
                split.set("d", subpath)
                selected.append(split)
                operations.append({
                    "source_path_index": index, "operation": "isolate_disjoint_rectangle",
                    "subpath_index": part,
                })
        else:
            unsupported.append(index)
    return selected, operations, unsupported


def svg_paths(page):
    root = ET.fromstring(page.get_svg_image())
    definitions = root.find(f"{{{SVG_NS}}}defs")
    if definitions is not None:
        for clip in definitions:
            if clip.tag != f"{{{SVG_NS}}}clipPath" or len(clip) != 1:
                raise ValueError("Unsupported SVG definition; do not flatten it")
            number = r"-?(?:\d+(?:\.\d*)?|\.\d+)"
            if not re.fullmatch(
                rf"M{number}(?: |(?=-)){number}V{number}H{number}V{number}Z",
                clip[0].attrib["d"],
            ):
                raise ValueError("Clip must be an axis-aligned rectangle")
            test = ET.Element(f"{{{SVG_NS}}}svg", {
                "width": str(page.rect.width),
                "height": str(page.rect.height),
            })
            test.append(copy.deepcopy(clip[0]))
            with pymupdf.open("svg", ET.tostring(test)) as clip_doc:
                clip_pdf = pymupdf.open("pdf", clip_doc.convert_to_pdf())
                clips = clip_pdf[0].get_drawings()
                if len(clips) != 1:
                    raise ValueError("Clip path cannot be verified")
                rect = clips[0]["rect"]
                if max(abs(a - b) for a, b in zip(rect, page.rect)) > 0.25:
                    raise ValueError("Non-page SVG clip must be preserved")
        root.remove(definitions)
    for group in root.iter(f"{{{SVG_NS}}}g"):
        if set(group.attrib) != {"clip-path"}:
            raise ValueError("Unexpected inherited SVG attributes")
    paths = list(root.iter(f"{{{SVG_NS}}}path"))
    drawings = page.get_drawings()
    if len(paths) != len(drawings):
        raise ValueError("SVG/PDF draw-operation count differs")
    if page.get_fonts() or page.get_images():
        raise ValueError("This recipe expects outlined text and vector artwork")
    if page.rotation:
        raise ValueError("This recipe expects unrotated source pages")
    return paths, drawings


def extract_svg(box: pymupdf.Rect, path: Path, cached):
    selected, operations, crossing = bounded_nodes(box, cached)
    if not selected:
        raise ValueError("Empty vector crop")
    if crossing:
        return {
            "available": False,
            "reason": "An unsupported crossing source path extends more than 12 pt outside "
            "the crop. Lossless PNG retained instead of embedding distant content.",
            "crossing_source_path_indices": crossing,
        }
    root = ET.Element(f"{{{SVG_NS}}}svg", {
        "version": "1.1",
        "width": str(box.width),
        "height": str(box.height),
        "viewBox": f"{box.x0} {box.y0} {box.width} {box.height}",
    })
    ET.SubElement(root, f"{{{SVG_NS}}}rect", {
        "x": str(box.x0), "y": str(box.y0),
        "width": str(box.width), "height": str(box.height), "fill": "white",
    })
    for node in selected:
        root.append(node)
    ET.indent(root)
    ET.ElementTree(root).write(path, encoding="utf-8", xml_declaration=True)
    return {
        "available": True,
        "operations": operations,
        "path_count": len(selected),
        "page_path_count": len(cached[1]),
        "max_outside_crop_points": 12,
        "method": "Copy intersecting original SVG leaf paths in paint order. "
        "Discard non-intersecting painted paths and verified page clip definitions. "
        "Clip distant straight annotation lines mathematically, preserving dash phase; "
        "split disjoint rectangular subpaths to avoid embedding other faces' lettering. "
        "All other d/transform/style attributes are unchanged. Viewport bounds trim "
        "only nearby annotation segments (at most 12 pt outside crop).",
    }


def pixmap_image(pixmap) -> Image.Image:
    return Image.frombytes("RGB", (pixmap.width, pixmap.height), pixmap.samples)


def check_image(image: Image.Image) -> float:
    difference = ImageChops.difference(image.convert("RGB"), Image.new(
        "RGB", image.size, "white",
    )).convert("L")
    if difference.getbbox() is None:
        raise ValueError("Blank exported image")
    ink = difference.point(lambda value: 255 if value > 15 else 0)
    fraction = ImageStat.Stat(ink).mean[0] / 255
    if fraction < 0.005:
        raise ValueError("Export contains too little artwork")
    return fraction


def compare_svg(svg: Path, reference: Image.Image, scale: float):
    with pymupdf.open(svg) as doc:
        image = pixmap_image(doc[0].get_pixmap(
            matrix=pymupdf.Matrix(scale, scale), alpha=False,
        ))
        with pymupdf.open("pdf", doc.convert_to_pdf()) as converted:
            allowed = converted[0].rect + (-12, -12, 12, 12)
            if any(not allowed.contains(drawing_bounds(drawing))
                   for drawing in converted[0].get_drawings()):
                raise ValueError("SVG contains distant out-of-bounds paths")
    if image.size != reference.size:
        raise ValueError(f"SVG raster size differs: {svg.name}")
    check_image(image)
    ink_a = image.convert("L").point(lambda v: 255 if v < 240 else 0)
    ink_b = reference.convert("L").point(lambda v: 255 if v < 240 else 0)
    mismatch = ImageStat.Stat(ImageChops.difference(ink_a, ink_b)).mean[0] / 255
    if mismatch > 0.001:
        raise ValueError(f"SVG geometry differs from PDF crop: {svg.name}: {mismatch}")
    difference = ImageStat.Stat(ImageChops.difference(image, reference))
    return {
        "ink_mask_mismatch_fraction": round(mismatch, 6),
        "mean_absolute_rgb_difference": round(sum(difference.mean) / 3, 6),
    }


def coverage_entries(documents, recipe, assets):
    entries = []
    sheets = {sheet["pdf_page"]: sheet for sheet in recipe["sheets"]}
    for source_id, doc in documents.items():
        for page in doc:
            number = page.number + 1
            ids = [
                asset["id"] for asset in assets
                if asset["source"]["source_id"] == source_id
                and asset["source"]["pdf_page"] == number
            ]
            drawing = None
            if source_id == "lta-sdre-i-tfp":
                if number == 1:
                    status = "not_applicable"
                    reason = "Chapter cover/index; six drawing titles and revisions, no sign faces."
                else:
                    drawing = sheets[number]["drawing"]
                    status = "extracted"
                    reason = f"All {len(ids)} depicted faces/panels extracted as source references. "
                    reason += "Engineering leaders, title blocks and notes are not additional faces."
                    if number == 7:
                        reason += " Support poles are structural context, outside face extraction."
            elif source_id == "lta-sdre-i-contents":
                status = "reference_only" if number in (1, 2, 5) else "not_applicable"
                reason = {
                    1: "Collection cover verifies Revision I, March 2026.",
                    2: "General notes, including millimetres (9) and sign corners/sizing (10); no face artwork.",
                    5: "Contents lists the six TFP sheets; no face artwork.",
                }.get(number, "Collection contents for other chapters; outside TFP face scope.")
            elif number in (12, 13, 14):
                status = "reference_only"
                reason = "Current handbook prohibitory meanings consulted. Handbook artwork is not "
                reason += "extracted; this task targets the six TFP sheets."
            else:
                status = "not_applicable"
                reason = "Handbook page outside the consulted prohibitory section; not evaluated "
                reason += "for artwork extraction under this TFP-only scope."
            entries.append({
                "source_id": source_id, "pdf_page": number, "drawing": drawing,
                "asset_ids": ids, "status": status, "reason": reason,
            })
    return entries


def make_contact_sheet(assets, output: Path, review: Path, vector: bool = False) -> None:
    columns, cell_w, cell_h = 4, 390, 410
    sheet = Image.new("RGB", (
        columns * cell_w, 70 + math.ceil(len(assets) / columns) * cell_h,
    ), "#e8edf2")
    draw = ImageDraw.Draw(sheet)
    title_font = ImageFont.load_default(size=24)
    label_font = ImageFont.load_default(size=16)
    format_name = "SVG" if vector else "PNG"
    draw.text((16, 15), f"TFP prohibitory {format_name} references - all {len(assets)} faces/panels",
              fill="black", font=title_font)
    for index, asset in enumerate(assets):
        x = (index % columns) * cell_w
        y = 70 + (index // columns) * cell_h
        draw.rectangle((x + 8, y + 8, x + cell_w - 8, y + cell_h - 8), fill="white")
        if vector and asset["files"]["reference_svg"]:
            with pymupdf.open(output / Path(asset["files"]["reference_svg"]).name) as doc:
                image = pixmap_image(doc[0].get_pixmap(matrix=pymupdf.Matrix(2, 2)))
        else:
            image = Image.open(output / Path(asset["files"]["reference_png"]).name)
        image.thumbnail((cell_w - 32, cell_h - 95))
        sheet.paste(image, (
            x + (cell_w - image.width) // 2, y + 12 + (cell_h - 95 - image.height) // 2,
        ))
        slug = asset["id"].removeprefix("sg.prohibitory.")
        words = slug.split("-")
        lines, line = [], ""
        for word in words:
            if len(line) + len(word) > 36:
                lines.append(line)
                line = ""
            line += ("-" if line else "") + word
        lines.append(line)
        draw.multiline_text((x + 16, y + cell_h - 77), "\n".join(lines),
                            fill="black", font=label_font, spacing=2)
        draw.text((x + 16, y + cell_h - 28),
                  f"PDF p{asset['source']['pdf_page']} / {asset['source']['drawing'].split('/')[-1]}"
                  f"  {'SVG + PNG' if asset['files']['reference_svg'] else 'PNG'}",
                  fill="#34435a", font=label_font)
    sheet.save(review / ("contact-sheet-svg.png" if vector else "contact-sheet.png"))


def make_source_reviews(doc, assets, review: Path) -> None:
    for number in range(2, 8):
        page = doc[number - 1]
        original = pixmap_image(page.get_pixmap(matrix=pymupdf.Matrix(2, 2)))
        original.save(review / f"tfp{number - 1}-original.png")
        draw = ImageDraw.Draw(original)
        for asset in assets:
            if asset["source"]["pdf_page"] != number:
                continue
            box = asset["source"]["bbox_pdf_points"]
            draw.rectangle(tuple(value * 2 for value in box), outline="#006bff", width=3)
        original.save(review / f"tfp{number - 1}-crop-map.png")
        page.get_pixmap(matrix=pymupdf.Matrix(3, 3), clip=pymupdf.Rect(
            750, 702, 1155, 832,
        )).save(review / f"tfp{number - 1}-title-block.png")


def validate(manifest, documents, output: Path, scale: float, svg_paths_cache):
    assets = manifest["assets"]
    ids = [asset["id"] for asset in assets]
    if len(ids) != len(set(ids)) or len(ids) != 33:
        raise ValueError("Expected 33 unique faces/panels")
    expected_files = {"manifest.json"}
    checks = []
    for asset in assets:
        if not set(asset["related_assets"]).issubset(ids):
            raise ValueError("Unknown related asset ID")
        recipe_path = REPO / asset["extraction"]["recipe"]
        if not recipe_path.is_file():
            raise ValueError("Missing extraction recipe")
        source = asset["source"]
        page = documents[source["source_id"]][source["pdf_page"] - 1]
        box = pymupdf.Rect(source["bbox_pdf_points"])
        if not page.rect.contains(box) or box.is_empty:
            raise ValueError("Invalid source crop")
        for key, relative in asset["files"].items():
            if relative is None:
                continue
            if Path(relative).parent != ASSET_PATH:
                raise ValueError("Asset path escapes the family directory")
            path = output / Path(relative).name
            expected_files.add(path.name)
            if not path.is_file() or digest(path) != asset["file_sha256"][key]:
                raise ValueError("Missing or changed asset file")
        reference = Image.open(output / Path(asset["files"]["reference_png"]).name).convert("RGB")
        expected = pixmap_image(page.get_pixmap(
            matrix=pymupdf.Matrix(scale, scale), clip=box, alpha=False,
        ))
        if reference.size != expected.size or reference.tobytes() != expected.tobytes():
            raise ValueError("PNG does not match the exact PDF crop")
        check = {"id": asset["id"], "ink_fraction": round(check_image(reference), 6),
                 "png_exact_source_pixels": True}
        if asset["files"]["reference_svg"]:
            path = output / Path(asset["files"]["reference_svg"]).name
            root = ET.parse(path).getroot()
            for node in root.iter():
                if node.tag not in {f"{{{SVG_NS}}}{tag}" for tag in ("svg", "rect", "path")}:
                    raise ValueError("Unexpected SVG element")
                for key, value in node.attrib.items():
                    if key.lower().startswith("on") or "href" in key or "url(" in value or "data:" in value:
                        raise ValueError("Unsafe SVG reference")
            expected_nodes, operations, unsupported = bounded_nodes(
                box, svg_paths_cache[source["pdf_page"]],
            )
            exported = list(root.iter(f"{{{SVG_NS}}}path"))
            if unsupported or len(exported) != len(expected_nodes):
                raise ValueError("Wrong vector path count")
            if operations != asset["extraction"]["vector"]["operations"]:
                raise ValueError("Vector transformation audit differs")
            for expected_node, node in zip(expected_nodes, exported):
                if node.attrib != expected_node.attrib:
                    raise ValueError("Original vector geometry/style changed")
            check.update(compare_svg(path, reference, scale))
        if asset["release_ready"] or asset["license_status"] != "unreviewed":
            raise ValueError("Unreviewed references cannot be release-ready")
        checks.append(check)
    if set(path.name for path in output.iterdir()) - expected_files:
        raise ValueError("Unexpected stale files in asset output directory")
    expected_pages = {(source, p + 1) for source, doc in documents.items() for p in range(len(doc))}
    actual_pages = [(row["source_id"], row["pdf_page"]) for row in manifest["coverage"]]
    if set(actual_pages) != expected_pages or len(actual_pages) != len(expected_pages):
        raise ValueError("Coverage must account for every source page once")
    return checks


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-dir", type=Path, required=True)
    parser.add_argument("--review-dir", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, default=REPO / ASSET_PATH)
    parser.add_argument("--download", action="store_true")
    args = parser.parse_args()
    for directory in (args.source_dir, args.review_dir):
        if directory.resolve().is_relative_to(REPO):
            raise ValueError("Original PDFs and large review images must remain outside git")
        directory.mkdir(parents=True, exist_ok=True)
    args.output_dir.mkdir(parents=True, exist_ok=True)
    if pymupdf.VersionBind != "1.26.3":
        raise ValueError("Use the pinned PyMuPDF version")
    recipe = json.loads((HERE / "recipe.json").read_text())
    documents = load_sources(recipe, args.source_dir, args.download)
    doc = documents["lta-sdre-i-tfp"]
    sheets = {sheet["pdf_page"]: sheet for sheet in recipe["sheets"]}
    svg_paths_cache = {}
    for number in sheets:
        svg_paths_cache[number] = svg_paths(doc[number - 1])
    scale = recipe["png_dpi"] / 72
    assets = []
    for crop in recipe["crops"]:
        page = doc[crop["pdf_page"] - 1]
        box = pymupdf.Rect(crop["bbox"])
        stem = crop["slug"] + ".reference"
        png_path = args.output_dir / f"{stem}.png"
        svg_path = args.output_dir / f"{stem}.svg"
        page.get_pixmap(matrix=pymupdf.Matrix(scale, scale), clip=box, alpha=False).save(png_path)
        vector = extract_svg(box, svg_path, svg_paths_cache[crop["pdf_page"]])
        warnings = [
            "Source reference includes original engineering annotations/ticks where they intersect "
            "the face. Not cleaned production artwork.",
            "Artwork extraction does not verify traffic behaviour, applicability, or reuse rights.",
        ] + crop.get("warnings", [])
        if vector["available"]:
            warnings.append("MuPDF SVG colour conversion may differ from colour-managed PDF "
                            "rasterization; no colour values were manually changed. PNG is the "
                            "exact colour-managed source reference.")
        else:
            warnings.append(vector["reason"])
        files = {
            "reference_svg": str(ASSET_PATH / svg_path.name) if vector["available"] else None,
            "reference_png": str(ASSET_PATH / png_path.name),
            "renderer_svg": None,
            "geometry_json": None,
        }
        assets.append({
            "id": "sg.prohibitory." + crop["slug"], "name": crop["name"],
            "kind": "sign_face", "representation": "source_reference",
            "files": files,
            "source": {"source_id": "lta-sdre-i-tfp", **sheets[crop["pdf_page"]],
                       "bbox_pdf_points": crop["bbox"]},
            "extraction": {
                "method": "Lossless 288 dpi PDF crop; bounded original-vector leaf-path "
                "extraction when distant crossing paths do not prevent isolation.",
                "tool": "PyMuPDF", "tool_version": pymupdf.VersionBind,
                "recipe": str(RECIPE_PATH), "recipe_key": crop["slug"],
                "png_dpi": recipe["png_dpi"], "vector": vector,
            },
            "review": {"status": "extracted_reference", "warnings": warnings},
            "dimensions_mm": {}, "license_status": "unreviewed", "release_ready": False,
            "related_assets": ["sg.prohibitory." + slug for slug in crop.get("related_assets", [])],
            "file_sha256": {key: digest(args.output_dir / Path(value).name)
                            for key, value in files.items() if value is not None},
        })
    manifest = {
        "schema_version": 1, "family": "prohibitory",
        "sources": [{**source, "retrieved_at": recipe["retrieved_at"]}
                    for source in recipe["sources"]],
        "assets": assets,
        "coverage": coverage_entries(documents, recipe, assets),
    }
    checks = validate(manifest, documents, args.output_dir, scale, svg_paths_cache)
    write_json(args.output_dir / "manifest.json", manifest)
    write_json(args.review_dir / "validation.json", {
        "asset_count": len(assets), "covered_source_pages": len(manifest["coverage"]),
        "vector_count": sum(bool(asset["files"]["reference_svg"]) for asset in assets),
        "checks": checks,
    })
    write_json(args.review_dir / "page-inventory.json", [
        {"source_id": source_id, "pdf_page": page.number + 1,
         "page_box_points": list(page.rect), "rotation": page.rotation,
         "vector_paths": len(page.get_drawings()), "images": len(page.get_images()),
         "fonts": len(page.get_fonts()), "extracted_text_characters": len(page.get_text())}
        for source_id, source_doc in documents.items() for page in source_doc
    ])
    make_contact_sheet(assets, args.output_dir, args.review_dir)
    make_contact_sheet(assets, args.output_dir, args.review_dir, vector=True)
    make_source_reviews(doc, assets, args.review_dir)
    print(json.dumps({
        "assets": len(assets),
        "svg_references": sum(bool(asset["files"]["reference_svg"]) for asset in assets),
        "png_references": len(assets), "coverage_pages": len(manifest["coverage"]),
        "contact_sheet": str(args.review_dir / "contact-sheet.png"),
    }, indent=2))


if __name__ == "__main__":
    main()
