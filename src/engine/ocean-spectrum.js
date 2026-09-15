;
;
/* ============================================================================
   OCEAN SPECTRUM (CPU)
   ----------------------------------------------------------------------------
   Initial Fourier amplitudes for each FFT cascade: a JONSWAP wind sea with
   Mitsuyasu-type directional spreading, plus an optional narrow swell
   partition from a second direction. Two long crest systems crossing each
   other is what makes crests staggered instead of parallel walls.

   Presentation only. The simulation's sea state is src/sea.js; nothing here
   may feed unit movement, because GPU float maths is not deterministic across
   devices.

   The random draws are made once per (seed, N) and kept. A change of wind only
   re-weights their amplitudes, and deep-water dispersion (omega = sqrt(g k))
   does not depend on wind, so a rising storm grows the waves already on screen
   instead of replacing them with new ones.

   Normalisation: E|h0(k)|^2 = S(k) dk^2 / 2. Each k also carries conj(h0(-k)),
   so the height variance sums to m0 and Hs = 4 sqrt(m0) holds in real metres.
   ============================================================================ */
const MF_OCEAN_G = 9.81;

const MF_OCEAN_LANCZOS = [0.99999999999980993, 676.5203681218851, -1259.1392167224028,
  771.32342877765313, -176.61503916999185, 12.507343278686905,
  -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];

function mfOceanLgamma(x) {
  if (x < 0.5) return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * x))) - mfOceanLgamma(1 - x);
  x -= 1;
  let a = MF_OCEAN_LANCZOS[0];
  const t = x + 7.5;
  for (let i = 1; i < 9; i += 1) a += MF_OCEAN_LANCZOS[i] / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

/* D(theta) = Q(s) |cos(theta/2)|^(2s), integrating to 1 over a full turn. */
function mfOceanSpread(theta, s) {
  const lnQ = (2 * s - 1) * Math.LN2 + 2 * mfOceanLgamma(s + 1) - Math.log(Math.PI) - mfOceanLgamma(2 * s + 1);
  return Math.exp(lnQ) * Math.pow(Math.abs(Math.cos(theta * 0.5)), 2 * s);
}

/* JONSWAP energy at angular frequency omega for a given peak and scale. */
function mfOceanJonswap(omega, wp, alpha, gamma) {
  if (omega <= 1e-6) return 0;
  const sigma = omega <= wp ? 0.07 : 0.09;
  const r = Math.exp(-((omega - wp) * (omega - wp)) / (2 * sigma * sigma * wp * wp));
  return alpha * MF_OCEAN_G * MF_OCEAN_G / Math.pow(omega, 5) *
    Math.exp(-1.25 * Math.pow(wp / omega, 4)) * Math.pow(gamma, r);
}

/* Fetch-limited wind-sea peak and Phillips constant (Hasselmann et al.). */
function mfOceanWindSea(windSpeed, fetch) {
  const U = Math.max(0.5, windSpeed), F = Math.max(1000, fetch), g = MF_OCEAN_G;
  return {
    wp: 22 * Math.pow(g * g / (U * F), 1 / 3),
    alpha: 0.076 * Math.pow(U * U / (F * g), 0.22)
  };
}

function mfOceanRandom(seed) {
  let s = (seed >>> 0) || 0x9e3779b9;
  return function next() {
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5; s >>>= 0;
    return (s + 0.5) / 4294967296;
  };
}

/* One cascade's persistent random field: two unit Gaussians per texel. */
function mfOceanSpectrumCreate(N, L, seed) {
  const random = mfOceanRandom(seed);
  const xi = new Float32Array(N * N * 2);
  for (let i = 0; i < N * N; i += 1) {
    const u1 = random(), u2 = random();
    const mag = Math.sqrt(-2 * Math.log(u1));
    xi[i * 2] = mag * Math.cos(2 * Math.PI * u2);
    xi[i * 2 + 1] = mag * Math.sin(2 * Math.PI * u2);
  }
  return { N, L, xi, h0: new Float32Array(N * N * 4), m0: 0 };
}

/* Fill spec.h0 with [Re h0(k), Im h0(k), Re h0(-k), Im h0(-k)] per texel in
   FFT order (index n < N/2 is +n, otherwise n - N). Returns the sampled m0.

   params: windSpeed (m/s), windDir (rad, world), fetch (m), gamma,
           swellMix (0..1 energy share), swellAngle (rad from wind),
           swellPeakRatio, swellSpread (s), spreadMin (s floor),
           kLow, kHigh (band limit, rad/m), rotation (cascade tile rotation, rad),
           shortWaveLength (m, suppresses waves near the grid limit) */
