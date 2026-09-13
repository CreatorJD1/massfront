import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const manifestPath = path.join(here, 'ground-site-authoring-manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sorted(values) {
  return [...values].sort();
}

function assertExactSet(actual, expected, label) {
  const a = sorted(new Set(actual));
  const e = sorted(new Set(expected));
  assert(JSON.stringify(a) === JSON.stringify(e), `${label}: expected ${e.join(', ')}, got ${a.join(', ')}`);
}

function assertCounts(actual, expected, label) {
  for (const key of ['models', 'pbrFamilies2k', 'decalEntries']) {
    assert(actual?.[key] === expected[key], `${label}.${key}: expected ${expected[key]}, got ${actual?.[key]}`);
  }
}

function sumCounts(entries, accessor = entry => entry.counts) {
  return entries.reduce((sum, entry) => {
    const counts = accessor(entry);
    sum.models += counts.models;
    sum.pbrFamilies2k += counts.pbrFamilies2k;
    sum.decalEntries += counts.decalEntries;
    return sum;
  }, { models: 0, pbrFamilies2k: 0, decalEntries: 0 });
}

const expectedSiteIds = [
  'aelos_caldris',
  'aelos_heliograph',
  'aelos_freeport',
  'veyra_orison',
  'veyra_lens',
  'veyra_ossuary',
  'karak_meridian',
  'karak_spine',
  'karak_hive'
];
assert(manifest.sites?.length === 9, 'The Galactic site pack must contain exactly nine sites.');
assertExactSet(manifest.sites.map(site => site.siteId), expectedSiteIds, 'Galactic site IDs');
for (const site of manifest.sites) {
  assert(fs.existsSync(path.join(here, site.brief)), `Missing site brief: ${site.brief}`);
  if (site.conceptArt?.path) {
    const conceptPath = path.resolve(here, site.conceptArt.path);
    assert(fs.existsSync(conceptPath), `Missing concept art for ${site.siteId}: ${site.conceptArt.path}`);
    if (site.conceptArt.sha256) {
      const digest = crypto.createHash('sha256').update(fs.readFileSync(conceptPath)).digest('hex');
      assert(digest === site.conceptArt.sha256, `Concept SHA-256 mismatch for ${site.siteId}.`);
    }
    assert(fs.existsSync(path.resolve(here, site.conceptArt.provenance)), `Missing concept provenance for ${site.siteId}.`);
    assert(site.conceptArt.status === 'available_needs_measurement_and_approval', `${site.siteId} concept must remain measurement/approval gated.`);
  }
}

assert(manifest.identityPolicy?.genericRecolorForbidden === true, 'The global generic-recolor prohibition must remain enabled.');
assert(manifest.locationPresets?.length === 14, 'The 14 Galactic-site location presets must be preserved.');
assert(manifest.scope?.siteCount === 9, 'Top-level scope must declare nine Galactic sites.');
assert(manifest.scope?.galacticSitePresetCount === 14, 'Top-level scope must declare 14 Galactic-site presets.');
assert(manifest.scope?.baseGamePlanetCount === 4, 'Top-level scope must declare four base-game planets.');
assert(manifest.scope?.baseGameRegionCount === 16, 'Top-level scope must declare 16 base-game regions.');
assert(manifest.scope?.baseGameLocationClassCount === 8, 'Top-level scope must declare eight base-game location classes.');
assert(manifest.scope?.baseGamePresetCount === 32, 'Top-level scope must declare 32 base-game presets.');

const expectedReferenceRoles = new Map([
  ['Command & Conquer 3: Tiberium Wars', ['industrial battlefield readability', 'destruction-state legibility', 'contamination storytelling']],
  ['Supreme Commander 2', ['combined-arms scale and separation', 'large-unit route readability', 'strategic landmark hierarchy']],
  ['XCOM 2', ['compact tactical interiors', 'compact tactical cover language', 'breach, objective, and extraction readability']],
  ['StarCraft II', ['biome readability', 'faction silhouette contrast', 'Brood and organic-infestation readability']]
]);
assert(manifest.referencePolicy?.classification === 'visual_language_only_not_asset_sources', 'Reference titles must remain visual-language-only.');
for (const [title, roles] of expectedReferenceRoles) {
  const reference = manifest.referencePolicy.references.find(entry => entry.title === title);
  assert(reference, `Missing reference-policy entry for ${title}.`);
  assertExactSet(reference.allowedStudy, roles, `${title} allowed-study roles`);
}

