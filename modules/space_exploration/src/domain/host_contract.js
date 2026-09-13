import { CATALOG_VERSION } from './catalog.js';
import { validateCommanderRosterSnapshotV1 } from './commander_roster_contract.js';
import { deepClone, deepFreeze, hash32, stableStringify } from './deterministic.js';
import { issue } from './errors.js';
import { validateGroundOperation } from './ground_operation.js';

export const EXPLORATION_HOST_SCHEMA_VERSION = 1;
export const EXPLORATION_PRODUCTION_HOST_SCHEMA_VERSION = 2;
export const COMMANDER_ROSTER_PRODUCTION_FINGERPRINT_V1 = 'fnv1a32:0aadcd2d';
export const GROUND_OPERATION_REQUEST_ENVELOPE_VERSION = 1;
export const GROUND_OPERATION_RESULT_ENVELOPE_VERSION = 1;
export const GROUND_OPERATION_REQUEST_ENVELOPE_VERSION_V2 = 2;
export const GROUND_OPERATION_RESULT_ENVELOPE_VERSION_V2 = 2;
export const MASSFRONT_SOLO_ADAPTER_V2 = 'massfront-solo-v2';
export const EXPLORATION_CONTENT_MANIFEST_VERSION = 1;

const HOST_METHODS = deepFreeze([
  'loadProfileSnapshot',
  'loadCampaignSnapshot',
  'saveCampaignSnapshot',
  'transact',
  'prepareGroundOperation',
  'consumeGroundResult',
  'launchClassicMode',
  'returnToMainMenu',
  'subscribeResult',
  'dispose'
]);

// ExplorationHostV1 remains the explicit standalone sandbox exception. A
// production host must use schema 2 and carry the source-matched roster.
export const EXPLORATION_HOST_OPTIONAL_METHODS = deepFreeze([
  'loadCommanderRosterSnapshot'
]);

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function hasExactKeys(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return stableStringify(Object.keys(value).sort()) === stableStringify([...keys].sort());
}

function envelopeChecksum(envelope) {
  const copy = deepClone(envelope);
  delete copy.checksum;
  return hash32(copy);
}

function validateHostMethods(host, issues) {
  for (const method of HOST_METHODS) {
    if (typeof host[method] !== 'function') issues.push(issue('HOST_METHOD_MISSING', `Exploration host is missing ${method}().`, method));
  }
  for (const method of EXPLORATION_HOST_OPTIONAL_METHODS) {
    if (host[method] !== undefined && typeof host[method] !== 'function') {
      issues.push(issue('HOST_OPTIONAL_METHOD_INVALID', `Exploration host optional capability ${method} must be a function when supplied.`, method));
    }
  }
}

function validateProductionRosterBinding(host, issues) {
  let loadedSnapshot = null;
  if (typeof host.loadCommanderRosterSnapshot !== 'function') {
    issues.push(issue('HOST_COMMANDER_ROSTER_CAPABILITY_MISSING', 'Production exploration hosts must expose loadCommanderRosterSnapshot().', 'loadCommanderRosterSnapshot'));
  } else {
    try {
      loadedSnapshot = host.loadCommanderRosterSnapshot();
      if (loadedSnapshot?.then) {
        issues.push(issue('HOST_COMMANDER_ROSTER_CAPABILITY_ASYNC', 'Production commander roster capability must return its immutable snapshot synchronously.', 'loadCommanderRosterSnapshot'));
        loadedSnapshot = null;
      }
    } catch (error) {
      issues.push(issue('HOST_COMMANDER_ROSTER_CAPABILITY_FAILED', error?.message || 'Production commander roster capability failed.', 'loadCommanderRosterSnapshot'));
    }
  }
  const rosterValidation = validateCommanderRosterSnapshotV1(host.commanderRosterSnapshot);
  if (!rosterValidation.ok) {
    issues.push(...rosterValidation.issues.map(entry => ({
      ...entry,
      path: entry.path ? `commanderRosterSnapshot.${entry.path}` : 'commanderRosterSnapshot'
    })));
  }
  if (host.commanderRosterFingerprint !== COMMANDER_ROSTER_PRODUCTION_FINGERPRINT_V1
    || host.commanderRosterSnapshot?.fingerprint !== COMMANDER_ROSTER_PRODUCTION_FINGERPRINT_V1) {
    issues.push(issue('HOST_COMMANDER_ROSTER_FINGERPRINT_INVALID', 'Production host commander roster fingerprint is absent or stale.', 'commanderRosterFingerprint'));
  }
  if (loadedSnapshot) {
    const loadedValidation = validateCommanderRosterSnapshotV1(loadedSnapshot);
    let matchesBoundSnapshot = false;
    try { matchesBoundSnapshot = stableStringify(loadedSnapshot) === stableStringify(host.commanderRosterSnapshot); } catch (_) {}
    if (!loadedValidation.ok
      || loadedSnapshot.fingerprint !== COMMANDER_ROSTER_PRODUCTION_FINGERPRINT_V1
      || !matchesBoundSnapshot) {
      issues.push(issue('HOST_COMMANDER_ROSTER_CAPABILITY_INVALID', 'Production roster capability does not return the exact bound commander snapshot.', 'loadCommanderRosterSnapshot'));
    }
  }
}

