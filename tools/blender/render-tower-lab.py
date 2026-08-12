"""Render MASSFRONT runtime tower geometry as a Blender studio validation set.

This script is invoked by tools/render-tower-lab.mjs. It deliberately consumes
the browser-exported runtime buffers rather than maintaining a second model, so
the .blend and PNGs always represent geometry that the game can actually draw.
"""
import bpy
import json
import math
import os
import sys
from mathutils import Vector


def arguments():
    argv = sys.argv
    argv = argv[argv.index("--") + 1:] if "--" in argv else []
    if len(argv) != 2:
        raise SystemExit("usage: blender --background --python render-tower-lab.py -- geometry.json output-dir")
    return os.path.abspath(argv[0]), os.path.abspath(argv[1])


GEOMETRY_PATH, OUTPUT_DIR = arguments()
os.makedirs(OUTPUT_DIR, exist_ok=True)
with open(GEOMETRY_PATH, "r", encoding="utf-8") as source:
    DATA = json.load(source)
ASSET_KIND = DATA.get("assetKind", "tower")
ENTRIES = DATA.get("towers") or DATA.get("units") or DATA.get("buildings") or []
if not ENTRIES:
    raise SystemExit("geometry payload contains no towers, units or buildings")

ATLAS_IMAGES = {}
for atlas_kind in ("albedo", "normal", "orm"):
    atlas_path = os.path.join(OUTPUT_DIR, "material-atlas-%s.png" % atlas_kind)
    if os.path.exists(atlas_path):
        image = bpy.data.images.load(atlas_path, check_existing=True)
        image.colorspace_settings.name = "sRGB" if atlas_kind == "albedo" else "Non-Color"
        ATLAS_IMAGES[atlas_kind] = image

bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
for datablocks in (bpy.data.meshes, bpy.data.curves, bpy.data.materials, bpy.data.cameras, bpy.data.lights):
    pass

scene = bpy.context.scene
# Workbench is the primary silhouette validator: it is deterministic in
# headless mode, honours each runtime material colour, and makes cavities and
# bevels legible without a texture/PBR look that the mobile renderer cannot use.
scene.render.engine = "BLENDER_WORKBENCH"
scene.display.shading.light = "STUDIO"
scene.display.shading.color_type = "MATERIAL"
scene.display.shading.show_shadows = True
scene.display.shading.show_cavity = True
scene.display.shading.cavity_type = "WORLD"
scene.display.shading.curvature_ridge_factor = 1.55
scene.display.shading.curvature_valley_factor = 1.25
scene.display.shading.background_type = "VIEWPORT"
scene.display.shading.background_color = (0.006, 0.012, 0.024)
render_resolution = int(DATA.get("renderResolution", 768))
scene.render.resolution_x = render_resolution
scene.render.resolution_y = render_resolution
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.render.film_transparent = False
scene.render.image_settings.color_mode = "RGBA"
scene.view_settings.look = "AgX - Medium High Contrast"
scene.world.color = (0.006, 0.012, 0.022)

# World strength is intentionally restrained. The two large area lights expose
# silhouette and bevel response without making the validation render prettier
# than the underlying runtime geometry deserves.
scene.world.use_nodes = True
world_nodes = scene.world.node_tree
world_nodes.nodes["Background"].inputs["Color"].default_value = (0.006, 0.012, 0.024, 1.0)
world_nodes.nodes["Background"].inputs["Strength"].default_value = 0.34


def add_area(name, location, energy, size, color):
    light_data = bpy.data.lights.new(name=name, type="AREA")
    light_data.energy = energy
    light_data.shape = "DISK"
    light_data.size = size
    light_data.color = color
    obj = bpy.data.objects.new(name, light_data)
    obj.location = location
    obj.rotation_euler = (Vector((0.0, 0.0, 10.0)) - obj.location).to_track_quat("-Z", "Y").to_euler()
    scene.collection.objects.link(obj)
    return obj


