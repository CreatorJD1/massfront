"""Build deterministic source-only junctions around the cleaned Hunyuan road.

The script reads the immutable review GLB produced by build-hf-road-cleanup.py
only as a cross-section/seam reference. It authors five new grid-compatible
pieces in an isolated collection and output folder. Nothing is registered with
MASSFRONT runtime.
"""

import bpy
import hashlib
import json
import math
import os
import sys
from pathlib import Path
from mathutils import Vector


SCHEMA = "MassfrontHunyuanRoadJunctionsV1"
PREFIX = "MF_HF_JUNCTION_V1"
MASTER_COLLECTION = PREFIX + "_SOURCE"
STRAIGHT_SHA256 = "69D406836DB64BAF6154761332E04260DA8EF0A95C29FB006317834178EDC2F9"
GRID_M = 40.0
HALF_GRID_M = 20.0
PRIMARY_WIDTH_M = 20.0
LOCAL_WIDTH_M = 12.0
ROAD_SURFACE_Z = 1.9162261486053467
UNDERDECK_TOP_Z = 1.60
DETAIL_CLEARANCE_M = 0.012

PIECES = (
    {"id": "corner_90", "connections": ("S", "E")},
    {"id": "t_junction", "connections": ("S", "E", "W")},
    {"id": "x_plaza", "connections": ("N", "E", "S", "W")},
    {"id": "straight_endcap", "connections": ("S",), "endcap": True},
    {
        "id": "primary_local_adapter", "connections": ("S", "N"), "adapter": True,
        "socketWidths": {"S": PRIMARY_WIDTH_M, "N": LOCAL_WIDTH_M},
    },
)

CARDINALS = {
    "N": {"position": (0.0, HALF_GRID_M, ROAD_SURFACE_Z), "rotation": 0.0},
    "E": {"position": (HALF_GRID_M, 0.0, ROAD_SURFACE_Z), "rotation": -math.pi * 0.5},
    "S": {"position": (0.0, -HALF_GRID_M, ROAD_SURFACE_Z), "rotation": math.pi},
    "W": {"position": (-HALF_GRID_M, 0.0, ROAD_SURFACE_Z), "rotation": math.pi * 0.5},
}


def repository_root():
    return Path(__file__).resolve().parents[3]


def default_config():
    repo = repository_root()
    straight_root = (
        repo / "modules" / "space_exploration" / "assets" / "source" / "blender"
        / "world-kits" / "mf-road-straight-hunyuan-clean-v1"
    )
    output = straight_root.parent / "mf-road-junctions-v1"
    return {
        "straight_glb": str(straight_root / "review-exports" / "mf-road-straight-hunyuan-clean-v1-lod0-review.glb"),
        "straight_report": str(straight_root / "mf-road-straight-hunyuan-clean-v1.provenance.json"),
        "output_dir": str(output),
        "blend_path": str(output / "mf-road-junctions-v1.blend"),
        "report_path": str(output / "mf-road-junctions-v1.provenance.json"),
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
            raise ValueError("unknown junction config keys: " + ", ".join(unknown))
        config.update(overrides)
    for key in ("straight_glb", "straight_report", "output_dir", "blend_path", "report_path", "export_dir", "evidence_dir"):
        config[key] = os.path.abspath(os.path.expanduser(str(config[key])))
    config["render_resolution"] = 1024
    return config


def sha256(path):
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
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


def set_socket(node, names, value):
    for name in names:
        socket = node.inputs.get(name)
        if socket is not None:
            socket.default_value = value
            return socket
    return None


def make_material(name, color, metallic, roughness, emission=None, procedural=False):
    material = bpy.data.materials.new(PREFIX + "_MAT_" + name.upper())
    material.diffuse_color = color
    material.use_nodes = True
    material["mf_schema"] = SCHEMA
    material["mf_material_role"] = name
    material["mf_runtime_accepted"] = False
    bsdf = material.node_tree.nodes.get("Principled BSDF")
    set_socket(bsdf, ("Base Color",), color)
    set_socket(bsdf, ("Metallic",), metallic)
    set_socket(bsdf, ("Roughness",), roughness)
    if emission:
        set_socket(bsdf, ("Emission Color", "Emission"), emission[0])
        set_socket(bsdf, ("Emission Strength",), emission[1])
    if procedural:
        nodes = material.node_tree.nodes
        links = material.node_tree.links
        noise = nodes.new("ShaderNodeTexNoise")
        noise.name = PREFIX + "_SUBTLE_SURFACE_NOISE"
        noise.inputs["Scale"].default_value = 7.5 if name == "road_surface" else 4.0
        noise.inputs["Detail"].default_value = 3.0
        noise.inputs["Roughness"].default_value = 0.56
        bump = nodes.new("ShaderNodeBump")
        bump.inputs["Strength"].default_value = 0.16
        bump.inputs["Distance"].default_value = 0.055
        links.new(noise.outputs["Fac"], bump.inputs["Height"])
        normal = bsdf.inputs.get("Normal")
        if normal is not None:
            links.new(bump.outputs["Normal"], normal)
    return material


def create_materials():
    return {
        "road": make_material("road_surface", (0.112, 0.124, 0.132, 1.0), 0.08, 0.80, procedural=True),
        "road_patch": make_material("road_repair_patch", (0.095, 0.112, 0.122, 1.0), 0.16, 0.86, procedural=True),
        "curb": make_material("curb_service_shoulder", (0.43, 0.465, 0.47, 1.0), 0.38, 0.52, procedural=True),
        "curb_dark": make_material("curb_inset", (0.17, 0.205, 0.22, 1.0), 0.52, 0.48, procedural=True),
        "metal": make_material("structural_metal", (0.095, 0.13, 0.165, 1.0), 0.77, 0.31),
        "service": make_material("service_median", (0.105, 0.17, 0.19, 1.0), 0.60, 0.43),
        "paving": make_material("plaza_paving", (0.25, 0.275, 0.28, 1.0), 0.30, 0.60, procedural=True),
        "panel": make_material("junction_service_panel", (0.31, 0.345, 0.35, 1.0), 0.48, 0.43, procedural=True),
        "marking": make_material("lane_marking", (0.72, 0.735, 0.70, 1.0), 0.05, 0.70),
        "cyan": make_material(
            "restrained_cyan_guidance", (0.012, 0.12, 0.15, 1.0), 0.08, 0.34,
            emission=((0.01, 0.25, 0.31, 1.0), 0.85),
        ),
        "hazard": make_material(
            "hazard_marker", (0.48, 0.145, 0.012, 1.0), 0.10, 0.48,
            emission=((0.64, 0.09, 0.006, 1.0), 0.12),
        ),
        "drain": make_material("drainage_grate", (0.025, 0.034, 0.041, 1.0), 0.82, 0.25),
        "collision": make_material("review_collision", (0.52, 0.08, 0.025, 1.0), 0.0, 1.0),
        "nav": make_material("review_navigation", (0.01, 0.34, 0.12, 1.0), 0.0, 1.0),
    }


def mesh_object(collection, name, vertices, faces, material, role, lod, parent=None):
    mesh = bpy.data.meshes.new(name + "_MESH")
    mesh.from_pydata(vertices, [], faces)
    mesh.update(calc_edges=True)
    mesh.materials.append(material)
    mesh["mf_schema"] = SCHEMA
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    obj["mf_schema"] = SCHEMA
    obj["mf_role"] = role
    obj["mf_lod"] = lod
    obj["mf_runtime_accepted"] = False
    if parent is not None:
        obj.parent = parent
    return obj


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
        (base, base + 3, base + 2, base + 1), (base + 4, base + 5, base + 6, base + 7),
        (base, base + 1, base + 5, base + 4), (base + 1, base + 2, base + 6, base + 5),
        (base + 2, base + 3, base + 7, base + 6), (base + 3, base, base + 4, base + 7),
    ))


def bevel_object(obj, width, segments):
    if width <= 0.0:
        return
    bpy.ops.object.select_all(action="DESELECT")
    obj.hide_viewport = False
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    modifier = obj.modifiers.new(PREFIX + "_BEVEL", "BEVEL")
    modifier.width = width
    modifier.segments = segments
    modifier.limit_method = "ANGLE"
    bpy.ops.object.modifier_apply(modifier=modifier.name)


def bounds_record(center, size, name, role):
    half_x, half_y = size[0] * 0.5, size[1] * 0.5
    return {
        "name": name,
        "role": role,
        "min": [center[index] - size[index] * 0.5 for index in range(3)],
        "max": [center[index] + size[index] * 0.5 for index in range(3)],
        "xyPoints": [
            [center[0] - half_x, center[1] - half_y],
            [center[0] + half_x, center[1] - half_y],
            [center[0] + half_x, center[1] + half_y],
            [center[0] - half_x, center[1] + half_y],
        ],
    }


