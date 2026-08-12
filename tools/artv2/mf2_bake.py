"""ART V2 TOOLKIT — shared Blender bake library (Blender 5.2 only).

WHY THIS EXISTS
    The pipeline used to be one hand-written baker per asset:
    bake-material-v2-tank.py (279 lines) and bake-material-v2-nova-factory.py
    (153 lines) differ by 360 lines while performing the same operation, because
    asset identity was hardcoded at the top of each file. A new bespoke pack
    therefore meant a new script, which is why the repository holds 181 texture
    triplets but only two authored packs.

    Everything asset-specific now lives in assets/data/art-v2-assets.json and
    everything generic lives here. Adding an asset is a manifest entry.

WHAT IS PRESERVED
    The bake passes, the three-map channel packing (BaseAO / NRE / Masks), the
    material-region PBR table, socket duplication and the joined-mesh contract
    are ported from the proven tank baker so output stays comparable.

WHAT IS NEW
    * Multiple LOD tiers driven by a TARGET TRIANGLE COUNT rather than one fixed
      decimate ratio. The old fixed ratio (.46) produced a 14,728-triangle
      "LOD1" for a class whose live budget is 1,500 — the tier the renderer
      actually instances was missing. decimate_to_target() searches the ratio.
    * A machine-readable result line (ARTV2_RESULT {json}) so the Node layer and
      any AI agent can parse the outcome instead of scraping Blender's log.

BLENDER 5.2 ONLY. 4.x and 5.x differ in bpy API and bake defaults; a silent
fallback would change output between machines/agents. artv2 doctor enforces it.
"""
import bpy, os, json, math, sys

try:
    import numpy as np
except Exception as exc:                                    # pragma: no cover
    raise RuntimeError("Blender's Python needs numpy for the V2 bake") from exc

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
MANIFEST = os.path.join(ROOT, 'assets', 'data', 'art-v2-assets.json')


# --------------------------------------------------------------- manifest
def load_manifest():
    with open(MANIFEST, 'r', encoding='utf-8') as fh:
        return json.load(fh)


def region_values(manifest, asset, material_name):
    """Map a Blender material name onto the flat PBR values baked into the
    Masks/NRE channels. Ported verbatim from the tank baker's if/elif ladder,
    but the numbers are manifest data so an asset can override them."""
    table = dict(manifest.get('regionMaterials', {}))
    table.update(asset.get('regionOverrides', {}))
    name = material_name.upper()
    # Longest region name first so TEAM_PRIMARY wins over a bare TEAM.
    for key in sorted((k for k in table if not k.startswith('_')), key=len, reverse=True):
        if key in name:
            v = table[key]
            return (float(v.get('rough', .38)), float(v.get('metal', .72)),
                    float(v.get('emis', 0.0)), int(v.get('team', 0)))
    d = table.get('_default', {})
    return (float(d.get('rough', .38)), float(d.get('metal', .72)), float(d.get('emis', 0.0)), 0)


# ------------------------------------------------------------------- mesh
def join_evaluated(collection_name, out_name):
    """Evaluate modifiers and join the authored hierarchy into the single static
    mesh the renderer instances. The source collection is never mutated."""
    src = bpy.data.collections.get(collection_name)
    if not src:
        raise RuntimeError('collection missing: %s' % collection_name)
    scene = bpy.context.scene
    bake_col = bpy.data.collections.new('MF2_BakeMesh')
    scene.collection.children.link(bake_col)
    dg = bpy.context.evaluated_depsgraph_get()
    dups = []
    for o in src.objects:
        if o.type != 'MESH':
            continue
        ev = o.evaluated_get(dg)
        me = bpy.data.meshes.new_from_object(ev, preserve_all_data_layers=True, depsgraph=dg)
        d = bpy.data.objects.new('bake_' + o.name, me)
        bake_col.objects.link(d)
        d.matrix_world = o.matrix_world.copy()
        dups.append(d)
    if not dups:
        raise RuntimeError('no source meshes in %s' % collection_name)
    bpy.ops.object.select_all(action='DESELECT')
    for d in dups:
        d.select_set(True)
    bpy.context.view_layer.objects.active = dups[0]
    bpy.ops.object.join()
    obj = bpy.context.object
    obj.name = out_name
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    # Copy materials so temporary bake nodes never touch the authored art.
    for slot in obj.material_slots:
        if slot.material:
            slot.material = slot.material.copy()
    return obj, bake_col


