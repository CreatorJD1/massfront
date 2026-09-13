"""Clean same-winding raster risk and cubic-unwrap the Stage 10 model pack.

The canonical inputs are never overwritten. Each source GLB is imported into
memory, only accepted same-winding sub-0.5 mm overlap coverage is clipped from
the derived scene, and the result is UV-authored below tmp/stage10-model-repair.
No model is regenerated and no canonical vertex, topology, material, or byte is
written. Opposite winding remains deliberately outside this culled-PBR repair.

If derived cleanup makes a mesh fail the frozen tiled-UV Jacobian, that mesh
is restored from an in-memory source snapshot and re-unwrapped. Canonical
bytes stay locked. A post-export proof miss quarantines the model instead of
aborting the pack.

Every render mesh receives two deliberate UV channels:

  UV_GEN     packed, non-overlapping 0-1 per-face bake atlas
  UVMap_Tile deterministic world-space cubic mapping for reusable RTS materials

Run with Blender 5.2 or newer:

  blender --background --factory-startup \
    --python tools/blender/repair-stage10-model-pack.py -- [options]
"""

import argparse
import bmesh
import hashlib
import json
import math
import re
import struct
import sys
import time
import traceback
from pathlib import Path

import bpy


ROOT = Path(__file__).resolve().parents[2]
BLENDER_TOOLS = Path(__file__).resolve().parent
PIPELINE_SCRIPT = Path(__file__).resolve()
RASTER_CLEANUP_SCRIPT = BLENDER_TOOLS / "stage10_raster_cleanup.py"
if str(BLENDER_TOOLS) not in sys.path:
    sys.path.insert(0, str(BLENDER_TOOLS))
try:
    from stage10_raster_cleanup import (
        acceptance_contract as raster_acceptance_contract,
        assert_material_semantic_names,
        cleanup_same_winding_raster_risk,
        dependency_contract as raster_dependency_contract,
    )
except Exception as dependency_error:
    print("MF_STAGE10_REPAIR_DEPENDENCY_ERROR=" + repr(dependency_error), flush=True)
    raise SystemExit(3) from dependency_error


DEFAULT_CATALOG = ROOT / "tmp/stage10-model-review/catalog.json"
DEFAULT_OUTPUT = ROOT / "tmp/stage10-model-repair"
TILE_METRES = 4.0
PACK_MARGIN = 0.012
PIPELINE_VERSION = 18
PIPELINE_MODE = "DERIVED_SAME_WINDING_RASTER_CLEAN_AND_UV"
ITEM_SCHEMA = "MassfrontStage10ModelRepairV3"
SUMMARY_SCHEMA = "MassfrontStage10ModelRepairSummaryV3"
TILED_UV_METRIC_METHOD = (
    "WORLD_TRIANGLE_TANGENT_JACOBIAN_PROJECTED_WORLD_AREA_FLOOR"
)
TILED_UV_ANCHOR_METHOD = "PER_POLYGON_INTEGRAL_REPEAT_TILE_ANCHOR"
TILED_UV_PROOF_SCHEMA = "MassfrontStage10TiledUvConstructionProofV1"
TILED_UV_AGGREGATE_PROOF_SCHEMA = "MassfrontStage10TiledUvAggregateProofV1"
FLOAT32_UNIT_ROUNDOFF = 2.0 ** -24
# A 4x4 affine row is evaluated as four homogeneous products and three sums.
# Record the full operation count so the post-export cancellation bound cannot
# silently become a final-result ULP heuristic again.
FLOAT32_AFFINE_DOT_OPERATION_COUNT = 7
FLOAT32_AFFINE_DOT_GAMMA = (
    FLOAT32_AFFINE_DOT_OPERATION_COUNT * FLOAT32_UNIT_ROUNDOFF
    / (1.0 - FLOAT32_AFFINE_DOT_OPERATION_COUNT * FLOAT32_UNIT_ROUNDOFF)
)
POST_EXPORT_INFERENCE_BOUND_METHOD = (
    "HIERARCHICAL_FLOAT32_AFFINE_FORWARD_ERROR_PLUS_UV_AND_GLTF_V_FLIP_ULPS"
)
POST_EXPORT_INFERENCE_BOUND_FORMULA = (
    "((PROPAGATED_INPUT_ULPS+COEFFICIENT_ULPS+"
    "GAMMA_7_TIMES_SUM_ABS_AFFINE_TERMS+COMPOSITION_REALIZATION_DELTA)"
    "/TILE_METRES)+PROJECTED_UV_ULP+STORED_UV_ULP+OPTIONAL_GLTF_V_FLIP_ULP"
)
METADATA_BLOCKED_KEYS = set()
USER_WITHDRAWN_REASON = "USER_WITHDRAWN_PERSONAL_REWORK"
USER_WITHDRAWN_KEYS = set()
EXPECTED_REPAIR_LOCKED_KEYS = set()
EXPECTED_WORLD_MODULES = 320
EXPECTED_SPLINE_MODELS = 7
EXPECTED_CATALOG_CANDIDATES = 327
EXPECTED_PIPELINE_EXCLUSIONS = 0
EXPECTED_FULL_SCHEDULE = 327
EXPECTED_CATALOG_UNIQUE_NONEMPTY_MATERIALS = 149
EXPECTED_CATALOG_UNIQUE_MATERIALS_WITH_UNNAMED = 150
EXPECTED_CATALOG_UNNAMED_MATERIAL_SLOTS = 60
CUBIC_STRETCH_LIMIT = math.sqrt(3.0) + 0.01
# Blender's float32 glTF round-trip reaches 0.30% on source-locked near-sliver
# triangles even after the explicit sliver exclusion. A 0.5% ceiling remains
# visually sub-pixel at the authored texture scale while avoiding false repair
# failures from serialization noise; ordinary faces measure orders lower.
TEXEL_SCALE_ERROR_LIMIT = 0.005
# Triangle quality is double-area divided by squared edge energy (an
# equilateral triangle is ~0.144). Values below 1e-4 are needle/sliver source
# geometry: their area is visually negligible, while float32 glTF coordinates
# make a max-only Jacobian statistic numerically unstable.
SOURCE_SLIVER_QUALITY_LIMIT = 1.0e-4
PROCESSED_STATUSES = (
    "READY_FOR_TEXTURE_GENERATION",
    "UV_READY_GEOMETRY_REVIEW",
    "RECONSTRUCTION_REQUIRED",
)
# Pre-withdrawal v18 used the same geometry/UV/cleanup contract. Item reports
# with this hash stay resume-eligible so dropping the two Caldris Spline sites
# does not force a 328-model reprocess.
RESUME_COMPATIBLE_SCRIPT_SHA256 = {
    "9a662316b1b437c82904e178f5fd51662ec8fb98dcee3d7c45717b0f071dbaaf",
    "5d97a7efafe79983155048ab2634987b07d62ff2170a6e7830db51e9e6d52cc3",
    "d065b3a710115583baec6988bb275814d8d4969314f116128596879f88b16a4a",
}


def log(message):
    print("MF_STAGE10_REPAIR: " + str(message), flush=True)


def arguments():
    parser = argparse.ArgumentParser()
    parser.add_argument("--catalog", type=Path, default=DEFAULT_CATALOG)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--family", action="append", default=[])
    parser.add_argument("--only", action="append", default=[])
    parser.add_argument("--include-spline", action="store_true")
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--force", action="store_true")
    values = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    return parser.parse_args(values)


def sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def stable_json_sha256(value):
    payload = json.dumps(
        value, ensure_ascii=False, sort_keys=True, separators=(",", ":"),
    ).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def glb_material_names(path):
    """Read original material names without Blender's importer renaming them."""
    data = path.read_bytes()
    if len(data) < 20:
        raise RuntimeError("truncated GLB while reading material inventory: " + str(path))
    magic, version, declared_length = struct.unpack_from("<4sII", data, 0)
    if magic != b"glTF" or version != 2 or declared_length != len(data):
        raise RuntimeError(
            "invalid GLB header while reading material inventory: %s" % path
        )
    offset = 12
    document = None
    while offset + 8 <= len(data):
        chunk_length, chunk_type = struct.unpack_from("<II", data, offset)
        offset += 8
        chunk_end = offset + chunk_length
        if chunk_end > len(data):
            raise RuntimeError("truncated GLB chunk in material inventory: " + str(path))
        if chunk_type == 0x4E4F534A and document is None:
            json_bytes = data[offset:chunk_end].rstrip(b"\x00 \t\r\n")
            document = json.loads(json_bytes.decode("utf-8"))
        offset = chunk_end
    if offset != len(data) or document is None:
        raise RuntimeError("GLB has no valid JSON chunk: " + str(path))
    return [str(material.get("name") or "").strip()
            for material in document.get("materials", [])]


def material_semantic_preflight(entries, full_catalog=False):
    """Validate every selected source material before processing item one."""
    models = []
    all_names = []
    for entry in entries:
        names = glb_material_names(entry["source"])
        source_hash = sha256(entry["source"])
        inventory_payload = {
            "key": entry["key"],
            "sourceSha256": source_hash,
            "materialNames": names,
        }
        semantic_contract = assert_material_semantic_names(names)
        models.append({
            **inventory_payload,
            "materialSlotCount": len(names),
            "materialInventorySha256": stable_json_sha256(inventory_payload),
            "semanticContract": semantic_contract,
        })
        all_names.extend(names)
    aggregate = assert_material_semantic_names(all_names)
    coverage_payload = [
        {
            "key": model["key"],
            "sourceSha256": model["sourceSha256"],
            "materialNames": model["materialNames"],
        }
        for model in models
    ]
    aggregate.update({
        "preflightScope": "EVERY_SELECTED_CANONICAL_GLB_BEFORE_ITEM_ONE",
        "selectedModelCount": len(models),
        "selectedMaterialSlotCount": len(all_names),
        "materialCoverageSha256": stable_json_sha256(coverage_payload),
        "allSelectedModelsPassed": all(
            model["semanticContract"].get("passed") is True for model in models
        ),
        "fullCatalogExpectedUniqueNonemptyNames": (
            EXPECTED_CATALOG_UNIQUE_NONEMPTY_MATERIALS if full_catalog else None
        ),
        "fullCatalogExpectedUniqueIncludingUnnamed": (
            EXPECTED_CATALOG_UNIQUE_MATERIALS_WITH_UNNAMED if full_catalog else None
        ),
        "fullCatalogExpectedUnnamedSlots": (
            EXPECTED_CATALOG_UNNAMED_MATERIAL_SLOTS if full_catalog else None
        ),
        "fullCatalogCountsMatched": (
            not full_catalog or (
                aggregate["uniqueNonemptyNames"]
                == EXPECTED_CATALOG_UNIQUE_NONEMPTY_MATERIALS
                and aggregate["uniqueIncludingUnnamed"]
                == EXPECTED_CATALOG_UNIQUE_MATERIALS_WITH_UNNAMED
                and aggregate["unnamedSlots"]
                == EXPECTED_CATALOG_UNNAMED_MATERIAL_SLOTS
            )
        ),
    })
    aggregate["passed"] = (
        aggregate["passed"]
        and aggregate["allSelectedModelsPassed"]
        and aggregate["fullCatalogCountsMatched"]
    )
    if not aggregate["passed"]:
        raise RuntimeError(
            "Stage 10 catalog material semantic preflight mismatch: "
            + json.dumps(aggregate, separators=(",", ":"))
        )
    return aggregate, {model["key"]: model for model in models}


def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def mesh_objects():
    return [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]


DERIVED_EXCLUDED_ROLES = {
    "evidence_only", "proof_only", "studio_only", "preview_only", "review_only",
}
NON_RENDER_ROLES = {
    "collision", "simplified_collision", "navigation_proxy", "walkable_deck",
    *DERIVED_EXCLUDED_ROLES,
}


def metadata_tokens(obj):
    values = [obj.name]
    if obj.data:
        values.append(obj.data.name)
        values.extend(material.name for material in obj.data.materials if material)
    values.extend(collection.name for collection in obj.users_collection)
    parent = obj.parent
    while parent:
        values.append(parent.name)
        parent = parent.parent
    return set(filter(None, re.split(r"[^A-Z0-9]+", " ".join(values).upper())))


def derived_exclusion_reason(obj):
    """Return why a preview-only mesh must not enter either derived GLB."""
    if obj.type != "MESH":
        return None
    if obj.data is None or not obj.data.vertices or not obj.data.polygons:
        return "EMPTY_OR_ZERO_FACE_MESH"
    if obj.hide_render:
        return "HIDDEN_RENDER_OBJECT"
    if "__mf_src_snap" in obj.name or (obj.data and "__mf_src_snap" in obj.data.name):
        return "SOURCE_SNAPSHOT"
    role = str(obj.get("mf_role") or "").lower()
    tokens = metadata_tokens(obj)
    if (role in DERIVED_EXCLUDED_ROLES or obj.get("mf_evidence") or obj.get("mf_proof")
            or obj.get("mf_evidence_only") or obj.get("mf_proof_only")
            or obj.get("mf_studio_only")):
        return "EVIDENCE_OR_PROOF_ONLY"
    if "FLOOR" in tokens and tokens.intersection({"STUDIO", "SHADOW", "EVIDENCE", "REVIEW"}):
        return "STUDIO_OR_SHADOW_FLOOR"
    if "STUDIO" in tokens:
        return "STUDIO_ONLY"
    if "EVIDENCE" in tokens or "PROOF" in tokens:
        return "EVIDENCE_OR_PROOF_NAME"
    return None


def render_exclusion_reason(obj):
    derived_reason = derived_exclusion_reason(obj)
    if derived_reason:
        return derived_reason
    role = str(obj.get("mf_role") or "").lower()
    upper = obj.name.upper()
    if (obj.get("mf_collision") or "COLLISION" in upper
            or upper.endswith("_COL") or "_COLLISION" in upper):
        return "COLLISION"
    if upper.endswith("_NAV") or role in NON_RENDER_ROLES:
        return role.upper() if role else "NAVIGATION_PROXY"
    return None


def render_meshes():
    return [obj for obj in mesh_objects() if render_exclusion_reason(obj) is None]


def world_bounds(objects):
    mins = [math.inf, math.inf, math.inf]
    maxs = [-math.inf, -math.inf, -math.inf]
    for obj in objects:
        for corner in obj.bound_box:
            point = obj.matrix_world @ type(obj.location)(corner)
            for axis in range(3):
                mins[axis] = min(mins[axis], point[axis])
                maxs[axis] = max(maxs[axis], point[axis])
    return {
        "min": [round(v, 6) for v in mins],
        "max": [round(v, 6) for v in maxs],
        "dimensions": [round(maxs[i] - mins[i], 6) for i in range(3)],
    }


def bmesh_topology(bm):
    return {
        "vertices": len(bm.verts),
        "edges": len(bm.edges),
        "faces": len(bm.faces),
        "boundaryEdges": sum(1 for edge in bm.edges if edge.is_boundary),
        "nonManifoldEdges": sum(1 for edge in bm.edges if not edge.is_manifold),
        "looseEdges": sum(1 for edge in bm.edges if not edge.link_faces),
    }


def topology(obj):
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    result = bmesh_topology(bm)
    bm.free()
    return result


def activate(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.hide_set(False)
    obj.hide_viewport = False
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def geometry_signature(obj):
    """Hash positions, face loops, winding, materials, transforms, and normals."""
    mesh = obj.data
    digest = hashlib.sha256()
    digest.update(struct.pack("<III", len(mesh.vertices), len(mesh.edges), len(mesh.polygons)))
    digest.update(struct.pack("<I", len(mesh.materials)))
    for material in mesh.materials:
        name = (material.name_full if material else "").encode("utf-8")
        digest.update(struct.pack("<I", len(name)))
        digest.update(name)
    for row in obj.matrix_world:
        digest.update(struct.pack("<4d", *[float(value) for value in row]))
    for vertex in mesh.vertices:
        digest.update(struct.pack("<3d", *[float(value) for value in vertex.co]))
    for edge in mesh.edges:
        digest.update(struct.pack("<2I", *edge.vertices))
    for polygon in mesh.polygons:
        digest.update(struct.pack(
            "<II?", len(polygon.vertices), polygon.material_index, polygon.use_smooth,
        ))
        for vertex_index in polygon.vertices:
            digest.update(struct.pack("<I", vertex_index))
    try:
        normals = mesh.corner_normals
        digest.update(struct.pack("<I", len(normals)))
        for normal in normals:
            digest.update(struct.pack("<3d", *[float(value) for value in normal.vector]))
    except Exception:
        digest.update(struct.pack("<I", len(mesh.vertices)))
        for vertex in mesh.vertices:
            digest.update(struct.pack("<3d", *[float(value) for value in vertex.normal]))
    return digest.hexdigest()


def coincident_topology(obj, merge_dist):
    """Read-only connectivity estimate that joins coincident GLB seam vertices."""
    mesh = obj.data
    precision = max(4, min(9, int(-math.log10(merge_dist)) + 1))
    canonical = {}
    vertex_ids = []
    for vertex in mesh.vertices:
        key = tuple(round(float(value), precision) for value in vertex.co)
        if key not in canonical:
            canonical[key] = len(canonical)
        vertex_ids.append(canonical[key])
    edge_faces = {}
    for polygon in mesh.polygons:
        vertices = [vertex_ids[index] for index in polygon.vertices]
        for index, first in enumerate(vertices):
            second = vertices[(index + 1) % len(vertices)]
            key = (first, second) if first <= second else (second, first)
            edge_faces[key] = edge_faces.get(key, 0) + 1
    loose = set()
    for edge in mesh.edges:
        first, second = (vertex_ids[index] for index in edge.vertices)
        key = (first, second) if first <= second else (second, first)
        if key not in edge_faces:
            loose.add(key)
    all_edges = set(edge_faces) | loose
    return {
        "vertices": len(canonical),
        "edges": len(all_edges),
        "faces": len(mesh.polygons),
        "boundaryEdges": sum(1 for count in edge_faces.values() if count == 1),
        "nonManifoldEdges": (
            sum(1 for count in edge_faces.values() if count != 2) + len(loose)
        ),
        "looseEdges": len(loose),
        "coordinatePrecisionDecimals": precision,
    }


def audit_geometry(obj):
    """Measure connectivity without mutating the export mesh."""
    before = topology(obj)
    signature = geometry_signature(obj)
    diagonal = max(float(obj.dimensions.length), 1.0)
    merge_dist = min(0.001, max(0.000001, diagonal * 1.0e-7))
    coincident_audit = coincident_topology(obj, merge_dist)
    return {
        "mode": "AUDIT_ONLY_TOPOLOGY_PRESERVED",
        "mergeDistance": merge_dist,
        "sliverFacesRemoved": 0,
        "postTriangulationSliverFacesRemoved": 0,
        "junctionEdgesSplit": 0,
        "holesFilled": 0,
        "before": before,
        "after": dict(before),
        "coincidentTopologyAudit": coincident_audit,
        "topologyPreserved": True,
        "geometrySignatureBefore": signature,
        "geometrySignatureAfter": signature,
    }


def activate_many(objects):
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.hide_set(False)
        obj.hide_viewport = False
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]


