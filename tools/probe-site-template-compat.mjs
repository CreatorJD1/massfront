#!/usr/bin/env node
/* Site-template compatibility fixture.

   Node-only, no GPU. Proves the production selector cannot resolve an
   ordinary city (or any other requested class) when the location is
   incompatible, while civic Aelos / dusk Pyraeth pools stay deterministic.

     node tools/probe-site-template-compat.mjs

   Does not author generic art to make volcanic/glacial/desert/jungle/oceanic
   or Brood-infestation requests green. Those stay typed INCOMPATIBLE until
   a matching template exists. */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSiteTemplates, mapTemplateContext, classRequestKey } from './mapgen/stamp-geometry.mjs';
import { parseMapDefs } from './mapgen/site-maps.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'tmp', 'site-template-compat');
mkdirSync(OUT, { recursive: true });

const sha256 = value => createHash('sha256').update(value).digest('hex');
const read = rel => readFileSync(join(ROOT, rel), 'utf8');
const digest = obj => sha256(JSON.stringify(obj));

const tplSrc = read('assets/data/sitetemplates.js');
const worldSrc = read('src/engine/worldsites.js');
const glSrc = read('src/engine/gl.js');
const ctx = loadSiteTemplates(tplSrc);
const maps = parseMapDefs(glSrc);
const ids = Object.keys(ctx.SITE_TPL);
const FAIL = [];
const note = [];
const ORDINARY_CITY = ['BRUTALIST PREFECTURE', 'WALLED TOWN'];
const CLASSES = ['city', 'outpost', 'relic', 'spaceport', 'dome'];

function setContext(loc, force) {
  ctx.SITE_TPL_QUERY.context = loc ? { ...loc } : null;
  ctx.SITE_TPL_QUERY.force = force || null;
  ctx.SITE_TPL_FORCE = force || null;
  if (typeof ctx.siteTplTelemReset === 'function') ctx.siteTplTelemReset();
}

function pickPool(cls, loc, n = 16) {
  setContext(loc);
  const names = [];
  const picks = [];
  for (let i = 0; i < n; i++) {
    let consumed = 0;
    const T = ctx.siteTemplateFor(cls, () => { consumed++; return (i + 0.5) / n; });
    names.push(T ? T.name : null);
    picks.push({ i, id: T ? T.id || Object.keys(ctx.SITE_TPL).find(k => ctx.SITE_TPL[k] === T) : null, consumed });
  }
  const telem = JSON.parse(JSON.stringify(ctx.SITE_TPL_QUERY.telem));
  const pool = ctx.siteTemplatePool(cls, loc);
  setContext(null);
  return { names, unique: [...new Set(names)], picks, telem, pool };
}

function once(cls, loc) {
  setContext(loc);
  let consumed = 0;
  const T = ctx.siteTemplateFor(cls, () => { consumed++; return 0.5; });
  const telem = JSON.parse(JSON.stringify(ctx.SITE_TPL_QUERY.telem));
  const pool = ctx.siteTemplatePool(cls, loc);
  setContext(null);
  return { T, consumed, telem, pool, name: T ? T.name : null, id: T ? T.id : null };
}

function loc(partial) {
  return {
    map: partial.map || 'fixture',
    planet: partial.planet || null,
    climate: partial.climate || null,
    biome: partial.biome || partial.climate || null,
    faction: partial.faction || null,
    purpose: partial.purpose || null,
    era: partial.era || null,
    condition: partial.condition || null,
    water: partial.water || null,
    theme: partial.theme || null
  };
}

if (ids.length !== 8) FAIL.push(`expected 8 SITE_TPL entries, got ${ids.length}`);
if (/if\(!ids\.length\) for\(const id in SITE_TPL\)/.test(tplSrc))
  FAIL.push('generic class-pool remainder is still present');
if (/climate==='hive'&&c==='dusk'/.test(tplSrc) || /climate==='ice'&&c==='alpine'/.test(tplSrc))
  FAIL.push('implicit hive/dusk or ice/alpine climate aliases are still present');
if (!ctx.SITE_TPL_RULES || !Array.isArray(ctx.SITE_TPL_RULES.fields))
  FAIL.push('SITE_TPL_RULES is missing');
if (ctx.SITE_TPL_RULES && ctx.SITE_TPL_RULES.aliases && Object.keys(ctx.SITE_TPL_RULES.aliases).length)
  FAIL.push('SITE_TPL_RULES.aliases is not empty — implicit climate aliases returned');
if (!worldSrc.includes('TEMPLATE_MISSING') || !worldSrc.includes('INCOMPATIBLE')
  || !worldSrc.includes('ENVIRONMENTAL_EXHAUSTION') || !worldSrc.includes('REQUIRED_PLOT_ROLLBACK'))
  FAIL.push('worldsites.js is missing typed SITE_STAMP fail codes');
if (!worldSrc.includes('siteTplTelemReset') || !worldSrc.includes('SITE_STAMP.telem'))
  FAIL.push('worldsites.js does not reset/copy SITE_TPL_QUERY telemetry around planDistricts');

