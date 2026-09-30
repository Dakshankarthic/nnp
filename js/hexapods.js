/**
 * hexapods.js — NNP Ground Fleet (Hexapod UGVs) & Geofence Convex Hull
 * 
 * Implements the NNP Air-Ground SAR specification:
 * - Heterogeneous ground swarm: G1–G7 Hexapod walking UGVs
 * - Stationed at perimeter terrain vertices forming the enforced airspace boundary
 * - Convex hull boundary with APF (Artificial Potential Field) laser curtain
 * - Micro-elevation LiDAR (Livox Mid-360) sweep & RTK FIXED mast
 * - Dynamic corridor gate beacon mode during extraction
 */
import * as THREE from 'three';
import { getTerrainHeight } from './scene.js';

// 7-Vertex Geofence Polygon (local terrain coordinates)
export const GEOFENCE_VERTICES = [
  { id: 'G1', x: -22, z: 22, label: 'G1 · Moyar River Gate', rtk: 'RTK_FIXED', bat: 98, role: 'PRIMARY_GATE' },
  { id: 'G2', x: -26, z: 4, label: 'G2 · West Shoreline', rtk: 'RTK_FIXED', bat: 95, role: 'PERIMETER_ANCHOR' },
  { id: 'G3', x: -18, z: -22, label: 'G3 · Northwest Ridge', rtk: 'RTK_FIXED', bat: 92, role: 'PERIMETER_ANCHOR' },
  { id: 'G4', x: 8, z: -25, label: 'G4 · Scarp Headwall', rtk: 'RTK_FIXED', bat: 97, role: 'PERIMETER_ANCHOR' },
  { id: 'G5', x: 25, z: -12, label: 'G5 · East Shoulder', rtk: 'RTK_FIXED', bat: 94, role: 'PERIMETER_ANCHOR' },
  { id: 'G6', x: 24, z: 15, label: 'G6 · Southeast Slope', rtk: 'RTK_FIXED', bat: 96, role: 'PERIMETER_ANCHOR' },
  { id: 'G7', x: 2, z: 24, label: 'G7 · South Corridor', rtk: 'RTK_FIXED', bat: 99, role: 'PERIMETER_ANCHOR' },
];

export class HexapodFleet {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.scene.add(this.group);

    this.hexapods = [];
    this.lidarSweeps = [];
    this.statusLeds = [];
    this.gateHexapodId = 'G1';

    this.fenceLine = null;
    this.fenceCurtain = null;

