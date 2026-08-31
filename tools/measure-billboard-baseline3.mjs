#!/usr/bin/env node
/* BILLBOARD BASELINE, PASS 3 — paired timing. READ-ONLY.

   Pass 2 killed pass 1's headline. Two defects, both mine:

     (a) MODE WAS ALIASED WITH THE EXPLOSION BURST. The mode cycle had period 4
         (pass 1: 6) and the burst injector had period 4, so every burst frame
         landed on the same mode. Mode and scene load were the same variable.
     (b) THE NOISE FLOOR WAS BIGGER THAN THE EFFECT. A null control ('onB',
         byte-identical to 'on') differed by 1.2-1.9 ms, while the claimed
         billboard cost was ~1 ms — and came out NEGATIVE at all three zooms.
         Frame-to-frame scene variance in a live battle is +/-5 ms; 60 samples
         per mode cannot resolve a sub-millisecond effect through that.

   Pass 3 fixes both by never comparing across frames. Each iteration freezes
   the world and renders THE SAME STATE once per mode, so every mode sees an
   identical scene and the per-iteration differences are paired. The mode order
   rotates each iteration so first-slot warm-up bias averages out, and the
   burst injector now fires every iteration so there is no phase to alias with.

   Controls:
     NULL   two slots are both plain 'on'. Their paired difference is the rig's
            true resolution. Any claim smaller than it is not a measurement.
     GAIN   'x32' flushes the additive batch 32 times: 31 extra copies of
            exactly the fill under test, no extra JS, no extra geometry. It
            calibrates ms-per-additive-flush directly, and if it does not move
            the clock the rig cannot see fill rate at all.
     SKIP   'skipAll' / 'skipAdd' suppress the flushes; the frozen-pair image
            check proves they removed real pixels.

   Usage:  node tools/measure-billboard-baseline3.mjs
   Output: .tmp/bb-baseline/pass3.json
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
      META.settings.quality = 'medium'; META.settings.shake = false; META.settings.gfxOver = {};
    }
    if (typeof applySettings === 'function') applySettings();
    if (typeof initBillboards === 'function') initBillboards();
    dayT = 0.20; resetWorld(); playerFaction = 'nova';
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
        if (!(typeof cityGroundAt === 'function' && cityGroundAt(x, y) >= 1) && isWalkable(x, y)) { P = [x, y]; break; }
      }
    }
    if (!P) { R.fail.push('no open non-civic ground'); P = [MAP * 0.5, MAP * 0.5]; }
    const CX = P[0], CY = P[1];
    cam.x = CX; cam.y = CY; camFollow = -1;
    camYaw = yawTarget = 0.22; camPitch = pitchTarget = 1.05;

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
    const boom = (n, span) => { for (let k = 0; k < n; k++) { const a = Math.random() * Math.PI * 2, r = Math.random() * span * 0.32; try { spawnExplosion(CX + Math.cos(a) * r, CY + Math.sin(a) * r, 9 + Math.random() * 25, k & 1); } catch (e) {} } };
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
      return w.length + e.length;
    };

    const M = { mode: 'on', rec: null };
    const origFlush = BBBatch.prototype.flush;
    const nameOf = (b) => b === bbAdd ? 'add' : (b === bbAlpha ? 'alpha' : (typeof bbIcon !== 'undefined' && b === bbIcon ? 'icon' : 'other'));
    BBBatch.prototype.flush = function (g) {
      const n = this.n, tag = nameOf(this);
      if (M.rec) M.rec[tag] = (M.rec[tag] || 0) + n;
      if (M.mode === 'skipAll' || (M.mode === 'skipAdd' && tag === 'add')) { this.n = 0; return; }
      origFlush.call(this, g);
      if (M.mode === 'x32' && tag === 'add' && n) for (let k = 0; k < CFG.gainCopies - 1; k++) { this.n = n; origFlush.call(this, g); }
    };
    const px1 = new Uint8Array(4);
    const syncGPU = () => { gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px1); };
    const pct = (a, p) => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; };
    const mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
    const sd = a => { if (a.length < 2) return null; const m = mean(a); return Math.sqrt(a.reduce((s, v) => s + (v - m) * (v - m), 0) / (a.length - 1)); };

    R.spans = {};
    for (const SPAN of CFG.spans) {
      const S = { span: SPAN };
      resetWorld(); cam.x = CX; cam.y = CY;
      orthoSpan = distTarget = SPAN;
      if (typeof clampCam === 'function') clampCam();
      if (typeof camUpdateMatrices === 'function') camUpdateMatrices();
      perfScale = CFG.perfScale;
      S.armyPlaced = army(CFG.units);
      for (let f = 0; f < CFG.warm; f++) { sim(DT); boom(1, SPAN); render(DT); }
      syncGPU();
      S.env = { orthoSpan, canvas: [cv.width, cv.height], rasterTarget: [aoW, aoH],
                pxPerWorldUnit: +(cv.height / orthoSpan).toFixed(3), perfScale, DPR: +DPR.toFixed(3) };

      /* ---- paired timing --------------------------------------------------
         MODES[j] is rendered from the SAME frozen world in every iteration, so
         the j-th and k-th entries of one iteration differ only by mode. The
         order rotates so slot bias (first render of a frozen state is colder)
         averages away. */
      const MODES = ['on', 'onNull', 'skipAll', 'skipAdd', 'x32'];
      const acc = {}; for (const m of MODES) acc[m] = [];
      const slotAcc = MODES.map(() => []);
      const inst = [];
      for (let it = 0; it < CFG.iters; it++) {
        sim(DT); boom(CFG.boomN, SPAN);
        render(DT); syncGPU();                                   // settle the frozen state
        for (let j = 0; j < MODES.length; j++) {
          const label = MODES[(j + it) % MODES.length];
          M.mode = (label === 'onNull') ? 'on' : label;          // onNull IS on
          M.rec = (label === 'on') ? {} : null;
          const t0 = performance.now();
          render(0);                                             // dtDraw 0: no clock advance
          syncGPU();
          const ms = performance.now() - t0;
          acc[label].push(ms);
          slotAcc[j].push(ms);
          if (label === 'on') inst.push([M.rec.add | 0, M.rec.alpha | 0, M.rec.icon | 0]);
          M.rec = null;
        }
        if (it % 60 === 59) army(CFG.units);
      }
      M.mode = 'on';
      const stat = a => ({ n: a.length, mean: +mean(a).toFixed(3), p50: +pct(a, 0.5).toFixed(3), sd: +sd(a).toFixed(3) });
      S.timingMs = {}; for (const m of MODES) S.timingMs[m] = stat(acc[m]);
      S.slotBiasMs = slotAcc.map(a => +mean(a).toFixed(3));

      const dOf = m => { const d = acc[m].map((v, i) => v - acc.on[i]); return { meanDelta: +mean(d).toFixed(3), sd: +sd(d).toFixed(3), sem: +(sd(d) / Math.sqrt(d.length)).toFixed(3) }; };
      S.pairedDeltasMs = { onNull: dOf('onNull'), skipAll: dOf('skipAll'), skipAdd: dOf('skipAdd'), x32: dOf('x32') };

      const noise = Math.abs(S.pairedDeltasMs.onNull.meanDelta);
      const resolution = S.pairedDeltasMs.onNull.sem * 2;
      const costAll = -S.pairedDeltasMs.skipAll.meanDelta;      // skipAll is cheaper => negative delta
      const costAdd = -S.pairedDeltasMs.skipAdd.meanDelta;
      const perFlush = S.pairedDeltasMs.x32.meanDelta / (CFG.gainCopies - 1);
      S.derived = {
        rigResolutionMs_2sem: +resolution.toFixed(3),
        nullControlBiasMs: +noise.toFixed(3),
        wholeBillboardSystemMs: +costAll.toFixed(3),
        additiveBatchOnlyMs: +costAdd.toFixed(3),
        msPerExtraAdditiveFlush_fromGain: +perFlush.toFixed(4),
        note: 'msPerExtraAdditiveFlush is the marginal GPU cost of one more full additive billboard pass over the same instances. It is the cleanest fill-rate figure here because 31 copies lift the signal far above the rig noise.'
      };
      S.controls = {
        nullControl: noise < Math.max(0.05, Math.abs(costAll) * 0.5)
          ? 'PASS - identical work under two labels agrees to ' + noise.toFixed(3) + ' ms'
          : 'FAIL - null control drifts by ' + noise.toFixed(3) + ' ms, which is not smaller than the effect (' + costAll.toFixed(3) + ' ms)',
        gainControl: S.pairedDeltasMs.x32.meanDelta > Math.max(1.0, noise * 8)
          ? 'PASS - ' + CFG.gainCopies + 'x the additive fill cost ' + S.pairedDeltasMs.x32.meanDelta.toFixed(2) + ' ms, so the rig does see fill rate'
          : 'FAIL - ' + CFG.gainCopies + 'x the additive fill changed nothing; the rig cannot see fill rate',
        skipConsistency: (costAll >= costAdd - Math.max(0.15, resolution))
          ? 'PASS - removing both batches costs at least as much as removing the additive batch alone'
          : 'FAIL - removing MORE work saved LESS time; something other than the billboards moved'
      };
      for (const k in S.controls) if (S.controls[k].startsWith('FAIL')) R.fail.push('span ' + SPAN + ' ' + k + ': ' + S.controls[k]);

      const A = inst.map(v => v[0]), B = inst.map(v => v[1]);
      S.instances = { addPerFrame: { p50: pct(A, 0.5), p90: pct(A, 0.9), max: Math.max(...A), mean: +mean(A).toFixed(1) },
                      alphaPerFrame: { p50: pct(B, 0.5), p90: pct(B, 0.9), max: Math.max(...B) },
                      iconPerFrame: { p50: pct(inst.map(v => v[2]), 0.5) } };
      R.spans[String(SPAN)] = S;
    }

    /* ---- call-site census, with the regex fixed -------------------------- */
    /* boot.js appends <script src="./src/x.js?v=1.33.46">, so a stack frame
       reads ".../render3d.js?v=1.33.46:2560:12". Pass 2 tested for /\.js:\d+/
       and matched nothing, which is why every site came back UNRESOLVED. */
    orthoSpan = distTarget = CFG.spans[0];
    resetWorld(); cam.x = CX; cam.y = CY;
    if (typeof camUpdateMatrices === 'function') camUpdateMatrices();
    perfScale = CFG.perfScale; army(CFG.units);
    for (let f = 0; f < 45; f++) { sim(DT); boom(CFG.boomN, CFG.spans[0]); render(DT); }
    const rawSamples = [];
    const tally = {}; let calls = 0, accepted = 0;
    const oAdd = BBBatch.prototype.add, oRect = BBBatch.prototype.addOrientedRect;
    const site = () => {
      const L = ((new Error()).stack || '').split('\n');
      if (rawSamples.length < 3) rawSamples.push(L.slice(0, 6).join(' || '));
      for (let i = 1; i < L.length; i++) {
        const s = L[i].trim();
        if (!/:\d+:\d+\)?$/.test(s)) continue;
        if (/billboard\.js/.test(s)) continue;
        if (/<anonymous>/.test(s)) continue;
        return s.replace(/^at\s+/, '').replace(/https?:\/\/[^/]+\//, '').replace(/\?v=[\d.]+/, '').slice(0, 95);
      }
      return 'UNRESOLVED';
    };
    BBBatch.prototype.add = function () { calls++; const k = nameOf(this) + '  ' + site(); const b = this.n; const r = oAdd.apply(this, arguments); if (this.n > b) { accepted++; tally[k] = (tally[k] | 0) + 1; } return r; };
    BBBatch.prototype.addOrientedRect = function () { calls++; const k = nameOf(this) + '  ' + site(); const b = this.n; const r = oRect.apply(this, arguments); if (this.n > b) { accepted++; tally[k] = (tally[k] | 0) + 1; } return r; };
    sim(DT); boom(CFG.boomN, CFG.spans[0]); render(DT);
    BBBatch.prototype.add = oAdd; BBBatch.prototype.addOrientedRect = oRect;
    R.callSites = { attempted: calls, accepted, droppedByCullGate: calls - accepted,
      dropRate: calls ? +((calls - accepted) / calls).toFixed(3) : null,
      rawStackSamples: rawSamples,
      top: Object.entries(tally).sort((a, b) => b[1] - a[1]).slice(0, 24) };

    /* ---- corroboration from the game's own telemetry --------------------- */
    if (typeof MF_COMBAT_VFX_TELEMETRY !== 'undefined') {
      M.rec = {}; sim(DT); boom(CFG.boomN, CFG.spans[0]); render(DT);
      R.gameTelemetry = {
        note: 'render3d records MF_COMBAT_VFX_TELEMETRY.additive = bbAdd.n mid-frame, BEFORE health bars and rank pips are appended. An independent count of the same thing.',
        additiveAtCombatFxPoint: MF_COMBAT_VFX_TELEMETRY.additive,
        harnessAdditiveAtFlush: M.rec.add | 0,
        harnessAlphaAtFlush: M.rec.alpha | 0,
        projectiles: MF_COMBAT_VFX_TELEMETRY.projectiles, beams: MF_COMBAT_VFX_TELEMETRY.beams,
        combatParticles: MF_COMBAT_VFX_TELEMETRY.particles
      };
      M.rec = null;
    }

    BBBatch.prototype.flush = origFlush;
    window.requestAnimationFrame = _raf;
    return R;
  }, { perfScale: 0.4125, spans: [520, 420, 420], units: 160, iters: 120, warm: 45, boomN: 3, gainCopies: 32 },
     { timeout: 900000 });

  say(JSON.stringify(RESULT, null, 2));
  say('page errors: ' + (errs.length ? errs.slice(0, 5).join(' | ') : 'none'));
  RESULT.gpu = gpu; RESULT.pageErrors = errs.slice(0, 8);
  await writeFile(join(outDir, 'pass3.json'), JSON.stringify(RESULT, null, 2), 'utf8');
} catch (e) {
  say('FATAL ' + (e && e.stack ? e.stack : e));
} finally {
  await writeFile(join(outDir, 'log3.txt'), log.join('\n'), 'utf8');
  await closePwBrowser();
  server.close();
}
console.log('output: ' + outDir);
