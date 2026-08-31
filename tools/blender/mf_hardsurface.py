"""Hard-surface modelling toolkit for the MASSFRONT world kits.

WHY THIS EXISTS. The first five kits were built by appending raw vertex and
face arrays and calling from_pydata. That bought determinism -- the contract
verifiers run with bpy stubbed out -- but it meant every "recess" was a dark
box laid ON a wall rather than a hole cut INTO it, and every module shipped as
a dozen loose objects instead of one watertight mesh. That is the reason the
surfaces read as applied decals instead of carved concrete.

This module replaces that with the actual hard-surface workflow, expressed
through bmesh rather than bpy.ops:

    mass  ->  select faces  ->  INSET to make a border ring
          ->  INSET again with negative depth to sink the panel
          ->  EXTRUDE selected faces out for raised plates
          ->  BEVEL by angle for real edge highlights
          ->  one mesh, many material slots

bmesh is deliberate. bpy.ops needs an active object, a selection state and a
valid context; it is slow, order-dependent and cannot run headless in a loop
over 250 modules without fighting it. bmesh.ops does the same operations as
pure data, so the result is reproducible byte for byte and the geometry can
still be inspected without launching Blender.

LODs come from DECIMATE on the finished LOD0 rather than three hand-authored
tiers, so a detail added to LOD0 automatically survives -- correctly simplified
-- into LOD1 and LOD2.
"""

import bmesh
import bpy
import json
import math
from mathutils import Vector, Matrix


# ---------------------------------------------------------------------------
# selection predicates
# ---------------------------------------------------------------------------
def facing(axis, sign=1.0, tol=0.55):
    """Faces whose normal points along an axis. The tolerance is generous so a
    battered wall still counts as a wall."""
    index = {"x": 0, "y": 1, "z": 2}[axis]

    def test(face):
        return face.normal[index] * sign > tol
    return test


def upward(tol=0.6):
    return facing("z", 1.0, tol)


def downward(tol=0.6):
    return facing("z", -1.0, tol)


def vertical(tol=0.35):
    """Wall faces: normal is mostly horizontal."""
    def test(face):
        return abs(face.normal.z) < tol
    return test


def between(z0, z1):
    def test(face):
        return z0 <= face.calc_center_median().z <= z1
    return test


def larger_than(area):
    def test(face):
        return face.calc_area() >= area
    return test


def all_of(*tests):
    def test(face):
        return all(t(face) for t in tests)
    return test


def any_of(*tests):
    def test(face):
        return any(t(face) for t in tests)
    return test


def outward_of(cx, cy, min_dist=0.0):
    """Faces on the outside of a mass, so an inset does not eat the core."""
    def test(face):
        c = face.calc_center_median()
        return math.hypot(c.x - cx, c.y - cy) >= min_dist
    return test


