import assert from 'node:assert/strict';
import {
  beginGroundOperation,
  createGroundOperationRequestV1,
  createGroundOperationResultV1,
  createMemoryStorage,
  createShowcaseReadyDomainState,
  setDomainRoute,
  simulateGroundResult,
  validateExplorationHostV1
} from '../../src/domain/index.js';
import {
  ExplorationHostError,
  LocalSandboxHost
} from '../../src/host/local_sandbox_host.js';
import {
  FailoverHostDatabase,
  FakeIndexedDbHostDatabase,
  StorageHostDatabase
} from '../../src/host/host_database.js';

const FIXED_ISSUED_AT = 1_000_000;
const FIXED_TTL_MS = 60_000;

function fixture({ now = FIXED_ISSUED_AT, nonce = '0123456789abcdef0123456789abcdef', accountId = 'local_expedition' } = {}) {
  const storage = createMemoryStorage();
  const database = new FakeIndexedDbHostDatabase();
  let clock = now;
  const host = new LocalSandboxHost({
    storage,
    database,
    accountId,
    now: () => clock,
    nonceFactory: () => nonce,
    requestTtlMs: FIXED_TTL_MS,
    contentVersion: 'exploration-host-test-v1'
  });
  let state = createShowcaseReadyDomainState();
  state = setDomainRoute(state, {
    scene: 'uga',
    systemId: state.route.systemId,
    targetId: 'hangar'
  });
  const launch = beginGroundOperation(state, { missionId: 'uga_pale_bloom' });
  const result = simulateGroundResult(launch.operation);
  return {
    database,
    host,
    launch,
    result,
    state,
    storage,
    setNow(value) { clock = value; }
  };
}

async function expectHostError(promise, code) {
  await assert.rejects(promise, error => (
    error instanceof ExplorationHostError &&
    error.code === code
  ), `expected ExplorationHostError ${code}`);
}

async function verifyVersionedHostAndOpaqueLaunch() {
  const test = fixture();
  const prepared = await test.host.prepareGroundOperation(test.launch.operation);
  assert.equal(test.host.schemaVersion, 1);
  assert.equal(test.host.kind, 'LocalSandboxHostV1');
  assert.equal(test.host.productionIntegrated, false);
  assert.equal(validateExplorationHostV1(test.host).ok, true);
  assert.equal(prepared.nonce, '0123456789abcdef0123456789abcdef');
  assert.equal(prepared.urlSearch, '?groundOperation=0123456789abcdef0123456789abcdef');
  assert.ok(!prepared.urlSearch.includes(test.launch.operation.operationId), 'URL must not expose operation identity');
  assert.ok(!prepared.urlSearch.includes(test.launch.operation.profileId), 'URL must not expose account identity');
  const stored = await test.host.loadGroundOperationRequest(prepared.nonce);
  assert.deepEqual(stored.operation, test.launch.operation);
}

async function verifyExactlyOnceAndResumeRoute() {
  const test = fixture();
  const prepared = await test.host.prepareGroundOperation(test.launch.operation);
  const envelope = createGroundOperationResultV1(test.result, {
    nonce: prepared.nonce,
    accountId: test.state.profileId,
    issuedAt: FIXED_ISSUED_AT + 1_000
  });
  let emissions = 0;
  let emittedResultId = null;
  test.host.subscribeResult(result => {
    emissions += 1;
    emittedResultId = result.resultId;
  });
  test.setNow(FIXED_ISSUED_AT + 2_000);
  const [first, second] = await Promise.all([
    test.host.consumeGroundResult(envelope),
    test.host.consumeGroundResult(envelope)
  ]);
  const outcomes = [first, second].sort((a, b) => Number(b.accepted) - Number(a.accepted));
  assert.equal(outcomes[0].accepted, true);
  assert.equal(outcomes[0].duplicate, false);
  assert.equal(outcomes[1].accepted, false);
  assert.equal(outcomes[1].duplicate, true);
  assert.equal(emissions, 1, 'duplicate result must never be emitted twice');
  assert.equal(emittedResultId, test.result.resultId);
  assert.deepEqual(outcomes[0].resume.route, test.launch.operation.returnRoute);
  assert.equal(outcomes[0].resume.roomId, 'hangar');
  assert.deepEqual(await test.host.getResumePoint(prepared.nonce), {
    route: test.launch.operation.returnRoute,
    roomId: 'hangar'
  });
  assert.equal(test.database.receipts.size, 1, 'atomic fake-IDB ledger must contain one receipt');
}