def add_box(context, name, center, size, material, role, bevel=0.0):
    vertices, faces = [], []
    append_box(vertices, faces, center, size)
    obj = mesh_object(context["collection"], context["prefix"] + "_" + name, vertices, faces, material, role, context["lod"], context["root"])
    bevel_object(obj, bevel, 3 if context["lod"] == 0 else 2 if context["lod"] == 1 else 1)
    context["objects"].append(obj)
    context["geometry"].append(bounds_record(center, size, obj.name, role))
    return obj


def add_prism(context, name, points, bottom, top, material, role, bevel=0.0):
    count = len(points)
    vertices = [(x, y, bottom) for x, y in points] + [(x, y, top) for x, y in points]
    faces = [tuple(reversed(range(count))), tuple(range(count, count * 2))]
    for index in range(count):
        nxt = (index + 1) % count
        faces.append((index, nxt, count + nxt, count + index))
    obj = mesh_object(context["collection"], context["prefix"] + "_" + name, vertices, faces, material, role, context["lod"], context["root"])
    bevel_object(obj, bevel, 3 if context["lod"] == 0 else 2 if context["lod"] == 1 else 1)
    context["objects"].append(obj)
    minimum = [min(point[0] for point in points), min(point[1] for point in points), bottom]
    maximum = [max(point[0] for point in points), max(point[1] for point in points), top]
    context["geometry"].append({
        "name": obj.name, "role": role, "min": minimum, "max": maximum,
        "xyPoints": [[point[0], point[1]] for point in points],
    })
    return obj


def add_box_between(context, name, first, second, width, bottom, top, material, role, bevel=0.0):
    x1, y1 = first
    x2, y2 = second
    length = math.hypot(x2 - x1, y2 - y1)
    if length <= 1e-8:
        raise RuntimeError("cannot author a zero-length strip")
    ux, uy = (x2 - x1) / length, (y2 - y1) / length
    px, py = -uy * width * 0.5, ux * width * 0.5
    points = [(x1 + px, y1 + py), (x2 + px, y2 + py), (x2 - px, y2 - py), (x1 - px, y1 - py)]
    return add_prism(context, name, points, bottom, top, material, role, bevel)


def add_empty(collection, name, location, role, parent=None):
    obj = bpy.data.objects.new(name, None)
    collection.objects.link(obj)
    obj.location = location
    obj.empty_display_type = "ARROWS"
    obj.empty_display_size = 1.5
    obj["mf_schema"] = SCHEMA
    obj["mf_role"] = role
    obj["mf_runtime_accepted"] = False
    if parent is not None:
        obj.parent = parent
    return obj


def add_guidance_segments(context, axis, fixed, start, end, materials, label):
    count = 3 if context["lod"] == 0 else 2 if context["lod"] == 1 else 1
    gap = 0.72
    total = end - start
    length = (total - gap * (count - 1)) / count
    for index in range(count):
        variable = start + length * 0.5 + index * (length + gap)
        if axis == "y":
            center, size = (fixed, variable, 2.214), (0.055, length, 0.022)
        else:
            center, size = (variable, fixed, 2.214), (length, 0.055, 0.022)
        add_box(context, "%s_GUIDE_%02d" % (label, index), center, size, materials["cyan"], "cyan_guidance", 0.012)


def add_raised_edge_barrier(context, direction, side, center, length, materials, label):
    """Author a proper shoulder silhouette, not a surface-only painted edge."""
    fixed = side * 9.46
    if direction in ("N", "S"):
        barrier_center, barrier_size = (fixed, center, 2.204), (0.62, length - 0.9, 0.552)
        axis = "y"
    else:
        barrier_center, barrier_size = (center, fixed, 2.204), (length - 0.9, 0.62, 0.552)
        axis = "x"
    add_box(context, label + "_BARRIER", barrier_center, barrier_size, materials["curb"], "raised_edge_barrier", 0.10)
    segment_count = 3 if context["lod"] == 0 else 2 if context["lod"] == 1 else 1
    span = length - 1.25
    gap = 0.22
    segment_length = (span - gap * (segment_count - 1)) / segment_count
    for index in range(segment_count):
        variable = center - span * 0.5 + segment_length * 0.5 + index * (segment_length + gap)
        if axis == "y":
            guide_center, guide_size = (fixed, variable, 2.506), (0.052, segment_length, 0.022)
        else:
            guide_center, guide_size = (variable, fixed, 2.506), (segment_length, 0.052, 0.022)
        add_box(context, "%s_BARRIER_GUIDE_%02d" % (label, index), guide_center, guide_size, materials["cyan"], "barrier_inset_guidance", 0.012)
    if context["lod"] == 0:
        for index, variable in enumerate((center - length * 0.36, center + length * 0.36)):
            post_center = (fixed, variable, 2.69) if axis == "y" else (variable, fixed, 2.69)
            add_box(context, "%s_SERVICE_POST_%02d" % (label, index), post_center, (0.28, 0.28, 0.34), materials["hazard"], "shoulder_service_post", 0.045)


def add_dashed_lines(context, direction, center, length, materials, label):
    if context["lod"] == 2:
        return
    count = 4 if context["lod"] == 0 else 2
    dash = 1.8 if context["lod"] == 0 else 2.8
    for side in (-4.25, 4.25):
        for index in range(count):
            offset = -length * 0.5 + 2.0 + index * ((length - 4.0) / max(1, count - 1))
            if direction in ("N", "S"):
                box_center, size = (side, center + offset, ROAD_SURFACE_Z + 0.023), (0.18, dash, 0.022)
            else:
                box_center, size = (center + offset, side, ROAD_SURFACE_Z + 0.023), (dash, 0.18, 0.022)
            add_box(context, "%s_MARK_%s_%02d" % (label, "L" if side < 0 else "R", index), box_center, size, materials["marking"], "lane_marking", 0.008)


def add_vertical_arm(context, direction, materials):
    sign = 1.0 if direction == "N" else -1.0
    # The central junction is a full 20 x 20 m deck.  Arms occupy the
    # remaining 10 m to the socket so perpendicular shoulders only meet at a
    # shared boundary; they never form intersecting corner volumes.
    center_y = sign * 15.0
    length = 10.0
    add_box(context, direction + "_UNDERDECK", (0.0, center_y, UNDERDECK_TOP_Z * 0.5), (20.0, length, UNDERDECK_TOP_Z), materials["metal"], "structural_underdeck", 0.18)
    add_box(context, direction + "_ROAD", (0.0, center_y, (UNDERDECK_TOP_Z + ROAD_SURFACE_Z) * 0.5), (14.4, length, ROAD_SURFACE_Z - UNDERDECK_TOP_Z), materials["road"], "road_surface", 0.08)
    for side in (-1.0, 1.0):
        add_box(context, "%s_SHOULDER_%s" % (direction, "L" if side < 0 else "R"), (side * 8.6, center_y, (UNDERDECK_TOP_Z + ROAD_SURFACE_Z) * 0.5), (2.8, length, ROAD_SURFACE_Z - UNDERDECK_TOP_Z), materials["curb"], "service_shoulder", 0.08)
        add_box(context, "%s_CURB_%s" % (direction, "L" if side < 0 else "R"), (side * 7.58, center_y, 2.055), (0.34, length - 0.3, 0.254), materials["curb"], "raised_curb", 0.07)
        add_raised_edge_barrier(context, direction, side, center_y, length, materials, "%s_%s" % (direction, "L" if side < 0 else "R"))
        if context["lod"] == 0:
            for index, y in enumerate((center_y - 2.7, center_y + 2.7)):
                add_box(context, "%s_DRAIN_%s_%d" % (direction, "L" if side < 0 else "R", index), (side * 6.98, y, ROAD_SURFACE_Z + 0.021), (0.28, 1.05, 0.018), materials["drain"], "drainage_service_panel", 0.01)
    add_box(context, direction + "_MEDIAN", (0.0, center_y, 2.045), (2.45, length, 0.234), materials["service"], "central_service_median", 0.12)
    add_guidance_segments(context, "y", 0.0, center_y - 4.65, center_y + 4.65, materials, direction + "_MEDIAN")
    add_dashed_lines(context, direction, center_y, length, materials, direction)
    socket_y = sign * 19.72
    add_box(context, direction + "_SOCKET_JOINT_L", (-4.25, socket_y, ROAD_SURFACE_Z + 0.024), (5.75, 0.46, 0.024), materials["metal"], "socket_joint_band", 0.008)
    add_box(context, direction + "_SOCKET_JOINT_R", (4.25, socket_y, ROAD_SURFACE_Z + 0.024), (5.75, 0.46, 0.024), materials["metal"], "socket_joint_band", 0.008)
    add_box(context, direction + "_SOCKET_JOINT_MEDIAN", (0.0, socket_y, 2.183), (2.15, 0.46, 0.026), materials["metal"], "median_socket_joint", 0.008)