export function validateExplorationHostV2(host) {
  const issues = [];
  if (!host || typeof host !== 'object') return { ok: false, issues: [issue('HOST_NOT_OBJECT', 'Exploration host must be an object.')] };
  if (host.schemaVersion !== EXPLORATION_PRODUCTION_HOST_SCHEMA_VERSION || host.productionIntegrated !== true) {
    issues.push(issue('HOST_VERSION_INVALID', 'Production exploration hosts require schema 2 and production integration.', 'schemaVersion'));
  }
  validateHostMethods(host, issues);
  validateProductionRosterBinding(host, issues);
  return { ok: issues.length === 0, issues };
}

/* Keep the original validator name at the shared call site. Its only schema-1
   compatibility is the explicitly identified standalone sandbox; every
   production adapter is routed through the strict schema-2 validator. */
export function validateExplorationHostV1(host) {
  if (!host || typeof host !== 'object') return { ok: false, issues: [issue('HOST_NOT_OBJECT', 'Exploration host must be an object.')] };
  if (host.kind !== 'LocalSandboxHostV1' || host.productionIntegrated !== false) return validateExplorationHostV2(host);
  const issues = [];
  if (host.schemaVersion !== EXPLORATION_HOST_SCHEMA_VERSION) issues.push(issue('HOST_VERSION_INVALID', 'Standalone sandbox host schema version is unsupported.', 'schemaVersion'));
  validateHostMethods(host, issues);
  return { ok: issues.length === 0, issues };
}

export function validateProductionCommanderRosterHostCapabilityV2(host, snapshot) {
  const hostValidation = validateExplorationHostV2(host);
  if (!hostValidation.ok) return { ...hostValidation, supported: true };
  const candidate = snapshot || host.commanderRosterSnapshot;
  const rosterValidation = validateCommanderRosterSnapshotV1(candidate);
  const issues = [...rosterValidation.issues];
  if (candidate?.fingerprint !== COMMANDER_ROSTER_PRODUCTION_FINGERPRINT_V1
    || host.commanderRosterFingerprint !== COMMANDER_ROSTER_PRODUCTION_FINGERPRINT_V1) {
    issues.push(issue('HOST_COMMANDER_ROSTER_FINGERPRINT_INVALID', 'Production host commander roster fingerprint is absent or stale.', 'commanderRosterFingerprint'));
  }
  return { ok: issues.length === 0, supported: true, issues };
}

export function validateCommanderRosterHostCapabilityV1(host, snapshot) {
  const hostValidation = validateExplorationHostV1(host);
  if (!hostValidation.ok) return hostValidation;
  if (host.kind === 'LocalSandboxHostV1' && host.productionIntegrated === false) {
    return { ok: true, supported: false, issues: [] };
  }
  return validateProductionCommanderRosterHostCapabilityV2(host, snapshot);
}

