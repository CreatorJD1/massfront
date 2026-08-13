/* AO REALLOCATION GATE
     node .tmp/ao-resize-gate.mjs <serve-root> <port> [label]

   The flicker only appears when the drawing buffer CHANGES SIZE, which is why
   three fixed-viewport runs (4400+ frames) never reproduced it. gl.js resizes
   the canvas from resize/visualViewport events, so on a real device the browser
   UI showing or hiding is enough.

   Mechanism under test: aoAlloc() deletes and recreates aoDepth on a size
   change, but aoFB2 still holds the DELETED old-height texture in its
   DEPTH_ATTACHMENT (aoResolve re-attaches it every frame). Status then returns
   INCOMPLETE_DIMENSIONS, aoReady goes false, and the scene skips AO + FXAA +
   bloom -- a visibly flat, sky-tinted frame.

   This drives the resize churn deliberately and reports, per reallocation,
   whether the framebuffer came out COMPLETE. PASS is zero failed
   reallocations. */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, extname, resolve } from 'node:path';

const ROOT = process.argv[2];
const PORT = +(process.argv[3] || 8980);
const LABEL = process.argv[4] || 'run';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg',
  '.css': 'text/css', '.m4a': 'audio/mp4', '.ogg': 'audio/ogg', '.svg': 'image/svg+xml' };
const server = createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
  const f = join(ROOT, p);
  if (!existsSync(f) || !resolve(f).startsWith(resolve(ROOT))) { res.writeHead(404); return res.end('nf'); }
  res.writeHead(200, { 'Content-Type': MIME[extname(f)] || 'application/octet-stream' });
  res.end(readFileSync(f));
});
await new Promise(r => server.listen(PORT, '127.0.0.1', r));

const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: false,
  args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-gpu', '--disable-gpu-sandbox'] });
const page = await browser.newPage({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2 });
await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(13000);
const renderer = await page.evaluate(() => { try {
  const g = document.createElement('canvas').getContext('webgl2');
  const e = g.getExtension('WEBGL_debug_renderer_info');
  return e ? g.getParameter(e.UNMASKED_RENDERER_WEBGL) : '?'; } catch { return '?'; } });
if (/swiftshader|software/i.test(renderer)) { console.error('REFUSING: software'); await browser.close(); server.close(); process.exit(3); }

await page.evaluate(() => {
  for (const id of ['apOverlay', 'loadScr']) { const e = document.getElementById(id); if (e) e.style.display = 'none'; }
  try { hideFrontScreens(); applyTheme(); newSkirmish(); } catch (e) {}
});
await page.waitForTimeout(24000);
await page.evaluate(() => { try { deployCarrier(); } catch (e) {} });
await page.waitForTimeout(7000);

/* Wrap aoAlloc: record the framebuffer status each reallocation actually
   produced, rather than inferring it from aoReady after the fact. */
const ok = await page.evaluate(() => {
  if (typeof aoAlloc !== 'function') return false;
  window.__alloc = [];
  const orig = aoAlloc;
  // eslint-disable-next-line no-global-assign
  aoAlloc = function (w, h) {
    const before = { aoW: (typeof aoW !== 'undefined' ? aoW : -1), aoH: (typeof aoH !== 'undefined' ? aoH : -1) };
    const willRun = !(w <= 0 || h <= 0) && !(before.aoW === w && before.aoH === h);
    orig(w, h);
    if (willRun) window.__alloc.push({ w, h, from: before.aoW + 'x' + before.aoH, ready: aoReady ? 1 : 0 });
  };
  window.__aoOff = 0; window.__frames = 0;
  const o2 = aoBeginScene;
  // eslint-disable-next-line no-global-assign
  aoBeginScene = function () { const r = o2(); window.__frames++; if (!r) window.__aoOff++; return r; };
  return true;
});
if (!ok) { console.error('probe failed'); await browser.close(); server.close(); process.exit(2); }

/* Resize churn: heights that differ, which is what breaks dimension validation.
   Mirrors a mobile address bar sliding in and out. */
const SIZES = [[412, 915], [412, 860], [412, 915], [412, 800], [412, 915], [412, 870], [412, 915], [412, 830]];
for (const [w, h] of SIZES) { await page.setViewportSize({ width: w, height: h }); await page.waitForTimeout(900); }
await page.waitForTimeout(1500);

const r = await page.evaluate(() => ({ alloc: window.__alloc, off: window.__aoOff, frames: window.__frames }));
await browser.close(); server.close();

console.log(`\n=== ${LABEL} ===  ${ROOT}`);
console.log(`reallocations: ${r.alloc.length}`);
for (const a of r.alloc) console.log(`   ${a.from} -> ${a.w}x${a.h}   aoReady=${a.ready ? 'true ' : 'FALSE'}`);
const bad = r.alloc.filter(a => !a.ready).length;
console.log(`frames with AO/bloom/FXAA skipped: ${r.off} of ${r.frames}`);
console.log(bad === 0 && r.off === 0
  ? `PASS — every reallocation completed and no frame lost the post chain`
  : `FAIL — ${bad} reallocation(s) left the framebuffer incomplete; ${r.off} frame(s) skipped the post chain`);
process.exit(bad === 0 && r.off === 0 ? 0 : 1);
