/** Small deterministic utilities shared by the visual and flight models. */
export function seededRandom(seed) {
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
export function noise2(x, y) {
  const hash = (a, b) => { const n = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return (n - Math.floor(n)) * 2 - 1; };
  const ix = Math.floor(x), iy = Math.floor(y);
  const sx = x - ix, sy = y - iy;
  const u = sx * sx * (3 - 2 * sx), v = sy * sy * (3 - 2 * sy);
  const a = hash(ix, iy), b = hash(ix + 1, iy), c = hash(ix, iy + 1), d = hash(ix + 1, iy + 1);
  return (a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v;
}
export const approach = (value, target, rate, dt) => value + (target - value) * (1 - Math.exp(-rate * dt));
export const angleDelta = (from, to) => Math.atan2(Math.sin(to - from), Math.cos(to - from));
export const brakingSpeed = (distance, acceleration = 2.2, maximum = 4.5) => Math.min(maximum, Math.sqrt(2 * acceleration * Math.max(0, distance)));
