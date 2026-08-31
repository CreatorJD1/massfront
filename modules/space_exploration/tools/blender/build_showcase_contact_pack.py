"""Build the authored MASSFRONT three-system showcase contact pack.

Each top-level contact root is a stable runtime contract. Visible geometry is
made from authored profiles, lofts, swept tubes and chamfered footprints; no
Blender mesh primitives are used. LOD0 child names reserve a clean boundary
for later mobile LOD generation without changing the contact IDs.
"""

from __future__ import annotations

import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector


HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(HERE))

from build_uga_assets import (  # noqa: E402
    add_empty,
    footprint,
    lathe,
    loft,
    mesh_object,
    pbr_material,
    prism,
    reset_scene,
    simple_material,
)


MODEL_DIR = ROOT / "assets" / "models"
SOURCE_DIR = ROOT / "assets" / "source" / "blender"
GLB_PATH = MODEL_DIR / "massfront-showcase-contacts.glb"
BLEND_PATH = SOURCE_DIR / "massfront-showcase-contacts.blend"

CONTACT_IDS = (
    "aelos_embassy_spindle",
    "aelos_logistics_array",
    "aelos_veyra_gate",
    "veyra_archive_hulk",
    "veyra_aelos_gate",
    "veyra_karak_gate",
    "karak_colony_spine",
    "karak_lifeboat_field",
    "karak_veyra_gate",
)


def swept_ring(name, major, tube, depth, material, parent, start=0.0, end=math.tau, segments=48, tube_segments=8):
    """Create a complete or partial armored ring with a non-circular section."""
    closed = abs((end - start) - math.tau) < 1e-5
    rows = segments if closed else segments + 1
    vertices = []
    for i in range(rows):
        t = i / segments
        a = start + (end - start) * t
        for j in range(tube_segments):
            p = math.tau * j / tube_segments
            radius = major + math.cos(p) * tube
            vertices.append((math.cos(a) * radius, math.sin(a) * radius, math.sin(p) * depth))
    faces = []
    links = rows if closed else rows - 1
    for i in range(links):
        ni = (i + 1) % rows
        for j in range(tube_segments):
            nj = (j + 1) % tube_segments
            faces.append((i * tube_segments + j, i * tube_segments + nj, ni * tube_segments + nj, ni * tube_segments + j))
    if not closed:
        faces.append(tuple(reversed(range(tube_segments))))
        last = (rows - 1) * tube_segments
        faces.append(tuple(last + j for j in range(tube_segments)))
    # The authored multi-sided section already carries the highlight rolloff.
    # A live Bevel modifier made one open arc export with a 409/410 vertex race
    # between otherwise identical Blender runs, so rings export directly.
    return mesh_object(name, vertices, faces, material, parent, 0, True)


def tube_path(name, points, radius, material, parent, sides=9, taper=0.58):
    """Sweep a tapered tube along an authored path for cables or infestation."""
    path = [Vector(point) for point in points]
    vertices = []
    for i, point in enumerate(path):
        prev = path[max(0, i - 1)]
        nxt = path[min(len(path) - 1, i + 1)]
        tangent = (nxt - prev).normalized()
        reference = Vector((0, 0, 1)) if abs(tangent.z) < .82 else Vector((0, 1, 0))
        axis_a = tangent.cross(reference).normalized()
        axis_b = tangent.cross(axis_a).normalized()
        edge_taper = 1.0
        if i == 0 or i == len(path) - 1:
            edge_taper = taper
        for j in range(sides):
            angle = math.tau * j / sides
            offset = axis_a * math.cos(angle) + axis_b * math.sin(angle)
            vertex = point + offset * radius * edge_taper
            vertices.append(tuple(vertex))
    faces = []
    for i in range(len(path) - 1):
        for j in range(sides):
            nj = (j + 1) % sides
            faces.append((i * sides + j, i * sides + nj, (i + 1) * sides + nj, (i + 1) * sides + j))
    faces.append(tuple(reversed(range(sides))))
    last = (len(path) - 1) * sides
    faces.append(tuple(last + j for j in range(sides)))
    return mesh_object(name, vertices, faces, material, parent, .025, True)


