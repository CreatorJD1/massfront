/** Port of massfront src/sea.js heading-drag / accuracy — Beaufort is the live lever. */

export function douglasFromBeaufort(force: number) {
  if (force <= 1) return 0;
  if (force <= 2) return 1;
  if (force <= 3) return 2;
  if (force <= 4) return 3;
  if (force <= 5) return 4;
  if (force <= 6) return 5;
  if (force <= 8) return 6;
  if (force <= 9) return 7;
  return 8;
}

export function swellDir(windDeg: number) {
  const r = (windDeg / 180) * Math.PI;
  return { x: Math.cos(r), z: Math.sin(r) };
}

/** Speed multiplier for a hull on a heading. Never 0 — stuck fleets have no counterplay. */
export function headingDrag(
  force: number,
  dirX: number,
  dirZ: number,
  swellX: number,
  swellZ: number,
) {
  const level = douglasFromBeaufort(force);
  if (level <= 0) return 1;
  const length = Math.hypot(dirX, dirZ);
  if (!length) return 1;
  const alignment = (dirX / length) * swellX + (dirZ / length) * swellZ;
  const severity = level / 8;
  const base = 1 - severity * 0.28;
  return Math.max(0.45, Math.min(1.08, base + alignment * severity * 0.14));
}

export function accuracyMul(force: number) {
  const level = douglasFromBeaufort(force);
  if (level <= 0) return 1;
  return Math.max(0.55, 1 - (level / 8) * 0.4);
}

export function smallCraftWarn(force: number) {
  return douglasFromBeaufort(force) >= 5;
}
