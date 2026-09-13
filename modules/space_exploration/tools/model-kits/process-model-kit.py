#!/usr/bin/env python3
"""Build deterministic runtime candidates from one preserved AI/Spline source GLB.

This script must run inside Blender. It never edits the source GLB or concept art.
All generated files are declared by the kit manifest and remain candidates until
the independent Node verifier and mobile evidence gate accept them.
"""

from __future__ import annotations

import hashlib
import json
import math
import re
import sys
import traceback
from datetime import datetime, timezone
from pathlib import Path

import bpy
import bmesh
from mathutils import Matrix, Vector


OPAQUE_ALPHA_THRESHOLD = 1.0 - 1e-6
DEGENERATE_AREA_EPSILON = 1e-12


def cli_args() -> list[str]:
    if "--" not in sys.argv:
        return []
    return sys.argv[sys.argv.index("--") + 1 :]


def parse_args(values: list[str]) -> Path:
    if len(values) != 2 or values[0] != "--manifest":
        raise ValueError("usage: blender --background --python process-model-kit.py -- --manifest <kit.json>")
    return Path(values[1]).resolve()


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        while True:
            block = handle.read(1024 * 1024)
            if not block:
                break
            digest.update(block)
    return digest.hexdigest()


def write_json(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f"{path.name}.{bpy.app.version_string}.tmp")
    temporary.write_text(json.dumps(value, indent=2) + "\n", encoding="utf-8")
    temporary.replace(path)


def safe_path(root: Path, relative: str, label: str) -> Path:
    if not isinstance(relative, str) or not relative or "\\" in relative:
        raise ValueError(f"{label} must be a non-empty POSIX relative path")
    candidate = Path(relative)
    if candidate.is_absolute() or ".." in candidate.parts:
        raise ValueError(f"{label} escapes kit root: {relative}")
    resolved = (root / candidate).resolve()
    try:
        resolved.relative_to(root)
    except ValueError as error:
        raise ValueError(f"{label} escapes kit root: {relative}") from error
    return resolved


def reset_scene() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)


def select_only(objects: list[bpy.types.Object]) -> None:
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.hide_set(False)
        obj.hide_render = False
        obj.select_set(True)
    if objects:
        bpy.context.view_layer.objects.active = objects[0]


def triangulate_object(obj: bpy.types.Object) -> None:
    mesh = obj.data
    bm = bmesh.new()
    bm.from_mesh(mesh)
    if bm.faces:
        bmesh.ops.triangulate(bm, faces=list(bm.faces))
        bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    loose = [vert for vert in bm.verts if not vert.link_faces and not vert.link_edges]
    if loose:
        bmesh.ops.delete(bm, geom=loose, context="VERTS")
    bm.to_mesh(mesh)
    bm.free()
    mesh.update()


def bake_world_transforms(objects: list[bpy.types.Object]) -> None:
    for obj in objects:
        obj.data.transform(obj.matrix_world)
        obj.matrix_world = Matrix.Identity(4)
        triangulate_object(obj)


def geometry_stats(objects: list[bpy.types.Object]) -> dict:
    minimum = Vector((math.inf, math.inf, math.inf))
    maximum = Vector((-math.inf, -math.inf, -math.inf))
    vertices = 0
    triangles = 0
    invalid_vertices = 0
    zero_area_triangles = 0
    for obj in objects:
        mesh = obj.data
        vertices += len(mesh.vertices)
        triangles += sum(max(0, len(poly.vertices) - 2) for poly in mesh.polygons)
        for vert in mesh.vertices:
            point = obj.matrix_world @ vert.co
            if not all(math.isfinite(value) for value in point):
                invalid_vertices += 1
                continue
            for axis in range(3):
                minimum[axis] = min(minimum[axis], point[axis])
                maximum[axis] = max(maximum[axis], point[axis])
        for poly in mesh.polygons:
            if poly.area <= DEGENERATE_AREA_EPSILON:
                zero_area_triangles += max(1, len(poly.vertices) - 2)
    if vertices == 0 or not all(math.isfinite(value) for value in (*minimum, *maximum)):
        raise ValueError("model has no finite mesh vertices")
    dimensions = maximum - minimum
    return {
        "objects": len(objects),
        "vertices": vertices,
        "triangles": triangles,
        "invalidVertices": invalid_vertices,
        "zeroAreaTriangles": zero_area_triangles,
        "bounds": {
            "minimum": [float(value) for value in minimum],
            "maximum": [float(value) for value in maximum],
            "dimensions": [float(value) for value in dimensions],
            "center": [float(value) for value in (minimum + maximum) * 0.5],
        },
    }


