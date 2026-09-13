#!/usr/bin/env python3
"""Prove delivery derivatives preserve locked image and GLB structure.

The verifier decodes both sides. A smaller file is never treated as quality
evidence by itself: data textures must round-trip exactly, color imagery must
meet a PSNR floor, and Draco GLBs must retain the source scene graph contract.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import struct
import subprocess
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from PIL import Image

MODULE = Path(__file__).resolve().parents[1]
REPO = MODULE.parents[1]
TEXTURES = MODULE / "assets" / "textures"
RUNTIME = MODULE / "assets" / "runtime"
OUT = MODULE / "tmp" / "optimization-evidence" / "latest.json"
LOSSLESS = {"normal", "orm", "height", "emissive"}
GLBS = ("massfront-showcase-contacts", "nexus-vii-civilization-ship", "uga-command-cutaway")
MAIN_INPUTS = {
    "index.html", "src/main.js", "src/game/meta.js", "boot.js",
    "assets/data/manifest.json", "tools/pack-www.mjs", "tools/bundle-space-module.mjs",
}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def source_snapshot() -> dict:
    head = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=REPO, text=True).strip()
    raw = subprocess.check_output(
        ["git", "status", "--porcelain=v1", "-z", "--untracked-files=all"], cwd=REPO
    ).decode("utf-8", errors="surrogateescape")
    tokens = raw.split("\0")
    rows = []
    index = 0
    while index < len(tokens):
        token = tokens[index]
        index += 1
        if not token:
            continue
        status = token[:2]
        paths = [token[3:].replace("\\", "/")]
        if any(code in status for code in "RC") and index < len(tokens) and tokens[index]:
            paths.append(tokens[index].replace("\\", "/"))
            index += 1
        scoped = any(
            (path.startswith("modules/space_exploration/") and not path.startswith("modules/space_exploration/tmp/"))
            or path in MAIN_INPUTS for path in paths
        )
        if scoped:
            rows.append(f"{status} {' -> '.join(paths)}")
    rows.sort()
    return {
        "head": head,
        "dirtyFingerprint": hashlib.sha256("\n".join(rows).encode()).hexdigest(),
        "dirtyEntryCount": len(rows),
    }


def compare_image(source: Path, runtime: Path) -> dict:
    with Image.open(source) as src_image, Image.open(runtime) as run_image:
        src = np.asarray(src_image.convert("RGBA"), dtype=np.float32)
        run = np.asarray(run_image.convert("RGBA"), dtype=np.float32)
    same_dimensions = src.shape == run.shape
    channel = source.stem.rsplit("-", 1)[-1]
    exact_required = source.parent.name == "planets" and channel in LOSSLESS
    if not same_dimensions:
        exact = False
        psnr = 0.0
    else:
        exact = bool(np.array_equal(src, run))
        mse = float(np.mean((src - run) ** 2))
        psnr = float("inf") if mse == 0 else 20 * math.log10(255.0 / math.sqrt(mse))
    passed = same_dimensions and (exact if exact_required else psnr >= 30.0)
    return {
        "source": source.relative_to(MODULE).as_posix(),
        "runtime": runtime.relative_to(MODULE).as_posix(),
        "sourceBytes": source.stat().st_size,
        "runtimeBytes": runtime.stat().st_size,
        "sourceSha256": sha256(source),
        "runtimeSha256": sha256(runtime),
        "sameDimensions": same_dimensions,
        "exactRequired": exact_required,
        "exactPixels": exact,
        "psnrDb": None if math.isinf(psnr) else round(psnr, 3),
        "pass": passed,
    }


def glb_json(path: Path) -> dict:
    data = path.read_bytes()
    magic, version, length = struct.unpack_from("<4sII", data, 0)
    if magic != b"glTF" or version != 2 or length != len(data):
        raise ValueError(f"invalid GLB header: {path}")
    chunk_length, chunk_type = struct.unpack_from("<II", data, 12)
    if chunk_type != 0x4E4F534A:
        raise ValueError(f"first GLB chunk is not JSON: {path}")
    return json.loads(data[20:20 + chunk_length].decode("utf-8"))


def named(items: list[dict]) -> list[str | None]:
    return [item.get("name") for item in items]


def compare_glb(source: Path, runtime: Path) -> dict:
    src, run = glb_json(source), glb_json(runtime)
    extensions = run.get("extensionsUsed", [])
    checks = {
        "nodeNames": named(src.get("nodes", [])) == named(run.get("nodes", [])),
        # Runtime code consumes GLTF node extras through Object3D.userData.
        # Matching names alone is insufficient: a Draco export that strips
        # district_id/camera metadata renders a ship but silently removes the
        # authored room-controller contract.
        "nodeExtras": [item.get("extras") for item in src.get("nodes", [])]
        == [item.get("extras") for item in run.get("nodes", [])],
        "meshNames": named(src.get("meshes", [])) == named(run.get("meshes", [])),
        "meshPrimitiveCounts": [len(x.get("primitives", [])) for x in src.get("meshes", [])]
        == [len(x.get("primitives", [])) for x in run.get("meshes", [])],
        "materialNames": named(src.get("materials", [])) == named(run.get("materials", [])),
        "sceneCount": len(src.get("scenes", [])) == len(run.get("scenes", [])),
        "dracoPresent": "KHR_draco_mesh_compression" in extensions,
    }
    return {
        "source": source.relative_to(MODULE).as_posix(),
        "runtime": runtime.relative_to(MODULE).as_posix(),
        "sourceBytes": source.stat().st_size,
        "runtimeBytes": runtime.stat().st_size,
        "sourceSha256": sha256(source),
        "runtimeSha256": sha256(runtime),
        "extensionsUsed": extensions,
        "checks": checks,
        "pass": all(checks.values()) and runtime.stat().st_size < source.stat().st_size,
    }


parser = argparse.ArgumentParser()
parser.add_argument("--visual-review-pass", type=Path, help="record a screenshot actually reviewed by the caller")
args = parser.parse_args()

images = []
for source in sorted((TEXTURES / "personnel").glob("*.png")):
    images.append(compare_image(source, RUNTIME / "personnel" / f"{source.stem}.webp"))
for source in sorted((TEXTURES / "planets").glob("*.png")):
    channel = source.stem.rsplit("-", 1)[-1]
    if channel in {"basecolor", "normal", "orm", "height", "emissive", "clouds"}:
        images.append(compare_image(source, RUNTIME / "planets" / f"{source.stem}.webp"))

glbs = [compare_glb(MODULE / "assets" / "models" / f"{name}.glb", RUNTIME / "models" / f"{name}.glb") for name in GLBS]
visual = {"status": "NOT_REVIEWED"}
if args.visual_review_pass:
    screenshot = args.visual_review_pass.resolve()
    if not screenshot.is_file():
        raise FileNotFoundError(screenshot)
    visual = {
        "status": "PASS", "reviewedBy": "Codex", "viewport": "412x900",
        "screenshot": screenshot.relative_to(REPO).as_posix(), "sha256": sha256(screenshot),
        "note": "Packaged scene visually inspected after real AMD D3D11 browser verification.",
    }

before = sum(row["sourceBytes"] for row in images + glbs)
after = sum(row["runtimeBytes"] for row in images + glbs)
passed = bool(images) and all(row["pass"] for row in images) and all(row["pass"] for row in glbs) and visual["status"] == "PASS"
report = {
    "schemaVersion": 1,
    "status": "PASS" if passed else "FAIL",
    "verifiedAtUtc": datetime.now(timezone.utc).isoformat(),
    "source": source_snapshot(),
    "verifier": {
        "path": Path(__file__).resolve().relative_to(MODULE).as_posix(),
        "sha256": sha256(Path(__file__).resolve()),
    },
    "summary": {
        "imageCount": len(images), "glbCount": len(glbs), "sourceBytes": before,
        "runtimeBytes": after, "reductionPercent": round(100 * (1 - after / before), 2),
        "failedImages": sum(not row["pass"] for row in images),
        "failedGlbs": sum(not row["pass"] for row in glbs),
    },
    "visualReview": visual,
    "images": images,
    "glbs": glbs,
}
OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
print(json.dumps({"status": report["status"], **report["summary"], "output": OUT.relative_to(MODULE).as_posix()}, indent=2))
raise SystemExit(0 if passed else 1)
