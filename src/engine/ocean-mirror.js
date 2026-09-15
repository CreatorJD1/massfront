;
;
/* ============================================================================
   OCEAN CPU MIRROR
   ----------------------------------------------------------------------------
   The strongest Fourier modes of the FFT cascades, summed on the CPU, so a
   hull can pitch and roll on the waves the GPU draws without reading the GPU
   back. A readback stalls a mobile frame; a sum of ~128 cosines per probe
   point does not, and the short waves it drops are chop a hull averages out.

   Same conventions as ocean-fft.js. Texel (mx, mz) holds
     h~(k, t) = h0(k) e^{-iwt} + conj(h0(-k)) e^{iwt}
   and the field is Re sum h~ e^{i k.(R x)}, R being the cascade's tile
   rotation, so the world wavevector is R^T k. Texels k and -k contribute
   identical real parts, so the mirror keeps one half-plane and doubles it.

   Height and slope only. Choppy horizontal displacement moves a crest by a few
   metres; a pose that ignores it tilts slightly early. Presentation only -
   never simulation input.
   ============================================================================ */
function mfOceanMirrorBuild(ocean, options) {
  const opts = options || {};
  const count = opts.count == null ? 128 : opts.count;
  const use = opts.cascades || [0, 1];
  const cand = [];
  let total = 0;
  for (const c of use) {
    const C = ocean.cascades[c];
    if (!C) continue;
    const N = C.spec.N, h0 = C.spec.h0, g = C.gainApplied == null ? 1 : C.gainApplied;
    for (let y = 0; y < N; y += 1) {
      const mz = y < N / 2 ? y : y - N;
      for (let x = 0; x < N; x += 1) {
        const mx = x < N / 2 ? x : x - N;
        if (mz < 0 || (mz === 0 && mx <= 0)) continue;
        const i = (y * N + x) * 4;
        const e = (h0[i] * h0[i] + h0[i + 1] * h0[i + 1] + h0[i + 2] * h0[i + 2] + h0[i + 3] * h0[i + 3]) * g * g;
        if (!(e > 0)) continue;
        total += e;
        cand.push({ e, c, i, mx, mz });
      }
    }
  }
  cand.sort((a, b) => b.e - a.e);
  const n = Math.max(0, Math.min(count, cand.length));
  /* Float64: a float32 wavenumber times a 3 km coordinate drifts the phase. */
  const modes = new Float64Array(n * 7);
  let kept = 0;
  for (let j = 0; j < n; j += 1) {
    const m = cand[j], C = ocean.cascades[m.c], h0 = C.spec.h0;
    const s = 2 * (C.gainApplied == null ? 1 : C.gainApplied);
    const dk = 2 * Math.PI / C.L, co = Math.cos(C.rot), si = Math.sin(C.rot);
    const ktx = m.mx * dk, ktz = m.mz * dk;
    const kx = co * ktx + si * ktz, kz = -si * ktx + co * ktz;
    const o = j * 7;
    modes[o] = kx;
    modes[o + 1] = kz;
    modes[o + 2] = Math.sqrt(MF_OCEAN_G * Math.hypot(kx, kz));
    modes[o + 3] = h0[m.i] * s;
    modes[o + 4] = h0[m.i + 1] * s;
    modes[o + 5] = h0[m.i + 2] * s;
    modes[o + 6] = h0[m.i + 3] * s;
    kept += m.e;
  }
  return { modes, count: n, energyFraction: total > 0 ? kept / total : 0 };
}

/* Height above mean water (m) and its world slope at (x, z) and time t. */
function mfOceanMirrorSample(mirror, x, z, t, out) {
  const r = out || { h: 0, gx: 0, gz: 0 };
  const M = mirror.modes;
  let h = 0, gx = 0, gz = 0;
  for (let o = 0, end = mirror.count * 7; o < end; o += 7) {
    const w = M[o + 2] * t, c = Math.cos(w), s = Math.sin(w);
    const ar = M[o + 3], ai = M[o + 4], br = M[o + 5], bi = M[o + 6];
    const hr = ar * c + ai * s + br * c + bi * s;
    const hi = ai * c - ar * s + br * s - bi * c;
    const ph = M[o] * x + M[o + 1] * z, cp = Math.cos(ph), sp = Math.sin(ph);
    h += hr * cp - hi * sp;
    const im = hr * sp + hi * cp;
    gx -= M[o] * im;
    gz -= M[o + 1] * im;
  }
  r.h = h; r.gx = gx; r.gz = gz;
  return r;
}

/* Heave (m), pitch and roll (rad) for a hull of the given length and beam at
   (x, z) heading along world yaw: heights sampled at bow, stern and both
   beams, so the hull spans the wave instead of riding one point of it.
   Positive pitch is bow up; positive roll is the port side (left of the
   heading) up. */
const MF_OCEAN_MIRROR_SCRATCH = { h: 0, gx: 0, gz: 0 };
function mfOceanMirrorHullPose(mirror, x, z, yaw, length, beam, t, out) {
  const r = out || { heave: 0, pitch: 0, roll: 0 };
  const S = MF_OCEAN_MIRROR_SCRATCH;
  const fx = Math.cos(yaw), fz = Math.sin(yaw), px = -fz, pz = fx;
  const hl = length * 0.5, hb = beam * 0.5;
  const bow = mfOceanMirrorSample(mirror, x + fx * hl, z + fz * hl, t, S).h;
  const stern = mfOceanMirrorSample(mirror, x - fx * hl, z - fz * hl, t, S).h;
  const port = mfOceanMirrorSample(mirror, x + px * hb, z + pz * hb, t, S).h;
  const stbd = mfOceanMirrorSample(mirror, x - px * hb, z - pz * hb, t, S).h;
  r.heave = (bow + stern + port + stbd) * 0.25;
  r.pitch = Math.atan2(bow - stern, Math.max(1e-6, length));
  r.roll = Math.atan2(port - stbd, Math.max(1e-6, beam));
  return r;
}