def remove_degenerate_faces(objects: list[bpy.types.Object]) -> dict:
    before = geometry_stats(objects)
    if before["invalidVertices"]:
        raise ValueError(f'working mesh contains {before["invalidVertices"]} non-finite vertices before degenerate cleanup')
    per_object = []
    removed_faces = 0
    for obj in objects:
        mesh = obj.data
        bm = bmesh.new()
        bm.from_mesh(mesh)
        bad_faces = []
        for face in bm.faces:
            points = [tuple(float(axis) for axis in vertex.co) for vertex in face.verts]
            origin = points[0]
            area = 0.0
            for index in range(1, len(points) - 1):
                left = tuple(points[index][axis] - origin[axis] for axis in range(3))
                right = tuple(points[index + 1][axis] - origin[axis] for axis in range(3))
                cross = (
                    left[1] * right[2] - left[2] * right[1],
                    left[2] * right[0] - left[0] * right[2],
                    left[0] * right[1] - left[1] * right[0],
                )
                area += 0.5 * math.sqrt(sum(value * value for value in cross))
            if not math.isfinite(area):
                bm.free()
                raise ValueError(f"working mesh {obj.name} contains a non-finite face area")
            if area <= DEGENERATE_AREA_EPSILON:
                bad_faces.append(face)
        object_before = len(bm.faces)
        if bad_faces:
            # FACES deletes only the selected degenerate faces plus edges/verts
            # left unused by those faces. It does not dissolve, weld, remesh, or
            # modify any surviving face, preserving the authored source shape.
            bmesh.ops.delete(bm, geom=bad_faces, context="FACES")
        object_removed = len(bad_faces)
        removed_faces += object_removed
        bm.to_mesh(mesh)
        bm.free()
        mesh.update(calc_edges=True, calc_edges_loose=True)
        per_object.append({
            "name": obj.name,
            "facesBefore": object_before,
            "removedDegenerateFaces": object_removed,
            "facesAfter": len(mesh.polygons),
        })
    after = geometry_stats(objects)
    if after["invalidVertices"]:
        raise ValueError(f'working mesh contains {after["invalidVertices"]} non-finite vertices after degenerate cleanup')
    if after["zeroAreaTriangles"]:
        raise ValueError(f'degenerate cleanup left {after["zeroAreaTriangles"]} zero-area triangles unresolved')
    removed_triangles = before["triangles"] - after["triangles"]
    if removed_faces != before["zeroAreaTriangles"] or removed_triangles != removed_faces:
        raise ValueError(
            "degenerate cleanup accounting mismatch: "
            f'before={before["zeroAreaTriangles"]}, faces={removed_faces}, triangles={removed_triangles}'
        )
    return {
        "policyVersion": 1,
        "areaEpsilon": DEGENERATE_AREA_EPSILON,
        "before": before,
        "removed": {
            "degenerateFaces": removed_faces,
            "triangles": removed_triangles,
            "vertices": before["vertices"] - after["vertices"],
        },
        "after": after,
        "objects": per_object,
    }


def normalize(objects: list[bpy.types.Object], settings: dict) -> dict:
    before = geometry_stats(objects)
    bounds = before["bounds"]
    dimensions = bounds["dimensions"]
    reference = dimensions[2] if settings["scaleMode"] == "height" else max(dimensions)
    if not math.isfinite(reference) or reference <= 1e-9:
        raise ValueError(f"normalization reference dimension is invalid: {reference}")
    scale = float(settings["targetMeters"]) / reference
    center_x = (bounds["minimum"][0] + bounds["maximum"][0]) * 0.5
    center_y = (bounds["minimum"][1] + bounds["maximum"][1]) * 0.5
    min_z = bounds["minimum"][2]
    transform = Matrix.Translation((-center_x * scale, -center_y * scale, -min_z * scale)) @ Matrix.Scale(scale, 4)
    for obj in objects:
        obj.data.transform(transform)
        obj["massfront_runtime_up"] = "Z"
        obj["massfront_runtime_forward"] = settings["runtimeForward"]
        obj["massfront_grounded"] = True
        obj["massfront_normalized_scale"] = scale
        obj.data.update()
    after = geometry_stats(objects)
    center = after["bounds"]["center"]
    target_dimension = after["bounds"]["dimensions"][2] if settings["scaleMode"] == "height" else max(after["bounds"]["dimensions"])
    return {
        "sourceUp": settings["sourceUp"],
        "runtimeUp": settings["runtimeUp"],
        "runtimeForward": settings["runtimeForward"],
        "scaleMode": settings["scaleMode"],
        "targetMeters": float(settings["targetMeters"]),
        "appliedScale": scale,
        "before": before,
        "after": after,
        "centerXYErrorMeters": math.hypot(center[0], center[1]),
        "groundErrorMeters": abs(after["bounds"]["minimum"][2]),
        "targetErrorMeters": abs(target_dimension - float(settings["targetMeters"])),
    }


