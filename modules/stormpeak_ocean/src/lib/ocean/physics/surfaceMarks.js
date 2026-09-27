// @ts-nocheck
/** @ts-nocheck */
import * as THREE from "three";
import { MAX_CRATERS } from "../world/land.js";

/*
 * Nuke marks drawn inside the ocean and terrain shaders instead of as flat
 * meshes. Flat planes sat at one height (the sea under the camera), so waves
 * sliced through them and hills hid or cut them, which read as flicker. Here
 * every mark is evaluated per pixel on the real displaced water or terrain
 * surface, so it rides the crests and follows the ground.
 *
 * uMarkGz   = (gzX, gzZ, groundZeroR, lethal 0|1)
 * uMarkGz2  = (groundZeroAmt, tsunamiR, tsunamiAmt, blastAge)
 * uMarkFx   = (sprayR, sprayAmt, scorchR, scorchAmt)   spray/dust wash + land scorch
 * uMarkAim  = (aimX, aimZ, aimR, on 0|1)
 * uMarkTime = wall-clock seconds (aim dash crawl)
 * uCraters[i] = (x, z, radius, depthM)  permanent land craters (world/land.js)
 */
export function createSurfaceMarkUniforms() {
  return {
    uMarkGz: { value: new THREE.Vector4() },
    uMarkGz2: { value: new THREE.Vector4() },
    uMarkFx: { value: new THREE.Vector4() },
    uMarkAim: { value: new THREE.Vector4() },
    uMarkTime: { value: 0 },
    uCraters: { value: Array.from({ length: MAX_CRATERS }, () => new THREE.Vector4()) },
  };
}

/* Shared GLSL. `mkNoise` is world-space value noise, so nothing re-rolls per
   frame (the old spray disc hashed by time and strobed). Line widths are in
   world units and widen with distance so thin rings do not shimmer. */
export const surfaceMarksGLSL = /* glsl */ `
  uniform vec4 uMarkGz;
  uniform vec4 uMarkGz2;
  uniform vec4 uMarkFx;
  uniform vec4 uMarkAim;
  uniform float uMarkTime;
  float mkHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float mkNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mkHash(i), mkHash(i + vec2(1.0, 0.0)), f.x),
               mix(mkHash(i + vec2(0.0, 1.0)), mkHash(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  float mkBand(float d, float r, float halfW, float aa) {
    return 1.0 - smoothstep(halfW, halfW + aa, abs(d - r));
  }
  /* Scorch: 0..1 darkening for land. */
  float nukeScorch(vec2 p) {
    if (uMarkFx.w < 0.001) return 0.0;
    float d = length(p - uMarkGz.xy);
    float R = max(1.0, uMarkFx.z);
    float n = mkNoise(p * 0.09) * 0.6 + mkNoise(p * 0.31) * 0.4;
    float s = 1.0 - smoothstep(R * (0.35 + 0.3 * n), R * (0.95 + 0.25 * n), d);
    return s * uMarkFx.w;
  }
  /* Readable hazard layer. rgb is premultiplied, a is coverage:
     out = base * (1 - a) + rgb. */
  vec4 nukeMarks(vec2 p, float dist, float land) {
    vec3 col = vec3(0.0);
    float a = 0.0;
    float aa = 0.5 + dist * 0.0022;
    float d = length(p - uMarkGz.xy);
    if (uMarkFx.y > 0.001) {
      /* Spray over water, dust over land: a soft churned band behind the
         shock that breaks up with stable world-space noise. */
      float R = max(4.0, uMarkFx.x);
      float n = mkNoise(p * 0.07 + uMarkGz2.w * 0.05) * 0.55 + mkNoise(p * 0.23) * 0.45;
      float band = smoothstep(R * 0.15, R * 0.4, d) * (1.0 - smoothstep(R * 0.72, R, d));
      float k = band * (0.35 + 0.65 * n) * uMarkFx.y * 0.55;
      vec3 c = mix(vec3(0.85, 0.9, 0.94), vec3(0.3, 0.24, 0.17), land);
      col += c * k;
      a = max(a, k);
    }
    if (uMarkGz2.x > 0.001 && uMarkGz.z > 0.5) {
      float R = uMarkGz.z;
      float L = uMarkGz.w;
      float fill = 1.0 - smoothstep(R * 0.1, R + aa, d);
      float rim = mkBand(d, R - 1.6, 1.3, aa);
      float pulse = 0.7 + 0.3 * sin(uMarkGz2.w * 5.0);
      vec3 c = mix(vec3(1.0, 0.36, 0.07), vec3(1.0, 0.95, 0.82), L);
      float k = (fill * mix(0.28, 0.55, L) + rim * mix(0.95 * pulse, 0.75, L)) * uMarkGz2.x;
      k = min(k, 1.0);
      col = col * (1.0 - k) + c * (0.7 + 0.6 * rim) * k;
      a = max(a, k);
    }
    if (uMarkGz2.z > 0.001 && uMarkGz2.y > 6.0) {
      float k = mkBand(d, uMarkGz2.y, 2.4, aa) * uMarkGz2.z;
      col = col * (1.0 - k) + vec3(1.0, 0.55, 0.3) * k;
      a = max(a, k);
    }
    if (uMarkAim.w > 0.5) {
      vec2 q = p - uMarkAim.xy;
      float da = length(q);
      float ang = atan(q.y, q.x) / 6.2831853;
      float k = mkBand(da, uMarkAim.z, 1.25, aa) * 0.9;
      k *= step(0.45, fract(ang * 24.0 + uMarkTime * 0.25));
      k = max(k, (1.0 - smoothstep(1.2, 1.2 + aa, da)) * 0.9);
      col = col * (1.0 - k) + vec3(1.0, 0.2, 0.12) * k;
      a = max(a, k);
    }
    return vec4(col, a);
  }
`;

