"""Bake the authored Nova Factory into Material V2 runtime data.

Creates one joined mesh, unique UV0, the three packed 1024 maps, named socket
metadata and an offline LOD1. Build-only position/object-normal buffers drive
stable wear and micro-surface projection without adding runtime samplers.
"""
import bpy, os, math
import numpy as np

ROOT=os.path.abspath(os.path.join(os.path.dirname(__file__),'..'))
OUT=os.path.join(ROOT,'source-media','material-v2','nova-factory-v2')
bpy.ops.wm.open_mainfile(filepath=os.path.join(OUT,'nova-factory-v2.blend'))
scene=bpy.context.scene;src=bpy.data.collections.get('MF2_NovaFactory')
if not src:raise RuntimeError('MF2_NovaFactory collection missing')
bake_col=bpy.data.collections.new('MF2_NovaFactoryBake');scene.collection.children.link(bake_col)
dg=bpy.context.evaluated_depsgraph_get();dups=[]
for o in src.objects:
    if o.type!='MESH':continue
    ev=o.evaluated_get(dg);me=bpy.data.meshes.new_from_object(ev,preserve_all_data_layers=True,depsgraph=dg)
    d=bpy.data.objects.new('bake_'+o.name,me);bake_col.objects.link(d);d.matrix_world=o.matrix_world.copy();dups.append(d)
if not dups:raise RuntimeError('no source meshes')
bpy.ops.object.select_all(action='DESELECT')
for d in dups:d.select_set(True)
bpy.context.view_layer.objects.active=dups[0];bpy.ops.object.join();fac=bpy.context.object;fac.name='nova_factory_v2_baked'
bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
for slot in fac.material_slots:
    if slot.material:slot.material=slot.material.copy()

bpy.context.view_layer.objects.active=fac;fac.select_set(True);bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.smart_project(angle_limit=math.radians(67),island_margin=.006,area_weight=.40,correct_aspect=True,scale_to_bounds=False)
bpy.ops.uv.pack_islands(rotate=True,margin=.006);bpy.ops.object.mode_set(mode='OBJECT')

SIZE=1024;scene.render.engine='CYCLES';scene.cycles.samples=8;scene.cycles.use_denoising=False
scene.render.bake.margin=12;scene.render.bake.use_clear=True;scene.render.bake.target='IMAGE_TEXTURES'
def image(name,noncolor=True):
    im=bpy.data.images.new(name,width=SIZE,height=SIZE,alpha=True,float_buffer=False)
    if noncolor:im.colorspace_settings.name='Non-Color'
    return im
def target(im):
    for mat in fac.data.materials:
        mat.use_nodes=True;nodes=mat.node_tree.nodes;n=nodes.get('MF2_BAKE_TARGET') or nodes.new('ShaderNodeTexImage')
        n.name='MF2_BAKE_TARGET';n.image=im
        for x in nodes:x.select=False
        n.select=True;nodes.active=n
def bake(im,kind,pass_filter=None):
    target(im);kw={'type':kind,'margin':12,'use_clear':True}
    if pass_filter is not None:kw['pass_filter']=pass_filter
    bpy.context.view_layer.objects.active=fac;fac.select_set(True);bpy.ops.object.bake(**kw)

base=image('MF2_FactoryBase',False);ao=image('MF2_FactoryAO');normal=image('MF2_FactoryNormal');objnormal=image('MF2_FactoryObjectNormal')
bake(base,'DIFFUSE',{'COLOR'});bake(ao,'AO');scene.render.bake.normal_space='TANGENT';bake(normal,'NORMAL')
scene.render.bake.normal_space='OBJECT';bake(objnormal,'NORMAL');scene.render.bake.normal_space='TANGENT'

surface={}
for mat in fac.data.materials:
    nodes=mat.node_tree.nodes;out=next(n for n in nodes if n.type=='OUTPUT_MATERIAL')
    surface[mat.name]=(out.inputs['Surface'].links[0].from_socket if out.inputs['Surface'].links else None,out)
