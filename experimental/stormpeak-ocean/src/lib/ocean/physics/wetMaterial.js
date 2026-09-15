// @ts-nocheck
/** @ts-nocheck */
import * as THREE from "three";
import { gerstnerGLSL } from "./gerstner.js";

/**
 * PBR metals with sea-reactive caustics. Shared uniforms so every hull / leg /
 * pad samples the same Gerstner as the ocean. Jade caustics (G>B), waterline
 * foam band, beer-darkening below the surface.
 */
export function createWetKit() {
  const shared = {
    uTime: { value: 0 },
    uGerstnerAmp: { value: 4 },
    uWindDir: { value: new THREE.Vector2(-0.9613, -0.2756) },
    uSunDir: { value: new THREE.Vector3(0.4, 0.42, 0.28) },
    uSunIrr: { value: new THREE.Vector3(1.14, 1.06, 0.94) },
    uCamUnder: { value: 0 },
  };

  const CACHE_KEY = "wet-caustic-v3";

  const WET_PARS = /* glsl */ `
    uniform float uTime;
    uniform float uGerstnerAmp;
    uniform vec2 uWindDir;
    uniform vec3 uSunDir;
    uniform vec3 uSunIrr;
    uniform float uCamUnder;
    varying vec3 vWetWorld;
    varying vec3 vWetNormal;
    ${gerstnerGLSL}
  `;

  function patch(shader) {
    shader.uniforms.uTime = shared.uTime;
    shader.uniforms.uGerstnerAmp = shared.uGerstnerAmp;
    shader.uniforms.uWindDir = shared.uWindDir;
    shader.uniforms.uSunDir = shared.uSunDir;
    shader.uniforms.uSunIrr = shared.uSunIrr;
    shader.uniforms.uCamUnder = shared.uCamUnder;

    shader.vertexShader = shader.vertexShader.replace(
      "#include <common>",
      `#include <common>
      varying vec3 vWetWorld;
      varying vec3 vWetNormal;`,
    );
    shader.vertexShader = shader.vertexShader.replace(
      "#include <fog_vertex>",
      `#include <fog_vertex>
      vWetWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
      vWetNormal = normalize(mat3(modelMatrix) * objectNormal);`,
    );

    shader.fragmentShader = shader.fragmentShader.replace("#include <common>", `#include <common>\n${WET_PARS}`);
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <opaque_fragment>",
      /* glsl */ `
      {
        float seaH;
        vec2 slope;
        seaAt(vWetWorld.xz, uTime, uWindDir, uGerstnerAmp, seaH, slope);
        float depth = seaH - vWetWorld.y;
        vec3 nrm = normalize(vWetNormal);
        float under = smoothstep(-0.15, 2.4, depth);
        float deep = smoothstep(1.0, 14.0, depth);
        float wl = exp(-depth * depth * 0.72);
        vec2 cauUv = vWetWorld.xz * 0.085 + slope * 1.65 + uSunDir.xz * depth * 0.05;
        float cau = causticPat(cauUv, uTime * 0.85);
        cau *= causticPat(cauUv.yx * 1.18 + 2.4, -uTime * 0.55);
        float focus = clamp(1.1 - abs(length(slope) - 0.38) * 1.5, 0.15, 1.0);
        vec3 cauCol = vec3(0.22, 0.52, 0.40) * uSunIrr * cau * focus;
        float facing = clamp(dot(nrm, normalize(uSunDir)), 0.0, 1.0);
        outgoingLight *= mix(vec3(1.0), vec3(0.16, 0.32, 0.36), under * mix(0.55, 0.92, deep));
        outgoingLight += cauCol * under * (0.35 + 0.65 * facing) * (1.0 - deep * 0.7);
        outgoingLight = mix(outgoingLight, outgoingLight * vec3(0.55, 0.7, 0.72) + vec3(0.18, 0.24, 0.26), wl * 0.55);
        float aboveWet = (1.0 - under) * smoothstep(4.5, 0.15, -depth);
        outgoingLight += cauCol * 0.18 * aboveWet * facing;
        if (uCamUnder > 0.5) {
          outgoingLight *= vec3(0.42, 0.78, 0.74);
          outgoingLight += cauCol * (0.85 + 0.9 * facing) * (0.45 + 0.55 * under);
          outgoingLight += vec3(0.04, 0.14, 0.14);
        }
      }
      #include <opaque_fragment>
      `,
    );
  }

  function wrap(mat) {
    if (!mat || mat.userData.wet) return mat;
    mat.userData.wet = true;
    const prev = mat.onBeforeCompile;
    mat.onBeforeCompile = (shader, renderer) => {
      if (prev) prev(shader, renderer);
      patch(shader);
    };
    const prevKey = mat.customProgramCacheKey.bind(mat);
    mat.customProgramCacheKey = () => `${prevKey()}|${CACHE_KEY}`;
    mat.needsUpdate = true;
    return mat;
  }

  function make(opts) {
    return wrap(
      new THREE.MeshStandardMaterial({
        color: opts.color ?? 0x2a323c,
        roughness: opts.roughness ?? 0.45,
        metalness: opts.metalness ?? 0.5,
        emissive: opts.emissive ?? 0x000000,
        emissiveIntensity: opts.emissiveIntensity ?? 0,
        flatShading: !!opts.flatShading,
      }),
    );
  }

  function update({ t, swell, windX, windZ, sun, under }) {
    shared.uTime.value = t;
    if (swell != null) shared.uGerstnerAmp.value = swell;
    if (windX != null) shared.uWindDir.value.set(windX, windZ);
    if (sun) shared.uSunDir.value.copy(sun);
    if (under != null) shared.uCamUnder.value = under ? 1 : 0;
  }

  return { wrap, make, update, shared };
}
