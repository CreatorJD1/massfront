import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  COMMANDER_ROSTER_PRODUCTION_FINGERPRINT_V1,
  applyGroundResult,
  beginGroundOperation,
  beginGroundOperationV2,
  createGroundOperationRequestV1,
  createGroundOperationRequestV2,
  createGroundOperationResultV1,
  createGroundOperationResultV2,
  createGroundResult,
  createInitialDomainState,
  createShowcaseReadyDomainState,
  getMissionEligibility,
  validateGroundOperation,
  validateGroundOperationRequestV2,
  validateGroundOperationResultV2,
  validateGroundResult
} from '../src/domain/index.js';

const PROFILE_ID = 'profile/stage11:v3';
const NONCE = '0123456789abcdef0123456789abcdef';
const NOW = 4_000_000;
// Compact: the always-open bottom rung of the linear map ladder (this suite
// is about operation identity and byte pins, not battlefield size).
const PALE_BLOOM_MAP_ID = 'karak_meridian_quarantine_compact';
const REPORT = Object.freeze({
  outcome: 'victory',
  score: 88,
  primaryObjectiveComplete: true,
  secondaryObjectivesComplete: 2,
  injuryBand: 'light'
});

function showcase(profileId = PROFILE_ID) {
  const state = createShowcaseReadyDomainState();
  state.profileId = profileId;
  return state;
}

function launch(commanderId, proxyFactionId) {
  return beginGroundOperation(showcase(), {
    missionId: 'uga_pale_bloom',
    proxyFactionId,
    commanderId,
    mapId: PALE_BLOOM_MAP_ID
  });
}

function reportFor(operation) {
  return { ...REPORT, injuredPersonnelIds: [operation.specialistIds[0]] };
}

function codes(validation) {
  return (validation.issues || validation.locks || []).map(entry => entry.code);
}

for (const [proxyFactionId, commanderId] of [
  ['nova', 'nova_kai'],
  ['dominion', 'legion_vex'],
  ['syndicate', 'syndicate_renn'],
  ['nova', 'nova_holt'],
  ['dominion', 'legion_korr'],
  ['syndicate', 'syndicate_nyx']
]) {
  const launched = launch(commanderId, proxyFactionId);
  const { operation } = launched;
  assert.equal(operation.schemaVersion, 3);
  assert.equal(operation.kind, 'GroundOperationV3');
  assert.equal(operation.commanderRosterFingerprint, COMMANDER_ROSTER_PRODUCTION_FINGERPRINT_V1);
  assert.equal(operation.commanderId, commanderId);
  assert.equal(operation.commanderIdentity.id, commanderId);
  assert.equal(operation.commanderIdentity.campaignFactionId, proxyFactionId);
  assert.equal(operation.personnelSnapshot.commander.id, commanderId);
  assert.equal(validateGroundOperation(operation).ok, true);
  assert.deepEqual(JSON.parse(JSON.stringify(operation)), operation, `${commanderId} operation must round-trip as JSON`);

  const result = createGroundResult(operation, reportFor(operation));
  assert.equal(result.schemaVersion, 3);
  assert.equal(result.kind, 'GroundResultV3');
  assert.equal(result.commanderRosterFingerprint, COMMANDER_ROSTER_PRODUCTION_FINGERPRINT_V1);
  assert.equal(result.commanderId, commanderId);
  assert.equal(result.commanderIdentity.id, commanderId);
  assert.equal(result.personnelDelta.commander.id, commanderId);
  assert.equal(validateGroundResult(operation, result).ok, true);
  assert.deepEqual(JSON.parse(JSON.stringify(result)), result, `${commanderId} result must round-trip as JSON`);

  const beforeXp = Object.fromEntries(Object.entries(launched.state.personnel.commanders).map(([id, person]) => [id, person.experience]));
  const applied = applyGroundResult(launched.state, result);
  assert.equal(applied.applied, true);
  for (const [id, experience] of Object.entries(beforeXp)) {
    const expected = id === commanderId ? experience + result.personnelDelta.commander.experience : experience;
    assert.equal(applied.state.personnel.commanders[id].experience, expected, `${commanderId} result may credit only its exact operation commander`);
  }
}

const neutral = createInitialDomainState();
const neutralEligibility = getMissionEligibility(neutral, 'uga_pale_bloom', { proxyFactionId: 'nova', commanderId: 'nova_kai' });
assert.equal(neutralEligibility.ok, false);
assert.ok(codes(neutralEligibility).includes('CAREER_COMMISSIONING_REQUIRED'));

for (const commanderId of ['legion_korr', 'nova_rhea_voss', 'keel', 'KEEL']) {
  const eligibility = getMissionEligibility(showcase(), 'uga_pale_bloom', { proxyFactionId: 'nova', commanderId });
  assert.equal(eligibility.ok, false, `${commanderId} must not enter a Nova operation`);
  assert.ok(codes(eligibility).includes('COMMANDER_INVALID'));
}

