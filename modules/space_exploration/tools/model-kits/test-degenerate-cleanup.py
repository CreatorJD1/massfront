#!/usr/bin/env python3
"""Focused Blender fixture for working-copy-only degenerate-face removal."""

from __future__ import annotations

import hashlib
import importlib.util
import json
import math
import tempfile
from pathlib import Path

import bpy


TOOL_DIR = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location("massfront_model_kit_processor", TOOL_DIR / "process-model-kit.py")
PROCESSOR = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(PROCESSOR)


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def fixture_object(name: str):
    mesh = bpy.data.meshes.new(f"{name}_mesh")
    mesh.from_pydata(
        [(0, 0, 0), (2, 0, 0), (0, 2, 0), (4, 0, 0), (5, 0, 0), (6, 0, 0)],
        [],
        [(0, 1, 2), (3, 4, 5)],
    )
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def export_source(path: Path, obj: bpy.types.Object) -> None:
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.export_scene.gltf(
        filepath=str(path), export_format="GLB", use_selection=True, export_yup=True,
        export_apply=True, export_cameras=False, export_lights=False, export_materials="EXPORT",
    )


def main() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    obj = fixture_object("mixed_faces")
    valid_coordinates = [tuple(obj.data.vertices[index].co) for index in obj.data.polygons[0].vertices]
    with tempfile.TemporaryDirectory(prefix="mf-model-kit-degenerate-") as directory:
        source = Path(directory) / "immutable-source.glb"
        export_source(source, obj)
        source_hash = sha256(source)
        report = PROCESSOR.remove_degenerate_faces([obj])
        assert sha256(source) == source_hash

    assert report["before"]["triangles"] == 2
    assert report["before"]["zeroAreaTriangles"] == 1
    assert report["removed"] == {"degenerateFaces": 1, "triangles": 1, "vertices": 3}
    assert report["after"]["triangles"] == 1
    assert report["after"]["zeroAreaTriangles"] == 0
    assert report["after"]["invalidVertices"] == 0
    assert [tuple(vertex.co) for vertex in obj.data.vertices] == valid_coordinates

    nonfinite_mesh = bpy.data.meshes.new("nonfinite_mesh")
    nonfinite_mesh.from_pydata([(0, 0, 0), (1, 0, 0), (0, 1, 0)], [], [(0, 1, 2)])
    nonfinite_mesh.vertices[0].co.x = math.nan
    nonfinite = bpy.data.objects.new("nonfinite", nonfinite_mesh)
    bpy.context.scene.collection.objects.link(nonfinite)
    try:
        PROCESSOR.remove_degenerate_faces([nonfinite])
    except ValueError as error:
        assert "non-finite vertices before degenerate cleanup" in str(error)
    else:
        raise AssertionError("non-finite geometry was not rejected")

    print(json.dumps({
        "status": "PASS",
        "tests": 10,
        "cleanup": {"before": 1, "removed": 1, "after": 0},
        "sourceImmutable": True,
        "nonfiniteRejected": True,
    }, indent=2))


if __name__ == "__main__":
    main()