def aperture_membrane(name, radius, material, parent, segments=48, warp=.16):
    """Build a shallow faceted phase membrane without a Plane/Circle primitive."""
    vertices = [(0, 0, 0)]
    for i in range(segments):
        angle = math.tau * i / segments
        r = radius * (1.0 + math.sin(angle * 3.0) * warp * .08)
        vertices.append((math.cos(angle) * r, math.sin(angle) * r, math.sin(angle * 4.0) * warp))
    faces = []
    for i in range(segments):
        faces.append((0, i + 1, (i + 1) % segments + 1))
    return mesh_object(name, vertices, faces, material, parent, 0, False)


def contact_root(pack, contact_id, kind, system_id, hazard=False):
    root = add_empty(
        contact_id,
        (0, 0, 0),
        pack,
        {
            "asset_role": "showcase_contact",
            "contact_id": contact_id,
            "system_id": system_id,
            "contact_kind": kind,
            "hazard": hazard,
            "art_complete": True,
            "asset_version": 1,
            "lod_levels": 3,
        },
    )
    lod = add_empty(
        f"LOD0_{contact_id}",
        (0, 0, 0),
        root,
        {"lod": 0, "contact_id": contact_id, "lod_ready": True},
    )
    add_empty(
        f"FOCUS_{contact_id}",
        (0, 0, 0),
        root,
        {"contact_id": contact_id, "camera_distance": 72.0},
    )
    add_empty(
        f"SOCKET_INTERACTION_{contact_id}",
        (0, 0, 0),
        root,
        {"contact_id": contact_id, "socket_role": "interaction"},
    )
    return root, lod


def named(obj, contact_id, role):
    obj.name = f"LOD0_{contact_id}__{role}"
    obj["contact_id"] = contact_id
    obj["model_role"] = role
    return obj


def bake_authored_edge_finishing():
    """Apply generated finishing in a stable name order before glTF export."""
    for obj in sorted((item for item in bpy.data.objects if item.type == "MESH"), key=lambda item: item.name):
        if not obj.modifiers:
            continue
        bpy.ops.object.select_all(action="DESELECT")
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        for modifier in tuple(obj.modifiers):
            bpy.ops.object.modifier_apply(modifier=modifier.name)
        obj.select_set(False)


def keep_in_silhouette_lod(role):
    """Cull only authored micro-detail that cannot survive contact-map scale."""
    if role.startswith("embassy_wing_inset_"):
        return False
    if role.startswith("archive_debris_") or role.startswith("lifeboat_debris_"):
        return role.endswith(("_1", "_4"))
    if role.startswith("torn_service_keel_"):
        return role.endswith("_1")
    if role.startswith("torn_data_shelf_") or role.startswith("exposed_frame_"):
        return role.endswith(("_1", "_3"))
    return True


def build_contact_lods():
    """Duplicate LOD0 into reduced authored tiers without changing its meshes."""
    for contact_id in CONTACT_IDS:
        root = bpy.data.objects[contact_id]
        source_lod = bpy.data.objects[f"LOD0_{contact_id}"]
        source_meshes = sorted((child for child in source_lod.children if child.type == "MESH"), key=lambda item: item.name)
        for level, ratio in ((1, .42), (2, .13)):
            lod = add_empty(
                f"LOD{level}_{contact_id}",
                tuple(source_lod.location),
                root,
                {
                    "lod": level,
                    "contact_id": contact_id,
                    "lod_ready": True,
                    "source_lod": 0,
                    "target_triangle_ratio": ratio,
                    "initially_hidden": True,
                },
            )
            lod.rotation_mode = source_lod.rotation_mode
            lod.rotation_euler = source_lod.rotation_euler.copy()
            lod.scale = source_lod.scale.copy()
            for source in source_meshes:
                role = source.get("model_role", source.name.split("__", 1)[-1])
                if level == 2 and not keep_in_silhouette_lod(role):
                    continue
                duplicate = source.copy()
                duplicate.data = source.data.copy()
                duplicate.name = f"LOD{level}_{contact_id}__{role}"
                duplicate.parent = lod
                duplicate["contact_id"] = contact_id
                duplicate["model_role"] = role
                duplicate["lod"] = level
                bpy.context.collection.objects.link(duplicate)
                polygon_count = len(duplicate.data.polygons)
                if polygon_count >= 6:
                    reduction = duplicate.modifiers.new(f"LOD{level} authored reduction", "DECIMATE")
                    reduction.decimate_type = "COLLAPSE"
                    reduction.ratio = ratio
                    reduction.use_collapse_triangulate = True