const valid = launch('nova_holt', 'nova').operation;
const staleOperation = structuredClone(valid);
staleOperation.commanderRosterFingerprint = 'fnv1a32:stale';
assert.ok(codes(validateGroundOperation(staleOperation)).includes('COMMANDER_ROSTER_FINGERPRINT_INVALID'));
const wrongIdentity = structuredClone(valid);
wrongIdentity.commanderIdentity.id = 'nova_kai';
assert.ok(codes(validateGroundOperation(wrongIdentity)).includes('COMMANDER_IDENTITY_INVALID'));

const validResult = createGroundResult(valid, reportFor(valid));
const staleResult = structuredClone(validResult);
staleResult.commanderRosterFingerprint = 'fnv1a32:stale';
assert.ok(codes(validateGroundResult(valid, staleResult)).includes('RESULT_COMMANDER_ROSTER_INVALID'));
const wrongCredit = structuredClone(validResult);
wrongCredit.personnelDelta.commander.id = 'nova_kai';
assert.ok(codes(validateGroundResult(valid, wrongCredit)).includes('RESULT_COMMANDER_MISMATCH'));

const requestV2 = createGroundOperationRequestV2(valid, {
  nonce: NONCE,
  accountId: PROFILE_ID,
  issuedAt: NOW,
  ttlMs: 60_000,
  contentVersion: 'catalog-6'
});
assert.equal(requestV2.kind, 'GroundOperationRequestV2');
assert.equal(requestV2.adapter, 'massfront-solo-v2');
assert.equal(validateGroundOperationRequestV2(requestV2, { accountId: PROFILE_ID, now: NOW + 1 }).ok, true);
const resultV2 = createGroundOperationResultV2(validResult, { nonce: NONCE, accountId: PROFILE_ID, issuedAt: NOW + 1_000 });
assert.equal(resultV2.kind, 'GroundOperationResultV2');
assert.equal(validateGroundOperationResultV2(resultV2, requestV2, { accountId: PROFILE_ID }).ok, true);
assert.equal(validateGroundOperationRequestV2({ ...requestV2, adapter: 'massfront-solo-v1' }, { accountId: PROFILE_ID, now: NOW + 1 }).ok, false);
assert.equal(validateGroundOperationResultV2({ ...resultV2, commanderRosterFingerprint: 'fnv1a32:stale' }, requestV2, { accountId: PROFILE_ID }).ok, false);

const legacyState = showcase('profile/stage9:alpha');
const legacyOperation = beginGroundOperationV2(legacyState, { missionId: 'uga_pale_bloom', proxyFactionId: 'nova' }).operation;
const legacyOperationBytes = JSON.stringify(legacyOperation);
// Deterministic ID changed with the map rung (compact drop), not with any
// identity-rule change — battlefield choice participates in the identity hash.
assert.equal(legacyOperation.operationId, 'gop_0001_63bfd8ce');
assert.equal(legacyOperation.returnToken, 'return_01452759');
assert.equal(Buffer.byteLength(legacyOperationBytes), 3147);
assert.equal(createHash('sha256').update(legacyOperationBytes).digest('hex'), 'd81b455a96c34d5f8b86cc78964543d822db8537b30cfecdbaceefbbdd219252');

const legacyResult = createGroundResult(legacyOperation, reportFor(legacyOperation));
const legacyResultBytes = JSON.stringify(legacyResult);
assert.equal(legacyResult.resultId, 'gr_0001_187a03e9');
assert.equal(Buffer.byteLength(legacyResultBytes), 1356);
assert.equal(createHash('sha256').update(legacyResultBytes).digest('hex'), '6fe9d26aa3e8caeadd64abfee8742e30a866f3fbfc9fae9ac11f24afa1f5df62');

const legacyRequest = createGroundOperationRequestV1(legacyOperation, {
  nonce: NONCE,
  accountId: legacyState.profileId,
  issuedAt: NOW,
  ttlMs: 60_000,
  contentVersion: 'catalog-6'
});
const legacyRequestBytes = JSON.stringify(legacyRequest);
assert.equal(legacyRequest.checksum, '754e2e69');
assert.equal(Buffer.byteLength(legacyRequestBytes), 3381);
assert.equal(createHash('sha256').update(legacyRequestBytes).digest('hex'), 'ad842f8c1a10be31af041f8125a9d5fa273bc7a97139437e5b7884766bb181a2');

const legacyEnvelope = createGroundOperationResultV1(legacyResult, {
  nonce: NONCE,
  accountId: legacyState.profileId,
  issuedAt: NOW + 1_000
});
const legacyEnvelopeBytes = JSON.stringify(legacyEnvelope);
assert.equal(legacyEnvelope.checksum, '3c8cd454');
assert.equal(Buffer.byteLength(legacyEnvelopeBytes), 1601);
assert.equal(createHash('sha256').update(legacyEnvelopeBytes).digest('hex'), '95f5253ba7637d310a8e3324e18db889a78e016405e3548c21aebaf56f06a952');

console.log('GroundOperationV3/GroundResultV3 commander bridge: PASS');
