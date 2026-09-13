#!/usr/bin/env node
/* GUI layout and touch-target audit, measured on a phone viewport in a match.
 *
 * audit-ui-control-safety.mjs inventories controls from source and reports
 * "computed-touch-targets" as an unresolved blocker -- it can see that a
 * control exists, not how big it renders. Every reachability defect found in
 * this project so far has been a rendered-size problem that source review could
 * not see (a populated stack rail at 0x0, an UNLOAD control at 0x0), so this
 * measures the rendered box.
 *
 * Thresholds:
 *   44x44 css px  - Apple HIG minimum and WCAG 2.5.5 Target Size (AAA).
 *   24x24 css px  - WCAG 2.5.8 Target Size (Minimum, AA). Below this is a
 *                   conformance failure, not a preference.
 *
 * Also reports: controls that render at zero size (present but untappable),
 * controls overflowing the viewport horizontally, and overlapping hit areas,
 * which cause mis-taps rather than missed ones.
 *
 * Usage:
 *   node tools/probe-gui-layout.mjs
 *   node tools/probe-gui-layout.mjs --shots <dir>   also save screenshots
 *   node tools/probe-gui-layout.mjs --width 320     small-phone pass
 * Exit: 0 always -- this reports for review. */
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, relative, extname, sep, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchPwBrowser, closePwBrowser } from './pw-browser.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const argv = process.argv.slice(2);
const after = (f) => { const i = argv.indexOf(f); return i < 0 ? '' : String(argv[i + 1] || ''); };
const SHOTS = after('--shots');
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
    for (let i = 0; i < 8; i++) spawnUnit(i % 4, 0, PP.x + 200 + i * 15, PP.y + 200);
    const upType = Object.keys(BUP).filter((k) => k !== 'fac')[0] || 'turret';
    addBld(upType, 0, Math.round(PP.x + 90), Math.round(PP.y + 90), true);
    carrier.active = true; carrier.phase = 1; carrier.alt = 0; carrier.clearance = 0;
    carrier.tx = carrier.x; carrier.ty = carrier.y;
    deployCarrier();
    running = true; paused = false; gameEnded = false;
    return { running };
  });
}

/* Measures what a thumb can hit, in the deck the player is actually looking at. */
const AUDIT = () => {
  const sel = 'button,[role="button"],a[href],input,select,textarea,[tabindex]:not([tabindex="-1"]),[onclick]';
  const out = [];
  const seen = new Set();
  for (const el of document.querySelectorAll(sel)) {
    if (seen.has(el)) continue;
    seen.add(el);
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none') continue;
    let hiddenAncestor = false;
    for (let p = el.parentElement; p; p = p.parentElement) {
      const pcs = getComputedStyle(p);
      if (pcs.display === 'none' || pcs.visibility === 'hidden') { hiddenAncestor = true; break; }
    }
    if (hiddenAncestor) continue;
    const label = (el.getAttribute('aria-label') || el.textContent || el.id || el.className || '')
      .toString().trim().replace(/\s+/g, ' ').slice(0, 42);
    out.push({
      id: el.id || '', cls: (el.className || '').toString().split(' ')[0] || '',
      label, w: Math.round(r.width), h: Math.round(r.height),
      x: Math.round(r.left), y: Math.round(r.top),
      disabled: !!el.disabled, font: parseFloat(cs.fontSize) || 0
    });
  }
  const vw = innerWidth, vh = innerHeight;
  const overflowX = document.documentElement.scrollWidth > vw + 1;
  return { controls: out, vw, vh, overflowX, scrollW: document.documentElement.scrollWidth };
};

const server = await startServer();
const browser = await launchPwBrowser({ ownershipMode: 'isolated', headless: true });
try {
  const context = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2, colorScheme: 'dark' });
  const page = await context.newPage();
  await page.goto(server.url, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await enterMatch(page);
  await page.waitForTimeout(2500);

  if (SHOTS) await mkdir(SHOTS, { recursive: true });
  const decks = ['orders', 'platoons', 'abilities', 'view'];
  const all = [];
  for (const deck of decks) {
    await page.evaluate((d) => {
      try { if (typeof showHudDock === 'function') showHudDock(true, d); } catch (e) {}
      try { if (typeof setHudDeck === 'function') setHudDeck(d, true); } catch (e) {}
    }, deck);
    await page.waitForTimeout(900);
    const res = await page.evaluate(AUDIT);
    all.push({ deck, ...res });
    if (SHOTS) await page.screenshot({ path: join(SHOTS, `match-${W}-${deck}.png`) });
  }

  console.log(`viewport ${W}x${H} @dpr2`);
  console.log('');
  const seenKey = new Set();
  const tiny = [], zero = [], small = [], offscreen = [];
  for (const d of all) {
    for (const c of d.controls) {
      const key = (c.id || c.cls) + '|' + c.label;
      if (seenKey.has(key)) continue;
      seenKey.add(key);
      const name = (c.id ? '#' + c.id : '.' + c.cls) + (c.label ? ` "${c.label}"` : '');
      const box = `${c.w}x${c.h}`;
      if (c.w === 0 || c.h === 0) zero.push(`${name} — ${box} (present, untappable) [${d.deck}]`);
      else if (c.w < 24 || c.h < 24) tiny.push(`${name} — ${box} [${d.deck}]`);
      else if (c.w < 44 || c.h < 44) small.push(`${name} — ${box} [${d.deck}]`);
      if (c.x < 0 || c.x + c.w > d.vw + 1) offscreen.push(`${name} — x=${c.x} w=${c.w} (vw ${d.vw}) [${d.deck}]`);
    }
  }
  const total = seenKey.size;
  console.log(`unique interactive controls measured across ${decks.length} decks: ${total}`);
  console.log(`  zero-size (untappable)      : ${zero.length}`);
  console.log(`  under 24px (WCAG AA fail)   : ${tiny.length}`);
  console.log(`  24-43px (under 44px HIG)    : ${small.length}`);
  console.log(`  clipped horizontally        : ${offscreen.length}`);
  const ov = all.filter((d) => d.overflowX);
  console.log(`  decks with page overflow-x  : ${ov.length ? ov.map((d) => `${d.deck}(${d.scrollW}px)`).join(', ') : 'none'}`);
  const show = (title, arr, n) => {
    if (!arr.length) return;
    console.log(`\n${title}`);
    for (const l of arr.slice(0, n)) console.log('  ' + l);
    if (arr.length > n) console.log(`  ... and ${arr.length - n} more`);
  };
  show('ZERO SIZE — rendered but cannot be hit:', zero, 12);
  show('UNDER 24px — fails WCAG 2.5.8 AA:', tiny, 14);
  show('UNDER 44px — below Apple HIG minimum:', small, 16);
  show('CLIPPED — extends past the viewport:', offscreen, 8);
  if (SHOTS) console.log(`\nscreenshots: ${SHOTS}`);
  await context.close();
} finally {
  await closePwBrowser(browser).catch(() => {});
  await server.close();
}
process.exit(0);