# ---------------------------------------------------------------------------
# the builder
# ---------------------------------------------------------------------------
class HardSurface:
    """One watertight mesh per module, built with real modelling operations.

    Materials are slots on that single mesh, addressed by name. Every operation
    returns the faces it produced so they can be fed straight into the next
    one, which is exactly how you work by hand.
    """

    def __init__(self, material_names):
        self.bm = bmesh.new()
        self.slots = list(material_names)
        self.index = {name: i for i, name in enumerate(self.slots)}

    # -- material ----------------------------------------------------------
    def slot(self, name):
        if name not in self.index:
            raise KeyError("material slot not declared: " + str(name))
        return self.index[name]

    def paint(self, faces, material):
        i = self.slot(material)
        for f in faces:
            f.material_index = i
        return faces

    # -- primitives --------------------------------------------------------
    def box(self, center, size, material):
        """A cuboid. bmesh.ops.create_cube then scale, so the result is a
        proper closed manifold rather than eight loose corners."""
        result = bmesh.ops.create_cube(self.bm, size=1.0)
        faces = [g for g in result["verts"][0].link_faces] if result["verts"] else []
        verts = result["verts"]
        bmesh.ops.scale(self.bm, vec=Vector(size), verts=verts)
        bmesh.ops.translate(self.bm, vec=Vector(center), verts=verts)
        faces = set()
        for v in verts:
            faces.update(v.link_faces)
        return self.paint(list(faces), material)

    def prism(self, profile, z0, z1, material):
        """Extrude a closed XY polygon between two heights."""
        verts = [self.bm.verts.new((x, y, z0)) for (x, y) in profile]
        self.bm.verts.ensure_lookup_table()
        base = self.bm.faces.new(verts)
        out = bmesh.ops.extrude_face_region(self.bm, geom=[base])
        moved = [g for g in out["geom"] if isinstance(g, bmesh.types.BMVert)]
        bmesh.ops.translate(self.bm, vec=Vector((0.0, 0.0, z1 - z0)), verts=moved)
        base.normal_flip()
        faces = {base}
        for g in out["geom"]:
            if isinstance(g, bmesh.types.BMFace):
                faces.add(g)
        return self.paint(list(faces), material)

    def loft(self, lower, upper, z0, z1, material):
        """Bridge two same-length XY rings at two heights -- battered masses,
        tapered pylons, cornice flares."""
        if len(lower) != len(upper) or len(lower) < 3:
            return []
        lo = [self.bm.verts.new((x, y, z0)) for (x, y) in lower]
        hi = [self.bm.verts.new((x, y, z1)) for (x, y) in upper]
        self.bm.verts.ensure_lookup_table()
        faces = []
        n = len(lo)
        for i in range(n):
            j = (i + 1) % n
            try:
                faces.append(self.bm.faces.new((lo[i], lo[j], hi[j], hi[i])))
            except ValueError:
                pass
        try:
            faces.append(self.bm.faces.new(list(reversed(lo))))
        except ValueError:
            pass
        try:
            faces.append(self.bm.faces.new(hi))
        except ValueError:
            pass
        bmesh.ops.recalc_face_normals(self.bm, faces=faces)
        return self.paint(faces, material)

    def chain(self, waypoints, material):
        """Bridge a sequence of same-length XY rings into ONE continuous shell,
        capping only the two ends.

        This exists because stacking separate overlapping solids in a single
        bmesh does not union them -- it leaves interior faces and coincident
        verts that `remove_doubles` then collapses, and the module renders
        empty. A stepped mass has to be one surface: wall, terrace annulus,
        wall, terrace annulus, cap.

        waypoints: [(profile, z), ...] from bottom to top. Repeat a z with a
        smaller profile to make a setback; repeat a profile at a new z to make
        a wall.
        """
        if len(waypoints) < 2:
            return []
        rings = []
        for profile, z in waypoints:
            rings.append([self.bm.verts.new((x, y, z)) for (x, y) in profile])
        self.bm.verts.ensure_lookup_table()
        faces = []
        n = len(rings[0])
        for k in range(len(rings) - 1):
            lo, hi = rings[k], rings[k + 1]
            if len(lo) != n or len(hi) != n:
                continue
            for i in range(n):
                j = (i + 1) % n
                try:
                    faces.append(self.bm.faces.new((lo[i], lo[j], hi[j], hi[i])))
                except ValueError:
                    pass
        try:
            faces.append(self.bm.faces.new(list(reversed(rings[0]))))
        except ValueError:
            pass
        try:
            faces.append(self.bm.faces.new(rings[-1]))
        except ValueError:
            pass
        bmesh.ops.recalc_face_normals(self.bm, faces=faces)
        return self.paint(faces, material)

    def revolve(self, profile, cx=0.0, cy=0.0, segments=24, material="wall"):
        """A real lathe: bmesh.ops.spin on a profile, instead of hand-stacking
        rings. `profile` is a list of (radius, z)."""
        verts = [self.bm.verts.new((cx + r, cy, z)) for (r, z) in profile]
        self.bm.verts.ensure_lookup_table()
        edges = []
        for i in range(len(verts) - 1):
            edges.append(self.bm.edges.new((verts[i], verts[i + 1])))
        out = bmesh.ops.spin(
            self.bm, geom=edges + verts, cent=Vector((cx, cy, 0.0)),
            axis=Vector((0.0, 0.0, 1.0)), dvec=Vector((0.0, 0.0, 0.0)),
            angle=math.tau, steps=segments, use_merge=True, use_duplicate=False)
        faces = [g for g in out["geom_last"] if isinstance(g, bmesh.types.BMFace)]
        touched = set(faces)
        for v in verts:
            touched.update(v.link_faces)
        bmesh.ops.recalc_face_normals(self.bm, faces=list(touched))
        return self.paint(list(touched), material)

    # -- the hard-surface operations ---------------------------------------
    def select(self, test, pool=None):
        pool = self.bm.faces if pool is None else pool
        return [f for f in pool if f.is_valid and test(f)]

    def bisect_z(self, levels):
        """Horizontal loop cuts.

        Without these, band selection silently does nothing: `between()` tests a
        face's CENTRE, and a wall face spanning 0-56 m has its centre at 28 m,
        so it matches no band at all. Cutting the loops first is what makes a
        facade addressable -- exactly the loop-cut pass you would do by hand
        before insetting anything.
        """
        for z in levels:
            geom = list(self.bm.verts) + list(self.bm.edges) + list(self.bm.faces)
            bmesh.ops.bisect_plane(
                self.bm, geom=geom, dist=0.0001,
                plane_co=Vector((0.0, 0.0, z)), plane_no=Vector((0.0, 0.0, 1.0)),
                use_snap_center=False, clear_outer=False, clear_inner=False)
        self.bm.faces.ensure_lookup_table()

    def bisect_axis(self, axis, levels):
        """Vertical loop cuts across X or Y, for splitting a long facade into
        bays that can be panelled independently."""
        normal = Vector((1.0, 0.0, 0.0)) if axis == "x" else Vector((0.0, 1.0, 0.0))
        for t in levels:
            co = Vector((t, 0.0, 0.0)) if axis == "x" else Vector((0.0, t, 0.0))
            geom = list(self.bm.verts) + list(self.bm.edges) + list(self.bm.faces)
            bmesh.ops.bisect_plane(
                self.bm, geom=geom, dist=0.0001, plane_co=co, plane_no=normal,
                use_snap_center=False, clear_outer=False, clear_inner=False)
        self.bm.faces.ensure_lookup_table()

    def inset(self, faces, thickness, depth=0.0, material=None, even=True):
        """The core move. A positive thickness makes a border ring; a negative
        depth sinks the inner face, which is how a real recess is cut."""
        faces = [f for f in faces if f.is_valid]
        if not faces:
            return []
        out = bmesh.ops.inset_region(
            self.bm, faces=faces, thickness=thickness, depth=depth,
            use_even_offset=even, use_interpolate=True, use_boundary=True)
        inner = [f for f in faces if f.is_valid]
        if material:
            self.paint(inner, material)
        return inner

    def panel(self, faces, border, depth, material=None, rim=None):
        """A carved panel: border ring, then the field pushed in by `depth`.

        This is the operation the old array-appending pipeline could not do at
        all, and the single biggest reason its surfaces looked printed on.
        """
        ring_before = set(f for f in self.bm.faces if f.is_valid)
        inner = self.inset(faces, border, 0.0)
        if rim:
            ring = [f for f in self.bm.faces
                    if f.is_valid and f not in ring_before and f not in inner]
            self.paint(ring, rim)
        return self.inset(inner, 0.0, -abs(depth), material)

    def extrude(self, faces, distance, material=None):
        """Push faces along their own normals -- raised plates and greebles."""
        faces = [f for f in faces if f.is_valid]
        if not faces:
            return []
        out = bmesh.ops.extrude_face_region(self.bm, geom=faces)
        new_faces = [g for g in out["geom"] if isinstance(g, bmesh.types.BMFace)]
        verts = [g for g in out["geom"] if isinstance(g, bmesh.types.BMVert)]
        if new_faces:
            n = new_faces[0].normal.copy()
            bmesh.ops.translate(self.bm, vec=n * distance, verts=verts)
        bmesh.ops.delete(self.bm, geom=faces, context="FACES")
        if material:
            self.paint(new_faces, material)
        return new_faces

    def solidify(self, faces, thickness, material=None):
        faces = [f for f in faces if f.is_valid]
        if not faces:
            return []
        out = bmesh.ops.solidify(self.bm, geom=faces, thickness=thickness)
        made = [g for g in out["geom"] if isinstance(g, bmesh.types.BMFace)]
        if material:
            self.paint(made, material)
        return made

    def bevel_by_angle(self, width, segments=2, angle_deg=35.0, faces=None):
        """Bevel only edges sharper than `angle_deg`, the way you would with a
        weighted bevel by hand -- not every edge in the mesh."""
        limit = math.radians(angle_deg)
        pool = self.bm.edges if faces is None else {e for f in faces for e in f.edges}
        edges = []
        for e in pool:
            if not e.is_valid or len(e.link_faces) != 2:
                continue
            try:
                if e.calc_face_angle() >= limit:
                    edges.append(e)
            except ValueError:
                continue
        if not edges:
            return
        bmesh.ops.bevel(self.bm, geom=edges, offset=width, offset_type="OFFSET",
                        segments=segments, profile=0.5, affect="EDGES",
                        clamp_overlap=True, loop_slide=True)

    def cleanup(self, merge=0.0008):
        bmesh.ops.remove_doubles(self.bm, verts=list(self.bm.verts), dist=merge)
        bmesh.ops.recalc_face_normals(self.bm, faces=list(self.bm.faces))

    # -- output ------------------------------------------------------------
    def triangles(self):
        return sum(max(0, len(f.verts) - 2) for f in self.bm.faces)

    def to_object(self, name, collection, materials, parent=None, schema=None):
        """Emit ONE object with material slots -- how a real hard-surface asset
        ships, instead of a dozen role-split meshes."""
        self.cleanup()
        mesh = bpy.data.meshes.new(name + "_MESH")
        if schema:
            mesh["mf_schema"] = schema
        for slot_name in self.slots:
            mesh.materials.append(materials[slot_name])
        self.bm.to_mesh(mesh)
        mesh.update()
        obj = bpy.data.objects.new(name, mesh)
        collection.objects.link(obj)
        if parent is not None:
            obj.parent = parent
        if schema:
            obj["mf_schema"] = schema
        return obj

    def free(self):
        self.bm.free()