def packed_bake_uvs(objects):
    """Pack each render mesh into its own non-overlapping bake atlas.

    LODs are alternate draws, not simultaneous islands in one texture sheet.
    Blender's multi-object pack also packs every object independently and then
    overlays those nominal 0-1 results, so treating the result as one joint
    atlas produced false cross-LOD overlap failures.  PBR uses UVMap_Tile; the
    packed channel remains an injective per-mesh bake/future-authoring channel.
    The visible repeating PBR textures use the separate cubic UVMap_Tile
    channel, whose world-space Jacobian is measured below for stretching.
    """
    for obj in objects:
        while obj.data.uv_layers:
            obj.data.uv_layers.remove(obj.data.uv_layers[0])
        obj.data.uv_layers.new(name="UV_GEN")
        obj.data.uv_layers.active = obj.data.uv_layers["UV_GEN"]
    face_count = sum(len(obj.data.polygons) for obj in objects)
    pack_margin = max(0.001, min(PACK_MARGIN, 0.25 / math.sqrt(max(1, face_count))))
    for obj in objects:
        activate_many([obj])
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.select_all(action="SELECT")
        bpy.ops.uv.cube_project(
            cube_size=1.0,
            correct_aspect=True,
            clip_to_bounds=False,
            scale_to_bounds=False,
        )
        # Cube projection supplies stable seams, then lightmap packing places
        # every face independently. Source models contain intentionally stacked
        # or coincident shells that ordinary island packing leaves overlapping;
        # a per-face bake atlas is the only truthful injective auxiliary channel.
        bpy.ops.uv.lightmap_pack(
            PREF_CONTEXT="ALL_FACES",
            PREF_PACK_IN_ONE=True,
            PREF_NEW_UVLAYER=False,
            PREF_BOX_DIV=12,
            PREF_MARGIN_DIV=max(0.001, min(1.0, pack_margin * 10.0)),
        )
        bpy.ops.object.mode_set(mode="OBJECT")
    return pack_margin


def uv_overlap_stats(objects, layer_name="UV_GEN"):
    """Use Blender's overlap operator independently for each alternate mesh.

    A multi-object overlap query compares LOD0 against LOD1/LOD2 even though
    those meshes are never sampled as one atlas.  That made clean per-LOD UVs
    look overlapping.  The relevant injectivity contract is within each mesh.
    """
    for obj in objects:
        layer = obj.data.uv_layers.get(layer_name)
        if layer is None:
            raise RuntimeError("missing %s on %s before overlap audit" % (layer_name, obj.name))
        obj.data.uv_layers.active = layer
    previous_sync = bpy.context.scene.tool_settings.use_uv_select_sync
    bpy.context.scene.tool_settings.use_uv_select_sync = False
    try:
        counts = {}
        for obj in objects:
            activate_many([obj])
            bpy.ops.object.mode_set(mode="EDIT")
            bpy.ops.mesh.select_all(action="SELECT")
            bpy.ops.uv.select_all(action="DESELECT")
            bpy.ops.uv.select_overlap(extend=False)
            bpy.ops.object.mode_set(mode="OBJECT")
            # Blender 5.2 stores UV selection as anonymous mesh attributes; the
            # older BMLoopUV.select accessor no longer exists.
            face_selection = obj.data.attributes.get(".uv_select_face")
            loop_selection = obj.data.attributes.get(".uv_select_vert")
            overlap_faces = sum(1 for value in face_selection.data if value.value) if face_selection else 0
            overlap_loops = sum(1 for value in loop_selection.data if value.value) if loop_selection else 0
            counts[obj.name_full] = {
                "overlapFaces": overlap_faces,
                "overlapLoops": overlap_loops,
            }
        return counts
    finally:
        if bpy.context.object and bpy.context.object.mode != "OBJECT":
            bpy.ops.object.mode_set(mode="OBJECT")
        bpy.context.scene.tool_settings.use_uv_select_sync = previous_sync


def float32_value(value):
    return struct.unpack("<f", struct.pack("<f", float(value)))[0]


def gltf_v_roundtrip_float32(value):
    """Model Blender's two float32 `1-v` operations around a GLB round-trip."""
    stored = float32_value(value)
    exported = float32_value(1.0 - stored)
    return float32_value(1.0 - exported)


def integral_tile_anchor(value):
    anchor = math.floor(value)
    if not isinstance(anchor, int):
        raise RuntimeError("UV tile anchor is not an integer")
    return anchor


def require_integral_tile_anchor(anchor):
    if isinstance(anchor, bool) or not isinstance(anchor, int):
        raise ValueError("UV tile anchor must be an exact integer")
    return anchor


def projected_uv_coordinates(point, axis, flip):
    if axis == 0:
        u, v = point.y, point.z
    elif axis == 1:
        u, v = point.x, point.z
    else:
        u, v = point.x, point.y
    if flip:
        u = -u
    scale = 1.0 / TILE_METRES
    return float(u) * scale, float(v) * scale


def projected_double_area_floor(expected_area_scale, world_floor=1.0e-12):
    """Express the unchanged world double-area floor in projected units."""
    if not math.isfinite(expected_area_scale) or expected_area_scale <= 0.0:
        raise ValueError("expected projected area scale must be positive and finite")
    if world_floor != 1.0e-12:
        raise ValueError("world double-area floor is frozen at 1e-12")
    return world_floor * expected_area_scale


def uv_area_passes_projected_world_floor(
        double_uv_area, expected_area_scale, world_floor=1.0e-12):
    if not math.isfinite(double_uv_area) or double_uv_area <= 0.0:
        return False
    return double_uv_area > projected_double_area_floor(
        expected_area_scale, world_floor,
    )


def area_scale_relative_error(area_scale, expected_area_scale):
    if expected_area_scale <= 0.0:
        return math.inf
    return abs(area_scale / expected_area_scale - 1.0)


def area_scale_error_passes(area_scale, expected_area_scale):
    return (
        math.isfinite(area_scale)
        and area_scale_relative_error(area_scale, expected_area_scale)
        <= TEXEL_SCALE_ERROR_LIMIT
    )


def affine_float32_chain_forward_error(matrices, local_coordinates):
    """Bound one float32 affine hierarchy without losing cancellation terms."""
    values = [float(local_coordinates[index]) for index in range(3)]
    # The source and reimported artifacts may each realize a stored component
    # at adjacent float32 values, so use one full ULP rather than a half-ULP
    # single-rounding bound.
    errors = [float32_ulp(value) for value in values]
    for matrix in matrices:
        next_values = []
        next_errors = []
        for row in range(3):
            coefficients = [float(matrix[row][axis]) for axis in range(3)]
            translation = float(matrix[row][3])
            products = [coefficients[axis] * values[axis] for axis in range(3)]
            value = sum(products) + translation
            propagated_input = sum(
                abs(coefficients[axis]) * errors[axis]
                for axis in range(3)
            )
            coefficient_storage = sum(
                float32_ulp(coefficients[axis])
                * (abs(values[axis]) + errors[axis])
                for axis in range(3)
            ) + float32_ulp(translation)
            absolute_affine_terms = sum(abs(item) for item in products) + abs(
                translation
            )
            arithmetic_rounding = FLOAT32_AFFINE_DOT_GAMMA * (
                absolute_affine_terms
                + propagated_input
                + coefficient_storage
            )
            next_values.append(value)
            next_errors.append(math.nextafter(
                propagated_input + coefficient_storage + arithmetic_rounding,
                math.inf,
            ))
        values = next_values
        errors = next_errors
    return values, errors


def object_affine_float32_forward_error(obj, local_coordinates, world_point):
    # glTF preserves node hierarchy. Walk child-to-root local matrices so a
    # rotated/scaled parent and child translation that nearly cancel still
    # contribute their pre-cancellation terms to the forward-error proof.
    matrices = []
    cursor = obj
    while cursor is not None:
        matrices.append(cursor.matrix_local)
        cursor = cursor.parent
    sequential_values, sequential_errors = affine_float32_chain_forward_error(
        matrices, local_coordinates,
    )
    bounds = []
    for component in range(3):
        # Blender also exposes the composed matrix_world realization used by
        # the actual projection. Bind the measured evaluation-path delta in
        # addition to the hierarchy forward error; it is not an acceptance
        # tolerance and cannot hide a per-loop UV inconsistency.
        composition_delta = abs(
            sequential_values[component] - float(world_point[component])
        )
        bounds.append(math.nextafter(
            sequential_errors[component] + composition_delta,
            math.inf,
        ))
    return tuple(bounds), len(matrices)


def tiled_polygon_reference(obj, polygon):
    mesh = obj.data
    normal_matrix = obj.matrix_world.to_3x3().inverted_safe().transposed()
    # Vertex positions below are in world space, so the dominant projection
    # axis must use a world-space normal too. Retained Spline models contain
    # rotated nodes; mixing local normals with world positions maps them on the
    # wrong plane.
    normal = normal_matrix @ polygon.normal
    if normal.length_squared < 1.0e-12:
        return None
    normal.normalize()
    axis = max(range(3), key=lambda item: abs(normal[item]))
    flip = normal[axis] < 0.0
    loop_indices = list(polygon.loop_indices)
    projected = []
    projected_bounds = []
    component_rows = ((1, 2), (0, 2), (0, 1))[axis]
    for loop_index in loop_indices:
        vertex = mesh.vertices[mesh.loops[loop_index].vertex_index]
        point = obj.matrix_world @ vertex.co
        projected.append(projected_uv_coordinates(point, axis, flip))
        world_component_bounds, hierarchy_depth = (
            object_affine_float32_forward_error(obj, vertex.co, point)
        )
        component_bounds = []
        for component_row in component_rows:
            component_bounds.append(math.nextafter(
                world_component_bounds[component_row] / TILE_METRES,
                math.inf,
            ))
        projected_bounds.append(tuple(component_bounds))
    anchor = (
        integral_tile_anchor(projected[0][0]),
        integral_tile_anchor(projected[0][1]),
    )
    anchored = [
        (coordinate[0] - anchor[0], coordinate[1] - anchor[1])
        for coordinate in projected
    ]
    return {
        "axis": axis,
        "flip": flip,
        "loopIndices": loop_indices,
        "projected": projected,
        "projectedFloat32Bounds": projected_bounds,
        "postExportAffineHierarchyDepth": hierarchy_depth,
        "anchor": anchor,
        "anchored": anchored,
    }


def circular_unit_distance(first, second):
    delta = abs((first % 1.0) - (second % 1.0))
    return min(delta, abs(1.0 - delta))


def expected_uv_storage(value, component, storage_realization):
    if storage_realization == "BLENDER_FLOAT32_UV_LAYER":
        return float32_value(value)
    if storage_realization == "BLENDER_GLTF_FLOAT32_V_FLIP_ROUNDTRIP":
        return gltf_v_roundtrip_float32(value) if component == 1 else float32_value(value)
    raise ValueError("unknown tiled UV storage realization: " + storage_realization)


def float32_ulp(value):
    magnitude = abs(float(value))
    if not math.isfinite(magnitude):
        return math.inf
    if magnitude < 2.0 ** -126:
        return 2.0 ** -149
    return 2.0 ** (math.floor(math.log2(magnitude)) - 23)


def post_export_offset_representational_bound(
        projected, stored, component, projected_geometry_bound=0.0):
    # The geometry term is the pre-cancellation affine forward-error bound.
    # Add only the actual UV projection/storage and (for V) exporter flip ULPs.
    bound = projected_geometry_bound + float32_ulp(projected) + float32_ulp(stored)
    if component == 1:
        bound += float32_ulp(1.0 - stored)
    return math.nextafter(bound, math.inf)


def infer_post_export_polygon_anchor(projected, actual, projected_bounds=None):
    if not projected or len(projected) != len(actual):
        return {
            "passed": False,
            "anchor": (0, 0),
            "ambiguityViolations": 1,
            "boundViolations": 1,
            "loopConsistencyViolations": 1,
            "componentBounds": [],
        }
    if projected_bounds is None:
        projected_bounds = [[0.0, 0.0] for _ in projected]
    if len(projected_bounds) != len(projected):
        raise ValueError("projected float32 bounds do not match polygon loops")
    anchors = []
    component_bounds = [[0.0, 0.0] for _ in projected]
    ambiguity_violations = 0
    bound_violations = 0
    loop_consistency_violations = 0
    violation_samples = []
    for component in range(2):
        candidates = []
        for index in range(len(projected)):
            residual = projected[index][component] - actual[index][component]
            candidate = int(round(residual))
            error = abs(residual - candidate)
            bound = post_export_offset_representational_bound(
                projected[index][component], actual[index][component], component,
                projected_bounds[index][component],
            )
            component_bounds[index][component] = bound
            candidates.append(candidate)
            if error > bound:
                bound_violations += 1
                if len(violation_samples) < 8:
                    violation_samples.append({
                        "loopIndex": index,
                        "component": component,
                        "projected": projected[index][component],
                        "stored": actual[index][component],
                        "residual": residual,
                        "nearestInteger": candidate,
                        "error": error,
                        "representationalBound": bound,
                        "projectedGeometryBound": projected_bounds[index][component],
                        "projectedFloat32Ulp": float32_ulp(
                            projected[index][component]
                        ),
                        "storedFloat32Ulp": float32_ulp(actual[index][component]),
                    })
            if error + bound >= 0.5:
                ambiguity_violations += 1
        unique = set(candidates)
        if len(unique) != 1:
            loop_consistency_violations += 1
            anchors.append(candidates[0])
        else:
            anchors.append(next(iter(unique)))
    return {
        "passed": (
            ambiguity_violations == 0
            and bound_violations == 0
            and loop_consistency_violations == 0
        ),
        "anchor": tuple(anchors),
        "ambiguityViolations": ambiguity_violations,
        "boundViolations": bound_violations,
        "loopConsistencyViolations": loop_consistency_violations,
        "componentBounds": component_bounds,
        "violationSamples": violation_samples,
    }


