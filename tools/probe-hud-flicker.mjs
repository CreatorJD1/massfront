#!/usr/bin/env node
/* Whole-HUD flicker — real-browser measurement probe.
 *
 * Drives the live src/ tree in Chrome on the hardware GPU, drops into a real
 * offline skirmish, and counts attribute writes on the elements the hudflow
 * layout owns. A settled HUD mutates a handful of times per second. A HUD stuck
 * in a self-sustaining relayout mutates every frame, which is what a player
 * sees as the top rail and bottom dock flickering while the canvas sits still.
 *
 * Measured cause (2026-09-01): mfCinematicEnsureStructure() called
 * classList.add('mfCinematicCommander') on #heroBar and
 * classList.add('mfCinematicCommandDock') on #cmdbar on every sync. Adding a
 * class the element already carries still produces an attribute mutation
 * record, which re-triggered mfCinematicWatch -> mfCinematicQueueSync -> rAF
 * -> the same writes, forever. Guarding both with classList.contains() took
 * the HUD from 87 mutations/sec to 3. Note the contrast with .style.x=,
 * which browsers skip when the value is unchanged: class and setAttribute
 * writes do not get that free pass, so they must be guarded by hand.
 *
 * Usage:
 *   node tools/probe-hud-flicker.mjs            measure live src/ (fix as written)
 *   node tools/probe-hud-flicker.mjs --nofix    serve hudflow with the drain removed
 *   node tools/probe-hud-flicker.mjs --headed   watch it run
 *
 * Exit: 0 if the HUD settles, 1 if a runaway relayout is measured. */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, relative, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchPwBrowser, closePwBrowser } from './pw-browser.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const argv = process.argv.slice(2);
const noFix = argv.includes('--nofix');
const headed = argv.includes('--headed');
const SAMPLE_SECONDS = 5;
/* Anything at or above this is frame-rate traffic, not ordinary HUD updates. */
const RUNAWAY_PER_SEC = 50;

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.webp': 'image/webp', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.m4a': 'audio/mp4', '.ogg': 'audio/ogg', '.wasm': 'application/wasm',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.ktx2': 'image/ktx2',
  '.glb': 'model/gltf-binary', '.bin': 'application/octet-stream'
};

const FIX = "    if(typeof mfFlowWatch!=='undefined'&&mfFlowWatch&&\n" +
            "       typeof mfFlowWatch.takeRecords==='function') mfFlowWatch.takeRecords();\n";

