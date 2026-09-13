"""Build seam-closed, pixel-aligned PBR maps for NEXUS-VII room families."""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter, ImageOps


MATERIALS = {
    "uga-command-navigation": {"rough": (0.34, 0.72), "metal": (0.58, 0.92), "normal": 3.1, "luma": 0.36},
    "uga-science": {"rough": (0.38, 0.78), "metal": (0.24, 0.78), "normal": 2.4, "luma": 0.48},
    "uga-industrial": {"rough": (0.42, 0.86), "metal": (0.62, 0.94), "normal": 3.5, "luma": 0.34},
    "uga-civic-medical": {"rough": (0.48, 0.84), "metal": (0.12, 0.56), "normal": 2.1, "luma": 0.46},
    "uga-diplomatic": {"rough": (0.34, 0.72), "metal": (0.42, 0.84), "normal": 2.5, "luma": 0.41},
    "uga-operations": {"rough": (0.46, 0.88), "metal": (0.55, 0.90), "normal": 3.2, "luma": 0.37},
    "uga-deck-floor": {"rough": (0.48, 0.86), "metal": (0.48, 0.82), "normal": 3.0, "luma": 0.35},
    "uga-pressure-wall": {"rough": (0.40, 0.76), "metal": (0.50, 0.86), "normal": 2.6, "luma": 0.38},
    "uga-interior-transit": {"rough": (0.50, 0.82), "metal": (0.42, 0.78), "normal": 2.8, "luma": 0.40},
}


def smoothstep(value: np.ndarray) -> np.ndarray:
    return value * value * (3.0 - 2.0 * value)


