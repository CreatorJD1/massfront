"""Prepare a non-destructive review kit from the verified Hunyuan road GLB.

The immutable Hugging Face source is imported and normalized with the shared
source-model-intake helpers. It remains a hidden high-detail reference. Clean
LOD review meshes, collision, nav metadata, markings and restrained emissive
channels are derived into a separate authoring folder. Nothing is registered
with MASSFRONT runtime by this script.

Blender MCP:
  import runpy
  tool = runpy.run_path(r"C:\\repo\\tools\\blender\\hf-road-cleanup\\build-hf-road-cleanup.py",
                        run_name="mf_hf_road_cleanup")
  tool["build_cleanup"]({})
"""

import bpy
import bmesh
import hashlib
import json
import math
import os
import runpy
import sys
from collections import defaultdict, deque
from pathlib import Path
from mathutils import Vector


SCHEMA = "MassfrontHunyuanRoadCleanupV1"
PREFIX = "MF_HF_ROAD_CLEAN_V1"
MASTER_COLLECTION = PREFIX + "_SOURCE"
EXPECTED_SOURCE_SHA256 = "62EC702437FAC75D3651B0130BE094DD8A824FB559A97A46319B131F6225B166"
TARGET_WIDTH_M = 20.0
TARGET_LENGTH_M = 40.0
LANE_COUNT = 4
LOD_TARGETS = {0: 40000, 1: 18000, 2: 6000}
MICRO_COMPONENT_MAX_TRIANGLES = 3
# Deliberately conservative: the generator uses disconnected shells for valid
# trim and rail detail. Only sub-12 cm, sub-20 cm² islands qualify as debris.
MICRO_COMPONENT_MAX_DIMENSION_M = 0.12
MICRO_COMPONENT_MAX_AREA_M2 = 0.002
BOUNDARY_PROTECTION_EPSILON_M = 0.002
DETAIL_SURFACE_CLEARANCE_M = 0.008


def repository_root():
    return Path(__file__).resolve().parents[3]


def default_config():
    repo = repository_root()
    source_root = (
        repo / "modules" / "space_exploration" / "assets" / "source"
        / "huggingface" / "world-kits" / "mf-road-straight-hunyuan3d21-v1"
    )
    output = (
        repo / "modules" / "space_exploration" / "assets" / "source"
        / "blender" / "world-kits" / "mf-road-straight-hunyuan-clean-v1"
    )
    return {
        "source_glb": str(source_root / "mf-road-straight-hunyuan3d21-v1.glb"),
        "source_report": str(source_root / "mf-road-straight-hunyuan3d21-v1.report.json"),
        "output_dir": str(output),
        "blend_path": str(output / "mf-road-straight-hunyuan-clean-v1.blend"),
        "report_path": str(output / "mf-road-straight-hunyuan-clean-v1.provenance.json"),
        "export_dir": str(output / "review-exports"),
        "evidence_dir": str(output / "evidence"),
        "render_resolution": 1024,
        "render_evidence": True,
        "export_review_glbs": True,
        "save_blend": True,
    }


def merged_config(overrides=None):
    config = default_config()
    if overrides:
        unknown = sorted(set(overrides) - set(config))
        if unknown:
            raise ValueError("unknown cleanup config keys: " + ", ".join(unknown))
        config.update(overrides)
    for key in ("source_glb", "source_report", "output_dir", "blend_path", "report_path", "export_dir", "evidence_dir"):
        config[key] = os.path.abspath(os.path.expanduser(str(config[key])))
    config["render_resolution"] = 1024
    return config


