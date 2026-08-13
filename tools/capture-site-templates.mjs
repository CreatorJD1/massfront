/* Site template acceptance.

     node tools/capture-site-templates.mjs [port]

   REAL GPU ONLY (docs/POSTMORTEM-1.33.31-REGRESSION.md).

   Asserts an authored template actually became world state, not just data:
     1. the WORLD_KIT meshes were built (their initialiser used to sit below a
        disabled flag, so the geometry existed and was never decoded)
     2. templated zones appear in cityZones, tagged tpl:1
     3. those zones produced relics of kind 6/7 carrying a role
     4. every role resolves to a real kit mesh -- an unresolved role would draw
        the derelict fallback and look like a template that "worked"
     5. no kit InstMesh exceeds its 320-instance capacity
     6. no console errors                                                     */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const PORT = process.argv[2] || '8992';
const OUT = 'releases/site-templates';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: false,
  args: ['--use-angle=d3d11','--ignore-gpu-blocklist','--enable-gpu','--disable-gpu-sandbox'] });
const page = await browser.newPage({ viewport: { width: 412, height: 915 }, hasTouch: true, deviceScaleFactor: 2 });
const errors = [];
const OPTIONAL = /tacticons\.png/;
page.on('pageerror', e => errors.push('PAGEERR ' + e.message));
page.on('console', m => {
  if (m.type() !== 'error') return;
  const where = (m.location() || {}).url || '';
  if (OPTIONAL.test(where) || OPTIONAL.test(m.text())) return;
  errors.push('CONSOLE ' + m.text().slice(0, 160) + ' <- ' + where.slice(-45));
});

await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(13000);
const renderer = await page.evaluate(() => { try {
  const g = document.createElement('canvas').getContext('webgl2');
  const e = g.getExtension('WEBGL_debug_renderer_info');
  return e ? g.getParameter(e.UNMASKED_RENDERER_WEBGL) : '?'; } catch { return '?'; } });
console.log('renderer:', renderer);
if (/swiftshader|software/i.test(renderer)) {
  console.error('REFUSING: software renderer'); await browser.close(); process.exit(3); }

/* vanguard carries outpost:2 relic:1 in MAPDEFS. */
await page.evaluate(() => {
  for (const id of ['apOverlay','loadScr']) { const e=document.getElementById(id); if (e) e.style.display='none'; }
  try { hideFrontScreens(); applyTheme(); if (typeof curMap !== 'undefined') curMap = 'vanguard'; newSkirmish(); } catch {}
});
await page.waitForTimeout(26000);

const R = await page.evaluate(() => {
  const kit = (typeof WORLD_KIT !== 'undefined') ? WORLD_KIT : {};
  const kitKeys = Object.keys(kit);
  const zones = (typeof cityZones !== 'undefined' ? cityZones : []).map(z => ({ name: z.name, tpl: !!z.tpl, r: z.r }));
  const rel = (typeof relics !== 'undefined' ? relics : []);
  const kitRelics = rel.filter(r => r.kind === 6 || r.kind === 7);
  const roles = {}; for (const r of kitRelics) roles[r.role || '(none)'] = (roles[r.role || '(none)'] || 0) + 1;
  const unresolved = Object.keys(roles).filter(k => k === '(none)' || !kit[k]);
  const caps = {};
  for (const k of kitKeys) { const m = kit[k].mesh; caps[k] = { cap: m && m.cap !== undefined ? m.cap : '?', n: m && m.n !== undefined ? m.n : '?' }; }
  const rej = (typeof SITE_REJ !== 'undefined') ? SITE_REJ : null;
  const mapKey = (typeof curMap !== 'undefined') ? curMap : '(curMap undefined)';
  const def = (typeof MAPDEFS !== 'undefined' && MAPDEFS[mapKey]) || null;
  return { rej, mapKey, wantOutpost: def ? (def.outpost|0) : -1, wantRelic: def ? (def.relic|0) : -1,
           haveTplFn: typeof siteTemplateFor === 'function',
           tplIds: (typeof SITE_TPL !== 'undefined') ? Object.keys(SITE_TPL).length : -1,
           kitKeys, tplZones: zones.filter(z => z.tpl), allZones: zones.length,
           relics: rel.length, kitRelics: kitRelics.length, roles, unresolved, caps,
           propsDrained: (typeof sitePropQueue !== 'undefined') ? sitePropQueue.length : -1 };
});

