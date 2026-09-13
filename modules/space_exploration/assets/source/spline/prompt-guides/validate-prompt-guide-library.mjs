import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

function fail(message) {
  throw new Error(message);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function readJson(file) {
  assert(fs.existsSync(file), `Missing JSON: ${file}`);
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function readText(file) {
  assert(fs.existsSync(file), `Missing guide: ${file}`);
  return fs.readFileSync(file, 'utf8');
}

function exactSet(actual, expected, label) {
  const a = [...new Set(actual)].sort();
  const e = [...new Set(expected)].sort();
  assert(a.length === actual.length, `${label} contains duplicates.`);
  assert(JSON.stringify(a) === JSON.stringify(e), `${label} mismatch.\nactual=${a.join(',')}\nexpected=${e.join(',')}`);
}

function sum(items, selector) {
  return items.reduce((total, item) => total + selector(item), 0);
}

function requireTerms(text, terms, label) {
  for (const term of terms) {
    const ok = term instanceof RegExp ? term.test(text) : text.includes(term);
    assert(ok, `${label} is missing required term ${String(term)}.`);
  }
}

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function normalizedLabel(value) {
  return value.normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

const libraryPath = path.join(here, 'prompt-guide-library.json');
const library = readJson(libraryPath);
assert(library.status === 'SOURCE_PROMPTS_ONLY' && library.runtimeReady === false, 'Prompt library must remain source-only and runtimeReady:false.');
assert(library.summary?.promptCount === 340, 'Combined prompt count must be 340.');
assert(library.summary?.promptDocumentCount === 56, 'Combined prompt document count must be 56.');
exactSet(library.sets.map(entry => entry.id), ['galactic_sites', 'planet_location_sets', 'nexus_vii_districts', 'planet_expansion_32'], 'Top-level prompt sets');
for (const set of library.sets) {
  assert(set.runtimeReady === false, `${set.id} must remain runtimeReady:false.`);
  assert(fs.existsSync(path.resolve(here, set.index)), `${set.id} index is missing.`);
}

const sharedContract = readText(path.join(here, library.sharedContract));
requireTerms(sharedContract, [
  '1 Spline unit = 1 meter',
  '2048 x 2048',
  'UV0',
  'Collision',
  'LOD0',
  'Missing evidence is `UNKNOWN` or failure',
  /do not copy|never copy/i
], 'Shared prompt contract');

const groundManifestPath = path.resolve(here, '../ground-sites/ground-site-authoring-manifest.json');
const groundManifest = readJson(groundManifestPath);
const nexusManifestPath = path.resolve(here, '../../uga/interior-library/nexus-vii-material-decal-manifest.json');
const nexusManifest = readJson(nexusManifestPath);

// Nine Galactic sites.
const galacticDir = path.join(here, 'galactic-sites');
const galacticIndex = readJson(path.join(galacticDir, 'index.json'));
assert(galacticIndex.status === 'source_prompt_only' && galacticIndex.runtimeReady === false, 'Galactic guide index must remain source-only.');
assert(galacticIndex.guides.length === 9, 'Expected nine Galactic site guides.');
exactSet(galacticIndex.guides.map(entry => entry.siteId), groundManifest.sites.map(site => site.siteId), 'Galactic site guide IDs');
for (const guide of galacticIndex.guides) {
  const source = groundManifest.sites.find(site => site.siteId === guide.siteId);
  assert(source && guide.mapAssetId === source.mapAssetId, `${guide.siteId} mapAssetId drifted from the authoring manifest.`);
  assert(guide.status === 'source_prompt_only' && guide.runtimeReady === false, `${guide.siteId} must remain source-only.`);
  assert(fs.existsSync(path.resolve(galacticDir, guide.sourceBrief)), `${guide.siteId} source brief is missing.`);
  if (guide.concept) assert(fs.existsSync(path.resolve(galacticDir, guide.concept)), `${guide.siteId} concept is missing.`);
  const file = path.join(galacticDir, guide.promptGuide);
  const text = readText(file);
  requireTerms(text, [
    guide.siteId,
    guide.mapAssetId,
    '## Paste-ready art-direction prompt',
    '## Spline execution sequence',
    '## Acceptance checks',
    '## Original-work boundary',
    /2048/,
    /UV0/,
    /collision/i,
    /LOD/,
    /runtime/i
  ], `Galactic guide ${guide.siteId}`);
}

// Existing 32 location presets on the four current homeworlds.
const presetDir = path.join(here, 'planet-location-sets');
const presetIndex = readJson(path.join(presetDir, 'index.json'));
assert(presetIndex.status === 'SOURCE_AUTHORING_PROMPTS_ONLY' && presetIndex.runtimeReady === false, 'Base preset guide index must remain source-only.');
assert(presetIndex.guides.length === 4 && presetIndex.presets.length === 32, 'Expected four planet documents and 32 base preset prompts.');
exactSet(presetIndex.presets.map(entry => entry.id), groundManifest.baseGamePresetLibrary.presets.map(entry => entry.id), 'Base preset guide IDs');
for (const preset of presetIndex.presets) {
  const source = groundManifest.baseGamePresetLibrary.presets.find(entry => entry.id === preset.id);
  assert(source, `Unknown base preset ${preset.id}.`);
  assert(preset.planetId === source.planetId && preset.regionId === source.regionId && preset.locationClass === source.locationClass, `${preset.id} identity drifted.`);
  assert(preset.models === source.counts.models && preset.pbrFamilies2k === source.counts.pbrFamilies2k && preset.decalEntries === source.counts.decalEntries, `${preset.id} asset counts drifted.`);
  const text = readText(path.join(presetDir, preset.file));
  requireTerms(text, [preset.id, '2048', 'UV0', /collision/i, /LOD/, /412 x 915/, /Do not copy|never copy/i], `Base preset ${preset.id}`);
}
assert(sum(presetIndex.presets, entry => entry.models) === 220, 'Base preset model-family total must be 220.');
assert(sum(presetIndex.presets, entry => entry.pbrFamilies2k) === 64, 'Base preset 2K PBR total must be 64.');
assert(sum(presetIndex.presets, entry => entry.decalEntries) === 384, 'Base preset decal total must be 384.');

// Eleven NEXUS-VII districts.
const nexusDir = path.join(here, 'nexus-vii-districts');
const nexusIndex = readJson(path.join(nexusDir, 'index.json'));
assert(nexusIndex.status === 'source_only_authoring_guides' && nexusIndex.runtimeBound === false, 'NEXUS prompt guides must remain source-only and unbound.');
assert(nexusIndex.districtCount === 11 && nexusIndex.guides.length === 11, 'Expected eleven NEXUS district guides.');
exactSet(nexusIndex.guides.map(entry => entry.districtId), nexusManifest.districts.map(entry => entry.id), 'NEXUS district IDs');
for (const guide of nexusIndex.guides) {
  const district = nexusManifest.districts.find(entry => entry.id === guide.districtId);
  exactSet(guide.activeMaterialIds, district.materialIds, `${guide.districtId} material IDs`);
  exactSet(guide.activeTrimIds, district.trimIds, `${guide.districtId} trim IDs`);
  exactSet(guide.activeAtlasIds, [...district.requiredAtlasIds, ...district.conditionalAtlasIds], `${guide.districtId} atlas IDs`);
  exactSet(guide.facilityIds, [...district.moduleMarks, ...district.facilityMarks].map(entry => entry.id), `${guide.districtId} facility IDs`);
  const text = readText(path.join(nexusDir, guide.file));
  requireTerms(text, [
    guide.districtId,
    'source-only',
    'Spline',
    'UV0',
    /collision/i,
    /LOD/,
    /uga-hull/,
    /generic cubes/,
    /phone/i
  ], `NEXUS guide ${guide.districtId}`);
  for (const id of [...guide.activeMaterialIds, ...guide.activeTrimIds, ...guide.activeAtlasIds, ...guide.facilityIds]) {
    assert(text.includes(id), `${guide.districtId} guide does not mention required ID ${id}.`);
  }
}

// Expanded 32-planet / 256-location library.
const planetDir = path.join(here, 'planet-expansion-32');
const planetIndex = readJson(path.join(planetDir, 'index.json'));
assert(planetIndex.status === 'SOURCE_AUTHORING_PROMPTS_ONLY' && planetIndex.runtimeReady === false, '32-planet library must remain source-only.');
assert(planetIndex.summary.planetCount === 32 && planetIndex.summary.locationPromptCount === 256 && planetIndex.summary.totalPromptCount === 288, '32-planet summary counts are invalid.');
const locationClasses = planetIndex.summary.locationClasses;
assert(locationClasses.length === 8, 'Expected eight location classes.');
const planetReadme = readText(path.join(planetDir, 'README.md'));

const groupIndexes = planetIndex.groupIndexes.map(file => readJson(path.join(planetDir, file)));
const planets = groupIndexes.flatMap(group => group.planets);
assert(planets.length === 32, 'Group indexes must contain exactly 32 planets.');
exactSet(planets.map(entry => entry.order), Array.from({ length: 32 }, (_, index) => index + 1), 'Planet ordinals');
const sectorPlanetIds = planetIndex.sectors.flatMap(sector => sector.planetIds);
assert(planetIndex.sectors.length === 8 && planetIndex.sectors.every(sector => sector.planetIds.length === 4), 'Expected eight four-planet sectors.');
exactSet(planets.map(entry => entry.planetId), sectorPlanetIds, '32-planet sector membership');
exactSet(planets.filter(entry => entry.runtimeCanon).map(entry => entry.planetId), planetIndex.existingCanonPlanetIds, 'Runtime-canon planet IDs');
exactSet(planets.filter(entry => !entry.runtimeCanon).map(entry => entry.planetId), planetIndex.expansionProposalPlanetIds, 'Expansion planet IDs');

const planetFiles = fs.readdirSync(planetDir).filter(file => file.endsWith('.prompt.md'));
assert(planetFiles.length === 32, `Expected 32 planet prompt documents; found ${planetFiles.length}.`);

const siteIds = [];
for (const planet of planets) {
  assert(planet.runtimeReady === false && planet.promptCount === 9, `${planet.planetId} must declare nine source-only prompts.`);
  assert(planet.sites.length === 8, `${planet.planetId} must contain eight locations.`);
  exactSet(planet.sites.map(site => site.locationClass), locationClasses, `${planet.planetId} location classes`);
  const text = readText(path.join(planetDir, planet.file));
  requireTerms(planetReadme, [planet.planetId, planet.displayName, planet.file], `32-planet catalog entry ${planet.planetId}`);
  requireTerms(text, [
    planet.planetId,
    new RegExp(`PLANET_${planet.planetId.toUpperCase()}`),
    /orbital|war-table/i,
    /2048/,
    /UV0/,
    /collision/i,
    /LOD/,
    /runtimeReady/i,
    /phone/i,
    /Do not copy|never copy|Do not trace|never trace|copy no |no copied|no protected/i
  ], `Planet guide ${planet.planetId}`);
  for (const site of planet.sites) {
    siteIds.push(site.siteId);
    requireTerms(text, [site.siteId, site.locationClass], `${planet.planetId} location ${site.siteId}`);
    assert(normalizedLabel(text).includes(normalizedLabel(site.siteName)), `${planet.planetId} guide is missing the indexed display name ${site.siteName}.`);
    requireTerms(planetReadme, [site.siteId, site.siteName], `32-planet catalog location ${site.siteId}`);
  }
}
exactSet(siteIds, siteIds, 'Expanded location IDs');
assert(siteIds.length === 256, 'Expected 256 expanded location IDs.');
const galacticSiteIds = new Set(groundManifest.sites.map(site => site.siteId));
for (const id of siteIds) assert(!galacticSiteIds.has(id), `Expanded location ID collides with a Galactic mission site: ${id}`);

for (const canonId of planetIndex.existingCanonPlanetIds) {
  const canonSites = planets.find(entry => entry.planetId === canonId).sites.map(site => site.siteId);
  const sourceSites = groundManifest.baseGamePresetLibrary.presets.filter(entry => entry.planetId === canonId).map(entry => entry.id);
  exactSet(canonSites, sourceSites, `${canonId} canonical location IDs`);
}

const promptDocumentCount = galacticIndex.guides.length + presetIndex.guides.length + nexusIndex.guides.length + planetFiles.length;
assert(promptDocumentCount === library.summary.promptDocumentCount, 'Top-level prompt document count is inconsistent.');

console.log('PASS MASSFRONT Spline prompt-guide library');
console.log(`  Prompt blocks: ${library.summary.promptCount}`);
console.log(`  Documents: ${promptDocumentCount}`);
console.log(`  Galactic / base presets / NEXUS: ${galacticIndex.guides.length}/${presetIndex.presets.length}/${nexusIndex.guides.length}`);
console.log(`  Expanded planets / locations / orbital+location prompts: ${planets.length}/${siteIds.length}/${planetIndex.summary.totalPromptCount}`);
console.log(`  Library SHA-256: ${sha256(libraryPath)}`);
