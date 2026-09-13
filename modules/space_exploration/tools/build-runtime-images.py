#!/usr/bin/env python3
"""Build delivery-only WebP images without modifying the approved PNG masters."""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "assets" / "textures"
TARGET = ROOT / "assets" / "runtime"
PLANET_CHANNELS = {"basecolor", "normal", "orm", "height", "emissive", "clouds"}
# Emissive is also data-bearing: lossy ringing around sparse bright pixels was
# measurable below the delivery quality floor even at WebP quality 90.
LOSSLESS_CHANNELS = {"normal", "orm", "height", "emissive"}


def encode(source: Path, target: Path, *, lossless: bool) -> tuple[int, int]:
    target.parent.mkdir(parents=True, exist_ok=True)
    with Image.open(source) as image:
        image.save(target, "WEBP", lossless=lossless, quality=90, method=6, exact=True)
    return source.stat().st_size, target.stat().st_size


rows = []
for source in sorted((SOURCE / "personnel").glob("*.png")):
    rows.append((source, *encode(source, TARGET / "personnel" / f"{source.stem}.webp", lossless=False)))
for source in sorted((SOURCE / "planets").glob("*.png")):
    channel = source.stem.rsplit("-", 1)[-1]
    if channel not in PLANET_CHANNELS:
        continue
    rows.append((source, *encode(source, TARGET / "planets" / f"{source.stem}.webp", lossless=channel in LOSSLESS_CHANNELS)))

before = sum(row[1] for row in rows)
after = sum(row[2] for row in rows)
print(f"RUNTIME_IMAGES files={len(rows)} source={before} runtime={after} reduction={100 * (1 - after / before):.2f}%")
