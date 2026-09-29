/**
 * scene.js — AEGIS-SAR Defense-Grade Real-Time Mountain Landslide Disaster Simulation
 * Photorealistic alpine disaster environment:
 * - 360° Jagged distant mountain perimeter (eliminating empty voids)
 * - Atmospheric daylight overcast sky dome & harmonized Rayleigh fog
 * - In-memory procedural PBR terrain textures (normal, diffuse, wet-mud roughness)
 * - Soft volumetric particle sprites (billowing smoke, glowing fire, tumbling 3D rockslide)
 * - Naturalistic multi-tier alpine spruce trees & disaster debris field
 * - Tactical emergency SAR vehicle with flashing beacons & high-voltage lattice pylon
 */
import * as THREE from 'three';

// ── Object Registry (for Sensor & Thermal Integration) ───────────
export const objectRegistry = new Map();

export function registerObject(name, mesh, type, tempK, metadata = {}) {
  mesh.name = name;
  mesh.userData.type = type;
  mesh.userData.temperature = tempK;
  mesh.userData.metadata = metadata;
  objectRegistry.set(name, {
    mesh, type, temperature: tempK,
    position: mesh.position.clone(),
    metadata
  });
}

function mat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color(color),
    roughness: opts.roughness ?? 0.85,
    metalness: opts.metalness ?? 0.1,
    emissive: opts.emissive ?? new THREE.Color(0, 0, 0),
    emissiveIntensity: opts.emissiveIntensity ?? 0,
    flatShading: opts.flat ?? false,
    transparent: opts.transparent ?? false,
    opacity: opts.opacity ?? 1,
  });
}

// ── Terrain Elevation Model (Mountain & Landslide Scarp) ──────────
export function getTerrainHeight(x, z) {
  let h = 0;

  // Regional mountain ridge (rises toward east x > 2)
  if (x > 2) {
    const m = (x - 2) / 30;
    h += Math.min(26, Math.max(0, m * 24));
  }

  // Western foothills
  if (x < -15) {
    h += Math.sin(x * 0.15) * Math.cos(z * 0.1) * 3 + 2;
  }

  // Main Landslide Scarp & Chute (between z = -25 and z = 25)
  const inSlideZ = Math.max(0, 1 - Math.abs(z) / 28);
  if (x > 0 && x < 28 && inSlideZ > 0) {
    // Carve out catastrophic amphitheater hollow
    const carve = Math.sin((x / 28) * Math.PI) * 9 * inSlideZ;
    h -= carve;
  }

  // Landslide Debris Tongue / Deposit Mounds (West of x = 5)
  if (x >= -24 && x <= 6 && inSlideZ > 0) {
    const lobe = Math.cos(((x + 9) / 16) * Math.PI * 0.5) * 4.5 * inSlideZ;
    h += Math.max(0, lobe);
    // Chaotic hummocks (uneven debris mounds)
    h += Math.sin(x * 0.8) * Math.cos(z * 0.7) * 1.4 * inSlideZ;
    h += Math.cos(x * 1.6 + z * 1.2) * 0.8 * inSlideZ;
  }

  // Natural terrain roughness (fractal detail)
  h += Math.sin(x * 0.2 + 1.2) * Math.cos(z * 0.18) * 1.8;
  h += Math.sin(x * 0.5 - z * 0.4) * 0.6;
  h += Math.cos(x * 0.9 + z * 0.8) * 0.25;

  return Math.max(0.1, h);
}

// ── In-Memory Procedural PBR Texture Generators ───────────────────
let terrainTextures = null;

function generateProceduralTerrainTextures() {
  const size = 1024;

  // 1. Diffuse Canvas (Alpine slate rock, gravel, pine soil, and dark wet silt)
  const diffCanvas = document.createElement('canvas');
  diffCanvas.width = size;
  diffCanvas.height = size;
  const diffCtx = diffCanvas.getContext('2d');

  // Fill base mountain soil tone
  diffCtx.fillStyle = '#262420';
  diffCtx.fillRect(0, 0, size, size);

  const imgData = diffCtx.getImageData(0, 0, size, size);
  const data = imgData.data;

  // 2. Normal Canvas
  const normCanvas = document.createElement('canvas');
  normCanvas.width = size;
  normCanvas.height = size;
  const normCtx = normCanvas.getContext('2d');
  const normImgData = normCtx.createImageData(size, size);
  const normData = normImgData.data;

  // 3. Roughness Canvas
  const roughCanvas = document.createElement('canvas');
  roughCanvas.width = size;
  roughCanvas.height = size;
  const roughCtx = roughCanvas.getContext('2d');
  const roughImgData = roughCtx.createImageData(size, size);
  const roughData = roughImgData.data;

  // Height map buffer for normal map Sobel calculation
  const heightBuffer = new Float32Array(size * size);

  // Synthesize multi-frequency terrain noise
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;

      // Multi-octave organic noise
      const n1 = Math.sin(u * 28.0) * Math.cos(v * 28.0);
      const n2 = Math.sin(u * 64.0 + 1.4) * Math.sin(v * 64.0 + 0.8) * 0.5;
      const n3 = Math.sin(u * 140.0) * Math.cos(v * 140.0) * 0.25;
      const n4 = (Math.random() - 0.5) * 0.15; // micro-grain
      const hVal = (n1 + n2 + n3 + n4 + 1.8) / 3.6;
      heightBuffer[y * size + x] = Math.max(0, Math.min(1, hVal));

      const idx = (y * size + x) * 4;

      // Rock grain and soil variation
      const rBase = 46 + Math.round(hVal * 42);
      const gBase = 44 + Math.round(hVal * 38);
      const bBase = 38 + Math.round(hVal * 34);

      data[idx]     = Math.min(255, rBase);
      data[idx + 1] = Math.min(255, gBase);
      data[idx + 2] = Math.min(255, bBase);
      data[idx + 3] = 255;

      // Roughness: rocks (0.85-0.95), slick ground (0.5)
      const rVal = Math.round((0.72 + hVal * 0.25) * 255);
      roughData[idx]     = rVal;
      roughData[idx + 1] = rVal;
      roughData[idx + 2] = rVal;
      roughData[idx + 3] = 255;
    }
  }

  // Calculate Normal Map from height buffer (Sobel operator)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const left  = heightBuffer[y * size + ((x - 1 + size) % size)];
      const right = heightBuffer[y * size + ((x + 1) % size)];
      const up    = heightBuffer[((y - 1 + size) % size) * size + x];
      const down  = heightBuffer[((y + 1) % size) * size + x];

      const dx = (right - left) * 2.8;
      const dy = (down - up) * 2.8;
      const dz = 1.0;
      const len = Math.sqrt(dx * dx + dy * dy + dz * dz);

      const nx = dx / len;
      const ny = dy / len;
      const nz = dz / len;

      const idx = (y * size + x) * 4;
      normData[idx]     = Math.round((nx * 0.5 + 0.5) * 255);
      normData[idx + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      normData[idx + 2] = Math.round((nz * 0.5 + 0.5) * 255);
      normData[idx + 3] = 255;
    }
  }

  diffCtx.putImageData(imgData, 0, 0);
  normCtx.putImageData(normImgData, 0, 0);
  roughCtx.putImageData(roughImgData, 0, 0);

  const diffTex = new THREE.CanvasTexture(diffCanvas);
  diffTex.wrapS = THREE.RepeatWrapping;
  diffTex.wrapT = THREE.RepeatWrapping;
  diffTex.repeat.set(14, 14);

  const normTex = new THREE.CanvasTexture(normCanvas);
  normTex.wrapS = THREE.RepeatWrapping;
  normTex.wrapT = THREE.RepeatWrapping;
  normTex.repeat.set(14, 14);

  const roughTex = new THREE.CanvasTexture(roughCanvas);
  roughTex.wrapS = THREE.RepeatWrapping;
  roughTex.wrapT = THREE.RepeatWrapping;
  roughTex.repeat.set(14, 14);

  return { diffuse: diffTex, normal: normTex, roughness: roughTex };
}