def tiled_uv_anchor_proof(
        obj, layer_name="UVMap_Tile",
        storage_realization="BLENDER_FLOAT32_UV_LAYER"):
    mesh = obj.data
    layer = mesh.uv_layers.get(layer_name)
    if layer is None:
        return {
            "schema": TILED_UV_PROOF_SCHEMA,
            "method": TILED_UV_ANCHOR_METHOD,
            "present": False,
            "passed": False,
        }
    polygon_count = 0
    skipped_degenerate_polygons = 0
    nonzero_anchor_polygons = 0
    loop_count = 0
    edge_component_count = 0
    nonintegral_anchor_violations = 0
    storage_realization_violations = 0
    modulo_phase_violations = 0
    derivative_bound_violations = 0
    inferred_anchor_polygons = 0
    inferred_anchor_ambiguity_violations = 0
    inferred_anchor_bound_violations = 0
    inferred_anchor_loop_consistency_violations = 0
    inferred_anchor_violation_samples = []
    max_post_export_affine_hierarchy_depth = 0
    max_phase_error = 0.0
    max_phase_error_bound = 0.0
    max_derivative_error = 0.0
    max_derivative_error_bound = 0.0
    for polygon in mesh.polygons:
        reference = tiled_polygon_reference(obj, polygon)
        if reference is None:
            skipped_degenerate_polygons += 1
            continue
        polygon_count += 1
        max_post_export_affine_hierarchy_depth = max(
            max_post_export_affine_hierarchy_depth,
            reference["postExportAffineHierarchyDepth"],
        )
        actual = []
        for loop_index in reference["loopIndices"]:
            values = layer.data[loop_index].uv
            actual.append((float(values.x), float(values.y)))
        inferred_component_bounds = None
        if storage_realization == "BLENDER_GLTF_FLOAT32_V_FLIP_ROUNDTRIP":
            inference = infer_post_export_polygon_anchor(
                reference["projected"], actual,
                reference["projectedFloat32Bounds"],
            )
            inferred_anchor_polygons += 1
            inferred_anchor_ambiguity_violations += inference["ambiguityViolations"]
            inferred_anchor_bound_violations += inference["boundViolations"]
            inferred_anchor_loop_consistency_violations += inference[
                "loopConsistencyViolations"
            ]
            for sample in inference["violationSamples"]:
                if len(inferred_anchor_violation_samples) < 12:
                    inferred_anchor_violation_samples.append({
                        "polygonIndex": polygon.index,
                        **sample,
                    })
            reference["anchor"] = inference["anchor"]
            reference["anchored"] = [
                (
                    coordinate[0] - inference["anchor"][0],
                    coordinate[1] - inference["anchor"][1],
                )
                for coordinate in reference["projected"]
            ]
            inferred_component_bounds = inference["componentBounds"]
        anchor = reference["anchor"]
        try:
            require_integral_tile_anchor(anchor[0])
            require_integral_tile_anchor(anchor[1])
        except ValueError:
            nonintegral_anchor_violations += 1
        if anchor != (0, 0):
            nonzero_anchor_polygons += 1
        endpoint_error_bounds = []
        for item_index, loop_index in enumerate(reference["loopIndices"]):
            loop_count += 1
            actual_value = actual[item_index]
            component_bounds = []
            for component in range(2):
                intended = reference["anchored"][item_index][component]
                expected = expected_uv_storage(
                    intended, component, storage_realization,
                )
                endpoint_error = abs(actual_value[component] - intended)
                if inferred_component_bounds is None:
                    endpoint_bound = math.nextafter(endpoint_error, math.inf)
                    if actual_value[component] != expected:
                        storage_realization_violations += 1
                else:
                    endpoint_bound = inferred_component_bounds[item_index][component]
                    if endpoint_error > endpoint_bound:
                        storage_realization_violations += 1
                component_bounds.append(endpoint_bound)
                phase_error = circular_unit_distance(
                    actual_value[component],
                    # The exact-integer anchor proves the projected and
                    # anchored references are modulo-one equivalent. Compare
                    # storage to the small anchored reference so `% 1` does
                    # not add a second rounding step at world-coordinate scale.
                    intended,
                )
                phase_bound = math.nextafter(
                    endpoint_bound
                    + math.ulp(actual_value[component])
                    + math.ulp(intended),
                    math.inf,
                )
                max_phase_error = max(max_phase_error, phase_error)
                max_phase_error_bound = max(max_phase_error_bound, phase_bound)
                if phase_error > phase_bound:
                    modulo_phase_violations += 1
            endpoint_error_bounds.append(component_bounds)
        pair_indices = set()
        count = len(reference["loopIndices"])
        for index in range(count):
            pair_indices.add(tuple(sorted((index, (index + 1) % count))))
        for index in range(1, count):
            pair_indices.add((0, index))
        for first, second in pair_indices:
            for component in range(2):
                intended_delta = (
                    reference["anchored"][second][component]
                    - reference["anchored"][first][component]
                )
                actual_delta = actual[second][component] - actual[first][component]
                derivative_error = abs(actual_delta - intended_delta)
                derivative_bound = math.nextafter(
                    endpoint_error_bounds[first][component]
                    + endpoint_error_bounds[second][component],
                    math.inf,
                ) + math.ulp(actual_delta) + math.ulp(intended_delta)
                derivative_bound = math.nextafter(
                    derivative_bound,
                    math.inf,
                )
                edge_component_count += 1
                max_derivative_error = max(max_derivative_error, derivative_error)
                max_derivative_error_bound = max(
                    max_derivative_error_bound, derivative_bound,
                )
                if derivative_error > derivative_bound:
                    derivative_bound_violations += 1
    passed = (
        nonintegral_anchor_violations == 0
        and storage_realization_violations == 0
        and modulo_phase_violations == 0
        and derivative_bound_violations == 0
        and inferred_anchor_ambiguity_violations == 0
        and inferred_anchor_bound_violations == 0
        and inferred_anchor_loop_consistency_violations == 0
    )
    proof = {
        "schema": TILED_UV_PROOF_SCHEMA,
        "method": TILED_UV_ANCHOR_METHOD,
        "storageRealization": storage_realization,
        "postExportAnchorInferenceMethod": (
            "ALL_LOOP_PROJECTED_MINUS_STORED_UNIQUE_INTEGER_WITH_FLOAT32_ULP_BOUND"
            if storage_realization == "BLENDER_GLTF_FLOAT32_V_FLIP_ROUNDTRIP"
            else "NOT_APPLICABLE_PRE_EXPORT_DETERMINISTIC_FLOOR_FIRST_LOOP"
        ),
        "postExportInferenceBoundMethod": (
            POST_EXPORT_INFERENCE_BOUND_METHOD
            if storage_realization == "BLENDER_GLTF_FLOAT32_V_FLIP_ROUNDTRIP"
            else "EXACT_PRE_EXPORT_FLOAT32_STORAGE_REPLAY"
        ),
        "postExportInferenceBoundFormula": (
            POST_EXPORT_INFERENCE_BOUND_FORMULA
            if storage_realization == "BLENDER_GLTF_FLOAT32_V_FLIP_ROUNDTRIP"
            else "NOT_APPLICABLE_PRE_EXPORT"
        ),
        "postExportAffineDotOperationCount": (
            FLOAT32_AFFINE_DOT_OPERATION_COUNT
            if storage_realization == "BLENDER_GLTF_FLOAT32_V_FLIP_ROUNDTRIP"
            else 0
        ),
        "postExportAffineUnitRoundoff": (
            FLOAT32_UNIT_ROUNDOFF
            if storage_realization == "BLENDER_GLTF_FLOAT32_V_FLIP_ROUNDTRIP"
            else 0.0
        ),
        "postExportMaxAffineHierarchyDepth": (
            max_post_export_affine_hierarchy_depth
            if storage_realization == "BLENDER_GLTF_FLOAT32_V_FLIP_ROUNDTRIP"
            else 0
        ),
        "present": True,
        "passed": passed,
        "tileMetres": TILE_METRES,
        "anchorUnits": "INTEGER_UV_REPEAT_TILES",
        "polygonCount": polygon_count,
        "skippedDegeneratePolygons": skipped_degenerate_polygons,
        "nonzeroAnchorPolygons": nonzero_anchor_polygons,
        "loopCount": loop_count,
        "edgeComponentCount": edge_component_count,
        "allOffsetsIntegral": nonintegral_anchor_violations == 0,
        "integralTranslationPreservesModuloOneByConstruction": (
            nonintegral_anchor_violations == 0
        ),
        "nonIntegralAnchorViolations": nonintegral_anchor_violations,
        "storedCoordinatesMatchFloat32Realization": storage_realization_violations == 0,
        "storageRealizationViolations": storage_realization_violations,
        "postExportInferredAnchorPolygons": inferred_anchor_polygons,
        "postExportInferredAnchorAmbiguityViolations": (
            inferred_anchor_ambiguity_violations
        ),
        "postExportInferredAnchorBoundViolations": inferred_anchor_bound_violations,
        "postExportInferredAnchorLoopConsistencyViolations": (
            inferred_anchor_loop_consistency_violations
        ),
        "postExportInferredAnchorViolationSamples": (
            inferred_anchor_violation_samples
        ),
        "moduloOnePhasePreserved": modulo_phase_violations == 0,
        "moduloPhaseViolations": modulo_phase_violations,
        "maxModuloPhaseError": max_phase_error,
        "maxModuloPhaseErrorBound": max_phase_error_bound,
        "derivativesWithinStoredFloatBounds": derivative_bound_violations == 0,
        "derivativeBoundViolations": derivative_bound_violations,
        "maxDerivativeComponentError": max_derivative_error,
        "maxDerivativeComponentErrorBound": max_derivative_error_bound,
    }
    proof["canonicalProofSha256"] = stable_json_sha256(proof)
    return proof


def tiled_cubic_uv(obj):
    mesh = obj.data
    layer = mesh.uv_layers.get("UVMap_Tile") or mesh.uv_layers.new(name="UVMap_Tile")
    for polygon in mesh.polygons:
        reference = tiled_polygon_reference(obj, polygon)
        if reference is None:
            continue
        for item_index, loop_index in enumerate(reference["loopIndices"]):
            layer.data[loop_index].uv = reference["anchored"][item_index]
    mesh.uv_layers.active = mesh.uv_layers.get("UV_GEN")
    proof = tiled_uv_anchor_proof(obj)
    if not proof.get("passed"):
        raise RuntimeError(
            "integral tiled UV anchor proof failed for %s: %s" % (
                obj.name, json.dumps(proof, separators=(",", ":")),
            )
        )
    return proof


def uv_stats(obj, layer_name="UV_GEN"):
    mesh = obj.data
    layer = mesh.uv_layers.get(layer_name)
    if layer is None:
        return {"present": False}
    coords = [value.uv for value in layer.data]
    finite = all(math.isfinite(point.x) and math.isfinite(point.y) for point in coords)
    if not coords:
        return {"present": True, "finite": finite, "loops": 0}
    minimum = [min(point.x for point in coords), min(point.y for point in coords)]
    maximum = [max(point.x for point in coords), max(point.y for point in coords)]
    epsilon = 0.0001
    in_unit = minimum[0] >= -epsilon and minimum[1] >= -epsilon and maximum[0] <= 1.0 + epsilon and maximum[1] <= 1.0 + epsilon
    zero_area = 0
    tiny_area = 0
    source_degenerate_faces = 0
    source_sliver_faces = 0
    source_degenerate_uv_faces = 0
    diagonal = max(float(obj.dimensions.length), 1.0)
    world_area_epsilon = max(1.0e-14, diagonal * diagonal * 1.0e-12)
    for polygon in obj.data.polygons:
        points = [layer.data[index].uv for index in polygon.loop_indices]
        area = 0.0
        for index, point in enumerate(points):
            next_point = points[(index + 1) % len(points)]
            area += point.x * next_point.y - next_point.x * point.y
        uv_area = abs(area) * 0.5
        loop_indices = list(polygon.loop_indices)
        world_area = 0.0
        world_points = []
        if len(loop_indices) >= 3:
            origin_vertex = mesh.vertices[mesh.loops[loop_indices[0]].vertex_index]
            origin = obj.matrix_world @ origin_vertex.co
            world_points = [
                obj.matrix_world @ mesh.vertices[mesh.loops[loop_index].vertex_index].co
                for loop_index in loop_indices
            ]
            for index in range(1, len(loop_indices) - 1):
                vertex_a = mesh.vertices[mesh.loops[loop_indices[index]].vertex_index]
                vertex_b = mesh.vertices[mesh.loops[loop_indices[index + 1]].vertex_index]
                edge_a = (obj.matrix_world @ vertex_a.co) - origin
                edge_b = (obj.matrix_world @ vertex_b.co) - origin
                world_area += edge_a.cross(edge_b).length * 0.5
        edge_energy = sum(
            (world_points[(index + 1) % len(world_points)] - point).length_squared
            for index, point in enumerate(world_points)
        ) if world_points else 0.0
        polygon_quality = (world_area * 2.0) / max(edge_energy, 1.0e-20)
        source_sliver = polygon_quality <= SOURCE_SLIVER_QUALITY_LIMIT
        source_degenerate = world_area <= world_area_epsilon or source_sliver
        if source_degenerate:
            source_degenerate_faces += 1
            if source_sliver:
                source_sliver_faces += 1
            if uv_area < 1.0e-16:
                source_degenerate_uv_faces += 1
        else:
            if uv_area < 1.0e-16:
                zero_area += 1
            if uv_area < 1.0e-10:
                tiny_area += 1
    return {
        "present": True,
        "finite": finite,
        "loops": len(coords),
        "min": [round(value, 7) for value in minimum],
        "max": [round(value, 7) for value in maximum],
        "insideUnitSquare": in_unit,
        "zeroAreaFaces": zero_area,
        "tinyAreaFaces": tiny_area,
        "sourceDegenerateFaces": source_degenerate_faces,
        "sourceSliverFaces": source_sliver_faces,
        "sourceDegenerateUvFaces": source_degenerate_uv_faces,
        "worldAreaEpsilon": world_area_epsilon,
    }


def percentile(values, quantile):
    ordered = sorted(values)
    if not ordered:
        return None
    position = (len(ordered) - 1) * quantile
    lower = int(math.floor(position))
    upper = int(math.ceil(position))
    if lower == upper:
        return ordered[lower]
    fraction = position - lower
    return ordered[lower] * (1.0 - fraction) + ordered[upper] * fraction


def metric_distribution(values):
    if not values:
        return {"min": None, "p50": None, "p95": None, "p99": None, "max": None}
    return {
        "min": round(min(values), 7),
        "p50": round(percentile(values, 0.50), 7),
        "p95": round(percentile(values, 0.95), 7),
        "p99": round(percentile(values, 0.99), 7),
        "max": round(max(values), 7),
    }


def tiled_uv_metrics(obj, layer_name="UVMap_Tile"):
    """Measure the world-metre-to-tiled-UV Jacobian without changing geometry."""
    mesh = obj.data
    layer = mesh.uv_layers.get(layer_name)
    if layer is None:
        return {"present": False, "valid": False}
    normal_matrix = obj.matrix_world.to_3x3().inverted_safe().transposed()
    stretches = []
    area_scales = []
    area_scale_errors = []
    max_scale_errors = []
    measured = 0
    degenerate_world = 0
    zero_uv_area = 0
    exact_zero_uv_area = 0
    projected_floor_failures = 0
    projected_floor_evaluations = 0
    projected_floors = []
    nonfinite = 0
    epsilon = 1.0e-12
    for polygon in mesh.polygons:
        loop_indices = list(polygon.loop_indices)
        if len(loop_indices) < 3:
            continue
        face_normal = normal_matrix @ polygon.normal
        if face_normal.length_squared <= epsilon:
            degenerate_world += max(1, len(loop_indices) - 2)
            continue
        face_normal.normalize()
        projection_axis = max(range(3), key=lambda axis: abs(face_normal[axis]))
        origin_loop = loop_indices[0]
        origin_vertex = mesh.vertices[mesh.loops[origin_loop].vertex_index]
        origin_world = obj.matrix_world @ origin_vertex.co
        origin_uv = layer.data[origin_loop].uv.copy()
        for index in range(1, len(loop_indices) - 1):
            loop_a = loop_indices[index]
            loop_b = loop_indices[index + 1]
            vertex_a = mesh.vertices[mesh.loops[loop_a].vertex_index]
            vertex_b = mesh.vertices[mesh.loops[loop_b].vertex_index]
            edge_a = (obj.matrix_world @ vertex_a.co) - origin_world
            edge_b = (obj.matrix_world @ vertex_b.co) - origin_world
            cross = edge_a.cross(edge_b)
            double_world_area = cross.length
            edge_c = edge_b - edge_a
            edge_energy = edge_a.length_squared + edge_b.length_squared + edge_c.length_squared
            triangle_quality = double_world_area / max(edge_energy, epsilon)
            if (double_world_area <= epsilon or edge_a.length <= epsilon
                    or triangle_quality <= SOURCE_SLIVER_QUALITY_LIMIT):
                degenerate_world += 1
                continue
            uv_a = (layer.data[loop_a].uv - origin_uv) * TILE_METRES
            uv_b = (layer.data[loop_b].uv - origin_uv) * TILE_METRES
            values = (uv_a.x, uv_a.y, uv_b.x, uv_b.y)
            if not all(math.isfinite(value) for value in values):
                nonfinite += 1
                continue
            double_uv_area = abs(uv_a.x * uv_b.y - uv_a.y * uv_b.x)
            triangle_normal = cross / double_world_area
            expected_area_scale = abs(triangle_normal[projection_axis])
            if expected_area_scale <= epsilon:
                nonfinite += 1
                continue
            projected_floor = projected_double_area_floor(
                expected_area_scale, epsilon,
            )
            projected_floor_evaluations += 1
            projected_floors.append(projected_floor)
            if double_uv_area == 0.0:
                exact_zero_uv_area += 1
            if not uv_area_passes_projected_world_floor(
                    double_uv_area, expected_area_scale, epsilon):
                zero_uv_area += 1
                projected_floor_failures += 1
                continue

            tangent_x = edge_a.normalized()
            tangent_normal = cross.normalized()
            tangent_y = tangent_normal.cross(tangent_x)
            world_x_a = edge_a.length
            world_x_b = edge_b.dot(tangent_x)
            world_y_b = edge_b.dot(tangent_y)
            if abs(world_y_b) <= epsilon:
                degenerate_world += 1
                continue

            # J maps one metre in the triangle tangent plane to UV distance in
            # metres at TILE_METRES. Its singular values expose scale drift and
            # directional stretch independently of triangle orientation.
            j00 = uv_a.x / world_x_a
            j10 = uv_a.y / world_x_a
            j01 = (uv_b.x - j00 * world_x_b) / world_y_b
            j11 = (uv_b.y - j10 * world_x_b) / world_y_b
            gram_a = j00 * j00 + j10 * j10
            gram_b = j00 * j01 + j10 * j11
            gram_c = j01 * j01 + j11 * j11
            discriminant = math.sqrt(max(0.0, (gram_a - gram_c) ** 2 + 4.0 * gram_b * gram_b))
            singular_max = math.sqrt(max(0.0, 0.5 * (gram_a + gram_c + discriminant)))
            singular_min = math.sqrt(max(0.0, 0.5 * (gram_a + gram_c - discriminant)))
            if not all(math.isfinite(value) for value in (singular_min, singular_max)):
                nonfinite += 1
                continue
            if singular_min <= epsilon:
                zero_uv_area += 1
                continue

            area_scale = double_uv_area / double_world_area
            area_scale_error = area_scale_relative_error(
                area_scale, expected_area_scale,
            )
            stretches.append(singular_max / singular_min)
            area_scales.append(area_scale)
            area_scale_errors.append(area_scale_error)
            max_scale_errors.append(abs(singular_max - 1.0))
            measured += 1

    finite = nonfinite == 0 and all(
        math.isfinite(value)
        for values in (stretches, area_scales, area_scale_errors, max_scale_errors)
        for value in values
    )
    max_stretch = max(stretches) if stretches else math.inf
    max_area_error = max(area_scale_errors) if area_scale_errors else math.inf
    max_scale_error = max(max_scale_errors) if max_scale_errors else math.inf
    nonzero = measured > 0 and zero_uv_area == 0
    scale_consistent = (
        finite and max_area_error <= TEXEL_SCALE_ERROR_LIMIT
        and max_scale_error <= TEXEL_SCALE_ERROR_LIMIT
    )
    within_stretch_bound = finite and max_stretch <= CUBIC_STRETCH_LIMIT
    valid = (
        finite and nonzero and scale_consistent and within_stretch_bound
    )
    return {
        "present": True,
        "method": TILED_UV_METRIC_METHOD,
        "tileMetres": TILE_METRES,
        "targetUvUnitsPerMetre": round(1.0 / TILE_METRES, 7),
        "worldDoubleAreaFloor": epsilon,
        "worldDoubleAreaFloorUnchanged": True,
        "projectedDoubleAreaFloorMethod": (
            "WORLD_DOUBLE_AREA_FLOOR_TIMES_ABS_DOMINANT_NORMAL_COMPONENT"
        ),
        "projectedFloorIsDimensionalConversionNotToleranceRelaxation": True,
        "projectedFloorEvaluatedTriangles": projected_floor_evaluations,
        "minimumProjectedDoubleAreaFloor": (
            min(projected_floors) if projected_floors else None
        ),
        "maximumProjectedDoubleAreaFloor": (
            max(projected_floors) if projected_floors else None
        ),
        "trianglesMeasured": measured,
        "degenerateWorldTriangles": degenerate_world,
        "sourceSliverQualityLimit": SOURCE_SLIVER_QUALITY_LIMIT,
        "zeroUvAreaTriangles": zero_uv_area,
        "exactZeroUvAreaTriangles": exact_zero_uv_area,
        "projectedFloorFailureTriangles": projected_floor_failures,
        "nonFiniteTriangles": nonfinite,
        "finite": finite,
        "nonZero": nonzero,
        "scaleConsistent": scale_consistent,
        "withinCubicStretchBound": within_stretch_bound,
        "cubicStretchLimit": round(CUBIC_STRETCH_LIMIT, 7),
        "texelScaleErrorLimit": TEXEL_SCALE_ERROR_LIMIT,
        "stretchRatio": metric_distribution(stretches),
        "areaScale": metric_distribution(area_scales),
        "areaScaleRelativeError": metric_distribution(area_scale_errors),
        "maxSingularValueError": metric_distribution(max_scale_errors),
        "p95StretchRatio": round(percentile(stretches, 0.95), 7) if stretches else None,
        "maxStretchRatio": round(max_stretch, 7) if math.isfinite(max_stretch) else None,
        "p95AreaScaleRelativeError": (
            round(percentile(area_scale_errors, 0.95), 7) if area_scale_errors else None
        ),
        "maxAreaScaleRelativeError": (
            round(max_area_error, 7) if math.isfinite(max_area_error) else None
        ),
        "valid": valid,
    }


