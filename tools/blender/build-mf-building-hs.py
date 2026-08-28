"""MASSFRONT modular building kit, rebuilt with real hard-surface modelling.

WHAT CHANGED FROM build-mf-modular-building-kit.py

That generator appended raw vertex/face arrays and called from_pydata. Every
"recess" was a dark box laid ON a wall; every module shipped as ~14 loose
objects; the three LODs were hand-authored and could drift apart; and the roof
was three separate solids parked on the shaft, which is why it read as a hat.

This one models. Per module:

    1. ONE lofted mass, base to parapet head -- watertight from the start.
    2. LOOP CUTS at every window course and every bay.
    3. INSET + INSET-with-depth to CARVE the window courses into the mass.
    4. INSET + EXTRUDE to raise armour plates and pilasters off it.
    5. INSET the roof face and push it DOWN, which is what makes the parapet.
       A roof that is an inset of the top face cannot float away from the
       building -- the earlier bug is now unrepresentable.
    6. BEVEL by edge angle for real highlights.
    7. DECIMATE the finished mesh for LOD1/LOD2, so detail can never drift
       between tiers.

Output is one object per module with material slots, which is how a
hard-surface asset actually ships.

CLI:
  blender --background --factory-startup --python tools/blender/build-mf-building-hs.py
"""

import bpy
import bmesh
import json
import math
import os
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
downward = _HS["downward"]
between = _HS["between"]
larger_than = _HS["larger_than"]
all_of = _HS["all_of"]
finalize = _HS["finalize"]
collision_mesh = _HS["collision_mesh"]
purge_orphans = _HS["purge_orphans"]

# reuse the archetype table, styles and keyed RNG from the array-based kit
_OLD = runpy.run_path(str(Path(__file__).resolve().with_name("build-mf-modular-building-kit.py")),
                      run_name="mf_building_kit_lib")
Rng = _OLD["Rng"]
ARCHETYPES = _OLD["ARCHETYPES"]
STYLES = _OLD["STYLES"]
GRID_M = _OLD["GRID_M"]
HALF_GRID_M = _OLD["HALF_GRID_M"]
BAY_M = _OLD["BAY_M"]
FLOOR_M = _OLD["FLOOR_M"]
PLINTH_M = _OLD["PLINTH_M"]
SILL_M = _OLD["SILL_M"]
BAND_M = _OLD["BAND_M"]
JOINT_M = _OLD["JOINT_M"]
CARDINALS = _OLD["CARDINALS"]

SCHEMA = "MassfrontBuildingKitHS1"
PREFIX = "MF_BLD_HS"
MASTER_COLLECTION = PREFIX + "_SOURCE"
ROOF_PARAPET = 2.6

SLOTS = ["wall", "recess", "glass", "armour", "trim", "deck", "metal", "accent"]
LOD_RATIOS = (1.0, 0.34, 0.09)


def make_material(name, rgba, metallic, roughness, emission=None, alpha=1.0):
    m = bpy.data.materials.new(PREFIX + "_" + name.upper())
    m.use_nodes = True
    m.diffuse_color = rgba
    b = m.node_tree.nodes.get("Principled BSDF")
    for key, value in (("Base Color", rgba), ("Metallic", metallic),
                       ("Roughness", roughness), ("Alpha", alpha)):
        if b.inputs.get(key) is not None:
            b.inputs[key].default_value = value
    if emission is not None:
        for key in ("Emission Color", "Emission"):
            if b.inputs.get(key) is not None:
                b.inputs[key].default_value = emission[0]
                break
        if b.inputs.get("Emission Strength") is not None:
            b.inputs["Emission Strength"].default_value = emission[1]
    m["mf_schema"] = SCHEMA
    return m


