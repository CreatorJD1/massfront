"""Build aligned PBR maps from an authored color material source.

The image source supplies the art-directed panel language.  The derived maps
stay pixel-aligned, unlike independently generated normal/roughness images.
"""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
from PIL import Image, ImageEnhance, ImageFilter, ImageOps


def seamless_edge_blend(image: Image.Image, margin: int = 48) -> Image.Image:
    """Feather opposing edges while preserving the authored center detail."""
    arr = np.asarray(image.convert("RGB"), dtype=np.float32)
    h, w, _ = arr.shape
    margin = min(margin, h // 5, w // 5)
    for i in range(margin):
        t = (i + 1) / (margin + 1)
        smooth = t * t * (3.0 - 2.0 * t)
        a = arr[:, i].copy()
        b = arr[:, w - 1 - i].copy()
        mix = (a + b) * 0.5
        arr[:, i] = mix * (1.0 - smooth) + a * smooth
        arr[:, w - 1 - i] = mix * (1.0 - smooth) + b * smooth
    for i in range(margin):
        t = (i + 1) / (margin + 1)
        smooth = t * t * (3.0 - 2.0 * t)
        a = arr[i].copy()
        b = arr[h - 1 - i].copy()
        mix = (a + b) * 0.5
        arr[i] = mix * (1.0 - smooth) + a * smooth
        arr[h - 1 - i] = mix * (1.0 - smooth) + b * smooth
    return Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), "RGB")


def sobel_height(height: np.ndarray, strength: float = 4.0) -> np.ndarray:
    padded = np.pad(height, 1, mode="wrap")
    gx = (
        -padded[:-2, :-2] + padded[:-2, 2:]
        -2 * padded[1:-1, :-2] + 2 * padded[1:-1, 2:]
        -padded[2:, :-2] + padded[2:, 2:]
    )
    gy = (
        -padded[:-2, :-2] - 2 * padded[:-2, 1:-1] - padded[:-2, 2:]
        +padded[2:, :-2] + 2 * padded[2:, 1:-1] + padded[2:, 2:]
    )
    nx = -gx * strength
    ny = gy * strength
    nz = np.ones_like(nx)
    norm = np.sqrt(nx * nx + ny * ny + nz * nz)
    return np.dstack(((nx / norm) * 0.5 + 0.5, (ny / norm) * 0.5 + 0.5, (nz / norm) * 0.5 + 0.5))


def build_maps(source: Path, out_dir: Path, stem: str, size: int) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    base = Image.open(source).convert("RGB")
    base = ImageOps.fit(base, (size, size), method=Image.Resampling.LANCZOS)
    base = seamless_edge_blend(base, max(24, size // 24))
    base = ImageEnhance.Contrast(base).enhance(1.06)
    base.save(out_dir / f"{stem}-basecolor.png", optimize=True)

    rgb = np.asarray(base, dtype=np.float32) / 255.0
    lum = rgb[..., 0] * 0.2126 + rgb[..., 1] * 0.7152 + rgb[..., 2] * 0.0722
    blur = np.asarray(Image.fromarray((lum * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(max(2, size / 256))), dtype=np.float32) / 255.0
    fine = np.clip((lum - blur) * 1.7 + 0.5, 0, 1)
    height = np.clip(blur * 0.58 + fine * 0.42, 0, 1)
    Image.fromarray((height * 255).astype(np.uint8), "L").save(out_dir / f"{stem}-height.png", optimize=True)

    normal = sobel_height(height, 2.8)
    Image.fromarray((normal * 255).astype(np.uint8), "RGB").save(out_dir / f"{stem}-normal.png", optimize=True)

    saturation = rgb.max(axis=2) - rgb.min(axis=2)
    roughness = np.clip(0.84 - fine * 0.24 + saturation * 0.18, 0.28, 0.92)
    metallic = np.clip(0.84 - saturation * 1.6 - (lum > 0.62) * 0.32, 0.12, 0.92)
    ao = np.clip(1.0 - np.maximum(0, blur - height) * 1.8 - (1.0 - height) * 0.12, 0.42, 1.0)
    Image.fromarray((roughness * 255).astype(np.uint8), "L").save(out_dir / f"{stem}-roughness.png", optimize=True)
    Image.fromarray((metallic * 255).astype(np.uint8), "L").save(out_dir / f"{stem}-metallic.png", optimize=True)
    Image.fromarray((ao * 255).astype(np.uint8), "L").save(out_dir / f"{stem}-ao.png", optimize=True)

    cyan = np.clip((rgb[..., 1] + rgb[..., 2]) * 0.65 - rgb[..., 0] * 0.85 - 0.34, 0, 1)
    amber = np.clip((rgb[..., 0] + rgb[..., 1] * 0.45) - rgb[..., 2] * 1.05 - 0.62, 0, 1)
    mask = np.clip((cyan + amber) * 2.8, 0, 1)[..., None]
    emissive = np.clip(rgb * mask * 2.4, 0, 1)
    Image.fromarray((emissive * 255).astype(np.uint8), "RGB").save(out_dir / f"{stem}-emissive.png", optimize=True)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("out_dir", type=Path)
    parser.add_argument("stem")
    parser.add_argument("--size", type=int, default=1024)
    args = parser.parse_args()
    build_maps(args.source, args.out_dir, args.stem, args.size)


if __name__ == "__main__":
    main()
