"""Render hash-bound canonical-source/PBR evidence for the Stage 10 repair pack.

Run from an isolated Blender process, for example::

    blender --background --factory-startup \
      --python tools/blender/render-stage10-repaired-model-pack.py -- \
      --key mf-ground-kit-v1/colonial_plaza_deck

The script only imports GLBs.  It never saves a blend file, exports a model, or
touches canonical model assets.  Every pair uses one union-bounds camera,
matched lights, backface culling, and resolution.  Before preserves the source
material state; after must use the validated derived PBR material bindings.
Numerical cleanup-aware geometry signatures retain a material-independent proof.
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import json
import math
import os
from pathlib import Path
import re
import struct
import sys
import traceback
from urllib.parse import unquote_to_bytes

import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[2]
BLENDER_TOOLS = Path(__file__).resolve().parent
if str(BLENDER_TOOLS) not in sys.path:
    sys.path.insert(0, str(BLENDER_TOOLS))
try:
    from stage10_raster_cleanup import (
        SCHEMA as RASTER_CLEANUP_SCHEMA,
        acceptance_contract as raster_acceptance_contract,
        assert_material_semantic_names,
        dependency_contract as raster_dependency_contract,
    )
except Exception as dependency_error:
    print("MF_STAGE10_RENDER_DEPENDENCY_ERROR=" + repr(dependency_error), flush=True)
    raise SystemExit(3) from dependency_error

REPAIR_ROOT = ROOT / "tmp" / "stage10-model-repair"
CATALOG_FILE = ROOT / "tmp" / "stage10-model-review" / "catalog.json"
REPORT_ROOT = REPAIR_ROOT / "reports"
PBR_REPORT_ROOT = REPAIR_ROOT / "pbr-reports"
PBR_MODEL_ROOT = REPAIR_ROOT / "pbr-models"
AUDIT_REPORT_ROOT = REPAIR_ROOT / "z-fighting-reports"
OUTPUT_ROOT = REPAIR_ROOT / "renders"
REPAIR_SCRIPT = ROOT / "tools" / "blender" / "repair-stage10-model-pack.py"
PBR_SCRIPT = ROOT / "tools" / "blender" / "texture-stage10-model-pack.py"
AUDIT_SCRIPT = ROOT / "tools" / "blender" / "audit-stage10-z-fighting.py"
RASTER_CLEANUP_SCRIPT = ROOT / "tools" / "blender" / "stage10_raster_cleanup.py"
REPAIR_SUMMARY = REPAIR_ROOT / "summary.json"
PBR_SUMMARY = PBR_REPORT_ROOT / "summary.json"
PBR_LIBRARY_REPORT = PBR_REPORT_ROOT / "library" / "library.json"
AUDIT_SUMMARY = AUDIT_REPORT_ROOT / "summary.json"
ITEM_SCHEMA = "MassfrontStage10ModelPbrRenderPairV2"
SUMMARY_SCHEMA = "MassfrontStage10ModelPbrRenderSummaryV2"
REPAIR_REPORT_SCHEMA = "MassfrontStage10ModelRepairV3"
REPAIR_SUMMARY_SCHEMA = "MassfrontStage10ModelRepairSummaryV3"
PBR_REPORT_SCHEMA = "MassfrontStage10ModelPbrV1"
PBR_SUMMARY_SCHEMA = "MassfrontStage10ModelPbrSummaryV1"
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
EXPECTED_CATALOG_WORLD_COUNT = 320
EXPECTED_CATALOG_SPLINE_COUNT = 7
EXPECTED_CATALOG_ENTRY_COUNT = 327
EXPECTED_FULL_PAIR_COUNT = 327
EXPECTED_PIPELINE_EXCLUSIONS = {}
RENDERER_VERSION = 2
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
PBR_RASTER_POLICY = {
    "alphaMode": "OPAQUE",
    "doubleSided": False,
    "backfaceCulling": True,
}
PRODUCTION_SET_POLICY = {
    "schema": "MassfrontStage10ProductionSetPolicyV1",
    "repairEligibleStatuses": [
        "READY_FOR_TEXTURE_GENERATION", "UV_READY_GEOMETRY_REVIEW",
    ],
    "repairQuarantineStatus": "RECONSTRUCTION_REQUIRED",
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


def eevee_engine_id() -> str:
    # Blender 5.x renamed the Eevee enum back to BLENDER_EEVEE; Blender 4.x
    # exposed the same engine as BLENDER_EEVEE_NEXT.  Bind evidence to the
    # actual runtime enum rather than assuming one installed toolchain.
    scene = bpy.context.scene
    items = scene.bl_rna.properties["render"].fixed_type.properties["engine"].enum_items
    identifiers = {item.identifier for item in items}
    if "BLENDER_EEVEE" in identifiers:
        return "BLENDER_EEVEE"
    if "BLENDER_EEVEE_NEXT" in identifiers:
        return "BLENDER_EEVEE_NEXT"
    raise RuntimeError("This Blender runtime does not expose Eevee")


EEVEE_ENGINE = eevee_engine_id()
CAMERA_DIRECTION = Vector((1.45, -1.65, 1.22)).normalized()
FRAME_MARGIN = 1.18
BACKGROUND_COLOR = (0.006, 0.012, 0.018, 1.0)
MATERIAL_COLOR = (0.31, 0.37, 0.40, 1.0)
MATERIAL_ROUGHNESS = 0.72
LIGHTS = (
    ("MF_STAGE10_KEY", (1.7, -1.4, 2.5), 2.30, (0.72, 0.88, 1.0)),
    ("MF_STAGE10_FILL", (-1.45, -0.6, 1.25), 0.72, (0.38, 0.64, 1.0)),
    ("MF_STAGE10_RIM", (-0.2, 1.7, 2.0), 1.08, (0.26, 0.95, 1.0)),
)

RENDER_CONTRACT = {
    "schema": "MassfrontStage10PbrRenderContractV2",
    "engine": EEVEE_ENGINE,
    "camera": "MATCHED_UNION_BOUNDS_ORTHOGRAPHIC_ISOMETRIC",
    "cameraDirection": [round(value, 9) for value in CAMERA_DIRECTION],
    "frameMargin": FRAME_MARGIN,
    "background": list(BACKGROUND_COLOR),
    "materialPolicy": {
        "before": "CANONICAL_SOURCE_MATERIALS_WITH_NEUTRAL_FALLBACK",
        "after": "AUTHORITATIVE_DERIVED_PBR_MATERIALS_NO_FALLBACK",
        "backfaceCullingEnforced": True,
        "alphaMode": "OPAQUE",
        "doubleSided": False,
        "geometryProof": "CANONICAL_LOCK_PLUS_SHARED_RASTER_CLEANUP_AND_REPAIR_PBR_IDENTITY",
    },
    "uvContract": {
        "UV_GEN/TEXCOORD_0": "PER_RENDER_MESH_PER_FACE_NON_OVERLAP_BAKE_ATLAS",
        "UVMap_Tile/TEXCOORD_1": "VISIBLE_WORLD_CUBIC_4M_PBR_PATH",
    },
    "neutralFallback": {
        "name": "MF_STAGE10_NEUTRAL_BACKFACE_CULL",
        "baseColor": list(MATERIAL_COLOR),
        "metallic": 0.0,
        "roughness": MATERIAL_ROUGHNESS,
    },
    "lights": [
        {"name": name, "directionAnchor": list(anchor), "energy": energy, "color": list(color)}
        for name, anchor, energy, color in LIGHTS
    ],
    "worldKitSelection": "LOD0_TRUE_RENDER_MESHES_ONLY",
    "splineSelection": "ALL_TRUE_RENDER_MESHES",
    "excluded": [
        "COLLISION",
        "NAVIGATION",
        "PROOF_ONLY",
        "EVIDENCE_ONLY",
        "STUDIO_OR_SHADOW_FLOOR",
        "EMPTY_OR_ZERO_FACE_MESH",
        "HIDDEN_RENDER_OBJECT",
    ],
}


def arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Render matched canonical-source/PBR Stage 10 model evidence."
    )
    parser.add_argument(
        "--key",
        action="append",
        default=[],
        help="Exact report key to render; repeat for more than one model.",
    )
    parser.add_argument(
        "--family",
        action="append",
        default=[],
        help="Render every report in a family; repeat to select more families.",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Deterministic limit after key/family filtering (intended for smoke runs).",
    )
    parser.add_argument("--resolution", type=int, default=768)
    parser.add_argument("--force", action="store_true", help="Ignore valid resumable evidence.")
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    args = parser.parse_args(argv)
    if args.limit is not None and args.limit < 1:
        parser.error("--limit must be at least 1")
    if args.resolution < 256 or args.resolution > 2048:
        parser.error("--resolution must be between 256 and 2048")
    return args


def posix_relative(path: Path) -> str:
    return path.resolve().relative_to(ROOT).as_posix()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def canonical_text(value) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True)


def canonical_sha256(value) -> str:
    return hashlib.sha256(canonical_text(value).encode("utf-8")).hexdigest()


def write_json(path: Path, value) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".writing")
    temporary.write_text(json.dumps(value, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    os.replace(temporary, path)


def png_dimensions(path: Path) -> list[int]:
    with path.open("rb") as stream:
        header = stream.read(24)
    if header[:8] != b"\x89PNG\r\n\x1a\n":
        raise RuntimeError("Rendered evidence is not a PNG: %s" % path)
    return list(struct.unpack(">II", header[16:24]))


def png_dimensions_bytes(data: bytes, label: str) -> list[int]:
    if len(data) < 24 or data[:8] != b"\x89PNG\r\n\x1a\n":
        raise RuntimeError("PBR image is not a valid PNG: %s" % label)
    return list(struct.unpack(">II", data[16:24]))


def parse_glb(path: Path) -> tuple[dict, bytes]:
    data = path.read_bytes()
    if len(data) < 20:
        raise RuntimeError("PBR output is too small to be GLB: %s" % path)
    magic, version, declared = struct.unpack_from("<4sII", data, 0)
    if magic != b"glTF" or version != 2 or declared != len(data):
        raise RuntimeError("Invalid GLB header in %s" % path)
    offset = 12
    document = None
    binary = b""
    while offset + 8 <= len(data):
        length, kind = struct.unpack_from("<I4s", data, offset)
        offset += 8
        payload = data[offset : offset + length]
        if len(payload) != length:
            raise RuntimeError("Truncated GLB chunk in %s" % path)
        offset += length
        if kind == b"JSON":
            document = json.loads(payload.rstrip(b"\x00 \t\r\n").decode("utf-8"))
        elif kind == b"BIN\x00":
            binary = payload
    if document is None or offset != len(data):
        raise RuntimeError("GLB has no valid JSON chunk: %s" % path)
    return document, binary


def glb_image_bytes(path: Path, document: dict, binary: bytes, image: dict) -> tuple[bytes, str]:
    if "bufferView" in image:
        views = document.get("bufferViews", [])
        index = image["bufferView"]
        if not isinstance(index, int) or not 0 <= index < len(views):
            raise RuntimeError("PBR image has invalid bufferView")
        view = views[index]
        if view.get("buffer", 0) != 0:
            raise RuntimeError("PBR GLB image references a non-embedded buffer")
        start = int(view.get("byteOffset", 0))
        end = start + int(view.get("byteLength", 0))
        if start < 0 or end > len(binary) or start == end:
            raise RuntimeError("PBR image bufferView is empty or out of bounds")
        return binary[start:end], "BUFFER_VIEW"
    uri = image.get("uri")
    if not isinstance(uri, str) or not uri:
        raise RuntimeError("PBR image has neither bufferView nor URI")
    if uri.startswith("data:"):
        header, separator, payload = uri.partition(",")
        if not separator:
            raise RuntimeError("Malformed PBR image data URI")
        return (
            base64.b64decode(payload, validate=True)
            if ";base64" in header
            else unquote_to_bytes(payload),
            "DATA_URI",
        )
    external = (path.parent / uri).resolve()
    try:
        external.relative_to(REPAIR_ROOT.resolve())
    except ValueError as error:
        raise RuntimeError("PBR image URI escapes the derived-output boundary") from error
    if not external.is_file():
        raise RuntimeError("Referenced PBR image is missing: %s" % external)
    return external.read_bytes(), "EXTERNAL_URI"


def report_pbr_maps(report: dict) -> list[dict]:
    records = []
    for material in report.get("materials", []):
        maps = material.get("maps", {})
        for semantic in ("baseColor", "normal", "orm", "emissive"):
            record = maps.get(semantic)
            if record is None:
                continue
            if not isinstance(record, dict) or not record.get("path") or not record.get("sha256"):
                raise RuntimeError("Incomplete %s PBR map record for %s" % (semantic, report["key"]))
            records.append({"semantic": semantic, **record})
    if not records:
        raise RuntimeError("PBR report has no material map records: %s" % report["key"])
    return records


def validate_report_pbr_maps(report: dict) -> list[dict]:
    evidence = []
    for record in report_pbr_maps(report):
        path = (ROOT / record["path"]).resolve()
        try:
            path.relative_to(REPAIR_ROOT.resolve())
        except ValueError as error:
            raise RuntimeError("PBR map escapes the derived-output boundary: %s" % path) from error
        if not path.is_file():
            raise RuntimeError("PBR report references missing map: %s" % path)
        data = path.read_bytes()
        digest = hashlib.sha256(data).hexdigest()
        dimensions = png_dimensions_bytes(data, str(path))
        expected_dimensions = [record.get("width"), record.get("height")]
        if digest != record["sha256"] or dimensions != expected_dimensions:
            raise RuntimeError("PBR map hash/dimensions mismatch: %s" % path)
        evidence.append(
            {
                "semantic": record["semantic"],
                "path": posix_relative(path),
                "sha256": digest,
                "bytes": len(data),
                "dimensions": dimensions,
            }
        )
    return evidence


def validate_pbr_glb(path: Path, report: dict) -> dict:
    document, binary = parse_glb(path)
    images = []
    for index, image in enumerate(document.get("images", [])):
        data, storage = glb_image_bytes(path, document, binary, image)
        if storage != "BUFFER_VIEW" or image.get("mimeType") != "image/png":
            raise RuntimeError("PBR GLB image is not an embedded PNG")
        images.append(
            {
                "index": index,
                "name": image.get("name"),
                "mimeType": image.get("mimeType"),
                "storage": storage,
                "sha256": hashlib.sha256(data).hexdigest(),
                "bytes": len(data),
                "dimensions": png_dimensions_bytes(data, "%s image %d" % (path, index)),
            }
        )
    textures = document.get("textures", [])
    samplers = document.get("samplers", [])
    materials = document.get("materials", [])
    if not materials or any(
            material.get("alphaMode") != "OPAQUE"
            or material.get("doubleSided") is not False
            for material in materials):
        raise RuntimeError("PBR GLB contains a material outside exact OPAQUE/single-sided policy")

    def texture_source(texture_index: int) -> int:
        if not isinstance(texture_index, int) or not 0 <= texture_index < len(textures):
            raise RuntimeError("PBR material references an invalid texture index")
        texture = textures[texture_index]
        if samplers:
            sampler_index = texture.get("sampler", 0)
            if not isinstance(sampler_index, int) or not 0 <= sampler_index < len(samplers):
                raise RuntimeError("PBR texture references an invalid sampler")
            sampler = samplers[sampler_index]
            if sampler.get("wrapS", 10497) != 10497 or sampler.get("wrapT", 10497) != 10497:
                raise RuntimeError("PBR texture sampler is not REPEAT")
        source = texture.get("source")
        if source is None:
            source = texture.get("extensions", {}).get("KHR_texture_basisu", {}).get("source")
        if not isinstance(source, int) or not 0 <= source < len(images):
            raise RuntimeError("PBR texture references an invalid image")
        return source

    render_mesh_indices = {
        node["mesh"]
        for node in document.get("nodes", [])
        if node.get("extras", {}).get("mf_stage10_render") is True
        and isinstance(node.get("mesh"), int)
    }
    if not render_mesh_indices:
        raise RuntimeError("PBR GLB has no mf_stage10_render node proof")
    primitive_materials = []
    for mesh_index, mesh in enumerate(document.get("meshes", [])):
        if mesh_index not in render_mesh_indices:
            continue
        for primitive in mesh.get("primitives", []):
            material_index = primitive.get("material")
            if not isinstance(material_index, int) or not 0 <= material_index < len(materials):
                raise RuntimeError("Render primitive has no valid PBR material")
            if "TEXCOORD_1" not in primitive.get("attributes", {}):
                raise RuntimeError("PBR render primitive is missing TEXCOORD_1")
            primitive_materials.append(material_index)
    if not primitive_materials:
        raise RuntimeError("PBR GLB has no render primitives")
    used_images = set()
    binding_counts = {
        key: 0
        for key in (
            "baseColorTexture",
            "normalTexture",
            "metallicRoughnessTexture",
            "occlusionTexture",
            "emissiveTextureWhereRequired",
        )
    }
    report_materials = report.get("materials", [])
    emissive_required_names = {
        str(material.get("outputMaterial", ""))
        for material in report_materials
        if material.get("maps", {}).get("emissive") is not None
    }
    for material_index in primitive_materials:
        material = materials[material_index]
        pbr = material.get("pbrMetallicRoughness", {})
        infos = {
            "baseColorTexture": pbr.get("baseColorTexture"),
            "metallicRoughnessTexture": pbr.get("metallicRoughnessTexture"),
            "normalTexture": material.get("normalTexture"),
            "occlusionTexture": material.get("occlusionTexture"),
        }
        for semantic, info in infos.items():
            if not isinstance(info, dict) or info.get("texCoord", 0) != 1:
                raise RuntimeError("PBR %s is missing or not bound to TEXCOORD_1" % semantic)
            used_images.add(texture_source(info.get("index")))
            binding_counts[semantic] += 1
        name = str(material.get("name", ""))
        if name in emissive_required_names:
            info = material.get("emissiveTexture")
            if not isinstance(info, dict) or info.get("texCoord", 0) != 1:
                raise RuntimeError("Required emissive texture is not bound to TEXCOORD_1")
            used_images.add(texture_source(info.get("index")))
            binding_counts["emissiveTextureWhereRequired"] += 1
    expected_hashes = {record["sha256"] for record in report_pbr_maps(report)}
    embedded_hashes = {images[index]["sha256"] for index in used_images}
    if not expected_hashes.issubset(embedded_hashes):
        raise RuntimeError("PBR GLB image payloads do not cover every reported material map")
    coverage = report["fullPbrCoverage"]
    reported_images = {item["index"]: item for item in coverage.get("embeddedImages", [])}
    if set(reported_images) != set(range(len(images))):
        raise RuntimeError("PBR embedded-image report does not cover every GLB image")
    for image in images:
        reported = reported_images[image["index"]]
        if (
            reported.get("name") != image["name"]
            or reported.get("sha256") != image["sha256"]
            or [reported.get("width"), reported.get("height")] != image["dimensions"]
        ):
            raise RuntimeError("PBR embedded-image report disagrees with GLB payload")
    if coverage.get("renderPrimitives") != len(primitive_materials):
        raise RuntimeError("PBR GLB primitive count disagrees with coverage report")
    for field, count in binding_counts.items():
        if coverage.get(field) != count:
            raise RuntimeError("PBR %s count disagrees with coverage report" % field)
    if coverage.get("totalBound") != len(primitive_materials):
        raise RuntimeError("PBR totalBound disagrees with direct GLB validation")
    used_material_count = len(set(primitive_materials))
    if (coverage.get("opaqueMaterialCount") != used_material_count
            or coverage.get("singleSidedMaterialCount") != used_material_count
            or coverage.get("doubleSidedMaterialCount") != 0):
        raise RuntimeError("PBR explicit raster-state counts disagree with direct GLB validation")
    return {
        "glbJsonSha256": canonical_sha256(document),
        "renderPrimitiveCount": len(primitive_materials),
        "bindingCounts": binding_counts,
        "images": images,
        "usedImageIndices": sorted(used_images),
        "expectedReportedMapHashes": sorted(expected_hashes),
        "rasterPolicy": PBR_RASTER_POLICY,
        "opaqueSingleSidedMaterialCount": used_material_count,
    }


def safe_component(value: str) -> str:
    result = re.sub(r"[^A-Za-z0-9._-]+", "_", str(value)).strip("._")
    if not result or result in {".", ".."}:
        raise RuntimeError("Unsafe empty output component for %r" % value)
    return result


def validate_pbr_artifact_disposition(
        pbr: dict,
        repair: dict,
        artifact: dict,
        final_uv: dict,
        coverage: dict,
) -> None:
    disposition = pbr.get("artifactDisposition")
    proof = pbr.get("contentEquivalentRebind")
    proof_hash = pbr.get("contentEquivalentRebindSha256")
    if disposition == "REBUILT":
        if proof is not None or proof_hash is not None:
            raise RuntimeError(
                "Rebuilt PBR report carries rebind provenance for %s" % pbr["key"]
            )
        return
    if disposition != "CONTENT_EQUIVALENT_REBOUND" or not isinstance(proof, dict):
        raise RuntimeError("PBR artifact disposition failed for %s" % pbr["key"])
    legacy = proof.get("legacyReport", {})
    current_pipeline = proof.get("currentValidationPipeline", {})
    current_input = proof.get("currentRepairInput", {})
    reused_output = proof.get("reusedPbrOutput", {})
    fresh = proof.get("freshValidation", {})
    expected_archive = (
        "tmp/stage10-model-repair/pbr-reports/rebind-provenance/legacy/%s/%s.%s.legacy.json.provenance"
        % (pbr["family"], safe_component(pbr["id"]), legacy.get("sha256"))
    )
    archive = (ROOT / str(legacy.get("path", ""))).resolve()
    current_source = (ROOT / str(current_input.get("path", ""))).resolve()
    current_output = (ROOT / str(reused_output.get("path", ""))).resolve()
    for label, candidate, boundary in (
        (
            "legacy provenance archive",
            archive,
            PBR_REPORT_ROOT / "rebind-provenance",
        ),
        ("current repair input", current_source, REPAIR_ROOT / "models"),
        ("reused PBR output", current_output, PBR_MODEL_ROOT),
    ):
        try:
            candidate.relative_to(boundary.resolve())
        except ValueError as error:
            raise RuntimeError("PBR rebind %s escapes its boundary" % label) from error
    current_map_count = sum(
        len(material.get("maps", {})) for material in pbr.get("materials", [])
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
        or sha256_file(archive) != legacy.get("sha256")
        or current_pipeline != {
            "path": posix_relative(PBR_SCRIPT),
            "sha256": sha256_file(PBR_SCRIPT),
            "blenderVersion": pbr.get("blenderVersion"),
        }
        or current_input.get("path") != repair.get("output")
        or current_input.get("sha256") != repair.get("outputSha256")
        or not current_source.is_file()
        or current_input.get("bytes") != current_source.stat().st_size
        or sha256_file(current_source) != current_input.get("sha256")
        or reused_output.get("path") != pbr.get("output")
        or reused_output.get("sha256") != pbr.get("outputSha256")
        or not current_output.is_file()
        or reused_output.get("bytes") != current_output.stat().st_size
        or sha256_file(current_output) != reused_output.get("sha256")
        or proof.get("byteIdenticalRepairInput") is not True
        or proof.get("byteIdenticalPbrOutput") is not True
        or proof.get("legacyMapRecordCountRevalidated") != current_map_count
        or current_map_count <= 0
        or proof.get("legacyMaterialManifestSha256")
        != canonical_sha256(pbr.get("materials", []))
        or proof.get("currentMaterialManifestSha256")
        != canonical_sha256(pbr.get("materials", []))
        or proof.get("legacyLibraryContractSha256")
        != pbr.get("library", {}).get("contractSha256")
        or proof.get("currentLibraryContractSha256")
        != pbr.get("library", {}).get("contractSha256")
        or any(fresh.get(field) is not True for field in required_fresh_flags)
        or fresh.get("sourceSceneIdentitySha256")
        != artifact.get("sourceSceneIdentitySha256")
        or fresh.get("finalSceneIdentitySha256")
        != artifact.get("finalSceneIdentitySha256")
        or fresh.get("sourceSceneIdentitySha256")
        != fresh.get("finalSceneIdentitySha256")
        or fresh.get("fullPbrCoverageSha256") != canonical_sha256(coverage)
        or fresh.get("finalUvProofSha256") != canonical_sha256(final_uv)
        or proof.get("previousReportUsedAsCurrentAcceptanceEvidence") is not False
        or proof.get("outputReexported") is not False
        or proof.get("reportRewritten") is not True
        or proof_hash != canonical_sha256(proof)
    ):
        raise RuntimeError(
            "PBR content-equivalent rebind provenance failed for %s" % pbr["key"]
        )


def vector_list(value: Vector) -> list[float]:
    return [round(float(component), 6) for component in value]


def load_reports() -> tuple[list[dict], dict[str, Path]]:
    if not REPORT_ROOT.is_dir():
        raise RuntimeError("Repair report directory is missing: %s" % REPORT_ROOT)
    reports = []
    paths = {}
    for path in sorted(REPORT_ROOT.rglob("*.json"), key=lambda item: item.as_posix().lower()):
        report = json.loads(path.read_text(encoding="utf-8"))
        if report.get("schema") != REPAIR_REPORT_SCHEMA:
            raise RuntimeError("Unexpected repair report schema in %s" % path)
        key = report.get("key")
        if not isinstance(key, str) or not key:
            raise RuntimeError("Repair report has no key: %s" % path)
        if key in paths:
            raise RuntimeError("Duplicate repair report key: %s" % key)
        reports.append(report)
        paths[key] = path
    reports.sort(key=lambda report: report["key"].lower())
    return reports, paths


def material_semantic_contract_green(repair: dict) -> bool:
    contract = repair.get("materialSemanticContract", {})
    names = contract.get("originalMaterialNames")
    if not isinstance(names, list) or any(not isinstance(name, str) for name in names):
        return False
    expected_base = assert_material_semantic_names(names)
    inventory = {
        "key": repair.get("key"),
        "sourceSha256": repair.get("sourceSha256"),
        "materialNames": names,
    }
    return (
        contract.get("preflightScope") == "ORIGINAL_GLB_JSON_MATERIAL_DEFINITIONS"
        and contract.get("sourceSha256") == repair.get("sourceSha256")
        and contract.get("materialSlotCount") == len(names)
        and contract.get("materialInventorySha256") == canonical_sha256(inventory)
        and all(contract.get(field) == value for field, value in expected_base.items())
    )


def material_semantic_summary_green(contract: dict, reports: list[dict]) -> bool:
    """Rebuild the producer's ordered full-catalog material preflight proof."""
    if not isinstance(contract, dict) or not CATALOG_FILE.is_file():
        return False
    catalog = json.loads(CATALOG_FILE.read_text(encoding="utf-8"))
    ordered_keys = []
    for family in catalog.get("worldKits", []):
        for module in family.get("modules", []):
            if module.get("key") not in EXPECTED_PIPELINE_EXCLUSIONS:
                ordered_keys.append(module.get("key"))
    for model in catalog.get("splineExports", catalog.get("splineModels", [])):
        if model.get("key") not in EXPECTED_PIPELINE_EXCLUSIONS:
            ordered_keys.append(model.get("key"))
    by_key = {report.get("key"): report for report in reports}
    if (
        any(not isinstance(key, str) or not key for key in ordered_keys)
        or len(ordered_keys) != len(set(ordered_keys))
        or set(ordered_keys) != set(by_key)
    ):
        return False
    coverage = []
    all_names = []
    for key in ordered_keys:
        report = by_key[key]
        if not material_semantic_contract_green(report):
            return False
        names = report["materialSemanticContract"]["originalMaterialNames"]
        all_names.extend(names)
        coverage.append({
            "key": key,
            "sourceSha256": report.get("sourceSha256"),
            "materialNames": names,
        })
    expected_base = assert_material_semantic_names(all_names)
    return (
        contract.get("preflightScope")
        == "EVERY_SELECTED_CANONICAL_GLB_BEFORE_ITEM_ONE"
        and contract.get("selectedModelCount") == len(ordered_keys)
        and contract.get("selectedModelCount") == FULL_MATERIAL_MODEL_COUNT
        and contract.get("selectedMaterialSlotCount") == len(all_names)
        and contract.get("selectedMaterialSlotCount") == FULL_MATERIAL_SLOT_COUNT
        and contract.get("materialCoverageSha256") == canonical_sha256(coverage)
        and contract.get("materialCoverageSha256") == FULL_MATERIAL_COVERAGE_SHA256
        and contract.get("allSelectedModelsPassed") is True
        and contract.get("fullCatalogExpectedUniqueNonemptyNames")
        == expected_base["uniqueNonemptyNames"]
        == FULL_MATERIAL_UNIQUE_NONEMPTY
        and contract.get("fullCatalogExpectedUniqueIncludingUnnamed")
        == expected_base["uniqueIncludingUnnamed"]
        == FULL_MATERIAL_UNIQUE_WITH_UNNAMED
        and contract.get("fullCatalogExpectedUnnamedSlots")
        == expected_base["unnamedSlots"]
        == FULL_MATERIAL_UNNAMED_SLOTS
        and contract.get("fullCatalogCountsMatched") is True
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


def lineage_proof_green(cleanup: dict) -> bool:
    proof = cleanup.get("lineageProof", {})
    objects = cleanup.get("objects")
    numeric_fields = (
        "maximumSourcePlaneMeasuredStoredDriftM",
        "maximumSourcePlaneArithmeticGuardM",
        "maximumSourcePlaneMeasuredStoredDriftPlusArithmeticGuardM",
        "maximumSourcePlaneRepresentationalErrorBoundM",
    )

    def finite_nonnegative(value) -> bool:
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


def raster_cleanup_progress_green(cleanup: dict) -> bool:
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


def canonical_record_hash_matches(record: dict, field: str) -> bool:
    if not isinstance(record, dict):
        return False
    digest = record.get(field)
    if not isinstance(digest, str) or re.fullmatch(r"[0-9a-f]{64}", digest) is None:
        return False
    payload = dict(record)
    payload.pop(field, None)
    return canonical_sha256(payload) == digest


def tiled_uv_metric_green(metric: dict) -> bool:
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
        and metric.get("zeroUvAreaTriangles") == 0
        and metric.get("exactZeroUvAreaTriangles") == 0
        and metric.get("projectedFloorFailureTriangles") == 0
        and metric.get("nonFiniteTriangles") == 0
        and metric.get("finite") is True and metric.get("nonZero") is True
        and metric.get("scaleConsistent") is True
        and metric.get("withinCubicStretchBound") is True
        and metric.get("valid") is True
    )


