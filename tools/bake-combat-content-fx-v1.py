#!/usr/bin/env python3
"""Bake the original combat-content source plates into runtime flipbooks.

The image generator supplies original art; this deterministic step owns the
runtime contract: exact 4x4 layout, one connected macro shape per frame,
mip-safe gutters, transparent RGB cleanup, and a compact 512-square residency.
"""

from __future__ import annotations

import argparse
import json
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "assets" / "source" / "vfx" / "combat-content-v1"
OUT = ROOT / "assets" / "textures" / "vfx"
QA = ROOT / ".tmp" / "combat-content-fx-v1"

ATLAS_SIZE = 1024
CELL = ATLAS_SIZE // 4
CONTENT = 220
PAD = (CELL - CONTENT) // 2
ALPHA_CUTOFF = 10

# The blast flipbook keeps its own contract from the original terrain-asset
# bake: 1024-square, 256px cells, 9px gutters. Runtime UV insets adapt to
# atlas width, so these numbers must never drift.
BLAST_ATLAS_SIZE = 1024
BLAST_CELL = BLAST_ATLAS_SIZE // 4
BLAST_PAD = 9
BLAST_SOURCE = SOURCE / "blast-flipbook-baked-v1.png"
BLAST_V2_SOURCE = SOURCE / "blast-evolution-source.png"
BLAST_V3_SOURCE = SOURCE / "blast-evolution-source-v3.png"
BLAST_V4_SOURCE = SOURCE / "blast-evolution-source-v4-checker.png"
BLAST_TARGET = "mf-blast-flipbook-v1.png"
BLAST_TARGET_V2 = "mf-blast-flipbook-v2.png"
BLAST_TARGET_V3 = "mf-blast-flipbook-v3.png"
BLAST_TARGET_V4 = "mf-blast-flipbook-v4.png"
ENERGY_V2_SOURCE = SOURCE / "energy-beam-terminus-source.png"
ENERGY_TARGET_V2 = "mf-energy-beam-terminus-flipbook-v2.png"

SPECS = (
    # source, target, neutral tint, recover preview checker, frame map,
    # per-cell content limit, alpha-body floor, cleanup style
    ("missile-air-smoke-source.png", "mf-missile-air-smoke-flipbook-v1.png", False, True, None, 220, 22, "trail"),
    ("energy-beam-terminus-source.png", "mf-energy-beam-terminus-flipbook-v1.png", True, False, None, 220, 10, "default"),
    ("organic-ichor-source.png", "mf-organic-ichor-flipbook-v1.png", True, False, None, 220, 10, "default"),
    # The generated source plate establishes the ignition language, but its
    # opening cells contain a generic demonstration aircraft. Actual faction
    # meshes remain live in the renderer; use only the fire/soot half here and
    # hold each source phase for two runtime frames.
    ("air-destruction-source.png", "mf-air-destruction-flipbook-v1.png", False, False,
     (8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13, 14, 14, 15, 15), 216, 58, "air-death"),
)


def square_1024(path: Path, recover_checker: bool) -> Image.Image:
    source = Image.open(path)
    if recover_checker and source.mode != "RGBA":
        # The image editor returned its transparency preview composited over a
        # near-white checker. Recover a conservative smoke alpha from distance
        # to that background; values above 244 are guaranteed empty preview.
        rgb = np.asarray(source.convert("RGB"), dtype=np.float32)
        lum = rgb @ np.asarray((0.2126, 0.7152, 0.0722), dtype=np.float32)
        alpha = np.uint8(np.clip((244.0 - lum) * 4.2, 0.0, 255.0))
        rgba = np.dstack((np.uint8(rgb), alpha))
        rgba[alpha < ALPHA_CUTOFF] = 0
        image = Image.fromarray(rgba, "RGBA")
    else:
        image = source.convert("RGBA")
    side = min(image.size)
    left = (image.width - side) // 2
    top = (image.height - side) // 2
    return image.crop((left, top, left + side, top + side)).resize(
        (1024, 1024), Image.Resampling.LANCZOS
    )


def largest_alpha_component(data: np.ndarray) -> np.ndarray:
    """Keep one macro silhouette, removing stray generated flecks per cell."""
    mask = data[:, :, 3] >= ALPHA_CUTOFF
    height, width = mask.shape
    seen = np.zeros(mask.shape, dtype=bool)
    best: list[tuple[int, int]] = []
    for sy, sx in zip(*np.nonzero(mask)):
        if seen[sy, sx]:
            continue
        seen[sy, sx] = True
        queue: deque[tuple[int, int]] = deque(((int(sy), int(sx)),))
        component: list[tuple[int, int]] = []
        while queue:
            y, x = queue.popleft()
            component.append((y, x))
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    if not (dx or dy):
                        continue
                    ny, nx = y + dy, x + dx
                    if (
                        0 <= ny < height
                        and 0 <= nx < width
                        and mask[ny, nx]
                        and not seen[ny, nx]
                    ):
                        seen[ny, nx] = True
                        queue.append((ny, nx))
        if len(component) > len(best):
            best = component
    keep = np.zeros(mask.shape, dtype=bool)
    if best:
        ys, xs = zip(*best)
        keep[np.asarray(ys), np.asarray(xs)] = True
    data[~keep] = 0
    return data


