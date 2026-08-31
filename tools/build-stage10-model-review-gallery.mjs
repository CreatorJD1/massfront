import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT_DIR = path.join(REPO_ROOT, 'tmp', 'stage10-model-review');
const WORLD_KIT_ROOT = 'modules/space_exploration/assets/source/blender/world-kits';

export const WORLD_KIT_FAMILIES = Object.freeze([
  { id: 'mf-ground-kit-v1', label: 'Ground, plazas & pathing surfaces', expected: 36 },
  { id: 'mf-modular-road-v1', label: 'Report-authoritative modular roads', expected: 7 },
  { id: 'mf-transit-kit-v1', label: 'Transit, bridges & ramps', expected: 54 },
  { id: 'mf-platform-hs-v1', label: 'Platforms & floating/sea infrastructure', expected: 30 },
  { id: 'mf-modular-building-v1', label: 'Modular structures', expected: 36 },
  { id: 'mf-building-hs-v1', label: 'Hard-surface buildings', expected: 36 },
  { id: 'mf-cityforms-kit-v1', label: 'City forms & industrial landmarks', expected: 72 },
  { id: 'mf-superstructure-v1', label: 'Megastructures & fortifications', expected: 57 },
]);

export const REPAIR_LOCKED_IDS = Object.freeze([
  'colonial_gatehouse',
  'colonial_depot_shed',
  'colonial_industrial_hall',
  'brutalist_tank_farm',
  'ruined_depot_shed',
  'ruined_tower_slab',
  'ruined_tower_spire',
]);

export const STALE_ROAD_ALIASES = Object.freeze([
  'mf-road-primary-local-adapter.glb',
  'mf-road-t-junction.glb',
  'mf-road-x-plaza.glb',
]);

const SPLINE_EXPORT_DIRS = Object.freeze([
  'modules/space_exploration/assets/source/spline/world-prefabs/exports',
  'modules/space_exploration/assets/source/spline/ground-sites/aelos_caldris/spline-exports',
  'modules/space_exploration/assets/source/spline/hunyuan/spline-exports',
]);
const SPLINE_EXPORT_MANIFEST = 'modules/space_exploration/assets/source/spline/world-prefabs/SPLINE_EXPORT_MANIFEST.json';
const SPLINE_RENDER_DIR = 'tmp/model-review-2026-08-29/spline-renders';
const SPLINE_METADATA_BLOCKED_IDS = Object.freeze(['MF_STRUCT_CITYTOWER_02']);

function posix(relativePath) {
  return relativePath.replaceAll('\\', '/');
}

function absolute(relativePath) {
  const fullPath = path.resolve(REPO_ROOT, relativePath);
  if (fullPath !== REPO_ROOT && !fullPath.startsWith(REPO_ROOT + path.sep)) {
    throw new Error(`Path escapes repository: ${relativePath}`);
  }
  return fullPath;
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(absolute(relativePath), 'utf8'));
}

function digest(relativePath) {
  const data = fs.readFileSync(absolute(relativePath));
  return {
    sha256: crypto.createHash('sha256').update(data).digest('hex'),
    bytes: data.length,
  };
}

function fileRecord(relativePath) {
  return { path: posix(relativePath), ...digest(relativePath) };
}

function evidenceFor(moduleId, evidencePaths) {
  const underscore = moduleId.toLowerCase();
  const hyphen = underscore.replaceAll('_', '-');
  const matches = evidencePaths.filter((candidate) => {
    const name = path.basename(candidate).toLowerCase();
    return name.includes(underscore) || name.includes(hyphen);
  });
  matches.sort((a, b) => {
    const score = (candidate) => {
      const name = path.basename(candidate).toLowerCase();
      if (name.includes('iso_ne')) return 0;
      if (name.includes('iso_nw')) return 1;
      if (name.includes('-iso-')) return 2;
      if (name.includes('-top-') || name.endsWith('-top.png')) return 3;
      return 4;
    };
    return score(a) - score(b) || a.localeCompare(b);
  });
  if (!matches.length) throw new Error(`No report-declared evidence for module ${moduleId}`);
  return posix(matches[0]);
}

