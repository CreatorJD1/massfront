"""Shared Stage 10 same-winding raster-risk detection and derived cleanup.

Canonical GLBs are never written by this module.  Callers import a source GLB
into Blender, pass the render objects here, and may export the resulting
derived scene elsewhere.  Acceptance uses the exact signed-winding,
pair-local 0.5 mm depth-band contract.  Cleanup expands only that depth band
by a measured float32 guard; it has no thin-width or angular exemption.
"""

import hashlib
import json
import math
import re
import struct
import sys
from collections import defaultdict
from pathlib import Path

import bpy
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree


ROOT = Path(__file__).resolve().parents[2]
SHAPELY_PATH = ROOT / "tmp/stage10-pydeps-current"
if str(SHAPELY_PATH) not in sys.path:
    sys.path.insert(0, str(SHAPELY_PATH))

import shapely  # noqa: E402
from shapely.geometry import LineString, Polygon  # noqa: E402
from shapely.ops import unary_union  # noqa: E402


EXPECTED_SHAPELY_VERSION = "2.1.2"
EXPECTED_GEOS_VERSION = "3.13.1"
if (shapely.__version__ != EXPECTED_SHAPELY_VERSION
        or shapely.geos_version_string != EXPECTED_GEOS_VERSION):
    raise RuntimeError(
        "Stage 10 raster cleanup requires Shapely %s / GEOS %s, got %s / %s" % (
            EXPECTED_SHAPELY_VERSION,
            EXPECTED_GEOS_VERSION,
            shapely.__version__,
            shapely.geos_version_string,
        )
    )


SCHEMA = "MassfrontStage10RasterCleanupV2"
METHOD = "SIGNED_SAME_WINDING_PAIR_LOCAL_AFFINE_DEPTH_BAND"
EXACT_POSITION_M = 1.0e-6
PLANE_DISTANCE_M = 5.0e-4
NORMAL_ANGLE_DEGREES = 0.5
NORMAL_DOT_MIN = math.cos(math.radians(NORMAL_ANGLE_DEGREES))
MINIMUM_OVERLAP_AREA_M2 = 1.0e-6
CLIP_MARGIN_M = 2.0e-5
AREA_EPSILON_M2 = 1.0e-10
BOUNDS_DRIFT_LIMIT_M = 5.01e-4
MAX_PASSES = 6
MAX_CONFLICT_SAMPLES = 24


# Ground-kit faces intentionally meet in this order at plaza, ramp, step, and
# trench seams.  A wall/cap is the visible structural boundary, a kerb is the
# raised edge between it and the field surface, and pave/road is the base.  The
# remaining ground materials are overlays or inserts and therefore outrank the
# structural field where their source faces are genuinely coplanar.  Keeping
# this table explicit prevents a catalog-specific token from silently falling
# through to an arbitrary stable-owner tie.
GROUND_SEMANTIC_PRIORITIES = {
    "EMISSIVE": (80, "EMISSIVE_LIGHT"),
    "OCHRE": (60, "MARKING_WARN"),
    "GRATE": (50, "VENT_RECESS"),
    "RECESS": (50, "VENT_RECESS"),
    "SLOT": (50, "VENT_RECESS"),
    "RUST": (40, "TRIM_ACCENT"),
    "VERDIGRIS": (40, "TRIM_ACCENT"),
    "METAL": (30, "METAL_ROOF"),
    "WALL": (20, "WALL_SHELL"),
    "KERB": (15, "KERB_EDGE"),
    "PAVE": (10, "FOUNDATION_GROUND"),
    "ROAD": (10, "FOUNDATION_GROUND"),
}


# These tokens occur outside the ground-kit prefix as well.  They are kept in
# one explicit catalog table so a new family cannot accidentally turn a named
# material into an unresolved stable-owner tie.  Water/submerged and rubble
# are background surfaces; structural faces remain visible above them.
CATALOG_ADDITIONAL_SEMANTIC_PRIORITIES = {
    "OCHRE": (60, "MARKING_WARN"),
    "RUST": (40, "TRIM_ACCENT"),
    "VERDIGRIS": (40, "TRIM_ACCENT"),
    "CURB": (15, "KERB_EDGE"),
    "KERB": (15, "KERB_EDGE"),
    "PAVING": (10, "FOUNDATION_GROUND"),
    "RUBBLE": (0, "NATURAL"),
    "SUBMERGED": (-10, "WATER_BACKGROUND"),
    "WATER": (-10, "WATER_BACKGROUND"),
}


def dependency_contract():
    return {
        "shapelyVersion": shapely.__version__,
        "geosVersion": shapely.geos_version_string,
        "requiredShapelyVersion": EXPECTED_SHAPELY_VERSION,
        "requiredGeosVersion": EXPECTED_GEOS_VERSION,
        "passed": True,
    }


def acceptance_contract():
    return {
        "method": METHOD,
        "signedSameWinding": True,
        "normalAngleDegrees": NORMAL_ANGLE_DEGREES,
        "normalDotMinimum": NORMAL_DOT_MIN,
        "planeDistanceM": PLANE_DISTANCE_M,
        "minimumOverlapAreaM2": MINIMUM_OVERLAP_AREA_M2,
        "exactDuplicatesIgnoreAreaFloor": True,
        "minimumWidthExemption": False,
        "cleanupDepthGuardOnly": True,
        "cleanupGuardScope": "MUTATION_DEPTH_AND_FLOAT32_REMOVAL_BOUNDARY_ONLY",
        "adjacentEdgeExclusion": (
            "SAME_OBJECT_EXACT_TWO_ENDPOINT_EDGE_WITH_STRICT_OPPOSITE_SIDE"
        ),
        "aggregateCoherentCrossingResolution": (
            "IMMUTABLE_SOURCE_LINEAGE_PAIR_STABLE_OWNER_WITHIN_ACCEPTED_"
            "PAIR_LOCAL_COVERAGE"
        ),
        "aggregateCoherentCrossingExpandsAcceptedCoverage": False,
        "subsequentPassReconstructionPlane": (
            "IMMUTABLE_SOURCE_LINEAGE_PLANE_WITH_CANONICAL_EDGES"
        ),
        "subsequentPassReconstructionExpandsAcceptedCoverage": False,
        "sameLineagePartitionRealization": (
            "TOPOLOGY_ACCEPTED_PAIR_TRIGGERED_ADJACENT_FLOAT32_OMITTED_AXIS_ULP"
        ),
        "sameLineagePartitionRealizationMergesProjectedVertices": False,
        "sameLineagePartitionRealizationExpandsAcceptedCoverage": False,
        "maximumCleanupPasses": MAX_PASSES,
        "pairCountMustStrictlyDecrease": False,
        "cleanupProgressRule": (
            "POSITIVE_ACCEPTED_MASK_SOURCE_SURFACE_INTERSECTION_OR_"
            "SAME_LINEAGE_OR_EXACT_DUPLICATE_CONSOLIDATION_WITH_PAIR_DECREASE"
        ),
        "repeatedGeometryStateAllowed": False,
    }


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


def oriented_face_key(points):
    values = tuple(
        tuple(int(round(float(value) / EXACT_POSITION_M)) for value in point)
        for point in points
    )
    return min(values, values[1:] + values[:1], values[2:] + values[:2])


def _semantic_rank_name(material_name):
    name = re.sub(r"\.\d{3}$", "", material_name or "").upper()
    # glTF permits unnamed materials. Blender imports those as Material or
    # Material.###; both spellings deliberately use the lowest stable-owner
    # priority instead of becoming an unresolved semantic.
    if not name or name == "MATERIAL":
        return -100, "UNNAMED_STABLE_OWNER"
    tokens = set(filter(None, re.split(r"[^A-Z0-9]+", name)))

    def has(*values):
        return any(value in tokens or value in name for value in values)

    if "MF_MODBLD_V1_MAT_G" in name:
        ground_matches = [
            (rank, semantic)
            for token, (rank, semantic) in GROUND_SEMANTIC_PRIORITIES.items()
            if token in tokens
        ]
        if ground_matches:
            return max(ground_matches, key=lambda item: item[0])

    catalog_matches = [
        (rank, semantic)
        for token, (rank, semantic) in CATALOG_ADDITIONAL_SEMANTIC_PRIORITIES.items()
        if token in tokens
    ]
    if catalog_matches:
        return max(catalog_matches, key=lambda item: item[0])

    if has("EMISSIVE", "GLOW", "BEACON", "LAMP", "LIGHT", "EMBER"):
        return 80, "EMISSIVE_LIGHT"
    if has("GLAZING", "GLASS", "WINDOW", "CURTAIN"):
        return 70, "GLASS_WINDOW"
    if has("HAZARD", "WARN", "LANE", "CROSSWALK"):
        return 60, "MARKING_WARN"
    if has("GRATE", "RECESS", "SLOT", "SERVICE", "VENT", "LOUVRE"):
        return 50, "VENT_RECESS"
    if has("TRIM", "ACCENT"):
        return 40, "TRIM_ACCENT"
    if has("METAL", "GUNMETAL", "MACH", "PIPE", "MAST", "RACK", "TANK", "ARMOUR", "ARMOR", "ROOF"):
        return 30, "METAL_ROOF"
    if has("WALL", "CONC", "PRECAST", "BUILD", "BRICK", "PLATE", "HULL", "SHELL"):
        return 20, "WALL_SHELL"
    if has("DECK", "PAD", "FOUNDATION", "SLAB", "ROAD", "ASPHALT", "PAVE"):
        return 10, "FOUNDATION_GROUND"
    if has("EARTH", "SOIL", "SAND", "STONE", "ROCK", "BEDROCK", "FOLIAGE", "LEAF"):
        return 0, "NATURAL"
    return None, "UNKNOWN"


def semantic_rank(material):
    return _semantic_rank_name(material.name if material else "")


def assert_material_semantic_names(material_names):
    """Fail closed when an original GLB material lacks deterministic semantics."""
    names = [str(name or "").strip() for name in material_names]
    resolutions = []
    for name in sorted(set(names)):
        first = _semantic_rank_name(name)
        second = _semantic_rank_name(name)
        if first != second or first[0] is None or first[1] == "UNKNOWN":
            raise RuntimeError(
                "unresolved or nondeterministic catalog material semantic: %r -> %r / %r"
                % (name, first, second)
            )
        resolutions.append({
            "name": name,
            "rank": first[0],
            "semantic": first[1],
            "unnamedStablePolicy": not name,
        })
    return {
        "schema": "MassfrontStage10MaterialSemanticContractV1",
        "policy": "EXPLICIT_SEMANTIC_PRIORITY_THEN_STABLE_OWNER",
        "unnamedPolicy": "LOWEST_PRIORITY_STABLE_OWNER",
        "uniqueIncludingUnnamed": len(set(names)),
        "uniqueNonemptyNames": len({name for name in names if name}),
        "unnamedSlots": sum(not name for name in names),
        "resolutions": resolutions,
        "passed": True,
    }


def _assert_ground_semantic_contract():
    shared = {
        "EMISSIVE": (80, "EMISSIVE_LIGHT"),
        "GRATE": (50, "VENT_RECESS"),
        "METAL": (30, "METAL_ROOF"),
        "OCHRE": (60, "MARKING_WARN"),
        "RECESS": (50, "VENT_RECESS"),
        "RUST": (40, "TRIM_ACCENT"),
        "SLOT": (50, "VENT_RECESS"),
        "VERDIGRIS": (40, "TRIM_ACCENT"),
    }
    expected = {
        "MF_MODBLD_V1_MAT_G_%s" % token: result
        for token, result in shared.items()
    }
    for style in ("BRUTALIST", "COLONIAL", "RUINED"):
        for token in ("PAVE", "ROAD", "KERB", "WALL"):
            expected[
                "MF_MODBLD_V1_MAT_G_%s_%s" % (style, token)
            ] = GROUND_SEMANTIC_PRIORITIES[token]
    for material_name, wanted in expected.items():
        actual = _semantic_rank_name(material_name)
        if actual != wanted:
            raise RuntimeError(
                "ground semantic self-test failed for %s: %r != %r" % (
                    material_name, actual, wanted,
                )
            )
    ranks = {
        token: _semantic_rank_name(
            "MF_MODBLD_V1_MAT_G_COLONIAL_%s" % token
        )[0]
        for token in ("PAVE", "KERB", "WALL")
    }
    if not ranks["WALL"] > ranks["KERB"] > ranks["PAVE"]:
        raise RuntimeError(
            "ground semantic priority must remain WALL > KERB > PAVE: %r" % ranks
        )


def _assert_catalog_semantic_token_contract():
    expected = {
        "MF_MODBLD_V1_MAT_F_OCHRE": (60, "MARKING_WARN"),
        "MF_MODBLD_V1_MAT_F_RUST": (40, "TRIM_ACCENT"),
        "MF_MODBLD_V1_MAT_T_VERDIGRIS": (40, "TRIM_ACCENT"),
        "MF_MODROAD_V1_MAT_CURB": (15, "KERB_EDGE"),
        "MF_MODROAD_V1_MAT_PAVING": (10, "FOUNDATION_GROUND"),
        "MF_MODBLD_V1_MAT_RUBBLE": (0, "NATURAL"),
        "MF_MODBLD_V1_MAT_S_SUBMERGED": (-10, "WATER_BACKGROUND"),
        "MF_MODBLD_V1_MAT_T_WATER": (-10, "WATER_BACKGROUND"),
        "": (-100, "UNNAMED_STABLE_OWNER"),
        "Material.001": (-100, "UNNAMED_STABLE_OWNER"),
    }
    proof = assert_material_semantic_names(expected)
    actual = {
        item["name"]: (item["rank"], item["semantic"])
        for item in proof["resolutions"]
    }
    for name, wanted in expected.items():
        if actual[name] != wanted:
            raise RuntimeError(
                "catalog semantic token self-test failed for %r: %r != %r"
                % (name, actual[name], wanted)
            )


_assert_ground_semantic_contract()
_assert_catalog_semantic_token_contract()


def _unchanged_triangle(record):
    return {
        "localPoints": record["localPoints"],
        "localNormals": record["localNormals"],
        "material": record["material"],
        "smooth": record["smooth"],
        "lineage": record["lineage"],
        "changed": False,
    }


def collect_triangle_records(objects, lineage_by_object=None):
    """Collect render triangles; only non-degenerate records enter pair discovery."""
    records_by_lod = defaultdict(list)
    records_by_object = defaultdict(list)
    object_input = {}
    lineage_by_object = lineage_by_object or {}
    for owner_index, obj in enumerate(objects):
        mesh = obj.data
        mesh.calc_loop_triangles()
        corner_normals = mesh.corner_normals
        tracked_lineages = lineage_by_object.get(obj)
        if tracked_lineages is not None and len(tracked_lineages) != len(mesh.polygons):
            raise RuntimeError(
                "lineage/polygon count mismatch on %s: %d != %d" % (
                    obj.name_full, len(tracked_lineages), len(mesh.polygons),
                )
            )
        object_input[obj.name_full] = {
            "triangles": len(mesh.loop_triangles),
            "polygons": len(mesh.polygons),
            "vertices": len(mesh.vertices),
            "materialSlots": len(mesh.materials),
            "allPolygonsTriangular": all(len(polygon.vertices) == 3 for polygon in mesh.polygons),
            "colorAttributes": len(mesh.color_attributes),
            "shapeKeys": bool(mesh.shape_keys),
            "vertexGroups": len(obj.vertex_groups),
        }
        for triangle_index, triangle in enumerate(mesh.loop_triangles):
            local_points = tuple(mesh.vertices[index].co.copy() for index in triangle.vertices)
            world_points = tuple(obj.matrix_world @ point for point in local_points)
            local_normals = tuple(corner_normals[loop].vector.copy() for loop in triangle.loops)
            polygon = mesh.polygons[triangle.polygon_index]
            lineage = (
                tuple(tracked_lineages[triangle.polygon_index])
                if tracked_lineages is not None
                else (owner_index, triangle_index)
            )
            material_index = polygon.material_index
            material = mesh.materials[material_index] if material_index < len(mesh.materials) else None
            cross = (world_points[1] - world_points[0]).cross(world_points[2] - world_points[0])
            record = {
                "owner": obj,
                "ownerIndex": owner_index,
                "triangleIndex": triangle_index,
                "polygonIndex": triangle.polygon_index,
                "material": material_index,
                "materialName": material.name if material else None,
                "smooth": bool(polygon.use_smooth),
                "localPoints": local_points,
                "localNormals": local_normals,
                "points": world_points,
                "lineage": lineage,
                "lineageTrackedThroughCleanup": tracked_lineages is not None,
                "rasterEligible": cross.length > 1.0e-14,
            }
            records_by_object[obj].append(record)
            if not record["rasterEligible"]:
                continue
            rank, semantic = semantic_rank(material)
            record.update({
                "semanticRank": rank,
                "semantic": semantic,
                "normal": cross.normalized(),
                "area": cross.length * 0.5,
                "centroid": sum(world_points, Vector()) / 3.0,
                "exactKey": oriented_face_key(world_points),
            })
            records_by_lod[lod_level(obj)].append(record)
    return records_by_lod, records_by_object, object_input


def iter_polygons(geometry):
    if geometry.is_empty:
        return
    if geometry.geom_type == "Polygon":
        yield geometry
    elif geometry.geom_type in {"MultiPolygon", "GeometryCollection"}:
        for item in geometry.geoms:
            yield from iter_polygons(item)


def polygon_for(record, drop_axis):
    axes = [axis for axis in range(3) if axis != drop_axis]
    return Polygon([(point[axes[0]], point[axes[1]]) for point in record["points"]])


def clip_vertices_affine(vertices, a, b, c, limit, keep_less=True):
    if not vertices:
        return []
    output = []
    for start, end in zip(vertices, vertices[1:] + vertices[:1]):
        start_value = a * start[0] + b * start[1] + c
        end_value = a * end[0] + b * end[1] + c
        start_inside = start_value <= limit if keep_less else start_value >= limit
        end_inside = end_value <= limit if keep_less else end_value >= limit
        if start_inside != end_inside:
            denominator = end_value - start_value
            if abs(denominator) > 1.0e-20:
                amount = (limit - start_value) / denominator
                output.append((
                    start[0] + (end[0] - start[0]) * amount,
                    start[1] + (end[1] - start[1]) * amount,
                ))
        if end_inside:
            output.append(end)
    cleaned = []
    for point in output:
        if not cleaned or math.hypot(
                point[0] - cleaned[-1][0], point[1] - cleaned[-1][1]) > 1.0e-12:
            cleaned.append(point)
    if (len(cleaned) > 1 and math.hypot(
            cleaned[0][0] - cleaned[-1][0], cleaned[0][1] - cleaned[-1][1]) <= 1.0e-12):
        cleaned.pop()
    return cleaned if len(cleaned) >= 3 else []


def clipped_geometry_affine(geometry, a, b, c, lower=None, upper=None):
    pieces = []
    for polygon in iter_polygons(geometry):
        vertices = list(polygon.exterior.coords)[:-1]
        if upper is not None:
            vertices = clip_vertices_affine(vertices, a, b, c, upper, keep_less=True)
        if lower is not None:
            vertices = clip_vertices_affine(vertices, a, b, c, lower, keep_less=False)
        if vertices:
            piece = Polygon(vertices)
            if piece.area > AREA_EPSILON_M2:
                pieces.append(piece)
    return unary_union(pieces) if pieces else Polygon()


def float32_ulp_for_records(*records):
    magnitude = max(
        (abs(float(value)) for record in records
         for point in record["points"] for value in point),
        default=0.0,
    )
    return 2.0 ** (math.floor(math.log2(magnitude)) - 23) if magnitude > 0.0 else 2.0 ** -149


def float32_scalar_ulp(value):
    magnitude = abs(float(value))
    if magnitude == 0.0:
        return 2.0 ** -149
    if magnitude < 2.0 ** -126:
        return 2.0 ** -149
    return 2.0 ** (math.floor(math.log2(magnitude)) - 23)


def float32_plane_storage_guard(obj, local_points, world_normal):
    """Conservative plane error from one float32 local-vertex storage step."""
    matrix = obj.matrix_world
    plane_coefficients = [
        abs(world_normal.dot(Vector((
            matrix[0][axis], matrix[1][axis], matrix[2][axis],
        ))))
        for axis in range(3)
    ]
    maximum = max(
        (
            sum(
                plane_coefficients[axis] * float32_scalar_ulp(point[axis])
                for axis in range(3)
            )
            for point in local_points
        ),
        default=0.0,
    )
    # A full ULP per local axis already exceeds the 0.5-ULP IEEE-754 rounding
    # bound for one rebuild.  A lineage can be stored once per decreasing pass,
    # so accumulate that bound across the six-pass contract plus two arithmetic
    # margins.  This remains coordinate/transform-derived and is independently
    # bounded by the final 0.501 mm geometry-drift gate.
    return max(CLIP_MARGIN_M, maximum * (MAX_PASSES + 2.0))


def float32_plane_dot_guard(world_points, world_normal):
    """Bound two float32 plane-dot evaluations, including cancellation."""
    absolute_term_scale = max(
        (
            sum(abs(world_normal[axis] * point[axis]) for axis in range(3))
            for point in world_points
        ),
        default=0.0,
    )
    # Each comparison evaluates one three-product/two-add dot for the immutable
    # source distance and one for the fragment.  Eight ULPs at the absolute-term
    # scale conservatively cover both evaluations even when their final values
    # are small because positive and negative terms cancel.
    return max(CLIP_MARGIN_M, float32_scalar_ulp(absolute_term_scale) * 8.0)


def float32_world_coordinate_guard(world_points):
    magnitude = max(
        (abs(float(value)) for point in world_points for value in point),
        default=0.0,
    )
    return max(CLIP_MARGIN_M, float32_scalar_ulp(magnitude) * 8.0)


def centered_local_plane_proof(obj, source_local_point, fragment_local_points, world_normal):
    """Measure actual stored-plane drift without a world-origin dot product.

    Blender mesh coordinates and matrix coefficients are float32-backed and
    therefore exactly representable as Python floats.  Translation cancels in
    ``M * (p - source)``.  Evaluating that centered delta in float64 avoids the
    millimetre-scale cancellation ULP that ``n.dot(world_p) - d`` acquires for
    otherwise coplanar models authored thousands of metres from the origin.
    The separately reported ULP bound describes representational uncertainty;
    it never enlarges pair acceptance or the 0.501 mm actual-drift gate.
    """
    matrix = obj.matrix_world
    coefficients = tuple(
        sum(
            float(world_normal[row]) * float(matrix[row][axis])
            for row in range(3)
        )
        for axis in range(3)
    )
    source = tuple(float(source_local_point[axis]) for axis in range(3))
    maximum_drift = 0.0
    maximum_arithmetic_scale = 0.0
    maximum_input_ulp_bound = 0.0
    maximum_drift_point = source
    maximum_drift_delta = (0.0, 0.0, 0.0)
    for point in fragment_local_points:
        stored = tuple(float(point[axis]) for axis in range(3))
        delta = tuple(stored[axis] - source[axis] for axis in range(3))
        terms = tuple(coefficients[axis] * delta[axis] for axis in range(3))
        measured_drift = abs(sum(terms))
        if measured_drift > maximum_drift:
            maximum_drift = measured_drift
            maximum_drift_point = stored
            maximum_drift_delta = delta
        maximum_arithmetic_scale = max(
            maximum_arithmetic_scale, sum(abs(term) for term in terms),
        )
        maximum_input_ulp_bound = max(
            maximum_input_ulp_bound,
            sum(
                abs(coefficients[axis]) * (
                    float32_scalar_ulp(source[axis])
                    + float32_scalar_ulp(stored[axis])
                )
                for axis in range(3)
            ),
        )
    arithmetic_guard = max(
        1.0e-15, maximum_arithmetic_scale * sys.float_info.epsilon * 16.0,
    )
    return {
        "measuredStoredDriftM": maximum_drift,
        "float64ArithmeticGuardM": arithmetic_guard,
        "float32InputUlpBoundM": max(1.0e-12, maximum_input_ulp_bound),
        "worldPlaneLocalCoefficients": list(coefficients),
        "worldOriginCancellationAvoided": True,
        "maximumDriftStoredLocalPoint": list(maximum_drift_point),
        "maximumDriftLocalDelta": list(maximum_drift_delta),
    }