def tiled_uv_construction_contract():
    """Run exact positive and adversarial fixtures for the UV construction."""
    # Actual ruined-bunker micro triangle 3067: its world double-area is above
    # the frozen world floor, while cubic projection expresses that same floor
    # in projected units. The old dimensionally inconsistent comparison to the
    # unscaled world floor rejected this valid Jacobian.
    component = 2.0 ** -40
    micro_world_double_area = math.sqrt(2.0) * component
    micro_expected_area_scale = 1.0 / math.sqrt(2.0)
    micro_projected_floor = projected_double_area_floor(
        micro_expected_area_scale,
    )
    micro_fixture_passed = (
        micro_world_double_area > 1.0e-12
        and component <= 1.0e-12
        and component > micro_projected_floor
        and uv_area_passes_projected_world_floor(
            component, micro_expected_area_scale,
        )
        and area_scale_error_passes(
            component / micro_world_double_area,
            micro_expected_area_scale,
        )
    )

    # Actual ruined-bunker triangle 2532: two distinct source V coordinates
    # survive Blender's UV layer but collapse when the exporter flips them at
    # magnitude 8.84. Subtracting the common -8 repeat-tile anchor preserves
    # phase and keeps both values distinct through the exact GLB round-trip.
    raw_v_first = -31.351173400878906 / TILE_METRES
    raw_v_second = -31.351171493530273 / TILE_METRES
    unanchored_first = float32_value(raw_v_first)
    unanchored_second = float32_value(raw_v_second)
    unanchored_export_first = float32_value(1.0 - unanchored_first)
    unanchored_export_second = float32_value(1.0 - unanchored_second)
    anchor = integral_tile_anchor(raw_v_first)
    anchored_first = raw_v_first - anchor
    anchored_second = raw_v_second - anchor
    anchored_export_first = float32_value(1.0 - float32_value(anchored_first))
    anchored_export_second = float32_value(1.0 - float32_value(anchored_second))
    anchored_roundtrip_first = gltf_v_roundtrip_float32(anchored_first)
    anchored_roundtrip_second = gltf_v_roundtrip_float32(anchored_second)
    export_precision_fixture_passed = (
        anchor == -8
        and unanchored_first != unanchored_second
        and unanchored_export_first == unanchored_export_second
        and anchored_export_first != anchored_export_second
        and anchored_roundtrip_first != anchored_roundtrip_second
        and circular_unit_distance(anchored_roundtrip_first, raw_v_first)
        <= abs(anchored_roundtrip_first - anchored_first)
        and circular_unit_distance(anchored_roundtrip_second, raw_v_second)
        <= abs(anchored_roundtrip_second - anchored_second)
    )

    exact_collapse_rejected = not uv_area_passes_projected_world_floor(
        0.0, micro_expected_area_scale,
    )
    scale_distortion_rejected = not area_scale_error_passes(
        micro_expected_area_scale * 1.006,
        micro_expected_area_scale,
    )
    nonintegral_anchor_rejected = False
    try:
        require_integral_tile_anchor(-7.5)
    except ValueError:
        nonintegral_anchor_rejected = True
    loop_inconsistent_artifact_rejected = not infer_post_export_polygon_anchor(
        [(8.125, 2.25), (8.375, 2.5)],
        [(0.125, 0.25), (1.375, 0.5)],
    )["passed"]

    # COMMSRELAY's retained rotated hierarchy contains ~0.45 m parent/child
    # translations that nearly cancel under a 0.01 parent scale. A ULP of the
    # tiny final coordinate is not a forward-error bound; the absolute affine
    # terms must survive cancellation. Reproduce that exact numerical class
    # and separately prove that a residual beyond the derived bound rejects.
    identity_rows = (
        (1.0, 0.0, 0.0, 0.0),
        (0.0, 1.0, 0.0, 0.0),
        (0.0, 0.0, 1.0, 0.0),
        (0.0, 0.0, 0.0, 1.0),
    )
    child_translation = tuple(
        (-0.44999995827674866 if row == 0 else value)
        if column == 3 else value
        for row, values in enumerate(identity_rows)
        for column, value in enumerate(values)
    )
    child_translation = tuple(
        child_translation[index:index + 4] for index in range(0, 16, 4)
    )
    parent_translation = tuple(
        (0.44999998807907104 if row == 0 else value)
        if column == 3 else value
        for row, values in enumerate(identity_rows)
        for column, value in enumerate(values)
    )
    parent_translation = tuple(
        parent_translation[index:index + 4] for index in range(0, 16, 4)
    )
    outer_scale = (
        (0.009999999776482582, 0.0, 0.0, 0.0),
        (0.0, 0.009999999776482582, 0.0, 0.0),
        (0.0, 0.0, 0.009999999776482582, 0.0),
        (0.0, 0.0, 0.0, 1.0),
    )
    _, cancellation_world_bounds = affine_float32_chain_forward_error(
        (child_translation, parent_translation, outer_scale),
        (0.0, 0.0, 0.0),
    )
    cancellation_geometry_bound = cancellation_world_bounds[0] / TILE_METRES
    cancellation_residual = 2.0 ** -33
    cancellation_projected = cancellation_residual
    cancellation_stored = 0.0
    old_final_result_ulp_bound = post_export_offset_representational_bound(
        cancellation_projected, cancellation_stored, 0, 0.0,
    )
    cancellation_inference = infer_post_export_polygon_anchor(
        [(cancellation_projected, 0.25)] * 3,
        [(cancellation_stored, 0.25)] * 3,
        [(cancellation_geometry_bound, 0.0)] * 3,
    )
    affine_cancellation_fixture_passed = (
        cancellation_residual > old_final_result_ulp_bound
        and cancellation_inference["passed"] is True
        and cancellation_inference["boundViolations"] == 0
    )
    cancellation_total_bound = post_export_offset_representational_bound(
        cancellation_projected, cancellation_stored, 0,
        cancellation_geometry_bound,
    )
    out_of_bound_residual = cancellation_total_bound * 4.0
    out_of_bound_inference = infer_post_export_polygon_anchor(
        [(out_of_bound_residual, 0.25)] * 3,
        [(0.0, 0.25)] * 3,
        [(cancellation_geometry_bound, 0.0)] * 3,
    )
    affine_out_of_bound_residual_rejected = (
        out_of_bound_inference["passed"] is False
        and out_of_bound_inference["boundViolations"] > 0
    )
    passed = all((
        micro_fixture_passed,
        export_precision_fixture_passed,
        exact_collapse_rejected,
        scale_distortion_rejected,
        nonintegral_anchor_rejected,
        loop_inconsistent_artifact_rejected,
        affine_cancellation_fixture_passed,
        affine_out_of_bound_residual_rejected,
    ))
    contract = {
        "schema": "MassfrontStage10TiledUvConstructionContractV1",
        "method": TILED_UV_ANCHOR_METHOD,
        "metricMethod": TILED_UV_METRIC_METHOD,
        "passed": passed,
        "tileMetres": TILE_METRES,
        "worldDoubleAreaFloor": 1.0e-12,
        "sourceSliverQualityLimit": SOURCE_SLIVER_QUALITY_LIMIT,
        "texelScaleErrorLimit": TEXEL_SCALE_ERROR_LIMIT,
        "cubicStretchLimit": CUBIC_STRETCH_LIMIT,
        "fixtures": {
            "ruinedBunkerMicroTriangle3067": {
                "passed": micro_fixture_passed,
                "worldDoubleArea": micro_world_double_area,
                "projectedDoubleArea": component,
                "expectedAreaScale": micro_expected_area_scale,
                "projectedDoubleAreaFloor": micro_projected_floor,
                "oldUnscaledWorldFloorWouldReject": component <= 1.0e-12,
            },
            "ruinedBunkerExportCollapseTriangle2532": {
                "passed": export_precision_fixture_passed,
                "integralAnchor": anchor,
                "unanchoredValuesDistinctBeforeExport": (
                    unanchored_first != unanchored_second
                ),
                "unanchoredValuesCollapseAfterExportFlip": (
                    unanchored_export_first == unanchored_export_second
                ),
                "anchoredValuesDistinctAfterExportFlip": (
                    anchored_export_first != anchored_export_second
                ),
                "anchoredValuesDistinctAfterRoundtrip": (
                    anchored_roundtrip_first != anchored_roundtrip_second
                ),
            },
            "exactCollapsedUvRejected": exact_collapse_rejected,
            "nonIntegralAnchorRejected": nonintegral_anchor_rejected,
            "loopInconsistentPostExportArtifactRejected": (
                loop_inconsistent_artifact_rejected
            ),
            "rotatedHierarchyAffineCancellation": {
                "passed": affine_cancellation_fixture_passed,
                "observedResidual": cancellation_residual,
                "oldFinalResultUlpBound": old_final_result_ulp_bound,
                "affineProjectedGeometryBound": cancellation_geometry_bound,
                "derivedTotalBound": cancellation_total_bound,
                "oldFinalResultUlpWouldReject": (
                    cancellation_residual > old_final_result_ulp_bound
                ),
                "affineForwardErrorAccepts": cancellation_inference["passed"],
                "operationCountPerAffineDot": (
                    FLOAT32_AFFINE_DOT_OPERATION_COUNT
                ),
                "boundFormula": POST_EXPORT_INFERENCE_BOUND_FORMULA,
            },
            "affineOutOfBoundResidualRejected": (
                affine_out_of_bound_residual_rejected
            ),
            "scaleDistortionAboveFrozenLimitRejected": scale_distortion_rejected,
        },
    }
    contract["canonicalContractSha256"] = stable_json_sha256(contract)
    if not passed:
        raise RuntimeError(
            "tiled UV construction fixture failed: "
            + json.dumps(contract, separators=(",", ":"))
        )
    return contract


def aggregate_tiled_uv_proof(
        mesh_records, scope, expected_render_meshes, actual_render_meshes,
        scene_construction, artifact=None, artifact_sha256=None):
    records = sorted(mesh_records, key=lambda item: item["name"])
    expected = sorted(expected_render_meshes)
    actual = sorted(actual_render_meshes)
    metrics = [item["tiledUvMetrics"] for item in records]
    anchors = [item["tiledUvAnchorProof"] for item in records]
    exact_membership = expected == actual
    artifact_bound = (
        (artifact is None and artifact_sha256 is None)
        or (isinstance(artifact, str) and bool(artifact)
            and isinstance(artifact_sha256, str)
            and re.fullmatch(r"[0-9a-f]{64}", artifact_sha256) is not None)
    )
    all_finite = bool(metrics) and all(item.get("finite") is True for item in metrics)
    all_nonzero = bool(metrics) and all(item.get("nonZero") is True for item in metrics)
    all_scale = bool(metrics) and all(
        item.get("scaleConsistent") is True for item in metrics
    )
    all_stretch = bool(metrics) and all(
        item.get("withinCubicStretchBound") is True for item in metrics
    )
    all_metric_valid = bool(metrics) and all(item.get("valid") is True for item in metrics)
    all_anchor_valid = bool(anchors) and all(item.get("passed") is True for item in anchors)
    all_tiled_layer_index_one = bool(records) and all(
        item.get("tiledUvLayerIndex") == 1
        and len(item.get("uvLayers", [])) == 2
        and item.get("tiledUvLayerSemantic") == "TEXCOORD_1"
        for item in records
    )
    zero_uv_area = sum(item.get("zeroUvAreaTriangles", 0) for item in metrics)
    exact_zero_uv_area = sum(
        item.get("exactZeroUvAreaTriangles", 0) for item in metrics
    )
    nonfinite = sum(item.get("nonFiniteTriangles", 0) for item in metrics)
    proof = {
        "schema": TILED_UV_AGGREGATE_PROOF_SCHEMA,
        "method": "BLENDER_WORLD_CUBIC_UV_CONSTRUCTION_AND_JACOBIAN_V1",
        "metricMethod": TILED_UV_METRIC_METHOD,
        "anchorMethod": TILED_UV_ANCHOR_METHOD,
        "scope": scope,
        "sceneConstruction": scene_construction,
        "artifact": artifact,
        "artifactSha256": artifact_sha256,
        "artifactSha256Bound": artifact_bound,
        "expectedRenderMeshes": expected,
        "actualRenderMeshes": actual,
        "exactRenderMeshMembership": exact_membership,
        "renderMeshCount": len(records),
        "perMesh": [
            {
                "name": item["name"],
                "uvLayers": item.get("uvLayers", []),
                "tiledUvLayerIndex": item.get("tiledUvLayerIndex"),
                "tiledUvLayerSemantic": item.get("tiledUvLayerSemantic"),
                "tiledUvAnchorProof": item["tiledUvAnchorProof"],
                "tiledUvMetrics": item["tiledUvMetrics"],
            }
            for item in records
        ],
        "zeroUvAreaTriangles": zero_uv_area,
        "exactZeroUvAreaTriangles": exact_zero_uv_area,
        "nonFiniteTriangles": nonfinite,
        "allAnchorsValid": all_anchor_valid,
        "allTiledUvLayersAreTexcoord1": all_tiled_layer_index_one,
        "allFinite": all_finite,
        "allNonZero": all_nonzero,
        "allScaleConsistent": all_scale,
        "allWithinCubicStretchBound": all_stretch,
        "allMetricValid": all_metric_valid,
        "allValid": (
            exact_membership
            and artifact_bound
            and all_anchor_valid
            and all_tiled_layer_index_one
            and all_finite
            and all_nonzero
            and all_scale
            and all_stretch
            and all_metric_valid
            and zero_uv_area == 0
            and exact_zero_uv_area == 0
            and nonfinite == 0
        ),
    }
    proof["canonicalProofSha256"] = stable_json_sha256(proof)
    return proof


