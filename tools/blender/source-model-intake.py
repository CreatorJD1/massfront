"""Normalize a generated GLB into a truthful, source-only authoring model.

This script is intentionally driven by tools/source-model-intake.mjs. Blender
does the scene-aware work; the Node wrapper owns path safety, atomic output,
hashing, and the stable report contract.
"""

import bpy
import json
import math
import os
import re
import sys


def args_after_separator():
    if "--" not in sys.argv:
        raise SystemExit("expected -- CONFIG.json RESULT.json")
    values = sys.argv[sys.argv.index("--") + 1 :]
    if len(values) != 2:
        raise SystemExit("expected CONFIG.json and RESULT.json")
    return values


def round_vec(values):
    return [round(float(value), 7) for value in values]


def mesh_objects():
    return [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]


def logical_bounds(meshes):
    """Return glTF Y-up bounds from Blender's Z-up authoring coordinates."""
    bx_min = by_min = bz_min = math.inf
    bx_max = by_max = bz_max = -math.inf
    for obj in meshes:
        for vertex in obj.data.vertices:
            point = obj.matrix_world @ vertex.co
            bx_min = min(bx_min, point.x)
            bx_max = max(bx_max, point.x)
            by_min = min(by_min, point.y)
            by_max = max(by_max, point.y)
            bz_min = min(bz_min, point.z)
            bz_max = max(bz_max, point.z)
    if not math.isfinite(bx_min):
        raise RuntimeError("no mesh bounds are available")
    # Blender glTF export_yup maps (X,Y,Z) to (X,Z,-Y).
    minimum = [bx_min, bz_min, -by_max]
    maximum = [bx_max, bz_max, -by_min]
    dimensions = [
        maximum[0] - minimum[0],
        maximum[1] - minimum[1],
        maximum[2] - minimum[2],
    ]
    return {
        "min": round_vec(minimum),
        "max": round_vec(maximum),
        "dimensions": round_vec(dimensions),
        "center": round_vec([
            (minimum[0] + maximum[0]) * 0.5,
            (minimum[1] + maximum[1]) * 0.5,
            (minimum[2] + maximum[2]) * 0.5,
        ]),
    }


def scene_stats(meshes):
    triangles = 0
    vertices = 0
    material_names = []
    material_seen = set()
    for obj in meshes:
        vertices += len(obj.data.vertices)
        obj.data.calc_loop_triangles()
        triangles += len(obj.data.loop_triangles)
        for material in obj.data.materials:
            name = material.name if material else ""
            if name and name not in material_seen:
                material_seen.add(name)
                material_names.append(name)
    return {
        "meshCount": len(meshes),
        "meshNames": [obj.name for obj in meshes],
        "vertices": vertices,
        "triangles": triangles,
        "materialCount": len(material_names),
        "materialNames": material_names,
        "imageCount": len(bpy.data.images),
        "bounds": logical_bounds(meshes),
    }


def used_materials(meshes):
    found = []
    seen = set()
    for obj in meshes:
        for slot in obj.material_slots:
            material = slot.material
            if material is not None and material.as_pointer() not in seen:
                seen.add(material.as_pointer())
                found.append(material)
    return found