def source_plane_representational_error_bound(
        storage_guard, float32_input_ulp_bound, rebuild_accumulation_guard):
    """Combine independent representation errors without changing acceptance."""
    values = (
        float(storage_guard), float(float32_input_ulp_bound),
        float(rebuild_accumulation_guard),
    )
    if not all(math.isfinite(value) and value >= 0.0 for value in values):
        raise RuntimeError("invalid source-plane representational error component")
    # The centered source/output coordinate uncertainty and bounded rebuild
    # margin are independent forward-error terms, so they add.  The older
    # max-only expression underbounded a measured 122.0703125 um stored-plane
    # offset as 120 um.  This quantity remains informational: actual centered
    # stored drift plus its float64 arithmetic guard still must independently
    # pass BOUNDS_DRIFT_LIMIT_M.
    return max(values[0], values[1] + values[2])


def _assert_centered_local_plane_contract():
    class IdentityObject:
        matrix_world = (
            (1.0, 0.0, 0.0, 8192.0),
            (0.0, 1.0, 0.0, -8192.0),
            (0.0, 0.0, 1.0, 4096.0),
            (0.0, 0.0, 0.0, 1.0),
        )

    origin = (8192.0, -4096.0, 64.0)
    tangential = centered_local_plane_proof(
        IdentityObject(), origin, [(9000.0, -3000.0, 64.0)],
        (0.0, 0.0, 1.0),
    )
    if tangential["measuredStoredDriftM"] != 0.0:
        raise RuntimeError("centered plane proof changed a tangential delta")
    normal_offset = centered_local_plane_proof(
        IdentityObject(), origin, [(8192.0, -4096.0, 64.00025)],
        (0.0, 0.0, 1.0),
    )
    if abs(normal_offset["measuredStoredDriftM"] - 0.00025) > 1.0e-12:
        raise RuntimeError("centered plane proof lost a measured normal offset")
    large_ulp = centered_local_plane_proof(
        IdentityObject(), origin, [origin], (1.0, 0.0, 0.0),
    )
    if (large_ulp["measuredStoredDriftM"] != 0.0
            or large_ulp["float32InputUlpBoundM"] <= BOUNDS_DRIFT_LIMIT_M):
        raise RuntimeError(
            "centered plane proof must separate actual drift from far-coordinate ULP"
        )
    combined_bound = source_plane_representational_error_bound(
        2.0e-5, 2.20703125e-6, 1.2e-4,
    )
    if abs(combined_bound - 1.2220703125e-4) > 1.0e-15:
        raise RuntimeError(
            "source-plane representation proof must add rebuild and coordinate ULP errors"
        )


_assert_centered_local_plane_contract()


def float32_depth_guard(first, second):
    return max(CLIP_MARGIN_M, float32_ulp_for_records(first, second) * 8.0)


def build_canonical_source_edges(lineage_sources):
    """Bind adjacent immutable source lineages to one oriented 3D edge.

    GLB source triangles commonly share an edge with opposite vertex order.
    Reconstructing a cut point as ``a.lerp(b, t)`` on one face and
    ``b.lerp(a, 1-t)`` on its neighbor can differ by a float32 ULP at large
    world coordinates.  The faces must retain their own planes and shading, so
    flattening the pair is unsafe; a canonical shared edge makes only their
    common boundary bit-identical.
    """
    by_edge = defaultdict(list)
    for (obj, lineage), record in lineage_sources.items():
        if not record.get("rasterEligible"):
            continue
        for edge_index in range(3):
            start = record["points"][edge_index]
            end = record["points"][(edge_index + 1) % 3]
            start_key = tuple(
                int(round(float(value) / EXACT_POSITION_M)) for value in start
            )
            end_key = tuple(
                int(round(float(value) / EXACT_POSITION_M)) for value in end
            )
            edge_key = tuple(sorted((start_key, end_key)))
            by_edge[(obj, edge_key)].append({
                "lineage": tuple(lineage),
                "start": start.copy(),
                "end": end.copy(),
            })
    result = defaultdict(list)
    pair_edges = defaultdict(list)
    for (obj, edge_key), entries in by_edge.items():
        lineages = {entry["lineage"] for entry in entries}
        if len(lineages) < 2:
            continue
        representative = min(
            entries,
            key=lambda entry: (
                entry["lineage"],
                tuple(float(value) for value in entry["start"]),
                tuple(float(value) for value in entry["end"]),
            ),
        )
        endpoints = sorted(
            (representative["start"], representative["end"]),
            key=lambda point: tuple(float(value) for value in point),
        )
        canonical = {
            "edgeKey": edge_key,
            "start": endpoints[0].copy(),
            "end": endpoints[1].copy(),
            "sourceLineageCount": len(lineages),
        }
        for lineage in lineages:
            result[(obj, lineage)].append(canonical)
        ordered_lineages = sorted(lineages)
        for first_index, first_lineage in enumerate(ordered_lineages):
            for second_lineage in ordered_lineages[first_index + 1:]:
                pair_edges[(obj, first_lineage, second_lineage)].append(canonical)
    return result, pair_edges


def tie_winner(first, second):
    if first["materialName"] != second["materialName"]:
        if first["semanticRank"] is None or second["semanticRank"] is None:
            raise RuntimeError(
                "unknown semantic material tie: %r vs %r" % (
                    first["materialName"], second["materialName"],
                )
            )
        if first["semanticRank"] != second["semanticRank"]:
            return "FIRST" if first["semanticRank"] > second["semanticRank"] else "SECOND"
    # The winner must survive retriangulation.  Current triangle indices are
    # output-order details and can reverse between passes, while immutable
    # source lineage is carried through every derived fragment.  Resolve the
    # semantic/stable-owner tie by lineage first and retain current triangle
    # index only as the final within-lineage tiebreaker.
    first_key = (
        first["ownerIndex"], first["material"], tuple(first["lineage"]),
        first["triangleIndex"],
    )
    second_key = (
        second["ownerIndex"], second["material"], tuple(second["lineage"]),
        second["triangleIndex"],
    )
    return "FIRST" if first_key < second_key else "SECOND"


def _assert_stable_owner_contract():
    base = {
        "materialName": "MF_TEST_WALL",
        "semanticRank": 20,
        "ownerIndex": 1,
        "material": 0,
    }
    earlier_lineage_late_fragment = {
        **base, "lineage": (1, 200), "triangleIndex": 1900,
    }
    later_lineage_early_fragment = {
        **base, "lineage": (1, 1219), "triangleIndex": 10,
    }
    if tie_winner(earlier_lineage_late_fragment, later_lineage_early_fragment) != "FIRST":
        raise RuntimeError("stable-owner tie changed with retriangulated triangle order")
    if tie_winner(later_lineage_early_fragment, earlier_lineage_late_fragment) != "SECOND":
        raise RuntimeError("stable-owner tie depends on pair argument order")


_assert_stable_owner_contract()


def _source_lineage_identity(record):
    return (record["ownerIndex"], tuple(record["lineage"]))


def cohere_accepted_lineage_pair_winners(records, pairs):
    """Make a crossing source-lineage pair use one pass-invariant winner.

    The pair-local affine test remains authoritative: this only reassigns the
    already-accepted risk coverage.  Retriangulation can split one pair of
    crossing immutable source planes into fragments that individually appear
    one-sided on opposite sides of the crossing.  Resolving those fragments
    independently creates a zipper seam.  Grouping by immutable source lineage
    detects that aggregate crossing and applies the existing semantic/stable
    owner consistently without expanding the accepted footprint.
    """
    groups = defaultdict(list)
    output = [
        (first_index, second_index, dict(overlap))
        for first_index, second_index, overlap in pairs
    ]
    for pair_index, (first_index, second_index, overlap) in enumerate(output):
        first, second = records[first_index], records[second_index]
        first_identity = _source_lineage_identity(first)
        second_identity = _source_lineage_identity(second)
        if first_identity == second_identity:
            continue
        group_key = tuple(sorted((first_identity, second_identity)))
        groups[group_key].append((pair_index, first_index, second_index, overlap))

    aggregate_groups = 0
    crossing_groups = 0
    mixed_winner_groups = 0
    reassigned_pairs = 0
    coverage_area = 0.0
    maximum_coverage_delta = 0.0
    samples = []
    for group_key, group in groups.items():
        signed_winners = set()
        has_crossing = False
        for _pair_index, first_index, second_index, overlap in group:
            first_identity = _source_lineage_identity(records[first_index])
            second_identity = _source_lineage_identity(records[second_index])
            if not overlap["_firstWins"].is_empty:
                signed_winners.add(first_identity)
            if not overlap["_secondWins"].is_empty:
                signed_winners.add(second_identity)
            has_crossing = has_crossing or overlap["coherentCrossing"]
        mixed_winners = len(signed_winners) > 1
        if not has_crossing and not mixed_winners:
            continue

        aggregate_groups += 1
        crossing_groups += has_crossing
        mixed_winner_groups += mixed_winners
        representative = group[0]
        first = records[representative[1]]
        second = records[representative[2]]
        stable_identity = (
            _source_lineage_identity(first)
            if tie_winner(first, second) == "FIRST"
            else _source_lineage_identity(second)
        )
        group_area = 0.0
        for pair_index, first_index, second_index, overlap in group:
            first_identity = _source_lineage_identity(records[first_index])
            second_identity = _source_lineage_identity(records[second_index])
            risk_geometry = unary_union((
                overlap["_firstWins"], overlap["_secondWins"],
            ))
            area_delta = abs(float(risk_geometry.area) - float(overlap["area"]))
            tolerance = max(AREA_EPSILON_M2, float(overlap["area"]) * 1.0e-9)
            if area_delta > tolerance:
                raise RuntimeError(
                    "aggregate coherent-crossing changed accepted coverage by %.12g m2"
                    % area_delta
                )
            maximum_coverage_delta = max(maximum_coverage_delta, area_delta)
            group_area += risk_geometry.area
            coverage_area += risk_geometry.area
            first_wins = first_identity == stable_identity
            if not first_wins and second_identity != stable_identity:
                raise RuntimeError("aggregate coherent-crossing lost its stable lineage")
            overlap["_firstWins"] = risk_geometry if first_wins else Polygon()
            overlap["_secondWins"] = Polygon() if first_wins else risk_geometry
            overlap["winner"] = (
                "FIRST_AGGREGATE_COHERENT_CROSSING"
                if first_wins else "SECOND_AGGREGATE_COHERENT_CROSSING"
            )
            overlap["coherentCrossing"] = True
            overlap["aggregateCoherentCrossing"] = True
            overlap["aggregateMixedSignedWinners"] = mixed_winners
            overlap["aggregateStableWinnerLineage"] = stable_identity
            output[pair_index] = (first_index, second_index, overlap)
            reassigned_pairs += 1
        if len(samples) < MAX_CONFLICT_SAMPLES:
            samples.append({
                "firstSourceLineage": list(group_key[0]),
                "secondSourceLineage": list(group_key[1]),
                "stableWinnerLineage": list(stable_identity),
                "pairCount": len(group),
                "acceptedPairLocalCoverageAreaSumM2": group_area,
                "hadFragmentLocalCrossing": has_crossing,
                "hadMixedSignedWinners": mixed_winners,
                "acceptedCoverageExpanded": False,
            })
    return output, {
        "aggregateCoherentLineagePairGroups": aggregate_groups,
        "aggregateCoherentCrossingGroups": crossing_groups,
        "aggregateMixedSignedWinnerGroups": mixed_winner_groups,
        "aggregateCoherentPairAssignments": reassigned_pairs,
        "aggregateCoherentPairLocalCoverageAreaSumM2": coverage_area,
        "aggregateCoherentMaximumCoverageDeltaM2": maximum_coverage_delta,
        "aggregateCoherentCoveragePreserved": True,
        "aggregateCoherentLineagePairSamples": samples,
        "aggregateCoherentLineagePairSamplesTruncated": aggregate_groups > len(samples),
    }


def _assert_aggregate_coherent_crossing_contract():
    base = {
        "materialName": "MF_TEST_WALL",
        "semanticRank": 20,
        "ownerIndex": 1,
        "material": 0,
    }
    earlier = {**base, "lineage": (1, 200), "triangleIndex": 100}
    later = {**base, "lineage": (1, 1219), "triangleIndex": 101}
    risk = Polygon(((0.0, 0.0), (1.0, 0.0), (0.0, 1.0)))
    pairs = [
        (0, 1, {
            "_firstWins": risk, "_secondWins": Polygon(),
            "area": risk.area, "coherentCrossing": False,
        }),
        (0, 1, {
            "_firstWins": Polygon(), "_secondWins": risk,
            "area": risk.area, "coherentCrossing": False,
        }),
    ]
    coherent, report = cohere_accepted_lineage_pair_winners([earlier, later], pairs)
    if report["aggregateMixedSignedWinnerGroups"] != 1:
        raise RuntimeError("aggregate coherent-crossing failed to detect mixed winners")
    if any(overlap["_firstWins"].is_empty for _first, _second, overlap in coherent):
        raise RuntimeError("aggregate coherent-crossing did not preserve stable ownership")
    if any(not overlap["_secondWins"].is_empty for _first, _second, overlap in coherent):
        raise RuntimeError("aggregate coherent-crossing retained inconsistent ownership")


_assert_aggregate_coherent_crossing_contract()


def demonstrable_adjacent_edge_classification(first, second, drop_axis):
    """Exclude only true same-object adjacency, never a merely thin overlap."""
    if first["owner"] is not second["owner"]:
        return None
    endpoint_tolerance = EXACT_POSITION_M
    matches = []
    used_second = set()
    for first_index, first_point in enumerate(first["points"]):
        candidates = [
            ((first_point - second_point).length, second_index)
            for second_index, second_point in enumerate(second["points"])
            if second_index not in used_second
            and (first_point - second_point).length <= endpoint_tolerance
        ]
        if not candidates:
            continue
        _distance, second_index = min(candidates)
        matches.append((first_index, second_index))
        used_second.add(second_index)
    if len(matches) != 2:
        return None
    first_matched = {value[0] for value in matches}
    second_matched = {value[1] for value in matches}
    first_other = next(index for index in range(3) if index not in first_matched)
    second_other = next(index for index in range(3) if index not in second_matched)
    axes = [axis for axis in range(3) if axis != drop_axis]
    edge_start = first["points"][matches[0][0]]
    edge_end = first["points"][matches[1][0]]
    edge_x = edge_end[axes[0]] - edge_start[axes[0]]
    edge_y = edge_end[axes[1]] - edge_start[axes[1]]
    edge_length = math.hypot(edge_x, edge_y)
    if edge_length <= EXACT_POSITION_M:
        return None

    def side(point):
        return (
            edge_x * (point[axes[1]] - edge_start[axes[1]])
            - edge_y * (point[axes[0]] - edge_start[axes[0]])
        )

    first_side = side(first["points"][first_other])
    second_side = side(second["points"][second_other])
    side_epsilon = edge_length * endpoint_tolerance
    opposite_side = (
        (first_side > side_epsilon and second_side < -side_epsilon)
        or (first_side < -side_epsilon and second_side > side_epsilon)
    )
    if not opposite_side:
        return None
    return "EXACT_SHARED_EDGE"


def strict_opposite_side_overlapping_edge(first, second, drop_axis, tolerance):
    """Prove two projected edges are one non-crossing partition seam."""
    axes = [axis for axis in range(3) if axis != drop_axis]
    first_points = [Vector((point[axes[0]], point[axes[1]])) for point in first["points"]]
    second_points = [Vector((point[axes[0]], point[axes[1]])) for point in second["points"]]
    for first_edge in range(3):
        first_start = first_points[first_edge]
        first_end = first_points[(first_edge + 1) % 3]
        first_third = first_points[(first_edge + 2) % 3]
        direction = first_end - first_start
        length = direction.length
        if length <= tolerance:
            continue
        unit = direction / length

        def signed_distance(point):
            offset = point - first_start
            return unit.x * offset.y - unit.y * offset.x

        first_side = signed_distance(first_third)
        if abs(first_side) <= tolerance:
            continue
        for second_edge in range(3):
            second_start = second_points[second_edge]
            second_end = second_points[(second_edge + 1) % 3]
            second_third = second_points[(second_edge + 2) % 3]
            if (abs(signed_distance(second_start)) > tolerance
                    or abs(signed_distance(second_end)) > tolerance):
                continue
            second_side = signed_distance(second_third)
            if not (
                (first_side > tolerance and second_side < -tolerance)
                or (first_side < -tolerance and second_side > tolerance)
            ):
                continue
            second_offsets = (
                unit.dot(second_start - first_start),
                unit.dot(second_end - first_start),
            )
            overlap_length = (
                min(length, max(second_offsets))
                - max(0.0, min(second_offsets))
            )
            if overlap_length > tolerance:
                return True
    return False


def overlap_record(first, second, cleanup=False, diagnostics=None):
    """Return one accepted pair; cleanup=True adds only the float32 depth guard."""
    exact_duplicate = first["exactKey"] == second["exactKey"]
    normal_dot = first["normal"].dot(second["normal"])
    if normal_dot < NORMAL_DOT_MIN:
        if diagnostics is not None:
            diagnostics["oppositeOrDifferentWindingExcluded"] += 1
        return None
    reference = first["normal"] + second["normal"]
    if reference.length <= 1.0e-14:
        return None
    reference.normalize()
    drop_axis = max(range(3), key=lambda axis: abs(reference[axis]))
    adjacency = demonstrable_adjacent_edge_classification(first, second, drop_axis)
    if adjacency:
        if diagnostics is not None:
            diagnostics["demonstrableAdjacentEdgesExcluded"] += 1
        return None
    overlap_geometry = polygon_for(first, drop_axis).intersection(polygon_for(second, drop_axis))
    projected_overlap = overlap_geometry.area
    if overlap_geometry.is_empty or (projected_overlap <= MINIMUM_OVERLAP_AREA_M2 and not exact_duplicate):
        if diagnostics is not None:
            diagnostics["belowAreaFloorExcluded"] += 1
        return None

    if exact_duplicate:
        # The raw duplicate authority counts every non-degenerate oriented
        # duplicate, even when its projected area is below the ordinary raster
        # floor. Remove the losing record directly in visible_outputs instead
        # of routing a microscopic polygon through area-epsilon clipping.
        tie_choice = tie_winner(first, second)
        separations = [
            reference.dot(first_point - min(
                second["points"], key=lambda point: (first_point - point).length,
            ))
            for first_point in first["points"]
        ]
        exact_cleanup_guard = float32_depth_guard(first, second) if cleanup else 0.0
        return {
            "area": projected_overlap,
            "projectedOverlapArea": projected_overlap,
            "planeDistance": max((abs(value) for value in separations), default=0.0),
            "normalDot": normal_dot,
            "minimumSeparation": min(separations, default=0.0),
            "maximumSeparation": max(separations, default=0.0),
            "winner": tie_choice + "_EXACT_DUPLICATE",
            "tieWinner": tie_choice,
            "dropAxis": drop_axis,
            "cleanupDepthGuardM": exact_cleanup_guard,
            "quantizationGuardM": exact_cleanup_guard,
            "depthLimitM": PLANE_DISTANCE_M + exact_cleanup_guard,
            "exactDuplicate": True,
            "coherentCrossing": False,
            "_firstWins": overlap_geometry if tie_choice == "FIRST" else Polygon(),
            "_secondWins": overlap_geometry if tie_choice == "SECOND" else Polygon(),
        }

    axes = [axis for axis in range(3) if axis != drop_axis]
    first_plane = first["normal"].dot(first["points"][0])
    second_plane = second["normal"].dot(second["points"][0])
    delta_a = (
        -first["normal"][axes[0]] / first["normal"][drop_axis]
        + second["normal"][axes[0]] / second["normal"][drop_axis]
    )
    delta_b = (
        -first["normal"][axes[1]] / first["normal"][drop_axis]
        + second["normal"][axes[1]] / second["normal"][drop_axis]
    )
    delta_c = (
        first_plane / first["normal"][drop_axis]
        - second_plane / second["normal"][drop_axis]
    )
    distance_scale = max(abs(first["normal"][drop_axis]), abs(second["normal"][drop_axis]))
    cleanup_guard = float32_depth_guard(first, second) if cleanup else 0.0
    depth_limit = PLANE_DISTANCE_M + cleanup_guard
    height_limit = depth_limit / distance_scale
    risk_geometry = clipped_geometry_affine(
        overlap_geometry, delta_a, delta_b, delta_c,
        lower=-height_limit, upper=height_limit,
    )
    risk_area = risk_geometry.area if not risk_geometry.is_empty else 0.0
    if risk_geometry.is_empty or (risk_area <= MINIMUM_OVERLAP_AREA_M2 and not exact_duplicate):
        if diagnostics is not None:
            diagnostics["outsidePairLocalDepthOrAreaExcluded"] += 1
        return None

    signed_a = reference[drop_axis] * delta_a
    signed_b = reference[drop_axis] * delta_b
    signed_c = reference[drop_axis] * delta_c
    first_wins = clipped_geometry_affine(
        risk_geometry, signed_a, signed_b, signed_c, lower=EXACT_POSITION_M,
    )
    second_wins = clipped_geometry_affine(
        risk_geometry, signed_a, signed_b, signed_c, upper=-EXACT_POSITION_M,
    )
    tie_geometry = clipped_geometry_affine(
        risk_geometry, signed_a, signed_b, signed_c,
        lower=-EXACT_POSITION_M, upper=EXACT_POSITION_M,
    )
    tie_choice = tie_winner(first, second)
    if not tie_geometry.is_empty:
        if tie_choice == "FIRST":
            first_wins = unary_union((first_wins, tie_geometry))
        else:
            second_wins = unary_union((second_wins, tie_geometry))
    crossing = not first_wins.is_empty and not second_wins.is_empty
    if crossing:
        # A switching seam inside the accepted depth band is numerically
        # unstable after float32 retriangulation. Keep one semantic/stable
        # owner for the entire footprint; no vertex is snapped or averaged.
        if tie_choice == "FIRST":
            first_wins, second_wins = risk_geometry, Polygon()
        else:
            first_wins, second_wins = Polygon(), risk_geometry

    samples = []
    for polygon in iter_polygons(risk_geometry):
        for point in list(polygon.exterior.coords)[:-1]:
            samples.append(signed_a * point[0] + signed_b * point[1] + signed_c)
    minimum_separation = min(samples) if samples else 0.0
    maximum_separation = max(samples) if samples else 0.0
    plane_distance = max(abs(value) for value in samples) if samples else 0.0
    winner = (
        ("FIRST" if tie_choice == "FIRST" else "SECOND") + "_COHERENT_CROSSING"
        if crossing else ("FIRST" if not first_wins.is_empty else "SECOND")
    )
    return {
        "area": risk_area,
        "projectedOverlapArea": projected_overlap,
        "planeDistance": plane_distance,
        "normalDot": normal_dot,
        "minimumSeparation": minimum_separation,
        "maximumSeparation": maximum_separation,
        "winner": winner,
        "tieWinner": tie_choice,
        "dropAxis": drop_axis,
        "cleanupDepthGuardM": cleanup_guard,
        "quantizationGuardM": cleanup_guard,
        "depthLimitM": depth_limit,
        "exactDuplicate": exact_duplicate,
        "coherentCrossing": crossing,
        "_firstWins": first_wins,
        "_secondWins": second_wins,
    }


def _discovery_metrics():
    return {
        "candidates": 0,
        "pairs": 0,
        "crossObjectPairs": 0,
        "exactDuplicatePairs": 0,
        "coherentCrossingPairs": 0,
        "riskAreaM2": 0.0,
        "oppositeOrDifferentWindingExcluded": 0,
        "demonstrableAdjacentEdgesExcluded": 0,
        "belowAreaFloorExcluded": 0,
        "outsidePairLocalDepthOrAreaExcluded": 0,
    }


