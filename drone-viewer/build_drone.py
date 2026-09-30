"""Photo-guided editable drone. Run in Blender's Scripting workspace.
No external textures or add-ons required. Dimensions are visual estimates.
"""
import bpy, math, os
from mathutils import Vector
from pathlib import Path
OUT = Path(os.environ.get('DRONE_OUTPUT_DIR', str(Path(__file__).resolve().parent)))
OUT.mkdir(parents=True, exist_ok=True)
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
for col in list(bpy.data.collections):
    if col.name != 'Collection': bpy.data.collections.remove(col)
scene = bpy.context.scene
scene.unit_settings.system='METRIC'; scene.unit_settings.length_unit='MILLIMETERS'
scene.render.engine='CYCLES'; scene.cycles.samples=64; scene.cycles.use_denoising=True
scene.render.resolution_x=1600; scene.render.resolution_y=1200; scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG'; scene.render.film_transparent=False
scene.view_settings.view_transform='AgX'
scene.view_settings.look='AgX - Medium High Contrast'
scene.view_settings.exposure=-.3
scene.world.color=(0.12,0.12,0.12)
scene.render.fps=30; scene.frame_start=1; scene.frame_end=240
model=bpy.data.collections.new('DRONE');scene.collection.children.link(model)
studio=bpy.data.collections.new('STUDIO | cameras and lights');scene.collection.children.link(studio)
root=bpy.data.objects.new('DRONE_ROOT | dimensions in metres',None);model.objects.link(root)
root['reference']='User photos, 29 September 2026';root['model_type']='Visual reconstruction; no measured CAD dimensions'
root['nominal_motor_diagonal_mm']=220

def material(name, color, metal=0, rough=.4):
    m=bpy.data.materials.new(name);m.use_nodes=True
    bs=m.node_tree.nodes.get('Principled BSDF');bs.inputs['Base Color'].default_value=(*color,1)
    bs.inputs['Metallic'].default_value=metal;bs.inputs['Roughness'].default_value=rough
    return m
