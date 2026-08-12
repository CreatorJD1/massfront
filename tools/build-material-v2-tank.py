"""Build the first Blender-authored MASSFRONT Material V2 benchmark.

This is intentionally a source asset, not runtime CSG. The script creates a
repeatable .blend, a hierarchy-preserving GLB and a neutral review render. The
game importer owns flattening/LOD policy later, while Blender remains the place
where bevel continuity, material boundaries, sockets and authored proportions
can be inspected and revised.
"""
import bpy, math, os
from mathutils import Vector

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
OUT = os.path.join(ROOT, 'source-media', 'material-v2', 'nova-heavy-tank-v2')
os.makedirs(OUT, exist_ok=True)

bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
for datablocks in (bpy.data.meshes, bpy.data.curves, bpy.data.materials, bpy.data.cameras, bpy.data.lights):
    pass

def material(name, color, metallic, roughness, emission=None, strength=0.0):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1.0)
    m.use_nodes = True
    bs = m.node_tree.nodes.get('Principled BSDF')
    bs.inputs['Base Color'].default_value = (*color, 1.0)
    bs.inputs['Metallic'].default_value = metallic
    bs.inputs['Roughness'].default_value = roughness
    if emission:
        bs.inputs['Emission Color'].default_value = (*emission, 1.0)
        bs.inputs['Emission Strength'].default_value = strength
    return m

def image_material(name, path, metallic=.24, roughness=.34):
    """Use established faction art as an offline-baked armor badge.

    The image is never another runtime sampler: Cycles folds it into the shared
    BaseAO atlas. A deliberate dark backing plate makes the transparent square
    read as an installed identification panel rather than a floating sticker.
    """
    m=bpy.data.materials.new(name);m.use_nodes=True
    nodes=m.node_tree.nodes;links=m.node_tree.links
    bs=nodes.get('Principled BSDF');im=nodes.new('ShaderNodeTexImage')
    im.name='MF2_AUTHORED_BADGE';im.image=bpy.data.images.load(path,check_existing=True)
    im.interpolation='Linear'
    links.new(im.outputs['Color'],bs.inputs['Base Color'])
    bs.inputs['Metallic'].default_value=metallic
    bs.inputs['Roughness'].default_value=roughness
    return m

MAT = {
    # The first benchmark used near-black navy everywhere. It technically
    # separated materials but collapsed to one dark silhouette on a phone.
    # These values follow the reference grammar: readable blue painted armor,
    # pale exposed alloy, deep mechanical cavities and restrained optics.
    'armor': material('MF2_ARMOR', (.080, .185, .405), .72, .38),
    'primary': material('MF2_TEAM_PRIMARY', (.025, .125, .365), .66, .34),
    'secondary': material('MF2_TEAM_SECONDARY', (.92, .54, .012), .50, .34),
    'structure': material('MF2_STRUCTURE', (.31, .37, .45), .92, .25),
    'trim': material('MF2_TRIM', (.61, .67, .73), .96, .17),
    'edge': material('MF2_EDGE_STEEL', (.49, .55, .62), .98, .12),
    'machine': material('MF2_MACHINE', (.018, .026, .039), .82, .56),
    'weapon': material('MF2_WEAPON', (.09, .14, .22), .94, .19),
    'glass': material('MF2_GLASS', (.008, .045, .080), .12, .08, (0.0, .40, .63), .34),
    'energy': material('MF2_ENERGY', (.012, .16, .24), .20, .20, (0.0, .66, 1.0), .92),
}
NOVA_ICON=os.path.join(ROOT,'assets','factions','nova_icon_256.png')
# The crest already contains Nova's authored colors. Keeping it outside the
# runtime team-mask names prevents faction tint from washing the art into a
# solid cyan rectangle.
MAT['badge']=image_material('MF2_FACTION_BADGE',NOVA_ICON)

asset = bpy.data.collections.new('MF2_NovaHeavyTank')
bpy.context.scene.collection.children.link(asset)
root = bpy.data.objects.new('nova_heavy_tank_root', None)
asset.objects.link(root)