def tiled_uv_aggregate_green(
        proof: dict, scope: str, artifact: str | None,
        artifact_sha256: str | None, expected_names: list[str]) -> bool:
    post_export = scope == "POST_EXPORT_FRESH_BLENDER_REIMPORT"
    if not isinstance(proof, dict):
        return False
    per_mesh = proof.get("perMesh", [])
    names = [item.get("name") for item in per_mesh]
    artifact_green = (
        proof.get("artifact") is None and proof.get("artifactSha256") is None
        if not post_export else
        proof.get("artifact") == artifact
        and proof.get("artifactSha256") == artifact_sha256
        and proof.get("artifactSha256AfterProof") == artifact_sha256
        and proof.get("artifactSha256Stable") is True
        and proof.get("exportedTexcoordChannelProof", {}).get("passed") is True
        and proof.get("exportedTexcoordChannelProof", {}).get(
            "freshBlenderImportLayerIndexForTexcoord1"
        ) == 1
        and canonical_record_hash_matches(
            proof.get("exportedTexcoordChannelProof", {}), "canonicalProofSha256",
        )
    )
    return (
        proof.get("schema") == "MassfrontStage10TiledUvAggregateProofV1"
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
        and all(
            item.get("tiledUvLayerIndex") == 1
            and item.get("tiledUvLayerSemantic") == "TEXCOORD_1"
            and (len(item.get("uvLayers", [])) == 2 if post_export
                 else item.get("uvLayers") == ["UV_GEN", "UVMap_Tile"])
            and item.get("tiledUvAnchorProof", {}).get("schema")
            == "MassfrontStage10TiledUvConstructionProofV1"
            and item.get("tiledUvAnchorProof", {}).get("method")
            == TILED_UV_ANCHOR_METHOD
            and item.get("tiledUvAnchorProof", {}).get("passed") is True
            and item.get("tiledUvAnchorProof", {}).get("nonIntegralAnchorViolations") == 0
            and item.get("tiledUvAnchorProof", {}).get("storageRealizationViolations") == 0
            and item.get("tiledUvAnchorProof", {}).get("moduloPhaseViolations") == 0
            and item.get("tiledUvAnchorProof", {}).get("derivativeBoundViolations") == 0
            and canonical_record_hash_matches(
                item.get("tiledUvAnchorProof", {}), "canonicalProofSha256",
            )
            and tiled_uv_metric_green(item.get("tiledUvMetrics", {}))
            for item in per_mesh
        )
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


def repair_tiled_uv_green(report: dict) -> bool:
    contract = report.get("tiledUvConstructionContract", {})
    fixtures = contract.get("fixtures", {}) if isinstance(contract, dict) else {}
    names = sorted(
        item.get("name") for item in report.get("meshes", [])
        if isinstance(item, dict) and isinstance(item.get("name"), str)
    )
    return (
        contract.get("schema") == "MassfrontStage10TiledUvConstructionContractV1"
        and contract.get("method") == TILED_UV_ANCHOR_METHOD
        and contract.get("metricMethod") == TILED_UV_METRIC_METHOD
        and contract.get("passed") is True
        and contract.get("worldDoubleAreaFloor") == 1.0e-12
        and contract.get("texelScaleErrorLimit") == 0.005
        and fixtures.get("ruinedBunkerMicroTriangle3067", {}).get("passed") is True
        and fixtures.get("ruinedBunkerExportCollapseTriangle2532", {}).get("passed") is True
        and fixtures.get("rotatedHierarchyAffineCancellation", {}).get("passed") is True
        and fixtures.get("exactCollapsedUvRejected") is True
        and fixtures.get("scaleDistortionAboveFrozenLimitRejected") is True
        and canonical_record_hash_matches(contract, "canonicalContractSha256")
        and tiled_uv_aggregate_green(
            report.get("preExportTiledUvProof", {}), "PRE_EXPORT_BLENDER_SCENE",
            None, None, names,
        )
        and tiled_uv_aggregate_green(
            report.get("postExportTiledUvProof", {}),
            "POST_EXPORT_FRESH_BLENDER_REIMPORT",
            report.get("output"), report.get("outputSha256"), names,
        )
        and tiled_uv_aggregate_green(
            report.get("postExportTextureSourceTiledUvProof", {}),
            "POST_EXPORT_FRESH_BLENDER_REIMPORT",
            report.get("textureSource"), report.get("textureSourceSha256"), names,
        )
    )


def load_repair_contract(reports: list[dict]) -> dict:
    if not CATALOG_FILE.is_file():
        raise RuntimeError("Current Stage 10 model-review catalog is missing")
    if not REPAIR_SUMMARY.is_file():
        raise RuntimeError("Repair summary is missing: %s" % REPAIR_SUMMARY)
    summary = json.loads(REPAIR_SUMMARY.read_text(encoding="utf-8"))
    if summary.get("schema") != REPAIR_SUMMARY_SCHEMA:
        raise RuntimeError("Repair summary is not the current V3 contract")
    if (summary.get("pipelineVersion") != REPAIR_PIPELINE_VERSION
            or summary.get("pipelineMode") != REPAIR_PIPELINE_MODE):
        raise RuntimeError("Repair summary is not the authoritative V18 cleanup pipeline")
    if (summary.get("catalog") != posix_relative(CATALOG_FILE)
            or summary.get("catalogSha256") != sha256_file(CATALOG_FILE)):
        raise RuntimeError("Repair summary is not bound to the current model-review catalog")
    if (summary.get("sourcePolicy")
            != "CANONICAL_MODEL_BYTES_LOCKED_DERIVED_RASTER_CLEAN_AND_UV_ONLY"
            or summary.get("geometryPolicy")
            != "SIGNED_SAME_WINDING_PAIR_LOCAL_CLEANUP_OPPOSITE_WINDING_PRESERVED"
            or summary.get("repairDependencyContract") != raster_dependency_contract()
            or summary.get("rasterAcceptanceContract") != raster_acceptance_contract()
            or summary.get("pipelineScript") != posix_relative(REPAIR_SCRIPT)
            or summary.get("pipelineScriptSha256") != sha256_file(REPAIR_SCRIPT)
            or summary.get("rasterCleanupScript") != posix_relative(RASTER_CLEANUP_SCRIPT)
            or summary.get("rasterCleanupScriptSha256") != sha256_file(RASTER_CLEANUP_SCRIPT)
            or summary.get("rasterCleanup", {}).get("passed") is not True
            or summary.get("rasterCleanup", {}).get("acceptedPairsAfter") != 0
            or summary.get("rasterCleanup", {}).get("exactDuplicatePairsAfter") != 0
            or summary.get("rasterCleanup", {}).get("remainingPairs") != 0):
        raise RuntimeError("Repair summary shared raster-cleanup proof is not green")
    expected_catalog_counts = {
        "worldModules": EXPECTED_CATALOG_WORLD_COUNT,
        "splineModels": EXPECTED_CATALOG_SPLINE_COUNT,
        "catalogCandidates": EXPECTED_CATALOG_ENTRY_COUNT,
        "repairLocked": 7,
        "metadataBlocked": 1,
        "pipelineExcluded": len(EXPECTED_PIPELINE_EXCLUSIONS),
    }
    if summary.get("catalogCounts") != expected_catalog_counts:
        raise RuntimeError("Repair summary catalog counts do not match the authoritative selection")
    if summary.get("processedStatusContract") != [
        "READY_FOR_TEXTURE_GENERATION",
        "UV_READY_GEOMETRY_REVIEW",
        "RECONSTRUCTION_REQUIRED",
    ]:
        raise RuntimeError("Repair summary processed-status contract is unexpected")
    selection = summary.get("selection", {})
    if selection != {
        "families": [],
        "only": [],
        "includeSpline": True,
        "limit": 0,
        "fullCatalog": True,
    }:
        raise RuntimeError("Repair summary is not a full-catalog selection")
    if summary.get("pipelineExclusionCount") != len(EXPECTED_PIPELINE_EXCLUSIONS):
        raise RuntimeError("Repair summary does not declare exactly ten exclusions")
    exclusions = {
        item.get("key"): item.get("reason") for item in summary.get("pipelineExclusions", [])
    }
    if exclusions != EXPECTED_PIPELINE_EXCLUSIONS:
        raise RuntimeError("Repair summary exclusion manifest is not the authoritative ten")
    if summary.get("staleExcludedOutputsRemaining") != []:
        raise RuntimeError("Stale excluded derived outputs remain in the repair pack")
    expected = summary.get("totalScheduled")
    if expected != EXPECTED_FULL_PAIR_COUNT:
        raise RuntimeError("Repair summary must schedule exactly 321 current reports")
    if (not isinstance(summary.get("processed"), int)
            or not isinstance(summary.get("failed"), int)
            or summary.get("processed", 0) + summary.get("failed", 0) != expected
            or len(summary.get("failures", [])) != summary.get("failed")):
        raise RuntimeError("Repair summary does not account for all 321 dispositions")
    material_contract = summary.get("materialSemanticContract", {})
    if (
        material_contract.get("preflightScope")
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
    ):
        raise RuntimeError(
            "Repair summary material-semantic coverage is not the exact current catalog"
        )
    status_total = sum(int(value) for value in summary.get("statusCounts", {}).values())
    if status_total != summary.get("processed"):
        raise RuntimeError("Repair summary status counts do not match processed reports")
    for report in reports:
        if report["key"] in EXPECTED_PIPELINE_EXCLUSIONS:
            raise RuntimeError("Excluded catalog key leaked into repair reports: %s" % report["key"])
        if report.get("pipelineVersion") != summary.get("pipelineVersion"):
            raise RuntimeError("Repair pipeline version mismatch for %s" % report["key"])
        if report.get("catalogSha256") != summary.get("catalogSha256"):
            raise RuntimeError("Repair catalog hash mismatch for %s" % report["key"])
        if report.get("catalogRepairLocked") or report.get("catalogMetadataBlocked"):
            raise RuntimeError("Excluded catalog entry leaked into repair reports: %s" % report["key"])
        if report.get("status") not in (
                "READY_FOR_TEXTURE_GENERATION", "UV_READY_GEOMETRY_REVIEW"):
            raise RuntimeError("Non-production repair report reached renderer: %s" % report["key"])
        cleanup = report.get("rasterCleanup", {})
        if (report.get("schema") != REPAIR_REPORT_SCHEMA
                or report.get("pipelineMode") != REPAIR_PIPELINE_MODE
                or report.get("pipelineScript") != posix_relative(REPAIR_SCRIPT)
                or report.get("pipelineScriptSha256") != sha256_file(REPAIR_SCRIPT)
                or report.get("rasterCleanupScript") != posix_relative(RASTER_CLEANUP_SCRIPT)
                or report.get("rasterCleanupScriptSha256") != sha256_file(RASTER_CLEANUP_SCRIPT)
                or report.get("sourceUntouched") is not True
                or report.get("canonicalTopologyUntouched") is not True
                or report.get("uvGeometryPreserved") is not True
                or report.get("repairDependencyContract") != raster_dependency_contract()
                or not material_semantic_contract_green(report)
                or report.get("rasterAcceptanceContract") != raster_acceptance_contract()
                or cleanup.get("dependencyContract") != raster_dependency_contract()
                or cleanup.get("contract") != raster_acceptance_contract()
                or cleanup.get("passed") is not True
                or cleanup.get("acceptedPairsAfter") != 0
                or cleanup.get("exactDuplicatePairsAfter") != 0
                or cleanup.get("remainingPairs") != 0
                or cleanup.get("stabilized") is not True
                or not lineage_proof_green(cleanup)
                or not raster_cleanup_progress_green(cleanup)
                or not repair_tiled_uv_green(report)):
            raise RuntimeError("Repair item shared cleanup proof failed for %s" % report["key"])
    return summary


def load_pbr_reports(
        repair_reports: list[dict],
        repair_summary: dict,
) -> tuple[dict[str, dict], dict[str, Path], dict]:
    if (
        not PBR_REPORT_ROOT.is_dir()
        or not PBR_SUMMARY.is_file()
        or not PBR_LIBRARY_REPORT.is_file()
    ):
        raise RuntimeError("PBR report pack is not ready: %s" % PBR_REPORT_ROOT)
    reports = {}
    paths = {}
    for path in sorted(PBR_REPORT_ROOT.rglob("*.json"), key=lambda item: item.as_posix().lower()):
        if path.resolve() in {PBR_SUMMARY.resolve(), PBR_LIBRARY_REPORT.resolve()}:
            continue
        report = json.loads(path.read_text(encoding="utf-8"))
        if report.get("schema") != PBR_REPORT_SCHEMA:
            raise RuntimeError("Unexpected PBR report schema in %s" % path)
        key = report.get("key")
        if not isinstance(key, str) or not key or key in reports:
            raise RuntimeError("Missing or duplicate PBR report key in %s" % path)
        reports[key] = report
        paths[key] = path
    expected_keys = {report["key"] for report in repair_reports}
    if set(reports) != expected_keys:
        missing = sorted(expected_keys - set(reports))
        extra = sorted(set(reports) - expected_keys)
        raise RuntimeError("PBR report key mismatch; missing=%r extra=%r" % (missing, extra))
    summary = json.loads(PBR_SUMMARY.read_text(encoding="utf-8"))
    if summary.get("schema") != PBR_SUMMARY_SCHEMA:
        raise RuntimeError("PBR summary is not the authoritative V1 contract")
    if summary.get("pipelineVersion") != 1 or summary.get("pipelineMode") != "DERIVED_ATLAS_PBR_ONLY":
        raise RuntimeError("PBR summary pipeline contract is unexpected")
    if (
        summary.get("contentEquivalentRebindRequested") is not True
        or summary.get("contentEquivalentRebindPolicy")
        != CONTENT_EQUIVALENT_REBIND_POLICY
    ):
        raise RuntimeError("PBR summary rebind policy is not authoritative")
    if summary.get("catalogSha256") != repair_summary.get("catalogSha256"):
        raise RuntimeError("PBR summary is not bound to the current repair catalog")
    repair_material_contract = repair_summary.get("materialSemanticContract", {})
    pbr_repair_binding = summary.get("repairSummary", {})
    if (
        pbr_repair_binding.get("path") != posix_relative(REPAIR_SUMMARY)
        or pbr_repair_binding.get("sha256") != sha256_file(REPAIR_SUMMARY)
        or pbr_repair_binding.get("schema") != REPAIR_SUMMARY_SCHEMA
        or pbr_repair_binding.get("pipelineVersion") != REPAIR_PIPELINE_VERSION
        or pbr_repair_binding.get("materialSemanticContract")
        != repair_material_contract
        or pbr_repair_binding.get("materialSemanticContractCanonicalJson")
        != canonical_text(repair_material_contract)
        or pbr_repair_binding.get("materialSemanticContractSha256")
        != canonical_sha256(repair_material_contract)
        or summary.get("repairMaterialSemanticContract") != repair_material_contract
        or summary.get("repairMaterialSemanticContractSha256")
        != canonical_sha256(repair_material_contract)
    ):
        raise RuntimeError("PBR summary repair/material-semantic hash binding failed")
    if summary.get("catalogCounts") != {
        "worldModules": EXPECTED_CATALOG_WORLD_COUNT,
        "splineModels": EXPECTED_CATALOG_SPLINE_COUNT,
        "repairLocked": 7,
        "metadataBlocked": 1,
        "pipelineExcluded": len(EXPECTED_PIPELINE_EXCLUSIONS),
    }:
        raise RuntimeError("PBR summary catalog counts are not authoritative")
    if summary.get("selection") != {
        "families": [],
        "only": [],
        "includeSpline": True,
        "limit": 0,
        "fullCatalog": True,
    }:
        raise RuntimeError("PBR summary is not the authoritative full-catalog selection")
    if {
        item.get("key"): item.get("reason") for item in summary.get("exclusions", [])
    } != EXPECTED_PIPELINE_EXCLUSIONS:
        raise RuntimeError("PBR summary exclusion manifest is not the authoritative ten")
    expected = len(repair_reports)
    scheduled = summary.get("totalScheduled")
    processed = summary.get("processed")
    failed = summary.get("failed")
    if scheduled != expected or processed != expected or failed != 0:
        raise RuntimeError("PBR summary is incomplete or does not match the repair selection")
    if summary.get("statusCounts") != {"PBR_TEXTURED": expected} or summary.get("failures") != []:
        raise RuntimeError("PBR summary status/failure contract is not a clean full run")
    disposition_counts = {}
    for report in reports.values():
        disposition = report.get("artifactDisposition")
        disposition_counts[disposition] = disposition_counts.get(disposition, 0) + 1
    if (
        set(disposition_counts) - {"REBUILT", "CONTENT_EQUIVALENT_REBOUND"}
        or summary.get("artifactDispositionCounts") != disposition_counts
    ):
        raise RuntimeError("PBR summary artifact dispositions do not recompute")
    summary_items = summary.get("items", [])
    if len(summary_items) != expected or {item.get("key") for item in summary_items} != expected_keys:
        raise RuntimeError("PBR summary item manifest does not cover the exact repair selection")
    if summary.get("itemManifestSha256") != canonical_sha256(summary_items):
        raise RuntimeError("PBR summary item manifest hash does not recompute")
    for item in summary_items:
        key = item["key"]
        report = reports[key]
        report_path = paths[key]
        if (
            item.get("status") != "PBR_TEXTURED"
            or item.get("artifactDisposition") != report.get("artifactDisposition")
            or item.get("contentEquivalentRebindSha256")
            != report.get("contentEquivalentRebindSha256")
            or item.get("report") != posix_relative(report_path)
            or item.get("reportSha256") != sha256_file(report_path)
            or item.get("output") != report.get("output")
            or item.get("outputSha256") != report.get("outputSha256")
        ):
            raise RuntimeError("PBR summary item hash binding failed for %s" % key)
    for repair in repair_reports:
        pbr = reports[repair["key"]]
        if pbr.get("catalogSha256") != repair_summary.get("catalogSha256"):
            raise RuntimeError("PBR catalog hash mismatch for %s" % repair["key"])
        if pbr.get("status") != "PBR_TEXTURED":
            raise RuntimeError("PBR report is not textured: %s" % repair["key"])
        if pbr.get("pipelineVersion") != 1 or pbr.get("pipelineMode") != "DERIVED_ATLAS_PBR_ONLY":
            raise RuntimeError("Unexpected PBR pipeline contract for %s" % repair["key"])
        if not pbr.get("contractSha256") or not pbr.get("resumeContractSha256"):
            raise RuntimeError("PBR report contract hashes are missing for %s" % repair["key"])
        if pbr.get("id") != repair["id"] or pbr.get("family") != repair["family"]:
            raise RuntimeError("PBR identity mismatch for %s" % repair["key"])
        if pbr.get("canonicalSource") != repair["source"]:
            raise RuntimeError("PBR canonical source mismatch for %s" % repair["key"])
        if pbr.get("canonicalSourceSha256") != repair["sourceSha256"]:
            raise RuntimeError("PBR canonical source hash mismatch for %s" % repair["key"])
        if pbr.get("source") != repair["output"] or pbr.get("sourceSha256") != repair["outputSha256"]:
            raise RuntimeError("PBR repair-output binding mismatch for %s" % repair["key"])
        if pbr.get("repairPipelineVersion") != repair["pipelineVersion"]:
            raise RuntimeError("PBR repair pipeline version mismatch for %s" % repair["key"])
        expected_repair_path = (
            REPORT_ROOT / repair["family"] / (safe_component(repair["id"]) + ".json")
        ).resolve()
        if pbr.get("repairReport") != posix_relative(expected_repair_path):
            raise RuntimeError("PBR repair report path mismatch for %s" % repair["key"])
        expected_resume = {
            "pipelineVersion": pbr["pipelineVersion"],
            "pipelineMode": pbr["pipelineMode"],
            "pipelineScriptSha256": sha256_file(PBR_SCRIPT),
            "mappingVersion": pbr.get("mappingVersion"),
            "contentEquivalentRebindPolicy": CONTENT_EQUIVALENT_REBIND_POLICY,
            "blenderVersion": pbr.get("blenderVersion"),
            "catalogSha256": pbr.get("catalogSha256"),
            "repairReportSha256": sha256_file(expected_repair_path),
            "repairPipelineScriptSha256": repair["pipelineScriptSha256"],
            "rasterCleanupScriptSha256": repair["rasterCleanupScriptSha256"],
            "repairRasterCleanupSha256": canonical_sha256(repair["rasterCleanup"]),
            "repairLineageProofSha256": canonical_sha256(
                repair["rasterCleanup"]["lineageProof"]
            ),
            "repairMaterialSemanticContractSha256": canonical_sha256(
                repair["materialSemanticContract"]
            ),
            "sourceSha256": repair["outputSha256"],
            "librarySourceContractSha256": pbr.get("library", {}).get(
                "sourceContractSha256"
            ),
        }
        expected_contract = {
            "resume": canonical_sha256(expected_resume),
            "library": pbr.get("library", {}).get("contractSha256"),
            "materials": pbr.get("materials"),
            "preservation": pbr.get("preservation"),
            "uv": pbr.get("uv"),
            "coverage": {
                key: value for key, value in pbr.get("fullPbrCoverage", {}).items()
                if key != "embeddedImages"
            },
        }
        if (
            pbr.get("repairMaterialSemanticContractSha256")
            != canonical_sha256(repair["materialSemanticContract"])
            or pbr.get("repairRasterCleanupCanonicalJson")
            != canonical_text(repair["rasterCleanup"])
            or pbr.get("repairLineageProofCanonicalJson")
            != canonical_text(repair["rasterCleanup"]["lineageProof"])
            or pbr.get("repairMaterialSemanticContractCanonicalJson")
            != canonical_text(repair["materialSemanticContract"])
            or pbr.get("resumeContract") != expected_resume
            or pbr.get("resumeContractCanonicalJson") != canonical_text(expected_resume)
            or pbr.get("resumeContractSha256") != canonical_sha256(expected_resume)
            or pbr.get("contract") != expected_contract
            or pbr.get("contractCanonicalJson") != canonical_text(expected_contract)
            or pbr.get("contractSha256") != canonical_sha256(expected_contract)
        ):
            raise RuntimeError("PBR canonical contract hash failed for %s" % repair["key"])
        artifact = pbr.get("preservation", {}).get("postExportArtifactIdentity", {})
        final_uv = pbr.get("uv", {}).get("finalPbrArtifact", {})
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
            or artifact.get("permittedChanges")
            != ["MATERIAL_DEFINITIONS", "EMBEDDED_IMAGES"]
            or source_identity != final_identity
            or not isinstance(render_names, list)
            or render_names != sorted(set(render_names))
            or not render_names
            or render_names != expected_render_names
            or artifact.get("sourceSceneIdentitySha256")
            != canonical_sha256(source_identity)
            or artifact.get("finalSceneIdentitySha256")
            != canonical_sha256(final_identity)
            or pbr.get("postExportArtifactIdentitySha256")
            != canonical_sha256(artifact)
            or final_uv.get("passed") is not True
            or not isinstance(packed_by_mesh, dict)
            or not isinstance(tiled_by_mesh, dict)
            or sorted(packed_by_mesh) != render_names
            or sorted(tiled_by_mesh) != render_names
            or final_uv.get("packedOverlapFaces") != 0
            or final_uv.get("allTiledMetricsValid") is not True
            or any(metrics.get("valid") is not True
                   for metrics in tiled_by_mesh.values())
            or pbr.get("finalUvProofCanonicalJson") != canonical_text(final_uv)
            or pbr.get("finalUvProofSha256") != canonical_sha256(final_uv)
        ):
            raise RuntimeError("PBR final artifact proof failed for %s" % repair["key"])
        if pbr.get("fullPbrCoverage", {}).get("passed") is not True:
            raise RuntimeError("PBR coverage failed for %s" % repair["key"])
        coverage = pbr.get("fullPbrCoverage", {})
        if (coverage.get("opaqueMaterialCount") != coverage.get("singleSidedMaterialCount")
                or coverage.get("doubleSidedMaterialCount") != 0):
            raise RuntimeError("PBR explicit OPAQUE/single-sided coverage failed for %s" % repair["key"])
        preservation = pbr.get("preservation", {})
        for field in (
            "topology",
            "winding",
            "normals",
            "transforms",
            "materialSlotFaceAssignments",
        ):
            if preservation.get(field) is not True:
                raise RuntimeError("PBR preservation.%s failed for %s" % (field, repair["key"]))
        if pbr.get("uv", {}).get("passed") is not True:
            raise RuntimeError("PBR UV contract failed for %s" % repair["key"])
        if (pbr.get("repairDependencyContract") != raster_dependency_contract()
                or pbr.get("rasterAcceptanceContract") != raster_acceptance_contract()
                or pbr.get("pipelineScriptSha256") != sha256_file(PBR_SCRIPT)
                or pbr.get("repairPipelineScript") != repair["pipelineScript"]
                or pbr.get("repairPipelineScriptSha256") != repair["pipelineScriptSha256"]
                or pbr.get("rasterCleanupScript") != repair["rasterCleanupScript"]
                or pbr.get("rasterCleanupScriptSha256") != repair["rasterCleanupScriptSha256"]
                or pbr.get("repairLineageProofSha256")
                != canonical_sha256(repair["rasterCleanup"]["lineageProof"])
                or pbr.get("repairRasterCleanupSha256")
                != canonical_sha256(repair["rasterCleanup"])
                or not pbr.get("materials")
                or any(material.get("rasterization") != PBR_RASTER_POLICY
                       for material in pbr.get("materials", []))):
            raise RuntimeError("PBR shared cleanup/raster binding failed for %s" % repair["key"])
        library = pbr.get("library", {})
        if (
            library.get("grid") != 11
            or library.get("tileSize") != 256
            or not library.get("sourceContractSha256")
            or not library.get("contractSha256")
            or not isinstance(library.get("cells"), dict)
            or not library["cells"]
        ):
            raise RuntimeError("PBR tile-library contract failed for %s" % repair["key"])
        library_contract = {
            "sourceContractSha256": library["sourceContractSha256"],
            "grid": library["grid"],
            "tileSize": library["tileSize"],
            "cells": library["cells"],
        }
        if canonical_sha256(library_contract) != library["contractSha256"]:
            raise RuntimeError("PBR tile-library contract hash failed for %s" % repair["key"])
        validate_pbr_artifact_disposition(
            pbr, repair, artifact, final_uv, coverage,
        )
    return reports, paths, summary


