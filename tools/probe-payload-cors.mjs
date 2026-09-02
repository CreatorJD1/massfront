#!/usr/bin/env node
/* Can a browser actually download the payloads the manifest advertises?
 *
 * verify-release-channels checks payload CORS with Node's fetch, which follows
 * redirects without enforcing the CORS rule that matters here, so it passed
 * while real devices could not download at all.
 *
 * The rule: adding a Range header makes the request non-simple, so the browser
 * preflights it. If the actual request then answers with a cross-origin
 * redirect, the fetch is rejected outright -- the redirect target never gets a
 * chance to allow it. Hugging Face's resolve/ endpoint 302s to a signed CDN
 * host, so every chunked payload dies this way in a strict engine (Android
 * WebView), surfacing only as a flat "network request failed" on the first
 * chunked file. Unchunked files and the manifest itself are simple GETs, which
 * is why a device could report NETWORK READY, find the update, and still never
 * download it.
 *
 * This runs the fetch inside a real browser from a foreign origin, which is the
 * only way to observe the rejection. It reads only what a client can read.
 *
 * Usage:
 *   node tools/probe-payload-cors.mjs
 *   node tools/probe-payload-cors.mjs --manifest <url>
 * Exit: 0 if every advertised payload is fetchable with a Range from a page. */
import { createServer } from 'node:http';
import { launchPwBrowser, closePwBrowser } from './pw-browser.mjs';

const argv = process.argv.slice(2);
const after = (f) => { const i = argv.indexOf(f); return i < 0 ? '' : String(argv[i + 1] || ''); };
const MANIFESTS = after('--manifest') ? [['given', after('--manifest')]] : [
  ['HF resolve (client endpoint)', 'https://huggingface.co/datasets/CREATORJD/massfront-releases/resolve/main/update.json?download=true'],
  ['Cloudflare worker (mirror)', 'https://massfront-update.jasondixon1994.workers.dev/update.json']
];
const SAMPLE = Number(after('--sample') || 6);

const server = createServer((_req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end('<!doctype html><title>payload cors probe</title>');
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}/`;

const browser = await launchPwBrowser({ ownershipMode: 'isolated', headless: true });
let failures = 0;
try {
  const page = await (await browser.newContext()).newPage();
  await page.goto(origin, { waitUntil: 'domcontentloaded', timeout: 120_000 });

  for (const [label, url] of MANIFESTS) {
    let manifest;
    try { manifest = await (await fetch(url + (url.includes('?') ? '&' : '?') + 'x=' + Date.now(), { cache: 'no-store' })).json(); }
    catch (e) { console.log(`FAIL  ${label}: manifest unreadable (${e.message})`); failures++; continue; }

    /* Chunked files are the ones that carry a Range header, so they are the
       only ones that can hit this. Test those first, then a plain file. */
    const chunked = (manifest.files || []).filter((f) => Array.isArray(f.chunks) && f.chunks.length > 1);
    const plain = (manifest.files || []).filter((f) => !(Array.isArray(f.chunks) && f.chunks.length > 1));
    const picks = [...chunked.slice(0, SAMPLE), ...plain.slice(0, 2)];
    if (!picks.length) { console.log(`FAIL  ${label}: manifest advertises no files`); failures++; continue; }

    const host = new URL(picks[0].url).host;
    /* The property that actually decides whether a device can download.
       Chromium follows a cross-origin redirect on a preflighted ranged request,
       so the in-page fetch below passes even when the URL is undeliverable to a
       stricter engine. Android WebView does not, and that is what stranded
       players on a build that could see an update but never fetch it. Assert the
       shape rather than one engine's tolerance of it. */
    const redirects = [];
    for (const f of picks) {
      try {
        const r = await fetch(f.url, { redirect: 'manual', headers: { Range: 'bytes=0-255' }, cache: 'no-store' });
        const loc = r.headers.get('location');
        if (loc) {
          const to = new URL(loc, f.url).host;
          if (to !== new URL(f.url).host) redirects.push(`${f.path}: ${r.status} leaves the origin for ${to}`);
        }
      } catch (e) { redirects.push(`${f.path}: unreachable (${e.message})`); }
    }
    if (redirects.length) {
      console.log(`FAIL  ${label}  payloads redirect off-origin — a strict WebView cannot fetch these`);
      for (const r of redirects.slice(0, 4)) console.log(`        ${r}`);
      failures++;
    }

    const results = await page.evaluate(async (files) => {
      const out = [];
      for (const f of files) {
        try {
          const r = await fetch(f.url, { cache: 'no-store', headers: f.ranged ? { Range: 'bytes=0-1023' } : {} });
          const buf = await r.arrayBuffer();
          out.push({ path: f.path, ranged: f.ranged, ok: r.status === 206 || r.status === 200, status: r.status, bytes: buf.byteLength });
        } catch (e) { out.push({ path: f.path, ranged: f.ranged, ok: false, status: 0, err: String((e && e.message) || e) }); }
      }
      return out;
    }, picks.map((f) => ({ path: f.path, url: f.url, ranged: Array.isArray(f.chunks) && f.chunks.length > 1 })));

    const bad = results.filter((r) => !r.ok);
    console.log(`${bad.length ? 'FAIL' : 'PASS'}  ${label}  v${manifest.version}  host=${host}  ` +
      `${results.length - bad.length}/${results.length} payloads fetchable from a page`);
    for (const b of bad.slice(0, 4))
      console.log(`        ${b.ranged ? 'ranged' : 'plain '} ${b.path}: ${b.err || 'HTTP ' + b.status}`);
    if (bad.length) failures++;
  }
} finally {
  await closePwBrowser(browser).catch(() => {});
  await new Promise((r) => server.close(r));
}

console.log('');
if (failures) {
  console.log('PAYLOAD CORS FAILED — a browser cannot download these payloads. Repoint the ' +
              'manifest at a host that serves ranges without a cross-origin redirect.');
  process.exit(1);
}
console.log('PAYLOAD CORS VERIFIED — every sampled payload, ranged and plain, is fetchable from a page.');
