#!/usr/bin/env node
/* Deterministic Stage 9A location-grammar gate.

   This verifier executes only the MAPDEFS / PLANETS / BIOME_KITS declarations
   from gl.js plus the classic locationgrammar.js script. It proves the V1
   context contract without booting the renderer or pretending the remaining
   site catalog and planner integration are complete.

     node tools/verify-stage9-location-grammar.mjs

   The report is byte-stable for unchanged inputs and source-bound beneath
   .tmp so it cannot be mistaken for a release artifact. */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const SELF = fileURLToPath(import.meta.url);
const ROOT = resolve(dirname(SELF), '..');
const OUT = join(ROOT, '.tmp', 'stage9-location-grammar');
const GL_PATH = join(ROOT, 'src', 'engine', 'gl.js');
const TEMPLATE_PATH = join(ROOT, 'assets', 'data', 'sitetemplates.js');
const GRAMMAR_PATH = join(ROOT, 'assets', 'data', 'locationgrammar.js');
const glSource = readFileSync(GL_PATH, 'utf8');
const templateSource = readFileSync(TEMPLATE_PATH, 'utf8');
const grammarSource = readFileSync(GRAMMAR_PATH, 'utf8');
const verifierSource = readFileSync(SELF, 'utf8');
const manifestSource = readFileSync(join(ROOT, 'assets', 'data', 'manifest.json'), 'utf8');
const bootSource = readFileSync(join(ROOT, 'boot.js'), 'utf8');
const indexSource = readFileSync(join(ROOT, 'index.html'), 'utf8');
const failures = [];

const sha256 = value => createHash('sha256').update(value).digest('hex');
const clone = value => JSON.parse(JSON.stringify(value));
const stableValue = value => {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== 'object') return value;
  const out = {};
  for (const key of Object.keys(value).sort()) out[key] = stableValue(value[key]);
  return out;
};
const stableStringify = value => JSON.stringify(stableValue(value));
const sameList = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const check = (condition, message) => { if (!condition) failures.push(message); };
const errorCode = result => result && (result.code || (result.error && result.error.code)) || '';

function sourceSlice(startMarker, endMarker) {
  const start = glSource.indexOf(startMarker);
  const end = glSource.indexOf(endMarker, start);
  if (start < 0 || end < 0 || end <= start)
    throw new Error(`gl.js dataset marker missing: ${startMarker} -> ${endMarker}`);
  return glSource.slice(start, end);
}

/* Keep engine execution out of this gate. These three declarations are pure
   catalog data; everything before/after them owns WebGL or mutable runtime
   state and does not belong in a deterministic grammar check. */
const catalogSource = [
  sourceSlice('const MAPDEFS=', '/* Default must'),
  sourceSlice('const PLANETS=', '/* Per-region biodome kits.'),
  sourceSlice('const BIOME_KITS=', 'function biomeKit(')
].join('\n');

const context = { Math };
vm.createContext(context);
vm.runInContext(`${catalogSource}\n${grammarSource}\n${templateSource}\nthis.__stage9Grammar={
  MAPDEFS,PLANETS,BIOME_KITS,
  WorldLocationStyleV1,LocationGrammarV1,PlanetAdaptationV1,
  FactionOccupationV1,ConditionVariantV1,
  mfResolveWorldLocationStyleV1,mfValidateWorldLocationStyleV1,mfLocationGrammarHashV1,
  mfLocationGrammarActivationV1,SITE_TPL,SITE_TPL_QUERY,
  siteTplTelemReset,siteTemplatePool,siteTemplateFor
};`, context, { filename: 'stage9-location-grammar.vm.js' });

const api = context.__stage9Grammar;
const MAPDEFS = api.MAPDEFS;
const PLANETS = api.PLANETS;
const BIOME_KITS = api.BIOME_KITS;
const resolveStyle = api.mfResolveWorldLocationStyleV1;
const validateStyle = api.mfValidateWorldLocationStyleV1;
const contractNames = [
  'WorldLocationStyleV1',
  'LocationGrammarV1',
  'PlanetAdaptationV1',
  'FactionOccupationV1',
  'ConditionVariantV1'
];

for (const name of contractNames) {
  const contract = api[name];
  check(!!contract && typeof contract === 'object', `${name} is missing`);
  if (!contract || typeof contract !== 'object') continue;
  check(contract.schema === name, `${name}.schema is ${contract.schema}, expected ${name}`);
  check(contract.version === 1, `${name}.version is ${contract.version}, expected 1`);
}
check(typeof resolveStyle === 'function', 'mfResolveWorldLocationStyleV1 is missing');
check(typeof validateStyle === 'function', 'mfValidateWorldLocationStyleV1 is missing');

