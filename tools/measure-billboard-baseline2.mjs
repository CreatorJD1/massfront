#!/usr/bin/env node
/* BILLBOARD BASELINE, PASS 2 — sensitivity controls and a call-site census.
   READ-ONLY: nothing here edits a source file; every hook is runtime-only.

   Pass 1 (tools/measure-billboard-baseline.mjs) produced a headline of ~1 ms of
   frame time for the whole billboard system inside a ~33 ms frame. A 3 % effect
   measured against a noisy scene is exactly the shape of result that is usually
   the instrument rather than the code, so pass 2 exists to try to break it:

     NULL CONTROL   'onB' is byte-identical to 'on'. Two labels for the same
                    work. |on - onB| is the rig's own noise. If that is the same
                    size as |on - skipAll|, the 1 ms is not a measurement.
     GAIN CONTROL   'x8' flushes the additive batch eight times — eight times the
                    fill, same geometry, same CPU. If a 8x fill increase does NOT
                    move the frame clock, the rig cannot see fill rate at all and
                    every number in pass 1 is void.
     SKIP CONTROL   'skipAll' / 'skipAdd' as in pass 1, plus the frozen-pair
                    image check that proves the skip removed real pixels.

   Also fixes pass 1's call-site census (the stack walk stopped on the runtime
   wrapper instead of the real caller), measures a single explosion in an EMPTY
   world instead of on top of a live battle, and sweeps camera zoom, because
   billboard fill scales with (bufH/orthoSpan)^2 and SPAN_MIN=420 is the worst
   case the player can actually reach.

   Usage:  node tools/measure-billboard-baseline2.mjs
   Output: .tmp/bb-baseline/pass2.json
*/
import { launchPwBrowser, closePwBrowser } from './pw-browser.mjs';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const outDir = join(root, '.tmp', 'bb-baseline');
await mkdir(outDir, { recursive: true });