def select_reports(reports: list[dict], args: argparse.Namespace) -> list[dict]:
    known_keys = {report["key"] for report in reports}
    unknown = sorted(set(args.key) - known_keys)
    if unknown:
        raise RuntimeError("Unknown --key value(s): %s" % ", ".join(unknown))
    keys = set(args.key)
    families = set(args.family)
    selected = [
        report
        for report in reports
        if (not keys and not families)
        or report["key"] in keys
        or report.get("family") in families
    ]
    if args.limit is not None:
        selected = selected[: args.limit]
    if not selected:
        raise RuntimeError("Report selection is empty")
    return selected


def custom_property_values(object_, key: str) -> list:
    values = []
    for owner in (object_, object_.data):
        if owner is None:
            continue
        try:
            if key in owner.keys():
                values.append(owner[key])
        except Exception:
            continue
    return values


def property_truthy(value) -> bool:
    if isinstance(value, str):
        return value.strip().lower() in {"1", "true", "yes", "on"}
    return bool(value)


def custom_metadata(object_) -> str:
    values = [object_.name]
    for key in object_.keys():
        try:
            values.append(str(object_[key]))
        except Exception:
            continue
    if object_.data is not None:
        for key in object_.data.keys():
            try:
                values.append(str(object_.data[key]))
            except Exception:
                continue
    values.extend(collection.name for collection in object_.users_collection)
    parent = object_.parent
    while parent is not None:
        values.append(parent.name)
        parent = parent.parent
    return " ".join(values).upper()


