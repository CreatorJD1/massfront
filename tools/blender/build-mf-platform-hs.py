"""MASSFRONT NAVIGABLE PLATFORM kit -- hard-surface, walkable, buildable.

Every other kit here is scenery: a unit walks around it. These are structures a
unit walks ON and a base gets built ON. That changes what the geometry has to
guarantee, so this kit is built to three extra contracts the scenery kits do
not have:

  WALKABLE DECK   a flat, unobstructed horizontal surface at a declared height,
                  edge-protected by a parapet, wide enough to path across.
  BUILD PAD       a rectangle inside a deck that is clear of parapet, plant and
                  ramp mouths, so a structure can actually be placed there.
  RAMP LINK       a connection between two decks at a gradient a ground unit
                  can climb, declared as (from_z, to_z) so a navmesh builder
                  does not have to infer it.

The geometry and the metadata are produced by the SAME call. A deck is not
described after the fact -- `deck()` cuts the surface and appends the record,
so a pad can never claim floor that was never modelled.

Built with the bmesh hard-surface toolkit (loop cut / inset / extrude / bevel),
one watertight mesh per module, LODs by decimation.

CLI:
  blender --background --factory-startup --python tools/blender/build-mf-platform-hs.py
"""

import bpy
import bmesh
import json
import math
import runpy
import sys
from pathlib import Path
from mathutils import Vector

_HS = runpy.run_path(str(Path(__file__).resolve().with_name("mf_hardsurface.py")),
                     run_name="mf_hardsurface")
HardSurface = _HS["HardSurface"]
decimated_copy = _HS["decimated_copy"]
octagon = _HS["octagon"]
vertical = _HS["vertical"]
upward = _HS["upward"]
between = _HS["between"]
larger_than = _HS["larger_than"]
all_of = _HS["all_of"]
finalize = _HS["finalize"]
collision_mesh = _HS["collision_mesh"]
purge_orphans = _HS["purge_orphans"]
mesh_stats = _HS["mesh_stats"]

_OLD = runpy.run_path(str(Path(__file__).resolve().with_name("build-mf-modular-building-kit.py")),
                      run_name="mf_building_kit_lib")
Rng = _OLD["Rng"]
STYLES = _OLD["STYLES"]
GRID_M = _OLD["GRID_M"]
HALF_GRID_M = _OLD["HALF_GRID_M"]
BAY_M = _OLD["BAY_M"]
FLOOR_M = _OLD["FLOOR_M"]
JOINT_M = _OLD["JOINT_M"]
CARDINALS = _OLD["CARDINALS"]

SCHEMA = "MassfrontPlatformKitHS1"
PREFIX = "MF_PLAT_HS"
MASTER = PREFIX + "_SOURCE"

SLOTS = ["wall", "recess", "deck", "armour", "trim", "metal", "grate", "accent"]
LOD_RATIOS = (1.0, 0.36, 0.10)

PARAPET_H = 2.2          # deck edge protection
DECK_SLAB = 2.4          # structural depth under a walkable deck
MIN_PAD = 8.0            # smallest useful build pad
RAMP_GRADE = 2.2         # run:rise a ground unit can climb
RAMP_KERB_W = 1.15       # kerb taken out of the running width
RAMP_KERB_H = 1.5        # kerb standing proud of the running surface
RAMP_BATTER = 2.1        # how far the flank leans out towards the base
RAMP_TOE_M = 5.0         # flat apron at the foot, so units can drive on
RAMP_MOUTH_LIFT = 0.06   # threshold plate; keeps the mouth off the deck plane


def make_material(name, rgba, metallic, roughness):
    m = bpy.data.materials.new(PREFIX + "_" + name.upper())
    m.use_nodes = True
    m.diffuse_color = rgba
    b = m.node_tree.nodes.get("Principled BSDF")
    for key, value in (("Base Color", rgba), ("Metallic", metallic), ("Roughness", roughness)):
        if b.inputs.get(key) is not None:
            b.inputs[key].default_value = value
    m["mf_schema"] = SCHEMA
    return m


def style_materials(style_id, style):
    wall = style["wall"]
    armour = tuple(min(1.0, c * 1.10 + 0.11) for c in wall[:3]) + (1.0,)
    return {
        "wall": make_material(style_id + "_wall", wall, 0.08, 0.74),
        "recess": make_material(style_id + "_recess", (0.080, 0.084, 0.082, 1.0), 0.20, 0.74),
        "deck": make_material(style_id + "_deck", style["deck"], 0.40, 0.58),
        "armour": make_material(style_id + "_armour", armour, 0.30, 0.50),
        "trim": make_material(style_id + "_trim", style["trim"], 0.18, 0.58),
        "metal": make_material(style_id + "_metal", (0.098, 0.120, 0.142, 1.0), 0.78, 0.28),
        "grate": make_material(style_id + "_grate", (0.232, 0.244, 0.238, 1.0), 0.52, 0.52),
        "accent": make_material(style_id + "_accent", (0.548, 0.412, 0.156, 1.0), 0.16, 0.72),
    }


# ---------------------------------------------------------------------------
# archetypes
# ---------------------------------------------------------------------------
OPEN4 = {"N": "open", "E": "open", "S": "open", "W": "open"}
SVC = {"N": "street", "E": "service", "S": "service", "W": "service"}

ARCHETYPES = (
    {"id": "deck_tower_3", "cells": (2, 2), "form": "deck_tower", "levels": 3,
     "layout": (0, 0), "edges": dict(SVC)},
    {"id": "deck_tower_4", "cells": (2, 2), "form": "deck_tower", "levels": 4,
     "layout": (2, 0), "edges": dict(SVC)},
    {"id": "terrace_block", "cells": (2, 2), "form": "terrace", "levels": 3,
     "layout": (4, 0), "edges": dict(SVC)},
    {"id": "bunker_base", "cells": (2, 2), "form": "bunker", "levels": 1,
     "layout": (6, 0), "edges": dict(SVC)},

    {"id": "build_platform", "cells": (3, 3), "form": "build_platform", "levels": 1,
     "layout": (0, 1), "edges": dict(OPEN4)},
    {"id": "landing_deck", "cells": (2, 2), "form": "landing_deck", "levels": 1,
     "layout": (3, 1), "edges": dict(OPEN4)},
    {"id": "gantry_frame", "cells": (2, 2), "form": "gantry_frame", "levels": 3,
     "layout": (5, 1), "edges": dict(OPEN4)},

    {"id": "ramp_core", "cells": (1, 1), "form": "ramp_core", "levels": 3,
     "layout": (0, 2), "edges": dict(OPEN4)},
    {"id": "bridge_deck", "cells": (2, 1), "form": "bridge_deck", "levels": 1,
     "layout": (1, 2), "edges": {"N": "service", "E": "open", "S": "service", "W": "open"}},
    {"id": "silo_pad", "cells": (1, 1), "form": "silo_pad", "levels": 1,
     "layout": (3, 2), "edges": dict(OPEN4)},
)

