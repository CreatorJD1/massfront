/* --------------------------------------------------------------------------
   MASSFRONT GALACTIC EXPLORATION — INTEGRATED SOLO HOST

   This adapter is selected only after the base game leaves a short-lived
   same-tab entry ticket. Durable campaign state and the exactly-once result
   ledger remain owned by LocalSandboxHost; sessionStorage carries only an
   opaque tactical nonce plus source-matched request/result mirrors.
   -------------------------------------------------------------------------- */

import {
  COMMANDER1_BY_CAMPAIGN_FACTION,
  COMMANDER_ROSTER_PRODUCTION_FINGERPRINT_V1,
  EXPLORATION_PRODUCTION_HOST_SCHEMA_VERSION,
  MISSION_CATALOG,
  applyAccountProfile,
  commissionCareerFaction,
  createGroundOperationRequestV2,
  createGroundOperationResultV2,
  createGroundResult,
  createInitialAccountProfile,
  createInitialDomainState,
  createProductionCommanderCatalogContextV1,
  createUgaGroundLocation,
  deserializeAccountProfile,
  deserializeDomainState,
  isSelectableCommanderIdV1,
  normalizeCommanderRosterSnapshotV1,
  projectAccountProfile,
  serializeAccountProfile,
  serializeDomainState,
  validateCommanderRosterSnapshotV1,
  validateGroundOperation,
  validateGroundOperationRequestV2
} from '../domain/index.js';
import { deepFreeze, hash32, stableStringify } from '../domain/deterministic.js';
import { resolveBaseRuntimeNavigation } from './base_runtime_url.js';
import {
  ExplorationHostError,
  LocalSandboxHost
} from './local_sandbox_host.js';

export const MASSFRONT_GALACTIC_ENTRY_TICKET_KEY = 'massfront.galactic.entry.v1';
export const MASSFRONT_GALACTIC_REQUEST_MIRROR_PREFIX = 'massfront.galactic.request.v1.';
export const MASSFRONT_GALACTIC_RESULT_MIRROR_PREFIX = 'massfront.galactic.result.v1.';
export const MASSFRONT_GALACTIC_ROUTE_REQUEST_PREFIX = 'massfront.galactic.route.v1.';
export const MASSFRONT_SOLO_HOST_KIND = 'MassfrontSoloHostV2';
export const MASSFRONT_BASE_ROUTE_IDS = Object.freeze([
  'operations', 'development', 'armory', 'orders', 'intel',
  'profile', 'inbox', 'social', 'settings', 'game-version',
  'war-room', 'mode-training', 'mode-standard', 'mode-campaign', 'mode-weekly',
  'new-career-faction'
]);

