#!/usr/bin/env node
/* Capture the rendered battlefield so world art can actually be reviewed.
 *
 * probe-gui-layout's captures show the HUD over black: a WebGL context created
 * without preserveDrawingBuffer has an undefined back buffer by the time the
 * screenshot compositor reads it, so the canvas comes back empty and every
 * conclusion about the 3D art would have been drawn from a picture of nothing.
 *
 * Patching getContext before any page script runs is what makes the capture
 * real. It costs a little GPU bandwidth, which is fine here because this tool
 * captures stills and never reports frame times -- use probe-performance.mjs
 * for that, and do not merge the two, or the perf numbers inherit this cost.
 *
 * Shots are taken at the three zooms the game actually plays at, plus per
 * faction, because faction silhouette identity is the thing a still can
 * genuinely answer.
 *
 * Usage:
 *   node tools/probe-world-art.mjs --out <dir>
 *   node tools/probe-world-art.mjs --out <dir> --width 900 --height 600
 * Exit: 0 always -- this produces images for a human to look at. */
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, relative, extname, sep, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchPwBrowser, closePwBrowser } from './pw-browser.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const argv = process.argv.slice(2);
const after = (f) => { const i = argv.indexOf(f); return i < 0 ? '' : String(argv[i + 1] || ''); };
const OUT = after('--out') || resolve(root, 'tmp/world-art');
const W = Number(after('--width') || 412);
const H = Number(after('--height') || 900);

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