def _discover_pairs(records, cleanup=False):
    metrics = _discovery_metrics()
    if not records:
        return [], metrics
    vertices = [tuple(point) for record in records for point in record["points"]]
    polygons = [(index * 3, index * 3 + 1, index * 3 + 2) for index in range(len(records))]
    maximum_guard = max(
        (float32_depth_guard(record, record) for record in records), default=0.0,
    ) if cleanup else 0.0
    epsilon = PLANE_DISTANCE_M + maximum_guard
    bvh = BVHTree.FromPolygons(vertices, polygons, all_triangles=True, epsilon=epsilon)
    pairs = []
    for first_index, first in enumerate(records):
        radius = max((point - first["centroid"]).length for point in first["points"]) + epsilon * 2.0
        for _point, _normal, second_index, _distance in bvh.find_nearest_range(
                first["centroid"], radius):
            if second_index <= first_index:
                continue
            metrics["candidates"] += 1
            second = records[second_index]
            overlap = overlap_record(first, second, cleanup=cleanup, diagnostics=metrics)
            if overlap is None:
                continue
            pairs.append((first_index, second_index, overlap))
            metrics["pairs"] += 1
            metrics["crossObjectPairs"] += first["owner"] is not second["owner"]
            metrics["exactDuplicatePairs"] += overlap["exactDuplicate"]
            metrics["coherentCrossingPairs"] += overlap["coherentCrossing"]
            metrics["riskAreaM2"] += overlap["area"]
    return pairs, metrics


def discover_acceptance_pairs(records):
    """Public exact acceptance path used by repair and the Stage 10 audit."""
    return _discover_pairs(records, cleanup=False)


def discover_cleanup_pairs(records):
    """Public mutation path; differs only by the reported float32 depth guard."""
    return _discover_pairs(records, cleanup=True)


def _scan_by_lod(objects, cleanup=False, lineage_by_object=None):
    records_by_lod, records_by_object, object_input = collect_triangle_records(
        objects, lineage_by_object=lineage_by_object,
    )
    pairs_by_lod = {}
    metrics_by_lod = {}
    total_pairs = 0
    total_area = 0.0
    for lod, records in records_by_lod.items():
        pairs, metrics = (
            discover_cleanup_pairs(records) if cleanup
            else discover_acceptance_pairs(records)
        )
        pairs_by_lod[lod] = pairs
        metrics_by_lod[str(lod)] = metrics
        total_pairs += metrics["pairs"]
        total_area += metrics["riskAreaM2"]
    return {
        "recordsByLod": records_by_lod,
        "recordsByObject": records_by_object,
        "objectInput": object_input,
        "pairsByLod": pairs_by_lod,
        "metricsByLod": metrics_by_lod,
        "pairCount": total_pairs,
        "riskAreaM2": total_area,
    }


def _minimum_width(geometry):
    widths = []
    for polygon in iter_polygons(geometry):
        rectangle = polygon.minimum_rotated_rectangle
        if rectangle.is_empty or rectangle.geom_type != "Polygon":
            continue
        points = list(rectangle.exterior.coords)
        lengths = [
            math.hypot(end[0] - start[0], end[1] - start[1])
            for start, end in zip(points, points[1:])
        ]
        positive = [value for value in lengths if value > 0.0]
        if positive:
            widths.append(min(positive))
    return min(widths) if widths else 0.0


def residual_pair_samples(scan, cleanup_generation=0, limit=MAX_CONFLICT_SAMPLES):
    """Return bounded failure evidence without weakening acceptance."""
    samples = []
    for lod, pairs in sorted(scan["pairsByLod"].items()):
        records = scan["recordsByLod"][lod]
        for first_index, second_index, overlap in pairs:
            first, second = records[first_index], records[second_index]
            risk_geometry = unary_union((overlap["_firstWins"], overlap["_secondWins"]))
            minimum_width = _minimum_width(risk_geometry)
            ulp = float32_ulp_for_records(first, second)
            sub_ulp_seam = 0.0 < minimum_width <= ulp * 2.0
            depth_boundary = abs(
                overlap["planeDistance"] - PLANE_DISTANCE_M
            ) <= max(ulp * 8.0, 1.0e-7)
            generated_same_source = (
                first["owner"] is second["owner"]
                and first["lineageTrackedThroughCleanup"]
                and second["lineageTrackedThroughCleanup"]
                and first["lineage"] == second["lineage"]
            )
            same_lineage_partition_seam = (
                generated_same_source
                and first["material"] == second["material"]
                and sub_ulp_seam
                and strict_opposite_side_overlapping_edge(
                    first, second, overlap["dropAxis"],
                    max(EXACT_POSITION_M, ulp * 2.0),
                )
            )
            if overlap["exactDuplicate"]:
                classification = "EXACT_DUPLICATE"
            elif overlap["coherentCrossing"]:
                classification = "COHERENT_CROSSING"
            elif same_lineage_partition_seam:
                classification = "FLOAT32_SAME_LINEAGE_PARTITION_SEAM"
            elif sub_ulp_seam:
                classification = "SUB_ULP_ADJACENT_SEAM"
            elif depth_boundary:
                classification = "CLEANUP_DEPTH_BOUNDARY"
            elif generated_same_source:
                classification = "GENERATED_SAME_SOURCE_FRAGMENTS"
            else:
                classification = "OTHER_ACCEPTED_PAIR"
            samples.append({
                "classification": classification,
                "lod": lod,
                "firstObject": first["owner"].name_full,
                "firstTriangle": first["triangleIndex"],
                "firstPolygon": first["polygonIndex"],
                "firstMaterial": first["materialName"],
                "firstLineage": list(first["lineage"]),
                "secondObject": second["owner"].name_full,
                "secondTriangle": second["triangleIndex"],
                "secondPolygon": second["polygonIndex"],
                "secondMaterial": second["materialName"],
                "secondLineage": list(second["lineage"]),
                "sameObject": first["owner"] is second["owner"],
                "generatedSameSourceFragments": generated_same_source,
                "sameLineagePartitionSeam": same_lineage_partition_seam,
                "subUlpAdjacentSeam": sub_ulp_seam,
                "cleanupDepthBoundary": depth_boundary,
                "exactDuplicate": overlap["exactDuplicate"],
                "coherentCrossing": overlap["coherentCrossing"],
                "winner": overlap["winner"],
                "riskAreaM2": overlap["area"],
                "minimumRiskWidthM": minimum_width,
                "planeDistanceM": overlap["planeDistance"],
                "normalDot": overlap["normalDot"],
                "float32UlpM": ulp,
                "float32EightUlpGuardM": max(CLIP_MARGIN_M, ulp * 8.0),
                "firstCentroid": [float(value) for value in first["centroid"]],
                "secondCentroid": [float(value) for value in second["centroid"]],
            })
            if len(samples) >= limit:
                return samples
    return samples


def audit_same_winding_raster_risk(objects):
    """Read-only JSON-safe acceptance proof using the shared production path."""
    scan = _scan_by_lod(objects, cleanup=False)
    return {
        "schema": SCHEMA,
        "contract": acceptance_contract(),
        "dependencyContract": dependency_contract(),
        "pairs": scan["pairCount"],
        "riskAreaM2": scan["riskAreaM2"],
        "metricsByLod": scan["metricsByLod"],
        "passed": scan["pairCount"] == 0,
    }


def constrained_triangles(geometry, minimum_area=AREA_EPSILON_M2):
    output = []
    for polygon in iter_polygons(geometry):
        if polygon.area <= minimum_area:
            continue
        collection = shapely.constrained_delaunay_triangles(polygon)
        triangles = [
            item for item in collection.geoms
            if item.geom_type == "Polygon" and item.area > minimum_area
        ]
        if polygon.area > 0.0 and not triangles:
            raise RuntimeError(
                "constrained triangulation dropped positive coverage %.12g m2" % (
                    polygon.area,
                )
            )
        union = unary_union(triangles)
        coverage_delta = union.symmetric_difference(polygon).area
        area_delta = abs(sum(item.area for item in triangles) - polygon.area)
        tolerance = max(1.0e-8, polygon.area * 1.0e-7)
        if coverage_delta > tolerance or area_delta > tolerance:
            raise RuntimeError(
                "constrained triangulation drift coverage=%.12g area=%.12g m2" % (
                    coverage_delta, area_delta,
                )
            )
        output.extend(triangles)
    return output


def reconstruct(point, drop_axis, normal, source_point):
    """Reconstruct on a plane using centered deltas, never n·worldP."""
    axes = [axis for axis in range(3) if axis != drop_axis]
    values = [0.0, 0.0, 0.0]
    values[axes[0]], values[axes[1]] = float(point[0]), float(point[1])
    source = [float(source_point[axis]) for axis in range(3)]
    values[drop_axis] = source[drop_axis] - (
        float(normal[axes[0]]) * (values[axes[0]] - source[axes[0]])
        + float(normal[axes[1]]) * (values[axes[1]] - source[axes[1]])
    ) / float(normal[drop_axis])
    return Vector(values)


def centered_lerp(start, end, amount):
    """Interpolate as start + delta*t so equal far-origin axes stay exact."""
    value = min(1.0, max(0.0, float(amount)))
    return Vector(tuple(
        float(start[axis])
        + (float(end[axis]) - float(start[axis])) * value
        for axis in range(3)
    ))


def centered_world_to_local(record, world_point, inverse):
    """Map a stored world point back to local space with translation cancelled."""
    source_world = record["points"][0]
    source_local = record["localPoints"][0]
    delta = tuple(
        float(world_point[axis]) - float(source_world[axis])
        for axis in range(3)
    )
    return Vector(tuple(
        float(source_local[row]) + sum(
            float(inverse[row][axis]) * delta[axis] for axis in range(3)
        )
        for row in range(3)
    ))


def _assert_centered_reconstruction_contract():
    source_world = Vector((8201.599609375, -8196.0, 4100.0))
    source_local = Vector((9.5999755859375, -4.0, 4.0))
    normal = Vector((1.0, 0.0, 0.0))
    rebuilt_world = reconstruct(
        (-8188.978515625, 4109.34326171875), 0, normal, source_world,
    )
    record = {
        "points": (source_world,),
        "localPoints": (source_local,),
    }
    identity_linear = (
        (1.0, 0.0, 0.0, -8192.0),
        (0.0, 1.0, 0.0, 8192.0),
        (0.0, 0.0, 1.0, -4096.0),
        (0.0, 0.0, 0.0, 1.0),
    )
    rebuilt_local = centered_world_to_local(
        record, rebuilt_world, identity_linear,
    )
    if float(rebuilt_world[0]) != float(source_world[0]):
        raise RuntimeError("centered world-plane reconstruction lost its source anchor")
    far_edge_start = Vector((1829.5999755859375, -269.7875061035156, -22.0))
    far_edge_end = Vector((1829.5999755859375, -261.4849853515625, 0.0))
    far_edge_point = centered_lerp(far_edge_start, far_edge_end, 0.73125)
    if float(far_edge_point[0]) != float(far_edge_start[0]):
        raise RuntimeError("centered edge interpolation moved an invariant far-origin axis")
    if float(rebuilt_local[0]) != float(source_local[0]):
        raise RuntimeError("centered inverse mapping reintroduced world-origin cancellation")


_assert_centered_reconstruction_contract()


def _assert_immutable_plane_sliver_reconstruction_contract():
    """A derived sliver normal must never become a subsequent-pass plane."""
    source_points = (
        Vector((17.773082733154297, 26.892597198486328, 14.208916664123535)),
        Vector((-26.624736785888672, 29.99361228942871, 14.299127578735352)),
        Vector((18.913501739501953, 27.65460205078125, 14.231083869934082)),
    )
    source_normal = (
        (source_points[1] - source_points[0])
        .cross(source_points[2] - source_points[0])
        .normalized()
    )
    sliver_points = (
        Vector((-26.624736785888672, 29.99361228942871, 14.299127578735352)),
        Vector((15.00330638885498, 27.565715789794922, 14.228498458862305)),
        Vector((15.003328323364258, 27.565683364868164, 14.228497505187988)),
    )
    sliver_normal = (
        (sliver_points[1] - sliver_points[0])
        .cross(sliver_points[2] - sliver_points[0])
        .normalized()
    )
    edge_lengths = [
        (sliver_points[(index + 1) % 3] - sliver_points[index]).length
        for index in range(3)
    ]
    if min(edge_lengths) >= 4.0e-5 or max(edge_lengths) <= 41.0:
        raise RuntimeError("immutable-plane adversarial fixture lost its long sliver")
    point_2d = (13.524038314819336, 27.651975631713867)
    derived = reconstruct(
        point_2d, 2, sliver_normal, sliver_points[0],
    )
    immutable = reconstruct(
        point_2d, 2, source_normal, source_points[0],
    )

    def immutable_drift(point):
        delta = tuple(
            float(point[axis]) - float(source_points[0][axis])
            for axis in range(3)
        )
        return abs(sum(
            float(source_normal[axis]) * delta[axis]
            for axis in range(3)
        ))

    derived_drift = immutable_drift(derived)
    immutable_drift_m = immutable_drift(immutable)
    representational_bound = source_plane_representational_error_bound(
        CLIP_MARGIN_M, 2.0174672712936537e-6,
        CLIP_MARGIN_M * MAX_PASSES,
    )
    if derived_drift <= representational_bound:
        raise RuntimeError(
            "adversarial sliver no longer proves derived-normal amplification"
        )
    if immutable_drift_m > representational_bound:
        raise RuntimeError(
            "immutable source-plane reconstruction exceeded representation bound"
        )
    if any(
            float(derived[axis]) != float(immutable[axis])
            for axis in (0, 1)):
        raise RuntimeError(
            "immutable reconstruction changed the accepted two-dimensional footprint"
        )


_assert_immutable_plane_sliver_reconstruction_contract()


def reconstruct_on_record(point, drop_axis, record, canonical_edges=()):
    axes = [axis for axis in range(3) if axis != drop_axis]
    projected = [(value[axes[0]], value[axes[1]]) for value in record["points"]]
    snap_tolerance = max(1.0e-7, float32_ulp_for_records(record) * 2.0)
    for edge in canonical_edges:
        projected_edge = [
            (edge[key][axes[0]], edge[key][axes[1]])
            for key in ("start", "end")
        ]
        dx = projected_edge[1][0] - projected_edge[0][0]
        dy = projected_edge[1][1] - projected_edge[0][1]
        length_squared = dx * dx + dy * dy
        if length_squared <= 1.0e-20:
            continue
        amount = (
            (point[0] - projected_edge[0][0]) * dx
            + (point[1] - projected_edge[0][1]) * dy
        ) / length_squared
        amount_tolerance = snap_tolerance / math.sqrt(length_squared)
        if amount < -amount_tolerance or amount > 1.0 + amount_tolerance:
            continue
        closest = (
            projected_edge[0][0] + dx * amount,
            projected_edge[0][1] + dy * amount,
        )
        if math.hypot(point[0] - closest[0], point[1] - closest[1]) <= snap_tolerance:
            canonical_point = centered_lerp(edge["start"], edge["end"], amount)
            # The canonical edge supplies identical lateral coordinates only.
            # Adjacent source faces can intentionally meet at a crease, so the
            # omitted coordinate must still come from this lineage's immutable
            # source plane rather than from the representative neighbor face.
            return reconstruct(
                (
                    canonical_point[axes[0]],
                    canonical_point[axes[1]],
                ),
                drop_axis,
                record["normal"],
                record["points"][0],
            )
    for source, candidate in zip(record["points"], projected):
        if math.hypot(point[0] - candidate[0], point[1] - candidate[1]) <= snap_tolerance:
            return source.copy()
    for edge_index in range(3):
        start_2d = projected[edge_index]
        end_2d = projected[(edge_index + 1) % 3]
        dx, dy = end_2d[0] - start_2d[0], end_2d[1] - start_2d[1]
        length_squared = dx * dx + dy * dy
        if length_squared <= 1.0e-20:
            continue
        amount = ((point[0] - start_2d[0]) * dx + (point[1] - start_2d[1]) * dy) / length_squared
        amount_tolerance = snap_tolerance / math.sqrt(length_squared)
        if amount < -amount_tolerance or amount > 1.0 + amount_tolerance:
            continue
        closest = (start_2d[0] + dx * amount, start_2d[1] + dy * amount)
        if math.hypot(point[0] - closest[0], point[1] - closest[1]) <= snap_tolerance:
            return centered_lerp(
                record["points"][edge_index],
                record["points"][(edge_index + 1) % 3], amount,
            )
    normal = record["normal"]
    return reconstruct(point, drop_axis, normal, record["points"][0])


def barycentric(point, triangle):
    a, b, c = triangle
    v0, v1, v2 = b - a, c - a, point - a
    d00, d01, d11 = v0.dot(v0), v0.dot(v1), v1.dot(v1)
    d20, d21 = v2.dot(v0), v2.dot(v1)
    denominator = d00 * d11 - d01 * d01
    if abs(denominator) <= 1.0e-20:
        return (1.0, 0.0, 0.0)
    v = (d11 * d20 - d01 * d21) / denominator
    w = (d00 * d21 - d01 * d20) / denominator
    return (1.0 - v - w, v, w)


def changed_triangles(
        record, visible, drop_axis, minimum_area=AREA_EPSILON_M2,
        canonical_edges=()):
    output = []
    normal = record["normal"]
    determinant = record["owner"].matrix_world.determinant()
    if abs(determinant) <= 1.0e-12:
        raise RuntimeError("singular object transform: " + record["owner"].name_full)
    inverse = record["owner"].matrix_world.inverted()
    polygons = constrained_triangles(visible, minimum_area=minimum_area)
    projected_triangles = [
        tuple(
            (float(point[0]), float(point[1]))
            for point in list(polygon.exterior.coords)[:3]
        )
        for polygon in polygons
    ]
    # Constrained triangulation repeats a logical vertex in every incident
    # triangle. Reconstruct and quantize that projected vertex once per source
    # lineage so an internal edge cannot acquire two independent float32 plane
    # realizations before the mesh-index pool reuses it below.
    world_registry = {
        point: reconstruct_on_record(
            point, drop_axis, record, canonical_edges=canonical_edges,
        )
        for point in sorted({
            point for triangle in projected_triangles for point in triangle
        })
    }
    local_registry = {
        point: centered_world_to_local(record, world, inverse)
        for point, world in world_registry.items()
    }
    normal_registry = {}
    for point, world in world_registry.items():
        weights = barycentric(world, record["points"])
        value = sum(
            (record["localNormals"][index] * weights[index] for index in range(3)),
            Vector(),
        )
        if value.length <= 1.0e-14:
            value = record["localNormals"][0].copy()
        value.normalize()
        normal_registry[point] = value
    for projected_points in projected_triangles:
        projected_points = list(projected_points)
        world_points = [world_registry[point].copy() for point in projected_points]
        actual = (world_points[1] - world_points[0]).cross(world_points[2] - world_points[0])
        if actual.dot(normal) < 0.0:
            world_points[1], world_points[2] = world_points[2], world_points[1]
            projected_points[1], projected_points[2] = (
                projected_points[2], projected_points[1]
            )
        local_points = tuple(local_registry[point].copy() for point in projected_points)
        local_normals = tuple(normal_registry[point].copy() for point in projected_points)
        output.append({
            "localPoints": local_points,
            "localNormals": local_normals,
            "material": record["material"],
            "smooth": record["smooth"],
            "lineage": record["lineage"],
            "projectedVertexKeys": tuple(projected_points),
            "sourceDropAxis": drop_axis,
            "changed": True,
        })
    return output


def _float32_value(value):
    return struct.unpack("<f", struct.pack("<f", float(value)))[0]


def _adjacent_float32(value, direction):
    """Return the immediately adjacent finite float32 in one direction."""
    value = _float32_value(value)
    if not math.isfinite(value) or direction not in (-1, 1):
        raise RuntimeError("invalid adjacent-float32 request")
    bits = struct.unpack("<I", struct.pack("<f", value))[0]
    if value == 0.0:
        bits = 0x00000001 if direction > 0 else 0x80000001
    elif (value > 0.0) == (direction > 0):
        bits += 1
    else:
        bits -= 1
    result = struct.unpack("<f", struct.pack("<I", bits))[0]
    if not math.isfinite(result):
        raise RuntimeError("adjacent float32 escaped finite range")
    return result


def _immutable_plane_omitted_coordinate(projected, drop_axis, record):
    axes = [axis for axis in range(3) if axis != drop_axis]
    source = tuple(float(value) for value in record["points"][0])
    normal = tuple(float(value) for value in record["normal"])
    return source[drop_axis] - (
        normal[axes[0]] * (float(projected[0]) - source[axes[0]])
        + normal[axes[1]] * (float(projected[1]) - source[axes[1]])
    ) / normal[drop_axis]


def _lineage_realization_records(obj, items, source_record):
    records = []
    for index, item in enumerate(items):
        local_points = tuple(Vector(point) for point in item["localPoints"])
        world_points = tuple(obj.matrix_world @ point for point in local_points)
        cross = (world_points[1] - world_points[0]).cross(
            world_points[2] - world_points[0]
        )
        record = {
            "owner": obj,
            "ownerIndex": source_record["ownerIndex"],
            "triangleIndex": index,
            "polygonIndex": index,
            "material": source_record["material"],
            "materialName": source_record["materialName"],
            "smooth": source_record["smooth"],
            "localPoints": local_points,
            "localNormals": item["localNormals"],
            "points": world_points,
            "lineage": tuple(source_record["lineage"]),
            "lineageTrackedThroughCleanup": True,
            "rasterEligible": cross.length > 1.0e-14,
        }
        if record["rasterEligible"]:
            record.update({
                "semanticRank": source_record["semanticRank"],
                "semantic": source_record["semantic"],
                "normal": cross.normalized(),
                "area": cross.length * 0.5,
                "centroid": sum(world_points, Vector()) / 3.0,
                "exactKey": oriented_face_key(world_points),
            })
        records.append(record)
    return records


def _lineage_post_storage_proof(
        obj, items, source_record, intended_geometry, drop_axis):
    records = _lineage_realization_records(obj, items, source_record)
    axes = [axis for axis in range(3) if axis != drop_axis]
    intended_keys = set()
    realized_by_key = defaultdict(set)
    local_by_key = defaultdict(set)
    directed_edges = defaultdict(list)
    face_keys = set()
    duplicate_faces = 0
    degenerate = 0
    inverted = 0
    realized_polygons = []
    realized_area_sum = 0.0
    for item, record in zip(items, records):
        keys = item.get("projectedVertexKeys")
        if keys is None or len(keys) != 3:
            raise RuntimeError("lineage consolidation lost its projected vertex registry")
        keys = tuple(tuple(float(value) for value in key) for key in keys)
        intended_keys.update(keys)
        canonical_face = tuple(sorted(keys))
        if canonical_face in face_keys:
            duplicate_faces += 1
        face_keys.add(canonical_face)
        for index, key in enumerate(keys):
            local = tuple(float(value) for value in item["localPoints"][index])
            world = record["points"][index]
            local_by_key[key].add(tuple(
                struct.pack("<f", value) for value in local
            ))
            realized_by_key[key].add(tuple(
                struct.pack("<f", float(world[axis])) for axis in axes
            ))
            following = keys[(index + 1) % 3]
            edge = (key, following) if key < following else (following, key)
            directed_edges[edge].append(1 if key < following else -1)
        if not record["rasterEligible"]:
            degenerate += 1
            continue
        if record["normal"].dot(source_record["normal"]) <= 0.0:
            inverted += 1
        polygon = Polygon([
            (float(point[axes[0]]), float(point[axes[1]]))
            for point in record["points"]
        ])
        if polygon.is_empty or polygon.area <= 0.0:
            degenerate += 1
            continue
        realized_polygons.append(polygon)
        realized_area_sum += polygon.area
    edge_incidence_violations = sum(
        len(directions) > 2 for directions in directed_edges.values()
    )
    edge_traversal_violations = sum(
        len(directions) == 2 and sum(directions) != 0
        for directions in directed_edges.values()
    )
    shared_endpoint_violations = sum(
        len(values) != 1 for values in local_by_key.values()
    ) + sum(len(values) != 1 for values in realized_by_key.values())
    realized_projected_values = {
        next(iter(values)) for values in realized_by_key.values() if values
    }
    distinct_projected_vertices_preserved = (
        len(realized_by_key) == len(intended_keys)
        and len(realized_projected_values) == len(intended_keys)
        and shared_endpoint_violations == 0
    )
    realized_union = unary_union(realized_polygons) if realized_polygons else Polygon()
    symmetric_difference = realized_union.symmetric_difference(intended_geometry).area
    expanded_area = realized_union.difference(intended_geometry).area
    realized_overlap = max(0.0, realized_area_sum - realized_union.area)
    eligible_records = [record for record in records if record["rasterEligible"]]
    pairs, pair_metrics = discover_acceptance_pairs(eligible_records)
    all_local_points = [
        point for item in items for point in item["localPoints"]
    ]
    centered_proof = centered_local_plane_proof(
        obj, source_record["localPoints"][0], all_local_points,
        source_record["normal"],
    )
    storage_guard = float32_plane_storage_guard(
        obj, all_local_points, source_record["normal"],
    )
    representational_bound = source_plane_representational_error_bound(
        storage_guard, centered_proof["float32InputUlpBoundM"],
        CLIP_MARGIN_M * MAX_PASSES,
    )
    measured_drift = centered_proof["measuredStoredDriftM"]
    arithmetic_guard = centered_proof["float64ArithmeticGuardM"]
    return {
        "intendedProjectedVertexCount": len(intended_keys),
        "realizedProjectedVertexCount": len(realized_projected_values),
        "distinctProjectedVerticesPreserved": distinct_projected_vertices_preserved,
        "nearDuplicateIntendedSharedEndpointViolations": shared_endpoint_violations,
        "internalEdgeIncidenceViolations": edge_incidence_violations,
        "internalEdgeOppositeTraversalViolations": edge_traversal_violations,
        "internalDuplicateFaces": duplicate_faces,
        "degenerateTriangles": degenerate,
        "invertedTriangles": inverted,
        "intendedProjectedAreaM2": intended_geometry.area,
        "realizedProjectedTriangleAreaSumM2": realized_area_sum,
        "realizedProjectedUnionAreaM2": realized_union.area,
        "realizedProjectedOverlapAreaM2": realized_overlap,
        "intendedVsRealizedProjectedSymmetricDifferenceM2": symmetric_difference,
        "realizedProjectedCoverageExpansionAreaM2": expanded_area,
        "acceptedCoverageExpanded": expanded_area > 0.0,
        "acceptedPairs": len(pairs),
        "acceptedRiskAreaM2": pair_metrics["riskAreaM2"],
        "sourcePlaneMeasuredStoredDriftM": measured_drift,
        "sourcePlaneArithmeticGuardM": arithmetic_guard,
        "sourcePlaneRepresentationalErrorBoundM": representational_bound,
        "sourcePlaneActualDriftBoundPassed": (
            measured_drift + arithmetic_guard <= BOUNDS_DRIFT_LIMIT_M
        ),
        "sourcePlaneRepresentationalBoundPassed": (
            measured_drift <= representational_bound + arithmetic_guard
        ),
        "_realizedGeometry": realized_union,
        "_records": eligible_records,
        "_pairs": pairs,
    }