console.log('map             :', R.mapKey, ' wants outpost', R.wantOutpost, 'relic', R.wantRelic,
  '| siteTemplateFor', R.haveTplFn, '| SITE_TPL ids', R.tplIds);
console.log('placement rej   :', JSON.stringify(R.rej));
console.log('WORLD_KIT built :', R.kitKeys.join(', ') || '(NONE)');
console.log('zones           :', R.allZones, 'total,', R.tplZones.length, 'templated ->',
  R.tplZones.map(z => z.name).join(' | ') || '(none)');
console.log('relics          :', R.relics, 'total,', R.kitRelics, 'kit (kind 6/7)');
console.log('roles used      :', JSON.stringify(R.roles));
console.log('prop queue      :', R.propsDrained, '(0 = drained)');

/* Deploy first. Before the carrier lands the camera is pinned to the landing
   zone, so cam.x/cam.y assignments are overwritten every frame and every
   screenshot shows the spawn regardless of where the sites are. */
await page.evaluate(() => { try { deployCarrier(); } catch {} });
await page.waitForTimeout(6000);

/* Shoot every templated site, framed to its own radius. Counts alone would not
   catch a role that resolves to a mesh which never draws. */
for (let i = 0; i < R.tplZones.length; i++) {
  const nm = await page.evaluate(idx => {
    const Z = cityZones.filter(z => z.tpl)[idx];
    if (!Z) return null;
    /* The relic pass is fog-gated (render3d.js:828). Authored sites sit in
       unexplored ground, so without lifting fog the capture shows empty terrain
       and the counts alone would look like a rendering failure. Lifted only for
       the screenshot -- the gate itself is untouched and still under test by
       tools/test-fog-pickups.mjs. */
    if (!window.__fogLifted) { window.__fogLifted = 1; window.fogPointVisible = () => true; }
    /* camFollow re-centres the camera on its target every frame, so setting
       cam.x/y without releasing it moves nothing. */
    if (typeof camFollow !== 'undefined') camFollow = -1;
    cam.x = Z.x; cam.y = Z.y;
    orthoSpan = distTarget = Math.max(520, Z.r * 2.6);
    if (typeof clampCam === 'function') clampCam();
    return Z.name;
  }, i);
  if (!nm) continue;
  await page.waitForTimeout(2200);
  await page.evaluate(() => { try { apClose(); } catch {}
    for (const id of ['apOverlay','loadScr']) { const e=document.getElementById(id); if (e) e.style.display='none'; } });
  await page.waitForTimeout(500);
  const f = `${OUT}/site-${i}-${nm.toLowerCase().replace(/[^a-z0-9]+/g,'-')}.png`;
  await page.screenshot({ path: f });
  console.log('  captured', f.split('/').pop());
}

const fails = [];
if (!R.kitKeys.length) fails.push('WORLD_KIT is empty — initWorldKit() did not run');
if (!R.tplZones.length) fails.push('no templated zones were stamped');
if (!R.kitRelics) fails.push('no kind 6/7 relics were produced');
if (R.unresolved.length) fails.push('roles with no kit mesh (would draw the derelict fallback): ' + R.unresolved.join(', '));
for (const [k, c] of Object.entries(R.caps)) if (c.n !== '?' && c.cap !== '?' && c.n > c.cap) fails.push(`${k} exceeded instance cap ${c.n}/${c.cap}`);
if (R.propsDrained > 0) fails.push(`sitePropQueue not drained (${R.propsDrained} left)`);
if (errors.length) fails.push(`${errors.length} console error(s)`);

writeFileSync(`${OUT}/report.json`, JSON.stringify({ renderer, ...R, errors, fails }, null, 1));
console.log(fails.length ? '\nFAIL:\n  ' + fails.join('\n  ') : '\nPASS — authored sites stamped and rendering');
if (errors.length) console.log('errors:\n  ' + errors.slice(0, 6).join('\n  '));
await browser.close();
process.exit(fails.length ? 1 : 0);
