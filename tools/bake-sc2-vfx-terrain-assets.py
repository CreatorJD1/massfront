#!/usr/bin/env python3
"""Bake generated source art into deterministic MASSFRONT runtime assets.

The image generator supplies original source art.  This step owns the engine
requirements it cannot reliably guarantee: exact dimensions, atlas gutters,
periodic terrain edges, lighting-neutral albedo, and packed normal/roughness.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageEnhance, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
TERRAIN_OUT = ROOT / "assets" / "terrain"
VFX_OUT = ROOT / "assets" / "textures" / "vfx"
QA_OUT = ROOT / ".tmp" / "terrain-asset-qa"


def square_1024(path: Path, mode: str) -> Image.Image:
    image = Image.open(path).convert(mode)
    side = min(image.size)
    left = (image.width - side) // 2
    top = (image.height - side) // 2
    return image.crop((left, top, left + side, top + side)).resize(
        (1024, 1024), Image.Resampling.LANCZOS
    )


def _hermite(p0: np.ndarray, m0: np.ndarray, p1: np.ndarray, m1: np.ndarray, t: float, span: int) -> np.ndarray:
    t2 = t * t
    t3 = t2 * t
    return (
        (2.0 * t3 - 3.0 * t2 + 1.0) * p0
        + (t3 - 2.0 * t2 + t) * span * m0
        + (-2.0 * t3 + 3.0 * t2) * p1
        + (t3 - t2) * span * m1
    )


def _periodic_axis(data: np.ndarray, axis: int, band: int) -> np.ndarray:
    """Close one axis with a C1 Hermite seam and a flat two-texel boundary."""
    values = np.swapaxes(data, 0, axis).copy()
    count = values.shape[0]
    if band * 2 + 6 >= count:
        raise ValueError("periodic blend band is too wide")

    edge = (values[0] + values[-1]) * 0.5
    left_value = values[band].copy()
    right_index = count - 1 - band
    right_value = values[right_index].copy()
    zero = np.zeros_like(edge)

    for index in range(band + 1):
        t = index / band
        values[index] = _hermite(edge, zero, left_value, zero, t, band)
        values[right_index + index] = _hermite(
            right_value, zero, edge, zero, t, band
        )

    # Exact value and first-difference agreement survives lossless WebP.  Two
    # flat texels are visually inert but prevent normal-map cusps at the wrap.
    values[0] = edge
    values[1] = edge
    values[-2] = edge
    values[-1] = edge
    return np.swapaxes(values, 0, axis)


def periodic_edges(rgb: np.ndarray, band: int = 80) -> np.ndarray:
    """Make opposite borders exactly equal in value and first difference."""
    out = rgb.astype(np.float32).copy()
    out = _periodic_axis(out, 1, band)
    out = _periodic_axis(out, 0, band)
    return np.clip(np.rint(out), 0, 255).astype(np.uint8)


def periodic_component(rgb: np.ndarray) -> np.ndarray:
    """Moisan periodic-plus-smooth decomposition without a stretched edge band."""
    source = rgb.astype(np.float32)
    result = np.empty_like(source)
    height, width = source.shape[:2]
    yy = np.arange(height, dtype=np.float32)[:, None]
    xx = np.arange(width, dtype=np.float32)[None, :]
    denominator = (
        2.0 * np.cos(2.0 * np.pi * xx / width)
        + 2.0 * np.cos(2.0 * np.pi * yy / height)
        - 4.0
    )
    denominator[0, 0] = 1.0

    for channel in range(source.shape[2]):
        plane = source[:, :, channel]
        boundary = np.zeros_like(plane)
        boundary[0] = plane[-1] - plane[0]
        boundary[-1] = plane[0] - plane[-1]
        boundary[:, 0] += plane[:, -1] - plane[:, 0]
        boundary[:, -1] += plane[:, 0] - plane[:, -1]
        smooth_fft = np.fft.fft2(boundary) / denominator
        smooth_fft[0, 0] = 0.0
        smooth = np.fft.ifft2(smooth_fft).real
        result[:, :, channel] = plane - smooth
    return result


def neutralize_lighting(image: Image.Image, amount: float) -> Image.Image:
    rgb = np.asarray(image.convert("RGB"), dtype=np.float32)
    broad = np.asarray(image.filter(ImageFilter.GaussianBlur(34)), dtype=np.float32)
    target = broad.mean(axis=(0, 1), keepdims=True)
    rgb += (target - broad) * amount
    return Image.fromarray(np.uint8(np.clip(rgb, 0, 255)), "RGB")


def bake_albedo(source: Path, out: Path, color: float, contrast: float) -> Image.Image:
    image = square_1024(source, "RGB")
    image = neutralize_lighting(image, 0.56)
    image = ImageEnhance.Color(image).enhance(color)
    image = ImageEnhance.Contrast(image).enhance(contrast)
    data = periodic_component(np.asarray(image))
    data = periodic_edges(data, band=6)
    image = Image.fromarray(data, "RGB")
    out.parent.mkdir(parents=True, exist_ok=True)
    # Lossy block transforms break otherwise-identical border texels.
    image.save(out, "WEBP", lossless=True, method=6)
    return image


def _phase_randomized_microdetail(source: Image.Image) -> np.ndarray:
    """Retain source grain statistics without retaining its facade-like panels."""
    rgb = np.asarray(neutralize_lighting(source, 0.92), dtype=np.float32)
    gray = rgb @ np.array((0.2126, 0.7152, 0.0722), dtype=np.float32)
    broad = np.asarray(
        Image.fromarray(np.uint8(np.clip(gray, 0, 255)), "L").filter(
            ImageFilter.GaussianBlur(11.0)
        ),
        dtype=np.float32,
    )
    detail = gray - broad

    spectrum = np.fft.fft2(detail)
    fy = np.fft.fftfreq(detail.shape[0])[:, None]
    fx = np.fft.fftfreq(detail.shape[1])[None, :]
    radius = np.sqrt(fx * fx + fy * fy)
    high_pass = np.clip((radius - 1.0 / 54.0) / (1.0 / 28.0), 0.0, 1.0)
    low_pass = np.clip((0.42 - radius) / 0.14, 0.0, 1.0)
    amplitude = np.abs(spectrum) * high_pass * low_pass

    rng = np.random.default_rng(0x4D465854)
    random_phase = np.angle(np.fft.fft2(rng.standard_normal(detail.shape)))
    periodic = np.fft.ifft2(amplitude * np.exp(1j * random_phase)).real
    periodic -= periodic.mean()
    periodic /= max(1e-6, periodic.std())
    return np.clip(periodic * 4.2, -11.0, 11.0)


def bake_metal_albedo(source: Path, out: Path) -> Image.Image:
    """Build a top-down modular deck; source art contributes only color/grain."""
    source_image = square_1024(source, "RGB")
    source_rgb = np.asarray(neutralize_lighting(source_image, 0.92), dtype=np.float32)
    source_mean = source_rgb.mean(axis=(0, 1))
    # Keep the generated gunmetal hue but lift it into a readable terrain band.
    base_color = source_mean * 0.68 + np.array((72.0, 76.0, 79.0)) * 0.32
    micro = _phase_randomized_microdetail(source_image)
    result = np.empty((1024, 1024, 3), dtype=np.float32)
    result[:] = base_color
    result += micro[:, :, None]

    yy, xx = np.mgrid[0:1024, 0:1024]
    period = 256
    offset = period // 2
    cell_x = ((xx - offset) % 1024) // period
    cell_y = ((yy - offset) % 1024) // period
    plate_tones = np.array(
        (
            (-1.8, 1.2, -0.4, 1.7),
            (0.8, -1.2, 1.4, -0.7),
            (-0.2, 1.8, -1.5, 0.6),
            (1.1, -0.5, 0.9, -1.0),
        ),
        dtype=np.float32,
    )
    result += plate_tones[cell_y, cell_x][:, :, None]

    distance_x = np.abs(((xx - offset + period / 2.0) % period) - period / 2.0)
    distance_y = np.abs(((yy - offset + period / 2.0) % period) - period / 2.0)
    distance = np.minimum(distance_x, distance_y)
    groove = np.exp(-((distance / 1.18) ** 2))
    shoulder = np.exp(-(((distance - 3.2) / 1.15) ** 2))
    # Symmetric shoulders imply no baked light direction, only a restrained
    # recessed join that the packed normal map can shade at runtime.
    result += (-13.5 * groove + 1.5 * shoulder)[:, :, None]

    # Geometry and Fourier microdetail are already periodic; this narrow close
    # exists only to make decoded opposite texels byte-identical for QA.
    result = periodic_edges(result, band=12)
    image = Image.fromarray(result, "RGB")
    out.parent.mkdir(parents=True, exist_ok=True)
    image.save(out, "WEBP", lossless=True, method=6)
    return image


def bake_normal_rough(
    albedo: Image.Image, out: Path, strength: float, roughness: int
) -> None:
    gray_image = albedo.convert("L").filter(ImageFilter.GaussianBlur(0.7))
    gray = np.asarray(gray_image, dtype=np.float32) / 255.0
    broad = np.asarray(gray_image.filter(ImageFilter.GaussianBlur(4.0)), dtype=np.float32) / 255.0
    height = gray * 0.55 + (gray - broad) * 1.35
    dx = (np.roll(height, -1, axis=1) - np.roll(height, 1, axis=1)) * strength
    dy = (np.roll(height, -1, axis=0) - np.roll(height, 1, axis=0)) * strength
    nx, ny, nz = -dx, -dy, np.ones_like(dx)
    inv = 1.0 / np.sqrt(nx * nx + ny * ny + nz * nz)
    normal = np.stack((nx * inv, ny * inv, nz * inv), axis=2)
    normal = np.uint8(np.clip(normal * 127.5 + 127.5, 0, 255))
    local = np.abs(gray - broad)
    rough = np.uint8(np.clip(roughness + local * 115.0, 112, 245))
    packed = np.dstack((normal, rough))
    packed = periodic_edges(packed, band=12)
    blended_normal = packed[:, :, :3].astype(np.float32) / 127.5 - 1.0
    blended_length = np.sqrt(np.sum(blended_normal * blended_normal, axis=2, keepdims=True))
    blended_normal /= np.maximum(blended_length, 1e-6)
    packed[:, :, :3] = np.uint8(
        np.clip(np.rint(blended_normal * 127.5 + 127.5), 0, 255)
    )
    out.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(packed, "RGBA").save(out, "WEBP", lossless=True, method=6)


def keep_primary_alpha_component(frame: Image.Image) -> Image.Image:
    """Remove neighboring-cell spill and detached spray from one authored frame."""
    data = np.asarray(frame.convert("RGBA"), dtype=np.uint8).copy()
    mask_image = Image.fromarray(np.uint8(data[:, :, 3] >= 12) * 255, "L").filter(
        ImageFilter.MaxFilter(3)
    )
    mask = np.asarray(mask_image, dtype=np.uint8) > 0
    visited = np.zeros(mask.shape, dtype=bool)
    best: list[tuple[int, int]] = []
    height, width = mask.shape

    for start_y, start_x in zip(*np.nonzero(mask & ~visited)):
        if visited[start_y, start_x]:
            continue
        stack = [(int(start_y), int(start_x))]
        visited[start_y, start_x] = True
        component: list[tuple[int, int]] = []
        while stack:
            y, x = stack.pop()
            component.append((y, x))
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    if dx == 0 and dy == 0:
                        continue
                    ny, nx = y + dy, x + dx
                    if (
                        0 <= ny < height
                        and 0 <= nx < width
                        and mask[ny, nx]
                        and not visited[ny, nx]
                    ):
                        visited[ny, nx] = True
                        stack.append((ny, nx))
        if len(component) > len(best):
            best = component

    keep = np.zeros(mask.shape, dtype=bool)
    if best:
        ys, xs = zip(*best)
        keep[np.asarray(ys), np.asarray(xs)] = True
    data[~keep, :3] = 0
    data[~keep, 3] = 0
    return Image.fromarray(data, "RGBA")


def center_frame(frame: Image.Image, bottom_anchor: bool) -> Image.Image:
    alpha = frame.getchannel("A")
    bounds = alpha.getbbox()
    if not bounds:
        return frame
    content = frame.crop(bounds)
    x = (256 - content.width) // 2
    y = 250 - content.height if bottom_anchor else (256 - content.height) // 2
    target = Image.new("RGBA", (256, 256), (0, 0, 0, 0))
    target.alpha_composite(content, (x, max(2, y)))
    return target


def bake_atlas(
    source: Path, out: Path, neutral_fringe: bool = False, bottom_anchor: bool = False
) -> None:
    source_image = square_1024(source, "RGBA")
    target = Image.new("RGBA", (1024, 1024), (0, 0, 0, 0))
    for row in range(4):
        for col in range(4):
            frame = source_image.crop((col * 256, row * 256, col * 256 + 256, row * 256 + 256))
            frame = keep_primary_alpha_component(frame)
            frame = center_frame(frame, bottom_anchor)
            frame = frame.resize((238, 238), Image.Resampling.LANCZOS)
            data = np.asarray(frame, dtype=np.uint8).copy()
            alpha = data[:, :, 3]
            alpha[alpha < 12] = 0
            if neutral_fringe:
                rgb = data[:, :, :3].astype(np.float32)
                lum = (
                    rgb[:, :, 0:1] * 0.2126
                    + rgb[:, :, 1:2] * 0.7152
                    + rgb[:, :, 2:3] * 0.0722
                )
                neutral = np.concatenate((lum * 1.04, lum, lum * 0.94), axis=2)
                edge = np.clip((210.0 - alpha.astype(np.float32)) / 190.0, 0.0, 1.0)[:, :, None]
                rgb = rgb * (1.0 - edge * 0.94) + neutral * edge * 0.94
                data[:, :, :3] = np.uint8(np.clip(rgb, 0, 255))
            data[alpha == 0, :3] = 0
            data[:, :, 3] = alpha
            frame = Image.fromarray(data, "RGBA")
            target.alpha_composite(frame, (col * 256 + 9, row * 256 + 9))
    out.parent.mkdir(parents=True, exist_ok=True)
    target.save(out, "PNG", optimize=True)


def edge_metrics(path: Path) -> dict[str, object]:
    data = np.asarray(Image.open(path), dtype=np.int16)
    if data.ndim == 2:
        data = data[:, :, None]
    value_x = np.abs(data[:, 0] - data[:, -1])
    value_y = np.abs(data[0] - data[-1])
    slope_x = np.abs((data[:, 1] - data[:, 0]) - (data[:, -1] - data[:, -2]))
    slope_y = np.abs((data[1] - data[0]) - (data[-1] - data[-2]))
    result: dict[str, object] = {
        "size": list(Image.open(path).size),
        "bytes": path.stat().st_size,
        "edge_value_max": int(max(value_x.max(), value_y.max())),
        "edge_value_mean": float((value_x.mean() + value_y.mean()) * 0.5),
        "edge_slope_max": int(max(slope_x.max(), slope_y.max())),
        "edge_slope_mean": float((slope_x.mean() + slope_y.mean()) * 0.5),
    }
    if data.shape[2] == 4:
        alpha = data[:, :, 3]
        xyz = data[:, :, :3].astype(np.float32) / 127.5 - 1.0
        lengths = np.sqrt(np.sum(xyz * xyz, axis=2))
        result["roughness_alpha"] = {
            "min": int(alpha.min()),
            "max": int(alpha.max()),
            "mean": float(alpha.mean()),
        }
        result["normal_length"] = {
            "min": float(lengths.min()),
            "max": float(lengths.max()),
            "mean": float(lengths.mean()),
        }
    return result


def write_qa() -> None:
    QA_OUT.mkdir(parents=True, exist_ok=True)
    metal = Image.open(TERRAIN_OUT / "metal-albedo.webp").convert("RGB")
    preview = Image.new("RGB", (3072, 3072))
    for row in range(3):
        for col in range(3):
            preview.paste(metal, (col * 1024, row * 1024))
    preview.save(QA_OUT / "metal-3x3.png", "PNG", optimize=True)

    for name in ("ground", "soil", "pave", "grass", "metal"):
        albedo = Image.open(TERRAIN_OUT / f"{name}-albedo.webp").convert("RGB")
        tiled = Image.new("RGB", (1536, 1536))
        half = albedo.resize((512, 512), Image.Resampling.LANCZOS)
        for row in range(3):
            for col in range(3):
                tiled.paste(half, (col * 512, row * 512))
        tiled.save(QA_OUT / f"{name}-3x3.png", "PNG", optimize=True)

    terrain_files = sorted(TERRAIN_OUT.glob("*-albedo.webp")) + sorted(
        TERRAIN_OUT.glob("*-normal-rough.webp")
    )
    vfx_files = sorted(VFX_OUT.glob("mf-*-flipbook-v1.png"))
    report = {
        "terrain": {path.name: edge_metrics(path) for path in terrain_files},
        "vfx": {
            path.name: {
                "size": list(Image.open(path).size),
                "bytes": path.stat().st_size,
                "nonzero_alpha_fraction": float(
                    (np.asarray(Image.open(path).convert("RGBA"))[:, :, 3] > 0).mean()
                ),
            }
            for path in vfx_files
        },
        "runtime_bytes": sum(path.stat().st_size for path in terrain_files + vfx_files),
        "preview": str(QA_OUT / "metal-3x3.png"),
    }
    (QA_OUT / "asset-qa.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--blast", type=Path, required=True)
    parser.add_argument("--dust", type=Path, required=True)
    parser.add_argument("--wreck", type=Path, required=True)
    parser.add_argument("--ground", type=Path, required=True)
    parser.add_argument("--soil", type=Path, required=True)
    parser.add_argument("--pave", type=Path, required=True)
    parser.add_argument("--grass", type=Path, required=True)
    parser.add_argument("--metal", type=Path, required=True)
    args = parser.parse_args()

    bake_atlas(args.blast, VFX_OUT / "mf-blast-flipbook-v1.png")
    bake_atlas(
        args.dust,
        VFX_OUT / "mf-collapse-dust-flipbook-v1.png",
        neutral_fringe=True,
        bottom_anchor=True,
    )
    bake_atlas(
        args.wreck, VFX_OUT / "mf-wreck-fire-flipbook-v1.png", bottom_anchor=True
    )

    specs = (
        ("ground", args.ground, 0.82, 0.94, 2.0, 212),
        ("soil", args.soil, 0.78, 0.90, 2.7, 224),
        ("pave", args.pave, 0.72, 0.94, 1.8, 192),
        ("grass", args.grass, 0.72, 0.86, 2.2, 232),
    )
    for name, source, color, contrast, strength, roughness in specs:
        albedo = bake_albedo(source, TERRAIN_OUT / f"{name}-albedo.webp", color, contrast)
        bake_normal_rough(
            albedo, TERRAIN_OUT / f"{name}-normal-rough.webp", strength, roughness
        )

    metal_albedo = bake_metal_albedo(args.metal, TERRAIN_OUT / "metal-albedo.webp")
    bake_normal_rough(
        metal_albedo, TERRAIN_OUT / "metal-normal-rough.webp", 2.35, 166
    )
    write_qa()


if __name__ == "__main__":
    main()
