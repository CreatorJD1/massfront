"""Author MASSFRONT's CITY FORMS and INDUSTRIAL kit in Blender.

The silhouettes and the dressing the other four kits do not cover: cylindrical
drum towers, mega-slabs at 3x3 and 4x4, domes, and the industrial props that
fill the space between big masses. Twenty-four forms in three style sets =
72 modules.

WHY. Everything built so far is rectangular and between 12 m and 292 m on a 1x1
or 2x2 plot. The references are full of things that kit cannot make: round
concrete drums with banded glazing, flat-topped megastructures several cells
across, domes, cooling towers, chimney stacks, pipe bundles on trestles, gantry
cranes, tank farms. Without them a map is one shape repeated.

It imports the SUPERSTRUCTURE kit's vocabulary (which imports the building
kit's), so the party-plane rules, banded shells, cornices, panel lines,
railings and deck plating all come from one place.

CLI:
  blender --background --python tools/blender/build-mf-cityforms-kit.py -- CONFIG.json
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
add_roof_plant = _LIB["add_roof_plant"]
add_mast = _LIB["add_mast"]
add_fins = _LIB["add_fins"]
add_armour = _LIB["add_armour"]
add_greebles = _LIB["add_greebles"]

annulus = _SUP["annulus"]
sloped_slab = _SUP["sloped_slab"]
add_railing = _SUP["add_railing"]
add_deck_plating = _SUP["add_deck_plating"]
mega_shell = _SUP["mega_shell"]
mega_cornice = _SUP["mega_cornice"]
mega_base = _SUP["mega_base"]

GRID_M = _LIB["GRID_M"]
HALF_GRID_M = _LIB["HALF_GRID_M"]
BAY_M = _LIB["BAY_M"]
FLOOR_M = _LIB["FLOOR_M"]
PLINTH_M = _LIB["PLINTH_M"]
JOINT_M = _LIB["JOINT_M"]
CARDINALS = _LIB["CARDINALS"]
BASE_STYLES = _LIB["STYLES"]

SCHEMA = "MassfrontCityFormsKitV1"
PREFIX = "MF_FORMS_V1"
MASTER_COLLECTION = PREFIX + "_SOURCE"


def _scale_style(base):
    style = dict(base)
    style["chamfer"] = base["chamfer"] * 1.45
    style["inset"] = base["inset"] * 1.05
    style["cornice"] = base["cornice"] * 1.25
    style["bevel"] = (base["bevel"][0] * 1.4, base["bevel"][1])
    return style


STYLES = {name: _scale_style(base) for name, base in BASE_STYLES.items()}

OPEN4 = {"N": "open", "E": "open", "S": "open", "W": "open"}
SVC4 = {"N": "service", "E": "service", "S": "service", "W": "service"}
STREET_N = {"N": "street", "E": "service", "S": "service", "W": "service"}

ARCHETYPES = (
    # ---- round + non-rectangular silhouettes ------------------------------
    {"id": "drum_tower", "cells": (1, 1), "form": "drum", "class": "form",
     "layout": (0, 0), "height": 96.0, "edges": dict(STREET_N)},
    {"id": "drum_tower_tall", "cells": (1, 1), "form": "drum_tall", "class": "form",
     "layout": (1, 0), "height": 158.0, "edges": dict(STREET_N)},
    {"id": "drum_cluster", "cells": (2, 2), "form": "drum_cluster", "class": "form",
     "layout": (2, 0), "height": 132.0, "edges": dict(SVC4)},
    {"id": "hex_tower", "cells": (1, 1), "form": "hex", "class": "form",
     "layout": (4, 0), "height": 112.0, "edges": dict(STREET_N)},
    {"id": "blade_tower", "cells": (1, 1), "form": "blade", "class": "form",
     "layout": (5, 0), "height": 140.0, "edges": dict(STREET_N)},
    {"id": "dome_small", "cells": (1, 1), "form": "dome", "class": "form",
     "layout": (6, 0), "height": 26.0, "edges": dict(SVC4)},

    {"id": "dome_large", "cells": (2, 2), "form": "dome_large", "class": "form",
     "layout": (0, 1), "height": 48.0, "edges": dict(SVC4)},
    {"id": "mega_slab", "cells": (3, 3), "form": "mega_slab", "class": "form",
     "layout": (2, 1), "height": 62.0,
     "edges": {"N": "street", "E": "party_wall", "S": "service", "W": "party_wall"}},
    {"id": "mega_slab_stepped", "cells": (4, 4), "form": "mega_stepped", "class": "form",
     "layout": (5, 1), "height": 96.0,
     "edges": {"N": "street", "E": "party_wall", "S": "party_wall", "W": "party_wall"}},
    {"id": "podium_block", "cells": (2, 2), "form": "podium", "class": "form",
     "layout": (9, 1), "height": 34.0,
     "edges": {"N": "street", "E": "street", "S": "party_wall", "W": "party_wall"}},
    {"id": "stack_terraced", "cells": (2, 2), "form": "terraced", "class": "form",
     "layout": (11, 1), "height": 84.0,
     "edges": {"N": "street", "E": "party_wall", "S": "service", "W": "party_wall"}},
    {"id": "bridge_block", "cells": (2, 1), "form": "bridge_block", "class": "form",
     "layout": (13, 1), "height": 104.0,
     "edges": {"N": "street", "E": "party_wall", "S": "service", "W": "party_wall"}},

    # ---- industrial dressing ---------------------------------------------
    {"id": "cooling_tower", "cells": (1, 1), "form": "cooling", "class": "industry",
     "layout": (0, 2), "height": 78.0, "edges": dict(SVC4)},
    {"id": "chimney_stack", "cells": (1, 1), "form": "chimney", "class": "industry",
     "layout": (1, 2), "height": 124.0, "edges": dict(SVC4)},
    {"id": "flare_stack", "cells": (1, 1), "form": "flare", "class": "industry",
     "layout": (2, 2), "height": 68.0, "edges": dict(SVC4)},
    {"id": "silo_bank", "cells": (1, 1), "form": "silo", "class": "industry",
     "layout": (3, 2), "height": 42.0, "edges": dict(SVC4)},
    {"id": "tank_cluster", "cells": (1, 1), "form": "tanks", "class": "industry",
     "layout": (4, 2), "height": 26.0, "edges": dict(SVC4)},
    {"id": "substation", "cells": (1, 1), "form": "substation", "class": "industry",
     "layout": (5, 2), "height": 22.0, "edges": dict(SVC4)},

    {"id": "pipe_trestle", "cells": (1, 1), "form": "pipe_run", "class": "industry",
     "layout": (0, 3), "height": 16.0,
     "edges": {"N": "service", "E": "open", "S": "service", "W": "open"}},
    {"id": "pipe_corner", "cells": (1, 1), "form": "pipe_corner", "class": "industry",
     "layout": (1, 3), "height": 16.0,
     "edges": {"N": "open", "E": "service", "S": "service", "W": "open"}},
    {"id": "conveyor", "cells": (2, 1), "form": "conveyor", "class": "industry",
     "layout": (2, 3), "height": 30.0,
     "edges": {"N": "service", "E": "open", "S": "service", "W": "open"}},
    {"id": "gantry_crane", "cells": (2, 1), "form": "gantry", "class": "industry",
     "layout": (4, 3), "height": 38.0, "edges": dict(SVC4)},
    {"id": "antenna_farm", "cells": (1, 1), "form": "antenna", "class": "industry",
     "layout": (6, 3), "height": 44.0, "edges": dict(SVC4)},
    {"id": "container_yard", "cells": (1, 1), "form": "containers", "class": "industry",
     "layout": (7, 3), "height": 14.0, "edges": dict(SVC4)},
)

LAYOUT_PITCH_X = 130.0
LAYOUT_PITCH_Y = 220.0
STYLE_LAYOUT_OFFSET = {"colonial": 0.0, "brutalist": 2200.0, "ruined": 4400.0}


def default_config():
    repo = Path(__file__).resolve().parents[2]
    output = (repo / "modules" / "space_exploration" / "assets" / "source" / "blender"
              / "world-kits" / "mf-cityforms-kit-v1")
    return {
        "blend_path": str(output / "mf-cityforms-kit-v1.blend"),
        "export_dir": str(output / "exports"),
        "evidence_dir": str(output / "evidence"),
        "report_path": str(output / "mf-cityforms-kit-v1-report.json"),
        "styles": list(STYLES),
        "save_blend": True, "export_glb": True, "render_evidence": True,
        "render_block_proof": True, "render_resolution": 768,
        "evidence_views": ["iso_ne", "top", "entry"],
    }


def merged_config(overrides=None):
    config = default_config()
    if overrides:
        unknown = sorted(set(overrides) - set(config))
        if unknown:
            raise ValueError("unknown cityforms-kit config keys: " + ", ".join(unknown))
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
        "metal": make_material("f_metal", (0.098, 0.120, 0.142, 1.0), 0.78, 0.28),
        "service": make_material("f_service", (0.052, 0.066, 0.078, 1.0), 0.60, 0.34),
        "slot": make_material("f_slot", (0.036, 0.040, 0.044, 1.0), 0.18, 0.76),
        "recess": make_material("f_recess", (0.086, 0.090, 0.088, 1.0), 0.22, 0.72),
        "grate": make_material("f_grate", (0.232, 0.244, 0.238, 1.0), 0.52, 0.52),
        "rubble": make_material("f_rubble", (0.322, 0.308, 0.282, 1.0), 0.06, 0.88),
        "rust": make_material("f_rust", (0.402, 0.196, 0.132, 1.0), 0.24, 0.78),
        "ochre": make_material("f_ochre", (0.548, 0.412, 0.156, 1.0), 0.16, 0.72),
        "verdigris": make_material("f_verdigris", (0.176, 0.348, 0.336, 1.0), 0.20, 0.70),
        "foliage": make_material("f_foliage", (0.148, 0.268, 0.142, 1.0), 0.04, 0.90),
        "glazing": make_material("f_glazing", (0.026, 0.238, 0.312, 0.46), 0.20, 0.14, alpha=0.46),
        "emissive": make_material("f_emissive", (0.015, 0.45, 0.58, 1.0), 0.08, 0.22,
                                  emission=((0.01, 0.72, 1.0, 1.0), 5.6)),
        "hazard": make_material("f_hazard", (0.92, 0.39, 0.025, 1.0), 0.10, 0.42,
                                emission=((1.0, 0.17, 0.008, 1.0), 0.32)),
    }
    for style_id, style in STYLES.items():
        wall = style["wall"]
        materials[style_id + "_wall"] = make_material("f_" + style_id + "_wall", wall, 0.08, 0.74)
        materials[style_id + "_trim"] = make_material("f_" + style_id + "_trim", style["trim"], 0.18, 0.58)
        materials[style_id + "_deck"] = make_material("f_" + style_id + "_deck", style["deck"], 0.46, 0.46)
        armour = tuple(min(1.0, c * 1.10 + 0.11) for c in wall[:3]) + (1.0,)
        materials[style_id + "_armour"] = make_material("f_" + style_id + "_armour", armour, 0.30, 0.50)
    return materials


def footprint(spec):
    cx, cy = spec["cells"]
    return cx * HALF_GRID_M - JOINT_M, cy * HALF_GRID_M - JOINT_M


def banded_sides(spec):
    return [d for d, k in spec["edges"].items() if k != "party_wall"]


def clutter_sides(spec):
    return [d for d, k in spec["edges"].items() if k in ("service", "street")]


def ruin_scale(spec, style, rng):
    return 1.0 if style["ruin"] <= 0.0 else rng.range(0.46, 0.78, "shear")


# ---------------------------------------------------------------------------
# lathe
# ---------------------------------------------------------------------------
def lathe(buf, role, material, cx, cy, profile, segs=24, cap_top=True, cap_bottom=True):
    """Revolve a (radius, z) profile.

    One primitive unlocks every round form this kit needs -- drums, domes,
    hyperboloid cooling towers, silos, tapered chimneys -- none of which the
    octagon/box vocabulary inherited from the other kits can express.
    """
    if len(profile) < 2:
        return
    verts, faces = buf._bucket(role, material)
    base = len(verts)
    for (r, z) in profile:
        for i in range(segs):
            a = math.tau * i / segs
            verts.append((cx + math.cos(a) * r, cy + math.sin(a) * r, z))
    for k in range(len(profile) - 1):
        r0, r1 = base + k * segs, base + (k + 1) * segs
        for i in range(segs):
            j = (i + 1) % segs
            faces.append((r0 + i, r0 + j, r1 + j, r1 + i))
    if cap_bottom:
        faces.append(tuple(range(base + segs - 1, base - 1, -1)))
    if cap_top:
        t = base + (len(profile) - 1) * segs
        faces.append(tuple(range(t, t + segs)))


def dome_profile(radius, height, rings):
    return [(radius * math.cos(math.pi * 0.5 * i / rings),
             height * math.sin(math.pi * 0.5 * i / rings)) for i in range(rings + 1)]


def hyperboloid_profile(r_base, r_waist, r_top, height, rings):
    out = []
    for i in range(rings + 1):
        f = i / float(rings)
        # waist at ~0.68 of the height, the classic cooling-tower proportion
        w = abs(f - 0.68) / 0.68 if f < 0.68 else (f - 0.68) / 0.32
        r = r_waist + (r_base - r_waist) * (w ** 1.8) if f < 0.68 else \
            r_waist + (r_top - r_waist) * (w ** 1.5)
        out.append((r, height * f))
    return out


def drum_bands(buf, style, mats, cx, cy, radius, z0, z1, lod, rng, tag,
               pitch=13.0, segs=24):
    """Recessed glazing bands round a drum -- the whole read of the reference
    cylindrical towers, which are otherwise featureless concrete pipes."""
    if lod >= 2:
        return
    step = pitch if lod == 0 else pitch * 2.0
    z = z0 + pitch * 0.9
    while z < z1 - pitch * 0.5:
        annulus(buf, "window_drum", "recess", cx, cy, radius * 1.002, radius * 0.93,
                z, z + 3.0, segs)
        if lod == 0:
            annulus(buf, "window_glass", "glazing", cx, cy, radius * 0.975, radius * 0.945,
                    z + 0.4, z + 2.6, segs)
            if style["emissive"] > 0.0 and rng.chance(0.5, tag, "lit", int(z)):
                annulus(buf, "window_emissive", "emissive", cx, cy,
                        radius * 0.96, radius * 0.945, z + 2.2, z + 2.5, segs)
        z += step


# ---------------------------------------------------------------------------
# city forms
# ---------------------------------------------------------------------------
def _drum(buf, spec, style, mats, lod, rng, scale, height, radius_f=0.92):
    hx, hy = footprint(spec)
    top = height * scale
    r = min(hx, hy) * radius_f
    segs = 24 if lod == 0 else (14 if lod == 1 else 10)
    lathe(buf, "base_block", mats["wall"], 0.0, 0.0,
          [(r * 1.06, 0.0), (r * 1.06, FLOOR_M * 1.6), (r, FLOOR_M * 2.4)], segs)
    lathe(buf, "shell_mass", mats["wall"], 0.0, 0.0,
          [(r, FLOOR_M * 2.4), (r * 0.965, top * 0.55), (r * 0.93, top)], segs)
    drum_bands(buf, style, mats, 0.0, 0.0, r * 0.98, FLOOR_M * 3.0, top, lod, rng, "drum")
    if lod < 2:
        annulus(buf, "cornice", mats["trim"], 0.0, 0.0, r * 0.99, r * 0.90,
                top - 2.2, top, segs)
        lathe(buf, "roof_deck", mats["deck"], 0.0, 0.0,
              [(r * 0.90, top - 1.0), (r * 0.90, top - 0.4)], segs)
        add_roof_plant(buf, style, r * 0.72, r * 0.72, top, lod, rng)
        add_mast(buf, style, r * 0.6, r * 0.6, top, lod, rng)
    return top


def form_drum(buf, spec, style, mats, lod, rng, scale):
    return _drum(buf, spec, style, mats, lod, rng, scale, spec["height"])


def form_drum_tall(buf, spec, style, mats, lod, rng, scale):
    return _drum(buf, spec, style, mats, lod, rng, scale, spec["height"], radius_f=0.74)


def form_drum_cluster(buf, spec, style, mats, lod, rng, scale):
    """Three drums of different heights sharing a podium -- ref 5 in one tile."""
    hx, hy = footprint(spec)
    top = spec["height"] * scale
    segs = 20 if lod == 0 else (12 if lod == 1 else 8)
    ch = style["chamfer"]
    buf.mass("base_block", mats["wall"],
             octagon(0.0, 0.0, hx, hy, ch),
             octagon(0.0, 0.0, hx * 0.94, hy * 0.94, ch), 0.0, FLOOR_M * 3.0)
    tallest = 0.0
    for i, (fx, fy, fr, fh) in enumerate(((-0.40, 0.34, 0.40, 1.0),
                                          (0.38, 0.30, 0.30, 0.72),
                                          (0.10, -0.42, 0.34, 0.86))):
        r = min(hx, hy) * fr
        h = top * fh
        tallest = max(tallest, h)
        lathe(buf, "shell_mass", mats["wall"], hx * fx, hy * fy,
              [(r, FLOOR_M * 2.4), (r * 0.96, h * 0.6), (r * 0.92, h)], segs)
        drum_bands(buf, style, mats, hx * fx, hy * fy, r * 0.98, FLOOR_M * 3.4, h,
                   lod, rng, "dc%d" % i)
        if lod < 2:
            annulus(buf, "cornice", mats["trim"], hx * fx, hy * fy, r * 0.99, r * 0.88,
                    h - 2.0, h, segs)
    if lod < 2:
        add_deck_plating(buf, style, mats, 0.0, 0.0, hx * 0.9, hy * 0.9,
                         FLOOR_M * 3.0, lod, rng, "dcpod")
    return tallest


def form_hex(buf, spec, style, mats, lod, rng, scale):
    """Hexagonal prism -- reads as neither round nor square, which is exactly
    the variety a rectangular kit lacks."""
    hx, hy = footprint(spec)
    top = spec["height"] * scale
    r = min(hx, hy) * 0.90
    lathe(buf, "base_block", mats["wall"], 0.0, 0.0,
          [(r * 1.08, 0.0), (r, FLOOR_M * 2.2)], 6)
    lathe(buf, "shell_mass", mats["wall"], 0.0, 0.0,
          [(r, FLOOR_M * 2.2), (r * 0.90, top)], 6)
    drum_bands(buf, style, mats, 0.0, 0.0, r * 0.97, FLOOR_M * 2.8, top, lod, rng, "hex",
               pitch=11.0, segs=6)
    if lod < 2:
        annulus(buf, "cornice", mats["trim"], 0.0, 0.0, r * 0.99, r * 0.86, top - 2.4, top, 6)
        add_roof_plant(buf, style, r * 0.6, r * 0.6, top, lod, rng)
    return top


def form_blade(buf, spec, style, mats, lod, rng, scale):
    """A thin blade slab, wide on one axis and shallow on the other."""
    hx, hy = footprint(spec)
    top = spec["height"] * scale
    sides = banded_sides(spec)
    mega_base(buf, style, mats, 0.0, 0.0, hx, hy * 0.34, lod, height=FLOOR_M * 3.0)
    mega_shell(buf, style, mats, 0.0, 0.0, hx, hy * 0.34, 0.0, top, lod, rng, "blade",
               course=10.0, glaze_sides=sides)
    add_fins(buf, style, mats, 0.0, 0.0, hx, hy * 0.34, PLINTH_M, top, sides, lod)
    mega_cornice(buf, style, mats, 0.0, 0.0, hx, hy * 0.34, top, lod)
    if lod == 0:
        add_panel_lines(buf, style, mats, 0.0, 0.0, hx, hy * 0.34, 0.0, top, sides,
                        lod, rng, "blade", cell=4.6, density=0.44,
                        chamfer=style["chamfer"] * 0.45)
    return top


def _dome(buf, spec, style, mats, lod, rng, scale, ring_lights=True):
    hx, hy = footprint(spec)
    top = spec["height"] * scale
    r = min(hx, hy) * 0.94
    segs = 28 if lod == 0 else (16 if lod == 1 else 10)
    rings = 8 if lod == 0 else (5 if lod == 1 else 3)
    lathe(buf, "base_block", mats["wall"], 0.0, 0.0,
          [(r * 1.06, 0.0), (r * 1.02, FLOOR_M * 1.4)], segs)
    lathe(buf, "dome_shell", mats["wall"], 0.0, 0.0,
          [(rr, FLOOR_M * 1.4 + zz) for (rr, zz) in dome_profile(r, top - FLOOR_M * 1.4, rings)],
          segs, cap_bottom=False)
    if lod < 2:
        annulus(buf, "cornice", mats["trim"], 0.0, 0.0, r * 1.08, r * 0.98,
                FLOOR_M * 1.1, FLOOR_M * 1.9, segs)
        # meridian ribs
        ribs = 8 if lod == 0 else 4
        for i in range(ribs):
            a = math.tau * i / ribs
            for k in range(rings):
                f0, f1 = k / float(rings), (k + 1) / float(rings)
                rr0 = r * math.cos(math.pi * 0.5 * f0)
                rr1 = r * math.cos(math.pi * 0.5 * f1)
                z0 = FLOOR_M * 1.4 + (top - FLOOR_M * 1.4) * math.sin(math.pi * 0.5 * f0)
                z1 = FLOOR_M * 1.4 + (top - FLOOR_M * 1.4) * math.sin(math.pi * 0.5 * f1)
                buf.box("dome_rib", mats["trim"],
                        (math.cos(a) * (rr0 + rr1) * 0.5, math.sin(a) * (rr0 + rr1) * 0.5,
                         (z0 + z1) * 0.5),
                        (1.2, 1.2, max(0.8, abs(z1 - z0))))
        if ring_lights and style["emissive"] > 0.0:
            annulus(buf, "window_emissive", "emissive", 0.0, 0.0, r * 0.86, r * 0.80,
                    FLOOR_M * 1.4 + (top - FLOOR_M * 1.4) * 0.30,
                    FLOOR_M * 1.4 + (top - FLOOR_M * 1.4) * 0.34, segs)
        lathe(buf, "dome_oculus", mats["armour"], 0.0, 0.0,
              [(r * 0.16, top - 0.6), (r * 0.13, top + 2.4)], segs)
    return top + 2.4


def form_dome(buf, spec, style, mats, lod, rng, scale):
    return _dome(buf, spec, style, mats, lod, rng, scale)


def form_dome_large(buf, spec, style, mats, lod, rng, scale):
    return _dome(buf, spec, style, mats, lod, rng, scale)


def form_mega_slab(buf, spec, style, mats, lod, rng, scale):
    """A 3x3 flat-topped megastructure. The references are full of these and
    the biggest thing the building kit can make is 2x2."""
    hx, hy = footprint(spec)
    top = spec["height"] * scale
    sides = banded_sides(spec)
    mega_base(buf, style, mats, 0.0, 0.0, hx, hy, lod, height=FLOOR_M * 4.0)
    mega_shell(buf, style, mats, 0.0, 0.0, hx, hy, 0.0, top, lod, rng, "slab",
               course=11.0, glaze_sides=sides)
    add_fins(buf, style, mats, 0.0, 0.0, hx, hy, PLINTH_M, top, sides, lod)
    mega_cornice(buf, style, mats, 0.0, 0.0, hx, hy, top, lod)
    if lod == 0:
        add_panel_lines(buf, style, mats, 0.0, 0.0, hx, hy, 0.0, top, sides, lod, rng,
                        "slab", cell=5.0, density=0.44, chamfer=style["chamfer"] * 0.45)
        add_armour(buf, style, mats, 0.0, 0.0, hx, hy, PLINTH_M, top * 0.6, sides, lod, rng, "slab")
        add_greebles(buf, style, mats, 0.0, 0.0, hx, hy, top * 0.5, clutter_sides(spec),
                     lod, rng, "slab")
    # dense roof plant across a very large deck
    add_roof_plant(buf, style, hx, hy, top, lod, rng)
    if lod < 2:
        for i in range(3):
            add_louvre_bank(buf, -hx * 0.5 + hx * 0.5 * i, hy * 0.45, 14.0, 9.0, top - 2.0, lod,
                            fins=9)
        add_mast(buf, style, hx, hy, top, lod, rng)
    return top


def form_mega_stepped(buf, spec, style, mats, lod, rng, scale):
    """4x4, stepped back three times -- the largest single mass in any kit."""
    hx, hy = footprint(spec)
    top = spec["height"] * scale
    sides = banded_sides(spec)
    mega_base(buf, style, mats, 0.0, 0.0, hx, hy, lod, height=FLOOR_M * 4.0)
    z, sx, sy = 0.0, hx, hy
    for i in range(3):
        step_top = top if i == 2 else top * (0.42 + 0.24 * i)
        if step_top <= z:
            continue
        mega_shell(buf, style, mats, 0.0, 0.0, sx, sy, z, step_top, lod, rng, "ms%d" % i,
                   course=12.0, glaze_sides=sides)
        mega_cornice(buf, style, mats, 0.0, 0.0, sx, sy, step_top, lod, z0=z,
                     thick=None if i == 2 else 1.6)
        if i == 0 and lod == 0:
            add_panel_lines(buf, style, mats, 0.0, 0.0, sx, sy, 0.0, step_top, sides,
                            lod, rng, "ms", cell=5.2, density=0.42,
                            chamfer=style["chamfer"] * 0.45)
            add_greebles(buf, style, mats, 0.0, 0.0, sx, sy, step_top, clutter_sides(spec),
                         lod, rng, "ms")
        ex, ey = taper_at(step_top, z, step_top, sx - style["inset"], sy - style["inset"],
                          style["batter"])
        if lod < 2:
            add_roof_plant(buf, style, ex, ey, step_top, lod, rng)
        z, sx, sy = step_top, ex * 0.78, ey * 0.78
    if lod < 2:
        add_mast(buf, style, sx, sy, z, lod, rng)
    return z


def form_podium(buf, spec, style, mats, lod, rng, scale):
    """Low block with a landscaped podium roof -- ref 6. The planting is what
    stops a city being entirely concrete."""
    hx, hy = footprint(spec)
    top = spec["height"] * scale
    sides = banded_sides(spec)
    mega_base(buf, style, mats, 0.0, 0.0, hx, hy, lod, height=FLOOR_M * 3.0)
    mega_shell(buf, style, mats, 0.0, 0.0, hx, hy, 0.0, top, lod, rng, "pod",
               course=9.0, glaze_sides=sides)
    mega_cornice(buf, style, mats, 0.0, 0.0, hx, hy, top, lod)
    if lod < 2:
        ex, ey = hx - style["inset"] - 1.2, hy - style["inset"] - 1.2
        buf.box("podium_deck", mats["deck"], (0.0, 0.0, top - 2.2), (ex * 2.0, ey * 2.0, 0.8))
        add_deck_plating(buf, style, mats, 0.0, 0.0, ex, ey, top - 1.8, lod, rng, "pod")
        for i in range(5):
            w = rng.range(6.0, 13.0, "grn", i, "w")
            d = rng.range(5.0, 11.0, "grn", i, "d")
            px = rng.range(-ex + w * 0.6, ex - w * 0.6, "grn", i, "x")
            py = rng.range(-ey + d * 0.6, ey - d * 0.6, "grn", i, "y")
            buf.mass("planting", "foliage",
                     octagon(px, py, w * 0.5, d * 0.5, 1.4),
                     octagon(px, py, w * 0.42, d * 0.42, 1.2), top - 1.8, top - 0.6)
        for sgn in (-1.0, 1.0):
            add_railing(buf, style, mats, -ex, ex, sgn * ey, top - 1.8, lod, rng,
                        "pod%d" % int(sgn), axis="x", lamps=3)
    return top


def form_terraced(buf, spec, style, mats, lod, rng, scale):
    """Stepped-back terraces with planting on each level."""
    hx, hy = footprint(spec)
    top = spec["height"] * scale
    sides = banded_sides(spec)
    mega_base(buf, style, mats, 0.0, 0.0, hx, hy, lod, height=FLOOR_M * 2.6)
    steps = 4 if lod == 0 else (2 if lod == 1 else 1)
    z, sy = 0.0, hy
    for i in range(steps):
        step_top = top * ((i + 1) / float(steps))
        mega_shell(buf, style, mats, 0.0, hy - sy, hx, sy, z, step_top, lod, rng,
                   "tr%d" % i, course=9.0, glaze_sides=["N"])
        mega_cornice(buf, style, mats, 0.0, hy - sy, hx, sy, step_top, lod, z0=z, thick=1.4)
        if lod < 2 and i < steps - 1:
            buf.mass("planting", "foliage",
                     octagon(0.0, hy - sy * 2.0 + 3.0, hx * 0.86, 2.6, 1.2),
                     octagon(0.0, hy - sy * 2.0 + 3.0, hx * 0.80, 2.2, 1.0),
                     step_top, step_top + 2.2)
        z = step_top
        sy *= 0.72
    return top


def form_bridge_block(buf, spec, style, mats, lod, rng, scale):
    """Two shafts joined by a bridging mass near the top."""
    hx, hy = footprint(spec)
    top = spec["height"] * scale
    sides = banded_sides(spec)
    mega_base(buf, style, mats, 0.0, 0.0, hx, hy, lod, height=FLOOR_M * 3.0)
    tw = hx * 0.34
    for sgn in (-1.0, 1.0):
        cx = sgn * hx * 0.62
        h = top if sgn < 0 else top * 0.86
        mega_shell(buf, style, mats, cx, 0.0, tw, hy * 0.9, 0.0, h, lod, rng,
                   "bb%d" % int(sgn), course=10.0, glaze_sides=sides)
        mega_cornice(buf, style, mats, cx, 0.0, tw, hy * 0.9, h, lod)
        if lod == 0:
            add_panel_lines(buf, style, mats, cx, 0.0, tw, hy * 0.9, 0.0, h, sides,
                            lod, rng, "bb%d" % int(sgn), cell=4.6, density=0.42,
                            chamfer=style["chamfer"] * 0.45)
    if lod < 2:
        bz = top * 0.62
        buf.mass("skybridge", mats["armour"],
                 octagon(0.0, 0.0, hx * 0.66, hy * 0.5, 1.6),
                 octagon(0.0, 0.0, hx * 0.66, hy * 0.44, 1.4), bz, bz + FLOOR_M * 2.4)
        buf.box("window_glass", "glazing", (0.0, 0.0, bz + FLOOR_M * 1.2),
                (hx * 1.30, hy * 0.92, FLOOR_M * 1.3))
    return top


# ---------------------------------------------------------------------------
# industrial dressing
# ---------------------------------------------------------------------------
def form_cooling(buf, spec, style, mats, lod, rng, scale):
    """Hyperboloid cooling tower -- one of the most recognisable industrial
    silhouettes there is, and impossible with box primitives."""
    hx, hy = footprint(spec)
    top = spec["height"] * scale
    r_base = min(hx, hy) * 0.86
    segs = 26 if lod == 0 else (14 if lod == 1 else 10)
    rings = 10 if lod == 0 else (6 if lod == 1 else 4)
    profile = hyperboloid_profile(r_base, r_base * 0.56, r_base * 0.66, top, rings)
    lathe(buf, "cooling_shell", mats["wall"], 0.0, 0.0, profile, segs,
          cap_top=False, cap_bottom=False)
    if lod < 2:
        annulus(buf, "cornice", mats["trim"], 0.0, 0.0, r_base * 0.68, r_base * 0.62,
                top - 2.0, top, segs)
        # raked inlet legs round the base
        legs = 10 if lod == 0 else 6
        for i in range(legs):
            a = math.tau * i / legs
            buf.box("inlet_leg", mats["wall"],
                    (math.cos(a) * r_base * 0.94, math.sin(a) * r_base * 0.94, 5.0),
                    (2.6, 2.6, 10.0))
        annulus(buf, "inlet_ring", mats["armour"], 0.0, 0.0, r_base * 1.0, r_base * 0.88,
                9.4, 11.4, segs)
        if style["emissive"] > 0.0:
            annulus(buf, "window_emissive", "emissive", 0.0, 0.0,
                    r_base * 0.67, r_base * 0.63, top - 1.4, top - 1.0, segs)
    return top


def form_chimney(buf, spec, style, mats, lod, rng, scale):
    hx, hy = footprint(spec)
    top = spec["height"] * scale
    r = min(hx, hy) * 0.30
    segs = 18 if lod == 0 else (12 if lod == 1 else 8)
    lathe(buf, "base_block", mats["wall"], 0.0, 0.0,
          [(r * 2.2, 0.0), (r * 1.9, FLOOR_M * 2.0), (r * 1.35, FLOOR_M * 3.4)], segs)
    lathe(buf, "chimney_shell", mats["wall"], 0.0, 0.0,
          [(r * 1.35, FLOOR_M * 3.4), (r * 0.86, top)], segs)
    if lod < 2:
        bands = 5 if lod == 0 else 3
        for i in range(bands):
            f = (i + 1) / float(bands + 1)
            z = FLOOR_M * 3.4 + (top - FLOOR_M * 3.4) * f
            rr = r * (1.35 + (0.86 - 1.35) * f)
            annulus(buf, "chimney_band", mats["armour"], 0.0, 0.0, rr * 1.14, rr * 1.02,
                    z, z + 1.6, segs)
        annulus(buf, "chimney_cap", mats["trim"], 0.0, 0.0, r * 1.02, r * 0.72,
                top - 2.0, top + 1.0, segs)
        buf.box("service_ladder", "grate", (r * 1.3, 0.0, top * 0.55), (0.6, 1.4, top * 0.8))
        if style["emissive"] > 0.0:
            for k in range(3):
                buf.cyl("warning_light", "hazard",
                        (0.0, 0.0, top * (0.55 + 0.18 * k)), r * 1.0, 0.7, segs)
    return top + 1.0


def form_flare(buf, spec, style, mats, lod, rng, scale):
    hx, hy = footprint(spec)
    top = spec["height"] * scale
    ch = style["chamfer"]
    buf.mass("base_block", mats["wall"],
             octagon(0.0, 0.0, hx * 0.34, hy * 0.34, ch),
             octagon(0.0, 0.0, hx * 0.26, hy * 0.26, ch * 0.8), 0.0, FLOOR_M * 2.0)
    # lattice mast: four legs plus bracing
    legs = ((-1, -1), (1, -1), (1, 1), (-1, 1))
    for i, (sx, sy) in enumerate(legs):
        buf.mass("mast_leg", "metal",
                 octagon(sx * hx * 0.20, sy * hy * 0.20, 0.9, 0.9, 0.3),
                 octagon(sx * hx * 0.07, sy * hy * 0.07, 0.6, 0.6, 0.2),
                 FLOOR_M * 2.0, top)
    if lod < 2:
        rungs = 8 if lod == 0 else 4
        for k in range(rungs):
            f = (k + 1) / float(rungs + 1)
            z = FLOOR_M * 2.0 + (top - FLOOR_M * 2.0) * f
            e = hx * (0.20 + (0.07 - 0.20) * f)
            for i in range(4):
                a, b = legs[i], legs[(i + 1) % 4]
                buf.box("mast_brace", "metal",
                        ((a[0] + b[0]) * 0.5 * e, (a[1] + b[1]) * 0.5 * e, z),
                        (0.5 if a[0] == b[0] else e * 2.2, 0.5 if a[1] == b[1] else e * 2.2, 0.5))
        buf.cyl("flare_tip", "metal", (0.0, 0.0, top + 3.0), 1.5, 6.0, 10)
        buf.cyl("flare_tip", "hazard", (0.0, 0.0, top + 6.4), 2.0, 1.4, 10)
    return top + 6.4


def form_silo(buf, spec, style, mats, lod, rng, scale):
    hx, hy = footprint(spec)
    top = spec["height"] * scale
    segs = 16 if lod == 0 else (10 if lod == 1 else 8)
    r = min(hx, hy) * 0.26
    for i, (fx, fy) in enumerate(((-0.46, -0.30), (0.0, -0.30), (0.46, -0.30),
                                  (-0.24, 0.36), (0.24, 0.36))):
        if lod >= 2 and i > 2:
            break
        h = top * rng.range(0.82, 1.0, "silo", i, "h")
        cx, cy = hx * fx, hy * fy
        lathe(buf, "silo_shell", mats["wall"], cx, cy,
              [(r, 0.0), (r, h * 0.86), (r * 0.94, h * 0.92), (r * 0.30, h)], segs)
        if lod < 2:
            annulus(buf, "silo_band", mats["armour"], cx, cy, r * 1.06, r * 0.98,
                    h * 0.42, h * 0.48, segs)
    if lod < 2:
        buf.box("conveyor_gallery", "metal", (0.0, -hy * 0.30, top * 0.98),
                (hx * 1.4, 2.2, 2.2))
        buf.box("service_ladder", "grate", (hx * 0.46 + r, -hy * 0.30, top * 0.45),
                (0.5, 1.2, top * 0.9))
    return top


def form_tanks(buf, spec, style, mats, lod, rng, scale):
    """Spheres and cylinders together -- a tank farm that is not just the
    building kit's row of drums."""
    hx, hy = footprint(spec)
    top = spec["height"] * scale
    segs = 18 if lod == 0 else (10 if lod == 1 else 8)
    for i, (fx, fy, fr) in enumerate(((-0.42, -0.34, 0.26), (0.34, -0.30, 0.22))):
        r = min(hx, hy) * fr
        cx, cy = hx * fx, hy * fy
        rings = 6 if lod == 0 else 4
        prof = [(r * math.sin(math.pi * k / rings), r - r * math.cos(math.pi * k / rings))
                for k in range(rings + 1)]
        lathe(buf, "sphere_tank", mats["deck"], cx, cy,
              [(pr, r * 0.9 + pz) for (pr, pz) in prof], segs,
              cap_top=False, cap_bottom=False)
        for k in range(4):
            a = math.tau * k / 4
            buf.cyl("tank_leg", "metal",
                    (cx + math.cos(a) * r * 0.7, cy + math.sin(a) * r * 0.7, r * 0.45),
                    0.5, r * 0.9, 6)
    for i, fx in enumerate((-0.30, 0.30)):
        r = min(hx, hy) * 0.22
        lathe(buf, "storage_tank", mats["deck"], hx * fx, hy * 0.44,
              [(r, 0.0), (r, top * 0.62), (r * 0.86, top * 0.68)], segs)
    if lod < 2:
        buf.box("pipe_rack", "metal", (0.0, 0.0, 6.0), (hx * 1.8, 1.2, 1.2))
        for i in range(3):
            buf.cyl("pipe_rack", "metal", (-hx * 0.5 + hx * 0.5 * i, 0.0, 3.0), 0.4, 6.0, 6)
    return top


