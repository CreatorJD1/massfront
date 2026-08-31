"""Consolidate the array-pipeline kits into one object per module, per LOD.

    blender --background --factory-startup --python tools/blender/consolidate-mf-kits.py

The six array-built kits emit a separate object for every role a module has --
`..._LOD0_BASE_BLOCK`, `..._LOD0_COPING`, `..._LOD0_APPROACH_LIGHT` and so on,
743 to 2202 objects per kit. That was the original design, and the hard-surface
kits deliberately replaced it with one object carrying material slots, because
a role-split module cannot go through the finishing pipeline at all: the
boolean union, the coplanar merge and the hidden-face strip all operate on one
mesh, and a module scattered across forty objects has no single mesh to operate
on.

This joins each module's roles into one mesh -- in the module root's local
space, so nothing moves -- assigns each former object's material to a slot, and
then runs the same `finalize` the hard-surface kits use. Collision meshes are
left exactly as they are: they were authored per module with an explicit
`mf_collision_class` and are not derived from the visual mesh.

Joining is done by accumulating vertices in Python rather than through
`bpy.ops.object.join`, because the operator needs selection and an active
object, and in background mode that is a reliable source of silent no-ops.
"""
import json
import re
import runpy
import sys
import time
from pathlib import Path

import bpy
from mathutils import Vector

TOOLS = Path(__file__).resolve().parent
ROOT = TOOLS.parents[1]
KITS_DIR = ROOT / "modules/space_exploration/assets/source/blender/world-kits"

HS = runpy.run_path(str(TOOLS / "mf_hardsurface.py"), run_name="mf_hardsurface")
finalize = HS["finalize"]
mesh_stats = HS["mesh_stats"]
purge_orphans = HS["purge_orphans"]

# kit directory -> export filename stem, taken from what each kit already wrote
KITS = [
    ("mf-ground-kit-v1", "mf-gnd"),
    ("mf-cityforms-kit-v1", "mf-frm"),
    ("mf-superstructure-v1", "mf-sup"),
    ("mf-transit-kit-v1", "mf-trn"),
    ("mf-modular-building-v1", "mf-bld"),
    ("mf-modular-road-v1", "mf-road"),
]

LOD_RE = re.compile(r"^(?P<key>.+?)_LOD(?P<lod>\d+)(?:_(?P<role>.+))?$")
SKIP = ("COLLISION", "NAV", "SOCKET", "EVIDENCE", "PROOF", "CAMERA", "FLOOR")


# Evidence and tiling-proof geometry is flagged by CUSTOM PROPERTY, not by
# name: the cityforms kit lays proof copies of a module out across a thousand
# metres to demonstrate seams, and names them exactly like the module. Grouping
# on the name alone swept them into the join, so colonial_mega_slab came out
# 1322 m wide and the footprint check correctly rejected it.
SKIP_PROPS = ("mf_proof_only", "mf_evidence_only", "mf_collision")


def is_skippable(obj_or_name):
    if not isinstance(obj_or_name, str):
        for prop in SKIP_PROPS:
            if obj_or_name.get(prop):
                return True
        name = obj_or_name.name
    else:
        name = obj_or_name
    upper = name.upper()
    return any(token in upper for token in SKIP)


def group_modules(objects):
    """{module key: {lod index: [objects]}} from the kit's own naming."""
    groups = {}
    for obj in objects:
        if obj.type != "MESH" or is_skippable(obj):
            continue
        match = LOD_RE.match(obj.name)
        if not match:
            continue
        key = match.group("key")
        lod = int(match.group("lod"))
        groups.setdefault(key, {}).setdefault(lod, []).append(obj)
    return groups