def add_horizontal_arm(context, direction, materials):
    sign = 1.0 if direction == "E" else -1.0
    center_x = sign * 15.0
    length = 10.0
    add_box(context, direction + "_UNDERDECK", (center_x, 0.0, UNDERDECK_TOP_Z * 0.5), (length, 20.0, UNDERDECK_TOP_Z), materials["metal"], "structural_underdeck", 0.18)
    add_box(context, direction + "_ROAD", (center_x, 0.0, (UNDERDECK_TOP_Z + ROAD_SURFACE_Z) * 0.5), (length, 14.4, ROAD_SURFACE_Z - UNDERDECK_TOP_Z), materials["road"], "road_surface", 0.08)
    for side in (-1.0, 1.0):
        add_box(context, "%s_SHOULDER_%s" % (direction, "D" if side < 0 else "U"), (center_x, side * 8.6, (UNDERDECK_TOP_Z + ROAD_SURFACE_Z) * 0.5), (length, 2.8, ROAD_SURFACE_Z - UNDERDECK_TOP_Z), materials["curb"], "service_shoulder", 0.08)
        add_box(context, "%s_CURB_%s" % (direction, "D" if side < 0 else "U"), (center_x, side * 7.58, 2.055), (length - 0.3, 0.34, 0.254), materials["curb"], "raised_curb", 0.07)
        add_raised_edge_barrier(context, direction, side, center_x, length, materials, "%s_%s" % (direction, "D" if side < 0 else "U"))
        if context["lod"] == 0:
            for index, x in enumerate((center_x - 2.7, center_x + 2.7)):
                add_box(context, "%s_DRAIN_%s_%d" % (direction, "D" if side < 0 else "U", index), (x, side * 6.98, ROAD_SURFACE_Z + 0.021), (1.05, 0.28, 0.018), materials["drain"], "drainage_service_panel", 0.01)
    add_box(context, direction + "_MEDIAN", (center_x, 0.0, 2.045), (length, 2.45, 0.234), materials["service"], "central_service_median", 0.12)
    add_guidance_segments(context, "x", 0.0, center_x - 4.65, center_x + 4.65, materials, direction + "_MEDIAN")
    add_dashed_lines(context, direction, center_x, length, materials, direction)
    socket_x = sign * 19.72
    add_box(context, direction + "_SOCKET_JOINT_D", (socket_x, -4.25, ROAD_SURFACE_Z + 0.024), (0.46, 5.75, 0.024), materials["metal"], "socket_joint_band", 0.008)
    add_box(context, direction + "_SOCKET_JOINT_U", (socket_x, 4.25, ROAD_SURFACE_Z + 0.024), (0.46, 5.75, 0.024), materials["metal"], "socket_joint_band", 0.008)
    add_box(context, direction + "_SOCKET_JOINT_MEDIAN", (socket_x, 0.0, 2.183), (0.46, 2.15, 0.026), materials["metal"], "median_socket_joint", 0.008)


def octagon(radius):
    return [(math.cos(math.pi * 0.25 * index + math.pi * 0.125) * radius, math.sin(math.pi * 0.25 * index + math.pi * 0.125) * radius) for index in range(8)]


def add_crosswalk(context, direction, materials):
    if context["lod"] == 2:
        return
    count = 5 if context["lod"] == 0 else 3
    step = 0.58 if context["lod"] == 0 else 0.92
    start = -step * (count - 1) * 0.5
    sign = 1.0 if direction in ("N", "E") else -1.0
    for index in range(count):
        offset = start + index * step
        if direction in ("N", "S"):
            center = (0.0, sign * 7.25 + offset, ROAD_SURFACE_Z + 0.024)
            size = (10.6, 0.30, 0.024)
        else:
            center = (sign * 7.25 + offset, 0.0, ROAD_SURFACE_Z + 0.024)
            size = (0.30, 10.6, 0.024)
        add_box(context, "CROSSWALK_%s_%02d" % (direction, index), center, size, materials["marking"], "junction_crosswalk", 0.008)


def add_segmented_ring(context, center, inner_radius, outer_radius, materials, label):
    segments = 12 if context["lod"] == 0 else 8 if context["lod"] == 1 else 6
    for index in range(segments):
        start = 2.0 * math.pi * index / segments
        end = 2.0 * math.pi * (index + 1) / segments
        points = [
            (center[0] + inner_radius * math.cos(start), center[1] + inner_radius * math.sin(start)),
            (center[0] + outer_radius * math.cos(start), center[1] + outer_radius * math.sin(start)),
            (center[0] + outer_radius * math.cos(end), center[1] + outer_radius * math.sin(end)),
            (center[0] + inner_radius * math.cos(end), center[1] + inner_radius * math.sin(end)),
        ]
        add_prism(context, "%s_%02d" % (label, index), points, ROAD_SURFACE_Z + DETAIL_CLEARANCE_M, ROAD_SURFACE_Z + 0.050, materials["marking"], "turnaround_lane_ring", 0.008)


def add_arc_strip(context, center, radius, width, start_angle, end_angle, materials, label):
    segments = 10 if context["lod"] == 0 else 6 if context["lod"] == 1 else 4
    inner_radius, outer_radius = radius - width * 0.5, radius + width * 0.5
    for index in range(segments):
        first = start_angle + (end_angle - start_angle) * index / segments
        second = start_angle + (end_angle - start_angle) * (index + 1) / segments
        points = [
            (center[0] + inner_radius * math.cos(first), center[1] + inner_radius * math.sin(first)),
            (center[0] + outer_radius * math.cos(first), center[1] + outer_radius * math.sin(first)),
            (center[0] + outer_radius * math.cos(second), center[1] + outer_radius * math.sin(second)),
            (center[0] + inner_radius * math.cos(second), center[1] + inner_radius * math.sin(second)),
        ]
        add_prism(context, "%s_%02d" % (label, index), points, ROAD_SURFACE_Z + DETAIL_CLEARANCE_M, ROAD_SURFACE_Z + 0.047, materials["marking"], "curved_turn_marking", 0.006)


def add_service_arc(context, center, radius, width, start_angle, end_angle, materials, label):
    segments = 14 if context["lod"] == 0 else 9 if context["lod"] == 1 else 6
    inner_radius, outer_radius = radius - width * 0.5, radius + width * 0.5
    for index in range(segments):
        first = start_angle + (end_angle - start_angle) * index / segments
        second = start_angle + (end_angle - start_angle) * (index + 1) / segments
        points = [
            (center[0] + inner_radius * math.cos(first), center[1] + inner_radius * math.sin(first)),
            (center[0] + outer_radius * math.cos(first), center[1] + outer_radius * math.sin(first)),
            (center[0] + outer_radius * math.cos(second), center[1] + outer_radius * math.sin(second)),
            (center[0] + inner_radius * math.cos(second), center[1] + inner_radius * math.sin(second)),
        ]
        add_prism(context, "%s_%02d" % (label, index), points, ROAD_SURFACE_Z + DETAIL_CLEARANCE_M, 2.17, materials["service"], "curved_service_median", 0.045)


def add_closed_edge(context, direction, materials):
    if direction == "N":
        center, size = (0.0, 9.38, 2.13), (17.4, 1.20, 0.42)
    elif direction == "S":
        center, size = (0.0, -9.38, 2.13), (17.4, 1.20, 0.42)
    elif direction == "E":
        center, size = (9.38, 0.0, 2.13), (1.20, 17.4, 0.42)
    else:
        center, size = (-9.38, 0.0, 2.13), (1.20, 17.4, 0.42)
    add_box(context, "CLOSED_%s_FRAME" % direction, center, size, materials["metal"], "closed_structural_edge", 0.16)
    count = 5 if context["lod"] == 0 else 3 if context["lod"] == 1 else 1
    span = 16.0
    gap = 0.24
    segment = (span - gap * (count - 1)) / count
    for index in range(count):
        variable = -span * 0.5 + segment * 0.5 + index * (segment + gap)
        if direction in ("N", "S"):
            guide_center, guide_size = (variable, center[1], 2.365), (segment, 0.075, 0.026)
        else:
            guide_center, guide_size = (center[0], variable, 2.365), (0.075, segment, 0.026)
        add_box(context, "CLOSED_%s_GUIDE_%02d" % (direction, index), guide_center, guide_size, materials["cyan"], "closed_edge_guidance", 0.012)


