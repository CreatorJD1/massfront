#!/usr/bin/env node
/* ============================================================================
   ART V2 TOOLKIT — verification gate
   ----------------------------------------------------------------------------
       node tools/artv2.mjs verify <asset|--all> [--json] [--packs]

   Exit 1 on any failed check, so an agent (or CI) can branch without reading
   prose. Checks, in order of what has actually bitten this project:

   1. LOD BUDGETS per tier. The authored tank shipped a "LOD1" of 14,728 tris
      against a 1,500-tri heavy-class battle budget — ~10x over — and nothing
      caught it because budgets lived in prose. They now live in the manifest.
   2. A BATTLE LOD must exist. Showcase-only assets cannot go live.
   3. MAP AUTHORSHIP by content hash. The repo has 181 texture triplets but only
      25 unique NRE and 19 unique Masks images: per-mesh bakes are never
      duplicates, so a shared hash proves a generated template. This is the
      check that stops a template being reported as authored.
   4. SOURCE EVIDENCE. status:"authored" requires a real source .blend + baked
      GLB, not just PNGs on disk.
   5. Delegates to the existing verify-bespoke-packs / verify-unit-v2 gates
      (--packs) so this is a superset, not a competing source of truth.
   ============================================================================ */
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join, basename } from 'node:path';
import {
  ROOT, EXIT, loadManifest, selectAssets, budgetFor, envelope, emit,
  glbInfo, pngInfo, mapPaths, lodPath, assetDir, sha256,
} from './artv2/mf2_manifest.mjs';

const argv = process.argv.slice(2);
const asJson = argv.includes('--json');
const withPacks = argv.includes('--packs');
const selector = argv.filter(a => !a.startsWith('--'))[1] || argv.filter(a => !a.startsWith('--'))[0] || null;

let manifest;
try { manifest = loadManifest(); }
catch (e) { emit(envelope({ ok: false, command: 'verify', errors: [e.message] }), asJson); process.exit(EXIT.ENV); }

let keys;
try { keys = selectAssets(manifest, selector && selector !== 'verify' ? selector : null); }
catch (e) { emit(envelope({ ok: false, command: 'verify', errors: [e.message] }), asJson); process.exit(EXIT.USAGE); }

/* Hash every map in the shared materials dir once, so we can tell whether an
   asset's maps are unique to it or shared with the generated template catalogue. */
function buildHashIndex() {
  const dir = join(ROOT, 'assets', 'textures', 'materials');
  const index = new Map();
  if (!existsSync(dir)) return index;
  for (const f of readdirSync(dir)) {
    if (!f.toLowerCase().endsWith('.png')) continue;
    const h = sha256(join(dir, f));
    if (!h) continue;
    if (!index.has(h)) index.set(h, []);
    index.get(h).push(f);
  }
  return index;
}
const hashIndex = buildHashIndex();

const results = [];
let failed = 0;