def move_to_asset(obj):
    for c in list(obj.users_collection): c.objects.unlink(obj)
    asset.objects.link(obj)
    obj.parent = root
    return obj

def finish(obj, mat, bevel=0.0, smooth=False):
    move_to_asset(obj)
    obj.data.materials.append(MAT[mat])
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel:
        mod = obj.modifiers.new('Authored edge hierarchy', 'BEVEL')
        mod.width = bevel; mod.segments = 2; mod.limit_method = 'ANGLE'
        # Painted armor exposes a dedicated alloy only on generated bevel
        # faces. Broad plates therefore stay quiet while real chamfers catch
        # light and age like manufactured steel.
        if mat in ('armor','primary','secondary'):
            obj.data.materials.append(MAT['edge']);mod.material=1
    if smooth:
        for p in obj.data.polygons: p.use_smooth = True
    obj.select_set(False)
    return obj

def box(name, loc, size, mat='armor', bevel=.22, rot=(0,0,0)):
    bpy.ops.mesh.primitive_cube_add(location=loc, rotation=rot)
    o=bpy.context.object;o.name=name;o.scale=(size[0]/2,size[1]/2,size[2]/2)
    return finish(o,mat,bevel)

def cyl(name, loc, radius, depth, mat='structure', vertices=16, axis='Z', bevel=.10):
    rot=(0,0,0)
    if axis=='X': rot=(0,math.pi/2,0)
    elif axis=='Y': rot=(math.pi/2,0,0)
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=loc, rotation=rot)
    o=bpy.context.object;o.name=name
    return finish(o,mat,bevel,True)

def wedge(name, loc, length, rear_w, front_w, height, mat='armor', bevel=.22):
    x0=-length/2;x1=length/2;rb=rear_w/2;fb=front_w/2
    verts=[(x0,-rb,0),(x1,-fb,0),(x1,fb,0),(x0,rb,0),
           (x0+1,-rb*.83,height),(x1-1,-fb*.80,height*.78),
           (x1-1,fb*.80,height*.78),(x0+1,rb*.83,height)]
    faces=[(0,1,2,3),(4,7,6,5),(0,4,5,1),(1,5,6,2),(2,6,7,3),(3,7,4,0)]
    me=bpy.data.meshes.new(name+'_mesh');me.from_pydata(verts,[],faces);me.update()
    o=bpy.data.objects.new(name,me);asset.objects.link(o);o.location=loc;o.parent=root
    me.materials.append(MAT[mat])
    if bevel:
        mod=o.modifiers.new('Continuous bevel','BEVEL');mod.width=bevel;mod.segments=2;mod.limit_method='ANGLE'
        if mat in ('armor','primary','secondary'):
            me.materials.append(MAT['edge']);mod.material=1
    return o

def empty_socket(name, loc):
    o=bpy.data.objects.new(name,None);asset.objects.link(o);o.parent=root;o.location=loc
    o.empty_display_type='ARROWS';o.empty_display_size=1.0;return o

def decal(name, loc, size, rot=(0,0,0)):
    bpy.ops.mesh.primitive_plane_add(size=2,location=loc,rotation=rot)
    o=bpy.context.object;o.name=name;o.scale=(size[0]/2,size[1]/2,1)
    return finish(o,'badge',0,False)

def bolt(name, loc, axis='Z', radius=.16, depth=.16):
    """A restrained fastener used only at authored armor interfaces.

    The reference detail comes from understandable construction, not random
    greeble coverage. Keeping these in small repeated sets makes the vehicle
    feel assembled while broad plates remain quiet at RTS distance.
    """
    return cyl(name,loc,radius,depth,'trim',10,axis,.025)