def form_substation(buf, spec, style, mats, lod, rng, scale):
    hx, hy = footprint(spec)
    top = spec["height"] * scale
    ch = style["chamfer"]
    buf.mass("shell_mass", mats["wall"],
             octagon(0.0, -hy * 0.56, hx * 0.86, hy * 0.36, ch),
             octagon(0.0, -hy * 0.56, hx * 0.80, hy * 0.32, ch), 0.0, FLOOR_M * 3.0)
    for i in range(3):
        t = -hx * 0.52 + hx * 0.52 * i
        buf.mass("transformer", "metal",
                 octagon(t, hy * 0.10, 3.4, 3.6, 0.7),
                 octagon(t, hy * 0.10, 3.0, 3.2, 0.6), 0.0, 5.4)
        if lod < 2:
            for k in (-1, 0, 1):
                buf.cyl("insulator", mats["armour"], (t + k * 1.3, hy * 0.10, 6.6),
                        0.42, 2.2, 6)
    for sgn in (-1.0, 1.0):
        buf.mass("pylon_mast", "metal",
                 octagon(sgn * hx * 0.72, hy * 0.62, 1.3, 1.3, 0.4),
                 octagon(sgn * hx * 0.72, hy * 0.62, 0.6, 0.6, 0.25), 0.0, top)
        if lod < 2:
            for k in range(2):
                buf.box("pylon_mast", "metal",
                        (sgn * hx * 0.72, hy * 0.62, top * (0.66 + 0.2 * k)),
                        (5.6 - k * 1.6, 0.3, 0.3))
    if lod < 2 and style["emissive"] > 0.0:
        buf.box("window_emissive", "emissive", (0.0, -hy * 0.20, 4.6), (hx * 1.2, 0.22, 0.22))
    return top


