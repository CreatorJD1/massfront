// @ts-nocheck
/** @ts-nocheck */
import * as THREE from "three";
import { underPalette } from "../world/abyss.js";

/**
 * Water column. Veil fills empty space only (depth-tested) so the wave
 * ceiling, hulls and snow stay sharp. Shafts are additive light, not cones.
 */
export function createUnderwaterFx(scene, camera) {
  const root = new THREE.Group();
  root.name = "UnderwaterFx";
  root.visible = false;
  scene.add(root);

  const veilMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    fog: false,
    toneMapped: false,
    blending: THREE.NormalBlending,
    uniforms: {
      uSun: { value: new THREE.Vector3(0.4, 0.42, 0.28) },
      uTime: { value: 0 },
      uDepth: { value: 20 },
      uCol: { value: new THREE.Color(0x0a3a3c) },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      precision highp float;
      uniform vec3 uSun;
      uniform float uTime;
      uniform float uDepth;
      uniform vec3 uCol;
      varying vec3 vDir;
      float sat(float x) { return clamp(x, 0.0, 1.0); }
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      void main() {
        vec3 dir = normalize(vDir);
        vec3 sun = normalize(uSun);
        float up = sat(dir.y);
        float down = sat(-dir.y);
        float deep = sat(uDepth / 70.0);
        float hadal = sat((uDepth - 140.0) / 220.0);

        vec3 shallow = vec3(0.10, 0.34, 0.32);
        vec3 mid = uCol;
        vec3 abyss = mix(uCol * 0.45, vec3(0.02, 0.01, 0.06), hadal);
        vec3 col = mix(mid, shallow, pow(up, 1.15) * (1.0 - deep * 0.65));
        col = mix(col, abyss, down * (0.35 + 0.65 * deep));

        float win = pow(up, 2.6) * (1.0 - deep * 0.7);
        col = mix(col, vec3(0.28, 0.62, 0.54), win * 0.72);
        col += vec3(0.45, 0.85, 0.72) * pow(up, 7.0) * 0.55 * (1.0 - deep);

        vec3 p = dir - sun * dot(dir, sun);
        float ang = atan(p.x, p.z);
        float shafts = 0.0;
        shafts += pow(abs(sin(ang * 5.5 + uTime * 0.09)), 8.0);
        shafts += pow(abs(sin(ang * 9.5 - uTime * 0.06 + 1.2)), 14.0) * 0.7;
        shafts += pow(abs(sin(ang * 2.8 + uTime * 0.03)), 5.0) * 0.45;
        float along = pow(sat(dot(dir, sun)), 2.4);
        float rayAmt = shafts * along * mix(0.35, 1.0, up) * (1.0 - deep * 0.7) * (1.0 - hadal);
        col += vec3(0.55, 0.95, 0.75) * rayAmt * 0.95;

        float mote = hash(floor(dir.xy * mix(28.0, 70.0, deep) + uTime * vec2(0.12, -0.35)));
        mote = smoothstep(0.90, 0.996, mote) * sat(0.82 - abs(dir.y) * 0.5);
        col += vec3(0.6, 0.8, 0.75) * mote * mix(0.18, 0.5, deep);

        float bio = hash(floor(dir.xz * 14.0 + floor(uTime * 0.28)));
        bio = smoothstep(0.965, 0.995, bio) * (0.25 + 0.75 * hadal);
        col += mix(vec3(0.05, 0.55, 0.42), vec3(0.4, 0.1, 0.75), hadal) * bio * 0.85;

        float a = mix(0.16, 0.38, deep) + down * mix(0.04, 0.12, deep);
        a *= 0.92;
        gl_FragColor = vec4(col, a);
      }`,
  });
  const veil = new THREE.Mesh(new THREE.SphereGeometry(110, 28, 20), veilMat);
  veil.frustumCulled = false;
  veil.renderOrder = 1;
  root.add(veil);

  const cauVert = /* glsl */ `
    varying vec2 vUv;
    varying vec3 vWorld;
    void main() {
      vUv = uv;
      vec4 wp = modelMatrix * vec4(position, 1.0);
      vWorld = wp.xyz;
      gl_Position = projectionMatrix * viewMatrix * wp;
    }`;
  const cauFrag = /* glsl */ `
    precision highp float;
    uniform float uTime;
    uniform float uAmt;
    varying vec2 vUv;
    varying vec3 vWorld;
    float sat(float x) { return clamp(x, 0.0, 1.0); }
    float cau(vec2 p, float t) {
      float c = 0.0;
      vec2 q = p;
      c += pow(abs(sin(q.x * 2.6 + t * 0.85) * sin(q.y * 2.2 - t * 0.7)), 5.0);
      q = mat2(0.78, -0.62, 0.62, 0.78) * q + 1.7;
      c += pow(abs(sin(q.x * 3.8 - t * 1.05) * sin(q.y * 3.1 + t * 0.62)), 7.0);
      q = mat2(0.91, 0.41, -0.41, 0.91) * p * 1.55 + vec2(t * 0.06, -t * 0.04);
      c += pow(abs(sin(q.x * 1.9 + t * 0.38) * sin(q.y * 1.55 - t * 0.3)), 4.0) * 0.65;
      return c * 0.5;
    }
    void main() {
      float r = length(vUv - 0.5);
      float edge = 1.0 - smoothstep(0.28, 0.5, r);
      float c = cau(vWorld.xz * 0.038, uTime);
      vec3 col = vec3(0.18, 0.62, 0.48) * c;
      gl_FragColor = vec4(col, c * edge * uAmt);
    }`;

  function makeSheet(size, amt) {
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      depthTest: true,
      fog: false,
      toneMapped: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      uniforms: { uTime: { value: 0 }, uAmt: { value: amt } },
      vertexShader: cauVert,
      fragmentShader: cauFrag,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.frustumCulled = false;
    mesh.renderOrder = 2;
    root.add(mesh);
    return mesh;
  }
  const sheets = [];

  const rayGeo = new THREE.CylinderGeometry(2.4, 18, 1, 10, 1, true);
  rayGeo.translate(0, -0.5, 0);
  const rayMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    fog: false,
    toneMapped: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: { uTime: { value: 0 }, uAmt: { value: 1 } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      precision highp float;
      uniform float uTime;
      uniform float uAmt;
      varying vec2 vUv;
      void main() {
        float along = vUv.y;
        float ang = vUv.x;
        float core = pow(1.0 - abs(ang - 0.5) * 2.0, 2.2);
        float dust = 0.5 + 0.5 * sin(along * 14.0 - uTime * 0.7 + ang * 6.0);
        float fade = (1.0 - along) * smoothstep(0.0, 0.12, along);
        float a = core * fade * dust * 0.22 * uAmt;
        gl_FragColor = vec4(vec3(0.48, 0.92, 0.72), a);
      }`,
  });
  const rays = [];
  for (let i = 0; i < 4; i++) {
    const m = new THREE.Mesh(rayGeo, rayMat);
    m.frustumCulled = false;
    m.renderOrder = 3;
    root.add(m);
    rays.push(m);
  }

  const snowGeo = new THREE.PlaneGeometry(0.22, 0.22);
  const snowMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    fog: true,
    toneMapped: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: { uAmt: { value: 1 } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      precision highp float;
      uniform float uAmt;
      varying vec2 vUv;
      void main() {
        float r = length(vUv - 0.5);
        float a = (1.0 - smoothstep(0.12, 0.5, r)) * 0.55 * uAmt;
        gl_FragColor = vec4(vec3(0.72, 0.9, 0.86), a);
      }`,
  });
  const SNOW = 48;
  const snow = new THREE.InstancedMesh(snowGeo, snowMat, SNOW);
  snow.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  snow.frustumCulled = false;
  snow.renderOrder = 6;
  root.add(snow);
  const dummy = new THREE.Object3D();
  const flakes = [];
  for (let i = 0; i < SNOW; i++) {
    flakes.push({
      x: 0,
      y: 0,
      z: 0,
      s: 0.35 + Math.random() * 2.2,
      v: 0.25 + Math.random() * 1.05,
      ph: Math.random() * 6.28,
    });
  }

  let enabled = false;

  function scatter(cx, cy, cz, spread) {
    for (let i = 0; i < SNOW; i++) {
      const b = flakes[i];
      b.x = cx + (Math.random() - 0.5) * spread;
      b.y = cy + (Math.random() - 0.5) * spread * 0.85;
      b.z = cz + (Math.random() - 0.5) * spread;
    }
  }

  function setEnabled(v) {
    if (v && !enabled) scatter(camera.position.x, camera.position.y, camera.position.z, 48);
    enabled = v;
    root.visible = v;
  }

  function update({ t, dt, seaY, sun, dive, metres = 0 }) {
    if (!enabled) return;
    const pal = underPalette(metres);
    const cx = camera.position.x;
    const cy = camera.position.y;
    const cz = camera.position.z;
    veil.position.set(cx, cy, cz);
    veilMat.uniforms.uTime.value = t;
    veilMat.uniforms.uDepth.value = metres;
    veilMat.uniforms.uSun.value.copy(sun);
    veilMat.uniforms.uCol.value.setRGB(pal.rgb[0], pal.rgb[1], pal.rgb[2]);
    rayMat.uniforms.uTime.value = t;
    rayMat.uniforms.uAmt.value = pal.rays;

    const showCau = pal.caustics > 0.05;
    sheets.forEach((s, i) => {
      s.visible = showCau;
      if (!showCau) return;
      s.material.uniforms.uTime.value = t + i * 0.7;
      s.position.set(cx, seaY - (3.5 + i * 9), cz);
      s.material.uniforms.uAmt.value = (0.55 - i * 0.12) * pal.caustics;
    });

    const showRays = pal.rays > 0.05;
    const sunN = sun.clone().normalize();
    const origin = new THREE.Vector3(cx - sunN.x * 4, seaY + 0.8, cz - sunN.z * 4);
    const down = new THREE.Vector3(-sunN.x * 0.45, -1, -sunN.z * 0.45).normalize();
    for (let i = 0; i < rays.length; i++) {
      const m = rays[i];
      m.visible = showRays;
      if (!showRays) continue;
      const a = (i / rays.length) * Math.PI * 2 + t * 0.025;
      const rad = 3.5 + (i % 4) * 6.2;
      m.position.set(origin.x + Math.cos(a) * rad, origin.y, origin.z + Math.sin(a) * rad);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), down);
      const len = 48 + (i % 5) * 16;
      const fat = 1.6 + (i % 3) * 0.7;
      m.scale.set(fat, len * Math.max(0.4, pal.rays), fat);
    }

    snowMat.uniforms.uAmt.value = 0.45 + pal.snow * 0.7;
    const spread = 32 + pal.snow * 18;
    for (let i = 0; i < SNOW; i++) {
      const b = flakes[i];
      b.y -= b.v * dt * (0.5 + pal.snow);
      b.x += Math.sin(t * 0.65 + b.ph) * dt * 0.85;
      if (b.y < cy - 20 || Math.hypot(b.x - cx, b.z - cz) > spread * 0.72) {
        b.x = cx + (Math.random() - 0.5) * spread;
        b.y = cy + 8 + Math.random() * 18;
        b.z = cz + (Math.random() - 0.5) * spread;
      }
      dummy.position.set(b.x, b.y, b.z);
      dummy.quaternion.copy(camera.quaternion);
      dummy.scale.setScalar(b.s * (0.55 + pal.snow * 0.5));
      dummy.updateMatrix();
      snow.setMatrixAt(i, dummy.matrix);
    }
    snow.instanceMatrix.needsUpdate = true;
  }

  function dispose() {
    scene.remove(root);
    veil.geometry.dispose();
    veilMat.dispose();
    sheets.forEach((s) => {
      s.geometry.dispose();
      s.material.dispose();
    });
    rayGeo.dispose();
    rayMat.dispose();
    snowGeo.dispose();
    snowMat.dispose();
    snow.dispose();
  }

  return { root, update, setEnabled, dispose };
}
