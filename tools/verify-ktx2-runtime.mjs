#!/usr/bin/env node
/* Does the space module actually decode KTX2 / Basis textures?
 *
 * GLTFLoader has always advertised KHR_texture_basisu, but nothing was ever
 * handed to setKTX2Loader, so a GLB carrying Basis textures silently failed to
 * load its images. The wiring added in
 * modules/space_exploration/src/core/gltf_runtime_loader.js closes that, and
 * this proves it in a real browser on the real GPU rather than by reading code.
 *
 * Three's KTX2Loader ships only as an ES module while this module loads three as
 * a classic script, so the loader chain is vendored under lib/ktx2/ and imports
 * the names it needs from lib/ktx2/three-globals.js. That shim is exactly the
 * kind of thing that parses fine and fails at runtime -- a missing re-export
 * binds undefined and surfaces much later as "X is not a constructor" -- so
 * every stage is checked separately here, and the failure message says which
 * stage broke.
 *
 * The wiring is deliberately fail-soft: a device that cannot build the KTX2
 * chain must still load Draco and plain GLBs. The last check enforces that, by
 * confirming a loader is still produced when no renderer ever registers.
 *
 * Usage:  node tools/verify-ktx2-runtime.mjs [--headed]
 * Exit: 0 only if the chain builds, detects GPU support, and degrades safely. */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, relative, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchPwBrowser, closePwBrowser } from './pw-browser.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const headed = process.argv.includes('--headed');
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.wasm': 'application/wasm',
  '.webp': 'image/webp', '.png': 'image/png', '.ktx2': 'image/ktx2',
  '.glb': 'model/gltf-binary', '.bin': 'application/octet-stream'
};