def exported_texcoord_channel_proof(output_path, expected_render_meshes):
    """Bind authored UV layer order to exact GLB TEXCOORD_0/1 accessors."""
    data = output_path.read_bytes()
    if len(data) < 20:
        raise RuntimeError("truncated repair GLB while proving TEXCOORD channels")
    magic, version, declared_length = struct.unpack_from("<4sII", data, 0)
    if magic != b"glTF" or version != 2 or declared_length != len(data):
        raise RuntimeError("invalid repair GLB header while proving TEXCOORD channels")
    chunk_length, chunk_type = struct.unpack_from("<II", data, 12)
    if chunk_type != 0x4E4F534A or 20 + chunk_length > len(data):
        raise RuntimeError("repair GLB does not begin with a valid JSON chunk")
    document = json.loads(
        data[20 : 20 + chunk_length].rstrip(b"\x00 \t\r\n").decode("utf-8")
    )
    binary_header = 20 + chunk_length
    if binary_header + 8 > len(data):
        raise RuntimeError("repair GLB is missing its binary chunk")
    binary_length, binary_type = struct.unpack_from("<II", data, binary_header)
    if binary_type != 0x004E4942 or binary_header + 8 + binary_length > len(data):
        raise RuntimeError("repair GLB binary chunk is invalid")
    meshes = document.get("meshes", [])
    accessors = document.get("accessors", [])
    buffer_views = document.get("bufferViews", [])
    buffers = document.get("buffers", [])

    def accessor_proof(accessor_index, expected_type):
        in_range = (
            isinstance(accessor_index, int)
            and 0 <= accessor_index < len(accessors)
        )
        accessor = accessors[accessor_index] if in_range else {}
        view_index = accessor.get("bufferView")
        view_in_range = (
            isinstance(view_index, int) and 0 <= view_index < len(buffer_views)
        )
        view = buffer_views[view_index] if view_in_range else {}
        count = accessor.get("count")
        component_type = accessor.get("componentType")
        accessor_type = accessor.get("type")
        component_count = {"VEC2": 2, "VEC3": 3}.get(accessor_type, 0)
        element_size = 4 * component_count if component_type == 5126 else 0
        stride = view.get("byteStride", element_size)
        accessor_offset = accessor.get("byteOffset", 0)
        view_offset = view.get("byteOffset", 0)
        view_length = view.get("byteLength", -1)
        last_end = (
            accessor_offset + (count - 1) * stride + element_size
            if isinstance(count, int) and count > 0
            and isinstance(stride, int) and stride >= element_size
            and isinstance(accessor_offset, int) and accessor_offset >= 0
            else math.inf
        )
        storage_within_view = (
            view_in_range
            and isinstance(view_length, int) and view_length >= 0
            and last_end <= view_length
        )
        view_within_binary = (
            view_in_range
            and view.get("buffer") == 0
            and isinstance(view_offset, int) and view_offset >= 0
            and isinstance(view_length, int) and view_length >= 0
            and view_offset + view_length <= binary_length
            and len(buffers) == 1
            and buffers[0].get("byteLength", math.inf) <= binary_length
        )
        uncompressed_dense = (
            accessor.get("sparse") is None
            and not (view.get("extensions") or {}).get("EXT_meshopt_compression")
        )
        passed = (
            in_range
            and view_in_range
            and component_type == 5126
            and accessor_type == expected_type
            and isinstance(count, int) and count > 0
            and accessor.get("normalized") in (None, False)
            and uncompressed_dense
            and storage_within_view
            and view_within_binary
        )
        return {
            "index": accessor_index,
            "indexInRange": in_range,
            "bufferViewIndex": view_index,
            "bufferViewIndexInRange": view_in_range,
            "componentType": component_type,
            "type": accessor_type,
            "count": count,
            "float32": component_type == 5126,
            "expectedType": expected_type,
            "storageWithinBufferView": storage_within_view,
            "bufferViewWithinBinaryChunk": view_within_binary,
            "uncompressedDenseAccessor": uncompressed_dense,
            "passed": passed,
        }
    expected = sorted(expected_render_meshes)
    records = []
    for node in document.get("nodes", []):
        name = str(node.get("name") or "")
        if name not in expected:
            continue
        mesh_index = node.get("mesh")
        extras = node.get("extras") or {}
        primitive_records = []
        if isinstance(mesh_index, int) and 0 <= mesh_index < len(meshes):
            for primitive_index, primitive in enumerate(
                    meshes[mesh_index].get("primitives", [])):
                attributes = primitive.get("attributes") or {}
                channels = sorted(
                    key for key in attributes if key.startswith("TEXCOORD_")
                )
                position = accessor_proof(attributes.get("POSITION"), "VEC3")
                texcoord0 = accessor_proof(attributes.get("TEXCOORD_0"), "VEC2")
                texcoord1 = accessor_proof(attributes.get("TEXCOORD_1"), "VEC2")
                accessors_distinct = len({
                    position["index"], texcoord0["index"], texcoord1["index"],
                }) == 3
                counts_match = (
                    position["count"] == texcoord0["count"] == texcoord1["count"]
                )
                primitive_extensions = primitive.get("extensions") or {}
                uncompressed_primitive = not any(
                    key in primitive_extensions
                    for key in ("KHR_draco_mesh_compression", "EXT_meshopt_compression")
                )
                primitive_records.append({
                    "primitiveIndex": primitive_index,
                    "texcoordChannels": channels,
                    "positionAccessor": position,
                    "texcoord0Accessor": texcoord0,
                    "texcoord1Accessor": texcoord1,
                    "positionTexcoordAccessorsDistinct": accessors_distinct,
                    "positionTexcoordCountsMatch": counts_match,
                    "uncompressedPrimitive": uncompressed_primitive,
                    "exactTexcoord01Only": (
                        channels == ["TEXCOORD_0", "TEXCOORD_1"]
                        and position["passed"]
                        and texcoord0["passed"]
                        and texcoord1["passed"]
                        and accessors_distinct
                        and counts_match
                        and uncompressed_primitive
                    ),
                })
        records.append({
            "name": name,
            "meshIndex": mesh_index,
            "primarySemantic": extras.get("mf_uv_primary"),
            "secondarySemantic": extras.get("mf_uv_secondary"),
            "primitiveCount": len(primitive_records),
            "primitives": primitive_records,
        })
    actual = sorted(record["name"] for record in records)
    passed = (
        actual == expected
        and bool(records)
        and all(record["primarySemantic"] == "UV_GEN" for record in records)
        and all(record["secondarySemantic"] == "UVMap_Tile" for record in records)
        and all(record["primitiveCount"] > 0 for record in records)
        and all(
            primitive["exactTexcoord01Only"]
            for record in records for primitive in record["primitives"]
        )
    )
    proof = {
        "schema": "MassfrontStage10ExportedTexcoordChannelProofV1",
        "method": "GLB_NODE_EXTRAS_PLUS_PRIMITIVE_ATTRIBUTE_INDEX_BINDING",
        "passed": passed,
        "authoredLayerOrder": ["UV_GEN", "UVMap_Tile"],
        "gltfChannelOrder": ["TEXCOORD_0", "TEXCOORD_1"],
        "freshBlenderImportLayerIndexForTexcoord1": 1,
        "requiredAccessorComponentType": 5126,
        "requiredTexcoordAccessorType": "VEC2",
        "texcoordCountsMustMatchPosition": True,
        "accessorsMustBeDistinct": True,
        "expectedRenderMeshes": expected,
        "actualRenderMeshes": actual,
        "exactRenderMeshMembership": actual == expected,
        "records": records,
    }
    proof["canonicalProofSha256"] = stable_json_sha256(proof)
    return proof


def fresh_reimport_tiled_uv_proof(output_path, expected_render_meshes):
    artifact_sha = sha256(output_path)
    artifact = str(output_path.relative_to(ROOT)).replace("\\", "/")
    channel_proof = exported_texcoord_channel_proof(
        output_path, expected_render_meshes,
    )
    clear_scene()
    bpy.ops.import_scene.gltf(filepath=str(output_path))
    targets = render_meshes()
    actual_names = [obj.name_full for obj in targets]
    records = []
    for obj in targets:
        uv_layer_names = [layer.name for layer in obj.data.uv_layers]
        tiled_layer_name = uv_layer_names[1] if len(uv_layer_names) >= 2 else ""
        records.append({
            "name": obj.name_full,
            "uvLayers": uv_layer_names,
            "tiledUvLayerIndex": 1 if tiled_layer_name else None,
            "tiledUvLayerSemantic": "TEXCOORD_1" if tiled_layer_name else None,
            "tiledUvAnchorProof": tiled_uv_anchor_proof(
                obj,
                layer_name=tiled_layer_name,
                storage_realization="BLENDER_GLTF_FLOAT32_V_FLIP_ROUNDTRIP",
            ),
            "tiledUvMetrics": tiled_uv_metrics(obj, tiled_layer_name),
        })
    proof = aggregate_tiled_uv_proof(
        records,
        "POST_EXPORT_FRESH_BLENDER_REIMPORT",
        expected_render_meshes,
        actual_names,
        "FACTORY_EMPTY_SCENE_IMPORT_OF_EXACT_REPAIR_GLB",
        artifact,
        artifact_sha,
    )
    artifact_sha_after = sha256(output_path)
    proof_without_hash = dict(proof)
    proof_without_hash.pop("canonicalProofSha256", None)
    proof_without_hash["exportedTexcoordChannelProof"] = channel_proof
    proof_without_hash["artifactSha256AfterProof"] = artifact_sha_after
    proof_without_hash["artifactSha256Stable"] = artifact_sha_after == artifact_sha
    proof_without_hash["allValid"] = (
        proof_without_hash["allValid"]
        and proof_without_hash["artifactSha256Stable"]
        and channel_proof["passed"]
    )
    proof_without_hash["canonicalProofSha256"] = stable_json_sha256(proof_without_hash)
    return proof_without_hash


def canonical_hash_matches(record, hash_field):
    if not isinstance(record, dict):
        return False
    expected = record.get(hash_field)
    if not isinstance(expected, str) or re.fullmatch(r"[0-9a-f]{64}", expected) is None:
        return False
    payload = dict(record)
    payload.pop(hash_field, None)
    return stable_json_sha256(payload) == expected


def tiled_uv_construction_contract_is_safe(contract):
    fixtures = contract.get("fixtures", {}) if isinstance(contract, dict) else {}
    return (
        contract.get("schema") == "MassfrontStage10TiledUvConstructionContractV1"
        and contract.get("method") == TILED_UV_ANCHOR_METHOD
        and contract.get("metricMethod") == TILED_UV_METRIC_METHOD
        and contract.get("passed") is True
        and contract.get("tileMetres") == TILE_METRES
        and contract.get("worldDoubleAreaFloor") == 1.0e-12
        and contract.get("sourceSliverQualityLimit") == SOURCE_SLIVER_QUALITY_LIMIT
        and contract.get("texelScaleErrorLimit") == TEXEL_SCALE_ERROR_LIMIT
        and contract.get("cubicStretchLimit") == CUBIC_STRETCH_LIMIT
        and fixtures.get("ruinedBunkerMicroTriangle3067", {}).get("passed") is True
        and fixtures.get("ruinedBunkerExportCollapseTriangle2532", {}).get("passed") is True
        and fixtures.get("exactCollapsedUvRejected") is True
        and fixtures.get("nonIntegralAnchorRejected") is True
        and fixtures.get("loopInconsistentPostExportArtifactRejected") is True
        and fixtures.get("rotatedHierarchyAffineCancellation", {}).get("passed") is True
        and fixtures.get("rotatedHierarchyAffineCancellation", {}).get(
            "oldFinalResultUlpWouldReject"
        ) is True
        and fixtures.get("rotatedHierarchyAffineCancellation", {}).get(
            "affineForwardErrorAccepts"
        ) is True
        and fixtures.get("rotatedHierarchyAffineCancellation", {}).get(
            "operationCountPerAffineDot"
        ) == FLOAT32_AFFINE_DOT_OPERATION_COUNT
        and fixtures.get("rotatedHierarchyAffineCancellation", {}).get(
            "boundFormula"
        ) == POST_EXPORT_INFERENCE_BOUND_FORMULA
        and fixtures.get("affineOutOfBoundResidualRejected") is True
        and fixtures.get("scaleDistortionAboveFrozenLimitRejected") is True
        and canonical_hash_matches(contract, "canonicalContractSha256")
    )


def tiled_uv_anchor_proof_is_safe(proof):
    post_export = proof.get("storageRealization") == (
        "BLENDER_GLTF_FLOAT32_V_FLIP_ROUNDTRIP"
    ) if isinstance(proof, dict) else False
    inference_safe = (
        proof.get("postExportAnchorInferenceMethod")
        == "ALL_LOOP_PROJECTED_MINUS_STORED_UNIQUE_INTEGER_WITH_FLOAT32_ULP_BOUND"
        and proof.get("postExportInferenceBoundMethod")
        == POST_EXPORT_INFERENCE_BOUND_METHOD
        and proof.get("postExportInferenceBoundFormula")
        == POST_EXPORT_INFERENCE_BOUND_FORMULA
        and proof.get("postExportAffineDotOperationCount")
        == FLOAT32_AFFINE_DOT_OPERATION_COUNT
        and proof.get("postExportAffineUnitRoundoff") == FLOAT32_UNIT_ROUNDOFF
        and isinstance(proof.get("postExportMaxAffineHierarchyDepth"), int)
        and proof.get("postExportMaxAffineHierarchyDepth") >= 1
        and proof.get("postExportInferredAnchorPolygons") == proof.get("polygonCount")
        if post_export else
        proof.get("postExportAnchorInferenceMethod")
        == "NOT_APPLICABLE_PRE_EXPORT_DETERMINISTIC_FLOOR_FIRST_LOOP"
        and proof.get("postExportInferenceBoundMethod")
        == "EXACT_PRE_EXPORT_FLOAT32_STORAGE_REPLAY"
        and proof.get("postExportInferenceBoundFormula")
        == "NOT_APPLICABLE_PRE_EXPORT"
        and proof.get("postExportAffineDotOperationCount") == 0
        and proof.get("postExportAffineUnitRoundoff") == 0.0
        and proof.get("postExportMaxAffineHierarchyDepth") == 0
        and proof.get("postExportInferredAnchorPolygons") == 0
    )
    return (
        isinstance(proof, dict)
        and proof.get("schema") == TILED_UV_PROOF_SCHEMA
        and proof.get("method") == TILED_UV_ANCHOR_METHOD
        and proof.get("storageRealization") in (
            "BLENDER_FLOAT32_UV_LAYER",
            "BLENDER_GLTF_FLOAT32_V_FLIP_ROUNDTRIP",
        )
        and proof.get("present") is True
        and proof.get("passed") is True
        and proof.get("tileMetres") == TILE_METRES
        and proof.get("anchorUnits") == "INTEGER_UV_REPEAT_TILES"
        and proof.get("allOffsetsIntegral") is True
        and proof.get("integralTranslationPreservesModuloOneByConstruction") is True
        and proof.get("nonIntegralAnchorViolations") == 0
        and proof.get("storedCoordinatesMatchFloat32Realization") is True
        and proof.get("storageRealizationViolations") == 0
        and inference_safe
        and proof.get("postExportInferredAnchorAmbiguityViolations") == 0
        and proof.get("postExportInferredAnchorBoundViolations") == 0
        and proof.get("postExportInferredAnchorLoopConsistencyViolations") == 0
        and proof.get("moduloOnePhasePreserved") is True
        and proof.get("moduloPhaseViolations") == 0
        and proof.get("derivativesWithinStoredFloatBounds") is True
        and proof.get("derivativeBoundViolations") == 0
        and canonical_hash_matches(proof, "canonicalProofSha256")
    )


def tiled_uv_metric_is_safe(metrics):
    return (
        isinstance(metrics, dict)
        and metrics.get("present") is True
        and metrics.get("method") == TILED_UV_METRIC_METHOD
        and metrics.get("tileMetres") == TILE_METRES
        and metrics.get("worldDoubleAreaFloor") == 1.0e-12
        and metrics.get("worldDoubleAreaFloorUnchanged") is True
        and metrics.get("projectedDoubleAreaFloorMethod")
        == "WORLD_DOUBLE_AREA_FLOOR_TIMES_ABS_DOMINANT_NORMAL_COMPONENT"
        and metrics.get("projectedFloorIsDimensionalConversionNotToleranceRelaxation") is True
        and metrics.get("sourceSliverQualityLimit") == SOURCE_SLIVER_QUALITY_LIMIT
        and metrics.get("cubicStretchLimit") == round(CUBIC_STRETCH_LIMIT, 7)
        and metrics.get("texelScaleErrorLimit") == TEXEL_SCALE_ERROR_LIMIT
        and metrics.get("zeroUvAreaTriangles") == 0
        and metrics.get("exactZeroUvAreaTriangles") == 0
        and metrics.get("projectedFloorFailureTriangles") == 0
        and metrics.get("nonFiniteTriangles") == 0
        and metrics.get("finite") is True
        and metrics.get("nonZero") is True
        and metrics.get("scaleConsistent") is True
        and metrics.get("withinCubicStretchBound") is True
        and metrics.get("valid") is True
    )


def exported_texcoord_channel_proof_is_safe(proof):
    if not isinstance(proof, dict):
        return False
    records = proof.get("records", [])
    primitives = [
        primitive for record in records for primitive in record.get("primitives", [])
    ]
    return (
        proof.get("schema") == "MassfrontStage10ExportedTexcoordChannelProofV1"
        and proof.get("method")
        == "GLB_NODE_EXTRAS_PLUS_PRIMITIVE_ATTRIBUTE_INDEX_BINDING"
        and proof.get("passed") is True
        and proof.get("authoredLayerOrder") == ["UV_GEN", "UVMap_Tile"]
        and proof.get("gltfChannelOrder") == ["TEXCOORD_0", "TEXCOORD_1"]
        and proof.get("freshBlenderImportLayerIndexForTexcoord1") == 1
        and proof.get("requiredAccessorComponentType") == 5126
        and proof.get("requiredTexcoordAccessorType") == "VEC2"
        and proof.get("texcoordCountsMustMatchPosition") is True
        and proof.get("accessorsMustBeDistinct") is True
        and proof.get("exactRenderMeshMembership") is True
        and proof.get("expectedRenderMeshes") == proof.get("actualRenderMeshes")
        and bool(records) and bool(primitives)
        and all(record.get("primarySemantic") == "UV_GEN" for record in records)
        and all(record.get("secondarySemantic") == "UVMap_Tile" for record in records)
        and all(primitive.get("exactTexcoord01Only") is True for primitive in primitives)
        and all(primitive.get("positionTexcoordAccessorsDistinct") is True
                for primitive in primitives)
        and all(primitive.get("positionTexcoordCountsMatch") is True
                for primitive in primitives)
        and all(primitive.get("uncompressedPrimitive") is True
                for primitive in primitives)
        and all(
            accessor.get("passed") is True
            and accessor.get("indexInRange") is True
            and accessor.get("bufferViewIndexInRange") is True
            and accessor.get("storageWithinBufferView") is True
            and accessor.get("bufferViewWithinBinaryChunk") is True
            and accessor.get("uncompressedDenseAccessor") is True
            for primitive in primitives
            for accessor in (
                primitive.get("positionAccessor", {}),
                primitive.get("texcoord0Accessor", {}),
                primitive.get("texcoord1Accessor", {}),
            )
        )
        and canonical_hash_matches(proof, "canonicalProofSha256")
    )


