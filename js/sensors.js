/**
 * sensors.js — Multi-Sensor Simulation System
 * Simulates RGB, thermal, acoustic, gas/VOC, and proximity sensors
 * based on the drone's real position relative to scene objects.
 * 
 * This replaces the random-value get_sensor_snapshot() — here the
 * values are derived from actual distances and angles.
 */
import * as THREE from 'three';
import { objectRegistry } from './scene.js';

const DETECTION_RANGE = 18;     // max sensor range (meters)
const THERMAL_FOV = 60;         // degrees
const ACOUSTIC_RANGE = 25;      // acoustic pickup range
const GAS_RANGE = 10;           // gas sensor range

export class SensorSystem {
  constructor() {
    this.lastSnapshot = null;
    this.updateInterval = 0.5;  // seconds between full sensor sweeps
    this.timer = 0;
    this.detectedObjects = new Map(); // tracks what's been detected
    
    // RGB camera canvas
    this.rgbCanvas = document.getElementById('rgb-canvas');
    this.rgbCtx = this.rgbCanvas?.getContext('2d');
  }

  /**
   * Generate a full sensor snapshot from the drone's current state
   */
  update(drone, dt) {
    this.timer += dt;
    if (this.timer < this.updateInterval) return this.lastSnapshot;
    this.timer = 0;

    const dronePos = drone.position;
    const droneForward = drone.getForwardDirection();
    const snapshot = {
      timestamp: Date.now(),
      dronePosition: dronePos.clone(),
      droneAltitude: dronePos.y,
      detections: [],
    };

    // Scan all registered objects
    for (const [name, obj] of objectRegistry) {
      if (obj.type === 'terrain') continue;

      const objPos = obj.position;
      const toObj = objPos.clone().sub(dronePos);
      const distance = toObj.length();

      if (distance > DETECTION_RANGE) continue;

      // Calculate angle from drone forward direction to object (horizontal)
      const toObjFlat = toObj.clone();
      toObjFlat.y = 0;
      toObjFlat.normalize();
      const forwardFlat = droneForward.clone();
      forwardFlat.y = 0;
      forwardFlat.normalize();
      const angle = Math.acos(Math.max(-1, Math.min(1, forwardFlat.dot(toObjFlat))));
      const angleDeg = (angle * 180) / Math.PI;

      // Is it in FOV?
      const inFOV = angleDeg < THERMAL_FOV / 2;

      // Visibility factor (closer + more centered = clearer)
      const distanceFactor = 1 - distance / DETECTION_RANGE;
      const angleFactor = inFOV ? 1 - angleDeg / (THERMAL_FOV / 2) : 0;
      const visibility = distanceFactor * 0.6 + angleFactor * 0.4;

      // ── Thermal sensor ──
      const thermalReading = {
        temperature: obj.temperature,
        confidence: inFOV ? Math.min(0.98, visibility * 0.9 + Math.random() * 0.1) : 0,
        isHumanRange: obj.temperature >= 308 && obj.temperature <= 313,
        isFireRange: obj.temperature > 523,  // 250°C threshold from Section 4
      };

      // ── RGB sensor ──
      const rgbReading = {
        detected: inFOV && distance < 15,
        confidence: inFOV ? Math.min(0.95, visibility * 0.85 + Math.random() * 0.1) : 0,
        shapeClassification: classifyShape(obj.type),
        occluded: obj.metadata?.occluded ?? false,
      };

      // ── Acoustic sensor ──
      const acousticReading = {
        detected: distance < ACOUSTIC_RANGE && obj.metadata?.acousticSignal === true,
        confidence: obj.metadata?.acousticSignal
          ? Math.min(0.9, (1 - distance / ACOUSTIC_RANGE) * 0.8 + Math.random() * 0.15)
          : 0,
        signalType: obj.metadata?.acousticSignal ? 'human_vocalization' : null,
      };

      // ── Gas/VOC sensor ──
      const gasReading = {
        detected: distance < GAS_RANGE && (obj.type === 'fire' || obj.temperature > 500),
        co_ppm: obj.type === 'fire' ? Math.max(0, 150 - distance * 15 + Math.random() * 20) : 0,
        voc_ppm: obj.type === 'fire' ? Math.max(0, 80 - distance * 8 + Math.random() * 10) : 0,
      };

      // ── Proximity / Hazard distance ──
      const proximity = {
        distance: distance,
        bearing: angleDeg,
        inFOV: inFOV,
        isObstacle: obj.type === 'debris' || obj.type === 'structure',
      };

      // ── Fire-specific checks (Section 4) ──
      let fireCheck = null;
      if (obj.type === 'fire' || thermalReading.isFireRange) {
        fireCheck = {
          tempAboveThreshold: obj.temperature > 523,
          irFlickerHz: obj.type === 'fire' ? 2.1 + Math.random() * 0.8 : 0,
          rgbMotionTexture: obj.type === 'fire',
          irFlickerInRange: obj.type === 'fire', // 1-3Hz
        };
      }

      // ── Structural risk (Section 4) ──
      let structuralCheck = null;
      if (obj.type === 'structure' && obj.metadata?.structuralRisk) {
        structuralCheck = {
          risk: obj.metadata.structuralRisk,
          vibrationSignature: 0.3 + Math.random() * 0.2,
          thermalCreep: Math.random() * 0.1,
        };
      }

      // ── Power line check (Section 4) ──
      let powerLineCheck = null;
      if (obj.type === 'power_line') {
        powerLineCheck = {
          linearThermalAnomaly: true,
          nearGridInfra: true, // grid_infra_marker is nearby in the scene
          temperature: obj.temperature,
        };
      }

      // ── Flood check (Section 4) ──
      let floodCheck = null;
      if (obj.type === 'flood') {
        floodCheck = {
          reflectivitySignature: obj.metadata?.reflectivity ?? 0.5,
          demDelta: obj.metadata?.demDelta ?? 0,
        };
      }

      snapshot.detections.push({
        name,
        type: obj.type,
        position: objPos.clone(),
        distance,
        inFOV,
        visibility,
        thermal: thermalReading,
        rgb: rgbReading,
        acoustic: acousticReading,
        gas: gasReading,
        proximity,
        fireCheck,
        structuralCheck,
        powerLineCheck,
        floodCheck,
        metadata: obj.metadata || {},
      });
    }

    // Sort by relevance (closest + highest visibility first)
    snapshot.detections.sort((a, b) => b.visibility - a.visibility);

    this.lastSnapshot = snapshot;
    return snapshot;
  }

