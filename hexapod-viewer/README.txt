HEXAPOD ROBOT — EDITABLE BLENDER MODEL

Open Hexapod_Robot.blend in Blender 4.5 or newer.
The model is based on the supplied image of the six-legged black robot.
It contains no visible lettering, labels or logos.

EDIT
Expand ROBOT in the Outliner. Body and controller are in one collection;
each of the six legs has its own collection. The STUDIO collection contains
only the camera, lights and floor.

Each leg has three named joint empties:
- hip yaw: rotate around its local Z axis;
- shoulder pitch: rotate around its local Y axis;
- knee pitch: rotate around its local Y axis.
Geometry follows its parent joint. Individual servo cases, brackets, bolts,
feet and cable loops remain separate editable objects. Bevels are editable.
To make a static custom pose, clear the animation from the joint empties first
(Object > Animation > Clear Animation), then rotate those joints.

ANIMATION
Press Space to play the 120-frame leg-motion demonstration.
Frame 1 is the standing presentation pose. The motion demonstrates joint
articulation and alternating leg lift; it is not a validated walking controller
or a dynamics simulation. The robot does not travel through the scene.

RENDER
Press F12 for the prepared three-quarter product view.
robot_preview.png and robot_top.png are renders of the actual model.
The default viewport hides light/camera overlays for a clear editing view.

PORTABLE MODEL
Hexapod_Robot.glb contains the robot and joint animations without the studio.
Units are metres. Procedural material grain in the Blender scene is simplified
to base materials in the portable export.

PROPORTIONS
Approximate central body diameter: 210 mm; stance width: about 590 mm.
The image does not provide dimensions or hidden construction details.
This is a visual reconstruction for editing, animation and presentation,
not manufacturing CAD, printable production parts or verified mechanical design.

SOURCE
build_robot.py creates the scene using bpy, without external textures or add-ons.
Run it with Blender's Python environment to rebuild both models and renders.
