import argparse
import math
from pathlib import Path

import bpy
from mathutils import Vector


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--view", choices=("front", "back", "side"), default="front")
    args = []
    if "--" in __import__("sys").argv:
        args = __import__("sys").argv[__import__("sys").argv.index("--") + 1 :]
    return parser.parse_args(args)


def look_at(camera, target):
    direction = Vector(target) - camera.location
    camera.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def world_bounds(obj):
    corners = [obj.matrix_world @ Vector(corner) for corner in obj.bound_box]
    minimum = Vector(tuple(min(corner[axis] for corner in corners) for axis in range(3)))
    maximum = Vector(tuple(max(corner[axis] for corner in corners) for axis in range(3)))
    return minimum, maximum


def main():
    args = parse_args()
    source = Path(args.input).resolve()
    output = Path(args.output).resolve()
    output.parent.mkdir(parents=True, exist_ok=True)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(source))
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    if len(meshes) != 1:
        raise RuntimeError(f"Expected one source mesh, found {len(meshes)}")
    mesh = meshes[0]
    minimum, maximum = world_bounds(mesh)
    center = (minimum + maximum) * 0.5
    size = maximum - minimum

    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 900
    scene.render.resolution_y = 1100
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.film_transparent = False
    scene.render.filepath = str(output)
    scene.view_settings.look = "AgX - Medium High Contrast"

    world = bpy.data.worlds.new("MASSFRONT Preview World")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.025, 0.055, 0.08, 1.0)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.7
    scene.world = world

    camera_data = bpy.data.cameras.new("Preview Camera")
    camera = bpy.data.objects.new("Preview Camera", camera_data)
    scene.collection.objects.link(camera)
    scene.camera = camera
    camera_data.type = "ORTHO"
    camera_data.ortho_scale = max(size.z * 1.12, size.x * 1.12 * scene.render.resolution_y / scene.render.resolution_x)
    distance = max(size.x, size.y, size.z) * 2.2
    if args.view == "front":
        camera.location = (center.x, center.y - distance, center.z)
    elif args.view == "back":
        camera.location = (center.x, center.y + distance, center.z)
    else:
        camera.location = (center.x + distance, center.y, center.z)
    look_at(camera, center)

    for location, energy, size_value in (
        ((center.x - size.x * 0.6, center.y - size.y * 1.5, center.z + size.z * 0.65), 1300, size.z * 0.5),
        ((center.x + size.x * 0.65, center.y + size.y * 1.2, center.z + size.z * 0.35), 850, size.z * 0.4),
    ):
        light_data = bpy.data.lights.new("Preview Area", "AREA")
        light_data.energy = energy
        light_data.shape = "DISK"
        light_data.size = size_value
        light = bpy.data.objects.new("Preview Area", light_data)
        light.location = location
        scene.collection.objects.link(light)
        look_at(light, center)

    bpy.ops.render.render(write_still=True)
    print(f"MASSFRONT_CHARACTER_PREVIEW={output}")


if __name__ == "__main__":
    main()
