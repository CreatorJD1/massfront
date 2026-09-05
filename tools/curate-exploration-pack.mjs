#!/usr/bin/env node
/* Apply the oversize-exclusion ledgers to a built Galactic Exploration manifest.
 *
 * The builder (modules/space_exploration/tools/build-runtime-content-manifest.mjs)
 * emits every file the allowlist rules resolve to. Some of those files are too
 * expensive to ship for what they are: the Nordhall skyscraper is 46.56 MiB of
 * raw uncompressed mesh — 368,716 triangles — carrying 0.14 MiB of texture. The
 * owner excluded it. That decision lives in
 * modules/space_exploration/assets/source/EXCLUDED_OVERSIZE_V1.json, and this is
 * the tool that enforces it on the manifest.
 *
 * WHY THE SIZE INVARIANT MATTERS. src/assetpack.js validates the manifest before
 * it will install anything: every entry needs a sha256-<64hex> hash, every path
 * must be relative and free of '..', and — the one that bites — the sum of entry
 * bytes must equal Number(man.totalBytes) exactly, or the whole install aborts
 * with reason 'size'. Removing entries without recomputing the total does not
 * ship a slightly-wrong pack; it ships a pack no device can install. So this tool
 * recomputes totalBytes from what survives and refuses to write at all if the
 * assembled manifest and its own file list disagree. Two further consumers check
 * the manifest's self-signature — tools/pack-www.mjs throws 'manifest identity is
 * invalid or stale' and the readiness audit fails runtime-manifest:self-hash — so
 * the output is re-signed exactly the way the builder signs it: sha256 over
 * JSON.stringify(manifest) with `hash` removed.
 *
 * WHY SOURCE FILES ARE RETAINED. Nothing here deletes a GLB. This repo's doctrine
 * for rejected and excluded art, established by the Stage 10 DISCARDED_* ledgers
 * and enforced by tools/verify-exploration-pack-models.mjs, is that the asset
 * stays on disk for provenance and the manifest is the only thing keeping it away
 * from players. An exclusion you can only detect by noticing a missing file is not
 * a record of a decision. A ledger plus a curation step is.
 *
 * The oversize ledger also carries a keptDespiteSize list. uga-command-cutaway.glb
 * is the largest file in the pack at 65.17 MiB and the owner explicitly keeps it —
 * its bulk is 61.25 MiB of embedded PNG, a texture problem being handled
 * separately, sitting on already-Draco-compressed geometry. This tool hard-refuses
 * if any rule would remove a kept path, so a later ledger edit cannot quietly drop
 * the obvious-looking biggest file.
 *
 * Usage:
 *   node tools/curate-exploration-pack.mjs                    # dry run, writes nothing
 *   node tools/curate-exploration-pack.mjs --apply
 *   node tools/curate-exploration-pack.mjs --manifest <path> --out <path> --apply
 * Exit: 0 on a clean report or a clean write, 1 if curation is unsafe, 2 on bad usage. */
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const DEFAULT_MANIFEST = 'modules/space_exploration/dist/exploration-content-manifest-v1.json';
const OVERSIZE_LEDGER = 'modules/space_exploration/assets/source/EXCLUDED_OVERSIZE_V1.json';
/* Re-checked for safety only. The Stage 10 rejects should never have been built
   into the manifest in the first place; if one turns up here the allowlist has
   regressed and tools/verify-exploration-pack-models.mjs is about to fail too. */
const DISCARDED_LEDGERS = [
  ['Stage 10 pack failures', 'modules/space_exploration/assets/source/blender/world-kits/DISCARDED_STAGE10_PACK_FAILURES.json'],
  ['Stage 10 Spline exclusions', 'modules/space_exploration/assets/source/spline/world-prefabs/DISCARDED_STAGE10_SPLINE_EXCLUSIONS.json'],
  ['Spline props', 'modules/space_exploration/assets/source/spline/world-prefabs/DISCARDED_SPLINE_PROPS.json']
];
const WORLD_MODEL_CATALOG = 'modules/space_exploration/assets/runtime/world-models/world-model-catalog-v1.json';