def prepare_frame(
    frame: Image.Image,
    neutral: bool,
    content: int,
    alpha_floor: int,
    style: str,
    frame_phase: int,
) -> Image.Image:
    data = largest_alpha_component(np.asarray(frame.convert("RGBA"), dtype=np.uint8).copy())
    alpha = data[:, :, 3].astype(np.float32)
    # Generated smoke can contain a broad, almost invisible matte that becomes
    # a rectangular/polygonal lobe after tinting and tactical-scale expansion.
    # Rebase that fringe to zero while preserving a smooth body edge.
    floor = max(ALPHA_CUTOFF, int(alpha_floor))
    alpha = np.uint8(np.clip((alpha - floor) * (255.0 / max(1, 255 - floor)), 0.0, 255.0))
    if style == "air-death":
        # The source cloud has six similarly sized radial puffs. At gameplay
        # scale those equal lobes read as a translucent polygon/flower around
        # the impact. Keep its fire/soot detail, but author one asymmetric,
        # vertically biased macro silhouette around the alpha-weighted body.
        yy, xx = np.indices(alpha.shape, dtype=np.float32)
        weight = alpha.astype(np.float32)
        total = max(1.0, float(weight.sum()))
        cx = float((xx * weight).sum() / total)
        cy = float((yy * weight).sum() / total)
        visible_y, visible_x = np.nonzero(alpha)
        half_x = max(8.0, (float(visible_x.max()) - float(visible_x.min()) + 1.0) * 0.50)
        half_y = max(8.0, (float(visible_y.max()) - float(visible_y.min()) + 1.0) * 0.50)
        nx = (xx - cx) / (half_x * 0.92)
        ny = (yy - cy) / (half_y * 1.08)
        radius = np.sqrt(nx * nx + ny * ny)
        angle = np.arctan2(ny, nx)
        phase = float(frame_phase) * 0.71
        # Fill the valleys between the generated source's six equal puffs with
        # a broad blurred density body, then cut it with one gently irregular
        # ellipse. Multiplying the old source alpha by a circle retained every
        # petal; at tactical zoom that became the translucent flower/matte the
        # runtime capture exposed. This keeps the source fire/soot detail while
        # making the macro boundary authored, cohesive, and softly feathered.
        blurred = np.asarray(
            Image.fromarray(np.uint8(alpha), "L").filter(ImageFilter.GaussianBlur(10.0)),
            dtype=np.float32,
        )
        boundary = 0.90 + 0.018 * np.sin(angle * 3.0 + phase) + 0.012 * np.sin(angle * 2.0 - phase * 0.43)
        silhouette = np.clip((boundary + 0.16 - radius) / 0.16, 0.0, 1.0)
        central = 150.0 * np.clip((0.78 - radius) / 0.38, 0.0, 1.0)
        body = np.maximum(alpha.astype(np.float32) * 0.82, blurred * 1.30)
        body = np.maximum(body, central)
        alpha = np.uint8(np.clip(body * silhouette, 0.0, 255.0))
    data[:, :, 3] = alpha
    if style == "trail":
        # This generated source was returned as a checkerboard *preview*, not
        # straight-alpha RGBA. Alpha recovery above removes the checker shape,
        # but its near-white RGB remained in the antialiased smoke fringe. In
        # game that became a hard pale rectangle when the narrow trail was
        # magnified. Re-author the recovered pixels as soot while retaining
        # the source's orange ignition mask and internal density variation.
        rgb = data[:, :, :3].astype(np.float32)
        lum = rgb @ np.asarray((0.2126, 0.7152, 0.0722), dtype=np.float32)
        density = alpha.astype(np.float32) / 255.0
        source_dark = np.clip((225.0 - lum) / 185.0, 0.0, 1.0)
        soot = np.clip(92.0 - 47.0 * density - 18.0 * source_dark, 30.0, 94.0)
        soot_rgb = np.stack((soot * 0.98, soot * 0.95, soot * 0.92), axis=2)
        hot = np.clip((rgb[:, :, 0] - rgb[:, :, 1] - 18.0) / 92.0, 0.0, 1.0)
        hot *= np.clip((rgb[:, :, 1] - rgb[:, :, 2] - 6.0) / 72.0, 0.0, 1.0)
        hot *= np.clip((density - 0.10) / 0.42, 0.0, 1.0)
        fire_rgb = np.stack((245.0 - hot * 5.0, 82.0 + hot * 54.0, 22.0 + hot * 12.0), axis=2)
        data[:, :, :3] = np.clip(soot_rgb * (1.0 - hot[:, :, None]) + fire_rgb * hot[:, :, None], 0, 255).astype(np.uint8)
    elif neutral:
        rgb = data[:, :, :3].astype(np.float32)
        lum = rgb @ np.asarray((0.2126, 0.7152, 0.0722), dtype=np.float32)
        # Preserve authored highlight contrast while keeping team tint clean.
        neutral_rgb = np.clip(lum[:, :, None] * np.asarray((1.03, 1.01, 0.99)), 0, 255)
        data[:, :, :3] = neutral_rgb.astype(np.uint8)
    data[alpha == 0, :3] = 0
    data[:, :, 3] = alpha
    image = Image.fromarray(data, "RGBA")
    bounds = image.getchannel("A").getbbox()
    if not bounds:
        raise ValueError("source frame has no visible alpha")
    image = image.crop(bounds)
    scale = min(content / image.width, content / image.height)
    size = (max(1, round(image.width * scale)), max(1, round(image.height * scale)))
    image = image.resize(size, Image.Resampling.LANCZOS)
    if style in {"trail", "air-death"}:
        # Preserve a real feather below the old ten-alpha cleanup threshold.
        # The billboard shader already discards sub-1-alpha texels, so a
        # one-pixel source feather is stable and prevents magnified cell steps.
        image = image.filter(ImageFilter.GaussianBlur(0.90 if style == "trail" else 0.82))
    out = Image.new("RGBA", (CELL, CELL), (0, 0, 0, 0))
    out.alpha_composite(image, ((CELL - size[0]) // 2, (CELL - size[1]) // 2))
    clean = np.asarray(out, dtype=np.uint8).copy()
    final_cutoff = 3 if style in {"trail", "air-death"} else ALPHA_CUTOFF
    clean[clean[:, :, 3] < final_cutoff] = 0
    return Image.fromarray(clean, "RGBA")


def bake(
    source: Path,
    target: Path,
    neutral: bool,
    recover_checker: bool,
    frame_map: tuple[int, ...] | None,
    content: int,
    alpha_floor: int,
    style: str,
) -> None:
    sheet = square_1024(source, recover_checker)
    atlas = Image.new("RGBA", (ATLAS_SIZE, ATLAS_SIZE), (0, 0, 0, 0))
    for target_index in range(16):
        source_index = frame_map[target_index] if frame_map else target_index
        source_row, source_col = divmod(source_index, 4)
        target_row, target_col = divmod(target_index, 4)
        frame = sheet.crop((source_col * 256, source_row * 256, (source_col + 1) * 256, (source_row + 1) * 256))
        frame = prepare_frame(frame, neutral, content, alpha_floor, style, source_index)
        atlas.alpha_composite(frame, (target_col * CELL, target_row * CELL))
    target.parent.mkdir(parents=True, exist_ok=True)
    atlas.save(target, "PNG", optimize=True)


def _circular_smooth(values: np.ndarray, sigma_bins: float) -> np.ndarray:
    """Gaussian smoothing on a periodic 1D signal via wrapped convolution."""
    half = max(1, int(sigma_bins * 3))
    kernel = np.exp(-0.5 * (np.arange(-half, half + 1) / sigma_bins) ** 2)
    kernel /= kernel.sum()
    padded = np.concatenate((values[-half:], values, values[:half]))
    return np.convolve(padded, kernel, mode="valid")


def refine_blast_frame(cell: np.ndarray, index: int) -> np.ndarray:
    """Break the blast frame's circular silhouette and let the core read.

    The generated blast plates are radially symmetric puff clusters; composited
    under the runtime shock ring they read as generic nested circles with the
    core nearly invisible. Deterministically (seeded per frame, no wall-clock
    randomness) this pass:
      * erodes the outer silhouette with per-angle harmonic + strand noise —
        tight in the opening frames, progressively ragged/frayed late;
      * lifts the early-frame core toward white-hot and densifies its alpha so
        one readable core survives behind the annulus.
    Erosion only multiplies existing alpha and the boost is central, so the
    9px gutter contract cannot be violated.
    """
    data = cell.astype(np.float32)
    alpha = data[:, :, 3]
    ys, xs = np.nonzero(alpha)
    if not len(xs):
        return cell
    t01 = index / 15.0
    rng = np.random.default_rng(0xB1A57000 + index)

    weight = alpha
    total = max(1.0, float(weight.sum()))
    yy, xx = np.indices(alpha.shape, dtype=np.float32)
    cx = float((xx * weight).sum() / total)
    cy = float((yy * weight).sum() / total)
    dx = xx - cx
    dy = yy - cy
    radius = np.sqrt(dx * dx + dy * dy)
    rmax = max(8.0, float(np.percentile(np.sqrt((xs - cx) ** 2 + (ys - cy) ** 2), 99.0)))
    angle = np.arctan2(dy, dx)

    # Per-angle edge field: low-frequency harmonics give uneven arc segments,
    # a smoothed hash strand term gives fine radial fraying. Both evolve with
    # the animation: tighter early, ragged late.
    harmonic_amp = 0.030 + 0.085 * t01
    strand_amp = 0.020 + 0.105 * t01
    feather = 0.055 + 0.115 * t01
    phases = rng.uniform(0.0, 2.0 * np.pi, size=3)
    bins = 720
    strands = rng.standard_normal(bins)
    strands = _circular_smooth(strands, 2.4)
    strands /= max(1e-6, float(strands.std()))
    strands = np.clip(strands, -2.2, 2.2)
    bin_index = np.int32(np.mod(angle, 2.0 * np.pi) / (2.0 * np.pi) * bins) % bins
    edge = (
        1.0
        + harmonic_amp * np.sin(angle * 3.0 + phases[0])
        + harmonic_amp * 0.7 * np.sin(angle * 5.0 + phases[1])
        + harmonic_amp * 0.45 * np.sin(angle * 8.0 + phases[2])
        + strand_amp * strands[bin_index]
    )
    u = radius / (rmax * edge)
    silhouette = np.clip((1.0 + feather - u) / feather, 0.0, 1.0)
    alpha = alpha * np.minimum(1.0, silhouette)

    # Early-frame core: hotter and denser so it reads through the shock ring.
    # The very center is already saturated white in the source; the readable
    # gain has to come from the mid-radius fireball body, so the profile is
    # deliberately wide and the lift pushes that orange band toward white-hot.
    if index <= 5:
        boost = (1.0 - index / 6.0) ** 0.8
        core = np.clip((0.72 - u) / 0.72, 0.0, 1.0) ** 1.2
        lift = (0.38 * boost) * core[:, :, None]
        data[:, :, :3] = data[:, :, :3] + (255.0 - data[:, :, :3]) * lift
        visible = alpha > 0
        alpha = np.where(visible, np.minimum(255.0, alpha + 255.0 * 0.45 * boost * core), alpha)

    alpha = np.clip(alpha, 0.0, 255.0)
    alpha[alpha < 12] = 0.0
    data[:, :, 3] = alpha
    data[alpha == 0, :3] = 0.0
    return np.uint8(np.clip(np.rint(data), 0, 255))


def enlarge_early_core(cell: np.ndarray, factor: float) -> np.ndarray:
    """Grow an opening frame about its cell centre, capped by the gutter.

    The source's ignition frames are already white-hot and alpha-dense, so
    they have no brightness headroom; on screen they were a near-invisible
    dot behind the shock annulus because their content occupies a sliver of
    the cell. Scaling the content up is the remaining readable-core knob.
    """
    alpha = cell[:, :, 3]
    ys, xs = np.nonzero(alpha >= 12)
    if not len(xs):
        return cell
    half = BLAST_CELL / 2.0
    reach = float(np.sqrt((xs - half + 0.5) ** 2 + (ys - half + 0.5) ** 2).max())
    limit = half - BLAST_PAD - 2.0
    factor = min(factor, (limit / max(1.0, reach)) * 0.995)
    if factor <= 1.005:
        return cell
    scaled_size = int(round(BLAST_CELL * factor))
    scaled = Image.fromarray(cell, "RGBA").resize(
        (scaled_size, scaled_size), Image.Resampling.LANCZOS
    )
    offset = (scaled_size - BLAST_CELL) // 2
    out = np.asarray(
        scaled.crop((offset, offset, offset + BLAST_CELL, offset + BLAST_CELL)),
        dtype=np.uint8,
    ).copy()
    out[out[:, :, 3] < 12] = 0
    return out


def recover_blast_magenta_cell(cell: Image.Image, index: int) -> Image.Image:
    """Recover straight alpha and remove the generated magenta matte.

    The corrected authoring source uses a saturated magenta field. Neutral
    white heat, orange fire and grey/black smoke all sit far from that colour
    axis, so `min(R,B)-G` is a stable key that does not erase the hot core or
    late smoke. Straight-colour reconstruction removes the magenta component
    from feather pixels before standard alpha blending in the game.
    """
    rgb = np.asarray(cell.convert("RGB"), dtype=np.float32)
    score = np.minimum(rgb[:, :, 0], rgb[:, :, 2]) - rgb[:, :, 1]
    alpha01 = np.clip((175.0 - score) / 155.0, 0.0, 1.0)
    # Exact unmatting is unstable at very low alpha and amplified the small G
    # channel into a neon-green rim. Despill the magenta axis instead: bring
    # R/B down by their shared excess over G. Neutral white/smoke are unchanged
    # and orange fire has no shared magenta excess, while feather pixels become
    # neutral soot before normal alpha blending.
    straight = rgb.copy()
    spill = np.maximum(np.minimum(rgb[:, :, 0], rgb[:, :, 2]) - rgb[:, :, 1], 0.0)
    straight[:, :, 0] -= spill
    straight[:, :, 2] -= spill
    if index >= 10:
        lum = straight @ np.asarray((0.2126, 0.7152, 0.0722), dtype=np.float32)
        neutral = np.stack((lum, lum * 0.98, lum * 0.96), axis=2)
        ember = np.clip((straight[:, :, 0] - straight[:, :, 1] - 10.0) / 85.0, 0.0, 1.0)
        ember *= np.clip((straight[:, :, 1] - straight[:, :, 2] - 4.0) / 68.0, 0.0, 1.0)
        cool = min(1.0, (index - 9.0) / 6.0)
        mix = (cool * (1.0 - ember))[:, :, None]
        straight = straight * (1.0 - mix) + neutral * mix
    rgba = np.dstack((np.clip(straight, 0.0, 255.0), alpha01 * 255.0)).astype(np.uint8)
    rgba[rgba[:, :, 3] < 10] = 0
    return Image.fromarray(rgba, "RGBA")


def fit_blast_cell(cell: Image.Image, content: int = 230) -> Image.Image:
    """Fit only oversized frames, preserving authored expansion across cells."""
    bounds = cell.getchannel("A").getbbox()
    if not bounds:
        raise ValueError("recovered blast frame has no visible alpha")
    width, height = bounds[2] - bounds[0], bounds[3] - bounds[1]
    image = cell.crop(bounds)
    scale = min(1.0, content / image.width, content / image.height)
    size = (max(1, round(image.width * scale)), max(1, round(image.height * scale)))
    image = image.resize(size, Image.Resampling.LANCZOS)
    out = Image.new("RGBA", (BLAST_CELL, BLAST_CELL), (0, 0, 0, 0))
    out.alpha_composite(image, ((BLAST_CELL - size[0]) // 2, (BLAST_CELL - size[1]) // 2))
    data = np.asarray(out, dtype=np.uint8).copy()
    data[data[:, :, 3] < 10] = 0
    return Image.fromarray(data, "RGBA")


def bake_blast_v2(source: Path, target: Path) -> None:
    """Bake the original generated evolution plate; never mutate v1."""
    if not source.exists():
        raise FileNotFoundError(f"{source}: missing original generated blast evolution plate")
    raw = Image.open(source).convert("RGB")
    side = min(raw.size)
    left, top = (raw.width - side) // 2, (raw.height - side) // 2
    raw = raw.crop((left, top, left + side, top + side)).resize(
        (BLAST_ATLAS_SIZE, BLAST_ATLAS_SIZE), Image.Resampling.LANCZOS
    )
    out = Image.new("RGBA", (BLAST_ATLAS_SIZE, BLAST_ATLAS_SIZE), (0, 0, 0, 0))
    for index in range(16):
        row, col = divmod(index, 4)
        y0, x0 = row * BLAST_CELL, col * BLAST_CELL
        cell = recover_blast_magenta_cell(
            raw.crop((x0, y0, x0 + BLAST_CELL, y0 + BLAST_CELL)), index
        )
        cell = fit_blast_cell(cell)
        out.alpha_composite(cell, (x0, y0))
    target.parent.mkdir(parents=True, exist_ok=True)
    out.save(target, "PNG", optimize=True)


def bake_blast_v3(source: Path, target: Path) -> None:
    """Bake the native-alpha generated evolution sheet into guarded cells."""
    if not source.exists():
        raise FileNotFoundError(f"{source}: missing native-alpha blast evolution plate")
    raw = Image.open(source).convert("RGBA")
    if raw.getchannel("A").getextrema()[0] == 255:
        raise ValueError(f"{source.name}: expected genuine transparency")
    out = Image.new("RGBA", (BLAST_ATLAS_SIZE, BLAST_ATLAS_SIZE), (0, 0, 0, 0))
    for index in range(16):
        row, col = divmod(index, 4)
        x0, x1 = round(col * raw.width / 4), round((col + 1) * raw.width / 4)
        y0, y1 = round(row * raw.height / 4), round((row + 1) * raw.height / 4)
        cell = raw.crop((x0, y0, x1, y1))
        # Preserve the generated straight alpha, but remove barely visible RGB
        # fringe before resizing into the runtime's nine-pixel mip gutter.
        data = np.asarray(cell, dtype=np.uint8).copy()
        data[data[:, :, 3] < 10] = 0
        data = largest_alpha_component(data)
        cell = fit_blast_cell(Image.fromarray(data, "RGBA"), content=230)
        out.alpha_composite(cell, ((index % 4) * BLAST_CELL, (index // 4) * BLAST_CELL))
    target.parent.mkdir(parents=True, exist_ok=True)
    out.save(target, "PNG", optimize=True)


def _fill_enclosed(mask: np.ndarray) -> np.ndarray:
    """Fill holes without turning the checker outside a sprite into alpha."""
    height, width = mask.shape
    outside = np.zeros(mask.shape, dtype=bool)
    queue: deque[tuple[int, int]] = deque()
    for x in range(width):
        if not mask[0, x]:
            outside[0, x] = True
            queue.append((0, x))
        if not mask[-1, x] and not outside[-1, x]:
            outside[-1, x] = True
            queue.append((height - 1, x))
    for y in range(height):
        if not mask[y, 0] and not outside[y, 0]:
            outside[y, 0] = True
            queue.append((y, 0))
        if not mask[y, -1] and not outside[y, -1]:
            outside[y, -1] = True
            queue.append((y, width - 1))
    while queue:
        y, x = queue.popleft()
        for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < height and 0 <= nx < width and not mask[ny, nx] and not outside[ny, nx]:
                outside[ny, nx] = True
                queue.append((ny, nx))
    return ~outside


def _edge_colour_extend(rgb: np.ndarray, alpha: np.ndarray) -> np.ndarray:
    """Replace checker-contaminated feather RGB with nearby body colour."""
    out = rgb.copy()
    strength = alpha.copy()
    for _ in range(14):
        best = strength.copy()
        best_rgb = out.copy()
        for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1), (-1, -1), (-1, 1), (1, -1), (1, 1)):
            rolled = np.roll(strength, (dy, dx), axis=(0, 1))
            if dy < 0:
                rolled[dy:] = 0
            elif dy > 0:
                rolled[:dy] = 0
            if dx < 0:
                rolled[:, dx:] = 0
            elif dx > 0:
                rolled[:, :dx] = 0
            take = rolled > best
            if not take.any():
                continue
            candidate = np.roll(out, (dy, dx), axis=(0, 1))
            best[take] = rolled[take]
            best_rgb[take] = candidate[take]
        strength, out = best, best_rgb
    feather = (alpha > 0) & (alpha < 224)
    rgb[feather] = out[feather]
    return rgb


def _blast_checker_signal(rgb: np.ndarray) -> np.ndarray:
    hi = rgb.max(axis=2)
    lo = rgb.min(axis=2)
    chroma = hi - lo
    lum = rgb @ np.asarray((0.2126, 0.7152, 0.0722), dtype=np.float32)
    warm = np.maximum(rgb[:, :, 0] - rgb[:, :, 2], 0.0)
    return np.maximum.reduce(((239.0 - lum) * 1.75, chroma * 3.4, warm * 2.7))


def _alpha_components(mask: np.ndarray) -> list[dict[str, object]]:
    """Return connected bodies so frame extraction does not trust a fake grid."""
    height, width = mask.shape
    seen = np.zeros(mask.shape, dtype=bool)
    components: list[dict[str, object]] = []
    for sy, sx in zip(*np.nonzero(mask)):
        if seen[sy, sx]:
            continue
        seen[sy, sx] = True
        queue: deque[tuple[int, int]] = deque(((int(sy), int(sx)),))
        pixels: list[tuple[int, int]] = []
        min_x = max_x = int(sx)
        min_y = max_y = int(sy)
        sum_x = sum_y = 0
        while queue:
            y, x = queue.popleft()
            pixels.append((y, x))
            min_x = min(min_x, x)
            max_x = max(max_x, x)
            min_y = min(min_y, y)
            max_y = max(max_y, y)
            sum_x += x
            sum_y += y
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    if not (dx or dy):
                        continue
                    ny, nx = y + dy, x + dx
                    if 0 <= ny < height and 0 <= nx < width and mask[ny, nx] and not seen[ny, nx]:
                        seen[ny, nx] = True
                        queue.append((ny, nx))
        if len(pixels) >= 48:
            components.append({
                "pixels": pixels,
                "bounds": (min_x, min_y, max_x + 1, max_y + 1),
                "cx": sum_x / len(pixels),
                "cy": sum_y / len(pixels),
                "area": len(pixels),
            })
    return components


def recover_blast_checker_component(
    raw_rgb: np.ndarray, component: dict[str, object]
) -> Image.Image:
    """Recover one complete body from the checker-composited source.

    The source is deliberately well-spaced but its requested transparency was
    returned as a neutral 238/255 checker.  A luminance key alone erases the
    white-hot core.  This key combines darkness, chroma and fire warmth, fills
    enclosed core holes, then propagates real body colour into the soft edge so
    standard alpha blending cannot reveal a pale checker fringe.
    """
    min_x, min_y, max_x, max_y = component["bounds"]
    margin = 5
    min_x = max(0, int(min_x) - margin)
    min_y = max(0, int(min_y) - margin)
    max_x = min(raw_rgb.shape[1], int(max_x) + margin)
    max_y = min(raw_rgb.shape[0], int(max_y) + margin)
    rgb = raw_rgb[min_y:max_y, min_x:max_x].astype(np.float32)
    signal = _blast_checker_signal(rgb)
    support = np.zeros(signal.shape, dtype=bool)
    for y, x in component["pixels"]:
        support[y - min_y, x - min_x] = True
    bridged = np.asarray(
        Image.fromarray(np.uint8(support) * 255, "L").filter(ImageFilter.MaxFilter(3)),
        dtype=np.uint8,
    ) >= 128
    body = _fill_enclosed(bridged)
    alpha = np.clip((signal - 7.0) * 1.55, 0.0, 255.0)
    neighbourhood = np.asarray(
        Image.fromarray(np.uint8(alpha), "L").filter(ImageFilter.MaxFilter(7)),
        dtype=np.float32,
    )
    holes = body & ~support
    alpha = np.where(body, alpha, 0.0)
    alpha[holes] = np.maximum(alpha[holes], neighbourhood[holes] * 0.94)
    alpha = np.asarray(
        Image.fromarray(np.uint8(np.clip(alpha, 0, 255)), "L").filter(ImageFilter.GaussianBlur(0.55)),
        dtype=np.uint8,
    ).copy()
    alpha[~body] = 0
    alpha[alpha < 7] = 0
    straight = _edge_colour_extend(np.uint8(np.clip(rgb, 0, 255)), alpha)
    rgba = np.dstack((straight, alpha))
    rgba[alpha == 0] = 0
    image = Image.fromarray(rgba, "RGBA")
    bounds = image.getchannel("A").getbbox()
    if not bounds:
        raise ValueError("checker component lost all alpha")
    return image.crop(bounds)


def bake_blast_v4(source: Path, target: Path) -> None:
    """Split 16 complete bodies, then preserve their relative authored scale."""
    if not source.exists():
        raise FileNotFoundError(f"{source}: missing padded checker source")
    raw = Image.open(source).convert("RGB").resize(
        (BLAST_ATLAS_SIZE, BLAST_ATLAS_SIZE), Image.Resampling.LANCZOS
    )
    raw_rgb = np.asarray(raw, dtype=np.float32)
    seed = _blast_checker_signal(raw_rgb) >= 12.0
    linked = np.asarray(
        Image.fromarray(np.uint8(seed) * 255, "L").filter(ImageFilter.MaxFilter(3)),
        dtype=np.uint8,
    ) >= 128
    components = sorted(_alpha_components(linked), key=lambda item: int(item["area"]), reverse=True)[:16]
    if len(components) != 16:
        raise ValueError(f"{source.name}: expected 16 complete effect bodies, found {len(components)}")
    # The image editor did not place its four rows on exact mathematical cell
    # boundaries. Sorting the actual bodies prevents the nominal-grid crop that
    # visibly amputated row-three smoke and row-four plume tops.
    components.sort(key=lambda item: float(item["cy"]))
    ordered: list[dict[str, object]] = []
    for row in range(4):
        ordered.extend(sorted(components[row * 4 : row * 4 + 4], key=lambda item: float(item["cx"])))
    frames = [recover_blast_checker_component(raw_rgb, item) for item in ordered]
    max_width = max(frame.width for frame in frames)
    max_height = max(frame.height for frame in frames)
    content = BLAST_CELL - (BLAST_PAD + 4) * 2
    shared_scale = min(content / max_width, content / max_height)
    out = Image.new("RGBA", (BLAST_ATLAS_SIZE, BLAST_ATLAS_SIZE), (0, 0, 0, 0))
    for index, frame in enumerate(frames):
        row, col = divmod(index, 4)
        x0, y0 = col * BLAST_CELL, row * BLAST_CELL
        size = (
            max(1, round(frame.width * shared_scale)),
            max(1, round(frame.height * shared_scale)),
        )
        frame = frame.resize(size, Image.Resampling.LANCZOS)
        clean = np.asarray(frame, dtype=np.uint8).copy()
        clean[clean[:, :, 3] < 7] = 0
        frame = Image.fromarray(clean, "RGBA")
        # V4's defining contract is shared-frame registration: never crop and
        # independently enlarge cells, because that turns a coherent evolution
        # into sixteen size/anchor pops and makes smoke look abruptly cut.
        left = x0 + (BLAST_CELL - frame.width) // 2
        baseline = y0 + BLAST_CELL - BLAST_PAD - 4
        out.alpha_composite(frame, (left, baseline - frame.height))
    target.parent.mkdir(parents=True, exist_ok=True)
    out.save(target, "PNG", optimize=True)


def _extract_registered_rgba_frames(source: Path) -> list[Image.Image]:
    """Own frames by connected alpha body instead of nominal grid crop."""
    raw = Image.open(source).convert("RGBA")
    data = np.asarray(raw, dtype=np.uint8)
    seed = data[:, :, 3] >= ALPHA_CUTOFF
    linked = np.asarray(
        Image.fromarray(np.uint8(seed) * 255, "L").filter(ImageFilter.MaxFilter(3)),
        dtype=np.uint8,
    ) >= 128
    components = sorted(_alpha_components(linked), key=lambda item: int(item["area"]), reverse=True)[:16]
    if len(components) != 16:
        raise ValueError(f"{source.name}: expected 16 alpha bodies, found {len(components)}")
    components.sort(key=lambda item: float(item["cy"]))
    ordered: list[dict[str, object]] = []
    for row in range(4):
        ordered.extend(sorted(components[row * 4 : row * 4 + 4], key=lambda item: float(item["cx"])))
    frames: list[Image.Image] = []
    for component in ordered:
        min_x, min_y, max_x, max_y = component["bounds"]
        margin = 5
        min_x = max(0, int(min_x) - margin)
        min_y = max(0, int(min_y) - margin)
        max_x = min(raw.width, int(max_x) + margin)
        max_y = min(raw.height, int(max_y) + margin)
        crop = data[min_y:max_y, min_x:max_x].copy()
        support = np.zeros(crop.shape[:2], dtype=np.uint8)
        for y, x in component["pixels"]:
            support[y - min_y, x - min_x] = 255
        support = np.asarray(
            Image.fromarray(support, "L").filter(ImageFilter.MaxFilter(3)), dtype=np.uint8
        ) > 0
        crop[~support] = 0
        crop[crop[:, :, 3] < ALPHA_CUTOFF] = 0
        frame = Image.fromarray(crop, "RGBA")
        bounds = frame.getchannel("A").getbbox()
        if not bounds:
            raise ValueError(f"{source.name}: extracted an empty frame")
        frames.append(frame.crop(bounds))
    return frames


def _neutralize_energy(frame: Image.Image) -> Image.Image:
    data = np.asarray(frame.convert("RGBA"), dtype=np.uint8).copy()
    alpha = data[:, :, 3]
    rgb = data[:, :, :3].astype(np.float32)
    lum = rgb @ np.asarray((0.2126, 0.7152, 0.0722), dtype=np.float32)
    data[:, :, :3] = np.uint8(np.clip(lum[:, :, None] * np.asarray((1.03, 1.01, 0.99)), 0, 255))
    data[alpha == 0] = 0
    return Image.fromarray(data, "RGBA")


def bake_energy_v2(source: Path, target: Path) -> None:
    """Keep complete ribbon/hit bodies and preserve intra-group scale."""
    frames = [_neutralize_energy(frame) for frame in _extract_registered_rgba_frames(source)]
    out = Image.new("RGBA", (ATLAS_SIZE, ATLAS_SIZE), (0, 0, 0, 0))
    for start in (0, 8):
        group = frames[start : start + 8]
        shared_scale = min(CONTENT / max(frame.width for frame in group), CONTENT / max(frame.height for frame in group))
        for offset, frame in enumerate(group):
            index = start + offset
            row, col = divmod(index, 4)
            size = (max(1, round(frame.width * shared_scale)), max(1, round(frame.height * shared_scale)))
            frame = frame.resize(size, Image.Resampling.LANCZOS)
            clean = np.asarray(frame, dtype=np.uint8).copy()
            clean[clean[:, :, 3] < ALPHA_CUTOFF] = 0
            frame = Image.fromarray(clean, "RGBA")
            x = col * CELL + (CELL - frame.width) // 2
            if start == 0:
                y = row * CELL + CELL - PAD - frame.height
            else:
                y = row * CELL + (CELL - frame.height) // 2
            out.alpha_composite(frame, (x, y))
    target.parent.mkdir(parents=True, exist_ok=True)
    out.save(target, "PNG", optimize=True)


def bake_blast(source: Path, target: Path) -> None:
    """Deterministic retouch of the pristine baked blast flipbook plate."""
    if not source.exists():
        raise FileNotFoundError(
            f"{source}: snapshot the pristine baked blast atlas here first "
            "(it is the deterministic input; the runtime atlas is the output)"
        )
    image = Image.open(source).convert("RGBA")
    if image.size != (BLAST_ATLAS_SIZE, BLAST_ATLAS_SIZE):
        raise ValueError(f"{source.name}: expected {BLAST_ATLAS_SIZE}-square, got {image.size}")
    atlas = np.asarray(image, dtype=np.uint8).copy()
    for index in range(16):
        row, col = divmod(index, 4)
        y0, x0 = row * BLAST_CELL, col * BLAST_CELL
        cell = refine_blast_frame(atlas[y0 : y0 + BLAST_CELL, x0 : x0 + BLAST_CELL], index)
        if index <= 3:
            cell = enlarge_early_core(cell, (1.60, 1.40, 1.24, 1.10)[index])
        atlas[y0 : y0 + BLAST_CELL, x0 : x0 + BLAST_CELL] = cell
    target.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(atlas, "RGBA").save(target, "PNG", optimize=True)


def verify_blast(path: Path) -> dict[str, object]:
    image = Image.open(path).convert("RGBA")
    if image.size != (BLAST_ATLAS_SIZE, BLAST_ATLAS_SIZE):
        raise ValueError(f"{path.name}: expected {BLAST_ATLAS_SIZE}-square, got {image.size}")
    rgba = np.asarray(image, dtype=np.uint8)
    transparent_rgb_max = int(rgba[:, :, :3][rgba[:, :, 3] == 0].max(initial=0))
    if transparent_rgb_max:
        raise ValueError(f"{path.name}: nonzero RGB outside alpha ({transparent_rgb_max})")
    frames = []
    for index in range(16):
        row, col = divmod(index, 4)
        cell = rgba[
            row * BLAST_CELL : (row + 1) * BLAST_CELL,
            col * BLAST_CELL : (col + 1) * BLAST_CELL,
            3,
        ]
        if not cell.any():
            raise ValueError(f"{path.name}: empty frame {index}")
        gutter = int(
            max(
                cell[:BLAST_PAD].max(),
                cell[-BLAST_PAD:].max(),
                cell[:, :BLAST_PAD].max(),
                cell[:, -BLAST_PAD:].max(),
            )
        )
        if gutter:
            raise ValueError(f"{path.name}: alpha entered the {BLAST_PAD}px gutter in frame {index}")
        frames.append(
            {
                "nonempty": True,
                "alpha_fraction": float((cell > 0).mean()),
                "alpha_mean_visible": float(cell[cell > 0].mean()),
            }
        )
    return {
        "size": list(image.size),
        "bytes": path.stat().st_size,
        "gpu_bytes_rgba8": image.width * image.height * 4,
        "transparent_rgb_max": transparent_rgb_max,
        "frames": frames,
    }


def frame_metrics(image: Image.Image, row: int, col: int, content: int) -> dict[str, object]:
    frame = image.crop((col * CELL, row * CELL, (col + 1) * CELL, (row + 1) * CELL))
    alpha = np.asarray(frame.getchannel("A"), dtype=np.uint8)
    ys, xs = np.nonzero(alpha)
    if not len(xs):
        return {"nonempty": False}
    pad = (CELL - content) // 2
    return {
        "nonempty": True,
        "bbox": [int(xs.min()), int(ys.min()), int(xs.max() + 1), int(ys.max() + 1)],
        "alpha_fraction": float((alpha > 0).mean()),
        "edge_alpha_max": int(
            max(
                alpha[:pad].max(),
                alpha[-pad:].max(),
                alpha[:, :pad].max(),
                alpha[:, -pad:].max(),
            )
        ),
    }


def verify(path: Path, content: int) -> dict[str, object]:
    image = Image.open(path).convert("RGBA")
    if image.size != (ATLAS_SIZE, ATLAS_SIZE):
        raise ValueError(f"{path.name}: expected {ATLAS_SIZE}x{ATLAS_SIZE}, got {image.size}")
    pad = (CELL - content) // 2
    rgba = np.asarray(image, dtype=np.uint8)
    transparent_rgb_max = int(rgba[:, :, :3][rgba[:, :, 3] == 0].max(initial=0))
    frames = [frame_metrics(image, row, col, content) for row in range(4) for col in range(4)]
    if not all(frame["nonempty"] for frame in frames):
        raise ValueError(f"{path.name}: empty frame")
    if any(frame["edge_alpha_max"] for frame in frames):
        raise ValueError(f"{path.name}: alpha entered the {pad}px frame gutter")
    if transparent_rgb_max:
        raise ValueError(f"{path.name}: nonzero RGB outside alpha ({transparent_rgb_max})")
    return {
        "size": list(image.size),
        "bytes": path.stat().st_size,
        "gpu_bytes_rgba8": image.width * image.height * 4,
        "transparent_rgb_max": transparent_rgb_max,
        "frames": frames,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--verify-only", action="store_true")
    parser.add_argument("--blast-v2-only", action="store_true")
    parser.add_argument("--blast-v3-only", action="store_true")
    parser.add_argument("--blast-v4-only", action="store_true")
    parser.add_argument("--energy-v2-only", action="store_true")
    args = parser.parse_args()
    if args.blast_v2_only:
        target = OUT / BLAST_TARGET_V2
        if not args.verify_only:
            bake_blast_v2(BLAST_V2_SOURCE, target)
        report = {BLAST_TARGET_V2: verify_blast(target)}
        QA.mkdir(parents=True, exist_ok=True)
        (QA / "blast-v2-report.json").write_text(
            json.dumps(report, indent=2) + "\n", encoding="utf-8"
        )
        print(json.dumps({
            "target": BLAST_TARGET_V2,
            "bytes": report[BLAST_TARGET_V2]["bytes"],
            "gpu_bytes_rgba8": report[BLAST_TARGET_V2]["gpu_bytes_rgba8"],
        }, indent=2))
        return
    if args.blast_v3_only:
        target = OUT / BLAST_TARGET_V3
        if not args.verify_only:
            bake_blast_v3(BLAST_V3_SOURCE, target)
        report = {BLAST_TARGET_V3: verify_blast(target)}
        QA.mkdir(parents=True, exist_ok=True)
        (QA / "blast-v3-report.json").write_text(
            json.dumps(report, indent=2) + "\n", encoding="utf-8"
        )
        print(json.dumps({
            "target": BLAST_TARGET_V3,
            "bytes": report[BLAST_TARGET_V3]["bytes"],
            "gpu_bytes_rgba8": report[BLAST_TARGET_V3]["gpu_bytes_rgba8"],
        }, indent=2))
        return
    if args.blast_v4_only:
        target = OUT / BLAST_TARGET_V4
        if not args.verify_only:
            bake_blast_v4(BLAST_V4_SOURCE, target)
        report = {BLAST_TARGET_V4: verify_blast(target)}
        QA.mkdir(parents=True, exist_ok=True)
        (QA / "blast-v4-report.json").write_text(
            json.dumps(report, indent=2) + "\n", encoding="utf-8"
        )
        print(json.dumps({
            "target": BLAST_TARGET_V4,
            "bytes": report[BLAST_TARGET_V4]["bytes"],
            "gpu_bytes_rgba8": report[BLAST_TARGET_V4]["gpu_bytes_rgba8"],
        }, indent=2))
        return
    if args.energy_v2_only:
        target = OUT / ENERGY_TARGET_V2
        if not args.verify_only:
            bake_energy_v2(ENERGY_V2_SOURCE, target)
        report = {ENERGY_TARGET_V2: verify(target, CONTENT)}
        QA.mkdir(parents=True, exist_ok=True)
        (QA / "energy-v2-report.json").write_text(
            json.dumps(report, indent=2) + "\n", encoding="utf-8"
        )
        print(json.dumps({
            "target": ENERGY_TARGET_V2,
            "bytes": report[ENERGY_TARGET_V2]["bytes"],
            "gpu_bytes_rgba8": report[ENERGY_TARGET_V2]["gpu_bytes_rgba8"],
        }, indent=2))
        return
    if not args.verify_only:
        for source_name, target_name, neutral, recover_checker, frame_map, content, alpha_floor, style in SPECS:
            bake(SOURCE / source_name, OUT / target_name, neutral, recover_checker, frame_map, content, alpha_floor, style)
        bake_blast(BLAST_SOURCE, OUT / BLAST_TARGET)

    report = {target: verify(OUT / target, content) for _, target, _, _, _, content, _, _ in SPECS}
    report[BLAST_TARGET] = verify_blast(OUT / BLAST_TARGET)
    report["totals"] = {
        "package_bytes": sum(item["bytes"] for item in report.values()),
        "gpu_bytes_rgba8": sum(item["gpu_bytes_rgba8"] for item in report.values()),
        "atlas_count": len(SPECS),
        "atlas_size": ATLAS_SIZE,
        "cell_size": CELL,
        "gutter_px": PAD,
    }
    QA.mkdir(parents=True, exist_ok=True)
    (QA / "report.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report["totals"], indent=2))


if __name__ == "__main__":
    main()
