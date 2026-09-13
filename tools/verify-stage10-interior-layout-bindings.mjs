#!/usr/bin/env node

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const toolDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(toolDir, '..');
const sourcePath = path.join(root, 'source-media', 'content-library', 'interior-tactical-model-packs.v1.json');
const topologyPath = path.join(root, 'assets', 'data', 'interiortopology-stage10.js');
const theatrePath = path.join(root, 'assets', 'data', 'theatreprofiles-stage10.js');
const showcasePath = path.join(root, 'modules', 'space_exploration', 'src', 'systems', 'showcase_systems.js');
const domainCatalogPath = path.join(root, 'modules', 'space_exploration', 'src', 'domain', 'catalog.js');
const locationGrammarPath = path.join(root, 'assets', 'data', 'locationgrammar.js');
const bindingPath = path.join(root, 'source-media', 'content-library', 'stage10-interior-layout-bindings.v1.json');

const [sourceText, topologyText, theatreText, showcaseText, domainCatalogText, locationGrammarText] = await Promise.all([
  fs.readFile(sourcePath, 'utf8'),
  fs.readFile(topologyPath, 'utf8'),
  fs.readFile(theatrePath, 'utf8'),
  fs.readFile(showcasePath, 'utf8'),
  fs.readFile(domainCatalogPath, 'utf8'),
  fs.readFile(locationGrammarPath, 'utf8')
]);
const sourceCatalog = JSON.parse(sourceText);

function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
  return JSON.stringify(value);
}

