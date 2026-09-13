#!/usr/bin/env python3
"""Generate a review-only Hunyuan3D 2.1 source candidate for Blender cleanup."""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import time
from pathlib import Path

from gradio_client import Client, handle_file
from huggingface_hub import get_token


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def result_path(value: object) -> Path:
    if isinstance(value, dict) and "value" in value:
        value = value["value"]
    path = Path(str(value))
    if not path.is_file():
        raise RuntimeError(f"Hugging Face result is not a file: {value!r}")
    return path


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("input", type=Path)
    parser.add_argument("output_dir", type=Path)
    parser.add_argument("--name", default="hunyuan3d21-source-candidate")
    parser.add_argument("--seed", type=int, default=174021)
    parser.add_argument("--target-faces", type=int, default=100_000)
    parser.add_argument("--steps", type=int, default=30)
    parser.add_argument("--octree-resolution", type=int, default=256)
    args = parser.parse_args()

    source = args.input.resolve(strict=True)
    output_dir = args.output_dir.resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    report_path = output_dir / f"{args.name}.report.json"
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
            "space": "tencent/Hunyuan3D-2.1",
            "seed": args.seed,
            "steps": args.steps,
            "octreeResolution": args.octree_resolution,
            "targetFaces": args.target_faces,
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

    try:
        client = Client(
            "tencent/Hunyuan3D-2.1",
            token=token,
            verbose=False,
            download_files=str(output_dir / ".hf-downloads"),
        )
        cached_shape = next((output_dir / ".hf-downloads").rglob("white_mesh.obj"), None)
        cached_textured = next((output_dir / ".hf-downloads").rglob("textured_mesh.glb"), None)
        if cached_shape and cached_textured:
            shape_file = cached_shape
            textured_file = cached_textured
            preview = None
            mesh_stats = {"source": "resumed-downloaded-generation"}
            used_seed = args.seed
            report["resumedGeneration"] = True
        else:
            shape_result, textured_result, preview, mesh_stats, used_seed = client.predict(
                handle_file(str(source)),
                None,
                None,
                None,
                None,
                args.steps,
                5.0,
                args.seed,
                args.octree_resolution,
                False,
                8000,
                False,
                api_name="/generation_all",
            )
            shape_file = result_path(shape_result)
            textured_file = result_path(textured_result)
        _, exported = client.predict(
            handle_file(str(shape_file)),
            handle_file(str(textured_file)),
            "glb",
            True,
            True,
            args.target_faces,
            api_name="/on_export_click",
        )
        export_source = result_path(exported)
        glb = output_dir / f"{args.name}.glb"
        shutil.copy2(export_source, glb)
        report.update(
            {
                "status": "source-candidate-generated",
                "elapsedSeconds": round(time.time() - started, 3),
                "previewReturned": bool(preview),
                "meshStats": mesh_stats,
                "usedSeed": used_seed,
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
    print(json.dumps({"glb": report["output"], "report": str(report_path)}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