# Chassis load path: tracks -> lower frame -> upper armor -> turret race.
wedge('chassis_lower',(0,0,2.2),35,17.0,14.0,5.8,'structure',.34)
wedge('hull_main',(-1.6,0,6.3),29,14.0,10.8,5.6,'armor',.42)
box('hull_spine',(-4.2,0,11.0),(16,7.6,2.2),'primary',.30)
box('glacis_main',(11.8,0,8.7),(10.2,12.8,3.0),'armor',.38,(0,-.17,0))
for y in (-4.2,0,4.2):
    box('glacis_rib_%s'%str(y).replace('-','m'),(14.0,y,10.25),(5.7,1.05,.62),'secondary' if y==0 else 'structure',.12)
# Broad role panels carry the high-contrast yellow language from the reference
# without tinting the whole vehicle. They intersect the glacis instead of
# floating as decals and remain visible at the tactical camera.
for y in (-4.15,4.15):
    box('glacis_warning_%s'%str(y).replace('-','m'),(11.95,y,10.28),(4.5,2.15,.20),'secondary',.05,(0,-.17,0))

# Track pods and suspension. Linked wheel meshes prove GLB node instancing.
wheel_mesh=None
for side in (-1,1):
    y=side*9.2
    box('track_carrier_%s'%side,(0,y,3.9),(37,6.2,7.2),'machine',.55)
    box('track_skirt_%s'%side,(0,side*11.75,7.7),(32,1.45,3.2),'armor',.28)
    for k,x in enumerate((-14,-8.5,-3,2.5,8,13.5)):
        if wheel_mesh is None:
            w=cyl('roadwheel_master',(x,y,3.8),2.55,1.25,'structure',20,'Y',.12);wheel_mesh=w.data
        else:
            w=bpy.data.objects.new('roadwheel_%s_%s'%(side,k),wheel_mesh);asset.objects.link(w);w.parent=root;w.location=(x,y,3.8)
        cyl('hub_%s_%s'%(side,k),(x,side*12.95,3.8),.92,.28,'trim',14,'Y',.06)
        cyl('hub_cap_%s_%s'%(side,k),(x,side*13.13,3.8),.34,.16,'machine',12,'Y',.035)
    for k,x in enumerate(range(-16,18,3)):
        box('tread_top_%s_%02d'%(side,k),(x,y,8.0),(2.35,6.7,.72),'structure',.10)
        box('tread_bottom_%s_%02d'%(side,k),(x,y,-.05),(2.35,6.7,.72),'structure',.10)
    for k,x in enumerate((-11,0,11)):
        box('skirt_lock_%s_%s'%(side,k),(x,side*12.58,8.0),(3.0,.62,.74),'secondary',.10)
    # Four quiet macro panels give the long skirt a manufactured armor rhythm.
    # Complexity stays at the suspension/armor interface instead of becoming
    # full-body micro-noise that disappears at the RTS camera.
    for k,x in enumerate((-11.5,-4.0,3.5,11.0)):
        panel_mat='primary' if k==2 else 'armor'
        box('skirt_macro_%s_%s'%(side,k),(x,side*12.62,7.35),(5.65,.38,2.25),panel_mat,.13)
        if k in (0,3):
            box('skirt_role_bar_%s_%s'%(side,k),(x,side*12.84,6.65),(3.15,.18,.24),'secondary',.04)
        for z in (6.60,8.10):
            bolt('skirt_bolt_%s_%s_%s'%(side,k,z),(x-2.15,side*12.89,z),'Y',.14,.14)
            bolt('skirt_bolt_b_%s_%s_%s'%(side,k,z),(x+2.15,side*12.89,z),'Y',.14,.14)
    # Exposed alloy rails frame the painted skirt like manufactured armor.
    # They replace the glowing wheel row that made the prototype look toy-like.
    box('skirt_upper_trim_%s'%side,(0,side*12.88,8.82),(31.4,.24,.24),'trim',.05)
    box('skirt_lower_trim_%s'%side,(0,side*12.88,5.95),(31.4,.24,.20),'trim',.04)

