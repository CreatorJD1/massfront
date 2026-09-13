import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const DEFAULT_MANIFEST = resolve(
  SCRIPT_DIR,
  '../assets/source/uga/interior-library/nexus-vii-material-decal-manifest.json'
);
const manifestPath = resolve(process.argv[2] || DEFAULT_MANIFEST);
const errors = [];

function fail(message) {
  errors.push(message);
}

function expect(condition, message) {
  if (!condition) fail(message);
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
}

function sameJson(actual, expected) {
  return JSON.stringify(stable(actual)) === JSON.stringify(stable(expected));
}

function sameSet(actual, expected) {
  return Array.isArray(actual)
    && actual.length === expected.length
    && [...new Set(actual)].sort().join('\n') === [...expected].sort().join('\n');
}

function checkUnique(entries, field, label) {
  const seen = new Map();
  for (const [index, entry] of entries.entries()) {
    const value = entry?.[field];
    if (typeof value !== 'string' || value.length === 0) {
      fail(`${label}[${index}].${field} must be a non-empty string`);
      continue;
    }
    if (seen.has(value)) fail(`${label}.${field} duplicates ${JSON.stringify(value)} at indexes ${seen.get(value)} and ${index}`);
    else seen.set(value, index);
  }
}

const EXPECTED_CHANNEL_PROFILES = {
  base_trim_pbr_v1: {
    basecolor: { suffix: '-basecolor.png', colorSpace: 'sRGB', components: 'RGB', packing: { RGB: 'lighting_neutral_base_color' } },
    'normal-height': { suffix: '-normal-height.png', colorSpace: 'linear', components: 'RGBA', packing: { RGB: 'gltf_opengl_tangent_normal', A: 'subtle_height' } },
    orm: { suffix: '-orm.png', colorSpace: 'linear', components: 'RGB', packing: { R: 'ambient_occlusion', G: 'roughness', B: 'metallic' } },
    emissive: { suffix: '-emissive.png', colorSpace: 'sRGB', components: 'RGB', packing: { RGB: 'physically_luminous_only_no_baked_halo' } },
    mask: { suffix: '-mask.png', colorSpace: 'linear', components: 'RGBA', packing: { R: 'district_tint', G: 'grime_receptivity', B: 'edge_wear_receptivity', A: 'wet_or_heat_response' }, optional: true }
  },
  decal_display_atlas_v1: {
    'color-opacity': { suffix: '-color-opacity.png', colorSpace: 'sRGB', components: 'RGBA', packing: { RGB: 'decal_color', A: 'coverage' } },
    normal: { suffix: '-normal.png', colorSpace: 'linear', components: 'RGB', packing: { RGB: 'gltf_opengl_tangent_normal_flat_neutral_outside_coverage' } },
    orm: { suffix: '-orm.png', colorSpace: 'linear', components: 'RGB', packing: { R: 'ambient_occlusion', G: 'roughness', B: 'metallic' } },
    emissive: { suffix: '-emissive.png', colorSpace: 'sRGB', components: 'RGB', packing: { RGB: 'emission_black_for_non_emissive_marks' } }
  }
};

const PHYSICAL_ROLES = {
  S01: 'interior_structure',
  S02: 'pressure_bulkhead',
  S03: 'pressure_door_hardware',
  S04: 'clean_access_deck',
  S05: 'transit_deck',
  S06: 'heavy_duty_deck',
  S07: 'service_grate',
  S08: 'machinery_body',
  S09: 'clean_ceramic',
  S10: 'civic_composite',
  S11: 'rubber_antislip',
  S12: 'cargo_polymer',
  S13: 'biophilic_resin',
  S14: 'containment_coating',
  S15: 'pressure_glazing',
  S16: 'transit_glazing',
  S17: 'display_glass',
  S18: 'upholstery_acoustic'
};

const TRIM_ROLES = {
  T01: 'structure_trim',
  T02: 'pressure_door_trim',
  T03: 'services_trim',
  T04: 'facility_trim',
  T05: 'console_trim',
  T06: 'transit_trim',
  T07: 'civic_trim',
  T08: 'industrial_trim'
};

