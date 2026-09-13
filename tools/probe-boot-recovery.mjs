#!/usr/bin/env node
/* boot.js recovery — real-browser, real-IndexedDB fault injection.
 *
 * Every existing updater test runs boot/apply logic inside node:vm against a
 * hand-written IndexedDB stand-in. That proves the algorithms, but it cannot
 * prove the one property players actually depend on: that a damaged update
 * record on a real device still lets the game start. A phone that cannot boot
 * cannot be fixed over the air, so this is the single most expensive class of
 * failure in the product.
 *
 * This probe writes deliberately broken records into the real
 * massfront-updates / bundles store in Chrome, reloads, and requires that the
 * packaged build still comes up every time. It asserts recovery, not rejection:
 * refusing a bad bundle is only correct if something still boots afterwards.
 *
 * Usage:
 *   node tools/probe-boot-recovery.mjs [--headed] [--only <name>]
 * Exit: 0 if every scenario boots, 1 otherwise. */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, relative, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchPwBrowser, closePwBrowser } from './pw-browser.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const argv = process.argv.slice(2);
const headed = argv.includes('--headed');
const only = argv.includes('--only') ? String(argv[argv.indexOf('--only') + 1] || '') : '';

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
      if (!rel || rel.startsWith(`..${sep}`) || resolve(root, rel) !== file || !existsSync(file)) throw new Error('outside root');
      const bytes = await readFile(file);
      res.writeHead(200, { 'Cache-Control': 'no-store', 'Content-Type': MIME[extname(file).toLowerCase()] || 'application/octet-stream' });
      res.end(bytes);
    } catch {
      res.writeHead(404, { 'Cache-Control': 'no-store', 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
    }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { url: `http://127.0.0.1:${server.address().port}/`, close: () => new Promise((r) => server.close(r)) };
}

const HEX = 'a'.repeat(64);
/* Each scenario is a state a real device can reach: an interrupted apply, a
   half-written record, a rollback pointer whose payload was evicted, a bundle
   from a build that never shipped. None of them may stop the game starting. */
const SCENARIOS = [
  { name: 'clean', detail: 'no update records at all (control)', records: {} },

  { name: 'active-not-an-object', detail: 'active record whose files field is a string',
    records: { active: { version: '99.0.0', channel: 'stable', at: 1, files: 'not-an-object', order: ['a.js'] } } },

  { name: 'active-missing-files', detail: 'newer active version advertising no payload',
    records: { active: { version: '99.0.0', channel: 'stable', at: 1 } } },

  { name: 'schema3-bad-roots', detail: 'schema-3 active whose roots are not 64-hex',
    records: { active: { version: '99.0.0', channel: 'stable', at: 1, schema: 3, order: ['a.js'],
      files: { 'a.js': 'x' }, manifestRoot: 'nope', payloadRoot: 'nope', targetRoot: 'nope',
      fullRoot: 'nope', runtimeRoot: 'nope', sourcePayloadRoot: 'nope',
      manifestKind: 'full', manifestCategory: 'system' } } },

  { name: 'schema3-root-mismatch', detail: 'schema-3 active whose targetRoot and fullRoot disagree',
    records: { active: { version: '99.0.0', channel: 'stable', at: 1, schema: 3, order: ['a.js'],
      files: { 'a.js': 'x' }, manifestRoot: HEX, payloadRoot: HEX, sourcePayloadRoot: HEX,
      fullRoot: HEX, targetRoot: 'b'.repeat(64), runtimeRoot: HEX,
      manifestKind: 'full', manifestCategory: 'system', channelName: 'stable' } } },

  { name: 'orphan-probation', detail: 'probation record naming a bundle that is not installed',
    records: { probation: { version: '99.0.0', channel: 'stable', pendingAt: 12345 } } },

  { name: 'stranded-operation-lease', detail: 'apply lease left behind by a killed process',
    records: { operation: { kind: 'apply', at: 1, target: { version: '99.0.0', channel: 'stable', at: 1 } } } },

  { name: 'dangling-previous-ref', detail: 'rollback pointer whose payload key was evicted',
    records: { previousRef: { key: 'previousA', version: '1.0.0', channel: 'stable', at: 1 } } },

  { name: 'torn-pending', detail: 'half-written pending bundle with meta but no payload',
    records: { pendingMeta: { version: '99.0.0', channel: 'stable', at: 1, storage: 'artifact-v1' } } },

  { name: 'everything-broken', detail: 'all of the above at once',
    records: {
      active: { version: '99.0.0', channel: 'stable', at: 1, files: 'not-an-object' },
      activeMeta: { version: '98.0.0', channel: 'stable', at: 2 },
      pendingMeta: { version: '97.0.0', channel: 'stable', at: 3 },
      previousRef: { key: 'missing-key', version: '1.0.0', channel: 'stable', at: 4 },
      probation: { version: '96.0.0', channel: 'stable', pendingAt: 5 },
      operation: { kind: 'apply', at: 6, target: { version: '95.0.0' } } } }
];

const server = await startServer();
const browser = await launchPwBrowser({ ownershipMode: 'isolated', headless: !headed });
const results = [];
try {
  for (const sc of SCENARIOS) {
    if (only && sc.name !== only) continue;
    const context = await browser.newContext({ viewport: { width: 412, height: 900 }, colorScheme: 'dark' });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String((e && e.message) || e)));

    /* First load creates the database at the version boot.js expects. */
    await page.goto(server.url, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    await page.waitForFunction(() => typeof PACKAGED_REV !== 'undefined' || document.readyState === 'complete',
      null, { timeout: 60_000 }).catch(() => {});

    const seeded = await page.evaluate(async (records) => {
      const db = await new Promise((res, rej) => {
        const r = indexedDB.open('massfront-updates', 1);
        r.onupgradeneeded = () => { const d = r.result; if (!d.objectStoreNames.contains('bundles')) d.createObjectStore('bundles'); };
        r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
      });
      await new Promise((res, rej) => {
        const tx = db.transaction('bundles', 'readwrite'), store = tx.objectStore('bundles');
        store.clear();
        for (const k of Object.keys(records)) store.put(records[k], k);
        tx.oncomplete = res; tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error);
      });
      db.close();
      return Object.keys(records);
    }, sc.records);

    /* Reload so boot.js reads the damaged state on a cold start, exactly as a
       device would after the process that wrote it went away. */
    await page.goto(server.url, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    let booted = false, detail = '';
    try {
      await page.waitForFunction(() => typeof updateHUD === 'function' && typeof resetWorld === 'function',
        null, { timeout: 90_000 });
      booted = true;
    } catch { detail = 'runtime never finished loading'; }

    /* PACKAGED_REV lives inside boot.js's IIFE and is deliberately not global,
       so it cannot be read from here. The observable contract is what boot.js
       publishes: window.__MF_ARTIFACT_BOOT_V1 for a descriptor-capable boot and
       window.__MASSFRONT_PATCHED only when a staged OTA was actually adopted.
       A damaged record must leave the second one unset. */
    const state = await page.evaluate(() => ({
      artifactBoot: window.__MF_ARTIFACT_BOOT_V1 === true,
      patched: window.__MASSFRONT_PATCHED ? String(window.__MASSFRONT_PATCHED) : '',
      shieldLeft: !!document.getElementById('mfBootCover')
    })).catch(() => ({ artifactBoot: false, patched: '', shieldLeft: null }));

    /* A pageerror is only a failure if the game did not recover from it. The
       point of this probe is that a rejected bundle still ends in a running
       game, not that nothing ever throws. */
    /* Recovery means two things: the game runs, and it did not adopt the junk
       we planted. Every seeded bundle above is invalid, so any of them being
       reported as the running patch is a real failure. */
    const adoptedJunk = !!state.patched;
    const ok = booted && !adoptedJunk;
    results.push({ name: sc.name, detail: sc.detail, seeded, ok, booted,
                   artifactBoot: state.artifactBoot, patched: state.patched,
                   shieldLeft: state.shieldLeft, errors: errors.slice(0, 2), note: detail });
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${sc.name.padEnd(24)} ${sc.detail}`);
    if (!ok) {
      console.log(`        booted=${booted} adoptedPatch=${state.patched || '(none)'} ${detail}`);
      if (errors.length) console.log(`        first error: ${errors[0]}`);
    } else {
      console.log(`        recovered: running game, no junk bundle adopted, boot shield cleared=${!state.shieldLeft}`);
    }
    await context.close();
  }
} finally {
  await closePwBrowser(browser).catch(() => {});
  await server.close();
}

const failed = results.filter((r) => !r.ok);
console.log('');
if (failed.length) {
  console.log(`BOOT RECOVERY FAILED — ${failed.length}/${results.length} damaged states did not reach a running game:`);
  for (const f of failed) console.log(`  - ${f.name}: ${f.detail}`);
  process.exit(1);
}
console.log(`BOOT RECOVERY VERIFIED — all ${results.length} damaged update states still booted the packaged build.`);
