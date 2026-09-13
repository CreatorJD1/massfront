#!/usr/bin/env python3
"""Generate a review-only TRELLIS.2 source candidate from an authored image.

This deliberately writes beneath an author-supplied source directory. Generated
meshes are not runtime-ready: Blender cleanup, sockets, collision, LODs, and
source-matched mobile evidence remain mandatory.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import time
from pathlib import Path

from gradio_client import Client, handle_file
from huggingface_hub import get_token
from PIL import Image


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def copy_result(result: object, destination: Path) -> Path:
    source = Path(str(result))
    if not source.is_file():
        raise RuntimeError(f"Generator result is not a file: {result!r}")
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, destination)
    return destination


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("input", type=Path)
    parser.add_argument("output_dir", type=Path)
    parser.add_argument("--name", default="trellis2-source-candidate")
    parser.add_argument("--seed", type=int, default=174021)
    parser.add_argument("--resolution", choices=("512", "1024", "1536"), default="1024")
    parser.add_argument("--decimation", type=int, default=100_000)
    parser.add_argument("--texture-size", type=int, default=2048)
    parser.add_argument("--keep-background", action="store_true")
    args = parser.parse_args()

    source = args.input.resolve(strict=True)
    output_dir = args.output_dir.resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    token = get_token()
    if not token:
        raise RuntimeError("Hugging Face authentication is required; no cached token was found")

    started = time.time()
    report: dict[str, object] = {
        "schema": "MassfrontHfSourceCandidateV1",
        "status": "generating",
        "runtimeAccepted": False,
        "input": {"path": str(source), "sha256": sha256(source), "bytes": source.stat().st_size},
        "generator": {
            "backgroundRemovalSpace": None if args.keep_background else "not-lain/background-removal",
            "modelSpace": "microsoft/TRELLIS.2",
            "seed": args.seed,
            "resolution": args.resolution,
            "decimationTarget": args.decimation,
            "textureSize": args.texture_size,
        },
        "requiredNextSteps": [
            "visual source-candidate review",
            "Blender topology and z-fighting repair",
            "meter normalization and modular socket authoring",
            "collision and unit-clearance authoring",
            "LOD0/1/2 and optional impostor creation",
            "phone tactical and command-zoom evidence",
        ],
    }

    report_path = output_dir / f"{args.name}.report.json"
    try:
        generation_input = source
        if not args.keep_background:
            remover = Client(
                "not-lain/background-removal",
                token=token,
                verbose=False,
                download_files=str(output_dir / ".hf-downloads" / "background"),
            )
            transparent_result = remover.predict(handle_file(str(source)), api_name="/png")
            generation_input = copy_result(transparent_result, output_dir / f"{args.name}-alpha.png")
            with Image.open(generation_input) as image:
                alpha_extrema = image.getchannel("A").getextrema() if "A" in image.getbands() else None
                report["backgroundRemoval"] = {
                    "mode": image.mode,
                    "size": list(image.size),
                    "alphaExtrema": list(alpha_extrema) if alpha_extrema else None,
                    "sha256": sha256(generation_input),
                }

        trellis = Client(
            "microsoft/TRELLIS.2",
            token=token,
            verbose=False,
            download_files=str(output_dir / ".hf-downloads" / "trellis2"),
        )
        trellis.predict(api_name="/start_session")
        processed = trellis.predict(handle_file(str(generation_input)), api_name="/preprocess_image")
        preview = trellis.predict(
            processed,
            args.seed,
            args.resolution,
            7.5,
            0.7,
            12,
            5.0,
            7.5,
            0.5,
            12,
            3.0,
            1.0,
            0.0,
            12,
            3.0,
            api_name="/image_to_3d",
        )
        extracted, download = trellis.predict(args.decimation, args.texture_size, api_name="/extract_glb")
        glb = copy_result(download or extracted, output_dir / f"{args.name}.glb")

        report.update(
            {
                "status": "source-candidate-generated",
                "elapsedSeconds": round(time.time() - started, 3),
                "previewReturned": bool(preview),
                "output": {"path": str(glb), "sha256": sha256(glb), "bytes": glb.stat().st_size},
            }
        )
    except Exception as error:
        report.update(
            {
                "status": "generation-failed",
                "elapsedSeconds": round(time.time() - started, 3),
                "errorType": type(error).__name__,
                "error": str(error),
            }
        )
        report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
        raise

    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"glb": str(glb), "report": str(report_path), "elapsedSeconds": report["elapsedSeconds"]}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
