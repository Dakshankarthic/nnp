/**
 * pathfinder.js — Nav2-Style Fused Costmap A* Route Planner (NNP Algorithm)
 * 
 * Implements the NNP Air-Ground SAR Pathfinding formulation:
 *   f(p) = g(p) + h(p) + w1 · C_aerial(p) + w2 · C_traversability(p)
 * 
 * Where:
 *   - w1 = 3.0 (C_aerial: segmented river channels, landslide scar keepouts, hazards)
 *   - w2 = 2.0 (C_traversability: micro-elevation DEM slope and step-over height)
 *   - Hard traversability cutoff: incline >= 25° or step >= 0.40m are impassable
 *   - Trajectory post-processing: Ramer-Douglas-Peucker (RDP) polyline smoothing
 */
import * as THREE from 'three';
import { getTerrainHeight, objectRegistry } from './scene.js';

const GRID_MIN = -30;
const GRID_MAX = 30;
const CELL_SIZE = 1.5;
const GRID_COUNT = Math.floor((GRID_MAX - GRID_MIN) / CELL_SIZE) + 1;

// NNP Weight constants
const W_AERIAL = 3.0;
const W_TRAVERSABILITY = 2.0;
export const MAX_INCLINE_DEG = 25.0;
export const MAX_STEP_M = 0.40;

const HAZARD_RULES = {
  fire: { buffer: 8.5, weight: 90 },
  downed_power_line: { buffer: 7.0, weight: 75 },
  flood: { buffer: 6.5, weight: 60 },
  structural_instability: { buffer: 5.5, weight: 50 },
};

export class RescuePathfinder {
  constructor(scene) {
    this.scene = scene;
    this.routeLine = null;
    this.routeNodes = [];
  }

