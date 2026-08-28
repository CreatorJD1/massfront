"""Derive a seam-safe MASSFRONT PBR set from an original neutral albedo master."""

from pathlib import Path
import sys

import numpy as np
from PIL import Image, ImageFilter


def periodic_edges(array: np.ndarray, band: int = 96) -> np.ndarray:
    result = array.astype(np.float32).copy()
    height, width = result.shape[:2]
    for offset in range(band):
        weight = 0.5 * (1.0 + np.cos(np.pi * offset / band))
        left = offset
        right = width - 1 - offset
        average = (result[:, left] + result[:, right]) * 0.5
        result[:, left] = result[:, left] * (1.0 - weight) + average * weight
        result[:, right] = result[:, right] * (1.0 - weight) + average * weight
    for offset in range(band):
        weight = 0.5 * (1.0 + np.cos(np.pi * offset / band))
        top = offset
        bottom = height - 1 - offset
        average = (result[top] + result[bottom]) * 0.5
        result[top] = result[top] * (1.0 - weight) + average * weight
        result[bottom] = result[bottom] * (1.0 - weight) + average * weight
    result[:, -1] = result[:, 0]
    result[-1, :] = result[0, :]
    return np.clip(result, 0, 255).astype(np.uint8)


def save_gray(values: np.ndarray, path: Path) -> None:
    Image.fromarray(np.clip(values, 0, 255).astype(np.uint8), "L").save(path)


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit("usage: derive-city-architecture-material.py SOURCE OUTPUT_DIR")
    source = Path(sys.argv[1])
    output = Path(sys.argv[2])
    output.mkdir(parents=True, exist_ok=True)

    master = Image.open(source).convert("RGB").resize((1024, 1024), Image.Resampling.LANCZOS)
    albedo = periodic_edges(np.asarray(master), 112)
    prefix = output / "uga-city-architecture"
    Image.fromarray(albedo, "RGB").save(f"{prefix}-basecolor.png")

    rgb = albedo.astype(np.float32) / 255.0
    luminance = rgb[..., 0] * 0.2126 + rgb[..., 1] * 0.7152 + rgb[..., 2] * 0.0722
    smooth = np.asarray(Image.fromarray((luminance * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.1))).astype(np.float32) / 255.0
    height = smooth * 0.72 + luminance * 0.28
    dx = np.roll(height, -1, axis=1) - np.roll(height, 1, axis=1)
    dy = np.roll(height, -1, axis=0) - np.roll(height, 1, axis=0)
    nx = -dx * 4.1
    ny = dy * 4.1
    nz = np.ones_like(nx)
    length = np.sqrt(nx * nx + ny * ny + nz * nz)
    normal = np.stack(((nx / length) * 0.5 + 0.5, (ny / length) * 0.5 + 0.5, (nz / length) * 0.5 + 0.5), axis=-1)
    normal_u8 = periodic_edges((normal * 255).astype(np.uint8), 4)
    Image.fromarray(normal_u8, "RGB").save(f"{prefix}-normal.png")
    save_gray(height * 255, Path(f"{prefix}-height.png"))

    edge = np.sqrt(dx * dx + dy * dy)
    roughness = np.clip(0.43 + edge * 1.8 + (luminance > 0.55) * 0.13, 0.34, 0.78)
    save_gray(roughness * 255, Path(f"{prefix}-roughness.png"))
    metallic = np.where(luminance > 0.54, 0.30, 0.76)
    save_gray(metallic * 255, Path(f"{prefix}-metallic.png"))
    ao = np.clip(0.78 + luminance * 0.22 - edge * 0.72, 0.46, 1.0)
    save_gray(ao * 255, Path(f"{prefix}-ao.png"))

    cyan = np.clip((rgb[..., 2] - rgb[..., 0] * 1.08) * 3.8, 0, 1)
    emission = np.stack((cyan * 0.08, cyan * 0.58, cyan), axis=-1)
    Image.fromarray((emission * 255).astype(np.uint8), "RGB").save(f"{prefix}-emissive.png")

    preview = Image.new("RGB", (1024 * 3, 1024 * 3))
    tile = Image.fromarray(albedo, "RGB")
    for y in range(3):
        for x in range(3):
            preview.paste(tile, (x * 1024, y * 1024))
    preview.resize((1536, 1536), Image.Resampling.LANCZOS).save(output / "uga-city-architecture-3x3-preview.png")

    horizontal = np.abs(albedo[:, 0].astype(np.int16) - albedo[:, -1].astype(np.int16))
    vertical = np.abs(albedo[0].astype(np.int16) - albedo[-1].astype(np.int16))
    print(f"source={source}")
    print("output=1024x1024")
    print(f"edge_max={max(horizontal.max(), vertical.max())} edge_mean={(horizontal.mean() + vertical.mean()) * .5:.4f}")


if __name__ == "__main__":
    main()
