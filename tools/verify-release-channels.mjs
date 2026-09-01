#!/usr/bin/env node
/* Prove that every channel a device can read agrees on the same release.
 *
 * Publishing is two steps, not one: tools/publish-hf-release.ps1 writes Hugging
 * Face, and tools/mirror-release-to-cloudflare.mjs copies the verified bytes
 * into R2 and moves the worker's latest.json. Nothing enforced the second step,
 * so a release could sit with Hugging Face on the new version and Cloudflare
 * still advertising the old one. The publisher exits 0 either way and the split
 * is invisible until a device picks the stale mirror and reports a version
 * nobody shipped.
 *
 * This is the gate that makes that state loud. It reads only what a device can
 * read — no local build state, no publisher logs — because a release is what a
 * client can see, not what an upload said.
 *
 * Usage:
 *   node tools/verify-release-channels.mjs                 (expects local update.json's version)
 *   node tools/verify-release-channels.mjs --version 1.33.64
 *   node tools/verify-release-channels.mjs --version 1.33.64 --require updStoredMatchesLegacyBoot
 */
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const argv = process.argv.slice(2);
const after = flag => { const i = argv.indexOf(flag); return i < 0 ? '' : String(argv[i + 1] || ''); };
const REPO = 'CREATORJD/massfront-releases';
const WORKER = 'https://massfront-update.jasondixon1994.workers.dev';
/* The origin the published browser build actually runs on. */
const BROWSER_ORIGIN = 'https://creatorjd-massfront-playtest.static.hf.space';

const CHANNELS = [
  {name:'HF resolve (client endpoint)', url:`https://huggingface.co/datasets/${REPO}/resolve/main/update.json?download=true`},
  {name:'HF raw (mirror)',              url:`https://huggingface.co/datasets/${REPO}/raw/main/update.json`},
  {name:'Cloudflare worker (mirror)',   url:`${WORKER}/update.json`}
];

const failures = [];
const note = m => console.log(m);
const fail = m => { failures.push(m); console.log('  FAIL  ' + m); };

async function getJson(url){
  const r = await fetch(url + (url.includes('?') ? '&' : '?') + 'mf_verify=' + Date.now(),
                        {cache:'no-store'});
  if(!r.ok) throw new Error('HTTP ' + r.status);
  const text = await r.text();
  return JSON.parse(text.replace(/^﻿/, ''));
}

let expected = after('--version');
if(!expected){
  const local = JSON.parse((await readFile(resolve(root,'update.json'),'utf8')).replace(/^﻿/,''));
  expected = String(local.version || '');
  note(`No --version given; expecting the local manifest's v${expected}.`);
}
if(!/^\d+\.\d+\.\d+$/.test(expected)) throw new Error('Use --version x.y.z');

note(`\nEXPECTING v${expected}\n`);

const seen = [];
for(const channel of CHANNELS){
  try{
    const m = await getJson(channel.url);
    const identity = (m.files || []).map(f => `${f.path}:${f.size}:${f.sha256}`).join('|');
    seen.push({channel, manifest:m, identity});
    const version = String(m.version || '');
    note(`${channel.name}\n  version ${version}  files ${(m.files||[]).length}  category ${m.category||'-'}`);
    if(version !== expected)
      fail(`${channel.name} serves v${version}, not v${expected}. ` +
           (channel.name.includes('Cloudflare')
             ? 'Run: node tools/mirror-release-to-cloudflare.mjs --version ' + expected + ' --apply'
             : 'Re-run the publisher for this version.'));
  }catch(e){
    seen.push({channel, manifest:null, identity:''});
    fail(`${channel.name} is unreadable (${e.message}). A device using this source has no update path.`);
  }
}

/* Same version is not the same release. Compare the advertised bytes too: a
   mirror rebuilt from different artifacts under one version number is the
   equivocation the client is written to refuse, and it should never ship. */
