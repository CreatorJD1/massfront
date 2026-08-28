#!/usr/bin/env python3
"""Bake and verify the optional MASSFRONT location-surface source pack.

This tool turns the four source plates into albedo, tangent normal/roughness,
packed masks, and decoded 3x3 wrap proofs. With ``--promote`` it copies only
the three biome albedo+normal pairs used by the terrain loader into packaged
assets. Masks and the shoreline study stay source-side until a shader pass
deliberately budgets their samplers.

Only Pillow is required. The same inputs and Pillow build produce identical
pixels; manifest hashes make toolchain drift visible.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path
import shutil

from PIL import Image, ImageChops, ImageDraw, ImageEnhance, ImageFilter, __version__ as PILLOW_VERSION


SIZE = 512
SEAM_BAND = 96
WEBP_QUALITY = 86
LOSSY_WRAP_MEAN_LIMIT = 4.0
ALBEDO_WRAP_MAX_LIMIT = 40
NORMAL_WRAP_MAX_LIMIT = 48
RUNTIME_BYTES_LIMIT = 2 * 1024 * 1024

PROFILES = {
    "arctic-windpack": {
        "source": "arctic-windpack-source-v1.png",
        "normal_strength": 2.2,
        "roughness": 198,
        "mask_g": "exposed_blue_ice",
        "mask_b": "snow_cover",
    },
    "ashland-basalt": {
        "source": "ashland-basalt-source-v1.png",
        "normal_strength": 2.8,
        "roughness": 224,
        "mask_g": "ember_feature",
        "mask_b": "ash_cover",
    },
    "vespera-crust": {
        "source": "vespera-crust-source-v1.png",
        "normal_strength": 2.5,
        "roughness": 190,
        "mask_g": "bioluminescent_feature",
        "mask_b": "organic_cover",
    },
    "shoreline-wet": {
        "source": "shoreline-wet-source-v1.png",
        "normal_strength": 1.9,
        "roughness": 126,
        "mask_g": "wetness",
        "mask_b": "foam_residue",
    },
}

# Exactly these six files are runtime inputs. Keeping this explicit prevents a
# future bake from accidentally packaging masks, previews, or all shoreline
# studies merely because they share the runtime staging directory.
PROMOTED = {
    "arctic-windpack": ("albedo", "normal-rough"),
    "ashland-basalt": ("albedo", "normal-rough"),
    "vespera-crust": ("albedo", "normal-rough"),
}


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def square_fit(image: Image.Image, size: int) -> Image.Image:
    image = image.convert("RGB")
    side = min(image.size)
    left = (image.width - side) // 2
    top = (image.height - side) // 2
    crop = image.crop((left, top, left + side, top + side))
    return crop.resize((size, size), Image.Resampling.LANCZOS)


def cosine_strip_mask(width: int, height: int, vertical: bool) -> Image.Image:
    mask = Image.new("L", (width, height))
    px = mask.load()
    if vertical:
        values = [round(255 * math.sin(math.pi * x / (width - 1)) ** 2) for x in range(width)]
        for x, value in enumerate(values):
            for y in range(height):
                px[x, y] = value
    else:
        values = [round(255 * math.sin(math.pi * y / (height - 1)) ** 2) for y in range(height)]
        for y, value in enumerate(values):
            for x in range(width):
                px[x, y] = value
    return mask


def lock_edges(image: Image.Image) -> Image.Image:
    """Make opposite border texels byte-identical, including all four corners."""
    out = image.copy()
    px = out.load()
    w, h = out.size
    channels = len(out.getbands())

    def avg(a, b):
        if channels == 1:
            return (a + b + 1) // 2
        return tuple((a[i] + b[i] + 1) // 2 for i in range(channels))

    for y in range(h):
        value = avg(px[0, y], px[w - 1, y])
        px[0, y] = px[w - 1, y] = value
    for x in range(w):
        value = avg(px[x, 0], px[x, h - 1])
        px[x, 0] = px[x, h - 1] = value
    corners = [px[0, 0], px[w - 1, 0], px[0, h - 1], px[w - 1, h - 1]]
    if channels == 1:
        value = (sum(corners) + 2) // 4
    else:
        value = tuple((sum(c[i] for c in corners) + 2) // 4 for i in range(channels))
    px[0, 0] = px[w - 1, 0] = px[0, h - 1] = px[w - 1, h - 1] = value
    return out


def periodicize(source: Image.Image) -> Image.Image:
    """Move source discontinuities inward, then cover them with donor texture."""
    base = ImageChops.offset(source, source.width // 2, source.height // 2)
    band = SEAM_BAND
    center = source.width // 2
    donor_x = source.width // 4 - band // 2
    vertical = source.crop((donor_x, 0, donor_x + band, source.height))
    base.paste(vertical, (center - band // 2, 0), cosine_strip_mask(band, source.height, True))

    donor_y = source.height // 4 - band // 2
    horizontal = source.crop((0, donor_y, source.width, donor_y + band))
    base.paste(horizontal, (0, center - band // 2), cosine_strip_mask(source.width, band, False))
    return lock_edges(base)


def height_map(albedo: Image.Image) -> Image.Image:
    gray = albedo.convert("L").filter(ImageFilter.GaussianBlur(1.15))
    gray = ImageEnhance.Contrast(gray).enhance(1.32)
    return lock_edges(gray)


def derive_normal_rough(height: Image.Image, albedo: Image.Image, strength: float, base_rough: int) -> Image.Image:
    w, h = height.size
    hp = height.load()
    out = Image.new("RGBA", (w, h))
    op = out.load()
    for y in range(h):
        ym = (y - 1) % h
        yp = (y + 1) % h
        for x in range(w):
            xm = (x - 1) % w
            xp = (x + 1) % w
            dx = (hp[xp, y] - hp[xm, y]) * strength / 255.0
            dy = (hp[x, yp] - hp[x, ym]) * strength / 255.0
            nz = 1.0 / math.sqrt(dx * dx + dy * dy + 1.0)
            nx = -dx * nz
            ny = -dy * nz
            # A constant roughness alpha is cheaper than a noisy alpha plane in
            # WebP. Biome variation belongs in the splat weight, not in another
            # full-resolution random field.
            op[x, y] = (round((nx * 0.5 + 0.5) * 255), round((ny * 0.5 + 0.5) * 255), round(nz * 255), base_rough)
    return lock_edges(out)


def derive_masks(slug: str, height: Image.Image, albedo: Image.Image) -> Image.Image:
    w, h = height.size
    hp = height.load()
    rgb = albedo.load()
    out = Image.new("RGB", (w, h))
    op = out.load()
    for y in range(h):
        for x in range(w):
            r, g, b = rgb[x, y]
            lum = hp[x, y]
            sat = max(r, g, b) - min(r, g, b)
            if slug == "arctic-windpack":
                feature = max(0, min(255, (b - r) * 5 + (214 - lum) * 2))
                secondary = max(0, min(255, (lum - 156) * 3 - sat))
            elif slug == "ashland-basalt":
                feature = max(0, min(255, (r - g) * 8 + (r - b) * 2 - 70))
                secondary = max(0, min(255, (118 - lum) * 2 + 42 - sat))
            elif slug == "vespera-crust":
                feature = max(0, min(255, (r + b - g * 2) * 5 - 95))
                secondary = max(0, min(255, (r - g) * 4 + sat - 36))
            else:
                feature = max(0, min(255, (126 - lum) * 3 + (b - r) * 2))
                secondary = max(0, min(255, (lum - 132) * 4 - sat * 2))
            op[x, y] = (lum, int(feature), int(secondary))
    return lock_edges(out)


def wrap_metrics(image: Image.Image) -> dict:
    image = image.convert("RGBA")
    w, h = image.size
    left = image.crop((0, 0, 1, h))
    right = image.crop((w - 1, 0, w, h))
    top = image.crop((0, 0, w, 1))
    bottom = image.crop((0, h - 1, w, h))

    def stats(a: Image.Image, b: Image.Image) -> dict:
        extrema = ImageChops.difference(a, b).getextrema()
        count = a.width * a.height * 4
        total = sum(sum(channel) for channel in ImageChops.difference(a, b).get_flattened_data())
        return {
            "max_channel_delta": max(pair[1] for pair in extrema),
            "mean_abs_channel_delta": round(total / count, 6),
        }

    return {"horizontal_wrap": stats(left, right), "vertical_wrap": stats(top, bottom)}


def save_webp(image: Image.Image, path: Path) -> None:
    image.save(path, "WEBP", quality=WEBP_QUALITY, method=6, exact=True)


def save_lossless_webp(image: Image.Image, path: Path) -> None:
    image.save(path, "WEBP", lossless=True, method=6, exact=True)


def make_wrap_preview(image: Image.Image, path: Path) -> None:
    tile = image.convert("RGB")
    preview = Image.new("RGB", (tile.width * 3, tile.height * 3))
    for y in range(3):
        for x in range(3):
            preview.paste(tile, (x * tile.width, y * tile.height))
    preview.resize((1536, 1536), Image.Resampling.LANCZOS).save(path, "PNG", optimize=True)


def make_catalog(entries: list[tuple[str, Image.Image]], path: Path) -> None:
    cell = 512
    catalog = Image.new("RGB", (cell * 2, cell * 2), (12, 16, 22))
    draw = ImageDraw.Draw(catalog)
    for index, (slug, image) in enumerate(entries):
        x = (index % 2) * cell
        y = (index // 2) * cell
        thumb = image.convert("RGB").resize((cell, cell), Image.Resampling.LANCZOS)
        catalog.paste(thumb, (x, y))
        draw.rectangle((x, y + cell - 34, x + cell, y + cell), fill=(7, 12, 18))
        draw.text((x + 12, y + cell - 26), slug.upper(), fill=(220, 235, 245))
    catalog.save(path, "PNG", optimize=True)


def validate_wrap(slug: str, pre_encode: dict, decoded: dict) -> None:
    for map_name, metrics in pre_encode.items():
        for axis in ("horizontal_wrap", "vertical_wrap"):
            if metrics[axis]["max_channel_delta"] != 0:
                raise RuntimeError(f"{slug}/{map_name}: pre-encode {axis} is not exact")
    for axis in ("horizontal_wrap", "vertical_wrap"):
        if decoded["masks"][axis]["max_channel_delta"] != 0:
            raise RuntimeError(f"{slug}/masks: lossless decoded {axis} is not exact")
        albedo = decoded["albedo"][axis]
        normal = decoded["normal_rough"][axis]
        if albedo["mean_abs_channel_delta"] > LOSSY_WRAP_MEAN_LIMIT or albedo["max_channel_delta"] > ALBEDO_WRAP_MAX_LIMIT:
            raise RuntimeError(f"{slug}/albedo: decoded {axis} exceeds wrap budget: {albedo}")
        if normal["mean_abs_channel_delta"] > LOSSY_WRAP_MEAN_LIMIT or normal["max_channel_delta"] > NORMAL_WRAP_MAX_LIMIT:
            raise RuntimeError(f"{slug}/normal: decoded {axis} exceeds wrap budget: {normal}")


def promoted_paths(runtime: Path, destination: Path) -> list[tuple[Path, Path]]:
    files = []
    for slug, kinds in PROMOTED.items():
        for kind in kinds:
            name = f"{slug}-{kind}-v1.webp"
            files.append((runtime / name, destination / name))
    return files


def verify_loader_contract(repo: Path, destination: Path) -> dict:
    source = (repo / "src" / "engine" / "gl.js").read_text(encoding="utf-8")
    expected = [f"./assets/terrain/locations/{dst.name}"
                for _, dst in promoted_paths(repo / "source-media" / "location-surfaces-v1" / "runtime", destination)]
    missing = [path for path in expected if source.count(path) != 1]
    if missing:
        raise RuntimeError("terrain loader must contain each promoted literal exactly once: " + ", ".join(missing))
    location_lines = [line for line in source.splitlines() if "./assets/terrain/locations/" in line]
    if any("shoreline-wet" in line or "-masks-" in line for line in location_lines):
        raise RuntimeError("shoreline or packed masks were wired without a sampler budget")
    markers = (
        "mkPair('soil','soilN'",
        "const incremental=priorReady, paveChanged=priorReady&&terrTexSlotLoaded!==slot;",
        "terrSoilTex=pending.soil; terrSoilNrm=pending.soilN;",
        "theme==='arctic'?'arctic':theme==='ashland'?'ashland':'base'",
    )
    absent = [marker for marker in markers if marker not in source]
    if absent:
        raise RuntimeError("terrain loader pair-swap contract is incomplete: " + ", ".join(absent))
    return {"slot": "soil", "literal_paths": len(expected), "pair_swap": True,
            "new_samplers": 0, "shoreline_shader_path": "existing height wetness"}


def promote_and_verify(runtime: Path, destination: Path, write: bool, repo: Path) -> dict:
    pairs = promoted_paths(runtime, destination)
    expected_names = {dst.name for _, dst in pairs}
    if write:
        destination.mkdir(parents=True, exist_ok=True)
        # Refuse stale runtime maps in the owned destination: leaving an old
        # biome resident in the package would defeat the explicit six-file
        # contract even if the loader never sampled it.
        for path in destination.iterdir():
            if path.is_file() and path.name not in expected_names:
                raise RuntimeError(f"unexpected promoted location asset: {path}")
        for src, dst in pairs:
            if not dst.exists() or sha256(src) != sha256(dst):
                shutil.copyfile(src, dst)
    missing = [str(dst) for _, dst in pairs if not dst.is_file()]
    if missing:
        raise RuntimeError("promoted location assets are missing: " + ", ".join(missing))
    mismatched = [str(dst) for src, dst in pairs if sha256(src) != sha256(dst)]
    if mismatched:
        raise RuntimeError("promoted location assets differ from deterministic bake: " + ", ".join(mismatched))
    extras = []
    if destination.is_dir():
        extras = [str(path) for path in destination.iterdir()
                  if path.is_file() and path.name not in expected_names]
    if extras:
        raise RuntimeError("unexpected promoted location assets: " + ", ".join(extras))
    return {
        "destination": str(destination),
        "files": len(pairs),
        "bytes": sum(dst.stat().st_size for _, dst in pairs),
        "sha256": {dst.name: sha256(dst) for _, dst in pairs},
        "loader": verify_loader_contract(repo, destination),
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--pack-root", type=Path, default=None)
    parser.add_argument("--promote", action="store_true",
                        help="copy the three biome albedo+normal pairs into packaged assets")
    parser.add_argument("--verify-promoted", action="store_true",
                        help="verify packaged pairs byte-for-byte without copying")
    parser.add_argument("--promote-root", type=Path, default=None,
                        help="override assets/terrain/locations for promotion QA")
    args = parser.parse_args()
    repo = Path(__file__).resolve().parents[1]
    pack = args.pack_root or repo / "source-media" / "location-surfaces-v1"
    sources = pack / "sources"
    runtime = pack / "runtime"
    previews = pack / "previews"
    runtime.mkdir(parents=True, exist_ok=True)
    previews.mkdir(parents=True, exist_ok=True)

    report = {
        "schema": "massfront-location-surfaces-v1",
        "bake": {"tool_version": 1, "pillow": PILLOW_VERSION, "size": SIZE, "seam_band": SEAM_BAND, "webp_quality": WEBP_QUALITY},
        "mask_channels": {"r": "height", "g": "profile feature", "b": "profile secondary"},
        "validation_limits": {
            "lossy_wrap_mean": LOSSY_WRAP_MEAN_LIMIT,
            "albedo_wrap_max": ALBEDO_WRAP_MAX_LIMIT,
            "normal_wrap_max": NORMAL_WRAP_MAX_LIMIT,
            "runtime_bytes": RUNTIME_BYTES_LIMIT,
        },
        "surfaces": {},
    }
    catalog = []
    for slug, profile in PROFILES.items():
        source_path = sources / profile["source"]
        source = square_fit(Image.open(source_path), SIZE)
        albedo = periodicize(source)
        height = height_map(albedo)
        normal_rough = derive_normal_rough(height, albedo, profile["normal_strength"], profile["roughness"])
        masks = derive_masks(slug, height, albedo)

        albedo_path = runtime / f"{slug}-albedo-v1.webp"
        normal_path = runtime / f"{slug}-normal-rough-v1.webp"
        masks_path = runtime / f"{slug}-masks-v1.webp"
        save_webp(albedo, albedo_path)
        save_webp(normal_rough, normal_path)
        save_lossless_webp(masks, masks_path)

        decoded_albedo = Image.open(albedo_path).convert("RGB")
        decoded_normal = Image.open(normal_path).convert("RGBA")
        decoded_masks = Image.open(masks_path).convert("RGBA")
        for label, image in (("albedo", decoded_albedo), ("normal", decoded_normal), ("masks", decoded_masks)):
            if image.size != (SIZE, SIZE):
                raise RuntimeError(f"{slug}/{label}: expected {SIZE}x{SIZE}, got {image.size}")
        preview_path = previews / f"{slug}-wrap-3x3-v1.png"
        make_wrap_preview(decoded_albedo, preview_path)
        catalog.append((slug, decoded_albedo))

        pre_encode = {
            "albedo": wrap_metrics(albedo),
            "normal_rough": wrap_metrics(normal_rough),
            "masks": wrap_metrics(masks),
        }
        decoded = {
            "albedo": wrap_metrics(decoded_albedo),
            "normal_rough": wrap_metrics(decoded_normal),
            "masks": wrap_metrics(decoded_masks),
        }
        validate_wrap(slug, pre_encode, decoded)

        files = [albedo_path, normal_path, masks_path, preview_path]
        report["surfaces"][slug] = {
            "source": {"path": str(source_path.relative_to(pack)), "sha256": sha256(source_path), "bytes": source_path.stat().st_size},
            "feature_channels": {"g": profile["mask_g"], "b": profile["mask_b"]},
            "outputs": {str(p.relative_to(pack)): {"sha256": sha256(p), "bytes": p.stat().st_size} for p in files},
            "pre_encode_wrap": pre_encode,
            "decoded_wrap": decoded,
        }

    catalog_path = previews / "location-surfaces-v1-catalog.png"
    make_catalog(catalog, catalog_path)
    report["catalog"] = {"path": str(catalog_path.relative_to(pack)), "sha256": sha256(catalog_path), "bytes": catalog_path.stat().st_size}
    report["runtime_total_bytes"] = sum(p.stat().st_size for p in runtime.iterdir() if p.is_file())
    report["preview_total_bytes"] = sum(p.stat().st_size for p in previews.iterdir() if p.is_file())
    if report["runtime_total_bytes"] > RUNTIME_BYTES_LIMIT:
        raise RuntimeError(f"runtime pack exceeds {RUNTIME_BYTES_LIMIT} bytes: {report['runtime_total_bytes']}")
    report_path = pack / "bake-report.json"
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    result = {"report": str(report_path), "runtime_total_bytes": report["runtime_total_bytes"]}
    if args.promote or args.verify_promoted:
        destination = args.promote_root or repo / "assets" / "terrain" / "locations"
        result["promoted"] = promote_and_verify(runtime, destination, args.promote, repo)
    print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