LEVEL_H = 13.0


def footprint(spec):
    cx, cy = spec["cells"]
    return cx * HALF_GRID_M - JOINT_M, cy * HALF_GRID_M - JOINT_M


# ---------------------------------------------------------------------------
# navigation-aware construction
# ---------------------------------------------------------------------------
class Platform:
    """Wraps HardSurface and records walkable decks, build pads and ramp links
    as the geometry that implements them is created."""

    def __init__(self, style):
        self.hs = HardSurface(SLOTS)
        self.style = style
        self.decks = []
        self.pads = []
        self.ramps = []
        self._pending_ramps = []

    # -- a walkable deck ---------------------------------------------------
    def deck(self, cx, cy, hx, hy, z, material="deck", parapet=True, pad=True,
             pad_inset=3.4):
        """Cut a flat walkable surface and record it.

        The slab is modelled from the top face down, so the deck IS the top of
        a solid -- not a plane floating over one, which would let a unit path
        onto nothing.
        """
        ch = self.style["chamfer"] * 0.5
        lower = octagon(cx, cy, hx, hy, ch)
        self.hs.loft(lower, lower, z - DECK_SLAB, z, "wall")
        top = self.hs.select(all_of(upward(0.85), between(z - 0.4, z + 0.4)))
        if parapet and top:
            # inset then extrude the ring UP: the parapet is part of the deck,
            # so it cannot detach and it bounds the walkable area exactly
            inner = self.hs.inset(top, thickness=1.5, depth=0.0)
            ring = [f for f in top if f.is_valid and f not in inner]
            gates = [f for f in ring if self._gate(f, z)]
            wall = [f for f in ring if f not in gates]
            if wall:
                self.hs.extrude(wall, PARAPET_H, material="armour")
            self.hs.paint([f for f in inner + gates if f.is_valid], material)
            walk_hx, walk_hy = hx - 1.5, hy - 1.5
        else:
            self.hs.paint([f for f in top if f.is_valid], material)
            walk_hx, walk_hy = hx, hy
        record = {"z": round(z, 2), "centre": [round(cx, 2), round(cy, 2)],
                  "halfExtents": [round(walk_hx, 2), round(walk_hy, 2)],
                  "parapet": bool(parapet)}
        self.decks.append(record)
        if pad:
            pw = walk_hx - pad_inset
            pd = walk_hy - pad_inset
            if pw * 2.0 >= MIN_PAD and pd * 2.0 >= MIN_PAD:
                self.pads.append({"z": round(z, 2),
                                  "centre": [round(cx, 2), round(cy, 2)],
                                  "halfExtents": [round(pw, 2), round(pd, 2)],
                                  "areaM2": round(pw * pd * 4.0, 1)})
        return record

    # -- a ramp between two decks -----------------------------------------
    def ramp(self, from_z, to_z, cx, cy, axis, half_w=5.0, material="deck",
             base_z=None, kerb=True, grade=None, segments=5, overlap=0.0,
             rise_dir=1, batter=None):
        """A battered embankment, not an inclined board.

        Cross-section is one 8-vertex profile swept along the run, so the ramp
        is a single watertight solid: kerb / running surface / kerb on top,
        flanks leaning OUT towards a flat underside. A constant-thickness
        plank reads as a board leaning on the building; a concrete ramp is a
        mass that gets deeper as it climbs and wider as it goes down.

        `overlap` pushes the high end back INTO the structure it serves, so
        the ramp joins the deck instead of stopping at its edge.
        """
        grade = RAMP_GRADE if grade is None else grade
        rise = abs(to_z - from_z)
        self._pending_ramps.append(dict(from_z=from_z, to_z=to_z, cx=cx, cy=cy,
                                        axis=axis, half_w=half_w,
                                        material=material, base_z=base_z,
                                        kerb=kerb, grade=grade,
                                        segments=segments, overlap=overlap,
                                        rise_dir=rise_dir, batter=batter))
        run = rise * grade
        lo, hi = min(from_z, to_z), max(from_z, to_z)
        base = (lo - 2.0) if base_z is None else base_z
        walk_w = (half_w - (RAMP_KERB_W if kerb else 0.0)) * 2.0
        self.ramps.append({"fromZ": round(lo, 2), "toZ": round(hi, 2),
                           "riseM": round(rise, 2), "runM": round(run, 2),
                           "gradient": "1:%.1f" % grade,
                           "widthM": round(walk_w, 2), "axis": axis,
                           "solidEmbankment": True,
                           "kerbH": round(RAMP_KERB_H if kerb else 0.0, 2),
                           "underside": round(base, 2),
                           "toeM": RAMP_TOE_M, "overlapM": round(overlap, 2),
                           "riseDir": rise_dir,
                           "centre": [round(cx, 2), round(cy, 2)]})
        return self.ramps[-1]

    def ramp_plan(self, r):
        """Plan-view AABB of a queued ramp, in the same maths _emit_ramp uses.
        The parapet consults this to leave a gate, so the opening and the ramp
        can never disagree about where the landing is."""
        rise = abs(r["to_z"] - r["from_z"])
        run = rise * r["grade"]
        lo_t = -run * 0.5 - RAMP_TOE_M
        hi_t = run * 0.5 + max(0.0, r["overlap"])
        if r["rise_dir"] < 0:
            lo_t, hi_t = -hi_t, -lo_t
        w = r["half_w"] + (RAMP_BATTER if r.get("batter") is None else r["batter"])
        if r["axis"] == "y":
            return (r["cx"] - w, r["cx"] + w, r["cy"] + lo_t, r["cy"] + hi_t)
        return (r["cx"] + lo_t, r["cx"] + hi_t, r["cy"] - w, r["cy"] + w)

    def _gate(self, face, z):
        """True if this parapet face stands where a ramp lands on deck `z`."""
        c = face.calc_center_median()
        for r in self._pending_ramps:
            if abs(max(r["from_z"], r["to_z"]) - z) > 0.6:
                continue
            x0, x1, y0, y1 = self.ramp_plan(r)
            if x0 - 0.5 <= c.x <= x1 + 0.5 and y0 - 0.5 <= c.y <= y1 + 0.5:
                return True
        return False

    # -- a ground-to-deck approach on a named face -------------------------
    def approach(self, z, hx, hy, side="+y", half_w=6.0, material="deck",
                 overlap=3.0, base_z=None, grade=None):
        """Place an approach ramp against one face of a mass centred on the
        origin, so the slope tops out exactly at the mass edge and the mouth
        carries `overlap` metres onto the deck.

        Positioning these by hand put three of the four ground ramps in open
        air climbing the wrong way -- the side name is the only input that
        should ever be written in a form.
        """
        grade = RAMP_GRADE if grade is None else grade
        run = z * grade
        axis = "y" if side.endswith("y") else "x"
        sign = 1.0 if side.startswith("+") else -1.0
        edge = hy if axis == "y" else hx
        c = sign * (edge + run * 0.5)
        cx, cy = (0.0, c) if axis == "y" else (c, 0.0)
        return self.ramp(0.0, z, cx, cy, axis, half_w=half_w, material=material,
                         base_z=base_z, overlap=overlap, grade=grade,
                         rise_dir=int(-sign))

    def build_ramps(self):
        """Emit every queued embankment. Called after detail() so carving can
        never reach ramp geometry."""
        for r in self._pending_ramps:
            self._emit_ramp(**r)
        self._pending_ramps = []

    def _emit_ramp(self, from_z, to_z, cx, cy, axis, half_w, material, base_z,
                   kerb, grade, segments, overlap, rise_dir=1, batter=None):
        rise = abs(to_z - from_z)
        run = rise * grade
        lo, hi = min(from_z, to_z), max(from_z, to_z)
        base = (lo - 2.0) if base_z is None else base_z
        kw = RAMP_KERB_W if kerb else 0.0
        kh = RAMP_KERB_H if kerb else 0.0
        w_top = half_w
        w_base = half_w + (RAMP_BATTER if batter is None else batter)
        bm = self.hs.bm

        def pt(t, w, z):
            return (cx + t, cy + w, z) if axis == "x" else (cx + w, cy + t, z)

        # stations: (t, running-surface z, kerb height at this station).
        # flat toe apron, then the slope, then the overlap onto the deck --
        # where the kerb dies out so the mouth is flush with the deck rather
        # than leaving two fins standing on it.
        stations = [(-run * 0.5 - RAMP_TOE_M, lo, kh)]
        for i in range(segments + 1):
            u = i / float(segments)
            stations.append((-run * 0.5 + run * u, lo + (hi - lo) * u, kh))
        if overlap > 0.0:
            stations.append((run * 0.5 + overlap * 0.45, hi + 0.03, kh * 0.55))
            stations.append((run * 0.5 + overlap, hi + RAMP_MOUTH_LIFT, 0.06))
        if rise_dir < 0:
            # mirror about the centre: the ramp now climbs towards -t, so the
            # toe apron ends up on the far side and the high end meets a mass
            # sitting at lower t. Reverse the list too, or every face winds
            # backwards and recalc_face_normals has to guess.
            stations = [(-t, z, k) for (t, z, k) in reversed(stations)]

        rings = []
        for (t, zt, k) in stations:
            prof = [(-w_top, zt + k), (-w_top + kw, zt + k), (-w_top + kw, zt),
                    (w_top - kw, zt), (w_top - kw, zt + k), (w_top, zt + k),
                    (w_base, base), (-w_base, base)]
            rings.append([bm.verts.new(pt(t, w, z)) for (w, z) in prof])
        bm.verts.ensure_lookup_table()

        # face index -> material role, following the profile edge order above
        roles = ["armour", "armour", material, "armour", "armour",
                 "wall", "wall", "wall"]
        faces = []
        painted = {}
        for i in range(len(rings) - 1):
            r0, r1 = rings[i], rings[i + 1]
            for k in range(8):
                k2 = (k + 1) % 8
                try:
                    f = bm.faces.new([r0[k], r0[k2], r1[k2], r1[k]])
                except ValueError:
                    continue
                faces.append(f)
                painted.setdefault(roles[k], []).append(f)
        for (ring, rev) in ((rings[0], True), (rings[-1], False)):
            try:
                f = bm.faces.new(list(reversed(ring)) if rev else list(ring))
            except ValueError:
                continue
            faces.append(f)
            painted.setdefault("wall", []).append(f)
        bmesh.ops.recalc_face_normals(bm, faces=faces)
        for role, fs in painted.items():
            self.hs.paint([f for f in fs if f.is_valid], role)


    def detail(self, rng, deck_plate=True):
        """Carve the structure after the navigation geometry exists.

        Runs last on purpose: decks, pads and ramps are recorded from clean
        surfaces, then detail is cut into what is left. Deck grooves are kept
        to 0.14 m so the walkable surface stays walkable -- detail must never
        invalidate a pad that has already been declared.
        """
        hs = self.hs
        levels = sorted({d["z"] for d in self.decks})
        cuts = []
        for z in levels:
            for c in (z - DECK_SLAB - 5.5, z - DECK_SLAB - 1.4):
                if c > 1.2:
                    cuts.append(c)
        if cuts:
            hs.bisect_z(sorted(set(cuts)))
        walls = hs.select(all_of(vertical(), larger_than(7.0)))
        sunk, proud = [], []
        for f in walls:
            c = f.calc_center_median()
            r = rng.value("d", round(c.x, 1), round(c.y, 1), round(c.z, 1))
            if r < 0.34:
                sunk.append(f)
            elif r < 0.46:
                proud.append(f)
        if sunk:
            hs.panel(sunk, border=0.9, depth=0.55, material="recess", rim="trim")
        if proud:
            hs.extrude(hs.inset(proud, 1.0, 0.0), 0.30, material="armour")
        if deck_plate:
            for d in self.decks:
                z = d["z"]
                tops = hs.select(all_of(upward(0.85), between(z - 0.25, z + 0.25),
                                        larger_than(30.0)))
                if tops:
                    hs.panel(tops, border=2.4, depth=0.14, material="deck")

    def block(self, cx, cy, hx, hy, z0, z1, material="wall", batter=0.0):
        """A solid volume. Everything walkable in this kit now sits on one of
        these, so a deck is the top of a mass rather than a plate in mid air."""
        ch = self.style["chamfer"]
        lo = octagon(cx, cy, hx, hy, ch)
        hi = octagon(cx, cy, hx * (1.0 - batter), hy * (1.0 - batter), ch)
        self.hs.loft(lo, hi, z0, z1, material)
        return hx * (1.0 - batter), hy * (1.0 - batter)

    def terrace_stack(self, hx, hy, levels, shrink=0.17, base_z=0.0,
                      batter=0.03, pad_margin=2.2):
        """A stepped mass built as ONE continuous shell.

        Wall, terrace annulus, wall, terrace annulus, cap -- so the exposed ring
        at each step is genuine floor on genuine mass. Building this as nested
        separate solids instead left interior faces that remove_doubles
        collapsed, and the whole module rendered empty.
        """
        ch = self.style["chamfer"]
        extents = []
        for i in range(levels):
            ex = hx * (1.0 - i * shrink)
            ey = hy * (1.0 - i * shrink)
            extents.append((ex, ey, base_z + (i + 1) * LEVEL_H))
        way = [(octagon(0.0, 0.0, extents[0][0], extents[0][1], ch), base_z)]
        for i, (ex, ey, z) in enumerate(extents):
            tx, ty = ex * (1.0 - batter), ey * (1.0 - batter)
            way.append((octagon(0.0, 0.0, tx, ty, ch), z))          # wall up
            if i + 1 < len(extents):
                nx, ny = extents[i + 1][0], extents[i + 1][1]
                way.append((octagon(0.0, 0.0, nx, ny, ch), z))      # terrace in
        self.hs.chain(way, "wall")
        tops = []
        for i, (ex, ey, z) in enumerate(extents):
            tx, ty = ex * (1.0 - batter), ey * (1.0 - batter)
            tops.append((z, tx, ty))
            inner_x = extents[i + 1][0] if i + 1 < len(extents) else 0.0
            inner_y = extents[i + 1][1] if i + 1 < len(extents) else 0.0
            self.cut_deck(0.0, 0.0, tx, ty, z, parapet=(i + 1 >= len(extents)))
            ring = ty - inner_y
            if i + 1 < len(extents) and ring > MIN_PAD * 0.5 + pad_margin:
                cy = (inner_y + ty) * 0.5
                self.pads.append({
                    "z": round(z, 2), "centre": [0.0, round(cy, 2)],
                    "halfExtents": [round(tx * 0.70, 2),
                                    round(ring * 0.5 - pad_margin, 2)],
                    "areaM2": round(tx * 0.70 * (ring * 0.5 - pad_margin) * 4.0, 1)})
            elif i + 1 >= len(extents) and tx * 2.0 >= MIN_PAD:
                self.pads.append({
                    "z": round(z, 2), "centre": [0.0, 0.0],
                    "halfExtents": [round(tx - pad_margin, 2), round(ty - pad_margin, 2)],
                    "areaM2": round((tx - pad_margin) * (ty - pad_margin) * 4.0, 1)})
        return tops

    def cut_deck(self, cx, cy, hx, hy, z, parapet=True, material="deck"):
        """Turn an existing solid's top face into a walkable deck. No new slab
        is created -- this only carves what the mass already provides."""
        top = self.hs.select(all_of(upward(0.85), between(z - 0.35, z + 0.35),
                                    larger_than(6.0)))
        if not top:
            return None
        if parapet:
            inner = self.hs.inset(top, thickness=1.5, depth=0.0)
            ring = [f for f in top if f.is_valid and f not in inner]
            gates = [f for f in ring if self._gate(f, z)]
            wall = [f for f in ring if f not in gates]
            if wall:
                self.hs.extrude(wall, PARAPET_H, material="armour")
            # gate faces are simply left at deck level: an opening the ramp
            # runs through, not a hole cut in a finished parapet
            self.hs.paint([f for f in inner + gates if f.is_valid], material)
            wx, wy = hx - 1.5, hy - 1.5
        else:
            self.hs.paint([f for f in top if f.is_valid], material)
            wx, wy = hx, hy
        record = {"z": round(z, 2), "centre": [round(cx, 2), round(cy, 2)],
                  "halfExtents": [round(wx, 2), round(wy, 2)], "parapet": bool(parapet)}
        self.decks.append(record)
        return record

    def core(self, cx, cy, hx, hy, z0, z1, material="wall"):
        ch = self.style["chamfer"]
        ring = octagon(cx, cy, hx, hy, ch)
        self.hs.loft(ring, ring, z0, z1, material)

    def leg(self, cx, cy, r, z0, z1):
        ch = self.style["chamfer"] * 0.5
        self.hs.loft(octagon(cx, cy, r, r, ch), octagon(cx, cy, r * 0.78, r * 0.78, ch),
                     z0, z1, "wall")


