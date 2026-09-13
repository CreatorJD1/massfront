import { COMMANDER_CATALOG, RESIDENT_FACTION_IDS, SPECIALIST_CATALOG } from './catalog.js';
import {
  COMMANDER1_BY_CAMPAIGN_FACTION,
  COMMANDER_LEGACY_ALIASES,
  resolveCommanderIdAtMigrationBoundaryV1
} from './commander_roster_contract.js';
import { validateCommanderCatalogContextV1 } from './commander_catalog.js';
import { deepClone, deepFreeze, stableStringify } from './deterministic.js';
import { issue } from './errors.js';

export const ACCOUNT_PROFILE_SCHEMA_VERSION = 2;
export const ACCOUNT_PROFILE_STORAGE_KEY = 'massfront.profile.shared.v1';
export const ACCOUNT_PROFILE_COMMANDER_ROSTER_FINGERPRINT = 'fnv1a32:0aadcd2d';

function integer(value, fallback = 0, minimum = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(minimum, Math.floor(parsed)) : fallback;
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function commanderCatalogForContext(context = null) {
  if (!context) return COMMANDER_CATALOG;
  const validation = validateCommanderCatalogContextV1(context, { requireProduction: true });
  if (!validation.ok || context.snapshotFingerprint !== ACCOUNT_PROFILE_COMMANDER_ROSTER_FINGERPRINT) {
    throw new TypeError('Account profile requires the canonical production commander catalog context.');
  }
  return context.catalog;
}

function mergeForwardData(older, newer, field = '') {
  if (newer === undefined) return deepClone(older);
  if (older === undefined) return deepClone(newer);
  if (Array.isArray(older) && Array.isArray(newer)) {
    const merged = [];
    const seen = new Set();
    for (const value of [...older, ...newer]) {
      let key;
      try { key = stableStringify(value); } catch (_) { key = String(value); }
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(deepClone(value));
    }
    return merged;
  }
  if (isRecord(older) && isRecord(newer)) {
    const merged = {};
    for (const key of new Set([...Object.keys(older), ...Object.keys(newer)])) merged[key] = mergeForwardData(older[key], newer[key], key);
    return merged;
  }
  if (field === 'unlocked' && typeof older === 'boolean' && typeof newer === 'boolean') return older || newer;
  if (typeof older === 'number' && typeof newer === 'number' && /(?:level|experience|xp|readiness|loyalty|operationsCompleted|revision|timestamp|At|Cycle)$/i.test(field)) return Math.max(older, newer);
  if (newer === null && older !== null && /(?:injury|deployment|status|timestamp|At)$/i.test(field)) return deepClone(older);
  return deepClone(newer);
}

function migrateCommanderRecords(source, catalog) {
  const records = isRecord(source) ? source : {};
  const migrated = {};
  for (const id of Object.keys(catalog)) {
    let merged;
    for (const [legacyId, canonicalId] of Object.entries(COMMANDER_LEGACY_ALIASES)) {
      if (canonicalId === id && isRecord(records[legacyId])) merged = mergeForwardData(merged, records[legacyId]);
    }
    if (isRecord(records[id])) merged = mergeForwardData(merged, records[id]);
    if (merged !== undefined) migrated[id] = merged;
  }
  return migrated;
}

function commanderRecordHasProgress(record, definition) {
  if (!isRecord(record)) return false;
  if (integer(record.level, definition.initialLevel, 1) > definition.initialLevel) return true;
  if (integer(record.experience ?? record.xp, 0) > 0 || integer(record.operationsCompleted, 0) > 0) return true;
  if (record.injury || (Array.isArray(record.scars) && record.scars.length)) return true;
  return Object.keys(record).some(key => !['unlocked', 'level', 'experience', 'xp', 'scars'].includes(key));
}

function hasMeaningfulProfileProgress(source, migratedRecords, catalog) {
  if (integer(source?.career?.level, 1, 1) > 1 || integer(source?.career?.experience, 0) > 0) return true;
  if (Object.keys(source?.inventory?.items || {}).length || Object.keys(source?.inventory?.craftedMods || {}).length) return true;
  if (source?.cosmetics?.unlockedIds?.length) return true;
  return Object.entries(migratedRecords).some(([id, record]) => commanderRecordHasProgress(record, catalog[id]));
}

function inferLegacyFaction(source, migratedRecords, catalog) {
  if (RESIDENT_FACTION_IDS.includes(source?.factionIdentity)) return source.factionIdentity;
  const directId = resolveCommanderIdAtMigrationBoundaryV1(source?.commanderId);
  if (directId && catalog[directId]) return catalog[directId].factionId;
  for (const [id, record] of Object.entries(migratedRecords)) {
    if (commanderRecordHasProgress(record, catalog[id])) return catalog[id].factionId;
  }
  return 'nova';
}

export function createInitialAccountProfile(profileId = 'local_expedition', commanderCatalogContext = null) {
  const commanderCatalog = commanderCatalogForContext(commanderCatalogContext);
  const commanders = {};
  for (const [id, definition] of Object.entries(commanderCatalog)) {
    commanders[id] = { unlocked: false, level: definition.initialLevel, experience: 0, scars: [] };
  }
  return {
    schemaVersion: ACCOUNT_PROFILE_SCHEMA_VERSION,
    commanderRosterFingerprint: ACCOUNT_PROFILE_COMMANDER_ROSTER_FINGERPRINT,
    profileId,
    career: { level: 1, experience: 0 },
    factionIdentity: null,
    commanderId: null,
    inventory: { items: {}, craftedMods: {} },
    commanders,
    cosmetics: { shipLivery: 'nightglass', illumination: 'expedition_blue', unlockedIds: [] },
    settings: { permanentDeath: false, reducedMotion: false, textScale: 1 }
  };
}

export function normalizeAccountProfile(source, profileId = source?.profileId || 'local_expedition', commanderCatalogContext = null) {
  const commanderCatalog = commanderCatalogForContext(commanderCatalogContext);
  const profile = createInitialAccountProfile(profileId, commanderCatalogContext);
  if (!source || typeof source !== 'object' || Array.isArray(source)) return profile;
  profile.profileId = typeof source.profileId === 'string' && source.profileId ? source.profileId : profile.profileId;
  profile.career = mergeForwardData(profile.career, isRecord(source.career) ? source.career : {});
  profile.career.level = integer(source.career?.level, 1, 1);
  profile.career.experience = integer(source.career?.experience, 0);
  profile.inventory.items = { ...(source.inventory?.items || {}) };
  profile.inventory.craftedMods = { ...(source.inventory?.craftedMods || {}) };

  const migratedRecords = migrateCommanderRecords(source.commanders, commanderCatalog);
  let factionIdentity = RESIDENT_FACTION_IDS.includes(source.factionIdentity) ? source.factionIdentity : null;
  const explicitCommanderId = resolveCommanderIdAtMigrationBoundaryV1(source.commanderId);
  if (!factionIdentity && explicitCommanderId && commanderCatalog[explicitCommanderId]) factionIdentity = commanderCatalog[explicitCommanderId].factionId;
  if (!factionIdentity && integer(source.schemaVersion, 0) < ACCOUNT_PROFILE_SCHEMA_VERSION && hasMeaningfulProfileProgress(source, migratedRecords, commanderCatalog)) {
    factionIdentity = inferLegacyFaction(source, migratedRecords, commanderCatalog);
  }
  profile.factionIdentity = factionIdentity;
  profile.commanderId = factionIdentity ? COMMANDER1_BY_CAMPAIGN_FACTION[factionIdentity] : null;

  for (const [id, commander] of Object.entries(profile.commanders)) {
    const incoming = migratedRecords[id];
    if (!incoming) continue;
    Object.assign(commander, deepClone(incoming));
    commander.unlocked = Boolean(incoming.unlocked);
    commander.level = integer(incoming.level, commander.level, 1);
    commander.experience = integer(incoming.experience ?? incoming.xp, 0);
    commander.scars = mergeForwardData([], Array.isArray(incoming.scars) ? incoming.scars.filter(value => typeof value === 'string') : []);
  }
  if (profile.commanderId) profile.commanders[profile.commanderId].unlocked = true;
  else for (const commander of Object.values(profile.commanders)) commander.unlocked = false;

  profile.cosmetics = mergeForwardData(profile.cosmetics, isRecord(source.cosmetics) ? source.cosmetics : {});
  profile.cosmetics.unlockedIds = mergeForwardData([], Array.isArray(source.cosmetics?.unlockedIds) ? source.cosmetics.unlockedIds : []);
  profile.settings = mergeForwardData(profile.settings, isRecord(source.settings) ? source.settings : {});
  profile.settings.permanentDeath = Boolean(profile.settings.permanentDeath);
  profile.settings.reducedMotion = Boolean(profile.settings.reducedMotion);
  profile.settings.textScale = Math.max(0.9, Math.min(1.4, Number(profile.settings.textScale) || 1));
  profile.schemaVersion = ACCOUNT_PROFILE_SCHEMA_VERSION;
  profile.commanderRosterFingerprint = ACCOUNT_PROFILE_COMMANDER_ROSTER_FINGERPRINT;
  return profile;
}

export function validateAccountProfile(profile, commanderCatalogContext = null) {
  const commanderCatalog = commanderCatalogForContext(commanderCatalogContext);
  const issues = [];
  if (!isRecord(profile)) return { ok: false, issues: [issue('ACCOUNT_PROFILE_NOT_OBJECT', 'Account profile must be an object.')] };
  if (profile.schemaVersion !== ACCOUNT_PROFILE_SCHEMA_VERSION) issues.push(issue('ACCOUNT_PROFILE_VERSION_INVALID', `Expected account profile schema ${ACCOUNT_PROFILE_SCHEMA_VERSION}.`, 'schemaVersion'));
  if (profile.commanderRosterFingerprint !== ACCOUNT_PROFILE_COMMANDER_ROSTER_FINGERPRINT) issues.push(issue('COMMANDER_ROSTER_FINGERPRINT_INVALID', 'Account profile is not bound to the canonical commander roster.', 'commanderRosterFingerprint'));
  if (profile.factionIdentity !== null && !RESIDENT_FACTION_IDS.includes(profile.factionIdentity)) issues.push(issue('ACCOUNT_FACTION_INVALID', 'Account faction identity must be Nova, Dominion, Syndicate, or unassigned.', 'factionIdentity'));
  const expectedCommanderId = profile.factionIdentity ? COMMANDER1_BY_CAMPAIGN_FACTION[profile.factionIdentity] : null;
  if (profile.commanderId !== expectedCommanderId) issues.push(issue('ACCOUNT_COMMANDER_INVALID', 'Account Commander 1 must match the commissioned faction.', 'commanderId'));
  if (profile.factionIdentity === null && Object.values(profile.commanders || {}).some(commander => commander?.unlocked)) issues.push(issue('ACCOUNT_HIDDEN_COMMANDER_PRECHOICE', 'An unassigned account cannot unlock a selectable commander.', 'commanders'));
  const ids = Object.keys(profile.commanders || {});
  const invalidIds = ids.filter(id => !commanderCatalog[id]);
  if (invalidIds.length) issues.push(issue('ACCOUNT_COMMANDER_ALIAS_OR_UNKNOWN', `Non-canonical commander records are forbidden: ${invalidIds.join(', ')}.`, 'commanders'));
  for (const id of Object.keys(commanderCatalog)) {
    const commander = profile.commanders?.[id];
    if (!isRecord(commander) || !Number.isInteger(commander.level) || commander.level < 1 || !Number.isInteger(commander.experience) || commander.experience < 0) issues.push(issue('ACCOUNT_COMMANDER_STATE_INVALID', `${id} has invalid progression state.`, `commanders.${id}`));
  }
  if (profile.commanderId && !profile.commanders?.[profile.commanderId]?.unlocked) issues.push(issue('ACCOUNT_COMMANDER_LOCKED', 'The account Commander 1 must be unlocked.', `commanders.${profile.commanderId}.unlocked`));
  return { ok: issues.length === 0, issues };
}

export function projectAccountProfile(campaignState, previousProfile = null, commanderCatalogContext = null) {
  const profile = normalizeAccountProfile(previousProfile, campaignState?.profileId, commanderCatalogContext);
  profile.profileId = campaignState?.profileId || profile.profileId;
  if (campaignState?.commissioning?.completed) {
    profile.factionIdentity = campaignState.commissioning.factionId;
    profile.commanderId = campaignState.commissioning.commanderId;
  }
  for (const [id, commander] of Object.entries(profile.commanders)) {
    const campaignCommander = campaignState?.personnel?.commanders?.[id];
    if (!campaignCommander) continue;
    const merged = mergeForwardData(commander, campaignCommander);
    Object.assign(commander, merged);
    commander.unlocked = Boolean(commander.unlocked || campaignCommander.unlocked);
    commander.level = Math.max(integer(commander.level, 1, 1), integer(campaignCommander.level, 1, 1));
    commander.experience = Math.max(integer(commander.experience, 0), integer(campaignCommander.experience, 0));
  }
  if (campaignState?.ship?.livery) profile.cosmetics.shipLivery = campaignState.ship.livery;
  if (campaignState?.ship?.illumination) profile.cosmetics.illumination = campaignState.ship.illumination;
  return normalizeAccountProfile(profile, profile.profileId, commanderCatalogContext);
}

export function applyAccountProfile(campaignState, sourceProfile, commanderCatalogContext = null) {
  const commanderCatalog = commanderCatalogForContext(commanderCatalogContext);
  const profile = normalizeAccountProfile(sourceProfile, campaignState?.profileId, commanderCatalogContext);
  const next = deepClone(campaignState);
  next.commanderRosterFingerprint = ACCOUNT_PROFILE_COMMANDER_ROSTER_FINGERPRINT;
  if (profile.factionIdentity && profile.commanderId) {
    next.commissioning = {
      factionId: profile.factionIdentity,
      commanderId: profile.commanderId,
      completed: true,
      completedRevision: next.commissioning?.completedRevision === null || next.commissioning?.completedRevision === undefined
        ? integer(next.revision, 0)
        : integer(next.commissioning.completedRevision, next.revision)
    };
    const faction = next.factions?.[profile.factionIdentity];
    if (faction) {
      faction.resident = true;
      faction.recruitmentComplete = true;
      if (faction.status === 'nonresident') faction.status = 'ready';
      faction.readiness = Math.max(85, integer(faction.readiness, 0));
      faction.loyalty = Math.max(50, integer(faction.loyalty, 40));
      faction.residentSinceRevision ??= next.commissioning.completedRevision;
    }
    for (const [specialistId, definition] of Object.entries(SPECIALIST_CATALOG)) {
      if (definition.factionId !== profile.factionIdentity) continue;
      const specialist = next.personnel?.specialists?.[specialistId];
      if (!specialist) continue;
      specialist.unlocked = true;
      if (specialist.status === 'locked') specialist.status = 'ready';
      specialist.readiness = Math.max(85, integer(specialist.readiness, 0));
    }
  }
  for (const [id, commander] of Object.entries(profile.commanders)) {
    const target = next.personnel?.commanders?.[id];
    if (!target || !commanderCatalog[id]) continue;
    const wasUnlocked = Boolean(target.unlocked);
    const merged = mergeForwardData(target, commander);
    Object.assign(target, merged);
    target.unlocked = wasUnlocked || Boolean(commander.unlocked && next.factions?.[commanderCatalog[id].factionId]?.resident);
    target.level = Math.max(integer(target.level, 1, 1), integer(commander.level, 1, 1));
    target.experience = Math.max(integer(target.experience, 0), integer(commander.experience, 0));
    if (target.unlocked && target.status === 'locked') target.status = target.injury ? 'recovering' : 'ready';
    if (!target.unlocked) target.status = 'locked';
  }
  next.ship.livery = profile.cosmetics.shipLivery || next.ship.livery;
  next.ship.illumination = profile.cosmetics.illumination || next.ship.illumination;
  return next;
}

export function serializeAccountProfile(profile, commanderCatalogContext = null) {
  const normalized = normalizeAccountProfile(profile, profile?.profileId, commanderCatalogContext);
  const validation = validateAccountProfile(normalized, commanderCatalogContext);
  if (!validation.ok) throw new TypeError(`Invalid account profile: ${validation.issues[0]?.message || 'unknown issue'}`);
  return JSON.stringify(deepFreeze(normalized));
}

export function deserializeAccountProfile(serialized, commanderCatalogContext = null) {
  return normalizeAccountProfile(JSON.parse(serialized), undefined, commanderCatalogContext);
}