const library = manifest.baseGamePresetLibrary;
assert(library, 'Missing baseGamePresetLibrary.');
assert(library.status === 'AUTHORING_TARGETS_ONLY' && library.runtimeReady === false, 'Base-game presets must remain non-runtime authoring targets.');

const expectedPlanetIds = ['aelos', 'pyraeth', 'nordhall', 'vespera'];
const expectedClasses = [
  'outpost',
  'city_colony',
  'relic_ruin',
  'spaceport',
  'pressure_dome',
  'military_base',
  'refinery',
  'derelict_megastructure'
];
const expectedRegionsByPlanet = {
  aelos: ['aelos_north', 'aelos_basin', 'aelos_coast', 'aelos_ridge'],
  pyraeth: ['pyraeth_crater', 'pyraeth_belt', 'pyraeth_caldera', 'pyraeth_flats'],
  nordhall: ['nordhall_isles', 'nordhall_cliff', 'nordhall_frost', 'nordhall_peaks'],
  vespera: ['vespera_spire', 'vespera_dunes', 'vespera_refinery', 'vespera_plateau']
};
const expectedPresetIds = [
  'aelos_north_capital_ward',
  'aelos_north_circumference_bastion',
  'aelos_basin_heartland_refinery',
  'aelos_basin_greenbelt_outpost',
  'aelos_coast_admiralty_spaceport',
  'aelos_coast_pelagic_dome',
  'aelos_ridge_divide_relic',
  'aelos_ridge_shelf_megastructure',
  'pyraeth_crater_buried_court_dome',
  'pyraeth_crater_court_of_iron_ruin',
  'pyraeth_belt_promethean_base',
  'pyraeth_belt_iron_pyre_refinery',
  'pyraeth_caldera_ignis_arcology',
  'pyraeth_caldera_crucible_megastructure',
  'pyraeth_flats_hub_delta_spaceport',
  'pyraeth_flats_blackwind_outpost',
  'nordhall_isles_frostwake_spaceport',
  'nordhall_isles_core_vault_outpost',
  'nordhall_cliff_citadel_base',
  'nordhall_cliff_arcology_steps_colony',
  'nordhall_frost_pale_trench_refinery',
  'nordhall_frost_reactor_megastructure',
  'nordhall_peaks_skyshield_dome',
  'nordhall_peaks_valkyrie_relic',
  'vespera_spire_caldera_colony_shell',
  'vespera_spire_infested_pressure_dome',
  'vespera_dunes_tide_relay_outpost',
  'vespera_dunes_ichor_relic',
  'vespera_refinery_megaforge_refinery',
  'vespera_refinery_silent_megaforge',
  'vespera_plateau_quarantine_bastion',
  'vespera_plateau_evac_spaceport'
];

assert(library.scope?.planetCount === 4, 'Base-game preset scope must declare four planets.');
assert(library.scope?.regionCount === 16, 'Base-game preset scope must declare 16 regions.');
assert(library.scope?.locationClassCount === 8, 'Base-game preset scope must declare eight location classes.');
assert(library.scope?.presetCount === 32, 'Base-game preset scope must declare 32 presets.');
assertExactSet(library.locationClasses, expectedClasses, 'Location classes');
assertExactSet(library.planets.map(planet => planet.id), expectedPlanetIds, 'Planet IDs');
assert(library.regions?.length === 16, 'The region catalog must contain exactly 16 records.');
assert(library.presets?.length === 32, 'The base-game preset matrix must contain exactly 32 records.');
assertExactSet(library.presets.map(preset => preset.id), expectedPresetIds, 'Preset IDs');
assert(new Set(library.presets.map(preset => preset.id)).size === 32, 'Preset IDs must be unique.');

