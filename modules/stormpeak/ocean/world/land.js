// @ts-nocheck
/** @ts-nocheck */
/**
 * Coastal mass is a lift on the seafloor. Peaks break the surface.
 * Slopes run down to the shelf. No separate island mesh.
 */
const SHELF = 94;

export const ISLANDS = [
  { x: -340, z: 240, r: 96, peak: 24, seed: 11.7 },
  { x: 390, z: -220, r: 118, peak: 30, seed: 29.3 },
];

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}
function hash2(x, z) {
  const n = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return n - Math.floor(n);
}
function fade(t) {
  return t * t * (3 - 2 * t);
}
function noise2(x, z) {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = fade(x - ix);
  const fz = fade(z - iz);
  const a = hash2(ix, iz);
  const b = hash2(ix + 1, iz);
  const c = hash2(ix, iz + 1);
  const d = hash2(ix + 1, iz + 1);
  return a + (b - a) * fx + (c - a) * fz * (1 - fx) + (d - b) * fx * fz;
}
function fbm(x, z) {
  let v = 0;
  let a = 0.5;
  let f = 1;
  for (let i = 0; i < 5; i++) {
    v += a * noise2(x * f, z * f);
    a *= 0.5;
    f *= 2.11;
  }
  return v;
}

function oneLift(x, z, is) {
  const dx = x - is.x;
  const dz = z - is.z;
  const rad = Math.hypot(dx, dz);
  const ang = Math.atan2(dz, dx);
  const coast =
    is.r *
    (0.58 +
      0.22 * Math.sin(ang * 2.0 + is.seed) +
      0.2 * fbm(Math.cos(ang) * 1.8 + is.seed, Math.sin(ang) * 1.8));
  const outer = coast * 2.7;
  if (rad > outer) return 0;
  const n = fbm(x * 0.016 + is.seed, z * 0.016);
  const ridge = fbm(x * 0.04, z * 0.04);
  if (rad > coast) {
    let t = 1 - (rad - coast) / Math.max(8, outer - coast);
    t = fade(clamp(t, 0, 1));
    return SHELF * t * (0.94 + n * 0.08);
  }
  const inland = fade(1 - rad / Math.max(1, coast));
  return SHELF + inland * is.peak * (0.5 + n * 0.7) + inland * (ridge - 0.42) * 14;
}

export function landLiftM(x, z) {
  let lift = 0;
  for (let i = 0; i < ISLANDS.length; i++) {
    const v = oneLift(x, z, ISLANDS[i]);
    if (v > lift) lift = v;
  }
  return lift;
}

export function islandHeight(x, z) {
  return Math.max(0, landLiftM(x, z) - SHELF);
}

export function probeSurface(x, z, ents) {
  if (islandHeight(x, z) > 0.4) return "land";
  if (ents) {
    for (let i = 0; i < ents.length; i++) {
      const e = ents[i];
      if (!e.alive || !e.building) continue;
      if (Math.hypot(e.x - x, e.z - z) < (e.radius || 14) + 16) return "land";
    }
  }
  return "water";
}

export const landLiftGLSL = /* glsl */ `
  float landOne(vec2 xz, vec2 c, float R, float peak, float seed) {
    vec2 d = xz - c;
    float rad = length(d);
    float ang = atan(d.y, d.x);
    float coast = R * (0.58 + 0.22 * sin(ang * 2.0 + seed) + 0.2 * fbm(vec2(cos(ang) * 1.8 + seed, sin(ang) * 1.8)));
    float outer = coast * 2.7;
    if (rad > outer) return 0.0;
    float n = fbm(xz * 0.016 + seed);
    float ridge = fbm(xz * 0.04);
    if (rad > coast) {
      float t = clamp(1.0 - (rad - coast) / max(8.0, outer - coast), 0.0, 1.0);
      t = t * t * (3.0 - 2.0 * t);
      return 94.0 * t * (0.94 + n * 0.08);
    }
    float inland = 1.0 - rad / max(1.0, coast);
    inland = inland * inland * (3.0 - 2.0 * inland);
    return 94.0 + inland * peak * (0.5 + n * 0.7) + inland * (ridge - 0.42) * 14.0;
  }
  float landLiftM(vec2 xz) {
    float lift = 0.0;
    if (length(xz - vec2(-340.0, 240.0)) < 280.0)
      lift = max(lift, landOne(xz, vec2(-340.0, 240.0), 96.0, 24.0, 11.7));
    if (length(xz - vec2(390.0, -220.0)) < 340.0)
      lift = max(lift, landOne(xz, vec2(390.0, -220.0), 118.0, 30.0, 29.3));
    return lift;
  }
`;
