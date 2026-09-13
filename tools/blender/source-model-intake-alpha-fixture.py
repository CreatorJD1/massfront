"""Build fail-closed alpha cases for source-model-intake-alpha.selftest.mjs."""

import bpy
import os
import sys


if "--" not in sys.argv or len(sys.argv[sys.argv.index("--") + 1 :]) != 1:
    raise SystemExit("expected -- OUTPUT.glb")
output_path = sys.argv[sys.argv.index("--") + 1]

bpy.ops.wm.read_factory_settings(use_empty=True)


def principled_material(name):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    material.surface_render_method = "BLENDED"
    tree = material.node_tree
    tree.nodes.clear()
    output = tree.nodes.new("ShaderNodeOutputMaterial")
    bsdf = tree.nodes.new("ShaderNodeBsdfPrincipled")
    tree.links.new(bsdf.outputs["BSDF"], output.inputs["Surface"])
    return material, tree, bsdf


def rgba_image(name, alphas):
    image = bpy.data.images.new(name, width=2, height=2, alpha=True)
    pixels = []
    for index, alpha in enumerate(alphas):
        pixels.extend((0.15 + index * 0.1, 0.35, 0.65, alpha))
    image.pixels = pixels
    image.pack()
    return image


def image_alpha_material(name, alphas):
    material, tree, bsdf = principled_material(name)
    image = rgba_image(name + " Texture", alphas)
    texture = tree.nodes.new("ShaderNodeTexImage")
    texture.image = image
    tree.links.new(texture.outputs["Color"], bsdf.inputs["Base Color"])
    tree.links.new(texture.outputs["Alpha"], bsdf.inputs["Alpha"])
    return material


def add_cube(name, x, material):
    bpy.ops.mesh.primitive_cube_add(location=(x, 0.0, 1.0), scale=(0.8, 0.8, 1.0))
    obj = bpy.context.object
    obj.name = name
    obj.data.name = name + " Mesh"
    obj.data.materials.append(material)
    return obj


opaque = image_alpha_material("Opaque Blend", [1.0, 1.0, 1.0, 1.0])
add_cube("Opaque Blend Cube", -4.0, opaque)

texture_alpha = image_alpha_material("Genuine Texture Alpha", [1.0, 0.25, 1.0, 1.0])
add_cube("Texture Alpha Cube", -2.0, texture_alpha)

factor_alpha, _, factor_bsdf = principled_material("Genuine Factor Alpha")
factor_bsdf.inputs["Alpha"].default_value = 0.45
add_cube("Factor Alpha Cube", 0.0, factor_alpha)

vertex_alpha, vertex_tree, vertex_bsdf = principled_material("Vertex Alpha")
vertex_cube = add_cube("Vertex Alpha Cube", 2.0, vertex_alpha)
color = vertex_cube.data.color_attributes.new(name="Fixture Vertex Alpha", type="FLOAT_COLOR", domain="CORNER")
for item in color.data:
    item.color = (0.75, 0.9, 1.0, 0.5)
vertex_cube.data.color_attributes.active_color = color
vertex_node = vertex_tree.nodes.new("ShaderNodeVertexColor")
vertex_node.layer_name = color.name
vertex_tree.links.new(vertex_node.outputs["Color"], vertex_bsdf.inputs["Base Color"])
vertex_tree.links.new(vertex_node.outputs["Alpha"], vertex_bsdf.inputs["Alpha"])

procedural, procedural_tree, procedural_bsdf = principled_material("Procedural Alpha")
noise = procedural_tree.nodes.new("ShaderNodeTexNoise")
procedural_tree.links.new(noise.outputs["Fac"], procedural_bsdf.inputs["Alpha"])
add_cube("Procedural Alpha Cube", 4.0, procedural)

os.makedirs(os.path.dirname(output_path), exist_ok=True)
bpy.ops.export_scene.gltf(
    filepath=output_path,
    export_format="GLB",
    export_materials="EXPORT",
    export_cameras=False,
    export_lights=False,
    export_yup=True,
)
