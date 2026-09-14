"""Adversarial mutations of real source-backed manifests and artwork."""

from __future__ import annotations

import os
import tempfile
import unittest
from pathlib import Path

import pymupdf
from PIL import Image
from pydantic import ValidationError

from contract import FAMILIES, Manifest
from validate import (
    ROOT,
    check_conflicts,
    check_coverage,
    check_file,
    check_release,
    check_source,
    check_svg,
    local_file,
    source_cache,
    validate_family,
)


class ContractTests(unittest.TestCase):
    manifests: list[Manifest]
    cache: dict[str, Path]

    @classmethod
    def setUpClass(cls) -> None:
        cls.manifests = [
            Manifest.model_validate_json(
                (ROOT / f"assets/sg/{f}/manifest.json").read_text()
            )
            for f in FAMILIES
        ]
        cls.cache = source_cache(Path(os.environ["SG_SOURCE_DIR"]))

    def setUp(self) -> None:
        self.manifest = self.manifests[0].model_copy(deep=True)
        self.work = tempfile.TemporaryDirectory(prefix="sg-contract-", dir=Path.home())
        self.addCleanup(self.work.cleanup)
        self.directory = Path(self.work.name)

    def test_all_real_manifests_account_for_every_page(self) -> None:
        for manifest in self.manifests:
            check_coverage(manifest)

    def test_page_counts_are_required_even_without_assets(self) -> None:
        source = self.manifest.sources[1]
        source.page_count = None
        with self.assertRaisesRegex(ValueError, "Missing page count"):
            check_source(source, ROOT, self.cache)

    def test_fresh_pdf_hash_and_page_count(self) -> None:
        source = self.manifest.sources[0]
        check_source(source, ROOT, self.cache)
        source.sha256 = "0" * 64
        with self.assertRaisesRegex(ValueError, "source hash mismatch"):
            check_source(source, ROOT, self.cache)
        source.sha256 = self.manifests[0].sources[0].sha256
        source.page_count = 999
        with self.assertRaisesRegex(ValueError, "Page count"):
            check_source(source, ROOT, self.cache)

    def test_missing_and_duplicate_page_coverage(self) -> None:
        page = self.manifest.coverage.pop()
        with self.assertRaisesRegex(ValueError, "Page coverage"):
            check_coverage(self.manifest)
        self.manifest.coverage.extend([page, page])
        with self.assertRaisesRegex(ValueError, "Page coverage"):
            check_coverage(self.manifest)

    def test_duplicate_asset_id(self) -> None:
        self.manifest.assets[1].id = self.manifest.assets[0].id
        with self.assertRaisesRegex(ValueError, "Duplicate asset IDs"):
            check_coverage(self.manifest)

    def test_asset_must_be_owned_by_its_source_page(self) -> None:
        self.manifest.assets[0].source.pdf_page = 1
        with self.assertRaisesRegex(ValueError, "locator mismatch"):
            check_coverage(self.manifest)

    def test_asset_must_appear_in_coverage(self) -> None:
        row = next(c for c in self.manifest.coverage if c.asset_ids)
        row.asset_ids.pop()
        with self.assertRaisesRegex(ValueError, "every asset once"):
            check_coverage(self.manifest)

    def test_reject_path_escape_and_symlink_escape(self) -> None:
        for path in (
            "/etc/passwd",
            "../outside.png",
            "assets\\sg\\bad.png",
            "tools/asset_extraction/contract.py",
        ):
            with self.subTest(path=path), self.assertRaises(ValueError):
                local_file(ROOT, path, "assets/sg")
        (self.directory / "assets").mkdir()
        (self.directory / "outside.png").write_bytes(b"not an asset")
        (self.directory / "assets/escape.png").symlink_to(
            self.directory / "outside.png"
        )
        with self.assertRaisesRegex(ValueError, "Outside"):
            local_file(self.directory, "assets/escape.png", "assets")

    def test_reject_changed_file_hash(self) -> None:
        self.manifest.assets[0].file_sha256["reference_png"] = "0" * 64
        with self.assertRaisesRegex(ValueError, "Asset hash mismatch"):
            validate_family(self.manifest, ROOT, self.cache)

    def test_reject_full_page_and_invalid_crop(self) -> None:
        asset = self.manifest.assets[0]
        for box in ([0.0, 0.0, 100000.0, 100000.0], [0.0, 0.0, 0.0, 0.0]):
            asset.source.bbox_pdf_points = box
            asset.source.bbox_display_pdf_points = box
            with (
                self.subTest(box=box),
                self.assertRaisesRegex(ValueError, "source bounds"),
            ):
                validate_family(self.manifest, ROOT, self.cache)
        with pymupdf.open(self.cache[self.manifest.sources[0].sha256]) as document:
            box = list(document[asset.source.pdf_page - 1].rect)
        asset.source.bbox_pdf_points = box
        asset.source.bbox_display_pdf_points = box
        with self.assertRaisesRegex(ValueError, "Full source page"):
            validate_family(self.manifest, ROOT, self.cache)

    def test_strict_dimensions_and_boolean(self) -> None:
        data = self.manifest.model_dump()
        asset = data["assets"][0]
        for field, value in (
            ("release_ready", "false"),
            (
                "source",
                {**asset["source"], "bbox_pdf_points": [0, 0, float("nan"), 20]},
            ),
        ):
            with self.subTest(field=field):
                changed = {**data, "assets": [{**asset, field: value}]}
                with self.assertRaises(ValidationError):
                    Manifest.model_validate(changed)

    def test_release_requires_both_approvals_and_evidence(self) -> None:
        asset = self.manifest.assets[0]
        asset.release_ready = True
        with self.assertRaisesRegex(ValueError, "Missing release approvals"):
            check_release(asset)
        asset.review.status = "approved"
        asset.review.content_approved = True
        asset.review.reuse_approved = True
        asset.license_status = "approved"
        with self.assertRaisesRegex(ValueError, "Missing release approvals"):
            check_release(asset)
        asset.review.approval_evidence = ["Approval test fixture, not production"]
        with self.assertRaisesRegex(ValueError, "Unresolved release warnings"):
            check_release(asset)

    def test_tfi1_conflict_cannot_be_silently_cleared(self) -> None:
        manifests = [m.model_copy(deep=True) for m in self.manifests]
        check_conflicts(manifests)
        conflict = next(
            a
            for m in manifests
            for a in m.assets
            if a.id == "sg.informatory.bus-lane-full-day-source-hours"
        )
        conflict.review.status = "extracted_reference"
        with self.assertRaisesRegex(ValueError, "TFI1"):
            check_conflicts(manifests)

    def test_real_svg_and_dangerous_mutations(self) -> None:
        path = self.manifest.assets[0].files["renderer_svg"]
        assert path is not None
        original = (ROOT / path).read_text()
        check_svg(ROOT / path)
        attacks = (
            '<?xml-stylesheet href="https://example.com/style.css"?>' + original,
            original.replace("<svg ", '<svg onload="alert(1)" ', 1),
            original.replace("</svg>", "<script>alert(1)</script></svg>"),
            original.replace(
                "</svg>", '<image href="https://example.com/a.png"/></svg>'
            ),
            original.replace(
                "</svg>", '<image href="data:image/png;base64,AA=="/></svg>'
            ),
            original.replace("</svg>", "<foreignObject/></svg>"),
            original.replace(
                "</svg>", '<path d="M10000 10000L10010 10000L10010 10010Z"/></svg>'
            ),
            original.replace("<svg ", '<svg style="display:none" ', 1),
            original.replace(
                "</svg>", '<g opacity="0"><path d="M0 0L10 0L10 10Z"/></g></svg>'
            ),
            original.replace(
                "</svg>", '<defs><path d="M0 0L10 0L10 10Z"/></defs></svg>'
            ),
        )
        for attack in attacks:
            with self.subTest(svg=attack[-100:]):
                target = self.directory / "mutated.svg"
                target.write_text(attack)
                with self.assertRaises(ValueError):
                    check_svg(target)

    def test_blank_and_transparent_pngs(self) -> None:
        for color in ("white", (0, 0, 0, 0)):
            with self.subTest(color=color):
                target = self.directory / "blank.png"
                Image.new("RGBA", (50, 50), color).save(target)
                with self.assertRaisesRegex(ValueError, "Blank|Transparent"):
                    check_file(target)


if __name__ == "__main__":
    unittest.main()
