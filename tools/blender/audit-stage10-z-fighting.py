"""Read-only z-fighting audit for the locked Stage 10 model selection.

The audit consumes the exact 328-model V18 derived cleanup/PBR pack.  It detects
duplicate faces inside a render mesh, exact or fully nested duplicate render
meshes, partial exact cross-mesh face duplication, and near-coplanar triangle
overlap in world space.  Alternate LODs are intentionally never compared.
Collision, navigation, proof, evidence, and studio helpers are excluded.

No source or derived model is written.  JSON evidence is emitted below
``tmp/stage10-model-repair/z-fighting-reports``.

  blender --background --factory-startup \
    --python tools/blender/audit-stage10-z-fighting.py -- \
    --include-spline [--family FAMILY] [--only KEY] [--limit N] [--force]
"""

import argparse
import base64
import hashlib
import itertools
import json
import math
import re
import struct
import sys
import time
import traceback
import urllib.parse
from collections import Counter, defaultdict
from pathlib import Path

import bpy
from mathutils import Matrix, Quaternion, Vector
from mathutils.bvhtree import BVHTree


ROOT = Path(__file__).resolve().parents[2]
BLENDER_TOOLS = Path(__file__).resolve().parent
if str(BLENDER_TOOLS) not in sys.path:
    sys.path.insert(0, str(BLENDER_TOOLS))
try:
    from stage10_raster_cleanup import (
        SCHEMA as RASTER_CLEANUP_SCHEMA,
        acceptance_contract as raster_acceptance_contract,
        assert_material_semantic_names,
        audit_same_winding_raster_risk,
        dependency_contract as raster_dependency_contract,
    )
except Exception as dependency_error:
    print("MF_STAGE10_ZFIGHT_DEPENDENCY_ERROR=" + repr(dependency_error), flush=True)
    raise SystemExit(3) from dependency_error

DEFAULT_CATALOG = ROOT / "tmp/stage10-model-review/catalog.json"
DEFAULT_REPAIR_ROOT = ROOT / "tmp/stage10-model-repair"
REPAIR_SCRIPT = BLENDER_TOOLS / "repair-stage10-model-pack.py"
PBR_SCRIPT = BLENDER_TOOLS / "texture-stage10-model-pack.py"
RASTER_CLEANUP_SCRIPT = BLENDER_TOOLS / "stage10_raster_cleanup.py"
PIPELINE_VERSION = 3
AUDIT_MODE = "READ_ONLY_SAME_LOD_SAME_WINDING_RASTER_RISK_V1"
RAW_GLTF_AUDIT_METHOD = "GLB_ACCESSOR_TRIANGLE_INDEX_WORLD_V1"
BROAD_PHASE_METHOD = "WORLD_TRIANGLE_BVH_NEAREST_RANGE_V1"
EXACT_DUPLICATE_AUTHORITY = "RAW_GLB_NONDEGENERATE_RENDER_NODE_SAME_WINDING"
REPAIR_SCHEMA = "MassfrontStage10ModelRepairV3"
REPAIR_PIPELINE_VERSION = 18
REPAIR_PIPELINE_MODE = "DERIVED_SAME_WINDING_RASTER_CLEAN_AND_UV"
FROZEN_REPAIR_SCRIPT_SHA256 = "ef9cb66d9f41a0a42c7439b20d31aa43b3ae56e2c2127ba5afd7fedf71a9f54d"
FROZEN_RASTER_CLEANUP_SCRIPT_SHA256 = "1d2dec9d59864a218786fa56b5d9df44d74ac5f430dcd76e6d890da2fce1e72b"
FULL_MATERIAL_MODEL_COUNT = 327
FULL_MATERIAL_SLOT_COUNT = 1926
FULL_MATERIAL_UNIQUE_NONEMPTY = 149
FULL_MATERIAL_UNIQUE_WITH_UNNAMED = 150
FULL_MATERIAL_UNNAMED_SLOTS = 60
FULL_MATERIAL_COVERAGE_SHA256 = "e57e5524f908ceda81f1640099ee0623df190c0b4357cba5dcb22af77736f447"
PBR_SCHEMA = "MassfrontStage10ModelPbrV1"
PBR_PIPELINE_VERSION = 1
PBR_PIPELINE_MODE = "DERIVED_ATLAS_PBR_ONLY"
CONTENT_EQUIVALENT_REBIND_SCHEMA = "MassfrontStage10PbrContentEquivalentRebindV1"
CONTENT_EQUIVALENT_REBIND_METHOD = (
    "BYTE_IDENTICAL_REPAIR_INPUT_AND_PBR_OUTPUT_FRESH_CURRENT_VALIDATION"
)
CONTENT_EQUIVALENT_REBIND_LEGACY_PIPELINE_SHA256 = (
    "1da057bd3a81467ba81205a97c149310c45142bd017ccdd2423fe3a25b116601"
)
CONTENT_EQUIVALENT_REBIND_POLICY = {
    "schema": CONTENT_EQUIVALENT_REBIND_SCHEMA,
    "method": CONTENT_EQUIVALENT_REBIND_METHOD,
    "legacyPipelineScriptSha256": (
        CONTENT_EQUIVALENT_REBIND_LEGACY_PIPELINE_SHA256
    ),
    "requested": True,
}
ITEM_SCHEMA = "MassfrontStage10ZFightingAuditV3"
SUMMARY_SCHEMA = "MassfrontStage10ZFightingAuditSummaryV3"
PBR_RASTER_POLICY = {
    "alphaMode": "OPAQUE",
    "doubleSided": False,
    "backfaceCulling": True,
}
ALLOWED_REPAIR_STATUSES = {"READY_FOR_TEXTURE_GENERATION", "UV_READY_GEOMETRY_REVIEW"}
REPAIR_QUARANTINE_STATUS = "RECONSTRUCTION_REQUIRED"
PRODUCTION_SET_POLICY = {
    "schema": "MassfrontStage10ProductionSetPolicyV1",
    "repairEligibleStatuses": [
        "READY_FOR_TEXTURE_GENERATION", "UV_READY_GEOMETRY_REVIEW",
    ],
    "repairQuarantineStatus": REPAIR_QUARANTINE_STATUS,
    "requiredRepairProofs": [
        "MATERIAL_SEMANTIC", "RASTER_CLEANUP", "TILED_UV_CONSTRUCTION",
        "PRE_EXPORT_TILED_UV", "POST_EXPORT_OUTPUT_TILED_UV",
        "POST_EXPORT_TEXTURE_SOURCE_TILED_UV",
    ],
    "downstreamFailureDisposition": "QUARANTINED_NO_PROMOTION",
    "canonicalSourcesUntouched": True,
}
TILED_UV_METRIC_METHOD = (
    "WORLD_TRIANGLE_TANGENT_JACOBIAN_PROJECTED_WORLD_AREA_FLOOR"
)
TILED_UV_ANCHOR_METHOD = "PER_POLYGON_INTEGRAL_REPEAT_TILE_ANCHOR"
TILED_UV_PROOF_SCHEMA = "MassfrontStage10TiledUvConstructionProofV1"
TILED_UV_AGGREGATE_PROOF_SCHEMA = "MassfrontStage10TiledUvAggregateProofV1"
POST_EXPORT_INFERENCE_BOUND_METHOD = (
    "HIERARCHICAL_FLOAT32_AFFINE_FORWARD_ERROR_PLUS_UV_AND_GLTF_V_FLIP_ULPS"
)
EXPECTED_WORLD_MODULES = 320
EXPECTED_SPLINE_MODELS = 7
EXPECTED_FULL_SCHEDULE = 327
METADATA_BLOCKED_KEYS = set()
USER_WITHDRAWN_KEYS = set()
EXPECTED_REPAIR_LOCKED_KEYS = set()

# Tolerances are deliberately in world metres.  Half a millimetre catches
# same-facing architectural plates at raster-risk; opposite windings are not
# compared because the bound Stage 10 PBR contract requires backface culling.
# Overlap must also cover a measurable fraction of the smaller triangle.
EXACT_POSITION_M = 1.0e-6
PLANE_DISTANCE_M = 5.0e-4
NORMAL_ANGLE_DEGREES = 0.5
NORMAL_DOT_MIN = math.cos(math.radians(NORMAL_ANGLE_DEGREES))
MINIMUM_OVERLAP_AREA_M2 = 1.0e-6
MINIMUM_OVERLAP_FRACTION = 1.0e-4
MAX_SAMPLES_PER_PAIR = 12


def log(message):
    print("MF_STAGE10_ZFIGHT: " + str(message), flush=True)


def arguments():
    parser = argparse.ArgumentParser()
    parser.add_argument("--catalog", type=Path, default=DEFAULT_CATALOG)
    parser.add_argument("--repair-root", type=Path, default=DEFAULT_REPAIR_ROOT)
    parser.add_argument("--output", type=Path, default=None)
    parser.add_argument("--family", action="append", default=[])
    parser.add_argument("--only", action="append", default=[])
    parser.add_argument("--include-spline", action="store_true")
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--force", action="store_true")
    values = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    args = parser.parse_args(values)
    args.catalog = args.catalog.resolve()
    args.repair_root = args.repair_root.resolve()
    args.output = (args.output or args.repair_root).resolve()
    return args


def sha256(path):
    digest = hashlib.sha256()
    with Path(path).open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def canonical_text(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True)


def canonical_hash(value):
    return hashlib.sha256(canonical_text(value).encode("utf-8")).hexdigest()


def repo_relative(path):
    return str(Path(path).resolve().relative_to(ROOT.resolve())).replace("\\", "/")


def require_under(path, parent, label):
    try:
        Path(path).resolve().relative_to(Path(parent).resolve())
    except ValueError as exc:
        raise RuntimeError("%s escapes %s: %s" % (label, parent, path)) from exc


def safe_id(value):
    return value.replace("/", "_").replace("\\", "_")


def validate_pbr_artifact_disposition(
        report, repair, repair_root, artifact, final_uv, coverage, output):
    disposition = report.get("artifactDisposition")
    proof = report.get("contentEquivalentRebind")
    proof_hash = report.get("contentEquivalentRebindSha256")
    if disposition == "REBUILT":
        if proof is not None or proof_hash is not None:
            raise RuntimeError("rebuilt PBR report carries rebind provenance")
        return
    if disposition != "CONTENT_EQUIVALENT_REBOUND" or not isinstance(proof, dict):
        raise RuntimeError("PBR report has no accepted artifact disposition")
    legacy = proof.get("legacyReport", {})
    current_pipeline = proof.get("currentValidationPipeline", {})
    current_input = proof.get("currentRepairInput", {})
    reused_output = proof.get("reusedPbrOutput", {})
    fresh = proof.get("freshValidation", {})
    identifier = re.sub(r"[^A-Za-z0-9._-]+", "_", str(report.get("id", ""))).strip("._")
    expected_archive = (
        "tmp/stage10-model-repair/pbr-reports/rebind-provenance/legacy/%s/%s.%s.legacy.json.provenance"
        % (report.get("family"), identifier, legacy.get("sha256"))
    )
    archive = (ROOT / str(legacy.get("path", ""))).resolve()
    require_under(
        archive,
        repair_root / "pbr-reports" / "rebind-provenance",
        "legacy PBR provenance archive",
    )
    source = (ROOT / str(current_input.get("path", ""))).resolve()
    require_under(source, repair_root / "models", "rebind current repair input")
    rebound = (ROOT / str(reused_output.get("path", ""))).resolve()
    require_under(rebound, repair_root / "pbr-models", "rebind reused PBR output")
    current_map_count = sum(
        len(material.get("maps", {})) for material in report.get("materials", [])
    )
    required_fresh_flags = (
        "sourceImported",
        "pbrOutputImported",
        "glbMapCoverageValidated",
        "opaqueSingleSidedValidated",
        "topologyIndexWindingPositionNormalUvIdentityValidated",
        "materialSlotCountsAndFaceAssignmentsValidated",
        "packedUvOverlapValidated",
        "tiledUvWorldJacobianValidated",
    )
    if (
        proof.get("schema") != CONTENT_EQUIVALENT_REBIND_SCHEMA
        or proof.get("method") != CONTENT_EQUIVALENT_REBIND_METHOD
        or proof.get("passed") is not True
        or legacy.get("path") != expected_archive
        or legacy.get("pipelineScriptSha256")
        != CONTENT_EQUIVALENT_REBIND_LEGACY_PIPELINE_SHA256
        or not archive.is_file()
        or not isinstance(legacy.get("bytes"), int)
        or legacy.get("bytes") <= 0
        or archive.stat().st_size != legacy.get("bytes")
        or sha256(archive) != legacy.get("sha256")
        or current_pipeline != {
            "path": repo_relative(PBR_SCRIPT),
            "sha256": sha256(PBR_SCRIPT),
            "blenderVersion": report.get("blenderVersion"),
        }
        or current_input.get("path") != repair.get("output")
        or current_input.get("sha256") != repair.get("outputSha256")
        or not source.is_file()
        or current_input.get("bytes") != source.stat().st_size
        or sha256(source) != current_input.get("sha256")
        or reused_output.get("path") != report.get("output")
        or reused_output.get("sha256") != report.get("outputSha256")
        or rebound != output
        or not rebound.is_file()
        or reused_output.get("bytes") != rebound.stat().st_size
        or sha256(rebound) != reused_output.get("sha256")
        or proof.get("byteIdenticalRepairInput") is not True
        or proof.get("byteIdenticalPbrOutput") is not True
        or proof.get("legacyMapRecordCountRevalidated") != current_map_count
        or current_map_count <= 0
        or proof.get("legacyMaterialManifestSha256")
        != canonical_hash(report.get("materials", []))
        or proof.get("currentMaterialManifestSha256")
        != canonical_hash(report.get("materials", []))
        or proof.get("legacyLibraryContractSha256")
        != report.get("library", {}).get("contractSha256")
        or proof.get("currentLibraryContractSha256")
        != report.get("library", {}).get("contractSha256")
        or any(fresh.get(field) is not True for field in required_fresh_flags)
        or fresh.get("sourceSceneIdentitySha256")
        != artifact.get("sourceSceneIdentitySha256")
        or fresh.get("finalSceneIdentitySha256")
        != artifact.get("finalSceneIdentitySha256")
        or fresh.get("sourceSceneIdentitySha256")
        != fresh.get("finalSceneIdentitySha256")
        or fresh.get("fullPbrCoverageSha256") != canonical_hash(coverage)
        or fresh.get("finalUvProofSha256") != canonical_hash(final_uv)
        or proof.get("previousReportUsedAsCurrentAcceptanceEvidence") is not False
        or proof.get("outputReexported") is not False
        or proof.get("reportRewritten") is not True
        or proof_hash != canonical_hash(proof)
    ):
        raise RuntimeError("PBR content-equivalent rebind provenance is not green")


def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def catalog_entries(catalog, selected_families, include_spline, only_keys):
    entries = []
    exclusions = []
    world_count = 0
    spline_count = 0
    for family in catalog.get("worldKits", []):
        for module in family.get("modules", []):
            world_count += 1
            entry = {
                "key": module["key"], "id": module["id"], "family": family["id"],
                "kind": "world-kit", "category": module.get("category", family.get("label", family["id"])),
                "canonicalSource": ROOT / module["model"]["path"],
                "repairLocked": bool(module.get("repairLocked")), "metadataBlocked": False,
            }
            if entry["repairLocked"]:
                exclusions.append({**entry, "reason": "CATALOG_REPAIR_LOCKED"})
            elif ((not selected_families or family["id"] in selected_families)
                  and (not only_keys or entry["key"] in only_keys)):
                entries.append(entry)
    for model in catalog.get("splineExports", catalog.get("splineModels", [])):
        spline_count += 1
        entry = {
            "key": model["key"], "id": model["id"], "family": "spline-world-prefabs",
            "kind": "spline", "category": model.get("category", "Spline world prefabs"),
            "canonicalSource": ROOT / model["model"]["path"],
            "repairLocked": bool(model.get("repairLocked")),
            "metadataBlocked": bool(model.get("metadataBlocked")),
        }
        if entry["repairLocked"]:
            exclusions.append({**entry, "reason": "CATALOG_REPAIR_LOCKED"})
        elif entry["metadataBlocked"]:
            exclusions.append({**entry, "reason": "CATALOG_METADATA_BLOCKED"})
        elif entry["key"] in USER_WITHDRAWN_KEYS:
            exclusions.append({**entry, "reason": "USER_WITHDRAWN_PERSONAL_REWORK"})
        elif include_spline and (not only_keys or entry["key"] in only_keys):
            entries.append(entry)
    counts = {
        "worldModules": world_count, "splineModels": spline_count,
        "repairLocked": sum(1 for item in exclusions if item["repairLocked"]),
        "metadataBlocked": sum(1 for item in exclusions if item["metadataBlocked"]),
        "pipelineExcluded": len(exclusions),
    }
    return entries, exclusions, counts


