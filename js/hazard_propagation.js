/**
 * hazard_propagation.js - visual hazard forecast overlay.
 * Shows likely fire/flood/power keep-out growth for now, +15, +30, +60 minutes.
 */
import * as THREE from 'three';
import { getTerrainHeight, objectRegistry } from './scene.js';

const FORECASTS = {
  0: { fire: 2.8, flood: 5.0, power: 3.8, opacity: 0.08 },
  15: { fire: 5.2, flood: 7.0, power: 4.8, opacity: 0.12 },
  30: { fire: 7.8, flood: 9.5, power: 5.8, opacity: 0.16 },
  60: { fire: 11.5, flood: 13.0, power: 7.2, opacity: 0.20 },
};

export class HazardPropagation {
  constructor(scene) {
    this.scene = scene;
    this.minutes = 15;
    this.group = new THREE.Group();
    this.scene.add(this.group);
    this.rebuild();
  }

  setForecastMinutes(minutes) {
    this.minutes = Number(minutes);
    this.rebuild();
  }

  update(time) {
    this.group.children.forEach((child, idx) => {
      child.material.opacity = child.userData.baseOpacity + Math.sin(time * 2 + idx) * 0.04;
      child.rotation.z += child.userData.spin * 0.002;
    });
  }

  getSummary() {
    const f = FORECASTS[this.minutes] || FORECASTS[15];
    return {
      minutes: this.minutes,
      fireRadius: f.fire,
      floodRadius: f.flood,
      evacuationRisk: this.minutes >= 30 ? 'ESCALATING' : 'CONTAINED',
    };
  }

  rebuild() {
    this.group.clear();
    const forecast = FORECASTS[this.minutes] || FORECASTS[15];

    for (const [, obj] of objectRegistry) {
      if (obj.type === 'fire') {
        this._addDisc(obj.position, forecast.fire, 0xff3355, forecast.opacity, 0.45);
        this._addWindLobe(obj.position, forecast.fire * 1.6, 0xff7a2a, forecast.opacity * 0.7);
      }
      if (obj.type === 'flood') {
        this._addDisc(obj.position, forecast.flood, 0x00c8ff, forecast.opacity * 0.8, 0.15);
      }
      if (obj.type === 'downed_power_line') {
        this._addDisc(obj.position, forecast.power, 0xffaa00, forecast.opacity * 0.75, -0.2);
      }
    }
  }

  _addDisc(position, radius, color, opacity, spin) {
    const geometry = new THREE.CircleGeometry(radius, 64);
    const material = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(position.x, getTerrainHeight(position.x, position.z) + 0.18, position.z);
    mesh.userData.baseOpacity = opacity;
    mesh.userData.spin = spin;
    this.group.add(mesh);

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(radius * 0.96, radius, 64),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: Math.min(0.9, opacity + 0.25),
        depthWrite: false,
        side: THREE.DoubleSide,
      })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.copy(mesh.position);
    ring.userData.baseOpacity = Math.min(0.9, opacity + 0.25);
    ring.userData.spin = -spin;
    this.group.add(ring);
  }

  _addWindLobe(position, radius, color, opacity) {
    const geometry = new THREE.CircleGeometry(radius, 48, 0, Math.PI * 0.72);
    const material = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.rotation.z = -0.45;
    mesh.position.set(position.x + radius * 0.32, getTerrainHeight(position.x, position.z) + 0.2, position.z - radius * 0.15);
    mesh.userData.baseOpacity = opacity;
    mesh.userData.spin = 0.1;
    this.group.add(mesh);
  }
}