def build_embassy(pack, mats):
    cid = "aelos_embassy_spindle"
    root, lod = contact_root(pack, cid, "station", "aelos")
    named(loft("EmbassyAxialHabitat", [(-28, 2.0, 1.5), (-22, 5.2, 3.2), (-9, 6.7, 4.2), (7, 6.2, 4.0), (20, 4.7, 2.8), (29, 1.4, 1.0)], 24, mats["hull"], lod, .10, .045), cid, "axial_habitat")
    named(swept_ring("EmbassyCivicRing", 11.6, 1.0, .72, mats["structure"], lod, segments=60, tube_segments=10), cid, "civic_ring")
    named(swept_ring("EmbassyTransitRing", 8.6, .42, .38, mats["cyan"], lod, segments=54, tube_segments=8), cid, "transit_light_ring")

    for wing, (angle, accent) in enumerate(((math.radians(92), mats["cyan"]), (math.radians(212), mats["amber"]), (math.radians(332), mats["violet"]))):
        radial = Vector((math.cos(angle), math.sin(angle)))
        tangent = Vector((-math.sin(angle), math.cos(angle)))
        points = []
        for r, t in ((4.0, -2.1), (13.8, -4.0), (20.2, -1.5), (19.0, 1.7), (12.2, 4.4), (4.0, 2.0)):
            point = radial * r + tangent * t
            points.append((point.x, point.y))
        named(prism(f"EmbassyWing{wing + 1}", points, -1.3, 1.3, mats["hull"], lod, .10, .88), cid, f"embassy_wing_{wing + 1}")
        inset = [(x * .91, y * .91) for x, y in points]
        named(prism(f"EmbassyWingInset{wing + 1}", inset, 1.31, 1.58, mats["structure"], lod, .045, .92), cid, f"embassy_wing_inset_{wing + 1}")
        x, y = radial * 17.0
        tower = loft(f"EmbassyTower{wing + 1}", [(-4.5, 2.7, 2.0), (-2.0, 3.4, 2.5), (5.0, 2.7, 2.0), (10.0, .55, .42)], 18, mats["structure"], lod, .08, wing * .08)
        tower.location = (x, y, 2.0)
        named(tower, cid, f"faction_tower_{wing + 1}")
        beacon = loft(f"EmbassyBeacon{wing + 1}", [(9.6, .42, .32), (10.4, .58, .42), (11.1, .10, .08)], 14, accent, lod, .018)
        beacon.location = (x, y, 2.0)
        named(beacon, cid, f"faction_beacon_{wing + 1}")
    return root