const civicAelos = loc({ map: 'aelos_north_medium', planet: 'aelos', climate: 'civic', faction: 'nova' });
const duskPyraeth = loc({ map: 'pyraeth_crater_small', planet: 'pyraeth', climate: 'dusk', faction: 'legion' });

const civicCity = pickPool('city', civicAelos);
const civicCity2 = pickPool('city', civicAelos);
if (digest(civicCity.names) !== digest(civicCity2.names))
  FAIL.push('civic Aelos city pool is not deterministic');
if (!civicCity.unique.includes('BRUTALIST PREFECTURE'))
  FAIL.push(`civic Aelos city pool missing prefecture: ${civicCity.unique.join(',')}`);
if (civicCity.unique.includes('WALLED TOWN'))
  FAIL.push('civic Aelos city pool leaked dusk walled town');
if (civicCity.unique.length !== 1)
  FAIL.push(`civic Aelos city pool is not a singleton: ${civicCity.unique.join(',')}`);
if (civicCity.picks.some(p => p.consumed !== 1))
  FAIL.push('compatible civic city selector skipped pick()');

const duskDome = pickPool('dome', duskPyraeth);
const duskDome2 = pickPool('dome', duskPyraeth);
if (digest(duskDome.names) !== digest(duskDome2.names))
  FAIL.push('dusk Pyraeth dome pool is not deterministic');
if (!duskDome.unique.includes('PRESSURE DOME COURT'))
  FAIL.push(`dusk Pyraeth dome pool missing court: ${duskDome.unique.join(',')}`);
if (duskDome.unique.length !== 1)
  FAIL.push(`dusk Pyraeth dome pool is not a singleton: ${duskDome.unique.join(',')}`);

const incompatibleFixtures = [
  { id: 'volcanic-city', cls: 'city', loc: loc({ planet: 'vespera', climate: 'volcanic', faction: 'horde', theme: 'ashland' }) },
  { id: 'glacial-city', cls: 'city', loc: loc({ planet: 'nordhall', climate: 'ice', faction: 'syndicate', theme: 'arctic' }) },
  { id: 'desert-city', cls: 'city', loc: loc({ planet: 'pyraeth', climate: 'desert', faction: 'legion', theme: 'ashland' }) },
  { id: 'jungle-city', cls: 'city', loc: loc({ planet: 'vespera', climate: 'jungle', faction: 'horde', theme: 'verdant' }) },
  { id: 'oceanic-city', cls: 'city', loc: loc({ planet: 'aelos', climate: 'oceanic', faction: 'nova', water: 'ocean' }) },
  { id: 'brood-infestation-city', cls: 'city', loc: loc({ planet: 'vespera', climate: 'hive', faction: 'horde', condition: 'infested' }) }
];

const fixtureRows = [];
for (const F of incompatibleFixtures) {
  const row = once(F.cls, F.loc);
  const names = pickPool(F.cls, F.loc).unique;
  const reason = row.telem.reason[F.cls];
  const leaked = names.filter(n => n && ORDINARY_CITY.includes(n));
  if (row.T) FAIL.push(`${F.id} resolved ${row.name} instead of failing closed`);
  if (row.consumed !== 0) FAIL.push(`${F.id} consumed pick() on an empty compatible pool`);
  if (reason !== 'INCOMPATIBLE') FAIL.push(`${F.id} telem reason was ${reason || '(empty)'}, expected INCOMPATIBLE`);
  if (leaked.length) FAIL.push(`${F.id} leaked ordinary city ${leaked.join(',')}`);
  if (row.telem.miss[F.cls] < 1) FAIL.push(`${F.id} did not increment miss telemetry`);
  if (row.pool.exists !== true) FAIL.push(`${F.id} should be INCOMPATIBLE (class exists) not TEMPLATE_MISSING`);
  fixtureRows.push({
    id: F.id, class: F.cls, resolved: row.name, consumed: row.consumed,
    reason, mismatch: row.pool.mismatch, unique: names
  });
}

const missingClass = once('fortress', civicAelos);
if (missingClass.T) FAIL.push('unknown class fortress resolved a template');
if (missingClass.telem.reason.fortress !== 'TEMPLATE_MISSING')
  FAIL.push(`unknown class reason was ${missingClass.telem.reason.fortress}, expected TEMPLATE_MISSING`);
if (missingClass.consumed !== 0) FAIL.push('TEMPLATE_MISSING consumed pick()');

ctx.SITE_TPL_QUERY.force = 'city_brutalist_grid';
ctx.SITE_TPL_QUERY.context = civicAelos;
const forced = ctx.siteTemplateFor('city', () => 0);
const forcedOutpost = ctx.siteTemplateFor('outpost', () => 0);
ctx.SITE_TPL_QUERY.context = loc({ planet: 'vespera', climate: 'hive', faction: 'horde', condition: 'infested' });
const forcedHive = ctx.siteTemplateFor('city', () => 0);
ctx.SITE_TPL_QUERY.force = null;
ctx.SITE_TPL_QUERY.context = null;
if (!forced || forced.name !== 'BRUTALIST PREFECTURE')
  FAIL.push(`SITE_TPL_FORCE pin failed: ${forced && forced.name}`);
