"""Author MASSFRONT's TRANSIT and MAP-EDGE kit in Blender.

Elevated transit and the pieces that let a city stop convincingly, on the same
32 m grid as the building, superstructure and ground kits. Eighteen forms in
three style sets = 54 modules.

WHY THIS KIT. The reference cityscapes read as living places largely because
of two things the other three kits cannot do:

  * THINGS PASS OVER. Tube rail on ringed pylons and elevated road decks thread
    between the blocks at two heights, so the space between buildings is
    occupied instead of empty.
  * THE CITY STOPS SOMEWHERE. Megawalls, cliff terraces, tunnel portals and
    quays are how a built plate meets terrain or water. Without them a kit just
    ends at the last tile.

It imports the SUPERSTRUCTURE kit's vocabulary (which in turn imports the
building kit's), so sloped decks, caissons, railings, deck plating and the
party-plane rules all come from one place.

DATUMS, layered so the two systems never fight:
    GRADE_Z      0     city paving, shared with the ground kit
    FLYOVER_Z   18     elevated road deck
    SKYWAY_Z    42     transit rail, above the flyover and clear of low blocks
    EDGE_DROP   22     how far a map-edge piece falls to terrain

CLI:
  blender --background --python tools/blender/build-mf-transit-kit.py -- CONFIG.json
"""

import bpy
import json
import math
import os
import runpy
import sys
from pathlib import Path
from mathutils import Vector


_SUP_PATH = Path(__file__).resolve().with_name("build-mf-superstructure-kit.py")
_SUP = runpy.run_path(str(_SUP_PATH), run_name="mf_superstructure_lib")
_LIB = _SUP["_LIB"]

GeoBuf = _LIB["GeoBuf"]
Rng = _LIB["Rng"]
octagon = _LIB["octagon"]
append_box = _LIB["append_box"]
append_taper = _LIB["append_taper"]
append_cylinder = _LIB["append_cylinder"]
taper_at = _LIB["taper_at"]
side_frame = _LIB["side_frame"]
make_material = _LIB["make_material"]
mesh_object = _LIB["mesh_object"]
REPO_ROOT = Path(__file__).resolve().parents[2]
_FINISH = _LIB["_FINISH"]
bevel_geometry = _LIB["bevel_geometry"]
triangle_count = _LIB["triangle_count"]
create_empty = _LIB["create_empty"]
descendants = _LIB["descendants"]
linked_collection = _LIB["linked_collection"]
tag_geometry = _LIB["tag_geometry"]
add_panel_lines = _LIB["add_panel_lines"]
add_louvre_bank = _LIB["add_louvre_bank"]

sloped_slab = _SUP["sloped_slab"]
annulus = _SUP["annulus"]
add_railing = _SUP["add_railing"]
add_deck_plating = _SUP["add_deck_plating"]
mega_shell = _SUP["mega_shell"]
mega_cornice = _SUP["mega_cornice"]

GRID_M = _LIB["GRID_M"]
HALF_GRID_M = _LIB["HALF_GRID_M"]
BAY_M = _LIB["BAY_M"]
FLOOR_M = _LIB["FLOOR_M"]
CARDINALS = _LIB["CARDINALS"]
BASE_STYLES = _LIB["STYLES"]

SCHEMA = "MassfrontTransitKitV1"
PREFIX = "MF_TRANSIT_V1"
MASTER_COLLECTION = PREFIX + "_SOURCE"

GRADE_Z = 0.0
FLYOVER_Z = 18.0
SKYWAY_Z = 42.0
EDGE_DROP = 22.0
ROAD_HALF = 10.0          # matches the ground kit carriageway and every gate
RAIL_HALF = 4.2


def _scale_style(base):
    """Transit sits between the building and superstructure tiers in scale:
    chunkier than a facade detail, finer than a 292 m pylon."""
    style = dict(base)
    style["chamfer"] = base["chamfer"] * 1.25
    style["inset"] = base["inset"] * 0.9
    style["cornice"] = base["cornice"] * 1.1
    style["bevel"] = (base["bevel"][0] * 1.3, base["bevel"][1])
    return style


STYLES = {name: _scale_style(base) for name, base in BASE_STYLES.items()}

ARCHETYPES = (
    # ---- skyway: tube rail on ringed pylons, SKYWAY_Z ---------------------
    {"id": "skyway_straight", "cells": (1, 1), "form": "sky_straight", "class": "skyway",
     "layout": (0, 0), "edges": {"N": "service", "E": "open", "S": "service", "W": "open"}},
    {"id": "skyway_curve", "cells": (1, 1), "form": "sky_curve", "class": "skyway",
     "layout": (1, 0), "edges": {"N": "open", "E": "service", "S": "service", "W": "open"}},
    {"id": "skyway_junction", "cells": (1, 1), "form": "sky_junction", "class": "skyway",
     "layout": (2, 0), "edges": {"N": "open", "E": "open", "S": "service", "W": "open"}},
    {"id": "skyway_station", "cells": (2, 1), "form": "sky_station", "class": "skyway",
     "layout": (3, 0), "edges": {"N": "service", "E": "open", "S": "street", "W": "open"}},
    {"id": "skyway_pylon", "cells": (1, 1), "form": "sky_pylon", "class": "skyway",
     "layout": (5, 0), "edges": {"N": "service", "E": "open", "S": "service", "W": "open"}},

    # ---- elevated road: FLYOVER_Z -----------------------------------------
    {"id": "flyover_straight", "cells": (1, 1), "form": "fly_straight", "class": "flyover",
     "layout": (0, 1), "edges": {"N": "service", "E": "open", "S": "service", "W": "open"}},
    {"id": "flyover_curve", "cells": (1, 1), "form": "fly_curve", "class": "flyover",
     "layout": (1, 1), "edges": {"N": "open", "E": "service", "S": "service", "W": "open"}},
    {"id": "flyover_merge", "cells": (1, 1), "form": "fly_merge", "class": "flyover",
     "layout": (2, 1), "edges": {"N": "open", "E": "open", "S": "service", "W": "open"}},
    {"id": "flyover_ramp", "cells": (2, 1), "form": "fly_ramp", "class": "flyover",
     "layout": (3, 1), "edges": {"N": "service", "E": "open", "S": "service", "W": "open"}},
    {"id": "flyover_interchange", "cells": (2, 2), "form": "fly_interchange", "class": "flyover",
     "layout": (5, 1), "edges": {"N": "open", "E": "open", "S": "open", "W": "open"}},

    # ---- map edge ---------------------------------------------------------
    {"id": "edge_megawall", "cells": (1, 1), "form": "edge_wall", "class": "edge",
     "layout": (0, 2), "edges": {"N": "street", "E": "open", "S": "service", "W": "open"}},
    {"id": "edge_corner", "cells": (1, 1), "form": "edge_corner", "class": "edge",
     "layout": (1, 2), "edges": {"N": "street", "E": "street", "S": "open", "W": "open"}},
    {"id": "edge_buttress", "cells": (1, 1), "form": "edge_buttress", "class": "edge",
     "layout": (2, 2), "edges": {"N": "street", "E": "open", "S": "service", "W": "open"}},
    {"id": "edge_terrace", "cells": (1, 1), "form": "edge_terrace", "class": "edge",
     "layout": (3, 2), "edges": {"N": "street", "E": "open", "S": "service", "W": "open"}},
    {"id": "edge_tunnel", "cells": (1, 1), "form": "edge_tunnel", "class": "edge",
     "layout": (4, 2), "edges": {"N": "street", "E": "open", "S": "service", "W": "open"}},
    {"id": "edge_outfall", "cells": (1, 1), "form": "edge_outfall", "class": "edge",
     "layout": (5, 2), "edges": {"N": "street", "E": "open", "S": "service", "W": "open"}},
    {"id": "edge_dock", "cells": (2, 1), "form": "edge_dock", "class": "edge",
     "layout": (6, 2), "edges": {"N": "street", "E": "open", "S": "service", "W": "open"}},
    {"id": "edge_ramp", "cells": (2, 1), "form": "edge_ramp", "class": "edge",
     "layout": (8, 2), "edges": {"N": "street", "E": "open", "S": "service", "W": "open"}},
)

