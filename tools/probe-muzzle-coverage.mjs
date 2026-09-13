#!/usr/bin/env node
/* Do units fire from their barrels, or from the middle of themselves?
 *
 * `muzzle` is the forward offset the firing effect spawns at. Most unit model
 * returns never declared one and took the `||0` in models.js, which puts the
 * flash and tracer origin inside the chassis — the reported "some units have no
 * attack animation". mfDeriveMuzzle now falls back to the turret's forward
 * extent, because barrels are built along +X and the geometry already knows
 * where the tip is.
 *
 * A derivation you cannot check is a guess. This runs the real model builders
 * in the real page and compares derived against DECLARED for every model that
 * declares one: if it reproduces the authored numbers, applying it to the rest
 * is justified. Then it reports coverage per faction.
 *
 * Usage:  node tools/probe-muzzle-coverage.mjs
 * Exit: 0 if every model ends up with a nonzero firing origin and the
 *       derivation tracks the authored values. */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, relative, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchPwBrowser, closePwBrowser } from './pw-browser.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
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

const server = await startServer();
const browser = await launchPwBrowser({ ownershipMode: 'isolated', headless: true });
let failed = false;
try {
  const page = await (await browser.newContext({ viewport: { width: 900, height: 700 } })).newPage();
  await page.goto(server.url, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction(() => typeof FAC_KIT === 'object' && FAC_KIT
    && typeof mfDeriveMuzzle === 'function', null, { timeout: 180000 });

  const data = await page.evaluate(() => {
    const rows = [], seen = {};
    for (const fac in FAC_KIT) {
      for (const ty in FAC_KIT[fac]) {
        const fn = FAC_KIT[fac][ty];
        if (!fn || seen[fac + '|' + fn.name]) continue;
        seen[fac + '|' + fn.name] = 1;
        let g;
        try { g = fn(); } catch (e) { rows.push({ fac, name: fn.name, err: String(e.message || e) }); continue; }
        rows.push({
          fac, name: fn.name,
          declared: Number(g && g.muzzle) || 0,
          derived: Number(mfDeriveMuzzle(g)) || 0,
          hasTur: !!(g && g.tur && g.tur.v && g.tur.v.length)
        });
      }
    }
    return rows;
  });

  const ok = data.filter((r) => !r.err);
  const withDecl = ok.filter((r) => r.declared > 0);
  console.log(`models built: ${ok.length}   declaring a muzzle: ${withDecl.length}`);
  console.log('');
  console.log('VALIDATION — derived vs authored, on the models that declare one:');
  let worst = 0;
  for (const r of withDecl) {
    const ratio = r.derived > 0 ? r.derived / r.declared : 0;
    worst = Math.max(worst, Math.abs(1 - ratio));
    console.log(`  ${(r.fac + '/' + r.name).padEnd(34)} declared ${r.declared.toFixed(2).padStart(7)}   derived ${r.derived.toFixed(2).padStart(7)}   x${ratio.toFixed(2)}`);
  }
  const tracks = worst <= 0.45;
  console.log(`  -> worst deviation ${(worst * 100).toFixed(0)}%  ${tracks ? 'the derivation tracks the authored values' : 'DOES NOT TRACK — do not apply it blindly'}`);
  if (!tracks) failed = true;

  console.log('');
  console.log('COVERAGE — firing origin per faction:');
  const facs = [...new Set(ok.map((r) => r.fac))].sort();
  for (const f of facs) {
    const rs = ok.filter((r) => r.fac === f);
    const before = rs.filter((r) => r.declared > 0).length;
    const after = rs.filter((r) => (r.declared || r.derived) > 0).length;
    const stillZero = rs.filter((r) => (r.declared || r.derived) <= 0);
    console.log(`  ${f.padEnd(12)} ${rs.length} models   at the barrel before: ${String(before).padStart(2)}   after: ${String(after).padStart(2)}` +
      (stillZero.length ? `   STILL AT ORIGIN: ${stillZero.map((r) => r.name).join(', ')}` : ''));
    if (stillZero.length) failed = true;
  }
  const errs = data.filter((r) => r.err);
  if (errs.length) { console.log(`\nmodel builders that threw: ${errs.length}`); errs.slice(0, 5).forEach((e) => console.log(`  ${e.fac}/${e.name}: ${e.err}`)); failed = true; }
} finally {
  await closePwBrowser(browser).catch(() => {});
  await server.close();
}
console.log('');
console.log(failed ? 'MUZZLE COVERAGE FAILED — some units still fire from their own centre.'
  : 'MUZZLE COVERAGE VERIFIED — every model has a barrel-forward firing origin.');
process.exit(failed ? 1 : 0);