add_area("Key", (50, -46, 78), 1550, 34, (0.72, 0.86, 1.0))
add_area("Rim", (-58, 42, 52), 1250, 28, (1.0, 0.55, 0.25))
add_area("Fill", (8, -64, 38), 900, 30, (0.25, 0.55, 1.0))
sun_data = bpy.data.lights.new(name="TowerLabSun", type="SUN")
sun_data.energy = 2.8
sun_data.angle = math.radians(18)
sun = bpy.data.objects.new("TowerLabSun", sun_data)
sun.rotation_euler = (math.radians(28), math.radians(-18), math.radians(138))
scene.collection.objects.link(sun)

camera_data = bpy.data.cameras.new("TowerLabCamera")
camera_data.type = "ORTHO"
camera_data.lens = 52
camera = bpy.data.objects.new("TowerLabCamera", camera_data)
scene.collection.objects.link(camera)
scene.camera = camera

material_cache = {}


def atlas_coordinates(nodes, links, material_id):
    uv = nodes.new("ShaderNodeTexCoord")
    frequency = nodes.new("ShaderNodeVectorMath")
    frequency.operation = "MULTIPLY"
    if 16 <= material_id <= 17:
        mat_frequency = 0.34
    elif 19 <= material_id <= 24:
        mat_frequency = 0.48
    else:
        mat_frequency = 1.0
    frequency.inputs[1].default_value = (mat_frequency, mat_frequency, 1.0)
    fraction = nodes.new("ShaderNodeVectorMath")
    fraction.operation = "FRACTION"
    inset_low = nodes.new("ShaderNodeVectorMath")
    inset_low.operation = "MAXIMUM"
    inset_low.inputs[1].default_value = (0.004, 0.004, 0.0)
    inset_high = nodes.new("ShaderNodeVectorMath")
    inset_high.operation = "MINIMUM"
    inset_high.inputs[1].default_value = (0.996, 0.996, 1.0)
    scale = nodes.new("ShaderNodeVectorMath")
    scale.operation = "MULTIPLY"
    scale.inputs[1].default_value = (0.2, 0.2, 1.0)
    offset = nodes.new("ShaderNodeVectorMath")
    offset.operation = "ADD"
    cell_x = material_id % 5
    cell_y = material_id // 5
    offset.inputs[1].default_value = (cell_x / 5.0, 1.0 - (cell_y + 1) / 5.0, 0.0)
    links.new(uv.outputs["UV"], frequency.inputs[0])
    links.new(frequency.outputs["Vector"], fraction.inputs[0])
    links.new(fraction.outputs["Vector"], inset_low.inputs[0])
    links.new(inset_low.outputs["Vector"], inset_high.inputs[0])
    links.new(inset_high.outputs["Vector"], scale.inputs[0])
    links.new(scale.outputs["Vector"], offset.inputs[0])
    return offset.outputs["Vector"]


def entry_team_colour(entry):
    raw = entry.get("teamColor", (56, 158, 255))
    if len(raw) < 3:
        return (0.22, 0.62, 1.0)
    scale = 255.0 if max(raw[:3]) > 1.0 else 1.0
    return tuple(max(0.0, min(1.0, float(raw[index]) / scale)) for index in range(3))


