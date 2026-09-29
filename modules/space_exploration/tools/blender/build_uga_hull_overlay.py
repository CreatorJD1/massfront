"""Build a small, geometry-only NEXUS-VII cutaway hull overlay.

The editable command cutaway has progressed to v6 while the delivered room
graph is still v5. This separate overlay preserves the shipped eleven-room
graph and fits its longitudinal coordinates without re-exporting its rooms.
Run with Blender 5.2 in background mode; paths after ``--`` are repo-relative.
"""

import argparse
import json
import os
from pathlib import Path
import subprocess
import sys

import bpy


MODULE_ROOT = Path(__file__).resolve().parents[2]
REPO_ROOT = MODULE_ROOT.parents[1]
DEFAULT_GLB = MODULE_ROOT / "assets/runtime/models/nexus-vii-cutaway-hull-overlay.glb"
DEFAULT_BLEND = MODULE_ROOT / "assets/source/blender/nexus-vii-cutaway-hull-overlay.blend"


def repo_path(value):
    path = Path(value)
    path = (path if path.is_absolute() else REPO_ROOT / path).resolve()
    if not path.is_relative_to(REPO_ROOT):
        raise ValueError(f"Output must stay under the MASSFRONT checkout: {path}")
    return path


def material(name, color, metallic, roughness, emission=(0, 0, 0, 1)):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1)
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Emission Color"].default_value = emission
    bsdf.inputs["Emission Strength"].default_value = 0.14 if any(emission[:3]) else 0
    return mat


def make_mesh(name, vertices, faces, role, root, materials, focus_safe=True):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.validate(clean_customdata=False)
    mesh.update(calc_edges=True)
    uv = mesh.uv_layers.new(name="UVMap")
    # Metric box projection keeps the overlay compatible with the v5 hull's
    # authored PBR sheets without embedding a duplicate texture payload.
    for polygon in mesh.polygons:
        axis = max(range(3), key=lambda index: abs(polygon.normal[index]))
        for loop_index in polygon.loop_indices:
            vertex = mesh.vertices[mesh.loops[loop_index].vertex_index].co
            a, b = ((vertex.y, vertex.z) if axis == 0 else
                    (vertex.x, vertex.z) if axis == 1 else
                    (vertex.x, vertex.y))
            uv.data[loop_index].uv = (a / 2.0, b / 2.0)
        polygon.use_smooth = False
    mesh.materials.append(materials[role])
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.parent = root
    obj["material_role"] = role
    obj["render_role"] = "window_emissive" if role == "glazing" else "ship_hull_overlay"
    obj["focus_safe"] = focus_safe
    return obj


def xz_plate(name, outline, near_y, far_y, role, root, materials, focus_safe=True):
    """Faceted x/z armor profile extruded just along ship depth."""
    n = len(outline)
    vertices = [(x, near_y, z) for x, z in outline]
    vertices += [(x, far_y, z) for x, z in outline]
    # Positive x/z outline has its visible near face toward negative Y.
    faces = [tuple(range(n)), tuple(reversed(range(n, 2 * n)))]
    faces += [(i, (i + 1) % n, (i + 1) % n + n, i + n) for i in range(n)]
    return make_mesh(name, vertices, faces, role, root, materials, focus_safe)


def bow_cap(root, materials):
    # The v5 Command deck begins at x=-33.5. Keep the entire prow outside it;
    # the near-facing shell is thus visible without covering its controls.
    # The lower Command room ends around z=4.85. Split the crown at z=5 so a
    # focused room cannot inherit a full-height dark wall behind its controls.
    profiles = [
        (-36.10, 0.55, 2.05, 7.85),
        (-35.65, 2.15, 0.65, 9.20),
        (-34.55, 3.75, -0.36, 10.02),
        (-33.56, 4.35, -0.68, 10.35),
    ]
    for upper, name in ((False, "NexusVII_BowCap"), (True, "NexusVII_BowCrown")):
        vertices = []
        for x, width, low, high in profiles:
            bevel = min(0.85, (high - low) * 0.16)
            ring = (
                [(-width, 5.0), (width, 5.0), (width, high - bevel),
                 (width * .62, high), (-width * .62, high),
                 (-width, high - bevel)]
                if upper else
                [(-width * .62, low), (width * .62, low),
                 (width, low + bevel), (width, 5.0),
                 (-width, 5.0), (-width, low + bevel)]
            )
            vertices += [(x, y, z) for y, z in ring]
        faces = [tuple(reversed(range(6)))]
        cut_edge = 0 if upper else 3
        for profile in range(len(profiles) - 1):
            a, b = profile * 6, (profile + 1) * 6
            faces += [
                (a + i, a + (i + 1) % 6, b + (i + 1) % 6, b + i)
                for i in range(6) if i != cut_edge
            ]
        make_mesh(name, vertices, faces, "armor", root, materials, not upper)


