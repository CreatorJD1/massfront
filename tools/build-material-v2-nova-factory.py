"""Build the Nova Factory Material V2 structure benchmark in Blender.

The source remains an authored hierarchy. A separate bake step joins evaluated
parts into one runtime stream, creates unique UV0, and writes packed maps/LODs.
Broad walls stay quiet; complexity is concentrated around the production bay,
roof plant, structural load paths and control tower.
"""
import bpy, math, os
from mathutils import Vector

ROOT=os.path.abspath(os.path.join(os.path.dirname(__file__),'..'))
OUT=os.path.join(ROOT,'source-media','material-v2','nova-factory-v2')
os.makedirs(OUT,exist_ok=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)

def material(name,color,metallic,roughness,emission=None,strength=0):
    m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True
    bs=m.node_tree.nodes.get('Principled BSDF')
    bs.inputs['Base Color'].default_value=(*color,1)
    bs.inputs['Metallic'].default_value=metallic;bs.inputs['Roughness'].default_value=roughness
    if emission:
        bs.inputs['Emission Color'].default_value=(*emission,1);bs.inputs['Emission Strength'].default_value=strength
    return m

def image_material(name,path):
    m=bpy.data.materials.new(name);m.use_nodes=True
    nodes=m.node_tree.nodes;links=m.node_tree.links;bs=nodes.get('Principled BSDF')
    im=nodes.new('ShaderNodeTexImage');im.image=bpy.data.images.load(path,check_existing=True);im.interpolation='Linear'
    links.new(im.outputs['Color'],bs.inputs['Base Color']);bs.inputs['Metallic'].default_value=.28;bs.inputs['Roughness'].default_value=.34
    return m

MAT={
 'armor':material('MF2_ARMOR',(.085,.20,.46),.70,.36),
 'primary':material('MF2_TEAM_PRIMARY',(.025,.12,.36),.67,.33),
 'secondary':material('MF2_TEAM_SECONDARY',(.96,.55,.012),.50,.33),
 'structure':material('MF2_STRUCTURE',(.34,.40,.49),.94,.23),
 'trim':material('MF2_TRIM',(.66,.72,.79),.97,.16),
 'edge':material('MF2_EDGE_STEEL',(.50,.57,.65),.98,.13),
 'machine':material('MF2_MACHINE',(.018,.026,.038),.84,.58),
 'weapon':material('MF2_WEAPON',(.08,.13,.21),.94,.20),
 'glass':material('MF2_GLASS',(.006,.055,.095),.12,.08,(0,.42,.68),.32),
 'energy':material('MF2_ENERGY',(.01,.16,.24),.18,.18,(0,.68,1),1.0),
}
MAT['badge']=image_material('MF2_FACTION_BADGE',os.path.join(ROOT,'assets','factions','nova_icon_256.png'))

asset=bpy.data.collections.new('MF2_NovaFactory');bpy.context.scene.collection.children.link(asset)
root=bpy.data.objects.new('nova_factory_root',None);asset.objects.link(root)

def move(obj):
    for c in list(obj.users_collection):c.objects.unlink(obj)
    asset.objects.link(obj);obj.parent=root;return obj

def finish(obj,mat,bevel=0,smooth=False):
    move(obj);obj.data.materials.append(MAT[mat]);bpy.context.view_layer.objects.active=obj;obj.select_set(True)
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    if bevel:
        mod=obj.modifiers.new('Authored edge hierarchy','BEVEL');mod.width=bevel;mod.segments=2;mod.limit_method='ANGLE'
        if mat in ('armor','primary','secondary'):
            obj.data.materials.append(MAT['edge']);mod.material=1
    if smooth:
        for p in obj.data.polygons:p.use_smooth=True
    obj.select_set(False);return obj

def box(name,loc,size,mat='armor',bevel=.22,rot=(0,0,0)):
    bpy.ops.mesh.primitive_cube_add(location=loc,rotation=rot);o=bpy.context.object;o.name=name;o.scale=(size[0]/2,size[1]/2,size[2]/2)
    return finish(o,mat,bevel)

def cyl(name,loc,radius,depth,mat='structure',verts=16,axis='Z',bevel=.10):
    rot=(0,0,0)
    if axis=='X':rot=(0,math.pi/2,0)
    elif axis=='Y':rot=(math.pi/2,0,0)
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts,radius=radius,depth=depth,location=loc,rotation=rot)
    o=bpy.context.object;o.name=name;return finish(o,mat,bevel,True)

def pipe(name,a,b,r=.42,mat='machine'):
    a,b=Vector(a),Vector(b);v=b-a;mid=(a+b)*.5
    bpy.ops.mesh.primitive_cylinder_add(vertices=12,radius=r,depth=v.length,location=mid)
    o=bpy.context.object;o.name=name;o.rotation_euler=v.to_track_quat('Z','Y').to_euler();return finish(o,mat,.05,True)