def material_for(rgb, encoded_material, team_colour):
    material_id = abs(int(round(encoded_material))) - 1
    team_surface = encoded_material < 0
    # Match the runtime's faction wash and colour-space conversion.  The old
    # preview boosted livery by 1.35 and skipped linearisation, turning a small
    # blue accent into an overexposed cyan slab.
    tower_surface = 19 <= material_id <= 24
    wash = 1.0 if team_surface else (0.14 if tower_surface else 0.46)
    colour = [max(0.0, min(1.0, rgb[i] * ((1.0 - wash) + team_colour[i] * wash))) ** 2.2
              for i in range(3)]
    key = tuple(round(c, 4) for c in colour) + tuple(round(c, 4) for c in team_colour) + (material_id, team_surface)
    if key in material_cache:
        return material_cache[key]

    mat = bpy.data.materials.new("MF_%02d_%s_%03d" % (
        max(0, material_id), "team" if team_surface else "base", len(material_cache)))
    mat.diffuse_color = (*colour, 1.0)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    bsdf = nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*colour, 1.0)
    if material_id in (0, 1, 2, 3, 11, 16, 17, 18):
        bsdf.inputs["Metallic"].default_value = 0.64 if material_id < 4 else 0.28
        bsdf.inputs["Roughness"].default_value = 0.34 if material_id < 4 else 0.58
    elif material_id == 4:
        bsdf.inputs["Metallic"].default_value = 0.18
        bsdf.inputs["Roughness"].default_value = 0.18
    else:
        bsdf.inputs["Metallic"].default_value = 0.04
        bsdf.inputs["Roughness"].default_value = 0.72
    if material_id in (5, 22):
        bsdf.inputs["Emission Color"].default_value = (*colour, 1.0)
        bsdf.inputs["Emission Strength"].default_value = 2.8

    if len(ATLAS_IMAGES) == 3 and material_id >= 0:
        vector = atlas_coordinates(nodes, links, material_id)
        albedo = nodes.new("ShaderNodeTexImage")
        albedo.image = ATLAS_IMAGES["albedo"]
        albedo.interpolation = "Linear"
        albedo.extension = "CLIP"
        normal = nodes.new("ShaderNodeTexImage")
        normal.image = ATLAS_IMAGES["normal"]
        normal.interpolation = "Linear"
        normal.extension = "CLIP"
        orm = nodes.new("ShaderNodeTexImage")
        orm.image = ATLAS_IMAGES["orm"]
        orm.interpolation = "Linear"
        orm.extension = "CLIP"
        for texture in (albedo, normal, orm):
            links.new(vector, texture.inputs["Vector"])

        tint = nodes.new("ShaderNodeRGB")
        tint.outputs[0].default_value = (*colour, 1.0)
        albedo_scale = nodes.new("ShaderNodeVectorMath")
        albedo_scale.operation = "MULTIPLY"
        albedo_scale.inputs[1].default_value = (0.62, 0.62, 0.62)
        albedo_lift = nodes.new("ShaderNodeVectorMath")
        albedo_lift.operation = "ADD"
        albedo_lift.inputs[1].default_value = (0.42, 0.42, 0.42)
        links.new(albedo.outputs["Color"], albedo_scale.inputs[0])
        links.new(albedo_scale.outputs["Vector"], albedo_lift.inputs[0])
        tinted = nodes.new("ShaderNodeMixRGB")
        tinted.blend_type = "MULTIPLY"
        tinted.inputs[0].default_value = 1.0
        links.new(albedo_lift.outputs["Vector"], tinted.inputs[1])
        links.new(tint.outputs[0], tinted.inputs[2])
        orm_channels = nodes.new("ShaderNodeSeparateColor")
        links.new(orm.outputs["Color"], orm_channels.inputs["Color"])
        ao = nodes.new("ShaderNodeMixRGB")
        ao.blend_type = "MULTIPLY"
        # Runtime AO only attenuates ambient/wrap lighting.  A light 20% blend
        # keeps cavity definition in this offline preview without painting AO
        # directly into the full PBR base colour.
        ao.inputs[0].default_value = 0.20
        ao_lift = nodes.new("ShaderNodeMapRange")
        ao_lift.inputs["From Min"].default_value = 0.0
        ao_lift.inputs["From Max"].default_value = 1.0
        ao_lift.inputs["To Min"].default_value = 0.68
        ao_lift.inputs["To Max"].default_value = 1.0
        links.new(orm_channels.outputs["Red"], ao_lift.inputs["Value"])
        links.new(tinted.outputs[0], ao.inputs[1])
        links.new(ao_lift.outputs["Result"], ao.inputs[2])
        vertex_ao = nodes.new("ShaderNodeVertexColor")
        vertex_ao.layer_name = "mf_ao"
        vertex_ao_lift = nodes.new("ShaderNodeMapRange")
        vertex_ao_lift.inputs["From Min"].default_value = 0.0
        vertex_ao_lift.inputs["From Max"].default_value = 1.0
        vertex_ao_lift.inputs["To Min"].default_value = 0.48
        vertex_ao_lift.inputs["To Max"].default_value = 1.0
        links.new(vertex_ao.outputs["Color"], vertex_ao_lift.inputs["Value"])
        combined_ao = nodes.new("ShaderNodeMixRGB")
        combined_ao.blend_type = "MULTIPLY"
        combined_ao.inputs[0].default_value = 0.20
        links.new(ao.outputs[0], combined_ao.inputs[1])
        links.new(vertex_ao_lift.outputs["Result"], combined_ao.inputs[2])
        links.new(combined_ao.outputs[0], bsdf.inputs["Base Color"])

        normal_map = nodes.new("ShaderNodeNormalMap")
        normal_map.inputs["Strength"].default_value = 0.72
        links.new(normal.outputs["Color"], normal_map.inputs["Color"])
        links.new(normal_map.outputs["Normal"], bsdf.inputs["Normal"])
        invert_gloss = nodes.new("ShaderNodeMath")
        invert_gloss.operation = "SUBTRACT"
        invert_gloss.inputs[0].default_value = 1.0
        links.new(orm_channels.outputs["Green"], invert_gloss.inputs[1])
        links.new(invert_gloss.outputs[0], bsdf.inputs["Roughness"])
        links.new(orm.outputs["Alpha"], bsdf.inputs["Metallic"])
        if material_id in (5, 22):
            links.new(orm_channels.outputs["Blue"], bsdf.inputs["Emission Strength"])
    material_cache[key] = mat
    return mat