def style_materials(style_id, style):
    wall = style["wall"]
    armour = tuple(min(1.0, c * 1.10 + 0.11) for c in wall[:3]) + (1.0,)
    return {
        "wall": make_material(style_id + "_wall", wall, 0.08, 0.74),
        "recess": make_material(style_id + "_recess", (0.080, 0.084, 0.082, 1.0), 0.20, 0.74),
        "glass": make_material(style_id + "_glass", (0.026, 0.238, 0.312, 1.0), 0.24, 0.14),
        "armour": make_material(style_id + "_armour", armour, 0.30, 0.50),
        "trim": make_material(style_id + "_trim", style["trim"], 0.18, 0.58),
        "deck": make_material(style_id + "_deck", style["deck"], 0.46, 0.46),
        "metal": make_material(style_id + "_metal", (0.098, 0.120, 0.142, 1.0), 0.78, 0.28),
        "accent": make_material(style_id + "_accent", (0.402, 0.196, 0.132, 1.0), 0.24, 0.78),
    }


def footprint(spec):
    cx, cy = spec["cells"]
    return cx * HALF_GRID_M - JOINT_M, cy * HALF_GRID_M - JOINT_M


def banded_sides(spec):
    return [d for d, k in spec["edges"].items() if k != "party_wall"]


def effective_floors(spec, style, rng):
    floors = spec["floors"]
    if style["ruin"] <= 0.0:
        return floors
    return max(1, int(round(floors * rng.range(0.42, 0.74, "shear"))))


# ---------------------------------------------------------------------------
# the model
# ---------------------------------------------------------------------------
def build_mass(hs, spec, style, floors):
    """One watertight solid: battered base, recessed shaft, parapet head."""
    hx, hy = footprint(spec)
    top = PLINTH_M + floors * FLOOR_M
    inset = style["inset"]
    ch = style["chamfer"]
    batter = style["batter"]
    base_h = FLOOR_M * 1.15
    shaft_lo, shaft_hi = base_h, top - ROOF_PARAPET

    def ring(ex, ey, c):
        return octagon(0.0, 0.0, ex, ey, c)

    ch_shaft = max(0.25, ch - inset * 0.4)
    sx, sy = hx - inset, hy - inset
    tx, ty = sx * (1.0 - batter), sy * (1.0 - batter)

    # base block: full width at grade, tapering back to the shaft
    hs.loft(ring(hx, hy, ch), ring(sx, sy, ch_shaft), 0.0, base_h, "wall")
    # shaft
    hs.loft(ring(sx, sy, ch_shaft), ring(tx, ty, ch_shaft), shaft_lo, shaft_hi, "wall")
    # the wall RETURNS to the party plane and becomes the parapet
    hs.loft(ring(tx, ty, ch_shaft), ring(hx, hy, ch), shaft_hi, shaft_hi + 1.0, "wall")
    hs.loft(ring(hx, hy, ch), ring(hx, hy, ch), shaft_hi + 1.0, top, "wall")
    hs.cleanup()
    return top, (hx, hy), (sx, sy), (tx, ty)


