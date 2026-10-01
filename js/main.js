/**
 * main.js — NNP-SAR Defense-Grade Tactical Operations Application
 * Orchestrates rendering, Primary Flight Display (PFD) HUD, tactical target
 * projection, FLIR thermal imaging, swarm telemetry, and mission management.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

import { createDisasterScene, updateScene, objectRegistry, fireParticles, getTerrainHeight } from './scene.js';
import { ThermalRenderer } from './thermal.js';
import { Drone } from './drone.js';
import { SensorSystem } from './sensors.js';
import { DetectionPipeline } from './detection.js';
import { SwarmCoordinator } from './swarm.js';
import { Dashboard } from './dashboard.js';
import { HazardPropagation } from './hazard_propagation.js';
import { RescuePathfinder } from './pathfinder.js';
import { HexapodFleet } from './hexapods.js';

// ── Global State ─────────────────────────────────────────────────
let renderer, scene, camera, controls;
let composer; // post-processing pipeline
let primaryDrone, sensors, detection, thermal, swarm, dashboard, hazardPropagation, rescuePathfinder, hexapodFleet;
let clock, paused = false;
let rgbCamera;
let currentCamMode = 'recon';
let simulationTime = 0;
let sensorElapsed = 0;
let cameraTransition = true;

// ── Loading Screen Boot Sequence ─────────────────────────────────
const BOOT_MESSAGES = [
  'Initializing incident command workspace...',
  'Loading disaster terrain, hazards, and casualty signatures...',
  'Calibrating FLIR uncooled VOx microbolometer (LWIR 8-14μm)...',
  'Initializing simulated vehicle telemetry...',
  'Initializing optical feed and thermal model...',
  'Calibrating acoustic signal model...',
  'Configuring gas and VOC drift model...',
  'Starting multi-sensor detection pipeline...',
  'Establishing autonomous fleet mesh...',
  'Preparing hazard forecast and route planner...',
  'Starting casualty triage evaluator...',
  'Operations console ready.',
];

async function runBootSequence() {
  const fillEl = document.getElementById('loader-fill');
  const pctEl = document.getElementById('loader-pct');
  const logEl = document.getElementById('loader-log');

  for (let i = 0; i < BOOT_MESSAGES.length; i++) {
    const progress = Math.round(((i + 1) / BOOT_MESSAGES.length) * 100);

    if (fillEl) fillEl.style.width = progress + '%';
    if (pctEl) pctEl.textContent = progress + '%';

    if (logEl) {
      const prevActive = logEl.querySelector('.log-line.active');
      if (prevActive) prevActive.classList.remove('active');

      const line = document.createElement('div');
      line.className = 'log-line active';
      line.textContent = BOOT_MESSAGES[i];
      logEl.appendChild(line);

      while (logEl.children.length > 3) {
        logEl.removeChild(logEl.firstChild);
      }
    }

    const delay = i < 2 ? 150 : i === BOOT_MESSAGES.length - 1 ? 350 : 80 + Math.random() * 100;
    await new Promise(r => setTimeout(r, delay));
  }

  await new Promise(r => setTimeout(r, 200));
  const loadingScreen = document.getElementById('loading-screen');
  if (loadingScreen) loadingScreen.classList.add('hidden');
}

// ── Initialize ───────────────────────────────────────────────────
function init() {
  runBootSequence();

  // Renderer
  const canvas = document.getElementById('main-canvas');
  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance',
  });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.88;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  // Scene
  scene = new THREE.Scene();

  // Camera
  camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 800);
  camera.position.set(-38, 37, 47);
  camera.lookAt(0, 0, 0);

  // OrbitControls
  controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.enablePan = true;
  controls.maxPolarAngle = Math.PI / 2.1;
  controls.minDistance = 3;
  controls.maxDistance = 150;

  // RGB PiP camera
  rgbCamera = new THREE.PerspectiveCamera(60, 320 / 240, 0.1, 100);

  // Build disaster scene
  createDisasterScene(scene);

  // Primary drone
  primaryDrone = new Drone(scene, 'NNP-1', 0x00c8ff);
  primaryDrone.position.set(0, 14, 0);
  primaryDrone.mode = 'autonomous';

  // Default autonomous search waypoints (Creeping line)
  setSearchPattern('creeping_line');

  // Sensors & Detection
  sensors = new SensorSystem();
  detection = new DetectionPipeline();

  // Thermal renderer
  thermal = new ThermalRenderer(renderer, 320, 240);

  // Swarm coordinator (aerial) & Hexapod fleet (ground perimeter)
  swarm = new SwarmCoordinator(scene, primaryDrone);
  hexapodFleet = new HexapodFleet(scene);

  // Decision-support overlays
  hazardPropagation = new HazardPropagation(scene);
  rescuePathfinder = new RescuePathfinder(scene);

  // Clock
  clock = new THREE.Clock();

  // Dashboard
  dashboard = new Dashboard();
  dashboard.onModeChange = (mode) => {
    primaryDrone.mode = mode;
    if (mode === 'autonomous') {
      document.exitPointerLock?.();
    }
  };
  dashboard.onPaletteChange = (palette) => {
    thermal.setPalette(palette);
  };
  dashboard.onPatternChange = (pattern) => {
    setSearchPattern(pattern);
  };
  dashboard.onTargetSelect = (det) => {
    if (primaryDrone && det.position) {
      primaryDrone.investigateDetection(det.position);
    }
  };
  dashboard.onForecastChange = (minutes) => {
    hazardPropagation.setForecastMinutes(minutes);
    dashboard.updateOperationsPanel(hazardPropagation.getSummary());
  };
  dashboard.onDispatchRoute = () => {
    dispatchBestRescueRoute();
  };
  dashboard.onDemoRun = () => {
    setSearchPattern('creeping_line');
    primaryDrone.mode = 'autonomous';
    currentCamMode = 'recon';
    document.getElementById('btn-auto')?.classList.add('active');
    document.getElementById('btn-manual')?.classList.remove('active');
    document.querySelectorAll('.cam-view-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.cam === 'recon');
    });
    hazardPropagation.setForecastMinutes(30);
    const slider = document.getElementById('hazard-forecast-slider');
    if (slider) slider.value = '30';
    dispatchBestRescueRoute();
  };

  // Camera view switcher buttons
  const camBtns = document.querySelectorAll('.cam-view-btn');
  for (const btn of camBtns) {
    btn.addEventListener('click', () => {
      camBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentCamMode = btn.dataset.cam;
      cameraTransition = true;
    });
  }

  // Keyboard shortcuts
  setupKeyboardShortcuts();

  // Resize handler
  window.addEventListener('resize', onResize);

  // Initialize tactical HUD markers container
  createDetectionMarkers();

  // Post-processing: Bloom (fire, sparks, emissive lights glow)
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.16,  // bloom strength
    0.40,  // radius
    1.1    // threshold — only very bright emissives bloom
  );
  composer.addPass(bloomPass);
  composer.addPass(new OutputPass());

  document.getElementById('btn-pause').addEventListener('click', () => {
    paused = !paused;
    document.getElementById('btn-pause').textContent = paused ? 'Resume' : 'Pause';
  });
  document.getElementById('btn-reset').addEventListener('click', resetSimulation);
  document.getElementById('btn-focus').addEventListener('click', () => document.body.classList.toggle('scene-focus'));
  document.getElementById('weather-select').addEventListener('change', e => {
    scene.fog.density = { clear: 0.002, overcast: 0.0045, mist: 0.012 }[e.target.value];
    renderer.toneMappingExposure = e.target.value === 'mist' ? 0.80 : 0.88;
  });
  // Start loop
  animate();
}

// ── Search Pattern Waypoint Generator ────────────────────────────
function dispatchBestRescueRoute() {
  const topTriage = detection.getTriageScores()[0];
  const knownCasualty = null; // Dispatch requires a detected track, not hidden scenario truth.
  const target = topTriage
    ? detection.processedDetections.find(d => d.name === topTriage.sourceName) || topTriage
    : detection.processedDetections.find(d => d.classification === 'person' || d.classification === 'possible_person')
      || (knownCasualty ? {
        name: knownCasualty.metadata?.label || 'Known casualty signature',
        position: knownCasualty.position,
        metadata: knownCasualty.metadata,
      } : null);

  const route = target ? rescuePathfinder.dispatchRoute(target.position) : null;
  if (route && hexapodFleet) {
    hexapodFleet.setGateHexapod('G1');
  }
  dashboard.updateOperationsPanel(hazardPropagation.getSummary(), route, target);
}

function setSearchPattern(pattern) {
  if (!primaryDrone) return;
  if (pattern === 'creeping_line') {
    primaryDrone.setAutonomousWaypoints([
      { x: -14, z: -12 }, { x: 14, z: -12 },
      { x: 14, z: -6 },   { x: -14, z: -6 },
      { x: -14, z: 0 },    { x: 14, z: 0 },
      { x: 14, z: 6 },    { x: -14, z: 6 },
      { x: -14, z: 12 },   { x: 14, z: 12 },
      { x: 0, z: 0 },
    ]);
  } else if (pattern === 'expanding_square') {
    primaryDrone.setAutonomousWaypoints([
      { x: 0, z: 0 },
      { x: 3.5, z: 3.5 }, { x: -3.5, z: 3.5 }, { x: -3.5, z: -3.5 }, { x: 7, z: -3.5 },
      { x: 7, z: 7 }, { x: -7, z: 7 }, { x: -7, z: -7 }, { x: 11, z: -7 },
      { x: 11, z: 11 }, { x: -11, z: 11 }, { x: 0, z: 0 },
    ]);
  } else if (pattern === 'sector_search') {
    primaryDrone.setAutonomousWaypoints([
      { x: 0, z: 0 },
      { x: 12, z: 0 }, { x: 6, z: 10 }, { x: 0, z: 0 },
      { x: -6, z: 10 }, { x: -12, z: 0 }, { x: 0, z: 0 },
      { x: -6, z: -10 }, { x: 6, z: -10 }, { x: 0, z: 0 },
    ]);
  }
}

// ── Keyboard Shortcuts ───────────────────────────────────────────
function setupKeyboardShortcuts() {
  const palettes = ['ironbow', 'white_hot', 'black_hot'];
  let paletteIdx = 0;

  document.addEventListener('keydown', (e) => {
    if (/INPUT|SELECT|TEXTAREA|BUTTON/.test(e.target.tagName) || e.repeat) return;
    switch (e.key.toLowerCase()) {
      case ' ':
        e.preventDefault();
        paused = !paused;
        document.getElementById('btn-pause').textContent = paused ? 'Resume' : 'Pause';
        break;
      case 'r':
        resetSimulation();
        break;
      case 't':
        paletteIdx = (paletteIdx + 1) % palettes.length;
        const nextPalette = palettes[paletteIdx];
        thermal.setPalette(nextPalette);
        document.querySelectorAll('.palette-btn').forEach(btn => {
          btn.classList.toggle('active', btn.dataset.palette === nextPalette);
        });
        break;
    }
  });
}

// ── Tactical Ground Rings & Screen Reticles ──────────────────────
const detection3DRings = new Map();
const tacticalHudContainer = document.getElementById('tactical-hud-markers');
const activeTargetsList = [];

function createDetectionMarkers() {
  // Clears on init
}

function updateDetectionMarkers(newDetections) {
  if (!newDetections) return;

  for (const det of newDetections) {
    if (!['person', 'possible_person', 'fire', 'downed_power_line'].includes(det.classification)) continue;
    if (detection3DRings.has(det.name)) continue;

    // 1. Subtle, glowing ground ring (No 3D billboard text)
    const ringGroup = new THREE.Group();
    const ringGeo = new THREE.RingGeometry(0.7, 0.9, 32);
    const ringColor = det.classification === 'person' ? 0x00e87b
                    : det.classification === 'fire' ? 0xff3355
                    : det.classification === 'heat_false_positive' ? 0xffaa00
                    : 0x00c8ff;

    const ringMat = new THREE.MeshBasicMaterial({
      color: ringColor,
      transparent: true,
      opacity: 0.5,
      side: THREE.DoubleSide,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.copy(det.position);
    ring.position.y = getTerrainHeight(det.position.x, det.position.z) + 0.08;
    ringGroup.add(ring);

    // Faint vertical guide line
    const lineGeo = new THREE.CylinderGeometry(0.015, 0.015, 6, 6);
    const lineMat = new THREE.MeshBasicMaterial({
      color: ringColor,
      transparent: true,
      opacity: 0.2,
    });
    const lineMesh = new THREE.Mesh(lineGeo, lineMat);
    lineMesh.position.copy(det.position);
    lineMesh.position.y = ring.position.y + 3;
    ringGroup.add(lineMesh);

    scene.add(ringGroup);
    detection3DRings.set(det.name, { group: ringGroup, ring, time: 0 });

    // 2. Add to active targets for 2D screen projection
    activeTargetsList.push(det);

    // Create 2D tactical bracket DOM element
    if (tacticalHudContainer) {
      const trackId = dashboard?.getTrackId(det.name) || 'TRK-00';
      const bracket = document.createElement('div');
      const typeClass = (det.classification === 'person' || det.classification === 'possible_person') ? 'person'
                      : ['fire', 'downed_power_line', 'flood', 'structural_instability'].includes(det.classification) ? 'hazard'
                      : 'review';

      bracket.className = `tactical-target-bracket ${typeClass}`;
      bracket.id = `bracket-${det.name}`;
      bracket.innerHTML = `
        <div class="bracket-bottom-left"></div>
        <div class="bracket-bottom-right"></div>
        <div class="target-track-id">${trackId}</div>
        <div class="target-track-label">${det.classification.replace(/_/g, ' ').toUpperCase()}</div>
      `;
      tacticalHudContainer.appendChild(bracket);
    }
  }

  // Animate 3D ground rings
  for (const [, item] of detection3DRings) {
    item.time += 0.03;
    const scale = 1 + Math.sin(item.time * 2.5) * 0.12;
    item.ring.scale.set(scale, scale, 1);
    item.ring.material.opacity = 0.35 + Math.sin(item.time * 2) * 0.2;
  }
}

// ── Screen Projection for Tactical HUD Brackets ──────────────────
function updateTacticalHUDProjection() {
  if (!activeTargetsList.length || !camera) return;

  const width = window.innerWidth;
  const height = window.innerHeight;
  const tempV = new THREE.Vector3();

  for (const det of activeTargetsList) {
    const el = document.getElementById(`bracket-${det.name}`);
    if (!el) continue;

    tempV.copy(det.position);
    tempV.y += 0.8; // slightly above target ground position
    tempV.project(camera);

    // Check if target is in front of camera
    if (tempV.z > 0 && tempV.z < 1 &&
        tempV.x >= -1.05 && tempV.x <= 1.05 &&
        tempV.y >= -1.05 && tempV.y <= 1.05) {

      const x = (tempV.x * 0.5 + 0.5) * width;
      const y = (-(tempV.y * 0.5) + 0.5) * height;

      el.style.display = 'block';
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;

      // Update distance
      const dist = (primaryDrone?.position && det.position) ? primaryDrone.position.distanceTo(det.position).toFixed(0) : '10';
      const label = el.querySelector('.target-track-label');
      if (label) {
        label.textContent = `${det.classification.replace(/_/g, ' ').toUpperCase()} · ${dist}m`;
      }
    } else {
      el.style.display = 'none';
    }
  }
}

// ── Primary Flight Display (PFD) HUD ─────────────────────────────
function updatePFDHUD() {
  if (!primaryDrone) return;

  // 1. Heading Compass Tape
  let yawDeg = Math.round((-primaryDrone.yaw * 180 / Math.PI) % 360);
  if (yawDeg < 0) yawDeg += 360;
  const compassDeg = document.getElementById('compass-deg');
  if (compassDeg) compassDeg.textContent = `${String(yawDeg).padStart(3, '0')}° HDG`;

  // 2. Artificial Horizon (Pitch Ladder & Roll)
  const pitchDeg = (primaryDrone.pitch * 180 / Math.PI) || 0;
  const rollDeg = (primaryDrone.roll * 180 / Math.PI) || 0;
  const pitchLadder = document.getElementById('pitch-ladder');
  if (pitchLadder) {
    pitchLadder.style.transform = `rotate(${rollDeg.toFixed(1)}deg) translateY(${(pitchDeg * 3.5).toFixed(1)}px)`;
  }

  // 3. Airspeed / Groundspeed Tape
  const speed = primaryDrone.velocity ? primaryDrone.velocity.length().toFixed(1) : '0.0';
  const tapeSpeed = document.getElementById('tape-speed');
  if (tapeSpeed) tapeSpeed.textContent = speed;

  // 4. Altitude Tape (Radar AGL)
  const alt = (typeof primaryDrone.altitudeAGL === 'number') ? primaryDrone.altitudeAGL.toFixed(1) : Math.max(0, primaryDrone.position.y).toFixed(1);
  const tapeAlt = document.getElementById('tape-alt');
  if (tapeAlt) tapeAlt.textContent = `${alt}m`;

  const vsi = primaryDrone.velocity ? primaryDrone.velocity.y.toFixed(1) : '0.0';
  const tapeVsi = document.getElementById('tape-vsi');
  if (tapeVsi) tapeVsi.textContent = `VSI: ${vsi > 0 ? '+' : ''}${vsi}`;

  // 5. Pyrometer Readout
  if (thermal && dashboard && dashboard.pyroVal) {
    dashboard.pyroVal.textContent = `${thermal.centerTempC}°C`;
  }
}

// ── Camera Modes (Chase, FPV Gimbal, Orbit Recon) ────────────────
function updateCamera() {
  if (!primaryDrone) return;

  if (currentCamMode === 'fpv') {
    // True First-Person Gimbal View: directly in the nose sensor pod looking ahead/down
    controls.enabled = false;
    const forward = new THREE.Vector3(0, 0, -1).applyEuler(
      new THREE.Euler(primaryDrone.pitch * 0.4 - 0.18, primaryDrone.yaw, 0, 'YXZ')
    );
    camera.position.copy(primaryDrone.position).add(new THREE.Vector3(0, -0.06, 0));
    camera.lookAt(camera.position.clone().add(forward.multiplyScalar(25)));
  } else if (currentCamMode === 'recon') {
    // High-Altitude Reconnaissance Orbit: bird's-eye tactical overview of landslide valley
    controls.enabled = true;
    if (cameraTransition) {
      camera.position.set(-38, 37, 47);
      controls.target.set(0, 4, 0);
      cameraTransition = false;
    }
  } else {
    // Tactical 3rd Person Chase View (Follows smoothly behind and above)
    controls.enabled = true;
    const offset = new THREE.Vector3(0, 5.2, 8.8);
    offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), primaryDrone.yaw);
    const targetPos = primaryDrone.position.clone().add(offset);
    camera.position.lerp(targetPos, 0.05);

    const lookTarget = primaryDrone.position.clone();
    lookTarget.y += 0.8;
    controls.target.lerp(lookTarget, 0.07);
  }
}

// ── RGB Camera Follow ────────────────────────────────────────────
function updateRGBCamera() {
  if (!primaryDrone) return;
  rgbCamera.position.copy(primaryDrone.position);
  rgbCamera.quaternion.copy(primaryDrone.getQuaternion());
  rgbCamera.rotateX(-0.25);
}

// ── Main Animation Loop ──────────────────────────────────────────
let frameCount = 0;

function animate() {
  requestAnimationFrame(animate);

  const wallDt = Math.min(clock.getDelta(), 0.05);
  if (paused) {
    updateCamera();
    controls.update();
    primaryDrone.group.visible = currentCamMode !== 'fpv';
    composer.render();
    primaryDrone.group.visible = true;
    return;
  }

  const dt = wallDt;
  simulationTime += dt;
  const time = simulationTime;
  dashboard.simulationTime = simulationTime;
  frameCount++;

  // 1. Update scene animations
  updateScene(time, dt);

  // 2. Update primary drone physics & controls
  primaryDrone.update(dt);

  // 3. Update aerial swarm & ground hexapods
  swarm.update(dt);
  if (hexapodFleet) hexapodFleet.update(time);
  hazardPropagation.update(time);

  // 4. Camera follow
  updateCamera();
  controls.update();

  // 5. PFD HUD avionics update
  updatePFDHUD();

  // 6. Sensor sweep
  let newDetections = null;
  sensorElapsed += dt;
  if (sensorElapsed >= 0.1) {
    const snapshot = sensors.update(primaryDrone, sensorElapsed);
    sensorElapsed = 0;
    if (snapshot) {
      newDetections = detection.process(snapshot);
      if (newDetections && newDetections.length > 0) {
        dashboard.addDetections(newDetections);
        primaryDrone.detectionCount += newDetections.length;
        for (const det of newDetections) {
          if (det.classification === 'person') {
            primaryDrone.investigateDetection(det.position);
          }
        }
      }
    }
  }

  // 7. Thermal camera render
  if (frameCount % 4 === 0) {
    thermal.updateCamera(primaryDrone.position, primaryDrone.getQuaternion());
    primaryDrone.group.visible = false;
    thermal.render(scene, time);
    primaryDrone.group.visible = true;
  }

  // 8. RGB camera render
  if (frameCount % 4 === 2) {
    updateRGBCamera();
    primaryDrone.group.visible = false;
    sensors.renderRGBFeed(renderer, scene, rgbCamera);
    primaryDrone.group.visible = true;
  }

  // 9. Update detection markers & 2D tactical HUD projection
  updateDetectionMarkers(newDetections);
  updateTacticalHUDProjection();

  // 10. Update situation awareness dashboard
  if (frameCount % 10 === 0) {
    dashboard.updateStats(detection, swarm.getAreaSweptPercentage());

    dashboard.updateTriage(detection.getTriageScores());
    dashboard.updateDroneStatus(
      swarm.getAllDroneStatuses(),
      hexapodFleet ? hexapodFleet.getFleetTelemetry() : []
    );
    dashboard.updateOperationsPanel(hazardPropagation.getSummary());
  }

  // 11. Fire light flicker
  if (fireParticles && fireParticles.parent) {
    const fLight = scene.children.find(c => c.isPointLight && c.color.r > 0.8);
    if (fLight) {
      fLight.intensity = 7.0 + Math.sin(time * 14.3) * 2.5 + Math.sin(time * 31.7) * 1.2;
    }
  }

  // 12. Render main 3D scene through bloom post-processing
  renderer.setRenderTarget(null);
  primaryDrone.group.visible = currentCamMode !== 'fpv';
  composer.render();
  primaryDrone.group.visible = true;
}

// ── Reset ────────────────────────────────────────────────────────
function resetSimulation() {
  // Reload reconstructs all scene, sensor, swarm, UI and mission state together.
  window.location.reload();
}

// ── Resize Handler ───────────────────────────────────────────────
function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  if (composer) composer.setSize(window.innerWidth, window.innerHeight);
}

// ── Start ────────────────────────────────────────────────────────
init();