const ATLAS_ROLES = {
  A00: 'universal_core_decals',
  A01: 'deck_a_identity_decals',
  A02: 'deck_b_identity_decals',
  A03: 'deck_c_identity_decals',
  A04: 'faction_identity_decals',
  A05: 'construction_state_decals',
  A06: 'wear_story_decals',
  A07: 'static_display_plates'
};

const DISTRICT_CONTRACTS = {
  command: {
    name: 'Command Core', deck: 'A', fixed: true,
    materials: ['S04', 'S02', 'S01', 'S10', 'S17'], trims: ['T01', 'T02', 'T05'], identityAtlas: 'A01',
    tierLabels: { 2: 'Strategic Nexus', 3: 'Civilization Command' }, facilities: []
  },
  navigation: {
    name: 'Navigation Bridge', deck: 'A', fixed: false,
    materials: ['S04', 'S05', 'S02', 'S01', 'S17'], trims: ['T02', 'T05', 'T06'], identityAtlas: 'A01',
    tierLabels: { 2: 'Expedition Astrogation', 3: 'Continuity Navigation' },
    facilities: [
      ['navigation_t2_efficient_routing', 2, 'Efficient Routing'],
      ['navigation_t2_transit_coordination', 2, 'Transit Coordination'],
      ['navigation_t3_fleet_lattice', 3, 'Fleet Route Lattice'],
      ['navigation_t3_continuity_scheduler', 3, 'Continuity Scheduler']
    ]
  },
  survey: {
    name: 'Survey Lab', deck: 'A', fixed: false,
    materials: ['S04', 'S09', 'S01', 'S14', 'S17'], trims: ['T03', 'T05'], identityAtlas: 'A01',
    tierLabels: { 2: 'Deep-Space Cartography', 3: 'Interstellar Observatory' },
    facilities: [
      ['survey_t2_probe_telemetry', 2, 'Probe Telemetry'],
      ['survey_t2_anomaly_filter', 2, 'Anomaly Filter'],
      ['survey_t3_interstellar_observatory', 3, 'Interstellar Observatory'],
      ['survey_t3_probe_reclaimer', 3, 'Probe Reclaimer']
    ]
  },
  mission_ops: {
    name: 'Mission Operations', deck: 'A', fixed: false,
    materials: ['S04', 'S05', 'S01', 'S17', 'S18'], trims: ['T05', 'T06'], identityAtlas: 'A01',
    tierLabels: { 2: 'Expedition Mission Control', 3: 'Coalition Operations Center' },
    facilities: [
      ['mission_ops_t2_readiness_network', 2, 'Readiness Network'],
      ['mission_ops_t2_debrief_archive', 2, 'Debrief Archive'],
      ['mission_ops_t3_coalition_planner', 3, 'Coalition Planner'],
      ['mission_ops_t3_casualty_forecasting', 3, 'Casualty Forecasting']
    ]
  },
  research: {
    name: 'Research Directorate', deck: 'B', fixed: false,
    materials: ['S04', 'S09', 'S14', 'S15', 'S17'], trims: ['T03', 'T04', 'T05'], identityAtlas: 'A02',
    tierLabels: { 2: 'Specialist Directorate', 3: 'Frontier Institute' },
    facilities: [
      ['research_t2_gravitic_computation', 2, 'Gravitic Computation'],
      ['research_t2_xenology_directorate', 2, 'Xenology Directorate'],
      ['research_t3_frontier_institute', 3, 'Frontier Institute'],
      ['research_t3_containment_institute', 3, 'Containment Institute']
    ]
  },
  fabricator: {
    name: 'Fabrication & Armory', deck: 'B', fixed: false,
    materials: ['S06', 'S08', 'S11', 'S12'], trims: ['T03', 'T08'], identityAtlas: 'A02',
    tierLabels: { 2: 'Autonomous Foundry', 3: 'Megaship Arsenal Works' },
    facilities: [
      ['fabricator_t2_precision_forge', 2, 'Precision Forge'],
      ['fabricator_t2_rapid_tooling', 2, 'Rapid Tooling'],
      ['fabricator_t3_megaship_yards', 3, 'Megaship Yards'],
      ['fabricator_t3_reclamation_works', 3, 'Reclamation Works']
    ]
  },
  engineering: {
    name: 'Engineering & Drive', deck: 'B', fixed: false,
    materials: ['S06', 'S08', 'S01', 'S11'], trims: ['T03', 'T08'], identityAtlas: 'A02',
    tierLabels: { 2: 'Fold Harmonics', 3: 'Expedition Propulsion' },
    facilities: [
      ['engineering_t2_reactor_baffles', 2, 'Reactor Baffles'],
      ['engineering_t2_drive_tuner', 2, 'Drive Tuner'],
      ['engineering_t3_civilization_grid', 3, 'Civilization Grid'],
      ['engineering_t3_thermal_reclaimer', 3, 'Thermal Reclaimer']
    ]
  },
  habitat: {
    name: 'Habitat & Medical', deck: 'C', fixed: false,
    materials: ['S04', 'S05', 'S10', 'S13', 'S09', 'S18'], trims: ['T06', 'T07'], identityAtlas: 'A03',
    tierLabels: { 2: 'Arcology Ring', 3: 'Civilization Habitat' },
    facilities: [
      ['habitat_t2_recovery_ward', 2, 'Recovery Ward'],
      ['habitat_t2_civilian_works', 2, 'Civilian Works'],
      ['habitat_t3_trauma_institute', 3, 'Trauma Institute'],
      ['habitat_t3_arcology_workforce', 3, 'Arcology Workforce']
    ]
  },
  factions: {
    name: 'Coalition Embassy', deck: 'C', fixed: false,
    materials: ['S04', 'S05', 'S10', 'S15', 'S16'], trims: ['T07'], identityAtlas: 'A03', factionAtlas: true,
    tierLabels: { 2: 'Accord Concourse', 3: 'Coalition Forum' },
    facilities: [
      ['factions_t2_diplomatic_forum', 2, 'Diplomatic Forum'],
      ['factions_t2_readiness_office', 2, 'Readiness Office'],
      ['factions_t3_accord_council', 3, 'Accord Council'],
      ['factions_t3_joint_command', 3, 'Joint Command']
    ]
  },
  hangar: {
    name: 'Strike & Expedition Bay', deck: 'C', fixed: false,
    materials: ['S06', 'S08', 'S11', 'S12', 'S15'], trims: ['T03', 'T06', 'T08'], identityAtlas: 'A03', factionAtlas: true,
    tierLabels: { 2: 'Operations Deck', 3: 'Coalition Deployment Hub' },
    facilities: [
      ['hangar_t2_support_bay', 2, 'Support Bay'],
      ['hangar_t2_medevac_cradle', 2, 'Medevac Cradle'],
      ['hangar_t3_heavy_lift_complex', 3, 'Heavy-Lift Complex'],
      ['hangar_t3_rapid_turnaround', 3, 'Rapid Turnaround']
    ]
  },
  logistics: {
    name: 'Logistics & Cargo', deck: 'C', fixed: false,
    materials: ['S06', 'S07', 'S08', 'S12'], trims: ['T03', 'T06', 'T08'], identityAtlas: 'A03',
    tierLabels: { 2: 'Orbital Freight Hub', 3: 'Civilization Supply Network' },
    facilities: [
      ['logistics_t2_salvage_sorting', 2, 'Salvage Sorting'],
      ['logistics_t2_probe_magazine', 2, 'Probe Magazine'],
      ['logistics_t3_deep_stores', 3, 'Deep Stores'],
      ['logistics_t3_autonomous_resupply', 3, 'Autonomous Resupply']
    ]
  }
};

