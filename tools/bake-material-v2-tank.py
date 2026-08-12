"""Create asset-specific packed Material V2 maps from the authored tank.

Run through Blender in background mode after build-material-v2-tank.py. The
source hierarchy remains untouched. Evaluated duplicates are joined into the
single static battle/showcase mesh the renderer wants, receive one shared UV0,
and bake to the exact three-map Material V2 contract.
"""
import bpy, os, math
from array import array
import numpy as np

ROOT=os.path.abspath(os.path.join(os.path.dirname(__file__),'..'))
OUT=os.path.join(ROOT,'source-media','material-v2','nova-heavy-tank-v2')
SOURCE=os.path.join(OUT,'nova-heavy-tank-v2.blend')
bpy.ops.wm.open_mainfile(filepath=SOURCE)
scene=bpy.context.scene

src=bpy.data.collections.get('MF2_NovaHeavyTank')
if not src: raise RuntimeError('MF2_NovaHeavyTank collection missing')
bake_col=bpy.data.collections.new('MF2_BakeMesh')
scene.collection.children.link(bake_col)
dg=bpy.context.evaluated_depsgraph_get();dups=[]
for o in src.objects:
    if o.type!='MESH': continue
    ev=o.evaluated_get(dg)
    me=bpy.data.meshes.new_from_object(ev,preserve_all_data_layers=True,depsgraph=dg)
    d=bpy.data.objects.new('bake_'+o.name,me);bake_col.objects.link(d);d.matrix_world=o.matrix_world.copy();dups.append(d)
if not dups: raise RuntimeError('no source meshes')

bpy.ops.object.select_all(action='DESELECT')
for d in dups: d.select_set(True)
bpy.context.view_layer.objects.active=dups[0]
bpy.ops.object.join();tank=bpy.context.object;tank.name='nova_heavy_tank_v2_baked'
bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)

# Copy materials so temporary bake-node changes never mutate the source art.
for slot in tank.material_slots:
    if slot.material: slot.material=slot.material.copy()

bpy.context.view_layer.objects.active=tank;tank.select_set(True)
bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.smart_project(angle_limit=math.radians(66),island_margin=.006,area_weight=.35,correct_aspect=True,scale_to_bounds=False)
bpy.ops.uv.pack_islands(rotate=True,margin=.006)
bpy.ops.object.mode_set(mode='OBJECT')

SIZE=1024
scene.render.engine='CYCLES';scene.cycles.samples=8;scene.cycles.use_denoising=False
scene.render.bake.margin=12;scene.render.bake.use_clear=True;scene.render.bake.target='IMAGE_TEXTURES'

def image(name,noncolor=True):
    im=bpy.data.images.new(name,width=SIZE,height=SIZE,alpha=True,float_buffer=False)
    if noncolor: im.colorspace_settings.name='Non-Color'
    return im

def target(im):
    for mat in tank.data.materials:
        mat.use_nodes=True;nodes=mat.node_tree.nodes
        n=nodes.get('MF2_BAKE_TARGET') or nodes.new('ShaderNodeTexImage')
        n.name='MF2_BAKE_TARGET';n.image=im
        for x in nodes: x.select=False
        n.select=True;nodes.active=n

def bake(im,kind,pass_filter=None):
    target(im)
    kw={'type':kind,'margin':12,'use_clear':True}
    if pass_filter is not None: kw['pass_filter']=pass_filter
    bpy.context.view_layer.objects.active=tank;tank.select_set(True)
    bpy.ops.object.bake(**kw)

base=image('MF2_Base',False);ao=image('MF2_AO');normal=image('MF2_Normal');object_normal=image('MF2_ObjectNormal')
bake(base,'DIFFUSE',{'COLOR'});bake(ao,'AO')
scene.render.bake.normal_space='TANGENT';bake(normal,'NORMAL')
# Object normals exist only during the offline bake. Together with generated
# position they make the micro-surface projection deterministic and similarly
# scaled across unrelated UV islands without adding a runtime texture sample.
scene.render.bake.normal_space='OBJECT';bake(object_normal,'NORMAL')
scene.render.bake.normal_space='TANGENT'

surface_links={}
for mat in tank.data.materials:
    nodes=mat.node_tree.nodes;links=mat.node_tree.links;out=next(n for n in nodes if n.type=='OUTPUT_MATERIAL')
    old=out.inputs['Surface'].links[0].from_socket if out.inputs['Surface'].links else None
    surface_links[mat.name]=(old,out)