def _pipe_bundle(buf, style, mats, t0, t1, other, z, lod, axis="x", count=4):
    length = abs(t1 - t0)
    mid = (t0 + t1) * 0.5
    for i in range(count):
        off = (i - (count - 1) * 0.5) * 2.4
        r = 0.85 if i % 2 == 0 else 0.62
        if axis == "x":
            buf.cyl("pipe", "metal", (mid, other + off, z + (0.4 if i % 2 else 0.0)),
                    r, length, 8)
        else:
            verts, faces = buf._bucket("pipe", "metal")
            # a Y-run pipe is a cylinder rotated; build it as a long box-ish
            # lathe would need a transform, so use a slim oriented box instead
            append_box(verts, faces, (other + off, mid, z + (0.4 if i % 2 else 0.0)),
                       (r * 2.0, length, r * 2.0))


def form_pipe_run(buf, spec, style, mats, lod, rng, scale):
    """Pipe bundle on a trestle, chaining E-W."""
    hx, hy = footprint(spec)
    top = spec["height"] * scale
    ch = style["chamfer"]
    _pipe_bundle(buf, style, mats, -hx, hx, 0.0, top - 2.0, lod, axis="x", count=5)
    trestles = 2 if lod < 2 else 1
    for i in range(trestles):
        t = -hx * 0.5 + hx * (1.0 if trestles > 1 else 0.0) * i
        for sgn in (-1.0, 1.0):
            buf.mass("trestle_leg", mats["wall"],
                     octagon(t, sgn * 6.4, 1.6, 1.6, 0.5),
                     octagon(t, sgn * 5.2, 1.1, 1.1, 0.4), 0.0, top - 2.6)
        buf.box("trestle_beam", "metal", (t, 0.0, top - 2.9), (3.0, 14.0, 1.2))
    if lod < 2:
        buf.box("pipe_wrap", mats["armour"], (0.0, 0.0, top - 2.0), (4.0, 12.0, 3.4))
        if style["emissive"] > 0.0:
            buf.box("window_emissive", "emissive", (0.0, 6.6, top - 1.0),
                    (hx * 1.8, 0.18, 0.2))
    return top