const COMMAND_MODULES = [
  ['command_holotable', 'Strategic Holography Vault'],
  ['command_archive', 'Continuity Archive'],
  ['command_terminal', 'Classic Modes Terminal']
];

let manifest;
try {
  manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
} catch (error) {
  console.error(`FAIL NEXUS-VII interior library: cannot parse ${manifestPath}`);
  console.error(`- ${error.message}`);
  process.exit(1);
}

expect(manifest.schemaVersion === 1, 'schemaVersion must be 1');
expect(manifest.libraryId === 'nexus-vii-interior-material-decal-library-v1', 'libraryId is not the approved contract ID');
expect(manifest.shipId === 'nexus-vii', 'shipId must be nexus-vii');
expect(manifest.status === 'source_authoring_contract', 'manifest status must remain source_authoring_contract');
expect(manifest.scope?.sourceOnly === true, 'scope.sourceOnly must be true');
expect(manifest.scope?.runtimeIntegrationAuthorized === false, 'runtime integration must remain unauthorized in this source-only contract');
expect(manifest.scope?.bindingDomain === 'interior', 'scope.bindingDomain must be interior');
expect(sameJson(manifest.scope?.authoringResolutionPx, [2048, 2048]), 'authoring resolution must be exactly 2048x2048');
expect(manifest.authoringPolicy?.intendedTool === 'Spline.design MCP', 'authoringPolicy.intendedTool must be Spline.design MCP');
expect(manifest.authoringPolicy?.origin === 'original_project_authored', 'authoringPolicy.origin must require original project-authored work');
expect(manifest.authoringPolicy?.licenseRecordRequiredBeforeRuntime === true, 'a license record must be required before runtime integration');
expect(manifest.authoringPolicy?.sourceUriRequiredBeforeRuntime === true, 'a source URI must be required before runtime integration');
expect(manifest.authoringPolicy?.sourceSha256RequiredBeforeRuntime === true, 'a source hash must be required before runtime integration');