function sha256(value) {
  return 'sha256-' + createHash('sha256').update(canonical(value)).digest('hex');
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function same(a, b) {
  return canonical(a) === canonical(b);
}

const topologyContext = vm.createContext({});
new vm.Script(topologyText, { filename: topologyPath }).runInContext(topologyContext);
const topologyCatalog = JSON.parse(vm.runInContext('JSON.stringify(Stage10InteriorTopologyV1)', topologyContext));
function topologyPreflight(templateId) {
  return JSON.parse(vm.runInContext(`JSON.stringify(mfPreflightStage10InteriorTopologyV1(${JSON.stringify(templateId)}))`, topologyContext));
}

const theatreContext = vm.createContext({});
new vm.Script(theatreText, { filename: theatrePath }).runInContext(theatreContext);
const theatreCatalog = JSON.parse(vm.runInContext('JSON.stringify(Stage10TheatreCatalogV1)', theatreContext));
const theatrePreflight = JSON.parse(vm.runInContext('JSON.stringify(mfPreflightStage10TheatreCatalogV1())', theatreContext));
const showcaseContext = vm.createContext({});
const classicShowcaseText = showcaseText.replace(/\bexport\s+const\s+/g, 'const ');
new vm.Script(classicShowcaseText, { filename: showcasePath }).runInContext(showcaseContext);
const showcaseSystems = JSON.parse(vm.runInContext('JSON.stringify(SHOWCASE_SYSTEMS)', showcaseContext));
const showcaseSystemIds = Object.keys(showcaseSystems);
const showcasePlanets = Object.values(showcaseSystems).flatMap(system => system.planets || []);
const showcaseContacts = Object.values(showcaseSystems).flatMap(system => system.contacts || []);
const showcasePlanetIds = showcasePlanets.map(planet => planet.id);
const showcaseContactIds = showcaseContacts.map(contact => contact.id);
const showcasePlanetParents = Object.fromEntries(Object.values(showcaseSystems).flatMap(system => (system.planets || []).map(planet => [planet.id, system.id])));
const showcaseContactParents = Object.fromEntries(Object.values(showcaseSystems).flatMap(system => (system.contacts || []).map(contact => [contact.id, system.id])));
const domainContext = vm.createContext({});
const classicDomainText = domainCatalogText
  .replace(/^import\s+\{\s*deepFreeze\s*\}\s+from\s+['"]\.\/deterministic\.js['"];?\s*$/m, 'const deepFreeze = value => value;')
  .replace(/\bexport\s+const\s+/g, 'const ')
  .replace(/\bexport\s+function\s+/g, 'function ');
new vm.Script(classicDomainText, { filename: domainCatalogPath }).runInContext(domainContext);
const domainSystems = JSON.parse(vm.runInContext('JSON.stringify(SYSTEM_CATALOG)', domainContext));
const domainSites = JSON.parse(vm.runInContext('JSON.stringify(SITE_CATALOG)', domainContext));
const domainValidation = JSON.parse(vm.runInContext('JSON.stringify(validateCatalogs())', domainContext));
const locationGrammarContext = vm.createContext({});
new vm.Script(locationGrammarText, { filename: locationGrammarPath }).runInContext(locationGrammarContext);
const surfaceRegions = JSON.parse(vm.runInContext('JSON.stringify(LocationGrammarV1.regions)', locationGrammarContext));

const allowedUnits = clone(theatreCatalog.unitEnvelopes.small_unit_combined.allowed);
const personnelUnits = clone(theatreCatalog.unitEnvelopes.infantry_only.allowed);
const forbiddenUnits = clone(theatreCatalog.unitEnvelopes.small_unit_combined.forbidden);
const infantryBranchMinimums = {
  interior_xs_breach_40x40: 1,
  interior_xs_linear_48x32: 2,
  interior_small_loop_64x64: 3,
  interior_small_multilevel_80x64: 1
};

assert.equal(theatrePreflight.ok, true, 'Stage 10 theatre authority must pass its own preflight');
assert.equal(domainValidation.ok, true, 'exploration domain catalogs must pass their own validation');
assert.equal(theatreCatalog.planetAuthority, 'EXPLORATION_MODULE_SHOWCASE_SYSTEMS');
assert.deepEqual(theatreCatalog.sourceInventories.authoredExplorationPlanets.ids, showcasePlanetIds, 'theatre planet IDs must exactly match SHOWCASE_SYSTEMS planets');
assert.deepEqual(topologyCatalog.restrictedUnitEnvelope.allowed, allowedUnits, 'topology small_unit_combined must match theatre authority');
assert.deepEqual(topologyCatalog.restrictedUnitEnvelope.forbidden, forbiddenUnits, 'topology restricted classes must match theatre authority');
for (const template of Object.values(topologyCatalog.templates)) {
  assert.deepEqual(template.unitEnvelope.allowed, allowedUnits, `${template.id} unit envelope must match theatre authority`);
  assert.deepEqual(template.unitEnvelope.forbidden, forbiddenUnits, `${template.id} restricted classes must match theatre authority`);
}

function planetDeclarationResolution(sourceId) {
  const authorityMatches = [];
  if (theatreCatalog.sourceInventories.surfaceHomeworlds.ids.includes(sourceId)) authorityMatches.push({ authorityKind: 'SURFACE_HOMEWORLD', authorityId: sourceId, parentId: null });
  if (showcasePlanetIds.includes(sourceId)) authorityMatches.push({ authorityKind: 'SHOWCASE_PLANET', authorityId: sourceId, parentId: showcasePlanetParents[sourceId] });
  const namespaceCollisions = [];
  if (showcaseSystemIds.includes(sourceId)) namespaceCollisions.push({ authorityKind: 'SHOWCASE_SYSTEM', authorityId: sourceId });
  if (domainSystems[sourceId]) namespaceCollisions.push({ authorityKind: 'DOMAIN_SYSTEM', authorityId: sourceId });
  const isBound = authorityMatches.length > 0;
  return {
    sourceId,
    status: isBound ? 'BOUND_EXACT_TYPED_PLANET' : 'UNBOUND_PENDING_CANONICAL_MAPPING',
    authorityMatches,
    namespaceCollisions,
    mismatchReason: isBound ? null : namespaceCollisions.length ? 'EXACT_ID_EXISTS_ONLY_AS_NON_PLANET_NAMESPACE' : 'NO_EXACT_TYPED_PLANET_MATCH'
  };
}

function locationDeclarationResolution(sourceId, parentId) {
  const authorityMatches = [];
  const parentMismatches = [];
  const addMatch = (authorityKind, authorityId, actualParentId) => {
    const record = { authorityKind, authorityId, parentId: actualParentId };
    if (actualParentId === parentId) authorityMatches.push(record);
    else parentMismatches.push(record);
  };
  if (surfaceRegions[sourceId]) addMatch('SURFACE_REGION', sourceId, surfaceRegions[sourceId].planet);
  if (domainSites[sourceId]) addMatch('DOMAIN_SITE', sourceId, domainSites[sourceId].systemId);
  if (showcasePlanetIds.includes(sourceId)) addMatch('SHOWCASE_PLANET', sourceId, showcasePlanetParents[sourceId]);
  if (showcaseContactIds.includes(sourceId)) addMatch('SHOWCASE_CONTACT', sourceId, showcaseContactParents[sourceId]);
  const isBound = authorityMatches.length > 0;
  return {
    sourceId,
    status: isBound ? 'BOUND_EXACT_TYPED_LOCATION' : 'UNBOUND_PENDING_CANONICAL_MAPPING',
    authorityMatches,
    parentMismatches,
    mismatchReason: isBound ? null : parentMismatches.length ? 'EXACT_ID_PARENT_MISMATCH' : 'NO_EXACT_TYPED_LOCATION_MATCH'
  };
}

function buildAuthorityResolution(pack) {
  const parentId = pack.planetIds.length === 1 ? pack.planetIds[0] : null;
  const planetDeclarations = pack.planetIds.map(sourceId => planetDeclarationResolution(sourceId));
  const locationDeclarations = pack.locationIds.map(sourceId => locationDeclarationResolution(sourceId, parentId));
  const allDeclarations = [...planetDeclarations, ...locationDeclarations];
  return {
    authority: theatreCatalog.planetAuthority,
    declaredParentId: parentId,
    planetDeclarations,
    locationDeclarations,
    status: allDeclarations.every(declaration => declaration.status.startsWith('BOUND_EXACT_TYPED_'))
      ? 'BOUND_EXACT_AUTHORITY'
      : 'UNBOUND_PENDING_CANONICAL_MAPPING'
  };
}

function buildEvidenceProfile(source) {
  return {
    profileId: 'stage10-interior-production-evidence-v1',
    requiredStateForRuntime: 'PASS_WITH_EVIDENCE',
    gates: [
      { gateId: 'generated-source-provenance', sourceAcceptanceGateIndexes: [0, 1, 9], requirement: 'Isolated generated source and provenance exist, are original, and match one named inventory member.' },
      { gateId: 'lod0-retopology', sourceAcceptanceGateIndexes: [0, 2], requirement: 'Retopologized LOD0 stays within its source archetype triangle cap.' },
      { gateId: 'lod1-lod2-silhouette-sockets', sourceAcceptanceGateIndexes: [0, 2], requirement: 'LOD1 and LOD2 preserve silhouette and socket planes and are not raw generator output.' },
      { gateId: 'socket-assembly', sourceAcceptanceGateIndexes: [0, 3], requirement: 'Straight, rotated, corner, T, and loop assemblies pass source gap and overlap tolerances.' },
      { gateId: 'collision-evidence', sourceAcceptanceGateIndexes: [0, 3, 5], requirement: 'Simplified collision is separate from render meshes and portal-state collision updates atomically.' },
      { gateId: 'navigation-evidence', sourceAcceptanceGateIndexes: [0, 4, 5, 6], requirement: 'End-to-end mixed navigation, infantry branches, portal updates, and deterministic rubble are measured.' },
      { gateId: 'deterministic-destruction', sourceAcceptanceGateIndexes: [5, 6], requirement: 'Authored destruction swaps and explicit source-to-topology state mappings update collision and navigation without physics fragments becoming authority.' },
      { gateId: 'assembled-performance', sourceAcceptanceGateIndexes: [7], requirement: 'XS and SMALL assemblies meet their source triangle and draw-call budgets before batching.' },
      { gateId: 'cutaway-device-captures', sourceAcceptanceGateIndexes: [8], requirement: 'Portrait and landscape tactical/close captures prove cutaway, objective, clearance, and shimmer quality.' }
    ],
    sourceAcceptanceGates: clone(source.acceptanceGates)
  };
}

function buildPackInventory(pack) {
  const members = clone(pack.members);
  const archetypeIds = [...new Set(members.map(member => member.archetype))];
  const geometryContracts = Object.fromEntries(archetypeIds.map(archetype => [archetype, clone(sourceCatalog.assetArchetypes[archetype])]));
  const socketProfileIds = [...new Set(members.flatMap(member => member.sockets.map(socket => socket.profile)))];
  const socketContracts = Object.fromEntries(socketProfileIds.map(profile => [profile, clone(sourceCatalog.socketProfiles[profile])]));
  const memberInventoryHash = sha256(members);
  const geometryContractHash = sha256(geometryContracts);
  const socketContractHash = sha256(socketContracts);
  return {
    inventoryId: pack.packId + '#inventory-v1',
    packId: pack.packId,
    title: pack.title,
    status: pack.status,
    runtimeReady: pack.runtimeReady,
    faction: pack.faction,
    planetIds: clone(pack.planetIds),
    locationIds: clone(pack.locationIds),
    authorityResolution: buildAuthorityResolution(pack),
    sourceTemplateIds: clone(pack.mapTemplateIds),
    memberCount: members.length,
    members,
    geometryContracts,
    socketContracts,
    memberInventoryHash,
    geometryContractHash,
    socketContractHash,
    inventoryHash: sha256({ members, geometryContracts, socketContracts })
  };
}

function buildTemplateRecord(sourceTemplate) {
  const topologyTemplate = topologyCatalog.templates[sourceTemplate.templateId];
  const topologyContract = topologyCatalog.templateContracts[sourceTemplate.templateId];
  const preflight = topologyPreflight(sourceTemplate.templateId);
  const isMultilevel = sourceTemplate.templateId === 'interior_small_multilevel_80x64';
  return {
    templateId: sourceTemplate.templateId,
    sizeClass: sourceTemplate.sizeClass,
    playableBoundsMeters: clone(sourceTemplate.playableBoundsMeters),
    floorElevations: clone(topologyTemplate.floorElevations),
    requiredMobility: clone(sourceTemplate.requiredMobility),
    theatreEnvelopeMobility: clone(allowedUnits),
    minimumMixedRouteWidth: sourceTemplate.minimumMixedRouteWidth,
    minimumTurningPockets: sourceTemplate.minimumTurningPockets,
    minimumInfantryBranches: infantryBranchMinimums[sourceTemplate.templateId],
    assemblyRules: clone(sourceTemplate.assemblyRules),
    topologyHash: preflight.topologyHash,
    routeSocketNeeds: {
      personnel: { profile: 'interior_personnel_4x4', clearWidth: 3.2, clearHeight: 3.2, sourceSocketMobility: clone(sourceCatalog.socketProfiles.interior_personnel_4x4.mobility), mobility: clone(personnelUnits) },
      mixed: { profile: 'interior_mixed_8x6', clearWidth: 6.4, clearHeight: 5.8, sourceSocketMobility: clone(sourceCatalog.socketProfiles.interior_mixed_8x6.mobility), mobility: clone(allowedUnits) },
      vertical: isMultilevel
        ? { required: true, profile: 'interior_vertical_8x6', clearWidth: 6.4, clearHeight: 5.8, riseMeters: topologyContract.requiredVerticalRise, sourceSocketMobility: clone(sourceCatalog.socketProfiles.interior_vertical_8x6.mobility), mobility: clone(allowedUnits) }
        : { required: false, profile: null, clearWidth: 0, clearHeight: 0, riseMeters: 0, sourceSocketMobility: [], mobility: [] }
    },
    cutaway: {
      required: true,
      mode: topologyTemplate.cameraCutaway.mode,
      hideLayers: clone(topologyTemplate.cameraCutaway.hideLayers),
      preserveLayers: clone(topologyTemplate.cameraCutaway.preserveLayers),
      levels: clone(topologyTemplate.cameraCutaway.levels),
      objectiveOcclusionPolicy: topologyTemplate.cameraCutaway.objectiveOcclusionPolicy,
      failClosed: topologyTemplate.cameraCutaway.failClosed
    },
    assembledPerformanceBudget: sourceTemplate.sizeClass === 'XS'
      ? { maximumVisibleTrianglesLod0: 180000, maximumDrawCallsBeforeBatching: 90 }
      : { maximumVisibleTrianglesLod0: 320000, maximumDrawCallsBeforeBatching: 140 }
  };
}

function buildBinding(pack, inventory, templateRecord, evidenceProfile) {
  const sourceDeclaresTemplate = pack.mapTemplateIds.includes(templateRecord.templateId);
  const authorityBound = inventory.authorityResolution.status === 'BOUND_EXACT_AUTHORITY';
  const readinessBlockers = ['PRODUCTION_EVIDENCE_REQUIRED'];
  if (!authorityBound) readinessBlockers.unshift('CANONICAL_PLANET_LOCATION_MAPPING_REQUIRED');
  if (!sourceDeclaresTemplate) readinessBlockers.push('SOURCE_TEMPLATE_DECLARATION_REQUIRED');
  return {
    bindingId: 'layout-binding__' + pack.packId + '__' + templateRecord.templateId,
    status: authorityBound
      ? sourceDeclaresTemplate ? 'BLOCKED_EVIDENCE' : 'BLOCKED_SOURCE_DECLARATION'
      : 'UNBOUND_PENDING_CANONICAL_MAPPING',
    readinessBlockers,
    runtimeReady: false,
    generatedAssetsPresent: false,
    assetPaths: [],
    packId: pack.packId,
    inventoryRef: inventory.inventoryId,
    inventoryMemberCount: inventory.memberCount,
    memberInventoryHash: inventory.memberInventoryHash,
    geometryContractHash: inventory.geometryContractHash,
    socketContractHash: inventory.socketContractHash,
    inventoryHash: inventory.inventoryHash,
    faction: pack.faction,
    planetIds: clone(pack.planetIds),
    locationIds: clone(pack.locationIds),
    authorityResolution: clone(inventory.authorityResolution),
    templateId: templateRecord.templateId,
    sizeClass: templateRecord.sizeClass,
    playableBoundsMeters: clone(templateRecord.playableBoundsMeters),
    sourceTemplateDeclaration: sourceDeclaresTemplate ? 'DECLARED' : 'MISSING_FROM_PACK_SOURCE',
    unitRestrictions: {
      allowed: clone(allowedUnits),
      forbidden: clone(forbiddenUnits)
    },
    routeSocketNeeds: clone(templateRecord.routeSocketNeeds),
    minimumTurningPockets: templateRecord.minimumTurningPockets,
    minimumInfantryBranches: templateRecord.minimumInfantryBranches,
    cutaway: clone(templateRecord.cutaway),
    destruction: {
      stateAuthority: 'authored-deterministic-swaps',
      sourceArchetypeStates: ['intact', 'damaged', 'destroyed'],
      topologyDestructionStates: ['intact', 'damaged', 'critical', 'destroyed'],
      criticalStateBinding: { sourceState: null, status: 'BLOCKED_MISSING_AUTHORED_VARIANT', runtimeFallbackAllowed: false },
      sourceAcceptancePortalStates: ['intact', 'open', 'jammed', 'destroyed'],
      topologyPortalStates: ['closed', 'open', 'jammed', 'destroyed'],
      portalStateMap: { intact: 'closed', open: 'open', jammed: 'jammed', destroyed: 'destroyed' },
      collisionNavigationUpdate: 'atomic',
      physicsFragmentsAreNavigationAuthority: false,
      destroyedRoutePolicy: 'measured-rubble-never-random'
    },
    evidenceProfileId: evidenceProfile.profileId,
    evidence: {
      state: 'MISSING',
      passedGateIds: [],
      artifactPaths: []
    }
  };
}

function buildExpectedCatalog(source) {
  const packInventories = source.packs.map(buildPackInventory);
  const templates = source.mapTemplates.map(buildTemplateRecord);
  const evidenceGateProfile = buildEvidenceProfile(source);
  const inventoryByPack = Object.fromEntries(packInventories.map(inventory => [inventory.packId, inventory]));
  const bindings = [];
  for (const pack of source.packs) {
    for (const template of templates) bindings.push(buildBinding(pack, inventoryByPack[pack.packId], template, evidenceGateProfile));
  }
  const sourceDeclaredBindingCount = bindings.filter(binding => binding.sourceTemplateDeclaration === 'DECLARED').length;
  const authorityBoundPackCount = packInventories.filter(inventory => inventory.authorityResolution.status === 'BOUND_EXACT_AUTHORITY').length;
  const authorityBoundBindingCount = bindings.filter(binding => binding.authorityResolution.status === 'BOUND_EXACT_AUTHORITY').length;
  const planetDeclarations = packInventories.flatMap(inventory => inventory.authorityResolution.planetDeclarations);
  const locationDeclarations = packInventories.flatMap(inventory => inventory.authorityResolution.locationDeclarations);
  return {
    schemaVersion: 1,
    catalogId: 'massfront-stage10-interior-layout-bindings-v1',
    status: 'PLANNED',
    runtimeReady: false,
    sourceOnly: true,
    generatedAssetClaims: false,
    sourceRefs: {
      packCatalog: 'source-media/content-library/interior-tactical-model-packs.v1.json',
      topologyCandidates: 'assets/data/interiortopology-stage10.js',
      theatreAuthority: 'assets/data/theatreprofiles-stage10.js',
      showcaseAuthority: 'modules/space_exploration/src/systems/showcase_systems.js',
      domainLocationAuthority: 'modules/space_exploration/src/domain/catalog.js',
      surfaceRegionAuthority: 'assets/data/locationgrammar.js'
    },
    authorityContract: {
      planetAuthority: theatreCatalog.planetAuthority,
      exactShowcaseSystemIds: clone(showcaseSystemIds),
      exactShowcasePlanetIds: clone(showcasePlanetIds),
      exactShowcaseContactIds: clone(showcaseContactIds),
      exactSurfaceHomeworldIds: clone(theatreCatalog.sourceInventories.surfaceHomeworlds.ids),
      exactDomainSystemIds: Object.keys(domainSystems),
      exactDomainSiteIds: Object.keys(domainSites),
      exactSurfaceRegionIds: Object.keys(surfaceRegions),
      typedParentJoinRequired: true,
      unresolvedPolicy: 'UNBOUND_PENDING_CANONICAL_MAPPING',
      aliasInferenceAllowed: false
    },
    matrixPolicy: 'ALL_PACKS_X_ALL_EXACT_TEMPLATES_WITH_SOURCE_GAPS_EXPLICIT',
    coverage: {
      packCount: source.packs.length,
      templateCount: source.mapTemplates.length,
      bindingCount: bindings.length,
      sourceDeclaredBindingCount,
      sourceGapBindingCount: bindings.length - sourceDeclaredBindingCount,
      authorityBoundPackCount,
      authorityPendingPackCount: packInventories.length - authorityBoundPackCount,
      authorityBoundBindingCount,
      authorityPendingBindingCount: bindings.length - authorityBoundBindingCount,
      exactPlanetDeclarationCount: planetDeclarations.filter(declaration => declaration.status === 'BOUND_EXACT_TYPED_PLANET').length,
      pendingPlanetDeclarationCount: planetDeclarations.filter(declaration => declaration.status === 'UNBOUND_PENDING_CANONICAL_MAPPING').length,
      exactLocationDeclarationCount: locationDeclarations.filter(declaration => declaration.status.startsWith('BOUND_EXACT_')).length,
      pendingLocationDeclarationCount: locationDeclarations.filter(declaration => declaration.status === 'UNBOUND_PENDING_CANONICAL_MAPPING').length
    },
    unitEnvelope: {
      allowed: clone(allowedUnits),
      forbidden: clone(forbiddenUnits)
    },
    evidenceGateProfile,
    packInventories,
    templates,
    bindings
  };
}

const expectedCatalog = buildExpectedCatalog(sourceCatalog);
if (process.argv.includes('--emit-catalog')) {
  process.stdout.write(JSON.stringify(expectedCatalog, null, 2) + '\n');
  process.exit(0);
}

function blocked(code, detail) {
  return { status: 'BLOCKED', code, detail, runtimeReady: false };
}

function preflight(catalog) {
  if (!catalog || catalog.schemaVersion !== 1 || catalog.catalogId !== 'massfront-stage10-interior-layout-bindings-v1' || catalog.status !== 'PLANNED' || catalog.sourceOnly !== true || catalog.matrixPolicy !== 'ALL_PACKS_X_ALL_EXACT_TEMPLATES_WITH_SOURCE_GAPS_EXPLICIT') {
    return blocked('LAYOUT_BINDINGS_CATALOG_INVALID', 'The source-only Stage 10 binding catalog contract changed.');
  }
  if (catalog.runtimeReady !== false) return blocked('LAYOUT_BINDINGS_RUNTIME_ENABLED', 'The source-only catalog may not become runtime ready.');
  if (catalog.generatedAssetClaims !== false) return blocked('LAYOUT_BINDINGS_ASSET_CLAIM_INVALID', 'The catalog may not claim generated assets exist.');
  if (!same(catalog.sourceRefs, expectedCatalog.sourceRefs) || !same(catalog.unitEnvelope, expectedCatalog.unitEnvelope)) return blocked('LAYOUT_BINDINGS_CATALOG_INVALID', 'Source references or the restricted unit envelope drifted.');
  if (!same(catalog.authorityContract, expectedCatalog.authorityContract) || catalog.authorityContract.planetAuthority !== 'EXPLORATION_MODULE_SHOWCASE_SYSTEMS' || catalog.authorityContract.aliasInferenceAllowed !== false) {
    return blocked('LAYOUT_BINDINGS_AUTHORITY_INVALID', 'The theatre and SHOWCASE_SYSTEMS authority must remain exact and alias-free.');
  }
  if (!same(catalog.coverage, expectedCatalog.coverage) || catalog.coverage.packCount !== 6 || catalog.coverage.templateCount !== 4 || catalog.coverage.bindingCount !== 24 || catalog.coverage.sourceDeclaredBindingCount !== 22 || catalog.coverage.sourceGapBindingCount !== 2 || catalog.coverage.authorityBoundPackCount !== 3 || catalog.coverage.authorityPendingPackCount !== 3 || catalog.coverage.authorityBoundBindingCount !== 12 || catalog.coverage.authorityPendingBindingCount !== 12 || catalog.coverage.exactPlanetDeclarationCount !== 3 || catalog.coverage.pendingPlanetDeclarationCount !== 3 || catalog.coverage.exactLocationDeclarationCount !== 15 || catalog.coverage.pendingLocationDeclarationCount !== 3) {
    return blocked('LAYOUT_BINDINGS_COVERAGE_INVALID', 'Coverage must remain six packs by four templates with two explicit source declaration gaps.');
  }
  if (!Array.isArray(catalog.packInventories) || catalog.packInventories.length !== sourceCatalog.packs.length) return blocked('LAYOUT_BINDINGS_PACK_INVENTORY_INVALID', 'Six source pack inventories are required.');
  for (let index = 0; index < sourceCatalog.packs.length; index++) {
    const actual = catalog.packInventories[index];
    const expected = expectedCatalog.packInventories[index];
    if (!actual || !same(actual.authorityResolution, expected.authorityResolution)) return blocked('LAYOUT_BINDINGS_AUTHORITY_INVALID', 'Unresolved planet or location declarations may not be promoted or aliased.');
    if (!same(actual, expected) || actual.memberCount !== 15 || actual.members.length !== 15 || actual.runtimeReady !== false || actual.status !== 'PLANNED' || actual.memberInventoryHash !== sha256(actual.members) || actual.geometryContractHash !== sha256(actual.geometryContracts) || actual.socketContractHash !== sha256(actual.socketContracts) || actual.inventoryHash !== sha256({ members: actual.members, geometryContracts: actual.geometryContracts, socketContracts: actual.socketContracts })) {
      return blocked('LAYOUT_BINDINGS_PACK_INVENTORY_INVALID', 'Pack IDs, locations, complete members, socket geometry, or archetype geometry contracts drifted from source.');
    }
  }
  if (!Array.isArray(catalog.templates) || catalog.templates.length !== sourceCatalog.mapTemplates.length) return blocked('LAYOUT_BINDINGS_TEMPLATE_INVALID', 'Four exact source templates are required.');
  for (let index = 0; index < sourceCatalog.mapTemplates.length; index++) {
    const actual = catalog.templates[index];
    const expected = expectedCatalog.templates[index];
    const topologyResult = topologyPreflight(actual && actual.templateId);
    if (!same(actual, expected) || !actual || topologyResult.status !== 'AUTHORING_CANDIDATE' || topologyResult.topologyHash !== actual.topologyHash) {
      return blocked('LAYOUT_BINDINGS_TEMPLATE_INVALID', 'Template bounds, topology, route needs, cutaway, or performance budget drifted.');
    }
  }
  if (!same(catalog.evidenceGateProfile, expectedCatalog.evidenceGateProfile) || catalog.evidenceGateProfile.gates.length !== 9) {
    return blocked('LAYOUT_BINDINGS_EVIDENCE_GATES_INVALID', 'All source-matched LOD, socket, collision, nav, destruction, performance, and cutaway gates are required.');
  }
  if (!Array.isArray(catalog.bindings) || catalog.bindings.length !== 24) return blocked('LAYOUT_BINDINGS_MATRIX_INVALID', 'The complete 6 x 4 binding matrix is required.');
  const expectedById = Object.fromEntries(expectedCatalog.bindings.map(binding => [binding.bindingId, binding]));
  const seen = new Set();
  for (const binding of catalog.bindings) {
    if (!binding || typeof binding.bindingId !== 'string' || seen.has(binding.bindingId) || !expectedById[binding.bindingId]) return blocked('LAYOUT_BINDINGS_MATRIX_INVALID', 'Binding IDs must be unique and cover the exact Cartesian matrix.');
    seen.add(binding.bindingId);
    const expected = expectedById[binding.bindingId];
    if (binding.runtimeReady !== false) return blocked('LAYOUT_BINDINGS_RUNTIME_ENABLED', 'No source binding may become runtime ready.');
    if (binding.generatedAssetsPresent !== false || !Array.isArray(binding.assetPaths) || binding.assetPaths.length) return blocked('LAYOUT_BINDINGS_ASSET_CLAIM_INVALID', 'Bindings may not claim generated files or asset paths.');
    if (binding.packId !== expected.packId || binding.inventoryRef !== expected.inventoryRef || binding.inventoryMemberCount !== 15 || binding.memberInventoryHash !== expected.memberInventoryHash || binding.geometryContractHash !== expected.geometryContractHash || binding.socketContractHash !== expected.socketContractHash || binding.inventoryHash !== expected.inventoryHash || binding.faction !== expected.faction || !same(binding.planetIds, expected.planetIds) || !same(binding.locationIds, expected.locationIds) || binding.templateId !== expected.templateId || binding.sizeClass !== expected.sizeClass || !same(binding.playableBoundsMeters, expected.playableBoundsMeters)) {
      return blocked('LAYOUT_BINDINGS_MATRIX_INVALID', 'Pack, location, inventory, or template references drifted.');
    }
    if (binding.sourceTemplateDeclaration !== expected.sourceTemplateDeclaration) return blocked('LAYOUT_BINDINGS_SOURCE_DECLARATION_INVALID', 'Source-declared compatibility and source gaps must remain explicit.');
    if (!same(binding.authorityResolution, expected.authorityResolution) || binding.status !== expected.status || !same(binding.readinessBlockers, expected.readinessBlockers)) return blocked('LAYOUT_BINDINGS_AUTHORITY_INVALID', 'Unresolved planet/location declarations must remain unbound pending canonical mapping.');
    if (!same(binding.unitRestrictions, expected.unitRestrictions)) return blocked('LAYOUT_BINDINGS_UNIT_RESTRICTION_INVALID', 'Heavy vehicles, heavy mechs, artillery, air, naval, and titans must remain forbidden.');
    const inventory = catalog.packInventories.find(item => item.inventoryId === binding.inventoryRef);
    const suppliedSocketProfiles = new Set(inventory ? inventory.members.flatMap(member => member.sockets.map(socket => socket.profile)) : []);
    const needs = binding.routeSocketNeeds;
    if (!same(needs, expected.routeSocketNeeds) || binding.minimumTurningPockets !== expected.minimumTurningPockets || binding.minimumInfantryBranches !== expected.minimumInfantryBranches || !suppliedSocketProfiles.has(needs.personnel.profile) || !suppliedSocketProfiles.has(needs.mixed.profile) || (needs.vertical.required && !suppliedSocketProfiles.has(needs.vertical.profile))) {
      return blocked('LAYOUT_BINDINGS_ROUTE_SOCKET_INVALID', 'Mixed, personnel, vertical, turning, or infantry route/socket needs drifted.');
    }
    if (!same(binding.cutaway, expected.cutaway)) return blocked('LAYOUT_BINDINGS_CUTAWAY_INVALID', 'Camera cutaway must preserve objectives and navigation.');
    if (!same(binding.destruction, expected.destruction)) return blocked('LAYOUT_BINDINGS_DESTRUCTION_INVALID', 'Destruction must remain authored, deterministic, atomic, and independent of physics fragments.');
    if (binding.evidenceProfileId !== expected.evidenceProfileId || !binding.evidence || binding.evidence.state !== 'MISSING' || !Array.isArray(binding.evidence.passedGateIds) || binding.evidence.passedGateIds.length || !Array.isArray(binding.evidence.artifactPaths) || binding.evidence.artifactPaths.length) {
      return blocked('LAYOUT_BINDINGS_EVIDENCE_STATE_INVALID', 'Every binding must remain blocked with no fabricated production evidence.');
    }
  }
  if (seen.size !== Object.keys(expectedById).length) return blocked('LAYOUT_BINDINGS_MATRIX_INVALID', 'The binding matrix is incomplete.');
  return {
    status: 'PASS_SOURCE_ONLY',
    code: 'LAYOUT_BINDINGS_PREFLIGHT_PASS',
    runtimeReady: false,
    generatedAssetClaims: false,
    catalogHash: sha256(catalog),
    coverage: clone(catalog.coverage)
  };
}

const catalogText = await fs.readFile(bindingPath, 'utf8');
const catalog = JSON.parse(catalogText);
assert.deepEqual(catalog, expectedCatalog, 'static binding catalog must equal the deterministic source-derived catalog');
const first = preflight(catalog);
const second = preflight(JSON.parse(catalogText));
assert.deepEqual(first, second, 'preflight must be deterministic');
assert.equal(first.status, 'PASS_SOURCE_ONLY');
assert.equal(first.code, 'LAYOUT_BINDINGS_PREFLIGHT_PASS');
assert.equal(first.runtimeReady, false);
assert.equal(first.generatedAssetClaims, false);

function runFault(name, mutation, expectedCode) {
  const candidate = clone(catalog);
  mutation(candidate);
  const result = preflight(candidate);
  assert.equal(result.status, 'BLOCKED', `${name} must fail closed`);
  assert.equal(result.code, expectedCode, `${name} returned the wrong fail-closed code`);
  assert.equal(result.runtimeReady, false, `${name} may never enable runtime content`);
  return { name, expectedCode, actualCode: result.code };
}

function runTopologySupportDroneFault() {
  const context = vm.createContext({});
  new vm.Script(topologyText, { filename: topologyPath }).runInContext(context);
  vm.runInContext("Stage10InteriorTopologyV1.templates.interior_xs_breach_40x40.unitEnvelope.allowed = Stage10InteriorTopologyV1.templates.interior_xs_breach_40x40.unitEnvelope.allowed.filter(unit => unit !== 'support_drone')", context);
  const result = JSON.parse(vm.runInContext("JSON.stringify(mfPreflightStage10InteriorTopologyV1('interior_xs_breach_40x40'))", context));
  assert.equal(result.status, 'BLOCKED', 'topology support-drone removal must fail closed');
  assert.equal(result.code, 'INTERIOR_TOPOLOGY_UNIT_ENVELOPE_INVALID');
  assert.equal(result.runtimeReady, false);
  return { name: 'topology-support-drone-removal', expectedCode: 'INTERIOR_TOPOLOGY_UNIT_ENVELOPE_INVALID', actualCode: result.code };
}

const injectedFaults = [
  runTopologySupportDroneFault(),
  runFault('catalog-id-drift', candidate => { candidate.catalogId = 'wrong'; }, 'LAYOUT_BINDINGS_CATALOG_INVALID'),
  runFault('catalog-runtime-enabled', candidate => { candidate.runtimeReady = true; }, 'LAYOUT_BINDINGS_RUNTIME_ENABLED'),
  runFault('catalog-generated-claim', candidate => { candidate.generatedAssetClaims = true; }, 'LAYOUT_BINDINGS_ASSET_CLAIM_INVALID'),
  runFault('authority-alias-inference', candidate => { candidate.authorityContract.aliasInferenceAllowed = true; }, 'LAYOUT_BINDINGS_AUTHORITY_INVALID'),
  runFault('authority-index-invention', candidate => { candidate.authorityContract.exactShowcasePlanetIds.push('invented_planet'); }, 'LAYOUT_BINDINGS_AUTHORITY_INVALID'),
  runFault('coverage-drift', candidate => { candidate.coverage.bindingCount = 23; }, 'LAYOUT_BINDINGS_COVERAGE_INVALID'),
  runFault('unresolved-pack-authority-promotion', candidate => { const declaration = candidate.packInventories[0].authorityResolution.planetDeclarations[0]; declaration.status = 'BOUND_EXACT_TYPED_PLANET'; declaration.authorityMatches.push({ authorityKind: 'SHOWCASE_PLANET', authorityId: declaration.sourceId, parentId: null }); declaration.mismatchReason = null; }, 'LAYOUT_BINDINGS_AUTHORITY_INVALID'),
  runFault('system-as-planet-promotion', candidate => { const declaration = candidate.packInventories[4].authorityResolution.planetDeclarations[0]; declaration.status = 'BOUND_EXACT_TYPED_PLANET'; declaration.authorityMatches.push({ authorityKind: 'SHOWCASE_SYSTEM', authorityId: 'veyra', parentId: null }); declaration.mismatchReason = null; }, 'LAYOUT_BINDINGS_AUTHORITY_INVALID'),
  runFault('typed-location-parent-drift', candidate => { candidate.packInventories[1].authorityResolution.locationDeclarations[1].authorityMatches[0].parentId = 'pyraeth'; }, 'LAYOUT_BINDINGS_AUTHORITY_INVALID'),
  runFault('inventory-member-loss', candidate => { candidate.packInventories[0].members.pop(); candidate.packInventories[0].memberCount = 14; }, 'LAYOUT_BINDINGS_PACK_INVENTORY_INVALID'),
  runFault('inventory-asset-substitution', candidate => { candidate.packInventories[0].members[0].assetId = 'invented_asset'; }, 'LAYOUT_BINDINGS_PACK_INVENTORY_INVALID'),
  runFault('inventory-dimension-drift', candidate => { candidate.packInventories[0].members[0].sizeMeters[0] = 4.5; }, 'LAYOUT_BINDINGS_PACK_INVENTORY_INVALID'),
  runFault('inventory-socket-id-drift', candidate => { candidate.packInventories[0].members[0].sockets[0].id = 'invented_socket'; }, 'LAYOUT_BINDINGS_PACK_INVENTORY_INVALID'),
  runFault('inventory-socket-face-drift', candidate => { candidate.packInventories[0].members[0].sockets[0].face = 'up'; }, 'LAYOUT_BINDINGS_PACK_INVENTORY_INVALID'),
  runFault('inventory-socket-offset-drift', candidate => { candidate.packInventories[0].members[0].sockets[0].offsetMeters[2] = 2.5; }, 'LAYOUT_BINDINGS_PACK_INVENTORY_INVALID'),
  runFault('geometry-lod-drift', candidate => { candidate.packInventories[0].geometryContracts.room_4x4.lodTriangleBudget.lod0 = 12001; }, 'LAYOUT_BINDINGS_PACK_INVENTORY_INVALID'),
  runFault('geometry-collision-drift', candidate => { candidate.packInventories[0].geometryContracts.room_4x4.collision.maximumHulls = 9; }, 'LAYOUT_BINDINGS_PACK_INVENTORY_INVALID'),
  runFault('geometry-nav-drift', candidate => { candidate.packInventories[0].geometryContracts.room_4x4.nav.clearanceRule = 'invented'; }, 'LAYOUT_BINDINGS_PACK_INVENTORY_INVALID'),
  runFault('socket-contract-drift', candidate => { candidate.packInventories[0].socketContracts.interior_personnel_4x4.clearWidth = 3.1; }, 'LAYOUT_BINDINGS_PACK_INVENTORY_INVALID'),
  runFault('location-id-drift', candidate => { candidate.packInventories[1].locationIds[0] = 'invented_location'; }, 'LAYOUT_BINDINGS_PACK_INVENTORY_INVALID'),
  runFault('template-bounds-drift', candidate => { candidate.templates[0].playableBoundsMeters[0] = 41; }, 'LAYOUT_BINDINGS_TEMPLATE_INVALID'),
  runFault('evidence-gate-loss', candidate => { candidate.evidenceGateProfile.gates.pop(); }, 'LAYOUT_BINDINGS_EVIDENCE_GATES_INVALID'),
  runFault('binding-loss', candidate => { candidate.bindings.pop(); }, 'LAYOUT_BINDINGS_MATRIX_INVALID'),
  runFault('binding-duplicate', candidate => { candidate.bindings[1].bindingId = candidate.bindings[0].bindingId; }, 'LAYOUT_BINDINGS_MATRIX_INVALID'),
  runFault('binding-runtime-enabled', candidate => { candidate.bindings[0].runtimeReady = true; }, 'LAYOUT_BINDINGS_RUNTIME_ENABLED'),
  runFault('binding-generated-path-claim', candidate => { candidate.bindings[0].generatedAssetsPresent = true; candidate.bindings[0].assetPaths.push('invented.glb'); }, 'LAYOUT_BINDINGS_ASSET_CLAIM_INVALID'),
  runFault('source-gap-promoted', candidate => { const binding = candidate.bindings.find(item => item.sourceTemplateDeclaration === 'MISSING_FROM_PACK_SOURCE'); binding.sourceTemplateDeclaration = 'DECLARED'; binding.status = 'BLOCKED_EVIDENCE'; }, 'LAYOUT_BINDINGS_SOURCE_DECLARATION_INVALID'),
  runFault('unresolved-binding-authority-promotion', candidate => { candidate.bindings[0].status = 'BLOCKED_EVIDENCE'; candidate.bindings[0].authorityResolution.status = 'BOUND_EXACT_AUTHORITY'; }, 'LAYOUT_BINDINGS_AUTHORITY_INVALID'),
  runFault('uga-authority-blocker-removal', candidate => { candidate.bindings[0].readinessBlockers = candidate.bindings[0].readinessBlockers.filter(blocker => blocker !== 'CANONICAL_PLANET_LOCATION_MAPPING_REQUIRED'); }, 'LAYOUT_BINDINGS_AUTHORITY_INVALID'),
  runFault('support-drone-removal', candidate => { candidate.bindings[0].unitRestrictions.allowed = candidate.bindings[0].unitRestrictions.allowed.filter(unit => unit !== 'support_drone'); }, 'LAYOUT_BINDINGS_UNIT_RESTRICTION_INVALID'),
  runFault('heavy-unit-admission', candidate => { candidate.bindings[0].unitRestrictions.allowed.push('heavy_vehicle'); }, 'LAYOUT_BINDINGS_UNIT_RESTRICTION_INVALID'),
  runFault('mixed-route-width-loss', candidate => { candidate.bindings[0].routeSocketNeeds.mixed.clearWidth = 6.3; }, 'LAYOUT_BINDINGS_ROUTE_SOCKET_INVALID'),
  runFault('vertical-socket-loss', candidate => { const binding = candidate.bindings.find(item => item.templateId === 'interior_small_multilevel_80x64'); binding.routeSocketNeeds.vertical.required = false; }, 'LAYOUT_BINDINGS_ROUTE_SOCKET_INVALID'),
  runFault('cutaway-objective-loss', candidate => { candidate.bindings[0].cutaway.preserveLayers = ['extraction', 'portal', 'navigation']; }, 'LAYOUT_BINDINGS_CUTAWAY_INVALID'),
  runFault('critical-state-fabrication', candidate => { candidate.bindings[0].destruction.criticalStateBinding = { sourceState: 'damaged', status: 'BOUND', runtimeFallbackAllowed: true }; }, 'LAYOUT_BINDINGS_DESTRUCTION_INVALID'),
  runFault('physics-fragment-authority', candidate => { candidate.bindings[0].destruction.physicsFragmentsAreNavigationAuthority = true; }, 'LAYOUT_BINDINGS_DESTRUCTION_INVALID'),
  runFault('fabricated-evidence-pass', candidate => { candidate.bindings[0].evidence.state = 'PASS_WITH_EVIDENCE'; candidate.bindings[0].evidence.passedGateIds.push('generated-source-provenance'); candidate.bindings[0].evidence.artifactPaths.push('invented/evidence.json'); }, 'LAYOUT_BINDINGS_EVIDENCE_STATE_INVALID')
];

const declaredBindings = catalog.bindings.filter(binding => binding.sourceTemplateDeclaration === 'DECLARED');
const sourceGapBindings = catalog.bindings.filter(binding => binding.sourceTemplateDeclaration === 'MISSING_FROM_PACK_SOURCE');
const authorityPendingBindings = catalog.bindings.filter(binding => binding.status === 'UNBOUND_PENDING_CANONICAL_MAPPING');
const result = {
  status: 'PASS',
  catalogHash: first.catalogHash,
  packCount: catalog.coverage.packCount,
  templateCount: catalog.coverage.templateCount,
  bindingCount: catalog.coverage.bindingCount,
  inventoryMemberCount: catalog.packInventories.reduce((sum, inventory) => sum + inventory.memberCount, 0),
  sourceDeclaredBindingCount: declaredBindings.length,
  sourceGapBindingCount: sourceGapBindings.length,
  sourceGapBindingIds: sourceGapBindings.map(binding => binding.bindingId),
  authorityPendingBindingCount: authorityPendingBindings.length,
  authorityCoverage: {
    exactPlanetDeclarations: catalog.coverage.exactPlanetDeclarationCount,
    pendingPlanetDeclarations: catalog.coverage.pendingPlanetDeclarationCount,
    exactLocationDeclarations: catalog.coverage.exactLocationDeclarationCount,
    pendingLocationDeclarations: catalog.coverage.pendingLocationDeclarationCount
  },
  allowedUnitClasses: clone(catalog.unitEnvelope.allowed),
  topologyHashes: Object.fromEntries(catalog.templates.map(template => [template.templateId, template.topologyHash])),
  inventoryHashes: Object.fromEntries(catalog.packInventories.map(inventory => [inventory.packId, inventory.inventoryHash])),
  evidenceGateCount: catalog.evidenceGateProfile.gates.length,
  injectedFaultCount: injectedFaults.length
};
console.log(`PASS Stage 10 interior layout bindings: ${result.packCount} packs x ${result.templateCount} templates = ${result.bindingCount} bindings`);
console.log(JSON.stringify(result, null, 2));