    this._buildFleet();
    this._buildGeofenceHull();
  }

  _buildFleet() {
    GEOFENCE_VERTICES.forEach((v, index) => {
      const hexapod = this._createHexapodRobot(v, index);
      this.hexapods.push(hexapod);
      this.group.add(hexapod.group);
    });
  }

  _createHexapodRobot(data, index) {
    const group = new THREE.Group();
    const groundY = getTerrainHeight(data.x, data.z);
    group.position.set(data.x, groundY + 0.35, data.z);

    // Orientation: face inward towards the incident center
    const angleToCenter = Math.atan2(-data.x, -data.z);
    group.rotation.y = angleToCenter + Math.PI;

    // Materials
    const carbonMat = new THREE.MeshStandardMaterial({
      color: 0x181c22,
      roughness: 0.35,
      metalness: 0.8,
    });
    const titaniumMat = new THREE.MeshStandardMaterial({
      color: 0x5a6572,
      roughness: 0.25,
      metalness: 0.9,
    });
    const orangeAcc = new THREE.MeshStandardMaterial({
      color: 0xff6600,
      roughness: 0.4,
      metalness: 0.3,
    });
    const glowGreen = new THREE.MeshStandardMaterial({
      color: 0x00ff88,
      emissive: 0x00ff88,
      emissiveIntensity: 2.5,
    });
    const glowAmber = new THREE.MeshStandardMaterial({
      color: 0xffaa00,
      emissive: 0xffaa00,
      emissiveIntensity: 3.0,
    });

    // 1. Central Chassis (Hexagonal Pod Body)
    const chassisGeo = new THREE.CylinderGeometry(0.55, 0.65, 0.32, 6);
    const chassis = new THREE.Mesh(chassisGeo, carbonMat);
    chassis.castShadow = true;
    chassis.receiveShadow = true;
    group.add(chassis);

    // Chassis Top Armor Plate
    const topPlate = new THREE.Mesh(
      new THREE.CylinderGeometry(0.48, 0.52, 0.08, 6),
      titaniumMat
    );
    topPlate.position.y = 0.18;
    group.add(topPlate);

    // High-capacity LiPo Battery Module
    const batGeo = new THREE.BoxGeometry(0.42, 0.16, 0.55);
    const battery = new THREE.Mesh(batGeo, orangeAcc);
    battery.position.set(0, 0.05, 0);
    group.add(battery);

    // 2. Six Articulated Robotic Walking Legs (3 left, 3 right)
    const legAngles = [
      Math.PI / 6, Math.PI / 2, 5 * Math.PI / 6,
      -Math.PI / 6, -Math.PI / 2, -5 * Math.PI / 6
    ];

    const legs = [];
    legAngles.forEach((angle, legIdx) => {
      const legGroup = new THREE.Group();
      legGroup.rotation.y = angle;

      // Coxa (shoulder joint)
      const coxa = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.14, 0.14), titaniumMat);
      coxa.position.set(0.52, 0, 0);
      legGroup.add(coxa);

      // Femur (upper leg angled downward)
      const femur = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.48, 8), carbonMat);
      femur.rotation.z = -Math.PI / 4;
      femur.position.set(0.68, -0.12, 0);
      legGroup.add(femur);

      // Tibia (lower leg reaching terrain footpad)
      const tibia = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.03, 0.55, 8), titaniumMat);
      tibia.rotation.z = Math.PI / 5;
      tibia.position.set(0.88, -0.42, 0);
      legGroup.add(tibia);

      // Rubber Footpad
      const foot = new THREE.Mesh(new THREE.SphereGeometry(0.065, 8, 8), carbonMat);
      foot.position.set(0.96, -0.65, 0);
      legGroup.add(foot);

      group.add(legGroup);
      legs.push(legGroup);
    });

    // 3. Rotating LiDAR Turret (Livox Mid-360)
    const lidarMount = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.12, 12), titaniumMat);
    lidarMount.position.set(0, 0.28, 0);
    group.add(lidarMount);

    const lidarPuck = new THREE.Mesh(new THREE.CylinderGeometry(0.10, 0.10, 0.10, 16), carbonMat);
    lidarPuck.position.set(0, 0.38, 0);
    group.add(lidarPuck);

    // Laser optical slit on LiDAR
    const lidarSlit = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.03, 0.08),
      new THREE.MeshBasicMaterial({ color: 0x00c8ff })
    );
    lidarSlit.position.set(0, 0.38, 0.06);
    lidarPuck.add(lidarSlit);

    // 4. RTK GNSS Antenna Mast & Status Beacon
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.65, 8), titaniumMat);
    mast.position.set(-0.25, 0.45, -0.22);
    group.add(mast);

    const rtkAntenna = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.09, 12), carbonMat);
    rtkAntenna.position.set(-0.25, 0.78, -0.22);
    group.add(rtkAntenna);

    // RTK Fixed LED Beacon
    const rtkLed = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 8), glowGreen);
    rtkLed.position.set(-0.25, 0.84, -0.22);
    group.add(rtkLed);

    // Emergency Gate Beacon (lights up when designated extraction gate)
    const gateBeacon = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.06, 0.08), glowAmber);
    gateBeacon.position.set(0, 0.24, -0.28);
    gateBeacon.visible = (data.id === this.gateHexapodId);
    group.add(gateBeacon);

    // 5. Dual Forward Search Headlights
    const lightGeo = new THREE.CylinderGeometry(0.05, 0.06, 0.08, 12);
    lightGeo.rotateX(Math.PI / 2);
    const lightMat = new THREE.MeshBasicMaterial({ color: 0xffffff });

    const leftLight = new THREE.Mesh(lightGeo, lightMat);
    leftLight.position.set(-0.24, 0.08, 0.52);
    group.add(leftLight);

    const rightLight = new THREE.Mesh(lightGeo, lightMat);
    rightLight.position.set(0.24, 0.08, 0.52);
    group.add(rightLight);

    // 6. Ground Scan Projection Disc (FAST-LIO2 DEM field)
    const scanRing = new THREE.Mesh(
      new THREE.RingGeometry(0.7, 1.8, 24),
      new THREE.MeshBasicMaterial({
        color: 0x00ff88,
        transparent: true,
        opacity: 0.12,
        side: THREE.DoubleSide,
      })
    );
    scanRing.rotation.x = -Math.PI / 2;
    scanRing.position.y = -0.34;
    group.add(scanRing);

    // Track dynamic components
    this.lidarSweeps.push(lidarPuck);
    this.statusLeds.push({ led: rtkLed, beacon: gateBeacon, id: data.id });

    return {
      id: data.id,
      data,
      group,
      puck: lidarPuck,
      rtkLed,
      gateBeacon,
      scanRing,
      legs,
      baseY: groundY + 0.35,
    };
  }

  _buildGeofenceHull() {
    // 1. Boundary Perimeter Ground Line
    const perimeterPoints = GEOFENCE_VERTICES.map(v => {
      const y = getTerrainHeight(v.x, v.z) + 0.45;
      return new THREE.Vector3(v.x, y, v.z);
    });
    // Loop back to first vertex to close convex hull
    perimeterPoints.push(perimeterPoints[0].clone());

    const lineGeo = new THREE.BufferGeometry().setFromPoints(perimeterPoints);
    const lineMat = new THREE.LineBasicMaterial({
      color: 0x00ffaa,
      transparent: true,
      opacity: 0.85,
      linewidth: 3,
    });
    this.fenceLine = new THREE.Line(lineGeo, lineMat);
    this.group.add(this.fenceLine);

    // 2. Translucent APF Airspace Laser Curtain (rising from ground to 30m AGL)
    const curtainGeo = new THREE.BufferGeometry();
    const vertices = [];
    const uvs = [];

    for (let i = 0; i < perimeterPoints.length - 1; i++) {
      const p1 = perimeterPoints[i];
      const p2 = perimeterPoints[i + 1];
      const ceilY1 = p1.y + 12.0;
      const ceilY2 = p2.y + 12.0;

      // Two triangles per fence segment
      vertices.push(
        p1.x, p1.y, p1.z,
        p2.x, p2.y, p2.z,
        p2.x, ceilY2, p2.z,

        p1.x, p1.y, p1.z,
        p2.x, ceilY2, p2.z,
        p1.x, ceilY1, p1.z
      );

      uvs.push(0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1);
    }

    curtainGeo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    curtainGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));

    const curtainMat = new THREE.MeshBasicMaterial({
      color: 0x00ffcc,
      transparent: true,
      opacity: 0.07,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    this.fenceCurtain = new THREE.Mesh(curtainGeo, curtainMat);
    this.group.add(this.fenceCurtain);
  }

  setGateHexapod(id) {
    this.gateHexapodId = id;
    this.hexapods.forEach(h => {
      if (h.gateBeacon) {
        h.gateBeacon.visible = (h.id === id);
      }
    });
  }

  update(time) {
    // 1. Rotate LiDAR sensor heads
    this.lidarSweeps.forEach((puck, idx) => {
      puck.rotation.y = time * 3.5 + idx;
    });

    // 2. Pulse RTK LEDs and scan footprints
    const pulse = 0.5 + 0.5 * Math.sin(time * 3.0);
    this.hexapods.forEach(h => {
      if (h.scanRing) {
        h.scanRing.material.opacity = 0.08 + pulse * 0.08;
      }
      if (h.gateBeacon && h.gateBeacon.visible) {
        const beaconPulse = 0.5 + 0.5 * Math.sin(time * 8.0);
        h.gateBeacon.material.emissiveIntensity = 1.0 + beaconPulse * 3.5;
      }
      // Subtle natural breathing motion for standing robot
      h.group.position.y = h.baseY + Math.sin(time * 1.5 + h.data.x) * 0.008;
    });

    // 3. Subtle pulse on Geofence Curtain
    if (this.fenceCurtain) {
      this.fenceCurtain.material.opacity = 0.05 + 0.03 * Math.sin(time * 1.8);
    }
  }

  getFleetTelemetry() {
    return GEOFENCE_VERTICES.map(v => ({
      id: v.id,
      kind: 'HEXAPOD_UGV',
      label: v.label,
      role: (v.id === this.gateHexapodId) ? 'EXTRACTION_GATE_BEACON' : v.role,
      rtk: v.rtk,
      battery: v.bat,
      elevation: Number(getTerrainHeight(v.x, v.z).toFixed(1)),
      position: { x: v.x, z: v.z },
      status: (v.id === this.gateHexapodId) ? 'CORRIDOR_BEACON' : 'PERIMETER_ANCHORED',
    }));
  }
}
