"""Author MASSFRONT's deterministic SUPERSTRUCTURE kit in Blender.

The tier above mf-modular-building-v1: curtain walls you can run for kilometres,
skyscrapers that dominate a skyline, and platforms that stand out of the terrain
or straight out of the ocean. Fourteen archetypes authored in all three style
sets -- colonial, Nova brutalist, ruined -- for 42 modules.

SHARED CONTRACT. Same 32 m placement grid, same floor datum, same party-plane
rule as the building kit, and this file imports that kit's geometry vocabulary
rather than copying it, so the hard-won tiling fixes live in exactly one place:

    NOTHING MAY CROSS THE PARTY PLANE.

Each mass is composed inside its envelope -- a full-width base and a full-width
cornice that both return to the plane, with a recessed shaft between. Wall
segments additionally must reach the plane EXACTLY on their run axis (E/W), or a
1 km rampart shows a seam every 32 m.

ENGINE ANCHORS, read from src/engine/terrain.js rather than invented:
    WATER_Y = 0     sea level sits at world y=0 by construction (terrain.js:168)
    SEABED  = -26   the ocean bottom is floored there, so water has depth
    HSCALE  = 118   terrain vertical exaggeration; roughly the tallest landform
Ocean platforms therefore run their caissons from the deck down to -26 and are
cut by the waterline at 0. Towers are scaled against HSCALE: the 140-200 m band
reads as a big-city skyline, the 200-300 m band as genuinely towering.

The generator creates source geometry only. It does not register runtime assets
or alter an existing scene outside its own tagged collection.

CLI:
  blender --background --python tools/blender/build-mf-superstructure-kit.py -- CONFIG.json
"""

import bpy
import json
import math
import os
import runpy
import sys
import zlib
from pathlib import Path
from mathutils import Vector


# ---------------------------------------------------------------------------
# shared vocabulary
# ---------------------------------------------------------------------------
# run_name is deliberately NOT "__main__", so importing the building kit does
# not kick off a 36-module build as a side effect.
_LIB_PATH = Path(__file__).resolve().with_name("build-mf-modular-building-kit.py")
_LIB = runpy.run_path(str(_LIB_PATH), run_name="mf_building_kit_lib")

GeoBuf = _LIB["GeoBuf"]
Rng = _LIB["Rng"]
octagon = _LIB["octagon"]
append_box = _LIB["append_box"]
append_prism = _LIB["append_prism"]
append_taper = _LIB["append_taper"]
append_cylinder = _LIB["append_cylinder"]
taper_at = _LIB["taper_at"]
side_frame = _LIB["side_frame"]
make_material = _LIB["make_material"]
set_socket_value = _LIB["set_socket_value"]
mesh_object = _LIB["mesh_object"]
REPO_ROOT = Path(__file__).resolve().parents[2]
_FINISH = _LIB["_FINISH"]
bevel_geometry = _LIB["bevel_geometry"]
triangle_count = _LIB["triangle_count"]
create_empty = _LIB["create_empty"]
descendants = _LIB["descendants"]
linked_collection = _LIB["linked_collection"]
tag_geometry = _LIB["tag_geometry"]
add_fins = _LIB["add_fins"]
add_armour = _LIB["add_armour"]
add_greebles = _LIB["add_greebles"]
add_mast = _LIB["add_mast"]
add_roof_plant = _LIB["add_roof_plant"]
add_panel_lines = _LIB["add_panel_lines"]
add_louvre_bank = _LIB["add_louvre_bank"]

GRID_M = _LIB["GRID_M"]
HALF_GRID_M = _LIB["HALF_GRID_M"]
BAY_M = _LIB["BAY_M"]
FLOOR_M = _LIB["FLOOR_M"]
PLINTH_M = _LIB["PLINTH_M"]
JOINT_M = _LIB["JOINT_M"]
CARDINALS = _LIB["CARDINALS"]
BASE_STYLES = _LIB["STYLES"]

SCHEMA = "MassfrontSuperstructureKitV1"
PREFIX = "MF_SUPER_V1"
MASTER_COLLECTION = PREFIX + "_SOURCE"

# Straight from src/engine/terrain.js -- see ENGINE ANCHORS above.
WATER_Z = 0.0
SEABED_Z = -26.0
# One deck datum shared by every ocean piece that can butt another. Authoring
# these independently put the causeway 8 m under the platform it was supposed
# to serve -- the offshore elevation showed it immediately.
OCEAN_DECK_Z = 26.0
TERRAIN_HSCALE = 118.0


# ---------------------------------------------------------------------------
# styles
# ---------------------------------------------------------------------------
# Superstructures are 3-10x the size of a building module, so the building
# kit's surface knobs have to grow with them or a 290 m pylon ends up wearing
# 1.7 m chamfers it cannot show. Everything is derived from the building STYLES
# so the two kits stay recognisably the same three material languages.
def _scale_style(base):
    style = dict(base)
    style["chamfer"] = base["chamfer"] * 2.05
    style["inset"] = base["inset"] * 1.15
    style["cornice"] = base["cornice"] * 1.45
    style["slot"] = base["slot"] * 1.30
    # Fins project ~0.75x their width past the shaft, so this multiplier is
    # bounded by the (now shallower) inset -- 1.85 pushed them through the
    # party plane on the crown spire.
    style["fin"] = base["fin"] * 1.20
    style["batter"] = base["batter"] * 1.10
    style["bevel"] = (base["bevel"][0] * 1.9, base["bevel"][1])
    return style


STYLES = {name: _scale_style(base) for name, base in BASE_STYLES.items()}

# ---------------------------------------------------------------------------
# ARCHETYPES
# ---------------------------------------------------------------------------
# WALLS run on their E/W axis and must butt EXACTLY there. Their N (field) and
# S (interior) faces sit inboard of the cell, which is what lets a bastion
# project into the field without ever leaving its own cell.
#
# TOWERS are split across both height bands the brief asked for: two in the
# 140-200 m range that read as a big-city skyline, two in the 200-300 m range
# that genuinely tower.
#
# PLATFORMS declare `anchor`: "ocean" runs caissons to SEABED_Z and is cut by
# the waterline; "terrain" plants shorter legs and a rock apron.
ARCHETYPES = (
    # ---- curtain wall -----------------------------------------------------
    {"id": "wall_straight", "cells": (1, 1), "form": "wall", "class": "wall",
     "layout": (0, 0), "height": 18.0,
     "edges": {"N": "street", "E": "open", "S": "service", "W": "open"}},
    {"id": "wall_corner", "cells": (1, 1), "form": "wall_corner", "class": "wall",
     "layout": (1, 0), "height": 18.0,
     "edges": {"N": "open", "E": "open", "S": "service", "W": "service"}},
    {"id": "wall_gate", "cells": (1, 1), "form": "wall_gate", "class": "wall",
     "layout": (2, 0), "height": 24.0,
     "edges": {"N": "street", "E": "open", "S": "street", "W": "open"}},
    {"id": "wall_bastion", "cells": (1, 1), "form": "wall_bastion", "class": "wall",
     "layout": (3, 0), "height": 22.0,
     "edges": {"N": "street", "E": "open", "S": "service", "W": "open"}},
    {"id": "wall_ramp", "cells": (1, 1), "form": "wall_ramp", "class": "wall",
     "layout": (4, 0), "height": 18.0,
     "edges": {"N": "street", "E": "open", "S": "service", "W": "open"}},
    {"id": "wall_terminus", "cells": (1, 1), "form": "wall_terminus", "class": "wall",
     "layout": (5, 0), "height": 18.0,
     "edges": {"N": "street", "E": "open", "S": "service", "W": "service"}},

    # ---- skyscrapers ------------------------------------------------------
    {"id": "spire_needle", "cells": (1, 1), "form": "needle", "class": "tower",
     "layout": (0, 1), "height": 156.0, "course": 10.0,
     "edges": {"N": "street", "E": "party_wall", "S": "service", "W": "party_wall"}},
    {"id": "tower_monolith", "cells": (2, 2), "form": "monolith", "class": "tower",
     "layout": (1, 1), "height": 188.0, "course": 12.0,
     "edges": {"N": "street", "E": "party_wall", "S": "party_wall", "W": "party_wall"}},
    {"id": "spire_crown", "cells": (2, 2), "form": "crown", "class": "tower",
     "layout": (3, 1), "height": 248.0, "course": 12.0,
     "edges": {"N": "street", "E": "street", "S": "party_wall", "W": "party_wall"}},
    {"id": "arcology_pylon", "cells": (2, 2), "form": "pylon", "class": "tower",
     "layout": (5, 1), "height": 292.0, "course": 14.0,
     "edges": {"N": "street", "E": "party_wall", "S": "party_wall", "W": "party_wall"}},

    # ---- platforms --------------------------------------------------------
    {"id": "platform_deck", "cells": (3, 3), "form": "platform", "class": "platform",
     "layout": (0, 2), "deck": OCEAN_DECK_Z, "anchor": "ocean",
     "edges": {"N": "open", "E": "open", "S": "open", "W": "open"}},
    {"id": "platform_rig", "cells": (2, 2), "form": "rig", "class": "platform",
     "layout": (3, 2), "deck": OCEAN_DECK_Z, "anchor": "ocean",
     "edges": {"N": "service", "E": "open", "S": "street", "W": "open"}},
    {"id": "platform_landing", "cells": (2, 2), "form": "landing", "class": "platform",
     "layout": (5, 2), "deck": 22.0, "anchor": "terrain",
     "edges": {"N": "street", "E": "service", "S": "service", "W": "service"}},
    {"id": "platform_causeway", "cells": (2, 1), "form": "causeway", "class": "platform",
     "layout": (7, 2), "deck": OCEAN_DECK_Z, "anchor": "ocean",
     "edges": {"N": "service", "E": "open", "S": "service", "W": "open"}},

    # ---- deck access ------------------------------------------------------
    # Without these the platforms are marooned: a 26 m deck standing on
    # caissons with no way up. The straight ramp climbs 26 m over 96 m (1:3.7);
    # the ramp tower folds the same climb into a single 2x2 cell using two
    # flights at right angles, for sites with no room for an approach.
    {"id": "platform_ramp", "cells": (3, 1), "form": "plat_ramp", "class": "platform",
     "layout": (0, 3), "deck": OCEAN_DECK_Z, "anchor": "ocean",
     "edges": {"N": "service", "E": "open", "S": "service", "W": "open"}},
    {"id": "platform_ramp_tower", "cells": (2, 2), "form": "ramp_tower", "class": "platform",
     "layout": (4, 3), "deck": OCEAN_DECK_Z, "anchor": "terrain",
     "edges": {"N": "open", "E": "service", "S": "street", "W": "service"}},

    # ---- platform network -------------------------------------------------
    # The disc is the hero: a 4x4 landmark deck with a concentric ring plan and
    # a lit rim, which spokes reach out from to whatever terrain surrounds it.
    # A split deck puts two levels in one cell with a void between them.
    {"id": "platform_disc", "cells": (4, 4), "form": "disc", "class": "platform",
     "layout": (7, 3), "deck": OCEAN_DECK_Z, "anchor": "ocean",
     "edges": {"N": "open", "E": "open", "S": "open", "W": "open"}},
    {"id": "platform_spoke", "cells": (2, 1), "form": "spoke", "class": "platform",
     "layout": (12, 3), "deck": OCEAN_DECK_Z, "anchor": "ocean",
     "edges": {"N": "service", "E": "open", "S": "service", "W": "open"}},
    {"id": "platform_split", "cells": (2, 2), "form": "split_deck", "class": "platform",
     "layout": (15, 3), "deck": OCEAN_DECK_Z, "anchor": "terrain",
     "edges": {"N": "open", "E": "service", "S": "open", "W": "service"}},
)

LAYOUT_PITCH_X = 150.0
LAYOUT_PITCH_Y = 340.0
STYLE_LAYOUT_OFFSET = {"colonial": 0.0, "brutalist": 3200.0, "ruined": 6400.0}


