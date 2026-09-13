#!/usr/bin/env node
/* Frame-time performance under real load, measured in a live match.
 *
 * Every performance claim in this repo so far has been about mutation counts,
 * which is HUD churn, not rendering cost. This measures what a player feels:
 * frame times at a phone viewport on the hardware GPU, sampled at increasing
 * army sizes, so the shape of the curve says whether the game is bound by unit
 * count, by draw calls, or by something that does not scale at all.
 *
 * Percentiles, not averages. A 60fps average with a p99 of 90ms is a game that
 * hitches every second; the mean hides exactly the frames a player notices.
 *
 * Reported per load step:
 *   fps        - frames actually delivered per second over the sample
 *   p50/p95/p99- frame time in ms; p99 is the stutter the player feels
 *   jank       - frames over 50ms (a visible hitch, ~3 dropped at 60Hz)
 *   heap       - JS heap in MB, to separate a leak from a load cost
 *
 * Usage:
 *   node tools/probe-performance.mjs
 *   node tools/probe-performance.mjs --headed
 *   node tools/probe-performance.mjs --steps 0,120,400,900
 * Exit: 0 always -- this reports, it does not gate. Budgets are a judgement
 * call and belong in a review, not in a pass/fail that blocks a release. */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, relative, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchPwBrowser, closePwBrowser } from './pw-browser.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const argv = process.argv.slice(2);
const after = (f) => { const i = argv.indexOf(f); return i < 0 ? '' : String(argv[i + 1] || ''); };
const headed = argv.includes('--headed');
const STEPS = (after('--steps') || '0,120,400,900').split(',').map((n) => parseInt(n, 10)).filter((n) => n >= 0);
const SAMPLE_MS = Number(after('--sample') || 6000);
/* Spawning a unit type for the first time streams its model and textures. That
   is a real cost, but it is a one-time load cost, not the steady-state frame
   cost a player lives with -- sampling through it reports loading as if it were
   rendering, and produced non-monotonic nonsense (366 units slower than 810). */
const SETTLE_MS = Number(after('--settle') || 5000);

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.webp': 'image/webp', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.m4a': 'audio/mp4', '.ogg': 'audio/ogg', '.wasm': 'application/wasm',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.ktx2': 'image/ktx2',
  '.glb': 'model/gltf-binary', '.bin': 'application/octet-stream'
};

