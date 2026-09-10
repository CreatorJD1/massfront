import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createGroundOperationRequestV2 } from '../modules/space_exploration/src/domain/host_contract.js';
import { beginGroundOperation } from '../modules/space_exploration/src/domain/ground_operation.js';
import { CATALOG_VERSION, MISSION_CATALOG, getUgaGroundAreaForMission } from '../modules/space_exploration/src/domain/catalog.js';
import { createGroundOperation } from '../modules/space_exploration/src/domain/ground_operation.js';
import { createShowcaseReadyDomainState } from '../modules/space_exploration/src/domain/state_store.js';
import { createMassfrontGalacticEntryTicket } from '../modules/space_exploration/src/host/massfront_solo_host.js';
import { loadProductionCommanderRosterSnapshot } from '../modules/space_exploration/tools/tests/production-commander-roster.fixture.mjs';

const source = fs.readFileSync(new URL('../src/galactic-operations.js', import.meta.url), 'utf8');
const metaSource = fs.readFileSync(new URL('../src/game/meta.js', import.meta.url), 'utf8');
assert.doesNotMatch(source, /\b(?:import|export)\s/, 'classic bridge source must not declare modules');
assert.doesNotMatch(source, /sessClear\s*\(/, 'Galactic bridge must preserve an existing dropped-session snapshot');
const goalBlock = metaSource.match(/const GOALS=\[([\s\S]*?)\];/);
assert.ok(goalBlock, 'base RTS goal registry must remain readable');
const registeredGoalIds = new Set([...goalBlock[1].matchAll(/id:'([^']+)'/g)].map(match => match[1]));

let idleBillboardImpressions = 0;
const ordinaryStandardGoal = Object.freeze({ id: 'annihilate', em: '\u2620', nm: 'Annihilation', ds: 'Destroy every enemy Commander' });
const context = {
  console,
  document: { getElementById: () => null, createElement: () => ({}) },
  location: { search: '', href: '' },
  sessionStorage: { getItem: () => null, setItem: () => {} },
  setTimeout,
  clearTimeout,
  requestAnimationFrame: callback => callback(0),
  goalDef: () => ordinaryStandardGoal,
  AD_PROVIDER: { reportImpression: () => { idleBillboardImpressions += 1; return 'standard-impression'; } }
};
context.window = context;
vm.createContext(context);
vm.runInContext(source, context, { filename: 'src/galactic-operations.js' });

const api = context.__MF_GALACTIC_BRIDGE;
assert.ok(Object.isFrozen(api));
assert.equal(api.active, false);
assert.equal(api.status, 'idle');
assert.equal(context.AD_PROVIDER.reportImpression({}, {}), 'standard-impression');
assert.equal(idleBillboardImpressions, 1, 'ordinary billboard impressions must remain unchanged outside Galactic play');
assert.equal(context.goalDef(), ordinaryStandardGoal, 'ordinary Standard goalDef must remain unchanged outside an active Galactic operation');

const now = Date.now();
const profileId = 'p1';
const productionRoster = await loadProductionCommanderRosterSnapshot();
const ticket = createMassfrontGalacticEntryTicket(profileId, {
  issuedAt: now,
  ttlMs: 300_000,
  commanderRosterSnapshot: productionRoster,
  commanderRosterFingerprint: productionRoster.fingerprint,
  commissioning: { factionId: 'nova', commanderId: 'nova_kai' }
});
assert.equal(api.validateEntryTicket(ticket, now, profileId).ok, true);
assert.equal(api.validateEntryTicket({ ...ticket, profileId: 'p2' }, now, profileId).ok, false);
assert.equal(api.validateEntryTicket({ ...ticket, issuedAt: now + 1 }, now, profileId).ok, false);
assert.equal(api.validateEntryTicket({ ...ticket, expiresAt: now }, now, profileId).ok, false);

const state = createShowcaseReadyDomainState();
state.profileId = profileId;
const { operation } = beginGroundOperation(state, {
  missionId: 'uga_pale_bloom',
  factionId: 'nova',
  commanderId: 'nova_holt',
  mapId: 'karak_meridian_quarantine_standard',
  deploymentManifest: {
    units: [{ id: 'recon_team', count: 1 }, { id: 'line_section', count: 1 }, { id: 'armored_element', count: 1 }],
    structures: [{ id: 'field_relay', count: 1 }],
    modIds: ['survey_link', 'repair_nanites']
  }
});
const nonce = '0123456789abcdef0123456789abcdef';
const request = createGroundOperationRequestV2(operation, {
  nonce,
  accountId: profileId,
  issuedAt: now,
  ttlMs: 300_000,
  contentVersion: `catalog-${CATALOG_VERSION}`
});
const requestValidation = api.validateRequest(request, nonce, profileId, now + 1, ticket);
assert.equal(requestValidation.ok, true, requestValidation.issues.join(','));
assert.equal(api.validateDeploymentContract(operation).ok, true);
const operationLoadScreen = api.describeOperationLoadScreen(operation, operation.battlefield.location);
assert.deepEqual(JSON.parse(JSON.stringify(operationLoadScreen)), {
  title: 'Transit Court',
  eyebrow: 'DEPLOYING TO  ·  Meridian K-4',
  poi: 'Meridian Quarantine',
  hook: 'UGA CONTAINMENT OPERATION',
  chips: [
    { key: 'SYSTEM', value: 'Karak' },
    { key: 'SCALE', value: 'standard' },
    { key: 'THREAT', value: 'T3' }
  ]
});
assert.doesNotMatch(JSON.stringify(operationLoadScreen), /Vespera|Nordhall|Pyraeth|vespera_|nordhall_|pyraeth_/i,
  'UGA loading copy must not expose the internal RTS terrain template');

// The classic receiver is an independent trust boundary. Lock its compact
// mission authority to every authored module mission so the two documents
// cannot drift back to a one-mission/one-side-only release.
state.missions.uga_pale_bloom.completions = 1;
state.missions.uga_silent_spine.completions = 1;
let parityIndex = 0;
for (const mission of Object.values(MISSION_CATALOG)) {
  const parityOperation = createGroundOperation(state, {
    missionId: mission.id,
    factionId: mission.contractFactionId || 'nova',
    mapId: getUgaGroundAreaForMission(mission.id).recommendedMapId
  });
  const parityNonce = `stage9_parity_${String(parityIndex).padStart(4, '0')}`;
  const parityRequest = createGroundOperationRequestV2(parityOperation, {
    nonce: parityNonce,
    accountId: profileId,
    issuedAt: now,
    ttlMs: 300_000,
    contentVersion: `catalog-${CATALOG_VERSION}`
  });
  const parityValidation = api.validateRequest(parityRequest, parityNonce, profileId, now + 1, ticket);
  assert.equal(parityValidation.ok, true, `${mission.id}: ${parityValidation.issues.join(',')}`);
  assert.deepEqual(
    JSON.parse(JSON.stringify(api.groundAreaForMission(mission.id))),
    JSON.parse(JSON.stringify(getUgaGroundAreaForMission(mission.id))),
    `${mission.id} classic receiver ground-area authority must match the module catalog`
  );
  const resolvedBattlefield = api.resolveOperationBattlefield(parityOperation, `catalog-${CATALOG_VERSION}`);
  assert.deepEqual(JSON.parse(JSON.stringify(resolvedBattlefield.playerLocation)), parityOperation.battlefield.location,
    `${mission.id} must preserve its player-facing battlefield identity`);
  assert.equal(resolvedBattlefield.runtimeMapId,
    getUgaGroundAreaForMission(mission.id).maps.find(map => map.id === parityOperation.battlefield.location.mapId).runtimeTemplateMapId);
  assert.equal(resolvedBattlefield.legacyRecovered, false);
  assert.equal(api.validateDeploymentContract(parityOperation).ok, true, `${mission.id} deployment contract`);
  const tacticalObjective = api.resolveTacticalObjective(parityOperation);
  assert.ok(registeredGoalIds.has(tacticalObjective.id), `${mission.id} must resolve to a registered base RTS goal`);
  assert.equal(tacticalObjective.id, mission.missionType === 'uga_brood_purge' ? 'purge' : 'domination', `${mission.id} tactical semantics`);
  assert.equal(tacticalObjective.objectiveType, mission.objective.type, `${mission.id} authored objective identity`);
  assert.ok(tacticalObjective.hud && tacticalObjective.nm && tacticalObjective.ds, `${mission.id} player-facing objective copy`);
  parityIndex += 1;
}
assert.equal(parityIndex, 9);
const mirror = {
  schemaVersion: 2,
  kind: 'MassfrontGalacticRequestMirrorV2',
  adapter: 'massfront-solo-v2',
  commanderRosterFingerprint: productionRoster.fingerprint,
  nonce,
  accountId: profileId,
  operationId: operation.operationId,
  request
};
assert.equal(api.validateRequestMirror(mirror, nonce, profileId, now + 1, ticket).ok, true);

const tampered = structuredClone(request);
tampered.operation.missionId = 'uga_hive_heart';
assert.equal(api.validateRequest(tampered, nonce, profileId, now + 1, ticket).ok, false);
assert.ok(api.validateRequest(tampered, nonce, profileId, now + 1, ticket).issues.includes('REQUEST_CHECKSUM_INVALID'));
const relabeledBattlefield = structuredClone(request);
relabeledBattlefield.operation.battlefield.location.display.mapName = 'Gloam Ramparts';
relabeledBattlefield.checksum = api.checksum(relabeledBattlefield);
const relabeledValidation = api.validateRequest(relabeledBattlefield, nonce, profileId, now + 1, ticket);
assert.equal(relabeledValidation.ok, false);
assert.ok(relabeledValidation.issues.includes('OPERATION_BATTLEFIELD_INVALID'));
const legacyRequest = structuredClone(request);
legacyRequest.contentVersion = 'catalog-7';
delete legacyRequest.operation.battlefield.location;
legacyRequest.checksum = api.checksum(legacyRequest);
assert.equal(api.validateRequest(legacyRequest, nonce, profileId, now + 1, ticket).ok, true,
  'an already-pending catalog-7 operation remains recoverable');
const legacyBattlefield = api.resolveOperationBattlefield(legacyRequest.operation, legacyRequest.contentVersion);
assert.equal(legacyBattlefield.legacyRecovered, true);
assert.equal(legacyBattlefield.playerLocation.mapId, 'karak_meridian_quarantine_standard');
assert.equal(api.validateRequestMirror({ ...mirror, operationId: 'foreign' }, nonce, profileId, now + 1, ticket).ok, false);
const overCapacityOperation = structuredClone(operation);
overCapacityOperation.deploymentManifest.units[0].count = 8;
overCapacityOperation.configuration.deploymentManifest = structuredClone(overCapacityOperation.deploymentManifest);
assert.equal(api.validateDeploymentContract(overCapacityOperation).ok, false);

for (const [id, delta] of Object.entries({ containment: 8, methodical: 7, rapid: 2 })) {
  const value = structuredClone(operation);
  value.doctrineId = id;
  value.configuration.doctrineId = id;
  value.configuration.approach = id;
  const effects = api.describeOperationEffects(value);
  assert.equal(effects.scoreApplied.find(item => item.source === 'doctrine').delta, delta, `doctrine ${id}`);
}
for (const [id, delta] of Object.entries({ survey_drones: 4, field_lab: 2, medevac: 1, heavy_lift: 5 })) {
  const value = structuredClone(operation);
  value.supportId = id;
  value.configuration.supportId = id;
  value.configuration.support = id;
  const effects = api.describeOperationEffects(value);
  assert.equal(effects.scoreApplied.find(item => item.source === 'support').delta, delta, `support ${id}`);
  assert.equal(effects.matchApplied.some(item => item.source === 'support'), false, `support match effect ${id}`);
}
for (const id of ['survey_link', 'repair_nanites', 'medical_cache']) {
  const value = structuredClone(operation);
  value.deploymentManifest.modIds = [id];
  value.configuration.deploymentManifest = structuredClone(value.deploymentManifest);
  const effects = api.describeOperationEffects(value);
  if (id === 'medical_cache') {
    assert.deepEqual(JSON.parse(JSON.stringify(effects.moduleResultApplied)), [{
      layer: 'module-result', source: 'mod', id, effect: 'injury-severity-minus-one'
    }]);
    assert.equal(effects.matchApplied.some(item => item.source === 'mod'), false);
  } else {
    assert.equal(effects.matchApplied.some(item => item.id === id), true, `mod match effect ${id}`);
    assert.equal(effects.moduleResultApplied.length, 0);
  }
}

const report = {
  outcome: 'victory',
  score: 88,
  primaryObjectiveComplete: true,
  secondaryObjectivesComplete: 2,
  injuryBand: 'light',
  injuredPersonnelIds: [operation.specialistIds[0]]
};
assert.equal(api.validateTacticalReport(report, operation).ok, true);
assert.equal(api.validateTacticalReport({ ...report, injuredPersonnelIds: ['not_on_team'] }, operation).ok, false);
const tacticalMirror = {
  schemaVersion: 1,
  kind: 'MassfrontGalacticTacticalReportV1',
  nonce,
  accountId: profileId,
  operationId: operation.operationId,
  issuedAt: now + 2,
  report
};
tacticalMirror.checksum = api.checksum(tacticalMirror);
assert.equal(api.validateResultMirror(tacticalMirror, nonce, profileId, request, now + 3).ok, true);
assert.equal(api.validateResultMirror({ ...tacticalMirror, checksum: '00000000' }, nonce, profileId, request, now + 3).ok, false);

const rejectedMirror = structuredClone(mirror);
rejectedMirror.adapter = 'massfront-solo-v1';
let rejectedWrites = 0;
let rejectedSkirmishes = 0;
const rejectedSession = new Map([
  ['massfront.galactic.entry.v1', JSON.stringify(ticket)],
  [`massfront.galactic.request.v1.${nonce}`, JSON.stringify(rejectedMirror)]
]);
const rejectedRuntime = {
  console,
  document: { getElementById: () => null, createElement: () => ({}), querySelectorAll: () => [] },
  location: { search: `?groundOperation=${nonce}`, href: '' },
  sessionStorage: {
    getItem: key => rejectedSession.get(key) ?? null,
    setItem: () => { rejectedWrites += 1; }
  },
  setTimeout,
  clearTimeout,
  requestAnimationFrame: callback => callback(0),
  bootConfirmed: true,
  __MF_BUILD_HAS_GALACTIC_EXPLORATION: true,
  PROFILES: { active: profileId },
  META: { settings: { experimentalExploration: false } },
  newSkirmish: () => { rejectedSkirmishes += 1; }
};
rejectedRuntime.window = rejectedRuntime;
vm.createContext(rejectedRuntime);
vm.runInContext(source, rejectedRuntime, { filename: 'src/galactic-operations.js' });
await new Promise(resolve => setTimeout(resolve, 20));
assert.equal(rejectedRuntime.__MF_GALACTIC_BRIDGE.status, 'rejected');
assert.match(rejectedRuntime.__MF_GALACTIC_BRIDGE.reason, /REQUEST_MIRROR_ADAPTER_INVALID/);
assert.equal(rejectedWrites, 0, 'invalid production mirrors must fail before any bridge write');
assert.equal(rejectedSkirmishes, 0, 'invalid production mirrors must fail before RTS state construction');

// Execute the actual classic-script takeover against a minimal base runtime.
// This proves the authored module manifest becomes real RTS units/structures,
// while base-career persistence seams remain untouched.
const session = new Map([
  ['massfront.galactic.entry.v1', JSON.stringify(ticket)],
  [`massfront.galactic.request.v1.${nonce}`, JSON.stringify(mirror)]
]);
const resultKey = `massfront.galactic.result.v1.${nonce}`;
let failResultWrites = 1;
let failedVictoryBytes = '';
const spawnedUnits = [], spawnedStructures = [], toasts = [];
const createLoadNode = () => ({
  className: '', textContent: '', style: {}, children: [],
  appendChild(child) { this.children.push(child); return child; }
});
const loadNodes = new Map(['loadTitle', 'loadEyebrow', 'loadPoi', 'loadHook', 'loadStats', 'loadScr']
  .map(id => [id, createLoadNode()]));
const calls = { sessClear: 0, sessSnapshot: 0, metaGrant: 0, crate: 0, ad: 0, billboard: 0,
  scans: [], forcedCrates: 0, unitTicks: 0 };
const runtime = {
  console,
  document: {
    getElementById: id => loadNodes.get(id) || null,
    createElement: () => createLoadNode(),
    querySelectorAll: () => []
  },
  location: { search: `?groundOperation=${nonce}`, href: '' },
  sessionStorage: {
    getItem: key => session.has(key) ? session.get(key) : null,
    setItem: (key, value) => {
      const serialized = String(value);
      if (key === resultKey && failResultWrites > 0) {
        failResultWrites -= 1;
        failedVictoryBytes = serialized;
        throw new Error('intentional fail-once result write');
      }
      session.set(key, serialized);
    }
  },
  setTimeout: (callback, delay = 0) => delay > 100 ? 0 : setTimeout(callback, delay),
  clearTimeout,
  requestAnimationFrame: callback => callback(0),
  performance,
  bootConfirmed: true,
  __MF_BUILD_HAS_GALACTIC_EXPLORATION: true,
  PROFILES: { active: profileId },
  META: { settings: { experimentalExploration: false }, marker: 'live-career' },
  metaFresh: () => ({ settings: {} }),
  metaSave: () => true,
  MAPDEFS: { vespera_plateau_medium: { region: 'vespera_plateau', theme: 'ashland', size: 'standard' } },
  AI: { fac: 'nova' },
  aiSlots: Array.from({ length: 3 }, () => ({ on: false, diff: 0, ally: false, zone: '', behavior: '' })),
  normalizeAiSlotsForBattlefield: () => {},
  hideFrontScreens: () => {},
  mfLoadScreenFill: () => {
    loadNodes.get('loadTitle').textContent = 'Gloam Ramparts';
    loadNodes.get('loadEyebrow').textContent = 'DEPLOYING TO  ·  VESPERA';
    loadNodes.get('loadPoi').textContent = 'Cinder Reach';
    loadNodes.get('loadHook').textContent = 'Internal template lore';
    loadNodes.get('loadStats').textContent = 'VESPERA PLATEAU';
  },
  stopAttract: () => {},
  mfFlowLayout: () => {},
  applyTheme: () => {},
  newSkirmish: () => {},
  toast: message => { toasts.push(message); },
  pickupToast: () => {},
  carrier: { phase: 0, x: 500, y: 500 },
  deployCarrier: () => { runtime.carrier.phase = 2; return 'base-deploy'; },
  TYPES: [{ name: 'Striker' }, { name: 'Rhino' }, { name: 'Warden' }],
  UT_ENGINEER: 19,
  SNAP_GRID: 10,
  unitHigh: 0,
  ualive: [],
  uteam: [],
  ugen: [],
  uhp: [],
  uhpm: [],
  spawnUnit: (type, team, x, y) => {
    const index = runtime.unitHigh++;
    runtime.ualive[index] = 1;
    runtime.uteam[index] = team;
    runtime.ugen[index] = 1;
    runtime.uhp[index] = runtime.uhpm[index] = 100;
    spawnedUnits.push({ type, team, x, y, index });
    return index;
  },
  addBld: (type, team, x, y) => { const value = { type, team, x, y }; spawnedStructures.push(value); return value; },
  fogStartScan: (x, y, seconds, radius) => calls.scans.push({ x, y, seconds, radius }),
  spawnCrate: () => { calls.forcedCrates += 1; },
  unitTick: () => { calls.unitTicks += 1; },
  sessClear: () => { calls.sessClear += 1; },
  sessCanSnapshot: () => true,
  sessSnapshot: () => { calls.sessSnapshot += 1; return true; },
  metaGrant: () => { calls.metaGrant += 1; return {}; },
  applyCrate: () => { calls.crate += 1; },
  adShowPostMatchAd: () => { calls.ad += 1; },
  AD_PROVIDER: { reportImpression: () => { calls.billboard += 1; return 'base-impression'; } },
  mfCrateClaimer: 7,
  stats: { t: 420, kills: [36, 2], nests: 1 },
  heroIdx: 0,
  goalDef: () => ordinaryStandardGoal,
  endGame: () => true,
  returnToMainMenu: () => {},
  continueToNextMap: () => {},
  mfVictoryContinue: () => {}
};
runtime.window = runtime;
vm.createContext(runtime);
vm.runInContext(source, runtime, { filename: 'src/galactic-operations.js' });
await new Promise(resolve => setTimeout(resolve, 20));
const liveApi = runtime.__MF_GALACTIC_BRIDGE;
assert.equal(liveApi.status, 'battle', liveApi.reason);
assert.equal(runtime.META.marker, 'live-career', 'temporary META must be restored after newSkirmish');
/* The landing package follows the operation's doctrine now; it was a constant
   'expedition' before, which is exactly what made the deployment screen's
   doctrine choice cosmetic. Assert the rule, not the old literal, so this stays
   true whichever doctrine the fixture carries. */
{
  const DOCTRINE_PACKAGES = { methodical: 'prepared', containment: 'prepared', rapid: 'expedition', covert: 'expedition' };
  const doctrineId = liveApi.request?.operation?.doctrineId;
  assert.ok(DOCTRINE_PACKAGES[doctrineId], `live operation carries an unmapped doctrine: ${doctrineId}`);
  assert.equal(runtime.deploymentPackage, DOCTRINE_PACKAGES[doctrineId], 'landing package must follow the operation doctrine');
}
assert.equal(runtime.activeWarMode, 'galactic');
assert.equal(runtime.goalSel, 'purge');
assert.equal(runtime.battlefieldPreset, 'standard');
assert.equal(liveApi.runtimeMapId, 'vespera_plateau_medium');
assert.deepEqual(JSON.parse(JSON.stringify(liveApi.playerLocation)), operation.battlefield.location);
assert.deepEqual({
  title: loadNodes.get('loadTitle').textContent,
  eyebrow: loadNodes.get('loadEyebrow').textContent,
  poi: loadNodes.get('loadPoi').textContent,
  hook: loadNodes.get('loadHook').textContent,
  chips: loadNodes.get('loadStats').children.map(chip => ({
    key: chip.children[0].textContent,
    value: chip.children[1].textContent
  }))
}, {
  title: 'Transit Court',
  eyebrow: 'DEPLOYING TO  ·  Meridian K-4',
  poi: 'Meridian Quarantine',
  hook: 'UGA CONTAINMENT OPERATION',
  chips: [
    { key: 'SYSTEM', value: 'KARAK' },
    { key: 'SCALE', value: 'STANDARD' },
    { key: 'THREAT', value: 'T3' }
  ]
}, 'the selected UGA identity must overwrite the internal MAPDEF loading copy');
assert.ok(toasts.some(message => message.includes('Transit Court')), 'tactical copy must use the selected UGA map name');
assert.equal(toasts.some(message => /Gloam|Vespera|Nordhall/i.test(message)), false,
  'internal terrain-template lore must not leak into tactical copy');
assert.deepEqual(JSON.parse(JSON.stringify(runtime.goalDef())), {
  id: 'purge', em: '\ud83d\udc1b', hud: 'HIVES', nm: 'Brood Purge',
  ds: 'Destroy every active Brood hive before time runs out.', objectiveType: 'purge_brood'
});
assert.equal(runtime.playerCommanderId, operation.commanderId, 'base runtime must preserve the exact operation commander');
assert.equal(runtime.deployCarrier(), 'base-deploy');
assert.equal(liveApi.packageApplied, true);
assert.deepEqual(spawnedUnits.map(entry => runtime.TYPES[entry.type].name), ['Striker', 'Striker', 'Striker', 'Rhino']);
assert.deepEqual(spawnedStructures.map(entry => entry.type), ['uplink']);
assert.deepEqual(JSON.parse(JSON.stringify(liveApi.packageSummary.spawned.unitTypes)), { Striker: 3, Rhino: 1 });
assert.equal(spawnedUnits.some(entry => entry.type === runtime.UT_ENGINEER), false, 'heavy lift must not add an engineer');
assert.deepEqual(calls.scans, [
  { x: 500, y: 500, seconds: 24, radius: 15 }
]);
assert.equal(calls.forcedCrates, 0, 'repair nanites must not become a repair crate');
assert.equal(liveApi.operationEffects.tacticalScoreDelta, 12);
assert.equal(liveApi.packageSummary.nexusResolvedEffects, undefined);
assert.deepEqual(JSON.parse(JSON.stringify(liveApi.packageSummary.appliedEffects.scoreApplied)), [
  { layer: 'score', source: 'doctrine', id: 'containment', effect: 'tactical-score', delta: 8 },
  { layer: 'score', source: 'support', id: 'survey_drones', effect: 'tactical-score', delta: 4 }
]);
assert.equal(liveApi.packageSummary.appliedEffects.matchApplied.length, 2);
assert.equal(liveApi.packageSummary.appliedEffects.moduleResultApplied.length, 0);
runtime.uhp[0] = 50;
runtime.unitTick(1);
assert.equal(runtime.uhp[0], 51, 'repair nanites heal 1% max HP per second');
runtime.ugen[0] += 1;
runtime.uhp[0] = 40;
runtime.unitTick(1);
assert.equal(runtime.uhp[0], 40, 'a recycled generation cannot inherit the nanite reserve');
assert.equal(calls.sessClear, 0);
assert.equal(runtime.sessSnapshot(), false);
assert.equal(calls.sessSnapshot, 0);
assert.equal(runtime.metaGrant(true), null);
assert.equal(calls.metaGrant, 0);
runtime.applyCrate({ id: 'data' });
runtime.applyCrate({ id: 'mats' });
runtime.applyCrate({ id: 'mass' });
assert.equal(calls.crate, 1);
assert.equal(runtime.mfCrateClaimer, -1);
runtime.adShowPostMatchAd(true);
assert.equal(calls.ad, 0);
assert.equal(runtime.AD_PROVIDER.reportImpression({ id: 'board-1' }, { id: 'creative-1' }), null);
assert.equal(calls.billboard, 0);
assert.deepEqual(JSON.parse(JSON.stringify(liveApi.isolation)), {
  active: true,
  droppedSessionPreserved: true,
  persistentCratesSuppressed: 2,
  postMatchAdsSuppressed: 1,
  billboardImpressionsSuppressed: 1
});

// The first terminal write fails, then RETURN retries the immutable candidate.
// The retry must preserve the original victory, issuedAt, checksum and bytes;
// recomputing from the return action would incorrectly turn it into a setback.
runtime.endGame(true);
assert.equal(liveApi.status, 'result-storage-error');
assert.ok(failedVictoryBytes);
const failedVictory = JSON.parse(failedVictoryBytes);
assert.equal(failedVictory.report.outcome, 'victory');
assert.equal(failedVictory.report.score, 89);
assert.equal(session.has(resultKey), false);
runtime.returnToMainMenu();
assert.equal(session.get(resultKey), failedVictoryBytes);
const retriedVictory = JSON.parse(session.get(resultKey));
assert.equal(retriedVictory.report.outcome, 'victory');
assert.equal(retriedVictory.issuedAt, failedVictory.issuedAt);
assert.equal(retriedVictory.checksum, failedVictory.checksum);
assert.equal(liveApi.validateResultMirror(retriedVictory, nonce, profileId, request, Date.now()).ok, true);
assert.equal(runtime.location.href, `./modules/space_exploration/index.html?groundResult=${nonce}`);

// A terminal reload must resume the durable return handshake, not create a
// second battle or replace the source report with a newly scored envelope.
const originalReportBytes = JSON.stringify(tacticalMirror);
const reloadSession = new Map([
  ['massfront.galactic.entry.v1', JSON.stringify(ticket)],
  [`massfront.galactic.request.v1.${nonce}`, JSON.stringify(mirror)],
  [`massfront.galactic.result.v1.${nonce}`, originalReportBytes]
]);
let reloadSkirmishes = 0;
const reloadRuntime = {
  console,
  document: {
    getElementById: () => null,
    createElement: () => ({ className: '', textContent: '' }),
    querySelectorAll: () => []
  },
  location: { search: `?groundOperation=${nonce}`, href: '' },
  sessionStorage: {
    getItem: key => reloadSession.has(key) ? reloadSession.get(key) : null,
    setItem: (key, value) => reloadSession.set(key, String(value))
  },
  setTimeout,
  clearTimeout,
  requestAnimationFrame: callback => callback(0),
  bootConfirmed: true,
  __MF_BUILD_HAS_GALACTIC_EXPLORATION: true,
  PROFILES: { active: profileId },
  META: { settings: { experimentalExploration: false }, marker: 'reload-career' },
  newSkirmish: () => { reloadSkirmishes += 1; }
};
reloadRuntime.window = reloadRuntime;
vm.createContext(reloadRuntime);
vm.runInContext(source, reloadRuntime, { filename: 'src/galactic-operations.js' });
await new Promise(resolve => setTimeout(resolve, 20));
assert.equal(reloadRuntime.__MF_GALACTIC_BRIDGE.status, 'returning-existing');
assert.equal(reloadRuntime.__MF_GALACTIC_BRIDGE.active, false);
assert.equal(reloadRuntime.location.href, `./modules/space_exploration/index.html?groundResult=${nonce}`);
assert.equal(reloadSkirmishes, 0);
assert.equal(reloadSession.get(`massfront.galactic.result.v1.${nonce}`), originalReportBytes);

const manifest = JSON.parse(fs.readFileSync(new URL('../assets/data/manifest.json', import.meta.url), 'utf8'));
assert.equal(manifest.order.filter(path => path === 'src/galactic-operations.js').length, 1);
assert.ok(manifest.order.indexOf('src/galactic-operations.js') > manifest.order.indexOf('src/ui/hotslots.js'));
assert.ok(manifest.order.indexOf('src/onboarding.js') > manifest.order.indexOf('src/galactic-operations.js'));
const boot = fs.readFileSync(new URL('../boot.js', import.meta.url), 'utf8');
const bootOrder = [...boot.match(/var MANIFEST=\[([\s\S]*?)\];/)[1].matchAll(/'([^']+)'/g)].map(match => match[1]);
assert.equal(bootOrder.filter(path => path === './src/galactic-operations.js').length, 1);
assert.ok(bootOrder.indexOf('./src/galactic-operations.js') > bootOrder.indexOf('./src/ui/hotslots.js'));
assert.ok(bootOrder.indexOf('./src/onboarding.js') > bootOrder.indexOf('./src/galactic-operations.js'));
const main = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
assert.match(main, /massfront\.galactic\.entry\.v1/);
assert.match(main, /MassfrontGalacticEntryV2/);
assert.doesNotMatch(main, /MassfrontGalacticEntryV1/);
assert.match(main, /sessionStorage\.getItem\(key\)/);

console.log('Stage 9 Galactic base bridge contract: PASS');