def validate_full_contract(entries, exclusions, counts):
    repair_locked = {item["key"] for item in exclusions if item["repairLocked"]}
    metadata_blocked = {item["key"] for item in exclusions if item["metadataBlocked"]}
    failures = []
    if counts["worldModules"] != EXPECTED_WORLD_MODULES:
        failures.append("worldModules=%d" % counts["worldModules"])
    if counts["splineModels"] != EXPECTED_SPLINE_MODELS:
        failures.append("splineModels=%d" % counts["splineModels"])
    if repair_locked != EXPECTED_REPAIR_LOCKED_KEYS:
        failures.append("repair-locked set differs from authoritative seven")
    if metadata_blocked != METADATA_BLOCKED_KEYS:
        failures.append("metadata-blocked set is not empty")
    withdrawn = {
        item["key"] for item in exclusions
        if item.get("reason") == "USER_WITHDRAWN_PERSONAL_REWORK"
    }
    if withdrawn != USER_WITHDRAWN_KEYS:
        failures.append("user-withdrawn set is not empty")
    if len(entries) != EXPECTED_FULL_SCHEDULE:
        failures.append("scheduled=%d expected %d" % (len(entries), EXPECTED_FULL_SCHEDULE))
    scheduled_keys = [item["key"] for item in entries]
    scheduled_ids = [(item["family"], item["id"]) for item in entries]
    scheduled_sources = [str(item["canonicalSource"].resolve()).lower() for item in entries]
    if len(set(scheduled_keys)) != len(scheduled_keys):
        failures.append("scheduled keys are not unique")
    if len(set(scheduled_ids)) != len(scheduled_ids):
        failures.append("scheduled family/id pairs are not unique")
    if len(set(scheduled_sources)) != len(scheduled_sources):
        failures.append("scheduled canonical model paths are not unique")
    all_keys = scheduled_keys + [item["key"] for item in exclusions]
    if len(set(all_keys)) != len(all_keys):
        failures.append("scheduled and excluded keys are not disjoint and unique")
    if failures:
        raise RuntimeError("Stage 10 z-fighting catalog contract mismatch: " + "; ".join(failures))


DERIVED_EXCLUDED_ROLES = {"evidence_only", "proof_only", "studio_only", "preview_only", "review_only"}
NON_RENDER_ROLES = {"collision", "simplified_collision", "navigation_proxy", "walkable_deck", *DERIVED_EXCLUDED_ROLES}


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


def render_exclusion_reason(obj):
    if obj.type != "MESH" or obj.data is None or not obj.data.vertices or not obj.data.polygons:
        return "NOT_RENDER_GEOMETRY"
    role = str(obj.get("mf_role") or "").lower()
    tokens = metadata_tokens(obj)
    upper = obj.name.upper()
    if (role in DERIVED_EXCLUDED_ROLES or obj.get("mf_evidence") or obj.get("mf_proof")
            or obj.get("mf_evidence_only") or obj.get("mf_proof_only") or obj.get("mf_studio_only")):
        return "EVIDENCE_OR_PROOF_ONLY"
    if "FLOOR" in tokens and tokens.intersection({"STUDIO", "SHADOW", "EVIDENCE", "REVIEW"}):
        return "STUDIO_OR_SHADOW_FLOOR"
    if "STUDIO" in tokens or "EVIDENCE" in tokens or "PROOF" in tokens:
        return "DERIVED_PREVIEW_HELPER"
    if obj.hide_render:
        return "HIDDEN_RENDER_OBJECT"
    if (obj.get("mf_collision") or "COLLISION" in upper or upper.startswith("UCX_")
            or tokens.intersection({"COL", "COLLISION"})):
        return "COLLISION"
    if upper.endswith("_NAV") or role in NON_RENDER_ROLES:
        return role.upper() if role else "NAVIGATION_PROXY"
    return None


def render_meshes():
    return sorted(
        [obj for obj in bpy.context.scene.objects if obj.type == "MESH" and render_exclusion_reason(obj) is None],
        key=lambda obj: obj.name_full,
    )


def lod_level(obj):
    value = obj.get("mf_lod", obj.data.get("mf_lod") if obj.data else None)
    if value is not None:
        try:
            return int(value)
        except (TypeError, ValueError):
            pass
    names = " ".join((obj.name, obj.data.name if obj.data else ""))
    match = re.search(r"(?:^|[_ .-])LOD[_ .-]?(\d+)(?:$|[_ .-])", names.upper() + "_")
    return int(match.group(1)) if match else 0


def quantized_point(point):
    return tuple(int(round(float(value) / EXACT_POSITION_M)) for value in point)


def face_key(points):
    return tuple(sorted(quantized_point(point) for point in points))


def oriented_face_key(points):
    """Return a cyclic-order-invariant triangle key that preserves winding."""
    values = tuple(quantized_point(point) for point in points)
    if len(values) != 3:
        return values
    return min(values, values[1:] + values[:1], values[2:] + values[:2])


GLTF_COMPONENT_FORMAT = {
    5120: ("b", 1), 5121: ("B", 1), 5122: ("h", 2),
    5123: ("H", 2), 5125: ("I", 4), 5126: ("f", 4),
}
GLTF_TYPE_COMPONENTS = {
    "SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4,
    "MAT2": 4, "MAT3": 9, "MAT4": 16,
}


def load_gltf_buffers(path):
    data = Path(path).read_bytes()
    if len(data) < 20:
        raise RuntimeError("raw GLB is truncated")
    magic, version, declared_length = struct.unpack_from("<III", data, 0)
    if magic != 0x46546C67 or version != 2:
        raise RuntimeError("raw audit requires a glTF 2.0 GLB")
    if declared_length != len(data):
        raise RuntimeError("raw GLB declared length differs from file bytes")
    json_chunk = None
    binary_chunks = []
    offset = 12
    while offset < len(data):
        if offset + 8 > len(data):
            raise RuntimeError("raw GLB has a truncated chunk header")
        chunk_length, chunk_type = struct.unpack_from("<II", data, offset)
        offset += 8
        end = offset + chunk_length
        if end > len(data):
            raise RuntimeError("raw GLB has a truncated chunk payload")
        payload = data[offset:end]
        offset = end
        if chunk_type == 0x4E4F534A:
            if json_chunk is not None:
                raise RuntimeError("raw GLB contains more than one JSON chunk")
            json_chunk = payload
        elif chunk_type == 0x004E4942:
            binary_chunks.append(payload)
    if json_chunk is None:
        raise RuntimeError("raw GLB is missing its JSON chunk")
    document = json.loads(json_chunk.rstrip(b"\0 \t\r\n").decode("utf-8"))
    buffers = []
    embedded_index = 0
    for index, record in enumerate(document.get("buffers", [])):
        uri = record.get("uri")
        if uri is None:
            if embedded_index >= len(binary_chunks):
                raise RuntimeError("raw GLB buffer %d has no BIN chunk" % index)
            payload = binary_chunks[embedded_index]
            embedded_index += 1
        elif uri.startswith("data:"):
            header, separator, encoded = uri.partition(",")
            if not separator:
                raise RuntimeError("raw glTF buffer %d has a malformed data URI" % index)
            payload = (base64.b64decode(encoded) if ";base64" in header
                       else urllib.parse.unquote_to_bytes(encoded))
        else:
            external = (Path(path).parent / urllib.parse.unquote(uri)).resolve()
            require_under(external, Path(path).parent, "raw glTF external buffer")
            if not external.is_file():
                raise RuntimeError("raw glTF external buffer is missing: " + str(external))
            payload = external.read_bytes()
        required = int(record.get("byteLength", 0))
        if required < 0 or len(payload) < required:
            raise RuntimeError("raw glTF buffer %d is shorter than byteLength" % index)
        buffers.append(payload[:required])
    return document, buffers


def normalized_component(value, component_type):
    if component_type == 5120:
        return max(float(value) / 127.0, -1.0)
    if component_type == 5121:
        return float(value) / 255.0
    if component_type == 5122:
        return max(float(value) / 32767.0, -1.0)
    if component_type == 5123:
        return float(value) / 65535.0
    if component_type == 5125:
        return float(value) / 4294967295.0
    return float(value)


def read_buffer_view_values(document, buffers, view_index, byte_offset, count,
                            component_type, component_count, normalized=False):
    if component_type not in GLTF_COMPONENT_FORMAT:
        raise RuntimeError("unsupported raw glTF componentType %r" % component_type)
    if view_index < 0 or view_index >= len(document.get("bufferViews", [])):
        raise RuntimeError("raw glTF bufferView index is out of range")
    view = document["bufferViews"][view_index]
    if view.get("extensions"):
        raise RuntimeError("compressed/extended raw glTF bufferViews are unsupported")
    buffer_index = int(view.get("buffer", 0))
    if buffer_index < 0 or buffer_index >= len(buffers):
        raise RuntimeError("raw glTF buffer index is out of range")
    fmt, component_size = GLTF_COMPONENT_FORMAT[component_type]
    element_size = component_size * component_count
    stride = int(view.get("byteStride", element_size))
    if stride < element_size:
        raise RuntimeError("raw glTF byteStride is smaller than an accessor element")
    first = int(view.get("byteOffset", 0)) + int(byte_offset)
    view_end = int(view.get("byteOffset", 0)) + int(view.get("byteLength", 0))
    payload = buffers[buffer_index]
    values = []
    for item_index in range(count):
        start = first + item_index * stride
        end = start + element_size
        if start < 0 or end > view_end or end > len(payload):
            raise RuntimeError("raw glTF accessor reads outside its bufferView")
        item = struct.unpack_from("<" + fmt * component_count, payload, start)
        if normalized:
            item = tuple(normalized_component(value, component_type) for value in item)
        values.append(item[0] if component_count == 1 else tuple(item))
    return values


def accessor_values(document, buffers, accessor_index):
    accessors = document.get("accessors", [])
    if accessor_index < 0 or accessor_index >= len(accessors):
        raise RuntimeError("raw glTF accessor index is out of range")
    accessor = accessors[accessor_index]
    component_type = int(accessor["componentType"])
    component_count = GLTF_TYPE_COMPONENTS.get(accessor.get("type"))
    if component_count is None:
        raise RuntimeError("unsupported raw glTF accessor type %r" % accessor.get("type"))
    count = int(accessor.get("count", 0))
    if count < 0:
        raise RuntimeError("raw glTF accessor count is negative")
    if "bufferView" in accessor:
        values = read_buffer_view_values(
            document, buffers, int(accessor["bufferView"]), int(accessor.get("byteOffset", 0)),
            count, component_type, component_count, bool(accessor.get("normalized")),
        )
    else:
        zero = 0.0 if component_type == 5126 or accessor.get("normalized") else 0
        values = [zero if component_count == 1 else tuple([zero] * component_count)
                  for _ in range(count)]
    sparse = accessor.get("sparse")
    if sparse:
        sparse_count = int(sparse.get("count", 0))
        indices_spec = sparse["indices"]
        sparse_indices = read_buffer_view_values(
            document, buffers, int(indices_spec["bufferView"]),
            int(indices_spec.get("byteOffset", 0)), sparse_count,
            int(indices_spec["componentType"]), 1, False,
        )
        values_spec = sparse["values"]
        sparse_values = read_buffer_view_values(
            document, buffers, int(values_spec["bufferView"]),
            int(values_spec.get("byteOffset", 0)), sparse_count,
            component_type, component_count, bool(accessor.get("normalized")),
        )
        for destination, value in zip(sparse_indices, sparse_values):
            destination = int(destination)
            if destination < 0 or destination >= len(values):
                raise RuntimeError("raw glTF sparse accessor index is out of range")
            values[destination] = value
    return values


def gltf_node_local_matrix(node):
    if "matrix" in node:
        values = node["matrix"]
        if len(values) != 16:
            raise RuntimeError("raw glTF node matrix does not have 16 values")
        return Matrix([[float(values[column * 4 + row]) for column in range(4)] for row in range(4)])
    translation = node.get("translation", (0.0, 0.0, 0.0))
    rotation = node.get("rotation", (0.0, 0.0, 0.0, 1.0))
    scale = node.get("scale", (1.0, 1.0, 1.0))
    if len(translation) != 3 or len(rotation) != 4 or len(scale) != 3:
        raise RuntimeError("raw glTF node TRS has an invalid component count")
    quaternion = Quaternion((float(rotation[3]), float(rotation[0]),
                             float(rotation[1]), float(rotation[2])))
    if quaternion.magnitude <= 1.0e-12:
        raise RuntimeError("raw glTF node has a zero-length rotation quaternion")
    quaternion.normalize()
    return (
        Matrix.Translation(Vector(tuple(float(value) for value in translation)))
        @ quaternion.to_matrix().to_4x4()
        @ Matrix.Diagonal(Vector((float(scale[0]), float(scale[1]), float(scale[2]), 1.0)))
    )


def gltf_scene_node_instances(document):
    nodes = document.get("nodes", [])
    scenes = document.get("scenes", [])
    if scenes:
        scene_index = int(document.get("scene", 0))
        if scene_index < 0 or scene_index >= len(scenes):
            raise RuntimeError("raw glTF default scene index is out of range")
        roots = [int(index) for index in scenes[scene_index].get("nodes", [])]
    else:
        children = {int(child) for node in nodes for child in node.get("children", [])}
        roots = [index for index in range(len(nodes)) if index not in children]
    instances = []
    active = set()
    visited = set()

    def visit(index, parent_matrix, ancestry):
        if index < 0 or index >= len(nodes):
            raise RuntimeError("raw glTF child node index is out of range")
        if index in active:
            raise RuntimeError("raw glTF node hierarchy contains a cycle")
        if index in visited:
            raise RuntimeError("raw glTF node is referenced by multiple parents")
        active.add(index)
        visited.add(index)
        node = nodes[index]
        world = parent_matrix @ gltf_node_local_matrix(node)
        name = str(node.get("name") or ("node_%d" % index))
        instances.append((index, node, world, ancestry))
        for child in node.get("children", []):
            visit(int(child), world, ancestry + (name,))
        active.remove(index)

    for root in roots:
        visit(root, Matrix.Identity(4), ())
    return instances


def raw_node_exclusion_reason(node, mesh, ancestry):
    node_extras = node.get("extras") if isinstance(node.get("extras"), dict) else {}
    mesh_extras = mesh.get("extras") if isinstance(mesh.get("extras"), dict) else {}
    extras = {**mesh_extras, **node_extras}
    role = str(extras.get("mf_role") or "").lower()
    name = str(node.get("name") or mesh.get("name") or "")
    upper = name.upper()
    tokens = set(filter(None, re.split(
        r"[^A-Z0-9]+", " ".join((*ancestry, name, str(mesh.get("name") or ""))).upper()
    )))
    if (role in DERIVED_EXCLUDED_ROLES or extras.get("mf_evidence")
            or extras.get("mf_proof") or extras.get("mf_evidence_only")
            or extras.get("mf_proof_only") or extras.get("mf_studio_only")):
        return "EVIDENCE_OR_PROOF_ONLY"
    if "FLOOR" in tokens and tokens.intersection({"STUDIO", "SHADOW", "EVIDENCE", "REVIEW"}):
        return "STUDIO_OR_SHADOW_FLOOR"
    if tokens.intersection({"STUDIO", "EVIDENCE", "PROOF"}):
        return "DERIVED_PREVIEW_HELPER"
    if (extras.get("mf_collision") or "COLLISION" in upper or upper.startswith("UCX_")
            or tokens.intersection({"COL", "COLLISION"})):
        return "COLLISION"
    if upper.endswith("_NAV") or role in NON_RENDER_ROLES:
        return role.upper() if role else "NAVIGATION_PROXY"
    return None