def _lineage_boundary_adjacencies(geometry):
    output = set()
    for polygon in iter_polygons(geometry):
        for ring in (polygon.exterior, *polygon.interiors):
            points = [
                (float(point[0]), float(point[1]))
                for point in list(ring.coords)[:-1]
            ]
            for start, end in zip(points, points[1:] + points[:1]):
                if start != end:
                    output.add(
                        (start, end) if start < end else (end, start)
                    )
    return output


def _partition_storage_collisions(
        items, records, pairs, intended_geometry, source_record, drop_axis):
    boundary_edges = _lineage_boundary_adjacencies(intended_geometry)
    collisions = {}
    for first_index, second_index, _overlap in pairs:
        first_item, second_item = items[first_index], items[second_index]
        first_record, second_record = records[first_index], records[second_index]
        for first_vertex, first_key in enumerate(first_item["projectedVertexKeys"]):
            for second_vertex, second_key in enumerate(second_item["projectedVertexKeys"]):
                first_key, second_key = tuple(first_key), tuple(second_key)
                if first_key == second_key:
                    continue
                edge = tuple(sorted((first_key, second_key)))
                if edge not in boundary_edges:
                    continue
                first_world = first_record["points"][first_vertex]
                second_world = second_record["points"][second_vertex]
                if float(first_world[drop_axis]) != float(second_world[drop_axis]):
                    continue
                first_exact = _immutable_plane_omitted_coordinate(
                    first_key, drop_axis, source_record,
                )
                second_exact = _immutable_plane_omitted_coordinate(
                    second_key, drop_axis, source_record,
                )
                if first_exact == second_exact:
                    continue
                lower = (first_key, first_exact) if first_exact < second_exact else (
                    second_key, second_exact
                )
                upper = (second_key, second_exact) if first_exact < second_exact else (
                    first_key, first_exact
                )
                collisions[(lower[0], upper[0])] = {
                    "lowerKey": lower[0],
                    "lowerExactOmittedM": lower[1],
                    "upperKey": upper[0],
                    "upperExactOmittedM": upper[1],
                    "collapsedStoredOmittedM": float(first_world[drop_axis]),
                    "adjacentIntendedBoundaryVertices": True,
                    "triggeredByAcceptedSameLineagePair": True,
                }
    return [collisions[key] for key in sorted(collisions)]


def _one_ulp_omitted_axis_candidates(obj, local_point, drop_axis, direction):
    baseline_local = tuple(_float32_value(value) for value in local_point)
    baseline_world = obj.matrix_world @ Vector(baseline_local)
    target_world = _adjacent_float32(baseline_world[drop_axis], direction)
    axes = [axis for axis in range(3) if axis != drop_axis]
    candidates = []
    for local_axis in range(3):
        for local_direction in (-1, 1):
            first_local = _adjacent_float32(
                baseline_local[local_axis], local_direction,
            )
            local_ulp = abs(first_local - baseline_local[local_axis])
            contribution = (
                abs(float(obj.matrix_world[drop_axis][local_axis])) * local_ulp
            )
            if contribution <= 0.0:
                continue
            # The stored world translation/addition can have a much coarser ULP
            # than the local mesh coordinate (Cityform needs several local X
            # steps before world X changes once). Derive the search count from
            # those two representations, but still accept only the immediately
            # adjacent omitted-axis *world* float32 and unchanged projected axes.
            world_ulp = abs(target_world - float(baseline_world[drop_axis]))
            step_limit = int(math.ceil(world_ulp / contribution)) + 4
            if step_limit > 4096:
                continue
            value = baseline_local[local_axis]
            for local_ulp_steps in range(1, step_limit + 1):
                value = _adjacent_float32(value, local_direction)
                values = list(baseline_local)
                values[local_axis] = value
                candidate = Vector(values)
                world = obj.matrix_world @ candidate
                world_value = float(world[drop_axis])
                if world_value == target_world and all(
                        float(world[axis]) == float(baseline_world[axis])
                        for axis in axes):
                    candidates.append({
                        "localPoint": candidate,
                        "localAxis": local_axis,
                        "localDirection": local_direction,
                        "localUlpSteps": local_ulp_steps,
                        "baselineWorldOmittedM": float(
                            baseline_world[drop_axis]
                        ),
                        "selectedWorldOmittedM": world_value,
                        "worldOmittedShiftM": (
                            world_value - float(baseline_world[drop_axis])
                        ),
                        "worldOmittedAxisOneUlp": True,
                        "projectedWorldCoordinatesUnchanged": True,
                    })
                    break
                if ((direction > 0 and world_value > target_world)
                        or (direction < 0 and world_value < target_world)):
                    break
    return candidates


def _replace_projected_registry_vertex(items, projected_key, local_point):
    output = []
    replacement = Vector(local_point)
    for item in items:
        clone = dict(item)
        clone["localPoints"] = tuple(
            replacement.copy() if tuple(key) == tuple(projected_key) else Vector(point)
            for key, point in zip(item["projectedVertexKeys"], item["localPoints"])
        )
        output.append(clone)
    return output


def _partition_proof_is_safe(proof):
    return (
        proof["distinctProjectedVerticesPreserved"] is True
        and proof["nearDuplicateIntendedSharedEndpointViolations"] == 0
        and proof["internalEdgeIncidenceViolations"] == 0
        and proof["internalEdgeOppositeTraversalViolations"] == 0
        and proof["internalDuplicateFaces"] == 0
        and proof["degenerateTriangles"] == 0
        and proof["invertedTriangles"] == 0
        and proof["realizedProjectedOverlapAreaM2"] == 0.0
        and proof["intendedVsRealizedProjectedSymmetricDifferenceM2"] == 0.0
        and proof["realizedProjectedCoverageExpansionAreaM2"] == 0.0
        and proof["acceptedCoverageExpanded"] is False
        and proof["sourcePlaneActualDriftBoundPassed"] is True
        and proof["sourcePlaneRepresentationalBoundPassed"] is True
    )


def stabilize_float32_same_lineage_partition(
        obj, lineage, items, source_record, intended_geometry, drop_axis,
        enabled):
    """Resolve only an accepted topology-proven float32 partition collapse.

    The two projected union vertices remain distinct and bit-identical in the
    retained axes. A single local float32 coordinate may move by one ULP only
    when that produces the immediately adjacent omitted-axis world float and a
    complete post-storage proof shows zero footprint change or fresh pair.
    """
    baseline = _lineage_post_storage_proof(
        obj, items, source_record, intended_geometry, drop_axis,
    )
    # Canonical shared-edge reconstruction predates this repair and may already
    # have snapped a projected boundary coordinate within its existing guard.
    # The partition realization changes only the omitted axis, so its coverage
    # authority is the actual baseline post-storage footprint. Keep the older
    # consolidation-intent delta separately visible and require it to remain
    # bit-for-bit unchanged rather than attributing it to this one-ULP choice.
    realization_intended_geometry = baseline["_realizedGeometry"]
    current_items = items
    current = baseline
    adjustments = []
    if enabled and current["acceptedPairs"]:
        while current["acceptedPairs"]:
            collisions = _partition_storage_collisions(
                current_items, current["_records"], current["_pairs"],
                intended_geometry, source_record, drop_axis,
            )
            if not collisions:
                break
            registry = {}
            for item in current_items:
                for key, local in zip(
                        item["projectedVertexKeys"], item["localPoints"]):
                    registry.setdefault(tuple(key), Vector(local))
            options = []
            candidate_count = 0
            rejection_samples = []
            for collision in collisions:
                for key_name, direction in (("lowerKey", -1), ("upperKey", 1)):
                    key = tuple(collision[key_name])
                    for candidate in _one_ulp_omitted_axis_candidates(
                            obj, registry[key], drop_axis, direction):
                        candidate_count += 1
                        candidate_items = _replace_projected_registry_vertex(
                            current_items, key, candidate["localPoint"],
                        )
                        proof = _lineage_post_storage_proof(
                            obj, candidate_items, source_record,
                            realization_intended_geometry, drop_axis,
                        )
                        safe = _partition_proof_is_safe(proof)
                        makes_pair_progress = (
                            proof["acceptedPairs"] < current["acceptedPairs"]
                        )
                        if not safe or not makes_pair_progress:
                            if len(rejection_samples) < MAX_CONFLICT_SAMPLES:
                                rejection_samples.append({
                                    "projectedVertex": list(key),
                                    "direction": direction,
                                    "localAxis": candidate["localAxis"],
                                    "localDirection": candidate["localDirection"],
                                    "localUlpSteps": candidate["localUlpSteps"],
                                    "worldOmittedShiftM": candidate[
                                        "worldOmittedShiftM"
                                    ],
                                    "safe": safe,
                                    "makesPairProgress": makes_pair_progress,
                                    **{
                                        name: value for name, value in proof.items()
                                        if not name.startswith("_")
                                    },
                                })
                            continue
                        selected_world = obj.matrix_world @ candidate["localPoint"]
                        plane_drift = abs(sum(
                            float(source_record["normal"][axis]) * (
                                float(selected_world[axis])
                                - float(source_record["points"][0][axis])
                            )
                            for axis in range(3)
                        ))
                        options.append((
                            (
                                proof["acceptedPairs"], plane_drift,
                                abs(candidate["worldOmittedShiftM"]), key,
                                candidate["localAxis"], candidate["localDirection"],
                            ),
                            candidate_items, proof, collision, key, candidate,
                            plane_drift,
                        ))
            if not options:
                raise RuntimeError(
                    "accepted float32 same-lineage partition collapse has no "
                    "coverage-preserving one-ULP realization on %s %r; evidence=%s" % (
                        obj.name_full, lineage, json.dumps({
                            "acceptedPairs": current["acceptedPairs"],
                            "collisionCount": len(collisions),
                            "candidateCount": candidate_count,
                            "collisions": collisions[:MAX_CONFLICT_SAMPLES],
                            "rejections": rejection_samples,
                        }, separators=(",", ":")),
                    )
                )
            (_score, current_items, current, collision, key, candidate,
             plane_drift) = min(options, key=lambda value: value[0])
            adjustments.append({
                "projectedVertex": list(key),
                "distinctProjectedVerticesPreserved": True,
                "adjacentIntendedBoundaryVertices": (
                    collision["adjacentIntendedBoundaryVertices"]
                ),
                "triggeredByAcceptedSameLineagePair": (
                    collision["triggeredByAcceptedSameLineagePair"]
                ),
                "exactOmittedSeparationM": (
                    collision["upperExactOmittedM"]
                    - collision["lowerExactOmittedM"]
                ),
                "collapsedStoredOmittedM": collision["collapsedStoredOmittedM"],
                "localAxis": candidate["localAxis"],
                "localDirection": candidate["localDirection"],
                "localUlpSteps": candidate["localUlpSteps"],
                "baselineWorldOmittedM": candidate["baselineWorldOmittedM"],
                "selectedWorldOmittedM": candidate["selectedWorldOmittedM"],
                "worldOmittedShiftM": candidate["worldOmittedShiftM"],
                "worldOmittedAxisOneUlp": candidate["worldOmittedAxisOneUlp"],
                "projectedWorldCoordinatesUnchanged": (
                    candidate["projectedWorldCoordinatesUnchanged"]
                ),
                "sourcePlaneDistanceM": plane_drift,
            })
            if len(adjustments) > len(registry):
                raise RuntimeError(
                    "float32 partition realization exceeded its vertex registry"
                )
        if adjustments and current["acceptedPairs"]:
            raise RuntimeError(
                "float32 same-lineage partition realization left %d fresh pairs "
                "on %s %r" % (current["acceptedPairs"], obj.name_full, lineage)
            )
    applied = bool(adjustments)
    baseline_consolidation_symmetric_difference = (
        baseline["_realizedGeometry"].symmetric_difference(
            intended_geometry
        ).area
    )
    baseline_consolidation_expansion = baseline[
        "_realizedGeometry"
    ].difference(intended_geometry).area
    final_consolidation_symmetric_difference = (
        current["_realizedGeometry"].symmetric_difference(
            intended_geometry
        ).area
    )
    final_consolidation_expansion = current[
        "_realizedGeometry"
    ].difference(intended_geometry).area
    preexisting_coverage_delta_unchanged = (
        baseline_consolidation_symmetric_difference
        == final_consolidation_symmetric_difference
        and baseline_consolidation_expansion == final_consolidation_expansion
    )
    if applied and not _partition_proof_is_safe(current):
        raise RuntimeError(
            "float32 same-lineage partition realization failed its post-storage proof"
        )
    if applied and not preexisting_coverage_delta_unchanged:
        raise RuntimeError(
            "float32 same-lineage partition realization changed the pre-existing "
            "canonical-edge coverage delta"
        )
    return current_items, {
        "method": (
            "TOPOLOGY_ACCEPTED_PAIR_TRIGGERED_ADJACENT_FLOAT32_OMITTED_AXIS_ULP"
        ),
        "enabledByAcceptedSameLineagePair": bool(enabled),
        "applied": applied,
        "adjustmentCount": len(adjustments),
        "acceptedPairsBefore": baseline["acceptedPairs"],
        "acceptedPairsAfter": current["acceptedPairs"],
        "freshScanZero": (not applied or current["acceptedPairs"] == 0),
        "mergesProjectedVertices": False,
        "expandsAcceptedCoverage": current["acceptedCoverageExpanded"],
        "consolidationIntentVsBaselineRealizedSymmetricDifferenceM2": (
            baseline_consolidation_symmetric_difference
        ),
        "consolidationIntentVsBaselineRealizedExpansionAreaM2": (
            baseline_consolidation_expansion
        ),
        "consolidationIntentVsFinalRealizedSymmetricDifferenceM2": (
            final_consolidation_symmetric_difference
        ),
        "consolidationIntentVsFinalRealizedExpansionAreaM2": (
            final_consolidation_expansion
        ),
        "preexistingCanonicalEdgeCoverageDeltaUnchanged": (
            preexisting_coverage_delta_unchanged
        ),
        "adjustments": adjustments,
        **{
            key: value for key, value in current.items()
            if not key.startswith("_")
        },
    }


def _append_item_with_lineage_vertex_pool(
        item, vertices, faces, vertex_pool):
    projected_keys = item.get("projectedVertexKeys")
    if projected_keys is None:
        base = len(vertices)
        vertices.extend(
            tuple(float(value) for value in point)
            for point in item["localPoints"]
        )
        faces.append((base, base + 1, base + 2))
        return 0
    indices = []
    reused = 0
    lineage = tuple(item["lineage"])
    for projected_key, point in zip(projected_keys, item["localPoints"]):
        pool_key = (lineage, tuple(projected_key))
        local = tuple(_float32_value(value) for value in point)
        existing = vertex_pool.get(pool_key)
        if existing is None:
            index = len(vertices)
            vertices.append(local)
            vertex_pool[pool_key] = (index, tuple(
                struct.pack("<f", value) for value in local
            ))
        else:
            index, stored = existing
            if stored != tuple(struct.pack("<f", value) for value in local):
                raise RuntimeError(
                    "lineage projected vertex has multiple local float32 realizations: %r"
                    % (pool_key,)
                )
            reused += 1
        indices.append(index)
    if len(set(indices)) != 3:
        raise RuntimeError("lineage vertex pooling produced a degenerate face")
    faces.append(tuple(indices))
    return reused


def _assert_cityform_float32_partition_realization_contract():
    """Actual Cityform lineage (1,1232): stored 1->1 must become 1->0."""
    class FixtureOwner:
        name_full = "CITYFORM_LINEAGE_1_1232_FIXTURE"
        matrix_world = Matrix.Translation((650.0, -220.0, 0.0))

    owner = FixtureOwner()
    local_points = tuple(Vector(point) for point in (
        (-21.19830322265625, -10.510848999023438, 93.69999694824219),
        (-20.59832763671875, -11.11083984375, 93.69999694824219),
        (-20.05194091796875, -10.75689697265625, 95.94316864013672),
    ))
    world_points = tuple(owner.matrix_world @ point for point in local_points)
    normal = Vector((
        -0.6802501678466797, -0.68023282289505, 0.2730255722999573,
    ))
    source = {
        "owner": owner,
        "ownerIndex": 1,
        "triangleIndex": 1232,
        "polygonIndex": 1232,
        "material": 0,
        "materialName": "MF_MODBLD_V1_MAT_F_METAL",
        "semanticRank": 30,
        "semantic": "METAL_ROOF",
        "smooth": False,
        "localPoints": local_points,
        "localNormals": (normal.copy(), normal.copy(), normal.copy()),
        "points": world_points,
        "normal": normal,
        "lineage": (1, 1232),
        "lineageTrackedThroughCleanup": True,
        "rasterEligible": True,
    }
    pass5_geometry = Polygon((
        (-231.02313232421875, 94.25467681884766),
        (-231.01942443847656, 94.25467681884766),
        (-231.01943969726562, 94.25457763671875),
        (-231.0193328857422, 94.25454711914062),
        (-231.0207977294922, 94.25459289550781),
        (-231.01942443847656, 94.25454711914062),
        (-231.01943969726562, 94.25452423095703),
        (-231.01205444335938, 94.25269317626953),
        (-231.01205444335938, 94.25273895263672),
        (-231.01156616210938, 94.25262451171875),
        (-231.01148986816406, 94.25304412841797),
        (-230.98208618164062, 94.25247192382812),
        (-230.98208618164062, 94.25247955322266),
        (-230.9818572998047, 94.25247192382812),
        (-230.9818572998047, 94.25289916992188),
        (-230.96710205078125, 94.252197265625),
        (-230.96710205078125, 94.25220489501953),
        (-230.96658325195312, 94.25218200683594),
        (-230.9658203125, 94.25516510009766),
        (-230.9663848876953, 94.25516510009766),
        (-230.96612548828125, 94.25675201416016),
        (-230.96469116210938, 94.25672149658203),
        (-230.9646759033203, 94.25672149658203),
        (-230.95303344726562, 94.33551788330078),
        (-230.95301818847656, 94.33566284179688),
        (-230.95339965820312, 94.33557891845703),
        (-230.95350646972656, 94.3355941772461),
        (-230.92771911621094, 94.49651336669922),
        (-230.92774963378906, 94.4965591430664),
        (-230.9851531982422, 94.4965591430664),
        (-230.75689697265625, 95.94316864013672),
        (-230.51084899902344, 93.69999694824219),
        (-231.11083984375, 93.69999694824219),
        (-231.0233154296875, 94.25467681884766),
    ))
    pass3_geometry = Polygon((
        (-231.01162719726562, 94.25467681884766),
        (-231.01177978515625, 94.25430297851562),
        (-230.9671065341899, 94.25219747693319),
        (-230.9671043946457, 94.25220569672194),
        (-230.9665901669535, 94.25218146310958),
        (-230.9658135259697, 94.25516510009766),
        (-230.96638219496782, 94.25516510009766),
        (-230.96612548828125, 94.25675201416016),
        (-230.96469116210938, 94.25672149658203),
        (-230.9646759033203, 94.25672149658203),
        (-230.95303344726562, 94.33551788330078),
        (-230.95301818847656, 94.33566284179688),
        (-230.95339965820312, 94.33557891845703),
        (-230.95350646972656, 94.3355941772461),
        (-230.92771911621094, 94.49651336669922),
        (-230.92774963378906, 94.4965591430664),
        (-230.9851531982422, 94.4965591430664),
        (-230.75689697265625, 95.94316864013672),
        (-230.51084899902344, 93.69999694824219),
        (-231.11083984375, 93.69999694824219),
        (-231.02334594726562, 94.25468444824219),
    ))
    canonical_edges = tuple({"start": start, "end": end} for start, end in (
        (world_points[0], world_points[1]),
        (world_points[1], world_points[2]),
        (world_points[0], world_points[2]),
    ))
    for label, geometry, expected_vertices, expected_faces, expected_reuses in (
            ("pass3", pass3_geometry, 21, 19, 36),
            ("pass5", pass5_geometry, 34, 32, 62)):
        items = changed_triangles(
            source, geometry, 0, minimum_area=0.0,
            canonical_edges=canonical_edges,
        )
        before = _lineage_post_storage_proof(
            owner, items, source, geometry, 0,
        )
        if before["acceptedPairs"] != 1:
            raise RuntimeError(
                "Cityform %s fixture no longer reproduces 1 accepted pair" % label
            )
        items, proof = stabilize_float32_same_lineage_partition(
            owner, source["lineage"], items, source, geometry, 0, enabled=True,
        )
        required = (
            proof["applied"] is True
            and proof["adjustmentCount"] == 1
            and proof["acceptedPairsBefore"] == 1
            and proof["acceptedPairsAfter"] == 0
            and proof["freshScanZero"] is True
            and proof["mergesProjectedVertices"] is False
            and proof["distinctProjectedVerticesPreserved"] is True
            and proof["realizedProjectedOverlapAreaM2"] == 0.0
            and proof["intendedVsRealizedProjectedSymmetricDifferenceM2"] == 0.0
            and proof["realizedProjectedCoverageExpansionAreaM2"] == 0.0
            and proof["acceptedCoverageExpanded"] is False
            and proof["preexistingCanonicalEdgeCoverageDeltaUnchanged"] is True
            and proof["degenerateTriangles"] == 0
            and proof["invertedTriangles"] == 0
            and proof["internalDuplicateFaces"] == 0
            and proof["internalEdgeIncidenceViolations"] == 0
            and proof["internalEdgeOppositeTraversalViolations"] == 0
            and proof["nearDuplicateIntendedSharedEndpointViolations"] == 0
            and proof["sourcePlaneActualDriftBoundPassed"] is True
            and proof["sourcePlaneRepresentationalBoundPassed"] is True
        )
        if not required:
            raise RuntimeError(
                "Cityform %s fixture failed its post-storage proof: %s" % (
                    label, json.dumps(proof, separators=(",", ":")),
                )
            )
        if label == "pass3" and not (
                proof[
                    "consolidationIntentVsBaselineRealizedSymmetricDifferenceM2"
                ] > 0.0):
            raise RuntimeError(
                "Cityform pass3 fixture lost its pre-existing canonical-edge delta"
            )
        vertices, faces, pool = [], [], {}
        reused = sum(
            _append_item_with_lineage_vertex_pool(item, vertices, faces, pool)
            for item in items
        )
        if (len(faces) != expected_faces or len(vertices) != expected_vertices
                or reused != expected_reuses
                or any(len(set(face)) != 3 for face in faces)):
            raise RuntimeError(
                "Cityform %s fixture did not reuse one shared mesh index per "
                "projected vertex" % label
            )


