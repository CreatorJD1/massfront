#!/usr/bin/env node
/* Point every published manifest's payload urls at the redirect-free mirror.
 *
 * The publisher mints payload urls as huggingface.co/.../resolve/<sha>/... For
 * small files the Hub answers with a same-origin 307, but anything stored in
 * LFS answers with a 302 to a signed CDN host. Adding a Range header (which the
 * downloader does for every chunked file) makes the request non-simple, and a
 * strict engine will not follow a preflighted request off-origin. Android
 * WebView refuses it and reports only "network request failed", so a device
 * could check for updates, find one, and never be able to download it, while
 * desktop Chrome -- and therefore every check we had -- downloaded it fine.
 *
 * The Cloudflare mirror already serves the identical bytes as 206 with no
 * redirect, and its own latest.json already advertises those urls. This copies
 * that transport onto the Hugging Face manifests.
 *
 * Safe by construction: url is not part of any manifest identity
 * (updManifestFingerprint / updPayloadFingerprint use path, size, sha256 and
 * chunks only), so repointing changes nothing a client verifies, and every byte
 * is still hash-checked on arrival. That is why it can be applied to a release
 * that is already live without reissuing it.
 *
 * Run it after tools/mirror-release-to-cloudflare.mjs --apply, so the bytes are
 * in R2 before any manifest points at them.
 *
 * Usage:
 *   node tools/repoint-manifests-to-mirror.mjs            (dry run, writes nothing)
 *   node tools/repoint-manifests-to-mirror.mjs --apply    (rewrites local + publishes)
 * Exit: 0 if every manifest was repointed with its identity intact. */
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const pexec = promisify(execFile);
const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const apply = process.argv.includes('--apply');
const REPO = 'CREATORJD/massfront-releases';
const WORKER = 'https://massfront-update.jasondixon1994.workers.dev/update.json';
const HF = (name) => `https://huggingface.co/datasets/${REPO}/resolve/main/${name}?download=true`;

const getJson = async (url) =>
  JSON.parse((await (await fetch(url + (url.includes('?') ? '&' : '?') + 'x=' + Date.now(),
    { cache: 'no-store' })).text()).replace(/^\uFEFF/, ''));

/* Exactly the fields the client hashes. If this string moves, the release has
   changed identity and must be republished as a new version instead. */
const identity = (m) => (m.files || []).map((f) =>
  `${f.path}|${f.size}|${String(f.sha256).toLowerCase()}|` +
  (f.chunks != null ? f.chunks.map((c) => `${c.offset}|${c.size}|${String(c.sha256).toLowerCase()}`).join(',') : '-')
).join('\n');

const mirror = await getJson(WORKER);
const urls = new Map((mirror.files || []).map((f) => [f.path, f.url]));
const version = String(mirror.version);
console.log(`Mirror advertises v${version} with ${urls.size} redirect-free payload urls.\n`);

function repoint(m, label) {
  if (String(m.version) !== version) return { skip: `serves v${m.version}, not v${version}` };
  const before = identity(m);
  let n = 0, missing = 0;
  for (const f of m.files || []) {
    const u = urls.get(f.path);
    if (!u) { missing++; continue; }
    if (u !== f.url) { f.url = u; n++; }
  }
  if (missing) return { skip: `${missing} file(s) are not on the mirror — run mirror-release-to-cloudflare first` };
  if (identity(m) !== before) return { skip: 'identity changed — refusing' };
  return { n, hosts: [...new Set((m.files || []).map((f) => new URL(f.url).host))] };
}

let failures = 0;
const staged = [];

/* Local source of truth first: if this keeps the old urls, the next publish
   silently reintroduces the bug. */
const localPath = resolve(root, 'update.json');
if (existsSync(localPath)) {
  const m = JSON.parse((await readFile(localPath, 'utf8')).replace(/^\uFEFF/, ''));
  const r = repoint(m, 'update.json');
  if (r.skip) { console.log(`SKIP  local update.json — ${r.skip}`); }
  else {
    console.log(`${apply ? 'WROTE' : 'DRY  '} local update.json — ${r.n} url(s) -> ${r.hosts.join(',')}`);
    if (apply) await writeFile(localPath, JSON.stringify(m, null, 2) + '\n');
  }
}

for (const name of ['MASSFRONT-update.json', `update-v${version}.json`, 'update.json']) {
  let m;
  try { m = await getJson(HF(name)); } catch (e) { console.log(`SKIP  ${name} — unreadable (${e.message})`); continue; }
  const r = repoint(m, name);
  if (r.skip) { console.log(`SKIP  ${name} — ${r.skip}`); continue; }
  /* Nothing to change means nothing to publish. Uploading an identical manifest
     would add a no-op commit to a production dataset and, worse, move the live
     pointer for no reason. */
  if (!r.n) { console.log(`OK    ${name} — already on ${r.hosts.join(',')}`); continue; }
  const out = resolve(tmpdir(), `mf-repoint-${name}`);
  await writeFile(out, JSON.stringify(m, null, 2) + '\n');
  staged.push([name, out]);
  console.log(`${apply ? 'STAGE' : 'DRY  '} ${name} — ${r.n} url(s) -> ${r.hosts.join(',')}  identity intact`);
}

if (apply && staged.length) {
  /* update.json is the live pointer, so it moves last: the mirrors it can be
     compared against must already agree with it. */
  staged.sort((a, b) => (a[0] === 'update.json' ? 1 : 0) - (b[0] === 'update.json' ? 1 : 0));
  const py = staged.map(([name, path]) =>
    `api.upload_file(path_or_fileobj=r'${path}', path_in_repo='${name}', repo_id='${REPO}', ` +
    `repo_type='dataset', commit_message='Repoint v${version} payload urls at the redirect-free mirror (${name})')\n` +
    `print('published ${name}')`).join('\n');
  try {
    const { stdout } = await pexec('python', ['-c', `from huggingface_hub import HfApi\napi=HfApi()\n${py}`],
      { maxBuffer: 1 << 22 });
    process.stdout.write(stdout);
  } catch (e) { console.log(`FAIL  publish failed: ${(e.stderr || e.message || '').slice(0, 300)}`); failures++; }
}

console.log('');
if (failures) { console.log('REPOINT FAILED.'); process.exit(1); }
console.log(apply
  ? `MANIFESTS REPOINTED at v${version}. Verify with: node tools/probe-payload-cors.mjs`
  : `DRY RUN — nothing written. Re-run with --apply.`);