def flat(mode):
    for mat in fac.data.materials:
        name=mat.name.upper();nodes=mat.node_tree.nodes;links=mat.node_tree.links;old,out=surface[mat.name]
        em=nodes.get('MF2_FLAT_BAKE') or nodes.new('ShaderNodeEmission');em.name='MF2_FLAT_BAKE'
        pri=1.0 if 'TEAM_PRIMARY' in name else 0.0;sec=1.0 if 'TEAM_SECONDARY' in name else 0.0
        if 'FACTION_BADGE' in name:rough,metal,emis=.34,.28,.20
        elif 'EDGE_STEEL' in name:rough,metal,emis=.13,.98,0
        elif 'TRIM' in name:rough,metal,emis=.16,.97,0
        elif 'STRUCTURE' in name:rough,metal,emis=.23,.94,0
        elif 'MACHINE' in name:rough,metal,emis=.58,.84,0
        elif 'WEAPON' in name:rough,metal,emis=.20,.94,0
        elif 'GLASS' in name:rough,metal,emis=.10,.12,.28
        elif 'ENERGY' in name:rough,metal,emis=.20,.18,.62
        elif pri:rough,metal,emis=.33,.67,0
        elif sec:rough,metal,emis=.33,.50,0
        else:rough,metal,emis=.36,.70,0
        em.inputs['Color'].default_value=((metal,pri,sec,1) if mode=='mask' else (rough,emis,0,1));em.inputs['Strength'].default_value=1
        links.new(em.outputs[0],out.inputs['Surface'])
mask=image('MF2_FactoryMask');props=image('MF2_FactoryProps');flat('mask');bake(mask,'EMIT');flat('props');bake(props,'EMIT')

def flat_position():
    for mat in fac.data.materials:
        nodes=mat.node_tree.nodes;links=mat.node_tree.links;old,out=surface[mat.name]
        em=nodes.get('MF2_FLAT_BAKE') or nodes.new('ShaderNodeEmission');tc=nodes.get('MF2_COORD') or nodes.new('ShaderNodeTexCoord')
        for link in list(em.inputs['Color'].links):links.remove(link)
        links.new(tc.outputs['Generated'],em.inputs['Color']);em.inputs['Strength'].default_value=1;links.new(em.outputs[0],out.inputs['Surface'])
position=image('MF2_FactoryPosition');flat_position();bake(position,'EMIT')

def px(im):
    a=np.empty(SIZE*SIZE*4,dtype=np.float32);im.pixels.foreach_get(a);return a.reshape((SIZE,SIZE,4))
B=px(base);A=px(ao);NR=px(normal);ON=px(objnormal);M=px(mask);PR=px(props);POS=px(position)
occupied=M[:,:,3]>.5;edge=(PR[:,:,0]<.145)&(M[:,:,0]>.94)&(PR[:,:,1]<.08)
edge_wear=edge.astype(np.float32)*.48
impact=np.zeros((SIZE,SIZE),dtype=np.float32)
for center,radius in (((.78,.48,.34),(.13,.18,.13)),((.42,.71,.58),(.16,.14,.15)),((.18,.30,.48),(.13,.16,.17))):
    d=np.sqrt(sum(((POS[:,:,a]-center[a])/radius[a])**2 for a in range(3)));impact=np.maximum(impact,np.clip(1-d,0,1)**.62)
damage_ok=occupied&(PR[:,:,1]<.08);wear=np.maximum(edge_wear,np.where(damage_ok& (impact>.025),.56+.44*impact,0))

# Stable triplanar microdetail is folded into the packed maps offline.
micro=bpy.data.images.load(os.path.join(ROOT,'source-media','material-v2','mf_mechanical_microdetail_v2.png'),check_existing=True)
mw,mh=micro.size;raw=np.empty(mw*mh*4,dtype=np.float32);micro.pixels.foreach_get(raw);srcpix=raw.reshape((mh,mw,4))[:,:,0]
on=ON[:,:,:3]*2-1;major=np.argmax(np.abs(on),axis=2);u=np.where(major==0,POS[:,:,1],POS[:,:,0]);v=np.where(major==2,POS[:,:,1],POS[:,:,2])
ix=np.mod((u*17*mw).astype(np.int32),mw);iy=np.mod((v*12*mh).astype(np.int32),mh)
detail=srcpix[iy,ix];dx=srcpix[iy,np.mod(ix+1,mw)]-srcpix[iy,np.mod(ix-1,mw)];dy=srcpix[np.mod(iy+1,mh),ix]-srcpix[np.mod(iy-1,mh),ix]
centered=detail-np.mean(srcpix);detail_ok=occupied&(PR[:,:,1]<.08)&(~edge)

# Large structure panels receive a sparse manufactured seam rhythm. It is
# baked into normals/albedo and therefore fades through mipmaps at distance.
broad=detail_ok&(PR[:,:,0]>=.30)&(PR[:,:,0]<=.40)
cu=np.mod(u*5.0+.13,1.0);cv=np.mod(v*3.5+.29,1.0);du=np.abs(cu-.5);dv=np.abs(cv-.5)
seam=np.maximum(np.exp(-((du/.009)**2)),np.exp(-((dv/.010)**2)))*broad
slope_u=np.sign(cu-.5)*np.exp(-((du/.022)**2))*broad;slope_v=np.sign(cv-.5)*np.exp(-((dv/.024)**2))*broad