_assert_cityform_float32_partition_realization_contract()


def mask_on_record_plane(geometry, pair_drop_axis, record, record_drop_axis):
    pair_axes = [axis for axis in range(3) if axis != pair_drop_axis]
    record_axes = [axis for axis in range(3) if axis != record_drop_axis]
    distance = record["normal"].dot(record["points"][0])

    def convert_ring(ring):
        converted = []
        for point in list(ring.coords)[:-1]:
            # Keep cleanup masks in Python/Shapely double precision.  Building
            # a mathutils.Vector here quantizes immediately to float32; at a
            # far world origin that collapsed genuine 1–40 um accepted
            # footprints to a line before they could be clipped or guarded.
            world = [0.0, 0.0, 0.0]
            world[pair_axes[0]], world[pair_axes[1]] = (
                float(point[0]), float(point[1]),
            )
            world[pair_drop_axis] = (
                float(distance)
                - float(record["normal"][pair_axes[0]]) * world[pair_axes[0]]
                - float(record["normal"][pair_axes[1]]) * world[pair_axes[1]]
            ) / float(record["normal"][pair_drop_axis])
            converted.append((
                world[record_axes[0]], world[record_axes[1]],
            ))
        return converted

    pieces = []
    for polygon in iter_polygons(geometry):
        exterior = convert_ring(polygon.exterior)
        holes = [convert_ring(ring) for ring in polygon.interiors]
        if len(exterior) >= 3:
            piece = Polygon(exterior, [ring for ring in holes if len(ring) >= 3])
            if not piece.is_valid:
                piece = piece.buffer(0)
            # This is a cleanup mask, not an acceptance test. Once a pair has
            # passed the 1e-6 m2 acceptance floor, no secondary area epsilon
            # may silently discard its transformed removal footprint.
            if not piece.is_empty and piece.area > 0.0:
                pieces.append(piece)
    return unary_union(pieces) if pieces else Polygon()


def visible_outputs(
        records, pairs, apply_record_local_removals=True,
        lineage_sources=None, canonical_source_edges=None):
    lineage_sources = lineage_sources or {}
    canonical_source_edges = canonical_source_edges or {}
    removals = defaultdict(list)
    remove_whole = set()
    samples = []
    conflict_count = 0
    exact_duplicate_conflicts = 0
    coherent_crossing_conflicts = 0
    mask_diagnostics = []
    record_local_removal_intersection_surface_area = 0.0
    immutable_plane_reconstructions = 0
    immutable_plane_reconstruction_area = 0.0
    for first_index, second_index, overlap in pairs:
        first, second = records[first_index], records[second_index]
        pair_axis = overlap["dropAxis"]
        if not overlap["_firstWins"].is_empty:
            if overlap["exactDuplicate"]:
                remove_whole.add(second_index)
            else:
                second_axis = max(range(3), key=lambda axis: abs(second["normal"][axis]))
                removal = mask_on_record_plane(
                    overlap["_firstWins"], pair_axis, second, second_axis,
                ).buffer(overlap["quantizationGuardM"], join_style="mitre")
                removals[second_index].append(removal)
            winner, loser, coverage = first, second, overlap["_firstWins"]
        else:
            if overlap["exactDuplicate"]:
                remove_whole.add(first_index)
            else:
                first_axis = max(range(3), key=lambda axis: abs(first["normal"][axis]))
                removal = mask_on_record_plane(
                    overlap["_secondWins"], pair_axis, first, first_axis,
                ).buffer(overlap["quantizationGuardM"], join_style="mitre")
                removals[first_index].append(removal)
            winner, loser, coverage = second, first, overlap["_secondWins"]
        conflict_count += 1
        exact_duplicate_conflicts += overlap["exactDuplicate"]
        coherent_crossing_conflicts += overlap["coherentCrossing"]
        if len(samples) < MAX_CONFLICT_SAMPLES:
            samples.append({
                "winnerObject": winner["owner"].name_full,
                "winnerMaterial": winner["materialName"],
                "winnerSemantic": winner["semantic"],
                "loserObject": loser["owner"].name_full,
                "loserMaterial": loser["materialName"],
                "loserSemantic": loser["semantic"],
                "overlapAreaM2": coverage.area,
                "planeDistanceM": overlap["planeDistance"],
                "depthRangeM": [overlap["minimumSeparation"], overlap["maximumSeparation"]],
                "exactDuplicate": overlap["exactDuplicate"],
                "coherentCrossing": overlap["coherentCrossing"],
                "rule": "PAIR_LOCAL_SIGNED_DEPTH_THEN_SEMANTIC_STABLE_OWNER",
            })

    if not apply_record_local_removals:
        return {
            index: [_unchanged_triangle(record)]
            for index, record in enumerate(records)
        }, {
            "conflictCount": conflict_count,
            "exactDuplicateConflicts": exact_duplicate_conflicts,
            "coherentCrossingConflicts": coherent_crossing_conflicts,
            "samples": samples,
            "samplesTruncated": conflict_count > len(samples),
            "maskDiagnostics": [],
            "maskDiagnosticsTruncated": False,
            "recordLocalRemovalIntersectionSurfaceAreaM2": 0.0,
            "immutablePlaneSubsequentPassReconstructions": 0,
            "immutablePlaneSubsequentPassReconstructionAreaM2": 0.0,
            "immutablePlaneSubsequentPassAcceptedCoverageExpanded": False,
        }

    outputs = {}
    for index, record in enumerate(records):
        if index in remove_whole:
            outputs[index] = []
            record_local_removal_intersection_surface_area += record["area"]
            if len(mask_diagnostics) < MAX_CONFLICT_SAMPLES:
                mask_diagnostics.append({
                    "object": record["owner"].name_full,
                    "triangle": record["triangleIndex"],
                    "material": record["materialName"],
                    "wholeExactDuplicateRemoved": True,
                    "sourceAreaM2": record["area"],
                    "removalMaskAreaM2": record["area"],
                    "sourceMaskIntersectionAreaM2": record["area"],
                    "visibleAreaM2": 0.0,
                    "outputTriangles": 0,
                })
            continue
        if not removals[index]:
            outputs[index] = [_unchanged_triangle(record)]
            continue
        drop_axis = max(range(3), key=lambda axis: abs(record["normal"][axis]))
        source = polygon_for(record, drop_axis)
        coverage = unary_union(removals[index])
        visible = source.difference(coverage)
        intersection_area = source.intersection(coverage).area
        intersection_surface_area = (
            intersection_area / abs(record["normal"][drop_axis])
        )
        record_local_removal_intersection_surface_area += intersection_surface_area
        if intersection_area <= 0.0:
            outputs[index] = [_unchanged_triangle(record)]
        else:
            reconstruction_record = record
            reconstruction_edges = ()
            immutable_plane = False
            if record["lineageTrackedThroughCleanup"]:
                key = (record["owner"], tuple(record["lineage"]))
                reconstruction_record = lineage_sources.get(key)
                if (reconstruction_record is None
                        or not reconstruction_record.get("rasterEligible")):
                    raise RuntimeError(
                        "missing immutable lineage reconstruction source on %s: %r"
                        % (record["owner"].name_full, record["lineage"])
                    )
                if (reconstruction_record["material"] != record["material"]
                        or reconstruction_record["materialName"]
                        != record["materialName"]):
                    raise RuntimeError(
                        "immutable lineage reconstruction changed material on %s: %r"
                        % (record["owner"].name_full, record["lineage"])
                    )
                reconstruction_edges = canonical_source_edges.get(key, ())
                immutable_plane = True
            # The accepted removal mask and its surviving 2D footprint are
            # already fixed above.  Only the omitted coordinate and normals
            # come from the immutable source record; a derived sliver normal
            # can amplify sub-ULP vertex noise into visible plane drift on a
            # later pass.  This branch cannot expand accepted coverage because
            # neither `coverage` nor `visible` is recomputed or replaced.
            accepted_coverage_before = coverage.area
            visible_area_before = visible.area
            outputs[index] = changed_triangles(
                reconstruction_record, visible, drop_axis,
                canonical_edges=reconstruction_edges,
            )
            if (coverage.area != accepted_coverage_before
                    or visible.area != visible_area_before):
                raise RuntimeError(
                    "immutable-plane reconstruction changed accepted 2D coverage"
                )
            if immutable_plane:
                immutable_plane_reconstructions += 1
                immutable_plane_reconstruction_area += visible.area
        if len(mask_diagnostics) < MAX_CONFLICT_SAMPLES:
            mask_diagnostics.append({
                "object": record["owner"].name_full,
                "triangle": record["triangleIndex"],
                "material": record["materialName"],
                "wholeExactDuplicateRemoved": False,
                "sourceAreaM2": source.area,
                "removalMaskAreaM2": coverage.area,
                "sourceMaskIntersectionAreaM2": intersection_area,
                "symmetricDifferenceAreaM2": source.symmetric_difference(visible).area,
                "visibleAreaM2": visible.area,
                "outputTriangles": len(outputs[index]),
                "mutated": bool(outputs[index] and outputs[index][0]["changed"])
                or not outputs[index],
            })
    return outputs, {
        "conflictCount": conflict_count,
        "exactDuplicateConflicts": exact_duplicate_conflicts,
        "coherentCrossingConflicts": coherent_crossing_conflicts,
        "samples": samples,
        "samplesTruncated": conflict_count > len(samples),
        "maskDiagnostics": mask_diagnostics,
        "maskDiagnosticsTruncated": len(removals) + len(remove_whole) > len(mask_diagnostics),
        "recordLocalRemovalIntersectionSurfaceAreaM2": (
            record_local_removal_intersection_surface_area
        ),
        "immutablePlaneSubsequentPassReconstructions": (
            immutable_plane_reconstructions
        ),
        "immutablePlaneSubsequentPassReconstructionAreaM2": (
            immutable_plane_reconstruction_area
        ),
        "immutablePlaneSubsequentPassAcceptedCoverageExpanded": False,
    }


def collect_lineage_removal_masks(
        records, pairs, lineage_sources, canonical_source_pair_edges):
    """Lift pair-local loser masks onto each immutable source lineage plane.

    Record-local clipping is still useful for the current fragment, but a
    lineage may already contain sibling fragments from an earlier pass.  If
    only the record is clipped, a sibling can put the removed coverage back
    when the lineage union is rebuilt.  Applying the same accepted mask once
    to the complete lineage union makes that removal coherent without changing
    discovery or adding a minimum-width exemption.
    """
    masks = defaultdict(list)
    samples = []
    total_area = 0.0
    exact_masks = 0
    coherent_masks = 0
    single_fragment_pairs = 0
    empty_lineage_masks_kept_record_local = 0
    shared_source_edge_strip_masks = 0
    shared_source_edge_strip_area = 0.0
    single_fragment_pairs_with_localized_edge_strip = 0
    shared_source_edge_strip_samples = []
    generic_lineage_mask_count = 0
    lineage_fragment_counts = defaultdict(int)
    for record in records:
        lineage_fragment_counts[(
            record["owner"], tuple(record["lineage"]),
        )] += 1
    for first_index, second_index, overlap in pairs:
        first, second = records[first_index], records[second_index]
        if not overlap["_firstWins"].is_empty:
            winner = first
            loser = second
            coverage = overlap["_firstWins"]
        else:
            winner = second
            loser = first
            coverage = overlap["_secondWins"]
        key = (loser["owner"], tuple(loser["lineage"]))
        source_record = lineage_sources.get(key)
        if source_record is None or not source_record.get("rasterEligible"):
            raise RuntimeError(
                "missing immutable lineage source for removal mask on %s: %r" % (
                    loser["owner"].name_full, loser["lineage"],
                )
            )
        shared_edges = ()
        if (winner["owner"] is loser["owner"]
                and winner["lineageTrackedThroughCleanup"]
                and loser["lineageTrackedThroughCleanup"]
                and winner["material"] == loser["material"]
                and winner["materialName"] == loser["materialName"]
                and tuple(winner["lineage"]) != tuple(loser["lineage"])):
            ordered_lineages = sorted((
                tuple(winner["lineage"]), tuple(loser["lineage"]),
            ))
            shared_edges = canonical_source_pair_edges.get((
                loser["owner"], ordered_lineages[0], ordered_lineages[1],
            ), ())
        source_axis = max(
            range(3), key=lambda axis: abs(source_record["normal"][axis]),
        )
        source_axes = [axis for axis in range(3) if axis != source_axis]
        guard = overlap["quantizationGuardM"]
        converted = mask_on_record_plane(
            coverage, overlap["dropAxis"], source_record, source_axis,
        )
        guarded_coverage = (
            converted.buffer(guard, join_style="mitre")
            if guard > 0.0 and not converted.is_empty else converted
        )
        pair_edge_strip_count = 0
        for edge in shared_edges:
            line = LineString((
                (
                    edge["start"][source_axes[0]],
                    edge["start"][source_axes[1]],
                ),
                (
                    edge["end"][source_axes[0]],
                    edge["end"][source_axes[1]],
                ),
            ))
            if line.is_empty or line.length <= 0.0:
                continue
            full_edge_band = line.buffer(
                guard, cap_style="flat", join_style="mitre",
            )
            # A source edge can be much longer than the accepted overlap.  The
            # quantization strip is a cleanup boundary guard, not permission to
            # cut that entire edge.  Localize it to the already-accepted loser
            # footprint (plus the same guard) so its effective coverage cannot
            # exceed the ordinary pair-local mutation envelope.
            strip = (
                full_edge_band.intersection(guarded_coverage)
                if not guarded_coverage.is_empty else Polygon()
            )
            if strip.is_empty or strip.area <= 0.0:
                continue
            masks[key].append(strip)
            pair_edge_strip_count += 1
            shared_source_edge_strip_masks += 1
            shared_source_edge_strip_area += strip.area
            if len(shared_source_edge_strip_samples) < MAX_CONFLICT_SAMPLES:
                shared_source_edge_strip_samples.append({
                    "object": loser["owner"].name_full,
                    "winnerLineage": list(winner["lineage"]),
                    "loserLineage": list(loser["lineage"]),
                    "material": loser["materialName"],
                    "acceptedCoverageAreaM2": coverage.area,
                    "guardedAcceptedCoverageAreaM2": guarded_coverage.area,
                    "fullSharedEdgeBandAreaM2": full_edge_band.area,
                    "localizedStripAreaM2": strip.area,
                    "quantizationGuardM": guard,
                })
        if lineage_fragment_counts[key] <= 1:
            if pair_edge_strip_count:
                single_fragment_pairs_with_localized_edge_strip += 1
            else:
                single_fragment_pairs += 1
            continue
        if converted.is_empty:
            # The ordinary record-local mask is still applied and final
            # acceptance still requires zero.  A supplemental immutable-plane
            # mask can be empty when the current fragment lies on a clipped
            # part of the source plane; treating that as an exemption would be
            # wrong, but retaining the proven local removal is safe.
            empty_lineage_masks_kept_record_local += 1
            continue
        masks[key].append(guarded_coverage)
        generic_lineage_mask_count += 1
        total_area += guarded_coverage.area
        exact_masks += overlap["exactDuplicate"]
        coherent_masks += overlap["coherentCrossing"]
        if len(samples) < MAX_CONFLICT_SAMPLES:
            samples.append({
                "object": loser["owner"].name_full,
                "lineage": list(loser["lineage"]),
                "material": loser["materialName"],
                "sourceTriangle": source_record["triangleIndex"],
                "currentTriangle": loser["triangleIndex"],
                "pairCoverageAreaM2": coverage.area,
                "immutablePlaneMaskAreaM2": guarded_coverage.area,
                "quantizationGuardM": guard,
                "exactDuplicate": overlap["exactDuplicate"],
                "coherentCrossing": overlap["coherentCrossing"],
            })
    return masks, {
        "lineageMaskCount": sum(len(values) for values in masks.values()),
        "lineagesMasked": len(masks),
        "lineageMaskAreaSumM2": total_area + shared_source_edge_strip_area,
        "exactDuplicateLineageMasks": exact_masks,
        "coherentCrossingLineageMasks": coherent_masks,
        "singleFragmentPairsKeptRecordLocal": single_fragment_pairs,
        "singleFragmentPairsWithLocalizedEdgeStrip": (
            single_fragment_pairs_with_localized_edge_strip
        ),
        "emptyLineageMasksKeptRecordLocal": empty_lineage_masks_kept_record_local,
        "sharedSourceEdgeStripMasks": shared_source_edge_strip_masks,
        "sharedSourceEdgeStripAreaM2": shared_source_edge_strip_area,
        "sharedSourceEdgeStripSamples": shared_source_edge_strip_samples,
        "sharedSourceEdgeStripSamplesTruncated": (
            shared_source_edge_strip_masks > len(shared_source_edge_strip_samples)
        ),
        "samples": samples,
        "samplesTruncated": generic_lineage_mask_count > len(samples),
    }


def consolidate_lineage_items(
        obj, lineage, items, source_record, removal_masks=(),
        canonical_edges=(), partition_realization_enabled=False):
    """Union one source triangle's surviving fragments on its immutable plane."""
    if not items:
        return [], {
            "lineage": list(lineage),
            "inputTriangles": 0,
            "outputTriangles": 0,
            "unionAreaM2": 0.0,
            "lineageRemovalMaskCount": len(removal_masks),
            "float32PartitionRealization": {
                "method": (
                    "TOPOLOGY_ACCEPTED_PAIR_TRIGGERED_ADJACENT_FLOAT32_"
                    "OMITTED_AXIS_ULP"
                ),
                "enabledByAcceptedSameLineagePair": bool(
                    partition_realization_enabled
                ),
                "applied": False,
                "adjustmentCount": 0,
                "freshScanZero": True,
                "mergesProjectedVertices": False,
                "expandsAcceptedCoverage": False,
            },
        }
    drop_axis = max(
        range(3), key=lambda axis: abs(source_record["normal"][axis]),
    )
    axes = [axis for axis in range(3) if axis != drop_axis]
    pieces = []
    all_world_points = []
    for item in items:
        world_points = [
            obj.matrix_world @ Vector(point) for point in item["localPoints"]
        ]
        all_world_points.extend(world_points)
        piece = Polygon([
            (point[axes[0]], point[axes[1]]) for point in world_points
        ])
        if not piece.is_valid:
            piece = piece.buffer(0)
        if not piece.is_empty and piece.area > 0.0:
            pieces.append(piece)
    quantization_guard = float32_depth_guard(source_record, source_record)
    # Consolidation must remain on its own immutable source plane.  The
    # 0.5 mm pair-acceptance depth is not permissible lineage drift; only the
    # reported float32 local-storage/transform guard applies here.
    storage_guard = float32_plane_storage_guard(
        obj,
        [point for item in items for point in item["localPoints"]],
        source_record["normal"],
    )
    centered_proof = centered_local_plane_proof(
        obj,
        source_record["localPoints"][0],
        [point for item in items for point in item["localPoints"]],
        source_record["normal"],
    )
    maximum_source_plane_distance = centered_proof["measuredStoredDriftM"]
    rebuild_accumulation_guard = CLIP_MARGIN_M * MAX_PASSES
    representational_error_bound = source_plane_representational_error_bound(
        storage_guard, centered_proof["float32InputUlpBoundM"],
        rebuild_accumulation_guard,
    )
    arithmetic_guard = centered_proof["float64ArithmeticGuardM"]
    if not all(math.isfinite(value) for value in (
            maximum_source_plane_distance, representational_error_bound,
            arithmetic_guard)):
        raise RuntimeError(
            "non-finite centered source-plane proof on %s %r"
            % (obj.name_full, lineage)
        )
    if maximum_source_plane_distance + arithmetic_guard > BOUNDS_DRIFT_LIMIT_M:
        raise RuntimeError(
            "lineage fragments drifted %.12g m from immutable source plane on %s %r; "
            "centered arithmetic guard %.12g m, actual-drift limit %.12g m" % (
                maximum_source_plane_distance, obj.name_full, lineage,
                arithmetic_guard, BOUNDS_DRIFT_LIMIT_M,
            )
        )
    if maximum_source_plane_distance > representational_error_bound + arithmetic_guard:
        raise RuntimeError(
            "lineage stored-plane drift %.12g m exceeds derived float32 "
            "representational bound %.12g m on %s %r; proof=%s" % (
                maximum_source_plane_distance, representational_error_bound,
                obj.name_full, lineage,
                json.dumps({
                    "sourceOwner": source_record["owner"].name_full,
                    "sourceTriangle": source_record["triangleIndex"],
                    "sourceLocalPoints": [
                        list(point) for point in source_record["localPoints"]
                    ],
                    "itemCount": len(items),
                    "itemLocalPoints": [
                        [list(point) for point in item["localPoints"]]
                        for item in items[:4]
                    ],
                    "sourceLocalPoint": list(source_record["localPoints"][0]),
                    "maximumDriftStoredLocalPoint": centered_proof[
                        "maximumDriftStoredLocalPoint"
                    ],
                    "maximumDriftLocalDelta": centered_proof[
                        "maximumDriftLocalDelta"
                    ],
                    "worldPlaneLocalCoefficients": centered_proof[
                        "worldPlaneLocalCoefficients"
                    ],
                    "float32InputUlpBoundM": centered_proof[
                        "float32InputUlpBoundM"
                    ],
                    "storageGuardM": storage_guard,
                    "rebuildAccumulationGuardM": rebuild_accumulation_guard,
                }, separators=(",", ":")),
            )
        )
    input_geometry = unary_union(pieces) if pieces else Polygon()
    source_footprint = polygon_for(source_record, drop_axis)
    outside_area = input_geometry.difference(source_footprint).area
    containment_tolerance = max(
        AREA_EPSILON_M2,
        source_footprint.length * quantization_guard * 2.0
        + quantization_guard * quantization_guard * 4.0,
    )
    if outside_area > containment_tolerance:
        raise RuntimeError(
            "lineage union escaped immutable source footprint by %.12g m2 on %s %r; "
            "tolerance %.12g m2" % (
                outside_area, obj.name_full, lineage, containment_tolerance,
            )
        )
    # Containment is a fail-closed proof, not another clipping operation.
    # Re-clipping every source footprint changed already-proven cleanup
    # boundaries and could create new pairs at the 0.5 mm depth limit.
    contained_geometry = input_geometry
    removal = unary_union(removal_masks) if removal_masks else Polygon()
    geometry = (
        contained_geometry.difference(removal)
        if not removal.is_empty else contained_geometry
    )
    removed_area = max(0.0, contained_geometry.area - geometry.area)
    removed_surface_area = removed_area / abs(source_record["normal"][drop_axis])
    consolidated = changed_triangles(
        source_record, geometry, drop_axis, minimum_area=0.0,
        canonical_edges=canonical_edges,
    )
    consolidated, partition_realization = (
        stabilize_float32_same_lineage_partition(
            obj, lineage, consolidated, source_record, geometry, drop_axis,
            enabled=partition_realization_enabled,
        )
    )
    return consolidated, {
        "lineage": list(lineage),
        "inputTriangles": len(items),
        "outputTriangles": len(consolidated),
        "inputAreaSumM2": sum(piece.area for piece in pieces),
        "inputUnionAreaM2": input_geometry.area,
        "immutableFootprintAreaM2": source_footprint.area,
        "outsideImmutableFootprintAreaM2": outside_area,
        "containmentToleranceM2": containment_tolerance,
        "containedUnionAreaM2": contained_geometry.area,
        "lineageRemovalMaskCount": len(removal_masks),
        "lineageRemovalMaskAreaM2": removal.area,
        "lineageRemovalIntersectionAreaM2": removed_area,
        "lineageRemovalIntersectionSurfaceAreaM2": removed_surface_area,
        "unionAreaM2": geometry.area,
        "maximumSourcePlaneDistanceM": maximum_source_plane_distance,
        "sourcePlaneGuardM": BOUNDS_DRIFT_LIMIT_M,
        "sourcePlaneQuantizationGuardM": representational_error_bound,
        "sourcePlaneGuardMethod": (
            "CENTERED_LOCAL_FLOAT64_DELTA_ACTUAL_STORED_DRIFT"
        ),
        "sourcePlaneStorageGuardM": storage_guard,
        "sourcePlaneDotGuardM": 0.0,
        "sourcePlaneWorldCoordinateGuardM": 0.0,
        "sourcePlaneMeasuredStoredDriftM": maximum_source_plane_distance,
        "sourcePlaneArithmeticGuardM": arithmetic_guard,
        "sourcePlaneRepresentationalErrorBoundM": representational_error_bound,
        "sourcePlaneRepresentationalErrorMethod": (
            "MAX_STORAGE_OR_ADDITIVE_CENTERED_FLOAT32_SOURCE_OUTPUT_LOCAL_"
            "ULP_PLUS_BOUNDED_REBUILD_ACCUMULATION"
        ),
        "sourcePlaneFloat32InputUlpBoundM": centered_proof[
            "float32InputUlpBoundM"
        ],
        "sourcePlaneRepresentationalComponentsCombinedBy": (
            "MAX_STORAGE_OR_INPUT_ULP_PLUS_REBUILD_ACCUMULATION"
        ),
        "sourcePlaneWorldOriginCancellationAvoided": (
            centered_proof["worldOriginCancellationAvoided"]
        ),
        "sourcePlaneWorldPlaneLocalCoefficients": (
            centered_proof["worldPlaneLocalCoefficients"]
        ),
        "sourcePlaneMaximumRebuildAccumulationGuardM": (
            rebuild_accumulation_guard
        ),
        "immutableSourcePlane": True,
        "immutableSourceFootprint": outside_area <= containment_tolerance,
        "immutableSourceFootprintExactContainment": (
            outside_area <= AREA_EPSILON_M2
        ),
        "immutableSourceFootprintClippingApplied": False,
        "canonicalSharedSourceEdgeCount": len(canonical_edges),
        "float32PartitionRealization": partition_realization,
    }


