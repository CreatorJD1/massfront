import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  applyGroundResult,
  beginGroundOperation,
  createMemoryStorage,
  createShowcaseReadyDomainState,
  simulateGroundResult
} from '../../src/domain/index.js';
import { FakeIndexedDbHostDatabase } from '../../src/host/host_database.js';
import {
  LOCAL_EXPLORATION_CAMPAIGN_STORAGE_KEY,
  ExplorationHostError,
  LocalSandboxHost
} from '../../src/host/local_sandbox_host.js';
import {
  MASSFRONT_GALACTIC_ENTRY_TICKET_KEY,
  MASSFRONT_GALACTIC_REQUEST_MIRROR_PREFIX,
  MASSFRONT_GALACTIC_RESULT_MIRROR_PREFIX,
  MassfrontSoloHost,
  createMassfrontGalacticEntryTicket,
  createMassfrontGalacticTacticalReportV1,
  massfrontSoloStorageNamespace,
  validateMassfrontGalacticEntryTicket
} from '../../src/host/massfront_solo_host.js';

const NOW = 4_000_000;
const NONCE = '0123456789abcdef0123456789abcdef';
const PROFILE_ID = 'profile/stage9:alpha';

function sessionWith(ticket) {
  return createMemoryStorage(ticket ? {
    [MASSFRONT_GALACTIC_ENTRY_TICKET_KEY]: JSON.stringify(ticket)
  } : {});
}

function tacticalReport(result) {
  return {
    outcome: result.outcome,
    score: result.score,
    primaryObjectiveComplete: result.primaryObjectiveComplete,
    secondaryObjectivesComplete: result.secondaryObjectivesComplete,
    injuryBand: result.injuryBand,
    injuredPersonnelIds: [...result.injuredPersonnelIds]
  };
}

function expectTicketRejection(options) {
  assert.throws(
    () => new MassfrontSoloHost(options),
    error => error instanceof ExplorationHostError && error.code === 'GALACTIC_ENTRY_TICKET_REJECTED'
  );
}

async function expectHostError(promise, code) {
  await assert.rejects(
    promise,
    error => error instanceof ExplorationHostError && error.code === code,
    `expected ExplorationHostError ${code}`
  );
}

function verifyTicketValidation() {
  const defaultTicket = createMassfrontGalacticEntryTicket(PROFILE_ID, { issuedAt: NOW });
  assert.equal(defaultTicket.expiresAt - defaultTicket.issuedAt, 7 * 24 * 60 * 60 * 1000, 'same-tab entry capability must survive a long operation and rejected-result return');
  const valid = createMassfrontGalacticEntryTicket(PROFILE_ID, { issuedAt: NOW - 1_000, ttlMs: 60_000 });
  assert.equal(validateMassfrontGalacticEntryTicket(valid, { now: NOW, profileId: PROFILE_ID }).ok, true);
  assert.equal(validateMassfrontGalacticEntryTicket(valid, { now: NOW, profileId: 'another-profile' }).ok, false, 'cross-profile ticket must reject');

  const malformed = { ...valid, schemaVersion: 99 };
  expectTicketRejection({ sessionStorage: sessionWith(malformed), now: () => NOW });
  const overlong = { ...valid, expiresAt: valid.issuedAt + 8 * 24 * 60 * 60 * 1000 };
  expectTicketRejection({ sessionStorage: sessionWith(overlong), now: () => NOW });

  const expired = createMassfrontGalacticEntryTicket(PROFILE_ID, { issuedAt: NOW - 120_000, ttlMs: 60_000 });
  expectTicketRejection({ sessionStorage: sessionWith(expired), now: () => NOW });
  expectTicketRejection({
    sessionStorage: sessionWith(valid),
    expectedProfileId: 'another-profile',
    now: () => NOW
  });
}