# ---------------------------------------------------------------------------
# forms
# ---------------------------------------------------------------------------
def form_deck_tower(p, spec, style, rng):
    """A solid ziggurat. Each terrace is the top of a volume carried to the
    ground, so the facade under every deck actually exists."""
    hx, hy = footprint(spec)
    levels = spec["levels"]
    tops = p.terrace_stack(hx, hy, levels, shrink=0.17)
    top_z, tx, ty = tops[-1]
    # crown mass above the last terrace
    p.block(0.0, 0.0, tx * 0.62, ty * 0.62, top_z, top_z + FLOOR_M * 2.2, "deck")
    for i in range(levels - 1):
        z0, z1 = tops[i][0], tops[i + 1][0]
        axis = "x" if i % 2 == 0 else "y"
        perp = 2 if axis == "x" else 1        # half-extent across the run
        outer, inner = tops[i][perp], tops[i + 1][perp]
        band = outer - inner                    # the terrace this ramp rides
        half_w = min(4.0, band * 0.5 - 0.3)
        if half_w < 1.6:
            continue                            # no terrace to carry a ramp
        off = (inner + outer) * 0.5
        run = (z1 - z0) * RAMP_GRADE
        r1 = run * 0.5
        cx, cy = (0.0, off) if axis == "x" else (off, 0.0)
        p.ramp(z0, z1, cx, cy, axis, half_w=half_w, base_z=z0 - 0.6,
               batter=0.0, kerb=False, overlap=2.0)
        # step-off platform: the head tops out a couple of metres short of the
        # deck above, because the terrace is a ring and the ramp runs along it
        lw0, lw1 = inner - 2.0, off + half_w + 0.4
        if axis == "x":
            p.block(r1 + 4.5, (lw0 + lw1) * 0.5, 5.0, (lw1 - lw0) * 0.5,
                    z1 - 3.0, z1, material="deck")
        else:
            p.block((lw0 + lw1) * 0.5, r1 + 4.5, (lw1 - lw0) * 0.5, 5.0,
                    z1 - 3.0, z1, material="deck")
    return top_z + FLOOR_M * 2.2