function usage(message) {
  if (message) console.log(`USAGE ${message}`);
  console.log('  node tools/curate-exploration-pack.mjs [--manifest <path>] [--out <path>] [--apply]');
  process.exit(message ? 2 : 0);
}

const argv = process.argv.slice(2);
let manifestArg = null, outArg = null, apply = false;
for (let i = 0; i < argv.length; i += 1) {
  const flag = argv[i];
  if (flag === '--apply') apply = true;
  else if (flag === '--help' || flag === '-h') usage(null);
  else if (flag === '--manifest' || flag === '--out') {
    const value = argv[i + 1];
    if (!value || value.startsWith('--')) usage(`${flag} needs a path`);
    if (flag === '--manifest') manifestArg = value; else outArg = value;
    i += 1;
  } else usage(`unknown argument: ${flag}`);
}

const manifestPath = resolve(root, manifestArg || DEFAULT_MANIFEST);
const outPath = resolve(root, outArg || join(dirname(manifestPath), `${basename(manifestPath, '.json')}.curated.json`));
const mib = (bytes) => (bytes / 1048576).toFixed(2);
const readJson = async (file) => JSON.parse((await readFile(file, 'utf8')).replace(/^﻿/, ''));
const sign = (data) => {
  const unsigned = { ...data };
  delete unsigned.hash;
  return `sha256-${createHash('sha256').update(JSON.stringify(unsigned)).digest('hex')}`;
};
function fail(message) {
  console.log(`FAIL  ${message}`);
  console.log('\nNOTHING WRITTEN — the manifest was left exactly as it was.');
  process.exit(1);
}

if (!existsSync(manifestPath)) fail(`no manifest at ${manifestPath} — run modules/space_exploration/tools/build-runtime-content-manifest.mjs first`);
const manifest = await readJson(manifestPath);
if (manifest?.kind !== 'ExplorationContentManifestV1' || !Array.isArray(manifest.files) || !manifest.files.length)
  fail('the manifest is not a non-empty ExplorationContentManifestV1');

console.log(`Manifest  ${manifestPath}`);
console.log(`Output    ${outPath}`);
console.log(`Mode      ${apply ? 'APPLY' : 'DRY RUN (nothing will be written)'}`);
console.log(`Before    ${manifest.files.length} files, ${manifest.totalBytes} bytes (${mib(Number(manifest.totalBytes))} MiB)`);

const beforeSum = manifest.files.reduce((sum, entry) => sum + Number(entry.bytes), 0);
if (beforeSum !== Number(manifest.totalBytes))
  console.log(`WARN  the input manifest already fails the installer size invariant: entries sum to ${beforeSum}, totalBytes says ${manifest.totalBytes}`);
if (manifest.hash && manifest.hash !== sign(manifest))
  console.log('WARN  the input manifest self-signature is stale; the curated output carries a freshly computed one');

/* ---- load the ledgers ------------------------------------------------ */
const oversizeFile = resolve(root, OVERSIZE_LEDGER);
if (!existsSync(oversizeFile)) fail(`the oversize ledger is missing: ${OVERSIZE_LEDGER}`);
const oversize = await readJson(oversizeFile);
if (oversize.runtimeAllowed === true)
  fail('the oversize ledger is marked runtimeAllowed — refusing to curate against a ledger that permits its own entries');

const rules = [];
const keptPaths = new Map();
for (const entry of oversize.entries || []) {
  if (entry?.path) rules.push({ kind: 'path', value: String(entry.path), ledger: 'oversize exclusions', reason: entry.reason || oversize.reason || '' });
}
for (const id of oversize.ids || []) {
  rules.push({ kind: 'id', value: String(id).toLowerCase(), ledger: 'oversize exclusions', reason: oversize.reason || '' });
}
for (const keep of oversize.keptDespiteSize || []) {
  if (keep?.path) keptPaths.set(String(keep.path), keep.reason || 'owner decision: keep');
}
if (!rules.length) fail('the oversize ledger names nothing — curation would be vacuous');