# ---------------------------------------------------------------------------
# LOD by decimation
# ---------------------------------------------------------------------------
def clear_shading(obj, uvs=True):
    """Strip everything that blocks edge collapse: normals, sharp marks, UVs.

    Decimate protects custom split normals AND uv-island boundaries. A
    world-space box projection puts a UV discontinuity at every change of
    projection axis, which on a kit of boxes and chamfers is most of the mesh
    -- so a ratio of 0.02 came back at 53%.

    Dropping the UVs before decimating is safe precisely because the
    projection is deterministic and world-space: re-running it on the
    decimated mesh reproduces the same mapping at the same texel density,
    which a packed island layout could never do.
    """
    me = obj.data
    if uvs:
        while me.uv_layers:
            me.uv_layers.remove(me.uv_layers[0])
    for name in ("custom_normal", "sharp_edge", "sharp_face"):
        attr = me.attributes.get(name)
        if attr is not None:
            try:
                me.attributes.remove(attr)
            except Exception:
                pass
    for p in me.polygons:
        p.use_smooth = False
    me.update()
    return obj


def _tris(mesh):
    return sum(max(0, len(p.vertices) - 2) for p in mesh.polygons)


def decimated_copy(source, name, ratio, collection, parent=None, schema=None,
                   shade=35.0, uv=4.0, planar_angle=None):
    """Derive an LOD from a finished mesh.

    Hand-authoring three tiers meant every new detail had to be added three
    times and could drift between them. Decimating the real LOD0 keeps them
    honest by construction.
    """
    mesh = source.data.copy()
    mesh.name = name + "_MESH"
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    if parent is not None:
        obj.parent = parent
    if schema:
        obj["mf_schema"] = schema
        mesh["mf_schema"] = schema
    clear_shading(obj)
    repair_mesh(obj, split_tjunctions=False, fill_holes=True)
    target = max(12, int(_tris(source.data) * ratio))

    if planar_angle is None:
        # the lower the tier, the more flat detail is worth dissolving away
        planar_angle = 2.0 + (1.0 - min(1.0, ratio)) * 12.0
    if planar_angle > 0.0:
        mod = obj.modifiers.new("MF_PLANAR", "DECIMATE")
        mod.decimate_type = "DISSOLVE"
        mod.angle_limit = math.radians(planar_angle)
        mod.use_dissolve_boundaries = True
        bpy.context.view_layer.update()
        try:
            _bake_modifiers(obj)
        except Exception:
            obj.modifiers.clear()

    # aim at an ABSOLUTE triangle count, and re-aim if the solver undershoots
    for _ in range(3):
        current = _tris(obj.data)
        if current <= target:
            break
        mod = obj.modifiers.new("MF_DECIMATE", "DECIMATE")
        mod.decimate_type = "COLLAPSE"
        mod.ratio = max(0.005, float(target) / float(current))
        mod.use_collapse_triangulate = True
        bpy.context.view_layer.update()
        try:
            _bake_modifiers(obj)
        except Exception:
            obj.modifiers.clear()
            break
    obj.data.name = name + "_MESH"
    if schema:
        obj.data["mf_schema"] = schema
    if uv:
        uv_box_project(obj, metres_per_tile=uv)
    if shade:
        # sharp edges are recomputed on this tier's own topology: an edge that
        # was a chamfer on LOD0 may not exist at all down here
        shade_hard_surface(obj, sharp_angle=shade)
    return obj


def octagon(cx, cy, hx, hy, chamfer):
    c = max(0.0, min(chamfer, min(hx, hy) * 0.55))
    if c <= 0.02:
        return [(cx - hx, cy - hy), (cx + hx, cy - hy), (cx + hx, cy + hy), (cx - hx, cy + hy)]
    return [(cx - hx + c, cy - hy), (cx + hx - c, cy - hy),
            (cx + hx, cy - hy + c), (cx + hx, cy + hy - c),
            (cx + hx - c, cy + hy), (cx - hx + c, cy + hy),
            (cx - hx, cy + hy - c), (cx - hx, cy - hy + c)]


# ---------------------------------------------------------------------------
# Boolean operations, mesh cleanup and polygon merging
#
# Everything above writes primitives into ONE bmesh and calls remove_doubles,
# which welds coincident vertices but does not resolve intersections. A module
# therefore ends up as several closed shells that pass through each other, and
# every shell keeps its own surface inside its neighbour -- a ramp driven into
# a deck keeps the end cap that is now buried in the deck. That buried cap is
# what reads as an exposed end when the two shells do not quite line up.
#
# These are the tools that fix it properly: a real boolean union to fuse the
# shells, a cleanup pass for the degenerate geometry a solver leaves behind,
# and a coplanar merge that pays for the whole thing in polygons.
# ---------------------------------------------------------------------------

def _bbox(mesh):
    lo = [1e18] * 3
    hi = [-1e18] * 3
    for v in mesh.vertices:
        for i in range(3):
            lo[i] = min(lo[i], v.co[i])
            hi[i] = max(hi[i], v.co[i])
    return lo, hi


def _bbox_drift(a, b):
    """Largest disagreement between two bounding boxes, in metres."""
    (alo, ahi), (blo, bhi) = a, b
    return max(max(abs(alo[i] - blo[i]), abs(ahi[i] - bhi[i])) for i in range(3))


def _shell_face_groups(mesh):
    """Face indices grouped by connected shell. Islands, not material groups."""
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bm.faces.ensure_lookup_table()
    seen = set()
    groups = []
    for f in bm.faces:
        if f.index in seen:
            continue
        grp = []
        stack = [f]
        seen.add(f.index)
        while stack:
            cur = stack.pop()
            grp.append(cur.index)
            for e in cur.edges:
                for lf in e.link_faces:
                    if lf.index not in seen:
                        seen.add(lf.index)
                        stack.append(lf)
        groups.append(grp)
    bm.free()
    return groups


def count_shells(mesh):
    return len(_shell_face_groups(mesh))


