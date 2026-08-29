/* --------------------------------------------------------------------------
   MASSFRONT GALACTIC EXPLORATION — INTEGRATED SOLO HOST

   This adapter is selected only after the base game leaves a short-lived
   same-tab entry ticket. Durable campaign state and the exactly-once result
   ledger remain owned by LocalSandboxHost; sessionStorage carries only an
   opaque tactical nonce plus source-matched request/result mirrors.
   -------------------------------------------------------------------------- */

import {
  createGroundOperationResultV1,
  createGroundResult,
  createInitialDomainState
} from '../domain/index.js';
import { hash32, stableStringify } from '../domain/deterministic.js';
import {
  ExplorationHostError,
  LocalSandboxHost
} from './local_sandbox_host.js';

export const MASSFRONT_GALACTIC_ENTRY_TICKET_KEY = 'massfront.galactic.entry.v1';
export const MASSFRONT_GALACTIC_REQUEST_MIRROR_PREFIX = 'massfront.galactic.request.v1.';
export const MASSFRONT_GALACTIC_RESULT_MIRROR_PREFIX = 'massfront.galactic.result.v1.';
export const MASSFRONT_SOLO_HOST_KIND = 'MassfrontSoloHostV1';

const ENTRY_TICKET_KIND = 'MassfrontGalacticEntryV1';
const REQUEST_MIRROR_KIND = 'MassfrontGalacticRequestMirrorV1';
const TACTICAL_REPORT_KIND = 'MassfrontGalacticTacticalReportV1';
const ENTRY_TICKET_SOURCE = 'massfront-base';
const INTEGRATED_NAMESPACE = 'massfront.galactic.solo.v1';
const INTEGRATED_OPERATION_TTL_MS = 24 * 60 * 60 * 1000;
const ENTRY_TICKET_TTL_MS = 7 * INTEGRATED_OPERATION_TTL_MS;
const OPAQUE_NONCE_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;
const ALLOWED_PROXY_FACTIONS = new Set(['nova', 'dominion', 'syndicate']);

function integerTime(value, fallback = Date.now()) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.floor(number)) : fallback;
}

function nowFrom(value) {
  return integerTime(typeof value === 'function' ? value() : value);
}

function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}

function issue(code, message, path = '') {
  return { code, message, path };
}

function browserSessionStorage() {
  try {
    if (globalThis.sessionStorage) return globalThis.sessionStorage;
  } catch (_) {
    // A denied sessionStorage cannot support a same-tab production bridge.
  }
  return null;
}

function defaultNavigation(url) {
  if (!globalThis.location || typeof globalThis.location.assign !== 'function') {
    throw new ExplorationHostError('GALACTIC_NAVIGATION_UNAVAILABLE', 'Same-tab MASSFRONT navigation is unavailable.');
  }
  globalThis.location.assign(url);
}

function requireStorage(storage) {
  if (!storage || typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function' || typeof storage.removeItem !== 'function') {
    throw new ExplorationHostError('GALACTIC_SESSION_STORAGE_UNAVAILABLE', 'The integrated solo bridge requires readable and writable sessionStorage.');
  }
  return storage;
}

function requireOpaqueNonce(nonce) {
  const value = String(nonce || '');
  if (!OPAQUE_NONCE_PATTERN.test(value)) throw new ExplorationHostError('NONCE_NOT_OPAQUE', 'Galactic operation nonce must be 16–128 URL-safe opaque characters.');
  return value;
}

function parseStoredJson(storage, key, code, message) {
  let serialized;
  try {
    serialized = storage.getItem(key);
  } catch (error) {
    throw new ExplorationHostError(code, message, { cause: error });
  }
  if (serialized === null) return null;
  try {
    return JSON.parse(serialized);
  } catch (error) {
    throw new ExplorationHostError(code, message, { cause: error });
  }
}