async function verifyExpiredRequestAndResult() {
  const test = fixture();
  const prepared = await test.host.prepareGroundOperation(test.launch.operation);
  const envelope = createGroundOperationResultV1(test.result, {
    nonce: prepared.nonce,
    accountId: test.state.profileId,
    issuedAt: FIXED_ISSUED_AT + FIXED_TTL_MS + 1
  });
  test.setNow(FIXED_ISSUED_AT + FIXED_TTL_MS + 1);
  await expectHostError(test.host.consumeGroundResult(envelope), 'GROUND_REQUEST_REJECTED');
  assert.equal(test.database.receipts.size, 0, 'expired result must not reserve a ledger entry');

  const futureIssued = fixture({ nonce: '99999999999999998888888888888888' });
  const futurePrepared = await futureIssued.host.prepareGroundOperation(futureIssued.launch.operation);
  const futureEnvelope = createGroundOperationResultV1(futureIssued.result, {
    nonce: futurePrepared.nonce,
    accountId: futureIssued.state.profileId,
    issuedAt: FIXED_ISSUED_AT + FIXED_TTL_MS + 1
  });
  futureIssued.setNow(FIXED_ISSUED_AT + 1_000);
  await expectHostError(futureIssued.host.consumeGroundResult(futureEnvelope), 'RESULT_EXPIRED');
  assert.equal(futureIssued.database.receipts.size, 0);

  const alreadyExpired = createGroundOperationRequestV1(test.launch.operation, {
    nonce: 'fedcba9876543210fedcba9876543210',
    accountId: test.state.profileId,
    contentVersion: 'exploration-host-test-v1',
    issuedAt: FIXED_ISSUED_AT,
    ttlMs: FIXED_TTL_MS
  });
  await expectHostError(test.host.prepareGroundOperation(alreadyExpired), 'GROUND_REQUEST_REJECTED');
}

async function verifyAccountAndSchemaRejection() {
  const test = fixture();
  const prepared = await test.host.prepareGroundOperation(test.launch.operation);
  const wrongAccount = createGroundOperationResultV1(test.result, {
    nonce: prepared.nonce,
    accountId: 'different_account',
    issuedAt: FIXED_ISSUED_AT + 1_000
  });
  test.setNow(FIXED_ISSUED_AT + 2_000);
  await expectHostError(test.host.consumeGroundResult(wrongAccount), 'GROUND_RESULT_REJECTED');
  assert.equal(test.database.receipts.size, 0);

  const badResultSchema = structuredClone(createGroundOperationResultV1(test.result, {
    nonce: prepared.nonce,
    accountId: test.state.profileId,
    issuedAt: FIXED_ISSUED_AT + 1_000
  }));
  badResultSchema.schemaVersion = 99;
  await expectHostError(test.host.consumeGroundResult(badResultSchema), 'GROUND_RESULT_REJECTED');
  assert.equal(test.database.receipts.size, 0);

  const badSchema = structuredClone(createGroundOperationRequestV1(test.launch.operation, {
    nonce: 'aaaaaaaaaaaaaaaabbbbbbbbbbbbbbbb',
    accountId: test.state.profileId,
    contentVersion: 'exploration-host-test-v1',
    issuedAt: FIXED_ISSUED_AT,
    ttlMs: FIXED_TTL_MS
  }));
  badSchema.schemaVersion = 99;
  await expectHostError(test.host.prepareGroundOperation(badSchema), 'GROUND_REQUEST_REJECTED');
  assert.equal(test.database.requests.size, 1, 'invalid schema must not be persisted');
}

