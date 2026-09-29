/**
 * thermal.js — Defense-Grade Thermal Camera Rendering System
 * Renders LWIR (8-14μm) thermal imaging with FLIR-standard palettes:
 * - IRONBOW (Standard FLIR spectrum)
 * - WHITE_HOT (Tactical reconnaissance standard)
 * - BLACK_HOT (High-contrast edge surveillance)
 * Includes spot pyrometer with dynamic temperature readout (Kelvin + Celsius).
 */
import * as THREE from 'three';
import { objectRegistry } from './scene.js';

// Temperature bounds
const TEMP_MIN = 285;  // ~12°C (ambient/cold ground)
const TEMP_MAX = 900;  // ~627°C (flame/combustion)

// IRONBOW palette
const PALETTE_IRONBOW = [
  { t: 0.0,  color: new THREE.Color(0.02, 0.02, 0.15) }, // cold: deep blue
  { t: 0.15, color: new THREE.Color(0.15, 0.02, 0.45) }, // cool: purple
  { t: 0.30, color: new THREE.Color(0.50, 0.05, 0.45) }, // warm-low: magenta
  { t: 0.45, color: new THREE.Color(0.80, 0.12, 0.15) }, // warm: red
  { t: 0.60, color: new THREE.Color(0.95, 0.40, 0.00) }, // hot: orange
  { t: 0.75, color: new THREE.Color(1.00, 0.70, 0.05) }, // hotter: yellow-orange
  { t: 0.90, color: new THREE.Color(1.00, 0.95, 0.40) }, // very hot: pale yellow
  { t: 1.00, color: new THREE.Color(1.00, 1.00, 1.00) }, // extreme: white
];

function normalizeTemp(tempK) {
  return Math.max(0, Math.min(1, (tempK - TEMP_MIN) / (TEMP_MAX - TEMP_MIN)));
}

function samplePalette(palette, t) {
  let lower = palette[0], upper = palette[palette.length - 1];
  for (let i = 0; i < palette.length - 1; i++) {
    if (t >= palette[i].t && t <= palette[i + 1].t) {
      lower = palette[i];
      upper = palette[i + 1];
      break;
    }
  }
  const factor = (t - lower.t) / (upper.t - lower.t || 1);
  const color = new THREE.Color();
  color.lerpColors(lower.color, upper.color, factor);
  return color;
}

export function tempToColor(tempK, paletteMode = 'ironbow') {
  const t = normalizeTemp(tempK);
  if (paletteMode === 'white_hot') {
    return new THREE.Color(t, t, t);
  } else if (paletteMode === 'black_hot') {
    const inv = 1 - t;
    return new THREE.Color(inv, inv, inv);
  }
  return samplePalette(PALETTE_IRONBOW, t);
}

export class ThermalRenderer {
  constructor(renderer, width = 320, height = 240) {
    this.renderer = renderer;
    this.width = width;
    this.height = height;
    this.currentPalette = 'ironbow'; // 'ironbow' | 'white_hot' | 'black_hot'

    this.renderTarget = new THREE.WebGLRenderTarget(width, height, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
    });

