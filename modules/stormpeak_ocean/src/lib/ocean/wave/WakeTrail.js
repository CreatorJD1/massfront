// @ts-nocheck
/** @ts-nocheck */
import * as THREE from "three";
import { FullscreenPass } from "../core/fullscreenPass.js";

const WAKE_FRAG = /* glsl */ `
  precision highp float;
  uniform sampler2D uPrev;
  uniform vec2 uPrevCenter, uNewCenter;
  uniform vec2 uInjectPos[8];
  uniform float uInjectRadius[8];
  uniform float uStrength[8];
  uniform int uCount;
  uniform float uSize, uWorldSize, uDecay;
  out vec4 outColor;
  void main() {
    vec2 uv = gl_FragCoord.xy / uSize;
    vec2 worldPos = uNewCenter + (uv - 0.5) * uWorldSize;
    vec2 prevUv = (worldPos - uPrevCenter) / uWorldSize + 0.5;
    float prev = 0.0;
    if (prevUv.x > 0.0 && prevUv.x < 1.0 && prevUv.y > 0.0 && prevUv.y < 1.0) {
      prev = texture(uPrev, prevUv).r * uDecay;
    }
    float inj = 0.0;
    for (int i = 0; i < 8; i++) {
      if (i >= uCount) break;
      float d = length(worldPos - uInjectPos[i]);
      inj = max(inj, uStrength[i] * smoothstep(uInjectRadius[i], 0.0, d));
    }
    outColor = vec4(clamp(max(prev, inj), 0.0, 1.0), 0.0, 0.0, 1.0);
  }
`;

export class WakeTrail {
  constructor(renderer, { size = 512, worldSize = 900, decay = 0.992 } = {}) {
    this.renderer = renderer;
    this.size = size;
    this.worldSize = worldSize;
    this.decay = decay;
    const opts = {
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      wrapS: THREE.ClampToEdgeWrapping,
      wrapT: THREE.ClampToEdgeWrapping,
      depthBuffer: false,
    };
    this.rtA = new THREE.WebGLRenderTarget(size, size, opts);
    this.rtB = new THREE.WebGLRenderTarget(size, size, opts);
    this.cur = 0;
    this.center = new THREE.Vector2(0, 0);
    const injectPos = [];
    const injectRadius = [];
    const strength = [];
    for (let i = 0; i < 8; i++) {
      injectPos.push(new THREE.Vector2());
      injectRadius.push(5);
      strength.push(0);
    }
    this.uniforms = {
      uPrev: { value: null },
      uPrevCenter: { value: new THREE.Vector2() },
      uNewCenter: { value: new THREE.Vector2() },
      uInjectPos: { value: injectPos },
      uInjectRadius: { value: injectRadius },
      uStrength: { value: strength },
      uCount: { value: 0 },
      uSize: { value: size },
      uWorldSize: { value: worldSize },
      uDecay: { value: decay },
    };
    this.pass = new FullscreenPass(WAKE_FRAG, this.uniforms);
    this.texture = this.rtA.texture;
  }

  /**
   * @param {number} cx
   * @param {number} cz
   * @param {{x:number,z:number,strength:number,radius:number}[]} points
   */
  updateFleet(cx, cz, points) {
    const prev = this.cur === 0 ? this.rtA : this.rtB;
    const next = this.cur === 0 ? this.rtB : this.rtA;
    const u = this.uniforms;
    u.uPrev.value = prev.texture;
    u.uPrevCenter.value.copy(this.center);
    u.uNewCenter.value.set(cx, cz);
    const n = Math.min(8, points.length);
    u.uCount.value = n;
    for (let i = 0; i < 8; i++) {
      if (i < n) {
        u.uInjectPos.value[i].set(points[i].x, points[i].z);
        u.uStrength.value[i] = points[i].strength;
        u.uInjectRadius.value[i] = points[i].radius;
      } else {
        u.uStrength.value[i] = 0;
      }
    }
    u.uDecay.value = this.decay;
    this.pass.render(this.renderer, next);
    this.center.set(cx, cz);
    this.cur ^= 1;
    this.texture = next.texture;
  }

  dispose() {
    this.rtA.dispose();
    this.rtB.dispose();
    this.pass.material.dispose();
  }
}
