// @ts-nocheck
/** @ts-nocheck */
import * as THREE from "three";
import { config } from "../config.js";
import { skyGLSL } from "../glsl/sky.glsl.js";

/**
 * Tessendorf surface. LOD:
 *   1 far   — large cascades, hole for the near patch
 *   2 near  — mid cascades, hole for the ultra patch
 *   3 ultra — all cascades + capillary detail
 *
 * Lighting: dual-lobe GGX, Schlick Fresnel, view-dependent absorption,
 * back-lit SSS on steep faces only, wind-streak jacobian foam, specular AA.
 *
 * @param {object} sky
 * @param {{ lodMode?: number, lodRadius?: number, lodInner?: number }} [opts]
 */
export function createOceanMaterial(sky, opts = {}) {
  const nc = config.sim.cascades.length;
  const foamCount = Math.max(1, nc - 1);
  const lodMode = opts.lodMode ?? 0;
  const lodRadius = opts.lodRadius ?? 100;
  const lodInner = opts.lodInner ?? 0;

  const uniforms = {
    uNormalStrength: { value: config.lighting.normalStrength },
    uDisplacementScale: { value: config.sim.displacementScale },
    uSkyTop: { value: sky.topColor },
    uSkyBottom: { value: sky.bottomColor },
    uSunDirection: { value: sky.sunDirection },
    uSunColor: { value: sky.sunColor },
    uSunIrradiance: { value: new THREE.Color(...config.colors.sunIrradiance) },
    uScatterColor: { value: new THREE.Color(...config.colors.scatter) },
    uBubbleColor: { value: new THREE.Color(...config.colors.bubble) },
    uFoamColor: { value: new THREE.Color(...config.colors.foam) },
    uDeepColor: { value: new THREE.Color(...config.colors.deep) },
    uRoughness: { value: config.lighting.roughness },
    uWavePeakScatterStrength: { value: config.lighting.wavePeakScatterStrength },
    uScatterStrength: { value: config.lighting.scatterStrength },
    uScatterShadowStrength: { value: config.lighting.scatterShadowStrength },
    uEnvironmentLightStrength: { value: config.lighting.environmentLightStrength },
    uBubbleDensity: { value: config.lighting.bubbleDensity },
    uHeightModifier: { value: config.lighting.heightModifier },
    uChopSssStrength: { value: config.lighting.chopSssStrength ?? 0.7 },
    uChopSssWrap: { value: config.lighting.chopSssWrap ?? 2.2 },
    uFogColor: { value: new THREE.Color(...config.colors.fog) },
    uHorizonWater: { value: new THREE.Color(...(config.colors.horizonWater || config.colors.fog)) },
    uFogNear: { value: config.fog.near },
    uFogFar: { value: config.fog.far },
    uDetailFadeStart: { value: 80 },
    uDetailFadeEnd: { value: config.fog.far },
    uFoamTex: { value: null },
    uFoamAmount: { value: config.foam.amount },
    uTime: { value: 0 },
    uGerstnerAmp: { value: 1.0 },
    uBoatPos: { value: new THREE.Vector2(1e9, 1e9) },
    uBoatDir: { value: new THREE.Vector2(0, 1) },
    uBoatHalf: { value: new THREE.Vector2(0, 0) },
    uBoatDip: { value: 0.6 },
    uWakeTex: { value: null },
    uWakeCenter: { value: new THREE.Vector2(0, 0) },
    uWakeWorldSize: { value: 900 },
    uLodMode: { value: lodMode },
    uLodRadius: { value: lodRadius },
    uLodInner: { value: lodInner },
    uLodCenter: { value: new THREE.Vector2() },
    uUnderwater: { value: 0 },
    uWindDir: {
      value: new THREE.Vector2(
        Math.cos((config.spectrum.windDirection / 180) * Math.PI),
        Math.sin((config.spectrum.windDirection / 180) * Math.PI),
      ),
    },
  };
  for (let i = 0; i < nc; i++) {
    uniforms[`uDisp${i}`] = { value: null };
    uniforms[`uSlope${i}`] = { value: null };
    uniforms[`uLengthScale${i}`] = { value: config.sim.cascades[i].lengthScale };
  }
  for (let i = 0; i < foamCount; i++) uniforms[`uFoam${i}`] = { value: null };

  const sampler2Ds = Array.from(
    { length: nc },
    (_, i) =>
      `uniform sampler2D uDisp${i}; uniform sampler2D uSlope${i}; uniform float uLengthScale${i};`,
  ).join("\n");

  const sumDisp = Array.from({ length: nc }, (_, i) => {
    const ls = config.sim.cascades[i].lengthScale;
    const foamAdd = i < nc - 1 ? " foam += d.a * w;" : "";
    if (ls < 20) {
      return `{ vec4 d = texture2D(uDisp${i}, flatPos.xz / uLengthScale${i});
        float w = veryHi;
        disp += d.xyz * w;${foamAdd} }`;
    }
    if (ls < 80) {
      return `{ vec4 d = texture2D(uDisp${i}, flatPos.xz / uLengthScale${i});
        float w = midHi;
        disp += d.xyz * w;${foamAdd} }`;
    }
    return `{ vec4 d = texture2D(uDisp${i}, flatPos.xz / uLengthScale${i});
      float w = 1.0;
      disp += d.xyz;${foamAdd} }`;
  }).join("\n");

  const last = nc - 1;
  const lastLs = config.sim.cascades[last]?.lengthScale ?? 16;
  const extraTile =
    lastLs < 80
      ? `{ vec2 uvB = (flatPos.zx * vec2(-0.91, 1.07) + 13.7) / (uLengthScale${last} * 1.61);
        vec4 dB = texture2D(uDisp${last}, uvB);
        disp += dB.xyz * veryHi * closeCap * 0.08; }`
      : "";

  const sumSlope = Array.from({ length: nc }, (_, i) => {
    const ls = config.sim.cascades[i].lengthScale;
    if (ls < 20) {
      return `slope += texture2D(uSlope${i}, vFlatXZ / uLengthScale${i}).xy * mix(0.95, 0.42, distFade) * vVeryHi;`;
    }
    if (ls < 80) {
      return `slope += texture2D(uSlope${i}, vFlatXZ / uLengthScale${i}).xy * mix(1.12, 0.72, distFade) * vMidHi;`;
    }
    if (ls > 300) {
      return `slope += texture2D(uSlope${i}, vFlatXZ / uLengthScale${i}).xy * mix(0.7, 1.08, distFade);`;
    }
    return `slope += texture2D(uSlope${i}, vFlatXZ / uLengthScale${i}).xy * 1.0;`;
  }).join("\n");

  const foamDecls = Array.from(
    { length: foamCount },
    (_, i) => `uniform sampler2D uFoam${i};`,
  ).join("\n");
  const sumFoam = Array.from(
    { length: foamCount },
    (_, i) => `accFoam += texture2D(uFoam${i}, vFlatXZ / uLengthScale${i}).r;`,
  ).join("\n");

  return new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      ${Array.from({ length: nc }, (_, i) => `uniform sampler2D uDisp${i}; uniform float uLengthScale${i};`).join("\n")}
      uniform float uDisplacementScale;
      uniform float uTime;
      uniform float uGerstnerAmp;
      uniform vec2 uBoatPos, uBoatDir, uBoatHalf;
      uniform float uBoatDip;
      uniform float uLodMode, uLodRadius, uLodInner;
      uniform vec2 uLodCenter;
      uniform vec2 uWindDir;
      varying vec3 vWorldPos;
      varying vec2 vFlatXZ;
      varying float vFoam;
      varying float vHeight;
      varying float vChop;
      varying vec2 vGSlope;
      varying float vLodR;
      varying float vVeryHi;
      varying float vMidHi;

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

      void main() {
        vec3 flatPos = (modelMatrix * vec4(position, 1.0)).xyz;
        vFlatXZ = flatPos.xz;
        vLodR = length(flatPos.xz - uLodCenter);
        float veryHi = 1.0;
        float midHi = 1.0;
        if (uLodMode > 2.5) {
          veryHi = 1.0 - smoothstep(uLodRadius * 0.55, uLodRadius * 0.82, vLodR);
          midHi = 1.0;
        } else if (uLodMode > 1.5) {
          veryHi = 0.0;
          midHi = 1.0 - smoothstep(uLodRadius * 0.55, uLodRadius * 0.82, vLodR);
        } else if (uLodMode > 0.5) {
          veryHi = 0.0;
          midHi = 0.0;
        }
        vVeryHi = veryHi;
        vMidHi = midHi;

        float eye = length(cameraPosition.xz - flatPos.xz);
        float closeCap = 1.0 - smoothstep(8.0, 70.0, eye);

        vec3 disp = vec3(0.0);
        float foam = 0.0;
        ${sumDisp}
        ${extraTile}
        disp *= uDisplacementScale;

        vec3 g = vec3(0.0);
        vec2 gs = vec2(0.0);
        float t = uTime;
        vec2 w = normalize(uWindDir + vec2(0.001, 0.0));
        vec2 p1 = normalize(w + vec2(-w.y, w.x) * 0.16);
        vec2 p2 = normalize(w + vec2(w.y, -w.x) * 0.28);
        vec2 p3 = normalize(w + vec2(-w.y, w.x) * -0.22);
        float swell = uGerstnerAmp;
        addG(flatPos.xz, w,  0.90 * swell, 0.01532, 0.388, 0.40, 0.30, t, g, gs);
        addG(flatPos.xz, p1, 0.58 * swell, 0.01122, 0.332, 1.70, 0.26, t, g, gs);
        addG(flatPos.xz, p2, 0.38 * swell, 0.02370, 0.482, 0.90, 0.32, t, g, gs);
        addG(flatPos.xz, p3, 0.20 * swell, 0.03590, 0.594, 2.20, 0.28, t, g, gs);
        vec2 p4 = normalize(w + vec2(-w.y, w.x) * 0.42);
        vec2 p5 = normalize(w + vec2(-w.y, w.x) * -0.51);
        addG(flatPos.xz, p4, 0.14 * swell, 0.0478, 0.686, 0.55, 0.22, t, g, gs);
        addG(flatPos.xz, p5, 0.09 * swell, 0.0685, 0.821, 1.90, 0.18, t, g, gs);
        float gMul = closeCap * veryHi * min(1.6, swell * 0.08);
        addG(flatPos.xz, normalize(vec2(0.97, 0.24)), 0.038 * gMul, 2.35, 4.80, 0.40, 0.38, t, g, gs);
        addG(flatPos.xz, normalize(vec2(0.42, 0.91)), 0.026 * gMul, 3.70, 6.10, 1.70, 0.34, t, g, gs);
        addG(flatPos.xz, normalize(vec2(-0.62, 0.78)), 0.016 * gMul, 5.90, 7.80, 0.90, 0.28, t, g, gs);
        addG(flatPos.xz, normalize(vec2(0.88, -0.47)), 0.011 * gMul, 8.80, 9.60, 2.20, 0.24, t, g, gs);
        addG(flatPos.xz, normalize(vec2(-0.18, 0.98)), 0.007 * gMul, 13.2, 11.8, 0.15, 0.20, t, g, gs);
        disp += g;
        disp.y = 48.0 * tanh(disp.y / 48.0);
        vGSlope = gs;

        vec3 wp = flatPos + disp;
        vec2 brel = wp.xz - uBoatPos;
        vec2 bf = uBoatDir;
        vec2 br = vec2(bf.y, -bf.x);
        float ba = dot(brel, bf) / max(uBoatHalf.x, 0.001);
        float bc = dot(brel, br) / max(uBoatHalf.y, 0.001);
        float bowl = 1.0 - smoothstep(0.55, 1.15, ba * ba + bc * bc);
        wp.y -= bowl * uBoatDip;
        vFoam = foam;
        vHeight = disp.y;
        vChop = length(disp.xz);
        vWorldPos = wp;
        gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      precision highp float;
      #define PI 3.141592653589793
      ${skyGLSL}
      ${sampler2Ds}
      ${foamDecls}
      uniform vec3 uSunIrradiance, uScatterColor, uBubbleColor, uFoamColor, uDeepColor;
      uniform float uNormalStrength;
      uniform float uRoughness, uWavePeakScatterStrength, uScatterStrength;
      uniform float uScatterShadowStrength, uEnvironmentLightStrength, uBubbleDensity, uHeightModifier;
      uniform float uChopSssStrength, uChopSssWrap;
      uniform vec3 uFogColor, uHorizonWater;
      uniform float uFogNear, uFogFar, uDetailFadeStart, uDetailFadeEnd, uTime, uFoamAmount;
      uniform sampler2D uFoamTex;
      uniform vec2 uWindDir;
      uniform sampler2D uWakeTex;
      uniform vec2 uWakeCenter;
      uniform float uWakeWorldSize;
      uniform float uLodMode, uLodRadius, uLodInner;
      uniform vec2 uLodCenter;
      uniform float uUnderwater;
      varying vec3 vWorldPos;
      varying vec2 vFlatXZ;
      varying float vFoam;
      varying float vHeight;
      varying float vChop;
      varying vec2 vGSlope;
      varying float vLodR;
      varying float vVeryHi;
      varying float vMidHi;

      float sat(float x) { return clamp(x, 0.0, 1.0); }
      float dotc(vec3 a, vec3 b) { return max(0.0, dot(a, b)); }

      float D_GGX(float ndoth, float r) {
        float aa = r * r;
        float d = ndoth * ndoth * (aa - 1.0) + 1.0;
        return aa / (PI * d * d);
      }
      float G_Smith(float ndotv, float ndotl, float r) {
        float k = (r + 1.0) * (r + 1.0) * 0.125;
        float gv = ndotv / (ndotv * (1.0 - k) + k);
        float gl = ndotl / (ndotl * (1.0 - k) + k);
        return gv * gl;
      }

      vec2 capillary(vec2 xz, float t) {
        vec2 s = vec2(0.0);
        vec2 d;
        d = normalize(vec2(0.94, 0.34));
        s += d * cos(dot(xz, d) * 7.2 - t * 3.4) * 0.024;
        d = normalize(vec2(0.28, 0.96));
        s += d * cos(dot(xz, d) * 11.5 - t * 4.6) * 0.016;
        d = normalize(vec2(-0.72, 0.69));
        s += d * cos(dot(xz, d) * 17.8 - t * 6.1) * 0.010;
        d = normalize(vec2(0.81, -0.59));
        s += d * cos(dot(xz, d) * 24.4 - t * 7.4) * 0.006;
        return s;
      }

      void main() {
        if (uLodMode > 2.5) {
          if (vLodR > uLodRadius) discard;
        } else if (uLodMode > 1.5) {
          if (vLodR < uLodInner * 0.86 || vLodR > uLodRadius) discard;
        } else if (uLodMode > 0.5) {
          if (vLodR < uLodRadius * 0.86) discard;
        }

        float fftDist = length(cameraPosition - vWorldPos);
        float distFade = smoothstep(16.0, 260.0, fftDist);
        float closeN = 1.0 - smoothstep(5.0, 70.0, fftDist);
        float detailFade = sat(1.0 - (fftDist - uDetailFadeStart) / max(1.0, uDetailFadeEnd - uDetailFadeStart));

        vec2 slope = vec2(0.0);
        ${sumSlope}
        slope += vGSlope * 0.85;
        slope += capillary(vFlatXZ, uTime) * closeN * vVeryHi;
        slope *= uNormalStrength * mix(0.96, mix(1.04, detailFade, distFade), 1.0 - closeN);

        vec3 normal = normalize(vec3(-slope.x, 1.0, -slope.y));
        float facetSoft = smoothstep(180.0, 1100.0, fftDist) * 0.18;
        normal = normalize(mix(normal, vec3(0.0, 1.0, 0.0), facetSoft));

        vec3 viewDir = normalize(cameraPosition - vWorldPos);
        if (!gl_FrontFacing) {
          vec3 nUp = normal;
          vec3 I = normalize(vWorldPos - cameraPosition);
          float ndi = sat(-dot(nUp, I));
          float crit = 0.662;
          float window = smoothstep(crit - 0.10, crit + 0.04, ndi);
          vec3 Rair = refract(I, nUp, 1.333);
          vec3 sky = skyColor(length(Rair) > 0.01 ? normalize(Rair) : nUp);
          vec2 cauUv = vFlatXZ * 0.058 + slope * 1.1;
          float cau = 0.0;
          vec2 cq = cauUv;
          cau += pow(abs(sin(cq.x * 3.05 + uTime * 0.92) * sin(cq.y * 2.62 - uTime * 0.74)), 7.0);
          cq = mat2(0.78, -0.62, 0.62, 0.78) * cq + 1.7;
          cau += pow(abs(sin(cq.x * 4.35 - uTime * 1.08) * sin(cq.y * 3.55 + uTime * 0.66)), 9.0);
          cq = mat2(0.6, 0.8, -0.8, 0.6) * cq + 3.1;
          cau += pow(abs(sin(cq.x * 5.9 + uTime * 0.55) * sin(cq.y * 5.05 - uTime * 0.88)), 10.0);
          float trough = sat(0.62 - vHeight * 0.035);
          vec3 transmit = sky * vec3(0.42, 0.78, 0.72) * (0.55 + 0.7 * ndi);
          transmit += uSunIrradiance * vec3(0.22, 0.62, 0.48) * cau * 0.85 * (0.4 + 0.6 * trough);
          vec3 refl = reflect(I, nUp);
          vec3 tir = uDeepColor * 0.55 + skyColor(refl) * 0.22;
          tir += vec3(0.10, 0.42, 0.40) * cau * 0.9;
          float F = pow(1.0 - ndi, 5.0);
          vec3 under = mix(tir, transmit, window);
          under = mix(under, tir, F * 0.4);
          under += uSunIrradiance * vec3(0.35, 0.7, 0.55) * pow(sat(dot(-I, normalize(uSunDirection))), 32.0) * 0.45;
          float fogU = smoothstep(10.0, 220.0, fftDist);
          gl_FragColor = vec4(mix(under, vec3(0.03, 0.14, 0.16), fogU * 0.7), 1.0);
          return;
        }
        vec3 lightDir = normalize(uSunDirection);
        vec3 halfwayDir = normalize(lightDir + viewDir);
        float NdotV = max(0.001, dot(normal, viewDir));
        float NdotL = dotc(normal, lightDir);
        float NdotH = max(0.0001, dot(normal, halfwayDir));

        float accFoam = 0.0;
        ${sumFoam}
        float foam = sat(max(accFoam, vFoam));
        float slopeLen = length(slope);
        float steep = smoothstep(0.28, 1.35, slopeLen);
        float jacTip = smoothstep(0.24, 0.66, foam);
        float crest = smoothstep(8.0, 26.0, vHeight);
        float trough = 1.0 - smoothstep(-22.0, 2.0, vHeight);

        float nLen = length(fwidth(normal));
        float a = max(0.048, uRoughness + foam * 0.18 + steep * 0.02 + nLen * 1.35 + closeN * 0.018);
        a = min(0.30, a);

        float F0 = 0.02;
        float F = F0 + (1.0 - F0) * pow(1.0 - NdotV, 5.0);
        F = mix(F, F0, a * 0.4);
        F = sat(F);

        float aWide = min(0.36, a * 1.8);
        float aTight = max(0.048, a * 0.52);
        float D = mix(D_GGX(NdotH, aWide), D_GGX(NdotH, aTight), 0.32);
        float G = G_Smith(NdotV, max(0.001, NdotL), a);
        vec3 specular = uSunIrradiance * F * G * D / max(0.001, 4.0 * NdotV);
        specular *= sat(NdotL * 1.15);
        float specAA = sat(1.0 - nLen * 6.0);
        specular *= mix(0.28, 1.0, specAA);
        specular = min(specular, vec3(1.55));

        float downLook = pow(NdotV, 1.15);
        float wrapN = sat((NdotL + 0.42) / 1.42);
        float bodyShade = 0.58 + 0.38 * wrapN + 0.12 * crest - 0.08 * trough;
        vec3 scatter = mix(uHorizonWater, uDeepColor, downLook * 0.82) * uSunIrradiance * bodyShade;
        scatter += uDeepColor * 0.32;
        vec3 hemi = mix(uSkyBottom * 0.75, uSkyTop, sat(normal.y * 0.55 + 0.45));
        scatter += hemi * 0.24 * uEnvironmentLightStrength;

        float backLit = pow(sat(dot(viewDir, -lightDir)), uChopSssWrap);
        float wrappedLit = sat((dot(normal, lightDir) + 0.9) / 1.9);
        float lip = smoothstep(0.18, 0.95, steep);
        float rim = pow(1.0 - NdotV, 2.0);
        float trans = lip * (0.40 * wrappedLit + 0.95 * backLit) * mix(0.5, 1.0, rim);
        trans *= mix(0.62, 1.0, max(jacTip, crest * 0.55));
        float thick = mix(1.65, 0.18, lip * mix(0.45, 1.0, max(crest, jacTip)));
        vec3 sss = uScatterColor * uSunIrradiance * trans * exp(-thick * downLook);
        scatter += sss * (0.85 + uWavePeakScatterStrength * 0.55);
        scatter += uScatterStrength * uScatterColor * uSunIrradiance * rim * lip * 0.7;
        scatter += uScatterShadowStrength * wrapN * uDeepColor * uSunIrradiance * 0.22;
        scatter += uBubbleDensity * uBubbleColor * uSunIrradiance * (0.14 + 0.32 * trans);

        vec2 cauUv = vFlatXZ * 0.072 + slope * 1.15 + lightDir.xz * vHeight * 0.012;
        float cau = 0.0;
        vec2 cq = cauUv;
        cau += pow(abs(sin(cq.x * 3.05 + uTime * 0.92) * sin(cq.y * 2.62 - uTime * 0.74)), 7.0);
        cq = mat2(0.78, -0.62, 0.62, 0.78) * cq + 1.7;
        cau += pow(abs(sin(cq.x * 4.35 - uTime * 1.08) * sin(cq.y * 3.55 + uTime * 0.66)), 9.0);
        cq = mat2(0.6, 0.8, -0.8, 0.6) * cq + 3.1;
        cau += pow(abs(sin(cq.x * 5.9 + uTime * 0.55) * sin(cq.y * 5.05 - uTime * 0.88)), 11.0);
        float cauFocus = sat(1.12 - abs(slopeLen - 0.4) * 1.45);
        float cauAmt = cau * 0.28 * cauFocus * (0.28 + 0.72 * trough) * (1.0 - jacTip * 0.65);
        scatter += uSunIrradiance * vec3(0.18, 0.44, 0.34) * cauAmt * (0.4 + 0.6 * wrapN);

        vec3 reflectDir = reflect(-viewDir, normal);
        reflectDir = normalize(mix(reflectDir, vec3(reflectDir.x, abs(reflectDir.y), reflectDir.z), a * 0.42));
        vec3 envReflection = skyColor(reflectDir) * uEnvironmentLightStrength;

        vec3 output_ = (1.0 - F) * scatter + specular + F * envReflection;
        output_ = max(vec3(0.0), output_);

        vec2 fdir = normalize(uWindDir);
        vec2 fperp = vec2(-fdir.y, fdir.x);
        vec2 fuv = vec2(dot(vFlatXZ, fperp) * 0.05, dot(vFlatXZ, fdir) * 0.011);
        float n1 = texture2D(uFoamTex, fuv + fdir * uTime * 0.022).r;
        float n2 = texture2D(uFoamTex, fuv * 1.65 - fdir * uTime * 0.035).g;
        float foamNoise = n1 * 0.58 + n2 * 0.42;
        float windAlign = pow(abs(dot(normalize(slope + vec2(0.001)), fdir)), 1.6);
        float streaks = mix(0.35, 1.0, windAlign) * mix(0.4, 1.0, foamNoise);
        float breaking = jacTip * mix(0.08, 1.0, crest) * uFoamAmount;
        float foamMask = smoothstep(0.48, 0.88, breaking) * streaks;
        vec3 foamCol = mix(uFoamColor * 0.48, uFoamColor, foamMask);
        float foamW = foamMask * 0.66;

        vec2 wuv = (vWorldPos.xz - uWakeCenter) / uWakeWorldSize + 0.5;
        if (wuv.x > 0.0 && wuv.x < 1.0 && wuv.y > 0.0 && wuv.y < 1.0) {
          float wake = texture2D(uWakeTex, wuv).r * (0.32 + 0.68 * foamNoise);
          foamW = max(foamW, smoothstep(0.14, 0.56, wake) * 0.58);
        }
        output_ = mix(output_, foamCol, sat(foamW) * 0.74 * detailFade);

        float fog = smoothstep(uFogNear, uFogFar, fftDist);
        vec3 farCol = mix(uHorizonWater, uFogColor, sat((fftDist - uFogFar * 0.55) / max(1.0, uFogFar * 0.45)));
        vec3 outCol = mix(output_, farCol, fog);
        if (uUnderwater > 0.5) {
          outCol *= vec3(0.45, 0.78, 0.72);
          outCol += vec3(0.04, 0.16, 0.15);
          float subFog = smoothstep(14.0, 210.0, fftDist);
          outCol = mix(outCol, vec3(0.03, 0.13, 0.15), subFog * 0.75);
        }
        gl_FragColor = vec4(outCol, 1.0);
      }`,
    side: THREE.DoubleSide,
  });
}