for (const key of keys) {
  const a = manifest.assets[key];
  const budget = budgetFor(manifest, key);
  const errors = [], warnings = [], checks = {};
  const dir = assetDir(manifest, key);

  /* --- 1/2. LOD tiers and budgets ------------------------------------- */
  const lodRows = [];
  let battleSeen = false;
  for (const lod of a.lods || []) {
    const p = lodPath(manifest, key, lod.name);
    const info = glbInfo(p);
    const row = { name: lod.name, target: lod.target_tris, file: basename(p), exists: info.exists, tris: info.tris ?? null };
    if (lod.name === 'battle') {
      battleSeen = info.exists;
      row.budget = budget.battle_tris;
      if (info.exists && info.tris > budget.battle_tris) {
        errors.push(`battle LOD ${info.tris} tris exceeds class "${a.class}" budget of ${budget.battle_tris}`);
        row.overBudget = true;
      }
    }
    /* Quality floor: no unit/structure mesh may be decimated below it. Below
       this the silhouette starts reading as faceted, so distance is served by
       the sprite/billboard path instead of an ever-smaller mesh. */
    const floor = manifest.authoring?.min_tris;
    if (floor && info.exists && info.tris < floor) {
      errors.push(`${lod.name} LOD is ${info.tris} tris, under the ${floor}-triangle quality floor — raise the target or drop this tier and let the sprite path handle distance`);
      row.underFloor = true;
    }
    if (info.exists && lod.target_tris && info.tris > lod.target_tris * 1.15) {
      warnings.push(`${lod.name} LOD ${info.tris} tris is >15% above its ${lod.target_tris} target`);
    }
    if (!info.exists) warnings.push(`${lod.name} LOD not built yet (${basename(p)})`);
    lodRows.push(row);
  }
  checks.lods = lodRows;
  if (!battleSeen) errors.push('no battle LOD — the live instanced tier is missing, asset cannot go live');

  /* --- 3. map presence, size and authorship ---------------------------- */
  const maps = mapPaths(manifest, key);
  const mapRows = {};
  for (const [name, p] of Object.entries(maps)) {
    const info = pngInfo(p);
    const row = { exists: info.exists, width: info.width ?? null, height: info.height ?? null, bytes: info.bytes ?? null };
    if (!info.exists) { errors.push(`map missing: ${basename(p)}`); mapRows[name] = row; continue; }
    const want = budget.showcase_map;
    if (want && info.width !== want) warnings.push(`${name} is ${info.width}px, expected ${want}px for class "${a.class}"`);
    /* Shared hash => this image is not a per-mesh bake. */
    const twins = (hashIndex.get(info.sha256) || []).filter(f => f !== basename(p));
    row.uniqueToAsset = twins.length === 0;
    if (twins.length) {
      row.sharedWith = twins.slice(0, 4);
      if (a.status === 'authored') {
        errors.push(`${name} is byte-identical to ${twins.length} other map(s) (${twins.slice(0, 2).join(', ')}) — a generated template, not a per-mesh bake, but status says "authored"`);
      } else {
        warnings.push(`${name} is a shared/duplicate image (template)`);
      }
    }
    mapRows[name] = row;
  }
  checks.maps = mapRows;

  /* --- 3b. authoring ceiling (owner spec: 10k max / 5k recommended) ----- */
  const auth = manifest.authoring || {};
  const showcase = lodRows.find(l => l.name === 'showcase');
  if (showcase?.exists && auth.max_tris) {
    checks.authoring = { tris: showcase.tris, max: auth.max_tris, recommended: auth.recommended_tris };
    if (showcase.tris > auth.max_tris) {
      errors.push(`authored source mesh is ${showcase.tris} tris, over the ${auth.max_tris} authoring ceiling — rebuild the source model lower rather than relying on decimation`);
    } else if (auth.recommended_tris && showcase.tris > auth.recommended_tris) {
      warnings.push(`authored source mesh is ${showcase.tris} tris, above the ${auth.recommended_tris} recommended target`);
    }
  }

  /* --- 4. source evidence for an "authored" claim ---------------------- */
  const srcBlend = a.sourceBlend ? join(dir, a.sourceBlend) : null;
  const hasSource = !!srcBlend && existsSync(srcBlend);
  const bakedGlb = lodPath(manifest, key, 'showcase');
  checks.source = { blend: a.sourceBlend || null, blendExists: hasSource, bakedGlbExists: existsSync(bakedGlb) };
  if (a.status === 'authored' && !hasSource) {
    errors.push(`status is "authored" but no source .blend at ${a.sourceBlend} — authorship is unproven`);
  }

  /* --- live flag sanity ------------------------------------------------ */
  if (a.live && errors.length) errors.push('asset is marked live while failing gates — demote it or fix the failures');

  const ok = errors.length === 0;
  if (!ok) failed++;
  results.push({ asset: key, class: a.class, status: a.status, live: !!a.live, ok, checks, errors, warnings });
}

/* --- 5. delegate to the existing gates ---------------------------------- */
const delegated = {};
if (withPacks) {
  for (const t of ['verify-bespoke-packs.mjs', 'verify-unit-v2.mjs']) {
    const p = join(ROOT, 'tools', t);
    if (!existsSync(p)) { delegated[t] = 'missing'; continue; }
    const r = spawnSync(process.execPath, [p], { encoding: 'utf8', timeout: 120000 });
    delegated[t] = { exit: r.status, tail: (r.stdout || '').trim().split('\n').slice(-3).join(' | ') };
  }
}

const env = envelope({
  ok: failed === 0,
  command: 'verify',
  asset: keys.length === 1 ? keys[0] : null,
  data: { assets: results, ...(withPacks ? { delegated } : {}) },
  errors: results.flatMap(r => r.errors.map(e => `${r.asset}: ${e}`)),
  warnings: results.flatMap(r => r.warnings.map(w => `${r.asset}: ${w}`)),
  next: failed
    ? results.filter(r => !r.ok).map(r => `node tools/artv2.mjs bake ${r.asset}   # rebuild LODs/maps to clear the failures`)
    : ['node tools/artv2.mjs preview ' + (keys[0] || '--all')],
});
emit(env, asJson);
process.exit(failed ? EXIT.GATE : EXIT.OK);
