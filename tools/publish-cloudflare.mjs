/* ============================================================================
   PUBLISH A RELEASE TO CLOUDFLARE
   ----------------------------------------------------------------------------
   One command takes the working tree to a live, patchable release:

       node tools/publish-cloudflare.mjs 1.11.0 "What changed"

   It deploys the Worker, uploads every source file the game loads into R2 under
   an immutable version prefix, writes the manifest LAST, and then patches
   assets/update-config.json so the next APK you build already knows where to
   look. Nothing about the endpoint has to be typed on a phone.

   ORDER MATTERS AND IS NOT ARBITRARY. The manifest is the switch that turns a
   release on: the game polls /update.json, and the moment it names version X it
   will start fetching X's files. So the files go up first and the manifest goes
   up last. Written the other way round, every player who polled during the
   upload would get a manifest promising files that were not there yet, fail
   mid-download, and — because the updater verifies total bytes before it
   commits — throw the whole thing away and show a failure you could not
   reproduce ten seconds later.

   Requires `wrangler` (npx will fetch it) and `npx wrangler login` once.
   ============================================================================ */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, statSync, existsSync, unlinkSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WORKER_DIR = join(ROOT, 'cloudflare', 'massfront-update');
const BUCKET = 'massfront-releases';
const NPX = process.platform === 'win32' ? 'npx.cmd' : 'npx';

const version = process.argv[2];
const notes = process.argv[3] || '';
if (!/^\d+\.\d+\.\d+$/.test(version || '')) {
  console.error('usage: node tools/publish-cloudflare.mjs <x.y.z> ["release notes"]');
  process.exit(1);
}

const run = (cmd, args, opts = {}) =>
  execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], ...opts });
const sha256 = data => createHash('sha256').update(data).digest('hex');

/* ---- 0. the file list is the game's own manifest, not a guess -------------- */
const order = JSON.parse(readFileSync(join(ROOT, 'assets/data/manifest.json'), 'utf8')).order;
for (const rel of order) {
  if (!existsSync(join(ROOT, rel))) {
    console.error('missing source file listed in assets/data/manifest.json: ' + rel);
    process.exit(1);
  }
}

/* The version baked into the build must match what we are publishing, or the
   game will download this release and still think it is out of date. */
const updSrc = readFileSync(join(ROOT, 'src/updater.js'), 'utf8');
const baked = (updSrc.match(/APP_VERSION\s*=\s*'([^']+)'/) || [])[1];
if (baked !== version) {
  console.error(`APP_VERSION in src/updater.js is '${baked}' but you are publishing '${version}'.`);
  console.error('Bump it first — otherwise clients that install this release will keep offering it to themselves.');
  process.exit(1);
}

/* ---- 1. deploy the worker, and find out where it lives --------------------- */
console.log('▸ deploying worker…');
const deployOut = run(NPX, ['--yes', 'wrangler', 'deploy'], { cwd: WORKER_DIR });
process.stdout.write(deployOut);
const host = (deployOut.match(/https:\/\/[a-z0-9.-]*massfront-update[a-z0-9.-]*\.workers\.dev/i) || [])[0]
          || (deployOut.match(/https:\/\/[^\s]+\.workers\.dev/i) || [])[0];
if (!host) {
  console.error('\nCould not read the worker URL out of wrangler output.');
  console.error('Deploy succeeded? Then pass the URL manually by editing assets/update-config.json.');
  process.exit(1);
}
console.log('▸ worker at ' + host);

/* ---- 2. upload every file under an immutable version prefix ---------------- */
const files = [];
let n = 0;
for (const rel of order) {
  const abs = join(ROOT, rel);
  const size = statSync(abs).size;
  const hash = sha256(readFileSync(abs));
  const key = `massfront/${version}/${rel}`;
  process.stdout.write(`  [${++n}/${order.length}] ${rel} (${(size / 1024).toFixed(0)} KB)\r`);
  run(NPX, ['--yes', 'wrangler', 'r2', 'object', 'put', `${BUCKET}/${key}`,
              '--file', abs, '--content-type', 'text/javascript; charset=utf-8', '--remote'],
      { cwd: WORKER_DIR });
  /* The game's boot loader keys everything by './<path>', so the manifest must
     use exactly that form. The browser collapses the '/./' when it resolves the
     download URL against `base`, so the worker never sees the dot segment. */
  files.push({ path: './' + rel, size, sha256: hash });
}
console.log('\n▸ uploaded ' + files.length + ' files');

/* Read every object back through the public Worker before advertising it. This
   catches a wrong bucket binding, a truncated upload, or a route mismatch while
   latest.json still points at the previous known-good release. */
console.log('▸ verifying public payload…');
for (let i = 0; i < order.length; i++) {
  const rel = order[i], f = files[i];
  const url = `${host}/f/${version}/${rel.split('/').map(encodeURIComponent).join('/')}`;
  const head = await fetch(url, { method: 'HEAD', cache: 'no-store' });
  if (!head.ok || Number(head.headers.get('content-length')) !== f.size)
    throw new Error(`public verification failed for ${rel}: HTTP ${head.status}, length ${head.headers.get('content-length')}`);
  const get = await fetch(url, { cache: 'no-store' });
  if (!get.ok) throw new Error(`public verification failed for ${rel}: HTTP ${get.status}`);
  const body = Buffer.from(await get.arrayBuffer());
  if (body.length !== f.size || sha256(body) !== f.sha256)
    throw new Error(`public integrity verification failed for ${rel}`);
  process.stdout.write(`  [${i + 1}/${order.length}] ${rel}\r`);
}
console.log('\n✓ public payload verified');

/* ---- 3. the manifest, LAST ------------------------------------------------- */
const manifest = { version, notes, base: `${host}/f/${version}/`, files };
const tmp = join(ROOT, '.release-manifest.json');
try {
  writeFileSync(tmp, JSON.stringify(manifest, null, 2));
  run(NPX, ['--yes', 'wrangler', 'r2', 'object', 'put', `${BUCKET}/massfront/latest.json`,
              '--file', tmp, '--content-type', 'application/json', '--remote'], { cwd: WORKER_DIR });
} finally {
  if (existsSync(tmp)) unlinkSync(tmp);
}

const live = await fetch(`${host}/update.json?t=${Date.now()}`, { cache: 'no-store' });
if (!live.ok) throw new Error(`live manifest verification failed: HTTP ${live.status}`);
const liveManifest = await live.json();
if (liveManifest.version !== version || !Array.isArray(liveManifest.files) ||
    liveManifest.files.length !== files.length || liveManifest.files.some(f => !f.sha256))
  throw new Error('live manifest verification failed: published content does not match');
writeFileSync(join(ROOT, 'update.json'), JSON.stringify(manifest, null, 2));

/* ---- 4. point future builds at it ------------------------------------------ */
const cfgPath = join(ROOT, 'assets/update-config.json');
const cfg = JSON.parse(readFileSync(cfgPath, 'utf8'));
cfg.endpoint = `${host}/update.json`;
writeFileSync(cfgPath, JSON.stringify(cfg, null, 2) + '\n');

const total = files.reduce((a, f) => a + f.size, 0);
console.log(`\n✓ published ${version} — ${(total / 1048576).toFixed(2)} MB`);
console.log(`  manifest   ${host}/update.json`);
console.log(`  endpoint written to assets/update-config.json`);
console.log(`\nRebuild the app so the shipped config carries the endpoint:`);
console.log(`  node tools/pack-www.mjs && npx cap sync android && (cd android && ./gradlew assembleDebug)`);