export function createGroundOperationRequestV1(operation, options = {}) {
  const validation = validateGroundOperation(operation);
  if (!validation.ok) throw new TypeError(`Cannot envelope an invalid GroundOperation: ${validation.issues[0]?.message || 'unknown issue'}`);
  const issuedAt = Math.max(0, Math.floor(Number(options.issuedAt) || Date.now()));
  const ttlMs = Math.max(30_000, Math.min(24 * 60 * 60 * 1000, Math.floor(Number(options.ttlMs) || 30 * 60 * 1000)));
  const nonce = text(options.nonce);
  if (!nonce) throw new TypeError('GroundOperationRequestV1 requires an opaque nonce.');
  const envelope = {
    schemaVersion: GROUND_OPERATION_REQUEST_ENVELOPE_VERSION,
    kind: 'GroundOperationRequestV1',
    nonce,
    accountId: text(options.accountId) || operation.profileId,
    contentVersion: text(options.contentVersion) || `catalog-${CATALOG_VERSION}`,
    issuedAt,
    expiresAt: issuedAt + ttlMs,
    operation: deepClone(operation)
  };
  envelope.checksum = envelopeChecksum(envelope);
  return deepFreeze(envelope);
}

export function validateGroundOperationRequestV1(envelope, options = {}) {
  const issues = [];
  if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)) return { ok: false, issues: [issue('REQUEST_ENVELOPE_NOT_OBJECT', 'Ground operation request envelope must be an object.')] };
  if (envelope.schemaVersion !== GROUND_OPERATION_REQUEST_ENVELOPE_VERSION || envelope.kind !== 'GroundOperationRequestV1') issues.push(issue('REQUEST_ENVELOPE_VERSION_INVALID', 'Ground operation request envelope version is unsupported.'));
  if (!text(envelope.nonce)) issues.push(issue('REQUEST_NONCE_INVALID', 'Ground operation request nonce is required.', 'nonce'));
  if (!text(envelope.accountId) || envelope.accountId !== envelope.operation?.profileId) issues.push(issue('REQUEST_ACCOUNT_MISMATCH', 'Ground operation request account does not match its operation.', 'accountId'));
  if (options.accountId && envelope.accountId !== options.accountId) issues.push(issue('REQUEST_ACCOUNT_REJECTED', 'Ground operation request belongs to a different account.', 'accountId'));
  const now = Math.max(0, Math.floor(Number(options.now) || Date.now()));
  if (!Number.isInteger(envelope.issuedAt) || !Number.isInteger(envelope.expiresAt) || envelope.expiresAt <= envelope.issuedAt || now > envelope.expiresAt) issues.push(issue('REQUEST_EXPIRED', 'Ground operation request has expired.', 'expiresAt'));
  const operationValidation = validateGroundOperation(envelope.operation);
  issues.push(...operationValidation.issues);
  if (envelope.checksum !== envelopeChecksum(envelope)) issues.push(issue('REQUEST_CHECKSUM_INVALID', 'Ground operation request checksum does not match.', 'checksum'));
  return { ok: issues.length === 0, issues };
}

