#!/usr/bin/env node
/* Can a device actually download the payloads the manifest advertises?
 *
 * verify-release-channels checks payload CORS with Node's fetch, which follows
 * redirects without enforcing the rule that matters, so it passed while no
 * device could download at all.
 *
 * The rule: a Range header makes the request non-simple, so the browser
 * preflights it. If the actual request then answers with a cross-origin
 * redirect, the fetch is rejected outright -- the redirect target never gets a
 * chance to allow it. Hugging Face's resolve/ endpoint answers small files with
 * a same-origin 307 but LFS-backed files with a 302 to a signed CDN host, so
 * every chunked payload died this way in a strict engine (Android WebView),
 * surfacing only as a flat "network request failed" on the first chunked file.
 * The manifest and small files are same-origin, which is why a device could
 * report NETWORK READY, find the update, and still never download it.
 *
 * Two phases, because they answer different questions:
 *   redirect audit  - is the transport SHAPE deliverable? Pure fetch, no
 *                     browser, always runs. This is the one that catches it.
 *   in-page fetch   - does it work in a real engine? Needs Playwright.
 *                     Chromium tolerates the off-origin redirect, so this alone
 *                     is NOT sufficient -- it is why the bug shipped.
 *
 * Usage:
 *   node tools/probe-payload-cors.mjs
 *   node tools/probe-payload-cors.mjs --no-browser        (publish gate; fast)
 *   node tools/probe-payload-cors.mjs --manifest <url>
 * Exit: 0 if every sampled payload is deliverable to a strict WebView. */
import { createServer } from 'node:http';

const argv = process.argv.slice(2);
const after = (f) => { const i = argv.indexOf(f); return i < 0 ? '' : String(argv[i + 1] || ''); };
const noBrowser = argv.includes('--no-browser');
const MANIFESTS = after('--manifest') ? [['given', after('--manifest')]] : [
  ['HF resolve (client endpoint)', 'https://huggingface.co/datasets/CREATORJD/massfront-releases/resolve/main/update.json?download=true'],
  ['HF raw (mirror)', 'https://huggingface.co/datasets/CREATORJD/massfront-releases/raw/main/update.json'],
  ['Cloudflare worker (mirror)', 'https://massfront-update.jasondixon1994.workers.dev/update.json']
];
const SAMPLE = Number(after('--sample') || 6);

let failures = 0;
const jobs = [];

for (const [label, url] of MANIFESTS) {
  let manifest;
  try {
    manifest = JSON.parse((await (await fetch(url + (url.includes('?') ? '&' : '?') + 'x=' + Date.now(),
      { cache: 'no-store' })).text()).replace(/^\uFEFF/, ''));
  } catch (e) { console.log(`FAIL  ${label}: manifest unreadable (${e.message})`); failures++; continue; }

  /* Chunked files are the only ones that carry a Range header, so they are the
     only ones that can hit this. Test those first, then a couple of plain ones
     so a wholly broken host is still caught. */
  const chunked = (manifest.files || []).filter((f) => Array.isArray(f.chunks) && f.chunks.length > 1);
  const plain = (manifest.files || []).filter((f) => !(Array.isArray(f.chunks) && f.chunks.length > 1));
  const picks = [...chunked.slice(0, SAMPLE), ...plain.slice(0, 2)];
  if (!picks.length) { console.log(`FAIL  ${label}: manifest advertises no files`); failures++; continue; }

  /* ---- phase 1: transport shape (no browser) ---- */
  const offOrigin = [];
  for (const f of picks) {
    const ranged = Array.isArray(f.chunks) && f.chunks.length > 1;
    try {
      const r = await fetch(f.url, { redirect: 'manual', cache: 'no-store',
        headers: ranged ? { Range: 'bytes=0-255' } : {} });
      const loc = r.headers.get('location');
      if (loc) {
        const to = new URL(loc, f.url).host;
        if (to !== new URL(f.url).host)
          offOrigin.push(`${ranged ? 'ranged' : 'plain '} ${f.path}: ${r.status} leaves the origin for ${to}`);
      } else if (ranged && r.status !== 206) {
        offOrigin.push(`ranged ${f.path}: answered ${r.status}, not 206`);
      }
    } catch (e) { offOrigin.push(`${f.path}: unreachable (${e.message})`); }
  }
  const host = new URL(picks[0].url).host;
  if (offOrigin.length) {
    console.log(`FAIL  ${label}  v${manifest.version}  host=${host} — payloads are NOT deliverable to a strict WebView`);
    for (const o of offOrigin.slice(0, 4)) console.log(`        ${o}`);
    failures++;
  } else {
    console.log(`PASS  ${label}  v${manifest.version}  host=${host} — ${picks.length} payloads, no off-origin redirect`);
  }
  jobs.push({ label, picks });
}

/* ---- phase 2: a real engine, from a foreign origin ---- */
if (!noBrowser && jobs.length) {
  const { launchPwBrowser, closePwBrowser } = await import('./pw-browser.mjs');
  const server = createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end('<!doctype html><title>payload cors probe</title>');
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const browser = await launchPwBrowser({ ownershipMode: 'isolated', headless: true });
  try {
    const page = await (await browser.newContext()).newPage();
    await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    for (const { label, picks } of jobs) {
      const results = await page.evaluate(async (files) => {
        const out = [];
        for (const f of files) {
          try {
            const r = await fetch(f.url, { cache: 'no-store', headers: f.ranged ? { Range: 'bytes=0-1023' } : {} });
            const buf = await r.arrayBuffer();
            out.push({ path: f.path, ok: r.status === 206 || r.status === 200, status: r.status, bytes: buf.byteLength });
          } catch (e) { out.push({ path: f.path, ok: false, status: 0, err: String((e && e.message) || e) }); }
        }
        return out;
      }, picks.map((f) => ({ path: f.path, url: f.url, ranged: Array.isArray(f.chunks) && f.chunks.length > 1 })));
      const bad = results.filter((r) => !r.ok);
      console.log(`${bad.length ? 'FAIL' : 'PASS'}  ${label}  in-page fetch ${results.length - bad.length}/${results.length}` +
        `${bad.length ? '' : '  (note: Chromium tolerates off-origin redirects; phase 1 is the real gate)'}`);
      for (const b of bad.slice(0, 3)) console.log(`        ${b.path}: ${b.err || 'HTTP ' + b.status}`);
      if (bad.length) failures++;
    }
  } finally {
    await closePwBrowser(browser).catch(() => {});
    await new Promise((r) => server.close(r));
  }
}

console.log('');
if (failures) {
  console.log('PAYLOAD DELIVERY FAILED — a strict WebView cannot download this release.');
  console.log('Fix: node tools/mirror-release-to-cloudflare.mjs --version <v> --apply');
  console.log('     node tools/repoint-manifests-to-mirror.mjs --apply');
  process.exit(1);
}
console.log('PAYLOAD DELIVERY VERIFIED — every sampled payload is fetchable without an off-origin redirect.');
/* Explicit, because the failure path exits and the success path did not: undici
   holds its keep-alive sockets open, so this hung for the full timeout after
   printing a pass. A publish gate that never returns is worse than one that
   fails -- it stalls the release instead of reporting on it. */
process.exit(0);
