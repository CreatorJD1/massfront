/* --------------------------------------------------------------------------
   MASSFRONT GALACTIC EXPLORATION — LOCAL EXPLORATIONHOSTV1

   This is the standalone experimental adapter. It deliberately cannot launch
   or mutate production MASSFRONT. Ground-operation payloads stay in this
   module's storage; a URL may carry only the opaque nonce.
   -------------------------------------------------------------------------- */

import {
  ACCOUNT_PROFILE_STORAGE_KEY,
  CATALOG_VERSION,
  EXPLORATION_HOST_SCHEMA_VERSION,
  applyAccountProfile,
  createGroundOperationRequestV1,
  createGroundOperationResultV1,
  createInitialAccountProfile,
  createMemoryStorage,
  deserializeAccountProfile,
  deserializeDomainState,
  projectAccountProfile,
  serializeAccountProfile,
  serializeDomainState,
  validateGroundOperationRequestV1,
  validateGroundOperationResultV1,
  validateGroundResult
} from '../domain/index.js';
import { createHostDatabase } from './host_database.js';

export const LOCAL_EXPLORATION_CAMPAIGN_STORAGE_KEY = 'massfront.space_exploration.domain_state';
export const EXPLORATION_BRIDGE_RECORD_VERSION = 1;
export const EXPLORATION_RESULT_RECEIPT_VERSION = 1;

const OPAQUE_NONCE_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;

function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}

function localStorageOrMemory() {
  try {
    if (globalThis.localStorage) return globalThis.localStorage;
  } catch (_) {
    // Native/webview privacy modes may expose but deny localStorage.
  }
  return createMemoryStorage();
}

function secureOpaqueNonce() {
  const cryptoApi = globalThis.crypto;
  if (!cryptoApi || typeof cryptoApi.getRandomValues !== 'function') throw new ExplorationHostError('SECURE_NONCE_UNAVAILABLE', 'A cryptographically secure nonce generator is required.');
  const bytes = new Uint8Array(16);
  cryptoApi.getRandomValues(bytes);
  return [...bytes].map(value => value.toString(16).padStart(2, '0')).join('');
}

function integerTime(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.floor(number)) : fallback;
}

function errorCodes(validation) {
  return (validation?.issues || []).map(entry => entry.code).filter(Boolean);
}

function ensureOpaqueNonce(nonce) {
  if (!OPAQUE_NONCE_PATTERN.test(String(nonce || ''))) throw new ExplorationHostError('NONCE_NOT_OPAQUE', 'Ground-operation nonce must be 16–128 URL-safe opaque characters.');
  return String(nonce);
}

function ensureValidation(validation, code, message) {
  if (validation?.ok) return;
  throw new ExplorationHostError(code, message, { issues: validation?.issues || [] });
}

export class ExplorationHostError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'ExplorationHostError';
    this.code = code;
    this.details = details;
    this.issues = details.issues || [];
  }
}