def raw_lod_level(node, mesh):
    node_extras = node.get("extras") if isinstance(node.get("extras"), dict) else {}
    mesh_extras = mesh.get("extras") if isinstance(mesh.get("extras"), dict) else {}
    value = node_extras.get("mf_lod", mesh_extras.get("mf_lod"))
    if value is not None:
        try:
            return int(value)
        except (TypeError, ValueError):
            pass
    names = " ".join((str(node.get("name") or ""), str(mesh.get("name") or "")))
    match = re.search(r"(?:^|[_ .-])LOD[_ .-]?(\d+)(?:$|[_ .-])", names.upper() + "_")
    return int(match.group(1)) if match else 0


def transformed_position(matrix, value):
    if not isinstance(value, (tuple, list)) or len(value) < 3:
        raise RuntimeError("raw glTF POSITION accessor is not VEC3")
    result = matrix @ Vector((float(value[0]), float(value[1]), float(value[2]), 1.0))
    if abs(result[3]) <= 1.0e-15:
        raise RuntimeError("raw glTF node transform produced a zero homogeneous coordinate")
    return Vector((result[0] / result[3], result[1] / result[3], result[2] / result[3]))


def primitive_triangle_indices(indices, mode):
    if mode == 4:
        if len(indices) % 3:
            raise RuntimeError("raw glTF TRIANGLES primitive index count is not divisible by three")
        return [tuple(indices[index:index + 3]) for index in range(0, len(indices), 3)]
    if mode == 5:
        result = []
        for index in range(len(indices) - 2):
            triangle = (indices[index + 1], indices[index], indices[index + 2]) if index % 2 else (
                indices[index], indices[index + 1], indices[index + 2])
            result.append(triangle)
        return result
    if mode == 6:
        return [(indices[0], indices[index], indices[index + 1])
                for index in range(1, len(indices) - 1)] if indices else []
    return []


def audit_raw_glb(path):
    document, buffers = load_gltf_buffers(path)
    meshes = document.get("meshes", [])
    render_nodes = []
    excluded_nodes = []
    duplicate_groups = []
    primitive_count = 0
    indexed_primitive_count = 0
    nonindexed_primitive_count = 0
    triangle_count = 0
    degenerate_count = 0
    exact_duplicate_count = 0
    for node_index, node, world, ancestry in gltf_scene_node_instances(document):
        if "mesh" not in node:
            continue
        if "skin" in node:
            raise RuntimeError("raw GLB audit does not accept skinned Stage 10 model nodes")
        if node.get("extensions", {}).get("EXT_mesh_gpu_instancing"):
            raise RuntimeError("raw GLB audit does not accept GPU-instanced Stage 10 model nodes")
        mesh_index = int(node["mesh"])
        if mesh_index < 0 or mesh_index >= len(meshes):
            raise RuntimeError("raw glTF mesh index is out of range")
        mesh = meshes[mesh_index]
        reason = raw_node_exclusion_reason(node, mesh, ancestry)
        name = str(node.get("name") or mesh.get("name") or ("node_%d" % node_index))
        if reason:
            excluded_nodes.append({"nodeIndex": node_index, "name": name, "reason": reason})
            continue
        if mesh.get("weights") or node.get("weights"):
            raise RuntimeError("raw GLB audit does not accept active morph weights")
        face_counts = Counter()
        face_samples = {}
        node_triangles = 0
        node_primitives = 0
        node_degenerate = 0
        for primitive_index, primitive in enumerate(mesh.get("primitives", [])):
            mode = int(primitive.get("mode", 4))
            if mode not in (4, 5, 6):
                continue
            if primitive.get("extensions", {}).get("KHR_draco_mesh_compression"):
                raise RuntimeError("raw GLB audit does not accept Draco-compressed Stage 10 primitives")
            if primitive.get("targets"):
                raise RuntimeError("raw GLB audit does not accept morph-target Stage 10 primitives")
            attributes = primitive.get("attributes", {})
            if "POSITION" not in attributes:
                raise RuntimeError("raw glTF triangle primitive has no POSITION accessor")
            positions = accessor_values(document, buffers, int(attributes["POSITION"]))
            if "indices" in primitive:
                indices = [int(value) for value in accessor_values(
                    document, buffers, int(primitive["indices"]),
                )]
                indexed_primitive_count += 1
            else:
                indices = list(range(len(positions)))
                nonindexed_primitive_count += 1
            primitive_count += 1
            node_primitives += 1
            for triangle_index, triangle in enumerate(primitive_triangle_indices(indices, mode)):
                if any(index < 0 or index >= len(positions) for index in triangle):
                    raise RuntimeError("raw glTF triangle index is outside POSITION accessor")
                points = tuple(transformed_position(world, positions[index]) for index in triangle)
                if triangle_geometry(points) is None:
                    degenerate_count += 1
                    node_degenerate += 1
                    continue
                key = oriented_face_key(points)
                face_counts[key] += 1
                face_samples.setdefault(key, {
                    "primitiveIndex": primitive_index, "triangleIndex": triangle_index,
                    "faceKeySha256": canonical_hash(key),
                })
                triangle_count += 1
                node_triangles += 1
        node_duplicate_groups = 0
        node_duplicate_faces = 0
        for key, copies in face_counts.items():
            if copies <= 1:
                continue
            node_duplicate_groups += 1
            node_duplicate_faces += copies - 1
            if len(duplicate_groups) < MAX_SAMPLES_PER_PAIR:
                duplicate_groups.append({
                    "nodeIndex": node_index, "name": name, "lod": raw_lod_level(node, mesh),
                    "copies": copies, **face_samples[key],
                })
        exact_duplicate_count += node_duplicate_faces
        render_nodes.append({
            "nodeIndex": node_index, "name": name, "meshIndex": mesh_index,
            "lod": raw_lod_level(node, mesh), "primitiveCount": node_primitives,
            "triangles": node_triangles, "degenerateTrianglesIgnored": node_degenerate,
            "exactDuplicateTriangleGroups": node_duplicate_groups,
            "exactDuplicateTriangles": node_duplicate_faces,
            "worldMatrix": [round(float(world[row][column]), 12)
                            for row in range(4) for column in range(4)],
        })
    result = {
        "method": RAW_GLTF_AUDIT_METHOD,
        "sourceSha256": sha256(path),
        "bufferSha256": [hashlib.sha256(payload).hexdigest() for payload in buffers],
        "sceneNodeCount": len(gltf_scene_node_instances(document)),
        "renderNodeCount": len(render_nodes), "excludedNodeCount": len(excluded_nodes),
        "primitiveCount": primitive_count, "indexedPrimitiveCount": indexed_primitive_count,
        "nonIndexedPrimitiveCount": nonindexed_primitive_count,
        "triangles": triangle_count, "degenerateTrianglesIgnored": degenerate_count,
        "exactDuplicateTriangleGroupsWithinRenderNode": sum(
            item["exactDuplicateTriangleGroups"] for item in render_nodes),
        "exactDuplicateTrianglesWithinRenderNode": exact_duplicate_count,
        "duplicateSamples": duplicate_groups,
        "renderNodes": render_nodes, "excludedNodes": excluded_nodes,
        "passed": exact_duplicate_count == 0,
    }
    result["metricsSha256"] = canonical_hash(result)
    return result


def triangle_geometry(points):
    first, second, third = points
    cross = (second - first).cross(third - first)
    magnitude = cross.length
    if magnitude <= 1.0e-14:
        return None
    normal = cross / magnitude
    mins = tuple(min(float(point[axis]) for point in points) for axis in range(3))
    maxs = tuple(max(float(point[axis]) for point in points) for axis in range(3))
    return {
        "points": tuple(tuple(float(value) for value in point) for point in points),
        "normal": tuple(float(value) for value in normal),
        "area": magnitude * 0.5, "aabbMin": mins, "aabbMax": maxs,
        "exactKey": oriented_face_key(points),
    }


def collect_geometry(objects):
    triangles_by_lod = defaultdict(list)
    mesh_records = []
    triangle_id = 0
    bounds_min = [math.inf, math.inf, math.inf]
    bounds_max = [-math.inf, -math.inf, -math.inf]
    for obj in objects:
        lod = lod_level(obj)
        world = obj.matrix_world
        face_keys = []
        degenerate_face_keys = []
        degenerate_triangles = 0
        triangle_count = 0
        for polygon in obj.data.polygons:
            points = [world @ obj.data.vertices[index].co for index in polygon.vertices]
            geometries = []
            for local_index in range(1, len(points) - 1):
                geometry = triangle_geometry((points[0], points[local_index], points[local_index + 1]))
                if geometry is None:
                    degenerate_triangles += 1
                    continue
                geometries.append((local_index, geometry))
            if not geometries:
                degenerate_face_keys.append(face_key(points))
                continue
            for point in points:
                for axis in range(3):
                    bounds_min[axis] = min(bounds_min[axis], float(point[axis]))
                    bounds_max[axis] = max(bounds_max[axis], float(point[axis]))
            face_keys.append(oriented_face_key(points))
            for local_index, geometry in geometries:
                geometry.update({
                    "id": triangle_id, "object": obj.name_full,
                    "faceIndex": polygon.index, "triangleInFace": local_index - 1,
                    "lod": lod,
                })
                triangle_id += 1
                triangle_count += 1
                triangles_by_lod[lod].append(geometry)
        counts = Counter(face_keys)
        degenerate_counts = Counter(degenerate_face_keys)
        duplicates = [
            {"faceKeySha256": canonical_hash(key), "copies": count}
            for key, count in counts.items() if count > 1
        ]
        degenerate_duplicates = [
            {"faceKeySha256": canonical_hash(key), "copies": count}
            for key, count in degenerate_counts.items() if count > 1
        ]
        mesh_records.append({
            "name": obj.name_full, "lod": lod,
            "vertices": len(obj.data.vertices), "faces": len(obj.data.polygons),
            "triangles": triangle_count, "degenerateTrianglesIgnored": degenerate_triangles,
            "degenerateFacesIgnored": len(degenerate_face_keys),
            "degenerateDuplicateFaceGroupsIgnored": len(degenerate_duplicates),
            "degenerateDuplicateFacesIgnored": sum(
                item["copies"] - 1 for item in degenerate_duplicates),
            "degenerateDuplicateFaceSamplesIgnored": degenerate_duplicates[:MAX_SAMPLES_PER_PAIR],
            "faceKeys": frozenset(face_keys), "faceKeyCounts": counts,
            "faceKeyCount": len(face_keys), "uniqueFaceKeyCount": len(counts),
            "faceMultisetSha256": canonical_hash(sorted((key, count) for key, count in counts.items())),
            "exactDuplicateFaceGroups": len(duplicates),
            "exactDuplicateFaces": sum(item["copies"] - 1 for item in duplicates),
            "exactDuplicateFaceSamples": duplicates[:MAX_SAMPLES_PER_PAIR],
        })
    if triangle_id == 0:
        raise RuntimeError("repair output contains no nondegenerate render triangles")
    dimensions = [max(0.0, bounds_max[axis] - bounds_min[axis]) for axis in range(3)]
    diagonal = math.sqrt(sum(value * value for value in dimensions))
    return triangles_by_lod, mesh_records, {
        "min": bounds_min, "max": bounds_max, "dimensions": dimensions, "diagonal": diagonal,
    }


def duplicate_mesh_pairs(mesh_records):
    identical = []
    nested = []
    skip_pairs = set()
    by_lod = defaultdict(list)
    for mesh in mesh_records:
        by_lod[mesh["lod"]].append(mesh)
    for lod, meshes in by_lod.items():
        for first, second in itertools.combinations(meshes, 2):
            pair = tuple(sorted((first["name"], second["name"])))
            if first["faceKeyCounts"] == second["faceKeyCounts"]:
                identical.append({
                    "lod": lod, "meshA": pair[0], "meshB": pair[1],
                    "faces": first["faceKeyCount"], "kind": "EXACT_IDENTICAL_RENDER_MESH",
                })
                skip_pairs.add(pair)
                continue
            smaller, larger = (first, second) if first["faceKeyCount"] <= second["faceKeyCount"] else (second, first)
            if (smaller["faceKeyCount"] >= 2
                    and all(count <= larger["faceKeyCounts"].get(key, 0)
                            for key, count in smaller["faceKeyCounts"].items())):
                nested.append({
                    "lod": lod, "meshA": pair[0], "meshB": pair[1],
                    "nestedMesh": smaller["name"], "containerMesh": larger["name"],
                    "nestedFaces": smaller["faceKeyCount"], "containerFaces": larger["faceKeyCount"],
                    "kind": "FULLY_NESTED_IDENTICAL_FACE_SET",
                })
                skip_pairs.add(pair)
    return identical, nested, skip_pairs


def aabb_overlap(first, second, padding=0.0):
    return all(
        first["aabbMin"][axis] <= second["aabbMax"][axis] + padding
        and second["aabbMin"][axis] <= first["aabbMax"][axis] + padding
        for axis in range(3)
    )


def signed_area2(polygon):
    return sum(
        polygon[index][0] * polygon[(index + 1) % len(polygon)][1]
        - polygon[(index + 1) % len(polygon)][0] * polygon[index][1]
        for index in range(len(polygon))
    )


def line_intersection(first, second, clip_a, clip_b):
    edge = (clip_b[0] - clip_a[0], clip_b[1] - clip_a[1])
    segment = (second[0] - first[0], second[1] - first[1])
    denominator = segment[0] * edge[1] - segment[1] * edge[0]
    if abs(denominator) < 1.0e-18:
        return second
    delta = (clip_a[0] - first[0], clip_a[1] - first[1])
    amount = (delta[0] * edge[1] - delta[1] * edge[0]) / denominator
    return (first[0] + amount * segment[0], first[1] + amount * segment[1])


def triangle_intersection_area(first, second, drop_axis):
    axes = [axis for axis in range(3) if axis != drop_axis]
    subject = [(point[axes[0]], point[axes[1]]) for point in first]
    clip = [(point[axes[0]], point[axes[1]]) for point in second]
    orientation = 1.0 if signed_area2(clip) >= 0.0 else -1.0
    output = subject
    for index, clip_a in enumerate(clip):
        clip_b = clip[(index + 1) % len(clip)]
        incoming = output
        output = []
        if not incoming:
            break
        previous = incoming[-1]
        previous_cross = orientation * (
            (clip_b[0] - clip_a[0]) * (previous[1] - clip_a[1])
            - (clip_b[1] - clip_a[1]) * (previous[0] - clip_a[0])
        )
        for current in incoming:
            current_cross = orientation * (
                (clip_b[0] - clip_a[0]) * (current[1] - clip_a[1])
                - (clip_b[1] - clip_a[1]) * (current[0] - clip_a[0])
            )
            current_inside = current_cross >= -1.0e-12
            previous_inside = previous_cross >= -1.0e-12
            if current_inside:
                if not previous_inside:
                    output.append(line_intersection(previous, current, clip_a, clip_b))
                output.append(current)
            elif previous_inside:
                output.append(line_intersection(previous, current, clip_a, clip_b))
            previous = current
            previous_cross = current_cross
    return abs(signed_area2(output)) * 0.5 if len(output) >= 3 else 0.0


def near_coplanar_overlap(first, second):
    if not aabb_overlap(first, second, PLANE_DISTANCE_M):
        return None
    normal_a = Vector(first["normal"])
    normal_b = Vector(second["normal"])
    normal_dot = normal_a.dot(normal_b)
    if normal_dot < NORMAL_DOT_MIN:
        return None
    point_a = Vector(first["points"][0])
    point_b = Vector(second["points"][0])
    distance_ab = max(abs(normal_a.dot(Vector(point) - point_a)) for point in second["points"])
    distance_ba = max(abs(normal_b.dot(Vector(point) - point_b)) for point in first["points"])
    plane_distance = max(distance_ab, distance_ba)
    if plane_distance > PLANE_DISTANCE_M:
        return None
    drop_axis = max(range(3), key=lambda axis: abs(normal_a[axis]))
    overlap = triangle_intersection_area(first["points"], second["points"], drop_axis)
    threshold = max(MINIMUM_OVERLAP_AREA_M2, min(first["area"], second["area"]) * MINIMUM_OVERLAP_FRACTION)
    if overlap <= threshold:
        return None
    return {
        "overlapAreaM2": overlap,
        "fractionOfSmaller": overlap / min(first["area"], second["area"]),
        "planeDistanceM": plane_distance,
        "normalDot": normal_dot,
    }