  /**
   * Render RGB camera feed to PiP canvas
   */
  renderRGBFeed(renderer, scene, camera) {
    if (!this.rgbCtx) return;

    // We'll render a small view from the drone camera
    const width = 320, height = 240;
    
    // Create a temporary render target
    const renderTarget = new THREE.WebGLRenderTarget(width, height);
    
    renderer.setRenderTarget(renderTarget);
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);

    // Read pixels
    const pixels = new Uint8Array(width * height * 4);
    renderer.readRenderTargetPixels(renderTarget, 0, 0, width, height, pixels);

    const imageData = this.rgbCtx.createImageData(width, height);
    // Flip Y
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const srcIdx = ((height - 1 - y) * width + x) * 4;
        const dstIdx = (y * width + x) * 4;
        imageData.data[dstIdx]     = pixels[srcIdx];
        imageData.data[dstIdx + 1] = pixels[srcIdx + 1];
        imageData.data[dstIdx + 2] = pixels[srcIdx + 2];
        imageData.data[dstIdx + 3] = 255;
      }
    }
    this.rgbCtx.putImageData(imageData, 0, 0);

    // HUD overlay
    this.rgbCtx.strokeStyle = 'rgba(0, 212, 255, 0.3)';
    this.rgbCtx.lineWidth = 1;
    // Crosshair
    const cx = width / 2, cy = height / 2;
    this.rgbCtx.beginPath();
    this.rgbCtx.arc(cx, cy, 20, 0, Math.PI * 2);
    this.rgbCtx.stroke();
    this.rgbCtx.beginPath();
    this.rgbCtx.moveTo(cx - 30, cy); this.rgbCtx.lineTo(cx - 8, cy);
    this.rgbCtx.moveTo(cx + 8, cy);  this.rgbCtx.lineTo(cx + 30, cy);
    this.rgbCtx.moveTo(cx, cy - 30); this.rgbCtx.lineTo(cx, cy - 8);
    this.rgbCtx.moveTo(cx, cy + 8);  this.rgbCtx.lineTo(cx, cy + 30);
    this.rgbCtx.stroke();

    // Detection boxes
    if (this.lastSnapshot) {
      for (const det of this.lastSnapshot.detections) {
        if (!det.inFOV || det.distance > 15) continue;
        if (det.type === 'debris' || det.type === 'terrain' || det.type === 'infrastructure') continue;

        // Approximate screen position based on angle and distance
        const toObj = det.position.clone().sub(this.lastSnapshot.dronePosition);
        const screenX = cx + (toObj.x * 15);
        const screenY = cy + (toObj.z * 10);
        const boxSize = Math.max(20, 60 / det.distance);

        if (screenX > 0 && screenX < width && screenY > 0 && screenY < height) {
          const color = det.type === 'person' ? 'rgba(0, 255, 136, 0.7)'
                      : det.type === 'fire' ? 'rgba(233, 69, 96, 0.7)'
                      : 'rgba(255, 170, 0, 0.7)';
          this.rgbCtx.strokeStyle = color;
          this.rgbCtx.lineWidth = 2;
          this.rgbCtx.strokeRect(screenX - boxSize/2, screenY - boxSize/2, boxSize, boxSize);
          this.rgbCtx.fillStyle = color;
          this.rgbCtx.font = '9px JetBrains Mono';
          this.rgbCtx.fillText(
            `${det.type.toUpperCase()} ${(det.thermal.confidence * 100).toFixed(0)}%`,
            screenX - boxSize/2, screenY - boxSize/2 - 4
          );
        }
      }
    }

    renderTarget.dispose();
  }
}

function classifyShape(type) {
  switch (type) {
    case 'person': return 'humanoid';
    case 'fire': return 'amorphous';
    case 'power_line': return 'linear';
    case 'flood': return 'planar';
    case 'false_positive': return 'non_humanoid';
    case 'debris': return 'irregular';
    case 'structure': return 'rectangular';
    default: return 'unknown';
  }
}