def name_tokens(value: str) -> set[str]:
    return {token for token in re.split(r"[^A-Z0-9]+", value.upper()) if token}


def exclusion_reason(object_) -> str | None:
    if object_.type != "MESH":
        return "NON_MESH"
    if object_.data is None or not object_.data.vertices or not object_.data.polygons:
        return "EMPTY_OR_ZERO_FACE_MESH"
    if object_.hide_render:
        return "HIDDEN_RENDER_OBJECT"
    metadata = custom_metadata(object_)
    tokens = name_tokens(metadata)
    boolean_flags = {
        "mf_proof_only": "PROOF_ONLY",
        "mf_evidence_only": "EVIDENCE_ONLY",
        "mf_proof": "PROOF_ONLY",
        "mf_evidence": "EVIDENCE_ONLY",
        "mf_collision": "COLLISION",
        "mf_navigation": "NAVIGATION",
        "mf_nav": "NAVIGATION",
    }
    for key, reason in boolean_flags.items():
        if any(property_truthy(value) for value in custom_property_values(object_, key)):
            return reason
    roles = " ".join(str(value).lower() for value in custom_property_values(object_, "mf_role"))
    if "collision" in roles:
        return "COLLISION"
    if any(token in roles for token in ("navigation", "navmesh", "walkable_deck")):
        return "NAVIGATION"
    if "proof" in roles:
        return "PROOF_ONLY"
    if "evidence" in roles:
        return "EVIDENCE_ONLY"
    if object_.name.upper().startswith("UCX_") or tokens.intersection({"COL", "COLLISION"}):
        return "COLLISION"
    if tokens.intersection({"NAV", "NAVMESH", "NAVIGATION"}):
        return "NAVIGATION"
    if "PROOF" in tokens:
        return "PROOF_ONLY"
    if "EVIDENCE" in tokens:
        return "EVIDENCE_ONLY"
    if "FLOOR" in tokens and tokens.intersection({"STUDIO", "SHADOW", "EVIDENCE", "REVIEW"}):
        return "STUDIO_OR_SHADOW_FLOOR"
    return None


