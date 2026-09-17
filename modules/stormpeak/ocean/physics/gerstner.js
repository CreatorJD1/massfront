// @ts-nocheck
/** @ts-nocheck */
/**
 * Shared Tessendorf-set Gerstner. Must match oceanMaterial.js vertex addG
 * (k / omega / Q / phases and the 48 m tanh clamp) so hulls ride the faces
 * they sit on. FFT chop stays GPU-only — too expensive to read back.
 */

export const TANH_H = 48.0;

/** Long set waves. `perp` is signed: dir = normalize(wind + perp * windPerp). */
export const SWELL = [
  { amp: 0.9, k: 0.01532, omega: 0.388, ph: 0.4, Q: 0.3, perp: 0 },
  { amp: 0.58, k: 0.01122, omega: 0.332, ph: 1.7, Q: 0.26, perp: 0.16 },
  { amp: 0.38, k: 0.0237, omega: 0.482, ph: 0.9, Q: 0.32, perp: -0.28 },
  { amp: 0.2, k: 0.0359, omega: 0.594, ph: 2.2, Q: 0.28, perp: -0.22 },
  { amp: 0.14, k: 0.0478, omega: 0.686, ph: 0.55, Q: 0.22, perp: 0.42 },
  { amp: 0.09, k: 0.0685, omega: 0.821, ph: 1.9, Q: 0.18, perp: -0.51 },
];

export function swellAmp(hs) {
  return Math.max(0.12, 0.55 * hs + 0.04 * hs * hs);
}

export const gerstnerGLSL = /* glsl */ `
  const float SEA_TANH = 48.0;
  void addG(vec2 xz, vec2 dir, float amp, float k, float omega, float ph, float Q, float t, inout vec3 d, inout vec2 sl) {
    float th = k * (dir.x * xz.x + dir.y * xz.y) - omega * t + ph;
    float s = sin(th);
    float c = cos(th);
    d.x += Q * amp * dir.x * c;
    d.z += Q * amp * dir.y * c;
    d.y += amp * s;
    sl.x += dir.x * amp * k * c;
    sl.y += dir.y * amp * k * c;
  }
  void seaAt(vec2 xz, float t, vec2 wind, float swell, out float h, out vec2 slope) {
    vec3 g = vec3(0.0);
    vec2 gs = vec2(0.0);
    vec2 w = normalize(wind + vec2(0.001, 0.0));
    vec2 perp = vec2(-w.y, w.x);
    addG(xz, w, 0.90 * swell, 0.01532, 0.388, 0.40, 0.30, t, g, gs);
    addG(xz, normalize(w + perp * 0.16), 0.58 * swell, 0.01122, 0.332, 1.70, 0.26, t, g, gs);
    addG(xz, normalize(w + perp * -0.28), 0.38 * swell, 0.02370, 0.482, 0.90, 0.32, t, g, gs);
    addG(xz, normalize(w + perp * -0.22), 0.20 * swell, 0.03590, 0.594, 2.20, 0.28, t, g, gs);
    addG(xz, normalize(w + perp * 0.42), 0.14 * swell, 0.0478, 0.686, 0.55, 0.22, t, g, gs);
    addG(xz, normalize(w + perp * -0.51), 0.09 * swell, 0.0685, 0.821, 1.90, 0.18, t, g, gs);
    h = SEA_TANH * tanh(g.y / SEA_TANH);
    slope = gs;
  }
  float causticPat(vec2 p, float t) {
    float c = 0.0;
    vec2 q = p;
    c += pow(abs(sin(q.x * 3.05 + t * 0.92) * sin(q.y * 2.62 - t * 0.74)), 7.0);
    q = mat2(0.78, -0.62, 0.62, 0.78) * q + 1.7;
    c += pow(abs(sin(q.x * 4.35 - t * 1.08) * sin(q.y * 3.55 + t * 0.66)), 9.0);
    q = mat2(0.6, 0.8, -0.8, 0.6) * q + 3.1;
    c += pow(abs(sin(q.x * 5.9 + t * 0.55) * sin(q.y * 5.05 - t * 0.88)), 11.0);
    return c * 0.42;
  }
`;
