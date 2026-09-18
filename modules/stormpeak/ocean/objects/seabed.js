// @ts-nocheck
/** @ts-nocheck */
import * as THREE from "three";
import {
  DEPTH_VIS,
  SHELF_M,
  TRENCH_M,
  BOTTOM_M,
  hash2,
  seabedWorldY,
  seabedMetres,
} from "../world/abyss.js";
import { landLiftGLSL } from "../world/land.js";

const VERT = /* glsl */ `
  varying vec3 vWorld;
  varying float vDepthM;
  varying vec3 vN;
  uniform float uSeaY;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
  }
  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.52;
    for (int i = 0; i < 5; i++) {
      v += a * noise(p);
      p *= 2.11;
      a *= 0.5;
    }
    return v;
  }
  ${landLiftGLSL}
  float seabedM(vec2 xz) {
    vec2 n = xz * 0.0024;
    float trench = clamp(xz.x * 0.00135 - xz.y * 0.00055 + 0.18, 0.0, 1.0);
    trench = trench * trench * (3.0 - 2.0 * trench);
    float h = ${SHELF_M.toFixed(1)};
    h += (fbm(n * 1.4) - 0.5) * 22.0;
    h += sin(n.x * 3.1 + 0.4) * 7.0 + cos(n.y * 2.6) * 6.0;
    h += trench * ${(TRENCH_M - SHELF_M).toFixed(1)};
    h += sin(n.x * 9.2 + n.y * 4.1) * (3.0 + trench * 18.0);
    h -= landLiftM(xz);
    return clamp(h, -36.0, ${BOTTOM_M.toFixed(1)});
  }
  void main() {
    vec3 wp = (modelMatrix * vec4(position, 1.0)).xyz;
    float m = seabedM(wp.xz);
    wp.y = uSeaY - m / ${DEPTH_VIS.toFixed(2)};
    float e = 2.4;
    float hl = seabedM(wp.xz + vec2(-e, 0.0));
    float hr = seabedM(wp.xz + vec2(e, 0.0));
    float hd = seabedM(wp.xz + vec2(0.0, -e));
    float hu = seabedM(wp.xz + vec2(0.0, e));
    vec3 n = normalize(vec3((hl - hr) / ${DEPTH_VIS.toFixed(2)}, 2.0 * e, (hd - hu) / ${DEPTH_VIS.toFixed(2)}));
    vN = n;
    vWorld = wp;
    vDepthM = m;
    gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
  }`;

const FRAG = /* glsl */ `
  precision highp float;
  varying vec3 vWorld;
  varying float vDepthM;
  varying vec3 vN;
  uniform float uTime;
  uniform vec3 uCam;
  uniform vec3 uFogCol;
  uniform float uFogNear;
  uniform float uFogFar;
  uniform vec3 uSun;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float cau(vec2 p, float t) {
    float c = 0.0;
    vec2 q = p;
    c += pow(abs(sin(q.x * 2.8 + t * 0.88) * sin(q.y * 2.35 - t * 0.7)), 6.0);
    q = mat2(0.78, -0.62, 0.62, 0.78) * q + 1.7;
    c += pow(abs(sin(q.x * 4.1 - t * 1.02) * sin(q.y * 3.3 + t * 0.62)), 8.0);
    q = mat2(0.6, 0.8, -0.8, 0.6) * q + 3.1;
    c += pow(abs(sin(q.x * 5.5 + t * 0.5) * sin(q.y * 4.7 - t * 0.84)), 10.0);
    return c * 0.4;
  }
  void main() {
    vec3 n = normalize(vN);
    float grit = hash(floor(vWorld.xz * 0.55));
    float grit2 = hash(floor(vWorld.xz * 2.4));
    float vein = pow(abs(sin(vWorld.x * 0.07 + vWorld.z * 0.045 + grit)), 10.0);
    float life = pow(hash(floor(vWorld.xz * 0.11 + uTime * 0.015)), 12.0);
    float pulse = 0.55 + 0.45 * sin(uTime * 1.6 + vWorld.x * 0.04);
    float trench = smoothstep(140.0, 420.0, vDepthM);
    vec3 silt = mix(vec3(0.16, 0.18, 0.14), vec3(0.07, 0.06, 0.09), trench);
    silt *= 0.72 + 0.28 * grit + 0.12 * grit2;
    vec3 iron = vec3(0.55, 0.16, 0.06) * vein * (0.35 + 0.65 * pulse);
    vec3 bio = vec3(0.08, 0.85, 0.62) * life * pulse;
    vec3 violet = vec3(0.42, 0.12, 0.85) * pow(hash(floor(vWorld.xz * 0.07 - 3.2)), 16.0) * trench;
    float ndl = max(0.16, dot(n, normalize(uSun)));
    float above = clamp(-vDepthM, 0.0, 40.0);
    float beach = 1.0 - smoothstep(0.0, 3.2, abs(vDepthM));
    float dry = smoothstep(0.2, 3.5, above);
    vec3 rock = vec3(0.20, 0.21, 0.18) * (0.75 + 0.25 * grit);
    vec3 sand = vec3(0.44, 0.38, 0.28) * (0.85 + 0.15 * grit2);
    vec3 wet = vec3(0.12, 0.16, 0.14);
    vec3 lichen = vec3(0.08, 0.22, 0.18);
    vec3 col = silt * ndl * 1.35 + iron + bio * 1.1 + violet;
    vec3 land = mix(wet, rock, dry);
    land = mix(land, sand, beach * (1.0 - dry * 0.65));
    land = mix(land, lichen, dry * grit2 * 0.32);
    land *= 0.38 + 0.9 * ndl;
    col = mix(col, land, smoothstep(8.0, 0.4, vDepthM));
    float photic = exp(-max(0.0, vDepthM) / 36.0);
    vec2 cauUv = vWorld.xz * 0.034 + uSun.xz * (max(0.0, vDepthM) * 0.012);
    float c = cau(cauUv, uTime);
    float cauAmt = mix(photic * 0.55, beach * 0.7 + (1.0 - dry) * 0.25, smoothstep(10.0, 0.0, vDepthM));
    col += vec3(0.18, 0.62, 0.48) * c * cauAmt * (0.35 + 0.65 * ndl);
    col += vec3(0.45, 0.85, 0.72) * pow(c, 2.4) * cauAmt * 0.35;
    float dist = length(uCam - vWorld);
    float fogF = smoothstep(uFogNear, uFogFar, dist);
    col = mix(col, uFogCol, fogF);
    gl_FragColor = vec4(col, 1.0);
  }`;