def far_command_shell(root, materials):
    # The first v5 rear panel starts at x=-23, leaving Command naked from aft.
    # A chamfered panel and narrow window ribbons close that one missing bay.
    xz_plate("NexusVII_FarHullPanel_Command", [
        (-33.42, 0.18), (-32.67, -0.28), (-23.55, -0.28),
        (-22.98, 0.10), (-22.98, 5.00), (-33.42, 5.00),
    ], 3.48, 4.43, "armor", root, materials)
    xz_plate("NexusVII_CommandUpperShell", [
        (-33.42, 5.00), (-22.98, 5.00), (-22.98, 9.67),
        (-23.58, 10.14), (-32.64, 10.14), (-33.42, 9.48),
    ], 3.48, 4.43, "armor", root, materials, False)
    for deck, z in (("Lower", 1.72), ("Upper", 6.68)):
        xz_plate(f"NexusVII_WindowRibbon_Command_{deck}", [
            (-32.70, z), (-23.62, z), (-23.28, z + .12),
            (-23.28, z + .34), (-23.62, z + .44), (-32.70, z + .44),
        ], 3.30, 3.47, "glazing", root, materials)


def lower_rear_shells(root, materials, sections):
    # The six delivered rear panels span both decks. Lower-room focus hides
    # those full-height pieces and uses these same-footprint, low-only armor
    # fragments instead; overview/upper focus keep the original panels.
    for suffix, x0, x1 in sections:
        if suffix == "Command":
            continue
        panel = xz_plate(f"NexusVII_FarHullPanel_Lower_{suffix}", [
            (x0, .10), (x0 + .60, -.28), (x1 - .60, -.28),
            (x1, .10), (x1, 5.00), (x0, 5.00),
        ], 3.48, 4.43, "armor", root, materials)
        panel["presentation_scope"] = "lower_focus_only"


def near_sill(name, x0, x1, low, high, root, materials):
    # All near pieces remain outside the room floors (which start at y=-3.5
    # for Command and y=-3.35 elsewhere). The angled top reads as armor.
    xz_plate(name, [
        (x0, low + .12), (x0 + .46, low - .16),
        (x1 - .46, low - .16), (x1, low + .12),
        (x1 - .36, high - .10), (x1 - .86, high),
        (x0 + .86, high), (x0 + .36, high - .10),
    ], -4.46, -4.02, "armor", root, materials)
    # One thin lower edge catches the ship silhouette without becoming a
    # luminous UI outline or an obstructing wall across the compartment.
    xz_plate(name.replace("NearHullSill", "NearHullAccent"), [
        (x0 + .73, high - .13), (x1 - .73, high - .13),
        (x1 - .88, high - .07), (x0 + .88, high - .07),
    ], -4.47, -4.44, "accent", root, materials)


def small_frame(name, x, low, high, root, materials):
    xz_plate(name, [
        (x - .29, low), (x + .29, low),
        (x + .13, low + .34), (x + .13, high - .26),
        (x + .30, high), (x - .30, high),
        (x - .13, high - .26), (x - .13, low + .34),
    ], -4.53, -4.16, "armor", root, materials)


def overview_silhouette(root, materials, sections):
    # Segment the existing long keel/ceiling only in the overview silhouette.
    # Runtime focus filtering must hide these crown/chine pieces, keeping the
    # authored room framing free of floating full-ship slabs.
    for suffix, x0, x1 in sections:
        xz_plate(f"NexusVII_CrownSegment_{suffix}", [
            (x0, 9.84), (x1, 9.84), (x1 - .60, 10.22),
            (x1 - 1.20, 10.48), (x0 + 1.20, 10.48),
            (x0 + .60, 10.22),
        ], -4.14, -3.70, "armor", root, materials, False)
        xz_plate(f"NexusVII_KeelChine_{suffix}", [
            (x0, -.42), (x0 + .65, -.82),
            (x1 - .65, -.82), (x1, -.42),
        ], -4.32, -3.84, "armor", root, materials, False)