const ENTRY_TICKET_KIND = 'MassfrontGalacticEntryV2';
const REQUEST_MIRROR_KIND = 'MassfrontGalacticRequestMirrorV2';
const TACTICAL_REPORT_KIND = 'MassfrontGalacticTacticalReportV1';
const ROUTE_REQUEST_KIND = 'MassfrontGalacticRouteRequestV2';
const ENTRY_TICKET_SOURCE = 'massfront-base';
const ROUTE_REQUEST_SOURCE = 'massfront-exploration';
const INTEGRATED_NAMESPACE = 'massfront.galactic.solo.v1';
const INTEGRATED_OPERATION_TTL_MS = 24 * 60 * 60 * 1000;
const ENTRY_TICKET_TTL_MS = 7 * INTEGRATED_OPERATION_TTL_MS;
const ROUTE_REQUEST_TTL_MS = 2 * 60 * 1000;
const OPAQUE_NONCE_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;
const ALLOWED_PROXY_FACTIONS = new Set(['nova', 'dominion', 'syndicate']);
const ALLOWED_COMMISSIONING_FACTIONS = new Set(Object.keys(COMMANDER1_BY_CAMPAIGN_FACTION));
const ALLOWED_OPERATION_OPPONENTS = new Set(['nova', 'dominion', 'syndicate', 'brood']);
const GROUND_RUNTIME_OBJECTIVE_MODE = Object.freeze({
  secure_relay: 'destroy',
  hold_infrastructure: 'destroy',
  recover_manifest: 'destroy',
  recover_archive: 'destroy',
  secure_observatory: 'destroy',
  extract_artifact: 'destroy',
  purge_brood: 'purge'
});
const GROUND_OPERATION_V3_FIELDS = Object.freeze([
  'schemaVersion', 'kind', 'profileId', 'sequence', 'launchRevision',
  'missionId', 'missionType', 'systemId', 'siteId', 'sponsorId',
  'contractFactionId', 'proxyFactionId', 'playerFactionId', 'opponentFactionId',
  'commanderId', 'specialistIds', 'doctrineId', 'supportId', 'landingZoneId',
  'configuration', 'objective', 'difficulty', 'intelligence', 'battlefield',
  'scanTierAtLaunch', 'threatAtLaunch', 'factionSnapshot', 'personnelSnapshot',
  'deploymentManifest', 'deploymentCost', 'rewardPlan', 'returnRoute',
  'commanderRosterFingerprint', 'commanderIdentity', 'operationId', 'resultSeed',
  'returnToken'
]);
const GROUND_OPERATION_REQUEST_V2_FIELDS = Object.freeze([
  'schemaVersion', 'kind', 'nonce', 'accountId', 'contentVersion', 'issuedAt',
  'expiresAt', 'adapter', 'commanderRosterFingerprint', 'operation', 'checksum'
]);
const ALLOWED_ENTRY_VIEWS = new Set(['system', 'campaign_hub']);
const ALLOWED_BASE_ROUTES = new Set(MASSFRONT_BASE_ROUTE_IDS);
const ALLOWED_LOCATION_SYSTEMS = new Set(['aelos', 'veyra', 'karak']);
const LOCATION_ID_PATTERN = /^[a-z0-9_]{1,96}$/;

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

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function hasExactKeys(value, keys) {
  try {
    return isRecord(value)
      && stableStringify(Object.keys(value).sort()) === stableStringify([...keys].sort());
  } catch (_) {
    return false;
  }
}

function matchesDeterministically(left, right) {
  try {
    return stableStringify(left) === stableStringify(right);
  } catch (_) {
    return false;
  }
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
  globalThis.location.assign(resolveBaseRuntimeNavigation(url));
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
  if (!normalizedProfileId) throw new TypeError('MassfrontGalacticEntryV2 requires a profile ID.');
  const issuedAt = integerTime(options.issuedAt, Date.now());
  const ttlMs = Math.max(30_000, Math.min(ENTRY_TICKET_TTL_MS, integerTime(options.ttlMs, ENTRY_TICKET_TTL_MS)));
  const entryView = ALLOWED_ENTRY_VIEWS.has(options.entryView) ? options.entryView : 'campaign_hub';
  const introRequired = entryView === 'system' && options.introRequired !== false;
  const commanderRosterSnapshot = normalizeCommanderRosterSnapshotV1(options.commanderRosterSnapshot);
  const commanderRosterFingerprint = options.commanderRosterFingerprint === undefined
    ? commanderRosterSnapshot.fingerprint
    : options.commanderRosterFingerprint;
  const commissioning = options.commissioning === undefined
    ? { factionId: null, commanderId: null }
    : clone(options.commissioning);
  const ticket = {
    schemaVersion: 2,
    kind: ENTRY_TICKET_KIND,
    profileId: normalizedProfileId,
    issuedAt,
    expiresAt: issuedAt + ttlMs,
    source: ENTRY_TICKET_SOURCE,
    entryView,
    introRequired,
    commanderRosterSnapshot,
    commanderRosterFingerprint,
    commissioning
  };
  const validation = validateMassfrontGalacticEntryTicket(ticket, { profileId: normalizedProfileId, now: issuedAt });
  if (!validation.ok) throw new TypeError(`Invalid MassfrontGalacticEntryV2: ${validation.issues[0]?.message || 'unknown issue'}`);
  return deepFreeze(validation.ticket);
}