def mesh_stats(obj):
    """Everything worth asserting about a finished module mesh."""
    me = obj.data
    bm = bmesh.new()
    bm.from_mesh(me)
    tris = sum(max(0, len(f.verts) - 2) for f in bm.faces)
    ngons = sum(1 for f in bm.faces if len(f.verts) > 4)
    quads = sum(1 for f in bm.faces if len(f.verts) == 4)
    non_manifold = sum(1 for e in bm.edges if len(e.link_faces) != 2)
    boundary = sum(1 for e in bm.edges if len(e.link_faces) == 1)
    interior = sum(1 for f in bm.faces
                   if f.edges and all(len(e.link_faces) > 2 for e in f.edges))
    bm.free()
    return {"verts": len(me.vertices), "polys": len(me.polygons), "tris": tris,
            "quads": quads, "ngons": ngons, "shells": count_shells(me),
            "nonManifoldEdges": non_manifold, "boundaryEdges": boundary,
            "interiorFaces": interior}


def _sub_mesh(source, face_indices, name):
    """A new mesh holding only these faces, material slots and indices intact."""
    bm = bmesh.new()
    bm.from_mesh(source)
    bm.faces.ensure_lookup_table()
    keep = set(face_indices)
    drop = [f for f in bm.faces if f.index not in keep]
    if drop:
        bmesh.ops.delete(bm, geom=drop, context="FACES")
    stray = [v for v in bm.verts if not v.link_faces]
    if stray:
        bmesh.ops.delete(bm, geom=stray, context="VERTS")
    me = bpy.data.meshes.new(name)
    for mat in source.materials:
        me.materials.append(mat)
    bm.to_mesh(me)
    bm.free()
    me.update()
    return me


def _bake_modifiers(obj):
    """Apply the modifier stack without bpy.ops -- no selection, no context."""
    depsgraph = bpy.context.evaluated_depsgraph_get()
    evaluated = obj.evaluated_get(depsgraph)
    baked = bpy.data.meshes.new_from_object(evaluated)
    obj.modifiers.clear()
    old = obj.data
    name = old.name
    obj.data = baked
    baked.name = name
    bpy.data.meshes.remove(old)
    return baked


def _set_solver(mod, preferred):
    """Pick the best solver this Blender actually offers.

    MANIFOLD arrived in 5.x and is the right choice for closed hard-surface
    shells -- measured on this kit it produces fewer polygons, fuses more
    shells and leaves two orders of magnitude fewer T-junctions than EXACT.
    """
    try:
        options = [i.identifier for i in mod.bl_rna.properties["solver"].enum_items]
    except Exception:
        options = ["EXACT"]
    for name in (preferred, "MANIFOLD", "EXACT"):
        if name in options:
            mod.solver = name
            return name
    return mod.solver


def boolean_op(obj, cutter, operation="DIFFERENCE", solver="MANIFOLD",
               consume=True, self_intersect=True):
    """obj <operation> cutter, applied in place.

    This is the carving tool the kit did not have: a doorway, a service duct or
    a notch through a mass is a subtraction, and faking one by butting boxes
    together is what leaves visible seams.
    """
    mod = obj.modifiers.new("MF_BOOL", "BOOLEAN")
    mod.operation = operation
    mod.object = cutter
    _set_solver(mod, solver)
    if hasattr(mod, "use_self"):
        mod.use_self = self_intersect
    if hasattr(mod, "use_hole_tolerant"):
        mod.use_hole_tolerant = True
    bpy.context.view_layer.update()
    _bake_modifiers(obj)
    if consume:
        me = cutter.data
        bpy.data.objects.remove(cutter, do_unlink=True)
        if me.users == 0:
            bpy.data.meshes.remove(me)
    return obj


def is_manifold(mesh):
    """Watertight and edge-manifold: every edge shared by exactly two faces."""
    bm = bmesh.new()
    bm.from_mesh(mesh)
    ok = all(len(e.link_faces) == 2 for e in bm.edges) and len(bm.faces) > 0
    bm.free()
    return ok


def repair_mesh(obj, split_tjunctions=True, fill_holes=True, recalc=True):
    """Make the shells manifold again so a solver can work on them.

    Splitting the T-junctions is the important half. cleanup()'s global
    remove_doubles fuses any two shells that happen to share a vertex position
    into an edge carrying four faces; that is not a union, it is a defect, and
    it is what makes the MANIFOLD solver refuse the mesh. Splitting those edges
    hands the shells back as separate solids, and the union then fuses them
    properly.
    """
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    report = {"tjunctionsSplit": 0, "holesFilled": 0}

    if split_tjunctions:
        bad = [e for e in bm.edges if len(e.link_faces) > 2]
        if bad:
            report["tjunctionsSplit"] = len(bad)
            bmesh.ops.split_edges(bm, edges=bad)

    if fill_holes:
        open_edges = [e for e in bm.edges if len(e.link_faces) == 1]
        if open_edges:
            try:
                res = bmesh.ops.holes_fill(bm, edges=open_edges, sides=0)
                report["holesFilled"] = len(res.get("faces", []))
            except Exception:
                pass

    if recalc:
        bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(obj.data)
    obj.data.update()
    bm.free()
    return report


