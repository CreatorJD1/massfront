#!/usr/bin/env python3
"""Bake the authored 4x4 fire-to-soot master into a volume-material driver.

This intentionally does *not* make a gameplay billboard.  The output is a
channel-packed 4x4 atlas sampled tri-planarly by ``src/engine/volfx.js`` inside
the world/object-space density field:

  R = density modulation, G = combustion/emission modulation,
  B = soot modulation,      A = authored support / empty-space mask.

Each cell has a four-pixel duplicate-edge gutter.  The gutter is necessary
because the shader samples projected 3D cross-sections rather than a single
front-facing UV; ordinary linear/mip filtering must never bleed into a
neighbouring animation stage.

The master remains source art.  This program deterministically crops its 16
stages, converts their opaque black background into an explicit support alpha,
and emits a runtime RGBA driver plus a machine-readable QA/provenance record.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image


GRID = 4
ATLAS_SIZE = 1024
CELL_SIZE = ATLAS_SIZE // GRID
GUTTER = 4
CONTENT_SIZE = CELL_SIZE - GUTTER * 2
CHANNELS = {
    "r": "density",
    "g": "emission",
    "b": "soot",
    "a": "support",
}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def smooth01(values: np.ndarray, low: float, high: float) -> np.ndarray:
    """A deterministic smoothstep without depending on shader behaviour."""
    t = np.clip((values - low) / (high - low), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def driver_channels(rgb: np.ndarray) -> np.ndarray:
    """Map authored fire/smoke colour into material controls, not final colour."""
    # The source is RGB artwork on an opaque black background.  Luma gives the
    # reliable fire/smoke silhouette while a gentle root preserves dim soot.
    red, green, blue = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    luma = red * 0.2126 + green * 0.7152 + blue * 0.0722
    density = np.sqrt(smooth01(luma, 0.008, 0.68))

    # Combustion is strongest for white/yellow/orange portions.  Grey soot has
    # density and support but intentionally produces almost no hot emission.
    warm = smooth01(red - blue * 0.35, 0.055, 0.72)
    white_hot = smooth01(np.minimum(np.minimum(red, green), blue), 0.42, 0.86)
    flame_lift = smooth01(luma, 0.08, 0.48)
    emission = np.maximum(white_hot, warm * flame_lift)
    emission = np.clip(emission * (0.52 + 0.48 * density), 0.0, 1.0)

    # Soot keeps smoky structure in a separate material channel.  It remains
    # useful once emission has faded and never turns an empty source pixel into
    # density.
    soot = density * (1.0 - emission * 0.82)
    support = smooth01(density, 0.018, 0.20)

    packed = np.stack((density, emission, soot, support), axis=-1)
    return np.rint(np.clip(packed, 0.0, 1.0) * 255.0).astype(np.uint8)


def copy_gutter(dst: np.ndarray, x: int, y: int) -> None:
    """Duplicate each content edge through the cell-local four-pixel gutter."""
    content = dst[y + GUTTER : y + GUTTER + CONTENT_SIZE,
                  x + GUTTER : x + GUTTER + CONTENT_SIZE]
    # Edges first.
    dst[y : y + GUTTER, x + GUTTER : x + GUTTER + CONTENT_SIZE] = content[0:1]
    dst[y + GUTTER + CONTENT_SIZE : y + CELL_SIZE,
        x + GUTTER : x + GUTTER + CONTENT_SIZE] = content[-1:]
    dst[y + GUTTER : y + GUTTER + CONTENT_SIZE, x : x + GUTTER] = content[:, 0:1]
    dst[y + GUTTER : y + GUTTER + CONTENT_SIZE,
        x + GUTTER + CONTENT_SIZE : x + CELL_SIZE] = content[:, -1:]
    # Corners duplicate the nearest content corner rather than averaging; that
    # makes edge QA exact and keeps all filtering inside the same animation cell.
    dst[y : y + GUTTER, x : x + GUTTER] = content[0, 0]
    dst[y : y + GUTTER, x + GUTTER + CONTENT_SIZE : x + CELL_SIZE] = content[0, -1]
    dst[y + GUTTER + CONTENT_SIZE : y + CELL_SIZE, x : x + GUTTER] = content[-1, 0]
    dst[y + GUTTER + CONTENT_SIZE : y + CELL_SIZE,
        x + GUTTER + CONTENT_SIZE : x + CELL_SIZE] = content[-1, -1]


def gutter_error(atlas: np.ndarray, x: int, y: int) -> int:
    """Return the largest absolute byte difference between a gutter and edge."""
    c = atlas[y + GUTTER : y + GUTTER + CONTENT_SIZE,
              x + GUTTER : x + GUTTER + CONTENT_SIZE].astype(np.int16)
    tests = (
        (atlas[y : y + GUTTER, x + GUTTER : x + GUTTER + CONTENT_SIZE], c[0:1]),
        (atlas[y + GUTTER + CONTENT_SIZE : y + CELL_SIZE,
               x + GUTTER : x + GUTTER + CONTENT_SIZE], c[-1:]),
        (atlas[y + GUTTER : y + GUTTER + CONTENT_SIZE, x : x + GUTTER], c[:, 0:1]),
        (atlas[y + GUTTER : y + GUTTER + CONTENT_SIZE,
               x + GUTTER + CONTENT_SIZE : x + CELL_SIZE], c[:, -1:]),
    )
    return max(int(np.max(np.abs(actual.astype(np.int16) - expected))) for actual, expected in tests)


def write_preview(packed: np.ndarray, path: Path) -> None:
    """A visible false-colour QA sheet: hot emission / density / soot."""
    # The preview is explicitly non-runtime.  It lets a reviewer see that the
    # source becomes a field driver, not another final-colour explosion card.
    preview = np.empty_like(packed)
    preview[..., 0] = packed[..., 1]  # emission in red
    preview[..., 1] = packed[..., 0]  # density in green
    preview[..., 2] = packed[..., 2]  # soot in blue
    preview[..., 3] = 255
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(preview, "RGBA").save(path, optimize=True)


def main() -> None:
    root = Path(__file__).resolve().parents[1]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--source",
        type=Path,
        default=root / "assets/source/vfx/mf-raymarch-density-emission-master-v1.png",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=root / "assets/textures/vfx/mf-raymarch-density-emission-driver-v1.png",
    )
    parser.add_argument(
        "--report",
        type=Path,
        default=root / "assets/textures/vfx/mf-raymarch-density-emission-driver-v1.provenance.json",
    )
    parser.add_argument("--preview", type=Path, default=None)
    args = parser.parse_args()

    source_path = args.source.resolve()
    output_path = args.output.resolve()
    report_path = args.report.resolve()
    if not source_path.is_file():
        raise SystemExit(f"source master is missing: {source_path}")

    with Image.open(source_path) as source_img:
        source_mode = source_img.mode
        if source_mode not in ("RGB", "RGBA"):
            raise SystemExit(f"source master must be RGB/RGBA, got {source_mode}")
        source_w, source_h = source_img.size
        if source_w < GRID or source_h < GRID:
            raise SystemExit(f"source master is too small for {GRID}x{GRID}: {source_w}x{source_h}")
        source = source_img.convert("RGB")

        atlas = np.zeros((ATLAS_SIZE, ATLAS_SIZE, 4), dtype=np.uint8)
        stages: list[dict[str, object]] = []
        for row in range(GRID):
            sy0 = round(row * source_h / GRID)
            sy1 = round((row + 1) * source_h / GRID)
            for col in range(GRID):
                sx0 = round(col * source_w / GRID)
                sx1 = round((col + 1) * source_w / GRID)
                # Exact integer split means 1254px masters still divide without
                # dropping a boundary row/column or shifting frame chronology.
                frame = source.crop((sx0, sy0, sx1, sy1)).resize(
                    (CONTENT_SIZE, CONTENT_SIZE), Image.Resampling.LANCZOS
                )
                rgb = np.asarray(frame, dtype=np.float32) / 255.0
                packed = driver_channels(rgb)
                dx, dy = col * CELL_SIZE, row * CELL_SIZE
                atlas[dy + GUTTER : dy + GUTTER + CONTENT_SIZE,
                      dx + GUTTER : dx + GUTTER + CONTENT_SIZE] = packed
                copy_gutter(atlas, dx, dy)
                alpha = packed[..., 3]
                stages.append({
                    "stage": row * GRID + col,
                    "sourceCrop": [sx0, sy0, sx1, sy1],
                    "supportPixels": int(np.count_nonzero(alpha)),
                    "supportMean": round(float(alpha.mean()) / 255.0, 6),
                    "densityMean": round(float(packed[..., 0].mean()) / 255.0, 6),
                    "emissionMean": round(float(packed[..., 1].mean()) / 255.0, 6),
                    "sootMean": round(float(packed[..., 2].mean()) / 255.0, 6),
                })

    mismatches = []
    for row in range(GRID):
        for col in range(GRID):
            mismatches.append(gutter_error(atlas, col * CELL_SIZE, row * CELL_SIZE))
    if max(mismatches) != 0:
        raise RuntimeError(f"gutter duplication failed: max byte mismatch {max(mismatches)}")
    empty = [stage["stage"] for stage in stages if stage["supportPixels"] == 0]
    if empty:
        raise RuntimeError(f"unexpected fully empty authored stages: {empty}")

    output_path.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(atlas, "RGBA").save(output_path, optimize=True)
    with Image.open(output_path) as baked:
        if baked.size != (ATLAS_SIZE, ATLAS_SIZE) or baked.mode != "RGBA":
            raise RuntimeError(f"unexpected baked mode/size: {baked.mode} {baked.size}")

    if args.preview:
        write_preview(atlas, args.preview.resolve())

    report = {
        "format": "MASSFRONT raymarch density/emission driver v1",
        "source": {
            "path": source_path.as_posix(),
            "sha256": sha256(source_path),
            "dimensions": [source_w, source_h],
            "mode": source_mode,
        },
        "output": {
            "path": output_path.as_posix(),
            "sha256": sha256(output_path),
            "dimensions": [ATLAS_SIZE, ATLAS_SIZE],
            "mode": "RGBA",
            "channels": CHANNELS,
        },
        "atlas": {
            "grid": [GRID, GRID],
            "cellPixels": CELL_SIZE,
            "contentPixels": CONTENT_SIZE,
            "gutterPixels": GUTTER,
            "gutterMaxByteMismatch": max(mismatches),
            "alphaNonZeroPixels": int(np.count_nonzero(atlas[..., 3])),
            "alphaZeroPixels": int(np.count_nonzero(atlas[..., 3] == 0)),
        },
        "stages": stages,
    }
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
