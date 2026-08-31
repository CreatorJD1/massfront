import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeGallery } from './build-stage10-model-review-gallery.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'tmp', 'stage10-model-review');
const CATALOG_PATH = path.join(OUT, 'catalog.json');
const HTML_PATH = path.join(OUT, 'index.html');
const EXPECTED_FAMILIES = new Map([
  ['mf-ground-kit-v1', 36],
  ['mf-modular-road-v1', 7],
  ['mf-transit-kit-v1', 54],
  ['mf-platform-hs-v1', 30],
  ['mf-modular-building-v1', 36],
  ['mf-building-hs-v1', 36],
  ['mf-cityforms-kit-v1', 72],
  ['mf-superstructure-v1', 57],
]);
const EXPECTED_REPAIR_LOCKED = [
  'brutalist_tank_farm',
  'colonial_depot_shed',
  'colonial_gatehouse',
  'colonial_industrial_hall',
  'ruined_depot_shed',
  'ruined_tower_slab',
  'ruined_tower_spire',
];
const EXPECTED_STALE_ALIASES = [
  'mf-road-primary-local-adapter.glb',
  'mf-road-t-junction.glb',
  'mf-road-x-plaza.glb',
];
const SPLINE_DIRS = [
  'modules/space_exploration/assets/source/spline/world-prefabs/exports',
  'modules/space_exploration/assets/source/spline/ground-sites/aelos_caldris/spline-exports',
  'modules/space_exploration/assets/source/spline/hunyuan/spline-exports',
];
const SPLINE_MANIFEST = 'modules/space_exploration/assets/source/spline/world-prefabs/SPLINE_EXPORT_MANIFEST.json';
const ROAD_QA_DIRS = [
  'modules/space_exploration/assets/source/blender/world-kits/mf-road-junctions-v1/review-exports',
  'modules/space_exploration/assets/source/blender/world-kits/mf-road-straight-hunyuan-clean-v1/review-exports',
];

// tmp/ is intentionally untracked, so every verification run must rebuild the
// review artifact from current source reports before checking its contents.
writeGallery();

