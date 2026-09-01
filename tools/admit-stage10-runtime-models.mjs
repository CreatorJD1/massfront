import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const moduleRoot = join(root, 'modules', 'space_exploration');
const catalogPath = join(root, 'tmp', 'stage10-model-review', 'catalog.json');
const pbrSummaryPath = join(root, 'tmp', 'stage10-model-repair', 'pbr-reports', 'summary.json');
const unlockPath = join(moduleRoot, 'assets', 'source', 'blender', 'world-kits', 'USER_ACCEPTED_STAGE10_REPAIR_UNLOCKS.json');
const runtimeRoot = join(moduleRoot, 'assets', 'runtime', 'world-models');
const runtimeCatalogPath = join(runtimeRoot, 'world-model-catalog-v1.json');

const parse = async path => JSON.parse(await readFile(path, 'utf8'));
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const posix = path => path.replace(/\\/g, '/');
const relativeToModule = path => posix(path.slice(moduleRoot.length + 1));

const review = await parse(catalogPath);
const pbr = await parse(pbrSummaryPath);
const unlocks = await parse(unlockPath);
const accepted = [
  ...review.worldKits.flatMap(family => family.modules),
  ...review.splineExports
];
const pbrByKey = new Map(pbr.items.map(item => [item.key, item]));
const unlocked = new Set(unlocks.ids);

if (accepted.length !== 327 || review.counts?.worldKitModules !== 320 || review.counts?.splineExports !== 7) {
  throw new Error('Stage 10 accepted catalogue is not the handed-off 320 world-kit + 7 Spline set.');
}
if (review.repairLockedIds?.length || review.counts?.repairLocked) {
  throw new Error('Stage 10 catalogue still contains repair locks.');
}

const records = [];
for (const entry of accepted) {
  const pbrItem = pbrByKey.get(entry.key);
  let selectedPath;
  let presentation;
  if (pbrItem?.status === 'PBR_TEXTURED' && pbrItem.output) {
    selectedPath = resolve(root, pbrItem.output);
    presentation = 'PBR_TEXTURED';
  } else if (unlocked.has(entry.key)) {
    selectedPath = resolve(root, entry.model.path);
    presentation = 'USER_ACCEPTED_LOCKED_SOURCE';
  } else {
    throw new Error(`No handed-off runtime asset exists for ${entry.key}.`);
  }

  const family = entry.family || 'spline';
  const target = join(runtimeRoot, family, basename(selectedPath));
  await mkdir(dirname(target), { recursive: true });
  await copyFile(selectedPath, target);
  const bytes = await readFile(target);
  const sourceBytes = await stat(selectedPath);
  if (bytes.length !== sourceBytes.size) throw new Error(`Runtime copy length changed for ${entry.key}.`);
  records.push({
    key: entry.key,
    id: entry.id,
    family,
    category: entry.category,
    runtimePath: relativeToModule(target),
    bytes: bytes.length,
    sha256: sha256(bytes),
    presentation,
    sourceLocked: true,
    runtimeAccepted: true
  });
}

const manifest = {
  schema: 'MassfrontStage10RuntimeWorldModelCatalogV1',
  version: 1,
  acceptedByCreator: true,
  regenerationPerformed: false,
  sourceGeometryLocked: true,
  worldKitCount: records.filter(record => record.family !== 'spline').length,
  splineCount: records.filter(record => record.family === 'spline').length,
  modelCount: records.length,
  totalBytes: records.reduce((sum, record) => sum + record.bytes, 0),
  models: records
};
manifest.catalogSha256 = sha256(Buffer.from(JSON.stringify(manifest)));
await writeFile(runtimeCatalogPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

console.log(JSON.stringify({
  output: relativeToModule(runtimeCatalogPath),
  modelCount: manifest.modelCount,
  worldKitCount: manifest.worldKitCount,
  splineCount: manifest.splineCount,
  totalMiB: Number((manifest.totalBytes / 1048576).toFixed(2)),
  catalogSha256: manifest.catalogSha256
}, null, 2));
