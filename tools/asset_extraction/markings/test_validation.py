"""Integration checks against the original PDFs and generated asset registry."""

import copy
import json
import os
import unittest
from pathlib import Path

from extract import ASSETS, ROOT, TOOLS, Manifest, Recipes, source_paths, validate


class ExtractionValidationTests(unittest.TestCase):
    spec: Recipes
    manifest: Manifest
    paths: dict[str, Path]
    source_dir: Path

    @classmethod
    def setUpClass(cls) -> None:
        cls.spec = json.loads((ROOT / TOOLS / "recipes.json").read_text())
        cls.manifest = json.loads((ROOT / ASSETS / "manifest.json").read_text())
        cls.source_dir = Path(
            os.environ.get("MARKINGS_SOURCE_DIR", str(Path.home() / "markings-sources"))
        )
        cls.paths = source_paths(cls.spec, cls.source_dir, download=False)

    def test_rejects_changed_source(self) -> None:
        spec = copy.deepcopy(self.spec)
        spec["sources"][0]["sha256"] = "0" * 64
        with self.assertRaisesRegex(ValueError, "hash mismatch"):
            source_paths(spec, self.source_dir, download=False)

    def test_rejects_duplicate_semantic_id(self) -> None:
        manifest = copy.deepcopy(self.manifest)
        manifest["assets"][1]["id"] = manifest["assets"][0]["id"]
        with self.assertRaises(AssertionError):
            validate(manifest, self.paths)

    def test_rejects_invalid_source_page(self) -> None:
        manifest = copy.deepcopy(self.manifest)
        manifest["assets"][0]["source"]["pdf_page"] = 999
        with self.assertRaises(AssertionError):
            validate(manifest, self.paths)

    def test_rejects_incorrect_asset_hash(self) -> None:
        manifest = copy.deepcopy(self.manifest)
        manifest["assets"][0]["file_sha256"]["reference_png"] = "0" * 64
        with self.assertRaises(AssertionError):
            validate(manifest, self.paths)

    def test_rejects_missing_coverage_page(self) -> None:
        manifest = copy.deepcopy(self.manifest)
        manifest["coverage"].pop()
        with self.assertRaises(AssertionError):
            validate(manifest, self.paths)

    def test_preserves_measurement_endpoints_and_semantic_roles(self) -> None:
        give_way = json.loads(
            (ROOT / ASSETS / "geometry/control-give-way-d.json").read_text()
        )
        self.assertEqual(
            give_way["parameters_mm"],
            {
                "width": 100,
                "painted_length": 1000,
                "clear_gap": 1000,
                "inter_row_clear_gap": 150,
            },
        )
        self.assertEqual(give_way["derived_row_centre_spacing_mm"], 250)
        centre = json.loads(
            (ROOT / ASSETS / "geometry/centre-broken-two-way-e.json").read_text()
        )
        self.assertEqual(
            centre["parameters_mm"],
            {"width": 150, "painted_length": 2750, "clear_gap": 2750},
        )
        dots = json.loads(
            (
                ROOT / ASSETS / "geometry/guidance-intersecting-through-a9.json"
            ).read_text()
        )
        self.assertEqual(dots["parameters_mm"]["within_group_centre_spacing"], 1000)
        self.assertEqual(dots["parameters_mm"]["between_group_centre_spacing"], 3000)
        self.assertNotIn("clear_gap", dots["parameters_mm"])
        by_id = {asset["id"]: asset for asset in self.manifest["assets"]}
        self.assertIn("sg.markings.control-stop-j", by_id)
        self.assertIn("sg.markings.edge-paved-shoulder-j", by_id)
        self.assertIn(
            "bicycle", by_id["sg.markings.crossing-signalised-bicycle-a8"]["name"]
        )


if __name__ == "__main__":
    unittest.main()