async function startServer() {
  const server = createServer(async (req, res) => {
    try {
      const pathname = decodeURIComponent(new URL(req.url || '/', 'http://127.0.0.1').pathname);
      const file = resolve(root, `.${pathname}`);
      const rel = relative(root, file);
      if (!rel || rel.startsWith(`..${sep}`) || resolve(root, rel) !== file || !existsSync(file)) throw new Error('outside');
      /* Read BEFORE writing headers: a read that throws after writeHead leaves
         the catch unable to answer, and the server dies on ERR_HTTP_HEADERS_SENT. */
      const body = await readFile(file);
      res.writeHead(200, { 'Cache-Control': 'no-store', 'Content-Type': MIME[extname(file).toLowerCase()] || 'application/octet-stream' });
      res.end(body);
    } catch {
      if (!res.headersSent) res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('nope');
    }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { url: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((r) => server.close(r)) };
}

const findings = [];
const record = (name, ok, detail) => {
  findings.push({ name, ok, detail });
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (detail ? ' — ' + detail : ''));
};

const server = await startServer();
const browser = await launchPwBrowser({ ownershipMode: 'isolated', headless: !headed });
try {
  const page = await (await browser.newContext({ viewport: { width: 800, height: 600 } })).newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String((e && e.message) || e)));
  /* A bare page: the module's classic libs are loaded exactly the way the module
     loads them, so this tests the real script order, not a contrived one. */
  await page.goto(server.url + '/modules/space_exploration/', { waitUntil: 'domcontentloaded', timeout: 120000 })
    .catch(async () => { await page.setContent('<!doctype html><title>ktx2</title>'); });
  await page.setContent('<!doctype html><meta charset="utf-8"><title>ktx2 runtime check</title>');

  const boot = await page.evaluate(async (base) => {
    const load = (src) => new Promise((ok, bad) => {
      const s = document.createElement('script');
      s.src = base + src; s.onload = ok; s.onerror = () => bad(new Error('failed to load ' + src));
      document.head.appendChild(s);
    });
    try {
      await load('/modules/space_exploration/lib/three.min.js');
      await load('/modules/space_exploration/lib/GLTFLoader.js');
      await load('/modules/space_exploration/lib/DRACOLoader.js');
      return { ok: true, three: !!window.THREE, rev: window.THREE && THREE.REVISION,
        gltf: !!(window.THREE && THREE.GLTFLoader), draco: !!(window.THREE && THREE.DRACOLoader) };
    } catch (e) { return { ok: false, err: String((e && e.message) || e) }; }
  }, server.url);
  record('module classic libs load (three + GLTFLoader + DRACOLoader)',
    !!(boot.ok && boot.three && boot.gltf && boot.draco),
    boot.err || `three r${boot.rev} gltf=${boot.gltf} draco=${boot.draco}`);
  if (!boot.ok) throw new Error('classic libs did not load');

  /* The shim is the risky part: it re-publishes 19 named exports off global
     THREE, and a single missing one only bites much later. */
  const shim = await page.evaluate(async (base) => {
    try {
      const m = await import(base + '/modules/space_exploration/lib/ktx2/three-globals.js');
      const names = Object.keys(m);
      const undef = names.filter((n) => m[n] === undefined);
      return { ok: true, count: names.length, undef };
    } catch (e) { return { ok: false, err: String((e && e.message) || e) }; }
  }, server.url);
  record('three-globals shim resolves every export it publishes',
    !!(shim.ok && shim.count >= 19 && shim.undef.length === 0),
    shim.err || `${shim.count} exports, ${shim.undef.length} undefined${shim.undef.length ? ': ' + shim.undef.join(', ') : ''}`);

  const chain = await page.evaluate(async (base) => {
    try {
      const m = await import(base + '/modules/space_exploration/lib/ktx2/KTX2Loader.js');
      return { ok: true, ctor: typeof m.KTX2Loader === 'function' };
    } catch (e) { return { ok: false, err: String((e && e.message) || e) }; }
  }, server.url);
  record('vendored KTX2Loader chain imports', !!(chain.ok && chain.ctor), chain.err || 'KTX2Loader is a constructor');

  /* The whole point: a real renderer, a real GPU support probe, and the loader
     actually attached to GLTFLoader. */
  const wired = await page.evaluate(async (base) => {
    try {
      const mod = await import(base + '/modules/space_exploration/src/core/gltf_runtime_loader.js');
      const before = mod.ktx2Status();
      const canvas = document.createElement('canvas');
      const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
      mod.registerRuntimeRenderer(renderer);
      const loader = await mod.whenKtx2Ready();
      const after = mod.ktx2Status();
      const gltf = mod.createRuntimeGltfLoader();
      return { ok: true, before, after, gotLoader: !!loader,
        attached: !!(gltf && gltf.ktx2Loader), hasDraco: !!(gltf && gltf.dracoLoader),
        /* KTX2Loader delegates the probe to its inner BasisTextureLoader, so the
           detected formats live on basisLoader.workerConfig -- reading the outer
           object always returns nothing and the check passes vacuously. */
        formats: loader && loader.basisLoader && loader.basisLoader.workerConfig
          ? Object.keys(loader.basisLoader.workerConfig).filter((k) => loader.basisLoader.workerConfig[k] === true) : [] };
    } catch (e) { return { ok: false, err: String((e && e.message) || e) }; }
  }, server.url);
  record('renderer registers and the KTX2 loader builds',
    !!(wired.ok && wired.gotLoader && wired.after && wired.after.loader),
    wired.err || `before=${JSON.stringify(wired.before)} after=${JSON.stringify(wired.after)}`);
  record('GLTFLoader receives BOTH the Draco and KTX2 loaders',
    !!(wired.ok && wired.attached && wired.hasDraco),
    wired.err || `ktx2Loader=${wired.attached} dracoLoader=${wired.hasDraco}`);
  /* A probe that detects nothing on a desktop GPU is a broken probe, not a
     device without texture compression. Require at least one target. */
  record('the GPU support probe found real transcode targets',
    !!(wired.ok && (wired.formats || []).length > 0),
    wired.err || `targets: ${(wired.formats || []).join(', ') || 'NONE — the probe is reading the wrong object, or the context exposes no compressed-texture extensions'}`);

  /* Fail-soft contract: no renderer must never mean no models. */
  const soft = await page.evaluate(async (base) => {
    try {
      const mod = await import(base + '/modules/space_exploration/src/core/gltf_runtime_loader.js?nofresh=' + Date.now());
      const gltf = mod.createRuntimeGltfLoader();
      return { ok: true, made: !!gltf, ktx2: !!gltf.ktx2Loader, draco: !!gltf.dracoLoader };
    } catch (e) { return { ok: false, err: String((e && e.message) || e) }; }
  }, server.url);
  record('with no renderer registered, model loading still works',
    !!(soft.ok && soft.made && soft.draco && !soft.ktx2),
    soft.err || `loader built=${soft.made} draco=${soft.draco} ktx2 attached=${soft.ktx2} (must be false)`);

  const fatal = pageErrors.filter((e) => !/WebGL|GPU|hardware/i.test(e));
  record('no unrelated page errors', fatal.length === 0, fatal.slice(0, 2).join(' | ') || 'none');
  await page.context().close();
} finally {
  await closePwBrowser(browser).catch(() => {});
  await server.close();
}

const bad = findings.filter((f) => !f.ok);
console.log('');
if (bad.length) {
  console.log(`KTX2 RUNTIME WIRING FAILED — ${bad.length} of ${findings.length}:`);
  for (const b of bad) console.log(`  - ${b.name}: ${b.detail}`);
  process.exit(1);
}
console.log(`KTX2 RUNTIME WIRING VERIFIED — all ${findings.length} checks passed.`);
process.exit(0);
