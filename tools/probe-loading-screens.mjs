#!/usr/bin/env node
/* HOW MANY FULL-SCREEN COVERS DOES ONE LAUNCH PUT IN FRONT OF THE PLAYER?
 *
 * Reported as "redundant loading screens on starting game and such, like
 * double, two types of loading screens". That is a sequencing complaint, and
 * the only way to answer it is to watch the sequence: install a MutationObserver
 * before the first paint, and record every element that becomes a full-screen
 * cover, when it appeared, and how long it held.
 *
 * A "cover" here is what a player would call one: fixed or absolute, opaque
 * enough to read as a screen, and occupying most of the viewport.
 *
 * Usage: node tools/probe-loading-screens.mjs [--seconds 70]
 */
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { extname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchPwBrowser, closePwBrowser } from './pw-browser.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const argv = process.argv.slice(2);
const SECONDS = Number((argv.indexOf('--seconds') >= 0 && argv[argv.indexOf('--seconds') + 1]) || 70);

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.glb': 'model/gltf-binary', '.woff2': 'font/woff2', '.ktx2': 'image/ktx2', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4', '.mp3': 'audio/mpeg', '.wasm': 'application/wasm', '.svg': 'image/svg+xml' };
const server = createServer(async (rq, rs) => {
  try {
    const p = decodeURIComponent(new URL(rq.url || '/', 'http://127.0.0.1').pathname);
    const f = resolve(root, '.' + (p === '/' ? '/index.html' : p));
    const rel = relative(root, f);
    if (!rel || rel.startsWith('..' + sep) || !existsSync(f)) throw new Error('outside');
    rs.writeHead(200, { 'Content-Type': MIME[extname(f).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    rs.end(await readFile(f));
  } catch { rs.writeHead(404); rs.end('nf'); }
});
await new Promise(a => server.listen(0, '127.0.0.1', a));
const url = `http://127.0.0.1:${server.address().port}/index.html`;

/* Installed via addInitScript so it is running before the first element the
   boot sequence creates. Polling is used rather than MutationObserver alone:
   a cover often appears by a style/class change on an element that already
   exists, which no childList mutation reports. */
const WATCHER = () => {
  window.__covers = [];
  const open = new Map();
  const t0 = performance.now();
  const describe = el => (el.id ? '#' + el.id : '') + (el.className && typeof el.className === 'string'
    ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '') || el.tagName.toLowerCase();
  const isCover = el => {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return false;
    if (parseFloat(cs.opacity) < 0.25) return false;
    if (cs.position !== 'fixed' && cs.position !== 'absolute') return false;
    if (cs.pointerEvents === 'none') return false;
    const r = el.getBoundingClientRect();
    if (r.width < innerWidth * 0.8 || r.height < innerHeight * 0.7) return false;
    /* A transparent positioning wrapper is not a screen. */
    const bg = cs.backgroundColor || '';
    const alpha = /rgba?\(([^)]+)\)/.exec(bg);
    const opaque = alpha ? (alpha[1].split(',')[3] === undefined || parseFloat(alpha[1].split(',')[3]) > 0.35) : false;
    return opaque || cs.backgroundImage !== 'none' || parseFloat(cs.backdropFilter ? 1 : 0) > 0;
  };
  const scan = () => {
    const now = performance.now() - t0;
    const seen = new Set();
    for (const el of document.body ? document.body.querySelectorAll('*') : []) {
      if (!isCover(el)) continue;
      seen.add(el);
      if (!open.has(el)) open.set(el, { name: describe(el), from: now, z: getComputedStyle(el).zIndex });
    }
    for (const [el, rec] of open) {
      if (seen.has(el)) continue;
      window.__covers.push({ ...rec, to: now, ms: Math.round(now - rec.from) });
      open.delete(el);
    }
    window.__coversOpen = [...open.values()].map(v => ({ ...v, ms: Math.round(now - v.from) }));
  };
  const start = () => { scan(); setInterval(scan, 120); };
  if (document.body) start(); else addEventListener('DOMContentLoaded', start);
};

const browser = await launchPwBrowser({ ownershipMode: 'isolated' });
try {
  const page = await browser.newPage({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2, hasTouch: true });
  await page.addInitScript(WATCHER);
  const marks = [];
  const mark = (label) => marks.push({ label, at: Date.now() });
  const started = Date.now();

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 180000 });
  mark('navigated');
  await page.waitForFunction(() => typeof mfLauncherSnapshot === 'function', null, { polling: 250, timeout: 180000 });
  await page.waitForFunction(() => {
    const p = document.getElementById('mfLaunchPlay'), o = document.getElementById('mfLaunchOffline');
    return (p && !p.disabled) || (o && !o.disabled);
  }, null, { polling: 250, timeout: 120000 }).catch(() => {});
  mark('launcher ready');
  await page.evaluate(() => {
    const p = document.getElementById('mfLaunchPlay'), o = document.getElementById('mfLaunchOffline');
    (p && !p.disabled ? p : o)?.click();
  });
  mark('tapped PLAY');
  await page.waitForTimeout(6000);
  await page.evaluate(() => document.getElementById('mfIntroStart')?.click());
  mark('tapped intro');
  await page.waitForTimeout(4000);
  await page.evaluate(() => document.getElementById('apOfflineBtn')?.click());
  mark('offline auth');
  await page.waitForTimeout(10000);
  mark('menu should be up');

  /* Now start a match the way a player does from the menu. */
  await page.evaluate(() => {
    try { if (typeof apClose === 'function') apClose(); } catch {}
    try { if (document.getElementById('mfOnboardingChoice') && window.MFOnboarding) window.MFOnboarding.decide('skipped', { flowId: 'default' }); } catch {}
    hideFrontScreens();
    try { if (typeof stopAttract === 'function') stopAttract(); } catch {}
    demoMode = false; attractOn = false;
    newSkirmish();
  });
  mark('newSkirmish');
  const left = SECONDS * 1000 - (Date.now() - started);
  await page.waitForTimeout(Math.max(6000, left));

  const covers = await page.evaluate(() => ({ closed: window.__covers || [], open: window.__coversOpen || [] }));
  await page.close();

  const rel = at => ((at - started) / 1000).toFixed(1) + 's';
  console.log('TIMELINE');
  for (const m of marks) console.log(`  ${rel(m.at).padStart(7)}  ${m.label}`);
  console.log('');
  console.log('FULL-SCREEN COVERS (page-relative)');
  const rows = [...covers.closed.map(c => ({ ...c, state: 'closed' })), ...covers.open.map(c => ({ ...c, state: 'STILL OPEN' }))]
    .sort((a, b) => a.from - b.from);
  console.log('  from      held      z      what');
  for (const r of rows) {
    console.log(`  ${(r.from / 1000).toFixed(1).padStart(6)}s  ${String(r.ms + 'ms').padStart(8)}  ${String(r.z).padStart(5)}  ${r.name}${r.state === 'STILL OPEN' ? '   <- still open' : ''}`);
  }
  console.log('');
  /* Overlap is the complaint: two covers on screen at the same time is what
     "double, two types of loading screens" describes. */
  let overlaps = 0;
  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      const a = rows[i], b = rows[j];
      const aTo = a.to == null ? Infinity : a.to;
      if (b.from < aTo - 250) {
        overlaps++;
        console.log(`  OVERLAP  ${a.name} and ${b.name} share the screen for ${Math.round(Math.min(aTo, b.to == null ? Infinity : b.to) - b.from)}ms`);
      }
    }
  }
  console.log(`\n${rows.length} full-screen covers, ${overlaps} overlapping pairs`);
} finally {
  try { await closePwBrowser(browser); } catch {}
  server.close();
}
