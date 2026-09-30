"""Basic deliverable checks; run with bpy after build_robot.py."""
import bpy,json,struct
from pathlib import Path
from mathutils import Vector
p=Path(__file__).resolve().parent
bpy.ops.wm.open_mainfile(filepath=str(p/'Hexapod_Robot.blend'))
robot=bpy.data.collections['ROBOT'];obs=list(robot.all_objects)
assert len(robot.children)==7
assert not any(o.type=='FONT' for o in obs)
joints=[o for o in obs if o.animation_data]
assert len(joints)==18
assert len([o for o in obs if o.name.startswith('Replaceable rubber foot')])==6
assert bpy.data.collections.get('STUDIO') is not None
samples=[]
for f in [1,31,61,91]:
    bpy.context.scene.frame_set(f)
    feet=[o for o in obs if o.name.startswith('Replaceable rubber foot')]
    z=[min((o.matrix_world@Vector(co)).z for co in o.bound_box) for o in feet]
    assert min(z)>-.007, (f,z)
    samples.append({'frame':f,'lowest_foot_mm':round(min(z)*1000,2),'highest_foot_mm':round(max(z)*1000,2)})
with (p/'Hexapod_Robot.glb').open('rb') as fp:
    magic,ver,size=struct.unpack('<4sII',fp.read(12));ln,kind=struct.unpack('<II',fp.read(8));g=json.loads(fp.read(ln))
assert magic==b'glTF' and ver==2
assert size==(p/'Hexapod_Robot.glb').stat().st_size
assert len(g.get('animations',[]))>=1
assert not any(n.get('name','').startswith('Studio') for n in g['nodes'])
report={'model_objects':len(obs),'leg_collections':6,'animated_joints':len(joints),'visible_text_objects':0,'glb_meshes':len(g['meshes']),'glb_animations':len(g['animations']),'foot_check':samples}
(p/'validation.json').write_text(json.dumps(report,indent=2))
print(json.dumps(report))
