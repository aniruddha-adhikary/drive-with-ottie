"""Build captioned review PDF, source comparisons, and page coverage report."""

from __future__ import annotations

import argparse
import io
import json
from collections import Counter
from pathlib import Path

import pymupdf
from PIL import Image

from contract import FAMILIES, Asset, Manifest
from validate import ROOT, source_cache


def thumbnail(path: Path, size: int = 500) -> bytes:
    if path.suffix == ".svg":
        with pymupdf.open(path) as document:
            page = document[0]
            pix = page.get_pixmap(
                matrix=pymupdf.Matrix(
                    size / max(page.rect.width, page.rect.height),
                    size / max(page.rect.width, page.rect.height),
                ),
                alpha=True,
            )
            image = Image.open(io.BytesIO(pix.tobytes("png"))).convert("RGBA")
    else:
        with Image.open(path) as original:
            image = original.convert("RGBA")
    image.thumbnail((size, size), Image.Resampling.LANCZOS)
    background = Image.new("RGBA", image.size, "#eeeeee")
    background.alpha_composite(image)
    output = io.BytesIO()
    background.convert("RGB").save(output, format="PNG")
    return output.getvalue()


def label(page: pymupdf.Page, rect: pymupdf.Rect, text: str, size: int = 8) -> None:
    text = text.encode("ascii", errors="replace").decode("ascii")
    if page.insert_textbox(rect, text, fontsize=size) < 0:
        raise ValueError(f"Review caption overflow: {text}")


def asset_caption(asset: Asset) -> str:
    return (
        f"{asset.id}\n{asset.name}\n"
        f"{asset.source.source_id} | PDF p{asset.source.pdf_page} | "
        f"{asset.source.drawing} | revision {asset.source.drawing_revision}\n"
        f"{asset.representation} | {asset.review.status} | release_ready={asset.release_ready}"
    )


def build(root: Path, sources: Path, output: Path) -> None:
    output.mkdir(parents=True, exist_ok=True)
    cache = source_cache(sources)
    manifests = [
        Manifest.model_validate_json(
            (root / f"assets/sg/{f}/manifest.json").read_text()
        )
        for f in FAMILIES
    ]
    pdf = pymupdf.open()
    coverage = [
        "# Singapore asset library coverage",
        "",
        "Generated from the six family manifests. Page accounting is not exhaustive artwork or variant extraction.",
        "",
    ]
    for manifest in manifests:
        source_paths = {s.id: cache[s.sha256] for s in manifest.sources if s.page_count}
        coverage += [
            f"## {manifest.family}",
            "",
            f"{len(manifest.assets)} semantic assets; review statuses: {dict(Counter(a.review.status for a in manifest.assets))}.",
            "",
            "| Source | PDF page | Drawing | Status | Assets | Reason |",
            "|---|---:|---|---|---:|---|",
        ]
        for row in manifest.coverage:
            reason = row.reason.replace("|", "/").replace("\n", " ")
            if row.extraction_failures:
                reason += f" FAILURES: {row.extraction_failures}"
            coverage.append(
                f"| {row.source_id} | {row.pdf_page or 'not supplied / text'} | "
                f"{row.drawing or '-'} | {row.status} | {len(row.asset_ids)} | {reason} |"
            )
        coverage.append("")
        for start in range(0, len(manifest.assets), 8):
            page = pdf.new_page(width=1000, height=1400)
            label(
                page,
                pymupdf.Rect(20, 10, 980, 40),
                f"{manifest.family} | reference library, NOT approved for release | items {start + 1}-{min(start + 8, len(manifest.assets))}",
                14,
            )
            for offset, asset in enumerate(manifest.assets[start : start + 8]):
                x, y = 20 + (offset % 2) * 490, 50 + (offset // 2) * 330
                label(page, pymupdf.Rect(x, y, x + 475, y + 65), asset_caption(asset))
                png = asset.files["reference_png"]
                assert png is not None
                vector = asset.files["renderer_svg"] or asset.files["reference_svg"]
                width = 230 if vector else 470
                page.insert_image(
                    pymupdf.Rect(x, y + 80, x + width, y + 315),
                    stream=thumbnail(root / png),
                )
                label(
                    page,
                    pymupdf.Rect(x, y + 65, x + width, y + 80),
                    "Source PNG reference",
                )
                if vector:
                    page.insert_image(
                        pymupdf.Rect(x + 240, y + 80, x + 475, y + 315),
                        stream=thumbnail(root / vector),
                    )
                    label(
                        page,
                        pymupdf.Rect(x + 240, y + 65, x + 475, y + 80),
                        "SVG rendering (unapproved)",
                    )
        samples = [manifest.assets[0]]
        samples += [
            asset
            for asset in manifest.assets[1:]
            if asset.review.status == "blocked"
            or asset.id.endswith("signal-green-b-source-example")
        ]
        for asset in samples:
            page = pdf.new_page(width=1400, height=1000)
            label(
                page,
                pymupdf.Rect(20, 10, 1380, 105),
                "SOURCE COMPARISON\n" + asset_caption(asset),
                11,
            )
            with pymupdf.open(source_paths[asset.source.source_id]) as original:
                original_page = original[asset.source.pdf_page - 1]
                original_page.draw_rect(
                    pymupdf.Rect(asset.source.display_box())
                    * original_page.derotation_matrix,
                    color=(1, 0, 0),
                    width=2,
                )
                pix = original_page.get_pixmap(matrix=pymupdf.Matrix(1.5, 1.5))
                page.insert_image(
                    pymupdf.Rect(20, 110, 950, 970), stream=pix.tobytes("png")
                )
            png = asset.files["reference_png"]
            assert png is not None
            page.insert_image(
                pymupdf.Rect(970, 110, 1380, 650), stream=thumbnail(root / png, 800)
            )
            label(
                page,
                pymupdf.Rect(970, 680, 1380, 970),
                "\n".join(asset.review.warnings),
                10,
            )
            page.get_pixmap().save(output / f"source-pair-{asset.id}.png")
    pdf.set_metadata(
        {
            "title": f"Singapore road controls: {sum(len(m.assets) for m in manifests)} assets pending approval",
            "author": "Drive with Ottie",
        }
    )
    pdf.save(output / "combined-review.pdf", deflate=True, garbage=4, no_new_id=True)
    pdf.close()
    (output / "coverage.md").write_text("\n".join(coverage) + "\n")
    print(
        json.dumps(
            {
                "pdf_pages": len(pymupdf.open(output / "combined-review.pdf")),
                "assets": sum(len(m.assets) for m in manifests),
            }
        )
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=ROOT)
    parser.add_argument("--sources", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    build(args.root, args.sources, args.output)