def flat_material_values(mode):
    for mat in tank.data.materials:
        name=mat.name.upper();nodes=mat.node_tree.nodes;links=mat.node_tree.links;old,out=surface_links[mat.name]
        em=nodes.get('MF2_FLAT_BAKE') or nodes.new('ShaderNodeEmission');em.name='MF2_FLAT_BAKE'
        primary=1.0 if 'TEAM_PRIMARY' in name else 0.0
        secondary=1.0 if 'TEAM_SECONDARY' in name else 0.0
        if 'FACTION_BADGE' in name: rough,metal,emis=.32,.24,.24
        elif 'EDGE_STEEL' in name: rough,metal,emis=.12,.98,0
        elif 'TRIM' in name: rough,metal,emis=.17,.96,0
        elif 'STRUCTURE' in name: rough,metal,emis=.25,.92,0
        elif 'MACHINE' in name: rough,metal,emis=.56,.82,0
        elif 'WEAPON' in name: rough,metal,emis=.19,.94,0
        elif 'GLASS' in name: rough,metal,emis=.08,.16,.55
        elif 'ENERGY' in name: rough,metal,emis=.18,.22,1.0
        elif primary: rough,metal,emis=.34,.66,0
        elif secondary: rough,metal,emis=.34,.50,0
        else: rough,metal,emis=.38,.72,0
        color=(metal,primary,secondary,1) if mode=='mask' else (rough,emis,0,1)
        em.inputs['Color'].default_value=color;em.inputs['Strength'].default_value=1
        links.new(em.outputs[0],out.inputs['Surface'])

mask=image('MF2_Mask');props=image('MF2_Props')
flat_material_values('mask');bake(mask,'EMIT')
flat_material_values('props');bake(props,'EMIT')

# Bake generated object coordinates once offline. This gives damage art a real
# place on the vehicle instead of guessing UV-island positions after smart UV
# packing. The coordinate image is build-only and adds no runtime sampler.
def flat_position_values():
    for mat in tank.data.materials:
        nodes=mat.node_tree.nodes;links=mat.node_tree.links;old,out=surface_links[mat.name]
        em=nodes.get('MF2_FLAT_BAKE') or nodes.new('ShaderNodeEmission');em.name='MF2_FLAT_BAKE'
        tc=nodes.get('MF2_BAKE_COORD') or nodes.new('ShaderNodeTexCoord');tc.name='MF2_BAKE_COORD'
        for link in list(em.inputs['Color'].links):links.remove(link)
        links.new(tc.outputs['Generated'],em.inputs['Color']);em.inputs['Strength'].default_value=1
        links.new(em.outputs[0],out.inputs['Surface'])

position=image('MF2_Position');flat_position_values();bake(position,'EMIT')

# Cycles pointiness supplies a true geometry-space curvature signal. The first
# bake inferred edges from neighboring tangent-normal texels, which broke at UV
# island gutters and produced speckle instead of believable exposed alloy.
def flat_curvature_values():
    for mat in tank.data.materials:
        nodes=mat.node_tree.nodes;links=mat.node_tree.links;old,out=surface_links[mat.name]
        em=nodes.get('MF2_FLAT_BAKE') or nodes.new('ShaderNodeEmission');em.name='MF2_FLAT_BAKE'
        geo=nodes.get('MF2_CURVATURE') or nodes.new('ShaderNodeNewGeometry');geo.name='MF2_CURVATURE'
        for link in list(em.inputs['Color'].links):links.remove(link)
        links.new(geo.outputs['Pointiness'],em.inputs['Color']);em.inputs['Strength'].default_value=1
        links.new(em.outputs[0],out.inputs['Surface'])

curvature=image('MF2_Curvature');flat_curvature_values();bake(curvature,'EMIT')

def pixels(im):
    a=np.empty(SIZE*SIZE*4,dtype=np.float32);im.pixels.foreach_get(a);return a.reshape((SIZE,SIZE,4))
B=pixels(base);A=pixels(ao);NR=pixels(normal);ON=pixels(object_normal);M=pixels(mask);PR=pixels(props);POS=pixels(position);CUR=pixels(curvature)

# Authored bevel faces carry a dedicated material in Blender. This replaces
# curvature/normal gradients that mistook triangulation and micro-normal grain
# for damage and sprayed metallic glitter across broad armor panels.
edge_semantic=(PR[:,:,0]<.145) & (M[:,:,0]>.94) & (PR[:,:,1]<.08)
edge_wear=edge_semantic.astype(np.float32)*.48
# Three sparse object-space impact fields survive UV repacking and LOD export.
# Values above .58 are reserved for impacts, while ordinary bevel wear stays
# below .48; the battle shader can therefore distinguish chips from damage
# without another packed channel or texture lookup.
occupied=M[:,:,3]>.5
impact=np.zeros((SIZE,SIZE),dtype=np.float32)
for center,radius in (((.72,.27,.53),(.105,.12,.13)),
                      ((.46,.72,.70),(.11,.12,.12)),
                      ((.24,.08,.39),(.14,.09,.13))):
    d=np.sqrt(sum(((POS[:,:,axis]-center[axis])/radius[axis])**2 for axis in range(3)))
    impact=np.maximum(impact,np.clip(1-d,0,1)**.62)
