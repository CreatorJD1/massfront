// @ts-nocheck
/** @ts-nocheck */
import * as THREE from "three";

/**
 * Underwater volume: jade veil, Snell-aligned god rays, stacked caustic
 * sheets, rising motes. Only drawn while the camera is below the sea.
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
    depthTest: false,
    fog: false,
    toneMapped: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uSun: { value: new THREE.Vector3(0.4, 0.42, 0.28) },
      uTime: { value: 0 },
      uDepth: { value: 20 },
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
      varying vec3 vDir;
      float sat(float x) { return clamp(x, 0.0, 1.0); }
      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }
      void main() {
        vec3 dir = normalize(vDir);
        vec3 sun = normalize(uSun);
        float up = sat(dir.y);
        float down = sat(-dir.y);
        float deep = sat(uDepth / 80.0);

        vec3 nearCol = vec3(0.07, 0.28, 0.32);
        vec3 farCol = vec3(0.02, 0.10, 0.14);
        vec3 upCol = vec3(0.18, 0.48, 0.46);
        vec3 col = mix(nearCol, farCol, down * 0.75 + deep * 0.35);
        col = mix(col, upCol, pow(up, 1.4) * (1.0 - deep * 0.45));

        float ray = pow(sat(dot(dir, sun)), 14.0);
        float shaft = pow(sat(dot(dir, sun)), 4.5);
        float flicker = 0.72 + 0.28 * sin(uTime * 1.7 + dir.x * 4.0);
        vec3 sunCol = vec3(0.55, 0.82, 0.62);
        col += sunCol * ray * 0.95 * flicker * (1.0 - deep * 0.4);
        col += sunCol * shaft * 0.22 * (1.0 - down * 0.5);

        float mote = hash(floor(dir.xy * 48.0 + uTime * vec2(0.4, -0.7)));
        mote = smoothstep(0.93, 0.995, mote) * sat(0.55 - abs(dir.y));
        col += vec3(0.45, 0.75, 0.7) * mote * 0.45;

        float a = 0.28 + 0.18 * down + 0.12 * deep;
        a *= 0.92;
        gl_FragColor = vec4(col, a);
      }`,
  });
  const veil = new THREE.Mesh(new THREE.SphereGeometry(22, 24, 16), veilMat);
  veil.frustumCulled = false;
  veil.renderOrder = 8;
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
      c += pow(abs(sin(q.x * 3.1 + t * 0.9) * sin(q.y * 2.6 - t * 0.74)), 6.0);
      q = mat2(0.78, -0.62, 0.62, 0.78) * q + 1.7;
      c += pow(abs(sin(q.x * 4.4 - t * 1.1) * sin(q.y * 3.5 + t * 0.66)), 8.0);
      q = mat2(0.6, 0.8, -0.8, 0.6) * q + 3.1;
      c += pow(abs(sin(q.x * 5.8 + t * 0.55) * sin(q.y * 5.1 - t * 0.88)), 10.0);
      return c * 0.45;
    }
    void main() {
      float r = length(vUv - 0.5);
      float edge = 1.0 - smoothstep(0.32, 0.5, r);
      float c = cau(vWorld.xz * 0.045, uTime);
      vec3 col = vec3(0.18, 0.62, 0.52) * c;
      float a = c * edge * uAmt;
      gl_FragColor = vec4(col, a);
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
    mesh.renderOrder = 3;
    root.add(mesh);
    return mesh;
  }
  const sheets = [makeSheet(220, 0.42), makeSheet(280, 0.28), makeSheet(340, 0.18)];

  const rayGeo = new THREE.CylinderGeometry(0.6, 7.5, 1, 8, 1, true);
  rayGeo.translate(0, -0.5, 0);
  const rayMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    fog: false,
    toneMapped: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: { uTime: { value: 0 } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      precision highp float;
      uniform float uTime;
      varying vec2 vUv;
      void main() {
        float along = vUv.y;
        float ang = vUv.x;
        float stripe = pow(abs(sin(ang * 18.0 + uTime * 0.8 + along * 6.0)), 4.0);
        float core = pow(1.0 - abs(ang - 0.5) * 2.0, 1.6);
        float fade = (1.0 - along) * smoothstep(0.0, 0.12, along);
        float a = (core * 0.45 + stripe * 0.25) * fade * 0.55;
        vec3 col = vec3(0.45, 0.85, 0.7);
        gl_FragColor = vec4(col, a);
      }`,
  });
  const rays = [];
  for (let i = 0; i < 7; i++) {
    const m = new THREE.Mesh(rayGeo, rayMat);
    m.frustumCulled = false;
    m.renderOrder = 4;
    root.add(m);
    rays.push(m);
  }

  const bubbleGeo = new THREE.SphereGeometry(0.18, 6, 5);
  const bubbleMat = new THREE.MeshBasicMaterial({
    color: 0xb8fff4,
    transparent: true,
    opacity: 0.35,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    fog: false,
  });
  const BUB = 72;
  const bubbles = new THREE.InstancedMesh(bubbleGeo, bubbleMat, BUB);
  bubbles.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  bubbles.frustumCulled = false;
  bubbles.renderOrder = 5;
  root.add(bubbles);
  const dummy = new THREE.Object3D();
  const bubbleState = [];
  for (let i = 0; i < BUB; i++) {
    bubbleState.push({
      x: 0,
      y: 0,
      z: 0,
      s: 0.4 + Math.random() * 1.4,
      v: 1.6 + Math.random() * 3.4,
      ph: Math.random() * 6.28,
    });
  }

  let enabled = false;

  function scatterBubbles(cx, cy, cz, spread) {
    for (let i = 0; i < BUB; i++) {
      const b = bubbleState[i];
      b.x = cx + (Math.random() - 0.5) * spread;
      b.y = cy + (Math.random() - 0.4) * spread * 0.7;
      b.z = cz + (Math.random() - 0.5) * spread;
    }
  }

  function setEnabled(v) {
    if (v && !enabled) scatterBubbles(camera.position.x, camera.position.y, camera.position.z, 36);
    enabled = v;
    root.visible = v;
    veil.visible = v;
  }

  function update({ t, dt, seaY, sun, dive }) {
    if (!enabled) return;
    const cx = camera.position.x;
    const cy = camera.position.y;
    const cz = camera.position.z;
    const depth = Math.max(0, seaY - cy);
    veil.position.set(cx, cy, cz);
    veilMat.uniforms.uTime.value = t;
    veilMat.uniforms.uDepth.value = depth;
    veilMat.uniforms.uSun.value.copy(sun);
    rayMat.uniforms.uTime.value = t;

    const sunN = sun.clone().normalize();
    sheets.forEach((s, i) => {
      s.material.uniforms.uTime.value = t + i * 0.7;
      const y = seaY - (8 + i * 16 + Math.min(40, dive * 0.25));
      s.position.set(cx, y, cz);
      const fade = THREE.MathUtils.clamp(1.1 - Math.abs(cy - y) / 70, 0.15, 1);
      s.material.uniforms.uAmt.value = (0.4 - i * 0.08) * fade;
    });

    const origin = new THREE.Vector3(cx - sunN.x * 8, seaY + 2, cz - sunN.z * 8);
    const down = new THREE.Vector3(-sunN.x, -Math.max(0.35, sunN.y), -sunN.z).normalize();
    for (let i = 0; i < rays.length; i++) {
      const m = rays[i];
      const a = (i / rays.length) * Math.PI * 2 + t * 0.05;
      const rad = 6 + (i % 3) * 5;
      m.position.set(
        origin.x + Math.cos(a) * rad,
        origin.y,
        origin.z + Math.sin(a) * rad,
      );
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), down);
      const len = 55 + (i % 4) * 18;
      m.scale.set(0.7 + (i % 3) * 0.35, len, 0.7 + (i % 3) * 0.35);
    }

    for (let i = 0; i < BUB; i++) {
      const b = bubbleState[i];
      b.y += b.v * dt;
      b.x += Math.sin(t * 1.4 + b.ph) * 0.25 * dt * 8;
      if (b.y > seaY - 0.6 || Math.hypot(b.x - cx, b.z - cz) > 48) {
        b.x = cx + (Math.random() - 0.5) * 34;
        b.y = cy - 8 - Math.random() * 22;
        b.z = cz + (Math.random() - 0.5) * 34;
      }
      dummy.position.set(b.x, b.y, b.z);
      dummy.scale.setScalar(b.s);
      dummy.updateMatrix();
      bubbles.setMatrixAt(i, dummy.matrix);
    }
    bubbles.instanceMatrix.needsUpdate = true;
  }

  function dispose() {
    camera.remove(veil);
    camera.remove(veil);
    scene.remove(root);
    veil.geometry.dispose();
    veilMat.dispose();
    sheets.forEach((s) => {
      s.geometry.dispose();
      s.material.dispose();
    });
    rayGeo.dispose();
    rayMat.dispose();
    bubbleGeo.dispose();
    bubbleMat.dispose();
    bubbles.dispose();
  }

  return { root, update, setEnabled, dispose };
}