baseao=np.empty_like(B);baseao[:,:,:3]=B[:,:,:3]
ao_lift=np.clip(.43+.57*np.sqrt(np.clip(A[:,:,0],0,1)),0,1);baseao[:,:,3]=np.where(occupied,ao_lift,0)
armor=occupied&(PR[:,:,0]>=.32)&(PR[:,:,0]<=.39)&(M[:,:,1]<.08)&(M[:,:,2]<.08)
structure=occupied&(PR[:,:,0]>=.21)&(PR[:,:,0]<=.26)&(M[:,:,0]>.88)
baseao[:,:,:3]=np.where(armor[:,:,None],baseao[:,:,:3]*.20+np.array([.11,.26,.56])[None,None,:]*.80,baseao[:,:,:3])
baseao[:,:,:3]=np.where(structure[:,:,None],baseao[:,:,:3]*.28+np.array([.34,.40,.49])[None,None,:]*.72,baseao[:,:,:3])
chip=.60+.20*np.sin(POS[:,:,0]*157+POS[:,:,2]*83)+.20*np.sin(POS[:,:,1]*211-POS[:,:,0]*57);chip=np.clip(chip,.2,1)
baseao[:,:,:3]*=(1-edge[:,:,None]*(.035+.09*(1-chip[:,:,None])))
baseao[:,:,:3]+=centered[:,:,None]*detail_ok[:,:,None]*.12;baseao[:,:,:3]*=(1-seam[:,:,None]*.36)
baseao[:,:,:3]*=(1-(1-ao_lift)[:,:,None]*detail_ok[:,:,None]*.20);baseao[:,:,:3]=np.clip(baseao[:,:,:3],0,1)
nre=np.empty_like(NR);nre[:,:,0]=np.clip(NR[:,:,0]+dx*detail_ok*.22+slope_u*.08,0,1)
nre[:,:,1]=np.clip(NR[:,:,1]+dy*detail_ok*.22+slope_v*.08,0,1)
nre[:,:,2]=np.clip(PR[:,:,0]+centered*detail_ok*.12-edge.astype(np.float32)*.08+seam*.06,0,1);nre[:,:,3]=PR[:,:,1]
masks=np.empty_like(M);masks[:,:,:3]=M[:,:,:3];masks[:,:,3]=wear

def save(name,data,srgb):
    im=image(name,not srgb);im.pixels.foreach_set(np.asarray(data,dtype=np.float32).reshape(-1));im.update();im.file_format='PNG';im.filepath_raw=os.path.join(OUT,name+'.png');im.save()
save('nova-factory-v2-baseao',baseao,True);save('nova-factory-v2-nre',nre,False);save('nova-factory-v2-masks',masks,False)
for mat in fac.data.materials:
    old,out=surface[mat.name]
    if old:mat.node_tree.links.new(old,out.inputs['Surface'])

sockets=[]
for o in src.objects:
    if o.name.startswith('socket_'):
        # Blender object names are globally unique. Rename the source copy in
        # this temporary bake scene before creating the exported metadata node;
        # otherwise every useful socket silently becomes `socket_name.001`.
        socket_name=o.name;o.name='source_'+socket_name
        s=bpy.data.objects.new(socket_name,None);bake_col.objects.link(s);s.matrix_world=o.matrix_world.copy();sockets.append(s)
def export(obj,path):
    bpy.ops.object.select_all(action='DESELECT');obj.select_set(True)
    for s in sockets:s.select_set(True)
    bpy.context.view_layer.objects.active=obj
    bpy.ops.export_scene.gltf(filepath=path,export_format='GLB',use_selection=True,export_apply=True,export_materials='EXPORT',export_cameras=False,export_lights=False,export_yup=True)
export(fac,os.path.join(OUT,'nova-factory-v2-baked.glb'))
lod=fac.copy();lod.data=fac.data.copy();lod.name='nova_factory_v2_lod1';bake_col.objects.link(lod)
dec=lod.modifiers.new('MF2_FACTORY_LOD1','DECIMATE');dec.decimate_type='COLLAPSE';dec.ratio=.52
if hasattr(dec,'use_collapse_triangulate'):dec.use_collapse_triangulate=True
bpy.context.view_layer.objects.active=lod;lod.select_set(True);bpy.ops.object.modifier_apply(modifier=dec.name)
export(lod,os.path.join(OUT,'nova-factory-v2-lod1.glb'));bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT,'nova-factory-v2-baked.blend'))
tris=lambda o:sum(max(0,len(p.vertices)-2) for p in o.data.polygons)
print('MATERIAL_V2_NOVA_FACTORY_BAKE_OK tris=%d verts=%d lod1_tris=%d lod1_verts=%d'%(tris(fac),len(fac.data.vertices),tris(lod),len(lod.data.vertices)))