const allRegionIds = Object.values(expectedRegionsByPlanet).flat();
assertExactSet(library.regions.map(region => region.id), allRegionIds, 'Region IDs');
for (const planetId of expectedPlanetIds) {
  const planet = library.planets.find(entry => entry.id === planetId);
  assertExactSet(planet.regionIds, expectedRegionsByPlanet[planetId], `${planetId} region IDs`);
  const regions = library.regions.filter(region => region.planetId === planetId).map(region => region.id);
  assertExactSet(regions, expectedRegionsByPlanet[planetId], `${planetId} region records`);
  const planetPresets = library.presets.filter(preset => preset.planetId === planetId);
  assert(planetPresets.length === 8, `${planetId} must have exactly eight presets.`);
  assertExactSet(planetPresets.map(preset => preset.locationClass), expectedClasses, `${planetId} class coverage`);
}

for (const regionId of allRegionIds) {
  const regionPresets = library.presets.filter(preset => preset.regionId === regionId);
  assert(regionPresets.length === 2, `${regionId} must own exactly two presets.`);
  const region = library.regions.find(entry => entry.id === regionId);
  assert(regionPresets.every(preset => preset.planetId === region.planetId), `${regionId} contains a cross-planet preset.`);
}

const galacticPresetIds = new Set(manifest.locationPresets.map(preset => preset.id));
for (const preset of library.presets) {
  assert(!galacticPresetIds.has(preset.id), `Base-game preset ID collides with a Galactic preset: ${preset.id}`);
  assert(preset.status === 'brief_only', `${preset.id} must remain brief_only.`);
  assert(expectedClasses.includes(preset.locationClass), `${preset.id} has an unsupported location class.`);
  assert(expectedPlanetIds.includes(preset.planetId), `${preset.id} has an unsupported planet.`);
  assert(allRegionIds.includes(preset.regionId), `${preset.id} has an unsupported region.`);
  for (const [key, value] of Object.entries(preset.counts || {})) {
    assert(Number.isInteger(value) && value > 0, `${preset.id}.${key} must be a positive integer.`);
  }
  assert(preset.originality?.genericRecolorOnly === false, `${preset.id} cannot be a generic recolor-only preset.`);
  for (const key of ['uniqueGeometry', 'uniqueMaterialResponse', 'uniqueDecalLanguage']) {
    const value = preset.originality?.[key];
    assert(typeof value === 'string' && value.trim().length >= 24, `${preset.id} needs a substantive ${key} declaration.`);
    assert(!/^(recolor|palette swap)( only)?$/i.test(value.trim()), `${preset.id}.${key} is only a recolor claim.`);
  }
  if (preset.conceptReference) {
    const conceptPath = path.resolve(here, preset.conceptReference.path);
    const provenancePath = path.resolve(here, preset.conceptReference.provenance);
    assert(fs.existsSync(conceptPath), `Missing concept reference for ${preset.id}: ${preset.conceptReference.path}`);
    assert(fs.existsSync(provenancePath), `Missing concept provenance for ${preset.id}: ${preset.conceptReference.provenance}`);
    assert(preset.conceptReference.status === 'available_needs_measurement_and_approval', `${preset.id} concept must remain measurement/approval gated.`);
    assert(/^[a-f0-9]{64}$/.test(preset.conceptReference.sha256 || ''), `${preset.id} needs a lowercase SHA-256 concept hash.`);
    const digest = crypto.createHash('sha256').update(fs.readFileSync(conceptPath)).digest('hex');
    assert(digest === preset.conceptReference.sha256, `Concept SHA-256 mismatch for ${preset.id}.`);
  }
}

const expectedUniqueTotals = { models: 220, pbrFamilies2k: 64, decalEntries: 384 };
const expectedCompleteTotals = { models: 379, pbrFamilies2k: 113, decalEntries: 552 };
const expectedGlobalCore = { models: 31, pbrFamilies2k: 8, decalEntries: 24 };
const expectedClassKits = { models: 64, pbrFamilies2k: 9, decalEntries: 48 };
const expectedPlanetKits = { models: 64, pbrFamilies2k: 32, decalEntries: 96 };

