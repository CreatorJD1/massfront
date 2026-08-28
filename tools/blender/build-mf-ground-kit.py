"""Author MASSFRONT's brutalist sci-fi GROUND kit in Blender.

Roads, plazas, terraces and level changes on the same 32 m grid as the building
and superstructure kits, in the same material language. Twelve tiles authored
in all three style sets = 36 modules.

WHY THIS KIT EXISTS. In the reference art the ground plane does an enormous
amount of the work: paved terraces at several levels, retaining walls, wide
steps, and above all a dense rectilinear pattern of inset groove lines across
every paved surface. A city of good buildings standing on a flat untextured
plane still reads as greybox. The repo's existing mf-modular-road-v1 predates
this art direction and does not match it.

THE GROUND CONTRACT is different from the building kit's. A building must not
CROSS the party plane; a ground tile must LAND ON IT EXACTLY on all four edges,
because tiles abut into a continuous surface with no joint at all. A tile that
stops 5 cm short shows a crack the length of the street.

Shared datums:
    PAVE_Z        0.0    the paved surface, level with building plinths
    TERRACE_DROP  6.0    one level change
    ROAD_HALF     10.0   carriageway half-width, matching the road kit's
                         20 m primary and the 20 m gate clearances in the
                         building and superstructure kits

CLI:
  blender --background --python tools/blender/build-mf-ground-kit.py -- CONFIG.json
"""

import bpy
import json
import math
import os
import runpy
import sys
from pathlib import Path
from mathutils import Vector


_LIB_PATH = Path(__file__).resolve().with_name("build-mf-modular-building-kit.py")
_LIB = runpy.run_path(str(_LIB_PATH), run_name="mf_building_kit_lib")

GeoBuf = _LIB["GeoBuf"]
Rng = _LIB["Rng"]
octagon = _LIB["octagon"]
append_box = _LIB["append_box"]
append_taper = _LIB["append_taper"]
append_cylinder = _LIB["append_cylinder"]
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
add_louvre_bank = _LIB["add_louvre_bank"]

GRID_M = _LIB["GRID_M"]
HALF_GRID_M = _LIB["HALF_GRID_M"]
BAY_M = _LIB["BAY_M"]
CARDINALS = _LIB["CARDINALS"]
BASE_STYLES = _LIB["STYLES"]

SCHEMA = "MassfrontGroundKitV1"
PREFIX = "MF_GROUND_V1"
MASTER_COLLECTION = PREFIX + "_SOURCE"

PAVE_Z = 0.0
PAVE_THICK = 1.8
TERRACE_DROP = 6.0
ROAD_HALF = 10.0
KERB_H = 0.5
KERB_W = 1.1
SERVICE_W = 2.8
# Ground tiles abut with NO joint. A building leaves 2*JOINT_M between
# neighbours; paving cannot, or every tile edge is a crack in the street.
EDGE_EPS = 0.0


def _scale_style(base):
    """Ground detail is finer than facade detail -- chamfers and grooves are
    read from directly above at close range, so the building kit's metre-scale
    values would turn a plaza into a waffle."""
    style = dict(base)
    style["chamfer"] = 0.55
    style["groove"] = 0.26
    style["bevel"] = (0.10, 1)
    return style


STYLES = {name: _scale_style(base) for name, base in BASE_STYLES.items()}

ARCHETYPES = (
    {"id": "plaza_deck", "form": "pave", "class": "plaza", "layout": (0, 0)},
    {"id": "plaza_corner", "form": "pave_corner", "class": "plaza", "layout": (1, 0)},
    {"id": "plaza_edge", "form": "pave_edge", "class": "plaza", "layout": (2, 0)},
    {"id": "plaza_steps", "form": "steps", "class": "plaza", "layout": (3, 0)},
    {"id": "plaza_ramp", "form": "ramp", "class": "plaza", "layout": (4, 0)},
    {"id": "plaza_vent", "form": "vent", "class": "plaza", "layout": (5, 0)},

    {"id": "road_straight", "form": "road", "class": "road", "layout": (0, 1)},
    {"id": "road_corner", "form": "road_corner", "class": "road", "layout": (1, 1)},
    {"id": "road_tee", "form": "road_tee", "class": "road", "layout": (2, 1)},
    {"id": "road_cross", "form": "road_cross", "class": "road", "layout": (3, 1)},
    {"id": "service_trench", "form": "trench", "class": "road", "layout": (4, 1)},
    {"id": "landing_pad", "form": "pad", "class": "plaza", "layout": (5, 1)},
)

LAYOUT_PITCH = 46.0
STYLE_LAYOUT_OFFSET = {"colonial": 0.0, "brutalist": 320.0, "ruined": 640.0}


