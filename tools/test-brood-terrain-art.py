#!/usr/bin/env python3
"""Build and verify the original 1024px Brood terrain PBR pair.

The optional --build source is a generated lighting-neutral albedo master.
Runtime art is periodicised, edge-locked, and paired with tangent normal RGB /
roughness A. Running without --build verifies the committed runtime pair.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path

from PIL import Image, ImageChops, ImageEnhance, ImageFilter, ImageStat


SIZE = 1024
SEAM_BAND = 176
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "assets" / "terrain" / "locations"
ALBEDO = OUT / "brood-infested-soil-albedo-v1.webp"
NORMAL = OUT / "brood-infested-soil-normal-rough-v1.webp"
PROVENANCE = OUT / "brood-infested-soil-provenance-v1.json"


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def lock_edges(image: Image.Image) -> Image.Image:
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


def strip_mask(width: int, height: int, vertical: bool) -> Image.Image:
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


def periodicise(source: Image.Image) -> Image.Image:
    source = source.convert("RGB")
    side = min(source.size)
    left = (source.width - side) // 2
    top = (source.height - side) // 2
    source = source.crop((left, top, left + side, top + side)).resize((SIZE, SIZE), Image.Resampling.LANCZOS)
    base = ImageChops.offset(source, SIZE // 2, SIZE // 2)
    center = SIZE // 2
    donor_x = SIZE // 4 - SEAM_BAND // 2
    vertical = source.crop((donor_x, 0, donor_x + SEAM_BAND, SIZE))
    base.paste(vertical, (center - SEAM_BAND // 2, 0), strip_mask(SEAM_BAND, SIZE, True))
    donor_y = SIZE // 4 - SEAM_BAND // 2
    horizontal = source.crop((0, donor_y, SIZE, donor_y + SEAM_BAND))
    base.paste(horizontal, (0, center - SEAM_BAND // 2), strip_mask(SIZE, SEAM_BAND, False))
    return lock_edges(base)


def normal_rough(albedo: Image.Image) -> Image.Image:
    height = ImageEnhance.Contrast(albedo.convert("L").filter(ImageFilter.GaussianBlur(1.25))).enhance(1.24)
    height = lock_edges(height)
    hp = height.load()
    rgb = albedo.load()
    rough = Image.new("L", (SIZE, SIZE))
    rp = rough.load()
    for y in range(SIZE):
        for x in range(SIZE):
            r, g, b = rgb[x, y]
            lum = (r * 54 + g * 183 + b * 19) / 256
            sat = max(r, g, b) - min(r, g, b)
            bone = max(0.0, min(1.0, (lum - 112) / 78)) * max(0.0, 1.0 - sat / 105)
            tissue = max(0.0, min(1.0, (r - g - 4) / 52)) * max(0.0, min(1.0, (132 - lum) / 72))
            rp[x, y] = round(max(72, min(232, 184 + bone * 42 - tissue * 70)))
    rough = lock_edges(rough.filter(ImageFilter.GaussianBlur(.72)))
    rp = rough.load()
    out = Image.new("RGBA", (SIZE, SIZE))
    op = out.load()
    strength = 2.45
    for y in range(SIZE):
        ym, yp = (y - 1) % SIZE, (y + 1) % SIZE
        for x in range(SIZE):
            xm, xp = (x - 1) % SIZE, (x + 1) % SIZE
            dx = (hp[xp, y] - hp[xm, y]) * strength / 255.0
            dy = (hp[x, yp] - hp[x, ym]) * strength / 255.0
            nz = 1.0 / math.sqrt(dx * dx + dy * dy + 1.0)
            op[x, y] = (
                round((-dx * nz * .5 + .5) * 255),
                round((-dy * nz * .5 + .5) * 255),
                round(nz * 255),
                rp[x, y],
            )
    return lock_edges(out)


def edge_metrics(image: Image.Image) -> dict:
    image = image.convert("RGBA")
    w, h = image.size

    def delta(a: Image.Image, b: Image.Image) -> dict:
        d = ImageChops.difference(a, b)
        extrema = d.getextrema()
        mean = sum(ImageStat.Stat(d).mean) / 4
        return {"max": max(pair[1] for pair in extrema), "mean": round(mean, 5)}

    return {
        "horizontal": delta(image.crop((0, 0, 1, h)), image.crop((w - 1, 0, w, h))),
        "vertical": delta(image.crop((0, 0, w, 1)), image.crop((0, h - 1, w, h))),
    }


def build(source: Path) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    albedo = periodicise(Image.open(source))
    normal = normal_rough(albedo)
    albedo.save(ALBEDO, "WEBP", quality=90, method=6, exact=True)
    normal.save(NORMAL, "WEBP", quality=92, method=6, exact=True)
    provenance = {
        "schema": "massfront-brood-terrain-pbr-v1",
        "source": {"kind": "OpenAI image generation", "sha256": sha256(source), "dimensions": list(Image.open(source).size)},
        "promptSummary": "Original neutral-lit seamless alien chitin, fibrous membrane and sparse bone-node terrain albedo; no reference pixels.",
        "processing": {"size": SIZE, "periodicSeamBand": SEAM_BAND, "normalStrength": 2.45, "roughnessAlpha": True},
    }
    PROVENANCE.write_text(json.dumps(provenance, indent=2) + "\n", encoding="utf-8")


def verify(proof: Path | None) -> dict:
    for path in (ALBEDO, NORMAL, PROVENANCE):
        if not path.is_file():
            raise SystemExit(f"missing Brood terrain asset: {path}")
    albedo = Image.open(ALBEDO).convert("RGB")
    normal = Image.open(NORMAL).convert("RGBA")
    if albedo.size != (SIZE, SIZE) or normal.size != (SIZE, SIZE):
        raise SystemExit(f"Brood terrain pair must be {SIZE}x{SIZE}")
    wrap = {"albedo": edge_metrics(albedo), "normalRough": edge_metrics(normal)}
    for name, axes in wrap.items():
        for axis, metric in axes.items():
            if metric["mean"] > 5.0 or metric["max"] > 56:
                raise SystemExit(f"{name} {axis} wrap exceeds budget: {metric}")
    alpha = normal.getchannel("A")
    amin, amax = alpha.getextrema()
    zmin, zmax = normal.getchannel("B").getextrema()
    if amin < 64 or amax > 240 or amax - amin < 36:
        raise SystemExit(f"roughness alpha range invalid: {amin}..{amax}")
    if zmin < 128 or zmax > 255:
        raise SystemExit(f"normal Z range invalid: {zmin}..{zmax}")
    if proof:
        tile = albedo
        canvas = Image.new("RGB", (SIZE * 3, SIZE * 3))
        for y in range(3):
            for x in range(3):
                canvas.paste(tile, (x * SIZE, y * SIZE))
        proof.parent.mkdir(parents=True, exist_ok=True)
        canvas.resize((1536, 1536), Image.Resampling.LANCZOS).save(proof, "PNG", optimize=True)
    return {
        "status": "PASS",
        "dimensions": [SIZE, SIZE],
        "bytes": {ALBEDO.name: ALBEDO.stat().st_size, NORMAL.name: NORMAL.stat().st_size},
        "sha256": {ALBEDO.name: sha256(ALBEDO), NORMAL.name: sha256(NORMAL)},
        "wrap": wrap,
        "roughnessRange": [amin, amax],
        "normalZRange": [zmin, zmax],
        "proof": str(proof) if proof else None,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--build", type=Path)
    parser.add_argument("--proof", type=Path)
    args = parser.parse_args()
    if args.build:
        build(args.build)
    print(json.dumps(verify(args.proof), indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
