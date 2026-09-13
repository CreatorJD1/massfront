"""Author the UGA civilization ship exterior and command cutaway as textured GLB assets.

Visible geometry is created from authored profiles, lofts and footprints.  No
Blender mesh primitives are used.  The resulting node names and extras are a
runtime contract: DISTRICT_* roots are selectable and FOCUS_* empties define
camera destinations.
"""

from __future__ import annotations

import math
import os
import sys
from pathlib import Path

import bpy
import numpy as np
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[2]
MODEL_DIR = Path(os.environ.get("MF_UGA_MODEL_DIR", ROOT / "assets" / "models"))
SOURCE_DIR = Path(os.environ.get("MF_UGA_SOURCE_DIR", ROOT / "assets" / "source" / "blender"))
TEXTURE_DIR = Path(os.environ.get("MF_UGA_TEXTURE_DIR", ROOT / "assets" / "textures" / "uga"))


def reset_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for datablocks in (bpy.data.meshes, bpy.data.curves, bpy.data.materials, bpy.data.cameras, bpy.data.lights):
        for block in list(datablocks):
            if block.users == 0:
                datablocks.remove(block)


def set_input(node, name: str, value) -> None:
    socket = node.inputs.get(name)
    if socket is not None:
        socket.default_value = value


def load_image(name: str):
    path = TEXTURE_DIR / name
    return bpy.data.images.load(str(path), check_existing=True)


def packed_normal_height_image(stem: str):
    """Keep the glTF normal standard while carrying authored height in alpha.

    glTF has no core displacement texture. Packing height beside the tangent
    normal lets Blender use the same sampled texel for its subtle bump chain,
    preserves the normal RGB expected by every glTF viewer, and retains the
    height channel in the exported GLB for the runtime's future parallax pass.
    """
    name = f"{stem}-normal-height"
    cached = bpy.data.images.get(name)
    if cached:
        return cached
    normal = load_image(f"{stem}-normal.png")
    height = load_image(f"{stem}-height.png")
    width, height_px = normal.size
    if tuple(height.size) != (width, height_px):
        raise ValueError(f"Normal/height size mismatch for {stem}")
    normal_pixels = np.empty(width * height_px * 4, dtype=np.float32)
    height_pixels = np.empty(width * height_px * 4, dtype=np.float32)
    normal.pixels.foreach_get(normal_pixels)
    height.pixels.foreach_get(height_pixels)
    packed_pixels = normal_pixels.reshape((-1, 4)).copy()
    packed_pixels[:, 3] = height_pixels.reshape((-1, 4))[:, 0]
    packed = bpy.data.images.new(name, width=width, height=height_px, alpha=True)
    packed.file_format = "PNG"
    packed.alpha_mode = "CHANNEL_PACKED"
    packed.colorspace_settings.name = "Non-Color"
    packed.pixels.foreach_set(packed_pixels.ravel())
    packed.update()
    packed.pack()
    packed["height_source"] = f"{stem}-height.png"
    packed["normal_source"] = f"{stem}-normal.png"
    return packed


def gltf_material_output_group():
    """Create the exporter-recognized occlusion socket once per Blender file."""
    group = bpy.data.node_groups.get("glTF Material Output")
    if group:
        return group
    group = bpy.data.node_groups.new("glTF Material Output", "ShaderNodeTree")
    group.interface.new_socket("Occlusion", socket_type="NodeSocketFloat")
    group.nodes.new("NodeGroupOutput")
    input_node = group.nodes.new("NodeGroupInput")
    input_node.location = (-180, 0)
    return group


def pbr_material(name: str, stem: str, uv_scale: float, tint=(1, 1, 1, 1), emission_strength=1.15):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()
    out = nodes.new("ShaderNodeOutputMaterial")
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    set_input(bsdf, "Base Color", tint)
    set_input(bsdf, "Metallic", 0.82)
    set_input(bsdf, "Roughness", 0.44)
    set_input(bsdf, "Emission Strength", emission_strength)
    links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])

    texcoord = nodes.new("ShaderNodeTexCoord")
    mapping = nodes.new("ShaderNodeMapping")
    mapping.inputs["Scale"].default_value = (uv_scale, uv_scale, uv_scale)
    links.new(texcoord.outputs["UV"], mapping.inputs["Vector"])

    def image_node(filename: str, non_color=False, image=None):
        tex = nodes.new("ShaderNodeTexImage")
        tex.image = image or load_image(filename)
        tex.name = filename
        tex.label = filename
        tex.extension = "REPEAT"
        if non_color:
            tex.image.colorspace_settings.name = "Non-Color"
        links.new(mapping.outputs["Vector"], tex.inputs["Vector"])
        return tex

    base = image_node(f"{stem}-basecolor.png")
    normal_tex = image_node(
        f"{stem}-normal-height.png",
        True,
        packed_normal_height_image(stem),
    )
    ao = image_node(f"{stem}-ao.png", True)
    rough = image_node(f"{stem}-roughness.png", True)
    metal = image_node(f"{stem}-metallic.png", True)
    emit = image_node(f"{stem}-emissive.png")

    # AO darkens only creases in the Blender preview while the dedicated glTF
    # output below exports the same map as standards-compliant occlusion.
    ao_mix = nodes.new("ShaderNodeMixRGB")
    ao_mix.name = "Authored AO over Base Color"
    ao_mix.blend_type = "MULTIPLY"
    ao_mix.inputs[0].default_value = 0.38
    links.new(base.outputs["Color"], ao_mix.inputs[1])
    links.new(ao.outputs["Color"], ao_mix.inputs[2])
    links.new(ao_mix.outputs["Color"], bsdf.inputs["Base Color"])

    gltf_output = nodes.new("ShaderNodeGroup")
    gltf_output.name = "glTF Material Output"
    gltf_output.label = "glTF AO export"
    gltf_output.node_tree = gltf_material_output_group()
    links.new(ao.outputs["Color"], gltf_output.inputs["Occlusion"])

    normal = nodes.new("ShaderNodeNormalMap")
    normal.inputs["Strength"].default_value = 0.72
    bump = nodes.new("ShaderNodeBump")
    bump.name = "Authored Height Micro-Bump"
    bump.inputs["Strength"].default_value = 0.16
    bump.inputs["Distance"].default_value = 0.035
    links.new(normal_tex.outputs["Color"], normal.inputs["Color"])
    links.new(normal_tex.outputs["Alpha"], bump.inputs["Height"])
    links.new(normal.outputs["Normal"], bump.inputs["Normal"])
    links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    links.new(rough.outputs["Color"], bsdf.inputs["Roughness"])
    links.new(metal.outputs["Color"], bsdf.inputs["Metallic"])
    emission_socket = bsdf.inputs.get("Emission Color") or bsdf.inputs.get("Emission")
    if emission_socket:
        links.new(emit.outputs["Color"], emission_socket)
    mat["ao_map"] = f"{stem}-ao.png"
    mat["height_map"] = f"{stem}-height.png"
    mat["height_channel"] = "normalTexture alpha"
    mat["height_strength"] = 0.16
    # Three r128 ignores KHR_materials_emissive_strength.  Preserve the value
    # as an ordinary glTF extra as well so the runtime compatibility adapter
    # can restore the authored intensity without baking it into the albedo.
    mat["runtime_emissive_strength"] = emission_strength
    return mat


def simple_material(name: str, color, metallic=0.0, roughness=0.45, emission=None, strength=0.0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    set_input(bsdf, "Base Color", color)
    set_input(bsdf, "Metallic", metallic)
    set_input(bsdf, "Roughness", roughness)
    if emission:
        set_input(bsdf, "Emission Color", emission)
        set_input(bsdf, "Emission", emission)
        set_input(bsdf, "Emission Strength", strength)
    return mat


def translucent_emissive_material(name: str, color, emission, strength: float):
    """Build a glTF-compatible transparent emissive used only for drive plasma.

    The authored exhaust has nested meshes rather than a flat billboard, so it
    remains dimensional from the orbit camera and the close inspection view.
    """
    mat = simple_material(name, color, .08, .12, emission, strength)
    mat.diffuse_color = color
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        set_input(bsdf, "Alpha", color[3])
    if hasattr(mat, "surface_render_method"):
        mat.surface_render_method = "DITHERED"
    elif hasattr(mat, "blend_method"):
        mat.blend_method = "BLEND"
    mat.use_transparency_overlap = False
    return mat


def translucent_pbr_material(name: str, stem: str, uv_scale: float, alpha: float, emission_strength: float):
    """Create authored pressure glazing without adding proxy glow geometry."""
    mat = pbr_material(name, stem, uv_scale, emission_strength=emission_strength)
    mat.diffuse_color = (1.0, 1.0, 1.0, alpha)
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        set_input(bsdf, "Alpha", alpha)
        set_input(bsdf, "Transmission Weight", .18)
        set_input(bsdf, "Transmission", .18)
    if hasattr(mat, "surface_render_method"):
        mat.surface_render_method = "DITHERED"
    elif hasattr(mat, "blend_method"):
        mat.blend_method = "BLEND"
    mat.use_transparency_overlap = False
    mat["runtime_alpha"] = alpha
    return mat


def finalize_mesh(obj, bevel=0.08, smooth=True, uv=True):
    if smooth:
        for poly in obj.data.polygons:
            poly.use_smooth = True
    if bevel > 0:
        mod = obj.modifiers.new("Authored edge finishing", "BEVEL")
        mod.width = bevel
        # The three concept-approved command-deck sections are designed for a
        # phone-first cutaway. One authored chamfer is enough at that scale and
        # avoids turning connector frames and consoles into high-density hero
        # meshes during glTF modifier application.
        mod.segments = 1 if obj.name.startswith(("Command_", "command_", "navigation_", "mission_ops_")) else 3
        mod.limit_method = "ANGLE"
    if uv:
        bpy.context.view_layer.objects.active = obj
        obj.select_set(True)
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.select_all(action="SELECT")
        bpy.ops.uv.smart_project(angle_limit=math.radians(58), island_margin=0.012)
        bpy.ops.object.mode_set(mode="OBJECT")
        obj.select_set(False)
    return obj


def mesh_object(name: str, vertices, faces, material=None, parent=None, bevel=0.08, smooth=True):
    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update(calc_edges=True)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    if material:
        obj.data.materials.append(material)
    if parent:
        obj.parent = parent
    return finalize_mesh(obj, bevel=bevel, smooth=smooth)


def reproject_material_meshes_metric(root, materials, cube_size=2.0):
    """Give interior sheets stable real-world texel density on every mesh.

    Smart Project normalizes islands independently, stretching one tile across
    a large deck and compressing the same tile onto a console. Metric cube
    projection keeps square details square and lets large surfaces repeat.
    """
    material_names = {material.name for material in materials}
    bpy.ops.object.select_all(action="DESELECT")
    for obj in root.children_recursive:
        if obj.type != "MESH" or not any(
            slot.material and slot.material.name in material_names
            for slot in obj.material_slots
        ):
            continue
        bpy.context.view_layer.objects.active = obj
        obj.select_set(True)
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.select_all(action="SELECT")
        bpy.ops.uv.cube_project(
            cube_size=cube_size,
            correct_aspect=True,
            clip_to_bounds=False,
            scale_to_bounds=False,
        )
        bpy.ops.object.mode_set(mode="OBJECT")
        obj.select_set(False)


def atomic_save_blend(path: Path):
    """Save the editable authoring source without exposing a half-written file."""
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f"{path.stem}.next{path.suffix}")
    temporary.unlink(missing_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(temporary))
    if not temporary.exists() or temporary.stat().st_size < 4096:
        raise RuntimeError(f"Atomic Blender save failed for {path}")
    os.replace(temporary, path)


def atomic_export_glb(path: Path, export_yup: bool):
    """Export to a sibling staging file and replace the runtime GLB atomically."""
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f"{path.stem}.next{path.suffix}")
    temporary.unlink(missing_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=str(temporary),
        export_format="GLB",
        export_apply=True,
        export_extras=True,
        export_yup=export_yup,
        export_cameras=False,
        export_lights=False,
    )
    if not temporary.exists() or temporary.stat().st_size < 4096:
        raise RuntimeError(f"Atomic GLB export failed for {path}")
    with temporary.open("rb") as handle:
        if handle.read(4) != b"glTF":
            raise RuntimeError(f"Invalid staged GLB header for {path}")
    os.replace(temporary, path)


def superellipse(theta: float, width: float, height: float, power: float = 3.6):
    c, s = math.cos(theta), math.sin(theta)
    x = width * math.copysign(abs(c) ** (2.0 / power), c)
    y = height * math.copysign(abs(s) ** (2.0 / power), s)
    return x, y


def loft(name: str, sections, sides: int, material, parent=None, bevel=0.04, twist=0.0):
    vertices = []
    for si, (z, width, height) in enumerate(sections):
        phase = twist * si / max(1, len(sections) - 1)
        for j in range(sides):
            x, y = superellipse(2 * math.pi * j / sides + phase, width, height)
            vertices.append((x, y, z))
    faces = []
    for si in range(len(sections) - 1):
        for j in range(sides):
            a = si * sides + j
            b = si * sides + (j + 1) % sides
            c = (si + 1) * sides + (j + 1) % sides
            d = (si + 1) * sides + j
            faces.append((a, b, c, d))
    faces.append(tuple(reversed(range(sides))))
    last = (len(sections) - 1) * sides
    faces.append(tuple(last + j for j in range(sides)))
    return mesh_object(name, vertices, faces, material, parent, bevel, True)


def prism(name: str, points, z0: float, z1: float, material, parent=None, bevel=0.06, top_scale=1.0):
    n = len(points)
    cx = sum(p[0] for p in points) / n
    cy = sum(p[1] for p in points) / n
    bottom = [(x, y, z0) for x, y in points]
    top = [(cx + (x - cx) * top_scale, cy + (y - cy) * top_scale, z1) for x, y in points]
    vertices = bottom + top
    faces = [tuple(reversed(range(n))), tuple(n + i for i in range(n))]
    for i in range(n):
        faces.append((i, (i + 1) % n, n + (i + 1) % n, n + i))
    return mesh_object(name, vertices, faces, material, parent, bevel, False)


def compound_prisms(name: str, sections, material, parent=None, bevel=0):
    """Combine authored housings, rails or indicators into one draw-ready mesh."""
    vertices = []
    faces = []
    for points, z0, z1, top_scale in sections:
        n = len(points)
        offset = len(vertices)
        cx = sum(point[0] for point in points) / n
        cy = sum(point[1] for point in points) / n
        vertices.extend((x, y, z0) for x, y in points)
        vertices.extend((cx + (x - cx) * top_scale, cy + (y - cy) * top_scale, z1) for x, y in points)
        faces.append(tuple(offset + index for index in reversed(range(n))))
        faces.append(tuple(offset + n + index for index in range(n)))
        for index in range(n):
            nxt = (index + 1) % n
            faces.append((offset + index, offset + nxt, offset + n + nxt, offset + n + index))
    return mesh_object(name, vertices, faces, material, parent, bevel, False)


def compound_walkway_network(name: str, sections, ramps, material, parent=None, bevel=.02):
    """Batch level transit plates and sloped access ramps into one mesh.

    Each level section is ``(points, z0, z1, top_scale)``.  Each ramp is
    ``(x0, x1, y0, y1, start_z, end_z, thickness)`` and slopes along Y.
    """
    vertices = []
    faces = []

    def append_prism(points, z0, z1, top_scale=1.0):
        count = len(points)
        offset = len(vertices)
        cx = sum(point[0] for point in points) / count
        cy = sum(point[1] for point in points) / count
        vertices.extend((x, y, z0) for x, y in points)
        vertices.extend((cx + (x - cx) * top_scale, cy + (y - cy) * top_scale, z1) for x, y in points)
        faces.append(tuple(offset + index for index in reversed(range(count))))
        faces.append(tuple(offset + count + index for index in range(count)))
        for index in range(count):
            nxt = (index + 1) % count
            faces.append((offset + index, offset + nxt, offset + count + nxt, offset + count + index))

    for points, z0, z1, top_scale in sections:
        append_prism(points, z0, z1, top_scale)

    for x0, x1, y0, y1, start_z, end_z, thickness in ramps:
        offset = len(vertices)
        vertices.extend((
            (x0, y0, start_z - thickness), (x1, y0, start_z - thickness),
            (x1, y1, end_z - thickness), (x0, y1, end_z - thickness),
            (x0, y0, start_z), (x1, y0, start_z),
            (x1, y1, end_z), (x0, y1, end_z),
        ))
        faces.extend((
            (offset + 3, offset + 2, offset + 1, offset),
            (offset + 4, offset + 5, offset + 6, offset + 7),
            (offset, offset + 1, offset + 5, offset + 4),
            (offset + 1, offset + 2, offset + 6, offset + 5),
            (offset + 2, offset + 3, offset + 7, offset + 6),
            (offset + 3, offset, offset + 4, offset + 7),
        ))
    return mesh_object(name, vertices, faces, material, parent, bevel, False)


