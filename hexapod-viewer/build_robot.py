"""Editable six-legged robot reconstructed from the supplied photograph.
Run with Blender 4.5+ (bpy). Metre units; dimensions are inferred.
"""
import bpy, math, os
from pathlib import Path
from mathutils import Vector
OUT=Path(os.environ.get('ROBOT_OUTPUT_DIR',Path(__file__).resolve().parent));OUT.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
for c in list(bpy.data.collections):
    if c.name!='Collection':bpy.data.collections.remove(c)
scene=bpy.context.scene
scene.unit_settings.system='METRIC';scene.unit_settings.length_unit='MILLIMETERS'
scene.render.engine='CYCLES';scene.cycles.samples=48;scene.cycles.use_denoising=True
scene.render.resolution_x=1600;scene.render.resolution_y=1200;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.render.fps=30;scene.frame_start=1;scene.frame_end=120
scene.view_settings.view_transform='AgX';scene.view_settings.look='AgX - Medium High Contrast'
scene.render.film_transparent=False
robot=bpy.data.collections.new('ROBOT');scene.collection.children.link(robot)
studio=bpy.data.collections.new('STUDIO');scene.collection.children.link(studio)
body=bpy.data.collections.new('01 Body and controller');robot.children.link(body)
col=body

def mat(name,color,metal=0,rough=.4):
    m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True
    bs=m.node_tree.nodes.get('Principled BSDF');bs.inputs['Base Color'].default_value=(*color,1)
    bs.inputs['Metallic'].default_value=metal;bs.inputs['Roughness'].default_value=rough
    return m
shell=mat('Graphite moulded shell',(.024,.027,.030),.12,.44)
legmat=mat('Black satin structural polymer',(.012,.015,.019),.08,.33)
servo=mat('Servo housings',(.018,.020,.024),.08,.43)
rubber=mat('Rubber feet and cable insulation',(.009,.011,.012),0,.72)
metal=mat('Stainless fasteners',(.47,.49,.52),.86,.29)
darkmetal=mat('Black anodized brackets',(.025,.029,.033),.65,.36)
orange=mat('Signal cable',(.66,.15,.018),0,.47)
red=mat('Power cable',(.32,.016,.018),0,.5)
brown=mat('Ground cable',(.085,.035,.018),0,.55)
board=mat('Controller circuit board',(.016,.072,.045),.1,.48)
gold=mat('Connector contacts',(.51,.32,.075),.8,.3)
# Subtle native material grain; portable geometry keeps the same base material.
for m in [shell,legmat]:
    n=m.node_tree.nodes;l=m.node_tree.links
    noise=n.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=800
    bump=n.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.10;bump.inputs['Distance'].default_value=.00007
    l.new(noise.outputs['Fac'],bump.inputs['Height']);l.new(bump.outputs['Normal'],n.get('Principled BSDF').inputs['Normal'])
root=bpy.data.objects.new('Robot root',None);body.objects.link(root)
root['description']='Six-legged robot, photograph-based visual reconstruction'
root['units']='metres';root['engineering_status']='Estimated proportions; not measured manufacturing CAD'

def link(o,name,m,parent=root,bevel=0,smooth=False):
    o.name=name
    for c in list(o.users_collection):c.objects.unlink(o)
    col.objects.link(o);o.parent=parent
    if m:o.data.materials.append(m)
    if bevel:
        mod=o.modifiers.new('Edge radius','BEVEL');mod.width=bevel;mod.segments=3
        o.modifiers.new('Corner normals','WEIGHTED_NORMAL')
    if smooth:
        for p in o.data.polygons:p.use_smooth=True
    return o

def box(name,loc,size,m,parent=root,bevel=.001):
    bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=bpy.context.object;o.dimensions=size
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    return link(o,name,m,parent,bevel)

def cyl(name,loc,radius,depth,m,parent=root,axis='Z',vertices=48):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices,radius=radius,depth=depth,location=loc)
    o=link(bpy.context.object,name,m,parent,.00035,True)
    if axis=='Y':o.rotation_euler.x=math.pi/2
    if axis=='X':o.rotation_euler.y=math.pi/2
    return o

def mesh(name,verts,faces,m,parent=root,bevel=.001):
    me=bpy.data.meshes.new(name);me.from_pydata(verts,[],faces);me.update()
    ob=bpy.data.objects.new(name,me);col.objects.link(ob);ob.parent=parent;ob.data.materials.append(m)
    if bevel:
        b=ob.modifiers.new('Edge radius','BEVEL');b.width=bevel;b.segments=3
        ob.modifiers.new('Corner normals','WEIGHTED_NORMAL')
    return ob