if (!forcedOutpost)
  FAIL.push('SITE_TPL_FORCE still returns null for other classes (silent outpost drop)');
if (!forcedHive || forcedHive.name !== 'BRUTALIST PREFECTURE')
  FAIL.push(`SITE_TPL_FORCE pin failed under an incompatible context: ${forcedHive && forcedHive.name}`);

const currentTyped = [];
for (const map of maps) {
  const locMap = mapTemplateContext(map);
  for (const cls of CLASSES) {
    const requested = map[classRequestKey(cls)] | 0;
    if (!requested) continue;
    const pool = ctx.siteTemplatePool(cls, locMap);
    const reason = !pool.ids.length ? (pool.exists ? 'INCOMPATIBLE' : 'TEMPLATE_MISSING') : 'ok';
    const row = {
      map: map.id, class: cls, requested, climate: map.climate, planet: map.planet,
      faction: map.faction, condition: map.condition, pool: pool.ids, reason,
      mismatch: pool.mismatch
    };
    if (reason !== 'ok') currentTyped.push(row);
  }
}

const repeatTyped = [];
for (const map of maps) {
  const locMap = mapTemplateContext(map);
  for (const cls of CLASSES) {
    const requested = map[classRequestKey(cls)] | 0;
    if (!requested) continue;
    const pool = ctx.siteTemplatePool(cls, locMap);
    if (!pool.ids.length) repeatTyped.push(`${map.id}:${cls}:${pool.exists ? 'INCOMPATIBLE' : 'TEMPLATE_MISSING'}`);
  }
}
if (digest(currentTyped.map(r => `${r.map}:${r.class}:${r.reason}`)) !== digest(repeatTyped))
  FAIL.push('current-map typed-missing inventory is not deterministic');

const civicMaps = maps.filter(m => m.id === 'aelos_north_medium' || m.id === 'aelos_basin_medium');
for (const map of civicMaps) {
  const pool = ctx.siteTemplatePool('city', mapTemplateContext(map));
  if (pool.ids.join(',') !== 'city_brutalist_grid')
    FAIL.push(`${map.id} civic city pool drifted: ${pool.ids.join(',')}`);
}
const pyraethMaps = maps.filter(m => m.id === 'pyraeth_crater_small' || m.id === 'pyraeth_caldera_medium');
for (const map of pyraethMaps) {
  const pool = ctx.siteTemplatePool('dome', mapTemplateContext(map));
  if (pool.ids.join(',') !== 'dome_cluster')
    FAIL.push(`${map.id} dusk dome pool drifted: ${pool.ids.join(',')}`);
}

const ridge = maps.find(m => m.id === 'aelos_ridge_medium');
if (ridge) {
  const cityPool = ctx.siteTemplatePool('city', mapTemplateContext(ridge));
  if (cityPool.ids.length)
    FAIL.push(`aelos_ridge_medium city still resolves ${cityPool.ids.join(',')} — alpine must not receive an ordinary city`);
}

const report = {
  schema: 'MassfrontSiteTemplateCompatProbeV1',
  generatedAt: new Date().toISOString(),
  status: FAIL.length ? 'FAIL' : 'PASS',
  sourceHashes: {
    sitetemplates: sha256(tplSrc),
    worldsites: sha256(worldSrc),
    stampGeometry: sha256(read('tools/mapgen/stamp-geometry.mjs')),
    siteMaps: sha256(read('tools/mapgen/site-maps.mjs'))
  },
  civicAelosCity: civicCity.unique,
  duskPyraethDome: duskDome.unique,
  fixtures: fixtureRows,
  templateMissing: {
    class: 'fortress',
    reason: missingClass.telem.reason.fortress,
    consumed: missingClass.consumed
  },
  currentlyRequestedTypedMissing: currentTyped,
  authoredGap: currentTyped.map(r => ({
    map: r.map, class: r.class, climate: r.climate, planet: r.planet,
    faction: r.faction, condition: r.condition, reason: r.reason,
    mismatch: r.mismatch, needs: `authored ${r.class} template for ${r.planet}/${r.climate}${r.condition ? '/' + r.condition : ''}`
  })),
  fails: FAIL, notes: note
};

writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(`${report.status} site-template compatibility`);
console.log(`civic city ${civicCity.unique.join(',') || '(empty)'}  dusk dome ${duskDome.unique.join(',') || '(empty)'}`);
console.log(`typed missing map/class pairs ${currentTyped.length}`);
for (const row of currentTyped)
  console.log(`  ${row.reason.padEnd(18)} ${row.map} ${row.class}  climate=${row.climate} planet=${row.planet}${row.condition ? ' condition=' + row.condition : ''}  mismatch=${(row.mismatch || []).join(',')}`);
if (FAIL.length) console.log(FAIL.map(x => 'FAIL  ' + x).join('\n'));
console.log(`report ${join(OUT, 'report.json')}`);
process.exitCode = FAIL.length ? 1 : 0;