def default_config():
    repo = Path(__file__).resolve().parents[2]
    output = (repo / "modules" / "space_exploration" / "assets" / "source" / "blender"
              / "world-kits" / "mf-ground-kit-v1")
    return {
        "blend_path": str(output / "mf-ground-kit-v1.blend"),
        "export_dir": str(output / "exports"),
        "evidence_dir": str(output / "evidence"),
        "report_path": str(output / "mf-ground-kit-v1-report.json"),
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
            raise ValueError("unknown ground-kit config keys: " + ", ".join(unknown))
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
        "metal": make_material("g_metal", (0.098, 0.120, 0.142, 1.0), 0.78, 0.28),
        "slot": make_material("g_slot", (0.036, 0.040, 0.044, 1.0), 0.18, 0.76),
        "recess": make_material("g_recess", (0.086, 0.090, 0.088, 1.0), 0.22, 0.72),
        "grate": make_material("g_grate", (0.152, 0.162, 0.158, 1.0), 0.52, 0.52),
        # add_louvre_bank is borrowed from the building kit and expects this
        # role; omitting it killed the whole run with a KeyError.
        "service": make_material("g_service", (0.052, 0.066, 0.078, 1.0), 0.60, 0.34),
        "rubble": make_material("g_rubble", (0.322, 0.308, 0.282, 1.0), 0.06, 0.88),
        "rust": make_material("g_rust", (0.402, 0.196, 0.132, 1.0), 0.24, 0.78),
        "ochre": make_material("g_ochre", (0.548, 0.412, 0.156, 1.0), 0.16, 0.72),
        "verdigris": make_material("g_verdigris", (0.176, 0.348, 0.336, 1.0), 0.20, 0.70),
        "emissive": make_material("g_emissive", (0.015, 0.45, 0.58, 1.0), 0.08, 0.22,
                                  emission=((0.01, 0.72, 1.0, 1.0), 5.0)),
        "hazard": make_material("g_hazard", (0.92, 0.39, 0.025, 1.0), 0.10, 0.42,
                                emission=((1.0, 0.17, 0.008, 1.0), 0.30)),
    }
    for style_id, style in STYLES.items():
        wall = style["wall"]
        # Paving is a touch cooler and lighter than the facades it sits between,
        # so a plaza does not disappear into the buildings around it.
        pave = tuple(min(1.0, c * 1.04 + 0.035) for c in wall[:3]) + (1.0,)
        kerb = tuple(min(1.0, c * 0.88) for c in wall[:3]) + (1.0,)
        materials[style_id + "_pave"] = make_material("g_" + style_id + "_pave", pave, 0.05, 0.80)
        materials[style_id + "_kerb"] = make_material("g_" + style_id + "_kerb", kerb, 0.10, 0.72)
        materials[style_id + "_wall"] = make_material("g_" + style_id + "_wall", wall, 0.08, 0.74)
        materials[style_id + "_road"] = make_material(
            "g_" + style_id + "_road",
            tuple(c * 0.42 for c in wall[:3]) + (1.0,), 0.10, 0.86)
    return materials


def footprint():
    return HALF_GRID_M, HALF_GRID_M


# ---------------------------------------------------------------------------
# paving
# ---------------------------------------------------------------------------
def pave_slab(buf, mats, cx, cy, hx, hy, z_top, mat=None, thick=PAVE_THICK,
              role="pave_slab"):
    """A paving slab. Deliberately a BOX, not an octagon.

    Every other kit here chamfers its masses, but a chamfered paving tile
    leaves a notch at each corner, and four tiles meeting would open a hole in
    the middle of the street. Ground tiles land on their edges square.
    """
    buf.box(role, mat or mats["pave"], (cx, cy, z_top - thick * 0.5),
            (hx * 2.0, hy * 2.0, thick))