def audit_coplanar(triangles_by_lod, bounds, skip_object_pairs):
    pair_records = {}
    total_candidates = 0
    exact_cross_face_pairs = 0
    near_overlap_pairs = 0
    bvh_build_seconds = 0.0
    bvh_nearest_range_seconds = 0.0
    nearest_range_hits = 0
    ordered_candidate_pairs = 0
    lod_metrics = []

    def pair_record(first, second):
        names = tuple(sorted((first["object"], second["object"])))
        key = (first["lod"], names[0], names[1])
        if key not in pair_records:
            pair_records[key] = {
                "lod": first["lod"], "meshA": names[0], "meshB": names[1],
                "exactCrossMeshFaceOverlaps": 0, "nearCoplanarFaceOverlaps": 0,
                "maximumOverlapAreaM2": 0.0, "maximumOverlapFraction": 0.0,
                "maximumPlaneDistanceM": 0.0, "samples": [],
            }
        return pair_records[key]

    for lod, triangles in sorted(triangles_by_lod.items()):
        def inspect(first, second):
            nonlocal total_candidates, exact_cross_face_pairs, near_overlap_pairs
            if first["id"] == second["id"]:
                return
            if first["object"] == second["object"] and first["faceIndex"] == second["faceIndex"]:
                return
            object_pair = tuple(sorted((first["object"], second["object"])))
            if first["object"] != second["object"] and object_pair in skip_object_pairs:
                return
            total_candidates += 1
            if first["exactKey"] == second["exactKey"]:
                if first["object"] != second["object"]:
                    record = pair_record(first, second)
                    record["exactCrossMeshFaceOverlaps"] += 1
                    exact_cross_face_pairs += 1
                    if len(record["samples"]) < MAX_SAMPLES_PER_PAIR:
                        record["samples"].append({
                            "kind": "EXACT_CROSS_MESH_FACE",
                            "faceA": first["faceIndex"], "faceB": second["faceIndex"],
                        })
                return
            overlap = near_coplanar_overlap(first, second)
            if overlap is None:
                return
            record = pair_record(first, second)
            record["nearCoplanarFaceOverlaps"] += 1
            record["maximumOverlapAreaM2"] = max(record["maximumOverlapAreaM2"], overlap["overlapAreaM2"])
            record["maximumOverlapFraction"] = max(record["maximumOverlapFraction"], overlap["fractionOfSmaller"])
            record["maximumPlaneDistanceM"] = max(record["maximumPlaneDistanceM"], overlap["planeDistanceM"])
            near_overlap_pairs += 1
            if len(record["samples"]) < MAX_SAMPLES_PER_PAIR:
                record["samples"].append({
                    "kind": "NEAR_COPLANAR_OVERLAP", "faceA": first["faceIndex"],
                    "faceB": second["faceIndex"],
                    **{key: round(value, 10) for key, value in overlap.items()},
                })

        build_started = time.time()
        vertices = [point for triangle in triangles for point in triangle["points"]]
        polygons = [
            (index * 3, index * 3 + 1, index * 3 + 2)
            for index in range(len(triangles))
        ]
        bvh = BVHTree.FromPolygons(
            vertices, polygons, all_triangles=True, epsilon=PLANE_DISTANCE_M,
        )
        del vertices, polygons
        build_duration = time.time() - build_started
        bvh_build_seconds += build_duration
        nearest_started = time.time()
        lod_nearest_hits = 0
        lod_ordered_pairs = 0
        for first_index, triangle in enumerate(triangles):
            points = [Vector(point) for point in triangle["points"]]
            centre = sum(points, Vector()) / 3.0
            radius = max((point - centre).length for point in points) + PLANE_DISTANCE_M * 2.0
            hits = bvh.find_nearest_range(centre, radius)
            lod_nearest_hits += len(hits)
            for _, _, second_index, _ in hits:
                if second_index <= first_index:
                    continue
                lod_ordered_pairs += 1
                inspect(triangle, triangles[second_index])
        nearest_duration = time.time() - nearest_started
        del bvh
        nearest_range_hits += lod_nearest_hits
        ordered_candidate_pairs += lod_ordered_pairs
        bvh_nearest_range_seconds += nearest_duration
        lod_metrics.append({
            "lod": lod, "triangles": len(triangles),
            "nearestRangeHitsReturned": lod_nearest_hits,
            "orderedCandidatePairsExamined": lod_ordered_pairs,
            "buildSeconds": round(build_duration, 3),
            "nearestRangeSeconds": round(nearest_duration, 3),
        })
    return {
        "method": BROAD_PHASE_METHOD,
        "nearestRangeHitsReturned": nearest_range_hits,
        "orderedCandidatePairsExamined": ordered_candidate_pairs,
        "candidatePairsTested": total_candidates,
        "bvhBuildSeconds": round(bvh_build_seconds, 3),
        "bvhNearestRangeSeconds": round(bvh_nearest_range_seconds, 3),
        "lodMetrics": lod_metrics,
        "exactCrossMeshFaceOverlaps": exact_cross_face_pairs,
        "nearCoplanarFaceOverlaps": near_overlap_pairs,
        "meshPairFindings": sorted(pair_records.values(), key=lambda item: (item["lod"], item["meshA"], item["meshB"])),
    }


def repair_report_path(repair_root, entry):
    return repair_root / "reports" / entry["family"] / (safe_id(entry["id"]) + ".json")


def pbr_report_path(repair_root, entry):
    return repair_root / "pbr-reports" / entry["family"] / (safe_id(entry["id"]) + ".json")


def audit_report_path(output_root, entry):
    return output_root / "z-fighting-reports" / entry["family"] / (safe_id(entry["id"]) + ".json")


def material_semantic_contract_green(entry, repair):
    contract = repair.get("materialSemanticContract", {})
    names = contract.get("originalMaterialNames")
    if not isinstance(names, list) or any(not isinstance(name, str) for name in names):
        return False
    expected_base = assert_material_semantic_names(names)
    inventory = {
        "key": entry["key"],
        "sourceSha256": repair.get("sourceSha256"),
        "materialNames": names,
    }
    return (
        contract.get("preflightScope") == "ORIGINAL_GLB_JSON_MATERIAL_DEFINITIONS"
        and contract.get("sourceSha256") == repair.get("sourceSha256")
        and contract.get("materialSlotCount") == len(names)
        and contract.get("materialInventorySha256") == canonical_hash(inventory)
        and all(contract.get(field) == value for field, value in expected_base.items())
    )


def aggregate_coherent_proof_green(cleanup) -> bool:
    proof = cleanup.get("lineageProof", {})
    passes = cleanup.get("stabilizationPasses")
    count_fields = (
        "aggregateCoherentLineagePairGroups",
        "aggregateCoherentCrossingGroups",
        "aggregateMixedSignedWinnerGroups",
        "aggregateCoherentPairAssignments",
    )
    area_fields = (
        "aggregateCoherentPairLocalCoverageAreaSumM2",
        "aggregateCoherentMaximumCoverageDeltaM2",
    )
    if not isinstance(passes, list):
        return False
    counts = {field: 0 for field in count_fields}
    coverage_area = 0.0
    maximum_delta = 0.0
    for pass_report in passes:
        conflicts = pass_report.get("conflicts", {})
        if (
            any(type(conflicts.get(field)) is not int or conflicts[field] < 0
                for field in count_fields)
            or any(not isinstance(conflicts.get(field), (int, float))
                   or isinstance(conflicts[field], bool)
                   or not math.isfinite(conflicts[field])
                   or conflicts[field] < 0.0 for field in area_fields)
            or conflicts.get("aggregateCoherentCoveragePreserved") is not True
            or conflicts["aggregateCoherentCrossingGroups"]
            > conflicts["aggregateCoherentLineagePairGroups"]
            or conflicts["aggregateMixedSignedWinnerGroups"]
            > conflicts["aggregateCoherentLineagePairGroups"]
            or conflicts["aggregateCoherentPairAssignments"]
            < conflicts["aggregateCoherentLineagePairGroups"]
        ):
            return False
        for field in count_fields:
            counts[field] += conflicts[field]
        coverage_area += conflicts["aggregateCoherentPairLocalCoverageAreaSumM2"]
        maximum_delta = max(
            maximum_delta, conflicts["aggregateCoherentMaximumCoverageDeltaM2"]
        )
    expected = {
        **counts,
        "aggregateCoherentPairLocalCoverageAreaSumM2": coverage_area,
        "aggregateCoherentMaximumCoverageDeltaM2": maximum_delta,
        "aggregateCoherentCoveragePreserved": True,
    }
    return (
        all(
            cleanup.get(field) == value and proof.get(field) == value
            for field, value in expected.items()
        )
        and proof.get("aggregateCoherentCrossingExpandsAcceptedCoverage") is False
        and cleanup.get("proofExpectations", {}).get(
            "aggregateCoherentCrossingExpandsAcceptedCoverage"
        ) is False
        and cleanup.get("proofExpectations", {}).get(
            "aggregateCoherentCoveragePreserved"
        ) is True
    )


def immutable_plane_partition_proof_green(cleanup):
    lineage = cleanup.get("lineageProof", {})
    partition = cleanup.get("float32PartitionRealizationProof")
    objects = cleanup.get("objects")
    passes = cleanup.get("stabilizationPasses")
    expectations = cleanup.get("proofExpectations", {})
    if (not isinstance(partition, dict) or not isinstance(objects, list)
            or not isinstance(passes, list)
            or lineage.get("float32PartitionRealization") != partition):
        return False
    immutable_count = 0
    immutable_area = 0.0
    for pass_report in passes:
        conflicts = pass_report.get("conflicts", {})
        count = conflicts.get("immutablePlaneSubsequentPassReconstructions")
        area = conflicts.get("immutablePlaneSubsequentPassReconstructionAreaM2")
        if (type(count) is not int or count < 0
                or not isinstance(area, (int, float)) or isinstance(area, bool)
                or not math.isfinite(area) or area < 0.0
                or conflicts.get(
                    "immutablePlaneSubsequentPassAcceptedCoverageExpanded"
                ) is not False):
            return False
        immutable_count += count
        immutable_area += area
    if (lineage.get("subsequentPassReconstructionPlane")
            != "IMMUTABLE_SOURCE_LINEAGE_PLANE_WITH_CANONICAL_EDGES"
            or cleanup.get("immutablePlaneSubsequentPassReconstructions")
            != immutable_count
            or lineage.get("immutablePlaneSubsequentPassReconstructions")
            != immutable_count
            or cleanup.get("immutablePlaneSubsequentPassReconstructionAreaM2")
            != immutable_area
            or lineage.get("immutablePlaneSubsequentPassReconstructionAreaM2")
            != immutable_area
            or cleanup.get("immutablePlaneSubsequentPassAcceptedCoverageExpanded")
            is not False
            or lineage.get("immutablePlaneSubsequentPassAcceptedCoverageExpanded")
            is not False
            or expectations.get(
                "subsequentPassReconstructionExpandsAcceptedCoverage"
            ) is not False):
        return False
    integer_fields = (
        "float32PartitionRealizationEnabledConsolidations",
        "float32PartitionRealizationApplications",
        "float32PartitionRealizationAdjustments",
        "float32PartitionRealizationAcceptedPairsBefore",
        "float32PartitionRealizationAcceptedPairsAfter",
        "float32PartitionRealizationDegenerateTriangles",
        "float32PartitionRealizationInvertedTriangles",
        "float32PartitionRealizationInternalDuplicateFaces",
        "float32PartitionRealizationInternalEdgeViolations",
        "float32PartitionRealizationNearDuplicateSharedEndpointViolations",
        "lineageScopedSharedMeshVertexIndexReuses",
    )
    numeric_fields = (
        "float32PartitionRealizationMaximumProjectedOverlapAreaM2",
        "float32PartitionRealizationTotalProjectedOverlapAreaM2",
        "float32PartitionRealizationMaximumProjectedSymmetricDifferenceM2",
        "float32PartitionRealizationTotalProjectedSymmetricDifferenceM2",
        "float32PartitionRealizationMaximumCoverageExpansionAreaM2",
        "float32PartitionRealizationTotalCoverageExpansionAreaM2",
        "float32PartitionRealizationMaximumPreexistingSymmetricDifferenceM2",
        "float32PartitionRealizationMaximumPreexistingExpansionAreaM2",
        "float32PartitionRealizationMaximumSourcePlaneDriftM",
        "float32PartitionRealizationMaximumWorldShiftM",
    )
    for item in objects:
        if (not isinstance(item, dict)
                or any(type(item.get(field)) is not int or item[field] < 0
                       for field in integer_fields)
                or any(not isinstance(item.get(field), (int, float))
                       or isinstance(item[field], bool)
                       or not math.isfinite(item[field]) or item[field] < 0.0
                       for field in numeric_fields)
                or item["float32PartitionRealizationApplications"]
                > item["float32PartitionRealizationEnabledConsolidations"]):
            return False
        if (item["float32PartitionRealizationApplications"] > 0
                and (item["float32PartitionRealizationAdjustments"] <= 0
                     or item["lineageScopedSharedMeshVertexIndexReuses"] <= 0)):
            return False
    applied = [item for item in objects
               if item["float32PartitionRealizationApplications"] > 0]
    maximum = lambda field: max((item[field] for item in applied), default=0.0)
    total = lambda field: sum(item[field] for item in applied)
    expected = {
        "method": "TOPOLOGY_ACCEPTED_PAIR_TRIGGERED_ADJACENT_FLOAT32_OMITTED_AXIS_ULP",
        "enabledConsolidations": sum(item["float32PartitionRealizationEnabledConsolidations"] for item in objects),
        "applications": sum(item["float32PartitionRealizationApplications"] for item in objects),
        "adjustments": sum(item["float32PartitionRealizationAdjustments"] for item in objects),
        "acceptedPairsBefore": sum(item["float32PartitionRealizationAcceptedPairsBefore"] for item in objects),
        "acceptedPairsAfter": sum(item["float32PartitionRealizationAcceptedPairsAfter"] for item in objects),
        "allFreshScansZero": all(item.get("float32PartitionRealizationAllFreshScansZero") is True for item in applied),
        "allDistinctProjectedVerticesPreserved": all(item.get("float32PartitionRealizationAllDistinctProjectedVerticesPreserved") is True for item in applied),
        "allMergesProjectedVerticesFalse": all(item.get("float32PartitionRealizationAllMergesProjectedVerticesFalse") is True for item in applied),
        "maximumProjectedOverlapAreaM2": maximum("float32PartitionRealizationMaximumProjectedOverlapAreaM2"),
        "totalProjectedOverlapAreaM2": total("float32PartitionRealizationTotalProjectedOverlapAreaM2"),
        "maximumProjectedSymmetricDifferenceM2": maximum("float32PartitionRealizationMaximumProjectedSymmetricDifferenceM2"),
        "totalProjectedSymmetricDifferenceM2": total("float32PartitionRealizationTotalProjectedSymmetricDifferenceM2"),
        "maximumCoverageExpansionAreaM2": maximum("float32PartitionRealizationMaximumCoverageExpansionAreaM2"),
        "totalCoverageExpansionAreaM2": total("float32PartitionRealizationTotalCoverageExpansionAreaM2"),
        "acceptedCoverageExpanded": any(item.get("float32PartitionRealizationAcceptedCoverageExpanded") is True for item in applied),
        "allExpandsAcceptedCoverageFalse": all(item.get("float32PartitionRealizationAllExpandsAcceptedCoverageFalse") is True for item in applied),
        "allPreexistingCanonicalEdgeCoverageDeltasUnchanged": all(item.get("float32PartitionRealizationAllPreexistingCoverageDeltasUnchanged") is True for item in applied),
        "maximumPreexistingCanonicalEdgeSymmetricDifferenceM2": maximum("float32PartitionRealizationMaximumPreexistingSymmetricDifferenceM2"),
        "maximumPreexistingCanonicalEdgeExpansionAreaM2": maximum("float32PartitionRealizationMaximumPreexistingExpansionAreaM2"),
        "degenerateTriangles": sum(item["float32PartitionRealizationDegenerateTriangles"] for item in applied),
        "invertedTriangles": sum(item["float32PartitionRealizationInvertedTriangles"] for item in applied),
        "internalDuplicateFaces": sum(item["float32PartitionRealizationInternalDuplicateFaces"] for item in applied),
        "internalEdgeViolations": sum(item["float32PartitionRealizationInternalEdgeViolations"] for item in applied),
        "nearDuplicateIntendedSharedEndpointViolations": sum(item["float32PartitionRealizationNearDuplicateSharedEndpointViolations"] for item in applied),
        "allRepresentationalBoundsPassed": all(item.get("float32PartitionRealizationAllRepresentationalBoundsPassed") is True for item in applied),
        "allActualDriftBoundsPassed": all(item.get("float32PartitionRealizationAllActualDriftBoundsPassed") is True for item in applied),
        "maximumSourcePlaneDriftM": maximum("float32PartitionRealizationMaximumSourcePlaneDriftM"),
        "maximumWorldShiftM": maximum("float32PartitionRealizationMaximumWorldShiftM"),
        "sharedMeshVertexIndexReuses": sum(item["lineageScopedSharedMeshVertexIndexReuses"] for item in objects),
        "sharedMeshVertexIndexReusePassed": all(item.get("sharedMeshVertexIndexReusePassed") is True for item in objects if item.get("mutated")),
    }
    expected["passed"] = (
        expected["acceptedPairsAfter"] == 0
        and expected["allFreshScansZero"]
        and expected["allDistinctProjectedVerticesPreserved"]
        and expected["allMergesProjectedVerticesFalse"]
        and expected["maximumProjectedOverlapAreaM2"] == 0.0
        and expected["totalProjectedOverlapAreaM2"] == 0.0
        and expected["maximumProjectedSymmetricDifferenceM2"] == 0.0
        and expected["totalProjectedSymmetricDifferenceM2"] == 0.0
        and expected["maximumCoverageExpansionAreaM2"] == 0.0
        and expected["totalCoverageExpansionAreaM2"] == 0.0
        and not expected["acceptedCoverageExpanded"]
        and expected["allExpandsAcceptedCoverageFalse"]
        and expected["allPreexistingCanonicalEdgeCoverageDeltasUnchanged"]
        and expected["degenerateTriangles"] == 0
        and expected["invertedTriangles"] == 0
        and expected["internalDuplicateFaces"] == 0
        and expected["internalEdgeViolations"] == 0
        and expected["nearDuplicateIntendedSharedEndpointViolations"] == 0
        and expected["allRepresentationalBoundsPassed"]
        and expected["allActualDriftBoundsPassed"]
        and expected["maximumSourcePlaneDriftM"] <= 5.01e-4
        and expected["sharedMeshVertexIndexReusePassed"]
    )
    expected_expectations = {
        "float32PartitionRealizationPassed": True,
        "float32PartitionProjectedOverlapAreaM2": 0.0,
        "float32PartitionProjectedSymmetricDifferenceM2": 0.0,
        "float32PartitionCoverageExpansionAreaM2": 0.0,
        "float32PartitionAcceptedPairsAfter": 0,
        "float32PartitionSharedMeshVertexIndexReusePassed": True,
        "float32PartitionPreexistingCanonicalEdgeCoverageDeltaUnchanged": True,
    }
    return (partition == expected and expected["passed"] is True
            and all(expectations.get(field) == value
                    for field, value in expected_expectations.items()))