def form_pipe_corner(buf, spec, style, mats, lod, rng, scale):
    hx, hy = footprint(spec)
    top = spec["height"] * scale
    _pipe_bundle(buf, style, mats, -hx, 0.0, 0.0, top - 2.0, lod, axis="x", count=5)
    _pipe_bundle(buf, style, mats, 0.0, hy, 0.0, top - 2.0, lod, axis="y", count=5)
    buf.mass("pipe_wrap", mats["armour"],
             octagon(0.0, 0.0, 7.0, 7.0, 1.4),
             octagon(0.0, 0.0, 6.2, 6.2, 1.2), top - 3.8, top + 0.4)
    for sgn in (-1.0, 1.0):
        buf.mass("trestle_leg", mats["wall"],
                 octagon(sgn * 5.4, -5.4, 1.6, 1.6, 0.5),
                 octagon(sgn * 4.4, -4.4, 1.1, 1.1, 0.4), 0.0, top - 3.8)
    return top + 0.4


def form_conveyor(buf, spec, style, mats, lod, rng, scale):
    """Inclined conveyor gallery on trestles -- rises W to E."""
    hx, hy = footprint(spec)
    top = spec["height"] * scale
    low = 6.0
    sloped_slab(buf, "conveyor_gallery", mats["deck"], -hx, hx, low, top, 3.2, 2.6)
    if lod < 2:
        sloped_slab(buf, "conveyor_hood", mats["armour"], -hx, hx, low + 3.4, top + 3.4,
                    3.6, 1.2)
        ribs = 10 if lod == 0 else 5
        for i in range(ribs):
            f = (i + 0.5) / ribs
            x = -hx + 2.0 * hx * f
            buf.box("conveyor_rib", mats["trim"], (x, 0.0, low + (top - low) * f + 1.6),
                    (0.8, 7.6, 0.6))
    for i, fx in enumerate((-0.55, 0.10, 0.72)):
        x = hx * fx
        f = (x + hx) / (2.0 * hx)
        h = low + (top - low) * f - 3.0
        if h < 2.0:
            continue
        for sgn in (-1.0, 1.0):
            buf.mass("trestle_leg", mats["wall"],
                     octagon(x, sgn * 3.6, 1.4, 1.4, 0.45),
                     octagon(x, sgn * 2.6, 1.0, 1.0, 0.35), 0.0, h)
    return top + 3.4


