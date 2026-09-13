#!/usr/bin/env node
/* Only accepted models may reach players in the Galactic Exploration pack.
 *
 * Stage 10 review rejected specific world-kit and Spline models. Those live in
 * DISCARDED_*.json ledgers with runtimeAllowed:false, and they are deliberately
 * NOT deleted from source — they stay for provenance. That makes the runtime
 * manifest the only thing standing between a rejected model and a player, so it
 * is worth an explicit gate rather than trusting the builder's allowlist to
 * keep behaving.
 *
 * Checks the freshly built manifest by default. --live also checks the manifest
 * players actually download, because a stale publish is the failure this cannot
 * catch by reading local files alone.
 *
 * Usage:
 *   node tools/verify-exploration-pack-models.mjs
 *   node tools/verify-exploration-pack-models.mjs --live
 * Exit: 0 if no rejected model is present, 1 otherwise. */
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const checkLive = process.argv.includes('--live');
const LIVE_MANIFEST = 'https://huggingface.co/datasets/CREATORJD/massfront-releases/' +
  'resolve/main/exploration-pack/exploration-content-manifest-v1.json?download=true';

const LEDGERS = [
  ['Stage 10 pack failures', 'modules/space_exploration/assets/source/blender/world-kits/DISCARDED_STAGE10_PACK_FAILURES.json'],
  ['Visual-quality rejects', 'modules/space_exploration/assets/source/blender/world-kits/DISCARDED_VISUAL_QUALITY_2026-09-05.json'],
  ['Stage 10 Spline exclusions', 'modules/space_exploration/assets/source/spline/world-prefabs/DISCARDED_STAGE10_SPLINE_EXCLUSIONS.json'],
  ['Spline props', 'modules/space_exploration/assets/source/spline/world-prefabs/DISCARDED_SPLINE_PROPS.json']
];

const rejected = new Map();
const rejectedPaths = new Map();
for (const [label, rel] of LEDGERS) {
  const file = resolve(root, rel);
  if (!existsSync(file)) { console.log(`WARN  ledger missing: ${rel}`); continue; }
  const data = JSON.parse((await readFile(file, 'utf8')).replace(/^﻿/, ''));
  if (data.runtimeAllowed === true) { console.log(`WARN  ${label} is marked runtimeAllowed; skipping`); continue; }
  for (const id of data.ids || []) rejected.set(String(id).toLowerCase(), label);
  for (const path of data.runtimePaths || []) rejectedPaths.set(String(path).replace(/\\/g, '/').toLowerCase(), label);
  for (const entry of data.entries || []) {
    if (entry?.path) rejectedPaths.set(String(entry.path).replace(/\\/g, '/').toLowerCase(), label);
  }
}
if (!rejected.size && !rejectedPaths.size) { console.log('FAIL  no rejected model rules were loaded — this gate would pass vacuously.'); process.exit(1); }
console.log(`Loaded ${rejected.size} rejected model id(s) and ${rejectedPaths.size} exact runtime path(s) from ${LEDGERS.length} ledger(s).`);

function leaksIn(paths) {
  const found = [];
  for (const p of paths.filter((x) => x.toLowerCase().endsWith('.glb'))) {
    const low = p.replace(/\\/g, '/').toLowerCase(), stem = basename(low).slice(0, -4);
    if (rejectedPaths.has(low)) {
      found.push({ path: p, id: low, label: rejectedPaths.get(low) });
      continue;
    }
    const normalizedStem = stem.replace(/_/g, '-');
    for (const [id, label] of rejected) {
      const idParts = id.split('/'), tail = idParts.pop();
      const pathFamily = low.match(/(?:^|\/)world-models\/([^/]+)\//)?.[1] || '';
      if (idParts.length && pathFamily && pathFamily !== idParts[idParts.length - 1]) continue;
      if (stem === tail || normalizedStem.includes(tail.replace(/_/g, '-')) || low.includes(id)) { found.push({ path: p, id, label }); break; }
    }
  }
  return found;
}

const sources = [];
const built = resolve(root, 'modules/space_exploration/dist/exploration-content-manifest-v1.json');
if (existsSync(built)) {
  const m = JSON.parse((await readFile(built, 'utf8')).replace(/^﻿/, ''));
  sources.push({ name: 'freshly built manifest', files: (m.files || []).map((f) => f.path) });
} else {
  console.log('WARN  no built manifest at modules/space_exploration/dist/ — run build-runtime-content-manifest.mjs');
}
if (checkLive) {
  const m = await (await fetch(LIVE_MANIFEST, { cache: 'no-store' })).json();
  sources.push({ name: 'live published manifest', files: (m.files || []).map((f) => f.path) });
}
if (!sources.length) { console.log('FAIL  nothing to check.'); process.exit(1); }

let bad = 0;
for (const s of sources) {
  const glb = s.files.filter((p) => p.toLowerCase().endsWith('.glb'));
  const leaks = leaksIn(s.files);
  if (leaks.length) {
    bad += leaks.length;
    console.log(`FAIL  ${s.name}: ${leaks.length} rejected model(s) of ${glb.length} GLB present`);
    for (const l of leaks.slice(0, 20)) console.log(`        ${l.path}  <- ${l.id} (${l.label})`);
  } else {
    console.log(`PASS  ${s.name}: ${glb.length} GLB, none rejected`);
  }
}

if (bad) { console.log(`\nEXPLORATION PACK CONTAINS REJECTED MODELS — ${bad} must not ship.`); process.exit(1); }
console.log('\nEXPLORATION PACK MODELS VERIFIED — every rejected Stage 10 model is absent.');
