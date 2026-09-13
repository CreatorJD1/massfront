import {
  COMMANDER1_BY_CAMPAIGN_FACTION,
  COMMANDER_LEGACY_ALIASES,
  COMMANDER_ROSTER_AUTHORITY,
  COMMANDER_ROSTER_IDS,
  COMMANDER_SOURCE_ART_BY_ID,
  normalizeCommanderRosterSnapshotV1
} from './commander_roster_contract.js';
import { deepClone, deepFreeze, stableStringify } from './deterministic.js';
import { issue } from './errors.js';

export const COMMANDER_CATALOG_CONTEXT_VERSION = 1;
export const PRODUCTION_COMMANDER_CATALOG_CONTEXT_KIND = 'ProductionCommanderCatalogContextV1';
export const SANDBOX_COMMANDER_CATALOG_CONTEXT_KIND = 'SandboxCommanderCatalogContextV1';

function canonicalCatalogEntry(authority) {
  return {
    id: authority.id,
    sourceFactionId: authority.sourceFactionId,
    factionId: authority.campaignFactionId,
    name: authority.name,
    rank: authority.rank,
    shortName: authority.shortName,
    callsign: authority.callsign,
    role: authority.role,
    trait: authority.trait,
    initialLevel: 1,
    commander1: COMMANDER1_BY_CAMPAIGN_FACTION[authority.campaignFactionId] === authority.id,
    sourceArt: deepClone(COMMANDER_SOURCE_ART_BY_ID[authority.id] || null)
  };
}

/* Synchronous compatibility projection for domain code that has not yet been
   converted to an injected catalog context. It is the exact nine-row contract
   projection, never the old three-row sandbox fixture. Production host paths
   should use createProductionCommanderCatalogContextV1() so the live base
   snapshot and its fingerprint remain the sole runtime input. */
export const CANONICAL_COMMANDER_CATALOG_V1 = deepFreeze(Object.fromEntries(
  COMMANDER_ROSTER_AUTHORITY.map(authority => [authority.id, canonicalCatalogEntry(authority)])
));

/* The three pre-integration personas exist only to keep the standalone local
   sandbox deterministic while save migration is exercised. Their IDs are
   legacy aliases, not selectable production commanders, and production
   context validation explicitly rejects this fixture. */
export const SANDBOX_ONLY_LEGACY_COMMANDER_CATALOG_FIXTURE_V1 = deepFreeze({
  nova_rhea_voss: { id: 'nova_rhea_voss', factionId: 'nova', name: 'Commander Rhea Voss', trait: 'measured_advance', initialLevel: 1, fixtureOnly: true },
  dominion_toren_vale: { id: 'dominion_toren_vale', factionId: 'dominion', name: 'Commander Toren Vale', trait: 'hold_the_line', initialLevel: 1, fixtureOnly: true },
  syndicate_mara_quill: { id: 'syndicate_mara_quill', factionId: 'syndicate', name: 'Commander Mara Quill', trait: 'ghost_logistics', initialLevel: 1, fixtureOnly: true }
});

function snapshotCatalogEntry(entry, commander1ByCampaignFaction) {
  return {
    id: entry.id,
    sourceFactionId: entry.sourceFactionId,
    factionId: entry.campaignFactionId,
    name: entry.name,
    rank: entry.rank,
    shortName: entry.shortName,
    callsign: entry.callsign,
    role: entry.role,
    trait: entry.passive.perk,
    initialLevel: 1,
    commander1: commander1ByCampaignFaction[entry.campaignFactionId] === entry.id,
    sourceArt: deepClone(entry.sourceArt)
  };
}

export function createCommanderCatalogFromSnapshotV1(snapshot) {
  const normalized = normalizeCommanderRosterSnapshotV1(snapshot);
  const catalog = Object.fromEntries(normalized.commanders.map(entry => [
    entry.id,
    snapshotCatalogEntry(entry, normalized.commander1ByCampaignFaction)
  ]));
  if (stableStringify(catalog) !== stableStringify(CANONICAL_COMMANDER_CATALOG_V1)) {
    throw new TypeError('Commander roster projection does not match the canonical nine-row catalog.');
  }
  return deepFreeze(catalog);
}