// ── Soft Particle Sprite Generators (Eliminating Square Pixels) ───
export function createSoftParticleTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');

  const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0.0, 'rgba(255, 255, 255, 1.0)');
  grad.addColorStop(0.18, 'rgba(255, 215, 110, 0.9)');
  grad.addColorStop(0.45, 'rgba(255, 120, 25, 0.45)');
  grad.addColorStop(0.75, 'rgba(210, 45, 10, 0.15)');
  grad.addColorStop(1.0, 'rgba(0, 0, 0, 0.0)');

  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);

  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

export function createSmokePuffTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');

  const lobes = [
    { x: 64, y: 64, r: 54, a: 0.65 },
    { x: 50, y: 52, r: 42, a: 0.45 },
    { x: 78, y: 56, r: 40, a: 0.45 },
    { x: 62, y: 76, r: 44, a: 0.45 },
  ];

  for (const lb of lobes) {
    const grad = ctx.createRadialGradient(lb.x, lb.y, 0, lb.x, lb.y, lb.r);
    grad.addColorStop(0.0, `rgba(240, 240, 240, ${lb.a})`);
    grad.addColorStop(0.45, `rgba(180, 180, 180, ${lb.a * 0.6})`);
    grad.addColorStop(0.85, `rgba(120, 120, 120, ${lb.a * 0.18})`);
    grad.addColorStop(1.0, 'rgba(60, 60, 60, 0.0)');

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(lb.x, lb.y, lb.r, 0, Math.PI * 2);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

// ── Terrain Mesh with PBR Procedural Texturing ────────────────────
let terrainMesh = null;

function createLandslideTerrain(scene) {
  if (!terrainTextures) {
    terrainTextures = generateProceduralTerrainTextures();
  }

  const sizeX = 140, sizeZ = 140;
  const segments = 130;
  const geo = new THREE.PlaneGeometry(sizeX, sizeZ, segments, segments);
  geo.rotateX(-Math.PI / 2);

  const pos = geo.attributes.position;
  const colors = [];
  const color = new THREE.Color();

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const y = getTerrainHeight(x, z);
    pos.setY(i, y);

    const inSlideZ = Math.max(0, 1 - Math.abs(z) / 28);
    const isSlideChute = (x > -24 && x < 24 && inSlideZ > 0.18);

    if (isSlideChute) {
      // Landslide deposit: saturated dark wet clay, mud, displaced earth
      const mudDarkness = 0.10 + Math.random() * 0.06;
      color.setRGB(mudDarkness * 1.3, mudDarkness * 0.95, mudDarkness * 0.65); // Realistic dark wet soil
    } else if (y > 17) {
      // High rocky alpine ridge / exposed cold slate granite
      const rock = 0.32 + Math.random() * 0.08;
      color.setRGB(rock * 0.95, rock * 1.0, rock * 1.08);
    } else if (y > 7) {
      // Scree and subalpine heather
      color.setRGB(0.20, 0.22, 0.17);
    } else {
      // Valley vegetation and rich mountain soil
      color.setRGB(0.14, 0.18, 0.12);
    }

    colors.push(color.r, color.g, color.b);
  }

  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.computeVertexNormals();

  const terrainMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    map: terrainTextures.diffuse,
    normalMap: terrainTextures.normal,
    normalScale: new THREE.Vector2(1.2, 1.2),
    roughnessMap: terrainTextures.roughness,
    roughness: 0.82,
    metalness: 0.06,
    flatShading: false,
    envMapIntensity: 0.4,
  });

  terrainMesh = new THREE.Mesh(geo, terrainMat);
  terrainMesh.receiveShadow = true;
  terrainMesh.castShadow = false;
  scene.add(terrainMesh);
  registerObject('landslide_terrain', terrainMesh, 'terrain', 295);

  // Bedrock foundation slab
  const baseGeo = new THREE.PlaneGeometry(160, 160);
  baseGeo.rotateX(-Math.PI / 2);
  const baseMat = mat('#121614', { roughness: 1.0 });
  const baseMesh = new THREE.Mesh(baseGeo, baseMat);
  baseMesh.position.y = -0.15;
  baseMesh.receiveShadow = true;
  scene.add(baseMesh);
}