const evidence = list(manifest.sourceEvidence);
checkUnique(evidence, 'path', 'sourceEvidence');
for (const [index, item] of evidence.entries()) {
  expect(/^[0-9a-f]{64}$/.test(item?.sha256 || ''), `sourceEvidence[${index}].sha256 must be a lowercase SHA-256`);
  expect(typeof item?.role === 'string' && item.role.length > 0, `sourceEvidence[${index}].role is required`);
}

expect(sameJson(manifest.channelProfiles, EXPECTED_CHANNEL_PROFILES), 'channelProfiles do not match the approved base/trim and decal/display packing');

const physicalBases = list(manifest.physicalBases);
const trimSheets = list(manifest.trimSheets);
const decalAtlases = list(manifest.decalAtlases);
const districts = list(manifest.districts);

expect(physicalBases.length === 18, `physicalBases must contain 18 entries, found ${physicalBases.length}`);
expect(trimSheets.length === 8, `trimSheets must contain 8 entries, found ${trimSheets.length}`);
expect(decalAtlases.length === 8, `decalAtlases must contain 8 entries, found ${decalAtlases.length}`);
expect(districts.length === 11, `districts must contain 11 entries, found ${districts.length}`);
expect(manifest.scope?.requiredPhysicalBaseCount === 18, 'scope.requiredPhysicalBaseCount must be 18');
expect(manifest.scope?.requiredTrimSheetCount === 8, 'scope.requiredTrimSheetCount must be 8');
expect(manifest.scope?.requiredDecalAtlasCount === 8, 'scope.requiredDecalAtlasCount must be 8');
expect(manifest.scope?.requiredDistrictCount === 11, 'scope.requiredDistrictCount must be 11');

checkUnique(physicalBases, 'id', 'physicalBases');
checkUnique(trimSheets, 'id', 'trimSheets');
checkUnique(decalAtlases, 'id', 'decalAtlases');
checkUnique(districts, 'id', 'districts');
checkUnique([...physicalBases, ...trimSheets, ...decalAtlases], 'id', 'all source assets');
checkUnique([...physicalBases, ...trimSheets, ...decalAtlases], 'master', 'all source assets');

