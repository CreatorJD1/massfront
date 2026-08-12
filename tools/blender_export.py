"""Export a MASSFRONT unit or structure from Blender.

WHY AN EXPORTER AND NOT A FILE FORMAT
This engine has no mesh loader, and adding glTF would be the wrong trade: the
renderer is instanced, so it needs every model welded into ONE vertex/index pair
in a fixed 12-float layout, with a material id per vertex driving an atlas and a
bone index packed into that same float. A general format would arrive as several
meshes, several materials and a node hierarchy, and something would have to
flatten it anyway. This does the flattening in Blender, where the data still has
names attached, and emits exactly what MeshBuilder already produces — so a
Blender model and a hand-written one are indistinguishable downstream, and every
existing system (instancing, team livery, the material atlas, the skeleton,
the triangle budget gate) keeps working untouched.

HOW TO AUTHOR SO THIS WORKS

  MATERIALS decide the surface. Name each material slot after a game material —
  PLATE, GREEBLE, TRIM, TREAD, GLASS, LAMP, CHITIN, LEAF, SERVO, RUST, CONC —
  and it maps straight onto the atlas. A slot named TEAM (or any name ending
  _TEAM) becomes livery and takes the faction colour. Anything unrecognised
  falls back to PLATE with a warning rather than failing the export, because a
  half-named model should still come through.

  VERTEX GROUPS decide the bones, and only organics should have any. A group
  named `bone.03` puts those vertices on bone 3 of the skeleton declared in the
  model's JS. Vertices in no group are rigid to the body, which is what every
  structure and vehicle wants.

  ORIENTATION. The game is +Y up with the model's FEET at y=0 and its nose at
  +X. Blender is +Z up, so this converts on the way out. Model facing +X in
  Blender's front view and it will face forward in game.

  SCALE. One Blender unit is one game unit. A Rhino is about 16 long.

USAGE
  Run inside Blender (the MCP `execute_blender_code` tool does this directly):

      exec(open('tools/blender_export.py').read())
      result = mf_export('Rhino')          # active object, or by name

  `result` is a dict the tool returns as JSON. Feed it to
  tools/blender_import.mjs to produce the .mfmesh the game loads.
"""

import bpy, bmesh, json

# Must match MAT in src/engine/materials.js. Kept as names rather than numbers
# so a model authored today survives the atlas being re-ordered tomorrow.
MF_MATERIALS = [
    'PLATE', 'GREEBLE', 'TRIM', 'TREAD', 'GLASS', 'LAMP', 'CONC',
    'RUST', 'CHITIN', 'LEAF', 'SERVO', 'BUILD', 'ROOF',
]


def _mf_material_name(slot_name):
    """Resolve a Blender material slot to a game material + livery flag."""
    n = (slot_name or '').strip().upper()
    team = n == 'TEAM' or n.endswith('_TEAM')
    for m in MF_MATERIALS:
        if n == m or n.startswith(m + '_') or n.endswith('_' + m):
            return m, team
    return ('PLATE', team)


def _mf_bone_of(obj, vert):
    """Highest-weighted vertex group named bone.NN, or -1 for rigid."""
    best, bestw = -1, 0.0
    for g in vert.groups:
        try:
            name = obj.vertex_groups[g.group].name
        except Exception:
            continue
        if not name.lower().startswith('bone.'):
            continue
        try:
            idx = int(name.split('.', 1)[1])
        except Exception:
            continue
        if g.weight > bestw:
            best, bestw = idx, g.weight
    return best


def mf_export(name=None, apply_modifiers=True):
    obj = bpy.data.objects.get(name) if name else bpy.context.active_object
    if obj is None or obj.type != 'MESH':
        return {'ok': False, 'error': 'no mesh object named %r' % (name or '<active>')}

    dg = bpy.context.evaluated_depsgraph_get()
    src = obj.evaluated_get(dg) if apply_modifiers else obj

    bm = bmesh.new()
    bm.from_mesh(src.to_mesh())
    # The engine draws triangles only; anything else is a silent hole.
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    bm.verts.ensure_lookup_table()

    uv_layer = bm.loops.layers.uv.active
    col_layer = bm.loops.layers.color.active

    slots = [_mf_material_name(s.material.name if s.material else '') for s in obj.material_slots] \
            or [('PLATE', False)]

    mw = obj.matrix_world
    verts, idx, warnings = [], [], []
    seen = {}
    unknown = set()
    for s, mat in zip(obj.material_slots, slots):
        raw = (s.material.name if s.material else '')
        if raw and mat[0] == 'PLATE' and raw.strip().upper() not in ('PLATE', 'TEAM'):
            unknown.add(raw)

    for f in bm.faces:
        mslot = f.material_index if f.material_index < len(slots) else 0
        mname, team = slots[mslot]
        for loop in f.loops:
            v = loop.vert
            co = mw @ v.co
            no = (mw.to_3x3() @ v.normal).normalized()
            uv = loop[uv_layer].uv if uv_layer else (0.0, 0.0)
            if col_layer:
                c = loop[col_layer]
                col = (c[0], c[1], c[2])
            else:
                col = (1.0, 1.0, 1.0)
            bone = _mf_bone_of(obj, v)
            # Blender +Z up, nose +X  ->  game +Y up, nose +X.
            rec = (round(co.x, 4), round(co.z, 4), round(-co.y, 4),
                   round(no.x, 4), round(no.z, 4), round(-no.y, 4),
                   round(col[0], 4), round(col[1], 4), round(col[2], 4),
                   round(uv[0], 4), round(uv[1], 4),
                   mname, bool(team), int(bone))
            k = seen.get(rec)
            if k is None:
                k = len(verts); seen[rec] = k; verts.append(rec)
            idx.append(k)

    bm.free()
    if unknown:
        warnings.append('unrecognised material slots fell back to PLATE: ' + ', '.join(sorted(unknown)))
    tris = len(idx) // 3
    if len(verts) > 65535:
        return {'ok': False, 'error': '%d vertices exceeds the 16-bit index limit; split or decimate' % len(verts)}

    return {
        'ok': True, 'name': obj.name, 'tris': tris, 'verts': len(verts),
        'warnings': warnings,
        # Parallel arrays rather than objects: this crosses a JSON boundary and
        # a list of 20k dicts is an order of magnitude larger for no gain.
        'p':  [c for r in verts for c in r[0:3]],
        'n':  [c for r in verts for c in r[3:6]],
        'c':  [c for r in verts for c in r[6:9]],
        'uv': [c for r in verts for c in r[9:11]],
        'mat':  [r[11] for r in verts],
        'team': [r[12] for r in verts],
        'bone': [r[13] for r in verts],
        'i': idx,
    }
