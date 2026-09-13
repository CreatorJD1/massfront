#!/usr/bin/env node
/* ============================================================================
   CLEAN-CHECKOUT REPRODUCIBILITY GATE
   ----------------------------------------------------------------------------
       node tools/verify-clean-checkout.mjs [--json] [--write-manifest]

   verify-release-freeze.mjs asks "does this file exist?" and answers from the
   WORKING TREE. That is the wrong question for a release. A file can exist on
   this machine, be loaded by boot.js, be packed into www/, ship inside a
   working APK — and still be absent from git, in which case a fresh clone
   cannot build the thing that was shipped.

   This gate asks the other question: is every runtime-critical input actually
   TRACKED? It derives the input set the same way the freeze verifier does
   (boot.js order, assets/data/manifest.json, index.html, app.webmanifest,
   sfx/music/voice manifests, discoverable world-kit paths) and then checks each
   one against `git ls-files` rather than the filesystem.

   WHY THIS IS NOT PARANOIA
   At the time this tool was written, NINE of the eighty-eight sources in
   boot.js were untracked — macrofx, shieldfx, shockwave, vfxlayers, cloudfx,
   noisegen, factionenergy, perf and socialui. Every existing gate passed. A
   clean clone would have produced a bundle missing the entire combat-FX and
   social layer, and nothing in CI would have said a word.

   IT DOES NOT FIX ANYTHING. It will not `git add`; deciding what to commit is
   the owner's call, especially while several agents share this worktree. It
   names the files and fails.

   --write-manifest emits .tmp/tracked-input-manifest.json: every runtime input,
   its category, and whether git knows about it. That file is the artifact to
   diff between releases.
   ============================================================================ */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const AS_JSON = argv.includes('--json');
const WRITE_MANIFEST = argv.includes('--write-manifest');

/* ---- shared helpers, deliberately identical to verify-release-freeze ------ */
const normalizeRef = (raw = '') => {
  let rel = String(raw).trim();
  if (!rel) return '';
  if (/^(?:https?:|data:|blob:|#|\/\/)/i.test(rel)) return '';
  rel = rel.replace(/^\.\/+/, '').replace(/^\/+/, '');
  rel = rel.replace(/^[^:]+:[\\/].*$/i, '');
  rel = rel.split('?')[0].split('#')[0].replace(/\\/g, '/');
  return rel;
};
const toRepoRel = (raw, baseDir = '') => {
  const rel = normalizeRef(raw);
  if (!rel) return '';
  const base = baseDir ? resolve(ROOT, baseDir) : ROOT;
  const abs = resolve(base, rel);
  if (!abs.startsWith(ROOT + sep)) return '';
  return relative(ROOT, abs).replace(/\\/g, '/');
};
const readText = rel => { try { return readFileSync(join(ROOT, rel), 'utf8'); } catch { return ''; } };
const readJson = rel => { try { return JSON.parse(readText(rel) || 'null'); } catch { return { __parseError: true }; } };
const walkStrings = (v, fn) => {
  if (typeof v === 'string') fn(v);
  else if (Array.isArray(v)) v.forEach(x => walkStrings(x, fn));
  else if (v && typeof v === 'object') Object.values(v).forEach(x => walkStrings(x, fn));
};
const extractWorldKitPaths = (text) => {
  const found = new Set();
  if (!text) return found;
  for (const m of text.matchAll(/['"]([^'"]*assets\/textures\/materials\/mf-worldkit-v4[^'"]*)['"]/g)) {
    const rel = toRepoRel(m[1]);
    if (rel) found.add(rel);
  }
  const bases = new Map();
  for (const m of text.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*['"]([^'"]+)['"]/g)) {
    if (m[2].includes('mf-worldkit-v4')) bases.set(m[1], m[2]);
  }
  for (const m of text.matchAll(/\b([A-Za-z_$][\w$]*)\s*\+\s*['"]([^'"]+)['"]/g)) {
    const base = bases.get(m[1]), suffix = m[2];
    if (!base || !suffix.startsWith('-') || !/(?:png|webp|jpg|jpeg)$/.test(suffix)) continue;
    const rel = toRepoRel(base + suffix);
    if (rel && rel.includes('mf-worldkit-v4')) found.add(rel);
  }
  for (const rel of [...found]) {
    if (!rel.startsWith('assets/textures/materials/mf-worldkit-v4-')) found.delete(rel);
  }
  return found;
};

/* ---- the tracked set ------------------------------------------------------ */
let tracked;
try {
  tracked = new Set(execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 })
    .split('\n').map(s => s.trim()).filter(Boolean));
} catch (e) {
  console.error('cannot read `git ls-files` — is this a git checkout? ' + (e.message || e));
  process.exit(2);
}

/* ---- collect runtime-critical inputs, tagged by category ------------------ */
const inputs = new Map();   // repoRel -> Set(category)
const want = (rel, category, baseDir = '') => {
  const r = toRepoRel(rel, baseDir);
  if (!r) return;
  if (!inputs.has(r)) inputs.set(r, new Set());
  inputs.get(r).add(category);
};

/* 1. boot.js classic-global source order — the actual load list. */
const boot = readText('boot.js');
for (const m of boot.matchAll(/["'](\.\/[^"']+\.(?:js|mjs))["']/g)) want(m[1], 'boot-source');

/* 2. assets/data/manifest.json — must stay in step with boot.js. */
const manifestObj = readJson('assets/data/manifest.json');
if (Array.isArray(manifestObj?.order)) for (const rel of manifestObj.order) want(rel, 'manifest-source');
want('boot.js', 'entry');
want('index.html', 'entry');

