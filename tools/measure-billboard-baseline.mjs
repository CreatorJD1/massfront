#!/usr/bin/env node
/* BILLBOARD PERFORMANCE BASELINE — the number a raymarched volumetric system
   must beat.  READ-ONLY: this script never edits a source file; every hook is
   installed at runtime inside the page.

   Why this file exists
   --------------------
   The proposal on the table is to replace hundreds of overlapping ADDITIVE
   BILLBOARD quads with a few raymarched proxy volumes, on the thesis that this
   REDUCES fill rate and draw calls.  Before writing a raymarcher you have to
   know what the billboards actually cost, at the settings the owner's phone
   actually runs:

     quality  = medium            (the mobile default)
     perfBand = 0.55  (28-42 fps)
     GFX.particles = 0.75
     perfScale = 0.55 * 0.75 = 0.4125     <- the single most common effect gate
                                             in this codebase is perfScale>0.48,
                                             i.e. ABOVE the device.
     DPR cap  = 1.18 on a >860px panel -> ~0.53 Mpx colour buffer.

   Reused from tools/capture-stagec-fx.mjs: the auth-gate boot, the repo-root
   static server, real Chrome on d3d11, and the perfScale pin.

   What it measures
   ----------------
     1. instances + draw calls actually issued per frame, per batch;
     2. frame time with the billboard passes ON vs SKIPPED vs DOUBLED
        (skip is the control: if suppressing the draws changes nothing, the
        instrumentation is not measuring them);
     3. MEASURED overdraw - the billboard instance buffers are replayed through
        a counting shader into a scratch RGBA8 target with additive blending, so
        the result is real rasterised fragments, not an estimate;
     4. a call-site census (which .add() sites produce the quads).

   Controls that can fail, and how you know they failed
   ----------------------------------------------------
     C1  frozen-pair image check: render the same frozen world ON, ON, then
         SKIPPED.  d(ON,ON) is the noise floor (the animation clock is
         performance.now(), so two renders are never bit-identical).
         d(ON,SKIP) must be far larger.  If it is not, the "skip" did not
         actually suppress any drawing and every timing below is meaningless.
     C2  symmetry: DOUBLE should cost about as much MORE than ON as SKIP costs
         LESS.  A one-sided delta means something other than the billboards
         moved.
     C3  a run that reports 0 billboard instances is a broken fight setup, not
         a cheap renderer.  The script fails loudly on that.

   Usage:  node tools/measure-billboard-baseline.mjs
   Output: .tmp/bb-baseline/{log.txt,baseline.json,frame-*.png}
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
    /* A phone, not a desktop window.  MF_MOBILE_GPU is a const evaluated when
       gl.js loads, so the Android UA has to be in place BEFORE navigation or
       the DPR cap takes the desktop branch and the colour buffer is ~2x the
       device's. */
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
  const software = /swiftshader|llvmpipe|lavapipe/i.test(String(gpu));
  if (software) say('*** SOFTWARE RASTERISER - timings are NOT representative ***');

  await page.waitForFunction(() => typeof spawnUnit === 'function' && typeof render === 'function' &&
    typeof resetWorld === 'function' && typeof spawnExplosion === 'function', { timeout: 120000 });
  await page.waitForTimeout(400);
  await page.evaluate(boot);
  await page.waitForFunction(() => typeof heightF !== 'undefined' && heightF &&
    typeof terrainTex !== 'undefined' && terrainTex, { timeout: 90000 }).catch(() => {});

  /* ===================================================================== */
  /*  Everything below runs in ONE evaluate.  Per-frame round trips to the  */
  /*  driver process add ~1ms of noise each, which is the same order as the */
  /*  effect being measured.                                                */
  /* ===================================================================== */
  RESULT = await page.evaluate(async (CFG) => {
    const R = { cfg: CFG, notes: [], fail: [] };
    const sleep = ms => new Promise(r => setTimeout(r, ms));

    /* ---- 1. stop the game's own frame loop ------------------------------
       frame() re-arms itself at the TOP of its body and recomputes perfScale
       from measured fps every 0.6s.  Left running it would (a) overwrite the
       pinned perfScale and (b) interleave its own render() with ours. */
    const _raf = window.requestAnimationFrame;
    window.requestAnimationFrame = function () { return 0; };
    await sleep(120);                       // let the in-flight frame retire

    /* ---- 2. device settings --------------------------------------------- */
    try { stopAttract(); } catch (e) {}
    attractOn = false; demoMode = false; matchLive = true; fogOn = false;
    running = true; paused = false; gameEnded = false;
    if (typeof META !== 'undefined' && META.settings) {
      META.settings.fog = false;
      META.settings.dayNight = false;
      META.settings.quality = 'medium';
      META.settings.shake = false;          // a shaking camera re-rolls coverage every frame
      META.settings.gfxOver = {};
    }
    if (typeof applySettings === 'function') applySettings();
    /* Batch capacities are chosen inside initBillboards() from the quality key,
       and the game booted before we switched to medium.  Re-run it so the caps
       and the cull thresholds both describe the phone. */
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

    /* ---- 3. find open, non-civic ground and stage a fight there ----------
       cityGroundAt()>=1 caps explosion size to 13 and strips the ember and
       debris tiers, so a fight staged over a city measures a different, much
       cheaper effect than the one under test. */
    let P = null;
    for (let r = 200; r < MAP * 0.45 && !P; r += 90) {
      for (let a = 0; a < 16; a++) {
        const x = MAP * 0.5 + Math.cos(a * 0.3927) * r, y = MAP * 0.5 + Math.sin(a * 0.3927) * r;
        if (x < 300 || y < 300 || x > MAP - 300 || y > MAP - 300) continue;
        const civic = typeof cityGroundAt === 'function' && cityGroundAt(x, y) >= 1;
        if (!civic && isWalkable(x, y)) { P = [x, y]; break; }
      }
    }
    if (!P) { R.fail.push('no open non-civic ground found'); P = [MAP * 0.5, MAP * 0.5]; }
    const CX = P[0], CY = P[1];
    R.site = { x: Math.round(CX), y: Math.round(CY),
               civic: typeof cityGroundAt === 'function' ? cityGroundAt(CX, CY) : null };

    cam.x = CX; cam.y = CY; camFollow = -1;
    camYaw = yawTarget = 0.22; camPitch = pitchTarget = 1.05;
    orthoSpan = distTarget = CFG.span;
    if (typeof clampCam === 'function') clampCam();
    if (typeof camUpdateMatrices === 'function') camUpdateMatrices();

    const idx = n => TYPES.findIndex(T => T.name === n);
    const pool = ['Rhino','Striker','Longbow','Lancer'].map(idx).filter(i => i >= 0);
    if (!pool.length) R.fail.push('no unit types resolved');
    const west = [], east = [];
    const put = (ty, team, x, y, bag) => {
      const i = spawnUnit(ty, team, x, y);
      if (i >= 0) { ucool[i] = 0; umarch[i] = 0; ustate[i] = 0; bag.push(i); }
      return i;
    };
    const HALF = CFG.units >> 1;
    for (let k = 0; k < HALF; k++) {
      const ty = pool[k % pool.length];
      const row = (k / 9) | 0, col = k % 9;
      put(ty, 0, CX - 90 - row * 20, CY - 96 + col * 24, west);
      put(ty, 1, CX + 90 + row * 20, CY - 96 + col * 24, east);
    }
    const aim = (i, j) => {
      if (i < 0 || j < 0) return;
      uang[i] = uturr[i] = Math.atan2(uy[j] - uy[i], ux[j] - ux[i]) + Math.PI / 2;
      utgt[i] = j; utgtg[i] = ugen[j]; ucool[i] = 0;
    };
    for (let k = 0; k < west.length; k++) aim(west[k], east[k % Math.max(1, east.length)]);
    for (let k = 0; k < east.length; k++) aim(east[k], west[k % Math.max(1, west.length)]);
    R.army = { west: west.length, east: east.length };

    /* ---- 4. the frame driver -------------------------------------------- */
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
    /* A sustained heavy fight: a simultaneous cluster of blasts every Nth
       frame, on top of whatever the units kill.  Sizes stay under the sz>=40
       superweapon gate (that path RETURNS into superDetonation and is a
       different effect), and above sz>=16 so the ember + debris tiers run. */
    const boom = (n) => {
      for (let k = 0; k < n; k++) {
        const a = Math.random() * Math.PI * 2, r = Math.random() * CFG.span * 0.32;
        const x = CX + Math.cos(a) * r, y = CY + Math.sin(a) * r;
        const sz = 9 + Math.random() * 25;
        try { spawnExplosion(x, y, sz, k & 1); } catch (e) {}
      }
    };

    /* ---- 5. instrumentation --------------------------------------------- */
    const M = {
      mode: 'on',            // on | skipAll | skipAdd | doubleAdd
      rec: null,             // per-frame batch record, or null
      census: null,          // per-instance coverage census, or null
      viewport: null
    };
    const origFlush = BBBatch.prototype.flush;
    const nameOf = (b) => b === bbAdd ? 'add' : (b === bbAlpha ? 'alpha' : (typeof bbIcon !== 'undefined' && b === bbIcon ? 'icon' : 'other'));

    BBBatch.prototype.flush = function (g) {
      const n = this.n, tag = nameOf(this);
      if (M.rec) M.rec[tag] = (M.rec[tag] || 0) + n;
      if (M.viewport === 'want' && n) M.viewport = Array.from(g.getParameter(g.VIEWPORT));
      if (M.census && n) {
        /* Analytic screen footprint.  The VS expands in CLIP space:
             ndc.xy += corner*size*(aspect,1) * uScale,  uScale=(2/(span*asp), 2/span)
           so after the /w and the *0.5*buffer, one world unit is
           bufH/orthoSpan pixels on BOTH axes.  Rotation preserves area. */
        const kpx = M.census.bufH / Math.max(1, orthoSpan);
        const d = this.data;
        let area = 0, alphaW = 0, big = 0;
        for (let i = 0; i < n; i++) {
          const o = i * 14;
          const hpx = d[o + 3] * kpx, wpx = hpx * d[o + 13];
          const A = wpx * hpx;
          area += A; alphaW += A * d[o + 8];
          if (hpx > M.census.bufH * 0.25) big++;
        }
        const c = M.census[tag] || (M.census[tag] = { n: 0, area: 0, alphaArea: 0, big: 0 });
        c.n += n; c.area += area; c.alphaArea += alphaW; c.big += big;
      }
      if (M.mode === 'skipAll' || (M.mode === 'skipAdd' && tag === 'add')) { this.n = 0; return; }
      origFlush.call(this, g);
      if (M.mode === 'doubleAdd' && tag === 'add' && n) { this.n = n; origFlush.call(this, g); }
    };

    /* one-pixel readback = a hard CPU<->GPU sync, so the wall clock we take
       afterwards contains the GPU work rather than just the command build. */
    const px1 = new Uint8Array(4);
    const syncGPU = () => {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px1);
    };

    /* ---- 6. warm up ------------------------------------------------------ */
    for (let f = 0; f < CFG.warm; f++) { sim(DT); if (f % CFG.boomEvery === 0) boom(CFG.boomN); render(DT); }
    syncGPU();

    R.env = {
      gpuBufferW: cv.width, gpuBufferH: cv.height, megapixels: +(cv.width * cv.height / 1e6).toFixed(3),
      DPR: typeof DPR === 'number' ? +DPR.toFixed(3) : null,
      VW, VH, orthoSpan, camPitch: +camPitch.toFixed(3),
      quality: typeof qualityKey === 'function' ? qualityKey() : null,
      perfScale, particles: (typeof GFX !== 'undefined' ? GFX.particles : null),
      bbAddCap: bbAdd.cap, bbAlphaCap: bbAlpha.cap,
      bbIconCap: (typeof bbIcon !== 'undefined' && bbIcon) ? bbIcon.cap : null,
      aoW: typeof aoW !== 'undefined' ? aoW : null, aoH: typeof aoH !== 'undefined' ? aoH : null
    };

    /* ---- 7. CONTROL C1: frozen-pair image check --------------------------
       No sim tick between these, so the only thing that changes is the draw.
       The animation clock inside render() is performance.now(), so ON vs ON is
       not bit-identical; that difference IS the noise floor and is reported. */
    const shot = () => {
      const w = Math.min(256, cv.width), h = Math.min(256, cv.height);
      const buf = new Uint8Array(w * h * 4);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.readPixels(((cv.width - w) >> 1), ((cv.height - h) >> 1), w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
      return buf;
    };
    const diff = (a, b) => { let s = 0; for (let i = 0; i < a.length; i += 4) s += Math.abs(a[i] - b[i]) + Math.abs(a[i+1] - b[i+1]) + Math.abs(a[i+2] - b[i+2]); return s / (a.length / 4 * 3); };
    boom(CFG.boomN * 2);                    // guarantee live billboards to remove
    sim(DT); render(DT); syncGPU();
    M.mode = 'on';    render(0); const imgA1 = shot();
    M.mode = 'on';    render(0); const imgA2 = shot();
    M.mode = 'skipAll'; render(0); const imgB = shot();
    M.mode = 'skipAdd'; render(0); const imgC = shot();
    M.mode = 'on';
    R.control = {
      noiseFloor_onVsOn: +diff(imgA1, imgA2).toFixed(4),
      delta_onVsSkipAll: +diff(imgA1, imgB).toFixed(4),
      delta_onVsSkipAdd: +diff(imgA1, imgC).toFixed(4)
    };
    R.control.passed = R.control.delta_onVsSkipAll > Math.max(0.5, R.control.noiseFloor_onVsOn * 8);
    if (!R.control.passed) R.fail.push('C1 FAILED: suppressing the billboard flushes barely changed the image - the skip is not skipping real work');

    /* ---- 8. timed A/B/C/D loop ------------------------------------------ */
    const order = ['on', 'skipAll', 'on', 'skipAdd', 'on', 'doubleAdd'];
    const frames = [];
    for (let f = 0; f < CFG.frames; f++) {
      sim(DT);
      if (f % CFG.boomEvery === 0) boom(CFG.boomN);
      M.mode = order[f % order.length];
      M.rec = {};
      const t0 = performance.now();
      render(DT);
      const t1 = performance.now();
      syncGPU();
      const t2 = performance.now();
      frames.push({
        mode: M.mode, cpu: t1 - t0, total: t2 - t0,
        add: M.rec.add | 0, alpha: M.rec.alpha | 0, icon: M.rec.icon | 0,
        draws: typeof drawCalls === 'number' ? drawCalls : -1,
        tris: typeof triCount === 'number' ? triCount : -1,
        gpfx: typeof gpfxDrawN === 'number' ? gpfxDrawN : -1,
        live: (typeof fCount === 'number' ? fCount : -1),
        units: (teamCount[0] | 0) + (teamCount[1] | 0) + (teamCount[2] | 0)
      });
      M.rec = null;
      /* keep the fight alive for the whole window */
      if (f % 60 === 59) {
        for (let k = 0; k < HALF; k++) {
          const ty = pool[k % pool.length];
          const row = (k / 9) | 0, col = k % 9;
          put(ty, 0, CX - 90 - row * 20, CY - 96 + col * 24, west);
          put(ty, 1, CX + 90 + row * 20, CY - 96 + col * 24, east);
        }
      }
    }
    M.mode = 'on';

    const med = a => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y); return s[s.length >> 1]; };
    const mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
    const by = {};
    for (const m of order.filter((v, i, s) => s.indexOf(v) === i)) {
      const F = frames.filter(f => f.mode === m);
      by[m] = {
        frames: F.length,
        medianTotalMs: +med(F.map(f => f.total)).toFixed(3),
        meanTotalMs: +mean(F.map(f => f.total)).toFixed(3),
        medianCpuMs: +med(F.map(f => f.cpu)).toFixed(3),
        medianAdd: med(F.map(f => f.add)), medianAlpha: med(F.map(f => f.alpha)),
        medianIcon: med(F.map(f => f.icon)), medianDraws: med(F.map(f => f.draws)),
        medianTris: med(F.map(f => f.tris))
      };
    }
    R.timing = by;
    R.timing.deltas = {
      onMinusSkipAll_ms: +(by.on.medianTotalMs - by.skipAll.medianTotalMs).toFixed(3),
      onMinusSkipAdd_ms: +(by.on.medianTotalMs - by.skipAdd.medianTotalMs).toFixed(3),
      doubleAddMinusOn_ms: +(by.doubleAdd.medianTotalMs - by.on.medianTotalMs).toFixed(3)
    };
    /* CONTROL C2: doubling the additive batch should cost about what removing
       it saves.  Compare against the skipAdd delta, not skipAll. */
    const dOff = R.timing.deltas.onMinusSkipAdd_ms, dOn = R.timing.deltas.doubleAddMinusOn_ms;
    R.timing.symmetry = { skipAddSaves: dOff, doubleAddCosts: dOn,
      ratio: dOff !== 0 ? +(dOn / dOff).toFixed(2) : null };

    /* population stats over the whole window */
    const allAdd = frames.map(f => f.add), allAlpha = frames.map(f => f.alpha);
    R.instances = {
      add:   { median: med(allAdd),   mean: +mean(allAdd).toFixed(1),   max: Math.max(...allAdd) },
      alpha: { median: med(allAlpha), mean: +mean(allAlpha).toFixed(1), max: Math.max(...allAlpha) },
      icon:  { median: med(frames.map(f => f.icon)), max: Math.max(...frames.map(f => f.icon)) },
      totalDrawCallsMedian: med(frames.map(f => f.draws)),
      gpfxPointsMedian: med(frames.map(f => f.gpfx)),
      cpuParticlesLiveMedian: med(frames.map(f => f.live)),
      unitsMedian: med(frames.map(f => f.units))
    };
    if ((R.instances.add.median | 0) < 20) R.fail.push('C3 FAILED: fewer than 20 additive billboards per frame - the fight did not happen, this is not a heavy-fight baseline');

    /* ---- 9. draw-call accounting ---------------------------------------- */
    /* flush() is ONE drawElementsInstanced for the whole batch, so the
       billboard system's draw-call count is the number of FLUSHES, not the
       number of quads.  Count them explicitly so nobody has to trust the
       reading of the source. */
    let flushes = 0;
    const countingFlush = BBBatch.prototype.flush;
    BBBatch.prototype.flush = function (g) { if (this.n) flushes++; return countingFlush.call(this, g); };
    sim(DT); boom(CFG.boomN); render(DT); syncGPU();
    BBBatch.prototype.flush = countingFlush;
    R.billboardDrawCallsPerFrame = flushes;

    /* ---- 10. MEASURED overdraw ------------------------------------------
       Replay the instance buffers the frame just drew through a counting
       shader: same VS (so the same clip-space expansion, same culling), FS
       writes 1/255 into R, blend ONE/ONE, into a scratch RGBA8 the size of the
       viewport the real flush used.  Summing R over the target gives the exact
       number of rasterised billboard fragments.  Two variants:
         geometric  - every fragment the rasteriser produces (the fill-rate and
                      texture-fetch cost; discard does not save this)
         surviving  - fragments that pass the same alpha discard the real
                      FSBB does (the ROP/blend writes) */
    M.viewport = 'want';
    M.rec = {}; sim(DT); boom(CFG.boomN); render(DT); const vpRec = Object.assign({}, M.rec); M.rec = null;
    const VP = Array.isArray(M.viewport) ? M.viewport : [0, 0, cv.width, cv.height];
    M.viewport = null;
    const OW = VP[2] | 0, OH = VP[3] | 0;

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

    const pC = mkProg(VSBB, FS_COUNT, 'bbCount');
    const pA = mkProg(VSBB, FS_ALIVE, 'bbAlive');
    if (!pC || !pA) {
      R.fail.push('overdraw shaders failed to build: ' + (typeof GL_PROG_ERRORS !== 'undefined' ? GL_PROG_ERRORS.slice(-3).join(' | ') : '?'));
    } else {
      const odTex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, odTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, OW, OH, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      const odFB = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, odFB);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, odTex, 0);
      const fbOk = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      if (!fbOk) R.fail.push('overdraw FBO incomplete');

      const readBuf = new Uint8Array(OW * OH * 4);
      const countPass = (prog, batches) => {
        gl.bindFramebuffer(gl.FRAMEBUFFER, odFB);
        gl.viewport(0, 0, OW, OH);
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
        for (const [b, n] of batches) {
          if (!n) continue;
          gl.bindVertexArray(b.vao);
          gl.drawElementsInstanced(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0, n);
        }
        gl.bindVertexArray(null);
        gl.readPixels(0, 0, OW, OH, gl.RGBA, gl.UNSIGNED_BYTE, readBuf);
        let frags = 0, covered = 0, sat = 0, peak = 0;
        for (let i = 0; i < readBuf.length; i += 4) {
          const v = readBuf[i];
          if (v) { frags += v; covered++; if (v > peak) peak = v; if (v === 255) sat++; }
        }
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        return { fragments: frags, coveredPixels: covered, peakLayers: peak, saturatedPixels: sat };
      };

      const nAdd = vpRec.add | 0, nAlpha = vpRec.alpha | 0;
      const geoAdd = countPass(pC, [[bbAdd, nAdd]]);
      const geoAll = countPass(pC, [[bbAdd, nAdd], [bbAlpha, nAlpha]]);
      const aliveAdd = countPass(pA, [[bbAdd, nAdd]]);
      const px = OW * OH;
      R.overdraw = {
        method: 'instance buffers replayed through a 1/255-per-fragment counting shader (same VS as the real billboard program) into a scratch RGBA8 at the exact flush viewport; R channel summed. saturatedPixels>0 means the count is a floor, not exact.',
        viewport: [OW, OH], viewportPixels: px,
        sampleFrame: { addInstances: nAdd, alphaInstances: nAlpha },
        additiveOnly: {
          fragments: geoAdd.fragments,
          overdrawOverWholeScreen: +(geoAdd.fragments / px).toFixed(3),
          coveredPixels: geoAdd.coveredPixels,
          coveredFraction: +(geoAdd.coveredPixels / px).toFixed(3),
          overdrawWhereCovered: geoAdd.coveredPixels ? +(geoAdd.fragments / geoAdd.coveredPixels).toFixed(2) : 0,
          peakLayersOnOnePixel: geoAdd.peakLayers, saturatedPixels: geoAdd.saturatedPixels
        },
        additiveSurvivingAlphaDiscard: {
          fragments: aliveAdd.fragments,
          overdrawOverWholeScreen: +(aliveAdd.fragments / px).toFixed(3),
          fractionOfRasterised: geoAdd.fragments ? +(aliveAdd.fragments / geoAdd.fragments).toFixed(3) : null
        },
        additivePlusAlpha: {
          fragments: geoAll.fragments,
          overdrawOverWholeScreen: +(geoAll.fragments / px).toFixed(3),
          coveredFraction: +(geoAll.coveredPixels / px).toFixed(3),
          peakLayersOnOnePixel: geoAll.peakLayers, saturatedPixels: geoAll.saturatedPixels
        }
      };
      gl.deleteFramebuffer(odFB); gl.deleteTexture(odTex);
      gl.deleteProgram(pC); gl.deleteProgram(pA);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.enable(gl.DEPTH_TEST); gl.enable(gl.CULL_FACE); gl.depthMask(true);
    }

    /* ---- 11. analytic census + call-site attribution --------------------- */
    M.census = { bufH: cv.height };
    sim(DT); boom(CFG.boomN); render(DT); syncGPU();
    const cen = M.census; M.census = null;
    R.census = {};
    for (const k of ['add', 'alpha', 'icon']) if (cen[k]) R.census[k] = {
      instances: cen[k].n,
      analyticCoverageX: +(cen[k].area / (cv.width * cv.height)).toFixed(3),
      alphaWeightedCoverageX: +(cen[k].alphaArea / (cv.width * cv.height)).toFixed(3),
      quadsWiderThanQuarterScreen: cen[k].big
    };

    /* which call sites produce them.  Error().stack per add() is far too slow
       to leave in a timed frame, so this is its own untimed frame. */
    const tally = {}; let calls = 0, accepted = 0;
    const oAdd = BBBatch.prototype.add, oRect = BBBatch.prototype.addOrientedRect;
    const stackKey = () => {
      const st = (new Error()).stack || '';
      const L = st.split('\n');
      for (let i = 2; i < L.length; i++) {
        const s = L[i].trim();
        if (/billboard\.js/.test(s)) continue;
        return s.replace(/^at\s+/, '').replace(/https?:\/\/[^/]+\//, '').slice(0, 90);
      }
      return '?';
    };
    BBBatch.prototype.add = function () {
      calls++; const k = nameOf(this) + ' <- ' + stackKey();
      const before = this.n; const r = oAdd.apply(this, arguments);
      if (this.n > before) { accepted++; tally[k] = (tally[k] | 0) + 1; }
      return r;
    };
    BBBatch.prototype.addOrientedRect = function () {
      calls++; const k = nameOf(this) + ' <- ' + stackKey();
      const before = this.n; const r = oRect.apply(this, arguments);
      if (this.n > before) { accepted++; tally[k] = (tally[k] | 0) + 1; }
      return r;
    };
    sim(DT); boom(CFG.boomN); render(DT);
    BBBatch.prototype.add = oAdd; BBBatch.prototype.addOrientedRect = oRect;
    R.callSites = {
      addCallsAttempted: calls, addCallsAccepted: accepted,
      droppedByCullGate: calls - accepted,
      dropRate: calls ? +((calls - accepted) / calls).toFixed(3) : null,
      top: Object.entries(tally).sort((a, b) => b[1] - a[1]).slice(0, 18)
    };

    /* ---- 12. single-explosion cost -------------------------------------- */
    /* How many quads does ONE explosion own?  Quiesce, snapshot, detonate,
       snapshot again a few frames in. */
    for (let f = 0; f < 90; f++) { sim(DT); render(DT); }     // let the field drain
    M.rec = {}; sim(DT); render(DT); const quiet = Object.assign({}, M.rec);
    spawnExplosion(CX, CY, 30, 0);
    const trace = [];
    for (let f = 0; f < 24; f++) {
      M.rec = {}; sim(DT); render(DT);
      trace.push({ f, add: M.rec.add | 0, alpha: M.rec.alpha | 0 });
    }
    M.rec = null;
    R.singleExplosion = {
      quiescent: { add: quiet.add | 0, alpha: quiet.alpha | 0 },
      sz: 30,
      peakAdd: Math.max(...trace.map(t => t.add)) - (quiet.add | 0),
      peakAlpha: Math.max(...trace.map(t => t.alpha)) - (quiet.alpha | 0),
      trace
    };

    BBBatch.prototype.flush = origFlush;
    window.requestAnimationFrame = _raf;
    R.pageOK = true;
    return R;
  }, {
    perfScale: 0.4125, span: 520, units: 160,
    frames: 300, warm: 60, boomEvery: 4, boomN: 4
  }, { timeout: 600000 });

  say('');
  say(JSON.stringify(RESULT, null, 2));
  await page.screenshot({ path: join(outDir, 'frame-fight.png') });
  say('page errors: ' + (errs.length ? errs.slice(0, 5).join(' | ') : 'none'));
  RESULT.gpu = gpu; RESULT.softwareRasteriser = software; RESULT.pageErrors = errs.slice(0, 8);
  await writeFile(join(outDir, 'baseline.json'), JSON.stringify(RESULT, null, 2), 'utf8');
} catch (e) {
  say('FATAL ' + (e && e.stack ? e.stack : e));
} finally {
  await writeFile(join(outDir, 'log.txt'), log.join('\n'), 'utf8');
  await closePwBrowser();
  server.close();
}
console.log('output: ' + outDir);
