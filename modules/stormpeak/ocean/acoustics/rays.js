// @ts-nocheck
/** @ts-nocheck */
import { soundSpeed, dcDz } from "./profile.js";

/**
 * Range–depth ray tracer. θ is grazing angle from horizontal, +down.
 * Snell: cos(θ) / c = const. Surface and bottom reflect.
 */
export function traceRay(p, z0, theta0, maxRange = 900, ds = 8) {
  const pts = [];
  let x = 0;
  let z = Math.max(0.4, z0);
  let theta = theta0;
  const c0 = soundSpeed(p, z);
  let snell = Math.cos(theta) / c0;
  const maxSteps = Math.ceil(maxRange / ds) + 8;
  let bounced = 0;
  for (let i = 0; i < maxSteps; i++) {
    const c = soundSpeed(p, z);
    pts.push(x, z);
    const cosNeed = snell * c;
    if (cosNeed > 1 || cosNeed < -1) {
      theta = -theta;
      snell = Math.cos(theta) / c;
      bounced++;
    } else {
      theta = Math.sign(theta || 1) * Math.acos(Math.max(-1, Math.min(1, cosNeed)));
    }
    const dcdz = dcDz(p, z);
    theta += (dcdz / Math.max(200, c)) * Math.cos(theta) * ds;
    x += Math.cos(theta) * ds;
    z += Math.sin(theta) * ds;
    if (z < 0) {
      z = 0.2;
      theta = Math.abs(theta);
      snell = Math.cos(theta) / soundSpeed(p, z);
      bounced++;
    } else if (z > p.bottom) {
      z = p.bottom - 0.4;
      theta = -Math.abs(theta);
      snell = Math.cos(theta) / soundSpeed(p, z);
      bounced++;
    }
    if (x >= maxRange || bounced > 10) break;
  }
  return pts;
}

const ANGLES = [-0.055, 0.035, 0.12, 0.22, 0.38, 0.55];
const BEARINGS = 14;

export function traceFan(p, z0, maxRange = 720) {
  const rays = [];
  for (let b = 0; b < BEARINGS; b++) {
    const bearing = (b / BEARINGS) * Math.PI * 2;
    for (let a = 0; a < ANGLES.length; a++) {
      const pts = traceRay(p, z0, ANGLES[a], maxRange, 10);
      rays.push({ bearing, theta: ANGLES[a], pts });
    }
  }
  return rays;
}

export const DEPTH_VIS = 2.2;
export const RAY_BEARINGS = BEARINGS;
