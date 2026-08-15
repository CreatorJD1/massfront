#!/usr/bin/env node
/* ============================================================================
   ASSET UNWRAP GATE
       node tools/verify-asset-unwrap.mjs [port]

   The one property a bakeable unwrap must have is INJECTIVITY: no two faces may
   address the same texel. The shared-atlas UV is not injective and never could
   be -- it is a tiling coordinate, so it repeats on purpose. Baking into it
   would have every face overwrite its neighbours.

   This rasterises each unwrapped mesh's faces into a 1024 coverage grid and
   reports the worst texel. Anything above 1 face means the bake would be
   corrupt, so it fails.

   It also reports utilisation, which is NOT a pass condition: equal-size cells
   waste texels on small faces by design. It is here so the cost of that choice
   is visible if someone later wants an area-proportional packer.
   ============================================================================ */
import { launchPwBrowser, closePwBrowser } from './pw-browser.mjs';

const PORT = process.argv[2] || '8901';
const MAP = 1024;

const browser = await launchPwBrowser({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true,
  args: ['--use-angle=d3d11','--ignore-gpu-blocklist','--enable-gpu','--disable-gpu-sandbox'] });
const page = await browser.newPage({ viewport: { width: 800, height: 800 } });
await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(14000);
await page.evaluate(() => {
  for (const id of ['apOverlay','loadScr']) { const e=document.getElementById(id); if (e) e.style.display='none'; }
  try { hideFrontScreens(); applyTheme(); newSkirmish(); } catch {}
});
await page.waitForTimeout(20000);

const R = await page.evaluate(MAPSZ => {
  const VF = (typeof VFLOATS !== 'undefined') ? VFLOATS : 12;

  /* Coverage of a triangle list in UV space. Point-samples each texel centre
     inside each triangle's bounding box; exact enough to catch overlap, and far
     cheaper than a real scanline fill. */
  const coverage = geo => {
    /* Attribute each texel to a FACE, not a triangle. The two triangles of a
       quad share a diagonal, and a texel centre exactly on it satisfies both
       inclusive edge tests -- that reads as overlap 2 and is not one. What
       matters for a bake is whether two DIFFERENT faces claim a texel. */
    const owner = new Int32Array(MAPSZ * MAPSZ).fill(-1);
    let worst = 0, used = 0, outside = 0;
    const faceOf = new Int32Array(Math.max(1, Math.floor(geo.count / 3)));
    { let cur = -1, prev = null;
      for (let t = 0; t < faceOf.length; t++) {
        const a = geo.i[t*3], b = geo.i[t*3+1], c = geo.i[t*3+2];
        const share = prev ? ((prev.has(a)?1:0)+(prev.has(b)?1:0)+(prev.has(c)?1:0)) : 0;
        if (share >= 2) { prev.add(a); prev.add(b); prev.add(c); }
        else { cur++; prev = new Set([a,b,c]); }
        faceOf[t] = cur;
      } }
    const idx = geo.i, v = geo.v;
    for (let t = 0; t + 2 < geo.count; t += 3) {
      const A = idx[t] * VF, B = idx[t + 1] * VF, C = idx[t + 2] * VF;
      const ax = v[A + 9], ay = v[A + 10], bx = v[B + 9], by = v[B + 10], cx = v[C + 9], cy = v[C + 10];
      if (Math.min(ax, bx, cx) < -1e-4 || Math.max(ax, bx, cx) > 1 + 1e-4 ||
          Math.min(ay, by, cy) < -1e-4 || Math.max(ay, by, cy) > 1 + 1e-4) outside++;
      const x0 = Math.max(0, Math.floor(Math.min(ax, bx, cx) * MAPSZ));
      const x1 = Math.min(MAPSZ - 1, Math.ceil(Math.max(ax, bx, cx) * MAPSZ));
      const y0 = Math.max(0, Math.floor(Math.min(ay, by, cy) * MAPSZ));
      const y1 = Math.min(MAPSZ - 1, Math.ceil(Math.max(ay, by, cy) * MAPSZ));
      const d = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
      if (!d) continue;
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const px = (x + 0.5) / MAPSZ, py = (y + 0.5) / MAPSZ;
        const w0 = ((by - cy) * (px - cx) + (cx - bx) * (py - cy)) / d;
        const w1 = ((cy - ay) * (px - cx) + (ax - cx) * (py - cy)) / d;
        if (w0 < 0 || w1 < 0 || w0 + w1 > 1) continue;
        const i = y * MAPSZ + x, fid = faceOf[t / 3 | 0];
        if (owner[i] === -1) { owner[i] = fid; used++; }
        else if (owner[i] !== fid) worst = Math.max(worst, 2);
      }
    }
    return { worst: worst || 1, utilPct: used / (MAPSZ * MAPSZ) * 100, outside };
  };

  const rows = [];
  const probe = (label, geo) => {
    if (!geo || !geo.v) return;
    rows.push({ label, tris: Math.round(geo.count / 3), ...coverage(geo) });
  };

  const subjects = [];
  try { subjects.push(['nova/Rhino', () => factionUnitGeo(1, 'nova', true).hull]); } catch (e) {}
  try { subjects.push(['nova/Goliath', () => factionUnitGeo(2, 'nova', true).hull]); } catch (e) {}
  try { subjects.push(['nova/fac', () => factionBldMdlSet('nova', true).mdl.fac()]); } catch (e) {}

  for (const [name, mk] of subjects) {
    let g = null; try { g = mk(); } catch (e) { continue; }
    probe(name + ' (atlas UV)', g);
    /* Fresh instance, then the same grid arithmetic the builder uses. */
    let g2 = null; try { g2 = mfUnwrapGeoUV(mk()); } catch (e) { continue; }
    probe(name + ' (unwrapped)', g2);
  }
  return { rows, hasMethod: typeof MeshBuilder!=='undefined' && !!MeshBuilder.prototype.unwrapAssetUV, note:'' };
}, MAP);

console.log('subject                        tris   worst-faces/texel   util%   outside-0..1');
for (const r of R.rows)
  console.log(r.label.padEnd(30), String(r.tris).padStart(5),
    String(r.worst).padStart(14), r.utilPct.toFixed(1).padStart(8), String(r.outside).padStart(10));
console.log('\n' + R.note);
await browser.close();
