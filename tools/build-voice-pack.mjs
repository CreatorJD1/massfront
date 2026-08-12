/* Build the `voice` asset pack — a local copy of exactly what the channel must
   serve, so publishing is a straight upload and verification needs no network.

       node tools/build-voice-pack.mjs              rebuild from assets/audio/voice
       node tools/build-voice-pack.mjs --from-live  refresh the other packs' entries
                                                    from the live channel first

   WHY THIS EXISTS AND WHAT IT FOLLOWS
   tools/publish-assets.mjs established the scheme: one directory per pack, an
   index that names every file with its size, files uploaded before the index
   because the index is what tells a client the pack exists and is complete.
   This tool keeps that scheme and adds the one thing a build step can do that a
   publisher cannot — check the pack against the voice manifest BEFORE it goes
   out, so a take that is missing, truncated or a different size than
   assets/audio/voice.json claims stops the build instead of reaching a player
   as silence.

   LAYOUT — the staged tree mirrors the channel exactly:

       assets/packs/packs.json        ->  <endpoint>/packs.json
       assets/packs/pack/voice/<f>    ->  <endpoint>/pack/voice/<f>

   Those are the two URLs src/assetpack.js actually requests: packEndpoint()
   strips `/update.json…` off the update URL and then asks for `/packs.json` and
   `/pack/<pack>/<file>`. Mirroring them means the local copy IS the channel,
   which is what lets verifyvoicepack.mjs point a real client at a file:// -
   backed HTTP server and prove the download works without publishing anything.

   BOTH CONTAINERS, ALWAYS. Every take ships .ogg AND .m4a. AAC is the only
   lossy codec iOS decodes and open-source Chromium builds have no AAC decoder
   at all, so a pack carrying one container is silent on one platform. The
   client picks per device (audExt()); the pack cannot pick for it.

   MERGE, NEVER REPLACE. packs.json is the index for EVERY pack, and the
   soundtrack lives on the channel without living in this repo. Regenerating the
   index from the directories present here would drop `music` from it and
   unpublish 16 MB of already-downloaded music for every player. So this tool
   rewrites only the `voice` entry and carries the rest through untouched. */
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync,
         rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PACK = 'voice';
const LABEL = 'MASSFRONT voice bank — KEEN narration and command radio';
const SRC = join(ROOT, 'assets/audio/voice');
const BANK = join(ROOT, 'assets/audio/voice.json');
const OUT = join(ROOT, 'assets/packs');
const OUT_FILES = join(OUT, 'pack', PACK);
const INDEX = join(OUT, 'packs.json');
const FORMATS = ['ogg', 'm4a'];
const MIN_BYTES = 1000;          // same floor verifykeen.mjs uses for a stub
const LIVE_INDEX = 'https://huggingface.co/datasets/CREATORJD/massfront-releases'
                 + '/resolve/main/packs.json';

const sha256 = buf => createHash('sha256').update(buf).digest('hex');
const mb = n => (n / 1048576).toFixed(2) + ' MB';
const die = m => { console.error('build-voice-pack: ' + m); process.exit(2); };

/* ---- 1. what the bank says the pack must carry -------------------------- */
if (!existsSync(BANK)) die('assets/audio/voice.json is missing — run tools/make-voices.py first');
const bank = JSON.parse(readFileSync(BANK, 'utf8'));
if (!bank.lines || !bank.takes) die('voice.json has no lines/takes — it is not a voice bank');

/* Derive the required set the way audio.js does at runtime: every stem any
   speaker's lines reference. Not readdir() — a stray file in the source
   directory is not a take, and a take the bank references but nobody rendered
   must be a hard failure rather than a quietly smaller pack. */
const required = new Set();
const bySpeaker = {};
for (const speaker of Object.keys(bank.lines)) {
  bySpeaker[speaker] = new Set();
  for (const action of Object.keys(bank.lines[speaker]))
    for (const stem of bank.lines[speaker][action]) { required.add(stem); bySpeaker[speaker].add(stem); }
}
if (!required.size) die('voice.json references no takes at all');