const checks = [];
function check(condition, message) {
  if (!condition) throw new Error(message);
  checks.push(message);
}
function posix(value) { return value.replaceAll('\\', '/'); }
function full(relativePath) {
  const candidate = path.resolve(ROOT, relativePath);
  check(candidate === ROOT || candidate.startsWith(ROOT + path.sep), `contained path ${relativePath}`);
  return candidate;
}
function sha256(relativePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(full(relativePath))).digest('hex');
}
function currentGlbs(relativeDirectory) {
  return fs.readdirSync(full(relativeDirectory), { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.glb'))
    .map((entry) => `${relativeDirectory}/${entry.name}`)
    .sort();
}
function sameMembers(actual, expected, label) {
  check(JSON.stringify([...actual].sort()) === JSON.stringify([...expected].sort()), `${label} exact members`);
}
function verifyFile(record, label) {
  check(record && typeof record.path === 'string', `${label} declares path`);
  const stat = fs.statSync(full(record.path));
  check(stat.isFile() && stat.size > 0, `${label} exists and is non-empty`);
  check(stat.size === record.bytes, `${label} byte count is source-matched`);
  check(sha256(record.path) === record.sha256, `${label} hash is source-matched`);
}

check(fs.existsSync(CATALOG_PATH), 'catalog exists');
check(fs.existsSync(HTML_PATH), 'gallery HTML exists');
const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
const html = fs.readFileSync(HTML_PATH, 'utf8');
check(catalog.schema === 'MassfrontStage10ModelReviewCatalogV1', 'catalog schema is exact');
check(catalog.lifecycle === 'REVIEW_ONLY_RUNTIME_INACTIVE', 'catalog lifecycle is review-only');
check(catalog.allRuntimeActive === false && catalog.allRuntimeRegistered === false, 'catalog runtime flags fail closed');
check(catalog.outputBoundary === 'tmp/stage10-model-review', 'output boundary is isolated under tmp');
sameMembers(catalog.sourceRootsReadOnly, [
  'modules/space_exploration/assets/source/blender/world-kits',
  'modules/space_exploration/assets/source/spline',
], 'read-only source roots');

check(Array.isArray(catalog.worldKits) && catalog.worldKits.length === 8, 'eight world-kit families');
const allWorldModules = [];
for (const family of catalog.worldKits) {
  check(EXPECTED_FAMILIES.has(family.id), `known world-kit family ${family.id}`);
  const expectedCount = EXPECTED_FAMILIES.get(family.id);
  check(family.moduleCount === expectedCount && family.modules.length === expectedCount, `${family.id} exact report count ${expectedCount}`);
  verifyFile(family.sourceReport, `${family.id} report`);
  const liveReport = JSON.parse(fs.readFileSync(full(family.sourceReport.path), 'utf8'));
  sameMembers(family.modules.map((item) => item.id), liveReport.modules.map((item) => item.id), `${family.id} report-authoritative IDs`);
  for (const item of family.modules) {
    check(item.family === family.id && item.sourceReport === family.sourceReport.path, `${item.key} is report-bound`);
    check(item.runtimeActive === false && item.runtimeRegistered === false, `${item.key} runtime flags are false`);
    check(item.lifecycle === (item.repairLocked ? 'REPAIR_LOCKED_VISUAL_REVIEW' : 'SOURCE_CANDIDATE_UNREGISTERED'), `${item.key} lifecycle matches lock state`);
    check(item.processingEligible === !item.repairLocked, `${item.key} processing eligibility fails closed`);
    verifyFile(item.model, `${item.key} model`);
    verifyFile(item.preview, `${item.key} evidence`);
    check(item.preview.path.includes(`/${family.id}/evidence/`) && item.preview.path.toLowerCase().endsWith('.png'), `${item.key} preview is family evidence`);
    allWorldModules.push(item);
  }
}
check(allWorldModules.length === 328 && catalog.counts.worldKitModules === 328, '328 report-authoritative world-kit modules');
check(new Set(allWorldModules.map((item) => item.key)).size === 328, 'world-kit keys are unique');
const actualRepairLocked = allWorldModules.filter((item) => item.repairLocked).map((item) => item.id);
sameMembers(actualRepairLocked, EXPECTED_REPAIR_LOCKED, 'seven repair-locked building IDs');
sameMembers(catalog.repairLockedIds, EXPECTED_REPAIR_LOCKED, 'repair-lock catalog declaration');
check(actualRepairLocked.length === 7 && catalog.counts.repairLocked === 7, 'repair-lock count is seven');
check(catalog.counts.worldKitProcessingEligible === 321, '321 world-kit modules remain processing candidates');

const expectedRoadQa = ROAD_QA_DIRS.flatMap(currentGlbs);
check(expectedRoadQa.length === 31 && catalog.roadQa.length === 31 && catalog.counts.roadQaGlbs === 31, '31 road-QA GLBs are separate');
sameMembers(catalog.roadQa.map((item) => item.model.path), expectedRoadQa, 'road-QA GLB inventory');
for (const item of catalog.roadQa) {
  check(item.lifecycle === 'ROAD_QA_REVIEW_ONLY' && item.processingEligible === false, `${item.key} is QA-only`);
  check(item.runtimeActive === false && item.runtimeRegistered === false, `${item.key} runtime flags are false`);
  verifyFile(item.model, `${item.key} model`);
  verifyFile(item.preview, `${item.key} evidence`);
}

const expectedSpline = SPLINE_DIRS.flatMap(currentGlbs);
verifyFile(catalog.splineManifest, 'Spline export manifest');
check(catalog.splineManifest.path === SPLINE_MANIFEST, 'Spline manifest path is exact');
const splineManifest = JSON.parse(fs.readFileSync(full(SPLINE_MANIFEST), 'utf8'));
check(String(splineManifest.status || '').startsWith('SOURCE_AUTHORING_ONLY'), 'Spline manifest remains source-authoring-only');
sameMembers(splineManifest.files.map((entry) => posix(entry.file)), expectedSpline, 'Spline manifest and disk inventory match');
check(expectedSpline.length === 22 && catalog.splineExports.length === 22 && catalog.counts.splineExports === 22, '22 Spline exports');
sameMembers(catalog.splineExports.map((item) => item.model.path), expectedSpline, 'Spline export inventory');
for (const item of catalog.splineExports) {
  const expectedLifecycle = item.metadataBlocked ? 'METADATA_BLOCKED_VISUAL_REVIEW' :
    item.preview ? 'MODEL_VISUAL_REVIEW_PENDING' : 'NEEDS_ISOLATED_RENDER';
  check(item.lifecycle === expectedLifecycle, `${item.key} lifecycle matches render/metadata state`);
  check(item.modelCompletion === (item.metadataBlocked ? 'UNKNOWN_METADATA_BLOCKED' : 'HUMAN_REVIEW_PENDING'), `${item.key} model completion stays explicit`);
  check(item.productionState === 'PRODUCTION_PROCESSING_PENDING', `${item.key} production processing remains pending`);
  if (item.preview) {
    verifyFile(item.preview, `${item.key} isolated render`);
    check(item.preview.path.startsWith('tmp/model-review-2026-08-29/spline-renders/') && item.preview.path.endsWith('.png'), `${item.key} preview stays isolated under tmp`);
  }
  check(item.processingEligible === false && item.runtimeActive === false && item.runtimeRegistered === false, `${item.key} remains inactive`);
  check(!/\/characters\/|\/rejected-candidates\//i.test(item.model.path), `${item.key} excludes characters and rejected candidates`);
  verifyFile(item.model, `${item.key} model`);
  const manifestEntry = splineManifest.files.find((entry) => posix(entry.file) === item.model.path);
  check(manifestEntry?.bytes === item.model.bytes && manifestEntry?.sha256 === item.model.sha256, `${item.key} matches Spline manifest hash and size`);
}
check(catalog.counts.splineRendered === catalog.splineExports.filter((item) => item.preview).length, 'Spline rendered count matches current scratch evidence');
check(catalog.counts.splineMetadataBlocked === 1, 'one Spline export is metadata blocked');
check(catalog.splineExports.find((item) => item.id === 'MF_STRUCT_CITYTOWER_02')?.metadataBlocked === true, 'MF_STRUCT_CITYTOWER_02 is metadata blocked');

const staleGroup = catalog.exclusions.find((group) => group.label === 'Stale road aliases');
sameMembers(staleGroup?.entries || [], EXPECTED_STALE_ALIASES, 'three stale road aliases');
const canonicalRoadModels = new Set(allWorldModules.filter((item) => item.family === 'mf-modular-road-v1').map((item) => path.basename(item.model.path)));
for (const staleAlias of EXPECTED_STALE_ALIASES) {
  const stalePath = `modules/space_exploration/assets/source/blender/world-kits/mf-modular-road-v1/exports/${staleAlias}`;
  check(fs.existsSync(full(stalePath)), `stale alias remains identifiable: ${staleAlias}`);
  check(!canonicalRoadModels.has(staleAlias), `stale alias excluded: ${staleAlias}`);
}

const everyItem = [...allWorldModules, ...catalog.roadQa, ...catalog.splineExports];
check(everyItem.every((item) => item.runtimeActive === false && item.runtimeRegistered === false), 'every catalog item is runtime inactive and unregistered');
check(everyItem.every((item) => !/\/characters\/|\/rejected-candidates\//i.test(item.model.path)), 'characters and rejected candidates are absent');

const runtimeRoots = ['boot.js', 'assets/data/manifest.json', 'src', 'modules/space_exploration'];
const runtimeFiles = [];
function collect(candidate) {
  const stat = fs.statSync(candidate);
  if (stat.isDirectory()) {
    const relative = posix(path.relative(ROOT, candidate));
    if (relative.includes('/assets/source') || relative === 'modules/space_exploration/tmp' || relative.startsWith('modules/space_exploration/tmp/')) return;
    for (const entry of fs.readdirSync(candidate)) collect(path.join(candidate, entry));
  } else if (/\.(?:js|mjs|json|html)$/i.test(candidate)) runtimeFiles.push(candidate);
}
for (const runtimeRoot of runtimeRoots) if (fs.existsSync(full(runtimeRoot))) collect(full(runtimeRoot));
const modelNames = new Set(everyItem.map((item) => path.basename(item.model.path)));
const runtimeReferences = [];
for (const runtimeFile of runtimeFiles) {
  const text = fs.readFileSync(runtimeFile, 'utf8');
  for (const modelName of modelNames) if (text.includes(modelName)) runtimeReferences.push(`${posix(path.relative(ROOT, runtimeFile))}:${modelName}`);
}
check(runtimeReferences.length === 0, 'no catalog model basename is referenced by runtime text');

check(html.includes('MODEL<br>ADMISSION BOARD'), 'HTML has review-board identity');
check(html.includes('Everything shown is runtime inactive and unregistered.'), 'HTML states runtime boundary');
check(html.includes('Unfinished models / repair required'), 'HTML separates model-wise unfinished repair queue');
check(html.includes('Known geometry failures only.'), 'HTML distinguishes geometry failures from review status');
check(html.includes('Metadata blocked'), 'HTML separates metadata-blocked models');
for (const count of ['328', '31', '22', '7']) check(html.includes(`>${count}<`), `HTML displays ${count}`);
for (const lockedId of EXPECTED_REPAIR_LOCKED) check(html.includes(lockedId.replaceAll('_', ' ')) || html.includes(lockedId), `HTML displays repair-locked ${lockedId}`);
check(!html.includes('mf-road-primary-local-adapter.glb</code>'), 'HTML does not present stale primary/local adapter alias');
check(!html.includes('mf-road-t-junction.glb</code>'), 'HTML does not present stale T-junction alias');
check(!html.includes('mf-road-x-plaza.glb</code>'), 'HTML does not present stale X-plaza alias');

const generatorSource = fs.readFileSync(full('tools/build-stage10-model-review-gallery.mjs'), 'utf8');
check(generatorSource.includes("'tmp', 'stage10-model-review'"), 'generator output is statically bounded to tmp review directory');
check(!/writeFileSync\([^\n]*(?:modules|assets\/source)/.test(generatorSource), 'generator has no source-tree write target');

console.log(JSON.stringify({
  status: 'PASS',
  checks: checks.length,
  counts: catalog.counts,
  output: ['tmp/stage10-model-review/index.html', 'tmp/stage10-model-review/catalog.json'],
}, null, 2));