function exportedModelFor(family, module, report) {
  const reportExports = report.exports || [];
  const byModule = reportExports.find((entry) => entry && typeof entry === 'object' && entry.module === module.id);
  if (byModule?.path) return posix(byModule.path);

  if (family.id === 'mf-modular-road-v1') {
    const canonicalName = `mf-road-${module.id}.glb`;
    const candidate = reportExports.find((entry) => typeof entry === 'string' && path.basename(entry) === canonicalName);
    if (candidate) return posix(candidate);
  }

  const prefix = family.id === 'mf-building-hs-v1' ? 'mf-bldhs-' : 'mf-plat-';
  const candidate = `${WORLD_KIT_ROOT}/${family.id}/exports/${prefix}${module.id.replaceAll('_', '-')}.glb`;
  if (fs.existsSync(absolute(candidate))) return candidate;
  throw new Error(`No report-correlated export for ${family.id}/${module.id}`);
}

function buildWorldKits() {
  const repairSet = new Set(REPAIR_LOCKED_IDS);
  return WORLD_KIT_FAMILIES.map((family) => {
    const reportPath = `${WORLD_KIT_ROOT}/${family.id}/${family.id}-report.json`;
    const report = readJson(reportPath);
    if (!Array.isArray(report.modules) || report.modules.length !== family.expected) {
      throw new Error(`${family.id} expected ${family.expected} report modules, found ${report.modules?.length}`);
    }
    const evidencePaths = report.evidenceRenders || [];
    const modules = report.modules.map((module, moduleIndex) => {
      const modelPath = exportedModelFor(family, module, report);
      const previewPath = evidenceFor(module.id, evidencePaths);
      const repairLocked = family.id === 'mf-building-hs-v1' && repairSet.has(module.id);
      return {
        key: `${family.id}/${module.id}`,
        id: module.id,
        family: family.id,
        category: family.label,
        moduleIndex,
        lifecycle: repairLocked ? 'REPAIR_LOCKED_VISUAL_REVIEW' : 'SOURCE_CANDIDATE_UNREGISTERED',
        repairLocked,
        processingEligible: !repairLocked,
        runtimeActive: false,
        runtimeRegistered: false,
        model: fileRecord(modelPath),
        preview: fileRecord(previewPath),
        sourceReport: reportPath,
      };
    });
    return {
      id: family.id,
      label: family.label,
      moduleCount: modules.length,
      repairLockedCount: modules.filter((module) => module.repairLocked).length,
      sourceReport: fileRecord(reportPath),
      modules,
    };
  });
}

function evidenceForRoadQa(modelPath) {
  const name = path.basename(modelPath, '.glb');
  if (modelPath.includes('/mf-road-junctions-v1/')) {
    const piece = name.replace(/-(?:lod[0-2]|collision|nav)-review$/, '');
    return `${WORLD_KIT_ROOT}/mf-road-junctions-v1/evidence/${piece}-iso-1024.png`;
  }
  const reference = name.includes('normalized-reference');
  return `${WORLD_KIT_ROOT}/mf-road-straight-hunyuan-clean-v1/evidence/mf-road-straight-hunyuan-${reference ? 'reference' : 'clean'}-iso-1024.png`;
}