def add_dashed_span(context, axis, fixed, start, end, materials, label, width=0.18):
    """Add an authored traffic line with deterministic gaps and no stacked faces."""
    count = 3 if context["lod"] == 0 else 2 if context["lod"] == 1 else 1
    gap = 0.76 if count > 1 else 0.0
    total = abs(end - start)
    segment = (total - gap * (count - 1)) / count
    direction = 1.0 if end >= start else -1.0
    for index in range(count):
        variable = start + direction * (segment * 0.5 + index * (segment + gap))
        if axis == "y":
            center, size = (fixed, variable, ROAD_SURFACE_Z + 0.024), (width, segment, 0.024)
        else:
            center, size = (variable, fixed, ROAD_SURFACE_Z + 0.024), (segment, width, 0.024)
        add_box(context, "%s_%02d" % (label, index), center, size, materials["marking"], "junction_lane_marking", 0.008)


def add_approach_grammar(context, direction, materials, median=True):
    """Continue the four-lane straight-road grammar into the junction core."""
    # Stop before the central conflict zone.  Perpendicular approaches never
    # stack thin marking meshes at the same height, and the open 10 m square
    # remains wide enough for superheavy turning paths.
    inner, outer = 5.05, 9.72
    if direction == "N":
        for side in (-4.25, 4.25):
            add_dashed_span(context, "y", side, inner, outer, materials, "N_CORE_LANE_%s" % ("L" if side < 0 else "R"))
        median_center, median_size = (0.0, (inner + 10.0) * 0.5, 2.045), (2.45, 10.0 - inner, 0.234)
        guide_axis, guide_fixed, guide_start, guide_end = "y", 0.0, inner + 0.4, 9.55
        cap_center, cap_size = (0.0, inner - 0.34, 2.075), (2.05, 0.68, 0.29)
    elif direction == "S":
        for side in (-4.25, 4.25):
            add_dashed_span(context, "y", side, -outer, -inner, materials, "S_CORE_LANE_%s" % ("L" if side < 0 else "R"))
        median_center, median_size = (0.0, -(inner + 10.0) * 0.5, 2.045), (2.45, 10.0 - inner, 0.234)
        guide_axis, guide_fixed, guide_start, guide_end = "y", 0.0, -9.55, -(inner + 0.4)
        cap_center, cap_size = (0.0, -inner + 0.34, 2.075), (2.05, 0.68, 0.29)
    elif direction == "E":
        for side in (-4.25, 4.25):
            add_dashed_span(context, "x", side, inner, outer, materials, "E_CORE_LANE_%s" % ("D" if side < 0 else "U"))
        median_center, median_size = ((inner + 10.0) * 0.5, 0.0, 2.045), (10.0 - inner, 2.45, 0.234)
        guide_axis, guide_fixed, guide_start, guide_end = "x", 0.0, inner + 0.4, 9.55
        cap_center, cap_size = (inner - 0.34, 0.0, 2.075), (0.68, 2.05, 0.29)
    else:
        for side in (-4.25, 4.25):
            add_dashed_span(context, "x", side, -outer, -inner, materials, "W_CORE_LANE_%s" % ("D" if side < 0 else "U"))
        median_center, median_size = (-(inner + 10.0) * 0.5, 0.0, 2.045), (10.0 - inner, 2.45, 0.234)
        guide_axis, guide_fixed, guide_start, guide_end = "x", 0.0, -9.55, -(inner + 0.4)
        cap_center, cap_size = (-inner + 0.34, 0.0, 2.075), (0.68, 2.05, 0.29)
    if median:
        add_box(context, direction + "_CORE_MEDIAN", median_center, median_size, materials["service"], "junction_service_median", 0.11)
        add_guidance_segments(context, guide_axis, guide_fixed, guide_start, guide_end, materials, direction + "_CORE_MEDIAN")
        add_box(context, direction + "_MEDIAN_CAP", cap_center, cap_size, materials["panel"], "protected_median_terminus", 0.10)


def add_surface_detail(context, x, y, sx, sy, materials, label, drain=False):
    if context["lod"] == 2:
        return
    material = materials["drain"] if drain else materials["road_patch"]
    role = "drainage_service_panel" if drain else "asphalt_repair_panel"
    height = 0.018 if drain else 0.014
    add_box(context, label, (x, y, ROAD_SURFACE_Z + height * 0.5 + DETAIL_CLEARANCE_M), (sx, sy, height), material, role, 0.025)
    if drain and context["lod"] == 0:
        rib_count = 3
        for index in range(rib_count):
            rib_x = x - sx * 0.28 + index * sx * 0.28
            add_box(context, "%s_RIB_%02d" % (label, index), (rib_x, y, ROAD_SURFACE_Z + 0.040), (0.055, sy * 0.72, 0.012), materials["panel"], "drain_rib", 0.006)


def add_corner_service_island(context, materials):
    """Fill the corner's non-drivable quadrant with believable infrastructure."""
    points = [(-8.55, 3.30), (-6.80, 8.50), (-3.30, 8.55), (-3.0, 7.20), (-6.60, 3.0)]
    add_prism(context, "CORNER_SERVICE_ISLAND", points, ROAD_SURFACE_Z + DETAIL_CLEARANCE_M, 2.30, materials["curb"], "raised_corner_service_island", 0.16)
    inner = [(-7.65, 4.12), (-6.20, 7.45), (-4.15, 7.62), (-3.86, 6.72), (-6.28, 3.86)]
    add_prism(context, "CORNER_SERVICE_DECK", inner, 2.312, 2.40, materials["panel"], "corner_service_deck", 0.10)
    if context["lod"] <= 1:
        add_box(context, "CORNER_ACCESS_HATCH", (-5.65, 5.80, 2.455), (1.65, 1.25, 0.09), materials["drain"], "sealed_access_hatch", 0.12)
        add_box(context, "CORNER_HAZARD_TAB_A", (-7.24, 4.25, 2.465), (0.32, 0.56, 0.08), materials["hazard"], "service_hazard_tab", 0.05)
        add_box(context, "CORNER_HAZARD_TAB_B", (-4.20, 7.20, 2.465), (0.32, 0.56, 0.08), materials["hazard"], "service_hazard_tab", 0.05)


def add_junction_corner_islands(context, positions, materials, label):
    for index, (x, y) in enumerate(positions):
        add_box(context, "%s_CORNER_%02d" % (label, index), (x, y, 2.08), (2.05, 2.05, 0.31), materials["curb_dark"], "protected_junction_corner", 0.14)
        if context["lod"] <= 1:
            add_box(context, "%s_HATCH_%02d" % (label, index), (x, y, 2.285), (1.18, 1.18, 0.08), materials["panel"], "junction_access_hatch", 0.09)


def add_checkpoint_endcap(context, materials):
    """A vehicle-scale security terminus replaces the former empty octagon."""
    add_approach_grammar(context, "S", materials)
    # Inspection bay markings terminate before the physical barricade.
    for side in (-1.0, 1.0):
        x = side * 4.25
        add_box(context, "CHECKPOINT_BAY_%s" % ("L" if side < 0 else "R"), (x, 1.55, ROAD_SURFACE_Z + 0.025), (4.60, 0.18, 0.024), materials["marking"], "checkpoint_stop_line", 0.008)
        add_surface_detail(context, x, 3.45, 1.7, 1.15, materials, "CHECKPOINT_SCAN_PAD_%s" % ("L" if side < 0 else "R"), drain=True)
    # Pylons and crossbeam meet face-to-face, never with overlapping volumes.
    for side in (-1.0, 1.0):
        x = side * 7.72
        add_box(context, "GATE_PYLON_%s" % ("L" if side < 0 else "R"), (x, 0.20, 3.72), (1.34, 2.55, 3.60), materials["metal"], "checkpoint_gate_pylon", 0.20)
        add_box(context, "GATE_PYLON_PANEL_%s" % ("L" if side < 0 else "R"), (x, -1.105, 3.70), (0.72, 0.06, 1.32), materials["panel"], "checkpoint_gate_panel", 0.06)
    add_box(context, "GATE_CROSSBEAM", (0.0, 0.20, 5.94), (16.78, 1.48, 0.84), materials["metal"], "checkpoint_gate_crossbeam", 0.18)
    if context["lod"] <= 1:
        for index, x in enumerate((-5.2, 0.0, 5.2)):
            add_box(context, "GATE_OVERHEAD_GUIDE_%02d" % index, (x, 0.20, 6.375), (3.25, 0.14, 0.03), materials["cyan"], "checkpoint_overhead_guidance", 0.012)
    # Final barricade makes the termination function unmistakable.
    for side in (-1.0, 1.0):
        add_box(context, "BARRICADE_POST_%s" % ("L" if side < 0 else "R"), (side * 6.45, 6.45, 2.50), (0.72, 0.72, 1.16), materials["metal"], "checkpoint_barricade_post", 0.11)
    add_box(context, "BARRICADE_BEAM", (0.0, 6.45, 3.31), (13.62, 0.46, 0.46), materials["hazard"], "checkpoint_barricade", 0.09)
    add_surface_detail(context, 0.0, 5.15, 3.6, 1.25, materials, "CHECKPOINT_SERVICE_HATCH", drain=False)


