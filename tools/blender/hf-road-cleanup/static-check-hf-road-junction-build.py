"""Fast fail-closed topology check for build-hf-road-junctions.py.

This deliberately skips bevel application, GLB export and rendering.  The
authoritative build still runs under Blender 5.2 and applies all modifiers;
this pass exists so polygon-volume intersections are rejected in seconds
instead of after the evidence pipeline has already spent minutes exporting.
"""

import bpy
import importlib.util
import json
from pathlib import Path


SCRIPT = Path(__file__).with_name("build-hf-road-junctions.py")
SPEC = importlib.util.spec_from_file_location("mf_hf_road_junction_builder", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)

MODULE.bevel_object = lambda obj, width, segments: None
MODULE.clear_previous_generation()
master = bpy.data.collections.new(MODULE.MASTER_COLLECTION)
bpy.context.scene.collection.children.link(master)
materials = MODULE.create_materials()
pieces = [MODULE.create_piece(master, spec, materials) for spec in MODULE.PIECES]

summary = {
    "status": "PASS",
    "schema": MODULE.SCHEMA,
    "pieces": [
        {
            "id": piece["id"],
            "lodIntersections": [
                lod["intersectionAccounting"]["unexpectedIntersections"]
                for lod in piece["lods"]
            ],
        }
        for piece in pieces
    ],
}
print(json.dumps(summary, separators=(",", ":")))
