# NNP-SAR — Landslide training simulation

A locally runnable Three.js search-and-rescue scenario with procedural terrain,
three simulated drones, synthetic sensor feeds and an incident dashboard.

## Run

Requires Python 3 and a browser with WebGL2. From this folder:

```sh
python -m http.server 8080
```

Open **http://localhost:8080**. On Windows, `py -m http.server 8080` also works.
Do not open `index.html` using `file://`; browser modules need the local server.
Three.js r170 and its required addons are bundled in `vendor/three`, with their
MIT license. There are no CDN/font requests or npm build steps.

## Controls

- Starts in autonomous search with an orbitable reconnaissance view.
- Drag to orbit, right-drag to pan, scroll to zoom in RECON.
- CHASE follows the primary aircraft; FORWARD CAM uses its forward camera.
- MANUAL: click the scene for mouse control; Escape releases the mouse.
  W/A/S/D move, Q/E climb/descend. Space pauses, R restarts, T changes thermal palette.
- Pause, Restart and Focus view also have visible buttons.
- Atmosphere selects clear, overcast or valley mist. This changes **rendered visibility only**;
  it does not simulate weather-dependent sensor accuracy or atmospheric physics.
- The incident board provides track, triage, fleet and operations views, plus JSON export.

## Improvements in this version

- Brighter overcast lighting, softer bloom and locally generated terrain detail.
- Dense instanced broadleaf canopy, with a cleared landslide and road corridor.
- Seeded visual scene generation for repeatable starting scenery.
- Finite rockfall with gravity, terrain-normal impacts and damping, replacing
  perpetual teleportation. This is an approximate visual model.
- Time-based, acceleration-limited flight; braking near waypoints; shortest-path
  heading turns; terrain look-ahead and altitude hold while investigating.
- Sensor elevation-ray occlusion and no repeated processing of stale snapshots.
- Detection events delivered immediately to the dashboard, independent of its refresh rate.
- Pause freezes mission time; restart reconstructs all scene and mission state.
- Usable RECON orbit/pan controls; quieter UI; responsive layout; explicit synthetic telemetry.
- Reused RGB render target and pixel buffer, and bundled rendering dependencies.

## Verification

With Node.js 22+:

```sh
node --experimental-loader ./tests/three-loader.mjs --test tests/simulation.test.mjs
```

Chromium smoke checks passed: app startup without JavaScript errors, pause, focus view, camera selection and atmosphere selection. A rendered desktop preview is included in `docs/preview.png`. Hardware GPU performance and the Gazebo/PX4 pipeline have not been benchmarked.

Six regression tests cover seeded randomness, terrain continuity/finite height,
heading wrap, braking, manual motion consistency at 30/120 Hz and autonomous
approach/clearance. The loader maps `three` to the bundled browser build.

## Model boundaries

This is a browser **training and visualization prototype**, not a certified or
validated digital twin. The terrain is procedural, not a surveyed Kodaikanal DEM.
Vehicle motion is a kinematic controller, not a rigid-body aerodynamic solver.
The ground-clearance clamp remains an assistance mechanism. Trees/buildings are
not flight collision bodies. Rock interactions omit mutual collisions and detailed friction.

Thermal images use assigned temperatures, not calibrated radiometry. Optical
labels, acoustic cues, gas values, GNSS, RF, coverage, triage and hazard forecasts
are synthetic/heuristic. Terrain occlusion uses discrete height samples and does
not model all object occlusion. Sensor noise is not seeded. Atmosphere presets
are visual only. Do not interpret these outputs as real casualty detection,
medical triage, link reliability, or field-safe routes.

The files in `aegis_disaster_world/` are a **separate** Gazebo/PX4 starting point.
The browser does not establish a MAVLink/PX4 connection. The existing Gazebo
world and pipeline were not modified or validated by this browser update.

## Project Structure & Applications

- **Main Incident Simulation**: `index.html` (Procedural landslide world, 3 drones, 7 hexapod UGVs, APF Geofence curtain, FLIR thermal, Nav2 fused costmap)
- **3D Drone Model Viewer**: `drone-viewer/` (Interactive 3D quadcopter model with rotor spin, 4 camera presets, and photo-guided carbon chassis)
- **3D Hexapod UGV Viewer**: `hexapod-viewer/` (Interactive 18-DOF articulated walking robot model with gait kinematics and robotics specs)
- **NNP SAR Mission Control**: `nnp-dashboard/` (Air-ground coordination dashboard, agent telemetry, dynamic hazard alerts, and costmap pathfinding)
- **Documentation & Reports**: `reports/`
  - `reports/project-reports/`: Formal Word documents (.docx), technical specifications, and status logs
  - `reports/research-papers-and-analysis/`: Neural Network Pathfinding (.pdf) and hazard runout range papers
  - `reports/architecture-and-flowcharts/`: High-resolution system flowcharts (.jpg, .html) and node architecture breakdowns
  - `reports/archive/`: Traceability archive and duplicate document backups