const MIME = {
  '.html':'text/html', '.js':'text/javascript', '.mjs':'text/javascript', '.css':'text/css',
  '.json':'application/json', '.png':'image/png', '.jpg':'image/jpeg', '.svg':'image/svg+xml',
  '.ogg':'audio/ogg', '.m4a':'audio/mp4', '.mp3':'audio/mpeg', '.wav':'audio/wav',
  '.glb':'model/gltf-binary', '.gltf':'model/gltf+json', '.webmanifest':'application/manifest+json',
  '.wasm':'application/wasm'
};
const server = createServer(async (req, res) => {
  try {
    let p = decodeURIComponent((req.url || '/').split('?')[0]);
    if (p === '/') p = '/index.html';
    const file = resolve(join(root, p));
    if (!file.startsWith(root) || !existsSync(file)) { res.writeHead(404); res.end('nf'); return; }
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': MIME[extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(body);
  } catch { res.writeHead(404); res.end('nf'); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const url = 'http://127.0.0.1:' + server.address().port + '/';

const log = [];
const say = m => { log.push(String(m)); console.log(m); };
say('serving ' + url);

const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const browser = await launchPwBrowser({
  executablePath: existsSync(chrome) ? chrome : undefined, headless: true,
  args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-gpu', '--disable-gpu-sandbox']
});

const boot = () => {
  try { if (typeof apClose === 'function') apClose(); } catch (e) {}
  try { if (typeof apGateSatisfied === 'function') apGateSatisfied(); } catch (e) {}
  try { if (typeof stopAttract === 'function') stopAttract(); } catch (e) {}
  document.body.classList.add('mfIntroDone');
  for (const id of ['mfBootCover', 'apOverlay', 'loadScr', 'mfIntroSkip', 'mfIntroReplay']) {
    const el = document.getElementById(id);
    if (el) el.style.setProperty('display', 'none', 'important');
  }
  document.querySelectorAll('.mfTitleReveal').forEach(el => el.style.setProperty('display', 'none', 'important'));
};

let RESULT = null;
try {
  const page = await browser.newPage({
    viewport: { width: 412, height: 915 },
    deviceScaleFactor: 3, hasTouch: true, isMobile: true, colorScheme: 'dark',
    userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36'
  });
  const errs = [];
  page.on('pageerror', e => { errs.push(e.message.slice(0, 200)); });
  await page.addInitScript(() => {
    try {
      localStorage.setItem('mf_ap_gate_closed', '1');
      localStorage.setItem('mf_ap_dismissed', '1');
      localStorage.setItem('mf_offline', '1');
      localStorage.setItem('mf_prealpha_cinematic_v2', 'test-seen');
      localStorage.setItem('mf_auth_gate_v1', '1');
    } catch (e) {}
  });
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

  const gpu = await page.evaluate(() => {
    const c = document.createElement('canvas'), g = c.getContext('webgl2');
    if (!g) return 'NO-WEBGL2';
    const d = g.getExtension('WEBGL_debug_renderer_info');
    return d ? g.getParameter(d.UNMASKED_RENDERER_WEBGL) : String(g.getParameter(g.RENDERER));
  });
  say('GPU: ' + gpu);

  await page.waitForFunction(() => typeof spawnUnit === 'function' && typeof render === 'function' &&
    typeof resetWorld === 'function' && typeof spawnExplosion === 'function', { timeout: 120000 });
  await page.waitForTimeout(400);
  await page.evaluate(boot);
  await page.waitForFunction(() => typeof heightF !== 'undefined' && heightF &&
    typeof terrainTex !== 'undefined' && terrainTex, { timeout: 90000 }).catch(() => {});

  RESULT = await page.evaluate(async (CFG) => {
    const R = { cfg: CFG, fail: [], notes: [] };
    const sleep = ms => new Promise(r => setTimeout(r, ms));

    const _raf = window.requestAnimationFrame;
    window.requestAnimationFrame = function () { return 0; };
    await sleep(120);

    try { stopAttract(); } catch (e) {}
    attractOn = false; demoMode = false; matchLive = true; fogOn = false;
    running = true; paused = false; gameEnded = false;
    if (typeof META !== 'undefined' && META.settings) {
      META.settings.fog = false; META.settings.dayNight = false;
      META.settings.quality = 'medium'; META.settings.shake = false;
      META.settings.gfxOver = {};
    }
    if (typeof applySettings === 'function') applySettings();
    if (typeof initBillboards === 'function') initBillboards();
    dayT = 0.20;
    resetWorld();
    playerFaction = 'nova';
    perfScale = CFG.perfScale;
    if (typeof GFX !== 'undefined') { GFX.particles = 0.75; GFX.fxFloor = 0.35; }
    if (typeof shakeMult !== 'undefined') shakeMult = 0;

    const cv2 = document.getElementById('gl');
    for (const id of ['pauseOverlay','gameOver','levelUp','loadScr','dispatch','apOverlay','setupScr','startScreen']) {
      const e = document.getElementById(id); if (e) e.style.setProperty('display','none','important');
    }
    document.body.classList.remove('menuMode', 'mfMenuOpen');
    for (const el of [...document.body.children]) if (el.id !== 'gl') el.style.display = 'none';
    cv2.style.display = 'block'; cv2.style.position = 'fixed'; cv2.style.inset = '0';
    cv2.style.width = '100vw'; cv2.style.height = '100vh';
    if (typeof resize === 'function') resize();

    let P = null;
    for (let r = 200; r < MAP * 0.45 && !P; r += 90) {
      for (let a = 0; a < 16; a++) {
        const x = MAP * 0.5 + Math.cos(a * 0.3927) * r, y = MAP * 0.5 + Math.sin(a * 0.3927) * r;
        if (x < 300 || y < 300 || x > MAP - 300 || y > MAP - 300) continue;
        const civic = typeof cityGroundAt === 'function' && cityGroundAt(x, y) >= 1;
        if (!civic && isWalkable(x, y)) { P = [x, y]; break; }
      }
    }
    if (!P) { R.fail.push('no open non-civic ground'); P = [MAP * 0.5, MAP * 0.5]; }
    const CX = P[0], CY = P[1];
    cam.x = CX; cam.y = CY; camFollow = -1;
    camYaw = yawTarget = 0.22; camPitch = pitchTarget = 1.05;

    /* ---- shared machinery ------------------------------------------------ */
    const DT = 1 / 30;
    const sim = (dt) => {
      try { unitTick(dt); } catch (e) {}
      try { projTick(dt); } catch (e) {}
      try { beamTick(dt); } catch (e) {}
      try { if (typeof bldTick === 'function') bldTick(dt); } catch (e) {}
      try { if (typeof fortTick === 'function') fortTick(dt); } catch (e) {}
      try { if (typeof updParticles === 'function') updParticles(dt); } catch (e) {}
      try { if (typeof shardTick === 'function') shardTick(dt); } catch (e) {}
    };
    const boom = (n, span) => {
      for (let k = 0; k < n; k++) {
        const a = Math.random() * Math.PI * 2, r = Math.random() * span * 0.32;
        try { spawnExplosion(CX + Math.cos(a) * r, CY + Math.sin(a) * r, 9 + Math.random() * 25, k & 1); } catch (e) {}
      }
    };
    const idx = n => TYPES.findIndex(T => T.name === n);
    const pool = ['Rhino','Striker','Longbow','Lancer'].map(idx).filter(i => i >= 0);
    const put = (ty, team, x, y) => { const i = spawnUnit(ty, team, x, y); if (i >= 0) { ucool[i] = 0; umarch[i] = 0; ustate[i] = 0; } return i; };
    const army = (n) => {
      const half = n >> 1, w = [], e = [];
      for (let k = 0; k < half; k++) {
        const ty = pool[k % pool.length], row = (k / 9) | 0, col = k % 9;
        const a = put(ty, 0, CX - 90 - row * 20, CY - 96 + col * 24); if (a >= 0) w.push(a);
        const b = put(ty, 1, CX + 90 + row * 20, CY - 96 + col * 24); if (b >= 0) e.push(b);
      }
      const aim = (i, j) => { if (i < 0 || j < 0) return; uang[i] = uturr[i] = Math.atan2(uy[j] - uy[i], ux[j] - ux[i]) + Math.PI / 2; utgt[i] = j; utgtg[i] = ugen[j]; ucool[i] = 0; };
      for (let k = 0; k < w.length; k++) aim(w[k], e[k % Math.max(1, e.length)]);
      for (let k = 0; k < e.length; k++) aim(e[k], w[k % Math.max(1, w.length)]);
      return { w: w.length, e: e.length };
    };

    const M = { mode: 'on', rec: null, viewport: null };
    const origFlush = BBBatch.prototype.flush;
    const nameOf = (b) => b === bbAdd ? 'add' : (b === bbAlpha ? 'alpha' : (typeof bbIcon !== 'undefined' && b === bbIcon ? 'icon' : 'other'));
    BBBatch.prototype.flush = function (g) {
      const n = this.n, tag = nameOf(this);
      if (M.rec) M.rec[tag] = (M.rec[tag] || 0) + n;
      if (M.viewport === 'want' && n) M.viewport = Array.from(g.getParameter(g.VIEWPORT));
      if (M.mode === 'skipAll' || (M.mode === 'skipAdd' && tag === 'add')) { this.n = 0; return; }
      origFlush.call(this, g);
      /* GAIN CONTROL. Re-arm and re-flush: 8x the rasterised fragments, the
         same instance count, the same JS. Nothing but fill changes. */
      if (M.mode === 'x8' && tag === 'add' && n) for (let k = 0; k < 7; k++) { this.n = n; origFlush.call(this, g); }
    };
    const px1 = new Uint8Array(4);
    const syncGPU = () => { gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px1); };
    const pct = (a, p) => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; };
    const mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;

    /* ---- measured-overdraw rig ------------------------------------------ */
    const FS_COUNT = `#version 300 es
precision highp float;
in vec2 vUV; in vec4 vCol;
out vec4 o;
void main(){ o=vec4(1.0/255.0,0.0,0.0,0.0); }`;
    const FS_ALIVE = `#version 300 es
precision highp float;
in vec2 vUV; in vec4 vCol;
uniform sampler2D uTex;
out vec4 o;
void main(){ vec4 t=texture(uTex,vUV); if(t.a*vCol.a<0.004) discard; o=vec4(1.0/255.0,0.0,0.0,0.0); }`;
    const pC = mkProg(VSBB, FS_COUNT, 'bbCount2');
    const pA = mkProg(VSBB, FS_ALIVE, 'bbAlive2');
    if (!pC || !pA) R.fail.push('overdraw shaders failed: ' + (typeof GL_PROG_ERRORS !== 'undefined' ? GL_PROG_ERRORS.slice(-3).join(' | ') : '?'));
    let odFB = null, odTex = null, odW = 0, odH = 0, readBuf = null;
    const odSize = (w, h) => {
      if (odW === w && odH === h) return;
      if (odFB) { gl.deleteFramebuffer(odFB); gl.deleteTexture(odTex); }
      odW = w; odH = h; readBuf = new Uint8Array(w * h * 4);
      odTex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, odTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      odFB = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, odFB);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, odTex, 0);
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) R.fail.push('overdraw FBO incomplete');
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    };
    const countPass = (prog, batches) => {
      gl.bindFramebuffer(gl.FRAMEBUFFER, odFB);
      gl.viewport(0, 0, odW, odH);
      gl.disable(gl.SCISSOR_TEST); gl.disable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE);
      gl.depthMask(false);
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
      gl.useProgram(prog);
      gl.uniformMatrix4fv(gl.getUniformLocation(prog, 'uVP'), false, matVP);
      const asp = (typeof camAspect === 'function') ? camAspect() : (VW / Math.max(1, VH));
      gl.uniform2f(gl.getUniformLocation(prog, 'uScale'), 2 / (Math.max(1, orthoSpan) * asp), 2 / Math.max(1, orthoSpan));
      const uT = gl.getUniformLocation(prog, 'uTex');
      if (uT) { gl.uniform1i(uT, 0); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, atlasTex); }
      for (const [b, n] of batches) { if (!n) continue; gl.bindVertexArray(b.vao); gl.drawElementsInstanced(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0, n); }
      gl.bindVertexArray(null);
      gl.readPixels(0, 0, odW, odH, gl.RGBA, gl.UNSIGNED_BYTE, readBuf);
      let frags = 0, covered = 0, sat = 0, peak = 0;
      for (let i = 0; i < readBuf.length; i += 4) { const v = readBuf[i]; if (v) { frags += v; covered++; if (v > peak) peak = v; if (v === 255) sat++; } }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.enable(gl.DEPTH_TEST); gl.enable(gl.CULL_FACE); gl.depthMask(true);
      return { fragments: frags, coveredPixels: covered, peakLayers: peak, saturatedPixels: sat };
    };

    /* ===================================================================== */
    /*  ZOOM SWEEP                                                           */
    /* ===================================================================== */
    R.spans = {};
    for (const SPAN of CFG.spans) {
      const S = { span: SPAN };
      /* fresh army each span so the fight density is comparable */
      resetWorld();
      cam.x = CX; cam.y = CY;
      orthoSpan = distTarget = SPAN;
      if (typeof clampCam === 'function') clampCam();
      if (typeof camUpdateMatrices === 'function') camUpdateMatrices();
      perfScale = CFG.perfScale;
      S.armyPlaced = army(CFG.units);
      for (let f = 0; f < CFG.warm; f++) { sim(DT); if (f % CFG.boomEvery === 0) boom(CFG.boomN, SPAN); render(DT); }
      syncGPU();
      S.env = { orthoSpan, buffer: [cv.width, cv.height],
                aoTarget: [typeof aoW !== 'undefined' ? aoW : null, typeof aoH !== 'undefined' ? aoH : null],
                perfScale, quality: qualityKey(), DPR: +DPR.toFixed(3),
                pxPerWorldUnit: +(cv.height / orthoSpan).toFixed(3) };

      /* frozen-pair image control */
      const shot = () => {
        const w = Math.min(256, cv.width), h = Math.min(256, cv.height);
        const buf = new Uint8Array(w * h * 4);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.readPixels(((cv.width - w) >> 1), ((cv.height - h) >> 1), w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
        return buf;
      };
      const diff = (a, b) => { let s = 0; for (let i = 0; i < a.length; i += 4) s += Math.abs(a[i] - b[i]) + Math.abs(a[i+1] - b[i+1]) + Math.abs(a[i+2] - b[i+2]); return s / (a.length / 4 * 3); };
      boom(CFG.boomN * 2, SPAN); sim(DT); render(DT); syncGPU();
      M.mode = 'on'; render(0); const i1 = shot();
      M.mode = 'on'; render(0); const i2 = shot();
      M.mode = 'skipAll'; render(0); const i3 = shot();
      M.mode = 'x8'; render(0); const i4 = shot();
      M.mode = 'on';
      S.imageControl = {
        noiseFloor_onVsOn: +diff(i1, i2).toFixed(4),
        onVsSkipAll: +diff(i1, i3).toFixed(4),
        onVsX8: +diff(i1, i4).toFixed(4)
      };
      S.imageControl.passed = S.imageControl.onVsSkipAll > Math.max(0.5, S.imageControl.noiseFloor_onVsOn * 8);
      if (!S.imageControl.passed) R.fail.push('span ' + SPAN + ': skip did not change the image');

      /* timed loop: null control + skip control + gain control */
      const order = ['on', 'onB', 'skipAll', 'x8'];
      const frames = [];
      for (let f = 0; f < CFG.frames; f++) {
        sim(DT);
        if (f % CFG.boomEvery === 0) boom(CFG.boomN, SPAN);
        const label = order[f % order.length];
        M.mode = (label === 'onB') ? 'on' : label;      // onB IS on. same work, different name.
        M.rec = {};
        const t0 = performance.now();
        render(DT);
        const t1 = performance.now();
        syncGPU();
        const t2 = performance.now();
        frames.push({ mode: label, total: t2 - t0, cpu: t1 - t0,
          add: M.rec.add | 0, alpha: M.rec.alpha | 0, icon: M.rec.icon | 0,
          draws: typeof drawCalls === 'number' ? drawCalls : -1,
          units: (teamCount[0] | 0) + (teamCount[1] | 0) + (teamCount[2] | 0) });
        M.rec = null;
        if (f % 80 === 79) army(CFG.units);
      }
      M.mode = 'on';
      const by = {};
      for (const m of order) {
        const F = frames.filter(f => f.mode === m).map(f => f.total);
        by[m] = { n: F.length, p50: +pct(F, 0.5).toFixed(3), p25: +pct(F, 0.25).toFixed(3),
                  p75: +pct(F, 0.75).toFixed(3), mean: +mean(F).toFixed(3) };
      }
      S.timingMs = by;
      S.deltasMs = {
        nullControl_onB_minus_on: +(by.onB.p50 - by.on.p50).toFixed(3),
        billboardsCost_on_minus_skipAll: +(by.on.p50 - by.skipAll.p50).toFixed(3),
        gain_x8_minus_on: +(by.x8.p50 - by.on.p50).toFixed(3)
      };
      /* the additive batch is drawn 8x in x8, so 7 extra copies. */
      S.deltasMs.impliedCostOfOneAdditiveFlush = +(S.deltasMs.gain_x8_minus_on / 7).toFixed(3);
      S.controls = {
        nullVsSignal: Math.abs(S.deltasMs.nullControl_onB_minus_on) < Math.abs(S.deltasMs.billboardsCost_on_minus_skipAll) * 0.5
          ? 'PASS (noise floor is well under the measured billboard cost)'
          : 'FAIL (the rig cannot resolve the billboard cost from its own noise)',
        gainVisible: S.deltasMs.gain_x8_minus_on > Math.max(1.0, Math.abs(S.deltasMs.nullControl_onB_minus_on) * 4)
          ? 'PASS (8x the billboard fill moved the frame clock)'
          : 'FAIL (8x the fill changed nothing - the rig is not measuring fill rate)'
      };
      const all = frames.map(f => f.add), allA = frames.map(f => f.alpha);
      S.instances = {
        add: { p50: pct(all, 0.5), p90: pct(all, 0.9), max: Math.max(...all), mean: +mean(all).toFixed(1) },
        alpha: { p50: pct(allA, 0.5), p90: pct(allA, 0.9), max: Math.max(...allA) },
        icon: { p50: pct(frames.map(f => f.icon), 0.5), max: Math.max(...frames.map(f => f.icon)) },
        totalDrawCalls_p50: pct(frames.map(f => f.draws), 0.5),
        units_p50: pct(frames.map(f => f.units), 0.5)
      };

      /* measured overdraw at this zoom */
      if (pC && pA) {
        M.viewport = 'want'; M.rec = {};
        sim(DT); boom(CFG.boomN, SPAN); render(DT);
        const rec = Object.assign({}, M.rec); M.rec = null;
        const VP = Array.isArray(M.viewport) ? M.viewport : [0, 0, cv.width, cv.height];
        M.viewport = null;
        odSize(VP[2] | 0, VP[3] | 0);
        const nAdd = rec.add | 0, nAlpha = rec.alpha | 0;
        const g1 = countPass(pC, [[bbAdd, nAdd]]);
        const g2 = countPass(pC, [[bbAdd, nAdd], [bbAlpha, nAlpha]]);
        const a1 = countPass(pA, [[bbAdd, nAdd]]);
        const pxN = odW * odH;
        S.overdraw = {
          rasterTarget: [odW, odH], rasterPixels: pxN,
          sample: { addInstances: nAdd, alphaInstances: nAlpha },
          additive: {
            fragments: g1.fragments,
            xWholeTarget: +(g1.fragments / pxN).toFixed(2),
            coveredFraction: +(g1.coveredPixels / pxN).toFixed(3),
            xWhereCovered: g1.coveredPixels ? +(g1.fragments / g1.coveredPixels).toFixed(2) : 0,
            peakLayers: g1.peakLayers, saturated: g1.saturatedPixels
          },
          additiveAfterAlphaDiscard: { fragments: a1.fragments, xWholeTarget: +(a1.fragments / pxN).toFixed(2) },
          additivePlusAlphaBatch: {
            fragments: g2.fragments, xWholeTarget: +(g2.fragments / pxN).toFixed(2),
            peakLayers: g2.peakLayers, saturated: g2.saturatedPixels
          }
        };
      }
      R.spans[String(SPAN)] = S;
    }

    /* ===================================================================== */
    /*  CALL-SITE CENSUS (fixed stack walk)                                  */
    /* ===================================================================== */
    orthoSpan = distTarget = CFG.spans[0];
    if (typeof camUpdateMatrices === 'function') camUpdateMatrices();
    resetWorld(); cam.x = CX; cam.y = CY; perfScale = CFG.perfScale;
    army(CFG.units);
    for (let f = 0; f < 40; f++) { sim(DT); if (f % CFG.boomEvery === 0) boom(CFG.boomN, CFG.spans[0]); render(DT); }
    const tally = {}; let calls = 0, accepted = 0;
    const oAdd = BBBatch.prototype.add, oRect = BBBatch.prototype.addOrientedRect;
    /* Pass 1 stopped on the runtime wrapper because it only skipped frames that
       named billboard.js. The wrapper is an <anonymous> eval frame, so skip
       those too and keep walking until a real repo file appears. */
    const site = () => {
      const L = ((new Error()).stack || '').split('\n');
      for (let i = 1; i < L.length; i++) {
        const s = L[i].trim();
        if (!/\.js:\d+/.test(s)) continue;
        if (/billboard\.js/.test(s)) continue;
        if (/<anonymous>/.test(s)) continue;
        return s.replace(/^at\s+/, '').replace(/https?:\/\/[^/]+\//, '').slice(0, 95);
      }
      return 'UNRESOLVED';
    };
    BBBatch.prototype.add = function () { calls++; const k = nameOf(this) + '  ' + site(); const b = this.n; const r = oAdd.apply(this, arguments); if (this.n > b) { accepted++; tally[k] = (tally[k] | 0) + 1; } return r; };
    BBBatch.prototype.addOrientedRect = function () { calls++; const k = nameOf(this) + '  ' + site(); const b = this.n; const r = oRect.apply(this, arguments); if (this.n > b) { accepted++; tally[k] = (tally[k] | 0) + 1; } return r; };
    sim(DT); boom(CFG.boomN, CFG.spans[0]); render(DT);
    BBBatch.prototype.add = oAdd; BBBatch.prototype.addOrientedRect = oRect;
    R.callSites = {
      attempted: calls, accepted, droppedByCullGate: calls - accepted,
      dropRate: calls ? +((calls - accepted) / calls).toFixed(3) : null,
      top: Object.entries(tally).sort((a, b) => b[1] - a[1]).slice(0, 22)
    };

    /* ===================================================================== */
    /*  ONE EXPLOSION IN AN EMPTY WORLD                                      */
    /* ===================================================================== */
    resetWorld();
    cam.x = CX; cam.y = CY; orthoSpan = distTarget = CFG.spans[0];
    if (typeof camUpdateMatrices === 'function') camUpdateMatrices();
    perfScale = CFG.perfScale;
    for (let f = 0; f < 40; f++) { sim(DT); render(DT); }
    M.rec = {}; sim(DT); render(DT); const base = Object.assign({}, M.rec);
    const single = { baselineEmptyWorld: { add: base.add | 0, alpha: base.alpha | 0 }, sizes: {} };
    for (const SZ of [9, 18, 30, 39]) {
      for (let f = 0; f < 70; f++) { sim(DT); render(DT); }        // drain
      M.rec = {}; sim(DT); render(DT); const q = Object.assign({}, M.rec);
      spawnExplosion(CX, CY, SZ, 0);
      const tr = [];
      for (let f = 0; f < 40; f++) { M.rec = {}; sim(DT); render(DT); tr.push([M.rec.add | 0, M.rec.alpha | 0]); }
      M.rec = null;
      single.sizes[SZ] = {
        quiescent: { add: q.add | 0, alpha: q.alpha | 0 },
        peakAdditiveQuads: Math.max(...tr.map(t => t[0])) - (q.add | 0),
        peakAlphaQuads: Math.max(...tr.map(t => t[1])) - (q.alpha | 0),
        additivePerFrame: tr.map(t => t[0] - (q.add | 0)),
        framesAboveHalfPeak: tr.filter(t => (t[0] - (q.add | 0)) > (Math.max(...tr.map(x => x[0])) - (q.add | 0)) / 2).length
      };
    }
    R.singleExplosionEmptyWorld = single;

    /* ---- what the frame is actually spending its time on ----------------- */
    /* skipAll already tells us the scene minus billboards. Add one more datum:
       the same scene with the whole FX field drained, so the reader can see how
       much of the 33 ms is terrain + units + post rather than effects. */
    resetWorld(); cam.x = CX; cam.y = CY; orthoSpan = distTarget = CFG.spans[0];
    if (typeof camUpdateMatrices === 'function') camUpdateMatrices();
    perfScale = CFG.perfScale; army(CFG.units);
    for (let f = 0; f < 30; f++) { sim(DT); render(DT); }
    const quietT = [];
    for (let f = 0; f < 60; f++) { sim(DT); const t0 = performance.now(); render(DT); syncGPU(); quietT.push(performance.now() - t0); }
    R.sceneWithoutHeavyFx = { p50Ms: +pct(quietT, 0.5).toFixed(3), note: 'same army, no injected explosions - shows how much of the frame is terrain+units+AO+bloom' };

    if (odFB) { gl.deleteFramebuffer(odFB); gl.deleteTexture(odTex); }
    if (pC) gl.deleteProgram(pC); if (pA) gl.deleteProgram(pA);
    BBBatch.prototype.flush = origFlush;
    window.requestAnimationFrame = _raf;
    return R;
  }, { perfScale: 0.4125, spans: [520, 420, 1100], units: 160, frames: 240, warm: 50, boomEvery: 4, boomN: 4 },
     { timeout: 900000 });

  say(JSON.stringify(RESULT, null, 2));
  say('page errors: ' + (errs.length ? errs.slice(0, 5).join(' | ') : 'none'));
  RESULT.gpu = gpu; RESULT.pageErrors = errs.slice(0, 8);
  await writeFile(join(outDir, 'pass2.json'), JSON.stringify(RESULT, null, 2), 'utf8');
} catch (e) {
  say('FATAL ' + (e && e.stack ? e.stack : e));
} finally {
  await writeFile(join(outDir, 'log2.txt'), log.join('\n'), 'utf8');
  await closePwBrowser();
  server.close();
}
console.log('output: ' + outDir);