def lod_number(object_) -> int | None:
    value = object_.get("mf_lod")
    if isinstance(value, (int, float)) and int(value) == value:
        return int(value)
    match = re.search(r"(?:^|[^A-Z0-9])LOD[ _-]*([0-9]+)(?:$|[^A-Z0-9])", object_.name.upper())
    return int(match.group(1)) if match else None


def select_render_meshes(imported: list, kind: str) -> tuple[list, list[dict], int]:
    candidates = []
    excluded = []
    for object_ in sorted(imported, key=lambda item: item.name.lower()):
        reason = exclusion_reason(object_)
        if reason:
            if object_.type == "MESH":
                excluded.append({"name": object_.name, "reason": reason})
            continue
        candidates.append(object_)
    true_render_count = len(candidates)
    if kind == "world-kit":
        selected = []
        for object_ in candidates:
            lod = lod_number(object_)
            if lod == 0:
                selected.append(object_)
            else:
                excluded.append(
                    {
                        "name": object_.name,
                        "reason": "WORLD_KIT_NON_LOD0" if lod is not None else "WORLD_KIT_LOD_UNDECLARED",
                    }
                )
        if not selected:
            raise RuntimeError("World-kit import has no unambiguous LOD0 render mesh")
    elif kind == "spline":
        selected = candidates
    else:
        raise RuntimeError("Unsupported repair report kind: %r" % kind)
    if not selected:
        raise RuntimeError("Import has no true render meshes after exclusions")
    selected.sort(key=lambda item: item.name.lower())
    excluded.sort(key=lambda item: (item["name"].lower(), item["reason"]))
    return selected, excluded, true_render_count


def mesh_bounds(objects: list) -> tuple[Vector, Vector]:
    points = []
    for object_ in objects:
        if object_.type != "MESH" or object_.data is None or not object_.data.vertices:
            continue
        points.extend(object_.matrix_world @ Vector(corner) for corner in object_.bound_box)
    if not points:
        raise RuntimeError("Selected render meshes have no bounded geometry")
    minimum = Vector(
        (
            min(point.x for point in points),
            min(point.y for point in points),
            min(point.z for point in points),
        )
    )
    maximum = Vector(
        (
            max(point.x for point in points),
            max(point.y for point in points),
            max(point.z for point in points),
        )
    )
    return minimum, maximum


