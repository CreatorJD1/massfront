/* Material-variety audit for structures and units.

     node tools/audit-material-variety.mjs [port]

   THE QUESTION: how many DISTINCT materials does each mesh actually use, and how
   is its surface area distributed across them?

   A structure built from one material over its whole body has no way to read as
   designed: roof, wall, vent, trim and glass all resolve to the same tile, so
   the only thing separating them is the flat-shaded lighting of their facing.
   That is invisible to a triangle count and invisible to a screenshot taken
   from one angle, but it is exact in the vertex data -- the material id rides
   in lane 11 of every 12-float vertex (worldsites.js:85 writes it there).

   Reports per mesh: distinct material count, and the share of TRIANGLE AREA
   held by the dominant material. Area, not triangle count: a thousand tiny
   greeble triangles do not make a surface varied if one slab covers 90% of what
   the player sees.
   ============================================================================ */
import { launchPwBrowser, closePwBrowser } from './pw-browser.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';

const PORT = process.argv[2] || '8992';
const OUT = 'releases/surface-detail';
mkdirSync(OUT, { recursive: true });

const browser = await launchPwBrowser({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true,
  args: ['--use-angle=d3d11','--ignore-gpu-blocklist','--enable-gpu','--disable-gpu-sandbox'] });
const page = await browser.newPage({ viewport: { width: 900, height: 900 } });
await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(14000);
await page.evaluate(() => {
  for (const id of ['apOverlay','loadScr']) { const e=document.getElementById(id); if (e) e.style.display='none'; }
  try { hideFrontScreens(); applyTheme(); newSkirmish(); } catch {}
});
await page.waitForTimeout(22000);

const R = await page.evaluate(() => {
  const VF = (typeof VFLOATS !== 'undefined') ? VFLOATS : 12;
  const MIDLANE = 11;
  /* name -> id, so the report reads in material names not integers */
  const midName = {};
  if (typeof MAT !== 'undefined') for (const k in MAT) midName[MAT[k]] = k;

  const analyse = geo => {
    if (!geo || !geo.v || !geo.i) return null;
    const area = {};                       // mid -> summed triangle area
    let total = 0;
    const idx = geo.i, v = geo.v;
    for (let t = 0; t + 2 < (geo.count || idx.length); t += 3) {
      const a = idx[t] * VF, b = idx[t + 1] * VF, c = idx[t + 2] * VF;
      const ux = v[b] - v[a], uy = v[b + 1] - v[a + 1], uz = v[b + 2] - v[a + 2];
      const wx = v[c] - v[a], wy = v[c + 1] - v[a + 1], wz = v[c + 2] - v[a + 2];
      const cx = uy * wz - uz * wy, cy = uz * wx - ux * wz, cz = ux * wy - uy * wx;
      const ar = 0.5 * Math.hypot(cx, cy, cz);
      if (!isFinite(ar)) continue;
      const mid = v[a + MIDLANE] | 0;
      area[mid] = (area[mid] || 0) + ar; total += ar;
    }
    if (!total) return null;
    const parts = Object.entries(area).map(([m, s]) => ({ mid: +m, name: midName[+m] || ('#' + m), pct: s / total * 100 }))
      .sort((x, y) => y.pct - x.pct);
    return { distinct: parts.length, dom: parts[0], parts: parts.slice(0, 4), tris: Math.round((geo.count || idx.length) / 3) };
  };

  const out = { structures: [], units: [], errors: [] };

  /* Structures, per faction kit. */
  for (const kit of ['nova', 'legion', 'syndicate', 'horde']) {
    let S = null;
    try { S = (typeof factionBldMdlSet === 'function') ? factionBldMdlSet(kit, true) : null; } catch (e) { }
    if (!S || !S.mdl) { out.errors.push('no bld set for ' + kit); continue; }
    for (const key in S.mdl) {
      let g = null;
      try { g = S.mdl[key](); } catch (e) { out.errors.push(kit + '/' + key + ': ' + (e && e.message)); continue; }
      const a = analyse(g);
      if (a) out.structures.push({ kit, key, ...a });
    }
  }

  /* Units, via the faction geometry resolver. */
  for (const kit of ['nova', 'legion', 'syndicate', 'horde']) {
    for (let t = 0; t < (typeof TYPES !== 'undefined' ? TYPES.length : 0); t++) {
      let G = null;
      try { G = (typeof factionUnitGeo === 'function') ? factionUnitGeo(t, kit, true) : null; } catch (e) { continue; }
      if (!G || !G.hull) continue;
      const a = analyse(G.hull);
      if (a) out.units.push({ kit, key: TYPES[t].name, ...a });
    }
  }
  return out;
});

const fmt = r => `${(r.kit + '/' + r.key).padEnd(26)} ${String(r.distinct).padStart(2)} mats  `
  + `dominant ${r.dom.name.padEnd(13)} ${r.dom.pct.toFixed(0).padStart(3)}% of area  ${String(r.tris).padStart(5)} tris`;

const worst = a => a.slice().sort((x, y) => (y.dom.pct - x.dom.pct) || (x.distinct - y.distinct));

console.log('=== STRUCTURES — most uniform first ===');
for (const r of worst(R.structures).slice(0, 18)) console.log(' ', fmt(r));
console.log('\n=== UNITS — most uniform first ===');
for (const r of worst(R.units).slice(0, 12)) console.log(' ', fmt(r));

const su = R.structures, un = R.units;
const single = su.filter(r => r.distinct <= 2 || r.dom.pct >= 80);
console.log(`\nstructures analysed: ${su.length}   units: ${un.length}`);
console.log(`structures where ONE material covers >=80% of area (or <=2 materials total): ${single.length}`
  + ` (${(single.length / Math.max(1, su.length) * 100).toFixed(0)}%)`);
const meanS = su.reduce((s, r) => s + r.dom.pct, 0) / Math.max(1, su.length);
const meanU = un.reduce((s, r) => s + r.dom.pct, 0) / Math.max(1, un.length);
console.log(`mean dominant-material share — structures ${meanS.toFixed(1)}%   units ${meanU.toFixed(1)}%`);
if (R.errors.length) console.log('\nerrors:', R.errors.slice(0, 6).join(' | '));

writeFileSync(`${OUT}/material-variety.json`, JSON.stringify(R, null, 1));
await browser.close();