function createFixture(profileId = PROFILE_ID) {
  let clock = NOW;
  const ticket = createMassfrontGalacticEntryTicket(profileId, { issuedAt: NOW - 1_000, ttlMs: 60_000 });
  const sessionStorage = sessionWith(ticket);
  const storage = createMemoryStorage();
  const database = new FakeIndexedDbHostDatabase();
  const navigations = [];
  const host = new MassfrontSoloHost({
    sessionStorage,
    storage,
    database,
    expectedProfileId: profileId,
    now: () => clock,
    nonceFactory: () => NONCE,
    requestTtlMs: 60_000,
    contentVersion: 'massfront-stage9-host-test-v1',
    navigation: url => { navigations.push(url); }
  });
  const state = createShowcaseReadyDomainState();
  state.profileId = profileId;
  const launch = beginGroundOperation(state, {
    missionId: 'uga_pale_bloom',
    proxyFactionId: 'nova'
  });
  return {
    database,
    host,
    launch,
    navigations,
    sessionStorage,
    state,
    storage,
    setNow(value) { clock = value; }
  };
}

function verifyProfileIsolation() {
  const left = createFixture('profile/a');
  const right = createFixture('profile?a');
  assert.notDeepEqual(left.host.namespace, right.host.namespace, 'sanitization collisions must retain a profile hash');
  for (const host of [left.host, right.host]) {
    assert.notEqual(host.key, LOCAL_EXPLORATION_CAMPAIGN_STORAGE_KEY);
    assert.notEqual(host.accountId, 'local_expedition');
    assert.match(host.namespace.databaseName, /^massfront\.galactic\.solo\.v1\.host\./);
    assert.match(host.namespace.databasePrefix, /^massfront\.galactic\.solo\.v1\.host\./);
    assert.equal(host.loadCampaignSnapshot().profileId, host.accountId, 'a fresh integrated campaign must inherit the ticket profile');
  }
  assert.notEqual(massfrontSoloStorageNamespace('profile/a').domainKey, massfrontSoloStorageNamespace('profile?a').domainKey);
}

async function verifyIntegratedDefaultRequestTtl() {
  const ticket = createMassfrontGalacticEntryTicket(PROFILE_ID, { issuedAt: NOW - 1_000 });
  const sessionStorage = sessionWith(ticket);
  const host = new MassfrontSoloHost({
    sessionStorage,
    storage: createMemoryStorage(),
    database: new FakeIndexedDbHostDatabase(),
    now: () => NOW,
    nonceFactory: () => NONCE,
    contentVersion: 'massfront-stage9-host-test-v1',
    navigation: () => {}
  });
  const state = createShowcaseReadyDomainState();
  state.profileId = PROFILE_ID;
  const launch = beginGroundOperation(state, { missionId: 'uga_pale_bloom', proxyFactionId: 'nova' });
  const prepared = await host.prepareGroundOperation(launch.operation);
  const mirror = JSON.parse(sessionStorage.getItem(`${MASSFRONT_GALACTIC_REQUEST_MIRROR_PREFIX}${prepared.nonce}`));
  assert.equal(mirror.request.expiresAt - mirror.request.issuedAt, 24 * 60 * 60 * 1000, 'integrated tactical request must allow a full-day match and return window');
}