def mesh_statistics(objects: list) -> dict:
    meshes = []
    for object_ in objects:
        mesh = object_.data
        mesh.calc_loop_triangles()
        topology = hashlib.sha256()
        topology.update(object_.name.encode("utf-8"))
        for row in object_.matrix_world:
            topology.update(struct.pack("<4d", *(float(value) for value in row)))
        for vertex in mesh.vertices:
            topology.update(struct.pack("<3d", *(float(value) for value in vertex.co)))
        edge_faces = [0] * len(mesh.edges)
        for polygon in mesh.polygons:
            topology.update(struct.pack("<I", len(polygon.vertices)))
            for vertex_index in polygon.vertices:
                topology.update(struct.pack("<I", vertex_index))
            for loop_index in range(polygon.loop_start, polygon.loop_start + polygon.loop_total):
                edge_faces[mesh.loops[loop_index].edge_index] += 1
        signed_volume = 0.0
        surface_area = 0.0
        degenerate_triangles = 0
        for triangle in mesh.loop_triangles:
            first, second, third = (
                object_.matrix_world @ mesh.vertices[index].co for index in triangle.vertices
            )
            cross = (second - first).cross(third - first)
            double_area = cross.length
            surface_area += double_area * 0.5
            if double_area <= 1e-12:
                degenerate_triangles += 1
            signed_volume += first.dot(second.cross(third)) / 6.0
        meshes.append(
            {
                "name": object_.name,
                "lod": lod_number(object_),
                "vertices": len(mesh.vertices),
                "edges": len(mesh.edges),
                "polygons": len(mesh.polygons),
                "triangles": len(mesh.loop_triangles),
                "boundaryEdges": sum(1 for count in edge_faces if count == 1),
                "nonManifoldEdges": sum(1 for count in edge_faces if count != 2),
                "looseEdges": sum(1 for count in edge_faces if count == 0),
                "degenerateTriangles": degenerate_triangles,
                "surfaceArea": round(surface_area, 8),
                "signedVolume": round(signed_volume, 8),
                "topologyWindingSha256": topology.hexdigest(),
            }
        )
    return {
        "meshCount": len(meshes),
        "vertices": sum(mesh["vertices"] for mesh in meshes),
        "edges": sum(mesh["edges"] for mesh in meshes),
        "polygons": sum(mesh["polygons"] for mesh in meshes),
        "triangles": sum(mesh["triangles"] for mesh in meshes),
        "boundaryEdges": sum(mesh["boundaryEdges"] for mesh in meshes),
        "nonManifoldEdges": sum(mesh["nonManifoldEdges"] for mesh in meshes),
        "looseEdges": sum(mesh["looseEdges"] for mesh in meshes),
        "degenerateTriangles": sum(mesh["degenerateTriangles"] for mesh in meshes),
        "surfaceArea": round(sum(mesh["surfaceArea"] for mesh in meshes), 8),
        "signedVolume": round(sum(mesh["signedVolume"] for mesh in meshes), 8),
        "packTopologyWindingSha256": canonical_sha256(
            [mesh["topologyWindingSha256"] for mesh in meshes]
        ),
        "meshes": meshes,
    }


def import_and_select(path: Path, kind: str) -> tuple[list, list, list[dict], int]:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(path))
    imported = [object_ for object_ in bpy.data.objects if object_ not in before]
    selected, excluded, true_render_count = select_render_meshes(imported, kind)
    return imported, selected, excluded, true_render_count


def inspect_asset(path: Path, kind: str, expected_render_meshes: int) -> dict:
    _, selected, excluded, true_render_count = import_and_select(path, kind)
    if true_render_count != expected_render_meshes:
        raise RuntimeError(
            "%s true render meshes in %s, report records %s"
            % (true_render_count, path, expected_render_meshes)
        )
    minimum, maximum = mesh_bounds(selected)
    return {
        "boundsMin": vector_list(minimum),
        "boundsMax": vector_list(maximum),
        "dimensions": vector_list(maximum - minimum),
        "selection": mesh_statistics(selected),
        "excluded": excluded,
        "trueRenderMeshCount": true_render_count,
    }


def paired_frame(before: dict, after: dict) -> dict:
    before_min = Vector(before["boundsMin"])
    before_max = Vector(before["boundsMax"])
    after_min = Vector(after["boundsMin"])
    after_max = Vector(after["boundsMax"])
    minimum = Vector(tuple(min(before_min[index], after_min[index]) for index in range(3)))
    maximum = Vector(tuple(max(before_max[index], after_max[index]) for index in range(3)))
    extent = maximum - minimum
    diagonal = max(extent.length, 0.001)
    center = (minimum + maximum) * 0.5
    translation = Vector((-center.x, -center.y, -minimum.z))
    target = Vector((0.0, 0.0, max(extent.z * 0.5, diagonal * 0.01)))
    distance = max(diagonal * 3.0, 1.0)
    camera_location = target + CAMERA_DIRECTION * distance
    return {
        "canonicalSourceBounds": {"min": before["boundsMin"], "max": before["boundsMax"]},
        "pbrOutputBounds": {"min": after["boundsMin"], "max": after["boundsMax"]},
        "unionBounds": {"min": vector_list(minimum), "max": vector_list(maximum)},
        "dimensions": vector_list(extent),
        "diagonal": round(diagonal, 6),
        "translation": vector_list(translation),
        "camera": {
            "type": "ORTHO",
            "direction": [round(value, 9) for value in CAMERA_DIRECTION],
            "target": vector_list(target),
            "location": vector_list(camera_location),
            "orthoScale": round(max(diagonal * FRAME_MARGIN, 0.01), 6),
            "clipStart": round(max(diagonal * 0.0001, 0.001), 6),
            "clipEnd": round(distance + diagonal * 20.0 + 100.0, 6),
        },
    }


def look_at(object_, target: Vector) -> None:
    object_.rotation_euler = (target - object_.location).to_track_quat("-Z", "Y").to_euler()


def add_sun(name: str, anchor: tuple, target: Vector, scale: float, energy: float, color: tuple):
    data = bpy.data.lights.new(name, "SUN")
    data.energy = energy
    data.angle = math.radians(18.0)
    data.color = color
    object_ = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(object_)
    object_.location = Vector(anchor) * scale
    look_at(object_, target)
    return object_


def neutral_material():
    material = bpy.data.materials.new("MF_STAGE10_NEUTRAL_BACKFACE_CULL")
    material.diffuse_color = MATERIAL_COLOR
    material.use_nodes = True
    material.use_backface_culling = True
    try:
        material.use_backface_culling_shadow = True
    except Exception:
        pass
    shader = material.node_tree.nodes.get("Principled BSDF")
    if shader is None:
        raise RuntimeError("Neutral material has no Principled BSDF")
    shader.inputs["Base Color"].default_value = MATERIAL_COLOR
    shader.inputs["Metallic"].default_value = 0.0
    shader.inputs["Roughness"].default_value = MATERIAL_ROUGHNESS
    return material


def prepare_render_materials(objects: list, policy: str) -> dict:
    fallback = None
    material_records = {}
    fallback_meshes = []
    for object_ in objects:
        mesh = object_.data
        fallback_index = None
        if policy == "SOURCE" and not any(slot is not None for slot in mesh.materials):
            fallback = fallback or neutral_material()
            mesh.materials.clear()
            mesh.materials.append(fallback)
            fallback_index = 0
            fallback_meshes.append(object_.name)
        if policy == "PBR" and not mesh.materials:
            raise RuntimeError("PBR render mesh has no material slots: %s" % object_.name)
        for polygon in mesh.polygons:
            if polygon.material_index >= len(mesh.materials) or mesh.materials[polygon.material_index] is None:
                if policy == "PBR":
                    raise RuntimeError("PBR face has no valid material binding: %s" % object_.name)
                fallback = fallback or neutral_material()
                if fallback_index is None:
                    mesh.materials.append(fallback)
                    fallback_index = len(mesh.materials) - 1
                polygon.material_index = fallback_index
                fallback_meshes.append(object_.name)
        for material in {slot for slot in mesh.materials if slot is not None}:
            material.use_backface_culling = True
            if policy == "PBR":
                if not material.use_nodes or material.node_tree is None:
                    raise RuntimeError("PBR material has no node tree: %s" % material.name)
                principled = [node for node in material.node_tree.nodes if node.type == "BSDF_PRINCIPLED"]
                images = [node for node in material.node_tree.nodes if node.type == "TEX_IMAGE"]
                if not principled or not images:
                    raise RuntimeError("PBR material lacks Principled/image nodes: %s" % material.name)
                for node in images:
                    if node.image is None or min(node.image.size[:]) < 1:
                        raise RuntimeError("PBR Blender material has an unloaded image: %s" % material.name)
            elif material.use_nodes and material.node_tree:
                images = [node for node in material.node_tree.nodes if node.type == "TEX_IMAGE"]
            else:
                images = []
            material_records[material.name] = {
                "name": material.name,
                "backfaceCulling": bool(material.use_backface_culling),
                "usesNodes": bool(material.use_nodes),
                "imageNodes": [
                    {
                        "node": node.name,
                        "image": node.image.name if node.image else None,
                        "dimensions": list(node.image.size[:]) if node.image else None,
                        "source": node.image.source if node.image else None,
                        "colorspace": node.image.colorspace_settings.name if node.image else None,
                        "packed": bool(node.image and node.image.packed_file),
                    }
                    for node in images
                ],
            }
    if policy == "PBR" and not material_records:
        raise RuntimeError("PBR render selection has no bound materials")
    return {
        "policy": policy,
        "neutralFallbackMeshes": sorted(set(fallback_meshes), key=str.lower),
        "materials": [material_records[key] for key in sorted(material_records, key=str.lower)],
    }


def configure_scene(frame: dict, resolution: int) -> dict:
    scene = bpy.context.scene
    scene.render.engine = EEVEE_ENGINE
    scene.render.resolution_x = resolution
    scene.render.resolution_y = resolution
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.color_depth = "8"
    scene.render.image_settings.compression = 15
    scene.render.film_transparent = False
    scene.render.use_file_extension = True
    try:
        scene.view_settings.view_transform = "AgX"
        scene.view_settings.look = "AgX - Medium High Contrast"
    except Exception:
        pass
    scene.view_settings.exposure = 0.0
    scene.view_settings.gamma = 1.0

    world = bpy.data.worlds.new("MF_STAGE10_REVIEW_WORLD")
    world.use_nodes = True
    background = world.node_tree.nodes.get("Background")
    background.inputs["Color"].default_value = BACKGROUND_COLOR
    background.inputs["Strength"].default_value = 0.16
    scene.world = world

    camera_record = frame["camera"]
    camera_data = bpy.data.cameras.new("MF_STAGE10_REVIEW_CAMERA")
    camera_data.type = "ORTHO"
    camera_data.ortho_scale = camera_record["orthoScale"]
    camera_data.clip_start = camera_record["clipStart"]
    camera_data.clip_end = camera_record["clipEnd"]
    camera = bpy.data.objects.new("MF_STAGE10_REVIEW_CAMERA", camera_data)
    bpy.context.collection.objects.link(camera)
    camera.location = Vector(camera_record["location"])
    look_at(camera, Vector(camera_record["target"]))
    scene.camera = camera

    light_scale = max(frame["diagonal"], 1.0)
    target = Vector(camera_record["target"])
    for name, anchor, energy, color in LIGHTS:
        add_sun(name, anchor, target, light_scale, energy, color)
    return {
        "engine": scene.render.engine,
        "resolution": [scene.render.resolution_x, scene.render.resolution_y],
        "viewTransform": scene.view_settings.view_transform,
        "look": scene.view_settings.look,
    }


def translate_import(imported: list, translation: Vector) -> None:
    object_set = set(imported)
    roots = [object_ for object_ in imported if object_.parent not in object_set]
    for object_ in roots:
        object_.location += translation
    bpy.context.view_layer.update()


def render_asset(
    source: Path,
    kind: str,
    expected_render_meshes: int,
    frame: dict,
    resolution: int,
    output: Path,
    material_policy: str,
) -> dict:
    imported, selected, excluded, true_render_count = import_and_select(source, kind)
    if true_render_count != expected_render_meshes:
        raise RuntimeError(
            "%s true render meshes in %s, report records %s"
            % (true_render_count, source, expected_render_meshes)
        )
    selected_set = set(selected)
    # Translate while the imported hierarchy is intact.  Blender invalidates
    # removed Object RNA immediately, so embedded camera/light removal must
    # happen only after roots have been resolved and moved.
    translate_import(imported, Vector(frame["translation"]))
    for object_ in imported:
        if object_.type in {"LIGHT", "CAMERA"}:
            bpy.data.objects.remove(object_, do_unlink=True)
        elif object_ not in selected_set:
            object_.hide_render = True
    for object_ in selected:
        object_.hide_render = False
    material_evidence = prepare_render_materials(selected, material_policy)
    bpy.context.view_layer.update()
    minimum, maximum = mesh_bounds(selected)
    settings = configure_scene(frame, resolution)

    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = output.with_name(output.stem + ".rendering.png")
    bpy.context.scene.render.filepath = str(temporary)
    bpy.ops.render.render(write_still=True)
    if not temporary.is_file():
        raise RuntimeError("Blender did not write expected evidence PNG: %s" % temporary)
    dimensions = png_dimensions(temporary)
    if dimensions != [resolution, resolution]:
        raise RuntimeError("Unexpected render dimensions %r for %s" % (dimensions, temporary))
    os.replace(temporary, output)
    return {
        "path": posix_relative(output),
        "sha256": sha256_file(output),
        "bytes": output.stat().st_size,
        "dimensions": dimensions,
        "boundsAfterPairTranslation": {
            "min": vector_list(minimum),
            "max": vector_list(maximum),
        },
        "selection": mesh_statistics(selected),
        "excluded": excluded,
        "materials": material_evidence,
        "settings": settings,
    }