def profile(name,points,y,thick,m,parent=root,bevel=.001):
    n=len(points);verts=[(x,y+dy,z) for dy in [-thick/2,thick/2] for x,z in points]
    faces=[tuple(range(n-1,-1,-1)),tuple(range(n,n*2))]
    faces.extend((k,(k+1)%n,(k+1)%n+n,k+n) for k in range(n))
    return mesh(name,verts,faces,m,parent,bevel)

def wire(name,pts,m,parent=root,r=.00065):
    cv=bpy.data.curves.new(name,'CURVE');cv.dimensions='3D';cv.resolution_u=16;cv.bevel_depth=r;cv.bevel_resolution=3
    sp=cv.splines.new('BEZIER');sp.bezier_points.add(len(pts)-1)
    for p,co in zip(sp.bezier_points,pts):p.co=co;p.handle_left_type='AUTO';p.handle_right_type='AUTO'
    o=bpy.data.objects.new(name,cv);col.objects.link(o);o.parent=parent;cv.materials.append(m)
    return o

def pivot(name,loc,parent):
    o=bpy.data.objects.new(name,None);col.objects.link(o);o.parent=parent;o.location=loc;o.empty_display_type='PLAIN_AXES';o.empty_display_size=.018
    return o

def bolt(name,loc,parent=root,axis='Z',r=.0023):
    cyl(name+' washer',loc,r*1.3,.0006,metal,parent,axis)
    ob=cyl(name+' socket head',loc,r,.0016,metal,parent,axis,vertices=6)
    d={'X':(1,0,0),'Y':(0,-1,0),'Z':(0,0,1)}[axis]
    p=tuple(loc[i]+d[i]*.001 for i in range(3))
    cyl(name+' dark socket',p,r*.42,.00025,darkmetal,parent,axis,vertices=6)

def servo_case(name,parent,loc=(0,0,0)):
    x,y,z=loc
    box(name+' main case',(x,y,z),(.036,.022,.035),servo,parent,.0018)
    box(name+' cap',(x,y,z+.0175),(.037,.023,.007),legmat,parent,.001)
    box(name+' lower cap',(x,y,z-.0175),(.036,.022,.005),servo,parent,.001)
    for dx in [-.022,.022]:
        box(name+' mounting ear',(x+dx,y,z+.009),(.009,.023,.003),servo,parent,.0006)
        for dy in [-.007,.007]:bolt(name+' mounting screw',(x+dx,y+dy,z+.011),parent,r=.0013)
    for dy in [-.0125,.0125]:
        cyl(name+' output boss',(x+.006,y+dy,z+.005),.008,.003,darkmetal,parent,'Y')
    # Mould seam and small case screws remain visible at close range.
    for dx in [-.012,.012]:
        for dy in [-.007,.007]:cyl(name+' case screw',(x+dx,y+dy,z+.022),.0012,.001,metal,parent,vertices=16)

# Closed, faceted central enclosure with removable top lid.
def hexbody(name,levels,m):
    verts=[]
    for radius,z in levels:
        verts.extend((radius*math.cos(math.pi/6+i*math.tau/6),radius*math.sin(math.pi/6+i*math.tau/6),z) for i in range(6))
    faces=[tuple(range(5,-1,-1))]
    for j in range(len(levels)-1):
        faces.extend((j*6+i,j*6+(i+1)%6,(j+1)*6+(i+1)%6,(j+1)*6+i) for i in range(6))
    faces.append(tuple(range((len(levels)-1)*6,len(levels)*6)))
    return mesh(name,verts,faces,m,bevel=.002)
hexbody('Lower chassis',[(.085,.053),(.105,.063),(.105,.078)],legmat)
hexbody('Enclosure shell',[(.105,.080),(.105,.105),(.088,.137)],shell)
hexbody('Top service lid',[(.088,.138),(.087,.140)],shell)
hexbody('Lid seam gasket',[(.0885,.1364),(.0885,.1374)],rubber)
for k in range(6):
    a=math.pi/6+k*math.tau/6
    bolt('Lid retaining screw',(.075*math.cos(a),.075*math.sin(a),.1408),r=.0018)
# Electronics under the removable shell.
box('Controller board',(0,0,.078),(.075,.054,.0016),board)
box('Controller processor',(0,0,.081),(.013,.013,.003),legmat)
for x in [-.030,.030]:
    box('Servo header bank',(x,0,.083),(.007,.040,.008),legmat)
    for j in range(12):
        for dx in [-.0018,.0018]:box('Header contact',(x+dx,-.017+j*.003,.088),(.00065,.00065,.003),gold,bevel=.0001)