def default_config():
    repo = Path(__file__).resolve().parents[2]
    output = (
        repo / "modules" / "space_exploration" / "assets" / "source" / "blender"
        / "world-kits" / "mf-superstructure-v1"
    )
    return {
        "blend_path": str(output / "mf-superstructure-v1.blend"),
        "export_dir": str(output / "exports"),
        "evidence_dir": str(output / "evidence"),
        "report_path": str(output / "mf-superstructure-v1-report.json"),
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
            raise ValueError("unknown superstructure config keys: " + ", ".join(unknown))
        config.update(overrides)
    for key in ("blend_path", "export_dir", "evidence_dir", "report_path"):
        config[key] = os.path.abspath(os.path.expanduser(str(config[key])))
    config["render_resolution"] = max(256, min(2048, int(config["render_resolution"])))
    bad = [s for s in config["styles"] if s not in STYLES]
    if bad:
        raise ValueError("unknown style set: " + ", ".join(bad))
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
    """Same roles as the building kit so the two tiers sit together, plus the
    two this tier needs: submerged concrete for anything below the waterline,
    and a deck-grate for platform surfaces."""
    materials = {
        "metal": make_material("s_metal", (0.098, 0.120, 0.142, 1.0), 0.78, 0.28),
        "service": make_material("s_service", (0.052, 0.066, 0.078, 1.0), 0.60, 0.34),
        "recess": make_material("s_recess", (0.086, 0.090, 0.088, 1.0), 0.22, 0.72),
        "slot": make_material("s_slot", (0.036, 0.040, 0.044, 1.0), 0.18, 0.76),
        "rubble": make_material("s_rubble", (0.322, 0.308, 0.282, 1.0), 0.06, 0.88),
        "rust": make_material("s_rust", (0.402, 0.196, 0.132, 1.0), 0.24, 0.78),
        "ochre": make_material("s_ochre", (0.548, 0.412, 0.156, 1.0), 0.16, 0.72),
        "verdigris": make_material("s_verdigris", (0.176, 0.348, 0.336, 1.0), 0.20, 0.70),
        "grate": make_material("s_grate", (0.232, 0.244, 0.238, 1.0), 0.52, 0.52),
        # Everything below WATER_Z. Darker and greener than dry concrete so the
        # waterline reads as a real material change, not just a shadow.
        "submerged": make_material("s_submerged", (0.086, 0.104, 0.094, 1.0), 0.14, 0.86),
        "glazing": make_material("s_glazing", (0.026, 0.238, 0.312, 0.46), 0.20, 0.14, alpha=0.46),
        "emissive": make_material(
            "s_emissive", (0.015, 0.45, 0.58, 1.0), 0.08, 0.22,
            emission=((0.01, 0.72, 1.0, 1.0), 5.8),
        ),
        "hazard": make_material(
            "s_hazard", (0.92, 0.39, 0.025, 1.0), 0.10, 0.42,
            emission=((1.0, 0.17, 0.008, 1.0), 0.34),
        ),
    }
    for style_id, style in STYLES.items():
        wall = style["wall"]
        materials[style_id + "_wall"] = make_material("s_" + style_id + "_wall", wall, 0.08, 0.74)
        materials[style_id + "_trim"] = make_material("s_" + style_id + "_trim", style["trim"], 0.18, 0.58)
        materials[style_id + "_deck"] = make_material("s_" + style_id + "_deck", style["deck"], 0.46, 0.46)
        armour = tuple(min(1.0, c * 1.10 + 0.11) for c in wall[:3]) + (1.0,)
        materials[style_id + "_armour"] = make_material("s_" + style_id + "_armour", armour, 0.30, 0.50)
    return materials


def footprint(spec):
    cells_x, cells_y = spec["cells"]
    return (cells_x * HALF_GRID_M - JOINT_M, cells_y * HALF_GRID_M - JOINT_M)


def banded_sides(spec):
    return [d for d, kind in spec["edges"].items() if kind != "party_wall"]


def clutter_sides(spec):
    return [d for d, kind in spec["edges"].items() if kind in ("service", "street")]


def ruin_scale(spec, style, rng):
    """Derelicts lose height, not plan. A breached wall keeps its run so the
    rampart still tiles; a sheared tower keeps its footprint so it still sits
    on its plot."""
    if style["ruin"] <= 0.0:
        return 1.0
    return rng.range(0.44, 0.76, "shear")


# ---------------------------------------------------------------------------
# superstructure shell
# ---------------------------------------------------------------------------
def mega_shell(buf, style, mats, cx, cy, hx, hy, z0, z1, lod, rng, tag,
               course=12.0, glaze_sides=(), inset=None, batter=None, chamfer=None,
               band=None):
    """The building kit's banded shell, re-pitched for this tier.

    A 292 m tower banded on the 4 m building floor would emit 70 courses and
    read as corduroy from the RTS camera. Superstructures band on a MEGA-COURSE
    of 10-14 m instead: fewer, deeper shadow lines that survive being viewed
    from 600 m away, and a third of the triangles.
    """
    inset = style["inset"] if inset is None else inset
    batter = style["batter"] if batter is None else batter
    chamfer = style["chamfer"] if chamfer is None else chamfer
    band = course * 0.34 if band is None else band
    slot = style["slot"]
    hx = max(0.8, hx - inset)
    hy = max(0.8, hy - inset)
    chamfer = max(0.25, chamfer - inset * 0.4)

    def ring(z, extra=0.0):
        ex, ey = taper_at(z, z0, z1, hx, hy, batter)
        return octagon(cx, cy, max(0.5, ex - extra), max(0.5, ey - extra),
                       max(0.2, chamfer - extra * 0.6))

    if lod >= 2:
        buf.mass("shell_mass", mats["wall"], ring(z0), ring(z1), z0, z1)
        return []

    courses = []
    n = 0
    while n < 240:
        zc = z0 + PLINTH_M + n * course + course * 0.42
        if zc + band > z1 - 0.4:
            break
        courses.append(zc)
        n += 1
    if lod == 1:
        courses = courses[::2]

    bands, cursor = [], z0
    for zc in courses:
        if zc > cursor + 0.05:
            buf.mass("spandrel", mats["wall"], ring(cursor), ring(zc), cursor, zc)
        top_c = min(z1, zc + band)
        buf.mass("window_drum", "recess", ring(zc, slot), ring(top_c, slot), zc, top_c)
        bands.append((zc, top_c))
        cursor = top_c
    if cursor < z1 - 0.02:
        buf.mass("spandrel", mats["wall"], ring(cursor), ring(z1), cursor, z1)
    if not courses:
        buf.mass("shell_mass", mats["wall"], ring(z0), ring(z1), z0, z1)

    if lod == 0 and glaze_sides:
        for (zlo, zhi) in bands:
            mid = (zlo + zhi) * 0.5
            ex, ey = taper_at(mid, z0, z1, hx, hy, batter)
            for d in glaze_sides:
                (ox, oy), (nx, ny), half = side_frame(d, ex - slot * 0.45, ey - slot * 0.45)
                span = max(1.0, (half - chamfer * 0.9) * 2.0 * style["glazed"])
                buf.box("window_glass", "glazing", (cx + ox, cy + oy, mid),
                        (0.36 if nx else span, 0.36 if ny else span, (zhi - zlo) * 0.74))
                if style["emissive"] > 0.0 and rng.chance(0.42, tag, "lit", d, int(zlo)):
                    buf.box("window_emissive", "emissive", (cx + ox, cy + oy, zhi - 0.35),
                            (0.24 if nx else span * 0.88, 0.24 if ny else span * 0.88, 0.32))
    return bands


def mega_cornice(buf, style, mats, cx, cy, hx, hy, z_top, lod, z0=0.0, inset=None,
                 batter=None, thick=None):
    """Same topology as the building kit: the wall CONTINUES past roof level to
    become the parapet, then finishes in a thin coping. Never a plate parked on
    the shaft -- that construction is what made every tower head read as a
    flying saucer, and it could not be fixed by resizing the plate.

    `thick` is honoured as the parapet height so belt bands mid-shaft stay
    shallow, but the geometry is continuous either way.
    """
    inset = style["inset"] if inset is None else inset
    batter = style["batter"] if batter is None else batter
    parapet = max(1.1, _LIB["ROOF_PARAPET"] if thick is None else thick)
    shaft_hx = max(0.8, hx - inset)
    shaft_hy = max(0.8, hy - inset)
    ex, ey = taper_at(z_top - parapet, z0, max(z_top, z0 + 0.01), shaft_hx, shaft_hy, batter)
    ch_shaft = max(0.25, style["chamfer"] - inset * 0.4)
    ch_face = style["chamfer"]
    trans = min(1.3, parapet * 0.38)
    buf.mass("parapet_wall", mats["wall"],
             octagon(cx, cy, ex, ey, ch_shaft),
             octagon(cx, cy, hx, hy, ch_face), z_top - parapet, z_top - parapet + trans)
    buf.mass("parapet_wall", mats["wall"],
             octagon(cx, cy, hx, hy, ch_face),
             octagon(cx, cy, hx, hy, ch_face), z_top - parapet + trans, z_top - 0.55)
    buf.mass("coping", mats["trim"],
             octagon(cx, cy, hx * 0.992, hy * 0.992, ch_face),
             octagon(cx, cy, hx, hy, ch_face), z_top - 0.55, z_top)
    if lod < 2:
        buf.mass("cornice_reveal", "slot",
                 octagon(cx, cy, ex * 0.99, ey * 0.99, max(0.2, ch_shaft * 0.9)),
                 octagon(cx, cy, ex * 0.99, ey * 0.99, max(0.2, ch_shaft * 0.9)),
                 z_top - parapet - 0.5, z_top - parapet)


def mega_base(buf, style, mats, cx, cy, hx, hy, lod, z_from=0.0, height=None, inset=None):
    inset = style["inset"] if inset is None else inset
    height = FLOOR_M * 2.4 if height is None else height
    lower = octagon(cx, cy, hx, hy, style["chamfer"])
    upper = octagon(cx, cy, max(0.8, hx - inset), max(0.8, hy - inset),
                    max(0.2, style["chamfer"] - inset * 0.4))
    buf.mass("base_block", mats["wall"], lower, upper, z_from, z_from + height)


def caisson(buf, style, mats, cx, cy, radius, deck_z, floor_z, lod, rng, tag,
            chamfer=None):
    """A platform leg that passes through the waterline.

    Split at WATER_Z on purpose: the submerged length gets its own darker,
    greener material so the waterline reads as a material change rather than a
    shadow, and a collar marks the tide line. Below-grade geometry is the one
    thing this tier does that the building kit never had to.
    """
    chamfer = (style["chamfer"] * 0.5) if chamfer is None else chamfer
    segs = 6 if lod >= 1 else 10
    wet_lo = octagon(cx, cy, radius * 1.22, radius * 1.22, chamfer)
    wet_hi = octagon(cx, cy, radius * 1.04, radius * 1.04, chamfer)
    buf.mass("caisson_submerged", "submerged", wet_lo, wet_hi, floor_z, WATER_Z)
    dry_hi = octagon(cx, cy, radius * 0.86, radius * 0.86, chamfer)
    buf.mass("caisson", mats["wall"], wet_hi, dry_hi, WATER_Z, deck_z)
    if lod < 2:
        buf.mass("waterline_collar", mats["trim"],
                 octagon(cx, cy, radius * 1.16, radius * 1.16, chamfer),
                 octagon(cx, cy, radius * 1.10, radius * 1.10, chamfer),
                 WATER_Z - 0.9, WATER_Z + 1.5)
    if lod == 0:
        for k in range(2):
            z = WATER_Z + (deck_z - WATER_Z) * (0.42 + 0.3 * k)
            buf.mass("caisson", mats["trim"],
                     octagon(cx, cy, radius * 0.95, radius * 0.95, chamfer),
                     octagon(cx, cy, radius * 0.92, radius * 0.92, chamfer), z, z + 0.7)


def sloped_slab(buf, role, material, t0, t1, z0, z1, half_w, thick, axis="x", offset=0.0):
    """A ramp deck: a slab whose top face rises linearly from t0 to t1.

    Every other primitive in these kits lofts between two HORIZONTAL rings,
    which cannot express a slope. A ramp built from stepped boxes reads as a
    staircase at this scale, so this pushes the eight corners directly.
    """
    verts, faces = buf._bucket(role, material)
    base = len(verts)

    def point(t, y, z):
        return (t, y, z) if axis == "x" else (y, t, z)

    for (t, z) in ((t0, z0), (t1, z1)):
        for y in (-half_w + offset, half_w + offset):
            verts.append(point(t, y, z))
    for (t, z) in ((t0, z0), (t1, z1)):
        for y in (-half_w + offset, half_w + offset):
            verts.append(point(t, y, z - thick))
    b = base
    faces.extend((
        (b + 0, b + 2, b + 3, b + 1),
        (b + 4, b + 5, b + 7, b + 6),
        (b + 0, b + 4, b + 6, b + 2),
        (b + 1, b + 3, b + 7, b + 5),
        (b + 0, b + 1, b + 5, b + 4),
        (b + 2, b + 6, b + 7, b + 3),
    ))


def annulus(buf, role, material, cx, cy, r_out, r_in, z0, z1, segs=36):
    """A ring band. Concentric rings are the whole plan language of a disc
    platform, and no existing primitive here can express one -- octagon() is a
    filled convex plan and append_cylinder is solid."""
    if r_out <= r_in or z1 <= z0:
        return
    verts, faces = buf._bucket(role, material)
    base = len(verts)
    for r in (r_out, r_in):
        for z in (z0, z1):
            for i in range(segs):
                a = math.tau * i / segs
                verts.append((cx + math.cos(a) * r, cy + math.sin(a) * r, z))
    ob, ot, ib, it = (base, base + segs, base + segs * 2, base + segs * 3)
    for i in range(segs):
        j = (i + 1) % segs
        faces.append((ob + i, ob + j, ot + j, ot + i))     # outer wall
        faces.append((ib + j, ib + i, it + i, it + j))     # inner wall
        faces.append((ot + i, ot + j, it + j, it + i))     # top
        faces.append((ob + j, ob + i, ib + i, ib + j))     # underside


def add_railing(buf, style, mats, t0, t1, other, z, lod, rng, tag,
                axis="x", lamps=4):
    """Handrail, stanchions and lamp posts along a deck edge.

    In the reference screenshots the lamp posts are the single strongest read
    on an elevated walkway at RTS distance -- a bare deck edge looks unfinished
    however good the platform under it is.
    """
    if lod >= 2:
        return

    def at(t, off, zz):
        return (t, other + off, zz) if axis == "x" else (other + off, t, zz)

    length = abs(t1 - t0)
    mid = (t0 + t1) * 0.5
    span = (length, 0.24) if axis == "x" else (0.24, length)
    buf.box("handrail", "grate", at(mid, 0.0, z + 1.9), (span[0], span[1], 0.22))
    buf.box("handrail", "grate", at(mid, 0.0, z + 1.05), (span[0], span[1], 0.16))
    posts = max(2, int(length // 7.0))
    for i in range(posts):
        t = t0 + (t1 - t0) * ((i + 0.5) / posts)
        buf.box("handrail", mats["trim"], at(t, 0.0, z + 1.0), (0.4, 0.4, 2.0))
    if lod == 0 and lamps > 0 and style["emissive"] > 0.0:
        for i in range(lamps):
            t = t0 + (t1 - t0) * ((i + 0.5) / lamps)
            buf.cyl("lamp_post", mats["trim"], at(t, 0.0, z + 3.2), 0.34, 6.4, 6)
            buf.cyl("lamp_head", "hazard", at(t, 0.0, z + 6.7), 0.85, 1.5, 8)


def add_deck_plating(buf, style, mats, cx, cy, hx, hy, z, lod, rng, tag, cell=9.0):
    """Large panel divisions scored into an elevated deck. Same idea as the
    ground kit's paving grooves -- an empty deck slab is the giveaway."""
    if lod > 0 or hx <= 3.0 or hy <= 3.0:
        return
    groove, width = 0.30, 0.5
    rows = max(2, int((hy * 2.0) // cell))
    for r in range(1, rows):
        y = -hy + (hy * 2.0 / rows) * r
        buf.box("deck_groove", "slot", (cx, cy + y, z - groove * 0.5),
                (hx * 1.94, width, groove))
    cols = max(2, int((hx * 2.0) // cell))
    for c in range(1, cols):
        x = -hx + (hx * 2.0 / cols) * c
        buf.box("deck_groove", "slot", (cx + x, cy, z - groove * 0.5),
                (width, hy * 1.94, groove))
    for i in range(3):
        w = min(rng.range(4.0, 8.0, tag, "pw", i), hx * 0.8)
        d = min(rng.range(3.0, 6.0, tag, "pd", i), hy * 0.8)
        px = max(-hx + w, min(hx - w, rng.range(-hx, hx, tag, "px", i)))
        py = max(-hy + d, min(hy - d, rng.range(-hy, hy, tag, "py", i)))
        buf.box("deck_panel", "recess", (cx + px, cy + py, z - groove * 1.4),
                (w, d, groove * 2.6))


# ---------------------------------------------------------------------------
# curtain wall
# ---------------------------------------------------------------------------
WALL_HALF_T = 5.5          # half thickness of the rampart
WALL_WALK_DROP = 1.6       # walk surface below the parapet head


def _wall_body(buf, style, mats, hx, h, lod, x0=None, x1=None, half_t=WALL_HALF_T,
               rng=None, tag="wall"):
    """The rampart itself. X extents are NOT inset and NOT battered: this is
    the run axis, and a 1 km wall shows a seam every 32 m if the segments do
    not meet the plane exactly. The batter is applied in Y only, which is where
    the fortress slope actually reads anyway."""
    ch = style["chamfer"] * 0.55
    x0 = -hx if x0 is None else x0
    x1 = hx if x1 is None else x1
    cx = (x0 + x1) * 0.5
    ex = (x1 - x0) * 0.5
    lower = octagon(cx, 0.0, ex, half_t, ch)
    upper = octagon(cx, 0.0, ex, half_t * (1.0 - style["batter"] * 3.2), ch * 0.8)
    buf.mass("shell_mass", mats["wall"], lower, upper, 0.0, h)
    if lod < 2:
        mid = half_t * (1.0 - style["batter"] * 1.6)
        buf.mass("window_drum", "recess",
                 octagon(cx, 0.0, ex, mid - style["slot"] * 0.5, ch * 0.6),
                 octagon(cx, 0.0, ex, mid - style["slot"] * 0.6, ch * 0.6),
                 h * 0.44, h * 0.44 + style["cornice"] * 0.9)
    if rng is not None:
        # inset=0: a rampart face IS its own plane, it is not recessed behind
        # one, so panels hang directly off it.
        add_panel_lines(buf, style, mats, cx, 0.0, ex, half_t, 0.0, h,
                        ["N", "S"], lod, rng, tag, inset=0.0, cell=3.6, density=0.52,
                        chamfer=style["chamfer"] * 0.30)
    return ex, cx


def _wall_head(buf, style, mats, hx, h, lod, rng, x0=None, x1=None,
               half_t=WALL_HALF_T, equipment=True):
    """Wall head: coping, walkway, and an ARMOURED PARAPET.

    This deliberately carries no crenellations. Merlons are masonry
    fortification -- they read as a castle, which is the wrong century and the
    wrong material. A wall in this kit is a machine barrier, so the field side
    gets a continuous armoured upstand broken by equipment bays and sensor
    masts, and the inner side gets a conduit run. Damage on a derelict is a
    blown-out panel, not a missing battlement.
    """
    ch = style["chamfer"] * 0.55
    x0 = -hx if x0 is None else x0
    x1 = hx if x1 is None else x1
    cx = (x0 + x1) * 0.5
    ex = (x1 - x0) * 0.5
    top_t = half_t * (1.0 - style["batter"] * 3.2)
    ruined = style["ruin"] > 0.0

    buf.mass("cornice", mats["trim"],
             octagon(cx, 0.0, ex, top_t, ch * 0.8),
             octagon(cx, 0.0, ex, half_t, ch), h - style["cornice"] * 0.8, h)
    if lod >= 2:
        return
    buf.box("wall_walk", "grate", (cx, 0.0, h - WALL_WALK_DROP * 0.5),
            (ex * 2.0 - 0.6, half_t * 1.05, 0.5))
    if not equipment:
        return

    parapet_h = 3.0
    face_y = half_t - 0.85
    # continuous armoured upstand on the field side
    buf.mass("parapet_armour", mats["armour"],
             octagon(cx, face_y, ex, 0.85, 0.3),
             octagon(cx, face_y + 0.15, ex, 0.62, 0.25), h, h + parapet_h)
    # inner conduit rail
    buf.box("conduit_rail", mats["trim"], (cx, -half_t + 0.9, h + 0.9),
            (ex * 2.0, 0.75, 1.8))

    bays = max(2, int((ex * 2.0) // BAY_M))
    span = (ex * 2.0) / bays
    for i in range(bays):
        t = cx - ex + span * (i + 0.5)
        if ruined and rng.chance(0.30, "blown", i):
            # blown-out panel: the armour is gone, the frame is not
            buf.box("parapet_breach", "recess", (t, face_y, h + parapet_h * 0.55),
                    (span * 0.72, 1.5, parapet_h * 0.9))
            continue
        # recessed equipment bay in the armour
        buf.box("parapet_bay", "recess", (t, face_y + 0.55, h + parapet_h * 0.52),
                (span * 0.62, 0.5, parapet_h * 0.54))
        if i % 3 == 1:
            # hazard-striped access panel
            buf.box("hazard_panel", "ochre", (t, face_y + 0.62, h + parapet_h * 0.52),
                    (span * 0.40, 0.35, parapet_h * 0.40))
        if i % 2 == 0 and lod == 0:
            # sensor mast rather than a merlon
            buf.mass("sensor_mast", mats["armour"],
                     octagon(t, -half_t + 2.2, 0.95, 0.95, 0.3),
                     octagon(t, -half_t + 2.2, 0.72, 0.72, 0.24), h, h + 5.2)
            buf.mass("sensor_head", mats["armour"],
                     octagon(t, -half_t + 2.2, 2.0, 1.5, 0.5),
                     octagon(t, -half_t + 2.2, 1.5, 1.1, 0.4), h + 5.2, h + 7.6)
            if style["emissive"] > 0.0:
                buf.box("window_emissive", "emissive", (t, -half_t + 1.4, h + 7.2),
                        (0.7, 0.18, 0.22))
        if i % 4 == 2 and lod == 0 and style["emissive"] > 0.0:
            buf.cyl("warning_light", "hazard", (t, face_y + 0.2, h + parapet_h + 0.4),
                    0.34, 0.8, 6)
    # cable runs along the inner face, at the bay pitch
    if lod == 0:
        for k in range(3):
            buf.cyl("conduit", "metal", (cx, -half_t - 0.45, h - 2.6 - k * 0.9),
                    0.28, ex * 2.0, 6)


def _wall_buttress(buf, style, mats, hx, h, lod, half_t=WALL_HALF_T, x0=None, x1=None):
    """Inner-face buttresses on the bay pitch. They stop short of the run plane
    so two segments never wedge each other apart."""
    if lod >= 2:
        return
    x0 = -hx if x0 is None else x0
    x1 = hx if x1 is None else x1
    ex = (x1 - x0) * 0.5
    cx = (x0 + x1) * 0.5
    count = max(1, int((ex * 2.0) // BAY_M))
    span = (ex * 2.0) / count
    for i in range(count):
        t = cx - ex + span * (i + 0.5)
        depth = 3.6 + style["fin"] * 1.2
        buf.mass("buttress", mats["wall"],
                 octagon(t, -half_t - depth * 0.5, span * 0.28, depth * 0.5, 0.5),
                 octagon(t, -half_t - depth * 0.24, span * 0.20, depth * 0.24, 0.4),
                 0.0, h * 0.74)


def form_wall(buf, spec, style, mats, lod, rng, scale):
    hx, hy = footprint(spec)
    h = spec["height"] * scale
    _wall_body(buf, style, mats, hx, h, lod, rng=rng, tag="wallstr")
    _wall_buttress(buf, style, mats, hx, h, lod)
    _wall_head(buf, style, mats, hx, h, lod, rng)
    if lod == 0:
        add_armour(buf, style, mats, 0.0, 0.0, hx, WALL_HALF_T, 0.0, h, ["N"], lod, rng,
                   "wall", inset=0.0)
    return h + 2.6


def form_wall_corner(buf, spec, style, mats, lod, rng, scale):
    """Where the run turns. One arm reaches +X, the other +Y, and a corner
    tower covers the joint -- which is also what hides the mitre."""
    hx, hy = footprint(spec)
    h = spec["height"] * scale
    ch = style["chamfer"] * 0.55
    _wall_body(buf, style, mats, hx, h, lod, x0=0.0, x1=hx, rng=rng, tag="wallcor")
    _wall_head(buf, style, mats, hx, h, lod, rng, x0=0.0, x1=hx)
    # The N arm, built by hand because it runs on the other axis.
    lower = octagon(0.0, hy * 0.5, WALL_HALF_T, hy * 0.5, ch)
    upper = octagon(0.0, hy * 0.5, WALL_HALF_T * (1.0 - style["batter"] * 3.2), hy * 0.5, ch * 0.8)
    buf.mass("shell_mass", mats["wall"], lower, upper, 0.0, h)
    buf.mass("cornice", mats["trim"],
             octagon(0.0, hy * 0.5, WALL_HALF_T * (1.0 - style["batter"] * 3.2), hy * 0.5, ch * 0.8),
             octagon(0.0, hy * 0.5, WALL_HALF_T, hy * 0.5, ch),
             h - style["cornice"] * 0.8, h)
    tower_r = WALL_HALF_T * 1.85
    tower_h = h + FLOOR_M * 2.6
    buf.mass("corner_tower", mats["wall"],
             octagon(0.0, 0.0, tower_r, tower_r, ch * 1.5),
             octagon(0.0, 0.0, tower_r * 0.9, tower_r * 0.9, ch * 1.4), 0.0, tower_h)
    if lod < 2:
        # Equipment bands up the shaft and a sensor cluster on top -- the old
        # flared cap plus a glowing ring read as a castle turret.
        for k in range(3):
            z = h * (0.30 + k * 0.22)
            buf.mass("equipment_band", mats["armour"],
                     octagon(0.0, 0.0, tower_r * 1.04, tower_r * 1.04, ch * 1.3),
                     octagon(0.0, 0.0, tower_r * 0.98, tower_r * 0.98, ch * 1.2),
                     z, z + 1.5)
        buf.mass("cornice", mats["trim"],
                 octagon(0.0, 0.0, tower_r * 0.94, tower_r * 0.94, ch * 1.4),
                 octagon(0.0, 0.0, tower_r * 1.06, tower_r * 1.06, ch * 1.5),
                 tower_h - style["cornice"], tower_h)
        buf.mass("sensor_head", mats["armour"],
                 octagon(0.0, 0.0, tower_r * 0.72, tower_r * 0.72, ch),
                 octagon(0.0, 0.0, tower_r * 0.46, tower_r * 0.46, ch * 0.7),
                 tower_h, tower_h + 3.4)
        buf.cyl("sensor_mast", "metal", (0.0, 0.0, tower_h + 8.0), 0.42, 9.0, 6)
        for k in range(3):
            buf.box("sensor_mast", "metal", (0.0, 0.0, tower_h + 6.0 + k * 1.6),
                    (3.4 - k * 0.7, 0.26, 0.26))
        if style["emissive"] > 0.0:
            buf.cyl("warning_light", "hazard", (0.0, 0.0, tower_h + 12.8), 0.5, 1.0, 6)
            for sgn in (-1.0, 1.0):
                buf.box("window_emissive", "emissive",
                        (sgn * tower_r * 0.72, 0.0, tower_h + 1.7), (0.24, tower_r, 0.5))
    return tower_h + 12.8


def form_wall_gate(buf, spec, style, mats, lod, rng, scale):
    """The rampart's road gate. Same 20 x 10 m clearance as the road kit and the
    building-kit gatehouse, so one carriageway drives through all three."""
    hx, hy = footprint(spec)
    h = spec["height"] * scale
    clear_half, clear_height = 10.0, 10.0
    ch = style["chamfer"] * 0.55
    pier = hx - clear_half
    for sx in (-1.0, 1.0):
        px = sx * (clear_half + pier * 0.5)
        # Vertical on the run axis so the gate still butts its neighbours.
        ring = octagon(px, 0.0, pier * 0.5, WALL_HALF_T, ch)
        buf.mass("shell_mass", mats["wall"], ring, ring, 0.0, h)
    buf.mass("shell_mass", mats["wall"],
             octagon(0.0, 0.0, clear_half + pier * 0.35, WALL_HALF_T, ch),
             octagon(0.0, 0.0, clear_half + pier * 0.2, WALL_HALF_T * 0.85, ch * 0.8),
             clear_height, h)
    if lod < 2:
        buf.box("gate_lintel", mats["armour"], (0.0, 0.0, clear_height + 1.0),
                (clear_half * 2.0 + 3.0, WALL_HALF_T * 2.0, 2.0))
        for sx in (-1.0, 1.0):
            buf.box("gate_lintel", mats["armour"], (sx * clear_half, 0.0, clear_height * 0.5),
                    (1.6, WALL_HALF_T * 2.0, clear_height))
        buf.box("window_drum", "recess", (0.0, 0.0, clear_height * 0.5 + 0.2),
                (clear_half * 1.96, WALL_HALF_T * 1.5, clear_height * 0.94))
        # Retracted blast doors housed in the jambs, and their runner beam.
        for sx in (-1.0, 1.0):
            buf.mass("blast_door", mats["armour"],
                     octagon(sx * (clear_half - 1.6), 0.0, 1.5, WALL_HALF_T * 0.9, 0.35),
                     octagon(sx * (clear_half - 1.6), 0.0, 1.2, WALL_HALF_T * 0.8, 0.3),
                     1.0, clear_height - 0.8)
        buf.box("door_runner", "metal", (0.0, 0.0, clear_height - 0.5),
                (clear_half * 2.0, WALL_HALF_T * 1.2, 0.6))
        if style["emissive"] > 0.0:
            for sx in (-1.0, 1.0):
                buf.box("window_emissive", "emissive",
                        (sx * (clear_half - 1.0), 0.0, clear_height - 1.0),
                        (0.3, WALL_HALF_T * 1.6, 0.34))
    _wall_head(buf, style, mats, hx, h, lod, rng)
    return h + 2.6


def form_wall_bastion(buf, spec, style, mats, lod, rng, scale):
    """A projecting artillery work. It reaches out toward the field but stays
    INSIDE its own cell -- the rampart sits at mid-cell precisely so a bastion
    has somewhere to project to without invading the neighbour."""
    hx, hy = footprint(spec)
    h = spec["height"] * scale
    ch = style["chamfer"] * 0.55
    _wall_body(buf, style, mats, hx, h, lod, rng=rng, tag="wallbas")
    _wall_buttress(buf, style, mats, hx, h, lod)
    _wall_head(buf, style, mats, hx, h, lod, rng)
    reach = hy - 0.2
    bh = h * 1.06
    buf.mass("bastion", mats["wall"],
             octagon(0.0, reach * 0.42, hx * 0.62, reach * 0.58, ch * 2.2),
             octagon(0.0, reach * 0.40, hx * 0.50, reach * 0.46, ch * 2.0), 0.0, bh)
    if lod < 2:
        buf.mass("cornice", mats["trim"],
                 octagon(0.0, reach * 0.42, hx * 0.52, reach * 0.48, ch * 2.0),
                 octagon(0.0, reach * 0.42, hx * 0.62, reach * 0.58, ch * 2.2),
                 bh - style["cornice"], bh)
        # Weapon emplacements, not embrasures. An arrow slit in a 22 m
        # armoured work is the single most castle-like thing this kit had.
        for sx in (-1.0, 1.0):
            mx, my = sx * hx * 0.34, reach * 0.62
            buf.mass("turret_mount", mats["armour"],
                     octagon(mx, my, 4.2, 4.2, 1.1),
                     octagon(mx, my, 3.4, 3.4, 0.9), bh, bh + 3.2)
            buf.cyl("turret_barrel", "metal", (mx, my + 5.4, bh + 2.4), 0.62, 9.0, 8)
            buf.box("turret_mount", mats["trim"], (mx, my, bh + 3.6), (5.0, 5.0, 0.7))
            if style["emissive"] > 0.0:
                buf.box("window_emissive", "emissive", (mx, my - 3.3, bh + 2.2),
                        (2.2, 0.2, 0.24))
        buf.box("wall_walk", "grate", (0.0, reach * 0.42, bh + 0.25),
                (hx * 1.0, reach * 0.9, 0.5))
    return bh


def form_wall_ramp(buf, spec, style, mats, lod, rng, scale):
    """Access to the wall walk. The ramp climbs on the inner face only."""
    hx, hy = footprint(spec)
    h = spec["height"] * scale
    _wall_body(buf, style, mats, hx, h, lod, rng=rng, tag="wallramp")
    _wall_head(buf, style, mats, hx, h, lod, rng)
    if lod < 2:
        steps = 3 if lod == 1 else 6
        for i in range(steps):
            f0, f1 = i / float(steps), (i + 1) / float(steps)
            y0 = -WALL_HALF_T - 13.5 * (1.0 - f0)
            y1 = -WALL_HALF_T - 13.5 * (1.0 - f1)
            buf.mass("ramp", mats["wall"],
                     octagon(0.0, (y0 + y1) * 0.5, hx * 0.34, abs(y1 - y0) * 0.5 + 0.4, 0.5),
                     octagon(0.0, (y0 + y1) * 0.5, hx * 0.34, abs(y1 - y0) * 0.5 + 0.4, 0.5),
                     0.0, h * f1)
        buf.box("ramp", mats["trim"], (0.0, -WALL_HALF_T - 7.0, h * 0.5), (hx * 0.72, 0.7, 0.8))
    return h + 2.6


def form_wall_terminus(buf, spec, style, mats, lod, rng, scale):
    """Where a run ends: the rampart reaches the plane on E and dies into a
    thickened anchor block on W."""
    hx, hy = footprint(spec)
    h = spec["height"] * scale
    ch = style["chamfer"] * 0.55
    _wall_body(buf, style, mats, hx, h, lod, x0=-hx * 0.32, x1=hx, rng=rng, tag="wallterm")
    _wall_head(buf, style, mats, hx, h, lod, rng, x0=-hx * 0.32, x1=hx)
    anchor_h = h * 1.14
    buf.mass("anchor_block", mats["wall"],
             octagon(-hx * 0.60, 0.0, hx * 0.40, WALL_HALF_T * 1.75, ch * 1.6),
             octagon(-hx * 0.60, 0.0, hx * 0.30, WALL_HALF_T * 1.35, ch * 1.4), 0.0, anchor_h)
    if lod < 2:
        buf.mass("cornice", mats["trim"],
                 octagon(-hx * 0.60, 0.0, hx * 0.32, WALL_HALF_T * 1.4, ch * 1.4),
                 octagon(-hx * 0.60, 0.0, hx * 0.40, WALL_HALF_T * 1.75, ch * 1.6),
                 anchor_h - style["cornice"], anchor_h)
        for i in range(3):
            buf.mass("rubble_debris", "rubble",
                     octagon(-hx * 0.86, (i - 1) * 5.5, 3.2, 2.6, 0.9),
                     octagon(-hx * 0.86, (i - 1) * 5.5, 1.9, 1.5, 0.7), 0.0,
                     rng.range(1.6, 3.6, "anchorrock", i))
    return anchor_h


# ---------------------------------------------------------------------------
# skyscrapers
# ---------------------------------------------------------------------------
def _belt_cornices(buf, style, mats, hx, hy, z0, z1, lod, every=58.0, inset=None):
    """Intermediate capping bands up a tall shaft.

    A 250 m tower with detail only at its head and foot has nothing to give the
    eye a sense of scale -- it reads as a short tower seen from close up. Belts
    every ~60 m fix the read, and they are cheap.
    """
    if lod >= 2:
        return
    z = z0 + every
    while z < z1 - every * 0.5:
        mega_cornice(buf, style, mats, 0.0, 0.0, hx, hy, z, lod, z0=z0, inset=inset,
                     thick=style["cornice"] * 0.55)
        z += every


def form_needle(buf, spec, style, mats, lod, rng, scale):
    """The slender one. 1x1 footprint carrying ~156 m, so it reads as a spike
    in a skyline of slabs."""
    hx, hy = footprint(spec)
    top = spec["height"] * scale
    course = spec.get("course", 10.0)
    sides = banded_sides(spec)
    mega_base(buf, style, mats, 0.0, 0.0, hx, hy, lod, height=FLOOR_M * 3.0)
    mega_shell(buf, style, mats, 0.0, 0.0, hx, hy, 0.0, top, lod, rng, "needle",
               course=course, glaze_sides=sides)
    add_fins(buf, style, mats, 0.0, 0.0, hx, hy, PLINTH_M, top, sides, lod)
    _belt_cornices(buf, style, mats, hx, hy, 0.0, top, lod, every=52.0)
    mega_cornice(buf, style, mats, 0.0, 0.0, hx, hy, top, lod)
    if lod == 0:
        add_panel_lines(buf, style, mats, 0.0, 0.0, hx, hy, 0.0, top, sides, lod, rng, "needle",
                        cell=4.4, density=0.44, chamfer=style["chamfer"] * 0.45)
        add_armour(buf, style, mats, 0.0, 0.0, hx, hy, PLINTH_M, top * 0.4, sides, lod, rng, "needle")
        add_greebles(buf, style, mats, 0.0, 0.0, hx, hy, top * 0.5, clutter_sides(spec),
                     lod, rng, "needle")
    crown = top + FLOOR_M * 4.5
    ex, ey = taper_at(top, 0.0, top, hx - style["inset"], hy - style["inset"], style["batter"])
    buf.mass("crown", mats["deck"],
             octagon(0.0, 0.0, ex * 0.62, ey * 0.62, style["chamfer"]),
             octagon(0.0, 0.0, ex * 0.34, ey * 0.34, style["chamfer"] * 0.7), top, crown)
    if lod < 2:
        buf.cyl("mast_antenna", mats["trim"], (0.0, 0.0, crown + 13.0), ex * 0.13, 26.0, 8)
        buf.cyl("mast_antenna", "hazard", (0.0, 0.0, crown + 26.5), ex * 0.18, 1.6, 8)
    return crown + 26.0


def form_monolith(buf, spec, style, mats, lod, rng, scale):
    """The heavy one. 2x2 and almost untapered -- a wall of a building, which
    is what makes the needle beside it read as slender."""
    hx, hy = footprint(spec)
    top = spec["height"] * scale
    course = spec.get("course", 12.0)
    sides = banded_sides(spec)
    mega_base(buf, style, mats, 0.0, 0.0, hx, hy, lod, height=FLOOR_M * 4.0)
    mega_shell(buf, style, mats, 0.0, 0.0, hx, hy, 0.0, top, lod, rng, "mono",
               course=course, glaze_sides=sides, batter=style["batter"] * 0.45)
    add_fins(buf, style, mats, 0.0, 0.0, hx, hy, PLINTH_M, top, sides, lod)
    _belt_cornices(buf, style, mats, hx, hy, 0.0, top, lod, every=62.0)
    mega_cornice(buf, style, mats, 0.0, 0.0, hx, hy, top, lod,
                 thick=style["cornice"] * 1.5)
    if lod == 0:
        add_panel_lines(buf, style, mats, 0.0, 0.0, hx, hy, 0.0, top, sides, lod, rng, "mono",
                        cell=4.4, density=0.44, chamfer=style["chamfer"] * 0.45)
        add_armour(buf, style, mats, 0.0, 0.0, hx, hy, PLINTH_M, top * 0.55, sides, lod, rng, "mono")
        add_greebles(buf, style, mats, 0.0, 0.0, hx, hy, top * 0.45, clutter_sides(spec),
                     lod, rng, "mono")
    add_roof_plant(buf, style, hx, hy, top, lod, rng)
    add_mast(buf, style, hx, hy, top, lod, rng)
    return top


def form_crown(buf, spec, style, mats, lod, rng, scale):
    """Three setbacks and a crown. The classic skyscraper profile, at 248 m."""
    hx, hy = footprint(spec)
    top = spec["height"] * scale
    course = spec.get("course", 12.0)
    sides = banded_sides(spec)
    mega_base(buf, style, mats, 0.0, 0.0, hx, hy, lod, height=FLOOR_M * 4.0)
    steps = 3
    z = 0.0
    sx, sy = hx, hy
    for i in range(steps):
        step_top = top if i == steps - 1 else top * (0.44 + 0.26 * i)
        if step_top <= z:
            continue
        mega_shell(buf, style, mats, 0.0, 0.0, sx, sy, z, step_top, lod, rng, "crown%d" % i,
                   course=course, glaze_sides=sides)
        add_fins(buf, style, mats, 0.0, 0.0, sx, sy, max(z, PLINTH_M), step_top, sides, lod)
        mega_cornice(buf, style, mats, 0.0, 0.0, sx, sy, step_top, lod, z0=z,
                     thick=style["cornice"] * (1.3 if i == steps - 1 else 0.9))
        if i == 0 and lod == 0:
            add_panel_lines(buf, style, mats, 0.0, 0.0, sx, sy, 0.0, step_top, sides, lod, rng,
                            "crown", cell=4.4, density=0.44, chamfer=style["chamfer"] * 0.45)
            add_armour(buf, style, mats, 0.0, 0.0, sx, sy, PLINTH_M, step_top, sides, lod, rng, "crown")
            add_greebles(buf, style, mats, 0.0, 0.0, sx, sy, step_top, clutter_sides(spec),
                         lod, rng, "crown")
        ex, ey = taper_at(step_top, z, step_top, sx - style["inset"], sy - style["inset"],
                          style["batter"])
        z, sx, sy = step_top, ex * 0.80, ey * 0.80
    crown_h = z + FLOOR_M * 6.0
    buf.mass("crown", mats["deck"],
             octagon(0.0, 0.0, sx * 0.86, sy * 0.86, style["chamfer"]),
             octagon(0.0, 0.0, sx * 0.30, sy * 0.30, style["chamfer"] * 0.6), z, crown_h)
    if lod < 2:
        buf.cyl("mast_antenna", mats["trim"], (0.0, 0.0, crown_h + 11.0), sx * 0.12, 22.0, 8)
        buf.cyl("mast_antenna", "hazard", (0.0, 0.0, crown_h + 22.5), sx * 0.16, 1.5, 8)
    return crown_h + 22.0


def form_pylon(buf, spec, style, mats, lod, rng, scale):
    """The tallest thing in the pack at ~292 m: a central shaft carried on four
    splayed buttress legs, with an arch void under the podium. The legs are the
    silhouette, so they survive to LOD2."""
    hx, hy = footprint(spec)
    top = spec["height"] * scale
    course = spec.get("course", 14.0)
    sides = banded_sides(spec)
    leg_top = FLOOR_M * 11.0
    ch = style["chamfer"]
    for sgnx in (-1.0, 1.0):
        for sgny in (-1.0, 1.0):
            buf.mass("buttress_leg", mats["wall"],
                     octagon(sgnx * hx * 0.66, sgny * hy * 0.66, hx * 0.32, hy * 0.32, ch * 1.2),
                     octagon(sgnx * hx * 0.30, sgny * hy * 0.30, hx * 0.24, hy * 0.24, ch),
                     0.0, leg_top)
    podium = leg_top + FLOOR_M * 3.0
    buf.mass("shell_mass", mats["wall"],
             octagon(0.0, 0.0, hx * 0.86, hy * 0.86, ch * 1.4),
             octagon(0.0, 0.0, hx, hy, ch * 1.6), leg_top, podium)
    mega_cornice(buf, style, mats, 0.0, 0.0, hx, hy, podium, lod, z0=leg_top,
                 inset=0.0, thick=style["cornice"] * 1.2)
    mega_shell(buf, style, mats, 0.0, 0.0, hx * 0.78, hy * 0.78, podium, top, lod, rng, "pylon",
               course=course, glaze_sides=sides, inset=style["inset"] * 0.6)
    add_fins(buf, style, mats, 0.0, 0.0, hx * 0.78, hy * 0.78, podium, top, ["N", "E", "S", "W"],
             lod, inset=style["inset"] * 0.6)
    _belt_cornices(buf, style, mats, hx * 0.78, hy * 0.78, podium, top, lod, every=64.0,
                   inset=style["inset"] * 0.6)
    mega_cornice(buf, style, mats, 0.0, 0.0, hx * 0.78, hy * 0.78, top, lod, z0=podium,
                 inset=style["inset"] * 0.6, thick=style["cornice"] * 1.4)
    if lod == 0:
        add_panel_lines(buf, style, mats, 0.0, 0.0, hx * 0.78, hy * 0.78, podium, top,
                        ["N", "E", "S", "W"], lod, rng, "pylon", inset=style["inset"] * 0.6)
        # The podium's own face IS the party plane, and a raised panel stands
        # 0.40 m proud, so it needs half a metre of inset or it punches into
        # all four neighbours.
        add_panel_lines(buf, style, mats, 0.0, 0.0, hx, hy, leg_top, podium,
                        ["N", "E", "S", "W"], lod, rng, "pypod", inset=0.55)
    crown_h = top + FLOOR_M * 7.0
    buf.mass("crown", mats["deck"],
             octagon(0.0, 0.0, hx * 0.52, hy * 0.52, ch),
             octagon(0.0, 0.0, hx * 0.18, hy * 0.18, ch * 0.5), top, crown_h)
    if lod < 2:
        buf.cyl("mast_antenna", mats["trim"], (0.0, 0.0, crown_h + 15.0), hx * 0.06, 30.0, 8)
        buf.cyl("mast_antenna", "hazard", (0.0, 0.0, crown_h + 30.5), hx * 0.09, 1.8, 8)
        if style["emissive"] > 0.0:
            for sgnx in (-1.0, 1.0):
                buf.box("window_emissive", "emissive",
                        (sgnx * hx * 0.5, 0.0, podium - style["cornice"] * 1.6),
                        (0.5, hy * 1.2, 0.5))
    return crown_h + 30.0


# ---------------------------------------------------------------------------
# platforms
# ---------------------------------------------------------------------------
def _deck_slab(buf, style, mats, hx, hy, deck_z, lod, thickness=4.2, edge=True):
    ch = style["chamfer"]
    buf.mass("deck_slab", mats["deck"],
             octagon(0.0, 0.0, hx * 0.985, hy * 0.985, ch * 1.5),
             octagon(0.0, 0.0, hx, hy, ch * 1.6), deck_z - thickness, deck_z)
    if edge and lod < 2:
        buf.mass("deck_edge", mats["armour"],
                 octagon(0.0, 0.0, hx, hy, ch * 1.6),
                 octagon(0.0, 0.0, hx * 0.97, hy * 0.97, ch * 1.5), deck_z, deck_z + 1.5)


def _under_bracing(buf, style, mats, legs, deck_z, lod):
    """Horizontal ties between caissons. Reads as engineered rather than four
    posts holding a tray, and it is what sells the underside from a low camera.

    `legs` must walk the perimeter in order, so each consecutive pair shares a
    coordinate and the tie is axis-aligned -- no oriented-box primitive needed.
    """
    if lod >= 2 or len(legs) < 2:
        return
    for i in range(len(legs)):
        ax, ay = legs[i]
        bx, by = legs[(i + 1) % len(legs)]
        mx, my = (ax + bx) * 0.5, (ay + by) * 0.5
        dx, dy = abs(bx - ax), abs(by - ay)
        for f in (0.42, 0.80):
            z = WATER_Z + (deck_z - WATER_Z) * f
            buf.box("bracing", "metal", (mx, my, z),
                    (dx + 1.6 if dx > dy else 1.6, dy + 1.6 if dy >= dx else 1.6, 1.6))


def _perimeter_legs(hx, hy, fx, fy):
    """Corner positions walked in order around the rectangle."""
    return [(-hx * fx, -hy * fy), (hx * fx, -hy * fy),
            (hx * fx, hy * fy), (-hx * fx, hy * fy)]


def _perimeter_legs_8(hx, hy, fx, fy):
    """Corners plus mid-edges, still walked in order. A 96 m deck on four legs
    reads as a table; eight legs read as a structure."""
    return [(-hx * fx, -hy * fy), (0.0, -hy * fy), (hx * fx, -hy * fy),
            (hx * fx, 0.0), (hx * fx, hy * fy), (0.0, hy * fy),
            (-hx * fx, hy * fy), (-hx * fx, 0.0)]


def platform_legs(spec, hx, hy):
    """Single source of truth for where a platform stands, so the visible legs
    and the physics proxy cannot drift apart."""
    form = spec["form"]
    if form == "platform":
        return _perimeter_legs_8(hx, hy, 0.66, 0.66), 8.6
    if form == "rig":
        return _perimeter_legs(hx, hy, 0.66, 0.66), 6.6
    if form == "landing":
        return _perimeter_legs(hx, hy, 0.58, 0.58), 6.4
    return [], 0.0


def _deck_dressing(buf, style, mats, hx, hy, deck_z, lod, rng, tag, keep_clear=0.0):
    """Container stacks and deck plant. A bare slab reads as a plate; this is
    what makes it read as a working platform."""
    if lod > 0:
        return
    for i in range(6):
        w = rng.range(5.0, 9.0, tag, "cw", i)
        d = rng.range(4.0, 7.0, tag, "cd", i)
        h = rng.range(2.6, 6.4, tag, "chh", i)
        cx = rng.range(-hx * 0.72, hx * 0.72, tag, "cx", i)
        cy = rng.range(-hy * 0.72, hy * 0.72, tag, "cy", i)
        if abs(cx) < keep_clear and abs(cy) < keep_clear:
            continue
        mat = mats["armour"] if rng.chance(0.5, tag, "cm", i) else mats["deck"]
        buf.mass("container_stack", mat,
                 octagon(cx, cy, w * 0.5, d * 0.5, 0.5),
                 octagon(cx, cy, w * 0.47, d * 0.47, 0.5), deck_z, deck_z + h)
    for i in range(2):
        cx = rng.range(-hx * 0.6, hx * 0.6, tag, "px", i)
        cy = rng.range(-hy * 0.6, hy * 0.6, tag, "py", i)
        if abs(cx) < keep_clear and abs(cy) < keep_clear:
            continue
        buf.cyl("deck_plant", "metal", (cx, cy, deck_z + 3.0), rng.range(1.2, 2.2, tag, "pr", i),
                6.0, 8)


def form_platform(buf, spec, style, mats, lod, rng, scale):
    """The big one: a 3x3 (96 m) deck standing out of open water on four
    caissons that run to the seabed at -26."""
    hx, hy = footprint(spec)
    deck_z = spec["deck"]
    floor_z = SEABED_Z if spec.get("anchor") == "ocean" else -7.0
    legs, leg_r = platform_legs(spec, hx, hy)
    for i, (lx, ly) in enumerate(legs):
        caisson(buf, style, mats, lx, ly, leg_r, deck_z, floor_z, lod, rng, "leg%d" % i)
    _under_bracing(buf, style, mats, legs, deck_z, lod)
    _deck_slab(buf, style, mats, hx, hy, deck_z, lod, thickness=5.0)
    sides = banded_sides(spec)
    # Superstructure on the deck, set well inboard of the edge.
    bx, by = hx * 0.46, hy * 0.40
    block_top = deck_z + FLOOR_M * 7.0
    mega_shell(buf, style, mats, -hx * 0.22, 0.0, bx, by, deck_z, block_top, lod, rng, "plat",
               course=9.0, glaze_sides=sides, inset=style["inset"] * 0.5)
    mega_cornice(buf, style, mats, -hx * 0.22, 0.0, bx, by, block_top, lod, z0=deck_z,
                 inset=style["inset"] * 0.5)
    if lod < 2:
        add_roof_plant(buf, style, bx, by, block_top, lod, rng)
        _deck_dressing(buf, style, mats, hx * 0.86, hy * 0.86, deck_z, lod, rng, "platdeck",
                       keep_clear=hx * 0.30)
        # Deck cranes on the open half.
        for k in range(2):
            px = hx * 0.42
            py = (k - 0.5) * hy * 0.9
            buf.cyl("crane", "metal", (px, py, deck_z + 11.0), 1.5, 22.0, 6)
            buf.box("crane", "metal", (px - 9.0, py, deck_z + 21.0), (24.0, 1.4, 1.4))
        add_deck_plating(buf, style, mats, 0.0, 0.0, hx * 0.96, hy * 0.96, deck_z, lod, rng, "pd")
        for sgn in (-1.0, 1.0):
            add_railing(buf, style, mats, -hx, hx, sgn * hy * 0.97, deck_z, lod, rng,
                        "pdr%d" % int(sgn), axis="x", lamps=4)
            add_railing(buf, style, mats, -hy, hy, sgn * hx * 0.97, deck_z, lod, rng,
                        "pde%d" % int(sgn), axis="y", lamps=4)
        if style["emissive"] > 0.0:
            for sgn in (-1.0, 1.0):
                buf.box("window_emissive", "emissive", (sgn * hx * 0.9, 0.0, deck_z + 1.0),
                        (1.2, hy * 1.6, 0.3))
    return block_top


def form_rig(buf, spec, style, mats, lod, rng, scale):
    """Industrial rig: derrick, flare boom, and a deck you can land on."""
    hx, hy = footprint(spec)
    deck_z = spec["deck"]
    floor_z = SEABED_Z
    legs, leg_r = platform_legs(spec, hx, hy)
    for i, (lx, ly) in enumerate(legs):
        caisson(buf, style, mats, lx, ly, leg_r, deck_z, floor_z, lod, rng, "rigleg%d" % i)
    _under_bracing(buf, style, mats, legs, deck_z, lod)
    _deck_slab(buf, style, mats, hx, hy, deck_z, lod, thickness=4.4)
    block_top = deck_z + FLOOR_M * 5.0
    mega_shell(buf, style, mats, -hx * 0.42, 0.0, hx * 0.34, hy * 0.72, deck_z, block_top,
               lod, rng, "rig", course=8.0, glaze_sides=["S"], inset=style["inset"] * 0.5)
    mega_cornice(buf, style, mats, -hx * 0.42, 0.0, hx * 0.34, hy * 0.72, block_top, lod,
                 z0=deck_z, inset=style["inset"] * 0.5)
    derrick_h = deck_z + FLOOR_M * 13.0
    ch = style["chamfer"]
    buf.mass("derrick", "metal",
             octagon(hx * 0.34, 0.0, hx * 0.30, hy * 0.30, ch),
             octagon(hx * 0.34, 0.0, hx * 0.11, hy * 0.11, ch * 0.5), deck_z, derrick_h)
    if lod < 2:
        for k in range(4):
            z = deck_z + (derrick_h - deck_z) * (0.22 + k * 0.2)
            f = 1.0 - (0.22 + k * 0.2) * 0.62
            buf.box("derrick", "metal", (hx * 0.34, 0.0, z), (hx * 0.62 * f, hy * 0.62 * f, 0.8))
        _deck_dressing(buf, style, mats, hx * 0.78, hy * 0.78, deck_z, lod, rng, "rigdeck",
                       keep_clear=hx * 0.34)
        buf.cyl("flare_boom", "metal", (hx * 0.86, hy * 0.86, deck_z + 9.0), 0.9, 20.0, 6)
        buf.cyl("flare_boom", "hazard", (hx * 0.86, hy * 0.86, deck_z + 19.5), 1.5, 2.2, 6)
        add_deck_plating(buf, style, mats, 0.0, 0.0, hx * 0.94, hy * 0.94, deck_z, lod, rng, "rg")
        for sgn in (-1.0, 1.0):
            add_railing(buf, style, mats, -hx, hx, sgn * hy * 0.97, deck_z, lod, rng,
                        "rgr%d" % int(sgn), axis="x", lamps=3)
    return derrick_h


def form_landing(buf, spec, style, mats, lod, rng, scale):
    """Terrain-anchored landing platform: short legs into rock, an apron at
    grade, and a marked pad."""
    hx, hy = footprint(spec)
    deck_z = spec["deck"]
    ch = style["chamfer"]
    legs, leg_r = platform_legs(spec, hx, hy)
    for i, (lx, ly) in enumerate(legs):
        buf.mass("pylon_leg", mats["wall"],
                 octagon(lx, ly, leg_r, leg_r, ch),
                 octagon(lx, ly, leg_r * 0.72, leg_r * 0.72, ch * 0.8), -7.0, deck_z)
        if lod < 2:
            buf.mass("rock_apron", "rubble",
                     octagon(lx, ly, 9.5, 9.5, 1.6),
                     octagon(lx, ly, 6.6, 6.6, 1.2), -1.0, rng.range(2.4, 4.6, "apron", i))
    _under_bracing(buf, style, mats, legs, deck_z, lod)
    _deck_slab(buf, style, mats, hx, hy, deck_z, lod, thickness=3.8)
    if lod < 2:
        # Pad marking: a recessed ring, then the crossbars.
        buf.mass("pad_marking", "recess",
                 octagon(0.0, 0.0, hx * 0.62, hy * 0.62, ch * 2.0),
                 octagon(0.0, 0.0, hx * 0.62, hy * 0.62, ch * 2.0), deck_z, deck_z + 0.22)
        buf.mass("pad_marking", mats["armour"],
                 octagon(0.0, 0.0, hx * 0.50, hy * 0.50, ch * 1.8),
                 octagon(0.0, 0.0, hx * 0.50, hy * 0.50, ch * 1.8), deck_z + 0.05, deck_z + 0.3)
        buf.box("handrail", "grate", (0.0, hy * 0.97, deck_z + 2.0), (hx * 1.85, 0.3, 1.5))
        buf.box("handrail", "grate", (0.0, -hy * 0.97, deck_z + 2.0), (hx * 1.85, 0.3, 1.5))
        if style["emissive"] > 0.0:
            for k in range(8):
                a = math.tau * k / 8.0
                buf.box("approach_light", "emissive",
                        (math.cos(a) * hx * 0.80, math.sin(a) * hy * 0.80, deck_z + 0.7),
                        (1.6, 1.6, 0.5))
    control_top = deck_z + FLOOR_M * 4.0
    mega_shell(buf, style, mats, -hx * 0.66, -hy * 0.66, hx * 0.26, hy * 0.26, deck_z,
               control_top, lod, rng, "landing", course=7.0, glaze_sides=["N", "E"],
               inset=style["inset"] * 0.4)
    mega_cornice(buf, style, mats, -hx * 0.66, -hy * 0.66, hx * 0.26, hy * 0.26, control_top,
                 lod, z0=deck_z, inset=style["inset"] * 0.4)
    return control_top


def form_causeway(buf, spec, style, mats, lod, rng, scale):
    """A 2x1 span that chains end to end on its E/W `open` edges, so a run of
    them bridges any distance. The deck reaches the plane exactly."""
    hx, hy = footprint(spec)
    deck_z = spec["deck"]
    floor_z = SEABED_Z
    ch = style["chamfer"]
    piers = 2 if lod >= 2 else 3
    for i in range(piers):
        t = -hx * 0.62 + (hx * 1.24) * (i / float(max(1, piers - 1)))
        caisson(buf, style, mats, t, 0.0, 5.4, deck_z, floor_z, lod, rng, "pier%d" % i)
    # Deck: full X so two causeways butt without a seam.
    buf.mass("deck_slab", mats["deck"],
             octagon(0.0, 0.0, hx, hy * 0.46, ch),
             octagon(0.0, 0.0, hx, hy * 0.40, ch), deck_z - 4.0, deck_z)
    if lod < 2:
        buf.mass("deck_edge", mats["armour"],
                 octagon(0.0, 0.0, hx, hy * 0.42, ch),
                 octagon(0.0, 0.0, hx, hy * 0.38, ch), deck_z, deck_z + 1.3)
        for sgn in (-1.0, 1.0):
            buf.box("handrail", "grate", (0.0, sgn * hy * 0.40, deck_z + 2.6),
                    (hx * 2.0, 0.3, 2.0))
            posts = 4 if lod == 0 else 2
            for k in range(posts):
                buf.box("handrail", mats["trim"],
                        (-hx + (hx * 2.0 / posts) * (k + 0.5), sgn * hy * 0.40, deck_z + 2.6),
                        (0.7, 0.7, 2.2))
        if style["emissive"] > 0.0:
            buf.box("window_emissive", "emissive", (0.0, hy * 0.40, deck_z + 3.5),
                    (hx * 1.9, 0.24, 0.24))
    return deck_z + 3.6


def form_plat_ramp(buf, spec, style, mats, lod, rng, scale):
    """Straight approach ramp: grade at the W edge, deck level at the E edge.

    Both ends land exactly on their cell plane at the right height, so a
    causeway or a platform can butt either end.
    """
    hx, hy = footprint(spec)
    deck_z = spec["deck"]
    floor_z = SEABED_Z if spec.get("anchor") == "ocean" else -7.0
    low_z = 1.4
    half_w = 10.0

    def deck_at(x):
        f = (x + hx) / (2.0 * hx)
        return low_z + (deck_z - low_z) * max(0.0, min(1.0, f))

    sloped_slab(buf, "ramp_deck", mats["deck"], -hx, hx, low_z, deck_z, half_w, 3.2)
    for sgn in (-1.0, 1.0):
        sloped_slab(buf, "ramp_parapet", mats["wall"], -hx, hx, low_z + 2.6, deck_z + 2.6,
                    1.1, 3.6, offset=sgn * (half_w + 1.1))
    pier_x = [-hx * 0.55, 0.0, hx * 0.55] if lod < 2 else [0.0]
    for i, px in enumerate(pier_x):
        top = deck_at(px) - 2.6
        if top - floor_z > 1.5:
            caisson(buf, style, mats, px, 0.0, 4.8, top, floor_z, lod, rng, "rmp%d" % i)
    if lod < 2:
        ribs = 10 if lod == 0 else 5
        for i in range(ribs):
            x = -hx + (2.0 * hx) * ((i + 0.5) / ribs)
            buf.box("ramp_rib", mats["trim"], (x, 0.0, deck_at(x) + 0.12),
                    (1.1, half_w * 1.92, 0.24))
        for sgn in (-1.0, 1.0):
            sloped_slab(buf, "ramp_kerb", mats["armour"], -hx, hx, low_z + 0.55, deck_z + 0.55,
                        0.5, 0.7, offset=sgn * (half_w - 0.5))
            if style["emissive"] > 0.0:
                sloped_slab(buf, "window_emissive", "emissive", -hx, hx,
                            low_z + 0.9, deck_z + 0.9, 0.16, 0.22,
                            offset=sgn * (half_w - 0.5))
    return deck_z + 2.6


def form_ramp_tower(buf, spec, style, mats, lod, rng, scale):
    """The same 26 m climb folded into one 2x2 cell: two flights at right
    angles around a central core, in at the S edge at grade, out at the N edge
    at deck level."""
    hx, hy = footprint(spec)
    deck_z = spec["deck"]
    floor_z = -7.0
    mid_z = deck_z * 0.52
    low_z = 1.4
    half_w = 7.0
    ch = style["chamfer"]

    buf.mass("shell_mass", mats["wall"],
             octagon(0.0, 0.0, hx * 0.40, hy * 0.40, ch * 1.2),
             octagon(0.0, 0.0, hx * 0.34, hy * 0.34, ch), floor_z, deck_z)
    mega_cornice(buf, style, mats, 0.0, 0.0, hx * 0.40, hy * 0.40, deck_z, lod,
                 inset=style["inset"] * 0.5)

    sloped_slab(buf, "ramp_deck", mats["deck"], -hx, hx * 0.58, low_z, mid_z, half_w, 3.0,
                axis="x", offset=-hy * 0.62)
    buf.mass("ramp_landing", mats["deck"],
             octagon(hx * 0.70, -hy * 0.62, hx * 0.28, half_w, ch * 0.7),
             octagon(hx * 0.70, -hy * 0.62, hx * 0.28, half_w, ch * 0.7),
             mid_z - 3.0, mid_z)
    sloped_slab(buf, "ramp_deck", mats["deck"], -hy * 0.58, hy, mid_z, deck_z, half_w, 3.0,
                axis="y", offset=hx * 0.70)

    if lod < 2:
        for sgn in (-1.0, 1.0):
            sloped_slab(buf, "ramp_parapet", mats["wall"], -hx, hx * 0.58,
                        low_z + 2.4, mid_z + 2.4, 1.0, 3.2, axis="x",
                        offset=-hy * 0.62 + sgn * (half_w + 1.0))
            sloped_slab(buf, "ramp_parapet", mats["wall"], -hy * 0.58, hy,
                        mid_z + 2.4, deck_z + 2.4, 1.0, 3.2, axis="y",
                        offset=hx * 0.70 + sgn * (half_w + 1.0))
        ribs = 6 if lod == 0 else 3
        for i in range(ribs):
            f = (i + 0.5) / ribs
            buf.box("ramp_rib", mats["trim"],
                    (-hx + (hx * 1.58) * f, -hy * 0.62, low_z + (mid_z - low_z) * f + 0.12),
                    (1.0, half_w * 1.9, 0.22))
            buf.box("ramp_rib", mats["trim"],
                    (hx * 0.70, -hy * 0.58 + (hy * 1.58) * f,
                     mid_z + (deck_z - mid_z) * f + 0.12),
                    (half_w * 1.9, 1.0, 0.22))
    for i, (px, py) in enumerate(((-hx * 0.72, -hy * 0.62), (hx * 0.70, -hy * 0.62),
                                  (hx * 0.70, hy * 0.62))):
        buf.mass("pylon_leg", mats["wall"],
                 octagon(px, py, 5.2, 5.2, ch * 0.8),
                 octagon(px, py, 3.8, 3.8, ch * 0.6), floor_z, mid_z)
    return deck_z + 2.6


def form_disc(buf, spec, style, mats, lod, rng, scale):
    """The hero platform: a 4x4 disc with a concentric ring plan, a thick lit
    rim, and a single tapering column carrying it. Spokes reach out from it."""
    hx, hy = footprint(spec)
    deck_z = spec["deck"]
    floor_z = SEABED_Z if spec.get("anchor") == "ocean" else -7.0
    r = min(hx, hy) - 1.6
    segs = 36 if lod == 0 else (18 if lod == 1 else 12)
    thick = 5.0

    buf.cyl("deck_slab", mats["deck"], (0.0, 0.0, deck_z - thick * 0.5), r * 0.985, thick, segs)
    # rim fascia: the thick lit band that makes a disc read as engineered
    annulus(buf, "deck_edge", mats["armour"], 0.0, 0.0, r, r * 0.94,
            deck_z - thick, deck_z + 1.7, segs)
    if lod < 2:
        annulus(buf, "rim_light", "emissive", 0.0, 0.0, r * 0.998, r * 0.955,
                deck_z - 1.2, deck_z - 0.5, segs)
        # concentric ring grooves, and radial dividers between them
        for k, f in enumerate((0.34, 0.55, 0.76)):
            annulus(buf, "deck_groove", "slot", 0.0, 0.0, r * f, r * (f - 0.035),
                    deck_z - 0.34, deck_z, segs)
        spokes = 8 if lod == 0 else 4
        for i in range(spokes):
            a = math.tau * i / spokes
            buf.box("deck_groove", "slot",
                    (math.cos(a) * r * 0.55, math.sin(a) * r * 0.55, deck_z - 0.17),
                    (0.55 if abs(math.cos(a)) < 0.5 else r * 0.84,
                     0.55 if abs(math.cos(a)) >= 0.5 else r * 0.84, 0.34))
    # central column down to the floor, plus a ring of struts
    buf.mass("caisson", mats["wall"],
             octagon(0.0, 0.0, r * 0.30, r * 0.30, style["chamfer"] * 1.4),
             octagon(0.0, 0.0, r * 0.20, r * 0.20, style["chamfer"]), floor_z, deck_z - thick)
    buf.mass("caisson_submerged", "submerged",
             octagon(0.0, 0.0, r * 0.36, r * 0.36, style["chamfer"] * 1.4),
             octagon(0.0, 0.0, r * 0.30, r * 0.30, style["chamfer"] * 1.2),
             floor_z, WATER_Z)
    if lod < 2:
        for i in range(6):
            a = math.tau * i / 6.0
            buf.cyl("bracing", "metal",
                    (math.cos(a) * r * 0.58, math.sin(a) * r * 0.58,
                     (deck_z - thick + WATER_Z) * 0.5),
                    1.5, deck_z - thick - WATER_Z, 6)
        block_top = deck_z + FLOOR_M * 5.0
        mega_shell(buf, style, mats, 0.0, 0.0, r * 0.26, r * 0.26, deck_z, block_top,
                   lod, rng, "disc", course=9.0, glaze_sides=["N", "E", "S", "W"],
                   inset=style["inset"] * 0.5)
        mega_cornice(buf, style, mats, 0.0, 0.0, r * 0.26, r * 0.26, block_top, lod,
                     z0=deck_z, inset=style["inset"] * 0.5)
        add_roof_plant(buf, style, r * 0.26, r * 0.26, block_top, lod, rng)
        return block_top
    return deck_z + 1.7


def form_spoke(buf, spec, style, mats, lod, rng, scale):
    """A radial arm: narrow, railed, lamp-lit, on slender piers. Chains E-W so
    a disc can reach any distance to the terrain around it."""
    hx, hy = footprint(spec)
    deck_z = spec["deck"]
    floor_z = SEABED_Z if spec.get("anchor") == "ocean" else -7.0
    half_w = hy * 0.34
    ch = style["chamfer"]
    buf.mass("deck_slab", mats["deck"],
             octagon(0.0, 0.0, hx, half_w, ch),
             octagon(0.0, 0.0, hx, half_w * 0.92, ch), deck_z - 3.4, deck_z)
    piers = 2 if lod >= 2 else 3
    for i in range(piers):
        t = -hx * 0.6 + (hx * 1.2) * (i / float(max(1, piers - 1)))
        caisson(buf, style, mats, t, 0.0, 4.2, deck_z - 3.4, floor_z, lod, rng, "spk%d" % i)
    if lod < 2:
        add_deck_plating(buf, style, mats, 0.0, 0.0, hx, half_w, deck_z, lod, rng, "spoke",
                         cell=7.0)
        for sgn in (-1.0, 1.0):
            add_railing(buf, style, mats, -hx, hx, sgn * half_w, deck_z, lod, rng,
                        "spk%d" % int(sgn), axis="x", lamps=3)
    return deck_z + 6.7


def form_split_deck(buf, spec, style, mats, lod, rng, scale):
    """Two decks at different levels in one cell with a void between them,
    joined by a short ramp -- the multi-level read the references are built on."""
    hx, hy = footprint(spec)
    hi_z = spec["deck"]
    lo_z = hi_z - 9.0
    floor_z = -7.0
    ch = style["chamfer"]
    gap = 4.0
    hi_half = hy * 0.42
    lo_half = hy * 0.42

    buf.mass("deck_slab", mats["deck"],
             octagon(0.0, hy - hi_half, hx, hi_half, ch),
             octagon(0.0, hy - hi_half, hx, hi_half * 0.96, ch), hi_z - 4.0, hi_z)
    buf.mass("deck_slab", mats["deck"],
             octagon(0.0, -hy + lo_half, hx, lo_half, ch),
             octagon(0.0, -hy + lo_half, hx, lo_half * 0.96, ch), lo_z - 4.0, lo_z)
    for (px, py, top) in ((-hx * 0.62, hy - hi_half, hi_z - 4.0),
                          (hx * 0.62, hy - hi_half, hi_z - 4.0),
                          (-hx * 0.62, -hy + lo_half, lo_z - 4.0),
                          (hx * 0.62, -hy + lo_half, lo_z - 4.0)):
        buf.mass("pylon_leg", mats["wall"],
                 octagon(px, py, 5.4, 5.4, ch),
                 octagon(px, py, 4.0, 4.0, ch * 0.8), floor_z, top)
    # the connecting ramp, offset to one side so the void stays open
    sloped_slab(buf, "ramp_deck", mats["deck"], -hy + lo_half * 2.0, hy - hi_half * 2.0,
                lo_z, hi_z, 5.0, 2.6, axis="y", offset=hx * 0.58)
    if lod < 2:
        add_deck_plating(buf, style, mats, 0.0, hy - hi_half, hx, hi_half, hi_z, lod, rng, "hi")
        add_deck_plating(buf, style, mats, 0.0, -hy + lo_half, hx, lo_half, lo_z, lod, rng, "lo")
        add_railing(buf, style, mats, -hx, hx * 0.4, hy - hi_half * 2.0, hi_z, lod, rng,
                    "hiedge", axis="x", lamps=2)
        add_railing(buf, style, mats, -hx, hx * 0.4, -hy + lo_half * 2.0, lo_z, lod, rng,
                    "loedge", axis="x", lamps=2)
        for sgn in (-1.0, 1.0):
            add_railing(buf, style, mats, hx * 0.44, hx * 0.72,
                        sgn * (hy - hi_half * 2.0) * 0.0 + hx * 0.0, hi_z, lod, rng,
                        "x%d" % int(sgn), axis="x", lamps=0)
    return hi_z + 6.7


FORMS = {
    "wall": form_wall, "wall_corner": form_wall_corner, "wall_gate": form_wall_gate,
    "wall_bastion": form_wall_bastion, "wall_ramp": form_wall_ramp,
    "wall_terminus": form_wall_terminus,
    "needle": form_needle, "monolith": form_monolith, "crown": form_crown,
    "pylon": form_pylon,
    "platform": form_platform, "rig": form_rig, "landing": form_landing,
    "causeway": form_causeway,
    "plat_ramp": form_plat_ramp, "ramp_tower": form_ramp_tower,
    "disc": form_disc, "spoke": form_spoke, "split_deck": form_split_deck,
}


# ---------------------------------------------------------------------------
# module assembly
# ---------------------------------------------------------------------------
BEVEL_ROLES = {
    "shell_mass", "spandrel", "window_drum", "cornice", "base_block", "crown",
    "deck_slab", "deck_edge", "caisson", "caisson_submerged", "waterline_collar",
    "buttress", "buttress_leg", "bastion", "corner_tower", "anchor_block",
    "parapet_armour", "turret_mount", "sensor_head", "equipment_band",
    "blast_door", "conduit_rail", "pylon_leg", "derrick", "fin",
    "armour_plate", "hab_pod",
    "gate_lintel", "ramp", "pad_marking",
}

# Forms whose geometry is the whole module -- no generic roof dressing.
BARE_FORMS = {"wall", "wall_corner", "wall_gate", "wall_bastion", "wall_ramp",
              "wall_terminus", "platform", "rig", "landing", "causeway",
              "plat_ramp", "ramp_tower", "disc", "spoke", "split_deck"}


def collision_boxes(spec, hx, hy, top, floor_z):
    """Convex proxies. Platforms get a deck box plus leg boxes rather than one
    slab from the seabed up, or a unit could not sail underneath."""
    form = spec["form"]
    inset = 0.4
    if form in ("platform", "rig", "landing", "causeway"):
        deck_z = spec.get("deck", 20.0)
        out = [((0.0, 0.0, deck_z - 2.2), (hx * 2.0 - inset, hy * 2.0 - inset, 4.6))]
        if form == "causeway":
            for i in range(3):
                t = -hx * 0.62 + (hx * 1.24) * (i / 2.0)
                out.append(((t, 0.0, (floor_z + deck_z) * 0.5), (11.0, 11.0, deck_z - floor_z)))
        else:
            legs, leg_r = platform_legs(spec, hx, hy)
            for (lx, ly) in legs:
                out.append(((lx, ly, (floor_z + deck_z) * 0.5),
                            (leg_r * 2.2, leg_r * 2.2, deck_z - floor_z)))
        if top > deck_z + 2.0:
            out.append(((0.0, 0.0, (deck_z + top) * 0.5),
                        (hx * 1.1, hy * 1.1, top - deck_z)))
        return out
    if form in ("wall", "wall_ramp", "wall_bastion"):
        return [((0.0, 0.0, top * 0.5), (hx * 2.0, WALL_HALF_T * 2.0, top))]
    if form == "wall_gate":
        pier = hx - 10.0
        return [((-(10.0 + pier * 0.5), 0.0, top * 0.5), (pier - inset, WALL_HALF_T * 2.0, top)),
                (((10.0 + pier * 0.5), 0.0, top * 0.5), (pier - inset, WALL_HALF_T * 2.0, top)),
                ((0.0, 0.0, (10.0 + top) * 0.5), (20.0, WALL_HALF_T * 2.0, max(0.5, top - 10.0)))]
    if form == "wall_corner":
        return [((hx * 0.5, 0.0, top * 0.5), (hx, WALL_HALF_T * 2.0, top)),
                ((0.0, hy * 0.5, top * 0.5), (WALL_HALF_T * 2.0, hy, top))]
    if form == "wall_terminus":
        return [((hx * 0.34, 0.0, top * 0.5), (hx * 1.32, WALL_HALF_T * 2.0, top)),
                ((-hx * 0.60, 0.0, top * 0.5), (hx * 0.8, WALL_HALF_T * 3.5, top))]
    return [((0.0, 0.0, top * 0.5), (hx * 2.0 - inset, hy * 2.0 - inset, top))]


def object_bounds(objects):
    lo = [1e9, 1e9, 1e9]
    hi = [-1e9, -1e9, -1e9]
    for obj in objects:
        if obj.type != "MESH":
            continue
        for corner in obj.bound_box:
            world = obj.matrix_world @ Vector(corner)
            for i in range(3):
                lo[i] = min(lo[i], world[i])
                hi[i] = max(hi[i], world[i])
    if lo[0] > hi[0]:
        return (0.0, 0.0, 0.0), (1.0, 1.0, 1.0)
    return tuple(lo), tuple(hi)


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
    root.location = (
        spec["layout"][0] * LAYOUT_PITCH_X + STYLE_LAYOUT_OFFSET[style_id],
        -spec["layout"][1] * LAYOUT_PITCH_Y, 0.0,
    )
    root["mf_asset_kind"] = "superstructure"
    root["mf_module_id"] = module_key
    root["mf_archetype"] = spec["id"]
    root["mf_style"] = style_id
    root["mf_style_label"] = style["label"]
    root["mf_superstructure_class"] = spec["class"]
    root["mf_grid_m"] = GRID_M
    root["mf_floor_m"] = FLOOR_M
    root["mf_party_joint_m"] = JOINT_M
    root["mf_cells"] = json.dumps(list(spec["cells"]), separators=(",", ":"))
    root["mf_footprint_m"] = json.dumps([cells_x * GRID_M, cells_y * GRID_M], separators=(",", ":"))
    root["mf_edges"] = json.dumps(spec["edges"], separators=(",", ":"), sort_keys=True)
    root["mf_water_z"] = WATER_Z
    if spec["class"] == "wall":
        root["mf_wall_run_axis"] = "EW"
        root["mf_wall_thickness_m"] = WALL_HALF_T * 2.0
    if spec["class"] == "platform":
        root["mf_anchor"] = spec.get("anchor", "terrain")
        root["mf_deck_z"] = spec["deck"]
        root["mf_seabed_z"] = SEABED_Z if spec.get("anchor") == "ocean" else -7.0
        root["mf_submerged"] = spec.get("anchor") == "ocean"
    if spec["form"] == "wall_gate":
        blocked = style["ruin"] > 0.0
        root["mf_gate_passable"] = not blocked
        root["mf_gate_clear_width_m"] = 0.0 if blocked else 20.0
        root["mf_gate_clear_height_m"] = 0.0 if blocked else 10.0

    lod_records, role_triangles = [], {}
    top_height, floor_z = 0.0, 0.0
    lod0_objects = []

    for lod in range(3):
        lod_collection = linked_collection(
            module_collection, PREFIX + "_" + module_key.upper() + "_LOD%d" % lod)
        buf = GeoBuf()
        top = FORMS[spec["form"]](buf, spec, style, mats, lod, rng, scale)
        top_height = max(top_height, top)
        if spec["class"] == "platform":
            floor_z = SEABED_Z if spec.get("anchor") == "ocean" else -7.0

        bevel_width, bevel_segments = style["bevel"]
        lod_triangles = 0
        for (role, material_key), (vertices, faces) in sorted(buf.buckets.items()):
            obj = mesh_object(
                lod_collection, "%s_%s_LOD%d_%s" % (PREFIX, module_key, lod, role.upper()),
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

    # ---- sockets ----------------------------------------------------------
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
                location, "ARROWS")
            socket.rotation_euler[2] = angle
            socket["mf_role"] = "superstructure_socket"
            socket["mf_direction"] = direction
            socket["mf_socket_type"] = spec["edges"][direction]
            socket["mf_cell_index"] = index
            socket["mf_grid_m"] = GRID_M
            socket["mf_blind"] = spec["edges"][direction] == "party_wall"
            # A wall segment's E/W sockets are its run: they must butt exactly.
            socket["mf_wall_run"] = bool(spec["class"] == "wall" and direction in ("E", "W"))
            # What HEIGHT this edge presents. A ramp is only useful if a placer
            # knows which of its ends is at grade and which is at deck level,
            # so it can put the high end against a platform and the low end on
            # the ground rather than the other way round.
            form = spec["form"]
            if form == "plat_ramp":
                edge_z = spec["deck"] if direction == "E" else 0.0
            elif form == "ramp_tower":
                edge_z = spec["deck"] if direction == "N" else 0.0
            elif spec["class"] == "platform":
                edge_z = float(spec.get("deck", 0.0))
            else:
                edge_z = 0.0
            socket["mf_edge_z"] = edge_z
            sockets.append(socket)

    top_socket = create_empty(
        module_collection, "%s_%s_SOCKET_TOP" % (PREFIX, module_key.upper()), root,
        (0.0, 0.0, top_height), "SPHERE")
    top_socket["mf_role"] = "top_prop_socket"
    top_socket["mf_height_m"] = top_height

    nav = create_empty(module_collection, "%s_%s_NAV" % (PREFIX, module_key.upper()), root,
                       display="CIRCLE")
    nav["mf_role"] = "navigation_metadata"
    nav["mf_blocks_movement"] = True
    nav["mf_footprint_cells"] = json.dumps(list(spec["cells"]), separators=(",", ":"))
    if spec["class"] == "platform":
        nav["mf_deck_walkable_z"] = spec["deck"]
        nav["mf_passable_beneath"] = True

    collision_collection = linked_collection(
        module_collection, PREFIX + "_" + module_key.upper() + "_COLLISION")
    vertices, faces = [], []
    for center, size in collision_boxes(spec, hx, hy, top_height, floor_z):
        append_box(vertices, faces, center, size)
    collision = mesh_object(
        collision_collection, "%s_%s_COLLISION" % (PREFIX, module_key.upper()),
        vertices, faces, None, root)
    collision.display_type = "WIRE"
    collision.hide_render = True
    collision["mf_role"] = "simplified_collision"
    collision["mf_collision_class"] = "superstructure"
    collision["mf_height_m"] = top_height

    all_objects = [root] + descendants(root)
    for obj in all_objects:
        if obj.get("mf_lod", 0) > 0:
            obj.hide_render = True

    # matrix_world is stale until the depsgraph catches up with the parenting
    # done above, and every camera frame in this kit is derived from these
    # bounds -- a 292 m tower framed off an unevaluated matrix renders empty.
    bpy.context.view_layer.update()
    bounds_lo, bounds_hi = object_bounds(lod0_objects)
    return {
        "spec": spec, "style": style_id, "key": module_key,
        "collection": module_collection, "root": root, "objects": all_objects,
        "sockets": sockets, "collision": collision, "lods": lod_records,
        "roleTriangles": role_triangles, "height": top_height,
        "scale": scale, "boundsLo": bounds_lo, "boundsHi": bounds_hi,
    }


# ---------------------------------------------------------------------------
# tiling proofs
# ---------------------------------------------------------------------------
BLOCK_PROOFS = (
    {"id": "rampart_run", "style": "brutalist", "row": 0, "axis": "x",
     "items": ["wall_terminus", "wall_straight", "wall_gate", "wall_straight",
               "wall_bastion", "wall_corner"]},
    {"id": "breached_wall", "style": "ruined", "row": 1, "axis": "x",
     "items": ["wall_straight", "wall_gate", "wall_straight", "wall_bastion"]},
    {"id": "skyline", "style": "brutalist", "row": 2, "axis": "x",
     "items": ["spire_needle", "tower_monolith", "spire_crown", "arcology_pylon"]},
    {"id": "offshore", "style": "colonial", "row": 3, "axis": "x",
     "items": ["platform_ramp", "platform_rig", "platform_causeway", "platform_deck"]},
    {"id": "platform_network", "style": "brutalist", "row": 4, "axis": "x",
     "items": ["platform_spoke", "platform_disc", "platform_spoke", "platform_split"]},
)
BLOCK_ORIGIN_X = -2600.0
BLOCK_ROW_PITCH = 460.0


def build_block_proof(master, modules):
    by_key = {module["key"]: module for module in modules}
    proof_collection = linked_collection(master, PREFIX + "_TILING_PROOF")
    rows = []
    for proof in BLOCK_PROOFS:
        available = [i for i in proof["items"] if (proof["style"] + "_" + i) in by_key]
        if not available:
            continue
        row_collection = linked_collection(proof_collection,
                                           PREFIX + "_PROOF_" + proof["id"].upper())
        cursor, placed, tallest, lowest = 0.0, [], 0.0, 0.0
        for item in available:
            module = by_key[proof["style"] + "_" + item]
            cells_x, cells_y = module["spec"]["cells"]
            centre_x = BLOCK_ORIGIN_X + (cursor + cells_x * 0.5) * GRID_M
            centre_y = -proof["row"] * BLOCK_ROW_PITCH
            tallest = max(tallest, module["boundsHi"][2])
            lowest = min(lowest, module["boundsLo"][2])
            for source in module["objects"]:
                if source.type != "MESH" or int(source.get("mf_lod", 0)) != 0:
                    continue
                if source.get("mf_role") == "simplified_collision":
                    continue
                copy = source.copy()
                copy.parent = None
                copy.matrix_world = source.matrix_world.copy()
                copy.location = (source.location.x + centre_x,
                                 source.location.y + centre_y, source.location.z)
                copy["mf_proof_only"] = True
                copy.hide_render = False
                row_collection.objects.link(copy)
                placed.append(copy)
            cursor += cells_x
        rows.append({
            "id": proof["id"], "style": proof["style"], "items": available,
            "spanCells": cursor, "spanM": cursor * GRID_M,
            "centre": (BLOCK_ORIGIN_X + cursor * GRID_M * 0.5, -proof["row"] * BLOCK_ROW_PITCH),
            "tallest": tallest, "lowest": lowest, "objects": placed,
        })
    return proof_collection, rows


# ---------------------------------------------------------------------------
# evidence rig
# ---------------------------------------------------------------------------
def add_evidence_rig(master):
    """Two ground planes and a water sheet, toggled per shot.

    A land module wants ground at z=0. An ocean platform wants the seabed at
    -26 and a translucent sheet at WATER_Z, or the caissons photograph as legs
    on a table and the whole point of the archetype is lost.
    """
    helpers = linked_collection(master, PREFIX + "_EVIDENCE_RIG")

    def plane(name, size, z, rgba, alpha=1.0, metallic=0.04, rough=0.88):
        bpy.ops.mesh.primitive_plane_add(size=size, location=(0.0, 0.0, z))
        obj = bpy.context.object
        for collection in list(obj.users_collection):
            collection.objects.unlink(obj)
        helpers.objects.link(obj)
        obj.name = PREFIX + "_" + name
        obj.data["mf_schema"] = SCHEMA
        material = make_material("s_" + name.lower(), rgba, metallic, rough, alpha=alpha)
        material["mf_evidence_only"] = True
        obj.data.materials.append(material)
        obj["mf_evidence_only"] = True
        return obj

    land = plane("EVIDENCE_LAND", 9000.0, -0.05, (0.055, 0.068, 0.078, 1.0))
    seabed = plane("EVIDENCE_SEABED", 9000.0, SEABED_Z - 0.5, (0.042, 0.048, 0.044, 1.0))
    water = plane("EVIDENCE_WATER", 9000.0, WATER_Z, (0.020, 0.105, 0.148, 0.62),
                  alpha=0.62, metallic=0.10, rough=0.16)

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

    area("KEY", (400.0, -380.0, 560.0), 320000.0, 300.0, (0.76, 0.89, 1.0))
    area("FILL", (-330.0, -210.0, 380.0), 190000.0, 260.0, (0.30, 0.55, 0.88))
    area("RIM", (-200.0, 430.0, 440.0), 250000.0, 230.0, (1.0, 0.48, 0.20))
    camera_data = bpy.data.cameras.new(PREFIX + "_CAMERA")
    camera_data["mf_schema"] = SCHEMA
    camera_data.type = "ORTHO"
    camera_data.clip_start = 1.0
    camera_data.clip_end = 20000.0
    camera = bpy.data.objects.new(PREFIX + "_CAMERA", camera_data)
    helpers.objects.link(camera)
    camera["mf_evidence_only"] = True
    bpy.context.scene.camera = camera
    return helpers, land, seabed, water, camera


def configure_render(config):
    scene = bpy.context.scene
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
    camera.location = target + direction * (ortho_scale * 3.2)
    camera.rotation_euler = (target - camera.location).to_track_quat("-Z", "Y").to_euler()
    camera.data.ortho_scale = ortho_scale


MODULE_VIEWS = {
    "iso_ne": (1.2, 1.2, 0.82),
    "iso_nw": (-1.2, 1.2, 0.82),
    "top": (0.0, 0.001, 1.0),
    "entry": (0.0, 1.0, 0.30),
}


def _is_ocean(spec):
    return spec.get("anchor") == "ocean"


def set_visibility(modules, proof_rows, planes, visible_key=None, proof_id=None,
                   style_only=None):
    land, seabed, water = planes
    ocean = False
    for module in modules:
        if visible_key is not None:
            visible = module["key"] == visible_key
        elif proof_id is not None:
            visible = False
        elif style_only is not None:
            visible = module["style"] == style_only
        else:
            visible = True
        if visible and _is_ocean(module["spec"]):
            ocean = True
        for obj in module["objects"]:
            if obj.type != "MESH":
                continue
            obj.hide_render = (not visible or obj.get("mf_role") == "simplified_collision"
                               or int(obj.get("mf_lod", 0)) > 0)
    for row in proof_rows:
        row_visible = proof_id is not None and row["id"] == proof_id
        if row_visible and row["id"] == "offshore":
            ocean = True
        for obj in row["objects"]:
            obj.hide_render = not row_visible
    land.hide_render = ocean
    seabed.hide_render = not ocean
    water.hide_render = not ocean


def render_evidence(config, modules, proof_rows, planes, camera):
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
            set_visibility(modules, proof_rows, planes, style_only=style_id)
            cx = sum(m["root"].location.x for m in style_modules) / len(style_modules)
            cy = sum(m["root"].location.y for m in style_modules) / len(style_modules)
            shoot(evidence_dir / ("mf-superstructure-v1-overview-%s.png" % style_id),
                  (cx, cy, 90.0), (1.15, 1.2, 0.92), 640.0)

        for module in modules:
            set_visibility(modules, proof_rows, planes, visible_key=module["key"])
            lo, hi = module["boundsLo"], module["boundsHi"]
            rx, ry = module["root"].location.x, module["root"].location.y
            width = max(hi[0] - lo[0], hi[1] - lo[1])
            height = hi[2] - lo[2]
            scale = max(width, height) * 1.22 + 12.0
            target = (rx + (lo[0] + hi[0]) * 0.5 - module["root"].location.x * 0.0,
                      ry + (lo[1] + hi[1]) * 0.5 - module["root"].location.y * 0.0,
                      (lo[2] + hi[2]) * 0.5)
            # bounds are already world-space; recentre on them directly
            target = ((lo[0] + hi[0]) * 0.5, (lo[1] + hi[1]) * 0.5, (lo[2] + hi[2]) * 0.5)
            for view in config["evidence_views"]:
                if view not in MODULE_VIEWS:
                    raise ValueError("unsupported evidence view: " + view)
                view_scale = scale if view != "top" else max(width, 12.0) * 1.3
                shoot(evidence_dir / ("mf-sup-%s-%s.png" % (module["key"].replace("_", "-"), view)),
                      target, MODULE_VIEWS[view], view_scale)

        if config["render_block_proof"]:
            for row in proof_rows:
                set_visibility(modules, proof_rows, planes, proof_id=row["id"])
                cx, cy = row["centre"]
                scale = max(row["spanM"] * 1.10, row["tallest"] * 1.9, 160.0)
                mid_z = (row["lowest"] + row["tallest"]) * 0.42
                shoot(evidence_dir / ("mf-tiling-%s-iso.png" % row["id"].replace("_", "-")),
                      (cx, cy, mid_z), (0.85, 1.15, 0.72), scale)
                shoot(evidence_dir / ("mf-tiling-%s-elevation.png" % row["id"].replace("_", "-")),
                      (cx, cy, mid_z), (0.0, 1.0, 0.14), scale)
        set_visibility(modules, proof_rows, planes)
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
        output = export_dir / ("mf-sup-%s.glb" % module["key"].replace("_", "-"))
        bpy.ops.export_scene.gltf(
            filepath=str(output), export_format="GLB", use_selection=True,
            export_apply=True, export_extras=True, export_cameras=False,
            export_lights=False, export_yup=True)
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
        lo, hi = module["boundsLo"], module["boundsHi"]
        records.append({
            "id": module["key"], "archetype": spec["id"], "style": module["style"],
            "styleLabel": STYLES[module["style"]]["label"],
            "superstructureClass": spec["class"], "form": spec["form"],
            "cells": list(spec["cells"]),
            "footprintM": [spec["cells"][0] * GRID_M, spec["cells"][1] * GRID_M],
            "heightM": round(module["height"], 2),
            "boundsM": {"lo": [round(v, 2) for v in lo], "hi": [round(v, 2) for v in hi]},
            "lowestZ": round(lo[2], 2),
            "submerged": bool(lo[2] < WATER_Z - 0.5),
            "ruinScale": round(module["scale"], 3),
            "edges": spec["edges"],
            "sockets": [{
                "name": s.name, "direction": s["mf_direction"], "type": s["mf_socket_type"],
                "cellIndex": s["mf_cell_index"], "wallRun": bool(s["mf_wall_run"]),
                "edgeZ": round(float(s["mf_edge_z"]), 2),
                "localPosition": [round(v, 3) for v in s.location],
            } for s in module["sockets"]],
            "lods": module["lods"],
            "geometryRoleTriangles": dict(sorted(module["roleTriangles"].items())),
            "collision": {"name": module["collision"].name,
                          "triangles": triangle_count(module["collision"])},
        })
    lod0 = [r["lods"][0]["triangles"] for r in records]
    tallest = max((r["heightM"] for r in records), default=0.0)
    deepest = min((r["lowestZ"] for r in records), default=0.0)
    report = {
        "format": SCHEMA, "version": 1, "units": "metres", "deterministic": True,
        "generator": "tools/blender/build-mf-superstructure-kit.py",
        "sharesVocabularyWith": "tools/blender/build-mf-modular-building-kit.py",
        "evidenceRenderer": "BLENDER_WORKBENCH",
        "blenderVersion": bpy.app.version_string,
        "engineAnchors": {
            "waterZ": WATER_Z, "seabedZ": SEABED_Z, "terrainHScale": TERRAIN_HSCALE,
            "source": "src/engine/terrain.js (WATER_Y, SEABED, HSCALE)",
        },
        "tilingContract": {
            "placementGridM": GRID_M, "sharedWith": "mf-modular-building-v1",
            "floorPitchM": FLOOR_M, "partyJointM": JOINT_M,
            "partyJointTotalM": JOINT_M * 2.0,
            "wallRunAxis": "EW",
            "notes": [
                "Nothing crosses the party plane; base and cornice return to it.",
                "Wall segments must reach the plane EXACTLY on their E/W run axis, "
                "or a long rampart shows a seam every 32 m.",
                "Ocean platforms run caissons to seabedZ and are cut by the waterline "
                "at waterZ, with a distinct submerged material below it.",
            ],
        },
        "styles": {s: {"label": STYLES[s]["label"],
                       "modules": len([m for m in modules if m["style"] == s])}
                   for s in config["styles"]},
        "classes": sorted({spec["class"] for spec in ARCHETYPES}),
        "archetypes": [spec["id"] for spec in ARCHETYPES],
        "moduleCount": len(records),
        "tallestM": round(tallest, 2),
        "deepestZ": round(deepest, 2),
        "triangleSummary": {
            "lod0Total": sum(lod0), "lod0Min": min(lod0) if lod0 else 0,
            "lod0Max": max(lod0) if lod0 else 0,
            "lod0Mean": round(sum(lod0) / float(len(lod0)), 1) if lod0 else 0,
            "lod1Total": sum(r["lods"][1]["triangles"] for r in records),
            "lod2Total": sum(r["lods"][2]["triangles"] for r in records),
        },
        "tilingProof": [{"id": r["id"], "style": r["style"], "items": r["items"],
                         "spanCells": r["spanCells"], "spanM": r["spanM"]}
                        for r in proof_rows],
        "modules": records, "exports": exports, "evidenceRenders": renders,
        "blend": (Path(config["blend_path"]).resolve().relative_to(REPO_ROOT).as_posix()
                  if config["save_blend"] else None),
        "runtimeIntegration": {
            "state": "SOURCE_CANDIDATE",
            "note": "Exported GLBs are source candidates. Nothing is registered in "
                    "boot.js or assets/data/manifest.json by this generator.",
        },
    }
    report_path = Path(config["report_path"])
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
    return report


def build_superstructure_kit(overrides=None):
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
    helpers, land, seabed, water, camera = add_evidence_rig(master)
    configure_render(config)
    planes = (land, seabed, water)
    set_visibility(modules, proof_rows, planes)

    exports = export_modules(config, modules) if config["export_glb"] else []
    renders = render_evidence(config, modules, proof_rows, planes, camera) \
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
    if not tail:
        return None
    return json.loads(Path(tail[0]).read_text(encoding="utf-8"))


if __name__ == "__main__":
    summary = build_superstructure_kit(arguments())
    print("%s: %d modules, tallest %.0f m, deepest %.0f m, LOD0 %d tris"
          % (summary["format"], summary["moduleCount"], summary["tallestM"],
             summary["deepestZ"], summary["triangleSummary"]["lod0Total"]))