const manifestOrder = JSON.parse(manifestSource).order || [];
const grammarEntry = 'assets/data/locationgrammar.js';
const templateEntry = 'assets/data/sitetemplates.js';
const worldsitesEntry = 'src/engine/worldsites.js';
check(manifestOrder.filter(x => x === grammarEntry).length === 1,
  'assets/data/manifest.json must register locationgrammar.js exactly once');
check(manifestOrder.indexOf(grammarEntry) < manifestOrder.indexOf(templateEntry)
  && manifestOrder.indexOf(templateEntry) < manifestOrder.indexOf(worldsitesEntry),
  'locationgrammar.js manifest order must be locationgrammar -> sitetemplates -> worldsites');
check((bootSource.match(/\.\/assets\/data\/locationgrammar\.js/g) || []).length === 1,
  'boot.js must register locationgrammar.js exactly once');
const packagedRev = bootSource.match(/var PACKAGED_REV='([^']+)'/);
const sourceRev = bootSource.match(/var PACKAGED_SRC_REV=PACKAGED_REV\+'-([^']+)'/);
check(!!packagedRev && !!sourceRev, 'boot.js packaged source revision is unreadable');
if (packagedRev && sourceRev)
  check(indexSource.includes(`./boot.js?v=${packagedRev[1]}-${sourceRev[1]}`),
    'index.html boot cache key does not match boot.js PACKAGED_SRC_REV');

const activationFixtures = [
  { map: 'aelos_north_medium', cls: 'city', template: 'city_brutalist_grid',
    purpose: 'prefecture', era: 'occupied', condition: 'intact' },
  { map: 'pyraeth_crater_small', cls: 'dome', template: 'dome_cluster',
    purpose: 'pressure-dome', era: 'occupied', condition: 'pressurized' }
];
const activationRows = [];
for (const fixture of activationFixtures) {
  const pool = api.siteTemplatePool(fixture.cls, { map: fixture.map });
  check(pool.ids.length === 1 && pool.ids[0] === fixture.template,
    `${fixture.map}/${fixture.cls} activation resolved ${pool.ids.join(',') || '(empty)'}`);
  check(pool.grammar && pool.grammar.version === 1 && /^[0-9a-f]{8}$/.test(pool.grammar.styleHash || ''),
    `${fixture.map}/${fixture.cls} activation has no V1 style hash`);
  const T = api.SITE_TPL[fixture.template];
  const A = api.mfLocationGrammarActivationV1(fixture.map, fixture.cls);
  for (const field of ['template', 'purpose', 'era', 'condition'])
    check(A && A[field] === fixture[field],
      `${fixture.map}/${fixture.cls} activation ${field} is ${A && A[field]}, expected ${fixture[field]}`);
  for (const field of ['purpose', 'era', 'condition'])
    check(T && T[field] === fixture[field],
      `${fixture.template} ${field} is ${T && T[field]}, expected ${fixture[field]}`);
  for (const field of ['planet', 'biome', 'faction', 'purpose', 'era', 'condition'])
    check(T && T[field] !== 'any' && T[field] != null && T[field] !== '',
      `${fixture.template} uses a generic ${field} in an activated V1 request`);
  activationRows.push({ ...fixture, ids: clone(pool.ids), styleHash: pool.grammar && pool.grammar.styleHash });
}

/* Prove an activated catalog drift fails before the selector consumes RNG.
   This mutates only the verifier VM and restores the field immediately. */