// ── 360° Distant Mountain Perimeter Panorama ───────────────────────
// Eliminates the "floating toy island in empty void" look
function createDistantMountains(scene) {
  const innerR = 66;
  const outerR = 290;
  const radialSegs = 120;
  const rings = 26;
  const geo = new THREE.RingGeometry(innerR, outerR, radialSegs, rings);
  geo.rotateX(-Math.PI / 2);

  const pos = geo.attributes.position;
  const colors = [];
  const col = new THREE.Color();

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const r = Math.sqrt(x * x + z * z);
    const theta = Math.atan2(z, x);

    // Distance progress: 0 at local terrain boundary, 1 at distant horizon
    const t = Math.max(0, Math.min(1, (r - innerR) / (outerR - innerR)));

    // Height of local terrain edge for seamless boundary connection
    const edgeX = Math.cos(theta) * 62;
    const edgeZ = Math.sin(theta) * 62;
    const localH = Math.max(1.0, getTerrainHeight(edgeX, edgeZ));

    // Jagged alpine mountain skyline harmonics
    const ridge1 = Math.sin(theta * 5.0) * 20;
    const ridge2 = Math.cos(theta * 11.0 + 1.2) * 14;
    const ridge3 = Math.sin(theta * 21.0 + 0.6) * 8;
    const ridgeSpur = Math.sin(r * 0.05 + theta * 7.0) * 10 * t;
    const microH = Math.sin(x * 0.035) * Math.cos(z * 0.035) * 8;

    const mountainLift = Math.pow(t, 1.25) * (48 + ridge1 + ridge2 + ridge3 + ridgeSpur + microH);
    const y = (1.0 - t) * localH + mountainLift;
    pos.setY(i, Math.max(0.4, y));

    // Natural mountain color zoning
    if (y > 44) {
      // Snow-covered glaciated alpine peaks
      const snow = 0.70 + Math.random() * 0.12;
      col.setRGB(snow * 0.95, snow * 0.98, snow * 1.05);
    } else if (y > 24) {
      // Rugged bare granite cliffs
      const rock = 0.24 + Math.random() * 0.08;
      col.setRGB(rock, rock * 1.05, rock * 1.15);
    } else if (y > 12) {
      // Subalpine scree & timberline
      col.setRGB(0.16, 0.19, 0.15);
    } else {
      // Foothill pine canopy
      col.setRGB(0.11, 0.15, 0.11);
    }

    colors.push(col.r, col.g, col.b);
  }

  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.computeVertexNormals();

  const mountainMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.94,
    metalness: 0.04,
    flatShading: false,
  });

  const mountains = new THREE.Mesh(geo, mountainMat);
  mountains.receiveShadow = true;
  scene.add(mountains);
}

// ── Mountain Atmospheric Sky Dome & Lighting ───────────────────────
function createAtmosphere(scene) {
  // Fog matches horizon color perfectly for seamless aerial depth
  scene.fog = new THREE.FogExp2(0x324454, 0.0068);

  // Daylight overcast mountain sky dome
  const skyGeo = new THREE.SphereGeometry(320, 32, 24);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: {
      zenithColor:  { value: new THREE.Color(0x162332) }, // cold slate alpine zenith
      midColor:     { value: new THREE.Color(0x28384a) }, // overcast mountain cloud bank
      horizonColor: { value: new THREE.Color(0x324454) }, // matches fog
      sunGlow:      { value: new THREE.Color(0xffe2bf) }, // warm dawn break through clouds
      sunDir:       { value: new THREE.Vector3(35, 55, 25).normalize() },
    },
    vertexShader: `
      varying vec3 vWorldPos;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: `
      uniform vec3 zenithColor;
      uniform vec3 midColor;
      uniform vec3 horizonColor;
      uniform vec3 sunGlow;
      uniform vec3 sunDir;
      varying vec3 vWorldPos;

      void main() {
        vec3 dir = normalize(vWorldPos);
        float h = dir.y;

        // Atmospheric Rayleigh-like gradient
        vec3 col = mix(horizonColor, midColor, smoothstep(-0.02, 0.22, h));
        col = mix(col, zenithColor, smoothstep(0.18, 0.85, h));

        // Soft sun disk & atmospheric halo
        float sunDot = max(0.0, dot(dir, sunDir));
        float halo = pow(sunDot, 10.0) * 0.35 + pow(sunDot, 48.0) * 0.65;
        col += sunGlow * halo;

        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });

  const sky = new THREE.Mesh(skyGeo, skyMat);
  scene.add(sky);
}

function createLighting(scene) {
  // Primary sun — warm disaster-dawn angle through storm break
  const sun = new THREE.DirectionalLight(0xffdfb8, 1.35);
  sun.position.set(35, 55, 25);
  sun.castShadow = true;
  sun.shadow.mapSize.width = 4096;
  sun.shadow.mapSize.height = 4096;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 200;
  sun.shadow.camera.left = -70;
  sun.shadow.camera.right = 70;
  sun.shadow.camera.top = 70;
  sun.shadow.camera.bottom = -70;
  sun.shadow.bias = -0.0003;
  sun.shadow.normalBias = 0.02;
  scene.add(sun);

  // Cold blue sky rim fill
  const rimLight = new THREE.DirectionalLight(0x486688, 0.50);
  rimLight.position.set(-40, 30, -30);
  scene.add(rimLight);

  // Ground bounce
  const fill = new THREE.DirectionalLight(0x4a3a28, 0.25);
  fill.position.set(0, -10, 0);
  scene.add(fill);

  // Overcast storm sky above, dark mud below
  const hemi = new THREE.HemisphereLight(0x384a5c, 0x1e1610, 0.85);
  scene.add(hemi);

  // Ambient fill
  const ambient = new THREE.AmbientLight(0x141e28, 0.40);
  scene.add(ambient);
}