for (const [label, rel] of DISCARDED_LEDGERS) {
  const file = resolve(root, rel);
  if (!existsSync(file)) { console.log(`WARN  ledger missing: ${rel}`); continue; }
  const data = await readJson(file);
  if (data.runtimeAllowed === true) { console.log(`WARN  ${label} is marked runtimeAllowed; skipping`); continue; }
  for (const id of data.ids || []) rules.push({ kind: 'id', value: String(id).toLowerCase(), ledger: label, reason: data.reason || '' });
}
console.log(`Ledgers   ${rules.length} curation rule(s); ${keptPaths.size} path(s) protected as keep-despite-size`);

/* Id matching mirrors tools/verify-exploration-pack-models.mjs exactly, so this
   tool removes precisely what that gate would refuse to let ship. Explicit paths
   from the oversize ledger match literally — no substring surprises. */
function ruleFor(path) {
  const low = path.toLowerCase();
  const stem = basename(low).endsWith('.glb') ? basename(low).slice(0, -4) : null;
  for (const rule of rules) {
    if (rule.kind === 'path') { if (path === rule.value) return rule; continue; }
    if (!stem) continue;
    const tail = rule.value.split('/').pop();
    if (stem === tail || low.includes(tail) || low.includes(rule.value)) return rule;
  }
  return null;
}

const kept = [], removed = [];
for (const entry of manifest.files) {
  const rule = ruleFor(String(entry.path));
  if (!rule) { kept.push(entry); continue; }
  if (keptPaths.has(String(entry.path)))
    fail(`a rule from "${rule.ledger}" matched ${entry.path}, which the ledger protects as keep-despite-size (${keptPaths.get(String(entry.path))})`);
  removed.push({ entry, rule });
}

/* ---- report ---------------------------------------------------------- */
if (!removed.length) {
  console.log('\nNothing matched — every ledgered exclusion is already absent from this manifest.');
} else {
  console.log(`\nRemoving ${removed.length} entr${removed.length === 1 ? 'y' : 'ies'}:`);
  for (const { entry, rule } of removed) {
    console.log(`  - ${entry.path}`);
    console.log(`      ${entry.bytes} bytes (${mib(entry.bytes)} MiB)   ledger: ${rule.ledger}   matched by ${rule.kind}: ${rule.value}`);
    if (rule.reason) console.log(`      reason: ${rule.reason}`);
  }
}
for (const [path, reason] of keptPaths) {
  const survives = kept.some((entry) => String(entry.path) === path);
  console.log(`${survives ? 'PASS ' : 'FAIL '} keep-despite-size ${path} ${survives ? 'is still present' : 'is NOT present'}`);
  if (!survives) fail(`${path} must remain in the pack (${reason}) but is absent from the curated file list`);
}

/* ---- assemble, then guard the assembled artifact --------------------- */
if (!kept.length) fail('curation would empty the manifest');
const removedBytes = removed.reduce((sum, item) => sum + Number(item.entry.bytes), 0);
const totalBytes = kept.reduce((sum, entry) => sum + Number(entry.bytes), 0);
if (!Number.isSafeInteger(totalBytes)) fail(`the recomputed total ${totalBytes} is not a safe integer`);

for (const entry of kept) {
  const rel = String(entry.path || '').replace(/\\/g, '/');
  if (!rel || rel.startsWith('/') || rel.includes('..')) fail(`surviving entry has a path the installer rejects: ${entry.path}`);
  if (!/^sha256-[a-f0-9]{64}$/i.test(String(entry.hash || ''))) fail(`surviving entry has no usable sha256 hash: ${entry.path}`);
  if (!Number.isSafeInteger(Number(entry.bytes))) fail(`surviving entry has a non-integer size: ${entry.path}`);
}
const paths = kept.map((entry) => String(entry.path));
if (new Set(paths).size !== paths.length) fail('surviving entries contain duplicate paths');
const sorted = [...paths].sort();
if (paths.some((path, index) => path !== sorted[index]))
  fail('surviving entries are no longer in the deterministic sort order readiness expects');

/* Rebuild in the builder's key order so the output stays diffable against a fresh
   build, with one clearly-named provenance stanza added ahead of `files` and the
   signature last, exactly where build-runtime-content-manifest.mjs puts it. */