LAYOUT_PITCH_X = 90.0
LAYOUT_PITCH_Y = 130.0
STYLE_LAYOUT_OFFSET = {"colonial": 0.0, "brutalist": 1100.0, "ruined": 2200.0}


def default_config():
    repo = Path(__file__).resolve().parents[2]
    output = (repo / "modules" / "space_exploration" / "assets" / "source" / "blender"
              / "world-kits" / "mf-transit-kit-v1")
    return {
        "blend_path": str(output / "mf-transit-kit-v1.blend"),
        "export_dir": str(output / "exports"),
        "evidence_dir": str(output / "evidence"),
        "report_path": str(output / "mf-transit-kit-v1-report.json"),
        "styles": list(STYLES),
        "save_blend": True, "export_glb": True, "render_evidence": True,
        "render_block_proof": True, "render_resolution": 768,
        "evidence_views": ["iso_ne", "top", "edge"],
    }


def merged_config(overrides=None):
    config = default_config()
    if overrides:
        unknown = sorted(set(overrides) - set(config))
        if unknown:
            raise ValueError("unknown transit-kit config keys: " + ", ".join(unknown))
        config.update(overrides)
    for key in ("blend_path", "export_dir", "evidence_dir", "report_path"):
        config[key] = os.path.abspath(os.path.expanduser(str(config[key])))
    config["render_resolution"] = max(256, min(2048, int(config["render_resolution"])))
    return config


def clear_previous_generated_kit():
    collection = bpy.data.collections.get(MASTER_COLLECTION)
    if collection is not None:
        _LIB["remove_collection_tree"](collection)
    for material in list(bpy.data.materials):
        if material.get("mf_schema") == SCHEMA and material.users == 0:
            bpy.data.materials.remove(material)
    for mesh in list(bpy.data.meshes):
        if mesh.get("mf_schema") == SCHEMA and mesh.users == 0:
            bpy.data.meshes.remove(mesh)


def create_materials():
    materials = {
        "metal": make_material("t_metal", (0.098, 0.120, 0.142, 1.0), 0.78, 0.28),
        "service": make_material("t_service", (0.052, 0.066, 0.078, 1.0), 0.60, 0.34),
        "slot": make_material("t_slot", (0.036, 0.040, 0.044, 1.0), 0.18, 0.76),
        "recess": make_material("t_recess", (0.086, 0.090, 0.088, 1.0), 0.22, 0.72),
        "grate": make_material("t_grate", (0.232, 0.244, 0.238, 1.0), 0.52, 0.52),
        "rubble": make_material("t_rubble", (0.322, 0.308, 0.282, 1.0), 0.06, 0.88),
        "rust": make_material("t_rust", (0.402, 0.196, 0.132, 1.0), 0.24, 0.78),
        "ochre": make_material("t_ochre", (0.548, 0.412, 0.156, 1.0), 0.16, 0.72),
        "verdigris": make_material("t_verdigris", (0.176, 0.348, 0.336, 1.0), 0.20, 0.70),
        "glazing": make_material("t_glazing", (0.026, 0.238, 0.312, 0.46), 0.20, 0.14, alpha=0.46),
        "emissive": make_material("t_emissive", (0.015, 0.45, 0.58, 1.0), 0.08, 0.22,
                                  emission=((0.01, 0.72, 1.0, 1.0), 5.6)),
        "hazard": make_material("t_hazard", (0.92, 0.39, 0.025, 1.0), 0.10, 0.42,
                                emission=((1.0, 0.17, 0.008, 1.0), 0.32)),
        "water": make_material("t_water", (0.020, 0.105, 0.148, 0.62), 0.10, 0.16, alpha=0.62),
    }
    for style_id, style in STYLES.items():
        wall = style["wall"]
        materials[style_id + "_wall"] = make_material("t_" + style_id + "_wall", wall, 0.08, 0.74)
        materials[style_id + "_trim"] = make_material("t_" + style_id + "_trim", style["trim"], 0.18, 0.58)
        materials[style_id + "_deck"] = make_material("t_" + style_id + "_deck", style["deck"], 0.46, 0.46)
        armour = tuple(min(1.0, c * 1.10 + 0.11) for c in wall[:3]) + (1.0,)
        materials[style_id + "_armour"] = make_material("t_" + style_id + "_armour", armour, 0.30, 0.50)
    return materials


def footprint(spec):
    cx, cy = spec["cells"]
    return cx * HALF_GRID_M, cy * HALF_GRID_M


def banded_sides(spec):
    return [d for d, k in spec["edges"].items() if k != "party_wall"]


def ruin_scale(spec, style, rng):
    return 1.0 if style["ruin"] <= 0.0 else rng.range(0.55, 0.85, "shear")


# ---------------------------------------------------------------------------
# shared transit parts
# ---------------------------------------------------------------------------
def append_oriented_box(verts, faces, center, length, width, height, angle):
    """A box whose long axis follows `angle` in XY. Needed for arc segments --
    every primitive inherited from the other kits is axis-aligned."""
    cx, cy, cz = center
    hl, hw, hh = length * 0.5, width * 0.5, height * 0.5
    co, si = math.cos(angle), math.sin(angle)
    base = len(verts)
    for z in (-hh, hh):
        for x, y in ((-hl, -hw), (hl, -hw), (hl, hw), (-hl, hw)):
            verts.append((cx + x * co - y * si, cy + x * si + y * co, cz + z))
    faces.extend((
        (base + 0, base + 3, base + 2, base + 1),
        (base + 4, base + 5, base + 6, base + 7),
        (base + 0, base + 1, base + 5, base + 4),
        (base + 1, base + 2, base + 6, base + 5),
        (base + 2, base + 3, base + 7, base + 6),
        (base + 3, base + 0, base + 4, base + 7),
    ))


def arc_run(buf, role, material, cx, cy, radius, a0, a1, z, half_w, thick, segs=5):
    """Lay boxes along an arc. Approximating a curve with a handful of chords
    is invisible at RTS distance and costs a fraction of a swept surface."""
    verts, faces = buf._bucket(role, material)
    for i in range(segs):
        f0, f1 = i / float(segs), (i + 1) / float(segs)
        b0, b1 = a0 + (a1 - a0) * f0, a0 + (a1 - a0) * f1
        x0, y0 = cx + math.cos(b0) * radius, cy + math.sin(b0) * radius
        x1, y1 = cx + math.cos(b1) * radius, cy + math.sin(b1) * radius
        mx, my = (x0 + x1) * 0.5, (y0 + y1) * 0.5
        length = math.hypot(x1 - x0, y1 - y0) * 1.06
        append_oriented_box(verts, faces, (mx, my, z), length, half_w * 2.0, thick,
                            math.atan2(y1 - y0, x1 - x0))