def lathe(name: str, profile, segments: int, material, parent=None, bevel=0.02):
    vertices = []
    for z, radius in profile:
        for i in range(segments):
            a = 2 * math.pi * i / segments
            vertices.append((math.cos(a) * radius, math.sin(a) * radius, z))
    faces = []
    for p in range(len(profile) - 1):
        for i in range(segments):
            a = p * segments + i
            b = p * segments + (i + 1) % segments
            c = (p + 1) * segments + (i + 1) % segments
            d = (p + 1) * segments + i
            faces.append((a, b, c, d))
    return mesh_object(name, vertices, faces, material, parent, bevel, True)


def annular_sector(name, inner, outer, start, end, height, material, parent=None, segments=18):
    points = []
    for i in range(segments + 1):
        a = start + (end - start) * i / segments
        points.append((math.cos(a) * outer, math.sin(a) * outer))
    for i in range(segments, -1, -1):
        a = start + (end - start) * i / segments
        points.append((math.cos(a) * inner, math.sin(a) * inner))
    return prism(name, points, 0, height, material, parent, 0.045, 0.995)


def segmented_annulus(name, inner, outer, z0, z1, count, duty, material, parent=None, steps=3):
    """Author a single mesh of separated light-guide arcs instead of a bright ring."""
    vertices = []
    faces = []
    span = math.tau / count * duty
    for segment in range(count):
        center = math.tau * segment / count
        start = center - span / 2
        offset = len(vertices)
        for step in range(steps + 1):
            angle = start + span * step / steps
            c, s = math.cos(angle), math.sin(angle)
            vertices.extend(
                (
                    (c * inner, s * inner, z0),
                    (c * outer, s * outer, z0),
                    (c * inner, s * inner, z1),
                    (c * outer, s * outer, z1),
                )
            )
        for step in range(steps):
            a = offset + step * 4
            b = a + 4
            faces.extend(
                (
                    (a, b, b + 1, a + 1),
                    (a + 2, a + 3, b + 3, b + 2),
                    (a + 1, b + 1, b + 3, a + 3),
                    (a, a + 2, b + 2, b),
                )
            )
        end = offset + steps * 4
        faces.extend(((offset, offset + 1, offset + 3, offset + 2), (end, end + 2, end + 3, end + 1)))
    return mesh_object(name, vertices, faces, material, parent, 0, False)


def footprint(cx, cy, w, d, chamfer=0.18):
    c = min(chamfer, w * 0.3, d * 0.3)
    return [
        (cx - w / 2 + c, cy - d / 2), (cx + w / 2 - c, cy - d / 2),
        (cx + w / 2, cy - d / 2 + c), (cx + w / 2, cy + d / 2 - c),
        (cx + w / 2 - c, cy + d / 2), (cx - w / 2 + c, cy + d / 2),
        (cx - w / 2, cy + d / 2 - c), (cx - w / 2, cy - d / 2 + c),
    ]


def add_empty(name, location, parent=None, extras=None):
    obj = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(obj)
    obj.empty_display_type = "SPHERE"
    obj.empty_display_size = 0.35
    obj.location = location
    if parent:
        obj.parent = parent
    for key, value in (extras or {}).items():
        obj[key] = value
    return obj


def radial_local(angle, radial, tangential=0.0):
    return (
        math.cos(angle) * radial - math.sin(angle) * tangential,
        math.sin(angle) * radial + math.cos(angle) * tangential,
    )


def parent_keep_world(obj, parent):
    """Attach tier details to their crown without changing authored placement."""
    bpy.context.view_layer.update()
    transform = obj.matrix_world.copy()
    obj.parent = parent
    obj.matrix_world = transform


def rotate_mesh_about_xy(obj, angle, center_x, center_y):
    """Bake plan rotation around a footprint center without orbiting the mesh.

    Prism vertices are authored in deck/world coordinates, so assigning an
    object rotation would rotate their center around the command core a second
    time. Baking the turn into the mesh retains the district position while
    still aligning its armor, trenches, and machinery with the radial wedge.
    """
    c, s = math.cos(angle), math.sin(angle)
    for vertex in obj.data.vertices:
        dx = vertex.co.x - center_x
        dy = vertex.co.y - center_y
        vertex.co.x = center_x + dx * c - dy * s
        vertex.co.y = center_y + dx * s + dy * c
    obj.data.update()
    return obj


def recessed_status_assembly(prefix, x, y, width, depth, z, rotation, housing_material, frame_material, indicator_material, parent, tier_parent, district_id):
    """Build a dark machinery cassette with restrained segmented indicators."""
    housing_w = max(.58, width * .40)
    housing_d = max(.36, depth * .32)
    housing = prism(
        f"{prefix}_StatusHousing",
        footprint(x, y, housing_w, housing_d, min(housing_w, housing_d) * .16),
        z,
        z + .20,
        housing_material,
        parent,
        0,
        .84,
    )
    rotate_mesh_about_xy(housing, rotation, x, y)

    frame_sections = [
        (footprint(x, y, housing_w * .76, housing_d * .58, housing_d * .10), z + .16, z + .205, .94),
        (footprint(x - housing_w * .38, y, housing_w * .065, housing_d * .78, .018), z + .20, z + .30, .86),
        (footprint(x + housing_w * .38, y, housing_w * .065, housing_d * .78, .018), z + .20, z + .30, .86),
        (footprint(x, y - housing_d * .37, housing_w * .70, housing_d * .065, .018), z + .20, z + .30, .86),
        (footprint(x, y + housing_d * .37, housing_w * .70, housing_d * .065, .018), z + .20, z + .30, .86),
    ]
    for fx in (-.34, .34):
        for fy in (-.33, .33):
            frame_sections.append(
                (
                    footprint(x + housing_w * fx, y + housing_d * fy, max(.045, housing_w * .055), max(.04, housing_d * .09), .012),
                    z + .295,
                    z + .35,
                    .72,
                )
            )
    frame = compound_prisms(f"{prefix}_StatusFrameAndFasteners", frame_sections, frame_material, parent, 0)
    rotate_mesh_about_xy(frame, rotation, x, y)

    trench_sections = []
    for offset in (-.17, .17):
        trench_sections.append(
            (
                footprint(x + housing_w * offset, y + housing_d * .04, housing_w * .075, housing_d * .48, .014),
                z + .205,
                z + .245,
                .88,
            )
        )
    trenches = compound_prisms(f"{prefix}_StatusServiceTrenches", trench_sections, housing_material, parent, 0)
    rotate_mesh_about_xy(trenches, rotation, x, y)

    indicator_sections = []
    for offset in (-.255, -.085, .085, .255):
        indicator_sections.append(
            (
                footprint(x + housing_w * offset, y - housing_d * .17, housing_w * .105, max(.026, housing_d * .065), .012),
                z + .302,
                z + .342,
                .78,
            )
        )
    indicators = compound_prisms(f"{prefix}_StatusIndicatorBank", indicator_sections, indicator_material, parent, 0)
    rotate_mesh_about_xy(indicators, rotation, x, y)

    for obj in (housing, frame, trenches, indicators):
        obj["district_id"] = district_id
        obj["activity"] = "systems_readout"
        obj["pick_role"] = "building_detail"
        parent_keep_world(obj, tier_parent)
    return housing, frame, trenches, indicators


def district_activity_vehicle(name, angle, radial, tangent, body_material, indicator_material, parent, tier_parent, district_id, long_body=False):
    x, y = radial_local(angle, radial, tangent)
    width = .92 if long_body else .68
    depth = .34 if long_body else .42
    body = prism(
        f"{name}_Body",
        footprint(x, y, width, depth, .12),
        .50,
        .76 if long_body else .88,
        body_material,
        parent,
        0,
        .70,
    )
    rotate_mesh_about_xy(body, angle - math.pi / 2, x, y)
    marker = compound_prisms(
        f"{name}_Indicator",
        [
            (footprint(x - width * .18, y, width * .12, depth * .07, .012), .77 if long_body else .89, .82 if long_body else .94, .72),
            (footprint(x + width * .18, y, width * .12, depth * .07, .012), .77 if long_body else .89, .82 if long_body else .94, .72),
        ],
        indicator_material,
        parent,
        0,
    )
    rotate_mesh_about_xy(marker, angle - math.pi / 2, x, y)
    for obj in (body, marker):
        obj["district_id"] = district_id
        obj["activity"] = "service_traffic"
        parent_keep_world(obj, tier_parent)


def district_activity_crew(name, angle, radial, tangent, material, parent, tier_parent, district_id):
    x, y = radial_local(angle, radial, tangent)
    crew = loft(
        name,
        [(.48, .055, .07), (.64, .10, .075), (1.05, .13, .09), (1.24, .075, .075), (1.36, .105, .10), (1.50, .025, .025)],
        10,
        material,
        parent,
        0,
        .08,
    )
    crew.location = (x, y, 0)
    crew.rotation_euler[2] = angle
    crew["district_id"] = district_id
    crew["activity"] = "service_traffic"
    parent_keep_world(crew, tier_parent)


def build_district_activity(district_id, angle, parent, tier_parent, body_material, crew_material, indicator_material):
    layouts = {
        "survey": ([(7.7, .35, False)], [(8.5, -.65), (9.0, .82)]),
        "research": ([(7.8, -.45, True)], [(8.6, .55), (9.2, -.85)]),
        "habitat": ([(7.6, .65, True)], [(8.4, -.78), (9.0, .10), (9.4, .92)]),
        "hangar": ([(7.8, -1.10, False), (8.2, 1.08, False)], [(9.0, -.55), (9.4, .48)]),
        "logistics": ([(7.7, -1.05, True), (8.2, 1.05, True)], [(9.1, .12)]),
    }
    if district_id not in layouts:
        return
    vehicles, crew = layouts[district_id]
    for index, (radial, tangent, long_body) in enumerate(vehicles):
        district_activity_vehicle(
            f"{district_id}_ActivityRig_{index + 1}",
            angle,
            radial,
            tangent,
            body_material,
            indicator_material,
            parent,
            tier_parent,
            district_id,
            long_body,
        )
    for index, (radial, tangent) in enumerate(crew):
        district_activity_crew(
            f"{district_id}_ActivityCrew_{index + 1}",
            angle,
            radial,
            tangent,
            crew_material,
            parent,
            tier_parent,
            district_id,
        )


