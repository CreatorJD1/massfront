// @ts-nocheck
/** @ts-nocheck */
/**
 * Volumetric sky. Slab raymarch with Beer-Lambert, powder, and
 * Henyey-Greenstein (HZD model). Same 2D field still shadows the water.
 */
export const cloudNoiseGLSL = /* glsl */ `
  uniform float uTime;
  uniform vec2 uWindDir;
  uniform float uCloudCover;

  float hash21(vec2 p) {
    p = fract(p * vec2(127.1, 311.7));
    p += dot(p, p + 34.345);
    return fract(p.x * p.y);
  }
  float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash21(i);
    float b = hash21(i + vec2(1.0, 0.0));
    float c = hash21(i + vec2(0.0, 1.0));
    float d = hash21(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }
  float fbm3(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    mat2 m = mat2(0.80, -0.60, 0.60, 0.80);
    for (int i = 0; i < 3; i++) {
      v += a * vnoise(p);
      p = m * p * 2.05;
      a *= 0.5;
    }
    return v;
  }
  float fbm5(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    mat2 m = mat2(0.80, -0.60, 0.60, 0.80);
    for (int i = 0; i < 5; i++) {
      v += a * vnoise(p);
      p = m * p * 2.07;
      a *= 0.52;
    }
    return v;
  }
  vec2 cloudAdvect(vec2 xz) {
    return xz + uWindDir * uTime * 1.12;
  }
  float cloudRaw(vec2 xz, float scale, vec2 off) {
    vec2 p = cloudAdvect(xz) * scale + off;
    float n = fbm3(p);
    float r = 1.0 - abs(fbm3(p * 1.7 + 4.2) * 2.0 - 1.0);
    n = mix(n, n * r, 0.4);
    n += 0.18 * fbm3(p * 3.1 + 9.0);
    return clamp(n, 0.0, 1.0);
  }
  float cloudLayer(vec2 xz, float scale, vec2 off, float cover) {
    float n = cloudRaw(xz, scale, off);
    return smoothstep(cover, cover + 0.38, n);
  }
  float cloudF(vec2 xz) {
    float cover = mix(0.6, 0.2, clamp(uCloudCover, 0.0, 1.0));
    return max(
      cloudLayer(xz, 0.00048, vec2(0.0), cover),
      cloudLayer(xz, 0.00028, vec2(19.0, -8.0), cover + 0.08) * 0.75
    );
  }
  float cloudShadow(vec2 xz) {
    return cloudF(xz);
  }
`;