// ── Sheared Mountain Highway ─────────────────────────────────────
function createShearedRoad(scene) {
  const roadMat = mat('#242629', { roughness: 0.88 });
  const stripeMat = mat('#d8b835', { roughness: 0.6 });

  // North segment
  for (let z = -60; z < -18; z += 4) {
    const x = -8 + Math.sin(z * 0.05) * 4;
    const y = getTerrainHeight(x, z) + 0.15;
    const slab = new THREE.Mesh(new THREE.BoxGeometry(4.5, 0.22, 4.2), roadMat);
    slab.position.set(x, y, z);
    slab.rotation.y = -0.1;
    slab.receiveShadow = true;
    scene.add(slab);

    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.24, 2.5), stripeMat);
    stripe.position.set(x, y + 0.02, z);
    stripe.rotation.y = -0.1;
    scene.add(stripe);
  }

  // South segment
  for (let z = 18; z < 60; z += 4) {
    const x = -10 + Math.sin(z * 0.05) * 3;
    const y = getTerrainHeight(x, z) + 0.15;
    const slab = new THREE.Mesh(new THREE.BoxGeometry(4.5, 0.22, 4.2), roadMat);
    slab.position.set(x, y, z);
    slab.rotation.y = 0.08;
    slab.receiveShadow = true;
    scene.add(slab);

    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.24, 2.5), stripeMat);
    stripe.position.set(x, y + 0.02, z);
    stripe.rotation.y = 0.08;
    scene.add(stripe);
  }

  // Sheared cracked fracture edges
  const cracked1 = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.25, 3.5), roadMat);
  cracked1.position.set(-8, getTerrainHeight(-8, -16) + 0.5, -16);
  cracked1.rotation.set(0.35, 0.2, 0.15);
  scene.add(cracked1);
  registerObject('sheared_road_north', cracked1, 'structural_instability', 296, {
    label: 'Highway 108 — North Shear Point (Displaced)',
    risk: 0.88,
  });

  const cracked2 = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.25, 3.5), roadMat);
  cracked2.position.set(-10, getTerrainHeight(-10, 16) + 0.4, 16);
  cracked2.rotation.set(-0.3, -0.1, -0.2);
  scene.add(cracked2);
  registerObject('sheared_road_south', cracked2, 'structural_instability', 296, {
    label: 'Highway 108 — South Shear Point (Buried)',
    risk: 0.82,
  });
}

// ── Highway Guardrails ───────────────────────────────────────────
function createGuardrails(scene) {
  const steelMat = mat('#6a7480', { metalness: 0.85, roughness: 0.35 });

  for (const [zx, side] of [[-18, -1], [18, 1]]) {
    const gx = -8.5 + (side > 0 ? -1 : 1);
    const gz = zx;
    const gy = getTerrainHeight(gx, gz) + 0.4;

    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.35, 5.5), steelMat);
    rail.position.set(gx, gy, gz);
    rail.rotation.set(0.35 * side, 0.15, 0.25 * side);
    rail.castShadow = true;
    scene.add(rail);
  }
}

// ── Massive Boulders & Scree Field ───────────────────────────────
function createBoulders(scene) {
  const rockMat = mat('#3c3834', { roughness: 0.95 });

  const boulderConfigs = [
    { name: 'megalith_boulder_1', x: -4, z: -2, scale: [4.5, 3.2, 3.8], rot: [0.3, 1.2, 0.5], temp: 298 },
    { name: 'megalith_boulder_2', x: 2, z: 6, scale: [3.8, 2.6, 3.2], rot: [0.1, 0.8, -0.4], temp: 299 },
    { name: 'slide_boulder_3', x: -12, z: 4, scale: [2.8, 2.0, 2.4], rot: [0.4, 2.1, 0.2], temp: 297 },
    { name: 'slide_boulder_4', x: -8, z: -8, scale: [3.2, 2.2, 2.8], rot: [-0.2, 0.5, 0.3], temp: 298 },
    { name: 'warm_rock', x: 4, z: -10, scale: [2.2, 1.5, 2.0], rot: [0.2, 1.4, 0.1], temp: 305 }, // False positive benchmark
    { name: 'chute_boulder_6', x: 10, z: -2, scale: [3.0, 2.5, 2.8], rot: [0.5, 0.3, 0.6], temp: 299 },
  ];

  for (const b of boulderConfigs) {
    const geo = new THREE.DodecahedronGeometry(1.0, 1);
    const mesh = new THREE.Mesh(geo, rockMat);
    const y = getTerrainHeight(b.x, b.z) + (b.scale[1] * 0.4);
    mesh.position.set(b.x, y, b.z);
    mesh.scale.set(...b.scale);
    mesh.rotation.set(...b.rot);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);

    registerObject(b.name, mesh, b.name === 'warm_rock' ? 'heat_false_positive' : 'debris', b.temp, {
      label: b.name === 'warm_rock' ? 'Sun-warmed rock mass (Thermal False-Positive)' : 'Displaced granite boulder',
      massTonnes: (b.scale[0] * b.scale[1] * b.scale[2] * 2.7).toFixed(1),
    });
  }

  // Scattered gravel hummocks (instanced rock debris)
  const pebbleGeo = new THREE.DodecahedronGeometry(0.4, 0);
  const pebbleMat = mat('#342f2a', { roughness: 1.0 });
  const instancedRocks = new THREE.InstancedMesh(pebbleGeo, pebbleMat, 70);

  const dummy = new THREE.Object3D();
  for (let i = 0; i < 70; i++) {
    const rx = (Math.random() - 0.5) * 44;
    const rz = (Math.random() - 0.5) * 44;
    const ry = getTerrainHeight(rx, rz) + 0.2;
    dummy.position.set(rx, ry, rz);
    const s = 0.5 + Math.random() * 1.5;
    dummy.scale.set(s, s * (0.6 + Math.random() * 0.8), s);
    dummy.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
    dummy.updateMatrix();
    instancedRocks.setMatrixAt(i, dummy.matrix);
  }
  instancedRocks.castShadow = true;
  instancedRocks.receiveShadow = true;
  scene.add(instancedRocks);
}

