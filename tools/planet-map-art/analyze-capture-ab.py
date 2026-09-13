#!/usr/bin/env python3
"""Measure and assemble the source-matched mobile terrain A/B captures."""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[2]
EVIDENCE = Path(__file__).resolve().parent / "evidence"
SLUGS = ("verdant-highland", "ashland-basalt")


def metrics(path: Path) -> dict:
    rgb = np.asarray(Image.open(path).convert("RGB"), dtype=np.float32)
    height, width = rgb.shape[:2]
    # Keep most of the view, while excluding the least representative edge
    # pixels and browser-scale fringe. The site picker has already proved the
    # camera origin is natural terrain rather than a yard or road.
    rgb = rgb[int(height * 0.18):int(height * 0.82), int(width * 0.08):int(width * 0.92)]
    lum = rgb @ np.asarray((0.2126, 0.7152, 0.0722), dtype=np.float32)
    lap = np.abs(4.0 * lum - np.roll(lum, 1, 0) - np.roll(lum, -1, 0)
                 - np.roll(lum, 1, 1) - np.roll(lum, -1, 1))
    gx = np.roll(lum, -1, 1) - np.roll(lum, 1, 1)
    gy = np.roll(lum, -1, 0) - np.roll(lum, 1, 0)
    return {
        "crop_fraction": {"x": [0.08, 0.92], "y": [0.18, 0.82]},
        "luminance_mean": round(float(lum.mean()), 4),
        "luminance_stddev": round(float(lum.std()), 4),
        "laplacian_energy": round(float(lap.mean()), 4),
        "gradient_energy": round(float(np.hypot(gx, gy).mean()), 4),
        "rgb_mean": [round(float(v), 4) for v in rgb.mean(axis=(0, 1))],
    }


def delta(before: dict, after: dict, key: str) -> float:
    base = before[key]
    return round((after[key] - base) / base * 100.0, 3) if base else 0.0


def contact_sheet(paths: list[tuple[str, Path, Path]], destination: Path) -> None:
    cell_w, cell_h, header = 412, 915, 38
    sheet = Image.new("RGB", (cell_w * 2, (cell_h + header) * len(paths)), (7, 11, 15))
    draw = ImageDraw.Draw(sheet)
    for row, (slug, before, after) in enumerate(paths):
        top = row * (cell_h + header)
        for col, (label, source) in enumerate((("BEFORE", before), ("CANDIDATE", after))):
            frame = Image.open(source).convert("RGB").resize((cell_w, cell_h), Image.Resampling.LANCZOS)
            sheet.paste(frame, (col * cell_w, top + header))
            draw.text((col * cell_w + 10, top + 12), f"{slug} / {label}", fill=(218, 236, 242))
    sheet.save(destination, "PNG", optimize=True)


def main() -> int:
    capture_report = json.loads((EVIDENCE / "capture-report.json").read_text(encoding="utf-8"))
    by_slug = {case["slug"]: case for case in capture_report["cases"]}
    report = {
        "schema": "massfront-planet-map-art-capture-analysis-v1",
        "capture_report": str((EVIDENCE / "capture-report.json").relative_to(ROOT)),
        "gpu": capture_report["gpu"],
        "viewport": capture_report["viewport"],
        "cases": {},
    }
    paths = []
    for slug in SLUGS:
        case = by_slug[slug]
        before_path, after_path = Path(case["before"]["path"]), Path(case["after"]["path"])
        before, after = metrics(before_path), metrics(after_path)
        report["cases"][slug] = {
            "site": case["staged"]["site"],
            "slot": case["staged"]["slot"],
            "before": before,
            "candidate": after,
            "delta_percent": {
                key: delta(before, after, key)
                for key in ("luminance_mean", "luminance_stddev", "laplacian_energy", "gradient_energy")
            },
        }
        paths.append((slug, before_path, after_path))
    contact = EVIDENCE / "mobile-material-ab-contact-sheet.png"
    contact_sheet(paths, contact)
    report["contact_sheet"] = str(contact.relative_to(ROOT))
    (EVIDENCE / "image-metrics.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
