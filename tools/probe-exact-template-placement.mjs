#!/usr/bin/env node
/* Exact-template placement probe.

   Geometry gate, not a screenshot catalog. Replicates sim.js streetFrontage +
   1.18x roadClear + required-plot rollback. Production RNG, save, and replay
   schemas are untouched.

     node tools/probe-exact-template-placement.mjs

   Fail-closed on: HEAD baseline not reproducing the two crossing failures,
   current templates failing any rotation, first required plot still bisected,
   natural map/seed miss, non-deterministic repeat, missing SITE_STAMP wrap,
   or roadClear constant drift in sim.js. */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertPlannerConstants, loadSiteTemplates, stampTemplate, sweepTemplate,
  templateAppliesToMap, classRequestKey, rotationSet
} from './mapgen/stamp-geometry.mjs';
import { parseMapDefs } from './mapgen/site-maps.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'tmp', 'site-template-stamps');
mkdirSync(OUT, { recursive: true });

const sha256 = value => createHash('sha256').update(value).digest('hex');
const read = rel => readFileSync(join(ROOT, rel), 'utf8');
const gitShow = rel => execFileSync('git', ['show', `HEAD:${rel.replace(/\\/g, '/')}`], {
  cwd: ROOT, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024
});

function attachIds(ctx) {
  for (const id of Object.keys(ctx.SITE_TPL)) ctx.SITE_TPL[id].id = id;
  return ctx;
}

function summarize(ctx) {
  const out = {};
  for (const id of Object.keys(ctx.SITE_TPL)) out[id] = sweepTemplate(ctx.SITE_TPL[id]);
  return out;
}

function firstPlot(T) {
  return (T.plots || []).find(p => p.required) || (T.plots || [])[0] || null;
}

function digest(obj) {
  return sha256(JSON.stringify(obj));
}

const simSrc = read('src/game/sim.js');
const worldSrc = read('src/engine/worldsites.js');
const tplSrc = read('assets/data/sitetemplates.js');
const glSrc = read('src/engine/gl.js');
const headTplSrc = gitShow('assets/data/sitetemplates.js');

const planner = assertPlannerConstants(simSrc);
const current = attachIds(loadSiteTemplates(tplSrc));
const baseline = attachIds(loadSiteTemplates(headTplSrc));
const maps = parseMapDefs(glSrc);

const ids = Object.keys(current.SITE_TPL);
const FAIL = [];
const note = [];

if (ids.length !== 8) FAIL.push(`expected 8 SITE_TPL entries, got ${ids.length}: ${ids.join(',')}`);
if (!planner.ok) FAIL.push(`sim.js roadClear constants drifted: ${planner.missing.join(' | ')}`);

const wrapOk = worldSrc.includes('function siteStampInstall')
  && worldSrc.includes('SITE_STAMP.fails')
  && worldSrc.includes('siteStampWrapPlan')
  && worldSrc.includes('TEMPLATE_MISSING')
  && worldSrc.includes('INCOMPATIBLE')
  && worldSrc.includes('ENVIRONMENTAL_EXHAUSTION')
  && worldSrc.includes('REQUIRED_PLOT_ROLLBACK')
  && worldSrc.includes('siteStampEnd');
if (!wrapOk) FAIL.push('worldsites.js is missing typed SITE_STAMP planDistricts result wrap');

if (/function siteTemplateFor/.test(tplSrc) && !/SITE_TPL_FORCE/.test(tplSrc))
  FAIL.push('siteTemplateFor lost SITE_TPL_FORCE exact pin');
if (/if\(!ids\.length\) for\(const id in SITE_TPL\)/.test(tplSrc))
  FAIL.push('generic class-pool remainder is still present');
if (/climate==='hive'&&c==='dusk'/.test(tplSrc) || /climate==='ice'&&c==='alpine'/.test(tplSrc))
  FAIL.push('implicit hive/dusk or ice/alpine climate aliases are still present');
if (!/SITE_TPL_RULES/.test(tplSrc) || !/INCOMPATIBLE/.test(tplSrc))
  FAIL.push('siteTemplateFor lost data-driven compatibility rules');

const beforeSweeps = summarize(baseline);
const afterSweeps = summarize(current);
const before2 = summarize(baseline);
const after2 = summarize(current);
const beforeHash = digest(beforeSweeps);
const afterHash = digest(afterSweeps);
if (beforeHash !== digest(before2)) FAIL.push('HEAD geometry sweep is not deterministic');
if (afterHash !== digest(after2)) FAIL.push('current geometry sweep is not deterministic');

const blockedBefore = ['city_brutalist_grid', 'dome_cluster'];
const beforeCounts = {};
const afterCounts = {};
for (const id of ids) {
  beforeCounts[id] = { pass: beforeSweeps[id].pass, total: beforeSweeps[id].total };
  afterCounts[id] = { pass: afterSweeps[id].pass, total: afterSweeps[id].total };
  if (afterSweeps[id].pass !== afterSweeps[id].total)
    FAIL.push(`${id} failed ${afterSweeps[id].total - afterSweeps[id].pass}/${afterSweeps[id].total} rotations`);
  for (const row of afterSweeps[id].rows) {
    if (!row.firstRequired?.ok)
      FAIL.push(`${id} first required plot failed at ga=${row.ga}: ${row.firstRequired?.reason}`);
  }
}