def form_terrace(p, spec, style, rng):
    """Terraces stepping back on one axis only -- long shelves, deeper pads.
    Also one continuous shell."""
    hx, hy = footprint(spec)
    levels = spec["levels"]
    ch = style["chamfer"]
    steps = []
    for i in range(levels):
        ey = hy * (1.0 - i * 0.30)
        steps.append((hx, ey, hy - ey, (i + 1) * LEVEL_H))
    way = [(octagon(0.0, steps[0][2], steps[0][0], steps[0][1], ch), 0.0)]
    for i, (ex, ey, cy, z) in enumerate(steps):
        way.append((octagon(0.0, cy, ex, ey, ch), z))
        if i + 1 < len(steps):
            nx, ny, ncy, _ = steps[i + 1]
            way.append((octagon(0.0, ncy, nx, ny, ch), z))
    p.hs.chain(way, "wall")
    for i, (ex, ey, cy, z) in enumerate(steps):
        p.cut_deck(0.0, cy, ex, ey, z, parapet=(i + 1 >= len(steps)))
        inner_ny = steps[i + 1][1] if i + 1 < len(steps) else 0.0
        inner_cy = steps[i + 1][2] if i + 1 < len(steps) else cy
        front = cy - ey
        back = (inner_cy - inner_ny) if i + 1 < len(steps) else (cy + ey)
        depth = abs(back - front)
        if depth > MIN_PAD:
            p.pads.append({"z": round(z, 2),
                           "centre": [0.0, round((front + back) * 0.5, 2)],
                           "halfExtents": [round(ex * 0.78, 2), round(depth * 0.5 - 1.6, 2)],
                           "areaM2": round(ex * 0.78 * (depth * 0.5 - 1.6) * 4.0, 1)})
    for i in range(levels - 1):
        z0, z1 = steps[i][3], steps[i + 1][3]
        run = (z1 - z0) * RAMP_GRADE
        cy = steps[i][2]
        r1 = cy + run * 0.5
        cx = hx * 0.64
        p.ramp(z0, z1, cx, cy, "y", half_w=4.0, base_z=z0 - 0.6, batter=0.0,
               kerb=False, overlap=2.0)
        p.block(cx, r1 + 4.5, 4.8, 5.0, z1 - 3.0, z1, material="deck")
    return steps[-1][3] + PARAPET_H


