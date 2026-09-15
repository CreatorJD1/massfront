/* HULLS MUST RIDE THE WAVES THE GPU DRAWS.
 *
 * src/engine/ocean-mirror.js re-sums the FFT cascades' strongest modes on the
 * CPU for hull pitch and roll. A sign slip in the half-plane doubling, the
 * tile rotation or the slope would still produce plausible-looking motion -
 * a hull bobbing to a sea a few degrees off the one on screen - so these
 * checks pin the mirror to an independent brute-force evaluation of the same
 * field the GPU computes.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = p => readFile(new URL(p, import.meta.url), 'utf8');
const O = new Function(`${await read('../src/engine/ocean-spectrum.js')}\n${await read('../src/engine/ocean-mirror.js')}
return { MF_OCEAN_G, mfOceanSpectrumCreate, mfOceanSpectrumFill, mfOceanMirrorBuild, mfOceanMirrorSample, mfOceanMirrorHullPose };`)();

const N = 16;
const defs = [{ L: 180, rot: 0, gain: 1.3 }, { L: 47, rot: 23 * Math.PI / 180, gain: 0.9 }];
const ocean = {
  cascades: defs.map((d, c) => {
    const spec = O.mfOceanSpectrumCreate(N, d.L, 777 + c);
    O.mfOceanSpectrumFill(spec, {
      windSpeed: 15, windDir: 0.7, fetch: 100000, swellMix: 0.3, swellAngle: 0.7, spreadMin: 2,
      kLow: c === 0 ? 0 : 6 * 2 * Math.PI / d.L, kHigh: Math.PI * N / d.L * 0.8, rotation: d.rot
    });
    return { L: d.L, rot: d.rot, spec, gainApplied: d.gain };
  })
};

/* Independent formulation: every texel (both half-planes), texture-space
   wavevectors against rotated coordinates - the way the GPU samples a tile -
   rather than world wavevectors against world coordinates. */
function reference(x, z, t) {
  let h = 0;
  for (const C of ocean.cascades) {
    const co = Math.cos(C.rot), si = Math.sin(C.rot), dk = 2 * Math.PI / C.L, g = C.gainApplied, h0 = C.spec.h0;
    const u = co * x - si * z, v = si * x + co * z;
    for (let y = 0; y < N; y += 1) for (let xi = 0; xi < N; xi += 1) {
      const i = (y * N + xi) * 4;
      const ktx = (xi < N / 2 ? xi : xi - N) * dk, ktz = (y < N / 2 ? y : y - N) * dk;
      const w = Math.sqrt(O.MF_OCEAN_G * Math.hypot(ktx, ktz)) * t, c = Math.cos(w), s = Math.sin(w);
      const hr = (h0[i] * c + h0[i + 1] * s + h0[i + 2] * c + h0[i + 3] * s) * g;
      const hi = (h0[i + 1] * c - h0[i] * s + h0[i + 2] * s - h0[i + 3] * c) * g;
      const ph = ktx * u + ktz * v;
      h += hr * Math.cos(ph) - hi * Math.sin(ph);
    }
  }
  return h;
}

/* ---- 1. Every mode: the mirror is the field ---- */
const all = O.mfOceanMirrorBuild(ocean, { count: N * N * 2 });
assert.ok(Math.abs(all.energyFraction - 1) < 1e-12, 'keeping every mode must keep all the energy');
let maxErr = 0, maxH = 0;
for (let j = 0; j < 40; j += 1) {
  const x = (j * 137.3) % 3200, z = (j * 311.9) % 3200, t = j * 0.73;
  const a = reference(x, z, t), b = O.mfOceanMirrorSample(all, x, z, t).h;
  maxErr = Math.max(maxErr, Math.abs(a - b));
  maxH = Math.max(maxH, Math.abs(a));
}
assert.ok(maxH > 0, 'the reference sea must not be flat');
assert.ok(maxErr < maxH * 1e-9, `mirror with every mode must equal the full field (err ${maxErr}, peak ${maxH})`);

/* ---- 2. Slope is the derivative of the height it returns ---- */
const e = 1e-3;
for (let j = 0; j < 12; j += 1) {
  const x = 100 + j * 53.1, z = 200 + j * 91.7, t = 3 + j * 1.1;
  const s = O.mfOceanMirrorSample(all, x, z, t, {});
  const dx = (O.mfOceanMirrorSample(all, x + e, z, t).h - O.mfOceanMirrorSample(all, x - e, z, t).h) / (2 * e);
  const dz = (O.mfOceanMirrorSample(all, x, z + e, t).h - O.mfOceanMirrorSample(all, x, z - e, t).h) / (2 * e);
  assert.ok(Math.abs(dx - s.gx) < 1e-6 + Math.abs(dx) * 1e-4, `x slope ${s.gx} must match finite difference ${dx}`);
  assert.ok(Math.abs(dz - s.gz) < 1e-6 + Math.abs(dz) * 1e-4, `z slope ${s.gz} must match finite difference ${dz}`);
}

/* ---- 3. Fewer modes keep less energy, never more ---- */
const few = O.mfOceanMirrorBuild(ocean, { count: 8 }), some = O.mfOceanMirrorBuild(ocean, { count: 32 });
assert.ok(few.energyFraction > 0 && few.energyFraction < some.energyFraction && some.energyFraction <= 1,
  `energy must grow with mode count (${few.energyFraction}, ${some.energyFraction})`);

/* ---- 4. Hull pose on one known wave ---- */
const k = 2 * Math.PI / 100, A = 2;
const one = { modes: Float64Array.from([k, 0, Math.sqrt(O.MF_OCEAN_G * k), A, 0, 0, 0]), count: 1 };
/* At t = 0 this mode is h = A cos(k x). At x = 25 m the surface falls fastest
   along +x, so a short hull heading +x must pitch bow-down by atan(A k). */
const pose = O.mfOceanMirrorHullPose(one, 25, 0, 0, 1, 1, 0);
assert.ok(Math.abs(pose.pitch + Math.atan(A * k)) < 1e-3, `bow must drop into the trough: pitch ${pose.pitch}`);
assert.ok(Math.abs(pose.roll) < 1e-9, 'a wave along the heading must not roll the hull');
const beam = O.mfOceanMirrorHullPose(one, 25, 0, Math.PI / 2, 1, 1, 0);
/* Heading +z, port side is -x, which is up the slope: roll must be positive. */
assert.ok(Math.abs(beam.roll - Math.atan(A * k)) < 1e-3, `a beam sea must roll the hull, port up: roll ${beam.roll}`);
const flat = O.mfOceanMirrorHullPose({ modes: new Float64Array(0), count: 0 }, 10, 10, 1, 40, 9, 5);
assert.ok(flat.heave === 0 && flat.pitch === 0 && flat.roll === 0, 'a flat sea must leave the hull level');

console.log(`ocean mirror: PASS (exact to ${(maxErr / maxH).toExponential(1)}, 8 modes keep ${(few.energyFraction * 100).toFixed(0)}%, 32 keep ${(some.energyFraction * 100).toFixed(0)}% of the energy)`);