const server = await startServer();
const browser = await launchPwBrowser({ ownershipMode: 'isolated', headless: true });
try {
  const context = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2, colorScheme: 'dark' });

  /* Must run before the game creates its context, hence addInitScript. */
  await context.addInitScript(() => {
    const orig = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, attrs) {
      if (/webgl/i.test(String(type))) attrs = Object.assign({}, attrs || {}, { preserveDrawingBuffer: true });
      return orig.call(this, type, attrs);
    };
  });

  const page = await context.newPage();
  await page.goto(server.url, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction(() => typeof resetWorld === 'function' && typeof deployCarrier === 'function'
    && typeof hideFrontScreens === 'function' && typeof updateHUD === 'function', null, { timeout: 180000 });
  await page.waitForFunction(() => document.body.classList.contains('mfIntroDone')
    && !document.getElementById('mfBootCover'), null, { timeout: 90000 })
    .catch(async () => { await page.evaluate(() => { const b = document.getElementById('mfIntroStart'); if (b) b.click(); }); });
  await page.waitForTimeout(800);

  const setup = await page.evaluate((faction) => {
    try { if (typeof apClose === 'function') apClose(); } catch (e) {}
    try {
      if (document.getElementById('mfOnboardingChoice') && window.MFOnboarding)
        window.MFOnboarding.decide('skipped', { flowId: 'default' });
    } catch (e) {}
    hideFrontScreens();
    try { if (typeof stopAttract === 'function') stopAttract(); } catch (e) {}
    demoMode = false; attractOn = false;
    if (faction && typeof playerFaction !== 'undefined') playerFaction = faction;
    resetWorld();
    const sp = skirmishSpawnPoints(), PP = sp[0], EP = sp[1] || sp[0];
    /* A real base, not a bare HQ: silhouette variety is the thing a still
       answers, and one building cannot show it. */
    const kinds = ['hq', 'fac', 'mex', 'pgen', 'turret', 'bunker', 'techlab', 'aatower'];
    let placed = 0;
    kinds.forEach((k, i) => {
      if (!BT[k]) return;
      const a = i * 0.85, r = 60 + (i % 3) * 34;
      if (addBld(k, 0, Math.round(PP.x + Math.cos(a) * r), Math.round(PP.y + Math.sin(a) * r), true)) placed++;
    });
    addBld('hq', 1, Math.round(EP.x), Math.round(EP.y), true);
    const heroT = TYPES.findIndex((t) => t && t.cat === 'hero' && t.hero === 'legion');
    const eh = spawnUnit(heroT >= 0 ? heroT : 28, 1, EP.x - 30, EP.y + 30);
    if (eh >= 0 && typeof enemyHeroIdxs !== 'undefined') enemyHeroIdxs.push(eh);
    const PH = typeof PLAYER_HERO !== 'undefined' ? PLAYER_HERO : null;
    heroIdx = spawnUnit(PH && PH.hero != null ? PH.hero : 4, 0, PP.x + 30, PP.y + 30);
    for (let i = 0; i < 26; i++) spawnUnit(i % 6, 0, PP.x + 120 + (i % 7) * 20, PP.y + 110 + Math.floor(i / 7) * 20);
    carrier.active = true; carrier.phase = 1; carrier.alt = 0; carrier.clearance = 0;
    carrier.tx = carrier.x; carrier.ty = carrier.y;
    deployCarrier();
    running = true; paused = false; gameEnded = false;
    window.__artFocus = async (span, pitch, yaw) => {
      const p = skirmishSpawnPoints()[0];
      camFollow = -1;
      cam.x = p.x + 60; cam.y = p.y + 60;
      if (pitch != null) camPitch = pitchTarget = pitch;
      if (yaw != null) camYaw = yawTarget = yaw;
      for (let f = 0; f < 30; f++) {
        orthoSpan = distTarget = span;
        await new Promise((r) => requestAnimationFrame(r));
      }
      return { span: orthoSpan, buildings: blds.filter((b) => b && b.alive).length };
    };
    return { placed, faction: typeof playerFaction !== 'undefined' ? playerFaction : '?' };
  }, '');
  console.log(`base placed: ${setup.placed} structures, faction=${setup.faction}`);

  await mkdir(OUT, { recursive: true });
  await page.waitForTimeout(6000);

  const shots = [
    ['tactical', 320, 1.02, 0.6],
    ['command', 700, 1.10, 0.6],
    ['strategic', 1400, 1.19, 0.6],
    ['low-angle', 420, 0.72, 2.1]
  ];
  for (const [name, span, pitch, yaw] of shots) {
    const r = await page.evaluate(([s, p, y]) => window.__artFocus(s, p, y), [span, pitch, yaw]);
    await page.waitForTimeout(1400);
    const file = join(OUT, `world-${name}.png`);
    await page.screenshot({ path: file });
    console.log(`  ${name.padEnd(10)} span=${Math.round(r.span)} buildings=${r.buildings}  ${file}`);
  }

  /* Faction identity: same camera, same base kinds, different faction. */
  for (const fac of ['nova', 'legion', 'syndicate', 'horde']) {
    await page.evaluate((f) => {
      if (typeof playerFaction !== 'undefined') playerFaction = f;
      resetWorld();
      const sp = skirmishSpawnPoints(), PP = sp[0], EP = sp[1] || sp[0];
      ['hq', 'fac', 'mex', 'pgen', 'turret', 'bunker'].forEach((k, i) => {
        if (!BT[k]) return;
        const a = i * 1.0, r = 58 + (i % 3) * 30;
        addBld(k, 0, Math.round(PP.x + Math.cos(a) * r), Math.round(PP.y + Math.sin(a) * r), true);
      });
      addBld('hq', 1, Math.round(EP.x), Math.round(EP.y), true);
      const heroT = TYPES.findIndex((t) => t && t.cat === 'hero');
      const eh = spawnUnit(heroT >= 0 ? heroT : 28, 1, EP.x - 30, EP.y + 30);
      if (eh >= 0 && typeof enemyHeroIdxs !== 'undefined') enemyHeroIdxs.push(eh);
      for (let i = 0; i < 14; i++) spawnUnit(i % 5, 0, PP.x + 120 + (i % 7) * 20, PP.y + 110 + Math.floor(i / 7) * 22);
      running = true; paused = false; gameEnded = false;
    }, fac);
    await page.waitForTimeout(4500);
    await page.evaluate(() => window.__artFocus(420, 0.86, 0.9));
    await page.waitForTimeout(1600);
    const file = join(OUT, `faction-${fac}.png`);
    await page.screenshot({ path: file });
    console.log(`  faction ${fac.padEnd(10)} ${file}`);
  }

  /* Proof the capture is real: a fully black frame means the patch failed and
     nothing below should be trusted as a picture of the game. */
  const ink = await page.evaluate(() => {
    const c = document.querySelector('canvas');
    if (!c) return { err: 'no canvas' };
    const t = document.createElement('canvas');
    t.width = 80; t.height = 80;
    const x = t.getContext('2d');
    x.drawImage(c, 0, 0, 80, 80);
    const d = x.getImageData(0, 0, 80, 80).data;
    let lit = 0, sum = 0;
    for (let i = 0; i < d.length; i += 4) {
      const v = (d[i] + d[i + 1] + d[i + 2]) / 3;
      sum += v; if (v > 12) lit++;
    }
    return { litPct: Math.round(lit / (d.length / 4) * 100), meanLuma: Math.round(sum / (d.length / 4)) };
  });
  console.log(`\ncanvas content: ${ink.litPct}% of sampled pixels lit, mean luma ${ink.meanLuma}/255`);
  console.log(ink.litPct > 5 ? 'CAPTURE IS REAL — the world rendered into the screenshot.'
    : 'CAPTURE FAILED — canvas is black; do not review art from these images.');
  await context.close();
} finally {
  await closePwBrowser(browser).catch(() => {});
  await server.close();
}
process.exit(0);