def form_gantry(buf, spec, style, mats, lod, rng, scale):
    """Rail-mounted gantry crane straddling a yard."""
    hx, hy = footprint(spec)
    top = spec["height"] * scale
    span = hy * 0.78
    for sgn in (-1.0, 1.0):
        for fx in (-0.42, 0.42):
            buf.mass("gantry_leg", "metal",
                     octagon(hx * fx, sgn * span, 1.8, 1.8, 0.5),
                     octagon(hx * fx, sgn * span, 1.2, 1.2, 0.4), 0.0, top - 3.0)
        buf.box("gantry_rail", mats["trim"], (0.0, sgn * span, 0.7), (hx * 1.9, 3.4, 1.4))
    buf.box("gantry_beam", "metal", (0.0, 0.0, top - 1.6), (hx * 0.9, span * 2.2, 3.2))
    if lod < 2:
        buf.box("gantry_beam", "metal", (0.0, 0.0, top + 1.2), (hx * 0.7, span * 2.0, 1.0))
        buf.box("gantry_trolley", mats["armour"], (hx * 0.12, span * 0.30, top - 4.4),
                (5.0, 5.0, 3.4))
        buf.cyl("gantry_hook", "metal", (hx * 0.12, span * 0.30, top - 9.0), 0.4, 8.0, 6)
        for sgn in (-1.0, 1.0):
            for fx in (-0.42, 0.42):
                buf.box("gantry_brace", "metal", (hx * fx, sgn * span, top * 0.55),
                        (0.6, 4.4, top * 0.5))
        if style["emissive"] > 0.0:
            buf.cyl("warning_light", "hazard", (0.0, 0.0, top + 2.2), 0.6, 1.2, 6)
    return top + 2.2