// ── Realistic Alpine Conifer Trees & Snapped Timber ───────────────
function createAlpineSpruce(height, trunkRadius, foliageHex) {
  const tree = new THREE.Group();
  const trunkMat = mat('#261b14', { roughness: 0.95 });
  const foliageMat = mat(foliageHex, { roughness: 0.85 });

  // Trunk
  const trunkH = height * 0.45;
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(trunkRadius * 0.65, trunkRadius, trunkH, 7),
    trunkMat
  );
  trunk.position.y = trunkH * 0.5;
  trunk.castShadow = true;
  tree.add(trunk);

  // Multi-tier asymmetrical conical foliage boughs
  const tiers = 6;
  for (let i = 0; i < tiers; i++) {
    const frac = i / (tiers - 1);
    const tierR = (1.0 - frac * 0.75) * (height * 0.22);
    const tierH = height * 0.24;
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(tierR, tierH, 8),
      foliageMat
    );
    cone.position.y = trunkH * 0.35 + frac * (height * 0.60);
    cone.rotation.y = i * 0.8 + Math.random() * 0.2;
    cone.castShadow = true;
    tree.add(cone);
  }

  return tree;
}

function createForestAndSnappedTrees(scene) {
  const needleColors = ['#132416', '#1a301e', '#182b24', '#152818'];

  // 1. Standing Alpine Conifers on Ridges and Valley Perimeter
  const treePositions = [
    [24, -22], [29, -14], [27, 6], [31, 16], [23, 26],
    [-24, -26], [-30, -16], [-33, 8], [-28, 24],
    [14, -36], [-14, -36], [10, 36], [-16, 36],
    [32, -4], [34, 10], [-34, -4], [-36, 16],
    [18, -28], [20, 32], [-20, -32], [-22, 30]
  ];

  for (let i = 0; i < treePositions.length; i++) {
    const [tx, tz] = treePositions[i];
    const ty = getTerrainHeight(tx, tz);
    const h = 5.5 + Math.random() * 5.0;
    const r = 0.16 + (h / 10.0) * 0.12;
    const col = needleColors[i % needleColors.length];

    const tree = createAlpineSpruce(h, r, col);
    tree.position.set(tx, ty, tz);
    tree.rotation.y = Math.random() * Math.PI * 2;
    tree.rotation.z = (Math.random() - 0.5) * 0.08; // subtle natural lean
    scene.add(tree);
  }

  // 2. Snapped Timber Swept into the Mudslide Tongue
  const trunkMat = mat('#261b14', { roughness: 0.95 });
  const splinterMat = mat('#bca276', { roughness: 0.8 });

  const snappedLogs = [
    { x: -2, z: 2, rot: [0.2, 1.3, 0.35], len: 4.8 },
    { x: 5, z: -8, rot: [-0.1, 0.7, 0.4], len: 3.9 },
    { x: -9, z: -4, rot: [0.3, 2.1, -0.2], len: 5.4 },
    { x: 0, z: -14, rot: [0.15, 0.4, 0.3], len: 4.2 },
    { x: -14, z: 12, rot: [0.25, 1.8, 0.1], len: 4.9 },
  ];

  for (const log of snappedLogs) {
    const ly = getTerrainHeight(log.x, log.z) + 0.15;
    const logMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.16, 0.22, log.len, 7),
      trunkMat
    );
    logMesh.position.set(log.x, ly, log.z);
    logMesh.rotation.set(...log.rot);
    logMesh.castShadow = true;
    scene.add(logMesh);

    const splinter = new THREE.Mesh(
      new THREE.ConeGeometry(0.18, 0.65, 5),
      splinterMat
    );
    splinter.position.set(log.x, ly + 0.1, log.z);
    splinter.rotation.set(...log.rot);
    scene.add(splinter);

    registerObject(`snapped_timber_${Math.abs(log.x)}`, logMesh, 'debris', 296, {
      label: 'Snapped Timber / Tree Trunk in Debris Flow',
    });
  }
}

// ── Buried Infrastructure & Tactical Rescue Vehicle ──────────────
let emergencyBeacons = [];

