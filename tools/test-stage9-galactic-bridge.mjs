import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createGroundOperationRequestV1 } from '../modules/space_exploration/src/domain/host_contract.js';
import { beginGroundOperation } from '../modules/space_exploration/src/domain/ground_operation.js';
import { createShowcaseReadyDomainState } from '../modules/space_exploration/src/domain/state_store.js';

const source = fs.readFileSync(new URL('../src/galactic-operations.js', import.meta.url), 'utf8');
assert.doesNotMatch(source, /\b(?:import|export)\s/, 'classic bridge source must not declare modules');
assert.doesNotMatch(source, /sessClear\s*\(/, 'Galactic bridge must preserve an existing dropped-session snapshot');

let idleBillboardImpressions = 0;
const context = {
  console,
  document: { getElementById: () => null, createElement: () => ({}) },
  location: { search: '', href: '' },
  sessionStorage: { getItem: () => null, setItem: () => {} },
  setTimeout,
  clearTimeout,
  requestAnimationFrame: callback => callback(0),
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

const now = Date.now();
const profileId = 'p1';
const ticket = {
  schemaVersion: 1,
  kind: 'MassfrontGalacticEntryV1',
  profileId,
  issuedAt: now,
  expiresAt: now + 300_000,
  source: 'massfront-base'
};
assert.equal(api.validateEntryTicket(ticket, now, profileId).ok, true);
assert.equal(api.validateEntryTicket({ ...ticket, profileId: 'p2' }, now, profileId).ok, false);
assert.equal(api.validateEntryTicket({ ...ticket, issuedAt: now + 1 }, now, profileId).ok, false);
assert.equal(api.validateEntryTicket({ ...ticket, expiresAt: now }, now, profileId).ok, false);

const state = createShowcaseReadyDomainState();
state.profileId = profileId;
const { operation } = beginGroundOperation(state, {
  missionId: 'uga_pale_bloom',
  factionId: 'nova',
  deploymentManifest: {
    units: [{ id: 'recon_team', count: 1 }, { id: 'line_section', count: 1 }, { id: 'armored_element', count: 1 }],
    structures: [{ id: 'field_relay', count: 1 }],
    modIds: ['survey_link', 'repair_nanites']
  }
});
const nonce = '0123456789abcdef0123456789abcdef';
const request = createGroundOperationRequestV1(operation, {
  nonce,
  accountId: profileId,
  issuedAt: now,
  ttlMs: 300_000,
  contentVersion: 'catalog-6'
});
const requestValidation = api.validateRequest(request, nonce, profileId, now + 1);
assert.equal(requestValidation.ok, true, requestValidation.issues.join(','));
assert.equal(api.validateDeploymentContract(operation).ok, true);
const mirror = {
  schemaVersion: 1,
  kind: 'MassfrontGalacticRequestMirrorV1',
  nonce,
  accountId: profileId,
  operationId: operation.operationId,
  request
};
assert.equal(api.validateRequestMirror(mirror, nonce, profileId, now + 1).ok, true);

const tampered = structuredClone(request);
tampered.operation.missionId = 'uga_hive_heart';
assert.equal(api.validateRequest(tampered, nonce, profileId, now + 1).ok, false);
assert.ok(api.validateRequest(tampered, nonce, profileId, now + 1).issues.includes('REQUEST_CHECKSUM_INVALID'));
assert.equal(api.validateRequestMirror({ ...mirror, operationId: 'foreign' }, nonce, profileId, now + 1).ok, false);
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
const spawnedUnits = [], spawnedStructures = [];
const calls = { sessClear: 0, sessSnapshot: 0, metaGrant: 0, crate: 0, ad: 0, billboard: 0,
  scans: [], forcedCrates: 0, unitTicks: 0 };
const runtime = {
  console,
  document: {
    getElementById: () => null,
    createElement: () => ({ className: '', textContent: '' }),
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
  PROFILES: { active: profileId },
  META: { settings: { experimentalExploration: true }, marker: 'live-career' },
  metaFresh: () => ({ settings: {} }),
  metaSave: () => true,
  MAPDEFS: { vespera_spire_medium: { theme: 'crater' } },
  AI: { fac: 'nova' },
  aiSlots: Array.from({ length: 3 }, () => ({ on: false, diff: 0, ally: false, zone: '', behavior: '' })),
  normalizeAiSlotsForBattlefield: () => {},
  hideFrontScreens: () => {},
  mfLoadScreenFill: () => {},
  stopAttract: () => {},
  mfFlowLayout: () => {},
  applyTheme: () => {},
  newSkirmish: () => {},
  toast: () => {},
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
assert.equal(liveApi.status, 'battle');
assert.equal(runtime.META.marker, 'live-career', 'temporary META must be restored after newSkirmish');
assert.equal(runtime.deploymentPackage, 'expedition');
assert.equal(runtime.activeWarMode, 'galactic');
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
  PROFILES: { active: profileId },
  META: { settings: { experimentalExploration: true }, marker: 'reload-career' },
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
assert.equal(manifest.order.at(-1), 'src/galactic-operations.js');
const boot = fs.readFileSync(new URL('../boot.js', import.meta.url), 'utf8');
assert.match(boot, /'\.\/src\/ui\/hotslots\.js','\.\/src\/galactic-operations\.js'/);
const main = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
assert.match(main, /massfront\.galactic\.entry\.v1/);
assert.match(main, /MassfrontGalacticEntryV1/);
assert.match(main, /sessionStorage\.getItem\(key\)/);

console.log('Stage 9 Galactic base bridge contract: PASS');
