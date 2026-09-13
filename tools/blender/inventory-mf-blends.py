"""Enumerate every model held in every .blend save file in the repository.

    blender --background --factory-startup --python tools/blender/inventory-mf-blends.py

Writes tools/blender/blend-inventory.json plus a readable summary on stdout.

The point is to know what is actually inside each save file, as opposed to what
the kit reports claim. Those two have drifted before: every array-kit generator
carried a NameError that meant the reports on disk described a script version
that no longer ran, and the kits were saving Blender's factory Cube into the
shipped file for good measure.

Objects are classified by what they are for, not by name alone, because the
kits use several naming conventions: role-split (`..._LOD0_COPING`),
consolidated (`..._LOD0`), collision (`..._COLLISION`) and evidence rigs that
should never leave the file.
"""
import json
import sys
from pathlib import Path

import bpy

ROOT = Path(__file__).resolve().parents[2]
OUT = Path(__file__).resolve().parent / "blend-inventory.json"

DEFAULT_NAMES = {"Cube", "Plane", "Sphere", "Icosphere", "Cylinder", "Cone",
                 "Torus", "Circle", "Grid", "Suzanne", "Camera", "Light", "Lamp"}


def classify(obj):
    name = obj.name.upper()
    if obj.name.split(".")[0] in DEFAULT_NAMES and not obj.get("mf_schema"):
        return "factory-leftover"
    if obj.get("mf_evidence_only") or "EVIDENCE" in name or "FLOOR" in name:
        return "evidence-rig"
    if obj.get("mf_proof_only") or "PROOF" in name:
        return "proof-tiling"
    if obj.get("mf_collision") or "COLLISION" in name:
        return "collision"
    if "NAV" in name:
        return "nav-proxy"
    if "_LOD1" in name or "_LOD2" in name:
        return "lod-tier"
    if "_LOD0" in name:
        return "model-lod0"
    return "other-mesh"


def tri_count(mesh):
    return sum(max(0, len(p.vertices) - 2) for p in mesh.polygons)


def survey(path):
    bpy.ops.wm.open_mainfile(filepath=str(path))
    buckets = {}
    modules = set()
    total_tris = 0
    no_uv = 0
    flat = 0
    for obj in bpy.data.objects:
        if obj.type != "MESH":
            continue
        kind = classify(obj)
        tris = tri_count(obj.data)
        entry = buckets.setdefault(kind, {"objects": 0, "tris": 0, "examples": []})
        entry["objects"] += 1
        entry["tris"] += tris
        if len(entry["examples"]) < 3:
            entry["examples"].append(obj.name)
        total_tris += tris
        if kind in ("model-lod0", "lod-tier", "other-mesh"):
            if not len(obj.data.uv_layers):
                no_uv += 1
            if not any(p.use_smooth for p in obj.data.polygons):
                flat += 1
        if kind == "model-lod0":
            key = obj.name.split("_LOD0")[0]
            modules.add(key)

    return {
        "file": str(path.relative_to(ROOT)).replace("\\", "/"),
        "sizeMB": round(path.stat().st_size / 1048576.0, 1),
        "meshObjects": sum(b["objects"] for b in buckets.values()),
        "modules": len(modules),
        "triangles": total_tris,
        "byKind": buckets,
        "renderableWithoutUV": no_uv,
        "renderableFlatShaded": flat,
        "materials": len(bpy.data.materials),
    }


def main():
    blends = sorted(p for p in ROOT.rglob("*.blend")
                    if ".git" not in p.parts and "node_modules" not in p.parts)
    rows = []
    for path in blends:
        try:
            rows.append(survey(path))
        except Exception as exc:
            rows.append({"file": str(path.relative_to(ROOT)).replace("\\", "/"),
                         "error": str(exc)[:120]})

    OUT.write_text(json.dumps(rows, indent=2), encoding="utf-8")

    print()
    print("%-52s %7s %6s %5s %9s %s" %
          ("save file", "size MB", "meshes", "mods", "triangles", "contents"))
    print("-" * 132)
    for row in rows:
        if "error" in row:
            print("%-52s  ERROR %s" % (row["file"][:52], row["error"]))
            continue
        kinds = row["byKind"]
        summary = " ".join("%s:%d" % (k.replace("model-", "").replace("-", ""), v["objects"])
                           for k, v in sorted(kinds.items()) if v["objects"])
        print("%-52s %7.1f %6d %5d %9d %s" %
              (row["file"].split("/")[-1][:52], row["sizeMB"], row["meshObjects"],
               row["modules"], row["triangles"], summary))

    print()
    stale = [r for r in rows if r.get("byKind", {}).get("factory-leftover")]
    bare = [r for r in rows if r.get("renderableWithoutUV")]
    print("files still holding factory leftovers: %s"
          % (", ".join(r["file"].split("/")[-1] for r in stale) or "none"))
    print("files with un-unwrapped renderable meshes: %s"
          % (", ".join("%s(%d)" % (r["file"].split("/")[-1], r["renderableWithoutUV"])
                       for r in bare) or "none"))
    print("total: %d save files, %d mesh objects, %d triangles"
          % (len(rows), sum(r.get("meshObjects", 0) for r in rows),
             sum(r.get("triangles", 0) for r in rows)))
    print("written: %s" % OUT.relative_to(ROOT))


try:
    main()
except Exception:
    import traceback
    traceback.print_exc()
    sys.exit(1)