  dispatchRoute(targetPosition) {
    if (!targetPosition) return null;

    // Rescue dispatch base / command post vertex
    const start = new THREE.Vector3(-24, 0, 22);
    const goal = new THREE.Vector3(targetPosition.x, 0, targetPosition.z);
    const rawPath = this._findPath(start, goal);

    if (!rawPath.length) return null;

    // Apply RDP polyline simplification from NNP flight stack
    const smoothedPath = ramerDouglasPeucker(rawPath, 0.4);
    this._drawRoute(smoothedPath);

    // Compute route metrics
    let totalDist = 0;
    let maxIncline = 0;
    let sumAerial = 0;
    let sumTrav = 0;

    for (let i = 0; i < smoothedPath.length - 1; i++) {
      const p1 = smoothedPath[i];
      const p2 = smoothedPath[i + 1];
      const dx = p2.x - p1.x;
      const dz = p2.z - p1.z;
      const dy = getTerrainHeight(p2.x, p2.z) - getTerrainHeight(p1.x, p1.z);
      const horiz = Math.hypot(dx, dz);
      totalDist += Math.hypot(horiz, dy);

      if (horiz > 0.001) {
        const inclineDeg = (Math.atan(Math.abs(dy) / horiz) * 180) / Math.PI;
        if (inclineDeg > maxIncline) maxIncline = inclineDeg;
      }

      const c = this._calculateCosts(p1);
      sumAerial += c.aerial;
      sumTrav += c.trav;
    }

    return {
      status: 'route_ready',
      etaMinutes: Math.max(2, Math.round(totalDist * 0.45)),
      distanceMeters: Math.round(totalDist * 10),
      maxInclineDeg: Number(maxIncline.toFixed(1)),
      algorithm: 'NNP Nav2 A* (Fused C_aerial + C_trav)',
      costBreakdown: {
        aerialCost: Number(sumAerial.toFixed(2)),
        travCost: Number(sumTrav.toFixed(2)),
        totalCost: Number((sumAerial * W_AERIAL + sumTrav * W_TRAVERSABILITY).toFixed(2)),
      },
      waypoints: smoothedPath.map((p, idx) => ({
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

  _calculateCosts(worldPos) {
    const d = 1.0;
    const hCenter = getTerrainHeight(worldPos.x, worldPos.z);
    const dhX = (getTerrainHeight(worldPos.x + d, worldPos.z) - getTerrainHeight(worldPos.x - d, worldPos.z)) / (2 * d);
    const dhZ = (getTerrainHeight(worldPos.x, worldPos.z + d) - getTerrainHeight(worldPos.x, worldPos.z - d)) / (2 * d);
    const slopeDeg = (Math.atan(Math.hypot(dhX, dhZ)) * 180) / Math.PI;

    // Micro-elevation step height
    const stepHeight = 0.08 + 0.25 * Math.abs(Math.sin(worldPos.x * 0.8) * Math.cos(worldPos.z * 0.8));

    // Hard cutoff checks from NNP spec
    if (slopeDeg >= MAX_INCLINE_DEG || stepHeight >= MAX_STEP_M) {
      return { aerial: 999, trav: 999, impassable: true };
    }

    // Traversability cost
    const trav = Math.pow(slopeDeg / MAX_INCLINE_DEG, 2) * 0.6 + (stepHeight / MAX_STEP_M) * 0.4;

    // Aerial segmentation cost (hazards + water keepout)
    let aerial = 0.1;
    for (const [, obj] of objectRegistry) {
      const rule = HAZARD_RULES[obj.type];
      if (!rule) continue;

      const dx = worldPos.x - obj.position.x;
      const dz = worldPos.z - obj.position.z;
      const dist = Math.hypot(dx, dz);

      if (dist < rule.buffer * 0.45) {
        return { aerial: 999, trav: 999, impassable: true };
      }
      if (dist < rule.buffer) {
        aerial += (rule.weight / Math.max(1, dist * dist)) * 0.1;
      }
    }

    return { aerial, trav, impassable: false };
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

        const worldNext = gridToWorld(next);
        const costInfo = this._calculateCosts(worldNext);
        if (costInfo.impassable) continue;

        // Fused cost formula from NNP: g + h + w1*C_aerial + w2*C_trav
        const fusedCellCost = 1.0 + W_AERIAL * costInfo.aerial + W_TRAVERSABILITY * costInfo.trav;
        const tentativeG = current.g + fusedCellCost * heuristic(current, next);
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

  _drawRoute(points) {
    this.clearRoute();

    const vPoints = points.map(p => new THREE.Vector3(
      p.x,
      getTerrainHeight(p.x, p.z) + 0.35,
      p.z
    ));

    const geometry = new THREE.BufferGeometry().setFromPoints(vPoints);
    const material = new THREE.LineBasicMaterial({
      color: 0x00ffcc,
      transparent: true,
      opacity: 0.95,
      linewidth: 3,
    });
    this.routeLine = new THREE.Line(geometry, material);
    this.scene.add(this.routeLine);

    for (let i = 0; i < vPoints.length; i++) {
      const isEndpoint = (i === 0 || i === vPoints.length - 1);
      const marker = new THREE.Mesh(
        new THREE.SphereGeometry(isEndpoint ? 0.32 : 0.16, 12, 12),
        new THREE.MeshBasicMaterial({ color: isEndpoint ? 0x00ff88 : 0x00c8ff })
      );
      marker.position.copy(vPoints[i]);
      this.scene.add(marker);
      this.routeNodes.push(marker);
    }
  }
}

// ── Helpers ───────────────────────────────────────────────────────
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
  let curr = node;
  while (curr) {
    path.unshift({ x: curr.x, z: curr.z });
    curr = curr.parent;
  }
  return path;
}

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

// Ramer-Douglas-Peucker algorithm for polyline simplification
function ramerDouglasPeucker(points, epsilon) {
  if (points.length <= 2) return points;

  let maxDist = 0;
  let index = 0;
  const p1 = points[0];
  const p2 = points[points.length - 1];

  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i];
    const dist = perpendicularDistance(p, p1, p2);
    if (dist > maxDist) {
      maxDist = dist;
      index = i;
    }
  }

  if (maxDist > epsilon) {
    const left = ramerDouglasPeucker(points.slice(0, index + 1), epsilon);
    const right = ramerDouglasPeucker(points.slice(index), epsilon);
    return left.slice(0, -1).concat(right);
  } else {
    return [p1, p2];
  }
}

function perpendicularDistance(p, lineStart, lineEnd) {
  const dx = lineEnd.x - lineStart.x;
  const dz = lineEnd.z - lineStart.z;
  const len = Math.hypot(dx, dz);
  if (len === 0) return Math.hypot(p.x - lineStart.x, p.z - lineStart.z);
  return Math.abs(dz * p.x - dx * p.z + lineEnd.x * lineStart.z - lineEnd.z * lineStart.x) / len;
}
