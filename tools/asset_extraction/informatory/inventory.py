"""Render original sheets for coordinate/revision review, without modifying PDFs."""

import argparse
import json
from pathlib import Path

import pymupdf


def upright(document: pymupdf.Document, index: int) -> pymupdf.Page:
    page = document[index]
    if page.rotation:
        page.remove_rotation()
    return page


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--sources", type=Path, required=True)
    parser.add_argument("--review", type=Path, required=True)
    args = parser.parse_args()
    args.review.mkdir(parents=True, exist_ok=True)
    inventory = []
    for name in ("TFI", "TFS", "contents"):
        with pymupdf.open(args.sources / f"{name}.pdf") as document:
            for index in range(len(document)):
                original_rotation = document[index].rotation
                page = upright(document, index)
                paths = page.get_drawings()
                inventory.append(
                    {
                        "source": name,
                        "pdf_page": index + 1,
                        "original_rotation": original_rotation,
                        "rect": list(page.rect),
                        "paths": len(paths),
                        "images": len(page.get_images()),
                        "fonts": len(page.get_fonts()),
                        "text": page.get_text(),
                    }
                )
                page.get_pixmap(matrix=pymupdf.Matrix(1.4, 1.4)).save(
                    args.review / f"{name}-{index + 1:02d}.png"
                )
    (args.review / "inventory.json").write_text(
        json.dumps(inventory, indent=2) + "\n"
    )


if __name__ == "__main__":
    main()
