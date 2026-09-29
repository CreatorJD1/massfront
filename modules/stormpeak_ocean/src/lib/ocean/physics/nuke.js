// @ts-nocheck
/** @ts-nocheck */
import * as THREE from "three";

/**
 * Game-VFX nuke (Hovl / cinematic VDB anatomy):
 * flash → fireball → dark smoke stem → fire-lit cauliflower cap →
 * dust ring + shock shell. Water still gets a spray disc at the surface.
 */
const YIELD_KT = 100;
const PUFFS = 20;
const EMBERS = 16;

const volVert = /* glsl */ `
  varying vec3 vLoc;
  void main() {
    vLoc = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;

const HASH = /* glsl */ `
  float hash13(vec3 p) {
    p = fract(p * 0.3183 + vec3(0.11, 0.17, 0.13));
    p += dot(p, p.yzx + 19.19);
    return fract((p.x + p.y) * p.z);
  }
  vec2 hash22(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.xx + p3.yz) * p3.zy);
  }
  float worley2(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    float d = 1.0;
    for (int y = -1; y <= 1; y++) {
      for (int x = -1; x <= 1; x++) {
        vec2 g = vec2(float(x), float(y));
        vec2 o = hash22(i + g);
        vec2 r = g + o - f;
        d = min(d, dot(r, r));
      }
    }
    return 1.0 - clamp(sqrt(d), 0.0, 1.0);
  }
`;

const MARCH = /* glsl */ `
  bool boxHit(vec3 ro, vec3 rd, out float tEnter, out float tExit) {
    vec3 inv = 1.0 / rd;
    vec3 t0 = (vec3(-0.5) - ro) * inv;
    vec3 t1 = (vec3(0.5) - ro) * inv;
    vec3 tmn = min(t0, t1);
    vec3 tmx = max(t0, t1);
    tEnter = max(max(max(tmn.x, tmn.y), tmn.z), 0.0);
    tExit = min(min(tmx.x, tmx.y), tmx.z);
    return tExit > tEnter;
  }
  vec3 fireCol(float h) {
    return mix(vec3(0.55, 0.08, 0.01), vec3(1.0, 0.72, 0.22), h);
  }