function glbsIn(relativeDirectory) {
  return fs.readdirSync(absolute(relativeDirectory), { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.glb'))
    .map((entry) => `${relativeDirectory}/${entry.name}`)
    .sort();
}

function buildRoadQa() {
  const directories = [
    `${WORLD_KIT_ROOT}/mf-road-junctions-v1/review-exports`,
    `${WORLD_KIT_ROOT}/mf-road-straight-hunyuan-clean-v1/review-exports`,
  ];
  const modelPaths = directories.flatMap(glbsIn);
  if (modelPaths.length !== 31) throw new Error(`Expected 31 road-QA GLBs, found ${modelPaths.length}`);
  return modelPaths.map((modelPath) => {
    const previewPath = evidenceForRoadQa(modelPath);
    return {
      key: `road-qa/${path.basename(modelPath, '.glb')}`,
      id: path.basename(modelPath, '.glb'),
      category: 'Road QA review exports',
      lifecycle: 'ROAD_QA_REVIEW_ONLY',
      processingEligible: false,
      runtimeActive: false,
      runtimeRegistered: false,
      model: fileRecord(modelPath),
      preview: fileRecord(previewPath),
    };
  });
}

function splineLabel(relativePath) {
  return path.basename(relativePath, '.glb').replaceAll('_', ' ').replaceAll('-', ' ');
}

function buildSplineExports() {
  const manifest = readJson(SPLINE_EXPORT_MANIFEST);
  if (!String(manifest.status || '').startsWith('SOURCE_AUTHORING_ONLY') || !Array.isArray(manifest.files)) {
    throw new Error('Spline export manifest must remain source-authoring-only');
  }
  const modelPaths = manifest.files.map((entry) => posix(entry.file));
  const diskPaths = SPLINE_EXPORT_DIRS.flatMap(glbsIn);
  if (JSON.stringify([...modelPaths].sort()) !== JSON.stringify([...diskPaths].sort())) {
    throw new Error('Spline export disk inventory drifted from its manifest');
  }
  if (modelPaths.length !== 22) throw new Error(`Expected 22 Spline exports, found ${modelPaths.length}`);
  return modelPaths.map((modelPath) => {
    const id = path.basename(modelPath, '.glb');
    const previewPath = `${SPLINE_RENDER_DIR}/${id}.png`;
    const hasIsolatedRender = fs.existsSync(absolute(previewPath));
    const metadataBlocked = SPLINE_METADATA_BLOCKED_IDS.includes(id);
    const declared = manifest.files.find((entry) => posix(entry.file) === modelPath);
    const model = fileRecord(modelPath);
    if (!declared || declared.bytes !== model.bytes || declared.sha256 !== model.sha256) {
      throw new Error(`Spline export drifted from manifest: ${modelPath}`);
    }
    return {
      key: `spline/${id}`,
      id,
      label: splineLabel(modelPath),
      category: modelPath.includes('/world-prefabs/') ? 'Spline world prefabs' : 'Spline ground-site concepts',
      lifecycle: metadataBlocked ? 'METADATA_BLOCKED_VISUAL_REVIEW' :
        hasIsolatedRender ? 'MODEL_VISUAL_REVIEW_PENDING' : 'NEEDS_ISOLATED_RENDER',
      modelCompletion: metadataBlocked ? 'UNKNOWN_METADATA_BLOCKED' : 'HUMAN_REVIEW_PENDING',
      productionState: 'PRODUCTION_PROCESSING_PENDING',
      metadataBlocked,
      processingEligible: false,
      runtimeActive: false,
      runtimeRegistered: false,
      model,
      preview: hasIsolatedRender ? fileRecord(previewPath) : null,
      renderReason: hasIsolatedRender ? 'Isolated background render captured; geometry completion still requires human review.' :
        'No isolated preview exists; model completion cannot be judged.',
    };
  });
}

function relativeHref(relativePath) {
  return posix(path.relative(OUTPUT_DIR, absolute(relativePath))).split('/').map(encodeURIComponent).join('/');
}

function esc(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

function card(item) {
  const preview = item.preview
    ? `<a class="preview" href="${relativeHref(item.preview.path)}"><img loading="lazy" src="${relativeHref(item.preview.path)}" alt="${esc(item.id)} evidence preview"></a>`
    : `<div class="preview placeholder"><span>ISOLATED RENDER<br>REQUIRED</span></div>`;
  const repair = item.repairLocked ? '<span class="chip danger">REPAIR LOCKED</span>' : '';
  const production = item.productionState ? `<span class="chip">${esc(item.productionState)}</span>` : '';
  return `<article class="card ${item.repairLocked ? 'locked' : ''}" data-search="${esc(`${item.id} ${item.category} ${item.lifecycle}`.toLowerCase())}">
    ${preview}
    <div class="cardbody"><h3>${esc(item.label || item.id)}</h3><div class="chips"><span class="chip">${esc(item.lifecycle)}</span>${repair}${production}</div>
    <p>${esc(item.category)}</p><details><summary>Source details</summary><code>${esc(item.model.path)}</code><br><small>${item.model.bytes.toLocaleString()} bytes · ${esc(item.model.sha256.slice(0, 12))}</small></details></div>
  </article>`;
}

function section(id, label, items, note = '') {
  return `<section id="${esc(id)}"><header><div><p class="eyebrow">CATEGORY</p><h2>${esc(label)}</h2></div><strong>${items.length}</strong></header>${note ? `<p class="sectionnote">${esc(note)}</p>` : ''}<div class="grid">${items.map(card).join('')}</div></section>`;
}

function buildHtml(catalog) {
  const repairLocked = catalog.worldKits.flatMap((family) => family.modules.filter((item) => item.repairLocked));
  const repairSection = section('unfinished-models', 'Unfinished models / repair required', repairLocked,
    'Known geometry failures only. These are separated from visually unreviewed candidates and cannot enter processing.');
  const worldSections = catalog.worldKits.map((family) => section(family.id, family.label,
    family.modules.filter((item) => !item.repairLocked),
    family.repairLockedCount ? `${family.repairLockedCount} known failures were moved to the separate unfinished-model queue. Remaining entries still await human visual review.` : 'Report-authoritative source candidates awaiting human visual review; no runtime registration.'));
  const roadSection = section('road-qa', 'Road QA review exports', catalog.roadQa,
    '31 LOD, collision, nav, reference and junction files kept separate from the 328 report-authoritative world-kit modules.');
  const metadataBlocked = catalog.splineExports.filter((item) => item.metadataBlocked);
  const metadataSection = section('metadata-blocked', 'Metadata blocked', metadataBlocked,
    'Exported geometry exists, but required authoring metadata is incomplete. This is separate from a known geometry failure.');
  const splineSections = ['Spline world prefabs', 'Spline ground-site concepts'].map((label) =>
    section(label.toLowerCase().replaceAll(' ', '-'), label,
      catalog.splineExports.filter((item) => item.category === label && !item.metadataBlocked),
      'Successful isolated renders remain human-review pending; all entries still need LOD, collision, optimization, and runtime admission.'));
  const exclusionRows = catalog.exclusions.map((group) => `<li><strong>${esc(group.label)}</strong><span>${group.entries.map(esc).join(' · ')}</span></li>`).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>MASSFRONT Stage 10 Model Review</title>
  <style>
  :root{color-scheme:dark;--bg:#071017;--panel:#0d1922;--line:#234454;--cyan:#67e8f9;--gold:#f6c453;--red:#ff647c;--text:#e9f5fa;--muted:#8ba5b2}*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 18% 0,#123044 0,transparent 34rem),var(--bg);color:var(--text);font:14px/1.45 system-ui,-apple-system,Segoe UI,sans-serif}nav{position:sticky;top:0;z-index:5;display:flex;gap:16px;align-items:center;padding:12px max(18px,4vw);background:#071017e8;border-bottom:1px solid var(--line);backdrop-filter:blur(16px)}nav b{letter-spacing:.13em}input{margin-left:auto;min-width:260px;padding:10px 13px;color:var(--text);background:#0b1821;border:1px solid var(--line);border-radius:8px}.hero,main{width:min(1520px,94vw);margin:auto}.hero{padding:52px 0 30px}.eyebrow{margin:0 0 5px;color:var(--cyan);font-size:11px;letter-spacing:.2em}.hero h1{margin:0;font-size:clamp(34px,6vw,74px);line-height:.95;letter-spacing:-.035em}.hero>p{max-width:830px;color:var(--muted);font-size:17px}.warning{padding:14px 16px;border:1px solid #7e5a1b;background:#281e0c;border-radius:10px;color:#ffe1a1}.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:22px 0}.stat{padding:17px;background:linear-gradient(145deg,#10232e,#0a151d);border:1px solid var(--line);border-radius:10px}.stat strong{display:block;color:var(--cyan);font-size:29px}.stat span{color:var(--muted)}section{margin:42px 0 64px;scroll-margin-top:78px}section>header{display:flex;justify-content:space-between;align-items:end;padding-bottom:10px;border-bottom:1px solid var(--line)}section h2{margin:0;font-size:25px}section>header strong{font-size:28px;color:var(--cyan)}.sectionnote{color:var(--muted)}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(245px,1fr));gap:12px}.card{overflow:hidden;background:var(--panel);border:1px solid #173746;border-radius:9px}.card.locked{border-color:#8d3344}.preview{display:flex;aspect-ratio:16/10;background:#050b0f;align-items:center;justify-content:center;overflow:hidden}.preview img{width:100%;height:100%;object-fit:cover;transition:.2s transform}.preview:hover img{transform:scale(1.025)}.placeholder{background:repeating-linear-gradient(135deg,#0b1821,#0b1821 12px,#0e222d 12px,#0e222d 24px);color:var(--cyan);letter-spacing:.15em;text-align:center}.cardbody{padding:13px}.card h3{margin:0 0 8px;font-size:15px;overflow-wrap:anywhere}.card p{color:var(--muted);margin:9px 0}.chips{display:flex;flex-wrap:wrap;gap:5px}.chip{display:inline-block;padding:3px 6px;color:var(--cyan);border:1px solid #2c6376;border-radius:4px;font-size:9px;letter-spacing:.07em}.chip.danger{color:#ff9cab;border-color:#8d3344}details{color:var(--muted)}code{display:inline-block;max-width:100%;color:#9cc7d5;font-size:10px;overflow-wrap:anywhere}#exclusions ul{display:grid;gap:10px;padding:0;list-style:none}#exclusions li{display:grid;gap:4px;padding:14px;border-left:3px solid var(--red);background:#170e15}#exclusions span{color:var(--muted);overflow-wrap:anywhere}.hidden{display:none!important}footer{padding:28px max(18px,4vw);border-top:1px solid var(--line);color:var(--muted)}@media(max-width:700px){nav b{display:none}input{width:100%;min-width:0}.stats{grid-template-columns:1fr 1fr}.hero{padding-top:34px}}
  </style></head><body><nav><b>MASSFRONT / STAGE 10</b><span>MODEL ADMISSION REVIEW</span><input id="filter" type="search" placeholder="Filter models or categories…"></nav>
  <div class="hero"><p class="eyebrow">READ-ONLY SOURCE REVIEW</p><h1>MODEL<br>ADMISSION BOARD</h1><p>Existing report-bound evidence is grouped for visual review. This board does not accept, register, convert, repair, or render a model. It never communicates with the currently open Blender or VRoid sessions.</p>
  <div class="warning"><strong>Everything shown is runtime inactive and unregistered.</strong> Seven hard-surface buildings remain repair-locked; Spline exports remain render-gated.</div>
  <div class="stats"><div class="stat"><strong>${catalog.counts.worldKitModules}</strong><span>world-kit modules</span></div><div class="stat"><strong>${catalog.counts.roadQaGlbs}</strong><span>road-QA GLBs</span></div><div class="stat"><strong>${catalog.counts.splineExports}</strong><span>Spline exports</span></div><div class="stat"><strong>${catalog.counts.repairLocked}</strong><span>repair-locked</span></div></div></div>
  <main>${repairSection}${metadataSection}${worldSections.join('')}${roadSection}${splineSections.join('')}<section id="exclusions"><header><div><p class="eyebrow">NOT ADMITTED</p><h2>Explicit exclusions</h2></div></header><ul>${exclusionRows}</ul></section></main>
  <footer>Generated from source reports and existing evidence · Runtime inactive · Human review required</footer><script>const f=document.querySelector('#filter');f.addEventListener('input',()=>{const q=f.value.trim().toLowerCase();document.querySelectorAll('.card').forEach(c=>c.classList.toggle('hidden',q&&!c.dataset.search.includes(q)));});</script></body></html>`;
}

export function buildCatalog() {
  const worldKits = buildWorldKits();
  const roadQa = buildRoadQa();
  const splineExports = buildSplineExports();
  const worldKitModules = worldKits.reduce((sum, family) => sum + family.moduleCount, 0);
  const repairLocked = worldKits.reduce((sum, family) => sum + family.repairLockedCount, 0);
  return {
    schema: 'MassfrontStage10ModelReviewCatalogV1',
    lifecycle: 'REVIEW_ONLY_RUNTIME_INACTIVE',
    allRuntimeActive: false,
    allRuntimeRegistered: false,
    outputBoundary: 'tmp/stage10-model-review',
    sourceRootsReadOnly: [
      WORLD_KIT_ROOT,
      'modules/space_exploration/assets/source/spline',
    ],
    counts: {
      worldKitFamilies: worldKits.length,
      worldKitModules,
      worldKitProcessingEligible: worldKitModules - repairLocked,
      repairLocked,
      roadQaGlbs: roadQa.length,
      splineExports: splineExports.length,
      splineRendered: splineExports.filter((item) => item.preview).length,
      splineMetadataBlocked: splineExports.filter((item) => item.metadataBlocked).length,
    },
    repairLockedIds: [...REPAIR_LOCKED_IDS],
    worldKits,
    roadQa,
    splineExports,
    splineManifest: fileRecord(SPLINE_EXPORT_MANIFEST),
    exclusions: [
      { label: 'Stale road aliases', entries: [...STALE_ROAD_ALIASES] },
      { label: 'Characters / VRoid', entries: ['modules/space_exploration/assets/source/blender/characters/', 'modules/space_exploration/assets/source/spline/characters/'] },
      { label: 'Rejected candidates', entries: ['**/rejected-candidates/**'] },
    ],
  };
}

export function writeGallery() {
  const catalog = buildCatalog();
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUTPUT_DIR, 'catalog.json'), `${JSON.stringify(catalog, null, 2)}\n`);
  fs.writeFileSync(path.join(OUTPUT_DIR, 'index.html'), buildHtml(catalog));
  console.log(JSON.stringify({ status: 'PASS', output: posix(path.relative(REPO_ROOT, OUTPUT_DIR)), counts: catalog.counts }, null, 2));
  return catalog;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) writeGallery();