for x in [-.028,.028]:
    for y in [-.02,.02]:cyl('Board support',(x,y,.066),.0025,.018,darkmetal)
# Recessed front ports, no lettering or branding.
box('Front connector recess',(0,-.0918,.094),(.025,.0015,.009),rubber,bevel=.001)
for x in [-.005,.005]:box('Connector sockets',(x,-.0928,.094),(.006,.002,.004),darkmetal,bevel=.0005)
cyl('Antenna base',(0,.061,.143),.004,.009,legmat)
cyl('Antenna',(0,.061,.163),.0017,.039,rubber)

# Six three-joint legs; geometry is attached to actual rotational pivots.
legs=[];L1=.062;L2=.172;rest=math.radians(55)
hip_height=.079;rest_down=math.asin((hip_height+L1*math.sin(rest)-.004)/L2)
for i,degrees in enumerate([-150,-90,-30,30,90,150]):
    col=bpy.data.collections.new(f'{i+2:02d} Leg {i+1}');robot.children.link(col)
    a=math.radians(degrees)
    base=pivot(f'Leg {i+1} mount',(.096*math.cos(a),.096*math.sin(a),hip_height),root);base.rotation_euler.z=a
    hip=pivot(f'Leg {i+1} hip yaw',(0,0,0),base)
    femur=pivot(f'Leg {i+1} shoulder pitch',(.046,0,0),hip);femur.rotation_euler.y=-rest
    knee=pivot(f'Leg {i+1} knee pitch',(L1,0,0),femur);knee.rotation_euler.y=rest+rest_down
    legs.append((hip,femur,knee))
    # Radial hip motor and two-sided mounting frame.
    servo_case(f'Leg {i+1} hip servo',hip,(.008,0,-.003))
    cyl('Hip vertical spindle',(0,0,.024),.011,.006,darkmetal,hip)
    bolt('Hip spindle screw',(0,0,.028),hip,r=.002)
    profile('Coxa yoke',[(-.014,-.025),(.055,-.025),(.062,-.016),(.06,.014),(.036,.014),(.027,-.012),(-.014,-.012)],-.015,.003,darkmetal,hip)
    profile('Coxa yoke',[(-.014,-.025),(.055,-.025),(.062,-.016),(.06,.014),(.036,.014),(.027,-.012),(-.014,-.012)],.015,.003,darkmetal,hip)
    servo_case(f'Leg {i+1} shoulder servo',femur,(.007,0,0))
    # Short raised thigh with broad curved shoulder and narrowed knee.
    thigh=[(-.011,-.020),(.019,-.023),(.046,-.016),(.069,-.014),(.075,-.004),(.071,.015),(.052,.018),(.023,.023),(-.011,.019)]
    for y in [-.017,.017]:
        profile('Upper leg bracket',thigh,y,.0032,legmat,femur,.0014)
        cyl('Shoulder pivot disc',(0,y*1.12,0),.010,.0025,darkmetal,femur,'Y')
        bolt('Shoulder pivot',(0,y*1.22,0),femur,'Y',.0023)
        bolt('Knee bracket fastener',(L1,y*1.22,0),femur,'Y',.002)
    box('Upper leg cross brace',(.041,0,0),(.009,.034,.017),legmat,femur,.001)
    servo_case(f'Leg {i+1} knee servo',knee,(.003,0,-.003))
    # Swept, tapered scythe profile follows the silhouette in the photo.
    shin=[(-.019,-.023),(.016,-.025),(.044,-.020),(.073,-.013),(.105,-.009),(.137,-.006),(.170,-.003),(.174,.001),(.158,.008),(.132,.019),(.106,.029),(.078,.037),(.047,.039),(.019,.030),(-.017,.021)]
    for y in [-.016,.016]:
        profile('Swept lower leg',shin,y,.005,legmat,knee,.0018)
        cyl('Knee output disc',(.006,y*1.18,.005),.009,.002,darkmetal,knee,'Y')
        bolt('Knee axle',(.006,y*1.28,.005),knee,'Y',.0021)
        for x,z in [(-.008,-.014),(.024,.018)]:bolt('Lower leg fixing',(x,y*1.25,z),knee,'Y',.0015)
    # Thin web joins side cheeks into a stiff, tapered foot.
    profile('Lower leg connecting web',[(.038,.026),(.078,.028),(.120,.013),(.172,0),(.160,-.003),(.115,.001),(.071,.014)],0,.029,legmat,knee,.001)
    box('Replaceable rubber foot',(.169,0,-.002),(.012,.037,.009),rubber,knee,.003)
    # Servo leads have relaxed loops rather than rigid straight lines.
    for j,m in enumerate([brown,red,orange]):
        yy=-.009+j*.002
        wire('Hip servo cable',[(.009,yy,-.019),(-.008,yy-.002,-.030),(-.028,yy-.006,-.020),(-.041,yy,-.004)],m,hip)
        wire('Shoulder servo cable',[(.012,yy,-.019),(.028,yy-.006,-.029),(.044,yy-.004,-.020),(.048,yy,.012)],m,femur)
        wire('Knee servo cable',[(.006,yy,.021),(.010,yy,.044),(.031,yy,.042),(.037,yy,.020)],m,knee)