def rebuild_changed_objects(
        objects, records_by_lod, records_by_object, outputs_by_lod,
        lineage_by_object, lineage_sources, mutated_lineages, forced_lineages,
        lineage_removal_masks, canonical_source_edges):
    output_by_record = {}
    for lod, records in records_by_lod.items():
        for index, record in enumerate(records):
            output_by_record[id(record)] = outputs_by_lod[lod][index]
    reports = []
    for obj in objects:
        records = records_by_object[obj]
        record_outputs = {
            id(record): output_by_record.get(id(record), [_unchanged_triangle(record)])
            for record in records
        }
        items_by_lineage = defaultdict(list)
        lineage_order = []
        lineage_changed = defaultdict(bool)
        for record in records:
            lineage = tuple(record["lineage"])
            if lineage not in items_by_lineage:
                lineage_order.append(lineage)
            items = record_outputs[id(record)]
            items_by_lineage[lineage].extend(items)
            lineage_changed[lineage] = (
                lineage_changed[lineage]
                or not items
                or any(item["changed"] for item in items)
            )
        forced_for_object = {
            lineage for owner, lineage in forced_lineages if owner is obj
        }
        masked_for_object = {
            lineage: lineage_removal_masks[(owner, lineage)]
            for owner, lineage in lineage_removal_masks if owner is obj
        }
        changed = any(lineage_changed.values())
        removed = any(not record_outputs[id(record)] for record in records)
        if not changed and not removed and not forced_for_object and not masked_for_object:
            reports.append({"name": obj.name_full, "mutated": False})
            continue
        mesh = obj.data
        if any(len(polygon.vertices) != 3 for polygon in mesh.polygons):
            raise RuntimeError("refusing non-triangle topology rewrite: " + obj.name_full)
        if mesh.shape_keys:
            raise RuntimeError("refusing cleanup of shape-key mesh: " + obj.name_full)
        if len(mesh.color_attributes):
            raise RuntimeError("refusing cleanup of color-attribute mesh: " + obj.name_full)
        if len(obj.vertex_groups):
            raise RuntimeError("refusing cleanup of vertex-group mesh: " + obj.name_full)
        old = mesh
        old.calc_loop_triangles()
        old_name = old.name
        old_props = dict(old.items())
        old_materials = list(old.materials)
        if any(material is None for material in old_materials):
            raise RuntimeError("refusing cleanup with empty material slot: " + obj.name_full)
        consolidation_reports = []
        triangles = []
        for lineage in lineage_order:
            key = (obj, lineage)
            lineage_masks = masked_for_object.get(lineage, ())
            if (lineage_changed[lineage] or lineage in forced_for_object
                    or lineage_masks):
                mutated_lineages.add(key)
            items = items_by_lineage[lineage]
            if key in mutated_lineages:
                source_record = lineage_sources.get(key)
                if source_record is None or not source_record.get("rasterEligible"):
                    raise RuntimeError(
                        "missing immutable eligible lineage source on %s: %r" % (
                            obj.name_full, lineage,
                        )
                    )
                items, consolidation = consolidate_lineage_items(
                    obj, lineage, items, source_record,
                    removal_masks=lineage_masks,
                    canonical_edges=canonical_source_edges.get(key, ()),
                    partition_realization_enabled=(
                        lineage in forced_for_object
                    ),
                )
                consolidation_reports.append(consolidation)
            triangles.extend(items)
        vertices = []
        faces = []
        loop_normals = []
        material_indices = []
        smooth_flags = []
        lineages = []
        vertex_pool = {}
        shared_vertex_index_reuses = 0
        unchanged = 0
        for item in triangles:
            shared_vertex_index_reuses += _append_item_with_lineage_vertex_pool(
                item, vertices, faces, vertex_pool,
            )
            loop_normals.extend(tuple(float(value) for value in normal) for normal in item["localNormals"])
            material_indices.append(item["material"])
            smooth_flags.append(item["smooth"])
            lineages.append(tuple(item["lineage"]))
            unchanged += not item["changed"]
        old_users_before = old.users
        old.name = old_name + "_SOURCE"
        replacement = bpy.data.meshes.new(old_name)
        replacement.from_pydata(vertices, [], faces)
        replacement.update(calc_edges=True)
        shared_index_reuse_passed = (
            len(replacement.polygons) == len(faces)
            and all(
                tuple(polygon.vertices) == tuple(faces[index])
                for index, polygon in enumerate(replacement.polygons)
            )
        )
        if not shared_index_reuse_passed:
            raise RuntimeError(
                "mesh storage did not preserve lineage-scoped shared vertex indices: "
                + obj.name_full
            )
        for material in old_materials:
            replacement.materials.append(material)
        for key, value in old_props.items():
            replacement[key] = value
        for index, polygon in enumerate(replacement.polygons):
            polygon.material_index = material_indices[index]
            polygon.use_smooth = smooth_flags[index]
        if loop_normals:
            replacement.normals_split_custom_set(loop_normals)
        before_triangles = len(old.loop_triangles)
        obj.data = replacement
        lineage_by_object[obj] = lineages
        old_removed = False
        if old.users == 0:
            bpy.data.meshes.remove(old)
            old_removed = True
        replacement.calc_loop_triangles()
        source_plane_proof_reports = [
            report for report in consolidation_reports
            if "sourcePlaneMeasuredStoredDriftM" in report
        ]
        partition_enabled_reports = [
            report["float32PartitionRealization"]
            for report in consolidation_reports
            if report.get("float32PartitionRealization", {}).get(
                "enabledByAcceptedSameLineagePair"
            )
        ]
        partition_reports = [
            report["float32PartitionRealization"]
            for report in consolidation_reports
            if report.get("float32PartitionRealization", {}).get("applied")
        ]
        reports.append({
            "name": obj.name_full,
            "mutated": True,
            "trianglesBefore": before_triangles,
            "trianglesAfter": len(replacement.loop_triangles),
            "unchangedTrianglesPreserved": unchanged,
            "changedTriangles": len(triangles) - unchanged,
            "materialSlotsBefore": len(old_materials),
            "materialSlotsAfter": len(replacement.materials),
            "customNormalsAfter": replacement.has_custom_normals,
            "sharedMeshUsersBefore": old_users_before,
            "sourceMeshDatablockRemoved": old_removed,
            "lineageScopedSharedMeshVertexIndexReuses": (
                shared_vertex_index_reuses
            ),
            "sharedMeshVertexIndexReusePassed": shared_index_reuse_passed,
            "float32PartitionRealizationEnabledConsolidations": len(
                partition_enabled_reports
            ),
            "float32PartitionRealizationApplications": len(partition_reports),
            "float32PartitionRealizationAdjustments": sum(
                report.get("adjustmentCount", 0) for report in partition_reports
            ),
            "float32PartitionRealizationAcceptedPairsBefore": sum(
                report.get("acceptedPairsBefore", 0) for report in partition_reports
            ),
            "float32PartitionRealizationAcceptedPairsAfter": sum(
                report.get("acceptedPairsAfter", 0) for report in partition_reports
            ),
            "float32PartitionRealizationAllFreshScansZero": all(
                report.get("freshScanZero") is True for report in partition_reports
            ),
            "float32PartitionRealizationAllDistinctProjectedVerticesPreserved": all(
                report.get("distinctProjectedVerticesPreserved") is True
                for report in partition_reports
            ),
            "float32PartitionRealizationAllMergesProjectedVerticesFalse": all(
                report.get("mergesProjectedVertices") is False
                for report in partition_reports
            ),
            "float32PartitionRealizationMaximumProjectedOverlapAreaM2": max((
                report.get("realizedProjectedOverlapAreaM2", 0.0)
                for report in partition_reports
            ), default=0.0),
            "float32PartitionRealizationTotalProjectedOverlapAreaM2": sum(
                report.get("realizedProjectedOverlapAreaM2", 0.0)
                for report in partition_reports
            ),
            "float32PartitionRealizationMaximumProjectedSymmetricDifferenceM2": max((
                report.get(
                    "intendedVsRealizedProjectedSymmetricDifferenceM2", 0.0,
                )
                for report in partition_reports
            ), default=0.0),
            "float32PartitionRealizationTotalProjectedSymmetricDifferenceM2": sum(
                report.get(
                    "intendedVsRealizedProjectedSymmetricDifferenceM2", 0.0,
                )
                for report in partition_reports
            ),
            "float32PartitionRealizationMaximumCoverageExpansionAreaM2": max((
                report.get("realizedProjectedCoverageExpansionAreaM2", 0.0)
                for report in partition_reports
            ), default=0.0),
            "float32PartitionRealizationTotalCoverageExpansionAreaM2": sum(
                report.get("realizedProjectedCoverageExpansionAreaM2", 0.0)
                for report in partition_reports
            ),
            "float32PartitionRealizationAcceptedCoverageExpanded": any(
                report.get("acceptedCoverageExpanded") is True
                for report in partition_reports
            ),
            "float32PartitionRealizationAllExpandsAcceptedCoverageFalse": all(
                report.get("expandsAcceptedCoverage") is False
                for report in partition_reports
            ),
            "float32PartitionRealizationAllPreexistingCoverageDeltasUnchanged": all(
                report.get(
                    "preexistingCanonicalEdgeCoverageDeltaUnchanged"
                ) is True for report in partition_reports
            ),
            "float32PartitionRealizationMaximumPreexistingSymmetricDifferenceM2": max((
                report.get(
                    "consolidationIntentVsBaselineRealizedSymmetricDifferenceM2",
                    0.0,
                ) for report in partition_reports
            ), default=0.0),
            "float32PartitionRealizationMaximumPreexistingExpansionAreaM2": max((
                report.get(
                    "consolidationIntentVsBaselineRealizedExpansionAreaM2", 0.0,
                ) for report in partition_reports
            ), default=0.0),
            "float32PartitionRealizationDegenerateTriangles": sum(
                report.get("degenerateTriangles", 0) for report in partition_reports
            ),
            "float32PartitionRealizationInvertedTriangles": sum(
                report.get("invertedTriangles", 0) for report in partition_reports
            ),
            "float32PartitionRealizationInternalDuplicateFaces": sum(
                report.get("internalDuplicateFaces", 0) for report in partition_reports
            ),
            "float32PartitionRealizationInternalEdgeViolations": sum(
                report.get("internalEdgeIncidenceViolations", 0)
                + report.get("internalEdgeOppositeTraversalViolations", 0)
                for report in partition_reports
            ),
            "float32PartitionRealizationNearDuplicateSharedEndpointViolations": sum(
                report.get("nearDuplicateIntendedSharedEndpointViolations", 0)
                for report in partition_reports
            ),
            "float32PartitionRealizationAllRepresentationalBoundsPassed": all(
                report.get("sourcePlaneRepresentationalBoundPassed") is True
                for report in partition_reports
            ),
            "float32PartitionRealizationAllActualDriftBoundsPassed": all(
                report.get("sourcePlaneActualDriftBoundPassed") is True
                for report in partition_reports
            ),
            "float32PartitionRealizationMaximumSourcePlaneDriftM": max((
                report.get("sourcePlaneMeasuredStoredDriftM", 0.0)
                for report in partition_reports
            ), default=0.0),
            "float32PartitionRealizationMaximumWorldShiftM": max((
                abs(adjustment.get("worldOmittedShiftM", 0.0))
                for report in partition_reports
                for adjustment in report.get("adjustments", [])
            ), default=0.0),
            "lineagesConsolidated": len(consolidation_reports),
            "lineageRemovalMaskAreaSumM2": sum(
                report.get("lineageRemovalMaskAreaM2", 0.0)
                for report in consolidation_reports
            ),
            "lineageRemovalIntersectionAreaSumM2": sum(
                report.get("lineageRemovalIntersectionAreaM2", 0.0)
                for report in consolidation_reports
            ),
            "lineageRemovalIntersectionSurfaceAreaSumM2": sum(
                report.get("lineageRemovalIntersectionSurfaceAreaM2", 0.0)
                for report in consolidation_reports
            ),
            "maximumSourcePlaneDistanceM": max(
                (report.get("maximumSourcePlaneDistanceM", 0.0)
                 for report in consolidation_reports),
                default=0.0,
            ),
            "maximumSourcePlaneGuardM": max(
                (report.get("sourcePlaneGuardM", 0.0)
                 for report in consolidation_reports),
                default=0.0,
            ),
            "maximumSourcePlaneRepresentationalErrorBoundM": max(
                (report.get("sourcePlaneRepresentationalErrorBoundM", 0.0)
                 for report in consolidation_reports),
                default=0.0,
            ),
            # These aggregates deliberately cover every consolidation, not
            # only the bounded diagnostic sample below.  Downstream gates can
            # therefore prove that actual stored geometry remained within the
            # 0.501 mm source-plane limit without treating the (potentially
            # larger) float32 representational bound as accepted drift.
            "lineageConsolidationCount": len(consolidation_reports),
            "sourcePlaneProofConsolidationCount": len(
                source_plane_proof_reports
            ),
            "maximumSourcePlaneMeasuredStoredDriftM": max(
                (report.get("sourcePlaneMeasuredStoredDriftM", 0.0)
                 for report in source_plane_proof_reports),
                default=0.0,
            ),
            "maximumSourcePlaneArithmeticGuardM": max(
                (report.get("sourcePlaneArithmeticGuardM", 0.0)
                 for report in source_plane_proof_reports),
                default=0.0,
            ),
            "maximumSourcePlaneMeasuredStoredDriftPlusArithmeticGuardM": max(
                (
                    report.get("sourcePlaneMeasuredStoredDriftM", 0.0)
                    + report.get("sourcePlaneArithmeticGuardM", 0.0)
                    for report in source_plane_proof_reports
                ),
                default=0.0,
            ),
            "allSourcePlaneWorldOriginCancellationAvoided": all(
                report.get("sourcePlaneWorldOriginCancellationAvoided") is True
                for report in source_plane_proof_reports
            ),
            "lineageConsolidation": consolidation_reports[:MAX_CONFLICT_SAMPLES],
            "lineageConsolidationTruncated": (
                len(consolidation_reports) > MAX_CONFLICT_SAMPLES
            ),
        })
    return reports


def scene_bounds(objects):
    points = [
        obj.matrix_world @ vertex.co
        for obj in objects if obj.data
        for vertex in obj.data.vertices
    ]
    if not points:
        raise RuntimeError("raster cleanup removed every render vertex")
    return {
        "min": [min(float(point[axis]) for point in points) for axis in range(3)],
        "max": [max(float(point[axis]) for point in points) for axis in range(3)],
    }


def scene_surface_area(objects):
    area = 0.0
    for obj in objects:
        if not obj.data:
            continue
        obj.data.calc_loop_triangles()
        for triangle in obj.data.loop_triangles:
            points = [
                obj.matrix_world @ obj.data.vertices[index].co
                for index in triangle.vertices
            ]
            area += (points[1] - points[0]).cross(points[2] - points[0]).length * 0.5
    return area


def scene_geometry_state_sha256(objects):
    """Hash stored geometry so a cleanup pass cannot revisit an earlier state."""
    digest = hashlib.sha256()
    for obj in sorted(objects, key=lambda item: item.name_full):
        encoded_name = obj.name_full.encode("utf-8")
        digest.update(struct.pack("<I", len(encoded_name)))
        digest.update(encoded_name)
        digest.update(struct.pack(
            "<16f",
            *(float(obj.matrix_world[row][column])
              for row in range(4) for column in range(4)),
        ))
        mesh = obj.data
        digest.update(struct.pack("<II", len(mesh.vertices), len(mesh.polygons)))
        for vertex in mesh.vertices:
            digest.update(struct.pack("<3f", *(float(value) for value in vertex.co)))
        for polygon in mesh.polygons:
            digest.update(struct.pack(
                "<II?", len(polygon.vertices), polygon.material_index,
                polygon.use_smooth,
            ))
            digest.update(struct.pack(
                "<%dI" % len(polygon.vertices), *polygon.vertices,
            ))
    return digest.hexdigest()


def finalize_pass_progress(report, pairs_after):
    report["pairsAfter"] = pairs_after
    report["strictlyDecreased"] = pairs_after < report["pairsBefore"]
    removed_area = report["surfaceAreaBeforeM2"] - report["surfaceAreaAfterM2"]
    report["surfaceAreaRemovedM2"] = removed_area
    report["surfaceAreaStrictlyDecreased"] = removed_area > 0.0
    report["positiveAcceptedMaskRemoval"] = (
        report["positiveRemovalEvidenceAreaSumM2"] > 0.0
    )
    consolidation_pair_progress = (
        report["strictlyDecreased"]
        and (
            report["conflicts"].get("sameLineagePairsConsolidated", 0) > 0
            or report["conflicts"].get("exactDuplicateConflicts", 0) > 0
        )
    )
    report["consolidationPairProgress"] = consolidation_pair_progress
    report["progressRuleSatisfied"] = (
        report["positiveAcceptedMaskRemoval"] or consolidation_pair_progress
    )
    return report["progressRuleSatisfied"]


def max_bounds_drift(before, after):
    return max(
        abs(before[key][axis] - after[key][axis])
        for key in ("min", "max") for axis in range(3)
    )


def _partition_application_subset(reports):
    return [
        report for report in reports
        if report.get("float32PartitionRealizationApplications", 0) > 0
    ]


def _all_partition_application_reports(reports, field):
    return all(
        report.get(field) is True
        for report in _partition_application_subset(reports)
    )


def _partition_proof_passes(proof):
    return (
        proof["acceptedPairsAfter"] == 0
        and proof["allFreshScansZero"]
        and proof["allDistinctProjectedVerticesPreserved"]
        and proof["allMergesProjectedVerticesFalse"]
        and proof["maximumProjectedOverlapAreaM2"] == 0.0
        and proof["totalProjectedOverlapAreaM2"] == 0.0
        and proof["maximumProjectedSymmetricDifferenceM2"] == 0.0
        and proof["totalProjectedSymmetricDifferenceM2"] == 0.0
        and proof["maximumCoverageExpansionAreaM2"] == 0.0
        and proof["totalCoverageExpansionAreaM2"] == 0.0
        and not proof["acceptedCoverageExpanded"]
        and proof["allExpandsAcceptedCoverageFalse"]
        and proof["allPreexistingCanonicalEdgeCoverageDeltasUnchanged"]
        and proof["degenerateTriangles"] == 0
        and proof["invertedTriangles"] == 0
        and proof["internalDuplicateFaces"] == 0
        and proof["internalEdgeViolations"] == 0
        and proof["nearDuplicateIntendedSharedEndpointViolations"] == 0
        and proof["allRepresentationalBoundsPassed"]
        and proof["allActualDriftBoundsPassed"]
        and proof["sharedMeshVertexIndexReusePassed"]
    )


def _assert_partition_aggregate_sparse_report_contract():
    sparse = {"name": "UNCHANGED", "mutated": False}
    applied = {
        "float32PartitionRealizationApplications": 1,
        "proof": True,
    }
    if not _all_partition_application_reports((sparse, applied), "proof"):
        raise RuntimeError(
            "sparse no-application report poisoned partition proof aggregation"
        )
    rejected = dict(applied, proof=False)
    if _all_partition_application_reports((sparse, rejected), "proof"):
        raise RuntimeError(
            "false applied partition invariant escaped proof aggregation"
        )
    proof = {
        "acceptedPairsAfter": 0,
        "allFreshScansZero": True,
        "allDistinctProjectedVerticesPreserved": True,
        "allMergesProjectedVerticesFalse": True,
        "maximumProjectedOverlapAreaM2": 0.0,
        "totalProjectedOverlapAreaM2": 0.0,
        "maximumProjectedSymmetricDifferenceM2": 0.0,
        "totalProjectedSymmetricDifferenceM2": 0.0,
        "maximumCoverageExpansionAreaM2": 0.0,
        "totalCoverageExpansionAreaM2": 0.0,
        "acceptedCoverageExpanded": False,
        "allExpandsAcceptedCoverageFalse": True,
        "allPreexistingCanonicalEdgeCoverageDeltasUnchanged": True,
        "degenerateTriangles": 0,
        "invertedTriangles": 0,
        "internalDuplicateFaces": 0,
        "internalEdgeViolations": 0,
        "nearDuplicateIntendedSharedEndpointViolations": 0,
        "allRepresentationalBoundsPassed": True,
        "allActualDriftBoundsPassed": True,
        "sharedMeshVertexIndexReusePassed": True,
    }
    if not _partition_proof_passes(proof):
        raise RuntimeError("valid partition aggregate proof fixture did not pass")
    for field in (
            "allFreshScansZero",
            "allDistinctProjectedVerticesPreserved",
            "allMergesProjectedVerticesFalse",
            "allExpandsAcceptedCoverageFalse",
            "allPreexistingCanonicalEdgeCoverageDeltasUnchanged",
            "allRepresentationalBoundsPassed",
            "allActualDriftBoundsPassed",
            "sharedMeshVertexIndexReusePassed"):
        invalid = dict(proof, **{field: False})
        if _partition_proof_passes(invalid):
            raise RuntimeError(
                "false applied partition invariant escaped final proof: " + field
            )
    for field in (
            "acceptedPairsAfter",
            "maximumProjectedOverlapAreaM2",
            "totalProjectedOverlapAreaM2",
            "maximumProjectedSymmetricDifferenceM2",
            "totalProjectedSymmetricDifferenceM2",
            "maximumCoverageExpansionAreaM2",
            "totalCoverageExpansionAreaM2",
            "degenerateTriangles",
            "invertedTriangles",
            "internalDuplicateFaces",
            "internalEdgeViolations",
            "nearDuplicateIntendedSharedEndpointViolations"):
        invalid = dict(proof, **{field: 1})
        if _partition_proof_passes(invalid):
            raise RuntimeError(
                "nonzero applied partition invariant escaped final proof: " + field
            )
    invalid = dict(proof, acceptedCoverageExpanded=True)
    if _partition_proof_passes(invalid):
        raise RuntimeError(
            "accepted coverage expansion escaped final partition proof"
        )


_assert_partition_aggregate_sparse_report_contract()