def build_logistics(pack, mats):
    cid = "aelos_logistics_array"
    root, lod = contact_root(pack, cid, "logistics", "aelos")
    lod.rotation_euler[1] = math.radians(90)
    named(loft("LogisticsFreightSpine", [(-39, 1.0, .9), (-35, 3.8, 2.8), (-20, 4.5, 3.2), (2, 4.0, 3.0), (22, 5.0, 3.4), (37, 2.2, 1.5), (41, .4, .3)], 20, mats["structure"], lod, .10, -.035), cid, "freight_spine")
    for bay, z in enumerate((-27, -12, 5, 22)):
        named(lathe(f"LogisticsDrum{bay + 1}", [(z - 3.8, 5.8), (z - 2.8, 7.1), (z + 2.8, 7.1), (z + 3.8, 5.8)], 36, mats["hull"], lod, .07), cid, f"cargo_drum_{bay + 1}")
        named(swept_ring(f"LogisticsDrumLight{bay + 1}", 7.2, .20, .18, mats["cyan" if bay % 2 == 0 else "amber"], lod, segments=40, tube_segments=7), cid, f"cargo_status_ring_{bay + 1}").location.z = z
        for side in (-1, 1):
            module = prism(
                f"LogisticsContainer{bay + 1}_{side:+d}",
                footprint(side * 9.2, 0, 5.8, 4.2, .72),
                z - 3.0,
                z + 3.0,
                mats["hull"],
                lod,
                .12,
                .84,
            )
            named(module, cid, f"cargo_module_{bay + 1}_{'port' if side < 0 else 'starboard'}")
    for rail, x in enumerate((-11.8, 11.8)):
        path = [(x, 0, -32), (x * 1.05, 0, -10), (x * .98, 0, 12), (x, 0, 31)]
        named(tube_path(f"LogisticsDockRail{rail + 1}", path, .42, mats["structure"], lod, 10, .82), cid, f"dock_rail_{rail + 1}")
    return root