async function verifyRequestLaunchAndTacticalResult() {
  const test = createFixture();
  test.host.saveCampaignSnapshot(test.state);
  assert.equal(test.storage.getItem(LOCAL_EXPLORATION_CAMPAIGN_STORAGE_KEY), null, 'integrated save must never claim the standalone campaign key');
  assert.equal(test.host.kind, 'MassfrontSoloHostV1');
  assert.equal(test.host.productionIntegrated, true);

  const prepared = await test.host.prepareGroundOperation(test.launch.operation);
  test.host.saveCampaignSnapshot(test.launch.state);
  assert.equal(prepared.productionIntegrated, true);
  assert.equal(prepared.localOnly, false);
  assert.equal(prepared.adapter, 'massfront-solo-v1');
  assert.equal(prepared.launchUrl, `../../../index.html?groundOperation=${NONCE}`);
  assert.deepEqual([...new URLSearchParams(prepared.launchUrl.split('?')[1]).keys()], ['groundOperation']);
  assert.ok(!prepared.launchUrl.includes(test.launch.operation.operationId));
  assert.ok(!prepared.launchUrl.includes(PROFILE_ID));

  const requestMirrorKey = `${MASSFRONT_GALACTIC_REQUEST_MIRROR_PREFIX}${NONCE}`;
  const requestMirror = JSON.parse(test.sessionStorage.getItem(requestMirrorKey));
  assert.equal(requestMirror.kind, 'MassfrontGalacticRequestMirrorV1');
  assert.equal(requestMirror.accountId, PROFILE_ID);
  assert.equal(requestMirror.operationId, test.launch.operation.operationId);
  assert.deepEqual(requestMirror.request.operation, test.launch.operation, 'mirrored request must survive JSON read-back unchanged');

  const opened = await test.host.openGroundOperation(prepared);
  assert.equal(opened.opened, true);
  assert.deepEqual(test.navigations, [prepared.launchUrl]);

  const simulated = simulateGroundResult(test.launch.operation);
  const validMirror = createMassfrontGalacticTacticalReportV1({
    nonce: NONCE,
    accountId: PROFILE_ID,
    operationId: test.launch.operation.operationId,
    issuedAt: NOW + 1_000,
    report: tacticalReport(simulated)
  });
  const resultMirrorKey = `${MASSFRONT_GALACTIC_RESULT_MIRROR_PREFIX}${NONCE}`;

  const tampered = structuredClone(validMirror);
  tampered.report.score = Math.max(0, tampered.report.score - 1);
  test.sessionStorage.setItem(resultMirrorKey, JSON.stringify(tampered));
  test.setNow(NOW + 2_000);
  await expectHostError(test.host.consumeTacticalResult(NONCE), 'GALACTIC_TACTICAL_RESULT_REJECTED');
  assert.equal(test.database.receipts.size, 0, 'invalid tactical checksum must not reserve the result ledger');

  const wrongProfile = createMassfrontGalacticTacticalReportV1({
    nonce: NONCE,
    accountId: 'another-profile',
    operationId: test.launch.operation.operationId,
    issuedAt: NOW + 1_000,
    report: tacticalReport(simulated)
  });
  test.sessionStorage.setItem(resultMirrorKey, JSON.stringify(wrongProfile));
  await expectHostError(test.host.consumeTacticalResult(NONCE), 'GALACTIC_TACTICAL_RESULT_REJECTED');
  assert.equal(test.database.receipts.size, 0, 'cross-profile tactical result must not reserve the result ledger');

  test.sessionStorage.setItem(resultMirrorKey, JSON.stringify(validMirror));
  let emissions = 0;
  test.host.subscribeResult(result => {
    emissions += 1;
    assert.equal(result.operationId, test.launch.operation.operationId);
    const applied = applyGroundResult(test.host.loadCampaignSnapshot(), result);
    assert.equal(applied.applied, true);
    test.host.saveCampaignSnapshot(applied.state);
  });
  const first = await test.host.consumeTacticalResult(NONCE);
  assert.equal(first.accepted, true);
  assert.equal(first.duplicate, false);
  assert.equal(first.productionIntegrated, true);
  assert.equal(first.applicationDurable, true);
  assert.equal(emissions, 1, 'a duplicate tactical result must never re-emit campaign mutation');
  assert.equal(test.database.receipts.size, 1);
  assert.notEqual(test.sessionStorage.getItem(requestMirrorKey), null, 'request mirror must survive until the return URL is stripped');
  assert.notEqual(test.sessionStorage.getItem(resultMirrorKey), null, 'result mirror must survive the durable-application crash window');

  const reloadedHost = new MassfrontSoloHost({
    sessionStorage: test.sessionStorage,
    storage: test.storage,
    database: test.database,
    expectedProfileId: PROFILE_ID,
    now: () => NOW + 2_000,
    contentVersion: 'massfront-stage9-host-test-v1',
    navigation: () => {}
  });
  const replay = await reloadedHost.consumeTacticalResult(NONCE);
  assert.equal(replay.duplicate, true, 'a reload before mirror finalization must resolve from the durable receipt');
  assert.equal(replay.applicationAlreadyDurable, true, 'the durable campaign must not be applied a second time');
  assert.equal(emissions, 1);
  const finalized = await reloadedHost.finalizeTacticalResult(NONCE, replay.resultId);
  assert.equal(finalized.finalized, true);
  assert.equal(test.sessionStorage.getItem(requestMirrorKey), null, 'request mirror is removed after URL-strip finalization');
  assert.equal(test.sessionStorage.getItem(resultMirrorKey), null, 'result mirror is removed after URL-strip finalization');
}