def tiled_uv_aggregate_proof_is_safe(proof, output_sha256=None):
    if not isinstance(proof, dict):
        return False
    per_mesh = proof.get("perMesh", [])
    metrics = [item.get("tiledUvMetrics", {}) for item in per_mesh]
    anchors = [item.get("tiledUvAnchorProof", {}) for item in per_mesh]
    post_export = proof.get("scope") == "POST_EXPORT_FRESH_BLENDER_REIMPORT"
    artifact_sha = proof.get("artifactSha256")
    artifact_safe = (
        proof.get("artifact") is None and artifact_sha is None
        if not post_export else
        isinstance(proof.get("artifact"), str) and bool(proof.get("artifact"))
        and isinstance(artifact_sha, str)
        and re.fullmatch(r"[0-9a-f]{64}", artifact_sha) is not None
        and proof.get("artifactSha256AfterProof") == artifact_sha
        and proof.get("artifactSha256Stable") is True
        and (output_sha256 is None or artifact_sha == output_sha256)
        and exported_texcoord_channel_proof_is_safe(
            proof.get("exportedTexcoordChannelProof", {})
        )
    )
    names = [item.get("name") for item in per_mesh]
    return (
        proof.get("schema") == TILED_UV_AGGREGATE_PROOF_SCHEMA
        and proof.get("method") == "BLENDER_WORLD_CUBIC_UV_CONSTRUCTION_AND_JACOBIAN_V1"
        and proof.get("metricMethod") == TILED_UV_METRIC_METHOD
        and proof.get("anchorMethod") == TILED_UV_ANCHOR_METHOD
        and proof.get("scope") in (
            "PRE_EXPORT_BLENDER_SCENE",
            "POST_EXPORT_FRESH_BLENDER_REIMPORT",
        )
        and proof.get("artifactSha256Bound") is True
        and artifact_safe
        and proof.get("exactRenderMeshMembership") is True
        and proof.get("expectedRenderMeshes") == proof.get("actualRenderMeshes")
        and sorted(names) == proof.get("actualRenderMeshes")
        and proof.get("renderMeshCount") == len(per_mesh)
        and bool(per_mesh)
        and all(
            item.get("tiledUvLayerIndex") == 1
            and item.get("tiledUvLayerSemantic") == "TEXCOORD_1"
            and len(item.get("uvLayers", [])) == 2
            for item in per_mesh
        )
        and all(tiled_uv_anchor_proof_is_safe(item) for item in anchors)
        and all(tiled_uv_metric_is_safe(item) for item in metrics)
        and proof.get("zeroUvAreaTriangles")
        == sum(item.get("zeroUvAreaTriangles", 0) for item in metrics) == 0
        and proof.get("exactZeroUvAreaTriangles")
        == sum(item.get("exactZeroUvAreaTriangles", 0) for item in metrics) == 0
        and proof.get("nonFiniteTriangles")
        == sum(item.get("nonFiniteTriangles", 0) for item in metrics) == 0
        and proof.get("allAnchorsValid") is True
        and proof.get("allTiledUvLayersAreTexcoord1") is True
        and proof.get("allFinite") is True
        and proof.get("allNonZero") is True
        and proof.get("allScaleConsistent") is True
        and proof.get("allWithinCubicStretchBound") is True
        and proof.get("allMetricValid") is True
        and proof.get("allValid") is True
        and canonical_hash_matches(proof, "canonicalProofSha256")
    )


def export_scene(output_path, objects=None):
    output_path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    selected = list(objects) if objects is not None else list(bpy.context.scene.objects)
    for obj in selected:
        obj.hide_set(False)
        obj.hide_viewport = False
        obj.select_set(True)
    if selected:
        bpy.context.view_layer.objects.active = selected[0]
    bpy.ops.export_scene.gltf(
        filepath=str(output_path),
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_extras=True,
        export_texcoords=True,
        export_normals=True,
        export_materials="EXPORT",
        export_cameras=False,
        export_lights=False,
        export_yup=True,
    )


def catalog_entries(catalog, selected_families, include_spline):
    entries = []
    exclusions = []
    world_count = 0
    spline_count = 0
    for family in catalog.get("worldKits", []):
        for module in family.get("modules", []):
            world_count += 1
            entry = {
                "key": module["key"],
                "id": module["id"],
                "family": family["id"],
                "category": module.get("category", family.get("label", family["id"])),
                "source": ROOT / module["model"]["path"],
                "catalogRepairLocked": bool(module.get("repairLocked")),
                "catalogMetadataBlocked": False,
                "catalogLifecycle": module.get("lifecycle"),
                "kind": "world-kit",
            }
            if entry["catalogRepairLocked"]:
                entry["exclusionReason"] = "CATALOG_REPAIR_LOCKED"
                exclusions.append(entry)
            elif not selected_families or family["id"] in selected_families:
                entries.append(entry)
    # The current review catalog calls these splineExports. Retain the legacy
    # key fallback so older captured catalogs stay reproducible. Exclusion
    # inventory is global even for a subset smoke, so every summary declares
    # the same exact fail-closed ten-item boundary.
    spline_entries = catalog.get("splineExports", catalog.get("splineModels", []))
    for model in spline_entries:
        spline_count += 1
        entry = {
            "key": model["key"],
            "id": model["id"],
            "family": "spline-world-prefabs",
            "category": model.get("category", "Spline world prefabs"),
            "source": ROOT / model["model"]["path"],
            "catalogRepairLocked": bool(model.get("repairLocked")),
            "catalogMetadataBlocked": bool(model.get("metadataBlocked")),
            "catalogLifecycle": model.get("lifecycle"),
            "kind": "spline",
        }
        if entry["catalogRepairLocked"]:
            entry["exclusionReason"] = "CATALOG_REPAIR_LOCKED"
            exclusions.append(entry)
        elif entry["catalogMetadataBlocked"]:
            raise RuntimeError("unexpected metadata-blocked catalog model: " + entry["key"])
        elif entry["key"] in USER_WITHDRAWN_KEYS:
            entry["exclusionReason"] = USER_WITHDRAWN_REASON
            exclusions.append(entry)
        elif include_spline:
            entries.append(entry)
    counts = {
        "worldModules": world_count,
        "splineModels": spline_count,
        "catalogCandidates": world_count + spline_count,
        "repairLocked": sum(1 for entry in exclusions if entry["catalogRepairLocked"]),
        "metadataBlocked": sum(1 for entry in exclusions if entry["catalogMetadataBlocked"]),
        "pipelineExcluded": len(exclusions),
    }
    return entries, exclusions, counts


def output_path(output_root, entry, unfinished=False):
    collection = "unfinished-models" if unfinished else "models"
    return output_root / collection / entry["family"] / entry["source"].name


def report_path(output_root, entry):
    safe = entry["id"].replace("/", "_").replace("\\", "_")
    return output_root / "reports" / entry["family"] / (safe + ".json")


def texture_source_path(output_root, entry, unfinished=False):
    collection = "unfinished-texture-sources" if unfinished else "texture-sources"
    return output_root / collection / entry["family"] / (entry["source"].stem + "-LOD0-UVGEN.glb")


def exclusion_manifest(exclusions):
    return [
        {
            "key": entry["key"],
            "id": entry["id"],
            "family": entry["family"],
            "kind": entry["kind"],
            "reason": entry["exclusionReason"],
            "catalogLifecycle": entry["catalogLifecycle"],
            "source": str(entry["source"].relative_to(ROOT)).replace("\\", "/"),
            "sourceSha256": sha256(entry["source"]),
        }
        for entry in exclusions
    ]


def processing_output_paths(output_root, entry):
    safe = entry["id"].replace("/", "_").replace("\\", "_")
    source = entry["source"]
    if not isinstance(source, Path):
        source = ROOT / source
    return [
        output_root / "reports" / entry["family"] / (safe + ".json"),
        output_root / "models" / entry["family"] / source.name,
        output_root / "unfinished-models" / entry["family"] / source.name,
        output_root / "texture-sources" / entry["family"] / (source.stem + "-LOD0-UVGEN.glb"),
        output_root / "unfinished-texture-sources" / entry["family"] / (source.stem + "-LOD0-UVGEN.glb"),
    ]


def excluded_output_files(output_root, exclusions):
    if not output_root.exists():
        return []
    return sorted(
        path for entry in exclusions for path in processing_output_paths(output_root, entry)
        if path.is_file()
    )


def exclusions_with_output_state(output_root, manifest):
    records = []
    for record in manifest:
        outputs = [
            str(path.relative_to(ROOT)).replace("\\", "/")
            for path in processing_output_paths(output_root, record) if path.is_file()
        ]
        records.append({
            **record,
            "processingOutputCount": len(outputs),
            "processingOutputs": outputs,
        })
    return records


def prune_excluded_outputs(output_root, exclusions):
    output_root = output_root.resolve()
    tmp_root = (ROOT / "tmp").resolve()
    try:
        output_root.relative_to(tmp_root)
    except ValueError as exc:
        raise RuntimeError("--force exclusion pruning is restricted to the repository tmp directory") from exc
    removed = []
    for target in excluded_output_files(output_root, exclusions):
        try:
            target.resolve().relative_to(output_root)
        except ValueError as exc:
            raise RuntimeError("refusing to prune path outside selected output: " + str(target)) from exc
        target.unlink()
        removed.append(str(target.relative_to(ROOT)).replace("\\", "/"))
    return removed


def prune_unreferenced_full_outputs(output_root, results):
    """Remove only stale derived repair artifacts after an exact full run.

    Status can move from RECONSTRUCTION_REQUIRED to a ready state (or back),
    which changes the selected output directory. Keeping both GLBs makes an
    obsolete inner copy look authoritative to later tooling. Canonical source
    is never in these tmp-only collections.
    """
    output_root = output_root.resolve()
    tmp_root = (ROOT / "tmp").resolve()
    try:
        output_root.relative_to(tmp_root)
    except ValueError as exc:
        raise RuntimeError("full-output pruning is restricted to the repository tmp directory") from exc
    expected = set()
    for result in results:
        expected.add((ROOT / result["output"]).resolve())
        expected.add((ROOT / result["textureSource"]).resolve())
        safe = result["id"].replace("/", "_").replace("\\", "_")
        expected.add((output_root / "reports" / result["family"] / (safe + ".json")).resolve())
    removed = []
    collections = (
        ("models", "*.glb"),
        ("unfinished-models", "*.glb"),
        ("texture-sources", "*.glb"),
        ("unfinished-texture-sources", "*.glb"),
        ("reports", "*.json"),
    )
    for collection, pattern in collections:
        root = (output_root / collection).resolve()
        if not root.exists():
            continue
        for target in root.rglob(pattern):
            resolved = target.resolve()
            try:
                resolved.relative_to(root)
                resolved.relative_to(output_root)
            except ValueError as exc:
                raise RuntimeError("refusing to prune path outside selected output: " + str(target)) from exc
            if resolved not in expected:
                target.unlink()
                removed.append(str(target.relative_to(ROOT)).replace("\\", "/"))
    return sorted(removed)


def snapshot_source_meshes(objects):
    """Copy render-mesh datablocks before derived cleanup mutates them."""
    snapshots = {}
    for obj in objects:
        copy = obj.data.copy()
        copy.name = obj.data.name + "__mf_src_snap"
        snapshots[obj.name_full] = {
            "mesh": copy,
            "meshName": obj.data.name,
        }
    return snapshots


def restore_source_meshes(objects, snapshots, names):
    restored = []
    wanted = set(names)
    for obj in objects:
        if obj.name_full not in wanted:
            continue
        snapshot = snapshots.get(obj.name_full)
        if snapshot is None:
            raise RuntimeError("missing source mesh snapshot for " + obj.name_full)
        replacement = snapshot["mesh"].copy()
        replacement.name = snapshot["meshName"]
        old = obj.data
        obj.data = replacement
        if old is not None and old.users == 0:
            bpy.data.meshes.remove(old)
        restored.append(obj.name_full)
    missing = sorted(wanted.difference(restored))
    if missing:
        raise RuntimeError("could not restore source meshes: " + ", ".join(missing))
    return restored


def mesh_has_measured_uv_blocker(mesh):
    return (
        not mesh["packedUv"].get("finite")
        or not mesh["packedUv"].get("insideUnitSquare")
        or mesh["packedUv"].get("zeroAreaFaces", 0) > 0
        or mesh["packedUv"].get("overlapFaces", 0) > 0
        or not mesh["tiledUv"].get("finite")
        or mesh["tiledUv"].get("zeroAreaFaces", 0) > 0
        or not mesh["tiledUvAnchorProof"].get("passed")
        or not mesh["tiledUvMetrics"].get("valid")
    )


def author_and_measure_derived_uvs(targets, canonical_audits, raster_objects, cleaned_geometry):
    pack_margin = packed_bake_uvs(targets)
    anchor_proofs = {}
    for obj in targets:
        anchor_proofs[obj.name_full] = tiled_cubic_uv(obj)
    overlap_by_mesh = uv_overlap_stats(targets)
    mesh_reports = []
    for obj in targets:
        canonical_audit = canonical_audits[obj.name_full]
        after_uv_topology = topology(obj)
        after_uv_signature = geometry_signature(obj)
        before_uv = cleaned_geometry[obj.name_full]
        uv_geometry_preserved = (
            before_uv["topology"] == after_uv_topology
            and before_uv["geometrySignature"] == after_uv_signature
        )
        if not uv_geometry_preserved:
            raise RuntimeError(
                "UV pass changed cleaned topology, winding, transforms, or normals: " + obj.name
            )
        derived_topology_changed = (
            canonical_audit["before"] != before_uv["topology"]
            or canonical_audit["geometrySignatureBefore"] != before_uv["geometrySignature"]
        )
        cleanup = {
            "mode": PIPELINE_MODE,
            "canonicalAudit": canonical_audit,
            "coincidentTopologyAudit": canonical_audit["coincidentTopologyAudit"],
            "derivedRasterCleanup": raster_objects.get(obj.name_full, {
                "name": obj.name_full,
                "mutated": derived_topology_changed,
            }),
            "before": canonical_audit["before"],
            "afterRasterCleanup": before_uv["topology"],
            "after": after_uv_topology,
            "geometrySignatureBefore": canonical_audit["geometrySignatureBefore"],
            "geometrySignatureAfterRasterCleanup": before_uv["geometrySignature"],
            "geometrySignatureAfter": after_uv_signature,
            "derivedTopologyChanged": derived_topology_changed,
            "topologyPreserved": not derived_topology_changed,
            "uvGeometryPreserved": uv_geometry_preserved,
            "canonicalTopologyUntouched": True,
        }
        packed = uv_stats(obj, "UV_GEN")
        packed.update(overlap_by_mesh[obj.name_full])
        tiled = uv_stats(obj, "UVMap_Tile")
        tiled_metrics = tiled_uv_metrics(obj, "UVMap_Tile")
        uv_layer_names = [layer.name for layer in obj.data.uv_layers]
        if uv_layer_names != ["UV_GEN", "UVMap_Tile"]:
            raise RuntimeError("derived GLB TEXCOORD order is not UV_GEN then UVMap_Tile: " + obj.name)
        obj["mf_uv_primary"] = "UV_GEN"
        obj["mf_uv_primary_projection"] = "per_render_mesh_per_face_bake_atlas_0_1"
        obj["mf_uv_secondary"] = "UVMap_Tile"
        obj["mf_uv_secondary_projection"] = "world_cubic_4m"
        mesh_reports.append({
            "name": obj.name_full,
            "cleanup": cleanup,
            "packedUv": packed,
            "tiledUv": tiled,
            "tiledUvMetrics": tiled_metrics,
            "tiledUvAnchorProof": anchor_proofs[obj.name_full],
            "collapsedUvsRepaired": 0,
            "uvLayers": uv_layer_names,
            "tiledUvLayerIndex": 1,
            "tiledUvLayerSemantic": "TEXCOORD_1",
        })
    return pack_margin, overlap_by_mesh, mesh_reports


def post_export_proof_failing_meshes(*proofs):
    names = []
    for proof in proofs:
        for item in proof.get("perMesh") or []:
            metrics = item.get("tiledUvMetrics") or {}
            anchor = item.get("tiledUvAnchorProof") or {}
            if metrics.get("valid") is not True or anchor.get("passed") is not True:
                name = item.get("name")
                if name and name not in names:
                    names.append(name)
    return names