def build_district(root, spec, angle, deck, infrastructure, glass, emissive, accent):
    district_id, label, activity = spec
    root["district_id"] = district_id
    root["label"] = label
    root["activity"] = activity
    root["selectable"] = True
    # Highlight intensity is mutated per district at runtime. Separate
    # authored instances prevent a selected district from lighting its peers.
    district_systems = emissive.copy()
    district_systems.name = f"{district_id.title()} Systems Indicators"
    district_accent = accent.copy()
    district_accent.name = f"{district_id.title()} Status Indicators"
    # Aim at an authored tier-one landmark, not the geometric middle of the
    # wedge. The latter often fell into a service-lane void and let the camera
    # sightline continue into the opposite district. The wider standoff keeps
    # foreground skyline pieces from cropping the selected building on phones.
    focus_profiles = {
        "survey": (15.0, 0.0, 2.45),
        "research": (10.0, -1.3, 1.35),
        "fabricator": (10.2, 0.0, 1.15),
        "engineering": (14.4, -1.45, 1.85),
        "habitat": (9.8, 0.0, 1.45),
        "factions": (10.0, 0.0, 2.00),
        "hangar": (10.7, 0.0, 1.05),
        "logistics": (9.8, -1.5, 1.15),
    }
    focus_radial, focus_tangent, focus_height = focus_profiles[district_id]
    center = radial_local(angle, focus_radial, focus_tangent)
    add_empty(
        f"FOCUS_{district_id}",
        (center[0], center[1], focus_height),
        root,
        {"district_id": district_id, "camera_distance": 11.8, "camera_height": 6.8},
    )
    annular_sector(
        f"{district_id}_Deck",
        6.6,
        17.2,
        angle - 0.34,
        angle + 0.34,
        0.46,
        deck,
        root,
        20,
    )

    # Recessed service lanes keep the broad deck authored and readable without
    # spending the phone budget on dense tessellation across the entire wedge.
    for lane, tangent in enumerate((-2.65, 2.65)):
        lane_points = [
            radial_local(angle, 7.0, tangent - .16),
            radial_local(angle, 16.7, tangent - .24),
            radial_local(angle, 16.7, tangent + .24),
            radial_local(angle, 7.0, tangent + .16),
        ]
        trench = prism(
            f"{district_id}_ServiceTrench_{lane + 1}",
            lane_points,
            .47,
            .59,
            infrastructure,
            root,
            .025,
            .985,
        )
        trench["district_id"] = district_id
        trench["activity"] = "maintenance_lane"

    # Small machinery groups and status lamps make the cutaway lived-in while
    # keeping the emitters subordinate to dark, textured housings.
    for cluster, (radial, tangent) in enumerate(((8.0, -1.35), (8.7, 1.15), (16.0, 0.0))):
        x, y = radial_local(angle, radial, tangent)
        housing = prism(
            f"{district_id}_MaintenanceHousing_{cluster + 1}",
            footprint(x, y, .74, .46, .11),
            .50,
            1.12 + cluster * .08,
            infrastructure,
            root,
            .04,
            .84,
        )
        rotate_mesh_about_xy(housing, angle - math.pi / 2, x, y)
        housing["activity"] = "maintenance"
        beacon = prism(
            f"{district_id}_MaintenanceBeacon_{cluster + 1}",
            footprint(x, y, .16, .10, .025),
            1.13 + cluster * .08,
            1.22 + cluster * .08,
            district_accent,
            root,
            .012,
            .72,
        )
        rotate_mesh_about_xy(beacon, angle - math.pi / 2, x, y)

    # Every district uses its own authored silhouette rather than a repeated
    # primitive.  Local coordinates are rotated into the radial wedge.
    profiles = {
        "survey": [(9.2, 0.0, 3.2, 2.2, 2.8), (13.1, -1.3, 2.6, 2.0, 4.6), (13.0, 1.6, 2.0, 1.7, 3.4)],
        "research": [(10.0, -1.3, 2.8, 2.3, 3.7), (12.5, 1.3, 3.1, 2.0, 4.8), (15.0, 0.0, 2.1, 1.8, 2.9)],
        "fabricator": [(10.2, 0.0, 4.4, 2.2, 2.7), (13.7, -1.5, 2.8, 2.1, 4.4), (14.2, 1.5, 2.3, 1.8, 3.3)],
        "engineering": [(10.2, -1.5, 2.3, 2.0, 4.8), (10.2, 1.5, 2.3, 2.0, 4.8), (14.0, 0.0, 4.0, 2.2, 2.8)],
        "habitat": [(9.8, 0.0, 3.4, 2.6, 3.2), (13.0, -1.7, 2.0, 1.8, 5.0), (13.0, 1.7, 2.0, 1.8, 5.0), (15.4, 0.0, 2.3, 1.6, 3.4)],
        "factions": [(10.0, 0.0, 3.2, 2.2, 5.2), (13.6, -1.5, 2.1, 1.8, 3.5), (13.6, 1.5, 2.1, 1.8, 3.5)],
        "hangar": [(10.7, 0.0, 5.2, 2.6, 2.2), (14.5, -1.4, 2.2, 1.7, 3.0), (14.5, 1.4, 2.2, 1.7, 3.0)],
        "logistics": [(9.8, -1.5, 3.0, 2.0, 2.6), (9.8, 1.5, 3.0, 2.0, 2.6), (13.7, 0.0, 4.1, 2.2, 3.8)],
    }[district_id]

    for idx, (radial, tangent, w, d, h) in enumerate(profiles):
        x, y = radial_local(angle, radial, tangent)
        obj = prism(
            f"{district_id}_Structure_{idx + 1}",
            footprint(x, y, w, d, min(w, d) * 0.18),
            0.45,
            h,
            deck,
            root,
            0.10,
            0.82 if h > 3.6 else 0.92,
        )
        obj["district_id"] = district_id
        obj["pick_role"] = "building"
        rotate_mesh_about_xy(obj, angle - math.pi / 2, x, y)
        # Layered roof crown gives every building actual topology and depth.
        crown = prism(
            f"{district_id}_Crown_{idx + 1}",
            footprint(x, y, w * 0.68, d * 0.68, min(w, d) * 0.13),
            h,
            h + 0.42 + idx * 0.08,
            infrastructure if idx == 0 else deck,
            root,
            0.07,
            0.78,
        )
        rotate_mesh_about_xy(crown, angle - math.pi / 2, x, y)
        recessed_status_assembly(
            f"{district_id}_{idx + 1}",
            x,
            y,
            w,
            d,
            h + .43 + idx * .08,
            angle - math.pi / 2,
            infrastructure,
            deck,
            district_accent,
            root,
            crown,
            district_id,
        )

    # District-specific skyline pieces.
    if district_id == "survey":
        for tangent in (-1.8, 0, 1.8):
            x, y = radial_local(angle, 15.0, tangent)
            mast = lathe(f"survey_Sensor_{tangent:+.1f}", [(0.45, .42), (2.6, .25), (4.9, .08)], 18, deck, root, .035)
            mast.location = (x, y, 0)
            dish = lathe(f"survey_Dish_{tangent:+.1f}", [(4.7, .18), (4.9, 1.05), (5.05, .28)], 24, infrastructure, root, .02)
            dish.location = (x, y, 0)
            receiver = lathe(f"survey_ReceiverHousing_{tangent:+.1f}", [(5.04, .25), (5.10, .32), (5.17, .08)], 18, infrastructure, root, .01)
            receiver.location = (x, y, 0)
            signal = lathe(f"survey_ReceiverSignal_{tangent:+.1f}", [(5.13, .09), (5.20, .11), (5.26, .025)], 14, district_systems, root, .006)
            signal.location = (x, y, 0)
    elif district_id == "engineering":
        for tangent in (-1.45, 1.45):
            x, y = radial_local(angle, 14.4, tangent)
            reactor = lathe(f"engineering_Reactor_{tangent:+.1f}", [(.45, 1.0), (1.1, 1.25), (3.2, .72), (4.4, .34)], 24, infrastructure, root, .04)
            reactor.location = (x, y, 0)
            collar = lathe(f"engineering_ReactorCollarHousing_{tangent:+.1f}", [(2.62, .76), (2.75, .84), (2.88, .76)], 24, infrastructure, root, .018)
            collar.location = (x, y, 0)
            indicators = segmented_annulus(f"engineering_ReactorIndicatorRing_{tangent:+.1f}", .77, .84, 2.73, 2.79, 10, .34, district_systems, root, 2)
            indicators.location = (x, y, 0)
    elif district_id == "habitat":
        # Actual green-space canopy geometry, not a painted patch.
        x, y = radial_local(angle, 14.8, 0)
        park = prism("habitat_CanopyHousing", footprint(x, y, 3.7, 1.8, .5), .48, 1.05, infrastructure, root, .16, .80)
        park["activity"] = "civilian"
        canopy_frame = compound_prisms(
            "habitat_CanopyFrame",
            [
                (footprint(x - 1.45, y, .16, 1.55, .035), .98, 1.18, .82),
                (footprint(x + 1.45, y, .16, 1.55, .035), .98, 1.18, .82),
                (footprint(x, y - .67, 2.82, .14, .035), .98, 1.18, .82),
                (footprint(x, y + .67, 2.82, .14, .035), .98, 1.18, .82),
            ],
            deck,
            root,
            0,
        )
        canopy_frame["activity"] = "civilian"
        window_sections = []
        for offset in (-1.02, -.34, .34, 1.02):
            window_sections.append((footprint(x + offset, y, .46, .10, .025), 1.09, 1.15, .84))
        canopy_windows = compound_prisms("habitat_CanopyWindowRibbons", window_sections, glass, root, 0)
        canopy_windows["activity"] = "civilian"
    elif district_id == "hangar":
        for tangent in (-1.7, 0, 1.7):
            x, y = radial_local(angle, 15.7, tangent)
            shuttle = prism(
                f"hangar_Shuttle_{tangent:+.1f}",
                [(x - .65, y - .18), (x + .38, y - .32), (x + .78, y), (x + .38, y + .32), (x - .65, y + .18), (x - .35, y)],
                .58,
                .86,
                infrastructure,
                root,
                .035,
                .72,
            )
            shuttle["activity"] = "flight_deck"
            marker = prism(
                f"hangar_ShuttleMarker_{tangent:+.1f}",
                footprint(x + .29, y, .18, .10, .025),
                .87,
                .96,
                district_accent,
                root,
                .012,
                .70,
            )
            marker["activity"] = "flight_deck"

    build_district_activity(
        district_id,
        angle,
        root,
        bpy.data.objects[f"{district_id}_Crown_1"],
        infrastructure,
        deck,
        district_accent,
    )


def build_command_interior():
    reset_scene()
    hull = pbr_material("UGA Interior Armor", "uga-interior", 2.8)
    deck = pbr_material("UGA Deck Plating", "uga-hull", 3.5)
    glass = simple_material("Habitat Glass", (0.025, 0.10, 0.13, 1), .15, .16, (0.01, .28, .38, 1), 1.05)
    cyan = simple_material("UGA Cyan Systems", (0.015, .16, .20, 1), .25, .24, (0.01, .78, 1.0, 1), 1.0)
    amber = simple_material("UGA Command Amber", (.18, .08, .01, 1), .40, .30, (1.0, .34, .035, 1), 1.12)

    root = add_empty("UGA_CIVILIZATION_SHIP_CUTAWAY", (0, 0, 0), extras={"asset_role": "uga_command", "ship_identity": "uga_civilization_ship", "version": 2})

    # The management scene is the opened civilization ship, not a separate
    # radial base. Its 70 x 18 metre authoring footprint matches the exterior's
    # proportions and preserves the same pointed prow, central spine, gravity
    # ribs, paired habitat decks, and aft propulsion block.
    hull_outline = [
        (-35.0, 0.0), (-31.0, -4.8), (-22.0, -7.8), (17.0, -8.4),
        (29.0, -6.6), (34.0, -3.2), (35.5, 0.0), (34.0, 3.2),
        (29.0, 6.6), (17.0, 8.4), (-22.0, 7.8), (-31.0, 4.8),
    ]
    prism("UGA_Ship_CutawayDeck", hull_outline, -.18, .32, deck, root, .12, .985)
    prism("UGA_Ship_CentralTransitSpine", footprint(0, 0, 61.0, 1.05, .32), .30, .78, hull, root, .06, .96)
    for side in (-1, 1):
        rail_points = [(-31, side * 4.3), (-22, side * 7.2), (17, side * 7.8), (30, side * 5.8)]
        rail_inner = [(-29, side * 3.65), (-21, side * 6.45), (17, side * 7.0), (29, side * 5.15)]
        prism(
            f"UGA_Ship_{'Port' if side < 0 else 'Starboard'}CutawayArmor",
            rail_points + list(reversed(rail_inner)),
            .25,
            2.35,
            hull,
            root,
            .10,
            .965,
        )

    # The same illuminated gravity-ring cadence visible on the exterior wraps
    # the open district decks. Full modeled ribs give the cutaway a readable
    # relationship to the ship from every focus camera.
    for index, longitudinal in enumerate((-12.0, -2.0, 8.0, 18.0, 27.0)):
        ring = lathe(
            f"UGA_Ship_GravityRing_{index + 1}",
            [(longitudinal - .34, 8.35), (longitudinal, 9.05), (longitudinal + .34, 8.35)],
            72,
            glass,
            root,
            .045,
        )
        ring.rotation_euler[1] = math.radians(90)
        ring["model_role"] = "gravity_ring"

    # Aft reactor tunnel and the two primary drive throats align with the
    # exterior propulsion apertures at the stern.
    for side in (-2.55, 2.55):
        throat = lathe("UGA_Ship_InteriorDriveThroat", [(27.5, 1.75), (30.5, 2.15), (33.0, 1.55), (34.2, .85)], 36, hull, root, .06)
        throat.rotation_euler[1] = math.radians(90)
        throat.location.y = side
        glow = lathe("UGA_Ship_InteriorDriveGlow", [(32.7, 1.25), (33.7, .92), (34.45, .22)], 32, cyan, root, .02)
        glow.rotation_euler[1] = math.radians(90)
        glow.location.y = side

    command = add_empty("DISTRICT_command", (-26.0, 0, 0), root, {"district_id": "command", "label": "Command Core", "selectable": True})
    add_empty("FOCUS_command", (0, 0, 3.1), command, {"district_id": "command", "camera_distance": 12.8, "camera_height": 8.2})
    lathe("Command_Core", [(0, 4.7), (.5, 5.0), (1.1, 4.1), (2.8, 3.2), (4.8, 2.4), (6.8, .95), (8.2, .24)], 64, deck, command, .08)
    lathe("Command_CoreCollarHousing", [(2.1, 2.65), (2.3, 2.78), (2.55, 2.64)], 64, hull, command, .02)
    segmented_annulus("Command_CoreLightSegments", 2.64, 2.78, 2.28, 2.38, 12, .34, amber, command, 3)
    for i in range(12):
        a = i * math.tau / 12
        x, y = radial_local(a, 4.2)
        height = 3.0 + (i % 3) * .34
        tower = prism(f"Command_Tower_{i + 1}", footprint(x, y, .72, 1.15, .18), .65, height, deck, command, .05, .74)
        rotate_mesh_about_xy(tower, a, x, y)
        recessed_status_assembly(
            f"Command_Tower_{i + 1}",
            x,
            y,
            .72,
            1.15,
            height + .01,
            a,
            hull,
            deck,
            amber if i % 3 == 0 else cyan,
            command,
            tower,
            "command",
        )

    districts = [
        ("survey", "Survey Lab", "long_range_scan"),
        ("research", "Research Directorate", "science"),
        ("fabricator", "Fabricator", "industry"),
        ("engineering", "Engineering & Drive", "reactor"),
        ("habitat", "Habitat & Medical", "civilian"),
        ("factions", "Faction Quarters", "diplomacy"),
        ("hangar", "Deployment Hangar", "flight_deck"),
        ("logistics", "Logistics & Cargo", "freight"),
    ]
    district_bays = {
        "survey": (-14.0, 4.25),
        "research": (-3.5, 4.25),
        "fabricator": (7.0, 4.25),
        "engineering": (18.0, 4.25),
        "habitat": (-14.0, -4.25),
        "factions": (-3.5, -4.25),
        "hangar": (7.0, -4.25),
        "logistics": (18.0, -4.25),
    }
    for i, spec in enumerate(districts):
        angle = math.pi / 2 - i * math.tau / 8
        droot = add_empty(f"DISTRICT_{spec[0]}", (0, 0, 0), root)
        build_district(droot, spec, angle, deck, hull, glass, cyan, amber if i % 2 == 0 else cyan)
        # District geometry is authored as a detailed radial wedge, then the
        # complete hierarchy is placed as a longitudinal bay. Transforming the
        # root retains every nested tier/readout relationship and avoids the
        # old circular-city silhouette without flattening the authored detail.
        bay_x, bay_y = district_bays[spec[0]]
        radial_center = 11.9
        droot.rotation_euler[2] = -angle
        droot.scale = (.76, .62, 1.0)
        droot.location = (bay_x - radial_center * .76, bay_y, 0)
        droot["ship_bay_x"] = bay_x
        droot["ship_bay_y"] = bay_y

    # Civilian/service traffic follows the same longitudinal transit lanes seen
    # through the exterior habitat-ring openings.
    for lane, y in enumerate((-5.75, 0.0, 5.75)):
        for i in range(20):
            x = -22.0 + i * 2.55
            y_offset = y + math.sin(i * 1.7 + lane) * .16
            pod = prism(
                f"ServicePod_{lane}_{i:02d}",
                [(x - .22, y_offset - .08), (x + .16, y_offset - .12), (x + .28, y_offset), (x + .16, y_offset + .12), (x - .22, y_offset + .08)],
                .84 + lane * .09,
                .98 + lane * .09,
                hull,
                root,
                .018,
                .80,
            )
            pod["activity"] = "service_traffic"
            if i % 3 == 0:
                lamp = prism(
                    f"ServicePodLamp_{lane}_{i:02d}",
                    footprint(x + .10, y_offset, .10, .07, .018),
                    .99 + lane * .09,
                    1.06 + lane * .09,
                    cyan if lane != 1 else amber,
                    root,
                    .008,
                    .68,
                )
                lamp["activity"] = "service_traffic"

    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    SOURCE_DIR.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE_DIR / "uga-command-cutaway.blend"))
    bpy.ops.export_scene.gltf(
        filepath=str(MODEL_DIR / "uga-command-cutaway.glb"),
        export_format="GLB",
        export_apply=True,
        export_extras=True,
        # UgaCommandScene uses XY as the deck plane and Z as height. Preserve
        # authored Blender Z-up coordinates instead of rotating them to glTF Y.
        export_yup=False,
        export_cameras=False,
        export_lights=False,
    )


