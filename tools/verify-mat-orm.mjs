#!/usr/bin/env node
/* GPU read-back verification of the packed material atlas.

   Boots the game exactly as shipped (premade mat-*.png path), binds matOrmTex
   to a framebuffer and reads every tile back, then compares the texels the GPU
   actually holds against the MAT_GLOSS / MAT_METAL / MAT_EMIS tables. This is
   the check that would have caught the 1.33.x ORM bake: the alpha channel
   (metalness, mesh.js FS3D `metal=orm.a`) was 255 across the whole atlas, so
   every surface in the game — concrete, chitin, tread, earth — shaded as bare
   metal, and the emissive channel was scaled down by each tile's metal
   fraction (LAMP glowed at exactly 0).

   Also re-uploads the ORM through mfTexBlitResize(1408), the path a mobile GPU
   takes, and reads that back too: the old canvas resample premultiplied by
   alpha, which a desktop-only check never sees.

   Usage:  node tools/verify-mat-orm.mjs [--json]
   Exit 0 = every tile matches, 1 = mismatches, 3 = no hardware GPU. */
import { launchPwBrowser, closePwBrowser } from './pw-browser.mjs';
import { assertHardwareGpu } from './chrome-gpu.mjs';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const asJson = process.argv.includes('--json');
const MIME = {
  '.html':'text/html', '.js':'text/javascript', '.mjs':'text/javascript', '.css':'text/css',
  '.json':'application/json', '.png':'image/png', '.jpg':'image/jpeg', '.svg':'image/svg+xml',
  '.ogg':'audio/ogg', '.m4a':'audio/mp4', '.wav':'audio/wav', '.webmanifest':'application/manifest+json'
};
const server = createServer(async (req, res) => {
  try {
    let p = decodeURIComponent((req.url || '/').split('?')[0]);
    if (p === '/') p = '/index.html';
    const file = resolve(join(root, p));
    if (!file.startsWith(root) || !existsSync(file)) { res.writeHead(404); res.end('nf'); return; }
    res.writeHead(200, { 'Content-Type': MIME[extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(await readFile(file));
  } catch (e) { res.writeHead(500); res.end(); }
});
await new Promise(r => server.listen(8917, r));

const browser = await launchPwBrowser();
let failed = false;
try {
  const page = await browser.newPage({ viewport: { width: 900, height: 900 } });
  const pageErrs = [];
  page.on('pageerror', e => pageErrs.push(e.message.slice(0, 160)));
  await page.goto('http://127.0.0.1:8917/', { waitUntil: 'domcontentloaded' });
  await assertHardwareGpu(page);
  await page.waitForTimeout(9000);
  await page.evaluate(() => {
    for (const id of ['apOverlay', 'loadScr']) { const e = document.getElementById(id); if (e) e.style.display = 'none'; }
    try { hideFrontScreens(); } catch (e) {}
    try { newSkirmish(); } catch (e) {}
  });
  await page.waitForFunction(
    () => typeof matOrmTex !== 'undefined' && matOrmTex && typeof MAT_GLOSS !== 'undefined',
    { timeout: 60000 });
  await page.waitForTimeout(3000);

  const report = await page.evaluate(() => {
    const TILES = MAT_TILES, TS = MAT_TS, ATLAS = MAT_ATLAS;
    const readTex = (tex, size) => {
      const fb = gl.createFramebuffer();
      const prevRead = gl.getParameter(gl.READ_FRAMEBUFFER_BINDING);
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, fb);
      gl.framebufferTexture2D(gl.READ_FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      const status = gl.checkFramebufferStatus(gl.READ_FRAMEBUFFER);
      let px = null;
      if (status === gl.FRAMEBUFFER_COMPLETE) {
        px = new Uint8Array(size * size * 4);
        gl.readPixels(0, 0, size, size, gl.RGBA, gl.UNSIGNED_BYTE, px);
      }
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, prevRead);
      gl.deleteFramebuffer(fb);
      return { status, px };
    };
    const ids = Object.entries(MAT).filter(([, v]) => typeof v === 'number');
    const nameOf = {}; for (const [k, v] of ids) nameOf[v] = k;

    const audit = (px, size, isBlit) => {
      const ts = size / TILES;
      const rows = [], bad = [];
      for (const [name, id] of ids) {
        const cx = Math.floor(((id % TILES) + 0.5) * ts), cy = Math.floor((Math.floor(id / TILES) + 0.5) * ts);
        const c = (cy * size + cx) * 4;
        // full-tile scan: sparse emissive painters (PLATE's four indicator
        // dots) have a near-zero MEAN — only the MAX proves the glow survived
        let sumB = 0, sumR = 0, maxB = 0, n = 0;
        const x0 = (id % TILES) * ts, y0 = Math.floor(id / TILES) * ts;
        for (let y = 0; y < ts; y++) for (let x = 0; x < ts; x++) {
          const o = ((y0 + y) * size + x0 + x) * 4;
          sumR += px[o]; sumB += px[o + 2]; if (px[o + 2] > maxB) maxB = px[o + 2]; n++;
        }
        const expGloss = Math.round((MAT_GLOSS[id] === undefined ? 0.4 : MAT_GLOSS[id]) * 255);
        const expMetal = Math.round((MAT_METAL[id] === undefined ? 0.0 : MAT_METAL[id]) * 255);
        const hasEmis = !!MAT_EMIS[id];
        const row = {
          id, name, gloss: px[c + 1], expGloss, metal: px[c + 3], expMetal,
          emisMean: +(sumB / n).toFixed(1), emisMax: maxB, hasEmis, aoMean: +(sumR / n).toFixed(1)
        };
        rows.push(row);
        if (Math.abs(row.gloss - expGloss) > 2) bad.push(`${name}(${id}) gloss ${row.gloss} != ${expGloss}`);
        if (Math.abs(row.metal - expMetal) > 2) bad.push(`${name}(${id}) metal ${row.metal} != ${expMetal}`);
        /* Blit emissives are cross-checked against the full-res read instead:
           a 2:1 box filter legitimately halves a 1px trace's peak, so an
           absolute threshold would false-fail thin-feature painters. */
        /* 40 splits the real cases: the faintest AUTHORED emissive is CRYST's
           uniform #3a3a3a (58); the old alpha-composited corruption crushed
           full-white painters to <=26 (emis * metal fraction). */
        if (!isBlit && hasEmis && maxB < 40) bad.push(`${name}(${id}) has an emissive painter but baked emissive max is ${maxB}`);
        if (!isBlit && !hasEmis && maxB > 2) bad.push(`${name}(${id}) has NO emissive painter but baked emissive max is ${maxB}`);
        if (row.aoMean < 40) bad.push(`${name}(${id}) AO mean ${row.aoMean} — tile looks unbaked`);
      }
      return { rows, bad };
    };

    const out = { atlas: ATLAS, spot: {}, bad: [], blitBad: null, albedoBad: [] };
    const full = readTex(matOrmTex, ATLAS);
    if (!full.px) return { error: 'matOrmTex framebuffer incomplete: 0x' + full.status.toString(16) };
    const a = audit(full.px, ATLAS);
    out.bad = a.bad;
    for (const r of a.rows) if (['PLATE','CONC','CHITIN','TREAD','LEAF','LAMP','TWR_GLOW','PLASMA_JET','WEAPON_GLOW','DECK_PLATE'].includes(r.name)) out.spot[r.name] = r;

    /* The mobile upload path: 2:1 framebuffer blit. Desktop never takes it,
       so exercise it explicitly with the same premade image. */
    if (typeof mfTexBlitResize === 'function' && typeof matImgOrm !== 'undefined' && matImgOrm) {
      const t = mfTexBlitResize(matImgOrm, 1408);
      const half = readTex(t, 1408);
      gl.deleteTexture(t);
      if (!half.px) out.blitBad = ['blit framebuffer incomplete'];
      else {
        const b = audit(half.px, 1408, true);
        out.blitBad = b.bad;
        const fullBy = {}; for (const r of a.rows) fullBy[r.id] = r;
        for (const r of b.rows) {
          const f = fullBy[r.id];
          if (f.hasEmis && r.emisMax < Math.max(32, f.emisMax * 0.45))
            out.blitBad.push(`${r.name}(${r.id}) emissive max ${r.emisMax} after blit vs ${f.emisMax} at full res`);
          if (!f.hasEmis && r.emisMax > 8)
            out.blitBad.push(`${r.name}(${r.id}) emissive max ${r.emisMax} after blit but no painter`);
        }
      }
    } else out.blitBad = ['mfTexBlitResize or matImgOrm not present in page'];

    /* Albedo spot check: DECK_PLATE (107) shipped as an unbaked black cell. */
    if (typeof matTex !== 'undefined' && matTex) {
      const alb = readTex(matTex, ATLAS);
      if (alb.px) {
        for (const [name, id] of ids) {
          const ts = ATLAS / TILES, x0 = (id % TILES) * ts, y0 = Math.floor(id / TILES) * ts;
          let s = 0, n = 0;
          for (let y = 4; y < ts; y += 16) for (let x = 4; x < ts; x += 16) {
            const o = ((y0 + y) * ATLAS + x0 + x) * 4;
            s += (alb.px[o] + alb.px[o + 1] + alb.px[o + 2]) / 3; n++;
          }
          if (s / n < 6) out.albedoBad.push(`${name}(${id}) albedo mean ${(s / n).toFixed(1)} — black tile`);
        }
      }
    }
    return out;
  });

  if (report.error) { console.error('ERROR ' + report.error); failed = true; }
  else {
    const flat = [...report.bad, ...report.albedoBad, ...(report.blitBad || [])];
    if (asJson) console.log(JSON.stringify(report, null, 2));
    else {
      console.log('spot checks (gloss/metal at tile centre, emissive = tile mean):');
      for (const [k, r] of Object.entries(report.spot))
        console.log(`  ${k.padEnd(12)} gloss ${String(r.gloss).padStart(3)} (exp ${r.expGloss})  metal ${String(r.metal).padStart(3)} (exp ${r.expMetal})  emis ${r.emisMean}${r.hasEmis ? ' (painter present)' : ''}  ao ${r.aoMean}`);
      console.log(`full-atlas mismatches: ${report.bad.length}`);
      for (const b of report.bad) console.log('  FULL  ' + b);
      console.log(`mobile-blit mismatches: ${(report.blitBad || []).length}`);
      for (const b of report.blitBad || []) console.log('  BLIT  ' + b);
      for (const b of report.albedoBad) console.log('  ALBEDO ' + b);
    }
    failed = flat.length > 0;
    if (pageErrs.length) { console.log('page errors:'); for (const e of pageErrs.slice(0, 5)) console.log('  ' + e); }
  }
  console.log(failed ? 'FAIL verify-mat-orm' : 'OK   verify-mat-orm');
} finally {
  await closePwBrowser();
  server.close();
}
process.exit(failed ? 1 : 0);