def unwrap(obj, cfg):
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(cfg.get('angle_limit_deg', 66)),
                             island_margin=cfg.get('island_margin', .006),
                             area_weight=cfg.get('area_weight', .35),
                             correct_aspect=True, scale_to_bounds=False)
    bpy.ops.uv.pack_islands(rotate=True, margin=cfg.get('island_margin', .006))
    bpy.ops.object.mode_set(mode='OBJECT')


def tri_count(obj):
    return sum(max(0, len(p.vertices) - 2) for p in obj.data.polygons)


def decimate_to_target(obj, target, ceiling=None, floor=None, tolerance=.04, max_iter=14):
    """Decimate to `target`, never exceeding `ceiling` and never below `floor`.

    The previous pipeline hardcoded a single ratio per asset, so the resulting
    tier had whatever count fell out of it — that is how a 14,728-triangle mesh
    ended up as the LOD for a 1,500-triangle budget. Searching the ratio makes
    the manifest's target authoritative instead of advisory.

    The search is biased UNDER the ceiling rather than nearest-to-target: a hard
    budget that a bake can overshoot by a couple of triangles is not a budget,
    and the verify gate would reject the result it just produced.
    """
    base = tri_count(obj)
    cap = min(x for x in (target, ceiling) if x) if (target or ceiling) else target
    if base <= cap:
        return base, 1.0
    lo, hi = 0.0, 1.0
    best_ratio, best_tris = cap / float(base), None
    for _ in range(max_iter):
        ratio = (lo + hi) / 2.0
        tmp = obj.copy()
        tmp.data = obj.data.copy()
        bpy.context.scene.collection.objects.link(tmp)
        mod = tmp.modifiers.new('MF2_PROBE', 'DECIMATE')
        mod.decimate_type = 'COLLAPSE'
        mod.ratio = ratio
        if hasattr(mod, 'use_collapse_triangulate'):
            mod.use_collapse_triangulate = True
        dg = bpy.context.evaluated_depsgraph_get()
        got = len(tmp.evaluated_get(dg).to_mesh().loop_triangles)
        bpy.data.objects.remove(tmp, do_unlink=True)
        # Only accept candidates that respect the hard cap; among those keep the
        # densest (closest to target from below) so we spend the whole budget.
        if got <= cap and (best_tris is None or got > best_tris):
            best_tris, best_ratio = got, ratio
        if got <= cap and got >= cap * (1.0 - tolerance):
            break
        if got > cap:
            hi = ratio
        else:
            lo = ratio
    if floor and best_tris is not None and best_tris < floor:
        raise RuntimeError('cannot satisfy both the %d ceiling and the %d floor for this mesh' % (cap, floor))
    mod = obj.modifiers.new('MF2_LOD_DECIMATE', 'DECIMATE')
    mod.decimate_type = 'COLLAPSE'
    mod.ratio = best_ratio
    if hasattr(mod, 'use_collapse_triangulate'):
        mod.use_collapse_triangulate = True
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=mod.name)
    return tri_count(obj), best_ratio


def export_glb(objects, filepath):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objects:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    kw = dict(filepath=filepath, export_format='GLB', use_selection=True,
              export_apply=True, export_materials='EXPORT', export_yup=True)
    try:
        bpy.ops.export_scene.gltf(export_cameras=False, export_lights=False, **kw)
    except TypeError:
        # Keyword set drifts between Blender releases; the core set is enough.
        bpy.ops.export_scene.gltf(**kw)


def duplicate_sockets(src_collection, into_collection, names=None):
    """Sockets stay metadata empties: only the joined mesh carries geometry."""
    src = bpy.data.collections.get(src_collection)
    out = []
    if not src:
        return out
    for o in src.objects:
        if not o.name.startswith('socket_'):
            continue
        if names and not any(o.name.startswith(n) for n in names):
            continue
        s = bpy.data.objects.new(o.name, None)
        into_collection.objects.link(s)
        s.matrix_world = o.matrix_world.copy()
        out.append(s)
    return out


