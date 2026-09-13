"""Render a deterministic 3x3 QA plate of the authored showcase contacts."""

from __future__ import annotations

import math
from pathlib import Path

import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[2]
BLEND_PATH = ROOT / "assets" / "source" / "blender" / "massfront-showcase-contacts.blend"
OUT_PATH = ROOT / "tmp" / "contact-previews" / "massfront-showcase-contacts.png"
LOD_PATHS = {
    0: OUT_PATH,
    1: OUT_PATH.with_name("massfront-showcase-contacts-lod1.png"),
    2: OUT_PATH.with_name("massfront-showcase-contacts-lod2.png"),
}

CONTACTS = (
    ("aelos_embassy_spindle", -102, 78, False, .88),
    ("aelos_logistics_array", 0, 78, False, .86),
    ("aelos_veyra_gate", 102, 78, True, .88),
    ("veyra_archive_hulk", -102, 0, False, .88),
    ("veyra_aelos_gate", 0, 0, True, .88),
    ("veyra_karak_gate", 102, 0, True, .88),
    ("karak_colony_spine", -102, -78, False, .84),
    ("karak_lifeboat_field", 0, -78, False, .90),
    ("karak_veyra_gate", 102, -78, True, .88),
)

QA_ANGLES = {
    "aelos_embassy_spindle": (15, -10, 5),
    "aelos_logistics_array": (8, 4, -2),
    "veyra_archive_hulk": (12, -7, 2),
    "karak_colony_spine": (18, 9, -4),
    "karak_lifeboat_field": (9, -11, 3),
}


def look_at(obj, target):
    direction = Vector(target) - obj.location
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


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


def add_sun(name, location, energy, color, angle, target=(0, 0, 0)):
    """Add a distance-independent studio key so every grid cell reads equally."""
    data = bpy.data.lights.new(name, "SUN")
    data.energy = energy
    data.color = color
    data.angle = angle
    light = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(light)
    light.location = location
    look_at(light, target)


def add_label(body, location, color):
    curve = bpy.data.curves.new(f"QA_Label_{body}", "FONT")
    curve.body = body
    curve.align_x = "CENTER"
    curve.align_y = "CENTER"
    curve.size = 2.35
    curve.extrude = .025
    obj = bpy.data.objects.new(f"QA_Label_{body}", curve)
    bpy.context.collection.objects.link(obj)
    obj.location = location
    obj.rotation_euler[0] = math.radians(90)
    material = bpy.data.materials.get(f"QA_LabelMaterial_{color}")
    if material is None:
        material = bpy.data.materials.new(f"QA_LabelMaterial_{color}")
        material.diffuse_color = color
        material.use_nodes = True
        bsdf = material.node_tree.nodes.get("Principled BSDF")
        bsdf.inputs["Base Color"].default_value = color
        bsdf.inputs["Emission Color"].default_value = color
        bsdf.inputs["Emission Strength"].default_value = .55
        bsdf.inputs["Roughness"].default_value = .48
    obj.data.materials.append(material)


bpy.ops.wm.open_mainfile(filepath=str(BLEND_PATH))
scene = bpy.context.scene
# The GLB carries all three authored tiers. The plate is a fidelity review, so
# render only LOD0 instead of stacking coincident reduced meshes over it.
for obj in bpy.data.objects:
    if obj.name.startswith(("LOD1_", "LOD2_")):
        obj.hide_render = True
scene.render.engine = "BLENDER_EEVEE"
scene.render.resolution_x = 1920
scene.render.resolution_y = 1280
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_mode = "RGBA"
scene.render.film_transparent = False
scene.view_settings.look = "AgX - Medium High Contrast"
scene.view_settings.exposure = 1.2
scene.world.use_nodes = True
background = scene.world.node_tree.nodes.get("Background")
background.inputs["Color"].default_value = (.004, .008, .016, 1)
background.inputs["Strength"].default_value = .12

pack = bpy.data.objects["MASSFRONT_SHOWCASE_CONTACT_PACK"]
for contact_id, x, z, face_gate, scale in CONTACTS:
    root = bpy.data.objects[contact_id]
    root.location = (x, 0, z)
    root.scale = (scale, scale, scale)
    if face_gate:
        root.rotation_euler[0] = math.radians(90)
    elif contact_id in QA_ANGLES:
        root.rotation_euler = tuple(math.radians(angle) for angle in QA_ANGLES[contact_id])
    tint = (.13, .75, 1.0, 1) if contact_id.startswith("aelos") else ((.68, .34, 1.0, 1) if contact_id.startswith("veyra") else (1.0, .16, .12, 1))
    add_label(contact_id.upper(), (x, -4.0, z - 31), tint)

camera_data = bpy.data.cameras.new("QA_ContactPack_Camera")
camera_data.lens = 58
camera_data.sensor_width = 36
camera = bpy.data.objects.new("QA_ContactPack_Camera", camera_data)
bpy.context.collection.objects.link(camera)
camera.location = (0, -620, 10)
look_at(camera, (0, 0, 0))
scene.camera = camera

add_sun("QA_ContactPack_StudioKey", (-180, -260, 240), 2.2, (.62, .78, 1.0), math.radians(8))
add_sun("QA_ContactPack_WarmFill", (260, -160, 60), .72, (1.0, .40, .14), math.radians(14))
add_area("QA_ContactPack_FrontSoftbox", (0, -260, 15), 180000, (.32, .56, 1.0), 240)
add_area("QA_ContactPack_Rim", (35, 110, 130), 125000, (.06, .32, 1.0), 110)

OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
for active_lod, output_path in LOD_PATHS.items():
    for obj in bpy.data.objects:
        for lod_level in range(3):
            if obj.name.startswith(f"LOD{lod_level}_"):
                obj.hide_render = lod_level != active_lod
                break
    scene.render.filepath = str(output_path)
    bpy.ops.render.render(write_still=True)
    print(f"Rendered LOD{active_lod} showcase contact preview to {output_path}")
