"""Render deterministic QA previews of the authored UGA Blender assets."""

from __future__ import annotations

import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "tmp" / "uga-previews"


def look_at(obj, target=(0, 0, 0)):
    direction = Vector(target) - obj.location
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def add_camera(location, lens, target):
    data = bpy.data.cameras.new("QA_Camera")
    data.lens = lens
    data.sensor_width = 36
    camera = bpy.data.objects.new("QA_Camera", data)
    bpy.context.collection.objects.link(camera)
    camera.location = location
    look_at(camera, target)
    bpy.context.scene.camera = camera


def add_area(name, location, energy, color, size, target=(0, 0, 0)):
    data = bpy.data.lights.new(name, "AREA")
    data.energy = energy
    data.color = color
    data.shape = "DISK"
    data.size = size
    light = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(light)
    light.location = location
    look_at(light, target)


def render(blend_name: str, out_name: str, camera, lens, target, lights, exposure=1.15):
    bpy.ops.wm.open_mainfile(filepath=str(ROOT / "assets" / "source" / "blender" / blend_name))
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 960
    scene.render.resolution_y = 540
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    scene.render.image_settings.color_mode = "RGBA"
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.view_settings.exposure = exposure
    scene.world.color = (0.012, 0.018, 0.028)
    add_camera(camera, lens, target)
    for args in lights:
        add_area(*args, target=target)
    OUT.mkdir(parents=True, exist_ok=True)
    scene.render.filepath = str(OUT / out_name)
    bpy.ops.render.render(write_still=True)


render(
    "nexus-vii-civilization-ship.blend",
    "nexus-vii-civilization-ship.png",
    (102, -148, 76),
    58,
    (0, 0, 2),
    [
        ("NexusVII_Key", (30, -35, 70), 52000, (0.52, 0.72, 1.0), 30),
        ("NexusVII_Rim", (-42, 30, 35), 36000, (0.12, 0.55, 1.0), 24),
        ("NexusVII_Fill", (12, 45, 18), 22000, (1.0, 0.38, 0.08), 22),
    ],
)

render(
    "uga-command-cutaway.blend",
    "uga-command-cutaway.png",
    (58, -80, 50),
    55,
    (0, 0, 4.5),
    [
        ("Deck_Key", (12, -20, 42), 42000, (0.44, 0.72, 1.0), 24),
        ("Deck_Rim", (-34, 18, 20), 31000, (0.10, 0.48, 1.0), 22),
        ("Deck_Fill", (28, 30, 16), 24000, (1.0, 0.32, 0.07), 18),
    ],
    exposure=0.55,
)