def form_bunker(p, spec, style, rng):
    """Low, heavy, one big walkable roof -- solid all the way down."""
    hx, hy = footprint(spec)
    z = LEVEL_H * 0.95
    tx, ty = p.block(0.0, 0.0, hx, hy, 0.0, z, batter=0.05)
    p.approach(z, tx, ty, "+y", half_w=6.5)
    p.cut_deck(0.0, 0.0, tx, ty, z)
    p.pads.append({"z": round(z, 2), "centre": [0.0, 0.0],
                   "halfExtents": [round(tx - 3.0, 2), round(ty - 3.0, 2)],
                   "areaM2": round((tx - 3.0) * (ty - 3.0) * 4.0, 1)})
    hs = p.hs
    hs.bisect_z([3.5, 8.5])
    walls = hs.select(all_of(vertical(), between(3.8, 8.2), larger_than(8.0)))
    if walls:
        hs.panel(walls, border=1.2, depth=1.0, material="recess", rim="trim")
    return z + PARAPET_H


def form_build_platform(p, spec, style, rng):
    """A 3x3 deck on four heavy piers with a deep edge beam and cross bracing.
    The beam is the point: a deck with no visible depth reads as cardboard."""
    hx, hy = footprint(spec)
    z = LEVEL_H * 1.5
    beam = 5.0
    for sx in (-1.0, 1.0):
        for sy in (-1.0, 1.0):
            # overlap the beam rather than butting onto its soffit -- a union
            # cannot fuse two solids that merely touch on a shared plane
            p.block(sx * hx * 0.62, sy * hy * 0.62, 7.0, 7.0, 0.0, z - beam * 0.35,
                    batter=0.10)
    # deep edge beam ring, then the deck slab inside it
    ch = style["chamfer"]
    p.hs.loft(octagon(0.0, 0.0, hx, hy, ch), octagon(0.0, 0.0, hx, hy, ch),
              z - beam, z, "wall")
    tx, ty = hx, hy
    p.approach(z, tx, ty, "+y", half_w=7.0)
    p.cut_deck(0.0, 0.0, tx, ty, z)
    p.pads.append({"z": round(z, 2), "centre": [0.0, 0.0],
                   "halfExtents": [round(tx - 3.4, 2), round(ty - 3.4, 2)],
                   "areaM2": round((tx - 3.4) * (ty - 3.4) * 4.0, 1)})
    for sx in (-1.0, 1.0):
        p.hs.loft(octagon(sx * hx * 0.62, 0.0, 2.0, hy * 0.60, 0.6),
                  octagon(sx * hx * 0.62, 0.0, 1.4, hy * 0.60, 0.5),
                  z - beam - 9.0, z - beam, "metal")
    return z + PARAPET_H


def form_landing_deck(p, spec, style, rng):
    hx, hy = footprint(spec)
    z = LEVEL_H * 1.1
    tx, ty = p.block(0.0, 0.0, hx, hy, 0.0, z, batter=0.06)
    p.approach(z, tx, ty, "+x", half_w=6.0)
    p.cut_deck(0.0, 0.0, tx, ty, z)
    p.pads.append({"z": round(z, 2), "centre": [0.0, 0.0],
                   "halfExtents": [round(tx - 3.0, 2), round(ty - 3.0, 2)],
                   "areaM2": round((tx - 3.0) * (ty - 3.0) * 4.0, 1)})
    hs = p.hs
    top = hs.select(all_of(upward(0.85), between(z - 0.3, z + 0.3), larger_than(60.0)))
    if top:
        marks = hs.inset(top, thickness=5.5, depth=-0.16, material="accent")
        hs.paint([f for f in marks if f.is_valid], "accent")
    hs.bisect_z([4.0, 9.5])
    walls = hs.select(all_of(vertical(), between(4.3, 9.2), larger_than(8.0)))
    if walls:
        hs.panel(walls, border=1.3, depth=0.9, material="recess", rim="trim")
    return z + PARAPET_H


def form_gantry_frame(p, spec, style, rng):
    """Open frame -- deliberately NOT solid, but the legs are real columns and
    every deck gets a deep edge beam and cross bracing."""
    hx, hy = footprint(spec)
    levels = spec["levels"]
    ch = style["chamfer"]
    top = 0.0
    for sx in (-1.0, 1.0):
        for sy in (-1.0, 1.0):
            p.block(sx * hx * 0.80, sy * hy * 0.80, 4.4, 4.4, 0.0, levels * LEVEL_H + 4.0,
                    batter=0.06)
    for i in range(levels):
        z = (i + 1) * LEVEL_H
        p.hs.loft(octagon(0.0, 0.0, hx * 0.80, hy * 0.66, ch),
                  octagon(0.0, 0.0, hx * 0.80, hy * 0.66, ch), z - 3.2, z, "metal")
        p.cut_deck(0.0, 0.0, hx * 0.80, hy * 0.66, z, material="grate")
        p.pads.append({"z": round(z, 2), "centre": [0.0, 0.0],
                       "halfExtents": [round(hx * 0.80 - 3.0, 2), round(hy * 0.66 - 2.4, 2)],
                       "areaM2": round((hx * 0.80 - 3.0) * (hy * 0.66 - 2.4) * 4.0, 1)})
        top = z
        for sx in (-1.0, 1.0):
            p.hs.loft(octagon(sx * hx * 0.80, 0.0, 1.2, hy * 0.80, 0.4),
                      octagon(sx * hx * 0.80, 0.0, 0.9, hy * 0.80, 0.3),
                      z - 2.0, z - 0.6, "metal")
    for i in range(levels - 1):
        p.ramp((i + 1) * LEVEL_H, (i + 2) * LEVEL_H,
               hx * 0.44 * (1 if i % 2 == 0 else -1), 0.0, "x", half_w=3.4,
               material="grate", base_z=(i + 1) * LEVEL_H - 1.2, kerb=False)
    return top + PARAPET_H


