"""Create compressed runtime derivatives from locked GLB masters in Blender."""
import bpy
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "assets" / "models"
TARGET = ROOT / "assets" / "runtime" / "models"
TARGET.mkdir(parents=True, exist_ok=True)

for name in ("massfront-showcase-contacts", "nexus-vii-civilization-ship", "uga-command-cutaway"):
    source = SOURCE / f"{name}.glb"
    target = TARGET / f"{name}.glb"
    bpy.ops.wm.read_factory_settings(use_empty=True)
    result = bpy.ops.import_scene.gltf(filepath=str(source))
    if "FINISHED" not in result:
        raise RuntimeError(f"import failed for {name}: {result}")
    result = bpy.ops.export_scene.gltf(
        filepath=str(target), export_format="GLB", export_animations=False,
        # District/focus identity lives in glTF node extras. Blender imports
        # those values as custom properties, but omits them on export unless
        # this flag is explicit; losing them made the compressed ship load as
        # geometry while silently disabling most management rooms.
        export_extras=True,
        export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=8,
        export_draco_position_quantization=14, export_draco_normal_quantization=10,
        export_draco_texcoord_quantization=12, export_yup=True, export_apply=False,
    )
    if "FINISHED" not in result:
        raise RuntimeError(f"export failed for {name}: {result}")
    print(f"RUNTIME_DRACO name={name} source={source.stat().st_size} runtime={target.stat().st_size}")
