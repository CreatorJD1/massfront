"""Author MASSFRONT's deterministic modular building kit in Blender.

Twelve building archetypes are authored three times over -- colonial, Nova
brutalist and ruined -- for 36 whole-building modules that snap to the same
32 m placement grid the modular road kit already uses. Whole buildings, not a
kit of parts: each module is one complete structure occupying 1x1, 2x1 or 2x2
grid cells, so it drops onto the existing WORLD_KIT kind 6/7 render path with
no engine change.

WHAT MAKES IT TILE. Three contracts, held by every module in the pack:

  * PARTY-WALL PLANE. Facades stop at the cell boundary less JOINT_M, so two
    neighbours butt into a 2*JOINT_M recessed joint instead of a coplanar
    fight. The joint reads as a deliberate expansion gap and never z-fights.
  * SHARED FLOOR DATUM. Plinth height, sill height and floor pitch are global
    constants, so window bands line up across adjacent buildings of different
    archetypes and a row reads as one continuous street wall.
  * TYPED EDGE SOCKETS. Every cell edge carries a SOCKET_* empty declaring
    street / party_wall / service / open. A placer reads those to decide what
    may butt against what, which is what turns a pile of models into a kit.

WHAT MAKES IT READ AS SCI-FI. v1 of this generator built every module as a
stack of plain rectangular prisms with a thin ribbon window applied to the
surface, and it photographed as an architectural massing study -- flat grey
boxes. The vocabulary, not the tuning, was wrong. v2 replaces it:

  * BANDED SHELL. The wall is not one box with a decal. It is an alternating
    stack of full-width spandrel slabs and inset window drums, so the recess
    is real geometry that casts a real shadow line.
  * BATTERED WALLS. Masses taper inward as they rise. A fortress slope is the
    single cheapest change that stops a volume reading as an office block.
  * BIG CHAMFERS. Corners are cut in metres, not centimetres -- every mass is
    an octagonal prism, so the silhouette has eight edges catching light.
  * HEAVY CORNICE. A thick slab overhanging the wall head, which is the move
    that reads "brutalist" from further away than any surface detail.
  * GREEBLES. Armour plate, riser stacks, vent banks, dish arrays -- bolted on
    at the bay pitch so they never look scattered.
  * HARD CONTRAST. Recesses are near-black, armour is pale. v1 painted the
    whole kit in one mid-grey and everything dissolved into everything else.

The generator creates source geometry only. It does not register runtime
assets, download external content, or alter an existing scene outside its own
tagged collection. Running it repeatedly replaces the previous generated kit.

CLI:
  blender --background --python tools/blender/build-mf-modular-building-kit.py -- CONFIG.json

Blender MCP / execute_blender_code:
  import runpy
  tool = runpy.run_path(r"C:\\path\\to\\tools\\blender\\build-mf-modular-building-kit.py",
                        run_name="mf_modular_building_tool")
  tool["build_building_kit"]({"render_evidence": False})
"""

import bpy
import runpy
import json
import math
import os
import sys
import zlib
from pathlib import Path
from mathutils import Vector


SCHEMA = "MassfrontModularBuildingKitV1"
PREFIX = "MF_MODBLD_V1"
MASTER_COLLECTION = PREFIX + "_SOURCE"

# Placement grid shared verbatim with mf-modular-road-v1. A building footprint
# is always a whole number of these cells, which is what lets a block of
# buildings and the road that serves it land on the same lattice.
GRID_M = 32.0
HALF_GRID_M = GRID_M * 0.5
# Facade bay module. Fins, armour plates, vents and riser stacks all land on
# this pitch so bolted-on hardware reads as engineered rather than scattered.
BAY_M = 8.0
# Vertical datum. Shared by all 36 modules -- see SHARED FLOOR DATUM above.
FLOOR_M = 4.0
PLINTH_M = 0.6
SILL_M = 1.2
BAND_M = 2.0
# Half of the recessed joint left at every party-wall plane.
JOINT_M = 0.06

CARDINALS = {
    "N": (0.0, 1.0, 0.0),
    "E": (1.0, 0.0, -math.pi * 0.5),
    "S": (0.0, -1.0, math.pi),
    "W": (-1.0, 0.0, math.pi * 0.5),
}

# ---------------------------------------------------------------------------
# STYLE SETS
# ---------------------------------------------------------------------------
# The same massing is authored three ways. Style does not change footprint,
# floor datum or socket types -- only surface language, detail density and
# state of repair -- so a colonial hab and a brutalist hab are interchangeable
# on the same plot and still butt seamlessly against each other.
#
# NOTHING MAY CROSS THE PARTY PLANE. The first cut of this vocabulary battered
# every wall inward and flared the base and cornice outward, which looked right
# on a lone module and wrecked the kit: neighbours touched only at the ground
# and opened into a wedge-shaped gap as they rose, while base and cornice
# interpenetrated the cell next door. So the mass is composed INSIDE the
# envelope -- a full-width base block and a full-width cornice that both return
# to the party plane, with a recessed, gently battered shaft between them. Two
# neighbours meet flush at base and cornice, and the recessed shafts read as a
# deliberate vertical joint between blocks.
#
# batter      fraction of half-extent the shaft loses over its own height
# chamfer     corner cut in METRES; drives the octagonal plan of every mass
# cornice     vertical thickness of the capping band
# slot        depth the window drum is recessed into the shaft
# fin         projection of the vertical mullion fins
# inset       how far the shaft is recessed from the party plane
# greeble     density multiplier for bolted-on mechanical hardware
# armour      density of applied plating
STYLES = {
    "colonial": {
        "label": "Neutral colonial",
        "wall": (0.605, 0.588, 0.545, 1.0),
        "trim": (0.520, 0.505, 0.468, 1.0),
        "deck": (0.352, 0.386, 0.360, 1.0),
        # Prefab industrial: shallow slope, moderate chamfer, a lot of bolted
        # hardware, generous lit glazing.
        "batter": 0.052, "chamfer": 1.7, "cornice": 0.70, "slot": 0.95,
        "fin": 0.40, "inset": 0.60,
        "greeble": 1.0, "armour": 0.85, "mast": 1.0, "canopy": 1.0,
        "glazed": 0.74, "emissive": 1.0,
        "ruin": 0.0,
        "bevel": (0.22, 2),
    },
    "brutalist": {
        "label": "Nova brutalist",
        "wall": (0.548, 0.552, 0.532, 1.0),
        "trim": (0.470, 0.474, 0.456, 1.0),
        "deck": (0.300, 0.332, 0.318, 1.0),
        # Heavy concrete: strong batter, metre-scale chamfers, a cornice you
        # can read at silhouette range, deep window slots, little clutter.
        "batter": 0.095, "chamfer": 3.3, "cornice": 1.05, "slot": 1.55,
        "fin": 0.90, "inset": 0.95,
        "greeble": 0.45, "armour": 0.45, "mast": 0.5, "canopy": 0.35,
        "glazed": 0.40, "emissive": 0.62,
        "ruin": 0.0,
        "bevel": (0.30, 2),
    },
    "ruined": {
        "label": "Derelict",
        "wall": (0.442, 0.424, 0.386, 1.0),
        "trim": (0.380, 0.364, 0.332, 1.0),
        "deck": (0.256, 0.262, 0.238, 1.0),
        # Same forms, sheared and stripped. No emissive at all: a dead city
        # that still glows reads as occupied, which defeats the archetype.
        "batter": 0.075, "chamfer": 2.6, "cornice": 0.85, "slot": 1.45,
        "fin": 0.68, "inset": 0.80,
        "greeble": 0.3, "armour": 0.25, "mast": 0.25, "canopy": 0.0,
        "glazed": 0.30, "emissive": 0.0,
        "ruin": 1.0,
        "bevel": (0.26, 1),
    },
}

# ---------------------------------------------------------------------------
# ARCHETYPES
# ---------------------------------------------------------------------------
# Twelve forms chosen to cover the three settlement scales the brief names:
# an outpost you can garrison, a city block you can repeat, and the colony
# infrastructure that makes either read as inhabited rather than staged.
#
# cells   footprint in GRID_M units (x, y)
# edges   socket type per cell edge; drives what a placer may butt here
# form    massing routine
ARCHETYPES = (
    {"id": "hab_block", "cells": (1, 1), "floors": 4, "form": "slab",
     "class": "outpost", "layout": (0, 0),
     "edges": {"N": "street", "E": "party_wall", "S": "service", "W": "party_wall"}},
    # Four floors, not two: the bridging mass has to clear the road kit's
    # 10 m gate opening before it can carry any accommodation at all.
    {"id": "gatehouse", "cells": (1, 1), "floors": 4, "form": "arch",
     "class": "outpost", "layout": (1, 0),
     "edges": {"N": "open", "E": "party_wall", "S": "open", "W": "party_wall"}},
    {"id": "watchtower", "cells": (1, 1), "floors": 8, "form": "mast",
     "class": "outpost", "layout": (2, 0),
     "edges": {"N": "street", "E": "service", "S": "service", "W": "service"}},
    {"id": "depot_shed", "cells": (2, 1), "floors": 3, "form": "shed",
     "class": "outpost", "layout": (3, 0),
     "edges": {"N": "service", "E": "open", "S": "street", "W": "open"}},

    {"id": "tower_slab", "cells": (1, 1), "floors": 13, "form": "tower",
     "class": "city", "layout": (0, 1),
     "edges": {"N": "street", "E": "party_wall", "S": "party_wall", "W": "party_wall"}},
    {"id": "tower_spire", "cells": (1, 1), "floors": 18, "form": "stepped",
     "class": "city", "layout": (1, 1),
     "edges": {"N": "street", "E": "party_wall", "S": "service", "W": "party_wall"}},
    {"id": "civic_hall", "cells": (2, 2), "floors": 5, "form": "hall",
     "class": "city", "layout": (2, 1),
     "edges": {"N": "street", "E": "street", "S": "service", "W": "party_wall"}},
    {"id": "arcology_stack", "cells": (2, 2), "floors": 15, "form": "mega",
     "class": "city", "layout": (4, 1),
     "edges": {"N": "street", "E": "party_wall", "S": "party_wall", "W": "party_wall"}},

    {"id": "industrial_hall", "cells": (2, 1), "floors": 4, "form": "sawtooth",
     "class": "colony", "layout": (0, 2),
     "edges": {"N": "service", "E": "party_wall", "S": "street", "W": "party_wall"}},
    {"id": "tank_farm", "cells": (1, 1), "floors": 2, "form": "tanks",
     "class": "colony", "layout": (2, 2),
     "edges": {"N": "service", "E": "open", "S": "service", "W": "open"}},
    {"id": "power_relay", "cells": (1, 1), "floors": 3, "form": "relay",
     "class": "colony", "layout": (3, 2),
     "edges": {"N": "service", "E": "service", "S": "street", "W": "service"}},
    {"id": "corner_infill", "cells": (1, 1), "floors": 6, "form": "corner",
     "class": "city", "layout": (4, 2),
     "edges": {"N": "street", "E": "street", "S": "party_wall", "W": "party_wall"}},
)

# Layout pitch in the authoring scene. Wide enough that a 2x2 module and its
# neighbour never overlap in the overview render.
LAYOUT_PITCH_X = 96.0
LAYOUT_PITCH_Y = 116.0
STYLE_LAYOUT_OFFSET = {"colonial": 0.0, "brutalist": 520.0, "ruined": 1040.0}


def default_config():
    repo = Path(__file__).resolve().parents[2]
    output = (
        repo / "modules" / "space_exploration" / "assets" / "source" / "blender"
        / "world-kits" / "mf-modular-building-v1"
    )
    return {
        "blend_path": str(output / "mf-modular-building-v1.blend"),
        "export_dir": str(output / "exports"),
        "evidence_dir": str(output / "evidence"),
        "report_path": str(output / "mf-modular-building-v1-report.json"),
        "styles": list(STYLES),
        "save_blend": True,
        "export_glb": True,
        "render_evidence": True,
        "render_block_proof": True,
        "render_resolution": 768,
        "evidence_views": ["iso_ne", "iso_nw", "top", "entry"],
    }


def merged_config(overrides=None):
    config = default_config()
    if overrides:
        unknown = sorted(set(overrides) - set(config))
        if unknown:
            raise ValueError("unknown building-kit config keys: " + ", ".join(unknown))
        config.update(overrides)
    for key in ("blend_path", "export_dir", "evidence_dir", "report_path"):
        config[key] = os.path.abspath(os.path.expanduser(str(config[key])))
    config["render_resolution"] = max(256, min(2048, int(config["render_resolution"])))
    bad = [s for s in config["styles"] if s not in STYLES]
    if bad:
        raise ValueError("unknown style set: " + ", ".join(bad))
    return config


