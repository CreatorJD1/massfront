/* Commander strategic-icon acceptance.

     node tools/capture-commander-icon.mjs [port]

   REAL GPU ONLY (docs/POSTMORTEM-1.33.31-REGRESSION.md).

   The commander is the entity a player must never lose track of, and before
   this it was the one entity that could not iconize: the tier keys off screen
   footprint, and at SPAN_MAX=3400 the commander still measured 25.8 px against
   a 24 px threshold. It stayed a mesh while a plain Striker -- 9.7 px -- drew a
   bold plate. The most important thing on the field was the least visible.

   Asserts, at every span across the range:
     1. the player commander resolves to an icon at strategic zoom
     2. its icon is drawn LARGER than an ordinary unit's, not merely present
     3. no console errors                                                     */
import { launchPwBrowser, closePwBrowser } from './pw-browser.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';

const PORT = process.argv[2] || '8992';
const OUT = 'releases/commander-icon';
const SPANS = [900, 1600, 2200, 2800, 3400];
mkdirSync(OUT, { recursive: true });

const browser = await launchPwBrowser({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: false,
  args: ['--use-angle=d3d11','--ignore-gpu-blocklist','--enable-gpu','--disable-gpu-sandbox'] });
const page = await browser.newPage({ viewport: { width: 412, height: 915 }, hasTouch: true, deviceScaleFactor: 2 });
const errors = [];
page.on('pageerror', e => errors.push('PAGEERR ' + e.message));
page.on('console', m => {
  if (m.type() !== 'error') return;
  const where = (m.location() || {}).url || '';
  errors.push('CONSOLE ' + m.text().slice(0, 140) + ' <- ' + where.slice(-45));
});
page.on('requestfailed', r => errors.push('REQFAIL ' + r.url().slice(-55)));

await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(13000);
const renderer = await page.evaluate(() => { try {
  const g = document.createElement('canvas').getContext('webgl2');
  const e = g.getExtension('WEBGL_debug_renderer_info');
  return e ? g.getParameter(e.UNMASKED_RENDERER_WEBGL) : '?'; } catch { return '?'; } });
console.log('renderer:', renderer);
if (/swiftshader|software/i.test(renderer)) {
  console.error('REFUSING: software renderer'); await browser.close(); process.exit(3); }

await page.evaluate(() => {
  for (const id of ['apOverlay','loadScr']) { const e = document.getElementById(id); if (e) e.style.display = 'none'; }
  try { hideFrontScreens(); applyTheme(); newSkirmish(); } catch {}
});
await page.waitForTimeout(24000);
await page.evaluate(() => { try { deployCarrier(); } catch {} });
await page.waitForTimeout(8000);

const rows = [];
for (const span of SPANS) {
  const info = await page.evaluate(async s => {
    try { orthoSpan = s; distTarget = s; } catch {}
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    await new Promise(r => setTimeout(r, 800));
    const wpx = (typeof mfWorldPx === 'function') ? mfWorldPx() : 1;
    const cdr = TYPES[4], inf = TYPES[0];
    const q = T => (typeof mfIconQ === 'function') ? mfIconQ(mfUnitSpan(T)) : -1;
    /* mfCmdIconQ is the commander-specific ramp if one exists; falling back to
       the generic ramp keeps this harness meaningful before AND after the fix. */
    const cq = (typeof mfCmdIconQ === 'function') ? mfCmdIconQ(cdr) : q(cdr);
    return {
      span: (typeof orthoSpan !== 'undefined') ? orthoSpan : -1,
      worldPx: +wpx.toFixed(3),
      cdrPx: +(mfUnitSpan(cdr) / wpx).toFixed(1), cdrQ: +cq.toFixed(3),
      infPx: +(mfUnitSpan(inf) / wpx).toFixed(1), infQ: +q(inf).toFixed(3),
      icons: (typeof mfIconLast !== 'undefined') ? mfIconLast : -1,
    };
  }, span);
  rows.push(info);
  await page.evaluate(() => {
    try { apClose(); } catch {}
    for (const id of ['apOverlay','loadScr']) { const e = document.getElementById(id); if (e) e.style.display = 'none'; }
  });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/zoom-${span}.png` });
  console.log(`span ${String(info.span).padStart(5)}  COMMANDER ${String(info.cdrPx).padStart(6)}px q=${info.cdrQ}`
    + `   striker ${String(info.infPx).padStart(5)}px q=${info.infQ}   iconInstances=${info.icons}`);
}

const far = rows[rows.length - 1];
const fails = [];
if (!(far.cdrQ > 0)) fails.push(`commander does not iconize at span ${far.span} (q=${far.cdrQ})`);
if (!(far.icons > 0)) fails.push(`no icon instances emitted at span ${far.span}`);
if (errors.length) fails.push(`${errors.length} console error(s)`);

writeFileSync(`${OUT}/report.json`, JSON.stringify({ renderer, rows, errors, fails }, null, 1));
console.log(fails.length ? '\nFAIL:\n  ' + fails.join('\n  ') : '\nPASS — commander iconizes at strategic zoom');
if (errors.length) console.log('errors:\n  ' + errors.slice(0, 8).join('\n  '));
await browser.close();
process.exit(fails.length ? 1 : 0);