def duplicate_objects(objects: list[bpy.types.Object], prefix: str) -> list[bpy.types.Object]:
    copies = []
    for index, source in enumerate(objects):
        clone = source.copy()
        clone.data = source.data.copy()
        clone.name = f"{prefix}_{index:03d}_{source.name}"
        bpy.context.scene.collection.objects.link(clone)
        copies.append(clone)
    return copies


def delete_objects(objects: list[bpy.types.Object]) -> None:
    for obj in list(objects):
        if obj and obj.name in bpy.data.objects:
            bpy.data.objects.remove(obj, do_unlink=True)


def apply_decimation(objects: list[bpy.types.Object], target_triangles: int) -> None:
    current = geometry_stats(objects)["triangles"]
    if current <= target_triangles:
        return
    ratio = max(0.01, min(1.0, target_triangles / current))
    for obj in objects:
        if not obj.data.polygons:
            continue
        modifier = obj.modifiers.new(name="MASSFRONT_AUTO_LOD", type="DECIMATE")
        modifier.decimate_type = "COLLAPSE"
        modifier.ratio = ratio
        modifier.use_collapse_triangulate = True
        bpy.context.view_layer.objects.active = obj
        try:
            bpy.ops.object.modifier_apply(modifier=modifier.name)
        except RuntimeError:
            obj.modifiers.remove(modifier)
        triangulate_object(obj)


