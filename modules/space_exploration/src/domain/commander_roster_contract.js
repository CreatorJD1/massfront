import { deepClone, deepFreeze, hash32, stableStringify } from './deterministic.js';
import { issue } from './errors.js';

export const COMMANDER_ROSTER_SNAPSHOT_VERSION = 1;
export const COMMANDER_ROSTER_SNAPSHOT_KIND = 'CommanderRosterSnapshotV1';
export const COMMANDER_ROSTER_EXPECTED_COUNT = 9;

export const COMMANDER_CAMPAIGN_FACTION_BY_SOURCE = deepFreeze({
  nova: 'nova',
  legion: 'dominion',
  syndicate: 'syndicate'
});

export const COMMANDER1_BY_CAMPAIGN_FACTION = deepFreeze({
  nova: 'nova_kai',
  dominion: 'legion_vex',
  syndicate: 'syndicate_renn'
});

export const COMMANDER_LEGACY_ALIASES = deepFreeze({
  nova_rhea_voss: 'nova_kai',
  dominion_toren_vale: 'legion_vex',
  syndicate_mara_quill: 'syndicate_renn'
});

export const COMMANDER_SOURCE_ART_BY_ID = deepFreeze({
  syndicate_renn: {
    assetId: 'syndicate-broker-lys-renn-v1',
    assetType: 'character-source',
    status: 'SOURCE_ACCEPTED_RUNTIME_UNREGISTERED',
    runtimeReady: false,
    runtimeRegistered: false,
    canonicalPath: 'modules/space_exploration/assets/source/blender/characters/syndicate-broker-lys-renn-v1',
    manifestPath: 'modules/space_exploration/assets/source/blender/characters/syndicate-broker-lys-renn-v1/syndicate-broker-lys-renn-v1.asset-manifest.json'
  }
});

export const COMMANDER_ROSTER_AUTHORITY = deepFreeze([
  { id: 'nova_kai', sourceFactionId: 'nova', campaignFactionId: 'nova', name: 'Captain Elara Kai', rank: 'Captain', shortName: 'Kai', callsign: 'LANTERN', role: 'VANGUARD', trait: 'kai' },
  { id: 'nova_holt', sourceFactionId: 'nova', campaignFactionId: 'nova', name: 'Major Rowan Holt', rank: 'Major', shortName: 'Holt', callsign: 'ANVIL', role: 'ENGINEER', trait: 'holt' },
  { id: 'nova_vale', sourceFactionId: 'nova', campaignFactionId: 'nova', name: 'Cmdr. Sera Vale', rank: 'Commander', shortName: 'Vale', callsign: 'LONGSIGHT', role: 'TACTICIAN', trait: 'vale' },
  { id: 'legion_vex', sourceFactionId: 'legion', campaignFactionId: 'dominion', name: 'Lord Darion Vex', rank: 'Lord', shortName: 'Vex', callsign: 'ASCENDANT', role: 'JUGGERNAUT', trait: 'vex' },
  { id: 'legion_korr', sourceFactionId: 'legion', campaignFactionId: 'dominion', name: 'Marshal Rhea Korr', rank: 'Marshal', shortName: 'Korr', callsign: 'CADENCE', role: 'WARMASTER', trait: 'korr' },
  { id: 'legion_dravik', sourceFactionId: 'legion', campaignFactionId: 'dominion', name: 'Prefect Amon Dravik', rank: 'Prefect', shortName: 'Dravik', callsign: 'REDOUBT', role: 'FORTIFIER', trait: 'dravik' },
  { id: 'syndicate_renn', sourceFactionId: 'syndicate', campaignFactionId: 'syndicate', name: 'Broker Lys Renn', rank: 'Broker', shortName: 'Renn', callsign: 'LEDGER', role: 'BROKER', trait: 'renn' },
  { id: 'syndicate_nyx', sourceFactionId: 'syndicate', campaignFactionId: 'syndicate', name: 'Operative Nyx Calder', rank: 'Operative', shortName: 'Calder', callsign: 'GHOST', role: 'INFILTRATOR', trait: 'nyx' },
  { id: 'syndicate_voss', sourceFactionId: 'syndicate', campaignFactionId: 'syndicate', name: 'Director Oren Voss', rank: 'Director', shortName: 'Voss', callsign: 'CORE', role: 'CONTROLLER', trait: 'voss' }
]);