def form_antenna(buf, spec, style, mats, lod, rng, scale):
    hx, hy = footprint(spec)
    top = spec["height"] * scale
    ch = style["chamfer"]
    buf.mass("base_block", mats["wall"],
             octagon(0.0, 0.0, hx * 0.52, hy * 0.52, ch),
             octagon(0.0, 0.0, hx * 0.46, hy * 0.46, ch * 0.8), 0.0, FLOOR_M * 2.0)
    buf.cyl("mast_antenna", "metal", (0.0, 0.0, top * 0.55), 1.2, top, 8)
    if lod < 2:
        for k in range(4):
            z = FLOOR_M * 2.0 + (top - FLOOR_M * 2.0) * (0.28 + 0.20 * k)
            buf.box("mast_antenna", "metal", (0.0, 0.0, z), (9.0 - k * 1.6, 0.4, 0.4))
        for i, (fx, fy, r) in enumerate(((-0.52, 0.36, 5.4), (0.50, 0.28, 4.2),
                                         (0.10, -0.52, 6.2))):
            cx, cy = hx * fx, hy * fy
            buf.cyl("dish_mast", "metal", (cx, cy, 5.0), 0.7, 10.0, 6)
            lathe(buf, "dish", mats["armour"], cx, cy,
                  [(r, 10.0), (r * 0.6, 12.0), (r * 0.18, 12.8)],
                  14 if lod == 0 else 8, cap_top=False)
        if style["emissive"] > 0.0:
            buf.cyl("warning_light", "hazard", (0.0, 0.0, top + 0.8), 0.6, 1.2, 6)
    return top + 0.8