def join_group(objs, name, collection, parent):
    """One mesh from many.

    Everything is gathered in WORLD space and then recentred on the module's
    own origin, because the roles within one module do not all share a parent:
    transforming them all by one root's inverse scattered the ground kit's
    landing pad across 1950 m instead of 32. Each object's own matrix_world is
    the only transform that is right for every one of them.
    """
    verts = []
    faces = []
    face_material = []
    materials = []
    material_index = {}

    for obj in sorted(objs, key=lambda o: o.name):
        me = obj.data
        transform = obj.matrix_world
        offset = len(verts)
        for v in me.vertices:
            verts.append(tuple(transform @ v.co))

        slots = list(me.materials) or [None]
        remap = {}
        for i, mat in enumerate(slots):
            token = mat.name if mat else "__none__"
            if token not in material_index:
                material_index[token] = len(materials)
                materials.append(mat)
            remap[i] = material_index[token]

        for poly in me.polygons:
            faces.append(tuple(i + offset for i in poly.vertices))
            face_material.append(remap.get(poly.material_index, 0))

    if not faces:
        return None

    # Recentre on the GEOMETRY, never on the root empty. Several array kits
    # bake the layout offset into vertex data and leave the root at the world
    # origin, so trusting the root left modules sitting 2500 m from their own
    # origin -- which the footprint check correctly reported as a 2500 m
    # overhang. The footprint centre at ground level is right in both cases.
    xs = [v[0] for v in verts]
    ys = [v[1] for v in verts]
    zs = [v[2] for v in verts]
    origin = Vector(((min(xs) + max(xs)) * 0.5,
                     (min(ys) + max(ys)) * 0.5, min(zs)))
    verts = [(v[0] - origin.x, v[1] - origin.y, v[2] - origin.z) for v in verts]

    mesh = bpy.data.meshes.new(name + "_MESH")
    mesh.from_pydata(verts, [], faces)
    mesh.update(calc_edges=True)
    for mat in materials:
        mesh.materials.append(mat)
    for poly, index in zip(mesh.polygons, face_material):
        poly.material_index = index
    mesh.update()

    joined = bpy.data.objects.new(name, mesh)
    collection.objects.link(joined)
    joined.location = origin
    schema = objs[0].get("mf_schema") or objs[0].data.get("mf_schema")
    if schema:
        joined["mf_schema"] = schema
        mesh["mf_schema"] = schema
    return joined


def export_module(objects, path):
    # the view layer still lists the objects that were just removed until the
    # depsgraph catches up, and iterating a stale list yields None entries
    bpy.context.view_layer.update()
    view = bpy.context.view_layer
    for obj in list(bpy.context.selected_objects):
        if obj is not None:
            obj.select_set(False)
    exported = [o for o in objects if o is not None and o.name in view.objects]
    if not exported:
        return False
    for obj in exported:
        obj.select_set(True)
    view.objects.active = exported[0]
    bpy.ops.export_scene.gltf(filepath=str(path), export_format="GLB",
                              use_selection=True, export_apply=False,
                              export_yup=True)
    for obj in exported:
        try:
            obj.select_set(False)
        except (ReferenceError, AttributeError):
            pass
    return True


def consolidate(kit_dir, stem):
    blend = kit_dir / (kit_dir.name + ".blend")
    if not blend.exists():
        print("SKIP %-24s (not built)" % kit_dir.name)
        return None
    bpy.ops.wm.open_mainfile(filepath=str(blend))
    started = time.time()

    groups = group_modules(list(bpy.data.objects))
    if not groups:
        print("SKIP %-24s (no LOD-named meshes)" % kit_dir.name)
        return None

    before_objects = len([o for o in bpy.data.objects if o.type == "MESH"])
    stats = {"kit": kit_dir.name, "modules": len(groups), "objectsBefore": before_objects,
             "polysBefore": 0, "polysAfter": 0, "welded": 0, "rolledBack": 0,
             "exported": 0}
    export_dir = kit_dir / "exports"
    export_dir.mkdir(parents=True, exist_ok=True)

    for key in sorted(groups):
        lods = groups[key]
        parent = None
        collection = bpy.context.scene.collection
        for objs in lods.values():
            for obj in objs:
                if obj.parent is not None:
                    parent = obj.parent
                if obj.users_collection:
                    collection = obj.users_collection[0]
                break
            break

        produced = []
        for lod in sorted(lods):
            source = lods[lod]
            stats["polysBefore"] += sum(len(o.data.polygons) for o in source)
            joined = join_group(source, "%s_JOINED_LOD%d" % (key, lod),
                                collection, parent)
            if joined is None:
                continue
            joined["mf_lod"] = lod
            if lod == 0:
                report = finalize(joined)
                weld = report.get("weld", {})
                if weld.get("welded"):
                    stats["welded"] += 1
                if weld.get("rolledBack"):
                    stats["rolledBack"] += 1
            else:
                # lower tiers get the finishing but not the geometry pipeline:
                # they are authored approximations, not derived from LOD0, so a
                # union would change what the kit already decided they are
                HS["clean_mesh"](joined)
                HS["prune_materials"](joined)
                HS["uv_box_project"](joined, metres_per_tile=4.0)
                HS["shade_hard_surface"](joined, sharp_angle=35.0,
                                         weighted_normals=False)
            stats["polysAfter"] += len(joined.data.polygons)
            produced.append(joined)

        for objs in lods.values():
            for obj in objs:
                mesh = obj.data
                bpy.data.objects.remove(obj, do_unlink=True)
                if mesh.users == 0:
                    bpy.data.meshes.remove(mesh)

        for joined in produced:
            joined.name = joined.name.replace("_JOINED", "")
            joined.data.name = joined.name + "_MESH"

        collision = [o for o in bpy.data.objects
                     if o.type == "MESH" and "COLLISION" in o.name.upper()
                     and o.name.upper().startswith(key.upper())]
        slug = key.split("_V1_", 1)[-1] if "_V1_" in key else key
        slug = slug.lower().replace("_", "-")
        if export_module(produced + collision, export_dir / ("%s-%s.glb" % (stem, slug))):
            stats["exported"] += 1

    stale = purge_orphans()
    bpy.ops.wm.save_as_mainfile(filepath=str(blend))
    stats["objectsAfter"] = len([o for o in bpy.data.objects if o.type == "MESH"])
    stats["seconds"] = round(time.time() - started, 1)
    stats["purged"] = stale
    print("%-24s %4d modules | objects %5d -> %-5d | polys %7d -> %-7d | "
          "welded %3d rolled back %2d | %4d glb | %5.1fs"
          % (kit_dir.name, stats["modules"], stats["objectsBefore"],
             stats["objectsAfter"], stats["polysBefore"], stats["polysAfter"],
             stats["welded"], stats["rolledBack"], stats["exported"],
             stats["seconds"]))
    return stats