# ------------------------------------------------------------------- bake
class Baker:
    """Owns the bake scene and the three-map composition."""

    def __init__(self, obj, size, cfg):
        self.obj, self.size = obj, size
        scene = bpy.context.scene
        scene.render.engine = 'CYCLES'
        scene.cycles.samples = cfg.get('samples', 8)
        scene.cycles.use_denoising = False
        scene.render.bake.margin = cfg.get('margin', 12)
        scene.render.bake.use_clear = True
        scene.render.bake.target = 'IMAGE_TEXTURES'
        self.scene = scene
        self.surface_links = {}
        for mat in obj.data.materials:
            nodes = mat.node_tree.nodes
            out = next(n for n in nodes if n.type == 'OUTPUT_MATERIAL')
            old = out.inputs['Surface'].links[0].from_socket if out.inputs['Surface'].links else None
            self.surface_links[mat.name] = (old, out)

    def image(self, name, noncolor=True):
        im = bpy.data.images.new(name, width=self.size, height=self.size, alpha=True, float_buffer=False)
        if noncolor:
            im.colorspace_settings.name = 'Non-Color'
        return im

    def _target(self, im):
        for mat in self.obj.data.materials:
            mat.use_nodes = True
            nodes = mat.node_tree.nodes
            n = nodes.get('MF2_BAKE_TARGET') or nodes.new('ShaderNodeTexImage')
            n.name = 'MF2_BAKE_TARGET'
            n.image = im
            for x in nodes:
                x.select = False
            n.select = True
            nodes.active = n

    def bake(self, im, kind, pass_filter=None):
        self._target(im)
        kw = {'type': kind, 'margin': self.scene.render.bake.margin, 'use_clear': True}
        if pass_filter is not None:
            kw['pass_filter'] = pass_filter
        bpy.context.view_layer.objects.active = self.obj
        self.obj.select_set(True)
        bpy.ops.object.bake(**kw)

    def flat(self, value_fn):
        """Drive every material with a flat emission so a channel can be baked."""
        for mat in self.obj.data.materials:
            nodes = mat.node_tree.nodes
            links = mat.node_tree.links
            _old, out = self.surface_links[mat.name]
            em = nodes.get('MF2_FLAT_BAKE') or nodes.new('ShaderNodeEmission')
            em.name = 'MF2_FLAT_BAKE'
            for link in list(em.inputs['Color'].links):
                links.remove(link)
            value_fn(mat, nodes, links, em)
            em.inputs['Strength'].default_value = 1
            links.new(em.outputs[0], out.inputs['Surface'])

    def restore(self):
        for mat in self.obj.data.materials:
            old, out = self.surface_links[mat.name]
            if old:
                mat.node_tree.links.new(old, out.inputs['Surface'])

    def pixels(self, im):
        a = np.empty(self.size * self.size * 4, dtype=np.float32)
        im.pixels.foreach_get(a)
        return a.reshape((self.size, self.size, 4))

    def save(self, name, data, srgb, out_dir):
        im = self.image(name, not srgb)
        im.pixels.foreach_set(np.asarray(data, dtype=np.float32).reshape(-1))
        im.update()
        im.file_format = 'PNG'
        im.filepath_raw = os.path.join(out_dir, name + '.png')
        im.save()
        return im.filepath_raw