export const COMMANDER_ROSTER_IDS = deepFreeze(COMMANDER_ROSTER_AUTHORITY.map(entry => entry.id));

const TOP_LEVEL_KEYS = deepFreeze([
  'schemaVersion', 'kind', 'source', 'sourceVersion', 'commanderCount',
  'commander1ByCampaignFaction', 'commanders', 'fingerprint'
]);
const COMMANDER_KEYS = deepFreeze([
  'id', 'sourceFactionId', 'campaignFactionId', 'name', 'rank', 'shortName',
  'callsign', 'role', 'lore', 'chassis', 'passive', 'baseline', 'signature',
  'weapons', 'portrait', 'voice', 'sourceArt'
]);
const NESTED_KEYS = deepFreeze({
  lore: ['key', 'epithet', 'service', 'bio'],
  chassis: ['heroType', 'unit', 'sprite'],
  passive: ['label', 'perk'],
  baseline: ['index', 'label'],
  signature: ['id', 'label', 'em'],
  weapons: ['primary', 'secondary'],
  portrait: ['resolver', 'fallback', 'alt'],
  voice: ['bank', 'channel', 'slotPrefix'],
  sourceArt: ['assetId', 'assetType', 'status', 'runtimeReady', 'runtimeRegistered', 'canonicalPath', 'manifestPath']
});

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function sameJson(left, right) {
  try { return stableStringify(left) === stableStringify(right); } catch (_) { return false; }
}

function exactKeys(value, expected, path, issues) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    issues.push(issue('COMMANDER_ROSTER_SCHEMA_INVALID', `${path || 'snapshot'} must be an object.`, path));
    return false;
  }
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (!sameJson(actual, wanted)) {
    issues.push(issue('COMMANDER_ROSTER_SCHEMA_INVALID', `${path || 'snapshot'} has unexpected or missing fields.`, path));
    return false;
  }
  return true;
}

export function resolveCommanderIdAtMigrationBoundaryV1(value) {
  const id = text(value);
  if (COMMANDER_ROSTER_IDS.includes(id)) return id;
  return COMMANDER_LEGACY_ALIASES[id] || null;
}

export function isSelectableCommanderIdV1(value) {
  return COMMANDER_ROSTER_IDS.includes(text(value));
}

function fingerprintPayload(snapshot) {
  const payload = deepClone(snapshot);
  if (payload && typeof payload === 'object') delete payload.fingerprint;
  return payload;
}

export function commanderRosterSnapshotFingerprintV1(snapshot) {
  return `fnv1a32:${hash32(fingerprintPayload(snapshot))}`;
}

function jsonCompatibilityIssue(snapshot) {
  try {
    const stable = stableStringify(snapshot);
    const roundTrip = stableStringify(JSON.parse(stable));
    return stable === roundTrip ? null : issue(
      'COMMANDER_ROSTER_NOT_STABLE_JSON',
      'Commander roster snapshot changes during a JSON round trip.'
    );
  } catch (error) {
    return issue(
      'COMMANDER_ROSTER_NOT_JSON_SAFE',
      `Commander roster snapshot must contain only deterministic JSON data: ${error.message}`
    );
  }
}