def resume_valid(
        existing: dict,
        binding: dict,
        resume_key: str,
        before_path: Path,
        after_path: Path,
) -> bool:
    if existing.get("schema") != ITEM_SCHEMA or existing.get("status") != "RENDERED":
        return False
    if existing.get("rendererVersion") != RENDERER_VERSION:
        return False
    if (existing.get("resumeKey") != resume_key
            or existing.get("binding") != binding
            or existing.get("renderContract") != RENDER_CONTRACT):
        return False
    for label, path in (("before", before_path), ("after", after_path)):
        evidence = existing.get(label, {})
        if evidence.get("path") != posix_relative(path) or not path.is_file():
            return False
        if evidence.get("bytes") != path.stat().st_size:
            return False
        if evidence.get("dimensions") != png_dimensions(path):
            return False
        if evidence.get("sha256") != sha256_file(path):
            return False
    return True


def item_paths(report: dict) -> tuple[Path, Path, Path]:
    family = safe_component(report["family"])
    identifier = safe_component(report["id"])
    return (
        OUTPUT_ROOT / "before" / family / (identifier + ".png"),
        OUTPUT_ROOT / "after" / family / (identifier + ".png"),
        OUTPUT_ROOT / "reports" / family / (identifier + ".json"),
    )


def binding_for(
    report: dict,
    repair_report_path: Path,
    pbr_report: dict,
    pbr_report_path: Path,
    resolution: int,
) -> dict:
    source = ROOT / report["source"]
    repair_output = ROOT / report["output"]
    pbr_output = ROOT / pbr_report["output"]
    for label, path in (
        ("source", source),
        ("repaired output", repair_output),
        ("PBR output", pbr_output),
    ):
        if not path.is_file():
            raise RuntimeError("%s is missing for %s: %s" % (label, report["key"], path))
    try:
        pbr_output.resolve().relative_to(PBR_MODEL_ROOT.resolve())
    except ValueError as error:
        raise RuntimeError("PBR output is outside the derived PBR model boundary") from error
    source_hash = sha256_file(source)
    repair_output_hash = sha256_file(repair_output)
    pbr_output_hash = sha256_file(pbr_output)
    if source_hash != report.get("sourceSha256"):
        raise RuntimeError("Source hash changed for %s" % report["key"])
    if repair_output_hash != report.get("outputSha256"):
        raise RuntimeError("Repaired output hash changed for %s" % report["key"])
    if pbr_output_hash != pbr_report.get("outputSha256"):
        raise RuntimeError("PBR output hash changed for %s" % report["key"])
    if pbr_report.get("repairReport") != posix_relative(repair_report_path):
        raise RuntimeError("PBR repair-report path mismatch for %s" % report["key"])
    if pbr_report.get("repairReportSha256") != sha256_file(repair_report_path):
        raise RuntimeError("PBR repair-report hash mismatch for %s" % report["key"])
    if not REPAIR_SCRIPT.is_file() or not PBR_SCRIPT.is_file() or not RASTER_CLEANUP_SCRIPT.is_file():
        raise RuntimeError("Repair, PBR, or shared raster-cleanup pipeline script is missing")
    pbr_pipeline_hash = sha256_file(PBR_SCRIPT)
    if pbr_report.get("pipelineScriptSha256") != pbr_pipeline_hash:
        raise RuntimeError("PBR report pipeline-script hash mismatch for %s" % report["key"])
    return {
        "sourceSha256": source_hash,
        "sourceBytes": source.stat().st_size,
        "repairOutputSha256": repair_output_hash,
        "repairOutputBytes": repair_output.stat().st_size,
        "pbrOutputSha256": pbr_output_hash,
        "pbrOutputBytes": pbr_output.stat().st_size,
        "repairPipelineVersion": report.get("pipelineVersion"),
        "pbrPipelineVersion": pbr_report.get("pipelineVersion"),
        "pipelineScriptSha256": pbr_pipeline_hash,
        "pbrPipelineSha256": pbr_pipeline_hash,
        "pbrPipelineBytes": PBR_SCRIPT.stat().st_size,
        "repairPipelineSha256": sha256_file(REPAIR_SCRIPT),
        "repairPipelineBytes": REPAIR_SCRIPT.stat().st_size,
        "rasterCleanupScriptSha256": sha256_file(RASTER_CLEANUP_SCRIPT),
        "rasterCleanupScriptBytes": RASTER_CLEANUP_SCRIPT.stat().st_size,
        "repairRasterCleanupSha256": pbr_report.get("repairRasterCleanupSha256"),
        "repairLineageProofSha256": pbr_report.get("repairLineageProofSha256"),
        "repairMaterialSemanticContractSha256": pbr_report.get(
            "repairMaterialSemanticContractSha256"
        ),
        "repairReportSha256": sha256_file(repair_report_path),
        "repairReportBytes": repair_report_path.stat().st_size,
        "pbrReportSha256": sha256_file(pbr_report_path),
        "pbrReportBytes": pbr_report_path.stat().st_size,
        "pbrContractSha256": pbr_report.get("contractSha256"),
        "pbrResumeContractSha256": pbr_report.get("resumeContractSha256"),
        "pbrArtifactDisposition": pbr_report.get("artifactDisposition"),
        "pbrContentEquivalentRebindSha256": pbr_report.get(
            "contentEquivalentRebindSha256"
        ),
        "pbrFinalArtifactIdentitySha256": pbr_report.get(
            "postExportArtifactIdentitySha256"
        ),
        "pbrFinalUvProofSha256": pbr_report.get("finalUvProofSha256"),
        "pbrLibrarySha256": canonical_sha256(pbr_report.get("library")),
        "pbrLibraryReportSha256": sha256_file(PBR_LIBRARY_REPORT),
        "pbrLibraryReportBytes": PBR_LIBRARY_REPORT.stat().st_size,
        "pbrMaterialManifestCanonicalJson": canonical_text(
            pbr_report.get("materials", [])
        ),
        "pbrMaterialManifestSha256": canonical_sha256(pbr_report.get("materials", [])),
        "rendererScriptSha256": sha256_file(Path(__file__).resolve()),
        "rendererScriptBytes": Path(__file__).resolve().stat().st_size,
        "renderContractSha256": canonical_sha256(RENDER_CONTRACT),
        "blenderVersion": bpy.app.version_string,
        "resolution": [resolution, resolution],
    }


def render_pair(
    report: dict,
    repair_report_path: Path,
    pbr_report: dict,
    pbr_report_path: Path,
    args: argparse.Namespace,
) -> tuple[dict, str]:
    before_path, after_path, item_report_path = item_paths(report)
    binding = binding_for(report, repair_report_path, pbr_report, pbr_report_path, args.resolution)
    resume_key = canonical_sha256(binding)
    if not args.force and item_report_path.is_file():
        try:
            existing = json.loads(item_report_path.read_text(encoding="utf-8"))
            if resume_valid(existing, binding, resume_key, before_path, after_path):
                return existing, "RESUMED"
        except Exception:
            pass

    item = {
        "schema": ITEM_SCHEMA,
        "rendererVersion": RENDERER_VERSION,
        "status": "FAILED",
        "key": report["key"],
        "id": report["id"],
        "family": report["family"],
        "kind": report["kind"],
        "repairStatus": report["status"],
        "resumeKey": resume_key,
        "binding": binding,
        "repairReport": {
            "path": posix_relative(repair_report_path),
            "sha256": binding["repairReportSha256"],
            "bytes": binding["repairReportBytes"],
        },
        "source": {
            "path": report["source"],
            "sha256": binding["sourceSha256"],
            "bytes": binding["sourceBytes"],
        },
        "repairOutput": {
            "path": report["output"],
            "sha256": binding["repairOutputSha256"],
            "bytes": binding["repairOutputBytes"],
        },
        "pbrReport": {
            "path": posix_relative(pbr_report_path),
            "sha256": binding["pbrReportSha256"],
            "bytes": binding["pbrReportBytes"],
        },
        "pbrOutput": {
            "path": pbr_report["output"],
            "sha256": binding["pbrOutputSha256"],
            "bytes": binding["pbrOutputBytes"],
        },
        "renderContract": RENDER_CONTRACT,
        "renderContractCanonicalJson": canonical_text(RENDER_CONTRACT),
        "frame": None,
        "before": None,
        "after": None,
        "error": None,
    }
    try:
        expected = int(report["renderMeshCount"])
        before_inspection = inspect_asset(ROOT / report["source"], report["kind"], expected)
        repair_inspection = inspect_asset(ROOT / report["output"], report["kind"], expected)
        after_inspection = inspect_asset(ROOT / pbr_report["output"], report["kind"], expected)
        frame = paired_frame(before_inspection, after_inspection)
        item["frame"] = frame
        item["inspections"] = {
            "canonicalSource": before_inspection,
            "repairOutput": repair_inspection,
            "pbrOutput": after_inspection,
        }
        # The canonical source is locked, while V18 deliberately rewrites only
        # accepted same-winding raster-risk coverage in a derived GLB.  The
        # repaired and PBR outputs must still be geometry-identical; canonical
        # deltas are accepted only through the shared cleanup proof and its
        # measured bounds envelope.
        geometry_count_fields = ("meshCount", "polygons", "triangles")
        geometry_scalar_fields = ("surfaceArea", "signedVolume")
        canonical_geometry = before_inspection["selection"]
        repair_geometry = repair_inspection["selection"]
        pbr_geometry = after_inspection["selection"]
        count_match = all(
            repair_geometry[field] == pbr_geometry[field]
            for field in geometry_count_fields
        )
        scalar_match = all(
            math.isclose(
                float(repair_geometry[field]),
                float(pbr_geometry[field]),
                rel_tol=1e-7,
                abs_tol=1e-6,
            )
            for field in geometry_scalar_fields
        )
        raster_cleanup = report.get("rasterCleanup", {})
        bounds_tolerance = max(
            1.0e-5, float(raster_cleanup.get("maxBoundsDriftM", math.inf)) + 1.0e-5,
        )
        canonical_bounds_within_cleanup = all(
            math.isclose(float(source), float(derived), rel_tol=0.0, abs_tol=1e-5)
            or abs(float(source) - float(derived)) <= bounds_tolerance
            for source_bounds, derived_bounds in (
                (before_inspection["boundsMin"], repair_inspection["boundsMin"]),
                (before_inspection["boundsMax"], repair_inspection["boundsMax"]),
            )
            for source, derived in zip(source_bounds, derived_bounds)
        )
        repair_pbr_bounds_match = all(
            math.isclose(float(repair_value), float(pbr_value), rel_tol=0.0, abs_tol=1e-5)
            for repair_bounds, pbr_bounds in (
                (repair_inspection["boundsMin"], after_inspection["boundsMin"]),
                (repair_inspection["boundsMax"], after_inspection["boundsMax"]),
            )
            for repair_value, pbr_value in zip(repair_bounds, pbr_bounds)
        )
        repair_report_proof = (
            report.get("sourceUntouched") is True
            and report.get("canonicalTopologyUntouched") is True
            and report.get("uvGeometryPreserved") is True
            and report.get("repairDependencyContract") == raster_dependency_contract()
            and report.get("rasterAcceptanceContract") == raster_acceptance_contract()
            and raster_cleanup.get("passed") is True
            and raster_cleanup.get("acceptedPairsAfter") == 0
            and raster_cleanup.get("exactDuplicatePairsAfter") == 0
            and raster_cleanup.get("remainingPairs") == 0
            and raster_cleanup.get("stabilized") is True
            and lineage_proof_green(raster_cleanup)
            and raster_cleanup_progress_green(raster_cleanup)
            and all(
                mesh.get("cleanup", {}).get("canonicalTopologyUntouched") is True
                and mesh.get("cleanup", {}).get("uvGeometryPreserved") is True
                and mesh.get("cleanup", {}).get("geometrySignatureAfterRasterCleanup")
                == mesh.get("cleanup", {}).get("geometrySignatureAfter")
                for mesh in report.get("meshes", [])
            )
        )
        pbr_report_proof = all(
            pbr_report.get("preservation", {}).get(field) is True
            for field in (
                "topology",
                "winding",
                "normals",
                "transforms",
                "materialSlotFaceAssignments",
            )
        ) and all(
            material.get("rasterization") == PBR_RASTER_POLICY
            for material in pbr_report.get("materials", [])
        )
        item["geometryProof"] = {
            "contract": "CANONICAL_LOCK_PLUS_SHARED_RASTER_CLEANUP_AND_REPAIR_PBR_IDENTITY",
            "countFields": list(geometry_count_fields),
            "scalarFields": list(geometry_scalar_fields),
            "canonical": {
                field: canonical_geometry[field]
                for field in geometry_count_fields + geometry_scalar_fields
            },
            "repair": {
                field: repair_geometry[field]
                for field in geometry_count_fields + geometry_scalar_fields
            },
            "pbr": {
                field: pbr_geometry[field]
                for field in geometry_count_fields + geometry_scalar_fields
            },
            "derivedDelta": {
                field: repair_geometry[field] - canonical_geometry[field]
                for field in geometry_count_fields + geometry_scalar_fields
            },
            "boundsToleranceM": bounds_tolerance,
            "canonicalBoundsWithinCleanupProof": canonical_bounds_within_cleanup,
            "repairPbrBoundsMatch": repair_pbr_bounds_match,
            "repairReportCleanupProof": repair_report_proof,
            "artifactIndependentAcceptance": (
                raster_cleanup.get("lineageProof", {}).get(
                    "finalArtifactAcceptanceDependsOnLineage"
                ) is False
            ),
            "pbrReportPreservation": pbr_report_proof,
            "passed": (
                count_match
                and scalar_match
                and canonical_bounds_within_cleanup
                and repair_pbr_bounds_match
                and repair_report_proof
                and pbr_report_proof
            ),
        }
        if not item["geometryProof"]["passed"]:
            raise RuntimeError("Repair/PBR numerical geometry proof failed")
        item["pbrMapEvidence"] = validate_report_pbr_maps(pbr_report)
        item["pbrGlbEvidence"] = validate_pbr_glb(ROOT / pbr_report["output"], pbr_report)
        item["before"] = render_asset(
            ROOT / report["source"],
            report["kind"],
            expected,
            frame,
            args.resolution,
            before_path,
            "SOURCE",
        )
        item["after"] = render_asset(
            ROOT / pbr_report["output"],
            report["kind"],
            expected,
            frame,
            args.resolution,
            after_path,
            "PBR",
        )
        if binding_for(
            report,
            repair_report_path,
            pbr_report,
            pbr_report_path,
            args.resolution,
        ) != binding:
            raise RuntimeError("Bound source/output/pipeline inputs changed during render")
        item["status"] = "RENDERED"
    except Exception as error:
        item["error"] = "%s: %s" % (type(error).__name__, error)
        item["traceback"] = traceback.format_exc()
    write_json(item_report_path, item)
    return item, "RENDERED" if item["status"] == "RENDERED" else "FAILED"


