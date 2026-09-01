#!/usr/bin/env node
/* Live OTA — end-to-end Download -> Stage -> Apply against production.
 *
 * verify-release-channels proves the channels agree about what they advertise.
 * It does not prove a client can actually take the update. This does: it serves
 * the real shipped source, rewrites only the two version constants in transport
 * so the browser believes it is running an older build, and then lets the real
 * updater talk to the real Hugging Face / Cloudflare channel with no stubs.
 *
 * Rewriting in transport rather than on disk matters: the working tree is never
 * modified, so a failure here cannot leave a half-downgraded source behind.
 *
 * Default --from is the version real players are on, so this measures the exact
 * transfer they will receive, including whether it takes the patch path.
 *
 * Usage:
 *   node tools/probe-live-ota.mjs                 (from 1.33.64, expects newest live)
 *   node tools/probe-live-ota.mjs --from 1.33.60 --expect 1.33.65
 *   node tools/probe-live-ota.mjs --headed
 * Exit: 0 if the live update checks, downloads, stages and applies. */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, relative, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchPwBrowser, closePwBrowser } from './pw-browser.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const argv = process.argv.slice(2);
const after = (f) => { const i = argv.indexOf(f); return i < 0 ? '' : String(argv[i + 1] || ''); };
const headed = argv.includes('--headed');
const FROM = after('--from') || '1.33.64';
let EXPECT = after('--expect');

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.webp': 'image/webp', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.m4a': 'audio/mp4', '.ogg': 'audio/ogg', '.wasm': 'application/wasm',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.ktx2': 'image/ktx2',
  '.glb': 'model/gltf-binary', '.bin': 'application/octet-stream'
};

/* The two constants that decide "am I behind?". Rewritten only in transport. */
function downgrade(requested, text) {
  if (requested.endsWith('/boot.js'))
    return text.replace(/var PACKAGED_REV='[^']+'/, `var PACKAGED_REV='${FROM}'`);
  if (requested.endsWith('/src/updater.js'))
    return text.replace(/const APP_VERSION = '[^']+'/, `const APP_VERSION = '${FROM}'`);
  return text;
}