/* 3. index.html direct references. */
for (const m of readText('index.html').matchAll(/(?:src|href)\s*=\s*["']([^"']+)["']/g)) want(m[1], 'index-ref');

/* 4. PWA icons. */
const wm = readJson('assets/app.webmanifest');
if (Array.isArray(wm?.icons)) for (const ic of wm.icons) if (typeof ic?.src === 'string') want(ic.src, 'pwa-icon', 'assets');

/* 5. audio: sfx / music / voice, dual codec where the loader expects it. */
const sfx = readJson('assets/audio/sfx.json');
for (const spec of Object.values(sfx?.slots || {})) {
  for (const stem of (Array.isArray(spec?.files) ? spec.files : [])) {
    if (typeof stem !== 'string') continue;
    want(`assets/audio/${stem}.ogg`, 'sfx'); want(`assets/audio/${stem}.m4a`, 'sfx');
  }
}
const music = readJson('assets/audio/music.json');
for (const playlist of Object.values(music?.playlists || {})) {
  if (!Array.isArray(playlist)) continue;
  for (const entry of playlist) {
    if (!entry || entry.bundled === false) continue;
    const stem = normalizeRef(entry.file || '').split('/').pop();
    if (stem) want(`assets/audio/music/${stem}.m4a`, 'music');
  }
}
const voice = readJson('assets/audio/voice.json');
const vstems = new Set();
walkStrings(voice?.lines, v => { if (v && v.trim()) vstems.add(v.trim()); });
for (const stem of vstems) { want(`assets/audio/voice/${stem}.ogg`, 'voice'); want(`assets/audio/voice/${stem}.m4a`, 'voice'); }

/* 6. Textures the engine names as string literals. Deliberately conservative:
      only ./assets/... literals, so a dynamic template cannot invent a path. */
const TEXTURE_SOURCES = ['src/engine/mesh.js', 'src/engine/materials.js', 'src/engine/materials-v2.js',
  'src/engine/materials-world-v2.js', 'src/engine/macrofx.js', 'src/engine/volfx.js',
  'src/engine/shockwave.js', 'src/engine/terrain.js'];
for (const src of TEXTURE_SOURCES) {
  const text = readText(src);
  if (!text) continue;
  for (const m of text.matchAll(/["'`](\.?\/?assets\/[A-Za-z0-9_./-]+\.(?:png|webp|jpg|jpeg|ktx2|basis))["'`]/g)) {
    want(m[1], 'runtime-texture');
  }
}
/* mesh.js builds the World-Kit V4 triplet from a base string. Literal-only
   scanning misses those files even though release-freeze proves the same
   dynamic paths are shipped. Keep both gates on the same discovery contract. */
for (const rel of extractWorldKitPaths(readText('src/engine/mesh.js'))) want(rel, 'runtime-texture');

/* ---- evaluate -------------------------------------------------------------- */
const rows = [...inputs.entries()]
  .map(([rel, cats]) => ({
    file: rel,
    categories: [...cats].sort(),
    onDisk: existsSync(join(ROOT, rel)),
    tracked: tracked.has(rel),
  }))
  .sort((a, b) => a.file.localeCompare(b.file));

/* Only fail on inputs that genuinely exist here — a path this tool derived but
   which is absent from BOTH git and disk is a stale reference, and that is the
   freeze verifier's job to report, not this one's. Failing on it here would
   duplicate the finding and make this gate noisy. */
const untracked = rows.filter(r => r.onDisk && !r.tracked);
const phantom = rows.filter(r => !r.onDisk && !r.tracked);

const byCategory = {};
for (const r of untracked) for (const c of r.categories) (byCategory[c] ||= []).push(r.file);

const summary = {
  when: new Date().toISOString(),
  totalInputs: rows.length,
  trackedInputs: rows.filter(r => r.tracked).length,
  untrackedRuntimeInputs: untracked.length,
  phantomReferences: phantom.length,
  byCategory,
};

if (WRITE_MANIFEST) {
  mkdirSync(join(ROOT, '.tmp'), { recursive: true });
  const out = join(ROOT, '.tmp', 'tracked-input-manifest.json');
  writeFileSync(out, JSON.stringify({ summary, inputs: rows }, null, 2));
  if (!AS_JSON) console.log('wrote ' + relative(ROOT, out).replace(/\\/g, '/'));
}

if (AS_JSON) {
  console.log(JSON.stringify({ summary, untracked, phantom }, null, 2));
} else {
  console.log(`clean-checkout inputs: ${summary.totalInputs}  tracked: ${summary.trackedInputs}`);
  if (phantom.length) {
    console.log(`\nNOTE ${phantom.length} derived reference(s) exist in neither git nor the working tree`);
    for (const r of phantom.slice(0, 8)) console.log('     ' + r.file + '  [' + r.categories.join(',') + ']');
    if (phantom.length > 8) console.log(`     ... and ${phantom.length - 8} more`);
  }
  if (untracked.length) {
    console.log(`\nFAIL ${untracked.length} runtime-critical input(s) exist here but are NOT in git.`);
    console.log('     A clean clone would build without them.\n');
    for (const [cat, files] of Object.entries(byCategory).sort()) {
      console.log('  ' + cat + ' (' + files.length + ')');
      for (const f of files) console.log('     ' + f);
    }
    console.log('\n  Not auto-fixed on purpose: committing another agent\'s work is the owner\'s call.');
  } else {
    console.log('\nPASS every runtime-critical input is tracked — a clean clone can reproduce this build.');
  }
}
process.exit(untracked.length ? 1 : 0);
