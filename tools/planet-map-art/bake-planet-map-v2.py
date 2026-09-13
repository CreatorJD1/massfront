#!/usr/bin/env python3
"""Bake the bounded MASSFRONT planet-map material vertical slice.

The source plates are original image-generation outputs. This script performs
the production work that image generation cannot prove: lighting
neutralization, deterministic periodicization, tangent-normal/roughness
derivation, lossless encoding, opposite-edge verification, and 3x3 wrap
proofs. It intentionally emits only two high-value material pairs.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageChops, ImageDraw, ImageEnhance, ImageFilter, __version__ as PILLOW_VERSION


SIZE = 1024
SEAM_BAND = 144
ROOT = Path(__file__).resolve().parents[2]
SOURCE_DIR = Path(__file__).resolve().parent / "source"
PREVIEW_DIR = Path(__file__).resolve().parent / "previews"
OUTPUT_DIR = ROOT / "assets" / "textures" / "terrain" / "planet-map-v2"
CONCEPT_PATH = ROOT / "source-media" / "concepts" / "planet-map-v2" / "verdant-ashland-map-concept-v1.png"
CONCEPT_SHA256 = "4e628cca810a1c4146a9a629e7aac63e6851fc378fea1687d3445f233b2d5d1b"

PROFILES = {
    "verdant-highland": {
        "source": "verdant-highland-source-imagegen-v1.png",
        "semantic_slot": "grass",
        "normal_strength": 2.05,
        "roughness_base": 218,
        "roughness_range": (198, 238),
        "neutralize": 0.48,
        # Keep the authored grass lighting-neutral and green-led. The raw
        # concept-source plate leaned yellow (R > G), which became a broad
        # ochre shift when multiplied by the live macro map.
        "mean_rgb_target": (55.0, 61.0, 34.0),
        "broad_variation_gain": 0.28,
        "albedo_blur": 0.58,
        "broad_unsharp": (3.0, 20, 2),
        "prompt": (
            "Orthographic lighting-neutral verdant highland material source: short dense grass, "
            "small loam flecks, mineral grit, subtle broad mottling; no cracks, objects, roads, "
            "buildings, water, text, shadows, directional highlights, or unique landmarks."
        ),
        "image_generation_id": "432333ec-83b5-4cab-b1e2-9dda6dee1a28",
    },
    "ashland-basalt": {
        "source": "ashland-basalt-source-imagegen-v2.png",
        "semantic_slot": "soil",
        "normal_strength": 3.05,
        "roughness_base": 226,
        "roughness_range": (202, 244),
        "neutralize": 0.56,
        "mean_rgb_target": None,
        "broad_variation_gain": 0.24,
        "albedo_blur": 0.66,
        "broad_unsharp": None,
        "prompt": (
            "Orthographic lighting-neutral ashland basalt material source: compact volcanic ash, "
            "dense small basalt chips, sparse short material-specific hairline fractures and fine "
            "mineral grit; no large hero rocks, lava, roads, buildings, text, shadows, or crack network."
        ),
        "image_generation_id": "380d54cf-2121-4eb2-8bc0-ccbcb7eba9d5",
    },
}
REJECTED_SOURCES = ({
    "path": SOURCE_DIR / "ashland-basalt-source-imagegen-v1.png",
    "generation_id": "ada4dc33-9e28-46c6-8225-103fb9039601",
    "reason": "Rejected after 3x3 inspection: repeated hero stones and one dominant fracture path made the tile obvious.",
},)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def square_fit(image: Image.Image) -> Image.Image:
    image = image.convert("RGB")
    side = min(image.size)
    x0 = (image.width - side) // 2
    y0 = (image.height - side) // 2
    return image.crop((x0, y0, x0 + side, y0 + side)).resize((SIZE, SIZE), Image.Resampling.LANCZOS)


def lighting_neutralize(image: Image.Image, profile: dict) -> Image.Image:
    """Remove directional source gradients while retaining one broad scale."""
    source = np.asarray(image, dtype=np.float32) / 255.0
    field = np.asarray(image.filter(ImageFilter.GaussianBlur(72)), dtype=np.float32) / 255.0
    target = np.mean(field, axis=(0, 1), keepdims=True)
    correction = np.power(np.clip(target / np.maximum(field, 0.035), 0.72, 1.38), profile["neutralize"])
    neutral = np.clip(source * correction, 0.0, 1.0)
    if profile.get("mean_rgb_target"):
        target_rgb = np.asarray(profile["mean_rgb_target"], dtype=np.float32) / 255.0
        channel_mean = np.mean(neutral, axis=(0, 1))
        neutral = np.clip(neutral * (target_rgb / np.maximum(channel_mean, 0.01))[None, None, :], 0.0, 1.0)
    # A generated source often contains one attractive broad swirl or stone
    # arrangement. Repeating that landmark is more objectionable than a seam.
    # Let the 2048 macro map and the shader's decorrelated octave own the broad
    # scale; retain only a restrained amount of this plate-specific low band.
    neutral_u8 = Image.fromarray(np.uint8(neutral * 255.0 + 0.5), "RGB")
    broad = np.asarray(neutral_u8.filter(ImageFilter.GaussianBlur(42)), dtype=np.float32) / 255.0
    mean = np.mean(neutral, axis=(0, 1), keepdims=True)
    neutral = np.clip(mean + (neutral - broad) + (broad - mean) * profile["broad_variation_gain"], 0.0, 1.0)
    out = Image.fromarray(np.uint8(neutral * 255.0 + 0.5), "RGB")
    # Image-generation sources carry attractive but camera-unsafe single-pixel
    # grit. A sub-texel low-pass moves the retained read to a 2-5 texel band;
    # the normal sheet carries fine relief and the runtime's mip/aniso budget
    # handles distance. Do not sharpen albedo back into tactical shimmer.
    out = out.filter(ImageFilter.GaussianBlur(profile["albedo_blur"]))
    if profile["broad_unsharp"]:
        radius, percent, threshold = profile["broad_unsharp"]
        out = out.filter(ImageFilter.UnsharpMask(radius=radius, percent=percent, threshold=threshold))
    return out


def cosine_mask(width: int, height: int, vertical: bool) -> Image.Image:
    mask = Image.new("L", (width, height))
    data = np.zeros((height, width), dtype=np.uint8)
    if vertical:
        t = np.linspace(0.0, 1.0, width, dtype=np.float32)
        values = np.uint8(np.sin(t * math.pi) ** 2 * 255.0 + 0.5)
        data[:] = values[None, :]
    else:
        t = np.linspace(0.0, 1.0, height, dtype=np.float32)
        values = np.uint8(np.sin(t * math.pi) ** 2 * 255.0 + 0.5)
        data[:] = values[:, None]
    mask.putdata(data.ravel())
    return mask


def lock_edges(image: Image.Image) -> Image.Image:
    """Make opposite border texels byte-identical in every channel."""
    array = np.array(image)
    if array.ndim == 2:
        array = array[:, :, None]
    edge_x = ((array[:, 0].astype(np.uint16) + array[:, -1].astype(np.uint16) + 1) // 2).astype(np.uint8)
    array[:, 0] = edge_x
    array[:, -1] = edge_x
    edge_y = ((array[0].astype(np.uint16) + array[-1].astype(np.uint16) + 1) // 2).astype(np.uint8)
    array[0] = edge_y
    array[-1] = edge_y
    corner = np.mean(np.stack((array[0, 0], array[0, -1], array[-1, 0], array[-1, -1])), axis=0)
    corner = np.uint8(corner + 0.5)
    array[0, 0] = array[0, -1] = array[-1, 0] = array[-1, -1] = corner
    if image.mode == "L":
        return Image.fromarray(array[:, :, 0], "L")
    return Image.fromarray(array, image.mode)


def periodicize(image: Image.Image) -> Image.Image:
    """Move source edge discontinuities inward, then cover them with donors."""
    base = ImageChops.offset(image, SIZE // 2, SIZE // 2)
    center = SIZE // 2
    band = SEAM_BAND

    # The outer borders now meet across two originally adjacent source texels.
    # Repair the displaced vertical seam with a natural donor strip.
    donor_x = SIZE // 4 - band // 2
    donor = base.crop((donor_x, 0, donor_x + band, SIZE))
    base.paste(donor, (center - band // 2, 0), cosine_mask(band, SIZE, True))

    # Repair the horizontal seam after the vertical pass so the intersection
    # cannot reveal a four-way cross.
    donor_y = SIZE * 3 // 4 - band // 2
    donor = base.crop((0, donor_y, SIZE, donor_y + band))
    base.paste(donor, (0, center - band // 2), cosine_mask(SIZE, band, False))
    return lock_edges(base)


def derive_height(albedo: Image.Image, slug: str) -> Image.Image:
    lum = albedo.convert("L")
    a = np.asarray(lum, dtype=np.float32)
    fine = a - np.asarray(lum.filter(ImageFilter.GaussianBlur(1.35)), dtype=np.float32)
    middle = a - np.asarray(lum.filter(ImageFilter.GaussianBlur(7.0)), dtype=np.float32)
    broad = np.asarray(lum.filter(ImageFilter.GaussianBlur(22.0)), dtype=np.float32)
    broad -= float(np.mean(broad))
    if slug == "verdant-highland":
        h = 128.0 + fine * 1.35 + middle * 0.40 + broad * 0.08
    else:
        h = 128.0 + fine * 1.15 + middle * 0.68 + broad * 0.14
    return lock_edges(Image.fromarray(np.uint8(np.clip(h, 0, 255) + 0.5), "L"))


def derive_normal_rough(albedo: Image.Image, height: Image.Image, profile: dict) -> Image.Image:
    h = np.asarray(height, dtype=np.float32) / 255.0
    dx = np.roll(h, -1, axis=1) - np.roll(h, 1, axis=1)
    dy = np.roll(h, -1, axis=0) - np.roll(h, 1, axis=0)
    strength = float(profile["normal_strength"])
    nx, ny, nz = -dx * strength, -dy * strength, np.ones_like(h)
    inv = 1.0 / np.sqrt(nx * nx + ny * ny + nz * nz)
    rgb = np.stack((nx * inv, ny * inv, nz * inv), axis=2)
    rgb = np.uint8(np.clip((rgb * 0.5 + 0.5) * 255.0 + 0.5, 0, 255))

    lum = np.asarray(albedo.convert("L"), dtype=np.float32)
    local = lum - np.asarray(albedo.convert("L").filter(ImageFilter.GaussianBlur(6.0)), dtype=np.float32)
    lo, hi = profile["roughness_range"]
    rough = profile["roughness_base"] - local * (0.18 if profile["semantic_slot"] == "grass" else 0.24)
    rough = np.uint8(np.clip(rough, lo, hi) + 0.5)
    return lock_edges(Image.fromarray(np.dstack((rgb, rough)), "RGBA"))


def edge_metrics(image: Image.Image) -> dict:
    a = np.asarray(image.convert("RGBA"), dtype=np.int16)
    horizontal = np.abs(a[:, 0] - a[:, -1])
    vertical = np.abs(a[0] - a[-1])
    return {
        "horizontal": {"max_channel_delta": int(horizontal.max()), "mean_abs_delta": float(horizontal.mean())},
        "vertical": {"max_channel_delta": int(vertical.max()), "mean_abs_delta": float(vertical.mean())},
    }


def image_metrics(image: Image.Image) -> dict:
    rgb = np.asarray(image.convert("RGB"), dtype=np.float32)
    lum = rgb @ np.array((0.2126, 0.7152, 0.0722), dtype=np.float32)
    lap = np.abs(4.0 * lum - np.roll(lum, 1, 0) - np.roll(lum, -1, 0) - np.roll(lum, 1, 1) - np.roll(lum, -1, 1))
    gx = np.roll(lum, -1, 1) - np.roll(lum, 1, 1)
    gy = np.roll(lum, -1, 0) - np.roll(lum, 1, 0)
    return {
        "luminance_mean": round(float(lum.mean()), 4),
        "luminance_stddev": round(float(lum.std()), 4),
        "laplacian_energy": round(float(lap.mean()), 4),
        "gradient_energy": round(float(np.hypot(gx, gy).mean()), 4),
    }


def save_lossless_webp(image: Image.Image, path: Path) -> None:
    image.save(path, "WEBP", lossless=True, method=6, exact=True)


def tile_preview(image: Image.Image, path: Path) -> None:
    tile = image.convert("RGB")
    proof = Image.new("RGB", (SIZE * 3, SIZE * 3))
    for y in range(3):
        for x in range(3):
            proof.paste(tile, (x * SIZE, y * SIZE))
    proof.resize((1536, 1536), Image.Resampling.LANCZOS).save(path, "PNG", optimize=True)


def normal_preview(normal_rough: Image.Image, path: Path) -> None:
    nr = np.asarray(normal_rough, dtype=np.float32)
    n = nr[:, :, :3] / 255.0 * 2.0 - 1.0
    light = np.array((-0.37, -0.42, 0.827), dtype=np.float32)
    light /= np.linalg.norm(light)
    diffuse = np.clip(np.sum(n * light[None, None, :], axis=2), 0.0, 1.0)
    rough = nr[:, :, 3] / 255.0
    shaded = np.clip(34.0 + diffuse * (205.0 - rough * 35.0), 0, 255)
    Image.fromarray(np.uint8(shaded + 0.5), "L").save(path, "PNG", optimize=True)


def contact_sheet(entries: list[dict], path: Path) -> None:
    cell = 512
    sheet = Image.new("RGB", (cell * 2, cell * len(entries)), (8, 12, 16))
    draw = ImageDraw.Draw(sheet)
    for row, entry in enumerate(entries):
        albedo = Image.open(entry["albedo_path"]).convert("RGB").resize((cell, cell), Image.Resampling.LANCZOS)
        lit = Image.open(entry["normal_preview"]).convert("RGB").resize((cell, cell), Image.Resampling.LANCZOS)
        sheet.paste(albedo, (0, row * cell))
        sheet.paste(lit, (cell, row * cell))
        draw.rectangle((0, row * cell, cell, row * cell + 34), fill=(5, 9, 13))
        draw.rectangle((cell, row * cell, cell * 2, row * cell + 34), fill=(5, 9, 13))
        draw.text((12, row * cell + 10), f"{entry['slug']} / ALBEDO", fill=(220, 235, 240))
        draw.text((cell + 12, row * cell + 10), f"{entry['slug']} / NORMAL LIGHT TEST", fill=(220, 235, 240))
    sheet.save(path, "PNG", optimize=True)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--verify-only", action="store_true", help="verify existing outputs without rebaking")
    args = parser.parse_args()
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    PREVIEW_DIR.mkdir(parents=True, exist_ok=True)

    report = {
        "schema": "massfront-planet-map-art-v2",
        "toolchain": {"pillow": PILLOW_VERSION, "numpy": np.__version__},
        "art_direction_concept": {
            "path": str(CONCEPT_PATH.relative_to(ROOT)),
            "sha256": sha256(CONCEPT_PATH),
            "expected_sha256": CONCEPT_SHA256,
            "pixels_used_in_production": False,
            "direction": "verdant grass/loam/rock readability; dark ashland basalt; coherent engineered hardscape belongs to separate road/paving slots",
        },
        "dimensions": [SIZE, SIZE],
        "channel_contract": {"albedo": "sRGB RGB, lighting-neutral", "normal_rough": "tangent normal RGB, roughness A"},
        "materials": {},
    }
    if report["art_direction_concept"]["sha256"] != CONCEPT_SHA256:
        raise RuntimeError("planet-map art-direction concept changed; re-review before baking production sheets")
    contact_entries = []
    for slug, profile in PROFILES.items():
        source_path = SOURCE_DIR / profile["source"]
        albedo_path = OUTPUT_DIR / f"{slug}-albedo-v2.webp"
        normal_path = OUTPUT_DIR / f"{slug}-normal-rough-v2.webp"
        wrap_path = PREVIEW_DIR / f"{slug}-albedo-wrap-3x3-v2.png"
        normal_proof_path = PREVIEW_DIR / f"{slug}-normal-light-v2.png"
        if not args.verify_only:
            source = square_fit(Image.open(source_path))
            albedo = periodicize(lighting_neutralize(source, profile))
            height = derive_height(albedo, slug)
            normal_rough = derive_normal_rough(albedo, height, profile)
            save_lossless_webp(albedo, albedo_path)
            save_lossless_webp(normal_rough, normal_path)
            tile_preview(Image.open(albedo_path), wrap_path)
            normal_preview(Image.open(normal_path).convert("RGBA"), normal_proof_path)

        decoded_albedo = Image.open(albedo_path).convert("RGB")
        decoded_normal = Image.open(normal_path).convert("RGBA")
        if decoded_albedo.size != (SIZE, SIZE) or decoded_normal.size != (SIZE, SIZE):
            raise RuntimeError(f"{slug}: production maps must be {SIZE}x{SIZE}")
        borders = {"albedo": edge_metrics(decoded_albedo), "normal_rough": edge_metrics(decoded_normal)}
        if any(axis["max_channel_delta"] for surface in borders.values() for axis in surface.values()):
            raise RuntimeError(f"{slug}: decoded opposite borders are not byte-identical: {borders}")

        report["materials"][slug] = {
            "semantic_slot": profile["semantic_slot"],
            "source": {"path": str(source_path.relative_to(ROOT)), "sha256": sha256(source_path), "bytes": source_path.stat().st_size},
            "generation": {
                "tool": "OpenAI built-in image generation",
                "generation_id": profile["image_generation_id"],
                "prompt_summary": profile["prompt"],
                "source_pixels_directly_shipped": False,
            },
            "outputs": {
                str(albedo_path.relative_to(ROOT)): {"sha256": sha256(albedo_path), "bytes": albedo_path.stat().st_size},
                str(normal_path.relative_to(ROOT)): {"sha256": sha256(normal_path), "bytes": normal_path.stat().st_size},
            },
            "decoded_edge_metrics": borders,
            "albedo_metrics": image_metrics(decoded_albedo),
            "roughness": {
                "min": int(np.asarray(decoded_normal)[:, :, 3].min()),
                "max": int(np.asarray(decoded_normal)[:, :, 3].max()),
                "mean": round(float(np.asarray(decoded_normal)[:, :, 3].mean()), 4),
            },
            "preview": str(wrap_path.relative_to(ROOT)),
        }
        contact_entries.append({"slug": slug, "albedo_path": albedo_path, "normal_preview": normal_proof_path})

    contact_path = PREVIEW_DIR / "planet-map-v2-material-proof.png"
    contact_sheet(contact_entries, contact_path)
    report["disk_bytes"] = sum(item["bytes"] for row in report["materials"].values() for item in row["outputs"].values())
    report["active_gpu_bytes_per_pair"] = SIZE * SIZE * 4 * 2
    report["contact_sheet"] = str(contact_path.relative_to(ROOT))
    report_path = OUTPUT_DIR / "planet-map-v2-report.json"
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    provenance = {
        "schema": "massfront-art-provenance-v1",
        "art_direction_concept": report["art_direction_concept"],
        "production_process": (
            "Original generated source plates were lighting-neutralized, periodicized, "
            "edge-locked, and converted into matched tangent-normal/roughness sheets by "
            "tools/planet-map-art/bake-planet-map-v2.py. Concept pixels were not used."
        ),
        "materials": {
            slug: {
                "semantic_slot": row["semantic_slot"],
                "source": row["source"],
                "generation": row["generation"],
                "outputs": row["outputs"],
            }
            for slug, row in report["materials"].items()
        },
        "rejected_sources": [
            {
                "path": str(item["path"].relative_to(ROOT)),
                "sha256": sha256(item["path"]),
                "generation_id": item["generation_id"],
                "reason": item["reason"],
            }
            for item in REJECTED_SOURCES
        ],
    }
    (OUTPUT_DIR / "provenance.json").write_text(json.dumps(provenance, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"report": str(report_path), "disk_bytes": report["disk_bytes"], "active_gpu_bytes_per_pair": report["active_gpu_bytes_per_pair"]}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
