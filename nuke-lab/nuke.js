// @ts-nocheck
/** @ts-nocheck */
import * as THREE from "three";

/**
 * One raymarched mushroom. No point sprites, no discs, no orbs, no beams.
 * Land: dirt stem, hot cap, low ragged dust.
 * Water: white spray column, pale crown, low white base.
 */
const YIELD_KT = 100;

function makeNoise() {
  const s = 128;
  const data = new Uint8Array(s * s * 4);
  const hash = (ix, iy) => {
    const n = Math.sin(ix * 127.1 + iy * 311.7) * 43758.5453123;
    return n - Math.floor(n);
  };
  const worley = (x, y) => {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    let m = 8;
    for (let oy = -1; oy <= 1; oy++) {
      for (let ox = -1; ox <= 1; ox++) {
        const cx = ix + ox;
        const cy = iy + oy;
        const px = cx + hash(cx, cy);
        const py = cy + hash(cx + 13, cy + 7);
        const d = (px - x) * (px - x) + (py - y) * (py - y);
        if (d < m) m = d;
      }
    }
    return Math.min(1, Math.sqrt(m) / 0.9);
  };
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const u = (x / s) * 5;
      const v = (y / s) * 5;
      const i = (y * s + x) * 4;
      data[i] = Math.floor(worley(u, v) * 255);
      data[i + 1] = Math.floor(worley(u * 2.3 + 3.0, v * 2.3 + 1.2) * 255);
      data[i + 2] = 255;
      data[i + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, s, s, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

const volVert = /* glsl */ `
  varying vec3 vPos;
  void main() {
    vPos = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;

const volFrag = /* glsl */ `
  precision mediump float;
  uniform float uAmt, uLand, uTime, uHot, uAge, uMode;
  uniform mat4 uProjView;
  uniform mat4 uModel;
  uniform vec3 uCam;
  uniform sampler2D uNoise;
  varying vec3 vPos;

  float cell(vec3 p) {
    return texture2D(uNoise, p.xz * 2.4 + vec2(0.0, p.y * 0.5 + uTime * 0.02)).r;
  }

  vec3 blackbody(float h) {
    h = clamp(h, 0.0, 1.0);
    vec3 c = mix(vec3(0.45, 0.08, 0.02), vec3(1.0, 0.42, 0.08), smoothstep(0.0, 0.45, h));
    c = mix(c, vec3(1.0, 0.9, 0.7), smoothstep(0.45, 0.8, h));
    c = mix(c, vec3(1.0, 0.98, 0.95), smoothstep(0.8, 1.0, h));
    return c;
  }

  float shape(vec3 p) {
    float y = p.y + 0.5;
    float age = max(uAge, 0.0);
    float n = cell(vec3(p.x + age * 0.05, p.y - age * 0.7, p.z));
    float water = 1.0 - uLand;
    float rise = smoothstep(0.05, 0.9, age);
    float spread = smoothstep(0.2, 4.0, age);
    float fire = 1.0 - smoothstep(0.04, 0.7, age);
    float ang = atan(p.z, p.x);
    float xz = length(p.xz);

    float stemR = mix(0.16, 0.34, water);
    if (uMode > 0.5) stemR = mix(0.32, 0.36, water);
    stemR += sin(ang * 5.0 + y * 8.0 - age * 3.0) * 0.008;
    float stem = 1.0 - smoothstep(stemR * 0.8, stemR, xz);
    float capY = mix(0.32, mix(0.58, 0.62, water), rise);
    stem *= 1.0 - smoothstep(capY, capY + 0.14, y);
    if (uMode < 0.5) stem = 0.0;

    float capW = mix(0.16, mix(0.28, 0.3, water), rise);
    capW *= 1.0 + spread * mix(0.15, 0.05, water);
    float capH = capW * mix(0.62, 0.55, water);
    vec3 c = vec3(p.x, y - capY, p.z);
    float e = length(c / vec3(capW, capH, capW));
    float lobe = sin(ang * 5.0 - age * 1.6 + n * 4.0) * 0.14 * smoothstep(0.25, 0.85, e);
    float cap = 1.0 - smoothstep(0.62, 0.92, e + lobe);
    cap *= smoothstep(0.2, 0.34, y);

    float veilE = length(c / vec3(capW * 1.12, capH * 1.1, capW * 1.12));
    float veil = (1.0 - smoothstep(0.72, 1.0, veilE)) * (1.0 - cap) * 0.4 * rise;

    float fr = mix(0.16, 0.22, water) * (0.65 + 0.35 * fire);
    float ball = 1.0 - smoothstep(fr * 0.5, fr, length(vec2(xz, y - 0.14)));
    ball *= fire;

    float skirtR = mix(0.16, 0.42, spread);
    float skirt = 1.0 - smoothstep(skirtR * 0.4, skirtR, xz);
    skirt *= 1.0 - smoothstep(0.02, mix(0.12, 0.07, water), y);
    skirt *= smoothstep(0.15, 0.6, age);
    if (uMode > 0.5) skirt = 0.0;

    float d = max(max(max(stem, cap), veil), max(ball, skirt));
    float side = length(p.xz);
    d *= 1.0 - smoothstep(0.40, 0.48, side);
    d *= 1.0 - smoothstep(0.30, 0.46, p.y);
    return clamp(d, 0.0, 1.0);
  }

  void main() {
    vec3 rd = normalize(vPos - uCam);
    vec3 ro = uCam;
    vec3 inv = sign(rd) / max(abs(rd), vec3(0.0001));
    vec3 t0 = (vec3(-0.5) - ro) * inv;
    vec3 t1 = (vec3(0.5) - ro) * inv;
    float tEnter = max(max(max(min(t0.x, t1.x), min(t0.y, t1.y)), min(t0.z, t1.z)), 0.0);
    float tExit = min(min(max(t0.x, t1.x), max(t0.y, t1.y)), max(t0.z, t1.z));
    if (tExit <= tEnter) discard;
    const int STEPS = 14;
    float dt = (tExit - tEnter) / float(STEPS);
    float jitter = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
    vec3 pos = ro + rd * (tEnter + dt * jitter);
    float tCur = tEnter + dt * jitter;
    float tHit = -1.0;
    float T = 1.0;
    vec3 acc = vec3(0.0);
    for (int i = 0; i < 14; i++) {
      float d = shape(pos) * uAmt;
      if (d > 0.02) {
        if (tHit < 0.0) tHit = tCur;
        float y = pos.y + 0.5;
        float fire = 1.0 - smoothstep(0.05, 1.1, uAge);
        vec3 L;
        if (uLand > 0.5) {
          float inCap = smoothstep(0.42, 0.62, y);
          float core = 1.0 - smoothstep(0.0, 0.09 + 0.03 * sin(uAge * 8.0), length(pos.xz));
          float shell = smoothstep(0.1, 0.26, length(pos.xz));
          L = mix(vec3(0.32, 0.18, 0.1), vec3(0.55, 0.38, 0.2), 1.0 - smoothstep(0.0, 0.16, y));
          L = mix(L, vec3(1.0, 0.38, 0.06), inCap * (1.0 - fire));
          L = mix(L, vec3(0.42, 0.26, 0.14), shell * (1.0 - fire) * inCap);
          L = mix(L, vec3(1.0, 0.95, 0.82), clamp(core * inCap, 0.0, 1.0));
          L = mix(L, L * (0.45 + 0.55 * cell(vec3(pos.x, pos.y - uAge * 1.3, pos.z))), 1.0 - inCap);
          L = mix(L, vec3(1.0, 0.97, 0.9), fire);
        } else {
          L = vec3(0.9, 0.95, 0.98);
          L = mix(L, vec3(1.0), 1.0 - smoothstep(0.0, 0.12, y));
          L = mix(L, vec3(1.0), fire);
        }
        float absorb = 1.0 - exp(-d * dt * 40.0);
        acc += L * absorb * T;
        T *= exp(-d * dt * 22.0);
        if (T < 0.03) break;
      }
      pos += rd * dt;
      tCur += dt;
    }
    float a = (1.0 - T) * uAmt;
    if (a < 0.04 || tHit < 0.0) discard;
    vec4 clipP = uProjView * uModel * vec4(ro + rd * tHit, 1.0);
    gl_FragDepthEXT = clipP.z / clipP.w * 0.5 + 0.5;
    gl_FragColor = vec4(acc / max(a, 0.08), a);
  }`;

export function createNukeFx(scene) {
  const noise = makeNoise();
  const root = new THREE.Group();
  root.name = "NukeFx";
  root.visible = false;
  scene.add(root);

  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    fog: false,
    toneMapped: false,
    side: THREE.BackSide,
    extensions: { fragDepth: true },
    uniforms: {
      uAmt: { value: 1 },
      uLand: { value: 0 },
      uTime: { value: 0 },
      uHot: { value: 1 },
      uAge: { value: 0 },
      uMode: { value: 0 },
      uCam: { value: new THREE.Vector3() },
      uNoise: { value: noise },
    },
    vertexShader: volVert,
    fragmentShader: volFrag,
  });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 12;
  root.add(mesh);

  const stemMat = mat.clone();
  stemMat.uniforms = THREE.UniformsUtils.clone(mat.uniforms);
  stemMat.uniforms.uMode.value = 1;
  stemMat.uniforms.uNoise.value = noise;
  stemMat.extensions = { fragDepth: true };
  const proj = new THREE.Matrix4();
  mat.uniforms.uProjView = { value: new THREE.Matrix4() };
  mat.uniforms.uModel = { value: new THREE.Matrix4() };
  stemMat.uniforms.uProjView = { value: new THREE.Matrix4() };
  stemMat.uniforms.uModel = { value: new THREE.Matrix4() };
  const stemMesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), stemMat);
  stemMesh.frustumCulled = false;
  stemMesh.renderOrder = 11;
  root.add(stemMesh);

  const flashMat = new THREE.ShaderMaterial({
    transparent: true,
    depthTest: false,
    depthWrite: false,
    fog: false,
    toneMapped: false,
    uniforms: { uAmt: { value: 0 }, uLand: { value: 0 } },
    vertexShader: `void main(){ gl_Position = vec4(position.xy, 0.0, 1.0); }`,
    fragmentShader: `
      precision mediump float;
      uniform float uAmt, uLand;
      void main() {
        vec3 col = vec3(1.0);
        gl_FragColor = vec4(col, uAmt);
      }`,
  });
  const flashQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), flashMat);
  flashQuad.frustumCulled = false;
  flashQuad.renderOrder = 80;
  flashQuad.visible = false;
  scene.add(flashQuad);

  const dustMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    fog: false,
    toneMapped: false,
    side: THREE.BackSide,
    extensions: { fragDepth: true },
    uniforms: {
      uAmt: { value: 1 },
      uAge: { value: 0 },
      uTime: { value: 0 },
      uCam: { value: new THREE.Vector3() },
      uNoise: { value: noise },
    },
    vertexShader: volVert,
    fragmentShader: `
      precision mediump float;
      uniform float uAmt, uAge, uTime;
      uniform mat4 uProjView;
      uniform mat4 uModel;
      uniform vec3 uCam;
      uniform sampler2D uNoise;
      varying vec3 vPos;
      float cell(vec3 p) {
        return texture2D(uNoise, p.xz * 1.6 + vec2(uAge * 0.03, p.y)).r;
      }
      void main() {
        vec3 rd = normalize(vPos - uCam);
        vec3 ro = uCam;
        vec3 inv = sign(rd) / max(abs(rd), vec3(0.0001));
        vec3 t0 = (vec3(-0.5) - ro) * inv;
        vec3 t1 = (vec3(0.5) - ro) * inv;
        float tEnter = max(max(max(min(t0.x, t1.x), min(t0.y, t1.y)), min(t0.z, t1.z)), 0.0);
        float tExit = min(min(max(t0.x, t1.x), max(t0.y, t1.y)), max(t0.z, t1.z));
        if (tExit <= tEnter) discard;
        const int STEPS = 8;
        float dt = (tExit - tEnter) / float(STEPS);
        vec3 pos = ro + rd * tEnter;
        float T = 1.0;
        vec3 acc = vec3(0.0);
        for (int i = 0; i < 8; i++) {
          float r = length(pos.xz);
          float ang = atan(pos.z, pos.x);
          float n = cell(pos);
          float roll = sin(ang * 3.0 - uAge * 3.4 + n * 4.0);
          float front = 1.0 - smoothstep(0.04, 0.11, abs(r - 0.4));
          float h = smoothstep(-0.5, -0.25, pos.y) * (1.0 - smoothstep(-0.05, 0.2, pos.y));
          h *= 0.45 + 0.55 * (roll * 0.5 + 0.5);
          float d = front * h * (0.5 + 0.5 * n);
          float lim = max(abs(pos.x), abs(pos.z));
          d *= 1.0 - smoothstep(0.42, 0.49, lim);
          if (d > 0.03) {
            vec3 L = mix(vec3(0.4, 0.26, 0.14), vec3(0.85, 0.68, 0.4), front);
            float a = 1.0 - exp(-d * dt * 18.0);
            acc += L * a * T;
            T *= exp(-d * dt * 10.0);
          }
          pos += rd * dt;
        }
        float a = (1.0 - T) * uAmt;
        if (a < 0.05) discard;
        vec4 clipP = uProjView * uModel * vec4(ro + rd * tEnter, 1.0);
        gl_FragDepthEXT = clipP.z / clipP.w * 0.5 + 0.5;
        gl_FragColor = vec4(acc / max(a, 0.08), a);
      }`,
  });
  const dust = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), dustMat);
  dust.frustumCulled = false;
  dust.renderOrder = 11;
  dust.visible = false;
  dustMat.uniforms.uProjView = { value: new THREE.Matrix4() };
  dustMat.uniforms.uModel = { value: new THREE.Matrix4() };
  root.add(dust);

  const camLoc = new THREE.Vector3();
  const stemLoc = new THREE.Vector3();
  const dustLoc = new THREE.Vector3();
  let live = false;
  let t0 = -99;
  let x = 0;
  let z = 0;
  let lastMach = 0;
  let lastTsunami = 0;
  let boomed = false;
  let surface = "water";
  let hold = -1;

  function machRadius(age) {
    const t = Math.max(0, age);
    return Math.min(260, 30 + 136 * (1 - Math.exp(-t)) + 94 * (1 - Math.exp(-t / 14)));
  }
  function tsunamiRadius(age) {
    const t = Math.max(0, age);
    return Math.min(280, 18 + 132 * (1 - Math.exp(-t / 1.2)) + 130 * (1 - Math.exp(-t / 16)));
  }
  function fireRadius(age) {
    const grow = 1 - Math.exp(-age / 0.7);
    const hold = Math.exp(-Math.max(0, age - 3.0) / 4.0);
    return 12 + 30 * grow * hold;
  }

  function warm() {
    root.visible = true;
    root.scale.setScalar(0.001);
  }
  function rest() {
    live = false;
    root.visible = false;
    mesh.visible = false;
    stemMesh.visible = false;
    flashQuad.visible = false;
    dust.visible = false;
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
    hold = -1;
    mat.uniforms.uLand.value = surface === "land" ? 1 : 0;
    flashMat.uniforms.uLand.value = surface === "land" ? 1 : 0;
    root.scale.setScalar(1);
    root.visible = true;
    mesh.visible = true;
    stemMesh.visible = true;
  }

  function seek(age) {
    hold = age;
    live = true;
    root.visible = true;
    mesh.visible = true;
    stemMesh.visible = true;
  }

  function update(now, seaY, cam) {
    const dead = {
      live: false, flash: 0, trauma: 0, exposure: 0, fireR: 0, machR: 0, machR0: 0,
      tsunamiR: 0, tsunamiR0: 0, suction: 0, x, z, power: 4.4, light: 0, glowR: 40,
      sonicBoom: false, age: 0, cloud: 0, stemH: 0, surface,
    };
    if (!live) return dead;
    let age;
    if (hold >= 0) age = hold;
    else {
      if (t0 < 0) t0 = now;
      age = now - t0;
    }
    if (age > 22) {
      rest();
      return dead;
    }
    const land = surface === "land";
    const rise = 1 - Math.exp(-age / 0.18);
    const late = 1 - Math.exp(-Math.max(0, age) / 9);
    const stemH = land ? 52 + rise * 62 + late * 12 : 56 + rise * 27 + late * 8;
    const width = land ? 93 + rise * 42 + late * 11 : 103 + rise * 25 + late * 9;
    root.position.set(x, seaY, z);
    mesh.scale.set(width, stemH, width);
    mesh.position.y = stemH * 0.5 - 8.0;
    const stemW = land ? Math.max(36, width * 0.34) : Math.max(48, width * 0.62);
    stemMesh.scale.set(stemW, stemH + 24, stemW);
    stemMesh.position.y = (stemH + 24) * 0.5 - 16.0;
    root.updateMatrixWorld(true);
    mat.uniforms.uAmt.value = 1;
    mat.uniforms.uTime.value = now;
    mat.uniforms.uAge.value = age;
    mat.uniforms.uHot.value = land ? Math.max(0.35, Math.exp(-age / 8)) : Math.exp(-age / 0.7);
    stemMat.uniforms.uAmt.value = 1;
    stemMat.uniforms.uTime.value = now;
    stemMat.uniforms.uAge.value = age;
    stemMat.uniforms.uLand.value = mat.uniforms.uLand.value;
    stemMat.uniforms.uHot.value = mat.uniforms.uHot.value;
    const shock = machRadius(age);
    dust.visible = land && age > 0.35;
    dustMat.uniforms.uAge.value = age;
    dustMat.uniforms.uTime.value = now;
    dustMat.uniforms.uAmt.value = land ? Math.min(0.7, age / 1.2) : 0;
    dust.scale.set(shock * 2.2, 14, shock * 2.2);
    dust.position.set(0, 4, 0);
    if (cam) {
      const eye = cam.isCamera ? cam.position : cam;
      mesh.updateMatrixWorld(true);
      camLoc.set(eye.x, eye.y, eye.z);
      mesh.worldToLocal(camLoc);
      mat.uniforms.uCam.value.copy(camLoc);
      stemMesh.updateMatrixWorld(true);
      stemLoc.set(eye.x, eye.y, eye.z);
      stemMesh.worldToLocal(stemLoc);
      stemMat.uniforms.uCam.value.copy(stemLoc);
      proj.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
      mat.uniforms.uProjView.value.copy(proj);
      mat.uniforms.uModel.value.copy(mesh.matrixWorld);
      stemMat.uniforms.uProjView.value.copy(proj);
      stemMat.uniforms.uModel.value.copy(stemMesh.matrixWorld);
      if (dust.visible) {
        dust.updateMatrixWorld(true);
        dustLoc.set(eye.x, eye.y, eye.z);
        dust.worldToLocal(dustLoc);
        dustMat.uniforms.uCam.value.copy(dustLoc);
        dustMat.uniforms.uProjView.value.copy(proj);
        dustMat.uniforms.uModel.value.copy(dust.matrixWorld);
      }
    }

    const fireR = fireRadius(age);
    const machR0 = lastMach;
    const machR = machRadius(age);
    lastMach = machR;
    const tsunamiR0 = lastTsunami;
    const tsunamiR = land ? tsunamiRadius(age) * 0.35 : tsunamiRadius(age);
    lastTsunami = tsunamiR;
    const suction = !land && age > 1.8 && age < 7 ? Math.sin(((age - 1.8) / 5.2) * Math.PI) : 0;
    const flash = age < 0.22 ? 1 : age < 0.7 ? Math.pow(1 - (age - 0.22) / 0.48, 0.6) * 0.75 : 0;
    flashQuad.visible = flash > 0.02;
    flashMat.uniforms.uAmt.value = flash * 0.92;
    let sonicBoom = false;
    if (cam && !boomed) {
      const cd = Math.hypot(cam.x - x, cam.z - z);
      if (machR0 < cd && machR >= cd) {
        sonicBoom = true;
        boomed = true;
      }
    }
    const trauma = (age < 0.5 ? 0.15 * Math.exp(-age / 0.35) : 0) + (sonicBoom ? 0.25 : 0);
    const cloud = Math.min(1, Math.max(0, age - 1.2) / 4);

    return {
      live: true, age, x, z, power: 4.4, yieldT: YIELD_KT * 1000,
      fireR, machR, machR0, tsunamiR, tsunamiR0, suction,
      flash, trauma, exposure: flash * 6.0, light: (land ? 0.9 : 0.4) + flash,
      glowR: width * 0.4, sonicBoom, cloud, stemH, surface,
    };
  }

  function dispose() {
    scene.remove(root);
    mesh.geometry.dispose();
    mat.dispose();
    scene.remove(flashQuad);
    flashQuad.geometry.dispose();
    flashMat.dispose();
    noise.dispose();
  }

  return { ignite, update, dispose, warm, rest, seek, get live() { return live; } };
}