export function createProductionCommanderCatalogContextV1(snapshot) {
  const normalized = normalizeCommanderRosterSnapshotV1(snapshot);
  return deepFreeze({
    schemaVersion: COMMANDER_CATALOG_CONTEXT_VERSION,
    kind: PRODUCTION_COMMANDER_CATALOG_CONTEXT_KIND,
    productionIntegrated: true,
    fixtureOnly: false,
    snapshotFingerprint: normalized.fingerprint,
    commanderIds: deepClone(COMMANDER_ROSTER_IDS),
    commander1ByCampaignFaction: deepClone(normalized.commander1ByCampaignFaction),
    migrationAliases: deepClone(COMMANDER_LEGACY_ALIASES),
    catalog: createCommanderCatalogFromSnapshotV1(normalized)
  });
}

export function createSandboxCommanderCatalogContextV1() {
  return deepFreeze({
    schemaVersion: COMMANDER_CATALOG_CONTEXT_VERSION,
    kind: SANDBOX_COMMANDER_CATALOG_CONTEXT_KIND,
    productionIntegrated: false,
    fixtureOnly: true,
    snapshotFingerprint: null,
    commanderIds: Object.keys(SANDBOX_ONLY_LEGACY_COMMANDER_CATALOG_FIXTURE_V1),
    commander1ByCampaignFaction: {},
    migrationAliases: deepClone(COMMANDER_LEGACY_ALIASES),
    catalog: SANDBOX_ONLY_LEGACY_COMMANDER_CATALOG_FIXTURE_V1
  });
}

export function createCommanderCatalogContextV1({ mode = 'production', snapshot } = {}) {
  if (mode === 'production') return createProductionCommanderCatalogContextV1(snapshot);
  if (mode === 'sandbox') return createSandboxCommanderCatalogContextV1();
  throw new TypeError(`Unknown commander catalog context mode: ${mode}`);
}

export function validateCommanderCatalogContextV1(context, { requireProduction = false } = {}) {
  const issues = [];
  if (!context || typeof context !== 'object' || Array.isArray(context)) {
    return { ok: false, issues: [issue('COMMANDER_CATALOG_CONTEXT_INVALID', 'Commander catalog context must be an object.')] };
  }
  const production = context.kind === PRODUCTION_COMMANDER_CATALOG_CONTEXT_KIND && context.productionIntegrated === true && context.fixtureOnly === false;
  const sandbox = context.kind === SANDBOX_COMMANDER_CATALOG_CONTEXT_KIND && context.productionIntegrated === false && context.fixtureOnly === true;
  if (!production && !sandbox) issues.push(issue('COMMANDER_CATALOG_CONTEXT_KIND_INVALID', 'Commander catalog context identity is invalid.', 'kind'));
  if (requireProduction && !production) issues.push(issue('COMMANDER_CATALOG_PRODUCTION_REQUIRED', 'Production paths reject sandbox commander fixtures.', 'kind'));
  if (production) {
    if (!context.snapshotFingerprint || stableStringify(context.catalog) !== stableStringify(CANONICAL_COMMANDER_CATALOG_V1)) issues.push(issue('COMMANDER_CATALOG_PRODUCTION_INVALID', 'Production commander catalog must be the canonical snapshot projection.', 'catalog'));
    if (Object.keys(context.catalog || {}).some(id => Object.hasOwn(COMMANDER_LEGACY_ALIASES, id))) issues.push(issue('COMMANDER_CATALOG_ALIAS_LEAK', 'Legacy aliases cannot be catalog entries.', 'catalog'));
  }
  if (sandbox && context.catalog !== SANDBOX_ONLY_LEGACY_COMMANDER_CATALOG_FIXTURE_V1) issues.push(issue('COMMANDER_CATALOG_SANDBOX_INVALID', 'Sandbox context must use the isolated legacy fixture.', 'catalog'));
  return { ok: issues.length === 0, issues };
}