def sha256(path):
    digest = hashlib.sha256()
    with open(path, "rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest().upper()


def file_record(path):
    absolute = Path(path).resolve()
    relative = absolute.relative_to(repository_root()).as_posix()
    return {"path": relative, "sha256": sha256(absolute), "bytes": absolute.stat().st_size}


def remove_collection_tree(collection):
    for child in list(collection.children):
        remove_collection_tree(child)
    for obj in list(collection.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    bpy.data.collections.remove(collection)


def clear_previous_generation():
    collection = bpy.data.collections.get(MASTER_COLLECTION)
    if collection is not None:
        remove_collection_tree(collection)
    for datablocks in (bpy.data.meshes, bpy.data.materials, bpy.data.lights, bpy.data.cameras):
        for datablock in list(datablocks):
            if datablock.name.startswith(PREFIX + "_") and datablock.users == 0:
                datablocks.remove(datablock)


def linked_collection(parent, name):
    collection = bpy.data.collections.new(name)
    parent.children.link(collection)
    return collection


def collection_layer(target, layer=None):
    layer = layer or bpy.context.view_layer.layer_collection
    if layer.collection == target:
        return layer
    for child in layer.children:
        found = collection_layer(target, child)
        if found is not None:
            return found
    return None


def import_reference(config, master):
    source_path = config["source_glb"]
    if not os.path.isfile(source_path):
        raise RuntimeError("verified Hunyuan source is missing: " + source_path)
    source_hash_before = sha256(source_path)
    if source_hash_before != EXPECTED_SOURCE_SHA256:
        raise RuntimeError("immutable source hash mismatch: " + source_hash_before)
    with open(config["source_report"], "r", encoding="utf-8") as handle:
        source_report = json.load(handle)
    reported_hash = str(source_report.get("output", {}).get("sha256", "")).upper()
    if reported_hash != source_hash_before:
        raise RuntimeError("verified source report does not bind the current GLB")

    reference_collection = linked_collection(master, PREFIX + "_REFERENCE_HIGH")
    previous_layer = bpy.context.view_layer.active_layer_collection
    target_layer = collection_layer(reference_collection)
    if target_layer is None:
        raise RuntimeError("could not activate isolated reference collection")
    before = set(bpy.data.objects)
    bpy.context.view_layer.active_layer_collection = target_layer
    bpy.ops.import_scene.gltf(filepath=source_path)
    bpy.context.view_layer.active_layer_collection = previous_layer
    imported = [obj for obj in bpy.data.objects if obj not in before]
    for obj in imported:
        if obj.type in {"CAMERA", "LIGHT"}:
            bpy.data.objects.remove(obj, do_unlink=True)
    imported = [obj for obj in imported if obj.name in bpy.data.objects]
    meshes = [obj for obj in imported if obj.type == "MESH"]
    if not meshes:
        raise RuntimeError("Hunyuan source import produced no mesh")

    intake_path = repository_root() / "tools" / "blender" / "source-model-intake.py"
    intake = runpy.run_path(str(intake_path), run_name="mf_shared_source_intake")
    intake["bake_world_transforms"](meshes)
    before_bounds = intake["logical_bounds"](meshes)
    width, source_height, length = before_bounds["dimensions"]
    if width <= 0.0 or source_height <= 0.0 or length <= 0.0:
        raise RuntimeError("source bounds are empty")
    if length <= width:
        raise RuntimeError("source orientation is unexpected; longest axis must be road length")
    horizontal_scale = min(TARGET_WIDTH_M / width, TARGET_LENGTH_M / length)
    target_height = source_height * horizontal_scale
    normalization = intake["normalize"](meshes, [TARGET_WIDTH_M, target_height, TARGET_LENGTH_M], "exact")
    after_bounds = intake["logical_bounds"](meshes)
    if abs(after_bounds["dimensions"][0] - TARGET_WIDTH_M) > 1e-4:
        raise RuntimeError("normalized width is not exactly 20 m")
    if abs(after_bounds["dimensions"][2] - TARGET_LENGTH_M) > 1e-4:
        raise RuntimeError("normalized length is not exactly 40 m")

    # The verified source currently contains one mesh. Joining is deterministic
    # if a future exporter wraps it in multiple mesh objects.
    if len(meshes) > 1:
        bpy.ops.object.select_all(action="DESELECT")
        for obj in meshes:
            obj.select_set(True)
        bpy.context.view_layer.objects.active = meshes[0]
        bpy.ops.object.join()
        reference = bpy.context.view_layer.objects.active
    else:
        reference = meshes[0]
    reference.name = PREFIX + "_REFERENCE_HIGH"
    reference.data.name = reference.name + "_MESH"
    reference["mf_schema"] = SCHEMA
    reference["mf_role"] = "source_high_detail_reference"
    reference["mf_source_sha256"] = source_hash_before
    reference["mf_runtime_accepted"] = False
    reference["mf_origin_policy"] = "footprint_center_grounded"
    reference.hide_render = True
    reference.hide_viewport = True

    for obj in imported:
        if obj != reference and obj.name in bpy.data.objects and obj.type != "MESH":
            bpy.data.objects.remove(obj, do_unlink=True)
    if sha256(source_path) != source_hash_before:
        raise RuntimeError("source GLB changed during non-destructive preparation")
    return reference, source_report, normalization, before_bounds, after_bounds


def triangle_count(obj):
    if obj.type != "MESH":
        return 0
    obj.data.calc_loop_triangles()
    return len(obj.data.loop_triangles)


def mesh_bounds(obj):
    points = [vertex.co for vertex in obj.data.vertices]
    minimum = [min(point[axis] for point in points) for axis in range(3)]
    maximum = [max(point[axis] for point in points) for axis in range(3)]
    return {
        "min": minimum,
        "max": maximum,
        "dimensions": [maximum[axis] - minimum[axis] for axis in range(3)],
    }


def connected_face_components(mesh):
    mesh.faces.ensure_lookup_table()
    mesh.faces.index_update()
    visited = set()
    components = []
    for seed in sorted(mesh.faces, key=lambda face: face.index):
        if seed in visited:
            continue
        queue = deque([seed])
        visited.add(seed)
        faces = []
        vertices = set()
        while queue:
            face = queue.popleft()
            faces.append(face)
            for vertex in face.verts:
                vertices.add(vertex)
                for neighbor in sorted(vertex.link_faces, key=lambda item: item.index):
                    if neighbor not in visited:
                        visited.add(neighbor)
                        queue.append(neighbor)
        points = [vertex.co for vertex in vertices]
        minimum = [min(point[axis] for point in points) for axis in range(3)]
        maximum = [max(point[axis] for point in points) for axis in range(3)]
        dimensions = [maximum[axis] - minimum[axis] for axis in range(3)]
        area = sum(face.calc_area() for face in faces)
        components.append({
            "faces": faces,
            "faceCount": len(faces),
            "vertexCount": len(vertices),
            "areaM2": area,
            "min": minimum,
            "max": maximum,
            "dimensionsM": dimensions,
        })
    components.sort(key=lambda item: (-item["faceCount"], -item["areaM2"], item["min"]))
    return components


def face_coordinate_key(face, precision=6):
    points = [tuple(round(vertex.co[axis], precision) for axis in range(3)) for vertex in face.verts]
    return tuple(sorted(points))


def cleanup_connected_components(obj):
    """Remove only deterministic micro-islands and exact duplicate faces.

    The generated road intentionally uses disconnected shells for rails, deck,
    median and corner details. Large components are therefore never joined or
    deleted. Only one-to-three-face islands below strict metric bounds are
    removed, and every component touching the 20 x 40 m envelope is protected.
    Face winding is preserved; global normal recalculation caused the previous
    dark-fragment regression on disconnected islands.
    """
    before_bounds = mesh_bounds(obj)
    before_triangles = triangle_count(obj)
    mesh = bmesh.new()
    mesh.from_mesh(obj.data)
    mesh.faces.ensure_lookup_table()
    mesh.faces.index_update()

    duplicate_buckets = defaultdict(list)
    for face in mesh.faces:
        duplicate_buckets[face_coordinate_key(face)].append(face)
    duplicate_faces = []
    duplicate_groups = 0
    for faces in duplicate_buckets.values():
        if len(faces) > 1:
            duplicate_groups += 1
            duplicate_faces.extend(sorted(faces, key=lambda face: face.index)[1:])
    if duplicate_faces:
        bmesh.ops.delete(mesh, geom=duplicate_faces, context="FACES")
        mesh.faces.ensure_lookup_table()
        mesh.faces.index_update()

    degenerate_faces = [face for face in mesh.faces if face.calc_area() <= 1e-10]
    if degenerate_faces:
        bmesh.ops.delete(mesh, geom=degenerate_faces, context="FACES")
        mesh.faces.ensure_lookup_table()
        mesh.faces.index_update()

    components = connected_face_components(mesh)
    global_min = before_bounds["min"]
    global_max = before_bounds["max"]
    removed = []
    protected_micro = []
    faces_to_remove = []
    for rank, component in enumerate(components):
        touches_envelope = any(
            abs(component["min"][axis] - global_min[axis]) <= BOUNDARY_PROTECTION_EPSILON_M
            or abs(component["max"][axis] - global_max[axis]) <= BOUNDARY_PROTECTION_EPSILON_M
            for axis in (0, 1)
        )
        micro_candidate = (
            component["faceCount"] <= MICRO_COMPONENT_MAX_TRIANGLES
            and max(component["dimensionsM"]) <= MICRO_COMPONENT_MAX_DIMENSION_M
            and component["areaM2"] <= MICRO_COMPONENT_MAX_AREA_M2
        )
        record = {
            "sourceRank": rank,
            "triangles": component["faceCount"],
            "vertices": component["vertexCount"],
            "areaM2": round(component["areaM2"], 8),
            "dimensionsM": [round(value, 6) for value in component["dimensionsM"]],
            "touchesEnvelope": touches_envelope,
        }
        if micro_candidate and not touches_envelope:
            removed.append(record)
            faces_to_remove.extend(component["faces"])
        elif micro_candidate:
            protected_micro.append(record)

    if faces_to_remove:
        bmesh.ops.delete(mesh, geom=faces_to_remove, context="FACES")
    unused_vertices = [vertex for vertex in mesh.verts if not vertex.link_faces]
    if unused_vertices:
        bmesh.ops.delete(mesh, geom=unused_vertices, context="VERTS")
    mesh.to_mesh(obj.data)
    mesh.free()
    obj.data.validate(verbose=False, clean_customdata=False)
    obj.data.update(calc_edges=True)

    after_bounds = mesh_bounds(obj)
    after_triangles = triangle_count(obj)
    for axis, label in ((0, "width"), (1, "length")):
        if abs(after_bounds["dimensions"][axis] - before_bounds["dimensions"][axis]) > 1e-5:
            raise RuntimeError("connected-component cleanup changed exact road %s" % label)

    check = bmesh.new()
    check.from_mesh(obj.data)
    after_components = connected_face_components(check)
    check.free()
    return {
        "policy": {
            "maxTriangles": MICRO_COMPONENT_MAX_TRIANGLES,
            "maxDimensionM": MICRO_COMPONENT_MAX_DIMENSION_M,
            "maxAreaM2": MICRO_COMPONENT_MAX_AREA_M2,
            "boundaryProtectionEpsilonM": BOUNDARY_PROTECTION_EPSILON_M,
            "faceWindingPreserved": True,
            "globalNormalRecalculation": False,
        },
        "before": {
            "triangles": before_triangles,
            "components": len(components),
            "bounds": before_bounds,
            "exactDuplicateGroups": duplicate_groups,
            "exactDuplicateTrianglesRemoved": len(duplicate_faces),
            "degenerateTrianglesRemoved": len(degenerate_faces),
        },
        "removed": {
            "components": len(removed),
            "triangles": sum(item["triangles"] for item in removed),
            "areaM2": round(sum(item["areaM2"] for item in removed), 8),
            "records": removed,
        },
        "protectedBoundaryMicroComponents": protected_micro,
        "after": {
            "triangles": after_triangles,
            "components": len(after_components),
            "bounds": after_bounds,
        },
    }


def validate_render_mesh(obj):
    # Do not recalculate normals across the generated disconnected islands.
    # Their original winding renders correctly; the previous global BMesh
    # normal pass was the direct cause of dark flipped fragments.
    obj.data.validate(verbose=False, clean_customdata=False)
    obj.data.update(calc_edges=True)


def create_clean_base(reference, collection):
    obj = reference.copy()
    obj.data = reference.data.copy()
    collection.objects.link(obj)
    obj.name = PREFIX + "_CLEAN_BASE"
    obj.data.name = obj.name + "_MESH"
    obj.hide_render = True
    obj.hide_viewport = True
    obj["mf_schema"] = SCHEMA
    obj["mf_role"] = "connected_component_clean_base"
    obj["mf_runtime_accepted"] = False
    report = cleanup_connected_components(obj)
    return obj, report


def duplicate_lod(clean_base, collection, lod, target_triangles):
    obj = clean_base.copy()
    obj.data = clean_base.data.copy()
    collection.objects.link(obj)
    obj.hide_render = False
    obj.hide_viewport = False
    obj.name = PREFIX + "_RENDER_LOD%d" % lod
    obj.data.name = obj.name + "_MESH"
    obj["mf_schema"] = SCHEMA
    obj["mf_role"] = "clean_render_mesh"
    obj["mf_lod"] = lod
    obj["mf_target_triangles"] = target_triangles
    obj["mf_runtime_accepted"] = False
    validate_render_mesh(obj)
    current = triangle_count(obj)
    if lod > 0 and current > target_triangles:
        bpy.ops.object.select_all(action="DESELECT")
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        modifier = obj.modifiers.new(PREFIX + "_DECIMATE_LOD%d" % lod, "DECIMATE")
        modifier.decimate_type = "COLLAPSE"
        modifier.ratio = max(0.02, min(1.0, target_triangles / current))
        modifier.use_collapse_triangulate = True
        bpy.ops.object.modifier_apply(modifier=modifier.name)
        validate_render_mesh(obj)
    return obj


def percentile(values, fraction):
    if not values:
        raise RuntimeError("cannot estimate road surface height from an empty sample")
    ordered = sorted(values)
    index = max(0, min(len(ordered) - 1, int(round((len(ordered) - 1) * fraction))))
    return ordered[index]


def estimate_deck_height(reference):
    samples = []
    all_heights = []
    for vertex in reference.data.vertices:
        point = reference.matrix_world @ vertex.co
        all_heights.append(point.z)
        if 1.35 <= abs(point.x) <= 7.15 and abs(point.y) <= 18.2:
            samples.append(point.z)
    if len(samples) < 128:
        samples = all_heights
    # A high percentile sits above the generated lane noise but excludes the
    # median and outer curb through the X filter.
    deck_z = percentile(samples, 0.90)
    return {
        "z": deck_z,
        "sampleCount": len(samples),
        "sampleMin": min(samples),
        "sampleMax": max(samples),
        "estimator": "lane-zone-p90",
    }


def set_principled(material, name, value):
    bsdf = material.node_tree.nodes.get("Principled BSDF")
    socket = bsdf.inputs.get(name)
    if socket is not None:
        socket.default_value = value


def material(name, color, metallic, roughness, emission=None):
    result = bpy.data.materials.new(PREFIX + "_MAT_" + name.upper())
    result.diffuse_color = color
    result.use_nodes = True
    set_principled(result, "Base Color", color)
    set_principled(result, "Metallic", metallic)
    set_principled(result, "Roughness", roughness)
    if emission:
        bsdf = result.node_tree.nodes.get("Principled BSDF")
        target = bsdf.inputs.get("Emission Color")
        if target is None:
            target = bsdf.inputs.get("Emission")
        if target is not None:
            target.default_value = emission[0]
        strength = bsdf.inputs.get("Emission Strength")
        if strength is not None:
            strength.default_value = emission[1]
    result["mf_schema"] = SCHEMA
    result["mf_material_role"] = name
    return result


def create_materials():
    return {
        "joint": material("transverse_joint", (0.13, 0.16, 0.18, 1.0), 0.72, 0.30),
        "marking": material("lane_marking", (0.72, 0.75, 0.72, 1.0), 0.05, 0.62),
        "service": material("service_channel_bed", (0.015, 0.035, 0.048, 1.0), 0.52, 0.34),
        "emissive": material(
            "restrained_cyan_emissive", (0.015, 0.36, 0.46, 1.0), 0.08, 0.22,
            emission=((0.01, 0.58, 0.78, 1.0), 3.2),
        ),
        "collision": material("review_collision", (0.46, 0.10, 0.04, 1.0), 0.0, 1.0),
        "nav": material("review_nav", (0.02, 0.32, 0.14, 1.0), 0.0, 1.0),
    }


def append_box(vertices, faces, center, size):
    cx, cy, cz = center
    sx, sy, sz = (value * 0.5 for value in size)
    base = len(vertices)
    vertices.extend((
        (cx - sx, cy - sy, cz - sz), (cx + sx, cy - sy, cz - sz),
        (cx + sx, cy + sy, cz - sz), (cx - sx, cy + sy, cz - sz),
        (cx - sx, cy - sy, cz + sz), (cx + sx, cy - sy, cz + sz),
        (cx + sx, cy + sy, cz + sz), (cx - sx, cy + sy, cz + sz),
    ))
    faces.extend((
        (base + 0, base + 3, base + 2, base + 1),
        (base + 4, base + 5, base + 6, base + 7),
        (base + 0, base + 1, base + 5, base + 4),
        (base + 1, base + 2, base + 6, base + 5),
        (base + 2, base + 3, base + 7, base + 6),
        (base + 3, base + 0, base + 4, base + 7),
    ))


def boxes_object(collection, name, boxes, assigned_material, role, lod):
    vertices, faces = [], []
    for center, size in boxes:
        append_box(vertices, faces, center, size)
    if not boxes:
        return None
    mesh = bpy.data.meshes.new(name + "_MESH")
    mesh.from_pydata(vertices, [], faces)
    mesh.update(calc_edges=True)
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    mesh.materials.append(assigned_material)
    obj["mf_schema"] = SCHEMA
    obj["mf_role"] = role
    obj["mf_lod"] = lod
    obj["mf_runtime_accepted"] = False
    return obj


def local_surface_max(reference, x, y, width, length):
    half_width = width * 0.5 + 0.03
    half_length = length * 0.5 + 0.03
    samples = [
        vertex.co.z for vertex in reference.data.vertices
        if abs(vertex.co.x - x) <= half_width and abs(vertex.co.y - y) <= half_length
    ]
    if not samples:
        nearest = sorted(
            reference.data.vertices,
            key=lambda vertex: (vertex.co.x - x) ** 2 + (vertex.co.y - y) ** 2,
        )[:24]
        samples = [vertex.co.z for vertex in nearest]
    return max(samples), len(samples)


def surface_box(reference, x, y, width, length, height, role, clearance_records, clearance=None):
    surface_z, samples = local_surface_max(reference, x, y, width, length)
    clearance = DETAIL_SURFACE_CLEARANCE_M if clearance is None else clearance
    bottom_z = surface_z + clearance
    clearance_records.append({
        "role": role,
        "centerXY": [round(x, 6), round(y, 6)],
        "footprintM": [round(width, 6), round(length, 6)],
        "surfaceSamples": samples,
        "surfaceMaxZ": round(surface_z, 7),
        "bottomZ": round(bottom_z, 7),
        "clearanceM": round(bottom_z - surface_z, 7),
    })
    return ((x, y, bottom_z + height * 0.5), (width, length, height))


def create_details(collection, lod, reference, materials):
    clearance_records = []
    joints = []
    for y in (-18.45, 18.45):
        for x in (-4.25, 4.25):
            joints.append(surface_box(
                reference, x, y, 5.80, 0.22, 0.024,
                "transverse_tiling_joint_band", clearance_records,
            ))

    # Long bars intersected the uneven generated rail. Segmenting the service
    # channel lets each section follow its local high point while keeping a
    # deterministic 0.18 m expansion gap and never crossing the end bands.
    segment_count = 10
    total_length = 36.50
    segment_gap = 0.18
    segment_length = (total_length - segment_gap * (segment_count - 1)) / segment_count
    segment_start = -total_length * 0.5 + segment_length * 0.5
    beds = []
    lights = []
    for x in (-7.55, 7.55):
        for segment in range(segment_count):
            y = segment_start + segment * (segment_length + segment_gap)
            bed = surface_box(
                reference, x, y, 0.32, segment_length, 0.045,
                "service_channel_bed", clearance_records,
            )
            beds.append(bed)
            bed_top = bed[0][2] + bed[1][2] * 0.5
            light_height = 0.022
            surface_z, samples = local_surface_max(reference, x, y, 0.085, segment_length - 0.08)
            light_bottom = max(bed_top + 0.006, surface_z + DETAIL_SURFACE_CLEARANCE_M)
            lights.append(((x, y, light_bottom + light_height * 0.5), (0.085, segment_length - 0.08, light_height)))
            clearance_records.append({
                "role": "restrained_cyan_service_channel",
                "centerXY": [round(x, 6), round(y, 6)],
                "footprintM": [0.085, round(segment_length - 0.08, 6)],
                "surfaceSamples": samples,
                "surfaceMaxZ": round(surface_z, 7),
                "bottomZ": round(light_bottom, 7),
                "clearanceM": round(light_bottom - surface_z, 7),
                "bedSeparationM": 0.006,
            })

    markings = []
    if lod <= 1:
        step = 4.3 if lod == 0 else 7.0
        dash_length = 2.25 if lod == 0 else 3.1
        y = -16.0
        while y <= 16.01:
            for x in (-4.15, 4.15):
                markings.append(surface_box(
                    reference, x, y, 0.19, dash_length, 0.018,
                    "four_lane_marking", clearance_records, clearance=0.012,
                ))
            y += step
    objects = [
        boxes_object(collection, PREFIX + "_LOD%d_JOINT_BANDS" % lod, joints, materials["joint"],
                     "transverse_tiling_joint_bands", lod),
        boxes_object(collection, PREFIX + "_LOD%d_SERVICE_BEDS" % lod, beds, materials["service"],
                     "service_channel_beds", lod),
        boxes_object(collection, PREFIX + "_LOD%d_CYAN_CHANNELS" % lod, lights, materials["emissive"],
                     "restrained_cyan_service_channels", lod),
        boxes_object(collection, PREFIX + "_LOD%d_FOUR_LANE_MARKINGS" % lod, markings, materials["marking"],
                     "four_lane_markings", lod),
    ]
    active = [obj for obj in objects if obj is not None]
    clearances = [record["clearanceM"] for record in clearance_records]
    return active, {
        "placements": len(clearance_records),
        "minimumClearanceM": min(clearances) if clearances else None,
        "intersectionsFound": sum(1 for value in clearances if value < -1e-6),
        "coplanarPlacementsFound": sum(1 for value in clearances if abs(value) <= 1e-6),
        "records": clearance_records,
    }


def create_box_mesh(collection, name, size, center, assigned_material, role):
    return boxes_object(collection, name, [(center, size)], assigned_material, role, -1)


def create_socket(collection, name, y, deck_z, direction):
    obj = bpy.data.objects.new(name, None)
    collection.objects.link(obj)
    obj.location = (0.0, y, deck_z)
    obj.rotation_euler[2] = 0.0 if direction == "N" else math.pi
    obj.empty_display_type = "ARROWS"
    obj.empty_display_size = 1.7
    obj["mf_schema"] = SCHEMA
    obj["mf_role"] = "road_socket"
    obj["mf_direction"] = direction
    obj["mf_socket_type"] = "primary_road_20m"
    obj["mf_envelope_width_m"] = TARGET_WIDTH_M
    obj["mf_lane_count"] = LANE_COUNT
    obj["mf_clearance_width_m"] = 14.5
    obj["mf_runtime_accepted"] = False
    return obj


def build_derived(master, reference, deck, materials):
    derived = linked_collection(master, PREFIX + "_DERIVED_REVIEW")
    clean_base, cleanup_report = create_clean_base(reference, derived)
    lod_records = []
    lod_entries = []
    surface_placement = []
    for lod in range(3):
        collection = linked_collection(derived, PREFIX + "_LOD%d" % lod)
        render = duplicate_lod(clean_base, collection, lod, LOD_TARGETS[lod])
        details, placement = create_details(collection, lod, clean_base, materials)
        objects = [render] + details
        lod_records.append({
            "name": "LOD%d" % lod,
            "targetTriangles": LOD_TARGETS[lod],
            "renderMeshTriangles": triangle_count(render),
            "detailTriangles": sum(triangle_count(obj) for obj in details),
            "totalTriangles": sum(triangle_count(obj) for obj in objects),
        })
        lod_entries.append({"lod": lod, "collection": collection, "render": render, "details": details, "objects": objects})
        surface_placement.append({"lod": lod, **placement})

    proxy_collection = linked_collection(master, PREFIX + "_PROXIES")
    collision = create_box_mesh(
        proxy_collection, PREFIX + "_COLLISION", (14.5, 40.0, 0.34),
        (0.0, 0.0, deck["z"] - 0.18), materials["collision"], "simplified_collision",
    )
    collision.hide_render = True
    collision.display_type = "WIRE"
    collision["mf_collision_kind"] = "driveable_deck_box"
    collision["mf_clearance_width_m"] = 14.5
    nav = create_box_mesh(
        proxy_collection, PREFIX + "_NAV_PROXY", (14.5, 40.0, 0.04),
        (0.0, 0.0, deck["z"] + 0.01), materials["nav"], "navigation_proxy",
    )
    nav.hide_render = True
    nav.display_type = "WIRE"
    nav["mf_nav_cost"] = 0.72
    nav["mf_lane_count"] = LANE_COUNT
    nav["mf_clearance_classes"] = "infantry,light,heavy"
    sockets = [
        create_socket(proxy_collection, "SOCKET_ROAD_N", 20.0, deck["z"], "N"),
        create_socket(proxy_collection, "SOCKET_ROAD_S", -20.0, deck["z"], "S"),
    ]
    return lod_entries, lod_records, collision, nav, sockets, clean_base, cleanup_report, surface_placement


def select_only(objects):
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.hide_viewport = False
        obj.select_set(True)
    meshes = [obj for obj in objects if obj.type == "MESH"]
    bpy.context.view_layer.objects.active = meshes[0] if meshes else objects[0]


def export_selected(path, objects):
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    select_only(objects)
    bpy.ops.export_scene.gltf(
        filepath=path, export_format="GLB", use_selection=True, export_apply=True,
        export_extras=True, export_cameras=False, export_lights=False, export_yup=True,
    )
    return file_record(path)


def export_reviews(config, reference, lod_entries, collision, nav, sockets):
    export_dir = Path(config["export_dir"])
    export_dir.mkdir(parents=True, exist_ok=True)
    records = {
        "reference": export_selected(
            str(export_dir / "mf-road-straight-hunyuan-normalized-reference-review.glb"), [reference] + sockets,
        ),
        "lods": [],
        "collision": export_selected(
            str(export_dir / "mf-road-straight-hunyuan-clean-v1-collision-review.glb"), [collision],
        ),
        "nav": export_selected(
            str(export_dir / "mf-road-straight-hunyuan-clean-v1-nav-review.glb"), [nav] + sockets,
        ),
    }
    for entry in lod_entries:
        output = export_dir / ("mf-road-straight-hunyuan-clean-v1-lod%d-review.glb" % entry["lod"])
        record = export_selected(str(output), entry["objects"] + sockets)
        record["lod"] = entry["lod"]
        record["triangles"] = sum(triangle_count(obj) for obj in entry["objects"])
        records["lods"].append(record)
    reference.hide_viewport = True
    return records


def add_evidence_rig(master):
    collection = linked_collection(master, PREFIX + "_EVIDENCE_RIG")
    floor_mat = material("evidence_floor", (0.022, 0.031, 0.040, 1.0), 0.06, 0.88)
    floor = create_box_mesh(collection, PREFIX + "_EVIDENCE_FLOOR", (66.0, 74.0, 0.10),
                            (0.0, 0.0, -0.08), floor_mat, "evidence_only")
    floor["mf_evidence_only"] = True

    def area(name, location, energy, size, color):
        data = bpy.data.lights.new(PREFIX + "_" + name, "AREA")
        data.energy, data.shape, data.size, data.color = energy, "DISK", size, color
        obj = bpy.data.objects.new(PREFIX + "_" + name, data)
        collection.objects.link(obj)
        obj.location = location
        obj.rotation_euler = (Vector((0.0, 0.0, 0.4)) - obj.location).to_track_quat("-Z", "Y").to_euler()
        obj["mf_evidence_only"] = True
        return obj

    # Review evidence must expose the generated albedo and surface silhouette;
    # it is not a cinematic darkness test. Broad neutral sources keep the
    # textured reference readable while a restrained warm rim separates edges.
    area("KEY", (34.0, -35.0, 48.0), 7600.0, 28.0, (0.86, 0.94, 1.0))
    area("FILL", (-28.0, -12.0, 30.0), 4800.0, 24.0, (0.50, 0.68, 0.92))
    area("RIM", (-18.0, 34.0, 28.0), 3800.0, 20.0, (1.0, 0.62, 0.36))
    camera_data = bpy.data.cameras.new(PREFIX + "_CAMERA")
    camera_data.type = "ORTHO"
    camera = bpy.data.objects.new(PREFIX + "_CAMERA", camera_data)
    collection.objects.link(camera)
    camera["mf_evidence_only"] = True
    bpy.context.scene.camera = camera
    return floor, camera


def configure_render(config):
    scene = bpy.context.scene
    # Blender 5.x exposes Eevee as BLENDER_EEVEE, while 4.x used
    # BLENDER_EEVEE_NEXT. Select the first enum supported by this runtime so
    # the authoring build is reproducible across both installed toolchains.
    engine_items = scene.bl_rna.properties["render"].fixed_type.properties["engine"].enum_items
    engine_ids = {item.identifier for item in engine_items}
    scene.render.engine = "BLENDER_EEVEE" if "BLENDER_EEVEE" in engine_ids else "BLENDER_EEVEE_NEXT"
    scene.render.resolution_x = 1024
    scene.render.resolution_y = 1024
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.film_transparent = False
    if scene.world is None:
        scene.world = bpy.data.worlds.new(PREFIX + "_WORLD")
    scene.world.use_nodes = True
    background = scene.world.node_tree.nodes.get("Background")
    background.inputs["Color"].default_value = (0.008, 0.013, 0.020, 1.0)
    background.inputs["Strength"].default_value = 0.62
    scene.view_settings.exposure = 1.0
    try:
        scene.view_settings.look = "AgX - Medium Low Contrast"
    except (TypeError, AttributeError):
        pass


def point_camera(camera, target, direction, scale):
    target = Vector(target)
    direction = Vector(direction).normalized()
    camera.location = target + direction * scale * 1.65
    camera.rotation_euler = (target - camera.location).to_track_quat("-Z", "Y").to_euler()
    camera.data.ortho_scale = scale


def set_render_visibility(reference, lod_entries, mode):
    reference.hide_render = mode != "reference"
    for entry in lod_entries:
        visible = mode == "clean" and entry["lod"] == 0
        for obj in entry["objects"]:
            obj.hide_render = not visible


def render_evidence(config, reference, lod_entries, camera, target_z):
    directory = Path(config["evidence_dir"])
    directory.mkdir(parents=True, exist_ok=True)
    reference.hide_viewport = False
    views = {
        "iso": ((1.0, -1.25, 0.82), 52.0),
        "top": ((0.0, -0.001, 1.0), 46.0),
        "low_entry": ((0.0, -1.0, 0.24), 48.0),
    }
    generated = {reference, camera}
    for entry in lod_entries:
        generated.update(entry["objects"])
    generated.update(obj for obj in bpy.context.scene.objects if obj.get("mf_evidence_only"))
    unrelated = [(obj, obj.hide_render) for obj in bpy.context.scene.objects if obj not in generated]
    for obj, _ in unrelated:
        obj.hide_render = True
    records = []
    try:
        for view, (direction, scale) in views.items():
            point_camera(camera, (0.0, 0.0, target_z), direction, scale)
            camera_state = {
                "location": [round(value, 6) for value in camera.location],
                "rotationEuler": [round(value, 6) for value in camera.rotation_euler],
                "orthoScale": scale,
            }
            for mode in ("reference", "clean"):
                set_render_visibility(reference, lod_entries, mode)
                output = directory / ("mf-road-straight-hunyuan-%s-%s-1024.png" % (mode, view))
                bpy.context.scene.render.filepath = str(output)
                bpy.ops.render.render(write_still=True)
                record = file_record(str(output))
                record.update({"view": view, "mode": mode, "width": 1024, "height": 1024, "camera": camera_state})
                records.append(record)
        return records
    finally:
        for obj, state in unrelated:
            obj.hide_render = state
        set_render_visibility(reference, lod_entries, "clean")
        reference.hide_viewport = True


def material_inventory(reference):
    records = []
    for slot in reference.material_slots:
        material = slot.material
        if material is None:
            continue
        images = []
        if material.use_nodes:
            for node in material.node_tree.nodes:
                if node.type == "TEX_IMAGE" and node.image:
                    images.append({
                        "name": node.image.name,
                        "width": node.image.size[0],
                        "height": node.image.size[1],
                        "source": node.image.source,
                    })
        records.append({"name": material.name, "images": images})
    return records


def build_cleanup(overrides=None):
    config = merged_config(overrides)
    clear_previous_generation()
    master = bpy.data.collections.new(MASTER_COLLECTION)
    bpy.context.scene.collection.children.link(master)
    master["mf_schema"] = SCHEMA
    master["mf_runtime_accepted"] = False
    master["mf_source_authoring_only"] = True
    reference, source_report, normalization, before_bounds, after_bounds = import_reference(config, master)
    deck = estimate_deck_height(reference)
    materials = create_materials()
    (
        lod_entries, lod_records, collision, nav, sockets, clean_base,
        cleanup_report, surface_placement,
    ) = build_derived(master, reference, deck, materials)
    floor, camera = add_evidence_rig(master)
    configure_render(config)
    bpy.context.view_layer.update()

    exports = export_reviews(config, reference, lod_entries, collision, nav, sockets) if config["export_review_glbs"] else {}
    renders = render_evidence(config, reference, lod_entries, camera, deck["z"] * 0.35) if config["render_evidence"] else []
    if config["save_blend"]:
        Path(config["blend_path"]).parent.mkdir(parents=True, exist_ok=True)
        bpy.ops.wm.save_as_mainfile(filepath=config["blend_path"])

    source_after = sha256(config["source_glb"])
    if source_after != EXPECTED_SOURCE_SHA256:
        raise RuntimeError("source GLB changed during build")
    report = {
        "schema": SCHEMA,
        "status": "SOURCE_AUTHORING_ONLY",
        "runtimeAccepted": False,
        "visualAccepted": False,
        "source": file_record(config["source_glb"]),
        "sourceGenerationReport": file_record(config["source_report"]),
        "sourceGenerator": source_report.get("generator"),
        "normalization": {
            "targetEnvelopeM": {"width": TARGET_WIDTH_M, "length": TARGET_LENGTH_M},
            "originPolicy": "footprint-center at X/Y zero; contact floor at Z zero",
            "before": before_bounds,
            "after": after_bounds,
            "sharedIntakeResult": normalization,
        },
        "sourceReference": {
            "name": reference.name,
            "triangles": triangle_count(reference),
            "retainedInBlend": True,
            "hiddenByDefault": True,
            "materials": material_inventory(reference),
            "knownTextureLimitations": [
                "source PBR material is reference-only",
                "embedded JPEG base color and PNG metallic-roughness are present",
                "no verified normal map",
                "no verified ambient-occlusion map",
                "no verified emissive map",
                "clean cyan channels use separate authored material and geometry",
            ],
        },
        "connectedComponentCleanup": cleanup_report,
        "cleanBase": {
            "name": clean_base.name,
            "triangles": triangle_count(clean_base),
            "retainedInBlend": True,
            "hiddenByDefault": True,
        },
        "deckHeightEstimate": deck,
        "surfacePlacementEvidence": surface_placement,
        "lods": lod_records,
        "collision": {
            "name": collision.name,
            "triangles": triangle_count(collision),
            "dimensionsM": [14.5, 40.0, 0.34],
        },
        "navProxy": {
            "name": nav.name,
            "triangles": triangle_count(nav),
            "laneCount": LANE_COUNT,
            "clearanceWidthM": 14.5,
        },
        "sockets": [
            {"name": obj.name, "direction": obj["mf_direction"], "position": [round(v, 6) for v in obj.location]}
            for obj in sockets
        ],
        "authoredCleanup": [
            "normalized high-detail reference retained",
            "strict micro-component quarantine with exact-envelope protection",
            "source face winding preserved without global disconnected-island normal recalculation",
            "clean render LOD0/1/2 named and validated",
            "locally surface-cleared transverse end-joint bands mask drive-deck tiling seams",
            "four-lane divider markings",
            "segmented restrained cyan emissive service channels with separate dark beds",
            "separate simplified collision and navigation proxies",
            "north/south 40 m modular sockets and clearance metadata",
        ],
        "exports": exports,
        "evidence": {
            "resolution": [1024, 1024],
            "sameCameraPairs": True,
            "renders": renders,
        },
        "blend": file_record(config["blend_path"]) if config["save_blend"] else None,
        "requiredNextSteps": [
            "human review of strict micro-island removal against rail silhouette and decorative detail",
            "author and verify normal, AO, and emissive texture inputs",
            "phone tactical and command-zoom runtime evidence",
            "explicit runtime acceptance decision before any manifest registration",
        ],
    }
    report_path = Path(config["report_path"])
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "status": report["status"], "runtimeAccepted": False,
        "lodTriangles": [entry["totalTriangles"] for entry in lod_records],
        "report": report_path.resolve().relative_to(repository_root()).as_posix(),
    }, separators=(",", ":")))
    return report


def arguments():
    values = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    if len(values) > 1:
        raise SystemExit("usage: blender --background --python build-hf-road-cleanup.py -- [CONFIG.json]")
    if not values:
        return None
    with open(values[0], "r", encoding="utf-8") as source:
        return json.load(source)


if __name__ == "__main__":
    build_cleanup(arguments())