expect(sameSet(physicalBases.map(entry => entry.id), Object.keys(PHYSICAL_ROLES)), 'physical base IDs must be exactly S01-S18');
expect(sameSet(trimSheets.map(entry => entry.id), Object.keys(TRIM_ROLES)), 'trim sheet IDs must be exactly T01-T08');
expect(sameSet(decalAtlases.map(entry => entry.id), Object.keys(ATLAS_ROLES)), 'decal atlas IDs must be exactly A00-A07');
expect(sameSet(districts.map(entry => entry.id), Object.keys(DISTRICT_CONTRACTS)), 'district coverage must match the eleven authoritative district IDs');

expect(sameSet(manifest.roleNames?.physicalBase, Object.values(PHYSICAL_ROLES)), 'roleNames.physicalBase is incomplete or contains an unknown role');
expect(sameSet(manifest.roleNames?.trimSheet, Object.values(TRIM_ROLES)), 'roleNames.trimSheet is incomplete or contains an unknown role');
expect(sameSet(manifest.roleNames?.decalAtlas, Object.values(ATLAS_ROLES)), 'roleNames.decalAtlas is incomplete or contains an unknown role');

function checkSourceAsset(entry, expectedRole, channelProfile, kind) {
  expect(entry?.roleName === expectedRole, `${kind} ${entry?.id || '<missing>'} roleName must be ${expectedRole}`);
  expect(sameJson(entry?.dimensionsPx, [2048, 2048]), `${kind} ${entry?.id || '<missing>'} must be authored at 2048x2048`);
  expect(entry?.channelProfile === channelProfile, `${kind} ${entry?.id || '<missing>'} must use ${channelProfile}`);
  expect(typeof entry?.master === 'string' && /^uga-[a-z0-9-]+$/.test(entry.master), `${kind} ${entry?.id || '<missing>'} has an invalid master name`);
  expect(entry?.provenance?.status === 'planned_unproduced', `${kind} ${entry?.id || '<missing>'} provenance.status must be planned_unproduced`);
  expect(entry?.provenance?.origin === 'original', `${kind} ${entry?.id || '<missing>'} provenance.origin must be original`);
  expect(entry?.provenance?.tool === 'Spline.design MCP', `${kind} ${entry?.id || '<missing>'} provenance.tool must be Spline.design MCP`);
  expect(entry?.provenance?.source === null, `${kind} ${entry?.id || '<missing>'} provenance.source must remain null while unproduced`);
  expect(entry?.provenance?.sha256 === null, `${kind} ${entry?.id || '<missing>'} provenance.sha256 must remain null while unproduced`);
  expect(entry?.runtime?.status === 'source_only_unbound', `${kind} ${entry?.id || '<missing>'} runtime.status must be source_only_unbound`);
  expect(entry?.runtime?.domain === 'interior', `${kind} ${entry?.id || '<missing>'} runtime.domain must be interior`);
  expect(entry?.runtime?.asset === null, `${kind} ${entry?.id || '<missing>'} runtime.asset must remain null`);
}

for (const entry of physicalBases) checkSourceAsset(entry, PHYSICAL_ROLES[entry.id], 'base_trim_pbr_v1', 'physical base');
for (const entry of trimSheets) {
  checkSourceAsset(entry, TRIM_ROLES[entry.id], 'base_trim_pbr_v1', 'trim sheet');
  expect(entry.uvMode === 'authored_strips', `trim sheet ${entry.id} must use authored_strips UVs`);
  expect(entry.cubeProjectionAllowed === false, `trim sheet ${entry.id} must forbid cube projection`);
}
for (const entry of decalAtlases) {
  checkSourceAsset(entry, ATLAS_ROLES[entry.id], 'decal_display_atlas_v1', 'decal atlas');
  expect(entry.layout === 'atlasLayoutContract', `decal atlas ${entry.id} must use atlasLayoutContract`);
}