let strippedFix = false;
async function startServer() {
  const server = createServer(async (req, res) => {
    try {
      const pathname = decodeURIComponent(new URL(req.url || '/', 'http://127.0.0.1').pathname);
      const requested = pathname === '/' ? '/index.html' : pathname;
      const file = resolve(root, `.${requested}`);
      const rel = relative(root, file);
      if (!rel || rel.startsWith(`..${sep}`) || resolve(root, rel) !== file || !existsSync(file)) throw new Error('outside root');
      let bytes = await readFile(file);
      /* The A/B lives here, in the transport, so the working tree is never
         modified to run the "before" case. */
      if (noFix && requested.endsWith('/src/ui/hudflow.js')) {
        const text = bytes.toString('utf8');
        if (text.includes(FIX)) { bytes = Buffer.from(text.replace(FIX, ''), 'utf8'); strippedFix = true; }
      }
      res.writeHead(200, { 'Cache-Control': 'no-store', 'Content-Type': MIME[extname(file).toLowerCase()] || 'application/octet-stream' });
      res.end(bytes);
    } catch {
      res.writeHead(404, { 'Cache-Control': 'no-store', 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
    }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { url: `http://127.0.0.1:${server.address().port}/`, close: () => new Promise((r) => server.close(r)) };
}

/* Same entry the commander-HUD probe uses: play the launch sequence, then drop
   into a skirmish with a live opponent. Without a registered enemy commander
   the victory check fires on tick one and tears the match down before anything
   can be measured. */
async function enterMatch(page) {
  await page.waitForFunction(() => typeof resetWorld === 'function' && typeof deployCarrier === 'function'
    && typeof hideFrontScreens === 'function' && typeof updateHUD === 'function', null, { timeout: 180_000 });
  await page.waitForFunction(() => document.body.classList.contains('mfIntroDone')
    && !document.getElementById('mfBootCover'), null, { timeout: 90_000 })
    .catch(async () => { await page.evaluate(() => { const b = document.getElementById('mfIntroStart'); if (b) b.click(); }); });
  await page.waitForTimeout(700);
  return page.evaluate(() => {
    try { if (typeof apClose === 'function') apClose(); } catch {}
    try {
      if (document.getElementById('mfOnboardingChoice') && window.MFOnboarding)
        window.MFOnboarding.decide('skipped', { flowId: 'default' });
    } catch {}
    hideFrontScreens();
    try { if (typeof stopAttract === 'function') stopAttract(); } catch {}
    demoMode = false; attractOn = false;
    resetWorld();
    const sp = skirmishSpawnPoints(), EP = sp[1] || sp[0];
    addBld('hq', 1, Math.round(EP.x), Math.round(EP.y), true);
    for (let i = 0; i < 4; i++) spawnUnit(0, 1, EP.x + 40 + i * 18, EP.y + 30);
    const heroT = TYPES.findIndex((t) => t && t.cat === 'hero' && t.hero === 'legion');
    const eh = spawnUnit(heroT >= 0 ? heroT : 28, 1, EP.x - 30, EP.y + 30);
    if (eh >= 0 && typeof enemyHeroIdxs !== 'undefined') enemyHeroIdxs.push(eh);
    carrier.active = true; carrier.phase = 1; carrier.alt = 0; carrier.clearance = 0;
    carrier.tx = carrier.x; carrier.ty = carrier.y;
    deployCarrier();
    running = true; paused = false; gameEnded = false;
    return { matchLive, running, enemies: typeof enemyHeroIdxs !== 'undefined' ? enemyHeroIdxs.length : -1 };
  });
}

const server = await startServer();
const browser = await launchPwBrowser({ ownershipMode: 'isolated', headless: !headed });
let failed = false;
try {
  const context = await browser.newContext({ viewport: { width: 412, height: 900 }, deviceScaleFactor: 1, colorScheme: 'dark' });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e && e.message || e)));
  await page.goto(server.url, { waitUntil: 'domcontentloaded', timeout: 120_000 });

  const gpu = await page.evaluate(() => {
    const c = document.createElement('canvas'), gl = c.getContext('webgl2');
    if (!gl) return { webgl2: false, renderer: '' };
    const d = gl.getExtension('WEBGL_debug_renderer_info');
    return { webgl2: true, renderer: d ? String(gl.getParameter(d.UNMASKED_RENDERER_WEBGL)) : '' };
  });
  console.log(`GPU: ${gpu.renderer || '(unknown)'}`);
  if (!gpu.webgl2 || /swiftshader|basic render|llvmpipe/i.test(gpu.renderer))
    throw new Error(`software renderer (${gpu.renderer}) — this probe requires a hardware GPU`);

  const served = await (await fetch(new URL('/src/ui/hudflow.js', server.url))).text();
  const fixServed = served.includes('takeRecords');
  console.log(`served hudflow: drain ${fixServed ? 'PRESENT' : 'ABSENT'}${noFix ? ' (--nofix)' : ''}`);

  const match = await enterMatch(page);
  console.log(`match: live=${match.matchLive} running=${match.running} enemyCommanders=${match.enemies}`);
  if (!match.matchLive || !match.running) throw new Error('did not reach a live match — measurement would be meaningless');
  await page.waitForTimeout(1500);

  const result = await page.evaluate(async (seconds) => {
    const IDS = ['cmdbar','topbar','heroBar','selInfo','hudDeckTabs','goalBar','primaryRow','toast','coach','unitCard','hazChip'];
    const els = IDS.map((i) => document.getElementById(i)).filter(Boolean);
    let total = 0; const perSec = []; const perEl = {};
    const samples = [];
    const mo = new MutationObserver((recs) => {
      total += recs.length;
      for (const r of recs) {
        const k = r.target.id || '?'; perEl[k] = (perEl[k] || 0) + 1;
        if (samples.length < 40) samples.push({
          id: k, attr: r.attributeName,
          from: (r.oldValue == null ? '' : String(r.oldValue)).slice(0, 150),
          to: String(r.target.getAttribute(r.attributeName) || '').slice(0, 150)
        });
      }
    });
    els.forEach((e) => mo.observe(e, { attributes: true, attributeOldValue: true, attributeFilter: ['style', 'class'] }));
    for (let s = 0; s < seconds; s++) {
      const before = total;
      await new Promise((r) => setTimeout(r, 1000));
      perSec.push(total - before);
    }
    mo.disconnect();
    return { watched: els.map((e) => e.id), total, perSec, perEl, samples,
             matchLive: typeof matchLive !== 'undefined' ? matchLive : null };
  }, SAMPLE_SECONDS);

  const peak = Math.max(...result.perSec);
  const mean = Math.round(result.total / SAMPLE_SECONDS);
  console.log(`watched ${result.watched.length} HUD elements: ${result.watched.join(', ')}`);
  console.log(`mutations/sec by second: ${result.perSec.join(', ')}`);
  console.log(`mean ${mean}/s   peak ${peak}/s   total ${result.total} over ${SAMPLE_SECONDS}s`);
  const busiest = Object.entries(result.perEl).sort((a, b) => b[1] - a[1]).slice(0, 6);
  if (busiest.length) console.log('busiest: ' + busiest.map(([k, v]) => `${k}=${v}`).join('  '));
  if (pageErrors.length) console.log('page errors: ' + pageErrors.slice(0, 3).join(' | '));
  if (argv.includes('--detail')) {
    console.log('');
    console.log('--- sample mutations (what actually changes) ---');
    for (const m of result.samples.slice(0, 16)) {
      console.log('  ' + m.id + '.' + m.attr);
      console.log('      from: ' + m.from);
      console.log('      to  : ' + m.to);
    }
  }


  if (peak >= RUNAWAY_PER_SEC) {
    console.log(`\nRUNAWAY RELAYOUT MEASURED — the HUD rewrites itself every frame (peak ${peak}/s).`);
    failed = true;
  } else {
    console.log(`\nHUD SETTLED — peak ${peak}/s, well under the ${RUNAWAY_PER_SEC}/s runaway threshold.`);
  }
  await context.close();
} finally {
  await closePwBrowser(browser).catch(() => {});
  await server.close();
}
if (noFix && !strippedFix) { console.log('WARNING: --nofix requested but the drain was not found to strip.'); }
process.exit(failed ? 1 : 0);
