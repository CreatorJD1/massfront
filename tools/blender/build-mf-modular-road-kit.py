"""Author MASSFRONT's first deterministic modular primary-road kit in Blender.

The generator creates source geometry only. It does not register runtime assets,
download external content, or alter an existing scene outside its own tagged
collection. Running it repeatedly replaces the previous generated kit.

CLI:
  blender --background --python tools/blender/build-mf-modular-road-kit.py -- CONFIG.json

Blender MCP / execute_blender_code:
  import runpy
  tool = runpy.run_path(r"C:\\path\\to\\tools\\blender\\build-mf-modular-road-kit.py",
                        run_name="mf_modular_road_tool")
  tool["build_road_kit"]({"render_evidence": False})
"""

import bpy
import runpy
import json
import math
import os
import sys
from pathlib import Path
from mathutils import Vector


SCHEMA = "MassfrontModularRoadKitV1"
PREFIX = "MF_MODROAD_V1"
MASTER_COLLECTION = PREFIX + "_SOURCE"
GRID_M = 32.0
HALF_GRID_M = GRID_M * 0.5
PRIMARY_WIDTH_M = 20.0
PRIMARY_HALF_M = PRIMARY_WIDTH_M * 0.5
LOCAL_WIDTH_M = 12.0
ROAD_TOP_Z = 0.0
ROAD_BOTTOM_Z = -0.24
CURB_WIDTH_M = 0.9
CURB_HEIGHT_M = 0.30
INNER_CURB_WIDTH_M = 0.46
SIDEWALK_WIDTH_M = 1.72
EDGE_FRAME_WIDTH_M = 0.82
# This is the durable repository copy of the generated concept (SHA-256 matches
# the former agent-cache image). Reports must never depend on that cache path.
CONCEPT_REFERENCE = (
    "modules/space_exploration/assets/source/spline/ground-sites/aelos_caldris/"
    "concepts/caldris-modular-kit-concept-v1.png"
)

# Captured from the visually rejected greybox. The next generated report
# computes exact post-bevel per-LOD deltas against these values.
REJECTED_LOD_TRIANGLES = {
    "straight": (340, 172, 100),
    "corner": (340, 172, 100),
    "t_junction": (384, 204, 120),
    "x_plaza": (428, 236, 140),
    "endcap": (296, 140, 80),
    "primary_local_adapter": (340, 172, 100),
    "gate": (412, 244, 136),
}

CARDINALS = {
    "N": (0.0, 1.0, 0.0),
    "E": (1.0, 0.0, -math.pi * 0.5),
    "S": (0.0, -1.0, math.pi),
    "W": (-1.0, 0.0, math.pi * 0.5),
}

MODULES = (
    {"id": "straight", "connections": ("N", "S"), "layout": (-66.0, 24.0)},
    {"id": "corner", "connections": ("N", "E"), "layout": (-22.0, 24.0)},
    {"id": "t_junction", "connections": ("N", "E", "W"), "layout": (22.0, 24.0)},
    {"id": "x_plaza", "connections": ("N", "E", "S", "W"), "layout": (66.0, 24.0)},
    {"id": "endcap", "connections": ("N",), "layout": (-66.0, -24.0)},
    {
        "id": "primary_local_adapter",
        "connections": ("N", "S"),
        "layout": (-22.0, -24.0),
        "adapter": True,
        "socket_widths": {"N": LOCAL_WIDTH_M, "S": PRIMARY_WIDTH_M},
    },
    {"id": "gate", "connections": ("N", "S"), "layout": (22.0, -24.0), "gate": True},
)


def default_config():
    repo = Path(__file__).resolve().parents[2]
    output = (
        repo
        / "modules"
        / "space_exploration"
        / "assets"
        / "source"
        / "blender"
        / "world-kits"
        / "mf-modular-road-v1"
    )
    return {
        "blend_path": str(output / "mf-modular-road-v1.blend"),
        "export_dir": str(output / "exports"),
        "evidence_dir": str(output / "evidence"),
        "report_path": str(output / "mf-modular-road-v1-report.json"),
        "concept_reference": CONCEPT_REFERENCE,
        "save_blend": True,
        "export_glb": True,
        "render_evidence": True,
        "render_resolution": 768,
        "evidence_views": ["iso_ne", "iso_nw", "top", "entry"],
    }


def merged_config(overrides=None):
    config = default_config()
    if overrides:
        unknown = sorted(set(overrides) - set(config))
        if unknown:
            raise ValueError("unknown road-kit config keys: " + ", ".join(unknown))
        config.update(overrides)
    for key in ("blend_path", "export_dir", "evidence_dir", "report_path"):
        config[key] = os.path.abspath(os.path.expanduser(str(config[key])))
    concept = Path(os.path.expanduser(str(config["concept_reference"])))
    if not concept.is_absolute():
        concept = REPO_ROOT / concept
    if not concept.is_file():
        raise FileNotFoundError("road-kit concept reference is missing: %s" % concept)
    concept = concept.resolve()
    try:
        config["concept_reference"] = concept.relative_to(REPO_ROOT).as_posix()
    except ValueError as exc:
        raise ValueError("road-kit concept reference must stay inside the repository: %s"
                         % concept) from exc
    config["render_resolution"] = max(256, min(2048, int(config["render_resolution"])))
    return config


