"""Convert one approved source material into an exact 2K seam-closed PBR set.

The source is never treated as runtime-ready: broad illumination is flattened,
opposite borders are reconciled, and each output channel is rebuilt and tested.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter, ImageOps


SIZE = 2048


def smoothstep(value: np.ndarray) -> np.ndarray:
    return value * value * (3.0 - 2.0 * value)


def close_edges(values: np.ndarray, band: int) -> np.ndarray:
    result = values.astype(np.float32).copy()
    height, width = result.shape[:2]
    band = min(band, height // 6, width // 6)
    for offset in range(band):
        weight = 1.0 - smoothstep(np.asarray(offset / max(1, band - 1), dtype=np.float32))
        left = result[:, offset].copy()
        right = result[:, width - 1 - offset].copy()
        average = (left + right) * 0.5
        result[:, offset] = left * (1.0 - weight) + average * weight
        result[:, width - 1 - offset] = right * (1.0 - weight) + average * weight
    for offset in range(band):
        weight = 1.0 - smoothstep(np.asarray(offset / max(1, band - 1), dtype=np.float32))
        top = result[offset].copy()
        bottom = result[height - 1 - offset].copy()
        average = (top + bottom) * 0.5
        result[offset] = top * (1.0 - weight) + average * weight
        result[height - 1 - offset] = bottom * (1.0 - weight) + average * weight
    result[:, -1] = result[:, 0]
    result[-1, :] = result[0, :]
    return result


def blur(values: np.ndarray, radius: float) -> np.ndarray:
    mode = "RGB" if values.ndim == 3 else "L"
    image = Image.fromarray(np.clip(values * 255.0, 0, 255).astype(np.uint8), mode)
    return np.asarray(image.filter(ImageFilter.GaussianBlur(radius)), dtype=np.float32) / 255.0


def neutralize(rgb: np.ndarray, target_luma: float) -> np.ndarray:
    broad = blur(rgb, 64.0)
    average = broad.mean(axis=(0, 1), keepdims=True)
    flattened = rgb * average / np.maximum(broad, 0.10)
    flattened = rgb * 0.24 + flattened * 0.76
    luma = flattened[..., 0] * 0.2126 + flattened[..., 1] * 0.7152 + flattened[..., 2] * 0.0722
    gain = np.clip(target_luma / max(0.05, float(np.median(luma))), 0.70, 2.4)
    return np.clip(np.power(flattened * gain, 0.94), 0.025, 0.86)


def height_to_normal(height: np.ndarray, strength: float) -> np.ndarray:
    dx = (np.roll(height, -1, axis=1) - np.roll(height, 1, axis=1)) * strength
    dy = (np.roll(height, -1, axis=0) - np.roll(height, 1, axis=0)) * strength
    nx, ny, nz = -dx, dy, np.ones_like(height)
    length = np.sqrt(nx * nx + ny * ny + nz * nz)
    return np.stack((nx / length * 0.5 + 0.5, ny / length * 0.5 + 0.5, nz / length * 0.5 + 0.5), axis=-1)


def encode(values: np.ndarray) -> np.ndarray:
    return np.round(np.clip(values, 0.0, 1.0) * 255.0).astype(np.uint8)


def edge_metrics(values: np.ndarray) -> dict[str, float | int]:
    horizontal = np.abs(values[:, 0].astype(np.int16) - values[:, -1].astype(np.int16))
    vertical = np.abs(values[0].astype(np.int16) - values[-1].astype(np.int16))
    return {
        "max": int(max(horizontal.max(initial=0), vertical.max(initial=0))),
        "mean": float((horizontal.mean() + vertical.mean()) * 0.5),
    }


def save(values: np.ndarray, mode: str, path: Path) -> dict[str, float | int]:
    encoded = encode(values)
    Image.fromarray(encoded, mode).save(path, optimize=True)
    return edge_metrics(encoded)


def build(source: Path, output: Path, stem: str, target_luma: float, normal_strength: float) -> dict[str, object]:
    output.mkdir(parents=True, exist_ok=True)
    master = ImageOps.fit(Image.open(source).convert("RGB"), (SIZE, SIZE), method=Image.Resampling.LANCZOS)
    source_rgb = np.asarray(master, dtype=np.float32) / 255.0
    albedo = close_edges(neutralize(source_rgb, target_luma), 176)

    luma = albedo[..., 0] * 0.2126 + albedo[..., 1] * 0.7152 + albedo[..., 2] * 0.0722
    broad = blur(luma, 12.0)
    fine = luma - blur(luma, 2.2)
    relief = np.clip((luma - broad) * 1.15 + fine * 0.65, -0.24, 0.24)
    height = close_edges(np.clip(0.5 + relief, 0.25, 0.74), 176)
    normal = close_edges(height_to_normal(height, normal_strength), 24)

    saturation = albedo.max(axis=2) - albedo.min(axis=2)
    local_detail = np.clip(np.abs(luma - broad) * 5.0, 0.0, 1.0)
    cyan = np.clip((albedo[..., 2] - albedo[..., 0] * 1.06) * 4.5 - 0.09, 0.0, 1.0)
    amber = np.clip((albedo[..., 0] - albedo[..., 2] * 1.04) * 4.2 - 0.14, 0.0, 1.0)
    emissive_mask = np.clip(np.maximum(cyan, amber) * smoothstep(np.clip((luma - 0.30) * 4.0, 0.0, 1.0)), 0.0, 1.0)
    emissive = close_edges(albedo * emissive_mask[..., None] * 1.9, 176)

    roughness = np.clip(0.72 - local_detail * 0.14 + (0.42 - luma) * 0.15 + saturation * 0.06, 0.40, 0.86)
    roughness = close_edges(roughness, 176)
    metallic = np.clip(0.78 - saturation * 1.2 - emissive_mask * 0.48, 0.18, 0.90)
    metallic = close_edges(metallic, 176)
    ao = np.clip(0.96 + relief * 1.35, 0.56, 1.0)
    ao = close_edges(ao, 176)

    normal_rough = np.dstack((normal, roughness))
    orm = np.dstack((ao, roughness, metallic))
    paths = {
        "albedo": output / f"{stem}-albedo.png",
        "normal": output / f"{stem}-normal.png",
        "normal_rough": output / f"{stem}-normal-rough.png",
        "ao": output / f"{stem}-ao.png",
        "roughness": output / f"{stem}-roughness.png",
        "metallic": output / f"{stem}-metallic.png",
        "orm": output / f"{stem}-orm.png",
        "emissive": output / f"{stem}-emissive.png",
        "height": output / f"{stem}-height.png",
    }
    metrics = {
        "albedo": save(albedo, "RGB", paths["albedo"]),
        "normal": save(normal, "RGB", paths["normal"]),
        "normal_rough": save(normal_rough, "RGBA", paths["normal_rough"]),
        "ao": save(ao, "L", paths["ao"]),
        "roughness": save(roughness, "L", paths["roughness"]),
        "metallic": save(metallic, "L", paths["metallic"]),
        "orm": save(orm, "RGB", paths["orm"]),
        "emissive": save(emissive, "RGB", paths["emissive"]),
        "height": save(height, "L", paths["height"]),
    }

    tile = Image.open(paths["albedo"])
    preview = Image.new("RGB", (SIZE * 3, SIZE * 3))
    for y in range(3):
        for x in range(3):
            preview.paste(tile, (x * SIZE, y * SIZE))
    preview = preview.resize((1536, 1536), Image.Resampling.LANCZOS)
    preview_path = output / f"{stem}-3x3-seam-proof.png"
    preview.save(preview_path, optimize=True)

    report = {
        "material": stem,
        "status": "staging_candidate_not_runtime",
        "source": str(source),
        "source_sha256": hashlib.sha256(source.read_bytes()).hexdigest(),
        "dimensions": [SIZE, SIZE],
        "tile_meters": 4.0,
        "edge_metrics": metrics,
        "files": {},
        "promotion_gate": "Rebuild the real UGA GLB and approve source-matched phone captures before runtime use.",
    }
    for role, path in paths.items():
        report["files"][role] = {
            "path": path.name,
            "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
            "bytes": path.stat().st_size,
        }
    report["files"]["seam_proof"] = {
        "path": preview_path.name,
        "sha256": hashlib.sha256(preview_path.read_bytes()).hexdigest(),
        "bytes": preview_path.stat().st_size,
    }
    report_path = output / f"{stem}-report.json"
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    return report


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--stem", required=True)
    parser.add_argument("--target-luma", type=float, default=0.34)
    parser.add_argument("--normal-strength", type=float, default=4.8)
    args = parser.parse_args()
    report = build(args.source, args.output, args.stem, args.target_luma, args.normal_strength)
    print(json.dumps(report, indent=2))
    if any(metric["max"] != 0 for metric in report["edge_metrics"].values()):
        raise SystemExit("seam closure failed")


if __name__ == "__main__":
    main()