async function verifyClassicIsolationAndSaveCompatibility() {
  const test = fixture();
  test.host.saveCampaignSnapshot(test.state);
  const campaignBefore = test.storage.getItem(test.host.key);
  const profileBefore = test.storage.getItem(test.host.profileKey);
  const cycleBefore = test.state.ship.expeditionCycle;
  const response = await test.host.launchClassicMode({
    modeId: 'classic_skirmish',
    returnRoute: { scene: 'uga', systemId: 'aelos', targetId: 'command' }
  });
  assert.equal(response.accepted, true);
  assert.equal(response.isolatedFromGalacticCampaign, true);
  assert.equal(test.storage.getItem(test.host.key), campaignBefore);
  assert.equal(test.storage.getItem(test.host.profileKey), profileBefore);
  assert.equal(test.database.requests.size, 0);
  assert.equal(test.database.receipts.size, 0);
  assert.equal(test.host.loadCampaignSnapshot().ship.expeditionCycle, cycleBefore);

  const reloaded = new LocalSandboxHost({
    storage: test.storage,
    database: new FakeIndexedDbHostDatabase(),
    accountId: test.state.profileId,
    now: () => FIXED_ISSUED_AT,
    nonceFactory: () => 'ccccccccccccccccdddddddddddddddd',
    contentVersion: 'exploration-host-test-v1'
  });
  assert.deepEqual(reloaded.loadCampaignSnapshot(), test.state, 'existing standalone campaign save must remain readable');
}

async function verifyFallbackStorageLedger() {
  const test = fixture();
  const host = new LocalSandboxHost({
    storage: test.storage,
    indexedDB: null,
    accountId: test.state.profileId,
    now: () => FIXED_ISSUED_AT + 2_000,
    nonceFactory: () => 'eeeeeeeeeeeeeeeeffffffffffffffff',
    requestTtlMs: FIXED_TTL_MS,
    contentVersion: 'exploration-host-test-v1'
  });
  const prepared = await host.prepareGroundOperation(test.launch.operation);
  const envelope = createGroundOperationResultV1(test.result, {
    nonce: prepared.nonce,
    accountId: test.state.profileId,
    issuedAt: FIXED_ISSUED_AT + 2_000
  });
  const first = await host.consumeGroundResult(envelope);
  const duplicate = await host.consumeGroundResult(envelope);
  assert.equal(first.accepted, true);
  assert.equal(duplicate.duplicate, true);
}

async function verifyCrossStoreFailoverDoesNotReplay() {
  const test = fixture();
  const primary = new FakeIndexedDbHostDatabase();
  const database = new FailoverHostDatabase(primary, new StorageHostDatabase(test.storage, { prefix: 'host-failover-test' }));
  const host = new LocalSandboxHost({
    storage: test.storage,
    database,
    accountId: test.state.profileId,
    now: () => FIXED_ISSUED_AT + 2_000,
    nonceFactory: () => '11111111111111112222222222222222',
    requestTtlMs: FIXED_TTL_MS,
    contentVersion: 'exploration-host-test-v1'
  });
  const prepared = await host.prepareGroundOperation(test.launch.operation);
  const envelope = createGroundOperationResultV1(test.result, {
    nonce: prepared.nonce,
    accountId: test.state.profileId,
    issuedAt: FIXED_ISSUED_AT + 2_000
  });
  let emissions = 0;
  host.subscribeResult(() => { emissions += 1; });
  assert.equal((await host.consumeGroundResult(envelope)).accepted, true);
  primary.receipts.clear();
  const duplicate = await host.consumeGroundResult(envelope);
  assert.equal(duplicate.duplicate, true, 'fallback continuity marker must survive loss of primary receipt');
  assert.equal(emissions, 1);
}

const tests = [
  ['versioned host + opaque launch', verifyVersionedHostAndOpaqueLaunch],
  ['atomic exactly-once + resume route', verifyExactlyOnceAndResumeRoute],
  ['expiry rejection', verifyExpiredRequestAndResult],
  ['account + schema rejection', verifyAccountAndSchemaRejection],
  ['Classic isolation + save compatibility', verifyClassicIsolationAndSaveCompatibility],
  ['localStorage fallback ledger', verifyFallbackStorageLedger],
  ['cross-store failover blocks replay', verifyCrossStoreFailoverDoesNotReplay]
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
  console.error(`ExplorationHostV1: ${failures}/${tests.length} failed`);
  process.exitCode = 1;
} else {
  console.log(`ExplorationHostV1: ${tests.length}/${tests.length} passed`);
}
