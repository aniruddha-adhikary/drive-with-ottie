"""Module-local checks for the starter sign/marking candidates.

Run from the repository root:
    python3 -m unittest discover -s content/assets/starter-signs-markings -p 'test_*.py' -v
"""

from __future__ import annotations

import hashlib
import json
import math
import subprocess
import sys
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO_ROOT = HERE.parents[2]


def load(relative: str) -> dict:
    return json.loads((HERE / relative).read_text(encoding="utf-8"))


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


class CandidateManifestTests(unittest.TestCase):
    manifest: dict
    details: dict[str, dict]

    @classmethod
    def setUpClass(cls) -> None:
        cls.manifest = load("manifest.json")
        cls.details = {
            c["candidate_id"]: load(c["files"]["json"])
            for c in cls.manifest["candidates"]
        }

    def test_outputs_reproduce(self) -> None:
        result = subprocess.run(
            [sys.executable, str(HERE / "generate.py"), "check"],
            capture_output=True,
            text=True,
            cwd=REPO_ROOT,
        )
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_nothing_is_approved(self) -> None:
        records = [self.manifest, *self.manifest["candidates"], *self.details.values()]
        for record in records:
            self.assertFalse(record["release_ready"])
            self.assertFalse(record["content_approved"])
            self.assertFalse(record["reuse_approved"])
            self.assertEqual(record["license_status"], "unreviewed")

    def test_candidate_ids_are_distinct_from_originals(self) -> None:
        ids = [c["candidate_id"] for c in self.manifest["candidates"]]
        self.assertEqual(len(ids), len(set(ids)))
        for candidate in self.manifest["candidates"]:
            self.assertTrue(candidate["candidate_id"].startswith("sg.dev.starter."))
            self.assertNotEqual(candidate["candidate_id"], candidate["source_asset_id"])

    def test_originals_untouched_and_hashes_match(self) -> None:
        mandatory = json.loads(
            (REPO_ROOT / "assets/sg/mandatory/manifest.json").read_text(
                encoding="utf-8"
            )
        )
        markings = json.loads(
            (REPO_ROOT / "assets/sg/markings/manifest.json").read_text(encoding="utf-8")
        )
        originals = {a["id"]: a for a in mandatory["assets"] + markings["assets"]}
        for candidate in self.manifest["candidates"]:
            original = originals[candidate["source_asset_id"]]
            self.assertEqual(candidate["source_locator"], original["source"])
            for role, digest in candidate["original_file_sha256"].items():
                self.assertEqual(digest, original["file_sha256"][role])
                self.assertEqual(sha256(REPO_ROOT / original["files"][role]), digest)

    def test_faces_reuse_official_artwork_byte_for_byte(self) -> None:
        for candidate in self.manifest["candidates"]:
            if candidate["kind"] != "sign_face":
                continue
            detail = self.details[candidate["candidate_id"]]
            copied = HERE / detail["artwork"]["file"]
            original = REPO_ROOT / detail["artwork"]["identical_to"]
            self.assertEqual(copied.read_bytes(), original.read_bytes())
            self.assertEqual(sha256(copied), detail["artwork"]["sha256"])
            self.assertNotIn(
                "<text", copied.read_text(encoding="utf-8")
            )  # lettering is outlined paths, no fonts
            self.assertEqual(
                detail["face_mm"], detail["face_mm"] | {"width": 600, "height": 600}
            )
            for axis in ("front", "up", "right"):
                self.assertAlmostEqual(math.hypot(*detail["axes"][axis]), 1.0)
            self.assertEqual(detail["axes"]["front"], [0.0, -1.0, 0.0])
            self.assertEqual(detail["axes"]["up"], [0.0, 0.0, 1.0])
            self.assertEqual(
                [a["name"] for a in detail["attachments"]], ["back_centre"]
            )
            w_mm, h_mm = detail["artwork"]["backing_perimeter_extent_mm"]
            self.assertAlmostEqual(w_mm, 600, delta=1)
            self.assertAlmostEqual(h_mm, 600, delta=1)

    def test_tfm1_and_rms2_locators(self) -> None:
        for candidate in self.manifest["candidates"]:
            loc = candidate["source_locator"]
            if candidate["kind"] == "sign_face":
                self.assertEqual(
                    (
                        loc["source_id"],
                        loc["pdf_page"],
                        loc["printed_page"],
                        loc["drawing"],
                        loc["drawing_revision"],
                    ),
                    ("lta-sdre-i-tfm", 2, "15-1", "LTA/SDRE14/15/TFM1", "-"),
                )
            else:
                self.assertEqual(
                    (
                        loc["source_id"],
                        loc["pdf_page"],
                        loc["printed_page"],
                        loc["drawing"],
                        loc["drawing_revision"],
                    ),
                    ("lta-sdre-I-rms", 3, "8-2", "LTA/SDRE14/8/RMS2", "B"),
                )

    def test_give_way_line_d_geometry(self) -> None:
        d = self.details["sg.dev.starter.marking.give-way-line-d"]
        self.assertEqual(d["role"], "give_way_line")
        self.assertEqual(
            d["parameters_mm"],
            {
                "width": 100,
                "painted_length": 1000,
                "clear_gap": 1000,
                "inter_row_clear_gap": 150,
            },
        )
        stroke = d["stroke_m"]
        self.assertEqual(stroke["rows"], 2)
        self.assertAlmostEqual(stroke["width_m"], 0.1)
        self.assertAlmostEqual(stroke["inter_row_clear_gap_m"], 0.15)
        self.assertAlmostEqual(stroke["period_m"], 2.0)
        self.assertAlmostEqual(stroke["total_transverse_width_m"], 0.35)
        rows = {r["row"] for r in d["sample_rectangles_m"]}
        self.assertEqual(rows, {0, 1})
        row1 = [r for r in d["sample_rectangles_m"] if r["row"] == 1][0]
        self.assertAlmostEqual(row1["y0"], 0.25)  # 0.1 paint + 0.15 clear
        self.assertAlmostEqual(row1["y1"], 0.35)

    def test_stop_line_j_keeps_stop_role_only(self) -> None:
        j = self.details["sg.dev.starter.marking.stop-line-j"]
        self.assertEqual(j["role"], "stop_line")
        self.assertEqual(j["source_asset_id"], "sg.markings.control-stop-j")
        self.assertEqual(j["parameters_mm"], {"width": 300})
        self.assertTrue(j["stroke_m"]["continuous"])
        self.assertAlmostEqual(j["stroke_m"]["width_m"], 0.3)
        self.assertIsNone(j["stroke_m"]["extent_m"])
        self.assertTrue(any("paved-shoulder" in n for n in j["semantic_notes"]))
        self.assertNotIn(
            "sg.markings.edge-paved-shoulder-j",
            {c["source_asset_id"] for c in self.manifest["candidates"]},
        )

    def test_starter_paint_is_limited_to_centre_lines(self) -> None:
        paint = {
            c["source_asset_id"]
            for c in self.manifest["candidates"]
            if c["kind"] == "road_marking"
        }
        self.assertEqual(
            paint,
            {
                "sg.markings.control-give-way-d",
                "sg.markings.control-stop-j",
                "sg.markings.centre-broken-two-way-e",
                "sg.markings.centre-continuous-single-f",
            },
        )
        e = self.details["sg.dev.starter.marking.centre-broken-e"]
        self.assertEqual(
            e["parameters_mm"],
            {"width": 150, "painted_length": 2750, "clear_gap": 2750},
        )
        f = self.details["sg.dev.starter.marking.centre-continuous-f"]
        self.assertEqual(f["parameters_mm"], {"width": 150})

    def test_unknowns_are_explicit(self) -> None:
        for detail in self.details.values():
            self.assertTrue(detail["unknowns"])
        self.assertTrue(self.manifest["unresolved"])


if __name__ == "__main__":
    unittest.main()
