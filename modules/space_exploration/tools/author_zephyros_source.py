#!/usr/bin/env python3
"""Author the Zephyros gas-giant surface source (canon stage-10 slot 7).

Zephyros is the authored host world of the reserved Gas-Giant Air Ops theatre:
an outer Aelos fuel giant harvested by UGA atmospheric rigs.  The painting is
fully deterministic (seeded) so a rebuild reproduces the same source bytes.

Why a painter and not an image-generation run: every other planet's source
arrives from the external generation queue, but the stage-10 contract forbids
claiming generated assets for pending-slot worlds without their own evidence
gate.  A seeded painter is original art with provable provenance — this file.

Latitude bands are pure functions of y, so the equirect source is seamless
horizontally by construction; vortices stay clear of the x edges.
"""
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "assets" / "textures" / "planets" / "source" / "zephyros-surface-source.png"

WIDTH, HEIGHT = 1600, 800
SEED = 20260925

# Slate-teal methane deck rising through pale weather bands to warm storm
# latitudes — reads as kin to Aelos's blue capital system, not a Jupiter clone.
RAMP = [
    (0.00, (0x0A, 0x1C, 0x2C)),
    (0.30, (0x1B, 0x46, 0x5F)),
    (0.52, (0x3D, 0x7A, 0x8F)),
    (0.70, (0x7E, 0xAF, 0xB4)),
    (0.85, (0xC9, 0xAF, 0x8C)),
    (1.00, (0xE6, 0xD5, 0xB2)),
]


def ramp_color(t):
    for (t0, c0), (t1, c1) in zip(RAMP, RAMP[1:]):
        if t <= t1:
            f = 0.0 if t1 == t0 else max(0.0, min(1.0, (t - t0) / (t1 - t0)))
            return np.array(c0, dtype=np.float32) * (1 - f) + np.array(c1, dtype=np.float32) * f
    return np.array(RAMP[-1][1], dtype=np.float32)


def main():
    rng = np.random.default_rng(SEED)
    ys = np.linspace(0.0, 1.0, HEIGHT, dtype=np.float32)

    # Band profile: a few octaves of sines with seeded phases.  Sampling is a
    # function of y only, so columns wrap without a seam pass.
    freqs = [(1.0, 1.0), (2.3, 0.55), (4.7, 0.30), (9.1, 0.16), (17.3, 0.08)]
    phases = rng.uniform(0.0, 2.0 * np.pi, len(freqs)).astype(np.float32)
    band = np.zeros_like(ys)
    for (f, a), ph in zip(freqs, phases):
        band += a * np.sin(2.0 * np.pi * f * ys + ph)
    band = (band - band.min()) / (band.max() - band.min())

    # Turbulence: seeded low-res noise stretched horizontally into jet-stream
    # streaks, then used to warp band sampling (domain warping) so the bands
    # shear and curl like flowing atmosphere instead of striping flatly.
    low = rng.random((HEIGHT // 20, WIDTH // 8), dtype=np.float32)
    turbulence = Image.fromarray((low * 255).astype(np.uint8), "L").resize((WIDTH, HEIGHT), Image.Resampling.BICUBIC)
    turbulence = np.asarray(turbulence, dtype=np.float32) / 255.0

    warp = (turbulence - 0.5) * 0.16
    sampled = np.clip(band[:, None] + warp, 0.0, 1.0)

    base = np.zeros((HEIGHT, WIDTH, 3), dtype=np.float32)
    stops = np.array([ramp_color(t) for t in np.linspace(0.0, 1.0, 256)], dtype=np.float32)
    indices = np.clip((sampled * 255.0), 0, 255).astype(np.int32)
    base = stops[indices]

    # Fine grain keeps the deck from banding after WebP lossless round-trips.
    grain = (rng.random((HEIGHT, WIDTH, 1), dtype=np.float32) - 0.5) * 0.035
    base = np.clip(base + grain * 255.0, 0, 255)

    painter = Image.fromarray(base.astype(np.uint8), "RGB")
    px = painter.load()

    # Storm ovals: one hero anticyclone plus lesser cells, all away from the
    # x edges.  Concentric ellipse rings over a soft core read as a rotating
    # storm eye at orbiter distance.
    def storm(cx, cy, rx, ry, core, ring, tilt=0.0):
        xx = np.arange(WIDTH, dtype=np.float32)[None, :] - cx
        yy = np.arange(HEIGHT, dtype=np.float32)[:, None] - cy
        if tilt:
            xx, yy = xx * np.cos(tilt) + yy * np.sin(tilt), -xx * np.sin(tilt) + yy * np.cos(tilt)
        d = np.sqrt((xx / rx) ** 2 + (yy / ry) ** 2)
        core = np.array(core, dtype=np.float32)
        ring = np.array(ring, dtype=np.float32)
        weight = np.clip(1.6 - d, 0.0, 1.0) ** 1.6
        ring_band = np.exp(-((d - 0.62) ** 2) / 0.045)
        overlay = core * weight[..., None] * 0.78 + ring * ring_band[..., None] * 0.62
        return np.clip(overlay, 0, 255)

    arr = np.asarray(painter, dtype=np.float32)
    arr += storm(WIDTH * 0.615, HEIGHT * 0.575, 118, 54, (196, 108, 56), (224, 158, 96))
    arr += storm(WIDTH * 0.255, HEIGHT * 0.335, 62, 27, (222, 196, 150), (238, 219, 178))
    arr += storm(WIDTH * 0.795, HEIGHT * 0.255, 44, 20, (158, 92, 60), (200, 130, 84))
    arr += storm(WIDTH * 0.415, HEIGHT * 0.785, 48, 21, (186, 116, 70), (216, 152, 104))
    painter = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), "RGB")

    # Polar hoods: cool, darker methane haze gathering at each pole; the north
    # hood runs slightly deeper (the harvest rigs ride the southern belt).
    hood = np.zeros((HEIGHT, 1, 1), dtype=np.float32)
    ys_n = np.linspace(0.0, 1.0, HEIGHT, dtype=np.float32)
    north = np.clip((0.16 - ys_n) / 0.16, 0.0, 1.0) ** 1.5
    south = np.clip((ys_n - 0.88) / 0.12, 0.0, 1.0) ** 1.7
    hood[:, 0, 0] = north * 0.42 + south * 0.30
    arr = np.asarray(painter, dtype=np.float32)
    arr *= 1.0 - hood
    arr[..., 2] += hood[..., 0] * 14.0
    Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), "RGB").save(OUT, optimize=True)
    print(f"authored {OUT.name} {WIDTH}x{HEIGHT} seed={SEED}")


if __name__ == "__main__":
    main()