def refresh_report(kit_dir):
    """Bring the kit's own report back in line with the consolidated blend.

    Consolidation changes what every module IS -- one mesh instead of forty --
    so the triangle counts the generator wrote are no longer describing the
    file on disk. A report that disagrees with its blend is worse than no
    report, because it is the thing everything downstream trusts.
    """
    report_path = kit_dir / (kit_dir.name + "-report.json")
    blend = kit_dir / (kit_dir.name + ".blend")
    if not report_path.exists() or not blend.exists():
        return None
    data = json.loads(report_path.read_text(encoding="utf-8"))
    modules = data.get("modules") or []
    if not modules:
        return None
    bpy.ops.wm.open_mainfile(filepath=str(blend))

    by_key = {}
    for obj in bpy.data.objects:
        if obj.type != "MESH":
            continue
        match = LOD_RE.match(obj.name)
        if not match or match.group("role"):
            continue
        key = match.group("key")
        slug = key.split("_V1_", 1)[-1] if "_V1_" in key else key
        by_key.setdefault(slug.lower(), {})[int(match.group("lod"))] = obj

    touched = 0
    for module in modules:
        ident = str(module.get("id") or "").lower()
        found = by_key.get(ident)
        if not found:
            continue
        tris = {}
        for lod, obj in found.items():
            tris["lod%d" % lod] = sum(max(0, len(p.vertices) - 2)
                                      for p in obj.data.polygons)
        module["tris"] = tris
        module["polys"] = {"lod%d" % lod: len(obj.data.polygons)
                           for lod, obj in found.items()}
        for record in module.get("lods") or []:
            key = "lod%d" % record.get("lod", -1)
            if key in tris:
                record["triangles"] = tris[key]
        module["objectsPerModule"] = len(found)
        touched += 1

    data["consolidated"] = {
        "tool": "tools/blender/consolidate-mf-kits.py",
        "oneObjectPerModulePerLod": True,
        "modulesRefreshed": touched,
    }
    report_path.write_text(json.dumps(data, indent=2), encoding="utf-8")
    print("  refreshed report: %d/%d modules" % (touched, len(modules)))
    return touched


def main():
    if "--refresh-reports" in sys.argv:
        for name, _ in KITS:
            kit_dir = KITS_DIR / name
            if (kit_dir / (kit_dir.name + ".blend")).exists():
                print(name)
                refresh_report(kit_dir)
        return
    wanted = [a for a in sys.argv if a.startswith("mf-")]
    rows = []
    for name, stem in KITS:
        if wanted and name not in wanted:
            continue
        try:
            row = consolidate(KITS_DIR / name, stem)
        except Exception:
            import traceback
            traceback.print_exc()
            print("FAILED %s" % name)
            row = None
        if row:
            rows.append(row)
            refresh_report(KITS_DIR / name)
    if rows:
        out = KITS_DIR / "consolidation-report.json"
        out.write_text(json.dumps(rows, indent=2), encoding="utf-8")
        print()
        print("consolidated %d kits, %d modules, %d -> %d objects, %d -> %d polys"
              % (len(rows), sum(r["modules"] for r in rows),
                 sum(r["objectsBefore"] for r in rows),
                 sum(r["objectsAfter"] for r in rows),
                 sum(r["polysBefore"] for r in rows),
                 sum(r["polysAfter"] for r in rows)))
        print("report: %s" % out)


try:
    main()
except Exception:
    import traceback
    traceback.print_exc()
    sys.exit(1)
