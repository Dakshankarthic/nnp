/**
 * swarm.js — NNP-SAR Swarm Coordinator
 * Multiple autonomous drones with frontier-based exploration,
 * mesh network visualization, and coverage heatmap.
 * Matches Section 7 & 13 of the report.
 */
import * as THREE from 'three';
import { Drone } from './drone.js';
import { getTerrainHeight } from './scene.js';

// Frontier exploration waypoints — designed to cover the disaster zone
const PATROL_ROUTES = [
  // Drone 2: Northeast sector
  [
    { x: 5, z: -5 }, { x: 10, z: -3 }, { x: 10, z: 5 },
    { x: 5, z: 8 }, { x: 8, z: 2 }, { x: 3, z: -2 },
  ],
  // Drone 3: Northwest sector
  [
    { x: -5, z: -5 }, { x: -10, z: -2 }, { x: -12, z: -8 },
    { x: -8, z: 5 }, { x: -5, z: 8 }, { x: -3, z: 2 },
  ],
];

export class SwarmCoordinator {
  constructor(scene, primaryDrone) {
    this.scene = scene;
    this.primaryDrone = primaryDrone;
    this.auxiliaryDrones = [];
    this.meshLinks = [];
    this.coverageMap = new Map(); // grid cell -> visit count

    // Coverage heatmap
    this.coverageGrid = null;
    this._buildCoverageGrid();

    // Create auxiliary drones
    this._createSwarmDrones();

    // Mesh network visualization
    this._buildMeshNetwork();
  }

  _createSwarmDrones() {
    const colors = [0xa855f7, 0x00ff88];
    const names = ['NNP-2', 'NNP-3'];

    for (let i = 0; i < 2; i++) {
      const drone = new Drone(this.scene, names[i], colors[i]);
      drone.mode = 'autonomous';
      drone.position.set(
        (i === 0 ? 3 : -3),
        8 + Math.random() * 2,
        (i === 0 ? -3 : 3)
      );
      drone.setAutonomousWaypoints(PATROL_ROUTES[i]);
      drone.battery = 90 + Math.random() * 10;
      this.auxiliaryDrones.push(drone);
    }
  }

  _buildMeshNetwork() {
    // Lines connecting drones to visualize mesh topology
    const lineMat = new THREE.LineBasicMaterial({
      color: 0x00d4ff,
      transparent: true,
      opacity: 0.15,
    });

    // We'll update these positions every frame
    const allDrones = [this.primaryDrone, ...this.auxiliaryDrones];
    
    for (let i = 0; i < allDrones.length; i++) {
      for (let j = i + 1; j < allDrones.length; j++) {
        const geo = new THREE.BufferGeometry();
        const positions = new Float32Array(6);
        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        const line = new THREE.Line(geo, lineMat.clone());
        line.userData.droneA = i;
        line.userData.droneB = j;
        this.scene.add(line);
        this.meshLinks.push(line);
      }
    }
  }

  _buildCoverageGrid() {
    // Ground-level heatmap showing which areas have been swept
    const gridSize = 60;
    const cellSize = 2;
    const cellCount = gridSize / cellSize;

    const geo = new THREE.PlaneGeometry(gridSize, gridSize, cellCount, cellCount);
    geo.rotateX(-Math.PI / 2);

    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const gx = pos.getX(i);
      const gz = pos.getZ(i);
      pos.setY(i, getTerrainHeight(gx, gz) + 0.12);
    }
    geo.computeVertexNormals();

    const mat = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
    });

    // Initialize vertex colors
    const colors = new Float32Array(geo.attributes.position.count * 3);
    for (let i = 0; i < colors.length; i += 3) {
      colors[i] = 0;     // r
      colors[i + 1] = 0;  // g
      colors[i + 2] = 0;  // b
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    this.coverageGrid = new THREE.Mesh(geo, mat);
    this.scene.add(this.coverageGrid);
  }

  update(dt) {
    const allDrones = [this.primaryDrone, ...this.auxiliaryDrones];

    // Update auxiliary drones
    for (const drone of this.auxiliaryDrones) {
      drone.update(dt);
    }

    // Update mesh network links
    for (const link of this.meshLinks) {
      const a = allDrones[link.userData.droneA];
      const b = allDrones[link.userData.droneB];
      if (!a || !b || !a.position || !b.position) continue;
      const pos = link.geometry.attributes.position.array;
      pos[0] = a.position.x; pos[1] = a.position.y; pos[2] = a.position.z;
      pos[3] = b.position.x; pos[4] = b.position.y; pos[5] = b.position.z;
      link.geometry.attributes.position.needsUpdate = true;

      // Adjust opacity based on distance (simulating signal strength)
      const dist = a.position.distanceTo(b.position);
      link.material.opacity = Math.max(0.03, Math.min(0.2, 1 - dist / 50));
      // Color: green if strong, amber if weak
      if (dist < 20) {
        link.material.color.setHex(0x00d4ff);
      } else if (dist < 35) {
        link.material.color.setHex(0xffaa00);
      } else {
        link.material.color.setHex(0xe94560);
      }
    }

    // Update coverage heatmap
    if (this.coverageGrid) {
      const colors = this.coverageGrid.geometry.attributes.color;
      const positions = this.coverageGrid.geometry.attributes.position;

      for (let i = 0; i < positions.count; i++) {
        const wx = positions.getX(i);
        const wz = positions.getZ(i);

        for (const drone of allDrones) {
          const dx = drone.position.x - wx;
          const dz = drone.position.z - wz;
          const dist = Math.sqrt(dx * dx + dz * dz);

          if (dist < 8) {
            const intensity = 0.003 * (1 - dist / 8);
            // Cyan glow for coverage
            colors.array[i * 3]     = Math.min(0.1, colors.array[i * 3] + intensity * 0.3);
            colors.array[i * 3 + 1] = Math.min(0.5, colors.array[i * 3 + 1] + intensity);
            colors.array[i * 3 + 2] = Math.min(0.6, colors.array[i * 3 + 2] + intensity);
          }
        }
      }
      colors.needsUpdate = true;
    }
  }

  getAllDroneStatuses() {
    return [
      this.primaryDrone.getStatus(),
      ...this.auxiliaryDrones.map(d => d.getStatus()),
    ];
  }

  getAreaSweptPercentage() {
    if (!this.coverageGrid) return 0;

    const colors = this.coverageGrid.geometry.attributes.color;
    let sweptCells = 0;
    const totalCells = colors.count;

    for (let i = 0; i < totalCells; i++) {
      if (colors.array[i * 3 + 1] > 0.05) sweptCells++;
    }

    return Math.min(100, Math.round((sweptCells / totalCells) * 100));
  }
}