def build():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.preferences.filepaths.save_version = 0
    root = bpy.data.objects.new("NEXUS_VII_HULL_OVERLAY", None)
    bpy.context.collection.objects.link(root)
    root["asset_role"] = "uga_ship_cutaway_hull_overlay"
    root["ship_identity"] = "nexus_vii"
    root["source_contract"] = "delivered_v5_longitudinal_cutaway"
    root["geometry_only"] = True
    mats = {
        "armor": material("NEXUS-VII Overlay Armor Placeholder", (.055, .082, .105), .74, .39),
        "glazing": material("NEXUS-VII Overlay Glazing Placeholder", (.020, .10, .14), .22, .23, (.01, .10, .14, 1)),
        "accent": material("NEXUS-VII Overlay Accent Placeholder", (.12, .19, .22), .42, .33, (.01, .06, .08, 1)),
    }
    bow_cap(root, mats)
    far_command_shell(root, mats)
    sections = [("Command", -33.34, -23.04)]
    sections += [(str(i + 1), x, min(29.0, x + 8.72)) for i, x in enumerate((-23, -14, -5, 4, 13, 22))]
    lower_rear_shells(root, mats, sections)
    for suffix, x0, x1 in sections:
        near_sill(f"NexusVII_NearHullSill_{suffix}_Lower", x0, x1, -.38, .52, root, mats)
        # Make this a railing above the upper deck floor at z≈5.05. Its
        # underside stays clear of lower-room focus bounds plus context pad.
        near_sill(f"NexusVII_NearHullSill_{suffix}_Upper", x0, x1, 5.68, 6.18, root, mats)
    for index, x in enumerate((-33.36, -23.0, -14.0, -5.0, 4.0, 13.0, 22.0, 29.0), 1):
        small_frame(f"NexusVII_HullFrame_{index:02d}_Lower", x, -.68, 1.08, root, mats)
        small_frame(f"NexusVII_HullFrame_{index:02d}_Upper", x, 8.92, 10.34, root, mats)
    overview_silhouette(root, mats, sections)
    return root


def save(blend_path, glb_path):
    for path in (blend_path, glb_path):
        path.parent.mkdir(parents=True, exist_ok=True)
    staged_blend = blend_path.with_name(f"{blend_path.stem}.{os.getpid()}.next.blend")
    staged_glb = glb_path.with_name(f"{glb_path.stem}.{os.getpid()}.next.glb")
    bpy.ops.wm.save_as_mainfile(filepath=str(staged_blend))
    bpy.ops.export_scene.gltf(
        filepath=str(staged_glb), export_format="GLB", export_apply=True,
        export_extras=True, export_yup=False, export_cameras=False,
        export_lights=False,
    )
    if staged_blend.stat().st_size < 4096 or staged_glb.read_bytes()[:4] != b"glTF":
        raise RuntimeError("Incomplete staged NEXUS-VII hull overlay")
    os.replace(staged_blend, blend_path)
    os.replace(staged_glb, glb_path)


def main():
    raw = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", default=str(DEFAULT_GLB))
    parser.add_argument("--blend", default=str(DEFAULT_BLEND))
    args = parser.parse_args(raw)
    glb_path, blend_path = repo_path(args.output), repo_path(args.blend)
    subprocess.run(["node", str(REPO_ROOT / "tools/evidence-foundation/workspace-guard.mjs"), "check-write"], cwd=REPO_ROOT, check=True)
    root = build()
    save(blend_path, glb_path)
    meshes = [obj for obj in bpy.data.objects if obj.type == "MESH"]
    print(json.dumps({
        "root": root.name, "glb": str(glb_path.relative_to(REPO_ROOT)),
        "blend": str(blend_path.relative_to(REPO_ROOT)),
        "objects": len(meshes), "glbBytes": glb_path.stat().st_size,
        "names": sorted(obj.name for obj in meshes),
    }))


if __name__ == "__main__":
    main()