export function validateCommanderRosterSnapshotV1(snapshot) {
  const issues = [];
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    return { ok: false, issues: [issue('COMMANDER_ROSTER_NOT_OBJECT', 'Commander roster snapshot must be an object.')] };
  }

  const compatibilityIssue = jsonCompatibilityIssue(snapshot);
  if (compatibilityIssue) issues.push(compatibilityIssue);
  exactKeys(snapshot, TOP_LEVEL_KEYS, '', issues);

  if (snapshot.schemaVersion !== COMMANDER_ROSTER_SNAPSHOT_VERSION || snapshot.kind !== COMMANDER_ROSTER_SNAPSHOT_KIND) {
    issues.push(issue('COMMANDER_ROSTER_VERSION_INVALID', 'Commander roster snapshot version is unsupported.', 'schemaVersion'));
  }
  if (snapshot.source !== 'massfront-base') {
    issues.push(issue('COMMANDER_ROSTER_SOURCE_INVALID', 'Commander roster snapshot must identify the base MASSFRONT runtime as its source.', 'source'));
  }
  if (!Number.isInteger(snapshot.sourceVersion) || snapshot.sourceVersion < 1) {
    issues.push(issue('COMMANDER_ROSTER_SOURCE_VERSION_INVALID', 'Commander roster source version must be a positive integer.', 'sourceVersion'));
  }
  if (!sameJson(snapshot.commander1ByCampaignFaction, COMMANDER1_BY_CAMPAIGN_FACTION)) {
    issues.push(issue('COMMANDER_ROSTER_COMMANDER1_INVALID', 'Commander 1 assignments must match the canonical faction starters.', 'commander1ByCampaignFaction'));
  }

  const commanders = Array.isArray(snapshot.commanders) ? snapshot.commanders : [];
  if (!Array.isArray(snapshot.commanders) || commanders.length !== COMMANDER_ROSTER_EXPECTED_COUNT || snapshot.commanderCount !== commanders.length) {
    issues.push(issue(
      'COMMANDER_ROSTER_COUNT_INVALID',
      `CommanderRosterSnapshotV1 requires exactly ${COMMANDER_ROSTER_EXPECTED_COUNT} playable commanders.`,
      'commanders'
    ));
  }

  const ids = new Set();
  commanders.forEach((commander, index) => {
    const path = `commanders.${index}`;
    if (!commander || typeof commander !== 'object' || Array.isArray(commander)) {
      issues.push(issue('COMMANDER_ROSTER_ENTRY_INVALID', 'Commander roster entries must be objects.', path));
      return;
    }
    exactKeys(commander, COMMANDER_KEYS, path, issues);
    for (const field of ['id', 'sourceFactionId', 'campaignFactionId', 'name', 'rank', 'shortName', 'callsign', 'role']) {
      if (!text(commander[field])) issues.push(issue('COMMANDER_ROSTER_FIELD_MISSING', `Commander roster entry requires ${field}.`, `${path}.${field}`));
    }
    const id = text(commander.id);
    if (id && ids.has(id)) issues.push(issue('COMMANDER_ROSTER_ID_DUPLICATE', `Commander ID ${id} appears more than once.`, `${path}.id`));
    if (id) ids.add(id);

    const authority = COMMANDER_ROSTER_AUTHORITY[index];
    if (!authority || id !== authority.id) {
      issues.push(issue('COMMANDER_ROSTER_ORDER_INVALID', `Commander slot ${index} must be ${authority?.id || 'absent'}.`, `${path}.id`));
    } else {
      for (const field of ['sourceFactionId', 'campaignFactionId', 'name', 'rank', 'shortName', 'callsign', 'role']) {
        if (commander[field] !== authority[field]) issues.push(issue('COMMANDER_ROSTER_AUTHORITY_MISMATCH', `${id}.${field} does not match the canonical base roster.`, `${path}.${field}`));
      }
      if (commander.passive?.perk !== authority.trait) issues.push(issue('COMMANDER_ROSTER_AUTHORITY_MISMATCH', `${id}.passive.perk does not match the canonical commander trait.`, `${path}.passive.perk`));
    }

    const sourceFactionId = text(commander.sourceFactionId);
    const expectedCampaignFactionId = COMMANDER_CAMPAIGN_FACTION_BY_SOURCE[sourceFactionId];
    if (!expectedCampaignFactionId) {
      issues.push(issue('COMMANDER_ROSTER_FACTION_UNPLAYABLE', 'Brood and unknown factions cannot appear in the playable commander roster.', `${path}.sourceFactionId`));
    } else if (text(commander.campaignFactionId) !== expectedCampaignFactionId) {
      issues.push(issue(
        'COMMANDER_ROSTER_FACTION_MAPPING_INVALID',
        `${sourceFactionId} commanders must map to Galactic faction ${expectedCampaignFactionId}.`,
        `${path}.campaignFactionId`
      ));
    }
    if (commander.aiOnly === true || /^(brood|horde)(_|$)/i.test(id) || /^(brood|horde)$/i.test(sourceFactionId)) {
      issues.push(issue('COMMANDER_ROSTER_BROOD_FORBIDDEN', 'Brood leaders are not playable commanders.', path));
    }

    for (const [field, keys] of Object.entries(NESTED_KEYS)) {
      if (field === 'sourceArt' && commander[field] === null) continue;
      exactKeys(commander[field], keys, `${path}.${field}`, issues);
    }
    for (const field of ['key', 'epithet', 'service', 'bio']) if (!text(commander.lore?.[field])) issues.push(issue('COMMANDER_ROSTER_FIELD_MISSING', `Commander lore requires ${field}.`, `${path}.lore.${field}`));
    if (!Number.isInteger(commander.chassis?.heroType) || commander.chassis.heroType < 0) issues.push(issue('COMMANDER_ROSTER_FIELD_INVALID', 'Commander chassis heroType must be a non-negative integer.', `${path}.chassis.heroType`));
    for (const field of ['unit', 'sprite']) if (!text(commander.chassis?.[field])) issues.push(issue('COMMANDER_ROSTER_FIELD_MISSING', `Commander chassis requires ${field}.`, `${path}.chassis.${field}`));
    if (!text(commander.passive?.label) || !text(commander.passive?.perk)) issues.push(issue('COMMANDER_ROSTER_FIELD_MISSING', 'Commander passive labels and trait keys are required.', `${path}.passive`));
    if (!Number.isInteger(commander.baseline?.index) || commander.baseline.index < 0 || !text(commander.baseline?.label)) issues.push(issue('COMMANDER_ROSTER_FIELD_INVALID', 'Commander baseline requires a non-negative index and label.', `${path}.baseline`));
    for (const field of ['id', 'label', 'em']) if (!text(commander.signature?.[field])) issues.push(issue('COMMANDER_ROSTER_FIELD_MISSING', `Commander signature requires ${field}.`, `${path}.signature.${field}`));
    for (const field of ['primary', 'secondary']) if (!text(commander.weapons?.[field])) issues.push(issue('COMMANDER_ROSTER_FIELD_MISSING', `Commander weapons require ${field}.`, `${path}.weapons.${field}`));
    if (commander.portrait?.resolver !== 'commanderPortraitSrc' || !text(commander.portrait?.fallback) || !text(commander.portrait?.alt) || /^data:/i.test(commander.portrait?.fallback || '')) issues.push(issue('COMMANDER_ROSTER_PORTRAIT_INVALID', 'Commander portrait metadata must use the base resolver and a non-embedded fallback.', `${path}.portrait`));
    if (commander.voice?.bank !== `cmdr_${id}` || commander.voice?.channel !== 'cmdr' || commander.voice?.slotPrefix !== `vo_cmdr_${id}_`) issues.push(issue('COMMANDER_ROSTER_VOICE_INVALID', 'Commander voice metadata must use its isolated commander bank.', `${path}.voice`));
    const expectedSourceArt = COMMANDER_SOURCE_ART_BY_ID[id] || null;
    if (!sameJson(commander.sourceArt, expectedSourceArt)) issues.push(issue('COMMANDER_ROSTER_SOURCE_ART_INVALID', 'Commander source-art metadata does not match its non-runtime authority binding.', `${path}.sourceArt`));
  });

  let expectedFingerprint = '';
  try {
    expectedFingerprint = commanderRosterSnapshotFingerprintV1(snapshot);
  } catch (_) {}
  if (!text(snapshot.fingerprint) || !expectedFingerprint || snapshot.fingerprint !== expectedFingerprint) {
    issues.push(issue('COMMANDER_ROSTER_FINGERPRINT_INVALID', 'Commander roster fingerprint does not match its deterministic payload.', 'fingerprint'));
  }
  return { ok: issues.length === 0, issues };
}

export function normalizeCommanderRosterSnapshotV1(snapshot) {
  const validation = validateCommanderRosterSnapshotV1(snapshot);
  if (!validation.ok) {
    throw new TypeError(`Invalid CommanderRosterSnapshotV1: ${validation.issues[0]?.message || 'unknown issue'}`);
  }
  return deepFreeze(deepClone(snapshot));
}