carbon=material('Carbon composite | woven finish',(0.028,0.033,0.038),.25,.38)
# Repeating woven texture packed into .blend and exported with the GLB.
image=bpy.data.images.new('Carbon weave | packed',width=128,height=128)
pixels=[]
for y in range(128):
    for x in range(128):
        a=((x//16+y//16)%2); t=(x%16 if a else y%16)/16
        v=.075+.075*math.sin(t*math.pi)+.012*math.sin((x if a else y)*math.pi/2)
        pixels.extend((v,v*1.08,v*1.16,1))
image.pixels=pixels;image.pack()
n=carbon.node_tree.nodes;l=carbon.node_tree.links
tex=n.new('ShaderNodeTexImage');tex.image=image;tex.extension='REPEAT'
coord=n.new('ShaderNodeTexCoord')
l.new(coord.outputs['UV'],tex.inputs['Vector'])
l.new(tex.outputs['Color'],n.get('Principled BSDF').inputs['Base Color'])
bump=n.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.18;bump.inputs['Distance'].default_value=.00007
l.new(tex.outputs['Color'],bump.inputs['Height']);l.new(bump.outputs['Normal'],n.get('Principled BSDF').inputs['Normal'])
black=material('Matte black polymer',(.018,.021,.025),.05,.38)
red=material('Anodized red motor bells',(.48,.025,.038),.78,.24)
silver=material('Brushed aluminium',(.63,.67,.71),.85,.29)
copper=material('Copper motor windings',(.57,.20,.045),.75,.24)
purple=material('Purple propeller polymer',(.14,.018,.34),.03,.3)
yellow=material('Yellow TPU mounts',(.97,.63,.016),0,.54)
gold=material('Champagne camera side plates',(.65,.46,.23),.7,.32)
board=material('Flight controller PCB',(.035,.11,.09),.18,.44)
glass=material('Camera lens glass',(.012,.038,.054),.7,.11)
strapmat=material('Woven battery strap',(.025,.026,.03),0,.8)
wire_red=material('Power cable red',(.42,.012,.019),0,.38)
led_green=material('Green status LED',(.01,.8,.10),0,.3)
bs=led_green.node_tree.nodes.get('Principled BSDF');bs.inputs['Emission Color'].default_value=(.01,.8,.12,1);bs.inputs['Emission Strength'].default_value=3

def finish(o,name,mat=None,bev=0,smooth=False,parent=root):
    o.name=name
    for c in list(o.users_collection):c.objects.unlink(o)
    model.objects.link(o);o.parent=parent
    if mat:o.data.materials.append(mat)
    if bev:
        mod=o.modifiers.new('Machined edge bevel','BEVEL');mod.width=bev;mod.segments=3
        mod=o.modifiers.new('Weighted corner normals','WEIGHTED_NORMAL')
    if smooth and o.type=='MESH':
        for poly in o.data.polygons:poly.use_smooth=True
    return o

def cube(name,loc,dim,mat,bev=.001,parent=root):
    bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=bpy.context.object;o.dimensions=dim
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    return finish(o,name,mat,bev,parent=parent)

def cylinder(name,loc,radius,depth,mat,vertices=48,parent=root):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices,radius=radius,depth=depth,location=loc)
    return finish(bpy.context.object,name,mat,.00035,True,parent)

def between(name,a,b,r,mat,parent=root):
    a,b=Vector(a),Vector(b);o=cylinder(name,(a+b)/2,r,(b-a).length,mat,24,parent)
    o.rotation_euler=(b-a).to_track_quat('Z','Y').to_euler();return o

def mesh(name,verts,faces,mat,parent=root,bevel=0):
    m=bpy.data.meshes.new(name+' mesh');m.from_pydata(verts,[],faces);m.update()
    o=bpy.data.objects.new(name,m);model.objects.link(o);o.parent=parent;o.data.materials.append(mat)
    if bevel:
        mod=o.modifiers.new('Edge bevel','BEVEL');mod.width=bevel;mod.segments=3
        o.modifiers.new('Normals','WEIGHTED_NORMAL')
    return o

def plate(name,points,z,thickness,mat):
    v=[(x,y,z+t) for t in [-thickness/2,thickness/2] for x,y in points];n=len(points)
    faces=[tuple(range(n-1,-1,-1)),tuple(range(n,n*2))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
    return mesh(name,v,faces,mat,bevel=.00065)

def slot(o,center,size):
    cutter=cube('Temporary plate opening',center,size,black,bev=min(size)*.22)
    bpy.context.view_layer.objects.active=cutter
    bpy.ops.object.modifier_apply(modifier=cutter.modifiers[0].name)
    mod=o.modifiers.new('Through slot','BOOLEAN');mod.operation='DIFFERENCE';mod.object=cutter
    bpy.context.view_layer.objects.active=o
    bpy.ops.object.modifier_apply(modifier=mod.name);bpy.data.objects.remove(cutter,do_unlink=True)

def ring(name,loc,outer,inner,depth,mat,parent=root):
    verts=[];segments=64
    for z in [-depth/2,depth/2]:
        for radius in [outer,inner]:
            verts.extend((radius*math.cos(k*math.tau/segments),radius*math.sin(k*math.tau/segments),z) for k in range(segments))
    faces=[]
    for k in range(segments):
        j=(k+1)%segments
        faces.extend([(k,j,j+128,k+128),(k+64,k+192,j+192,j+64),(k,k+64,j+64,j),(k+128,k+192,j+192,j+128)])
    o=mesh(name,verts,faces,mat,parent=parent,bevel=.00015);o.location=loc
    for p in o.data.polygons:p.use_smooth=True
    return o

def cable(name,points,r,mat):
    cv=bpy.data.curves.new(name,'CURVE');cv.dimensions='3D';cv.resolution_u=16;cv.bevel_depth=r;cv.bevel_resolution=3
    sp=cv.splines.new('BEZIER');sp.bezier_points.add(len(points)-1)
    for p,co in zip(sp.bezier_points,points):p.co=co;p.handle_left_type='AUTO';p.handle_right_type='AUTO'
    o=bpy.data.objects.new(name,cv);model.objects.link(o);o.parent=root;cv.materials.append(mat);return o

# Compact cutout frame and removable upper deck.
outline=[(-.018,-.068),(.018,-.068),(.026,-.049),(.022,.052),(.014,.068),(-.014,.068),(-.022,.052),(-.026,-.049)]
bottom=plate('01 Frame | lower carbon plate',outline,.010,.004,carbon)
top=plate('02 Frame | upper carbon deck',outline,.046,.003,carbon)
slot(top,(0,-.024,.046),(.014,.033,.009));slot(top,(0,.038,.046),(.018,.022,.009))
for y in [-.047,-.012,.021,.051]:
    for x in [-.016,.016]:
        cylinder('Frame spacer', (x,y,.029),.0026,.032,red)
        ring('Deck washer',(x,y,.0479),.0026,.0012,.0005,black)
        ring('Deck socket screw',(x,y,.0485),.0019,.0008,.001,black)

# Arms, exposed motors, winding details and three-blade rotors.
positions=[(-.078,-.078,'FL'),(.078,-.078,'FR'),(-.078,.078,'RL'),(.078,.078,'RR')]
for idx,(x,y,tag) in enumerate(positions):
    a=Vector((x*.14,y*.2,.007));b=Vector((x,y,.007));mid=(a+b)/2;length=(b-a).length
    arm=cube('03 Arm '+tag,mid,(.013,length+.016,.006),carbon,.0012)
    arm.rotation_euler.z=-math.atan2((b-a).x,(b-a).y)
    cylinder('Motor foot '+tag,(x,y,.012),.012,.005,black)
    cylinder('Stator aluminium '+tag,(x,y,.019),.012,.005,silver)
    cylinder('Stator core '+tag,(x,y,.026),.006,.014,black)
    for k in range(12):
        a=k*math.tau/12
        coil=cube('Copper coil '+tag+str(k),(x+.0088*math.cos(a),y+.0088*math.sin(a),.027),(.003,.004,.007),copper,.0006)
        coil.rotation_euler.z=a
    rotor=bpy.data.objects.new('ROTOR_'+tag,None);model.objects.link(rotor);rotor.parent=root;rotor.location=(x,y,.032)
    # Local coordinates for all rotating parts.
    ring('Motor bell '+tag,(0,0,0),.0142,.0125,.010,red,parent=rotor)
    ring('Motor top rim '+tag,(0,0,.005),.0145,.0124,.0016,silver,parent=rotor)
    cylinder('Motor cap '+tag,(0,0,.006),.0068,.0035,red,parent=rotor)
    for k in range(6):
        a=k*math.tau/6
        spoke=cube('Motor vent spoke '+tag+str(k),(.0085*math.cos(a),.0085*math.sin(a),.0065),(.010,.0016,.002),red,.0003,parent=rotor)
        spoke.rotation_euler.z=a
    cylinder('Propeller hub '+tag,(0,0,.0105),.0072,.0045,purple,parent=rotor)
    for blade in range(3):
        angle=blade*math.tau/3+idx*.31;verts=[];rings=33
        handedness=1 if idx in [0,3] else -1
        # Rounded sweep, varying chord and gentle blade pitch; real mesh, no flat triangle props.
        for i in range(rings):
            t=i/(rings-1);r=.0055+t*.057
            width=(.002+.009*math.sin(math.pi*(t*.9+.05)))*(1-.4*t)
            sweep=handedness*.010*t*t;twist=handedness*(.33*(1-t)+.10)
            for k in range(8):
                q=k*math.tau/8;across=math.cos(q)*width
                vx=r;vy=sweep+across;vz=.011+across*math.sin(twist)+math.sin(q)*.00065
                verts.append((vx*math.cos(angle)-vy*math.sin(angle),vx*math.sin(angle)+vy*math.cos(angle),vz))
        faces=[]
        for i in range(rings-1):
            for k in range(8):faces.append((i*8+k,i*8+(k+1)%8,(i+1)*8+(k+1)%8,(i+1)*8+k))
        faces.extend([tuple(range(7,-1,-1)),tuple(range((rings-1)*8,rings*8))])
        o=mesh('Purple blade '+tag+str(blade+1),verts,faces,purple,parent=rotor)
        for poly in o.data.polygons:poly.use_smooth=True
    cylinder('Prop lock nut '+tag,(0,0,.0145),.0037,.005,silver,6,parent=rotor)
    cylinder('Motor shaft '+tag,(0,0,.019),.0017,.003,black,parent=rotor)
    rotor.rotation_euler.z=0;rotor.keyframe_insert('rotation_euler',frame=1,index=2)
    rotor.rotation_euler.z=(1 if idx in [0,3] else -1)*math.tau*24;rotor.keyframe_insert('rotation_euler',frame=240,index=2)
    for fc in rotor.animation_data.action.fcurves:
        for kp in fc.keyframe_points:kp.interpolation='LINEAR'
    cable('Motor cable loom '+tag,[(x,y,.010),(x*.6,y*.6,.011),(x*.16,y*.15,.017)],.0014,black)
    ring('Motor silver sleeve '+tag,(x,y,.021),.0143,.0125,.004,silver)

# Electronics visible inside the frame stack.
for j,z in enumerate([.019,.029,.038]):
    cube('04 Electronics | PCB '+str(j+1),(0,.004,z),(.031,.037,.0016),board,.0005)
    cube('Controller processor '+str(j),(0,.004,z+.0017),(.009,.009,.002),black,.0004)
    for x in [-.011,.011]:
        for y in [-.008,.015]:cube('PCB connector',(x,y,z+.0025),(.003,.005,.003),silver,.0003)
for x in [-.018,.018]:
    cable('Harness',[(x,-.025,.022),(x*.6,.003,.043),(x,.027,.019)],.00065,wire_red)
cylinder('Status diode',(-.02,.003,.015),.0014,.0015,led_green,16)

# Front camera cradle; lenses look toward negative Y.
for x in [-.02,.02]:
    side=cube('05 Camera | gold bracket',(x,-.054,.028),(.0025,.023,.027),gold,.001)
    cylinder('Camera pivot screw',(x,-.051,.028),.002,.002,black,6).rotation_euler.y=math.pi/2
camera=cube('camera housing',(0,-.054,.027),(.024,.02,.022),black,.0028)
lens=cylinder('lens barrel',(0,-.068,.028),.009,.010,black);lens.rotation_euler.x=math.pi/2
lens=cylinder('lens metal rim',(0,-.074,.028),.0072,.0015,silver);lens.rotation_euler.x=math.pi/2
lens=cylinder('optical glass',(0,-.075,.028),.0062,.001,glass);lens.rotation_euler.x=math.pi/2
for x in [-.016,.016]:cube('06 TPU | front bumper',(x,-.067,.011),(.011,.014,.010),yellow,.003)
# Rear connector holder and exposed XT60-style connector.
for x in [-.012,.012]:cube('Rear TPU saddle',(x,.064,.051),(.010,.016,.012),yellow,.003)
cable('Main red power lead',[(.005,.039,.025),(.014,.061,.056),(.012,.064,.083)],.0028,wire_red)
cable('Main black power lead',[(-.005,.039,.025),(-.001,.06,.059),(.003,.064,.083)],.0028,black)
plug=cube('Power connector',(0.008,.065,.086),(.014,.013,.013),black,.0016)
for x in [.004,.011]:cylinder('Connector pin',(x,.065,.093),.0019,.002,gold,16)

# Distinct tall black rear support in the hand-held photos.
finpts=[(-.009,.025),(.009,.025),(.006,.087),(-.006,.090)]
verts=[(x,y,z) for y in [.038,.041] for x,z in finpts]
fin=mesh('07 Rear antenna support',verts,[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],black,bevel=.001)
# Strap arches across the upper deck, leaving the electronics partly visible.
strap_points=[]
for i in range(81):
    a=math.pi*i/80;strap_points.append((.030*math.cos(a),.0,.049+.027*math.sin(a)))
verts=[]
for x,y,z in strap_points:verts.extend([(x,y-.007,z),(x,y+.007,z)])
faces=[(i*2,i*2+1,i*2+3,i*2+2) for i in range(80)]
o=mesh('08 Battery strap',verts,faces,strapmat);sol=o.modifiers.new('Strap thickness','SOLIDIFY');sol.thickness=.0011
for poly in o.data.polygons:poly.use_smooth=True
# TPU rear feet and deck screw heads.
for x in [-.015,.015]:cube('Rear landing pad',(x,.054,.006),(.012,.019,.008),yellow,.0025)
# Planar box UVs maintain a consistent physical weave scale across the frame.
for ob in list(model.objects):
    if ob.type=='MESH' and carbon in list(ob.data.materials):
        uv=ob.data.uv_layers.active or ob.data.uv_layers.new(name='Carbon weave UV')
        for poly in ob.data.polygons:
            normal=poly.normal;axis=max(range(3),key=lambda i:abs(normal[i]))
            axes=[i for i in range(3) if i!=axis]
            for li in poly.loop_indices:
                v=ob.data.vertices[ob.data.loops[li].vertex_index].co
                uv.data[li].uv=(v[axes[0]]/.012,v[axes[1]]/.012)
# Semantic collections keep beginner editing manageable.
categories={name:bpy.data.collections.new(name) for name in ['01 Frame','02 Motors','03 Propellers','04 Electronics','05 Camera','06 Mounts','07 Wiring']}
for col in categories.values():model.children.link(col)
for ob in list(model.objects):
    if ob==root:continue
    name=ob.name.lower()
    if any(word in name for word in ['propeller','purple blade','prop lock']):key='03 Propellers'
    elif any(word in name for word in ['motor','stator','copper','rotor_']):key='02 Motors'
    elif any(word in name for word in ['camera','lens','optical','bracket']):key='05 Camera'
    elif any(word in name for word in ['lead','harness','cable']):key='07 Wiring'
    elif any(word in name for word in ['pcb','processor','connector','diode']):key='04 Electronics'
    elif any(word in name for word in ['tpu','bumper','landing','strap','antenna']):key='06 Mounts'
    else:key='01 Frame'
    model.objects.unlink(ob);categories[key].objects.link(ob)


# Product studio; excluded from GLB so the asset can be dropped into a scene.
def studio_obj(o,name):
    o.name=name
    for c in list(o.users_collection):c.objects.unlink(o)
    studio.objects.link(o);return o
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.001));floor=studio_obj(bpy.context.object,'Studio floor')
floor.data.materials.append(material('Studio graphite',(0.036,.044,.054),.1,.5))
world=bpy.data.worlds.new('Soft studio world');scene.world=world;world.use_nodes=True
world.node_tree.nodes.get('Background').inputs[0].default_value=(.13,.16,.21,1)
world.node_tree.nodes.get('Background').inputs[1].default_value=.5