def remove_collection_tree(collection):
    for child in list(collection.children):
        remove_collection_tree(child)
    for obj in list(collection.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    bpy.data.collections.remove(collection)


def clear_previous_generated_kit():
    collection = bpy.data.collections.get(MASTER_COLLECTION)
    if collection is not None:
        remove_collection_tree(collection)
    for material in list(bpy.data.materials):
        if material.name.startswith(PREFIX + "_") and material.users == 0:
            bpy.data.materials.remove(material)
    collision_mesh_prefixes = tuple("COLLISION_" + spec["id"].upper() + "_MESH" for spec in MODULES)
    for datablocks in (bpy.data.meshes, bpy.data.lights, bpy.data.cameras):
        for datablock in list(datablocks):
            owned_name = datablock.name.startswith(PREFIX + "_")
            if datablocks is bpy.data.meshes:
                owned_name = owned_name or datablock.name.startswith(collision_mesh_prefixes)
            if (datablock.get("mf_schema") == SCHEMA or owned_name) and datablock.users == 0:
                datablocks.remove(datablock)


def linked_collection(parent, name):
    collection = bpy.data.collections.new(name)
    parent.children.link(collection)
    return collection


def set_socket_value(node, names, value):
    for name in names:
        socket = node.inputs.get(name)
        if socket is not None:
            socket.default_value = value
            return


def make_material(name, rgba, metallic, roughness, emission=None, alpha=1.0):
    material = bpy.data.materials.new(PREFIX + "_MAT_" + name.upper())
    material.diffuse_color = rgba
    material.use_nodes = True
    bsdf = material.node_tree.nodes.get("Principled BSDF")
    set_socket_value(bsdf, ("Base Color",), rgba)
    set_socket_value(bsdf, ("Metallic",), metallic)
    set_socket_value(bsdf, ("Roughness",), roughness)
    set_socket_value(bsdf, ("Alpha",), alpha)
    if emission is not None:
        set_socket_value(bsdf, ("Emission Color", "Emission"), emission[0])
        set_socket_value(bsdf, ("Emission Strength",), emission[1])
    if alpha < 1.0:
        set_socket_value(bsdf, ("Transmission Weight", "Transmission"), 0.16)
        if hasattr(material, "surface_render_method"):
            material.surface_render_method = "DITHERED"
        if hasattr(material, "use_transparency_overlap"):
            material.use_transparency_overlap = False
    material["mf_material_role"] = name
    material["mf_schema"] = SCHEMA
    return material


def create_materials():
    return {
        "asphalt": make_material("asphalt", (0.075, 0.088, 0.102, 1.0), 0.06, 0.74),
        "curb": make_material("curb", (0.42, 0.46, 0.47, 1.0), 0.34, 0.43),
        "metal": make_material("metal", (0.105, 0.135, 0.16, 1.0), 0.74, 0.29),
        "paving": make_material("paving", (0.24, 0.275, 0.29, 1.0), 0.24, 0.52),
        "service": make_material("service", (0.032, 0.055, 0.069, 1.0), 0.58, 0.35),
        "lane": make_material("lane", (0.62, 0.66, 0.65, 1.0), 0.10, 0.58),
        "glazing": make_material("glazing", (0.03, 0.27, 0.34, 0.42), 0.18, 0.16, alpha=0.42),
        "emissive": make_material(
            "emissive", (0.015, 0.45, 0.58, 1.0), 0.08, 0.22,
            emission=((0.01, 0.72, 1.0, 1.0), 6.5),
        ),
        "hazard": make_material(
            "hazard", (0.92, 0.39, 0.025, 1.0), 0.10, 0.42,
            emission=((1.0, 0.17, 0.008, 1.0), 0.32),
        ),
    }


_FINISH = runpy.run_path(str(Path(__file__).resolve().with_name("mf_hardsurface.py")),
                        run_name="mf_hardsurface")
UV_METRES_PER_TILE = 4.0
SHARP_ANGLE_DEG = 35.0


REPO_ROOT = Path(__file__).resolve().parents[2]


def mesh_object(collection, name, vertices, faces, material=None, parent=None):
    mesh = bpy.data.meshes.new(name + "_MESH")
    mesh["mf_schema"] = SCHEMA
    mesh.from_pydata(vertices, [], faces)
    mesh.update(calc_edges=True)
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    if material is not None:
        mesh.materials.append(material)
    if parent is not None:
        obj.parent = parent
    obj["mf_schema"] = SCHEMA
    _finish_surface(obj, name)
    return obj


# Every kit that shares this helper gets its UVs and shading here. Collision
# and evidence geometry is skipped -- neither is ever textured, and a UV layer
# on a collider is bytes for nothing.
_SKIP_FINISH = ("COLLISION", "NAV", "SOCKET", "EVIDENCE", "PROOF")


def _finish_surface(obj, name):
    upper = name.upper()
    if any(token in upper for token in _SKIP_FINISH):
        return
    try:
        _FINISH["uv_box_project"](obj, metres_per_tile=UV_METRES_PER_TILE)
        # weighted normals are skipped here on purpose: these kits are split
        # into hundreds of small role objects, so the modifier round-trip would
        # cost far more than it buys on parts this size
        _FINISH["shade_hard_surface"](obj, sharp_angle=SHARP_ANGLE_DEG,
                                      weighted_normals=False)
    except Exception:
        pass


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


def boxes_object(collection, name, boxes, material, parent):
    vertices, faces = [], []
    for center, size in boxes:
        append_box(vertices, faces, center, size)
    return mesh_object(collection, name, vertices, faces, material, parent) if boxes else None


def append_oriented_box(vertices, faces, center, length, width, height, angle):
    """Append a Z-aligned box whose long axis follows angle in the XY plane."""
    cx, cy, cz = center
    half_length, half_width, half_height = length * 0.5, width * 0.5, height * 0.5
    cosine, sine = math.cos(angle), math.sin(angle)
    corners = []
    for z in (-half_height, half_height):
        for x, y in ((-half_length, -half_width), (half_length, -half_width),
                     (half_length, half_width), (-half_length, half_width)):
            corners.append((cx + x * cosine - y * sine, cy + x * sine + y * cosine, cz + z))
    base = len(vertices)
    vertices.extend(corners)
    faces.extend((
        (base + 0, base + 3, base + 2, base + 1),
        (base + 4, base + 5, base + 6, base + 7),
        (base + 0, base + 1, base + 5, base + 4),
        (base + 1, base + 2, base + 6, base + 5),
        (base + 2, base + 3, base + 7, base + 6),
        (base + 3, base + 0, base + 4, base + 7),
    ))


def oriented_boxes_object(collection, name, boxes, material, parent):
    vertices, faces = [], []
    for center, length, width, height, angle in boxes:
        append_oriented_box(vertices, faces, center, length, width, height, angle)
    return mesh_object(collection, name, vertices, faces, material, parent) if boxes else None


def tag_geometry(obj, role, lod):
    if obj is not None:
        obj["mf_role"] = role
        obj["mf_lod"] = lod
    return obj


def bevel_geometry(obj, width, segments):
    """Apply a deterministic source bevel; LODs choose their own segment count."""
    if obj is None or width <= 0.0 or segments <= 0:
        return obj
    bpy.ops.object.select_all(action="DESELECT")
    obj.hide_viewport = False
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    modifier = obj.modifiers.new(PREFIX + "_CHAMFER", "BEVEL")
    modifier.width = width
    modifier.segments = segments
    modifier.limit_method = "ANGLE"
    if hasattr(modifier, "affect"):
        modifier.affect = "EDGES"
    modifier.use_clamp_overlap = True
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    return obj


def segment_box(a, b, normal, outward, width, height, base_z, trim=0.0):
    dx, dy = b[0] - a[0], b[1] - a[1]
    length = math.hypot(dx, dy)
    usable = max(0.25, length - trim * 2.0)
    center = (
        (a[0] + b[0]) * 0.5 + normal[0] * outward,
        (a[1] + b[1]) * 0.5 + normal[1] * outward,
        base_z + height * 0.5,
    )
    return center, usable, width, height, math.atan2(dy, dx)


def cell_layout(connections):
    breaks = (-HALF_GRID_M, -PRIMARY_HALF_M, PRIMARY_HALF_M, HALF_GRID_M)
    occupied = set()
    for ix in range(3):
        for iy in range(3):
            cx = (breaks[ix] + breaks[ix + 1]) * 0.5
            cy = (breaks[iy] + breaks[iy + 1]) * 0.5
            inside = abs(cx) < PRIMARY_HALF_M and abs(cy) < PRIMARY_HALF_M
            inside = inside or ("N" in connections and abs(cx) < PRIMARY_HALF_M and cy >= PRIMARY_HALF_M)
            inside = inside or ("S" in connections and abs(cx) < PRIMARY_HALF_M and cy <= -PRIMARY_HALF_M)
            inside = inside or ("E" in connections and abs(cy) < PRIMARY_HALF_M and cx >= PRIMARY_HALF_M)
            inside = inside or ("W" in connections and abs(cy) < PRIMARY_HALF_M and cx <= -PRIMARY_HALF_M)
            if inside:
                occupied.add((ix, iy))
    return breaks, occupied


def is_exit_edge(direction, coordinate, connections):
    return (
        (direction == "N" and coordinate == HALF_GRID_M and "N" in connections)
        or (direction == "S" and coordinate == -HALF_GRID_M and "S" in connections)
        or (direction == "E" and coordinate == HALF_GRID_M and "E" in connections)
        or (direction == "W" and coordinate == -HALF_GRID_M and "W" in connections)
    )


def road_cells_geometry(connections, bottom=ROAD_BOTTOM_Z, top=ROAD_TOP_Z):
    breaks, occupied = cell_layout(connections)
    vertices, faces, vertex_map, boundaries = [], [], {}, []

    def vertex(x, y, z):
        key = (float(x), float(y), float(z))
        if key not in vertex_map:
            vertex_map[key] = len(vertices)
            vertices.append(key)
        return vertex_map[key]

    for ix, iy in sorted(occupied):
        x0, x1 = breaks[ix], breaks[ix + 1]
        y0, y1 = breaks[iy], breaks[iy + 1]
        faces.append((vertex(x0, y0, top), vertex(x1, y0, top), vertex(x1, y1, top), vertex(x0, y1, top)))
        faces.append((vertex(x0, y1, bottom), vertex(x1, y1, bottom), vertex(x1, y0, bottom), vertex(x0, y0, bottom)))
        sides = (
            ("W", ix - 1, iy, x0, ((x0, y1), (x0, y0)), (-1.0, 0.0)),
            ("E", ix + 1, iy, x1, ((x1, y0), (x1, y1)), (1.0, 0.0)),
            ("S", ix, iy - 1, y0, ((x0, y0), (x1, y0)), (0.0, -1.0)),
            ("N", ix, iy + 1, y1, ((x1, y1), (x0, y1)), (0.0, 1.0)),
        )
        for direction, nx, ny, coordinate, points, normal in sides:
            if (nx, ny) in occupied:
                continue
            a, b = points
            faces.append((vertex(a[0], a[1], bottom), vertex(b[0], b[1], bottom),
                          vertex(b[0], b[1], top), vertex(a[0], a[1], top)))
            if not is_exit_edge(direction, coordinate, connections):
                boundaries.append((a, b, normal))
    return vertices, faces, boundaries


def adapter_geometry(bottom=ROAD_BOTTOM_Z, top=ROAD_TOP_Z):
    outline = (
        (-10.0, -16.0), (10.0, -16.0), (10.0, -6.0), (6.0, 6.0),
        (6.0, 16.0), (-6.0, 16.0), (-6.0, 6.0), (-10.0, -6.0),
    )
    vertices = [(x, y, top) for x, y in outline] + [(x, y, bottom) for x, y in outline]
    count = len(outline)
    faces = [tuple(range(count)), tuple(reversed(range(count, count * 2)))]
    boundaries = []
    for index, a in enumerate(outline):
        b = outline[(index + 1) % count]
        faces.append((index, (index + 1) % count, (index + 1) % count + count, index + count))
        if (a[1] == b[1] == -16.0) or (a[1] == b[1] == 16.0):
            continue
        edge = Vector((b[0] - a[0], b[1] - a[1]))
        normal = Vector((edge.y, -edge.x)).normalized()
        boundaries.append((a, b, (normal.x, normal.y)))
    return vertices, faces, boundaries


def add_boundary_architecture(collection, module_id, boundaries, materials, root, lod):
    """Build the layered sidewalk/frame silhouette around the driveable deck."""
    layers = {"curb": [], "sidewalk": [], "frame": [], "service": [], "light": [], "barrier": []}
    sidewalk_start = INNER_CURB_WIDTH_M + 0.04
    frame_start = sidewalk_start + SIDEWALK_WIDTH_M + 0.04
    for a, b, normal in boundaries:
        length = math.hypot(b[0] - a[0], b[1] - a[1])
        layers["curb"].append(segment_box(
            a, b, normal, INNER_CURB_WIDTH_M * 0.5, INNER_CURB_WIDTH_M,
            0.28, 0.0, trim=0.18,
        ))
        layers["sidewalk"].append(segment_box(
            a, b, normal, sidewalk_start + SIDEWALK_WIDTH_M * 0.5,
            SIDEWALK_WIDTH_M, 0.36, -0.02, trim=0.34,
        ))
        layers["frame"].append(segment_box(
            a, b, normal, frame_start + EDGE_FRAME_WIDTH_M * 0.5,
            EDGE_FRAME_WIDTH_M, 0.74, -0.30, trim=0.46,
        ))
        if lod <= 1 and length >= 4.8:
            channel_offset = sidewalk_start + SIDEWALK_WIDTH_M * 0.67
            layers["service"].append(segment_box(
                a, b, normal, channel_offset, 0.44, 0.055, 0.345, trim=0.78,
            ))
            layers["light"].append(segment_box(
                a, b, normal, channel_offset, 0.13, 0.040, 0.404, trim=1.05,
            ))
        if lod == 0 and length >= 5.8:
            layers["barrier"].append(segment_box(
                a, b, normal, frame_start + 0.30,
                0.28, 0.78, 0.48, trim=1.25,
            ))

    segment_count = 2 if lod == 0 else 1
    created = []
    curb = tag_geometry(oriented_boxes_object(
        collection, PREFIX + "_" + module_id + "_LOD%d_INNER_CURB" % lod,
        layers["curb"], materials["curb"], root,
    ), "raised_inner_curb", lod)
    sidewalk = tag_geometry(oriented_boxes_object(
        collection, PREFIX + "_" + module_id + "_LOD%d_SIDEWALK" % lod,
        layers["sidewalk"], materials["paving"], root,
    ), "raised_sidewalk", lod)
    frame = tag_geometry(oriented_boxes_object(
        collection, PREFIX + "_" + module_id + "_LOD%d_CHAMFER_FRAME" % lod,
        layers["frame"], materials["metal"], root,
    ), "chamfered_edge_frame", lod)
    created.extend(obj for obj in (curb, sidewalk, frame) if obj is not None)
    bevel_geometry(curb, 0.06, segment_count)
    bevel_geometry(sidewalk, 0.10, segment_count)
    bevel_geometry(frame, 0.15, segment_count)
    if lod <= 1:
        service = tag_geometry(oriented_boxes_object(
            collection, PREFIX + "_" + module_id + "_LOD%d_SERVICE_CHANNEL" % lod,
            layers["service"], materials["service"], root,
        ), "inset_service_channel", lod)
        light = tag_geometry(oriented_boxes_object(
            collection, PREFIX + "_" + module_id + "_LOD%d_CYAN_CHANNEL" % lod,
            layers["light"], materials["emissive"], root,
        ), "cyan_service_light", lod)
        created.extend(obj for obj in (service, light) if obj is not None)
    if lod == 0:
        barrier = tag_geometry(oriented_boxes_object(
            collection, PREFIX + "_" + module_id + "_LOD0_EDGE_BARRIER",
            layers["barrier"], materials["metal"], root,
        ), "modular_edge_barrier", lod)
        bevel_geometry(barrier, 0.10, 2)
        created.extend(obj for obj in (barrier,) if obj is not None)
    return created


def direction_frame(direction, forward, lateral=0.0):
    if direction == "N":
        return lateral, forward, math.pi * 0.5
    if direction == "S":
        return -lateral, -forward, math.pi * 0.5
    if direction == "E":
        return forward, -lateral, 0.0
    return -forward, lateral, 0.0


def add_deck_details(collection, spec, materials, root, lod):
    """Add traffic language and service hardware above the one-piece surface."""
    if lod > 1:
        return []
    module_id, connections = spec["id"], spec["connections"]
    seams, markings, paving, drains, drain_slots = [], [], [], [], []

    # Every socket approach has two readable traffic lanes and a center dash.
    for direction in connections:
        for lateral in (-5.1, 5.1):
            x, y, angle = direction_frame(direction, 12.9, lateral)
            seams.append(((x, y, 0.030), 5.7, 0.075, 0.035, angle))
        x, y, angle = direction_frame(direction, 13.0, 0.0)
        markings.append(((x, y, 0.048), 3.1, 0.24, 0.040, angle))
        panel_x, panel_y, panel_angle = direction_frame(direction, 12.4, 7.55)
        drains.append(((panel_x, panel_y, 0.036), 2.35, 1.15, 0.050, panel_angle))
        for offset in (-0.72, -0.24, 0.24, 0.72):
            sx, sy, _ = direction_frame(direction, 12.4 + offset, 7.55)
            drain_slots.append(((sx, sy, 0.068), 0.82, 0.09, 0.025, panel_angle + math.pi * 0.5))

    if module_id in ("straight", "gate"):
        seams.extend([
            ((-5.1, 0.0, 0.030), 20.0, 0.075, 0.035, math.pi * 0.5),
            ((5.1, 0.0, 0.030), 20.0, 0.075, 0.035, math.pi * 0.5),
        ])
        for y in (-8.0, 0.0, 8.0):
            seams.append(((0.0, y, 0.030), 19.4, 0.075, 0.035, 0.0))
        for y in (-9.0, -3.0, 3.0, 9.0):
            markings.append(((0.0, y, 0.048), 3.0, 0.24, 0.040, math.pi * 0.5))
    elif module_id == "primary_local_adapter":
        for x in (-3.8, 3.8):
            seams.append(((x, 10.0, 0.030), 11.6, 0.075, 0.035, math.pi * 0.5))
        for x in (-6.6, 6.6):
            seams.append(((x, -10.0, 0.030), 11.6, 0.075, 0.035, math.pi * 0.5))
        for y in (-9.0, -3.0, 3.0, 9.0):
            markings.append(((0.0, y, 0.048), 2.7, 0.24, 0.040, math.pi * 0.5))

    # Junctions receive authored paving and crosswalks instead of a flat center.
    if len(connections) >= 3:
        tile = 4.10 if module_id == "x_plaza" else 3.90
        for x in (-4.35, 0.0, 4.35):
            for y in (-4.35, 0.0, 4.35):
                paving.append(((x, y, 0.050), tile, tile, 0.055, 0.0))
        for direction in connections:
            for lateral in (-7.2, -4.8, -2.4, 0.0, 2.4, 4.8, 7.2):
                x, y, angle = direction_frame(direction, 8.0, lateral)
                markings.append(((x, y, 0.060), 1.35, 1.05, 0.040, angle))
    elif module_id == "corner":
        for x in (-3.2, 3.2):
            for y in (-3.2, 3.2):
                paving.append(((x, y, 0.050), 5.7, 5.7, 0.055, 0.0))
    elif module_id == "endcap":
        for x in (-4.2, 0.0, 4.2):
            for y in (-3.0, 1.2, 5.4):
                paving.append(((x, y, 0.050), 3.75, 3.75, 0.055, 0.0))
        for x in (-5.0, 0.0, 5.0):
            markings.append(((x, -5.3, 0.065), 3.2, 0.55, 0.045, math.pi * 0.25))

    if lod == 1:
        # LOD1 retains the navigational language, but drops individual drain
        # slots and alternates plaza panels to cut small-screen triangles.
        drain_slots = []
        drains = drains[::2]
        paving = paving[::2]

    created = [
        tag_geometry(oriented_boxes_object(collection, PREFIX + "_" + module_id + "_LOD%d_LANE_SEAMS" % lod,
                                           seams, materials["service"], root), "lane_seams", lod),
        tag_geometry(oriented_boxes_object(collection, PREFIX + "_" + module_id + "_LOD%d_MARKINGS" % lod,
                                           markings, materials["lane"], root), "lane_and_crosswalk_markings", lod),
        tag_geometry(oriented_boxes_object(collection, PREFIX + "_" + module_id + "_LOD%d_PLAZA_PAVING" % lod,
                                           paving, materials["paving"], root), "plaza_paving", lod),
        tag_geometry(oriented_boxes_object(collection, PREFIX + "_" + module_id + "_LOD%d_DRAIN_PANELS" % lod,
                                           drains, materials["metal"], root), "drainage_service_panels", lod),
        tag_geometry(oriented_boxes_object(collection, PREFIX + "_" + module_id + "_LOD%d_DRAIN_SLOTS" % lod,
                                           drain_slots, materials["hazard"], root), "drainage_slots", lod),
    ]
    return [obj for obj in created if obj is not None]


def bollard_locations(boundaries):
    candidates = []
    for a, b, normal in boundaries:
        length = math.hypot(b[0] - a[0], b[1] - a[1])
        if length < 5.0:
            continue
        cx = (a[0] + b[0]) * 0.5 + normal[0] * 1.65
        cy = (a[1] + b[1]) * 0.5 + normal[1] * 1.65
        candidates.append((-length, round(cx, 5), round(cy, 5), (cx, cy)))
    return [entry[3] for entry in sorted(candidates)[:4]]


def add_bollards(collection, module_id, boundaries, materials, root):
    metal, glass, light = [], [], []
    for x, y in bollard_locations(boundaries):
        metal.append(((x, y, 1.06), (0.82, 0.82, 1.44)))
        glass.append(((x, y, 1.96), (0.62, 0.62, 0.36)))
        light.append(((x, y, 2.20), (0.66, 0.66, 0.10)))
    metal_obj = tag_geometry(boxes_object(collection, PREFIX + "_" + module_id + "_LOD0_BOLLARD_METAL",
                                          metal, materials["metal"], root), "service_bollard", 0)
    glass_obj = tag_geometry(boxes_object(collection, PREFIX + "_" + module_id + "_LOD0_BOLLARD_GLASS",
                                          glass, materials["glazing"], root), "bollard_glazing", 0)
    light_obj = tag_geometry(boxes_object(collection, PREFIX + "_" + module_id + "_LOD0_BOLLARD_LIGHT",
                                          light, materials["emissive"], root), "bollard_emissive", 0)
    bevel_geometry(metal_obj, 0.10, 2)
    bevel_geometry(glass_obj, 0.05, 1)
    return [obj for obj in (metal_obj, glass_obj, light_obj) if obj is not None]


def add_gate(collection, module_id, materials, root, lod):
    if lod == 2:
        metal_boxes = [
            ((-12.55, 0.0, 5.32), (3.1, 3.8, 9.72)), ((12.55, 0.0, 5.32), (3.1, 3.8, 9.72)),
            ((0.0, 0.0, 11.24), (28.2, 3.4, 2.0)),
        ]
    else:
        metal_boxes = [
            ((-12.55, 0.0, 0.86), (5.2, 6.0, 0.80)), ((12.55, 0.0, 0.86), (5.2, 6.0, 0.80)),
            ((-12.55, 0.0, 1.86), (4.5, 5.2, 1.16)), ((12.55, 0.0, 1.86), (4.5, 5.2, 1.16)),
            ((-12.55, 0.0, 5.73), (3.4, 4.1, 6.50)), ((12.55, 0.0, 5.73), (3.4, 4.1, 6.50)),
            ((-12.55, 0.0, 9.60), (4.6, 4.8, 1.20)), ((12.55, 0.0, 9.60), (4.6, 4.8, 1.20)),
            ((0.0, 0.0, 11.24), (28.4, 3.5, 2.0)),
            ((0.0, 0.0, 12.535), (24.8, 2.7, 0.55)),
        ]
    metal_obj = tag_geometry(boxes_object(
        collection, PREFIX + "_" + module_id + "_LOD%d_GATE_STRUCTURE" % lod,
        metal_boxes, materials["metal"], root,
    ), "gate_pylons_crossbeam", lod)
    bevel_geometry(metal_obj, 0.24 if lod == 0 else 0.14, 2 if lod == 0 else 1)
    created = [metal_obj]
    if lod <= 1:
        front_y = -2.10
        panel_boxes = [
            ((-12.55, front_y, 5.70), (1.75, 0.10, 4.50)),
            ((12.55, front_y, 5.70), (1.75, 0.10, 4.50)),
            ((0.0, -1.80, 11.24), (15.8, 0.10, 0.62)),
        ]
        light_boxes = [
            ((-12.55, -2.24, 5.70), (0.18, 0.08, 5.00)),
            ((12.55, -2.24, 5.70), (0.18, 0.08, 5.00)),
            ((0.0, -1.94, 11.24), (15.0, 0.08, 0.16)),
        ]
        hazard_boxes = [
            ((-12.55, -2.72, 1.84), (3.20, 0.10, 0.34)),
            ((12.55, -2.72, 1.84), (3.20, 0.10, 0.34)),
        ]
        panels = tag_geometry(boxes_object(
            collection, PREFIX + "_" + module_id + "_LOD%d_GATE_GLAZING" % lod,
            panel_boxes, materials["glazing"], root,
        ), "gate_recessed_glazing", lod)
        lights = tag_geometry(boxes_object(
            collection, PREFIX + "_" + module_id + "_LOD%d_GATE_EMISSIVE" % lod,
            light_boxes, materials["emissive"], root,
        ), "gate_emissive_channels", lod)
        hazards = tag_geometry(boxes_object(
            collection, PREFIX + "_" + module_id + "_LOD%d_GATE_HAZARD" % lod,
            hazard_boxes, materials["hazard"], root,
        ), "gate_hazard_panels", lod)
        created.extend((panels, lights, hazards))
    return [obj for obj in created if obj is not None]


def triangle_count(obj):
    if obj.type != "MESH":
        return 0
    obj.data.calc_loop_triangles()
    return len(obj.data.loop_triangles)


def create_empty(collection, name, parent, location=(0.0, 0.0, 0.0), display="PLAIN_AXES"):
    obj = bpy.data.objects.new(name, None)
    collection.objects.link(obj)
    obj.parent = parent
    obj.location = location
    obj.empty_display_type = display
    obj.empty_display_size = 1.5
    obj["mf_schema"] = SCHEMA
    return obj


def create_module(master, spec, materials):
    module_id = spec["id"]
    module_collection = linked_collection(master, PREFIX + "_" + module_id.upper())
    root = create_empty(module_collection, PREFIX + "_ROOT_" + module_id, None)
    root.location = (spec["layout"][0], spec["layout"][1], 0.0)
    root["mf_asset_kind"] = "modular_primary_road"
    root["mf_module_id"] = module_id
    root["mf_grid_m"] = GRID_M
    root["mf_primary_width_m"] = PRIMARY_WIDTH_M
    root["mf_connections"] = json.dumps(spec["connections"], separators=(",", ":"))
    root["mf_heavy_mech_clearance"] = True
    root["mf_lane_count"] = 2
    root["mf_concept_features"] = (
        "layered_deck,chamfer_frame,sidewalk,service_channels,lane_language,drainage,edge_barrier"
    )
    if spec.get("gate"):
        root["mf_gate_clearance_width_m"] = PRIMARY_WIDTH_M
        root["mf_gate_clearance_height_m"] = 10.0

    if spec.get("adapter"):
        base_vertices, base_faces, boundaries = adapter_geometry()
    else:
        base_vertices, base_faces, boundaries = road_cells_geometry(spec["connections"])

    lod_records = []
    all_objects = [root]
    for lod in range(3):
        lod_collection = linked_collection(module_collection, PREFIX + "_" + module_id.upper() + "_LOD%d" % lod)
        surface = mesh_object(
            lod_collection, PREFIX + "_" + module_id + "_LOD%d_ROAD_SURFACE" % lod,
            base_vertices, base_faces, materials["asphalt"], root,
        )
        surface["mf_role"] = "road_surface"
        surface["mf_lod"] = lod
        surface["mf_single_surface_mesh"] = True
        all_objects.append(surface)
        all_objects.extend(add_boundary_architecture(
            lod_collection, module_id, boundaries, materials, root, lod,
        ))
        all_objects.extend(add_deck_details(lod_collection, spec, materials, root, lod))
        if lod == 0:
            all_objects.extend(add_bollards(lod_collection, module_id, boundaries, materials, root))
        if spec.get("gate"):
            all_objects.extend(add_gate(lod_collection, module_id, materials, root, lod))
        lod_meshes = [obj for obj in lod_collection.objects if obj.type == "MESH"]
        for obj in lod_meshes:
            obj["mf_lod"] = lod
        all_objects.extend(obj for obj in lod_meshes if obj not in all_objects)
        lod_records.append({"lod": lod, "triangles": sum(triangle_count(obj) for obj in lod_meshes)})

    socket_widths = spec.get("socket_widths", {})
    sockets = []
    for direction in spec["connections"]:
        dx, dy, angle = CARDINALS[direction]
        socket = create_empty(
            module_collection, "SOCKET_%s_%s" % (module_id.upper(), direction), root,
            (dx * HALF_GRID_M, dy * HALF_GRID_M, ROAD_TOP_Z), "ARROWS",
        )
        socket.rotation_euler[2] = angle
        socket["mf_role"] = "road_socket"
        socket["mf_direction"] = direction
        socket["mf_socket_type"] = "local_road" if socket_widths.get(direction) == LOCAL_WIDTH_M else "primary_road"
        socket["mf_width_m"] = float(socket_widths.get(direction, PRIMARY_WIDTH_M))
        socket["mf_nav_link"] = True
        sockets.append(socket)
        all_objects.append(socket)

    nav = create_empty(module_collection, "NAV_" + module_id.upper(), root, display="CIRCLE")
    nav["mf_role"] = "navigation_metadata"
    nav["mf_connections"] = json.dumps(spec["connections"], separators=(",", ":"))
    nav["mf_clearance_classes"] = "infantry,light,heavy,superheavy"
    nav["mf_lane_width_m"] = PRIMARY_WIDTH_M
    nav["mf_cost_multiplier"] = 0.72
    all_objects.append(nav)

    collision_collection = linked_collection(module_collection, PREFIX + "_" + module_id.upper() + "_COLLISION")
    if spec.get("adapter"):
        collision_vertices, collision_faces, _ = adapter_geometry(bottom=-0.35, top=-0.29)
    else:
        collision_vertices, collision_faces, _ = road_cells_geometry(
            spec["connections"], bottom=-0.35, top=-0.29,
        )
    collision = mesh_object(
        collision_collection, "COLLISION_" + module_id.upper(),
        collision_vertices, collision_faces, None, root,
    )
    collision.display_type = "WIRE"
    collision.hide_render = True
    collision["mf_role"] = "simplified_collision"
    collision["mf_collision_class"] = "driveable_surface"
    collision["mf_clearance_width_m"] = min(socket["mf_width_m"] for socket in sockets)
    all_objects.append(collision)

    # Refresh from the root after all decorative/gate builders have run. This
    # ensures per-module evidence isolation also controls bollards and glazing.
    all_objects = [root] + descendants(root)

    # Only LOD0 is visible in the authoring/evidence scene. Export temporarily
    # unhides all LODs, so the GLB still contains the complete hierarchy.
    for obj in all_objects:
        if obj.get("mf_lod", 0) > 0:
            obj.hide_render = True

    return {
        "spec": spec,
        "collection": module_collection,
        "root": root,
        "objects": all_objects,
        "sockets": sockets,
        "collision": collision,
        "lods": lod_records,
    }


def add_evidence_rig(master, materials):
    helpers = linked_collection(master, PREFIX + "_EVIDENCE_RIG")
    bpy.ops.mesh.primitive_plane_add(size=260.0, location=(0.0, 0.0, -0.42))
    floor = bpy.context.object
    for collection in list(floor.users_collection):
        collection.objects.unlink(floor)
    helpers.objects.link(floor)
    floor.name = PREFIX + "_EVIDENCE_FLOOR"
    floor.data["mf_schema"] = SCHEMA
    floor_material = make_material("evidence_floor", (0.055, 0.068, 0.078, 1.0), 0.04, 0.88)
    floor_material["mf_evidence_only"] = True
    floor.data.materials.append(floor_material)
    floor["mf_evidence_only"] = True

    def area(name, location, energy, size, color):
        data = bpy.data.lights.new(PREFIX + "_" + name, "AREA")
        data["mf_schema"] = SCHEMA
        data.energy, data.shape, data.size, data.color = energy, "DISK", size, color
        obj = bpy.data.objects.new(PREFIX + "_" + name, data)
        helpers.objects.link(obj)
        obj.location = location
        obj.rotation_euler = (Vector((0.0, 0.0, 0.0)) - obj.location).to_track_quat("-Z", "Y").to_euler()
        obj["mf_evidence_only"] = True
        return obj

    area("KEY", (75.0, -70.0, 105.0), 11000.0, 54.0, (0.76, 0.89, 1.0))
    area("FILL", (-62.0, -36.0, 70.0), 7000.0, 46.0, (0.30, 0.55, 0.88))
    area("RIM", (-35.0, 82.0, 82.0), 9000.0, 42.0, (1.0, 0.48, 0.20))
    camera_data = bpy.data.cameras.new(PREFIX + "_CAMERA")
    camera_data["mf_schema"] = SCHEMA
    camera_data.type = "ORTHO"
    camera = bpy.data.objects.new(PREFIX + "_CAMERA", camera_data)
    helpers.objects.link(camera)
    camera["mf_evidence_only"] = True
    bpy.context.scene.camera = camera
    return helpers, floor, camera


def configure_render(config):
    scene = bpy.context.scene
    # Geometry evidence must remain readable even when the target Blender build
    # exposes different Eevee engine identifiers. Runtime/PBR approval is a
    # separate in-game gate, so authoring captures use deterministic Workbench.
    scene.render.engine = "BLENDER_WORKBENCH"
    scene.display.shading.light = "STUDIO"
    scene.display.shading.color_type = "MATERIAL"
    scene.display.shading.show_shadows = True
    scene.display.shading.show_cavity = True
    scene.display.shading.cavity_type = "BOTH"
    scene.display.shading.curvature_ridge_factor = 1.65
    scene.display.shading.curvature_valley_factor = 1.25
    scene.display.shading.background_type = "VIEWPORT"
    scene.display.shading.background_color = (0.018, 0.026, 0.034)
    scene.render.resolution_x = config["render_resolution"]
    scene.render.resolution_y = config["render_resolution"]
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.film_transparent = False
    scene.world.use_nodes = True
    background = scene.world.node_tree.nodes.get("Background")
    background.inputs["Color"].default_value = (0.008, 0.014, 0.021, 1.0)
    background.inputs["Strength"].default_value = 0.62
    if hasattr(scene.view_settings, "look"):
        try:
            scene.view_settings.look = "AgX - Medium High Contrast"
        except TypeError:
            pass


def point_camera(camera, target, direction, ortho_scale):
    direction = Vector(direction).normalized()
    target = Vector(target)
    camera.location = target + direction * (ortho_scale * 1.65)
    camera.rotation_euler = (target - camera.location).to_track_quat("-Z", "Y").to_euler()
    camera.data.ortho_scale = ortho_scale


def set_module_render_visibility(modules, visible_id=None):
    for module in modules:
        module_visible = visible_id is None or module["spec"]["id"] == visible_id
        for obj in module["objects"]:
            if obj.type != "MESH":
                continue
            role = obj.get("mf_role", "")
            lod = int(obj.get("mf_lod", 0))
            obj.hide_render = (not module_visible) or role == "simplified_collision" or lod > 0


def render_evidence(config, modules, camera):
    evidence_dir = Path(config["evidence_dir"])
    evidence_dir.mkdir(parents=True, exist_ok=True)
    scene = bpy.context.scene
    renders = []
    generated = {obj for module in modules for obj in module["objects"]}
    generated.update(obj for obj in scene.objects if obj.get("mf_evidence_only"))
    generated.add(camera)
    unrelated = [(obj, obj.hide_render) for obj in scene.objects if obj not in generated]
    for obj, _ in unrelated:
        obj.hide_render = True
    try:
        set_module_render_visibility(modules)
        point_camera(camera, (0.0, 0.0, 0.0), (1.15, -1.2, 0.92), 185.0)
        overview = evidence_dir / "mf-modular-road-v1-overview.png"
        scene.render.filepath = str(overview)
        bpy.ops.render.render(write_still=True)
        renders.append(overview.relative_to(REPO_ROOT).as_posix())

        views = {
            "iso_ne": ((1.2, -1.2, 0.82), 44.0),
            "iso_nw": ((-1.2, -1.2, 0.82), 44.0),
            "top": ((0.0, -0.001, 1.0), 42.0),
            "entry": ((0.0, -1.0, 0.28), 43.0),
        }
        for requested in config["evidence_views"]:
            if requested not in views:
                raise ValueError("unsupported evidence view: " + requested)
        for module in modules:
            module_id = module["spec"]["id"]
            set_module_render_visibility(modules, module_id)
            target = (module["root"].location.x, module["root"].location.y, 2.0 if module["spec"].get("gate") else 0.5)
            for view in config["evidence_views"]:
                direction, scale = views[view]
                point_camera(camera, target, direction, 46.0 if module["spec"].get("gate") else scale)
                output = evidence_dir / ("mf-road-%s-%s.png" % (module_id, view))
                scene.render.filepath = str(output)
                bpy.ops.render.render(write_still=True)
                renders.append(output.relative_to(REPO_ROOT).as_posix())
        set_module_render_visibility(modules)
        return renders
    finally:
        for obj, original_hide_render in unrelated:
            obj.hide_render = original_hide_render


def descendants(root):
    found, stack = [], list(root.children)
    while stack:
        child = stack.pop()
        found.append(child)
        stack.extend(child.children)
    return found


def export_modules(config, modules):
    export_dir = Path(config["export_dir"])
    export_dir.mkdir(parents=True, exist_ok=True)
    outputs = []
    for module in modules:
        root = module["root"]
        original_location = root.location.copy()
        root.location = (0.0, 0.0, 0.0)
        selected = [root] + descendants(root)
        hidden = [(obj, obj.hide_render, obj.hide_viewport) for obj in selected]
        bpy.ops.object.select_all(action="DESELECT")
        for obj in selected:
            obj.hide_render = False
            obj.hide_viewport = False
            obj.select_set(True)
        bpy.context.view_layer.objects.active = root
        output = export_dir / ("mf-road-%s.glb" % module["spec"]["id"])
        bpy.ops.export_scene.gltf(
            filepath=str(output), export_format="GLB", use_selection=True,
            export_apply=True, export_extras=True, export_cameras=False,
            export_lights=False, export_yup=True,
        )
        for obj, hide_render, hide_viewport in hidden:
            obj.hide_render, obj.hide_viewport = hide_render, hide_viewport
        root.location = original_location
        outputs.append(output.resolve().relative_to(REPO_ROOT).as_posix())
    return outputs


def build_report(config, modules, exports, renders):
    records = []
    for module in modules:
        spec = module["spec"]
        rejected = REJECTED_LOD_TRIANGLES[spec["id"]]
        lods = []
        for entry in module["lods"]:
            previous = rejected[entry["lod"]]
            lods.append({
                "lod": entry["lod"],
                "triangles": entry["triangles"],
                "rejectedGreyboxTriangles": previous,
                "triangleDelta": entry["triangles"] - previous,
            })
        role_triangles = {}
        material_roles = set()
        for obj in module["objects"]:
            if obj.type != "MESH" or obj.get("mf_role") == "simplified_collision":
                continue
            role = obj.get("mf_role", "unclassified")
            role_triangles[role] = role_triangles.get(role, 0) + triangle_count(obj)
            for slot in obj.material_slots:
                if slot.material and slot.material.get("mf_material_role"):
                    material_roles.add(slot.material["mf_material_role"])
        records.append({
            "id": spec["id"],
            "gridM": GRID_M,
            "primaryWidthM": PRIMARY_WIDTH_M,
            "connections": list(spec["connections"]),
            "sockets": [
                {
                    "name": socket.name,
                    "direction": socket["mf_direction"],
                    "type": socket["mf_socket_type"],
                    "widthM": socket["mf_width_m"],
                    "localPosition": [round(value, 4) for value in socket.location],
                }
                for socket in module["sockets"]
            ],
            "lods": lods,
            "geometryRoleTriangles": dict(sorted(role_triangles.items())),
            "materialRoles": sorted(material_roles),
            "collisionTriangles": triangle_count(module["collision"]),
            "gateClearanceM": {"width": 20.0, "height": 10.0} if spec.get("gate") else None,
        })
    return {
        "format": SCHEMA,
        "version": 1,
        "units": "meters",
        "deterministic": True,
        "evidenceRenderer": "BLENDER_WORKBENCH",
        "conceptReference": config["concept_reference"],
        "materials": [
            "asphalt", "curb", "metal", "paving", "service", "lane",
            "glazing", "emissive", "hazard",
        ],
        "conceptDeltaChecklist": [
            {
                "criterion": "20 m heavy-mech deck reads as a divided multi-lane route",
                "state": "IMPLEMENTED_PENDING_VISUAL_REVIEW",
                "source": "lane seams, center dashes, transverse panel seams and socket metadata",
            },
            {
                "criterion": "Road edge has raised, layered construction instead of one flat slab",
                "state": "IMPLEMENTED_PENDING_VISUAL_REVIEW",
                "source": "inner curb, raised sidewalk and lower structural frame are separate non-coplanar layers",
            },
            {
                "criterion": "Structural edging is chamfered rather than primitive boxes",
                "state": "IMPLEMENTED_PENDING_VISUAL_REVIEW",
                "source": "applied deterministic LOD-specific bevels on frames, sidewalks, barriers and pylons",
            },
            {
                "criterion": "Cyan service lighting is inset into an authored channel",
                "state": "IMPLEMENTED_PENDING_VISUAL_REVIEW",
                "source": "dark service channel surrounds a narrower cyan strip above the sidewalk layer",
            },
            {
                "criterion": "Junctions use crosswalks and plaza paving",
                "state": "IMPLEMENTED_PENDING_VISUAL_REVIEW",
                "source": "T/X center tile fields plus branch-specific crosswalk bars",
            },
            {
                "criterion": "Road has service/drainage hardware and edge protection",
                "state": "IMPLEMENTED_PENDING_VISUAL_REVIEW",
                "source": "socket-approach drain panels, grate slots, edge barriers and service bollards",
            },
            {
                "criterion": "Gate has substantial pylons and an armored crossbeam",
                "state": "IMPLEMENTED_PENDING_VISUAL_REVIEW",
                "source": "tiered plinth/body/shoulder pylons, layered beam, glazing, emissive and hazard panels",
            },
            {
                "criterion": "Final PBR wear, decals and runtime scale are approved",
                "state": "NOT_YET_VERIFIED",
                "source": "requires Blender MCP renders followed by in-game phone-first evidence",
            },
        ],
        "visualAcceptance": "PENDING_BLENDER_MCP_REGENERATION_AND_REVIEW",
        "modules": records,
        "exports": exports,
        "evidenceRenders": renders,
        "blend": (Path(config["blend_path"]).resolve().relative_to(REPO_ROOT).as_posix()
                  if config["save_blend"] else None),
    }


def build_road_kit(overrides=None):
    config = merged_config(overrides)
    clear_previous_generated_kit()
    master = bpy.data.collections.new(MASTER_COLLECTION)
    bpy.context.scene.collection.children.link(master)
    master["mf_schema"] = SCHEMA
    master["mf_generator"] = Path(__file__).name
    master["mf_grid_m"] = GRID_M
    master["mf_concept_reference"] = config["concept_reference"]
    materials = create_materials()
    modules = [create_module(master, spec, materials) for spec in MODULES]
    _, _, camera = add_evidence_rig(master, materials)
    configure_render(config)
    bpy.context.view_layer.update()

    exports = export_modules(config, modules) if config["export_glb"] else []
    renders = render_evidence(config, modules, camera) if config["render_evidence"] else []
    report = build_report(config, modules, exports, renders)
    report_path = Path(config["report_path"])
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")

    if config["save_blend"]:
        blend_path = Path(config["blend_path"])
        blend_path.parent.mkdir(parents=True, exist_ok=True)
        _stale = _FINISH["purge_orphans"]()
        if _stale:
            print("  purged factory-startup leftovers: %s" % ", ".join(_stale))
        bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))
    print(json.dumps({
        "status": "PASS",
        "format": SCHEMA,
        "modules": len(modules),
        "exports": len(exports),
        "renders": len(renders),
        "report": report_path.resolve().relative_to(REPO_ROOT).as_posix(),
    }, separators=(",", ":")))
    return report


def arguments():
    values = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    if len(values) > 1:
        raise SystemExit("usage: blender --background --python build-mf-modular-road-kit.py -- [CONFIG.json]")
    if not values:
        return None
    with open(values[0], "r", encoding="utf-8") as source:
        return json.load(source)


if __name__ == "__main__":
    build_road_kit(arguments())
