// @ts-nocheck
/** @ts-nocheck */
import * as THREE from "three";
import { DEPTH_VIS, seabedWorldY, setNukeCrater } from "../world/abyss.js";
import { createSurfaceMarkUniforms } from "./surfaceMarks.js";

/**
 * The nuke-lab mushroom (CreatorJD1/massfront, stormpeak/ocean, nuke-lab/),
 * ported into the tester. One raymarched mushroom: no point sprites, no discs,
 * no orbs, no beams.
 * Land: dirt stem, hot cap, low ragged dust. (The crater is carved into the
 * shared seabed lift, not drawn here.)
 * Water: white spray column, pale crown, low white base.
 *
 * Visual only. The blast clock (age) and the gameplay radius curves (fireball,
 * shockwave, tsunami, suction) live in massfront/sim.ts (NUKE_TUNING /
 * nukeRadii). update() takes match.nukeState(), so the effect pauses with the
 * match and never drifts from the damage. Every radius that means "damage
 * lands here" (dust front, ground-zero mark, tsunami ring) reads the sim's value;
 * only the mushroom's own shape keeps the lab's look curves.
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



function marchMat(frag, noise, extra) {
  return new THREE.ShaderMaterial({
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
      uProjView: { value: new THREE.Matrix4() },
      uModel: { value: new THREE.Matrix4() },
      ...extra,
    },
    vertexShader: volVert,
    fragmentShader: frag,
  });
}

const DUST_FRAG = /* glsl */ `
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
      }`;