def weld_parts(obj, solver="MANIFOLD", drift_tolerance=0.4, repair=True,
               max_operands=24):
    """Boolean-UNION a mesh's disconnected shells into one surface.

    The union is what actually removes a buried end cap; nothing else can,
    because the cap is a legitimate face of a legitimate closed solid right up
    until the two solids become one.

    Solvers are tried in order. MANIFOLD is first because on this kit it
    produces fewer polygons and two orders of magnitude fewer T-junctions, but
    it shatters some modules outright; EXACT is slower and leaves more mess but
    copes with geometry MANIFOLD refuses. Every result is checked three ways --
    non-empty, hull did not move, shell count did not RISE -- because a boolean
    fails by handing back plausible-looking rubbish, not by raising.
    """
    out = {"polysBefore": len(obj.data.polygons), "welded": False,
           "rolledBack": False, "reason": "", "solver": "", "strategy": ""}
    # The backup and the shell count are both taken BEFORE repair. Splitting
    # T-junctions is how interpenetrating solids that remove_doubles fused into
    # one connected component get handed back to the solver as separate solids
    # -- but if the union then fails to re-fuse them, the mesh ends up in more
    # pieces than it started with. Measuring against the post-repair count hid
    # exactly that: the building kit went from 36 shells to 166 and passed.
    before_bb = _bbox(obj.data)
    backup = obj.data.copy()
    origin_shells = count_shells(obj.data)
    out["shellsOriginal"] = origin_shells

    def _accept(label):
        """Validate in place: non-empty, hull unmoved, pieces not multiplied."""
        if not len(obj.data.polygons):
            return False, "empty result"
        if _bbox_drift(before_bb, _bbox(obj.data)) > drift_tolerance:
            return False, "hull moved"
        if count_shells(obj.data) > origin_shells:
            return False, "fragmented"
        return True, ""

    def _restore():
        old = obj.data
        name = old.name
        obj.data = backup
        backup.name = name
        if old is not backup:
            bpy.data.meshes.remove(old)

    # A mesh that is already ONE connected component has nothing to union
    # ACROSS -- but it can still contain interpenetrating solids, because
    # cleanup()'s global remove_doubles fuses shells wherever they happen to
    # share a vertex. Splitting that apart to feed a normal union produces
    # dozens of open fragments the solver refuses. Intersect it with itself.
    if count_shells(obj.data) < 2:
        out["strategy"] = "self"
        res = self_union(obj)
        out["selfUnion"] = res
        ok, why = _accept("self") if res.get("ran") else (False, res.get("reason", "n/a"))
        if ok:
            out["welded"] = True
            out["solver"] = "SELF"
            if backup.users == 0:
                bpy.data.meshes.remove(backup)
        else:
            _restore()
            out["rolledBack"] = True
            out["reason"] = why
        out["shellsBefore"] = origin_shells
        out["polysAfter"] = len(obj.data.polygons)
        out["shellsAfter"] = count_shells(obj.data)
        return out

    out["strategy"] = "split"
    if repair:
        out["repair"] = repair_mesh(obj)
    groups = _shell_face_groups(obj.data)
    out["shellsBefore"] = len(groups)
    if len(groups) > max_operands:
        # dozens of operands is where the solver gets fragile and slow, and
        # where it crashed Blender outright during the audit
        out["strategy"] = "self (too many operands)"
        _restore()
        res = self_union(obj)
        out["selfUnion"] = res
        ok, why = _accept("self") if res.get("ran") else (False, res.get("reason", "n/a"))
        if ok:
            out["welded"] = True
            out["solver"] = "SELF"
            if backup.users == 0:
                bpy.data.meshes.remove(backup)
        else:
            _restore()
            out["rolledBack"] = True
            out["reason"] = why or "too many operands"
        out["polysAfter"] = len(obj.data.polygons)
        out["shellsAfter"] = count_shells(obj.data)
        return out
    if len(groups) < 2:
        if backup.users == 0:
            bpy.data.meshes.remove(backup)
        out["polysAfter"] = out["polysBefore"]
        out["shellsAfter"] = len(groups)
        return out
    groups.sort(key=len, reverse=True)

    # matrix_world is stale until the depsgraph catches up, and an object that
    # was parented moments ago still reports identity. Copying that onto the
    # operands puts them 900 m from the target, the solver finds no
    # intersections, and the union silently returns the base shell alone.
    bpy.context.view_layer.update()

    scene_coll = bpy.context.scene.collection
    tmp = bpy.data.collections.new("MF_BOOL_OPERANDS")
    scene_coll.children.link(tmp)
    operands = []
    for i, grp in enumerate(groups[1:]):
        me = _sub_mesh(obj.data, grp, "MF_BOOL_OPERAND_%d" % i)
        o = bpy.data.objects.new(me.name, me)
        tmp.objects.link(o)
        o.matrix_world = obj.matrix_world.copy()
        operands.append(o)

    base = _sub_mesh(obj.data, groups[0], "MF_BOOL_BASE")
    target_name = obj.data.name
    clean_operands = all(is_manifold(o.data) for o in operands) and is_manifold(base)

    order = ["MANIFOLD", "EXACT"] if solver == "MANIFOLD" else [solver]
    if not clean_operands and "EXACT" in order:
        order = ["EXACT"] + [x for x in order if x != "EXACT"]

    ok = False
    for want in order:
        old = obj.data
        obj.data = base.copy()
        obj.data.name = target_name
        if old is not backup and old is not base:
            bpy.data.meshes.remove(old)
        obj.modifiers.clear()
        mod = obj.modifiers.new("MF_UNION", "BOOLEAN")
        mod.operation = "UNION"
        used = _set_solver(mod, want)
        mod.operand_type = "COLLECTION"
        mod.collection = tmp
        if hasattr(mod, "use_self"):
            mod.use_self = True
        if hasattr(mod, "use_hole_tolerant"):
            mod.use_hole_tolerant = True
        bpy.context.view_layer.update()
        try:
            _bake_modifiers(obj)
            ok = len(obj.data.polygons) > 0
            if not ok:
                out["reason"] = "empty result"
            if ok and _bbox_drift(before_bb, _bbox(obj.data)) > drift_tolerance:
                ok, out["reason"] = False, "hull moved"
            # a union can only ever REDUCE the shell count. A rise means the
            # solver shattered the mesh, which the bounding box cannot see
            # because the fragments still fill the same box.
            # a union may only ever REDUCE the piece count, measured against
            # what came in -- not against what repair broke it into
            if ok and count_shells(obj.data) > origin_shells:
                ok, out["reason"] = False, "fragmented"
        except Exception as exc:
            ok, out["reason"] = False, str(exc)[:80]
        if ok:
            out["welded"] = True
            out["solver"] = used
            out["reason"] = ""
            break

    if not ok:
        old = obj.data
        obj.data = backup
        backup.name = target_name
        if old is not base:
            bpy.data.meshes.remove(old)
        out["rolledBack"] = True

    obj.modifiers.clear()
    for o in operands:
        me = o.data
        bpy.data.objects.remove(o, do_unlink=True)
        if me.users == 0:
            bpy.data.meshes.remove(me)
    scene_coll.children.unlink(tmp)
    bpy.data.collections.remove(tmp)
    if base.users == 0:
        bpy.data.meshes.remove(base)
    if out["welded"] and backup.users == 0:
        bpy.data.meshes.remove(backup)

    out["polysAfter"] = len(obj.data.polygons)
    out["shellsAfter"] = count_shells(obj.data)
    return out


def strip_interior(obj):
    """Delete faces buried inside the solid.

    A face every one of whose edges is shared by more than two faces cannot be
    seen from outside. This is the safety net for whatever the solver leaves;
    on a properly unioned mesh it finds nothing.
    """
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.faces.ensure_lookup_table()
    buried = [f for f in bm.faces
              if f.edges and all(len(e.link_faces) > 2 for e in f.edges)]
    n = len(buried)
    if buried:
        bmesh.ops.delete(bm, geom=buried, context="FACES")
        bm.to_mesh(obj.data)
        obj.data.update()
    bm.free()
    return n