def carve_facade(hs, spec, style, floors, top, shaft_lo, shaft_hi, rng, lod_full=True):
    """Loop cuts, then carve. This is the whole point of the rebuild."""
    hx, hy = footprint(spec)
    # ---- loop cuts -------------------------------------------------------
    courses = []
    f = 0
    while f < 80:
        z = PLINTH_M + f * FLOOR_M + SILL_M
        if z + BAND_M > shaft_hi - 0.4:
            break
        if z >= shaft_lo:
            courses.append(z)
        f += 1
    cuts = []
    for z in courses:
        cuts += [z, z + BAND_M]
    if cuts:
        hs.bisect_z(sorted(set(cuts)))
    # bay cuts, so panels can be per-bay rather than per-wall
    for axis, half in (("x", hx), ("y", hy)):
        n = max(1, int((half * 2.0) // BAY_M))
        levels = [-half + (half * 2.0) * (i / float(n)) for i in range(1, n)]
        if levels:
            hs.bisect_axis(axis, levels)

    slot = min(style["slot"] * 0.55, 1.0)
    # ---- window courses: carved, and glazed at the bottom of the cut -----
    for z in courses:
        band = hs.select(all_of(vertical(), between(z + 0.2, z + BAND_M - 0.2),
                                larger_than(3.0)))
        if not band:
            continue
        hs.panel(band, border=0.55, depth=slot, material="glass", rim="trim")

    if not lod_full:
        return

    # ---- panel-line detail: shallow carved bays, a real inset not a decal -
    spandrels = hs.select(all_of(vertical(), larger_than(6.0)))
    chosen, raised = [], []
    for i, face in enumerate(spandrels):
        c = face.calc_center_median()
        key = (round(c.x, 1), round(c.y, 1), round(c.z, 1))
        r = rng.value("panel", key[0], key[1], key[2])
        if r < 0.26:
            chosen.append(face)
        elif r < 0.38:
            raised.append(face)
    if chosen:
        hs.panel(chosen, border=0.5, depth=0.34, material="recess")
    if raised:
        hs.extrude(hs.inset(raised, 0.6, 0.0), 0.28, material="armour")

    # ---- accent panels, sparse ------------------------------------------
    accents = []
    for face in hs.select(all_of(vertical(), larger_than(4.0))):
        c = face.calc_center_median()
        if rng.chance(0.05, "acc", round(c.x, 1), round(c.y, 1), round(c.z, 1)):
            accents.append(face)
    if accents:
        hs.paint(accents[:8], "accent")


def carve_roof(hs, style, top, shaft_hi):
    """Inset the top face and push it down. The parapet is what is left of the
    wall around it, so the roof physically cannot detach."""
    roof = hs.select(all_of(upward(0.8), between(top - 0.6, top + 0.6)))
    if not roof:
        return top
    tray = hs.inset(roof, thickness=1.6, depth=0.0, material="trim")
    sunk = hs.inset(tray, 0.0, -ROOF_PARAPET, material="deck")
    return sunk


def add_roof_plant(hs, style, top, hx, hy, rng, lod_full=True):
    """Plant grown out of the roof tray by extrusion, not dropped on top."""
    if not lod_full:
        return
    tray = hs.select(all_of(upward(0.8), between(top - ROOF_PARAPET - 1.2, top - 0.8)))
    if not tray:
        return
    picks = []
    for face in tray:
        c = face.calc_center_median()
        if rng.chance(0.30, "plant", round(c.x, 1), round(c.y, 1)):
            picks.append(face)
    if not picks:
        picks = tray[:2]
    for face in picks[:10]:
        c = face.calc_center_median()
        h = rng.range(1.6, 4.6, "planth", round(c.x, 1), round(c.y, 1))
        inner = hs.inset([face], 0.9, 0.0)
        hs.extrude(inner, h, material="metal")


def build_module_mesh(spec, style, style_id, floors, rng, lod_full=True):
    hs = HardSurface(SLOTS)
    top, full, shaft, tapered = build_mass(hs, spec, style, floors)
    base_h = FLOOR_M * 1.15
    carve_facade(hs, spec, style, floors, top, base_h, top - ROOF_PARAPET, rng, lod_full)
    carve_roof(hs, style, top, top - ROOF_PARAPET)
    add_roof_plant(hs, style, top, full[0], full[1], rng, lod_full)
    hs.bevel_by_angle(style["bevel"][0] * 0.8, segments=2, angle_deg=38.0)
    return hs, top


# ---------------------------------------------------------------------------
# assembly
# ---------------------------------------------------------------------------
_mesh_reports = []


def create_module(master, spec, style_id, materials, layout_offset):
    style = STYLES[style_id]
    key = style_id + "_" + spec["id"]
    rng = Rng(SCHEMA, style_id, spec["id"])
    floors = effective_floors(spec, style, rng)
    cells_x, cells_y = spec["cells"]
    hx, hy = footprint(spec)

    coll = linked = bpy.data.collections.new(PREFIX + "_" + key.upper())
    master.children.link(coll)
    root = bpy.data.objects.new(PREFIX + "_ROOT_" + key, None)
    coll.objects.link(root)
    root.location = (spec["layout"][0] * 96.0 + layout_offset,
                     -spec["layout"][1] * 116.0, 0.0)
    root.empty_display_type = "PLAIN_AXES"
    root["mf_schema"] = SCHEMA
    root["mf_asset_kind"] = "modular_building_hs"
    root["mf_module_id"] = key
    root["mf_archetype"] = spec["id"]
    root["mf_style"] = style_id
    root["mf_cells"] = json.dumps(list(spec["cells"]), separators=(",", ":"))
    root["mf_edges"] = json.dumps(spec["edges"], separators=(",", ":"), sort_keys=True)
    root["mf_floors"] = floors
    root["mf_pipeline"] = "bmesh hard-surface: loop cut, inset, extrude, bevel, decimate"

    hs, top = build_module_mesh(spec, style, style_id, floors, rng, lod_full=True)
    lod0 = hs.to_object("%s_%s_LOD0" % (PREFIX, key), coll, materials, root, SCHEMA)
    lod0["mf_lod"] = 0
    hs.free()
    mesh = finalize(lod0)
    lod0["mf_shells"] = mesh["after"]["shells"]
    lod0["mf_uv"] = "UVMap"
    lod0["mf_welded"] = bool(mesh.get("weld", {}).get("welded"))
    _mesh_reports.append((key, mesh))

    col = collision_mesh(lod0, "%s_%s_COL" % (PREFIX, key), coll,
                         parent=root, schema=SCHEMA)

    lods = [lod0]
    for level, ratio in enumerate(LOD_RATIOS[1:], start=1):
        obj = decimated_copy(lod0, "%s_%s_LOD%d" % (PREFIX, key, level), ratio, coll,
                             root, SCHEMA)
        obj["mf_lod"] = level
        obj.hide_render = True
        lods.append(obj)

    sockets = []
    for direction in ("N", "E", "S", "W"):
        along = cells_x if direction in ("N", "S") else cells_y
        for index in range(along):
            t = (-along * 0.5 + index + 0.5) * GRID_M
            dx, dy, angle = CARDINALS[direction]
            loc = (t, dy * cells_y * HALF_GRID_M, 0.0) if direction in ("N", "S") \
                else (dx * cells_x * HALF_GRID_M, t, 0.0)
            name = "SOCKET_%s_%s" % (direction, index) if along > 1 else "SOCKET_" + direction
            s = bpy.data.objects.new("%s_%s_%s" % (PREFIX, key.upper(), name), None)
            coll.objects.link(s)
            s.parent = root
            s.location = loc
            s.rotation_euler[2] = angle
            s.empty_display_type = "ARROWS"
            s["mf_schema"] = SCHEMA
            s["mf_role"] = "building_socket"
            s["mf_direction"] = direction
            s["mf_socket_type"] = spec["edges"][direction]
            s["mf_blind"] = spec["edges"][direction] == "party_wall"
            sockets.append(s)

    bpy.context.view_layer.update()
    return {"spec": spec, "style": style_id, "key": key, "root": root, "coll": coll,
            "lods": lods, "sockets": sockets, "top": top, "floors": floors,
            "polys": [len(o.data.polygons) for o in lods],
            "tris": [sum(max(0, len(f.vertices) - 2) for f in o.data.polygons)
                     for o in lods]}


def module_bounds(module):
    lo = [1e9] * 3
    hi = [-1e9] * 3
    obj = module["lods"][0]
    for corner in obj.bound_box:
        w = obj.matrix_world @ Vector(corner)
        for i in range(3):
            lo[i] = min(lo[i], w[i])
            hi[i] = max(hi[i], w[i])
    return lo, hi


def main():
    repo = Path(__file__).resolve().parents[2]
    out_dir = (repo / "modules" / "space_exploration" / "assets" / "source" / "blender"
               / "world-kits" / "mf-building-hs-v1")
    evidence = out_dir / "evidence"
    exports = out_dir / "exports"
    evidence.mkdir(parents=True, exist_ok=True)
    exports.mkdir(parents=True, exist_ok=True)

    existing = bpy.data.collections.get(MASTER_COLLECTION)
    if existing:
        for obj in list(existing.all_objects):
            bpy.data.objects.remove(obj, do_unlink=True)
        bpy.data.collections.remove(existing)
    master = bpy.data.collections.new(MASTER_COLLECTION)
    bpy.context.scene.collection.children.link(master)

    modules = []
    for i, style_id in enumerate(STYLES):
        mats = style_materials(style_id, STYLES[style_id])
        for spec in ARCHETYPES:
            modules.append(create_module(master, spec, style_id, mats, i * 620.0))

    # ---- export ----------------------------------------------------------
    for module in modules:
        root = module["root"]
        original = root.location.copy()
        root.location = (0.0, 0.0, 0.0)
        bpy.context.view_layer.update()
        bpy.ops.object.select_all(action="DESELECT")
        targets = [root] + module["lods"] + module["sockets"]
        hidden = [(o, o.hide_render) for o in targets]
        for o in targets:
            o.hide_render = False
            o.select_set(True)
        bpy.context.view_layer.objects.active = root
        path = exports / ("mf-bldhs-%s.glb" % module["key"].replace("_", "-"))
        bpy.ops.export_scene.gltf(filepath=str(path), export_format="GLB",
                                  use_selection=True, export_apply=True,
                                  export_extras=True, export_cameras=False,
                                  export_lights=False, export_yup=True)
        for o, hr in hidden:
            o.hide_render = hr
        root.location = original
    bpy.context.view_layer.update()

    # ---- render ----------------------------------------------------------
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
    scene.render.image_settings.file_format = "PNG"
    scene.world.use_nodes = True
    bg = scene.world.node_tree.nodes.get("Background")
    if bg:
        bg.inputs["Color"].default_value = (0.008, 0.014, 0.021, 1.0)
        bg.inputs["Strength"].default_value = 0.62

    cam_data = bpy.data.cameras.new(PREFIX + "_CAM")
    cam_data.type = "ORTHO"
    cam_data.clip_end = 12000.0
    cam = bpy.data.objects.new(PREFIX + "_CAM", cam_data)
    master.objects.link(cam)
    scene.camera = cam
    for name, loc, energy in (("KEY", (150, 140, 210), 34000),
                              ("FILL", (-120, 90, 140), 19000),
                              ("RIM", (-70, -150, 160), 26000)):
        ld = bpy.data.lights.new(PREFIX + "_" + name, "AREA")
        ld.energy, ld.size = energy, 110.0
        lo = bpy.data.objects.new(PREFIX + "_" + name, ld)
        master.objects.link(lo)
        lo.location = loc
        lo.rotation_euler = (Vector((0, 0, 0)) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()

    bpy.ops.mesh.primitive_plane_add(size=6000.0, location=(0.0, 0.0, -0.05))
    floor = bpy.context.object
    for c in list(floor.users_collection):
        c.objects.unlink(floor)
    master.objects.link(floor)
    floor.data.materials.append(make_material("evfloor", (0.05, 0.058, 0.064, 1.0), 0.04, 0.9))

    def show(only=None):
        for m in modules:
            for i, o in enumerate(m["lods"]):
                o.hide_render = (i != 0) or (only is not None and m["key"] != only)

    renders = []
    for module in modules:
        show(module["key"])
        lo, hi = module_bounds(module)
        width = max(hi[0] - lo[0], hi[1] - lo[1])
        scale = max(width * 1.30, (hi[2] - lo[2]) * 1.35, 44.0)
        target = Vector(((lo[0] + hi[0]) * 0.5, (lo[1] + hi[1]) * 0.5, (lo[2] + hi[2]) * 0.5))
        cam.location = target + Vector((1.2, 1.2, 0.82)).normalized() * scale * 3.2
        cam.rotation_euler = (target - cam.location).to_track_quat("-Z", "Y").to_euler()
        cam.data.ortho_scale = scale
        path = evidence / ("mf-bldhs-%s-iso_ne.png" % module["key"].replace("_", "-"))
        scene.render.filepath = str(path)
        bpy.ops.render.render(write_still=True)
        # Reports must remain portable when the checkout's user-facing alias or
        # physical parent changes; absolute dated paths turn evidence into stale data.
        renders.append(path.relative_to(repo).as_posix())
    show(None)

    # ---- report ----------------------------------------------------------
    records = []
    for m in modules:
        records.append({"id": m["key"], "archetype": m["spec"]["id"], "style": m["style"],
                        "cells": list(m["spec"]["cells"]), "floors": m["floors"],
                        "heightM": round(m["top"], 2),
                        "polys": {"lod0": m["polys"][0], "lod1": m["polys"][1],
                                  "lod2": m["polys"][2]},
                        "tris": {"lod0": m["tris"][0], "lod1": m["tris"][1],
                                 "lod2": m["tris"][2]},
                        "objects": 1, "materialSlots": len(SLOTS)})
    raw = sum(m["before"]["polys"] for _, m in _mesh_reports)
    done = sum(m["after"]["polys"] for _, m in _mesh_reports)
    solvers = {}
    for _, m in _mesh_reports:
        sv = m.get("weld", {}).get("solver") or "none"
        solvers[sv] = solvers.get(sv, 0) + 1
    print("  mesh pipeline: %d -> %d polys (-%.1f%%), shells %d -> %d, "
          "%d/%d fused to one shell; solvers %s; rollbacks %d"
          % (raw, done, 100.0 * (raw - done) / max(1, raw),
             sum(m["before"]["shells"] for _, m in _mesh_reports),
             sum(m["after"]["shells"] for _, m in _mesh_reports),
             sum(1 for _, m in _mesh_reports if m["after"]["shells"] == 1),
             len(_mesh_reports), solvers,
             sum(1 for _, m in _mesh_reports if m.get("weld", {}).get("rolledBack"))))

    p0 = [r["polys"]["lod0"] for r in records]
    report = {
        "format": SCHEMA, "version": 1, "units": "metres", "deterministic": True,
        "generator": "tools/blender/build-mf-building-hs.py",
        "toolkit": "tools/blender/mf_hardsurface.py (bmesh)",
        "pipeline": ["single lofted watertight mass",
                     "horizontal + bay loop cuts (bisect_plane)",
                     "inset/inset-depth to CARVE window courses and panels",
                     "inset/extrude for raised armour and roof plant",
                     "roof = inset of the top face pushed down, so it cannot detach",
                     "bevel by edge angle",
                     "LOD1/LOD2 by DECIMATE of the finished LOD0"],
        "blenderVersion": bpy.app.version_string,
        "moduleCount": len(records),
        "objectsPerModule": 1,
        "polySummary": {"lod0Total": sum(p0), "lod0Mean": round(sum(p0) / len(p0), 1),
                        "lod0Min": min(p0), "lod0Max": max(p0),
                        "lod1Total": sum(r["polys"]["lod1"] for r in records),
                        "lod2Total": sum(r["polys"]["lod2"] for r in records)},
        "modules": records,
        "evidenceRenders": renders,
        "runtimeIntegration": {"state": "SOURCE_CANDIDATE"},
    }
    (out_dir / "mf-building-hs-v1-report.json").write_text(json.dumps(report, indent=2),
                                                          encoding="utf-8")
    stale = purge_orphans(master)
    if stale:
        print("  purged factory-startup leftovers: %s" % ", ".join(stale))
    bpy.ops.wm.save_as_mainfile(filepath=str(out_dir / "mf-building-hs-v1.blend"))
    print("%s: %d modules, 1 object each, LOD0 %d polys (mean %.0f)"
          % (SCHEMA, len(records), sum(p0), sum(p0) / len(p0)))


if __name__ == "__main__":
    main()
