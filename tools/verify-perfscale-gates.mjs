/* PERFSCALE THRESHOLD-SWEEP GATE
     node .tmp/perfscale-gate.mjs <serve-root> <port> [preset]

   Symptom being chased: water, shadows and other FX flicker for roughly half a
   second at a time. Not whole frames, not per-frame -- a ~0.5s outage of
   SPECIFIC effects.

   perfBand is hysteretic and quantised to {0.25, 0.55, 1}. perfScale is eased
   toward it (0.45/sample) and is what every effect actually reads. The effect
   gates cluster tightly:

       0.32  lowFx            (sim.js:3679)
       0.35  walker dust      (sim.js:599)
       0.40  rubble/sparks    (sim.js:972, 1919)
       0.45  doctrine FX      (factiondoctrine.js:235,265)
       0.48  debris           (sim.js:3738)
       0.50  AMBIENT OCCLUSION (mesh.js:2036)

   So a single band change from 0.55 to 0.25 drags the eased value through ALL
   SIX in a couple of samples, switching every one of those effects off, then
   back on when fps recovers. That is the strobe the source comment at
   main.js:938-941 says the hysteresis was added to prevent -- it protects the
   BAND, not the eased value the gates read.

   This counts the crossings directly rather than arguing about them.          */
import { launchPwBrowser, closePwBrowser } from './pw-browser.mjs';
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, extname, resolve } from 'node:path';

const ROOT = process.argv[2];
const PORT = +(process.argv[3] || 8990);
const PRESET = process.argv[4] || null;
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

const browser = await launchPwBrowser({
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

await page.evaluate((preset) => {
  for (const id of ['apOverlay', 'loadScr']) { const e = document.getElementById(id); if (e) e.style.display = 'none'; }
  try {
    if (preset && typeof META !== 'undefined' && META.settings) { META.settings.quality = preset; applyQualityPreset(); }
  } catch (e) {}
  try { hideFrontScreens(); applyTheme(); newSkirmish(); } catch (e) {}
}, PRESET);
await page.waitForTimeout(24000);
await page.evaluate(() => { try { deployCarrier(); } catch (e) {} });
await page.waitForTimeout(7000);

/* Sample perfScale every frame. Also drive fps down hard so the band actually
   moves -- on a 4060 an idle skirmish never leaves band 1, which is exactly why
   the earlier fixed-viewport runs saw perfScale pinned at 0.55-1.0. */
await page.evaluate(() => {
  window.__ps = [];
  const tick = () => {
    if (typeof perfScale !== 'undefined') window.__ps.push(+perfScale.toFixed(4));
    if (window.__ps.length < 4000) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  /* Load generator: spawn waves so fpsShow drops through the 42 and 28 bands. */
  window.__load = setInterval(() => {
    try {
      const cx = (typeof MAP !== 'undefined' ? MAP : 4000) * 0.5;
      for (let k = 0; k < 90; k++) {
        const t = k % 12;
        if (typeof spawnUnit === 'function') spawnUnit(t, k % 2, cx + (Math.sin(k) * 400), cx + (Math.cos(k) * 400));
      }
    } catch (e) {}
  }, 900);
});
await page.waitForTimeout(45000);
const ps = await page.evaluate(() => { clearInterval(window.__load); return window.__ps; });
await browser.close(); server.close();

const TH = [['lowFx', 0.32], ['walker dust', 0.35], ['rubble/sparks', 0.40],
  ['doctrine FX', 0.45], ['debris', 0.48], ['AMBIENT OCCLUSION', 0.50]];
console.log(`\npreset=${PRESET || 'high(default)'}   samples=${ps.length}`);
console.log(`perfScale  min ${Math.min(...ps).toFixed(3)}  max ${Math.max(...ps).toFixed(3)}`);
/* CROSSING COUNT IS THE WRONG METRIC and measuring it first was a mistake.
   Dropping a band genuinely SHOULD cross every threshold below it — that is one
   deliberate quality step. What makes it a strobe is crossing them at DIFFERENT
   TIMES, so effects peel away one after another over ~0.5s and return the same
   way. So measure the spread, not the count. */
console.log('\neffect gate            threshold   crossings');
let total = 0;
for (const [name, t] of TH) {
  let n = 0;
  for (let i = 1; i < ps.length; i++) if ((ps[i] < t) !== (ps[i - 1] < t)) n++;
  total += n;
  console.log('  ' + name.padEnd(22) + t.toFixed(2).padStart(6) + String(n).padStart(11));
}
console.log(`  ${'total'.padEnd(22)}${''.padStart(6)}${String(total).padStart(11)}`);

/* An eased value visits many intermediate levels; a quantised one visits only
   its bands. This is what actually separates a sweep from a step. */
const distinct = [...new Set(ps)].sort((a, b) => a - b);
console.log(`\ndistinct perfScale values: ${distinct.length}`);
console.log('   ' + distinct.slice(0, 14).map(v => v.toFixed(3)).join(' ') + (distinct.length > 14 ? ' …' : ''));

/* The decisive number: for each transition, how many SAMPLES elapse between the
   first gate crossing and the last. Zero means every effect switched together. */
let worstSpread = 0, spreads = [];
let runStart = -1, crossedInRun = 0;
for (let i = 1; i < ps.length; i++) {
  const crossed = TH.filter(([, t]) => (ps[i] < t) !== (ps[i - 1] < t)).length;
  if (crossed) {
    if (runStart < 0) { runStart = i; crossedInRun = 0; }
    crossedInRun += crossed;
    spreads.push(i);
  }
}
if (spreads.length > 1) worstSpread = spreads[spreads.length - 1] - spreads[0];
const simultaneous = spreads.length <= 1;
console.log(`gate-crossing events: ${spreads.length}  (frames between first and last: ${worstSpread})`);

const PASS = distinct.length <= 6 && simultaneous;
console.log('\n' + (PASS
  ? `PASS — perfScale is quantised (${distinct.length} levels) and every gate switched in ONE step: a single quality change, not a strobe`
  : `FAIL — ${distinct.length} distinct levels and crossings spread over ${worstSpread} frames: effects peel off one at a time`));
process.exit(PASS ? 0 : 1);
