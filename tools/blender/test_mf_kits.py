"""Contract tests for the MASSFRONT hard-surface world kits.

Run after building either kit:

    blender --background --factory-startup --python tools/blender/test_mf_kits.py

Exits non-zero if any check fails, so it can gate a publish. Blender exits 0
even when a script raises, so every failure is collected and the exit code is
set explicitly at the end -- do not rely on the traceback being noticed.

These started as throwaway probes in a scratch directory, which meant every
check evaporated between sessions. They live here now because most of the
defects this kit has shipped were invisible in a render and obvious in a
number: ramps landing on nothing, meshes with NaN vertices that blanked their
own evidence frame, colliders 25x over budget, and a boolean union that
"succeeded" by shattering the mesh into fragments that still filled the same
bounding box.
"""
import json
import math
import sys
from pathlib import Path

import bmesh
import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
KITS = ROOT / "modules/space_exploration/assets/source/blender/world-kits"

# LOD ratios the generators ask for. Decimation is a fraction of TRIANGLES and
# always outputs triangles, while LOD0 is n-gons after the coplanar merge --
# comparing polygon counts across LODs makes a healthy ladder look broken.
LOD_TARGETS = (1.0, 0.36, 0.10)
LOD_TOLERANCE = 0.12
COLLIDER_TRI_BUDGET = 400
GRID_HALF_M = 16.0
DEFAULT_NAMES = {"Cube", "Plane", "Sphere", "Icosphere", "Cylinder", "Cone",
                 "Torus", "Circle", "Grid", "Suzanne", "Camera", "Light"}

FAILURES = []
CHECKS = [0]


def check(ok, label, detail=""):
    CHECKS[0] += 1
    if not ok:
        FAILURES.append("%s%s" % (label, (" -- " + detail) if detail else ""))
    return ok


def tri_count(mesh):
    return sum(max(0, len(p.vertices) - 2) for p in mesh.polygons)


def shell_count(mesh):
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bm.faces.ensure_lookup_table()
    seen = set()
    n = 0
    for f in bm.faces:
        if f.index in seen:
            continue
        n += 1
        stack = [f]
        seen.add(f.index)
        while stack:
            cur = stack.pop()
            for e in cur.edges:
                for lf in e.link_faces:
                    if lf.index not in seen:
                        seen.add(lf.index)
                        stack.append(lf)
    bm.free()
    return n


# ---------------------------------------------------------------------------
# mesh-level checks, run against the saved .blend
# ---------------------------------------------------------------------------
def check_blend(kit, blend_path, expect_collider=True, shell_cap=12):
    if not blend_path.exists():
        check(False, "%s: blend missing" % kit, str(blend_path))
        return
    bpy.ops.wm.open_mainfile(filepath=str(blend_path))
    meshes = [o for o in bpy.data.objects if o.type == "MESH"]
    lod0 = sorted([o for o in meshes if o.name.endswith("_LOD0")], key=lambda o: o.name)
    colliders = [o for o in meshes if o.get("mf_collision")]

    check(bool(lod0), "%s: has LOD0 meshes" % kit)

    stale = [o.name for o in bpy.data.objects
             if o.name.split(".")[0] in DEFAULT_NAMES and not o.get("mf_schema")]
    check(not stale, "%s: no factory-startup leftovers" % kit, ", ".join(stale))

    if expect_collider:
        named = [o for o in meshes if "COLLISION" in o.name.upper()]
        have = colliders or named
        check(len(have) >= len(lod0),
              "%s: a collider for every module" % kit,
              "%d colliders for %d modules" % (len(have), len(lod0)))
        # only the voxel-remeshed colliders this toolkit builds carry a budget;
        # the array kits author theirs and they are already tiny
        over = [(o.name, len(o.data.polygons)) for o in colliders
                if len(o.data.polygons) > COLLIDER_TRI_BUDGET * 1.25]
        check(not over, "%s: colliders inside triangle budget" % kit,
              ", ".join("%s=%d" % t for t in over[:3]))

    renderable = [o for o in meshes
                  if not o.get("mf_collision")
                  and "COLLISION" not in o.name.upper()
                  and "NAV" not in o.name.upper()
                  and not o.get("mf_evidence_only")
                  and not o.get("mf_proof_only")
                  and o.name.split(".")[0] not in DEFAULT_NAMES]
    bare = [o.name for o in renderable if not len(o.data.uv_layers)]
    check(not bare, "%s: every renderable mesh is unwrapped" % kit,
          "%d without UVs, e.g. %s" % (len(bare), ", ".join(bare[:2])))

    no_uv = [o.name for o in lod0 if not len(o.data.uv_layers)]
    check(not no_uv, "%s: every LOD0 is unwrapped" % kit, ", ".join(no_uv[:3]))

    flat = [o.name for o in lod0 if not all(p.use_smooth for p in o.data.polygons)]
    check(not flat, "%s: every LOD0 is smooth-shaded" % kit, ", ".join(flat[:3]))

    no_sharp = [o.name for o in lod0 if not o.data.attributes.get("sharp_edge")]
    check(not no_sharp, "%s: every LOD0 has sharp edges marked" % kit,
          ", ".join(no_sharp[:3]))

    # NaN vertices blank an evidence render without raising anything
    bad = []
    for o in meshes:
        for v in o.data.vertices:
            if any(math.isnan(c) or math.isinf(c) or abs(c) > 1.0e6 for c in v.co):
                bad.append(o.name)
                break
    check(not bad, "%s: no NaN or runaway vertices" % kit, ", ".join(bad[:3]))

    empty = [o.name for o in lod0 if not len(o.data.polygons)]
    check(not empty, "%s: no empty LOD0 meshes" % kit, ", ".join(empty[:3]))

    # A shell cap only means something where a module is meant to be one
    # solid. An antenna farm or a spire crown is genuinely an assembly of
    # separate parts that never touch, so a union cannot -- and should not --
    # fuse them. The cap is passed in per kit.
    if shell_cap:
        unmerged = [(o.name, shell_count(o.data)) for o in lod0]
        worst = max(unmerged, key=lambda t: t[1]) if unmerged else ("", 0)
        check(worst[1] <= shell_cap, "%s: no module left in many pieces" % kit,
              "%s has %d shells" % worst)