function createBuriedInfrastructure(scene) {
  // 1. Tilted High-Voltage Transmission Tower
  const towerGroup = new THREE.Group();
  const steelMat = mat('#383e44', { metalness: 0.85, roughness: 0.35 });

  // 4 Legs lattice
  const legGeo = new THREE.CylinderGeometry(0.08, 0.12, 16, 6);
  const l1 = new THREE.Mesh(legGeo, steelMat); l1.position.set(-1.2, 8, -1.2); towerGroup.add(l1);
  const l2 = new THREE.Mesh(legGeo, steelMat); l2.position.set(1.2, 8, -1.2); towerGroup.add(l2);
  const l3 = new THREE.Mesh(legGeo, steelMat); l3.position.set(-1.2, 8, 1.2); towerGroup.add(l3);
  const l4 = new THREE.Mesh(legGeo, steelMat); l4.position.set(1.2, 8, 1.2); towerGroup.add(l4);

  // Cross members
  for (let y = 3; y <= 14; y += 3) {
    const cross = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.08, 2.6), steelMat);
    cross.position.y = y;
    towerGroup.add(cross);
  }

  // Crossarms at top
  const crossarm = new THREE.Mesh(new THREE.BoxGeometry(6, 0.15, 0.4), steelMat);
  crossarm.position.y = 14.5;
  towerGroup.add(crossarm);

  const tX = -6, tZ = -14;
  const tY = getTerrainHeight(tX, tZ);
  towerGroup.position.set(tX, tY, tZ);
  towerGroup.rotation.set(0.4, 0.2, -0.35);
  towerGroup.castShadow = true;
  scene.add(towerGroup);

  // High-voltage electrical arc hazard at base
  const sparkBase = new THREE.Mesh(
    new THREE.CylinderGeometry(0.3, 0.4, 0.4, 8),
    mat('#0f1b26', { emissive: new THREE.Color(0.2, 0.8, 1.0), emissiveIntensity: 2.5 })
  );
  sparkBase.position.set(tX - 1.5, tY + 0.2, tZ + 1.5);
  scene.add(sparkBase);

  registerObject('downed_power_line', sparkBase, 'downed_power_line', 315, {
    label: 'Grid Infrastructure — Tilted Transmission Tower 4A',
    hazard: 'High-Voltage Arc Short Circuit',
    voltageKV: 115,
  });

  // 2. Upgraded Emergency Mountain SAR Tactical Vehicle
  const truckGroup = new THREE.Group();
  const bodyPaint = mat('#c23828', { metalness: 0.4, roughness: 0.45 }); // Emergency rescue red
  const trimMat = mat('#1c2024', { roughness: 0.65 });
  const glassMat = mat('#142028', { metalness: 0.9, roughness: 0.1, transparent: true, opacity: 0.75 });
  const wheelMat = mat('#121416', { roughness: 0.9 });

  // Chassis
  const chassis = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.7, 4.6), bodyPaint);
  chassis.position.y = 0.75;
  chassis.castShadow = true;
  truckGroup.add(chassis);

  // Cab & Windshield
  const cab = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.8, 2.2), bodyPaint);
  cab.position.set(0, 1.45, -0.6);
  truckGroup.add(cab);

  const windshield = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.55, 0.1), glassMat);
  windshield.position.set(0, 1.5, -1.72);
  windshield.rotation.x = -0.3;
  truckGroup.add(windshield);

  // 4 Off-road wheels
  const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.32, 14);
  wheelGeo.rotateZ(Math.PI / 2);
  const wheelOffsets = [
    [-1.15, 0.42, -1.4], [1.15, 0.42, -1.4],
    [-1.15, 0.42, 1.4],  [1.15, 0.42, 1.4]
  ];
  for (const [wx, wy, wz] of wheelOffsets) {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.position.set(wx, wy, wz);
    wheel.castShadow = true;
    truckGroup.add(wheel);
  }

  // Roof emergency beacon light bar (amber + blue flashing LEDs)
  const barMesh = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.12, 0.25), trimMat);
  barMesh.position.set(0, 1.95, -0.6);
  truckGroup.add(barMesh);

  const amberBeacon = new THREE.Mesh(
    new THREE.BoxGeometry(0.45, 0.15, 0.2),
    new THREE.MeshStandardMaterial({ color: 0xffaa00, emissive: 0xff8800, emissiveIntensity: 2.5 })
  );
  amberBeacon.position.set(-0.5, 2.05, -0.6);
  truckGroup.add(amberBeacon);

  const blueBeacon = new THREE.Mesh(
    new THREE.BoxGeometry(0.45, 0.15, 0.2),
    new THREE.MeshStandardMaterial({ color: 0x0088ff, emissive: 0x0066ff, emissiveIntensity: 2.5 })
  );
  blueBeacon.position.set(0.5, 2.05, -0.6);
  truckGroup.add(blueBeacon);

  emergencyBeacons = [amberBeacon, blueBeacon];

  // Hot engine block for thermal sensor target
  const engineBlock = new THREE.Mesh(
    new THREE.BoxGeometry(1.2, 0.6, 1.0),
    mat('#222', { emissive: new THREE.Color(0.8, 0.2, 0.0), emissiveIntensity: 0.6 })
  );
  engineBlock.position.set(0, 0.8, -2.1);
  truckGroup.add(engineBlock);

  const vX = -15, vZ = -4;
  const vY = getTerrainHeight(vX, vZ) - 0.35; // Buried in mudflow
  truckGroup.position.set(vX, vY, vZ);
  truckGroup.rotation.set(0.28, 0.75, -0.18);
  scene.add(truckGroup);

  registerObject('hot_car_engine', engineBlock, 'heat_false_positive', 340, {
    label: 'Buried Mountain SAR Vehicle — Overheated Engine Block',
    reason: 'Metallic shape, temp 340K > human range',
  });
}

// ── Mudflow Dam & Flash Flood Reservoir ───────────────────────────
export let floodMesh = null;

function createMudDamFloodPool(scene) {
  const waterGeo = new THREE.PlaneGeometry(36, 26, 48, 48);
  waterGeo.rotateX(-Math.PI / 2);

  const waterMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#1c2e3a'),
    roughness: 0.08,
    metalness: 0.82,
    transparent: true,
    opacity: 0.85,
    envMapIntensity: 1.4,
    emissive: new THREE.Color(0.01, 0.04, 0.08),
    emissiveIntensity: 0.3,
  });

  floodMesh = new THREE.Mesh(waterGeo, waterMat);
  floodMesh.position.set(-28, 2.2, 8);
  scene.add(floodMesh);

  registerObject('flood_zone', floodMesh, 'flood', 293, {
    label: 'Mudflow Damming Reservoir — Flash Flood Surge',
    damHeightMeters: 4.8,
    breachRisk: 0.91,
  });
}

