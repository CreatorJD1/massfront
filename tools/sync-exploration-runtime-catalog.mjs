#!/usr/bin/env node
/* Rebind the Stage 10 runtime catalog to derived delivery GLBs.
 * Source acceptance remains owned by the rejection ledgers. This tool removes
 * every explicitly non-runtime entry before it refreshes byte/hash metadata
 * after delivery transforms such as WebP and Draco compression. */
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const moduleRoot = resolve(root, 'modules/space_exploration');
const catalogPath = resolve(moduleRoot, 'assets/runtime/world-models/world-model-catalog-v1.json');
const visualDiscardPath = resolve(moduleRoot, 'assets/source/blender/world-kits/DISCARDED_VISUAL_QUALITY_2026-09-05.json');
const ledgerPaths = [
  resolve(moduleRoot, 'assets/source/EXCLUDED_OVERSIZE_V1.json'),
  resolve(moduleRoot, 'assets/source/blender/world-kits/DISCARDED_STAGE10_PACK_FAILURES.json'),
  visualDiscardPath,
  resolve(moduleRoot, 'assets/source/spline/world-prefabs/DISCARDED_STAGE10_SPLINE_EXCLUSIONS.json'),
  resolve(moduleRoot, 'assets/source/spline/world-prefabs/DISCARDED_SPLINE_PROPS.json')
];
const apply = process.argv.slice(2).includes('--apply');
if (process.argv.slice(2).some(argument => argument !== '--apply')) throw new Error('usage: node tools/sync-exploration-runtime-catalog.mjs [--apply]');

const readJson = async path => JSON.parse((await readFile(path, 'utf8')).replace(/^\uFEFF/, ''));
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const catalog = await readJson(catalogPath);
if (catalog?.schema !== 'MassfrontStage10RuntimeWorldModelCatalogV1' || !Array.isArray(catalog.models)) {
  throw new Error('runtime world-model catalog has an unexpected schema');
}
const visualDiscard = await readJson(visualDiscardPath);
if (visualDiscard.ids?.length !== 42 || visualDiscard.runtimePaths?.length !== 42) {
  throw new Error('visual-quality discard ledger must bind exactly 42 ids and 42 runtime paths');
}
const excludedKeys = new Set();
const excludedPaths = new Set();
for (const ledgerPath of ledgerPaths) {
  const ledger = await readJson(ledgerPath);
  if (ledger.runtimeAllowed === true) throw new Error(`exclusion ledger permits runtime use: ${ledgerPath}`);
  for (const id of ledger.ids || []) excludedKeys.add(String(id).toLowerCase());
  for (const path of ledger.runtimePaths || []) excludedPaths.add(String(path).replace(/\\/g, '/').toLowerCase());
  for (const entry of ledger.entries || []) {
    if (entry?.catalogKey) excludedKeys.add(String(entry.catalogKey).toLowerCase());
    if (entry?.path) excludedPaths.add(String(entry.path).replace(/\\/g, '/').toLowerCase());
  }
}
const isExcluded = model => excludedKeys.has(String(model.key).toLowerCase())
  || excludedPaths.has(String(model.runtimePath).replace(/\\/g, '/').toLowerCase());
const kept = catalog.models.filter(model => !isExcluded(model));
const removed = catalog.models.filter(model => isExcluded(model));
if (!removed.length) console.log('Catalog exclusions are already applied.');
else for (const model of removed) console.log(`EXCLUDE  ${model.key} -> ${model.runtimePath}`);

const models = [];
for (const model of kept) {
  const absolute = resolve(moduleRoot, ...String(model.runtimePath).split('/'));
  if (!existsSync(absolute)) throw new Error(`catalog model is missing: ${model.runtimePath}`);
  const bytes = await readFile(absolute);
  models.push({ ...model, bytes: bytes.length, sha256: digest(bytes) });
}
const next = {
  ...catalog,
  worldKitCount: models.filter(model => model.family !== 'spline').length,
  splineCount: models.filter(model => model.family === 'spline').length,
  modelCount: models.length,
  totalBytes: models.reduce((sum, model) => sum + model.bytes, 0),
  models
};
delete next.catalogSha256;
next.catalogSha256 = digest(Buffer.from(JSON.stringify(next)));
if (next.modelCount !== 285 || next.worldKitCount !== 284 || next.splineCount !== 1) {
  throw new Error(`unexpected post-curation counts ${next.modelCount}/${next.worldKitCount}/${next.splineCount}; expected 285/284/1`);
}

const changedRecords = models.filter(model => {
  const prior = catalog.models.find(entry => entry.key === model.key);
  return prior?.bytes !== model.bytes || prior?.sha256 !== model.sha256;
}).length;
console.log(JSON.stringify({
  mode: apply ? 'APPLY' : 'DRY RUN',
  modelCount: next.modelCount,
  worldKitCount: next.worldKitCount,
  splineCount: next.splineCount,
  removed: removed.map(model => model.key),
  changedRecords,
  totalBytes: next.totalBytes,
  catalogSha256: next.catalogSha256
}, null, 2));
if (!apply) {
  console.log('DRY RUN — nothing written. Re-run with --apply after installing the derived GLBs.');
  process.exit(0);
}
await writeFile(catalogPath, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
console.log(`WROTE  ${catalogPath}`);