# ---------------------------------------------------------------------------
# report-level checks
# ---------------------------------------------------------------------------
def check_report(kit, report_path, navigation=False, ladder=True):
    if not report_path.exists():
        check(False, "%s: report missing" % kit, str(report_path))
        return None
    data = json.loads(report_path.read_text(encoding="utf-8"))
    modules = data.get("modules", [])
    check(bool(modules), "%s: report lists modules" % kit)

    missing = [m["id"] for m in modules if "tris" not in m]
    check(not missing, "%s: report records triangles, not just polygons" % kit,
          ", ".join(missing[:3]))
    if missing:
        return data

    if not ladder:
        return data
    total = [sum(m["tris"]["lod%d" % i] for m in modules) for i in range(3)]
    for i, target in enumerate(LOD_TARGETS):
        if i == 0:
            continue
        got = total[i] / float(total[0]) if total[0] else 0.0
        check(abs(got - target) <= LOD_TOLERANCE,
              "%s: LOD%d near its %.0f%% target" % (kit, i, target * 100),
              "measured %.0f%%" % (got * 100))

    if navigation:
        for m in modules:
            decks = {round(d["z"], 2) for d in m["walkableDecks"]}
            for r in m["rampLinks"]:
                check(round(r["toZ"], 2) in decks,
                      "%s/%s: ramp lands on a declared deck" % (kit, m["id"]),
                      "toZ=%.2f decks=%s" % (r["toZ"], sorted(decks)))
                check(abs(r["fromZ"]) <= 0.01 or round(r["fromZ"], 2) in decks,
                      "%s/%s: ramp foot rests on ground or a deck" % (kit, m["id"]),
                      "fromZ=%.2f" % r["fromZ"])
                check(r["underside"] <= r["fromZ"] + 0.01,
                      "%s/%s: ramp underside is not above its foot" % (kit, m["id"]))
                check(r["widthM"] >= 3.2,
                      "%s/%s: ramp is wide enough to drive" % (kit, m["id"]),
                      "%.2f m" % r["widthM"])
            check(bool(m["rampLinks"]),
                  "%s/%s: module is reachable at all" % (kit, m["id"]))

    pipeline = data.get("meshPipeline")
    if pipeline:
        check(not pipeline.get("rolledBack"),
              "%s: no module rolled back out of the mesh pipeline" % kit,
              ", ".join(pipeline.get("rolledBack", [])[:3]))
        check(pipeline["polysFinal"] <= pipeline["polysRaw"],
              "%s: the mesh pipeline did not inflate the kit" % kit,
              "%d -> %d" % (pipeline["polysRaw"], pipeline["polysFinal"]))
        check(pipeline["shellsFinalTotal"] <= pipeline["shellsRawTotal"],
              "%s: the mesh pipeline did not fragment the kit" % kit,
              "%d -> %d shells" % (pipeline["shellsRawTotal"],
                                   pipeline["shellsFinalTotal"]))
    return data


def check_footprint(kit, blend_path, report):
    """Nothing may sit in a neighbouring grid cell it did not declare."""
    if report is None or not blend_path.exists():
        return
    bpy.ops.wm.open_mainfile(filepath=str(blend_path))
    for m in report.get("modules", []):
        obj = None
        for o in bpy.data.objects:
            if o.type == "MESH" and o.name.endswith("_LOD0") and m["id"] in o.name:
                obj = o
                break
        if obj is None or "cells" not in m:
            continue
        allow_x = m["cells"][0] * GRID_HALF_M
        allow_y = m["cells"][1] * GRID_HALF_M
        for r in m.get("rampLinks", []):
            reach = r["runM"] + r.get("toeM", 0.0) + r.get("overlapM", 0.0)
            cx, cy = r["centre"]
            if r["axis"] == "y":
                allow_y = max(allow_y, abs(cy) + reach * 0.5 + 2.0)
            else:
                allow_x = max(allow_x, abs(cx) + reach * 0.5 + 2.0)
        over = 0.0
        for v in obj.data.vertices:
            over = max(over, abs(v.co.x) - allow_x, abs(v.co.y) - allow_y)
        check(over <= 2.0, "%s/%s: stays inside its declared cells" % (kit, m["id"]),
              "overhangs by %.1f m" % over)