const live = seen.filter(s => s.manifest);
if(live.length > 1){
  const base = live[0];
  for(const other of live.slice(1)){
    if(other.identity !== base.identity)
      fail(`${other.channel.name} advertises different bytes than ${base.channel.name} ` +
           `for the same version. Mirrors must be byte-equivalent.`);
    const a = base.manifest, b = other.manifest;
    for(const key of ['manifestRoot','payloadRoot','runtimeRoot']){
      if(String(a[key]||'') !== String(b[key]||''))
        fail(`${other.channel.name} disagrees on ${key}.`);
    }
  }
  if(!failures.length) note('\nAll readable channels agree on version, roots and advertised bytes.');
}

/* A manifest can be perfect while the payload it names is undeliverable. Pull a
   real Range from each mirror's own copy of one advertised file: that is the
   exact transport the updater uses, and CORS/206 support is the part that has
   actually broken in production before. */
const require = after('--require');
for(const {channel, manifest} of live){
  const entry = (manifest.files||[]).find(f => /src\/updater\.js$/.test(f.path))
             || (manifest.files||[])[0];
  if(!entry || !entry.url){ fail(`${channel.name} advertises no fetchable file.`); continue; }
  try{
    /* Ask as the browser build does. Hugging Face reflects the requesting
       Origin rather than answering "*", so a bare equality check reports a
       false failure on a service that is in fact configured correctly. What
       actually matters is whether THIS app's origin is allowed, and whether
       the range headers are exposed to script — without Content-Range the
       resumable transfer cannot verify what it received. */
    const r = await fetch(entry.url,
      {headers:{Range:'bytes=0-1023', Origin:BROWSER_ORIGIN}, cache:'no-store'});
    if(r.status !== 206) fail(`${channel.name} payload answered HTTP ${r.status}, not 206 Partial Content.`);
    const cors = r.headers.get('access-control-allow-origin') || '';
    const allowed = cors === '*' || cors === BROWSER_ORIGIN;
    if(!allowed)
      fail(`${channel.name} payload CORS is "${cors||'absent'}" — it allows neither "*" nor ` +
           `${BROWSER_ORIGIN}, so the browser build cannot download this release.`);
    const expose = (r.headers.get('access-control-expose-headers') || '').toLowerCase();
    if(!(expose === '*' || expose.includes('content-range')))
      fail(`${channel.name} does not expose Content-Range to script (got "${expose||'absent'}"); ` +
           `a ranged transfer cannot confirm what it received.`);
    if(r.status === 206 && allowed)
      note(`${channel.name} payload: HTTP 206, CORS ok for the browser origin, ranges exposed  (${entry.path})`);
  }catch(e){
    fail(`${channel.name} payload ${entry.path} is unreachable (${e.message}).`);
  }

  /* --require accepts "marker" (checked in src/updater.js) or "path:marker",
     so a release whose fix lives in another file is still verified in the
     bytes players receive. Checking only the updater silently passed releases
     whose actual change was elsewhere. */
  if(require){
    const cut = require.indexOf(':');
    const reqPath = cut > 0 ? require.slice(0, cut) : 'src/updater.js';
    const reqMarker = cut > 0 ? require.slice(cut + 1) : require;
    const target = (manifest.files || []).find((f) => f.path === reqPath);
    if(!target) fail(`${channel.name} does not advertise ${reqPath}, so its marker cannot be verified.`);
    else {
      try{
        const body = await (await fetch(target.url, {cache:'no-store'})).text();
        if(!body.includes(reqMarker))
          fail(`${channel.name} published ${reqPath} does not contain the expected marker — ` +
               `the fix this release exists for is not in the bytes players receive.`);
        else note(`${channel.name} published ${reqPath} contains the expected marker.`);
      }catch(e){ fail(`${channel.name} could not read ${reqPath} (${e.message}).`); }
    }
  }
}

if(failures.length){
  console.log(`\nRELEASE CHANNELS NOT CONSISTENT — ${failures.length} problem(s):`);
  failures.forEach(f => console.log('  - ' + f));
  process.exit(1);
}
console.log(`\nRELEASE CHANNELS VERIFIED at v${expected}: every readable channel agrees on ` +
            `version, roots and bytes, and each serves ranged payloads with open CORS.`);