async function verifyReceiptApplicationRecovery() {
  const test = createFixture();
  const prepared = await test.host.prepareGroundOperation(test.launch.operation);
  test.host.saveCampaignSnapshot(test.launch.state);
  const simulated = simulateGroundResult(test.launch.operation);
  const mirror = createMassfrontGalacticTacticalReportV1({
    nonce: prepared.nonce,
    accountId: PROFILE_ID,
    operationId: test.launch.operation.operationId,
    issuedAt: NOW + 1_000,
    report: tacticalReport(simulated)
  });
  test.sessionStorage.setItem(`${MASSFRONT_GALACTIC_RESULT_MIRROR_PREFIX}${prepared.nonce}`, JSON.stringify(mirror));
  test.setNow(NOW + 2_000);

  await expectHostError(test.host.consumeTacticalResult(prepared.nonce), 'GALACTIC_RESULT_APPLICATION_NOT_DURABLE');
  assert.equal(test.database.receipts.size, 1, 'accepted receipt must survive the interrupted application window');
  assert.equal(test.host.loadCampaignSnapshot().operations.pending.operationId, test.launch.operation.operationId);

  const recoveredHost = new MassfrontSoloHost({
    sessionStorage: test.sessionStorage,
    storage: test.storage,
    database: test.database,
    expectedProfileId: PROFILE_ID,
    now: () => NOW + 2_000,
    contentVersion: 'massfront-stage9-host-test-v1',
    navigation: () => {}
  });
  recoveredHost.loadCampaignSnapshot();
  let recoveryEmissions = 0;
  recoveredHost.subscribeResult(result => {
    recoveryEmissions += 1;
    const applied = applyGroundResult(recoveredHost.loadCampaignSnapshot(), result);
    assert.equal(applied.applied, true);
    recoveredHost.saveCampaignSnapshot(applied.state);
  });
  const recovered = await recoveredHost.consumeTacticalResult(prepared.nonce);
  assert.equal(recovered.duplicate, true);
  assert.equal(recovered.recoveredApplication, true, 'duplicate receipt must mark a recovered campaign application');
  assert.equal(recovered.applicationAlreadyDurable, false);
  assert.equal(recoveryEmissions, 1);
  const durable = recoveredHost.loadCampaignSnapshot();
  assert.equal(durable.operations.pending, null);
  assert.ok(durable.operations.history.some(entry => entry.result.resultId === simulated.resultId));
  assert.ok(durable.operations.appliedResultIds.includes(simulated.resultId));
  await recoveredHost.finalizeTacticalResult(prepared.nonce, recovered.resultId);
  assert.equal(test.sessionStorage.getItem(`${MASSFRONT_GALACTIC_REQUEST_MIRROR_PREFIX}${prepared.nonce}`), null);
  assert.equal(test.sessionStorage.getItem(`${MASSFRONT_GALACTIC_RESULT_MIRROR_PREFIX}${prepared.nonce}`), null);

  test.sessionStorage.setItem(`${MASSFRONT_GALACTIC_RESULT_MIRROR_PREFIX}${prepared.nonce}`, JSON.stringify(mirror));
  const alreadyDurable = await recoveredHost.consumeTacticalResult(prepared.nonce);
  assert.equal(alreadyDurable.duplicate, true);
  assert.equal(alreadyDurable.recoveredApplication, false);
  assert.equal(alreadyDurable.applicationAlreadyDurable, true, 'durable history must never be replayed');
  assert.equal(recoveryEmissions, 1);
  await recoveredHost.finalizeTacticalResult(prepared.nonce, alreadyDurable.resultId);
  assert.equal(test.sessionStorage.getItem(`${MASSFRONT_GALACTIC_RESULT_MIRROR_PREFIX}${prepared.nonce}`), null);
}

