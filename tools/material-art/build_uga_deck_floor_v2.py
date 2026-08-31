"""Build a deterministic, seam-closed 2K PBR deck-floor candidate.

This is deliberately a single material rather than a texture-board collage.  The
tile represents a four-metre pressure deck module and is staged for review before
the ship GLB is rebuilt.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image


SIZE = 2048
CORE = SIZE - 1
TILE_METRES = 4.0
SEED = 731947


def smoothstep(value: np.ndarray) -> np.ndarray:
    return value * value * (3.0 - 2.0 * value)


def periodic_noise(cells: int, rng: np.random.Generator) -> np.ndarray:
    grid = rng.random((cells, cells), dtype=np.float32)
    axis = np.arange(CORE, dtype=np.float32) * (cells / CORE)
    base = np.floor(axis).astype(np.int32)
    frac = smoothstep(axis - base)
    nxt = (base + 1) % cells
    base %= cells
    a = grid[base[:, None], base[None, :]]
    b = grid[base[:, None], nxt[None, :]]
    c = grid[nxt[:, None], base[None, :]]
    d = grid[nxt[:, None], nxt[None, :]]
    x0 = a * (1.0 - frac[None, :]) + b * frac[None, :]
    x1 = c * (1.0 - frac[None, :]) + d * frac[None, :]
    return x0 * (1.0 - frac[:, None]) + x1 * frac[:, None]


def close_tile(values: np.ndarray) -> np.ndarray:
    shape = (SIZE, SIZE) + values.shape[2:]
    result = np.empty(shape, dtype=values.dtype)
    result[:-1, :-1] = values
    result[-1, :-1] = values[0]
    result[:-1, -1] = values[:, 0]
    result[-1, -1] = values[0, 0]
    return result


def signed_panel_distance(u: np.ndarray, v: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    panels = 4.0
    local_u = np.mod(u * panels, 1.0)
    local_v = np.mod(v * panels, 1.0)
    edge_u = np.minimum(local_u, 1.0 - local_u)
    edge_v = np.minimum(local_v, 1.0 - local_v)
    seam = np.minimum(edge_u, edge_v)

    # Rounded/chamfered access-panel corners prevent the surface reading as a
    # generic square grid while keeping all geometry periodic.
    corner_u = np.maximum(0.0, 0.095 - edge_u)
    corner_v = np.maximum(0.0, 0.095 - edge_v)
    chamfer = np.hypot(corner_u, corner_v)
    return seam, chamfer, local_u


def build(output: Path) -> dict[str, object]:
    output.mkdir(parents=True, exist_ok=True)
    rng = np.random.default_rng(SEED)
    axis = np.arange(CORE, dtype=np.float32) / CORE
    u, v = np.meshgrid(axis, axis)
    seam, chamfer, local_u = signed_panel_distance(u, v)

    broad = periodic_noise(8, rng)
    medium = periodic_noise(32, rng)
    fine = periodic_noise(128, rng)

    cell_x = np.floor(u * 4.0).astype(np.int32)
    cell_y = np.floor(v * 4.0).astype(np.int32)
    cell_variation = np.array(
        [
            [-0.012, 0.008, -0.004, 0.014],
            [0.010, -0.006, 0.006, -0.010],
            [-0.003, 0.013, -0.011, 0.005],
            [0.007, -0.009, 0.012, -0.005],
        ],
        dtype=np.float32,
    )[cell_y, cell_x]

    seam_mask = 1.0 - smoothstep(np.clip(seam / 0.014, 0.0, 1.0))
    inner_bevel = 1.0 - smoothstep(np.clip(np.abs(seam - 0.018) / 0.011, 0.0, 1.0))
    chamfer_mask = smoothstep(np.clip(chamfer / 0.055, 0.0, 1.0))
    seam_mask = np.maximum(seam_mask, seam_mask * chamfer_mask)

    # Sparse, physical fasteners near panel corners.  Their placement repeats
    # only at the complete four-metre tile boundary.
    lu = np.mod(u * 4.0, 1.0)
    lv = np.mod(v * 4.0, 1.0)
    bolt = np.zeros_like(u)
    for px in (0.085, 0.915):
        for py in (0.085, 0.915):
            bolt = np.maximum(bolt, 1.0 - smoothstep(np.clip(np.hypot(lu - px, lv - py) / 0.018, 0.0, 1.0)))

    # Fine raised anti-slip stipple is confined to alternating service plates.
    service_cell = ((cell_x + 2 * cell_y) % 5 == 0).astype(np.float32)
    stipple_wave = np.sin((u * CORE) * np.pi / 5.5) * np.sin((v * CORE) * np.pi / 5.5)
    stipple = service_cell * smoothstep(np.clip((stipple_wave - 0.55) * 2.7, 0.0, 1.0))

    height = 0.57 + (broad - 0.5) * 0.018 + (medium - 0.5) * 0.012 + (fine - 0.5) * 0.004
    height -= seam_mask * 0.095
    height += inner_bevel * 0.017
    height += bolt * 0.026 + stipple * 0.006
    height = np.clip(height, 0.0, 1.0)

    base = np.array([0.255, 0.277, 0.296], dtype=np.float32)
    colour = base[None, None, :] + cell_variation[..., None]
    colour += (broad - 0.5)[..., None] * np.array([0.020, 0.022, 0.024], dtype=np.float32)
    colour += (fine - 0.5)[..., None] * 0.016
    colour *= (1.0 - seam_mask[..., None] * 0.33)
    colour += inner_bevel[..., None] * 0.020
    colour += bolt[..., None] * np.array([0.105, 0.094, 0.070], dtype=np.float32)

    # Narrow, non-directional amber locator inserts: not painted lighting.
    locator_x = 1.0 - smoothstep(np.clip(np.abs(lu - 0.5) / 0.075, 0.0, 1.0))
    locator_y = 1.0 - smoothstep(np.clip(np.abs(lv - 0.065) / 0.016, 0.0, 1.0))
    locator = locator_x * locator_y * (((cell_x * 3 + cell_y) % 7) == 0)
    colour = colour * (1.0 - locator[..., None] * 0.55) + locator[..., None] * np.array([0.55, 0.35, 0.09])
    colour = np.clip(colour, 0.035, 0.72)

    dx = np.roll(height, -1, axis=1) - np.roll(height, 1, axis=1)
    dy = np.roll(height, -1, axis=0) - np.roll(height, 1, axis=0)
    strength = 5.2
    nx = -dx * strength
    ny = dy * strength
    nz = np.ones_like(height)
    inv_len = 1.0 / np.sqrt(nx * nx + ny * ny + nz * nz)
    normal = np.stack((nx * inv_len * 0.5 + 0.5, ny * inv_len * 0.5 + 0.5, nz * inv_len * 0.5 + 0.5), axis=-1)

    roughness = 0.66 + (medium - 0.5) * 0.10 + (fine - 0.5) * 0.06
    roughness += seam_mask * 0.11 + stipple * 0.07
    roughness -= bolt * 0.19 + locator * 0.24
    roughness = np.clip(roughness, 0.38, 0.88)
    metallic = np.clip(0.64 - seam_mask * 0.10 + bolt * 0.25 - locator * 0.38, 0.20, 0.92)
    ao = np.clip(1.0 - seam_mask * 0.34 - chamfer * 0.09, 0.55, 1.0)
    emissive = locator[..., None] * np.array([1.0, 0.43, 0.055], dtype=np.float32)

    albedo = close_tile(colour)
    normal_closed = close_tile(normal)
    rough_closed = close_tile(roughness)
    ao_closed = close_tile(ao)
    metal_closed = close_tile(metallic)
    emissive_closed = close_tile(emissive)
    height_closed = close_tile(height)

    albedo_u8 = np.round(albedo * 255.0).astype(np.uint8)
    normal_u8 = np.round(normal_closed * 255.0).astype(np.uint8)
    rough_u8 = np.round(rough_closed * 255.0).astype(np.uint8)
    normal_rough = np.dstack((normal_u8, rough_u8))
    orm = np.dstack((np.round(ao_closed * 255.0), rough_u8, np.round(metal_closed * 255.0))).astype(np.uint8)
    emissive_u8 = np.round(emissive_closed * 255.0).astype(np.uint8)
    height_u8 = np.round(height_closed * 255.0).astype(np.uint8)

    files = {
        "albedo": output / "uga-deck-floor-v2-albedo.png",
        "normal_rough": output / "uga-deck-floor-v2-normal-rough.png",
        "orm": output / "uga-deck-floor-v2-orm.png",
        "emissive": output / "uga-deck-floor-v2-emissive.png",
        "height": output / "uga-deck-floor-v2-height.png",
    }
    Image.fromarray(albedo_u8, "RGB").save(files["albedo"], optimize=True)
    Image.fromarray(normal_rough, "RGBA").save(files["normal_rough"], optimize=True)
    Image.fromarray(orm, "RGB").save(files["orm"], optimize=True)
    Image.fromarray(emissive_u8, "RGB").save(files["emissive"], optimize=True)
    Image.fromarray(height_u8, "L").save(files["height"], optimize=True)

    tiled = np.tile(albedo_u8, (3, 3, 1))
    preview = Image.fromarray(tiled, "RGB").resize((1536, 1536), Image.Resampling.LANCZOS)
    preview_path = output / "uga-deck-floor-v2-3x3-seam-proof.png"
    preview.save(preview_path, optimize=True)

    def edge_metrics(array: np.ndarray) -> dict[str, float | int]:
        horizontal = np.abs(array[:, 0].astype(np.int16) - array[:, -1].astype(np.int16))
        vertical = np.abs(array[0].astype(np.int16) - array[-1].astype(np.int16))
        return {
            "max": int(max(horizontal.max(initial=0), vertical.max(initial=0))),
            "mean": float((horizontal.mean() + vertical.mean()) * 0.5),
        }

    metrics = {
        "material": "uga-deck-floor-v2",
        "status": "staging_candidate_not_runtime",
        "dimensions": [SIZE, SIZE],
        "tile_meters": TILE_METRES,
        "seed": SEED,
        "channels": {
            "albedo": "RGB lighting-neutral sRGB",
            "normal_rough": "normal XYZ in RGB; linear roughness in A",
            "orm": "linear AO/Roughness/Metallic in RGB",
            "emissive": "RGB sRGB locator inserts only",
            "height": "linear L; authoring only",
        },
        "edge_metrics": {
            "albedo": edge_metrics(albedo_u8),
            "normal_rough": edge_metrics(normal_rough),
            "orm": edge_metrics(orm),
            "emissive": edge_metrics(emissive_u8),
            "height": edge_metrics(height_u8),
        },
        "files": {},
        "promotion_gate": "Rebuild UGA GLB and approve source-matched phone capture before runtime use.",
    }
    for role, path in files.items():
        metrics["files"][role] = {
            "path": path.name,
            "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
            "bytes": path.stat().st_size,
        }
    metrics["files"]["seam_proof"] = {
        "path": preview_path.name,
        "sha256": hashlib.sha256(preview_path.read_bytes()).hexdigest(),
        "bytes": preview_path.stat().st_size,
    }
    report_path = output / "uga-deck-floor-v2-report.json"
    report_path.write_text(json.dumps(metrics, indent=2) + "\n", encoding="utf-8")
    return metrics


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    report = build(args.output)
    print(json.dumps(report, indent=2))
    if any(entry["max"] != 0 for entry in report["edge_metrics"].values()):
        raise SystemExit("seam closure failed")


if __name__ == "__main__":
    main()