export function createNukeFx(scene) {
  const noise = makeNoise();
  const root = new THREE.Group();
  root.name = "NukeFx";
  root.visible = false;
  scene.add(root);

  /* Cap, fireball and skirt share one box; the stem is its own taller box. */
  const mat = marchMat(volFrag, noise);
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 12;
  root.add(mesh);

  const stemMat = marchMat(volFrag, noise, { uMode: { value: 1 } });
  const stemMesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), stemMat);
  stemMesh.frustumCulled = false;
  stemMesh.renderOrder = 11;
  root.add(stemMesh);

  const dustMat = marchMat(DUST_FRAG, noise);
  const dust = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), dustMat);
  dust.frustumCulled = false;
  dust.renderOrder = 11;
  dust.visible = false;
  root.add(dust);

  const flashMat = new THREE.ShaderMaterial({
    transparent: true,
    depthTest: false,
    depthWrite: false,
    fog: false,
    toneMapped: false,
    uniforms: { uAmt: { value: 0 } },
    vertexShader: `void main(){ gl_Position = vec4(position.xy, 0.0, 1.0); }`,
    fragmentShader: `
      precision mediump float;
      uniform float uAmt;
      void main() { gl_FragColor = vec4(vec3(1.0), uAmt); }`,
  });
  const flashQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), flashMat);
  flashQuad.frustumCulled = false;
  flashQuad.renderOrder = 80;
  flashQuad.visible = false;
  scene.add(flashQuad);

  /* Gameplay-readable layer (ground-zero hazard, tsunami damage front, aim
     ring) plus the spray/dust wash and land scorch. The ocean and terrain
     shaders read these uniforms (surfaceMarks.js) and draw them on the real
     surface, so they follow swells and hills instead of floating as flat
     planes. Sized from the sim's radii so what players see is where damage
     lands. */
  const markUniforms = createSurfaceMarkUniforms();
  const mGz = markUniforms.uMarkGz.value;
  const mGz2 = markUniforms.uMarkGz2.value;
  const mFx = markUniforms.uMarkFx.value;
  const mAim = markUniforms.uMarkAim.value;
  const mCrater = markUniforms.uMarkCrater.value;
  let scorchPeak = 0;
  let scorchEnd = -1;
  /* Land crater: the lab's bowl (7 world units deep, lip 0.36 of that) grows
     on the lab's 18 + 36*age curve, but its rim is the sim's largest
     ground-zero radius rather than the lab's fixed 78, so the bowl marks the
     instant-kill zone the aim ring showed. It fades with the scorch. */
  const CRATER_DEPTH_M = 7 * DEPTH_VIS;
  const crater = { x: 0, z: 0, r: 0, gzMax: 0 };
  function syncCrater() {
    const d = scorchPeak > 0 ? CRATER_DEPTH_M * Math.min(1, mFx.w) : 0;
    mCrater.set(crater.x, crater.z, crater.r, d);
    setNukeCrater(crater.x, crater.z, crater.r, d);
  }
  const wallS = () => performance.now() / 1000;
  function decayScorch() {
    if (scorchEnd < 0) return;
    const k = Math.exp(-(wallS() - scorchEnd) / 9);
    mFx.w = k > 0.01 ? scorchPeak * k : 0;
    if (mFx.w === 0) {
      scorchPeak = 0;
      scorchEnd = -1;
    }
    syncCrater();
  }

  const proj = new THREE.Matrix4();
  const loc = new THREE.Vector3();

  let live = false;
  let blastId = -1;
  let x = 0;
  let z = 0;
  let lastMach = 0;
  let lastAge = -1;
  let boomed = false;
  let surface = "water";

  function warm() {
    /* Compile the march shaders before the first detonation. */
    root.visible = true;
    root.scale.setScalar(0.001);
  }
  function rest() {
    live = false;
    root.visible = false;
    root.scale.setScalar(1);
    mesh.visible = false;
    stemMesh.visible = false;
    dust.visible = false;
    flashQuad.visible = false;
    /* Scorch outlives the blast and fades out instead of popping. */
    if (scorchPeak > 0 && scorchEnd < 0) scorchEnd = wallS();
    mGz2.set(0, 0, 0, 0);
    mFx.x = 0;
    mFx.y = 0;
  }

  function ignite(nx, nz, _p, surf) {
    live = true;
    x = nx;
    z = nz;
    lastMach = 0;
    lastAge = -1;
    boomed = false;
    surface = surf === "land" ? "land" : "water";
    if (surface === "land") {
      crater.x = nx;
      crater.z = nz;
      crater.r = 0;
      crater.gzMax = 0;
    }
    const l = surface === "land" ? 1 : 0;
    mat.uniforms.uLand.value = l;
    stemMat.uniforms.uLand.value = l;
    root.scale.setScalar(1);
    root.visible = true;
    mesh.visible = true;
    stemMesh.visible = true;
  }

  /* Box-local camera and the projection used to write real depth. */
  function pushCam(m, mt, eye) {
    m.updateMatrixWorld(true);
    loc.copy(eye);
    m.worldToLocal(loc);
    mt.uniforms.uCam.value.copy(loc);
    mt.uniforms.uProjView.value.copy(proj);
    mt.uniforms.uModel.value.copy(m.matrixWorld);
  }

  function deadState() {
    return {
      live: false, flash: 0, trauma: 0, exposure: 0, fireR: 0, machR: 0, machR0: 0,
      tsunamiR: 0, suction: 0, x, z, power: 0, light: 0, glowR: 40,
      sonicBoom: false, age: 0, cloud: 0, stemH: 0, surface,
    };
  }

  /**
   * @param blast match.nukeState(): { id, x, z, surface, power, age, fireR,
   *   machR, tsunamiR, suction, fireballOn, groundZeroR, durationS } or null.
   * @param seaY sea surface height at the focus.
   * @param cam the THREE.Camera (needed to write depth). A bare position still
   *   works but then the volumes can't depth-sort against the scene.
   */
  function update(blast, seaY, cam) {
    if (!blast) {
      if (live) rest();
      blastId = -1;
      decayScorch();
      return deadState();
    }
    if (!live || blast.id !== blastId) {
      blastId = blast.id;
      ignite(blast.x, blast.z, blast.power, blast.surface);
    }
    const age = Math.max(0, blast.age);
    const dur = blast.durationS || 24;
    /* Age only moves while the match is live; hold camera trauma while frozen. */
    const advancing = age > lastAge;
    lastAge = age;
    const land = surface === "land";
    const eye = cam ? (cam.isCamera ? cam.position : cam) : null;
    const above = !eye || eye.y > seaY + 0.5;
    /* The lab popped out at its own end; fade over the sim's last 2 s instead. */
    const fade = Math.min(1, Math.max(0, (dur - age) / 2));

    /* Mushroom: lab shape curves, sitting on the ground on land. */
    const groundY = land ? Math.max(seaY, seabedWorldY(x, z, seaY)) : seaY;
    const rise = 1 - Math.exp(-age / 0.18);
    const late = 1 - Math.exp(-age / 9);
    const stemH = land ? 52 + rise * 62 + late * 12 : 56 + rise * 27 + late * 8;
    const width = land ? 93 + rise * 42 + late * 11 : 103 + rise * 25 + late * 9;
    root.position.set(x, groundY, z);
    mesh.scale.set(width, stemH, width);
    mesh.position.y = stemH * 0.5 - 8.0;
    const stemW = land ? Math.max(36, width * 0.34) : Math.max(48, width * 0.62);
    stemMesh.scale.set(stemW, stemH + 24, stemW);
    stemMesh.position.y = (stemH + 24) * 0.5 - 16.0;
    const hot = land ? Math.max(0.35, Math.exp(-age / 8)) : Math.exp(-age / 0.7);
    for (const m of [mat, stemMat]) {
      m.uniforms.uAmt.value = fade;
      /* Sim age, not wall time: the boil freezes with the match. */
      m.uniforms.uTime.value = age;
      m.uniforms.uAge.value = age;
      m.uniforms.uHot.value = hot;
    }

    /* Dust front rides the sim's shock radius, so it marks the real front. */
    const machR = blast.machR || 0;
    dust.visible = land && age > 0.35 && machR > 4;
    dust.scale.set(machR * 2.2, 14, machR * 2.2);
    dust.position.set(0, 4, 0);
    dustMat.uniforms.uAge.value = age;
    dustMat.uniforms.uTime.value = age;
    dustMat.uniforms.uAmt.value = Math.min(0.7, age / 1.2) * fade;

    root.updateMatrixWorld(true);
    if (eye) {
      if (cam.isCamera) proj.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
      pushCam(mesh, mat, eye);
      pushCam(stemMesh, stemMat, eye);
      if (dust.visible) pushCam(dust, dustMat, eye);
    }

    /* Spray (water) or dust (land) wash spreading across the surface. */
    const discR = 20 + 150 * (1 - Math.exp(-age / 1.1));
    mFx.x = discR;
    mFx.y = age < 11 ? (land ? 0.55 : 0.8) * Math.exp(-age / 6.5) * fade : 0;

    /* Ground zero: visible for exactly as long as the sim hurts there. */
    const gzR = blast.groundZeroR || 0;
    const gzLeft = dur - age;
    mGz.set(x, z, gzR, blast.fireballOn ? 1 : 0);
    const gzAmt = gzR > 0 && gzLeft > 0 ? (blast.fireballOn ? 1 : Math.min(1, gzLeft / 1.5)) : 0;

    /* Tsunami damage front, at the sim's tsunamiR (the tall visible wave
       crest in waveField travels faster and is not the damage ring). Damage
       falls off as (1 - r/reach)^2, so the ring fades the same way. */
    const tsR = blast.tsunamiR || 0;
    const reach = blast.tsunamiReach || 0;
    const reachFade = reach > 0 ? Math.max(0, 1 - tsR / reach) ** 2 : 1;
    const tsAmt = tsR > 6 ? 0.85 * Math.exp(-Math.max(0, age - 1.8) / 9) * reachFade * fade : 0;
    mGz2.set(gzAmt, tsR, tsAmt, age);

    /* Land blasts char the ground out past ground zero. */
    if (land) {
      scorchPeak = Math.min(1, age / 0.6);
      scorchEnd = -1;
      mFx.z = Math.max(40, gzR * 1.5);
      mFx.w = scorchPeak;
      crater.gzMax = Math.max(crater.gzMax, gzR);
      crater.r = crater.gzMax * Math.min(1, (18 + 36 * age) / 78);
      syncCrater();
    } else {
      decayScorch();
    }

    const machR0 = lastMach;
    lastMach = machR;
    const flash = age < 0.22 ? 1 : age < 0.7 ? Math.pow(1 - (age - 0.22) / 0.48, 0.6) * 0.75 : 0;
    flashQuad.visible = above && flash > 0.02;
    flashMat.uniforms.uAmt.value = flash * 0.92;
    let sonicBoom = false;
    if (eye && !boomed) {
      /* The lab read cam.x off the Camera (undefined), so it never fired. */
      const cd = Math.hypot(eye.x - x, eye.z - z);
      if (machR0 < cd && machR >= cd) {
        sonicBoom = true;
        boomed = true;
      }
    }
    const trauma = advancing ? (age < 0.5 ? 0.15 * Math.exp(-age / 0.35) : 0) + (sonicBoom ? 0.25 : 0) : 0;
    const cloud = Math.min(1, Math.max(0, age - 1.2) / 4) * fade;

    return {
      live: true, age, x, z, power: blast.power, yieldT: YIELD_KT * 1000,
      fireR: blast.fireR, machR, machR0, tsunamiR: blast.tsunamiR, suction: blast.suction,
      flash, trauma, exposure: flash * 6.0,
      /* The lab held light flat for the whole blast; decay it so the ocean
         glow and exposure boost don't stay on for 20 s. */
      light: ((land ? 0.9 : 0.45) * Math.exp(-age / 2.5) + flash * 0.5) * fade,
      glowR: width * 0.4, sonicBoom, cloud, stemH: stemH + (groundY - seaY), surface,
    };
  }

  /**
   * Ground-zero preview while a detonation is armed. Pass { x, z, y, r } in
   * world units (r = the sim's instant-kill radius), or null to hide.
   */
  function setAim(a, now = 0) {
    markUniforms.uMarkTime.value = now;
    if (!a) {
      mAim.w = 0;
      return;
    }
    mAim.set(a.x, a.z, Math.max(4, a.r), 1);
  }

  function dispose() {
    scene.remove(root);
    scene.remove(flashQuad);
    mAim.w = 0;
    mGz2.set(0, 0, 0, 0);
    mFx.set(0, 0, 0, 0);
    scorchPeak = 0;
    syncCrater();
    for (const m of [mesh, stemMesh, dust, flashQuad]) {
      m.geometry.dispose();
      m.material.dispose();
    }
    noise.dispose();
  }

  return { ignite, update, setAim, dispose, warm, rest, markUniforms, get live() { return live; } };
}
