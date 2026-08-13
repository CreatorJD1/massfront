#!/usr/bin/env node
/* ============================================================================
   SURFACE CONTRACT GATE
       node tools/verify-surface-contracts.mjs [--verbose]

   Static, no browser. Guards the per-asset material remap that each faction kit
   applies in its surface pass:

     src/engine/models-units-nova.js:1263
       const dst = pack && pack.surfaces[src]!==undefined
                 ? pack.surfaces[src]
                 : TFC_NOVA_MAT[src];

   `surfaces` is a per-asset override; when a lookup misses, the asset falls
   through to a single faction-wide remap shared by every asset in that faction.
   That fall-through is the mechanism behind "some buildings use a generic
   material applied completely over a given item" — and it is INVISIBLE. Every
   way of getting a contract wrong fails silently:

     1. A misspelled material yields `[undefined]: x`. JS coerces that to the
        string key "undefined", the lookup never matches, and the asset quietly
        keeps the faction default. No error, no warning, no visual clue beyond
        "it still looks generic".

     2. Keying on a POST-remap id never fires. The surface pass reads the RAW id
        the mesh builder emitted and consults `surfaces` BEFORE the faction table.
        So a Nova hull plate must be keyed [MAT.PLATE]; keying [MAT.NOVA_COMPOSITE]
        — what PLATE *becomes* — matches nothing. The contract looks authored,
        reads correctly to a human, and does nothing at all. This check catches it
        by flagging any key that appears only as a VALUE in the faction table.

     3. Remapping MAT.SERVO strands walker legs. SERVO is a vertex-stage gait
        marker, not an ordinary material (models-units-legion.js:1044). Rebinding
        it breaks animation, not just appearance.

   Also reports coverage, because an empty `surfaces:{}` is not an error — it is
   a legitimate "not authored yet" — but the count is the thing worth watching.
   ============================================================================ */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const VERBOSE = process.argv.includes('--verbose');
const KITS = ['brood', 'legion', 'nova', 'syndicate'];

const strip = s => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');

/* ------------------------------------------------------- the material registry */
const matSrc = readFileSync(join(ROOT, 'src', 'engine', 'materials.js'), 'utf8');
const matBody = matSrc.match(/const MAT=\{([\s\S]*?)\n\};/);
if (!matBody) { console.error('FAIL: could not find `const MAT` in materials.js'); process.exit(2); }
const MAT = new Set([...strip(matBody[1]).matchAll(/([A-Z0-9_]+)\s*:\s*\d+/g)].map(m => m[1]));

const errors = [], warnings = [], rows = [];

/* Balanced-brace scan. `surfaces:Object.freeze({ ... })` bodies contain nested
   braces from computed keys, so a non-greedy regex truncates at the first `}`. */
function braceBody(src, openIdx) {
  let depth = 0;
  for (let i = openIdx; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) return src.slice(openIdx + 1, i); }
  }
  return null;
}

