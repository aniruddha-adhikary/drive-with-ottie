"""Inventory original PDFs and render source pages for crop review."""

import argparse
import json
from pathlib import Path

import pymupdf
from PIL import Image, ImageDraw


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--sources", type=Path, required=True)
    parser.add_argument("--review", type=Path, required=True)
    args = parser.parse_args()
    args.review.mkdir(parents=True, exist_ok=True)
    inventory = []
    for name in ("sup", "bus", "contents", "tp"):
        doc = pymupdf.open(args.sources / f"{name}.pdf")
        thumbnails = []
        titles = []
        for index, page in enumerate(doc):
            selected = name != "tp" or index in (1, 44, 45, 46)
            text = page.get_text()
            inventory.append(
                {
                    "source": name,
                    "pdf_page": index + 1,
                    "bounds": list(page.rect),
                    "rotation": page.rotation,
                    "paths": len(page.get_drawings()) if selected else None,
                    "images": len(page.get_images()),
                    "fonts": len(page.get_fonts()),
                    "text": text if selected else None,
                }
            )
            if not selected:
                continue
            pix = page.get_pixmap(matrix=pymupdf.Matrix(1.4, 1.4), alpha=False)
            pix.save(args.review / f"{name}-{index + 1:03}.png")
            (args.review / f"{name}-{index + 1:03}.txt").write_text(text)
            image = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
            image.thumbnail((600, 430))
            tile = Image.new("RGB", (620, 470), "white")
            tile.paste(image, ((620 - image.width) // 2, 30))
            ImageDraw.Draw(tile).text(
                (10, 10), f"{name} PDF p{index + 1}", fill="black"
            )
            thumbnails.append(tile)
            if name in ("sup", "bus") and index >= (2 if name == "sup" else 1):
                title_pix = page.get_pixmap(
                    matrix=pymupdf.Matrix(1.7, 1.7),
                    clip=pymupdf.Rect(750, 700, 1160, 835),
                    alpha=False,
                )
                title = Image.frombytes(
                    "RGB", (title_pix.width, title_pix.height), title_pix.samples
                )
                title_tile = Image.new("RGB", (720, 265), "white")
                title_tile.paste(title, (10, 30))
                ImageDraw.Draw(title_tile).text(
                    (10, 10), f"{name} PDF p{index + 1}", fill="black"
                )
                titles.append(title_tile)
        sheet = Image.new("RGB", (1240, 470 * ((len(thumbnails) + 1) // 2)), "#ddd")
        for i, thumbnail in enumerate(thumbnails):
            sheet.paste(thumbnail, ((i % 2) * 620, (i // 2) * 470))
        sheet.save(args.review / f"{name}-pages.png")
        if titles:
            title_sheet = Image.new(
                "RGB", (1440, 265 * ((len(titles) + 1) // 2)), "#ddd"
            )
            for i, title in enumerate(titles):
                title_sheet.paste(title, ((i % 2) * 720, (i // 2) * 265))
            title_sheet.save(args.review / f"{name}-revisions.png")
    (args.review / "inventory.json").write_text(json.dumps(inventory, indent=2) + "\n")


if __name__ == "__main__":
    main()