def build_gate(pack, mats, cid, system_id, style, accent_key, infected=False):
    root, lod = contact_root(pack, cid, "phase_gate", system_id, infected or style == "fractured")
    accent = mats[accent_key]
    phase = mats["void"]

    # The Veyra return gate uses a compressed ancient aperture, keeping its
    # silhouette legible beside Aelos's near-circular triskelion at map scale.
    if style == "triarch":
        lod.scale = (1.18, .82, 1.0)

    variants = {
        "triskelion": ((-2.72, -.45), (-.10, 1.86), (2.32, 4.26)),
        "triarch": ((-2.95, -.72), (-.38, 1.22), (1.52, 3.72)),
        "fractured": ((-2.82, -1.12), (-.52, .62), (1.02, 2.42), (2.86, 3.74)),
        "infected": ((-2.72, -1.35), (-.84, .22), (.74, 1.72), (2.22, 3.48)),
    }
    arcs = variants[style]
    for arc, (start, end) in enumerate(arcs):
        ring = swept_ring(f"GateArc{arc + 1}", 17.0 + (arc % 2) * .8, 1.38, .82, mats["hull" if arc % 2 == 0 else "structure"], lod, start, end, 24, 9)
        if style == "fractured" and arc == 2:
            ring.rotation_euler[0] = .24
            ring.location.z = 1.6
        if infected and arc == 1:
            ring.rotation_euler[1] = -.18
            ring.location.x = 1.2
        named(ring, cid, f"aperture_arc_{arc + 1}")

    pylon_angles = {
        "triskelion": (math.radians(90), math.radians(210), math.radians(330)),
        "triarch": (math.radians(35), math.radians(155), math.radians(275)),
        "fractured": (math.radians(12), math.radians(118), math.radians(236)),
        "infected": (math.radians(68), math.radians(188), math.radians(310)),
    }[style]
    for pylon, angle in enumerate(pylon_angles):
        radial = Vector((math.cos(angle), math.sin(angle)))
        tangent = Vector((-math.sin(angle), math.cos(angle)))
        points = []
        for r, t in ((14.0, -2.2), (20.0, -3.5), (25.2, -1.2), (23.5, 1.8), (18.0, 3.2), (14.0, 2.1)):
            point = radial * r + tangent * t
            points.append((point.x, point.y))
        body = prism(f"GatePylon{pylon + 1}", points, -2.0, 2.0, mats["structure"], lod, .11, .82)
        if style in {"fractured", "infected"} and pylon == 1:
            body.rotation_euler[1] = .28 if infected else -.36
            body.location.z = -2.2
        named(body, cid, f"phase_pylon_{pylon + 1}")
        light_points = []
        for r, t in ((18.0, -.34), (23.0, -.42), (23.4, .42), (18.0, .34)):
            point = radial * r + tangent * t
            light_points.append((point.x, point.y))
        strip = prism(f"GatePylonStrip{pylon + 1}", light_points, 2.02, 2.28, accent, lod, .025, .90)
        if style in {"fractured", "infected"} and pylon == 1:
            strip.rotation_euler[1] = body.rotation_euler[1]
            strip.location.z = body.location.z
        named(strip, cid, f"phase_pylon_light_{pylon + 1}")

    named(swept_ring("GateInnerConduit", 12.8, .30, .30, accent, lod, segments=54, tube_segments=8), cid, "inner_conduit")
    named(aperture_membrane("GatePhaseMembrane", 11.8, phase, lod, 54, .20 if infected else .08), cid, "phase_membrane")

    field_paths = {
        "triskelion": (
            [(-10.4, -2.2, -.2), (-4.0, .7, .2), (1.1, 2.1, -.1), (8.8, 7.0, .15)],
            [(-7.6, 7.8, .15), (-2.2, 3.1, -.1), (2.0, -.6, .1), (9.7, -3.4, -.2)],
            [(-2.0, -10.1, -.15), (-1.0, -4.1, .12), (.6, 1.6, -.1), (3.2, 9.5, .2)],
        ),
        "triarch": (
            [(-10.1, 3.2, 0), (-5.2, -.2, .15), (1.5, -1.4, -.1), (9.6, 2.6, .1)],
            [(-6.2, -8.4, .1), (-2.0, -2.9, -.1), (2.4, 1.0, .12), (5.8, 8.7, -.1)],
        ),
        "fractured": (
            [(-9.8, 4.5, .2), (-4.0, 1.2, -.1), (.2, -2.3, .12), (8.6, -6.1, -.2)],
            [(-5.7, -8.8, -.1), (-2.1, -3.6, .2), (3.5, 1.5, -.1), (9.0, 6.4, .12)],
        ),
        "infected": (
            [(-10.3, -1.0, -.1), (-4.8, 2.2, .22), (.8, -.7, -.15), (9.5, 3.9, .18)],
            [(-3.7, -9.8, .16), (-1.2, -4.2, -.1), (3.2, 1.9, .18), (6.7, 8.5, -.2)],
        ),
    }[style]
    for filament, path in enumerate(field_paths):
        named(tube_path(f"GatePhaseFilament{filament + 1}", path, .15 if not infected else .20, accent if not infected else mats["brood_glow"], lod, 7, .30), cid, f"phase_filament_{filament + 1}")

    if infected:
        tendrils = (
            [(-21, 5, 2), (-12, 2, 1), (-5, -1, .4), (3, 4, .2), (13, 9, 1)],
            [(-10, -17, -1), (-5, -9, 0), (2, -4, .5), (8, 2, .2), (18, 7, -1)],
            [(19, -9, 1), (10, -5, .3), (4, 1, 0), (-2, 8, .5), (-8, 17, 1)],
        )
        for i, path in enumerate(tendrils):
            named(tube_path(f"GateInfestationTendril{i + 1}", path, .72 - i * .1, mats["organic"], lod, 10, .30), cid, f"brood_tendril_{i + 1}")
    return root