def lineage_proof_green(cleanup):
    proof = cleanup.get("lineageProof", {})
    objects = cleanup.get("objects")
    numeric_fields = (
        "maximumSourcePlaneMeasuredStoredDriftM",
        "maximumSourcePlaneArithmeticGuardM",
        "maximumSourcePlaneMeasuredStoredDriftPlusArithmeticGuardM",
        "maximumSourcePlaneRepresentationalErrorBoundM",
    )

    def finite_nonnegative(value):
        return (
            isinstance(value, (int, float)) and not isinstance(value, bool)
            and math.isfinite(value) and value >= 0.0
        )

    if not isinstance(objects, list) or any(
            not isinstance(item, dict)
            or type(item.get("lineageConsolidationCount")) is not int
            or item["lineageConsolidationCount"] < 0
            or type(item.get("sourcePlaneProofConsolidationCount")) is not int
            or item["sourcePlaneProofConsolidationCount"] < 0
            or item["sourcePlaneProofConsolidationCount"]
            > item["lineageConsolidationCount"]
            or any(not finite_nonnegative(item.get(field)) for field in numeric_fields)
            or item["maximumSourcePlaneMeasuredStoredDriftPlusArithmeticGuardM"]
            > 5.01e-4
            or item.get("allSourcePlaneWorldOriginCancellationAvoided") is not True
            for item in objects):
        return False
    count = sum(item["lineageConsolidationCount"] for item in objects)
    proof_count = sum(item["sourcePlaneProofConsolidationCount"] for item in objects)
    maxima = {
        field: max((item[field] for item in objects), default=0.0)
        for field in numeric_fields
    }
    cancellation = all(
        item["allSourcePlaneWorldOriginCancellationAvoided"] is True
        for item in objects if item["sourcePlaneProofConsolidationCount"]
    )
    return (
        proof.get("method")
        == "IMMUTABLE_SOURCE_TRIANGLE_PLANE_UNION_AND_CONSTRAINED_RETRIANGULATION"
        and proof.get("lineage") == "INITIAL_OWNER_AND_SOURCE_TRIANGLE_ID"
        and proof.get("scope") == "IN_MEMORY_CLEANUP_AID_NOT_REQUIRED_BY_FINAL_ACCEPTANCE"
        and proof.get("carriedAcrossRetriangulation") is True
        and proof.get("sameOwnerRequired") is True
        and proof.get("sameMaterialRequired") is True
        and proof.get("globalMinimumWidthExemption") is False
        and proof.get("finalArtifactAcceptanceDependsOnLineage") is False
        and type(proof.get("sameLineagePairsConsolidated")) is int
        and proof["sameLineagePairsConsolidated"] >= 0
        and type(proof.get("sameLineageCoherentCrossingPairsConsolidated")) is int
        and proof["sameLineageCoherentCrossingPairsConsolidated"] >= 0
        and proof.get("lineageConsolidationCount") == count
        and proof.get("sourcePlaneProofConsolidationCount") == proof_count
        and proof_count <= count
        and all(proof.get(field) == value for field, value in maxima.items())
        and proof.get("sourcePlaneActualStoredDriftLimitM") == 5.01e-4
        and proof.get("maximumSourcePlaneMeasuredStoredDriftPlusArithmeticGuardM")
        <= proof.get("sourcePlaneActualStoredDriftLimitM")
        and proof.get("sourcePlaneActualStoredDriftProofPassed") is True
        and proof.get("sourcePlaneRepresentationalErrorBoundIsInformational") is True
        and proof.get("allSourcePlaneWorldOriginCancellationAvoided") is cancellation is True
        and aggregate_coherent_proof_green(cleanup)
        and immutable_plane_partition_proof_green(cleanup)
    )


def raster_cleanup_progress_green(cleanup):
    contract = raster_acceptance_contract()
    passes = cleanup.get("stabilizationPasses")
    sequence = cleanup.get("pairCountSequence")
    pass_count = cleanup.get("stabilizationPassCount")
    aggregate_fields = (
        "surfaceAreaBeforeM2", "surfaceAreaAfterM2", "surfaceAreaRemovedM2",
        "recordLocalRemovalIntersectionSurfaceAreaSumM2",
        "lineageRemovalIntersectionSurfaceAreaSumM2",
        "positiveRemovalEvidenceAreaSumM2",
    )
    if (cleanup.get("schema") != RASTER_CLEANUP_SCHEMA
            or cleanup.get("contract") != contract
            or cleanup.get("passed") is not True
            or cleanup.get("acceptedPairsAfter") != 0
            or cleanup.get("exactDuplicatePairsAfter") != 0
            or cleanup.get("remainingPairs") != 0
            or cleanup.get("stabilized") is not True
            or cleanup.get("progressRule") != contract["cleanupProgressRule"]
            or cleanup.get("progressValidatedPasses") is not True
            or cleanup.get("repeatedGeometryStateDetected") is not False
            or type(pass_count) is not int
            or not 0 <= pass_count <= contract["maximumCleanupPasses"]
            or not isinstance(passes, list) or len(passes) != pass_count
            or not isinstance(sequence, list) or len(sequence) != pass_count + 1
            or any(type(value) is not int or value < 0 for value in sequence)
            or sequence[0] != cleanup.get("acceptedPairsBefore")
            or sequence[-1] != 0
            or any(not isinstance(cleanup.get(field), (int, float))
                   or not math.isfinite(cleanup[field]) for field in aggregate_fields)
            or not math.isclose(
                cleanup["surfaceAreaRemovedM2"],
                cleanup["surfaceAreaBeforeM2"] - cleanup["surfaceAreaAfterM2"],
                rel_tol=1.0e-12, abs_tol=1.0e-12,
            )):
        return False
    initial_state = cleanup.get("initialGeometryStateSha256")
    final_state = cleanup.get("finalGeometryStateSha256")
    if (re.fullmatch(r"[0-9a-f]{64}", str(initial_state)) is None
            or re.fullmatch(r"[0-9a-f]{64}", str(final_state)) is None):
        return False
    states = [initial_state]
    non_decreasing = []
    previous_surface = cleanup["surfaceAreaBeforeM2"]
    aggregate_sums = {
        "recordLocalRemovalIntersectionSurfaceAreaSumM2": 0.0,
        "lineageRemovalIntersectionSurfaceAreaSumM2": 0.0,
        "positiveRemovalEvidenceAreaSumM2": 0.0,
    }
    for index, report in enumerate(passes, start=1):
        pairs_before = report.get("pairsBefore")
        pairs_after = report.get("pairsAfter")
        before_state = report.get("geometryStateSha256Before")
        after_state = report.get("geometryStateSha256After")
        numeric_fields = (
            "surfaceAreaBeforeM2", "surfaceAreaAfterM2", "surfaceAreaRemovedM2",
            "recordLocalRemovalIntersectionSurfaceAreaM2",
            "lineageRemovalIntersectionSurfaceAreaM2",
            "positiveRemovalEvidenceAreaSumM2",
        )
        if (report.get("pass") != index
                or pairs_before != sequence[index - 1]
                or pairs_after != sequence[index]
                or before_state != states[-1]
                or re.fullmatch(r"[0-9a-f]{64}", str(after_state)) is None
                or after_state in states
                or any(not isinstance(report.get(field), (int, float))
                       or not math.isfinite(report[field]) for field in numeric_fields)):
            return False
        strictly_decreased = pairs_after < pairs_before
        surface_decreased = report["surfaceAreaRemovedM2"] > 0.0
        positive_removal = report["positiveRemovalEvidenceAreaSumM2"] > 0.0
        consolidation = report.get("consolidationPairProgress") is True
        conflicts = report.get("conflicts", {})
        expected_consolidation = strictly_decreased and (
            conflicts.get("sameLineagePairsConsolidated", 0) > 0
            or conflicts.get("exactDuplicateConflicts", 0) > 0
        )
        if (report.get("strictlyDecreased") is not strictly_decreased
                or report.get("surfaceAreaStrictlyDecreased") is not surface_decreased
                or report.get("positiveAcceptedMaskRemoval") is not positive_removal
                or report.get("progressRuleSatisfied") is not (positive_removal or consolidation)
                or report.get("progressRuleSatisfied") is not True
                or consolidation is not expected_consolidation
                or consolidation and not strictly_decreased
                or not strictly_decreased and not positive_removal
                or not math.isclose(report["surfaceAreaBeforeM2"], previous_surface,
                                    rel_tol=1.0e-12, abs_tol=1.0e-12)
                or not math.isclose(
                    report["surfaceAreaRemovedM2"],
                    report["surfaceAreaBeforeM2"] - report["surfaceAreaAfterM2"],
                    rel_tol=1.0e-12, abs_tol=1.0e-12,
                )
                or not math.isclose(
                    report["positiveRemovalEvidenceAreaSumM2"],
                    report["recordLocalRemovalIntersectionSurfaceAreaM2"]
                    + report["lineageRemovalIntersectionSurfaceAreaM2"],
                    rel_tol=1.0e-12, abs_tol=1.0e-12,
                )):
            return False
        if not strictly_decreased:
            non_decreasing.append(index)
        states.append(after_state)
        previous_surface = report["surfaceAreaAfterM2"]
        aggregate_sums["recordLocalRemovalIntersectionSurfaceAreaSumM2"] += report[
            "recordLocalRemovalIntersectionSurfaceAreaM2"
        ]
        aggregate_sums["lineageRemovalIntersectionSurfaceAreaSumM2"] += report[
            "lineageRemovalIntersectionSurfaceAreaM2"
        ]
        aggregate_sums["positiveRemovalEvidenceAreaSumM2"] += report[
            "positiveRemovalEvidenceAreaSumM2"
        ]
    return (
        states[-1] == final_state
        and len(states) == len(set(states))
        and math.isclose(previous_surface, cleanup["surfaceAreaAfterM2"],
                         rel_tol=1.0e-12, abs_tol=1.0e-12)
        and all(math.isclose(cleanup[field], value, rel_tol=1.0e-12, abs_tol=1.0e-12)
                for field, value in aggregate_sums.items())
        and cleanup.get("nonDecreasingPairPasses") == non_decreasing
        and cleanup.get("strictlyDecreasingPasses") is (not non_decreasing)
    )


def canonical_record_hash_matches(record, field):
    if not isinstance(record, dict):
        return False
    digest = record.get(field)
    if not isinstance(digest, str) or re.fullmatch(r"[0-9a-f]{64}", digest) is None:
        return False
    payload = dict(record)
    payload.pop(field, None)
    return canonical_hash(payload) == digest


def tiled_uv_anchor_semantic_green(proof, post_export):
    if not isinstance(proof, dict):
        return False
    if post_export:
        realization = (
            proof.get("storageRealization") == "BLENDER_GLTF_FLOAT32_V_FLIP_ROUNDTRIP"
            and proof.get("postExportAnchorInferenceMethod")
            == "ALL_LOOP_PROJECTED_MINUS_STORED_UNIQUE_INTEGER_WITH_FLOAT32_ULP_BOUND"
            and proof.get("postExportInferenceBoundMethod")
            == POST_EXPORT_INFERENCE_BOUND_METHOD
            and proof.get("postExportAffineDotOperationCount") == 7
            and proof.get("postExportAffineUnitRoundoff") == 2.0 ** -24
            and isinstance(proof.get("postExportMaxAffineHierarchyDepth"), int)
            and proof.get("postExportMaxAffineHierarchyDepth") >= 1
            and proof.get("postExportInferredAnchorPolygons") == proof.get("polygonCount")
        )
    else:
        realization = (
            proof.get("storageRealization") == "BLENDER_FLOAT32_UV_LAYER"
            and proof.get("postExportAnchorInferenceMethod")
            == "NOT_APPLICABLE_PRE_EXPORT_DETERMINISTIC_FLOOR_FIRST_LOOP"
            and proof.get("postExportInferenceBoundMethod")
            == "EXACT_PRE_EXPORT_FLOAT32_STORAGE_REPLAY"
            and proof.get("postExportAffineDotOperationCount") == 0
            and proof.get("postExportAffineUnitRoundoff") == 0.0
            and proof.get("postExportMaxAffineHierarchyDepth") == 0
            and proof.get("postExportInferredAnchorPolygons") == 0
        )
    return (
        proof.get("schema") == TILED_UV_PROOF_SCHEMA
        and proof.get("method") == TILED_UV_ANCHOR_METHOD
        and proof.get("present") is True and proof.get("passed") is True
        and proof.get("tileMetres") == 4.0
        and proof.get("allOffsetsIntegral") is True
        and proof.get("nonIntegralAnchorViolations") == 0
        and proof.get("storedCoordinatesMatchFloat32Realization") is True
        and proof.get("storageRealizationViolations") == 0 and realization
        and proof.get("postExportInferredAnchorAmbiguityViolations") == 0
        and proof.get("postExportInferredAnchorBoundViolations") == 0
        and proof.get("postExportInferredAnchorLoopConsistencyViolations") == 0
        and proof.get("moduloOnePhasePreserved") is True
        and proof.get("moduloPhaseViolations") == 0
        and proof.get("derivativesWithinStoredFloatBounds") is True
        and proof.get("derivativeBoundViolations") == 0
        and canonical_record_hash_matches(proof, "canonicalProofSha256")
    )


