#!/usr/bin/env node
/* ============================================================================
   MATERIAL REGISTRY GATE
       node tools/verify-material-registry.mjs

   Static, no browser. Guards the failure mode that produces a WRONG-LOOKING
   asset with a completely clean console:

     tile() reads `const rel=MAT_RELIEF[idx]||0; if(rel>0)` — so a material
     declared in MAT but missing from MAT_RELIEF gets no derived normal at all
     and renders perfectly flat. Nothing warns. The same is true of MAT_AO,
     MAT_GLOSS and MAT_METAL, which are read by index elsewhere.

   Checks:
     1. all four side tables have exactly as many entries as MAT has ids
     2. ids are dense 0..n-1, no gaps, no duplicates
     3. n <= MAT_TILES^2 — the atlas is an 11x11 grid and cell 121 does not
        exist; writing past it is silently off-canvas (the same class of bug
        that filled the sprite atlas exactly and hid call #65)
     4. every declared id has a tile() call site
   ============================================================================ */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(ROOT, 'src', 'engine', 'materials.js'), 'utf8');
const errors = [], warnings = [];

const strip = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

const matBody = src.match(/const MAT=\{([\s\S]*?)\n\};/);
if (!matBody) { console.error('FAIL: could not find const MAT'); process.exit(2); }
const ids = [...strip(matBody[1]).matchAll(/([A-Z0-9_]+)\s*:\s*(\d+)/g)]
  .map(m => ({ name: m[1], id: +m[2] }));

const tables = {};
for (const nm of ['MAT_RELIEF', 'MAT_AO', 'MAT_GLOSS', 'MAT_METAL']) {
  const i = src.indexOf('const ' + nm);
  if (i < 0) { errors.push(`${nm} not found`); continue; }
  const a = src.indexOf('[', i), b = src.indexOf('];', a);
  tables[nm] = (strip(src.slice(a + 1, b)).match(/-?\d+(?:\.\d+)?/g) || []).length;
}

for (const [nm, n] of Object.entries(tables))
  if (n !== ids.length)
    errors.push(`${nm} has ${n} entries but MAT declares ${ids.length} ids`
      + ` — ids ${Math.min(n, ids.length)}..${ids.length - 1} would render flat with no warning`);

const seen = new Map();
for (const { name, id } of ids) {
  if (seen.has(id)) errors.push(`duplicate id ${id}: ${seen.get(id)} and ${name}`);
  seen.set(id, name);
}
for (let i = 0; i < ids.length; i++)
  if (!seen.has(i)) errors.push(`id ${i} is missing — MAT ids must be dense 0..${ids.length - 1}`);

const tilesM = src.match(/MAT_TILES\s*=\s*(\d+)/);
const cap = tilesM ? (+tilesM[1]) ** 2 : 121;
if (ids.length > cap)
  errors.push(`${ids.length} materials exceeds the ${cap}-cell atlas (MAT_TILES=${tilesM && tilesM[1]})`
    + ` — cells past the last row are written off-canvas and are silently transparent`);

const painted = new Set([...src.matchAll(/tile\(\s*MAT\.([A-Z0-9_]+)/g)].map(m => m[1]));
for (const { name } of ids) if (!painted.has(name)) warnings.push(`${name} has no tile() call site`);

console.log(`materials: ${ids.length} ids, ${cap - ids.length} free atlas cells`);
for (const [nm, n] of Object.entries(tables)) console.log(`  ${nm.padEnd(11)} ${n}`);
if (warnings.length) console.log('\nWARN:\n  ' + warnings.join('\n  '));
if (errors.length) { console.error('\nFAIL:\n  ' + errors.join('\n  ')); process.exit(1); }
console.log('\nOK — registry consistent');