def part_payload(entry, part_name):
    payload = entry.get(part_name)
    if payload is None and part_name == "base":
        payload = entry.get("hull")
    return payload


def mesh_part(tower, part_name, vertical_offset):
    payload = part_payload(tower, part_name)
    if not payload:
        return None
    stride = DATA["vertexStride"]
    stream = payload["v"]
    indices = payload["i"]
    part_scale = tower.get("modelScale", 1.0)
    if part_name == "turret":
        part_scale *= tower.get("turretScale", 1.0)
    # MASSFRONT is X/Z-ground with +Y up. Blender is X/Y-ground with +Z up;
    # negating game Z preserves handedness and therefore triangle winding.
    vertices = [
        (stream[offset] * part_scale, -stream[offset + 2] * part_scale,
         stream[offset + 1] * part_scale + vertical_offset)
        for offset in range(0, len(stream), stride)
    ]
    faces = [tuple(indices[offset:offset + 3]) for offset in range(0, len(indices), 3)]
    mesh = bpy.data.meshes.new("%s_%s_mesh" % (tower["slug"], part_name))
    mesh.from_pydata(vertices, [], faces)
    mesh.update(calc_edges=True)
    uv_layer = mesh.uv_layers.new(name="UVMap")
    for loop in mesh.loops:
        offset = loop.vertex_index * stride
        # Runtime multiplies UVs by the instance's uniform scale. Mirror that
        # here so a 1.20x turret has the same texel density in Blender and game.
        uv_layer.data[loop.index].uv = (stream[offset + 9] * part_scale,
                                        stream[offset + 10] * part_scale)
    obj = bpy.data.objects.new("%s_%s" % (tower["slug"], part_name), mesh)
    scene.collection.objects.link(obj)

    slots = {}
    for polygon_index, face in enumerate(faces):
        vertex_index = face[0]
        offset = vertex_index * stride
        rgb = stream[offset + 6:offset + 9]
        encoded_material = stream[offset + 11]
        key = tuple(round(c, 4) for c in rgb) + (round(encoded_material),)
        if key not in slots:
            mat = material_for(rgb, encoded_material, entry_team_colour(tower))
            obj.data.materials.append(mat)
            slots[key] = len(obj.data.materials) - 1
        obj.data.polygons[polygon_index].material_index = slots[key]

    source_part = "hull" if part_name == "base" and "base" not in tower else part_name
    obj["massfront_part"] = source_part
    obj["massfront_mount_height"] = vertical_offset
    return obj