def tiled_uv_metric_semantic_green(metric):
    return (
        isinstance(metric, dict)
        and metric.get("present") is True
        and metric.get("method") == TILED_UV_METRIC_METHOD
        and metric.get("tileMetres") == 4.0
        and metric.get("worldDoubleAreaFloor") == 1.0e-12
        and metric.get("worldDoubleAreaFloorUnchanged") is True
        and metric.get("projectedDoubleAreaFloorMethod")
        == "WORLD_DOUBLE_AREA_FLOOR_TIMES_ABS_DOMINANT_NORMAL_COMPONENT"
        and metric.get("projectedFloorIsDimensionalConversionNotToleranceRelaxation") is True
        and isinstance(metric.get("projectedFloorEvaluatedTriangles"), int)
        and metric.get("projectedFloorEvaluatedTriangles") > 0
        and metric.get("zeroUvAreaTriangles") == 0
        and metric.get("exactZeroUvAreaTriangles") == 0
        and metric.get("projectedFloorFailureTriangles") == 0
        and metric.get("nonFiniteTriangles") == 0
        and metric.get("finite") is True and metric.get("nonZero") is True
        and metric.get("scaleConsistent") is True
        and metric.get("withinCubicStretchBound") is True
        and metric.get("valid") is True
        and isinstance(metric.get("maxAreaScaleRelativeError"), (int, float))
        and metric.get("maxAreaScaleRelativeError") <= 0.005
        and isinstance(metric.get("maxSingularValueError", {}).get("max"), (int, float))
        and metric.get("maxSingularValueError", {}).get("max") <= 0.005
    )


def tiled_uv_aggregate_semantic_green(
        proof, scope, artifact, artifact_sha256, expected_names):
    if not isinstance(proof, dict):
        return False
    post_export = scope == "POST_EXPORT_FRESH_BLENDER_REIMPORT"
    per_mesh = proof.get("perMesh", [])
    names = [item.get("name") for item in per_mesh]
    channel = proof.get("exportedTexcoordChannelProof", {})
    artifact_green = (
        proof.get("artifact") is None and proof.get("artifactSha256") is None
        if not post_export else
        proof.get("artifact") == artifact
        and proof.get("artifactSha256") == artifact_sha256
        and proof.get("artifactSha256AfterProof") == artifact_sha256
        and proof.get("artifactSha256Stable") is True
        and channel.get("schema") == "MassfrontStage10ExportedTexcoordChannelProofV1"
        and channel.get("method")
        == "GLB_NODE_EXTRAS_PLUS_PRIMITIVE_ATTRIBUTE_INDEX_BINDING"
        and channel.get("passed") is True
        and channel.get("expectedRenderMeshes") == sorted(expected_names)
        and channel.get("actualRenderMeshes") == sorted(expected_names)
        and channel.get("exactRenderMeshMembership") is True
        and canonical_record_hash_matches(channel, "canonicalProofSha256")
    )
    return (
        proof.get("schema") == TILED_UV_AGGREGATE_PROOF_SCHEMA
        and proof.get("method") == "BLENDER_WORLD_CUBIC_UV_CONSTRUCTION_AND_JACOBIAN_V1"
        and proof.get("metricMethod") == TILED_UV_METRIC_METHOD
        and proof.get("anchorMethod") == TILED_UV_ANCHOR_METHOD
        and proof.get("scope") == scope and artifact_green
        and proof.get("artifactSha256Bound") is True
        and proof.get("exactRenderMeshMembership") is True
        and proof.get("expectedRenderMeshes") == sorted(expected_names)
        and proof.get("actualRenderMeshes") == sorted(expected_names)
        and sorted(names) == sorted(expected_names)
        and len(names) == len(set(names)) == proof.get("renderMeshCount")
        and bool(per_mesh)
        and all((len(item.get("uvLayers", [])) == 2 if post_export
                 else item.get("uvLayers") == ["UV_GEN", "UVMap_Tile"])
                and item.get("tiledUvLayerIndex") == 1
                and item.get("tiledUvLayerSemantic") == "TEXCOORD_1"
                and tiled_uv_anchor_semantic_green(
                    item.get("tiledUvAnchorProof", {}), post_export,
                )
                and tiled_uv_metric_semantic_green(item.get("tiledUvMetrics", {}))
                for item in per_mesh)
        and proof.get("zeroUvAreaTriangles") == 0
        and proof.get("exactZeroUvAreaTriangles") == 0
        and proof.get("nonFiniteTriangles") == 0
        and all(proof.get(field) is True for field in (
            "allAnchorsValid", "allTiledUvLayersAreTexcoord1", "allFinite",
            "allNonZero", "allScaleConsistent", "allWithinCubicStretchBound",
            "allMetricValid", "allValid",
        ))
        and canonical_record_hash_matches(proof, "canonicalProofSha256")
    )


def repair_tiled_uv_proof_green(repair):
    contract = repair.get("tiledUvConstructionContract", {})
    fixtures = contract.get("fixtures", {}) if isinstance(contract, dict) else {}
    names = sorted(
        item.get("name") for item in repair.get("meshes", [])
        if isinstance(item, dict) and isinstance(item.get("name"), str)
    )
    construction_green = (
        contract.get("schema") == "MassfrontStage10TiledUvConstructionContractV1"
        and contract.get("method") == TILED_UV_ANCHOR_METHOD
        and contract.get("metricMethod") == TILED_UV_METRIC_METHOD
        and contract.get("passed") is True
        and contract.get("tileMetres") == 4.0
        and contract.get("worldDoubleAreaFloor") == 1.0e-12
        and contract.get("texelScaleErrorLimit") == 0.005
        and fixtures.get("ruinedBunkerMicroTriangle3067", {}).get("passed") is True
        and fixtures.get("ruinedBunkerExportCollapseTriangle2532", {}).get("passed") is True
        and fixtures.get("exactCollapsedUvRejected") is True
        and fixtures.get("nonIntegralAnchorRejected") is True
        and fixtures.get("loopInconsistentPostExportArtifactRejected") is True
        and fixtures.get("rotatedHierarchyAffineCancellation", {}).get("passed") is True
        and fixtures.get("affineOutOfBoundResidualRejected") is True
        and fixtures.get("scaleDistortionAboveFrozenLimitRejected") is True
        and canonical_record_hash_matches(contract, "canonicalContractSha256")
    )
    return (
        construction_green
        and tiled_uv_aggregate_semantic_green(
            repair.get("preExportTiledUvProof", {}),
            "PRE_EXPORT_BLENDER_SCENE", None, None, names,
        )
        and tiled_uv_aggregate_semantic_green(
            repair.get("postExportTiledUvProof", {}),
            "POST_EXPORT_FRESH_BLENDER_REIMPORT",
            repair.get("output"), repair.get("outputSha256"), names,
        )
        and tiled_uv_aggregate_semantic_green(
            repair.get("postExportTextureSourceTiledUvProof", {}),
            "POST_EXPORT_FRESH_BLENDER_REIMPORT",
            repair.get("textureSource"), repair.get("textureSourceSha256"), names,
        )
    )


def validate_repair(entry, repair_root, catalog_hash):
    path = repair_report_path(repair_root, entry)
    if not path.is_file():
        raise RuntimeError("missing repair report: " + str(path))
    repair = json.loads(path.read_text(encoding="utf-8"))
    expected = {
        "schema": REPAIR_SCHEMA, "pipelineVersion": REPAIR_PIPELINE_VERSION,
        "pipelineMode": REPAIR_PIPELINE_MODE, "key": entry["key"], "id": entry["id"],
        "family": entry["family"], "kind": entry["kind"], "catalogSha256": catalog_hash,
    }
    for field, value in expected.items():
        if repair.get(field) != value:
            raise RuntimeError("repair report %s=%r expected %r" % (field, repair.get(field), value))
    if repair.get("status") not in ALLOWED_REPAIR_STATUSES:
        raise RuntimeError("repair report does not have an accepted measured status")
    cleanup = repair.get("rasterCleanup", {})
    if (repair.get("pipelineScript") != repo_relative(REPAIR_SCRIPT)
            or repair.get("pipelineScriptSha256") != sha256(REPAIR_SCRIPT)
            or repair.get("rasterCleanupScript") != repo_relative(RASTER_CLEANUP_SCRIPT)
            or repair.get("rasterCleanupScriptSha256") != sha256(RASTER_CLEANUP_SCRIPT)
            or repair.get("sourceUntouched") is not True
            or repair.get("canonicalTopologyUntouched") is not True
            or repair.get("uvGeometryPreserved") is not True
            or repair.get("repairDependencyContract") != raster_dependency_contract()
            or not material_semantic_contract_green(entry, repair)
            or repair.get("rasterAcceptanceContract") != raster_acceptance_contract()
            or cleanup.get("dependencyContract") != raster_dependency_contract()
            or cleanup.get("contract") != raster_acceptance_contract()
            or cleanup.get("passed") is not True
            or cleanup.get("acceptedPairsAfter") != 0
            or cleanup.get("exactDuplicatePairsAfter") != 0
            or cleanup.get("remainingPairs") != 0
            or cleanup.get("stabilized") is not True
            or not lineage_proof_green(cleanup)
            or not raster_cleanup_progress_green(cleanup)
            or not repair_tiled_uv_proof_green(repair)):
        raise RuntimeError("repair shared raster-cleanup proof is not green")
    canonical_source = entry["canonicalSource"].resolve()
    require_under(canonical_source, ROOT, "canonical source")
    report_source = (ROOT / repair.get("source", "")).resolve()
    if report_source != canonical_source:
        raise RuntimeError("repair report canonical source path mismatch")
    if not canonical_source.is_file() or sha256(canonical_source) != repair.get("sourceSha256"):
        raise RuntimeError("repair report canonical source hash mismatch")
    source = ROOT / repair["output"]
    require_under(source, repair_root, "repair output")
    if not source.is_file() or sha256(source) != repair.get("outputSha256"):
        raise RuntimeError("repair output hash mismatch")
    texture_source = ROOT / repair.get("textureSource", "")
    require_under(texture_source, repair_root, "repair texture source")
    if (not texture_source.is_file()
            or sha256(texture_source) != repair.get("textureSourceSha256")):
        raise RuntimeError("repair texture-source hash mismatch")
    return repair, path, source