def close_edges(array: np.ndarray, band: int = 96) -> np.ndarray:
    """Cross-fade opposing borders and then make the edge texels identical."""
    result = array.astype(np.float32).copy()
    height, width = result.shape[:2]
    band = min(band, height // 5, width // 5)
    for offset in range(band):
        weight = 1.0 - smoothstep(np.array(offset / max(1, band - 1), dtype=np.float32))
        left = result[:, offset].copy()
        right = result[:, width - 1 - offset].copy()
        average = (left + right) * 0.5
        result[:, offset] = left * (1.0 - weight) + average * weight
        result[:, width - 1 - offset] = right * (1.0 - weight) + average * weight
    for offset in range(band):
        weight = 1.0 - smoothstep(np.array(offset / max(1, band - 1), dtype=np.float32))
        top = result[offset].copy()
        bottom = result[height - 1 - offset].copy()
        average = (top + bottom) * 0.5
        result[offset] = top * (1.0 - weight) + average * weight
        result[height - 1 - offset] = bottom * (1.0 - weight) + average * weight
    result[:, -1] = result[:, 0]
    result[-1, :] = result[0, :]
    return result


def neutralize_lighting(rgb: np.ndarray) -> np.ndarray:
    """Remove broad generated illumination while retaining material-scale color."""
    broad = np.asarray(
        Image.fromarray(np.clip(rgb * 255, 0, 255).astype(np.uint8), "RGB")
        .filter(ImageFilter.GaussianBlur(42)),
        dtype=np.float32,
    ) / 255.0
    channel_mean = broad.mean(axis=(0, 1), keepdims=True)
    flattened = rgb * channel_mean / np.maximum(0.16, broad)
    return np.clip(rgb * 0.32 + flattened * 0.68, 0.015, 0.92)


def normalize_albedo_range(rgb: np.ndarray, target_luma: float) -> np.ndarray:
    """Keep useful midtones so cinematic tone mapping does not crush rooms."""
    luminance = rgb[..., 0] * .2126 + rgb[..., 1] * .7152 + rgb[..., 2] * .0722
    median = float(np.median(luminance))
    gain = np.clip(target_luma / max(.06, median), .78, 2.65)
    lifted = np.power(np.clip(rgb * gain, 0, 1), .92)
    return np.clip(lifted * .94 + .025, .025, .90)


def height_to_normal(height: np.ndarray, strength: float) -> np.ndarray:
    dx = (np.roll(height, -1, axis=1) - np.roll(height, 1, axis=1)) * strength
    dy = (np.roll(height, -1, axis=0) - np.roll(height, 1, axis=0)) * strength
    nx, ny, nz = -dx, dy, np.ones_like(height)
    length = np.sqrt(nx * nx + ny * ny + nz * nz)
    return np.stack(((nx / length) * .5 + .5, (ny / length) * .5 + .5, (nz / length) * .5 + .5), axis=-1)


def save_map(values: np.ndarray, path: Path, mode: str) -> tuple[int, float]:
    values = close_edges(values, 6 if values.ndim == 3 and values.shape[-1] == 3 and "normal" in path.name else 96)
    encoded = np.clip(values * 255, 0, 255).astype(np.uint8)
    Image.fromarray(encoded, mode).save(path, optimize=True)
    horizontal = np.abs(encoded[:, 0].astype(np.int16) - encoded[:, -1].astype(np.int16))
    vertical = np.abs(encoded[0].astype(np.int16) - encoded[-1].astype(np.int16))
    return int(max(horizontal.max(), vertical.max())), float((horizontal.mean() + vertical.mean()) * .5)


def build(source: Path, output: Path, stem: str) -> dict:
    settings = MATERIALS[stem]
    master = ImageOps.fit(Image.open(source).convert("RGB"), (1024, 1024), method=Image.Resampling.LANCZOS)
    rgb = neutralize_lighting(np.asarray(master, dtype=np.float32) / 255.0)
    rgb = normalize_albedo_range(rgb, settings["luma"])
    rgb = close_edges(rgb, 112)
    output.mkdir(parents=True, exist_ok=True)
    checks = {"basecolor": save_map(rgb, output / f"{stem}-basecolor.png", "RGB")}

    luminance = rgb[..., 0] * .2126 + rgb[..., 1] * .7152 + rgb[..., 2] * .0722
    broad = np.asarray(
        Image.fromarray(np.clip(luminance * 255, 0, 255).astype(np.uint8), "L").filter(ImageFilter.GaussianBlur(2.2)),
        dtype=np.float32,
    ) / 255.0
    detail = np.clip((luminance - broad) * 2.0 + .5, 0, 1)
    height = np.clip(broad * .62 + detail * .38, 0, 1)
    checks["height"] = save_map(height, output / f"{stem}-height.png", "L")
    normal = height_to_normal(height, settings["normal"])
    checks["normal"] = save_map(normal, output / f"{stem}-normal.png", "RGB")

    edge = np.hypot(np.roll(height, -1, 1) - np.roll(height, 1, 1), np.roll(height, -1, 0) - np.roll(height, 1, 0))
    saturation = rgb.max(axis=2) - rgb.min(axis=2)
    rough_low, rough_high = settings["rough"]
    roughness = np.clip(rough_high - detail * .22 + edge * 1.7 + saturation * .08, rough_low, rough_high)
    metal_low, metal_high = settings["metal"]
    metallic = np.clip(metal_high - saturation * 1.15 - (luminance > .62) * .22, metal_low, metal_high)
    ao = np.clip(.82 + height * .18 - edge * 1.8, .48, 1.0)
    checks["roughness"] = save_map(roughness, output / f"{stem}-roughness.png", "L")
    checks["metallic"] = save_map(metallic, output / f"{stem}-metallic.png", "L")
    checks["ao"] = save_map(ao, output / f"{stem}-ao.png", "L")

    cyan = np.clip((rgb[..., 2] - rgb[..., 0] * 1.08) * 4.0 - .12, 0, 1)
    amber = np.clip((rgb[..., 0] - rgb[..., 2] * 1.05) * 3.5 - .22, 0, 1)
    green = np.clip((rgb[..., 1] - np.maximum(rgb[..., 0], rgb[..., 2]) * .9) * 3.4 - .14, 0, 1)
    mask = np.clip(np.maximum.reduce((cyan, amber, green)) * (detail > .56), 0, 1)
    emissive = np.clip(rgb * mask[..., None] * 1.8, 0, 1)
    checks["emissive"] = save_map(emissive, output / f"{stem}-emissive.png", "RGB")

    preview = Image.new("RGB", (3072, 3072))
    tile = Image.open(output / f"{stem}-basecolor.png")
    for y in range(3):
        for x in range(3):
            preview.paste(tile, (x * 1024, y * 1024))
    preview.resize((1536, 1536), Image.Resampling.LANCZOS).save(output / f"{stem}-3x3-preview.png", optimize=True)
    return checks


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("stem", choices=sorted(MATERIALS))
    args = parser.parse_args()
    checks = build(args.source, args.output, args.stem)
    print(f"{args.stem}: 1024x1024")
    for channel, (maximum, mean) in checks.items():
        print(f"  {channel}: edge_max={maximum} edge_mean={mean:.4f}")
    if any(maximum != 0 for maximum, _ in checks.values()):
        raise SystemExit("edge closure failed")


if __name__ == "__main__":
    main()
