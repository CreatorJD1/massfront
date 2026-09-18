// @ts-nocheck
/** @ts-nocheck */
/**
 * XYLOS-7 water column. Metres are authority. World Y = seaY - metres / DEPTH_VIS.
 * The shelf sits in hydrophone range so the floor is a place, not a rumour.
 * The trench is the thing you commit to.
 */
import { DEPTH_VIS } from "../acoustics/rays.js";
import { landLiftM } from "./land.js";

export { DEPTH_VIS };

export const BOTTOM_M = 1180;
/** Stormpeak anchorage — close enough that Hydrophone looks at mud, not void. */
export const SHELF_M = 94;
export const TRENCH_M = 640;
export const PHOTIC_M = 48;
export const TWILIGHT_M = 168;
export const APHOTIC_M = 390;
export const PATROL_M = 52;
export const CLEARANCE_M = 12;

export const CRUSH_M = {
  nova: 430,
  legion: 520,
  syndicate: 305,
  brood: 580,
};

export function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

export function sat(n) {
  return clamp(n, 0, 1);
}

export function hash2(x, z) {
  const n = Math.sin(x * 127.1 + z * 311.7) * 43758.5453123;
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
  let a = 0.52;
  let f = 1;
  for (let i = 0; i < 5; i++) {
    v += a * noise2(x * f, z * f);
    a *= 0.5;
    f *= 2.11;
  }
  return v;
}

/** Seafloor depth in metres below the mean surface. */
export function seabedMetres(x, z) {
  const nx = x * 0.0024;
  const nz = z * 0.0024;
  const trench = fade(sat(x * 0.00135 - z * 0.00055 + 0.18));
  let h = SHELF_M;
  h += (fbm(nx * 1.4, nz * 1.4) - 0.5) * 22;
  h += Math.sin(nx * 3.1 + 0.4) * 7 + Math.cos(nz * 2.6) * 6;
  h += trench * (TRENCH_M - SHELF_M);
  h += Math.sin(nx * 9.2 + nz * 4.1) * (3 + trench * 18);
  h -= landLiftM(x, z);
  return clamp(h, -36, BOTTOM_M);
}

export function seabedWorldY(x, z, seaY = 0) {
  return seaY - seabedMetres(x, z) / DEPTH_VIS;
}

export function zoneName(m) {
  if (m < 8) return "SURFACE";
  if (m < PHOTIC_M) return "PHOTIC";
  if (m < TWILIGHT_M) return "TWILIGHT";
  if (m < APHOTIC_M) return "APHOTIC";
  return "HADAL";
}

/** Metres per second. Flooding (down) is a fight. Blow (up) is the escape. */
export function diveRateMs(metres, flooding) {
  if (flooding) {
    if (metres < 28) return 7.2;
    if (metres < PHOTIC_M) return 4.4;
    if (metres < TWILIGHT_M) return 1.85;
    if (metres < APHOTIC_M) return 0.95;
    return 0.42;
  }
  if (metres > APHOTIC_M) return 6.2;
  if (metres > TWILIGHT_M) return 9.4;
  if (metres > PHOTIC_M) return 13.5;
  return 16.5;
}

export function crushOf(faction) {
  return CRUSH_M[faction] || CRUSH_M.nova;
}

export function underPalette(metres) {
  const tP = sat(metres / PHOTIC_M);
  const tT = sat((metres - PHOTIC_M) / Math.max(8, TWILIGHT_M - PHOTIC_M));
  const tA = sat((metres - TWILIGHT_M) / Math.max(8, APHOTIC_M - TWILIGHT_M));
  const tH = sat((metres - APHOTIC_M) / 280);
  const photic = [0.055, 0.18, 0.185];
  const twilight = [0.03, 0.07, 0.08];
  const aphotic = [0.018, 0.012, 0.045];
  const hadal = [0.006, 0.004, 0.016];
  const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  let c = mix(photic, twilight, tP);
  c = mix(c, aphotic, tT);
  c = mix(c, hadal, Math.max(tA, tH * 0.65));
  const fogNear = 28 - tP * 8 - tT * 8 - tA * 5;
  const fogFar = 150 - tP * 36 - tT * 28 - tA * 18 - tH * 12;
  const exposure = 0.92 - tP * 0.14 - tT * 0.18 - tA * 0.16 - tH * 0.1;
  return {
    rgb: c,
    fogNear: Math.max(6, fogNear),
    fogFar: Math.max(22, fogFar),
    exposure: clamp(exposure, 0.28, 0.98),
    caustics: 1 - sat((metres - 6) / 78),
    rays: 1 - sat((metres - 4) / 80),
    snow: 0.22 + tT * 0.4 + tA * 0.5,
  };
}

export function metresFromDive(dive) {
  return Math.max(0, dive * DEPTH_VIS);
}

export function diveFromMetres(m) {
  return Math.max(0, m / DEPTH_VIS);
}
