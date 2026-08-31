import { CATALOG_VERSION } from './catalog.js';
import { validateCommanderRosterSnapshotV1 } from './commander_roster_contract.js';
import { deepClone, deepFreeze, hash32, stableStringify } from './deterministic.js';
import { issue } from './errors.js';
import { validateGroundOperation } from './ground_operation.js';

export const EXPLORATION_HOST_SCHEMA_VERSION = 1;
export const GROUND_OPERATION_REQUEST_ENVELOPE_VERSION = 1;
export const GROUND_OPERATION_RESULT_ENVELOPE_VERSION = 1;
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

// ExplorationHostV1 remains backward compatible. Integrated hosts may expose
// this capability; LocalSandboxHostV1 intentionally does not need to.
export const EXPLORATION_HOST_OPTIONAL_METHODS = deepFreeze([
  'loadCommanderRosterSnapshot'
]);

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function envelopeChecksum(envelope) {
  const copy = deepClone(envelope);
  delete copy.checksum;
  return hash32(copy);
}

export function validateExplorationHostV1(host) {
  const issues = [];
  if (!host || typeof host !== 'object') return { ok: false, issues: [issue('HOST_NOT_OBJECT', 'Exploration host must be an object.')] };
  if (host.schemaVersion !== EXPLORATION_HOST_SCHEMA_VERSION) issues.push(issue('HOST_VERSION_INVALID', 'Exploration host schema version is unsupported.', 'schemaVersion'));
  for (const method of HOST_METHODS) {
    if (typeof host[method] !== 'function') issues.push(issue('HOST_METHOD_MISSING', `Exploration host is missing ${method}().`, method));
  }
  for (const method of EXPLORATION_HOST_OPTIONAL_METHODS) {
    if (host[method] !== undefined && typeof host[method] !== 'function') {
      issues.push(issue('HOST_OPTIONAL_METHOD_INVALID', `Exploration host optional capability ${method} must be a function when supplied.`, method));
    }
  }
  return { ok: issues.length === 0, issues };
}

export function validateCommanderRosterHostCapabilityV1(host, snapshot) {
  const hostValidation = validateExplorationHostV1(host);
  if (!hostValidation.ok) return hostValidation;
  if (typeof host.loadCommanderRosterSnapshot !== 'function') {
    return { ok: true, supported: false, issues: [] };
  }
  const rosterValidation = validateCommanderRosterSnapshotV1(snapshot);
  return { ...rosterValidation, supported: true };
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
