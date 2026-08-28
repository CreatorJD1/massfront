"""Bake the four base-game War Table planet material families.

The image-generated masters establish each world's distinct continent/material
language.  Runtime channels are derived together so normal, ORM, height,
emission, and cloud masks stay pixel-aligned.  Longitude edges are explicitly
closed and pole rows are flattened before derivation; the renderer may then use
ordinary REPEAT/CLAMP sampling without a visible seam or pinched highlight.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "assets" / "source" / "planets" / "war-table"
OUTPUT = ROOT / "assets" / "textures" / "planets" / "war-table"
REPORT = SOURCE / "planetart-provenance.json"
WIDTH, HEIGHT = 1024, 512

WORLDS = {
    "aelos": {"seed": 117, "rough": (0.18, 0.82), "metal": 0.035, "cloud": 0.42},
    "pyraeth": {"seed": 223, "rough": (0.42, 0.94), "metal": 0.12, "cloud": 0.58},
    "nordhall": {"seed": 449, "rough": (0.20, 0.78), "metal": 0.10, "cloud": 0.30},
    "vespera": {"seed": 661, "rough": (0.46, 0.96), "metal": 0.025, "cloud": 0.34},
}


def smoothstep(value: np.ndarray | float) -> np.ndarray | float:
    return value * value * (3.0 - 2.0 * value)


def close_sphere_boundaries(rgb: np.ndarray, seam: int = 96, pole: int = 28) -> np.ndarray:
    """Cross-fade longitude and collapse each pole toward one stable colour."""
    out = rgb.astype(np.float32).copy()
    width = out.shape[1]
    seam = min(seam, width // 5)
    for offset in range(seam):
        t = (offset + 1) / (seam + 1)
        keep = smoothstep(t)
        left = out[:, offset].copy()
        right = out[:, width - 1 - offset].copy()
        midpoint = (left + right) * 0.5
        out[:, offset] = midpoint * (1.0 - keep) + left * keep
        out[:, width - 1 - offset] = midpoint * (1.0 - keep) + right * keep
    out[:, -1] = out[:, 0]

    height = out.shape[0]
    pole = min(pole, height // 8)
    north = out[:pole].mean(axis=(0, 1))
    south = out[-pole:].mean(axis=(0, 1))
    for offset in range(pole):
        t = offset / max(1, pole - 1)
        north_weight = 1.0 - smoothstep(t)
        south_weight = north_weight
        out[offset] = out[offset] * (1.0 - north_weight) + north * north_weight
        out[height - 1 - offset] = out[height - 1 - offset] * (1.0 - south_weight) + south * south_weight
    out[0] = north
    out[-1] = south
    return np.clip(out, 0.0, 1.0)


def height_to_normal(height: np.ndarray, strength: float) -> np.ndarray:
    left, right = np.roll(height, 1, 1), np.roll(height, -1, 1)
    up = np.vstack((height[1:2], height[:-1]))
    down = np.vstack((height[1:], height[-2:-1]))
    dx, dy = (right - left) * strength, (down - up) * strength
    nx, ny, nz = -dx, dy, np.ones_like(height)
    length = np.sqrt(nx * nx + ny * ny + nz * nz)
    normal = np.dstack((nx / length * 0.5 + 0.5, ny / length * 0.5 + 0.5, nz / length * 0.5 + 0.5))
    normal[:, -1] = normal[:, 0]
    normal[0, :, 0:2] = 0.5
    normal[-1, :, 0:2] = 0.5
    return normal


def derive_emissive(name: str, rgb: np.ndarray, fine: np.ndarray) -> np.ndarray:
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    detail = np.clip((fine - 0.52) * 4.0, 0, 1)
    if name == "aelos":
        neutral = 1.0 - np.clip((rgb.max(2) - rgb.min(2)) * 4.0, 0, 1)
        land = np.clip((r + g - b * 0.95 - 0.15) * 2.2, 0, 1)
        mask = detail * neutral * land * 0.72
        tint = np.dstack((np.full_like(r, 0.28), np.full_like(r, 0.86), np.ones_like(r)))
    elif name == "pyraeth":
        heat = np.clip((r * 1.45 + g * 0.18 - b * 0.75 - 0.72) * 3.8, 0, 1)
        industry = detail * np.clip((r - b * 0.75 - 0.22) * 2.0, 0, 1)
        mask = np.clip(heat + industry * 0.34, 0, 1)
        tint = np.dstack((np.ones_like(r), np.full_like(r, 0.24), np.full_like(r, 0.035)))
    elif name == "nordhall":
        cyan = np.clip((g + b - r * 1.45 - 0.72) * 2.4, 0, 1)
        machinery = detail * np.clip((0.72 - (r + g + b) / 3.0) * 2.0, 0, 1)
        mask = np.clip(cyan * 0.75 + machinery * 0.16, 0, 0.58)
        tint = np.dstack((np.full_like(r, 0.12), np.ones_like(r), np.full_like(r, 0.72)))
    else:
        magma = np.clip((r * 1.6 + g * 0.25 - b * 0.82 - 0.54) * 3.4, 0, 1)
        brood = np.clip((r + b * 0.72 - g * 1.12 - 0.28) * 2.6, 0, 1) * detail
        mask = np.clip(magma + brood * 0.42, 0, 1)
        tint = np.dstack((np.ones_like(r), 0.12 + magma * 0.24, 0.08 + brood * 0.52))
    out = np.clip(tint * mask[..., None] * 1.85, 0, 1)
    out[:, -1] = out[:, 0]
    return out


def derive_clouds(rgb: np.ndarray, seed: int, coverage: float) -> np.ndarray:
    rng = np.random.default_rng(seed)
    coarse = rng.random((HEIGHT // 12, WIDTH // 12), dtype=np.float32)
    noise = Image.fromarray((coarse * 255).astype(np.uint8), "L").resize((WIDTH, HEIGHT), Image.Resampling.BICUBIC)
    broad = np.asarray(noise.filter(ImageFilter.GaussianBlur(22)), dtype=np.float32) / 255.0
    detail = np.asarray(noise.filter(ImageFilter.GaussianBlur(5)), dtype=np.float32) / 255.0
    lum = rgb[..., 0] * 0.2126 + rgb[..., 1] * 0.7152 + rgb[..., 2] * 0.0722
    weather = broad * 0.63 + detail * 0.29 + (1.0 - lum) * 0.08
    threshold = 0.59 - coverage * 0.17
    clouds = np.clip((weather - threshold) * 4.6, 0, 0.90)
    return close_sphere_boundaries(clouds[..., None], seam=72, pole=24)[..., 0]


def save(values: np.ndarray, path: Path, mode: str) -> dict:
    encoded = np.clip(values * 255.0, 0, 255).astype(np.uint8)
    # Compression and later scalar derivation can reintroduce a one-value
    # longitude mismatch even when the source was closed.  The two columns
    # represent the same meridian, so make that identity exact at the final
    # encoded boundary instead of asking texture filtering to hide it.
    encoded[:, -1] = encoded[:, 0]
    Image.fromarray(encoded, mode).save(path, optimize=True)
    horizontal = np.abs(encoded[:, 0].astype(np.int16) - encoded[:, -1].astype(np.int16))
    return {
        "path": path.relative_to(ROOT).as_posix(),
        "bytes": path.stat().st_size,
        "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
        "maxLongitudeDelta": int(horizontal.max()),
    }


def build(name: str, settings: dict) -> dict:
    source = SOURCE / f"{name}-surface-master.png"
    master = Image.open(source).convert("RGB").resize((WIDTH, HEIGHT), Image.Resampling.LANCZOS)
    rgb = close_sphere_boundaries(np.asarray(master, dtype=np.float32) / 255.0)

    lum = rgb[..., 0] * 0.2126 + rgb[..., 1] * 0.7152 + rgb[..., 2] * 0.0722
    broad = np.asarray(Image.fromarray((lum * 255).astype(np.uint8), "L").filter(ImageFilter.GaussianBlur(7)), dtype=np.float32) / 255.0
    fine = np.clip((lum - broad) * 2.15 + 0.5, 0, 1)
    height = np.clip(broad * 0.66 + fine * 0.34, 0, 1)
    if name == "aelos":
        water = np.clip((rgb[..., 2] - rgb[..., 0] * 0.74 - 0.12) * 2.7, 0, 1)
        height = np.clip(height - water * 0.20, 0, 1)
    elif name in {"pyraeth", "vespera"}:
        hot = np.clip((rgb[..., 0] * 1.5 + rgb[..., 1] * 0.2 - rgb[..., 2] * 0.8 - 0.58) * 3.6, 0, 1)
        height = np.clip(height - hot * 0.10, 0, 1)
    height[:, -1] = height[:, 0]

    saturation = rgb.max(2) - rgb.min(2)
    low, high = settings["rough"]
    roughness = np.clip(high - fine * 0.25 + saturation * 0.10, low, high)
    metallic = np.clip(settings["metal"] + (fine - 0.64) * 0.15, 0, 0.42)
    ao = np.clip(0.86 + height * 0.14 - np.maximum(0, broad - height) * 1.7, 0.44, 1.0)
    orm = np.dstack((ao, roughness, metallic))
    normal = height_to_normal(height, 4.8 if name != "nordhall" else 4.0)
    emissive = derive_emissive(name, rgb, fine)
    clouds = derive_clouds(rgb, settings["seed"], settings["cloud"])

    prefix = OUTPUT / f"{name}"
    outputs = {
        "basecolor": save(rgb, Path(f"{prefix}-basecolor-v1.png"), "RGB"),
        "normal": save(normal, Path(f"{prefix}-normal-v1.png"), "RGB"),
        "orm": save(orm, Path(f"{prefix}-orm-v1.png"), "RGB"),
        "height": save(height, Path(f"{prefix}-height-v1.png"), "L"),
        "emissive": save(emissive, Path(f"{prefix}-emissive-v1.png"), "RGB"),
        "clouds": save(clouds, Path(f"{prefix}-clouds-v1.png"), "L"),
    }
    return {
        "source": source.relative_to(ROOT).as_posix(),
        "sourceSha256": hashlib.sha256(source.read_bytes()).hexdigest(),
        "dimensions": [WIDTH, HEIGHT],
        "outputs": outputs,
    }


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    report = {
        "schema": "MFPlanetArtProvenanceV1",
        "generated": "2026-08-25",
        "generator": "tools/bake-wartable-planets.py",
        "contract": "basecolor(sRGB), normal(tangent RGB), ORM(AO/R roughness/G metalness/B), height(linear), emissive(sRGB), clouds(linear)",
        "worlds": {},
    }
    for name, settings in WORLDS.items():
        report["worlds"][name] = build(name, settings)
        print(f"built {name}")
    REPORT.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    if any(channel["maxLongitudeDelta"] for world in report["worlds"].values() for channel in world["outputs"].values()):
        raise SystemExit("longitude seam validation failed")
    print(REPORT.relative_to(ROOT).as_posix())


if __name__ == "__main__":
    main()
