"""Build the authored, seam-closed NEXUS-VII window PBR texture set.

The emissive map contains only pane interiors.  It deliberately contains no
painted halo: the runtime depth-aware post pass owns light spread, while the
texture remains the exact source mask for the glow.
"""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
from PIL import Image


SIZE = 1024


def smoothstep(edge0: float, edge1: float, value: np.ndarray) -> np.ndarray:
    t = np.clip((value - edge0) / max(1e-6, edge1 - edge0), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def save(values: np.ndarray, path: Path, mode: str) -> None:
    encoded = np.clip(values * 255.0 + 0.5, 0, 255).astype(np.uint8)
    # Opposing texels are authored identically, so bilinear filtering and every
    # mip level repeat without a bright seam.
    encoded[:, -1] = encoded[:, 0]
    encoded[-1, :] = encoded[0, :]
    Image.fromarray(encoded, mode).save(path, optimize=True)


def build(output: Path) -> None:
    output.mkdir(parents=True, exist_ok=True)
    y, x = np.mgrid[0:SIZE, 0:SIZE].astype(np.float32)
    u = x / (SIZE - 1)
    v = y / (SIZE - 1)

    # Four-by-four pressure panes.  The periodic distance field keeps both
    # outer borders inside the same dark mullion instead of cutting a lit pane
    # at the texture seam.
    cell_u = np.mod(u * 4.0, 1.0)
    cell_v = np.mod(v * 4.0, 1.0)
    edge_distance = np.minimum.reduce((cell_u, 1.0 - cell_u, cell_v, 1.0 - cell_v))
    pane = smoothstep(0.075, 0.125, edge_distance)
    inner = smoothstep(0.12, 0.22, edge_distance)
    mullion = 1.0 - pane

    # Deterministic broad glass variation.  It is periodic and low contrast,
    # so it survives close inspection without turning command zoom into noise.
    drift = 0.5 + 0.5 * np.sin(u * np.pi * 8.0) * np.sin(v * np.pi * 8.0)
    scan = 0.5 + 0.5 * np.cos(v * np.pi * 32.0)
    base = np.zeros((SIZE, SIZE, 3), dtype=np.float32)
    glass = np.stack((0.025 + drift * 0.012, 0.095 + drift * 0.025, 0.135 + drift * 0.035), axis=-1)
    frame = np.stack((0.045 + scan * 0.015, 0.060 + scan * 0.012, 0.075 + scan * 0.012), axis=-1)
    base[:] = glass * pane[..., None] + frame * mullion[..., None]

    height = np.clip(0.38 + pane * 0.36 + inner * 0.08, 0, 1)
    dx = (np.roll(height, -1, axis=1) - np.roll(height, 1, axis=1)) * 5.2
    dy = (np.roll(height, -1, axis=0) - np.roll(height, 1, axis=0)) * 5.2
    normal = np.stack((-dx, dy, np.ones_like(height)), axis=-1)
    normal /= np.maximum(1e-6, np.linalg.norm(normal, axis=-1, keepdims=True))
    normal = normal * 0.5 + 0.5

    ao = np.clip(0.62 + pane * 0.34, 0, 1)
    roughness = np.clip(0.54 - pane * 0.31 + (1.0 - inner) * 0.08, 0, 1)
    metallic = np.clip(0.68 * mullion + 0.10 * pane, 0, 1)

    # Pane occupancy varies only in intensity; no frame or wall texel can
    # become a bloom source.  The narrow post halo is derived from this image.
    cell_x = np.floor(u * 4.0).astype(np.int32)
    cell_y = np.floor(v * 4.0).astype(np.int32)
    occupied = np.where(((cell_x * 5 + cell_y * 3) % 7) == 0, 0.42, 1.0)
    centre_lift = 0.72 + inner * 0.28
    signal = pane * occupied * centre_lift
    emissive = np.stack((signal * 0.18, signal * 0.76, signal), axis=-1)

    stem = "uga-window-glazing"
    save(base, output / f"{stem}-basecolor.png", "RGB")
    save(height, output / f"{stem}-height.png", "L")
    save(normal, output / f"{stem}-normal.png", "RGB")
    save(ao, output / f"{stem}-ao.png", "L")
    save(roughness, output / f"{stem}-roughness.png", "L")
    save(metallic, output / f"{stem}-metallic.png", "L")
    save(emissive, output / f"{stem}-emissive.png", "RGB")

    preview = Image.new("RGB", (SIZE * 3, SIZE * 3))
    tile = Image.open(output / f"{stem}-basecolor.png")
    for py in range(3):
        for px in range(3):
            preview.paste(tile, (px * SIZE, py * SIZE))
    preview.resize((1536, 1536), Image.Resampling.LANCZOS).save(
        output / f"{stem}-3x3-preview.png", optimize=True
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    build(args.output)
    print("uga-window-glazing: authored 1024x1024 PBR + emissive mask")


if __name__ == "__main__":
    main()