models = {}
for tower in ENTRIES:
    base = mesh_part(tower, "base", 0.0)
    turret = mesh_part(tower, "turret", tower.get("mountHeight", 0.0))
    models[tower["slug"]] = [obj for obj in (base, turret) if obj is not None]

# A large neutral floor gives the model a readable contact shadow. Runtime unit
# scale makes hero walkers much taller than tower assets; the former 220-unit
# plane ended inside their orthographic frustum and drew a diagonal studio edge
# through the card. 1200 covers the largest current model at the same angle.
# It is hidden from the saved asset collection by its tower_lab_helper tag.
bpy.ops.mesh.primitive_plane_add(size=1200, location=(0, 0, -0.08))
floor = bpy.context.object
floor.name = "TowerLabFloor"
floor["tower_lab_helper"] = True
floor_mat = bpy.data.materials.new("TowerLabFloorMaterial")
floor_mat.diffuse_color = (0.012, 0.022, 0.038, 1.0)
floor_mat.use_nodes = True
floor_bsdf = floor_mat.node_tree.nodes.get("Principled BSDF")
floor_bsdf.inputs["Base Color"].default_value = (0.012, 0.022, 0.038, 1.0)
floor_bsdf.inputs["Metallic"].default_value = 0.35
floor_bsdf.inputs["Roughness"].default_value = 0.62
floor.data.materials.append(floor_mat)


def world_bounds(objects):
    points = []
    for obj in objects:
        points.extend(obj.matrix_world @ Vector(corner) for corner in obj.bound_box)
    lo = Vector((min(p.x for p in points), min(p.y for p in points), min(p.z for p in points)))
    hi = Vector((max(p.x for p in points), max(p.y for p in points), max(p.z for p in points)))
    return lo, hi


def point_camera(target, distance, scale):
    direction = Vector((1.18, 0.96, 1.32)).normalized()
    camera.location = target + direction * distance
    camera.rotation_euler = (target - camera.location).to_track_quat("-Z", "Y").to_euler()
    camera.data.ortho_scale = scale


# Bake stable object-space cavity occlusion into a named vertex color. The JSON
# sidecar is intentionally separate from runtime geometry for now; it lets the
# engine adopt vertex AO without re-baking or inventing per-model AO textures.
# Eevee is used for the fast PBR previews below, but Blender 4.2 only exposes
# AO baking through Cycles.  The meshes are small, so a deliberately low sample
# count gives stable cavity data without turning this mobile-asset pass into a
# long offline render.
scene.render.engine = "CYCLES"
scene.cycles.samples = 16
scene.cycles.use_denoising = False
scene.render.bake.target = "VERTEX_COLORS"
scene.render.bake.use_clear = True
# The presentation floor is not part of the reusable model. Leaving it visible
# bakes permanent ground-contact darkness into every base, which then doubles
# with the game's real contact/SSAO shadow.
floor.hide_render = True
floor.hide_viewport = True
ao_report = {"format": "massfront-vertex-ao-v1", "models": {}}
for tower in ENTRIES:
    slug = tower["slug"]
    visible = models[slug]
    for tower_slug, objects in models.items():
        hidden = tower_slug != slug
        for obj in objects:
            obj.hide_render = hidden
            obj.hide_viewport = hidden
    ao_report["models"][slug] = {}
    for obj in visible:
        attribute = obj.data.color_attributes.get("mf_ao")
        if attribute is None:
            attribute = obj.data.color_attributes.new(name="mf_ao", type="BYTE_COLOR", domain="CORNER")
        obj.data.color_attributes.active_color = attribute
        for datum in attribute.data:
            datum.color = (1.0, 1.0, 1.0, 1.0)
        bpy.ops.object.select_all(action="DESELECT")
        obj.hide_viewport = False
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        try:
            bpy.ops.object.bake(type="AO")
        except RuntimeError as error:
            print("AO bake warning for", obj.name, error)

        totals = [[0.0, 0] for _ in obj.data.vertices]
        for loop in obj.data.loops:
            totals[loop.vertex_index][0] += attribute.data[loop.index].color[0]
            totals[loop.vertex_index][1] += 1
        values = [round(total / count, 4) if count else 1.0 for total, count in totals]
        ao_report["models"][slug][obj["massfront_part"]] = values

