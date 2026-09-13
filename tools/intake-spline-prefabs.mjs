#!/usr/bin/env node
/*
 * Run every exported Spline world prefab through source-model-intake.
 *
 * The intake tool needs --target-bounds-m, which is an authoring decision and
 * is why the customs depot sat unprocessed for so long: nothing on disk
 * declared its size. For the world prefabs that number already exists --
 * PREFAB_LIBRARY.json records `sizeMeters` per prefab, measured from the model
 * as authored -- so the intake can run without anyone inventing a scale.
 *
 * Fit is `uniform`, never `exact`: sizeMeters was measured FROM the model, so
 * a small discrepancy should scale the whole thing, not stretch one axis.
 *
 * Prefabs with no recorded size are skipped and named in the summary rather
 * than guessed at.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SPLINE = join(ROOT, 'modules/space_exploration/assets/source/spline');
const LIBRARY = join(SPLINE, 'world-prefabs/PREFAB_LIBRARY.json');
const PROCESSED = join(SPLINE, 'processed');
const INTAKE = join(ROOT, 'tools/source-model-intake.mjs');

const library = JSON.parse(readFileSync(LIBRARY, 'utf8'));
const only = process.argv.slice(2).filter((a) => !a.startsWith('-'));

const rows = [];
for (const prefab of library.prefabs) {
  const id = prefab.id;
  if (only.length && !only.includes(id)) continue;

  if (!prefab.exportedGlb) {
    rows.push({ id, status: 'skipped', reason: 'no exported GLB' });
    continue;
  }
  const size = prefab.sizeMeters;
  if (!Array.isArray(size) || size.length !== 3 || size.some((n) => !(n > 0))) {
    rows.push({ id, status: 'skipped', reason: 'no sizeMeters recorded — target bounds is an authoring call' });
    continue;
  }

  const input = join(ROOT, prefab.exportedGlb);
  if (!existsSync(input)) {
    rows.push({ id, status: 'skipped', reason: 'exported GLB missing from disk' });
    continue;
  }

  const slug = id.toLowerCase().replace(/_/g, '-');
  const dir = join(PROCESSED, `${slug}-v1`);
  const output = join(dir, 'source', `${slug}-source-v1.glb`);
  const report = join(dir, 'source', `${slug}-source-v1.intake.json`);
  if (existsSync(output)) {
    rows.push({ id, status: 'skipped', reason: 'already processed' });
    continue;
  }
  mkdirSync(dirname(output), { recursive: true });

  const args = [
    INTAKE,
    '--input', input,
    '--output', output,
    '--report', report,
    '--target-bounds-m', size.join(','),
    '--fit', 'uniform',
  ];
  const run = spawnSync(process.execPath, args, { encoding: 'utf8' });
  if (run.status === 0) {
    let measured = null;
    try {
      const r = JSON.parse(readFileSync(report, 'utf8'));
      measured = r.output?.boundsM || r.boundsM || null;
    } catch { /* report shape is the tool's business, not ours */ }
    rows.push({ id, status: 'ok', targetBoundsM: size, output: output.replace(ROOT, '').replace(/\\/g, '/'), measured });
  } else {
    const err = (run.stderr || run.stdout || '').trim().split('\n').slice(-3).join(' | ');
    rows.push({ id, status: 'failed', reason: err.slice(0, 220) });
  }
}

const ok = rows.filter((r) => r.status === 'ok');
const failed = rows.filter((r) => r.status === 'failed');
const skipped = rows.filter((r) => r.status === 'skipped');

console.log(`\nprocessed ${ok.length}, failed ${failed.length}, skipped ${skipped.length}\n`);
for (const r of rows) {
  const tag = r.status === 'ok' ? 'OK    ' : r.status === 'failed' ? 'FAIL  ' : 'SKIP  ';
  console.log(`${tag}${r.id.padEnd(28)}${r.status === 'ok' ? r.targetBoundsM.join(' x ') + ' m' : r.reason}`);
}

const summary = join(SPLINE, 'processed', 'spline-prefab-intake-summary.json');
mkdirSync(dirname(summary), { recursive: true });
writeFileSync(summary, JSON.stringify({
  ranDate: '2026-08-28',
  tool: 'tools/intake-spline-prefabs.mjs',
  fit: 'uniform',
  note: 'target bounds come from PREFAB_LIBRARY.json sizeMeters, measured at authoring time',
  status: 'SOURCE_AUTHORING_ONLY — intake does not make anything runtime-ready',
  rows,
}, null, 2));
console.log(`\nsummary: ${summary.replace(ROOT, '').replace(/\\/g, '/')}`);
process.exit(failed.length ? 1 : 0);