export class LocalSandboxHost {
  constructor({
    storage = localStorageOrMemory(),
    key = LOCAL_EXPLORATION_CAMPAIGN_STORAGE_KEY,
    profileKey = ACCOUNT_PROFILE_STORAGE_KEY,
    accountId = null,
    database = null,
    indexedDB = globalThis.indexedDB,
    databaseName,
    databasePrefix,
    now = () => Date.now(),
    nonceFactory = secureOpaqueNonce,
    requestTtlMs = 30 * 60 * 1000,
    contentVersion = `catalog-${CATALOG_VERSION}`
  } = {}) {
    if (!storage || typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function') throw new TypeError('LocalSandboxHost requires a Storage-compatible object.');
    if (typeof now !== 'function' || typeof nonceFactory !== 'function') throw new TypeError('LocalSandboxHost requires time and nonce functions.');
    this.schemaVersion = EXPLORATION_HOST_SCHEMA_VERSION;
    this.kind = 'LocalSandboxHostV1';
    this.productionIntegrated = false;
    this.storage = storage;
    this.key = key;
    this.profileKey = profileKey;
    this.now = now;
    this.nonceFactory = nonceFactory;
    this.requestTtlMs = Math.max(30_000, Math.min(24 * 60 * 60 * 1000, integerTime(requestTtlMs, 30 * 60 * 1000)));
    this.contentVersion = String(contentVersion || `catalog-${CATALOG_VERSION}`);
    this.accountId = String(accountId || this.resolveStoredAccountId() || 'local_expedition');
    this.database = database || createHostDatabase({ indexedDB, storage, name: databaseName, prefix: databasePrefix });
    this.pendingNonce = null;
    this.pendingPersistence = new Map();
    this.resultListeners = new Set();
    this.lastError = null;
  }

  resolveStoredAccountId() {
    try {
      const profile = this.storage.getItem(this.profileKey);
      if (profile) return deserializeAccountProfile(profile).profileId;
    } catch (_) {}
    try {
      const campaign = this.storage.getItem(this.key);
      if (campaign) return deserializeDomainState(campaign).profileId;
    } catch (_) {}
    return null;
  }

  loadProfileSnapshot() {
    const serialized = this.storage.getItem(this.profileKey);
    if (!serialized) return createInitialAccountProfile(this.accountId);
    try {
      const profile = deserializeAccountProfile(serialized);
      if (profile.profileId !== this.accountId) throw new ExplorationHostError('PROFILE_ACCOUNT_MISMATCH', 'Stored profile belongs to a different account.');
      return profile;
    } catch (error) {
      if (error instanceof ExplorationHostError) throw error;
      return createInitialAccountProfile(this.accountId);
    }
  }

  loadSnapshot() {
    const serialized = this.storage.getItem(this.key);
    if (!serialized) return null;
    try {
      const campaign = deserializeDomainState(serialized);
      if (campaign.profileId !== this.accountId) throw new ExplorationHostError('CAMPAIGN_ACCOUNT_MISMATCH', 'Stored Galactic campaign belongs to a different account.');
      return applyAccountProfile(campaign, this.loadProfileSnapshot());
    } catch (error) {
      this.lastError = error;
      return null;
    }
  }

  loadCampaignSnapshot() {
    return this.loadSnapshot();
  }

  saveSnapshot(state) {
    if (!state || state.profileId !== this.accountId) throw new ExplorationHostError('CAMPAIGN_ACCOUNT_MISMATCH', 'Cannot save a Galactic campaign for another account.');
    this.storage.setItem(this.key, serializeDomainState(state));
    const profile = projectAccountProfile(state, this.loadProfileSnapshot());
    this.storage.setItem(this.profileKey, serializeAccountProfile(profile));
    return state;
  }

  saveCampaignSnapshot(state) {
    return this.saveSnapshot(state);
  }

  transact(command) {
    return Promise.resolve({ accepted: true, localOnly: true, productionIntegrated: false, command: clone(command) });
  }

  async prepareGroundOperation(operationOrEnvelope) {
    const issuedAt = integerTime(this.now(), Date.now());
    let request;
    if (operationOrEnvelope?.kind === 'GroundOperationRequestV1') {
      request = operationOrEnvelope;
    } else {
      const nonce = ensureOpaqueNonce(this.nonceFactory());
      request = createGroundOperationRequestV1(operationOrEnvelope, {
        nonce,
        accountId: this.accountId,
        issuedAt,
        ttlMs: this.requestTtlMs,
        contentVersion: this.contentVersion
      });
    }
    ensureOpaqueNonce(request.nonce);
    const validation = validateGroundOperationRequestV1(request, { accountId: this.accountId, now: issuedAt });
    ensureValidation(validation, 'GROUND_REQUEST_REJECTED', `Ground operation request was rejected: ${errorCodes(validation).join(', ') || 'invalid request'}.`);
    if (request.contentVersion !== this.contentVersion) throw new ExplorationHostError('REQUEST_CONTENT_VERSION_MISMATCH', 'Ground operation request targets incompatible exploration content.');

    const record = {
      schemaVersion: EXPLORATION_BRIDGE_RECORD_VERSION,
      kind: 'ExplorationBridgeRecordV1',
      nonce: request.nonce,
      accountId: request.accountId,
      operationId: request.operation.operationId,
      request: clone(request),
      resume: {
        route: clone(request.operation.returnRoute),
        roomId: request.operation.returnRoute?.districtId ||
          (request.operation.returnRoute?.scene === 'uga' ? request.operation.returnRoute?.targetId || null : null)
      }
    };
    this.pendingNonce = request.nonce;
    const persistence = this.database.putRequest(record);
    this.pendingPersistence.set(request.nonce, persistence);
    try {
      await persistence;
    } finally {
      this.pendingPersistence.delete(request.nonce);
    }
    return {
      accepted: true,
      localOnly: true,
      productionIntegrated: false,
      adapter: 'local-sandbox-v1',
      operationId: request.operation.operationId,
      nonce: request.nonce,
      expiresAt: request.expiresAt,
      urlSearch: `?groundOperation=${encodeURIComponent(request.nonce)}`,
      resume: clone(record.resume)
    };
  }

  launchGroundOperation(operation) {
    return this.prepareGroundOperation(operation);
  }

  async loadGroundOperationRequest(nonce) {
    ensureOpaqueNonce(nonce);
    const record = await this.database.getRequest(nonce);
    if (!record) return null;
    this.validateBridgeRecord(record);
    const validation = validateGroundOperationRequestV1(record.request, { accountId: this.accountId, now: integerTime(this.now(), Date.now()) });
    ensureValidation(validation, 'GROUND_REQUEST_REJECTED', `Stored ground operation request was rejected: ${errorCodes(validation).join(', ') || 'invalid request'}.`);
    return clone(record.request);
  }

  validateBridgeRecord(record) {
    if (!record || record.schemaVersion !== EXPLORATION_BRIDGE_RECORD_VERSION || record.kind !== 'ExplorationBridgeRecordV1') throw new ExplorationHostError('BRIDGE_RECORD_SCHEMA_MISMATCH', 'Stored operation bridge record uses an unsupported schema.');
    if (record.accountId !== this.accountId || record.request?.accountId !== this.accountId) throw new ExplorationHostError('BRIDGE_RECORD_ACCOUNT_MISMATCH', 'Stored operation bridge record belongs to another account.');
    if (record.nonce !== record.request?.nonce || record.operationId !== record.request?.operation?.operationId) throw new ExplorationHostError('BRIDGE_RECORD_IDENTITY_MISMATCH', 'Stored operation bridge identity is inconsistent.');
  }

  createResultReceipt(record, envelope, { targetNonce, ledgerKey, consumedAt }) {
    this.validateBridgeRecord(record);
    const request = record.request;
    const requestValidation = validateGroundOperationRequestV1(request, { accountId: this.accountId, now: consumedAt });
    ensureValidation(requestValidation, 'GROUND_REQUEST_REJECTED', `Ground operation request was rejected: ${errorCodes(requestValidation).join(', ') || 'invalid request'}.`);
    const resultValidation = validateGroundOperationResultV1(envelope, request, { accountId: this.accountId });
    ensureValidation(resultValidation, 'GROUND_RESULT_REJECTED', `Ground operation result was rejected: ${errorCodes(resultValidation).join(', ') || 'invalid result'}.`);
    if (!Number.isInteger(envelope.issuedAt) || envelope.issuedAt < request.issuedAt || envelope.issuedAt > request.expiresAt || consumedAt > request.expiresAt) throw new ExplorationHostError('RESULT_EXPIRED', 'Ground operation result is outside its request validity window.');
    const groundValidation = validateGroundResult(request.operation, envelope.result);
    ensureValidation(groundValidation, 'GROUND_RESULT_PAYLOAD_REJECTED', `Ground operation result payload was rejected: ${errorCodes(groundValidation).join(', ') || 'invalid result payload'}.`);
    return {
      schemaVersion: EXPLORATION_RESULT_RECEIPT_VERSION,
      kind: 'ExplorationResultReceiptV1',
      ledgerKey,
      nonce: targetNonce,
      accountId: this.accountId,
      operationId: envelope.operationId,
      resultId: envelope.resultId,
      consumedAt,
      resume: clone(record.resume)
    };
  }

  async consumeGroundResult(resultOrEnvelope, { nonce = null } = {}) {
    const consumedAt = integerTime(this.now(), Date.now());
    const targetNonce = ensureOpaqueNonce(resultOrEnvelope?.kind === 'GroundOperationResultV1'
      ? resultOrEnvelope.nonce
      : (nonce || this.pendingNonce));
    const pendingPersistence = this.pendingPersistence.get(targetNonce);
    if (pendingPersistence) await pendingPersistence;
    const envelope = resultOrEnvelope?.kind === 'GroundOperationResultV1'
      ? resultOrEnvelope
      : createGroundOperationResultV1(resultOrEnvelope, {
          nonce: targetNonce,
          accountId: this.accountId,
          issuedAt: consumedAt
        });
    const ledgerKey = `${this.accountId}:${envelope.resultId}`;
    const receiptOptions = { targetNonce, ledgerKey, consumedAt };
    const preflightRecord = await this.database.getRequest(targetNonce);
    if (!preflightRecord) throw new ExplorationHostError('GROUND_REQUEST_NOT_FOUND', 'No stored ground-operation request matches this nonce.');
    // Validate before consulting the ledger so a malformed envelope cannot be
    // disguised as a harmless duplicate by borrowing an accepted result ID.
    this.createResultReceipt(preflightRecord, envelope, receiptOptions);
    const outcome = await this.database.consumeOnce({
      nonce: targetNonce,
      ledgerKey,
      accept: record => this.createResultReceipt(record, envelope, receiptOptions)
    });

    if (outcome.status === 'missing') throw new ExplorationHostError('GROUND_REQUEST_NOT_FOUND', 'No stored ground-operation request matches this nonce.');
    if (outcome.status === 'duplicate') {
      return {
        accepted: false,
        duplicate: true,
        localOnly: true,
        resultId: envelope.resultId,
        resume: clone(outcome.receipt?.resume || null)
      };
    }
    this.pendingNonce = this.pendingNonce === targetNonce ? null : this.pendingNonce;
    this.emitValidatedResult(envelope.result);
    return {
      accepted: true,
      duplicate: false,
      localOnly: true,
      resultId: envelope.resultId,
      resume: clone(outcome.receipt.resume)
    };
  }

  emitResult(result) {
    const pending = this.consumeGroundResult(result);
    pending.catch(error => { this.lastError = error; });
    return pending;
  }

  emitValidatedResult(result) {
    for (const listener of [...this.resultListeners]) listener(clone(result));
  }

  subscribeResult(listener) {
    if (typeof listener !== 'function') throw new TypeError('subscribeResult requires a function.');
    this.resultListeners.add(listener);
    return () => this.resultListeners.delete(listener);
  }

  async getResumePoint(nonce) {
    ensureOpaqueNonce(nonce);
    const record = await this.database.getRequest(nonce);
    if (!record) return null;
    this.validateBridgeRecord(record);
    return clone(record.resume);
  }

  launchClassicMode(request) {
    // Classic is deliberately outside the Galactic operation/request ledger.
    // No campaign/profile write and no expedition-cycle advancement occurs.
    return Promise.resolve({
      accepted: true,
      localOnly: true,
      isolatedFromGalacticCampaign: true,
      productionIntegrated: false,
      request: clone(request)
    });
  }

  returnToMainMenu() {
    return Promise.resolve({ accepted: true, localOnly: true, productionIntegrated: false });
  }

  dispose() {
    this.pendingNonce = null;
    this.pendingPersistence.clear();
    this.resultListeners.clear();
    try { this.database.close(); } catch (_) {}
  }
}

export function createExplorationHostV1(options = {}) {
  return new LocalSandboxHost(options);
}