for objects in models.values():
    for obj in objects:
        obj.hide_render = False
        obj.hide_viewport = False
floor.hide_render = False
floor.hide_viewport = False
with open(os.path.join(OUTPUT_DIR, "baked-vertex-ao.json"), "w", encoding="utf-8") as target:
    json.dump(ao_report, target, separators=(",", ":"))

blend_name = "MASSFRONT-%s-lab.blend" % ASSET_KIND
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUTPUT_DIR, blend_name))

summary = {"format": DATA["format"], "version": DATA["version"], "renders": []}
render_engines = {"blender": "BLENDER_WORKBENCH", "pbr": "BLENDER_EEVEE_NEXT"}
render_modes = DATA.get("renderModes", ["blender", "pbr"])
for render_label in render_modes:
    if render_label not in render_engines:
        raise SystemExit("unsupported render mode: %s" % render_label)
    render_engine = render_engines[render_label]
    scene.render.engine = render_engine
    # The runtime battlefield has bright sky/terrain bounce around every tower.
    # Lift the isolated dark-floor PBR review enough to expose material zoning
    # without changing the model, texture or the game's own lighting.
    scene.view_settings.exposure = 0.0 if render_label == "blender" else 1.85
    for tower in ENTRIES:
        slug = tower["slug"]
        visible = models[slug]
        for tower_slug, objects in models.items():
            hidden = tower_slug != slug
            for obj in objects:
                obj.hide_render = hidden
                obj.hide_viewport = hidden

        bpy.context.view_layer.update()
        low, high = world_bounds(visible)
        centre = (low + high) * 0.5
        target = Vector((centre.x, centre.y, low.z + (high.z - low.z) * 0.42))
        width, depth, height = high.x - low.x, high.y - low.y, high.z - low.z
        scale = max(width * 1.18, depth * 1.42, height * 1.38, 36.0)
        point_camera(target, scale * 2.15, scale)

        output = os.path.join(OUTPUT_DIR, "%s-%s.png" % (slug, render_label))
        scene.render.filepath = output
        bpy.ops.render.render(write_still=True)
        summary["renders"].append({
            "name": tower["name"], "slug": slug, "mode": render_label,
            "key": tower.get("key", slug),
            "family": tower.get("family", slug),
            "familyName": tower.get("familyName", tower["name"]),
            "faction": tower.get("faction", ""),
            "tier": tower.get("tier", 1),
            "file": os.path.basename(output),
            "bounds": {"width": width, "height": height, "depth": depth},
            "triangles": (part_payload(tower, "base")["count"] +
                          (tower["turret"]["count"] if tower.get("turret") else 0)) // 3
        })
        print("rendered", output)

with open(os.path.join(OUTPUT_DIR, "report.json"), "w", encoding="utf-8") as target:
    json.dump(summary, target, indent=2)
print("saved", os.path.join(OUTPUT_DIR, blend_name))