# Turret and supported weapon system.
cyl('turret_race',(-2.8,0,11.6),7.5,2.0,'structure',24,'Z',.18)
wedge('turret_body',(-1.0,0,12.1),17.0,12.8,9.4,5.0,'weapon',.42)
box('turret_crown',(-4.0,0,17.1),(7.8,7.0,1.25),'primary',.24)
box('command_sensor_mount',(-4.4,0,18.05),(4.2,3.8,.70),'trim',.20)
box('command_sensor',(-4.4,0,18.48),(2.25,1.75,.48),'glass',.18)
box('turret_role_plate',(2.0,0,16.32),(4.0,5.6,.22),'secondary',.06)
# Layered cheek armor breaks the turret into readable weapon, armor and sensor
# masses. These are structural landmarks, not detached decorative greebles.
for side in (-1,1):
    box('turret_cheek_%s'%side,(.5,side*5.15,14.8),(8.6,2.0,2.85),'armor',.30)
    box('turret_cheek_key_%s'%side,(1.0,side*6.20,15.25),(4.8,.30,.48),'primary',.08)
for side in (-1,1):
    y=side*4.6
    box('rangefinder_shell_%s'%side,(-1.4,y,15.0),(6.5,2.5,2.7),'structure',.30)
    box('rangefinder_role_%s'%side,(-1.0,side*5.88,15.0),(3.9,.26,1.15),'secondary',.08)
    box('rangefinder_lens_%s'%side,(1.45,side*5.95,15.15),(1.1,.52,1.2),'glass',.12)
    box('breech_%s'%side,(5.2,side*2.7,14.2),(7.8,3.2,3.6),'weapon',.32)
    cyl('cannon_%s'%side,(17.2,side*2.7,15.0),1.18,23.0,'weapon',20,'X',.09)
    for j,x in enumerate((10.4,16.2,22.0)):
        cyl('barrel_collar_%s_%s'%(side,j),(x,side*2.7,15.0),1.48,1.55,'secondary',20,'X',.08)
    cyl('muzzle_%s'%side,(28.5,side*2.7,15.0),1.62,3.3,'structure',20,'X',.12)
    cyl('bore_%s'%side,(30.2,side*2.7,15.0),.76,.24,'machine',20,'X',.02)
    box('recoil_rail_%s'%side,(8.3,side*2.7,12.7),(8.0,1.05,1.0),'machine',.10)
    for x in (1.8,5.4):
        bolt('turret_bolt_%s_%s'%(side,x),(x,side*6.28,14.6),'Y',.17,.18)

# Rear power and believable integrated service systems.
box('reactor_armor',(-14.2,0,9.5),(6.0,10.6,4.6),'primary',.44)
for y in (-3.3,0,3.3): box('reactor_vent_'+str(y),(-15.0,y,12.1),(3.4,1.4,.65),'machine',.10)
for y in (-3.35,3.35):
    box('reactor_warning_'+str(y),(-12.9,y,12.36),(2.8,1.55,.20),'secondary',.045)
for side in (-1,1):
    y=side*6.4
    box('exhaust_guard_%s'%side,(-14.7,y,10.9),(4.7,2.7,3.4),'structure',.32)
    cyl('exhaust_stack_%s'%side,(-15.2,y,14.0),.75,4.2,'machine',16,'Z',.10)
    box('front_lamp_%s'%side,(15.0,side*5.7,10.2),(2.2,1.15,1.35),'energy',.22)

# Small authored clusters stay around interfaces rather than covering armor.
for y in (-5.2,5.2):
    for x in (-8.5,-4.5,.0): box('service_latch_%s_%s'%(x,y),(x,y,12.35),(2.4,1.15,.45),'structure',.08)
for y in (-2.0,0,2.0): box('engine_fin_'+str(y),(-11.8,y,13.2),(4.8,.62,1.35),'machine',.08)
cyl('sensor_dish_base',(-5.0,-2.3,19.1),1.05,.65,'structure',20,'Z',.08)
cyl('sensor_dish',(-5.0,-2.3,19.52),1.05,.24,'glass',20,'Z',.04)