def alpha_graph_evidence(meshes):
    """Describe alpha-node provenance without changing the imported material.

    The Node wrapper performs the final GLB proof and metadata rewrite. This
    scene-level evidence prevents an opaque-looking texture from overriding
    vertex or procedural alpha authored in Blender's imported node graph.
    """
    evidence = []
    for material in used_materials(meshes):
        entry = {
            "materialName": material.name,
            "surfaceRenderMethod": getattr(material, "surface_render_method", None),
            "alphaInputFound": False,
            "alphaInputLinked": False,
            "alphaDefault": None,
            "directImageAlpha": False,
            "imageNames": [],
            "vertexAlpha": False,
            "proceduralOrUnknownAlpha": False,
            "sourceNodes": [],
        }
        tree = material.node_tree if material.use_nodes else None
        if tree is None:
            entry["proceduralOrUnknownAlpha"] = True
            entry["reason"] = "material has no inspectable node tree"
            evidence.append(entry)
            continue
        principled = [node for node in tree.nodes if node.type == "BSDF_PRINCIPLED"]
        if not principled:
            entry["proceduralOrUnknownAlpha"] = True
            entry["reason"] = "material has no Principled BSDF alpha input"
            evidence.append(entry)
            continue
        alpha_inputs = [node.inputs.get("Alpha") for node in principled if node.inputs.get("Alpha") is not None]
        entry["alphaInputFound"] = bool(alpha_inputs)
        if not alpha_inputs:
            entry["proceduralOrUnknownAlpha"] = True
            entry["reason"] = "Principled BSDF has no Alpha socket"
            evidence.append(entry)
            continue
        defaults = []
        linked_sources = []
        for alpha_input in alpha_inputs:
            try:
                defaults.append(float(alpha_input.default_value))
            except (TypeError, ValueError):
                pass
            for link in alpha_input.links:
                linked_sources.append(link)
        entry["alphaDefault"] = min(defaults) if defaults else None
        entry["alphaInputLinked"] = bool(linked_sources)
        if not linked_sources:
            entry["reason"] = "constant Principled alpha"
            evidence.append(entry)
            continue

        for link in linked_sources:
            node = link.from_node
            descriptor = {
                "nodeName": node.name,
                "nodeType": node.bl_idname,
                "socket": link.from_socket.name,
            }
            if node.type == "TEX_IMAGE" and link.from_socket.name == "Alpha" and getattr(node, "image", None):
                entry["directImageAlpha"] = True
                descriptor["imageName"] = node.image.name
                entry["imageNames"].append(node.image.name)
            elif node.type in {"VERTEX_COLOR", "ATTRIBUTE"}:
                entry["vertexAlpha"] = True
            else:
                entry["proceduralOrUnknownAlpha"] = True
            entry["sourceNodes"].append(descriptor)
        entry["imageNames"] = sorted(set(entry["imageNames"]))
        if entry["proceduralOrUnknownAlpha"]:
            entry["reason"] = "alpha graph contains a procedural or unsupported source"
        elif entry["vertexAlpha"]:
            entry["reason"] = "alpha graph reads vertex/attribute data"
        elif entry["directImageAlpha"]:
            entry["reason"] = "alpha is sourced directly from an image texture"
        else:
            entry["reason"] = "linked alpha source could not be classified"
        evidence.append(entry)
    return evidence


def matches_name(name, exact_names, regexes):
    folded = name.casefold()
    if folded in exact_names:
        return True
    return any(regex.search(name) for regex in regexes)


def descendants(root):
    found = []
    stack = list(root.children)
    while stack:
        child = stack.pop()
        found.append(child)
        stack.extend(child.children)
    return found


def remove_contamination(config):
    exact_names = {name.casefold() for name in config.get("removeNames", [])}
    regexes = [re.compile(pattern, re.IGNORECASE) for pattern in config.get("removeRegex", [])]
    remove_types = {value.upper() for value in config.get("removeTypes", [])}
    removal = set()
    reasons = {}
    for obj in list(bpy.data.objects):
        reason = None
        if obj.type.upper() in remove_types:
            reason = "type:" + obj.type.upper()
        elif matches_name(obj.name, exact_names, regexes):
            reason = "name"
        if reason:
            removal.add(obj)
            reasons[obj.name] = reason
            for child in descendants(obj):
                removal.add(child)
                reasons.setdefault(child.name, "descendant:" + obj.name)
    removed = []
    for obj in sorted(removal, key=lambda item: item.name):
        removed.append({"name": obj.name, "type": obj.type, "reason": reasons[obj.name]})
        bpy.data.objects.remove(obj, do_unlink=True)
    return removed