def process(entry, output_root, catalog_hash, material_model_contract, force=False):
    source = entry["source"]
    item_report = report_path(output_root, entry)
    source_hash = sha256(source)
    if material_model_contract.get("sourceSha256") != source_hash:
        raise RuntimeError(
            "canonical source changed after material semantic preflight: " + str(source)
        )
    material_semantic_contract = {
        **material_model_contract["semanticContract"],
        "preflightScope": "ORIGINAL_GLB_JSON_MATERIAL_DEFINITIONS",
        "sourceSha256": source_hash,
        "materialSlotCount": material_model_contract["materialSlotCount"],
        "materialInventorySha256": material_model_contract[
            "materialInventorySha256"
        ],
        "originalMaterialNames": material_model_contract["materialNames"],
    }
    if not force and item_report.exists():
        previous = json.loads(item_report.read_text(encoding="utf-8"))
        previous_output = ROOT / previous.get("output", "")
        previous_texture = ROOT / previous.get("textureSource", "")
        if (previous.get("schema") == ITEM_SCHEMA
                and previous.get("sourceSha256") == source_hash
                and previous.get("catalogSha256") == catalog_hash
                and previous.get("pipelineVersion") == PIPELINE_VERSION
                and previous.get("pipelineMode") == PIPELINE_MODE
                and previous.get("pipelineScriptSha256") in (
                    {sha256(PIPELINE_SCRIPT)} | RESUME_COMPATIBLE_SCRIPT_SHA256
                )
                and previous.get("rasterCleanupScriptSha256") == sha256(RASTER_CLEANUP_SCRIPT)
                and previous.get("status") in (
                    "READY_FOR_TEXTURE_GENERATION", "UV_READY_GEOMETRY_REVIEW",
                )
                and previous.get("sourceUntouched") is True
                and previous.get("canonicalTopologyUntouched") is True
                and previous.get("uvGeometryPreserved") is True
                and previous.get("rasterCleanup", {}).get("passed") is True
                and previous.get("rasterCleanup", {}).get("acceptedPairsAfter") == 0
                and previous.get("rasterCleanup", {}).get("remainingPairs") == 0
                and previous.get("rasterCleanup", {}).get("stabilized") is True
                and previous.get("rasterCleanup", {}).get(
                    "exactDuplicatePairsAfter"
                ) == 0
                and previous.get("repairDependencyContract", {}).get("passed") is True
                and previous.get("materialSemanticContract", {}).get("passed") is True
                and previous.get("materialSemanticContract", {}).get(
                    "materialInventorySha256"
                ) == material_semantic_contract["materialInventorySha256"]
                and isinstance(previous.get("overlapFaces"), int)
                and previous.get("uvOverlapProof", {}).get("method") == "BLENDER_UV_SELECT_OVERLAP"
                and isinstance(previous.get("tiledUvMetrics", {}).get("valid"), bool)
                and tiled_uv_construction_contract_is_safe(
                    previous.get("tiledUvConstructionContract", {})
                )
                and tiled_uv_aggregate_proof_is_safe(
                    previous.get("preExportTiledUvProof", {})
                )
                and tiled_uv_aggregate_proof_is_safe(
                    previous.get("postExportTiledUvProof", {}),
                    previous.get("outputSha256"),
                )
                and tiled_uv_aggregate_proof_is_safe(
                    previous.get("postExportTextureSourceTiledUvProof", {}),
                    previous.get("textureSourceSha256"),
                )
                and previous.get("catalogLifecycle") == entry["catalogLifecycle"]
                and previous.get("catalogRepairLocked") == entry["catalogRepairLocked"]
                and previous.get("catalogMetadataBlocked") == entry["catalogMetadataBlocked"]
                and previous_output.is_file() and previous_texture.is_file()
                and previous.get("outputSha256") == sha256(previous_output)
                and previous.get("textureSourceSha256") == sha256(previous_texture)):
            previous["resumedFromExisting"] = True
            return previous

    started = time.time()
    clear_scene()
    bpy.ops.import_scene.gltf(filepath=str(source))
    all_meshes = mesh_objects()
    targets = render_meshes()
    if not targets:
        raise RuntimeError("no render meshes found")
    for obj in targets:
        if not len(obj.data.polygons):
            raise RuntimeError("render mesh has no faces: " + obj.name)
    exclusions = [
        {
            "name": obj.name,
            "reason": render_exclusion_reason(obj),
            "excludedFromDerivedOutput": derived_exclusion_reason(obj) is not None,
        }
        for obj in all_meshes if render_exclusion_reason(obj) is not None
    ]
    before_bounds = world_bounds(targets)
    canonical_audits = {obj.name_full: audit_geometry(obj) for obj in targets}
    source_mesh_snapshots = snapshot_source_meshes(targets)
    raster_cleanup = cleanup_same_winding_raster_risk(targets)
    if (not raster_cleanup.get("passed")
            or raster_cleanup.get("acceptedPairsAfter") != 0
            or raster_cleanup.get("remainingPairs") != 0
            or raster_cleanup.get("stabilized") is not True):
        raise RuntimeError(
            "derived same-winding raster cleanup did not pass: "
            + json.dumps({
                "passed": raster_cleanup.get("passed"),
                "acceptedPairsAfter": raster_cleanup.get("acceptedPairsAfter"),
                "exactDuplicatePairsAfter": raster_cleanup.get(
                    "exactDuplicatePairsAfter"
                ),
                "remainingPairs": raster_cleanup.get("remainingPairs"),
                "stabilized": raster_cleanup.get("stabilized"),
                "maxBoundsDriftM": raster_cleanup.get("maxBoundsDriftM"),
                "lineageProof": raster_cleanup.get("lineageProof"),
            }, separators=(",", ":"))
        )
    targets = render_meshes()
    if not targets:
        raise RuntimeError("derived raster cleanup removed every render mesh")
    raster_objects = {
        item["name"]: item for item in raster_cleanup.get("objects", [])
    }
    cleaned_geometry = {
        obj.name_full: {
            "topology": topology(obj),
            "geometrySignature": geometry_signature(obj),
        }
        for obj in targets
    }
    pack_margin, overlap_by_mesh, mesh_reports = author_and_measure_derived_uvs(
        targets, canonical_audits, raster_objects, cleaned_geometry,
    )
    reverted_cleanup_meshes = [
        mesh["name"] for mesh in mesh_reports
        if mesh_has_measured_uv_blocker(mesh)
        and mesh["cleanup"].get("derivedTopologyChanged")
    ]
    if reverted_cleanup_meshes:
        restore_source_meshes(targets, source_mesh_snapshots, reverted_cleanup_meshes)
        reverted = set(reverted_cleanup_meshes)
        for obj in targets:
            if obj.name_full in reverted:
                cleaned_geometry[obj.name_full] = {
                    "topology": topology(obj),
                    "geometrySignature": geometry_signature(obj),
                }
        pack_margin, overlap_by_mesh, mesh_reports = author_and_measure_derived_uvs(
            targets, canonical_audits, raster_objects, cleaned_geometry,
        )
        for mesh in mesh_reports:
            if mesh["name"] in reverted:
                mesh["cleanup"]["cleanupRevertedForTiledUv"] = True
                mesh["cleanup"]["cleanupRevertReason"] = (
                    "MEASURED_UV_INVALID_AFTER_DERIVED_CLEANUP"
                )

    expected_render_meshes = sorted(obj.name_full for obj in targets)
    pre_export_tiled_uv_proof = aggregate_tiled_uv_proof(
        mesh_reports,
        "PRE_EXPORT_BLENDER_SCENE",
        expected_render_meshes,
        expected_render_meshes,
        "IN_MEMORY_DERIVED_SCENE_BEFORE_GLTF_EXPORT",
    )

    after_bounds = world_bounds(targets)
    dimension_drift = max(
        abs(after_bounds["dimensions"][axis] - before_bounds["dimensions"][axis])
        for axis in range(3)
    )
    severe_meshes = [
        mesh for mesh in mesh_reports if mesh_has_measured_uv_blocker(mesh)
    ]
    source_topology_review_names = [
        name for name, audit in canonical_audits.items()
        if audit["coincidentTopologyAudit"]["nonManifoldEdges"] > 0
        or audit["coincidentTopologyAudit"]["looseEdges"] > 0
    ]
    status_reasons = []
    if severe_meshes:
        status_reasons.append({
            "code": "MEASURED_UV_OR_LOOSE_GEOMETRY_BLOCKER",
            "meshes": [mesh["name"] for mesh in severe_meshes],
            "measurements": [
                {
                    "name": mesh["name"],
                    "packedZeroAreaFaces": mesh["packedUv"].get("zeroAreaFaces"),
                    "packedOverlapFaces": mesh["packedUv"].get("overlapFaces"),
                    "tiledZeroAreaFaces": mesh["tiledUv"].get("zeroAreaFaces"),
                    "tiledMetricsValid": mesh["tiledUvMetrics"].get("valid"),
                }
                for mesh in severe_meshes
            ],
        })
    if source_topology_review_names:
        status_reasons.append({
            "code": "SOURCE_LOCKED_TOPOLOGY_REVIEW",
            "policy": "CANONICAL_REPORT_ONLY_DERIVED_RASTER_CLEANUP_IS_SEPARATE",
            "meshes": source_topology_review_names,
        })
    if severe_meshes:
        status = "RECONSTRUCTION_REQUIRED"
    elif source_topology_review_names:
        status = "UV_READY_GEOMETRY_REVIEW"
    else:
        status = "READY_FOR_TEXTURE_GENERATION"

    if (status != "RECONSTRUCTION_REQUIRED"
            and not tiled_uv_aggregate_proof_is_safe(pre_export_tiled_uv_proof)):
        raise RuntimeError(
            "pre-export tiled UV aggregate proof failed: "
            + json.dumps(pre_export_tiled_uv_proof, separators=(",", ":"))
        )

    unfinished = status == "RECONSTRUCTION_REQUIRED"
    destination = output_path(output_root, entry, unfinished)

    lod0 = [obj for obj in targets if obj.get("mf_lod") == 0 or "LOD0" in obj.name.upper()]
    if not lod0 and len(targets) == 1:
        lod0 = list(targets)
    if not lod0 and entry["kind"] == "spline":
        lod0 = list(targets)
    if not lod0:
        raise RuntimeError("no LOD0 texture-source mesh found")
    expected_texture_source_meshes = sorted(obj.name_full for obj in lod0)
    overlap_faces = sum(overlap_by_mesh[obj.name_full]["overlapFaces"] for obj in lod0)
    overlap_loops = sum(overlap_by_mesh[obj.name_full]["overlapLoops"] for obj in lod0)
    all_overlap_faces = sum(mesh["packedUv"]["overlapFaces"] for mesh in mesh_reports)
    all_overlap_loops = sum(mesh["packedUv"]["overlapLoops"] for mesh in mesh_reports)
    tiled_metric_reports = [mesh["tiledUvMetrics"] for mesh in mesh_reports]
    tiled_max_stretch = max(
        (metrics["maxStretchRatio"] for metrics in tiled_metric_reports
         if metrics.get("maxStretchRatio") is not None),
        default=None,
    )
    tiled_max_area_error = max(
        (metrics["maxAreaScaleRelativeError"] for metrics in tiled_metric_reports
         if metrics.get("maxAreaScaleRelativeError") is not None),
        default=None,
    )
    texture_source = texture_source_path(output_root, entry, unfinished)
    scene_object_count = len(bpy.context.scene.objects)
    scene_mesh_count = len(all_meshes)
    export_scene(texture_source, lod0)
    output_objects = [
        obj for obj in bpy.context.scene.objects if derived_exclusion_reason(obj) is None
    ]
    export_scene(destination, output_objects)
    output_sha = sha256(destination)
    texture_source_sha = sha256(texture_source)
    post_export_texture_source_tiled_uv_proof = fresh_reimport_tiled_uv_proof(
        texture_source, expected_texture_source_meshes,
    )
    post_export_tiled_uv_proof = fresh_reimport_tiled_uv_proof(
        destination, expected_render_meshes,
    )
    post_export_safe = (
        tiled_uv_aggregate_proof_is_safe(post_export_tiled_uv_proof, output_sha)
        and tiled_uv_aggregate_proof_is_safe(
            post_export_texture_source_tiled_uv_proof, texture_source_sha,
        )
    )
    source_only_post_export_retry = False
    if status != "RECONSTRUCTION_REQUIRED" and not post_export_safe:
        failing_meshes = post_export_proof_failing_meshes(
            post_export_tiled_uv_proof,
            post_export_texture_source_tiled_uv_proof,
        )
        # Proof import already destroyed the cleaned scene. Retry UVs on the
        # locked source bytes so a cleaned-export miss does not abort the pack.
        clear_scene()
        bpy.ops.import_scene.gltf(filepath=str(source))
        retry_targets = render_meshes()
        if retry_targets:
            retry_audits = {obj.name_full: audit_geometry(obj) for obj in retry_targets}
            retry_geometry = {
                obj.name_full: {
                    "topology": topology(obj),
                    "geometrySignature": geometry_signature(obj),
                }
                for obj in retry_targets
            }
            retry_raster = {
                name: {"name": name, "mutated": False}
                for name in retry_geometry
            }
            pack_margin, overlap_by_mesh, mesh_reports = author_and_measure_derived_uvs(
                retry_targets, retry_audits, retry_raster, retry_geometry,
            )
            retry_severe = [
                mesh for mesh in mesh_reports if mesh_has_measured_uv_blocker(mesh)
            ]
            retry_review = [
                name for name, audit in retry_audits.items()
                if audit["coincidentTopologyAudit"]["nonManifoldEdges"] > 0
                or audit["coincidentTopologyAudit"]["looseEdges"] > 0
            ]
            if not retry_severe:
                source_only_post_export_retry = True
                targets = retry_targets
                status_reasons = []
                if retry_review:
                    status_reasons.append({
                        "code": "SOURCE_LOCKED_TOPOLOGY_REVIEW",
                        "policy": "CANONICAL_REPORT_ONLY_DERIVED_RASTER_CLEANUP_IS_SEPARATE",
                        "meshes": retry_review,
                    })
                    status = "UV_READY_GEOMETRY_REVIEW"
                else:
                    status = "READY_FOR_TEXTURE_GENERATION"
                expected_render_meshes = sorted(obj.name_full for obj in targets)
                lod0 = [
                    obj for obj in targets
                    if obj.get("mf_lod") == 0 or "LOD0" in obj.name.upper()
                ]
                if not lod0 and len(targets) == 1:
                    lod0 = list(targets)
                if not lod0 and entry["kind"] == "spline":
                    lod0 = list(targets)
                if not lod0:
                    raise RuntimeError(
                        "no LOD0 texture-source mesh found after source UV retry"
                    )
                expected_texture_source_meshes = sorted(obj.name_full for obj in lod0)
                overlap_faces = sum(
                    overlap_by_mesh[obj.name_full]["overlapFaces"] for obj in lod0
                )
                overlap_loops = sum(
                    overlap_by_mesh[obj.name_full]["overlapLoops"] for obj in lod0
                )
                all_overlap_faces = sum(
                    mesh["packedUv"]["overlapFaces"] for mesh in mesh_reports
                )
                all_overlap_loops = sum(
                    mesh["packedUv"]["overlapLoops"] for mesh in mesh_reports
                )
                tiled_metric_reports = [mesh["tiledUvMetrics"] for mesh in mesh_reports]
                tiled_max_stretch = max(
                    (metrics["maxStretchRatio"] for metrics in tiled_metric_reports
                     if metrics.get("maxStretchRatio") is not None),
                    default=None,
                )
                tiled_max_area_error = max(
                    (metrics["maxAreaScaleRelativeError"] for metrics in tiled_metric_reports
                     if metrics.get("maxAreaScaleRelativeError") is not None),
                    default=None,
                )
                after_bounds = world_bounds(targets)
                dimension_drift = max(
                    abs(after_bounds["dimensions"][axis] - before_bounds["dimensions"][axis])
                    for axis in range(3)
                )
                pre_export_tiled_uv_proof = aggregate_tiled_uv_proof(
                    mesh_reports,
                    "PRE_EXPORT_BLENDER_SCENE",
                    expected_render_meshes,
                    expected_render_meshes,
                    "IN_MEMORY_DERIVED_SCENE_BEFORE_GLTF_EXPORT",
                )
                destination = output_path(output_root, entry, False)
                texture_source = texture_source_path(output_root, entry, False)
                scene_object_count = len(bpy.context.scene.objects)
                scene_mesh_count = len(mesh_objects())
                export_scene(texture_source, lod0)
                output_objects = [
                    obj for obj in bpy.context.scene.objects
                    if derived_exclusion_reason(obj) is None
                ]
                export_scene(destination, output_objects)
                output_sha = sha256(destination)
                texture_source_sha = sha256(texture_source)
                post_export_texture_source_tiled_uv_proof = fresh_reimport_tiled_uv_proof(
                    texture_source, expected_texture_source_meshes,
                )
                post_export_tiled_uv_proof = fresh_reimport_tiled_uv_proof(
                    destination, expected_render_meshes,
                )
                post_export_safe = (
                    tiled_uv_aggregate_proof_is_safe(
                        post_export_tiled_uv_proof, output_sha,
                    )
                    and tiled_uv_aggregate_proof_is_safe(
                        post_export_texture_source_tiled_uv_proof, texture_source_sha,
                    )
                )
        if not post_export_safe:
            failing_meshes = post_export_proof_failing_meshes(
                post_export_tiled_uv_proof,
                post_export_texture_source_tiled_uv_proof,
            ) or failing_meshes
            status = "RECONSTRUCTION_REQUIRED"
            status_reasons.append({
                "code": "POST_EXPORT_TILED_UV_PROOF",
                "policy": "QUARANTINE_NOT_PACK_FAILURE",
                "meshes": failing_meshes,
            })
            unfinished_destination = output_path(output_root, entry, True)
            unfinished_texture = texture_source_path(output_root, entry, True)
            if destination != unfinished_destination:
                unfinished_destination.parent.mkdir(parents=True, exist_ok=True)
                destination.replace(unfinished_destination)
                destination = unfinished_destination
            if texture_source != unfinished_texture:
                unfinished_texture.parent.mkdir(parents=True, exist_ok=True)
                texture_source.replace(unfinished_texture)
                texture_source = unfinished_texture
            output_sha = sha256(destination)
            texture_source_sha = sha256(texture_source)
            post_export_texture_source_tiled_uv_proof = fresh_reimport_tiled_uv_proof(
                texture_source, expected_texture_source_meshes,
            )
            post_export_tiled_uv_proof = fresh_reimport_tiled_uv_proof(
                destination, expected_render_meshes,
            )
    if sha256(source) != source_hash:
        raise RuntimeError("canonical source changed during derived repair: " + str(source))
    result = {
        "schema": ITEM_SCHEMA,
        "pipelineVersion": PIPELINE_VERSION,
        "pipelineMode": PIPELINE_MODE,
        "pipelineScript": str(PIPELINE_SCRIPT.relative_to(ROOT)).replace("\\", "/"),
        "pipelineScriptSha256": sha256(PIPELINE_SCRIPT),
        "rasterCleanupScript": str(RASTER_CLEANUP_SCRIPT.relative_to(ROOT)).replace("\\", "/"),
        "rasterCleanupScriptSha256": sha256(RASTER_CLEANUP_SCRIPT),
        "blenderVersion": bpy.app.version_string,
        "catalogSha256": catalog_hash,
        "key": entry["key"],
        "id": entry["id"],
        "family": entry["family"],
        "category": entry["category"],
        "kind": entry["kind"],
        "source": str(source.relative_to(ROOT)).replace("\\", "/"),
        "sourceSha256": source_hash,
        "sourceUntouched": True,
        "canonicalGeometryLocked": True,
        "canonicalTopologyUntouched": True,
        "modelGenerationPerformed": False,
        "derivedUvRefreshOnly": False,
        "derivedRasterCleanupPerformed": raster_cleanup["mutated"],
        "derivedTopologyChanged": raster_cleanup["mutated"],
        "cleanupUvSafety": {
            "policy": "REVERT_MUTATED_MESH_WHEN_TILED_UV_INVALID",
            "revertedMeshes": list(reverted_cleanup_meshes),
            "sourceOnlyPostExportRetry": source_only_post_export_retry,
        },
        "output": str(destination.relative_to(ROOT)).replace("\\", "/"),
        "outputSha256": output_sha,
        "textureSource": str(texture_source.relative_to(ROOT)).replace("\\", "/"),
        "textureSourceSha256": texture_source_sha,
        "catalogLifecycle": entry["catalogLifecycle"],
        "catalogRepairLocked": entry["catalogRepairLocked"],
        "catalogMetadataBlocked": entry["catalogMetadataBlocked"],
        "status": status,
        "statusReasons": status_reasons,
        "objectCount": scene_object_count,
        "meshCount": scene_mesh_count,
        "renderMeshCount": len(targets),
        "excludedMeshes": exclusions,
        "beforeBounds": before_bounds,
        "afterBounds": after_bounds,
        "maxDimensionDriftM": round(dimension_drift, 7),
        "topologyPreserved": not raster_cleanup["mutated"],
        "uvGeometryPreserved": all(
            mesh["cleanup"]["uvGeometryPreserved"] for mesh in mesh_reports
        ),
        "repairDependencyContract": raster_dependency_contract(),
        "materialSemanticContract": material_semantic_contract,
        "rasterAcceptanceContract": raster_acceptance_contract(),
        "tiledUvConstructionContract": tiled_uv_construction_contract(),
        "rasterCleanup": raster_cleanup,
        "overlapFaces": overlap_faces,
        "overlapLoops": overlap_loops,
        "allRenderMeshOverlapFaces": all_overlap_faces,
        "allRenderMeshOverlapLoops": all_overlap_loops,
        "uvOverlapProof": {
            "method": "BLENDER_UV_SELECT_OVERLAP",
            "scope": "PER_RENDER_MESH_PACKED_ATLAS",
            "passed": overlap_faces == 0 and all_overlap_faces == 0,
        },
        "tiledUvMetrics": {
            "method": TILED_UV_METRIC_METHOD,
            "valid": all(metrics.get("valid") for metrics in tiled_metric_reports),
            "maxStretchRatio": tiled_max_stretch,
            "maxAreaScaleRelativeError": tiled_max_area_error,
            "worldDoubleAreaFloor": 1.0e-12,
            "projectedDoubleAreaFloorMethod": (
                "WORLD_DOUBLE_AREA_FLOOR_TIMES_ABS_DOMINANT_NORMAL_COMPONENT"
            ),
            "projectedFloorIsDimensionalConversionNotToleranceRelaxation": True,
        },
        "preExportTiledUvProof": pre_export_tiled_uv_proof,
        "postExportTiledUvProof": post_export_tiled_uv_proof,
        "postExportTextureSourceTiledUvProof": (
            post_export_texture_source_tiled_uv_proof
        ),
        "uvContract": {
            "UV_GEN": {
                "gltfTexcoord": 0,
                "purpose": "per-render-mesh per-face bake atlas inside 0-1 with measured internal zero overlap",
            },
            "UVMap_Tile": {
                "gltfTexcoord": 1,
                "purpose": "world-space cubic projection at 4 metres per tile for later PBR binding",
            },
            "packMargin": pack_margin,
        },
        "meshes": mesh_reports,
        "durationSeconds": round(time.time() - started, 3),
    }
    item_report.parent.mkdir(parents=True, exist_ok=True)
    item_report.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    return result