`;

const colFrag = /* glsl */ `
  precision mediump float;
  uniform float uAmt, uLand, uTime, uHot;
  uniform vec3 uCamLoc;
  varying vec3 vLoc;
  ${HASH}
  ${MARCH}
  float dens(vec3 p) {
    vec3 q = p * 0.5 + 0.5;
    float cell = worley2(q.xz * 5.4 + vec2(q.y * 3.2 + uTime * 0.14));
    float cell2 = worley2(q.xz * 11.0 - vec2(uTime * 0.09, q.y * 2.4));
    float rad = length(q.xz - 0.5);
    float colR = 0.22 + cell * 0.12 + cell2 * 0.04;
    float col = 1.0 - smoothstep(colR * 0.35, colR, rad);
    col *= smoothstep(0.0, 0.06, q.y) * (1.0 - smoothstep(0.62, 0.92, q.y));
    col *= 0.35 + 0.75 * cell;
    float swirl = 0.65 + 0.35 * sin(q.y * 18.0 + cell * 5.0);
    return max(0.0, col * swirl);
  }
  float heat(vec3 p) {
    vec3 q = p * 0.5 + 0.5;
    float rad = length(q.xz - 0.5);
    float core = 1.0 - smoothstep(0.04, 0.18, rad);
    core *= 1.0 - smoothstep(0.35, 0.75, q.y);
    return core * uHot;
  }
  void main() {
    vec3 rd = normalize(vLoc - uCamLoc);
    float tEnter, tExit;
    if (!boxHit(uCamLoc, rd, tEnter, tExit)) discard;
    float dt = (tExit - tEnter) / 8.0;
    vec3 pos = uCamLoc + rd * (tEnter + dt * 0.3);
    float T = 1.0;
    vec3 acc = vec3(0.0);
    vec3 smoke = mix(vec3(0.22, 0.24, 0.26), vec3(0.09, 0.08, 0.07), 0.45 + 0.55 * uLand);
    for (int i = 0; i < 8; i++) {
      float d = dens(pos) * uAmt;
      if (d > 0.03) {
        float absorb = 1.0 - exp(-d * dt * 11.0);
        float h = heat(pos);
        vec3 L = mix(smoke, fireCol(h), clamp(h * 1.4, 0.0, 1.0));
        L += fireCol(1.0) * h * h * 0.9;
        acc += L * absorb * T;
        T *= exp(-d * dt * 8.0);
        if (T < 0.05) break;
      }
      pos += rd * dt;
    }
    float a = (1.0 - T) * uAmt;
    if (a < 0.025) discard;
    gl_FragColor = vec4(acc / max(a, 0.12), a);
  }`;

const anvFrag = /* glsl */ `
  precision mediump float;
  uniform float uAmt, uLand, uTime, uHot;
  uniform vec3 uCamLoc;
  varying vec3 vLoc;
  ${HASH}
  ${MARCH}
  float dens(vec3 p) {
    vec3 q = p * 0.5 + 0.5;
    float cell = worley2(q.xz * 4.2 + uTime * 0.06);
    float cell2 = worley2(q.xz * 8.5 - uTime * 0.04);
    vec3 c = q - vec3(0.5, 0.42, 0.5);
    c.x += (cell - 0.5) * 0.12;
    c.z += (cell2 - 0.5) * 0.12;
    float r = length(c.xz);
    float h = abs(c.y);
    float slab = (1.0 - smoothstep(0.10, 0.38, h)) * (1.0 - smoothstep(0.18, 0.48, r));
    slab += 0.45 * max(0.0, 0.22 - length(c - vec3(0.16, 0.05, 0.04)));
    slab += 0.40 * max(0.0, 0.20 - length(c - vec3(-0.14, 0.03, 0.12)));
    slab += 0.35 * max(0.0, 0.18 - length(c - vec3(0.04, 0.08, -0.15)));
    slab *= 0.45 + 0.7 * cell;
    return max(0.0, slab);
  }
  float heat(vec3 p) {
    vec3 q = p * 0.5 + 0.5;
    float r = length(q.xz - 0.5);
    float core = (1.0 - smoothstep(0.05, 0.28, r)) * (1.0 - abs(q.y - 0.38) * 4.0);
    return max(0.0, core) * uHot;
  }
  void main() {
    vec3 rd = normalize(vLoc - uCamLoc);
    float tEnter, tExit;
    if (!boxHit(uCamLoc, rd, tEnter, tExit)) discard;
    float dt = (tExit - tEnter) / 8.0;
    vec3 pos = uCamLoc + rd * (tEnter + dt * 0.3);
    float T = 1.0;
    vec3 acc = vec3(0.0);
    vec3 smoke = mix(vec3(0.18, 0.19, 0.21), vec3(0.07, 0.06, 0.05), 0.3 + 0.7 * uLand);
    for (int i = 0; i < 8; i++) {
      float d = dens(pos) * uAmt;
      if (d > 0.03) {
        float absorb = 1.0 - exp(-d * dt * 10.0);
        float h = heat(pos);
        vec3 L = mix(smoke, fireCol(h), clamp(h * 1.6, 0.0, 1.0));
        L += fireCol(1.0) * h * h;
        acc += L * absorb * T;
        T *= exp(-d * dt * 7.2);
        if (T < 0.05) break;
      }
      pos += rd * dt;
    }
    float a = (1.0 - T) * uAmt;
    if (a < 0.03) discard;
    gl_FragColor = vec4(acc / max(a, 0.12), a);
  }`;

const discVert = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;

const discFrag = /* glsl */ `
  precision mediump float;
  uniform float uAmt, uTime, uLand;
  varying vec2 vUv;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p);
    float n = hash(floor(p * 16.0 + uTime));
    float ring = smoothstep(0.12, 0.32, r) * (1.0 - smoothstep(0.72, 1.0, r));
    ring *= 0.5 + 0.5 * n;
    vec3 dust = mix(vec3(0.35, 0.32, 0.28), vec3(0.22, 0.16, 0.10), uLand);
    vec3 spray = vec3(0.85, 0.90, 0.94);
    vec3 col = mix(spray, dust, 0.35 + 0.65 * uLand);
    float a = ring * uAmt;
    if (a < 0.02) discard;
    gl_FragColor = vec4(col, a);
  }`;

const puffFrag = /* glsl */ `
  precision mediump float;
  uniform float uAmt, uLand, uHot;
  varying vec2 vUv;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float n2(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p);
    float n = n2(p * 3.2) * 0.6 + n2(p * 7.0) * 0.4;
    float mask = (1.0 - smoothstep(0.15, 1.0, r)) * (0.35 + 0.75 * n);
    if (mask < 0.04) discard;
    vec3 smoke = mix(vec3(0.28, 0.29, 0.30), vec3(0.12, 0.10, 0.08), uLand);
    vec3 fire = vec3(1.0, 0.42, 0.08);
    vec3 col = mix(smoke, fire, uHot * (1.0 - r) * 0.55);
    gl_FragColor = vec4(col, mask * uAmt);
  }`;

const emberFrag = /* glsl */ `
  precision mediump float;
  uniform float uAmt;
  varying vec2 vUv;
  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p);
    float a = (1.0 - smoothstep(0.0, 1.0, r));
    a *= a * uAmt;
    vec3 col = mix(vec3(1.0, 0.85, 0.35), vec3(1.0, 0.25, 0.02), r);
    gl_FragColor = vec4(col, a);
  }`;

const shockFrag = /* glsl */ `
  precision mediump float;
  uniform float uAmt;
  varying vec2 vUv;
  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p);
    float rim = smoothstep(0.82, 0.92, r) * (1.0 - smoothstep(0.92, 1.0, r));
    gl_FragColor = vec4(vec3(0.85, 0.9, 1.0), rim * uAmt);
  }`;

function volMat(frag) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    fog: false,
    toneMapped: false,
    side: THREE.BackSide,
    uniforms: {
      uAmt: { value: 1 },
      uLand: { value: 0 },
      uTime: { value: 0 },
      uHot: { value: 1 },
      uCamLoc: { value: new THREE.Vector3() },
    },
    vertexShader: volVert,
    fragmentShader: frag,
  });
}

export function createNukeFx(scene) {
  const root = new THREE.Group();
  root.name = "NukeFx";
  root.visible = false;
  scene.add(root);

  const columnMat = volMat(colFrag);
  const column = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), columnMat);
  column.frustumCulled = false;
  column.renderOrder = 13;
  root.add(column);

  const anvilMat = volMat(anvFrag);
  const anvil = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), anvilMat);
  anvil.frustumCulled = false;
  anvil.renderOrder = 14;
  root.add(anvil);

  const discMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    fog: false,
    toneMapped: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: { uAmt: { value: 1 }, uTime: { value: 0 }, uLand: { value: 0 } },
    vertexShader: discVert,
    fragmentShader: discFrag,
  });
  const disc = new THREE.Mesh(new THREE.CircleGeometry(1, 28), discMat);
  disc.rotation.x = -Math.PI / 2;
  disc.frustumCulled = false;
  disc.renderOrder = 11;
  root.add(disc);

  const puffMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    fog: false,
    toneMapped: false,
    side: THREE.DoubleSide,
    uniforms: { uAmt: { value: 1 }, uLand: { value: 0 }, uHot: { value: 1 } },
    vertexShader: discVert,
    fragmentShader: puffFrag,
  });
  const puffs = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), puffMat, PUFFS);
  puffs.frustumCulled = false;
  puffs.renderOrder = 12;
  root.add(puffs);

  const emberMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    fog: false,
    toneMapped: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: { uAmt: { value: 1 } },
    vertexShader: discVert,
    fragmentShader: emberFrag,
  });
  const embers = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), emberMat, EMBERS);
  embers.frustumCulled = false;
  embers.renderOrder = 15;
  root.add(embers);

  const shockMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    fog: false,
    toneMapped: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: { uAmt: { value: 0.4 } },
    vertexShader: discVert,
    fragmentShader: shockFrag,
  });
  const shock = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12), shockMat);
  shock.frustumCulled = false;
  shock.renderOrder = 10;
  root.add(shock);

  const fireMat = new THREE.MeshBasicMaterial({
    color: 0xff9a28,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
    toneMapped: false,
  });
  const fireball = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), fireMat);
  fireball.renderOrder = 16;
  root.add(fireball);

  const dummy = new THREE.Object3D();
  const camLoc = new THREE.Vector3();

  let live = false;
  let t0 = -99;
  let x = 0;
  let z = 0;
  let lastMach = 0;
  let lastTsunami = 0;
  let boomed = false;
  let surface = "water";

  function machRadius(age) {
    return 22 + 70 * age * Math.exp(-age / 2.8) + 32 * age;
  }
  function tsunamiRadius(age) {
    if (age < 1.8) return 0;
    return 24 + (age - 1.8) * 30;
  }
  function fireRadius(age) {
    const grow = 1 - Math.exp(-age / 0.55);
    const hold = Math.exp(-Math.max(0, age - 2.4) / 2.2);
    return 8 + 42 * grow * hold;
  }

  function warm() {
    root.visible = true;
    root.scale.setScalar(0.001);
  }
  function rest() {
    live = false;
    root.visible = false;
    root.scale.setScalar(1);
    column.visible = false;
    anvil.visible = false;
    puffs.visible = false;
    embers.visible = false;
    disc.visible = false;
    fireball.visible = false;
    shock.visible = false;
  }

  function setLand(v) {
    columnMat.uniforms.uLand.value = v;
    anvilMat.uniforms.uLand.value = v;
    puffMat.uniforms.uLand.value = v;
    discMat.uniforms.uLand.value = v;
  }

  function ignite(nx, nz, _p, surf) {
    live = true;
    t0 = -1;
    x = nx;
    z = nz;
    lastMach = 0;
    lastTsunami = 0;
    boomed = false;
    surface = surf === "land" ? "land" : "water";
    setLand(surface === "land" ? 1 : 0);
    fireMat.color.setHex(0xff9a28);
    root.scale.setScalar(1);
    root.visible = true;
  }

  function pushCam(mesh, mat, cam) {
    mesh.updateMatrixWorld(true);
    if (!cam) return;
    camLoc.set(cam.x, cam.y, cam.z);
    mesh.worldToLocal(camLoc);
    mat.uniforms.uCamLoc.value.copy(camLoc);
  }

  function update(now, seaY, cam) {
    const dead = {
      live: false, flash: 0, trauma: 0, exposure: 0, fireR: 0, machR: 0, machR0: 0,
      tsunamiR: 0, tsunamiR0: 0, suction: 0, x, z, power: 4.4, light: 0, glowR: 40,
      sonicBoom: false, age: 0, cloud: 0, stemH: 0, surface,
    };
    if (!live) return dead;
    if (t0 < 0) t0 = now;
    const age = now - t0;
    if (age > 24) {
      rest();
      return dead;
    }
    root.position.set(x, seaY + 0.2, z);
    const land = surface === "land";
    const grow = 1 - Math.exp(-age / 2.6);
    const hot = Math.exp(-age / 5.8);

    const fireR = fireRadius(age);
    fireball.visible = age < 3.6 && fireR > 2;
    fireball.scale.setScalar(Math.max(0.01, fireR));
    fireball.position.y = fireR * 0.45 + 4;
    fireMat.opacity = 0.65 * Math.exp(-age / 1.8);

    const stemH = 46 + 280 * grow;
    const stemW = 42 + 70 * grow;
    column.visible = age > 0.25 && age < 20;
    column.scale.set(stemW, stemH, stemW);
    column.position.y = stemH * 0.5;
    columnMat.uniforms.uAmt.value = 1.05 * (1 - Math.max(0, age - 14) / 7);
    columnMat.uniforms.uTime.value = now;
    columnMat.uniforms.uHot.value = hot;
    pushCam(column, columnMat, cam);

    const anvilOn = age > 1.8;
    const anvilGrow = anvilOn ? 1 - Math.exp(-(age - 1.8) / 3.8) : 0;
    anvil.visible = anvilOn && age < 22;
    const anvilW = 80 + 220 * anvilGrow;
    const anvilH = 28 + 48 * anvilGrow;
    anvil.scale.set(anvilW, anvilH, anvilW);
    anvil.position.y = stemH * 0.88;
    anvilMat.uniforms.uAmt.value = 1.0 * anvilGrow * (1 - Math.max(0, age - 15) / 8);
    anvilMat.uniforms.uTime.value = now;
    anvilMat.uniforms.uHot.value = hot * 1.15;
    pushCam(anvil, anvilMat, cam);

    const discR = 20 + 150 * (1 - Math.exp(-age / 1.1));
    disc.visible = age < 11;
    disc.scale.setScalar(discR);
    disc.position.y = 0.5;
    discMat.uniforms.uAmt.value = (land ? 0.55 : 0.8) * Math.exp(-age / 6.5);
    discMat.uniforms.uTime.value = now;

    shock.visible = age < 6.5;
    shock.scale.setScalar(Math.max(4, machRadius(age) * 0.55));
    shock.position.y = 8;
    shockMat.uniforms.uAmt.value = 0.45 * Math.exp(-age / 2.8);

    puffs.visible = age > 0.4 && age < 16;
    puffMat.uniforms.uAmt.value = 0.75 * (1 - Math.max(0, age - 10) / 6);
    puffMat.uniforms.uHot.value = hot;
    for (let i = 0; i < PUFFS; i++) {
      const a = (i / PUFFS) * Math.PI * 2 + age * 0.08;
      const layer = i % 3;
      const rad = (10 + layer * 16) * (0.4 + grow);
      const rise = layer === 0 ? stemH * 0.25 : layer === 1 ? stemH * 0.62 : stemH * 0.92;
      dummy.position.set(Math.cos(a) * rad, rise, Math.sin(a) * rad);
      dummy.scale.setScalar(14 + layer * 8 + grow * 10);
      dummy.lookAt(cam ? cam.x - x : 0, rise + 10, cam ? cam.z - z : 1);
      dummy.updateMatrix();
      puffs.setMatrixAt(i, dummy.matrix);
    }
    puffs.instanceMatrix.needsUpdate = true;

    embers.visible = age < 7;
    emberMat.uniforms.uAmt.value = 0.9 * Math.exp(-age / 3.2);
    for (let i = 0; i < EMBERS; i++) {
      const a = (i / EMBERS) * Math.PI * 2 + age * 0.4;
      const rad = (6 + (i % 5) * 7) * (0.3 + Math.min(1, age / 1.2));
      const rise = 8 + (i % 4) * 10 + age * 6;
      dummy.position.set(Math.cos(a) * rad, rise, Math.sin(a) * rad);
      dummy.scale.setScalar(4 + (i % 3) * 2);
      dummy.lookAt(cam ? cam.x - x : 0, rise + 4, cam ? cam.z - z : 1);
      dummy.updateMatrix();
      embers.setMatrixAt(i, dummy.matrix);
    }
    embers.instanceMatrix.needsUpdate = true;

    const machR0 = lastMach;
    const machR = machRadius(age);
    lastMach = machR;
    const tsunamiR0 = lastTsunami;
    const tsunamiR = land ? tsunamiRadius(age) * 0.35 : tsunamiRadius(age);
    lastTsunami = tsunamiR;
    const suction = !land && age > 1.4 && age < 6.5 ? Math.sin(((age - 1.4) / 5.1) * Math.PI) : 0;
    const flash = age < 0.4 ? 0.95 * (1 - age / 0.4) : 0;
    let sonicBoom = false;
    if (cam && !boomed) {
      const cd = Math.hypot(cam.x - x, cam.z - z);
      if (machR0 < cd && machR >= cd) {
        sonicBoom = true;
        boomed = true;
      }
    }
    const trauma = (age < 0.9 ? 0.35 * Math.exp(-age / 0.5) : 0.03) + (sonicBoom ? 0.4 : 0);
    const cloud = Math.min(0.85, age / 2.6) * (1 - Math.max(0, age - 14) / 10);

    return {
      live: true, age, x, z, power: 4.4, yieldT: YIELD_KT * 1000,
      fireR: Math.max(18, fireR), machR, machR0, tsunamiR, tsunamiR0, suction,
      flash, trauma, exposure: flash * 0.55, light: Math.exp(-age / 2.5) * 0.45,
      glowR: 28 + discR * 0.5, sonicBoom, cloud, stemH, surface,
    };
  }

  function dispose() {
    scene.remove(root);
    column.geometry.dispose();
    columnMat.dispose();
    anvil.geometry.dispose();
    anvilMat.dispose();
    disc.geometry.dispose();
    discMat.dispose();
    puffs.geometry.dispose();
    puffMat.dispose();
    puffs.dispose();
    embers.geometry.dispose();
    emberMat.dispose();
    embers.dispose();
    shock.geometry.dispose();
    shockMat.dispose();
    fireball.geometry.dispose();
    fireMat.dispose();
  }

  return { ignite, update, dispose, warm, rest, get live() { return live; } };
}
