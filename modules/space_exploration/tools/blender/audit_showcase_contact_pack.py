"""Print deterministic bounds for every exported showcase contact LOD."""

from __future__ import annotations

from pathlib import Path

import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[2]
BLEND_PATH = ROOT / "assets" / "source" / "blender" / "massfront-showcase-contacts.blend"
CONTACT_IDS = (
    "aelos_embassy_spindle",
    "aelos_logistics_array",
    "aelos_veyra_gate",
    "veyra_archive_hulk",
    "veyra_aelos_gate",
    "veyra_karak_gate",
    "karak_colony_spine",
    "karak_lifeboat_field",
    "karak_veyra_gate",
)


def mesh_descendants(root):
    pending = list(root.children)
    meshes = []
    while pending:
        obj = pending.pop()
        pending.extend(obj.children)
        if obj.type == "MESH":
            meshes.append(obj)
    return meshes


def bounds(meshes):
    minimum = Vector((float("inf"),) * 3)
    maximum = Vector((float("-inf"),) * 3)
    for obj in meshes:
        for vertex in obj.data.vertices:
            point = obj.matrix_world @ vertex.co
            minimum.x = min(minimum.x, point.x)
            minimum.y = min(minimum.y, point.y)
            minimum.z = min(minimum.z, point.z)
            maximum.x = max(maximum.x, point.x)
            maximum.y = max(maximum.y, point.y)
            maximum.z = max(maximum.z, point.z)
    return minimum, maximum, maximum - minimum


bpy.ops.wm.open_mainfile(filepath=str(BLEND_PATH))
bpy.context.view_layer.update()
for contact_id in CONTACT_IDS:
    for level in range(3):
        lod = bpy.data.objects[f"LOD{level}_{contact_id}"]
        meshes = mesh_descendants(lod)
        minimum, maximum, size = bounds(meshes)
        print(
            f"{contact_id} LOD{level}: meshes={len(meshes)} "
            f"min=({minimum.x:.3f},{minimum.y:.3f},{minimum.z:.3f}) "
            f"max=({maximum.x:.3f},{maximum.y:.3f},{maximum.z:.3f}) "
            f"size=({size.x:.3f},{size.y:.3f},{size.z:.3f})"
        )