def form_ramp_core(p, spec, style, rng):
    """Vertical circulation: one stepped shell with a landing collar at each
    level, so a unit steps off the ramp onto real floor."""
    hx, hy = footprint(spec)
    levels = spec["levels"]
    ch = style["chamfer"]
    core_x, core_y = hx * 0.50, hy * 0.50
    way = [(octagon(0.0, 0.0, hx * 0.94, hy * 0.94, ch), 0.0)]
    for i in range(levels):
        z = (i + 1) * LEVEL_H
        way.append((octagon(0.0, 0.0, core_x, core_y, ch), z - 2.6))
        way.append((octagon(0.0, 0.0, hx * 0.94, hy * 0.94, ch), z - 2.6))
        way.append((octagon(0.0, 0.0, hx * 0.94, hy * 0.94, ch), z))
        way.append((octagon(0.0, 0.0, core_x, core_y, ch), z))
    way.append((octagon(0.0, 0.0, core_x, core_y, ch), levels * LEVEL_H + FLOOR_M))
    p.hs.chain(way, "wall")
    for i in range(levels):
        z = (i + 1) * LEVEL_H
        p.cut_deck(0.0, 0.0, hx * 0.94, hy * 0.94, z, parapet=False)
    for i in range(levels - 1):
        axis = "x" if i % 2 == 0 else "y"
        p.ramp((i + 1) * LEVEL_H, (i + 2) * LEVEL_H, 0.0, 0.0, axis, half_w=3.2,
               base_z=(i + 1) * LEVEL_H - 1.2)
    return levels * LEVEL_H + FLOOR_M


def form_bridge_deck(p, spec, style, rng):
    """A span with a real depth beam, on two piers."""
    hx, hy = footprint(spec)
    z = LEVEL_H
    ch = style["chamfer"]
    for t in (-hx * 0.66, hx * 0.66):
        p.block(t, 0.0, 5.4, 5.4, 0.0, z - 4.0, batter=0.10)
    p.hs.loft(octagon(0.0, 0.0, hx, hy * 0.40, ch), octagon(0.0, 0.0, hx, hy * 0.40, ch),
              z - 4.0, z, "wall")
    # a span with no way onto it is scenery -- give it an abutment ramp at
    # each end, climbing inwards so the causeway reads as a through route
    p.approach(z, hx, hy * 0.40, "-x", half_w=hy * 0.30)
    p.approach(z, hx, hy * 0.40, "+x", half_w=hy * 0.30)
    p.cut_deck(0.0, 0.0, hx, hy * 0.40, z, parapet=True)
    p.pads.append({"z": round(z, 2), "centre": [0.0, 0.0],
                   "halfExtents": [round(hx - 4.0, 2), round(hy * 0.40 - 3.0, 2)],
                   "areaM2": round((hx - 4.0) * (hy * 0.40 - 3.0) * 4.0, 1)})
    return z + PARAPET_H


def form_silo_pad(p, spec, style, rng):
    hx, hy = footprint(spec)
    z = LEVEL_H * 0.85
    tx, ty = p.block(0.0, 0.0, hx * 0.92, hy * 0.92, 0.0, z, batter=0.08)
    p.approach(z, tx, ty, "+y", half_w=4.6)
    p.cut_deck(0.0, 0.0, tx, ty, z)
    p.pads.append({"z": round(z, 2), "centre": [0.0, 0.0],
                   "halfExtents": [round(tx - 2.6, 2), round(ty - 2.6, 2)],
                   "areaM2": round((tx - 2.6) * (ty - 2.6) * 4.0, 1)})
    return z + PARAPET_H


FORMS = {"deck_tower": form_deck_tower, "terrace": form_terrace, "bunker": form_bunker,
         "build_platform": form_build_platform, "landing_deck": form_landing_deck,
         "gantry_frame": form_gantry_frame, "ramp_core": form_ramp_core,
         "bridge_deck": form_bridge_deck, "silo_pad": form_silo_pad}


# ---------------------------------------------------------------------------
# assembly
# ---------------------------------------------------------------------------
_mesh_reports = []