const driftTemplate = api.SITE_TPL.city_brutalist_grid;
for (const drift of [
  { field: 'planet', value: 'any' },
  { field: 'purpose', value: 'brood-site' },
  { field: 'era', value: 'conversion' },
  { field: 'condition', value: 'infested' }
]) {
  const prior = driftTemplate[drift.field];
  driftTemplate[drift.field] = drift.value;
  api.siteTplTelemReset();
  api.SITE_TPL_QUERY.context = { map: 'aelos_north_medium' };
  let picks = 0;
  const result = api.siteTemplateFor('city', () => { picks++; return 0; });
  const reason = api.SITE_TPL_QUERY.telem.reason.city;
  api.SITE_TPL_QUERY.context = null;
  driftTemplate[drift.field] = prior;
  check(result == null, `activated ${drift.field} drift did not fail closed`);
  check(picks === 0, `activated ${drift.field} drift consumed ${picks} RNG picks`);
  check(reason === 'INCOMPATIBLE',
    `activated ${drift.field} drift reason was ${reason || '(empty)'}, expected INCOMPATIBLE`);
}
const activeRow = api.LocationGrammarV1.activations.aelos_north_medium.city;
const activeTemplate = activeRow.template;
delete activeRow.template;
api.siteTplTelemReset();
api.SITE_TPL_QUERY.context = { map: 'aelos_north_medium' };
let malformedPicks = 0;
const malformedResult = api.siteTemplateFor('city', () => { malformedPicks++; return 0; });
const malformedReason = api.SITE_TPL_QUERY.telem.reason.city;
api.SITE_TPL_QUERY.context = null;
activeRow.template = activeTemplate;
check(malformedResult == null, 'malformed activation fell through to the legacy pool');
check(malformedPicks === 0, `malformed activation consumed ${malformedPicks} RNG picks`);
check(malformedReason === 'LOCATION_ACTIVATION_INVALID',
  `malformed activation reason was ${malformedReason || '(empty)'}, expected LOCATION_ACTIVATION_INVALID`);

const regionRows = api.LocationGrammarV1 && api.LocationGrammarV1.regions || {};
const expectedRegions = [];
const homeworldMaps = [];
for (const planet of Object.keys(PLANETS)) {
  const P = PLANETS[planet];
  for (const region of P.regions || []) {
    expectedRegions.push(region.id);
    for (const map of region.maps || []) homeworldMaps.push({ map, planet, region: region.id });
  }
}
const actualRegions = Object.keys(regionRows).sort();
expectedRegions.sort();
check(actualRegions.length === 16, `LocationGrammarV1 has ${actualRegions.length} region rows, expected 16`);
check(sameList(actualRegions, expectedRegions), 'LocationGrammarV1 region ids do not exactly match PLANETS');
check(homeworldMaps.length === 48, `PLANETS exposes ${homeworldMaps.length} canonical maps, expected 48`);

for (const region of expectedRegions) {
  const row = regionRows[region];
  const kit = BIOME_KITS[region];
  const planet = row && PLANETS[row.planet];
  if (!row) continue;
  check(!!kit, `${region} has no BIOME_KITS row`);
  check(!!planet, `${region} names unknown planet ${row.planet}`);
  check(!!row.geology, `${region} has no explicit geology`);
  check(!!row.adaptation, `${region} has no explicit adaptation`);
  if (kit) check(row.biome === kit.climate,
    `${region} biome ${row.biome} differs from BIOME_KITS climate ${kit.climate}`);
  if (planet) check(row.faction === planet.fac,
    `${region} faction ${row.faction} differs from PLANETS faction ${planet.fac}`);
}

const adaptationFamilies = ['temperate_civic', 'volcanic', 'glacial', 'desert', 'jungle_wetland', 'oceanic'];
const families = api.PlanetAdaptationV1 && api.PlanetAdaptationV1.families || {};
for (const id of adaptationFamilies) {
  const family = families[id];
  check(!!family, `PlanetAdaptationV1 family ${id} is missing`);
  if (!family) continue;
  check(Array.isArray(family.topology) && family.topology.length > 0, `${id} has no topology rules`);
  check(Array.isArray(family.geometry) && family.geometry.length > 0, `${id} has no geometry rules`);
}
for (const id of Object.keys(api.FactionOccupationV1.factions || {})) {
  const F = api.FactionOccupationV1.factions[id];
  check(F.id === id, `FactionOccupationV1 ${id} has id ${F.id}`);
  check(typeof F.mode === 'string' && F.mode.length > 0, `FactionOccupationV1 ${id} has no mode`);
  check(Array.isArray(F.topology) && F.topology.length > 0, `FactionOccupationV1 ${id} has no topology`);
  check(Array.isArray(F.geometry) && F.geometry.length > 0, `FactionOccupationV1 ${id} has no geometry`);
}
for (const id of Object.keys(api.ConditionVariantV1.variants || {})) {
  const V = api.ConditionVariantV1.variants[id];
  check(V.id === id, `ConditionVariantV1 ${id} has id ${V.id}`);
  check(Number.isInteger(V.order), `ConditionVariantV1 ${id} has invalid order ${V.order}`);
  check(Array.isArray(V.transforms) && V.transforms.length > 0, `ConditionVariantV1 ${id} has no transforms`);
}
const broodOverlay = api.PlanetAdaptationV1 && api.PlanetAdaptationV1.broodConversion;
check(!!broodOverlay, 'PlanetAdaptationV1 Brood overlay is missing');
if (broodOverlay) {
  check(sameList(clone(broodOverlay.stages || []), ['encroaching', 'infested', 'consumed']),
    'Brood conversion stages must be encroaching, infested, consumed');
  check(Array.isArray(broodOverlay.topology) && broodOverlay.topology.length > 0,
    'Brood conversion has no topology rules');
  check(Array.isArray(broodOverlay.geometry) && broodOverlay.geometry.length > 0,
    'Brood conversion has no geometry rules');
}