function cell(x, z, s) {
  return [Math.round(x / s) * s, Math.round(z / s) * s];
}

export function createSeabed(scene) {
  const root = new THREE.Group();
  root.name = "AbyssalFloor";
  scene.add(root);

  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uSeaY: { value: 0 },
      uTime: { value: 0 },
      uCam: { value: new THREE.Vector3() },
      uFogCol: { value: new THREE.Color(0x051014) },
      uFogNear: { value: 12 },
      uFogFar: { value: 90 },
      uSun: { value: new THREE.Vector3(0.2, 0.9, 0.2) },
    },
    vertexShader: VERT,
    fragmentShader: FRAG,
    fog: false,
    side: THREE.FrontSide,
  });
  const geo = new THREE.PlaneGeometry(1600, 1600, 140, 140);
  geo.rotateX(-Math.PI / 2);
  const floor = new THREE.Mesh(geo, mat);
  floor.frustumCulled = false;
  floor.renderOrder = 0;
  root.add(floor);

  const ventGeo = new THREE.ConeGeometry(2.2, 11, 6);
  ventGeo.translate(0, 5.5, 0);
  const ventMat = new THREE.MeshStandardMaterial({
    color: 0x1c1612,
    emissive: 0xff3a14,
    emissiveIntensity: 1.15,
    roughness: 0.9,
    metalness: 0.12,
    flatShading: true,
  });
  const VENTS = 36;
  const vents = new THREE.InstancedMesh(ventGeo, ventMat, VENTS);
  vents.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  vents.frustumCulled = false;
  vents.castShadow = false;
  root.add(vents);

  const glowGeo = new THREE.SphereGeometry(1.8, 10, 8);
  const glowMat = new THREE.MeshBasicMaterial({
    color: 0xff5a28,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
    toneMapped: false,
  });
  const glows = new THREE.InstancedMesh(glowGeo, glowMat, VENTS);
  glows.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  glows.frustumCulled = false;
  root.add(glows);

  const plumeGeo = new THREE.CylinderGeometry(0.35, 2.4, 16, 6, 1, true);
  plumeGeo.translate(0, 14, 0);
  const plumeMat = new THREE.MeshBasicMaterial({
    color: 0xff7a40,
    transparent: true,
    opacity: 0.22,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    fog: false,
    toneMapped: false,
  });
  const plumes = new THREE.InstancedMesh(plumeGeo, plumeMat, VENTS);
  plumes.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  plumes.frustumCulled = false;
  root.add(plumes);

  const boneGeo = new THREE.CylinderGeometry(0.28, 0.85, 14, 5);
  boneGeo.translate(0, 7, 0);
  const boneMat = new THREE.MeshStandardMaterial({
    color: 0xd4cbb0,
    emissive: 0x2a2618,
    emissiveIntensity: 0.35,
    roughness: 0.72,
    metalness: 0.04,
    flatShading: true,
  });
  const BONES = 48;
  const bones = new THREE.InstancedMesh(boneGeo, boneMat, BONES);
  bones.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  bones.frustumCulled = false;
  root.add(bones);

  const tendrilVert = /* glsl */ `
    varying vec3 vCol;
    uniform float uTime;
    void main() {
      vec3 p = position;
      float along = max(0.0, p.y);
      float sway = sin(uTime * 0.85 + instanceMatrix[3].x * 0.08 + instanceMatrix[3].z * 0.05);
      p.x += sway * along * 0.09;
      p.z += cos(uTime * 0.62 + along) * along * 0.05;
      vCol = vec3(0.05, 0.55 + 0.35 * sin(uTime * 1.4 + along), 0.42);
      vec4 wp = instanceMatrix * vec4(p, 1.0);
      gl_Position = projectionMatrix * viewMatrix * wp;
    }`;
  const tendrilFrag = /* glsl */ `
    precision highp float;
    varying vec3 vCol;
    void main() {
      gl_FragColor = vec4(vCol, 1.0);
    }`;
  const tendrilMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: tendrilVert,
    fragmentShader: tendrilFrag,
    fog: false,
    toneMapped: false,
  });
  const tendrilGeo = new THREE.CylinderGeometry(0.08, 0.42, 16, 5);
  tendrilGeo.translate(0, 8, 0);
  const TENDRILS = 28;
  const tendrils = new THREE.InstancedMesh(tendrilGeo, tendrilMat, TENDRILS);
  tendrils.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  tendrils.frustumCulled = false;
  root.add(tendrils);

  const dummy = new THREE.Object3D();

  function place(i, salt, cx, cz, seaY, spread, yLift, lean) {
    const h = hash2(i * 17.3 + salt, i * 5.9);
    const h2 = hash2(i * 3.1, salt);
    const a = h * Math.PI * 2;
    const r = 8 + h2 * spread;
    const x = cx + Math.cos(a) * r;
    const z = cz + Math.sin(a) * r;
    if (seabedMetres(x, z) < 22) {
      dummy.position.set(0, -800, 0);
      dummy.scale.setScalar(0);
      dummy.updateMatrix();
      return dummy.matrix;
    }
    dummy.position.set(x, seabedWorldY(x, z, seaY) + yLift, z);
    dummy.rotation.set(lean * (h - 0.5), h * 6.28, lean * (h2 - 0.5));
    dummy.scale.setScalar(0.85 + h * 1.8);
    dummy.updateMatrix();
    return dummy.matrix;
  }

  function update({ t, seaY, cam, metres, under, fogNear, fogFar, fogCol, sun }) {
    root.visible = true;
    const [sx, sz] = cell(cam.x, cam.z, 28);
    floor.position.set(sx, 0, sz);
    mat.uniforms.uSeaY.value = seaY;
    mat.uniforms.uTime.value = t;
    mat.uniforms.uCam.value.copy(cam);
    mat.uniforms.uFogNear.value = under ? fogNear ?? 14 : 180;
    mat.uniforms.uFogFar.value = under ? fogFar ?? 88 : fogFar ?? 1400;
    if (fogCol) mat.uniforms.uFogCol.value.copy(fogCol);
    if (sun) mat.uniforms.uSun.value.copy(sun);
    const deep = !!under && metres > 38;
    vents.visible = deep;
    glows.visible = deep;
    plumes.visible = deep;
    bones.visible = deep;
    tendrils.visible = deep;
    if (!deep) return;
    const cx = cam.x;
    const cz = cam.z;
    for (let i = 0; i < VENTS; i++) {
      vents.setMatrixAt(i, place(i, 2, cx, cz, seaY, 210, 0, 0.12));
      dummy.position.y += 6.5;
      dummy.scale.setScalar(1.2 + (i % 4) * 0.2);
      dummy.updateMatrix();
      glows.setMatrixAt(i, dummy.matrix);
      dummy.position.y += 4;
      dummy.scale.set(1, 1.15 + Math.sin(t * 1.4 + i) * 0.2, 1);
      dummy.updateMatrix();
      plumes.setMatrixAt(i, dummy.matrix);
    }
    vents.instanceMatrix.needsUpdate = true;
    glows.instanceMatrix.needsUpdate = true;
    plumes.instanceMatrix.needsUpdate = true;
    for (let i = 0; i < BONES; i++) {
      bones.setMatrixAt(i, place(i, 9, cx, cz, seaY, 260, 0.15, 0.45));
    }
    bones.instanceMatrix.needsUpdate = true;
    tendrilMat.uniforms.uTime.value = t;
    for (let i = 0; i < TENDRILS; i++) {
      tendrils.setMatrixAt(i, place(i, 21, cx, cz, seaY, 180, 0.05, 0.08));
    }
    tendrils.instanceMatrix.needsUpdate = true;
    ventMat.emissiveIntensity = 0.85 + 0.45 * (0.5 + 0.5 * Math.sin(t * 1.7));
  }

  function dispose() {
    scene.remove(root);
    geo.dispose();
    mat.dispose();
    ventGeo.dispose();
    ventMat.dispose();
    vents.dispose();
    glowGeo.dispose();
    glowMat.dispose();
    glows.dispose();
    plumeGeo.dispose();
    plumeMat.dispose();
    plumes.dispose();
    boneGeo.dispose();
    boneMat.dispose();
    bones.dispose();
    tendrilGeo.dispose();
    tendrilMat.dispose();
    tendrils.dispose();
  }

  return { root, update, dispose };
}