def add_core(context, spec, materials):
    add_box(context, "CORE_UNDERDECK", (0.0, 0.0, UNDERDECK_TOP_Z * 0.5), (20.0, 20.0, UNDERDECK_TOP_Z), materials["metal"], "junction_underdeck", 0.24)
    add_box(context, "CORE_SURFACE", (0.0, 0.0, (UNDERDECK_TOP_Z + ROAD_SURFACE_Z) * 0.5), (20.0, 20.0, ROAD_SURFACE_Z - UNDERDECK_TOP_Z), materials["road"], "junction_surface", 0.12)

    if spec["id"] == "corner_90":
        # Two controlled quarter-turn lane guides preserve the S/E traffic
        # flow instead of presenting a featureless square intersection.
        add_service_arc(context, (10.0, -10.0), 10.0, 2.45, math.pi, math.pi * 0.5, materials, "CORNER_SERVICE_MEDIAN")
        # These radii are solved from the exact straight-road lane separators:
        # S x=+/-4.25 m becomes E y=-/+4.25 m at the core boundaries.
        add_arc_strip(context, (10.0, -10.0), 5.75, 0.18, math.pi, math.pi * 0.5, materials, "CORNER_INNER_TURN")
        add_arc_strip(context, (10.0, -10.0), 14.25, 0.18, math.pi, math.pi * 0.5, materials, "CORNER_OUTER_TURN")
        add_corner_service_island(context, materials)
        add_surface_detail(context, 5.8, 5.6, 2.3, 1.1, materials, "CORNER_DRAIN", drain=True)
    elif spec["id"] == "straight_endcap":
        add_checkpoint_endcap(context, materials)
    else:
        for direction in spec["connections"]:
            add_approach_grammar(context, direction, materials)
        if spec["id"] == "t_junction":
            add_junction_corner_islands(context, ((-8.0, 7.35), (8.0, 7.35)), materials, "T")
            add_surface_detail(context, -6.4, -2.4, 1.45, 2.0, materials, "T_DRAIN_W", drain=True)
            add_surface_detail(context, 6.4, -2.4, 1.45, 2.0, materials, "T_DRAIN_E", drain=True)
            add_surface_detail(context, -6.0, 5.7, 2.2, 1.15, materials, "T_PATCH_W")
            add_surface_detail(context, 6.0, 5.7, 2.2, 1.15, materials, "T_PATCH_E")
        elif spec["id"] == "x_plaza":
            add_junction_corner_islands(context, ((-8.0, -8.0), (8.0, -8.0), (-8.0, 8.0), (8.0, 8.0)), materials, "X")
            add_surface_detail(context, -6.45, -2.3, 1.2, 2.0, materials, "X_DRAIN_W", drain=True)
            add_surface_detail(context, 6.45, 2.3, 1.2, 2.0, materials, "X_DRAIN_E", drain=True)
            add_surface_detail(context, -2.4, 6.45, 2.0, 1.2, materials, "X_PATCH_N")
            add_surface_detail(context, 2.4, -6.45, 2.0, 1.2, materials, "X_PATCH_S")

    for direction in ("N", "E", "S", "W"):
        if direction not in spec["connections"]:
            add_closed_edge(context, direction, materials)


def add_adapter(context, materials):
    outer = [(-10.0, -20.0), (10.0, -20.0), (6.0, 20.0), (-6.0, 20.0)]
    road = [(-7.2, -20.0), (7.2, -20.0), (4.45, 20.0), (-4.45, 20.0)]
    left = [(-10.0, -20.0), (-7.2, -20.0), (-4.45, 20.0), (-6.0, 20.0)]
    right = [(7.2, -20.0), (10.0, -20.0), (6.0, 20.0), (4.45, 20.0)]
    add_prism(context, "ADAPTER_UNDERDECK", outer, 0.0, UNDERDECK_TOP_Z, materials["metal"], "adapter_underdeck", 0.18)
    add_prism(context, "ADAPTER_ROAD", road, UNDERDECK_TOP_Z, ROAD_SURFACE_Z, materials["road"], "adapter_road_surface", 0.08)
    add_prism(context, "ADAPTER_LEFT_SHOULDER", left, UNDERDECK_TOP_Z, ROAD_SURFACE_Z, materials["curb"], "adapter_service_shoulder", 0.08)
    add_prism(context, "ADAPTER_RIGHT_SHOULDER", right, UNDERDECK_TOP_Z, ROAD_SURFACE_Z, materials["curb"], "adapter_service_shoulder", 0.08)
    add_box_between(context, "ADAPTER_LEFT_CURB", (-7.58, -19.7), (-4.78, 19.7), 0.34, ROAD_SURFACE_Z + DETAIL_CLEARANCE_M, 2.182, materials["curb"], "raised_curb", 0.07)
    add_box_between(context, "ADAPTER_RIGHT_CURB", (7.58, -19.7), (4.78, 19.7), 0.34, ROAD_SURFACE_Z + DETAIL_CLEARANCE_M, 2.182, materials["curb"], "raised_curb", 0.07)
    add_box_between(context, "ADAPTER_LEFT_GUIDE", (-7.58, -19.45), (-4.78, 19.45), 0.075, 2.194, 2.220, materials["cyan"], "cyan_guidance", 0.012)
    add_box_between(context, "ADAPTER_RIGHT_GUIDE", (7.58, -19.45), (4.78, 19.45), 0.075, 2.194, 2.220, materials["cyan"], "cyan_guidance", 0.012)
    add_box_between(context, "ADAPTER_LEFT_BARRIER", (-9.46, -19.45), (-5.46, 19.45), 0.62, ROAD_SURFACE_Z + DETAIL_CLEARANCE_M, 2.48, materials["curb"], "raised_edge_barrier", 0.10)
    add_box_between(context, "ADAPTER_RIGHT_BARRIER", (9.46, -19.45), (5.46, 19.45), 0.62, ROAD_SURFACE_Z + DETAIL_CLEARANCE_M, 2.48, materials["curb"], "raised_edge_barrier", 0.10)
    add_box_between(context, "ADAPTER_LEFT_BARRIER_GUIDE", (-9.46, -19.20), (-5.46, 19.20), 0.105, 2.493, 2.519, materials["cyan"], "barrier_inset_guidance", 0.012)
    add_box_between(context, "ADAPTER_RIGHT_BARRIER_GUIDE", (9.46, -19.20), (5.46, 19.20), 0.105, 2.493, 2.519, materials["cyan"], "barrier_inset_guidance", 0.012)
    # The primary divider narrows cleanly before the local-road merge.  It is
    # a raised service element, not a dark triangular hole in the carriageway.
    median = [(-1.22, -20.0), (1.22, -20.0), (0.34, 5.55), (-0.34, 5.55)]
    add_prism(context, "ADAPTER_MEDIAN", median, ROAD_SURFACE_Z + DETAIL_CLEARANCE_M, 2.17, materials["service"], "tapered_service_median", 0.10)
    add_box(context, "ADAPTER_MEDIAN_TERMINUS", (0.0, 5.94, 2.085), (1.28, 0.78, 0.31), materials["panel"], "median_termination", 0.13)
    if context["lod"] <= 1:
        add_box(context, "ADAPTER_MEDIAN_REFLECTOR_L", (-0.36, 5.56, 2.270), (0.22, 0.20, 0.05), materials["hazard"], "median_reflector", 0.035)
        add_box(context, "ADAPTER_MEDIAN_REFLECTOR_R", (0.36, 5.56, 2.270), (0.22, 0.20, 0.05), materials["hazard"], "median_reflector", 0.035)
    add_box(context, "ADAPTER_SOCKET_JOINT_S_L", (-4.25, -19.72, ROAD_SURFACE_Z + 0.024), (5.75, 0.46, 0.024), materials["metal"], "socket_joint_band", 0.008)
    add_box(context, "ADAPTER_SOCKET_JOINT_S_R", (4.25, -19.72, ROAD_SURFACE_Z + 0.024), (5.75, 0.46, 0.024), materials["metal"], "socket_joint_band", 0.008)
    add_box(context, "ADAPTER_SOCKET_JOINT_S_MEDIAN", (0.0, -19.72, 2.191), (2.15, 0.46, 0.026), materials["metal"], "median_socket_joint", 0.008)
    add_box(context, "ADAPTER_SOCKET_JOINT_N", (0.0, 19.72, ROAD_SURFACE_Z + 0.024), (8.2, 0.46, 0.024), materials["metal"], "socket_joint_band", 0.008)
    # Converging lane separators show the four-to-two-lane merge at a glance.
    # Their endpoints remain clear of the median cap and local centre line.
    add_box_between(context, "ADAPTER_MERGE_L", (-4.25, -9.6), (-0.72, 7.7), 0.18, ROAD_SURFACE_Z + DETAIL_CLEARANCE_M, ROAD_SURFACE_Z + 0.047, materials["marking"], "adapter_merge_marking", 0.008)
    add_box_between(context, "ADAPTER_MERGE_R", (4.25, -9.6), (0.72, 7.7), 0.18, ROAD_SURFACE_Z + DETAIL_CLEARANCE_M, ROAD_SURFACE_Z + 0.047, materials["marking"], "adapter_merge_marking", 0.008)
    add_dashed_span(context, "y", 0.0, 8.65, 19.35, materials, "ADAPTER_LOCAL_CENTER", width=0.16)
    add_surface_detail(context, -3.15, 2.2, 1.45, 2.15, materials, "ADAPTER_PATCH_L")
    add_surface_detail(context, 3.15, 2.2, 1.45, 2.15, materials, "ADAPTER_PATCH_R")
    add_surface_detail(context, -7.15, -4.0, 0.36, 1.65, materials, "ADAPTER_DRAIN_L", drain=True)
    add_surface_detail(context, 7.15, -4.0, 0.36, 1.65, materials, "ADAPTER_DRAIN_R", drain=True)