const tacticalScales = clone(api.WorldLocationStyleV1 && api.WorldLocationStyleV1.tacticalScales || []);
for (const scale of ['infantry', 'smallVehicle', 'mech'])
  check(tacticalScales.includes(scale), `WorldLocationStyleV1 tactical scales missing ${scale}`);

const requiredSiteClasses = clone(api.LocationGrammarV1 && api.LocationGrammarV1.requiredSiteClasses || []);
const stage9SiteClasses = ['city', 'colony', 'outpost', 'base', 'refinery', 'relic', 'ruin', 'spaceport', 'derelict', 'brood'];
for (const cls of stage9SiteClasses)
  check(requiredSiteClasses.includes(cls), `LocationGrammarV1 required-site declaration missing ${cls}`);

function requestFor(fixture) {
  const R = regionRows[fixture.region];
  const brood = R.faction === 'horde' || R.brood === true;
  return {
    planet: R.planet,
    biome: R.biome,
    region: fixture.region,
    geology: R.geology,
    faction: R.faction,
    purpose: brood ? 'brood-site' : 'military-base',
    era: brood ? 'conversion' : 'occupied',
    condition: brood ? 'infested' : 'operational'
  };
}

const resolutionRows = [];
const sweepFixtures = [];
for (const fixture of homeworldMaps) {
  const D = MAPDEFS[fixture.map];
  const R = regionRows[fixture.region];
  const request = requestFor(fixture);
  check(!!D, `${fixture.map} is absent from MAPDEFS`);
  if (D) check(D.region === fixture.region,
    `${fixture.map} MAPDEFS region ${D.region} differs from PLANETS region ${fixture.region}`);
  check(R.planet === fixture.planet,
    `${fixture.region} grammar planet ${R.planet} differs from PLANETS owner ${fixture.planet}`);

  const first = resolveStyle(fixture.map, request);
  const second = resolveStyle(fixture.map, request);
  const firstBytes = JSON.stringify(first);
  const secondBytes = JSON.stringify(second);
  check(firstBytes === secondBytes, `${fixture.map} repeated resolution is not byte-identical`);
  check(sha256(firstBytes) === sha256(secondBytes), `${fixture.map} repeated resolution hash drifted`);
  check(first && first.ok === true && first.value, `${fixture.map} failed resolution: ${errorCode(first) || 'no typed error'}`);
  if (!first || first.ok !== true || !first.value) continue;

  const V = first.value;
  const expected = { map: fixture.map, ...request };
  for (const key of ['map', 'planet', 'biome', 'region', 'geology', 'faction', 'purpose', 'era', 'condition'])
    check(V[key] === expected[key], `${fixture.map} ${key} resolved ${V[key]}, expected ${expected[key]}`);
  check(V.adaptation && V.adaptation.id === R.adaptation,
    `${fixture.map} adaptation resolved ${V.adaptation && V.adaptation.id}, expected ${R.adaptation}`);
  if (R.brood || R.faction === 'horde')
    check(!!(V.adaptation && V.adaptation.broodConversion), `${fixture.map} lost the Brood overlay`);
  else
    check(!(V.adaptation && V.adaptation.broodConversion), `${fixture.map} leaked the Brood overlay`);
  check(/^[0-9a-f]{8}$/.test(V.hash || ''), `${fixture.map} has invalid deterministic style hash ${V.hash}`);
  const validation = validateStyle(V);
  check(validation && validation.ok === true, `${fixture.map} resolved a style rejected by its validator`);

  resolutionRows.push({
    map: fixture.map,
    planet: V.planet,
    biome: V.biome,
    region: V.region,
    geology: V.geology,
    faction: V.faction,
    purpose: V.purpose,
    era: V.era,
    condition: V.condition,
    adaptation: V.adaptation.id,
    broodOverlay: !!V.adaptation.broodConversion,
    styleHash: V.hash,
    bytesHash: sha256(firstBytes)
  });
  sweepFixtures.push({ map: fixture.map, request });
}
check(resolutionRows.length === 48, `${resolutionRows.length}/48 canonical maps resolved successfully`);

