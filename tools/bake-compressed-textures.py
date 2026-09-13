#!/usr/bin/env python3
"""Bake the material atlases to ONE universal KTX2 / Basis UASTC file each.

WHY UNIVERSAL
    The authored atlases are 2816x2816. As RGBA8 each costs 30.2 MB of VRAM and
    the three-map set costs ~90 MB before mips, which is why materials.js
    resampled to HALF RESOLUTION on mobile (uploadMatTex) - trading image
    quality for memory and paying a full-size decode plus a canvas resize.

    No GPU-native compressed format is universal: this project's D3D11 QA rig
    reports astc:false / etc:false but bptc:true, while phones are the reverse.
    Shipping one file per family means the format a device cannot use is either
    dead installer weight or a 404, and the mobile path can never be exercised
    on the desktop rig at all.

    KTX2 + Basis UASTC solves that: ONE asset transcodes at load to whatever the
    device actually supports - ASTC on phones, BC7 on desktop, ETC2 elsewhere,
    RGBA32 as a last resort. It is also SMALLER on the wire than the per-family
    ASTC set was, because KTX2 zstd-supercompresses the payload:

        map      per-family ASTC     universal UASTC
        albedo         2.52 MB            3.85 MB
        normal        10.08 MB            4.45 MB
        orm            2.52 MB            0.86 MB
        total         15.12 MB            9.16 MB

    Cost: a ~571 KB transcoder (assets/basis) and CPU to transcode at load.

QUALITY
    UASTC is a fixed 8 bpp intermediate, so unlike raw ASTC there is no per-map
    block-size decision to get wrong. It matters that there ISN'T one here: at
    ASTC 8x8 the normal map measured 35.7 dB with maxErr 149 and visibly shifted
    shading, while albedo and the packed ORM were fine. UASTC sidesteps that
    whole trap by keeping every map at the high-quality tier.

Usage:
    python tools/bake-compressed-textures.py
    python tools/bake-compressed-textures.py --report   # show commands only
"""
from __future__ import annotations

import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BASISU = ROOT / "node_modules" / "basis_universal" / "bin" / (
    "basisu.exe" if sys.platform == "win32" else "basisu")

# ONLY the building-v3 triplet. pack-www.mjs deliberately drops the legacy
# mat-albedo/normal/orm PNGs from the APK ("one generation, atomically"), so
# baking compressed copies of them would ship megabytes the runtime never reads.
#   name -> srgb
TARGETS = {
    "mat-albedo-building-v3.png": True,    # colour -> sRGB
    "mat-normal-building-v3.png": False,   # packed vectors -> linear
    "mat-orm-building-v3.png": False,      # packed AO/gloss/emissive/metal
}


def bake(name: str, srgb: bool, report_only: bool) -> bool:
    source = ROOT / "assets" / "textures" / name
    if not source.exists():
        print("  SKIP %s (not present)" % name)
        return True
    out = source.with_suffix(".ktx2")
    started = time.time()

    # -ktx2 already Zstandard-compresses UASTC payloads by default; there is no
    # -ktx2_zstandard flag (only -ktx2_no_zstandard to turn it off).
    # NO -y_flip. The PNG path uploads images with UNPACK_FLIP_Y_WEBGL false,
    # so texture row 0 is the image's TOP row. Flipping here would mirror the
    # atlas vertically against the 11x11 tile mapping the shader expects.
    cmd = [str(BASISU), "-uastc", "-uastc_level", "2", "-ktx2",
           "-mipmap", "-output_file", str(out), str(source)]
    if not srgb:
        # Linear data (normals, packed ORM) must not be treated as colour.
        cmd.insert(1, "-linear")

    if report_only:
        print("  %-32s would run: basisu %s" % (name, " ".join(cmd[1:7])))
        return True

    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0 or not out.exists():
        tail = (result.stderr or result.stdout).strip().splitlines()[-1:]
        print("  FAIL %s: %s" % (name, tail))
        return False

    raw_rgba = 2816 * 2816 * 4
    size = out.stat().st_size
    print("  %-32s %-6s -> %-34s %5.2f MB  (%4.1fx vs RGBA)  (%.0fs)" % (
        name, "sRGB" if srgb else "linear", out.name,
        size / 1048576.0, raw_rgba / float(size), time.time() - started))
    return True


def main() -> int:
    if not BASISU.exists():
        print("basisu not found at %s\nRun: npm install --save-dev basis_universal" % BASISU)
        return 3
    report_only = "--report" in sys.argv
    print("universal KTX2 / Basis UASTC bake" + ("  [report only]" if report_only else ""))
    ok = True
    for name, srgb in TARGETS.items():
        ok = bake(name, srgb, report_only) and ok
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