export function createGroundOperationRequestV2(operation, options = {}) {
  const validation = validateGroundOperation(operation);
  if (!validation.ok || operation.schemaVersion !== 3 || operation.kind !== 'GroundOperationV3') {
    throw new TypeError(`GroundOperationRequestV2 requires a valid GroundOperationV3: ${validation.issues[0]?.message || 'unsupported operation schema'}`);
  }
  if (operation.commanderRosterFingerprint !== COMMANDER_ROSTER_PRODUCTION_FINGERPRINT_V1) {
    throw new TypeError('GroundOperationRequestV2 requires the production commander roster fingerprint.');
  }
  const issuedAt = Math.max(0, Math.floor(Number(options.issuedAt) || Date.now()));
  const ttlMs = Math.max(30_000, Math.min(24 * 60 * 60 * 1000, Math.floor(Number(options.ttlMs) || 30 * 60 * 1000)));
  const nonce = text(options.nonce);
  if (!nonce) throw new TypeError('GroundOperationRequestV2 requires an opaque nonce.');
  const envelope = {
    schemaVersion: GROUND_OPERATION_REQUEST_ENVELOPE_VERSION_V2,
    kind: 'GroundOperationRequestV2',
    nonce,
    accountId: text(options.accountId) || operation.profileId,
    contentVersion: text(options.contentVersion) || `catalog-${CATALOG_VERSION}`,
    issuedAt,
    expiresAt: issuedAt + ttlMs,
    adapter: MASSFRONT_SOLO_ADAPTER_V2,
    commanderRosterFingerprint: COMMANDER_ROSTER_PRODUCTION_FINGERPRINT_V1,
    operation: deepClone(operation)
  };
  envelope.checksum = envelopeChecksum(envelope);
  return deepFreeze(envelope);
}

export function validateGroundOperationRequestV2(envelope, options = {}) {
  const issues = [];
  if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)) return { ok: false, issues: [issue('REQUEST_ENVELOPE_NOT_OBJECT', 'Ground operation request envelope must be an object.')] };
  if (!hasExactKeys(envelope, ['schemaVersion', 'kind', 'nonce', 'accountId', 'contentVersion', 'issuedAt', 'expiresAt', 'adapter', 'commanderRosterFingerprint', 'operation', 'checksum'])) issues.push(issue('REQUEST_ENVELOPE_FIELDS_INVALID', 'GroundOperationRequestV2 has unexpected or missing fields.'));
  if (envelope.schemaVersion !== GROUND_OPERATION_REQUEST_ENVELOPE_VERSION_V2 || envelope.kind !== 'GroundOperationRequestV2') issues.push(issue('REQUEST_ENVELOPE_VERSION_INVALID', 'Production ground operation request requires GroundOperationRequestV2.'));
  if (envelope.adapter !== MASSFRONT_SOLO_ADAPTER_V2) issues.push(issue('REQUEST_ADAPTER_INVALID', 'Production ground operation request requires massfront-solo-v2.', 'adapter'));
  if (envelope.commanderRosterFingerprint !== COMMANDER_ROSTER_PRODUCTION_FINGERPRINT_V1
    || envelope.operation?.commanderRosterFingerprint !== COMMANDER_ROSTER_PRODUCTION_FINGERPRINT_V1) issues.push(issue('REQUEST_COMMANDER_ROSTER_INVALID', 'Production ground operation request has an absent or stale commander roster fingerprint.', 'commanderRosterFingerprint'));
  if (!text(envelope.nonce)) issues.push(issue('REQUEST_NONCE_INVALID', 'Ground operation request nonce is required.', 'nonce'));
  if (!text(envelope.accountId) || envelope.accountId !== envelope.operation?.profileId) issues.push(issue('REQUEST_ACCOUNT_MISMATCH', 'Ground operation request account does not match its operation.', 'accountId'));
  if (options.accountId && envelope.accountId !== options.accountId) issues.push(issue('REQUEST_ACCOUNT_REJECTED', 'Ground operation request belongs to a different account.', 'accountId'));
  const now = Math.max(0, Math.floor(Number(options.now) || Date.now()));
  if (!Number.isInteger(envelope.issuedAt) || !Number.isInteger(envelope.expiresAt) || envelope.expiresAt <= envelope.issuedAt || now > envelope.expiresAt) issues.push(issue('REQUEST_EXPIRED', 'Ground operation request has expired.', 'expiresAt'));
  const operationValidation = validateGroundOperation(envelope.operation);
  issues.push(...operationValidation.issues);
  if (envelope.operation?.schemaVersion !== 3 || envelope.operation?.kind !== 'GroundOperationV3') issues.push(issue('REQUEST_OPERATION_VERSION_INVALID', 'Production request must carry GroundOperationV3.', 'operation'));
  if (envelope.checksum !== envelopeChecksum(envelope)) issues.push(issue('REQUEST_CHECKSUM_INVALID', 'Ground operation request checksum does not match.', 'checksum'));
  return { ok: issues.length === 0, issues };
}