def triangle_count(obj):
    if obj.type != "MESH":
        return 0
    obj.data.calc_loop_triangles()
    return len(obj.data.loop_triangles)


def intersection_accounting(records):
    def signed_area(points):
        return 0.5 * sum(
            points[index][0] * points[(index + 1) % len(points)][1]
            - points[(index + 1) % len(points)][0] * points[index][1]
            for index in range(len(points))
        )

    def convex_intersection_area(subject, clip):
        subject = [tuple(point) for point in subject]
        clip = [tuple(point) for point in clip]
        if signed_area(subject) < 0.0:
            subject.reverse()
        if signed_area(clip) < 0.0:
            clip.reverse()
        output = subject
        epsilon = 1e-9
        for edge_index, edge_start in enumerate(clip):
            edge_end = clip[(edge_index + 1) % len(clip)]
            incoming = output
            output = []
            if not incoming:
                break

            def side(point):
                return ((edge_end[0] - edge_start[0]) * (point[1] - edge_start[1])
                        - (edge_end[1] - edge_start[1]) * (point[0] - edge_start[0]))

            def crossing(first_point, second_point):
                first_side = side(first_point)
                second_side = side(second_point)
                denominator = first_side - second_side
                if abs(denominator) <= epsilon:
                    return second_point
                ratio = first_side / denominator
                return (
                    first_point[0] + (second_point[0] - first_point[0]) * ratio,
                    first_point[1] + (second_point[1] - first_point[1]) * ratio,
                )

            previous = incoming[-1]
            previous_inside = side(previous) >= -epsilon
            for current in incoming:
                current_inside = side(current) >= -epsilon
                if current_inside:
                    if not previous_inside:
                        output.append(crossing(previous, current))
                    output.append(current)
                elif previous_inside:
                    output.append(crossing(previous, current))
                previous, previous_inside = current, current_inside
        return abs(signed_area(output)) if len(output) >= 3 else 0.0

    overlaps = []
    for index, first in enumerate(records):
        for second in records[index + 1:]:
            extent = [min(first["max"][axis], second["max"][axis]) - max(first["min"][axis], second["min"][axis]) for axis in range(3)]
            xy_area = convex_intersection_area(first["xyPoints"], second["xyPoints"])
            volume = xy_area * max(0.0, extent[2])
            if volume > 1e-7:
                overlaps.append({
                    "first": first["name"], "second": second["name"],
                    "firstRole": first["role"], "secondRole": second["role"],
                    "conservativeAabbOverlapM3": round(volume, 8),
                })
    return {"testedObjects": len(records), "unexpectedIntersections": len(overlaps), "records": overlaps}


def create_socket(collection, root, piece_id, direction, width):
    data = CARDINALS[direction]
    obj = add_empty(collection, "SOCKET_%s_%s" % (piece_id.upper(), direction), data["position"], "road_socket", root)
    obj.rotation_euler[2] = data["rotation"]
    obj["mf_direction"] = direction
    obj["mf_socket_type"] = "primary_road_20m" if width == PRIMARY_WIDTH_M else "local_road_12m"
    obj["mf_envelope_width_m"] = width
    obj["mf_lane_count"] = 4 if width == PRIMARY_WIDTH_M else 2
    obj["mf_clearance_classes"] = "infantry,light,heavy,superheavy"
    return obj


def create_proxies(piece_collection, root, spec, materials):
    collision_collection = linked_collection(piece_collection, PREFIX + "_" + spec["id"].upper() + "_PROXIES")
    collision_context = {
        "collection": collision_collection, "prefix": PREFIX + "_" + spec["id"].upper(),
        "lod": -1, "root": root, "objects": [], "geometry": [],
    }
    if spec.get("adapter"):
        points = [(-10.0, -20.0), (10.0, -20.0), (6.0, 20.0), (-6.0, 20.0)]
        collision = add_prism(collision_context, "COLLISION", points, 0.0, 1.54, materials["collision"], "simplified_collision")
        nav = add_prism(collision_context, "NAV", [(-7.0, -20.0), (7.0, -20.0), (4.25, 20.0), (-4.25, 20.0)], ROAD_SURFACE_Z + 0.04, ROAD_SURFACE_Z + 0.07, materials["nav"], "navigation_proxy")
    else:
        proxy_parts = []
        for direction in spec["connections"]:
            if direction == "N":
                proxy_parts.append(((0.0, 15.0, 0.77), (20.0, 10.0, 1.54)))
            elif direction == "S":
                proxy_parts.append(((0.0, -15.0, 0.77), (20.0, 10.0, 1.54)))
            elif direction == "E":
                proxy_parts.append(((15.0, 0.0, 0.77), (10.0, 20.0, 1.54)))
            else:
                proxy_parts.append(((-15.0, 0.0, 0.77), (10.0, 20.0, 1.54)))
        proxy_parts.append(((0.0, 0.0, 0.77), (20.0, 20.0, 1.54)))
        vertices, faces = [], []
        for center, size in proxy_parts:
            append_box(vertices, faces, center, size)
        collision = mesh_object(collision_collection, collision_context["prefix"] + "_COLLISION", vertices, faces, materials["collision"], "simplified_collision", -1, root)
        collision_context["objects"].append(collision)
        nav_parts = []
        for direction in spec["connections"]:
            if direction == "N": nav_parts.append(((0.0, 15.0, ROAD_SURFACE_Z + 0.055), (14.0, 10.0, 0.03)))
            elif direction == "S": nav_parts.append(((0.0, -15.0, ROAD_SURFACE_Z + 0.055), (14.0, 10.0, 0.03)))
            elif direction == "E": nav_parts.append(((15.0, 0.0, ROAD_SURFACE_Z + 0.055), (10.0, 14.0, 0.03)))
            else: nav_parts.append(((-15.0, 0.0, ROAD_SURFACE_Z + 0.055), (10.0, 14.0, 0.03)))
        nav_parts.append(((0.0, 0.0, ROAD_SURFACE_Z + 0.055), (20.0, 20.0, 0.03)))
        vertices, faces = [], []
        for center, size in nav_parts:
            append_box(vertices, faces, center, size)
        nav = mesh_object(collision_collection, collision_context["prefix"] + "_NAV", vertices, faces, materials["nav"], "navigation_proxy", -1, root)
        collision_context["objects"].append(nav)
    collision.hide_render = True
    collision.display_type = "WIRE"
    collision["mf_clearance_classes"] = "infantry,light,heavy,superheavy"
    nav.hide_render = True
    nav.display_type = "WIRE"
    nav["mf_nav_connections"] = ",".join(spec["connections"])
    nav["mf_lane_count"] = 2 if spec.get("adapter") else 4
    return {"collection": collision_collection, "collision": collision, "nav": nav}