def _aggregate_object_summary(objects, initial, pass_reports):
    pass_by_name = defaultdict(list)
    for pass_report in pass_reports:
        for report in pass_report["objects"]:
            pass_by_name[report["name"]].append({"pass": pass_report["pass"], **report})
    summaries = []
    by_name = {obj.name_full: obj for obj in objects}
    all_names = sorted(set(initial) | set(by_name))
    for name in all_names:
        obj = by_name.get(name)
        after_triangles = 0
        after_vertices = 0
        if obj is not None and obj.data:
            obj.data.calc_loop_triangles()
            after_triangles = len(obj.data.loop_triangles)
            after_vertices = len(obj.data.vertices)
        reports = pass_by_name.get(name, [])
        lineage_consolidation_count = sum(
            report.get("lineageConsolidationCount", 0) for report in reports
        )
        source_plane_proof_consolidation_count = sum(
            report.get("sourcePlaneProofConsolidationCount", 0)
            for report in reports
        )
        partition_application_reports = _partition_application_subset(reports)
        summaries.append({
            "name": name,
            "mutated": any(report["mutated"] for report in reports),
            "passesMutated": [report["pass"] for report in reports if report["mutated"]],
            "trianglesBefore": initial.get(name, {}).get("triangles", 0),
            "trianglesAfter": after_triangles,
            "verticesBefore": initial.get(name, {}).get("vertices", 0),
            "verticesAfter": after_vertices,
            "materialSlotsBefore": initial.get(name, {}).get("materialSlots", 0),
            "materialSlotsAfter": len(obj.data.materials) if obj is not None and obj.data else 0,
            "lineageScopedSharedMeshVertexIndexReuses": sum(
                report.get("lineageScopedSharedMeshVertexIndexReuses", 0)
                for report in reports
            ),
            "sharedMeshVertexIndexReusePassed": all(
                report.get("sharedMeshVertexIndexReusePassed") is True
                for report in reports if report.get("mutated")
            ),
            "float32PartitionRealizationEnabledConsolidations": sum(
                report.get("float32PartitionRealizationEnabledConsolidations", 0)
                for report in reports
            ),
            "float32PartitionRealizationApplications": sum(
                report.get("float32PartitionRealizationApplications", 0)
                for report in reports
            ),
            "float32PartitionRealizationAdjustments": sum(
                report.get("float32PartitionRealizationAdjustments", 0)
                for report in partition_application_reports
            ),
            "float32PartitionRealizationAcceptedPairsBefore": sum(
                report.get("float32PartitionRealizationAcceptedPairsBefore", 0)
                for report in partition_application_reports
            ),
            "float32PartitionRealizationAcceptedPairsAfter": sum(
                report.get("float32PartitionRealizationAcceptedPairsAfter", 0)
                for report in partition_application_reports
            ),
            "float32PartitionRealizationAllFreshScansZero": all(
                report.get("float32PartitionRealizationAllFreshScansZero") is True
                for report in partition_application_reports
            ),
            "float32PartitionRealizationAllDistinctProjectedVerticesPreserved": all(
                report.get(
                    "float32PartitionRealizationAllDistinctProjectedVerticesPreserved"
                ) is True for report in partition_application_reports
            ),
            "float32PartitionRealizationAllMergesProjectedVerticesFalse": all(
                report.get(
                    "float32PartitionRealizationAllMergesProjectedVerticesFalse"
                ) is True for report in partition_application_reports
            ),
            "float32PartitionRealizationMaximumProjectedOverlapAreaM2": max((
                report.get(
                    "float32PartitionRealizationMaximumProjectedOverlapAreaM2", 0.0,
                ) for report in partition_application_reports
            ), default=0.0),
            "float32PartitionRealizationTotalProjectedOverlapAreaM2": sum(
                report.get(
                    "float32PartitionRealizationTotalProjectedOverlapAreaM2", 0.0,
                ) for report in partition_application_reports
            ),
            "float32PartitionRealizationMaximumProjectedSymmetricDifferenceM2": max((
                report.get(
                    "float32PartitionRealizationMaximumProjectedSymmetricDifferenceM2",
                    0.0,
                ) for report in partition_application_reports
            ), default=0.0),
            "float32PartitionRealizationTotalProjectedSymmetricDifferenceM2": sum(
                report.get(
                    "float32PartitionRealizationTotalProjectedSymmetricDifferenceM2",
                    0.0,
                ) for report in partition_application_reports
            ),
            "float32PartitionRealizationMaximumCoverageExpansionAreaM2": max((
                report.get(
                    "float32PartitionRealizationMaximumCoverageExpansionAreaM2", 0.0,
                ) for report in partition_application_reports
            ), default=0.0),
            "float32PartitionRealizationTotalCoverageExpansionAreaM2": sum(
                report.get(
                    "float32PartitionRealizationTotalCoverageExpansionAreaM2", 0.0,
                ) for report in partition_application_reports
            ),
            "float32PartitionRealizationAcceptedCoverageExpanded": any(
                report.get("float32PartitionRealizationAcceptedCoverageExpanded") is True
                for report in partition_application_reports
            ),
            "float32PartitionRealizationAllExpandsAcceptedCoverageFalse": all(
                report.get(
                    "float32PartitionRealizationAllExpandsAcceptedCoverageFalse"
                ) is True for report in partition_application_reports
            ),
            "float32PartitionRealizationAllPreexistingCoverageDeltasUnchanged": all(
                report.get(
                    "float32PartitionRealizationAllPreexistingCoverageDeltasUnchanged"
                ) is True for report in partition_application_reports
            ),
            "float32PartitionRealizationMaximumPreexistingSymmetricDifferenceM2": max((
                report.get(
                    "float32PartitionRealizationMaximumPreexistingSymmetricDifferenceM2",
                    0.0,
                ) for report in partition_application_reports
            ), default=0.0),
            "float32PartitionRealizationMaximumPreexistingExpansionAreaM2": max((
                report.get(
                    "float32PartitionRealizationMaximumPreexistingExpansionAreaM2", 0.0,
                ) for report in partition_application_reports
            ), default=0.0),
            "float32PartitionRealizationDegenerateTriangles": sum(
                report.get("float32PartitionRealizationDegenerateTriangles", 0)
                for report in partition_application_reports
            ),
            "float32PartitionRealizationInvertedTriangles": sum(
                report.get("float32PartitionRealizationInvertedTriangles", 0)
                for report in partition_application_reports
            ),
            "float32PartitionRealizationInternalDuplicateFaces": sum(
                report.get("float32PartitionRealizationInternalDuplicateFaces", 0)
                for report in partition_application_reports
            ),
            "float32PartitionRealizationInternalEdgeViolations": sum(
                report.get("float32PartitionRealizationInternalEdgeViolations", 0)
                for report in partition_application_reports
            ),
            "float32PartitionRealizationNearDuplicateSharedEndpointViolations": sum(
                report.get(
                    "float32PartitionRealizationNearDuplicateSharedEndpointViolations", 0,
                ) for report in partition_application_reports
            ),
            "float32PartitionRealizationAllRepresentationalBoundsPassed": all(
                report.get(
                    "float32PartitionRealizationAllRepresentationalBoundsPassed"
                ) is True for report in partition_application_reports
            ),
            "float32PartitionRealizationAllActualDriftBoundsPassed": all(
                report.get(
                    "float32PartitionRealizationAllActualDriftBoundsPassed"
                ) is True for report in partition_application_reports
            ),
            "float32PartitionRealizationMaximumSourcePlaneDriftM": max((
                report.get(
                    "float32PartitionRealizationMaximumSourcePlaneDriftM", 0.0,
                ) for report in partition_application_reports
            ), default=0.0),
            "float32PartitionRealizationMaximumWorldShiftM": max((
                report.get("float32PartitionRealizationMaximumWorldShiftM", 0.0)
                for report in partition_application_reports
            ), default=0.0),
            "lineageConsolidationCount": lineage_consolidation_count,
            "sourcePlaneProofConsolidationCount": (
                source_plane_proof_consolidation_count
            ),
            "maximumSourcePlaneMeasuredStoredDriftM": max((
                report.get("maximumSourcePlaneMeasuredStoredDriftM", 0.0)
                for report in reports
            ), default=0.0),
            "maximumSourcePlaneArithmeticGuardM": max((
                report.get("maximumSourcePlaneArithmeticGuardM", 0.0)
                for report in reports
            ), default=0.0),
            "maximumSourcePlaneMeasuredStoredDriftPlusArithmeticGuardM": max((
                report.get(
                    "maximumSourcePlaneMeasuredStoredDriftPlusArithmeticGuardM", 0.0,
                )
                for report in reports
            ), default=0.0),
            "maximumSourcePlaneRepresentationalErrorBoundM": max((
                report.get("maximumSourcePlaneRepresentationalErrorBoundM", 0.0)
                for report in reports
            ), default=0.0),
            "allSourcePlaneWorldOriginCancellationAvoided": all(
                report.get("allSourcePlaneWorldOriginCancellationAvoided") is True
                for report in reports
                if report.get("sourcePlaneProofConsolidationCount", 0)
            ),
        })
    return summaries


