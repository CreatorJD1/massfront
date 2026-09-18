// @ts-nocheck
/** @ts-nocheck */
import * as THREE from "three";

/**
 * Volumetric cloud decks: subdivided, height-displaced, self-shadowed.
 * Hidden when the command camera looks straight down so the map stays clear.
 */
export function createAtmosphere(scene) {
  const group = new THREE.Group();
  group.name = "Atmosphere";
  scene.add(group);

  function makeMat(layer, thick) {
    return new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      depthTest: true,
      fog: false,
      side: THREE.DoubleSide,
      uniforms: {
        uTime: { value: 0 },
        uWindDir: { value: new THREE.Vector2(-0.96, -0.28) },
        uCloudCover: { value: 0.7 },
        uSunDirection: { value: new THREE.Vector3(0.4, 0.42, 0.28) },
        uSunColor: { value: new THREE.Color(0xc4c0b4) },
        uFlash: { value: 0 },
        uLayer: { value: layer },
        uThick: { value: thick },
      },
      vertexShader: /* glsl */ `
        uniform float uTime, uThick;
        uniform vec2 uWindDir;
        varying vec3 vWorld;
        varying float vN;
        varying vec3 vNrm;
        float hash21(vec2 p) {
          p = fract(p * vec2(127.1, 311.7));
          p += dot(p, p + 34.345);
          return fract(p.x * p.y);
        }
        float vnoise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(
            mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
            mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x),
            f.y
          );
        }
        float fbm(vec2 p) {
          float v = 0.0;
          float a = 0.5;
          for (int i = 0; i < 4; i++) {
            v += a * vnoise(p);
            p = mat2(0.80, -0.60, 0.60, 0.80) * p * 2.05;
            a *= 0.5;
          }
          return v;
        }
        float height(vec2 xz) {
          vec2 p = (xz + uWindDir * uTime * 1.12) * 0.0005;
          float n = fbm(p);
          n = mix(n, n * (1.0 - abs(fbm(p * 1.8) * 2.0 - 1.0)), 0.4);
          return n;
        }
        void main() {
          vec3 p = position;
          vec2 xz = (modelMatrix * vec4(p, 1.0)).xz;
          float n = height(xz);
          p.y += (n - 0.28) * uThick;
          float e = 18.0;
          float hl = height(xz + vec2(-e, 0.0));
          float hr = height(xz + vec2(e, 0.0));
          float hd = height(xz + vec2(0.0, -e));
          float hu = height(xz + vec2(0.0, e));
          vNrm = normalize(vec3(hl - hr, 2.0 * e / max(1.0, uThick), hd - hu));
          vN = n;
          vec4 wp = modelMatrix * vec4(p, 1.0);
          vWorld = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: /* glsl */ `
        precision highp float;
        uniform vec3 uSunDirection, uSunColor;
        uniform float uFlash, uCloudCover, uLayer;
        varying vec3 vWorld;
        varying float vN;
        varying vec3 vNrm;
        void main() {
          float cover = mix(0.58, 0.2, clamp(uCloudCover, 0.0, 1.0));
          float dens = smoothstep(cover, cover + 0.36, vN);
          dens = pow(dens, mix(1.1, 0.8, uCloudCover));
          if (dens < 0.05) discard;
          vec3 sd = normalize(uSunDirection);
          vec3 n = normalize(vNrm);
          float ndl = clamp(dot(n, sd) * 0.5 + 0.5, 0.0, 1.0);
          vec3 base = vec3(0.07, 0.075, 0.09);
          vec3 top = vec3(0.48, 0.5, 0.54);
          vec3 col = mix(base, top, ndl);
          col += uSunColor * ndl * dens * 0.18;
          col += vec3(0.85, 0.9, 1.0) * uFlash * dens;
          float a = dens * mix(0.35, 0.7, uCloudCover) * mix(1.0, 0.72, uLayer * 0.35);
          gl_FragColor = vec4(col, a);
        }`,
    });
  }

  function makeSheet(y, size, layer, thick, segs) {
    const mat = makeMat(layer, thick);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size, segs, segs), mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = y;
    mesh.frustumCulled = false;
    mesh.renderOrder = -90 + layer;
    group.add(mesh);
    return mesh;
  }

  const high = makeSheet(290, 6400, 0, 48, 32);
  const mid = makeSheet(168, 4200, 1, 36, 28);
  const low = makeSheet(92, 2800, 2, 28, 24);
  const sheets = [high, mid, low];

  function update({ t, cam, cover, wind, sun, flash, lookDown }) {
    const cell = 160;
    const sx = Math.round(cam.x / cell) * cell;
    const sz = Math.round(cam.z / cell) * cell;
    for (let i = 0; i < sheets.length; i++) {
      const s = sheets[i];
      const u = s.material.uniforms;
      u.uTime.value = t;
      u.uCloudCover.value = cover;
      if (wind) u.uWindDir.value.set(wind.x, wind.z ?? wind.y);
      if (sun) u.uSunDirection.value.copy(sun);
      u.uFlash.value = flash || 0;
      s.position.x = sx;
      s.position.z = sz;
    }
    high.visible = false;
    mid.visible = false;
    low.visible = false;
    group.visible = false;
  }

  function dispose() {
    scene.remove(group);
    sheets.forEach((s) => {
      s.geometry.dispose();
      s.material.dispose();
    });
  }

  return { group, update, dispose, uniforms: high.material.uniforms };
}