function writeAndReadJson(storage, key, value, code, message) {
  let serialized;
  try {
    serialized = JSON.stringify(value);
    storage.setItem(key, serialized);
  } catch (error) {
    throw new ExplorationHostError(code, message, { cause: error });
  }
  const restored = parseStoredJson(storage, key, code, message);
  if (!restored || stableStringify(restored) !== stableStringify(value)) {
    throw new ExplorationHostError(code, message);
  }
  return restored;
}

function withoutChecksum(value) {
  const copy = clone(value);
  if (copy && typeof copy === 'object') delete copy.checksum;
  return copy;
}

export function sanitizeMassfrontProfileId(profileId) {
  const source = typeof profileId === 'string' ? profileId.trim() : '';
  if (!source) throw new ExplorationHostError('GALACTIC_PROFILE_INVALID', 'A MASSFRONT profile ID is required for the integrated solo host.');
  const slug = source
    .normalize('NFKC')
    .replace(/[^A-Za-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48) || 'profile';
  // The hash prevents different player-controlled IDs that sanitize to the
  // same slug from ever sharing campaign, IndexedDB, or fallback records.
  return `${slug}_${hash32(source)}`;
}

export function massfrontSoloStorageNamespace(profileId) {
  const safeProfileId = sanitizeMassfrontProfileId(profileId);
  return Object.freeze({
    safeProfileId,
    domainKey: `${INTEGRATED_NAMESPACE}.domain.${safeProfileId}`,
    profileKey: `${INTEGRATED_NAMESPACE}.profile.${safeProfileId}`,
    databaseName: `${INTEGRATED_NAMESPACE}.host.${safeProfileId}`,
    databasePrefix: `${INTEGRATED_NAMESPACE}.host.${safeProfileId}`
  });
}

export function createMassfrontGalacticEntryTicket(profileId, options = {}) {
  const normalizedProfileId = typeof profileId === 'string' ? profileId.trim() : '';
  if (!normalizedProfileId) throw new TypeError('MassfrontGalacticEntryV1 requires a profile ID.');
  const issuedAt = integerTime(options.issuedAt, Date.now());
  const ttlMs = Math.max(30_000, Math.min(ENTRY_TICKET_TTL_MS, integerTime(options.ttlMs, ENTRY_TICKET_TTL_MS)));
  return Object.freeze({
    schemaVersion: 1,
    kind: ENTRY_TICKET_KIND,
    profileId: normalizedProfileId,
    issuedAt,
    expiresAt: issuedAt + ttlMs,
    source: ENTRY_TICKET_SOURCE
  });
}

export function validateMassfrontGalacticEntryTicket(ticket, options = {}) {
  const issues = [];
  if (!ticket || typeof ticket !== 'object' || Array.isArray(ticket)) {
    return { ok: false, issues: [issue('GALACTIC_ENTRY_NOT_OBJECT', 'Galactic entry ticket must be an object.')], ticket: null };
  }
  if (ticket.schemaVersion !== 1 || ticket.kind !== ENTRY_TICKET_KIND) issues.push(issue('GALACTIC_ENTRY_SCHEMA_INVALID', 'Galactic entry ticket schema is unsupported.'));
  if (ticket.source !== ENTRY_TICKET_SOURCE) issues.push(issue('GALACTIC_ENTRY_SOURCE_INVALID', 'Galactic entry ticket was not issued by MASSFRONT.', 'source'));
  const profileId = typeof ticket.profileId === 'string' ? ticket.profileId.trim() : '';
  if (!profileId || profileId !== ticket.profileId) issues.push(issue('GALACTIC_ENTRY_PROFILE_INVALID', 'Galactic entry ticket profile ID is invalid.', 'profileId'));
  if (options.profileId && profileId !== options.profileId) issues.push(issue('GALACTIC_ENTRY_PROFILE_MISMATCH', 'Galactic entry ticket belongs to another profile.', 'profileId'));
  const now = nowFrom(options.now === undefined ? Date.now() : options.now);
  if (!Number.isInteger(ticket.issuedAt) || !Number.isInteger(ticket.expiresAt) || ticket.issuedAt < 0 || ticket.expiresAt <= ticket.issuedAt || ticket.expiresAt - ticket.issuedAt > ENTRY_TICKET_TTL_MS) {
    issues.push(issue('GALACTIC_ENTRY_TIME_INVALID', 'Galactic entry ticket validity window is invalid.', 'expiresAt'));
  } else {
    if (ticket.issuedAt > now) issues.push(issue('GALACTIC_ENTRY_NOT_YET_VALID', 'Galactic entry ticket is not yet valid.', 'issuedAt'));
    if (ticket.expiresAt <= now) issues.push(issue('GALACTIC_ENTRY_EXPIRED', 'Galactic entry ticket has expired.', 'expiresAt'));
  }
  return { ok: issues.length === 0, issues, ticket: issues.length ? null : clone(ticket) };
}

export function readMassfrontGalacticEntryTicket(storage = browserSessionStorage(), options = {}) {
  if (!storage || typeof storage.getItem !== 'function') return null;
  let serialized;
  try {
    serialized = storage.getItem(MASSFRONT_GALACTIC_ENTRY_TICKET_KEY);
  } catch (_) {
    return null;
  }
  if (!serialized) return null;
  let ticket;
  try {
    ticket = JSON.parse(serialized);
  } catch (_) {
    return null;
  }
  const validation = validateMassfrontGalacticEntryTicket(ticket, options);
  return validation.ok ? validation.ticket : null;
}

export function massfrontGalacticTacticalReportChecksum(envelope) {
  return hash32(withoutChecksum(envelope));
}

export function createMassfrontGalacticTacticalReportV1({ nonce, accountId, operationId, issuedAt = Date.now(), report }) {
  const envelope = {
    schemaVersion: 1,
    kind: TACTICAL_REPORT_KIND,
    nonce: requireOpaqueNonce(nonce),
    accountId: String(accountId || ''),
    operationId: String(operationId || ''),
    issuedAt: integerTime(issuedAt),
    report: clone(report)
  };
  envelope.checksum = massfrontGalacticTacticalReportChecksum(envelope);
  return Object.freeze(envelope);
}

export class MassfrontSoloHost extends LocalSandboxHost {
  constructor({
    sessionStorage = browserSessionStorage(),
    expectedProfileId = null,
    navigation = defaultNavigation,
    storage,
    database = null,
    indexedDB = globalThis.indexedDB,
    now = () => Date.now(),
    nonceFactory,
    requestTtlMs = INTEGRATED_OPERATION_TTL_MS,
    contentVersion
  } = {}) {
    const bridgeStorage = requireStorage(sessionStorage);
    const rawTicket = parseStoredJson(
      bridgeStorage,
      MASSFRONT_GALACTIC_ENTRY_TICKET_KEY,
      'GALACTIC_ENTRY_TICKET_UNREADABLE',
      'The MASSFRONT Galactic entry ticket could not be read.'
    );
    const validation = validateMassfrontGalacticEntryTicket(rawTicket, { profileId: expectedProfileId, now });
    if (!validation.ok) {
      throw new ExplorationHostError('GALACTIC_ENTRY_TICKET_REJECTED', 'The MASSFRONT Galactic entry ticket is invalid or expired.', { issues: validation.issues });
    }
    if (typeof navigation !== 'function') throw new TypeError('MassfrontSoloHost requires a navigation function.');
    const ticket = validation.ticket;
    const namespace = massfrontSoloStorageNamespace(ticket.profileId);
    super({
      storage,
      key: namespace.domainKey,
      profileKey: namespace.profileKey,
      accountId: ticket.profileId,
      database,
      indexedDB,
      databaseName: namespace.databaseName,
      databasePrefix: namespace.databasePrefix,
      now,
      nonceFactory,
      requestTtlMs,
      contentVersion
    });
    this.kind = MASSFRONT_SOLO_HOST_KIND;
    this.productionIntegrated = true;
    this.ticket = Object.freeze(ticket);
    this.namespace = namespace;
    this.bridgeStorage = bridgeStorage;
    this.navigation = navigation;
  }

  loadCampaignSnapshot() {
    const saved = super.loadCampaignSnapshot();
    if (saved) {
      if (!this.pendingNonce && saved.operations?.pending?.operationId) {
        this.pendingNonce = this.findRequestMirrorNonce(saved.operations.pending.operationId);
      }
      return saved;
    }
    // createSpaceExperience has a deliberately standalone default profile.
    // Seed this namespace with the ticket identity before its LocalDomainStore
    // is constructed so integrated state can never become local_expedition.
    const initial = createInitialDomainState();
    initial.profileId = this.accountId;
    return initial;
  }

  findRequestMirrorNonce(operationId) {
    if (!operationId || typeof this.bridgeStorage.key !== 'function' || !Number.isInteger(this.bridgeStorage.length)) return null;
    const keys = [];
    for (let index = 0; index < this.bridgeStorage.length; index += 1) {
      const key = this.bridgeStorage.key(index);
      if (typeof key === 'string' && key.startsWith(MASSFRONT_GALACTIC_REQUEST_MIRROR_PREFIX)) keys.push(key);
    }
    keys.sort();
    for (const key of keys) {
      try {
        const mirror = parseStoredJson(this.bridgeStorage, key, 'GALACTIC_REQUEST_MIRROR_FAILED', 'The Galactic request mirror could not be restored.');
        const nonce = key.slice(MASSFRONT_GALACTIC_REQUEST_MIRROR_PREFIX.length);
        if (mirror?.schemaVersion === 1
          && mirror.kind === REQUEST_MIRROR_KIND
          && mirror.nonce === nonce
          && mirror.accountId === this.accountId
          && mirror.operationId === operationId
          && mirror.request?.nonce === nonce
          && mirror.request?.accountId === this.accountId
          && mirror.request?.operation?.operationId === operationId
          && OPAQUE_NONCE_PATTERN.test(nonce)) return nonce;
      } catch (_) {
        // A malformed or foreign mirror is never allowed to claim pending work.
      }
    }
    return null;
  }

  requestMirrorKey(nonce) {
    return `${MASSFRONT_GALACTIC_REQUEST_MIRROR_PREFIX}${requireOpaqueNonce(nonce)}`;
  }

  resultMirrorKey(nonce) {
    return `${MASSFRONT_GALACTIC_RESULT_MIRROR_PREFIX}${requireOpaqueNonce(nonce)}`;
  }

  validateIntegratedOperation(operationOrEnvelope) {
    const operation = operationOrEnvelope?.kind === 'GroundOperationRequestV1'
      ? operationOrEnvelope.operation
      : operationOrEnvelope;
    const allowed = operation?.missionId === 'uga_pale_bloom'
      && operation?.sponsorId === 'uga'
      && operation?.opponentFactionId === 'brood'
      && ALLOWED_PROXY_FACTIONS.has(operation?.proxyFactionId)
      && operation?.playerFactionId === operation?.proxyFactionId;
    if (!allowed) {
      throw new ExplorationHostError(
        'GALACTIC_OPERATION_OUT_OF_SCOPE',
        'The integrated solo adapter accepts only UGA Pale Bloom operations against the Brood with a resident proxy faction.'
      );
    }
    return operation;
  }

  async prepareGroundOperation(operationOrEnvelope) {
    this.validateIntegratedOperation(operationOrEnvelope);
    const prepared = await super.prepareGroundOperation(operationOrEnvelope);
    const request = await this.loadGroundOperationRequest(prepared.nonce);
    if (!request) throw new ExplorationHostError('GROUND_REQUEST_NOT_FOUND', 'The persisted Galactic operation request could not be read back.');
    const mirror = {
      schemaVersion: 1,
      kind: REQUEST_MIRROR_KIND,
      nonce: request.nonce,
      accountId: this.accountId,
      operationId: request.operation.operationId,
      request: clone(request)
    };
    const restored = writeAndReadJson(
      this.bridgeStorage,
      this.requestMirrorKey(request.nonce),
      mirror,
      'GALACTIC_REQUEST_MIRROR_FAILED',
      'The Galactic operation request could not be mirrored for MASSFRONT.'
    );
    if (restored.nonce !== request.nonce || restored.accountId !== this.accountId || restored.operationId !== request.operation.operationId || stableStringify(restored.request) !== stableStringify(request)) {
      throw new ExplorationHostError('GALACTIC_REQUEST_MIRROR_FAILED', 'The Galactic operation request mirror failed identity verification.');
    }
    const launchUrl = `../../../index.html?groundOperation=${encodeURIComponent(request.nonce)}`;
    return {
      ...prepared,
      localOnly: false,
      productionIntegrated: true,
      adapter: 'massfront-solo-v1',
      launchUrl,
      url: launchUrl
    };
  }

  async openGroundOperation(prepared) {
    const nonce = requireOpaqueNonce(prepared?.nonce);
    if (!prepared?.accepted || prepared.adapter !== 'massfront-solo-v1') {
      throw new ExplorationHostError('GALACTIC_LAUNCH_NOT_PREPARED', 'A verified integrated Galactic operation is required before navigation.');
    }
    const request = await this.loadGroundOperationRequest(nonce);
    if (!request) throw new ExplorationHostError('GROUND_REQUEST_NOT_FOUND', 'No persisted Galactic operation request matches this launch.');
    const launchUrl = `../../../index.html?groundOperation=${encodeURIComponent(nonce)}`;
    await this.navigation(launchUrl);
    return { opened: true, productionIntegrated: true, adapter: 'massfront-solo-v1', nonce, launchUrl };
  }

  validateTacticalMirror(mirror, nonce, request, now) {
    const issues = [];
    if (!mirror || typeof mirror !== 'object' || Array.isArray(mirror)) {
      issues.push(issue('TACTICAL_REPORT_NOT_OBJECT', 'Tactical result mirror must be an object.'));
    } else {
      if (mirror.schemaVersion !== 1 || mirror.kind !== TACTICAL_REPORT_KIND) issues.push(issue('TACTICAL_REPORT_SCHEMA_INVALID', 'Tactical result mirror schema is unsupported.'));
      if (mirror.nonce !== nonce || mirror.accountId !== this.accountId || mirror.operationId !== request.operation.operationId) issues.push(issue('TACTICAL_REPORT_IDENTITY_MISMATCH', 'Tactical result mirror does not match its Galactic request.', 'operationId'));
      if (!Number.isInteger(mirror.issuedAt) || mirror.issuedAt < request.issuedAt || mirror.issuedAt > request.expiresAt || mirror.issuedAt > now || now > request.expiresAt) issues.push(issue('TACTICAL_REPORT_TIME_INVALID', 'Tactical result mirror is outside its request validity window.', 'issuedAt'));
      let expectedChecksum = null;
      try { expectedChecksum = massfrontGalacticTacticalReportChecksum(mirror); } catch (_) {}
      if (!expectedChecksum || mirror.checksum !== expectedChecksum) issues.push(issue('TACTICAL_REPORT_CHECKSUM_INVALID', 'Tactical result mirror checksum does not match.', 'checksum'));
      if (!mirror.report || typeof mirror.report !== 'object' || Array.isArray(mirror.report)) issues.push(issue('TACTICAL_REPORT_PAYLOAD_INVALID', 'Tactical result mirror requires a report payload.', 'report'));
    }
    if (issues.length) throw new ExplorationHostError('GALACTIC_TACTICAL_RESULT_REJECTED', 'The MASSFRONT tactical result was rejected.', { issues });
  }

  applicationStatus(snapshot, result) {
    const historyHasResult = Boolean(snapshot?.operations?.history?.some(entry => entry?.result?.resultId === result.resultId));
    const appliedHasResult = Boolean(snapshot?.operations?.appliedResultIds?.includes(result.resultId));
    const matchingPending = snapshot?.operations?.pending?.operationId === result.operationId;
    return {
      historyHasResult,
      appliedHasResult,
      matchingPending,
      durable: historyHasResult && appliedHasResult && !matchingPending
    };
  }

  requireDurableApplication(result, code, message) {
    const snapshot = super.loadCampaignSnapshot();
    const status = this.applicationStatus(snapshot, result);
    if (!status.durable) throw new ExplorationHostError(code, message, { resultId: result.resultId, operationId: result.operationId, ...status });
    return status;
  }

  async consumeTacticalResult(nonce) {
    const targetNonce = requireOpaqueNonce(nonce);
    const now = nowFrom(this.now);
    const mirror = parseStoredJson(
      this.bridgeStorage,
      this.resultMirrorKey(targetNonce),
      'GALACTIC_TACTICAL_RESULT_UNREADABLE',
      'The MASSFRONT tactical result could not be read.'
    );
    if (!mirror) throw new ExplorationHostError('GALACTIC_TACTICAL_RESULT_NOT_FOUND', 'No MASSFRONT tactical result matches this Galactic operation.');
    const request = await this.loadGroundOperationRequest(targetNonce);
    if (!request) throw new ExplorationHostError('GROUND_REQUEST_NOT_FOUND', 'No persisted Galactic operation request matches this tactical result.');
    this.validateTacticalMirror(mirror, targetNonce, request, now);

    let result;
    try {
      result = createGroundResult(request.operation, mirror.report);
    } catch (error) {
      throw new ExplorationHostError('GALACTIC_TACTICAL_REPORT_INVALID', 'MASSFRONT returned an invalid tactical report.', { cause: error, issues: error?.issues || [] });
    }
    const envelope = createGroundOperationResultV1(result, {
      nonce: targetNonce,
      accountId: this.accountId,
      issuedAt: mirror.issuedAt
    });
    const outcome = await super.consumeGroundResult(envelope);
    let recoveredApplication = false;
    let applicationAlreadyDurable = false;
    if (outcome?.accepted) {
      this.requireDurableApplication(
        result,
        'GALACTIC_RESULT_APPLICATION_NOT_DURABLE',
        'The tactical receipt was accepted, but its Galactic campaign update was not durably saved. Reload to retry recovery.'
      );
    } else if (outcome?.duplicate) {
      const before = super.loadCampaignSnapshot();
      const status = this.applicationStatus(before, result);
      if (status.durable) {
        applicationAlreadyDurable = true;
      } else if (status.matchingPending && !status.historyHasResult && !status.appliedHasResult) {
        // The receipt survived but the synchronous campaign save did not. The
        // domain remains the sole mutation authority: replay the canonical
        // result through its subscriber, then prove that subscriber persisted
        // both the history entry and applied-result id before acknowledging it.
        this.emitValidatedResult(result);
        this.requireDurableApplication(
          result,
          'GALACTIC_RESULT_RECOVERY_NOT_DURABLE',
          'The tactical receipt was recovered, but the Galactic campaign update was not durably saved.'
        );
        recoveredApplication = true;
      } else {
        throw new ExplorationHostError(
          'GALACTIC_RESULT_RECOVERY_STATE_MISMATCH',
          'The tactical receipt exists, but the saved Galactic campaign cannot be safely recovered without replaying an already-applied result.',
          { resultId: result.resultId, operationId: result.operationId, ...status }
        );
      }
    }
    return {
      ...outcome,
      localOnly: false,
      productionIntegrated: true,
      adapter: 'massfront-solo-v1',
      recoveredApplication,
      applicationAlreadyDurable,
      applicationDurable: true,
      finalizationRequired: true
    };
  }

  async finalizeTacticalResult(nonce, resultId) {
    const targetNonce = requireOpaqueNonce(nonce);
    const expectedResultId = String(resultId || '');
    if (!expectedResultId) throw new ExplorationHostError('GALACTIC_RESULT_FINALIZATION_ID_REQUIRED', 'Tactical result finalization requires its canonical result ID.');
    const resultMirror = parseStoredJson(
      this.bridgeStorage,
      this.resultMirrorKey(targetNonce),
      'GALACTIC_TACTICAL_RESULT_UNREADABLE',
      'The MASSFRONT tactical result could not be read for finalization.'
    );
    let canonicalResult = null;
    if (resultMirror) {
      const request = await this.loadGroundOperationRequest(targetNonce);
      if (!request) throw new ExplorationHostError('GROUND_REQUEST_NOT_FOUND', 'No persisted Galactic operation request matches this tactical result finalization.');
      // Consumption already proved the request was live. Finalization may run
      // after that window closes, so validate the stored report against the
      // authored request boundary rather than turning harmless cleanup into an
      // expiry race.
      this.validateTacticalMirror(resultMirror, targetNonce, request, request.expiresAt);
      canonicalResult = createGroundResult(request.operation, resultMirror.report);
      if (canonicalResult.resultId !== expectedResultId) {
        throw new ExplorationHostError('GALACTIC_RESULT_FINALIZATION_ID_MISMATCH', 'Tactical result finalization does not match the durably applied result.');
      }
      this.requireDurableApplication(
        canonicalResult,
        'GALACTIC_RESULT_FINALIZATION_NOT_DURABLE',
        'Tactical result mirrors cannot be removed until campaign history and the exactly-once ledger are durable.'
      );
    } else {
      const snapshot = super.loadCampaignSnapshot();
      const historyEntry = snapshot?.operations?.history?.find(entry => entry?.result?.resultId === expectedResultId);
      const applied = snapshot?.operations?.appliedResultIds?.includes(expectedResultId);
      if (!historyEntry?.result || !applied || snapshot.operations?.pending?.operationId === historyEntry.result.operationId) {
        throw new ExplorationHostError('GALACTIC_RESULT_FINALIZATION_NOT_DURABLE', 'The saved Galactic campaign does not prove this result was applied exactly once.');
      }
      canonicalResult = historyEntry.result;
    }
    const requestMirror = parseStoredJson(
      this.bridgeStorage,
      this.requestMirrorKey(targetNonce),
      'GALACTIC_REQUEST_MIRROR_FAILED',
      'The Galactic request mirror could not be read for finalization.'
    );
    if (requestMirror && (requestMirror.accountId !== this.accountId
      || requestMirror.nonce !== targetNonce
      || requestMirror.operationId !== canonicalResult.operationId)) {
      throw new ExplorationHostError('GALACTIC_RESULT_FINALIZATION_ID_MISMATCH', 'Galactic request finalization identity does not match the applied result.');
    }
    try {
      this.bridgeStorage.removeItem(this.requestMirrorKey(targetNonce));
      this.bridgeStorage.removeItem(this.resultMirrorKey(targetNonce));
    } catch (error) {
      throw new ExplorationHostError('GALACTIC_RESULT_FINALIZATION_FAILED', 'The durable tactical result is safe, but its transient bridge mirrors could not be removed.', { cause: error });
    }
    if (this.bridgeStorage.getItem(this.requestMirrorKey(targetNonce)) !== null
      || this.bridgeStorage.getItem(this.resultMirrorKey(targetNonce)) !== null) {
      throw new ExplorationHostError('GALACTIC_RESULT_FINALIZATION_FAILED', 'The durable tactical result is safe, but its transient bridge mirrors failed removal read-back.');
    }
    return { finalized: true, nonce: targetNonce, resultId: expectedResultId };
  }

  abandonGroundOperation(nonce) {
    let candidate = nonce || this.pendingNonce;
    if (!candidate) {
      const saved = super.loadCampaignSnapshot();
      candidate = this.findRequestMirrorNonce(saved?.operations?.pending?.operationId);
    }
    const targetNonce = requireOpaqueNonce(candidate);
    try { this.bridgeStorage.removeItem(this.requestMirrorKey(targetNonce)); } catch (_) {}
    try { this.bridgeStorage.removeItem(this.resultMirrorKey(targetNonce)); } catch (_) {}
    if (this.pendingNonce === targetNonce) this.pendingNonce = null;
    return { abandoned: true, nonce: targetNonce, domainCancellationRequired: true };
  }
}

export function createMassfrontSoloHost(options = {}) {
  return new MassfrontSoloHost(options);
}
