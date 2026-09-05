#!/usr/bin/env node
/* Can a player actually get the optional content the launcher offers?
 *
 * Both optional downloads were broken, for different reasons, and nothing
 * checked either:
 *
 *   Galactic  mfExplorationRemoteSpec() took its manifest from the stub but its
 *             base from packEndpoint(), which is derived from UPDATE_URL. Once
 *             that moved to the Cloudflare worker the base became a worker path
 *             that 404s -- the worker mirrors release payloads, not optional
 *             content. The manifest still loaded, so the install registered and
 *             then failed on its first byte.
 *
 *   Audio     the worker's packs.json had drifted from the origin's: music with
 *             15 files and NO voice pack, against the origin's music (11) plus
 *             voice (324 files, 5.2 MB). The launcher advertises the combined
 *             "voices + music, 21 MB", so it offered content the client could
 *             not see.
 *
 * Runs in the real page so it exercises the real resolution code, then proves
 * delivery by fetching actual bytes. verify-release-channels does this for
 * releases; optional content had no equivalent.
 *
 * Usage:  node tools/probe-optional-downloads.mjs
 * Exit: 0 if every offered pack resolves and serves bytes. */
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

const findings = [];
const record = (name, ok, detail) => {
  findings.push({ name, ok, detail });
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (detail ? ' — ' + detail : ''));
};

const server = await startServer();
const browser = await launchPwBrowser({ ownershipMode: 'isolated', headless: true });
try {
  const page = await (await browser.newContext({ viewport: { width: 900, height: 700 } })).newPage();
  await page.goto(server.url, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction(() => typeof packLoadIndex === 'function'
    && typeof mfExplorationRemoteSpec === 'function' && typeof packFileUrl === 'function',
    null, { timeout: 180000 });

  /* ---- the generic pack catalog the player is offered ---- */
  const cat = await page.evaluate(async () => {
    const idx = await packLoadIndex();
    if (!idx) return { err: 'packLoadIndex returned nothing' };
    const out = {};
    for (const id in idx) {
      const m = idx[id];
      const files = (m && m.files) || [];
      out[id] = { files: files.length, bytes: files.reduce((a, f) => a + (Number(f.size) || 0), 0),
        baseUrl: (m && m.baseUrl) || '', sample: files[0] ? packFileUrl(packEndpoint(), id, files[0], m) : '' };
    }
    return { packs: out, endpoint: packEndpoint() };
  });
  if (cat.err) record('optional pack catalog loads', false, cat.err);
  else {
    const ids = Object.keys(cat.packs);
    record('optional pack catalog loads', ids.length > 0,
      `endpoint=${cat.endpoint || '(none)'} packs=${ids.join(', ') || '(none)'}`);
    /* The launcher offers "voices + music". Both must be present, or it is
       advertising something the client cannot reach. */
    for (const want of ['music', 'voice']) {
      const p = cat.packs[want];
      record(`the ${want} pack is offered to the client`, !!p,
        p ? `${p.files} files, ${(p.bytes / 1048576).toFixed(1)} MB` : 'absent from the catalog the client sees');
    }
    /* Bytes, not just an entry. */
    for (const id of ids) {
      const p = cat.packs[id];
      if (!p.sample) { record(`${id}: a real file is fetchable`, false, 'pack lists no files'); continue; }
      const got = await page.evaluate(async (u) => {
        try { const r = await fetch(u, { cache: 'no-store' }); return { status: r.status, bytes: (await r.arrayBuffer()).byteLength }; }
        catch (e) { return { status: 0, err: String((e && e.message) || e) }; }
      }, p.sample);
      record(`${id}: a real file is fetchable`, got.status === 200 && got.bytes > 0,
        got.err ? got.err : `HTTP ${got.status}, ${got.bytes} bytes`);
    }
  }

  /* ---- Galactic exploration ---- */
  const exp = await page.evaluate(async () => {
    const spec = await mfExplorationRemoteSpec();
    const out = { base: spec.base, manifest: spec.manifest };
    try {
      const r = await fetch(spec.manifest, { cache: 'no-store' });
      out.manifestStatus = r.status;
      if (r.ok) {
        const m = await r.json();
        out.files = (m.files || []).length;
        out.totalBytes = Number(m.totalBytes) || 0;
        const f = (m.files || [])[0];
        if (f) {
          out.sample = spec.base.replace(/\/?$/, '/') + String(f.path).split('/').map(encodeURIComponent).join('/')
            + (spec.downloadQuery || '');
          const h = await fetch(out.sample, { method: 'GET', headers: { Range: 'bytes=0-1023' }, cache: 'no-store' });
          out.fileStatus = h.status;
          out.fileBytes = (await h.arrayBuffer()).byteLength;
        }
      }
    } catch (e) { out.err = String((e && e.message) || e); }
    return out;
  });
  record('Galactic manifest resolves', exp.manifestStatus === 200,
    `base=${(exp.base || '(none)').replace(/^https:\/\//, '')} manifest HTTP ${exp.manifestStatus || '-'}` +
    (exp.files ? ` files=${exp.files} ${(exp.totalBytes / 1048576).toFixed(1)} MB` : ''));
  record('Galactic content bytes are fetchable from that base',
    exp.fileStatus === 200 || exp.fileStatus === 206,
    exp.err ? exp.err : `HTTP ${exp.fileStatus || '-'} ${exp.fileBytes || 0} bytes` +
      (exp.sample ? `  (${exp.sample.replace(/^https:\/\/[^/]+/, '')})` : ''));

  await page.context().close();
} finally {
  await closePwBrowser(browser).catch(() => {});
  await server.close();
}

const bad = findings.filter((f) => !f.ok);
console.log('');
if (bad.length) {
  console.log(`OPTIONAL CONTENT UNREACHABLE — ${bad.length} of ${findings.length} checks failed:`);
  for (const b of bad) console.log(`  - ${b.name}: ${b.detail}`);
  process.exit(1);
}
console.log(`OPTIONAL CONTENT VERIFIED — all ${findings.length} checks passed.`);
process.exit(0);