def create_module(master, spec, style_id, materials, offset):
    style = STYLES[style_id]
    key = style_id + "_" + spec["id"]
    rng = Rng(SCHEMA, style_id, spec["id"])
    cells_x, cells_y = spec["cells"]

    coll = bpy.data.collections.new(PREFIX + "_" + key.upper())
    master.children.link(coll)
    root = bpy.data.objects.new(PREFIX + "_ROOT_" + key, None)
    coll.objects.link(root)
    root.location = (spec["layout"][0] * 110.0 + offset, -spec["layout"][1] * 150.0, 0.0)
    root.empty_display_type = "PLAIN_AXES"

    p = Platform(style)
    top = FORMS[spec["form"]](p, spec, style, rng)
    p.detail(rng, deck_plate=spec["form"] not in ("bridge_deck",))
    p.build_ramps()
    p.hs.bevel_by_angle(style["bevel"][0] * 0.7, segments=2, angle_deg=38.0)
    lod0 = p.hs.to_object("%s_%s_LOD0" % (PREFIX, key), coll, materials, root, SCHEMA)
    lod0["mf_lod"] = 0
    p.hs.free()
    mesh = finalize(lod0)
    lod0["mf_shells"] = mesh["after"]["shells"]
    lod0["mf_uv"] = "UVMap"
    lod0["mf_welded"] = bool(mesh.get("weld", {}).get("welded"))

    col = collision_mesh(lod0, "%s_%s_COL" % (PREFIX, key), coll,
                         parent=root, schema=SCHEMA)

    lods = [lod0]
    _mesh_reports.append((key, mesh))
    for level, ratio in enumerate(LOD_RATIOS[1:], start=1):
        o = decimated_copy(lod0, "%s_%s_LOD%d" % (PREFIX, key, level), ratio, coll, root, SCHEMA)
        o["mf_lod"] = level
        o.hide_render = True
        lods.append(o)

    root["mf_schema"] = SCHEMA
    root["mf_asset_kind"] = "navigable_platform"
    root["mf_module_id"] = key
    root["mf_archetype"] = spec["id"]
    root["mf_style"] = style_id
    root["mf_cells"] = json.dumps(list(spec["cells"]), separators=(",", ":"))
    root["mf_edges"] = json.dumps(spec["edges"], separators=(",", ":"), sort_keys=True)
    root["mf_height_m"] = round(top, 2)
    root["mf_walkable_decks"] = json.dumps(p.decks, separators=(",", ":"))
    root["mf_build_pads"] = json.dumps(p.pads, separators=(",", ":"))
    root["mf_ramp_links"] = json.dumps(p.ramps, separators=(",", ":"))
    root["mf_deck_count"] = len(p.decks)
    root["mf_pad_count"] = len(p.pads)
    root["mf_buildable_area_m2"] = round(sum(x["areaM2"] for x in p.pads), 1)
    root["mf_ramp_gradient"] = "1:%.1f" % RAMP_GRADE

    # nav proxies: one flat plane per walkable deck, so a navmesh builder does
    # not have to reconstruct the walkable surface from the render mesh
    nav_coll = bpy.data.collections.new(PREFIX + "_" + key.upper() + "_NAV")
    coll.children.link(nav_coll)
    for i, deck in enumerate(p.decks):
        bm = bmesh.new()
        cx, cy = deck["centre"]
        ex, ey = deck["halfExtents"]
        vs = [bm.verts.new(v) for v in ((cx - ex, cy - ey, deck["z"]),
                                        (cx + ex, cy - ey, deck["z"]),
                                        (cx + ex, cy + ey, deck["z"]),
                                        (cx - ex, cy + ey, deck["z"]))]
        bm.faces.new(vs)
        mesh = bpy.data.meshes.new("%s_%s_NAV%d_MESH" % (PREFIX, key, i))
        bm.to_mesh(mesh)
        bm.free()
        obj = bpy.data.objects.new("%s_%s_NAV%d" % (PREFIX, key, i), mesh)
        nav_coll.objects.link(obj)
        obj.parent = root
        obj.display_type = "WIRE"
        obj.hide_render = True
        obj["mf_schema"] = SCHEMA
        obj["mf_role"] = "walkable_deck"
        obj["mf_deck_z"] = deck["z"]
        obj["mf_deck_index"] = i

    sockets = []
    for direction in ("N", "E", "S", "W"):
        dx, dy, angle = CARDINALS[direction]
        s = bpy.data.objects.new("%s_%s_SOCKET_%s" % (PREFIX, key.upper(), direction), None)
        coll.objects.link(s)
        s.parent = root
        s.location = (dx * cells_x * HALF_GRID_M, dy * cells_y * HALF_GRID_M, 0.0)
        s.rotation_euler[2] = angle
        s.empty_display_type = "ARROWS"
        s["mf_schema"] = SCHEMA
        s["mf_role"] = "platform_socket"
        s["mf_direction"] = direction
        s["mf_socket_type"] = spec["edges"][direction]
        sockets.append(s)

    bpy.context.view_layer.update()
    return {"spec": spec, "style": style_id, "key": key, "root": root, "coll": coll,
            "lods": lods, "sockets": sockets, "top": top,
            "decks": p.decks, "pads": p.pads, "ramps": p.ramps,
            "polys": [len(o.data.polygons) for o in lods],
            "tris": [sum(max(0, len(f.vertices) - 2) for f in o.data.polygons)
                     for o in lods]}