export function createGroundOperationResultV1(result, options = {}) {
  const nonce = text(options.nonce);
  const accountId = text(options.accountId);
  if (!nonce || !accountId || !result?.resultId || !result?.operationId) throw new TypeError('GroundOperationResultV1 requires nonce, account ID, operation ID, and result ID.');
  const envelope = {
    schemaVersion: GROUND_OPERATION_RESULT_ENVELOPE_VERSION,
    kind: 'GroundOperationResultV1',
    nonce,
    accountId,
    operationId: result.operationId,
    resultId: result.resultId,
    issuedAt: Math.max(0, Math.floor(Number(options.issuedAt) || Date.now())),
    result: deepClone(result)
  };
  envelope.checksum = envelopeChecksum(envelope);
  return deepFreeze(envelope);
}

export function validateGroundOperationResultV1(envelope, requestEnvelope, options = {}) {
  const issues = [];
  if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)) return { ok: false, issues: [issue('RESULT_ENVELOPE_NOT_OBJECT', 'Ground operation result envelope must be an object.')] };
  if (envelope.schemaVersion !== GROUND_OPERATION_RESULT_ENVELOPE_VERSION || envelope.kind !== 'GroundOperationResultV1') issues.push(issue('RESULT_ENVELOPE_VERSION_INVALID', 'Ground operation result envelope version is unsupported.'));
  if (!requestEnvelope || envelope.nonce !== requestEnvelope.nonce || envelope.accountId !== requestEnvelope.accountId || envelope.operationId !== requestEnvelope.operation?.operationId) issues.push(issue('RESULT_REQUEST_MISMATCH', 'Ground operation result does not match its request envelope.', 'operationId'));
  if (options.accountId && envelope.accountId !== options.accountId) issues.push(issue('RESULT_ACCOUNT_REJECTED', 'Ground operation result belongs to a different account.', 'accountId'));
  if (envelope.resultId !== envelope.result?.resultId || envelope.operationId !== envelope.result?.operationId) issues.push(issue('RESULT_ID_MISMATCH', 'Ground operation result identity is inconsistent.', 'resultId'));
  if (envelope.checksum !== envelopeChecksum(envelope)) issues.push(issue('RESULT_CHECKSUM_INVALID', 'Ground operation result checksum does not match.', 'checksum'));
  return { ok: issues.length === 0, issues };
}

export function createGroundOperationResultV2(result, options = {}) {
  const nonce = text(options.nonce);
  const accountId = text(options.accountId);
  if (!nonce || !accountId || result?.schemaVersion !== 3 || result?.kind !== 'GroundResultV3' || !result?.resultId || !result?.operationId) {
    throw new TypeError('GroundOperationResultV2 requires nonce, account ID, and a GroundResultV3 identity.');
  }
  if (result.commanderRosterFingerprint !== COMMANDER_ROSTER_PRODUCTION_FINGERPRINT_V1) {
    throw new TypeError('GroundOperationResultV2 requires the production commander roster fingerprint.');
  }
  const envelope = {
    schemaVersion: GROUND_OPERATION_RESULT_ENVELOPE_VERSION_V2,
    kind: 'GroundOperationResultV2',
    nonce,
    accountId,
    operationId: result.operationId,
    resultId: result.resultId,
    issuedAt: Math.max(0, Math.floor(Number(options.issuedAt) || Date.now())),
    adapter: MASSFRONT_SOLO_ADAPTER_V2,
    commanderRosterFingerprint: COMMANDER_ROSTER_PRODUCTION_FINGERPRINT_V1,
    result: deepClone(result)
  };
  envelope.checksum = envelopeChecksum(envelope);
  return deepFreeze(envelope);
}

