import { COMMANDER_CATALOG } from './catalog.js';
import { deepClone, deepFreeze } from './deterministic.js';

export const ACCOUNT_PROFILE_SCHEMA_VERSION = 1;
export const ACCOUNT_PROFILE_STORAGE_KEY = 'massfront.profile.shared.v1';

function integer(value, fallback = 0, minimum = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(minimum, Math.floor(parsed)) : fallback;
}

export function createInitialAccountProfile(profileId = 'local_expedition') {
  const commanders = {};
  for (const [id, definition] of Object.entries(COMMANDER_CATALOG)) {
    commanders[id] = {
      unlocked: definition.factionId === 'nova',
      level: definition.initialLevel,
      experience: 0,
      scars: []
    };
  }
  return {
    schemaVersion: ACCOUNT_PROFILE_SCHEMA_VERSION,
    profileId,
    career: { level: 1, experience: 0 },
    factionIdentity: 'uga',
    inventory: { items: {}, craftedMods: {} },
    commanders,
    cosmetics: { shipLivery: 'nightglass', illumination: 'expedition_blue', unlockedIds: [] },
    settings: { permanentDeath: false, reducedMotion: false, textScale: 1 }
  };
}

export function normalizeAccountProfile(source, profileId = source?.profileId || 'local_expedition') {
  const profile = createInitialAccountProfile(profileId);
  if (!source || typeof source !== 'object') return profile;
  profile.profileId = typeof source.profileId === 'string' && source.profileId ? source.profileId : profile.profileId;
  profile.career.level = integer(source.career?.level, 1, 1);
  profile.career.experience = integer(source.career?.experience, 0);
  profile.factionIdentity = typeof source.factionIdentity === 'string' ? source.factionIdentity : profile.factionIdentity;
  profile.inventory.items = { ...(source.inventory?.items || {}) };
  profile.inventory.craftedMods = { ...(source.inventory?.craftedMods || {}) };
  for (const [id, commander] of Object.entries(profile.commanders)) {
    const incoming = source.commanders?.[id];
    if (!incoming) continue;
    commander.unlocked = Boolean(incoming.unlocked);
    commander.level = integer(incoming.level, commander.level, 1);
    commander.experience = integer(incoming.experience, 0);
    commander.scars = [...new Set(Array.isArray(incoming.scars) ? incoming.scars.filter(value => typeof value === 'string') : [])];
  }
  profile.cosmetics = { ...profile.cosmetics, ...(source.cosmetics || {}) };
  profile.cosmetics.unlockedIds = [...new Set(Array.isArray(source.cosmetics?.unlockedIds) ? source.cosmetics.unlockedIds : [])];
  profile.settings = { ...profile.settings, ...(source.settings || {}) };
  profile.settings.permanentDeath = Boolean(profile.settings.permanentDeath);
  profile.settings.reducedMotion = Boolean(profile.settings.reducedMotion);
  profile.settings.textScale = Math.max(0.9, Math.min(1.4, Number(profile.settings.textScale) || 1));
  return profile;
}

export function projectAccountProfile(campaignState, previousProfile = null) {
  const profile = normalizeAccountProfile(previousProfile, campaignState?.profileId);
  profile.profileId = campaignState?.profileId || profile.profileId;
  for (const [id, commander] of Object.entries(profile.commanders)) {
    const campaignCommander = campaignState?.personnel?.commanders?.[id];
    if (!campaignCommander) continue;
    commander.unlocked ||= Boolean(campaignCommander.unlocked);
    commander.level = Math.max(commander.level, integer(campaignCommander.level, commander.level, 1));
    commander.experience = Math.max(commander.experience, integer(campaignCommander.experience, 0));
  }
  if (campaignState?.ship?.livery) profile.cosmetics.shipLivery = campaignState.ship.livery;
  if (campaignState?.ship?.illumination) profile.cosmetics.illumination = campaignState.ship.illumination;
  return profile;
}

export function applyAccountProfile(campaignState, sourceProfile) {
  const profile = normalizeAccountProfile(sourceProfile, campaignState?.profileId);
  const next = deepClone(campaignState);
  for (const [id, commander] of Object.entries(profile.commanders)) {
    const target = next.personnel?.commanders?.[id];
    if (!target) continue;
    target.unlocked ||= commander.unlocked;
    target.level = Math.max(target.level, commander.level);
    target.experience = Math.max(target.experience, commander.experience);
    if (target.unlocked && target.status === 'locked') target.status = 'ready';
  }
  next.ship.livery = profile.cosmetics.shipLivery || next.ship.livery;
  next.ship.illumination = profile.cosmetics.illumination || next.ship.illumination;
  return next;
}

export function serializeAccountProfile(profile) {
  return JSON.stringify(deepFreeze(normalizeAccountProfile(profile)));
}

export function deserializeAccountProfile(serialized) {
  return normalizeAccountProfile(JSON.parse(serialized));
}