def clean_mesh(obj, merge_dist=0.0006, min_area=1.0e-6, recalc=True):
    """Degenerate geometry removal: doubles, slivers, duplicate faces, strays.

    Booleans and bevels both leave zero-area faces and stacked verts. They cost
    nothing to render but they break decimation, wreck normals, and are what
    turns a later bevel into NaN.
    """
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    before_v, before_f = len(bm.verts), len(bm.faces)

    bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=merge_dist)
    bmesh.ops.dissolve_degenerate(bm, dist=merge_dist, edges=list(bm.edges))

    slivers = [f for f in bm.faces if f.calc_area() < min_area]
    if slivers:
        bmesh.ops.delete(bm, geom=slivers, context="FACES")

    # Two faces on the same vertices are only a DUPLICATE when they face the
    # same way. An opposing pair is a zero-thickness sandwich -- possibly real
    # two-sided geometry, and the union/hidden passes are better placed to
    # judge it -- so it is left alone rather than silently half-deleted.
    bm.verts.index_update()
    seen = {}
    dupes = []
    for f in bm.faces:
        key = tuple(sorted(v.index for v in f.verts))
        prev = seen.get(key)
        if prev is None:
            seen[key] = f
        elif prev.normal.dot(f.normal) > 0.0:
            dupes.append(f)
    if dupes:
        bmesh.ops.delete(bm, geom=dupes, context="FACES")

    loose_e = [e for e in bm.edges if not e.link_faces]
    if loose_e:
        bmesh.ops.delete(bm, geom=loose_e, context="EDGES")
    loose_v = [v for v in bm.verts if not v.link_faces and not v.link_edges]
    if loose_v:
        bmesh.ops.delete(bm, geom=loose_v, context="VERTS")

    if recalc:
        bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))

    bm.to_mesh(obj.data)
    obj.data.update()
    report = {"vertsRemoved": before_v - len(bm.verts),
              "facesRemoved": before_f - len(bm.faces),
              "slivers": len(slivers), "duplicateFaces": len(dupes)}
    bm.free()
    return report


def merge_coplanar(obj, angle_deg=1.5, keep_material_borders=True):
    """Fold coplanar neighbours into one polygon (limited dissolve).

    This is where the polygon saving is. Loop cuts leave a flat wall carved
    into dozens of quads that carry no shape at all; merging them back costs
    nothing visually. Material borders are preserved by default, otherwise the
    eight slots bleed into each other.
    """
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    before = len(bm.faces)
    delimit = {"MATERIAL"} if keep_material_borders else set()
    try:
        bmesh.ops.dissolve_limit(bm, angle_limit=math.radians(angle_deg),
                                 use_dissolve_boundaries=False,
                                 verts=list(bm.verts), edges=list(bm.edges),
                                 delimit=delimit)
    except TypeError:
        bmesh.ops.dissolve_limit(bm, angle_limit=math.radians(angle_deg),
                                 verts=list(bm.verts), edges=list(bm.edges))
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(obj.data)
    obj.data.update()
    after = len(bm.faces)
    bm.free()
    return {"facesBefore": before, "facesAfter": after, "merged": before - after}


def retopo_quads(obj, face_angle=40.0, shape_angle=40.0, triangulate_first=False):
    """Join the triangles a boolean left behind back into quads.

    It does NOT triangulate first. It used to, and that was the whole polygon
    inflation: it shredded the n-gons the coplanar merge had just produced and
    join_triangles could not put them back, taking the gantry frame from 837
    faces to 2211. Only existing triangles are considered now, so the pass can
    only ever reduce the face count. `triangulate_first=True` restores the old
    behaviour for a caller that genuinely needs an all-quad mesh.
    """
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    before = len(bm.faces)
    if triangulate_first:
        bmesh.ops.triangulate(bm, faces=list(bm.faces))
    kwargs = {"angle_face_threshold": math.radians(face_angle),
              "angle_shape_threshold": math.radians(shape_angle)}
    tris = [f for f in bm.faces if len(f.verts) == 3]
    if not tris:
        bm.free()
        return {"facesBefore": before, "facesAfter": before, "quads": 0}
    try:
        bmesh.ops.join_triangles(bm, faces=tris, cmp_seam=False,
                                 cmp_sharp=False, cmp_uvs=False, cmp_vcols=False,
                                 cmp_materials=True, **kwargs)
    except TypeError:
        bmesh.ops.join_triangles(bm, faces=tris, **kwargs)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(obj.data)
    obj.data.update()
    quads = sum(1 for f in bm.faces if len(f.verts) == 4)
    after = len(bm.faces)
    bm.free()
    return {"facesBefore": before, "facesAfter": after, "quads": quads}


def _guarded(obj, fn, label, stats):
    """Run a destructive step, and undo it if it broke the mesh into pieces.

    strip_interior in particular will happily carve a mesh apart: on geometry
    the union could not fuse, "every edge has more than two faces" stops being
    a reliable test for buried, and deleting those faces disconnects the shell.
    Any step that raises the piece count has done more harm than good.
    """
    before = count_shells(obj.data)
    backup = obj.data.copy()
    try:
        result = fn()
        broke = count_shells(obj.data) > before
    except Exception as exc:
        result, broke = None, True
        stats[label + "Error"] = str(exc)[:80]
    if broke:
        old = obj.data
        name = old.name
        obj.data = backup
        backup.name = name
        bpy.data.meshes.remove(old)
        stats[label + "Reverted"] = True
        return None
    if backup.users == 0:
        bpy.data.meshes.remove(backup)
    return result


def finalize(obj, weld=True, interior=True, hidden=True, coplanar=2.0,
             quads=True, merge_dist=0.0006, solver="MANIFOLD",
             drift_tolerance=0.4, uv=4.0, shade=35.0, prune=True):
    """Take a pile of intersecting shells to a finished, shippable asset.

    Geometry first, in an order settled by measurement rather than taste:
      1. union    -- the only step that can delete a cap buried in another shell
      2. clean    -- the solver leaves slivers and stacked verts behind it
      3. coplanar -- where the polygon count actually comes down
      4. interior -- AFTER the merge, because merging faces is what creates the
                     >2-face edges that make a face detectably interior
      5. hidden   -- raycast pass for faces the topological test cannot see
      6. quads    -- join the triangle fans the boolean left
      7. clean    -- the dissolve leaves its own strays

    Then the finishing that turns correct geometry into an asset:
      8. prune    -- drop material slots nothing uses
      9. uv       -- world-space box projection at a fixed texel density
     10. shade    -- smooth + sharp edges + weighted normals

    UVs and shading come last on purpose: both are functions of the final
    topology, and running them before the boolean would just throw the result
    away.

    Every destructive geometry step is guarded on shell count: a mesh may come
    out of this with fewer pieces than it went in with, never more.
    """
    stats = {"before": mesh_stats(obj)}
    if weld:
        stats["weld"] = weld_parts(obj, solver=solver,
                                   drift_tolerance=drift_tolerance)
        stats["clean1"] = _guarded(
            obj, lambda: clean_mesh(obj, merge_dist=merge_dist), "clean1", stats)
        # Boolean output is not watertight -- the arcology came out of the
        # union with 3430 boundary edges, and Collapse decimation preserves
        # boundaries, so a 10% LOD request came back at 49%. Sealing the mesh
        # is what makes the LOD ladder and the collider budget achievable.
        stats["seal"] = _guarded(
            obj, lambda: repair_mesh(obj, split_tjunctions=False,
                                     fill_holes=True), "seal", stats)
    if coplanar:
        stats["coplanar"] = _guarded(
            obj, lambda: merge_coplanar(obj, angle_deg=coplanar),
            "coplanar", stats) or {}
    if interior:
        stats["interiorStripped"] = _guarded(
            obj, lambda: strip_interior(obj), "interior", stats) or 0
    if hidden:
        stats["hiddenStripped"] = _guarded(
            obj, lambda: strip_hidden(obj), "hidden", stats) or 0
    if quads:
        stats["retopo"] = _guarded(obj, lambda: retopo_quads(obj), "retopo", stats)
    stats["clean2"] = _guarded(
        obj, lambda: clean_mesh(obj, merge_dist=merge_dist), "clean2", stats)
    if prune:
        stats["materials"] = prune_materials(obj)
    if uv:
        stats["uv"] = uv_box_project(obj, metres_per_tile=uv)
    if shade:
        stats["shading"] = shade_hard_surface(obj, sharp_angle=shade)
    stats["after"] = mesh_stats(obj)
    return stats


