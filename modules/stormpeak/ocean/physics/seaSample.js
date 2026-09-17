// @ts-nocheck
/** @ts-nocheck */
import { SWELL, TANH_H, swellAmp } from "./gerstner.js";

export { swellAmp };

/**
 * CPU sea used by buoyancy / impacts. Same four set waves as the ocean vertex
 * shader; tanh clamp at 48 m so 100 ft faces match what the hulls sit on.
 */
export function createSeaSampler() {
  const state = {
    t: 0,
    swell: 4,
    wx: -0.9613,
    wz: -0.2756,
    hs: 8,
  };

  const scratch = { h: 0, x: 0, z: 0, vx: 0, vy: 0, vz: 0, sx: 0, sz: 0, steep: 0 };

  function setWindDeg(deg) {
    const r = (deg / 180) * Math.PI;
    state.wx = Math.cos(r);
    state.wz = Math.sin(r);
  }

  function setState({ t, hs, windDeg } = {}) {
    if (t != null) state.t = t;
    if (hs != null) {
      state.hs = hs;
      state.swell = swellAmp(hs);
    }
    if (windDeg != null) setWindDeg(windDeg);
  }

  function sample(x, z, out = scratch) {
    const t = state.t;
    const swell = state.swell;
    let wx = state.wx;
    let wz = state.wz;
    const wlen = Math.hypot(wx, wz) || 1;
    wx /= wlen;
    wz /= wlen;
    const px = -wz;
    const pz = wx;

    let dx = 0;
    let dy = 0;
    let dz = 0;
    let vx = 0;
    let vy = 0;
    let vz = 0;
    let sx = 0;
    let sz = 0;

    for (let i = 0; i < SWELL.length; i++) {
      const w = SWELL[i];
      let dirx = wx;
      let dirz = wz;
      if (w.perp !== 0) {
        dirx = wx + px * w.perp;
        dirz = wz + pz * w.perp;
        const n = Math.hypot(dirx, dirz) || 1;
        dirx /= n;
        dirz /= n;
      }
      const amp = w.amp * swell;
      const th = w.k * (dirx * x + dirz * z) - w.omega * t + w.ph;
      const s = Math.sin(th);
      const c = Math.cos(th);
      const Qamp = w.Q * amp;
      dx += Qamp * dirx * c;
      dz += Qamp * dirz * c;
      dy += amp * s;
      sx += dirx * amp * w.k * c;
      sz += dirz * amp * w.k * c;
      vx += Qamp * dirx * w.omega * s;
      vz += Qamp * dirz * w.omega * s;
      vy += -amp * w.omega * c;
    }

    const thn = Math.tanh(dy / TANH_H);
    const sech2 = 1 - thn * thn;
    out.x = dx;
    out.z = dz;
    out.h = TANH_H * thn;
    out.vx = vx;
    out.vy = vy * sech2;
    out.vz = vz;
    out.sx = sx;
    out.sz = sz;
    out.steep = Math.hypot(sx, sz);
    return out;
  }

  function height(x, z) {
    return sample(x, z).h;
  }

  return {
    state,
    setState,
    setWindDeg,
    sample,
    height,
    get swell() {
      return state.swell;
    },
    get t() {
      return state.t;
    },
    get wind() {
      return { x: state.wx, z: state.wz };
    },
  };
}