def create_piece(master, spec, materials):
    piece_collection = linked_collection(master, PREFIX + "_" + spec["id"].upper())
    root = add_empty(piece_collection, PREFIX + "_" + spec["id"].upper() + "_ROOT", (0.0, 0.0, 0.0), "piece_root")
    root["mf_piece_id"] = spec["id"]
    root["mf_grid_m"] = GRID_M
    root["mf_runtime_accepted"] = False
    lod_entries = []
    for lod in range(3):
        collection = linked_collection(piece_collection, PREFIX + "_" + spec["id"].upper() + "_LOD%d" % lod)
        context = {
            "collection": collection, "prefix": PREFIX + "_" + spec["id"].upper() + "_LOD%d" % lod,
            "lod": lod, "root": root, "objects": [], "geometry": [],
        }
        if spec.get("adapter"):
            add_adapter(context, materials)
        else:
            for direction in spec["connections"]:
                if direction in ("N", "S"):
                    add_vertical_arm(context, direction, materials)
                else:
                    add_horizontal_arm(context, direction, materials)
            add_core(context, spec, materials)
        accounting = intersection_accounting(context["geometry"])
        if accounting["unexpectedIntersections"]:
            raise RuntimeError("%s LOD%d has conservative geometry intersections: %s" % (spec["id"], lod, accounting["records"][:4]))
        lod_entries.append({
            "lod": lod, "collection": collection, "objects": context["objects"],
            "geometry": context["geometry"], "intersectionAccounting": accounting,
        })
    widths = spec.get("socketWidths", {})
    sockets = [create_socket(piece_collection, root, spec["id"], direction, widths.get(direction, PRIMARY_WIDTH_M)) for direction in spec["connections"]]
    proxies = create_proxies(piece_collection, root, spec, materials)
    return {"id": spec["id"], "spec": spec, "collection": piece_collection, "root": root, "lods": lod_entries, "sockets": sockets, "proxies": proxies}


def import_straight_reference(config, master):
    source = config["straight_glb"]
    if sha256(source) != STRAIGHT_SHA256:
        raise RuntimeError("clean straight review GLB hash mismatch")
    report = json.loads(Path(config["straight_report"]).read_text(encoding="utf-8"))
    if report.get("runtimeAccepted") is not False or report.get("visualAccepted") is not False:
        raise RuntimeError("straight source-only lifecycle contract changed")
    collection = linked_collection(master, PREFIX + "_STRAIGHT_SEAM_REFERENCE")
    previous = bpy.context.view_layer.active_layer_collection
    layer = bpy.context.view_layer.layer_collection
    stack = [layer]
    target = None
    while stack:
        current = stack.pop()
        if current.collection == collection:
            target = current
            break
        stack.extend(current.children)
    bpy.context.view_layer.active_layer_collection = target
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=source)
    bpy.context.view_layer.active_layer_collection = previous
    imported = [obj for obj in bpy.data.objects if obj not in before]
    meshes = [obj for obj in imported if obj.type == "MESH"]
    if not meshes:
        raise RuntimeError("straight seam reference imported no mesh")
    for obj in imported:
        if obj.type == "MESH":
            obj.location.y -= GRID_M
            obj["mf_role"] = "straight_seam_reference"
            obj["mf_runtime_accepted"] = False
        obj.hide_render = True
    if sha256(source) != STRAIGHT_SHA256:
        raise RuntimeError("straight source changed during import")
    return {"collection": collection, "objects": imported, "meshes": meshes, "report": report}


def create_evidence_rig(master):
    collection = linked_collection(master, PREFIX + "_EVIDENCE_RIG")
    floor_material = make_material("evidence_floor", (0.085, 0.098, 0.108, 1.0), 0.04, 0.9)
    vertices, faces = [], []
    append_box(vertices, faces, (0.0, -10.0, -0.09), (130.0, 150.0, 0.12))
    floor = mesh_object(collection, PREFIX + "_EVIDENCE_FLOOR", vertices, faces, floor_material, "evidence_only", -1)
    floor["mf_evidence_only"] = True

    def area(name, location, energy, size, color):
        data = bpy.data.lights.new(PREFIX + "_" + name, "AREA")
        data.energy, data.shape, data.size, data.color = energy, "DISK", size, color
        obj = bpy.data.objects.new(PREFIX + "_" + name, data)
        collection.objects.link(obj)
        obj.location = location
        obj.rotation_euler = (Vector((0.0, -8.0, 1.4)) - obj.location).to_track_quat("-Z", "Y").to_euler()
        obj["mf_evidence_only"] = True
        return obj

    area("KEY", (38.0, -42.0, 54.0), 3800.0, 42.0, (0.86, 0.92, 1.0))
    area("FILL", (-34.0, -14.0, 32.0), 3200.0, 38.0, (0.64, 0.76, 0.91))
    area("RIM", (-22.0, 38.0, 31.0), 1500.0, 34.0, (1.0, 0.72, 0.54))
    camera_data = bpy.data.cameras.new(PREFIX + "_CAMERA")
    camera_data.type = "ORTHO"
    camera = bpy.data.objects.new(PREFIX + "_CAMERA", camera_data)
    collection.objects.link(camera)
    camera["mf_evidence_only"] = True
    bpy.context.scene.camera = camera
    return camera


def configure_render():
    scene = bpy.context.scene
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
    background.inputs["Color"].default_value = (0.060, 0.074, 0.087, 1.0)
    background.inputs["Strength"].default_value = 1.0
    scene.view_settings.exposure = 1.22
    try:
        scene.view_settings.look = "AgX - Medium High Contrast"
    except (TypeError, AttributeError):
        pass


def point_camera(camera, target, direction, scale):
    target = Vector(target)
    direction = Vector(direction).normalized()
    camera.location = target + direction * scale * 1.65
    camera.rotation_euler = (target - camera.location).to_track_quat("-Z", "Y").to_euler()
    camera.data.ortho_scale = scale


def all_render_objects(pieces, straight):
    objects = []
    for piece in pieces:
        for lod in piece["lods"]:
            objects.extend(lod["objects"])
    objects.extend(straight["meshes"])
    return objects


def set_visibility(pieces, straight, piece_id, seam=False):
    for piece in pieces:
        for lod in piece["lods"]:
            visible = piece["id"] == piece_id and lod["lod"] == 0
            for obj in lod["objects"]:
                obj.hide_render = not visible
    for obj in straight["meshes"]:
        obj.hide_render = not seam


def render_evidence(config, pieces, straight, camera):
    directory = Path(config["evidence_dir"])
    directory.mkdir(parents=True, exist_ok=True)
    views = {
        "top": ((0.0, -0.001, 1.0), 46.0),
        "iso": ((1.0, -1.18, 0.82), 48.0),
        "edge": ((0.0, -1.0, 0.23), 42.0),
    }
    records = []
    for piece in pieces:
        for view, (direction, scale) in views.items():
            set_visibility(pieces, straight, piece["id"], seam=False)
            point_camera(camera, (0.0, 0.0, 1.0), direction, scale)
            path = directory / (piece["id"] + "-" + view + "-1024.png")
            bpy.context.scene.render.filepath = str(path)
            bpy.ops.render.render(write_still=True)
            record = file_record(path)
            record.update({"piece": piece["id"], "view": view, "kind": "individual", "width": 1024, "height": 1024})
            records.append(record)
        for view, direction, scale in (
            ("seam_top", (0.0, -0.001, 1.0), 80.0),
            ("seam_iso", (1.0, -1.15, 0.72), 78.0),
        ):
            set_visibility(pieces, straight, piece["id"], seam=True)
            point_camera(camera, (0.0, -20.0, 1.0), direction, scale)
            path = directory / (piece["id"] + "-" + view + "-1024.png")
            bpy.context.scene.render.filepath = str(path)
            bpy.ops.render.render(write_still=True)
            record = file_record(path)
            record.update({"piece": piece["id"], "view": view, "kind": "straight_adjacency", "width": 1024, "height": 1024})
            records.append(record)
    set_visibility(pieces, straight, pieces[0]["id"], seam=False)
    return records