def form_containers(buf, spec, style, mats, lod, rng, scale):
    """Stacked container yard -- the cheapest possible way to make an
    industrial district look used."""
    hx, hy = footprint(spec)
    top = spec["height"] * scale
    accents = ("rust", "ochre", "verdigris")
    stacks = 9 if lod == 0 else (5 if lod == 1 else 3)
    for i in range(stacks):
        w = 12.0
        d = 3.2
        px = rng.range(-hx + w * 0.6, hx - w * 0.6, "cs", i, "x")
        py = rng.range(-hy + d * 2.0, hy - d * 2.0, "cs", i, "y")
        levels = 1 + int(rng.value("cs", i, "n") * 3.0)
        rot = rng.chance(0.4, "cs", i, "r")
        for k in range(levels):
            mat = rng.pick(accents, "cs", i, k) if rng.chance(0.55, "cs", i, "acc", k) \
                else mats["deck"]
            sx, sy = (d, w) if rot else (w, d)
            buf.box("container", mat, (px, py + k * 0.05, 1.6 + k * 3.1), (sx, sy, 3.0))
    if lod < 2:
        for sgn in (-1.0, 1.0):
            buf.box("yard_barrier", mats["trim"], (0.0, sgn * hy * 0.94, 1.2),
                    (hx * 1.9, 0.9, 2.4))
        buf.mass("yard_office", mats["wall"],
                 octagon(hx * 0.70, -hy * 0.70, 4.2, 3.4, 0.6),
                 octagon(hx * 0.70, -hy * 0.70, 3.8, 3.0, 0.5), 0.0, 8.0)
    return top


FORMS = {
    "drum": form_drum, "drum_tall": form_drum_tall, "drum_cluster": form_drum_cluster,
    "hex": form_hex, "blade": form_blade, "dome": form_dome, "dome_large": form_dome_large,
    "mega_slab": form_mega_slab, "mega_stepped": form_mega_stepped,
    "podium": form_podium, "terraced": form_terraced, "bridge_block": form_bridge_block,
    "cooling": form_cooling, "chimney": form_chimney, "flare": form_flare,
    "silo": form_silo, "tanks": form_tanks, "substation": form_substation,
    "pipe_run": form_pipe_run, "pipe_corner": form_pipe_corner, "conveyor": form_conveyor,
    "gantry": form_gantry, "antenna": form_antenna, "containers": form_containers,
}


# ---------------------------------------------------------------------------
# module assembly
# ---------------------------------------------------------------------------
BEVEL_ROLES = {
    "shell_mass", "spandrel", "window_drum", "cornice", "base_block", "fin",
    "armour_plate", "hab_pod", "skybridge", "podium_deck", "planting",
    "dome_shell", "dome_rib", "dome_oculus", "cooling_shell", "inlet_leg",
    "inlet_ring", "chimney_shell", "chimney_band", "chimney_cap", "silo_shell",
    "silo_band", "sphere_tank", "storage_tank", "transformer", "pylon_mast",
    "trestle_leg", "trestle_beam", "pipe_wrap", "conveyor_gallery", "conveyor_hood",
    "gantry_leg", "gantry_beam", "gantry_rail", "gantry_trolley", "container",
    "yard_office", "yard_barrier", "mast_leg", "dish", "parapet_wall", "coping",
}


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
    root["mf_asset_kind"] = "city_form"
    root["mf_module_id"] = module_key
    root["mf_archetype"] = spec["id"]
    root["mf_style"] = style_id
    root["mf_form_class"] = spec["class"]
    root["mf_grid_m"] = GRID_M
    root["mf_cells"] = json.dumps(list(spec["cells"]), separators=(",", ":"))
    root["mf_footprint_m"] = json.dumps([cells_x * GRID_M, cells_y * GRID_M],
                                        separators=(",", ":"))
    root["mf_edges"] = json.dumps(spec["edges"], separators=(",", ":"), sort_keys=True)
    root["mf_authored_height_m"] = spec["height"]

    lod_records, role_triangles = [], {}
    top_z = 0.0
    for lod in range(3):
        lod_collection = linked_collection(
            module_collection, PREFIX + "_" + module_key.upper() + "_LOD%d" % lod)
        buf = GeoBuf()
        top_z = FORMS[spec["form"]](buf, spec, style, mats, lod, rng, scale)
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
        along = cells_x if direction in ("N", "S") else cells_y
        for index in range(along):
            t = (-along * 0.5 + index + 0.5) * GRID_M
            dx, dy, angle = CARDINALS[direction]
            loc = (t, dy * cells_y * HALF_GRID_M, 0.0) if direction in ("N", "S") \
                else (dx * cells_x * HALF_GRID_M, t, 0.0)
            name = "SOCKET_%s_%s" % (direction, index) if along > 1 else "SOCKET_" + direction
            socket = create_empty(module_collection,
                                  "%s_%s_%s" % (PREFIX, module_key.upper(), name),
                                  root, loc, "ARROWS")
            socket.rotation_euler[2] = angle
            socket["mf_role"] = "form_socket"
            socket["mf_direction"] = direction
            socket["mf_socket_type"] = spec["edges"][direction]
            socket["mf_cell_index"] = index
            socket["mf_blind"] = spec["edges"][direction] == "party_wall"
            sockets.append(socket)

    roof = create_empty(module_collection, "%s_%s_SOCKET_ROOF" % (PREFIX, module_key.upper()),
                        root, (0.0, 0.0, top_z), "SPHERE")
    roof["mf_role"] = "roof_prop_socket"
    roof["mf_height_m"] = top_z

    nav = create_empty(module_collection, "%s_%s_NAV" % (PREFIX, module_key.upper()), root,
                       display="CIRCLE")
    nav["mf_role"] = "navigation_metadata"
    nav["mf_blocks_movement"] = True

    collision_collection = linked_collection(
        module_collection, PREFIX + "_" + module_key.upper() + "_COLLISION")
    verts, faces = [], []
    append_box(verts, faces, (0.0, 0.0, top_z * 0.5),
               (hx * 2.0 - 0.4, hy * 2.0 - 0.4, top_z))
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
            "lods": lod_records, "roleTriangles": role_triangles, "topZ": top_z}