def bake_world_transforms(meshes):
    # Generated scenes often wrap intended meshes in scaled empties. Detaching
    # with matrix_world preserved keeps the visible result while preventing
    # studio wrappers from leaking into the source model.
    for obj in meshes:
        world_matrix = obj.matrix_world.copy()
        obj.parent = None
        obj.matrix_world = world_matrix
        if obj.data.users > 1:
            obj.data = obj.data.copy()
    bpy.ops.object.select_all(action="DESELECT")
    for obj in meshes:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)


def normalize(meshes, target, fit_mode):
    before = logical_bounds(meshes)
    dimensions = before["dimensions"]
    if any(not math.isfinite(value) or value <= 1e-9 for value in dimensions):
        raise RuntimeError("source bounds are empty or non-finite")
    requested = [float(value) for value in target]
    ratios = [requested[index] / dimensions[index] for index in range(3)]
    if fit_mode == "uniform":
        factor = min(ratios)
        logical_scale = [factor, factor, factor]
    elif fit_mode == "exact":
        logical_scale = ratios
    else:
        raise RuntimeError("fitMode must be exact or uniform")

    # World transforms have already been baked, so all mesh data uses a shared
    # coordinate frame. In Blender: logical X=X, logical Y=Z, logical Z=-Y.
    bx_min = by_min = bz_min = math.inf
    bx_max = by_max = bz_max = -math.inf
    for obj in meshes:
        for vertex in obj.data.vertices:
            point = vertex.co
            bx_min = min(bx_min, point.x)
            bx_max = max(bx_max, point.x)
            by_min = min(by_min, point.y)
            by_max = max(by_max, point.y)
            bz_min = min(bz_min, point.z)
            bz_max = max(bz_max, point.z)
    center_x = (bx_min + bx_max) * 0.5
    center_y = (by_min + by_max) * 0.5
    floor_z = bz_min
    scale_x = logical_scale[0]
    scale_y = logical_scale[2]
    scale_z = logical_scale[1]
    for obj in meshes:
        for vertex in obj.data.vertices:
            vertex.co.x = (vertex.co.x - center_x) * scale_x
            vertex.co.y = (vertex.co.y - center_y) * scale_y
            vertex.co.z = (vertex.co.z - floor_z) * scale_z
        obj.data.update()
    return {
        "fitMode": fit_mode,
        "logicalScale": round_vec(logical_scale),
        "before": before,
        "after": logical_bounds(meshes),
    }


def main():
    config_path, result_path = args_after_separator()
    with open(config_path, "r", encoding="utf-8") as handle:
        config = json.load(handle)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=config["inputPath"])
    imported_meshes = mesh_objects()
    imported = scene_stats(imported_meshes) if imported_meshes else {"meshCount": 0}
    imported_objects = [
        {"name": obj.name, "type": obj.type}
        for obj in sorted(bpy.context.scene.objects, key=lambda item: item.name)
    ]

    removed = remove_contamination(config)
    meshes = mesh_objects()
    if not meshes:
        raise RuntimeError("no intended mesh remains after contamination removal")
    bake_world_transforms(meshes)
    normalization = normalize(meshes, config["targetBoundsM"], config["fitMode"])

    bpy.ops.object.select_all(action="DESELECT")
    for obj in meshes:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    os.makedirs(os.path.dirname(config["stagedOutputPath"]), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=config["stagedOutputPath"],
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_materials="EXPORT",
        export_cameras=False,
        export_lights=False,
        export_yup=True,
    )

    result = {
        "importedObjects": imported_objects,
        "imported": imported,
        "removed": removed,
        "normalization": normalization,
        "exported": scene_stats(meshes),
        "materialAlphaGraphs": alpha_graph_evidence(meshes),
    }
    with open(result_path, "w", encoding="utf-8") as handle:
        json.dump(result, handle, indent=2)
        handle.write("\n")


if __name__ == "__main__":
    main()
