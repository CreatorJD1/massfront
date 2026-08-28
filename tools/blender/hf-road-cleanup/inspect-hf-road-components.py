"""Inspect Hunyuan road topology without modifying the immutable source."""

import bpy
import hashlib
import json
import math
import sys
from collections import defaultdict, deque
from pathlib import Path


EXPECTED_SHA256 = "62EC702437FAC75D3651B0130BE094DD8A824FB559A97A46319B131F6225B166"


def repository_root():
    return Path(__file__).resolve().parents[3]


def repository_relative(path):
    absolute = Path(path).resolve()
    try:
        return absolute.relative_to(repository_root()).as_posix()
    except ValueError as exc:
        raise ValueError("diagnostic paths must stay inside the repository: %s" % absolute) from exc


def sha256(path):
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest().upper()


def triangle_area(a, b, c):
    return ((b - a).cross(c - a)).length * 0.5


def component_report(obj):
    mesh = obj.data
    mesh.calc_loop_triangles()
    triangles = list(mesh.loop_triangles)
    vertex_triangles = defaultdict(list)
    for index, triangle in enumerate(triangles):
        for vertex in triangle.vertices:
            vertex_triangles[vertex].append(index)

    visited = bytearray(len(triangles))
    components = []
    for seed in range(len(triangles)):
        if visited[seed]:
            continue
        queue = deque([seed])
        visited[seed] = 1
        indexes = []
        vertices = set()
        while queue:
            index = queue.popleft()
            indexes.append(index)
            triangle = triangles[index]
            for vertex in triangle.vertices:
                vertices.add(vertex)
                for neighbor in vertex_triangles[vertex]:
                    if not visited[neighbor]:
                        visited[neighbor] = 1
                        queue.append(neighbor)

        points = [mesh.vertices[index].co for index in vertices]
        minimum = [min(point[axis] for point in points) for axis in range(3)]
        maximum = [max(point[axis] for point in points) for axis in range(3)]
        dimensions = [maximum[axis] - minimum[axis] for axis in range(3)]
        surface_area = 0.0
        degenerate = 0
        normal_z_weight = 0.0
        for index in indexes:
            tri = triangles[index]
            a, b, c = (mesh.vertices[value].co for value in tri.vertices)
            area = triangle_area(a, b, c)
            surface_area += area
            if area <= 1e-12:
                degenerate += 1
            normal_z_weight += tri.normal.z * area
        components.append({
            "triangles": len(indexes),
            "vertices": len(vertices),
            "min": minimum,
            "max": maximum,
            "dimensions": dimensions,
            "surfaceArea": surface_area,
            "degenerateTriangles": degenerate,
            "areaWeightedNormalZ": normal_z_weight / surface_area if surface_area else 0.0,
        })
    components.sort(key=lambda item: (-item["triangles"], -item["surfaceArea"]))
    for index, component in enumerate(components):
        component["rank"] = index
    return components


def duplicate_face_report(obj, precision=7):
    mesh = obj.data
    mesh.calc_loop_triangles()
    buckets = defaultdict(list)
    for index, triangle in enumerate(mesh.loop_triangles):
        points = []
        for vertex in triangle.vertices:
            coordinate = mesh.vertices[vertex].co
            points.append(tuple(round(coordinate[axis], precision) for axis in range(3)))
        buckets[tuple(sorted(points))].append(index)
    duplicates = [indexes for indexes in buckets.values() if len(indexes) > 1]
    return {
        "precisionDigits": precision,
        "groups": len(duplicates),
        "trianglesInGroups": sum(len(group) for group in duplicates),
        "extraTriangles": sum(len(group) - 1 for group in duplicates),
        "largestGroup": max((len(group) for group in duplicates), default=0),
    }


def main():
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    if len(args) != 2:
        raise SystemExit("usage: blender --background --python inspect-hf-road-components.py -- SOURCE.glb OUTPUT.json")
    source, output = map(Path, args)
    source_relative = repository_relative(source)
    output_relative = repository_relative(output)
    source_hash = sha256(source)
    if source_hash != EXPECTED_SHA256:
        raise RuntimeError("immutable source hash mismatch: " + source_hash)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(source))
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    if len(meshes) != 1:
        raise RuntimeError("expected one source mesh, found %d" % len(meshes))
    obj = meshes[0]
    components = component_report(obj)
    report = {
        "status": "SOURCE_DIAGNOSTIC_ONLY",
        "runtimeAccepted": False,
        "source": {"path": source_relative, "sha256": source_hash},
        "mesh": {
            "name": obj.name,
            "vertices": len(obj.data.vertices),
            "polygons": len(obj.data.polygons),
            "triangles": sum(component["triangles"] for component in components),
        },
        "connectedComponents": {
            "count": len(components),
            "components": components,
        },
        "exactDuplicateFaces": duplicate_face_report(obj),
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "status": report["status"],
        "components": len(components),
        "largest": components[:8],
        "duplicateFaces": report["exactDuplicateFaces"],
        "output": output_relative,
    }, separators=(",", ":")))


if __name__ == "__main__":
    main()
