/* OCEAN LAB — look-dev harness for the Stormbreak ocean.
   Camera, projection and sun reproduce src/engine/mesh.js and render3d.js so a
   shot here is framed exactly like the battle: orthographic, CAM_HEIGHT 3000,
   pitch 1.05..1.50, span = world height of the viewport. Scene props are
   placeholders; only the water is being judged. */
(function () {
  'use strict';
  const cv = document.getElementById('cv'), hud = document.getElementById('hud');
  const gl = cv.getContext('webgl2', { antialias: true, alpha: false });
  const fail = (m) => { window.__oceanLabError = m; document.getElementById('err').textContent = m; throw new Error(m); };
  if (!gl) fail('WebGL2 unavailable');

  const MAP = 3200, CAM_HEIGHT = 3000;
  const hex = (h) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
  const STYLE = {
    /* Calibrated against the storm concept by tools/ocean-lab/measure.py: the
       tone-02 sweep's best variant (t5), with glow desaturated and troughs
       darkened because t5 painted 13% of the water teal against the concept's 3%. */
    deep: [0.003, 0.05, 0.095], body: [0.13, 0.38, 0.48], scatter: [0.45, 0.95, 1.02], shallow: hex('#2bb3a3'),
    foam: [0.90, 0.95, 0.95], sand: [0.62, 0.56, 0.42], glow: 1.1, rough: 0.16, exposure: 1.25, foamGain: 1.0, crestLift: 0.25
  };
  /* Calm-day palette: cycle 17's, which measured closest to the shallows
     concept. A storm's brightness comes from crest light a calm sea does not
     have; the storm body in full sun made S3 read as a pool (cycle 18: water
     p50 84 against the concept's 49). */
  const STYLE_CALM = {
    deep: hex('#0a2537'), body: hex('#0f3a52'), scatter: hex('#23bfb0'),
    glow: 0.9, rough: 0.22, exposure: 1.12, crestLift: 0.12
  };
  function styleFor(storm) {
    const s = Math.max(0, Math.min(1, storm)), out = Object.assign({}, STYLE);
    for (const k of Object.keys(STYLE_CALM)) {
      const a = STYLE_CALM[k], b = STYLE[k];
      out[k] = Array.isArray(a) ? a.map((v, i) => v + (b[i] - v) * s) : a + (b - a) * s;
    }
    return out;
  }
  /* sunFor(0) from render3d.js; storm scales key light down and cools ambient. */
  function lightFor(storm) {
    const ang = Math.PI * 0.12 + Math.PI * 0.62, az = 0.6, y = Math.sin(ang), h = Math.cos(ang);
    const l = Math.hypot(Math.cos(az) * h, y, Math.sin(az) * h);
    /* The storm concepts are overcast but not dim: saturated teal and navy
       under a flat bright sky. Cutting the key light by 62% crushed cycle 0
       to one dark blue value. */
    const k = 1 - 0.3 * storm;
    return {
      sun: [Math.cos(az) * h / l, y / l, Math.sin(az) * h / l],
      sunC: [1.06 * k, 1.0 * k, 0.96 * k + 0.05 * storm],
      amb: [0.34 - 0.06 * storm, 0.40 - 0.05 * storm, 0.52 - 0.08 * storm],
      skyZ: [0.34 - 0.20 * storm, 0.46 - 0.24 * storm, 0.70 - 0.40 * storm],
      skyH: [0.60 - 0.28 * storm, 0.68 - 0.30 * storm, 0.76 - 0.32 * storm]
    };
  }
  const PRESETS = {
    S1: { label: 'STORM CLOSE', span: 550, pitch: 1.19, yaw: 0.6, center: [1560, 1560], level: 7, storm: 1, drama: 1.25 },
    S2: { label: 'STORM COMMAND', span: 1500, pitch: 1.19, yaw: 0.6, center: [1600, 1600], level: 6, storm: 0.8, drama: 1.2 },
    S3: { label: 'SHALLOWS', span: 700, pitch: 1.05, yaw: 0.6, center: [2230, 1270], level: 4, storm: 0, drama: 1.0 },
    S4: { label: 'WAKES', span: 450, pitch: 1.30, yaw: 0.6, center: [1480, 1700], level: 5, storm: 0.3, drama: 1.1 },
    S5: { label: 'STRATEGIC', span: 3000, pitch: 1.40, yaw: 0.6, center: [1600, 1600], level: 5, storm: 0.3, drama: 1.1 }
  };
  /* chop / chopGain / foamSigma stay unset so the sea's storm defaults apply. */
  const state = Object.assign({ shot: 'S1', time: 30, paused: false, swellMix: 0.2, windDir: 0.95, debug: 0 }, PRESETS.S1);

  /* ---- matrices (m4ortho / m4look from mesh.js) ---- */
  const m4 = () => new Float32Array(16);
  function ortho(o, l, r, b, t, n, f) { o.fill(0); o[0] = 2 / (r - l); o[5] = 2 / (t - b); o[10] = -2 / (f - n); o[15] = 1; o[12] = -(r + l) / (r - l); o[13] = -(t + b) / (t - b); o[14] = -(f + n) / (f - n); return o; }
  function look(o, ex, ey, ez, cx, cy, cz) {
    let zx = ex - cx, zy = ey - cy, zz = ez - cz, l = Math.hypot(zx, zy, zz) || 1; zx /= l; zy /= l; zz /= l;
    let xx = zz, xy = 0, xz = -zx; l = Math.hypot(xx, xy, xz) || 1; xx /= l; xz /= l;
    const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
    o.set([xx, yx, zx, 0, xy, yy, zy, 0, xz, yz, zz, 0, -(xx * ex + xy * ey + xz * ez), -(yx * ex + yy * ey + yz * ez), -(zx * ex + zy * ey + zz * ez), 1]);
    return o;
  }
  function mul(o, a, b) { for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + j] * b[i * 4 + k]; o[i * 4 + j] = s; } return o; }
  const matP = m4(), matV = m4(), matVP = m4();

  /* ---- islands: height field in world metres, like the engine's R16F sheet ---- */
  const HN = 512;
  const heights = new Float32Array(HN * HN);
  const hash = (x, y) => { let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  const sm = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  function vn(x, y) { const xi = Math.floor(x), yi = Math.floor(y), fx = sm(0, 1, x - xi), fy = sm(0, 1, y - yi); const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1); return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy; }
  function fbm(x, y) { let s = 0, a = 0.5, f = 1; for (let i = 0; i < 5; i++) { s += a * vn(x * f, y * f); f *= 2.03; a *= 0.5; } return s; }
  const ISLANDS = [
    { x: 1400, z: 1470, r: 42, h: 36 }, { x: 1770, z: 1395, r: 34, h: 28 }, { x: 1815, z: 1790, r: 52, h: 40 },
    { x: 1330, z: 1760, r: 26, h: 22 }, { x: 2250, z: 1250, r: 200, h: 34 }, { x: 2130, z: 1420, r: 70, h: 26 },
    { x: 940, z: 2150, r: 150, h: 30 }, { x: 2400, z: 2300, r: 90, h: 44 }
  ];
  function groundAt(x, z) {
    let h = -52 + (fbm(x / 420, z / 420) - 0.5) * 16;
    for (const I of ISLANDS) {
      const n = fbm(x / 70 + I.x * 0.01, z / 70 + I.z * 0.01) - 0.5;
      const t = Math.hypot(x - I.x, z - I.z) / I.r + n * 0.45;
      if (t > 2.4) continue;
      const shelf = -2.0 - 16 * sm(1.0, 2.3, t);
      const land = t < 1 ? -1.5 + (I.h + 1.5) * Math.pow(1 - t, 0.9) * (0.8 + n * 0.8) : -99;
      h = Math.max(h, Math.max(shelf, land));
    }
    return h;
  }
  for (let j = 0; j < HN; j++) for (let i = 0; i < HN; i++) heights[j * HN + i] = groundAt((i + 0.5) / HN * MAP, (j + 0.5) / HN * MAP);
  const heightTex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, heightTex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R16F, HN, HN, 0, gl.RED, gl.FLOAT, heights);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  /* ---- placeholder scene: terrain + platform + hulls, one lit program ---- */
  const SCENE_VS = `#version 300 es
  layout(location=0) in vec3 aP; layout(location=1) in vec3 aN; layout(location=2) in vec3 aC;
  uniform mat4 uVP; out vec3 vN; out vec3 vC;
  void main(){ vN=aN; vC=aC; gl_Position=uVP*vec4(aP,1.0); }`;
  const SCENE_FS = `#version 300 es
  precision highp float; in vec3 vN; in vec3 vC; uniform vec3 uSun; uniform vec3 uSunC; uniform vec3 uAmb; out vec4 o;
  void main(){ vec3 n=normalize(vN); vec3 c=vC*(uAmb*0.9+uSunC*max(dot(n,uSun),0.0)*0.85); o=vec4(vec3(1.0)-exp(-c*1.12),1.0); }`;
  const scene = mfOceanProgram(gl, SCENE_VS, SCENE_FS, 'scene');
  const verts = [];
  const TN = 320;
  const gridH = (i, j) => groundAt(i / TN * MAP, j / TN * MAP);
  for (let j = 0; j < TN; j++) for (let i = 0; i < TN; i++) {
    const quad = [[i, j], [i, j + 1], [i + 1, j], [i + 1, j], [i, j + 1], [i + 1, j + 1]];
    const hs = quad.map(([a, b]) => gridH(a, b));
    if (Math.max(...hs) < -6) continue;
    for (let q = 0; q < 6; q++) {
      const [a, b] = quad[q], h = hs[q], e = MAP / TN;
      const nx = gridH(a - 1, b) - gridH(a + 1, b), nz = gridH(a, b - 1) - gridH(a, b + 1), nl = Math.hypot(nx, 2 * e, nz);
      const rock = sm(1.5, 5, h), green = sm(0.6, 0.95, 2 * e / nl) * sm(8, 20, h);
      const col = [0.58 - 0.49 * rock + 0.07 * green, 0.52 - 0.42 * rock + 0.09 * green, 0.40 - 0.31 * rock + 0.02 * green];
      verts.push(a * e, h, b * e, nx / nl, 2 * e / nl, nz / nl, ...col);
    }
  }
  function box(cx, cy, cz, sx, sy, sz, yaw, col) {
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const faces = [[[1, 0, 0], [0, 1, 0], [0, 0, 1]], [[-1, 0, 0], [0, 1, 0], [0, 0, -1]], [[0, 1, 0], [0, 0, 1], [1, 0, 0]],
      [[0, -1, 0], [0, 0, -1], [1, 0, 0]], [[0, 0, 1], [1, 0, 0], [0, 1, 0]], [[0, 0, -1], [-1, 0, 0], [0, 1, 0]]];
    const hw = [sx / 2, sy / 2, sz / 2];
    for (const [n, u, v] of faces) {
      const corner = (a, b) => [0, 1, 2].map(k => (n[k] + u[k] * a + v[k] * b) * hw[k]);
      const pts = [corner(-1, -1), corner(1, -1), corner(-1, 1), corner(-1, 1), corner(1, -1), corner(1, 1)];
      for (const p of pts) verts.push(cx + p[0] * c - p[2] * s, cy + p[1], cz + p[0] * s + p[2] * c, n[0] * c - n[2] * s, n[1], n[0] * s + n[2] * c, ...col);
    }
  }
  const steel = [0.22, 0.24, 0.26], deck = [0.30, 0.31, 0.30], hull = [0.18, 0.19, 0.21];
  const pads = [[1600, 1600, 70], [1700, 1520, 56], [1500, 1690, 56], [1700, 1700, 48]];
  for (const [x, z, s] of pads) {
    box(x, 9, z, s, 6, s, 0.6, deck);
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) box(x + dx * s * 0.42, -8, z + dz * s * 0.42, 7, 30, 7, 0.6, steel);
    box(x, 17, z, s * 0.45, 12, s * 0.45, 0.6, steel);
  }
  box(1650, 10, 1560, 110, 2.5, 8, 0.6 + 0.78, deck); box(1550, 10, 1645, 110, 2.5, 8, 0.6 + 0.78, deck);
  /* Moving hulls for wakes and pose: corvette-sized boxes on straight courses
     that wrap every 900 m, so any clock value gives a deterministic frame.
     They are rebuilt every frame from the CPU mirror, never baked. */
  const HULLS = [
    { x: 1330, z: 1640, yaw: 0.22, speed: 11 },
    { x: 1380, z: 1730, yaw: 0.35, speed: 9 },
    { x: 1560, z: 1600, yaw: 2.9, speed: 12 }
  ];
  function hullAt(H, t) {
    const s = ((H.speed * t) % 900 + 900) % 900 - 300;
    return { x: H.x + Math.cos(H.yaw) * s, z: H.z + Math.sin(H.yaw) * s, yaw: H.yaw, speed: H.speed };
  }
  function wakesAt(t) { return HULLS.map(H => hullAt(H, t)); }
  const hullVerts = new Float32Array(HULLS.length * 2 * 36 * 9);
  const hullVao = gl.createVertexArray(), hullVbo = gl.createBuffer();
  gl.bindVertexArray(hullVao);
  gl.bindBuffer(gl.ARRAY_BUFFER, hullVbo);
  gl.bufferData(gl.ARRAY_BUFFER, hullVerts.byteLength, gl.DYNAMIC_DRAW);
  [[0, 0], [1, 12], [2, 24]].forEach(([loc, off]) => { gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 3, gl.FLOAT, false, 36, off); });
  gl.bindVertexArray(null);
  /* Box in a posed frame: F forward, U up, L port - the same local axes as box(). */
  function hullBox(buf, o, C, F, U, L, sx, sy, sz, col) {
    const faces = [[[1, 0, 0], [0, 1, 0], [0, 0, 1]], [[-1, 0, 0], [0, 1, 0], [0, 0, -1]], [[0, 1, 0], [0, 0, 1], [1, 0, 0]],
      [[0, -1, 0], [0, 0, -1], [1, 0, 0]], [[0, 0, 1], [1, 0, 0], [0, 1, 0]], [[0, 0, -1], [-1, 0, 0], [0, 1, 0]]];
    const hw = [sx / 2, sy / 2, sz / 2], corners = [[-1, -1], [1, -1], [-1, 1], [-1, 1], [1, -1], [1, 1]];
    for (const [n, u, v] of faces) {
      for (const [a, b] of corners) {
        const lx = (n[0] + u[0] * a + v[0] * b) * hw[0], ly = (n[1] + u[1] * a + v[1] * b) * hw[1], lz = (n[2] + u[2] * a + v[2] * b) * hw[2];
        for (let k = 0; k < 3; k += 1) buf[o + k] = C[k] + F[k] * lx + U[k] * ly + L[k] * lz;
        for (let k = 0; k < 3; k += 1) buf[o + 3 + k] = F[k] * n[0] + U[k] * n[1] + L[k] * n[2];
        buf[o + 6] = col[0]; buf[o + 7] = col[1]; buf[o + 8] = col[2];
        o += 9;
      }
    }
    return o;
  }
  const poseScratch = { heave: 0, pitch: 0, roll: 0 };
  function updateHulls(t) {
    let o = 0;
    for (const H of HULLS) {
      const p = hullAt(H, t);
      const pose = mirror ? mfOceanMirrorHullPose(mirror, p.x, p.z, p.yaw, 38, 9, t, poseScratch) : { heave: 0, pitch: 0, roll: 0 };
      const cp = Math.cos(pose.pitch), sp = Math.sin(pose.pitch), cr = Math.cos(pose.roll), sr = Math.sin(pose.roll);
      const fx = Math.cos(p.yaw), fz = Math.sin(p.yaw);
      const F = [cp * fx, sp, cp * fz];
      const Lr = [cr * -fz, sr, cr * fx];
      const dot = Lr[0] * F[0] + Lr[1] * F[1] + Lr[2] * F[2];
      const Lo = [Lr[0] - F[0] * dot, Lr[1] - F[1] * dot, Lr[2] - F[2] * dot];
      const ll = Math.hypot(Lo[0], Lo[1], Lo[2]) || 1;
      const L = [Lo[0] / ll, Lo[1] / ll, Lo[2] / ll];
      const U = [L[1] * F[2] - L[2] * F[1], L[2] * F[0] - L[0] * F[2], L[0] * F[1] - L[1] * F[0]];
      /* About a metre of draft: the water surface hides the rest. */
      const C = [p.x, pose.heave + 1.5, p.z];
      o = hullBox(hullVerts, o, C, F, U, L, 38, 5, 9, hull);
      o = hullBox(hullVerts, o, [C[0] - F[0] * 4 + U[0] * 5, C[1] - F[1] * 4 + U[1] * 5, C[2] - F[2] * 4 + U[2] * 5], F, U, L, 12, 5, 6, steel);
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, hullVbo);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, hullVerts, 0, o);
    return o / 9;
  }
  const sceneCount = verts.length / 9;
  const sceneVao = gl.createVertexArray();
  gl.bindVertexArray(sceneVao);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.STATIC_DRAW);
  [[0, 0], [1, 12], [2, 24]].forEach(([loc, off]) => { gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 3, gl.FLOAT, false, 36, off); });
  gl.bindVertexArray(null);

  /* ---- ocean ---- */
  const ocean = mfOceanCreate(gl, { N: 256 });
  if (!ocean.ok) fail(ocean.error);
  const surface = mfOceanSurfaceCreate(gl, ocean, {});
  const foamSim = mfOceanFoamSimCreate(gl, ocean, { res: 1024 });
  /* Optional authored foam: tools/ocean-lab/foam-art.png, white foam on black,
     seamless. Absent, the surface shows crest foam and a faint haze only. */
  let foamArt = null;
  const artReady = new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      foamArt = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, foamArt);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.generateMipmap(gl.TEXTURE_2D);
      resolve(true);
    };
    img.onerror = () => resolve(false);
    img.src = 'foam-art.png';
  });
  let seaKey = '', mirror = null;
  function applySea() {
    const key = [state.level, state.drama, state.chop, state.swellMix, state.windDir].join('|');
    if (key === seaKey) return;
    seaKey = key;
    mfOceanSetSea(ocean, { level: state.level, drama: state.drama, chop: state.chop, swellMix: state.swellMix, windDir: state.windDir, swellAngle: 0.75 });
    mirror = mfOceanMirrorBuild(ocean, { count: 128 });
  }

  let last = performance.now(), fpsAcc = 0, fpsN = 0, fps = 0;
  function frame(dt) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = Math.round(cv.clientWidth * dpr), H = Math.round(cv.clientHeight * dpr);
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
    applySea();
    /* A paused clock must not decay or advect foam between screenshots. */
    const stepDt = state.paused ? 0 : dt;
    mfOceanUpdate(ocean, state.time, stepDt);
    mfOceanFoamSimUpdate(foamSim, ocean, state.center, state.span, stepDt, wakesAt(state.time));
    const asp = W / H, hh = state.span / 2, hw = hh * asp, hor = Math.cos(state.pitch) * CAM_HEIGHT;
    const ex = state.center[0] - Math.cos(state.yaw) * hor, ez = state.center[1] - Math.sin(state.yaw) * hor, ey = Math.sin(state.pitch) * CAM_HEIGHT;
    ortho(matP, -hw, hw, -hh, hh, -6000, 9000);
    look(matV, ex, ey, ez, state.center[0], 0, state.center[1]);
    mul(matVP, matP, matV);
    const light = lightFor(state.storm);
    gl.viewport(0, 0, W, H);
    gl.clearColor(0.02, 0.05, 0.07, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST); gl.enable(gl.CULL_FACE);
    gl.useProgram(scene.p);
    gl.uniformMatrix4fv(scene.u.uVP, false, matVP);
    gl.uniform3fv(scene.u.uSun, light.sun); gl.uniform3fv(scene.u.uSunC, light.sunC); gl.uniform3fv(scene.u.uAmb, light.amb);
    gl.disable(gl.CULL_FACE);
    gl.bindVertexArray(sceneVao); gl.drawArrays(gl.TRIANGLES, 0, sceneCount); gl.bindVertexArray(null);
    const hullCount = updateHulls(state.time);
    gl.bindVertexArray(hullVao); gl.drawArrays(gl.TRIANGLES, 0, hullCount); gl.bindVertexArray(null);
    const vl = Math.hypot(ex - state.center[0], ey, ez - state.center[1]);
    const info = mfOceanSurfaceDraw(surface, ocean, {
      vp: matVP, center: state.center, yaw: state.yaw, pitch: state.pitch, span: state.span, aspect: asp,
      view: [(ex - state.center[0]) / vl, ey / vl, (ez - state.center[1]) / vl], light, style: styleFor(state.storm),
      storm: state.storm, time: state.time, heightTex, mapRect: [0, 0, MAP, MAP], foamSim, debug: state.debug, foamArt
    });
    const s = ocean.sea;
    hud.textContent = `${state.shot} ${PRESETS[state.shot] ? PRESETS[state.shot].label : ''}\n` +
      `sea ${state.level.toFixed(1)}  Hs ${s.hs.toFixed(1)} m  T ${s.period.toFixed(1)} s  U ${s.wind.toFixed(1)} m/s\n` +
      `span ${state.span} m  pitch ${(state.pitch * 180 / Math.PI).toFixed(0)}°  grid ${info.spacing.toFixed(1)} m  ${fps.toFixed(0)} fps`;
  }
  function loop(now) {
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    fpsAcc += dt; fpsN++; if (fpsAcc > 0.5) { fps = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0; }
    if (!state.paused) state.time += dt;
    frame(dt);
    requestAnimationFrame(loop);
  }

  /* ---- controls: drag pans, wheel/pinch zooms, keys pick shots ---- */
  let drag = null;
  cv.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY }; cv.setPointerCapture(e.pointerId); });
  cv.addEventListener('pointermove', e => {
    if (!drag) return;
    const k = state.span / cv.clientHeight, dx = (e.clientX - drag.x) * k, dy = (e.clientY - drag.y) * k / Math.sin(state.pitch);
    const r = [-Math.sin(state.yaw), Math.cos(state.yaw)], f = [Math.cos(state.yaw), Math.sin(state.yaw)];
    state.center = [state.center[0] - r[0] * dx + f[0] * dy, state.center[1] - r[1] * dx + f[1] * dy];
    drag = { x: e.clientX, y: e.clientY };
  });
  cv.addEventListener('pointerup', () => { drag = null; });
  cv.addEventListener('wheel', e => { e.preventDefault(); state.span = Math.max(420, Math.min(3400, state.span * Math.exp(e.deltaY * 0.001))); }, { passive: false });
  window.addEventListener('keydown', e => {
    if (PRESETS['S' + e.key]) setShot('S' + e.key);
    if (e.key === ']') state.level = Math.min(8, state.level + 0.5);
    if (e.key === '[') state.level = Math.max(0, state.level - 0.5);
    if (e.key === 'p') state.paused = !state.paused;
    if (e.key === 'h') hud.classList.toggle('hidden');
    /* v cycles debug views: final, foam amount, sim density, compression, cover. */
    if (e.key === 'v') state.debug = (state.debug + 1) % 5;
  });
  function setShot(name) { Object.assign(state, PRESETS[name], { shot: name }); }

  window.oceanLab = {
    ready: false, state, presets: PRESETS, style: STYLE, ocean,
    set(p) { Object.assign(state, p || {}); return state; },
    /* Deterministic capture: fixed clock, then 6 s of foam history at 30 Hz. */
    async shot(name, over) {
      await artReady;
      setShot(name); Object.assign(state, over || {});
      state.paused = true;
      const t1 = state.time;
      state.time = t1 - 6;
      for (let i = 0; i < 180; i++) {
        state.time += 1 / 30; applySea();
        mfOceanUpdate(ocean, state.time, 1 / 30);
        mfOceanFoamSimUpdate(foamSim, ocean, state.center, state.span, 1 / 30, wakesAt(state.time));
      }
      state.time = t1;
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      return { shot: name, sea: ocean.sea, fps };
    },
    gpu() { const d = gl.getExtension('WEBGL_debug_renderer_info'); return d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : 'unknown'; },
    /* Hull poses at the current clock: a top-down shot cannot show pitch and
       roll, so the harness prints them instead. */
    hulls() {
      if (!mirror) return [];
      return HULLS.map(H => {
        const p = hullAt(H, state.time);
        const pose = mfOceanMirrorHullPose(mirror, p.x, p.z, p.yaw, 38, 9, state.time, {});
        return { x: p.x, z: p.z, yaw: p.yaw, heave: pose.heave, pitch: pose.pitch, roll: pose.roll, energy: mirror.energyFraction };
      });
    },
    /* Numbers a screenshot cannot give: what the GPU field actually holds. */
    fieldStats() {
      const N = ocean.N, buf = new Float32Array(N * N * 4), fb = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      const readLayer = (tex, layer) => {
        if (layer == null) gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
        else gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, tex, 0, layer);
        gl.readBuffer(gl.COLOR_ATTACHMENT0);
        gl.readPixels(0, 0, N, N, gl.RGBA, gl.FLOAT, buf);
        return buf.slice();
      };
      const cascades = ocean.cascades.map((C, c) => {
        const D = readLayer(ocean.dispArr, c), G = readLayer(ocean.derivArr, c), F = readLayer(mfOceanFoamTex(ocean), c);
        const raw = readLayer(C.A[0], null);
        let hv = 0, sx = 0, jMin = 9, below = 0, fMax = 0, fSum = 0, dMax = 0, re2 = 0, im2 = 0;
        for (let i = 0; i < N * N; i++) {
          const o = i * 4, J = (1 + G[o + 2]) * (1 + G[o + 3]) - D[o + 3] * D[o + 3];
          hv += D[o + 1] * D[o + 1]; sx += G[o] * G[o] + G[o + 1] * G[o + 1];
          jMin = Math.min(jMin, J); if (J < C.foamBias) below++;
          fMax = Math.max(fMax, F[o]); fSum += F[o]; dMax = Math.max(dMax, Math.hypot(D[o], D[o + 2]));
          re2 += raw[o] * raw[o]; im2 += raw[o + 1] * raw[o + 1];
        }
        const n = N * N;
        return { L: C.L, sigmaJ: C.sigmaJ, bias: C.foamBias, hStd: Math.sqrt(hv / n), slopeRms: Math.sqrt(sx / n), jMin, foamBelowBias: below / n,
          foamMax: fMax, foamMean: fSum / n, dispMax: dMax, fftImagRatio: Math.sqrt(im2 / Math.max(re2, 1e-30)) };
      });
      gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.deleteFramebuffer(fb);
      const hsMeasured = 4 * Math.sqrt(cascades.reduce((s, c) => s + c.hStd * c.hStd, 0));
      return { hsTarget: ocean.sea.hs, hsMeasured, foamBias: ocean.foam.bias, cascades };
    }
  };
  applySea();
  window.oceanLab.ready = true;
  requestAnimationFrame(loop);
})();
