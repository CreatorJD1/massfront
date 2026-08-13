/* Strategic-zoom acceptance capture.

   REAL GPU ONLY. Most capture-*.mjs in this repo pass --use-angle=swiftshader,
   and docs/POSTMORTEM-1.33.31-REGRESSION.md records that software previews
   already sent one investigation down a wrong path: SwiftShader is not
   authoritative for anything about materials, detail or lighting. This harness
   launches headed Chrome on d3d11.

       node tools/capture-strategic-icons.mjs [port]

   Asserts the tier actually pays for itself:
     1. draw calls at full zoom-out are FEWER than at tactical zoom
     2. icons are absent at tactical zoom and present at strategic zoom
     3. no console errors across the sweep                                    */
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'node:fs';

const PORT = process.argv[2] || '8992';
const OUT = 'releases/strategic-icons';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const SPANS = [900, 1600, 2100, 2200, 2300, 2400, 2800, 3400];

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: CHROME, headless: false,
  args: ['--use-angle=d3d11','--ignore-gpu-blocklist','--enable-gpu','--disable-gpu-sandbox'] });
const page = await browser.newPage({ viewport: { width: 412, height: 915 }, hasTouch: true });
const errors = [];
page.on('pageerror', e => errors.push('PAGEERR ' + e.message));
/* cmdicons.png is deliberately optional: the HUD ships emoji and only swaps in
   sprites once the sheet exists, so probing for an absent sheet is expected
   behaviour, not a fault. Everything else still fails the run. */
const OPTIONAL = /cmdicons.png/;
page.on('console', m => {
  if (m.type() !== 'error') return;
  /* A failed resource reports its URL in location(), not in text(). */
  const where = (m.location() && m.location().url) || '';
  if (OPTIONAL.test(where) || OPTIONAL.test(m.text())) return;
  errors.push('CONSOLE ' + m.text().slice(0, 200) + (where ? '  <- ' + where.slice(-60) : ''));
});
page.on('requestfailed', r => { if (!OPTIONAL.test(r.url())) errors.push('REQFAIL ' + r.url().slice(-60)); });

await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(13000);
const renderer = await page.evaluate(() => { try {
  const g = document.createElement('canvas').getContext('webgl2');
  const e = g.getExtension('WEBGL_debug_renderer_info');
  return e ? g.getParameter(e.UNMASKED_RENDERER_WEBGL) : '?';
} catch { return '?'; } });
console.log('renderer:', renderer);
if (/swiftshader|software/i.test(renderer)) { console.error('REFUSING: software renderer'); await browser.close(); process.exit(3); }

await page.evaluate(() => {
  const h = id => { const e = document.getElementById(id); if (e) e.style.display = 'none'; };
  h('apOverlay'); h('loadScr');
  try { hideFrontScreens(); applyTheme(); newSkirmish(); } catch {}
});
await page.waitForTimeout(24000);
await page.evaluate(() => { try { deployCarrier(); } catch {} });
await page.waitForTimeout(5000);

/* Fill the field so the measurement means something. */
const army = await page.evaluate(() => {
  let n = 0;
  try {
    const cx = blds.find(b => b && b.team === 0);
    if (!cx) return 0;
    for (let k = 0; k < 220; k++) {
      const t = [0, 1, 2, 5, 9][k % 5];
      const team = k % 3 === 0 ? 1 : 0;
      const ang = k * 0.7, rad = 180 + (k % 40) * 22;
      if (spawnUnit(t, team, cx.x + Math.cos(ang) * rad, cx.y + Math.sin(ang) * rad) != null) n++;
    }
  } catch (e) { return 'err ' + e.message; }
  return n;
});
console.log('spawned:', army);
await page.waitForTimeout(2500);

const rows = [];
for (const span of SPANS) {
  await page.evaluate(s => { try { const B = blds.find(b => b && b.team === 0);
    if (B) { cam.x = B.x; cam.y = B.y; } distTarget = orthoSpan = s; } catch {} }, span);
  await page.waitForTimeout(1400);
  const m = await page.evaluate(() => ({
    span: Math.round(orthoSpan),
    drawCalls: (typeof drawCalls === 'number' ? drawCalls : -1),
    tris: (typeof triCount === 'number' ? Math.round(triCount) : -1),
    icons: (typeof mfIconLast === 'number' ? mfIconLast : -1),
    units: (typeof unitHigh === 'number' ? unitHigh : -1),
    terrRows: (typeof terrRowsDrawn === 'number' ? Math.round(terrRowsDrawn) : -1),
    terrTotal: (typeof TGRID === 'number' ? TGRID : -1),
  }));
  rows.push(m);
  await page.screenshot({ path: `${OUT}/span-${span}.png` });
  console.log(JSON.stringify(m));
}

const near = rows[0], far = rows[rows.length - 1];
const checks = [
  ['draw calls fall as we zoom out', far.drawCalls <= near.drawCalls, `${near.drawCalls} -> ${far.drawCalls}`],
  /* Terrain triangles now RISE with zoom-out, because Z-strip culling only
     submits the rows the camera can see. So the meaningful test is no longer
     'total falls' -- it is that terrain is actually being culled at tactical
     zoom and that the icon tier still removes unit geometry. */
  ['terrain culled at tactical zoom', near.terrRows > 0 && near.terrRows < near.terrTotal * 0.75, `${near.terrRows}/${near.terrTotal} rows`],
  ['terrain grows as we zoom out',    far.terrRows >= near.terrRows,   `${near.terrRows} -> ${far.terrRows} rows`],
  ['icons absent at tactical zoom',  near.icons === 0,                `${near.icons}`],
  ['icons present at strategic zoom',far.icons > 0,                   `${far.icons}`],
  ['no console errors',              errors.length === 0,             `${errors.length}`],
];
console.log('\n--- acceptance ---');
let bad = 0;
for (const [name, ok, detail] of checks) { if (!ok) bad++; console.log((ok ? 'PASS ' : 'FAIL ') + name + '  (' + detail + ')'); }
if (errors.length) console.log(errors.slice(0, 8).join('\n'));
writeFileSync(`${OUT}/report.json`, JSON.stringify({ renderer, army, rows, errors }, null, 2));
console.log('\nscreenshots + report.json in ' + OUT);
await browser.close();
process.exit(bad ? 1 : 0);