const sweepA = sweepFixtures.map(F => resolveStyle(F.map, F.request));
const sweepB = sweepFixtures.map(F => resolveStyle(F.map, F.request));
const sweepABytes = JSON.stringify(sweepA);
const sweepBBytes = JSON.stringify(sweepB);
check(sweepABytes === sweepBBytes, 'full 48-map resolution sweep is not byte-identical');
const resolutionHash = sha256(sweepABytes);
check(resolutionHash === sha256(sweepBBytes), 'full 48-map resolution hash drifted');

const baseFixture = homeworldMaps.find(F => F.map === 'aelos_north_medium') || homeworldMaps[0];
const baseRequest = requestFor(baseFixture);
const baseResult = resolveStyle(baseFixture.map, baseRequest);
const omissions = [];
const invalidValues = [];
const nestedDrift = [];
if (!baseResult || baseResult.ok !== true || !baseResult.value) {
  failures.push('explicit omission fixture could not resolve');
} else {
  const requiredFields = clone(api.WorldLocationStyleV1.required || []);
  for (const field of requiredFields) {
    const candidate = clone(baseResult.value);
    delete candidate[field];
    const verdict = validateStyle(candidate);
    const code = errorCode(verdict);
    const missing = clone(verdict && verdict.error && verdict.error.missing || []);
    check(verdict && verdict.ok === false, `validator accepted explicit fixture without ${field}`);
    check(code === 'LOCATION_CONTEXT_INCOMPLETE',
      `validator missing ${field} returned ${code || '(empty)'}, expected LOCATION_CONTEXT_INCOMPLETE`);
    check(missing.includes(field), `validator missing ${field} did not identify that field`);
    omissions.push({ field, code, missing });
  }
  for (const field of ['purpose', 'era', 'condition']) {
    const request = clone(baseRequest);
    delete request[field];
    const verdict = resolveStyle(baseFixture.map, request);
    check(verdict && verdict.ok === false, `resolver accepted request without ${field}`);
    check(errorCode(verdict) === 'LOCATION_CONTEXT_INCOMPLETE',
      `resolver missing ${field} returned ${errorCode(verdict) || '(empty)'}`);
  }
  for (const mutation of [
    { field: 'planet', value: 'pyraeth' },
    { field: 'biome', value: 'hive' },
    { field: 'region', value: 'bogus-region' },
    { field: 'geology', value: 'bogus-geology' },
    { field: 'faction', value: 'horde' },
    { field: 'purpose', value: 'not-a-purpose' },
    { field: 'era', value: 'not-an-era' },
    { field: 'condition', value: 'not-a-condition' }
  ]) {
    const candidate = clone(baseResult.value);
    candidate[mutation.field] = mutation.value;
    candidate.hash = api.mfLocationGrammarHashV1(candidate);
    const verdict = validateStyle(candidate);
    check(verdict && verdict.ok === false, `validator accepted invalid ${mutation.field}`);
    invalidValues.push({ field: mutation.field, code: errorCode(verdict) });
  }
  for (const mutation of [
    { id: 'adaptation-topology', apply: V => { V.adaptation.topology = []; } },
    { id: 'occupation-geometry', apply: V => { V.occupation.geometry = []; } },
    { id: 'variant-transforms', apply: V => { V.variant.transforms = []; } }
  ]) {
    const candidate = clone(baseResult.value);
    const before = candidate.hash;
    mutation.apply(candidate);
    candidate.hash = api.mfLocationGrammarHashV1(candidate);
    const verdict = validateStyle(candidate);
    check(candidate.hash !== before, `${mutation.id} did not change the semantic style hash`);
    check(verdict && verdict.ok === false, `validator accepted ${mutation.id} drift`);
    nestedDrift.push({ id: mutation.id, code: errorCode(verdict), hashChanged: candidate.hash !== before });
  }
}