# ---------------------------------------------------------------------------
# deterministic noise
# ---------------------------------------------------------------------------
class Rng:
    """Keyed value noise, deliberately NOT a stream.

    Each LOD redraws the same module with fewer pieces. A streaming PRNG would
    desync the moment LOD1 skipped a roll: every later value would shift, and
    the roof plant would jump position between LOD steps -- a pop the player
    sees on every camera dolly. Keying each value on an explicit (call-site,
    index) tuple makes every number a pure function of its own identity, so
    LOD1 asking for roof-plant 2's width gets exactly what LOD0 got.

    It is also reproducible run to run, so regenerating the kit does not churn
    the exported GLBs or invalidate the report's triangle deltas.
    """

    def __init__(self, *prefix):
        self.prefix = "|".join(str(part) for part in prefix)

    def value(self, *key):
        text = self.prefix + "|" + "|".join(str(part) for part in key)
        return zlib.crc32(text.encode("utf-8")) / 4294967296.0

    def range(self, low, high, *key):
        return low + (high - low) * self.value(*key)

    def chance(self, probability, *key):
        return self.value(*key) < probability

    def pick(self, items, *key):
        return items[min(len(items) - 1, int(self.value(*key) * len(items)))]


# ---------------------------------------------------------------------------
# scene plumbing
# ---------------------------------------------------------------------------
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
        if material.get("mf_schema") == SCHEMA and material.users == 0:
            bpy.data.materials.remove(material)
    for mesh in list(bpy.data.meshes):
        if mesh.get("mf_schema") == SCHEMA and mesh.users == 0:
            bpy.data.meshes.remove(mesh)


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
    """Shared service palette plus a per-style wall/trim/deck/armour set.

    The RECESS role is the important one and v1 did not have it: window drums,
    vent banks and undercuts are painted near-black so the shell reads as
    carved rather than printed. Keeping glazing and emissive shared across
    styles stops a colonial hab and a brutalist tower arguing over two
    different cyans in the same street.
    """
    materials = {
        "metal": make_material("metal", (0.098, 0.120, 0.142, 1.0), 0.78, 0.28),
        "service": make_material("service", (0.052, 0.066, 0.078, 1.0), 0.60, 0.34),
        # Deep recesses read almost black against pale concrete. That
        # contrast is what CARVES a facade rather than tinting it.
        "recess": make_material("recess", (0.086, 0.090, 0.088, 1.0), 0.22, 0.72),
        "slot": make_material("slot", (0.036, 0.040, 0.044, 1.0), 0.18, 0.76),
        # Accents, used on roughly one panel in ten: rust bleed, ochre
        # hazard stripe, teal weathering. A pale concrete kit without them
        # reads as untextured polystyrene.
        "rust": make_material("rust", (0.402, 0.196, 0.132, 1.0), 0.24, 0.78),
        "ochre": make_material("ochre", (0.548, 0.412, 0.156, 1.0), 0.16, 0.72),
        "verdigris": make_material("verdigris", (0.176, 0.348, 0.336, 1.0), 0.20, 0.70),
        "rubble": make_material("rubble", (0.322, 0.308, 0.282, 1.0), 0.06, 0.88),
        "glazing": make_material("glazing", (0.026, 0.238, 0.312, 0.46), 0.20, 0.14, alpha=0.46),
        "emissive": make_material(
            "emissive", (0.015, 0.45, 0.58, 1.0), 0.08, 0.22,
            emission=((0.01, 0.72, 1.0, 1.0), 5.8),
        ),
        "hazard": make_material(
            "hazard", (0.92, 0.39, 0.025, 1.0), 0.10, 0.42,
            emission=((1.0, 0.17, 0.008, 1.0), 0.34),
        ),
    }
    for style_id, style in STYLES.items():
        wall = style["wall"]
        materials[style_id + "_wall"] = make_material(style_id + "_wall", wall, 0.08, 0.74)
        materials[style_id + "_trim"] = make_material(style_id + "_trim", style["trim"], 0.18, 0.58)
        materials[style_id + "_deck"] = make_material(style_id + "_deck", style["deck"], 0.46, 0.46)
        # Armour plate is deliberately much paler than the wall it sits on.
        # Contrast is what makes applied plating read as a separate object
        # instead of dissolving into the mass behind it.
        armour = tuple(min(1.0, c * 1.10 + 0.11) for c in wall[:3]) + (1.0,)
        materials[style_id + "_armour"] = make_material(style_id + "_armour", armour, 0.30, 0.50)
    return materials


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


def append_prism(vertices, faces, profile, z0, z1):
    """Extrude one XY polygon between two heights."""
    append_taper(vertices, faces, profile, profile, z0, z1)


def append_taper(vertices, faces, lower, upper, z0, z1):
    """Loft between two same-length XY polygons.

    This is the workhorse of the v2 vocabulary: giving the top ring smaller
    extents than the bottom produces the battered fortress slope, and building
    both rings as octagons produces the metre-scale corner chamfers.
    """
    if len(lower) != len(upper) or len(lower) < 3:
        return
    base = len(vertices)
    for x, y in lower:
        vertices.append((x, y, z0))
    for x, y in upper:
        vertices.append((x, y, z1))
    count = len(lower)
    faces.append(tuple(range(base + count - 1, base - 1, -1)))
    faces.append(tuple(range(base + count, base + count * 2)))
    for i in range(count):
        j = (i + 1) % count
        faces.append((base + i, base + j, base + count + j, base + count + i))


def append_cylinder(vertices, faces, center, radius, height, segments=12):
    cx, cy, cz = center
    profile = [
        (cx + math.cos(math.tau * i / segments) * radius,
         cy + math.sin(math.tau * i / segments) * radius)
        for i in range(segments)
    ]
    append_prism(vertices, faces, profile, cz - height * 0.5, cz + height * 0.5)


def octagon(cx, cy, hx, hy, chamfer):
    """Rectangle with its four corners cut. Returns 8 points, or 4 when the
    chamfer is negligible -- the loft only needs both rings to agree in
    length, so callers must use one chamfer policy per mass."""
    c = max(0.0, min(chamfer, min(hx, hy) * 0.55))
    if c <= 0.02:
        c = 0.0
    return [
        (cx - hx + c, cy - hy), (cx + hx - c, cy - hy),
        (cx + hx, cy - hy + c), (cx + hx, cy + hy - c),
        (cx + hx - c, cy + hy), (cx - hx + c, cy + hy),
        (cx - hx, cy + hy - c), (cx - hx, cy - hy + c),
    ]


def boxes_object(collection, name, boxes, material, parent):
    vertices, faces = [], []
    for center, size in boxes:
        append_box(vertices, faces, center, size)
    return mesh_object(collection, name, vertices, faces, material, parent) if boxes else None


def tag_geometry(obj, role, lod):
    if obj is not None:
        obj["mf_role"] = role
        obj["mf_lod"] = lod
    return obj


def bevel_geometry(obj, width, segments):
    """Deterministic source chamfer. v1 used 0.10 m, which on a 32 m facade is
    a quarter of one screen pixel on a phone -- invisible, and paid for. The
    metre-scale chamfers now live in the geometry itself; this is only edge
    softening, so it is wider and cheaper to justify."""
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
    obj.empty_display_size = 1.8
    obj["mf_schema"] = SCHEMA
    return obj


def descendants(root):
    found, stack = [], list(root.children)
    while stack:
        child = stack.pop()
        found.append(child)
        stack.extend(child.children)
    return found


# ---------------------------------------------------------------------------
# geometry buffer
# ---------------------------------------------------------------------------
class GeoBuf:
    """Accumulates geometry into (role, material) buckets so one module emits a
    handful of merged objects rather than hundreds of loose boxes. The bucket
    keys become the report's per-role triangle inventory."""

    def __init__(self):
        self.buckets = {}

    def _bucket(self, role, material):
        key = (role, material)
        if key not in self.buckets:
            self.buckets[key] = ([], [])
        return self.buckets[key]

    def box(self, role, material, center, size):
        if size[0] <= 0.0 or size[1] <= 0.0 or size[2] <= 0.0:
            return
        vertices, faces = self._bucket(role, material)
        append_box(vertices, faces, center, size)

    def mass(self, role, material, lower, upper, z0, z1):
        """A lofted octagonal prism -- the primitive the whole kit is made of."""
        if z1 <= z0 + 1e-4:
            return
        vertices, faces = self._bucket(role, material)
        append_taper(vertices, faces, lower, upper, z0, z1)

    def prism(self, role, material, profile, z0, z1):
        if z1 <= z0 or len(profile) < 3:
            return
        vertices, faces = self._bucket(role, material)
        append_prism(vertices, faces, profile, z0, z1)

    def cyl(self, role, material, center, radius, height, segments=12):
        if radius <= 0.0 or height <= 0.0:
            return
        vertices, faces = self._bucket(role, material)
        append_cylinder(vertices, faces, center, radius, height, segments)


def footprint(spec):
    """Facade envelope half-extents. Note the JOINT_M subtraction: this is the
    party-wall contract, and it is why two neighbouring modules meet in a
    recessed joint instead of two coplanar walls."""
    cells_x, cells_y = spec["cells"]
    return (cells_x * HALF_GRID_M - JOINT_M, cells_y * HALF_GRID_M - JOINT_M)


def mass_top(floors):
    return PLINTH_M + floors * FLOOR_M


def effective_floors(spec, style, rng):
    """A derelict keeps its plan and loses its upper floors. Shearing rather
    than authoring a separate short form is what keeps the ruined set
    footprint-compatible with the other two sets."""
    floors = spec["floors"]
    if style["ruin"] <= 0.0:
        return floors
    return max(1, int(round(floors * rng.range(0.42, 0.74, "shear"))))


def banded_sides(spec):
    """Party walls are blind. That is both architecturally correct -- a wall
    another building butts against carries no glazing -- and the reason a tiled
    row does not show windows staring into its neighbour's brickwork."""
    return [d for d, kind in spec["edges"].items() if kind != "party_wall"]


def clutter_sides(spec):
    """Where bolted-on hardware may hang. NOT the same list as banded_sides:
    an `open` edge is a passage, not a wall. Feeding banded_sides here hung
    ducts and riser pipes straight across the gatehouse's drive-through."""
    return [d for d, kind in spec["edges"].items() if kind in ("service", "street")]


def side_frame(direction, hx, hy):
    """Return ((centre x, centre y), outward normal, half-width along wall)."""
    if direction == "N":
        return (0.0, hy), (0.0, 1.0), hx
    if direction == "S":
        return (0.0, -hy), (0.0, -1.0), hx
    if direction == "E":
        return (hx, 0.0), (1.0, 0.0), hy
    return (-hx, 0.0), (-1.0, 0.0), hy


def taper_at(z, z0, z1, hx, hy, batter):
    """Half-extents at height z for a battered mass. `batter` is the TOTAL
    fraction of half-extent lost between z0 and z1, not a per-metre rate."""
    span = max(0.001, z1 - z0)
    k = 1.0 - batter * max(0.0, min(1.0, (z - z0) / span))
    return hx * k, hy * k


# ---------------------------------------------------------------------------
# shell
# ---------------------------------------------------------------------------
def shell_banded(buf, style, mats, cx, cy, hx, hy, z0, z1, lod, rng, tag,
                 glaze_sides=(), batter=None, chamfer=None, wall_role="spandrel",
                 inset=None):
    """The core of the v2 look.

    v1 drew one box and stuck a thin translucent ribbon on its surface, which
    is why every module photographed flat. Here the wall is an alternating
    stack: a full-width spandrel slab, then a window drum inset by style.slot,
    then the next spandrel. The recess is real geometry, so it self-shadows
    and the building reads as carved rather than printed.

    Returns the list of (z_low, z_high) window bands actually emitted, so
    callers can hang glazing and light strips on exactly those courses.
    """
    batter = style["batter"] if batter is None else batter
    chamfer = style["chamfer"] if chamfer is None else chamfer
    slot = style["slot"]
    wall = mats["wall"]
    # The shaft is recessed from the party plane; the base block and the
    # cornice are what actually touch the neighbour. Interior masses (a twin
    # tower, a tower's upper setback) pass inset=0 -- they are already clear of
    # the boundary and shrinking them again would just make them spindly.
    inset = style["inset"] if inset is None else inset
    hx = max(0.6, hx - inset)
    hy = max(0.6, hy - inset)
    chamfer = max(0.25, chamfer - inset * 0.4)

    def ring(z, inset=0.0):
        ex, ey = taper_at(z, z0, z1, hx, hy, batter)
        return octagon(cx, cy, max(0.5, ex - inset), max(0.5, ey - inset),
                       max(0.25, chamfer - inset * 0.6))

    if lod >= 2:
        # One mass. The cornice and the batter still carry the silhouette.
        buf.mass("shell_mass", wall, ring(z0), ring(z1), z0, z1)
        return []

    courses = []
    floor = 0
    while floor < 90:
        zw = PLINTH_M + floor * FLOOR_M + SILL_M
        if zw + BAND_M > z1 - 0.25:
            break
        if zw >= z0:
            courses.append(zw)
        floor += 1
    if lod == 1:
        courses = courses[::2]

    bands = []
    cursor = z0
    for zw in courses:
        if zw > cursor + 0.05:
            buf.mass(wall_role, wall, ring(cursor), ring(zw), cursor, zw)
        top_w = min(z1, zw + BAND_M)
        buf.mass("window_drum", "recess", ring(zw, slot), ring(top_w, slot), zw, top_w)
        bands.append((zw, top_w))
        cursor = top_w
    if cursor < z1 - 0.02:
        buf.mass(wall_role, wall, ring(cursor), ring(z1), cursor, z1)
    if not bands and not courses:
        buf.mass("shell_mass", wall, ring(z0), ring(z1), z0, z1)

    # Glazing sits inside the groove, not on the surface.
    if lod == 0 and glaze_sides:
        for (zlo, zhi) in bands:
            mid = (zlo + zhi) * 0.5
            ex, ey = taper_at(mid, z0, z1, hx, hy, batter)
            for direction in glaze_sides:
                (ox, oy), (nx, ny), half = side_frame(direction, ex - slot * 0.45, ey - slot * 0.45)
                span = max(1.0, (half - chamfer * 0.9) * 2.0 * style["glazed"])
                buf.box("window_glass", "glazing", (cx + ox, cy + oy, mid),
                        (0.28 if nx else span, 0.28 if ny else span, (zhi - zlo) * 0.72))
                if style["emissive"] > 0.0 and rng.chance(0.34 + 0.4 * style["emissive"],
                                                          tag, "lit", direction, zlo):
                    buf.box("window_emissive", "emissive",
                            (cx + ox, cy + oy, zhi - 0.24),
                            (0.20 if nx else span * 0.86, 0.20 if ny else span * 0.86, 0.22))
    return bands