def socket(name,loc):
    o=bpy.data.objects.new(name,None);asset.objects.link(o);o.parent=root;o.location=loc;o.empty_display_type='ARROWS';o.empty_display_size=1.2

def decal(name,loc,size,rot=(0,0,0)):
    bpy.ops.mesh.primitive_plane_add(size=2,location=loc,rotation=rot);o=bpy.context.object;o.name=name;o.scale=(size[0]/2,size[1]/2,1)
    return finish(o,'badge',0)

# Foundation and load-bearing plinth. Every upper mass visibly terminates here.
box('foundation',(0,0,1.2),(66,52,2.4),'structure',.65)
box('foundation_reveal',(0,0,2.65),(62,48,1.2),'machine',.28)
box('assembly_floor',(8,0,3.45),(44,35,1.0),'trim',.18)
for x in (-27,27):
    for y in (-20,20):cyl('anchor_%s_%s'%(x,y),(x,y,3.2),1.7,1.4,'machine',12,'Z',.08)

# Main hall: a calm armored shell, with real setbacks and connected buttresses.
box('hall_core',(-8,0,12.0),(37,40,17),'armor',1.15)
box('hall_roof',(-8,0,21.2),(40,43,2.2),'primary',.55)
for side in (-1,1):
    y=side*20.1
    for x in (-21,-10,1):
        box('wall_buttress_%s_%s'%(side,x),(x,y,10.0),(5.8,3.2,15.5),'structure',.42)
        box('wall_key_%s_%s'%(side,x),(x,side*21.75,13.2),(3.2,.30,4.6),'primary',.08)
    box('wall_role_bar_%s'%side,(-7.5,side*21.92,18.2),(21,.20,.58),'secondary',.05)

# Deep production mouth on +X. Side pylons/header surround a recessed interior;
# the bay is not a dark square pasted onto a solid wall.
box('bay_interior',(12.0,0,11.0),(1.0,27.0,13.6),'machine',.10)
box('bay_header',(15.0,0,19.0),(8.0,30.5,4.6),'structure',.45)
for side in (-1,1):
    box('bay_pylon_%s'%side,(15.0,side*15.0,10.4),(8.0,5.0,15.8),'structure',.55)
    box('bay_armor_%s'%side,(19.2,side*15.0,11.0),(3.0,4.2,11.8),'primary',.34)
    box('bay_guide_%s'%side,(20.75,side*13.1,9.8),(.24,1.0,8.5),'energy',.04)
box('bay_ramp',(22.0,0,3.35),(15.5,28.0,.9),'structure',.18,(0,-.055,0))
for y in (-11,-5.5,0,5.5,11):box('ramp_track_%s'%y,(22.1,y,3.80),(15.2,.40,.16),'machine',.03,(0,-.055,0))

# Visible production gantry and assembly machinery live inside the mouth.
for y in (-9.5,9.5):
    box('gantry_column_%s'%y,(8.5,y,10.0),(2.0,2.0,13.0),'trim',.20)
    pipe('gantry_hydraulic_%s'%y,(8.5,y,7.0),(13.5,y,10.0),.48,'machine')
box('gantry_beam',(9.0,0,16.4),(2.2,21.0,2.2),'trim',.22)
box('assembly_cradle',(8.0,0,5.2),(10.0,18.0,2.5),'weapon',.35)
for y in (-6.2,6.2):cyl('cradle_roller_%s'%y,(9.0,y,6.8),1.2,7.5,'machine',14,'Y',.08)

# Command tower overlaps and grows out of the rear shell; no free-floating pods.
box('control_tower',(-22.5,-12.0,16.0),(13.5,14.0,25.0),'structure',.85)
box('control_crown',(-22.5,-12.0,29.0),(15.5,16.0,2.0),'primary',.48)
for z in (19.0,23.0):
    box('control_glass_front_%s'%z,(-15.65,-12.0,z),(.26,9.5,2.6),'glass',.05)
    box('control_glass_side_%s'%z,(-22.5,-19.08,z),(7.8,.26,2.6),'glass',.05)
box('control_role_plate',(-14.95,-12.0,27.0),(.22,7.0,1.2),'secondary',.04)

# Roof utility plant clusters at intersections and remains supported.
box('roof_machine_bed',(-2.0,4.0,23.1),(22.0,15.0,1.6),'machine',.30)
for y in (-1.0,4.0,9.0):
    box('roof_vent_%s'%y,(-3.0,y,24.8),(13.0,3.3,2.2),'structure',.24)
    for x in (-7,-3,1):box('roof_louver_%s_%s'%(x,y),(x,y-1.72,24.8),(1.6,.18,1.2),'machine',.03)
