"""Bind the locked Stage 10 model pack to the live MASSFRONT PBR library.

This is a derived-output pass.  It consumes the locked-source Stage 10 V18 cleanup/UV
reports and GLBs, verifies their hashes and UV/topology proofs, and writes
PBR-bound GLBs below ``tmp/stage10-model-repair``.  Canonical model geometry
and runtime assets are never edited.

The live building-v3 atlas is the material authority.  Each selected semantic
cell is cropped to a reusable 256px tile; the runtime AO/gloss/emissive/metal
packing is converted to standard glTF AO/roughness/metallic plus an optional
emissive map.  Every render primitive uses UVMap_Tile/TEXCOORD_1 for those
repeating maps while UV_GEN/TEXCOORD_0 is retained for later unique bakes.

Run with Blender 5.2 or newer:

  blender --background --factory-startup \
    --python tools/blender/texture-stage10-model-pack.py -- \
    --include-spline [--family FAMILY] [--only KEY] [--limit N] [--force]
"""

import argparse
import binascii
import hashlib
import json
import math
import re
import struct
import sys
import time
import traceback
import zlib
from pathlib import Path

import bpy


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
    print("MF_STAGE10_PBR_DEPENDENCY_ERROR=" + repr(dependency_error), flush=True)
    raise SystemExit(3) from dependency_error

DEFAULT_CATALOG = ROOT / "tmp/stage10-model-review/catalog.json"
DEFAULT_REPAIR_ROOT = ROOT / "tmp/stage10-model-repair"
REPAIR_SCRIPT = BLENDER_TOOLS / "repair-stage10-model-pack.py"
RASTER_CLEANUP_SCRIPT = BLENDER_TOOLS / "stage10_raster_cleanup.py"
MATERIAL_SOURCE = ROOT / "src/engine/materials.js"
ATLAS_PATHS = {
    "baseColor": ROOT / "assets/textures/mat-albedo-building-v3.png",
    "normal": ROOT / "assets/textures/mat-normal-building-v3.png",
    "runtimeOrm": ROOT / "assets/textures/mat-orm-building-v3.png",
}
PIPELINE_VERSION = 1
PIPELINE_MODE = "DERIVED_ATLAS_PBR_ONLY"
MAPPING_VERSION = "MASSFRONT_LIVE_MAT_SEMANTIC_V1"
CONTENT_EQUIVALENT_REBIND_SCHEMA = "MassfrontStage10PbrContentEquivalentRebindV1"
CONTENT_EQUIVALENT_REBIND_METHOD = (
    "BYTE_IDENTICAL_REPAIR_INPUT_AND_PBR_OUTPUT_FRESH_CURRENT_VALIDATION"
)
# This is the exact producer of the completed 330/330 PBR pack.  It is accepted
# only as provenance for an immutable output candidate; every acceptance proof
# is recomputed below by the current code before a new report is written.
CONTENT_EQUIVALENT_REBIND_LEGACY_PIPELINE_SHA256 = (
    "1da057bd3a81467ba81205a97c149310c45142bd017ccdd2423fe3a25b116601"
)
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
EXPECTED_WORLD_MODULES = 320
EXPECTED_SPLINE_MODELS = 7
EXPECTED_FULL_SCHEDULE = 327
METADATA_BLOCKED_KEYS = set()
USER_WITHDRAWN_KEYS = set()
EXPECTED_REPAIR_LOCKED_KEYS = set()
PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"
GLB_MAGIC = 0x46546C67
GLB_JSON = 0x4E4F534A
GLB_BIN = 0x004E4942
GL_REPEAT = 10497
CUBIC_STRETCH_LIMIT = math.sqrt(3.0) + 0.01
TEXEL_SCALE_ERROR_LIMIT = 0.005
SOURCE_SLIVER_QUALITY_LIMIT = 1.0e-4
TILE_METRES = 4.0
TILED_UV_METRIC_METHOD = (
    "WORLD_TRIANGLE_TANGENT_JACOBIAN_PROJECTED_WORLD_AREA_FLOOR"
)
TILED_UV_ANCHOR_METHOD = "PER_POLYGON_INTEGRAL_REPEAT_TILE_ANCHOR"
TILED_UV_PROOF_SCHEMA = "MassfrontStage10TiledUvConstructionProofV1"
TILED_UV_AGGREGATE_PROOF_SCHEMA = "MassfrontStage10TiledUvAggregateProofV1"
FLOAT32_UNIT_ROUNDOFF = 2.0 ** -24
FLOAT32_AFFINE_DOT_OPERATION_COUNT = 7
POST_EXPORT_INFERENCE_BOUND_METHOD = (
    "HIERARCHICAL_FLOAT32_AFFINE_FORWARD_ERROR_PLUS_UV_AND_GLTF_V_FLIP_ULPS"
)
POST_EXPORT_INFERENCE_BOUND_FORMULA = (
    "((PROPAGATED_INPUT_ULPS+COEFFICIENT_ULPS+"
    "GAMMA_7_TIMES_SUM_ABS_AFFINE_TERMS+COMPOSITION_REALIZATION_DELTA)"
    "/TILE_METRES)+PROJECTED_UV_ULP+STORED_UV_ULP+OPTIONAL_GLTF_V_FLIP_ULP"
)
REPAIR_ELIGIBLE_STATUSES = (
    "READY_FOR_TEXTURE_GENERATION",
    "UV_READY_GEOMETRY_REVIEW",
)
REPAIR_QUARANTINE_STATUS = "RECONSTRUCTION_REQUIRED"
PRODUCTION_SET_POLICY = {
    "schema": "MassfrontStage10ProductionSetPolicyV1",
    "repairEligibleStatuses": list(REPAIR_ELIGIBLE_STATUSES),
    "repairQuarantineStatus": REPAIR_QUARANTINE_STATUS,
    "requiredRepairProofs": [
        "MATERIAL_SEMANTIC",
        "RASTER_CLEANUP",
        "TILED_UV_CONSTRUCTION",
        "PRE_EXPORT_TILED_UV",
        "POST_EXPORT_OUTPUT_TILED_UV",
        "POST_EXPORT_TEXTURE_SOURCE_TILED_UV",
    ],
    "downstreamFailureDisposition": "QUARANTINED_NO_PROMOTION",
    "canonicalSourcesUntouched": True,
}


# Spline exports use generated Material_N labels, so name-based inference would
# be guesswork.  These explicit, reviewable assignments bind each retained
# material slot to the live registry.  An absent key is a hard error.
SPLINE_MATERIAL_OVERRIDES = {
    "mf-hy3d-n7-deployer-lane-8x8-spline-v1": {
        0: "FOUNDATION_PAD", 1: "CONC", 2: "WARN", 3: "WARN",
        4: "WORLDKIT_COMPOSITE", 5: "WORLDKIT_GUNMETAL",
        6: "ENGINE_VENT", 7: "CURTAIN_GLASS", 8: "CURTAIN_GLASS",
        9: "ENGINE_VENT", 10: "WORLDKIT_VENT", 11: "WORLDKIT_VENT",
        12: "WORLDKIT_GUNMETAL",
    },
    "mf-hy3d-nordhall-skyscraper-spline-v1": {
        -1: "WORLDKIT_COMPOSITE",
    },
    "MF_STRUCT_CITYDOME_01": {
        0: "BRASS", 1: "WORLDKIT_COMPOSITE", 2: "FOUNDATION_PAD",
        3: "BUILD_OFFICE_COOL", 4: "PRECAST_BAY", 5: "WORLDKIT_GUNMETAL",
    },
    "MF_STRUCT_CITYTOWER_01": {
        0: "UNIT_BEACON", 1: "WORLDKIT_GUNMETAL", 2: "FOUNDATION_PAD",
        3: "BUILD_OFFICE_COOL", 4: "PRECAST_BAY",
        5: "BUILD_OFFICE_COOL", 6: "PRECAST_BAY",
        7: "WORLDKIT_COMPOSITE",
    },
    "MF_STRUCT_CIVICBLOCK_01": {
        0: "PRECAST_BAY", 1: "WORLDKIT_COMPOSITE",
        2: "BUILD_OFFICE_COOL", 3: "BUILD_OFFICE_COOL", 4: "HVAC_ROOF",
    },
    "MF_STRUCT_COMMSRELAY_01": {
        0: "UNIT_BEACON", 1: "WORLDKIT_GUNMETAL", 2: "FOUNDATION_PAD",
        3: "WORLDKIT_VENT", 4: "WORLDKIT_GUNMETAL",
        5: "WORLDKIT_COMPOSITE", 6: "WORLDKIT_GUNMETAL",
    },
    "MF_STRUCT_REFINERY_01": {
        0: "FOUNDATION_PAD", 1: "EMBER_CORE", 2: "WORLDKIT_COMPOSITE",
        3: "WORLDKIT_GUNMETAL", 4: "WORLDKIT_GUNMETAL",
        5: "WORLDKIT_GUNMETAL", 6: "WORLDKIT_GUNMETAL",
        7: "WORLDKIT_GUNMETAL", 8: "WORLDKIT_GUNMETAL",
        9: "WORLDKIT_GUNMETAL", 10: "WORLDKIT_GUNMETAL",
        11: "WORLDKIT_GUNMETAL", 12: "WORLDKIT_VENT",
        13: "WORLDKIT_VENT", 14: "WORLDKIT_VENT", 15: "WORLDKIT_VENT",
        16: "WORLDKIT_VENT", 17: "WORLDKIT_VENT", 18: "WORLDKIT_VENT",
        19: "WORLDKIT_VENT", 20: "HVAC_ROOF",
    },
}


def log(message):
    print("MF_STAGE10_PBR: " + str(message), flush=True)


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
    parser.add_argument(
        "--rebind-content-equivalent", action="store_true",
        help=(
            "Freshly validate and re-report a byte-identical prior PBR artifact; "
            "fall through to a full rebuild on any mismatch."
        ),
    )
    values = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
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


def canonical_json_text(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True)


def canonical_json_hash(value):
    return hashlib.sha256(canonical_json_text(value).encode("utf-8")).hexdigest()


def repo_relative(path):
    return str(Path(path).resolve().relative_to(ROOT.resolve())).replace("\\", "/")


def require_under(path, parent, label):
    try:
        Path(path).resolve().relative_to(Path(parent).resolve())
    except ValueError as exc:
        raise RuntimeError("%s escapes %s: %s" % (label, parent, path)) from exc


def safe_id(value):
    return value.replace("/", "_").replace("\\", "_")


def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def parse_live_material_registry():
    text = MATERIAL_SOURCE.read_text(encoding="utf-8")
    grid = re.search(r"const\s+MAT_TILES\s*=\s*(\d+)", text)
    tile = re.search(r"MAT_TS\s*=\s*(\d+)", text)
    body = re.search(r"const\s+MAT\s*=\s*\{([\s\S]*?)\n\};", text)
    if not grid or not tile or not body:
        raise RuntimeError("could not parse live MAT registry")
    clean = re.sub(r"/\*[\s\S]*?\*/|//[^\n]*", "", body.group(1))
    registry = {name: int(index) for name, index in re.findall(r"([A-Z0-9_]+)\s*:\s*(\d+)", clean)}
    if len(registry) != len(set(registry.values())):
        raise RuntimeError("live MAT registry contains duplicate IDs")
    spec = {"grid": int(grid.group(1)), "tileSize": int(tile.group(1)), "materials": registry}
    if spec["grid"] != 11 or spec["tileSize"] != 256:
        raise RuntimeError("Stage 10 PBR contract requires the live 11x11, 256px-cell atlas")
    return spec


def png_chunks(data):
    if data[:8] != PNG_SIGNATURE:
        raise RuntimeError("invalid PNG signature")
    offset = 8
    while offset < len(data):
        length = struct.unpack(">I", data[offset:offset + 4])[0]
        kind = data[offset + 4:offset + 8]
        payload = data[offset + 8:offset + 8 + length]
        expected = struct.unpack(">I", data[offset + 8 + length:offset + 12 + length])[0]
        actual = binascii.crc32(kind + payload) & 0xFFFFFFFF
        if actual != expected:
            raise RuntimeError("PNG CRC mismatch for " + kind.decode("ascii", "replace"))
        yield kind, payload
        offset += 12 + length


def paeth(first, second, third):
    estimate = first + second - third
    da, db, dc = abs(estimate - first), abs(estimate - second), abs(estimate - third)
    return first if da <= db and da <= dc else second if db <= dc else third


def read_png_rgba(path):
    chunks = list(png_chunks(Path(path).read_bytes()))
    header = next((payload for kind, payload in chunks if kind == b"IHDR"), None)
    if header is None:
        raise RuntimeError("PNG has no IHDR: " + str(path))
    width, height, depth, colour, compression, filtering, interlace = struct.unpack(">IIBBBBB", header)
    if (depth, colour, compression, filtering, interlace) != (8, 6, 0, 0, 0):
        raise RuntimeError("atlas PNG must be non-interlaced 8-bit RGBA: " + str(path))
    packed = b"".join(payload for kind, payload in chunks if kind == b"IDAT")
    raw = zlib.decompress(packed)
    stride, bpp = width * 4, 4
    if len(raw) != height * (stride + 1):
        raise RuntimeError("unexpected decoded PNG byte count: " + str(path))
    result = bytearray(width * height * 4)
    source_offset = 0
    for row in range(height):
        filter_type = raw[source_offset]
        source_offset += 1
        current = bytearray(raw[source_offset:source_offset + stride])
        source_offset += stride
        previous = result[(row - 1) * stride:row * stride] if row else bytes(stride)
        for index in range(stride):
            left = current[index - bpp] if index >= bpp else 0
            above = previous[index]
            upper_left = previous[index - bpp] if index >= bpp else 0
            if filter_type == 1:
                current[index] = (current[index] + left) & 255
            elif filter_type == 2:
                current[index] = (current[index] + above) & 255
            elif filter_type == 3:
                current[index] = (current[index] + ((left + above) >> 1)) & 255
            elif filter_type == 4:
                current[index] = (current[index] + paeth(left, above, upper_left)) & 255
            elif filter_type != 0:
                raise RuntimeError("unsupported PNG filter %d" % filter_type)
        result[row * stride:(row + 1) * stride] = current
    return width, height, bytes(result)


def png_chunk(kind, payload):
    return (struct.pack(">I", len(payload)) + kind + payload
            + struct.pack(">I", binascii.crc32(kind + payload) & 0xFFFFFFFF))


def encode_png(width, height, channels, pixels):
    colour_type = 6 if channels == 4 else 2 if channels == 3 else None
    if colour_type is None or len(pixels) != width * height * channels:
        raise RuntimeError("invalid PNG encode request")
    stride = width * channels
    raw = b"".join(b"\x00" + pixels[row * stride:(row + 1) * stride] for row in range(height))
    header = struct.pack(">IIBBBBB", width, height, 8, colour_type, 0, 0, 0)
    return (PNG_SIGNATURE + png_chunk(b"IHDR", header)
            + png_chunk(b"IDAT", zlib.compress(raw, 9)) + png_chunk(b"IEND", b""))


