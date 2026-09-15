/* THE OCEAN'S MATHS HAS TO BE RIGHT BEFORE ITS LOOK CAN BE JUDGED.
 *
 * A wrong FFT index or a broken conjugate pairing does not crash - it renders
 * as plausible-looking wrong water, and a look-dev cycle then tunes colours on
 * top of a bug. These checks pin the pieces a screenshot cannot:
 *   - the gather-form FFT used by src/engine/ocean-fft.js equals the textbook sum
 *   - the spectrum builds a REAL height field (h~(-k) = conj h~(k))
 *   - its energy is exactly the sampled spectral variance m0, so Hs = 4 sqrt(m0)
 *   - spreading integrates to one and the energy travels down the wind
 *   - each cascade carries only its own wavenumber band
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../src/engine/ocean-spectrum.js', import.meta.url), 'utf8');
const O = new Function(`${source}\nreturn { mfOceanSpectrumCreate, mfOceanSpectrumFill, mfOceanSpread, mfOceanWindForLevel };`)();

/* ---- 1. Gather FFT (the exact index maths of MF_OCEAN_FFT_FS) ---- */
function gather(re, im) {
  const N = re.length;
  let aR = Float64Array.from(re), aI = Float64Array.from(im);
  for (let s = 2; s <= N; s *= 2) {
    const oR = new Float64Array(N), oI = new Float64Array(N), hs = s / 2;
    for (let i = 0; i < N; i += 1) {
      const k = i % s, e = Math.floor(i / s) * hs + (k % hs), o = e + N / 2;
      const a = 2 * Math.PI * k / s, c = Math.cos(a), sn = Math.sin(a);
      oR[i] = aR[e] + c * aR[o] - sn * aI[o];
      oI[i] = aI[e] + sn * aR[o] + c * aI[o];
    }
    aR = oR; aI = oI;
  }
  return [aR, aI];
}
for (const N of [2, 4, 16, 64]) {
  const re = Array.from({ length: N }, (_, i) => Math.sin(i * 12.9898) * 43758.5453 % 1);
  const im = Array.from({ length: N }, (_, i) => Math.cos(i * 78.233) * 12345.678 % 1);
  const [gR, gI] = gather(re, im);
  for (let n = 0; n < N; n += 1) {
    let sR = 0, sI = 0;
    for (let m = 0; m < N; m += 1) {
      const a = 2 * Math.PI * m * n / N, c = Math.cos(a), s = Math.sin(a);
      sR += re[m] * c - im[m] * s; sI += re[m] * s + im[m] * c;
    }
    assert.ok(Math.abs(gR[n] - sR) < 1e-9 && Math.abs(gI[n] - sI) < 1e-9,
      `gather FFT must equal the synthesis sum (N=${N}, n=${n})`);
  }
}

/* ---- 2. Spectrum: real field, exact energy, direction, band ---- */
const N = 32, L = 180;
const spec = O.mfOceanSpectrumCreate(N, L, 1234567);
const windDir = 0.6, rotation = 23 * Math.PI / 180;
const kLow = 6 * 2 * Math.PI / L / 3, kHigh = Math.PI * N / L * 0.8;
const m0 = O.mfOceanSpectrumFill(spec, {
  windSpeed: 15.5, windDir, fetch: 120000, gamma: 3.3, swellMix: 0,
  spreadMin: 1, kLow, kHigh, rotation
});
assert.ok(m0 > 0, 'a storm spectrum inside the band must carry energy');

const dk = 2 * Math.PI / L;
let energy = 0, dirX = 0, dirY = 0, outOfBand = 0;
for (let y = 0; y < N; y += 1) for (let x = 0; x < N; x += 1) {
  const i = y * N + x;
  const kx = (x < N / 2 ? x : x - N) * dk, kz = (y < N / 2 ? y : y - N) * dk, k = Math.hypot(kx, kz);
  const h = spec.h0.subarray(i * 4, i * 4 + 4);
  const xi2 = spec.xi[i * 2] ** 2 + spec.xi[i * 2 + 1] ** 2;
  const a2 = (h[0] * h[0] + h[1] * h[1]) / xi2;           // a_k^2, noise divided out
  energy += 4 * a2;
  dirX += a2 * Math.cos(Math.atan2(kz, kx)); dirY += a2 * Math.sin(Math.atan2(kz, kx));
  if ((k < kLow || k >= kHigh) && a2 > 0) outOfBand += 1;
  /* Texel k must hold h0(-k) in its second pair. */
  const j = ((N - y) % N) * N + ((N - x) % N);
  assert.equal(h[2], spec.h0[j * 4], 'second pair must be h0(-k)');
  assert.equal(h[3], spec.h0[j * 4 + 1], 'second pair must be h0(-k)');
}
assert.ok(Math.abs(energy - m0) / m0 < 1e-4, `expected energy ${energy} must equal sampled m0 ${m0}`);
assert.equal(outOfBand, 0, 'no energy may sit outside the cascade band');
const meanDir = Math.atan2(dirY, dirX);
const off = Math.abs(Math.atan2(Math.sin(meanDir - (windDir + rotation)), Math.cos(meanDir - (windDir + rotation))));
assert.ok(off < 5 * Math.PI / 180, `energy must travel down the wind in texture space, off by ${(off * 180 / Math.PI).toFixed(1)} deg`);

/* Synthesize h(x) = sum h~ e^{ikx} with h~(k,0) = h0(k) + conj h0(-k). */
let maxIm = 0, maxRe = 0;
for (let ny = 0; ny < N; ny += 1) for (let nx = 0; nx < N; nx += 1) {
  let sR = 0, sI = 0;
  for (let y = 0; y < N; y += 1) for (let x = 0; x < N; x += 1) {
    const i = y * N + x, h = spec.h0.subarray(i * 4, i * 4 + 4);
    const hr = h[0] + h[2], hi = h[1] - h[3];
    const a = 2 * Math.PI * (x * nx + y * ny) / N, c = Math.cos(a), s = Math.sin(a);
    sR += hr * c - hi * s; sI += hr * s + hi * c;
  }
  maxIm = Math.max(maxIm, Math.abs(sI)); maxRe = Math.max(maxRe, Math.abs(sR));
}
assert.ok(maxRe > 0, 'the synthesized sea must not be flat');
assert.ok(maxIm < maxRe * 1e-5, `the height field must be real (max imaginary ${maxIm} vs ${maxRe})`);

/* ---- 3. Spreading and the wind ladder ---- */
for (const s of [1, 4, 12, 30]) {
  let sum = 0; const steps = 20000;
  for (let i = 0; i < steps; i += 1) sum += O.mfOceanSpread(-Math.PI + (i + 0.5) * 2 * Math.PI / steps, s) * 2 * Math.PI / steps;
  assert.ok(Math.abs(sum - 1) < 1e-3, `spreading s=${s} must integrate to 1, got ${sum}`);
}
for (let l = 1; l <= 8; l += 1) {
  assert.ok(O.mfOceanWindForLevel(l) > O.mfOceanWindForLevel(l - 1), 'wind must rise with sea level');
}

console.log(`ocean spectrum: PASS (gather FFT exact to 1e-9, m0 ${m0.toFixed(4)} m^2, direction off ${(off * 180 / Math.PI).toFixed(2)} deg, imaginary ${(maxIm / maxRe).toExponential(1)})`);