const atlasLayout = manifest.atlasLayoutContract || {};
expect(sameJson(atlasLayout.dimensionsPx, [2048, 2048]), 'atlas dimensions must be exactly 2048x2048');
expect(atlasLayout.gridColumns === 8 && atlasLayout.gridRows === 8, 'atlas logical grid must be exactly 8x8');
expect(atlasLayout.outerGutterPx >= 16, 'atlas outer gutter must be at least 16 pixels at 2K');
expect(atlasLayout.edgeDilationPx >= 8, 'atlas edge dilation must be at least 8 pixels around occupied cells');
expect(Array.isArray(atlasLayout.logicalCellPx) && atlasLayout.logicalCellPx.length === 2, 'atlas logicalCellPx must contain width and height');
if (Array.isArray(atlasLayout.logicalCellPx) && atlasLayout.logicalCellPx.length === 2) {
  const [width, height] = atlasLayout.dimensionsPx || [];
  const [cellWidth, cellHeight] = atlasLayout.logicalCellPx;
  expect(atlasLayout.outerGutterPx * 2 + cellWidth * atlasLayout.gridColumns === width, 'atlas horizontal grid plus outer gutters must exactly fill 2048 pixels');
  expect(atlasLayout.outerGutterPx * 2 + cellHeight * atlasLayout.gridRows === height, 'atlas vertical grid plus outer gutters must exactly fill 2048 pixels');
  expect(atlasLayout.edgeDilationPx * 2 < cellWidth && atlasLayout.edgeDilationPx * 2 < cellHeight, 'atlas edge dilation leaves no positive content area inside a logical cell');
}
expect(sameJson(atlasLayout.allowedCellSpans, [[1, 1], [2, 1], [2, 2], [4, 1]]), 'atlas allowed cell spans must be 1x1, 2x1, 2x2, and 4x1');

const atlasById = new Map(decalAtlases.map(entry => [entry.id, entry]));
const physicalIds = new Set(physicalBases.map(entry => entry.id));
const trimIds = new Set(trimSheets.map(entry => entry.id));
const atlasIds = new Set(decalAtlases.map(entry => entry.id));

expect(sameSet(Object.keys(atlasById.get('A01')?.contentByDistrict || {}), ['command', 'navigation', 'survey', 'mission_ops']), 'A01 must cover every Deck A district exactly once');
expect(sameSet(Object.keys(atlasById.get('A02')?.contentByDistrict || {}), ['research', 'fabricator', 'engineering']), 'A02 must cover every Deck B district exactly once');
expect(sameSet(Object.keys(atlasById.get('A03')?.contentByDistrict || {}), ['habitat', 'factions', 'hangar', 'logistics']), 'A03 must cover every Deck C district exactly once');
expect(sameSet(Object.keys(atlasById.get('A07')?.contentByDistrict || {}), Object.keys(DISTRICT_CONTRACTS)), 'A07 static displays must cover all eleven districts');
expect(sameSet(Object.keys(atlasById.get('A04')?.contentByFaction || {}), ['uga', 'nova', 'dominion', 'syndicate']), 'A04 must contain only UGA, Nova, Dominion, and Syndicate ownership sets');
expect(sameSet(atlasById.get('A04')?.excludedOwnershipFactions, ['brood']), 'A04 must explicitly exclude Brood ownership marks');
expect(atlasById.get('A07')?.authoritativeDynamicTextAllowed === false, 'A07 must forbid baked authoritative dynamic text');

const allMarks = [];
for (const district of districts) {
  for (const mark of list(district.tierMarks)) allMarks.push({ ...mark, kind: 'tier', districtId: district.id });
  for (const mark of list(district.moduleMarks)) allMarks.push({ ...mark, kind: 'module', districtId: district.id });
  for (const mark of list(district.facilityMarks)) allMarks.push({ ...mark, kind: 'facility', districtId: district.id });
}
checkUnique(allMarks, 'id', 'all district marks');
checkUnique(allMarks, 'slotId', 'all district marks');