def build_archive_hulk(pack, mats):
    cid = "veyra_archive_hulk"
    root, lod = contact_root(pack, cid, "derelict", "veyra", True)
    lod.rotation_euler[1] = math.radians(90)
    segments = (
        ("bow", [(-38, .3, .2), (-35, 3.0, 1.8), (-29, 7.4, 3.4), (-21, 8.0, 3.7)]),
        ("archive", [(-17, 7.1, 3.3), (-9, 9.6, 4.2), (2, 8.8, 4.0), (8, 5.4, 2.8)]),
        ("drive", [(13, 4.8, 2.5), (20, 7.8, 3.5), (30, 6.0, 3.0), (37, 2.0, 1.2)]),
    )
    for idx, (label, profile) in enumerate(segments):
        hull = loft(f"ArchiveHulk{label.title()}", profile, 20, mats["structure" if idx == 1 else "hull"], lod, .09, idx * .14)
        hull.location.x = (idx - 1) * .8
        hull.rotation_euler[1] = (idx - 1) * .08
        named(hull, cid, f"broken_hull_{label}")
    for rib, z in enumerate((-19.4, -17.8, 9.6, 11.4)):
        ring = swept_ring(f"ArchiveExposedRib{rib + 1}", 7.4 if rib < 2 else 5.2, .28, .42, mats["amber" if rib % 2 else "structure"], lod, -2.45, 2.35, 28, 7)
        ring.location.z = z
        ring.rotation_euler[0] = rib * .17
        named(ring, cid, f"exposed_frame_{rib + 1}")
    for wing, (side, z) in enumerate(((-1, -8), (1, -4), (-1, 21), (1, 24))):
        points = [(-2.4, side * 4.5), (-.6, side * 12.0), (3.8, side * 15.2), (5.6, side * 7.0), (2.0, side * 3.8)]
        plate = prism(f"ArchiveBrokenWing{wing + 1}", points, z - 1.2, z + 1.2, mats["damage"], lod, .08, .76)
        plate.rotation_euler[2] = (wing - 1.5) * .08
        named(plate, cid, f"fractured_archive_wing_{wing + 1}")
    archive_shelves = (
        (-1, -14, 7.0, -.10),
        (1, -5, 9.0, .08),
        (-1, 6, 8.0, .14),
        (1, 18, 7.4, -.16),
    )
    for shelf, (side, z, reach, twist) in enumerate(archive_shelves):
        points = [
            (-2.8, side * 4.4),
            (-1.0, side * (reach + 2.8)),
            (1.5, side * (reach + 5.5)),
            (4.1, side * (reach + .6)),
            (2.8, side * 3.7),
        ]
        blade = prism(f"ArchiveDataShelf{shelf + 1}", points, z - 2.8, z + 3.8, mats["structure"], lod, .07, .74)
        blade.rotation_euler[2] = twist
        named(blade, cid, f"torn_data_shelf_{shelf + 1}")
    broken_keels = (
        [(-4.8, -3.0, -33), (-6.0, -4.0, -21), (-5.2, -5.2, -13), (-7.2, -4.0, -5)],
        [(-7.2, -4.0, 1), (-5.0, -5.6, 10), (-4.2, -3.2, 20), (-2.8, -2.4, 31)],
        [(5.8, 2.8, -29), (7.0, 4.8, -17), (6.2, 5.6, -8), (8.0, 3.8, 2), (5.4, 3.0, 15)],
    )
    for keel, path in enumerate(broken_keels):
        named(tube_path(f"ArchiveTornKeel{keel + 1}", path, .36 - keel * .04, mats["damage"], lod, 8, .45), cid, f"torn_service_keel_{keel + 1}")
    for shard, point in enumerate(((-13, 8, 6), (-5, -11, -5), (15, 9, 7), (25, -8, -6), (2, 14, 4))):
        x, y, z = point
        debris = prism(f"ArchiveDebris{shard + 1}", footprint(x, y, 2.4 + shard * .2, 1.3, .25), z - .5, z + .5, mats["damage"], lod, .045, .62)
        debris.rotation_euler = (shard * .17, shard * .11, shard * .23)
        named(debris, cid, f"archive_debris_{shard + 1}")
    named(loft("ArchiveDormantCore", [(-2, 1.5, 1.1), (0, 2.2, 1.6), (2, 1.5, 1.1)], 18, mats["violet"], lod, .035), cid, "dormant_archive_core").location.z = -2
    return root