for side in (-1,1):
    x=-15.0
    cyl('exhaust_guard_%s'%side,(x,side*9.2,24.0),2.6,3.0,'structure',16,'Z',.18)
    cyl('exhaust_%s'%side,(x,side*9.2,29.2),1.35,8.0,'machine',16,'Z',.10)
    cyl('exhaust_rim_%s'%side,(x,side*9.2,33.25),1.7,.65,'trim',16,'Z',.05)
box('reactor_bed',(-16.0,9.0,23.2),(9.0,9.0,1.8),'structure',.30)
cyl('reactor_core',(-16.0,9.0,26.0),3.0,4.5,'machine',20,'Z',.18)
# Energy is visible through a narrow inspection band, not painted across the
# whole reactor can. This prevents the roof plant reading as a cyan toy.
cyl('reactor_window',(-16.0,9.0,26.2),3.08,.34,'energy',20,'Z',.035)
for a in range(0,360,45):
    q=math.radians(a);box('reactor_clamp_%s'%a,(-16+math.cos(q)*3.8,9+math.sin(q)*3.8,26.0),(1.1,1.1,3.2),'trim',.10)

# Sensor mast, service pipes and restrained status lighting.
cyl('sensor_base',(-23.0,-12.0,30.4),2.4,1.2,'structure',18,'Z',.10)
cyl('sensor_mast',(-23.0,-12.0,35.0),.65,8.5,'machine',12,'Z',.05)
cyl('sensor_head',(-23.0,-12.0,39.0),2.0,1.3,'structure',18,'Z',.10)
box('sensor_lens',(-20.96,-12.0,39.0),(.20,1.35,.72),'glass',.035)
pipe('service_pipe_a',(-25,10,4.0),(-25,10,18.0),.52,'machine')
pipe('service_pipe_b',(-25,10,18.0),(-18,10,22.0),.52,'machine')
for y in (-15,-5,5,15):box('status_strip_%s'%y,(-26.7,y,8.0),(.22,4.0,.48),'energy',.03)

# Established Nova crest on a backed wall panel and the roof identification pad.
box('badge_back_side',(-26.95,0,15.0),(.18,7.4,7.4),'machine',.04)
decal('badge_side',(-27.06,0,15.0),(5.8,5.8),(0,math.pi/2,0))
box('badge_back_roof',(-8.0,-10.5,22.45),(7.4,7.4,.14),'machine',.04)
decal('badge_roof',(-8.0,-10.5,22.54),(5.8,5.8))

socket('socket_production_exit',(25,0,4.0));socket('socket_rally',(31,0,4.0))
socket('socket_utility_roof',(-2,4,25));socket('socket_sensor',(-23,-12,39.8))
socket('socket_defense_left',(0,-22,22));socket('socket_defense_right',(0,22,22));socket('socket_power',(-16,9,28))

# Review scene is saved with the source but excluded from GLB export.
ground_mat=material('Review Ground',(.22,.27,.33),.08,.82)
bpy.ops.mesh.primitive_plane_add(size=190,location=(0,0,-.15));ground=bpy.context.object;ground.name='review_ground';ground.data.materials.append(ground_mat)
world=bpy.context.scene.world or bpy.data.worlds.new('World');bpy.context.scene.world=world;world.use_nodes=True
world.node_tree.nodes['Background'].inputs['Color'].default_value=(.15,.20,.28,1);world.node_tree.nodes['Background'].inputs['Strength'].default_value=.70
def aim(o,target):o.rotation_euler=(Vector(target)-o.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add(location=(84,-92,67));cam=bpy.context.object;aim(cam,(0,0,12));cam.data.lens=58;bpy.context.scene.camera=cam
for typ,loc,energy,color,size in [('AREA',(28,-38,70),4500,(1,.90,.74),22),('AREA',(-50,32,42),2800,(.35,.65,1),20),('AREA',(-20,-20,55),2400,(.35,.78,1),14)]:
    bpy.ops.object.light_add(type=typ,location=loc);l=bpy.context.object;l.data.energy=energy;l.data.color=color;l.data.shape='DISK';l.data.size=size;aim(l,(0,0,13))
scene=bpy.context.scene;scene.render.engine='BLENDER_EEVEE_NEXT';scene.render.resolution_x=1024;scene.render.resolution_y=1024;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.render.filepath=os.path.join(OUT,'nova-factory-v2-review.png');scene.view_settings.look='AgX - Medium High Contrast';scene.view_settings.exposure=1.05
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT,'nova-factory-v2.blend'));bpy.ops.render.render(write_still=True)
bpy.ops.object.select_all(action='DESELECT')
for o in asset.objects:o.select_set(True)
bpy.context.view_layer.objects.active=root
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT,'nova-factory-v2.glb'),export_format='GLB',use_selection=True,export_apply=True,export_materials='EXPORT',export_cameras=False,export_lights=False,export_yup=True)
print('MATERIAL_V2_NOVA_FACTORY_OK '+OUT)