export function validateMassfrontGalacticEntryTicket(ticket, options = {}) {
  const issues = [];
  if (!ticket || typeof ticket !== 'object' || Array.isArray(ticket)) {
    return { ok: false, issues: [issue('GALACTIC_ENTRY_NOT_OBJECT', 'Galactic entry ticket must be an object.')], ticket: null };
  }
  if (!hasExactKeys(ticket, [
    'schemaVersion', 'kind', 'profileId', 'issuedAt', 'expiresAt', 'source',
    'entryView', 'introRequired', 'commanderRosterSnapshot',
    'commanderRosterFingerprint', 'commissioning'
  ])) issues.push(issue('GALACTIC_ENTRY_FIELDS_INVALID', 'Galactic entry ticket has unexpected or missing fields.'));
  if (ticket.schemaVersion !== 2 || ticket.kind !== ENTRY_TICKET_KIND) issues.push(issue('GALACTIC_ENTRY_SCHEMA_INVALID', 'Production Galactic entry requires MassfrontGalacticEntryV2.'));
  if (ticket.source !== ENTRY_TICKET_SOURCE) issues.push(issue('GALACTIC_ENTRY_SOURCE_INVALID', 'Galactic entry ticket was not issued by MASSFRONT.', 'source'));
  if (!ALLOWED_ENTRY_VIEWS.has(ticket.entryView)) issues.push(issue('GALACTIC_ENTRY_VIEW_INVALID', 'Galactic entry view is unsupported.', 'entryView'));
  if (typeof ticket.introRequired !== 'boolean') issues.push(issue('GALACTIC_ENTRY_INTRO_INVALID', 'Galactic introduction state is invalid.', 'introRequired'));
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

  const rosterValidation = validateCommanderRosterSnapshotV1(ticket.commanderRosterSnapshot);
  issues.push(...rosterValidation.issues.map(entry => ({
    ...entry,
    path: entry.path ? `commanderRosterSnapshot.${entry.path}` : 'commanderRosterSnapshot'
  })));
  if (ticket.commanderRosterFingerprint !== COMMANDER_ROSTER_PRODUCTION_FINGERPRINT_V1
    || ticket.commanderRosterSnapshot?.fingerprint !== COMMANDER_ROSTER_PRODUCTION_FINGERPRINT_V1
    || ticket.commanderRosterFingerprint !== ticket.commanderRosterSnapshot?.fingerprint) {
    issues.push(issue('GALACTIC_ENTRY_COMMANDER_ROSTER_STALE', 'Galactic entry commander roster is absent, mismatched, or stale.', 'commanderRosterFingerprint'));
  }

  const commissioning = ticket.commissioning;
  if (!hasExactKeys(commissioning, ['factionId', 'commanderId'])) {
    issues.push(issue('GALACTIC_ENTRY_COMMISSIONING_INVALID', 'Galactic entry commissioning must contain nullable factionId and commanderId fields.', 'commissioning'));
  } else {
    const factionId = commissioning.factionId;
    const commanderId = commissioning.commanderId;
    if (factionId === null && commanderId === null) {
      // Neutral new careers remain deliberately unassigned until commissioning.
    } else if (factionId === null || commanderId === null) {
      issues.push(issue('GALACTIC_ENTRY_COMMISSIONING_PARTIAL', 'Galactic commissioning must assign both a faction and its Commander 1, or neither.', 'commissioning'));
    } else if (!ALLOWED_COMMISSIONING_FACTIONS.has(factionId)) {
      issues.push(issue('GALACTIC_ENTRY_COMMISSIONING_FACTION_INVALID', 'Galactic commissioning faction is not playable.', 'commissioning.factionId'));
    } else if (!isSelectableCommanderIdV1(commanderId)) {
      issues.push(issue('GALACTIC_ENTRY_COMMISSIONING_COMMANDER_INVALID', 'Galactic commissioning rejects aliases, KEEL, and unknown personnel.', 'commissioning.commanderId'));
    } else if (COMMANDER1_BY_CAMPAIGN_FACTION[factionId] !== commanderId) {
      issues.push(issue('GALACTIC_ENTRY_COMMISSIONING_COMMANDER1_REQUIRED', 'Galactic commissioning must assign the selected faction\'s Commander 1.', 'commissioning.commanderId'));
    }
  }

  let commanderCatalogContext = null;
  if (!issues.length) {
    try {
      commanderCatalogContext = createProductionCommanderCatalogContextV1(ticket.commanderRosterSnapshot);
    } catch (error) {
      issues.push(issue('GALACTIC_ENTRY_COMMANDER_CONTEXT_INVALID', error?.message || 'Commander roster could not create a production catalog context.', 'commanderRosterSnapshot'));
    }
  }
  return {
    ok: issues.length === 0,
    issues,
    ticket: issues.length ? null : clone(ticket),
    commanderCatalogContext: issues.length ? null : commanderCatalogContext
  };
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
    const commanderRosterSnapshot = normalizeCommanderRosterSnapshotV1(ticket.commanderRosterSnapshot);
    const commanderCatalogContext = validation.commanderCatalogContext;
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
    this.schemaVersion = EXPLORATION_PRODUCTION_HOST_SCHEMA_VERSION;
    this.kind = MASSFRONT_SOLO_HOST_KIND;
    this.productionIntegrated = true;
    this.supportsBaseRoutes = true;
    this.ticket = deepFreeze(clone(ticket));
    this.commanderRosterSnapshot = commanderRosterSnapshot;
    this.commanderRosterFingerprint = commanderRosterSnapshot.fingerprint;
    this.commanderCatalogContext = commanderCatalogContext;
    this.commissioningAssignment = deepFreeze(clone(ticket.commissioning));
    this.namespace = namespace;
    this.bridgeStorage = bridgeStorage;
    this.navigation = navigation;
  }

  loadCommanderRosterSnapshot() {
    return deepFreeze(clone(this.commanderRosterSnapshot));
  }

  loadProfileSnapshot() {
    const serialized = this.storage.getItem(this.profileKey);
    if (!serialized) return createInitialAccountProfile(this.accountId, this.commanderCatalogContext);
    try {
      const profile = deserializeAccountProfile(serialized, this.commanderCatalogContext);
      if (profile.profileId !== this.accountId) throw new ExplorationHostError('PROFILE_ACCOUNT_MISMATCH', 'Stored profile belongs to a different account.');
      return profile;
    } catch (error) {
      this.lastError = error;
      throw error;
    }
  }

  loadSnapshot() {
    const serialized = this.storage.getItem(this.key);
    if (!serialized) return null;
    try {
      const campaign = deserializeDomainState(serialized, this.commanderCatalogContext);
      if (campaign.profileId !== this.accountId) throw new ExplorationHostError('CAMPAIGN_ACCOUNT_MISMATCH', 'Stored Galactic campaign belongs to a different account.');
      const merged = applyAccountProfile(campaign, this.loadProfileSnapshot(), this.commanderCatalogContext);
      this.lastError = null;
      return merged;
    } catch (error) {
      this.lastError = error;
      throw error;
    }
  }

  saveSnapshot(state) {
    // A failed load must never turn the startup fallback into a replacement save.
    if (this.lastError) throw this.lastError;
    if (!state || state.profileId !== this.accountId) throw new ExplorationHostError('CAMPAIGN_ACCOUNT_MISMATCH', 'Cannot save a Galactic campaign for another account.');
    this.storage.setItem(this.key, serializeDomainState(state, this.commanderCatalogContext));
    const profile = projectAccountProfile(state, this.loadProfileSnapshot(), this.commanderCatalogContext);
    this.storage.setItem(this.profileKey, serializeAccountProfile(profile, this.commanderCatalogContext));
    return state;
  }

  applyTicketCommissioning(state) {
    const { factionId, commanderId } = this.commissioningAssignment;
    if (factionId === null && commanderId === null) return state;
    if (state.commissioning?.completed) {
      if (state.commissioning.factionId !== factionId || state.commissioning.commanderId !== commanderId) {
        throw new ExplorationHostError(
          'GALACTIC_COMMISSIONING_STATE_MISMATCH',
          'The entry ticket commissioning does not match this saved Galactic career.'
        );
      }
      return state;
    }
    return commissionCareerFaction(state, factionId, commanderId);
  }

  loadCampaignSnapshot() {
    const saved = super.loadCampaignSnapshot();
    if (saved) {
      if (!this.pendingNonce && saved.operations?.pending?.operationId) {
        this.pendingNonce = this.findRequestMirrorNonce(saved.operations.pending.operationId);
      }
      return this.applyTicketCommissioning(saved);
    }
    // createSpaceExperience has a deliberately standalone default profile.
    // Seed this namespace with the ticket identity before its LocalDomainStore
    // is constructed so integrated state can never become local_expedition.
    let initial = createInitialDomainState(this.commanderCatalogContext);
    initial.profileId = this.accountId;
    initial = applyAccountProfile(initial, this.loadProfileSnapshot(), this.commanderCatalogContext);
    return this.applyTicketCommissioning(initial);
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
        if (mirror?.schemaVersion === 2
          && mirror.kind === REQUEST_MIRROR_KIND
          && mirror.adapter === 'massfront-solo-v2'
          && mirror.commanderRosterFingerprint === COMMANDER_ROSTER_PRODUCTION_FINGERPRINT_V1
          && mirror.nonce === nonce
          && mirror.accountId === this.accountId
          && mirror.operationId === operationId
          && mirror.request?.nonce === nonce
          && mirror.request?.accountId === this.accountId
          && mirror.request?.schemaVersion === 2
          && mirror.request?.kind === 'GroundOperationRequestV2'
          && mirror.request?.adapter === 'massfront-solo-v2'
          && mirror.request?.commanderRosterFingerprint === COMMANDER_ROSTER_PRODUCTION_FINGERPRINT_V1
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

  routeRequestKey(nonce) {
    return `${MASSFRONT_GALACTIC_ROUTE_REQUEST_PREFIX}${requireOpaqueNonce(nonce)}`;
  }

  async openBaseRoute(routeId, locationContext = {}) {
    const route = String(routeId || '');
    if (!ALLOWED_BASE_ROUTES.has(route)) {
      throw new ExplorationHostError('GALACTIC_BASE_ROUTE_REJECTED', 'This MASSFRONT destination is not exposed to the Galactic strategic layer.');
    }
    const nonce = requireOpaqueNonce(this.nonceFactory());
    const issuedAt = nowFrom(this.now);
    const systemId = String(locationContext?.systemId || '');
    const targetId = locationContext?.targetId === null || locationContext?.targetId === undefined
      ? null
      : String(locationContext.targetId);
    if (!ALLOWED_LOCATION_SYSTEMS.has(systemId) || (targetId !== null && !LOCATION_ID_PATTERN.test(targetId))) {
      throw new ExplorationHostError('GALACTIC_BASE_LOCATION_REJECTED', 'This Galactic location cannot be carried into the MASSFRONT War Table.');
    }
    const request = {
      schemaVersion: 2,
      kind: ROUTE_REQUEST_KIND,
      nonce,
      profileId: this.accountId,
      routeId: route,
      issuedAt,
      expiresAt: issuedAt + ROUTE_REQUEST_TTL_MS,
      source: ROUTE_REQUEST_SOURCE,
      location: { systemId, targetId }
    };
    request.checksum = hash32(request);
    const restored = writeAndReadJson(
      this.bridgeStorage,
      this.routeRequestKey(nonce),
      request,
      'GALACTIC_ROUTE_STORAGE_FAILED',
      'The MASSFRONT destination could not be secured for same-tab navigation.'
    );
    if (restored.nonce !== nonce || restored.profileId !== this.accountId || restored.routeId !== route
        || restored.location?.systemId !== systemId || restored.location?.targetId !== targetId
        || restored.checksum !== hash32(withoutChecksum(restored))) {
      throw new ExplorationHostError('GALACTIC_ROUTE_STORAGE_FAILED', 'The MASSFRONT destination failed identity verification.');
    }
    const launchUrl = `../../../index.html?galacticRoute=${encodeURIComponent(nonce)}`;
    try {
      await this.navigation(launchUrl);
    } catch (error) {
      try { this.bridgeStorage.removeItem(this.routeRequestKey(nonce)); } catch (_) {}
      throw new ExplorationHostError('GALACTIC_NAVIGATION_UNAVAILABLE', 'The MASSFRONT destination could not be opened.', { cause: error });
    }
    return { opened: true, productionIntegrated: true, adapter: 'massfront-solo-v2', nonce, routeId: route, launchUrl };
  }

  validateIntegratedOperation(operationOrEnvelope) {
    if (operationOrEnvelope?.kind === 'GroundOperationRequestV1') {
      throw new ExplorationHostError('GALACTIC_REQUEST_VERSION_UNSUPPORTED', 'Production Galactic launch rejects legacy GroundOperationRequestV1 envelopes.');
    }
    const requestEnvelope = operationOrEnvelope?.kind === 'GroundOperationRequestV2'
      ? operationOrEnvelope
      : null;
    const operation = requestEnvelope ? requestEnvelope.operation : operationOrEnvelope;
    let contractValidation;
    try {
      contractValidation = requestEnvelope
        ? validateGroundOperationRequestV2(requestEnvelope, { accountId: this.accountId, now: nowFrom(this.now) })
        : validateGroundOperation(operation);
    } catch (_) {
      // The shared domain validator assumes a generated operation after its
      // first shape checks. Convert hostile partial objects into a rejection;
      // never let an arbitrary bridge envelope crash the production adapter.
      contractValidation = {
        ok: false,
        issues: [issue('GALACTIC_OPERATION_MALFORMED', 'The ground-operation contract is malformed.')]
      };
    }
    const issues = [...contractValidation.issues];
    if (requestEnvelope && !hasExactKeys(requestEnvelope, GROUND_OPERATION_REQUEST_V2_FIELDS)) {
      issues.push(issue('REQUEST_ENVELOPE_FIELDS_INVALID', 'GroundOperationRequestV2 has unexpected or missing fields.'));
    }
    if (!hasExactKeys(operation, GROUND_OPERATION_V3_FIELDS)) {
      issues.push(issue('GALACTIC_OPERATION_FIELDS_INVALID', 'GroundOperationV3 has unexpected or missing fields.'));
    }
    if (operation?.schemaVersion !== 3 || operation?.kind !== 'GroundOperationV3') {
      issues.push(issue('GALACTIC_OPERATION_SCHEMA_INVALID', 'Production Galactic launch requires GroundOperationV3.'));
    }
    if (operation?.profileId !== this.accountId) {
      issues.push(issue('GALACTIC_OPERATION_PROFILE_INVALID', 'The operation belongs to a different MASSFRONT profile.', 'profileId'));
    }
    if (operation?.commanderRosterFingerprint !== COMMANDER_ROSTER_PRODUCTION_FINGERPRINT_V1) {
      issues.push(issue('GALACTIC_OPERATION_ROSTER_INVALID', 'The operation commander roster is absent or stale.', 'commanderRosterFingerprint'));
    }

    const mission = MISSION_CATALOG[operation?.missionId];
    const objectiveMode = GROUND_RUNTIME_OBJECTIVE_MODE[operation?.objective?.type];
    if (!mission) {
      issues.push(issue('GALACTIC_OPERATION_MISSION_INVALID', 'The operation does not identify an authored playable mission.', 'missionId'));
    } else {
      if (mission.sponsorId !== 'uga' || operation.sponsorId !== mission.sponsorId
          || operation.contractFactionId !== mission.contractFactionId
          || operation.opponentFactionId !== mission.opponentFactionId) {
        issues.push(issue('GALACTIC_OPERATION_FACTIONS_INVALID', 'The operation factions do not match the authored mission.', 'missionId'));
      }
      if (!objectiveMode || !matchesDeterministically(operation.objective, mission.objective)) {
        issues.push(issue('GALACTIC_OPERATION_OBJECTIVE_INVALID', 'The operation objective is not an authored ground-runtime objective.', 'objective'));
      } else if (objectiveMode === 'purge') {
        if (mission.missionType !== 'uga_brood_purge'
            || !hasExactKeys(operation.objective, ['type', 'infestation', 'hiveTargetIds', 'nestCount'])
            || operation.objective.infestation !== true
            || operation.objective.nestCount !== operation.objective.hiveTargetIds?.length
            || operation.battlefield?.infestationActive !== true
            || !matchesDeterministically(operation.battlefield?.hiveTargetIds, operation.objective.hiveTargetIds)) {
          issues.push(issue('GALACTIC_OPERATION_PURGE_INVALID', 'The Brood purge objective cannot be mapped safely into the ground runtime.', 'objective'));
        }
      } else if (mission.missionType !== 'faction_conflict'
          || !hasExactKeys(operation.objective, ['type', 'targetIds'])
          || !operation.objective.targetIds.length
          || operation.objective.targetIds.some(targetId => typeof targetId !== 'string' || !targetId)
          || operation.battlefield?.infestationActive !== false
          || !Array.isArray(operation.battlefield?.hiveTargetIds)
          || operation.battlefield.hiveTargetIds.length !== 0) {
        issues.push(issue('GALACTIC_OPERATION_CONFLICT_INVALID', 'The faction objective cannot be mapped safely into the ground runtime.', 'objective'));
      }
      const factionAccessValid = mission.access?.type === 'faction_exclusive'
        ? mission.access.factionId === operation.proxyFactionId && operation.contractFactionId === operation.proxyFactionId
        : mission.access?.type === 'uga_brood_proxy' && operation.contractFactionId === null && operation.opponentFactionId === 'brood';
      if (!factionAccessValid) {
        issues.push(issue('GALACTIC_OPERATION_ACCESS_INVALID', 'The operation proxy does not satisfy the authored mission access rule.', 'proxyFactionId'));
      }
      const battlefieldLocation = operation?.battlefield?.location;
      const expectedLocation = battlefieldLocation?.mapId
        ? createUgaGroundLocation(mission.id, battlefieldLocation.mapId)
        : null;
      if (!expectedLocation || !matchesDeterministically(battlefieldLocation, expectedLocation)) {
        issues.push(issue(
          'GALACTIC_OPERATION_BATTLEFIELD_INVALID',
          'Select an authored compact, standard, or large UGA battlefield before deployment.',
          'battlefield.location'
        ));
      }
    }

    const commissioning = this.commissioningAssignment;
    const rosterCommander = this.commanderRosterSnapshot?.commanders?.find(entry => entry.id === operation?.commanderId);
    if (!ALLOWED_PROXY_FACTIONS.has(operation?.proxyFactionId)
        || operation?.playerFactionId !== operation?.proxyFactionId
        || !ALLOWED_OPERATION_OPPONENTS.has(operation?.opponentFactionId)) {
      issues.push(issue('GALACTIC_OPERATION_PROXY_INVALID', 'The operation requires a supported resident proxy and opponent.', 'proxyFactionId'));
    }
    if (!commissioning || !ALLOWED_COMMISSIONING_FACTIONS.has(commissioning.factionId)
        || COMMANDER1_BY_CAMPAIGN_FACTION[commissioning.factionId] !== commissioning.commanderId) {
      issues.push(issue('GALACTIC_OPERATION_COMMISSIONING_INVALID', 'A valid career commissioning is required before ground deployment.', 'commissioning'));
    }
    if (!isSelectableCommanderIdV1(operation?.commanderId)
        || rosterCommander?.campaignFactionId !== operation?.proxyFactionId) {
      issues.push(issue('GALACTIC_OPERATION_COMMANDER_INVALID', 'The operation commander is not bound to its resident proxy roster.', 'commanderId'));
    }
    if (issues.length) {
      throw new ExplorationHostError(
        'GALACTIC_OPERATION_OUT_OF_SCOPE',
        'The integrated solo adapter rejected an operation outside the authored Galactic ground-operation contract.',
        { issues }
      );
    }
    return operation;
  }

  async prepareGroundOperation(operationOrEnvelope) {
    const operation = this.validateIntegratedOperation(operationOrEnvelope);
    const issuedAt = nowFrom(this.now);
    const requestEnvelope = operationOrEnvelope?.schemaVersion === 2 && operationOrEnvelope?.kind === 'GroundOperationRequestV2'
      ? operationOrEnvelope
      : createGroundOperationRequestV2(operation, {
          nonce: requireOpaqueNonce(this.nonceFactory()),
          accountId: this.accountId,
          issuedAt,
          ttlMs: this.requestTtlMs,
          contentVersion: this.contentVersion
        });
    const prepared = await super.prepareGroundOperation(requestEnvelope);
    const request = await this.loadGroundOperationRequest(prepared.nonce);
    if (!request) throw new ExplorationHostError('GROUND_REQUEST_NOT_FOUND', 'The persisted Galactic operation request could not be read back.');
    const mirror = {
      schemaVersion: 2,
      kind: REQUEST_MIRROR_KIND,
      adapter: 'massfront-solo-v2',
      commanderRosterFingerprint: COMMANDER_ROSTER_PRODUCTION_FINGERPRINT_V1,
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
    if (restored.schemaVersion !== 2 || restored.kind !== REQUEST_MIRROR_KIND
      || restored.adapter !== 'massfront-solo-v2'
      || restored.commanderRosterFingerprint !== COMMANDER_ROSTER_PRODUCTION_FINGERPRINT_V1
      || restored.nonce !== request.nonce || restored.accountId !== this.accountId
      || restored.operationId !== request.operation.operationId
      || stableStringify(restored.request) !== stableStringify(request)) {
      throw new ExplorationHostError('GALACTIC_REQUEST_MIRROR_FAILED', 'The Galactic operation request mirror failed identity verification.');
    }
    const launchUrl = `../../../index.html?groundOperation=${encodeURIComponent(request.nonce)}`;
    return {
      ...prepared,
      localOnly: false,
      productionIntegrated: true,
      adapter: 'massfront-solo-v2',
      launchUrl,
      url: launchUrl
    };
  }

  async openGroundOperation(prepared) {
    const nonce = requireOpaqueNonce(prepared?.nonce);
    if (!prepared?.accepted || prepared.adapter !== 'massfront-solo-v2') {
      throw new ExplorationHostError('GALACTIC_LAUNCH_NOT_PREPARED', 'A verified integrated Galactic operation is required before navigation.');
    }
    const request = await this.loadGroundOperationRequest(nonce);
    if (!request) throw new ExplorationHostError('GROUND_REQUEST_NOT_FOUND', 'No persisted Galactic operation request matches this launch.');
    const launchUrl = `../../../index.html?groundOperation=${encodeURIComponent(nonce)}`;
    await this.navigation(launchUrl);
    return { opened: true, productionIntegrated: true, adapter: 'massfront-solo-v2', nonce, launchUrl };
  }

  validateTacticalMirror(mirror, nonce, request, now) {
    const issues = [];
    if (!mirror || typeof mirror !== 'object' || Array.isArray(mirror)) {
      issues.push(issue('TACTICAL_REPORT_NOT_OBJECT', 'Tactical result mirror must be an object.'));
    } else {
      if (mirror.schemaVersion !== 1 || mirror.kind !== TACTICAL_REPORT_KIND) issues.push(issue('TACTICAL_REPORT_SCHEMA_INVALID', 'Tactical result mirror schema is unsupported.'));
      if (request.schemaVersion !== 2 || request.kind !== 'GroundOperationRequestV2'
        || request.adapter !== 'massfront-solo-v2'
        || request.commanderRosterFingerprint !== COMMANDER_ROSTER_PRODUCTION_FINGERPRINT_V1) issues.push(issue('TACTICAL_REQUEST_VERSION_INVALID', 'Tactical results require the production V2 request envelope.', 'request'));
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
    const envelope = createGroundOperationResultV2(result, {
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
      adapter: 'massfront-solo-v2',
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
    if (requestMirror && (requestMirror.schemaVersion !== 2
      || requestMirror.kind !== REQUEST_MIRROR_KIND
      || requestMirror.adapter !== 'massfront-solo-v2'
      || requestMirror.commanderRosterFingerprint !== COMMANDER_ROSTER_PRODUCTION_FINGERPRINT_V1
      || requestMirror.accountId !== this.accountId
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
