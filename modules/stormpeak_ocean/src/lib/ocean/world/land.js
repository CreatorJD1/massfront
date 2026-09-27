// @ts-nocheck
/** @ts-nocheck */
/**
 * Coastal mass is a lift on the seafloor. Peaks break the surface.
 * Slopes run down to the shelf. No separate island mesh.
 */
const SHELF = 94;

export const ISLANDS = [
  { x: -340, z: 240, r: 96, peak: 72, seed: 11.7 },
  /* The old (390,-220) center sat over the 600 m trench; a 120 m uplift
     labelled it land while leaving its entire peak underwater. */
  { x: -440, z: -250, r: 118, peak: 88, seed: 29.3 },
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
  // Match the shared seafloor GLSL fbm so CPU land probes agree at the coast.
  let a = 0.52;
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

/* Nuke craters: permanent bowls with a raised lip (the nuke lab's terrain
   shape) cut into the island lift, so every reader of the ground sees them:
   seabedMetres, islandHeight (rings, HP bars, build preview) and both shader
   copies. The crater list itself belongs to the match; setLandCraters() takes
   it as { x, z, radius, depth } (metres) and the shader gets the same list as
   uCraters[i] = (x, z, radius, depth). Overlapping bowls add up, capped at
   CRATER_MAX_CUT_M. A bowl never lowers land below SHELF + CRATER_FLOOR_M of
   lift, which is above the deepest base seafloor around the islands, so a
   crater never floods land (coastal breaching is a separate, later change).
   Keep landLiftGLSL's craterCut in step with this. */
export const MAX_CRATERS = 16;
export const CRATER_LIP = 0.36;
export const CRATER_MAX_CUT_M = 30;
export const CRATER_FLOOR_M = 30;
const CRATERS = Array.from({ length: MAX_CRATERS }, () => ({ x: 0, z: 0, r: 0, d: 0 }));
let craterCount = 0;
export function setLandCraters(list) {
  craterCount = Math.min(MAX_CRATERS, list ? list.length : 0);
  for (let i = 0; i < MAX_CRATERS; i++) {
    const c = CRATERS[i];
    const src = i < craterCount ? list[i] : null;
    c.x = src ? src.x : 0;
    c.z = src ? src.z : 0;
    c.r = src ? src.radius : 0;
    c.d = src ? src.depth : 0;
  }
}
function craterCut(x, z, lift) {
  let bowl = 0;
  let lip = 0;
  for (let i = 0; i < craterCount; i++) {
    const c = CRATERS[i];
    if (c.d < 0.001) continue;
    const R = Math.max(1, c.r);
    const r = Math.hypot(x - c.x, z - c.z);
    const lipW = Math.max(6, R * 0.22);
    if (r > R + lipW * 3) continue;
    const t = Math.min(1, r / R);
    const q = (r - R) / lipW;
    bowl += c.d * (1 - t * t * (3 - 2 * t));
    lip += c.d * Math.exp(-q * q) * CRATER_LIP;
  }
  if (bowl === 0 && lip === 0) return lift;
  const cut = Math.min(CRATER_MAX_CUT_M, bowl) - lip;
  return Math.max(lift - cut, Math.min(lift, SHELF + CRATER_FLOOR_M));
}

export function landLiftM(x, z) {
  let lift = 0;
  for (let i = 0; i < ISLANDS.length; i++) {
    const v = oneLift(x, z, ISLANDS[i]);
    if (v > lift) lift = v;
  }
  return lift > 0 ? craterCut(x, z, lift) : 0;
}

export function islandHeight(x, z) {
  return Math.max(0, landLiftM(x, z) - SHELF);
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
  uniform vec4 uCraters[${MAX_CRATERS}];
  float craterCut(vec2 xz, float lift) {
    float bowl = 0.0;
    float lip = 0.0;
    for (int i = 0; i < ${MAX_CRATERS}; i++) {
      vec4 c = uCraters[i];
      if (c.w < 0.001) continue;
      float R = max(1.0, c.z);
      float r = length(xz - c.xy);
      float lipW = max(6.0, R * 0.22);
      if (r > R + lipW * 3.0) continue;
      float q = (r - R) / lipW;
      bowl += c.w * (1.0 - smoothstep(0.0, R, r));
      lip += c.w * exp(-q * q) * ${CRATER_LIP.toFixed(2)};
    }
    if (bowl == 0.0 && lip == 0.0) return lift;
    float cut = min(${CRATER_MAX_CUT_M.toFixed(1)}, bowl) - lip;
    return max(lift - cut, min(lift, ${(SHELF + CRATER_FLOOR_M).toFixed(1)}));
  }
  float landLiftM(vec2 xz) {
    float lift = 0.0;
    if (length(xz - vec2(-340.0, 240.0)) < 280.0)
      lift = max(lift, landOne(xz, vec2(-340.0, 240.0), 96.0, 72.0, 11.7));
    if (length(xz - vec2(-440.0, -250.0)) < 340.0)
      lift = max(lift, landOne(xz, vec2(-440.0, -250.0), 118.0, 88.0, 29.3));
    return lift > 0.0 ? craterCut(xz, lift) : 0.0;
  }
`;