def add_fins(buf, style, mats, cx, cy, hx, hy, z0, z1, sides, lod, batter=None, inset=None):
    """Vertical mullion fins on the bay pitch. They bridge the window recesses
    and restore verticality -- without them a banded shell reads as a stack of
    pancakes."""
    if lod >= 2 or style["fin"] <= 0.0 or z1 <= z0:
        return
    batter = style["batter"] if batter is None else batter
    inset = style["inset"] if inset is None else inset
    hx = max(0.6, hx - inset)
    hy = max(0.6, hy - inset)
    proj = style["fin"]
    width = 0.7 + style["fin"] * 1.15
    chamfer = style["chamfer"]
    for direction in sides:
        exl, eyl = taper_at(z0, z0, z1, hx, hy, batter)
        (ox, oy), (nx, ny), half = side_frame(direction, exl, eyl)
        usable = half - chamfer * 1.15
        if usable <= BAY_M * 0.4:
            continue
        count = max(1, int((usable * 2.0) // BAY_M))
        for i in range(count + 1):
            t = -usable + (usable * 2.0) * (i / float(count))
            buf.box("fin", mats["trim"],
                    (cx + ox + nx * proj * 0.30 + (0.0 if nx else t),
                     cy + oy + ny * proj * 0.30 + (0.0 if ny else t),
                     (z0 + z1) * 0.5),
                    (proj * 0.9 if nx else width, proj * 0.9 if ny else width, z1 - z0))


ROOF_PARAPET = 2.6


def add_cornice(buf, style, mats, cx, cy, hx, hy, z_top, lod, batter=None, z0=0.0,
                inset=None, parapet=None):
    """Cap a mass by CONTINUING ITS WALL -- never by parking a plate on it.

    The old construction stacked three separate pieces on the shaft: a cornice
    ring wider than everything below it, a floating deck box, and a parapet
    ring above that. Three disconnected parts read as a hat sitting on a
    building, and no amount of retuning their sizes fixed that, because the
    problem was the topology.

    Here the wall simply carries on past roof level. Over a short transition it
    returns from the recessed shaft out to the party plane, runs vertical as
    the parapet, and finishes in a thin coping. The roof slab is then dropped
    INSIDE it (see add_roof_deck). One continuous solid, and neighbours' copings
    meet across the joint to draw a single line along the street.
    """
    inset = style["inset"] if inset is None else inset
    batter = style["batter"] if batter is None else batter
    parapet = ROOF_PARAPET if parapet is None else max(0.8, parapet)
    shaft_hx = max(0.6, hx - inset)
    shaft_hy = max(0.6, hy - inset)
    ex, ey = taper_at(z_top - parapet, z0, max(z_top, z0 + 0.01), shaft_hx, shaft_hy, batter)
    ch_shaft = max(0.25, style["chamfer"] - inset * 0.4)
    ch_face = style["chamfer"]
    trans = min(1.0, parapet * 0.38)

    # wall returns to the plane
    buf.mass("parapet_wall", mats["wall"],
             octagon(cx, cy, ex, ey, ch_shaft),
             octagon(cx, cy, hx, hy, ch_face),
             z_top - parapet, z_top - parapet + trans)
    # vertical parapet
    buf.mass("parapet_wall", mats["wall"],
             octagon(cx, cy, hx, hy, ch_face),
             octagon(cx, cy, hx, hy, ch_face),
             z_top - parapet + trans, z_top - 0.5)
    # coping: a thin band, flush at the plane, never proud of it
    buf.mass("coping", mats["trim"],
             octagon(cx, cy, hx * 0.992, hy * 0.992, ch_face),
             octagon(cx, cy, hx, hy, ch_face), z_top - 0.5, z_top)
    if lod < 2:
        # shadow reveal where the shaft meets the returning wall
        buf.mass("cornice_reveal", "slot",
                 octagon(cx, cy, ex * 0.99, ey * 0.99, max(0.2, ch_shaft * 0.9)),
                 octagon(cx, cy, ex * 0.99, ey * 0.99, max(0.2, ch_shaft * 0.9)),
                 z_top - parapet - 0.45, z_top - parapet)
    return z_top


def add_base_flare(buf, style, mats, cx, cy, hx, hy, lod, z_from=0.0, inset=None):
    """The full-width base block: a battered plinth that sits ON the party
    plane at grade and tapers back to the recessed shaft. Gives every module a
    planted base, and -- with the cornice -- is one of the two courses where
    neighbours actually touch.

    Kept at every LOD. It costs 28 triangles and it is load-bearing for the
    tiling contract, so it is not a detail to drop at distance.
    """
    inset = style["inset"] if inset is None else inset
    height = FLOOR_M * 1.15
    chamfer = style["chamfer"]
    lower = octagon(cx, cy, hx, hy, chamfer)
    upper = octagon(cx, cy, max(0.6, hx - inset), max(0.6, hy - inset),
                    max(0.25, chamfer - inset * 0.4))
    buf.mass("base_block", mats["wall"], lower, upper, z_from, z_from + height)


# ---------------------------------------------------------------------------
# greebles
# ---------------------------------------------------------------------------
def add_armour(buf, style, mats, cx, cy, hx, hy, z0, z1, sides, lod, rng, tag, inset=None):
    """Applied plating in the pale armour material. Contrast against the wall
    is the whole point -- it is what stops the facade reading as one flat
    field of grey."""
    if lod > 0 or style["armour"] <= 0.0 or not sides:
        return
    inset = style["inset"] if inset is None else inset
    hx = max(0.6, hx - inset)
    hy = max(0.6, hy - inset)
    chamfer = style["chamfer"]
    for direction in sides:
        (ox, oy), (nx, ny), half = side_frame(direction, hx, hy)
        usable = half - chamfer * 1.2
        if usable <= 1.0:
            continue
        count = max(1, int((usable * 2.0) // BAY_M))
        for i in range(count):
            if not rng.chance(0.34 + 0.5 * style["armour"], tag, "arm", direction, i):
                continue
            t = -usable + (usable * 2.0 / count) * (i + 0.5)
            h = rng.range(FLOOR_M * 0.9, FLOOR_M * 2.4, tag, "armh", direction, i)
            z = rng.range(z0 + FLOOR_M * 0.4, max(z0 + FLOOR_M * 0.6, z1 - h), tag, "armz", direction, i)
            w = BAY_M * rng.range(0.52, 0.86, tag, "armw", direction, i)
            buf.box("armour_plate", mats["armour"],
                    (cx + ox + nx * 0.30 + (0.0 if nx else t),
                     cy + oy + ny * 0.30 + (0.0 if ny else t), z + h * 0.5),
                    (0.62 if nx else w, 0.62 if ny else w, h))


def add_greebles(buf, style, mats, cx, cy, hx, hy, z_top, sides, lod, rng, tag, inset=None):
    """Riser stacks, vent banks, dish arrays and hab pods on the bay pitch."""
    if lod > 0 or style["greeble"] <= 0.0 or not sides:
        return
    inset = style["inset"] if inset is None else inset
    hx = max(0.6, hx - inset)
    hy = max(0.6, hy - inset)
    chamfer = style["chamfer"]
    for direction in sides:
        (ox, oy), (nx, ny), half = side_frame(direction, hx, hy)
        usable = max(1.0, half - chamfer * 1.2)
        # riser stack -- a bundle of pipes climbing the facade
        if rng.chance(0.55 * style["greeble"] + 0.2, tag, "riser", direction):
            t = rng.range(-usable * 0.8, usable * 0.8, tag, "risert", direction)
            top = rng.range(z_top * 0.62, z_top * 0.96, tag, "riserh", direction)
            for k in range(3):
                r = 0.30 + 0.10 * k
                # Both t and off run ALONG the wall -- three parallel pipes side
                # by side. Adding t to the perpendicular axis instead threw
                # risers up to 24 m clear of the facade and into the
                # neighbouring cell, which the tiling contract cannot survive.
                along = t + (k - 1) * 0.85
                buf.cyl("riser_stack", "metal",
                        (cx + ox + nx * 0.55 + (0.0 if nx else along),
                         cy + oy + ny * 0.55 + (0.0 if ny else along),
                         (PLINTH_M + top) * 0.5),
                        r, max(1.0, top - PLINTH_M), 6)
        # vent bank -- dark louvred recess
        if rng.chance(0.5 * style["greeble"] + 0.15, tag, "vent", direction):
            t = rng.range(-usable * 0.7, usable * 0.7, tag, "ventt", direction)
            z = rng.range(PLINTH_M + FLOOR_M, max(PLINTH_M + FLOOR_M * 1.2, z_top * 0.5),
                          tag, "ventz", direction)
            w = BAY_M * rng.range(0.5, 0.8, tag, "ventw", direction)
            buf.box("vent_bank", "recess",
                    (cx + ox + nx * 0.18 + (0.0 if nx else t),
                     cy + oy + ny * 0.18 + (0.0 if ny else t), z),
                    (0.5 if nx else w, 0.5 if ny else w, FLOOR_M * 0.72))
            for k in range(3):
                buf.box("vent_bank", mats["trim"],
                        (cx + ox + nx * 0.34 + (0.0 if nx else t),
                         cy + oy + ny * 0.34 + (0.0 if ny else t),
                         z - FLOOR_M * 0.22 + k * FLOOR_M * 0.22),
                        (0.34 if nx else w * 0.94, 0.34 if ny else w * 0.94, 0.16))
        # hab pod -- a chamfered module cantilevered off the wall
        if rng.chance(0.34 * style["greeble"], tag, "pod", direction):
            t = rng.range(-usable * 0.6, usable * 0.6, tag, "podt", direction)
            z = rng.range(PLINTH_M + FLOOR_M * 1.5, max(PLINTH_M + FLOOR_M * 2.0, z_top * 0.72),
                          tag, "podz", direction)
            d = rng.range(2.2, 3.4, tag, "podd", direction)
            w = rng.range(4.0, 6.4, tag, "podw", direction)
            px = cx + ox + nx * d * 0.5 + (0.0 if nx else t)
            py = cy + oy + ny * d * 0.5 + (0.0 if ny else t)
            lower = octagon(px, py, (d if nx else w) * 0.5, (d if ny else w) * 0.5, 0.75)
            upper = octagon(px, py, (d if nx else w) * 0.42, (d if ny else w) * 0.42, 0.75)
            buf.mass("hab_pod", mats["armour"], lower, upper, z, z + FLOOR_M * 0.92)
            if style["emissive"] > 0.0:
                # Its own role, not window_emissive: it rides the pod, so it
                # inherits the pod's licence to overhang a street or service
                # edge rather than being audited as a facade element.
                buf.box("pod_light", "emissive",
                        (px + nx * d * 0.42, py + ny * d * 0.42, z + FLOOR_M * 0.5),
                        (0.18 if nx else w * 0.5, 0.18 if ny else w * 0.5, 0.8))


def add_service_clutter(buf, style, sides, hx, hy, z_top, lod, rng):
    """Kept for the shared dressing pass in create_module. The heavy lifting
    now happens in add_greebles; this is the small stuff."""
    if lod > 0 or style["greeble"] <= 0.0 or not sides:
        return
    count = int(round(rng.range(2.0, 5.0, "cluttercount") * style["greeble"]))
    for i in range(count):
        direction = rng.pick(sides, "clutter", i, "side")
        (ox, oy), (nx, ny), half = side_frame(direction, hx, hy)
        t = rng.range(-half * 0.72, half * 0.72, "clutter", i, "t")
        z = rng.range(PLINTH_M + 1.2, max(PLINTH_M + 2.0, z_top - 2.0), "clutter", i, "z")
        h = rng.range(1.4, 3.4, "clutter", i, "h")
        d = rng.range(0.7, 1.4, "clutter", i, "d")
        w = rng.range(1.2, 2.6, "clutter", i, "w")
        buf.box("service_clutter", "service",
                (ox + nx * d * 0.5 + (0.0 if nx else t),
                 oy + ny * d * 0.5 + (0.0 if ny else t), z + h * 0.5),
                (d if nx else w, d if ny else w, h))


# ---------------------------------------------------------------------------
# shared dressing
# ---------------------------------------------------------------------------
def add_plinth(buf, mat, hx, hy):
    """Shared ground datum. Continuous across neighbours because every module
    uses the same PLINTH_M, which ties a tiled row to one street line."""
    # Exactly the envelope. The old +0.36 oversail put 0.18 m of plinth
    # into the neighbouring cell on every single module in the pack.
    buf.box("plinth", mat, (0.0, 0.0, PLINTH_M * 0.5), (hx * 2.0, hy * 2.0, PLINTH_M))


def add_parapet(buf, style, mat, hx, hy, z_top, lod, rng, broken=False):
    """Intentionally almost empty.

    The upstand used to be a separate ring of boxes sitting on top of the
    cornice -- one of the three disconnected pieces that made the roof read as
    a lid. The wall now continues past roof level and forms the parapet itself
    (add_cornice), so all that is left here is damage: a derelict drops chunks
    off its coping to break the skyline.
    """
    if not broken or lod >= 2:
        return
    ex, ey = max(0.6, hx - 0.35), max(0.6, hy - 0.35)
    for direction in ("N", "S", "E", "W"):
        (ox, oy), (nx, ny), half = side_frame(direction, ex, ey)
        usable = half - style["chamfer"] * 0.9
        if usable <= 0.6:
            continue
        segments = max(1, int((usable * 2.0) // BAY_M))
        span = (usable * 2.0) / segments
        for i in range(segments):
            if not rng.chance(0.42, "breach", direction, i):
                continue
            t = -usable + span * (i + 0.5)
            drop = rng.range(0.5, 1.5, "breachd", direction, i)
            buf.box("coping_breach", "rubble",
                    (ox + (0.0 if nx else t), oy + (0.0 if ny else t), z_top + drop * 0.4),
                    (0.6 if nx else span * 0.7, 0.6 if ny else span * 0.7, drop))


def add_roof_deck(buf, mat, hx, hy, z_top, style=None):
    """The roof surface, recessed INSIDE the parapet the wall now forms.

    Sits ROOF_PARAPET below the coping head and stops short of the wall face,
    so you look down into a tray rather than at a slab laid on top.
    """
    inset = 0.9 if style is None else max(0.6, style["inset"])
    ex = max(0.8, hx - inset - 1.0)
    ey = max(0.8, hy - inset - 1.0)
    buf.box("roof_deck", mat, (0.0, 0.0, z_top - ROOF_PARAPET), (ex * 2.0, ey * 2.0, 0.6))


def add_roof_plant(buf, style, hx, hy, z_top, lod, rng):
    """Rooftop machinery -- the cheapest silhouette variety in the pack. Two
    towers of identical massing stop reading as clones the moment their roof
    plant differs. LOD1 keeps the largest units and drops the rest."""
    if lod >= 2:
        return
    ex, ey = max(0.6, hx - style["inset"] - 1.6), max(0.6, hy - style["inset"] - 1.6)
    z_top = z_top - ROOF_PARAPET + 0.3
    # Clutter density scales with ROOF AREA. A fixed count gave a 64 m civic
    # hall the same four boxes as a 32 m hab, so every large roof read as an
    # empty tray -- the single thing the references never have.
    area = (ex * 2.0) * (ey * 2.0)
    base = 3.0 + area / 190.0
    count = int(round(rng.range(base * 0.85, base * 1.30, "plantcount")
                      * (0.55 + style["greeble"] * 0.45)))
    count = max(3, min(count, 28))
    grow = 1.0 + min(0.9, area / 5200.0)
    keep = count if lod == 0 else max(2, count // 3)
    for i in range(keep):
        w = rng.range(2.8, 6.6, "plant", i, "w") * grow
        d = rng.range(2.8, 6.2, "plant", i, "d") * grow
        h = rng.range(1.6, 4.2, "plant", i, "h")
        cx = rng.range(-ex + w * 0.6 + 1.2, ex - w * 0.6 - 1.2, "plant", i, "x")
        cy = rng.range(-ey + d * 0.6 + 1.2, ey - d * 0.6 - 1.2, "plant", i, "y")
        buf.mass("roof_plant", "metal",
                 octagon(cx, cy, w * 0.5, d * 0.5, 0.6),
                 octagon(cx, cy, w * 0.44, d * 0.44, 0.6), z_top, z_top + h)
        # Every third unit is a finned bank, not a coin flip: the references'
        # roofs are defined by rows of radiator fins, and leaving them to
        # chance meant half the modules shipped without any.
        if lod == 0 and i % 3 == 0:
            add_louvre_bank(buf, cx, cy, w * 0.88, d * 0.88, z_top + h, lod)
        elif lod == 0 and rng.chance(0.5, "plant", i, "cap"):
            buf.cyl("roof_plant", "service", (cx, cy, z_top + h + 0.8),
                    rng.range(0.6, 1.2, "plant", i, "r"), 1.6, 8)
        elif lod == 0:
            buf.box("roof_duct", "metal", (cx, cy, z_top + h + 0.55),
                    (w * 0.30, d * 1.25, 1.1))


def add_mast(buf, style, hx, hy, z_top, lod, rng):
    if lod >= 2 or style["mast"] <= 0.0:
        return
    if not rng.chance(0.55 + 0.45 * style["mast"], "mast", "present"):
        return
    height = rng.range(6.0, 14.0, "mast", "h") * (0.5 + style["mast"] * 0.5)
    ex, ey = max(0.6, hx - style["inset"]), max(0.6, hy - style["inset"])
    cx = rng.range(-ex * 0.5, ex * 0.5, "mast", "x")
    cy = rng.range(-ey * 0.5, ey * 0.5, "mast", "y")
    buf.cyl("mast_antenna", "metal", (cx, cy, z_top + height * 0.5), 0.36, height, 6)
    if lod == 0:
        for i in range(3):
            buf.box("mast_antenna", "metal", (cx, cy, z_top + height * (0.45 + 0.18 * i)),
                    (2.8 - i * 0.6, 0.24, 0.24))
        if style["emissive"] > 0.0:
            buf.cyl("mast_antenna", "hazard", (cx, cy, z_top + height + 0.45), 0.44, 0.9, 6)
        # dish array beside the mast
        if rng.chance(0.5, "mast", "dish"):
            dx = cx + rng.range(-3.0, 3.0, "mast", "dx")
            dy = cy + rng.range(-3.0, 3.0, "mast", "dy")
            buf.cyl("dish_array", "metal", (dx, dy, z_top + 1.1), 0.3, 2.2, 6)
            buf.cyl("dish_array", mats_trim_fallback(), (dx, dy, z_top + 2.4), 1.9, 0.4, 10)


def mats_trim_fallback():
    return "metal"


def add_entrance(buf, spec, style, mat, hx, hy, lod):
    """Ground-floor portal on the street edge with a cantilevered canopy. Gives
    every module a legible front, which is what stops a tiled block from
    reading as a warehouse estate."""
    if lod >= 2:
        return
    streets = [d for d, kind in spec["edges"].items() if kind == "street"]
    for direction in sorted(streets)[:2]:
        (ox, oy), (nx, ny), half = side_frame(direction, hx, hy)
        width = min(half * 1.1, 10.0)
        buf.box("entrance_portal", "recess", (ox - nx * 0.85, oy - ny * 0.85, PLINTH_M + 2.1),
                (1.3 if nx else width, 1.3 if ny else width, 4.2))
        if style["canopy"] > 0.0 and lod == 0:
            depth = 2.6 * style["canopy"]
            buf.box("entrance_canopy", mat,
                    (ox + nx * depth * 0.5, oy + ny * depth * 0.5, PLINTH_M + 4.5),
                    (depth if nx else width + 2.6, depth if ny else width + 2.6, 0.55))
        if style["emissive"] > 0.0 and lod == 0:
            buf.box("window_emissive", "emissive", (ox - nx * 0.12, oy - ny * 0.12, PLINTH_M + 4.15),
                    (0.20 if nx else width * 0.9, 0.20 if ny else width * 0.9, 0.24))


def add_ruin_damage(buf, style, hx, hy, z_top, lod, rng):
    """Collapse language: exposed floor slabs where the shell sheared away, and
    a rubble skirt at the base. Without the skirt a sheared tower reads as an
    unfinished building rather than a destroyed one."""
    if style["ruin"] <= 0.0 or lod >= 2:
        return
    for i in range(2 if lod == 0 else 1):
        z = z_top - FLOOR_M * (i + 0.5)
        if z < PLINTH_M + FLOOR_M:
            break
        buf.box("exposed_slab", "rubble",
                (rng.range(-hx * 0.2, hx * 0.2, "slab", i, "x"),
                 rng.range(-hy * 0.2, hy * 0.2, "slab", i, "y"), z),
                (hx * rng.range(1.1, 1.8, "slab", i, "w"),
                 hy * rng.range(1.1, 1.8, "slab", i, "d"), 0.4))
    limit_x, limit_y = hx + JOINT_M, hy + JOINT_M
    for i in range(4 if lod == 0 else 2):
        w = rng.range(2.5, 7.0, "rub", i, "w")
        d = rng.range(2.5, 6.0, "rub", i, "d")
        h = rng.range(0.6, 2.2, "rub", i, "h")
        angle = rng.range(0.0, math.tau, "rub", i, "a")
        radius = rng.range(0.74, 1.14, "rub", i, "r")
        cx = max(-limit_x + w * 0.5, min(limit_x - w * 0.5, math.cos(angle) * hx * radius))
        cy = max(-limit_y + d * 0.5, min(limit_y - d * 0.5, math.sin(angle) * hy * radius))
        buf.mass("rubble_debris", "rubble",
                 octagon(cx, cy, w * 0.5, d * 0.5, 0.8),
                 octagon(cx, cy, w * 0.3, d * 0.3, 0.6), 0.0, h)


# ---------------------------------------------------------------------------
# panel greebling
# ---------------------------------------------------------------------------
PANEL_ACCENTS = ("rust", "ochre", "verdigris")


def add_panel_lines(buf, style, mats, cx, cy, hx, hy, z0, z1, sides, lod, rng, tag,
                    inset=None, density=0.36, cell=5.4, chamfer=None):
    """Shallow inset and raised panel details scattered on a facade grid.

    This is the single biggest thing separating a greyboxed mass from the
    reference art. Every large surface in that language carries recessed
    rectangles, raised plates, slot vents and the occasional accent panel at
    roughly a 4-6 m pitch. They are only ~0.35 m deep, so they cost nothing in
    silhouette and everything in read: they are what stops a 30 m wall of pale
    concrete reading as polystyrene.

    LOD0 only -- at LOD1 the pitch is under a pixel on a phone.
    """
    if lod > 0 or z1 <= z0 or not sides:
        return
    inset = style["inset"] if inset is None else inset
    hx = max(0.6, hx - inset)
    hy = max(0.6, hy - inset)
    # Callers may override. The superstructure tier scales chamfers up by 2x
    # for its masses, and reserving 1.15x THAT at each end of a wall left only
    # a third of the surface panelled -- which is why the walls read bare
    # against the references.
    chamfer = style["chamfer"] if chamfer is None else chamfer
    depth = 0.36
    for direction in sides:
        (ox, oy), (nx, ny), half = side_frame(direction, hx, hy)
        usable = half - chamfer * 1.15
        if usable <= cell * 0.6:
            continue
        cols = max(1, int((usable * 2.0) // cell))
        rows = max(1, int((z1 - z0) // cell))
        col_w = (usable * 2.0) / cols
        row_h = (z1 - z0) / rows
        for r in range(rows):
            for c in range(cols):
                if not rng.chance(density, tag, direction, r, c):
                    continue
                t = -usable + col_w * (c + 0.5)
                z = z0 + row_h * (r + 0.5)
                w = col_w * rng.range(0.40, 0.86, tag, "w", direction, r, c)
                h = row_h * rng.range(0.28, 0.76, tag, "h", direction, r, c)
                kind = rng.value(tag, "k", direction, r, c)
                if rng.chance(0.09, tag, "acc", direction, r, c):
                    material, push = rng.pick(PANEL_ACCENTS, tag, "am", direction, r, c), 0.20
                elif kind < 0.46:
                    material, push = "recess", -depth * 0.5      # sunk panel
                elif kind < 0.74:
                    material, push = mats["armour"], 0.22        # raised plate
                else:
                    material, push = "slot", -depth * 0.42       # slot vent
                    h = min(h, 1.0)
                buf.box("panel_detail", material,
                        (ox + nx * push + (0.0 if nx else t),
                         oy + ny * push + (0.0 if ny else t), z),
                        (depth if nx else w, depth if ny else w, h))


def add_louvre_bank(buf, cx, cy, w, d, z, lod, fins=7):
    """A finned radiator / louvre bank. The reference roofs are covered in
    these; a roof of plain boxes is the clearest giveaway that a kit was
    greyboxed and never dressed. Deliberately style-agnostic so it can be
    dropped anywhere without threading a material dict through."""
    if lod > 0 or w <= 1.2 or d <= 1.2:
        return
    buf.box("louvre_bank", "metal", (cx, cy, z + 0.35), (w, d, 0.7))
    pitch = d / float(fins)
    for i in range(fins):
        buf.box("louvre_fin", "slot", (cx, cy - d * 0.5 + pitch * (i + 0.5), z + 1.5),
                (w * 0.94, pitch * 0.44, 1.7))
    buf.box("louvre_bank", "service", (cx, cy, z + 2.45), (w * 1.02, d * 1.02, 0.30))


# ---------------------------------------------------------------------------
# massing forms
#   Each returns the module's top height, which the caller uses to place the
#   parapet, roof plant and the SOCKET_ROOF empty.
# ---------------------------------------------------------------------------
def _dress(buf, spec, style, mats, hx, hy, z0, top, lod, rng, tag, sides=None):
    """Fins, armour and greebles, applied to the same side list every time."""
    sides = banded_sides(spec) if sides is None else sides
    add_fins(buf, style, mats, 0.0, 0.0, hx, hy, z0, top, sides, lod)
    add_panel_lines(buf, style, mats, 0.0, 0.0, hx, hy, z0, top, sides, lod, rng, tag)
    add_armour(buf, style, mats, 0.0, 0.0, hx, hy, z0, top, sides, lod, rng, tag)
    add_greebles(buf, style, mats, 0.0, 0.0, hx, hy, top, clutter_sides(spec), lod, rng, tag)


def form_slab(buf, spec, style, mats, lod, rng, floors):
    hx, hy = footprint(spec)
    top = mass_top(floors)
    add_base_flare(buf, style, mats, 0.0, 0.0, hx, hy, lod)
    shell_banded(buf, style, mats, 0.0, 0.0, hx, hy, 0.0, top, lod, rng, "slab",
                 glaze_sides=banded_sides(spec))
    _dress(buf, spec, style, mats, hx, hy, PLINTH_M, top, lod, rng, "slab")
    add_cornice(buf, style, mats, 0.0, 0.0, hx, hy, top, lod)
    if lod < 2:
        ex, ey = taper_at(top, 0.0, top, hx, hy, style["batter"])
        s = rng.range(0.44, 0.62, "penthouse")
        px = rng.range(-ex * 0.22, ex * 0.22, "pentx")
        py = rng.range(-ey * 0.22, ey * 0.22, "penty")
        buf.mass("roof_plant", mats["deck"],
                 octagon(px, py, ex * s, ey * s, style["chamfer"] * 0.7),
                 octagon(px, py, ex * s * 0.92, ey * s * 0.92, style["chamfer"] * 0.7),
                 top, top + FLOOR_M)
    return top


def form_arch(buf, spec, style, mats, lod, rng, floors):
    """Gatehouse. The opening is authored to the road kit's own gate clearance
    -- 20 m wide, 10 m high -- so a primary road runs straight through it with
    no bespoke adapter piece."""
    hx, hy = footprint(spec)
    clear_half, clear_height = 10.0, 10.0
    top = max(mass_top(floors), clear_height + FLOOR_M * 1.6)
    pier = hx - clear_half
    chamfer = min(style["chamfer"], pier * 0.45)
    for sx in (-1.0, 1.0):
        px = sx * (clear_half + pier * 0.5)
        # The gatehouse's E and W edges are party walls, and its piers ARE
        # those edges. So the piers stay dead vertical at full width: battering
        # them (or flaring their base) is what opened a wedge against the
        # neighbour. The brutish read comes from the base block, the cornice
        # and the armoured jambs instead.
        ring = octagon(px, 0.0, pier * 0.5, hy, chamfer)
        buf.mass("shell_mass", mats["wall"], ring, ring, 0.0, top)
    # bridging mass over the opening
    buf.mass("shell_mass", mats["wall"],
             octagon(0.0, 0.0, clear_half + pier * 0.4, hy * 0.99, style["chamfer"]),
             octagon(0.0, 0.0, clear_half + pier * 0.2, hy * 0.94, style["chamfer"]),
             clear_height, top)
    if lod < 2:
        buf.box("gate_lintel", mats["trim"], (0.0, 0.0, clear_height + 0.7),
                (clear_half * 2.0 + 2.4, hy * 2.0, 1.4))
        for sx in (-1.0, 1.0):
            buf.box("gate_lintel", mats["armour"], (sx * clear_half, 0.0, clear_height * 0.5),
                    (1.3, hy * 2.0, clear_height))
        buf.box("window_drum", "recess", (0.0, 0.0, clear_height * 0.5 + 0.2),
                (clear_half * 1.98, hy * 1.6, clear_height * 0.94))
        if style["emissive"] > 0.0:
            for sx in (-1.0, 1.0):
                buf.box("window_emissive", "emissive",
                        (sx * (clear_half - 0.9), 0.0, clear_height - 0.8), (0.26, hy * 1.7, 0.3))
    sides = [d for d in banded_sides(spec) if d in ("E", "W")]
    add_fins(buf, style, mats, 0.0, 0.0, hx, hy, clear_height, top, sides, lod)
    add_armour(buf, style, mats, 0.0, 0.0, hx, hy, clear_height, top, sides, lod, rng, "arch")
    add_cornice(buf, style, mats, 0.0, 0.0, hx, hy, top, lod)
    return top


def form_mast(buf, spec, style, mats, lod, rng, floors):
    """Watchtower: battered shaft, cantilevered head. The one silhouette in the
    pack that has to be identifiable from across the map."""
    hx, hy = footprint(spec)
    top = mass_top(floors)
    base_h = PLINTH_M + FLOOR_M * 1.2
    add_base_flare(buf, style, mats, 0.0, 0.0, hx * 0.62, hy * 0.62, lod)
    buf.mass("shell_mass", mats["wall"],
             octagon(0.0, 0.0, hx * 0.66, hy * 0.66, style["chamfer"] * 1.2),
             octagon(0.0, 0.0, hx * 0.54, hy * 0.54, style["chamfer"]), 0.0, base_h)
    shaft = min(hx, hy) * 0.34
    shell_banded(buf, style, mats, 0.0, 0.0, shaft, shaft, base_h, top, lod, rng, "mastshaft",
                 glaze_sides=(), batter=style["batter"] * 1.6, chamfer=style["chamfer"] * 0.55,
                 inset=0.0)
    add_fins(buf, style, mats, 0.0, 0.0, shaft, shaft, base_h, top, ["N", "E", "S", "W"], lod,
             batter=style["batter"] * 1.6, inset=0.0)
    head_h = FLOOR_M * 1.7
    head = shaft * 2.5
    buf.mass("shell_mass", mats["armour"],
             octagon(0.0, 0.0, head * 0.86, head * 0.86, style["chamfer"] * 1.1),
             octagon(0.0, 0.0, head, head, style["chamfer"] * 1.4), top, top + head_h)
    if lod < 2:
        for direction in ("N", "E", "S", "W"):
            (ox, oy), (nx, ny), _ = side_frame(direction, head * 0.97, head * 0.97)
            buf.box("window_glass", "glazing", (ox, oy, top + head_h * 0.58),
                    (0.34 if nx else head * 1.5, 0.34 if ny else head * 1.5, head_h * 0.52))
        # Clamped to the cell. Sized purely off the head, this cap reached
        # 16.8 m on a 16 m half-cell and punched into all four neighbours.
        cap_hi = min(head * 1.24, hx)
        cap_lo = min(head * 1.02, hx - 0.45)
        buf.mass("cornice", mats["trim"],
                 octagon(0.0, 0.0, cap_lo, cap_lo, style["chamfer"] * 1.4),
                 octagon(0.0, 0.0, cap_hi, cap_hi, style["chamfer"] * 1.6),
                 top + head_h, top + head_h + 0.9)
        if style["emissive"] > 0.0:
            buf.box("window_emissive", "emissive", (0.0, 0.0, top + head_h + 0.2),
                    (head * 1.9, head * 1.9, 0.26))
    return top + head_h + 0.9


def form_shed(buf, spec, style, mats, lod, rng, floors):
    """Depot shed. E/W ends are socket type `open`, meaning a placer may butt
    another shed there. The end wall is still authored -- an open-ended shed
    standing alone would show its own interior."""
    hx, hy = footprint(spec)
    top = mass_top(floors)
    add_base_flare(buf, style, mats, 0.0, 0.0, hx, hy, lod)
    shell_banded(buf, style, mats, 0.0, 0.0, hx, hy, 0.0, top, lod, rng, "shed",
                 glaze_sides=[d for d in banded_sides(spec) if d in ("N", "S")])
    _dress(buf, spec, style, mats, hx, hy, PLINTH_M, top, lod, rng, "shed",
           sides=[d for d in banded_sides(spec) if d in ("N", "S")])
    ex, ey = taper_at(top, 0.0, top, hx, hy, style["batter"])
    # Barrel-vault roof approximated by three stepped lofts.
    ridge = top + FLOOR_M * 1.25
    steps = 1 if lod >= 2 else 3
    for i in range(steps):
        f0, f1 = i / float(steps), (i + 1) / float(steps)
        buf.mass("roof_deck", mats["deck"],
                 octagon(0.0, 0.0, ex * (1.0 - f0 * 0.30), ey * (1.0 - f0 * 0.62), style["chamfer"]),
                 octagon(0.0, 0.0, ex * (1.0 - f1 * 0.30), ey * (1.0 - f1 * 0.62), style["chamfer"]),
                 top + (ridge - top) * f0, top + (ridge - top) * f1)
    if lod < 2:
        (ox, oy), (nx, ny), half = side_frame("S", ex, ey)
        doors = max(1, int((half - style["chamfer"]) * 2.0 // BAY_M))
        for i in range(doors):
            t = -half + (half * 2.0 / doors) * (i + 0.5)
            buf.box("cargo_door", "recess", (t, oy + 0.3, PLINTH_M + 2.9),
                    (BAY_M * 0.64, 1.2, 5.4))
            buf.box("cargo_door", mats["armour"], (t, oy + 0.55, PLINTH_M + 5.8),
                    (BAY_M * 0.72, 0.9, 0.7))
    return ridge


def form_tower(buf, spec, style, mats, lod, rng, floors):
    hx, hy = footprint(spec)
    top = mass_top(floors)
    break_z = PLINTH_M + FLOOR_M * max(2, int(floors * 0.64))
    add_base_flare(buf, style, mats, 0.0, 0.0, hx, hy, lod)
    sides = banded_sides(spec)
    shell_banded(buf, style, mats, 0.0, 0.0, hx, hy, 0.0, break_z, lod, rng, "lower",
                 glaze_sides=sides)
    add_cornice(buf, style, mats, 0.0, 0.0, hx, hy, break_z, lod, parapet=1.3)
    exb, eyb = taper_at(break_z, 0.0, break_z, hx, hy, style["batter"])
    setback = 0.84
    shell_banded(buf, style, mats, 0.0, 0.0, exb * setback, eyb * setback, break_z, top, lod, rng,
                 "upper", glaze_sides=sides, inset=0.0)
    _dress(buf, spec, style, mats, hx, hy, PLINTH_M, break_z, lod, rng, "tower")
    add_fins(buf, style, mats, 0.0, 0.0, exb * setback, eyb * setback, break_z, top, sides, lod,
             inset=0.0)
    add_cornice(buf, style, mats, 0.0, 0.0, exb * setback, eyb * setback, top, lod, z0=break_z,
                inset=0.0)
    return top, exb * setback, eyb * setback


def form_stepped(buf, spec, style, mats, lod, rng, floors):
    hx, hy = footprint(spec)
    steps = 3
    per = max(1, floors // steps)
    z = 0.0
    sx, sy = hx, hy
    top_hx, top_hy = hx, hy
    sides = banded_sides(spec)
    add_base_flare(buf, style, mats, 0.0, 0.0, hx, hy, lod)
    for i in range(steps):
        step_top = mass_top(floors) if i == steps - 1 else PLINTH_M + FLOOR_M * per * (i + 1)
        if step_top <= z:
            continue
        shell_banded(buf, style, mats, 0.0, 0.0, sx, sy, z, step_top, lod, rng, "step%d" % i,
                     glaze_sides=sides)
        add_fins(buf, style, mats, 0.0, 0.0, sx, sy, max(z, PLINTH_M), step_top, sides, lod)
        if i == 0:
            add_armour(buf, style, mats, 0.0, 0.0, sx, sy, PLINTH_M, step_top, sides, lod, rng, "spire")
            add_greebles(buf, style, mats, 0.0, 0.0, sx, sy, step_top, clutter_sides(spec),
                         lod, rng, "spire")
        add_cornice(buf, style, mats, 0.0, 0.0, sx, sy, step_top, lod, z0=z,
                    parapet=None if i == steps - 1 else 1.3)
        ex, ey = taper_at(step_top, z, step_top, sx, sy, style["batter"])
        # extents of the surface actually at the top of this step
        top_hx, top_hy = ex, ey
        z, sx, sy = step_top, ex * 0.72, ey * 0.72
    if lod < 2:
        buf.cyl("mast_antenna", mats["trim"], (0.0, 0.0, z + FLOOR_M * 1.1), sx * 0.55,
                FLOOR_M * 2.2, 8)
        buf.cyl("mast_antenna", "hazard", (0.0, 0.0, z + FLOOR_M * 2.3), 0.5, 1.0, 6)
    return z, top_hx, top_hy


def form_hall(buf, spec, style, mats, lod, rng, floors):
    """Civic hall: a wide battered mass, a raised centre block and a colonnade
    on the street edge -- the only module in the pack with a public front."""
    hx, hy = footprint(spec)
    top = mass_top(floors)
    sides = banded_sides(spec)
    add_base_flare(buf, style, mats, 0.0, 0.0, hx, hy, lod)
    shell_banded(buf, style, mats, 0.0, 0.0, hx, hy, 0.0, top, lod, rng, "hall",
                 glaze_sides=sides)
    _dress(buf, spec, style, mats, hx, hy, PLINTH_M, top, lod, rng, "hall")
    add_cornice(buf, style, mats, 0.0, 0.0, hx, hy, top, lod, parapet=1.3)
    ex, ey = taper_at(top, 0.0, top, hx, hy, style["batter"])
    centre = top + FLOOR_M * 3.0
    buf.mass("shell_mass", mats["deck"],
             octagon(0.0, 0.0, ex * 0.54, ey * 0.54, style["chamfer"] * 1.3),
             octagon(0.0, 0.0, ex * 0.48, ey * 0.48, style["chamfer"] * 1.3), top, centre)
    if lod < 2:
        buf.mass("cornice", mats["trim"],
                 octagon(0.0, 0.0, ex * 0.56, ey * 0.56, style["chamfer"] * 1.3),
                 octagon(0.0, 0.0, ex * 0.64, ey * 0.64, style["chamfer"] * 1.5),
                 centre - 0.4, centre + 1.0)
        (ox, oy), (nx, ny), half = side_frame("N", ex, ey)
        portico = 3.4
        columns = max(3, int((half - style["chamfer"]) * 2.0 // BAY_M) + 1)
        column_h = top * 0.66
        for i in range(columns):
            t = -half * 0.82 + (half * 1.64) * (i / float(columns - 1))
            buf.mass("colonnade", mats["trim"],
                     octagon(t, oy + portico * 0.5, 1.35, 1.35, 0.45),
                     octagon(t, oy + portico * 0.5, 1.1, 1.1, 0.4), PLINTH_M, PLINTH_M + column_h)
        buf.box("colonnade", mats["trim"], (0.0, oy + portico * 0.5, PLINTH_M + column_h + 0.8),
                (half * 1.9, portico + 1.8, 1.6))
    return centre + 1.0, ex * 0.54, ey * 0.54


def form_mega(buf, spec, style, mats, lod, rng, floors):
    """Arcology stack: podium, twin towers, skybridge. The kit's landmark --
    one per colony is enough to give a skyline a centre."""
    hx, hy = footprint(spec)
    podium = PLINTH_M + FLOOR_M * 4.0
    top = mass_top(floors)
    sides = banded_sides(spec)
    add_base_flare(buf, style, mats, 0.0, 0.0, hx, hy, lod)
    shell_banded(buf, style, mats, 0.0, 0.0, hx, hy, 0.0, podium, lod, rng, "podium",
                 glaze_sides=sides)
    _dress(buf, spec, style, mats, hx, hy, PLINTH_M, podium, lod, rng, "mega")
    add_cornice(buf, style, mats, 0.0, 0.0, hx, hy, podium, lod)
    exp, eyp = taper_at(podium, 0.0, podium, hx, hy, style["batter"])
    tower_hx, tower_hy = exp * 0.34, eyp * 0.58
    heights = (top, top * rng.range(0.74, 0.9, "twin"))
    for i, sgn in enumerate((-1.0, 1.0)):
        th = heights[i]
        cx = sgn * exp * 0.54
        shell_banded(buf, style, mats, cx, 0.0, tower_hx, tower_hy, podium, th, lod, rng,
                     "twin%d" % i, glaze_sides=["N", "S"], inset=0.0)
        add_fins(buf, style, mats, cx, 0.0, tower_hx, tower_hy, podium, th, ["N", "S", "E", "W"],
                 lod, inset=0.0)
        add_cornice(buf, style, mats, cx, 0.0, tower_hx, tower_hy, th, lod, z0=podium, inset=0.0)
    if lod < 2:
        bridge_z = podium + (min(heights) - podium) * 0.62
        buf.mass("skybridge", mats["armour"],
                 octagon(0.0, 0.0, exp * 0.55, tower_hy * 0.46, 1.1),
                 octagon(0.0, 0.0, exp * 0.55, tower_hy * 0.40, 1.1),
                 bridge_z, bridge_z + FLOOR_M * 1.05)
        buf.box("window_glass", "glazing", (0.0, 0.0, bridge_z + FLOOR_M * 0.52),
                (exp * 1.04, tower_hy * 0.94, FLOOR_M * 0.46))
    return max(heights)


def form_sawtooth(buf, spec, style, mats, lod, rng, floors):
    """Industrial hall with a north-light sawtooth roof. The tooth faces read
    as glazing from above, which is what makes an industrial district legible
    from the RTS camera rather than just another flat roof."""
    hx, hy = footprint(spec)
    top = mass_top(floors)
    sides = banded_sides(spec)
    add_base_flare(buf, style, mats, 0.0, 0.0, hx, hy, lod)
    shell_banded(buf, style, mats, 0.0, 0.0, hx, hy, 0.0, top, lod, rng, "indus",
                 glaze_sides=sides)
    _dress(buf, spec, style, mats, hx, hy, PLINTH_M, top, lod, rng, "indus")
    add_cornice(buf, style, mats, 0.0, 0.0, hx, hy, top, lod)
    ex, ey = taper_at(top, 0.0, top, hx, hy, style["batter"])
    teeth = 2 if lod >= 2 else (3 if lod == 1 else 5)
    depth = (ey * 2.0) / teeth
    tooth_h = FLOOR_M * 1.3
    for i in range(teeth):
        y0 = -ey + depth * i
        buf.mass("sawtooth_roof", mats["deck"],
                 octagon(0.0, y0 + depth * 0.72, ex * 0.99, depth * 0.26, 0.5),
                 octagon(0.0, y0 + depth * 0.78, ex * 0.96, depth * 0.20, 0.5),
                 top, top + tooth_h)
        if lod < 2:
            buf.box("window_glass", "glazing", (0.0, y0 + depth * 0.45, top + tooth_h * 0.55),
                    (ex * 1.9, 0.5, tooth_h * 0.84))
    if lod < 2:
        buf.cyl("riser_stack", mats["deck"], (ex * 0.66, -ey * 0.62, top + FLOOR_M * 2.6),
                2.3, FLOOR_M * 5.2, 10)
        buf.cyl("riser_stack", "hazard", (ex * 0.66, -ey * 0.62, top + FLOOR_M * 5.3), 2.5, 0.5, 10)
    return top + tooth_h


def form_tanks(buf, spec, style, mats, lod, rng, floors):
    """Tank farm. E/W ends are `open` so the pipe rack runs straight into the
    next farm -- the module chains into a tank field of any length."""
    hx, hy = footprint(spec)
    bund = PLINTH_M + 1.8
    for direction in ("N", "S"):
        (ox, oy), (nx, ny), half = side_frame(direction, hx, hy)
        # Centred on the plane, a 0.75 m-thick bund put half its thickness in
        # the next cell. Shift it inboard so its outer face IS the plane.
        oy -= ny * 0.75
        buf.mass("bund_wall", mats["wall"],
                 octagon(ox, oy, half, 0.75, 0.5), octagon(ox, oy, half, 0.55, 0.4), 0.0, bund)
    segments = 8 if lod >= 1 else 16
    count = 2 if lod >= 2 else 3
    tallest = 0.0
    for i in range(count):
        t = -hx * 0.62 + (hx * 1.24) * (i / float(max(1, count - 1)))
        radius = rng.range(4.8, 6.5, "tank", i, "r")
        height = rng.range(9.0, 14.0, "tank", i, "h")
        tallest = max(tallest, height)
        buf.cyl("storage_tank", mats["deck"], (t, 0.0, bund + height * 0.5), radius, height, segments)
        if lod < 2:
            buf.cyl("storage_tank", mats["armour"], (t, 0.0, bund + height + 0.45),
                    radius * 0.6, 0.9, segments)
            for k in range(3):
                buf.cyl("storage_tank", mats["trim"], (t, 0.0, bund + height * (0.25 + k * 0.3)),
                        radius * 1.03, 0.34, segments)
            buf.box("pipe_rack", "metal", (t, 0.0, bund + height * 0.78), (radius * 2.3, 0.36, 0.36))
    if lod < 2:
        buf.box("pipe_rack", "metal", (0.0, hy * 0.58, bund + 3.4), (hx * 2.0, 1.0, 1.0))
        for i in range(3):
            buf.cyl("pipe_rack", "metal", (-hx * 0.7 + hx * 0.7 * i, hy * 0.58, (bund + 3.4) * 0.5),
                    0.34, bund + 3.4, 6)
    return bund + tallest


def form_relay(buf, spec, style, mats, lod, rng, floors):
    hx, hy = footprint(spec)
    top = mass_top(floors)
    add_base_flare(buf, style, mats, 0.0, -hy * 0.45, hx * 0.74, hy * 0.44, lod, inset=0.55)
    shell_banded(buf, style, mats, 0.0, -hy * 0.45, hx * 0.74, hy * 0.44, 0.0, top, lod, rng,
                 "relay", glaze_sides=["S"], inset=0.55)
    add_fins(buf, style, mats, 0.0, -hy * 0.45, hx * 0.74, hy * 0.44, PLINTH_M, top, ["S", "E", "W"],
             lod, inset=0.55)
    add_cornice(buf, style, mats, 0.0, -hy * 0.45, hx * 0.74, hy * 0.44, top, lod, inset=0.55)
    # The pylons ARE this module's silhouette, so they survive to LOD2.
    for sgn in (-1.0, 1.0):
        height = 15.0
        px = sgn * hx * 0.76
        buf.mass("pylon_mast", "metal",
                 octagon(px, hy * 0.7, 1.15, 1.15, 0.35),
                 octagon(px, hy * 0.7, 0.5, 0.5, 0.2), 0.0, height)
        buf.box("pylon_mast", "metal", (px, hy * 0.7, height * 0.84), (5.0, 0.34, 0.34))
        buf.box("pylon_mast", "metal", (px, hy * 0.7, height * 0.66), (3.8, 0.30, 0.30))
    if lod < 2:
        for i in range(3):
            t = -hx * 0.56 + hx * 0.56 * i
            buf.mass("transformer", "metal",
                     octagon(t, hy * 0.42, 2.9, 3.0, 0.6),
                     octagon(t, hy * 0.42, 2.6, 2.7, 0.6), PLINTH_M, PLINTH_M + 4.4)
            for k in (-1, 0, 1):
                buf.cyl("insulator", mats["armour"], (t + k * 1.1, hy * 0.42, PLINTH_M + 5.3),
                        0.42, 1.8, 6)
        if style["emissive"] > 0.0:
            buf.box("window_emissive", "emissive", (0.0, hy * 0.42 - 3.2, PLINTH_M + 4.6),
                    (hx * 1.1, 0.22, 0.22))
    else:
        buf.box("transformer", "metal", (0.0, hy * 0.42, PLINTH_M + 2.2), (hx * 1.3, 6.0, 4.4))
    return max(top, 15.0)


def form_corner(buf, spec, style, mats, lod, rng, floors):
    """Corner infill: two wings meeting at a chamfered street corner. The piece
    that closes a block, so a city reads as continuous frontage rather than a
    grid of detached objects."""
    hx, hy = footprint(spec)
    top = mass_top(floors)
    wing = 0.52
    add_base_flare(buf, style, mats, 0.0, hy * (1.0 - wing), hx, hy * wing, lod)
    shell_banded(buf, style, mats, 0.0, hy * (1.0 - wing), hx, hy * wing, 0.0, top, lod, rng,
                 "wingN", glaze_sides=["N"])
    shell_banded(buf, style, mats, hx * (1.0 - wing), -hy * wing, hx * wing, hy * (1.0 - wing),
                 0.0, top, lod, rng, "wingE", glaze_sides=["E"])
    add_fins(buf, style, mats, 0.0, hy * (1.0 - wing), hx, hy * wing, PLINTH_M, top, ["N"], lod)
    add_fins(buf, style, mats, hx * (1.0 - wing), -hy * wing, hx * wing, hy * (1.0 - wing),
             PLINTH_M, top, ["E"], lod)
    if lod < 2:
        # The chamfered outside corner, carried full height -- the classic
        # street-corner move and the reason this module closes a block.
        buf.mass("corner_chamfer", mats["armour"],
                 octagon(hx - 3.4, hy - 3.4, 3.4, 3.4, 2.9),
                 octagon(hx - 3.4, hy - 3.4, 3.05, 3.05, 2.6), 0.0, top + 1.2)
        add_armour(buf, style, mats, 0.0, hy * (1.0 - wing), hx, hy * wing, PLINTH_M, top,
                   ["N"], lod, rng, "corner")
        add_greebles(buf, style, mats, 0.0, hy * (1.0 - wing), hx, hy * wing, top,
                     ["N"], lod, rng, "corner")
    add_cornice(buf, style, mats, 0.0, hy * (1.0 - wing), hx, hy * wing, top, lod)
    add_cornice(buf, style, mats, hx * (1.0 - wing), -hy * wing, hx * wing, hy * (1.0 - wing),
                top, lod)
    return top + 1.2


FORMS = {
    "slab": form_slab, "arch": form_arch, "mast": form_mast, "shed": form_shed,
    "tower": form_tower, "stepped": form_stepped, "hall": form_hall, "mega": form_mega,
    "sawtooth": form_sawtooth, "tanks": form_tanks, "relay": form_relay, "corner": form_corner,
}

# Forms whose silhouette is the whole point of the module, and which therefore
# skip the generic plinth/parapet/roof dressing.
BARE_FORMS = {"tanks", "relay"}
# Forms that must not receive a solid roof deck: the gatehouse would seal its
# own opening and the shed already carries a vault.
NO_DECK_FORMS = {"arch", "shed", "tanks", "relay", "sawtooth", "mast", "mega"}
# Roles worth chamfering. Glazing, emissive strips and small clutter are left
# sharp: a bevel there costs triangles the phone renderer will never resolve.
BEVEL_ROLES = {
    # Silhouette-carrying architecture only. The metre-scale corner cuts are
    # already in the geometry (octagonal plans); this is edge softening so the
    # big planes catch a highlight instead of dying flat.
    "shell_mass", "spandrel", "window_drum", "cornice", "base_flare", "fin",
    "armour_plate", "hab_pod", "corner_chamfer", "colonnade", "skybridge", "base_block",
    "sawtooth_roof", "bund_wall", "gate_lintel", "entrance_canopy",
    "plinth", "parapet", "roof_deck",
}


def collision_boxes(spec, hx, hy, top):
    """Simplified physics proxy. It stays inside the visible shell so a unit
    never clips a facade it is standing against, and it is one convex box per
    massing lobe -- never the render mesh, which would be far too dense."""
    form = spec["form"]
    inset = 0.25
    if form == "arch":
        clear_half = 10.0
        pier = hx - clear_half
        return [
            ((-(clear_half + pier * 0.5), 0.0, top * 0.5), (pier - inset, hy * 2.0 - inset, top)),
            (((clear_half + pier * 0.5), 0.0, top * 0.5), (pier - inset, hy * 2.0 - inset, top)),
            ((0.0, 0.0, (10.0 + top) * 0.5), (clear_half * 2.0, hy * 2.0 - inset, max(0.5, top - 10.0))),
        ]
    if form == "corner":
        wing = 0.52
        return [
            ((0.0, hy * (1.0 - wing), top * 0.5), (hx * 2.0 - inset, hy * 2.0 * wing - inset, top)),
            ((hx * (1.0 - wing), -hy * wing, top * 0.5),
             (hx * 2.0 * wing - inset, hy * 2.0 * (1.0 - wing) - inset, top)),
        ]
    if form == "mast":
        shaft = min(hx, hy) * 0.42
        return [
            ((0.0, 0.0, (PLINTH_M + FLOOR_M) * 0.5), (hx * 1.25 - inset, hy * 1.25 - inset, PLINTH_M + FLOOR_M)),
            ((0.0, 0.0, top * 0.5), (shaft * 2.2, shaft * 2.2, top)),
        ]
    return [((0.0, 0.0, top * 0.5), (hx * 2.0 - inset, hy * 2.0 - inset, top))]


def create_module(master, spec, style_id, materials):
    style = STYLES[style_id]
    module_key = style_id + "_" + spec["id"]
    rng = Rng(SCHEMA, style_id, spec["id"])
    floors = effective_floors(spec, style, rng)
    hx, hy = footprint(spec)
    cells_x, cells_y = spec["cells"]
    mats = {"wall": style_id + "_wall", "trim": style_id + "_trim",
            "deck": style_id + "_deck", "armour": style_id + "_armour"}

    module_collection = linked_collection(master, PREFIX + "_" + module_key.upper())
    root = create_empty(module_collection, PREFIX + "_ROOT_" + module_key, None)
    root.location = (
        spec["layout"][0] * LAYOUT_PITCH_X + STYLE_LAYOUT_OFFSET[style_id],
        -spec["layout"][1] * LAYOUT_PITCH_Y,
        0.0,
    )
    root["mf_asset_kind"] = "modular_building"
    root["mf_module_id"] = module_key
    root["mf_archetype"] = spec["id"]
    root["mf_style"] = style_id
    root["mf_style_label"] = style["label"]
    root["mf_settlement_class"] = spec["class"]
    root["mf_grid_m"] = GRID_M
    root["mf_bay_m"] = BAY_M
    root["mf_floor_m"] = FLOOR_M
    root["mf_plinth_m"] = PLINTH_M
    root["mf_party_joint_m"] = JOINT_M
    root["mf_cells"] = json.dumps(list(spec["cells"]), separators=(",", ":"))
    root["mf_footprint_m"] = json.dumps([cells_x * GRID_M, cells_y * GRID_M], separators=(",", ":"))
    root["mf_floors"] = floors
    root["mf_authored_floors"] = spec["floors"]
    root["mf_edges"] = json.dumps(spec["edges"], separators=(",", ":"), sort_keys=True)
    if spec["form"] == "arch":
        # A derelict gatehouse drops a floor slab into its own arch, which is
        # correct for a ruin and means the road no longer runs through it.
        # Declare that rather than leaving a placer to assume every gatehouse
        # is passable.
        blocked = style["ruin"] > 0.0
        root["mf_gate_passable"] = not blocked
        root["mf_gate_clear_width_m"] = 0.0 if blocked else 20.0
        root["mf_gate_clear_height_m"] = 0.0 if blocked else 10.0

    lod_records = []
    role_triangles = {}
    top_height = 0.0

    for lod in range(3):
        lod_collection = linked_collection(module_collection, PREFIX + "_" + module_key.upper() + "_LOD%d" % lod)
        buf = GeoBuf()
        shaped = FORMS[spec["form"]](buf, spec, style, mats, lod, rng, floors)
        # A form may report (top_z, top_hx, top_hy). Setback forms must, or the
        # dressing below lays a full-footprint slab across a narrow tower head
        # and it reads as a plate floating past the building.
        if isinstance(shaped, tuple):
            top, top_hx, top_hy = shaped
        else:
            top, top_hx, top_hy = shaped, hx, hy
        top_height = max(top_height, top)

        # Shared dressing. Applied after the form so every module in the pack
        # carries the same ground datum and roof line -- the second half of the
        # tiling contract.
        if spec["form"] not in BARE_FORMS:
            add_plinth(buf, mats["wall"], hx, hy)
            add_parapet(buf, style, mats["trim"], top_hx, top_hy, top, lod, rng,
                        broken=style["ruin"] > 0.0)
        if spec["form"] not in NO_DECK_FORMS:
            add_roof_deck(buf, mats["deck"], top_hx, top_hy, top, style)
            add_roof_plant(buf, style, top_hx, top_hy, top, lod, rng)
        add_mast(buf, style, top_hx, top_hy, top, lod, rng)
        add_service_clutter(buf, style, clutter_sides(spec), hx, hy, top, lod, rng)
        add_entrance(buf, spec, style, mats["trim"], hx, hy, lod)
        add_ruin_damage(buf, style, hx, hy, top, lod, rng)

        # Chamfers are an LOD0-only cost. Giving LOD1 even a single bevel
        # segment left the brutalist and ruined sets at ~85% of their LOD0
        # count -- an LOD ladder that saves nothing is just three copies of the
        # same mesh. LOD1 keeps every part, sharp.
        bevel_width, bevel_segments = style["bevel"]
        lod_triangles = 0
        for (role, material_key), (vertices, faces) in sorted(buf.buckets.items()):
            obj = mesh_object(
                lod_collection,
                "%s_%s_LOD%d_%s" % (PREFIX, module_key, lod, role.upper()),
                vertices, faces, materials[material_key], root,
            )
            tag_geometry(obj, role, lod)
            obj["mf_material_role"] = material_key
            if lod == 0 and role in BEVEL_ROLES:
                bevel_geometry(obj, bevel_width, bevel_segments)
            triangles = triangle_count(obj)
            lod_triangles += triangles
            if lod == 0:
                role_triangles[role] = role_triangles.get(role, 0) + triangles
        lod_records.append({"lod": lod, "triangles": lod_triangles})

    # ---- sockets ----------------------------------------------------------
    # One socket per CELL EDGE, not per side: a 2x1 depot exposes two sockets
    # north and two south, so a placer can butt a 1x1 hab against either half.
    # They sit on the true grid plane, JOINT_M outboard of the facade.
    sockets = []
    for direction in ("N", "E", "S", "W"):
        along = cells_x if direction in ("N", "S") else cells_y
        for index in range(along):
            t = (-along * 0.5 + index + 0.5) * GRID_M
            dx, dy, angle = CARDINALS[direction]
            if direction in ("N", "S"):
                location = (t, dy * cells_y * HALF_GRID_M, 0.0)
            else:
                location = (dx * cells_x * HALF_GRID_M, t, 0.0)
            name = "SOCKET_%s_%s" % (direction, index) if along > 1 else "SOCKET_" + direction
            socket = create_empty(
                module_collection, "%s_%s_%s" % (PREFIX, module_key.upper(), name), root,
                location, "ARROWS",
            )
            socket.rotation_euler[2] = angle
            socket["mf_role"] = "building_socket"
            socket["mf_direction"] = direction
            socket["mf_socket_type"] = spec["edges"][direction]
            socket["mf_cell_index"] = index
            socket["mf_grid_m"] = GRID_M
            socket["mf_party_joint_m"] = JOINT_M
            socket["mf_blind"] = spec["edges"][direction] == "party_wall"
            sockets.append(socket)

    roof_socket = create_empty(
        module_collection, "%s_%s_SOCKET_ROOF" % (PREFIX, module_key.upper()), root,
        (0.0, 0.0, top_height), "SPHERE",
    )
    roof_socket["mf_role"] = "roof_prop_socket"
    roof_socket["mf_height_m"] = top_height

    nav = create_empty(module_collection, "%s_%s_NAV" % (PREFIX, module_key.upper()), root, display="CIRCLE")
    nav["mf_role"] = "navigation_metadata"
    nav["mf_blocks_movement"] = True
    nav["mf_footprint_cells"] = json.dumps(list(spec["cells"]), separators=(",", ":"))
    nav["mf_entrances"] = json.dumps(
        sorted(d for d, kind in spec["edges"].items() if kind == "street"), separators=(",", ":"),
    )

    # ---- collision --------------------------------------------------------
    collision_collection = linked_collection(module_collection, PREFIX + "_" + module_key.upper() + "_COLLISION")
    vertices, faces = [], []
    for center, size in collision_boxes(spec, hx, hy, top_height):
        append_box(vertices, faces, center, size)
    collision = mesh_object(
        collision_collection, "%s_%s_COLLISION" % (PREFIX, module_key.upper()),
        vertices, faces, None, root,
    )
    collision.display_type = "WIRE"
    collision.hide_render = True
    collision["mf_role"] = "simplified_collision"
    collision["mf_collision_class"] = "static_structure"
    collision["mf_height_m"] = top_height

    all_objects = [root] + descendants(root)
    for obj in all_objects:
        if obj.get("mf_lod", 0) > 0:
            obj.hide_render = True

    return {
        "spec": spec,
        "style": style_id,
        "key": module_key,
        "collection": module_collection,
        "root": root,
        "objects": all_objects,
        "sockets": sockets,
        "collision": collision,
        "lods": lod_records,
        "roleTriangles": role_triangles,
        "floors": floors,
        "height": top_height,
    }


# ---------------------------------------------------------------------------
# tiling proof
# ---------------------------------------------------------------------------
# Four authored rows that exist only to be photographed. They are the evidence
# for the brief's actual question -- does the pack tile? -- because a grid of
# isolated hero renders cannot answer it.
BLOCK_PROOFS = (
    {"id": "outpost_row", "style": "colonial", "row": 0,
     "items": ["gatehouse", "hab_block", "hab_block", "watchtower"]},
    {"id": "city_street", "style": "brutalist", "row": 1,
     "items": ["tower_slab", "corner_infill", "tower_spire", "hab_block", "civic_hall"]},
    {"id": "colony_yard", "style": "colonial", "row": 2,
     "items": ["depot_shed", "tank_farm", "power_relay", "industrial_hall"]},
    {"id": "dead_block", "style": "ruined", "row": 3,
     "items": ["tower_slab", "hab_block", "corner_infill", "tower_spire"]},
)
BLOCK_ORIGIN_X = -1400.0
BLOCK_ROW_PITCH = 150.0


def build_block_proof(master, modules):
    """Lay authored rows of LOD0 copies on the shared grid. Copies share mesh
    data with the source modules, so the proof costs almost nothing and cannot
    drift from what the exported GLBs contain."""
    by_key = {module["key"]: module for module in modules}
    proof_collection = linked_collection(master, PREFIX + "_TILING_PROOF")
    rows = []
    for proof in BLOCK_PROOFS:
        available = [
            item for item in proof["items"]
            if (proof["style"] + "_" + item) in by_key
        ]
        if not available:
            continue
        row_collection = linked_collection(proof_collection, PREFIX + "_PROOF_" + proof["id"].upper())
        cursor = 0.0
        placed = []
        for item in available:
            module = by_key[proof["style"] + "_" + item]
            cells_x, cells_y = module["spec"]["cells"]
            # Cell-exact placement. Any gap or overlap here would show in the
            # render immediately, which is the point of the exercise.
            centre_x = BLOCK_ORIGIN_X + (cursor + cells_x * 0.5) * GRID_M
            centre_y = -proof["row"] * BLOCK_ROW_PITCH
            for source in module["objects"]:
                if source.type != "MESH" or int(source.get("mf_lod", 0)) != 0:
                    continue
                if source.get("mf_role") == "simplified_collision":
                    continue
                copy = source.copy()
                copy.parent = None
                copy.matrix_world = source.matrix_world.copy()
                copy.location = (
                    source.location.x + centre_x,
                    source.location.y + centre_y,
                    source.location.z,
                )
                copy["mf_proof_only"] = True
                copy.hide_render = False
                row_collection.objects.link(copy)
                placed.append(copy)
            cursor += cells_x
        rows.append({
            "id": proof["id"],
            "style": proof["style"],
            "items": available,
            "spanCells": cursor,
            "spanM": cursor * GRID_M,
            "centre": (BLOCK_ORIGIN_X + cursor * GRID_M * 0.5, -proof["row"] * BLOCK_ROW_PITCH),
            "objects": placed,
        })
    return proof_collection, rows


# ---------------------------------------------------------------------------
# evidence rig
# ---------------------------------------------------------------------------
def add_evidence_rig(master):
    helpers = linked_collection(master, PREFIX + "_EVIDENCE_RIG")
    bpy.ops.mesh.primitive_plane_add(size=4200.0, location=(0.0, 0.0, -0.05))
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

    area("KEY", (120.0, -110.0, 165.0), 26000.0, 90.0, (0.76, 0.89, 1.0))
    area("FILL", (-100.0, -60.0, 110.0), 16000.0, 76.0, (0.30, 0.55, 0.88))
    area("RIM", (-58.0, 130.0, 130.0), 21000.0, 68.0, (1.0, 0.48, 0.20))
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
    # Deterministic Workbench, matching the road kit. Runtime/PBR approval is a
    # separate in-game gate; these captures exist to judge geometry.
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
    if background is not None:
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
    camera.location = target + direction * (ortho_scale * 1.8)
    camera.rotation_euler = (target - camera.location).to_track_quat("-Z", "Y").to_euler()
    camera.data.ortho_scale = ortho_scale


def set_visibility(modules, proof_rows, visible_key=None, proof_id=None):
    for module in modules:
        module_visible = visible_key is not None and module["key"] == visible_key
        if visible_key is None and proof_id is None:
            module_visible = True
        for obj in module["objects"]:
            if obj.type != "MESH":
                continue
            hidden = (
                not module_visible
                or obj.get("mf_role") == "simplified_collision"
                or int(obj.get("mf_lod", 0)) > 0
            )
            obj.hide_render = hidden
    for row in proof_rows:
        row_visible = proof_id is not None and row["id"] == proof_id
        for obj in row["objects"]:
            obj.hide_render = not row_visible


# Camera directions point FROM the named compass corner toward the module, so
# iso_ne really does look at the north-east corner. The road kit's equivalent
# table has negative Y throughout -- harmless for a symmetric road tile, wrong
# here: most modules put their `street` edge north, and shooting from the south
# would photograph the service yard of every building in the pack and never
# once show an entrance, a canopy or the civic hall's colonnade.
MODULE_VIEWS = {
    "iso_ne": (1.2, 1.2, 0.82),
    "iso_nw": (-1.2, 1.2, 0.82),
    "top": (0.0, 0.001, 1.0),
    "entry": (0.0, 1.0, 0.30),
}


def render_evidence(config, modules, proof_rows, camera):
    evidence_dir = Path(config["evidence_dir"])
    evidence_dir.mkdir(parents=True, exist_ok=True)
    scene = bpy.context.scene
    renders = []
    generated = {obj for module in modules for obj in module["objects"]}
    generated.update(obj for row in proof_rows for obj in row["objects"])
    generated.update(obj for obj in scene.objects if obj.get("mf_evidence_only"))
    generated.add(camera)
    unrelated = [(obj, obj.hide_render) for obj in scene.objects if obj not in generated]
    for obj, _ in unrelated:
        obj.hide_render = True

    def shoot(path, target, direction, scale):
        point_camera(camera, target, direction, scale)
        scene.render.filepath = str(path)
        bpy.ops.render.render(write_still=True)
        renders.append(path.relative_to(REPO_ROOT).as_posix())

    try:
        for style_id in config["styles"]:
            style_modules = [m for m in modules if m["style"] == style_id]
            if not style_modules:
                continue
            set_visibility(modules, proof_rows)
            for module in modules:
                if module["style"] != style_id:
                    for obj in module["objects"]:
                        if obj.type == "MESH":
                            obj.hide_render = True
            centre_x = sum(m["root"].location.x for m in style_modules) / len(style_modules)
            centre_y = sum(m["root"].location.y for m in style_modules) / len(style_modules)
            shoot(evidence_dir / ("mf-modular-building-v1-overview-%s.png" % style_id),
                  (centre_x, centre_y, 12.0), (1.15, -1.2, 0.92), 300.0)

        for module in modules:
            set_visibility(modules, proof_rows, visible_key=module["key"])
            cells_x, cells_y = module["spec"]["cells"]
            extent = max(cells_x, cells_y) * GRID_M
            scale = max(extent * 1.55, module["height"] * 1.5)
            target = (module["root"].location.x, module["root"].location.y, module["height"] * 0.45)
            for view in config["evidence_views"]:
                if view not in MODULE_VIEWS:
                    raise ValueError("unsupported evidence view: " + view)
                shoot(evidence_dir / ("mf-bld-%s-%s.png" % (module["key"].replace("_", "-"), view)),
                      target, MODULE_VIEWS[view], scale)

        if config["render_block_proof"]:
            for row in proof_rows:
                set_visibility(modules, proof_rows, proof_id=row["id"])
                cx, cy = row["centre"]
                # An ortho frame has to hold the whole row plus the tallest
                # module in it, or the proof crops exactly the joints it exists
                # to show. spanM alone cropped every row at 0.72.
                heights = [m["height"] for m in modules
                           if m["style"] == row["style"] and m["spec"]["id"] in row["items"]]
                tallest = max(heights) if heights else 40.0
                scale = max(row["spanM"] * 1.12, tallest * 2.0, 110.0)
                shoot(evidence_dir / ("mf-tiling-%s-iso.png" % row["id"].replace("_", "-")),
                      (cx, cy, tallest * 0.4), (0.85, 1.15, 0.72), scale)
                # Street-level elevation is the shot that proves the joint: any
                # gap or overlap between neighbours shows here or nowhere.
                shoot(evidence_dir / ("mf-tiling-%s-street.png" % row["id"].replace("_", "-")),
                      (cx, cy, tallest * 0.42), (0.0, 1.0, 0.16), scale)
        set_visibility(modules, proof_rows)
        return renders
    finally:
        for obj, original in unrelated:
            obj.hide_render = original


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
        output = export_dir / ("mf-bld-%s.glb" % module["key"].replace("_", "-"))
        bpy.ops.export_scene.gltf(
            filepath=str(output), export_format="GLB", use_selection=True,
            export_apply=True, export_extras=True, export_cameras=False,
            export_lights=False, export_yup=True,
        )
        for obj, hide_render, hide_viewport in hidden:
            obj.hide_render, obj.hide_viewport = hide_render, hide_viewport
        root.location = original_location
        outputs.append({
            "module": module["key"],
            "path": output.resolve().relative_to(REPO_ROOT).as_posix(),
        })
    return outputs


def build_report(config, modules, proof_rows, exports, renders):
    records = []
    for module in modules:
        spec = module["spec"]
        records.append({
            "id": module["key"],
            "archetype": spec["id"],
            "style": module["style"],
            "styleLabel": STYLES[module["style"]]["label"],
            "settlementClass": spec["class"],
            "form": spec["form"],
            "cells": list(spec["cells"]),
            "footprintM": [spec["cells"][0] * GRID_M, spec["cells"][1] * GRID_M],
            "authoredFloors": spec["floors"],
            "floors": module["floors"],
            "heightM": round(module["height"], 3),
            "edges": spec["edges"],
            "sockets": [{
                "name": socket.name,
                "direction": socket["mf_direction"],
                "type": socket["mf_socket_type"],
                "cellIndex": socket["mf_cell_index"],
                "localPosition": [round(v, 3) for v in socket.location],
            } for socket in module["sockets"]],
            "lods": module["lods"],
            "geometryRoleTriangles": dict(sorted(module["roleTriangles"].items())),
            "collision": {
                "name": module["collision"].name,
                "triangles": triangle_count(module["collision"]),
                "class": "static_structure",
            },
        })

    lod0 = [record["lods"][0]["triangles"] for record in records]
    report = {
        "format": SCHEMA,
        "version": 1,
        "units": "metres",
        "deterministic": True,
        "generator": "tools/blender/build-mf-modular-building-kit.py",
        "evidenceRenderer": "BLENDER_WORKBENCH",
        "blenderVersion": bpy.app.version_string,
        "tilingContract": {
            "placementGridM": GRID_M,
            "sharedWith": "mf-modular-road-v1",
            "facadeBayM": BAY_M,
            "floorPitchM": FLOOR_M,
            "plinthHeightM": PLINTH_M,
            "sillHeightM": SILL_M,
            "bandHeightM": BAND_M,
            "partyJointM": JOINT_M,
            "partyJointTotalM": JOINT_M * 2.0,
            "notes": [
                "Facades stop at the cell boundary less partyJointM, so two neighbours "
                "meet in a recessed joint of partyJointTotalM instead of coplanar walls.",
                "Sill heights derive from the shared floor datum, so window bands line up "
                "across adjacent modules of different archetypes.",
                "Edges typed party_wall are authored blind: no glazing, no clutter.",
                "One socket per cell edge, placed on the true grid plane.",
            ],
        },
        "styles": {
            style_id: {
                "label": STYLES[style_id]["label"],
                "modules": len([m for m in modules if m["style"] == style_id]),
            } for style_id in config["styles"]
        },
        "archetypes": [spec["id"] for spec in ARCHETYPES],
        "moduleCount": len(records),
        "triangleSummary": {
            "lod0Total": sum(lod0),
            "lod0Min": min(lod0) if lod0 else 0,
            "lod0Max": max(lod0) if lod0 else 0,
            "lod0Mean": round(sum(lod0) / float(len(lod0)), 1) if lod0 else 0,
            "lod1Total": sum(r["lods"][1]["triangles"] for r in records),
            "lod2Total": sum(r["lods"][2]["triangles"] for r in records),
        },
        "tilingProof": [{
            "id": row["id"],
            "style": row["style"],
            "items": row["items"],
            "spanCells": row["spanCells"],
            "spanM": row["spanM"],
        } for row in proof_rows],
        "modules": records,
        "exports": exports,
        "evidenceRenders": renders,
        "blend": (Path(config["blend_path"]).resolve().relative_to(REPO_ROOT).as_posix()
                  if config["save_blend"] else None),
        "runtimeIntegration": {
            "state": "SOURCE_CANDIDATE",
            "note": "Exported GLBs are source candidates. Nothing is registered in "
                    "boot.js or assets/data/manifest.json by this generator; runtime "
                    "integration and phone-first evidence remain a separate gate.",
        },
    }
    report_path = Path(config["report_path"])
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
    return report


def build_building_kit(overrides=None):
    config = merged_config(overrides)
    if bpy.context.object is not None and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")
    clear_previous_generated_kit()

    master = bpy.data.collections.new(MASTER_COLLECTION)
    bpy.context.scene.collection.children.link(master)
    master["mf_schema"] = SCHEMA

    materials = create_materials()
    modules = []
    for style_id in config["styles"]:
        for spec in ARCHETYPES:
            modules.append(create_module(master, spec, style_id, materials))

    proof_collection, proof_rows = build_block_proof(master, modules)
    helpers, floor, camera = add_evidence_rig(master)
    configure_render(config)
    set_visibility(modules, proof_rows)

    exports = export_modules(config, modules) if config["export_glb"] else []
    renders = render_evidence(config, modules, proof_rows, camera) if config["render_evidence"] else []
    report = build_report(config, modules, proof_rows, exports, renders)

    if config["save_blend"]:
        blend_path = Path(config["blend_path"])
        blend_path.parent.mkdir(parents=True, exist_ok=True)
        _stale = _FINISH["purge_orphans"]()
        if _stale:
            print("  purged factory-startup leftovers: %s" % ", ".join(_stale))
        bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))
    return report


def arguments():
    argv = sys.argv
    if "--" not in argv:
        return None
    tail = argv[argv.index("--") + 1:]
    if not tail:
        return None
    return json.loads(Path(tail[0]).read_text(encoding="utf-8"))


if __name__ == "__main__":
    summary = build_building_kit(arguments())
    print("%s: %d modules, LOD0 %d tris total"
          % (summary["format"], summary["moduleCount"], summary["triangleSummary"]["lod0Total"]))