def write_summary(
        output_root, results, failures, total, started, catalog_path, catalog_hash,
        catalog_counts, selection, exclusion_records, pruned_stale_outputs,
        material_semantic_contract):
    counts = {status: 0 for status in PROCESSED_STATUSES}
    families = {}
    for result in results:
        counts[result["status"]] = counts.get(result["status"], 0) + 1
        family = families.setdefault(result["family"], {"total": 0, "statuses": {}})
        family["total"] += 1
        family["statuses"][result["status"]] = family["statuses"].get(result["status"], 0) + 1
    exclusions = exclusions_with_output_state(output_root, exclusion_records)
    stale_excluded_outputs = sorted({
        path for exclusion in exclusions for path in exclusion["processingOutputs"]
    })
    raster_summary = {
        "acceptedPairsBefore": sum(
            result.get("rasterCleanup", {}).get("acceptedPairsBefore", 0)
            for result in results
        ),
        "acceptedPairsAfter": sum(
            result.get("rasterCleanup", {}).get("acceptedPairsAfter", 0)
            for result in results
        ),
        "exactDuplicatePairsBefore": sum(
            result.get("rasterCleanup", {}).get("exactDuplicatePairsBefore", 0)
            for result in results
        ),
        "exactDuplicatePairsAfter": sum(
            result.get("rasterCleanup", {}).get("exactDuplicatePairsAfter", 0)
            for result in results
        ),
        "remainingPairs": sum(
            result.get("rasterCleanup", {}).get("remainingPairs", 0)
            for result in results
        ),
        "modelsMutated": sum(
            bool(result.get("rasterCleanup", {}).get("mutated"))
            for result in results
        ),
        "maximumStabilizationPasses": max((
            result.get("rasterCleanup", {}).get("stabilizationPassCount", 0)
            for result in results
        ), default=0),
        "passed": (
            not failures
            and all(result.get("rasterCleanup", {}).get("passed") for result in results)
            and all(result.get("rasterCleanup", {}).get("acceptedPairsAfter") == 0
                    for result in results)
            and all(result.get("rasterCleanup", {}).get("exactDuplicatePairsAfter") == 0
                    for result in results)
            and all(result.get("rasterCleanup", {}).get("remainingPairs") == 0
                    for result in results)
            and all(result.get("rasterCleanup", {}).get("stabilized") is True
                    for result in results)
        ),
    }
    tiled_uv_summary = {
        "schema": "MassfrontStage10TiledUvSummaryProofV1",
        "metricMethod": TILED_UV_METRIC_METHOD,
        "anchorMethod": TILED_UV_ANCHOR_METHOD,
        "modelsProven": len(results),
        "constructionContractSafe": tiled_uv_construction_contract_is_safe(
            tiled_uv_construction_contract()
        ),
        "preExportAllValid": all(
            tiled_uv_aggregate_proof_is_safe(
                result.get("preExportTiledUvProof", {})
            )
            for result in results
        ),
        "postExportAllValid": all(
            tiled_uv_aggregate_proof_is_safe(
                result.get("postExportTiledUvProof", {}),
                result.get("outputSha256"),
            )
            for result in results
        ),
        "postExportTextureSourceAllValid": all(
            tiled_uv_aggregate_proof_is_safe(
                result.get("postExportTextureSourceTiledUvProof", {}),
                result.get("textureSourceSha256"),
            )
            for result in results
        ),
        "allStatusesDownstreamReady": all(
            result.get("status") in (
                "READY_FOR_TEXTURE_GENERATION", "UV_READY_GEOMETRY_REVIEW",
            ) for result in results
        ),
        "postExportArtifactSha256BindingsPassed": all(
            result.get("postExportTiledUvProof", {}).get("artifactSha256")
            == result.get("postExportTiledUvProof", {}).get(
                "artifactSha256AfterProof"
            ) == result.get("outputSha256")
            and result.get("postExportTiledUvProof", {}).get(
                "artifactSha256Stable"
            ) is True
            and result.get("postExportTiledUvProof", {}).get(
                "exportedTexcoordChannelProof", {}
            ).get("passed") is True
            and result.get("postExportTextureSourceTiledUvProof", {}).get(
                "artifactSha256"
            ) == result.get("postExportTextureSourceTiledUvProof", {}).get(
                "artifactSha256AfterProof"
            ) == result.get("textureSourceSha256")
            and result.get("postExportTextureSourceTiledUvProof", {}).get(
                "artifactSha256Stable"
            ) is True
            and result.get("postExportTextureSourceTiledUvProof", {}).get(
                "exportedTexcoordChannelProof", {}
            ).get("passed") is True
            for result in results
        ),
        "preExportZeroUvAreaTriangles": sum(
            result.get("preExportTiledUvProof", {}).get("zeroUvAreaTriangles", 0)
            for result in results
        ),
        "postExportZeroUvAreaTriangles": sum(
            result.get("postExportTiledUvProof", {}).get("zeroUvAreaTriangles", 0)
            for result in results
        ),
        "postExportExactZeroUvAreaTriangles": sum(
            result.get("postExportTiledUvProof", {}).get(
                "exactZeroUvAreaTriangles", 0,
            )
            for result in results
        ),
        "postExportTextureSourceZeroUvAreaTriangles": sum(
            result.get("postExportTextureSourceTiledUvProof", {}).get(
                "zeroUvAreaTriangles", 0,
            )
            for result in results
        ),
        "postExportTextureSourceExactZeroUvAreaTriangles": sum(
            result.get("postExportTextureSourceTiledUvProof", {}).get(
                "exactZeroUvAreaTriangles", 0,
            )
            for result in results
        ),
    }
    tiled_uv_summary["passed"] = (
        not failures
        and tiled_uv_summary["modelsProven"] == len(results)
        and tiled_uv_summary["constructionContractSafe"]
        and tiled_uv_summary["preExportAllValid"]
        and tiled_uv_summary["postExportAllValid"]
        and tiled_uv_summary["postExportTextureSourceAllValid"]
        and tiled_uv_summary["allStatusesDownstreamReady"]
        and tiled_uv_summary["postExportArtifactSha256BindingsPassed"]
        and tiled_uv_summary["preExportZeroUvAreaTriangles"] == 0
        and tiled_uv_summary["postExportZeroUvAreaTriangles"] == 0
        and tiled_uv_summary["postExportExactZeroUvAreaTriangles"] == 0
        and tiled_uv_summary["postExportTextureSourceZeroUvAreaTriangles"] == 0
        and tiled_uv_summary["postExportTextureSourceExactZeroUvAreaTriangles"] == 0
    )
    tiled_uv_summary["canonicalProofSha256"] = stable_json_sha256(tiled_uv_summary)
    summary = {
        "schema": SUMMARY_SCHEMA,
        "pipelineVersion": PIPELINE_VERSION,
        "pipelineMode": PIPELINE_MODE,
        "pipelineScript": str(PIPELINE_SCRIPT.relative_to(ROOT)).replace("\\", "/"),
        "pipelineScriptSha256": sha256(PIPELINE_SCRIPT),
        "rasterCleanupScript": str(RASTER_CLEANUP_SCRIPT.relative_to(ROOT)).replace("\\", "/"),
        "rasterCleanupScriptSha256": sha256(RASTER_CLEANUP_SCRIPT),
        "blenderVersion": bpy.app.version_string,
        "sourcePolicy": "CANONICAL_MODEL_BYTES_LOCKED_DERIVED_RASTER_CLEAN_AND_UV_ONLY",
        "geometryPolicy": "SIGNED_SAME_WINDING_PAIR_LOCAL_CLEANUP_OPPOSITE_WINDING_PRESERVED",
        "repairDependencyContract": raster_dependency_contract(),
        "materialSemanticContract": material_semantic_contract,
        "rasterAcceptanceContract": raster_acceptance_contract(),
        "tiledUvConstructionContract": tiled_uv_construction_contract(),
        "rasterCleanup": raster_summary,
        "tiledUvProof": tiled_uv_summary,
        "catalog": str(catalog_path.relative_to(ROOT)).replace("\\", "/"),
        "catalogSha256": catalog_hash,
        "catalogCounts": catalog_counts,
        "selection": selection,
        "processedStatusContract": list(PROCESSED_STATUSES),
        "pipelineExclusionCount": len(exclusions),
        "pipelineExclusions": exclusions,
        "prunedStaleOutputs": pruned_stale_outputs,
        "staleExcludedOutputsRemaining": stale_excluded_outputs,
        "totalScheduled": total,
        "processed": len(results),
        "failed": len(failures),
        "statusCounts": counts,
        "families": families,
        "failures": failures,
        "durationSeconds": round(time.time() - started, 3),
    }
    output_root.mkdir(parents=True, exist_ok=True)
    (output_root / "summary.json").write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
    return summary


def validate_full_catalog_contract(entries, exclusions, counts):
    expected_exclusion_keys = (
        EXPECTED_REPAIR_LOCKED_KEYS | METADATA_BLOCKED_KEYS | USER_WITHDRAWN_KEYS
    )
    actual_exclusion_keys = {entry["key"] for entry in exclusions}
    actual_repair_locked = {
        entry["key"] for entry in exclusions if entry["catalogRepairLocked"]
    }
    failures = []
    expected_counts = {
        "worldModules": EXPECTED_WORLD_MODULES,
        "splineModels": EXPECTED_SPLINE_MODELS,
        "catalogCandidates": EXPECTED_CATALOG_CANDIDATES,
        "repairLocked": len(EXPECTED_REPAIR_LOCKED_KEYS),
        "metadataBlocked": 0,
        "pipelineExcluded": EXPECTED_PIPELINE_EXCLUSIONS,
    }
    for field, expected in expected_counts.items():
        if counts.get(field) != expected:
            failures.append("%s=%s expected %s" % (field, counts.get(field), expected))
    if actual_repair_locked != EXPECTED_REPAIR_LOCKED_KEYS:
        failures.append("repairLocked keys differ from empty accepted set")
    if actual_exclusion_keys != expected_exclusion_keys:
        failures.append("pipeline exclusion keys differ from empty accepted set")
    if len(entries) != EXPECTED_FULL_SCHEDULE:
        failures.append("scheduled=%d expected %d" % (len(entries), EXPECTED_FULL_SCHEDULE))
    if failures:
        raise RuntimeError("Stage 10 catalog contract mismatch: " + "; ".join(failures))


def main():
    args = arguments()
    tiled_contract = tiled_uv_construction_contract()
    if not tiled_uv_construction_contract_is_safe(tiled_contract):
        raise RuntimeError("tiled UV construction contract semantic validation failed")
    log(
        "tiled UV construction fixtures passed (%s)" %
        tiled_contract["canonicalContractSha256"]
    )
    args.output = args.output.resolve()
    catalog_path = args.catalog.resolve()
    catalog_hash = sha256(catalog_path)
    catalog = json.loads(catalog_path.read_text(encoding="utf-8"))
    entries, exclusions, catalog_counts = catalog_entries(
        catalog, set(args.family), args.include_spline,
    )
    if args.only:
        wanted = set(args.only)
        entries = [entry for entry in entries if entry["key"] in wanted or entry["id"] in wanted]
        found = {value for entry in entries for value in (entry["key"], entry["id"])}
        missing = sorted(value for value in wanted if value not in found)
        if missing:
            raise RuntimeError("--only selection not found or excluded: " + ", ".join(missing))
    full_catalog = not args.family and args.include_spline and not args.limit and not args.only
    if full_catalog:
        validate_full_catalog_contract(entries, exclusions, catalog_counts)
    if args.limit:
        entries = entries[: args.limit]
    if not entries:
        raise RuntimeError("catalog selection is empty")
    selection = {
        "families": sorted(args.family),
        "only": sorted(args.only),
        "includeSpline": args.include_spline,
        "limit": args.limit,
        "fullCatalog": full_catalog,
    }
    material_semantic_contract, material_models = material_semantic_preflight(
        entries, full_catalog=full_catalog,
    )
    log(
        "material semantic preflight passed for %d models / %d unique names "
        "(coverage %s)" % (
            material_semantic_contract["selectedModelCount"],
            material_semantic_contract["uniqueIncludingUnnamed"],
            material_semantic_contract["materialCoverageSha256"],
        )
    )
    exclusion_records = exclusion_manifest(exclusions)
    pruned_stale_outputs = []
    stale_excluded_outputs = excluded_output_files(args.output, exclusions)
    if full_catalog and stale_excluded_outputs:
        if not args.force:
            raise RuntimeError(
                "stale outputs exist for pipeline-excluded models; rerun the full refresh with --force"
            )
        pruned_stale_outputs = prune_excluded_outputs(args.output, exclusions)
    started = time.time()
    results = []
    failures = []
    log("scheduled %d models" % len(entries))
    for index, entry in enumerate(entries, start=1):
        log("[%d/%d] %s" % (index, len(entries), entry["key"]))
        try:
            result = process(
                entry, args.output, catalog_hash, material_models[entry["key"]],
                args.force,
            )
            results.append(result)
            log("  -> %s (%.2fs)" % (result["status"], result.get("durationSeconds", 0.0)))
        except Exception as exc:
            failure = {
                "key": entry["key"],
                "source": str(entry["source"]),
                "error": str(exc),
                "traceback": traceback.format_exc(),
            }
            failures.append(failure)
            log("  -> FAILED: " + str(exc))
        write_summary(
            args.output, results, failures, len(entries), started, catalog_path, catalog_hash,
            catalog_counts, selection, exclusion_records, pruned_stale_outputs,
            material_semantic_contract,
        )
    if full_catalog and not failures:
        pruned_stale_outputs.extend(prune_unreferenced_full_outputs(args.output, results))
        pruned_stale_outputs = sorted(set(pruned_stale_outputs))
    summary = write_summary(
        args.output, results, failures, len(entries), started, catalog_path, catalog_hash,
        catalog_counts, selection, exclusion_records, pruned_stale_outputs,
        material_semantic_contract,
    )
    print(json.dumps(summary, indent=2), flush=True)
    if failures:
        sys.exit(2)


if __name__ == "__main__":
    try:
        main()
    except Exception:
        traceback.print_exc()
        sys.exit(3)