function mfOceanSpectrumFill(spec, params) {
  const N = spec.N, L = spec.L, h0 = spec.h0, xi = spec.xi;
  const dk = 2 * Math.PI / L;
  const wind = mfOceanWindSea(params.windSpeed, params.fetch);
  const gamma = params.gamma == null ? 3.3 : params.gamma;
  const swellMix = Math.max(0, Math.min(1, params.swellMix || 0));
  const swellWp = wind.wp * (params.swellPeakRatio || 0.62);
  const swellAlpha = wind.alpha * swellMix;
  const seaAlpha = wind.alpha * (1 - 0.5 * swellMix);
  const spreadMin = params.spreadMin == null ? 1 : params.spreadMin;
  /* spreadGain > 1 narrows the spreading around the peak, which lengthens
     crests; presentation uses it so breaking crests read as lines. */
  const sPeak = 11.5 * (params.spreadGain || 1) * Math.pow(MF_OCEAN_G / (wind.wp * Math.max(0.5, params.windSpeed)), 2.5);
  /* Tile rotation: a wave travelling along world angle a appears along
     a + rotation in texture space, because uv = R(rotation) * xz / L. */
  const windTex = (params.windDir || 0) + (params.rotation || 0);
  const swellTex = windTex + (params.swellAngle || 0);
  const kLow = params.kLow || 0, kHigh = params.kHigh || Infinity;
  const cut = params.shortWaveLength ? Math.pow(params.shortWaveLength / (2 * Math.PI), 2) : 0;
  const amp = new Float32Array(N * N * 2);
  let m0 = 0;

  for (let y = 0; y < N; y += 1) {
    const kz = (y < N / 2 ? y : y - N) * dk;
    for (let x = 0; x < N; x += 1) {
      const kx = (x < N / 2 ? x : x - N) * dk;
      const i = y * N + x;
      const k = Math.hypot(kx, kz);
      if (k < 1e-8 || k < kLow || k >= kHigh) { amp[i * 2] = 0; amp[i * 2 + 1] = 0; continue; }
      const omega = Math.sqrt(MF_OCEAN_G * k);
      const dwdk = MF_OCEAN_G / (2 * omega);
      const theta = Math.atan2(kz, kx);
      const ratio = omega / wind.wp;
      const s = Math.max(spreadMin, sPeak * (ratio <= 1 ? Math.pow(ratio, 5) : Math.pow(ratio, -2.5)));
      let S = mfOceanJonswap(omega, wind.wp, seaAlpha, gamma) * mfOceanSpread(theta - windTex, s);
      if (swellAlpha > 0) {
        S += mfOceanJonswap(omega, swellWp, swellAlpha, 5) *
          mfOceanSpread(theta - swellTex, params.swellSpread || 24);
      }
      /* Polar to Cartesian: S(kx,kz) = S(omega) D(theta) (d omega / dk) / k. */
      let Sk = S * dwdk / k;
      if (cut) Sk *= Math.exp(-k * k * cut);
      m0 += Sk * dk * dk;
      const a = Math.sqrt(Math.max(0, Sk) * dk * dk * 0.5) / Math.SQRT2;
      amp[i * 2] = xi[i * 2] * a;
      amp[i * 2 + 1] = xi[i * 2 + 1] * a;
    }
  }
  for (let y = 0; y < N; y += 1) {
    const my = (N - y) % N;
    for (let x = 0; x < N; x += 1) {
      const mx = (N - x) % N;
      const i = y * N + x, j = my * N + mx;
      h0[i * 4] = amp[i * 2];
      h0[i * 4 + 1] = amp[i * 2 + 1];
      h0[i * 4 + 2] = amp[j * 2];
      h0[i * 4 + 3] = amp[j * 2 + 1];
    }
  }
  spec.m0 = m0;
  return m0;
}

/* Continuous Douglas level (0..8) to wind speed, from the calibration table in
   docs/OCEAN_SYSTEM_DESIGN.md. Pierson-Moskowitz Hs ~ 0.21 U^2 / g lands inside
   each Douglas band at these winds. */
const MF_OCEAN_LEVEL_WIND = [0, 1.5, 3.5, 7, 9.5, 12.5, 15.5, 19, 24];
function mfOceanWindForLevel(level) {
  const l = Math.max(0, Math.min(8, level));
  const i = Math.min(7, Math.floor(l)), f = l - i;
  return MF_OCEAN_LEVEL_WIND[i] + (MF_OCEAN_LEVEL_WIND[i + 1] - MF_OCEAN_LEVEL_WIND[i]) * f;
}
