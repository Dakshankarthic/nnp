/**
 * pathfinder.js - rescue route generation over a tactical cost grid.
 * Produces a ground-safe route that avoids known fire, flood, power, and unstable zones.
 */
import * as THREE from 'three';
import { getTerrainHeight, objectRegistry } from './scene.js';

const GRID_MIN = -30;
const GRID_MAX = 30;
const CELL_SIZE = 2;
const GRID_COUNT = Math.floor((GRID_MAX - GRID_MIN) / CELL_SIZE) + 1;

const HAZARD_RULES = {
  fire: { buffer: 8, weight: 80 },
  downed_power_line: { buffer: 7, weight: 70 },
  flood: { buffer: 6, weight: 55 },
  structural_instability: { buffer: 5, weight: 45 },
};

export class RescuePathfinder {
  constructor(scene) {
    this.scene = scene;
    this.routeLine = null;
    this.routeNodes = [];
  }

  dispatchRoute(targetPosition) {
    if (!targetPosition) return null;

    const start = new THREE.Vector3(-26, 0, 24);
    const goal = new THREE.Vector3(targetPosition.x, 0, targetPosition.z);
    const path = this._findPath(start, goal);

    if (!path.length) return null;
    this._drawRoute(path);

    return {
      status: 'route_ready',
      etaMinutes: Math.max(3, Math.round(path.length * 0.45)),
      distanceMeters: Math.round(path.length * CELL_SIZE * 12),
      waypoints: path.map((p, idx) => ({
        id: idx + 1,
        x: Number(p.x.toFixed(1)),
        z: Number(p.z.toFixed(1)),
        elevation: Number(getTerrainHeight(p.x, p.z).toFixed(1)),
      })),
    };
  }

  clearRoute() {
    if (this.routeLine) {
      this.scene.remove(this.routeLine);
      this.routeLine.geometry.dispose();
      this.routeLine.material.dispose();
      this.routeLine = null;
    }

    for (const node of this.routeNodes) {
      this.scene.remove(node);
      node.geometry.dispose();
      node.material.dispose();
    }
    this.routeNodes = [];
  }

  _findPath(startWorld, goalWorld) {
    const start = worldToGrid(startWorld);
    const goal = worldToGrid(goalWorld);
    const open = new Map();
    const closed = new Set();
    const startKey = key(start);

    open.set(startKey, {
      ...start,
      g: 0,
      h: heuristic(start, goal),
      parent: null,
    });

    while (open.size) {
      let currentKey = null;
      let current = null;
      for (const [candidateKey, candidate] of open) {
        if (!current || candidate.g + candidate.h < current.g + current.h) {
          current = candidate;
          currentKey = candidateKey;
        }
      }

      if (!current) break;
      if (current.x === goal.x && current.z === goal.z) {
        return reconstruct(current).map(gridToWorld);
      }

      open.delete(currentKey);
      closed.add(currentKey);

      for (const next of neighbors(current)) {
        const nextKey = key(next);
        if (closed.has(nextKey)) continue;

        const stepCost = this._cellCost(next);
        if (stepCost >= 999) continue;

        const tentativeG = current.g + stepCost + heuristic(current, next);
        const existing = open.get(nextKey);

        if (!existing || tentativeG < existing.g) {
          open.set(nextKey, {
            ...next,
            g: tentativeG,
            h: heuristic(next, goal),
            parent: current,
          });
        }
      }
    }

    return [];
  }

  _cellCost(cell) {
    const world = gridToWorld(cell);
    let cost = 1;

    const slope = Math.abs(
      getTerrainHeight(world.x + CELL_SIZE, world.z) - getTerrainHeight(world.x - CELL_SIZE, world.z)
    ) + Math.abs(
      getTerrainHeight(world.x, world.z + CELL_SIZE) - getTerrainHeight(world.x, world.z - CELL_SIZE)
    );
    cost += slope * 0.8;

    for (const [, obj] of objectRegistry) {
      const rule = HAZARD_RULES[obj.type];
      if (!rule) continue;

      const dx = world.x - obj.position.x;
      const dz = world.z - obj.position.z;
      const dist = Math.sqrt(dx * dx + dz * dz);

      if (dist < rule.buffer * 0.48) return 999;
      if (dist < rule.buffer) cost += rule.weight / Math.max(1, dist * dist);
    }

    return cost;
  }

  _drawRoute(path) {
    this.clearRoute();

    const points = path.map(p => new THREE.Vector3(
      p.x,
      getTerrainHeight(p.x, p.z) + 0.28,
      p.z
    ));

    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({
      color: 0x00ff88,
      transparent: true,
      opacity: 0.95,
      linewidth: 3,
    });
    this.routeLine = new THREE.Line(geometry, material);
    this.scene.add(this.routeLine);

    for (let i = 0; i < points.length; i += Math.max(1, Math.floor(points.length / 10))) {
      const marker = new THREE.Mesh(
        new THREE.SphereGeometry(0.18, 12, 12),
        new THREE.MeshBasicMaterial({ color: 0x00ff88 })
      );
      marker.position.copy(points[i]);
      this.scene.add(marker);
      this.routeNodes.push(marker);
    }
  }
}

function worldToGrid(pos) {
  return {
    x: clamp(Math.round((pos.x - GRID_MIN) / CELL_SIZE), 0, GRID_COUNT - 1),
    z: clamp(Math.round((pos.z - GRID_MIN) / CELL_SIZE), 0, GRID_COUNT - 1),
  };
}

function gridToWorld(cell) {
  return {
    x: GRID_MIN + cell.x * CELL_SIZE,
    z: GRID_MIN + cell.z * CELL_SIZE,
  };
}

function neighbors(cell) {
  const result = [];
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dz === 0) continue;
      const x = cell.x + dx;
      const z = cell.z + dz;
      if (x >= 0 && x < GRID_COUNT && z >= 0 && z < GRID_COUNT) result.push({ x, z });
    }
  }
  return result;
}

function heuristic(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function key(cell) {
  return `${cell.x},${cell.z}`;
}

function reconstruct(node) {
  const path = [];
  let current = node;
  while (current) {
    path.unshift(current);
    current = current.parent;
  }
  return path;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
