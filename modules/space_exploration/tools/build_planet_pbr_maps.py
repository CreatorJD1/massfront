"""Build aligned 2:1 planet PBR maps from image-generated surface sources.

The generated color source carries the art direction.  Every derived channel
stays pixel-aligned, wraps horizontally, and uses a reflected pole boundary so
the runtime never has to synthesize a foreground planet material.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image, ImageEnhance, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = ROOT / "assets" / "textures" / "planets" / "source"
OUTPUT_DIR = ROOT / "assets" / "textures" / "planets"
# Runtime maps are the system-view LOD. The original image-generated 2:1
# sources remain full resolution for future orbit/approach packages.
WIDTH = 1024
HEIGHT = 512


PLANETS = {
    "caldris": {"emissive": "cyan", "metallic": 0.02, "roughness": (0.16, 0.78), "seed": 117},
    "ithara": {"emissive": "jade", "metallic": 0.03, "roughness": (0.42, 0.88), "seed": 223},
    "orison": {"emissive": "magma", "metallic": 0.08, "roughness": (0.48, 0.94), "seed": 331},
    "nacre": {"emissive": "violet", "metallic": 0.04, "roughness": (0.22, 0.76), "seed": 449},
    "meridian": {"emissive": "colony", "metallic": 0.05, "roughness": (0.34, 0.86), "seed": 557},
    "tethys": {"emissive": "foundry", "metallic": 0.22, "roughness": (0.38, 0.91), "seed": 661},
}


def horizontal_seam(image: Image.Image, margin: int = 96) -> Image.Image:
    arr = np.asarray(image.convert("RGB"), dtype=np.float32)
    width = arr.shape[1]
    for i in range(min(margin, width // 5)):
        t = (i + 1) / (margin + 1)
        ease = t * t * (3.0 - 2.0 * t)
        left = arr[:, i].copy()
        right = arr[:, width - 1 - i].copy()
        midpoint = (left + right) * 0.5
        arr[:, i] = midpoint * (1.0 - ease) + left * ease
        arr[:, width - 1 - i] = midpoint * (1.0 - ease) + right * ease
    return Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), "RGB")


def height_to_normal(height: np.ndarray, strength: float = 5.0) -> np.ndarray:
    left = np.roll(height, 1, axis=1)
    right = np.roll(height, -1, axis=1)
    # Reflect across each pole. Repeating the edge row creates a one-sided
    # slope at the collapsed pole vertices and shows up as a pinched highlight.
    up = np.vstack((height[1:2], height[:-1]))
    down = np.vstack((height[1:], height[-2:-1]))
    dx = (right - left) * strength
    dy = (down - up) * strength
    nx = -dx
    ny = dy
    nz = np.ones_like(nx)
    norm = np.sqrt(nx * nx + ny * ny + nz * nz)
    return np.dstack((nx / norm * 0.5 + 0.5, ny / norm * 0.5 + 0.5, nz / norm * 0.5 + 0.5))


def close_cloud_boundaries(values: np.ndarray, seam_margin: int = 72, pole_margin: int = 28) -> np.ndarray:
    """Make the weather alpha continuous at the longitude seam and poles."""
    result = values.copy()
    width = result.shape[1]
    for i in range(min(seam_margin, width // 5)):
        t = (i + 1) / (seam_margin + 1)
        ease = t * t * (3.0 - 2.0 * t)
        left = result[:, i].copy()
        right = result[:, width - 1 - i].copy()
        midpoint = (left + right) * 0.5
        result[:, i] = midpoint * (1.0 - ease) + left * ease
        result[:, width - 1 - i] = midpoint * (1.0 - ease) + right * ease

    height = result.shape[0]
    for i in range(min(pole_margin, height // 6)):
        t = i / max(1, pole_margin - 1)
        weight = 1.0 - t * t * (3.0 - 2.0 * t)
        north = result[i]
        south = result[height - 1 - i]
        result[i] = north * (1.0 - weight) + north.mean() * weight
        result[height - 1 - i] = south * (1.0 - weight) + south.mean() * weight
    return np.clip(result, 0.0, 1.0)


def cloud_map(rgb: np.ndarray, seed: int) -> np.ndarray:
    rng = np.random.default_rng(seed)
    noise = rng.random((HEIGHT // 8, WIDTH // 8), dtype=np.float32)
    base = Image.fromarray((noise * 255).astype(np.uint8), "L").resize((WIDTH, HEIGHT), Image.Resampling.BICUBIC)
    broad = np.asarray(base.filter(ImageFilter.GaussianBlur(19)), dtype=np.float32) / 255.0
    detail = np.asarray(base.filter(ImageFilter.GaussianBlur(4)), dtype=np.float32) / 255.0
    # Art-source luminance biases weather fronts toward oceans/basins without
    # copying surface features directly into the cloud layer.
    lum = rgb[..., 0] * 0.2126 + rgb[..., 1] * 0.7152 + rgb[..., 2] * 0.0722
    weather = broad * 0.62 + detail * 0.28 + (1.0 - lum) * 0.10
    return close_cloud_boundaries(np.clip((weather - 0.49) * 4.2, 0.0, 0.82))


def emissive_map(rgb: np.ndarray, mode: str, fine: np.ndarray) -> np.ndarray:
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    if mode in {"magma", "foundry"}:
        mask = np.clip((r * 1.55 + g * 0.25 - b * 0.8 - 0.62) * 4.0, 0, 1)
        tint = np.dstack((np.ones_like(r), np.full_like(r, 0.28), np.full_like(r, 0.035)))
    elif mode == "colony":
        infrastructure = np.clip((r + g + b) / 3.0 - 0.28, 0, 1) * np.clip((fine - 0.47) * 4.0, 0, 1)
        brood = np.clip((r * 1.4 - g * 0.7 - b * 0.45 - 0.12) * 3.2, 0, 1)
        mask = np.clip(infrastructure * 0.8 + brood, 0, 1)
        tint = np.dstack((np.ones_like(r), 0.42 + infrastructure * 0.38, 0.12 + infrastructure * 0.55))
    elif mode == "cyan":
        mask = np.clip((g + b - r * 1.2 - 1.05) * 1.6, 0, 0.35)
        tint = np.dstack((np.full_like(r, 0.08), np.full_like(r, 0.72), np.ones_like(r)))
    elif mode == "jade":
        mask = np.clip((g - r * 0.82 - b * 0.25 - 0.2) * 1.4, 0, 0.2)
        tint = np.dstack((np.full_like(r, 0.08), np.ones_like(r), np.full_like(r, 0.62)))
    else:
        mask = np.clip((b + r * 0.45 - g * 0.72 - 0.72) * 1.8, 0, 0.28)
        tint = np.dstack((np.full_like(r, 0.42), np.full_like(r, 0.18), np.ones_like(r)))
    return np.clip(tint * mask[..., None] * 1.8, 0, 1)


def build(name: str, settings: dict) -> None:
    source = SOURCE_DIR / f"{name}-surface-source.png"
    base = Image.open(source).convert("RGB").resize((WIDTH, HEIGHT), Image.Resampling.LANCZOS)
    base = horizontal_seam(base)
    base = ImageEnhance.Contrast(base).enhance(1.07)
    base.save(OUTPUT_DIR / f"{name}-basecolor.png", optimize=True)

    rgb = np.asarray(base, dtype=np.float32) / 255.0
    lum = rgb[..., 0] * 0.2126 + rgb[..., 1] * 0.7152 + rgb[..., 2] * 0.0722
    blur_img = Image.fromarray((lum * 255).astype(np.uint8), "L").filter(ImageFilter.GaussianBlur(7))
    broad = np.asarray(blur_img, dtype=np.float32) / 255.0
    fine = np.clip((lum - broad) * 2.1 + 0.5, 0, 1)
    height = np.clip(broad * 0.68 + fine * 0.32, 0, 1)
    if settings["emissive"] in {"magma", "foundry"}:
        # Hot fissures are recessed crust breaks, not raised white ridges. The
        # earlier luminance-only conversion inverted their relief and made the
        # strongest authored feature read like glowing wire laid on the crust.
        r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
        fissures = np.clip((r * 1.55 + g * 0.25 - b * 0.8 - 0.62) * 4.0, 0, 1)
        height = np.clip(height - fissures * 0.12, 0, 1)
    Image.fromarray((height * 255).astype(np.uint8), "L").save(OUTPUT_DIR / f"{name}-height.png", optimize=True)

    normal = height_to_normal(height)
    Image.fromarray((normal * 255).astype(np.uint8), "RGB").save(OUTPUT_DIR / f"{name}-normal.png", optimize=True)

    saturation = rgb.max(axis=2) - rgb.min(axis=2)
    low, high = settings["roughness"]
    roughness = np.clip(high - fine * 0.27 + saturation * 0.12, low, high)
    metallic = np.clip(settings["metallic"] + (fine - 0.64) * 0.18, 0, 0.48)
    ao = np.clip(0.88 + height * 0.12 - np.maximum(0, broad - height) * 1.8, 0.46, 1.0)
    emissive = emissive_map(rgb, settings["emissive"], fine)
    clouds = cloud_map(rgb, settings["seed"])

    Image.fromarray((roughness * 255).astype(np.uint8), "L").save(OUTPUT_DIR / f"{name}-roughness.png", optimize=True)
    Image.fromarray((metallic * 255).astype(np.uint8), "L").save(OUTPUT_DIR / f"{name}-metallic.png", optimize=True)
    Image.fromarray((ao * 255).astype(np.uint8), "L").save(OUTPUT_DIR / f"{name}-ao.png", optimize=True)
    orm = np.dstack((ao, roughness, metallic))
    Image.fromarray((orm * 255).astype(np.uint8), "RGB").save(OUTPUT_DIR / f"{name}-orm.png", optimize=True)
    Image.fromarray((emissive * 255).astype(np.uint8), "RGB").save(OUTPUT_DIR / f"{name}-emissive.png", optimize=True)
    Image.fromarray((clouds * 255).astype(np.uint8), "L").save(OUTPUT_DIR / f"{name}-clouds.png", optimize=True)


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    for name, settings in PLANETS.items():
        build(name, settings)
        print(f"built {name}")


if __name__ == "__main__":
    main()