for (const district of districts) {
  const expected = DISTRICT_CONTRACTS[district.id];
  if (!expected) continue;
  expect(district.name === expected.name, `district ${district.id} must use player-facing name ${expected.name}`);
  expect(district.deck === expected.deck, `district ${district.id} must be on Deck ${expected.deck}`);
  expect(district.fixed === expected.fixed, `district ${district.id} fixed flag is incorrect`);
  expect(sameSet(district.materialIds, expected.materials), `district ${district.id} physical recipe does not match the taxonomy`);
  expect(sameSet(district.trimIds, expected.trims), `district ${district.id} trim recipe does not match the taxonomy`);
  expect(list(district.requiredIdentityOverlays).length > 0, `district ${district.id} must declare required identity overlays`);
  expect(district.provenance?.status === 'taxonomy_mapped', `district ${district.id} provenance.status must be taxonomy_mapped`);
  expect(district.runtime?.status === 'recipe_only_unbound', `district ${district.id} runtime.status must be recipe_only_unbound`);
  expect(district.runtime?.domain === 'interior', `district ${district.id} runtime.domain must be interior`);

  const expectedRequiredAtlases = ['A00', expected.identityAtlas, 'A05', 'A07'];
  if (expected.factionAtlas) expectedRequiredAtlases.push('A04');
  expect(sameSet(district.requiredAtlasIds, expectedRequiredAtlases), `district ${district.id} required atlas recipe is incorrect`);
  expect(sameSet(district.conditionalAtlasIds, ['A06']), `district ${district.id} must declare A06 as conditional role-specific wear`);

  for (const materialId of list(district.materialIds)) expect(physicalIds.has(materialId), `district ${district.id} references unknown physical base ${materialId}`);
  for (const trimId of list(district.trimIds)) expect(trimIds.has(trimId), `district ${district.id} references unknown trim sheet ${trimId}`);
  for (const atlasId of [...list(district.requiredAtlasIds), ...list(district.conditionalAtlasIds)]) expect(atlasIds.has(atlasId), `district ${district.id} references unknown atlas ${atlasId}`);

  const tierMarks = list(district.tierMarks);
  expect(tierMarks.length === 2, `district ${district.id} must have exactly Tier-2 and Tier-3 progression marks`);
  for (const tier of [2, 3]) {
    const mark = tierMarks.find(entry => entry.tier === tier);
    expect(Boolean(mark), `district ${district.id} is missing its Tier-${tier} progression mark`);
    if (!mark) continue;
    expect(mark.id.startsWith(`district_${district.id}_t${tier}_`), `district ${district.id} Tier-${tier} mark ID must use the district namespace`);
    expect(mark.label === expected.tierLabels[tier], `district ${district.id} Tier-${tier} mark label must be ${expected.tierLabels[tier]}`);
    expect(mark.atlasId === expected.identityAtlas, `district ${district.id} Tier-${tier} mark must use ${expected.identityAtlas}`);
    expect(mark.slotId === `tier.${district.id}.t${tier}`, `district ${district.id} Tier-${tier} slotId is invalid`);
    expect(mark.targetNodeName === `DISTRICT_${district.id}`, `district ${district.id} Tier-${tier} target node is invalid`);
  }

  const facilities = list(district.facilityMarks);
  expect(facilities.length === expected.facilities.length, `district ${district.id} has ${facilities.length} facility marks; expected ${expected.facilities.length}`);
  expect(sameSet(facilities.map(entry => entry.id), expected.facilities.map(entry => entry[0])), `district ${district.id} facility mark IDs do not cover every approved specialization`);
  for (const [facilityId, tier, label] of expected.facilities) {
    const mark = facilities.find(entry => entry.id === facilityId);
    if (!mark) continue;
    expect(mark.tier === tier, `facility mark ${facilityId} must be Tier-${tier}`);
    expect(mark.label === label, `facility mark ${facilityId} label must be ${label}`);
    expect(mark.atlasId === expected.identityAtlas, `facility mark ${facilityId} must use ${expected.identityAtlas}`);
    expect(mark.slotId === `facility.${facilityId}`, `facility mark ${facilityId} slotId is invalid`);
    expect(mark.targetNodeName === `FACILITY_${facilityId}`, `facility mark ${facilityId} must target FACILITY_${facilityId}`);
  }

  const moduleMarks = list(district.moduleMarks);
  if (district.id === 'command') {
    expect(sameSet(moduleMarks.map(entry => entry.id), COMMAND_MODULES.map(entry => entry[0])), 'Command Core module marks are incomplete');
    for (const [moduleId, label] of COMMAND_MODULES) {
      const mark = moduleMarks.find(entry => entry.id === moduleId);
      if (!mark) continue;
      expect(mark.label === label, `module mark ${moduleId} label must be ${label}`);
      expect(mark.atlasId === 'A01', `module mark ${moduleId} must use A01`);
      expect(mark.slotId === `module.${moduleId}`, `module mark ${moduleId} slotId is invalid`);
      expect(mark.targetNodeName === `MODULE_${moduleId}`, `module mark ${moduleId} target node is invalid`);
    }
  } else {
    expect(moduleMarks.length === 0, `district ${district.id} must not declare Command Core module marks`);
  }
}