// ── Trapped Casualties (Survivors in Landslide Debris) ─────────────
function createSurvivors(scene) {
  const victimMat = mat('#8a6b52', {
    emissive: new THREE.Color(0.14, 0.05, 0.02),
    emissiveIntensity: 0.7,
    roughness: 0.7
  });

  // Victim 1: Trapped on the edge of the central debris mound (Primary body heat 310K)
  const v1Group = new THREE.Group();
  const torso1 = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.15, 0.9, 8), victimMat);
  torso1.rotation.z = Math.PI / 2;
  v1Group.add(torso1);
  const head1 = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), victimMat);
  head1.position.set(0.55, 0.05, 0);
  v1Group.add(head1);

  const v1X = 3.5, v1Z = 1.5;
  const v1Y = getTerrainHeight(v1X, v1Z) + 0.1;
  v1Group.position.set(v1X, v1Y, v1Z);
  v1Group.rotation.y = 0.6;
  v1Group.castShadow = true;
  scene.add(v1Group);

  registerObject('victim_signature', v1Group, 'person', 310, {
    label: 'Casualty Alpha — Semi-conscious, trapped on mud fringe',
    bodyTempC: 36.85,
    acousticVocalHz: 280,
    vitalStatus: 'CRITICAL',
  });

  // Victim 2: Occluded under debris
  const v2Group = new THREE.Group();
  const torso2 = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.14, 0.85, 8), victimMat);
  torso2.rotation.z = Math.PI / 2.2;
  v2Group.add(torso2);
  const head2 = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), victimMat);
  head2.position.set(0.5, 0.02, 0);
  v2Group.add(head2);

  const v2X = -7, v2Z = -10;
  const v2Y = getTerrainHeight(v2X, v2Z) + 0.12;
  v2Group.position.set(v2X, v2Y, v2Z);
  v2Group.rotation.set(0.2, 1.1, 0);
  v2Group.castShadow = true;
  scene.add(v2Group);

  const beam = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.25, 2.2), mat('#3c3228'));
  beam.position.set(v2X, v2Y + 0.25, v2Z);
  beam.rotation.set(0.3, 0.4, 0.5);
  scene.add(beam);

  registerObject('victim_secondary', v2Group, 'person', 309, {
    label: 'Casualty Bravo — Occluded under debris, faint thermal pulse',
    bodyTempC: 35.85,
    acousticVocalHz: 195,
    vitalStatus: 'HYPOTHERMIC_RISK',
  });
}

// ── Combusting Ruptured Gas Hazard & Billowing Smoke Plume ────────
export let fireParticles = null;
let smokePlumeRef = null;
let fireBaseY = 0;

function createActiveFireHazard(scene) {
  const fX = -1, fZ = -6;
  const fY = getTerrainHeight(fX, fZ);
  fireBaseY = fY;

  // Glowing ruptured burner pipe base
  const burner = new THREE.Mesh(
    new THREE.CylinderGeometry(0.7, 1.0, 0.5, 12),
    mat('#180600', { emissive: new THREE.Color(1.0, 0.4, 0.05), emissiveIntensity: 3.5 })
  );
  burner.position.set(fX, fY + 0.2, fZ);
  scene.add(burner);

  // Point light for dynamic fire illumination
  const fireLight = new THREE.PointLight(0xff5500, 7.5, 20);
  fireLight.position.set(fX, fY + 2.2, fZ);
  scene.add(fireLight);
  burner.userData.fireLight = fireLight;

  registerObject('fire_hazard', burner, 'fire', 873, {
    label: 'Ruptured Liquid Propane / Fuel Line Combustion',
    tempKelvin: 873,
    flickerHz: 2.3,
  });

  // Soft glowing radial particle texture (no square artifacts!)
  const fireTexture = createSoftParticleTexture();
  const fireCount = 420;
  const fireGeo = new THREE.BufferGeometry();
  const firePos = new Float32Array(fireCount * 3);
  const fireCol = new Float32Array(fireCount * 3);

  for (let i = 0; i < fireCount; i++) {
    firePos[i*3]   = fX + (Math.random() - 0.5) * 1.5;
    firePos[i*3+1] = fY + 0.2 + Math.random() * 5.0;
    firePos[i*3+2] = fZ + (Math.random() - 0.5) * 1.5;

    const heat = Math.random();
    fireCol[i*3]   = 1.0;
    fireCol[i*3+1] = heat * 0.75 + 0.2;
    fireCol[i*3+2] = heat * heat * 0.15;
  }
  fireGeo.setAttribute('position', new THREE.BufferAttribute(firePos, 3));
  fireGeo.setAttribute('color', new THREE.BufferAttribute(fireCol, 3));

  const fireMat = new THREE.PointsMaterial({
    size: 1.8,
    map: fireTexture,
    vertexColors: true,
    transparent: true,
    opacity: 0.88,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true,
  });
  fireParticles = new THREE.Points(fireGeo, fireMat);
  scene.add(fireParticles);

  // Soft billowing volumetric smoke plume (no square pixels!)
  const smokeTexture = createSmokePuffTexture();
  const smokeCount = 140;
  const smokeGeo = new THREE.BufferGeometry();
  const smokePos = new Float32Array(smokeCount * 3);
  const smokeCol = new Float32Array(smokeCount * 3);

  for (let i = 0; i < smokeCount; i++) {
    const h = Math.random() * 22.0;
    const spread = (h / 22.0) * 5.0 + 1.2;
    smokePos[i*3]   = fX + (Math.random() - 0.5) * spread;
    smokePos[i*3+1] = fY + 3.0 + h;
    smokePos[i*3+2] = fZ + (Math.random() - 0.5) * spread;

    const shade = 0.12 + Math.random() * 0.10;
    smokeCol[i*3]   = shade;
    smokeCol[i*3+1] = shade;
    smokeCol[i*3+2] = shade;
  }
  smokeGeo.setAttribute('position', new THREE.BufferAttribute(smokePos, 3));
  smokeGeo.setAttribute('color', new THREE.BufferAttribute(smokeCol, 3));

  const smokeMat = new THREE.PointsMaterial({
    size: 5.5,
    map: smokeTexture,
    vertexColors: true,
    transparent: true,
    opacity: 0.22,
    blending: THREE.NormalBlending,
    depthWrite: false,
    sizeAttenuation: true,
  });
  smokePlumeRef = new THREE.Points(smokeGeo, smokeMat);
  scene.add(smokePlumeRef);
}

// ── 3D Tumbling Rockslide Debris Physics ──────────────────────────
// Replaced square 2D particle points with true 3D instanced rock meshes!
let rockslideInstanced = null;
const ROCK_PHYSICS_COUNT = 55;
let rockPositions = [];
let rockVelocities = [];
let rockRotations = [];
let rockRotSpeeds = [];

