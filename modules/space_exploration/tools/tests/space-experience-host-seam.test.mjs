import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  beginGroundOperation,
  createMemoryStorage,
  createShowcaseReadyDomainState,
  simulateGroundResult
} from '../../src/domain/index.js';
import { FakeIndexedDbHostDatabase } from '../../src/host/host_database.js';
import {
  LOCAL_EXPLORATION_CAMPAIGN_STORAGE_KEY,
  LocalSandboxHost as CanonicalLocalSandboxHost
} from '../../src/host/local_sandbox_host.js?v=20260825-host1';

// space_experience owns browser rendering, but only THREE.Vector3 is evaluated
// while importing its module graph. The seam test never creates a renderer.
globalThis.THREE = {
  Vector3: class Vector3 {
    constructor(x = 0, y = 0, z = 0) {
      this.x = x;
      this.y = y;
      this.z = z;
    }
  }
};

const { LocalSandboxHost: DirectConsumerHost } = await import('../../src/space_experience.js');

const NOW = 2_000_000;
const NONCE = '0123456789abcdef0123456789abcdef';
const storage = createMemoryStorage();
const database = new FakeIndexedDbHostDatabase();
const state = createShowcaseReadyDomainState();
const started = beginGroundOperation(state, { missionId: 'uga_pale_bloom' });
const result = simulateGroundResult(started.operation);
const host = new DirectConsumerHost({
  storage,
  database,
  accountId: state.profileId,
  now: () => NOW,
  nonceFactory: () => NONCE,
  requestTtlMs: 60_000,
  contentVersion: 'space-experience-seam-test-v1'
});

assert.equal(
  DirectConsumerHost,
  CanonicalLocalSandboxHost,
  'space_experience direct consumers must receive the canonical src/host constructor'
);
assert.equal(host.key, LOCAL_EXPLORATION_CAMPAIGN_STORAGE_KEY, 'standalone campaign save key must remain compatible');
assert.equal(host.kind, 'LocalSandboxHostV1');
assert.equal(host.productionIntegrated, false, 'standalone host must never claim production integration');

const prepared = await host.prepareGroundOperation(started.operation);
const launchParameters = new URLSearchParams(prepared.urlSearch);
assert.deepEqual([...launchParameters.keys()], ['groundOperation'], 'launch URL must carry only the nonce field');
assert.equal(launchParameters.get('groundOperation'), NONCE);
assert.ok(!prepared.urlSearch.includes(started.operation.operationId), 'launch URL must not expose operation identity');
assert.ok(!prepared.urlSearch.includes(state.profileId), 'launch URL must not expose account identity');
assert.equal(prepared.localOnly, true);
assert.equal(prepared.productionIntegrated, false);

let resultEmissions = 0;
host.subscribeResult(value => {
  resultEmissions += 1;
  assert.equal(value.resultId, result.resultId);
});
const [first, second] = await Promise.all([
  host.consumeGroundResult(result),
  host.consumeGroundResult(result)
]);
const outcomes = [first, second].sort((a, b) => Number(b.accepted) - Number(a.accepted));
assert.equal(outcomes[0].accepted, true);
assert.equal(outcomes[0].localOnly, true);
assert.equal(outcomes[1].accepted, false);
assert.equal(outcomes[1].duplicate, true);
assert.equal(resultEmissions, 1, 'the versioned host ledger must emit a simulated result exactly once');
assert.equal(database.receipts.size, 1);

const experienceSource = await readFile(new URL('../../src/space_experience.js', import.meta.url), 'utf8');
assert.doesNotMatch(experienceSource, /export\s+class\s+LocalSandboxHost/, 'legacy permissive adapter must not remain exported');
assert.match(experienceSource, /host\.kind === 'LocalSandboxHostV1' && host\.productionIntegrated === false/, 'local simulator needs an explicit non-production guard');
assert.match(experienceSource, /await host\.consumeGroundResult\(result\)/, 'local simulator results must traverse the versioned host ledger');
assert.doesNotMatch(experienceSource, /host\.emitResult\(result\)/, 'the UI must not bypass result consumption through the old event shim');

console.log('SpaceExperience host seam: PASS');