BLOCK_PROOFS = (
    {"id": "drum_district", "style": "brutalist", "row": 0,
     "items": ["drum_tower", "drum_tower_tall", "drum_cluster", "hex_tower", "blade_tower"]},
    {"id": "mega_district", "style": "colonial", "row": 1,
     "items": ["podium_block", "mega_slab", "mega_slab_stepped"]},
    {"id": "industrial_yard", "style": "colonial", "row": 2,
     "items": ["cooling_tower", "chimney_stack", "silo_bank", "tank_cluster",
               "container_yard", "substation"]},
    {"id": "service_run", "style": "brutalist", "row": 3,
     "items": ["pipe_trestle", "pipe_corner", "conveyor", "gantry_crane", "antenna_farm"]},
)
PROOF_ORIGIN_X = -2400.0
PROOF_ROW_PITCH = 300.0


def build_block_proof(master, modules):
    by_key = {m["key"]: m for m in modules}
    proof_collection = linked_collection(master, PREFIX + "_TILING_PROOF")
    rows = []
    for proof in BLOCK_PROOFS:
        row_collection = linked_collection(proof_collection,
                                           PREFIX + "_PROOF_" + proof["id"].upper())
        cursor, placed, hi = 0.0, [], 0.0
        for item in proof["items"]:
            module = by_key.get(proof["style"] + "_" + item)
            if module is None:
                continue
            cells_x, _ = module["spec"]["cells"]
            wx = PROOF_ORIGIN_X + (cursor + cells_x * 0.5) * GRID_M
            wy = -proof["row"] * PROOF_ROW_PITCH
            hi = max(hi, module["topZ"])
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
                     "hi": hi, "objects": placed})
    return proof_collection, rows


add_evidence_rig = None  # replaced below


def _make_rig(master):
    helpers = linked_collection(master, PREFIX + "_EVIDENCE_RIG")
    bpy.ops.mesh.primitive_plane_add(size=14000.0, location=(0.0, 0.0, -0.05))
    floor = bpy.context.object
    for c in list(floor.users_collection):
        c.objects.unlink(floor)
    helpers.objects.link(floor)
    floor.name = PREFIX + "_EVIDENCE_FLOOR"
    floor.data["mf_schema"] = SCHEMA
    fm = make_material("f_evidence_floor", (0.048, 0.055, 0.060, 1.0), 0.04, 0.9)
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

    area("KEY", (240.0, 220.0, 340.0), 150000.0, 200.0, (0.76, 0.89, 1.0))
    area("FILL", (-190.0, 140.0, 240.0), 88000.0, 170.0, (0.30, 0.55, 0.88))
    area("RIM", (-110.0, -250.0, 270.0), 115000.0, 150.0, (1.0, 0.48, 0.20))
    cam_data = bpy.data.cameras.new(PREFIX + "_CAMERA")
    cam_data["mf_schema"] = SCHEMA
    cam_data.type = "ORTHO"
    cam_data.clip_start = 1.0
    cam_data.clip_end = 20000.0
    camera = bpy.data.objects.new(PREFIX + "_CAMERA", cam_data)
    helpers.objects.link(camera)
    camera["mf_evidence_only"] = True
    bpy.context.scene.camera = camera
    return helpers, camera


configure_render = _SUP["configure_render"]
MODULE_VIEWS = {"iso_ne": (1.2, 1.2, 0.82), "top": (0.0, 0.001, 1.0), "entry": (0.0, 1.0, 0.30)}


def point_camera(camera, target, direction, ortho_scale):
    direction = Vector(direction).normalized()
    target = Vector(target)
    camera.location = target + direction * (ortho_scale * 3.2)
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
            shoot(evidence_dir / ("mf-cityforms-kit-v1-overview-%s.png" % style_id),
                  (cx, cy, 40.0), (1.15, 1.2, 0.92), 600.0)
        for module in modules:
            set_visibility(modules, proof_rows, visible_key=module["key"])
            cells_x, cells_y = module["spec"]["cells"]
            extent = max(cells_x, cells_y) * GRID_M
            scale = max(extent * 1.30, module["topZ"] * 1.35, 46.0)
            target = (module["root"].location.x, module["root"].location.y,
                      module["topZ"] * 0.48)
            for view in config["evidence_views"]:
                shoot(evidence_dir / ("mf-frm-%s-%s.png"
                                      % (module["key"].replace("_", "-"), view)),
                      target, MODULE_VIEWS[view], scale)
        if config["render_block_proof"]:
            for row in proof_rows:
                set_visibility(modules, proof_rows, proof_id=row["id"])
                cx, cy = row["centre"]
                scale = max(row["spanM"] * 1.12, row["hi"] * 1.7, 160.0)
                shoot(evidence_dir / ("mf-tiling-%s-iso.png" % row["id"].replace("_", "-")),
                      (cx, cy, row["hi"] * 0.42), (0.9, 1.1, 0.75), scale)
                shoot(evidence_dir / ("mf-tiling-%s-elevation.png" % row["id"].replace("_", "-")),
                      (cx, cy, row["hi"] * 0.45), (0.0, 1.0, 0.14), scale)
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
        out = export_dir / ("mf-frm-%s.glb" % module["key"].replace("_", "-"))
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
            "formClass": spec["class"], "form": spec["form"],
            "cells": list(spec["cells"]),
            "footprintM": [spec["cells"][0] * GRID_M, spec["cells"][1] * GRID_M],
            "heightM": round(module["topZ"], 2),
            "edges": spec["edges"],
            "sockets": [{"name": s.name, "direction": s["mf_direction"],
                         "type": s["mf_socket_type"]} for s in module["sockets"]],
            "lods": module["lods"],
            "geometryRoleTriangles": dict(sorted(module["roleTriangles"].items())),
            "collision": {"triangles": triangle_count(module["collision"])},
        })
    lod0 = [r["lods"][0]["triangles"] for r in records]
    report = {
        "format": SCHEMA, "version": 1, "units": "metres", "deterministic": True,
        "generator": "tools/blender/build-mf-cityforms-kit.py",
        "sharesVocabularyWith": ["tools/blender/build-mf-superstructure-kit.py",
                                 "tools/blender/build-mf-modular-building-kit.py"],
        "blenderVersion": bpy.app.version_string,
        "newPrimitives": ["lathe (revolve a radius/height profile)"],
        "contract": {"placementGridM": GRID_M, "partyJointM": JOINT_M,
                     "notes": ["Nothing crosses the party plane.",
                               "Round forms come from one lathe primitive: drums, "
                               "domes, hyperboloid cooling towers, silos, tapered "
                               "chimneys and dishes."]},
        "styles": {s: {"label": BASE_STYLES[s]["label"],
                       "modules": len([m for m in modules if m["style"] == s])}
                   for s in config["styles"]},
        "classes": sorted({a["class"] for a in ARCHETYPES}),
        "moduleCount": len(records),
        "tallestM": round(max((r["heightM"] for r in records), default=0.0), 2),
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


def build_cityforms_kit(overrides=None):
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
    helpers, camera = _make_rig(master)
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
    summary = build_cityforms_kit(arguments())
    print("%s: %d modules, tallest %.0f m, LOD0 %d tris"
          % (summary["format"], summary["moduleCount"], summary["tallestM"],
             summary["triangleSummary"]["lod0Total"]))