# The actual established Nova crest is baked into three identification panels.
# Top and side placements remain legible in Arsenal and tactical three-quarter
# cameras while preserving broad, quiet armor around them.
# The forward glacis has an intentional quiet panel between its structural
# ribs. Mount the upward-facing crest there; the former turret-crown location
# sat beneath the command sensor and disappeared in the final joined mesh.
box('nova_badge_back_top',(11.55,2.15,10.23),(3.15,2.70,.13),'machine',.06,(0,-.17,0))
decal('nova_badge_top',(11.54,2.15,10.32),(2.62,2.22),(0,-.17,0))
for side in (-1,1):
    y=side*12.86;rot=(-side*math.pi/2,0,0)
    box('nova_badge_back_%s'%side,(-4.0,y,7.55),(3.35,.14,2.65),'machine',.05)
    decal('nova_badge_%s'%side,(-4.0,side*12.95,7.55),(2.55,2.05),rot)

# Named metadata nodes survive GLB export and are validated by the importer.
empty_socket('socket_weapon_primary',(7.5,-2.7,15.0))
empty_socket('socket_weapon_secondary',(7.5,2.7,15.0))
empty_socket('socket_sensor',(-5.0,-2.3,19.7))
empty_socket('socket_reactor',(-14.2,0,10.0))
empty_socket('socket_armor_left',(0,-11.8,8.0))
empty_socket('socket_armor_right',(0,11.8,8.0))

# Review scene stays in the .blend but is excluded from selected GLB export.
ground_mat=material('Review Ground',(.27,.31,.36),.10,.78)
bpy.ops.mesh.primitive_plane_add(size=180, location=(0,0,-.5));ground=bpy.context.object;ground.name='review_ground';ground.data.materials.append(ground_mat)
world=bpy.context.scene.world or bpy.data.worlds.new('World');bpy.context.scene.world=world;world.use_nodes=True
world.node_tree.nodes['Background'].inputs['Color'].default_value=(.18,.23,.31,1);world.node_tree.nodes['Background'].inputs['Strength'].default_value=.70

def point_camera(obj, target):
    obj.rotation_euler=(Vector(target)-obj.location).to_track_quat('-Z','Y').to_euler()

bpy.ops.object.camera_add(location=(52,-59,37));cam=bpy.context.object;cam.name='review_camera';point_camera(cam,(0,0,8));cam.data.lens=58;bpy.context.scene.camera=cam
bpy.ops.object.light_add(type='AREA',location=(15,-24,42));key=bpy.context.object;key.name='Key';key.data.energy=3900;key.data.shape='DISK';key.data.size=18;point_camera(key,(0,0,7))
bpy.ops.object.light_add(type='AREA',location=(-25,28,23));fill=bpy.context.object;fill.name='Fill';fill.data.energy=2350;fill.data.color=(.48,.68,1.0);fill.data.size=15;point_camera(fill,(0,0,8))
bpy.ops.object.light_add(type='AREA',location=(-20,-8,32));rim=bpy.context.object;rim.name='Rim';rim.data.energy=2300;rim.data.color=(.42,.78,1.0);rim.data.size=10;point_camera(rim,(0,0,10))

scene=bpy.context.scene
scene.render.engine='BLENDER_EEVEE_NEXT';scene.render.resolution_x=1024;scene.render.resolution_y=1024;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.render.filepath=os.path.join(OUT,'nova-heavy-tank-v2-review.png')
scene.render.film_transparent=False
scene.view_settings.look='AgX - Medium High Contrast'
scene.view_settings.exposure=1.18
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT,'nova-heavy-tank-v2.blend'))
bpy.ops.render.render(write_still=True)

bpy.ops.object.select_all(action='DESELECT')
for o in asset.objects: o.select_set(True)
bpy.context.view_layer.objects.active=root
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT,'nova-heavy-tank-v2.glb'),export_format='GLB',use_selection=True,
    export_apply=True,export_materials='EXPORT',export_cameras=False,export_lights=False,export_yup=True)
print('MATERIAL_V2_TANK_OK '+OUT)