# Optional small alternating tripod demonstration, solved analytically in each leg plane.
# It is a presentation motion, not a dynamics/terrain controller.
for i,(hip,femur,knee) in enumerate(legs):
    for frame in range(1,122,4):
        phase=(frame-1)/120*math.tau+(math.pi if i%2 else 0)
        lift=max(0,math.sin(phase))*.018
        target_x=L1*math.cos(rest)+L2*math.cos(rest_down)
        target_z=.004-hip_height+lift
        c=(target_x*target_x+target_z*target_z-L1*L1-L2*L2)/(2*L1*L2)
        relative=-math.acos(max(-1,min(1,c)))
        elev=math.atan2(target_z,target_x)-math.atan2(L2*math.sin(relative),L1+L2*math.cos(relative))
        hip.rotation_euler.z=.085*math.cos(phase)
        femur.rotation_euler.y=-elev;knee.rotation_euler.y=-relative
        for ob,axis in [(hip,2),(femur,1),(knee,1)]:ob.keyframe_insert(data_path='rotation_euler',index=axis,frame=frame)
scene.frame_set(1)
# Studio is separate and excluded from the portable asset.
col=studio
floor=box('Studio floor',(0,0,-.011),(200,200,.02),mat('Warm grey backdrop',(.105,.098,.085),0,.75),parent=None,bevel=0)
world=bpy.data.worlds.new('Soft studio');world.use_nodes=True;scene.world=world
world.node_tree.nodes.get('Background').inputs[0].default_value=(.32,.37,.44,1)
world.node_tree.nodes.get('Background').inputs[1].default_value=.28

def light(name,loc,power,size,color):
    d=bpy.data.lights.new(name,'AREA');d.energy=power;d.shape='DISK';d.size=size;d.color=color
    o=bpy.data.objects.new(name,d);studio.objects.link(o);o.location=loc
    o.rotation_euler=(Vector((0,0,.07))-o.location).to_track_quat('-Z','Y').to_euler()
light('Large key',(.25,-.4,.75),42,.6,(1,.94,.86))
light('Cool fill',(-.48,-.15,.35),22,.5,(.78,.87,1))
light('Rim',(.10,.5,.55),50,.45,(1,.96,.89))
d=bpy.data.cameras.new('Product camera');cam=bpy.data.objects.new('Product camera',d);studio.objects.link(cam)
cam.location=(.58,-.88,.60);cam.rotation_euler=(Vector((0,0,.073))-cam.location).to_track_quat('-Z','Y').to_euler()
d.type='ORTHO';d.ortho_scale=.76;d.clip_start=.001;scene.camera=cam
bpy.ops.object.select_all(action='DESELECT');root.select_set(True);bpy.context.view_layer.objects.active=root
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type=='VIEW_3D':
            sp=area.spaces.active;sp.clip_start=.001;sp.clip_end=100
            sp.region_3d.view_location=(0,0,.075);sp.region_3d.view_distance=.8
            sp.region_3d.view_rotation=cam.rotation_euler.to_quaternion();sp.shading.type='MATERIAL'
            sp.overlay.show_extras=False
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'Hexapod_Robot.blend'))
for ob in robot.all_objects:ob.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(OUT/'Hexapod_Robot.glb'),export_format='GLB',use_selection=True,export_apply=True,export_animations=True,export_cameras=False,export_lights=False)
scene.render.filepath=str(OUT/'robot_preview.png');bpy.ops.render.render(write_still=True)
cam.location=(0,-.001,.85);cam.rotation_euler=(Vector((0,0,.07))-cam.location).to_track_quat('-Z','Y').to_euler()
d.ortho_scale=.68;scene.render.resolution_x=1200;scene.render.resolution_y=1200
scene.render.filepath=str(OUT/'robot_top.png');bpy.ops.render.render(write_still=True)
print('MODEL_COMPLETE',len(robot.all_objects),'objects')
