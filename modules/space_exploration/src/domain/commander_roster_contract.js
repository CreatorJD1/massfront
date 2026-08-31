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

const REQUIRED_TEXT_FIELDS = deepFreeze([
  'id',
  'sourceFactionId',
  'campaignFactionId',
  'name',
  'rank',
  'shortName',
  'callsign',
  'role'
]);

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
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

  if (snapshot.schemaVersion !== COMMANDER_ROSTER_SNAPSHOT_VERSION || snapshot.kind !== COMMANDER_ROSTER_SNAPSHOT_KIND) {
    issues.push(issue('COMMANDER_ROSTER_VERSION_INVALID', 'Commander roster snapshot version is unsupported.', 'schemaVersion'));
  }
  if (snapshot.source !== 'massfront-base') {
    issues.push(issue('COMMANDER_ROSTER_SOURCE_INVALID', 'Commander roster snapshot must identify the base MASSFRONT runtime as its source.', 'source'));
  }
  if (!Number.isInteger(snapshot.sourceVersion) || snapshot.sourceVersion < 1) {
    issues.push(issue('COMMANDER_ROSTER_SOURCE_VERSION_INVALID', 'Commander roster source version must be a positive integer.', 'sourceVersion'));
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
    for (const field of REQUIRED_TEXT_FIELDS) {
      if (!text(commander[field])) issues.push(issue('COMMANDER_ROSTER_FIELD_MISSING', `Commander roster entry requires ${field}.`, `${path}.${field}`));
    }
    const id = text(commander.id);
    if (id && ids.has(id)) issues.push(issue('COMMANDER_ROSTER_ID_DUPLICATE', `Commander ID ${id} appears more than once.`, `${path}.id`));
    if (id) ids.add(id);

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