def crop_rgba(pixels, atlas_width, tile_size, material_id, grid):
    left = (material_id % grid) * tile_size
    top = (material_id // grid) * tile_size
    rows = []
    for row in range(top, top + tile_size):
        start = (row * atlas_width + left) * 4
        rows.append(pixels[start:start + tile_size * 4])
    return b"".join(rows)


def rgb_from_rgba(pixels, converter):
    output = bytearray(len(pixels) // 4 * 3)
    out = 0
    for index in range(0, len(pixels), 4):
        red, green, blue = converter(*pixels[index:index + 4])
        output[out:out + 3] = bytes((red, green, blue))
        out += 3
    return bytes(output)


def wrap_metrics(pixels, size, channels):
    maximum_lr = 0
    maximum_tb = 0
    for row in range(size):
        left = (row * size) * channels
        right = (row * size + size - 1) * channels
        maximum_lr = max(maximum_lr, *(abs(pixels[left + c] - pixels[right + c]) for c in range(channels)))
    top = 0
    bottom = (size - 1) * size * channels
    for column in range(size):
        first = top + column * channels
        last = bottom + column * channels
        maximum_tb = max(maximum_tb, *(abs(pixels[first + c] - pixels[last + c]) for c in range(channels)))
    return {"leftRightMax": maximum_lr, "topBottomMax": maximum_tb}


class TileLibrary:
    def __init__(self, output_root, registry):
        self.registry = registry
        self.root = output_root / "pbr-reports/library"
        self.cells = self.root / "cells"
        self.root.mkdir(parents=True, exist_ok=True)
        self.cells.mkdir(parents=True, exist_ok=True)
        self.atlas = {}
        expected = registry["grid"] * registry["tileSize"]
        for role, path in ATLAS_PATHS.items():
            width, height, pixels = read_png_rgba(path)
            if (width, height) != (expected, expected):
                raise RuntimeError("%s atlas is %dx%d; expected %dx%d" % (role, width, height, expected, expected))
            self.atlas[role] = {
                "path": repo_relative(path), "sha256": sha256(path),
                "width": width, "height": height, "channels": "RGBA8", "pixels": pixels,
            }
        self.records = {}
        previous_path = self.root / "library.json"
        if previous_path.is_file():
            try:
                previous = json.loads(previous_path.read_text(encoding="utf-8"))
                if previous.get("sourceContractSha256") == self.source_contract_hash():
                    self.records.update(previous.get("cells", {}))
            except Exception:
                pass

    def source_contract_hash(self):
        return canonical_json_hash({
            "mappingVersion": MAPPING_VERSION,
            "registrySource": {"path": repo_relative(MATERIAL_SOURCE), "sha256": sha256(MATERIAL_SOURCE)},
            "grid": self.registry["grid"], "tileSize": self.registry["tileSize"],
            "atlases": {role: {key: value for key, value in record.items() if key != "pixels"}
                        for role, record in self.atlas.items()},
        })

    def ensure(self, semantic):
        if semantic not in self.registry["materials"]:
            raise RuntimeError("semantic material is absent from live MAT registry: " + semantic)
        material_id = self.registry["materials"][semantic]
        if material_id >= self.registry["grid"] ** 2:
            raise RuntimeError("semantic material exceeds live atlas: " + semantic)
        slug = "%03d-%s" % (material_id, semantic.lower().replace("_", "-"))
        base_rgba = crop_rgba(
            self.atlas["baseColor"]["pixels"], self.atlas["baseColor"]["width"],
            self.registry["tileSize"], material_id, self.registry["grid"],
        )
        normal_rgba = crop_rgba(
            self.atlas["normal"]["pixels"], self.atlas["normal"]["width"],
            self.registry["tileSize"], material_id, self.registry["grid"],
        )
        runtime_orm = crop_rgba(
            self.atlas["runtimeOrm"]["pixels"], self.atlas["runtimeOrm"]["width"],
            self.registry["tileSize"], material_id, self.registry["grid"],
        )
        # Runtime channels are AO, gloss, emissive, metal.  glTF requires
        # AO, roughness, metal in RGB, so gloss is inverted and alpha moves B.
        standard_orm = rgb_from_rgba(runtime_orm, lambda ao, gloss, emissive, metal: (ao, 255 - gloss, metal))
        emissive = rgb_from_rgba(runtime_orm, lambda ao, gloss, emission, metal: (emission, emission, emission))
        emission_max = max(runtime_orm[2::4], default=0)
        size = self.registry["tileSize"]
        products = {
            "baseColor": (4, base_rgba, encode_png(size, size, 4, base_rgba), "sRGB_RGBA8"),
            "normal": (4, normal_rgba, encode_png(size, size, 4, normal_rgba), "LINEAR_RGBA8"),
            "orm": (3, standard_orm, encode_png(size, size, 3, standard_orm), "LINEAR_RGB8_AO_ROUGH_METAL"),
        }
        if emission_max:
            products["emissive"] = (3, emissive, encode_png(size, size, 3, emissive), "sRGB_RGB8")
        maps = {}
        for role, (channels, pixels, encoded, channel_label) in products.items():
            path = self.cells / (slug + "-" + role + ".png")
            digest = hashlib.sha256(encoded).hexdigest()
            if not path.is_file() or sha256(path) != digest:
                path.write_bytes(encoded)
            maps[role] = {
                "path": repo_relative(path), "sha256": digest,
                "width": size, "height": size, "channels": channel_label,
                "sampler": "REPEAT", "wrap": wrap_metrics(pixels, size, channels),
            }
        record = {
            "semantic": semantic, "materialId": material_id,
            "atlasCell": {"column": material_id % self.registry["grid"], "row": material_id // self.registry["grid"]},
            "sourceChannels": {"runtimeOrm": "R=AO,G=gloss,B=emissive,A=metal"},
            "outputChannels": {"orm": "R=AO,G=roughness(1-gloss),B=metallic(source alpha)"},
            "emissiveRequired": bool(emission_max), "sourceEmissiveMax": emission_max,
            "maps": maps,
        }
        self.records[semantic] = record
        self.write_manifest()
        return record

    def write_manifest(self):
        manifest = {
            "schema": "MassfrontStage10PbrTileLibraryV1",
            "pipelineVersion": PIPELINE_VERSION,
            "mappingVersion": MAPPING_VERSION,
            "sourceContractSha256": self.source_contract_hash(),
            "registry": {
                "path": repo_relative(MATERIAL_SOURCE), "sha256": sha256(MATERIAL_SOURCE),
                "grid": self.registry["grid"], "tileSize": self.registry["tileSize"],
                "materialCount": len(self.registry["materials"]),
            },
            "atlases": {role: {key: value for key, value in record.items() if key != "pixels"}
                        for role, record in self.atlas.items()},
            "cells": dict(sorted(self.records.items())),
        }
        (self.root / "library.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")

    def contract_for(self, semantics):
        cells = {semantic: self.ensure(semantic) for semantic in sorted(set(semantics))}
        value = {
            "sourceContractSha256": self.source_contract_hash(),
            "grid": self.registry["grid"], "tileSize": self.registry["tileSize"],
            "cells": cells,
        }
        value["contractSha256"] = canonical_json_hash(value)
        return value


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
                "category": module.get("category", family.get("label", family["id"])),
                "kind": "world-kit", "canonicalSource": ROOT / module["model"]["path"],
                "canonicalSha256": module["model"]["sha256"],
                "repairLocked": bool(module.get("repairLocked")), "metadataBlocked": False,
            }
            if entry["repairLocked"]:
                exclusions.append({**entry, "reason": "CATALOG_REPAIR_LOCKED"})
            elif ((not selected_families or family["id"] in selected_families)
                  and (not only_keys or entry["key"] in only_keys)):
                entries.append(entry)
    spline_exports = catalog.get("splineExports", catalog.get("splineModels", []))
    for model in spline_exports:
        spline_count += 1
        entry = {
            "key": model["key"], "id": model["id"], "family": "spline-world-prefabs",
            "category": model.get("category", "Spline world prefabs"), "kind": "spline",
            "canonicalSource": ROOT / model["model"]["path"],
            "canonicalSha256": model["model"]["sha256"],
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
    if failures:
        raise RuntimeError("Stage 10 PBR catalog contract mismatch: " + "; ".join(failures))


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


def derived_exclusion_reason(obj):
    if obj.type != "MESH":
        return None
    role = str(obj.get("mf_role") or "").lower()
    tokens = metadata_tokens(obj)
    if (role in DERIVED_EXCLUDED_ROLES or obj.get("mf_evidence") or obj.get("mf_proof")
            or obj.get("mf_evidence_only") or obj.get("mf_proof_only") or obj.get("mf_studio_only")):
        return "EVIDENCE_OR_PROOF_ONLY"
    if "FLOOR" in tokens and tokens.intersection({"STUDIO", "SHADOW", "EVIDENCE", "REVIEW"}):
        return "STUDIO_OR_SHADOW_FLOOR"
    if "STUDIO" in tokens or "EVIDENCE" in tokens or "PROOF" in tokens:
        return "DERIVED_PREVIEW_HELPER"
    return None


def render_exclusion_reason(obj):
    helper = derived_exclusion_reason(obj)
    if helper:
        return helper
    if obj.type != "MESH" or obj.data is None or not obj.data.vertices or not obj.data.polygons:
        return "NOT_RENDER_GEOMETRY"
    if obj.hide_render:
        return "HIDDEN_RENDER_OBJECT"
    role = str(obj.get("mf_role") or "").lower()
    upper = obj.name.upper()
    if obj.get("mf_collision") or "COLLISION" in upper or upper.endswith("_COL"):
        return "COLLISION"
    if upper.endswith("_NAV") or role in NON_RENDER_ROLES:
        return role.upper() if role else "NAVIGATION_PROXY"
    return None


def mesh_objects():
    return [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]


def render_meshes():
    return [obj for obj in mesh_objects() if render_exclusion_reason(obj) is None]


def geometry_signature(obj):
    mesh = obj.data
    digest = hashlib.sha256()
    digest.update(struct.pack("<III", len(mesh.vertices), len(mesh.edges), len(mesh.polygons)))
    for row in obj.matrix_world:
        digest.update(struct.pack("<4d", *[float(value) for value in row]))
    for vertex in mesh.vertices:
        digest.update(struct.pack("<3d", *[float(value) for value in vertex.co]))
    for edge in mesh.edges:
        digest.update(struct.pack("<2I", *edge.vertices))
    for polygon in mesh.polygons:
        digest.update(struct.pack("<I?I", len(polygon.vertices), polygon.use_smooth, polygon.material_index))
        for vertex_index in polygon.vertices:
            digest.update(struct.pack("<I", vertex_index))
    try:
        digest.update(struct.pack("<I", len(mesh.corner_normals)))
        for normal in mesh.corner_normals:
            digest.update(struct.pack("<3d", *[float(value) for value in normal.vector]))
    except Exception:
        for vertex in mesh.vertices:
            digest.update(struct.pack("<3d", *[float(value) for value in vertex.normal]))
    return digest.hexdigest()


def artifact_mesh_identity(obj):
    """Fingerprint the GLB-visible mesh payload at float32 storage precision."""
    mesh = obj.data
    mesh.calc_loop_triangles()
    transform = hashlib.sha256()
    topology = hashlib.sha256()
    winding = hashlib.sha256()
    normals = hashlib.sha256()
    transform.update(struct.pack(
        "<16f", *[float(obj.matrix_world[row][column])
                   for row in range(4) for column in range(4)],
    ))
    topology.update(struct.pack(
        "<4I", len(mesh.vertices), len(mesh.edges), len(mesh.loops), len(mesh.polygons),
    ))
    for vertex in mesh.vertices:
        topology.update(struct.pack("<3f", *[float(value) for value in vertex.co]))
    for edge in mesh.edges:
        topology.update(struct.pack("<2I", *edge.vertices))
    for polygon in mesh.polygons:
        indices = tuple(int(value) for value in polygon.vertices)
        winding.update(struct.pack(
            "<4I?", int(polygon.loop_start), int(polygon.loop_total),
            int(polygon.material_index), len(indices), bool(polygon.use_smooth),
        ))
        winding.update(struct.pack("<%dI" % len(indices), *indices))
    corner_normals = list(mesh.corner_normals)
    normals.update(struct.pack("<I", len(corner_normals)))
    for normal in corner_normals:
        normals.update(struct.pack("<3f", *[float(value) for value in normal.vector]))
    uv_layers = []
    for index, layer in enumerate(mesh.uv_layers):
        digest = hashlib.sha256()
        digest.update(struct.pack("<II", index, len(layer.data)))
        for loop_uv in layer.data:
            digest.update(struct.pack("<2f", float(loop_uv.uv.x), float(loop_uv.uv.y)))
        uv_layers.append({
            "texCoord": index,
            "loops": len(layer.data),
            "sha256": digest.hexdigest(),
        })
    record = {
        "vertices": len(mesh.vertices),
        "edges": len(mesh.edges),
        "loops": len(mesh.loops),
        "polygons": len(mesh.polygons),
        "triangles": len(mesh.loop_triangles),
        "transformSha256": transform.hexdigest(),
        "topologyPositionSha256": topology.hexdigest(),
        "indexWindingSha256": winding.hexdigest(),
        "cornerNormalSha256": normals.hexdigest(),
        "uvAccessors": uv_layers,
        "renderNode": obj.get("mf_stage10_render") is True,
    }
    record["identitySha256"] = canonical_json_hash(record)
    return record


def artifact_scene_identity(objects):
    names = [obj.name_full for obj in objects]
    if len(names) != len(set(names)):
        raise RuntimeError("GLB artifact identity requires unique mesh object names")
    return {
        name: artifact_mesh_identity(obj)
        for name, obj in sorted(((obj.name_full, obj) for obj in objects))
    }


def activate_many(objects):
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.hide_set(False)
        obj.hide_viewport = False
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]


def uv_overlap_stats(objects, layer_index=0):
    previous_sync = bpy.context.scene.tool_settings.use_uv_select_sync
    bpy.context.scene.tool_settings.use_uv_select_sync = False
    try:
        counts = {}
        for obj in objects:
            if len(obj.data.uv_layers) <= layer_index:
                raise RuntimeError(
                    "missing TEXCOORD_%d on final PBR artifact %s"
                    % (layer_index, obj.name_full)
                )
            obj.data.uv_layers.active_index = layer_index
            activate_many([obj])
            bpy.ops.object.mode_set(mode="EDIT")
            bpy.ops.mesh.select_all(action="SELECT")
            bpy.ops.uv.select_all(action="DESELECT")
            bpy.ops.uv.select_overlap(extend=False)
            bpy.ops.object.mode_set(mode="OBJECT")
            face_selection = obj.data.attributes.get(".uv_select_face")
            loop_selection = obj.data.attributes.get(".uv_select_vert")
            counts[obj.name_full] = {
                "overlapFaces": sum(
                    1 for value in face_selection.data if value.value
                ) if face_selection else 0,
                "overlapLoops": sum(
                    1 for value in loop_selection.data if value.value
                ) if loop_selection else 0,
            }
        return counts
    finally:
        if bpy.context.object and bpy.context.object.mode != "OBJECT":
            bpy.ops.object.mode_set(mode="OBJECT")
        bpy.context.scene.tool_settings.use_uv_select_sync = previous_sync


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


def tiled_uv_metrics(obj, layer_index=1):
    """Re-run the repair Jacobian measurement on the exported PBR GLB."""
    mesh = obj.data
    if len(mesh.uv_layers) <= layer_index:
        return {"present": False, "valid": False}
    layer = mesh.uv_layers[layer_index]
    normal_matrix = obj.matrix_world.to_3x3().inverted_safe().transposed()
    stretches = []
    area_scales = []
    area_scale_errors = []
    max_scale_errors = []
    measured = degenerate_world = zero_uv_area = exact_zero_uv_area = nonfinite = 0
    projected_floor_failures = 0
    projected_floor_evaluations = 0
    projected_floors = []
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
            if not all(math.isfinite(value) for value in (uv_a.x, uv_a.y, uv_b.x, uv_b.y)):
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
            j00 = uv_a.x / world_x_a
            j10 = uv_a.y / world_x_a
            j01 = (uv_b.x - j00 * world_x_b) / world_y_b
            j11 = (uv_b.y - j10 * world_x_b) / world_y_b
            gram_a = j00 * j00 + j10 * j10
            gram_b = j00 * j01 + j10 * j11
            gram_c = j01 * j01 + j11 * j11
            discriminant = math.sqrt(max(
                0.0, (gram_a - gram_c) ** 2 + 4.0 * gram_b * gram_b,
            ))
            singular_max = math.sqrt(max(0.0, 0.5 * (gram_a + gram_c + discriminant)))
            singular_min = math.sqrt(max(0.0, 0.5 * (gram_a + gram_c - discriminant)))
            if not all(math.isfinite(value) for value in (singular_min, singular_max)):
                nonfinite += 1
                continue
            if singular_min <= epsilon:
                zero_uv_area += 1
                continue
            area_scale = double_uv_area / double_world_area
            area_scale_error = abs(area_scale / expected_area_scale - 1.0)
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
    return {
        "present": True,
        "method": TILED_UV_METRIC_METHOD,
        "scope": "FINAL_PBR_GLB_FRESH_BLENDER_REIMPORT",
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
            round(percentile(area_scale_errors, 0.95), 7)
            if area_scale_errors else None
        ),
        "maxAreaScaleRelativeError": (
            round(max_area_error, 7) if math.isfinite(max_area_error) else None
        ),
        "valid": finite and nonzero and scale_consistent and within_stretch_bound,
    }


def face_assignment_signature(obj):
    digest = hashlib.sha256()
    # Slot count is metadata; the contract protects each face's slot index.
    # A previously unassigned primitive needs one new slot to become valid
    # glTF PBR, but its faces remain assigned to the same index zero.
    digest.update(struct.pack("<I", len(obj.data.polygons)))
    for polygon in obj.data.polygons:
        digest.update(struct.pack("<I", polygon.material_index))
    return digest.hexdigest()


def material_factors(material):
    result = {
        "baseColor": [round(float(value), 6) for value in material.diffuse_color],
        "metallic": round(float(getattr(material, "metallic", 0.0)), 6),
        "roughness": round(float(getattr(material, "roughness", 0.5)), 6),
        "emissive": [0.0, 0.0, 0.0],
    }
    if material.use_nodes and material.node_tree:
        principled = next((node for node in material.node_tree.nodes if node.type == "BSDF_PRINCIPLED"), None)
        if principled:
            for key, names in {
                "baseColor": ("Base Color",), "metallic": ("Metallic",),
                "roughness": ("Roughness",), "emissive": ("Emission Color", "Emission"),
            }.items():
                socket = next((principled.inputs.get(name) for name in names if principled.inputs.get(name)), None)
                if socket is not None and not socket.is_linked:
                    value = socket.default_value
                    result[key] = ([round(float(item), 6) for item in value[:4]] if hasattr(value, "__len__")
                                   else round(float(value), 6))
    return result


def named_semantic(name):
    upper = re.sub(r"\.\d{3}$", "", name or "").upper()
    tokens = set(filter(None, re.split(r"[^A-Z0-9]+", upper)))
    def has(*values):
        return any(value in tokens or value in upper for value in values)
    style = "RUINED" if has("RUINED") else "BRUTALIST" if has("BRUTALIST") else "COLONIAL" if has("COLONIAL") else None
    if has("EMISSIVE", "GLOW", "BEACON", "LAMP", "LIGHT"):
        return "UNIT_BEACON" if has("BEACON") else "ENGINE_VENT"
    if has("GLAZING", "GLASS", "WINDOW", "CURTAIN"):
        return "CURTAIN_GLASS"
    if has("WATER", "SUBMERGED"):
        return "WATER_CREST"
    if has("FOLIAGE", "LEAF", "MOSS"):
        return "DENSE_LEAF"
    if has("RUBBLE", "DEBRIS"):
        return "SHATTER_CONC"
    if has("RUST", "CORROD"):
        return "CORRODED_RUST"
    if has("VERDIGRIS", "COPPER"):
        return "COPPER_ROOF"
    if has("HAZARD", "WARN"):
        return "WARN"
    if has("ASPHALT"):
        return "ROAD_ASPHALT_WORN" if style == "RUINED" else "ROAD_ASPHALT_CLEAN"
    if has("LANE", "CROSSWALK"):
        return "ROAD_STR_H"
    if has("KERB", "CURB"):
        return "SIDEWALK_CURB"
    if has("PAVE", "PLAZA"):
        return "BRICK_PLAZA" if style == "COLONIAL" else "SIDEWALK_TILE"
    if has("ROAD"):
        return "ROAD_ASPHALT_WORN" if style == "RUINED" else "ROAD_ASPHALT_CLEAN"
    if has("GRATE", "RECESS", "SLOT", "SERVICE", "VENT", "LOUVRE"):
        return "WORLDKIT_VENT"
    if has("TRIM", "ACCENT"):
        return "WORLDKIT_TRIM"
    if has("DECK", "PAD", "FOUNDATION", "SLAB"):
        return "FOUNDATION_PAD"
    if has("ROOF"):
        return "HVAC_ROOF"
    if has("ARMOUR", "ARMOR", "COMPOSITE"):
        return "SHATTER_STEEL" if style == "RUINED" else "WORLDKIT_COMPOSITE"
    if has("WALL", "CONC", "PRECAST", "BUILD"):
        if style == "RUINED":
            return "SHATTER_CONC"
        if style == "COLONIAL":
            return "BRICK_MASONRY"
        return "PRECAST_BAY" if style == "BRUTALIST" else "WORLDKIT_COMPOSITE"
    if has("METAL", "GUNMETAL", "MACH", "PIPE", "MAST", "RACK", "TANK"):
        return "WORLDKIT_GUNMETAL"
    if has("OCHRE", "EARTH", "SOIL"):
        return "EARTH"
    if has("SAND"):
        return "SAND_DUNE"
    if has("STONE", "ROCK", "BEDROCK"):
        return "BEDROCK"
    if has("CRYST"):
        return "CRYST"
    if has("BRICK"):
        return "BRICK_MASONRY"
    if has("PLATE", "HULL", "SHELL"):
        return "WORLDKIT_COMPOSITE"
    return None


def classify_material(entry, material, source_index, object_names):
    name = material.name if material else "__UNASSIGNED__"
    clean_name = re.sub(r"\.\d{3}$", "", name)
    generic = material is None or not clean_name or re.fullmatch(r"Material(?:_\d+)?", clean_name, re.I)
    factors = material_factors(material) if material else None
    if generic:
        labelled_index = re.fullmatch(r"Material_(\d+)", clean_name, re.I)
        classification_index = int(labelled_index.group(1)) if labelled_index else source_index
        overrides = SPLINE_MATERIAL_OVERRIDES.get(entry["id"])
        if overrides is None or classification_index not in overrides:
            raise RuntimeError(
                "unnamed material classification is ambiguous for %s slot %s" % (entry["key"], classification_index)
            )
        semantic = overrides[classification_index]
        rule = "EXPLICIT_RETAINED_SPLINE_SLOT_OVERRIDE"
    else:
        classification_index = source_index
        semantic = named_semantic(clean_name)
        if semantic is None:
            raise RuntimeError("unclassified authored material %r in %s" % (clean_name, entry["key"]))
        rule = "AUTHORED_NAME_SEMANTIC_TOKEN"
    return {
        "sourceName": name, "sourceIndex": source_index,
        "classificationIndex": classification_index,
        "sourceFactors": factors, "sourceObjects": sorted(object_names),
        "classificationRule": rule, "semantic": semantic,
    }


def input_socket(node, *names):
    for name in names:
        socket = node.inputs.get(name)
        if socket is not None:
            return socket
    raise RuntimeError("Blender node %s has none of sockets %s" % (node.name, names))


def load_image(path, colour_space):
    path = Path(path).resolve()
    existing = next((image for image in bpy.data.images if Path(bpy.path.abspath(image.filepath)).resolve() == path), None)
    image = existing or bpy.data.images.load(str(path), check_existing=True)
    # Background Blender otherwise leaves a just-loaded file at its 1x1 lazy
    # placeholder when glTF export gathers it, producing six identical 250-byte
    # images.  Touch one pixel so the exporter sees the authoritative 256 tile.
    image.reload()
    if tuple(image.size) != (256, 256):
        raise RuntimeError("derived PBR tile did not load at 256x256: " + str(path))
    _ = image.pixels[0]
    image.colorspace_settings.name = colour_space
    image.name = path.stem
    return image


def gltf_settings_group():
    group = bpy.data.node_groups.get("glTF Material Output")
    if group is None:
        group = bpy.data.node_groups.new("glTF Material Output", "ShaderNodeTree")
        group.interface.new_socket(name="Occlusion", in_out="INPUT", socket_type="NodeSocketFloat")
        group.nodes.new("NodeGroupInput")
        group.nodes.new("NodeGroupOutput")
    return group


def make_pbr_material(material_name, tile_record):
    material = bpy.data.materials.new(material_name)
    material.use_nodes = True
    # Stage 10 models contain legitimate opposite-facing sheet/cap pairs.
    # Exporting every material double-sided makes those faces compete at the
    # same depth; the runtime and matched-evidence contract are single-sided.
    material.use_backface_culling = True
    if hasattr(material, "use_backface_culling_shadow"):
        material.use_backface_culling_shadow = True
    material.diffuse_color = (1.0, 1.0, 1.0, 1.0)
    material.metallic = 1.0
    material.roughness = 1.0
    material["mf_stage10_semantic"] = tile_record["semantic"]
    material["mf_stage10_material_id"] = tile_record["materialId"]
    tree = material.node_tree
    tree.nodes.clear()
    output = tree.nodes.new("ShaderNodeOutputMaterial")
    principled = tree.nodes.new("ShaderNodeBsdfPrincipled")
    output.location = (900, 120)
    principled.location = (600, 120)
    tree.links.new(principled.outputs["BSDF"], output.inputs["Surface"])
    input_socket(principled, "Metallic").default_value = 1.0
    input_socket(principled, "Roughness").default_value = 1.0

    uv = tree.nodes.new("ShaderNodeUVMap")
    uv.uv_map = "UVMap_Tile"
    uv.location = (-900, 120)
    nodes = {}
    for role, data in tile_record["maps"].items():
        texture = tree.nodes.new("ShaderNodeTexImage")
        texture.name = "MF_%s" % role.upper()
        texture.label = role
        texture.image = load_image(ROOT / data["path"], "sRGB" if role in {"baseColor", "emissive"} else "Non-Color")
        texture.extension = "REPEAT"
        texture.interpolation = "Linear"
        texture.location = (-600, 380 - len(nodes) * 240)
        tree.links.new(uv.outputs["UV"], texture.inputs["Vector"])
        nodes[role] = texture

    tree.links.new(nodes["baseColor"].outputs["Color"], input_socket(principled, "Base Color"))
    normal_map = tree.nodes.new("ShaderNodeNormalMap")
    normal_map.uv_map = "UVMap_Tile"
    normal_map.location = (250, -120)
    tree.links.new(nodes["normal"].outputs["Color"], normal_map.inputs["Color"])
    tree.links.new(normal_map.outputs["Normal"], input_socket(principled, "Normal"))
    separate = tree.nodes.new("ShaderNodeSeparateColor")
    separate.mode = "RGB"
    separate.location = (0, -420)
    tree.links.new(nodes["orm"].outputs["Color"], separate.inputs["Color"])
    tree.links.new(separate.outputs["Green"], input_socket(principled, "Roughness"))
    tree.links.new(separate.outputs["Blue"], input_socket(principled, "Metallic"))
    settings = tree.nodes.new("ShaderNodeGroup")
    settings.node_tree = gltf_settings_group()
    settings.location = (250, -620)
    tree.links.new(separate.outputs["Red"], settings.inputs["Occlusion"])
    if "emissive" in nodes:
        tree.links.new(nodes["emissive"].outputs["Color"], input_socket(principled, "Emission Color", "Emission"))
        input_socket(principled, "Emission Strength").default_value = 1.0
    return material


def parse_glb(path):
    data = Path(path).read_bytes()
    if len(data) < 12:
        raise RuntimeError("truncated GLB: " + str(path))
    magic, version, total = struct.unpack("<III", data[:12])
    if magic != GLB_MAGIC or version != 2 or total != len(data):
        raise RuntimeError("invalid GLB header: " + str(path))
    offset = 12
    document = None
    binary = b""
    while offset < len(data):
        length, kind = struct.unpack("<II", data[offset:offset + 8])
        payload = data[offset + 8:offset + 8 + length]
        offset += 8 + length
        if kind == GLB_JSON:
            document = json.loads(payload.decode("utf-8").rstrip(" \t\r\n\0"))
        elif kind == GLB_BIN:
            binary = payload
    if document is None:
        raise RuntimeError("GLB has no JSON chunk: " + str(path))
    return document, binary


def embedded_image_records(document, binary):
    result = []
    for index, image in enumerate(document.get("images", [])):
        if "bufferView" not in image:
            raise RuntimeError("PBR GLB contains an external/unbound image URI")
        view = document["bufferViews"][image["bufferView"]]
        start = view.get("byteOffset", 0)
        payload = binary[start:start + view["byteLength"]]
        if image.get("mimeType") != "image/png" or payload[:8] != PNG_SIGNATURE:
            raise RuntimeError("PBR GLB image is not embedded PNG")
        header = next(payload for kind, payload in png_chunks(payload) if kind == b"IHDR")
        width, height, depth, colour, _, _, _ = struct.unpack(">IIBBBBB", header)
        result.append({
            "index": index, "name": image.get("name"), "sha256": hashlib.sha256(payload).hexdigest(),
            "width": width, "height": height, "bitDepth": depth,
            "channels": "RGBA" if colour == 6 else "RGB" if colour == 2 else "OTHER",
        })
    return result


def replace_embedded_glb_images(path, replacements):
    """Replace exporter images with exact hash-authoritative library PNGs.

    Blender 5.2's keep-original path currently builds 1x1 placeholders for
    channel-routed materials.  Rebuilding buffer views is safer than accepting
    a re-encode: accessors reference buffer-view indices, so geometry bytes and
    all topology stay byte-for-byte while only named image views are replaced.
    """
    document, binary = parse_glb(path)
    for material in document.get("materials", []):
        # Make the raster contract explicit in the GLB instead of relying on
        # glTF defaults.  The shared cleanup intentionally preserves opposite
        # windings, so every accepted PBR consumer must cull them identically.
        material["alphaMode"] = "OPAQUE"
        material["doubleSided"] = False
    image_views = {}
    found = set()
    for image in document.get("images", []):
        name = image.get("name")
        if name in replacements:
            if name in found:
                raise RuntimeError("duplicate exported PBR image name: " + name)
            found.add(name)
            image_views[image["bufferView"]] = replacements[name]
            image["mimeType"] = "image/png"
            image.pop("uri", None)
    missing = sorted(set(replacements) - found)
    if missing:
        raise RuntimeError("exported GLB omitted named PBR images: " + ", ".join(missing))
    rebuilt = bytearray()
    for index, view in enumerate(document.get("bufferViews", [])):
        while len(rebuilt) % 4:
            rebuilt.append(0)
        start = view.get("byteOffset", 0)
        payload = image_views.get(index, binary[start:start + view["byteLength"]])
        view["byteOffset"] = len(rebuilt)
        view["byteLength"] = len(payload)
        rebuilt.extend(payload)
    unpadded_binary_length = len(rebuilt)
    while len(rebuilt) % 4:
        rebuilt.append(0)
    if not document.get("buffers"):
        raise RuntimeError("GLB has no binary buffer declaration")
    document["buffers"][0]["byteLength"] = unpadded_binary_length
    encoded_json = json.dumps(document, separators=(",", ":"), ensure_ascii=True).encode("utf-8")
    encoded_json += b" " * ((4 - len(encoded_json) % 4) % 4)
    total = 12 + 8 + len(encoded_json) + 8 + len(rebuilt)
    output = bytearray(struct.pack("<III", GLB_MAGIC, 2, total))
    output.extend(struct.pack("<II", len(encoded_json), GLB_JSON))
    output.extend(encoded_json)
    output.extend(struct.pack("<II", len(rebuilt), GLB_BIN))
    output.extend(rebuilt)
    Path(path).write_bytes(output)


def validate_output_glb(
        path, expected_map_hashes, required_emissive_materials,
        expected_material_names=None):
    document, binary = parse_glb(path)
    images = embedded_image_records(document, binary)
    embedded_hashes = {item["sha256"] for item in images}
    missing_hashes = sorted(set(expected_map_hashes) - embedded_hashes)
    unexpected_hashes = sorted(embedded_hashes - set(expected_map_hashes))
    if missing_hashes or unexpected_hashes:
        raise RuntimeError(
            "exported GLB PBR image bytes differ from the exact current map set: "
            + json.dumps({
                "missing": missing_hashes, "unexpected": unexpected_hashes,
            }, separators=(",", ":"))
        )
    textures = document.get("textures", [])
    samplers = document.get("samplers", [])
    materials = document.get("materials", [])
    meshes = document.get("meshes", [])
    render_mesh_indices = set()
    for node in document.get("nodes", []):
        if node.get("extras", {}).get("mf_stage10_render") is True and "mesh" in node:
            render_mesh_indices.add(node["mesh"])
    if not render_mesh_indices:
        raise RuntimeError("exported GLB has no render-node proof extras")

    def texture_info(material, key):
        if key == "baseColorTexture":
            return material.get("pbrMetallicRoughness", {}).get(key)
        if key == "metallicRoughnessTexture":
            return material.get("pbrMetallicRoughness", {}).get(key)
        return material.get(key)

    coverage = {key: 0 for key in (
        "renderPrimitives", "baseColorTexture", "normalTexture",
        "metallicRoughnessTexture", "occlusionTexture", "emissiveTextureWhereRequired",
    )}
    material_names = set()
    single_sided_materials = set()
    used_material_indices = set()
    used_image_indices = set()
    primitive_faces = 0
    for mesh_index in sorted(render_mesh_indices):
        for primitive in meshes[mesh_index].get("primitives", []):
            coverage["renderPrimitives"] += 1
            attributes = primitive.get("attributes", {})
            if "POSITION" not in attributes or "NORMAL" not in attributes:
                raise RuntimeError("render primitive lacks POSITION or NORMAL")
            if "TEXCOORD_0" not in attributes or "TEXCOORD_1" not in attributes:
                raise RuntimeError("render primitive lacks UV_GEN/TEXCOORD_0 or UVMap_Tile/TEXCOORD_1")
            if "material" not in primitive:
                raise RuntimeError("render primitive has no material")
            material_index = primitive["material"]
            material = materials[material_index]
            used_material_indices.add(material_index)
            material_name = material.get("name", "")
            material_names.add(material_name)
            if material.get("alphaMode") != "OPAQUE" or material.get("doubleSided") is not False:
                raise RuntimeError(
                    "%s does not declare exact OPAQUE/single-sided Stage 10 raster state"
                    % material_name
                )
            single_sided_materials.add(primitive["material"])
            for key in ("baseColorTexture", "normalTexture", "metallicRoughnessTexture", "occlusionTexture"):
                info = texture_info(material, key)
                if not info or info.get("texCoord", 0) != 1:
                    raise RuntimeError("%s does not bind %s to TEXCOORD_1" % (material_name, key))
                texture = textures[info["index"]]
                sampler = samplers[texture.get("sampler", 0)] if samplers else {}
                if sampler.get("wrapS", GL_REPEAT) != GL_REPEAT or sampler.get("wrapT", GL_REPEAT) != GL_REPEAT:
                    raise RuntimeError("%s has a non-REPEAT PBR sampler" % material_name)
                image_index = texture.get("source")
                if not isinstance(image_index, int) or not 0 <= image_index < len(images):
                    raise RuntimeError("%s has an invalid core PNG image binding" % material_name)
                used_image_indices.add(image_index)
                coverage[key] += 1
            if material_name in required_emissive_materials:
                info = material.get("emissiveTexture")
                if not info or info.get("texCoord", 0) != 1:
                    raise RuntimeError("%s requires an emissive TEXCOORD_1 texture" % material_name)
                texture = textures[info["index"]]
                sampler = samplers[texture.get("sampler", 0)] if samplers else {}
                if (sampler.get("wrapS", GL_REPEAT) != GL_REPEAT
                        or sampler.get("wrapT", GL_REPEAT) != GL_REPEAT):
                    raise RuntimeError("%s has a non-REPEAT emissive sampler" % material_name)
                image_index = texture.get("source")
                if not isinstance(image_index, int) or not 0 <= image_index < len(images):
                    raise RuntimeError("%s has an invalid emissive PNG image binding" % material_name)
                used_image_indices.add(image_index)
                coverage["emissiveTextureWhereRequired"] += 1
            if "indices" in primitive:
                primitive_faces += document["accessors"][primitive["indices"]]["count"] // 3
    total = coverage["renderPrimitives"]
    passed = total > 0 and all(coverage[key] == total for key in (
        "baseColorTexture", "normalTexture", "metallicRoughnessTexture", "occlusionTexture",
    ))
    if not passed:
        raise RuntimeError("full PBR primitive coverage failed")
    if used_material_indices != set(range(len(materials))):
        raise RuntimeError("PBR GLB contains unused or unbound material definitions")
    if used_image_indices != set(range(len(images))):
        raise RuntimeError("PBR GLB contains unused or unbound embedded images")
    if (expected_material_names is not None
            and material_names != set(expected_material_names)):
        raise RuntimeError(
            "exported PBR material-name coverage changed: "
            + json.dumps({
                "expected": sorted(expected_material_names),
                "actual": sorted(material_names),
            }, separators=(",", ":"))
        )
    coverage.update({
        "totalBound": total, "requiredEmissiveMaterials": len(required_emissive_materials),
        "opaqueMaterialCount": len(single_sided_materials),
        "singleSidedMaterialCount": len(single_sided_materials),
        "doubleSidedMaterialCount": 0,
        "materialNames": sorted(material_names),
        "embeddedImages": images, "renderTriangleCount": primitive_faces, "passed": True,
    })
    return coverage


def repair_report_path(repair_root, entry):
    return repair_root / "reports" / entry["family"] / (safe_id(entry["id"]) + ".json")


def pbr_report_path(output_root, entry):
    return output_root / "pbr-reports" / entry["family"] / (safe_id(entry["id"]) + ".json")


def pbr_output_path(output_root, entry, repair):
    return output_root / "pbr-models" / entry["family"] / Path(repair["output"]).name


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
        and contract.get("materialInventorySha256") == canonical_json_hash(inventory)
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
    applied = [
        item for item in objects
        if item["float32PartitionRealizationApplications"] > 0
    ]
    maximum = lambda field: max((item[field] for item in applied), default=0.0)
    total = lambda field: sum(item[field] for item in applied)
    expected = {
        "method": "TOPOLOGY_ACCEPTED_PAIR_TRIGGERED_ADJACENT_FLOAT32_OMITTED_AXIS_ULP",
        "enabledConsolidations": sum(
            item["float32PartitionRealizationEnabledConsolidations"]
            for item in objects
        ),
        "applications": sum(
            item["float32PartitionRealizationApplications"] for item in objects
        ),
        "adjustments": sum(
            item["float32PartitionRealizationAdjustments"] for item in objects
        ),
        "acceptedPairsBefore": sum(
            item["float32PartitionRealizationAcceptedPairsBefore"]
            for item in objects
        ),
        "acceptedPairsAfter": sum(
            item["float32PartitionRealizationAcceptedPairsAfter"]
            for item in objects
        ),
        "allFreshScansZero": all(
            item.get("float32PartitionRealizationAllFreshScansZero") is True
            for item in applied
        ),
        "allDistinctProjectedVerticesPreserved": all(
            item.get(
                "float32PartitionRealizationAllDistinctProjectedVerticesPreserved"
            ) is True for item in applied
        ),
        "allMergesProjectedVerticesFalse": all(
            item.get("float32PartitionRealizationAllMergesProjectedVerticesFalse")
            is True for item in applied
        ),
        "maximumProjectedOverlapAreaM2": maximum(
            "float32PartitionRealizationMaximumProjectedOverlapAreaM2"
        ),
        "totalProjectedOverlapAreaM2": total(
            "float32PartitionRealizationTotalProjectedOverlapAreaM2"
        ),
        "maximumProjectedSymmetricDifferenceM2": maximum(
            "float32PartitionRealizationMaximumProjectedSymmetricDifferenceM2"
        ),
        "totalProjectedSymmetricDifferenceM2": total(
            "float32PartitionRealizationTotalProjectedSymmetricDifferenceM2"
        ),
        "maximumCoverageExpansionAreaM2": maximum(
            "float32PartitionRealizationMaximumCoverageExpansionAreaM2"
        ),
        "totalCoverageExpansionAreaM2": total(
            "float32PartitionRealizationTotalCoverageExpansionAreaM2"
        ),
        "acceptedCoverageExpanded": any(
            item.get("float32PartitionRealizationAcceptedCoverageExpanded") is True
            for item in applied
        ),
        "allExpandsAcceptedCoverageFalse": all(
            item.get("float32PartitionRealizationAllExpandsAcceptedCoverageFalse")
            is True for item in applied
        ),
        "allPreexistingCanonicalEdgeCoverageDeltasUnchanged": all(
            item.get(
                "float32PartitionRealizationAllPreexistingCoverageDeltasUnchanged"
            ) is True for item in applied
        ),
        "maximumPreexistingCanonicalEdgeSymmetricDifferenceM2": maximum(
            "float32PartitionRealizationMaximumPreexistingSymmetricDifferenceM2"
        ),
        "maximumPreexistingCanonicalEdgeExpansionAreaM2": maximum(
            "float32PartitionRealizationMaximumPreexistingExpansionAreaM2"
        ),
        "degenerateTriangles": sum(
            item["float32PartitionRealizationDegenerateTriangles"]
            for item in applied
        ),
        "invertedTriangles": sum(
            item["float32PartitionRealizationInvertedTriangles"]
            for item in applied
        ),
        "internalDuplicateFaces": sum(
            item["float32PartitionRealizationInternalDuplicateFaces"]
            for item in applied
        ),
        "internalEdgeViolations": sum(
            item["float32PartitionRealizationInternalEdgeViolations"]
            for item in applied
        ),
        "nearDuplicateIntendedSharedEndpointViolations": sum(
            item["float32PartitionRealizationNearDuplicateSharedEndpointViolations"]
            for item in applied
        ),
        "allRepresentationalBoundsPassed": all(
            item.get("float32PartitionRealizationAllRepresentationalBoundsPassed")
            is True for item in applied
        ),
        "allActualDriftBoundsPassed": all(
            item.get("float32PartitionRealizationAllActualDriftBoundsPassed")
            is True for item in applied
        ),
        "maximumSourcePlaneDriftM": maximum(
            "float32PartitionRealizationMaximumSourcePlaneDriftM"
        ),
        "maximumWorldShiftM": maximum(
            "float32PartitionRealizationMaximumWorldShiftM"
        ),
        "sharedMeshVertexIndexReuses": sum(
            item["lineageScopedSharedMeshVertexIndexReuses"] for item in objects
        ),
        "sharedMeshVertexIndexReusePassed": all(
            item.get("sharedMeshVertexIndexReusePassed") is True
            for item in objects if item.get("mutated")
        ),
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
    return (
        partition == expected
        and expected["passed"] is True
        and all(expectations.get(field) == value
                for field, value in expected_expectations.items())
    )


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


def canonical_hash_matches(record, hash_field):
    if not isinstance(record, dict):
        return False
    expected = record.get(hash_field)
    if not isinstance(expected, str) or re.fullmatch(r"[0-9a-f]{64}", expected) is None:
        return False
    payload = dict(record)
    payload.pop(hash_field, None)
    return canonical_json_hash(payload) == expected


def ordered_finite_distribution(record, allow_zero=True):
    if not isinstance(record, dict):
        return False
    values = [record.get(field) for field in ("min", "p50", "p95", "p99", "max")]
    if any(isinstance(value, bool) or not isinstance(value, (int, float))
           or not math.isfinite(value) for value in values):
        return False
    if not allow_zero and values[0] <= 0.0:
        return False
    return values == sorted(values)


def tiled_uv_construction_contract_is_safe(contract):
    fixtures = contract.get("fixtures", {}) if isinstance(contract, dict) else {}
    micro = fixtures.get("ruinedBunkerMicroTriangle3067", {})
    collapse = fixtures.get("ruinedBunkerExportCollapseTriangle2532", {})
    cancellation = fixtures.get("rotatedHierarchyAffineCancellation", {})
    numeric_micro = (
        isinstance(micro.get("doubleUvArea"), (int, float))
        and isinstance(micro.get("projectedDoubleAreaFloor"), (int, float))
        and micro["doubleUvArea"] > micro["projectedDoubleAreaFloor"] > 0.0
    )
    return (
        isinstance(contract, dict)
        and contract.get("schema") == "MassfrontStage10TiledUvConstructionContractV1"
        and contract.get("method") == TILED_UV_ANCHOR_METHOD
        and contract.get("metricMethod") == TILED_UV_METRIC_METHOD
        and contract.get("passed") is True
        and contract.get("tileMetres") == TILE_METRES
        and contract.get("worldDoubleAreaFloor") == 1.0e-12
        and contract.get("sourceSliverQualityLimit") == SOURCE_SLIVER_QUALITY_LIMIT
        and contract.get("texelScaleErrorLimit") == TEXEL_SCALE_ERROR_LIMIT
        and contract.get("cubicStretchLimit") == CUBIC_STRETCH_LIMIT
        and micro.get("passed") is True and numeric_micro
        and collapse.get("passed") is True
        and collapse.get("unanchoredValuesDistinctBeforeExport") is True
        and collapse.get("unanchoredValuesCollapseAfterExportFlip") is True
        and collapse.get("anchoredValuesDistinctAfterExportFlip") is True
        and collapse.get("anchoredValuesDistinctAfterRoundtrip") is True
        and fixtures.get("exactCollapsedUvRejected") is True
        and fixtures.get("nonIntegralAnchorRejected") is True
        and fixtures.get("loopInconsistentPostExportArtifactRejected") is True
        and cancellation.get("passed") is True
        and cancellation.get("oldFinalResultUlpWouldReject") is True
        and cancellation.get("affineForwardErrorAccepts") is True
        and cancellation.get("operationCountPerAffineDot")
        == FLOAT32_AFFINE_DOT_OPERATION_COUNT
        and cancellation.get("boundFormula") == POST_EXPORT_INFERENCE_BOUND_FORMULA
        and fixtures.get("affineOutOfBoundResidualRejected") is True
        and fixtures.get("scaleDistortionAboveFrozenLimitRejected") is True
        and canonical_hash_matches(contract, "canonicalContractSha256")
    )


def tiled_uv_anchor_proof_is_safe(proof, post_export):
    if not isinstance(proof, dict):
        return False
    if post_export:
        inference_safe = (
            proof.get("storageRealization")
            == "BLENDER_GLTF_FLOAT32_V_FLIP_ROUNDTRIP"
            and proof.get("postExportAnchorInferenceMethod")
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
            and proof.get("postExportInferredAnchorPolygons")
            == proof.get("polygonCount")
        )
    else:
        inference_safe = (
            proof.get("storageRealization") == "BLENDER_FLOAT32_UV_LAYER"
            and proof.get("postExportAnchorInferenceMethod")
            == "NOT_APPLICABLE_PRE_EXPORT_DETERMINISTIC_FLOOR_FIRST_LOOP"
            and proof.get("postExportInferenceBoundMethod")
            == "EXACT_PRE_EXPORT_FLOAT32_STORAGE_REPLAY"
            and proof.get("postExportInferenceBoundFormula") == "NOT_APPLICABLE_PRE_EXPORT"
            and proof.get("postExportAffineDotOperationCount") == 0
            and proof.get("postExportAffineUnitRoundoff") == 0.0
            and proof.get("postExportMaxAffineHierarchyDepth") == 0
            and proof.get("postExportInferredAnchorPolygons") == 0
        )
    count_fields = (
        "polygonCount", "skippedDegeneratePolygons", "nonzeroAnchorPolygons",
        "loopCount", "edgeComponentCount",
    )
    numeric_fields = (
        "maxModuloPhaseError", "maxModuloPhaseErrorBound",
        "maxDerivativeComponentError", "maxDerivativeComponentErrorBound",
    )
    return (
        proof.get("schema") == TILED_UV_PROOF_SCHEMA
        and proof.get("method") == TILED_UV_ANCHOR_METHOD
        and proof.get("present") is True and proof.get("passed") is True
        and proof.get("tileMetres") == TILE_METRES
        and proof.get("anchorUnits") == "INTEGER_UV_REPEAT_TILES"
        and all(isinstance(proof.get(field), int) and not isinstance(proof.get(field), bool)
                and proof.get(field) >= 0 for field in count_fields)
        and proof.get("polygonCount", 0) > 0 and proof.get("loopCount", 0) > 0
        and proof.get("allOffsetsIntegral") is True
        and proof.get("integralTranslationPreservesModuloOneByConstruction") is True
        and proof.get("nonIntegralAnchorViolations") == 0
        and proof.get("storedCoordinatesMatchFloat32Realization") is True
        and proof.get("storageRealizationViolations") == 0
        and inference_safe
        and proof.get("postExportInferredAnchorAmbiguityViolations") == 0
        and proof.get("postExportInferredAnchorBoundViolations") == 0
        and proof.get("postExportInferredAnchorLoopConsistencyViolations") == 0
        and proof.get("postExportInferredAnchorViolationSamples") == []
        and proof.get("moduloOnePhasePreserved") is True
        and proof.get("moduloPhaseViolations") == 0
        and proof.get("derivativesWithinStoredFloatBounds") is True
        and proof.get("derivativeBoundViolations") == 0
        and all(isinstance(proof.get(field), (int, float))
                and not isinstance(proof.get(field), bool)
                and math.isfinite(proof.get(field)) and proof.get(field) >= 0.0
                for field in numeric_fields)
        and proof.get("maxModuloPhaseError") <= proof.get("maxModuloPhaseErrorBound")
        and proof.get("maxDerivativeComponentError")
        <= proof.get("maxDerivativeComponentErrorBound")
        and canonical_hash_matches(proof, "canonicalProofSha256")
    )


def tiled_uv_metric_is_safe(metrics):
    if not isinstance(metrics, dict):
        return False
    evaluated = metrics.get("projectedFloorEvaluatedTriangles")
    measured = metrics.get("trianglesMeasured")
    minimum = metrics.get("minimumProjectedDoubleAreaFloor")
    maximum = metrics.get("maximumProjectedDoubleAreaFloor")
    return (
        metrics.get("present") is True
        and metrics.get("method") == TILED_UV_METRIC_METHOD
        and metrics.get("tileMetres") == TILE_METRES
        and metrics.get("targetUvUnitsPerMetre") == 0.25
        and metrics.get("worldDoubleAreaFloor") == 1.0e-12
        and metrics.get("worldDoubleAreaFloorUnchanged") is True
        and metrics.get("projectedDoubleAreaFloorMethod")
        == "WORLD_DOUBLE_AREA_FLOOR_TIMES_ABS_DOMINANT_NORMAL_COMPONENT"
        and metrics.get("projectedFloorIsDimensionalConversionNotToleranceRelaxation") is True
        and isinstance(evaluated, int) and not isinstance(evaluated, bool) and evaluated > 0
        and isinstance(measured, int) and not isinstance(measured, bool) and measured > 0
        and evaluated >= measured
        and isinstance(minimum, (int, float)) and math.isfinite(minimum)
        and isinstance(maximum, (int, float)) and math.isfinite(maximum)
        and 0.0 < minimum <= maximum <= 1.0e-12
        and metrics.get("sourceSliverQualityLimit") == SOURCE_SLIVER_QUALITY_LIMIT
        and metrics.get("cubicStretchLimit") == round(CUBIC_STRETCH_LIMIT, 7)
        and metrics.get("texelScaleErrorLimit") == TEXEL_SCALE_ERROR_LIMIT
        and metrics.get("zeroUvAreaTriangles") == 0
        and metrics.get("exactZeroUvAreaTriangles") == 0
        and metrics.get("projectedFloorFailureTriangles") == 0
        and metrics.get("nonFiniteTriangles") == 0
        and metrics.get("finite") is True and metrics.get("nonZero") is True
        and metrics.get("scaleConsistent") is True
        and metrics.get("withinCubicStretchBound") is True
        and metrics.get("valid") is True
        and ordered_finite_distribution(metrics.get("stretchRatio"), allow_zero=False)
        and ordered_finite_distribution(metrics.get("areaScale"), allow_zero=False)
        and ordered_finite_distribution(metrics.get("areaScaleRelativeError"))
        and ordered_finite_distribution(metrics.get("maxSingularValueError"))
        and metrics.get("maxStretchRatio") == metrics["stretchRatio"]["max"]
        and metrics.get("maxAreaScaleRelativeError")
        == metrics["areaScaleRelativeError"]["max"]
        and metrics.get("maxStretchRatio") <= round(CUBIC_STRETCH_LIMIT, 7)
        and metrics.get("maxAreaScaleRelativeError") <= TEXEL_SCALE_ERROR_LIMIT
        and metrics["maxSingularValueError"]["max"] <= TEXEL_SCALE_ERROR_LIMIT
    )


def recompute_exported_texcoord_channel_proof(artifact_path, expected_render_meshes):
    document, binary = parse_glb(artifact_path)
    meshes = document.get("meshes", [])
    accessors = document.get("accessors", [])
    views = document.get("bufferViews", [])
    buffers = document.get("buffers", [])

    def accessor_proof(accessor_index, expected_type):
        in_range = isinstance(accessor_index, int) and 0 <= accessor_index < len(accessors)
        accessor = accessors[accessor_index] if in_range else {}
        view_index = accessor.get("bufferView")
        view_in_range = isinstance(view_index, int) and 0 <= view_index < len(views)
        view = views[view_index] if view_in_range else {}
        component_type = accessor.get("componentType")
        accessor_type = accessor.get("type")
        count = accessor.get("count")
        component_size = 4 if component_type == 5126 else 0
        component_count = {"VEC2": 2, "VEC3": 3}.get(accessor_type, 0)
        element_size = component_size * component_count
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
            view_in_range and isinstance(view_length, int) and view_length >= 0
            and last_end <= view_length
        )
        view_within_binary = (
            view_in_range and view.get("buffer") == 0
            and isinstance(view_offset, int) and view_offset >= 0
            and isinstance(view_length, int) and view_length >= 0
            and view_offset + view_length <= len(binary)
            and len(buffers) == 1
            and buffers[0].get("byteLength", math.inf) <= len(binary)
        )
        uncompressed_dense = (
            accessor.get("sparse") is None
            and not (view.get("extensions") or {}).get("EXT_meshopt_compression")
        )
        passed = (
            in_range and view_in_range and component_type == 5126
            and accessor_type == expected_type and isinstance(count, int) and count > 0
            and accessor.get("normalized") in (None, False) and uncompressed_dense
            and storage_within_view and view_within_binary
        )
        return {
            "index": accessor_index, "indexInRange": in_range,
            "bufferViewIndex": view_index, "bufferViewIndexInRange": view_in_range,
            "componentType": component_type, "type": accessor_type, "count": count,
            "float32": component_type == 5126, "expectedType": expected_type,
            "storageWithinBufferView": storage_within_view,
            "bufferViewWithinBinaryChunk": view_within_binary,
            "uncompressedDenseAccessor": uncompressed_dense, "passed": passed,
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
            for primitive_index, primitive in enumerate(meshes[mesh_index].get("primitives", [])):
                attributes = primitive.get("attributes") or {}
                channels = sorted(key for key in attributes if key.startswith("TEXCOORD_"))
                position = accessor_proof(attributes.get("POSITION"), "VEC3")
                texcoord0 = accessor_proof(attributes.get("TEXCOORD_0"), "VEC2")
                texcoord1 = accessor_proof(attributes.get("TEXCOORD_1"), "VEC2")
                distinct = len({position["index"], texcoord0["index"], texcoord1["index"]}) == 3
                counts_match = position["count"] == texcoord0["count"] == texcoord1["count"]
                extensions = primitive.get("extensions") or {}
                uncompressed = not any(key in extensions for key in (
                    "KHR_draco_mesh_compression", "EXT_meshopt_compression",
                ))
                primitive_records.append({
                    "primitiveIndex": primitive_index, "texcoordChannels": channels,
                    "positionAccessor": position, "texcoord0Accessor": texcoord0,
                    "texcoord1Accessor": texcoord1,
                    "positionTexcoordAccessorsDistinct": distinct,
                    "positionTexcoordCountsMatch": counts_match,
                    "uncompressedPrimitive": uncompressed,
                    "exactTexcoord01Only": (
                        channels == ["TEXCOORD_0", "TEXCOORD_1"]
                        and position["passed"] and texcoord0["passed"]
                        and texcoord1["passed"] and distinct and counts_match and uncompressed
                    ),
                })
        records.append({
            "name": name, "meshIndex": mesh_index,
            "primarySemantic": extras.get("mf_uv_primary"),
            "secondarySemantic": extras.get("mf_uv_secondary"),
            "primitiveCount": len(primitive_records), "primitives": primitive_records,
        })
    actual = sorted(record["name"] for record in records)
    proof = {
        "schema": "MassfrontStage10ExportedTexcoordChannelProofV1",
        "method": "GLB_NODE_EXTRAS_PLUS_PRIMITIVE_ATTRIBUTE_INDEX_BINDING",
        "passed": (
            actual == expected and bool(records)
            and all(record["primarySemantic"] == "UV_GEN" for record in records)
            and all(record["secondarySemantic"] == "UVMap_Tile" for record in records)
            and all(record["primitiveCount"] > 0 for record in records)
            and all(primitive["exactTexcoord01Only"] for record in records
                    for primitive in record["primitives"])
        ),
        "authoredLayerOrder": ["UV_GEN", "UVMap_Tile"],
        "gltfChannelOrder": ["TEXCOORD_0", "TEXCOORD_1"],
        "freshBlenderImportLayerIndexForTexcoord1": 1,
        "requiredAccessorComponentType": 5126,
        "requiredTexcoordAccessorType": "VEC2",
        "texcoordCountsMustMatchPosition": True,
        "accessorsMustBeDistinct": True,
        "expectedRenderMeshes": expected, "actualRenderMeshes": actual,
        "exactRenderMeshMembership": actual == expected, "records": records,
    }
    proof["canonicalProofSha256"] = canonical_json_hash(proof)
    return proof


def tiled_uv_aggregate_proof_is_safe(
        proof, expected_scope, expected_artifact, expected_sha256,
        expected_render_meshes, pre_export_mesh_records=None):
    if not isinstance(proof, dict):
        return False
    per_mesh = proof.get("perMesh", [])
    metrics = [item.get("tiledUvMetrics", {}) for item in per_mesh]
    anchors = [item.get("tiledUvAnchorProof", {}) for item in per_mesh]
    post_export = expected_scope == "POST_EXPORT_FRESH_BLENDER_REIMPORT"
    expected_scene_construction = (
        "FACTORY_EMPTY_SCENE_IMPORT_OF_EXACT_REPAIR_GLB"
        if post_export else "IN_MEMORY_DERIVED_SCENE_BEFORE_GLTF_EXPORT"
    )
    names = [item.get("name") for item in per_mesh]
    artifact_safe = (
        proof.get("artifact") is None and proof.get("artifactSha256") is None
        if not post_export else
        proof.get("artifact") == expected_artifact
        and proof.get("artifactSha256") == expected_sha256
        and proof.get("artifactSha256AfterProof") == expected_sha256
        and proof.get("artifactSha256Stable") is True
        and (ROOT / expected_artifact).is_file()
        and sha256(ROOT / expected_artifact) == expected_sha256
        and proof.get("exportedTexcoordChannelProof")
        == recompute_exported_texcoord_channel_proof(
            ROOT / expected_artifact, expected_render_meshes,
        )
    )
    pre_mesh_safe = True
    if not post_export and pre_export_mesh_records is not None:
        expected_per_mesh = [{
            "name": item.get("name"),
            "uvLayers": ["UV_GEN", "UVMap_Tile"],
            "tiledUvLayerIndex": 1,
            "tiledUvLayerSemantic": "TEXCOORD_1",
            "tiledUvAnchorProof": item.get("tiledUvAnchorProof"),
            "tiledUvMetrics": item.get("tiledUvMetrics"),
        } for item in pre_export_mesh_records]
        pre_mesh_safe = per_mesh == expected_per_mesh
    return (
        proof.get("schema") == TILED_UV_AGGREGATE_PROOF_SCHEMA
        and proof.get("method") == "BLENDER_WORLD_CUBIC_UV_CONSTRUCTION_AND_JACOBIAN_V1"
        and proof.get("metricMethod") == TILED_UV_METRIC_METHOD
        and proof.get("anchorMethod") == TILED_UV_ANCHOR_METHOD
        and proof.get("scope") == expected_scope
        and proof.get("sceneConstruction") == expected_scene_construction
        and proof.get("artifactSha256Bound") is True and artifact_safe and pre_mesh_safe
        and proof.get("exactRenderMeshMembership") is True
        and proof.get("expectedRenderMeshes") == sorted(expected_render_meshes)
        and proof.get("actualRenderMeshes") == sorted(expected_render_meshes)
        and sorted(names) == sorted(expected_render_meshes)
        and proof.get("renderMeshCount") == len(per_mesh) > 0
        and len(names) == len(set(names))
        and all(
            item.get("tiledUvLayerIndex") == 1
            and item.get("tiledUvLayerSemantic") == "TEXCOORD_1"
            and (
                len(item.get("uvLayers", [])) == 2
                if post_export else
                item.get("uvLayers") == ["UV_GEN", "UVMap_Tile"]
            )
            for item in per_mesh
        )
        and all(tiled_uv_anchor_proof_is_safe(item, post_export) for item in anchors)
        and all(tiled_uv_metric_is_safe(item) for item in metrics)
        and proof.get("zeroUvAreaTriangles")
        == sum(item.get("zeroUvAreaTriangles", 0) for item in metrics) == 0
        and proof.get("exactZeroUvAreaTriangles")
        == sum(item.get("exactZeroUvAreaTriangles", 0) for item in metrics) == 0
        and proof.get("nonFiniteTriangles")
        == sum(item.get("nonFiniteTriangles", 0) for item in metrics) == 0
        and all(proof.get(field) is True for field in (
            "allAnchorsValid", "allTiledUvLayersAreTexcoord1", "allFinite",
            "allNonZero", "allScaleConsistent", "allWithinCubicStretchBound",
            "allMetricValid", "allValid",
        ))
        and canonical_hash_matches(proof, "canonicalProofSha256")
    )


def validate_repair(entry, repair_root, catalog_hash):
    report_path = repair_report_path(repair_root, entry)
    if not report_path.is_file():
        raise RuntimeError("missing V18 cleanup/UV repair report: " + str(report_path))
    repair = json.loads(report_path.read_text(encoding="utf-8"))
    expected = {
        "schema": REPAIR_SCHEMA, "pipelineVersion": REPAIR_PIPELINE_VERSION,
        "pipelineMode": REPAIR_PIPELINE_MODE, "key": entry["key"], "id": entry["id"],
        "family": entry["family"], "kind": entry["kind"],
    }
    for field, value in expected.items():
        if repair.get(field) != value:
            raise RuntimeError("repair report %s=%r expected %r" % (field, repair.get(field), value))
    if repair.get("catalogSha256") != catalog_hash:
        raise RuntimeError("repair report is not bound to the current catalog")
    if repair.get("status") not in REPAIR_ELIGIBLE_STATUSES:
        raise RuntimeError("repair status is not eligible for PBR binding")
    if (repair.get("catalogRepairLocked") is True
            or repair.get("catalogMetadataBlocked") is True):
        raise RuntimeError("excluded catalog entry reached the PBR repair validator")
    cleanup = repair.get("rasterCleanup", {})
    lineage = cleanup.get("lineageProof", {})
    render_mesh_names = sorted(
        mesh.get("name") for mesh in repair.get("meshes", [])
        if isinstance(mesh, dict) and isinstance(mesh.get("name"), str)
    )
    construction = repair.get("tiledUvConstructionContract", {})
    pre_export_tiled = repair.get("preExportTiledUvProof", {})
    post_export_tiled = repair.get("postExportTiledUvProof", {})
    post_export_texture_tiled = repair.get(
        "postExportTextureSourceTiledUvProof", {}
    )
    expected_repair_script = repo_relative(REPAIR_SCRIPT)
    expected_raster_script = repo_relative(RASTER_CLEANUP_SCRIPT)
    proof = {
        "pipelineScript": repair.get("pipelineScript") == expected_repair_script,
        "pipelineScriptSha256": repair.get("pipelineScriptSha256") == sha256(REPAIR_SCRIPT),
        "rasterCleanupScript": repair.get("rasterCleanupScript") == expected_raster_script,
        "rasterCleanupScriptSha256": (
            repair.get("rasterCleanupScriptSha256") == sha256(RASTER_CLEANUP_SCRIPT)
        ),
        "sourceUntouched": repair.get("sourceUntouched") is True,
        "canonicalTopologyUntouched": repair.get("canonicalTopologyUntouched") is True,
        "uvGeometryPreserved": repair.get("uvGeometryPreserved") is True,
        "repairDependencyContract": repair.get("repairDependencyContract") == raster_dependency_contract(),
        "materialSemanticContract": material_semantic_contract_green(entry, repair),
        "rasterAcceptanceContract": repair.get("rasterAcceptanceContract") == raster_acceptance_contract(),
        "rasterCleanupDependencyContract": (
            cleanup.get("dependencyContract") == raster_dependency_contract()
        ),
        "rasterCleanupContract": cleanup.get("contract") == raster_acceptance_contract(),
        "rasterCleanupPassed": cleanup.get("passed") is True,
        "acceptedPairsAfter": cleanup.get("acceptedPairsAfter") == 0,
        "exactDuplicatePairsAfter": cleanup.get("exactDuplicatePairsAfter") == 0,
        "remainingPairs": cleanup.get("remainingPairs") == 0,
        "stabilized": cleanup.get("stabilized") is True,
        "rasterCleanupProgress": raster_cleanup_progress_green(cleanup),
        "lineageProof": lineage_proof_green(cleanup),
        "lineageConsolidationMethod": (
            lineage.get("method")
            == "IMMUTABLE_SOURCE_TRIANGLE_PLANE_UNION_AND_CONSTRAINED_RETRIANGULATION"
        ),
        "lineageIdentity": lineage.get("lineage") == "INITIAL_OWNER_AND_SOURCE_TRIANGLE_ID",
        "lineageScope": (
            lineage.get("scope") == "IN_MEMORY_CLEANUP_AID_NOT_REQUIRED_BY_FINAL_ACCEPTANCE"
        ),
        "lineageCarried": lineage.get("carriedAcrossRetriangulation") is True,
        "lineageOwnerMaterial": (
            lineage.get("sameOwnerRequired") is True
            and lineage.get("sameMaterialRequired") is True
        ),
        "lineageNoWidthExemption": lineage.get("globalMinimumWidthExemption") is False,
        "artifactIndependentAcceptance": (
            lineage.get("finalArtifactAcceptanceDependsOnLineage") is False
        ),
        "lineageCounts": (
            isinstance(lineage.get("sameLineagePairsConsolidated"), int)
            and lineage.get("sameLineagePairsConsolidated") >= 0
            and isinstance(lineage.get("sameLineageCoherentCrossingPairsConsolidated"), int)
            and lineage.get("sameLineageCoherentCrossingPairsConsolidated") >= 0
        ),
        "overlapFaces": repair.get("overlapFaces") == 0,
        "allRenderMeshOverlapFaces": repair.get("allRenderMeshOverlapFaces") == 0,
        "uvOverlapProof": repair.get("uvOverlapProof", {}).get("passed") is True,
        "tiledUvMetrics": repair.get("tiledUvMetrics", {}).get("valid") is True,
        "tiledUvConstruction": tiled_uv_construction_contract_is_safe(construction),
        "preExportTiledUv": tiled_uv_aggregate_proof_is_safe(
            pre_export_tiled, "PRE_EXPORT_BLENDER_SCENE", None, None,
            render_mesh_names, repair.get("meshes", []),
        ),
        "postExportOutputTiledUv": tiled_uv_aggregate_proof_is_safe(
            post_export_tiled, "POST_EXPORT_FRESH_BLENDER_REIMPORT",
            repair.get("output"), repair.get("outputSha256"), render_mesh_names,
        ),
        "postExportTextureSourceTiledUv": tiled_uv_aggregate_proof_is_safe(
            post_export_texture_tiled, "POST_EXPORT_FRESH_BLENDER_REIMPORT",
            repair.get("textureSource"), repair.get("textureSourceSha256"),
            render_mesh_names,
        ),
    }
    if not all(proof.values()):
        raise RuntimeError("repair proof is not fully green: " + json.dumps(proof, sort_keys=True))
    if repair.get("source") != repo_relative(entry["canonicalSource"]):
        raise RuntimeError("repair canonical source does not match catalog")
    if repair.get("sourceSha256") != sha256(entry["canonicalSource"]):
        raise RuntimeError("repair canonical source hash does not match disk")
    source = ROOT / repair["output"]
    require_under(source, repair_root, "repair output")
    if not source.is_file() or repair.get("outputSha256") != sha256(source):
        raise RuntimeError("repair output hash mismatch")
    texture_source = ROOT / repair.get("textureSource", "")
    require_under(texture_source, repair_root, "repair texture source")
    if (not texture_source.is_file()
            or repair.get("textureSourceSha256") != sha256(texture_source)):
        raise RuntimeError("repair texture-source hash mismatch")
    uv_contract = repair.get("uvContract", {})
    if (uv_contract.get("UV_GEN", {}).get("gltfTexcoord") != 0
            or uv_contract.get("UVMap_Tile", {}).get("gltfTexcoord") != 1):
        raise RuntimeError("repair UV channel contract mismatch")
    return repair, report_path, source


def repair_census(entries, repair_root, catalog_hash, repair_summary):
    dispositions = []
    accepted_entries = []
    reports = {}
    failures = repair_summary.get("failures", [])
    if (not isinstance(failures, list)
            or len(failures) != repair_summary.get("failed")):
        raise RuntimeError("repair summary failure inventory is malformed")
    failures_by_key = {}
    for failure in failures:
        key = failure.get("key") if isinstance(failure, dict) else None
        if (not isinstance(key, str) or key in failures_by_key
                or not isinstance(failure.get("error"), str)
                or not failure.get("error")):
            raise RuntimeError("repair summary has an invalid or duplicate failure")
        failures_by_key[key] = failure
    for entry in sorted(entries, key=lambda item: item["key"]):
        report_path = repair_report_path(repair_root, entry)
        failure = failures_by_key.get(entry["key"])
        if failure is not None:
            source = Path(failure.get("source", "")).resolve()
            if source != entry["canonicalSource"].resolve():
                raise RuntimeError("repair failure source drift: " + entry["key"])
            source_name = entry["canonicalSource"].name
            source_stem = entry["canonicalSource"].stem
            artifact_candidates = (
                ("OUTPUT", repair_root / "models" / entry["family"] / source_name),
                ("TEXTURE_SOURCE", repair_root / "texture-sources" / entry["family"]
                 / (source_stem + "-LOD0-UVGEN.glb")),
                ("UNFINISHED_OUTPUT", repair_root / "unfinished-models"
                 / entry["family"] / source_name),
                ("UNFINISHED_TEXTURE_SOURCE", repair_root / "unfinished-texture-sources"
                 / entry["family"] / (source_stem + "-LOD0-UVGEN.glb")),
            )
            artifacts = []
            for role, artifact_path in artifact_candidates:
                require_under(artifact_path, repair_root, "failed repair artifact")
                if artifact_path.is_file():
                    artifacts.append({
                        "role": role, "path": repo_relative(artifact_path),
                        "sha256": sha256(artifact_path),
                        "bytes": artifact_path.stat().st_size,
                    })
            output_artifact = next(
                (item for item in artifacts if item["role"] in (
                    "OUTPUT", "UNFINISHED_OUTPUT",
                )), None,
            )
            texture_artifact = next(
                (item for item in artifacts if item["role"] in (
                    "TEXTURE_SOURCE", "UNFINISHED_TEXTURE_SOURCE",
                )), None,
            )
            dispositions.append({
                "key": entry["key"], "stage": "REPAIR",
                "disposition": "QUARANTINED_NO_PROMOTION",
                "status": "REPAIR_FAILED", "reasons": [failure["error"]],
                "report": None, "reportSha256": None,
                "output": output_artifact["path"] if output_artifact else None,
                "outputSha256": output_artifact["sha256"] if output_artifact else None,
                "textureSource": texture_artifact["path"] if texture_artifact else None,
                "textureSourceSha256": (
                    texture_artifact["sha256"] if texture_artifact else None
                ),
                "presentArtifacts": artifacts,
                "repairSummaryFailureSha256": canonical_json_hash(failure),
            })
            continue
        if not report_path.is_file():
            raise RuntimeError("repair census is missing report: " + str(report_path))
        repair = json.loads(report_path.read_text(encoding="utf-8"))
        expected = {
            "schema": REPAIR_SCHEMA,
            "pipelineVersion": REPAIR_PIPELINE_VERSION,
            "pipelineMode": REPAIR_PIPELINE_MODE,
            "pipelineScript": repo_relative(REPAIR_SCRIPT),
            "pipelineScriptSha256": sha256(REPAIR_SCRIPT),
            "rasterCleanupScript": repo_relative(RASTER_CLEANUP_SCRIPT),
            "rasterCleanupScriptSha256": sha256(RASTER_CLEANUP_SCRIPT),
            "catalogSha256": catalog_hash,
            "key": entry["key"], "id": entry["id"],
            "family": entry["family"], "kind": entry["kind"],
            "source": repo_relative(entry["canonicalSource"]),
            "sourceSha256": sha256(entry["canonicalSource"]),
        }
        drift = {
            field: {"actual": repair.get(field), "expected": value}
            for field, value in expected.items() if repair.get(field) != value
        }
        if drift:
            raise RuntimeError(
                "repair census identity drift for %s: %s"
                % (entry["key"], json.dumps(drift, separators=(",", ":"), sort_keys=True))
            )
        status = repair.get("status")
        if status not in (*REPAIR_ELIGIBLE_STATUSES, REPAIR_QUARANTINE_STATUS):
            raise RuntimeError("unknown repair disposition status: %s=%r" % (entry["key"], status))
        output = ROOT / repair.get("output", "")
        texture_source = ROOT / repair.get("textureSource", "")
        require_under(output, repair_root, "repair census output")
        require_under(texture_source, repair_root, "repair census texture source")
        if not output.is_file() or sha256(output) != repair.get("outputSha256"):
            raise RuntimeError("repair census output hash mismatch: " + entry["key"])
        if (not texture_source.is_file()
                or sha256(texture_source) != repair.get("textureSourceSha256")):
            raise RuntimeError("repair census texture-source hash mismatch: " + entry["key"])
        reasons = repair.get("statusReasons")
        if not isinstance(reasons, list):
            raise RuntimeError("repair status reasons are not a list: " + entry["key"])
        if status in REPAIR_ELIGIBLE_STATUSES:
            if reasons:
                raise RuntimeError("accepted repair item has quarantine reasons: " + entry["key"])
            validate_repair(entry, repair_root, catalog_hash)
            disposition = "ELIGIBLE_FOR_PBR"
            accepted_entries.append(entry)
        else:
            if not reasons:
                raise RuntimeError("quarantined repair item has no exact reason: " + entry["key"])
            disposition = "QUARANTINED_NO_PROMOTION"
        row = {
            "key": entry["key"], "stage": "REPAIR", "disposition": disposition,
            "status": status, "reasons": reasons,
            "report": repo_relative(report_path), "reportSha256": sha256(report_path),
            "output": repair["output"], "outputSha256": repair["outputSha256"],
            "textureSource": repair["textureSource"],
            "textureSourceSha256": repair["textureSourceSha256"],
        }
        dispositions.append(row)
        reports[entry["key"]] = repair
    if len(dispositions) != EXPECTED_FULL_SCHEDULE:
        raise RuntimeError(
            "repair census must account for exactly %d reports, got %d"
            % (EXPECTED_FULL_SCHEDULE, len(dispositions))
        )
    if set(failures_by_key) - {item["key"] for item in entries}:
        raise RuntimeError("repair summary failure key is outside the exact catalog")
    return dispositions, accepted_entries, reports


def repair_tiled_uv_bindings(repair):
    fields = {
        "ConstructionContract": repair["tiledUvConstructionContract"],
        "PreExportProof": repair["preExportTiledUvProof"],
        "PostExportOutputProof": repair["postExportTiledUvProof"],
        "PostExportTextureSourceProof": repair[
            "postExportTextureSourceTiledUvProof"
        ],
    }
    result = {}
    for label, value in fields.items():
        result["repairTiledUv" + label + "CanonicalJson"] = canonical_json_text(value)
        result["repairTiledUv" + label + "Sha256"] = canonical_json_hash(value)
    return result


def content_equivalent_rebind_candidate(
        enabled, entry, repair, source, destination, report_path, output_root):
    if not enabled or not report_path.is_file() or not destination.is_file():
        return None
    try:
        legacy_bytes = report_path.read_bytes()
        legacy = json.loads(legacy_bytes.decode("utf-8"))
        source_hash = sha256(source)
        output_hash = sha256(destination)
        required = {
            "schema": "MassfrontStage10ModelPbrV1",
            "pipelineVersion": PIPELINE_VERSION,
            "pipelineMode": PIPELINE_MODE,
            "mappingVersion": MAPPING_VERSION,
            "pipelineScriptSha256": (
                CONTENT_EQUIVALENT_REBIND_LEGACY_PIPELINE_SHA256
            ),
            "blenderVersion": bpy.app.version_string,
            "catalogSha256": repair["catalogSha256"],
            "key": entry["key"],
            "id": entry["id"],
            "family": entry["family"],
            "category": entry["category"],
            "kind": entry["kind"],
            "status": "PBR_TEXTURED",
            "runtimePromotionPerformed": False,
            "modelGenerationPerformed": False,
            "canonicalGeometryLocked": True,
            "canonicalSource": repo_relative(entry["canonicalSource"]),
            "canonicalSourceSha256": repair["sourceSha256"],
            "sourceSha256": source_hash,
            "output": repo_relative(destination),
            "outputSha256": output_hash,
        }
        drift = {
            field: {"actual": legacy.get(field), "expected": expected}
            for field, expected in required.items()
            if legacy.get(field) != expected
        }
        if drift:
            raise RuntimeError(
                "legacy report identity drift: "
                + json.dumps(drift, separators=(",", ":"), sort_keys=True)
            )
        if legacy.get("source") != repo_relative(source):
            raise RuntimeError("legacy report source path changed")
        if legacy.get("fullPbrCoverage", {}).get("passed") is not True:
            raise RuntimeError("legacy report never recorded full PBR coverage")
        if not isinstance(legacy.get("materials"), list) or not legacy["materials"]:
            raise RuntimeError("legacy report has no material manifest")
        map_count = 0
        for material in legacy["materials"]:
            if material.get("rasterization") != {
                    "alphaMode": "OPAQUE", "doubleSided": False,
                    "backfaceCulling": True}:
                raise RuntimeError("legacy material raster policy is not exact")
            for map_record in material.get("maps", {}).values():
                map_path = (ROOT / map_record.get("path", "")).resolve()
                require_under(
                    map_path, output_root / "pbr-reports/library/cells",
                    "legacy PBR map",
                )
                if (not map_path.is_file()
                        or sha256(map_path) != map_record.get("sha256")):
                    raise RuntimeError("legacy PBR map bytes changed: " + str(map_path))
                map_count += 1
        if not map_count:
            raise RuntimeError("legacy report has no map evidence")
        return {
            "report": legacy,
            "path": report_path,
            "rawBytes": legacy_bytes,
            "sha256": hashlib.sha256(legacy_bytes).hexdigest(),
            "bytes": len(legacy_bytes),
            "sourceSha256": source_hash,
            "sourceBytes": source.stat().st_size,
            "outputSha256": output_hash,
            "outputBytes": destination.stat().st_size,
            "mapCount": map_count,
        }
    except Exception as error:
        log("  content-equivalent candidate rejected; rebuilding: " + str(error))
        return None


def fresh_content_equivalent_rebind(
        entry, repair, repair_path, source, destination, report_path,
        catalog_hash, library, resume_contract_payload, resume_contract,
        candidate):
    """Re-report immutable PBR bytes only after all current proofs run fresh."""
    started = time.time()
    legacy = candidate["report"]
    clear_scene()
    bpy.ops.import_scene.gltf(filepath=str(source))
    all_meshes = mesh_objects()
    targets = render_meshes()
    if not targets:
        raise RuntimeError("repair output contains no render meshes")
    helper_meshes = [{"name": obj.name, "reason": derived_exclusion_reason(obj)}
                     for obj in all_meshes if derived_exclusion_reason(obj)]
    if helper_meshes:
        raise RuntimeError(
            "repair output retained preview-only helper geometry: "
            + json.dumps(helper_meshes)
        )
    renamed_uv_layers = []
    for obj in targets:
        layers = [layer.name for layer in obj.data.uv_layers]
        if len(layers) != 2:
            raise RuntimeError(
                "render mesh does not have the repair contract's exact two UV channels: "
                + obj.name
            )
        if layers != ["UV_GEN", "UVMap_Tile"]:
            obj.data.uv_layers[0].name = "__MF_STAGE10_UV0__"
            obj.data.uv_layers[1].name = "UVMap_Tile"
            obj.data.uv_layers[0].name = "UV_GEN"
            renamed_uv_layers.append({
                "mesh": obj.name, "from": layers,
                "to": ["UV_GEN", "UVMap_Tile"],
            })
        obj["mf_stage10_render"] = True
    for obj in all_meshes:
        if obj not in targets:
            obj["mf_stage10_render"] = False

    geometry_signatures = {
        obj.name_full: geometry_signature(obj) for obj in all_meshes
    }
    assignment_signatures = {
        obj.name_full: face_assignment_signature(obj) for obj in targets
    }
    original_slot_counts = {
        obj.name_full: len(obj.data.materials) for obj in targets
    }
    source_materials = list(bpy.data.materials)
    source_indices = {
        material: index for index, material in enumerate(source_materials)
    }
    usage = {}
    unassigned = []
    for obj in targets:
        if not obj.data.materials:
            unassigned.append(obj)
            continue
        for material in obj.data.materials:
            if material:
                usage.setdefault(material, set()).add(obj.name)
    classifications = [
        (
            material,
            classify_material(entry, material, source_indices[material], object_names),
        )
        for material, object_names in usage.items()
    ]
    if unassigned:
        classifications.append((
            None,
            classify_material(entry, None, -1, [obj.name for obj in unassigned]),
        ))
    library_contract = library.contract_for([
        evidence["semantic"] for _, evidence in classifications
    ])
    material_reports = []
    required_emissive_materials = set()
    expected_map_hashes = set()
    for _, evidence in classifications:
        tile = library_contract["cells"][evidence["semantic"]]
        material_name = "MF_PBR_%s_%03d_%s" % (
            re.sub(r"[^A-Za-z0-9]+", "_", entry["id"])[-42:],
            max(0, evidence["sourceIndex"]), evidence["semantic"],
        )
        if tile["emissiveRequired"]:
            required_emissive_materials.add(material_name)
        expected_map_hashes.update(
            item["sha256"] for item in tile["maps"].values()
        )
        report = dict(evidence)
        report.update({
            "outputMaterial": material_name,
            "materialId": tile["materialId"],
            "atlasCell": tile["atlasCell"],
            "emissiveRequired": tile["emissiveRequired"],
            "rasterization": {
                "alphaMode": "OPAQUE", "doubleSided": False,
                "backfaceCulling": True,
            },
            "maps": tile["maps"],
            "bindings": {
                "baseColorTexture": 1, "normalTexture": 1,
                "metallicRoughnessTexture": 1, "occlusionTexture": 1,
                "emissiveTexture": 1 if tile["emissiveRequired"] else None,
                "preservedPackedUv": {"name": "UV_GEN", "gltfTexcoord": 0},
                "tiledUv": {"name": "UVMap_Tile", "gltfTexcoord": 1},
            },
        })
        material_reports.append(report)
    if (legacy.get("library") != library_contract
            or legacy.get("materials") != material_reports):
        raise RuntimeError(
            "legacy output material/library contract does not match the fresh current contract"
        )
    for material in material_reports:
        for map_record in material["maps"].values():
            map_path = (ROOT / map_record["path"]).resolve()
            if not map_path.is_file() or sha256(map_path) != map_record["sha256"]:
                raise RuntimeError("current PBR map validation failed: " + str(map_path))

    source_artifact_identity = artifact_scene_identity(all_meshes)
    source_render_names = sorted(obj.name_full for obj in targets)
    source_triangles = sum(len(obj.data.loop_triangles) for obj in targets)
    bound_material_slot_counts = dict(original_slot_counts)
    for obj in unassigned:
        bound_material_slot_counts[obj.name_full] = 1
    coverage = validate_output_glb(
        destination, expected_map_hashes, required_emissive_materials,
        expected_material_names={
            material["outputMaterial"] for material in material_reports
        },
    )
    if coverage["renderTriangleCount"] != source_triangles:
        raise RuntimeError(
            "reused PBR render triangle count differs from the current repair input"
        )
    if (sha256(source) != candidate["sourceSha256"]
            or sha256(destination) != candidate["outputSha256"]):
        raise RuntimeError("content-equivalent input/output bytes changed during validation")

    clear_scene()
    bpy.ops.import_scene.gltf(filepath=str(destination))
    final_meshes = mesh_objects()
    final_render_meshes = [
        obj for obj in final_meshes if obj.get("mf_stage10_render") is True
    ]
    final_render_names = sorted(obj.name_full for obj in final_render_meshes)
    if final_render_names != source_render_names:
        raise RuntimeError(
            "reused PBR render-node membership changed: "
            + json.dumps({
                "source": source_render_names, "output": final_render_names,
            }, separators=(",", ":"))
        )
    final_artifact_identity = artifact_scene_identity(final_meshes)
    if final_artifact_identity != source_artifact_identity:
        changed = sorted(
            name for name in set(source_artifact_identity) | set(final_artifact_identity)
            if source_artifact_identity.get(name) != final_artifact_identity.get(name)
        )
        raise RuntimeError(
            "reused PBR changed topology/index/winding/position/normal/UV identity: "
            + ", ".join(changed[:20])
        )
    final_assignment_signatures = {
        obj.name_full: face_assignment_signature(obj) for obj in final_render_meshes
    }
    if final_assignment_signatures != assignment_signatures:
        raise RuntimeError("reused PBR changed face-to-material-slot assignments")
    final_material_slot_counts = {
        obj.name_full: len(obj.data.materials) for obj in final_render_meshes
    }
    if final_material_slot_counts != bound_material_slot_counts:
        raise RuntimeError("reused PBR changed bound material-slot counts")
    final_overlap_by_mesh = uv_overlap_stats(final_render_meshes, 0)
    final_packed_overlap_faces = sum(
        value["overlapFaces"] for value in final_overlap_by_mesh.values()
    )
    final_packed_overlap_loops = sum(
        value["overlapLoops"] for value in final_overlap_by_mesh.values()
    )
    final_tiled_metrics = {
        obj.name_full: tiled_uv_metrics(obj, 1) for obj in final_render_meshes
    }
    invalid_final_tiled = sorted(
        name for name, metrics in final_tiled_metrics.items()
        if metrics.get("valid") is not True
    )
    if final_packed_overlap_faces or invalid_final_tiled:
        raise RuntimeError(
            "reused PBR fresh UV validation failed: "
            + json.dumps({
                "packedOverlapFaces": final_packed_overlap_faces,
                "invalidTiledMeshes": invalid_final_tiled,
            }, separators=(",", ":"))
        )
    final_artifact_proof = {
        "method": "BLENDER_REIMPORT_FLOAT32_TOPOLOGY_INDEX_WINDING_POSITION_NORMAL_UV_IDENTITY_V1",
        "sourceMeshIdentity": source_artifact_identity,
        "finalMeshIdentity": final_artifact_identity,
        "sourceSceneIdentitySha256": canonical_json_hash(source_artifact_identity),
        "finalSceneIdentitySha256": canonical_json_hash(final_artifact_identity),
        "renderNodeNames": final_render_names,
        "topologyIndexWindingPositionNormalUvIdentity": True,
        "permittedChanges": ["MATERIAL_DEFINITIONS", "EMBEDDED_IMAGES"],
        "passed": True,
    }
    final_uv_proof = {
        "method": "FINAL_PBR_GLB_REIMPORT_OVERLAP_AND_WORLD_JACOBIAN_V1",
        "packedOverlapByMesh": final_overlap_by_mesh,
        "packedOverlapFaces": final_packed_overlap_faces,
        "packedOverlapLoops": final_packed_overlap_loops,
        "tiledMetricsByMesh": final_tiled_metrics,
        "allTiledMetricsValid": not invalid_final_tiled,
        "passed": final_packed_overlap_faces == 0 and not invalid_final_tiled,
    }
    legacy_archive = (
        report_path.parents[1] / "rebind-provenance" / "legacy"
        / entry["family"]
        / (
            safe_id(entry["id"]) + "." + candidate["sha256"]
            + ".legacy.json.provenance"
        )
    )
    require_under(
        legacy_archive, report_path.parents[1] / "rebind-provenance",
        "legacy PBR provenance archive",
    )
    legacy_archive.parent.mkdir(parents=True, exist_ok=True)
    if legacy_archive.is_file():
        if sha256(legacy_archive) != candidate["sha256"]:
            raise RuntimeError("legacy PBR provenance archive hash collision")
    else:
        legacy_archive.write_bytes(candidate["rawBytes"])
    provenance = {
        "schema": CONTENT_EQUIVALENT_REBIND_SCHEMA,
        "method": CONTENT_EQUIVALENT_REBIND_METHOD,
        "legacyReport": {
            "path": repo_relative(legacy_archive),
            "sha256": candidate["sha256"],
            "bytes": candidate["bytes"],
            "pipelineScriptSha256": legacy["pipelineScriptSha256"],
            "sourceSha256": legacy["sourceSha256"],
            "outputSha256": legacy["outputSha256"],
        },
        "currentValidationPipeline": {
            "path": repo_relative(Path(__file__)),
            "sha256": sha256(Path(__file__)),
            "blenderVersion": bpy.app.version_string,
        },
        "currentRepairInput": {
            "path": repo_relative(source),
            "sha256": candidate["sourceSha256"],
            "bytes": candidate["sourceBytes"],
        },
        "reusedPbrOutput": {
            "path": repo_relative(destination),
            "sha256": candidate["outputSha256"],
            "bytes": candidate["outputBytes"],
        },
        "byteIdenticalRepairInput": True,
        "byteIdenticalPbrOutput": True,
        "legacyMapRecordCountRevalidated": candidate["mapCount"],
        "legacyMaterialManifestSha256": canonical_json_hash(legacy["materials"]),
        "currentMaterialManifestSha256": canonical_json_hash(material_reports),
        "legacyLibraryContractSha256": legacy["library"]["contractSha256"],
        "currentLibraryContractSha256": library_contract["contractSha256"],
        "freshValidation": {
            "sourceImported": True,
            "pbrOutputImported": True,
            "glbMapCoverageValidated": True,
            "opaqueSingleSidedValidated": True,
            "topologyIndexWindingPositionNormalUvIdentityValidated": True,
            "materialSlotCountsAndFaceAssignmentsValidated": True,
            "packedUvOverlapValidated": True,
            "tiledUvWorldJacobianValidated": True,
            "sourceSceneIdentitySha256": canonical_json_hash(
                source_artifact_identity
            ),
            "finalSceneIdentitySha256": canonical_json_hash(
                final_artifact_identity
            ),
            "fullPbrCoverageSha256": canonical_json_hash(coverage),
            "finalUvProofSha256": canonical_json_hash(final_uv_proof),
        },
        "previousReportUsedAsCurrentAcceptanceEvidence": False,
        "outputReexported": False,
        "reportRewritten": True,
        "passed": True,
    }
    provenance_hash = canonical_json_hash(provenance)
    uv_metrics = repair.get("tiledUvMetrics", {})
    mesh_metrics = [
        mesh.get("tiledUvMetrics", {}) for mesh in repair.get("meshes", [])
    ]
    result = {
        "schema": "MassfrontStage10ModelPbrV1",
        "pipelineVersion": PIPELINE_VERSION, "pipelineMode": PIPELINE_MODE,
        "mappingVersion": MAPPING_VERSION, "blenderVersion": bpy.app.version_string,
        "pipelineScriptSha256": sha256(Path(__file__)),
        "resumeContractSha256": resume_contract,
        "catalogSha256": catalog_hash, "key": entry["key"], "id": entry["id"],
        "family": entry["family"], "category": entry["category"],
        "kind": entry["kind"], "status": "PBR_TEXTURED",
        "artifactDisposition": "CONTENT_EQUIVALENT_REBOUND",
        "contentEquivalentRebind": provenance,
        "contentEquivalentRebindSha256": provenance_hash,
        "runtimePromotionPerformed": False, "modelGenerationPerformed": False,
        "canonicalGeometryLocked": True,
        "productionSetPolicy": PRODUCTION_SET_POLICY,
        "resumeContract": resume_contract_payload,
        "resumeContractCanonicalJson": canonical_json_text(resume_contract_payload),
        "canonicalSource": repo_relative(entry["canonicalSource"]),
        "canonicalSourceSha256": repair["sourceSha256"],
        "repairReport": repo_relative(repair_path),
        "repairReportSha256": sha256(repair_path),
        "repairPipelineVersion": repair["pipelineVersion"],
        "repairPipelineScript": repair["pipelineScript"],
        "repairPipelineScriptSha256": repair["pipelineScriptSha256"],
        "rasterCleanupScript": repair["rasterCleanupScript"],
        "rasterCleanupScriptSha256": repair["rasterCleanupScriptSha256"],
        "repairDependencyContract": repair["repairDependencyContract"],
        "rasterAcceptanceContract": repair["rasterAcceptanceContract"],
        "repairRasterCleanupSha256": canonical_json_hash(repair["rasterCleanup"]),
        "repairLineageProofSha256": canonical_json_hash(
            repair["rasterCleanup"]["lineageProof"]
        ),
        "repairMaterialSemanticContractSha256": canonical_json_hash(
            repair["materialSemanticContract"]
        ),
        "repairRasterCleanupCanonicalJson": canonical_json_text(
            repair["rasterCleanup"]
        ),
        "repairLineageProofCanonicalJson": canonical_json_text(
            repair["rasterCleanup"]["lineageProof"]
        ),
        "repairMaterialSemanticContractCanonicalJson": canonical_json_text(
            repair["materialSemanticContract"]
        ),
        **repair_tiled_uv_bindings(repair),
        "postExportArtifactIdentitySha256": canonical_json_hash(
            final_artifact_proof
        ),
        "finalUvProofCanonicalJson": canonical_json_text(final_uv_proof),
        "finalUvProofSha256": canonical_json_hash(final_uv_proof),
        "source": repo_relative(source), "sourceSha256": repair["outputSha256"],
        "output": repo_relative(destination),
        "outputSha256": candidate["outputSha256"],
        "library": library_contract, "materials": material_reports,
        "fullPbrCoverage": coverage,
        "preservation": {
            "topology": True, "winding": True, "normals": True,
            "transforms": True, "materialSlotFaceAssignments": True,
            "sourceGeometrySignatures": geometry_signatures,
            "boundGeometrySignatures": geometry_signatures,
            "sourceMaterialAssignmentSignatures": assignment_signatures,
            "boundMaterialAssignmentSignatures": assignment_signatures,
            "sourceMaterialSlotCounts": original_slot_counts,
            "boundMaterialSlotCounts": bound_material_slot_counts,
            "synthesizedPreviouslyUnassignedSlots": [
                obj.name_full for obj in unassigned
            ],
            "postExportArtifactIdentity": final_artifact_proof,
        },
        "cleanup": {
            "removedRenderGeometry": 0, "changedTopology": False,
            "changedNormals": False, "changedTransforms": False,
            "previewHelperMeshesFound": helper_meshes,
            "renamedImportedUvLayerMetadata": renamed_uv_layers,
            "oldMaterialDatablocksNotExported": len(source_materials),
        },
        "uv": {
            "packed": {"name": "UV_GEN", "gltfTexcoord": 0, "preserved": True},
            "tiled": {
                "name": "UVMap_Tile", "gltfTexcoord": 1, "metresPerTile": 4.0,
            },
            "overlapFaces": repair["overlapFaces"],
            "allRenderMeshOverlapFaces": repair["allRenderMeshOverlapFaces"],
            "maxStretchRatio": uv_metrics.get("maxStretchRatio"),
            "maxAreaScaleRelativeError": uv_metrics.get(
                "maxAreaScaleRelativeError"
            ),
            "meshMetrics": mesh_metrics,
            "finalPbrArtifact": final_uv_proof,
            "passed": final_uv_proof["passed"],
        },
        "durationSeconds": round(time.time() - started, 3),
    }
    contract_payload = {
        "resume": resume_contract, "library": library_contract["contractSha256"],
        "materials": material_reports, "preservation": result["preservation"],
        "uv": result["uv"],
        "coverage": {
            key: value for key, value in coverage.items()
            if key != "embeddedImages"
        },
    }
    result["contract"] = contract_payload
    result["contractCanonicalJson"] = canonical_json_text(contract_payload)
    result["contractSha256"] = canonical_json_hash(contract_payload)
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    return result


def export_scene(path):
    path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=str(path), export_format="GLB", use_selection=False,
        export_apply=False, export_extras=True, export_texcoords=True,
        export_normals=True, export_materials="EXPORT", export_cameras=False,
        export_lights=False, export_yup=True, export_image_format="AUTO",
        export_keep_originals=False,
    )


def process(
        entry, repair_root, output_root, catalog_hash, library, force=False,
        rebind_content_equivalent=False):
    repair, repair_path, source = validate_repair(entry, repair_root, catalog_hash)
    repair_hash = sha256(repair_path)
    destination = pbr_output_path(output_root, entry, repair)
    report_path = pbr_report_path(output_root, entry)
    require_under(destination, output_root, "PBR output")
    require_under(report_path, output_root, "PBR report")
    tiled_uv_bindings = repair_tiled_uv_bindings(repair)
    resume_contract_payload = {
        "pipelineVersion": PIPELINE_VERSION, "pipelineMode": PIPELINE_MODE,
        "pipelineScriptSha256": sha256(Path(__file__)), "mappingVersion": MAPPING_VERSION,
        "contentEquivalentRebindPolicy": {
            "schema": CONTENT_EQUIVALENT_REBIND_SCHEMA,
            "method": CONTENT_EQUIVALENT_REBIND_METHOD,
            "legacyPipelineScriptSha256": (
                CONTENT_EQUIVALENT_REBIND_LEGACY_PIPELINE_SHA256
            ),
            "requested": rebind_content_equivalent,
        },
        "productionSetPolicy": PRODUCTION_SET_POLICY,
        "blenderVersion": bpy.app.version_string,
        "catalogSha256": catalog_hash, "repairReportSha256": repair_hash,
        "repairPipelineScriptSha256": repair["pipelineScriptSha256"],
        "rasterCleanupScriptSha256": repair["rasterCleanupScriptSha256"],
        "repairRasterCleanupSha256": canonical_json_hash(repair["rasterCleanup"]),
        "repairLineageProofSha256": canonical_json_hash(repair["rasterCleanup"]["lineageProof"]),
        "repairMaterialSemanticContractSha256": canonical_json_hash(
            repair["materialSemanticContract"]
        ),
        "repairTiledUvConstructionContractSha256": tiled_uv_bindings[
            "repairTiledUvConstructionContractSha256"
        ],
        "repairTiledUvPreExportProofSha256": tiled_uv_bindings[
            "repairTiledUvPreExportProofSha256"
        ],
        "repairTiledUvPostExportOutputProofSha256": tiled_uv_bindings[
            "repairTiledUvPostExportOutputProofSha256"
        ],
        "repairTiledUvPostExportTextureSourceProofSha256": tiled_uv_bindings[
            "repairTiledUvPostExportTextureSourceProofSha256"
        ],
        "sourceSha256": sha256(source), "librarySourceContractSha256": library.source_contract_hash(),
    }
    resume_contract = canonical_json_hash(resume_contract_payload)
    if not force and report_path.is_file():
        previous = json.loads(report_path.read_text(encoding="utf-8"))
        if (previous.get("schema") == "MassfrontStage10ModelPbrV1"
                and previous.get("pipelineVersion") == PIPELINE_VERSION
                and previous.get("pipelineMode") == PIPELINE_MODE
                and previous.get("mappingVersion") == MAPPING_VERSION
                and previous.get("status") == "PBR_TEXTURED"
                and previous.get("blenderVersion") == bpy.app.version_string
                and previous.get("resumeContract") == resume_contract_payload
                and previous.get("resumeContractSha256") == resume_contract
                and destination.is_file()
                and previous.get("outputSha256") == sha256(destination)
                and all((ROOT / item["path"]).is_file() and sha256(ROOT / item["path"]) == item["sha256"]
                        for material in previous.get("materials", [])
                        for item in material.get("maps", {}).values())):
            previous["resumedFromExisting"] = True
            return previous

    candidate = content_equivalent_rebind_candidate(
        rebind_content_equivalent, entry, repair, source, destination,
        report_path, output_root,
    )
    if candidate is not None:
        try:
            return fresh_content_equivalent_rebind(
                entry, repair, repair_path, source, destination, report_path,
                catalog_hash, library, resume_contract_payload, resume_contract,
                candidate,
            )
        except Exception as error:
            log(
                "  fresh content-equivalent validation failed; rebuilding: "
                + str(error)
            )

    started = time.time()
    clear_scene()
    bpy.ops.import_scene.gltf(filepath=str(source))
    all_meshes = mesh_objects()
    targets = render_meshes()
    if not targets:
        raise RuntimeError("repair output contains no render meshes")
    helper_meshes = [{"name": obj.name, "reason": derived_exclusion_reason(obj)}
                     for obj in all_meshes if derived_exclusion_reason(obj)]
    if helper_meshes:
        raise RuntimeError("repair output retained preview-only helper geometry: " + json.dumps(helper_meshes))
    renamed_uv_layers = []
    for obj in targets:
        layers = [layer.name for layer in obj.data.uv_layers]
        if len(layers) != 2:
            raise RuntimeError("render mesh does not have the repair contract's exact two UV channels: " + obj.name)
        # glTF encodes TEXCOORD order, not Blender's UV-layer labels.  Import
        # therefore restores the proven pair as generic names.  Relabel the
        # two layers by their already-verified order without touching a UV.
        if layers != ["UV_GEN", "UVMap_Tile"]:
            obj.data.uv_layers[0].name = "__MF_STAGE10_UV0__"
            obj.data.uv_layers[1].name = "UVMap_Tile"
            obj.data.uv_layers[0].name = "UV_GEN"
            renamed_uv_layers.append({"mesh": obj.name, "from": layers, "to": ["UV_GEN", "UVMap_Tile"]})
        obj["mf_stage10_render"] = True
    for obj in all_meshes:
        if obj not in targets:
            obj["mf_stage10_render"] = False

    geometry_before = {obj.name_full: geometry_signature(obj) for obj in all_meshes}
    assignment_before = {obj.name_full: face_assignment_signature(obj) for obj in targets}
    original_slot_counts = {obj.name_full: len(obj.data.materials) for obj in targets}
    source_materials = list(bpy.data.materials)
    source_indices = {material: index for index, material in enumerate(source_materials)}
    usage = {}
    unassigned = []
    for obj in targets:
        if not obj.data.materials:
            unassigned.append(obj)
            continue
        for material in obj.data.materials:
            if material:
                usage.setdefault(material, set()).add(obj.name)
    classifications = []
    for material, object_names in usage.items():
        source_index = source_indices[material]
        classifications.append((material, classify_material(entry, material, source_index, object_names)))
    if unassigned:
        evidence = classify_material(entry, None, -1, [obj.name for obj in unassigned])
        classifications.append((None, evidence))
    semantics = [evidence["semantic"] for _, evidence in classifications]
    library_contract = library.contract_for(semantics)
    created = {}
    reports = []
    required_emissive_materials = set()
    expected_map_hashes = set()
    image_replacements = {}
    for material, evidence in classifications:
        tile = library_contract["cells"][evidence["semantic"]]
        material_name = "MF_PBR_%s_%03d_%s" % (
            re.sub(r"[^A-Za-z0-9]+", "_", entry["id"])[-42:],
            max(0, evidence["sourceIndex"]), evidence["semantic"],
        )
        pbr = make_pbr_material(material_name, tile)
        created[material] = pbr
        if tile["emissiveRequired"]:
            required_emissive_materials.add(material_name)
        expected_map_hashes.update(item["sha256"] for item in tile["maps"].values())
        for item in tile["maps"].values():
            tile_path = ROOT / item["path"]
            image_replacements[tile_path.stem] = tile_path.read_bytes()
        report = dict(evidence)
        report.update({
            "outputMaterial": material_name, "materialId": tile["materialId"],
            "atlasCell": tile["atlasCell"], "emissiveRequired": tile["emissiveRequired"],
            "rasterization": {
                "alphaMode": "OPAQUE", "doubleSided": False, "backfaceCulling": True,
            },
            "maps": tile["maps"],
            "bindings": {
                "baseColorTexture": 1, "normalTexture": 1,
                "metallicRoughnessTexture": 1, "occlusionTexture": 1,
                "emissiveTexture": 1 if tile["emissiveRequired"] else None,
                "preservedPackedUv": {"name": "UV_GEN", "gltfTexcoord": 0},
                "tiledUv": {"name": "UVMap_Tile", "gltfTexcoord": 1},
            },
        })
        reports.append(report)

    for obj in targets:
        if not obj.data.materials:
            obj.data.materials.append(created[None])
        else:
            for slot_index, material in enumerate(list(obj.data.materials)):
                if material is None:
                    raise RuntimeError("partially unassigned material slot is ambiguous: %s[%d]" % (obj.name, slot_index))
                obj.data.materials[slot_index] = created[material]
    assignment_after = {obj.name_full: face_assignment_signature(obj) for obj in targets}
    geometry_after = {obj.name_full: geometry_signature(obj) for obj in all_meshes}
    synthesized_slots = [obj.name_full for obj in unassigned]
    # Geometry signatures include face material indices but not material data.
    # Adding the sole missing slot leaves every face's index at zero; all other
    # slot counts and every face-to-slot assignment must remain byte-identical.
    topology_preserved = geometry_before == geometry_after
    assignments_preserved = topology_preserved and all(
        assignment_before[name] == assignment_after[name] for name in assignment_before
    ) and all(
        original_slot_counts[name] == len(next(obj for obj in targets if obj.name_full == name).data.materials)
        for name in original_slot_counts if name not in synthesized_slots
    )
    if not topology_preserved or not assignments_preserved:
        raise RuntimeError("PBR binding changed geometry or face material assignments")

    source_artifact_identity = artifact_scene_identity(all_meshes)
    source_render_names = sorted(obj.name_full for obj in targets)
    source_triangles = sum(len(obj.data.loop_triangles) for obj in targets)
    bound_material_slot_counts = {
        obj.name_full: len(obj.data.materials) for obj in targets
    }
    destination.parent.mkdir(parents=True, exist_ok=True)
    export_scene(destination)
    replace_embedded_glb_images(destination, image_replacements)
    if sha256(source) != repair["outputSha256"] or sha256(entry["canonicalSource"]) != repair["sourceSha256"]:
        raise RuntimeError("a source changed during derived PBR export")
    coverage = validate_output_glb(
        destination, expected_map_hashes, required_emissive_materials,
        expected_material_names={report["outputMaterial"] for report in reports},
    )
    if coverage["renderTriangleCount"] != source_triangles:
        raise RuntimeError("render triangle count changed across PBR export")
    clear_scene()
    bpy.ops.import_scene.gltf(filepath=str(destination))
    final_meshes = mesh_objects()
    final_render_meshes = [
        obj for obj in final_meshes if obj.get("mf_stage10_render") is True
    ]
    final_render_names = sorted(obj.name_full for obj in final_render_meshes)
    if final_render_names != source_render_names:
        raise RuntimeError(
            "final PBR GLB render-node membership changed: %s"
            % json.dumps({"before": source_render_names, "after": final_render_names})
        )
    final_artifact_identity = artifact_scene_identity(final_meshes)
    if final_artifact_identity != source_artifact_identity:
        changed = sorted(
            set(source_artifact_identity) | set(final_artifact_identity)
        )
        changed = [
            name for name in changed
            if source_artifact_identity.get(name) != final_artifact_identity.get(name)
        ]
        raise RuntimeError(
            "final PBR GLB changed topology/index/winding/position/normal/UV identity: "
            + ", ".join(changed[:20])
        )
    final_overlap_by_mesh = uv_overlap_stats(final_render_meshes, 0)
    final_packed_overlap_faces = sum(
        value["overlapFaces"] for value in final_overlap_by_mesh.values()
    )
    final_packed_overlap_loops = sum(
        value["overlapLoops"] for value in final_overlap_by_mesh.values()
    )
    final_tiled_metrics = {
        obj.name_full: tiled_uv_metrics(obj, 1) for obj in final_render_meshes
    }
    invalid_final_tiled = sorted(
        name for name, metrics in final_tiled_metrics.items()
        if metrics.get("valid") is not True
    )
    if final_packed_overlap_faces or invalid_final_tiled:
        raise RuntimeError(
            "final PBR GLB UV verification failed: "
            + json.dumps({
                "packedOverlapFaces": final_packed_overlap_faces,
                "invalidTiledMeshes": invalid_final_tiled,
            })
        )
    final_artifact_proof = {
        "method": "BLENDER_REIMPORT_FLOAT32_TOPOLOGY_INDEX_WINDING_POSITION_NORMAL_UV_IDENTITY_V1",
        "sourceMeshIdentity": source_artifact_identity,
        "finalMeshIdentity": final_artifact_identity,
        "sourceSceneIdentitySha256": canonical_json_hash(source_artifact_identity),
        "finalSceneIdentitySha256": canonical_json_hash(final_artifact_identity),
        "renderNodeNames": final_render_names,
        "topologyIndexWindingPositionNormalUvIdentity": True,
        "permittedChanges": ["MATERIAL_DEFINITIONS", "EMBEDDED_IMAGES"],
        "passed": True,
    }
    final_uv_proof = {
        "method": "FINAL_PBR_GLB_REIMPORT_OVERLAP_AND_WORLD_JACOBIAN_V1",
        "packedOverlapByMesh": final_overlap_by_mesh,
        "packedOverlapFaces": final_packed_overlap_faces,
        "packedOverlapLoops": final_packed_overlap_loops,
        "tiledMetricsByMesh": final_tiled_metrics,
        "allTiledMetricsValid": not invalid_final_tiled,
        "passed": final_packed_overlap_faces == 0 and not invalid_final_tiled,
    }
    uv_metrics = repair.get("tiledUvMetrics", {})
    mesh_metrics = [mesh.get("tiledUvMetrics", {}) for mesh in repair.get("meshes", [])]
    result = {
        "schema": "MassfrontStage10ModelPbrV1",
        "pipelineVersion": PIPELINE_VERSION, "pipelineMode": PIPELINE_MODE,
        "mappingVersion": MAPPING_VERSION, "blenderVersion": bpy.app.version_string,
        "pipelineScriptSha256": sha256(Path(__file__)), "resumeContractSha256": resume_contract,
        "catalogSha256": catalog_hash, "key": entry["key"], "id": entry["id"],
        "family": entry["family"], "category": entry["category"], "kind": entry["kind"],
        "status": "PBR_TEXTURED", "runtimePromotionPerformed": False,
        "artifactDisposition": "REBUILT",
        "contentEquivalentRebind": None,
        "contentEquivalentRebindSha256": None,
        "modelGenerationPerformed": False, "canonicalGeometryLocked": True,
        "productionSetPolicy": PRODUCTION_SET_POLICY,
        "resumeContract": resume_contract_payload,
        "resumeContractCanonicalJson": canonical_json_text(resume_contract_payload),
        "canonicalSource": repo_relative(entry["canonicalSource"]),
        "canonicalSourceSha256": repair["sourceSha256"],
        "repairReport": repo_relative(repair_path), "repairReportSha256": repair_hash,
        "repairPipelineVersion": repair["pipelineVersion"],
        "repairPipelineScript": repair["pipelineScript"],
        "repairPipelineScriptSha256": repair["pipelineScriptSha256"],
        "rasterCleanupScript": repair["rasterCleanupScript"],
        "rasterCleanupScriptSha256": repair["rasterCleanupScriptSha256"],
        "repairDependencyContract": repair["repairDependencyContract"],
        "rasterAcceptanceContract": repair["rasterAcceptanceContract"],
        "repairRasterCleanupSha256": canonical_json_hash(repair["rasterCleanup"]),
        "repairLineageProofSha256": canonical_json_hash(repair["rasterCleanup"]["lineageProof"]),
        "repairMaterialSemanticContractSha256": canonical_json_hash(
            repair["materialSemanticContract"]
        ),
        "repairRasterCleanupCanonicalJson": canonical_json_text(repair["rasterCleanup"]),
        "repairLineageProofCanonicalJson": canonical_json_text(
            repair["rasterCleanup"]["lineageProof"]
        ),
        "repairMaterialSemanticContractCanonicalJson": canonical_json_text(
            repair["materialSemanticContract"]
        ),
        **tiled_uv_bindings,
        "postExportArtifactIdentitySha256": canonical_json_hash(final_artifact_proof),
        "finalUvProofCanonicalJson": canonical_json_text(final_uv_proof),
        "finalUvProofSha256": canonical_json_hash(final_uv_proof),
        "source": repo_relative(source), "sourceSha256": repair["outputSha256"],
        "output": repo_relative(destination), "outputSha256": sha256(destination),
        "library": library_contract,
        "materials": reports,
        "fullPbrCoverage": coverage,
        "preservation": {
            "topology": topology_preserved, "winding": topology_preserved,
            "normals": topology_preserved, "transforms": topology_preserved,
            "materialSlotFaceAssignments": assignments_preserved,
            "sourceGeometrySignatures": geometry_before,
            "boundGeometrySignatures": geometry_after,
            "sourceMaterialAssignmentSignatures": assignment_before,
            "boundMaterialAssignmentSignatures": assignment_after,
            "sourceMaterialSlotCounts": original_slot_counts,
            "boundMaterialSlotCounts": bound_material_slot_counts,
            "synthesizedPreviouslyUnassignedSlots": synthesized_slots,
            "postExportArtifactIdentity": final_artifact_proof,
        },
        "cleanup": {
            "removedRenderGeometry": 0, "changedTopology": False,
            "changedNormals": False, "changedTransforms": False,
            "previewHelperMeshesFound": helper_meshes,
            "renamedImportedUvLayerMetadata": renamed_uv_layers,
            "oldMaterialDatablocksNotExported": len(source_materials),
        },
        "uv": {
            "packed": {"name": "UV_GEN", "gltfTexcoord": 0, "preserved": True},
            "tiled": {"name": "UVMap_Tile", "gltfTexcoord": 1, "metresPerTile": 4.0},
            "overlapFaces": repair["overlapFaces"],
            "allRenderMeshOverlapFaces": repair["allRenderMeshOverlapFaces"],
            "maxStretchRatio": uv_metrics.get("maxStretchRatio"),
            "maxAreaScaleRelativeError": uv_metrics.get("maxAreaScaleRelativeError"),
            "meshMetrics": mesh_metrics,
            "finalPbrArtifact": final_uv_proof,
            "passed": final_uv_proof["passed"],
        },
        "durationSeconds": round(time.time() - started, 3),
    }
    contract_payload = {
        "resume": resume_contract, "library": library_contract["contractSha256"],
        "materials": reports, "preservation": result["preservation"], "uv": result["uv"],
        "coverage": {key: value for key, value in coverage.items() if key != "embeddedImages"},
    }
    result["contract"] = contract_payload
    result["contractCanonicalJson"] = canonical_json_text(contract_payload)
    result["contractSha256"] = canonical_json_hash(contract_payload)
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    return result


def exclusion_manifest(exclusions):
    return [{
        "key": item["key"], "id": item["id"], "family": item["family"],
        "kind": item["kind"], "reason": item["reason"],
        "source": repo_relative(item["canonicalSource"]),
        "sourceSha256": sha256(item["canonicalSource"]),
    } for item in exclusions]


def write_summary(
        output_root, results, failures, total, started, args, catalog_hash,
        counts, exclusions, repair_summary_binding, repair_dispositions,
        scheduled_keys):
    statuses = {}
    dispositions = {}
    families = {}
    semantics = {}
    items = []
    for result in results:
        statuses[result["status"]] = statuses.get(result["status"], 0) + 1
        disposition = result.get("artifactDisposition")
        dispositions[disposition] = dispositions.get(disposition, 0) + 1
        family = families.setdefault(result["family"], {"total": 0, "semantics": {}})
        family["total"] += 1
        for material in result.get("materials", []):
            semantic = material["semantic"]
            semantics[semantic] = semantics.get(semantic, 0) + 1
            family["semantics"][semantic] = family["semantics"].get(semantic, 0) + 1
        item_path = pbr_report_path(output_root, result)
        items.append({
            "key": result["key"], "stage": "PBR",
            "disposition": "PRODUCTION_READY", "status": result["status"],
            "reasons": [],
            "artifactDisposition": disposition,
            "contentEquivalentRebindSha256": result.get(
                "contentEquivalentRebindSha256"
            ),
            "report": repo_relative(item_path),
            "reportSha256": sha256(item_path) if item_path.is_file() else None,
            "output": result["output"], "outputSha256": result["outputSha256"],
        })
    items.sort(key=lambda item: item["key"])
    repair_dispositions = sorted(
        repair_dispositions, key=lambda item: (item["key"], item["stage"]),
    )
    input_manifest = [
        item for item in repair_dispositions
        if item["disposition"] == "ELIGIBLE_FOR_PBR"
        and item["key"] in scheduled_keys
    ]
    repair_quarantine = [
        item for item in repair_dispositions
        if item["disposition"] == "QUARANTINED_NO_PROMOTION"
    ]
    repair_by_key = {item["key"]: item for item in repair_dispositions}
    stage_quarantine = []
    for failure in failures:
        source = repair_by_key.get(failure["key"])
        if source is None or source["disposition"] != "ELIGIBLE_FOR_PBR":
            raise RuntimeError("PBR failure is not bound to an eligible repair input")
        stage_quarantine.append({
            "key": failure["key"], "stage": "PBR",
            "disposition": "QUARANTINED_NO_PROMOTION",
            "status": "PBR_FAILED", "reasons": [failure["error"]],
            "report": source["report"], "reportSha256": source["reportSha256"],
            "output": source["output"], "outputSha256": source["outputSha256"],
            "textureSource": source["textureSource"],
            "textureSourceSha256": source["textureSourceSha256"],
        })
    quarantine_manifest = sorted(
        [*repair_quarantine, *stage_quarantine],
        key=lambda item: (item["key"], item["stage"]),
    )
    complete = (
        len(results) + len(failures) == total
        and len({item["key"] for item in items}) == len(items)
        and len(input_manifest) == total
    )
    summary = {
        "schema": "MassfrontStage10ModelPbrSummaryV1",
        "pipelineVersion": PIPELINE_VERSION, "pipelineMode": PIPELINE_MODE,
        "mappingVersion": MAPPING_VERSION, "blenderVersion": bpy.app.version_string,
        "sourcePolicy": "CANONICAL_GEOMETRY_LOCKED_DERIVED_PBR_OUTPUT_ONLY",
        "runtimePromotionPerformed": False, "catalogSha256": catalog_hash,
        "productionSetPolicy": PRODUCTION_SET_POLICY,
        "repairSummary": repair_summary_binding,
        "repairMaterialSemanticContract": repair_summary_binding[
            "materialSemanticContract"
        ],
        "repairMaterialSemanticContractSha256": repair_summary_binding[
            "materialSemanticContractSha256"
        ],
        "selection": {
            "families": sorted(args.family), "only": sorted(args.only),
            "includeSpline": args.include_spline, "limit": args.limit,
            "fullCatalog": not args.family and not args.only and args.include_spline and not args.limit,
        },
        "catalogCounts": counts, "totalScheduled": total,
        "processed": len(results), "failed": len(failures),
        "status": "PASS_WITH_QUARANTINE" if quarantine_manifest else "PASS",
        "passed": complete,
        "statusCounts": statuses,
        "artifactDispositionCounts": dispositions,
        "contentEquivalentRebindRequested": args.rebind_content_equivalent,
        "contentEquivalentRebindPolicy": {
            "schema": CONTENT_EQUIVALENT_REBIND_SCHEMA,
            "method": CONTENT_EQUIVALENT_REBIND_METHOD,
            "legacyPipelineScriptSha256": (
                CONTENT_EQUIVALENT_REBIND_LEGACY_PIPELINE_SHA256
            ),
            "requested": args.rebind_content_equivalent,
        },
        "families": families,
        "semanticMaterialUse": dict(sorted(semantics.items())),
        "repairCensusCount": len(repair_dispositions),
        "repairAcceptedCount": sum(
            item["disposition"] == "ELIGIBLE_FOR_PBR"
            for item in repair_dispositions
        ),
        "repairQuarantinedCount": len(repair_quarantine),
        "repairDispositionManifest": repair_dispositions,
        "repairDispositionManifestSha256": canonical_json_hash(repair_dispositions),
        "inputProductionManifest": input_manifest,
        "inputProductionManifestSha256": canonical_json_hash(input_manifest),
        "productionManifest": items,
        "productionManifestSha256": canonical_json_hash(items),
        "finalProductionCount": len(items),
        "quarantineManifest": quarantine_manifest,
        "quarantineManifestSha256": canonical_json_hash(quarantine_manifest),
        "quarantinedCount": len(quarantine_manifest),
        "exclusions": exclusion_manifest(exclusions), "items": items,
        "itemManifestSha256": canonical_json_hash(items),
        "failures": failures, "durationSeconds": round(time.time() - started, 3),
    }
    path = output_root / "pbr-reports/summary.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
    return summary


def main():
    args = arguments()
    if (sha256(REPAIR_SCRIPT) != FROZEN_REPAIR_SCRIPT_SHA256
            or sha256(RASTER_CLEANUP_SCRIPT) != FROZEN_RASTER_CLEANUP_SCRIPT_SHA256):
        raise RuntimeError("frozen Stage 10 repair/cleanup producer hash changed")
    require_under(args.output, ROOT, "PBR output root")
    require_under(args.repair_root, ROOT, "repair root")
    catalog_hash = sha256(args.catalog)
    catalog = json.loads(args.catalog.read_text(encoding="utf-8"))
    all_entries, all_exclusions, all_counts = catalog_entries(
        catalog, set(), True, set(),
    )
    validate_full_contract(all_entries, all_exclusions, all_counts)
    entries, exclusions, counts = catalog_entries(
        catalog, set(args.family), args.include_spline, set(args.only),
    )
    full_catalog = not args.family and not args.only and args.include_spline and not args.limit
    if full_catalog:
        validate_full_contract(entries, exclusions, counts)
    repair_summary_path = args.repair_root / "summary.json"
    if not repair_summary_path.is_file():
        raise RuntimeError("repair summary is missing: " + str(repair_summary_path))
    repair_summary = json.loads(repair_summary_path.read_text(encoding="utf-8"))
    repair_material_contract = repair_summary.get("materialSemanticContract", {})
    if (
        repair_summary.get("schema") != "MassfrontStage10ModelRepairSummaryV3"
        or repair_summary.get("pipelineVersion") != REPAIR_PIPELINE_VERSION
        or repair_summary.get("pipelineMode") != REPAIR_PIPELINE_MODE
        or repair_summary.get("catalogSha256") != catalog_hash
        or repair_summary.get("pipelineScriptSha256") != sha256(REPAIR_SCRIPT)
        or repair_summary.get("rasterCleanupScriptSha256") != sha256(RASTER_CLEANUP_SCRIPT)
        or repair_material_contract.get("schema")
        != "MassfrontStage10MaterialSemanticContractV1"
        or repair_material_contract.get("preflightScope")
        != "EVERY_SELECTED_CANONICAL_GLB_BEFORE_ITEM_ONE"
        or repair_material_contract.get("passed") is not True
        or repair_material_contract.get("allSelectedModelsPassed") is not True
        or repair_material_contract.get("fullCatalogCountsMatched") is not True
        or repair_material_contract.get("selectedModelCount")
        != FULL_MATERIAL_MODEL_COUNT
        or repair_material_contract.get("selectedMaterialSlotCount")
        != FULL_MATERIAL_SLOT_COUNT
        or repair_material_contract.get("uniqueNonemptyNames")
        != FULL_MATERIAL_UNIQUE_NONEMPTY
        or repair_material_contract.get("uniqueIncludingUnnamed")
        != FULL_MATERIAL_UNIQUE_WITH_UNNAMED
        or repair_material_contract.get("unnamedSlots")
        != FULL_MATERIAL_UNNAMED_SLOTS
        or repair_material_contract.get("materialCoverageSha256")
        != FULL_MATERIAL_COVERAGE_SHA256
        or repair_summary.get("totalScheduled") != EXPECTED_FULL_SCHEDULE
        or not isinstance(repair_summary.get("processed"), int)
        or not isinstance(repair_summary.get("failed"), int)
        or repair_summary.get("processed", 0) + repair_summary.get("failed", 0)
        != EXPECTED_FULL_SCHEDULE
        or repair_summary.get("pipelineExclusionCount") != 8
        or repair_summary.get("staleExcludedOutputsRemaining") != []
        or not tiled_uv_construction_contract_is_safe(
            repair_summary.get("tiledUvConstructionContract", {})
        )
    ):
        raise RuntimeError("repair summary material semantic preflight is not authoritative")
    repair_dispositions, accepted_entries, repair_reports = repair_census(
        all_entries, args.repair_root, catalog_hash, repair_summary,
    )
    accepted_keys = {entry["key"] for entry in accepted_entries}
    recomputed_statuses = {}
    for repair in repair_reports.values():
        status = repair["status"]
        recomputed_statuses[status] = recomputed_statuses.get(status, 0) + 1
    if repair_summary.get("statusCounts") != recomputed_statuses:
        raise RuntimeError("repair summary status counts do not match the exact 321 reports")
    tiled_summary = repair_summary.get("tiledUvProof", {})
    if (
        tiled_summary.get("schema") != "MassfrontStage10TiledUvSummaryProofV1"
        or tiled_summary.get("metricMethod") != TILED_UV_METRIC_METHOD
        or tiled_summary.get("anchorMethod") != TILED_UV_ANCHOR_METHOD
        or tiled_summary.get("modelsProven") != repair_summary.get("processed")
        or tiled_summary.get("constructionContractSafe") is not True
        or tiled_summary.get("postExportArtifactSha256BindingsPassed") is not True
    ):
        raise RuntimeError("repair summary tiled-UV census is not authoritative")
    entries = [entry for entry in entries if entry["key"] in accepted_keys]
    if args.limit:
        entries = entries[:args.limit]
    if not entries:
        raise RuntimeError("PBR selection has no proof-green repair production items")
    repair_summary_binding = {
        "path": repo_relative(repair_summary_path),
        "sha256": sha256(repair_summary_path),
        "schema": repair_summary["schema"],
        "pipelineVersion": repair_summary["pipelineVersion"],
        "materialSemanticContract": repair_material_contract,
        "materialSemanticContractCanonicalJson": canonical_json_text(
            repair_material_contract
        ),
        "materialSemanticContractSha256": canonical_json_hash(
            repair_material_contract
        ),
        "productionSetPolicy": PRODUCTION_SET_POLICY,
        "repairDispositionManifestSha256": canonical_json_hash(repair_dispositions),
        "repairAcceptedCount": len(accepted_entries),
        "repairQuarantinedCount": len(repair_dispositions) - len(accepted_entries),
    }
    registry = parse_live_material_registry()
    library = TileLibrary(args.output, registry)
    started = time.time()
    results = []
    failures = []
    log("scheduled %d models" % len(entries))
    scheduled_keys = {entry["key"] for entry in entries}
    for index, entry in enumerate(entries, start=1):
        log("[%d/%d] %s" % (index, len(entries), entry["key"]))
        try:
            result = process(
                entry, args.repair_root, args.output, catalog_hash, library,
                args.force, args.rebind_content_equivalent,
            )
            results.append(result)
            log("  -> %s (%d PBR materials, %.2fs)" % (
                result["status"], len(result["materials"]), result.get("durationSeconds", 0.0)))
        except Exception as exc:
            failures.append({
                "key": entry["key"], "error": str(exc), "traceback": traceback.format_exc(),
            })
            log("  -> FAILED: " + str(exc))
        write_summary(
            args.output, results, failures, len(entries), started, args,
            catalog_hash, counts, exclusions, repair_summary_binding,
            repair_dispositions, scheduled_keys,
        )
    summary = write_summary(
        args.output, results, failures, len(entries), started, args,
        catalog_hash, counts, exclusions, repair_summary_binding,
        repair_dispositions, scheduled_keys,
    )
    print(json.dumps(summary, indent=2), flush=True)
    if not summary["passed"]:
        sys.exit(2)


try:
    main()
except Exception:
    traceback.print_exc()
    sys.exit(3)