export const skyGLSL = /* glsl */ `
  uniform vec3 uSkyTop;
  uniform vec3 uSkyBottom;
  uniform vec3 uSunDirection;
  uniform vec3 uSunColor;
  uniform float uFlash;
  uniform vec3 uNukeOrigin;
  uniform float uNukeCloud;
  uniform float uNukeAge;
  ${cloudNoiseGLSL}

  const float C_BOT = 230.0;
  const float C_TOP = 520.0;

  float hgPhase(float cosT, float g) {
    float g2 = g * g;
    return (1.0 - g2) / pow(max(1e-4, 1.0 + g2 - 2.0 * g * cosT), 1.5);
  }

  float densityAt(vec3 p) {
    float h01 = (p.y - C_BOT) / (C_TOP - C_BOT);
    if (h01 < 0.0 || h01 > 1.0) return 0.0;
    float shape = smoothstep(0.0, 0.22, h01) * (1.0 - smoothstep(0.52, 1.0, h01));
    vec2 w = normalize(uWindDir + vec2(0.001, 0.0));
    vec2 local = vec2(dot(p.xz, w), dot(p.xz, vec2(-w.y, w.x)));
    vec2 uv = cloudAdvect(local) * vec2(0.00026, 0.00052);
    float n = fbm3(uv);
    n = mix(n, n * (1.0 - abs(fbm3(uv * 1.8 + 4.0) * 2.0 - 1.0)), 0.45);
    float cover = mix(0.7, 0.4, clamp(uCloudCover, 0.0, 1.0));
    float d = smoothstep(cover, cover + 0.28, n) * shape;
    d *= mix(0.35, 0.75, uCloudCover);
    return d;
  }

  vec3 marchClouds(vec3 ro, vec3 rd, vec3 sky, vec3 sd) {
    if (rd.y < 0.01) return sky;
    float tBot = (C_BOT - ro.y) / rd.y;
    float tTop = (C_TOP - ro.y) / rd.y;
    float t0 = min(tBot, tTop);
    float t1 = max(tBot, tTop);
    t0 = max(t0, 0.0);
    t1 = min(t1, 2200.0);
    if (t1 <= t0 + 1.0) return sky;

    float mu = dot(rd, sd);
    float phase = mix(hgPhase(mu, 0.55), hgPhase(mu, -0.28), 0.42) * 0.85 + 0.15;

    float dt = (t1 - t0) / 6.0;
    float T = 1.0;
    vec3 energy = vec3(0.0);
    float t = t0 + dt * 0.4;
    for (int i = 0; i < 6; i++) {
      vec3 p = ro + rd * t;
      float d = densityAt(p);
      if (d > 0.012) {
        float od = densityAt(p + sd * 22.0) + densityAt(p + sd * 48.0) * 0.55;
        float beers = exp(-od * 1.25);
        float powd = 1.0 - exp(-d * 2.4);
        powd = mix(1.0, powd, clamp(-mu * 0.5 + 0.5, 0.0, 1.0));
        float h01 = clamp((p.y - C_BOT) / (C_TOP - C_BOT), 0.0, 1.0);
        vec3 amb = mix(vec3(0.06, 0.07, 0.09), vec3(0.32, 0.34, 0.38), h01);
        vec3 L = uSunColor * beers * powd * phase * 2.1 + amb;
        float stepOd = d * min(dt, 140.0) * 0.008;
        float absorb = 1.0 - exp(-stepOd);
        energy += L * absorb * T;
        T *= exp(-stepOd);
        if (T < 0.025) break;
      }
      t += dt;
    }

    vec2 xzC = ro.xz + rd.xz * (780.0 / max(rd.y, 0.05));
    float cir = fbm3(cloudAdvect(xzC) * vec2(0.00011, 0.0005));
    cir = smoothstep(0.55, 0.84, cir) * (0.18 + 0.22 * (1.0 - uCloudCover)) * smoothstep(0.02, 0.18, rd.y);
    energy = mix(energy, vec3(0.52, 0.54, 0.58) + uSunColor * 0.1, cir * T);
    T *= 1.0 - cir * 0.55;

    energy += vec3(0.85, 0.9, 1.0) * uFlash * (1.0 - T);
    float amt = clamp(1.0 - T, 0.0, 0.72);
    amt *= smoothstep(0.01, 0.1, rd.y);
    return mix(sky, energy, amt);
  }

  vec3 skyColor(vec3 dir) {
    dir = normalize(dir);
    vec3 sd = normalize(uSunDirection);
    float up = clamp(dir.y, 0.0, 1.0);
    float mu = max(0.0, dot(dir, sd));

    vec3 zenith = mix(uSkyTop, vec3(0.14, 0.16, 0.19), 0.55);
    vec3 col = mix(uSkyBottom * 1.12, zenith, pow(up, 0.48));
    float haze = pow(1.0 - up, 3.2);
    col = mix(col, uSkyBottom * 1.22 + vec3(0.07, 0.065, 0.055), haze * 0.85);
    float rayleigh = 1.0 + mu * mu;
    col += vec3(0.12, 0.18, 0.32) * rayleigh * (1.0 - up) * 0.28;
    float g = 0.74;
    float mie = (1.0 - g * g) / max(0.02, pow(1.0 + g * g - 2.0 * g * mu, 1.5));
    col += uSunColor * mie * 0.04 * (0.35 + 0.65 * up);

    float disc = smoothstep(0.99915, 0.99985, mu);
    float glow = pow(mu, 180.0) * 0.75 + pow(mu, 6.0) * 0.32;
    col += uSunColor * (disc * 6.2 + glow);

    col = marchClouds(cameraPosition, dir, col, sd);
    if (uNukeCloud > 0.01) {
      vec3 toN = uNukeOrigin - cameraPosition;
      float nd = max(length(toN), 1.0);
      vec3 nDir = toN / nd;
      float along = max(0.0, dot(dir, nDir));
      float stem = smoothstep(0.90, 0.997, along) * uNukeCloud;
      float cap = smoothstep(0.55, 0.92, along) * uNukeCloud * 0.9;
      vec3 steam = mix(vec3(0.70, 0.76, 0.80), vec3(0.94, 0.96, 0.98), exp(-uNukeAge * 0.07));
      col = mix(col, steam, clamp(stem * 0.95 + cap * 0.72, 0.0, 0.84));
    }
    col += vec3(0.82, 0.9, 1.05) * uFlash * mix(0.25, 1.0, 1.0 - up);
    return col;
  }
`;