def build_colony_spine(pack, mats):
    cid = "karak_colony_spine"
    root, lod = contact_root(pack, cid, "station", "karak", True)
    named(loft("ColonyCentralSpine", [(-39, 1.3, 1.1), (-34, 4.6, 3.1), (-18, 7.0, 4.5), (1, 6.3, 4.0), (18, 8.0, 4.8), (31, 4.2, 2.8), (38, .7, .5)], 22, mats["structure"], lod, .11, .08), cid, "quarantined_spine")
    for tier, (z, radius) in enumerate(((-23, 10.5), (-8, 13.0), (9, 11.7), (23, 8.8))):
        start = -.35 + tier * .24
        ring = swept_ring(f"ColonyHabitatArc{tier + 1}", radius, 1.0, .72, mats["hull" if tier % 2 else "structure"], lod, start, start + math.radians(292 - tier * 17), 42, 9)
        ring.location.z = z
        ring.rotation_euler[0] = (tier - 1.5) * .08
        named(ring, cid, f"broken_habitat_arc_{tier + 1}")
        for branch in range(3):
            angle = start + .35 + branch * 1.82
            radial = Vector((math.cos(angle), math.sin(angle)))
            tangent = Vector((-math.sin(angle), math.cos(angle)))
            points = []
            for r, t in ((4.0, -1.4), (radius - .6, -2.1), (radius + 4.0, -.8), (radius + 3.0, 1.0), (radius - .5, 2.0), (4.0, 1.3)):
                p = radial * r + tangent * t
                points.append((p.x, p.y))
            branch_mesh = prism(f"ColonyBranch{tier + 1}_{branch + 1}", points, z - 1.0, z + 1.0, mats["damage" if branch == tier % 3 else "hull"], lod, .08, .83)
            named(branch_mesh, cid, f"habitat_branch_{tier + 1}_{branch + 1}")

    infestation_paths = (
        [(-5, -4, -32), (-7, -1, -21), (-3, 4, -9), (5, 6, 4), (7, 1, 18), (3, -4, 30)],
        [(8, 4, -22), (11, 7, -10), (8, 11, 2), (2, 13, 12), (-4, 9, 23)],
        [(-11, -3, -12), (-14, 2, -2), (-12, 8, 8), (-5, 10, 18), (2, 7, 28)],
    )
    for i, path in enumerate(infestation_paths):
        named(tube_path(f"ColonyBroodGrowth{i + 1}", path, 1.05 - i * .16, mats["organic"], lod, 11, .28), cid, f"brood_growth_{i + 1}")
    for node, point in enumerate(((4, 7, -5), (-9, 8, 12), (7, -6, 22))):
        x, y, z = point
        sac = loft(f"ColonyHiveNode{node + 1}", [(z - 2.2, .5, .4), (z, 2.1, 1.5), (z + 2.2, .4, .3)], 16, mats["brood_glow"], lod, .045, node * .15)
        sac.location.x = x
        sac.location.y = y
        named(sac, cid, f"active_hive_node_{node + 1}")
    return root


def build_lifeboat_field(pack, mats):
    cid = "karak_lifeboat_field"
    root, lod = contact_root(pack, cid, "derelict_field", "karak", True)
    placements = (
        (-18, -4, -12, .18, -.34, .72),
        (-7, 8, 9, -.42, .21, -1.08),
        (4, -9, -3, .26, .56, 1.72),
        (15, 5, 13, -.31, -.18, 2.34),
        (23, -7, -15, .48, .12, -2.52),
        (-23, 10, 17, -.22, .44, .28),
    )
    for pod, (x, y, z, rx, ry, rz) in enumerate(placements):
        profile = [(-6.2, .25, .18), (-5.3, 1.7, 1.1), (-2.4, 3.0, 1.8), (2.2, 3.2, 1.9), (5.0, 1.8, 1.2), (6.2, .35, .24)]
        shell = loft(f"LifeboatShell{pod + 1}", profile, 18, mats["damage" if pod in {1, 4} else "hull"], lod, .08, pod * .07)
        shell.location = (x, y, z)
        shell.rotation_euler = (rx, ry, rz)
        named(shell, cid, f"empty_lifeboat_{pod + 1}")
        if pod % 2 == 0:
            seam = swept_ring(f"LifeboatBrokenSeal{pod + 1}", 3.05, .20, .28, mats["red"], lod, -.8, 2.25, 20, 7)
            seam.location = (x, y, z + .8)
            seam.rotation_euler = (rx, ry, rz)
            named(seam, cid, f"broken_pressure_seal_{pod + 1}")
    debris_points = ((-13, -1, 1), (-2, 13, -14), (8, 11, 16), (17, -12, 3), (26, 7, -2), (-27, -8, 8), (1, -17, 12))
    for shard, (x, y, z) in enumerate(debris_points):
        shard_mesh = prism(f"LifeboatDebris{shard + 1}", footprint(x, y, 2.0 + (shard % 3), .8 + (shard % 2) * .5, .18), z - .32, z + .32, mats["damage"], lod, .025, .56)
        shard_mesh.rotation_euler = (shard * .21, shard * .27, shard * .33)
        named(shard_mesh, cid, f"lifeboat_debris_{shard + 1}")
    for growth, path in enumerate((
        [(-20, -3, -11), (-11, 1, -4), (-3, 5, 4), (6, 2, 10), (15, 5, 13)],
        [(-7, 8, 9), (-1, 2, 5), (6, -3, 1), (14, -7, -8), (23, -7, -15)],
        [(-23, 10, 17), (-14, 7, 10), (-5, 2, 3), (4, -9, -3)],
    )):
        named(tube_path(f"LifeboatOrganicThread{growth + 1}", path, .55 - growth * .06, mats["organic"], lod, 9, .22), cid, f"organic_thread_{growth + 1}")
    return root