def add_pave_lines(buf, style, mats, cx, cy, hx, hy, z, lod, rng, tag,
                   cell=6.5, keep_out=None):
    """Inset groove lines across paving.

    The single most characteristic thing about the reference ground plane: long
    thin rectilinear channels cut into the slab at a coarse pitch, in runs of
    varying length rather than a uniform grid. Without them a plaza is a flat
    field and every building standing on it looks dropped on a table.

    `keep_out` is a half-width band around x=0 to leave clear for a carriageway.
    """
    if lod > 0 or hx <= 2.0 or hy <= 2.0:
        return
    groove = style["groove"]
    width = 0.42

    def clear(t0, t1, axis_pos):
        if keep_out is None:
            return True
        return abs(axis_pos) > keep_out + 1.0

    rows = max(2, int((hy * 2.0) // cell))
    for r in range(rows):
        y = -hy + (hy * 2.0 / rows) * (r + 0.5)
        for seg in range(1 + int(rng.value(tag, "rx", r) * 2.99)):
            t0 = rng.range(-hx, hx * 0.45, tag, "x0", r, seg)
            t1 = min(hx, t0 + rng.range(hx * 0.35, hx * 1.6, tag, "xl", r, seg))
            if t1 - t0 < 2.5:
                continue
            if keep_out is not None and abs(y) < keep_out + 1.0:
                continue
            buf.box("pave_groove", "slot",
                    (cx + (t0 + t1) * 0.5, cy + y, z - groove * 0.5),
                    (t1 - t0, width, groove))
    cols = max(2, int((hx * 2.0) // cell))
    for c in range(cols):
        x = -hx + (hx * 2.0 / cols) * (c + 0.5)
        if keep_out is not None and abs(x) < keep_out + 1.0:
            continue
        for seg in range(1 + int(rng.value(tag, "ry", c) * 2.99)):
            t0 = rng.range(-hy, hy * 0.45, tag, "y0", c, seg)
            t1 = min(hy, t0 + rng.range(hy * 0.35, hy * 1.6, tag, "yl", c, seg))
            if t1 - t0 < 2.5:
                continue
            buf.box("pave_groove", "slot",
                    (cx + x, cy + (t0 + t1) * 0.5, z - groove * 0.5),
                    (width, t1 - t0, groove))

    # larger sunken bays and the occasional accent, as in the references
    for i in range(3):
        w = min(rng.range(4.0, 9.0, tag, "bw", i), hx * 1.2)
        d = min(rng.range(3.0, 7.0, tag, "bd", i), hy * 1.2)
        if w < 1.5 or d < 1.5:
            continue
        px = rng.range(-hx, hx, tag, "bx", i)
        py = rng.range(-hy, hy, tag, "by", i)
        px = max(-hx + w * 0.5, min(hx - w * 0.5, px))
        py = max(-hy + d * 0.5, min(hy - d * 0.5, py))
        if keep_out is not None and (abs(px) < keep_out + w * 0.5):
            continue
        if rng.chance(0.55, tag, "bay", i):
            buf.box("pave_bay", "recess", (cx + px, cy + py, z - groove * 1.5),
                    (w, d, groove * 3.0))
        elif rng.chance(0.35, tag, "mark", i):
            accent = rng.pick(("ochre", "rust", "verdigris"), tag, "mk", i)
            buf.box("pave_marking", accent, (cx + px, cy + py, z - 0.06),
                    (w, 0.7, 0.16))


def add_service_lids(buf, style, mats, cx, cy, hx, hy, z, lod, rng, tag, count=2):
    """Flush access covers and grates. Small, but they are what say `serviced`
    rather than `paved once and forgotten`."""
    if lod > 0:
        return
    for i in range(count):
        w = rng.range(2.2, 3.8, tag, "lw", i)
        px = rng.range(-hx * 0.72, hx * 0.72, tag, "lx", i)
        py = rng.range(-hy * 0.72, hy * 0.72, tag, "ly", i)
        buf.box("service_lid", mats["kerb"], (cx + px, cy + py, z - 0.10), (w, w * 0.72, 0.28))
        buf.box("service_lid", "grate", (cx + px, cy + py, z - 0.04), (w * 0.8, w * 0.55, 0.18))


def add_retaining(buf, style, mats, cx, half, y, z_hi, z_lo, lod, facing=-1.0):
    """A battered retaining wall holding a terrace. Runs the full tile width so
    two edge tiles side by side form one unbroken revetment."""
    height = z_hi - z_lo
    thick = 2.4
    buf.mass("retaining_wall", mats["wall"],
             octagon(cx, y + facing * thick * 0.62, half, thick * 0.62, 0.5),
             octagon(cx, y + facing * thick * 0.30, half, thick * 0.30, 0.4),
             z_lo, z_hi)
    if lod < 2:
        buf.box("retaining_cap", mats["kerb"], (cx, y + facing * thick * 0.2, z_hi - 0.25),
                (half * 2.0, thick * 0.9, 0.5))
        # buttress ribs at the bay pitch
        n = max(1, int((half * 2.0) // BAY_M))
        for i in range(n):
            t = -half + (half * 2.0 / n) * (i + 0.5)
            buf.mass("retaining_rib", mats["wall"],
                     octagon(cx + t, y + facing * thick * 1.05, 1.5, thick * 0.55, 0.35),
                     octagon(cx + t, y + facing * thick * 0.72, 1.1, thick * 0.32, 0.3),
                     z_lo, z_hi - 0.6)


def add_kerb(buf, mats, cx, cy, half, x, lod, along="y"):
    """Kerb line beside a carriageway."""
    if along == "y":
        buf.box("kerb", mats["kerb"], (cx + x, cy, PAVE_Z - KERB_H * 0.5 + KERB_H),
                (KERB_W, half * 2.0, KERB_H))
    else:
        buf.box("kerb", mats["kerb"], (cx, cy + x, PAVE_Z + KERB_H * 0.5),
                (half * 2.0, KERB_W, KERB_H))


# ---------------------------------------------------------------------------
# forms
# ---------------------------------------------------------------------------
def form_pave(buf, spec, style, mats, lod, rng):
    hx, hy = footprint()
    pave_slab(buf, mats, 0.0, 0.0, hx, hy, PAVE_Z)
    add_pave_lines(buf, style, mats, 0.0, 0.0, hx, hy, PAVE_Z, lod, rng, "plaza")
    add_service_lids(buf, style, mats, 0.0, 0.0, hx, hy, PAVE_Z, lod, rng, "plaza")
    return PAVE_Z, -PAVE_THICK


def form_pave_edge(buf, spec, style, mats, lod, rng):
    """Terrace edge: the N half sits at grade, the S half a level below, with a
    battered revetment between them."""
    hx, hy = footprint()
    lo = PAVE_Z - TERRACE_DROP
    pave_slab(buf, mats, 0.0, hy * 0.5, hx, hy * 0.5, PAVE_Z)
    pave_slab(buf, mats, 0.0, -hy * 0.5, hx, hy * 0.5, lo)
    add_pave_lines(buf, style, mats, 0.0, hy * 0.5, hx, hy * 0.5, PAVE_Z, lod, rng, "edgeHi")
    add_pave_lines(buf, style, mats, 0.0, -hy * 0.5, hx, hy * 0.5, lo, lod, rng, "edgeLo")
    add_retaining(buf, style, mats, 0.0, hx, 0.0, PAVE_Z, lo, lod)
    return PAVE_Z, lo - PAVE_THICK


def form_pave_corner(buf, spec, style, mats, lod, rng):
    """Terrace corner: high in the north-west, dropping on the S and E edges."""
    hx, hy = footprint()
    lo = PAVE_Z - TERRACE_DROP
    pave_slab(buf, mats, -hx * 0.5, hy * 0.5, hx * 0.5, hy * 0.5, PAVE_Z)
    pave_slab(buf, mats, hx * 0.5, hy * 0.5, hx * 0.5, hy * 0.5, lo)
    pave_slab(buf, mats, 0.0, -hy * 0.5, hx, hy * 0.5, lo)
    add_pave_lines(buf, style, mats, -hx * 0.5, hy * 0.5, hx * 0.5, hy * 0.5, PAVE_Z,
                   lod, rng, "cornHi")
    add_pave_lines(buf, style, mats, hx * 0.5, -hy * 0.2, hx * 0.5, hy * 0.8, lo,
                   lod, rng, "cornLo")
    add_retaining(buf, style, mats, -hx * 0.5, hx * 0.5, 0.0, PAVE_Z, lo, lod)
    # the return leg, running N-S
    thick = 2.4
    buf.mass("retaining_wall", mats["wall"],
             octagon(0.0 + thick * 0.62, hy * 0.5, thick * 0.62, hy * 0.5, 0.5),
             octagon(0.0 + thick * 0.30, hy * 0.5, thick * 0.30, hy * 0.5, 0.4),
             lo, PAVE_Z)
    if lod < 2:
        buf.box("retaining_cap", mats["kerb"], (thick * 0.2, hy * 0.5, PAVE_Z - 0.25),
                (thick * 0.9, hy, 0.5))
    return PAVE_Z, lo - PAVE_THICK


def form_steps(buf, spec, style, mats, lod, rng):
    """A wide flight down one level -- the move the references use to knit two
    terraces together."""
    hx, hy = footprint()
    lo = PAVE_Z - TERRACE_DROP
    pave_slab(buf, mats, 0.0, hy * 0.62, hx, hy * 0.38, PAVE_Z)
    pave_slab(buf, mats, 0.0, -hy * 0.55, hx, hy * 0.45, lo)
    add_pave_lines(buf, style, mats, 0.0, hy * 0.62, hx, hy * 0.38, PAVE_Z, lod, rng, "stepHi")
    add_pave_lines(buf, style, mats, 0.0, -hy * 0.55, hx, hy * 0.45, lo, lod, rng, "stepLo")
    steps = 6 if lod == 0 else (3 if lod == 1 else 2)
    run = (hy * 0.24) * 2.0
    flight_half = hx * 0.55
    for i in range(steps):
        f = (i + 1) / float(steps)
        z = PAVE_Z - TERRACE_DROP * f
        y = hy * 0.24 - run * f
        buf.box("step", mats["kerb"], (0.0, y, z + 0.35), (flight_half * 2.0, run / steps + 0.5, 0.7))
    # cheek walls either side of the flight
    for sgn in (-1.0, 1.0):
        buf.mass("step_cheek", mats["wall"],
                 octagon(sgn * (flight_half + 1.4), hy * 0.02, 1.4, hy * 0.26, 0.4),
                 octagon(sgn * (flight_half + 1.4), hy * 0.02, 1.1, hy * 0.26, 0.35),
                 lo, PAVE_Z)
    add_retaining(buf, style, mats, -hx * 0.78, hx * 0.22, 0.0, PAVE_Z, lo, lod)
    add_retaining(buf, style, mats, hx * 0.78, hx * 0.22, 0.0, PAVE_Z, lo, lod)
    return PAVE_Z, lo - PAVE_THICK


def form_ramp(buf, spec, style, mats, lod, rng):
    """Vehicle ramp between levels, at carriageway width."""
    hx, hy = footprint()
    lo = PAVE_Z - TERRACE_DROP
    pave_slab(buf, mats, 0.0, -hy * 0.5, hx, hy * 0.5, lo)
    for sgn in (-1.0, 1.0):
        pave_slab(buf, mats, sgn * (hx - (hx - ROAD_HALF) * 0.5), 0.0,
                  (hx - ROAD_HALF) * 0.5, hy, PAVE_Z)
        add_pave_lines(buf, style, mats, sgn * (hx - (hx - ROAD_HALF) * 0.5), 0.0,
                       (hx - ROAD_HALF) * 0.5, hy, PAVE_Z, lod, rng, "rampside%d" % int(sgn))
    steps = 8 if lod == 0 else (4 if lod == 1 else 2)
    for i in range(steps):
        f0, f1 = i / float(steps), (i + 1) / float(steps)
        z = PAVE_Z - TERRACE_DROP * f1
        y0 = hy - (hy * 2.0) * f0
        y1 = hy - (hy * 2.0) * f1
        # No overlap padding: treads are contiguous by construction, and the
        # padding pushed the first and last past the tile edge.
        buf.box("ramp_deck", mats["road"], (0.0, (y0 + y1) * 0.5, z + 0.4),
                (ROAD_HALF * 2.0, abs(y1 - y0), 0.8))
    for sgn in (-1.0, 1.0):
        buf.box("kerb", mats["kerb"], (sgn * (ROAD_HALF + KERB_W * 0.5), 0.0, PAVE_Z - 2.2),
                (KERB_W, hy * 2.0, 5.0))
    return PAVE_Z, lo - PAVE_THICK


def form_vent(buf, spec, style, mats, lod, rng):
    """Paving over a plant room: a sunken louvre bay you can see down into."""
    hx, hy = footprint()
    pave_slab(buf, mats, 0.0, 0.0, hx, hy, PAVE_Z)
    add_pave_lines(buf, style, mats, 0.0, 0.0, hx, hy, PAVE_Z, lod, rng, "vent")
    bw, bd = hx * 0.62, hy * 0.44
    buf.box("vent_bay", "recess", (0.0, 0.0, PAVE_Z - 1.6), (bw * 2.0, bd * 2.0, 3.0))
    if lod < 2:
        add_louvre_bank(buf, 0.0, 0.0, bw * 1.7, bd * 1.6, PAVE_Z - 2.6, lod, fins=9)
        buf.box("vent_frame", mats["kerb"], (0.0, 0.0, PAVE_Z - 0.2),
                (bw * 2.0 + 1.4, bd * 2.0 + 1.4, 0.5))
    add_service_lids(buf, style, mats, 0.0, hy * 0.72, hx * 0.8, hy * 0.2, PAVE_Z, lod, rng, "vl", 1)
    return PAVE_Z, -PAVE_THICK


def _carriageway(buf, style, mats, lod, rng, arms):
    """Shared road body. `arms` are the compass directions the carriageway
    reaches; it always lands exactly on the tile edge so roads chain."""
    hx, hy = footprint()
    deck = PAVE_Z - 0.35
    pave_slab(buf, mats, 0.0, 0.0, hx, hy, PAVE_Z)
    # verges first, then the carriageway cut into them
    add_pave_lines(buf, style, mats, 0.0, 0.0, hx, hy, PAVE_Z, lod, rng, "roadverge",
                   keep_out=ROAD_HALF + SERVICE_W)
    for arm in arms:
        if arm in ("N", "S"):
            sgn = 1.0 if arm == "N" else -1.0
            buf.box("carriageway", mats["road"], (0.0, sgn * hy * 0.5, deck),
                    (ROAD_HALF * 2.0, hy, 0.75))
        else:
            sgn = 1.0 if arm == "E" else -1.0
            buf.box("carriageway", mats["road"], (sgn * hx * 0.5, 0.0, deck),
                    (hx, ROAD_HALF * 2.0, 0.75))
    if "N" in arms or "S" in arms:
        buf.box("carriageway", mats["road"], (0.0, 0.0, deck),
                (ROAD_HALF * 2.0, ROAD_HALF * 2.0, 0.75))
    elif arms:
        buf.box("carriageway", mats["road"], (0.0, 0.0, deck),
                (ROAD_HALF * 2.0, ROAD_HALF * 2.0, 0.75))
    # kerbs on every edge the carriageway does NOT leave through
    for direction in ("N", "E", "S", "W"):
        if direction in arms:
            continue
        (ox, oy), (nx, ny), half = side_frame(direction, ROAD_HALF, ROAD_HALF)
        buf.box("kerb", mats["kerb"],
                (ox * 1.0, oy * 1.0, PAVE_Z - KERB_H * 0.5),
                (KERB_W if nx else ROAD_HALF * 2.0 + KERB_W * 2.0,
                 KERB_W if ny else ROAD_HALF * 2.0 + KERB_W * 2.0, KERB_H * 2.0))
    if lod < 2:
        # lane markings down each arm
        for arm in arms:
            if arm in ("N", "S"):
                sgn = 1.0 if arm == "N" else -1.0
                for k in range(3):
                    buf.box("lane_marking", "ochre",
                            (0.0, sgn * (ROAD_HALF + 2.0 + k * 6.0), deck + 0.42),
                            (0.55, 3.2, 0.14))
            else:
                sgn = 1.0 if arm == "E" else -1.0
                for k in range(3):
                    buf.box("lane_marking", "ochre",
                            (sgn * (ROAD_HALF + 2.0 + k * 6.0), 0.0, deck + 0.42),
                            (3.2, 0.55, 0.14))
        # service strip covers along the verges
        for sgn in (-1.0, 1.0):
            for k in range(4):
                buf.box("service_lid", "grate",
                        (sgn * (ROAD_HALF + SERVICE_W * 0.5), -hy + 6.0 + k * 6.8, PAVE_Z - 0.06),
                        (SERVICE_W * 0.7, 3.0, 0.2))
    return PAVE_Z, -PAVE_THICK


def form_road(buf, spec, style, mats, lod, rng):
    return _carriageway(buf, style, mats, lod, rng, ("N", "S"))


def form_road_corner(buf, spec, style, mats, lod, rng):
    return _carriageway(buf, style, mats, lod, rng, ("N", "E"))


def form_road_tee(buf, spec, style, mats, lod, rng):
    return _carriageway(buf, style, mats, lod, rng, ("N", "E", "W"))


def form_road_cross(buf, spec, style, mats, lod, rng):
    return _carriageway(buf, style, mats, lod, rng, ("N", "E", "S", "W"))


def form_trench(buf, spec, style, mats, lod, rng):
    """A sunken service channel running E-W, grated over. Chains end to end."""
    hx, hy = footprint()
    pave_slab(buf, mats, 0.0, 0.0, hx, hy, PAVE_Z)
    add_pave_lines(buf, style, mats, 0.0, hy * 0.62, hx, hy * 0.38, PAVE_Z, lod, rng, "trN")
    add_pave_lines(buf, style, mats, 0.0, -hy * 0.62, hx, hy * 0.38, PAVE_Z, lod, rng, "trS")
    half_w = 5.0
    buf.box("trench", "recess", (0.0, 0.0, PAVE_Z - 1.9), (hx * 2.0, half_w * 2.0, 3.4))
    if lod < 2:
        for sgn in (-1.0, 1.0):
            buf.box("trench_edge", mats["kerb"], (0.0, sgn * (half_w + 0.5), PAVE_Z - 0.35),
                    (hx * 2.0, 1.2, 0.8))
        grates = 6 if lod == 0 else 3
        for i in range(grates):
            buf.box("trench_grate", "grate",
                    (-hx + (hx * 2.0 / grates) * (i + 0.5), 0.0, PAVE_Z - 0.45),
                    ((hx * 2.0 / grates) * 0.7, half_w * 1.7, 0.3))
        for i in range(3):
            buf.cyl("trench_duct", "metal",
                    (0.0, -half_w * 0.5 + i * half_w * 0.5, PAVE_Z - 2.6),
                    0.75, hx * 2.0, 8)
    return PAVE_Z, -PAVE_THICK


def form_pad(buf, spec, style, mats, lod, rng):
    """A marked landing pad at grade."""
    hx, hy = footprint()
    pave_slab(buf, mats, 0.0, 0.0, hx, hy, PAVE_Z)
    add_pave_lines(buf, style, mats, 0.0, 0.0, hx, hy, PAVE_Z, lod, rng, "pad", cell=9.0)
    buf.box("pad_marking", "recess", (0.0, 0.0, PAVE_Z - 0.16), (hx * 1.30, hy * 1.30, 0.34))
    if lod < 2:
        buf.box("pad_marking", "ochre", (0.0, 0.0, PAVE_Z - 0.04), (hx * 1.10, 1.0, 0.20))
        buf.box("pad_marking", "ochre", (0.0, 0.0, PAVE_Z - 0.04), (1.0, hy * 1.10, 0.20))
        for k in range(8):
            a = math.tau * k / 8.0
            buf.box("approach_light", "emissive",
                    (math.cos(a) * hx * 0.80, math.sin(a) * hy * 0.80, PAVE_Z + 0.18),
                    (1.5, 1.5, 0.4))
        add_service_lids(buf, style, mats, 0.0, 0.0, hx * 0.9, hy * 0.9, PAVE_Z, lod, rng, "pad", 2)
    return PAVE_Z, -PAVE_THICK


FORMS = {
    "pave": form_pave, "pave_corner": form_pave_corner, "pave_edge": form_pave_edge,
    "steps": form_steps, "ramp": form_ramp, "vent": form_vent,
    "road": form_road, "road_corner": form_road_corner, "road_tee": form_road_tee,
    "road_cross": form_road_cross, "trench": form_trench, "pad": form_pad,
}


# ---------------------------------------------------------------------------
# module assembly
# ---------------------------------------------------------------------------
BEVEL_ROLES = {"retaining_wall", "retaining_rib", "retaining_cap", "step",
               "step_cheek", "kerb", "vent_frame", "trench_edge", "ramp_deck"}


def create_module(master, spec, style_id, materials):
    style = STYLES[style_id]
    module_key = style_id + "_" + spec["id"]
    rng = Rng(SCHEMA, style_id, spec["id"])
    hx, hy = footprint()
    mats = {"pave": style_id + "_pave", "kerb": style_id + "_kerb",
            "wall": style_id + "_wall", "road": style_id + "_road"}

    module_collection = linked_collection(master, PREFIX + "_" + module_key.upper())
    root = create_empty(module_collection, PREFIX + "_ROOT_" + module_key, None)
    root.location = (spec["layout"][0] * LAYOUT_PITCH + STYLE_LAYOUT_OFFSET[style_id],
                     -spec["layout"][1] * LAYOUT_PITCH, 0.0)
    root["mf_asset_kind"] = "ground_tile"
    root["mf_module_id"] = module_key
    root["mf_archetype"] = spec["id"]
    root["mf_style"] = style_id
    root["mf_ground_class"] = spec["class"]
    root["mf_grid_m"] = GRID_M
    root["mf_pave_z"] = PAVE_Z
    root["mf_terrace_drop_m"] = TERRACE_DROP
    if spec["class"] == "road":
        root["mf_carriageway_width_m"] = ROAD_HALF * 2.0
        root["mf_road_arms"] = json.dumps(
            {"road": ["N", "S"], "road_corner": ["N", "E"],
             "road_tee": ["N", "E", "W"], "road_cross": ["N", "E", "S", "W"],
             "trench": []}.get(spec["form"], []), separators=(",", ":"))

    lod_records, role_triangles = [], {}
    top_z, bottom_z = PAVE_Z, -PAVE_THICK
    lod0_objects = []

    for lod in range(3):
        lod_collection = linked_collection(
            module_collection, PREFIX + "_" + module_key.upper() + "_LOD%d" % lod)
        buf = GeoBuf()
        top_z, bottom_z = FORMS[spec["form"]](buf, spec, style, mats, lod, rng)
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
                lod0_objects.append(obj)
        lod_records.append({"lod": lod, "triangles": lod_triangles})

    # ---- sockets: one per edge, on the true grid plane --------------------
    sockets = []
    for direction in ("N", "E", "S", "W"):
        dx, dy, angle = CARDINALS[direction]
        socket = create_empty(module_collection,
                              "%s_%s_SOCKET_%s" % (PREFIX, module_key.upper(), direction),
                              root, (dx * HALF_GRID_M, dy * HALF_GRID_M, PAVE_Z), "ARROWS")
        socket.rotation_euler[2] = angle
        socket["mf_role"] = "ground_socket"
        socket["mf_direction"] = direction
        socket["mf_grid_m"] = GRID_M
        # Which level this edge presents, so a placer never butts a grade tile
        # against the low side of a terrace edge.
        low = spec["form"] in ("pave_edge", "steps", "ramp") and direction == "S"
        low = low or (spec["form"] == "pave_corner" and direction in ("S", "E"))
        socket["mf_edge_z"] = (PAVE_Z - TERRACE_DROP) if low else PAVE_Z
        socket["mf_carriageway"] = bool(
            spec["class"] == "road" and direction in json.loads(root.get("mf_road_arms", "[]")))
        sockets.append(socket)

    nav = create_empty(module_collection, "%s_%s_NAV" % (PREFIX, module_key.upper()), root,
                       display="CIRCLE")
    nav["mf_role"] = "navigation_metadata"
    nav["mf_walkable"] = True
    nav["mf_surface_z"] = PAVE_Z

    collision_collection = linked_collection(
        module_collection, PREFIX + "_" + module_key.upper() + "_COLLISION")
    vertices, faces = [], []
    append_box(vertices, faces, (0.0, 0.0, PAVE_Z - PAVE_THICK * 0.5),
               (hx * 2.0, hy * 2.0, PAVE_THICK))
    collision = mesh_object(collision_collection,
                            "%s_%s_COLLISION" % (PREFIX, module_key.upper()),
                            vertices, faces, None, root)
    collision.display_type = "WIRE"
    collision.hide_render = True
    collision["mf_role"] = "simplified_collision"
    collision["mf_collision_class"] = "ground_surface"

    all_objects = [root] + descendants(root)
    for obj in all_objects:
        if obj.get("mf_lod", 0) > 0:
            obj.hide_render = True
    bpy.context.view_layer.update()

    return {"spec": spec, "style": style_id, "key": module_key,
            "root": root, "objects": all_objects, "sockets": sockets,
            "collision": collision, "lods": lod_records,
            "roleTriangles": role_triangles, "topZ": top_z, "bottomZ": bottom_z}


# ---------------------------------------------------------------------------
# tiling proofs -- ground tiles form a PATCH, not a row
# ---------------------------------------------------------------------------
BLOCK_PROOFS = (
    {"id": "street_grid", "style": "brutalist", "slot": 0, "cells": [
        (0, 0, "plaza_deck"), (1, 0, "road_straight"), (2, 0, "plaza_deck"),
        (0, 1, "road_tee"), (1, 1, "road_cross"), (2, 1, "road_tee"),
        (0, 2, "plaza_deck"), (1, 2, "road_straight"), (2, 2, "landing_pad")]},
    {"id": "terrace", "style": "colonial", "slot": 1, "cells": [
        (0, 0, "plaza_deck"), (1, 0, "plaza_deck"), (2, 0, "plaza_deck"),
        (0, 1, "plaza_edge"), (1, 1, "plaza_steps"), (2, 1, "plaza_corner"),
        (0, 2, "plaza_deck"), (1, 2, "plaza_deck"), (2, 2, "plaza_deck")]},
    {"id": "service_yard", "style": "colonial", "slot": 2, "cells": [
        (0, 0, "plaza_deck"), (1, 0, "service_trench"), (2, 0, "plaza_deck"),
        (0, 1, "plaza_vent"), (1, 1, "road_straight"), (2, 1, "plaza_vent"),
        (0, 2, "plaza_deck"), (1, 2, "plaza_ramp"), (2, 2, "plaza_deck")]},
    {"id": "dead_plaza", "style": "ruined", "slot": 3, "cells": [
        (0, 0, "plaza_deck"), (1, 0, "road_cross"), (2, 0, "plaza_deck"),
        (0, 1, "plaza_steps"), (1, 1, "plaza_deck"), (2, 1, "service_trench"),
        (0, 2, "landing_pad"), (1, 2, "road_straight"), (2, 2, "plaza_edge")]},
)
PROOF_ORIGIN = (-1400.0, 0.0)
PROOF_PITCH = 180.0


def build_block_proof(master, modules):
    by_key = {m["key"]: m for m in modules}
    proof_collection = linked_collection(master, PREFIX + "_TILING_PROOF")
    rows = []
    for proof in BLOCK_PROOFS:
        row_collection = linked_collection(proof_collection,
                                           PREFIX + "_PROOF_" + proof["id"].upper())
        ox = PROOF_ORIGIN[0] + proof["slot"] * PROOF_PITCH
        oy = PROOF_ORIGIN[1]
        placed = []
        for (cx, cy, item) in proof["cells"]:
            module = by_key.get(proof["style"] + "_" + item)
            if module is None:
                continue
            # cell-exact: tiles abut with no joint at all
            wx = ox + (cx - 1) * GRID_M
            wy = oy + (1 - cy) * GRID_M
            for source in module["objects"]:
                if source.type != "MESH" or int(source.get("mf_lod", 0)) != 0:
                    continue
                if source.get("mf_role") == "simplified_collision":
                    continue
                copy = source.copy()
                copy.parent = None
                copy.matrix_world = source.matrix_world.copy()
                copy.location = (source.location.x + wx,
                                 source.location.y + wy,
                                 source.location.z)
                copy["mf_proof_only"] = True
                copy.hide_render = False
                row_collection.objects.link(copy)
                placed.append(copy)
        rows.append({"id": proof["id"], "style": proof["style"],
                     "items": sorted({c[2] for c in proof["cells"]}),
                     "centre": (ox, oy), "spanM": 3 * GRID_M, "objects": placed})
    return proof_collection, rows


# ---------------------------------------------------------------------------
# evidence
# ---------------------------------------------------------------------------
def add_evidence_rig(master):
    helpers = linked_collection(master, PREFIX + "_EVIDENCE_RIG")
    bpy.ops.mesh.primitive_plane_add(size=6000.0, location=(0.0, 0.0, -TERRACE_DROP - 2.4))
    floor = bpy.context.object
    for collection in list(floor.users_collection):
        collection.objects.unlink(floor)
    helpers.objects.link(floor)
    floor.name = PREFIX + "_EVIDENCE_FLOOR"
    floor.data["mf_schema"] = SCHEMA
    fm = make_material("g_evidence_floor", (0.045, 0.052, 0.058, 1.0), 0.04, 0.9)
    fm["mf_evidence_only"] = True
    floor.data.materials.append(fm)
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

    area("KEY", (90.0, 80.0, 130.0), 26000.0, 90.0, (0.76, 0.89, 1.0))
    area("FILL", (-70.0, 50.0, 90.0), 15000.0, 70.0, (0.30, 0.55, 0.88))
    area("RIM", (-40.0, -95.0, 100.0), 20000.0, 64.0, (1.0, 0.48, 0.20))
    cam_data = bpy.data.cameras.new(PREFIX + "_CAMERA")
    cam_data["mf_schema"] = SCHEMA
    cam_data.type = "ORTHO"
    cam_data.clip_start = 1.0
    cam_data.clip_end = 12000.0
    camera = bpy.data.objects.new(PREFIX + "_CAMERA", cam_data)
    helpers.objects.link(camera)
    camera["mf_evidence_only"] = True
    bpy.context.scene.camera = camera
    return helpers, camera


def configure_render(config):
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_WORKBENCH"
    scene.display.shading.light = "STUDIO"
    scene.display.shading.color_type = "MATERIAL"
    scene.display.shading.show_shadows = True
    scene.display.shading.show_cavity = True
    scene.display.shading.cavity_type = "BOTH"
    scene.display.shading.curvature_ridge_factor = 1.9
    scene.display.shading.curvature_valley_factor = 1.5
    scene.display.shading.background_type = "VIEWPORT"
    scene.display.shading.background_color = (0.018, 0.026, 0.034)
    scene.render.resolution_x = config["render_resolution"]
    scene.render.resolution_y = config["render_resolution"]
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.film_transparent = False
    scene.world.use_nodes = True
    bg = scene.world.node_tree.nodes.get("Background")
    if bg is not None:
        bg.inputs["Color"].default_value = (0.008, 0.014, 0.021, 1.0)
        bg.inputs["Strength"].default_value = 0.62
    if hasattr(scene.view_settings, "look"):
        try:
            scene.view_settings.look = "AgX - Medium High Contrast"
        except TypeError:
            pass


def point_camera(camera, target, direction, ortho_scale):
    direction = Vector(direction).normalized()
    target = Vector(target)
    camera.location = target + direction * (ortho_scale * 3.0)
    camera.rotation_euler = (target - camera.location).to_track_quat("-Z", "Y").to_euler()
    camera.data.ortho_scale = ortho_scale


MODULE_VIEWS = {"iso_ne": (1.1, 1.1, 0.95), "top": (0.0, 0.001, 1.0),
                "edge": (0.15, 1.0, 0.30)}


def set_visibility(modules, proof_rows, visible_key=None, proof_id=None, style_only=None):
    for module in modules:
        if visible_key is not None:
            visible = module["key"] == visible_key
        elif proof_id is not None:
            visible = False
        elif style_only is not None:
            visible = module["style"] == style_only
        else:
            visible = True
        for obj in module["objects"]:
            if obj.type != "MESH":
                continue
            obj.hide_render = (not visible or obj.get("mf_role") == "simplified_collision"
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
            style_modules = [m for m in modules if m["style"] == style_id]
            if not style_modules:
                continue
            set_visibility(modules, proof_rows, style_only=style_id)
            cx = sum(m["root"].location.x for m in style_modules) / len(style_modules)
            cy = sum(m["root"].location.y for m in style_modules) / len(style_modules)
            shoot(evidence_dir / ("mf-ground-kit-v1-overview-%s.png" % style_id),
                  (cx, cy, 0.0), (1.0, 1.0, 1.05), 190.0)
        for module in modules:
            set_visibility(modules, proof_rows, visible_key=module["key"])
            target = (module["root"].location.x, module["root"].location.y,
                      (module["topZ"] + module["bottomZ"]) * 0.5)
            for view in config["evidence_views"]:
                shoot(evidence_dir / ("mf-gnd-%s-%s.png" % (module["key"].replace("_", "-"), view)),
                      target, MODULE_VIEWS[view], 44.0)
        if config["render_block_proof"]:
            for row in proof_rows:
                set_visibility(modules, proof_rows, proof_id=row["id"])
                cx, cy = row["centre"]
                span = 3.0 * GRID_M
                shoot(evidence_dir / ("mf-tiling-%s-iso.png" % row["id"].replace("_", "-")),
                      (cx, cy, -1.5), (0.9, 1.0, 0.85), span * 1.30)
                shoot(evidence_dir / ("mf-tiling-%s-top.png" % row["id"].replace("_", "-")),
                      (cx, cy, 0.0), (0.0, 0.001, 1.0), span * 1.12)
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
        out = export_dir / ("mf-gnd-%s.glb" % module["key"].replace("_", "-"))
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
            "groundClass": spec["class"], "form": spec["form"],
            "footprintM": [GRID_M, GRID_M],
            "topZ": round(module["topZ"], 2), "bottomZ": round(module["bottomZ"], 2),
            "sockets": [{"name": s.name, "direction": s["mf_direction"],
                         "edgeZ": round(float(s["mf_edge_z"]), 2),
                         "carriageway": bool(s["mf_carriageway"])} for s in module["sockets"]],
            "lods": module["lods"],
            "geometryRoleTriangles": dict(sorted(module["roleTriangles"].items())),
            "collision": {"triangles": triangle_count(module["collision"])},
        })
    lod0 = [r["lods"][0]["triangles"] for r in records]
    report = {
        "format": SCHEMA, "version": 1, "units": "metres", "deterministic": True,
        "generator": "tools/blender/build-mf-ground-kit.py",
        "sharesVocabularyWith": "tools/blender/build-mf-modular-building-kit.py",
        "blenderVersion": bpy.app.version_string,
        "groundContract": {
            "placementGridM": GRID_M, "paveZ": PAVE_Z, "terraceDropM": TERRACE_DROP,
            "carriagewayWidthM": ROAD_HALF * 2.0, "edgeJointM": EDGE_EPS,
            "notes": [
                "Ground tiles abut with NO joint: geometry must land EXACTLY on "
                "the cell plane on all four edges, unlike buildings which stop "
                "short of it. A tile 5 cm short shows a crack the length of a street.",
                "Paving slabs are boxes, not chamfered octagons -- a chamfer would "
                "open a hole where four tiles meet.",
                "Carriageway is 20 m, matching mf-modular-road-v1 and the 20 m gate "
                "clearances in the building and superstructure kits.",
                "Every edge socket declares mf_edge_z so a placer never butts a grade "
                "tile against the low side of a terrace edge.",
            ],
        },
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


def build_ground_kit(overrides=None):
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
    summary = build_ground_kit(arguments())
    print("%s: %d tiles, LOD0 %d tris"
          % (summary["format"], summary["moduleCount"],
             summary["triangleSummary"]["lod0Total"]))