damage_ok=occupied & (PR[:,:,1]<.08)
impact_code=np.where(impact>.025,.56+.44*impact,0)
wear=np.maximum(edge_wear,np.where(damage_ok,impact_code,0))

# Project the supplied seamless brushed-metal micro tile in object space. The
# earlier pass shipped this texture but never used it, so armor remained a flat
# colour field. Triplanar selection uses the baked object normal, keeping scale
# stable across smart-UV islands while still producing only the same three
# runtime maps.
micro_img=bpy.data.images.load(os.path.join(ROOT,'source-media','material-v2','mf_mechanical_microdetail_v2.png'),check_existing=True)
mw,mh=micro_img.size
micro_rgba=np.empty(mw*mh*4,dtype=np.float32);micro_img.pixels.foreach_get(micro_rgba)
micro_src=micro_rgba.reshape((mh,mw,4))[:,:,0]
obj_n=ON[:,:,:3]*2-1;major=np.argmax(np.abs(obj_n),axis=2)
u=np.where(major==0,POS[:,:,1],POS[:,:,0]);v=np.where(major==2,POS[:,:,1],POS[:,:,2])
repeat_u=19.0;repeat_v=13.0
ix=np.mod((u*repeat_u*mw).astype(np.int32),mw);iy=np.mod((v*repeat_v*mh).astype(np.int32),mh)
detail=micro_src[iy,ix]
detail_x=micro_src[iy,np.mod(ix+1,mw)]-micro_src[iy,np.mod(ix-1,mw)]
detail_y=micro_src[np.mod(iy+1,mh),ix]-micro_src[np.mod(iy-1,mh),ix]
detail_center=detail-np.mean(micro_src)
detail_ok=occupied & (PR[:,:,1]<.08) & (~edge_semantic)

# Medium-frequency plate seams are part of the authored normal map, not a
# screen-space outline. Generated/object coordinates keep their physical scale
# coherent when the smart UV pack rotates or resizes islands. Only painted
# armor ranges participate; machinery, optics, trim and badges stay clean.
broad_armor=detail_ok & (PR[:,:,0]>=.27) & (PR[:,:,0]<=.36)
cell_u=np.mod(u*6.0+.17,1.0);cell_v=np.mod(v*4.0+.31,1.0)
du=np.abs(cell_u-.5);dv=np.abs(cell_v-.5)
seam_u=np.exp(-((du/.010)**2))*broad_armor
seam_v=np.exp(-((dv/.011)**2))*broad_armor
seam=np.maximum(seam_u,seam_v)
seam_slope_u=np.sign(cell_u-.5)*np.exp(-((du/.024)**2))*broad_armor
seam_slope_v=np.sign(cell_v-.5)*np.exp(-((dv/.026)**2))*broad_armor

# Edge age is intentionally broken rather than a continuous toon outline.
# Two object-space frequencies create reproducible clusters of chips around
# exposed bevels, matching the worn painted-steel hierarchy in the reference.
chip_noise=.5+.25*np.sin(POS[:,:,0]*173.0+POS[:,:,2]*91.0)+.25*np.sin(POS[:,:,1]*227.0-POS[:,:,0]*63.0)
chip_break=np.clip((chip_noise-.30)*1.8,.16,1.0)

