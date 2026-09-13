#!/usr/bin/env python3
"""Bake the MASSFRONT world-kit building material v3 atlas variant.

This is deliberately non-destructive.  The production material atlases remain
untouched; the script copies them and fills the building-v3 cells 108-111
with four command-camera architectural materials.  Runtime integration can
then switch the three atlas URLs atomically and remap WORLD_KIT surfaces.

The generated source is lighting-neutral but not guaranteed to wrap.  The bake
therefore performs an offset-and-feather periodicisation, then makes opposite
border texels byte-identical.  `--verify-only` validates dimensions, untouched
atlas cells and exact wrap edges without changing files.

Usage (from the repository root):

  python tools/bake-worldkit-building-material-v3.py
  python tools/bake-worldkit-building-material-v3.py --verify-only
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageEnhance, ImageFilter, ImageOps


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "source-media/building-material-v3/mf-worldkit-material-source-v3.png"
OUT_DIR = ROOT / "assets/textures"
PREVIEW_DIR = ROOT / "source-media/building-material-v3/previews"

ATLAS_N = 11
TILE = 256
ATLAS = ATLAS_N * TILE

BASES = {
    "albedo": OUT_DIR / "mat-albedo.png",
    "normal": OUT_DIR / "mat-normal.png",
    "orm": OUT_DIR / "mat-orm.png",
}
OUTPUTS = {
    "albedo": OUT_DIR / "mat-albedo-building-v3.png",
    "normal": OUT_DIR / "mat-normal-building-v3.png",
    "orm": OUT_DIR / "mat-orm-building-v3.png",
}

# These cells are allocated only by the building-v3 material registry.
MATERIALS = (
    {"id": 108, "key": "WORLDKIT_GUNMETAL", "quadrant": (0, 0), "metal": 0.90, "rough": 0.42},
    {"id": 109, "key": "WORLDKIT_COMPOSITE", "quadrant": (1, 0), "metal": 0.16, "rough": 0.56},
    {"id": 110, "key": "WORLDKIT_VENT", "quadrant": (0, 1), "metal": 0.82, "rough": 0.49},
    {"id": 111, "key": "WORLDKIT_TRIM", "quadrant": (1, 1), "metal": 0.94, "rough": 0.36},
)


def smooth01(x: np.ndarray) -> np.ndarray:
    x = np.clip(x, 0.0, 1.0)
    return x * x * (3.0 - 2.0 * x)


def seam_mask(length: int, radius: int) -> np.ndarray:
    """1 at the offset seam, easing to 0 outside the repair band."""
    x = np.arange(length, dtype=np.float32)
    d = np.abs(x - length * 0.5)
    return smooth01(1.0 - d / float(radius))


def exact_wrap(arr: np.ndarray) -> np.ndarray:
    """Make opposite borders byte-identical while preserving their mean."""
    out = arr.copy()
    lr = (out[:, 0].astype(np.uint16) + out[:, -1].astype(np.uint16) + 1) // 2
    out[:, 0] = lr.astype(np.uint8)
    out[:, -1] = out[:, 0]
    tb = (out[0].astype(np.uint16) + out[-1].astype(np.uint16) + 1) // 2
    out[0] = tb.astype(np.uint8)
    out[-1] = out[0]
    # The four corners have participated in two averages; make all four one.
    corner = np.mean(out[[0, 0, -1, -1], [0, -1, 0, -1]], axis=0).round().astype(np.uint8)
    out[0, 0] = out[0, -1] = out[-1, 0] = out[-1, -1] = corner
    return out


def periodicise(src: Image.Image, size: int = TILE) -> Image.Image:
    """Offset source borders to the centre and hide both seams deterministically."""
    work_size = max(512, size * 2)
    img = ImageOps.fit(src.convert("RGB"), (work_size, work_size), Image.Resampling.LANCZOS)
    a = np.asarray(img, dtype=np.float32)
    h, w = a.shape[:2]
    a = np.roll(a, (h // 2, w // 2), axis=(0, 1))

    # At the vertical seam, the half-width shifted view samples the contiguous
    # centre of the source.  A broad smooth band swaps it in only where needed.
    mx = seam_mask(w, max(48, w // 7))[None, :, None]
    alt_x = np.roll(a, w // 2, axis=1)
    a = a * (1.0 - mx) + alt_x * mx

    # Repeat on Y after X repair so the central crossing is continuous too.
    my = seam_mask(h, max(48, h // 7))[:, None, None]
    alt_y = np.roll(a, h // 2, axis=0)
    a = a * (1.0 - my) + alt_y * my

    # Downsample once; the two-pixel command-scale bevel remains crisp while
    # sub-pixel source grain is removed instead of becoming mobile shimmer.
    baked = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8), "RGB")
    baked = baked.resize((size, size), Image.Resampling.LANCZOS)
    return Image.fromarray(exact_wrap(np.asarray(baked)), "RGB")


def neutral_albedo(tile: Image.Image, material_index: int) -> Image.Image:
    """Remove baked colour cast and keep broad neutral material separation."""
    arr = np.asarray(tile.convert("RGB"), dtype=np.float32) / 255.0
    lum = arr[..., 0] * 0.2126 + arr[..., 1] * 0.7152 + arr[..., 2] * 0.0722
    # Compress photographic lighting but retain panel/bevel contrast.
    lo, hi = np.percentile(lum, (3.0, 97.0))
    lum = np.clip((lum - lo) / max(hi - lo, 1e-5), 0.0, 1.0)
    lum = 0.18 + 0.62 * np.power(lum, 0.92)
    # Preserve a four-value material hierarchy after vertex/team tinting.  The
    # first pass normalised every dark source into the same pale grey and would
    # have recreated the screenshot's "one muddy material everywhere" read.
    levels = (
        (0.13, 0.47),  # graphite roof armour
        (0.42, 0.45),  # pale composite wall
        (0.09, 0.42),  # recessed ventilation deck
        (0.15, 0.45),  # structural trim
    )
    base, span = levels[material_index]
    lum = base + lum * span
    tint = np.array([0.94, 0.985, 1.035], dtype=np.float32)
    rgb = np.clip(lum[..., None] * tint, 0.0, 1.0)
    return Image.fromarray(exact_wrap((rgb * 255.0 + 0.5).astype(np.uint8)), "RGB")


def derived_normal(albedo: Image.Image, strength: float) -> Image.Image:
    gray = np.asarray(albedo.convert("L").filter(ImageFilter.GaussianBlur(0.55)), dtype=np.float32) / 255.0
    # Central differences use roll, so the derivative itself is periodic.
    dx = (np.roll(gray, -1, axis=1) - np.roll(gray, 1, axis=1)) * strength
    dy = (np.roll(gray, -1, axis=0) - np.roll(gray, 1, axis=0)) * strength
    nx, ny = -dx, -dy
    nz = np.ones_like(nx)
    inv = 1.0 / np.sqrt(nx * nx + ny * ny + nz * nz)
    rgb = np.stack(((nx * inv * 0.5 + 0.5), (ny * inv * 0.5 + 0.5), (nz * inv * 0.5 + 0.5)), axis=-1)
    return Image.fromarray(exact_wrap(np.clip(rgb * 255.0 + 0.5, 0, 255).astype(np.uint8)), "RGB")


def derived_orm(albedo: Image.Image, roughness: float, metalness: float) -> Image.Image:
    lum = np.asarray(albedo.convert("L"), dtype=np.float32) / 255.0
    broad = np.asarray(albedo.convert("L").filter(ImageFilter.GaussianBlur(3.0)), dtype=np.float32) / 255.0
    cavity = np.clip((broad - lum) * 1.65, 0.0, 1.0)
    ao = np.clip(0.97 - cavity * 0.22, 0.76, 1.0)
    # The production ORM stores gloss, not roughness.
    gloss = np.clip(1.0 - roughness + (lum - 0.5) * 0.055, 0.18, 0.72)
    emis = np.zeros_like(lum)
    metal = np.full_like(lum, metalness)
    rgba = np.stack((ao, gloss, emis, metal), axis=-1)
    return Image.fromarray(exact_wrap(np.clip(rgba * 255.0 + 0.5, 0, 255).astype(np.uint8)), "RGBA")


def atlas_cell_box(material_id: int) -> tuple[int, int, int, int]:
    x = (material_id % ATLAS_N) * TILE
    y = (material_id // ATLAS_N) * TILE
    return x, y, x + TILE, y + TILE


def wrap_metrics(img: Image.Image) -> dict[str, int]:
    a = np.asarray(img)
    return {
        "leftRightMax": int(np.abs(a[:, 0].astype(np.int16) - a[:, -1].astype(np.int16)).max()),
        "topBottomMax": int(np.abs(a[0].astype(np.int16) - a[-1].astype(np.int16)).max()),
    }


def assert_atlas(path: Path) -> Image.Image:
    if not path.is_file():
        raise FileNotFoundError(path)
    img = Image.open(path)
    if img.size != (ATLAS, ATLAS):
        raise ValueError(f"{path}: expected {ATLAS}x{ATLAS}, got {img.size}")
    return img.convert("RGBA")


def build_tiles(source: Image.Image) -> dict[int, dict[str, Image.Image]]:
    q_w, q_h = source.width // 2, source.height // 2
    tiles: dict[int, dict[str, Image.Image]] = {}
    for index, spec in enumerate(MATERIALS):
        qx, qy = spec["quadrant"]
        crop = source.crop((qx * q_w, qy * q_h, (qx + 1) * q_w, (qy + 1) * q_h))
        periodic = periodicise(crop)
        albedo = neutral_albedo(periodic, index)
        normal = derived_normal(albedo, 4.4 if index == 2 else 3.5)
        orm = derived_orm(albedo, float(spec["rough"]), float(spec["metal"]))
        tiles[int(spec["id"])] = {"albedo": albedo.convert("RGBA"), "normal": normal.convert("RGBA"), "orm": orm}
    return tiles


def verify_outputs(tiles: dict[int, dict[str, Image.Image]] | None = None) -> dict:
    base = {k: assert_atlas(v) for k, v in BASES.items()}
    out = {k: assert_atlas(v) for k, v in OUTPUTS.items()}
    changed_ids = {int(s["id"]) for s in MATERIALS}
    report = {"atlas": ATLAS, "tile": TILE, "materials": [], "untouchedCellsExact": True}
    for mid in range(ATLAS_N * ATLAS_N):
        box = atlas_cell_box(mid)
        for kind in ("albedo", "normal", "orm"):
            a = np.asarray(base[kind].crop(box))
            b = np.asarray(out[kind].crop(box))
            same = bool(np.array_equal(a, b))
            if mid not in changed_ids and not same:
                report["untouchedCellsExact"] = False
                raise AssertionError(f"unexpected change in {kind} atlas cell {mid}")
            if mid in changed_ids and same:
                raise AssertionError(f"material {mid} did not change in {kind}")
    for spec in MATERIALS:
        mid = int(spec["id"])
        row = {"id": mid, "key": spec["key"], "wrap": {}}
        box = atlas_cell_box(mid)
        for kind in ("albedo", "normal", "orm"):
            metrics = wrap_metrics(out[kind].crop(box))
            if metrics["leftRightMax"] or metrics["topBottomMax"]:
                raise AssertionError(f"{kind} {mid} is not exact-wrap: {metrics}")
            row["wrap"][kind] = metrics
        report["materials"].append(row)
    return report


def make_previews(tiles: dict[int, dict[str, Image.Image]]) -> None:
    PREVIEW_DIR.mkdir(parents=True, exist_ok=True)
    contact = Image.new("RGB", (TILE * 2, TILE * 2), (16, 18, 22))
    repeat = Image.new("RGB", (TILE * 6, TILE * 6), (16, 18, 22))
    for i, spec in enumerate(MATERIALS):
        mid = int(spec["id"])
        tile = tiles[mid]["albedo"].convert("RGB")
        contact.paste(tile, ((i % 2) * TILE, (i // 2) * TILE))
        # Each material is shown 3x3 within its own quadrant.  Any edge defect
        # becomes a visible grid line; this catches what numeric border checks
        # miss when a large feature has poor rhythm across the wrap.
        ox, oy = (i % 2) * TILE * 3, (i // 2) * TILE * 3
        for yy in range(3):
            for xx in range(3):
                repeat.paste(tile, (ox + xx * TILE, oy + yy * TILE))
    contact.save(PREVIEW_DIR / "mf-worldkit-material-v3-contact.png", optimize=True)
    repeat.save(PREVIEW_DIR / "mf-worldkit-material-v3-wrap-3x3.png", optimize=True)
    # The game screenshot shows these roofs at roughly 55-95 physical pixels.
    # Present the four surfaces at 96/64/40px with nearest-neighbour-free
    # reduction so panel rhythm and mip stability are judged at the real use.
    command = Image.new("RGB", (TILE * 2, 120 * 3), (12, 15, 20))
    for row, size in enumerate((96, 64, 40)):
        x = 12
        for spec in MATERIALS:
            tile = tiles[int(spec["id"])]["albedo"].convert("RGB")
            thumb = tile.resize((size, size), Image.Resampling.LANCZOS)
            command.paste(thumb, (x, row * 120 + (120 - size) // 2))
            x += size + 22
    command.save(PREVIEW_DIR / "mf-worldkit-material-v3-command-scale.png", optimize=True)


def bake() -> dict:
    if not SOURCE.is_file():
        raise FileNotFoundError(SOURCE)
    source = Image.open(SOURCE).convert("RGB")
    if source.width < 1024 or source.height < 1024:
        raise ValueError(f"source must be at least 1024px, got {source.size}")
    tiles = build_tiles(source)
    atlases = {k: assert_atlas(v) for k, v in BASES.items()}
    for spec in MATERIALS:
        mid = int(spec["id"])
        box = atlas_cell_box(mid)
        xy = box[:2]
        for kind in ("albedo", "normal", "orm"):
            atlases[kind].paste(tiles[mid][kind], xy)
    # PNG is intentional: these are exact replacements for the existing atlas
    # upload contract, including byte-stable alpha/ORM channels.
    for kind, path in OUTPUTS.items():
        atlases[kind].save(path, optimize=True, compress_level=9)
    make_previews(tiles)
    report = verify_outputs(tiles)
    report["source"] = str(SOURCE.relative_to(ROOT)).replace("\\", "/")
    report["outputs"] = {k: str(v.relative_to(ROOT)).replace("\\", "/") for k, v in OUTPUTS.items()}
    report["packageBytes"] = {k: v.stat().st_size for k, v in OUTPUTS.items()}
    old_package = sum(v.stat().st_size for v in BASES.values())
    new_package = sum(v.stat().st_size for v in OUTPUTS.values())
    report["packageSwitch"] = {
        "oldBytes": old_package,
        "newBytes": new_package,
        "deltaBytes": new_package - old_package,
        "keepBothDeltaBytes": new_package,
    }
    report["gpuBytesNoMips"] = 3 * ATLAS * ATLAS * 4
    report["gpuBytesWithMips"] = report["gpuBytesNoMips"] * 4 // 3
    report["gpuSwitchDeltaBytes"] = 0
    report["integration"] = {
        "registry": {
            "WORLDKIT_GUNMETAL": 108,
            "WORLDKIT_COMPOSITE": 109,
            "WORLDKIT_VENT": 110,
            "WORLDKIT_TRIM": 111,
        },
        "atlasPaths": {
            "albedo": "./assets/textures/mat-albedo-building-v3.png",
            "normal": "./assets/textures/mat-normal-building-v3.png",
            "orm": "./assets/textures/mat-orm-building-v3.png",
        },
        "worldKitRule": (
            "In worldKitAssignMats: facade hull -> 109; upward roof -> 108; "
            "upward service/barracks/depot/factory roof -> 110; narrow trim -> 111; "
            "retain the existing cool/warm window classification."
        ),
        "worldKitUv": (
            "worldKitAssignMats applies 0.08 to non-window world-kit UVs; "
            "the exact-wrap cells retain the shader's 0.010 atlas inset."
        ),
        "packaging": (
            "Update pack-www and bundle-update material-atlas checks to the v3 paths; "
            "load only one atlas triplet so GPU memory does not increase."
        ),
    }
    manifest = ROOT / "source-media/building-material-v3/mf-worldkit-material-v3.json"
    manifest.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    return report


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--verify-only", action="store_true")
    args = parser.parse_args()
    report = verify_outputs() if args.verify_only else bake()
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
