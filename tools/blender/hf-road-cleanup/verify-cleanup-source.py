"""Static, non-Blender verification for the Hunyuan road cleanup contract."""

import ast
import hashlib
import json
from pathlib import Path


EXPECTED = "62EC702437FAC75D3651B0130BE094DD8A824FB559A97A46319B131F6225B166"
ROOT = Path(__file__).resolve().parents[3]
SOURCE = (
    ROOT / "modules" / "space_exploration" / "assets" / "source" / "huggingface"
    / "world-kits" / "mf-road-straight-hunyuan3d21-v1" / "mf-road-straight-hunyuan3d21-v1.glb"
)
SOURCE_REPORT = SOURCE.with_suffix(".report.json")
SCRIPT = Path(__file__).with_name("build-hf-road-cleanup.py")
OUTPUT_ROOT = (
    ROOT / "modules" / "space_exploration" / "assets" / "source" / "blender"
    / "world-kits" / "mf-road-straight-hunyuan-clean-v1"
)
PROVENANCE = OUTPUT_ROOT / "mf-road-straight-hunyuan-clean-v1.provenance.json"


def hash_file(path):
    return hashlib.sha256(path.read_bytes()).hexdigest().upper()


def png_dimensions(path):
    data = path.read_bytes()[:24]
    if len(data) != 24 or data[:8] != b"\x89PNG\r\n\x1a\n" or data[12:16] != b"IHDR":
        raise SystemExit("FAIL invalid evidence PNG: " + str(path))
    return int.from_bytes(data[16:20], "big"), int.from_bytes(data[20:24], "big")


def main():
    source_hash = hash_file(SOURCE)
    if source_hash != EXPECTED:
        raise SystemExit("FAIL immutable source hash mismatch: " + source_hash)
    report = json.loads(SOURCE_REPORT.read_text(encoding="utf-8"))
    if str(report.get("output", {}).get("sha256", "")).upper() != EXPECTED:
        raise SystemExit("FAIL source generation report hash mismatch")
    text = SCRIPT.read_text(encoding="utf-8")
    ast.parse(text)
    required = (
        "TARGET_WIDTH_M = 20.0", "TARGET_LENGTH_M = 40.0", "LANE_COUNT = 4",
        "source-model-intake.py", "REFERENCE_HIGH", "RENDER_LOD%d", "COLLISION",
        "NAV_PROXY", "SOCKET_ROAD_N", "SOCKET_ROAD_S", "runtimeAccepted\": False",
        "transverse_tiling_joint_bands", "four_lane_markings",
        "restrained_cyan_service_channels", "sameCameraPairs", "1024",
        "cleanup_connected_components", "globalNormalRecalculation", "surfacePlacementEvidence",
    )
    missing = [token for token in required if token not in text]
    if missing:
        raise SystemExit("FAIL missing cleanup contract tokens: " + ", ".join(missing))
    if SOURCE.is_relative_to(OUTPUT_ROOT):
        raise SystemExit("FAIL immutable source is inside derived output folder")
    if not PROVENANCE.is_file():
        raise SystemExit("FAIL Blender provenance output is missing")
    built = json.loads(PROVENANCE.read_text(encoding="utf-8"))
    if built.get("runtimeAccepted") is not False or built.get("visualAccepted") is not False:
        raise SystemExit("FAIL review candidate was promoted without acceptance")
    if str(built.get("source", {}).get("sha256", "")).upper() != EXPECTED:
        raise SystemExit("FAIL Blender provenance source mismatch")
    cleanup = built.get("connectedComponentCleanup", {})
    if cleanup.get("policy", {}).get("faceWindingPreserved") is not True:
        raise SystemExit("FAIL cleanup does not preserve source winding")
    if cleanup.get("policy", {}).get("globalNormalRecalculation") is not False:
        raise SystemExit("FAIL disconnected-island normal recalculation is enabled")
    if cleanup.get("removed", {}).get("components", 0) <= 0:
        raise SystemExit("FAIL no connected micro-components were quarantined")
    after_dimensions = cleanup.get("after", {}).get("bounds", {}).get("dimensions", [])
    if len(after_dimensions) < 2 or abs(after_dimensions[0] - 20.0) > 1e-5 or abs(after_dimensions[1] - 40.0) > 1e-5:
        raise SystemExit("FAIL cleanup changed the exact 20x40 m envelope")
    placements = built.get("surfacePlacementEvidence", [])
    if len(placements) != 3:
        raise SystemExit("FAIL missing LOD surface-placement evidence")
    if any(item.get("intersectionsFound") != 0 or item.get("coplanarPlacementsFound") != 0 for item in placements):
        raise SystemExit("FAIL authored details intersect or are coplanar with source surface")
    if any(item.get("minimumClearanceM") is None or item["minimumClearanceM"] < 0.0079 for item in placements):
        raise SystemExit("FAIL authored detail surface clearance is below contract")
    lods = built.get("lods", [])
    lod_counts = [item.get("renderMeshTriangles") for item in lods]
    if len(lod_counts) != 3 or not all(isinstance(value, int) and value > 0 for value in lod_counts):
        raise SystemExit("FAIL explicit LOD triangle counts are missing")
    if not (lod_counts[0] > lod_counts[1] > lod_counts[2]):
        raise SystemExit("FAIL LOD triangle counts are not strictly descending")
    renders = built.get("evidence", {}).get("renders", [])
    if len(renders) != 6:
        raise SystemExit("FAIL expected six matched evidence renders")
    for record in renders:
        path = Path(record.get("path", ""))
        if not path.is_file() or hash_file(path) != str(record.get("sha256", "")).upper():
            raise SystemExit("FAIL stale or missing evidence render: " + str(path))
        if png_dimensions(path) != (1024, 1024):
            raise SystemExit("FAIL evidence render is not 1024x1024: " + str(path))
    print(json.dumps({
        "status": "PASS",
        "sourceSha256": source_hash,
        "syntax": "PASS",
        "runtimeAcceptedLiteral": False,
        "targetEnvelopeM": [20, 40],
        "laneCount": 4,
        "renderResolution": [1024, 1024],
        "removedComponents": cleanup["removed"]["components"],
        "removedTriangles": cleanup["removed"]["triangles"],
        "lodTriangles": lod_counts,
        "evidenceRenders": len(renders),
    }, separators=(",", ":")))


if __name__ == "__main__":
    main()