const expectedFacilityCount = Object.values(DISTRICT_CONTRACTS).reduce((sum, entry) => sum + entry.facilities.length, 0);
const actualFacilityCount = districts.reduce((sum, entry) => sum + list(entry.facilityMarks).length, 0);
const actualTierMarkCount = districts.reduce((sum, entry) => sum + list(entry.tierMarks).length, 0);
const actualModuleMarkCount = districts.reduce((sum, entry) => sum + list(entry.moduleMarks).length, 0);
expect(expectedFacilityCount === 40 && actualFacilityCount === 40, `facility mark coverage must be 40, found ${actualFacilityCount}`);
expect(actualTierMarkCount === 22, `Tier-2/Tier-3 progression mark coverage must be 22, found ${actualTierMarkCount}`);
expect(actualModuleMarkCount === 3, `Command Core module mark coverage must be 3, found ${actualModuleMarkCount}`);

const forbiddenMaterialIds = new Set(list(manifest.scope?.forbiddenMaterialIds).map(value => String(value).toLowerCase()));
const forbiddenRoleNames = new Set(list(manifest.scope?.forbiddenRoleNames).map(value => String(value).toLowerCase()));
expect(forbiddenMaterialIds.has('uga-hull'), 'scope.forbiddenMaterialIds must include uga-hull');
expect(forbiddenRoleNames.has('exterior_hull'), 'scope.forbiddenRoleNames must include exterior_hull');

for (const entry of [...physicalBases, ...trimSheets, ...decalAtlases]) {
  expect(!forbiddenMaterialIds.has(String(entry.master).toLowerCase()), `source asset ${entry.id} illegally binds forbidden material ${entry.master}`);
  expect(!forbiddenRoleNames.has(String(entry.roleName).toLowerCase()), `source asset ${entry.id} illegally binds forbidden role ${entry.roleName}`);
  expect(!/exterior[-_ ]hull/i.test(String(entry.roleName)), `source asset ${entry.id} roleName must not bind an exterior hull role`);
}
for (const district of districts) {
  for (const binding of [...list(district.materialIds), ...list(district.trimIds), ...list(district.requiredAtlasIds), ...list(district.conditionalAtlasIds)]) {
    expect(!forbiddenMaterialIds.has(String(binding).toLowerCase()), `district ${district.id} illegally binds forbidden material ${binding}`);
    expect(!/exterior[-_ ]hull/i.test(String(binding)), `district ${district.id} illegally binds an exterior hull token ${binding}`);
  }
}

if (errors.length > 0) {
  console.error(`FAIL NEXUS-VII interior library contract (${errors.length} error${errors.length === 1 ? '' : 's'})`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`PASS NEXUS-VII interior library contract: ${physicalBases.length} physical bases, ${trimSheets.length} trim sheets, ${decalAtlases.length} decal/display atlases, ${districts.length} districts, ${actualTierMarkCount} Tier-2/Tier-3 progression marks, ${actualFacilityCount} facility specialization marks, ${actualModuleMarkCount} Command Core module marks.`);
