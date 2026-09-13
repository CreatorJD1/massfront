#!/usr/bin/env python3
"""Focused Blender fixture for fail-closed model-kit alpha sanitization."""

from __future__ import annotations

import importlib.util
import json
import struct
import tempfile
from pathlib import Path

import bpy


TOOL_DIR = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location("massfront_model_kit_processor", TOOL_DIR / "process-model-kit.py")
PROCESSOR = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(PROCESSOR)


def image(name: str, alphas: list[float]):
    value = bpy.data.images.new(name, width=2, height=2, alpha=True)
    pixels = []
    for alpha in alphas:
        pixels.extend((0.25, 0.5, 0.75, alpha))
    value.pixels.foreach_set(pixels)
    value.update()
    return value


def material(name: str, alpha_image=None, unsupported=False, blended=True):
    value = bpy.data.materials.new(name)
    value.use_nodes = True
    value.surface_render_method = "BLENDED" if blended else "DITHERED"
    nodes = value.node_tree.nodes
    nodes.clear()
    output = nodes.new("ShaderNodeOutputMaterial")
    principled = nodes.new("ShaderNodeBsdfPrincipled")
    value.node_tree.links.new(principled.outputs["BSDF"], output.inputs["Surface"])
    if alpha_image is not None:
        texture = nodes.new("ShaderNodeTexImage")
        texture.image = alpha_image
        value.node_tree.links.new(texture.outputs["Color"], principled.inputs["Base Color"])
        value.node_tree.links.new(texture.outputs["Alpha"], principled.inputs["Alpha"])
    elif unsupported:
        vertex = nodes.new("ShaderNodeVertexColor")
        value.node_tree.links.new(vertex.outputs["Alpha"], principled.inputs["Alpha"])
    else:
        principled.inputs["Alpha"].default_value = 1.0
    return value, principled


def mesh_object(name: str, value: bpy.types.Material):
    mesh = bpy.data.meshes.new(f"{name}_mesh")
    mesh.from_pydata([(0, 0, 0), (1, 0, 0), (0, 1, 0)], [], [(0, 1, 2)])
    mesh.materials.append(value)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def glb_alpha_mode(path: Path) -> str:
    data = path.read_bytes()
    json_length = struct.unpack_from("<I", data, 12)[0]
    document = json.loads(data[20:20 + json_length].decode("utf8").rstrip(" \0"))
    return document["materials"][0].get("alphaMode", "OPAQUE")


def export_one(path: Path, obj: bpy.types.Object) -> None:
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.export_scene.gltf(
        filepath=str(path), export_format="GLB", use_selection=True, export_yup=True,
        export_apply=True, export_cameras=False, export_lights=False, export_materials="EXPORT",
    )


def main() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    opaque_material, opaque_principled = material("opaque_atlas", image("opaque", [1, 1, 1, 1]))
    transparent_material, transparent_principled = material("transparent_atlas", image("transparent", [1, 0.5, 1, 1]))
    unknown_material, unknown_principled = material("vertex_alpha", unsupported=True)
    unchanged_material, _ = material("already_opaque", blended=False)
    objects = [
        mesh_object("opaque_object", opaque_material),
        mesh_object("transparent_object", transparent_material),
        mesh_object("unknown_object", unknown_material),
        mesh_object("unchanged_object", unchanged_material),
    ]

    report = PROCESSOR.sanitize_material_alpha(objects, {})
    records = {record["name"]: record for record in report["materials"]}
    assert records["opaque_atlas"]["decision"] == "FORCED_OPAQUE"
    assert records["opaque_atlas"]["proof"]["status"] == "FULLY_OPAQUE"
    assert opaque_material.surface_render_method == "DITHERED"
    assert not opaque_principled.inputs["Alpha"].is_linked
    assert opaque_principled.inputs["Alpha"].default_value == 1.0

    assert records["transparent_atlas"]["decision"] == "PRESERVED_BLEND"
    assert records["transparent_atlas"]["proof"]["status"] == "NON_OPAQUE"
    assert transparent_material.surface_render_method == "BLENDED"
    assert transparent_principled.inputs["Alpha"].is_linked

    assert records["vertex_alpha"]["decision"] == "PRESERVED_BLEND"
    assert records["vertex_alpha"]["proof"]["status"] == "UNKNOWN"
    assert unknown_material.surface_render_method == "BLENDED"
    assert unknown_principled.inputs["Alpha"].is_linked
    assert records["already_opaque"]["decision"] == "UNCHANGED"
    assert report["summary"] == {"total": 4, "forcedOpaque": 1, "preservedBlend": 2, "unchanged": 1}

    with tempfile.TemporaryDirectory(prefix="mf-model-kit-alpha-") as directory:
        opaque_path = Path(directory) / "opaque.glb"
        transparent_path = Path(directory) / "transparent.glb"
        export_one(opaque_path, objects[0])
        export_one(transparent_path, objects[1])
        assert glb_alpha_mode(opaque_path) == "OPAQUE"
        assert glb_alpha_mode(transparent_path) == "BLEND"

    print(json.dumps({"status": "PASS", "tests": 12, "summary": report["summary"]}, indent=2))


if __name__ == "__main__":
    main()