# ---------------------------------------------------------------------------
# Asset finishing: UVs, shading, colliders, material slots
#
# Everything above produces correct geometry. None of it produced a mesh you
# could actually texture or light: no UV layer, every polygon flat-shaded, and
# no collider. These are the steps between "the shape is right" and "the asset
# ships".
# ---------------------------------------------------------------------------

def uv_box_project(obj, metres_per_tile=4.0, layer_name="UVMap"):
    """World-space triplanar-style box unwrap at a fixed texel density.

    Every face is projected along whichever world axis its normal is closest
    to, scaled in metres. That gives three things a seam-authored unwrap would
    not, and which matter far more for a modular kit:

      * consistent texel density across a 32 m wall and a 1.5 m kerb, because
        the scale is metres, not island area;
      * tiling that continues ACROSS module boundaries, because the projection
        is in world space and every module sits on the same grid;
      * determinism -- no island packing, so two builds produce the same UVs.

    The cost is stretching on faces that lean between two axes, which on a
    kit made of boxes and 45-degree chamfers is a handful of faces.
    """
    me = obj.data
    bm = bmesh.new()
    bm.from_mesh(me)
    layer = bm.loops.layers.uv.get(layer_name) or bm.loops.layers.uv.new(layer_name)
    s = 1.0 / max(1e-6, metres_per_tile)
    for f in bm.faces:
        n = f.normal
        if n.length_squared < 1e-12:
            continue
        axis = max(range(3), key=lambda i: abs(n[i]))
        flip = n[axis] < 0.0
        for loop in f.loops:
            co = loop.vert.co
            if axis == 0:
                u, v = co.y, co.z
            elif axis == 1:
                u, v = co.x, co.z
            else:
                u, v = co.x, co.y
            # mirror the negative-facing side so the texture is not reversed
            if flip:
                u = -u
            loop[layer].uv = (u * s, v * s)
    bm.to_mesh(me)
    me.update()
    bm.free()
    return {"layer": layer_name, "metresPerTile": metres_per_tile}


def shade_hard_surface(obj, sharp_angle=35.0, weighted_normals=True):
    """Smooth shading with sharp edges, then weighted normals.

    Flat shading makes every bevel pointless: the chamfer costs triangles and
    renders as another facet. Smooth shading with edges above `sharp_angle`
    marked sharp is what turns a two-segment bevel into the highlight it exists
    for, and the weighted-normal pass stops small chamfer faces dragging the
    normals of the large faces they sit between.
    """
    me = obj.data
    bm = bmesh.new()
    bm.from_mesh(me)
    limit = math.radians(sharp_angle)
    sharp = 0
    for e in bm.edges:
        if len(e.link_faces) == 2:
            try:
                hard = e.calc_face_angle(0.0) >= limit
            except ValueError:
                hard = True
        else:
            hard = True
        e.smooth = not hard
        if hard:
            sharp += 1
    for f in bm.faces:
        f.smooth = True
    bm.to_mesh(me)
    me.update()
    bm.free()

    if weighted_normals:
        mod = obj.modifiers.new("MF_WEIGHTED_NORMAL", "WEIGHTED_NORMAL")
        mod.keep_sharp = True
        mod.mode = "FACE_AREA"
        bpy.context.view_layer.update()
        try:
            _bake_modifiers(obj)
        except Exception:
            obj.modifiers.clear()
    return {"sharpEdges": sharp, "weightedNormals": bool(weighted_normals)}


def prune_materials(obj, record_names=True):
    """Drop material slots no face uses, remapping the indices that remain.

    The slot list is the kit's vocabulary, so the surviving names are written
    to `mf_materials` -- a consumer that wants "the armour slot" can still find
    it by name once the numbering has changed.
    """
    me = obj.data
    if not me.materials:
        return {"removed": 0}
    used = sorted({p.material_index for p in me.polygons})
    if len(used) >= len(me.materials):
        if record_names:
            obj["mf_materials"] = json.dumps([m.name if m else "" for m in me.materials],
                                             separators=(",", ":"))
        return {"removed": 0}
    keep = [me.materials[i] for i in used if i < len(me.materials)]
    remap = {old: new for new, old in enumerate(used)}
    for p in me.polygons:
        p.material_index = remap.get(p.material_index, 0)
    removed = len(me.materials) - len(keep)
    me.materials.clear()
    for m in keep:
        me.materials.append(m)
    if record_names:
        obj["mf_materials"] = json.dumps([m.name if m else "" for m in keep],
                                         separators=(",", ":"))
    return {"removed": removed}