baseao=np.empty_like(B);baseao[:,:,:3]=B[:,:,:3]
# Joined mechanical assemblies legitimately occlude one another, but the raw
# Cycles AO bake pushed most exposed islands below 0.25 and made the asset read
# as black metal at phone scale. Preserve cavity ordering while lifting the
# occupied range; empty texels stay zero so bake margins remain authoritative.
occupied=M[:,:,3]>.5
ao_lift=np.clip(.40+.60*np.sqrt(np.clip(A[:,:,0],0,1)),0,1)
baseao[:,:,3]=np.where(occupied,ao_lift,0)
# Preserve the palette by semantic material instead of multiplying the entire
# asset by team colour. Blender's diffuse bake stores very dark linear values;
# without this controlled grade the armor and machinery both collapse to the
# same graphite mass in the WebGL showcase.
armor_semantic=occupied & (PR[:,:,0]>=.36) & (PR[:,:,0]<=.405) & (M[:,:,1]<.08) & (M[:,:,2]<.08)
structure_semantic=occupied & (PR[:,:,0]>=.235) & (PR[:,:,0]<=.265) & (M[:,:,0]>.86)
armor_target=np.array([.105,.245,.52],dtype=np.float32)
structure_target=np.array([.30,.35,.42],dtype=np.float32)
baseao[:,:,:3]=np.where(armor_semantic[:,:,None],baseao[:,:,:3]*.22+armor_target[None,None,:]*.78,baseao[:,:,:3])
baseao[:,:,:3]=np.where(structure_semantic[:,:,None],baseao[:,:,:3]*.30+structure_target[None,None,:]*.70,baseao[:,:,:3])
# Permanent authored edge exposure creates the pale machined outline visible in
# the target aesthetic. It is stronger on true bevel gradients and remains
# restrained on broad armor, where the micro tile contributes only low-contrast
# paint/roughness breakup.
edge_art=edge_semantic.astype(np.float32)*(.78+.22*chip_break)
# The bevel material is already exposed alloy. Only break its value slightly;
# never repaint surrounding armor from an inferred image-space edge.
baseao[:,:,:3]*=(1-edge_semantic[:,:,None]*(.04+.10*(1-chip_break[:,:,None])))
baseao[:,:,:3]+=detail_center[:,:,None]*detail_ok[:,:,None]*.13
baseao[:,:,:3]*=(1-seam[:,:,None]*.42)
cavity=np.clip(1-ao_lift,0,.7)*detail_ok
baseao[:,:,:3]*=(1-cavity[:,:,None]*.24)
baseao[:,:,:3]=np.clip(baseao[:,:,:3],0,1)
nre=np.empty_like(NR)
nre[:,:,0]=np.clip(NR[:,:,0]+detail_x*detail_ok*.24+seam_slope_u*.090,0,1)
nre[:,:,1]=np.clip(NR[:,:,1]+detail_y*detail_ok*.24+seam_slope_v*.090,0,1)
nre[:,:,2]=np.clip(PR[:,:,0]+detail_center*detail_ok*.14-edge_art*.10+seam*.07,0,1)
nre[:,:,3]=PR[:,:,1]
masks=np.empty_like(M);masks[:,:,:3]=M[:,:,:3];masks[:,:,3]=wear

def save_packed(name,data,srgb):
    im=image(name,not srgb);flat=np.asarray(data,dtype=np.float32).reshape(-1)
    im.pixels.foreach_set(flat);im.update();im.file_format='PNG';im.filepath_raw=os.path.join(OUT,name+'.png');im.save()
save_packed('nova-heavy-tank-v2-baseao',baseao,True)
save_packed('nova-heavy-tank-v2-nre',nre,False)
save_packed('nova-heavy-tank-v2-masks',masks,False)

# Restore authored Principled materials before exporting the joined GLB.
for mat in tank.data.materials:
    old,out=surface_links[mat.name]
    if old: mat.node_tree.links.new(old,out.inputs['Surface'])

# Duplicate named sockets at their evaluated world transforms. They remain
# metadata nodes; only the joined tank contributes geometry.
sockets=[]
for o in src.objects:
    if not o.name.startswith('socket_'): continue
    s=bpy.data.objects.new(o.name,None);bake_col.objects.link(s);s.matrix_world=o.matrix_world.copy();sockets.append(s)

bpy.ops.object.select_all(action='DESELECT');tank.select_set(True)
for s in sockets:s.select_set(True)
bpy.context.view_layer.objects.active=tank
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT,'nova-heavy-tank-v2-baked.glb'),export_format='GLB',use_selection=True,
    export_apply=True,export_materials='EXPORT',export_cameras=False,export_lights=False,export_yup=True)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT,'nova-heavy-tank-v2-baked.blend'))

# LOD1 is derived from the same evaluated, UV-baked silhouette. Decimation is
# offline and deterministic; runtime never creates topology or unique buffers
# per unit. The 0.46 ratio retains the twin cannons, tracks and turret crown.
lod=tank.copy();lod.data=tank.data.copy();lod.name='nova_heavy_tank_v2_lod1';bake_col.objects.link(lod)
dec=lod.modifiers.new('MF2_LOD1_DECIMATE','DECIMATE');dec.decimate_type='COLLAPSE';dec.ratio=.46
if hasattr(dec,'use_collapse_triangulate'):dec.use_collapse_triangulate=True
bpy.ops.object.select_all(action='DESELECT');lod.select_set(True);bpy.context.view_layer.objects.active=lod
bpy.ops.object.modifier_apply(modifier=dec.name)
bpy.ops.object.select_all(action='DESELECT');lod.select_set(True)
for s in sockets:s.select_set(True)
bpy.context.view_layer.objects.active=lod
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT,'nova-heavy-tank-v2-lod1.glb'),export_format='GLB',use_selection=True,
    export_apply=True,export_materials='EXPORT',export_cameras=False,export_lights=False,export_yup=True)
full_tris=sum(max(0,len(p.vertices)-2) for p in tank.data.polygons)
lod_tris=sum(max(0,len(p.vertices)-2) for p in lod.data.polygons)
print('MATERIAL_V2_BAKE_OK tris=%d verts=%d lod1_tris=%d lod1_verts=%d'%(full_tris,len(tank.data.vertices),lod_tris,len(lod.data.vertices)))