const uniqueTotals = sumCounts(library.presets);
assertCounts(uniqueTotals, expectedUniqueTotals, 'Summed 32-preset totals');
assertCounts(library.exactTotals.thirtyTwoUniquePresets, expectedUniqueTotals, 'Declared 32-preset totals');
assertCounts(library.sharedFoundation.globalOutdoorCombinedArmsKit.counts, expectedGlobalCore, 'Global outdoor core');
assertCounts(library.sharedFoundation.eightLocationClassKits.counts, expectedClassKits, 'Eight class kits');
assertCounts(library.sharedFoundation.fourPlanetIdentityKits.counts, expectedPlanetKits, 'Four planet identity kits');
const planetKitTotals = sumCounts(library.planets, planet => planet.identityKitCounts);
assertCounts(planetKitTotals, expectedPlanetKits, 'Summed planet identity kits');

const completeTotals = {
  models: expectedGlobalCore.models + expectedClassKits.models + expectedPlanetKits.models + uniqueTotals.models,
  pbrFamilies2k: expectedGlobalCore.pbrFamilies2k + expectedClassKits.pbrFamilies2k + expectedPlanetKits.pbrFamilies2k + uniqueTotals.pbrFamilies2k,
  decalEntries: expectedGlobalCore.decalEntries + expectedClassKits.decalEntries + expectedPlanetKits.decalEntries + uniqueTotals.decalEntries
};
assertCounts(completeTotals, expectedCompleteTotals, 'Calculated complete-library totals');
assertCounts(library.exactTotals.completePlannedBaseLocationLibrary, expectedCompleteTotals, 'Declared complete-library totals');

const expectedSafeReuse = [
  'Hidden gameplay proxies, global lane dimensions, portal metadata schema, collision naming, generic bolts/cables/pipes, generic emergency fixtures, and portable UGA objective/deployment hardware.',
  'System-level structural grammar within Aelos, Veyra, or Karak.',
  "Planet-level weathering and terrain contact layers across that planet's regions.",
  'Class kits such as gantry mechanics or refinery valve logic when the silhouette/material skin remains world-specific.'
];
const expectedUniqueReuse = [
  'Every primary objective hero: caldris_customs_core, heliograph_control_spine, morrow_archive_stack, orison_memory_vault, lensing_calibration_core, ossuary_phase_engine, and the four Brood target families.',
  'Site skyline/plan silhouette, landing-zone geometry, damage route, faction/lore signage, story landmark, and objective-state animation.',
  'Ancient Veyra glyphs/phase materials, Aelos civic identity, Meridian civilian signage, and Karak living hive tissue.',
  'Brood biology cannot become a generic playable-faction building skin. Brood remains non-playable and non-humanoid.',
  'NEXUS-VII interior materials cannot be copied wholesale onto orbital sites, and exterior hull material cannot become a universal interior surface.'
];
assert(JSON.stringify(library.reuseBoundaries.safeToShare) === JSON.stringify(expectedSafeReuse), 'Safe reuse boundaries changed.');
assert(JSON.stringify(library.reuseBoundaries.mustRemainUnique) === JSON.stringify(expectedUniqueReuse), 'Unique reuse boundaries changed.');

console.log('Ground-site authoring manifest validation passed.');
console.log(`  Galactic sites: ${manifest.sites.length}`);
console.log(`  Galactic location presets: ${manifest.locationPresets.length}`);
console.log(`  Base planets/regions/classes/presets: ${library.planets.length}/${library.regions.length}/${library.locationClasses.length}/${library.presets.length}`);
console.log(`  Unique preset totals M/PBR/D: ${uniqueTotals.models}/${uniqueTotals.pbrFamilies2k}/${uniqueTotals.decalEntries}`);
console.log(`  Complete library totals M/PBR/D: ${completeTotals.models}/${completeTotals.pbrFamilies2k}/${completeTotals.decalEntries}`);