for (const id of blockedBefore) {
  if (!beforeSweeps[id]) { FAIL.push(`HEAD missing ${id}`); continue; }
  if (beforeSweeps[id].pass !== 0)
    FAIL.push(`${id} HEAD baseline did not reproduce the crossing failure (pass ${beforeSweeps[id].pass}/${beforeSweeps[id].total})`);
  const sample = beforeSweeps[id].rows[0];
  if (sample?.firstRequired?.reason !== 'plotRoad')
    FAIL.push(`${id} HEAD first required reject was ${sample?.firstRequired?.reason}, expected plotRoad`);
}

const natural = [];
for (const map of maps) {
  for (const id of ids) {
    const T = current.SITE_TPL[id];
    if (!templateAppliesToMap(T, map, { vm: current })) continue;
    const ga = ((map.seed ^ 0x7ACE1) >>> 0) % rotationSet().length;
    const angle = rotationSet()[ga];
    const hit = stampTemplate(T, angle);
    const row = {
      map: map.id, seed: map.seed, template: id, class: T.class,
      climate: map.climate, planet: map.planet, faction: map.faction,
      requested: map[classRequestKey(T.class)] | 0, ok: hit.ok,
      reason: hit.reason, firstRequired: hit.firstRequired?.reason || null
    };
    natural.push(row);
    if (!hit.ok) FAIL.push(`natural ${map.id} seed ${map.seed} ${id}: ${hit.reason}/${hit.requiredRole || ''}`);
  }
}
const natural2 = [];
for (const map of maps) {
  for (const id of ids) {
    const T = current.SITE_TPL[id];
    if (!templateAppliesToMap(T, map, { vm: current })) continue;
    const ga = ((map.seed ^ 0x7ACE1) >>> 0) % rotationSet().length;
    natural2.push(stampTemplate(T, rotationSet()[ga]).ok);
  }
}
if (digest(natural.map(n => [n.map, n.template, n.ok])) !== digest(natural2.map((ok, i) => [natural[i].map, natural[i].template, ok])))
  FAIL.push('natural map/seed sweep is not deterministic');

const aelosPref = natural.filter(n => n.template === 'city_brutalist_grid');
const pyraethDome = natural.filter(n => n.template === 'dome_cluster');
if (aelosPref.length < 8) FAIL.push(`too few natural prefecture maps: ${aelosPref.length}`);
if (pyraethDome.length < 6) FAIL.push(`too few natural pressure-dome maps: ${pyraethDome.length}`);
if (aelosPref.some(n => !n.ok)) FAIL.push('Aelos prefecture natural maps still fail geometry');
if (pyraethDome.some(n => !n.ok)) FAIL.push('Pyraeth pressure-dome natural maps still fail geometry');

for (const id of ids) {
  const T = current.SITE_TPL[id];
  for (const key of ['planet', 'biome', 'faction', 'purpose', 'era', 'condition']) {
    if (T[key] == null) FAIL.push(`${id} missing semantic field ${key}`);
  }
}

const firstPlotNotes = {};
for (const id of ids) {
  const T = current.SITE_TPL[id];
  const P = firstPlot(T);
  const after = afterSweeps[id].rows[0];
  firstPlotNotes[id] = {
    kind: P?.kind, role: P?.role || null, w: P?.w, h: P?.h,
    afterReason: after?.firstRequired?.reason || null,
    afterClearance: after?.firstRequired?.clearance ?? null,
    beforeReason: beforeSweeps[id]?.rows[0]?.firstRequired?.reason || null,
    beforeClearance: beforeSweeps[id]?.rows[0]?.firstRequired?.clearance ?? null
  };
}

const sourceHashes = {
  sitetemplates: sha256(tplSrc),
  worldsites: sha256(worldSrc),
  stampGeometry: sha256(read('tools/mapgen/stamp-geometry.mjs')),
  siteMaps: sha256(read('tools/mapgen/site-maps.mjs')),
  sim: sha256(simSrc)
};

const report = {
  schema: 'MassfrontExactTemplatePlacementProbeV1',
  generatedAt: new Date().toString ? new Date().toISOString() : '',
  status: FAIL.length ? 'FAIL' : 'PASS',
  beforeCounts, afterCounts, beforeHash, afterHash,
  naturalMaps: natural.length, naturalPass: natural.filter(n => n.ok).length,
  aelosPrefecture: { maps: aelosPref.length, pass: aelosPref.filter(n => n.ok).length, ids: aelosPref.map(n => n.map) },
  pyraethDomes: { maps: pyraethDome.length, pass: pyraethDome.filter(n => n.ok).length, ids: pyraethDome.map(n => n.map) },
  firstPlotNotes, planner, sourceHashes, fails: FAIL, notes: note,
  templates: ids
};

writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(`${report.status} exact-template placement`);
console.log(`HEAD hashes ${beforeHash}`);
console.log(`curr hashes ${afterHash}`);
for (const id of ids) {
  const b = beforeCounts[id], a = afterCounts[id];
  console.log(`  ${id.padEnd(22)} before ${b.pass}/${b.total}  after ${a.pass}/${a.total}`);
}
console.log(`natural ${report.naturalPass}/${report.naturalMaps}  aelos prefecture ${report.aelosPrefecture.pass}/${report.aelosPrefecture.maps}  pyraeth domes ${report.pyraethDomes.pass}/${report.pyraethDomes.maps}`);
if (FAIL.length) console.log(FAIL.map(x => 'FAIL  ' + x).join('\n'));
process.exitCode = FAIL.length ? 1 : 0;
