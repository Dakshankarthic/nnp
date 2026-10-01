/**
 * drone.js — NNP-SAR Drone Controller
 * Quadcopter mesh with spinning rotors, two flight modes
 * (manual WASD + autonomous patrol), camera frustum, and battery sim.
 */
import * as THREE from 'three';
import { getTerrainHeight } from './scene.js';
import { approach, angleDelta, brakingSpeed } from './simulation-math.js';

const DRONE_SPEED = 6;         // m/s
const DRONE_TURN_SPEED = 2;    // rad/s
const DRONE_ASCEND_SPEED = 3;  // m/s
const DRONE_DAMPING = 0.92;
const DEFAULT_ALTITUDE = 8;    // m
const ROTOR_SPEED = 25;        // rad/s

export class Drone {
  constructor(scene, id = 'NNP-1', color = 0x00d4ff) {
    this.id = id;
    this.scene = scene;
    this.color = color;

    // State
    this.velocity = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.roll = 0;
    this.position = new THREE.Vector3(0, DEFAULT_ALTITUDE, 0);
    this.battery = 100;
    this.mode = 'manual';  // 'manual' | 'autonomous'
    this.isInvestigating = false;
    this.detectionCount = 0;
    this.distanceTraveled = 0;
    this.commsQuality = 95;

    // Autonomous navigation
    this.waypointIndex = 0;
    this.waypoints = [];
    this.patrolPhase = 'exploring';
    this.investigateTarget = null;
    this.investigateTimer = 0;

    // Input state
    this.keys = {};
    this.mouseX = 0;
    this.mouseY = 0;
    this.isPointerLocked = false;

    // Build mesh
    this.group = new THREE.Group();
    this._buildMesh();
    this.group.position.copy(this.position);
    scene.add(this.group);

    // Camera frustum visualization
    this._buildFrustum();

    // Trail
    this.trail = [];
    this.trailMesh = null;
    this._buildTrail();

    // Input handlers
    if (id === 'NNP-1') this._setupInput();
    this.simTime = 0;
  }