def build_materials():
    return {
        "hull": pbr_material("Contact Pack Hull", "uga-hull", 4.2),
        "structure": pbr_material("Contact Pack Infrastructure", "uga-interior", 3.6),
        "damage": simple_material("Contact Pack Scorched Alloy", (.024, .029, .036, 1), .82, .64),
        "void": simple_material("Contact Pack Phase Void", (.002, .006, .012, 1), .08, .48, (.004, .012, .026, 1), .10),
        "cyan": simple_material("Contact Pack Cyan", (.015, .15, .19, 1), .25, .28, (.01, .72, 1.0, 1), 1.35),
        "amber": simple_material("Contact Pack Amber", (.15, .065, .012, 1), .30, .32, (1.0, .30, .025, 1), 1.25),
        "violet": simple_material("Contact Pack Violet", (.07, .025, .12, 1), .24, .30, (.48, .10, 1.0, 1), 1.2),
        "red": simple_material("Contact Pack Distress", (.16, .012, .018, 1), .18, .38, (1.0, .025, .018, 1), 1.35),
        "organic": simple_material("Brood Organic Contamination", (.055, .006, .008, 1), .06, .54, (.24, .002, .004, 1), .32),
        "brood_glow": simple_material("Brood Hive Bioluminescence", (.12, .008, .014, 1), .04, .42, (1.0, .018, .025, 1), 1.5),
    }


def main():
    reset_scene()
    mats = build_materials()
    pack = add_empty(
        "MASSFRONT_SHOWCASE_CONTACT_PACK",
        (0, 0, 0),
        extras={"asset_role": "showcase_contact_pack", "asset_version": 1, "contact_count": len(CONTACT_IDS)},
    )
    build_embassy(pack, mats)
    build_logistics(pack, mats)
    build_gate(pack, mats, "aelos_veyra_gate", "aelos", "triskelion", "cyan")
    build_archive_hulk(pack, mats)
    build_gate(pack, mats, "veyra_aelos_gate", "veyra", "triarch", "cyan")
    build_gate(pack, mats, "veyra_karak_gate", "veyra", "fractured", "violet")
    build_colony_spine(pack, mats)
    build_lifeboat_field(pack, mats)
    build_gate(pack, mats, "karak_veyra_gate", "karak", "infected", "red", True)
    build_contact_lods()
    bake_authored_edge_finishing()

    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    SOURCE_DIR.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH))
    bpy.ops.export_scene.gltf(
        filepath=str(GLB_PATH),
        export_format="GLB",
        export_apply=False,
        export_extras=True,
        export_yup=True,
        export_cameras=False,
        export_lights=False,
    )
    print(f"Exported {len(CONTACT_IDS)} authored showcase contacts to {GLB_PATH}")


if __name__ == "__main__":
    main()