def check_determinism(kit, blend_path):
    """The finishing pipeline must be repeatable.

    Booleans are the plausible source of drift here: solver output can depend
    on operand order, and operand order comes from a sort that has to break
    ties the same way every time.
    """
    if not blend_path.exists():
        return
    import runpy
    hs = runpy.run_path(str(Path(__file__).with_name("mf_hardsurface.py")),
                        run_name="mf_hardsurface")
    bpy.ops.wm.open_mainfile(filepath=str(blend_path))
    lod0 = sorted([o for o in bpy.data.objects
                   if o.type == "MESH" and o.name.endswith("_LOD0")],
                  key=lambda o: o.name)
    if not lod0:
        return
    source = lod0[0]
    runs = []
    for i in range(2):
        me = source.data.copy()
        obj = bpy.data.objects.new("MF_DETERMINISM_%d" % i, me)
        bpy.context.scene.collection.objects.link(obj)
        obj.matrix_world = source.matrix_world.copy()
        bpy.context.view_layer.update()
        hs["finalize"](obj, uv=0, shade=0, prune=False)
        runs.append((len(obj.data.vertices), len(obj.data.polygons)))
        bpy.data.objects.remove(obj, do_unlink=True)
    check(runs[0] == runs[1], "%s: finishing pipeline is deterministic" % kit,
          "%s vs %s" % (runs[0], runs[1]))


# Every kit, with what each one can honestly be held to.
#   nav      -- declares walkable decks and ramp links (platform kit only)
#   ladder   -- derives its LODs by decimation, so the tier ratios are a target
#               the build actually asked for. The array kits AUTHOR each tier
#               separately, so a ratio there would be asserting a coincidence.
#   collider -- carries a collision mesh per module
KIT_SPECS = [
    # shell_cap: how many disconnected pieces a finished module may be in.
    # Meaningful only where a module is meant to be ONE solid. The array kits
    # assemble modules from parts that legitimately never touch -- an antenna
    # farm, a pipe trestle, a spire crown -- so a union cannot fuse them and
    # capping the count would be asserting something untrue about the subject.
    ("platform",       "mf-platform-hs-v1",      dict(nav=True,  ladder=True,  collider=True,  shell_cap=12)),
    ("building",       "mf-building-hs-v1",      dict(nav=False, ladder=True,  collider=True,  shell_cap=12)),
    ("ground",         "mf-ground-kit-v1",       dict(nav=False, ladder=False, collider=True,  shell_cap=0)),
    ("cityforms",      "mf-cityforms-kit-v1",    dict(nav=False, ladder=False, collider=True,  shell_cap=0)),
    ("superstructure", "mf-superstructure-v1",   dict(nav=False, ladder=False, collider=True,  shell_cap=0)),
    ("transit",        "mf-transit-kit-v1",      dict(nav=False, ladder=False, collider=False, shell_cap=0)),
    ("modular-bld",    "mf-modular-building-v1", dict(nav=False, ladder=False, collider=False, shell_cap=0)),
    ("road",           "mf-modular-road-v1",     dict(nav=False, ladder=False, collider=False, shell_cap=0)),
    ("road-junctions", "mf-road-junctions-v1",   dict(nav=False, ladder=False, collider=False, shell_cap=0)),
    ("road-hy-clean",  "mf-road-straight-hunyuan-clean-v1",
                                                 dict(nav=False, ladder=False, collider=False, shell_cap=0)),
]


def main():
    for kit, folder, caps in KIT_SPECS:
        blend = KITS / folder / (folder + ".blend")
        report = KITS / folder / (folder + "-report.json")
        if not blend.exists():
            print("SKIP %s (not built)" % kit)
            continue
        data = check_report(kit, report, navigation=caps["nav"],
                            ladder=caps["ladder"]) if report.exists() else None
        check_blend(kit, blend, expect_collider=caps["collider"],
                    shell_cap=caps.get("shell_cap", 12))
        if data:
            check_footprint(kit, blend, data)
        check_determinism(kit, blend)

    print()
    print("=" * 68)
    if FAILURES:
        print("FAILED %d of %d checks" % (len(FAILURES), CHECKS[0]))
        for f in FAILURES:
            print("  x %s" % f)
        print("=" * 68)
        sys.exit(1)
    print("PASSED all %d checks" % CHECKS[0])
    print("=" * 68)


try:
    main()
except Exception:
    # Blender exits 0 even when a script raises, so a crashed test run would
    # otherwise read as a pass -- which is the exact failure mode this file
    # exists to stop.
    import traceback
    traceback.print_exc()
    print("FAILED: the test run itself raised")
    sys.exit(1)