def select_only(objects):
    bpy.ops.object.select_all(action="DESELECT")
    selectable = []
    for obj in objects:
        obj.hide_viewport = False
        obj.hide_set(False)
        obj.select_set(True)
        selectable.append(obj)
    meshes = [obj for obj in selectable if obj.type == "MESH"]
    bpy.context.view_layer.objects.active = meshes[0] if meshes else selectable[0]


def export_selected(path, objects):
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    select_only(objects)
    bpy.ops.export_scene.gltf(
        filepath=str(path), export_format="GLB", use_selection=True, export_apply=True,
        export_extras=True, export_cameras=False, export_lights=False, export_yup=True,
    )
    return file_record(path)


def export_pieces(config, pieces):
    directory = Path(config["export_dir"])
    directory.mkdir(parents=True, exist_ok=True)
    exports = {}
    for piece in pieces:
        records = {"lods": []}
        for lod in piece["lods"]:
            path = directory / (piece["id"] + "-lod%d-review.glb" % lod["lod"])
            record = export_selected(path, lod["objects"] + piece["sockets"])
            record.update({"lod": lod["lod"], "triangles": sum(triangle_count(obj) for obj in lod["objects"])})
            records["lods"].append(record)
        collision_path = directory / (piece["id"] + "-collision-review.glb")
        nav_path = directory / (piece["id"] + "-nav-review.glb")
        records["collision"] = export_selected(collision_path, [piece["proxies"]["collision"]])
        records["nav"] = export_selected(nav_path, [piece["proxies"]["nav"]] + piece["sockets"])
        exports[piece["id"]] = records
    return exports


def material_inventory(materials):
    return [
        {"name": material.name, "role": material.get("mf_material_role"), "runtimeAccepted": False}
        for material in materials.values()
    ]


def build_junctions(overrides=None):
    config = merged_config(overrides)
    clear_previous_generation()
    # Preserve unrelated objects in an interactive authoring scene, but keep
    # them out of source evidence.  This is safer than deleting a user's scene
    # and prevents default Cube/Light objects from contaminating review shots.
    unrelated_visibility = {obj: obj.hide_render for obj in bpy.data.objects}
    master = bpy.data.collections.new(MASTER_COLLECTION)
    bpy.context.scene.collection.children.link(master)
    master["mf_schema"] = SCHEMA
    master["mf_source_authoring_only"] = True
    master["mf_runtime_accepted"] = False
    materials = create_materials()
    pieces = [create_piece(master, spec, materials) for spec in PIECES]
    straight = import_straight_reference(config, master)
    camera = create_evidence_rig(master)
    configure_render()
    bpy.context.view_layer.update()

    exports = export_pieces(config, pieces) if config["export_review_glbs"] else {}
    for obj in unrelated_visibility:
        obj.hide_render = True
    try:
        evidence = render_evidence(config, pieces, straight, camera) if config["render_evidence"] else []
    finally:
        for obj, was_hidden in unrelated_visibility.items():
            obj.hide_render = was_hidden
    if config["save_blend"]:
        Path(config["blend_path"]).parent.mkdir(parents=True, exist_ok=True)
        bpy.ops.wm.save_as_mainfile(filepath=config["blend_path"])
    if sha256(config["straight_glb"]) != STRAIGHT_SHA256:
        raise RuntimeError("straight source changed during junction build")

    piece_records = []
    for piece in pieces:
        sockets = []
        for obj in piece["sockets"]:
            sockets.append({
                "name": obj.name, "direction": obj["mf_direction"],
                "socketType": obj["mf_socket_type"], "widthM": obj["mf_envelope_width_m"],
                "lanes": obj["mf_lane_count"], "position": [round(value, 6) for value in obj.location],
            })
        lods = []
        for lod in piece["lods"]:
            lods.append({
                "lod": lod["lod"],
                "triangles": sum(triangle_count(obj) for obj in lod["objects"]),
                "objects": len(lod["objects"]),
                "intersectionAccounting": lod["intersectionAccounting"],
            })
        piece_records.append({
            "id": piece["id"], "connections": list(piece["spec"]["connections"]),
            "gridM": GRID_M, "primaryWidthM": PRIMARY_WIDTH_M,
            "surfaceElevationM": ROAD_SURFACE_Z, "sockets": sockets, "lods": lods,
            "collisionTriangles": triangle_count(piece["proxies"]["collision"]),
            "navTriangles": triangle_count(piece["proxies"]["nav"]),
            "clearanceClasses": "infantry,light,heavy,superheavy",
        })

    report = {
        "schema": SCHEMA,
        "status": "SOURCE_AUTHORING_ONLY",
        "runtimeAccepted": False,
        "visualAccepted": False,
        "generatorScript": file_record(Path(__file__).resolve()),
        "straightSource": file_record(config["straight_glb"]),
        "straightSourceReport": file_record(config["straight_report"]),
        "contract": {
            "gridM": GRID_M, "primaryWidthM": PRIMARY_WIDTH_M, "localWidthM": LOCAL_WIDTH_M,
            "surfaceElevationM": ROAD_SURFACE_Z,
            "socketPolicy": "cardinal boundary sockets at +/-20 m; adapter N is 12 m local road",
        },
        "conceptDeltaChecklist": [
            {"requirement": "two readable carriageways at every primary socket", "implemented": True, "accepted": False},
            {"requirement": "continuous lane grammar through corner and intersection approaches", "implemented": True, "accepted": False},
            {"requirement": "central service median continues from the cleaned straight", "implemented": True, "accepted": False},
            {"requirement": "raised curb, shoulder, barrier, drain, hatch and repair-detail hierarchy", "implemented": True, "accepted": False},
            {"requirement": "no floating crosswalk bars or unrelated central octagon", "implemented": True, "accepted": False},
            {"requirement": "vehicle-scale checkpoint endcap rather than an empty landing plate", "implemented": True, "accepted": False},
            {"requirement": "solid symmetric four-to-two-lane adapter without a black void", "implemented": True, "accepted": False},
            {"requirement": "restrained rather than dominant cyan guidance", "implemented": True, "accepted": False},
            {"requirement": "same-camera individual and straight-adjacency evidence", "implemented": True, "accepted": False},
            {"requirement": "deployable PBR parity with the Hunyuan straight", "implemented": False, "accepted": False},
            {"requirement": "real phone tactical and command-zoom integration proof", "implemented": False, "accepted": False},
        ],
        "materials": material_inventory(materials),
        "pieces": piece_records,
        "exports": exports,
        "evidence": {
            "resolution": [1024, 1024], "individualViews": ["top", "iso", "edge"],
            "straightAdjacencyViews": ["seam_top", "seam_iso"], "renders": evidence,
            "reviewIntent": {
                "top": "phone-command-like orthographic silhouette and traffic grammar",
                "iso": "close structural, curb, height and material review",
                "edge": "vertical profile and gate clearance review",
                "seam": "edge-to-edge source-straight adjacency; no runtime claim",
            },
        },
        "blend": file_record(config["blend_path"]) if config["save_blend"] else None,
        "knownLimitations": [
            "source candidates are not runtime registered",
            "procedural Blender noise/bump is not a baked deployable PBR texture set",
            "no verified normal, AO, or authored roughness texture pack exists for the junction family",
            "collision and navigation are authoring proxies, not runtime planner integration",
            "no phone tactical/command-zoom or heavy-mech traversal evidence exists",
            "human visual approval is still required for every individual and seam render",
        ],
        "requiredNextSteps": [
            "Codex review of all real Blender renders",
            "author/bake deployable PBR texture set",
            "runtime planner socket and traversal integration",
            "phone evidence with units crossing every seam and junction",
            "explicit lifecycle promotion decision",
        ],
    }
    Path(config["report_path"]).write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "status": report["status"], "runtimeAccepted": False, "visualAccepted": False,
        "pieces": [{"id": item["id"], "lodTriangles": [lod["triangles"] for lod in item["lods"]]} for item in piece_records],
        "evidenceRenders": len(evidence),
        "report": Path(config["report_path"]).resolve().relative_to(repository_root()).as_posix(),
    }, separators=(",", ":")))
    return report


def arguments():
    values = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    if len(values) > 1:
        raise SystemExit("usage: blender --background --python build-hf-road-junctions.py -- [CONFIG.json]")
    if not values:
        return None
    return json.loads(Path(values[0]).read_text(encoding="utf-8"))


if __name__ == "__main__":
    build_junctions(arguments())