def validate_pbr(entry, repair_root, repair, repair_path):
    path = pbr_report_path(repair_root, entry)
    if not path.is_file():
        raise RuntimeError("missing PBR report required by raster acceptance: " + str(path))
    report = json.loads(path.read_text(encoding="utf-8"))
    expected = {
        "schema": PBR_SCHEMA,
        "pipelineVersion": PBR_PIPELINE_VERSION,
        "pipelineMode": PBR_PIPELINE_MODE,
        "key": entry["key"],
        "id": entry["id"],
        "family": entry["family"],
        "kind": entry["kind"],
        "status": "PBR_TEXTURED",
    }
    for field, value in expected.items():
        if report.get(field) != value:
            raise RuntimeError("PBR report %s=%r expected %r" % (field, report.get(field), value))
    if (report.get("repairReport") != repo_relative(repair_path)
            or report.get("repairReportSha256") != sha256(repair_path)
            or report.get("repairPipelineVersion") != REPAIR_PIPELINE_VERSION
            or report.get("pipelineScriptSha256") != sha256(PBR_SCRIPT)
            or report.get("repairPipelineScript") != repair["pipelineScript"]
            or report.get("repairPipelineScriptSha256") != repair["pipelineScriptSha256"]
            or report.get("rasterCleanupScript") != repair["rasterCleanupScript"]
            or report.get("rasterCleanupScriptSha256") != repair["rasterCleanupScriptSha256"]
            or report.get("repairLineageProofSha256")
            != canonical_hash(repair["rasterCleanup"]["lineageProof"])
            or report.get("source") != repair["output"]
            or report.get("sourceSha256") != repair["outputSha256"]
            or report.get("repairDependencyContract") != raster_dependency_contract()
            or report.get("rasterAcceptanceContract") != raster_acceptance_contract()
            or report.get("repairRasterCleanupSha256") != canonical_hash(repair["rasterCleanup"])):
        raise RuntimeError("PBR report is not bound to the exact V18 repair proof")
    tiled_bindings = {
        "repairTiledUvConstructionContract": repair["tiledUvConstructionContract"],
        "repairTiledUvPreExportProof": repair["preExportTiledUvProof"],
        "repairTiledUvPostExportOutputProof": repair["postExportTiledUvProof"],
        "repairTiledUvPostExportTextureSourceProof": repair[
            "postExportTextureSourceTiledUvProof"
        ],
    }
    if report.get("productionSetPolicy") != PRODUCTION_SET_POLICY:
        raise RuntimeError("PBR production-set policy drifted")
    for prefix, value in tiled_bindings.items():
        if (report.get(prefix + "CanonicalJson") != canonical_text(value)
                or report.get(prefix + "Sha256") != canonical_hash(value)):
            raise RuntimeError("PBR repair tiled-UV proof binding failed: " + prefix)
    expected_resume = {
        "pipelineVersion": report["pipelineVersion"],
        "pipelineMode": report["pipelineMode"],
        "pipelineScriptSha256": sha256(PBR_SCRIPT),
        "mappingVersion": report.get("mappingVersion"),
        "contentEquivalentRebindPolicy": CONTENT_EQUIVALENT_REBIND_POLICY,
        "blenderVersion": report.get("blenderVersion"),
        "catalogSha256": report.get("catalogSha256"),
        "repairReportSha256": sha256(repair_path),
        "repairPipelineScriptSha256": repair["pipelineScriptSha256"],
        "rasterCleanupScriptSha256": repair["rasterCleanupScriptSha256"],
        "repairRasterCleanupSha256": canonical_hash(repair["rasterCleanup"]),
        "repairLineageProofSha256": canonical_hash(repair["rasterCleanup"]["lineageProof"]),
        "repairMaterialSemanticContractSha256": canonical_hash(
            repair["materialSemanticContract"]
        ),
        "repairTiledUvConstructionContractSha256": canonical_hash(
            repair["tiledUvConstructionContract"]
        ),
        "repairTiledUvPreExportProofSha256": canonical_hash(
            repair["preExportTiledUvProof"]
        ),
        "repairTiledUvPostExportOutputProofSha256": canonical_hash(
            repair["postExportTiledUvProof"]
        ),
        "repairTiledUvPostExportTextureSourceProofSha256": canonical_hash(
            repair["postExportTextureSourceTiledUvProof"]
        ),
        "productionSetPolicy": PRODUCTION_SET_POLICY,
        "sourceSha256": repair["outputSha256"],
        "librarySourceContractSha256": report.get("library", {}).get(
            "sourceContractSha256"
        ),
    }
    expected_contract = {
        "resume": canonical_hash(expected_resume),
        "library": report.get("library", {}).get("contractSha256"),
        "materials": report.get("materials"),
        "preservation": report.get("preservation"),
        "uv": report.get("uv"),
        "coverage": {
            key: value for key, value in report.get("fullPbrCoverage", {}).items()
            if key != "embeddedImages"
        },
    }
    if (
        report.get("repairMaterialSemanticContractSha256")
        != canonical_hash(repair["materialSemanticContract"])
        or report.get("repairRasterCleanupCanonicalJson")
        != canonical_text(repair["rasterCleanup"])
        or report.get("repairLineageProofCanonicalJson")
        != canonical_text(repair["rasterCleanup"]["lineageProof"])
        or report.get("repairMaterialSemanticContractCanonicalJson")
        != canonical_text(repair["materialSemanticContract"])
        or report.get("resumeContract") != expected_resume
        or report.get("resumeContractCanonicalJson") != canonical_text(expected_resume)
        or report.get("resumeContractSha256") != canonical_hash(expected_resume)
        or report.get("contract") != expected_contract
        or report.get("contractCanonicalJson") != canonical_text(expected_contract)
        or report.get("contractSha256") != canonical_hash(expected_contract)
    ):
        raise RuntimeError("PBR report canonical contract hashes do not recompute")
    artifact = report.get("preservation", {}).get("postExportArtifactIdentity", {})
    final_uv = report.get("uv", {}).get("finalPbrArtifact", {})
    source_identity = artifact.get("sourceMeshIdentity", {})
    final_identity = artifact.get("finalMeshIdentity", {})
    render_names = artifact.get("renderNodeNames", [])
    expected_render_names = sorted(
        name for name, identity in source_identity.items()
        if identity.get("renderNode") is True
    ) if isinstance(source_identity, dict) else []
    packed_by_mesh = final_uv.get("packedOverlapByMesh", {})
    tiled_by_mesh = final_uv.get("tiledMetricsByMesh", {})
    if (
        artifact.get("passed") is not True
        or artifact.get("topologyIndexWindingPositionNormalUvIdentity") is not True
        or artifact.get("permittedChanges") != ["MATERIAL_DEFINITIONS", "EMBEDDED_IMAGES"]
        or source_identity != final_identity
        or not isinstance(render_names, list)
        or render_names != sorted(set(render_names))
        or not render_names
        or render_names != expected_render_names
        or artifact.get("sourceSceneIdentitySha256")
        != canonical_hash(source_identity)
        or artifact.get("finalSceneIdentitySha256")
        != canonical_hash(final_identity)
        or report.get("postExportArtifactIdentitySha256") != canonical_hash(artifact)
        or final_uv.get("passed") is not True
        or not isinstance(packed_by_mesh, dict)
        or not isinstance(tiled_by_mesh, dict)
        or sorted(packed_by_mesh) != render_names
        or sorted(tiled_by_mesh) != render_names
        or final_uv.get("packedOverlapFaces") != 0
        or final_uv.get("allTiledMetricsValid") is not True
        or any(metrics.get("valid") is not True
               for metrics in tiled_by_mesh.values())
        or any(
            metrics.get("method") != TILED_UV_METRIC_METHOD
            or metrics.get("worldDoubleAreaFloor") != 1.0e-12
            or metrics.get("projectedFloorIsDimensionalConversionNotToleranceRelaxation")
            is not True
            or metrics.get("exactZeroUvAreaTriangles") != 0
            or metrics.get("projectedFloorFailureTriangles") != 0
            for metrics in tiled_by_mesh.values()
        )
        or report.get("finalUvProofCanonicalJson") != canonical_text(final_uv)
        or report.get("finalUvProofSha256") != canonical_hash(final_uv)
    ):
        raise RuntimeError("PBR final-artifact geometry/normal/UV proof is not green")
    coverage = report.get("fullPbrCoverage", {})
    if (coverage.get("passed") is not True
            or not isinstance(coverage.get("opaqueMaterialCount"), int)
            or coverage.get("opaqueMaterialCount") <= 0
            or coverage.get("opaqueMaterialCount") != coverage.get("singleSidedMaterialCount")
            or coverage.get("doubleSidedMaterialCount") != 0):
        raise RuntimeError("PBR report does not declare complete material coverage")
    report_materials = report.get("materials", [])
    if not report_materials:
        raise RuntimeError("PBR report has no material raster-state evidence")
    for material in report_materials:
        if material.get("rasterization") != PBR_RASTER_POLICY:
            raise RuntimeError(
                "PBR material %s is not exact OPAQUE/single-sided"
                % material.get("outputMaterial")
            )
    output = (ROOT / report.get("output", "")).resolve()
    require_under(output, repair_root / "pbr-models", "PBR output")
    if not output.is_file() or sha256(output) != report.get("outputSha256"):
        raise RuntimeError("PBR output hash mismatch")
    document, _buffers = load_gltf_buffers(output)
    render_mesh_indices = {
        node["mesh"] for node in document.get("nodes", [])
        if node.get("extras", {}).get("mf_stage10_render") is True and "mesh" in node
    }
    if not render_mesh_indices:
        raise RuntimeError("PBR output has no exact render-node proof")
    materials = document.get("materials", [])
    if not materials or any(
            material.get("alphaMode") != "OPAQUE"
            or material.get("doubleSided") is not False
            for material in materials):
        raise RuntimeError("PBR GLB contains a material outside exact OPAQUE/single-sided policy")
    primitive_count = 0
    used_materials = set()
    for mesh_index in sorted(render_mesh_indices):
        for primitive in document.get("meshes", [])[mesh_index].get("primitives", []):
            material_index = primitive.get("material")
            if not isinstance(material_index, int) or material_index >= len(materials):
                raise RuntimeError("PBR render primitive has no valid material")
            material = materials[material_index]
            if material.get("alphaMode") != "OPAQUE" or material.get("doubleSided") is not False:
                raise RuntimeError(
                    "PBR GLB material %s is not explicitly OPAQUE and single-sided"
                    % material.get("name", material_index)
                )
            primitive_count += 1
            used_materials.add(material_index)
    if (primitive_count != coverage.get("renderPrimitives")
            or len(used_materials) != coverage.get("singleSidedMaterialCount")
            or len(used_materials) != coverage.get("opaqueMaterialCount")
            or coverage.get("doubleSidedMaterialCount") != 0):
        raise RuntimeError("PBR GLB raster-state counts do not match its report")
    validate_pbr_artifact_disposition(
        report, repair, repair_root, artifact, final_uv, coverage, output,
    )
    return report, path, output, {
        "policy": PBR_RASTER_POLICY,
        "policySha256": canonical_hash(PBR_RASTER_POLICY),
        "renderPrimitiveCount": primitive_count,
        "opaqueSingleSidedMaterialCount": len(used_materials),
        "passed": primitive_count > 0,
    }


def load_pbr_production_contract(repair_root, catalog_hash, catalog_keys):
    path = repair_root / "pbr-reports/summary.json"
    if not path.is_file():
        raise RuntimeError("PBR production summary is missing: " + str(path))
    summary = json.loads(path.read_text(encoding="utf-8"))
    repair_dispositions = summary.get("repairDispositionManifest", [])
    input_manifest = summary.get("inputProductionManifest", [])
    production = summary.get("productionManifest", [])
    quarantine = summary.get("quarantineManifest", [])
    if (
        summary.get("schema") != "MassfrontStage10ModelPbrSummaryV1"
        or summary.get("pipelineVersion") != PBR_PIPELINE_VERSION
        or summary.get("pipelineMode") != PBR_PIPELINE_MODE
        or summary.get("catalogSha256") != catalog_hash
        or summary.get("productionSetPolicy") != PRODUCTION_SET_POLICY
        or summary.get("passed") is not True
        or summary.get("status") not in ("PASS", "PASS_WITH_QUARANTINE")
        or summary.get("repairCensusCount") != EXPECTED_FULL_SCHEDULE
        or len(repair_dispositions) != EXPECTED_FULL_SCHEDULE
        or summary.get("repairDispositionManifestSha256")
        != canonical_hash(repair_dispositions)
        or summary.get("inputProductionManifestSha256") != canonical_hash(input_manifest)
        or summary.get("productionManifestSha256") != canonical_hash(production)
        or summary.get("itemManifestSha256") != canonical_hash(production)
        or summary.get("items") != production
        or summary.get("quarantineManifestSha256") != canonical_hash(quarantine)
        or summary.get("finalProductionCount") != len(production)
        or summary.get("quarantinedCount") != len(quarantine)
        or summary.get("totalScheduled") != len(input_manifest)
        or summary.get("processed") != len(production)
        or summary.get("processed", 0) + summary.get("failed", 0)
        != summary.get("totalScheduled")
        or summary.get("repairSummary", {}).get("sha256")
        != sha256(repair_root / "summary.json")
        or summary.get("repairSummary", {}).get("productionSetPolicy")
        != PRODUCTION_SET_POLICY
    ):
        raise RuntimeError("PBR production summary contract is not authoritative")
    repair_keys = [item.get("key") for item in repair_dispositions]
    input_keys = [item.get("key") for item in input_manifest]
    production_keys = [item.get("key") for item in production]
    quarantine_keys = [item.get("key") for item in quarantine]
    if (
        len(repair_keys) != len(set(repair_keys))
        or set(repair_keys) != set(catalog_keys)
        or len(input_keys) != len(set(input_keys))
        or len(production_keys) != len(set(production_keys))
        or len(quarantine_keys) != len(set(quarantine_keys))
        or set(production_keys) & set(quarantine_keys)
        or set(production_keys) | set(quarantine_keys) != set(catalog_keys)
        or set(input_keys) != {
            item["key"] for item in repair_dispositions
            if item.get("disposition") == "ELIGIBLE_FOR_PBR"
        }
        or not set(production_keys).issubset(input_keys)
    ):
        raise RuntimeError("PBR production/quarantine membership is not an exact partition")
    if not all(
        item.get("stage") == "PBR"
        and item.get("disposition") == "PRODUCTION_READY"
        and item.get("status") == "PBR_TEXTURED"
        and item.get("reasons") == []
        for item in production
    ):
        raise RuntimeError("PBR production manifest contains a non-production row")
    if not all(
        item.get("disposition") == "QUARANTINED_NO_PROMOTION"
        and isinstance(item.get("reasons"), list) and bool(item.get("reasons"))
        for item in quarantine
    ):
        raise RuntimeError("PBR quarantine manifest contains an unproven row")
    return summary, production, quarantine


def process(entry, repair_root, output_root, catalog_hash, force=False):
    repair, repair_path, repair_output = validate_repair(entry, repair_root, catalog_hash)
    pbr, pbr_path, source, pbr_raster = validate_pbr(
        entry, repair_root, repair, repair_path,
    )
    report_path = audit_report_path(output_root, entry)
    require_under(report_path, output_root, "z-fighting report")
    raw_glb_audit = audit_raw_glb(source)
    raw_glb_audit_hash = canonical_hash(raw_glb_audit)
    contract = canonical_hash({
        "pipelineVersion": PIPELINE_VERSION, "auditMode": AUDIT_MODE,
        "scriptSha256": sha256(Path(__file__)), "catalogSha256": catalog_hash,
        "productionSetPolicy": PRODUCTION_SET_POLICY,
        "blenderVersion": bpy.app.version_string,
        "repairPipelineScriptSha256": repair["pipelineScriptSha256"],
        "pbrPipelineScriptSha256": pbr["pipelineScriptSha256"],
        "rasterCleanupScriptSha256": repair["rasterCleanupScriptSha256"],
        "repairRasterCleanupSha256": pbr["repairRasterCleanupSha256"],
        "repairLineageProofSha256": pbr["repairLineageProofSha256"],
        "repairMaterialSemanticContractSha256": pbr[
            "repairMaterialSemanticContractSha256"
        ],
        "repairTiledUvConstructionContractSha256": pbr[
            "repairTiledUvConstructionContractSha256"
        ],
        "repairTiledUvPreExportProofSha256": pbr[
            "repairTiledUvPreExportProofSha256"
        ],
        "repairTiledUvPostExportOutputProofSha256": pbr[
            "repairTiledUvPostExportOutputProofSha256"
        ],
        "repairTiledUvPostExportTextureSourceProofSha256": pbr[
            "repairTiledUvPostExportTextureSourceProofSha256"
        ],
        "pbrContractSha256": pbr["contractSha256"],
        "pbrResumeContractSha256": pbr["resumeContractSha256"],
        "pbrArtifactDisposition": pbr["artifactDisposition"],
        "pbrContentEquivalentRebindSha256": pbr.get(
            "contentEquivalentRebindSha256"
        ),
        "pbrFinalArtifactIdentitySha256": pbr["postExportArtifactIdentitySha256"],
        "pbrFinalUvProofSha256": pbr["finalUvProofSha256"],
        "repairReportSha256": sha256(repair_path),
        "repairOutputSha256": sha256(repair_output),
        "pbrReportSha256": sha256(pbr_path), "sourceSha256": sha256(source),
        "pbrRasterPolicySha256": pbr_raster["policySha256"],
        "rawGlbAuditMethod": RAW_GLTF_AUDIT_METHOD,
        "broadPhaseMethod": BROAD_PHASE_METHOD,
        "exactDuplicateAuthority": EXACT_DUPLICATE_AUTHORITY,
        "rawGlbAuditSha256": raw_glb_audit_hash,
        "tolerances": tolerances(),
    })
    if not force and report_path.is_file():
        previous = json.loads(report_path.read_text(encoding="utf-8"))
        if (previous.get("schema") == ITEM_SCHEMA
                and previous.get("pipelineVersion") == PIPELINE_VERSION
                and previous.get("auditMode") == AUDIT_MODE
                and previous.get("status") == "PASS"
                and previous.get("passed") is True
                and previous.get("blenderVersion") == bpy.app.version_string
                and previous.get("resumeContractSha256") == contract):
            previous["resumedFromExisting"] = True
            return previous
    started = time.time()
    clear_scene()
    bpy.ops.import_scene.gltf(filepath=str(source))
    objects = render_meshes()
    if not objects:
        raise RuntimeError("repair output contains no render meshes")
    shared_raster_audit = audit_same_winding_raster_risk(objects)
    triangles_by_lod, meshes, bounds = collect_geometry(objects)
    identical, nested, skip_pairs = duplicate_mesh_pairs(meshes)
    coplanar = audit_coplanar(triangles_by_lod, bounds, skip_pairs)
    blender_exact_duplicate_faces = sum(mesh["exactDuplicateFaces"] for mesh in meshes)
    blender_degenerate_faces = sum(mesh["degenerateFacesIgnored"] for mesh in meshes)
    blender_degenerate_duplicate_groups = sum(
        mesh["degenerateDuplicateFaceGroupsIgnored"] for mesh in meshes)
    blender_degenerate_duplicate_faces = sum(
        mesh["degenerateDuplicateFacesIgnored"] for mesh in meshes)
    raw_exact_duplicate_faces = raw_glb_audit["exactDuplicateTrianglesWithinRenderNode"]
    exact_duplicate_faces = raw_exact_duplicate_faces
    finding_count = shared_raster_audit["pairs"] + raw_exact_duplicate_faces
    result = {
        "schema": ITEM_SCHEMA,
        "pipelineVersion": PIPELINE_VERSION, "auditMode": AUDIT_MODE,
        "broadPhaseMethod": BROAD_PHASE_METHOD,
        "exactDuplicateAuthority": EXACT_DUPLICATE_AUTHORITY,
        "blenderVersion": bpy.app.version_string, "auditScriptSha256": sha256(Path(__file__)),
        "resumeContractSha256": contract, "catalogSha256": catalog_hash,
        "key": entry["key"], "id": entry["id"], "family": entry["family"],
        "category": entry["category"], "kind": entry["kind"],
        "status": "PASS" if finding_count == 0 else "Z_FIGHTING_REVIEW_REQUIRED",
        "passed": finding_count == 0 and shared_raster_audit["passed"],
        "productionSetPolicy": PRODUCTION_SET_POLICY,
        "geometryMutationPerformed": False,
        "source": repo_relative(source), "sourceSha256": pbr["outputSha256"],
        "repairOutput": repo_relative(repair_output),
        "repairOutputSha256": repair["outputSha256"],
        "repairReport": repo_relative(repair_path), "repairReportSha256": sha256(repair_path),
        "repairPipelineVersion": repair["pipelineVersion"],
        "pbrReport": repo_relative(pbr_path), "pbrReportSha256": sha256(pbr_path),
        "pbrOutput": repo_relative(source), "pbrOutputSha256": pbr["outputSha256"],
        "pbrPipelineVersion": pbr["pipelineVersion"],
        "pbrPipelineScriptSha256": pbr["pipelineScriptSha256"],
        "pbrContractSha256": pbr["contractSha256"],
        "pbrResumeContractSha256": pbr["resumeContractSha256"],
        "pbrArtifactDisposition": pbr["artifactDisposition"],
        "pbrContentEquivalentRebindSha256": pbr.get(
            "contentEquivalentRebindSha256"
        ),
        "repairMaterialSemanticContractSha256": pbr[
            "repairMaterialSemanticContractSha256"
        ],
        "repairTiledUvConstructionContractSha256": pbr[
            "repairTiledUvConstructionContractSha256"
        ],
        "repairTiledUvPreExportProofSha256": pbr[
            "repairTiledUvPreExportProofSha256"
        ],
        "repairTiledUvPostExportOutputProofSha256": pbr[
            "repairTiledUvPostExportOutputProofSha256"
        ],
        "repairTiledUvPostExportTextureSourceProofSha256": pbr[
            "repairTiledUvPostExportTextureSourceProofSha256"
        ],
        "pbrFinalArtifactIdentitySha256": pbr["postExportArtifactIdentitySha256"],
        "pbrFinalUvProofSha256": pbr["finalUvProofSha256"],
        "pbrRasterBinding": pbr_raster,
        "repairDependencyContract": raster_dependency_contract(),
        "rasterAcceptanceContract": raster_acceptance_contract(),
        "repairPipelineScript": repo_relative(REPAIR_SCRIPT),
        "repairPipelineScriptSha256": sha256(REPAIR_SCRIPT),
        "pbrPipelineScript": repo_relative(PBR_SCRIPT),
        "pbrPipelineScriptSha256": sha256(PBR_SCRIPT),
        "rasterCleanupScript": repo_relative(RASTER_CLEANUP_SCRIPT),
        "rasterCleanupScriptSha256": sha256(RASTER_CLEANUP_SCRIPT),
        "repairRasterCleanupSha256": pbr["repairRasterCleanupSha256"],
        "repairLineageProofSha256": pbr["repairLineageProofSha256"],
        "rasterAudit": shared_raster_audit,
        "rawGlbAudit": raw_glb_audit, "rawGlbAuditSha256": raw_glb_audit_hash,
        "alternateLodComparisonPerformed": False,
        "excludedMeshes": [
            {"name": obj.name_full, "reason": render_exclusion_reason(obj)}
            for obj in bpy.context.scene.objects if obj.type == "MESH" and render_exclusion_reason(obj)
        ],
        "tolerances": tolerances(), "bounds": bounds,
        "renderMeshes": [
            {key: value for key, value in mesh.items()
             if key not in {"faceKeys", "faceKeyCounts"}}
            for mesh in meshes
        ],
        "findings": {
            "total": finding_count, "exactDuplicateFacesWithinMesh": exact_duplicate_faces,
            "authoritativeRawExactDuplicateFacesWithinRenderNode": raw_exact_duplicate_faces,
            "rawExactDuplicateFacesWithinRenderNode": raw_exact_duplicate_faces,
            "blenderExactDuplicateFacesWithinMesh": blender_exact_duplicate_faces,
            "blenderRawNondegenerateExactDuplicateDelta": (
                blender_exact_duplicate_faces - raw_exact_duplicate_faces),
            "blenderDegenerateFacesIgnored": blender_degenerate_faces,
            "blenderDegenerateDuplicateFaceGroupsIgnored": blender_degenerate_duplicate_groups,
            "blenderDegenerateDuplicateFacesIgnored": blender_degenerate_duplicate_faces,
            "identicalRenderMeshPairs": identical, "nestedIdenticalRenderMeshPairs": nested,
            "exactCrossMeshFaceOverlaps": coplanar["exactCrossMeshFaceOverlaps"],
            "nearCoplanarFaceOverlaps": coplanar["nearCoplanarFaceOverlaps"],
            "meshPairFindings": coplanar["meshPairFindings"],
        },
        "broadPhase": {
            key: value for key, value in coplanar.items() if key != "meshPairFindings"
        },
        "durationSeconds": round(time.time() - started, 3),
    }
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    return result