def area(name,loc,power,size,color):
    data=bpy.data.lights.new(name,'AREA');data.energy=power;data.shape='DISK';data.size=size;data.color=color
    ob=bpy.data.objects.new(name,data);studio.objects.link(ob);ob.location=loc
    ob.rotation_euler=(Vector((0,0,.025))-ob.location).to_track_quat('-Z','Y').to_euler()
area('Key softbox',(.23,-.25,.40),8,.28,(.90,.95,1))
area('Fill softbox',(-.30,-.03,.22),3.5,.32,(1,.84,.69))
area('Rear rim',(.05,.28,.29),8,.22,(.68,.78,1))
camdata=bpy.data.cameras.new('Product camera');cam=bpy.data.objects.new('Product camera',camdata);studio.objects.link(cam)
cam.location=(.31,-.40,.255);cam.rotation_euler=(Vector((0,0,.03))-cam.location).to_track_quat('-Z','Y').to_euler()
camdata.type='ORTHO';camdata.ortho_scale=.44;camdata.clip_start=.001;scene.camera=cam
scene.frame_set(1)
# Select only the drone for the portable model; curves are converted in an export copy by the exporter.
bpy.ops.object.select_all(action='DESELECT')
for o in model.all_objects:o.select_set(True)
bpy.context.view_layer.objects.active=root
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type == 'VIEW_3D':
            area.spaces.active.clip_start = .001
            area.spaces.active.region_3d.view_location = Vector((0, 0, .035))
            area.spaces.active.region_3d.view_distance = .5
            area.spaces.active.region_3d.view_rotation = cam.rotation_euler.to_quaternion()
            area.spaces.active.shading.type = 'MATERIAL'
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'Drone_Model.blend'))
bpy.ops.export_scene.gltf(filepath=str(OUT/'Drone_Model.glb'),export_format='GLB',use_selection=True,
    export_apply=True,export_animations=True,export_frame_range=True,export_cameras=False,export_lights=False)
scene.render.filepath=str(OUT/'drone_preview.png');bpy.ops.render.render(write_still=True)
# Additional top view, directly useful for comparing the supplied reference.
cam.location=(0,0,.50);cam.rotation_euler=(0,0,0);cam.rotation_euler=(Vector((0,0,0))-cam.location).to_track_quat('-Z','Y').to_euler()
camdata.ortho_scale=.39;scene.render.resolution_x=1000;scene.render.resolution_y=1000
scene.render.filepath=str(OUT/'drone_top.png');bpy.ops.render.render(write_still=True)
print('DRONE_MODEL_COMPLETE',len(model.all_objects),str(OUT))
