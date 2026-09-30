DRONE MODEL

Open Drone_Model.blend in Blender 4.5 or later.

EDITING
The DRONE collection has seven groups: Frame, Motors, Propellers,
Electronics, Camera, Mounts and Wiring. Expand a group in the Outliner,
select a part, then use G to move, R to rotate or S to scale it.
Bevel modifiers remain editable on the native parts.
Materials and the carbon weave image are included in the file.
The model has no visible lettering, labels or branding.

ANIMATION AND RENDERING
Four ROTOR assemblies rotate independently. Press Space to play or pause.
The propellers have alternating blade handedness.
Return to frame 1 for a still product render. Press F12 to render.
STUDIO contains the camera, lights and ground, separately from the asset.
The animation is for visual presentation; it is not a flight physics model.

WEB MODEL
Drone_Model.glb contains the drone with four rotor animation clips.
The studio is excluded. Units are metres.
Run: python -m http.server 8080
Open http://localhost:8080
Drag to orbit, scroll to zoom, right-drag to pan.
The three icon buttons play/pause rotors, show the top and reset the view.
Viewer dependencies are bundled; no CDN connection is needed.

REFERENCE
Geometry follows the supplied photographs. The estimated motor diagonal
is 220 mm and propeller diameter approximately 127 mm. Dimensions and
hidden hardware are approximations. This is an editable presentation
model, not measured engineering CAD or a validated hardware design.

FILES
Drone_Model.blend: editable native scene
Drone_Model.glb: portable animated mesh
build_drone.py: repeatable model generator using Blender's bpy module
index.html + viewer/: local browser viewer
drone_preview.png and drone_top.png: renders of the actual model

Three.js r170 is bundled under the MIT license; see viewer/vendor/LICENSE.