def collision_mesh(source, name, collection, tri_budget=400, parent=None,
                   schema=None, voxel_m=2.2):
    """A coarse blocker derived from the finished mesh.

    Deliberately NOT a convex hull: a gantry frame or a bridge deck is
    something units drive under, and a hull would seal it. This keeps the real
    silhouette and spends a fixed triangle budget on it, which is what a
    physics broadphase actually wants. Walkable surfaces are a separate
    question and come from the NAV proxies.
    """
    me = source.data.copy()
    me.name = name + "_MESH"
    obj = bpy.data.objects.new(name, me)
    collection.objects.link(obj)
    if parent is not None:
        obj.parent = parent
    obj.matrix_world = source.matrix_world.copy()
    clear_shading(obj)

    # Voxel remesh rather than decimation. Collapse decimation stalled at
    # 5367 triangles against a budget of 400 on the arcology, because it has
    # to preserve a surface a collider does not care about. A remesh is closed
    # and cheap by construction; `voxel_m` is kept large enough that a gap a
    # unit could drive through -- a gantry bay, a bridge span -- survives.
    lo = Vector((1e18,) * 3)
    hi = Vector((-1e18,) * 3)
    for v in obj.data.vertices:
        for i in range(3):
            lo[i] = min(lo[i], v.co[i])
            hi[i] = max(hi[i], v.co[i])
    span = max(1.0, max(hi[i] - lo[i] for i in range(3)))
    for attempt in range(4):
        mod = obj.modifiers.new("MF_COL_REMESH", "REMESH")
        mod.mode = "VOXEL"
        mod.voxel_size = max(voxel_m, span / 48.0) * (1.0 + attempt * 0.6)
        bpy.context.view_layer.update()
        try:
            _bake_modifiers(obj)
        except Exception:
            obj.modifiers.clear()
            break
        if len(obj.data.polygons) <= tri_budget * 6:
            break
    merge_coplanar(obj, angle_deg=12.0)
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.triangulate(bm, faces=list(bm.faces))
    bm.to_mesh(obj.data)
    obj.data.update()
    bm.free()
    for _ in range(3):
        tris = len(obj.data.polygons)
        if tris <= tri_budget:
            break
        mod = obj.modifiers.new("MF_COL_DECIMATE", "DECIMATE")
        mod.decimate_type = "COLLAPSE"
        mod.ratio = max(0.005, float(tri_budget) / float(tris))
        mod.use_collapse_triangulate = True
        bpy.context.view_layer.update()
        try:
            _bake_modifiers(obj)
        except Exception:
            obj.modifiers.clear()
            break
    obj.data.materials.clear()
    obj["mf_collision"] = True
    obj["mf_lod"] = -1
    if schema:
        obj["mf_schema"] = schema
        obj.data["mf_schema"] = schema
    obj.hide_render = True
    return obj


def strip_hidden(obj, rays=7, spread_deg=52.0, epsilon=0.002, min_area=0.0):
    """Delete faces no ray can escape from -- geometry that cannot be seen.

    strip_interior only finds faces that are topologically enclosed, which
    misses the case that matters most: a face buried inside a SEPARATE shell
    has every edge shared by exactly two faces and looks perfectly ordinary.
    This casts a small fan of rays out of each face and deletes it only if
    every single one is blocked, so a face at the bottom of a recess -- where
    the straight-out ray escapes -- is kept.
    """
    from mathutils.bvhtree import BVHTree
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.faces.ensure_lookup_table()
    tree = BVHTree.FromBMesh(bm)
    spread = math.radians(spread_deg)
    cs, sn = math.cos(spread), math.sin(spread)
    hidden = []
    for f in bm.faces:
        n = f.normal
        if n.length_squared < 1e-12:
            continue
        if min_area and f.calc_area() < min_area:
            continue
        n = n.normalized()
        origin = f.calc_center_median() + n * epsilon
        helper = Vector((0.0, 0.0, 1.0)) if abs(n.z) < 0.9 else Vector((1.0, 0.0, 0.0))
        u = n.cross(helper).normalized()
        v = n.cross(u)
        blocked = tree.ray_cast(origin, n)[0] is not None
        if blocked:
            for i in range(max(0, rays - 1)):
                a = 2.0 * math.pi * i / max(1, rays - 1)
                d = (n * cs + (u * math.cos(a) + v * math.sin(a)) * sn).normalized()
                if tree.ray_cast(origin, d)[0] is None:
                    blocked = False
                    break
        if blocked:
            hidden.append(f)
    n_hidden = len(hidden)
    if hidden:
        bmesh.ops.delete(bm, geom=hidden, context="FACES")
        bm.to_mesh(obj.data)
        obj.data.update()
    bm.free()
    return n_hidden


def self_union(obj, solver="EXACT"):
    """Resolve a single mesh's self-intersections in place.

    This is the right tool for a mesh that is already ONE connected component
    but still contains interpenetrating solids -- which is what the building
    kit is, because cleanup()'s global remove_doubles fuses shells wherever
    they share a vertex. Splitting that apart to feed a normal union shatters
    it into dozens of open fragments the solver then refuses; intersecting the
    mesh with itself does the same job without taking it apart first.

    Unlike everything else here this needs bpy.ops, so it is defensive about
    context and reports failure rather than raising.
    """
    view = bpy.context.view_layer
    if obj.name not in view.objects:
        # a freshly linked object is not in the view layer until the depsgraph
        # catches up, and ops read the view layer, not bpy.data
        bpy.context.view_layer.update()
        view = bpy.context.view_layer
    if obj.name not in view.objects:
        return {"ran": False, "reason": "not in view layer"}
    before = len(obj.data.polygons)
    prev_active = view.objects.active
    prev_selection = [o for o in view.objects if o.select_get()]
    try:
        for o in prev_selection:
            o.select_set(False)
        view.objects.active = obj
        obj.select_set(True)
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.select_all(action="SELECT")
        bpy.ops.mesh.intersect_boolean(operation="UNION", use_self=True,
                                       solver=solver)
        bpy.ops.object.mode_set(mode="OBJECT")
        out = {"ran": True, "polysBefore": before,
               "polysAfter": len(obj.data.polygons)}
    except Exception as exc:
        try:
            bpy.ops.object.mode_set(mode="OBJECT")
        except Exception:
            pass
        out = {"ran": False, "reason": str(exc)[:80]}
    obj.select_set(False)
    for o in prev_selection:
        try:
            o.select_set(True)
        except Exception:
            pass
    view.objects.active = prev_active
    return out


DEFAULT_OBJECT_NAMES = {"Cube", "Plane", "Sphere", "Icosphere", "Cylinder",
                        "Cone", "Torus", "Circle", "Grid", "Suzanne",
                        "Camera", "Light", "Lamp", "Empty"}


def purge_orphans(keep_collection=None):
    """Delete Blender's factory-startup leftovers and any unlinked data.

    The shipped .blend files carried a default `Cube` and a stray `Plane`.
    Checking only the scene's root collection missed both -- the Cube sits in
    the factory collection literally called "Collection", and the Plane had
    been left in a working sub-collection. The reliable test is that every
    object this pipeline creates carries `mf_schema`, so anything with a
    default primitive name and no schema is not ours.
    """
    removed = []
    for o in list(bpy.data.objects):
        if o.get("mf_schema"):
            continue
        # no collection exemption: the stray Plane was sitting INSIDE a kit
        # working collection, which is exactly why the first version missed it
        base = o.name.split(".")[0]
        if base in DEFAULT_OBJECT_NAMES:
            removed.append(o.name)
            bpy.data.objects.remove(o, do_unlink=True)
    for coll in list(bpy.data.collections):
        if coll is keep_collection:
            continue
        if not coll.all_objects and not coll.children:
            removed.append("collection:" + coll.name)
            bpy.data.collections.remove(coll)
    for block in (bpy.data.meshes, bpy.data.materials, bpy.data.collections):
        for item in list(block):
            if item.users == 0:
                block.remove(item)
    return removed