def main():
    repo = Path(__file__).resolve().parents[2]
    out = (repo / "modules" / "space_exploration" / "assets" / "source" / "blender"
           / "world-kits" / "mf-platform-hs-v1")
    (out / "evidence").mkdir(parents=True, exist_ok=True)
    (out / "exports").mkdir(parents=True, exist_ok=True)

    old = bpy.data.collections.get(MASTER)
    if old:
        for o in list(old.all_objects):
            bpy.data.objects.remove(o, do_unlink=True)
        bpy.data.collections.remove(old)
    master = bpy.data.collections.new(MASTER)
    bpy.context.scene.collection.children.link(master)

    modules = []
    for i, style_id in enumerate(STYLES):
        mats = style_materials(style_id, STYLES[style_id])
        for spec in ARCHETYPES:
            modules.append(create_module(master, spec, style_id, mats, i * 900.0))

    for m in modules:
        root = m["root"]
        orig = root.location.copy()
        root.location = (0.0, 0.0, 0.0)
        bpy.context.view_layer.update()
        bpy.ops.object.select_all(action="DESELECT")
        targets = [root] + m["lods"] + m["sockets"]
        for o in targets:
            o.hide_render = False
            o.select_set(True)
        bpy.context.view_layer.objects.active = root
        bpy.ops.export_scene.gltf(
            filepath=str(out / "exports" / ("mf-plat-%s.glb" % m["key"].replace("_", "-"))),
            export_format="GLB", use_selection=True, export_apply=True,
            export_extras=True, export_cameras=False, export_lights=False, export_yup=True)
        for o in m["lods"][1:]:
            o.hide_render = True
        root.location = orig
    bpy.context.view_layer.update()

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
    scene.render.resolution_x = scene.render.resolution_y = 768
    scene.world.use_nodes = True
    bg = scene.world.node_tree.nodes.get("Background")
    if bg:
        bg.inputs["Color"].default_value = (0.008, 0.014, 0.021, 1.0)
        bg.inputs["Strength"].default_value = 0.62

    cd = bpy.data.cameras.new(PREFIX + "_CAM")
    cd.type = "ORTHO"
    cd.clip_end = 9000.0
    cam = bpy.data.objects.new(PREFIX + "_CAM", cd)
    master.objects.link(cam)
    scene.camera = cam
    for name, loc, energy in (("KEY", (150, 140, 210), 34000), ("FILL", (-120, 90, 140), 19000),
                              ("RIM", (-70, -150, 160), 26000)):
        ld = bpy.data.lights.new(PREFIX + "_" + name, "AREA")
        ld.energy, ld.size = energy, 110.0
        lo = bpy.data.objects.new(PREFIX + "_" + name, ld)
        master.objects.link(lo)
        lo.location = loc
        lo.rotation_euler = (Vector((0, 0, 0)) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
    bpy.ops.mesh.primitive_plane_add(size=5000.0, location=(0, 0, -0.05))
    fl = bpy.context.object
    for c in list(fl.users_collection):
        c.objects.unlink(fl)
    master.objects.link(fl)
    fl.data.materials.append(make_material("evfloor", (0.05, 0.058, 0.064, 1.0), 0.04, 0.9))

    renders = []
    for m in modules:
        for other in modules:
            for i, o in enumerate(other["lods"]):
                o.hide_render = (i != 0) or (other["key"] != m["key"])
        obj = m["lods"][0]
        lo = [1e9] * 3
        hi = [-1e9] * 3
        for corner in obj.bound_box:
            w = obj.matrix_world @ Vector(corner)
            for i in range(3):
                lo[i] = min(lo[i], w[i])
                hi[i] = max(hi[i], w[i])
        width = max(hi[0] - lo[0], hi[1] - lo[1])
        scale = max(width * 1.32, (hi[2] - lo[2]) * 1.40, 50.0)
        target = Vector(((lo[0] + hi[0]) * 0.5, (lo[1] + hi[1]) * 0.5, (lo[2] + hi[2]) * 0.5))
        cam.location = target + Vector((1.2, 1.2, 0.85)).normalized() * scale * 3.2
        cam.rotation_euler = (target - cam.location).to_track_quat("-Z", "Y").to_euler()
        cam.data.ortho_scale = scale
        path = out / "evidence" / ("mf-plat-%s-iso_ne.png" % m["key"].replace("_", "-"))
        scene.render.filepath = str(path)
        bpy.ops.render.render(write_still=True)
        # Keep generated reports portable across the permanent Main Source alias.
        renders.append(path.relative_to(repo).as_posix())

    records = []
    for m in modules:
        records.append({
            "id": m["key"], "archetype": m["spec"]["id"], "style": m["style"],
            "cells": list(m["spec"]["cells"]), "heightM": round(m["top"], 2),
            "walkableDecks": m["decks"], "buildPads": m["pads"], "rampLinks": m["ramps"],
            "deckCount": len(m["decks"]), "padCount": len(m["pads"]),
            "buildableAreaM2": round(sum(x["areaM2"] for x in m["pads"]), 1),
            "polys": {"lod0": m["polys"][0], "lod1": m["polys"][1], "lod2": m["polys"][2]},
            "tris": {"lod0": m["tris"][0], "lod1": m["tris"][1], "lod2": m["tris"][2]},
        })
    p0 = [r["polys"]["lod0"] for r in records]
    report = {
        "format": SCHEMA, "version": 1, "units": "metres", "deterministic": True,
        "generator": "tools/blender/build-mf-platform-hs.py",
        "toolkit": "tools/blender/mf_hardsurface.py (bmesh)",
        "purpose": "structures units walk ON and bases build ON, not scenery",
        "navigationContract": {
            "levelHeightM": LEVEL_H, "parapetM": PARAPET_H,
            "rampGradient": "1:%.1f" % RAMP_GRADE, "minBuildPadM": MIN_PAD,
            "notes": [
                "A deck is the TOP FACE OF A SOLID, cut by inset -- never a plane "
                "floating over one, so a unit cannot path onto nothing.",
                "The parapet is extruded from the deck's own edge ring, so the "
                "walkable extent and the barrier can never disagree.",
                "Ramp run is derived from the gradient, so the declared link and "
                "the modelled slope are the same thing.",
                "Each deck also ships a flat NAV proxy plane so a navmesh builder "
                "does not have to reconstruct it from the render mesh.",
            ]},
        "blenderVersion": bpy.app.version_string,
        "moduleCount": len(records),
        "totalWalkableDecks": sum(r["deckCount"] for r in records),
        "totalBuildPads": sum(r["padCount"] for r in records),
        "totalBuildableAreaM2": round(sum(r["buildableAreaM2"] for r in records), 1),
        "polySummary": {"lod0Total": sum(p0), "lod0Mean": round(sum(p0) / len(p0), 1),
                        "lod0Min": min(p0), "lod0Max": max(p0),
                        "lod1Total": sum(r["polys"]["lod1"] for r in records),
                        "lod2Total": sum(r["polys"]["lod2"] for r in records)},
        "modules": records, "evidenceRenders": renders,
        "runtimeIntegration": {"state": "SOURCE_CANDIDATE"},
    }
    # boolean / cleanup / merge accounting -- a silent union that rolled back
    # or shattered a mesh looks exactly like one that worked, so say so
    raw = sum(m["before"]["polys"] for _, m in _mesh_reports)
    done = sum(m["after"]["polys"] for _, m in _mesh_reports)
    rolled = [k for k, m in _mesh_reports if m.get("weld", {}).get("rolledBack")]
    solvers = {}
    for _, m in _mesh_reports:
        sv = m.get("weld", {}).get("solver") or "none"
        solvers[sv] = solvers.get(sv, 0) + 1
    fused = sum(1 for _, m in _mesh_reports if m["after"]["shells"] == 1)
    report["meshPipeline"] = {
        "polysRaw": raw, "polysFinal": done,
        "reductionPct": round(100.0 * (raw - done) / max(1, raw), 1),
        "shellsRawTotal": sum(m["before"]["shells"] for _, m in _mesh_reports),
        "shellsFinalTotal": sum(m["after"]["shells"] for _, m in _mesh_reports),
        "modulesFusedToOneShell": fused, "solvers": solvers,
        "rolledBack": rolled,
        "coplanarMerged": sum(m.get("coplanar", {}).get("merged", 0)
                              for _, m in _mesh_reports),
        "interiorFacesStripped": sum(m.get("interiorStripped", 0)
                                     for _, m in _mesh_reports),
        "hiddenFacesStripped": sum(m.get("hiddenStripped", 0)
                                   for _, m in _mesh_reports),
        "tjunctionsSplit": sum(m.get("weld", {}).get("repair", {}).get("tjunctionsSplit", 0)
                               for _, m in _mesh_reports),
        "holesFilled": sum(m.get("weld", {}).get("repair", {}).get("holesFilled", 0)
                           for _, m in _mesh_reports)}
    mp = report["meshPipeline"]
    print("  mesh pipeline: %d -> %d polys (-%.1f%%), shells %d -> %d, "
          "%d/%d modules fused to one shell"
          % (raw, done, mp["reductionPct"], mp["shellsRawTotal"],
             mp["shellsFinalTotal"], fused, len(_mesh_reports)))
    print("  solvers %s; T-junctions split %d; holes filled %d; "
          "coplanar merged %d; interior %d + hidden %d faces stripped; rollbacks %d"
          % (solvers, mp["tjunctionsSplit"], mp["holesFilled"],
             mp["coplanarMerged"], mp["interiorFacesStripped"],
             mp["hiddenFacesStripped"], len(rolled)))
    if rolled:
        why = {}
        for k, m in _mesh_reports:
            w = m.get("weld", {})
            if w.get("rolledBack"):
                r = w.get("reason") or "?"
                why.setdefault(r, []).append(k)
        for r, ks in why.items():
            print("  ROLLED BACK [%s] x%d: %s" % (r, len(ks), ks[0]))

    (out / "mf-platform-hs-v1-report.json").write_text(json.dumps(report, indent=2),
                                                      encoding="utf-8")
    stale = purge_orphans(master)
    if stale:
        print("  purged factory-startup leftovers: %s" % ", ".join(stale))
    bpy.ops.wm.save_as_mainfile(filepath=str(out / "mf-platform-hs-v1.blend"))
    print("%s: %d modules, %d walkable decks, %d build pads, %.0f m2 buildable, LOD0 %d polys"
          % (SCHEMA, len(records), report["totalWalkableDecks"], report["totalBuildPads"],
             report["totalBuildableAreaM2"], sum(p0)))



if __name__ == "__main__":
    main()