def bake_asset(manifest, key, force=False):
    """Full bake for one manifest asset. Returns a JSON-able result dict."""
    asset = manifest['assets'][key]
    cfg = manifest.get('bake', {})
    budgets = manifest['classBudgets'][asset['class']]
    out_dir = os.path.join(ROOT, asset['dir'])
    slug = asset['slug']
    size = int(budgets.get('showcase_map', 1024))

    src_blend = os.path.join(out_dir, asset['sourceBlend'])
    if not os.path.exists(src_blend):
        raise RuntimeError('source .blend missing: %s (run the build stage first)' % src_blend)
    bpy.ops.wm.open_mainfile(filepath=src_blend)

    obj, bake_col = join_evaluated(asset['collection'], slug.replace('-', '_') + '_baked')
    unwrap(obj, cfg.get('uv', {}))
    bk = Baker(obj, size, cfg)

    base = bk.image('MF2_Base', False)
    ao = bk.image('MF2_AO')
    normal = bk.image('MF2_Normal')
    bk.bake(base, 'DIFFUSE', {'COLOR'})
    bk.bake(ao, 'AO')
    bk.scene.render.bake.normal_space = 'TANGENT'
    bk.bake(normal, 'NORMAL')

    def mask_vals(mat, nodes, links, em):
        rough, metal, emis, team = region_values(manifest, asset, mat.name)
        em.inputs['Color'].default_value = (metal, 1.0 if team == 1 else 0.0, 1.0 if team == 2 else 0.0, 1)

    def prop_vals(mat, nodes, links, em):
        rough, metal, emis, team = region_values(manifest, asset, mat.name)
        em.inputs['Color'].default_value = (rough, emis, 0, 1)

    def curvature(mat, nodes, links, em):
        geo = nodes.get('MF2_CURVATURE') or nodes.new('ShaderNodeNewGeometry')
        geo.name = 'MF2_CURVATURE'
        links.new(geo.outputs['Pointiness'], em.inputs['Color'])

    mask = bk.image('MF2_Mask'); bk.flat(mask_vals); bk.bake(mask, 'EMIT')
    props = bk.image('MF2_Props'); bk.flat(prop_vals); bk.bake(props, 'EMIT')
    curv = bk.image('MF2_Curvature'); bk.flat(curvature); bk.bake(curv, 'EMIT')

    B, A, NR = bk.pixels(base), bk.pixels(ao), bk.pixels(normal)
    M, PR, CUR = bk.pixels(mask), bk.pixels(props), bk.pixels(curv)

    # --- channel packing: the three-map Material V2 contract ---------------
    # BaseAO = albedo.rgb + baked AO in alpha (linear alpha, sRGB rgb).
    baseao = np.empty_like(B)
    baseao[:, :, :3] = np.clip(B[:, :, :3], 0, 1)
    baseao[:, :, 3] = np.clip(A[:, :, 0], 0, 1)
    # NRE = normal.xy + roughness + emissive.
    nre = np.empty_like(NR)
    nre[:, :, 0] = np.clip(NR[:, :, 0], 0, 1)
    nre[:, :, 1] = np.clip(NR[:, :, 1], 0, 1)
    nre[:, :, 2] = np.clip(PR[:, :, 0], 0, 1)
    nre[:, :, 3] = np.clip(PR[:, :, 1], 0, 1)
    # Masks = metal + faction primary/secondary + wear (curvature-driven edges).
    edge = np.clip(1.0 - CUR[:, :, 0], 0, 1)
    masks = np.empty_like(M)
    masks[:, :, :3] = np.clip(M[:, :, :3], 0, 1)
    masks[:, :, 3] = np.clip((edge - .5) * 1.6 + .5, 0, 1)

    maps = {
        'baseao': bk.save(slug + '-baseao', baseao, True, out_dir),
        'nre': bk.save(slug + '-nre', nre, False, out_dir),
        'masks': bk.save(slug + '-masks', masks, False, out_dir),
    }

    bk.restore()
    sockets = duplicate_sockets(asset['collection'], bake_col, asset.get('sockets'))

    # --- LOD tiers ---------------------------------------------------------
    showcase_tris = tri_count(obj)
    lods = []
    for tier in asset.get('lods', []):
        name, target = tier['name'], int(tier['target_tris'])
        if name == 'showcase':
            path = os.path.join(out_dir, slug + '-baked.glb')
            export_glb([obj] + sockets, path)
            bpy.ops.wm.save_as_mainfile(filepath=os.path.join(out_dir, slug + '-baked.blend'))
            lods.append({'name': name, 'tris': showcase_tris, 'target': target, 'path': path, 'ratio': 1.0})
            continue
        lod = obj.copy()
        lod.data = obj.data.copy()
        lod.name = '%s_%s' % (slug.replace('-', '_'), name)
        bake_col.objects.link(lod)
        ceiling = budgets['battle_tris'] if name == 'battle' else None
        got, ratio = decimate_to_target(lod, target, ceiling=ceiling,
                                        floor=manifest.get('authoring', {}).get('min_tris'))
        path = os.path.join(out_dir, '%s-%s.glb' % (slug, name))
        export_glb([lod] + sockets, path)
        lods.append({'name': name, 'tris': got, 'target': target, 'path': path, 'ratio': round(ratio, 4)})
        bpy.data.objects.remove(lod, do_unlink=True)

    battle = next((l for l in lods if l['name'] == 'battle'), None)
    within = battle is None or battle['tris'] <= budgets['battle_tris']
    return {
        'asset': key, 'slug': slug, 'blender': bpy.app.version_string,
        'mapSize': size, 'maps': {k: os.path.relpath(v, ROOT).replace('\\', '/') for k, v in maps.items()},
        'lods': [{**l, 'path': os.path.relpath(l['path'], ROOT).replace('\\', '/')} for l in lods],
        'battleBudget': budgets['battle_tris'],
        'withinBudget': bool(within),
        'sockets': [s.name for s in sockets],
    }


def emit_result(payload, ok=True, errors=None):
    """One machine-readable line so Node/agents never scrape Blender's log."""
    print('ARTV2_RESULT ' + json.dumps({'ok': ok, 'data': payload, 'errors': errors or []}))