async function verifyRestoredPendingAbandonment() {
  const test = createFixture();
  await test.host.prepareGroundOperation(test.launch.operation);
  test.host.saveCampaignSnapshot(test.launch.state);
  const restored = new MassfrontSoloHost({
    sessionStorage: test.sessionStorage,
    storage: test.storage,
    database: test.database,
    expectedProfileId: PROFILE_ID,
    now: () => NOW + 2_000,
    contentVersion: 'massfront-stage9-host-test-v1',
    navigation: () => {}
  });
  assert.equal(restored.pendingNonce, null, 'constructor does not guess a pending request before campaign restore');
  const snapshot = restored.loadCampaignSnapshot();
  assert.equal(snapshot.operations.pending.operationId, test.launch.operation.operationId);
  assert.equal(restored.pendingNonce, NONCE, 'campaign restore must recover the pending opaque nonce from its profile mirror');
  const abandoned = restored.abandonGroundOperation();
  assert.equal(abandoned.nonce, NONCE);
  assert.equal(abandoned.domainCancellationRequired, true, 'host cleanup must leave domain refund ownership with space_experience');
  assert.equal(restored.pendingNonce, null);
  assert.equal(test.sessionStorage.getItem(`${MASSFRONT_GALACTIC_REQUEST_MIRROR_PREFIX}${NONCE}`), null);
}

function verifyStandaloneHostUnchanged() {
  const host = new LocalSandboxHost({ storage: createMemoryStorage(), indexedDB: null });
  assert.equal(host.kind, 'LocalSandboxHostV1');
  assert.equal(host.productionIntegrated, false);
  assert.equal(host.accountId, 'local_expedition');
  assert.equal(host.key, LOCAL_EXPLORATION_CAMPAIGN_STORAGE_KEY);
}

async function verifyBootstrapOrderingAndRecoveryIdentity() {
  const source = await readFile(new URL('../../src/space_module.js', import.meta.url), 'utf8');
  assert.match(source, /if \(selectedHost\) return selectedHost;/, 'GPU rebuilds must retain the selected host instance and kind');
  assert.match(source, /await experience\.ready;[\s\S]*host\.consumeTacticalResult\(nonce\)/, 'returned tactical report must wait until the experience has installed its result subscriber');
  assert.match(source, /host\.productionIntegrated !== true/, 'a returned tactical result must fail closed without the integrated host');
  assert.match(source, /history\.replaceState\([\s\S]*location\.pathname/, 'a durable return must remove the consumed query without reloading');
}

const tests = [
  ['entry ticket validation', verifyTicketValidation],
  ['profile-isolated namespaces', verifyProfileIsolation],
  ['24-hour integrated request TTL', verifyIntegratedDefaultRequestTtl],
  ['request mirror + opaque launch + tactical exactly-once', verifyRequestLaunchAndTacticalResult],
  ['receipt/application durability recovery', verifyReceiptApplicationRecovery],
  ['restored pending nonce + abandonment', verifyRestoredPendingAbandonment],
  ['standalone host unchanged', verifyStandaloneHostUnchanged],
  ['bootstrap ordering + GPU host identity', verifyBootstrapOrderingAndRecoveryIdentity]
];

let failures = 0;
for (const [name, run] of tests) {
  try {
    await run();
    console.log(`PASS ${name}`);
  } catch (error) {
    failures += 1;
    console.error(`FAIL ${name}`);
    console.error(error?.stack || error);
  }
}

if (failures) {
  console.error(`MassfrontSoloHost: ${failures}/${tests.length} failed`);
  process.exitCode = 1;
} else {
  console.log(`MassfrontSoloHost: ${tests.length}/${tests.length} passed`);
}