def export_glb(path: Path, objects: list[bpy.types.Object]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    select_only(objects)
    bpy.ops.export_scene.gltf(
        filepath=str(path),
        export_format="GLB",
        use_selection=True,
        export_yup=True,
        export_apply=True,
        export_cameras=False,
        export_lights=False,
        export_extras=True,
        export_image_format="AUTO",
        export_materials="EXPORT",
    )
    if not path.is_file() or path.stat().st_size < 20:
        raise RuntimeError(f"Blender did not produce GLB: {path}")


def create_lods(root: Path, base_objects: list[bpy.types.Object], lod_specs: list[dict]) -> tuple[list[dict], list[bpy.types.Object]]:
    results = []
    render_objects: list[bpy.types.Object] = []
    for index, spec in enumerate(lod_specs):
        objects = duplicate_objects(base_objects, spec["name"])
        apply_decimation(objects, int(spec["targetTriangles"]))
        stats = geometry_stats(objects)
        if stats["triangles"] > int(spec["maxTriangles"]):
            delete_objects(objects)
            raise ValueError(f'{spec["name"]} has {stats["triangles"]} triangles; maximum is {spec["maxTriangles"]}')
        output = safe_path(root, spec["output"], f'{spec["name"]} output')
        export_glb(output, objects)
        results.append({
            "name": spec["name"],
            "path": spec["output"],
            "targetTriangles": int(spec["targetTriangles"]),
            "maxTriangles": int(spec["maxTriangles"]),
            "actual": stats,
            "bytes": output.stat().st_size,
            "sha256": sha256_file(output),
        })
        if index == 0:
            render_objects = objects
        else:
            delete_objects(objects)
    return results, render_objects


def create_collision(root: Path, base_objects: list[bpy.types.Object], settings: dict) -> dict:
    objects = duplicate_objects(base_objects, "COLLISION_INPUT")
    select_only(objects)
    bpy.context.view_layer.objects.active = objects[0]
    if len(objects) > 1:
        bpy.ops.object.join()
    collision = bpy.context.view_layer.objects.active
    collision.name = "COLLISION_CONVEX_HULL"
    mesh = collision.data
    bm = bmesh.new()
    bm.from_mesh(mesh)
    result = bmesh.ops.convex_hull(bm, input=list(bm.verts), use_existing_faces=False)
    interior = list(result.get("geom_interior", []))
    unused = list(result.get("geom_unused", []))
    if interior:
        bmesh.ops.delete(bm, geom=interior, context="VERTS")
    if unused:
        bmesh.ops.delete(bm, geom=unused, context="VERTS")
    if bm.faces:
        bmesh.ops.triangulate(bm, faces=list(bm.faces))
        bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(mesh)
    bm.free()
    mesh.materials.clear()
    mesh.update()
    max_triangles = int(settings["maxTriangles"])
    if geometry_stats([collision])["triangles"] > max_triangles:
        # A Decimate modifier may retain hundreds of planar hull facets. Build a
        # bounded convex proxy from deterministic farthest-point samples instead.
        source_points = sorted(
            {tuple(round(float(axis), 9) for axis in vertex.co) for vertex in mesh.vertices}
        )
        target_vertices = min(len(source_points), max(4, (max_triangles + 4) // 2))
        while True:
            selected = [source_points[0]]
            remaining = source_points[1:]
            minimum_distance = [sum((point[axis] - selected[0][axis]) ** 2 for axis in range(3)) for point in remaining]
            while remaining and len(selected) < target_vertices:
                best = max(range(len(remaining)), key=lambda index: (minimum_distance[index], remaining[index]))
                point = remaining.pop(best)
                minimum_distance.pop(best)
                selected.append(point)
                for index, candidate in enumerate(remaining):
                    distance = sum((candidate[axis] - point[axis]) ** 2 for axis in range(3))
                    minimum_distance[index] = min(minimum_distance[index], distance)

            replacement = bpy.data.meshes.new("COLLISION_CONVEX_HULL_MESH")
            replacement.from_pydata(selected, [], [])
            replacement.update()
            candidate_bm = bmesh.new()
            candidate_bm.from_mesh(replacement)
            hull = bmesh.ops.convex_hull(candidate_bm, input=list(candidate_bm.verts), use_existing_faces=False)
            interior = list(hull.get("geom_interior", []))
            unused = list(hull.get("geom_unused", []))
            if interior:
                bmesh.ops.delete(candidate_bm, geom=interior, context="VERTS")
            if unused:
                bmesh.ops.delete(candidate_bm, geom=unused, context="VERTS")
            if candidate_bm.faces:
                bmesh.ops.triangulate(candidate_bm, faces=list(candidate_bm.faces))
                bmesh.ops.recalc_face_normals(candidate_bm, faces=list(candidate_bm.faces))
            candidate_bm.to_mesh(replacement)
            candidate_bm.free()
            replacement.update()
            candidate_triangles = len(replacement.polygons)
            if candidate_triangles <= max_triangles or target_vertices <= 4:
                old_mesh = collision.data
                collision.data = replacement
                bpy.data.meshes.remove(old_mesh)
                break
            bpy.data.meshes.remove(replacement)
            target_vertices = max(4, target_vertices - max(1, math.ceil((candidate_triangles - max_triangles) / 2)))
    stats = geometry_stats([collision])
    if stats["triangles"] > max_triangles:
        delete_objects([collision])
        raise ValueError(f'collision proxy has {stats["triangles"]} triangles; maximum is {settings["maxTriangles"]}')
    output = safe_path(root, settings["output"], "collision output")
    export_glb(output, [collision])
    result_record = {
        "mode": settings["mode"],
        "path": settings["output"],
        "maxTriangles": int(settings["maxTriangles"]),
        "actual": stats,
        "bytes": output.stat().st_size,
        "sha256": sha256_file(output),
    }
    delete_objects([collision])
    return result_record


def safe_filename(name: str, fallback: str) -> str:
    stem = re.sub(r"[^A-Za-z0-9._-]+", "_", name or "").strip("._-")
    return stem or fallback


def image_pixels(image: bpy.types.Image):
    import numpy as np

    width, height = int(image.size[0]), int(image.size[1])
    values = np.empty(width * height * 4, dtype=np.float32)
    image.pixels.foreach_get(values)
    return values.reshape((height, width, 4))


def image_alpha_evidence(image: bpy.types.Image, cache: dict[int, dict]) -> dict:
    key = int(image.as_pointer())
    if key not in cache:
        alpha = image_pixels(image)[:, :, 3]
        minimum = float(alpha.min())
        maximum = float(alpha.max())
        cache[key] = {
            "name": image.name,
            "width": int(image.size[0]),
            "height": int(image.size[1]),
            "alphaMin": minimum,
            "alphaMax": maximum,
            "fullyOpaque": minimum >= OPAQUE_ALPHA_THRESHOLD,
        }
    return dict(cache[key])


def constant_alpha_evidence(value, label: str) -> dict:
    try:
        alpha = float(value)
    except (TypeError, ValueError):
        return {"status": "UNKNOWN", "kind": "CONSTANT", "label": label, "reason": "non-numeric alpha"}
    return {
        "status": "FULLY_OPAQUE" if alpha >= OPAQUE_ALPHA_THRESHOLD else "NON_OPAQUE",
        "kind": "CONSTANT",
        "label": label,
        "value": alpha,
    }


def alpha_socket_evidence(socket, image_cache: dict[int, dict], visited: set[tuple[int, str]]) -> dict:
    if socket is None:
        return {"status": "UNKNOWN", "kind": "SOCKET", "reason": "missing alpha socket"}
    links = list(socket.links) if socket.is_linked else []
    if not links:
        return constant_alpha_evidence(getattr(socket, "default_value", None), socket.name)
    if len(links) != 1:
        return {"status": "UNKNOWN", "kind": "SOCKET", "reason": "alpha socket has multiple links"}
    link = links[0]
    node = link.from_node
    output = link.from_socket
    visit_key = (int(node.as_pointer()), output.identifier)
    if visit_key in visited:
        return {"status": "UNKNOWN", "kind": "GRAPH", "reason": "cyclic alpha graph"}
    visited = {*visited, visit_key}
    if node.type == "TEX_IMAGE" and output.name == "Alpha":
        if node.image is None:
            return {"status": "UNKNOWN", "kind": "IMAGE_ALPHA", "node": node.name, "reason": "image node has no image"}
        image = image_alpha_evidence(node.image, image_cache)
        return {
            "status": "FULLY_OPAQUE" if image["fullyOpaque"] else "NON_OPAQUE",
            "kind": "IMAGE_ALPHA",
            "node": node.name,
            "image": image,
        }
    if node.type == "VALUE":
        evidence = constant_alpha_evidence(output.default_value, node.name)
        evidence["node"] = node.name
        return evidence
    if node.type == "REROUTE" and node.inputs:
        evidence = alpha_socket_evidence(node.inputs[0], image_cache, visited)
        evidence["viaReroute"] = node.name
        return evidence
    # Vertex colors, procedural nodes, math, groups, and mixed shader graphs can
    # carry real alpha. Treating an unfamiliar graph as opaque would recreate
    # the exact sorting bug this pass is meant to prevent, so unsupported paths
    # deliberately remain transparent.
    return {
        "status": "UNKNOWN",
        "kind": "UNSUPPORTED_NODE",
        "node": node.name,
        "nodeType": node.type,
        "output": output.name,
    }


def material_alpha_proof(material: bpy.types.Material, image_cache: dict[int, dict]) -> tuple[dict, list]:
    diffuse = constant_alpha_evidence(material.diffuse_color[3], "material.diffuse_color alpha")
    inputs = []
    principled_nodes = []
    if not material.use_nodes or material.node_tree is None:
        inputs.append({"status": "UNKNOWN", "kind": "MATERIAL", "reason": "material has no node graph"})
    else:
        outputs = [
            node for node in material.node_tree.nodes
            if node.type == "OUTPUT_MATERIAL" and getattr(node, "is_active_output", True)
        ]
        if not outputs:
            inputs.append({"status": "UNKNOWN", "kind": "MATERIAL_OUTPUT", "reason": "active material output is missing"})
        for output in outputs:
            surface = output.inputs.get("Surface")
            links = list(surface.links) if surface and surface.is_linked else []
            if len(links) != 1 or links[0].from_node.type != "BSDF_PRINCIPLED":
                inputs.append({
                    "status": "UNKNOWN",
                    "kind": "MATERIAL_OUTPUT",
                    "node": output.name,
                    "reason": "surface is not one directly connected Principled BSDF",
                })
                continue
            principled = links[0].from_node
            principled_nodes.append(principled)
            evidence = alpha_socket_evidence(principled.inputs.get("Alpha"), image_cache, set())
            evidence["principledNode"] = principled.name
            inputs.append(evidence)
    statuses = {diffuse["status"], *(entry["status"] for entry in inputs)}
    if "NON_OPAQUE" in statuses:
        status = "NON_OPAQUE"
    elif statuses == {"FULLY_OPAQUE"}:
        status = "FULLY_OPAQUE"
    else:
        status = "UNKNOWN"
    return {
        "status": status,
        "opaqueThreshold": OPAQUE_ALPHA_THRESHOLD,
        "diffuseAlpha": diffuse,
        "surfaceInputs": inputs,
    }, principled_nodes


def used_materials(objects: list[bpy.types.Object]) -> list[bpy.types.Material]:
    materials = {}
    for obj in objects:
        for slot in obj.material_slots:
            if slot.material is not None:
                materials[int(slot.material.as_pointer())] = slot.material
    return sorted(materials.values(), key=lambda material: material.name)


def sanitize_material_alpha(objects: list[bpy.types.Object], image_cache: dict[int, dict]) -> dict:
    records = []
    for material in used_materials(objects):
        source_render_method = getattr(material, "surface_render_method", None)
        source_blend_method = getattr(material, "blend_method", None)
        proof, principled_nodes = material_alpha_proof(material, image_cache)
        blended = source_render_method == "BLENDED" or source_blend_method == "BLEND"
        if blended and proof["status"] == "FULLY_OPAQUE":
            for principled in principled_nodes:
                alpha = principled.inputs.get("Alpha")
                if alpha is None:
                    continue
                for link in list(alpha.links):
                    material.node_tree.links.remove(link)
                alpha.default_value = 1.0
            # Blender 5.x represents opaque and alpha-clipped materials through
            # DITHERED/HASHED. Once the proven-useless alpha links are removed,
            # this state exports with alphaMode omitted (glTF OPAQUE).
            if hasattr(material, "surface_render_method"):
                material.surface_render_method = "DITHERED"
            if hasattr(material, "blend_method"):
                material.blend_method = "OPAQUE"
            decision = "FORCED_OPAQUE"
            expected_output = "OPAQUE"
        elif blended:
            decision = "PRESERVED_BLEND"
            expected_output = "BLEND"
        else:
            decision = "UNCHANGED"
            expected_output = None
        records.append({
            "name": material.name,
            "sourceRenderMethod": source_render_method,
            "sourceBlendMethod": source_blend_method,
            "decision": decision,
            "proof": proof,
            "resultRenderMethod": getattr(material, "surface_render_method", None),
            "resultBlendMethod": getattr(material, "blend_method", None),
            "expectedOutputAlphaMode": expected_output,
        })
    return {
        "policyVersion": 1,
        "opaqueThreshold": OPAQUE_ALPHA_THRESHOLD,
        "materials": records,
        "summary": {
            "total": len(records),
            "forcedOpaque": sum(record["decision"] == "FORCED_OPAQUE" for record in records),
            "preservedBlend": sum(record["decision"] == "PRESERVED_BLEND" for record in records),
            "unchanged": sum(record["decision"] == "UNCHANGED" for record in records),
        },
    }


def border_metrics(image: bpy.types.Image) -> dict:
    import numpy as np

    pixels = image_pixels(image)[:, :, :3]
    lr = np.abs(pixels[:, 0, :] - pixels[:, -1, :]).reshape(-1)
    tb = np.abs(pixels[0, :, :] - pixels[-1, :, :]).reshape(-1)

    def measure(values):
        return {"mean": float(values.mean()), "p95": float(np.percentile(values, 95))}

    return {"leftRight": measure(lr), "topBottom": measure(tb)}


def extract_textures(root: Path, settings: dict, source_images: list[bpy.types.Image], image_cache: dict[int, dict]) -> list[dict]:
    output_dir = safe_path(root, settings["outputDirectory"], "texture output directory")
    output_dir.mkdir(parents=True, exist_ok=True)
    records = []
    used_names: set[str] = set()
    for index, image in enumerate(source_images):
        if image.name in {"Render Result", "Viewer Node"} or int(image.size[0]) < 1 or int(image.size[1]) < 1:
            continue
        stem = safe_filename(image.name, f"texture_{index:02d}")
        candidate = stem
        suffix = 1
        while candidate.lower() in used_names:
            suffix += 1
            candidate = f"{stem}_{suffix}"
        used_names.add(candidate.lower())
        output = output_dir / f"{candidate}.png"
        original_path = image.filepath_raw
        original_format = image.file_format
        try:
            image.filepath_raw = str(output)
            image.file_format = "PNG"
            image.save()
        finally:
            image.filepath_raw = original_path
            image.file_format = original_format
        if not output.is_file():
            raise RuntimeError(f"could not extract texture {image.name}")
        seam = {"status": "NOT_APPLICABLE", "reason": "UV atlas is not declared tileable"}
        if settings["seamPolicy"] == "require-tileable":
            metrics = border_metrics(image)
            mean_limit = float(settings["maxBorderMeanDelta"])
            p95_limit = float(settings["maxBorderP95Delta"])
            passed = all(
                axis["mean"] <= mean_limit and axis["p95"] <= p95_limit
                for axis in metrics.values()
            )
            seam = {
                "status": "PASS" if passed else "FAIL",
                "metrics": metrics,
                "maxBorderMeanDelta": mean_limit,
                "maxBorderP95Delta": p95_limit,
            }
        records.append({
            "sourceName": image.name,
            "path": output.relative_to(root).as_posix(),
            "width": int(image.size[0]),
            "height": int(image.size[1]),
            "bytes": output.stat().st_size,
            "sha256": sha256_file(output),
            "alpha": image_alpha_evidence(image, image_cache),
            "seam": seam,
        })
    if settings.get("requireEmbeddedSource") and not records:
        raise ValueError("manifest requires embedded source textures but Blender imported none")
    failures = [record["path"] for record in records if record["seam"]["status"] == "FAIL"]
    if failures:
        raise ValueError(f"tileability border limits failed: {', '.join(failures)}")
    return records


def point_camera(camera: bpy.types.Object, target: Vector) -> None:
    camera.rotation_euler = (target - camera.location).to_track_quat("-Z", "Y").to_euler()


def create_preview_scene(objects: list[bpy.types.Object]) -> tuple[bpy.types.Object, list[bpy.types.Object]]:
    world = bpy.data.worlds.new("MASSFRONT_PREVIEW_WORLD")
    world.use_nodes = True
    background = world.node_tree.nodes.get("Background")
    background.inputs["Color"].default_value = (0.012, 0.02, 0.028, 1.0)
    background.inputs["Strength"].default_value = 0.28
    bpy.context.scene.world = world

    camera_data = bpy.data.cameras.new("MASSFRONT_PREVIEW_CAMERA")
    camera_data.type = "ORTHO"
    camera = bpy.data.objects.new("MASSFRONT_PREVIEW_CAMERA", camera_data)
    bpy.context.scene.collection.objects.link(camera)
    bpy.context.scene.camera = camera

    lights = []
    for name, location, energy, size, color in [
        ("KEY", (4.0, -5.0, 6.0), 1100.0, 4.0, (0.80, 0.92, 1.0)),
        ("FILL", (-4.0, -1.0, 3.0), 650.0, 5.0, (0.35, 0.70, 1.0)),
        ("RIM", (1.0, 4.0, 5.0), 850.0, 3.0, (0.45, 0.85, 1.0)),
    ]:
        data = bpy.data.lights.new(f"MASSFRONT_{name}", type="AREA")
        data.energy = energy
        data.shape = "DISK"
        data.size = size
        data.color = color
        obj = bpy.data.objects.new(f"MASSFRONT_{name}", data)
        obj.location = location
        bpy.context.scene.collection.objects.link(obj)
        point_camera(obj, Vector((0, 0, 0.5)))
        lights.append(obj)

    scene = bpy.context.scene
    try:
        scene.render.engine = "BLENDER_EEVEE_NEXT"
    except TypeError:
        scene.render.engine = "BLENDER_EEVEE"
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.film_transparent = False
    scene.render.resolution_percentage = 100
    scene.render.use_file_extension = True
    scene.render.image_settings.color_depth = "8"
    scene.view_settings.look = "AgX - Medium High Contrast"
    for obj in objects:
        obj.hide_render = False
    return camera, lights


def render_previews(root: Path, objects: list[bpy.types.Object], evidence: dict) -> tuple[list[dict], dict]:
    import numpy as np

    stats = geometry_stats(objects)
    bounds = stats["bounds"]
    center = Vector(bounds["center"])
    dimensions = Vector(bounds["dimensions"])
    extent = max(dimensions) or 1.0
    width, height = map(int, evidence["thumbnailSize"])
    scene = bpy.context.scene
    scene.render.resolution_x = width
    scene.render.resolution_y = height
    camera, _ = create_preview_scene(objects)
    camera.data.ortho_scale = extent * 1.35
    distance = extent * 3.0
    view_vectors = {
        "iso": Vector((1.35, -1.65, 1.15)),
        "front": Vector((0.0, -1.0, 0.18)),
        "side": Vector((1.0, 0.0, 0.18)),
        "top": Vector((0.0, 0.0, 1.0)),
    }
    output_dir = safe_path(root, evidence["outputDirectory"], "evidence output directory")
    output_dir.mkdir(parents=True, exist_ok=True)
    thumbnails = []
    arrays = []
    for view in evidence["views"]:
        direction = view_vectors[view].normalized()
        camera.location = center + direction * distance
        point_camera(camera, center)
        path = output_dir / f"thumb-{view}.png"
        scene.render.filepath = str(path)
        bpy.ops.render.render(write_still=True)
        if not path.is_file():
            raise RuntimeError(f"preview render missing: {path}")
        image = bpy.data.images.load(str(path), check_existing=False)
        pixels = np.empty(width * height * 4, dtype=np.float32)
        image.pixels.foreach_get(pixels)
        arrays.append(pixels.reshape((height, width, 4)))
        bpy.data.images.remove(image)
        thumbnails.append({
            "view": view,
            "path": path.relative_to(root).as_posix(),
            "width": width,
            "height": height,
            "bytes": path.stat().st_size,
            "sha256": sha256_file(path),
        })

    sheet_width, sheet_height = width * 2, height * 2
    sheet_pixels = np.zeros((sheet_height, sheet_width, 4), dtype=np.float32)
    sheet_pixels[:, :, 3] = 1.0
    for index, pixels in enumerate(arrays):
        row, column = divmod(index, 2)
        sheet_pixels[row * height : (row + 1) * height, column * width : (column + 1) * width, :] = pixels
    sheet = bpy.data.images.new("MASSFRONT_CONTACT_SHEET", width=sheet_width, height=sheet_height, alpha=True)
    sheet.pixels.foreach_set(sheet_pixels.reshape(-1))
    sheet.update()
    contact_path = safe_path(root, evidence["contactSheet"], "contact sheet")
    contact_path.parent.mkdir(parents=True, exist_ok=True)
    sheet.filepath_raw = str(contact_path)
    sheet.file_format = "PNG"
    sheet.save()
    bpy.data.images.remove(sheet)
    contact = {
        "path": evidence["contactSheet"],
        "width": sheet_width,
        "height": sheet_height,
        "bytes": contact_path.stat().st_size,
        "sha256": sha256_file(contact_path),
        "layout": [[evidence["views"][0], evidence["views"][1]], [evidence["views"][2], evidence["views"][3]]],
    }
    return thumbnails, contact


def build(manifest_path: Path) -> dict:
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    root = manifest_path.parent.resolve()
    source = safe_path(root, manifest["source"]["glb"], "source GLB")
    report_path = safe_path(root, manifest["evidence"]["buildReport"], "build report")
    if not source.is_file():
        raise FileNotFoundError(f"source GLB is missing: {source}")

    reset_scene()
    bpy.ops.import_scene.gltf(filepath=str(source))
    selected_names = set(manifest["source"]["meshNodeNames"])
    all_meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    objects = [obj for obj in all_meshes if obj.name in selected_names]
    missing_names = sorted(selected_names - {obj.name for obj in objects})
    if missing_names:
        raise ValueError(f"source GLB is missing declared mesh nodes: {', '.join(missing_names)}")
    if not objects:
        raise ValueError("source GLB imported without mesh objects")
    source_images = [image for image in bpy.data.images if image.name not in {"Render Result", "Viewer Node"}]
    image_alpha_cache: dict[int, dict] = {}
    material_alpha = sanitize_material_alpha(objects, image_alpha_cache)
    bake_world_transforms(objects)
    geometry_cleanup = remove_degenerate_faces(objects)
    source_stats = geometry_stats(objects)
    if source_stats["invalidVertices"]:
        raise ValueError(f'source contains {source_stats["invalidVertices"]} invalid vertices')
    normalization = normalize(objects, manifest["normalization"])
    tolerance = float(manifest["normalization"]["toleranceMeters"])
    if max(normalization["centerXYErrorMeters"], normalization["groundErrorMeters"], normalization["targetErrorMeters"]) > tolerance:
        raise ValueError(f"normalization error exceeds {tolerance} m")

    textures = extract_textures(root, manifest["textures"], source_images, image_alpha_cache)
    lods, render_objects = create_lods(root, objects, manifest["lods"])
    collision = create_collision(root, objects, manifest["collision"])
    delete_objects(objects)
    thumbnails, contact_sheet = render_previews(root, render_objects, manifest["evidence"])
    delete_objects(render_objects)

    report = {
        "schemaVersion": 1,
        "kind": "MassfrontModelKitBuildReportV1",
        "status": "PASS",
        "builtAtUtc": utc_now(),
        "kitId": manifest["kitId"],
        "manifest": manifest_path.name,
        "blender": {"version": bpy.app.version_string, "versionTuple": list(bpy.app.version)},
        "source": {
            "path": manifest["source"]["glb"],
            "bytes": source.stat().st_size,
            "sha256": sha256_file(source),
            "stats": source_stats,
            "importedImages": len(source_images),
            "selectedMeshNodeNames": sorted(selected_names),
            "excludedMeshNodeNames": sorted(obj.name for obj in all_meshes if obj not in objects),
        },
        "normalization": normalization,
        "geometryCleanup": geometry_cleanup,
        "materialAlphaSanitization": material_alpha,
        "lods": lods,
        "collision": collision,
        "textures": textures,
        "thumbnails": thumbnails,
        "contactSheet": contact_sheet,
        "warnings": [],
        "errors": [],
    }
    write_json(report_path, report)
    return report


def main() -> int:
    manifest_path = parse_args(cli_args())
    manifest = None
    report_path = None
    try:
        if manifest_path.is_file():
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            report_path = safe_path(manifest_path.parent.resolve(), manifest["evidence"]["buildReport"], "build report")
        report = build(manifest_path)
        print(json.dumps({"status": "PASS", "report": str(report_path), "kitId": report["kitId"]}, indent=2))
        return 0
    except Exception as error:
        failed = {
            "schemaVersion": 1,
            "kind": "MassfrontModelKitBuildReportV1",
            "status": "FAIL",
            "builtAtUtc": utc_now(),
            "kitId": manifest.get("kitId", "UNKNOWN") if isinstance(manifest, dict) else "UNKNOWN",
            "blender": {"version": bpy.app.version_string, "versionTuple": list(bpy.app.version)},
            "warnings": [],
            "errors": [{"type": type(error).__name__, "message": str(error), "traceback": traceback.format_exc()}],
        }
        if report_path:
            try:
                write_json(report_path, failed)
            except Exception:
                pass
        print(json.dumps(failed, indent=2), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