  _buildMesh() {
    // Carbon fiber composite material
    const carbonMat = new THREE.MeshStandardMaterial({
      color: 0x161a22,
      metalness: 0.85,
      roughness: 0.25,
    });

    const matteMat = new THREE.MeshStandardMaterial({
      color: 0x0c0f16,
      metalness: 0.5,
      roughness: 0.6,
    });

    const accentMat = new THREE.MeshStandardMaterial({
      color: this.color,
      metalness: 0.6,
      roughness: 0.3,
      emissive: new THREE.Color(this.color),
      emissiveIntensity: 0.4,
    });

    // 1. Aerodynamic Central Fuselage
    const bodyGroup = new THREE.Group();
    const core = new THREE.Mesh(
      new THREE.BoxGeometry(0.38, 0.11, 0.52),
      carbonMat
    );
    core.castShadow = true;
    bodyGroup.add(core);

    // Top aerodynamic cowl / avionics hatch
    const cowl = new THREE.Mesh(
      new THREE.CylinderGeometry(0.14, 0.18, 0.06, 8),
      accentMat
    );
    cowl.position.set(0, 0.07, -0.04);
    bodyGroup.add(cowl);

    // RTK GPS Mast on top
    const mast = new THREE.Mesh(
      new THREE.CylinderGeometry(0.01, 0.01, 0.08, 6),
      matteMat
    );
    mast.position.set(0, 0.12, -0.14);
    bodyGroup.add(mast);

    const rtkAntenna = new THREE.Mesh(
      new THREE.CylinderGeometry(0.035, 0.035, 0.02, 12),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 })
    );
    rtkAntenna.position.set(0, 0.16, -0.14);
    bodyGroup.add(rtkAntenna);

    // 2. Dual Carbon Landing Gear Skids
    const skidMat = matteMat;
    const skidGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.56, 8);
    const sLeft = new THREE.Mesh(skidGeo, skidMat);
    sLeft.rotation.x = Math.PI / 2;
    sLeft.position.set(-0.22, -0.16, 0);
    bodyGroup.add(sLeft);

    const sRight = new THREE.Mesh(skidGeo, skidMat);
    sRight.rotation.x = Math.PI / 2;
    sRight.position.set(0.22, -0.16, 0);
    bodyGroup.add(sRight);

    // Skid struts
    for (const sx of [-0.22, 0.22]) {
      for (const sz of [-0.16, 0.16]) {
        const strut = new THREE.Mesh(
          new THREE.CylinderGeometry(0.008, 0.008, 0.16, 6),
          skidMat
        );
        strut.position.set(sx * 0.8, -0.08, sz);
        strut.rotation.z = sx > 0 ? -0.3 : 0.3;
        bodyGroup.add(strut);
      }
    }

    this.group.add(bodyGroup);

    // 3. Carbon Fiber Tubular Arms & Outrunner Motors
    this.rotors = [];
    const armDistance = 0.44;
    const motorPositions = [
      { x: armDistance * 0.75, z: -armDistance * 0.75, port: false }, // Front Right
      { x: -armDistance * 0.75, z: -armDistance * 0.75, port: true },  // Front Left
      { x: armDistance * 0.85, z: armDistance * 0.75, port: false },  // Rear Right
      { x: -armDistance * 0.85, z: armDistance * 0.75, port: true },   // Rear Left
    ];

    for (const m of motorPositions) {
      // Carbon arm tube
      const armLength = Math.hypot(m.x, m.z);
      const arm = new THREE.Mesh(
        new THREE.CylinderGeometry(0.016, 0.018, armLength, 8),
        carbonMat
      );
      arm.position.set(m.x * 0.5, 0, m.z * 0.5);
      arm.rotation.z = Math.PI / 2;
      arm.rotation.y = Math.atan2(m.x, m.z);
      arm.lookAt(new THREE.Vector3(m.x, 0, m.z));
      arm.rotateX(Math.PI / 2);
      this.group.add(arm);

      // Gunmetal motor bell
      const bell = new THREE.Mesh(
        new THREE.CylinderGeometry(0.042, 0.042, 0.045, 12),
        new THREE.MeshStandardMaterial({ color: 0x22262e, metalness: 0.9, roughness: 0.2 })
      );
      bell.position.set(m.x, 0.02, m.z);
      this.group.add(bell);

      // Realistic Propeller Assembly (Blades + Translucent Motion Blur Disc)
      const propGroup = new THREE.Group();
      propGroup.position.set(m.x, 0.048, m.z);

      // Motion blur disc
      const blurDisc = new THREE.Mesh(
        new THREE.CylinderGeometry(0.24, 0.24, 0.004, 24),
        new THREE.MeshStandardMaterial({
          color: 0xa0c0e0,
          transparent: true,
          opacity: 0.28,
          metalness: 0.6,
          side: THREE.DoubleSide,
        })
      );
      propGroup.add(blurDisc);

      // Sharp physical carbon blade hub
      const hub = new THREE.Mesh(
        new THREE.BoxGeometry(0.44, 0.008, 0.028),
        matteMat
      );
      propGroup.add(hub);

      this.group.add(propGroup);
      this.rotors.push(propGroup);

      // FAA Standard Navigation Lights
      // Port = Red, Starboard = Green, Tail = White Strobe
      const navColor = m.z < 0 ? (m.port ? 0xff2233 : 0x00ff66) : 0xffffff;
      const navBulb = new THREE.Mesh(
        new THREE.SphereGeometry(0.014, 8, 6),
        new THREE.MeshBasicMaterial({ color: navColor })
      );
      navBulb.position.set(m.x * 1.05, -0.01, m.z * 1.05);
      this.group.add(navBulb);

      const navLight = new THREE.PointLight(navColor, 0.6, 2.5);
      navLight.position.copy(navBulb.position);
      this.group.add(navLight);
    }

    // 4. Stabilized 3-Axis EO/IR Gimbal Turret
    const gimbalBase = new THREE.Group();
    gimbalBase.position.set(0, -0.06, -0.22); // Forward nose position

    // Gimbal sphere housing
    const turretSphere = new THREE.Mesh(
      new THREE.SphereGeometry(0.06, 12, 10),
      new THREE.MeshStandardMaterial({ color: 0x1a202c, metalness: 0.8, roughness: 0.3 })
    );
    gimbalBase.add(turretSphere);

    // Primary 4K Optical Lens (Sapphire coating blue-black)
    const opticalLens = new THREE.Mesh(
      new THREE.CylinderGeometry(0.02, 0.02, 0.015, 10),
      new THREE.MeshStandardMaterial({ color: 0x051228, metalness: 0.9, roughness: 0.1 })
    );
    opticalLens.rotation.x = Math.PI / 2;
    opticalLens.position.set(-0.022, 0, -0.052);
    gimbalBase.add(opticalLens);

    // FLIR LWIR Thermal Lens (Golden Germanium window)
    const thermalLens = new THREE.Mesh(
      new THREE.CylinderGeometry(0.018, 0.018, 0.015, 10),
      new THREE.MeshStandardMaterial({ color: 0xcc8800, metalness: 0.8, roughness: 0.2 })
    );
    thermalLens.rotation.x = Math.PI / 2;
    thermalLens.position.set(0.022, 0, -0.052);
    gimbalBase.add(thermalLens);

    this.group.add(gimbalBase);

    // Tactical Search Spotlight — focused beam, reduced intensity to avoid terrain washout
    this.spotlight = new THREE.SpotLight(0xffeedd, 1.5, 30, Math.PI / 7, 0.7, 2.0);
    this.spotlight.position.set(0, -0.1, -0.1);
    this.spotlight.target.position.set(0, -12, 4);
    this.group.add(this.spotlight);
    this.group.add(this.spotlight.target);
  }

  _buildFrustum() {
    // Camera FOV cone visualization
    const coneGeo = new THREE.ConeGeometry(3, 8, 4, 1, true);
    const coneMat = new THREE.MeshBasicMaterial({
      color: this.color,
      transparent: true,
      opacity: 0.04,
      side: THREE.DoubleSide,
      wireframe: false,
      depthWrite: false,
    });
    this.frustumCone = new THREE.Mesh(coneGeo, coneMat);
    this.frustumCone.rotation.x = Math.PI;
    this.frustumCone.position.y = -4;
    this.group.add(this.frustumCone);

    // Wireframe edges
    const wireGeo = new THREE.ConeGeometry(3, 8, 4, 1, true);
    const wireMat = new THREE.MeshBasicMaterial({
      color: this.color,
      transparent: true,
      opacity: 0.12,
      wireframe: true,
    });
    const wire = new THREE.Mesh(wireGeo, wireMat);
    wire.rotation.x = Math.PI;
    wire.position.y = -4;
    this.group.add(wire);
  }

  _buildTrail() {
    const trailGeo = new THREE.BufferGeometry();
    const maxTrailPoints = 200;
    const positions = new Float32Array(maxTrailPoints * 3);
    trailGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    trailGeo.setDrawRange(0, 0);

    this.trailMesh = new THREE.Line(trailGeo, new THREE.LineBasicMaterial({
      color: this.color,
      transparent: true,
      opacity: 0.3,
    }));
    this.scene.add(this.trailMesh);
  }

  _setupInput() {
    document.addEventListener('keydown', (e) => {
      if (/INPUT|SELECT|TEXTAREA|BUTTON/.test(e.target.tagName)) return;
      this.keys[e.key.toLowerCase()] = true;
    });
    document.addEventListener('keyup', (e) => {
      this.keys[e.key.toLowerCase()] = false;
    });

    window.addEventListener('blur', () => { this.keys = {}; });

    // Pointer lock for mouse look
    const canvas = document.getElementById('main-canvas');
    canvas.addEventListener('click', () => {
      if (!this.isPointerLocked && this.mode === 'manual') {
        canvas.requestPointerLock();
      }
    });
    document.addEventListener('pointerlockchange', () => {
      this.isPointerLocked = document.pointerLockElement === canvas;
    });
    document.addEventListener('mousemove', (e) => {
      if (this.isPointerLocked && this.mode === 'manual') {
        this.yaw -= e.movementX * 0.003;
        this.pitch -= e.movementY * 0.002;
        this.pitch = Math.max(-0.8, Math.min(0.5, this.pitch));
      }
    });
  }

  setAutonomousWaypoints(waypoints) {
    this.waypoints = waypoints;
    this.waypointIndex = 0;
  }

  /**
   * Interrupt current patrol to investigate a detection
   */
  investigateDetection(targetPosition) {
    if (this.mode !== 'autonomous') return;
    this.isInvestigating = true;
    this.investigateTarget = targetPosition.clone();
    this.investigateTarget.y = this.position.y; // maintain altitude
    this.investigateTimer = 3; // seconds to investigate
    this.patrolPhase = 'investigating';
  }

  update(dt) {
    if (this.battery <= 0) return;

    this.simTime += dt;
    // Illustrative energy model, approximately 22 minutes at hover.
    // Battery drain
    this.battery = Math.max(0, this.battery - dt * (100 / (22 * 60)) * (1 + this.velocity.length() * 0.035));
    // Comms quality fluctuation
    this.commsQuality = Math.max(35, 99 - this.position.length() * 0.35 + Math.sin(this.simTime * 0.6) * 2);

    if (this.mode === 'manual') {
      this._updateManual(dt);
    } else {
      this._updateAutonomous(dt);
    }

    // Apply velocity with damping
    this.position.add(this.velocity.clone().multiplyScalar(dt));
    // Velocity damping is integrated in the time-based controller.

    // Clamp to mountain scene bounds
    this.position.x = Math.max(-55, Math.min(55, this.position.x));
    this.position.z = Math.max(-55, Math.min(55, this.position.z));

    // Dynamic Terrain Collision Avoidance & AGL altitude radar
    const groundY = getTerrainHeight(this.position.x, this.position.z);
    this.altitudeAGL = Math.max(0, this.position.y - groundY);

    // Ground clearance floor (drone skims over mountain terrain, no clipping)
    if (this.position.y < groundY + 1.2) {
      this.position.y = groundY + 1.2;
      if (this.velocity.y < 0) this.velocity.y = 0;
      this.altitudeAGL = 1.2;
    }
    this.position.y = Math.min(45, this.position.y);

    // Compute bank roll angle from lateral velocity and yaw rate
    this.roll = THREE.MathUtils.clamp(-this.velocity.x * 0.08, -0.4, 0.4);

    // Update mesh
    this.group.position.copy(this.position);
    this.group.rotation.set(
      this.pitch * 0.3, // tilt when looking up/down
      this.yaw,
      this.roll // bank into turns
    );

    // Spin rotors
    const rotorRate = ROTOR_SPEED * (1 + this.velocity.length() * 0.1);
    for (const rotor of this.rotors) {
      rotor.rotation.y += rotorRate * dt;
    }

    // Hover bob
    this.group.position.y += Math.sin(this.simTime * 3) * 0.02;

    // Track distance
    this.distanceTraveled += this.velocity.length() * dt;

    // Update trail
    this._updateTrail();
  }

  _steer(desired, dt) {
    const change = desired.clone().sub(this.velocity);
    const limit = 2.8 * dt;
    if (change.length() > limit) change.setLength(limit);
    this.velocity.add(change);
    // Small residual gust after the idealized position controller compensates.
    this.velocity.x += Math.sin(this.simTime * 1.7) * 0.035 * dt;
  }

  _updateManual(dt) {
    const desired = new THREE.Vector3(
      Number(!!this.keys.d) - Number(!!this.keys.a),
      0, Number(!!this.keys.s) - Number(!!this.keys.w));
    if (desired.lengthSq()) desired.normalize().multiplyScalar(DRONE_SPEED);
    desired.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);
    desired.y = (Number(!!this.keys.q) - Number(!!this.keys.e)) * DRONE_ASCEND_SPEED;
    this._steer(desired, dt);
  }

  _updateAutonomous(dt) {
    const target = this.isInvestigating ? this.investigateTarget : this.waypoints[this.waypointIndex];
    if (!target) { this._steer(new THREE.Vector3(), dt); return; }
    const delta = new THREE.Vector3(target.x - this.position.x, 0, target.z - this.position.z);
    const distance = delta.length();
    const desired = delta.clone().normalize().multiplyScalar(brakingSpeed(distance, 2.2, this.isInvestigating ? 2.5 : 4.5));
    const ahead = this.position.clone().addScaledVector(this.velocity, 1.2);
    const ground = Math.max(getTerrainHeight(this.position.x, this.position.z), getTerrainHeight(ahead.x, ahead.z));
    desired.y = THREE.MathUtils.clamp((ground + DEFAULT_ALTITUDE - this.position.y) * 1.5, -2, 3);
    this._steer(desired, dt);
    if (distance > 0.5) {
      const error = angleDelta(this.yaw, Math.atan2(-delta.x, -delta.z));
      this.yaw += THREE.MathUtils.clamp(error, -DRONE_TURN_SPEED * dt, DRONE_TURN_SPEED * dt);
    }
    this.pitch = approach(this.pitch, -Math.hypot(this.velocity.x, this.velocity.z) * 0.045, 3, dt);
    if (distance < 0.8) {
      if (this.isInvestigating) {
        this.investigateTimer -= dt;
        if (this.investigateTimer <= 0) {
          this.isInvestigating = false; this.investigateTarget = null; this.patrolPhase = 'exploring';
        }
      } else this.waypointIndex = (this.waypointIndex + 1) % this.waypoints.length;
    }
  }

  _updateTrail() {
    this.trail.push(this.position.clone());
    if (this.trail.length > 200) this.trail.shift();

    const positions = this.trailMesh.geometry.attributes.position.array;
    for (let i = 0; i < this.trail.length; i++) {
      positions[i * 3]     = this.trail[i].x;
      positions[i * 3 + 1] = this.trail[i].y;
      positions[i * 3 + 2] = this.trail[i].z;
    }
    this.trailMesh.geometry.attributes.position.needsUpdate = true;
    this.trailMesh.geometry.setDrawRange(0, this.trail.length);
  }

  getForwardDirection() {
    return new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);
  }

  getQuaternion() {
    const q = new THREE.Quaternion();
    q.setFromEuler(new THREE.Euler(this.pitch * 0.3, this.yaw, 0));
    return q;
  }

  getStatus() {
    return {
      id: this.id,
      position: this.position.clone(),
      altitude: this.position.y.toFixed(1),
      speed: this.velocity.length().toFixed(1),
      battery: Math.round(this.battery),
      mode: this.mode,
      phase: this.patrolPhase,
      comms: Math.round(this.commsQuality),
      distance: Math.round(this.distanceTraveled),
      detections: this.detectionCount,
    };
  }
}