const curated = {};
for (const key of Object.keys(manifest)) {
  if (key === 'hash' || key === 'oversizeCuration') continue;
  if (key === 'files') {
    curated.oversizeCuration = {
      curatedOn: new Date().toISOString().slice(0, 10),
      curatedBy: 'tools/curate-exploration-pack.mjs',
      ledgers: [OVERSIZE_LEDGER, ...DISCARDED_LEDGERS.map(([, rel]) => rel)],
      sourceFilesDeleted: false,
      removedCount: removed.length,
      removedBytes,
      removed: removed.map(({ entry, rule }) => ({ path: entry.path, bytes: entry.bytes, ledger: rule.ledger }))
    };
    curated.files = kept;
    continue;
  }
  curated[key] = key === 'totalBytes' ? totalBytes : manifest[key];
}
if (!('totalBytes' in curated)) curated.totalBytes = totalBytes;
curated.hash = sign(curated);

/* The invariant src/assetpack.js enforces, verified against the object that is
   actually about to be serialised rather than against the intermediate numbers. */
const assembledSum = curated.files.reduce((sum, entry) => sum + Number(entry.bytes), 0);
if (Number(curated.totalBytes) !== assembledSum)
  fail(`refusing to write: totalBytes ${curated.totalBytes} does not equal the sum of the ${curated.files.length} remaining entries ${assembledSum} — src/assetpack.js would abort this install with reason 'size'`);
if (curated.files.length !== manifest.files.length - removed.length)
  fail(`refusing to write: expected ${manifest.files.length - removed.length} surviving entries, assembled ${curated.files.length}`);
if (Number(manifest.totalBytes) - removedBytes !== assembledSum)
  console.log(`WARN  before-minus-removed (${Number(manifest.totalBytes) - removedBytes}) differs from the assembled sum (${assembledSum}); the input total was already wrong`);

console.log(`\nAfter     ${curated.files.length} files, ${curated.totalBytes} bytes (${mib(curated.totalBytes)} MiB)`);
console.log(`Removed   ${removed.length} file(s), ${removedBytes} bytes (${mib(removedBytes)} MiB)`);
console.log(`PASS  size invariant: ${curated.files.length} entries sum to ${assembledSum} and totalBytes reads ${curated.totalBytes} — src/assetpack.js will not reject this for reason 'size'`);
console.log(`PASS  self-signature recomputed: ${curated.hash}`);

/* ---- advisories curation cannot fix by itself ------------------------ */
if (removed.length) {
  const catalogFile = resolve(root, WORLD_MODEL_CATALOG);
  if (existsSync(catalogFile)) {
    const catalog = await readJson(catalogFile);
    for (const model of catalog.models || []) {
      if (!removed.some(({ entry }) => model?.runtimePath === entry.path)) continue;
      console.log(`WARN  ${WORLD_MODEL_CATALOG} still lists "${model.key}" with runtimeAccepted:${model.runtimeAccepted} pointing at the removed ${model.runtimePath}.`);
      console.log(`      Nothing places that key today, so no authored scene breaks, but loadWorldModel('${model.key}') would now 404. Retiring the catalog entry also`);
      console.log('      means moving the counts modules/space_exploration/src/core/world_model_catalog.js hard-asserts (327/320/7) — a coordinated change, deliberately not made here.');
    }
  }
  console.log('WARN  the allowlist rules behind modules/space_exploration/tools/readiness/readiness-core.mjs still resolve to the removed path, so a plain');
  console.log('      rebuild reintroduces it and the readiness check runtime-manifest:builder-parity reports it as missingExpected. Re-run this tool after');
  console.log('      every rebuild, or teach the builder to read EXCLUDED_OVERSIZE_V1.json.');
}

if (!apply) {
  console.log(`\nDRY RUN — nothing written. Re-run with --apply to write ${outPath}`);
  process.exit(0);
}
await writeFile(outPath, `${JSON.stringify(curated, null, 2)}\n`, 'utf8');
console.log(`\nWROTE ${outPath}`);