function createDynamicRockslide(scene) {
  const rockGeo = new THREE.DodecahedronGeometry(0.38, 0);
  const rockMat = mat('#3c3630', { roughness: 0.95 });
  rockslideInstanced = new THREE.InstancedMesh(rockGeo, rockMat, ROCK_PHYSICS_COUNT);

  rockPositions = [];
  rockVelocities = [];
  rockRotations = [];
  rockRotSpeeds = [];

  const dummy = new THREE.Object3D();

  for (let i = 0; i < ROCK_PHYSICS_COUNT; i++) {
    const rx = 13 + Math.random() * 8;
    const ry = 16 + Math.random() * 8;
    const rz = (Math.random() - 0.5) * 26;
    const pos = new THREE.Vector3(rx, ry, rz);
    const vel = new THREE.Vector3(
      -(1.8 + Math.random() * 3.5),
      -(2.5 + Math.random() * 4.0),
      (Math.random() - 0.5) * 1.5
    );
    const rot = new THREE.Euler(Math.random() * 3, Math.random() * 3, Math.random() * 3);
    const rSpeed = new THREE.Vector3(
      (Math.random() - 0.5) * 6,
      (Math.random() - 0.5) * 6,
      (Math.random() - 0.5) * 6
    );

    rockPositions.push(pos);
    rockVelocities.push(vel);
    rockRotations.push(rot);
    rockRotSpeeds.push(rSpeed);

    dummy.position.copy(pos);
    dummy.rotation.copy(rot);
    const s = 0.6 + Math.random() * 0.9;
    dummy.scale.set(s, s * (0.7 + Math.random() * 0.6), s);
    dummy.updateMatrix();
    rockslideInstanced.setMatrixAt(i, dummy.matrix);
  }

  rockslideInstanced.castShadow = true;
  rockslideInstanced.receiveShadow = true;
  scene.add(rockslideInstanced);
}

// ── Master Scene Builder ──────────────────────────────────────────
export function createDisasterScene(scene) {
  objectRegistry.clear();

  createAtmosphere(scene);
  createLighting(scene);
  createLandslideTerrain(scene);
  createDistantMountains(scene);
  createShearedRoad(scene);
  createGuardrails(scene);
  createBoulders(scene);
  createForestAndSnappedTrees(scene);
  createBuriedInfrastructure(scene);
  createMudDamFloodPool(scene);
  createSurvivors(scene);
  createActiveFireHazard(scene);
  createDynamicRockslide(scene);
}

// ── Real-Time Scene Animation Update ──────────────────────────────
const rockDummy = new THREE.Object3D();

export function updateScene(time, dt) {
  // 1. Fire Flame soft particle rise & flicker
  if (fireParticles) {
    const pos = fireParticles.geometry.attributes.position.array;
    for (let i = 0; i < pos.length / 3; i++) {
      pos[i * 3 + 1] += dt * 3.5;
      pos[i * 3] += (Math.random() - 0.5) * 0.12;
      if (pos[i * 3 + 1] > fireBaseY + 4.2) {
        pos[i * 3 + 1] = fireBaseY + 0.2;
        pos[i * 3] = -1 + (Math.random() - 0.5) * 1.2;
        pos[i * 3 + 2] = -6 + (Math.random() - 0.5) * 1.2;
      }
    }
    fireParticles.geometry.attributes.position.needsUpdate = true;
  }

  // 2. Volumetric Smoke Plume rise & atmospheric drift
  if (smokePlumeRef) {
    const pos = smokePlumeRef.geometry.attributes.position.array;
    for (let i = 0; i < pos.length / 3; i++) {
      pos[i * 3 + 1] += dt * (2.2 + (i % 5) * 0.4);
      pos[i * 3] += Math.sin(time * 0.8 + i) * dt * 0.45;
      pos[i * 3 + 2] += dt * 0.5;

      if (pos[i * 3 + 1] > fireBaseY + 24.0) {
        pos[i * 3 + 1] = fireBaseY + 3.0 + Math.random() * 2.0;
        pos[i * 3] = -1 + (Math.random() - 0.5) * 1.4;
        pos[i * 3 + 2] = -6 + (Math.random() - 0.5) * 1.4;
      }
    }
    smokePlumeRef.geometry.attributes.position.needsUpdate = true;
  }

  // 3. 3D Tumbling Rockslide Debris Dynamics
  if (rockslideInstanced && rockPositions.length > 0) {
    for (let i = 0; i < ROCK_PHYSICS_COUNT; i++) {
      const p = rockPositions[i];
      const v = rockVelocities[i];
      const r = rockRotations[i];
      const rs = rockRotSpeeds[i];

      p.x += v.x * dt;
      p.y += v.y * dt;
      p.z += v.z * dt;

      r.x += rs.x * dt;
      r.y += rs.y * dt;
      r.z += rs.z * dt;

      const groundY = getTerrainHeight(p.x, p.z);
      if (p.y <= groundY + 0.2 || p.x < -22) {
        // Respawn tumbling rock at top crown scarp
        p.x = 13 + Math.random() * 8;
        p.y = 16 + Math.random() * 8;
        p.z = (Math.random() - 0.5) * 26;
      }

      rockDummy.position.copy(p);
      rockDummy.rotation.copy(r);
      rockDummy.updateMatrix();
      rockslideInstanced.setMatrixAt(i, rockDummy.matrix);
    }
    rockslideInstanced.instanceMatrix.needsUpdate = true;
  }

  // 4. Mud dam flood water surface undulation
  if (floodMesh) {
    floodMesh.position.y = 2.2 + Math.sin(time * 1.2) * 0.04;
  }

  // 5. Emergency Vehicle alternating beacon flash
  if (emergencyBeacons.length === 2) {
    const flash = Math.sin(time * 8.0) > 0;
    emergencyBeacons[0].material.emissiveIntensity = flash ? 3.0 : 0.2;
    emergencyBeacons[1].material.emissiveIntensity = flash ? 0.2 : 3.0;
  }
}