async function startServer() {
  const server = createServer(async (req, res) => {
    try {
      const pathname = decodeURIComponent(new URL(req.url || '/', 'http://127.0.0.1').pathname);
      const requested = pathname === '/' ? '/index.html' : pathname;
      const file = resolve(root, `.${requested}`);
      const rel = relative(root, file);
      if (!rel || rel.startsWith(`..${sep}`) || resolve(root, rel) !== file || !existsSync(file)) throw new Error('outside');
      res.writeHead(200, { 'Cache-Control': 'no-store', 'Content-Type': MIME[extname(file).toLowerCase()] || 'application/octet-stream' });
      res.end(await readFile(file));
    } catch { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('nope'); }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { url: `http://127.0.0.1:${server.address().port}/`, close: () => new Promise((r) => server.close(r)) };
}

async function enterMatch(page) {
  await page.waitForFunction(() => typeof resetWorld === 'function' && typeof deployCarrier === 'function'
    && typeof hideFrontScreens === 'function' && typeof updateHUD === 'function', null, { timeout: 180000 });
  await page.waitForFunction(() => document.body.classList.contains('mfIntroDone')
    && !document.getElementById('mfBootCover'), null, { timeout: 90000 })
    .catch(async () => { await page.evaluate(() => { const b = document.getElementById('mfIntroStart'); if (b) b.click(); }); });
  await page.waitForTimeout(700);
  return page.evaluate(() => {
    try { if (typeof apClose === 'function') apClose(); } catch (e) {}
    try {
      if (document.getElementById('mfOnboardingChoice') && window.MFOnboarding)
        window.MFOnboarding.decide('skipped', { flowId: 'default' });
    } catch (e) {}
    hideFrontScreens();
    try { if (typeof stopAttract === 'function') stopAttract(); } catch (e) {}
    demoMode = false; attractOn = false;
    resetWorld();
    const sp = skirmishSpawnPoints(), EP = sp[1] || sp[0], PP = sp[0];
    addBld('hq', 1, Math.round(EP.x), Math.round(EP.y), true);
    addBld('hq', 0, Math.round(PP.x), Math.round(PP.y), true);
    const heroT = TYPES.findIndex((t) => t && t.cat === 'hero' && t.hero === 'legion');
    const eh = spawnUnit(heroT >= 0 ? heroT : 28, 1, EP.x - 30, EP.y + 30);
    if (eh >= 0 && typeof enemyHeroIdxs !== 'undefined') enemyHeroIdxs.push(eh);
    const PH = typeof PLAYER_HERO !== 'undefined' ? PLAYER_HERO : null;
    heroIdx = spawnUnit(PH && PH.hero != null ? PH.hero : 4, 0, PP.x + 40, PP.y + 40);
    carrier.active = true; carrier.phase = 1; carrier.alt = 0; carrier.clearance = 0;
    carrier.tx = carrier.x; carrier.ty = carrier.y;
    deployCarrier();
    running = true; paused = false; gameEnded = false;
    window.__probeSpawn = (n) => {
      const p = skirmishSpawnPoints()[0];
      let made = 0;
      /* Both teams, spread over the field: a one-sided blob measures culling,
         not combat, and combat is where a match actually spends its frames. */
      for (let i = 0; i < n; i++) {
        const team = i % 2, ring = 90 + (i % 7) * 26, a = (i * 2.399963);
        const x = p.x + Math.cos(a) * ring + (team ? 190 : -60);
        const y = p.y + Math.sin(a) * ring + (team ? 150 : -40);
        if (spawnUnit(i % 5, team, x, y) >= 0) made++;
      }
      return made;
    };
    window.__probeAlive = () => { let n = 0; for (let i = 0; i < unitHigh; i++) if (ualive[i]) n++; return n; };
    return { running };
  });
}

/* The engine ships its own instrumentation behind ?mfperf=1 -- CPU and GPU
   timer banks, draw calls, triangles, long-frame counts and a bottleneck
   attribution. Prefer it over an external rAF sampler: sampling frame deltas
   from Playwright measures the automation environment as much as the game
   (an occluded window throttles rAF, which produced a ~1.4s stall at every
   load step including four units, and a 669-unit step that read faster than
   a 324-unit one). */
async function sample(page, ms) {
  await page.evaluate(() => { try { mfPerfResetCapture(); } catch (e) {} });
  await page.waitForTimeout(ms);
  return page.evaluate(() => {
    if (typeof mfPerfReport !== 'function') return { err: 'mfPerfReport unavailable' };
    const r = mfPerfReport();
    const g = (r.telemetry && r.telemetry.gauges) || {};
    const pick = (name) => { const v = g[name]; return v && v.n ? v.p50 : null; };
    return {
      fps: r.summary.fps, p50: r.summary.frameP50Ms, p95: r.summary.frameP95Ms,
      max: r.summary.frameMaxSinceResetMs, longFrames: r.summary.longFrames,
      bottleneck: r.summary.bottleneck && r.summary.bottleneck.label,
      detail: r.summary.bottleneck && r.summary.bottleneck.detail,
      quality: r.graphics && r.graphics.quality, dpr: r.graphics && r.graphics.dpr,
      draws: pick('drawCalls'), tris: pick('triangles'),
      heap: r.memory && r.memory.usedJSHeapMB != null ? r.memory.usedJSHeapMB
            : (performance.memory ? performance.memory.usedJSHeapSize / 1048576 : -1),
      raw: r
    };
  });
}

const server = await startServer();
const browser = await launchPwBrowser({ ownershipMode: 'isolated', headless: !headed });
const rows = [];
let lastDetail = '';
try {
  const context = await browser.newContext({ viewport: { width: 412, height: 900 }, deviceScaleFactor: 2, colorScheme: 'dark' });
  const page = await context.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String((e && e.message) || e)));

  const t0 = Date.now();
  await page.goto(server.url + '?mfperf=1', { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction(() => typeof updateHUD === 'function', null, { timeout: 180000 });
  const bootMs = Date.now() - t0;

  const gpu = await page.evaluate(() => {
    try {
      const c = document.createElement('canvas');
      const gl = c.getContext('webgl2') || c.getContext('webgl');
      if (!gl) return { renderer: 'no webgl' };
      const d = gl.getExtension('WEBGL_debug_renderer_info');
      return { renderer: d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : 'masked',
        maxTex: gl.getParameter(gl.MAX_TEXTURE_SIZE) };
    } catch (e) { return { renderer: 'error' }; }
  });

  await enterMatch(page);
  await page.waitForTimeout(6000);

  console.log(`boot to interactive: ${(bootMs / 1000).toFixed(1)}s`);
  console.log(`gpu: ${gpu.renderer}`);
  console.log('');
  console.log('units   fps    p50      p95      max      long   draws   tris     heapMB  bottleneck');

  let spawned = 0;
  for (const step of STEPS) {
    if (step > spawned) {
      await page.evaluate((n) => window.__probeSpawn(n), step - spawned);
      spawned = step;
      await page.waitForTimeout(SETTLE_MS);
    }
    const alive = await page.evaluate(() => window.__probeAlive());
    const s = await sample(page, SAMPLE_MS);
    rows.push({ units: alive, ...s });
    const f=(v,u)=>v==null?'--':(typeof v==='number'?(v<100?v.toFixed(1):v.toFixed(0)):String(v))+(u||'');
    console.log(
      String(alive).padEnd(7) +
      (s.fps==null?'--':s.fps.toFixed(1)).padEnd(7) +
      f(s.p50,'ms').padEnd(9) + f(s.p95,'ms').padEnd(9) + f(s.max,'ms').padEnd(9) +
      String(s.longFrames==null?'--':s.longFrames).padEnd(7) +
      f(s.draws).padEnd(8) + f(s.tris).padEnd(9) +
      (s.heap>=0?s.heap.toFixed(0):'--').padEnd(8) +
      (s.bottleneck||'--'));
    if (s.detail) lastDetail = s.detail;
  }

  const fatal = errs.filter((e) => !/WebGL|GPU|hardware|AudioContext/i.test(e));
  if (fatal.length) console.log(`\npage errors during run: ${fatal.slice(0, 3).join(' | ')}`);
  await context.close();
} finally {
  await closePwBrowser(browser).catch(() => {});
  await server.close();
}

if (rows.length > 1) {
  const a = rows[0], b = rows[rows.length - 1];
  const n = (v) => (v == null ? '--' : Math.round(v));
  console.log('');
  console.log(`From ${a.units} to ${b.units} units: fps ${n(a.fps)} -> ${n(b.fps)}, ` +
    `p50 ${n(a.p50)}ms -> ${n(b.p50)}ms, p95 ${n(a.p95)}ms -> ${n(b.p95)}ms, ` +
    `heap ${n(a.heap)} -> ${n(b.heap)} MB`);
  if (lastDetail) console.log(`engine verdict at load: ${lastDetail}`);
}
process.exit(0);
