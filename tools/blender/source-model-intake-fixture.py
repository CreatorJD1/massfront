"""Build a tiny contaminated GLB used by source-model-intake.selftest.mjs."""

import bpy
import os
import sys


if "--" not in sys.argv or len(sys.argv[sys.argv.index("--") + 1 :]) != 1:
    raise SystemExit("expected -- OUTPUT.glb")
output_path = sys.argv[sys.argv.index("--") + 1]

bpy.ops.wm.read_factory_settings(use_empty=True)


def material(name, color):
    value = bpy.data.materials.new(name)
    value.diffuse_color = (*color, 1.0)
    return value


core_mat = material("Fixture Core", (0.12, 0.18, 0.24))
wing_mat = material("Fixture Wing", (0.45, 0.42, 0.36))
studio_mat = material("Studio Floor", (0.5, 0.5, 0.5))

bpy.ops.mesh.primitive_cube_add(location=(1.0, 0.0, 1.0), scale=(1.0, 1.0, 1.0))
core = bpy.context.object
core.name = "Intended Core"
core.data.name = "Intended Core Mesh"
core.data.materials.append(core_mat)

bpy.ops.mesh.primitive_cube_add(location=(-1.25, 0.0, 0.5), scale=(0.5, 0.75, 0.5))
wing = bpy.context.object
wing.name = "Intended Service Wing"
wing.data.name = "Intended Service Wing Mesh"
wing.data.materials.append(wing_mat)

bpy.ops.mesh.primitive_cube_add(location=(0.0, 0.0, -0.25), scale=(10.0, 10.0, 0.25))
floor = bpy.context.object
floor.name = "Ground Shadow Catcher"
floor.data.materials.append(studio_mat)

bpy.ops.object.camera_add(location=(8.0, -8.0, 8.0))
bpy.context.object.name = "Studio Camera"
bpy.ops.object.light_add(type="POINT", location=(0.0, 0.0, 8.0))
bpy.context.object.name = "Studio Key Light"

os.makedirs(os.path.dirname(output_path), exist_ok=True)
bpy.ops.export_scene.gltf(
    filepath=output_path,
    export_format="GLB",
    export_materials="EXPORT",
    export_cameras=True,
    export_lights=True,
    export_yup=True,
)