def oriented_box(name, x0, x1, y0, y1, z0, z1, material, parent=None, bevel=.05):
    vertices = [
        (x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0),
        (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1),
    ]
    faces = [(3, 2, 1, 0), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
    return mesh_object(name, vertices, faces, material, parent, bevel, False)


def open_ring_rib(name, x, radius, center_z, material, parent):
    """Model the far half of a gravity rib so the near-side cutaway stays open."""
    vertices, faces = [], []
    steps, inner, outer, half = 28, radius - .40, radius + .40, .27
    for index in range(steps + 1):
        angle = -math.pi / 2 + math.pi * index / steps
        for axial, radial in ((-half, inner), (half, inner), (-half, outer), (half, outer)):
            vertices.append((x + axial, math.cos(angle) * radial, center_z + math.sin(angle) * radial))
    for index in range(steps):
        a, b = index * 4, (index + 1) * 4
        faces.extend(((a, b, b + 2, a + 2), (a + 1, a + 3, b + 3, b + 1), (a, a + 1, b + 1, b), (a + 2, b + 2, b + 3, a + 3)))
    return mesh_object(name, vertices, faces, material, parent, .035, True)


def regular_footprint(cx, cy, radius, sides=8, rotation=math.pi / 8):
    """Return a clean low-poly radial footprint for interior civic furniture."""
    return [
        (
            cx + math.cos(rotation + math.tau * index / sides) * radius,
            cy + math.sin(rotation + math.tau * index / sides) * radius,
        )
        for index in range(sides)
    ]


def rotated_footprint(cx, cy, width, depth, angle=0.0, chamfer=.08):
    """Return a chamfered footprint rotated in plan around its own center."""
    c, s = math.cos(angle), math.sin(angle)
    points = []
    for x, y in footprint(0, 0, width, depth, chamfer):
        points.append((cx + x * c - y * s, cy + x * s + y * c))
    return points


def sloped_console(
    name,
    cx,
    cy,
    width,
    depth,
    z0,
    front_z,
    back_z,
    material,
    parent,
    angle=0.0,
    bevel=.025,
):
    """Build one low-poly wedge console with a readable sloped work surface."""
    local = footprint(0, 0, width, depth, min(.10, width * .12, depth * .18))
    c, s = math.cos(angle), math.sin(angle)
    bottom = []
    top = []
    for x, y in local:
        wx, wy = cx + x * c - y * s, cy + x * s + y * c
        bottom.append((wx, wy, z0))
        height_mix = max(0.0, min(1.0, y / max(depth, .001) + .5))
        top.append((wx, wy, front_z + (back_z - front_z) * height_mix))
    count = len(local)
    faces = [tuple(reversed(range(count))), tuple(count + index for index in range(count))]
    for index in range(count):
        nxt = (index + 1) % count
        faces.append((index, nxt, count + nxt, count + index))
    return mesh_object(name, bottom + top, faces, material, parent, bevel, False)


def sloped_panel(name, cx, cy, width, depth, front_z, back_z, thickness, material, parent, angle=0.0):
    """Add a thin inset display that follows a console's slope without a bright slab."""
    local = footprint(0, 0, width, depth, min(.07, width * .10, depth * .16))
    c, s = math.cos(angle), math.sin(angle)
    bottom = []
    top = []
    for x, y in local:
        wx, wy = cx + x * c - y * s, cy + x * s + y * c
        height_mix = max(0.0, min(1.0, y / max(depth, .001) + .5))
        z = front_z + (back_z - front_z) * height_mix
        bottom.append((wx, wy, z - thickness))
        top.append((wx, wy, z))
    count = len(local)
    faces = [tuple(reversed(range(count))), tuple(count + index for index in range(count))]
    for index in range(count):
        nxt = (index + 1) % count
        faces.append((index, nxt, count + nxt, count + index))
    # The housing already supplies the readable bevel. Keeping the inset
    # screen planar avoids multiplying tiny bevel geometry across each bank.
    return mesh_object(name, bottom + top, faces, material, parent, 0, False)


def operator_seat_bank(name, specs, material, parent, district_id, accent=None):
    """Batch distinct high-backed operator chairs into one or two cheap meshes."""
    housing_sections = []
    accent_sections = []
    for cx, cy, angle, base_z in specs:
        housing_sections.append((rotated_footprint(cx, cy, .46, .48, angle, .07), base_z, base_z + .17, .92))
        back_offset = .20
        back_x = cx - math.sin(angle) * back_offset
        back_y = cy + math.cos(angle) * back_offset
        housing_sections.append((rotated_footprint(back_x, back_y, .44, .14, angle, .045), base_z + .12, base_z + .62, .86))
        if accent:
            accent_sections.append((rotated_footprint(back_x, back_y - .01, .25, .035, angle, .012), base_z + .43, base_z + .49, .94))
    housing = compound_prisms(name, housing_sections, material, parent, .014)
    tag_interior(housing, district_id, "operator_seating")
    if accent_sections:
        accents = compound_prisms(f"{name}Status", accent_sections, accent, parent, .004)
        tag_interior(accents, district_id, "operator_seat_status")
    return housing


def standing_personnel_bank(name, specs, material, accent, parent, district_id, faction_id, role):
    """Batch human-scale standing personnel without runtime primitive people.

    The compact torso/leg/head silhouettes remain readable in the portrait
    cutaway, while a second shoulder/helmet mesh carries restrained faction
    identification for Nova, Dominion, or Syndicate personnel.
    """
    body_sections = []
    accent_sections = []
    for cx, cy, angle in specs:
        c, s = math.cos(angle), math.sin(angle)

        def offset(local_x, local_y):
            return cx + local_x * c - local_y * s, cy + local_x * s + local_y * c

        for local_x in (-.052, .052):
            x, y = offset(local_x, 0)
            body_sections.append((rotated_footprint(x, y, .075, .14, angle, .018), .40, .68, .96))
        body_sections.append((rotated_footprint(cx, cy, .20, .14, angle, .035), .66, 1.02, .82))
        body_sections.append((regular_footprint(cx, cy, .082, 8), 1.03, 1.18, .86))
        accent_x, accent_y = offset(0, -.045)
        accent_sections.append((rotated_footprint(accent_x, accent_y, .22, .045, angle, .012), .89, .98, .92))
        accent_sections.append((regular_footprint(cx, cy, .052, 8), 1.165, 1.195, .84))

    body = compound_prisms(name, body_sections, material, parent, 0)
    tag_interior(body, district_id, role)
    body["faction_id"] = faction_id
    body["species"] = "human"
    body["selectable_roster"] = True
    accents = compound_prisms(f"{name}FactionMarkings", accent_sections, accent, parent, 0)
    tag_interior(accents, district_id, f"{role}_faction_marking")
    accents["faction_id"] = faction_id
    return body


def tag_interior(obj, district_id, role=None):
    obj["district_id"] = district_id
    if role:
        obj["render_role"] = role
    return obj


def short_stair_run(name, cx, y0, y1, width, z0, z1, steps, material, parent, district_id):
    """Batch a human-scale stair into one mesh instead of emitting primitives."""
    sections = []
    depth = (y1 - y0) / steps
    for index in range(steps):
        cy = y0 + depth * (index + .5)
        height = z0 + (z1 - z0) * (index + 1) / steps
        sections.append((footprint(cx, cy, width, abs(depth) + .025, .035), z0, height, 1.0))
    stairs = compound_prisms(name, sections, material, parent, .018)
    return tag_interior(stairs, district_id, "interior_stair")


def build_service_trench(root, district_id, architecture, systems, center_y=-1.58, width=5.4):
    """Add a recessed-looking service lane and grated access spine."""
    trench = compound_prisms(
        f"{district_id}_RecessedServiceTrench",
        [(footprint(0, center_y, width, .38, .035), .282, .318, 1.0)],
        systems,
        root,
        .008,
    )
    tag_interior(trench, district_id, "interior_service_trench")
    grates = []
    for index in range(12):
        x = -width * .46 + index * width * .92 / 11
        grates.append((footprint(x, center_y, .055, .34, .012), .319, .355, 1.0))
    grate = compound_prisms(f"{district_id}_ServiceTrenchGrate", grates, architecture, root, .006)
    return tag_interior(grate, district_id, "interior_service_grate")


def build_bulkhead_connector(
    root,
    district_id,
    architecture,
    pressure_wall,
    transit,
    systems,
    tunnel_glass,
    x0=2.85,
    x1=4.18,
    center_y=-.42,
):
    """Build the approved glazed corridor, pressure door and ceiling rail kit."""
    floor = compound_prisms(
        f"{district_id}_GlazedConnectorFloor",
        [(footprint((x0 + x1) * .5, center_y, x1 - x0, 1.18, .08), .30, .48, 1.0)],
        transit,
        root,
        .02,
    )
    tag_interior(floor, district_id, "interior_transit")

    frame_sections = []
    for x in (x0, (x0 + x1) * .5, x1):
        for y in (center_y - .58, center_y + .58):
            frame_sections.append((footprint(x, y, .10, .10, .02), .47, 2.34, 1.0))
    for y in (center_y - .58, center_y + .58):
        frame_sections.append((footprint((x0 + x1) * .5, y, x1 - x0, .10, .02), 2.24, 2.38, 1.0))
    frame = compound_prisms(f"{district_id}_GlazedConnectorFrame", frame_sections, architecture, root, .012)
    tag_interior(frame, district_id, "architectural_tunnel_frame")

    glazing_sections = [
        (footprint((x0 + x1) * .5, center_y - .535, x1 - x0 - .18, .035, 0), .60, 2.20, 1.0),
        (footprint((x0 + x1) * .5, center_y + .535, x1 - x0 - .18, .035, 0), .60, 2.20, 1.0),
        (footprint((x0 + x1) * .5, center_y, x1 - x0 - .18, .98, .04), 2.20, 2.25, 1.0),
    ]
    glazing = compound_prisms(f"{district_id}_GlazedConnectorGlazing", glazing_sections, tunnel_glass, root, .004)
    tag_interior(glazing, district_id, "architectural_glazing")

    # The doorway terminates the corridor with visibly thick pressure structure
    # instead of letting the glass tube float against the compartment wall.
    door_sections = [
        (footprint(x1 - .03, center_y - .66, .22, .16, .025), .32, 2.62, 1.0),
        (footprint(x1 - .03, center_y + .66, .22, .16, .025), .32, 2.62, 1.0),
        (footprint(x1 - .03, center_y, .22, 1.48, .025), 2.42, 2.66, 1.0),
    ]
    door_frame = compound_prisms(f"{district_id}_BulkheadDoorFrame", door_sections, pressure_wall, root, .025)
    tag_interior(door_frame, district_id, "pressure_door_frame")
    door = oriented_box(
        f"{district_id}_BulkheadDoorGlazing",
        x1 - .16,
        x1 - .09,
        center_y - .51,
        center_y + .51,
        .50,
        2.37,
        tunnel_glass,
        root,
        .006,
    )
    tag_interior(door, district_id, "architectural_glazing")
    rail = oriented_box(
        f"{district_id}_CeilingLightRail",
        x0 - .08,
        x1 + .02,
        center_y - .08,
        center_y + .08,
        2.38,
        2.48,
        systems,
        root,
        .008,
    )
    return tag_interior(rail, district_id, "interior_ceiling_service")


def build_command_core_from_concept(
    root,
    architecture,
    pressure_wall,
    transit,
    systems,
    amber,
    tunnel_glass,
    machinery,
    display_glass,
):
    """Author the approved low strategy amphitheater in place of the cone."""
    district_id = "command"
    dais = prism(
        "Command_StrategyDais",
        regular_footprint(0, -.10, 2.75, 12),
        .34,
        .58,
        architecture,
        root,
        .055,
        .98,
    )
    tag_interior(dais, district_id, "command_amphitheater")
    inner_dais = prism(
        "Command_InnerDais",
        regular_footprint(0, -.10, 2.14, 12),
        .58,
        .74,
        transit,
        root,
        .04,
        .98,
    )
    tag_interior(inner_dais, district_id, "command_amphitheater")
    core = prism(
        "Command_Core",
        regular_footprint(0, -.10, 1.18, 10),
        .74,
        1.13,
        architecture,
        root,
        .055,
        .88,
    )
    tag_interior(core, district_id, "command_strategy_table")
    core_glass = prism(
        "Command_StrategyTableGlass",
        regular_footprint(0, -.10, .84, 10),
        1.13,
        1.18,
        display_glass,
        root,
        .008,
        .98,
    )
    tag_interior(core_glass, district_id, "command_strategy_display")
    core_light = segmented_annulus("Command_CoreLightSegments", .90, 1.02, 1.10, 1.17, 12, .74, systems, root, 2)
    tag_interior(core_light, district_id, "command_hologram")
    holo = segmented_annulus("Command_HologramLattice", .50, .64, 1.30, 1.36, 14, .72, systems, root, 2)
    tag_interior(holo, district_id, "command_hologram")

    # Six angled operator cassettes form a readable command ring while leaving
    # clear entry and stair paths at the open pressure-bay side.
    command_seats = []
    for index, angle in enumerate((.35, .95, 2.18, 2.78, 3.72, 5.70), 1):
        x, y = math.cos(angle) * 2.25, math.sin(angle) * 2.25 - .10
        body = prism(
            f"Command_StaffStation_{index}",
            footprint(x, y, 1.02, .60, .13),
            .75,
            1.10,
            machinery,
            root,
            .035,
            .82,
        )
        rotate_mesh_about_xy(body, angle + math.pi / 2, x, y)
        tag_interior(body, district_id, "command_staff_station")
        readout = sloped_panel(
            f"Command_StaffReadout_{index}",
            x,
            y,
            .62,
            .22,
            1.105,
            1.165,
            .022,
            display_glass,
            root,
            angle + math.pi / 2,
        )
        tag_interior(readout, district_id, "command_readout")
        chair_x, chair_y = math.cos(angle) * 2.78, math.sin(angle) * 2.78 - .10
        command_seats.append((chair_x, chair_y, angle - math.pi / 2, .73))
    operator_seat_bank("Command_StaffSeating", command_seats, machinery, root, district_id)

    gallery_sections = [
        (footprint(-3.72, 1.15, 1.55, 2.25, .20), .34, .78, 1.0),
        (footprint(3.72, 1.15, 1.55, 2.25, .20), .34, .78, 1.0),
        (footprint(0, 2.10, 5.95, .66, .12), .34, .78, 1.0),
    ]
    galleries = compound_prisms("Command_RaisedGalleries", gallery_sections, architecture, root, .035)
    tag_interior(galleries, district_id, "command_gallery")
    short_stair_run("Command_PortGalleryStair", -3.72, -.78, .10, 1.18, .34, .79, 5, transit, root, district_id)
    short_stair_run("Command_StarboardGalleryStair", 3.72, -.78, .10, 1.18, .34, .79, 5, transit, root, district_id)

    # Perimeter console banks give the room an operational hierarchy beyond
    # the central table.  The wedges and high-backed seats remain readable in
    # the portrait cutaway without spending geometry on small character props.
    perimeter_specs = [
        (-3.58, .72, math.pi / 2, -3.02, .72, 0),
        (-3.58, 1.72, math.pi / 2, -3.02, 1.72, 0),
        (3.58, .72, -math.pi / 2, 3.02, .72, 0),
        (3.58, 1.72, -math.pi / 2, 3.02, 1.72, 0),
        (-2.15, 2.20, 0, -2.15, 1.68, 0),
        (0, 2.20, 0, 0, 1.68, 0),
        (2.15, 2.20, 0, 2.15, 1.68, 0),
    ]
    perimeter_seats = []
    for index, (x, y, angle, chair_x, chair_y, _unused) in enumerate(perimeter_specs, 1):
        body = sloped_console(
            f"Command_PerimeterConsole_{index}", x, y, 1.10, .55, .78, .92, 1.22,
            machinery, root, angle, .022,
        )
        tag_interior(body, district_id, "command_perimeter_console")
        panel = sloped_panel(
            f"Command_PerimeterDisplay_{index}", x, y, .78, .34, .945, 1.225, .022,
            display_glass, root, angle,
        )
        tag_interior(panel, district_id, "command_perimeter_display")
        perimeter_seats.append((chair_x, chair_y, angle, .77))
    operator_seat_bank("Command_PerimeterSeating", perimeter_seats, machinery, root, district_id)

    screen_frames = []
    screen_panes = []
    for x in (-2.35, 0, 2.35):
        screen_frames.extend((
            (footprint(x - .93, 2.86, .10, .16, .02), 1.46, 3.42, 1.0),
            (footprint(x + .93, 2.86, .10, .16, .02), 1.46, 3.42, 1.0),
            (footprint(x, 2.86, 1.96, .16, .02), 1.40, 1.54, 1.0),
            (footprint(x, 2.86, 1.96, .16, .02), 3.34, 3.48, 1.0),
        ))
        screen_panes.append((footprint(x, 2.77, 1.72, .05, .01), 1.60, 3.27, 1.0))
    frames = compound_prisms("Command_TacticalDisplayWallFrame", screen_frames, pressure_wall, root, .012)
    tag_interior(frames, district_id, "command_display_frame")
    screens = compound_prisms("Command_TacticalDisplayWall", screen_panes, display_glass, root, .005)
    tag_interior(screens, district_id, "command_display")
    data_bars = compound_prisms(
        "Command_TacticalDataReadouts",
        [
            (footprint(-2.35, 2.72, 1.08, .025, 0), 1.82, 1.89, 1.0),
            (footprint(0, 2.72, 1.32, .025, 0), 2.78, 2.86, 1.0),
            (footprint(2.35, 2.72, .96, .025, 0), 2.16, 2.23, 1.0),
        ],
        systems,
        root,
        .002,
    )
    tag_interior(data_bars, district_id, "command_display_readout")
    glyph_sections = []
    for screen_x in (-2.35, 0, 2.35):
        for row in range(3):
            width = (.36, .52, .28)[row]
            glyph_sections.append((footprint(screen_x - .42 + row * .37, 2.708, width, .018, 0), 2.05 + row * .27, 2.095 + row * .27, 1.0))
    glyphs = compound_prisms("Command_TacticalDataGlyphs", glyph_sections, systems, root, 0)
    tag_interior(glyphs, district_id, "command_display_readout")

    build_service_trench(root, district_id, architecture, amber, -2.45, 6.4)
    build_bulkhead_connector(
        root,
        district_id,
        architecture,
        pressure_wall,
        transit,
        systems,
        tunnel_glass,
        3.12,
        4.72,
        -.62,
    )


def build_navigation_bridge_from_concept(
    root,
    architecture,
    pressure_wall,
    transit,
    systems,
    tunnel_glass,
    machinery,
    display_glass,
):
    """Build one route atlas, raised helm well and side astrogation galleries."""
    district_id = "navigation"
    platform = prism(
        "navigation_ForwardHelmPlatform",
        footprint(0, -.18, 4.65, 2.46, .42),
        .29,
        .58,
        architecture,
        root,
        .045,
        .98,
    )
    tag_interior(platform, district_id, "navigation_platform")
    short_stair_run("navigation_HelmStair", 0, -2.28, -1.36, 1.35, .29, .59, 5, transit, root, district_id)

    pedestal = lathe("navigation_RouteAtlasPedestal", [(.58, .88), (.72, 1.12), (.90, .98), (1.00, .76)], 16, machinery, root, .025)
    pedestal.location = (0, -.18, 0)
    tag_interior(pedestal, district_id, "navigation_route_atlas")
    atlas_glass = prism(
        "navigation_RouteAtlasGlass",
        regular_footprint(0, -.18, .71, 12),
        1.0,
        1.045,
        display_glass,
        root,
        .006,
        .99,
    )
    tag_interior(atlas_glass, district_id, "navigation_route_display")
    # A planar star-route plot survives the top-down phone view better than
    # three overlapping emissive gimbals. Concentric arcs, spokes and nodes
    # imply depth while keeping the atlas itself one clear focal element.
    for index, (inner, outer, count, duty) in enumerate(((.22, .25, 8, .42), (.43, .47, 10, .52), (.66, .70, 12, .46)), 1):
        ring = segmented_annulus(f"navigation_RouteLattice_{index}", inner, outer, 1.055, 1.085, count, duty, systems, root, 2)
        ring.location = (0, -.18, 0)
        tag_interior(ring, district_id, "navigation_route_hologram")
    spoke_sections = []
    for angle in (0, math.pi / 3, math.pi * .72, math.pi * 1.22):
        dx, dy = math.cos(angle) * .39, math.sin(angle) * .39
        spoke_sections.append((rotated_footprint(dx, -.18 + dy, .68, .025, angle, .006), 1.058, 1.082, 1.0))
    spokes = compound_prisms("navigation_RouteSpokes", spoke_sections, systems, root, 0)
    tag_interior(spokes, district_id, "navigation_route_hologram")
    node_sections = []
    for x, y, radius in ((-.42, -.02, .075), (.31, -.48, .09), (.48, .14, .065), (-.12, -.60, .055)):
        node_sections.append((regular_footprint(x, y, radius, 8), 1.08, 1.16, .82))
    nodes = compound_prisms("navigation_RouteNodes", node_sections, systems, root, 0)
    tag_interior(nodes, district_id, "navigation_route_hologram")

    # Three curved console sectors face the atlas. Their chamfered silhouette
    # reads as a bridge workstation even at the 430px portrait camera.
    console_specs = ((-2.45, -1.58), (-.58, .58), (1.58, 2.45))
    for index, (start, end) in enumerate(console_specs, 1):
        console = annular_sector(f"navigation_HelmConsole_{index}", 1.42, 2.05, start, end, .34, machinery, root, 8)
        console.location.z = .58
        tag_interior(console, district_id, "navigation_helm_console")
        readout = annular_sector(f"navigation_HelmReadout_{index}", 1.60, 1.84, start + .08, end - .08, .035, display_glass, root, 6)
        readout.location.z = .91
        tag_interior(readout, district_id, "navigation_readout")

    main_helm_seats = []
    for angle in (-2.02, 0, 2.02):
        main_helm_seats.append((math.cos(angle) * 2.22, math.sin(angle) * 2.22 - .18, angle - math.pi / 2, .59))
    operator_seat_bank("navigation_MainHelmSeating", main_helm_seats, machinery, root, district_id)

    upper_tier = prism(
        "navigation_UpperHelmTier",
        footprint(0, 1.17, 5.65, 1.08, .16),
        .58,
        .72,
        transit,
        root,
        .026,
        .99,
    )
    tag_interior(upper_tier, district_id, "navigation_helm_tier")
    upper_seats = []
    for index, x in enumerate((-1.78, 0, 1.78), 1):
        body = sloped_console(
            f"navigation_TieredHelmStation_{index}", x, 1.42, 1.18, .62, .72, .86, 1.18,
            machinery, root, 0, .022,
        )
        tag_interior(body, district_id, "navigation_tiered_helm")
        panel = sloped_panel(
            f"navigation_TieredHelmDisplay_{index}", x, 1.42, .84, .36, .89, 1.185, .022,
            display_glass, root, 0,
        )
        tag_interior(panel, district_id, "navigation_readout")
        upper_seats.append((x, .82, 0, .72))
    operator_seat_bank("navigation_UpperHelmSeating", upper_seats, machinery, root, district_id)

    gallery_sections = [
        (footprint(-3.20, .35, 1.08, 2.35, .16), .29, .68, 1.0),
        (footprint(3.20, .72, 1.08, 1.24, .16), .29, .68, 1.0),
    ]
    galleries = compound_prisms("navigation_AstrogationGalleries", gallery_sections, architecture, root, .035)
    tag_interior(galleries, district_id, "navigation_gallery")

    screen_frames = []
    screen_panes = []
    for x in (-2.55, 0, 2.55):
        screen_frames.extend((
            (footprint(x - .88, 2.84, .08, .14, .015), 1.15, 2.78, 1.0),
            (footprint(x + .88, 2.84, .08, .14, .015), 1.15, 2.78, 1.0),
            (footprint(x, 2.84, 1.82, .14, .015), 1.10, 1.20, 1.0),
            (footprint(x, 2.84, 1.82, .14, .015), 2.72, 2.82, 1.0),
        ))
        screen_panes.append((footprint(x, 2.75, 1.58, .04, 0), 1.27, 2.64, 1.0))
    frames = compound_prisms("navigation_ObservationFrame", screen_frames, pressure_wall, root, .01)
    tag_interior(frames, district_id, "navigation_observation_frame")
    screens = compound_prisms("navigation_ObservationGlazing", screen_panes, tunnel_glass, root, .004)
    tag_interior(screens, district_id, "architectural_glazing")

    build_service_trench(root, district_id, architecture, systems, -1.76, 5.7)
    build_bulkhead_connector(root, district_id, architecture, pressure_wall, transit, systems, tunnel_glass)


def build_mission_ops_from_concept(
    root,
    architecture,
    pressure_wall,
    transit,
    systems,
    tunnel_glass,
    machinery,
    display_glass,
):
    """Build the approved briefing amphitheater and deployment table."""
    district_id = "mission_ops"
    lower = annular_sector("mission_ops_BriefingTierLower", 2.18, 3.35, 1.82, 4.32, .22, architecture, root, 16)
    lower.location.z = .30
    tag_interior(lower, district_id, "mission_briefing_tier")
    upper = annular_sector("mission_ops_BriefingTierUpper", 3.38, 4.05, 1.92, 4.22, .34, transit, root, 16)
    upper.location.z = .30
    tag_interior(upper, district_id, "mission_briefing_tier")
    tier_light = segmented_annulus("mission_ops_BriefingAisleLight", 3.22, 3.36, .52, .59, 18, .34, systems, root, 2)
    tag_interior(tier_light, district_id, "mission_wayfinding")
    lower_seats = []
    for angle in (2.02, 2.42, 2.82, 3.22, 3.62, 4.02):
        lower_seats.append((math.cos(angle) * 2.72, math.sin(angle) * 2.72, angle - math.pi / 2, .54))
    upper_seats = []
    for angle in (2.10, 2.58, 3.06, 3.54, 4.02):
        upper_seats.append((math.cos(angle) * 3.67, math.sin(angle) * 3.67, angle - math.pi / 2, .66))
    operator_seat_bank("mission_ops_LowerBriefingSeats", lower_seats, machinery, root, district_id)
    operator_seat_bank("mission_ops_UpperBriefingSeats", upper_seats, machinery, root, district_id)

    table = prism(
        "mission_ops_DeploymentTable",
        regular_footprint(.48, -.02, 1.38, 10),
        .34,
        .88,
        machinery,
        root,
        .05,
        .90,
    )
    tag_interior(table, district_id, "mission_deployment_table")
    table_glass = prism(
        "mission_ops_DeploymentTableGlass",
        regular_footprint(.48, -.02, 1.08, 10),
        .88,
        .95,
        display_glass,
        root,
        .01,
        .98,
    )
    tag_interior(table_glass, district_id, "architectural_glazing")
    table_holo = segmented_annulus("mission_ops_DeploymentHologram", .72, .86, .98, 1.04, 14, .72, systems, root, 2)
    table_holo.location = (.48, -.02, 0)
    tag_interior(table_holo, district_id, "mission_hologram")

    director = prism(
        "mission_ops_DirectorBalcony",
        footprint(2.86, 1.28, 1.55, 2.32, .22),
        .30,
        .76,
        architecture,
        root,
        .04,
        .98,
    )
    tag_interior(director, district_id, "mission_director_balcony")
    short_stair_run("mission_ops_DirectorStair", 2.86, -.70, .12, 1.08, .30, .77, 5, transit, root, district_id)
    director_console = sloped_console(
        "mission_ops_DirectorConsole", 2.86, 1.52, 1.14, .58, .76, .90, 1.20,
        machinery, root, 0, .022,
    )
    tag_interior(director_console, district_id, "mission_director_console")
    director_display = sloped_panel(
        "mission_ops_DirectorDisplay", 2.86, 1.52, .80, .34, .93, 1.205, .022,
        display_glass, root, 0,
    )
    tag_interior(director_display, district_id, "mission_director_display")
    operator_seat_bank("mission_ops_DirectorSeat", [(2.86, .93, 0, .76)], machinery, root, district_id)

    ops_seats = []
    for index, x in enumerate((-2.15, -.55, 1.05), 1):
        body = sloped_console(
            f"mission_ops_Workstation_{index}", x, 2.06, 1.15, .56, .30, .55, .88,
            machinery, root, 0, .022,
        )
        tag_interior(body, district_id, "mission_ops_workstation")
        panel = sloped_panel(
            f"mission_ops_WorkstationDisplay_{index}", x, 2.06, .80, .32, .58, .885, .020,
            display_glass, root, 0,
        )
        tag_interior(panel, district_id, "mission_ops_readout")
        ops_seats.append((x, 1.52, 0, .30))
    operator_seat_bank("mission_ops_WorkstationSeats", ops_seats, machinery, root, district_id)

    wall_frames = []
    wall_panes = []
    for x, width in ((-2.55, 1.75), (-.35, 2.18), (2.18, 1.55)):
        wall_frames.extend((
            (footprint(x - width * .52, 2.84, .08, .14, .015), 1.18, 2.92, 1.0),
            (footprint(x + width * .52, 2.84, .08, .14, .015), 1.18, 2.92, 1.0),
            (footprint(x, 2.84, width + .12, .14, .015), 1.12, 1.23, 1.0),
            (footprint(x, 2.84, width + .12, .14, .015), 2.86, 2.98, 1.0),
        ))
        wall_panes.append((footprint(x, 2.75, width, .04, 0), 1.30, 2.78, 1.0))
    frames = compound_prisms("mission_ops_TacticalWallFrame", wall_frames, pressure_wall, root, .012)
    tag_interior(frames, district_id, "mission_display_frame")
    displays = compound_prisms("mission_ops_SecureDataWall", wall_panes, display_glass, root, .004)
    tag_interior(displays, district_id, "mission_display")
    data_bars = compound_prisms(
        "mission_ops_SecureDataReadouts",
        [
            (footprint(-2.55, 2.72, 1.04, .024, 0), 1.68, 1.75, 1.0),
            (footprint(-.35, 2.72, 1.34, .024, 0), 2.57, 2.65, 1.0),
            (footprint(2.18, 2.72, .92, .024, 0), 2.08, 2.15, 1.0),
        ],
        systems,
        root,
        .002,
    )
    tag_interior(data_bars, district_id, "mission_display_readout")
    glyph_sections = []
    for screen_x in (-2.55, -.35, 2.18):
        for column in range(3):
            glyph_sections.append((footprint(screen_x - .34 + column * .33, 2.705, .22 + column * .09, .018, 0), 1.84 + column * .23, 1.88 + column * .23, 1.0))
    glyphs = compound_prisms("mission_ops_TacticalDataGlyphs", glyph_sections, systems, root, 0)
    tag_interior(glyphs, district_id, "mission_display_readout")

    build_service_trench(root, district_id, architecture, systems, -1.72, 5.2)
    build_bulkhead_connector(root, district_id, architecture, pressure_wall, transit, systems, tunnel_glass, 2.95, 4.18, -.88)


def build_strike_bay_from_concept(
    root,
    architecture,
    pressure_wall,
    deck,
    transit,
    systems,
    machinery,
    display_glass,
    tunnel_glass,
    faction_accents,
):
    """Build one integrated company, cargo, ready-area and deployer hangar.

    The NEXUS-VII is the host facility. Resident combat identities are limited
    to the three playable human factions: Nova, Dominion and Syndicate.
    """
    district_id = "hangar"
    nova, dominion, syndicate = faction_accents

    pad = prism(
        "hangar_SharedHangarPad",
        footprint(0, -.52, 5.34, 3.66, .46),
        .30,
        .46,
        architecture,
        root,
        .028,
        .99,
    )
    tag_interior(pad, district_id, "shared_hangar_pad")
    pad["hosts"] = "base_deployer_air,striker_company,structure_cargo,ready_area"
    pad["space_weapons"] = False

    safety_sections = [
        (footprint(-2.48, -.52, .075, 2.76, 0), .462, .49, 1.0),
        (footprint(2.48, -.52, .075, 2.76, 0), .462, .49, 1.0),
        (footprint(0, .98, 4.94, .075, 0), .462, .49, 1.0),
        (footprint(0, -2.02, 4.94, .075, 0), .462, .49, 1.0),
    ]
    safety = compound_prisms("hangar_SharedPadSafetyMarkings", safety_sections, dominion, root, 0)
    tag_interior(safety, district_id, "hangar_safety_marking")

    muster = prism(
        "hangar_StrikerMusterLane",
        footprint(-3.42, -.20, .80, 2.96, .16),
        .30,
        .405,
        transit,
        root,
        .018,
        .99,
    )
    tag_interior(muster, district_id, "striker_muster_lane")
    ready_pad = prism(
        "hangar_CommanderSpecialistReadyArea",
        footprint(3.40, -.62, 1.42, 2.58, .20),
        .30,
        .405,
        transit,
        root,
        .018,
        .99,
    )
    tag_interior(ready_pad, district_id, "commander_specialist_ready_area")

    ramp = compound_walkway_network(
        "hangar_BaseDeployerForwardRamp",
        [],
        [(-.52, .52, -2.56, -1.67, .32, .57, .08)],
        transit,
        root,
        .012,
    )
    tag_interior(ramp, district_id, "base_deployer_egress_ramp")

    # Continuous lifting-body silhouette translated from the live Nova
    # deployer's design language: central hull, swept shoulders, integrated
    # lift housings, cargo keel, pressure canopy and a real forward ramp.
    center_y = -.58

    def shifted(points):
        return [(x, y + center_y) for x, y in points]

    airframe = prism(
        "hangar_BaseDeployerAirUnit",
        shifted([
            (0, -1.18), (.58, -.94), (1.16, -.61), (2.18, -.36),
            (2.02, .08), (1.18, .25), (.78, .78), (.42, .98),
            (-.42, .98), (-.78, .78), (-1.18, .25), (-2.02, .08),
            (-2.18, -.36), (-1.16, -.61), (-.58, -.94),
        ]),
        .56,
        .88,
        architecture,
        root,
        .035,
        .93,
    )
    tag_interior(airframe, district_id, "base_deployer_air_unit")
    airframe["unit_type"] = "base_deployer_air"
    airframe["is_air_unit"] = True
    airframe["transform_states"] = "flight,landing,headquarters_deploy"
    airframe["host"] = "uga"
    airframe["resident_factions"] = "nova,dominion,syndicate"
    airframe["space_weapons"] = False

    upper_hull = prism(
        "hangar_BaseDeployerUpperHull",
        shifted([(0, -1.02), (.52, -.70), (.72, .40), (.44, .74), (-.44, .74), (-.72, .40), (-.52, -.70)]),
        .86,
        1.18,
        pressure_wall,
        root,
        .025,
        .84,
    )
    tag_interior(upper_hull, district_id, "base_deployer_upper_hull")
    canopy = prism(
        "hangar_BaseDeployerPressureCanopy",
        shifted([(0, -1.07), (.34, -.82), (.42, -.46), (-.42, -.46), (-.34, -.82)]),
        1.17,
        1.26,
        display_glass,
        root,
        .006,
        .82,
    )
    tag_interior(canopy, district_id, "base_deployer_canopy")

    lift_housings = compound_prisms(
        "hangar_BaseDeployerLiftHousings",
        [
            (rotated_footprint(-1.46, center_y - .15, .54, 1.10, 0, .10), .62, 1.02, .88),
            (rotated_footprint(1.46, center_y - .15, .54, 1.10, 0, .10), .62, 1.02, .88),
        ],
        machinery,
        root,
        .015,
    )
    tag_interior(lift_housings, district_id, "base_deployer_lift_housing")
    for index, (x, y) in enumerate(((-1.46, center_y - .43), (-1.46, center_y + .18), (1.46, center_y - .43), (1.46, center_y + .18)), 1):
        duct = segmented_annulus(f"hangar_BaseDeployerLiftDuct_{index}", .19, .31, 1.025, 1.075, 12, .72, systems, root, 2)
        duct.location = (x, y, 0)
        tag_interior(duct, district_id, "base_deployer_transforming_lift_duct")
        duct["articulation"] = "flight_to_landing"

    cargo_keel = compound_prisms(
        "hangar_BaseDeployerCargoKeel",
        [
            (footprint(0, center_y + .36, 1.26, .62, .12), .49, .76, .90),
            (footprint(-.66, center_y + .52, .44, .42, .08), .78, 1.08, .86),
            (footprint(.66, center_y + .52, .44, .42, .08), .78, 1.08, .86),
        ],
        machinery,
        root,
        .012,
    )
    tag_interior(cargo_keel, district_id, "base_deployer_structure_keel")
    cargo_keel["deployment_payload"] = "starting_structures"
    livery = compound_prisms(
        "hangar_BaseDeployerUGAMarkings",
        [
            (rotated_footprint(-1.18, center_y - .24, .64, .055, -.10, .012), .885, .92, 1.0),
            (rotated_footprint(1.18, center_y - .24, .64, .055, .10, .012), .885, .92, 1.0),
            (footprint(0, center_y + .72, .56, .055, .012), 1.185, 1.215, 1.0),
        ],
        nova,
        root,
        0,
    )
    tag_interior(livery, district_id, "uga_deployer_marking")
    skids = compound_prisms(
        "hangar_BaseDeployerLandingSkids",
        [
            (footprint(-.82, center_y - .02, .16, 1.52, .04), .47, .59, .94),
            (footprint(.82, center_y - .02, .16, 1.52, .04), .47, .59, .94),
        ],
        machinery,
        root,
        .008,
    )
    tag_interior(skids, district_id, "base_deployer_landing_gear")

    # Three resident/playable human formations share one marked muster lane.
    formation_y = (-1.10, -.50, .10, .70)
    standing_personnel_bank(
        "hangar_NovaStrikerCompany",
        [(-3.68, y, 0) for y in formation_y],
        machinery,
        nova,
        root,
        district_id,
        "nova",
        "striker_company",
    )
    standing_personnel_bank(
        "hangar_DominionStrikerCompany",
        [(-3.42, y, 0) for y in formation_y],
        machinery,
        dominion,
        root,
        district_id,
        "dominion",
        "striker_company",
    )
    standing_personnel_bank(
        "hangar_SyndicateStrikerCompany",
        [(-3.16, y, 0) for y in formation_y],
        machinery,
        syndicate,
        root,
        district_id,
        "syndicate",
        "striker_company",
    )

    standing_personnel_bank("hangar_NovaCommanderReady", [(3.18, -1.35, math.pi)], machinery, nova, root, district_id, "nova", "commander_ready")
    standing_personnel_bank("hangar_NovaSpecialistReady", [(3.60, -1.35, math.pi)], machinery, nova, root, district_id, "nova", "specialist_ready")
    standing_personnel_bank("hangar_DominionSpecialistReady", [(3.18, -.84, math.pi)], machinery, dominion, root, district_id, "dominion", "specialist_ready")
    standing_personnel_bank("hangar_SyndicateSpecialistReady", [(3.60, -.84, math.pi)], machinery, syndicate, root, district_id, "syndicate", "specialist_ready")

    locker_sections = []
    locker_lights = []
    for index, y in enumerate((-.18, .36, .90), 1):
        locker_sections.append((footprint(3.60, y, .52, .40, .08), .405, 1.22, .88))
        locker_lights.append((footprint(3.32, y, .035, .24, .006), .68, .92, 1.0))
    lockers = compound_prisms("hangar_EquipmentLockers", locker_sections, machinery, root, .012)
    tag_interior(lockers, district_id, "ready_area_equipment_lockers")
    locker_status = compound_prisms("hangar_EquipmentLockerStatus", locker_lights, systems, root, 0)
    tag_interior(locker_status, district_id, "ready_area_status")

    rack_frame_sections = [
        (footprint(3.10, 1.72, .10, 1.08, .02), .40, 1.42, 1.0),
        (footprint(4.02, 1.72, .10, 1.08, .02), .40, 1.42, 1.0),
        (footprint(3.56, 1.25, 1.02, .10, .02), 1.30, 1.44, 1.0),
        (footprint(3.56, 2.19, 1.02, .10, .02), 1.30, 1.44, 1.0),
    ]
    cargo_rack = compound_prisms("hangar_StartingStructureCargoRack", rack_frame_sections, architecture, root, .012)
    tag_interior(cargo_rack, district_id, "starting_structure_cargo_rack")
    payload_sections = [
        (footprint(3.30, 1.52, .44, .52, .09), .42, .92, .86),
        (footprint(3.82, 1.52, .44, .52, .09), .42, 1.05, .86),
        (footprint(3.30, 2.00, .44, .42, .08), .42, .84, .88),
        (footprint(3.82, 2.00, .44, .42, .08), .42, .96, .88),
    ]
    payloads = compound_prisms("hangar_StartingStructureCargoModules", payload_sections, machinery, root, .010)
    tag_interior(payloads, district_id, "starting_structure_cargo")
    locks = compound_prisms(
        "hangar_StartingStructureCargoLocks",
        [
            (footprint(3.30, 1.22, .24, .035, 0), .76, .82, 1.0),
            (footprint(3.82, 1.22, .24, .035, 0), .88, .94, 1.0),
            (footprint(3.30, 1.76, .24, .035, 0), .68, .74, 1.0),
            (footprint(3.82, 1.76, .24, .035, 0), .80, .86, 1.0),
        ],
        dominion,
        root,
        0,
    )
    tag_interior(locks, district_id, "starting_structure_cargo_lock")

    build_service_trench(root, district_id, architecture, systems, 1.80, 5.15)
    build_bulkhead_connector(root, district_id, architecture, pressure_wall, transit, systems, tunnel_glass, 3.06, 4.70, -2.30)


def build_ship_compartment(
    root,
    district_id,
    label,
    activity,
    deck,
    hull,
    architecture,
    systems,
    glass,
    green,
    transit,
    window_glass=None,
    tunnel_glass=None,
    machinery=None,
    display_glass=None,
    subdued_systems=None,
    faction_accents=None,
):
    window_glass = window_glass or glass
    tunnel_glass = tunnel_glass or glass
    machinery = machinery or architecture
    display_glass = display_glass or glass
    subdued_systems = subdued_systems or systems
    faction_accents = faction_accents or (systems, systems, systems)
    root["district_id"] = district_id
    root["label"] = label
    root["activity"] = activity
    root["selectable"] = True
    add_empty(f"FOCUS_{district_id}", (0, -.4, 2.2), root, {"district_id": district_id, "camera_distance": 27.0, "camera_height": 18.0})

    oriented_box(f"{district_id}_Deck", -4.4, 4.4, -3.35, 3.25, 0, .28, deck, root, .08)
    oriented_box(f"{district_id}_RearPressureWall", -4.4, 4.4, 2.9, 3.3, .28, 4.75, hull, root, .06)
    oriented_box(f"{district_id}_PortBulkhead", -4.4, -4.05, -3.25, 3.18, .25, 4.65, hull, root, .045)
    oriented_box(f"{district_id}_StarboardBulkhead", 4.05, 4.4, -3.25, 3.18, .25, 4.65, hull, root, .045)
    oriented_box(f"{district_id}_CeilingServiceBeam", -4.05, 4.05, 2.4, 3.0, 4.25, 4.68, hull, root, .04)
    oriented_box(f"{district_id}_TransitThreshold", -3.8, 3.8, -3.25, -2.9, .29, .54, systems, root, .025)

    profiles = {
        # Command-deck construction plots are shallow wall-integrated bays.
        # They preserve the three BUILD_* contracts without competing with
        # the route atlas or mission-theater hero silhouettes.
        "navigation": [(-2.75, 2.38, 1.30, .62, 1.30), (0, 2.40, 1.38, .60, 1.15), (2.75, 2.38, 1.18, .62, 1.38)],
        "survey": [(-2.2, .7, 2.1, 1.3, 2.15), (.55, .8, 2.4, 1.5, 1.45), (2.7, 1.0, 1.15, 1.05, 2.75)],
        "mission_ops": [(-2.75, 2.38, 1.30, .62, 1.36), (0, 2.40, 1.42, .60, 1.20), (2.75, 2.38, 1.18, .62, 1.42)],
        "research": [(-2.45, .8, 1.5, 1.55, 2.5), (0, .85, 2.05, 1.5, 1.65), (2.5, .8, 1.4, 1.45, 2.6)],
        "fabricator": [(-2.25, .65, 2.25, 1.5, 2.2), (.45, .9, 2.0, 1.35, 1.95), (2.65, .85, 1.1, 1.2, 2.9)],
        "engineering": [(-2.35, .8, 1.5, 1.5, 3.0), (0, .8, 1.7, 1.55, 2.4), (2.4, .8, 1.4, 1.45, 3.0)],
        "habitat": [(-2.45, .85, 1.75, 1.45, 2.25), (0, .8, 2.2, 1.5, 1.5), (2.5, .85, 1.65, 1.4, 2.3)],
        "factions": [(-2.4, .8, 1.55, 1.5, 2.7), (0, .85, 1.95, 1.45, 1.85), (2.4, .8, 1.55, 1.5, 2.7)],
        # Preserve all BUILD_hangar_* names and metadata while staging their
        # construction frames along the rear service wall. This keeps the
        # shared deployment pad, aircraft and muster/ready paths unobstructed.
        "hangar": [(-2.75, 2.46, 1.55, .62, 1.25), (-.78, 2.46, 1.55, .62, 1.15), (1.20, 2.46, 1.45, .62, 1.35)],
        "logistics": [(-2.45, .75, 1.75, 1.5, 2.0), (0, .75, 2.05, 1.5, 2.3), (2.45, .75, 1.7, 1.45, 2.6)],
    }[district_id]

    # Human-scale circulation gives every district a visible internal street
    # hierarchy instead of placing isolated buildings on one flat deck.  The
    # full network is batched into three authored meshes per room: transit,
    # recessed utility lanes, and curbs.
    route_sections = [
        (footprint(0, -1.91, .96, 1.22, 0), .285, .39, 1.0),
        (footprint(0, -1.27, 7.56, .62, 0), .285, .39, 1.0),
    ]
    for cx, cy, _width, depth, _height in profiles:
        front = cy - depth * .5 - .12
        branch_depth = max(.24, front + .96)
        route_sections.append((footprint(cx, -.96 + branch_depth * .5, .52, branch_depth, 0), .285, .39, 1.0))
    route = compound_walkway_network(
        f"{district_id}_TransitNetwork",
        route_sections,
        [(-.48, .48, -2.90, -2.52, .54, .39, .12)],
        transit,
        root,
        .018,
    )
    route["district_id"] = district_id
    route["render_role"] = "interior_transit"

    utility_sections = [
        (footprint(-.61, -2.02, .12, 1.52, 0), .286, .307, 1.0),
        (footprint(.61, -2.02, .12, 1.52, 0), .286, .307, 1.0),
        (footprint(0, -1.65, 7.70, .09, 0), .286, .307, 1.0),
        (footprint(0, -.88, 7.70, .09, 0), .286, .307, 1.0),
    ]
    utilities = compound_prisms(f"{district_id}_UtilityLanes", utility_sections, systems, root, .008)
    utilities["district_id"] = district_id
    utilities["render_role"] = "interior_utility_lane"

    curb_sections = [
        (footprint(-.54, -2.03, .07, 1.50, 0), .39, .47, 1.0),
        (footprint(.54, -2.03, .07, 1.50, 0), .39, .47, 1.0),
        (footprint(0, -1.62, 7.66, .07, 0), .39, .47, 1.0),
        (footprint(0, -.92, 7.66, .07, 0), .39, .47, 1.0),
    ]
    curbs = compound_prisms(f"{district_id}_TransitCurbs", curb_sections, architecture, root, .012)
    curbs["district_id"] = district_id
    curbs["render_role"] = "interior_transit_curb"
    local_systems = systems.copy()
    local_systems.name = f"{district_id.title()} Compartment Systems"
    facility_ids = {
        "navigation": (("navigation_t2_efficient_routing", "navigation_t2_transit_coordination"), ("navigation_t3_fleet_lattice", "navigation_t3_continuity_scheduler")),
        "survey": (("survey_t2_probe_telemetry", "survey_t2_anomaly_filter"), ("survey_t3_interstellar_observatory", "survey_t3_probe_reclaimer")),
        "mission_ops": (("mission_ops_t2_readiness_network", "mission_ops_t2_debrief_archive"), ("mission_ops_t3_coalition_planner", "mission_ops_t3_casualty_forecasting")),
        "research": (("research_t2_gravitic_computation", "research_t2_xenology_directorate"), ("research_t3_frontier_institute", "research_t3_containment_institute")),
        "fabricator": (("fabricator_t2_precision_forge", "fabricator_t2_rapid_tooling"), ("fabricator_t3_megaship_yards", "fabricator_t3_reclamation_works")),
        "engineering": (("engineering_t2_reactor_baffles", "engineering_t2_drive_tuner"), ("engineering_t3_civilization_grid", "engineering_t3_thermal_reclaimer")),
        "habitat": (("habitat_t2_recovery_ward", "habitat_t2_civilian_works"), ("habitat_t3_trauma_institute", "habitat_t3_arcology_workforce")),
        "factions": (("factions_t2_diplomatic_forum", "factions_t2_readiness_office"), ("factions_t3_accord_council", "factions_t3_joint_command")),
        "hangar": (("hangar_t2_support_bay", "hangar_t2_medevac_cradle"), ("hangar_t3_heavy_lift_complex", "hangar_t3_rapid_turnaround")),
        "logistics": (("logistics_t2_salvage_sorting", "logistics_t2_probe_magazine"), ("logistics_t3_deep_stores", "logistics_t3_autonomous_resupply")),
    }
    for tier, (cx, cy, width, depth, height) in enumerate(profiles, 1):
        plot_id = f"tier{tier}"
        add_empty(
            f"BUILD_{district_id}_{plot_id}",
            (cx, cy, .30),
            root,
            {"district_id": district_id, "build_plot_id": plot_id, "unlock_tier": tier, "footprint": "district_facility"},
        )
        foundation = prism(
            f"BUILD_{district_id}_{plot_id}_Foundation",
            footprint(cx, cy, width * 1.12, depth * 1.14, .22),
            .285,
            .40,
            architecture,
            root,
            .035,
            .78,
        )
        foundation["district_id"] = district_id
        foundation["build_plot_id"] = plot_id
        foundation["build_phase"] = 0
        for frame_index, (fx, fy) in enumerate(((-.42, -.40), (.42, -.40), (-.42, .40), (.42, .40)), 1):
            frame = oriented_box(
                f"BUILD_{district_id}_{plot_id}_Frame_{frame_index}",
                cx + width * fx - .055,
                cx + width * fx + .055,
                cy + depth * fy - .055,
                cy + depth * fy + .055,
                .39,
                min(height * .72, 1.55),
                architecture,
                root,
                .015,
            )
            frame["district_id"] = district_id
            frame["build_plot_id"] = plot_id
            frame["build_phase"] = 1
        construction_machinery = oriented_box(
            f"BUILD_{district_id}_{plot_id}_Machinery",
            cx - width * .28,
            cx + width * .28,
            cy - depth * .26,
            cy + depth * .26,
            .40,
            min(height * .48, 1.1),
            hull,
            root,
            .035,
        )
        construction_machinery["district_id"] = district_id
        construction_machinery["build_plot_id"] = plot_id
        construction_machinery["build_phase"] = 2
        structure = prism(f"{district_id}_Structure_{tier}", footprint(cx, cy, width, depth, .2), .29, height, architecture, root, .08, .86)
        structure["district_id"] = district_id
        structure["pick_role"] = "building"
        structure["build_plot_id"] = plot_id
        structure["build_phase"] = 3
        crown = prism(f"{district_id}_Crown_{tier}", footprint(cx, cy, width * .72, depth * .72, .14), height, height + .34, hull, root, .045, .78)
        crown["district_id"] = district_id
        crown["build_plot_id"] = plot_id
        crown["build_phase"] = 3
        strip = oriented_box(f"{district_id}_TierLight_{tier}", cx - width * .30, cx + width * .30, cy - depth * .53, cy - depth * .46, max(.6, height * .56), max(.72, height * .56 + .12), local_systems, root, .01)
        strip["district_id"] = district_id
        strip["build_plot_id"] = plot_id
        strip["build_phase"] = 3
        if tier >= 2:
            for variant_index, facility_id in enumerate(facility_ids[district_id][tier - 2]):
                offset = -.28 if variant_index == 0 else .28
                addon = oriented_box(
                    f"FACILITY_{facility_id}",
                    cx + width * offset - width * .11,
                    cx + width * offset + width * .11,
                    cy - depth * .10,
                    cy + depth * .10,
                    height + .35,
                    height + .72 + variant_index * .14,
                    local_systems if variant_index == 0 else glass,
                    root,
                    .025,
                )
                addon["district_id"] = district_id
                addon["build_plot_id"] = plot_id
                addon["build_phase"] = 4
                addon["facility_id"] = facility_id

    # Dense secondary architecture establishes each compartment as a working
    # civilization-ship district rather than a bare room with three props.
    # These are authored, beveled facilities with luminous window bands; the
    # deterministic layout remains cheap enough for the mobile cutaway.
    if district_id == "hangar":
        # The approved bay replaces generic cabinet blocks with an authored
        # deployer, personnel, ready area and starting-structure cargo.
        service_sites = []
    elif district_id in {"navigation", "mission_ops"}:
        # The approved command-deck concepts use sparse edge infrastructure,
        # not a repeated cabinet city. Four clusters leave the circulation and
        # hero landmark silhouettes open at mobile scale.
        service_sites = [(-3.62, -2.30), (3.62, -2.30), (-3.70, 2.30), (3.70, 2.30)]
    else:
        service_sites = [
            (-3.55, -2.25), (-2.55, -2.28), (-1.55, -2.22),
            (1.55, -2.22), (2.55, -2.28), (3.55, -2.25),
            (-3.55, 2.25), (-1.65, 2.32), (1.65, 2.32), (3.55, 2.25),
        ]
    if district_id == "habitat":
        service_sites += [(-3.55, -.7), (3.55, -.7), (-3.55, .72), (3.55, .72)]
    for index, (bx, by) in enumerate(service_sites):
        width = .56 + (index % 3) * .10
        depth = .52 + (index % 2) * .12
        height = .82 + (index % 5) * (.27 if district_id == "habitat" else .19)
        block = prism(
            f"{district_id}_FacilityBlock_{index + 1}",
            footprint(bx, by, width, depth, .06),
            .3,
            height,
            architecture,
            root,
            .045,
            .78,
        )
        block["district_id"] = district_id
        crown = prism(
            f"{district_id}_FacilityCrown_{index + 1}",
            footprint(bx, by, width * .72, depth * .72, .04),
            height,
            height + .18,
            hull,
            root,
            .025,
            .72,
        )
        crown["district_id"] = district_id
        window = oriented_box(
            f"{district_id}_FacilityWindow_{index + 1}",
            bx - width * .32,
            bx + width * .32,
            by - depth * .54,
            by - depth * .48,
            height * .52,
            height * .52 + .09,
            window_glass,
            root,
            .008,
        )
        window["district_id"] = district_id
        window["render_role"] = "window_emissive"

    if district_id == "navigation":
        build_navigation_bridge_from_concept(
            root, architecture, hull, transit, subdued_systems, tunnel_glass, machinery, display_glass,
        )
    elif district_id == "survey":
        for x in (-2.4, 0, 2.4):
            mast = lathe(f"survey_SensorMast_{x:+.1f}", [(.3, .32), (2.3, .18), (3.4, .07)], 18, hull, root, .025)
            mast.location = (x, 1.55, 0)
            optics = lathe(f"survey_Optics_{x:+.1f}", [(3.25, .14), (3.42, .58), (3.55, .12)], 20, glass, root, .012)
            optics.location = (x, 1.55, 0)
    elif district_id == "mission_ops":
        build_mission_ops_from_concept(
            root, architecture, hull, transit, subdued_systems, tunnel_glass, machinery, display_glass,
        )
    elif district_id == "research":
        for x in (-2.5, -1.25, 1.25, 2.5):
            tube = lathe(f"research_ContainmentTube_{x:+.2f}", [(.32, .38), (2.25, .38), (2.55, .22)], 20, glass, root, .018)
            tube.location = (x, 1.65, 0)
    elif district_id == "engineering":
        for x in (-2.25, 0, 2.25):
            reactor = lathe(f"engineering_Reactor_{x:+.2f}", [(.3, .72), (.65, .9), (2.65, .58), (3.15, .28)], 24, hull, root, .035)
            reactor.location = (x, 1.55, 0)
            glow = segmented_annulus(f"engineering_ReactorLight_{x:+.2f}", .59, .72, 1.45, 1.58, 10, .48, local_systems, root, 2)
            glow.location = (x, 1.55, 0)
    elif district_id == "habitat":
        canopy = oriented_box("habitat_GardenCanopy", -1.7, 1.7, -.2, 1.75, .35, .92, green, root, .16)
        canopy["district_id"] = district_id
        medical = prism("habitat_MedicalCivicSpire", footprint(0, 2.15, .72, .72, .08), .3, 3.45, hull, root, .07, .82)
        medical["district_id"] = district_id
        for arm, (x0, x1, y0, y1, z0, z1) in enumerate((
            (-.82, .82, 2.08, 2.22, 2.55, 2.83),
            (-.14, .14, 1.38, 2.92, 2.55, 2.83),
        ), 1):
            cross = oriented_box(f"habitat_MedicalCross_{arm}", x0, x1, y0, y1, z0, z1, local_systems, root, .018)
            cross["district_id"] = district_id
    elif district_id == "factions":
        # Civic landmark architecture: a central accord rotunda, three linked
        # delegation towers and luminous cultural walls. The room should read
        # as a coalition institution, not a dark floor of generic equipment.
        rotunda = lathe(
            "factions_AccordRotunda",
            [(.30, 1.18), (.52, 1.42), (1.08, 1.28), (1.72, .92), (2.26, .42), (2.48, .16)],
            32,
            architecture,
            root,
            .045,
        )
        rotunda.location = (0, .78, 0)
        rotunda["district_id"] = district_id
        accord_light = segmented_annulus(
            "factions_AccordLight", 1.16, 1.43, .52, .68, 24, .58, local_systems, root, 3
        )
        accord_light.location = (0, .78, 0)
        for index, x in enumerate((-2.55, 0, 2.55), 1):
            tower = prism(
                f"factions_DelegationTower_{index}",
                footprint(x, 2.02, 1.18, .94, .18),
                .31,
                2.72 if index != 2 else 3.08,
                architecture,
                root,
                .07,
                .76,
            )
            tower["district_id"] = district_id
            window = oriented_box(
                f"factions_DelegationWindow_{index}",
                x - .42,
                x + .42,
                1.49,
                1.57,
                1.12,
                2.18,
                window_glass,
                root,
                .02,
            )
            window["district_id"] = district_id
            window["render_role"] = "window_emissive"
        tunnel_spans = [(-2.55, -.42), (.42, 2.55)]
        tunnel_floor_sections = []
        tunnel_frame_sections = []
        tunnel_glass_sections = []
        for x0, x1 in tunnel_spans:
            tunnel_floor_sections.append((footprint((x0 + x1) * .5, 2.31, x1 - x0, .46, 0), .92, 1.08, 1.0))
            for y in (2.08, 2.54):
                tunnel_frame_sections.extend((
                    (footprint((x0 + x1) * .5, y, x1 - x0, .055, 0), 1.08, 1.24, 1.0),
                    (footprint((x0 + x1) * .5, y, x1 - x0, .055, 0), 2.08, 2.16, 1.0),
                ))
            for x in (x0, x1):
                tunnel_frame_sections.append((footprint(x, 2.31, .055, .52, 0), 1.08, 2.16, 1.0))
            tunnel_glass_sections.extend((
                (footprint((x0 + x1) * .5, 2.105, x1 - x0 - .08, .035, 0), 1.16, 2.08, 1.0),
                (footprint((x0 + x1) * .5, 2.515, x1 - x0 - .08, .035, 0), 1.16, 2.08, 1.0),
                (footprint((x0 + x1) * .5, 2.31, x1 - x0 - .08, .39, 0), 2.08, 2.16, 1.0),
            ))
        tunnel_floor = compound_prisms("factions_AccordTunnelFloor", tunnel_floor_sections, transit, root, .025)
        tunnel_frame = compound_prisms("factions_AccordTunnelFrame", tunnel_frame_sections, architecture, root, .016)
        tunnel_panes = compound_prisms("factions_AccordTunnelGlazing", tunnel_glass_sections, tunnel_glass, root, .006)
        for object_ref, role in (
            (tunnel_floor, "interior_transit"),
            (tunnel_frame, "architectural_tunnel_frame"),
            (tunnel_panes, "architectural_glazing"),
        ):
            object_ref["district_id"] = district_id
            object_ref["render_role"] = role
    elif district_id == "hangar":
        build_strike_bay_from_concept(
            root,
            architecture,
            hull,
            deck,
            transit,
            subdued_systems,
            machinery,
            display_glass,
            tunnel_glass,
            faction_accents,
        )


def build_longitudinal_command_interior():
    reset_scene()
    hull = pbr_material("NEXUS-VII Interior Armor", "uga-interior", 2.8)
    pressure_wall = pbr_material("NEXUS-VII Pressure Wall Cladding", "uga-pressure-wall", .92)
    # Interior pressure decks must never reuse the exterior hull sheet. The
    # old assignment made floors, rooms, furniture and the outer ship share
    # one surface language and flattened the entire management layer.
    deck = pbr_material("NEXUS-VII Interior Deck Floor", "uga-deck-floor", .88)
    transit = pbr_material("NEXUS-VII Interior Transit Way", "uga-interior-transit", 1.12, emission_strength=1.18)
    transit["interior_only"] = True
    transit["source_resolution"] = "1024x1024"
    # Functional districts use their own authored material language. These
    # families are interior-only and deliberately separate from the exterior
    # hull, while related rooms share a coherent ship-wide design system.
    room_materials = {
        "command": pbr_material("NEXUS-VII Command Surfaces", "uga-command-navigation", 1.00),
        "navigation": pbr_material("NEXUS-VII Navigation Surfaces", "uga-command-navigation", 1.10),
        "survey": pbr_material("NEXUS-VII Survey Surfaces", "uga-science", 1.05),
        "research": pbr_material("NEXUS-VII Research Surfaces", "uga-science", .92),
        "mission_ops": pbr_material("NEXUS-VII Mission Operations Surfaces", "uga-operations", 1.00),
        "hangar": pbr_material("NEXUS-VII Strike Bay Surfaces", "uga-operations", 1.18),
        "logistics": pbr_material("NEXUS-VII Logistics Surfaces", "uga-operations", 1.08),
        "fabricator": pbr_material("NEXUS-VII Fabrication Surfaces", "uga-industrial", 1.00),
        "engineering": pbr_material("NEXUS-VII Engineering Surfaces", "uga-industrial", 1.12),
        "habitat": pbr_material("NEXUS-VII Habitat Medical Surfaces", "uga-civic-medical", .88),
        "factions": pbr_material("NEXUS-VII Coalition Embassy Surfaces", "uga-diplomatic", .96),
    }
    for district_id, material in room_materials.items():
        material["interior_only"] = True
        material["district_id"] = district_id
        material["source_resolution"] = "1024x1024"
    glass = simple_material("NEXUS-VII Instrument Glass", (.025, .10, .13, 1), .15, .16, (.01, .28, .38, 1), 1.05)
    machinery = simple_material(
        "NEXUS-VII Console Machinery",
        (.018, .028, .040, 1),
        .62,
        .52,
        (.002, .010, .016, 1),
        .06,
    )
    display_glass = simple_material(
        "NEXUS-VII Tactical Display Glass",
        (.010, .050, .064, 1),
        .18,
        .24,
        (.008, .20, .25, 1),
        .32,
    )
    window_glass = pbr_material(
        "NEXUS-VII Authored Window Glazing",
        "uga-window-glazing",
        1.0,
        emission_strength=2.45,
    )
    window_glass["render_role"] = "window_emissive"
    tunnel_glass = translucent_pbr_material(
        "NEXUS-VII Transit Pressure Glass",
        "uga-window-glazing",
        1.0,
        .34,
        .72,
    )
    tunnel_glass["interior_only"] = True
    tunnel_glass["render_role"] = "architectural_glazing"
    cyan = simple_material("NEXUS-VII Cyan Systems", (.015, .16, .20, 1), .25, .24, (.01, .78, 1.0, 1), 1.0)
    amber = simple_material("NEXUS-VII Command Amber", (.18, .08, .01, 1), .40, .30, (1.0, .34, .035, 1), 1.12)
    violet = simple_material("NEXUS-VII Syndicate Violet", (.055, .018, .085, 1), .36, .28, (.44, .12, .72, 1), .52)
    green = simple_material("NEXUS-VII Habitat Biolight", (.025, .16, .08, 1), .18, .38, (.04, .48, .17, 1), .72)
    root = add_empty(
        "NEXUS_VII_LONGITUDINAL_CUTAWAY",
        (0, 0, 0),
        extras={
            "asset_role": "uga_command",
            "ship_identity": "nexus_vii",
            "version": 6,
            "visual_pass": "strike-expedition-bay-shared-deployer-v2",
            "concept_master": "assets/source/concepts/nexus-vii-v1/nexus-vii-master-concept-v1.png",
            "concept_master_sha256": "d34291dd94d39761d998195e59c76f185cc5956f5b1c7f2b1242865799e6abed",
            "concept_sections": "assets/source/concepts/nexus-vii-v1/command-navigation-mission-ops-concept-v1.png",
            "concept_sections_sha256": "7936f0152be10c8b3fb4f19cd46bdeb7c5ef99cf4531a6557ccd9b3d640c7417",
            "concept_strike_bay": "assets/source/concepts/nexus-vii-v1/strike-expedition-bay-shared-base-deployer-concept-v2.png",
            "concept_strike_bay_sha256": "76391c07c3570cd3216fcaf7ed7ad0450650edf2e8288aa727f8c5579ff18a2a",
        },
    )

    oriented_box("NexusVII_Keel", -24, 29, -4.4, 4.4, -.75, -.05, hull, root, .12)
    oriented_box("NexusVII_MidDeck", -23, 27.5, -4.1, 4.1, 4.65, 5.05, deck, root, .08)
    oriented_box("NexusVII_CeilingSpine", -22, 27, -3.8, 4.0, 9.65, 10.35, hull, root, .12)
    for section, x0 in enumerate((-23, -14, -5, 4, 13, 22)):
        oriented_box(f"NexusVII_FarHullPanel_{section + 1}", x0, min(29, x0 + 8.7), 3.45, 4.45, -.05, 9.75, hull, root, .08)
        for deck_z in (1.75, 6.7):
            ribbon = oriented_box(f"NexusVII_WindowRibbon_{section + 1}_{int(deck_z)}", x0 + .35, min(28.6, x0 + 8.35), 3.30, 3.48, deck_z, deck_z + .34, window_glass, root, .02)
            ribbon["render_role"] = "window_emissive"

    for index, x in enumerate((-18.0, -8.0, 2.0, 12.0, 22.0)):
        rib = open_ring_rib(f"UGA_Ship_GravityRing_{index + 1}", x, 8.2, 4.75, hull, root)
        rib["model_role"] = "gravity_ring"
        guide = open_ring_rib(f"UGA_Ship_GravityGuide_{index + 1}", x + .04, 8.72, 4.75, cyan, root)
        guide["model_role"] = "gravity_ring_light"

    command = add_empty("DISTRICT_command", (-28.5, 0, .15), root, {"district_id": "command", "label": "Command Core", "selectable": True})
    add_empty("FOCUS_command", (0, -.45, 1.72), command, {"district_id": "command", "camera_distance": 24.0, "camera_height": 13.0})
    oriented_box("Command_PressureDeck", -5.0, 4.8, -3.5, 3.4, 0, .34, deck, command, .10)
    oriented_box("Command_FarBulkhead", -5.0, 4.8, 2.9, 3.4, .3, 4.85, pressure_wall, command, .08)
    oriented_box("Command_PortBulkhead", -5.0, -4.64, -3.45, 3.22, .3, 4.72, pressure_wall, command, .06)
    oriented_box("Command_StarboardBulkhead", 4.44, 4.8, -3.45, 3.22, .3, 4.72, pressure_wall, command, .06)
    oriented_box("Command_CeilingServiceBeam", -4.60, 4.40, 2.48, 3.02, 4.38, 4.76, pressure_wall, command, .04)
    command_route = compound_walkway_network(
        "command_TransitNetwork",
        [(footprint(0, -3.13, .96, .58, 0), .34, .47, 1.0)],
        [],
        transit,
        command,
        .018,
    )
    command_route["district_id"] = "command"
    command_route["render_role"] = "interior_transit"
    command_ring = segmented_annulus("Command_TransitConcourse", 2.90, 3.12, .34, .45, 24, .72, transit, command, 3)
    command_ring["district_id"] = "command"
    command_ring["render_role"] = "interior_transit"
    build_command_core_from_concept(
        command,
        room_materials["command"],
        pressure_wall,
        transit,
        cyan,
        amber,
        tunnel_glass,
        machinery,
        display_glass,
    )

    districts = [
        ("navigation", "Navigation Bridge", "autopilot", -23.2, 5.15, .48),
        ("survey", "Survey Lab", "long_range_scan", -18.0, 5.05),
        ("mission_ops", "Mission Operations", "ground_link", -23.2, 0.15, .48),
        ("research", "Research Directorate", "science", -8.0, 5.05),
        ("fabricator", "Fabricator", "industry", 2.0, 5.05),
        ("engineering", "Engineering & Drive", "reactor", 12.0, 5.05),
        ("habitat", "Habitat & Medical", "civilian", -18.0, 0.0),
        ("factions", "Faction Quarters", "diplomacy", -8.0, 0.0),
        ("hangar", "Deployment Hangar", "flight_deck", 2.0, 0.0),
        ("logistics", "Logistics & Cargo", "freight", 12.0, 0.0),
    ]
    for district_spec in districts:
        district_id, label, activity, x, z, *scale_override = district_spec
        droot = add_empty(f"DISTRICT_{district_id}", (x, 0, z), root)
        district_material = room_materials[district_id]
        district_systems = amber if district_id == "mission_ops" else cyan
        # Thin route/readout geometry over the dark display material can share
        # the district system shader without adding two global variants.
        district_subdued_systems = district_systems
        build_ship_compartment(
            droot,
            district_id,
            label,
            activity,
            deck,
            pressure_wall,
            district_material,
            district_systems,
            glass,
            green,
            transit,
            window_glass,
            tunnel_glass,
            machinery,
            display_glass,
            district_subdued_systems,
            (cyan, amber, violet),
        )
        if scale_override:
            droot.scale = (scale_override[0], scale_override[0], scale_override[0])

    oriented_box("NexusVII_AftDriveTunnel", 16.5, 29.5, 3.1, 4.15, .15, 9.4, hull, root, .10)
    for z in (2.5, 7.0):
        for y in (-1.7, 1.7):
            throat = lathe(f"NexusVII_InteriorDriveThroat_{z}_{y}", [(22.0, 1.2), (26.5, 1.7), (29.5, .9)], 30, hull, root, .045)
            throat.rotation_euler[1] = math.radians(90)
            throat.location = (0, y, z)
            glow = lathe(f"NexusVII_InteriorDriveGlow_{z}_{y}", [(28.4, .82), (29.5, .58), (30.2, .12)], 24, cyan, root, .018)
            glow.rotation_euler[1] = math.radians(90)
            glow.location = (0, y, z)

    for lane, z in enumerate((1.0, 5.75)):
        for index in range(14):
            x = -21.0 + index * 3.25
            pod = oriented_box(f"TransitPod_{lane}_{index:02d}", x - .28, x + .28, -3.05, -2.68, z, z + .24, hull, root, .018)
            pod["activity"] = "linear_traffic"
            pod["path_min"] = -21.0
            pod["path_max"] = 23.0
            pod["path_phase"] = index / 14
            pod["path_speed"] = .55 + (index % 4) * .12

    reproject_material_meshes_metric(root, [deck, pressure_wall, transit, tunnel_glass, *room_materials.values()], cube_size=2.0)

    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    SOURCE_DIR.mkdir(parents=True, exist_ok=True)
    atomic_save_blend(SOURCE_DIR / "uga-command-cutaway.blend")
    atomic_export_glb(MODEL_DIR / "uga-command-cutaway.glb", export_yup=False)


def build_civilization_ship_exterior():
    reset_scene()
    hull = pbr_material("UGA Civilization Ship Hull", "uga-hull", 4.6)
    interior = pbr_material("UGA Civilization Ship Recesses", "uga-interior", 3.2)
    glass = simple_material("UGA Habitat Glass", (.018, .10, .13, 1), .25, .14, (.02, .52, .72, 1), 2.7)
    engine = simple_material("UGA Drive Plasma", (.01, .18, .22, 1), .2, .18, (.02, .85, 1.0, 1), 5.8)
    exhaust_outer = translucent_emissive_material("UGA Drive Exhaust Outer", (.01, .22, .34, .22), (.01, .48, 1.0, 1), 4.2)
    exhaust_core = translucent_emissive_material("UGA Drive Exhaust Core", (.18, .74, 1.0, .48), (.20, .82, 1.0, 1), 8.5)
    amber = simple_material("UGA Navigation Amber", (.18, .07, .01, 1), .4, .25, (1.0, .3, .025, 1), 1.6)
    root = add_empty("UGA_CIVILIZATION_SHIP", (0, 0, 0), extras={"asset_role": "player_ship", "ship_identity": "uga_civilization_ship", "version": 2})
    # Authoring profiles run along local Z; rotate the exported hierarchy so
    # the ship presents its full length along X in the runtime and previews.
    root.rotation_euler[1] = math.radians(90)

    sections = [
        (-34, .35, .28), (-31.5, 3.4, 1.8), (-27, 7.4, 3.2), (-20, 10.6, 4.0),
        (-10, 12.8, 4.9), (2, 13.6, 5.2), (14, 12.2, 5.0), (24, 9.6, 4.5),
        (31, 7.2, 4.1), (36, 5.8, 3.7),
    ]
    body = loft("NexusVII_PrimaryHull", sections, 24, hull, root, .16, .028)
    body["model_role"] = "authored_hull"

    # Layered prow armor and ventral keel use independent authored profiles.
    loft("NexusVII_ArmoredProw", [(-35, .18, .16), (-32, 3.2, 1.2), (-25, 8.0, 1.65), (-16, 9.8, 1.45)], 20, interior, root, .12, -.025)
    keel = loft("NexusVII_VentralKeel", [(-23, 1.2, .7), (-8, 2.0, 1.0), (14, 2.4, 1.2), (31, 1.7, .8)], 16, interior, root, .10, .04)
    keel.location.y = -4.2

    # Swept flight/deployment wings: custom multi-angle footprints with taper.
    for side in (-1, 1):
        pts = [(-20, side * 5.2), (-10, side * 11.7), (7, side * 18.0), (24, side * 14.0), (29, side * 7.2), (8, side * 9.8)]
        wing = prism(f"NexusVII_{'Port' if side < 0 else 'Starboard'}Wing", pts, -.72, .72, hull, root, .14, .90)
        wing.rotation_euler[0] = math.radians(90)
        wing["model_role"] = "deployment_wing"
        inset = [(x * .98, y * .92) for x, y in pts]
        trim = prism(f"NexusVII_{'Port' if side < 0 else 'Starboard'}WingInset", inset, .73, 1.08, interior, root, .07, .92)
        trim.rotation_euler[0] = math.radians(90)
        # Raised service rails split the broad wing planes into mechanical
        # layers without duplicating the complete wing mesh.
        rail_pts = [
            (-16, side * 6.3), (-7, side * 10.8), (8, side * 15.2),
            (21, side * 12.8), (24, side * 10.5), (7, side * 11.0),
        ]
        rail = prism(
            f"NexusVII_{'Port' if side < 0 else 'Starboard'}WingServiceRail",
            rail_pts,
            1.09,
            1.42,
            interior,
            root,
            .045,
            .91,
        )
        rail.rotation_euler[0] = math.radians(90)
        rail["model_role"] = "service_spine"

    # Five full gravity frames reproduce the NEXUS-VII silhouette and expose a
    # narrower inhabited energy guide along each armored rib. They project
    # beyond the hull instead of collapsing into decorative surface bands.
    for i, z in enumerate((-15, -6, 3, 12, 21)):
        frame = lathe(
            f"NexusVII_GravityRingFrame_{i + 1}",
            [(z - .72, 13.5), (z, 14.45), (z + .72, 13.5)],
            72,
            interior,
            root,
            .06,
        )
        frame.scale.y = .68
        frame["model_role"] = "gravity_ring_frame"
        ring = lathe(
            f"NexusVII_HabitatBand_{i + 1}",
            [(z - .22, 14.48), (z, 14.78), (z + .22, 14.48)],
            72,
            glass,
            root,
            .025,
        )
        ring.scale.y = .68
        ring["model_role"] = "habitat_ring"
        ring["upgrade_channel"] = f"habitat_{i + 1}"

    # Command ridge and sensor crown.
    ridge_points = [(-17, -2.8), (16, -2.3), (24, -1.1), (17, 2.3), (-12, 3.0), (-22, 1.1)]
    ridge = prism("NexusVII_CommandRidge", ridge_points, 4.2, 7.1, hull, root, .14, .76)
    ridge.rotation_euler[0] = math.radians(90)
    sensor = lathe("NexusVII_SensorCrown", [(4.5, 2.5), (6.8, 1.8), (9.2, .72), (12.0, .12)], 32, glass, root, .06)
    sensor.location.z = -4.0

    # Longitudinal dorsal and ventral spines add readable parallax and break up
    # the original single-mass silhouette. Their low-sided authored lofts cost
    # far less than subdivision while retaining bevel and PBR surface detail.
    spine_sections = [(-27, .28, .20), (-20, .54, .34), (-7, .68, .42), (8, .64, .40), (22, .46, .30), (30, .20, .14)]
    for deck_side, y in (("Dorsal", 4.65), ("Ventral", -4.25)):
        for lane, x in enumerate((-8.6, -5.7, 5.7, 8.6)):
            spine = loft(
                f"NexusVII_{deck_side}ServiceSpine_{lane + 1}",
                spine_sections,
                12,
                interior if lane % 2 else hull,
                root,
                .045,
                (lane - 1.5) * .018,
            )
            spine.location = (x, y, 0)
            spine["model_role"] = "service_spine"
            for station, z in enumerate((-18, -4, 11, 24)):
                housing = loft(
                    f"NexusVII_{deck_side}SpineHousing_{lane + 1}_{station + 1}",
                    [(z - .62, .42, .28), (z, .76, .48), (z + .62, .42, .28)],
                    12,
                    hull if station % 2 else interior,
                    root,
                    .035,
                    station * .025,
                )
                housing.location = (x, y, 0)
                housing["model_role"] = "service_housing"

    # Narrow structural collars introduce an armor cadence between the habitat
    # bands; each is an authored profile rather than a cylinder primitive.
    for rib, z in enumerate((-23.5, -16.0, -7.0, 4.0, 14.5, 25.5)):
        armor_rib = loft(
            f"NexusVII_StructuralRib_{rib + 1}",
            [(z - .34, 10.2, 4.25), (z, 10.85, 4.62), (z + .34, 10.2, 4.25)],
            24,
            interior,
            root,
            .05,
            rib * .012,
        )
        armor_rib["model_role"] = "armor_rib"

    # Two civilization-scale primary drives and two smaller vectoring drives
    # match the NEXUS-VII rear elevation. Deep apertures, segmented luminous
    # collars, and nested modeled exhaust volumes remain readable in orbit;
    # particles are only supporting ion turbulence, never the engine artwork.
    drive_positions = [(-5.0, -1.75, 3.25), (5.0, -1.75, 3.25), (-9.0, -1.0, 1.65), (9.0, -1.0, 1.65)]
    for i, (x, y, radius) in enumerate(drive_positions):
        bell = lathe(f"NexusVII_DriveBell_{i + 1}", [(29.5, radius * .78), (32.0, radius), (35.2, radius * .92), (37.4, radius * .62), (38.2, radius * .48)], 40, interior, root, .08)
        bell.location.x = x
        bell.location.y = y
        core = lathe(f"NexusVII_DriveCore_{i + 1}", [(36.9, radius * .68), (37.8, radius * .58), (38.8, radius * .20)], 36, engine, root, .025)
        core.location.x = x
        core.location.y = y
        collar = segmented_annulus(f"NexusVII_EngineGlow_{i + 1}", radius * .61, radius * .79, 36.75, 37.15, 18, .58, engine, root, 3)
        collar.location.x = x
        collar.location.y = y
        outer_plume = lathe(
            f"NexusVII_ThrusterPlumeOuter_{i + 1}",
            [(38.0, radius * .62), (40.0, radius * .72), (45.0, radius * .42), (51.0, radius * .08)],
            32,
            exhaust_outer,
            root,
            0,
        )
        outer_plume.location.x = x
        outer_plume.location.y = y
        inner_plume = lathe(
            f"NexusVII_ThrusterPlumeCore_{i + 1}",
            [(38.1, radius * .36), (40.5, radius * .42), (45.5, radius * .20), (49.0, radius * .025)],
            28,
            exhaust_core,
            root,
            0,
        )
        inner_plume.location.x = x
        inner_plume.location.y = y

    # Armor rails and window ribbons are true raised geometry.
    for band in range(7):
        z = -24 + band * 8.0
        rail = loft(f"NexusVII_ArmorRail_{band + 1}", [(z - 1.8, 10.0, 4.5), (z, 11.0, 4.7), (z + 1.8, 10.0, 4.5)], 24, interior if band % 2 else hull, root, .045, band * .015)
        rail.scale.x = 1.006
        rail.scale.y = 1.006

    add_empty("FOCUS_nexus_vii", (0, 0, 0), root, {"camera_distance": 88.0, "camera_height": 28.0})
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    SOURCE_DIR.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE_DIR / "nexus-vii-civilization-ship.blend"))
    bpy.ops.export_scene.gltf(
        filepath=str(MODEL_DIR / "nexus-vii-civilization-ship.glb"),
        export_format="GLB",
        export_apply=True,
        export_extras=True,
        export_yup=True,
        export_cameras=False,
        export_lights=False,
    )


def main():
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    if "--command-only" not in args:
        build_civilization_ship_exterior()
    build_longitudinal_command_interior()
    print(f"Exported UGA assets to {MODEL_DIR}")


if __name__ == "__main__":
    main()