    this.camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 120);
    this.thermalMaterials = new Map();
    this.originalMaterials = new Map();
    this.thermalBgColor = new THREE.Color(0.01, 0.01, 0.05);

    this.canvas = document.getElementById('thermal-canvas');
    this.ctx = this.canvas?.getContext('2d');
    this.pixelBuffer = new Uint8Array(width * height * 4);
    this.noiseTime = 0;

    // Spot pyrometer readings
    this.centerTempK = 300;
    this.centerTempC = 26.85;

    // Raycaster for surface temperature detection
    this.raycaster = new THREE.Raycaster();
  }

  setPalette(mode) {
    if (['ironbow', 'white_hot', 'black_hot'].includes(mode)) {
      this.currentPalette = mode;
      this.thermalMaterials.clear(); // invalidate cache
    }
  }

  getThermalMaterial(tempK) {
    const key = `${this.currentPalette}_${Math.round(tempK)}`;
    if (this.thermalMaterials.has(key)) return this.thermalMaterials.get(key);

    const color = tempToColor(tempK, this.currentPalette);
    const material = new THREE.MeshBasicMaterial({
      color: color,
      fog: false,
    });
    this.thermalMaterials.set(key, material);
    return material;
  }

  applyThermalMaterials(scene) {
    this.originalMaterials.clear();
    scene.traverse((obj) => {
      if (!obj.isMesh) return;
      this.originalMaterials.set(obj.uuid, obj.material);

      let temp = obj.userData.temperature;
      if (temp == null) {
        let parent = obj.parent;
        while (parent && parent.userData.temperature == null) parent = parent.parent;
        temp = parent?.userData.temperature ?? 300;
      }
      obj.material = this.getThermalMaterial(temp);
    });
  }

  restoreOriginalMaterials(scene) {
    scene.traverse((obj) => {
      if (!obj.isMesh) return;
      const orig = this.originalMaterials.get(obj.uuid);
      if (orig) obj.material = orig;
    });
    this.originalMaterials.clear();
  }

  updateCamera(dronePosition, droneQuaternion) {
    this.camera.position.copy(dronePosition);
    this.camera.quaternion.copy(droneQuaternion);
    this.camera.rotateX(-0.35); // Gimbal nadir tilt
  }

  render(scene, time) {
    if (!this.ctx) return;
    this.noiseTime = time;

    const prevBg = scene.background;
    const prevFog = scene.fog;

    scene.background = this.currentPalette === 'black_hot' ? new THREE.Color(0.9, 0.9, 0.9) : this.thermalBgColor;
    scene.fog = null;

    this.applyThermalMaterials(scene);

    this.renderer.setRenderTarget(this.renderTarget);
    this.renderer.render(scene, this.camera);
    this.renderer.setRenderTarget(null);

    this.restoreOriginalMaterials(scene);
    scene.background = prevBg;
    scene.fog = prevFog;

    this.renderer.readRenderTargetPixels(
      this.renderTarget, 0, 0, this.width, this.height, this.pixelBuffer
    );

    const imageData = this.ctx.createImageData(this.width, this.height);

    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const srcIdx = ((this.height - 1 - y) * this.width + x) * 4;
        const dstIdx = (y * this.width + x) * 4;
        const noise = (Math.random() - 0.5) * 5;
        imageData.data[dstIdx]     = Math.min(255, Math.max(0, this.pixelBuffer[srcIdx] + noise));
        imageData.data[dstIdx + 1] = Math.min(255, Math.max(0, this.pixelBuffer[srcIdx + 1] + noise));
        imageData.data[dstIdx + 2] = Math.min(255, Math.max(0, this.pixelBuffer[srcIdx + 2] + noise));
        imageData.data[dstIdx + 3] = 255;
      }
    }

    this.ctx.putImageData(imageData, 0, 0);

    // Center raycast for spot pyrometer
    this.raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);
    const intersects = this.raycaster.intersectObjects(scene.children, true);
    let targetTemp = 300;
    if (intersects.length > 0) {
      let hit = intersects[0].object;
      while (hit && hit.userData.temperature == null && hit.parent) {
        hit = hit.parent;
      }
      if (hit && hit.userData.temperature != null) {
        targetTemp = hit.userData.temperature;
      }
    }
    this.centerTempK = targetTemp;
    this.centerTempC = (targetTemp - 273.15).toFixed(1);

    // Military crosshair HUD overlay
    const cx = this.width / 2, cy = this.height / 2;
    this.ctx.strokeStyle = this.currentPalette === 'black_hot' ? 'rgba(0,0,0,0.8)' : 'rgba(0, 230, 255, 0.8)';
    this.ctx.lineWidth = 1.2;

    // Corner brackets
    this.ctx.strokeRect(cx - 16, cy - 16, 32, 32);

    // Cross reticles
    this.ctx.beginPath();
    this.ctx.moveTo(cx - 24, cy); this.ctx.lineTo(cx - 18, cy);
    this.ctx.moveTo(cx + 18, cy); this.ctx.lineTo(cx + 24, cy);
    this.ctx.moveTo(cx, cy - 24); this.ctx.lineTo(cx, cy - 18);
    this.ctx.moveTo(cx, cy + 18); this.ctx.lineTo(cx, cy + 24);
    this.ctx.stroke();

    // Pyrometer readout
    this.ctx.fillStyle = this.currentPalette === 'black_hot' ? '#000' : '#00ffcc';
    this.ctx.font = 'bold 11px JetBrains Mono, monospace';
    this.ctx.fillText(`${this.centerTempC}°C`, cx + 22, cy - 4);
    this.ctx.font = '9px JetBrains Mono, monospace';
    this.ctx.fillStyle = 'rgba(255,255,255,0.7)';
    this.ctx.fillText(`${Math.round(this.centerTempK)}K`, cx + 22, cy + 10);

    // Calibration bar at bottom
    const barW = 80, barH = 4, barX = 10, barY = this.height - 12;
    const grad = this.ctx.createLinearGradient(barX, 0, barX + barW, 0);
    grad.addColorStop(0, '#001144');
    grad.addColorStop(0.5, '#dd2211');
    grad.addColorStop(1, '#ffffff');
    this.ctx.fillStyle = grad;
    this.ctx.fillRect(barX, barY, barW, barH);
    this.ctx.fillStyle = 'rgba(255,255,255,0.6)';
    this.ctx.font = '8px JetBrains Mono, monospace';
    this.ctx.fillText(`FLIR LWIR [${this.currentPalette.toUpperCase()}]`, barX, barY - 4);
  }
}

export { normalizeTemp, TEMP_MIN, TEMP_MAX };