def cleanup_same_winding_raster_risk(objects):
    """Remove only accepted same-winding raster-risk coverage from a derived scene."""
    objects = sorted(objects, key=lambda obj: obj.name_full)
    before_bounds = scene_bounds(objects)
    before_surface_area = scene_surface_area(objects)
    current_surface_area = before_surface_area
    initial_geometry_state = scene_geometry_state_sha256(objects)
    seen_geometry_states = {initial_geometry_state}
    lineage_by_object = {}
    initial_scan = _scan_by_lod(
        objects, cleanup=False, lineage_by_object=lineage_by_object,
    )
    lineage_sources = {
        (obj, tuple(record["lineage"])): record
        for obj, records in initial_scan["recordsByObject"].items()
        for record in records
    }
    canonical_source_edges, canonical_source_pair_edges = (
        build_canonical_source_edges(lineage_sources)
    )
    mutated_lineages = set()
    initial_object = initial_scan["objectInput"]
    before_metrics = initial_scan["metricsByLod"]
    pass_reports = []
    conflict_totals = {
        "conflictCount": 0,
        "exactDuplicateConflicts": 0,
        "coherentCrossingConflicts": 0,
        "immutablePlaneSubsequentPassReconstructions": 0,
        "immutablePlaneSubsequentPassReconstructionAreaM2": 0.0,
        "immutablePlaneSubsequentPassAcceptedCoverageExpanded": False,
        "samples": [],
        "samplesTruncated": False,
    }
    current_scan = initial_scan
    previous_report = None

    for pass_index in range(1, MAX_PASSES + 1):
        pair_count = current_scan["pairCount"]
        if previous_report is not None:
            if not finalize_pass_progress(previous_report, pair_count):
                samples = residual_pair_samples(
                    current_scan, cleanup_generation=previous_report["pass"],
                )
                failure_evidence = {
                    "pass": previous_report["pass"],
                    "pairsBefore": previous_report["pairsBefore"],
                    "pairsAfter": pair_count,
                    "riskAreaM2Before": previous_report["riskAreaM2Before"],
                    "residualSamples": samples,
                    "previousPassConflicts": previous_report["conflicts"],
                    "previousPassObjects": previous_report["objects"],
                }
                raise RuntimeError(
                    "cleanup made no safe geometry progress after pass %d: %d -> %d pairs; "
                    "evidence=%s" % (
                        previous_report["pass"], previous_report["pairsBefore"], pair_count,
                        json.dumps(failure_evidence, separators=(",", ":")),
                    )
                )
        if pair_count == 0:
            break

        cleanup_scan = _scan_by_lod(
            objects, cleanup=True, lineage_by_object=lineage_by_object,
        )
        outputs_by_lod = {}
        pass_conflicts = {
            "conflictCount": 0,
            "exactDuplicateConflicts": 0,
            "coherentCrossingConflicts": 0,
            "samples": [],
            "samplesTruncated": False,
            "maskDiagnostics": [],
            "maskDiagnosticsTruncated": False,
            "recordLocalRemovalIntersectionSurfaceAreaM2": 0.0,
            "immutablePlaneSubsequentPassReconstructions": 0,
            "immutablePlaneSubsequentPassReconstructionAreaM2": 0.0,
            "immutablePlaneSubsequentPassAcceptedCoverageExpanded": False,
            "sameLineagePairsConsolidated": 0,
            "sameLineageCoherentCrossingPairsConsolidated": 0,
            "sameLineagePairSamples": [],
            "aggregateCoherentLineagePairGroups": 0,
            "aggregateCoherentCrossingGroups": 0,
            "aggregateMixedSignedWinnerGroups": 0,
            "aggregateCoherentPairAssignments": 0,
            "aggregateCoherentPairLocalCoverageAreaSumM2": 0.0,
            "aggregateCoherentMaximumCoverageDeltaM2": 0.0,
            "aggregateCoherentCoveragePreserved": True,
            "aggregateCoherentLineagePairSamples": [],
            "aggregateCoherentLineagePairSamplesTruncated": False,
            "lineageRemovalMaskCount": 0,
            "lineagesMasked": 0,
            "lineageRemovalMaskAreaSumM2": 0.0,
            "exactDuplicateLineageMasks": 0,
            "coherentCrossingLineageMasks": 0,
            "singleFragmentPairsKeptRecordLocal": 0,
            "singleFragmentPairsWithLocalizedEdgeStrip": 0,
            "emptyLineageMasksKeptRecordLocal": 0,
            "sharedSourceEdgeStripMasks": 0,
            "sharedSourceEdgeStripAreaM2": 0.0,
            "sharedSourceEdgeStripSamples": [],
            "sharedSourceEdgeStripSamplesTruncated": False,
            "lineageRemovalMaskSamples": [],
            "lineageRemovalMaskSamplesTruncated": False,
        }
        forced_lineages = set()
        lineage_removal_masks = defaultdict(list)
        for lod, records in cleanup_scan["recordsByLod"].items():
            mask_pairs = []
            coherent_pairs, coherent_report = cohere_accepted_lineage_pair_winners(
                records, cleanup_scan["pairsByLod"][lod],
            )
            for field in (
                    "aggregateCoherentLineagePairGroups",
                    "aggregateCoherentCrossingGroups",
                    "aggregateMixedSignedWinnerGroups",
                    "aggregateCoherentPairAssignments"):
                pass_conflicts[field] += coherent_report[field]
            pass_conflicts["aggregateCoherentPairLocalCoverageAreaSumM2"] += (
                coherent_report["aggregateCoherentPairLocalCoverageAreaSumM2"]
            )
            pass_conflicts["aggregateCoherentMaximumCoverageDeltaM2"] = max(
                pass_conflicts["aggregateCoherentMaximumCoverageDeltaM2"],
                coherent_report["aggregateCoherentMaximumCoverageDeltaM2"],
            )
            pass_conflicts["aggregateCoherentCoveragePreserved"] = (
                pass_conflicts["aggregateCoherentCoveragePreserved"]
                and coherent_report["aggregateCoherentCoveragePreserved"]
            )
            coherent_sample_available = (
                MAX_CONFLICT_SAMPLES
                - len(pass_conflicts["aggregateCoherentLineagePairSamples"])
            )
            if coherent_sample_available > 0:
                pass_conflicts["aggregateCoherentLineagePairSamples"].extend(
                    coherent_report["aggregateCoherentLineagePairSamples"][
                        :coherent_sample_available
                    ]
                )
            pass_conflicts["aggregateCoherentLineagePairSamplesTruncated"] = (
                pass_conflicts["aggregateCoherentLineagePairSamplesTruncated"]
                or coherent_report["aggregateCoherentLineagePairSamplesTruncated"]
                or len(coherent_report["aggregateCoherentLineagePairSamples"])
                > coherent_sample_available
            )
            for first_index, second_index, overlap in coherent_pairs:
                first, second = records[first_index], records[second_index]
                same_lineage = (
                    first["owner"] is second["owner"]
                    and first["lineageTrackedThroughCleanup"]
                    and second["lineageTrackedThroughCleanup"]
                    and first["lineage"] == second["lineage"]
                )
                if not same_lineage:
                    mask_pairs.append((first_index, second_index, overlap))
                    continue
                if (first["material"] != second["material"]
                        or first["materialName"] != second["materialName"]):
                    raise RuntimeError(
                        "same source lineage changed material identity on %s: %r vs %r" % (
                            first["owner"].name_full,
                            first["materialName"], second["materialName"],
                        )
                    )
                lineage = tuple(first["lineage"])
                forced_lineages.add((first["owner"], lineage))
                pass_conflicts["sameLineagePairsConsolidated"] += 1
                pass_conflicts[
                    "sameLineageCoherentCrossingPairsConsolidated"
                ] += overlap["coherentCrossing"]
                if len(pass_conflicts["sameLineagePairSamples"]) < MAX_CONFLICT_SAMPLES:
                    pass_conflicts["sameLineagePairSamples"].append({
                        "lod": lod,
                        "object": first["owner"].name_full,
                        "lineage": list(lineage),
                        "firstTriangle": first["triangleIndex"],
                        "secondTriangle": second["triangleIndex"],
                        "material": first["materialName"],
                        "riskAreaM2": overlap["area"],
                        "minimumRiskWidthM": _minimum_width(unary_union((
                            overlap["_firstWins"], overlap["_secondWins"],
                        ))),
                        "float32UlpM": float32_ulp_for_records(first, second),
                        "coherentCrossing": overlap["coherentCrossing"],
                        "resolution": "IMMUTABLE_SOURCE_PLANE_UNION_RETRIANGULATION",
                    })
            outputs, conflicts = visible_outputs(
                records, mask_pairs,
                lineage_sources=lineage_sources,
                canonical_source_edges=canonical_source_edges,
            )
            outputs_by_lod[lod] = outputs
            lod_lineage_masks, lineage_mask_report = collect_lineage_removal_masks(
                records, mask_pairs, lineage_sources,
                canonical_source_pair_edges,
            )
            for key, masks in lod_lineage_masks.items():
                lineage_removal_masks[key].extend(masks)
            for field in (
                    "lineageMaskCount", "lineagesMasked",
                    "exactDuplicateLineageMasks", "coherentCrossingLineageMasks",
                    "singleFragmentPairsKeptRecordLocal",
                    "singleFragmentPairsWithLocalizedEdgeStrip",
                    "emptyLineageMasksKeptRecordLocal",
                    "sharedSourceEdgeStripMasks"):
                target = (
                    "lineageRemovalMaskCount" if field == "lineageMaskCount"
                    else field
                )
                pass_conflicts[target] += lineage_mask_report[field]
            pass_conflicts["lineageRemovalMaskAreaSumM2"] += (
                lineage_mask_report["lineageMaskAreaSumM2"]
            )
            pass_conflicts["sharedSourceEdgeStripAreaM2"] += (
                lineage_mask_report["sharedSourceEdgeStripAreaM2"]
            )
            edge_sample_available = (
                MAX_CONFLICT_SAMPLES
                - len(pass_conflicts["sharedSourceEdgeStripSamples"])
            )
            if edge_sample_available > 0:
                pass_conflicts["sharedSourceEdgeStripSamples"].extend(
                    lineage_mask_report["sharedSourceEdgeStripSamples"][
                        :edge_sample_available
                    ]
                )
            pass_conflicts["sharedSourceEdgeStripSamplesTruncated"] = (
                pass_conflicts["sharedSourceEdgeStripSamplesTruncated"]
                or lineage_mask_report["sharedSourceEdgeStripSamplesTruncated"]
                or len(lineage_mask_report["sharedSourceEdgeStripSamples"])
                > edge_sample_available
            )
            lineage_sample_available = (
                MAX_CONFLICT_SAMPLES
                - len(pass_conflicts["lineageRemovalMaskSamples"])
            )
            if lineage_sample_available > 0:
                pass_conflicts["lineageRemovalMaskSamples"].extend(
                    lineage_mask_report["samples"][:lineage_sample_available]
                )
            pass_conflicts["lineageRemovalMaskSamplesTruncated"] = (
                pass_conflicts["lineageRemovalMaskSamplesTruncated"]
                or lineage_mask_report["samplesTruncated"]
                or len(lineage_mask_report["samples"]) > lineage_sample_available
            )
            for field in ("conflictCount", "exactDuplicateConflicts", "coherentCrossingConflicts"):
                pass_conflicts[field] += conflicts[field]
            pass_conflicts["recordLocalRemovalIntersectionSurfaceAreaM2"] += (
                conflicts["recordLocalRemovalIntersectionSurfaceAreaM2"]
            )
            pass_conflicts["immutablePlaneSubsequentPassReconstructions"] += (
                conflicts["immutablePlaneSubsequentPassReconstructions"]
            )
            pass_conflicts[
                "immutablePlaneSubsequentPassReconstructionAreaM2"
            ] += conflicts["immutablePlaneSubsequentPassReconstructionAreaM2"]
            pass_conflicts[
                "immutablePlaneSubsequentPassAcceptedCoverageExpanded"
            ] = (
                pass_conflicts[
                    "immutablePlaneSubsequentPassAcceptedCoverageExpanded"
                ]
                or conflicts[
                    "immutablePlaneSubsequentPassAcceptedCoverageExpanded"
                ]
            )
            available = MAX_CONFLICT_SAMPLES - len(pass_conflicts["samples"])
            if available > 0:
                pass_conflicts["samples"].extend(conflicts["samples"][:available])
            pass_conflicts["samplesTruncated"] = (
                pass_conflicts["samplesTruncated"] or conflicts["samplesTruncated"]
                or len(conflicts["samples"]) > available
            )
            diagnostic_available = MAX_CONFLICT_SAMPLES - len(pass_conflicts["maskDiagnostics"])
            if diagnostic_available > 0:
                pass_conflicts["maskDiagnostics"].extend(
                    conflicts["maskDiagnostics"][:diagnostic_available]
                )
            pass_conflicts["maskDiagnosticsTruncated"] = (
                pass_conflicts["maskDiagnosticsTruncated"]
                or conflicts["maskDiagnosticsTruncated"]
                or len(conflicts["maskDiagnostics"]) > diagnostic_available
            )
        object_reports = rebuild_changed_objects(
            objects,
            cleanup_scan["recordsByLod"],
            cleanup_scan["recordsByObject"],
            outputs_by_lod,
            lineage_by_object,
            lineage_sources,
            mutated_lineages,
            forced_lineages,
            lineage_removal_masks,
            canonical_source_edges,
        )
        if not any(report["mutated"] for report in object_reports):
            failure_evidence = {
                "pass": pass_index,
                "acceptedPairCount": pair_count,
                "cleanupPairCount": cleanup_scan["pairCount"],
                "acceptedRiskAreaM2": current_scan["riskAreaM2"],
                "cleanupRiskAreaM2": cleanup_scan["riskAreaM2"],
                "residualSamples": residual_pair_samples(
                    current_scan, cleanup_generation=pass_index - 1,
                ),
                "conflicts": pass_conflicts,
                "objects": object_reports,
            }
            raise RuntimeError(
                "accepted raster-risk pairs produced no derived mutation; evidence="
                + json.dumps(failure_evidence, separators=(",", ":"))
            )
        after_pass_bounds = scene_bounds(objects)
        bounds_drift = max_bounds_drift(before_bounds, after_pass_bounds)
        if bounds_drift > BOUNDS_DRIFT_LIMIT_M:
            raise RuntimeError(
                "derived cleanup bounds drift %.9g m exceeds %.9g m" % (
                    bounds_drift, BOUNDS_DRIFT_LIMIT_M,
                )
            )
        after_surface_area = scene_surface_area(objects)
        after_geometry_state = scene_geometry_state_sha256(objects)
        if after_geometry_state in seen_geometry_states:
            raise RuntimeError(
                "cleanup revisited geometry state %s after pass %d" % (
                    after_geometry_state, pass_index,
                )
            )
        seen_geometry_states.add(after_geometry_state)
        lineage_removal_intersection_surface_area = sum(
            report.get("lineageRemovalIntersectionSurfaceAreaSumM2", 0.0)
            for report in object_reports
        )
        record_local_removal_intersection_surface_area = pass_conflicts[
            "recordLocalRemovalIntersectionSurfaceAreaM2"
        ]
        previous_report = {
            "pass": pass_index,
            "pairsBefore": pair_count,
            "riskAreaM2Before": current_scan["riskAreaM2"],
            "cleanupPairsWithDepthGuard": cleanup_scan["pairCount"],
            "cleanupMetricsByLod": cleanup_scan["metricsByLod"],
            "boundsDriftM": bounds_drift,
            "surfaceAreaBeforeM2": current_surface_area,
            "surfaceAreaAfterM2": after_surface_area,
            "geometryStateSha256Before": (
                initial_geometry_state if not pass_reports
                else pass_reports[-1]["geometryStateSha256After"]
            ),
            "geometryStateSha256After": after_geometry_state,
            "recordLocalRemovalIntersectionSurfaceAreaM2": (
                record_local_removal_intersection_surface_area
            ),
            "lineageRemovalIntersectionSurfaceAreaM2": (
                lineage_removal_intersection_surface_area
            ),
            "positiveRemovalEvidenceAreaSumM2": (
                record_local_removal_intersection_surface_area
                + lineage_removal_intersection_surface_area
            ),
            "objects": object_reports,
            "conflicts": pass_conflicts,
        }
        pass_reports.append(previous_report)
        current_surface_area = after_surface_area
        for field in ("conflictCount", "exactDuplicateConflicts", "coherentCrossingConflicts"):
            conflict_totals[field] += pass_conflicts[field]
        conflict_totals["immutablePlaneSubsequentPassReconstructions"] += (
            pass_conflicts["immutablePlaneSubsequentPassReconstructions"]
        )
        conflict_totals[
            "immutablePlaneSubsequentPassReconstructionAreaM2"
        ] += pass_conflicts["immutablePlaneSubsequentPassReconstructionAreaM2"]
        conflict_totals[
            "immutablePlaneSubsequentPassAcceptedCoverageExpanded"
        ] = (
            conflict_totals[
                "immutablePlaneSubsequentPassAcceptedCoverageExpanded"
            ]
            or pass_conflicts[
                "immutablePlaneSubsequentPassAcceptedCoverageExpanded"
            ]
        )
        available = MAX_CONFLICT_SAMPLES - len(conflict_totals["samples"])
        if available > 0:
            conflict_totals["samples"].extend(pass_conflicts["samples"][:available])
        conflict_totals["samplesTruncated"] = (
            conflict_totals["samplesTruncated"] or pass_conflicts["samplesTruncated"]
            or len(pass_conflicts["samples"]) > available
        )
        current_scan = _scan_by_lod(
            objects, cleanup=False, lineage_by_object=lineage_by_object,
        )
    else:
        pair_count = current_scan["pairCount"]

    final_scan = _scan_by_lod(
        objects, cleanup=False, lineage_by_object=lineage_by_object,
    )
    if previous_report is not None and "pairsAfter" not in previous_report:
        if not finalize_pass_progress(previous_report, final_scan["pairCount"]):
            samples = residual_pair_samples(
                final_scan, cleanup_generation=len(pass_reports),
            )
            raise RuntimeError(
                "cleanup final pass made no safe geometry progress; evidence="
                + json.dumps({
                    "pass": previous_report["pass"],
                    "pairsBefore": previous_report["pairsBefore"],
                    "pairsAfter": final_scan["pairCount"],
                    "residualSamples": samples,
                    "previousPassConflicts": previous_report["conflicts"],
                    "previousPassObjects": previous_report["objects"],
                }, separators=(",", ":"))
            )
    if final_scan["pairCount"]:
        samples = residual_pair_samples(
            final_scan, cleanup_generation=len(pass_reports),
        )
        raise RuntimeError(
            "cleanup left %d accepted same-winding raster-risk pairs after %d passes; "
            "pairSequences=%s; residualSamples=%s" % (
                final_scan["pairCount"], MAX_PASSES,
                json.dumps([
                    {
                        "pass": report["pass"],
                        "pairsBefore": report["pairsBefore"],
                        "pairsAfter": report.get("pairsAfter"),
                        "positiveRemovalEvidenceAreaSumM2": report[
                            "positiveRemovalEvidenceAreaSumM2"
                        ],
                    }
                    for report in pass_reports
                ], separators=(",", ":")),
                json.dumps(samples, separators=(",", ":")),
            )
        )
    after_bounds = scene_bounds(objects)
    bounds_drift = max_bounds_drift(before_bounds, after_bounds)
    object_summary = _aggregate_object_summary(objects, initial_object, pass_reports)
    exact_before = sum(
        metrics["exactDuplicatePairs"] for metrics in before_metrics.values()
    )
    exact_after = sum(
        metrics["exactDuplicatePairs"] for metrics in final_scan["metricsByLod"].values()
    )
    same_lineage_pairs_consolidated = sum(
        report["conflicts"].get("sameLineagePairsConsolidated", 0)
        for report in pass_reports
    )
    same_lineage_crossing_pairs_consolidated = sum(
        report["conflicts"].get("sameLineageCoherentCrossingPairsConsolidated", 0)
        for report in pass_reports
    )
    lineage_removal_mask_count = sum(
        report["conflicts"].get("lineageRemovalMaskCount", 0)
        for report in pass_reports
    )
    lineage_removal_mask_area = sum(
        report["conflicts"].get("lineageRemovalMaskAreaSumM2", 0.0)
        for report in pass_reports
    )
    shared_source_edge_strip_masks = sum(
        report["conflicts"].get("sharedSourceEdgeStripMasks", 0)
        for report in pass_reports
    )
    shared_source_edge_strip_area = sum(
        report["conflicts"].get("sharedSourceEdgeStripAreaM2", 0.0)
        for report in pass_reports
    )
    lineage_consolidation_count = sum(
        report.get("lineageConsolidationCount", 0) for report in object_summary
    )
    source_plane_proof_consolidation_count = sum(
        report.get("sourcePlaneProofConsolidationCount", 0)
        for report in object_summary
    )
    maximum_source_plane_measured_drift = max((
        report.get("maximumSourcePlaneMeasuredStoredDriftM", 0.0)
        for report in object_summary
    ), default=0.0)
    maximum_source_plane_arithmetic_guard = max((
        report.get("maximumSourcePlaneArithmeticGuardM", 0.0)
        for report in object_summary
    ), default=0.0)
    maximum_source_plane_drift_plus_guard = max((
        report.get(
            "maximumSourcePlaneMeasuredStoredDriftPlusArithmeticGuardM", 0.0,
        )
        for report in object_summary
    ), default=0.0)
    maximum_source_plane_representational_bound = max((
        report.get("maximumSourcePlaneRepresentationalErrorBoundM", 0.0)
        for report in object_summary
    ), default=0.0)
    all_source_plane_cancellation_avoided = all(
        report.get("allSourcePlaneWorldOriginCancellationAvoided") is True
        for report in object_summary
        if report.get("sourcePlaneProofConsolidationCount", 0)
    )
    source_plane_actual_drift_proof_passed = (
        all_source_plane_cancellation_avoided
        and maximum_source_plane_drift_plus_guard <= BOUNDS_DRIFT_LIMIT_M
    )
    partition_enabled_consolidations = sum(
        report.get("float32PartitionRealizationEnabledConsolidations", 0)
        for report in object_summary
    )
    partition_applications = sum(
        report.get("float32PartitionRealizationApplications", 0)
        for report in object_summary
    )
    partition_adjustments = sum(
        report.get("float32PartitionRealizationAdjustments", 0)
        for report in object_summary
    )
    partition_accepted_pairs_before = sum(
        report.get("float32PartitionRealizationAcceptedPairsBefore", 0)
        for report in object_summary
    )
    partition_accepted_pairs_after = sum(
        report.get("float32PartitionRealizationAcceptedPairsAfter", 0)
        for report in object_summary
    )
    partition_application_objects = _partition_application_subset(object_summary)
    partition_proof = {
        "method": (
            "TOPOLOGY_ACCEPTED_PAIR_TRIGGERED_ADJACENT_FLOAT32_OMITTED_AXIS_ULP"
        ),
        "enabledConsolidations": partition_enabled_consolidations,
        "applications": partition_applications,
        "adjustments": partition_adjustments,
        "acceptedPairsBefore": partition_accepted_pairs_before,
        "acceptedPairsAfter": partition_accepted_pairs_after,
        "allFreshScansZero": all(
            report.get("float32PartitionRealizationAllFreshScansZero") is True
            for report in partition_application_objects
        ),
        "allDistinctProjectedVerticesPreserved": all(
            report.get(
                "float32PartitionRealizationAllDistinctProjectedVerticesPreserved"
            ) is True for report in partition_application_objects
        ),
        "allMergesProjectedVerticesFalse": all(
            report.get(
                "float32PartitionRealizationAllMergesProjectedVerticesFalse"
            ) is True for report in partition_application_objects
        ),
        "maximumProjectedOverlapAreaM2": max((
            report.get(
                "float32PartitionRealizationMaximumProjectedOverlapAreaM2", 0.0,
            ) for report in partition_application_objects
        ), default=0.0),
        "totalProjectedOverlapAreaM2": sum(
            report.get(
                "float32PartitionRealizationTotalProjectedOverlapAreaM2", 0.0,
            ) for report in partition_application_objects
        ),
        "maximumProjectedSymmetricDifferenceM2": max((
            report.get(
                "float32PartitionRealizationMaximumProjectedSymmetricDifferenceM2",
                0.0,
            ) for report in partition_application_objects
        ), default=0.0),
        "totalProjectedSymmetricDifferenceM2": sum(
            report.get(
                "float32PartitionRealizationTotalProjectedSymmetricDifferenceM2", 0.0,
            ) for report in partition_application_objects
        ),
        "maximumCoverageExpansionAreaM2": max((
            report.get(
                "float32PartitionRealizationMaximumCoverageExpansionAreaM2", 0.0,
            ) for report in partition_application_objects
        ), default=0.0),
        "totalCoverageExpansionAreaM2": sum(
            report.get(
                "float32PartitionRealizationTotalCoverageExpansionAreaM2", 0.0,
            ) for report in partition_application_objects
        ),
        "acceptedCoverageExpanded": any(
            report.get("float32PartitionRealizationAcceptedCoverageExpanded") is True
            for report in partition_application_objects
        ),
        "allExpandsAcceptedCoverageFalse": all(
            report.get(
                "float32PartitionRealizationAllExpandsAcceptedCoverageFalse"
            ) is True for report in partition_application_objects
        ),
        "allPreexistingCanonicalEdgeCoverageDeltasUnchanged": all(
            report.get(
                "float32PartitionRealizationAllPreexistingCoverageDeltasUnchanged"
            ) is True for report in partition_application_objects
        ),
        "maximumPreexistingCanonicalEdgeSymmetricDifferenceM2": max((
            report.get(
                "float32PartitionRealizationMaximumPreexistingSymmetricDifferenceM2",
                0.0,
            ) for report in partition_application_objects
        ), default=0.0),
        "maximumPreexistingCanonicalEdgeExpansionAreaM2": max((
            report.get(
                "float32PartitionRealizationMaximumPreexistingExpansionAreaM2", 0.0,
            ) for report in partition_application_objects
        ), default=0.0),
        "degenerateTriangles": sum(
            report.get("float32PartitionRealizationDegenerateTriangles", 0)
            for report in partition_application_objects
        ),
        "invertedTriangles": sum(
            report.get("float32PartitionRealizationInvertedTriangles", 0)
            for report in partition_application_objects
        ),
        "internalDuplicateFaces": sum(
            report.get("float32PartitionRealizationInternalDuplicateFaces", 0)
            for report in partition_application_objects
        ),
        "internalEdgeViolations": sum(
            report.get("float32PartitionRealizationInternalEdgeViolations", 0)
            for report in partition_application_objects
        ),
        "nearDuplicateIntendedSharedEndpointViolations": sum(
            report.get(
                "float32PartitionRealizationNearDuplicateSharedEndpointViolations", 0,
            ) for report in partition_application_objects
        ),
        "allRepresentationalBoundsPassed": all(
            report.get(
                "float32PartitionRealizationAllRepresentationalBoundsPassed"
            ) is True for report in partition_application_objects
        ),
        "allActualDriftBoundsPassed": all(
            report.get("float32PartitionRealizationAllActualDriftBoundsPassed") is True
            for report in partition_application_objects
        ),
        "maximumSourcePlaneDriftM": max((
            report.get("float32PartitionRealizationMaximumSourcePlaneDriftM", 0.0)
            for report in partition_application_objects
        ), default=0.0),
        "maximumWorldShiftM": max((
            report.get("float32PartitionRealizationMaximumWorldShiftM", 0.0)
            for report in partition_application_objects
        ), default=0.0),
        "sharedMeshVertexIndexReuses": sum(
            report.get("lineageScopedSharedMeshVertexIndexReuses", 0)
            for report in object_summary
        ),
        "sharedMeshVertexIndexReusePassed": all(
            report.get("sharedMeshVertexIndexReusePassed") is True
            for report in object_summary if report.get("mutated")
        ),
    }
    partition_proof["passed"] = _partition_proof_passes(partition_proof)
    aggregate_coherent_groups = sum(
        report["conflicts"].get("aggregateCoherentLineagePairGroups", 0)
        for report in pass_reports
    )
    aggregate_crossing_groups = sum(
        report["conflicts"].get("aggregateCoherentCrossingGroups", 0)
        for report in pass_reports
    )
    aggregate_mixed_winner_groups = sum(
        report["conflicts"].get("aggregateMixedSignedWinnerGroups", 0)
        for report in pass_reports
    )
    aggregate_coherent_pair_assignments = sum(
        report["conflicts"].get("aggregateCoherentPairAssignments", 0)
        for report in pass_reports
    )
    aggregate_coherent_coverage_area = sum(
        report["conflicts"].get(
            "aggregateCoherentPairLocalCoverageAreaSumM2", 0.0,
        )
        for report in pass_reports
    )
    aggregate_coherent_maximum_coverage_delta = max((
        report["conflicts"].get("aggregateCoherentMaximumCoverageDeltaM2", 0.0)
        for report in pass_reports
    ), default=0.0)
    aggregate_coherent_coverage_preserved = all(
        report["conflicts"].get("aggregateCoherentCoveragePreserved") is True
        for report in pass_reports
    )
    immutable_plane_reconstructions = conflict_totals.get(
        "immutablePlaneSubsequentPassReconstructions", 0,
    )
    immutable_plane_reconstruction_area = conflict_totals.get(
        "immutablePlaneSubsequentPassReconstructionAreaM2", 0.0,
    )
    immutable_plane_accepted_coverage_expanded = conflict_totals.get(
        "immutablePlaneSubsequentPassAcceptedCoverageExpanded", False,
    )
    pair_sequence = [initial_scan["pairCount"]]
    pair_sequence.extend(report["pairsAfter"] for report in pass_reports)
    return {
        "schema": SCHEMA,
        "method": METHOD,
        "dependencyContract": dependency_contract(),
        "contract": acceptance_contract(),
        "mutated": any(report["mutated"] for report in object_summary),
        "canonicalSourceMutated": False,
        "canonicalTopologyUntouched": True,
        "beforeBounds": before_bounds,
        "afterBounds": after_bounds,
        "maxBoundsDriftM": bounds_drift,
        "pairMetricsBeforeByLod": before_metrics,
        "pairMetricsAfterByLod": final_scan["metricsByLod"],
        "acceptedPairsBefore": initial_scan["pairCount"],
        "acceptedPairsAfter": final_scan["pairCount"],
        "remainingPairs": final_scan["pairCount"],
        "exactDuplicatePairsBefore": exact_before,
        "exactDuplicatePairsAfter": exact_after,
        "sameLineagePairsConsolidated": same_lineage_pairs_consolidated,
        "sameLineageCoherentCrossingPairsConsolidated": (
            same_lineage_crossing_pairs_consolidated
        ),
        "aggregateCoherentLineagePairGroups": aggregate_coherent_groups,
        "aggregateCoherentCrossingGroups": aggregate_crossing_groups,
        "aggregateMixedSignedWinnerGroups": aggregate_mixed_winner_groups,
        "aggregateCoherentPairAssignments": aggregate_coherent_pair_assignments,
        "aggregateCoherentPairLocalCoverageAreaSumM2": (
            aggregate_coherent_coverage_area
        ),
        "aggregateCoherentMaximumCoverageDeltaM2": (
            aggregate_coherent_maximum_coverage_delta
        ),
        "aggregateCoherentCoveragePreserved": (
            aggregate_coherent_coverage_preserved
        ),
        "immutablePlaneSubsequentPassReconstructions": (
            immutable_plane_reconstructions
        ),
        "immutablePlaneSubsequentPassReconstructionAreaM2": (
            immutable_plane_reconstruction_area
        ),
        "immutablePlaneSubsequentPassAcceptedCoverageExpanded": (
            immutable_plane_accepted_coverage_expanded
        ),
        "float32PartitionRealizationProof": partition_proof,
        "lineageRemovalMaskCount": lineage_removal_mask_count,
        "lineageRemovalMaskAreaSumM2": lineage_removal_mask_area,
        "sharedSourceEdgeStripMasks": shared_source_edge_strip_masks,
        "sharedSourceEdgeStripAreaM2": shared_source_edge_strip_area,
        "pairCountSequence": pair_sequence,
        "strictlyDecreasingPasses": all(
            report.get("strictlyDecreased") for report in pass_reports
        ),
        "progressRule": (
            "POSITIVE_ACCEPTED_MASK_SOURCE_SURFACE_INTERSECTION_OR_"
            "SAME_LINEAGE_OR_EXACT_DUPLICATE_CONSOLIDATION_WITH_PAIR_DECREASE"
        ),
        "progressValidatedPasses": all(
            report.get("progressRuleSatisfied") for report in pass_reports
        ),
        "nonDecreasingPairPasses": [
            report["pass"] for report in pass_reports
            if not report.get("strictlyDecreased")
        ],
        "repeatedGeometryStateDetected": False,
        "surfaceAreaBeforeM2": before_surface_area,
        "surfaceAreaAfterM2": current_surface_area,
        "surfaceAreaRemovedM2": before_surface_area - current_surface_area,
        "recordLocalRemovalIntersectionSurfaceAreaSumM2": sum(
            report.get("recordLocalRemovalIntersectionSurfaceAreaM2", 0.0)
            for report in pass_reports
        ),
        "lineageRemovalIntersectionSurfaceAreaSumM2": sum(
            report.get("lineageRemovalIntersectionSurfaceAreaM2", 0.0)
            for report in pass_reports
        ),
        "positiveRemovalEvidenceAreaSumM2": sum(
            report.get("positiveRemovalEvidenceAreaSumM2", 0.0)
            for report in pass_reports
        ),
        "initialGeometryStateSha256": initial_geometry_state,
        "finalGeometryStateSha256": scene_geometry_state_sha256(objects),
        "stabilized": final_scan["pairCount"] == 0,
        "stabilizationPassCount": len(pass_reports),
        "stabilizationPasses": pass_reports,
        "conflicts": conflict_totals,
        "lineageProof": {
            "method": "IMMUTABLE_SOURCE_TRIANGLE_PLANE_UNION_AND_CONSTRAINED_RETRIANGULATION",
            "lineage": "INITIAL_OWNER_AND_SOURCE_TRIANGLE_ID",
            "scope": "IN_MEMORY_CLEANUP_AID_NOT_REQUIRED_BY_FINAL_ACCEPTANCE",
            "carriedAcrossRetriangulation": True,
            "sameOwnerRequired": True,
            "sameMaterialRequired": True,
            "sameLineagePairsConsolidated": same_lineage_pairs_consolidated,
            "sameLineageCoherentCrossingPairsConsolidated": (
                same_lineage_crossing_pairs_consolidated
            ),
            "aggregateCoherentLineagePairGroups": aggregate_coherent_groups,
            "aggregateCoherentCrossingGroups": aggregate_crossing_groups,
            "aggregateMixedSignedWinnerGroups": aggregate_mixed_winner_groups,
            "aggregateCoherentPairAssignments": (
                aggregate_coherent_pair_assignments
            ),
            "aggregateCoherentPairLocalCoverageAreaSumM2": (
                aggregate_coherent_coverage_area
            ),
            "aggregateCoherentMaximumCoverageDeltaM2": (
                aggregate_coherent_maximum_coverage_delta
            ),
            "aggregateCoherentCoveragePreserved": (
                aggregate_coherent_coverage_preserved
            ),
            "aggregateCoherentCrossingExpandsAcceptedCoverage": False,
            "subsequentPassReconstructionPlane": (
                "IMMUTABLE_SOURCE_LINEAGE_PLANE_WITH_CANONICAL_EDGES"
            ),
            "immutablePlaneSubsequentPassReconstructions": (
                immutable_plane_reconstructions
            ),
            "immutablePlaneSubsequentPassReconstructionAreaM2": (
                immutable_plane_reconstruction_area
            ),
            "immutablePlaneSubsequentPassAcceptedCoverageExpanded": (
                immutable_plane_accepted_coverage_expanded
            ),
            "float32PartitionRealization": partition_proof,
            "globalMinimumWidthExemption": False,
            "finalArtifactAcceptanceDependsOnLineage": False,
            "crossLineageRemovalScope": "IMMUTABLE_LOSER_LINEAGE_UNION",
            "recordLocalSiblingReintroductionPrevented": True,
            "lineageRemovalMaskCount": lineage_removal_mask_count,
            "lineageRemovalMaskAreaSumM2": lineage_removal_mask_area,
            "lineageConsolidationCount": lineage_consolidation_count,
            "sourcePlaneProofConsolidationCount": (
                source_plane_proof_consolidation_count
            ),
            "maximumSourcePlaneMeasuredStoredDriftM": (
                maximum_source_plane_measured_drift
            ),
            "maximumSourcePlaneArithmeticGuardM": (
                maximum_source_plane_arithmetic_guard
            ),
            "maximumSourcePlaneMeasuredStoredDriftPlusArithmeticGuardM": (
                maximum_source_plane_drift_plus_guard
            ),
            "sourcePlaneActualStoredDriftLimitM": BOUNDS_DRIFT_LIMIT_M,
            "sourcePlaneActualStoredDriftProofPassed": (
                source_plane_actual_drift_proof_passed
            ),
            "maximumSourcePlaneRepresentationalErrorBoundM": (
                maximum_source_plane_representational_bound
            ),
            "sourcePlaneRepresentationalErrorBoundIsInformational": True,
            "allSourcePlaneWorldOriginCancellationAvoided": (
                all_source_plane_cancellation_avoided
            ),
            "canonicalSharedSourceEdgeMethod": (
                "IMMUTABLE_CONSISTENTLY_ORIENTED_LATERAL_EDGE_WITH_OWN_SOURCE_PLANE_RECONSTRUCTION"
            ),
            "canonicalSharedSourceLineageCount": len(canonical_source_edges),
            "canonicalSharedSourceEdgesPreserveFacePlanes": True,
            "canonicalSharedSourceEdgePlaneTolerance": (
                "REPORTED_FLOAT32_QUANTIZATION_GUARD_ONLY"
            ),
            "canonicalSharedSourceEdgesPreserveMaterialBoundaries": True,
            "sharedSourceEdgeStripScope": (
                "CLEANUP_GUARD_ACCEPTED_SAME_OBJECT_SAME_MATERIAL_PAIR_ONLY"
            ),
            "sharedSourceEdgeStripUsesCleanupQuantizationGuard": True,
            "sharedSourceEdgeStripLocalization": (
                "INTERSECTION_WITH_ACCEPTED_LOSER_COVERAGE_BUFFERED_BY_SAME_CLEANUP_GUARD"
            ),
            "sharedSourceEdgeStripCoverageBounded": True,
            "sharedSourceEdgeStripMasks": shared_source_edge_strip_masks,
            "sharedSourceEdgeStripAreaM2": shared_source_edge_strip_area,
        },
        "objects": object_summary,
        "remainingPairSamples": [],
        "proofExpectations": {
            "acceptedPairsAfter": 0,
            "exactDuplicatePairsAfter": 0,
            "maximumPasses": MAX_PASSES,
            "everyPassMakesSafeGeometryProgress": True,
            "pairCountMayReboundOnlyWithPositiveAcceptedMaskRemoval": True,
            "repeatedGeometryStateAllowed": False,
            "boundsDriftAtMostM": BOUNDS_DRIFT_LIMIT_M,
            "minimumWidthExemption": False,
            "aggregateCoherentCrossingExpandsAcceptedCoverage": False,
            "aggregateCoherentCoveragePreserved": True,
            "subsequentPassReconstructionExpandsAcceptedCoverage": False,
            "float32PartitionRealizationPassed": True,
            "float32PartitionProjectedOverlapAreaM2": 0.0,
            "float32PartitionProjectedSymmetricDifferenceM2": 0.0,
            "float32PartitionCoverageExpansionAreaM2": 0.0,
            "float32PartitionAcceptedPairsAfter": 0,
            "float32PartitionSharedMeshVertexIndexReusePassed": True,
            "float32PartitionPreexistingCanonicalEdgeCoverageDeltaUnchanged": True,
        },
        "passed": (
            final_scan["pairCount"] == 0
            and len(pass_reports) <= MAX_PASSES
            and all(report.get("progressRuleSatisfied") for report in pass_reports)
            and bounds_drift <= BOUNDS_DRIFT_LIMIT_M
            and source_plane_actual_drift_proof_passed
            and aggregate_coherent_coverage_preserved
            and not immutable_plane_accepted_coverage_expanded
            and partition_proof["passed"]
        ),
    }