export function validateGroundOperationResultV2(envelope, requestEnvelope, options = {}) {
  const issues = [];
  if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)) return { ok: false, issues: [issue('RESULT_ENVELOPE_NOT_OBJECT', 'Ground operation result envelope must be an object.')] };
  if (!hasExactKeys(envelope, ['schemaVersion', 'kind', 'nonce', 'accountId', 'operationId', 'resultId', 'issuedAt', 'adapter', 'commanderRosterFingerprint', 'result', 'checksum'])) issues.push(issue('RESULT_ENVELOPE_FIELDS_INVALID', 'GroundOperationResultV2 has unexpected or missing fields.'));
  if (envelope.schemaVersion !== GROUND_OPERATION_RESULT_ENVELOPE_VERSION_V2 || envelope.kind !== 'GroundOperationResultV2') issues.push(issue('RESULT_ENVELOPE_VERSION_INVALID', 'Production ground operation result requires GroundOperationResultV2.'));
  if (!requestEnvelope || requestEnvelope.kind !== 'GroundOperationRequestV2' || envelope.nonce !== requestEnvelope.nonce || envelope.accountId !== requestEnvelope.accountId || envelope.operationId !== requestEnvelope.operation?.operationId) issues.push(issue('RESULT_REQUEST_MISMATCH', 'Ground operation result does not match its V2 request envelope.', 'operationId'));
  if (envelope.adapter !== MASSFRONT_SOLO_ADAPTER_V2 || requestEnvelope?.adapter !== MASSFRONT_SOLO_ADAPTER_V2) issues.push(issue('RESULT_ADAPTER_INVALID', 'Production result bridge requires massfront-solo-v2.', 'adapter'));
  if (envelope.commanderRosterFingerprint !== COMMANDER_ROSTER_PRODUCTION_FINGERPRINT_V1
    || requestEnvelope?.commanderRosterFingerprint !== COMMANDER_ROSTER_PRODUCTION_FINGERPRINT_V1
    || envelope.result?.commanderRosterFingerprint !== COMMANDER_ROSTER_PRODUCTION_FINGERPRINT_V1) issues.push(issue('RESULT_COMMANDER_ROSTER_INVALID', 'Production result bridge has an absent or stale commander roster fingerprint.', 'commanderRosterFingerprint'));
  if (options.accountId && envelope.accountId !== options.accountId) issues.push(issue('RESULT_ACCOUNT_REJECTED', 'Ground operation result belongs to a different account.', 'accountId'));
  if (envelope.resultId !== envelope.result?.resultId || envelope.operationId !== envelope.result?.operationId || envelope.result?.schemaVersion !== 3 || envelope.result?.kind !== 'GroundResultV3') issues.push(issue('RESULT_ID_MISMATCH', 'Ground operation result identity or schema is inconsistent.', 'resultId'));
  if (envelope.checksum !== envelopeChecksum(envelope)) issues.push(issue('RESULT_CHECKSUM_INVALID', 'Ground operation result checksum does not match.', 'checksum'));
  return { ok: issues.length === 0, issues };
}

export function createExplorationContentManifestV1(entries, options = {}) {
  const files = (Array.isArray(entries) ? entries : []).map(entry => ({
    path: text(entry.path),
    bytes: Math.max(0, Math.floor(Number(entry.bytes) || 0)),
    hash: text(entry.hash),
    kind: text(entry.kind) || 'runtime'
  })).filter(entry => entry.path && entry.hash);
  files.sort((a, b) => a.path.localeCompare(b.path));
  const manifest = {
    schemaVersion: EXPLORATION_CONTENT_MANIFEST_VERSION,
    kind: 'ExplorationContentManifestV1',
    contentVersion: text(options.contentVersion) || `catalog-${CATALOG_VERSION}`,
    compatibleGameRange: text(options.compatibleGameRange) || '*',
    optional: true,
    resumable: true,
    installed: Boolean(options.installed),
    totalBytes: files.reduce((sum, entry) => sum + entry.bytes, 0),
    files
  };
  manifest.hash = hash32(stableStringify(manifest));
  return deepFreeze(manifest);
}