def grouped_counts(reports: list[dict], field: str) -> dict:
    counts = {}
    for report in reports:
        label = str(report.get(field, "UNKNOWN"))
        counts[label] = counts.get(label, 0) + 1
    return dict(sorted(counts.items(), key=lambda item: item[0].lower()))


def report_manifest(reports: list[dict], report_paths: dict[str, Path]) -> dict:
    entries = [
        {
            "key": report["key"],
            "path": posix_relative(report_paths[report["key"]]),
            "sha256": sha256_file(report_paths[report["key"]]),
            "bytes": report_paths[report["key"]].stat().st_size,
        }
        for report in reports
    ]
    return {"count": len(entries), "sha256": canonical_sha256(entries)}


def summary_base(
    all_reports: list[dict],
    selected: list[dict],
    report_paths: dict[str, Path],
    repair_summary: dict,
    pbr_reports: dict[str, dict],
    pbr_report_paths: dict[str, Path],
    pbr_summary: dict,
    args: argparse.Namespace,
) -> dict:
    repair_summary_hash = sha256_file(REPAIR_SUMMARY) if REPAIR_SUMMARY.is_file() else None
    return {
        "schema": SUMMARY_SCHEMA,
        "rendererVersion": RENDERER_VERSION,
        "status": "RUNNING",
        "outputBoundary": posix_relative(OUTPUT_ROOT),
        "sourcePolicy": "READ_ONLY_GLTF_IMPORTS_ORIGINALS_UNTOUCHED",
        "blenderVersion": bpy.app.version_string,
        "rendererScript": {
            "path": posix_relative(Path(__file__).resolve()),
            "sha256": sha256_file(Path(__file__).resolve()),
            "bytes": Path(__file__).resolve().stat().st_size,
        },
        "repairPipeline": {
            "path": posix_relative(REPAIR_SCRIPT),
            "sha256": sha256_file(REPAIR_SCRIPT),
            "bytes": REPAIR_SCRIPT.stat().st_size,
        },
        "rasterCleanupPipeline": {
            "path": posix_relative(RASTER_CLEANUP_SCRIPT),
            "sha256": sha256_file(RASTER_CLEANUP_SCRIPT),
            "bytes": RASTER_CLEANUP_SCRIPT.stat().st_size,
        },
        "pbrPipeline": {
            "path": posix_relative(PBR_SCRIPT),
            "sha256": sha256_file(PBR_SCRIPT),
            "bytes": PBR_SCRIPT.stat().st_size,
        },
        "repairSummary": {
            "path": posix_relative(REPAIR_SUMMARY),
            "sha256": repair_summary_hash,
            "bytes": REPAIR_SUMMARY.stat().st_size if REPAIR_SUMMARY.is_file() else None,
            "schema": repair_summary["schema"],
            "pipelineVersion": repair_summary["pipelineVersion"],
            "pipelineMode": repair_summary.get("pipelineMode"),
            "blenderVersion": repair_summary.get("blenderVersion"),
            "catalog": repair_summary.get("catalog"),
            "catalogSha256": repair_summary["catalogSha256"],
            "totalScheduled": repair_summary["totalScheduled"],
            "processed": repair_summary["processed"],
            "failed": repair_summary["failed"],
            "statusCounts": repair_summary["statusCounts"],
            "catalogCounts": repair_summary["catalogCounts"],
            "selection": repair_summary.get("selection"),
            "processedStatusContract": repair_summary.get("processedStatusContract"),
            "pipelineExclusionCount": repair_summary["pipelineExclusionCount"],
            "pipelineExclusions": repair_summary["pipelineExclusions"],
            "prunedStaleOutputs": repair_summary.get("prunedStaleOutputs"),
            "staleExcludedOutputsRemaining": repair_summary.get(
                "staleExcludedOutputsRemaining"
            ),
        },
        "repairReportCatalog": report_manifest(all_reports, report_paths),
        "selectedRepairReports": report_manifest(selected, report_paths),
        "pbrSummary": {
            "path": posix_relative(PBR_SUMMARY),
            "sha256": sha256_file(PBR_SUMMARY),
            "bytes": PBR_SUMMARY.stat().st_size,
            "schema": pbr_summary["schema"],
            "pipelineVersion": pbr_summary.get("pipelineVersion"),
            "pipelineMode": pbr_summary.get("pipelineMode"),
            "totalScheduled": pbr_summary.get("totalScheduled", pbr_summary.get("scheduled")),
            "processed": pbr_summary.get("processed", pbr_summary.get("completed")),
            "failed": pbr_summary.get("failed", len(pbr_summary.get("failures", []))),
            "statusCounts": pbr_summary.get("statusCounts"),
            "artifactDispositionCounts": pbr_summary.get(
                "artifactDispositionCounts"
            ),
            "contentEquivalentRebindRequested": pbr_summary.get(
                "contentEquivalentRebindRequested"
            ),
            "contentEquivalentRebindPolicy": pbr_summary.get(
                "contentEquivalentRebindPolicy"
            ),
            "catalogCounts": pbr_summary.get("catalogCounts"),
            "selection": pbr_summary.get("selection"),
            "exclusions": pbr_summary.get("exclusions"),
            "itemManifestSha256": canonical_sha256(pbr_summary.get("items", [])),
            "library": pbr_summary.get("library"),
        },
        "pbrLibraryReport": {
            "path": posix_relative(PBR_LIBRARY_REPORT),
            "sha256": sha256_file(PBR_LIBRARY_REPORT),
            "bytes": PBR_LIBRARY_REPORT.stat().st_size,
        },
        "pbrReportCatalog": report_manifest(
            [pbr_reports[report["key"]] for report in all_reports], pbr_report_paths
        ),
        "selectedPbrReports": report_manifest(
            [pbr_reports[report["key"]] for report in selected], pbr_report_paths
        ),
        "renderContract": RENDER_CONTRACT,
        "renderContractCanonicalJson": canonical_text(RENDER_CONTRACT),
        "renderContractSha256": canonical_sha256(RENDER_CONTRACT),
        "resolution": [args.resolution, args.resolution],
        "expectedFullRenderPairCount": repair_summary["totalScheduled"],
        "repairReportCount": len(all_reports),
        "catalogCounts": {
            "byFamily": grouped_counts(all_reports, "family"),
            "byKind": grouped_counts(all_reports, "kind"),
            "byRepairStatus": grouped_counts(all_reports, "status"),
        },
        "selection": {
            "keys": sorted(set(args.key), key=str.lower),
            "families": sorted(set(args.family), key=str.lower),
            "limit": args.limit,
            "selectedCount": len(selected),
            "completeCatalog": len(selected) == len(all_reports),
        },
        "selectionCounts": {
            "byFamily": grouped_counts(selected, "family"),
            "byKind": grouped_counts(selected, "kind"),
            "byRepairStatus": grouped_counts(selected, "status"),
        },
        "items": [],
        "counts": {"selected": len(selected), "rendered": 0, "resumed": 0, "failed": 0},
        "failures": [],
    }


def update_summary(summary: dict) -> None:
    dispositions = [item["disposition"] for item in summary["items"]]
    summary["counts"] = {
        "selected": summary["selection"]["selectedCount"],
        "rendered": dispositions.count("RENDERED"),
        "resumed": dispositions.count("RESUMED"),
        "failed": dispositions.count("FAILED"),
    }
    summary["failures"] = [
        {"key": item["key"], "error": item.get("error")}
        for item in summary["items"]
        if item["disposition"] == "FAILED"
    ]
    processed = len(summary["items"])
    summary["status"] = (
        "FAIL"
        if summary["counts"]["failed"]
        else "PASS"
        if processed == summary["selection"]["selectedCount"]
        else "RUNNING"
    )
    write_json(OUTPUT_ROOT / "summary.json", summary)


def main() -> None:
    args = arguments()
    if (sha256_file(REPAIR_SCRIPT) != FROZEN_REPAIR_SCRIPT_SHA256
            or sha256_file(RASTER_CLEANUP_SCRIPT)
            != FROZEN_RASTER_CLEANUP_SCRIPT_SHA256):
        raise RuntimeError("frozen Stage 10 repair/cleanup producer hash changed")
    reports, report_paths = load_reports()
    repair_summary = load_repair_contract(reports)
    pbr_reports, pbr_report_paths, pbr_summary = load_pbr_reports(
        reports, repair_summary,
    )
    selected = select_reports(reports, args)
    summary = summary_base(
        reports,
        selected,
        report_paths,
        repair_summary,
        pbr_reports,
        pbr_report_paths,
        pbr_summary,
        args,
    )
    update_summary(summary)
    for index, report in enumerate(selected, 1):
        print(
            "[MASSFRONT_STAGE10_RENDER] %d/%d %s" % (index, len(selected), report["key"]),
            flush=True,
        )
        try:
            item, disposition = render_pair(
                report,
                report_paths[report["key"]],
                pbr_reports[report["key"]],
                pbr_report_paths[report["key"]],
                args,
            )
            before_path, after_path, item_report_path = item_paths(report)
            summary_item = {
                "key": report["key"],
                "repairStatus": report["status"],
                "disposition": disposition,
                "resumeKey": item.get("resumeKey"),
                "itemReport": posix_relative(item_report_path),
                "itemReportSha256": sha256_file(item_report_path),
                "before": item.get("before", {}).get("sha256") if item.get("before") else None,
                "after": item.get("after", {}).get("sha256") if item.get("after") else None,
                "error": item.get("error"),
            }
        except Exception as error:
            summary_item = {
                "key": report["key"],
                "repairStatus": report.get("status"),
                "disposition": "FAILED",
                "resumeKey": None,
                "itemReport": None,
                "itemReportSha256": None,
                "before": None,
                "after": None,
                "error": "%s: %s" % (type(error).__name__, error),
                "traceback": traceback.format_exc(),
            }
        summary["items"].append(summary_item)
        update_summary(summary)
    print("[MASSFRONT_STAGE10_RENDER_SUMMARY] " + json.dumps(summary["counts"]), flush=True)
    if summary["counts"]["failed"]:
        raise SystemExit(1)


if __name__ == "__main__":
    try:
        main()
    except SystemExit:
        raise
    except Exception:
        traceback.print_exc()
        raise SystemExit(2)