def tolerances():
    # Retained as a report field for compatibility, but the shared contract is
    # the sole acceptance authority.  No local width/fraction exemption may
    # silently diverge from the cleanup producer.
    return raster_acceptance_contract()


def exclusion_manifest(exclusions):
    return [{
        "key": item["key"], "id": item["id"], "family": item["family"],
        "kind": item["kind"], "reason": item["reason"],
        "source": repo_relative(item["canonicalSource"]),
        "sourceSha256": sha256(item["canonicalSource"]),
    } for item in exclusions]


def write_summary(
        output_root, results, failures, total, started, args, catalog_hash,
        counts, exclusions, input_manifest, inherited_quarantine,
        pbr_summary_binding):
    statuses = Counter(result["status"] for result in results)
    finding_models = [result["key"] for result in results if not result["passed"]]
    items = []
    audit_dispositions = []
    for result in results:
        path = audit_report_path(output_root, result)
        row = {
            "key": result["key"], "stage": "AUDIT",
            "disposition": (
                "PRODUCTION_READY" if result["passed"]
                else "QUARANTINED_NO_PROMOTION"
            ),
            "status": "PASS" if result["passed"] else "AUDIT_FAILED",
            "reasons": [] if result["passed"] else [
                "Z_FIGHTING_REVIEW_REQUIRED: "
                + json.dumps(result["findings"], sort_keys=True, separators=(",", ":"))
            ],
            "passed": result["passed"],
            "findings": result["findings"]["total"],
            "authoritativeRawExactDuplicateFaces": result["findings"][
                "authoritativeRawExactDuplicateFacesWithinRenderNode"],
            "rawExactDuplicateFaces": result["findings"]["rawExactDuplicateFacesWithinRenderNode"],
            "blenderDegenerateDuplicateFacesIgnored": result["findings"][
                "blenderDegenerateDuplicateFacesIgnored"],
            "rawGlbAuditSha256": result["rawGlbAuditSha256"],
            "rasterPairs": result["rasterAudit"]["pairs"],
            "pbrReportSha256": result["pbrReportSha256"],
            "pbrOutputSha256": result["pbrOutputSha256"],
            "report": repo_relative(path), "reportSha256": sha256(path) if path.is_file() else None,
            "output": result["pbrOutput"], "outputSha256": result["pbrOutputSha256"],
        }
        audit_dispositions.append(row)
        if result["passed"]:
            items.append(row)
    input_by_key = {item["key"]: item for item in input_manifest}
    for failure in failures:
        source = input_by_key.get(failure["key"])
        if source is None:
            raise RuntimeError("audit failure is outside the PBR production manifest")
        audit_dispositions.append({
            "key": failure["key"], "stage": "AUDIT",
            "disposition": "QUARANTINED_NO_PROMOTION",
            "status": "AUDIT_FAILED", "reasons": [failure["error"]],
            "passed": False, "findings": None,
            "report": source["report"], "reportSha256": source["reportSha256"],
            "output": source["output"], "outputSha256": source["outputSha256"],
        })
    items.sort(key=lambda item: item["key"])
    audit_dispositions.sort(key=lambda item: item["key"])
    new_quarantine = [
        item for item in audit_dispositions
        if item["disposition"] == "QUARANTINED_NO_PROMOTION"
    ]
    quarantine_manifest = sorted(
        [*inherited_quarantine, *new_quarantine],
        key=lambda item: (item["key"], item["stage"]),
    )
    complete = (
        len(results) + len(failures) == total
        and len(input_manifest) == total
        and len(audit_dispositions) == total
        and len({item["key"] for item in audit_dispositions}) == total
    )
    summary = {
        "schema": SUMMARY_SCHEMA,
        "pipelineVersion": PIPELINE_VERSION, "auditMode": AUDIT_MODE,
        "rawGlbAuditMethod": RAW_GLTF_AUDIT_METHOD,
        "broadPhaseMethod": BROAD_PHASE_METHOD,
        "exactDuplicateAuthority": EXACT_DUPLICATE_AUTHORITY,
        "blenderVersion": bpy.app.version_string,
        "sourcePolicy": "READ_ONLY_NO_MODEL_MUTATION", "catalogSha256": catalog_hash,
        "productionSetPolicy": PRODUCTION_SET_POLICY,
        "pbrSummary": pbr_summary_binding,
        "sourceBindingPolicy": "CATALOG_REPAIR_AND_EXACT_PBR_REPORT_OUTPUT_SHA256",
        "repairDependencyContract": raster_dependency_contract(),
        "rasterAcceptanceContract": raster_acceptance_contract(),
        "repairPipelineScript": repo_relative(REPAIR_SCRIPT),
        "repairPipelineScriptSha256": sha256(REPAIR_SCRIPT),
        "pbrPipelineScript": repo_relative(PBR_SCRIPT),
        "pbrPipelineScriptSha256": sha256(PBR_SCRIPT),
        "rasterCleanupScript": repo_relative(RASTER_CLEANUP_SCRIPT),
        "rasterCleanupScriptSha256": sha256(RASTER_CLEANUP_SCRIPT),
        "pbrRasterPolicy": PBR_RASTER_POLICY,
        "pbrRasterPolicySha256": canonical_hash(PBR_RASTER_POLICY),
        "selection": {
            "families": sorted(args.family), "only": sorted(args.only),
            "includeSpline": args.include_spline, "limit": args.limit,
            "fullCatalog": not args.family and not args.only and args.include_spline and not args.limit,
        },
        "catalogCounts": counts, "totalScheduled": total,
        "processed": len(results), "failed": len(failures),
        "status": "PASS_WITH_QUARANTINE" if quarantine_manifest else "PASS",
        "findingModelCount": len(finding_models), "findingModels": finding_models,
        "rawExactDuplicateFaceCount": sum(
            result["findings"]["rawExactDuplicateFacesWithinRenderNode"] for result in results),
        "rasterPairCount": sum(result["rasterAudit"]["pairs"] for result in results),
        "blenderDegenerateDuplicateFacesIgnoredCount": sum(
            result["findings"]["blenderDegenerateDuplicateFacesIgnored"] for result in results),
        "statusCounts": dict(statuses), "exclusions": exclusion_manifest(exclusions),
        "inputProductionManifest": input_manifest,
        "inputProductionManifestSha256": canonical_hash(input_manifest),
        "auditDispositionManifest": audit_dispositions,
        "auditDispositionManifestSha256": canonical_hash(audit_dispositions),
        "productionManifest": items,
        "productionManifestSha256": canonical_hash(items),
        "finalProductionCount": len(items),
        "quarantineManifest": quarantine_manifest,
        "quarantineManifestSha256": canonical_hash(quarantine_manifest),
        "quarantinedCount": len(quarantine_manifest),
        "allAuditedItemsClean": not new_quarantine,
        "items": items, "itemManifestSha256": canonical_hash(items),
        "failures": failures,
        "passed": complete,
        "durationSeconds": round(time.time() - started, 3),
    }
    path = output_root / "z-fighting-reports/summary.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
    return summary


def main():
    args = arguments()
    if (sha256(REPAIR_SCRIPT) != FROZEN_REPAIR_SCRIPT_SHA256
            or sha256(RASTER_CLEANUP_SCRIPT) != FROZEN_RASTER_CLEANUP_SCRIPT_SHA256):
        raise RuntimeError("frozen Stage 10 repair/cleanup producer hash changed")
    require_under(args.repair_root, ROOT, "repair root")
    require_under(args.output, ROOT, "audit output root")
    repair_summary_path = args.repair_root / "summary.json"
    if not repair_summary_path.is_file():
        raise RuntimeError("frozen Stage 10 repair summary is missing")
    repair_summary = json.loads(repair_summary_path.read_text(encoding="utf-8"))
    material_contract = repair_summary.get("materialSemanticContract", {})
    if (
        repair_summary.get("schema") != "MassfrontStage10ModelRepairSummaryV3"
        or repair_summary.get("pipelineVersion") != REPAIR_PIPELINE_VERSION
        or repair_summary.get("pipelineMode") != REPAIR_PIPELINE_MODE
        or repair_summary.get("pipelineScriptSha256") != FROZEN_REPAIR_SCRIPT_SHA256
        or repair_summary.get("rasterCleanupScriptSha256")
        != FROZEN_RASTER_CLEANUP_SCRIPT_SHA256
        or material_contract.get("preflightScope")
        != "EVERY_SELECTED_CANONICAL_GLB_BEFORE_ITEM_ONE"
        or material_contract.get("selectedModelCount") != FULL_MATERIAL_MODEL_COUNT
        or material_contract.get("selectedMaterialSlotCount") != FULL_MATERIAL_SLOT_COUNT
        or material_contract.get("uniqueNonemptyNames")
        != FULL_MATERIAL_UNIQUE_NONEMPTY
        or material_contract.get("uniqueIncludingUnnamed")
        != FULL_MATERIAL_UNIQUE_WITH_UNNAMED
        or material_contract.get("unnamedSlots") != FULL_MATERIAL_UNNAMED_SLOTS
        or material_contract.get("materialCoverageSha256")
        != FULL_MATERIAL_COVERAGE_SHA256
        or material_contract.get("passed") is not True
        or repair_summary.get("totalScheduled") != EXPECTED_FULL_SCHEDULE
        or not isinstance(repair_summary.get("processed"), int)
        or not isinstance(repair_summary.get("failed"), int)
        or repair_summary.get("processed", 0) + repair_summary.get("failed", 0)
        != EXPECTED_FULL_SCHEDULE
    ):
        raise RuntimeError("frozen repair material-semantic census is not authoritative")
    catalog_hash = sha256(args.catalog)
    catalog = json.loads(args.catalog.read_text(encoding="utf-8"))
    all_entries, all_exclusions, all_counts = catalog_entries(
        catalog, set(), True, set(),
    )
    validate_full_contract(all_entries, all_exclusions, all_counts)
    pbr_summary, pbr_production, inherited_quarantine = (
        load_pbr_production_contract(
            args.repair_root, catalog_hash,
            [entry["key"] for entry in all_entries],
        )
    )
    production_keys = {item["key"] for item in pbr_production}
    entries, exclusions, counts = catalog_entries(
        catalog, set(args.family), args.include_spline, set(args.only),
    )
    full_catalog = not args.family and not args.only and args.include_spline and not args.limit
    if full_catalog:
        validate_full_contract(entries, exclusions, counts)
    entries = [entry for entry in entries if entry["key"] in production_keys]
    if args.limit:
        entries = entries[:args.limit]
    if not entries:
        raise RuntimeError("z-fighting audit selection has no PBR production items")
    selected_keys = {entry["key"] for entry in entries}
    input_manifest = [
        item for item in pbr_production if item["key"] in selected_keys
    ]
    pbr_summary_path = args.repair_root / "pbr-reports/summary.json"
    pbr_summary_binding = {
        "path": repo_relative(pbr_summary_path),
        "sha256": sha256(pbr_summary_path),
        "schema": pbr_summary["schema"],
        "pipelineVersion": pbr_summary["pipelineVersion"],
        "productionManifestSha256": pbr_summary["productionManifestSha256"],
        "quarantineManifestSha256": pbr_summary["quarantineManifestSha256"],
        "finalProductionCount": pbr_summary["finalProductionCount"],
    }
    started = time.time()
    results = []
    failures = []
    log("scheduled %d models" % len(entries))
    for index, entry in enumerate(entries, start=1):
        log("[%d/%d] %s" % (index, len(entries), entry["key"]))
        try:
            result = process(entry, args.repair_root, args.output, catalog_hash, args.force)
            results.append(result)
            log("  -> %s (%d findings, %.2fs)" % (
                result["status"], result["findings"]["total"], result.get("durationSeconds", 0.0)))
        except Exception as exc:
            failures.append({
                "key": entry["key"], "error": str(exc), "traceback": traceback.format_exc(),
            })
            log("  -> FAILED: " + str(exc))
        write_summary(
            output_root=args.output, results=results, failures=failures,
            total=len(entries), started=started, args=args,
            catalog_hash=catalog_hash, counts=counts, exclusions=exclusions,
            input_manifest=input_manifest,
            inherited_quarantine=inherited_quarantine,
            pbr_summary_binding=pbr_summary_binding,
        )
    summary = write_summary(
        args.output, results, failures, len(entries), started, args,
        catalog_hash, counts, exclusions, input_manifest,
        inherited_quarantine, pbr_summary_binding,
    )
    print(json.dumps(summary, indent=2), flush=True)
    if not summary["passed"]:
        sys.exit(2)


try:
    main()
except Exception:
    traceback.print_exc()
    sys.exit(3)