for (const kit of KITS) {
  const file = join(ROOT, 'src', 'engine', `models-units-${kit}.js`);
  if (!existsSync(file)) { warnings.push(`${kit}: no kit file`); continue; }
  const raw = readFileSync(file, 'utf8');
  const src = strip(raw);

  /* The faction-wide fall-through table, e.g. `const TFC_NOVA_MAT=Object.freeze({`.
     Its VALUES are post-remap ids — a `surfaces` KEY drawn from that set is the
     backwards-keying mistake, so we need both sides. */
  const tblM = src.match(/const\s+([A-Z0-9_]*MAT)\s*=\s*Object\.freeze\(\s*\{/);
  const factionKeys = new Set(), factionVals = new Set();
  let tableName = null;
  if (tblM) {
    tableName = tblM[1];
    const body = braceBody(src, src.indexOf('{', tblM.index + tblM[0].length - 1));
    for (const m of (body || '').matchAll(/\[MAT\.([A-Z0-9_]+)\]\s*:\s*MAT\.([A-Z0-9_]+)/g)) {
      factionKeys.add(m[1]); factionVals.add(m[2]);
    }
  } else {
    /* Not every kit HAS a faction table. brdOrganicSurfacePass
       (models-units-brood.js:549) falls back to `src` — the identity — so an
       empty contract there is not "generic material", it is no remap at all:
       the pass walks every vertex of every model and writes each value back
       unchanged. Same empty `surfaces:{}`, materially different consequence,
       so say which one it is rather than lumping them together. */
    warnings.push(`${kit}: no faction-wide remap table — the surface pass falls back to identity,`
      + ` so empty contracts make it a pure no-op over the whole vertex buffer`);
  }

  /* Every pack: `id:'...' , source:'...', maps:'...', surfaces:Object.freeze({...})` */
  let packs = 0, empty = 0, overrides = 0;
  const emptyIds = [];
  const idRe = /id:\s*'([a-z0-9-]+)'\s*,\s*source:\s*'[a-z]+'\s*,\s*maps:\s*(?:'[a-z0-9-]+'|null)\s*,\s*surfaces:\s*Object\.freeze\(\s*\{/g;
  let m;
  while ((m = idRe.exec(src))) {
    packs++;
    const id = m[1];
    const body = braceBody(src, src.indexOf('{', m.index + m[0].length - 1));
    if (body === null) { errors.push(`${kit}/${id}: unbalanced surfaces braces`); continue; }

    const pairs = [...body.matchAll(/\[MAT\.([A-Z0-9_]+)\]\s*:\s*MAT\.([A-Z0-9_]+)/g)];
    if (!pairs.length) {
      if (/\S/.test(body.replace(/[\s,]/g, ''))) {
        errors.push(`${kit}/${id}: surfaces has content but no [MAT.X]:MAT.Y pair parsed — check the syntax`);
      } else { empty++; emptyIds.push(id); }
      continue;
    }
    overrides += pairs.length;

    const seenKeys = new Set();
    for (const [, from, to] of pairs) {
      /* 1. existence — a typo becomes the string key "undefined" and never fires */
      if (!MAT.has(from)) errors.push(`${kit}/${id}: key MAT.${from} does not exist in MAT — silent no-op`);
      if (!MAT.has(to))   errors.push(`${kit}/${id}: value MAT.${to} does not exist in MAT — paints undefined`);

      /* 2. SERVO is a gait marker, not a material */
      if (from === 'SERVO') errors.push(`${kit}/${id}: remaps MAT.SERVO — strands walker legs`);

      /* 3. POSSIBLY backwards keying. This was an error and it was wrong.
            The reasoning was: a key that only appears as a VALUE in the faction
            table is what the table PRODUCES, so the builder never emits it and
            the override cannot fire. The premise does not hold — a material can
            be both a remap target AND something a builder paints directly.
            Measured on the raw pre-remap builders, NOVA_COMPOSITE is 21.8% of
            fac by area, 56.3% of bunker, 45.4% of uplink and 45.0% of silo. All
            four "never fires" reports were false, and acting on them would have
            broken four working overrides.
            It stays as a WARNING because the shape is still worth a second look;
            deciding it needs the built geometry, which a static pass cannot see.
            tools/audit-material-variety.mjs reads real meshes if you need proof. */
      if (tableName && factionVals.has(from) && !factionKeys.has(from))
        warnings.push(`${kit}/${id}: MAT.${from} appears only as a VALUE in ${tableName}`
          + ` — fine if a builder paints it directly (many do), dead if not; confirm against the mesh`);

      /* 4. a duplicate key silently keeps only the last */
      if (seenKeys.has(from)) warnings.push(`${kit}/${id}: duplicate key MAT.${from} — only the last survives`);
      seenKeys.add(from);

      /* 5. an identity remap is a no-op worth knowing about */
      if (from === to) warnings.push(`${kit}/${id}: MAT.${from} -> itself, no effect`);
    }
  }

  rows.push({ kit, packs, empty, populated: packs - empty, overrides, emptyIds, tableName });
}

/* --------------------------------------------------------------------- report */
console.log(`materials in registry: ${MAT.size}\n`);
console.log('kit          packs  populated  empty  overrides  fall-through table');
for (const r of rows) {
  console.log(`  ${r.kit.padEnd(11)}${String(r.packs).padStart(4)}`
    + `${String(r.populated).padStart(11)}${String(r.empty).padStart(7)}`
    + `${String(r.overrides).padStart(11)}  ${r.tableName || '(none)'}`);
}
const totalEmpty = rows.reduce((a, r) => a + r.empty, 0);
const totalPacks = rows.reduce((a, r) => a + r.packs, 0);
console.log(`\n${totalPacks - totalEmpty}/${totalPacks} packs carry a per-asset contract`
  + `; ${totalEmpty} fall through to the faction-wide remap.`);
if (VERBOSE) for (const r of rows) if (r.emptyIds.length)
  console.log(`  ${r.kit} empty: ${r.emptyIds.join(' ')}`);

if (warnings.length) console.log('\nWARN:\n  ' + warnings.join('\n  '));
if (errors.length) { console.error('\nFAIL:\n  ' + errors.join('\n  ')); process.exit(1); }
console.log('\nOK — every contract references real materials and keys on raw builder ids');