async function startServer() {
  const server = createServer(async (req, res) => {
    try {
      const pathname = decodeURIComponent(new URL(req.url || '/', 'http://127.0.0.1').pathname);
      const requested = pathname === '/' ? '/index.html' : pathname;
      const file = resolve(root, `.${requested}`);
      const rel = relative(root, file);
      if (!rel || rel.startsWith(`..${sep}`) || resolve(root, rel) !== file || !existsSync(file)) throw new Error('outside root');
      let bytes = await readFile(file);
      if (requested.endsWith('/boot.js') || requested.endsWith('/src/updater.js'))
        bytes = Buffer.from(downgrade(requested, bytes.toString('utf8')), 'utf8');
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

if (!EXPECT) {
  const live = await (await fetch('https://huggingface.co/datasets/CREATORJD/massfront-releases/resolve/main/update.json?download=true',
    { cache: 'no-store' })).json();
  EXPECT = String(live.version);
}
console.log(`Pretending to be v${FROM}; live channel should offer v${EXPECT}.`);

const server = await startServer();
const browser = await launchPwBrowser({ ownershipMode: 'isolated', headless: !headed });
const steps = [];
const step = (name, ok, detail) => { steps.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`); };
try {
  const context = await browser.newContext({ viewport: { width: 412, height: 900 }, colorScheme: 'dark' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String((e && e.message) || e)));
  await page.goto(server.url, { waitUntil: 'domcontentloaded', timeout: 120_000 });

  const api = await page.waitForFunction(() => typeof updCheck === 'function' && typeof updDownload === 'function'
    && typeof updApply === 'function' && typeof UPD === 'object', null, { timeout: 120_000 })
    .then(() => true).catch(() => false);
  step('updater API reachable in the page', api,
    api ? '' : 'updCheck/updDownload/updApply are not global — cannot drive a live update');
  if (!api) throw new Error('updater API unavailable');

  const shown = await page.evaluate(() => (typeof APP_VERSION !== 'undefined' ? String(APP_VERSION) : ''));
  /* If this fails the transport rewrite missed, and everything after it would
     be measuring the wrong thing. */
  step('client reports the older version', shown === FROM, `APP_VERSION=${shown} (wanted ${FROM})`);
  if (shown !== FROM) throw new Error('version downgrade rewrite did not apply');

  /* ---- CHECK against the live channel (no stubs) ---- */
  const checked = await page.evaluate(async () => {
    await updCheck(true);
    for (let i = 0; i < 120 && UPD.state === 'checking'; i++) await new Promise((r) => setTimeout(r, 500));
    return { state: UPD.state, version: UPD.manifest ? String(UPD.manifest.version) : '',
             kind: UPD.manifest ? String(UPD.manifest.kind || '') : '',
             category: UPD.manifest ? String(UPD.manifest.category || '') : '',
             files: UPD.manifest && UPD.manifest.files ? UPD.manifest.files.length : 0,
             source: typeof updSrc !== 'undefined' ? String(updSrc) : '',
             err: UPD.err ? String(UPD.err) : '' };
  });
  step('live check found an update', checked.version === EXPECT,
    `state=${checked.state} version=${checked.version || '(none)'} kind=${checked.kind} ` +
    `category=${checked.category} files=${checked.files} src=${checked.source}${checked.err ? ` err=${checked.err}` : ''}`);

  /* ---- DOWNLOAD the real bytes ---- */
  const downloaded = await page.evaluate(async () => {
    const t0 = Date.now();
    const run = updDownload();
    for (let i = 0; i < 1800 && (UPD.state === 'downloading' || UPD.state === 'staging'); i++)
      await new Promise((r) => setTimeout(r, 500));
    try { await run; } catch (e) { /* state carries the verdict */ }
    return { state: UPD.state, pct: Number(UPD.pct) || 0, got: Number(UPD.got) || 0,
             total: Number(UPD.total) || 0, ms: Date.now() - t0, err: UPD.err ? String(UPD.err) : '' };
  });
  const mb = (n) => (n / 1e6).toFixed(1) + ' MB';
  step('live download + integrity staging', downloaded.state === 'ready',
    `state=${downloaded.state} ${mb(downloaded.got)}/${mb(downloaded.total)} in ${(downloaded.ms / 1000).toFixed(1)}s` +
    `${downloaded.err ? ` err=${downloaded.err}` : ''}`);

  /* ---- APPLY, then prove the new build is what boots ---- */
  if (downloaded.state === 'ready') {
    const applied = await page.evaluate(async () => {
      try { await updApply(); } catch (e) { return { state: UPD.state, err: String((e && e.message) || e) }; }
      for (let i = 0; i < 120 && UPD.state === 'applying'; i++) await new Promise((r) => setTimeout(r, 500));
      return { state: UPD.state, err: UPD.err ? String(UPD.err) : '' };
    }).catch((e) => ({ state: 'navigated', err: '' }));
    step('apply completed without error', applied.state !== 'applyError' && applied.state !== 'error',
      `state=${applied.state}${applied.err ? ` err=${applied.err}` : ''}`);

    await page.goto(server.url, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    await page.waitForFunction(() => typeof updateHUD === 'function', null, { timeout: 120_000 }).catch(() => {});
    const running = await page.evaluate(() => ({
      patched: window.__MASSFRONT_PATCHED ? String(window.__MASSFRONT_PATCHED) : '',
      channel: window.__MASSFRONT_PATCH_CHANNEL ? String(window.__MASSFRONT_PATCH_CHANNEL) : '',
      booted: typeof updateHUD === 'function'
    }));
    step('restart boots the downloaded build', running.patched === EXPECT && running.booted,
      `running=${running.patched || '(packaged)'} channel=${running.channel} booted=${running.booted}`);
  }

  const fatal = errors.filter((e) => !/WebGL|GPU|hardware/i.test(e));
  step('no unrelated page errors during the update', fatal.length === 0,
    fatal.length ? fatal.slice(0, 2).join(' | ') : 'none');

  await context.close();
} finally {
  await closePwBrowser(browser).catch(() => {});
  await server.close();
}

const failed = steps.filter((s) => !s.ok);
console.log('');
if (failed.length) {
  console.log(`LIVE OTA FAILED — ${failed.length} step(s) did not pass:`);
  for (const f of failed) console.log(`  - ${f.name}: ${f.detail}`);
  process.exit(1);
}
console.log(`LIVE OTA VERIFIED — a v${FROM} client checked the live channel, downloaded and verified ` +
            `v${EXPECT}, applied it, and restarted running the new build.`);