const broodFixture = homeworldMaps.find(F => F.map === 'vespera_refinery_medium');
if (broodFixture) {
  const broodResult = resolveStyle(broodFixture.map, requestFor(broodFixture));
  if (!broodResult || !broodResult.ok) failures.push('Brood nested-drift fixture could not resolve');
  else {
    const candidate = clone(broodResult.value);
    candidate.adaptation.broodConversion = null;
    candidate.hash = api.mfLocationGrammarHashV1(candidate);
    const verdict = validateStyle(candidate);
    check(verdict && verdict.ok === false, 'validator accepted a Brood style without conversion overlay');
    nestedDrift.push({ id: 'brood-conversion', code: errorCode(verdict) });
  }
}

const invasionStages = [];
for (const condition of ['encroaching', 'infested', 'consumed']) {
  const result = resolveStyle('aelos_north_medium', {
    planet: 'aelos', biome: 'civic', region: 'aelos_north',
    geology: 'metamorphic-civic-bedrock', faction: 'nova',
    purpose: 'city', era: 'conversion', condition
  });
  check(result && result.ok === true, `Aelos ${condition} conversion failed: ${errorCode(result) || '(empty)'}`);
  check(!!(result && result.value && result.value.adaptation.broodConversion),
    `Aelos ${condition} conversion has no Brood topology overlay`);
  check(result && result.value && result.value.occupation.id === 'nova',
    `Aelos ${condition} conversion lost the governed Nova occupation identity`);
  invasionStages.push({ condition, ok: !!(result && result.ok),
    overlay: !!(result && result.value && result.value.adaptation.broodConversion),
    hash: result && result.value && result.value.hash });
}

const invalidRequest = baseRequest;
const typedFailures = [];
for (const map of ['__unknown_stage9_map__', 'vanguard']) {
  const result = resolveStyle(map, invalidRequest);
  const code = errorCode(result);
  check(result && result.ok === false, `${map} unexpectedly resolved`);
  check(/^LOCATION_[A-Z_]+$/.test(code), `${map} returned no typed LOCATION_* failure: ${code || '(empty)'}`);
  check(!(result && result.value), `${map} returned a style value (possible Aelos default)`);
  typedFailures.push({ map, code, value: result && result.value || null });
}

const sourceHashes = {
  gl: sha256(glSource),
  siteTemplates: sha256(templateSource),
  locationGrammar: sha256(grammarSource),
  verifier: sha256(verifierSource),
  manifest: sha256(manifestSource),
  boot: sha256(bootSource),
  index: sha256(indexSource)
};
const report = {
  schema: 'MassfrontStage9LocationGrammarVerificationV1',
  version: 1,
  status: failures.length ? 'FAIL' : 'PASS',
  stageStatus: failures.length ? 'STAGE_9A_FAIL' : 'STAGE_9A_VERIFIED_STAGE_9_PENDING',
  sourceHashes,
  sourceBindingHash: sha256(stableStringify(sourceHashes)),
  catalogHash: sha256(stableStringify({ MAPDEFS: clone(MAPDEFS), PLANETS: clone(PLANETS), BIOME_KITS: clone(BIOME_KITS) })),
  contracts: contractNames.map(name => ({ name, schema: api[name] && api[name].schema, version: api[name] && api[name].version })),
  activations: activationRows,
  regionGrammar: { expected: 16, actual: actualRegions.length, ids: actualRegions },
  adaptations: {
    required: adaptationFamilies.concat('broodConversion'),
    baseFamilies: Object.keys(families).sort(),
    broodStages: clone(broodOverlay && broodOverlay.stages || [])
  },
  tacticalScales,
  canonicalMaps: { expected: 48, resolved: resolutionRows.length, resolutionHash, rows: resolutionRows },
  requiredFieldOmissions: omissions,
  invalidValues,
  nestedDrift,
  invasionStages,
  typedFailures,
  catalogPlannerCoverage: {
    status: 'PENDING',
    declaredSiteClasses: requiredSiteClasses,
    pending: [
      'dedicated authored coverage for every required location class',
      'planner integration that removes the generic procedural fallback',
      'runtime topology, traversal, and hardware-GPU visual acceptance'
    ]
  },
  failures
};
report.reportHash = sha256(stableStringify(report));

mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(`${report.status} Stage 9A location grammar`);
console.log(`contracts ${contractNames.length}/5  regions ${actualRegions.length}/16  maps ${resolutionRows.length}/48`);
console.log(`resolution ${resolutionHash}  report ${report.reportHash}`);
console.log('full Stage 9 catalog/planner/runtime coverage PENDING');
if (failures.length) console.log(failures.map(message => `FAIL  ${message}`).join('\n'));
console.log(`report ${join(OUT, 'report.json')}`);
process.exitCode = failures.length ? 1 : 0;