def ringed_pylon(buf, style, mats, cx, cy, top_z, lod, radius=3.4, base_r=None):
    """A tapering pylon banded with rings. The ring bands are what make the
    reference pylons read as engineered supports rather than plain posts."""
    base_r = radius * 2.0 if base_r is None else base_r
    ch = style["chamfer"]
    buf.mass("pylon", mats["wall"],
             octagon(cx, cy, base_r, base_r, ch),
             octagon(cx, cy, radius, radius, ch * 0.7), GRADE_Z, top_z)
    if lod >= 2:
        return
    bands = max(2, int((top_z - GRADE_Z) // 13.0))
    for i in range(bands):
        f = (i + 1) / float(bands + 1)
        z = GRADE_Z + (top_z - GRADE_Z) * f
        r = base_r + (radius - base_r) * f
        annulus(buf, "pylon_ring", mats["armour"], cx, cy, r * 1.18, r * 1.03, z, z + 1.5, 16)
    buf.mass("pylon_head", mats["armour"],
             octagon(cx, cy, radius * 1.15, radius * 1.15, ch * 0.8),
             octagon(cx, cy, radius * 1.45, radius * 1.45, ch), top_z - 2.6, top_z)


def rail_beam(buf, style, mats, t0, t1, other, z, lod, axis="y", half_w=RAIL_HALF):
    """The transit beam: a box girder with a recessed service channel and a lit
    strip underneath, which is what reads from below at street level."""
    length = abs(t1 - t0)
    mid = (t0 + t1) * 0.5

    def sz(a, b):
        return (a, b) if axis == "x" else (b, a)

    def at(t, off=0.0):
        return (t, other + off, z) if axis == "x" else (other + off, t, z)

    w, d = sz(length, half_w * 2.0)
    buf.box("rail_beam", mats["deck"], at(mid), (w, d, 3.4))
    if lod >= 2:
        return
    w2, d2 = sz(length, half_w * 1.5)
    buf.box("rail_channel", "recess", at(mid, 0.0)[:2] + (z - 1.9,), (w2, d2, 0.9))
    for sgn in (-1.0, 1.0):
        wr, dr = sz(length, 0.7)
        buf.box("rail_rail", mats["armour"],
                at(mid, sgn * half_w * 0.62)[:2] + (z + 2.0,), (wr, dr, 0.7))
    if style["emissive"] > 0.0 and lod == 0:
        we, de = sz(length, 0.4)
        buf.box("rail_light", "emissive", at(mid)[:2] + (z - 2.05,), (we, de, 0.3))


def road_deck(buf, style, mats, t0, t1, other, z, lod, axis="y", half_w=ROAD_HALF,
              barrier=True):
    length = abs(t1 - t0)
    mid = (t0 + t1) * 0.5

    def sz(a, b):
        return (a, b) if axis == "x" else (b, a)

    def at(t, off, zz):
        return (t, other + off, zz) if axis == "x" else (other + off, t, zz)

    w, d = sz(length, half_w * 2.0)
    buf.box("road_deck", mats["deck"], at(mid, 0.0, z - 1.5), (w, d, 3.0))
    if lod >= 2 or not barrier:
        return
    for sgn in (-1.0, 1.0):
        wb, db = sz(length, 1.0)
        buf.box("road_barrier", mats["armour"], at(mid, sgn * half_w, z + 0.9), (wb, db, 1.8))
    if lod == 0:
        marks = max(2, int(length // 9.0))
        for i in range(marks):
            t = t0 + (t1 - t0) * ((i + 0.5) / marks)
            wm, dm = sz(3.4, 0.5)
            buf.box("lane_marking", "ochre", at(t, 0.0, z + 0.12), (wm, dm, 0.14))


# ---------------------------------------------------------------------------
# skyway
# ---------------------------------------------------------------------------
def form_sky_straight(buf, spec, style, mats, lod, rng, scale):
    hx, hy = footprint(spec)
    ringed_pylon(buf, style, mats, 0.0, 0.0, SKYWAY_Z - 3.4, lod)
    rail_beam(buf, style, mats, -hx, hx, 0.0, SKYWAY_Z, lod, axis="x")
    return SKYWAY_Z + 2.4


def form_sky_curve(buf, spec, style, mats, lod, rng, scale):
    """N to E. The pylon sits under the apex of the curve where the load is."""
    hx, hy = footprint(spec)
    # W to N. Pylon under the apex, where the load is.
    ringed_pylon(buf, style, mats, -hx * 0.42, hy * 0.42, SKYWAY_Z - 3.4, lod)
    rail_beam(buf, style, mats, -hx, -hx * 0.30, 0.0, SKYWAY_Z, lod, axis="x")
    rail_beam(buf, style, mats, hy * 0.30, hy, 0.0, SKYWAY_Z, lod, axis="y")
    arc_run(buf, "rail_beam", mats["deck"], -hx * 0.30, hy * 0.30, hy * 0.30,
            math.pi, math.pi * 1.5, SKYWAY_Z, RAIL_HALF, 3.4, 5 if lod == 0 else 3)
    return SKYWAY_Z + 2.4


def form_sky_junction(buf, spec, style, mats, lod, rng, scale):
    hx, hy = footprint(spec)
    ringed_pylon(buf, style, mats, 0.0, 0.0, SKYWAY_Z - 3.4, lod, radius=4.4)
    rail_beam(buf, style, mats, -hx, hx, 0.0, SKYWAY_Z, lod, axis="x")
    rail_beam(buf, style, mats, 0.0, hy, 0.0, SKYWAY_Z, lod, axis="y")
    if lod < 2:
        buf.mass("junction_node", mats["armour"],
                 octagon(0.0, 0.0, RAIL_HALF * 1.9, RAIL_HALF * 1.9, 1.2),
                 octagon(0.0, 0.0, RAIL_HALF * 1.6, RAIL_HALF * 1.6, 1.0),
                 SKYWAY_Z - 1.9, SKYWAY_Z + 2.2)
    return SKYWAY_Z + 2.4


def form_sky_station(buf, spec, style, mats, lod, rng, scale):
    """A 2x1 station: platform, canopy, and a core dropping to street level so
    the thing is reachable."""
    hx, hy = footprint(spec)
    ringed_pylon(buf, style, mats, -hx * 0.5, 0.0, SKYWAY_Z - 3.4, lod, radius=4.0)
    ringed_pylon(buf, style, mats, hx * 0.5, 0.0, SKYWAY_Z - 3.4, lod, radius=4.0)
    rail_beam(buf, style, mats, -hx, hx, 0.0, SKYWAY_Z, lod, axis="x")
    plat_half = hy * 0.52
    buf.box("platform", mats["deck"], (0.0, 0.0, SKYWAY_Z + 1.9), (hx * 1.9, plat_half * 2.0, 1.0))
    if lod < 2:
        add_deck_plating(buf, style, mats, 0.0, 0.0, hx * 0.94, plat_half * 0.9,
                         SKYWAY_Z + 2.4, lod, rng, "stn", cell=7.0)
        for sgn in (-1.0, 1.0):
            add_railing(buf, style, mats, -hx, hx, sgn * plat_half, SKYWAY_Z + 2.4, lod, rng,
                        "stn%d" % int(sgn), axis="x", lamps=3)
        # canopy on columns
        for i in range(4):
            t = -hx * 0.72 + (hx * 1.44) * (i / 3.0)
            for sgn in (-1.0, 1.0):
                buf.box("canopy_col", mats["trim"], (t, sgn * plat_half * 0.72, SKYWAY_Z + 5.4),
                        (0.7, 0.7, 5.0))
        buf.box("canopy", mats["armour"], (0.0, 0.0, SKYWAY_Z + 8.2),
                (hx * 1.95, plat_half * 1.9, 0.8))
        if style["emissive"] > 0.0:
            buf.box("window_emissive", "emissive", (0.0, 0.0, SKYWAY_Z + 7.6),
                    (hx * 1.7, 0.35, 0.3))
        # access core down to grade
        mega_shell(buf, style, mats, hx * 0.72, -plat_half * 0.4, 4.6, 4.6,
                   GRADE_Z, SKYWAY_Z + 1.9, lod, rng, "core", course=8.0,
                   glaze_sides=["S", "E"], inset=style["inset"] * 0.4)
    return SKYWAY_Z + 8.6


def form_sky_pylon(buf, spec, style, mats, lod, rng, scale):
    """Support only: for spanning gaps where no rail tile sits."""
    hx, hy = footprint(spec)
    ringed_pylon(buf, style, mats, 0.0, 0.0, SKYWAY_Z, lod, radius=4.6)
    if lod < 2:
        for sgn in (-1.0, 1.0):
            buf.box("pylon_arm", mats["armour"], (0.0, sgn * 7.0, SKYWAY_Z - 1.0),
                    (RAIL_HALF * 2.6, 3.0, 2.0))
        if style["emissive"] > 0.0:
            buf.cyl("warning_light", "hazard", (0.0, 0.0, SKYWAY_Z + 1.4), 0.6, 1.2, 6)
    return SKYWAY_Z + 2.0


# ---------------------------------------------------------------------------
# elevated road
# ---------------------------------------------------------------------------
def form_fly_straight(buf, spec, style, mats, lod, rng, scale):
    hx, hy = footprint(spec)
    ringed_pylon(buf, style, mats, 0.0, 0.0, FLYOVER_Z - 3.0, lod, radius=4.0)
    road_deck(buf, style, mats, -hx, hx, 0.0, FLYOVER_Z, lod, axis="x")
    return FLYOVER_Z + 1.8


def form_fly_curve(buf, spec, style, mats, lod, rng, scale):
    hx, hy = footprint(spec)
    ringed_pylon(buf, style, mats, -hx * 0.42, hy * 0.42, FLYOVER_Z - 3.0, lod, radius=4.0)
    road_deck(buf, style, mats, -hx, -hx * 0.30, 0.0, FLYOVER_Z, lod, axis="x")
    road_deck(buf, style, mats, hy * 0.30, hy, 0.0, FLYOVER_Z, lod, axis="y")
    arc_run(buf, "road_deck", mats["deck"], -hx * 0.30, hy * 0.30, hy * 0.30,
            math.pi, math.pi * 1.5, FLYOVER_Z - 1.5, ROAD_HALF, 3.0, 6 if lod == 0 else 3)
    return FLYOVER_Z + 1.8


def form_fly_merge(buf, spec, style, mats, lod, rng, scale):
    hx, hy = footprint(spec)
    ringed_pylon(buf, style, mats, 0.0, 0.0, FLYOVER_Z - 3.0, lod, radius=4.4)
    road_deck(buf, style, mats, -hx, hx, 0.0, FLYOVER_Z, lod, axis="x")
    # slip road peeling off to the north
    arc_run(buf, "road_deck", mats["deck"], hx * 0.30, hy * 0.62, hy * 0.62,
            math.pi * 1.5, math.pi * 2.0, FLYOVER_Z - 1.5, ROAD_HALF * 0.62, 3.0,
            6 if lod == 0 else 3)
    road_deck(buf, style, mats, hy * 0.62, hy, hx * 0.92, FLYOVER_Z, lod, axis="y",
              half_w=ROAD_HALF * 0.62)
    return FLYOVER_Z + 1.8


def form_fly_ramp(buf, spec, style, mats, lod, rng, scale):
    """Down to the ground kit's paving level. W end at grade, E end elevated."""
    hx, hy = footprint(spec)
    low = GRADE_Z + 1.2
    sloped_slab(buf, "road_deck", mats["deck"], -hx, hx, low, FLYOVER_Z, ROAD_HALF, 3.0)
    for sgn in (-1.0, 1.0):
        sloped_slab(buf, "road_barrier", mats["armour"], -hx, hx, low + 1.9, FLYOVER_Z + 1.9,
                    1.0, 2.0, offset=sgn * ROAD_HALF)
    for i, px in enumerate((-hx * 0.2, hx * 0.55)):
        f = (px + hx) / (2.0 * hx)
        top = low + (FLYOVER_Z - low) * f - 3.0
        if top - GRADE_Z > 2.0:
            ringed_pylon(buf, style, mats, px, 0.0, top, lod, radius=3.6)
    if lod == 0:
        ribs = 8
        for i in range(ribs):
            x = -hx + (2.0 * hx) * ((i + 0.5) / ribs)
            f = (x + hx) / (2.0 * hx)
            buf.box("lane_marking", "ochre", (x, 0.0, low + (FLYOVER_Z - low) * f + 0.12),
                    (3.0, 0.5, 0.14))
    return FLYOVER_Z + 1.9


def form_fly_interchange(buf, spec, style, mats, lod, rng, scale):
    """Two decks crossing at different heights with connector loops -- the
    reference cityscapes always have one of these as a landmark."""
    hx, hy = footprint(spec)
    upper = FLYOVER_Z + 10.0
    ringed_pylon(buf, style, mats, 0.0, 0.0, upper - 3.0, lod, radius=5.4, base_r=11.0)
    road_deck(buf, style, mats, -hy, hy, 0.0, FLYOVER_Z, lod, axis="y")
    road_deck(buf, style, mats, -hx, hx, 0.0, upper, lod, axis="x")
    for sgn in (-1.0, 1.0):
        ringed_pylon(buf, style, mats, sgn * hx * 0.66, sgn * hy * 0.66, FLYOVER_Z - 3.0,
                     lod, radius=3.6)
    if lod < 2:
        loops = 2 if lod == 1 else 4
        for i in range(loops):
            a0 = math.pi * 0.5 * i
            cx = math.cos(a0 + math.pi * 0.25) * hx * 0.52
            cy = math.sin(a0 + math.pi * 0.25) * hy * 0.52
            arc_run(buf, "road_deck", mats["deck"], cx, cy, hx * 0.30,
                    a0, a0 + math.pi * 0.75,
                    FLYOVER_Z + 5.0, ROAD_HALF * 0.55, 2.6, 6 if lod == 0 else 3)
    return upper + 1.8


# ---------------------------------------------------------------------------
# map edge
# ---------------------------------------------------------------------------
def _city_plate(buf, style, mats, hx, y0, y1, lod, rng, tag):
    """The built plate on the city side, at grade."""
    cy = (y0 + y1) * 0.5
    half = (y1 - y0) * 0.5
    # 7 m deep, not 2. An edge piece is holding a city up; a thin slab reads
    # as a sheet of card no matter how good the wall under it is.
    buf.box("city_plate", mats["deck"], (0.0, cy, GRADE_Z - 3.5), (hx * 2.0, half * 2.0, 7.0))
    if lod < 2:
        add_deck_plating(buf, style, mats, 0.0, cy, hx * 0.96, half * 0.9, GRADE_Z,
                         lod, rng, tag, cell=8.0)


def _revetment(buf, style, mats, hx, y, lod, z_hi=GRADE_Z, z_lo=None, thick=9.0):
    """The megawall itself: a heavily battered mass, full tile width so two
    edge pieces form one unbroken face along a map boundary."""
    z_lo = GRADE_Z - EDGE_DROP if z_lo is None else z_lo
    ch = style["chamfer"]
    buf.mass("revetment", mats["wall"],
             octagon(0.0, y - thick * 0.75, hx, thick * 0.75, ch),
             octagon(0.0, y - thick * 0.30, hx, thick * 0.30, ch * 0.8), z_lo, z_hi)
    if lod < 2:
        buf.box("revetment_cap", mats["armour"], (0.0, y - thick * 0.32, z_hi - 0.4),
                (hx * 2.0, thick * 0.9, 1.0))


def form_edge_wall(buf, spec, style, mats, lod, rng, scale):
    hx, hy = footprint(spec)
    _city_plate(buf, style, mats, hx, 0.0, hy, lod, rng, "ew")
    _revetment(buf, style, mats, hx, 0.0, lod)
    if lod < 2:
        add_panel_lines(buf, style, mats, 0.0, -2.4, hx, 2.4, GRADE_Z - EDGE_DROP, GRADE_Z,
                        ["S"], lod, rng, "ewface", inset=0.0, cell=5.0, density=0.42,
                        chamfer=style["chamfer"] * 0.3)
        for sgn in (-1.0, 1.0):
            buf.box("service_ladder", "grate", (sgn * hx * 0.55, -3.1, GRADE_Z - EDGE_DROP * 0.5),
                    (1.4, 0.4, EDGE_DROP))
    return GRADE_Z, GRADE_Z - EDGE_DROP


def form_edge_corner(buf, spec, style, mats, lod, rng, scale):
    """The boundary turning a corner: plate in the NE quadrant, revetment on
    both open faces."""
    hx, hy = footprint(spec)
    ch = style["chamfer"]
    buf.box("city_plate", mats["deck"], (-hx * 0.5, hy * 0.5, GRADE_Z - 3.5),
            (hx, hy, 7.0))
    _revetment(buf, style, mats, hx * 0.5, 0.0, lod)
    buf.mass("revetment", mats["wall"],
             octagon(0.0 + 3.75, hy * 0.5, 3.75, hy * 0.5, ch),
             octagon(0.0 + 1.5, hy * 0.5, 1.5, hy * 0.5, ch * 0.8),
             GRADE_Z - EDGE_DROP, GRADE_Z)
    if lod < 2:
        add_deck_plating(buf, style, mats, -hx * 0.5, hy * 0.5, hx * 0.46, hy * 0.46,
                         GRADE_Z, lod, rng, "ec", cell=8.0)
        buf.box("revetment_cap", mats["armour"], (1.6, hy * 0.5, GRADE_Z - 0.4),
                (4.0, hy, 1.0))
    return GRADE_Z, GRADE_Z - EDGE_DROP


def form_edge_buttress(buf, spec, style, mats, lod, rng, scale):
    """Megawall carried on huge raking buttresses -- the read that says the
    plate above is very heavy."""
    hx, hy = footprint(spec)
    _city_plate(buf, style, mats, hx, 0.0, hy, lod, rng, "eb")
    _revetment(buf, style, mats, hx, 0.0, lod, thick=4.0)
    ch = style["chamfer"]
    n = 3 if lod < 2 else 1
    for i in range(n):
        t = -hx * 0.62 + (hx * 1.24) * (i / float(max(1, n - 1)))
        buf.mass("buttress", mats["wall"],
                 octagon(t, -9.5, 4.0, 8.0, ch),
                 octagon(t, -2.6, 2.6, 2.6, ch * 0.7),
                 GRADE_Z - EDGE_DROP, GRADE_Z - 2.0)
    return GRADE_Z, GRADE_Z - EDGE_DROP


def form_edge_terrace(buf, spec, style, mats, lod, rng, scale):
    """Stepped terraces instead of one face, for where the city meets a slope."""
    hx, hy = footprint(spec)
    _city_plate(buf, style, mats, hx, hy * 0.45, hy, lod, rng, "et")
    steps = 4 if lod == 0 else (2 if lod == 1 else 1)
    ch = style["chamfer"]
    for i in range(steps):
        f0, f1 = i / float(steps), (i + 1) / float(steps)
        z = GRADE_Z - EDGE_DROP * f1
        y0 = hy * 0.45 - (hy * 1.45) * f0
        y1 = hy * 0.45 - (hy * 1.45) * f1
        buf.mass("terrace_step", mats["wall"],
                 octagon(0.0, (y0 + y1) * 0.5, hx, abs(y1 - y0) * 0.5, ch),
                 octagon(0.0, (y0 + y1) * 0.5, hx, abs(y1 - y0) * 0.5, ch),
                 z, z + EDGE_DROP / steps + 1.2)
        if lod < 2:
            buf.box("terrace_cap", mats["armour"], (0.0, y1 + 0.6, z + EDGE_DROP / steps + 1.0),
                    (hx * 2.0, 1.4, 0.6))
    return GRADE_Z, GRADE_Z - EDGE_DROP


def form_edge_tunnel(buf, spec, style, mats, lod, rng, scale):
    """A portal through the revetment, at the ground kit's 20 m carriageway."""
    hx, hy = footprint(spec)
    clear_h = 11.0
    _city_plate(buf, style, mats, hx, 0.0, hy, lod, rng, "eu")
    ch = style["chamfer"]
    pier = hx - ROAD_HALF
    for sgn in (-1.0, 1.0):
        px = sgn * (ROAD_HALF + pier * 0.5)
        buf.mass("revetment", mats["wall"],
                 octagon(px, -3.75, pier * 0.5, 3.75, ch),
                 octagon(px, -1.5, pier * 0.5, 1.5, ch * 0.8),
                 GRADE_Z - EDGE_DROP, GRADE_Z)
    buf.mass("revetment", mats["wall"],
             octagon(0.0, -3.75, ROAD_HALF + pier * 0.3, 3.75, ch),
             octagon(0.0, -1.5, ROAD_HALF + pier * 0.2, 1.5, ch * 0.8),
             GRADE_Z - EDGE_DROP + clear_h, GRADE_Z)
    if lod < 2:
        buf.box("portal_frame", mats["armour"],
                (0.0, -1.2, GRADE_Z - EDGE_DROP + clear_h + 1.0),
                (ROAD_HALF * 2.0 + 3.0, 6.0, 2.0))
        for sgn in (-1.0, 1.0):
            buf.box("portal_frame", mats["armour"],
                    (sgn * ROAD_HALF, -1.2, GRADE_Z - EDGE_DROP + clear_h * 0.5),
                    (1.6, 6.0, clear_h))
        buf.box("portal_void", "slot", (0.0, -2.6, GRADE_Z - EDGE_DROP + clear_h * 0.5),
                (ROAD_HALF * 1.9, 3.0, clear_h * 0.96))
        if style["emissive"] > 0.0:
            for sgn in (-1.0, 1.0):
                buf.box("window_emissive", "emissive",
                        (sgn * (ROAD_HALF - 1.0), -4.2, GRADE_Z - EDGE_DROP + clear_h - 1.2),
                        (0.3, 0.3, clear_h * 0.6))
    return GRADE_Z, GRADE_Z - EDGE_DROP


def form_edge_outfall(buf, spec, style, mats, lod, rng, scale):
    """Service portal and drainage: pipes leaving the plate through the wall."""
    hx, hy = footprint(spec)
    _city_plate(buf, style, mats, hx, 0.0, hy, lod, rng, "eo")
    _revetment(buf, style, mats, hx, 0.0, lod)
    if lod < 2:
        for i in range(3):
            t = -hx * 0.5 + hx * 0.5 * i
            buf.cyl("outfall_pipe", "metal", (t, -6.0, GRADE_Z - EDGE_DROP * 0.62),
                    2.2, 12.0, 10)
            buf.mass("outfall_mouth", mats["armour"],
                     octagon(t, -4.2, 3.0, 3.0, 0.8),
                     octagon(t, -4.2, 2.4, 2.4, 0.6),
                     GRADE_Z - EDGE_DROP * 0.62 - 3.4, GRADE_Z - EDGE_DROP * 0.62 + 3.4)
            buf.box("stain", "verdigris", (t, -3.4, GRADE_Z - EDGE_DROP * 0.82),
                    (3.4, 0.3, EDGE_DROP * 0.36))
        buf.box("service_ladder", "grate", (hx * 0.72, -3.1, GRADE_Z - EDGE_DROP * 0.5),
                (1.4, 0.4, EDGE_DROP))
    return GRADE_Z, GRADE_Z - EDGE_DROP


def form_edge_dock(buf, spec, style, mats, lod, rng, scale):
    """Quay: the plate meets water rather than terrain. The waterline sits at
    the engine's own sea level so this drops straight into a coastal map."""
    hx, hy = footprint(spec)
    water_z = GRADE_Z - EDGE_DROP * 0.62
    _city_plate(buf, style, mats, hx, 0.0, hy, lod, rng, "ed")
    _revetment(buf, style, mats, hx, 0.0, lod, z_lo=water_z - 7.0, thick=5.6)
    if lod < 2:
        buf.box("quay_edge", mats["armour"], (0.0, -1.0, GRADE_Z - 1.2), (hx * 2.0, 5.0, 1.6))
        for i in range(5):
            t = -hx * 0.8 + (hx * 1.6) * (i / 4.0)
            buf.mass("bollard", mats["trim"],
                     octagon(t, -0.4, 1.1, 1.1, 0.35),
                     octagon(t, -0.4, 0.8, 0.8, 0.28), GRADE_Z, GRADE_Z + 2.2)
        for i in range(3):
            t = -hx * 0.6 + (hx * 1.2) * (i / 2.0)
            buf.box("fender", mats["trim"], (t, -3.4, water_z + 3.0), (3.0, 1.0, 7.0))
        add_railing(buf, style, mats, -hx, hx, hy * 0.7, GRADE_Z, lod, rng, "dock",
                    axis="x", lamps=3)
        buf.box("water_plane", "water", (0.0, -hy * 0.55, water_z), (hx * 2.0, hy * 0.9, 0.4))
    return GRADE_Z + 2.2, water_z - 7.0


def form_edge_ramp(buf, spec, style, mats, lod, rng, scale):
    """Vehicle access from the plate down to terrain level."""
    hx, hy = footprint(spec)
    low = GRADE_Z - EDGE_DROP
    _city_plate(buf, style, mats, hx, hy * 0.55, hy, lod, rng, "er")
    _revetment(buf, style, mats, hx * 0.30, 0.0, lod)
    sloped_slab(buf, "ramp_deck", mats["deck"], -hy * 0.55, hy * 0.55, low, GRADE_Z,
                ROAD_HALF * 0.8, 2.8, axis="y", offset=hx * 0.55)
    for sgn in (-1.0, 1.0):
        sloped_slab(buf, "road_barrier", mats["armour"], -hy * 0.55, hy * 0.55,
                    low + 1.8, GRADE_Z + 1.8, 0.9, 1.9, axis="y",
                    offset=hx * 0.55 + sgn * (ROAD_HALF * 0.8 + 0.9))
    if lod < 2:
        for i in range(2):
            buf.mass("pylon", mats["wall"],
                     octagon(hx * 0.55, -hy * 0.2 + i * hy * 0.5, 3.4, 3.4, 1.0),
                     octagon(hx * 0.55, -hy * 0.2 + i * hy * 0.5, 2.4, 2.4, 0.8),
                     low, GRADE_Z - 6.0)
    return GRADE_Z, low


FORMS = {
    "sky_straight": form_sky_straight, "sky_curve": form_sky_curve,
    "sky_junction": form_sky_junction, "sky_station": form_sky_station,
    "sky_pylon": form_sky_pylon,
    "fly_straight": form_fly_straight, "fly_curve": form_fly_curve,
    "fly_merge": form_fly_merge, "fly_ramp": form_fly_ramp,
    "fly_interchange": form_fly_interchange,
    "edge_wall": form_edge_wall, "edge_corner": form_edge_corner,
    "edge_buttress": form_edge_buttress, "edge_terrace": form_edge_terrace,
    "edge_tunnel": form_edge_tunnel, "edge_outfall": form_edge_outfall,
    "edge_dock": form_edge_dock, "edge_ramp": form_edge_ramp,
}

# Transit forms return a single top; edge forms return (top, bottom).
EDGE_FORMS = {"edge_wall", "edge_corner", "edge_buttress", "edge_terrace",
              "edge_tunnel", "edge_outfall", "edge_dock", "edge_ramp"}


# ---------------------------------------------------------------------------
# module assembly
# ---------------------------------------------------------------------------
BEVEL_ROLES = {"pylon", "pylon_head", "pylon_ring", "pylon_arm", "rail_beam",
               "road_deck", "road_barrier", "platform", "canopy", "junction_node",
               "revetment", "revetment_cap", "buttress", "terrace_step", "terrace_cap",
               "portal_frame", "outfall_mouth", "quay_edge", "bollard", "city_plate",
               "ramp_deck", "shell_mass", "spandrel", "window_drum", "cornice",
               "base_block", "canopy_col"}


def create_module(master, spec, style_id, materials):
    style = STYLES[style_id]
    module_key = style_id + "_" + spec["id"]
    rng = Rng(SCHEMA, style_id, spec["id"])
    scale = ruin_scale(spec, style, rng)
    hx, hy = footprint(spec)
    cells_x, cells_y = spec["cells"]
    mats = {"wall": style_id + "_wall", "trim": style_id + "_trim",
            "deck": style_id + "_deck", "armour": style_id + "_armour"}

    module_collection = linked_collection(master, PREFIX + "_" + module_key.upper())
    root = create_empty(module_collection, PREFIX + "_ROOT_" + module_key, None)
    root.location = (spec["layout"][0] * LAYOUT_PITCH_X + STYLE_LAYOUT_OFFSET[style_id],
                     -spec["layout"][1] * LAYOUT_PITCH_Y, 0.0)
    root["mf_asset_kind"] = "transit_or_edge"
    root["mf_module_id"] = module_key
    root["mf_archetype"] = spec["id"]
    root["mf_style"] = style_id
    root["mf_transit_class"] = spec["class"]
    root["mf_grid_m"] = GRID_M
    root["mf_cells"] = json.dumps(list(spec["cells"]), separators=(",", ":"))
    root["mf_edges"] = json.dumps(spec["edges"], separators=(",", ":"), sort_keys=True)
    if spec["class"] == "skyway":
        root["mf_deck_z"] = SKYWAY_Z
        root["mf_rail_width_m"] = RAIL_HALF * 2.0
    elif spec["class"] == "flyover":
        root["mf_deck_z"] = FLYOVER_Z
        root["mf_carriageway_width_m"] = ROAD_HALF * 2.0
    else:
        root["mf_city_z"] = GRADE_Z
        root["mf_terrain_z"] = GRADE_Z - EDGE_DROP
        root["mf_edge_drop_m"] = EDGE_DROP

    lod_records, role_triangles = [], {}
    top_z, bottom_z = 0.0, 0.0
    for lod in range(3):
        lod_collection = linked_collection(
            module_collection, PREFIX + "_" + module_key.upper() + "_LOD%d" % lod)
        buf = GeoBuf()
        shaped = FORMS[spec["form"]](buf, spec, style, mats, lod, rng, scale)
        if isinstance(shaped, tuple):
            top_z, bottom_z = shaped
        else:
            top_z, bottom_z = shaped, GRADE_Z
        bevel_width, bevel_segments = style["bevel"]
        lod_triangles = 0
        for (role, material_key), (vertices, faces) in sorted(buf.buckets.items()):
            obj = mesh_object(lod_collection,
                              "%s_%s_LOD%d_%s" % (PREFIX, module_key, lod, role.upper()),
                              vertices, faces, materials[material_key], root)
            tag_geometry(obj, role, lod)
            obj["mf_material_role"] = material_key
            if lod == 0 and role in BEVEL_ROLES:
                bevel_geometry(obj, bevel_width, bevel_segments)
            triangles = triangle_count(obj)
            lod_triangles += triangles
            if lod == 0:
                role_triangles[role] = role_triangles.get(role, 0) + triangles
        lod_records.append({"lod": lod, "triangles": lod_triangles})

    sockets = []
    for direction in ("N", "E", "S", "W"):
        dx, dy, angle = CARDINALS[direction]
        z = SKYWAY_Z if spec["class"] == "skyway" else (
            FLYOVER_Z if spec["class"] == "flyover" else GRADE_Z)
        socket = create_empty(module_collection,
                              "%s_%s_SOCKET_%s" % (PREFIX, module_key.upper(), direction),
                              root, (dx * cells_x * HALF_GRID_M, dy * cells_y * HALF_GRID_M, z),
                              "ARROWS")
        socket.rotation_euler[2] = angle
        socket["mf_role"] = "transit_socket"
        socket["mf_direction"] = direction
        socket["mf_socket_type"] = spec["edges"][direction]
        socket["mf_grid_m"] = GRID_M
        # what height this edge presents, so a placer never joins a skyway to a
        # flyover or a city plate to the low side of an edge piece
        if spec["form"] == "fly_ramp":
            socket["mf_edge_z"] = FLYOVER_Z if direction == "E" else GRADE_Z
        elif spec["class"] == "edge":
            socket["mf_edge_z"] = GRADE_Z if direction in ("N", "E", "W") else bottom_z
        else:
            socket["mf_edge_z"] = z
        socket["mf_carries"] = spec["class"]
        sockets.append(socket)

    nav = create_empty(module_collection, "%s_%s_NAV" % (PREFIX, module_key.upper()), root,
                       display="CIRCLE")
    nav["mf_role"] = "navigation_metadata"
    nav["mf_passable_beneath"] = spec["class"] in ("skyway", "flyover")
    nav["mf_deck_z"] = float(root.get("mf_deck_z", GRADE_Z))

    collision_collection = linked_collection(
        module_collection, PREFIX + "_" + module_key.upper() + "_COLLISION")
    verts, faces = [], []
    if spec["class"] == "edge":
        append_box(verts, faces, (0.0, hy * 0.5, GRADE_Z - 1.2), (hx * 2.0, hy, 2.4))
        append_box(verts, faces, (0.0, -1.9, (GRADE_Z + bottom_z) * 0.5),
                   (hx * 2.0, 7.5, GRADE_Z - bottom_z))
    else:
        deck = SKYWAY_Z if spec["class"] == "skyway" else FLYOVER_Z
        append_box(verts, faces, (0.0, 0.0, deck - 1.5),
                   (hx * 2.0, (RAIL_HALF if spec["class"] == "skyway" else ROAD_HALF) * 2.0, 3.4))
        append_box(verts, faces, (0.0, 0.0, (GRADE_Z + deck) * 0.5), (9.0, 9.0, deck - GRADE_Z))
    collision = mesh_object(collision_collection,
                            "%s_%s_COLLISION" % (PREFIX, module_key.upper()),
                            verts, faces, None, root)
    collision.display_type = "WIRE"
    collision.hide_render = True
    collision["mf_role"] = "simplified_collision"

    all_objects = [root] + descendants(root)
    for obj in all_objects:
        if obj.get("mf_lod", 0) > 0:
            obj.hide_render = True
    bpy.context.view_layer.update()
    return {"spec": spec, "style": style_id, "key": module_key, "root": root,
            "objects": all_objects, "sockets": sockets, "collision": collision,
            "lods": lod_records, "roleTriangles": role_triangles,
            "topZ": top_z, "bottomZ": bottom_z}


BLOCK_PROOFS = (
    {"id": "skyway_run", "style": "brutalist", "row": 0,
     "items": ["skyway_station", "skyway_straight", "skyway_junction", "skyway_curve"]},
    {"id": "flyover_run", "style": "brutalist", "row": 1,
     "items": ["flyover_ramp", "flyover_straight", "flyover_interchange", "flyover_merge"]},
    {"id": "city_edge", "style": "colonial", "row": 2,
     "items": ["edge_corner", "edge_megawall", "edge_tunnel", "edge_buttress", "edge_terrace"]},
    {"id": "waterfront", "style": "colonial", "row": 3,
     "items": ["edge_dock", "edge_outfall", "edge_ramp"]},
)
PROOF_ORIGIN_X = -1200.0
PROOF_ROW_PITCH = 220.0


def build_block_proof(master, modules):
    by_key = {m["key"]: m for m in modules}
    proof_collection = linked_collection(master, PREFIX + "_TILING_PROOF")
    rows = []
    for proof in BLOCK_PROOFS:
        row_collection = linked_collection(proof_collection,
                                           PREFIX + "_PROOF_" + proof["id"].upper())
        cursor, placed, hi, lo = 0.0, [], -1e9, 1e9
        for item in proof["items"]:
            module = by_key.get(proof["style"] + "_" + item)
            if module is None:
                continue
            cells_x, _ = module["spec"]["cells"]
            wx = PROOF_ORIGIN_X + (cursor + cells_x * 0.5) * GRID_M
            wy = -proof["row"] * PROOF_ROW_PITCH
            hi = max(hi, module["topZ"])
            lo = min(lo, module["bottomZ"])
            for source in module["objects"]:
                if source.type != "MESH" or int(source.get("mf_lod", 0)) != 0:
                    continue
                if source.get("mf_role") == "simplified_collision":
                    continue
                copy = source.copy()
                copy.parent = None
                copy.matrix_world = source.matrix_world.copy()
                copy.location = (source.location.x + wx, source.location.y + wy,
                                 source.location.z)
                copy["mf_proof_only"] = True
                copy.hide_render = False
                row_collection.objects.link(copy)
                placed.append(copy)
            cursor += cells_x
        rows.append({"id": proof["id"], "style": proof["style"], "items": proof["items"],
                     "spanCells": cursor, "spanM": cursor * GRID_M,
                     "centre": (PROOF_ORIGIN_X + cursor * GRID_M * 0.5,
                                -proof["row"] * PROOF_ROW_PITCH),
                     "hi": hi, "lo": lo, "objects": placed})
    return proof_collection, rows


def add_evidence_rig(master):
    helpers = linked_collection(master, PREFIX + "_EVIDENCE_RIG")
    bpy.ops.mesh.primitive_plane_add(size=9000.0, location=(0.0, 0.0, GRADE_Z - EDGE_DROP - 1.0))
    floor = bpy.context.object
    for c in list(floor.users_collection):
        c.objects.unlink(floor)
    helpers.objects.link(floor)
    floor.name = PREFIX + "_EVIDENCE_FLOOR"
    floor.data["mf_schema"] = SCHEMA
    fm = make_material("t_evidence_floor", (0.048, 0.055, 0.060, 1.0), 0.04, 0.9)
    fm["mf_evidence_only"] = True
    floor.data.materials.append(fm)
    floor["mf_evidence_only"] = True

    def area(name, loc, energy, size, color):
        data = bpy.data.lights.new(PREFIX + "_" + name, "AREA")
        data["mf_schema"] = SCHEMA
        data.energy, data.shape, data.size, data.color = energy, "DISK", size, color
        obj = bpy.data.objects.new(PREFIX + "_" + name, data)
        helpers.objects.link(obj)
        obj.location = loc
        obj.rotation_euler = (Vector((0.0, 0.0, 0.0)) - obj.location).to_track_quat("-Z", "Y").to_euler()
        obj["mf_evidence_only"] = True
        return obj

    area("KEY", (150.0, 140.0, 220.0), 62000.0, 130.0, (0.76, 0.89, 1.0))
    area("FILL", (-120.0, 90.0, 150.0), 36000.0, 110.0, (0.30, 0.55, 0.88))
    area("RIM", (-70.0, -160.0, 170.0), 48000.0, 100.0, (1.0, 0.48, 0.20))
    cam_data = bpy.data.cameras.new(PREFIX + "_CAMERA")
    cam_data["mf_schema"] = SCHEMA
    cam_data.type = "ORTHO"
    cam_data.clip_start = 1.0
    cam_data.clip_end = 15000.0
    camera = bpy.data.objects.new(PREFIX + "_CAMERA", cam_data)
    helpers.objects.link(camera)
    camera["mf_evidence_only"] = True
    bpy.context.scene.camera = camera
    return helpers, camera


configure_render = _SUP["configure_render"]
MODULE_VIEWS = {"iso_ne": (1.15, 1.15, 0.85), "top": (0.0, 0.001, 1.0),
                "edge": (0.2, -1.0, 0.22)}


def point_camera(camera, target, direction, ortho_scale):
    direction = Vector(direction).normalized()
    target = Vector(target)
    camera.location = target + direction * (ortho_scale * 3.0)
    camera.rotation_euler = (target - camera.location).to_track_quat("-Z", "Y").to_euler()
    camera.data.ortho_scale = ortho_scale


def set_visibility(modules, proof_rows, visible_key=None, proof_id=None, style_only=None):
    for module in modules:
        if visible_key is not None:
            vis = module["key"] == visible_key
        elif proof_id is not None:
            vis = False
        elif style_only is not None:
            vis = module["style"] == style_only
        else:
            vis = True
        for obj in module["objects"]:
            if obj.type != "MESH":
                continue
            obj.hide_render = (not vis or obj.get("mf_role") == "simplified_collision"
                               or int(obj.get("mf_lod", 0)) > 0)
    for row in proof_rows:
        for obj in row["objects"]:
            obj.hide_render = not (proof_id is not None and row["id"] == proof_id)


def render_evidence(config, modules, proof_rows, camera):
    evidence_dir = Path(config["evidence_dir"])
    evidence_dir.mkdir(parents=True, exist_ok=True)
    scene = bpy.context.scene
    renders = []
    generated = {o for m in modules for o in m["objects"]}
    generated.update(o for r in proof_rows for o in r["objects"])
    generated.update(o for o in scene.objects if o.get("mf_evidence_only"))
    generated.add(camera)
    unrelated = [(o, o.hide_render) for o in scene.objects if o not in generated]
    for o, _ in unrelated:
        o.hide_render = True

    def shoot(path, target, direction, scale):
        point_camera(camera, target, direction, scale)
        scene.render.filepath = str(path)
        bpy.ops.render.render(write_still=True)
        renders.append(path.relative_to(REPO_ROOT).as_posix())

    try:
        for style_id in config["styles"]:
            sm = [m for m in modules if m["style"] == style_id]
            if not sm:
                continue
            set_visibility(modules, proof_rows, style_only=style_id)
            cx = sum(m["root"].location.x for m in sm) / len(sm)
            cy = sum(m["root"].location.y for m in sm) / len(sm)
            shoot(evidence_dir / ("mf-transit-kit-v1-overview-%s.png" % style_id),
                  (cx, cy, 12.0), (1.1, 1.1, 0.95), 380.0)
        for module in modules:
            set_visibility(modules, proof_rows, visible_key=module["key"])
            cells_x, cells_y = module["spec"]["cells"]
            extent = max(cells_x, cells_y) * GRID_M
            height = module["topZ"] - module["bottomZ"]
            scale = max(extent * 1.30, height * 1.45, 46.0)
            target = (module["root"].location.x, module["root"].location.y,
                      (module["topZ"] + module["bottomZ"]) * 0.5)
            for view in config["evidence_views"]:
                shoot(evidence_dir / ("mf-trn-%s-%s.png"
                                      % (module["key"].replace("_", "-"), view)),
                      target, MODULE_VIEWS[view], scale)
        if config["render_block_proof"]:
            for row in proof_rows:
                set_visibility(modules, proof_rows, proof_id=row["id"])
                cx, cy = row["centre"]
                scale = max(row["spanM"] * 1.10, (row["hi"] - row["lo"]) * 1.9, 140.0)
                mid = (row["hi"] + row["lo"]) * 0.45
                shoot(evidence_dir / ("mf-tiling-%s-iso.png" % row["id"].replace("_", "-")),
                      (cx, cy, mid), (0.85, 1.05, 0.72), scale)
                shoot(evidence_dir / ("mf-tiling-%s-elevation.png" % row["id"].replace("_", "-")),
                      (cx, cy, mid), (0.0, -1.0, 0.13), scale)
        set_visibility(modules, proof_rows)
        return renders
    finally:
        for o, original in unrelated:
            o.hide_render = original


def export_modules(config, modules):
    export_dir = Path(config["export_dir"])
    export_dir.mkdir(parents=True, exist_ok=True)
    outputs = []
    for module in modules:
        root = module["root"]
        original = root.location.copy()
        root.location = (0.0, 0.0, 0.0)
        selected = [root] + descendants(root)
        hidden = [(o, o.hide_render, o.hide_viewport) for o in selected]
        bpy.ops.object.select_all(action="DESELECT")
        for o in selected:
            o.hide_render = False
            o.hide_viewport = False
            o.select_set(True)
        bpy.context.view_layer.objects.active = root
        out = export_dir / ("mf-trn-%s.glb" % module["key"].replace("_", "-"))
        bpy.ops.export_scene.gltf(filepath=str(out), export_format="GLB", use_selection=True,
                                  export_apply=True, export_extras=True, export_cameras=False,
                                  export_lights=False, export_yup=True)
        for o, hr, hv in hidden:
            o.hide_render, o.hide_viewport = hr, hv
        root.location = original
        outputs.append({
            "module": module["key"],
            "path": out.resolve().relative_to(REPO_ROOT).as_posix(),
        })
    return outputs


def build_report(config, modules, proof_rows, exports, renders):
    records = []
    for module in modules:
        spec = module["spec"]
        records.append({
            "id": module["key"], "archetype": spec["id"], "style": module["style"],
            "transitClass": spec["class"], "form": spec["form"],
            "cells": list(spec["cells"]),
            "topZ": round(module["topZ"], 2), "bottomZ": round(module["bottomZ"], 2),
            "sockets": [{"name": s.name, "direction": s["mf_direction"],
                         "type": s["mf_socket_type"],
                         "edgeZ": round(float(s["mf_edge_z"]), 2),
                         "carries": s["mf_carries"]} for s in module["sockets"]],
            "lods": module["lods"],
            "geometryRoleTriangles": dict(sorted(module["roleTriangles"].items())),
            "collision": {"triangles": triangle_count(module["collision"])},
        })
    lod0 = [r["lods"][0]["triangles"] for r in records]
    report = {
        "format": SCHEMA, "version": 1, "units": "metres", "deterministic": True,
        "generator": "tools/blender/build-mf-transit-kit.py",
        "sharesVocabularyWith": ["tools/blender/build-mf-superstructure-kit.py",
                                 "tools/blender/build-mf-modular-building-kit.py"],
        "blenderVersion": bpy.app.version_string,
        "datums": {"gradeZ": GRADE_Z, "flyoverZ": FLYOVER_Z, "skywayZ": SKYWAY_Z,
                   "edgeDropM": EDGE_DROP, "carriagewayWidthM": ROAD_HALF * 2.0,
                   "railWidthM": RAIL_HALF * 2.0},
        "contract": {
            "placementGridM": GRID_M,
            "notes": [
                "Skyway and flyover run at two separate heights so the systems can "
                "cross without a bespoke piece.",
                "Carriageway is 20 m, matching the ground kit and every gate in the "
                "building and superstructure kits.",
                "Every socket declares mf_edge_z and mf_carries, so a placer cannot "
                "join a skyway to a flyover or a city plate to the low side of an edge.",
            ]},
        "styles": {s: {"label": BASE_STYLES[s]["label"],
                       "modules": len([m for m in modules if m["style"] == s])}
                   for s in config["styles"]},
        "classes": sorted({a["class"] for a in ARCHETYPES}),
        "moduleCount": len(records),
        "triangleSummary": {
            "lod0Total": sum(lod0), "lod0Min": min(lod0) if lod0 else 0,
            "lod0Max": max(lod0) if lod0 else 0,
            "lod0Mean": round(sum(lod0) / float(len(lod0)), 1) if lod0 else 0,
            "lod1Total": sum(r["lods"][1]["triangles"] for r in records),
            "lod2Total": sum(r["lods"][2]["triangles"] for r in records)},
        "tilingProof": [{"id": r["id"], "style": r["style"], "items": r["items"]}
                        for r in proof_rows],
        "modules": records, "exports": exports, "evidenceRenders": renders,
        "blend": (Path(config["blend_path"]).resolve().relative_to(REPO_ROOT).as_posix()
                  if config["save_blend"] else None),
        "runtimeIntegration": {"state": "SOURCE_CANDIDATE",
                               "note": "Nothing registered in boot.js or manifest.json."},
    }
    path = Path(config["report_path"])
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(report, indent=2), encoding="utf-8")
    return report


def build_transit_kit(overrides=None):
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
    helpers, camera = add_evidence_rig(master)
    configure_render(config)
    set_visibility(modules, proof_rows)
    exports = export_modules(config, modules) if config["export_glb"] else []
    renders = render_evidence(config, modules, proof_rows, camera) \
        if config["render_evidence"] else []
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
    return json.loads(Path(tail[0]).read_text(encoding="utf-8")) if tail else None


if __name__ == "__main__":
    summary = build_transit_kit(arguments())
    print("%s: %d modules, LOD0 %d tris"
          % (summary["format"], summary["moduleCount"],
             summary["triangleSummary"]["lod0Total"]))