/* ---- 2. check every one of them before copying a byte ------------------- */
if (!existsSync(SRC)) die('assets/audio/voice is missing — nothing to pack');
const onDisk = new Set(readdirSync(SRC).filter(f => !f.startsWith('.')));
const bad = [];
const files = [];
let bytes = 0;
for (const stem of [...required].sort()) {
  for (const ext of FORMATS) {
    const name = stem + '.' + ext;
    if (!onDisk.has(name)) { bad.push(name + ' — missing'); continue; }
    const size = statSync(join(SRC, name)).size;
    if (size < MIN_BYTES) { bad.push(name + ' — ' + size + ' bytes, that is a stub not a take'); continue; }
    const meta = bank.takes[stem];
    if (!meta) { bad.push(name + ' — no entry in voice.json takes'); continue; }
    if (meta[ext] && meta[ext] !== size)
      { bad.push(name + ' — manifest says ' + meta[ext] + ', disk has ' + size); continue; }
    if (!(meta.seconds > 0.4)) { bad.push(name + ' — manifest duration ' + meta.seconds + 's'); continue; }
    files.push({ stem, ext, name, size });
    bytes += size;
  }
}
if (bad.length)
  die(bad.length + ' take(s) failed the pre-pack check — NOTHING was written:\n  ' + bad.join('\n  '));

const extra = [...onDisk].filter(f => !files.some(x => x.name === f));
if (extra.length) console.log('note: ' + extra.length + ' file(s) in assets/audio/voice are not referenced by '
  + 'voice.json and are NOT packed: ' + extra.slice(0, 6).join(', '));

/* ---- 3. stage the payload ---------------------------------------------- */
if (existsSync(OUT_FILES)) rmSync(OUT_FILES, { recursive: true });
mkdirSync(OUT_FILES, { recursive: true });
const entries = [];
for (const f of files) {
  const buf = readFileSync(join(SRC, f.name));
  copyFileSync(join(SRC, f.name), join(OUT_FILES, f.name));
  entries.push({ name: f.name, size: f.size, sha256: sha256(buf) });
}
/* Sorted by name so a rebuild that changed nothing produces a byte-identical
   index and shows up as no diff. */
entries.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);

/* ---- 4. merge into the index ------------------------------------------- */
let index = { version: 1, packs: {} };
if (process.argv.includes('--from-live')) {
  const r = await fetch(LIVE_INDEX + '?t=' + Date.now(), { cache: 'no-store' });
  if (!r.ok) die('could not read the live index (HTTP ' + r.status + ') — rerun without --from-live '
               + 'to keep the entries already in assets/packs/packs.json');
  const live = await r.json();
  if (!live || !live.packs) die('live packs.json has no `packs` object');
  index = live;
  console.log('merged into the LIVE index: ' + Object.keys(live.packs).join(', '));
} else if (existsSync(INDEX)) {
  index = JSON.parse(readFileSync(INDEX, 'utf8'));
  if (!index.packs) index.packs = {};
}
const carried = Object.keys(index.packs).filter(p => p !== PACK);
index.version = index.version || 1;
index.packs[PACK] = { label: LABEL, bytes, files: entries };
writeFileSync(INDEX, JSON.stringify(index, null, 2) + '\n');

/* ---- 5. say exactly what happened --------------------------------------- */
const perSpeaker = Object.keys(bySpeaker).sort().map(s => {
  const n = bySpeaker[s].size;
  const b = [...bySpeaker[s]].reduce((t, stem) =>
    t + FORMATS.reduce((u, e) => u + (bank.takes[stem][e] || 0), 0), 0);
  return '    ' + s.padEnd(12) + String(n).padStart(3) + ' takes  ' + mb(b).padStart(8);
}).join('\n');
console.log(`
  pack        ${PACK}
  takes       ${required.size} (${entries.length} files — every take in both containers)
${perSpeaker}
  packed      ${mb(bytes)} (${bytes} bytes)
  staged      assets/packs/pack/${PACK}/
  index       assets/packs/packs.json  (${['voice', ...carried].sort().join(', ')})
  carried     ${carried.length ? carried.map(p => p + ' (' + mb(index.packs[p].bytes || 0) + ', untouched)').join(', ') : 'nothing — no other pack in the index'}

  next        node verifyvoicepack.mjs
              python3 tools/publish-voice-pack.py`);
